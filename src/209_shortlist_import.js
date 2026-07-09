// ===============================================================================
// 209_shortlist_import.js
// CDE Shortlist Assessment import -- parser, group staging, analyser, UI
// ===============================================================================

// ---------------------------------------------------------------------------
// Colour extraction -- checks fill first, then font colour
// ---------------------------------------------------------------------------

// Approximate hex values for standard Office theme colour indices
const THEME_COLOUR_MAP = {
  4: '4472C4',
  5: 'ED7D31',
  6: 'A9D18E',
  7: 'FFC000',
  8: '5B9BD5',
  9: '70AD47',
};

function colourFromObj(colorObj) {
  if (!colorObj) return null;
  if (colorObj.rgb) {
    var hex = colorObj.rgb.toUpperCase();
    if (hex.length === 8) hex = hex.slice(2);        // strip alpha
    if (hex === 'FFFFFF' || hex === '000000') return null;
    return hex;
  }
  if (colorObj.theme !== undefined && colorObj.theme !== null) {
    if (colorObj.theme === 0 || colorObj.theme === 1) return null; // background / default text
    return THEME_COLOUR_MAP[colorObj.theme] || '808080';
  }
  return null;
}

function extractColourHex(ws, addr) {
  const cell = ws[addr];
  if (!cell || !cell.s) return null;
  // 1. Fill colour takes precedence (e.g. CDE Shortlist Assessment template)
  const fillHex = colourFromObj(cell.s.fgColor);
  if (fillHex) return fillHex;
  // 2. Font colour fallback (e.g. POAS-style workbooks)
  const fontColor = cell.s.font && cell.s.font.color;
  return colourFromObj(fontColor) || null;
}

// ---------------------------------------------------------------------------
// parseShortlistWorkbook(workbook) -> { items, encounteredColours, fallbackMode }
// ---------------------------------------------------------------------------
function parseShortlistWorkbook(workbook) {
  const skipNames = ['example', 'instructions', 'version control'];
  const sheetName = workbook.SheetNames.find(function(n) {
    return !skipNames.some(function(s) { return n.toLowerCase().indexOf(s) >= 0; });
  });
  if (!sheetName) return null;

  const ws   = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!rows.length) return null;

  // Detect CDS columns: scan row 0 from col 1, stop at first empty header
  const cdsColIndices = [];
  let col = 1;
  while (col < (rows[0] || []).length) {
    const header = rows[0][col];
    if (!header || String(header).trim() === '') break;
    cdsColIndices.push(col);
    col++;
  }
  if (!cdsColIndices.length) return null;

  // Auto-detect first data row: skip metadata rows that have a dark themed
  // background fill (Office theme index 0) -- e.g. owner/reporter header rows
  let dataStartRow = 1;
  while (dataStartRow < rows.length) {
    const isMetadata = cdsColIndices.some(function(colIdx) {
      const addr = XLSX.utils.encode_cell({ r: dataStartRow, c: colIdx });
      const cell = ws[addr];
      return cell && cell.s && cell.s.fgColor && cell.s.fgColor.theme === 0;
    });
    if (!isMetadata) break;
    dataStartRow++;
  }

  const items = [];
  const encounteredColours = [];
  const seenColours = {};

  cdsColIndices.forEach(function(colIdx) {
    const cdsName = String(rows[0][colIdx]).trim();
    const fields  = [];

    for (let rowIdx = dataStartRow; rowIdx < rows.length; rowIdx++) {
      const cellVal = rows[rowIdx][colIdx];
      if (!cellVal || String(cellVal).trim() === '') continue;

      const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
      const hex  = extractColourHex(ws, addr);

      if (hex && !seenColours[hex]) {
        seenColours[hex] = true;
        encounteredColours.push(hex);
      }

      fields.push({ fieldName: String(cellVal).trim(), colourHex: hex });
    }

    if (fields.length > 0) items.push({ cdsName: cdsName, fields: fields });
  });

  return {
    items:              items,
    encounteredColours: encounteredColours,
    fallbackMode:       encounteredColours.length === 0,
  };
}

