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
// TASK 6 -- DELTA MERGE PANEL
// ===============================================================================
function DeltaMergePanel({ deltaResult, resolutions, onResolve, onApply, onCancel }) {
  const { delta, processResult, versionMismatch, masterVersion } = deltaResult;
  const { remappedInserts, autoApplyUpdates, conflicts } = processResult;
  const allResolved = conflicts.every(c => resolutions[`${c.table}:${c.pk}`]);
  const totalInserts     = Object.values(remappedInserts).reduce((s, a) => s + a.length, 0);
  const totalAutoUpdates = autoApplyUpdates.length;

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

      {/* Actions */}
      <div style={{ display:'flex', gap:10, marginTop:8 }}>
        <button className="btn btn-primary" onClick={onApply} disabled={!allResolved}>
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

  const handleApplyMerge = useCallback(() => {
    if (!deltaResult) return;
    const { delta, processResult } = deltaResult;
    const merged = applyMergedChanges(data, processResult, resolutions);
    const report = buildMergeReport(delta, processResult, resolutions);
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
  ];

  return (
    <div className="fade-in">
      <div className="page-title">Import</div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:0, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {tabs.map(function(t) {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={function() { setTab(t.id); }} style={{
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

    </div>
  );
}

