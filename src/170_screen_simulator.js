// ===============================================================================
// DQ SCORE SIMULATOR
// ===============================================================================

// Criticality level name -> score value
const CRIT_LEVEL_SCORES = {
  'very low': 0, 'low': 6, 'medium': 12, 'high': 17, 'very high': 25,
};

// Overall score -> human-readable criticality label
// Boundaries at midpoints between CRIT_LEVEL_SCORES values (0, 6, 12, 17, 25)
function scoreToLabel(score) {
  if (score >= 21)   return 'Very High';
  if (score >= 14.5) return 'High';
  if (score >= 9)    return 'Medium';
  if (score >= 3)    return 'Low';
  return 'Very Low';
}

// Overall score (0-25) -> relative criticality score (0.00-1.00)
const RELATIVE_SCORE_TABLE = [
  0.00,0.04,0.08,0.12,0.16,0.20,0.24,0.28,0.32,0.36,
  0.40,0.44,0.48,0.52,0.56,0.60,0.64,0.68,0.72,0.76,
  0.80,0.84,0.88,0.92,0.96,1.00,
];

function getRelativeScore(overallScore) {
  const idx = Math.round(Math.min(Math.max(overallScore, 0), 25));
  return RELATIVE_SCORE_TABLE[idx];
}

// Bumper adjustment: bumper 1 = no change, bumper 5 = green at 1.00
// adjusted = original + (bumper-1)/4 * (1.00 - original)
function applyBumper(relScore, bumper) {
  if (!bumper || bumper <= 1) return relScore;
  const b = Math.min(Math.max(bumper, 1), 5);
  return relScore + ((b - 1) / 4) * (1.00 - relScore);
}

function getRagLabel(passRate, greenThresh) {
  const amberThresh = greenThresh - 0.10;
  if (passRate >= greenThresh) return 'GREEN';
  if (passRate >= amberThresh) return 'AMBER';
  return 'RED';
}

function RagBadge({ label, size }) {
  const colours = {
    GREEN: { bg:'#1a3a2a', border:'var(--green)', text:'var(--green)' },
    AMBER: { bg:'#3a2e0a', border:'var(--amber)', text:'var(--amber)' },
    RED:   { bg:'#3a1a1a', border:'var(--red-vivid)', text:'var(--red-vivid)' },
    '-':   { bg:'var(--bg3)', border:'var(--border)', text:'var(--text3)' },
  };
  const c = colours[label] || colours['-'];
  const sz = size || 'md';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      fontSize: sz === 'lg' ? 13 : 11,
      fontWeight: 700, fontFamily:'var(--mono)',
      letterSpacing:'0.06em',
      padding: sz === 'lg' ? '4px 14px' : '2px 8px',
      borderRadius: 4,
      background: c.bg, border:`1px solid ${c.border}`, color: c.text,
    }}>
      {label}
    </span>
  );
}

