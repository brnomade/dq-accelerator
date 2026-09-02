// ===============================================================================
// UPLOADER EXPORT TAB
// UI only. All validation logic lives in 231_uploader_validation.js.
// ===============================================================================

function UploaderExportTab() {
  const { data, canEdit } = useApp();

  const [view,               setView]              = useState('settings');
  const [includeSoftDeleted, setIncludeSoftDeleted] = useState(false);
  const [reviewResult,       setReviewResult]       = useState(null);
  const [exporting,          setExporting]          = useState(false);
  const [showExcluded,       setShowExcluded]       = useState(true);
  const [showIncluded,       setShowIncluded]       = useState(false);

  const cdeMap = useMemo(() => {
    const m = {};
    for (const c of (data.critical_data_element || [])) m[c.critical_data_element_id] = c;
    return m;
  }, [data]);

  const ruleMap = useMemo(() => {
    const m = {};
    for (const r of (data.data_quality_rule || [])) m[r.data_quality_rule_id] = r;
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
    setReviewResult(result);
    setShowExcluded(true);
    setShowIncluded(false);
    setView('review');
  };

  const handleConfirm = async () => {
    setExporting(true);
    try {
      const ts = new Date().toISOString().replace(/[:\-T.Z]/g, '').slice(0, 14);
      const filteredData = { ...data, data_quality_rule_allocation: reviewResult.included };

      const zip    = new JSZip();
      const folder = zip.folder('dq_uploader_' + ts);
      for (const tableName of Object.keys(SCHEMA)) {
        folder.file(tableName + '.csv', tableToCSV(tableName, filteredData, includeSoftDeleted));
      }
      const zipBlob  = await zip.generateAsync({ type: 'blob' });
      const zipSaved = await saveWithPicker(zipBlob, 'dq_uploader_' + ts + '.zip', 'ZIP Archive', '.zip');

      if (zipSaved) {
        if (reviewResult.excluded.length > 0) {
          const receiptBlob = buildUploaderReceipt(reviewResult.excluded, reviewResult.totalEvaluated);
          await saveWithPicker(receiptBlob, 'dq_uploader_receipt_' + ts + '.json', 'JSON File', '.json');
        }
        setView('settings');
        setReviewResult(null);
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
            {Object.keys(SCHEMA).length} CSV files {'-'} {totalCount.toLocaleString()} total records {'-'} bundled as dq_uploader_YYYYMMDDHHMMSS.zip
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
  const { included, excluded, totalEvaluated } = reviewResult;
  const hasExclusions = excluded.length > 0;
  const confirmLabel  = exporting ? 'Exporting...' : 'Export File';

  const sectionHeaderStyle = {
    display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'8px 12px',
    background:'var(--bg2)', border:'1px solid var(--border)',
    borderRadius:'var(--radius)', cursor:'pointer',
    fontSize:12, fontWeight:600,
    userSelect:'none',
  };

  const rowStyle = {
    padding:'8px 12px',
    border:'1px solid var(--border)', borderTop:'none',
    fontSize:11, color:'var(--text2)',
  };

  return (
    <div>
      {/* Headline */}
      <div style={{
        padding:'12px 16px', marginBottom:16,
        background:'var(--bg2)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)', fontSize:13,
      }}>
        <span style={{ fontWeight:700 }}>{included.length}</span>
        {' of '}
        <span style={{ fontWeight:700 }}>{totalEvaluated}</span>
        {' Rule Allocations will be included. '}
        {hasExclusions
          ? <span style={{ color:'var(--red)', fontWeight:700 }}>{excluded.length}{' excluded.'}</span>
          : <span style={{ color:'var(--green)' }}>None excluded.</span>
        }
      </div>

      {/* Excluded section */}
      {hasExclusions && (
        <div style={{ marginBottom:16 }}>
          <div style={{ ...sectionHeaderStyle,
            borderBottom: showExcluded ? 'none' : '1px solid var(--border)',
            borderRadius: showExcluded ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)',
            color:'var(--red)',
          }}
            onClick={() => setShowExcluded(v => !v)}>
            <span>{'Excluded (' + excluded.length + ')'}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:14 }}>{showExcluded ? '-' : '+'}</span>
          </div>
          {showExcluded && (
            <div style={{
              border:'1px solid var(--border)', borderTop:'none',
              borderRadius:'0 0 var(--radius) var(--radius)',
              overflow:'hidden',
            }}>
              {excluded.map((item, i) => (
                <div key={i} style={{
                  ...rowStyle,
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ fontWeight:600, marginBottom:4, color:'var(--text1)' }}>
                    {item.cds  ? item.cds.data_set_name      : '-'}
                    {' / '}
                    {item.cde  ? item.cde.source_field_name  : '-'}
                    {' / '}
                    {item.rule ? item.rule.rule_name          : '-'}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                    {item.reasons.map((reason, j) => (
                      <div key={j} style={{
                        display:'flex', alignItems:'flex-start', gap:6,
                        fontSize:11, color:'var(--red)',
                      }}>
                        <span style={{ fontFamily:'var(--mono)', flexShrink:0 }}>{'!'}</span>
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Included section */}
      <div style={{ marginBottom:20 }}>
        <div style={{ ...sectionHeaderStyle,
          borderBottom: showIncluded ? 'none' : '1px solid var(--border)',
          borderRadius: showIncluded ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)',
          color:'var(--green)',
        }}
          onClick={() => setShowIncluded(v => !v)}>
          <span>{'Included (' + included.length + ')'}</span>
          <span style={{ fontFamily:'var(--mono)', fontSize:14 }}>{showIncluded ? '-' : '+'}</span>
        </div>
        {showIncluded && (
          <div style={{
            border:'1px solid var(--border)', borderTop:'none',
            borderRadius:'0 0 var(--radius) var(--radius)',
            overflow:'hidden',
          }}>
            {included.length === 0
              ? (
                <div style={{ ...rowStyle, color:'var(--text3)', fontStyle:'italic' }}>
                  No allocations will be included.
                </div>
              )
              : included.map((alloc, i) => {
                  const cde  = cdeMap[alloc.critical_data_element_id];
                  const cds  = cde ? cdsMap[cde.critical_data_set_id] : null;
                  const rule = ruleMap[alloc.data_quality_rule_id];
                  return (
                    <div key={i} style={{
                      ...rowStyle,
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      display:'flex', alignItems:'center', gap:6,
                    }}>
                      {alloc.retiring_timestamp && (
                        <span style={{
                          fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
                          color:'var(--text3)', background:'var(--bg)',
                          border:'1px solid var(--border)',
                          borderRadius:3, padding:'1px 5px', flexShrink:0,
                        }}>RETIRED</span>
                      )}
                      <span>
                        {cds  ? cds.data_set_name      : '-'}
                        {' / '}
                        {cde  ? cde.source_field_name  : '-'}
                        {' / '}
                        {rule ? rule.rule_name          : '-'}
                      </span>
                    </div>
                  );
                })
            }
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:10 }}>
        <button className="btn btn-primary" onClick={handleConfirm} disabled={exporting}>
          <Icon.Download/>{confirmLabel}
        </button>
        <button className="btn btn-ghost" onClick={() => setView('settings')} disabled={exporting}>
          Cancel
        </button>
      </div>
    </div>
  );
}
