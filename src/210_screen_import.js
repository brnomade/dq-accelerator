// ===============================================================================
// TASK 6 -- DELTA CONFLICT CARD
// ===============================================================================
function DeltaConflictCard({ conflict, resolution, onResolve }) {
  const { table, pk, masterRow, stewardRow, type } = conflict;
  const schema  = SCHEMA[table];
  const pkField = schema.pk;
  const cardKey = `${table}:${pk}`;
  const [showAll, setShowAll] = useState(false);

  const nonPkCols = (schema.cols || []).filter(col => col.name !== pkField);

  const changedColNames = new Set(
    type === 'update'
      ? nonPkCols
          .filter(col => String(masterRow[col.name] ?? '') !== String(stewardRow[col.name] ?? ''))
          .map(c => c.name)
      : []
  );

  // retire: always show all master fields so master can see what would be lost
  // update collapsed: changed rows only; update expanded: all rows
  const visibleCols = type === 'retire'
    ? nonPkCols
    : showAll ? nonPkCols : nonPkCols.filter(col => changedColNames.has(col.name));

  const borderColor = !resolution
    ? 'rgba(245,166,35,0.5)'
    : resolution === 'master' ? 'var(--border)' : 'rgba(34,201,142,0.4)';

  const statusLabel = !resolution ? 'Unresolved'
    : resolution === 'master' ? 'Keeping master' : 'Accepting steward';
  const statusColor = !resolution ? 'var(--amber)'
    : resolution === 'master' ? 'var(--text3)' : 'var(--green)';

  const thStyle = {
    fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em',
    color:'var(--text3)', padding:'5px 10px', borderBottom:'1px solid var(--border)',
    background:'var(--bg3)', textAlign:'left',
  };
  const cell = (extra) => Object.assign({
    padding:'4px 10px', fontSize:11, fontFamily:'var(--mono)',
    borderBottom:'1px solid var(--border)', verticalAlign:'middle',
  }, extra || {});

  return (
    <div style={{ marginBottom:12, border:`1px solid ${borderColor}`,
      borderRadius:'var(--radius)', background:'var(--bg2)', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8,
        padding:'7px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg3)' }}>
        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text2)' }}>{table}</span>
        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)' }}>{' | '}</span>
        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text2)', flex:1 }}>
          {pkField}: {pk}
        </span>
        <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:3,
          background: type === 'retire' ? 'rgba(245,166,35,0.15)' : 'rgba(24,180,212,0.15)',
          color:      type === 'retire' ? 'var(--amber)' : 'var(--accent)',
          border:     `1px solid ${type === 'retire' ? 'rgba(245,166,35,0.4)' : 'var(--accent-border)'}` }}>
          {type === 'retire' ? 'RETIRE' : 'UPDATE'}
        </span>
        <span style={{ fontSize:10, color:statusColor }}>{statusLabel}</span>
      </div>

      {/* 3-column diff table */}
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width:'34%' }}>field</th>
            <th style={{ ...thStyle, width:'33%' }}>master</th>
            <th style={{ ...thStyle, width:'33%' }}>steward</th>
          </tr>
        </thead>
        <tbody>

          {/* PK row - always shown, amber PK badge */}
          <tr style={{ background:'var(--bg3)' }}>
            <td style={cell({ color:'var(--text3)' })}>
              {pkField}
              <span style={{ fontSize:9, fontWeight:700, color:'var(--amber)',
                background:'rgba(245,166,35,0.12)', border:'1px solid rgba(245,166,35,0.3)',
                borderRadius:3, padding:'1px 4px', marginLeft:6 }}>PK</span>
            </td>
            <td style={cell({ color:'var(--text2)' })}>{String(masterRow[pkField] ?? '-')}</td>
            <td style={cell({ color:'var(--text2)' })}>
              {type === 'retire'
                ? String(masterRow[pkField] ?? '-')
                : String(stewardRow ? stewardRow[pkField] ?? '-' : '-')}
            </td>
          </tr>

          {/* Retire notice - spans full width */}
          {type === 'retire' && (
            <tr>
              <td colSpan={3} style={cell({
                background:'rgba(245,166,35,0.08)', color:'var(--amber)',
                borderLeft:'3px solid rgba(245,166,35,0.5)',
              })}>
                Steward proposes to retire this record
              </td>
            </tr>
          )}

          {/* Data rows */}
          {visibleCols.map(col => {
            const isChanged = changedColNames.has(col.name);
            const rowBg = isChanged ? 'rgba(245,166,35,0.05)' : 'transparent';
            return (
              <tr key={col.name} style={{ background:rowBg }}>
                <td style={cell({ color: isChanged ? 'var(--text2)' : 'var(--text3)' })}>
                  {col.name}
                </td>
                <td style={cell({ color: isChanged ? 'var(--text2)' : 'var(--text3)' })}>
                  {String(masterRow[col.name] ?? '-')}
                </td>
                <td style={cell({
                  color: type === 'retire'
                    ? 'var(--text3)'
                    : isChanged ? 'var(--green)' : 'var(--text3)',
                  fontWeight: isChanged ? 500 : 400,
                })}>
                  {type === 'retire'
                    ? String(masterRow[col.name] ?? '-')
                    : String(stewardRow ? stewardRow[col.name] ?? '-' : '-')}
                </td>
              </tr>
            );
          })}

          {/* Empty state when update has no visible changed cols */}
          {visibleCols.length === 0 && type === 'update' && (
            <tr>
              <td colSpan={3} style={cell({ color:'var(--text3)' })}>
                No field-level differences detected
              </td>
            </tr>
          )}

        </tbody>
      </table>

      {/* Resolution footer */}
      <div style={{ display:'flex', gap:8, padding:'7px 12px',
        borderTop:'1px solid var(--border)', background:'var(--bg3)', alignItems:'center' }}>
        <button
          className={`btn ${resolution === 'master' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize:11, padding:'3px 10px' }}
          onClick={() => onResolve(cardKey, 'master')}>
          Keep master
        </button>
        <button
          className={`btn ${resolution === 'steward' ? 'btn-green' : 'btn-ghost'}`}
          style={{ fontSize:11, padding:'3px 10px' }}
          onClick={() => onResolve(cardKey, 'steward')}>
          {type === 'retire' ? 'Accept retirement' : 'Accept steward'}
        </button>
        {type === 'update' && (
          <button className="btn btn-ghost" style={{ fontSize:11, padding:'3px 10px', marginLeft:'auto' }}
            onClick={() => setShowAll(s => !s)}>
            {showAll ? 'Collapse' : 'Show all fields'}
          </button>
        )}
      </div>
    </div>
  );
}

// ===============================================================================
// INSERT REVIEW -- per-table group card
// ===============================================================================
function InsertTableGroup({ tableName, rows, selections, onToggleRow, onAcceptTable, onRejectTable }) {
  const [expanded,     setExpanded]     = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const schema  = SCHEMA[tableName] || {};
  const pkField = schema.pk;
  const cols    = schema.cols || [];

  const selectedCount = rows.filter(r => selections[tableName + ':' + r[pkField]] !== false).length;
  const badgeColor = selectedCount === rows.length ? 'var(--green)'
    : selectedCount === 0 ? 'var(--text3)' : 'var(--amber)';

  const truncate = (s, n) => { var str = String(s); return str.length > n ? str.slice(0, n) + '...' : str; };

  const thStyle = {
    fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em',
    color:'var(--text3)', padding:'4px 8px', borderBottom:'1px solid var(--border)',
    background:'var(--bg3)', textAlign:'left', whiteSpace:'nowrap',
  };
  const tdStyle = {
    padding:'3px 8px', fontSize:11, fontFamily:'var(--mono)',
    borderBottom:'1px solid var(--border)', verticalAlign:'middle', whiteSpace:'nowrap',
  };

  return (
    <div style={{ marginBottom:8, border:'1px solid var(--border)', borderRadius:'var(--radius)',
      background:'var(--bg2)', overflow:'hidden' }}>

      {/* Group header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px',
        cursor:'pointer', background:'var(--bg3)', userSelect:'none' }}
        onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', width:14 }}>
          {expanded ? '[-]' : '[+]'}
        </span>
        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text2)', flex:1 }}>
          {tableName}
        </span>
        <span style={{ fontSize:11, color:'var(--text3)' }}>{rows.length} inserts</span>
        <span style={{ fontSize:10, padding:'2px 6px', borderRadius:3,
          border:'1px solid var(--border)', color:badgeColor }}>
          {selectedCount} selected
        </span>
        <button className="btn btn-ghost" style={{ fontSize:11, padding:'2px 8px' }}
          onClick={e => { e.stopPropagation(); onAcceptTable(tableName); }}>Accept all</button>
        <button className="btn btn-ghost" style={{ fontSize:11, padding:'2px 8px' }}
          onClick={e => { e.stopPropagation(); onRejectTable(tableName); }}>Reject all</button>
      </div>

      {/* Expanded rows table */}
      {expanded && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:400 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width:28 }}></th>
                {cols.map(col => <th key={col.name} style={thStyle}>{col.label || col.name}</th>)}
                <th style={{ ...thStyle, width:90 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const pkVal     = row[pkField];
                const key       = tableName + ':' + pkVal;
                const accepted  = selections[key] !== false;
                const rowOpen   = !!expandedRows[pkVal];
                return [
                  <tr key={key} style={{ opacity: accepted ? 1 : 0.45, background:'var(--bg2)' }}>
                    <td style={{ ...tdStyle, textAlign:'center' }}>
                      <input type="checkbox" checked={accepted}
                        onChange={() => onToggleRow(key)} />
                    </td>
                    {cols.map(col => (
                      <td key={col.name} style={tdStyle} title={String(row[col.name] ?? '')}>
                        {truncate(String(row[col.name] ?? '-'), 28)}
                      </td>
                    ))}
                    <td style={{ ...tdStyle, textAlign:'right' }}>
                      <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
                        onClick={() => setExpandedRows(prev => ({ ...prev, [pkVal]: !prev[pkVal] }))}>
                        {rowOpen ? 'Collapse' : 'Expand'}
                      </button>
                    </td>
                  </tr>,
                  rowOpen && (
                    <tr key={key + '_detail'}>
                      <td colSpan={cols.length + 2}
                        style={{ padding:'6px 12px 8px 36px', background:'var(--bg)' }}>
                        <table style={{ borderCollapse:'collapse', fontSize:11, width:'100%' }}>
                          <tbody>
                            {cols.map(col => (
                              <tr key={col.name}>
                                <td style={{ color:'var(--text3)', padding:'2px 8px',
                                  fontFamily:'var(--mono)', width:'38%', verticalAlign:'top' }}>
                                  {col.name}
                                </td>
                                <td style={{ color:'var(--text2)', padding:'2px 8px',
                                  fontFamily:'var(--mono)', wordBreak:'break-all' }}>
                                  {String(row[col.name] ?? '-')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// INSERT REVIEW -- section wrapper
// ===============================================================================
function InsertReviewSection({ remappedInserts, selections, onToggleRow, onAcceptTable, onRejectTable, onAcceptAll, onRejectAll }) {
  const tables = Object.keys(remappedInserts).filter(t => (remappedInserts[t] || []).length > 0);
  if (tables.length === 0) return null;

  const total = tables.reduce((s, t) => s + remappedInserts[t].length, 0);
  const selected = tables.reduce((s, t) => {
    const pkField = SCHEMA[t] ? SCHEMA[t].pk : null;
    return s + (remappedInserts[t] || []).filter(r =>
      !pkField || selections[t + ':' + r[pkField]] !== false
    ).length;
  }, 0);

  return (
    <div style={{ marginTop:20, marginBottom:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text2)', flex:1 }}>
          {'Inserts ' + String.fromCharCode(8212) + ' ' + selected + ' of ' + total + ' selected'}
        </span>
        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={onAcceptAll}>
          Accept all
        </button>
        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={onRejectAll}>
          Reject all
        </button>
      </div>
      {tables.map(tbl => (
        <InsertTableGroup
          key={tbl}
          tableName={tbl}
          rows={remappedInserts[tbl]}
          selections={selections}
          onToggleRow={onToggleRow}
          onAcceptTable={onAcceptTable}
          onRejectTable={onRejectTable}
        />
      ))}
    </div>
  );
}

// ===============================================================================
// TASK 6 -- DELTA MERGE PANEL
// ===============================================================================
function DeltaMergePanel({ deltaResult, resolutions, onResolve, onApply, onCancel }) {
  const { delta, processResult, versionMismatch, masterVersion } = deltaResult;
  const { remappedInserts, autoApplyUpdates, conflicts } = processResult;
  const allResolved = conflicts.every(c => resolutions[`${c.table}:${c.pk}`]);
  const totalInserts     = Object.values(remappedInserts).reduce((s, a) => s + a.length, 0);
  const totalAutoUpdates = autoApplyUpdates.length;

  const [insertSelections, setInsertSelections] = useState(() => {
    const init = {};
    Object.entries(remappedInserts).forEach(function(entry) {
      var tbl = entry[0]; var rows = entry[1];
      var pkField = SCHEMA[tbl] ? SCHEMA[tbl].pk : null;
      if (!pkField) return;
      rows.forEach(function(row) { init[tbl + ':' + row[pkField]] = true; });
    });
    return init;
  });

  const handleToggleRow = useCallback(function(key) {
    setInsertSelections(function(prev) { return Object.assign({}, prev, { [key]: !prev[key] }); });
  }, []);

  const handleAcceptTable = useCallback(function(tbl) {
    setInsertSelections(function(prev) {
      var next = Object.assign({}, prev);
      var pkField = SCHEMA[tbl] ? SCHEMA[tbl].pk : null;
      if (pkField) (remappedInserts[tbl] || []).forEach(function(row) {
        next[tbl + ':' + row[pkField]] = true;
      });
      return next;
    });
  }, [remappedInserts]);

  const handleRejectTable = useCallback(function(tbl) {
    setInsertSelections(function(prev) {
      var next = Object.assign({}, prev);
      var pkField = SCHEMA[tbl] ? SCHEMA[tbl].pk : null;
      if (pkField) (remappedInserts[tbl] || []).forEach(function(row) {
        next[tbl + ':' + row[pkField]] = false;
      });
      return next;
    });
  }, [remappedInserts]);

  const handleAcceptAll = useCallback(function() {
    setInsertSelections(function(prev) {
      var next = Object.assign({}, prev);
      Object.keys(next).forEach(function(k) { next[k] = true; });
      return next;
    });
  }, []);

  const handleRejectAll = useCallback(function() {
    setInsertSelections(function(prev) {
      var next = Object.assign({}, prev);
      Object.keys(next).forEach(function(k) { next[k] = false; });
      return next;
    });
  }, []);

  return (
    <div>
      {/* Version mismatch warning */}
      {versionMismatch && (
        <div style={{ marginBottom:14, padding:'8px 12px',
          background:'rgba(245,166,35,0.08)', border:'1px solid rgba(245,166,35,0.35)',
          borderRadius:'var(--radius)', fontSize:11, color:'var(--amber)' }}>
          <span style={{ fontWeight:700 }}>Version mismatch: </span>
          this delta was built against{' '}
          <span style={{ fontFamily:'var(--mono)' }}>{delta._base_version}</span>
          {' '}but your current version is{' '}
          <span style={{ fontFamily:'var(--mono)' }}>{masterVersion}</span>.
          {' '}Conflict detection may be unreliable -- phantom conflicts are possible.
          You may still proceed.
        </div>
      )}

      {/* Delta summary card */}
      <div className="card" style={{ marginBottom:16, borderLeft:'3px solid var(--accent)' }}>
        <div className="card-title">
          <span style={{ width:3, height:14, borderRadius:2, background:'var(--accent)',
            display:'inline-block', marginRight:8 }}/>
          Delta import
          <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
            color:'var(--accent)', background:'var(--accent-tint)',
            border:'1px solid var(--accent-border)', borderRadius:3,
            padding:'1px 6px', marginLeft:8 }}>STEWARD</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
          {[
            ['Steward',   delta._steward_name],
            ['Base version', delta._base_version || 'unknown'],
            ['Exported',  new Date(delta._exported_at).toLocaleString()],
          ].map(([l, v]) => (
            <div key={l} style={{ padding:'6px 10px', background:'var(--bg)', borderRadius:'var(--radius)' }}>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>{l}</div>
              <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text1)' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[
            [totalInserts,     'inserts',      'var(--green)'],
            [totalAutoUpdates, 'auto-updates', 'var(--accent)'],
            [conflicts.length, 'conflicts',    conflicts.length > 0 ? 'var(--amber)' : 'var(--text3)'],
          ].map(([v, l, color]) => (
            <span key={l} style={{ fontSize:11, padding:'2px 8px', borderRadius:3,
              background:'var(--bg)', color, border:'1px solid var(--border)' }}>
              {v} {l}
            </span>
          ))}
        </div>
      </div>

      {/* No-conflict notice */}
      {conflicts.length === 0 && (
        <div style={{ marginBottom:14, padding:'8px 12px',
          background:'rgba(34,201,142,0.08)', border:'1px solid rgba(34,201,142,0.3)',
          borderRadius:'var(--radius)', fontSize:12, color:'var(--green)' }}>
          No conflicts -- all changes can be applied automatically.
        </div>
      )}

      {/* Conflict cards */}
      {conflicts.length > 0 && (
        <>
          <div style={{ fontSize:12, fontWeight:600, marginBottom:10, color:'var(--text2)' }}>
            {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} -- resolve each before applying
          </div>
          {conflicts.map(c => (
            <DeltaConflictCard
              key={`${c.table}:${c.pk}`}
              conflict={c}
              resolution={resolutions[`${c.table}:${c.pk}`]}
              onResolve={onResolve}
            />
          ))}
        </>
      )}

      {/* Insert review section */}
      {totalInserts > 0 && (
        <InsertReviewSection
          remappedInserts={remappedInserts}
          selections={insertSelections}
          onToggleRow={handleToggleRow}
          onAcceptTable={handleAcceptTable}
          onRejectTable={handleRejectTable}
          onAcceptAll={handleAcceptAll}
          onRejectAll={handleRejectAll}
        />
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:10, marginTop:8 }}>
        <button className="btn btn-primary" onClick={() => onApply(insertSelections)} disabled={!allResolved}>
          <Icon.Download/> Apply merge and download report
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ===============================================================================
// IMPORT SCREEN
// ===============================================================================
function ImportScreen({ onImport, onMerge }) {
  const { data, isMaster, navigate } = useApp();
  const [dragging,            setDragging]            = useState(false);
  const [importing,           setImporting]           = useState(false);
  const [progress,            setProgress]            = useState(0);
  const [log,                 setLog]                 = useState([]);
  const [deltaResult,         setDeltaResult]         = useState(null);
  const [resolutions,         setResolutions]         = useState({});
  const [mergeReport,         setMergeReport]         = useState(null);
  const [pendingMasterImport, setPendingMasterImport] = useState(null);
  const [tab,                 setTab]                 = useState('standard');
  const [csvFile,             setCsvFile]             = useState(null);
  const [csvError,            setCsvError]            = useState(null);
  const [csvConfirming,       setCsvConfirming]       = useState(false);
  const [csvSuccess,          setCsvSuccess]          = useState(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setDeltaResult(null); setMergeReport(null); setLog([]);
    setImporting(true); setProgress(10);
    try {
      if (file.name.endsWith('.json')) {
        const text    = await file.text();
        setProgress(40);
        const payload = JSON.parse(text);

        if (payload._type === 'master') {
          const snapshot = loadBaseSnapshot();
          if (snapshot && data) {
            const changes      = buildDelta(data, snapshot);
            const totalChanges = Object.values(changes)
              .reduce((s, c) => s + c.inserted.length + c.updated.length + c.retired.length, 0);
            if (totalChanges > 0) {
              setImporting(false);
              setPendingMasterImport({ payload, totalChanges });
              return;
            }
          }
          const version      = payload._version;
          const importedData = payload.data;
          setProgress(80);
          saveBaseVersion(version);
          saveBaseSnapshot(buildSnapshot(importedData));
          await new Promise(r => setTimeout(r, 200));
          setProgress(100);
          const importLog = [
            { level:'ok', msg:`Master import successful. Version: ${version}` },
            { level:'ok', msg:`Base snapshot recorded for ${DELTA_TABLES.length} delta-tracked tables.` },
          ];
          setLog(importLog);
          onImport(importedData, importLog);

        } else if (payload._type === 'delta') {
          if (!isMaster) {
            setLog([{ level:'err', msg:'Delta import is restricted to the master steward.' }]);
            setImporting(false);
            return;
          }
          setProgress(80);
          const processResult  = processDelta(payload, data, loadBaseSnapshot());
          const masterVersion  = loadBaseVersion();
          const versionMismatch = !!(masterVersion && payload._base_version &&
            payload._base_version !== masterVersion);
          setProgress(100);
          await new Promise(r => setTimeout(r, 100));
          setImporting(false);
          setDeltaResult({ delta: payload, processResult, versionMismatch,
            masterVersion: masterVersion || 'unknown' });
          setResolutions({});
          return;

        } else {
          throw new Error('Unrecognised JSON file (expected _type: master or delta).');
        }
      } else {
        const buf = await file.arrayBuffer();
        setProgress(40);
        const { data: importedData, log: importLog } = importWorkbook(buf);
        setProgress(80);
        await new Promise(r => setTimeout(r, 200));
        setProgress(100);
        setLog(importLog);
        onImport(importedData, importLog);
      }
    } catch (e) {
      setLog([{ level:'err', msg:`Import failed: ${e.message}` }]);
    } finally { setImporting(false); }
  }, [onImport, data, isMaster]);

  const handleResolve = useCallback((key, choice) => {
    setResolutions(prev => ({ ...prev, [key]: choice }));
  }, []);

  const handleApplyMerge = useCallback((insertSelections) => {
    if (!deltaResult) return;
    const { delta, processResult } = deltaResult;
    const merged = applyMergedChanges(data, processResult, resolutions, insertSelections);
    const report = buildMergeReport(delta, processResult, resolutions, insertSelections);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type:'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().replace(/[:\-T]/g,'').slice(0, 15);
    a.href     = url;
    a.download = `dq_merge_report_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onMerge(merged);
    saveBaseSnapshot(buildSnapshot(merged));
    setMergeReport(report);
    setDeltaResult(null);
    setResolutions({});
  }, [deltaResult, data, resolutions, onMerge]);

  const handleCancelDelta = useCallback(() => {
    setDeltaResult(null);
    setResolutions({});
  }, []);

  const handleCsvFile = useCallback(async function(file) {
    setCsvError(null);
    setCsvFile(null);
    setCsvConfirming(false);
    setCsvSuccess(null);

    var rawName = file.name.replace(/\.csv$/i, '');
    if (!SCHEMA[rawName]) {
      setCsvError('Cannot identify table from filename. Rename the file to match a table name (e.g. critical_data_element.csv).');
      return;
    }
    var tableName = rawName;
    try {
      var text = await file.text();
      var wb = XLSX.read(text, { type: 'string' });
      var ws = wb.Sheets[wb.SheetNames[0]];

      // Check header contains the PK column before full parse
      var headerRow = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0]) || [];
      var pk = SCHEMA[tableName].pk;
      if (!headerRow.includes(pk)) {
        setCsvError('CSV is missing required column "' + pk + '". This file may not belong to the selected table.');
        return;
      }

      var rows = importSheet(ws, tableName);
      if (rows.length === 0) {
        setCsvError('The CSV contains no data rows.');
        return;
      }

      var warnings = validateCsvReplace(tableName, rows, data);
      var currentCount = (data[tableName] || []).length;
      setCsvFile({ name: file.name, tableName: tableName, rows: rows, warnings: warnings, currentCount: currentCount });
      setCsvConfirming(true);
    } catch(e) {
      setCsvError('Failed to parse CSV: ' + e.message);
    }
  }, [data]);

  const baseVersion = loadBaseVersion();

  // Post-merge summary view
  if (mergeReport) {
    const { summary, _steward_name, _merged_at } = mergeReport;
    return (
      <div className="fade-in">
        <div className="page-title">Import</div>
        <div className="card" style={{ borderLeft:'3px solid #22c98e' }}>
          <div className="card-title"><span className="dot"/>Merge applied</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>
            Delta from <strong>{_steward_name}</strong> merged at {new Date(_merged_at).toLocaleString()}.
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
            {[
              [`${summary.total_inserted} inserted`,                                    'var(--green)'],
              [`${summary.total_updated} updated`,                                      'var(--accent)'],
              [`${summary.total_retired} retired`,                                      'var(--amber)'],
              [`${summary.total_conflicts} conflict${summary.total_conflicts !== 1 ? 's' : ''} resolved`, 'var(--text3)'],
            ].map(([l, color]) => (
              <span key={l} style={{ fontSize:11, padding:'2px 8px', borderRadius:3,
                background:'var(--bg)', color, border:'1px solid var(--border)' }}>{l}</span>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary" style={{ fontSize:11 }}
              onClick={() => navigate({ screen:'export', table:null })}>
              <Icon.Download/> Export new Master JSON
            </button>
            <button className="btn btn-ghost" style={{ fontSize:11 }}
              onClick={() => setMergeReport(null)}>
              <Icon.Upload/> Import another file
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Uncommitted-changes warning before master JSON import
  if (pendingMasterImport) {
    const { payload, totalChanges } = pendingMasterImport;
    const doImport = () => {
      const version      = payload._version;
      const importedData = payload.data;
      saveBaseVersion(version);
      saveBaseSnapshot(buildSnapshot(importedData));
      const importLog = [
        { level:'warn', msg:`Imported over ${totalChanges} uncommitted change${totalChanges !== 1 ? 's' : ''}.` },
        { level:'ok',  msg:`Master import successful. Version: ${version}` },
        { level:'ok',  msg:`Base snapshot recorded for ${DELTA_TABLES.length} delta-tracked tables.` },
      ];
      setPendingMasterImport(null);
      setLog(importLog);
      onImport(importedData, importLog);
    };
    return (
      <div className="fade-in">
        <div className="page-title">Import</div>
        <div className="card" style={{ borderLeft:'3px solid var(--amber)' }}>
          <div className="card-title">
            <span style={{ width:3, height:14, borderRadius:2, background:'var(--amber)',
              display:'inline-block', marginRight:8 }}/>
            Uncommitted changes detected
          </div>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12 }}>
            You have <strong>{totalChanges} uncommitted change{totalChanges !== 1 ? 's' : ''}</strong> that
            have not been exported as a delta. Importing this master file will permanently overwrite
            your local data and these changes will be lost.
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button className="btn btn-primary" style={{ fontSize:11 }}
              onClick={() => navigate({ screen:'export', table:null })}>
              <Icon.Download/> Go to Export first
            </button>
            <button className="btn btn-danger" style={{ fontSize:11 }} onClick={doImport}>
              Import anyway
            </button>
            <button className="btn btn-ghost" style={{ fontSize:11 }}
              onClick={() => setPendingMasterImport(null)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Delta conflict resolution view
  if (deltaResult) {
    return (
      <div className="fade-in">
        <div className="page-title">Import</div>
        <div className="page-sub">Review and resolve conflicts before applying the steward delta.</div>
        <DeltaMergePanel
          deltaResult={deltaResult}
          resolutions={resolutions}
          onResolve={handleResolve}
          onApply={handleApplyMerge}
          onCancel={handleCancelDelta}
        />
      </div>
    );
  }

  // Standard import view
  const tabs = [
    { id:'standard',  label:'Full Dataset / Delta' },
    { id:'shortlist', label:'CDE Shortlist Assessment' },
  ].concat(isMaster ? [{ id:'csv', label:'Single Table CSV' }] : []);

  return (
    <div className="fade-in">
      <div className="page-title">Import</div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {tabs.map(function(t) {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={function() {
              setTab(t.id);
              if (t.id !== 'csv') { setCsvFile(null); setCsvError(null); setCsvConfirming(false); setCsvSuccess(null); }
            }} style={{
              padding:'8px 20px', fontSize:13, fontWeight: active ? 700 : 400,
              color: active ? 'var(--green)' : 'var(--text3)',
              background:'transparent', border:'none', borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
              cursor:'pointer', marginBottom:'-1px', transition:'color 0.15s',
            }}>{t.label}</button>
          );
        })}
      </div>

      {/* Tab: Full dataset / Delta */}
      {tab === 'standard' && (
        <div>
          <div className="page-sub" style={{ marginBottom:14 }}>
            Load a master JSON to refresh the metadata or import a full Excel workbook to seed the initial metadata.
          </div>

          {baseVersion && (
            <div style={{ marginBottom:14, padding:'6px 12px',
              background:'rgba(245,166,35,0.06)', border:'1px solid rgba(245,166,35,0.3)',
              borderRadius:'var(--radius)', fontSize:11, color:'var(--text3)',
              fontFamily:'var(--mono)' }}>
              Current base version: <span style={{ color:'var(--amber)', fontWeight:600 }}>{baseVersion}</span>
            </div>
          )}

          {isMaster && (
            <div style={{ marginBottom:14, padding:'6px 12px',
              background:'rgba(24,180,212,0.06)', border:'1px solid rgba(24,180,212,0.3)',
              borderRadius:'var(--radius)', fontSize:11, color:'var(--text3)' }}>
              Drop a <span style={{ fontFamily:'var(--mono)', color:'var(--accent)' }}>dq_delta_*.json</span> file to review and merge a steward delta.
            </div>
          )}

          <div className={`upload-zone ${dragging ? 'drag-over' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}>
            <input type="file" accept=".xlsx,.xls,.json" onChange={e => handleFile(e.target.files[0])}/>
            <svg className="upload-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="8" y="4" width="28" height="40" rx="3"/>
              <path d="M28 4v12h12M18 28l6-6 6 6M24 22v14"/>
            </svg>
            <div className="upload-title">{importing ? 'Importing...' : 'Drop your file here'}</div>
            <div className="upload-sub">{importing ? 'Reading file...' : 'Master JSON, steward delta, or Excel workbook'}</div>
          </div>

          {importing && (
            <div style={{ marginTop:10 }}>
              <div className="progress-bar-wrap">
                <div className="progress-bar" style={{ width:`${progress}%` }}/>
              </div>
            </div>
          )}
          {log.length > 0 && (
            <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:3 }}>
              {log.map((e, i) => (
                <div key={i} className={`status-row ${e.level==='err'?'status-err':e.level==='warn'?'status-warn':'status-info'}`}>
                  {e.msg}
                </div>
              ))}
              {!importing && (
                <div style={{ marginTop:10, display:'flex', justifyContent:'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate({ screen:'dashboard', table:null })}>
                    Proceed
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: CDE Shortlist */}
      {tab === 'shortlist' && (
        <ShortlistImportTab onImport={onMerge} />
      )}

      {/* Tab: Single Table CSV (master only) */}
      {tab === 'csv' && (
        <div>
          <div className="page-sub" style={{ marginBottom:14 }}>
            Replace the contents of a single table from a CSV backup file. The table is fully flushed and repopulated from the file.
          </div>

          {/* Drop zone - hidden once preview is showing */}
          {!csvConfirming && (
            <div className={`upload-zone ${(dragging && tab === 'csv') ? 'drag-over' : ''}`}
              onDragOver={function(e) { e.preventDefault(); setDragging(true); }}
              onDragLeave={function() { setDragging(false); }}
              onDrop={function(e) {
                e.preventDefault();
                setDragging(false);
                var f = e.dataTransfer.files[0];
                if (f) handleCsvFile(f);
              }}>
              <input type="file" accept=".csv" onChange={function(e) {
                if (e.target.files[0]) handleCsvFile(e.target.files[0]);
              }}/>
              <svg className="upload-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="8" y="4" width="28" height="40" rx="3"/>
                <path d="M28 4v12h12M18 28l6-6 6 6M24 22v14"/>
              </svg>
              <div className="upload-title">Drop a CSV file here</div>
              <div className="upload-sub">File must be named {'<'}table_name{'>'}.csv</div>
            </div>
          )}

          {/* Error banner */}
          {csvError && (
            <div style={{ marginTop:12, padding:'10px 14px',
              background:'rgba(192,57,43,0.12)', border:'1px solid rgba(192,57,43,0.45)',
              borderRadius:'var(--radius)', fontSize:12, color:'#e07070' }}>
              {csvError}
            </div>
          )}

          {/* Success banner */}
          {csvSuccess && !csvConfirming && (
            <div style={{ marginTop:12, padding:'10px 14px',
              background:'rgba(34,201,142,0.08)', border:'1px solid rgba(34,201,142,0.3)',
              borderRadius:'var(--radius)', fontSize:12, color:'var(--green)' }}>
              {csvSuccess}
            </div>
          )}

          {/* Preview / confirmation panel */}
          {csvConfirming && csvFile && (
            <div style={{ marginTop:12, background:'var(--bg2)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', overflow:'hidden' }}>

              {/* Header */}
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)',
                background:'var(--bg3)', display:'flex', alignItems:'baseline', gap:10 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text1)' }}>
                  {SCHEMA[csvFile.tableName].label}
                </span>
                <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                  {csvFile.name}
                </span>
              </div>

              {/* Row count delta */}
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)',
                display:'flex', alignItems:'center', gap:10, fontSize:13, color:'var(--text2)' }}>
                <span>Current: <strong style={{ color:'var(--text1)' }}>{csvFile.currentCount}</strong></span>
                <span style={{ color:'var(--text3)' }}>{String.fromCharCode(8594)}</span>
                <span>Incoming: <strong style={{ color:'var(--text1)' }}>{csvFile.rows.length}</strong></span>
                {csvFile.rows.length !== csvFile.currentCount && (
                  <span style={{
                    fontSize:11, fontWeight:600, padding:'1px 6px', borderRadius:3,
                    background: csvFile.rows.length < csvFile.currentCount ? 'rgba(192,57,43,0.12)' : 'rgba(34,201,142,0.1)',
                    color:      csvFile.rows.length < csvFile.currentCount ? '#e07070' : 'var(--green)',
                    border:     '1px solid ' + (csvFile.rows.length < csvFile.currentCount ? 'rgba(192,57,43,0.3)' : 'rgba(34,201,142,0.25)'),
                  }}>
                    {(csvFile.rows.length > csvFile.currentCount ? '+' : '') + (csvFile.rows.length - csvFile.currentCount) + ' rows'}
                  </span>
                )}
              </div>

              {/* FK warnings */}
              {csvFile.warnings.length > 0 && (
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)',
                  background:'rgba(245,166,35,0.04)' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--amber)', marginBottom:8 }}>
                    {String.fromCharCode(9888)} FK Warnings ({csvFile.warnings.length})
                  </div>
                  {csvFile.warnings.map(function(w, i) {
                    var msg = w.direction === 'inbound'
                      ? w.count + ' row' + (w.count !== 1 ? 's' : '') + ' in "' + w.sourceLabel + '" will be orphaned after this replace.'
                      : w.count + ' incoming row' + (w.count !== 1 ? 's' : '') + ' reference ' + w.targetLabel + ' values that do not exist in this database.';
                    return (
                      <div key={i} style={{ fontSize:11, color:'#c8a06a', paddingLeft:10, marginBottom:4 }}>
                        {String.fromCharCode(8226) + ' '}{msg}
                      </div>
                    );
                  })}
                  <div style={{ fontSize:10, color:'var(--text3)', marginTop:6 }}>
                    Warnings are informational. You may still proceed.
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ padding:'12px 16px', display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={function() {
                  setCsvConfirming(false);
                  setCsvFile(null);
                  setCsvError(null);
                }}>Cancel</button>
                <button className="btn btn-danger" style={{ fontSize:12 }} onClick={function() {
                  var newData = Object.assign({}, data, { [csvFile.tableName]: csvFile.rows });
                  var label = SCHEMA[csvFile.tableName].label;
                  var count = csvFile.rows.length;
                  onImport(newData, []);
                  setCsvSuccess('Replaced ' + label + ': ' + count + ' row' + (count !== 1 ? 's' : '') + ' loaded.');
                  setCsvConfirming(false);
                  setCsvFile(null);
                }}>Replace Table</button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