function DQSimulatorScreen() {
  const { data, upsertRecord } = useApp();
  const [savedBumpers,    setSavedBumpers]    = useState({});
  const [critOverrides,   setCritOverrides]   = useState({}); // { [cde_criticality_id]: criticality_level_id }
  const [savedCrit,       setSavedCrit]       = useState(false);

  // Cascading CDE selection
  const [filterAgencyId, setFilterAgencyId] = useState(null);
  const [filterDirId,    setFilterDirId]    = useState(null);
  const [filterCdsId,    setFilterCdsId]    = useState(null);
  const [selectedCdeId,  setSelectedCdeId]  = useState(null);

  // Per-rule sample inputs: { [allocationId]: { sampleSize, failingCount } }
  const [inputs, setInputs] = useState({});

  const cdes        = data?.critical_data_element || [];
  const cdSets      = data?.critical_data_set     || [];
  const dirs        = data?.directorate           || [];
  const agencies    = data?.executive_agency      || [];
  const allocs      = data?.data_quality_rule_allocation || [];
  const rules       = data?.data_quality_rule     || [];
  const critRows    = data?.cde_criticality        || [];
  const critGroups  = data?.criticality_group      || [];
  const critLevels  = data?.criticality_level      || [];
  const dims        = data?.quality_dimension      || [];
  const groupWeights = data?.criticality_group_weight || [];

  const cdsById     = useMemo(() => Object.fromEntries(cdSets.map(d => [d.critical_data_set_id, d])),  [cdSets]);
  const dirById     = useMemo(() => Object.fromEntries(dirs.map(d   => [d.directorate_id, d])),        [dirs]);
  const agencyById  = useMemo(() => Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])), [agencies]);
  const ruleById    = useMemo(() => Object.fromEntries(rules.map(r  => [r.data_quality_rule_id, r])),  [rules]);
  const dimById     = useMemo(() => Object.fromEntries(dims.map(d   => [d.quality_dimension_id, d])),  [dims]);
  const groupById   = useMemo(() => Object.fromEntries(critGroups.map(g => [g.criticality_group_id, g])), [critGroups]);
  const levelById   = useMemo(() => Object.fromEntries(critLevels.map(l => [l.criticality_level_id, l])), [critLevels]);

  // Per-group weights for the currently selected agency (group_id -> weight_value)
  // Falls back to weight 1 for any group not found in the table
  const agencyGroupWeights = useMemo(() => {
    if (!filterAgencyId) return {};
    return Object.fromEntries(
      groupWeights
        .filter(w => w.executive_agency_id === filterAgencyId && !w.retiring_timestamp)
        .map(w => [w.criticality_group_id, w.weight_value])
    );
  }, [groupWeights, filterAgencyId]);

  // Cascading options
  const agencyOpts = useMemo(() =>
    [...agencies].filter(a => !a.retiring_timestamp)
      .sort((a,b) => (a.agency_acronymn||'').localeCompare(b.agency_acronymn||'')), [agencies]);
  const dirOpts = useMemo(() =>
    [...dirs].filter(d => !d.retiring_timestamp && d.executive_agency_id === filterAgencyId)
      .sort((a,b) => (a.directorate_name||'').localeCompare(b.directorate_name||'')), [dirs, filterAgencyId]);
  const cdsOpts = useMemo(() =>
    [...cdSets].filter(d => !d.retiring_timestamp && d.directorate_id === filterDirId)
      .sort((a,b) => (a.data_set_name||'').localeCompare(b.data_set_name||'')), [cdSets, filterDirId]);
  const cdeOpts = useMemo(() =>
    [...cdes].filter(c => !c.retiring_timestamp && c.critical_data_set_id === filterCdsId)
      .sort((a,b) => (a.source_field_name||'').localeCompare(b.source_field_name||'')), [cdes, filterCdsId]);

  // Selected CDE details
  const cde    = selectedCdeId ? cdes.find(c => c.critical_data_element_id === selectedCdeId) : null;
  const cds    = cde ? cdsById[cde.critical_data_set_id] : null;
  const dir    = cds ? dirById[cds.directorate_id] : null;
  const agency = dir ? agencyById[dir.executive_agency_id] : null;

  // Criticality for this CDE
  const cdeCritRows = useMemo(() =>
    critRows.filter(r => r.critical_data_element_id === selectedCdeId && !r.retiring_timestamp),
  [critRows, selectedCdeId]);

  // Group order: OPS, POL, REP, STRAT
  const GROUP_ORDER = ['OPS','POL','REP','STRAT'];
  const sortedCritRows = useMemo(() =>
    [...cdeCritRows].sort((a,b) => {
      const ga = groupById[a.criticality_group_id]?.criticality_group_acronymn || '';
      const gb = groupById[b.criticality_group_id]?.criticality_group_acronymn || '';
      const ia = GROUP_ORDER.indexOf(ga); const ib = GROUP_ORDER.indexOf(gb);
      if (ia !== -1 && ib !== -1) return ia - ib;
      return ga.localeCompare(gb);
    }), [cdeCritRows, groupById]);

  // Calculate overall criticality score using per-agency group weights
  // Falls back to equal weighting if no weights are defined for a group
  const overallCritScore = useMemo(() => {
    if (sortedCritRows.length === 0) return null;
    const weighted = sortedCritRows.map(r => {
      const effectiveLevelId = critOverrides[r.cde_criticality_id] ?? r.criticality_level_id;
      const lvl    = levelById[effectiveLevelId];
      const desc   = (lvl?.criticality_description || '').toLowerCase();
      const score  = CRIT_LEVEL_SCORES[desc] ?? 0;
      const weight = agencyGroupWeights[r.criticality_group_id] ?? 1;
      return { score, weight };
    });
    const totalWeight = weighted.reduce((s, { weight }) => s + weight, 0);
    if (totalWeight === 0) return 0;
    return weighted.reduce((s, { score, weight }) => s + score * weight, 0) / totalWeight;
  }, [sortedCritRows, levelById, critOverrides, agencyGroupWeights]);

  const relativeScore = overallCritScore !== null ? getRelativeScore(overallCritScore) : null;

  // Rule allocations for selected CDE
  const cdeAllocs = useMemo(() =>
    allocs.filter(a => a.critical_data_element_id === selectedCdeId && !a.retiring_timestamp),
  [allocs, selectedCdeId]);

  const setInput = (allocId, field, value) => {
    setInputs(prev => ({
      ...prev,
      [allocId]: { ...(prev[allocId] || {}), [field]: value },
    }));
  };

  // Summary counts
  const results = useMemo(() => {
    if (relativeScore === null) return [];
    return cdeAllocs.map(alloc => {
      const allocId   = alloc.data_quality_rule_allocation_id;
      const inp       = inputs[allocId] || {};
      const sample    = parseInt(inp.sampleSize   ?? 1000, 10) || 0;
      const failing   = parseInt(inp.failingCount ?? 1,    10) || 0;
      const bumperVal = inp.bumper !== undefined ? inp.bumper : (alloc.bumper_value ?? 1);
      if (sample === 0) return { alloc, passRate: null, rag: '-', greenThresh: null, amberThresh: null };
      const passRate   = Math.max(0, (sample - failing) / sample);
      const adjusted   = applyBumper(relativeScore, bumperVal);
      const rag        = getRagLabel(passRate, adjusted);
      return { alloc, passRate, rag,
        greenThresh: adjusted,
        amberThresh: adjusted - 0.10 };
    });
  }, [cdeAllocs, inputs, relativeScore]);

  const counts = useMemo(() => ({
    green: results.filter(r => r.rag === 'GREEN').length,
    amber: results.filter(r => r.rag === 'AMBER').length,
    red:   results.filter(r => r.rag === 'RED').length,
    total: results.filter(r => r.rag !== '-').length,
  }), [results]);

  const accent = '#18b4d4';
  const inputBase = {
    padding:'5px 8px', fontSize:12, width:'100%', textAlign:'right',
    background:'var(--bg)', border:'1px solid var(--border)',
    borderRadius:'var(--radius)', color:'var(--text)',
    fontFamily:'var(--mono)', outline:'none',
  };

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ marginBottom:20 }}>
        <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
          RAG Simulator
        </div>
        <div className="page-sub">
          Select a CDE, then enter sample measurements per rule to calculate RAG ratings.
        </div>
      </div>

      {/* STEP 1 -- Select CDE */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
        borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
        padding:'16px 18px', marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
          textTransform:'uppercase', color:accent, marginBottom:12 }}>
          Step 1 - Select Critical Data Element
        </div>

        {/* Cascading dropdowns */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:12 }}>
          <select value={filterAgencyId ?? ''} style={{ ...inputBase, textAlign:'left', cursor:'pointer' }}
            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
              setFilterAgencyId(v); setFilterDirId(null); setFilterCdsId(null); setSelectedCdeId(null); setInputs({}); }}>
            <option value="">-- agency --</option>
            {agencyOpts.map(a => <option key={a.executive_agency_id} value={a.executive_agency_id}>{a.agency_acronymn}</option>)}
          </select>
          <select value={filterDirId ?? ''} disabled={!filterAgencyId}
            style={{ ...inputBase, textAlign:'left', cursor: filterAgencyId ? 'pointer' : 'not-allowed', opacity: filterAgencyId ? 1 : 0.5 }}
            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
              setFilterDirId(v); setFilterCdsId(null); setSelectedCdeId(null); setInputs({}); }}>
            <option value="">{filterAgencyId ? '-- directorate --' : '-- select agency first --'}</option>
            {dirOpts.map(d => <option key={d.directorate_id} value={d.directorate_id}>{d.directorate_name}</option>)}
          </select>
          <select value={filterCdsId ?? ''} disabled={!filterDirId}
            style={{ ...inputBase, textAlign:'left', cursor: filterDirId ? 'pointer' : 'not-allowed', opacity: filterDirId ? 1 : 0.5 }}
            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
              setFilterCdsId(v); setSelectedCdeId(null); setInputs({}); }}>
            <option value="">{filterDirId ? '-- data set --' : '-- select directorate first --'}</option>
            {cdsOpts.map(d => <option key={d.critical_data_set_id} value={d.critical_data_set_id}>{d.data_set_name}</option>)}
          </select>
          <select value={selectedCdeId ?? ''} disabled={!filterCdsId}
            style={{ ...inputBase, textAlign:'left', cursor: filterCdsId ? 'pointer' : 'not-allowed', opacity: filterCdsId ? 1 : 0.5 }}
            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
              setSelectedCdeId(v); setInputs({}); setCritOverrides({}); setSavedCrit(false); }}>
            <option value="">{filterCdsId ? '-- field --' : '-- select data set first --'}</option>
            {cdeOpts.map(c => <option key={c.critical_data_element_id} value={c.critical_data_element_id}>{c.source_field_name}</option>)}
          </select>
        </div>

        {/* CDE summary + criticality */}
        {cde && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>

            {/* Row 1: CDE identity -- full width */}
            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:'10px 14px' }}>
              <div style={{ fontSize:13, fontFamily:'var(--mono)', fontWeight:600,
                color:'var(--text)', marginBottom:4 }}>
                {cde.source_field_name}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                {[cde.source_database_name, cde.source_table_name].filter(Boolean).join('.')}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                {[cds?.data_set_name, agency?.agency_acronymn].filter(Boolean).join(' - ')}
              </div>
            </div>

            {/* Row 2: 4 criticality panels left + overall score right */}
            <div style={{ display:'flex', gap:10, alignItems:'stretch' }}>

              {/* Left: 4 group panels -- editable */}
              {sortedCritRows.length > 0 ? (
                <div style={{ display:'flex', flexDirection:'column', gap:8, flex:1 }}>
                  <div style={{ display:'flex', gap:8 }}>
                    {sortedCritRows.map(r => {
                      const grp             = groupById[r.criticality_group_id];
                      const effectiveLevelId = critOverrides[r.cde_criticality_id] ?? r.criticality_level_id;
                      const lvl             = levelById[effectiveLevelId];
                      const desc            = (lvl?.criticality_description || '').toLowerCase();
                      const score           = CRIT_LEVEL_SCORES[desc] ?? 0;
                      const isChanged       = critOverrides[r.cde_criticality_id] !== undefined &&
                        critOverrides[r.cde_criticality_id] !== r.criticality_level_id;
                      // Sorted levels: Very Low -> Very High
                      const levelOpts = [...critLevels]
                        .filter(l => !l.retiring_timestamp)
                        .sort((a,b) => (a.criticality_score??0) - (b.criticality_score??0));
                      return (
                        <div key={r.cde_criticality_id} style={{
                          display:'flex', flexDirection:'column', alignItems:'center',
                          gap:6, padding:'10px 10px',
                          background:'var(--bg3)',
                          border: isChanged
                            ? `1px solid ${accent}`
                            : '1px solid var(--border)',
                          borderRadius:'var(--radius)', flex:1,
                        }}>
                          <span style={{ fontSize:9, fontWeight:700, fontFamily:'var(--mono)',
                            color:accent, letterSpacing:'0.08em' }}>
                            {grp?.criticality_group_acronymn}
                          </span>
                          <select
                            value={effectiveLevelId ?? ''}
                            onChange={e => {
                              const val = e.target.value ? parseInt(e.target.value) : null;
                              setCritOverrides(prev => ({ ...prev, [r.cde_criticality_id]: val }));
                              setSavedCrit(false);
                            }}
                            style={{ width:'100%', padding:'3px 6px', fontSize:11,
                              background:'var(--bg)', border:'1px solid var(--border)',
                              borderRadius:'var(--radius)', color:'var(--text)',
                              fontFamily:'var(--sans)', cursor:'pointer', textAlign:'center' }}>
                            {levelOpts.map(l => (
                              <option key={l.criticality_level_id} value={l.criticality_level_id}>
                                {l.criticality_description}
                              </option>
                            ))}
                          </select>
                          <span style={{ fontSize:11, fontFamily:'var(--mono)',
                            color: isChanged ? accent : 'var(--text3)', fontWeight: isChanged ? 600 : 400 }}>
                            {score}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Save criticality button -- only shown when overrides exist */}
                  {Object.keys(critOverrides).some(k =>
                    critOverrides[k] !== sortedCritRows.find(r => r.cde_criticality_id === parseInt(k))?.criticality_level_id
                  ) && (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <button
                        onClick={() => {
                          for (const r of sortedCritRows) {
                            const newLevelId = critOverrides[r.cde_criticality_id];
                            if (newLevelId && newLevelId !== r.criticality_level_id) {
                              upsertRecord('cde_criticality', { ...r, criticality_level_id: newLevelId });
                            }
                          }
                          setSavedCrit(true);
                          setTimeout(() => setSavedCrit(false), 2000);
                        }}
                        style={{ fontSize:10, padding:'3px 10px', cursor:'pointer',
                          background:'var(--accent)', border:'none',
                          borderRadius:'var(--radius)', color:'#fff',
                          fontWeight:600, fontFamily:'var(--mono)' }}>
                        Apply
                      </button>
                      <button
                        onClick={() => { setCritOverrides({}); setSavedCrit(false); }}
                        style={{ fontSize:10, padding:'3px 8px', cursor:'pointer',
                          background:'transparent',
                          border:'1px solid var(--border)',
                          borderRadius:'var(--radius)', color:'var(--text3)',
                          fontFamily:'var(--mono)' }}>
                        Reset
                      </button>
                      {savedCrit && (
                        <span style={{ fontSize:10, color:'var(--green)',
                          fontFamily:'var(--mono)', fontWeight:600 }}>
                          Saved
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ flex:1, fontSize:11, color:'var(--amber)', padding:'10px 14px',
                  background:'var(--bg3)', border:'1px solid var(--amber)',
                  borderRadius:'var(--radius)' }}>
                  No criticality data for this CDE.
                </div>
              )}

              {/* Right: overall score + RAG thresholds */}
              {overallCritScore !== null && (
                <div style={{ display:'flex', gap:0, alignItems:'stretch',
                  background:'var(--bg3)', border:'1px solid var(--border)',
                  borderRadius:'var(--radius)', overflow:'hidden', flexShrink:0 }}>
                  {/* Overall score */}
                  <div style={{ padding:'10px 18px', display:'flex', flexDirection:'column',
                    justifyContent:'center', borderRight:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10, color:'var(--text3)', marginBottom:4 }}>
                      Overall score
                    </div>
                    <div style={{ fontSize:22, fontWeight:700, fontFamily:'var(--mono)',
                      color:accent, lineHeight:1 }}>
                      {overallCritScore.toFixed(1)}
                    </div>
                    <div style={{ fontSize:10, color:accent, marginTop:2, fontWeight:600 }}>
                      {scoreToLabel(overallCritScore)}
                    </div>
                  </div>
                  {/* Relative score */}
                  <div style={{ padding:'10px 18px', display:'flex', flexDirection:'column',
                    justifyContent:'center', borderRight:'1px solid var(--border)' }}>
                    <div style={{ fontSize:10, color:'var(--text3)', marginBottom:4 }}>
                      Relative score
                    </div>
                    <div style={{ fontSize:22, fontWeight:700, fontFamily:'var(--mono)',
                      color:'var(--text)', lineHeight:1 }}>
                      {(relativeScore * 100).toFixed(0)}%
                    </div>
                  </div>
                  {/* RAG thresholds */}
                  <div style={{ padding:'10px 16px', display:'flex', flexDirection:'column',
                    justifyContent:'center', gap:4 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:9, fontWeight:700, color:'var(--red-vivid)',
                        fontFamily:'var(--mono)', width:36 }}>RED</span>
                      <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--red-vivid)' }}>
                        &lt; {((relativeScore - 0.10) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:9, fontWeight:700, color:'var(--amber)',
                        fontFamily:'var(--mono)', width:36 }}>AMBER</span>
                      <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--amber)' }}>
                        &ge; {((relativeScore - 0.10) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:9, fontWeight:700, color:'var(--green)',
                        fontFamily:'var(--mono)', width:36 }}>GREEN</span>
                      <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--green)' }}>
                        &ge; {(relativeScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* STEP 2 -- Rule measurements */}
      {cde && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
          borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
          padding:'16px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:accent }}>
              Step 2 - Rule Measurements
            </div>
            {/* Summary bar */}
            {counts.total > 0 && (
              <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
                {counts.red   > 0 && <span style={{ fontSize:11, fontFamily:'var(--mono)',
                  fontWeight:600, color:'var(--red-vivid)' }}>{counts.red} RED</span>}
                {counts.amber > 0 && <span style={{ fontSize:11, fontFamily:'var(--mono)',
                  fontWeight:600, color:'var(--amber)' }}>{counts.amber} AMBER</span>}
                {counts.green > 0 && <span style={{ fontSize:11, fontFamily:'var(--mono)',
                  fontWeight:600, color:'var(--green)' }}>{counts.green} GREEN</span>}
              </div>
            )}
          </div>

          {cdeAllocs.length === 0 ? (
            <div className="status-row status-info">
              No rule allocations found for this CDE.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {/* Column headers */}
              <div style={{ display:'grid',
                gridTemplateColumns:'2fr 1fr 80px 120px 110px 110px 80px 80px 60px',
                gap:8, padding:'0 10px 6px',
                borderBottom:'1px solid var(--border)' }}>
                {['Rule','Dimension','Bumper','Thresholds','Sample size','Failing records','Pass rate','RAG','']
                  .map(h => (
                    <span key={h} style={{ fontSize:10, fontWeight:600,
                      color:'var(--text3)', letterSpacing:'0.05em',
                      textTransform:'uppercase' }}>{h}</span>
                  ))}
              </div>

              {results.map(({ alloc, passRate, rag, greenThresh }) => {
                const rule    = ruleById[alloc.data_quality_rule_id];
                const dim     = dimById[alloc.quality_dimension_id];
                const allocId = alloc.data_quality_rule_allocation_id;
                const inp     = inputs[allocId] || {};
                const bumperVal = inp.bumper !== undefined ? inp.bumper : (alloc.bumper_value ?? 1);
                const hasMeasurement = passRate !== null;
                return (
                  <div key={allocId} style={{
                    display:'grid',
                    gridTemplateColumns:'2fr 1fr 80px 120px 110px 110px 80px 80px 60px',
                    gap:8, padding:'8px 10px',
                    borderBottom:'1px solid var(--border)',
                    alignItems:'center',
                    background: hasMeasurement
                      ? rag === 'GREEN' ? 'rgba(34,201,142,0.04)'
                      : rag === 'AMBER' ? 'rgba(245,166,35,0.04)'
                      : rag === 'RED'   ? 'rgba(224,82,82,0.04)'
                      : 'transparent'
                      : 'transparent',
                  }}>
                    {/* Rule */}
                    <div style={{ fontSize:12, color:'var(--text)', fontWeight:500,
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {rule?.rule_name || `Rule #${alloc.data_quality_rule_id}`}
                    </div>
                    {/* Dimension */}
                    <span style={{ fontSize:11, color:accent, fontFamily:'var(--mono)' }}>
                      {dim?.dimension_name || '--'}
                    </span>
                    {/* Bumper -- editable with arrows */}
                    <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                      <button onClick={() => setInput(allocId, 'bumper', Math.max(1, bumperVal - 1))}
                        style={{ background:'var(--bg)', border:'1px solid var(--border)',
                          borderRadius:3, width:18, height:22, cursor:'pointer',
                          color:'var(--text2)', fontSize:10, lineHeight:1,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          flexShrink:0 }}>-</button>
                      <span style={{ fontSize:12, fontFamily:'var(--mono)', fontWeight:600,
                        color:'var(--amber)', minWidth:18, textAlign:'center' }}>
                        {bumperVal}
                      </span>
                      <button onClick={() => setInput(allocId, 'bumper', Math.min(5, bumperVal + 1))}
                        style={{ background:'var(--bg)', border:'1px solid var(--border)',
                          borderRadius:3, width:18, height:22, cursor:'pointer',
                          color:'var(--text2)', fontSize:10, lineHeight:1,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          flexShrink:0 }}>+</button>
                    </div>
                    {/* Thresholds */}
                    {greenThresh !== null ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                        <span style={{ fontSize:10, color:'var(--green)', fontFamily:'var(--mono)' }}>
                          G &ge;{(greenThresh * 100).toFixed(0)}%
                        </span>
                        <span style={{ fontSize:10, color:'var(--amber)', fontFamily:'var(--mono)' }}>
                          A &ge;{((greenThresh - 0.10) * 100).toFixed(0)}%
                        </span>
                        <span style={{ fontSize:10, color:'var(--red-vivid)', fontFamily:'var(--mono)' }}>
                          R &lt;{((greenThresh - 0.10) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize:10, color:'var(--text3)' }}>--</span>
                    )}
                    {/* Sample size input */}
                    <input type="number" min="0" value={inp.sampleSize ?? 1000}
                      onChange={e => setInput(allocId, 'sampleSize', e.target.value)}
                      style={inputBase}/>
                    {/* Failing records input */}
                    <input type="number" min="0" value={inp.failingCount ?? 1}
                      onChange={e => setInput(allocId, 'failingCount', e.target.value)}
                      style={inputBase}/>
                    {/* Pass rate */}
                    <div style={{ textAlign:'right', fontFamily:'var(--mono)',
                      fontSize:12, color: hasMeasurement ? 'var(--text)' : 'var(--text3)' }}>
                      {hasMeasurement
                        ? `${(passRate * 100).toFixed(1)}%`
                        : '--'}
                    </div>
                    {/* RAG */}
                    <div style={{ display:'flex', justifyContent:'flex-end' }}>
                      <RagBadge label={rag} size="lg"/>
                    </div>
                    {/* Apply / Reset bumper */}
                    <div style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'center' }}>
                      {bumperVal !== (alloc.bumper_value ?? 1) ? (
                        <>
                          <button
                            title="Apply this bumper value back to the rule allocation"
                            onClick={() => {
                              upsertRecord('data_quality_rule_allocation', {
                                ...alloc, bumper_value: bumperVal,
                              });
                              setSavedBumpers(prev => ({ ...prev, [allocId]: true }));
                              setTimeout(() => setSavedBumpers(prev =>
                                ({ ...prev, [allocId]: false })), 1800);
                            }}
                            style={{ fontSize:10, padding:'3px 7px', cursor:'pointer',
                              background:'var(--accent)', border:'none',
                              borderRadius:'var(--radius)', color:'#fff',
                              fontWeight:600, fontFamily:'var(--mono)',
                              whiteSpace:'nowrap' }}>
                            Apply
                          </button>
                          <button
                            title="Reset bumper to stored value"
                            onClick={() => setInput(allocId, 'bumper', alloc.bumper_value ?? 1)}
                            style={{ fontSize:10, padding:'3px 7px', cursor:'pointer',
                              background:'transparent',
                              border:'1px solid var(--border)',
                              borderRadius:'var(--radius)', color:'var(--text3)',
                              fontFamily:'var(--mono)', whiteSpace:'nowrap' }}>
                            Reset
                          </button>
                        </>
                      ) : savedBumpers[allocId] ? (
                        <span style={{ fontSize:10, color:'var(--green)',
                          fontFamily:'var(--mono)', fontWeight:600 }}>
                          Saved
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!cde && (
        <div className="status-row status-info">
          Select a CDE above to begin the simulation.
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// CRITICAL DATA ELEMENT FORM PANEL
// ===============================================================================