// ---------------------------------------------------------------------------
// stageShortlistGroups -> { colourMap, newGroups }
// Always creates new group records; no reuse of existing groups.
// Groups are named Group 1, Group 2... in encounter order.
// ---------------------------------------------------------------------------
function stageShortlistGroups(encounteredColours, directorateId, existingGroups) {
  const maxId = (existingGroups || []).reduce(function(m, g) {
    return Math.max(m, g.shortlist_group_id || 0);
  }, 0);

  const colourMap = {};
  const newGroups = [];

  encounteredColours.forEach(function(colour, idx) {
    const id = maxId + idx + 1;
    newGroups.push({
      shortlist_group_id:    id,
      directorate_id:        directorateId,
      shortlist_group_label: 'Group ' + (idx + 1),
      shortlist_colour_hex:  colour,
      retiring_timestamp:    null,
    });
    colourMap[colour] = id;
  });

  return { colourMap: colourMap, newGroups: newGroups };
}

// ---------------------------------------------------------------------------
// resolveDirectorate -> { mode, directorateId, directorateName, options }
// ---------------------------------------------------------------------------
function resolveDirectorate(stewardIdentity, isMaster, data) {
  const allDirs = (data.directorate || [])
    .filter(function(d) { return !d.retiring_timestamp; })
    .map(function(d) { return { directorate_id: d.directorate_id, directorate_name: d.directorate_name }; });

  if (isMaster || !stewardIdentity) {
    return { mode: 'pick', directorateId: null, directorateName: null, options: allDirs };
  }

  const myStew = (data.stewardship || []).filter(function(s) {
    return s.data_steward_id === stewardIdentity.id &&
           !s.retiring_timestamp &&
           s.critical_data_set_id !== 0;
  });

  const seen  = {};
  const dirIds = [];
  myStew.forEach(function(s) {
    const cds = (data.critical_data_set || []).find(function(c) {
      return c.critical_data_set_id === s.critical_data_set_id;
    });
    if (cds && cds.directorate_id && !seen[cds.directorate_id]) {
      seen[cds.directorate_id] = true;
      dirIds.push(cds.directorate_id);
    }
  });

  if (dirIds.length === 1) {
    const dir = (data.directorate || []).find(function(d) { return d.directorate_id === dirIds[0]; });
    return {
      mode:            'auto',
      directorateId:   dirIds[0],
      directorateName: dir ? dir.directorate_name : String(dirIds[0]),
      options:         allDirs,
    };
  }

  // Multiple or zero: picker, pre-select most common
  const freq = {};
  dirIds.forEach(function(id) { freq[id] = (freq[id] || 0) + 1; });
  const topId = dirIds.length
    ? dirIds.slice().sort(function(a, b) { return (freq[b] || 0) - (freq[a] || 0); })[0]
    : null;

  return { mode: 'pick', directorateId: topId, directorateName: null, options: allDirs };
}

