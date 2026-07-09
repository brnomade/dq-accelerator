function CriticalDataElementView({ initialSearch }) {
  const { data, upsertRecord, retireRecord, restoreRecord, openCdeForm, openForm, nextPk, canEdit, stewardIdentity, isMaster, openSqlPanel } = useApp();
  const dp = !canEdit ? { style:{ opacity:0.35, cursor:'not-allowed', pointerEvents:'none' }, title:'Set your steward identity in Settings to make changes' } : {};

  const [search,      setSearch]      = useState(initialSearch || '');
  const [showRetired, setShowRetired] = useState(false);
  const [expanded,    setExpanded]    = useState({});
  const [allocPanel,  setAllocPanel]  = useState(null); // { record, isEdit, cdeId }

  const myStewardCdsIds = useMemo(() => getMyStewardCdsIds(data, stewardIdentity), [data, stewardIdentity]);

  const [myDataOnly, setMyDataOnly] = useState(() => loadMyDataPref('moj_dq_cde_mydata_v1', isMaster));
  useEffect(() => { saveMyDataPref('moj_dq_cde_mydata_v1', myDataOnly); }, [myDataOnly]);

  const rows          = data?.critical_data_element || [];
  const cdSets        = data?.critical_data_set || [];
  const dirs          = data?.directorate || [];
  const agencies      = data?.executive_agency || [];
  const allocs        = data?.data_quality_rule_allocation || [];
  const profiling     = data?.field_profiling || [];
  const criticalities = data?.cde_criticality || [];
  const accent    = TABLE_GROUPS.find(g => g.tables.includes('critical_data_element'))?.accent || 'var(--accent)';
  const physAccent = 'var(--purple)';

  const cdsById    = useMemo(() => Object.fromEntries(cdSets.map(d => [d.critical_data_set_id, d])),  [cdSets]);
  const dirById    = useMemo(() => Object.fromEntries(dirs.map(d   => [d.directorate_id, d])),        [dirs]);
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])), [agencies]);

  // Directorates grouped by agency -- used to pre-fill new CDS form when agency has exactly one directorate
  const dirsByAgencyId = useMemo(() => {
    const m = {};
    for (const d of dirs) {
      if (!d.retiring_timestamp) {
        if (!m[d.executive_agency_id]) m[d.executive_agency_id] = [];
        m[d.executive_agency_id].push(d);
      }
    }
    return m;
  }, [dirs]);

  const profilingByKey = useMemo(() => {
    const m = {};
    for (const p of profiling) {
      if (!p.retiring_timestamp)
        m[`${p.source_database_name}|||${p.source_table_name}|||${p.source_field_name}`] = p;
    }
    return m;
  }, [profiling]);

  // Count of profiling records per db|||table (for table-level field count when profiled)
  const profilingCountByTable = useMemo(() => {
    const m = {};
    for (const p of profiling) {
      if (!p.retiring_timestamp) {
        const k = `${p.source_database_name}|||${p.source_table_name}`;
        m[k] = (m[k] || 0) + 1;
      }
    }
    return m;
  }, [profiling]);

  const allocCountByCde = useMemo(() => {
    const m = {};
    for (const a of allocs) {
      if (!a.retiring_timestamp)
        m[a.critical_data_element_id] = (m[a.critical_data_element_id] || 0) + 1;
    }
    return m;
  }, [allocs]);

  // Set of distinct rule IDs per CDE (for de-duplicated rollup counts)
  const ruleIdsByCde = useMemo(() => {
    const m = {};
    for (const a of allocs) {
      if (!a.retiring_timestamp) {
        if (!m[a.critical_data_element_id]) m[a.critical_data_element_id] = new Set();
        m[a.critical_data_element_id].add(a.data_quality_rule_id);
      }
    }
    return m;
  }, [allocs]);

  const critCountByCde = useMemo(() => {
    const m = {};
    for (const c of criticalities) {
      if (!c.retiring_timestamp)
        m[c.critical_data_element_id] = (m[c.critical_data_element_id] || 0) + 1;
    }
    return m;
  }, [criticalities]);

  const critGroupsSorted = useMemo(() =>
    (data?.criticality_group || [])
      .filter(g => !g.retiring_timestamp)
      .sort((a,b) => a.criticality_group_id - b.criticality_group_id),
  [data]);

  const critLevelsById = useMemo(() =>
    Object.fromEntries((data?.criticality_level || []).map(l => [l.criticality_level_id, l])),
  [data]);

  // map: cde_id -> { group_id -> criticality_level_id }
  const critsByCdeId = useMemo(() => {
    const m = {};
    for (const c of criticalities) {
      if (!c.retiring_timestamp) {
        if (!m[c.critical_data_element_id]) m[c.critical_data_element_id] = {};
        m[c.critical_data_element_id][c.criticality_group_id] = c.criticality_level_id;
      }
    }
    return m;
  }, [criticalities]);


  const allocsByCdeId = useMemo(() => {
    const m = {};
    for (const a of allocs) {
      if (!a.retiring_timestamp) {
        if (!m[a.critical_data_element_id]) m[a.critical_data_element_id] = [];
        m[a.critical_data_element_id].push(a);
      }
    }
    return m;
  }, [allocs]);

  const rulesById = useMemo(() =>
    Object.fromEntries((data?.data_quality_rule || []).map(r => [r.data_quality_rule_id, r])),
  [data]);

  const dimensionsById = useMemo(() =>
    Object.fromEntries((data?.quality_dimension || []).map(d => [d.quality_dimension_id, d])),
  [data]);

  const liveCount    = rows.filter(r => !r.retiring_timestamp).length;
  const retiredCount = rows.filter(r =>  r.retiring_timestamp).length;

  const toggleKey = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const openSql = (mode, rule, alloc, cde, cds, agency) => {
    const template = mode === 'sample' ? rule.sql_code_sample : rule.sql_code;
    const sql = composeSql(template, cde, mode);
    const snapSubstituted = cde?.source_snapshot_filter
      ? substituteCdeTokens(cde.source_snapshot_filter, cde) : null;
    openSqlPanel({
      mode,
      sql,
      ruleName:       rule.rule_name,
      fieldName:      cde?.source_field_name || '',
      cdsName:        cds?.data_set_name || '',
      agencyAcronym:  agency?.agency_acronymn || '',
      snapshotFilter: snapSubstituted,
    });
  };

  const handleAllocSave = (saved) => {
    upsertRecord('data_quality_rule_allocation', saved);
    const cdeId = allocPanel?.cdeId;
    setAllocPanel(null);
    if (cdeId) setExpanded(prev => ({ ...prev, [`cde_${cdeId}`]: true }));
  };

  const blankCde = () => ({
    critical_data_element_id: nextPk('critical_data_element'),
    critical_data_set_id: null, source_platform_name: null,
    source_system_name: null, source_database_name: null,
    source_table_name: null, source_field_name: null,
    source_snapshot_filter: null, data_element_definition: null,
    data_element_explanation: null, retiring_timestamp: null,
  });

  const blankCds = (preDirId, preAgencyId) => ({
    critical_data_set_id: nextPk('critical_data_set'),
    directorate_id: preDirId || null,
    __preAgencyId: preAgencyId || null,
    data_set_name: null,
    data_set_description: null,
    data_set_subdivision: null,
    retiring_timestamp: null,
  });

  const openAddCde       = ()                     => openCdeForm(blankCde(), false, null,  null, null);
  const openAddCdeForCds = (cdsId)                => openCdeForm(blankCde(), false, cdsId, null, null);
  const openAddCdeForTbl = (cdsId, tbl, db, platform, system, snapshot) => {
    const blank = blankCde();
    if (platform) blank.source_platform_name   = platform;
    if (system)   blank.source_system_name     = system;
    if (snapshot) blank.source_snapshot_filter = snapshot;
    openCdeForm(blank, false, cdsId, tbl, db);
  };
  const openEditCde      = (row)                  => openCdeForm({ ...row },  true,  null,  null, null);
  const openAddDataSet   = (preDirId, preAgId)    => openForm('critical_data_set', blankCds(preDirId, preAgId));

  // CDS-first hierarchy: agency -> data set -> table -> [cde]
  // Anchoring to CDSs (not CDEs) ensures newly created empty data sets appear immediately.
  const grouped = useMemo(() => {
    const visibleCdes  = showRetired ? rows : rows.filter(r => !r.retiring_timestamp);
    const activeCdSets = cdSets.filter(c => !c.retiring_timestamp);

    // Index CDEs by CDS id
    const cdesByCdsId = {};
    for (const cde of visibleCdes) {
      const dsid = cde.critical_data_set_id ?? '__unknown__';
      if (!cdesByCdsId[dsid]) cdesByCdsId[dsid] = [];
      cdesByCdsId[dsid].push(cde);
    }

    // Seed every active agency so those with zero CDSs still appear in the hierarchy
    const agencyMap = {};
    for (const ag of agencies.filter(a => !a.retiring_timestamp)) {
      const aid = String(ag.executive_agency_id);
      if (!agencyMap[aid]) agencyMap[aid] = { agency: ag, cdsList: [] };
    }

    // Group CDSs by agency
    for (const cds of activeCdSets) {
      const dir    = dirById[cds.directorate_id];
      const agency = dir ? agencyById[dir.executive_agency_id] : null;
      const aid    = String(agency?.executive_agency_id ?? '__unknown__');
      if (!agencyMap[aid]) agencyMap[aid] = { agency, cdsList: [] };
      agencyMap[aid].cdsList.push(cds);
    }

    // Bucket CDEs whose CDS is unknown/missing under __unknown__ agency
    const hasOrphans = visibleCdes.some(c => !c.critical_data_set_id || !cdsById[c.critical_data_set_id]);
    if (hasOrphans && !agencyMap['__unknown__']) agencyMap['__unknown__'] = { agency: null, cdsList: [] };

    return Object.entries(agencyMap)
      .sort(([,a],[,b]) => (a.agency?.agency_acronymn||'ZZZ').localeCompare(b.agency?.agency_acronymn||'ZZZ'))
      .map(([aid, { agency, cdsList }]) => {
        let dataSets = cdsList
          .filter(cds => !myDataOnly || !myStewardCdsIds || myStewardCdsIds.has(cds.critical_data_set_id))
          .sort((a,b) => (a.data_set_name||'').localeCompare(b.data_set_name||''))
          .map(cds => {
            const cdesForCds     = cdesByCdsId[cds.critical_data_set_id] || [];
            const liveCdesForCds = cdesForCds.filter(c => !c.retiring_timestamp);
            // Distinct rules: collect rule IDs from all live CDEs in this data set
            const cdsRuleSet = new Set();
            for (const c of liveCdesForCds) {
              const ids = ruleIdsByCde[c.critical_data_element_id];
              if (ids) for (const id of ids) cdsRuleSet.add(id);
            }
            const cdsProfiledCount = liveCdesForCds.filter(c => {
              const key = `${c.source_database_name}|||${c.source_table_name}|||${c.source_field_name}`;
              return !!profilingByKey[key];
            }).length;
            const cdsCritCount = liveCdesForCds.reduce((s, c) => s + (critCountByCde[c.critical_data_element_id] || 0), 0);
            const tableMap = {};
            for (const cde of cdesForCds) {
              const tbl = cde.source_table_name || '__unknown__';
              if (!tableMap[tbl]) tableMap[tbl] = [];
              tableMap[tbl].push(cde);
            }
            const cdsFieldCount = Object.entries(tableMap).reduce((sum, [tblName, tcdes]) => {
              const tdb = tcdes[0]?.source_database_name || null;
              const tpc = profilingCountByTable[`${tdb}|||${tblName}`] || 0;
              return sum + (tpc > 0 ? tpc : new Set(tcdes.map(c => c.source_field_name).filter(Boolean)).size);
            }, 0);
            const cdsMetricsCount = liveCdesForCds.reduce((s, c) => s + (allocCountByCde[c.critical_data_element_id] || 0), 0);
            return {
              cds,
              cdsKey: String(cds.critical_data_set_id),
              tables: Object.entries(tableMap)
                .sort(([a],[b]) => a.localeCompare(b))
                .map(([tableName, cdes]) => ({
                  tableName,
                  tableKey: `${cds.critical_data_set_id}_${tableName}`,
                  cdes: [...cdes].sort((a,b) => (a.source_field_name||'').localeCompare(b.source_field_name||'')),
                })),
              cdsRuleSet,
              cdsRulesCount:    cdsRuleSet.size,
              cdsProfiledCount,
              cdsFieldCount,
              cdsCritCount,
              cdsMetricsCount,
            };
          });

        // Orphaned CDEs appear as an unnamed bucket at the end
        if (aid === '__unknown__' && (cdesByCdsId['__unknown__'] || []).length > 0) {
          const tableMap = {};
          for (const cde of cdesByCdsId['__unknown__']) {
            const tbl = cde.source_table_name || '__unknown__';
            if (!tableMap[tbl]) tableMap[tbl] = [];
            tableMap[tbl].push(cde);
          }
          dataSets.push({
            cds: null,
            cdsKey: '__unknown__',
            tables: Object.entries(tableMap)
              .sort(([a],[b]) => a.localeCompare(b))
              .map(([tableName, cdes]) => ({
                tableName,
                tableKey: `__unknown___${tableName}`,
                cdes: [...cdes].sort((a,b) => (a.source_field_name||'').localeCompare(b.source_field_name||'')),
              })),
          });
        }

        const totalCdes     = dataSets.reduce((s, ds) => s + ds.tables.reduce((t, tb) => t + tb.cdes.length, 0), 0);
        const totalTables   = dataSets.reduce((s, ds) => s + ds.tables.length, 0);
        const totalProfiled = dataSets.reduce((s, ds) => s + (ds.cdsProfiledCount || 0), 0);
        const totalFields   = dataSets.reduce((s, ds) => s + (ds.cdsFieldCount   || 0), 0);
        const totalCrit     = dataSets.reduce((s, ds) => s + (ds.cdsCritCount || 0), 0);
        // Distinct rules across all CDSs in this agency (merge the per-CDS sets)
        const agRuleSet = new Set();
        for (const ds of dataSets) if (ds.cdsRuleSet) for (const id of ds.cdsRuleSet) agRuleSet.add(id);
        const totalRules   = agRuleSet.size;
        const totalMetrics = dataSets.reduce((s, ds) => s + (ds.cdsMetricsCount || 0), 0);
        return { agency, agencyKey: aid, dataSets, totalCdes, totalTables, totalProfiled, totalFields, totalRules, totalCrit, totalMetrics };
      })
      .filter(({ agency, dataSets }) => {
        if (myDataOnly && myStewardCdsIds && dataSets.length === 0) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          (agency?.agency_acronymn || '').toLowerCase().includes(q) ||
          (agency?.agency_name     || '').toLowerCase().includes(q) ||
          dataSets.some(({ cds, tables }) =>
            (cds?.data_set_name || '').toLowerCase().includes(q) ||
            tables.some(({ tableName, cdes }) =>
              tableName.toLowerCase().includes(q) ||
              cdes.some(c =>
                (c.source_field_name || '').toLowerCase().includes(q) ||
                (c.source_database_name || '').toLowerCase().includes(q)
              )
            )
          )
        );
      });
  }, [rows, showRetired, search, cdSets, cdsById, dirById, agencyById, ruleIdsByCde, critCountByCde, profilingByKey, profilingCountByTable, myDataOnly, myStewardCdsIds, allocCountByCde]);

  const missingFilter = (cde) => !cde.source_snapshot_filter;

  return (
    <>
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            Data and Stewardship
          </div>
          <div className="page-sub">
            {grouped.length} agenc{grouped.length!==1?'ies':'y'} &middot; {liveCount} live CDE{liveCount!==1?'s':''}
            {retiredCount > 0 && ` - ${retiredCount} retired`}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button {...dp} className="btn btn-primary" title="Add new CDS" onClick={() => openAddDataSet(null)}>
            <Icon.Plus/> CDS
          </button>
          <button {...dp} className="btn btn-primary" title="Add new CDE" onClick={openAddCde}>
            <Icon.Plus/> CDE
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ flex:1, position:'relative' }}>
          <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
            color:'var(--text3)', width:14, height:14, pointerEvents:'none' }}>
            <Icon.Search/>
          </div>
          <input className="table-search" style={{ paddingLeft:32, paddingRight: search ? 28 : 10 }}
            placeholder="Search by agency, data set, table or field..."
            value={search} onChange={e => setSearch(e.target.value)}/>
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                background:'var(--text3)', border:'none', cursor:'pointer', padding:0,
                color:'var(--bg)', width:16, height:16, display:'flex',
                alignItems:'center', justifyContent:'center', borderRadius:'50%',
                flexShrink:0 }}
              title="Clear search">
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
              </svg>
            </button>
          )}
        </div>
        <MyDataToggle
          active={myDataOnly}
          onToggle={function() { setMyDataOnly(function(v) { return !v; }); }}
          available={!!stewardIdentity}
          accent={accent}
        />
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
        <div className="status-row status-info">
          No data sets found.
          <button {...dp} className="btn btn-ghost" style={{ marginLeft:12, fontSize:12 }}
            onClick={() => openAddDataSet(null)}>
            <Icon.Plus/> CDS
          </button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {grouped.map(({ agency, agencyKey, dataSets, totalCdes, totalTables, totalProfiled, totalFields, totalRules, totalCrit, totalMetrics }) => {
            const agOpen = !!expanded[agencyKey];
            return (
              <div key={agencyKey} style={{
                background:'var(--bg2)', border:'1px solid var(--border)',
                borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
                overflow:'hidden',
              }}>
                {/* Agency header */}
                <div style={{ display:'flex', alignItems:'center', gap:10,
                  padding:'10px 14px', cursor:'pointer',
                  background: agOpen ? 'var(--bg3)' : 'var(--bg2)' }}
                  onClick={() => toggleKey(agencyKey)}>
                  <div style={{ color: agOpen ? accent : 'var(--text3)',
                    width:14, height:14, flexShrink:0,
                    transform: agOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>
                    <Icon.ChevronR/>
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                    {agency?.agency_acronymn || 'Unknown'}
                  </span>
                  {agency?.agency_name &&
                    <span style={{ fontSize:11, color:'var(--text3)' }}>{agency.agency_name}</span>
                  }
                  <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center' }}>
                    <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', whiteSpace:'nowrap' }}>
                      {dataSets.length} CDS &middot; {totalTables} table{totalTables!==1?'s':''} ({totalProfiled} profiled) &middot; {totalFields} field{totalFields!==1?'s':''} &middot; {totalCdes} CDE{totalCdes!==1?'s':''} &middot; {totalRules} rule{totalRules!==1?'s':''} &middot; {totalMetrics} metric{totalMetrics!==1?'s':''}
                    </span>
                    <button {...dp} className="btn btn-ghost"
                      style={{ fontSize:11, padding:'2px 7px', flexShrink:0 }}
                      onClick={e => {
                        e.stopPropagation();
                        const agId   = agency?.executive_agency_id;
                        const agDirs = dirsByAgencyId[agId] || [];
                        openAddDataSet(agDirs.length === 1 ? agDirs[0].directorate_id : null, agId);
                      }}
                      title={`Add new CDS to ${agency?.agency_acronymn || 'this agency'}`}>
                      <Icon.Plus/> CDS
                    </button>
                  </div>
                </div>

                {/* Expanded: data sets */}
                {agOpen && (
                  <div style={{ borderTop:'1px solid var(--border)',
                    padding:'8px 14px 10px', display:'flex', flexDirection:'column', gap:6 }}>
                    {dataSets.map(({ cds, cdsKey, tables, cdsRulesCount, cdsProfiledCount, cdsFieldCount, cdsCritCount, cdsMetricsCount }) => {
                      const cdsOpen  = !!expanded[cdsKey];
                      const cdsTotal = tables.reduce((s, t) => s + t.cdes.length, 0);
                      return (
                        <div key={cdsKey} style={{
                          border:'1px solid var(--border)',
                          borderLeft:`3px solid ${accent}60`,
                          borderRadius:'var(--radius)',
                          overflow:'hidden',
                        }}>
                          {/* Data set header */}
                          <div style={{ display:'flex', alignItems:'center', gap:8,
                            padding:'8px 12px', cursor:'pointer',
                            background: cdsOpen ? 'var(--bg)' : 'var(--bg3)' }}
                            onClick={() => toggleKey(cdsKey)}>
                            <div style={{ color: cdsOpen ? accent : 'var(--text3)',
                              width:12, height:12, flexShrink:0,
                              transform: cdsOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>
                              <Icon.ChevronR/>
                            </div>
                            <span style={{ fontSize:12, fontWeight:500, color:'var(--text)' }}>
                              {cds?.data_set_name || (cds ? 'Unnamed data set' : 'No data set assigned')}
                            </span>
                            {cds?.data_set_description &&
                              <span style={{ fontSize:11, color:'var(--text3)', flex:1 }}>{cds.data_set_description}</span>
                            }
                            {!cds?.data_set_description && <span style={{ flex:1 }}/>}
                            <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)', whiteSpace:'nowrap' }}>
                              {tables.length} table{tables.length!==1?'s':''} ({cdsProfiledCount} profiled) &middot; {cdsFieldCount} field{cdsFieldCount!==1?'s':''} &middot; {cdsTotal} CDE{cdsTotal!==1?'s':''} &middot; {cdsRulesCount} rule{cdsRulesCount!==1?'s':''} &middot; {cdsMetricsCount} metric{cdsMetricsCount!==1?'s':''}
                            </span>
                            {cds && (
                              <>
                                <button {...dp} className="btn btn-ghost"
                                  style={{ fontSize:11, padding:'2px 6px', flexShrink:0 }}
                                  onClick={e => { e.stopPropagation(); openForm('critical_data_set', { ...cds }); }}
                                  title="Edit this CDS">
                                  <Icon.Pencil/>
                                </button>
                                <button {...dp} className="btn btn-ghost"
                                  style={{ fontSize:11, padding:'2px 6px', flexShrink:0 }}
                                  onClick={e => { e.stopPropagation(); openAddCdeForCds(cds.critical_data_set_id); }}
                                  title={`Add new CDE to ${cds?.data_set_name || 'this data set'}`}>
                                  <Icon.Plus/> CDE
                                </button>
                              </>
                            )}
                          </div>

                          {/* Expanded: tables */}
                          {cdsOpen && (
                            <div style={{ borderTop:'1px solid var(--border)',
                              padding:'6px 12px 8px',
                              display:'flex', flexDirection:'column', gap:4 }}>
                              {tables.length === 0 ? (
                                <div style={{ padding:'12px 8px', fontSize:11,
                                  color:'var(--text3)', display:'flex', alignItems:'center', gap:10 }}>
                                  <span style={{ fontStyle:'italic' }}>No CDEs yet.</span>
                                  <button {...dp} className="btn btn-ghost"
                                    style={{ fontSize:11, padding:'2px 8px' }}
                                    onClick={() => openAddCdeForCds(cds?.critical_data_set_id)}>
                                    <Icon.Plus/> Add CDE
                                  </button>
                                </div>
                              ) : tables.map(({ tableName, tableKey, cdes }) => {
                                const tblOpen    = !!expanded[tableKey];
                                const dbName     = cdes[0]?.source_database_name || null;
                                const tblProfKey = `${dbName}|||${tableName}`;
                                const tblProfCount   = profilingCountByTable[tblProfKey] || 0;
                                const isTblProfiled  = tblProfCount > 0;
                                const fieldCount     = isTblProfiled
                                  ? tblProfCount
                                  : new Set(cdes.map(c => c.source_field_name).filter(Boolean)).size;
                                const tblRuleIds = new Set();
                                for (const c of cdes) { const ids = ruleIdsByCde[c.critical_data_element_id]; if (ids) for (const id of ids) tblRuleIds.add(id); }
                                const tableRuleCount    = tblRuleIds.size;
                                const tableMetricsCount = cdes.reduce((s, c) => s + (allocCountByCde[c.critical_data_element_id] || 0), 0);
                                return (
                                  <div key={tableKey} style={{
                                    border:'1px solid var(--border)', borderRadius:'var(--radius)',
                                    overflow:'hidden',
                                  }}>
                                    {/* Table header */}
                                    <div style={{ display:'flex', alignItems:'center', gap:8,
                                      padding:'6px 10px', cursor:'pointer',
                                      background: tblOpen ? 'var(--bg2)' : 'var(--bg)' }}
                                      onClick={() => toggleKey(tableKey)}>
                                      <div style={{ color: tblOpen ? accent : 'var(--text3)',
                                        width:11, height:11, flexShrink:0,
                                        transform: tblOpen ? 'rotate(90deg)' : 'none',
                                        transition:'transform 0.15s' }}>
                                        <Icon.ChevronR/>
                                      </div>
                                      <div style={{ flex:1, minWidth:0, display:'flex',
                                        alignItems:'baseline', gap:6, flexWrap:'wrap' }}>
                                        <span style={{
                                          fontSize:11, fontFamily:'var(--mono)', fontWeight:600,
                                          color:'var(--text)',
                                        }}>
                                          {tableName === '__unknown__' ? 'no table assigned' : tableName}
                                        </span>
                                        {dbName && (
                                          <span style={{ fontSize:10, fontFamily:'var(--mono)',
                                            color:'var(--text3)', fontWeight:400 }}>
                                            in {dbName}
                                          </span>
                                        )}
                                      </div>
                                      <span style={{
                                        fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
                                        color: isTblProfiled ? physAccent : 'var(--text3)',
                                        background: isTblProfiled ? `${physAccent}15` : 'var(--bg3)',
                                        border: `1px solid ${isTblProfiled ? physAccent + '40' : 'var(--border)'}`,
                                        borderRadius:3, padding:'1px 6px', flexShrink:0, whiteSpace:'nowrap',
                                      }}>
                                        {isTblProfiled ? 'profiled' : 'not profiled'}
                                      </span>
                                      <span style={{ fontSize:10, color:'var(--text3)',
                                        fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap' }}>
                                        &middot; {fieldCount} field{fieldCount!==1?'s':''} &middot; {cdes.length} CDE{cdes.length!==1?'s':''} &middot; {tableRuleCount} rule{tableRuleCount!==1?'s':''} &middot; {tableMetricsCount} metric{tableMetricsCount!==1?'s':''}
                                      </span>
                                      <button {...dp} className="btn btn-ghost"
                                        style={{ fontSize:11, padding:'2px 5px', flexShrink:0 }}
                                        onClick={e => {
                                          e.stopPropagation();
                                          const t = cdes[0];
                                          openAddCdeForTbl(
                                            cds?.critical_data_set_id,
                                            tableName !== '__unknown__' ? tableName : null,
                                            dbName,
                                            t?.source_platform_name  || null,
                                            t?.source_system_name    || null,
                                            t?.source_snapshot_filter || null
                                          );
                                        }}
                                        title={`Add new CDE to ${tableName}`}>
                                        <Icon.Plus/> CDE
                                      </button>
                                    </div>

                                    {/* Expanded: CDE rows */}
                                    {tblOpen && (
                                      <div style={{ borderTop:'1px solid var(--border)',
                                        marginLeft:12, paddingLeft:12,
                                        borderLeft:`2px solid ${accent}30`,
                                        display:'flex', flexDirection:'column', gap:0 }}>
                                        {cdes.map((cde, idx) => {
                                          const pk          = cde.critical_data_element_id;
                                          const isRetired   = !!cde.retiring_timestamp;
                                          const noFilter    = missingFilter(cde);
                                          const ruleCount   = ruleIdsByCde[pk]?.size || 0;
                                          const metricCount = allocCountByCde[pk]    || 0;
                                          const cdeExpanded = !!expanded[`cde_${pk}`];
                                          const profKey     = `${cde.source_database_name}|||${cde.source_table_name}|||${cde.source_field_name}`;
                                          const hasProfile  = !!profilingByKey[profKey];
                                          return (
                                            <React.Fragment key={pk}>
                                              <div style={{
                                                display:'flex', alignItems:'center', gap:8,
                                                padding:'5px 10px',
                                                background:'var(--bg2)',
                                                borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                                                borderLeft: noFilter ? '3px solid var(--red)' : '3px solid transparent',
                                                opacity: isRetired ? 0.5 : 1,
                                              }}>
                                                <div style={{ flex:1, minWidth:0 }}>
                                                  <div style={{ fontSize:12, fontFamily:'var(--mono)',
                                                    fontWeight:500, color: accent,
                                                    wordBreak:'break-all' }}>
                                                    {cde.source_field_name || `CDE #${pk}`}
                                                  </div>
                                                </div>
                                                {isRetired &&
                                                  <span style={{ fontSize:10, color:'var(--text3)',
                                                    fontStyle:'italic', flexShrink:0 }}>retired</span>
                                                }
                                                {hasProfile && (
                                                  <span title={`Profiled ${profilingByKey[profKey].profiled_at}`}
                                                    style={{ fontSize:9, fontFamily:'var(--mono)',
                                                      fontWeight:600, color:physAccent,
                                                      background:`${physAccent}15`,
                                                      border:`1px solid ${physAccent}40`,
                                                      borderRadius:3, padding:'1px 6px',
                                                      flexShrink:0, whiteSpace:'nowrap' }}>
                                                    profiled
                                                  </span>
                                                )}
                                                {noFilter && (
                                                  <span title="Missing snapshot filter"
                                                    style={{ color:'var(--red)', width:13, height:13,
                                                      flexShrink:0 }}>
                                                    <Icon.Warning/>
                                                  </span>
                                                )}
                                                {critGroupsSorted.map(g => {
                                                  const levelId = critsByCdeId[pk]?.[g.criticality_group_id];
                                                  const level   = levelId ? critLevelsById[levelId] : null;
                                                  return (
                                                    <span key={g.criticality_group_id}
                                                      title={`${g.criticality_group_description}: ${level?.criticality_description || 'not set'}`}
                                                      style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
                                                        color: level ? 'var(--amber)' : 'var(--text3)',
                                                        background: level ? 'rgba(245,166,35,0.10)' : 'var(--bg3)',
                                                        border: `1px solid ${level ? 'rgba(245,166,35,0.30)' : 'var(--border)'}`,
                                                        borderRadius:3, padding:'1px 5px', flexShrink:0, whiteSpace:'nowrap' }}>
                                                      {g.criticality_group_acronymn}: {level?.criticality_description || '&#8212;'}
                                                    </span>
                                                  );
                                                })}
                                                {ruleCount > 0 && (
                                                  <span style={{ fontSize:10, fontFamily:'var(--mono)',
                                                    color:'var(--text3)', flexShrink:0, whiteSpace:'nowrap' }}>
                                                    {ruleCount} rule{ruleCount!==1?'s':''}
                                                  </span>
                                                )}
                                                {metricCount > 0 && (
                                                  <span style={{ fontSize:10, fontFamily:'var(--mono)',
                                                    color:'var(--text3)', flexShrink:0, whiteSpace:'nowrap' }}>
                                                    {metricCount} metric{metricCount!==1?'s':''}
                                                  </span>
                                                )}
                                                <div style={{ display:'flex', gap:3, flexShrink:0 }}>
                                                  {metricCount > 0 && (
                                                    <button className="btn btn-ghost"
                                                      style={{ fontSize:10, padding:'2px 5px',
                                                        color: cdeExpanded ? accent : 'var(--text3)',
                                                        transition:'color 0.15s' }}
                                                      onClick={e => { e.stopPropagation(); toggleKey(`cde_${pk}`); }}
                                                      title="Show/hide rule allocations">
                                                      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
                                                        transform: cdeExpanded ? 'rotate(90deg)' : 'none',
                                                        transition:'transform 0.15s' }}>
                                                        <Icon.ChevronR/>
                                                      </div>
                                                    </button>
                                                  )}
                                                  {canEdit && (
                                                    <button className="btn btn-ghost"
                                                      style={{ fontSize:10, padding:'2px 5px' }}
                                                      onClick={e => {
                                                        e.stopPropagation();
                                                        setAllocPanel({
                                                          isEdit: false,
                                                          cdeId: pk,
                                                          record: {
                                                            data_quality_rule_allocation_id: nextPk('data_quality_rule_allocation'),
                                                            critical_data_element_id: pk,
                                                            data_quality_rule_id: null,
                                                            quality_dimension_id: null,
                                                            bumper_value: null,
                                                            frequency: null,
                                                            retiring_timestamp: null,
                                                          },
                                                        });
                                                      }}
                                                      title="Add rule allocation">
                                                      <Icon.Plus/>
                                                    </button>
                                                  )}
                                                  {!isRetired && (
                                                    <button {...dp} className="btn btn-ghost"
                                                      style={{ fontSize:10, padding:'2px 6px' }}
                                                      onClick={() => openEditCde(cde)} title="Edit">
                                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                    </button>
                                                  )}
                                                  {isRetired ? (
                                                    <button {...dp} className="btn btn-ghost"
                                                      style={{ fontSize:10, padding:'2px 6px' }}
                                                      onClick={() => canEdit && restoreRecord('critical_data_element', pk)}>
                                                      <Icon.Eye/>
                                                    </button>
                                                  ) : (
                                                    <button {...dp} className="btn btn-ghost"
                                                      style={{ fontSize:10, padding:'2px 6px' }}
                                                      onClick={() => canEdit && retireRecord('critical_data_element', pk)}
                                                      title="Retire">
                                                      <Icon.EyeOff/>
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                              {cdeExpanded && metricCount > 0 && (
                                                <div style={{
                                                  borderTop:'1px solid var(--border)',
                                                  background:'var(--bg3)',
                                                  padding:'6px 10px 6px 24px',
                                                  display:'flex', flexDirection:'column', gap:4,
                                                }}>
                                                  {[...(allocsByCdeId[pk] || [])].sort((a, b) => {
                                                    const na = rulesById[a.data_quality_rule_id]?.rule_name || '';
                                                    const nb = rulesById[b.data_quality_rule_id]?.rule_name || '';
                                                    const ag = na.toUpperCase().startsWith('GENERIC');
                                                    const bg = nb.toUpperCase().startsWith('GENERIC');
                                                    if (ag !== bg) return ag ? -1 : 1;
                                                    return na.localeCompare(nb);
                                                  }).map(alloc => {
                                                    const rule       = rulesById[alloc.data_quality_rule_id];
                                                    const dim        = dimensionsById[alloc.quality_dimension_id];
                                                    const hasSample  = !!(rule?.sql_code_sample);
                                                    const missingFlt = cde && !cde.source_snapshot_filter;
                                                    if (!rule) return null;
                                                    return (
                                                      <div key={alloc.data_quality_rule_allocation_id} style={{
                                                        display:'grid',
                                                        gridTemplateColumns:'1fr 110px 70px 60px 64px 52px',
                                                        gap:8, padding:'5px 8px',
                                                        background:'var(--bg)',
                                                        border: missingFlt
                                                          ? '1px solid var(--red)'
                                                          : '1px solid var(--border)',
                                                        borderRadius:'var(--radius)',
                                                        alignItems:'center',
                                                        opacity: alloc.retiring_timestamp ? 0.5 : 1,
                                                      }}>
                                                        {/* Rule name */}
                                                        <div style={{ minWidth:0 }}>
                                                          <div style={{ fontSize:11, fontFamily:'var(--mono)',
                                                            fontWeight:500, color:'var(--text)',
                                                            whiteSpace:'nowrap', overflow:'hidden',
                                                            textOverflow:'ellipsis', display:'flex',
                                                            alignItems:'center', gap:4 }}>
                                                            {rule.rule_name}
                                                            {missingFlt && (
                                                              <span title="Missing snapshot filter -- SQL cannot be composed"
                                                                style={{ color:'var(--red)', flexShrink:0,
                                                                  width:11, height:11, display:'inline-flex' }}>
                                                                <Icon.Warning/>
                                                              </span>
                                                            )}
                                                          </div>
                                                        </div>

                                                        {/* Dimension */}
                                                        <span style={{ fontSize:11, color:accent,
                                                          fontFamily:'var(--mono)' }}>
                                                          {dim?.dimension_name || '--'}
                                                        </span>

                                                        {/* Frequency */}
                                                        <span style={{ fontSize:11, color:'var(--text2)' }}>
                                                          {alloc.frequency || '--'}
                                                        </span>

                                                        {/* Bumper value */}
                                                        <div>
                                                          {alloc.bumper_value !== null && alloc.bumper_value !== undefined
                                                            ? (
                                                              <span style={{
                                                                fontSize:11, fontFamily:'var(--mono)',
                                                                fontWeight:600, color:'var(--amber)',
                                                                background:'var(--amber-bg)',
                                                                border:'1px solid var(--amber)',
                                                                borderRadius:3, padding:'1px 7px',
                                                                whiteSpace:'nowrap',
                                                              }}>
                                                                {alloc.bumper_value}
                                                              </span>
                                                            ) : (
                                                              <span style={{ fontSize:11,
                                                                color:'var(--text3)',
                                                                fontFamily:'var(--mono)' }}>--</span>
                                                            )
                                                          }
                                                        </div>

                                                        {/* SQL buttons */}
                                                        <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                                                          <button className="btn btn-ghost"
                                                            style={{ padding:'2px 5px',
                                                              color: missingFlt ? 'var(--red)' : 'var(--accent)' }}
                                                            disabled={missingFlt}
                                                            title={missingFlt
                                                              ? 'Missing snapshot filter'
                                                              : 'View composed rule SQL'}
                                                            onClick={e => {
                                                              e.stopPropagation();
                                                              openSql('rule', rule, alloc, cde, cds, agency);
                                                            }}>
                                                            <div style={{ width:13, height:13 }}><Icon.Code/></div>
                                                          </button>
                                                          {hasSample ? (
                                                            <button className="btn btn-ghost"
                                                              style={{ padding:'2px 5px', color:'var(--text2)' }}
                                                              disabled={missingFlt}
                                                              title={missingFlt
                                                                ? 'Missing snapshot filter'
                                                                : 'View composed sample SQL'}
                                                              onClick={e => {
                                                                e.stopPropagation();
                                                                openSql('sample', rule, alloc, cde, cds, agency);
                                                              }}>
                                                              <div style={{ width:13, height:13 }}><Icon.Sample/></div>
                                                            </button>
                                                          ) : (
                                                            <span style={{
                                                              fontSize:8, fontFamily:'var(--mono)',
                                                              fontWeight:600, letterSpacing:'0.04em',
                                                              color:'var(--text3)', background:'var(--bg)',
                                                              border:'1px solid var(--border)',
                                                              borderRadius:3, padding:'1px 4px',
                                                              whiteSpace:'nowrap',
                                                            }} title="No sample code -- engine uses default approach">
                                                              DEF
                                                            </span>
                                                          )}
                                                        </div>

                                                        {/* Edit / retire actions */}
                                                        <div style={{ display:'flex', gap:2, alignItems:'center', justifyContent:'flex-end' }}>
                                                          {!alloc.retiring_timestamp ? (
                                                            <>
                                                              <button className="btn btn-ghost"
                                                                style={{ padding:'2px 4px' }}
                                                                title="Edit allocation"
                                                                onClick={e => {
                                                                  e.stopPropagation();
                                                                  setAllocPanel({ isEdit: true, cdeId: pk, record: { ...alloc } });
                                                                }}>
                                                                <div style={{ width:11, height:11 }}><Icon.Pencil/></div>
                                                              </button>
                                                              <button className="btn btn-ghost"
                                                                style={{ padding:'2px 4px', color:'var(--red)' }}
                                                                title="Retire allocation"
                                                                onClick={e => {
                                                                  e.stopPropagation();
                                                                  retireRecord('data_quality_rule_allocation', alloc.data_quality_rule_allocation_id);
                                                                }}>
                                                                <div style={{ width:11, height:11 }}><Icon.EyeOff/></div>
                                                              </button>
                                                            </>
                                                          ) : (
                                                            <button className="btn btn-ghost"
                                                              style={{ padding:'2px 4px', color:'var(--text3)' }}
                                                              title="Restore allocation"
                                                              onClick={e => {
                                                                e.stopPropagation();
                                                                restoreRecord('data_quality_rule_allocation', alloc.data_quality_rule_allocation_id);
                                                              }}>
                                                              <div style={{ width:11, height:11 }}><Icon.Eye/></div>
                                                            </button>
                                                          )}
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    {allocPanel && (
      <CdeAllocFormPanel
        record={allocPanel.record}
        isEdit={allocPanel.isEdit}
        onSave={handleAllocSave}
        onClose={() => setAllocPanel(null)}
        data={data}
      />
    )}
    </>
  );
}

// ===============================================================================
// ALLOCATION FORM PANEL -- scoped to a known CDE (add or edit allocation)
// ===============================================================================
function CdeAllocFormPanel({ record, isEdit, onSave, onClose, data }) {
  const { nextPk } = useApp();
  const accent = TABLE_GROUPS.find(g => g.tables.includes('data_quality_rule_allocation'))?.accent || 'var(--accent)';

  const rules      = data?.data_quality_rule || [];
  const dimensions = data?.quality_dimension || [];
  const cdes       = data?.critical_data_element || [];
  const dataSets   = data?.critical_data_set || [];
  const allAllocs  = data?.data_quality_rule_allocation || [];

  const cdeById  = useMemo(() => Object.fromEntries(cdes.map(c  => [c.critical_data_element_id, c])), [cdes]);
  const cdsById  = useMemo(() => Object.fromEntries(dataSets.map(d => [d.critical_data_set_id, d])),  [dataSets]);
  const ruleById = useMemo(() => Object.fromEntries(rules.map(r  => [r.data_quality_rule_id, r])),    [rules]);

  const cde = cdeById[record.critical_data_element_id];
  const cds = cde ? cdsById[cde.critical_data_set_id] : null;

  const [values, setValues] = useState({
    data_quality_rule_allocation_id: record?.data_quality_rule_allocation_id ?? nextPk('data_quality_rule_allocation'),
    critical_data_element_id:        record.critical_data_element_id,
    data_quality_rule_id:            record?.data_quality_rule_id      ?? null,
    quality_dimension_id:            record?.quality_dimension_id      ?? null,
    bumper_value:                    record?.bumper_value               ?? null,
    frequency:                       record?.frequency                  ?? null,
    retiring_timestamp:              null,
  });
  const [errors,   setErrors]   = useState({});
  const [warnings, setWarnings] = useState({});

  const set = (field, value) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: null }));
    setWarnings(prev => ({ ...prev, [field]: null }));
  };

  // Show generic rules (no prefix, or "Generic - " prefix) plus rules whose prefix exactly
  // matches the current CDS name. Any other "OtherCDS - rule" is hidden.
  const ruleOpts = useMemo(() => {
    const base = [...rules].filter(r => !r.retiring_timestamp);
    const cdsName = cds?.data_set_name || '';
    if (!cdsName) return base.sort((a,b) => (a.rule_name||'').localeCompare(b.rule_name||''));
    return base
      .filter(r => {
        const name = r.rule_name || '';
        const sepIdx = name.indexOf(' - ');
        if (sepIdx === -1) return true;                                // no prefix: generic
        const prefix = name.slice(0, sepIdx);
        if (prefix.toLowerCase() === 'generic') return true;          // explicit generic prefix
        return prefix === cdsName;                                     // hide all other CDS rules
      })
      .sort((a,b) => (a.rule_name||'').localeCompare(b.rule_name||''));
  }, [rules, cds]);
  const dimOpts = useMemo(() =>
    [...dimensions].filter(d => !d.retiring_timestamp)
      .sort((a,b) => (a.dimension_name||'').localeCompare(b.dimension_name||'')), [dimensions]);

  const editRule = isEdit ? ruleById[values.data_quality_rule_id] : null;

  const checkDuplicate = (ruleId) => {
    if (isEdit || !ruleId) return false;
    return allAllocs.some(a =>
      a.critical_data_element_id === record.critical_data_element_id &&
      a.data_quality_rule_id === parseInt(ruleId) &&
      !a.retiring_timestamp
    );
  };

  useEffect(() => {
    if (checkDuplicate(values.data_quality_rule_id)) {
      setWarnings(prev => ({ ...prev, data_quality_rule_id: 'This rule is already allocated to this CDE.' }));
    } else {
      setWarnings(prev => ({ ...prev, data_quality_rule_id: null }));
    }
  }, [values.data_quality_rule_id]);

  const validate = () => {
    const errs = {};
    if (!values.data_quality_rule_id) errs.data_quality_rule_id = 'Required';
    if (!values.quality_dimension_id) errs.quality_dimension_id = 'Required';
    if (!values.frequency || !String(values.frequency).trim()) errs.frequency = 'Required';
    if (checkDuplicate(values.data_quality_rule_id)) errs.data_quality_rule_id = 'This rule is already allocated to this CDE.';
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const saved = { ...values };
    if (saved.bumper_value !== null && saved.bumper_value !== '') saved.bumper_value = parseFloat(saved.bumper_value);
    else saved.bumper_value = null;
    onSave(saved);
  };

  const inlineSql = useMemo(() => {
    const rule = ruleById[values.data_quality_rule_id];
    if (!cde || !rule || !cde.source_snapshot_filter) return null;
    return {
      rule:   composeSql(rule.sql_code,        cde, 'rule'),
      sample: rule.sql_code_sample ? composeSql(rule.sql_code_sample, cde, 'sample') : null,
    };
  }, [values.data_quality_rule_id, cde, ruleById]);

  const [copiedRule,   setCopiedRule]   = useState(false);
  const [copiedSample, setCopiedSample] = useState(false);
  const copyToClipboard = (text, setCopied) => {
    navigator.clipboard.writeText(normalizeWhitespace(text)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    });
  };

  const inputBase = {
    width:'100%', padding:'7px 10px', fontSize:13,
    background:'var(--bg3)', borderRadius:'var(--radius)',
    color:'var(--text)', fontFamily:'var(--sans)', outline:'none',
  };
  const borderFor = (field) => ({
    border: `1px solid ${errors[field] ? 'var(--red)' : warnings[field] ? 'var(--amber)' : 'var(--border)'}`,
  });

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'var(--overlay-sm)' }}/>
      <div style={{
        position:'fixed', top:0, right:0, bottom:0, width:'min(520px, 58vw)',
        background:'var(--bg2)', borderLeft:'1px solid var(--border2)',
        zIndex:400, display:'flex', flexDirection:'column',
        boxShadow:'-4px 0 24px var(--overlay-md)', animation:'slideInRight 0.18s ease',
      }}>
        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:accent, marginBottom:3 }}>
              {isEdit ? 'Edit allocation' : 'Add allocation'}
            </div>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text)',
              fontFamily:'var(--mono)' }}>
              {cde?.source_field_name || `CDE #${record.critical_data_element_id}`}
              {cds && <span style={{ color:'var(--text3)', fontWeight:400, marginLeft:6 }}>
                {cds.data_set_name}
              </span>}
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleSave} style={{ padding:'6px 14px', fontSize:12 }}>
            <Icon.Check/> {isEdit ? 'Save' : 'Add'}
          </button>
          <button className="btn btn-ghost" style={{ padding:'6px 8px' }} onClick={onClose}>
            <Icon.X/>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflow:'auto', padding:'16px 18px' }}>

          {/* Rule */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600,
              color: errors.data_quality_rule_id ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
              Rule <span style={{ color:'var(--red)' }}>*</span>
            </label>
            {isEdit ? (
              <div style={{ padding:'7px 10px', background:'var(--bg3)',
                border:'1px solid var(--border)', borderRadius:'var(--radius)',
                fontSize:12, color:'var(--text)' }}>
                {editRule?.rule_name || `Rule #${values.data_quality_rule_id}`}
              </div>
            ) : (
              <>
                <select value={values.data_quality_rule_id ?? ''} style={{ ...inputBase, cursor:'pointer', ...borderFor('data_quality_rule_id') }}
                  onChange={e => set('data_quality_rule_id', e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">-- select rule --</option>
                  {ruleOpts.map(r => <option key={r.data_quality_rule_id} value={r.data_quality_rule_id}>{r.rule_name}</option>)}
                </select>
                {errors.data_quality_rule_id && (
                  <div style={{ fontSize:11, color:'var(--red)', marginTop:3, display:'flex', gap:4, alignItems:'center' }}>
                    <span style={{ width:12, height:12, flexShrink:0 }}><Icon.Warning/></span>
                    {errors.data_quality_rule_id}
                  </div>
                )}
                {!errors.data_quality_rule_id && warnings.data_quality_rule_id && (
                  <div style={{ fontSize:11, color:'var(--amber)', marginTop:3, display:'flex', gap:4, alignItems:'center' }}>
                    <span style={{ width:12, height:12, flexShrink:0 }}><Icon.Warning/></span>
                    {warnings.data_quality_rule_id}
                  </div>
                )}
                {!isEdit && cds && (() => {
                  const totalActive = rules.filter(r => !r.retiring_timestamp).length;
                  if (ruleOpts.length >= totalActive) return null;
                  return (
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>
                      Showing {ruleOpts.length} of {totalActive} rules -- generic + {cds.data_set_name} rules only
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Dimension */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600,
              color: errors.quality_dimension_id ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
              Quality Dimension <span style={{ color:'var(--red)' }}>*</span>
            </label>
            <select value={values.quality_dimension_id ?? ''} style={{ ...inputBase, cursor:'pointer', ...borderFor('quality_dimension_id') }}
              onChange={e => set('quality_dimension_id', e.target.value ? parseInt(e.target.value) : null)}>
              <option value="">-- select dimension --</option>
              {dimOpts.map(d => <option key={d.quality_dimension_id} value={d.quality_dimension_id}>{d.dimension_name}</option>)}
            </select>
            {errors.quality_dimension_id && (
              <div style={{ fontSize:11, color:'var(--red)', marginTop:3, display:'flex', gap:4, alignItems:'center' }}>
                <span style={{ width:12, height:12, flexShrink:0 }}><Icon.Warning/></span>
                {errors.quality_dimension_id}
              </div>
            )}
          </div>

          {/* Frequency */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600,
              color: errors.frequency ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
              Frequency <span style={{ color:'var(--red)' }}>*</span>
            </label>
            <select value={values.frequency ?? ''}
              onChange={e => set('frequency', e.target.value || null)}
              style={{ ...inputBase, cursor:'pointer', ...borderFor('frequency') }}>
              <option value="">-- select frequency --</option>
              {['DAILY','AD-HOC','WEEKLY','MONTHLY'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            {errors.frequency && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{errors.frequency}</div>}
          </div>

          {/* Bumper value */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600,
              color:'var(--text2)', marginBottom:4 }}>
              Bumper value
              <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400, marginLeft:6 }}>(optional)</span>
            </label>
            <select value={values.bumper_value ?? ''}
              onChange={e => set('bumper_value', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              style={{ ...inputBase, cursor:'pointer',
                border: errors.bumper_value ? '1px solid var(--red)' : '1px solid var(--border)' }}>
              <option value="">-- none --</option>
              {[1,2,3,4,5].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Inline SQL preview */}
          {inlineSql && (
            <div style={{ marginTop:6 }}>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--accent)',
                    letterSpacing:'0.06em', textTransform:'uppercase' }}>Rule SQL</span>
                  <button className="btn btn-ghost" style={{ fontSize:11, padding:'2px 8px' }}
                    onClick={() => copyToClipboard(inlineSql.rule, setCopiedRule)}>
                    {copiedRule ? <><Icon.Check/> Copied</> : <><Icon.Copy/> Copy</>}
                  </button>
                </div>
                <pre style={{ fontFamily:'var(--mono)', fontSize:11, lineHeight:1.6,
                  color:'var(--text)', background:'var(--bg)',
                  border:'1px solid var(--border)', borderRadius:'var(--radius)',
                  padding:'10px 12px', whiteSpace:'pre-wrap', wordBreak:'break-all',
                  margin:0, maxHeight:160, overflow:'auto' }}>
                  {inlineSql.rule}
                </pre>
              </div>
              {inlineSql.sample ? (
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:600, color:'var(--text2)',
                      letterSpacing:'0.06em', textTransform:'uppercase' }}>Sample SQL</span>
                    <button className="btn btn-ghost" style={{ fontSize:11, padding:'2px 8px' }}
                      onClick={() => copyToClipboard(inlineSql.sample, setCopiedSample)}>
                      {copiedSample ? <><Icon.Check/> Copied</> : <><Icon.Copy/> Copy</>}
                    </button>
                  </div>
                  <pre style={{ fontFamily:'var(--mono)', fontSize:11, lineHeight:1.6,
                    color:'var(--text)', background:'var(--bg)',
                    border:'1px solid var(--border)', borderRadius:'var(--radius)',
                    padding:'10px 12px', whiteSpace:'pre-wrap', wordBreak:'break-all',
                    margin:0, maxHeight:120, overflow:'auto' }}>
                    {inlineSql.sample}
                  </pre>
                </div>
              ) : (
                <div style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>
                  No sample SQL defined for this rule - engine uses default approach.
                </div>
              )}
            </div>
          )}
          {values.data_quality_rule_id && !cde?.source_snapshot_filter && (
            <div style={{ marginTop:10, padding:'8px 12px', background:'var(--bg3)',
              border:'1px solid var(--red)', borderRadius:'var(--radius)',
              fontSize:11, color:'var(--red)', display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ width:13, height:13, flexShrink:0 }}><Icon.Warning/></span>
              Missing snapshot filter on this CDE - SQL cannot be composed.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
