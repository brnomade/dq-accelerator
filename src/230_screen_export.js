function ExportScreen() {
  const { data, isMaster, stewardIdentity, canEdit } = useApp();
  const [includeSoftDeleted, setIncludeSoftDeleted] = useState(false);
  const [exporting,          setExporting]          = useState(false);
  const [exportingGroup,     setExportingGroup]     = useState(null);
  const [exportingMaster,    setExportingMaster]    = useState(false);
  const [baseVersion,        setBaseVersion]        = useState(() => loadBaseVersion());
  const [baseSnapshot,       setBaseSnapshot]       = useState(() => loadBaseSnapshot());
  const [exportingDelta,     setExportingDelta]     = useState(false);

  const handleExportMaster = async () => {
    setExportingMaster(true);
    try {
      const current = loadBaseVersion();
      const version = nextMasterVersion(current);
      const payload = {
        _type:        'master',
        _version:     version,
        _exported_at: new Date().toISOString(),
        data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const saved = await saveWithPicker(blob, `dq_master_${version}.json`, 'JSON File', '.json');
      if (saved) { saveBaseVersion(version); setBaseVersion(version); }
    } finally { setExportingMaster(false); }
  };

  const handleExportDelta = () => {
    setExportingDelta(true);
    try {
      const snapshot = loadBaseSnapshot();
      const version  = loadBaseVersion();
      const changes  = buildDelta(data, snapshot || {});
      const totalChanges = Object.values(changes)
        .reduce((s, c) => s + c.inserted.length + c.updated.length + c.retired.length, 0);
      const payload = {
        _type:         'delta',
        _steward_id:   stewardIdentity.id,
        _steward_name: stewardIdentity.name,
        _base_version: version || 'unknown',
        _exported_at:  new Date().toISOString(),
        _total_changes: totalChanges,
        changes,
      };
      const ts   = new Date().toISOString().replace(/[:\-T.Z]/g,'').slice(0,14);
      const name = `dq_delta_${stewardIdentity.name.replace(/\s+/g,'_')}_${ts}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } finally { setExportingDelta(false); }
  };

  const allTables = Object.keys(SCHEMA);
  const counts = useMemo(() => {
    const out = {};
    for (const t of allTables) {
      const rows = data[t] || [];
      out[t] = includeSoftDeleted ? rows.length : rows.filter(r => !r.retiring_timestamp).length;
    }
    return out;
  }, [data, includeSoftDeleted]);
  const total = Object.values(counts).reduce((s,n) => s+n, 0);

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await buildAllCSVsBlob(data, includeSoftDeleted);
      await saveWithPicker(blob, filename, 'ZIP Archive', '.zip');
    } finally { setExporting(false); }
  };
  const handleExportGroup = async (group) => {
    setExportingGroup(group.id);
    try {
      const zip = new JSZip();
      const ts = new Date().toISOString().replace(/[:\-T.Z]/g,'').slice(0,14);
      const folder = zip.folder(`dq_export_${group.id}_${ts}`);
      for (const t of group.tables) folder.file(`${t}.csv`, tableToCSV(t, data, includeSoftDeleted));
      const blob = await zip.generateAsync({ type:'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `dq_export_${group.id}_${ts}.zip`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExportingGroup(null); }
  };

  return (
    <div className="fade-in">
      <div className="page-title">Export</div>
      <div className="page-sub">Download individual CSVs or the full dataset as a zip for AWS import.</div>

      {/* Delta export -- steward copies only */}
      {!isMaster && stewardIdentity && (
        <div className="card" style={{ marginBottom:20, borderLeft:'3px solid var(--accent)' }}>
          <div className="card-title">
            <span style={{ width:3, height:14, borderRadius:2,
              background:'var(--accent)', display:'inline-block', marginRight:8 }}/>
            Delta export
            <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
              color:'var(--accent)', background:'var(--accent-tint)',
              border:'1px solid var(--accent-border)',
              borderRadius:3, padding:'1px 6px', marginLeft:8 }}>
              STEWARD
            </span>
          </div>
          {!baseSnapshot ? (
            <div style={{ fontSize:12, color:'var(--amber)', padding:'8px 12px',
              background:'var(--amber-bg)', borderRadius:'var(--radius)' }}>
              No base snapshot found. Re-import from a master JSON file to enable delta export.
            </div>
          ) : (
            <>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10 }}>
                Exports only your changes since the last master import as a JSON delta file
                for the master steward to review and merge.
              </div>
              <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)',
                marginBottom:12 }}>
                Base version: <span style={{ color:'var(--accent)' }}>{loadBaseVersion() || 'unknown'}</span>
              </div>
              <button className="btn btn-primary" onClick={handleExportDelta}
                disabled={exportingDelta}>
                <Icon.Download/>
                {exportingDelta ? 'Preparing...' : 'Export my delta'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Master JSON export -- master copy only */}
      {isMaster && (
        <div className="card" style={{ marginBottom:20,
          borderLeft:'3px solid #f5a623' }}>
          <div className="card-title">
            <span style={{ width:3, height:14, borderRadius:2,
              background:'var(--amber)', display:'inline-block', marginRight:8 }}/>
            Master export
            <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
              color:'var(--amber)', background:'rgba(245,166,35,0.12)',
              border:'1px solid rgba(245,166,35,0.4)',
              borderRadius:3, padding:'1px 6px', marginLeft:8 }}>
              MASTER
            </span>
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10 }}>
            Exports the full dataset as a versioned JSON master file for distribution to stewards.
            Each export increments the version counter.
          </div>
          {baseVersion && (
            <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)',
              marginBottom:10 }}>
              Current version: <span style={{ color:'var(--amber)' }}>{baseVersion}</span>
            </div>
          )}
          <button className="btn btn-primary" onClick={handleExportMaster}
            disabled={exportingMaster}
            style={{ background:'var(--amber)', borderColor:'var(--amber)', color:'#000' }}>
            <Icon.Download/>
            {exportingMaster ? 'Preparing...' : `Export master JSON${baseVersion ? ` (next: ${nextMasterVersion(baseVersion)})` : ''}`}
          </button>
        </div>
      )}

      {!canEdit && (
        <div style={{ marginBottom:20, padding:'10px 14px', background:'var(--amber-bg)',
          border:'1px solid rgba(245,166,35,0.4)', borderRadius:'var(--radius)',
          fontSize:12, color:'var(--amber)' }}>
          Exports are disabled in read-only mode. Register as a steward to enable exports.
        </div>
      )}

      <div className="card" style={{ marginBottom:20 }}>
        <div className="card-title"><span className="dot"/>Export configuration</div>
        <div className="toggle-row" style={{ borderTop:'none', marginTop:0, paddingTop:0 }}>
          <label className="toggle">
            <input type="checkbox" checked={includeSoftDeleted} onChange={e => setIncludeSoftDeleted(e.target.checked)}/>
            <div className="toggle-track"/><div className="toggle-thumb"/>
          </label>
          <span className="toggle-label">Include soft-deleted records</span>
          <span style={{ marginLeft:'auto' }} className={`badge ${includeSoftDeleted?'badge-amber':'badge-green'}`}>
            {includeSoftDeleted?'all records':'live only'}
          </span>
        </div>
        <div style={{ marginTop:12, padding:'8px 12px', background:'var(--bg)', borderRadius:'var(--radius)',
          fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
          {allTables.length} CSV files - {total.toLocaleString()} total records - bundled as dq_export_YYYYMMDD_HHMMSS.zip
        </div>
        <div style={{ marginTop:12 }}>
          <button className="btn btn-green" onClick={handleExportAll} disabled={exporting || !canEdit}>
            <Icon.Download/>{exporting?'Preparing zip...':`Export all ${allTables.length} tables as zip`}
          </button>
        </div>
      </div>

      {TABLE_GROUPS.map(group => {
        const groupTotal = group.tables.reduce((s,t) => s+(counts[t]||0), 0);
        const isExp = exportingGroup===group.id;
        return (
          <div key={group.id} style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10,
              marginBottom:8, paddingBottom:8, borderBottom:'1px solid var(--border)' }}>
              <div style={{ width:3, height:16, borderRadius:2, background:group.accent }}/>
              <span style={{ fontSize:13, fontWeight:600 }}>{group.label}</span>
              <span style={{ fontSize:11, color:'var(--text3)' }}>{group.tables.length} tables - {groupTotal.toLocaleString()} rows</span>
              <div style={{ marginLeft:'auto' }}>
                <button className="btn btn-ghost" style={{ padding:'2px 7px', fontSize:11 }}
                  onClick={() => handleExportGroup(group)} disabled={isExp || !canEdit}
                  title={`Download ${group.label}`}>
                  <Icon.Download/>
                </button>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
              {group.tables.map(t => (
                <div key={t} style={{ display:'flex', alignItems:'center',
                  padding:'7px 12px', background:'var(--bg2)',
                  border:'1px solid var(--border)', borderLeft:`3px solid ${group.accent}`,
                  borderRadius:'var(--radius)', gap:10 }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text2)', flex:1 }}>{t}.csv</div>
                  <div style={{ fontSize:11, color:'var(--text3)', minWidth:55, textAlign:'right' }}>{counts[t].toLocaleString()} rows</div>
                  <button className="btn btn-ghost" style={{ padding:'2px 7px', fontSize:11 }}
                    onClick={() => exportSingleCSV(t, data, includeSoftDeleted)}
                    disabled={!canEdit} title={`Download ${t}.csv`}>
                    <Icon.Download/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

