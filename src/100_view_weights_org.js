function AggregatedWeightView({ tableName }) {
  const { data, retireRecord, restoreRecord, openForm, nextPk, canEdit } = useApp();
  const dp = !canEdit ? { style:{ opacity:0.35, cursor:'not-allowed', pointerEvents:'none' }, title:'Set your steward identity in Settings to make changes' } : {};



  const [search,      setSearch]      = useState('');
  const [showRetired, setShowRetired] = useState(false);

  const schema = SCHEMA[tableName];
  const rows   = data?.[tableName] || [];
  const group  = TABLE_GROUPS.find(g => g.tables.includes(tableName));
  const accent = group?.accent || 'var(--accent)';

  const isCriticality = tableName === 'criticality_group_weight';
  const dimField      = isCriticality ? 'criticality_group_id'        : 'quality_dimension_id';
  const dimTable      = isCriticality ? 'criticality_group'            : 'quality_dimension';
  const dimDisplay    = isCriticality ? 'criticality_group_description': 'dimension_name';
  const dimAcronym    = isCriticality ? 'criticality_group_acronymn'   : 'dimension_acronymn';

  const agencies   = data?.['executive_agency'] || [];
  const dimensions = data?.[dimTable] || [];

  const openAdd  = () => openForm(tableName, buildBlankRecord(tableName, nextPk, data));
  const openEdit = (row) => openForm(tableName, { ...row });

  const agencyById = useMemo(() =>
    Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])),
  [agencies]);

  const grouped = useMemo(() => {
    const live = showRetired ? rows : rows.filter(r => !r.retiring_timestamp);
    const map  = {};
    for (const row of live) {
      const aid = row.executive_agency_id;
      if (!map[aid]) map[aid] = [];
      map[aid].push(row);
    }
    return Object.entries(map)
      .map(([aid, agencyRows]) => ({
        agencyId: parseInt(aid),
        agency:   agencyById[parseInt(aid)],
        rows:     agencyRows,
      }))
      .sort((a, b) =>
        (a.agency?.agency_acronymn || '').localeCompare(b.agency?.agency_acronymn || '')
      );
  }, [rows, showRetired, agencyById]);

  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped.filter(({ agency, rows: agRows }) => {
      if ((agency?.agency_acronymn || '').toLowerCase().includes(q)) return true;
      if ((agency?.agency_name     || '').toLowerCase().includes(q)) return true;
      return agRows.some(r => {
        const dim = dimensions.find(d => d[`${dimTable}_id`] === r[dimField]);
        return (dim?.[dimDisplay] || '').toLowerCase().includes(q);
      });
    });
  }, [grouped, search, dimensions, dimDisplay, dimField, dimTable]);

  const liveCount    = rows.filter(r => !r.retiring_timestamp).length;
  const retiredCount = rows.filter(r =>  r.retiring_timestamp).length;
  const agencyCount  = grouped.length;

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            {schema.label}
          </div>
          <div className="page-sub">
            {agencyCount} agenc{agencyCount !== 1 ? 'ies' : 'y'} - {liveCount} live records
            {retiredCount > 0 && ` - ${retiredCount} retired`}
          </div>
        </div>
        {canEdit && (
          <button {...dp} className="btn btn-primary" style={{ marginTop:4 }} onClick={openAdd}>
            <Icon.Plus/> Add record
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ flex:1, position:'relative' }}>
          <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
            color:'var(--text3)', width:14, height:14, pointerEvents:'none' }}>
            <Icon.Search/>
          </div>
          <input className="table-search" style={{ paddingLeft:32 }}
            placeholder="Search by agency or dimension..."
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

      {/* Agency cards */}
      {filtered.length === 0 ? (
        <div className="status-row status-info">No records match the current filter.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(({ agencyId, agency, rows: agRows }) => {
            const acronym = agency?.agency_acronymn || `Agency #${agencyId}`;
            const name    = agency?.agency_name || '';
            const sorted  = [...agRows].sort((a, b) => {
              const da = dimensions.find(d => d[`${dimTable}_id`] === a[dimField]);
              const db = dimensions.find(d => d[`${dimTable}_id`] === b[dimField]);
              return (da?.[dimAcronym] || '').localeCompare(db?.[dimAcronym] || '');
            });
            const totalWeights = sorted.reduce((s, r) => s + (r.weight_value ?? 0), 0);

            return (
              <div key={agencyId} style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${accent}`,
                borderRadius: 'var(--radius-lg)',
                padding: '14px 16px',
              }}>
                {/* Agency header */}
                <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:12 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{acronym}</span>
                  {name && <span style={{ fontSize:11, color:'var(--text3)' }}>{name}</span>}
                  <span style={{
                    marginLeft:'auto', fontSize:11, color:'var(--text3)',
                    fontFamily:'var(--mono)',
                  }}>
                    {sorted.length} weight{sorted.length !== 1 ? 's' : ''}
                    ' - '
                    <span style={{ color:'var(--text2)' }}>
                      total {totalWeights}
                    </span>
                  </span>
                </div>

                {/* Weight boxes -- one per dimension, inline */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {sorted.map(row => {
                    const pk        = row[schema.pk];
                    const isRetired = !!row.retiring_timestamp;
                    const dim       = dimensions.find(d => d[`${dimTable}_id`] === row[dimField]);
                    const acro      = dim?.[dimAcronym]  || `#${row[dimField]}`;
                    const tooltip   = dim?.[dimDisplay]  || '';

                    return (
                      <div key={pk}
                        title={tooltip}
                        onClick={() => !isRetired && canEdit && openEdit(row)}
                        style={{
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 2,
                          padding: '5px 10px',
                          background: isRetired ? 'var(--bg)' : 'var(--bg3)',
                          border: `1px solid ${isRetired ? 'var(--border)' : accent}30`,
                          borderRadius: 'var(--radius)',
                          minWidth: 58,
                          opacity: isRetired ? 0.5 : 1,
                          cursor: (!isRetired && canEdit) ? 'pointer' : 'default',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => { if (!isRetired && canEdit) e.currentTarget.style.background = 'var(--bg2)'; }}
                        onMouseLeave={e => { if (!isRetired && canEdit) e.currentTarget.style.background = 'var(--bg3)'; }}
                      >
                        {/* Acronym */}
                        <span style={{
                          fontSize: 9, fontWeight: 600,
                          fontFamily: 'var(--mono)',
                          color: accent,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}>
                          {acro}
                        </span>

                        {/* Weight value */}
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: 'var(--text)',
                          lineHeight: 1.2,
                          fontFamily: 'var(--mono)',
                        }}>
                          {row.weight_value ?? '--'}
                        </span>

                        {/* Retire / restore -- hover reveal */}
                        <button
                          style={{
                            position: 'absolute', top: 2, right: 2,
                            background: 'none', border: 'none',
                            cursor: 'pointer', padding: 1,
                            color: 'var(--text3)',
                            opacity: 0,
                            transition: 'opacity 0.15s',
                            width: 10, height: 10,
                          }}
                          className="weight-box-action"
                          onClick={() => isRetired
                            ? restoreRecord(tableName, pk)
                            : retireRecord(tableName, pk)
                          }
                          title={isRetired ? 'Restore' : 'Retire'}
                        >
                          <div style={{ width:10, height:10 }}>
                            {isRetired ? <Icon.Eye/> : <Icon.EyeOff/>}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ===============================================================================
// OWNERSHIP ORG CHART -- agency picker + tree view of patron -> directorates
//                        -> owners -> stewards
// ===============================================================================
// OrgChart helpers -- defined outside OwnershipOrgChart to avoid Babel issues
function OrgRolePill({ label, color }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: '0.07em',
      textTransform: 'uppercase', fontFamily: 'var(--mono)',
      padding: '1px 6px', borderRadius: 3,
      background: color + '18', color: color, border: '1px solid ' + color + '30',
      flexShrink: 0, whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}
function OrgPersonChip({ name, subtitle }) {
  return (
    <span style={{
      display: 'inline-flex', flexDirection: 'column',
      padding: '3px 8px',
      background: 'var(--bg3)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', marginRight: 6, marginBottom: 4,
    }}>
      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{name}</span>
      {subtitle && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{subtitle}</span>}
    </span>
  );
}
function OrgNone() {
  return <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>none assigned</span>;
}

function OwnershipOrgChart() {
  const { data, openForm, retireRecord, restoreRecord, canEdit, nextPk, stewardIdentity, isMaster } = useApp();
  const accent = '#18b4d4';

  const [showRetired,   setShowRetired]   = useState(false);
  const [myDataOnly,    setMyDataOnly]    = useState(() => loadMyDataPref('moj_dq_org_mydata_v1', isMaster));
  const [expanded,      setExpanded]      = useState({});
  const [expandedDirs,  setExpandedDirs]  = useState({});

  useEffect(() => { saveMyDataPref('moj_dq_org_mydata_v1', myDataOnly); }, [myDataOnly]);

  const toggleExpand = (aid) => setExpanded(prev => ({ ...prev, [aid]: !prev[aid] }));
  const toggleDir    = (did) => setExpandedDirs(prev => ({ ...prev, [did]: !prev[did] }));

  const isLive = (r) => showRetired || !r.retiring_timestamp;

  const physAccent = '#7c5cbf';
  const greenAccent = 'var(--green)';
  const mdot = String.fromCharCode(183);

  // Build profiling lookup
  const profilingByKey = useMemo(() => {
    const m = {};
    for (const p of (data?.field_profiling || [])) {
      if (!p.retiring_timestamp)
        m[`${p.source_database_name}|||${p.source_table_name}|||${p.source_field_name}`] = true;
    }
    return m;
  }, [data]);

  // Build alloc count by CDE
  const allocCountByCde = useMemo(() => {
    const m = {};
    for (const a of (data?.data_quality_rule_allocation || [])) {
      if (!a.retiring_timestamp)
        m[a.critical_data_element_id] = (m[a.critical_data_element_id] || 0) + 1;
    }
    return m;
  }, [data]);

  // Derive agency ids for My Data filter
  const myAgencyIds = useMemo(() => {
    if (!myDataOnly) return null;
    var myCdsIds = getMyStewardCdsIds(data, stewardIdentity);
    if (!myCdsIds) return null;
    var cdsById = {};
    (data.critical_data_set || []).forEach(function(c) { cdsById[c.critical_data_set_id] = c; });
    var dirById = {};
    (data.directorate || []).forEach(function(d) { dirById[d.directorate_id] = d; });
    var ids = new Set();
    myCdsIds.forEach(function(cdsId) {
      var cds = cdsById[cdsId];
      if (!cds) return;
      var dir = dirById[cds.directorate_id];
      if (dir) ids.add(dir.executive_agency_id);
    });
    return ids;
  }, [myDataOnly, stewardIdentity, data]);

  // Build per-agency tree data
  const trees = useMemo(() => {
    if (!data) return [];
    const agencies = [...(data.executive_agency || [])]
      .filter(a => (showRetired || !a.retiring_timestamp) && (myAgencyIds === null || myAgencyIds.has(a.executive_agency_id)))
      .sort((a,b) => (a.agency_acronymn||'').localeCompare(b.agency_acronymn||''));

    return agencies.map(agency => {
      const aid = agency.executive_agency_id;

      const patrons = (data.data_patron || [])
        .filter(p => p.executive_agency_id === aid && isLive(p));

      const directorates = [...(data.directorate || [])]
        .filter(d => d.executive_agency_id === aid && isLive(d))
        .sort((a,b) => (a.directorate_name||'').localeCompare(b.directorate_name||''));

      const branches = directorates.map(dir => {
        const owners = (data.data_owner || [])
          .filter(o => o.directorate_id === dir.directorate_id && isLive(o));

        const dataSets = (data.critical_data_set || [])
          .filter(ds => ds.directorate_id === dir.directorate_id && isLive(ds));
        const dataSetIds = new Set(dataSets.map(ds => ds.critical_data_set_id));

        const stewardships = (data.stewardship || [])
          .filter(s => dataSetIds.has(s.critical_data_set_id) && isLive(s));

        const stewardIds = [...new Set(stewardships.map(s => s.data_steward_id))];
        const stewards = stewardIds
          .map(sid => {
            const steward = (data.data_steward || []).find(s => s.data_steward_id === sid);
            const role    = (data.steward_role_type || []).find(r =>
              r.steward_role_type_id === steward?.steward_role_type_id);
            return steward ? { ...steward, role_description: role?.role_description || '' } : null;
          })
          .filter(Boolean)
          .sort((a,b) => (a.data_steward_name||'').localeCompare(b.data_steward_name||''));

        // CDE counts per directorate
        const dirCdes = (data.critical_data_element || []).filter(c =>
          !c.retiring_timestamp && dataSetIds.has(c.critical_data_set_id));
        const cdeCount = dirCdes.length;
        const profiledCount = dirCdes.filter(c =>
          profilingByKey[`${c.source_database_name}|||${c.source_table_name}|||${c.source_field_name}`]
        ).length;
        const ruleCount = dirCdes.reduce((s, c) =>
          s + (allocCountByCde[c.critical_data_element_id] || 0), 0);

        // ERD: at most one data owner per directorate
        const profiledPct = cdeCount > 0 ? Math.round(profiledCount / cdeCount * 100) : null;

        const cdsWithStewards = dataSets
          .filter(ds => isLive(ds))
          .sort((a,b) => (a.data_set_name||'').localeCompare(b.data_set_name||''))
          .map(ds => {
            const dsId = ds.critical_data_set_id;
            const cwStewardships = (data.stewardship || [])
              .filter(s => s.critical_data_set_id === dsId && isLive(s));
            const cwStewardIds = [...new Set(cwStewardships.map(s => s.data_steward_id))];
            const cwStewards = cwStewardIds
              .map(sid => {
                const steward = (data.data_steward || []).find(st => st.data_steward_id === sid);
                const role    = (data.steward_role_type || []).find(r =>
                  r.steward_role_type_id === steward?.steward_role_type_id);
                return steward ? { ...steward, role_description: role?.role_description || '' } : null;
              })
              .filter(Boolean)
              .sort((a,b) => (a.data_steward_name||'').localeCompare(b.data_steward_name||''));
            // Per-CDS stats
            const cdsCdes = (data.critical_data_element || []).filter(c =>
              !c.retiring_timestamp && c.critical_data_set_id === dsId);
            const cdsCdeCount     = cdsCdes.length;
            const cdsProfiledCount = cdsCdes.filter(c =>
              profilingByKey[`${c.source_database_name}|||${c.source_table_name}|||${c.source_field_name}`]
            ).length;
            const cdsRuleCount    = cdsCdes.reduce((s, c) =>
              s + (allocCountByCde[c.critical_data_element_id] || 0), 0);
            const cdsProfiledPct  = cdsCdeCount > 0
              ? Math.round(cdsProfiledCount / cdsCdeCount * 100) : null;
            return { ds, stewards: cwStewards, cdsCdeCount, cdsRuleCount, cdsProfiledPct };
          });

        return { dir, owners, stewards, dataSetCount: dataSets.length,
          cdeCount, profiledCount, ruleCount, profiledPct, cdsWithStewards };
      });

      // Agency-level totals
      const agCdeCount      = branches.reduce((s, b) => s + b.cdeCount, 0);
      const agProfiledCount = branches.reduce((s, b) => s + b.profiledCount, 0);
      const agRuleCount     = branches.reduce((s, b) => s + b.ruleCount, 0);
      const agCdsCount      = branches.reduce((s, b) => s + b.dataSetCount, 0);
      // ERD: one owner per directorate max -- raw sum equals unique individual count
      const agOwnerCount    = branches.reduce((s, b) => s + b.owners.length, 0);
      // Stewards deduplicated by data_steward_id (same steward can span multiple CDS)
      const agStewardIds    = new Set(branches.flatMap(b => b.stewards.map(s => s.data_steward_id)));
      const agStewardCount  = agStewardIds.size;
      const agProfiledPct   = agCdeCount > 0 ? Math.round(agProfiledCount / agCdeCount * 100) : null;

      return { agency, patrons, branches, agCdeCount, agProfiledCount, agRuleCount, agCdsCount,
               agOwnerCount, agStewardCount, agProfiledPct };
    });
  }, [data, showRetired, myAgencyIds, profilingByKey, allocCountByCde]);

  function ProfilingSpan({ pct }) {
    if (pct === null)  return <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>no CDEs profiled</span>;
    if (pct === 0)     return <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>no CDEs profiled</span>;
    if (pct === 100)   return <span style={{ fontSize:11, color:'var(--green)', fontFamily:'var(--mono)' }}>100% profiled</span>;
    return <span style={{ fontSize:11, color:'var(--purple)', fontFamily:'var(--mono)' }}>{pct}% profiled</span>;
  }

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            Organisation
          </div>
          <div className="page-sub">
            Accountability hierarchy - patron, owners and stewards per agency
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6 }}>
          {canEdit && (
            <button className="btn btn-primary"
              style={{ fontSize:12, padding:'5px 12px' }}
              onClick={() => openForm('executive_agency', {
                executive_agency_id:      nextPk('executive_agency'),
                executive_agency_type_id: null,
                agency_acronymn:          null,
                agency_name:              null,
                retiring_timestamp:       null,
              })}>
              + Add Agency
            </button>
          )}
          <MyDataToggle
            active={myDataOnly}
            onToggle={function() { setMyDataOnly(function(v) { return !v; }); }}
            available={!!stewardIdentity}
            accent={accent}
          />
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
        </div>
      </div>

      {/* Agency rows */}
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {trees.map(({ agency, patrons, branches, agCdeCount, agProfiledCount, agRuleCount, agCdsCount,
                      agOwnerCount, agStewardCount, agProfiledPct }) => {
          const aid      = agency.executive_agency_id;
          const isOpen   = !!expanded[aid];
          const isRetired = !!agency.retiring_timestamp;
          const patron   = patrons[0] || null;

          return (
            <div key={aid} style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${isRetired ? 'var(--border)' : accent}`,
              borderRadius: 'var(--radius-lg)',
              opacity: isRetired ? 0.6 : 1,
            }}>
              {/* Agency header row -- clickable to expand */}
              <div style={{ display:'flex', alignItems:'center', gap:10,
                padding:'11px 14px', cursor:'pointer' }}
                onClick={() => toggleExpand(aid)}>

                {/* Chevron */}
                <div style={{ color:'var(--text3)', width:14, height:14, flexShrink:0,
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  transition:'transform 0.15s' }}>
                  <Icon.ChevronR/>
                </div>

                {/* Agency name + patron + stats */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                      {agency.agency_acronymn}
                    </span>
                    {agency.agency_name && (
                      <span style={{ fontWeight:400, color:'var(--text2)', fontSize:12 }}>
                        {agency.agency_name}
                      </span>
                    )}
                    {isRetired &&
                      <span className="badge badge-amber" style={{ fontSize:9 }}>retired</span>
                    }
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4,
                    marginTop:3, flexWrap:'wrap' }}>
                    <OrgRolePill label="Patron" color="#f5a623"/>
                    <span style={{ fontSize:11, fontFamily:'var(--mono)',
                      color: patron ? 'var(--text2)' : 'var(--text3)',
                      fontStyle: patron ? 'normal' : 'italic', marginRight:2 }}>
                      {patron ? patron.data_patron_name : 'none assigned'}
                    </span>
                    <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                      {mdot + ' ' + branches.length + ' directorate' + (branches.length !== 1 ? 's' : '') + ' ' + mdot + ' ' +
                       agOwnerCount + ' owner' + (agOwnerCount !== 1 ? 's' : '') + ' ' + mdot + ' ' +
                       agStewardCount + ' steward' + (agStewardCount !== 1 ? 's' : '') + ' ' + mdot + ' ' +
                       agCdsCount + ' CDS ' + mdot + ' ' +
                       agCdeCount + ' CDE' + (agCdeCount !== 1 ? 's' : '') + ' ' + mdot + ' ' +
                       agRuleCount + ' rules ' + mdot + ' '}
                    </span>
                    <ProfilingSpan pct={agProfiledPct}/>
                  </div>
                </div>

                {canEdit && (
                  <div onClick={e => e.stopPropagation()}
                    style={{ display:'flex', alignItems:'center', gap:2, flexShrink:0 }}>
                    {!isRetired && (
                      <button title="Add directorate to this agency" className="btn btn-ghost"
                        style={{ padding:'2px 8px', fontSize:10 }}
                        onClick={() => openForm('directorate', {
                          ...buildBlankRecord('directorate', nextPk, data),
                          executive_agency_id: aid,
                        })}>
                        + Directorate
                      </button>
                    )}
                    <button title="Edit agency" className="btn btn-ghost"
                      style={{ padding:'2px 6px', fontSize:10 }}
                      onClick={() => openForm('executive_agency', agency)}>
                      <Icon.Pencil/>
                    </button>
                    {isRetired ? (
                      <button title="Restore agency" className="btn btn-ghost"
                        style={{ padding:'2px 6px', fontSize:10 }}
                        onClick={() => restoreRecord('executive_agency', aid)}>
                        <Icon.Eye/>
                      </button>
                    ) : (
                      <button title="Retire agency" className="btn btn-ghost"
                        style={{ padding:'2px 6px', fontSize:10 }}
                        onClick={() => retireRecord('executive_agency', aid)}>
                        <Icon.EyeOff/>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded hierarchy */}
              {isOpen && (
                <div style={{ borderTop:'1px solid var(--border)',
                  padding:'12px 14px 14px 38px' }}>

                  {/* Directorate branches */}
                  {branches.length === 0 ? (
                    <div style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic',
                      paddingLeft:12 }}>
                      No directorates found.
                    </div>
                  ) : (
                    <div style={{ borderLeft:'1px solid var(--border2)', paddingLeft:12 }}>
                      {branches.map(({ dir, owners, stewards, dataSetCount,
                        cdeCount, profiledCount, ruleCount, profiledPct, cdsWithStewards }, idx) => {
                        const isLast    = idx === branches.length - 1;
                        const isDirOpen = !!expandedDirs[dir.directorate_id];
                        const owner     = owners[0] || null;
                        return (
                          <div key={dir.directorate_id} style={{
                            marginBottom: isLast ? 0 : 14,
                            paddingBottom: isLast ? 0 : 14,
                            borderBottom: isLast ? 'none' : '1px solid var(--border)',
                          }}>
                            {/* Directorate header row -- clickable to expand */}
                            {/* ERD: at most one data owner per directorate */}
                            <div style={{ display:'flex', alignItems:'center', gap:8,
                              cursor:'pointer', marginBottom: isDirOpen ? 0 : 0 }}
                              onClick={() => toggleDir(dir.directorate_id)}>

                              {/* Chevron */}
                              <div style={{ color:'var(--text3)', width:12, height:12,
                                flexShrink:0,
                                transform: isDirOpen ? 'rotate(90deg)' : 'none',
                                transition:'transform 0.15s' }}>
                                <Icon.ChevronR/>
                              </div>

                              {/* Name + owner + stats */}
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                                    {dir.directorate_name}
                                  </span>
                                  {dir.retiring_timestamp &&
                                    <span className="badge badge-amber" style={{ fontSize:9 }}>retired</span>
                                  }
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:4,
                                  marginTop:2, flexWrap:'wrap' }}>
                                  <OrgRolePill label="Owner" color={accent}/>
                                  <span style={{ fontSize:11, fontFamily:'var(--mono)',
                                    color: owner ? 'var(--text2)' : 'var(--text3)',
                                    fontStyle: owner ? 'normal' : 'italic', marginRight:2 }}>
                                    {owner ? owner.data_owner_name : 'none assigned'}
                                  </span>
                                  <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                                    {mdot + ' ' + stewards.length + ' steward' + (stewards.length !== 1 ? 's' : '') +
                                     ' ' + mdot + ' ' + dataSetCount + ' CDS' +
                                     ' ' + mdot + ' ' + cdeCount + ' CDE' + (cdeCount !== 1 ? 's' : '') +
                                     ' ' + mdot + ' ' + ruleCount + ' rules ' + mdot + ' '}
                                  </span>
                                  <ProfilingSpan pct={profiledPct}/>
                                </div>
                              </div>

                              {/* Edit / retire buttons */}
                              {canEdit && (
                                <div onClick={e => e.stopPropagation()}
                                  style={{ display:'flex', gap:2, flexShrink:0 }}>
                                  {!dir.retiring_timestamp && (
                                    <button title="Edit directorate" className="btn btn-ghost"
                                      style={{ padding:'2px 6px', fontSize:10 }}
                                      onClick={() => openForm('directorate', { ...dir })}>
                                      <Icon.Pencil/>
                                    </button>
                                  )}
                                  {dir.retiring_timestamp ? (
                                    <button title="Restore directorate" className="btn btn-ghost"
                                      style={{ padding:'2px 6px', fontSize:10 }}
                                      onClick={() => restoreRecord('directorate', dir.directorate_id)}>
                                      <Icon.Eye/>
                                    </button>
                                  ) : (
                                    <button title="Retire directorate" className="btn btn-ghost"
                                      style={{ padding:'2px 6px', fontSize:10 }}
                                      onClick={() => retireRecord('directorate', dir.directorate_id)}>
                                      <Icon.EyeOff/>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Directorate expanded: CDS table (read-only) */}
                            {isDirOpen && (
                              <div style={{ marginTop:8, paddingTop:6, paddingLeft:48 }}>
                                {cdsWithStewards.length === 0 ? (
                                  <div style={{ fontSize:12, color:'var(--text3)',
                                    fontStyle:'italic' }}>
                                    No critical data sets found.
                                  </div>
                                ) : (
                                  <div>
                                    {/* CDS rows */}
                                    {cdsWithStewards.map(({ ds, stewards: cdsStews,
                                      cdsCdeCount, cdsRuleCount, cdsProfiledPct }, ci) => (
                                      <div key={ds.critical_data_set_id}
                                        style={{ padding:'10px 0',
                                          borderBottom: ci < cdsWithStewards.length - 1
                                            ? '1px solid var(--border)' : 'none' }}>
                                        {/* CDS pill anchors all content to the right */}
                                        <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                                          <div style={{ flexShrink:0 }}>
                                            <OrgRolePill label="CDS" color="#5f7294"/>
                                          </div>
                                          <div style={{ minWidth:0 }}>
                                            {/* Row 1: name - stats */}
                                            <div style={{ display:'flex', alignItems:'center',
                                              gap:4, flexWrap:'wrap', marginBottom:5 }}>
                                              <span style={{ fontSize:12, fontWeight:600,
                                                color:'var(--text)' }}>
                                                {ds.data_set_name || '-'}
                                              </span>
                                              <span style={{ fontSize:11, color:'var(--text3)',
                                                fontFamily:'var(--mono)' }}>
                                                {mdot + ' ' +
                                                 cdsCdeCount + ' CDE' + (cdsCdeCount !== 1 ? 's' : '') +
                                                 ' ' + mdot + ' ' +
                                                 cdsRuleCount + ' rule' + (cdsRuleCount !== 1 ? 's' : '') +
                                                 ' ' + mdot + ' '}
                                              </span>
                                              <ProfilingSpan pct={cdsProfiledPct}/>
                                            </div>
                                            {/* Row 2: stewards */}
                                            <div style={{ display:'flex', flexDirection:'column',
                                              gap:4, marginBottom:6 }}>
                                              {cdsStews.length === 0
                                                ? <OrgNone/>
                                                : cdsStews.map(s => (
                                                    <div key={s.data_steward_id}
                                                      style={{ display:'flex', alignItems:'center', gap:6 }}>
                                                      <OrgRolePill
                                                        label={s.role_description || 'Steward'}
                                                        color={physAccent}/>
                                                      <span style={{ fontSize:12,
                                                        color:'var(--text2)', fontFamily:'var(--mono)' }}>
                                                        {s.data_steward_name}
                                                      </span>
                                                    </div>
                                                  ))
                                              }
                                            </div>
                                            {/* Row 3: description, aligned with steward pills */}
                                            <div style={{ fontSize:12, color:'var(--text2)',
                                              lineHeight:1.6 }}>
                                              {ds.data_set_description || '-'}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