// ---------------------------------------------------------------------------
// analyseShortlist -> { summary, items }
// ---------------------------------------------------------------------------
function analyseShortlist(parsed, colourMap, directorateId, data) {
  const cdes    = data.critical_data_element || [];
  const cdsList = data.critical_data_set     || [];
  let newCds = 0, existingCds = 0, newCde = 0, duplicateCde = 0;

  const items = parsed.items.map(function(item) {
    const matchedCds = cdsList.find(function(r) {
      return !r.retiring_timestamp &&
             r.directorate_id === directorateId &&
             r.data_set_name.trim().toLowerCase() === item.cdsName.trim().toLowerCase();
    });

    const cdsStatus    = matchedCds ? 'existing' : 'new';
    const existingCdsId = matchedCds ? matchedCds.critical_data_set_id : null;
    if (cdsStatus === 'existing') existingCds++; else newCds++;

    const mappedFields = item.fields.map(function(f) {
      const shortlistGroupId = f.colourHex ? (colourMap[f.colourHex] || null) : null;
      let fieldStatus   = 'new';
      let existingCdeId = null;

      if (cdsStatus === 'existing') {
        const matchedCde = cdes.find(function(r) {
          return !r.retiring_timestamp &&
                 r.critical_data_set_id === existingCdsId &&
                 r.source_field_name.trim().toLowerCase() === f.fieldName.trim().toLowerCase();
        });
        if (matchedCde) {
          fieldStatus   = 'duplicate';
          existingCdeId = matchedCde.critical_data_element_id;
        }
      }

      if (fieldStatus === 'duplicate') duplicateCde++; else newCde++;
      return {
        fieldName:        f.fieldName,
        colourHex:        f.colourHex,
        shortlistGroupId: shortlistGroupId,
        fieldStatus:      fieldStatus,
        existingCdeId:    existingCdeId,
      };
    });

    return {
      cdsName:      item.cdsName,
      cdsStatus:    cdsStatus,
      existingCdsId: existingCdsId,
      fields:       mappedFields,
    };
  });

  return {
    summary: { newCds: newCds, existingCds: existingCds, newCde: newCde, duplicateCde: duplicateCde },
    items:   items,
  };
}

// ---------------------------------------------------------------------------
// applyShortlistImport -> { newData, counts }
// ---------------------------------------------------------------------------
function applyShortlistImport(analysis, resolutions, directorateId, newGroups, data) {
  const newData = Object.assign({}, data);
  newData.shortlist_group       = (data.shortlist_group || []).concat(newGroups);
  newData.critical_data_set     = (data.critical_data_set || []).slice();
  newData.critical_data_element = (data.critical_data_element || []).slice();
  newData.cde_shortlist_tag     = (data.cde_shortlist_tag || []).slice();

  let nextCdsId = newData.critical_data_set.reduce(function(m, r) {
    return Math.max(m, r.critical_data_set_id || 0);
  }, 0) + 1;
  let nextCdeId = newData.critical_data_element.reduce(function(m, r) {
    return Math.max(m, r.critical_data_element_id || 0);
  }, 0) + 1;
  let nextTagId = newData.cde_shortlist_tag.reduce(function(m, r) {
    return Math.max(m, r.cde_shortlist_tag_id || 0);
  }, 0) + 1;

  let newCdsCount = 0, newCdeCount = 0, shortlistedCount = 0;

  analysis.items.forEach(function(item) {
    const cdsKey = 'cds:' + item.cdsName;
    let resolvedCdsId;

    if (item.cdsStatus === 'new' || resolutions[cdsKey] === 'B') {
      const rec = {
        critical_data_set_id:  nextCdsId++,
        directorate_id:        directorateId,
        data_set_name:         item.cdsName,
        data_set_description:  '',
        data_set_subdivision:  '',
        retiring_timestamp:    null,
      };
      newData.critical_data_set.push(rec);
      resolvedCdsId = rec.critical_data_set_id;
      newCdsCount++;
    } else {
      resolvedCdsId = item.existingCdsId;
    }

    item.fields.forEach(function(field) {
      const cdeKey = 'cde:' + item.cdsName + ':' + field.fieldName;
      if (field.fieldStatus === 'duplicate' && resolutions[cdeKey] !== 'B') return;

      const cdeId = nextCdeId++;
      newData.critical_data_element.push({
        critical_data_element_id: cdeId,
        critical_data_set_id:     resolvedCdsId,
        source_field_name:        field.fieldName,
        source_platform_name:     '',
        source_system_name:       '',
        source_database_name:     '',
        source_table_name:        '',
        source_snapshot_filter:   '',
        data_element_definition:  '',
        data_element_explanation: '',
        retiring_timestamp:       null,
      });
      newCdeCount++;

      if (field.shortlistGroupId != null) {
        newData.cde_shortlist_tag.push({
          cde_shortlist_tag_id:     nextTagId++,
          critical_data_element_id: cdeId,
          shortlist_group_id:       field.shortlistGroupId,
          retiring_timestamp:       null,
        });
        shortlistedCount++;
      }
    });
  });

  return { newData: newData, counts: { newCds: newCdsCount, newCde: newCdeCount, shortlisted: shortlistedCount } };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ShortlistGroupPreview({ newGroups }) {
  if (!newGroups || !newGroups.length) return null;
  return (
    <div style={{ marginBottom:16, padding:14, background:'var(--bg2)',
      borderRadius:8, border:'1px solid var(--border)' }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)',
        textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>
        Shortlist groups to be created for this import
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {newGroups.map(function(g, i) {
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{
                width:16, height:16, borderRadius:3, flexShrink:0,
                background:'#' + g.shortlist_colour_hex,
                border:'1px solid var(--border)',
              }} />
              <span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--text3)', width:72 }}>
                #{g.shortlist_colour_hex}
              </span>
              <span style={{ fontSize:13, color:'var(--text2)' }}>
                 {'\u2192'} <strong style={{ color:'var(--text1)' }}>{g.shortlist_group_label}</strong>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize:12, color:'var(--text3)', marginTop:10 }}>
        Labels can be renamed after import from the Shortlist Group table.
      </div>
    </div>
  );
}

