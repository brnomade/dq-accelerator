function CDECoverageScreen() {
  const { data } = useApp();
  const [filterAgencyId, setFilterAgencyId] = useState(null);
  const [expanded,       setExpanded]       = useState({});

  const cdes        = data?.critical_data_element || [];
  const cdSets      = data?.critical_data_set     || [];
  const dirs        = data?.directorate           || [];
  const agencies    = data?.executive_agency      || [];
  const allocs      = data?.data_quality_rule_allocation || [];
  const dims        = data?.quality_dimension     || [];
  const profiling   = data?.field_profiling       || [];

  const cdsById    = useMemo(() => Object.fromEntries(cdSets.map(d => [d.critical_data_set_id, d])),  [cdSets]);
  const dirById    = useMemo(() => Object.fromEntries(dirs.map(d   => [d.directorate_id, d])),        [dirs]);
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])), [agencies]);

  const profilingByKey = useMemo(() => {
    const m = {};
    for (const p of profiling) {
      if (!p.retiring_timestamp)
        m[`${p.source_database_name}|||${p.source_table_name}|||${p.source_field_name}`] = p;
    }
    return m;
  }, [profiling]);

  const accent = 'var(--green)';

  // Sorted dimensions
  const sortedDims = useMemo(() =>
    [...dims].filter(d => !d.retiring_timestamp)
      .sort((a,b) => (a.dimension_name||'').localeCompare(b.dimension_name||'')),
  [dims]);

  // Build allocation lookup: { cde_id: Set<dimension_id> }
  const allocByDim = useMemo(() => {
    const m = {};
    for (const a of allocs) {
      if (a.retiring_timestamp) continue;
      if (!m[a.critical_data_element_id]) m[a.critical_data_element_id] = new Set();
      m[a.critical_data_element_id].add(a.quality_dimension_id);
    }
    return m;
  }, [allocs]);

  // Agency options
  const agencyOpts = useMemo(() =>
    [...agencies].filter(a => !a.retiring_timestamp)
      .sort((a,b) => (a.agency_acronymn||'').localeCompare(b.agency_acronymn||'')),
  [agencies]);

  // Build agency -> cds -> table -> cdes hierarchy
  const grouped = useMemo(() => {
    const agMap = {};
    for (const cde of cdes) {
      if (cde.retiring_timestamp) continue;
      const cds    = cdsById[cde.critical_data_set_id];
      const dir    = cds ? dirById[cds.directorate_id] : null;
      const agency = dir ? agencyById[dir.executive_agency_id] : null;
      const aid    = agency?.executive_agency_id;
      if (filterAgencyId && aid !== filterAgencyId) continue;
      const dsid   = cds?.critical_data_set_id;
      const tbl    = cde.source_table_name || '__unknown__';
      if (!agMap[aid]) agMap[aid] = { agency, cdsMap: {} };
      if (!agMap[aid].cdsMap[dsid]) agMap[aid].cdsMap[dsid] = { cds, tableMap: {} };
      if (!agMap[aid].cdsMap[dsid].tableMap[tbl]) agMap[aid].cdsMap[dsid].tableMap[tbl] = [];
      agMap[aid].cdsMap[dsid].tableMap[tbl].push(cde);
    }

    const calcStats = (cdsList) => {
      const total   = cdsList.length;
      const fullCov = cdsList.filter(c =>
        sortedDims.every(d => allocByDim[c.critical_data_element_id]?.has(d.quality_dimension_id))
      ).length;
      const zeroCov = cdsList.filter(c =>
        !allocByDim[c.critical_data_element_id] ||
        allocByDim[c.critical_data_element_id].size === 0
      ).length;
      const partial = total - fullCov - zeroCov;
      const pct     = total > 0
        ? Math.round((cdsList.reduce((s, c) =>
            s + (allocByDim[c.critical_data_element_id]?.size || 0), 0)
          / (total * Math.max(sortedDims.length, 1))) * 100)
        : 0;
      return { total, fullCov, zeroCov, partial, pct };
    };

    return Object.values(agMap)
      .sort((a,b) => (a.agency?.agency_acronymn||'').localeCompare(b.agency?.agency_acronymn||''))
      .map(({ agency, cdsMap }) => ({
        agency,
        agencyKey: agency?.executive_agency_id,
        dataSets: Object.values(cdsMap)
          .sort((a,b) => (a.cds?.data_set_name||'').localeCompare(b.cds?.data_set_name||''))
          .map(({ cds, tableMap }) => {
            const tables = Object.entries(tableMap)
              .sort(([a],[b]) => a.localeCompare(b))
              .map(([tableName, cdsList]) => {
                const sorted = [...cdsList].sort((a,b) =>
                  (a.source_field_name||'').localeCompare(b.source_field_name||''));
                return { tableName, tableKey: `${cds?.critical_data_set_id}_${tableName}`,
                  cdes: sorted, ...calcStats(sorted) };
              });
            const allCdes = tables.flatMap(t => t.cdes);
            return { cds, cdsKey: cds?.critical_data_set_id, tables,
              ...calcStats(allCdes) };
          }),
      }));
  }, [cdes, cdsById, dirById, agencyById, filterAgencyId, allocs, sortedDims, allocByDim]);

  // Summary totals
  const totals = useMemo(() => {
    let full = 0, part = 0, zero = 0;
    for (const { dataSets } of grouped)
      for (const ds of dataSets) { full += ds.fullCov; part += ds.partial; zero += ds.zeroCov; }
    return { full, part, zero };
  }, [grouped]);

  const toggleKey = (k) => setExpanded(prev => ({ ...prev, [k]: !prev[k] }));

  const dimW = Math.max(60, Math.floor(320 / Math.max(sortedDims.length, 1)));

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            CDE Coverage
          </div>
          <div className="page-sub">
            Rule coverage across critical data elements by quality dimension.
          </div>
        </div>
        {/* Agency filter */}
        <select value={filterAgencyId ?? ''} style={{ fontSize:12, padding:'5px 10px',
          background:'var(--bg3)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', color:'var(--text)', cursor:'pointer', marginTop:4 }}
          onChange={e => { setFilterAgencyId(e.target.value ? parseInt(e.target.value) : null); setExpanded({}); }}>
          <option value="">All agencies</option>
          {agencyOpts.map(a => <option key={a.executive_agency_id} value={a.executive_agency_id}>{a.agency_acronymn} - {a.agency_name}</option>)}
        </select>
      </div>

      {/* Summary bar */}
      <div style={{ display:'flex', gap:10, marginBottom:20 }}>
        {[
          { label:'Full coverage', value:totals.full, color:'var(--green)', bg:'rgba(34,201,142,0.08)', border:'rgba(34,201,142,0.3)' },
          { label:'Partial coverage', value:totals.part, color:'var(--amber)', bg:'rgba(245,166,35,0.08)', border:'rgba(245,166,35,0.3)' },
          { label:'No coverage', value:totals.zero, color:'var(--red-vivid)', bg:'rgba(224,82,82,0.08)', border:'rgba(224,82,82,0.3)' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} style={{ padding:'10px 18px', background:bg,
            border:`1px solid ${border}`, borderRadius:'var(--radius-lg)',
            display:'flex', flexDirection:'column', gap:4, flex:1 }}>
            <div style={{ fontSize:22, fontWeight:700, fontFamily:'var(--mono)', color }}>{value}</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Agency cards */}
      {grouped.length === 0 ? (
        <div className="status-row status-info">No data to display.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {grouped.map(({ agency, agencyKey, dataSets }) => {
            const agOpen = !!expanded[agencyKey];
            const agTotal = dataSets.reduce((s, ds) => s + ds.total, 0);
            const agFull  = dataSets.reduce((s, ds) => s + ds.fullCov, 0);
            const agZero  = dataSets.reduce((s, ds) => s + ds.zeroCov, 0);
            const agPart  = agTotal - agFull - agZero;
            return (
              <div key={agencyKey} style={{ background:'var(--bg2)',
                border:'1px solid var(--border)', borderLeft:`3px solid ${accent}`,
                borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
                {/* Agency header */}
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px',
                  cursor:'pointer', background: agOpen ? 'var(--bg3)' : 'var(--bg2)' }}
                  onClick={() => toggleKey(agencyKey)}>
                  <div style={{ color: agOpen ? accent : 'var(--text3)', width:14, height:14,
                    flexShrink:0, transform: agOpen ? 'rotate(90deg)' : 'none',
                    transition:'transform 0.15s' }}>
                    <Icon.ChevronR/>
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                    {agency?.agency_acronymn}
                  </span>
                  <span style={{ fontSize:11, color:'var(--text3)' }}>{agency?.agency_name}</span>
                  <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                    <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--green)' }}>{agFull} full</span>
                    <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--amber)' }}>{agPart} partial</span>
                    <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--red-vivid)' }}>{agZero} none</span>
                    <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)',
                      marginLeft:4 }}>{agTotal} CDEs</span>
                  </div>
                </div>

                {/* Data sets */}
                {agOpen && (
                  <div style={{ borderTop:'1px solid var(--border)', padding:'10px 14px',
                    display:'flex', flexDirection:'column', gap:8 }}>
                    {dataSets.map(({ cds, cdsKey, tables, total, fullCov, zeroCov, partial, pct }) => {
                      const cdsOpen = !!expanded[cdsKey];
                      // Coverage bar colour
                      const barColor = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--red-vivid)';
                      return (
                        <div key={cdsKey} style={{ border:'1px solid var(--border)',
                          borderLeft:`2px solid ${barColor}`,
                          borderRadius:'var(--radius)', overflow:'hidden' }}>
                          {/* CDS header */}
                          <div style={{ display:'flex', alignItems:'center', gap:10,
                            padding:'8px 12px', cursor:'pointer',
                            background: cdsOpen ? 'var(--bg)' : 'var(--bg3)' }}
                            onClick={() => toggleKey(cdsKey)}>
                            <div style={{ color: cdsOpen ? accent : 'var(--text3)',
                              width:12, height:12, flexShrink:0,
                              transform: cdsOpen ? 'rotate(90deg)' : 'none',
                              transition:'transform 0.15s' }}>
                              <Icon.ChevronR/>
                            </div>
                            <span style={{ fontSize:12, fontWeight:500, color:'var(--text)', flex:1 }}>
                              {cds?.data_set_name}
                            </span>
                            {/* Mini coverage bar */}
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ width:80, height:5, background:'var(--bg)',
                                borderRadius:3, overflow:'hidden',
                                border:'1px solid var(--border)' }}>
                                <div style={{ width:`${pct}%`, height:'100%',
                                  background:barColor, transition:'width 0.3s' }}/>
                              </div>
                              <span style={{ fontSize:11, fontFamily:'var(--mono)',
                                color:barColor, fontWeight:600, minWidth:34 }}>
                                {pct}%
                              </span>
                              <span style={{ fontSize:10, color:'var(--green)', fontFamily:'var(--mono)' }}>{fullCov} full</span>
                              <span style={{ fontSize:10, color:'var(--amber)', fontFamily:'var(--mono)' }}>{partial} part</span>
                              <span style={{ fontSize:10, color:'var(--red-vivid)', fontFamily:'var(--mono)' }}>{zeroCov} none</span>
                              <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)',
                                marginLeft:2 }}>{total} CDEs</span>
                            </div>
                          </div>

                          {/* CDE matrix grouped by table */}
                          {cdsOpen && (
                            <div style={{ borderTop:'1px solid var(--border)' }}>
                              {tables.map(({ tableName, tableKey, cdes: cdsList, pct: tPct, fullCov: tFull, zeroCov: tZero, partial: tPart, total: tTotal }) => {
                                const tblOpen  = !!expanded[tableKey];
                                const tblColor = tPct >= 80 ? 'var(--green)' : tPct >= 40 ? 'var(--amber)' : 'var(--red-vivid)';
                                return (
                                  <div key={tableKey}>
                                    {/* Table sub-header */}
                                    <div style={{ display:'flex', alignItems:'center', gap:8,
                                      padding:'6px 14px', cursor:'pointer',
                                      background: tblOpen ? 'var(--bg2)' : 'var(--bg)',
                                      borderBottom:'1px solid var(--border)' }}
                                      onClick={() => toggleKey(tableKey)}>
                                      <div style={{ color: tblOpen ? accent : 'var(--text3)',
                                        width:11, height:11, flexShrink:0,
                                        transform: tblOpen ? 'rotate(90deg)' : 'none',
                                        transition:'transform 0.15s' }}>
                                        <Icon.ChevronR/>
                                      </div>
                                      <span style={{ fontSize:11, fontFamily:'var(--mono)',
                                        fontWeight:600, color: tblOpen ? accent : 'var(--text2)',
                                        flex:1 }}>
                                        {tableName === '__unknown__' ? 'no table assigned' : tableName}
                                      </span>
                                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                        <div style={{ width:60, height:4, background:'var(--bg3)',
                                          borderRadius:2, overflow:'hidden' }}>
                                          <div style={{ width:`${tPct}%`, height:'100%',
                                            background:tblColor }}/>
                                        </div>
                                        <span style={{ fontSize:10, fontFamily:'var(--mono)',
                                          color:tblColor, fontWeight:600, minWidth:28 }}>
                                          {tPct}%
                                        </span>
                                        <span style={{ fontSize:10, color:'var(--text3)',
                                          fontFamily:'var(--mono)' }}>
                                          {tTotal} field{tTotal!==1?'s':''}
                                        </span>
                                      </div>
                                    </div>

                                    {/* CDE rows for this table */}
                                    {tblOpen && (
                                      <div style={{ overflowX:'auto' }}>
                                        <table style={{ width:'100%', borderCollapse:'collapse',
                                          fontSize:11, tableLayout:'auto' }}>
                                          <thead>
                                            <tr style={{ background:'var(--bg)' }}>
                                              <th style={{ padding:'5px 14px 5px 24px',
                                                textAlign:'left', fontWeight:600,
                                                color:'var(--text3)', fontSize:10,
                                                letterSpacing:'0.05em', textTransform:'uppercase',
                                                borderBottom:'1px solid var(--border)',
                                                whiteSpace:'nowrap', minWidth:160 }}>
                                                Field
                                              </th>
                                              {sortedDims.map(d => (
                                                <th key={d.quality_dimension_id}
                                                  style={{ padding:'5px 8px', textAlign:'center',
                                                    fontWeight:600, color:'var(--text3)', fontSize:10,
                                                    letterSpacing:'0.05em', textTransform:'uppercase',
                                                    borderBottom:'1px solid var(--border)',
                                                    whiteSpace:'nowrap', width:dimW }}>
                                                  {d.dimension_name}
                                                </th>
                                              ))}
                                              <th style={{ padding:'5px 10px', textAlign:'center',
                                                fontWeight:600, color:'var(--text3)', fontSize:10,
                                                letterSpacing:'0.05em', textTransform:'uppercase',
                                                borderBottom:'1px solid var(--border)',
                                                whiteSpace:'nowrap' }}>
                                                Coverage
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {cdsList.map((cde, idx) => {
                                              const covered    = allocByDim[cde.critical_data_element_id] || new Set();
                                              const covCount   = covered.size;
                                              const covPct     = sortedDims.length > 0
                                                ? Math.round((covCount / sortedDims.length) * 100) : 0;
                                              const rowBg      = covCount === 0 ? 'rgba(224,82,82,0.06)'
                                                : covCount === sortedDims.length ? 'rgba(34,201,142,0.04)'
                                                : 'transparent';
                                              const profKey    = `${cde.source_database_name}|||${cde.source_table_name}|||${cde.source_field_name}`;
                                              const hasProfile = !!profilingByKey[profKey];
                                              return (
                                                <tr key={cde.critical_data_element_id}
                                                  style={{ background:rowBg,
                                                    borderBottom: idx < cdsList.length - 1
                                                      ? '1px solid var(--border)' : 'none' }}>
                                                  <td style={{ padding:'5px 14px 5px 24px',
                                                    fontFamily:'var(--mono)', fontWeight:500,
                                                    color:'var(--text)', whiteSpace:'nowrap' }}>
                                                    <span style={{ marginRight:6 }}>
                                                      {cde.source_field_name}
                                                    </span>
                                                    {hasProfile && (
                                                      <span
                                                        title={`Profiled ${profilingByKey[profKey].profiled_at}`}
                                                        style={{ fontSize:9, fontFamily:'var(--mono)',
                                                          fontWeight:600, color:'var(--purple)',
                                                          background:'rgba(124,92,191,0.12)',
                                                          border:'1px solid rgba(124,92,191,0.35)',
                                                          borderRadius:3, padding:'1px 5px',
                                                          verticalAlign:'middle' }}>
                                                        profiled
                                                      </span>
                                                    )}
                                                  </td>
                                                  {sortedDims.map(d => {
                                                    const has = covered.has(d.quality_dimension_id);
                                                    return (
                                                      <td key={d.quality_dimension_id}
                                                        style={{ padding:'5px 4px', textAlign:'center' }}
                                                        title={has
                                                          ? `${d.dimension_name}: allocated`
                                                          : `${d.dimension_name}: no rule`}>
                                                        {has ? (
                                                          <span style={{ color:accent, fontSize:14 }}>&#9679;</span>
                                                        ) : (
                                                          <span style={{ color:'var(--text3)', fontSize:12 }}>&#8212;</span>
                                                        )}
                                                      </td>
                                                    );
                                                  })}
                                                  <td style={{ padding:'5px 10px', textAlign:'center',
                                                    fontFamily:'var(--mono)', fontSize:11, fontWeight:600,
                                                    color: covCount === 0 ? 'var(--red-vivid)'
                                                      : covCount === sortedDims.length ? 'var(--green)'
                                                      : 'var(--amber)',
                                                    whiteSpace:'nowrap' }}>
                                                    {covCount}/{sortedDims.length}
                                                    <span style={{ fontSize:9, fontWeight:400,
                                                      color:'var(--text3)', marginLeft:3 }}>
                                                      ({covPct}%)
                                                    </span>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                          {/* Dimension totals footer */}
                                          <tfoot>
                                            <tr style={{ background:'var(--bg)',
                                              borderTop:'2px solid var(--border)' }}>
                                              <td style={{ padding:'4px 14px 4px 24px',
                                                fontSize:10, fontWeight:600, color:'var(--text3)',
                                                textTransform:'uppercase', letterSpacing:'0.05em' }}>
                                                Coverage
                                              </td>
                                              {sortedDims.map(d => {
                                                const cnt  = cdsList.filter(c =>
                                                  allocByDim[c.critical_data_element_id]?.has(d.quality_dimension_id)
                                                ).length;
                                                const dpct = cdsList.length > 0
                                                  ? Math.round((cnt / cdsList.length) * 100) : 0;
                                                const col  = dpct >= 80 ? 'var(--green)' : dpct >= 40 ? 'var(--amber)' : 'var(--red-vivid)';
                                                return (
                                                  <td key={d.quality_dimension_id}
                                                    style={{ padding:'4px 4px', textAlign:'center' }}>
                                                    <span style={{ fontSize:10, fontFamily:'var(--mono)',
                                                      fontWeight:600, color:col }}>{dpct}%</span>
                                                  </td>
                                                );
                                              })}
                                              <td/>
                                            </tr>
                                          </tfoot>
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// FIELD PROFILING
// ===============================================================================

const SEMANTIC_TYPES = ['STRING','NUMERIC','DATE','BOOLEAN','CATEGORICAL','FREE_TEXT'];

// Generate profiling SQL based on physical/semantic type
