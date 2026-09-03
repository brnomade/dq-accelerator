// ===============================================================================
// UPLOADER EXPORT TAB
// UI only. All validation logic lives in 231_uploader_validation.js.
// ===============================================================================

function UploaderExportTab() {
  const { data, canEdit } = useApp();

  const [view,               setView]               = useState('settings');
  const [includeSoftDeleted, setIncludeSoftDeleted]  = useState(false);
  const [reviewResult,       setReviewResult]        = useState(null);
  const [exporting,          setExporting]           = useState(false);

  // Override state: { [allocation_id]: boolean } - true = include despite failure
  const [overrides,          setOverrides]           = useState({});
  // Expand state: absence of key = expanded, false = collapsed
  const [agencyExpanded,     setAgencyExpanded]      = useState({});
  const [cdsExpanded,        setCdsExpanded]         = useState({});

  const agencyMap = useMemo(() => {
    const m = {};
    for (const a of (data.executive_agency || [])) m[a.executive_agency_id] = a;
    return m;
  }, [data]);

  const dirMap = useMemo(() => {
    const m = {};
    for (const d of (data.directorate || [])) m[d.directorate_id] = d;
    return m;
  }, [data]);

  const cdsMap = useMemo(() => {
    const m = {};
    for (const c of (data.critical_data_set || [])) m[c.critical_data_set_id] = c;
    return m;
  }, [data]);

  const totalCount = useMemo(() => {
    return Object.keys(SCHEMA).reduce((s, t) => {
      const rows = data[t] || [];
      return s + (includeSoftDeleted ? rows.length : rows.filter(r => !r.retiring_timestamp).length);
    }, 0);
  }, [data, includeSoftDeleted]);

  const handleAnalyse = () => {
    const result = computeUploaderExclusions(data, includeSoftDeleted);
    const preChecked = {};
    for (var i = 0; i < result.excluded.length; i++) {
      var item = result.excluded[i];
      var c = item.checks;
      if (!c.phFieldOk && c.dbOk && c.tableOk && c.fieldOk && c.sqlOk && c.placeholdersOk && c.engOk) {
        preChecked[item.allocation.data_quality_rule_allocation_id] = true;
      }
    }
    setReviewResult(result);
    setOverrides(preChecked);
    setAgencyExpanded({});
    setCdsExpanded({});
    setView('review');
  };

  const handleCancel = () => {
    setView('settings');
    setReviewResult(null);
    setOverrides({});
    setAgencyExpanded({});
    setCdsExpanded({});
  };

  const handleConfirm = async () => {
    setExporting(true);
    try {
      const ts = new Date().toISOString().replace(/[:\-T.Z]/g, '').slice(0, 14);

      const overriddenItems = reviewResult.excluded.filter(item =>
        overrides[item.allocation.data_quality_rule_allocation_id]
      );
      const stillExcluded = reviewResult.excluded.filter(item =>
        !overrides[item.allocation.data_quality_rule_allocation_id]
      );

      const overriddenAllocs  = overriddenItems.map(item => item.allocation);
      const filteredData      = {
        ...data,
        data_quality_rule_allocation: reviewResult.included.concat(overriddenAllocs),
      };

      const zip    = new JSZip();
      const folder = zip.folder('dq_uploader_' + ts);
      for (const tableName of Object.keys(SCHEMA)) {
        folder.file(tableName + '.csv', tableToCSV(tableName, filteredData, includeSoftDeleted));
      }
      const zipBlob  = await zip.generateAsync({ type: 'blob' });
      const zipSaved = await saveWithPicker(zipBlob, 'dq_uploader_' + ts + '.zip', 'ZIP Archive', '.zip');

      if (zipSaved) {
        if (stillExcluded.length > 0 || overriddenItems.length > 0) {
          const receiptBlob = buildUploaderReceipt(
            stillExcluded,
            overriddenItems,
            reviewResult.totalEvaluated
          );
          await saveWithPicker(receiptBlob, 'dq_uploader_receipt_' + ts + '.json', 'JSON File', '.json');
        }
        handleCancel();
      }
    } finally {
      setExporting(false);
    }
  };

  // ---- Settings view -------------------------------------------------------
  if (view === 'settings') {
    return (
      <div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20, lineHeight:1.6 }}>
          Produces a ZIP for upload to the DQ engine. Rule allocations that have missing SQL,
          incomplete CDE source fields, or unresolvable placeholders are excluded before export.
          A receipt listing every excluded allocation is downloaded alongside the ZIP when
          exclusions exist.
        </div>

        <div className="card" style={{ marginBottom:20 }}>
          <div className="card-title">
            <span className="dot"/>Uploader export
          </div>

          <div className="toggle-row" style={{ borderTop:'none', marginTop:0, paddingTop:0 }}>
            <label className="toggle">
              <input type="checkbox" checked={includeSoftDeleted}
                onChange={e => setIncludeSoftDeleted(e.target.checked)}/>
              <div className="toggle-track"/><div className="toggle-thumb"/>
            </label>
            <span className="toggle-label">Include soft-deleted records</span>
            <span style={{ marginLeft:'auto' }}
              className={'badge ' + (includeSoftDeleted ? 'badge-amber' : 'badge-green')}>
              {includeSoftDeleted ? 'all records' : 'live only'}
            </span>
          </div>

          <div style={{ marginTop:12, padding:'8px 12px', background:'var(--bg)',
            borderRadius:'var(--radius)', fontSize:11, color:'var(--text3)',
            fontFamily:'var(--mono)' }}>
            {Object.keys(SCHEMA).length}{' CSV files - '}{totalCount.toLocaleString()}{' total records - bundled as dq_uploader_YYYYMMDDHHMMSS.zip'}
          </div>

          <div style={{ marginTop:12 }}>
            <button className="btn btn-primary" onClick={handleAnalyse} disabled={!canEdit}>
              <Icon.Download/>Export for Uploader
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Review view ---------------------------------------------------------
  return (
    <UploaderReviewView
      reviewResult={reviewResult}
      overrides={overrides}
      setOverrides={setOverrides}
      agencyExpanded={agencyExpanded}
      setAgencyExpanded={setAgencyExpanded}
      cdsExpanded={cdsExpanded}
      setCdsExpanded={setCdsExpanded}
      agencyMap={agencyMap}
      dirMap={dirMap}
      cdsMap={cdsMap}
      exporting={exporting}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}

// -----------------------------------------------------------------------
// UploaderReviewView
// Renders the hierarchical review table.
// -----------------------------------------------------------------------
function UploaderReviewView(props) {
  const {
    reviewResult, overrides, setOverrides,
    agencyExpanded, setAgencyExpanded,
    cdsExpanded, setCdsExpanded,
    agencyMap, dirMap, cdsMap,
    exporting, onConfirm, onCancel,
  } = props;

  const { excluded, totalEvaluated } = reviewResult;
  const totalFailed     = excluded.length;
  const totalOverridden = Object.values(overrides).filter(Boolean).length;
  const totalExcluded   = totalFailed - totalOverridden;
  const hasExclusions   = totalExcluded > 0;
  const confirmLabel    = exporting ? 'Exporting...' : (hasExclusions ? 'Export ZIP + receipt' : 'Export ZIP');

  const [sortCol, setSortCol] = useState('cde');
  const [sortDir, setSortDir] = useState('asc');

  function handleColClick(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function sortItems(items) {
    return [...items].sort(function(a, b) {
      if (sortCol === 'cde') {
        const av = (a.cde ? a.cde.source_field_name : '') || '';
        const bv = (b.cde ? b.cde.source_field_name : '') || '';
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (sortCol === 'rule') {
        const av = (a.rule ? a.rule.rule_name : '') || '';
        const bv = (b.rule ? b.rule.rule_name : '') || '';
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      // Check columns: asc = failures first (0 before 1), desc = passes first
      const av = a.checks[sortCol] ? 1 : 0;
      const bv = b.checks[sortCol] ? 1 : 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }

  function SortIndicator(col) {
    if (sortCol !== col) return null;
    return (
      <span style={{ marginLeft:3, fontSize:9, color:'var(--accent)' }}>
        {sortDir === 'asc' ? String.fromCharCode(9650) : String.fromCharCode(9660)}
      </span>
    );
  }

  // Build Agency > CDS > items tree from excluded list, sorted alphabetically by acronym
  // agencyGroups: [{ agencyId, agency, cdsGroups: [{ cdsId, cdsName, items[] }] }]
  const agencyGroups = useMemo(() => {
    const agMap = {};

    for (const item of excluded) {
      const cds     = item.cds;
      const cdsId   = cds ? cds.critical_data_set_id : 'unknown';
      const cdsName = cds ? (cds.data_set_name || 'Unnamed CDS') : 'Unknown CDS';

      // Resolve agency via directorate
      let agencyId = 'unknown';
      let agency   = null;
      if (cds && cds.directorate_id) {
        const dir = dirMap[cds.directorate_id];
        if (dir && dir.executive_agency_id) {
          agencyId = dir.executive_agency_id;
          agency   = agencyMap[agencyId] || null;
        }
      }

      if (!agMap[agencyId]) agMap[agencyId] = { agencyId, agency, cdsMap: {} };
      if (!agMap[agencyId].cdsMap[cdsId]) agMap[agencyId].cdsMap[cdsId] = { cdsId, cdsName, items: [] };
      agMap[agencyId].cdsMap[cdsId].items.push(item);
    }

    return Object.values(agMap)
      .sort((a, b) =>
        (a.agency ? (a.agency.agency_acronymn || '') : 'ZZZ')
          .localeCompare(b.agency ? (b.agency.agency_acronymn || '') : 'ZZZ')
      )
      .map(ag => ({
        ...ag,
        cdsGroups: Object.values(ag.cdsMap),
      }));
  }, [excluded, agencyMap, dirMap]);

  function isAgencyExpanded(agencyId) {
    return agencyExpanded[agencyId] === true;
  }
  function isCdsExpanded(cdsId) {
    return cdsExpanded[cdsId] !== false;
  }
  function toggleAgency(agencyId) {
    setAgencyExpanded(prev => ({ ...prev, [agencyId]: !isAgencyExpanded(agencyId) }));
  }
  function toggleCds(cdsId) {
    setCdsExpanded(prev => ({ ...prev, [cdsId]: !isCdsExpanded(cdsId) }));
  }

  function allIdsInAgency(agGroup) {
    const ids = [];
    for (const cg of agGroup.cdsGroups) {
      for (const item of cg.items) ids.push(item.allocation.data_quality_rule_allocation_id);
    }
    return ids;
  }
  function allIdsInCds(cdsGroup) {
    return cdsGroup.items.map(item => item.allocation.data_quality_rule_allocation_id);
  }

  function isGroupAllChecked(ids) {
    return ids.length > 0 && ids.every(id => overrides[id]);
  }
  function toggleGroupOverride(ids) {
    const allChecked = isGroupAllChecked(ids);
    setOverrides(prev => {
      const next = { ...prev };
      for (const id of ids) next[id] = !allChecked;
      return next;
    });
  }
  function setOneOverride(allocId, val) {
    setOverrides(prev => ({ ...prev, [allocId]: val }));
  }

  const colHeaderStyle = {
    padding:'4px 8px', fontSize:10, fontWeight:700,
    color:'var(--text3)', background:'var(--bg2)',
    borderBottom:'1px solid var(--border)',
    textAlign:'center', whiteSpace:'nowrap',
  };
  const colCellStyle = {
    padding:'6px 8px', fontSize:11,
    borderBottom:'1px solid var(--border)',
    textAlign:'center', verticalAlign:'middle',
  };
  const textCellStyle = {
    padding:'6px 8px', fontSize:11,
    borderBottom:'1px solid var(--border)',
    verticalAlign:'middle', color:'var(--text2)',
  };

  const CHECK_COLS = [
    { key:'dbOk',          label:'DB',    tip:'Source database name - must be a valid SQL identifier (no spaces, no placeholder values)' },
    { key:'tableOk',       label:'Table', tip:'Source table name - must be a valid SQL identifier (no spaces, no placeholder values)' },
    { key:'fieldOk',       label:'Field', tip:'Source field name - must be a valid SQL identifier (no spaces, no placeholder values)' },
    { key:'sqlOk',         label:'SQL',   tip:'Rule SQL code - must be present and non-empty' },
    { key:'placeholdersOk',label:'PH',    tip:'Source placeholders - {SOURCE_DATABASE_NAME} and {SOURCE_TABLE_NAME} must appear in the SQL template' },
    { key:'phFieldOk',     label:'PHF',   tip:'Field placeholder - {SOURCE_FIELD_NAME} should appear in the SQL template. Table-level rules that do not reference a specific field may legitimately omit it. If this is the only failure, the allocation is pre-included automatically.' },
    { key:'engOk',         label:'Eng',   tip:'SQL engine checks - quotes and parentheses must be balanced, no LIMIT keyword, and SELECT COUNT(...) must be present in sql_code and sql_code_sample (when defined)' },
  ];

  function CheckMark(ok) {
    return ok
      ? <span style={{ color:'var(--green)', fontWeight:700, fontSize:13 }}>{String.fromCharCode(10003)}</span>
      : <span style={{ color:'var(--red)',   fontWeight:700, fontSize:13 }}>{String.fromCharCode(10007)}</span>;
  }

  // ---- Zero failures case --------------------------------------------------
  if (totalFailed === 0) {
    return (
      <div>
        <div style={{ padding:'12px 16px', marginBottom:20,
          background:'var(--bg2)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', fontSize:13 }}>
          <span style={{ fontWeight:700 }}>{totalEvaluated}</span>
          {' allocations evaluated - '}
          <span style={{ color:'var(--green)', fontWeight:700 }}>{'all passed. Ready to export.'}</span>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-primary" onClick={onConfirm} disabled={exporting}>
            <Icon.Download/>{exporting ? 'Exporting...' : 'Export ZIP'}
          </button>
          <button className="btn btn-ghost" onClick={onCancel} disabled={exporting}>Cancel</button>
        </div>
      </div>
    );
  }

  // ---- Normal review -------------------------------------------------------
  return (
    <div>
      {/* Headline */}
      <div style={{ padding:'10px 14px', marginBottom:16,
        background:'var(--bg2)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)', fontSize:13 }}>
        <span style={{ fontWeight:700 }}>{totalEvaluated}</span>
        {' allocations evaluated - '}
        <span style={{ color:'var(--red)', fontWeight:700 }}>{totalFailed}{' failed. '}</span>
        {'All failed allocations excluded by default.'}
      </div>

      {/* Agency groups */}
      {agencyGroups.map(agGroup => {
        const agencyAllIds  = allIdsInAgency(agGroup);
        const agencyFailed  = agencyAllIds.length;
        const agExpanded    = isAgencyExpanded(agGroup.agencyId);
        const agAllChecked  = isGroupAllChecked(agencyAllIds);

        return (
          <div key={agGroup.agencyId} style={{ marginBottom:8 }}>
            {/* Agency header */}
            <div style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'8px 12px',
              background:'var(--bg2)',
              border:'1px solid var(--border)',
              borderRadius: agExpanded ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)',
              cursor:'pointer', userSelect:'none',
            }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--text3)', width:12 }}
                onClick={() => toggleAgency(agGroup.agencyId)}>
                {agExpanded ? '-' : '+'}
              </span>
              <span style={{ display:'flex', alignItems:'baseline', gap:8, flex:1 }}
                onClick={() => toggleAgency(agGroup.agencyId)}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                  {agGroup.agency ? (agGroup.agency.agency_acronymn || 'Unknown') : 'Unknown Agency'}
                </span>
                {agGroup.agency && agGroup.agency.agency_name &&
                  <span style={{ fontSize:11, color:'var(--text3)' }}>
                    {agGroup.agency.agency_name}
                  </span>
                }
              </span>
              <span style={{ fontSize:11, color:'var(--red)', marginRight:8 }}
                onClick={() => toggleAgency(agGroup.agencyId)}>
                {'(' + agencyFailed + ' failed)'}
              </span>
              <label style={{ display:'flex', alignItems:'center', gap:5,
                fontSize:11, color:'var(--text3)', cursor:'pointer' }}
                onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={agAllChecked}
                  onChange={() => toggleGroupOverride(agencyAllIds)}/>
                {'Select all'}
              </label>
            </div>

            {/* CDS groups */}
            {agExpanded && (
              <div style={{ border:'1px solid var(--border)', borderTop:'none',
                borderRadius:'0 0 var(--radius) var(--radius)', overflow:'hidden' }}>
                {agGroup.cdsGroups.map((cdsGroup, cgIdx) => {
                  const cdsAllIds   = allIdsInCds(cdsGroup);
                  const cdsFailed   = cdsAllIds.length;
                  const cdsExp      = isCdsExpanded(cdsGroup.cdsId);
                  const cdsAllChk   = isGroupAllChecked(cdsAllIds);
                  const isLastCds   = cgIdx === agGroup.cdsGroups.length - 1;

                  return (
                    <div key={cdsGroup.cdsId}>
                      {/* CDS header */}
                      <div style={{
                        display:'flex', alignItems:'center', gap:8,
                        padding:'7px 12px 7px 28px',
                        background:'var(--bg)',
                        borderBottom: (cdsExp || !isLastCds) ? '1px solid var(--border)' : 'none',
                        cursor:'pointer', userSelect:'none',
                      }}>
                        <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)', width:12 }}
                          onClick={() => toggleCds(cdsGroup.cdsId)}>
                          {cdsExp ? '-' : '+'}
                        </span>
                        <span style={{ fontWeight:600, fontSize:11, flex:1 }}
                          onClick={() => toggleCds(cdsGroup.cdsId)}>
                          {cdsGroup.cdsName}
                        </span>
                        <span style={{ fontSize:11, color:'var(--red)', marginRight:8 }}
                          onClick={() => toggleCds(cdsGroup.cdsId)}>
                          {'(' + cdsFailed + ' failed)'}
                        </span>
                        <label style={{ display:'flex', alignItems:'center', gap:5,
                          fontSize:11, color:'var(--text3)', cursor:'pointer' }}
                          onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={cdsAllChk}
                            onChange={() => toggleGroupOverride(cdsAllIds)}/>
                          {'Select all'}
                        </label>
                      </div>

                      {/* Allocation table */}
                      {cdsExp && (
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse',
                            tableLayout:'fixed', fontSize:11 }}>
                            <colgroup>
                              <col style={{ width:'20%' }}/>
                              <col style={{ width:'22%' }}/>
                              <col style={{ width:'6%'  }}/>
                              <col style={{ width:'6%'  }}/>
                              <col style={{ width:'6%'  }}/>
                              <col style={{ width:'6%'  }}/>
                              <col style={{ width:'6%'  }}/>
                              <col style={{ width:'6%'  }}/>
                              <col style={{ width:'6%'  }}/>
                              <col style={{ width:'9%'  }}/>
                            </colgroup>
                            <thead>
                              <tr>
                                <th style={{ ...colHeaderStyle, textAlign:'left', cursor:'pointer' }}
                                  onClick={() => handleColClick('cde')}>
                                  {'CDE'}{SortIndicator('cde')}
                                </th>
                                <th style={{ ...colHeaderStyle, textAlign:'left', cursor:'pointer' }}
                                  onClick={() => handleColClick('rule')}>
                                  {'Rule'}{SortIndicator('rule')}
                                </th>
                                {CHECK_COLS.map(col => (
                                  <th key={col.key} style={{ ...colHeaderStyle, cursor:'pointer' }}
                                    title={col.tip}
                                    onClick={() => handleColClick(col.key)}>
                                    {col.label}{SortIndicator(col.key)}
                                  </th>
                                ))}
                                <th style={colHeaderStyle}>Include?</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortItems(cdsGroup.items).map((item, rowIdx) => {
                                const allocId  = item.allocation.data_quality_rule_allocation_id;
                                const cdeName  = item.cde  ? (item.cde.source_field_name || '-') : '-';
                                const ruleName = item.rule ? (item.rule.rule_name        || '-') : '-';
                                const isLast   = rowIdx === cdsGroup.items.length - 1;

                                return (
                                  <tr key={allocId} style={{
                                    background: overrides[allocId] ? 'rgba(34,201,142,0.05)' : 'transparent',
                                  }}>
                                    <td style={{ ...textCellStyle,
                                      borderBottom: isLast ? 'none' : '1px solid var(--border)',
                                      fontFamily:'var(--mono)', fontSize:10 }}>
                                      {cdeName}
                                    </td>
                                    <td style={{ ...textCellStyle,
                                      borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
                                      {ruleName}
                                    </td>
                                    {CHECK_COLS.map(col => (
                                      <td key={col.key} style={{ ...colCellStyle,
                                        borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
                                        {CheckMark(item.checks[col.key])}
                                      </td>
                                    ))}
                                    <td style={{ ...colCellStyle,
                                      borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
                                      <input type="checkbox"
                                        checked={!!overrides[allocId]}
                                        onChange={e => setOneOverride(allocId, e.target.checked)}
                                        title={'Include this allocation despite validation failures'}/>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Summary bar */}
      <div style={{
        marginTop:20, padding:'10px 14px',
        background:'var(--bg2)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)',
        display:'flex', alignItems:'center', gap:16, flexWrap:'wrap',
        fontSize:12,
      }}>
        <span>
          <span style={{ fontWeight:700 }}>{totalFailed}</span>{' failed'}
        </span>
        <span style={{ color:'var(--text3)' }}>{'|'}</span>
        <span>
          <span style={{ fontWeight:700, color:'var(--green)' }}>{totalOverridden}</span>
          {' overridden to include'}
        </span>
        <span style={{ color:'var(--text3)' }}>{'|'}</span>
        <span>
          <span style={{ fontWeight:700, color: totalExcluded > 0 ? 'var(--red)' : 'var(--green)' }}>
            {totalExcluded}
          </span>
          {' still excluded'}
        </span>
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:10, marginTop:16 }}>
        <button className="btn btn-primary" onClick={onConfirm} disabled={exporting}>
          <Icon.Download/>{confirmLabel}
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={exporting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