function ShortlistDirectorateStep({ dirResult, onConfirm }) {
  const [selected, setSelected] = useState(
    dirResult.directorateId ? String(dirResult.directorateId) : ''
  );

  if (dirResult.mode === 'auto') {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16,
        padding:'10px 14px', background:'var(--bg2)', borderRadius:8, border:'1px solid var(--border)' }}>
        <span style={{ fontSize:13, color:'var(--text2)', flex:1 }}>
          Importing into: <strong style={{ color:'var(--text1)' }}>{dirResult.directorateName}</strong>
        </span>
        <button
          onClick={function() { onConfirm(dirResult.directorateId); }}
          style={{ padding:'6px 16px', background:'var(--green)', color:'#fff',
            border:'none', borderRadius:6, cursor:'pointer', fontWeight:600, fontSize:13 }}>
          Confirm
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:13, fontWeight:600, color:'var(--text2)', marginBottom:8 }}>
        Select directorate for this import
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <select
          value={selected}
          onChange={function(e) { setSelected(e.target.value); }}
          style={{ flex:1, padding:'8px 10px', borderRadius:6,
            border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text1)', fontSize:13 }}>
          <option value="">-- select directorate --</option>
          {dirResult.options.map(function(o) {
            return (
              <option key={o.directorate_id} value={String(o.directorate_id)}>
                {o.directorate_name}
              </option>
            );
          })}
        </select>
        <button
          onClick={function() { if (selected) onConfirm(Number(selected)); }}
          disabled={!selected}
          style={{
            padding:'8px 18px', borderRadius:6, border:'none', fontSize:13, fontWeight:600,
            cursor: selected ? 'pointer' : 'not-allowed',
            background: selected ? 'var(--green)' : 'var(--bg3)',
            color: selected ? '#fff' : 'var(--text3)',
          }}>
          Confirm
        </button>
      </div>
    </div>
  );
}

