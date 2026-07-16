function CdeCriticalityFormPanel({ cdeId, existingRows, preAgencyId, preDirId, preCdsId, onClose, data }) {
  const { upsertRecord, nextPk } = useApp();
  const accent  = TABLE_GROUPS.find(g => g.tables.includes('cde_criticality'))?.accent || 'var(--accent)';

  const cdes     = data?.critical_data_element || [];
  const cdSets   = data?.critical_data_set || [];
  const dirs     = data?.directorate || [];
  const agencies = data?.executive_agency || [];
  const GROUP_ORDER = ['OPS', 'POL', 'REP', 'STRAT'];
  const groups   = useMemo(() =>
    [...(data?.criticality_group || [])].filter(g => !g.retiring_timestamp)
      .sort((a,b) => {
        const ai = GROUP_ORDER.indexOf(a.criticality_group_acronymn);
        const bi = GROUP_ORDER.indexOf(b.criticality_group_acronymn);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return (a.criticality_group_description||'').localeCompare(b.criticality_group_description||'');
      }),
  [data]);
  const levels   = useMemo(() =>
    [...(data?.criticality_level || [])].filter(l => !l.retiring_timestamp)
      .sort((a,b) => (a.criticality_description||'').localeCompare(b.criticality_description||'')),
  [data]);

  const cdeById    = useMemo(() => Object.fromEntries(cdes.map(c  => [c.critical_data_element_id, c])), [cdes]);
  const cdsById    = useMemo(() => Object.fromEntries(cdSets.map(d => [d.critical_data_set_id, d])),    [cdSets]);
  const dirById    = useMemo(() => Object.fromEntries(dirs.map(d   => [d.directorate_id, d])),          [dirs]);
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])),   [agencies]);

  const isEdit = !!cdeId;

  // Cascading filter states for Add
  const [filterAgencyId, setFilterAgencyId] = useState(preAgencyId || null);
  const [filterDirId,    setFilterDirId]    = useState(preDirId    || null);
  const [filterCdsId,    setFilterCdsId]    = useState(preCdsId    || null);
  const [selectedCdeId,  setSelectedCdeId]  = useState(cdeId || null);

  // Level selections: { [criticality_group_id]: criticality_level_id }
  const [levelMap, setLevelMap] = useState(() => {
    const m = {};
    if (existingRows && existingRows.length > 0) {
      for (const r of existingRows) m[r.criticality_group_id] = r.criticality_level_id;
      return m;
    }
    // No existing rows: default all groups to Medium
    const medium = (data?.criticality_level || []).find(l => !l.retiring_timestamp && l.criticality_description === 'Medium');
    if (!medium) return m;
    for (const g of (data?.criticality_group || []).filter(g => !g.retiring_timestamp)) {
      m[g.criticality_group_id] = medium.criticality_level_id;
    }
    return m;
  });
  const [errors, setErrors] = useState({});

  const activeCdeId = isEdit ? cdeId : selectedCdeId;

  // CDEs already fully defined (all groups assigned)
  const fullyDefinedCdes = useMemo(() => new Set(
    Object.entries(
      (data?.cde_criticality || [])
        .filter(r => !r.retiring_timestamp)
        .reduce((m, r) => { m[r.critical_data_element_id] = (m[r.critical_data_element_id]||0)+1; return m; }, {})
    ).filter(([, count]) => count >= groups.length).map(([id]) => parseInt(id))
  ), [data, groups]);

  // Check if selected CDE already has criticalities (for Add only)
  const alreadyDefined = useMemo(() => {
    if (isEdit || !activeCdeId) return false;
    return fullyDefinedCdes.has(activeCdeId);
  }, [isEdit, activeCdeId, fullyDefinedCdes]);

  // Cascading options
  const agencyOpts = useMemo(() =>
    [...agencies].filter(a => !a.retiring_timestamp)
      .sort((a,b) => (a.agency_acronymn||'').localeCompare(b.agency_acronymn||'')),
  [agencies]);

  const dirOpts = useMemo(() =>
    [...dirs].filter(d => !d.retiring_timestamp && d.executive_agency_id === filterAgencyId)
      .sort((a,b) => (a.directorate_name||'').localeCompare(b.directorate_name||'')),
  [dirs, filterAgencyId]);

  const cdsOpts = useMemo(() =>
    [...cdSets].filter(d => !d.retiring_timestamp && d.directorate_id === filterDirId)
      .sort((a,b) => (a.data_set_name||'').localeCompare(b.data_set_name||'')),
  [cdSets, filterDirId]);

  const cdeOpts = useMemo(() =>
    [...cdes].filter(c => !c.retiring_timestamp &&
      c.critical_data_set_id === filterCdsId &&
      !fullyDefinedCdes.has(c.critical_data_element_id))
      .sort((a,b) => (a.source_field_name||'').localeCompare(b.source_field_name||'')),
  [cdes, filterCdsId, fullyDefinedCdes]);

  // Resolve CDE display info (for edit read-only label)
  const cde    = activeCdeId ? cdeById[activeCdeId] : null;
  const cds    = cde ? cdsById[cde.critical_data_set_id] : null;
  const dir    = cds ? dirById[cds.directorate_id] : null;
  const agency = dir ? agencyById[dir.executive_agency_id] : null;

  const inputBase = {
    width:'100%', padding:'7px 10px', fontSize:13,
    background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:'var(--radius)', color:'var(--text)',
    fontFamily:'var(--sans)', outline:'none',
  };

  const handleSave = () => {
    const errs = {};
    if (!activeCdeId) errs['cde'] = 'Required';
    for (const grp of groups) {
      if (!levelMap[grp.criticality_group_id])
        errs[grp.criticality_group_id] = 'Required';
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    // Pre-compute PKs for all groups before any upsert calls.
    // nextPk reads from a stale data snapshot so calling it in a loop returns
    // the same value every time. Call it once and increment manually instead.
    let freeSeq = nextPk('cde_criticality');
    const pkFor = {};
    for (const grp of groups) {
      const gid = grp.criticality_group_id;
      const existing = (data?.cde_criticality || []).find(r =>
        r.critical_data_element_id === activeCdeId &&
        r.criticality_group_id === gid &&
        !r.retiring_timestamp
      );
      pkFor[gid] = existing ? existing.cde_criticality_id : freeSeq++;
    }

    // Upsert one record per group using pre-computed PKs
    for (const grp of groups) {
      upsertRecord('cde_criticality', {
        cde_criticality_id:       pkFor[grp.criticality_group_id],
        critical_data_element_id: activeCdeId,
        criticality_group_id:     grp.criticality_group_id,
        criticality_level_id:     levelMap[grp.criticality_group_id],
        retiring_timestamp:       null,
      });
    }
    onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed', inset:0, zIndex:300, background:'var(--overlay-sm)',
      }}/>
      <div style={{
        position:'fixed', top:0, right:0, bottom:0,
        width:'min(520px, 55vw)',
        background:'var(--bg2)', borderLeft:'1px solid var(--border2)',
        zIndex:400, display:'flex', flexDirection:'column',
        boxShadow:'-4px 0 24px var(--overlay-md)',
        animation:'slideInRight 0.18s ease',
      }}>
        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:accent, marginBottom:3 }}>
              {isEdit ? 'Edit criticality' : 'Add criticality'}
            </div>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>
              CDE Criticality
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSave}
            style={{ padding:'6px 14px', fontSize:12 }}>
            <Icon.Check/> {isEdit ? 'Save' : 'Add'}
          </button>
          <button className="btn btn-ghost" style={{ padding:'6px 8px' }} onClick={onClose}>
            <Icon.X/>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:'16px 18px' }}>

          {/* CDE selector (Add) or read-only label (Edit) */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600,
              color: errors['cde'] ? 'var(--red)' : 'var(--text2)',
              marginBottom:4 }}>
              Critical Data Element
              <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>
            </label>
            {isEdit ? (
              <div style={{ padding:'7px 10px', background:'var(--bg3)',
                border:'1px solid var(--border)', borderRadius:'var(--radius)',
                fontSize:12, fontFamily:'var(--mono)', color:'var(--text)' }}>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>
                  {[agency?.agency_acronymn, cds?.data_set_name].filter(Boolean).join(' - ')}
                </div>
                <div style={{ wordBreak:'break-all' }}>{cde?.source_field_name}</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {/* Agency */}
                <select value={filterAgencyId ?? ''} style={{ ...inputBase, cursor:'pointer' }}
                  onChange={e => {
                    const aid = e.target.value ? parseInt(e.target.value) : null;
                    setFilterAgencyId(aid);
                    setFilterDirId(null);
                    setFilterCdsId(null);
                    setSelectedCdeId(null);
                    setErrors(prev => ({ ...prev, cde: null }));
                  }}>
                  <option value="">-- select agency --</option>
                  {agencyOpts.map(a => (
                    <option key={a.executive_agency_id} value={a.executive_agency_id}>
                      {a.agency_acronymn} - {a.agency_name}
                    </option>
                  ))}
                </select>
                {/* Directorate */}
                <select value={filterDirId ?? ''} disabled={!filterAgencyId}
                  style={{ ...inputBase, cursor: filterAgencyId ? 'pointer' : 'not-allowed',
                    opacity: filterAgencyId ? 1 : 0.5 }}
                  onChange={e => {
                    const did = e.target.value ? parseInt(e.target.value) : null;
                    setFilterDirId(did);
                    setFilterCdsId(null);
                    setSelectedCdeId(null);
                  }}>
                  <option value="">{filterAgencyId ? '-- select directorate --' : '-- select agency first --'}</option>
                  {dirOpts.map(d => (
                    <option key={d.directorate_id} value={d.directorate_id}>{d.directorate_name}</option>
                  ))}
                </select>
                {/* Critical Data Set */}
                {filterDirId && cdsOpts.length === 0 ? (
                  <div style={{ padding:'8px 12px',
                    background:'var(--bg3)', border:'1px solid var(--amber)',
                    borderRadius:'var(--radius)', fontSize:12,
                    color:'var(--amber)', display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ width:14, height:14, flexShrink:0 }}><Icon.Warning/></span>
                    No data sets found in this directorate.
                  </div>
                ) : (
                  <select value={filterCdsId ?? ''} disabled={!filterDirId}
                    style={{ ...inputBase, cursor: filterDirId ? 'pointer' : 'not-allowed',
                      opacity: filterDirId ? 1 : 0.5 }}
                    onChange={e => {
                      const cid = e.target.value ? parseInt(e.target.value) : null;
                      setFilterCdsId(cid);
                      setSelectedCdeId(null);
                    }}>
                    <option value="">{filterDirId ? '-- select data set --' : '-- select directorate first --'}</option>
                    {cdsOpts.map(d => (
                      <option key={d.critical_data_set_id} value={d.critical_data_set_id}>{d.data_set_name}</option>
                    ))}
                  </select>
                )}
                {/* CDE */}
                {filterCdsId && cdeOpts.length === 0 ? (
                  <div style={{ padding:'8px 12px',
                    background:'var(--bg3)', border:'1px solid var(--amber)',
                    borderRadius:'var(--radius)', fontSize:12,
                    color:'var(--amber)', display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ width:14, height:14, flexShrink:0 }}><Icon.Warning/></span>
                    {(data?.critical_data_element || []).some(c =>
                      !c.retiring_timestamp && c.critical_data_set_id === filterCdsId
                    )
                      ? 'All CDEs in this data set already have criticalities defined.'
                      : 'No CDEs found in this data set.'
                    }
                  </div>
                ) : (
                  <select value={selectedCdeId ?? ''} disabled={!filterCdsId}
                    style={{ ...inputBase, cursor: filterCdsId ? 'pointer' : 'not-allowed',
                      opacity: filterCdsId ? 1 : 0.5,
                      borderColor: errors['cde'] ? 'var(--red)' : 'var(--border)' }}
                    onChange={e => {
                      setSelectedCdeId(e.target.value ? parseInt(e.target.value) : null);
                      setErrors(prev => ({ ...prev, cde: null }));
                    }}>
                    <option value="">{filterCdsId ? '-- select field --' : '-- select data set first --'}</option>
                    {cdeOpts.map(c => (
                      <option key={c.critical_data_element_id} value={c.critical_data_element_id}>
                        {c.source_field_name}
                      </option>
                    ))}
                  </select>
                )}
                {errors['cde'] && (
                  <div style={{ fontSize:11, color:'var(--red)', marginTop:3 }}>{errors['cde']}</div>
                )}
              </div>
            )}
          </div>

          {/* One level dropdown per criticality group */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {groups.map(grp => {
              const gid = grp.criticality_group_id;
              const err = errors[gid];
              return (
                <div key={gid}>
                  <label style={{ display:'block', fontSize:11, fontWeight:600,
                    color: err ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
                    {grp.criticality_group_description}
                    {grp.criticality_group_acronymn &&
                      <span style={{ fontFamily:'var(--mono)', fontSize:10,
                        color:accent, marginLeft:6 }}>
                        ({grp.criticality_group_acronymn})
                      </span>
                    }
                    <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>
                  </label>
                  <select value={levelMap[gid] ?? ''}
                    style={{ ...inputBase, cursor:'pointer',
                      borderColor: err ? 'var(--red)' : 'var(--border)' }}
                    onChange={e => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setLevelMap(prev => ({ ...prev, [gid]: val }));
                      setErrors(prev => ({ ...prev, [gid]: null }));
                    }}>
                    <option value="">-- select level --</option>
                    {levels.map(l => (
                      <option key={l.criticality_level_id} value={l.criticality_level_id}>
                        {l.criticality_description}
                      </option>
                    ))}
                  </select>
                  {err && (
                    <div style={{ fontSize:11, color:'var(--red)', marginTop:3 }}>{err}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ===============================================================================
// CDE CRITICALITY VIEW -- one row per CDE, criticality boxes inline
// ===============================================================================
function CdeCriticalityView() {
  const { data, retireRecord, restoreRecord, openCritForm, canEdit } = useApp();
  const dp = !canEdit ? { style:{ opacity:0.35, cursor:'not-allowed', pointerEvents:'none' }, title:'Set your steward identity in Settings to make changes' } : {};

  const [search,      setSearch]      = useState('');
  const [showRetired, setShowRetired] = useState(false);

  const openAdd  = (preAgencyId, preDirId, preCdsId) => openCritForm(0, null, preAgencyId, preDirId, preCdsId);
  const openEdit = (cdeId, critRows) => openCritForm(cdeId, critRows, null, null, null);

  const rows     = data?.cde_criticality || [];
  const cdes     = data?.critical_data_element || [];
  const cdSets   = data?.critical_data_set || [];
  const dirs     = data?.directorate || [];
  const agencies = data?.executive_agency || [];
  const groups   = data?.criticality_group || [];
  const levels   = data?.criticality_level || [];
  const profiling  = data?.field_profiling || [];
  const allocs     = data?.data_quality_rule_allocation || [];
  const accent     = TABLE_GROUPS.find(g => g.tables.includes('cde_criticality'))?.accent || 'var(--accent)';
  const physAccent = 'var(--purple)';

  const cdeById    = useMemo(() => Object.fromEntries(cdes.map(c  => [c.critical_data_element_id, c])),  [cdes]);
  const cdsById    = useMemo(() => Object.fromEntries(cdSets.map(d => [d.critical_data_set_id, d])),     [cdSets]);
  const dirById    = useMemo(() => Object.fromEntries(dirs.map(d   => [d.directorate_id, d])),           [dirs]);
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])),    [agencies]);
  const groupById  = useMemo(() => Object.fromEntries(groups.map(g  => [g.criticality_group_id, g])),    [groups]);
  const levelById  = useMemo(() => Object.fromEntries(levels.map(l  => [l.criticality_level_id, l])),    [levels]);

  const allocCountByCde = useMemo(() => {
    const m = {};
    for (const a of allocs) {
      if (!a.retiring_timestamp)
        m[a.critical_data_element_id] = (m[a.critical_data_element_id] || 0) + 1;
    }
    return m;
  }, [allocs]);

  const profilingByKey = useMemo(() => {
    const m = {};
    for (const p of profiling) {
      if (!p.retiring_timestamp)
        m[`${p.source_database_name}|||${p.source_table_name}|||${p.source_field_name}`] = p;
    }
    return m;
  }, [profiling]);

  const liveCount    = rows.filter(r => !r.retiring_timestamp).length;
  const retiredCount = rows.filter(r =>  r.retiring_timestamp).length;

  // Group by agency -> data set -> CDE, sorted agency A->Z, cds A->Z, field A->Z
  const grouped = useMemo(() => {
    const visible = showRetired ? rows : rows.filter(r => !r.retiring_timestamp);

    // Build per-CDE map first
    const cdeMap = {};
    for (const row of visible) {
      const cid = row.critical_data_element_id;
      if (!cdeMap[cid]) cdeMap[cid] = [];
      cdeMap[cid].push(row);
    }

    // Build agency -> cds -> cde structure
    const agencyMap = {};
    for (const [cid, critRows] of Object.entries(cdeMap)) {
      const cde    = cdeById[parseInt(cid)];
      const cds    = cde ? cdsById[cde.critical_data_set_id] : null;
      const dir    = cds ? dirById[cds.directorate_id] : null;
      const agency = dir ? agencyById[dir.executive_agency_id] : null;
      const aid    = agency?.executive_agency_id ?? '__unknown__';
      const dsid   = cds?.critical_data_set_id  ?? '__unknown__';
      if (!agencyMap[aid]) agencyMap[aid] = { agency, cdsMap: {} };
      if (!agencyMap[aid].cdsMap[dsid]) agencyMap[aid].cdsMap[dsid] = { cds, cdes: [] };
      agencyMap[aid].cdsMap[dsid].cdes.push({ cdeId: parseInt(cid), cde, critRows });
    }

    return Object.values(agencyMap)
      .sort((a, b) => (a.agency?.agency_acronymn||'ZZZ').localeCompare(b.agency?.agency_acronymn||'ZZZ'))
      .map(({ agency, cdsMap }) => ({
        agency,
        dataSets: Object.values(cdsMap)
          .sort((a, b) => (a.cds?.data_set_name||'').localeCompare(b.cds?.data_set_name||''))
          .map(({ cds, cdes }) => ({
            cds,
            cdes: [...cdes].sort((a, b) =>
              (a.cde?.source_field_name||'').localeCompare(b.cde?.source_field_name||'')
            ),
          })),
      }))
      .filter(({ agency, dataSets }) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          (agency?.agency_acronymn || '').toLowerCase().includes(q) ||
          (agency?.agency_name     || '').toLowerCase().includes(q) ||
          dataSets.some(({ cds, cdes }) =>
            (cds?.data_set_name || '').toLowerCase().includes(q) ||
            cdes.some(({ cde }) => (cde?.source_field_name || '').toLowerCase().includes(q))
          )
        );
      });
  }, [rows, showRetired, search, cdeById, cdsById, dirById, agencyById]);

  const agencyCount = grouped.length;

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            CDE Criticality
          </div>
          <div className="page-sub">
            {agencyCount} agenc{agencyCount!==1?'ies':'y'} - {liveCount} live records
            {retiredCount > 0 && ` - ${retiredCount} retired`}
          </div>
        </div>
        <button {...dp} className="btn btn-primary" style={{ marginTop:4 }} onClick={openAdd}>
          <Icon.Plus/> Add record
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ flex:1, position:'relative' }}>
          <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
            color:'var(--text3)', width:14, height:14, pointerEvents:'none' }}>
            <Icon.Search/>
          </div>
          <input className="table-search" style={{ paddingLeft:32 }}
            placeholder="Search by field, data set or agency..."
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {retiredCount > 0 && (
          <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer',
            whiteSpace:'nowrap', fontSize:12, color:'var(--text3)' }}>
            <div className="toggle" style={{ width:30, height:16 }}>
              <input type="checkbox" checked={showRetired}
                onChange={e => setShowRetired(e.target.checked)}/>
              <div className="toggle-track"/>
              <div className="toggle-thumb" style={{ width:10, height:10, top:3, left:3 }}/>
            </div>
            Show retired
          </label>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="status-row status-info">No records match the current filter.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {grouped.map(({ agency, dataSets }) => (
            <div key={agency?.executive_agency_id ?? 'unknown'} style={{
              background:'var(--bg2)',
              border:'1px solid var(--border)',
              borderLeft:`3px solid ${accent}`,
              borderRadius:'var(--radius-lg)',
              padding:'12px 14px',
            }}>
              {/* Agency header */}
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:10 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                  {agency?.agency_acronymn || 'Unknown agency'}
                </span>
                {agency?.agency_name &&
                  <span style={{ fontSize:11, color:'var(--text3)' }}>{agency.agency_name}</span>
                }
                <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text3)',
                  fontFamily:'var(--mono)' }}>
                  {dataSets.reduce((s, ds) => s + ds.cdes.length, 0)} CDE{dataSets.reduce((s, ds) => s + ds.cdes.length, 0) !== 1 ? 's' : ''}
                </span>
                <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'2px 8px', marginLeft:6 }}
                  onClick={() => openAdd(agency?.executive_agency_id, null, null)}
                  title={`Add criticality for ${agency?.agency_acronymn || 'this agency'}`}>
                  <Icon.Plus/>
                </button>
              </div>

              {/* Data set groups */}
              {dataSets.map(({ cds, cdes }, dsIdx) => (
                <div key={cds?.critical_data_set_id ?? dsIdx} style={{
                  marginBottom: dsIdx < dataSets.length - 1 ? 12 : 0,
                  paddingBottom: dsIdx < dataSets.length - 1 ? 12 : 0,
                  borderBottom: dsIdx < dataSets.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  {/* Data set sub-header */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:6 }}>
                    <div style={{ width:2, height:14, background:'var(--border2)', flexShrink:0, marginTop:3 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:500, color:'var(--text2)' }}>
                        {cds?.data_set_name || 'Unknown data set'}
                      </div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                        {cdes.length} CDE{cdes.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'2px 6px', flexShrink:0 }}
                      onClick={() => {
                        const dirId = cds?.directorate_id ?? null;
                        openAdd(agency?.executive_agency_id, dirId, cds?.critical_data_set_id);
                      }}
                      title={`Add criticality for ${cds?.data_set_name || 'this data set'}`}>
                      <Icon.Plus/>
                    </button>
                  </div>

                  {/* CDE rows */}
                  <div style={{ display:'flex', flexDirection:'column', gap:4, paddingLeft:10 }}>
                    {cdes.map(({ cdeId, cde, critRows }) => {
                      const profKey    = `${cde?.source_database_name}|||${cde?.source_table_name}|||${cde?.source_field_name}`;
                      const hasProfile = !!profilingByKey[profKey];
                      const ruleCount  = allocCountByCde[cdeId] || 0;
                      return (
                      <div key={cdeId} style={{
                        padding:'7px 10px',
                        background:'var(--bg3)',
                        border:'1px solid var(--border)',
                        borderRadius:'var(--radius)',
                      }}>
                        {/* Top row: CDE field name + table + badges + edit button */}
                        <div style={{ display:'flex', alignItems:'center',
                          justifyContent:'space-between', marginBottom:5, gap:8 }}>
                          <div style={{ display:'flex', alignItems:'baseline',
                            gap:6, flex:1, minWidth:0 }}>
                            <span style={{ fontSize:12, fontFamily:'var(--mono)',
                              fontWeight:500, color:'var(--text)', wordBreak:'break-all' }}>
                              {cde?.source_field_name || `CDE #${cdeId}`}
                            </span>
                            {(cde?.source_database_name || cde?.source_table_name) && (
                              <span style={{ fontSize:10, fontFamily:'var(--mono)',
                                color:'var(--text3)', whiteSpace:'nowrap', flexShrink:0 }}>
                                {[cde?.source_database_name, cde?.source_table_name]
                                  .filter(Boolean).join('.')}
                              </span>
                            )}
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
                            {ruleCount > 0 && (
                              <span title={`${ruleCount} rule allocation${ruleCount !== 1 ? 's' : ''}`}
                                style={{ fontSize:9, fontFamily:'var(--mono)',
                                  fontWeight:600, color:accent,
                                  background:`${accent}15`,
                                  border:`1px solid ${accent}35`,
                                  borderRadius:3, padding:'1px 6px',
                                  whiteSpace:'nowrap' }}>
                                {ruleCount} rule{ruleCount !== 1 ? 's' : ''}
                              </span>
                            )}
                            {hasProfile && (
                              <span title={`Profiled ${profilingByKey[profKey].profiled_at}`}
                                style={{ fontSize:9, fontFamily:'var(--mono)',
                                  fontWeight:600, color:physAccent,
                                  background:`${physAccent}15`,
                                  border:`1px solid ${physAccent}40`,
                                  borderRadius:3, padding:'1px 6px',
                                  whiteSpace:'nowrap' }}>
                                profiled
                              </span>
                            )}
                            <button {...dp} className="btn btn-ghost"
                              style={{ fontSize:10, padding:'2px 6px' }}
                              onClick={() => openEdit(cdeId, critRows)}
                              title="Edit criticality levels">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </div>
                        </div>

                        {/* Bottom row: criticality boxes */}
                        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                          {[...critRows]
                            .sort((a,b) =>
                              (groupById[a.criticality_group_id]?.criticality_group_acronymn||'')
                                .localeCompare(groupById[b.criticality_group_id]?.criticality_group_acronymn||'')
                            )
                            .map(row => {
                              const pk        = row.cde_criticality_id;
                              const isRetired = !!row.retiring_timestamp;
                              const grp       = groupById[row.criticality_group_id];
                              const lvl       = levelById[row.criticality_level_id];
                              const tooltip   = `${grp?.criticality_group_description||''}: ${lvl?.criticality_description||''}`;
                              return (
                                <div key={pk} title={tooltip} style={{
                                  display:'flex', flexDirection:'column', alignItems:'center',
                                  gap:1, padding:'3px 8px',
                                  background: isRetired ? 'var(--bg)' : 'var(--bg2)',
                                  border:`1px solid ${isRetired ? 'var(--border)' : accent}30`,
                                  borderRadius:'var(--radius)',
                                  minWidth:48, opacity: isRetired ? 0.5 : 1,
                                  position:'relative',
                                }}>
                                  <span style={{ fontSize:8, fontWeight:600,
                                    fontFamily:'var(--mono)', color:accent,
                                    letterSpacing:'0.06em', textTransform:'uppercase' }}>
                                    {grp?.criticality_group_acronymn || `#${row.criticality_group_id}`}
                                  </span>
                                  <span style={{ fontSize:10, fontWeight:500,
                                    color:'var(--text)', whiteSpace:'nowrap' }}>
                                    {lvl?.criticality_description ?? '--'}
                                  </span>
                                  <div style={{ position:'absolute', top:1, right:1,
                                    display:'flex', opacity:0 }}
                                    onMouseEnter={e => e.currentTarget.style.opacity='1'}
                                    onMouseLeave={e => e.currentTarget.style.opacity='0'}>
                                    {isRetired ? (
                                      <button {...dp} className="btn btn-ghost" style={{ padding:'1px 2px', fontSize:8 }}
                                        onClick={() => canEdit && restoreRecord('cde_criticality', pk)}>
                                        <Icon.Eye/>
                                      </button>
                                    ) : (
                                      <button {...dp} className="btn btn-ghost" style={{ padding:'1px 2px', fontSize:8 }}
                                        onClick={() => canEdit && retireRecord('cde_criticality', pk)}>
                                        <Icon.EyeOff/>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// RULE ALLOCATION FORM PANEL -- add/edit a single rule allocation
// ===============================================================================