function ShortlistSummaryBanner({ summary }) {
  const tiles = [
    { label:'New CDS',        value: summary.newCds,       color:'var(--green)' },
    { label:'Existing CDS',   value: summary.existingCds,  color:'var(--amber)' },
    { label:'New CDEs',       value: summary.newCde,       color:'var(--green)' },
    { label:'Duplicate CDEs', value: summary.duplicateCde, color:'var(--amber)' },
  ];
  return (
    <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
      {tiles.map(function(t) {
        return (
          <div key={t.label} style={{ background:'var(--bg2)', borderRadius:8,
            padding:'8px 14px', minWidth:90, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:22, fontWeight:700, color:t.color, lineHeight:1.2 }}>{t.value}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{t.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function ShortlistCdsConflictCard({ item, resolution, onResolve }) {
  const key = 'cds:' + item.cdsName;
  const isA = resolution !== 'B';
  const newCount  = item.fields.filter(function(f) { return f.fieldStatus === 'new'; }).length;
  const dupCount  = item.fields.filter(function(f) { return f.fieldStatus === 'duplicate'; }).length;

  return (
    <div style={{ border:'1px solid rgba(245,166,35,0.5)', borderRadius:8,
      marginBottom:12, overflow:'hidden' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'9px 14px', background:'var(--bg3)', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontWeight:600, color:'var(--text1)', fontSize:13 }}>{item.cdsName}</span>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
          background:'rgba(245,166,35,0.15)', color:'var(--amber)',
          border:'1px solid rgba(245,166,35,0.4)' }}>
          EXISTING CDS
        </span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
        <div style={{ padding:'10px 14px', borderRight:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Current record</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>ID: {item.existingCdsId}</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>{dupCount} matching CDE{dupCount !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ padding:'10px 14px' }}>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Incoming (template)</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>{newCount} new CDE{newCount !== 1 ? 's' : ''} to attach</div>
          <div style={{ fontSize:12, color:'var(--text2)' }}>{dupCount} duplicate{dupCount !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div style={{ display:'flex', gap:8, padding:'10px 14px',
        borderTop:'1px solid var(--border)', background:'var(--bg)' }}>
        <button onClick={function() { onResolve(key, 'A'); }} style={{
          flex:1, padding:'7px 0', borderRadius:6, cursor:'pointer', fontSize:13,
          border: isA ? '2px solid var(--green)' : '1px solid var(--border)',
          background: isA ? 'rgba(34,201,142,0.1)' : 'var(--bg2)',
          color: isA ? 'var(--green)' : 'var(--text2)',
          fontWeight: isA ? 700 : 400,
        }}>Use existing CDS{isA ? ' \u2713' : ''}</button>
        <button onClick={function() { onResolve(key, 'B'); }} style={{
          flex:1, padding:'7px 0', borderRadius:6, cursor:'pointer', fontSize:13,
          border: !isA ? '2px solid var(--accent)' : '1px solid var(--border)',
          background: !isA ? 'rgba(24,180,212,0.1)' : 'var(--bg2)',
          color: !isA ? 'var(--accent)' : 'var(--text2)',
          fontWeight: !isA ? 700 : 400,
        }}>Create new CDS{!isA ? ' \u2713' : ''}</button>
      </div>
    </div>
  );
}

function ShortlistCdeConflictCard({ cdsName, field, resolution, onResolve }) {
  const key = 'cde:' + cdsName + ':' + field.fieldName;
  const isA = resolution !== 'B';

  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:6,
      marginBottom:8, overflow:'hidden', marginLeft:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'7px 12px', background:'var(--bg2)', borderBottom:'1px solid var(--border)' }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text1)',
          fontFamily:'var(--mono)' }}>{field.fieldName}</span>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4,
          background:'var(--bg3)', color:'var(--text3)', border:'1px solid var(--border)' }}>
          DUPLICATE
        </span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
        <div style={{ padding:'8px 12px', borderRight:'1px solid var(--border)',
          fontSize:12, color:'var(--text3)' }}>
          Existing CDE #{field.existingCdeId}
        </div>
        <div style={{ padding:'8px 12px', fontSize:12, color:'var(--text3)' }}>
          <div>Incoming: {field.fieldName}</div>
          {field.colourHex &&
            <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}>
              <div style={{ width:10, height:10, borderRadius:2,
                background:'#' + field.colourHex, border:'1px solid var(--border)' }} />
              <span>#{field.colourHex}</span>
            </div>
          }
        </div>
      </div>
      <div style={{ display:'flex', gap:8, padding:'8px 12px', borderTop:'1px solid var(--border)' }}>
        <button onClick={function() { onResolve(key, 'A'); }} style={{
          flex:1, padding:'5px 0', borderRadius:5, cursor:'pointer', fontSize:12,
          border: isA ? '2px solid var(--green)' : '1px solid var(--border)',
          background: isA ? 'rgba(34,201,142,0.1)' : 'var(--bg2)',
          color: isA ? 'var(--green)' : 'var(--text2)',
          fontWeight: isA ? 700 : 400,
        }}>Skip{isA ? ' \u2713' : ''}</button>
        <button onClick={function() { onResolve(key, 'B'); }} style={{
          flex:1, padding:'5px 0', borderRadius:5, cursor:'pointer', fontSize:12,
          border: !isA ? '2px solid var(--accent)' : '1px solid var(--border)',
          background: !isA ? 'rgba(24,180,212,0.1)' : 'var(--bg2)',
          color: !isA ? 'var(--accent)' : 'var(--text2)',
          fontWeight: !isA ? 700 : 400,
        }}>Import anyway{!isA ? ' \u2713' : ''}</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShortlistImportTab -- main component
// onImport(newData) is called on successful apply (same contract as onMerge)
// ---------------------------------------------------------------------------
function ShortlistImportTab({ onImport }) {
  const { data, stewardIdentity, isMaster } = useApp();

  const [phase,        setPhase]       = useState('upload');
  const [parsed,       setParsed]      = useState(null);
  const [fallbackMode, setFallback]    = useState(false);
  const [dirResult,    setDirResult]   = useState(null);
  const [directorateId, setDirId]      = useState(null);
  const [groupResult,  setGroupResult] = useState(null);
  const [analysis,     setAnalysis]    = useState(null);
  const [resolutions,  setResolutions] = useState({});
  const [done,         setDone]        = useState(null);
  const [error,        setError]       = useState(null);
  const [dragging,     setDragging]    = useState(false);

  const fileRef = useRef(null);

  function handleFile(file) {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const wb     = XLSX.read(ev.target.result, { type: 'binary', cellStyles: true });
        const result = parseShortlistWorkbook(wb);
        if (!result || !result.items.length) {
          setError('No CDS data found. Check that the file has CDS names in row 1 starting from column B.');
          return;
        }
        setParsed(result);
        setFallback(result.fallbackMode);

        const dr = resolveDirectorate(stewardIdentity, isMaster, data);
        setDirResult(dr);

        if (dr.mode === 'auto') {
          const autoId = dr.directorateId;
          setDirId(autoId);
          const gr = stageShortlistGroups(result.encounteredColours, autoId, data.shortlist_group || []);
          setGroupResult(gr);
          const analysis = analyseShortlist(result, gr.colourMap, autoId, data);
          const defaults = {};
          analysis.items.forEach(function(item) {
            if (item.cdsStatus === 'existing') defaults['cds:' + item.cdsName] = 'A';
            item.fields.forEach(function(f) {
              if (f.fieldStatus === 'duplicate') defaults['cde:' + item.cdsName + ':' + f.fieldName] = 'A';
            });
          });
          setAnalysis(analysis);
          setResolutions(defaults);
          setPhase('analyse');
        } else {
          setPhase('directorate');
        }
      } catch (err) {
        setError('Failed to read file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  }

  function handleDirectorateConfirm(id) {
    setDirId(id);
    const gr = stageShortlistGroups(parsed.encounteredColours, id, data.shortlist_group || []);
    setGroupResult(gr);
    const result = analyseShortlist(parsed, gr.colourMap, id, data);
    const defaults = {};
    result.items.forEach(function(item) {
      if (item.cdsStatus === 'existing') defaults['cds:' + item.cdsName] = 'A';
      item.fields.forEach(function(f) {
        if (f.fieldStatus === 'duplicate') defaults['cde:' + item.cdsName + ':' + f.fieldName] = 'A';
      });
    });
    setAnalysis(result);
    setResolutions(defaults);
    setPhase('analyse');
  }

  function handleResolve(key, val) {
    setResolutions(function(prev) { return Object.assign({}, prev, { [key]: val }); });
  }

  function handleApply() {
    const result = applyShortlistImport(analysis, resolutions, directorateId, groupResult.newGroups, data);
    onImport(result.newData);
    setDone(result.counts);
    setPhase('done');
  }

  function handleReset() {
    setParsed(null); setFallback(false); setDirResult(null); setDirId(null);
    setGroupResult(null); setAnalysis(null); setResolutions({}); setDone(null); setError(null);
    setPhase('upload');
    if (fileRef.current) fileRef.current.value = '';
  }

  const totalFields     = parsed ? parsed.items.reduce(function(n, i) { return n + i.fields.length; }, 0) : 0;
  const colouredFields  = parsed ? parsed.items.reduce(function(n, i) { return n + i.fields.filter(function(f) { return !!f.colourHex; }).length; }, 0) : 0;
  const conflictItems   = analysis ? analysis.items.filter(function(i) { return i.cdsStatus === 'existing'; }) : [];
  const totalConflicts  = analysis ? analysis.summary.existingCds + analysis.summary.duplicateCde : 0;

  const fallbackBanner = (
    <div style={{ background:'rgba(245,166,35,0.08)', border:'1px solid rgba(245,166,35,0.4)',
      borderRadius:8, padding:12, marginBottom:14, color:'var(--amber)', fontSize:13 }}>
      Cell colour data not available in this file {'\u2014'} CDEs will be imported without shortlist tags.
      Tags can be applied manually via the CDE panel after import.
    </div>
  );

  return (
    <div>

      {/* Header */}
      <div className="page-sub" style={{ marginBottom:14 }}>
        Bulk-load Critical Data Sets and Critical Data Elements from a completed CDE Shortlist Assessment workbook.
        All fields are imported; marked CDEs are tagged with a shortlist group based on their cell or font colour.
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:'rgba(192,57,43,0.1)', border:'1px solid rgba(192,57,43,0.5)',
          borderRadius:8, padding:12, marginBottom:16, color:'#e74c3c', fontSize:13 }}>
          {error}
        </div>
      )}

      {/* PHASE: upload */}
      {phase === 'upload' && (
        <div className={`upload-zone ${dragging ? 'drag-over' : ''}`}
          onDragOver={function(e) { e.preventDefault(); setDragging(true); }}
          onDragLeave={function() { setDragging(false); }}
          onDrop={function(e) { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}>
          <input ref={fileRef} type="file" accept=".xlsx"
            onChange={function(e) { handleFile(e.target.files[0]); }} />
          <svg className="upload-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="8" y="4" width="28" height="40" rx="3"/>
            <path d="M28 4v12h12M18 28l6-6 6 6M24 22v14"/>
          </svg>
          <div className="upload-title">Drop your file here</div>
          <div className="upload-sub">.xlsx CDE Shortlist Assessment workbook</div>
        </div>
      )}

      {/* PHASE: directorate */}
      {phase === 'directorate' && dirResult && (
        <div>
          {fallbackMode && fallbackBanner}
          <div style={{ marginBottom:14, fontSize:13, color:'var(--text2)' }}>
            Parsed <strong style={{ color:'var(--text1)' }}>{parsed.items.length}</strong> CDS
            and <strong style={{ color:'var(--text1)' }}>{totalFields}</strong> fields
            {colouredFields > 0
              ? <span> {'\u2014'} <strong style={{ color:'var(--green)' }}>{colouredFields}</strong> shortlisted (coloured).</span>
              : '.'}
          </div>
          <ShortlistDirectorateStep dirResult={dirResult} onConfirm={handleDirectorateConfirm} />
          <button onClick={handleReset} style={{
            background:'none', border:'none', cursor:'pointer',
            fontSize:12, color:'var(--text3)', padding:0, textDecoration:'underline',
          }}>
            Start over with a different file
          </button>
        </div>
      )}

      {/* PHASE: group preview -- removed: auto-advances from directorate */}
      {false && groupResult && (
        <div>
          {fallbackMode && fallbackBanner}
          <div style={{ marginBottom:14, fontSize:13, color:'var(--text2)' }}>
            Parsed <strong style={{ color:'var(--text1)' }}>{parsed.items.length}</strong> CDS,{' '}
            <strong style={{ color:'var(--text1)' }}>{totalFields}</strong> fields
            {colouredFields > 0
              ? <span>  {'\u2014'} <strong style={{ color:'var(--green)' }}>{colouredFields}</strong> shortlisted.</span>
              : '.'}
          </div>
          {groupResult.newGroups.length > 0
            ? <ShortlistGroupPreview newGroups={groupResult.newGroups} />
            : <div style={{ fontSize:13, color:'var(--text3)', marginBottom:14 }}>
                No coloured cells detected  {'\u2014'} no shortlist groups will be created.
              </div>
          }
          <button onClick={handleProceedAnalyse} style={{
            padding:'10px 26px', background:'var(--green)', color:'#fff',
            border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14,
          }}>
            Analyse file
          </button>
        </div>
      )}

      {/* PHASE: conflict review */}
      {phase === 'analyse' && analysis && (
        <div>
          {groupResult && groupResult.newGroups.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <ShortlistGroupPreview newGroups={groupResult.newGroups} />
            </div>
          )}
          <ShortlistSummaryBanner summary={analysis.summary} />

          {totalConflicts === 0
            ? <div style={{ background:'rgba(34,201,142,0.08)', border:'1px solid rgba(34,201,142,0.4)',
                borderRadius:8, padding:12, marginBottom:16, color:'var(--green)', fontSize:13 }}>
                No conflicts  {'\u2014'} all records are new and ready to import.
              </div>
            : <div style={{ marginBottom:16 }}>
                <div style={{ fontWeight:600, color:'var(--text1)', fontSize:13, marginBottom:12 }}>
                  {totalConflicts} conflict{totalConflicts !== 1 ? 's' : ''} detected
                   {'\u2014'} defaults are pre-selected, adjust if needed
                </div>
                {conflictItems.map(function(item, i) {
                  return (
                    <div key={i}>
                      <ShortlistCdsConflictCard
                        item={item}
                        resolution={resolutions['cds:' + item.cdsName]}
                        onResolve={handleResolve}
                      />
                      {item.fields
                        .filter(function(f) { return f.fieldStatus === 'duplicate'; })
                        .map(function(field, j) {
                          return (
                            <ShortlistCdeConflictCard
                              key={j}
                              cdsName={item.cdsName}
                              field={field}
                              resolution={resolutions['cde:' + item.cdsName + ':' + field.fieldName]}
                              onResolve={handleResolve}
                            />
                          );
                        })
                      }
                    </div>
                  );
                })}
              </div>
          }

          <div style={{ display:'flex', gap:12 }}>
            <button onClick={handleApply} style={{
              padding:'10px 28px', background:'var(--green)', color:'#fff',
              border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:14,
            }}>
              Apply import
            </button>
            <button onClick={handleReset} style={{
              padding:'10px 20px', background:'var(--bg2)', color:'var(--text2)',
              border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', fontSize:13,
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PHASE: done */}
      {phase === 'done' && done && (
        <div>
          <div style={{ background:'rgba(34,201,142,0.08)', border:'1px solid rgba(34,201,142,0.4)',
            borderRadius:10, padding:20, marginBottom:20 }}>
            <div style={{ fontWeight:700, color:'var(--green)', fontSize:15, marginBottom:6 }}>
              Import complete
            </div>
            <div style={{ color:'var(--text2)', fontSize:13 }}>
              {done.newCds} CDS created  {'\u00b7'}{' '}
              {done.newCde} CDE created  {'\u00b7'}{' '}
              {done.shortlisted} shortlisted
            </div>
          </div>
          <button onClick={handleReset} style={{
            padding:'10px 24px', background:'var(--bg2)', color:'var(--text1)',
            border:'1px solid var(--border)', borderRadius:8, cursor:'pointer', fontWeight:600,
          }}>
            Import another file
          </button>
        </div>
      )}

    </div>
  );
}
