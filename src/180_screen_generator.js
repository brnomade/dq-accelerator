
// ===============================================================================
// DATA RULE GENERATOR
// ===============================================================================

const CLAUDE_URL  = 'https://claude.ai/new';
const COPILOT_URL = 'https://copilot.microsoft.com/';

  const ruleAccent = 'var(--green)';

// AI prompt: see 46_prompt_helpers.js > buildSuggestionPrompt

function DataRuleGeneratorScreen() {
  const { data, upsertRecord, nextPk, canEdit, stewardIdentity, isMaster } = useApp();
  const dp = !canEdit ? { style:{ opacity:0.35, cursor:'not-allowed', pointerEvents:'none' }, title:'Set your steward identity in Settings to make changes' } : {};
  const accent = 'var(--green)';

  // Step 1 state
  const [filterAgencyId, setFilterAgencyId] = useState(null);
  const [filterDirId,    setFilterDirId]    = useState(null);
  const [filterCdsId,    setFilterCdsId]    = useState(null);
  const [selectedCdeId,  setSelectedCdeId]  = useState(null);

  // Step 2 state
  const [promptBuilt,   setPromptBuilt]   = useState(false);
  const [promptText,    setPromptText]    = useState('');
  const [responseText,  setResponseText]  = useState('');
  const [parseError,    setParseError]    = useState('');
  const [suggestions,   setSuggestions]  = useState([]);
  const [copied,        setCopied]        = useState(false);

  // Step 3 per-card state: { [idx]: { ruleName, dimension } }
  const [cardState,     setCardState]    = useState({});
  const [addedRules,    setAddedRules]   = useState({});
  const [testCopied,    setTestCopied]   = useState({});
  const [miniRagState,  setMiniRagState] = useState({});

  const cdes     = data?.critical_data_element || [];
  const cdSets   = data?.critical_data_set     || [];
  const dirs     = data?.directorate           || [];
  const agencies = data?.executive_agency      || [];
  const profiling = data?.field_profiling      || [];
  const ddls     = data?.source_table_ddl      || [];
  const dims     = data?.quality_dimension     || [];
  const rules    = data?.data_quality_rule     || [];
  const allocs      = data?.data_quality_rule_allocation || [];
  const critRows    = data?.cde_criticality        || [];
  const critGroups  = data?.criticality_group      || [];
  const critLevels  = data?.criticality_level      || [];
  const groupWeights = data?.criticality_group_weight || [];

  // My Data scope filter
  const { myDataOnly, setMyDataOnly, scopeCdsIds, scopeDirIds, scopeAgencyIds } =
    useMyDataScope(data, stewardIdentity, isMaster, cdSets, dirs, 'moj_dq_generator_mydata_v1');

  const cdsById    = useMemo(() => Object.fromEntries(cdSets.map(d => [d.critical_data_set_id, d])),  [cdSets]);
  const dirById    = useMemo(() => Object.fromEntries(dirs.map(d   => [d.directorate_id, d])),        [dirs]);
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])), [agencies]);
  const ruleById   = useMemo(() => Object.fromEntries(rules.map(r  => [r.data_quality_rule_id, r])),  [rules]);
  const dimByName  = useMemo(() => {
    const m = {};
    for (const d of dims) m[d.dimension_name?.toLowerCase()] = d;
    return m;
  }, [dims]);
  const dimById    = useMemo(() => Object.fromEntries(dims.map(d => [d.quality_dimension_id, d])), [dims]);
  const ruleByName = useMemo(() => {
    const m = {};
    for (const r of rules) {
      if (!r.retiring_timestamp && r.rule_name) m[r.rule_name.toLowerCase()] = r;
    }
    return m;
  }, [rules]);
  const groupById  = useMemo(() => Object.fromEntries(critGroups.map(g => [g.criticality_group_id, g])), [critGroups]);
  const levelById  = useMemo(() => Object.fromEntries(critLevels.map(l => [l.criticality_level_id, l])), [critLevels]);

  // Allocations for the selected CDE
  const existingAllocsForCde = useMemo(() =>
    selectedCdeId
      ? allocs.filter(a => a.critical_data_element_id === selectedCdeId && !a.retiring_timestamp)
      : [],
  [allocs, selectedCdeId]);

  const existingRuleCount = existingAllocsForCde.length;

  // Conflict detection helpers
  const existingDimIds = useMemo(() =>
    new Set(existingAllocsForCde.map(a => a.quality_dimension_id)),
  [existingAllocsForCde]);

  // Generic rules from the catalogue -- for prompt and conflict detection
  const genericRulesCtx = useMemo(() =>
    rules
      .filter(r => !r.retiring_timestamp && r.rule_name && r.rule_name.startsWith('Generic - '))
      .map(r => ({ rule_name: r.rule_name, dimension: '' })),
  [rules]);

  // Rules already applied to other CDEs in the same CDS (excluding Generic, excluding self)
  const cdsRulesCtx = useMemo(() => {
    if (!filterCdsId) return [];
    const cdeCdsIds = new Set(
      cdes.filter(c => !c.retiring_timestamp &&
        c.critical_data_set_id === filterCdsId &&
        c.critical_data_element_id !== selectedCdeId)
        .map(c => c.critical_data_element_id)
    );
    const seen = new Set();
    return allocs
      .filter(a => !a.retiring_timestamp && cdeCdsIds.has(a.critical_data_element_id))
      .reduce((acc, a) => {
        if (!seen.has(a.data_quality_rule_id)) {
          seen.add(a.data_quality_rule_id);
          const r = ruleById[a.data_quality_rule_id];
          if (r && !r.retiring_timestamp && !r.rule_name?.startsWith('Generic - ')) {
            acc.push({ rule_name: r.rule_name,
              dimension: dimById[a.quality_dimension_id]?.dimension_name || '' });
          }
        }
        return acc;
      }, []);
  }, [cdes, allocs, ruleById, dimById, filterCdsId, selectedCdeId]);

  // Rules already allocated to this specific CDE
  const cdeRulesCtx = useMemo(() =>
    existingAllocsForCde.map(a => {
      const r = ruleById[a.data_quality_rule_id];
      return r ? { rule_name: r.rule_name,
        dimension: dimById[a.quality_dimension_id]?.dimension_name || '' } : null;
    }).filter(Boolean),
  [existingAllocsForCde, ruleById, dimById]);

  const getConflict = (suggestion) => {
    if (suggestion.reuse) return null;
    const dim    = dimByName[(suggestion.dimension||'').toLowerCase()];
    const dimId  = dim?.quality_dimension_id;
    // Check dimension already covered
    if (dimId && existingDimIds.has(dimId)) {
      const matchAlloc = existingAllocsForCde.find(a => a.quality_dimension_id === dimId);
      const matchRule  = matchAlloc ? ruleById[matchAlloc.data_quality_rule_id] : null;
      return { type: 'dimension', msg: `${suggestion.dimension} already covered${matchRule ? ': ' + matchRule.rule_name : ''}` };
    }
    // Check rule name -- exact match first, then substring
    const sName = (suggestion.rule_name||'').toLowerCase();
    const exact = rules.find(r =>
      !r.retiring_timestamp && r.rule_name && r.rule_name.toLowerCase() === sName
    );
    if (exact) return { type: 'name', msg: `Duplicate rule exists: ${exact.rule_name}` };
    const similar = rules.find(r =>
      !r.retiring_timestamp &&
      r.rule_name &&
      (r.rule_name.toLowerCase().includes(sName) || sName.includes(r.rule_name.toLowerCase()))
    );
    if (similar) return { type: 'name', msg: `Similar rule exists: ${similar.rule_name}` };
    return null;
  };

  const agencyOpts = useMemo(() =>
    [...agencies]
      .filter(a => !a.retiring_timestamp && (!scopeAgencyIds || scopeAgencyIds.has(a.executive_agency_id)))
      .sort((a,b) => (a.agency_acronymn||'').localeCompare(b.agency_acronymn||'')),
    [agencies, scopeAgencyIds]);
  const dirOpts = useMemo(() =>
    [...dirs]
      .filter(d => !d.retiring_timestamp && d.executive_agency_id === filterAgencyId &&
                   (!scopeDirIds || scopeDirIds.has(d.directorate_id)))
      .sort((a,b) => (a.directorate_name||'').localeCompare(b.directorate_name||'')),
    [dirs, filterAgencyId, scopeDirIds]);
  const cdsOpts = useMemo(() =>
    [...cdSets]
      .filter(d => !d.retiring_timestamp && d.directorate_id === filterDirId &&
                   (!scopeCdsIds || scopeCdsIds.has(d.critical_data_set_id)))
      .sort((a,b) => (a.data_set_name||'').localeCompare(b.data_set_name||'')),
    [cdSets, filterDirId, scopeCdsIds]);
  const cdeOpts = useMemo(() =>
    [...cdes].filter(c => !c.retiring_timestamp && c.critical_data_set_id === filterCdsId)
      .sort((a,b) => (a.source_field_name||'').localeCompare(b.source_field_name||'')), [cdes, filterCdsId]);

  const cde    = selectedCdeId ? cdes.find(c => c.critical_data_element_id === selectedCdeId) : null;
  const cds    = cde ? cdsById[cde.critical_data_set_id] : null;
  const dir    = cds ? dirById[cds.directorate_id] : null;
  const agency = dir ? agencyById[dir.executive_agency_id] : null;

  const agencyGroupWeights = useMemo(() => {
    const agencyId = agency?.executive_agency_id;
    if (!agencyId) return {};
    return Object.fromEntries(
      groupWeights
        .filter(w => w.executive_agency_id === agencyId && !w.retiring_timestamp)
        .map(w => [w.criticality_group_id, w.weight_value])
    );
  }, [groupWeights, agency]);

  const cdeGreenThresh = useMemo(() => {
    if (!selectedCdeId) return null;
    const rows = critRows.filter(r => r.critical_data_element_id === selectedCdeId && !r.retiring_timestamp);
    if (rows.length === 0) return null;
    const weighted = rows.map(r => {
      const lvl   = levelById[r.criticality_level_id];
      const desc  = (lvl?.criticality_description || '').toLowerCase();
      const score = CRIT_LEVEL_SCORES[desc] ?? 0;
      const weight = agencyGroupWeights[r.criticality_group_id] ?? 1;
      return { score, weight };
    });
    const totalWeight = weighted.reduce((s, { weight }) => s + weight, 0);
    if (totalWeight === 0) return 0;
    const overallScore = weighted.reduce((s, { score, weight }) => s + score * weight, 0) / totalWeight;
    return getRelativeScore(overallScore);
  }, [critRows, selectedCdeId, levelById, agencyGroupWeights]);

  const fieldProfile = useMemo(() => {
    if (!cde) return null;
    return profiling.find(p =>
      p.source_database_name === cde.source_database_name &&
      p.source_table_name    === cde.source_table_name    &&
      p.source_field_name    === cde.source_field_name    &&
      !p.retiring_timestamp
    ) || null;
  }, [profiling, cde]);

  const ddlCols = useMemo(() => {
    if (!cde) return [];
    const ddl = ddls.find(d =>
      d.source_database_name === cde.source_database_name &&
      d.source_table_name    === cde.source_table_name    &&
      !d.retiring_timestamp
    );
    return ddl?.parsed_columns ? JSON.parse(ddl.parsed_columns) : [];
  }, [ddls, cde]);

  const resetAll = () => {
    setPromptBuilt(false); setPromptText(''); setResponseText('');
    setParseError(''); setSuggestions([]); setCardState({}); setAddedRules({}); setMiniRagState({});
  };

  const resetEverything = () => {
    setFilterAgencyId(null); setFilterDirId(null);
    setFilterCdsId(null);    setSelectedCdeId(null);
    resetAll();
  };

  const handleCdeChange = (v) => {
    setSelectedCdeId(v); resetAll();
  };

  const handleBuildPrompt = () => {
    if (!cde || !fieldProfile) return;
    const p = buildSuggestionPrompt(cde, ddlCols, fieldProfile, cds?.data_set_name || '', {
      genericRules: genericRulesCtx,
      cdsRules:     cdsRulesCtx,
      cdeRules:     cdeRulesCtx,
    });
    setPromptText(p);
    setPromptBuilt(true);
    setSuggestions([]);
    setResponseText('');
    setParseError('');
    setCardState({});
    setAddedRules({});
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(promptText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const handleOpenClaude  = () => {
    const url = `${CLAUDE_URL}?q=${encodeURIComponent(promptText)}`;
    window.open(url, '_blank');
  };
  const handleOpenCopilot = () => window.open(COPILOT_URL, '_blank');

  const handleParse = () => {
    setParseError('');
    let parsed;
    try {
      let clean = responseText.trim();
      // Strip markdown code fences
      clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      // Fix Copilot markdown escaping of punctuation: \_ \[ \] \* \{ \} etc
      clean = clean.replace(/\\([_\[\]\*\{\}\(\)#\+\-\.!])/g, '$1');
      // Fix escaped newlines/tabs
      clean = clean.replace(/\\n/g, '\n').replace(/\\t/g, ' ');
      // Find the JSON array bounds
      const firstBracket = clean.indexOf('[');
      const lastBracket  = clean.lastIndexOf(']');
      if (firstBracket === -1 || lastBracket === -1) throw new Error('No JSON array found in response');
      clean = clean.slice(firstBracket, lastBracket + 1);
      // Fix invalid JSON escape sequences from regex patterns (\d \s \w \p etc)
      // Valid JSON escapes are: \" \\ \/ \b \f \n \r \t \uXXXX
      clean = clean.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
      parsed = JSON.parse(clean);
      if (!Array.isArray(parsed)) throw new Error('Response must be a JSON array');
    } catch(err) {
      setParseError(`Could not parse response: ${err.message}. Make sure you copied the full AI response.`);
      return;
    }
    const normed = parsed.map((s, i) => ({
      reuse:              s.reuse === true,
      existing_rule_name: s.existing_rule_name || null,
      rule_name:          s.rule_name          || (s.existing_rule_name || `Rule ${i+1}`),
      dimension:          s.dimension          || 'Validity',
      description:        s.description        || '',
      basis:              s.basis              || '',
      sql_code:           s.sql_code           || '',
      sql_code_sample:    s.sql_code_sample    || '',
    }));
    setSuggestions(normed);
    const cs = {};
    normed.forEach((s, i) => {
      cs[i] = { ruleName: s.rule_name, dimension: s.dimension };
    });
    setCardState(cs);
  };

  const setCard = (i, field, val) =>
    setCardState(prev => ({ ...prev, [i]: { ...prev[i], [field]: val } }));

  const setMiniRag = (i, field, val) =>
    setMiniRagState(prev => ({ ...prev, [i]: { ...(prev[i] || {}), [field]: val } }));

  const resolvePlaceholders = (text) => substituteCdeTokens(text, cde);

  const handleCopySql = (i) => {
    if (!cde) return;
    const s = suggestions[i];
    let rawSql;
    if (s.reuse) {
      const existing = ruleByName[(s.existing_rule_name || '').toLowerCase()];
      if (!existing?.sql_code) return;
      rawSql = existing.sql_code;
    } else {
      if (!s?.sql_code) return;
      rawSql = s.sql_code;
    }
    let sql = resolvePlaceholders(rawSql);
    if (cde.source_snapshot_filter) {
      sql = sql + ' AND ' + resolvePlaceholders(cde.source_snapshot_filter);
    }
    navigator.clipboard.writeText(normalizeWhitespace(sql)).then(() => {
      setTestCopied(prev => ({ ...prev, [i]: true }));
      setTimeout(() => setTestCopied(prev => ({ ...prev, [i]: false })), 2000);
    }).catch(() => {});
  };

  const handleAddRule = (i) => {
    const s   = suggestions[i];
    const cs  = cardState[i] || {};
    const dim = dimByName[(cs.dimension || s.dimension).toLowerCase()];

    if (s.reuse) {
      const existing = ruleByName[(s.existing_rule_name || '').toLowerCase()];
      if (!existing) return;
      const allocId = nextPk('data_quality_rule_allocation');
      upsertRecord('data_quality_rule_allocation', {
        data_quality_rule_allocation_id: allocId,
        critical_data_element_id:        selectedCdeId,
        data_quality_rule_id:            existing.data_quality_rule_id,
        quality_dimension_id:            dim?.quality_dimension_id || null,
        bumper_value:                    cs.bumper ?? 1,
        frequency:                       cs.frequency || 'DAILY',
        retiring_timestamp:              null,
      });
    } else {
      const ruleId  = nextPk('data_quality_rule');
      const allocId = nextPk('data_quality_rule_allocation');
      upsertRecord('data_quality_rule', {
        data_quality_rule_id:  ruleId,
        rule_name:             cs.ruleName || s.rule_name,
        rule_explanation:      s.description,
        sql_code:              s.sql_code,
        sql_code_sample:       s.sql_code_sample || null,
        automated:             false,
        retiring_timestamp:    null,
      });
      upsertRecord('data_quality_rule_allocation', {
        data_quality_rule_allocation_id: allocId,
        critical_data_element_id:        selectedCdeId,
        data_quality_rule_id:            ruleId,
        quality_dimension_id:            dim?.quality_dimension_id || null,
        bumper_value:                    cs.bumper ?? 1,
        frequency:                       cs.frequency || 'DAILY',
        retiring_timestamp:              null,
      });
    }
    setAddedRules(prev => ({ ...prev, [i]: true }));
  };

  const handleAddAll = () => {
    suggestions.forEach((_, i) => {
      if (!addedRules[i]) handleAddRule(i);
    });
  };

  const addedCount = Object.values(addedRules).filter(Boolean).length;

  const selectStyle = {
    width:'100%', padding:'7px 10px', fontSize:12,
    background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:'var(--radius)', color:'var(--text)',
    fontFamily:'var(--mono)', cursor:'pointer', outline:'none',
  };
  const taStyle = {
    width:'100%', padding:'8px 10px', fontSize:11,
    background:'var(--bg)', border:'1px solid var(--border)',
    borderRadius:'var(--radius)', color:'var(--text)',
    fontFamily:'var(--mono)', resize:'vertical', lineHeight:1.5, outline:'none',
  };

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ marginBottom:20 }}>
        <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
          Rule Generator
          {selectedCdeId && (
            <button onClick={resetEverything}
              style={{ marginLeft:'auto', fontSize:10, padding:'4px 12px', cursor:'pointer',
                background:'transparent', border:'1px solid var(--border)',
                borderRadius:'var(--radius)', color:'var(--text3)',
                fontFamily:'var(--mono)' }}>
              Start over
            </button>
          )}
        </div>
        <div className="page-sub">
          Select a profiled CDE to generate data quality rule suggestions via AI.
        </div>
      </div>

      {/* STEP 1 -- Select CDE */}
      <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
        borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
        padding:'16px 18px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
            textTransform:'uppercase', color:accent }}>
            Step 1 - Select Critical Data Element
          </div>
          <MyDataToggle
            active={myDataOnly}
            onToggle={() => {
              setMyDataOnly(function(v) { return !v; });
              setFilterAgencyId(null); setFilterDirId(null);
              setFilterCdsId(null);   setSelectedCdeId(null);
            }}
            available={!!stewardIdentity}
            accent={accent}
          />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:12 }}>
          <select value={filterAgencyId ?? ''} style={selectStyle}
            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
              setFilterAgencyId(v); setFilterDirId(null); setFilterCdsId(null);
              setSelectedCdeId(null); resetAll(); }}>
            <option value="">-- agency --</option>
            {agencyOpts.map(a => <option key={a.executive_agency_id} value={a.executive_agency_id}>{a.agency_acronymn}</option>)}
          </select>
          <select value={filterDirId ?? ''} disabled={filterAgencyId === null}
            style={{ ...selectStyle, opacity: filterAgencyId !== null ? 1 : 0.5 }}
            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
              setFilterDirId(v); setFilterCdsId(null); setSelectedCdeId(null); resetAll(); }}>
            <option value="">{filterAgencyId !== null ? '-- directorate --' : '-- select agency first --'}</option>
            {dirOpts.map(d => <option key={d.directorate_id} value={d.directorate_id}>{d.directorate_name}</option>)}
          </select>
          <select value={filterCdsId ?? ''} disabled={filterDirId === null}
            style={{ ...selectStyle, opacity: filterDirId !== null ? 1 : 0.5 }}
            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
              setFilterCdsId(v); setSelectedCdeId(null); resetAll(); }}>
            <option value="">{filterDirId !== null ? '-- data set --' : '-- select directorate first --'}</option>
            {cdsOpts.map(d => <option key={d.critical_data_set_id} value={d.critical_data_set_id}>{d.data_set_name}</option>)}
          </select>
          <select value={selectedCdeId ?? ''} disabled={!filterCdsId}
            style={{ ...selectStyle, opacity: filterCdsId ? 1 : 0.5 }}
            onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
              handleCdeChange(v); }}>
            <option value="">{filterCdsId ? '-- field --' : '-- select data set first --'}</option>
            {cdeOpts.map(c => (
              <option key={c.critical_data_element_id} value={c.critical_data_element_id}>
                {c.source_field_name}
                {(c.source_database_name || c.source_table_name)
                  ? ` (${[c.source_database_name, c.source_table_name].filter(Boolean).join('.')})`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        {/* CDE summary card */}
        {cde && (
          <div style={{ display:'flex', alignItems:'center', gap:16,
            padding:'8px 12px', background:'var(--bg3)',
            border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
            <div>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>Field</div>
              <div style={{ fontSize:13, fontFamily:'var(--mono)', fontWeight:600, color:'var(--text)' }}>
                {cde.source_field_name}
              </div>
            </div>
            <div style={{ width:1, height:32, background:'var(--border)' }}/>
            <div>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>Table</div>
              <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text2)' }}>
                {[cde.source_database_name, cde.source_table_name].filter(Boolean).join('.')}
              </div>
            </div>
            <div style={{ width:1, height:32, background:'var(--border)' }}/>
            <div>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>Data set</div>
              <div style={{ fontSize:11, color:'var(--text2)' }}>
                {[cds?.data_set_name, agency?.agency_acronymn].filter(Boolean).join(' - ')}
              </div>
            </div>
            <div style={{ width:1, height:32, background:'var(--border)' }}/>
            <div>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>Profiling</div>
              {fieldProfile ? (
                <div style={{ fontSize:11, fontFamily:'var(--mono)', fontWeight:600, color:'var(--green)' }}>
                  Available ({fieldProfile.profiled_at})
                </div>
              ) : (
                <div style={{ fontSize:11, color:'var(--amber)', fontFamily:'var(--mono)' }}>
                  Not profiled
                </div>
              )}
            </div>
            <div style={{ width:1, height:32, background:'var(--border)' }}/>
            <div>
              <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>Rules allocated</div>
              <div style={{ fontSize:13, fontFamily:'var(--mono)', fontWeight:600,
                color: existingRuleCount > 0 ? accent : 'var(--text3)' }}>
                {existingRuleCount}
                <span style={{ fontSize:10, fontWeight:400, color:'var(--text3)', marginLeft:4 }}>
                  rule{existingRuleCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* No profiling warning */}
        {cde && !fieldProfile && (
          <div style={{ marginTop:10, padding:'10px 14px',
            background:'rgba(245,166,35,0.08)', border:'1px solid rgba(245,166,35,0.3)',
            borderRadius:'var(--radius)', fontSize:12, color:'var(--amber)' }}>
            This CDE has not been profiled yet. Profile data is needed before rules can be generated.
          </div>
        )}
      </div>

      {/* STEP 2 -- Build prompt and get suggestions */}
      {cde && fieldProfile && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
          borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
          padding:'16px 18px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
            textTransform:'uppercase', color:accent, marginBottom:12 }}>
            Step 2 - Get AI Rule Suggestions
          </div>

          {!promptBuilt ? (
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button className="btn btn-primary" onClick={handleBuildPrompt}
                style={{ fontSize:12, padding:'7px 16px' }}>
                Build suggestion prompt
              </button>
              <span style={{ fontSize:11, color:'var(--text3)' }}>
                Assembles a prompt from the CDE details and profiling data.
              </span>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

              {/* LEFT -- Prompt */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--text2)' }}>
                    Constructed prompt
                  </span>
                  <button onClick={resetAll}
                    style={{ fontSize:10, padding:'3px 8px', cursor:'pointer',
                      background:'transparent', border:'1px solid var(--border)',
                      borderRadius:'var(--radius)', color:'var(--text3)',
                      fontFamily:'var(--mono)' }}>
                    Reset
                  </button>
                </div>
                <textarea readOnly value={promptText}
                  style={{ ...taStyle, background:'var(--bg)', color:'var(--text3)',
                    cursor:'default', flex:1, minHeight:280, resize:'none' }}/>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button onClick={handleCopy}
                    style={{ fontSize:10, padding:'4px 12px', cursor:'pointer',
                      background:'var(--bg3)', border:`1px solid ${accent}`,
                      borderRadius:'var(--radius)', color:accent,
                      fontWeight:600, fontFamily:'var(--mono)' }}>
                    {copied ? 'Copied!' : 'Copy prompt'}
                  </button>
                  <button onClick={handleOpenClaude}
                    style={{ fontSize:10, padding:'4px 12px', cursor:'pointer',
                      background:'var(--bg3)', border:'1px solid var(--border)',
                      borderRadius:'var(--radius)', color:'var(--text2)',
                      fontFamily:'var(--mono)' }}>
                    Open in Claude
                  </button>
                  <button onClick={handleOpenCopilot}
                    style={{ fontSize:10, padding:'4px 12px', cursor:'pointer',
                      background:'var(--bg3)', border:'1px solid var(--border)',
                      borderRadius:'var(--radius)', color:'var(--text2)',
                      fontFamily:'var(--mono)' }}>
                    Open in Copilot
                  </button>
                </div>
              </div>

              {/* RIGHT -- AI response */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--text2)' }}>
                    AI response
                  </span>
                  <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400, marginLeft:6 }}>
                    paste the JSON returned by Claude or Copilot
                  </span>
                </div>
                <textarea value={responseText}
                  onChange={e => setResponseText(e.target.value)}
                  placeholder={'[\n  {\n    "rule_name": "...",\n    "dimension": "...",\n    ...\n  }\n]'}
                  style={{ ...taStyle, flex:1, minHeight:280, resize:'none' }}/>
                {parseError && (
                  <div style={{ fontSize:11, color:'var(--red)',
                    padding:'6px 10px', background:'rgba(224,82,82,0.08)',
                    border:'1px solid rgba(224,82,82,0.3)', borderRadius:'var(--radius)' }}>
                    {parseError}
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <button className="btn btn-primary" onClick={handleParse}
                    disabled={!responseText.trim()}
                    style={{ fontSize:12, padding:'7px 16px',
                      opacity: responseText.trim() ? 1 : 0.5 }}>
                    Parse response
                  </button>
                  {suggestions.length > 0 && (
                    <span style={{ fontSize:11, color:'var(--green)', fontFamily:'var(--mono)',
                      fontWeight:600 }}>
                      {suggestions.length} suggestion{suggestions.length!==1?'s':''} ready
                    </span>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* STEP 3 -- Rule cards */}
      {suggestions.length > 0 && (
        <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
          borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
          padding:'16px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:accent }}>
              Step 3 - Review and Add Rules
            </div>
            {addedCount < suggestions.length && (
              <button onClick={handleAddAll}
                style={{ marginLeft:'auto', fontSize:10, padding:'4px 12px', cursor:'pointer',
                  background:'var(--accent)', border:'none',
                  borderRadius:'var(--radius)', color:'#fff',
                  fontWeight:600, fontFamily:'var(--mono)' }}>
                Add all ({suggestions.length - addedCount} remaining)
              </button>
            )}
            {addedCount > 0 && (
              <span style={{ fontSize:11, color:'var(--green)', fontFamily:'var(--mono)',
                fontWeight:600, marginLeft: addedCount < suggestions.length ? 0 : 'auto' }}>
                {addedCount}/{suggestions.length} added
              </span>
            )}
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {suggestions.map((s, i) => {
              const cs           = cardState[i] || {};
              const done         = !!addedRules[i];
              const dimCol       = ruleAccent;
              const conflict     = !done ? getConflict({ ...s, dimension: cs.dimension || s.dimension }) : null;
              const existingRule = s.reuse ? (ruleByName[(s.existing_rule_name || '').toLowerCase()] || null) : null;
              const reuseColor   = '#4a9eff';
              const sqlToShow    = s.reuse ? (existingRule?.sql_code || '') : s.sql_code;
              return (
                <div key={i} style={{
                  background: done ? (s.reuse ? 'rgba(74,158,255,0.04)' : 'rgba(34,201,142,0.05)') : 'var(--bg3)',
                  border:`1px solid ${done ? (s.reuse ? 'rgba(74,158,255,0.3)' : 'rgba(34,201,142,0.3)') : s.reuse ? 'rgba(74,158,255,0.35)' : conflict ? 'rgba(245,166,35,0.4)' : 'var(--border)'}`,
                  borderLeft:`3px solid ${done ? (s.reuse ? reuseColor : 'var(--green)') : s.reuse ? reuseColor : conflict ? 'var(--amber)' : dimCol}`,
                  borderRadius:'var(--radius-lg)', padding:'12px 14px',
                  opacity: done ? 0.75 : 1,
                }}>
                  {/* Card header */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                    {!s.reuse && (
                      <span style={{ fontSize:9, fontWeight:700, fontFamily:'var(--mono)',
                        color:'var(--green)', background:'rgba(34,201,142,0.1)',
                        border:'1px solid rgba(34,201,142,0.35)',
                        borderRadius:3, padding:'2px 8px', flexShrink:0,
                        textTransform:'uppercase', letterSpacing:'0.06em' }}>
                        New
                      </span>
                    )}
                    {s.reuse && (
                      <span style={{ fontSize:9, fontWeight:700, fontFamily:'var(--mono)',
                        color:reuseColor, background:'rgba(74,158,255,0.1)',
                        border:'1px solid rgba(74,158,255,0.35)',
                        borderRadius:3, padding:'2px 8px', flexShrink:0,
                        textTransform:'uppercase', letterSpacing:'0.06em' }}>
                        Reuse Existing
                      </span>
                    )}
                    <span style={{ fontSize:9, fontWeight:700, fontFamily:'var(--mono)',
                      color:dimCol, background:`${dimCol}18`,
                      border:`1px solid ${dimCol}40`,
                      borderRadius:3, padding:'2px 8px', flexShrink:0,
                      textTransform:'uppercase', letterSpacing:'0.06em' }}>
                      {cs.dimension || s.dimension}
                    </span>
                    {conflict && (
                      <span style={{ fontSize:10, fontFamily:'var(--mono)',
                        color:'var(--amber)', background:'rgba(245,166,35,0.1)',
                        border:'1px solid rgba(245,166,35,0.3)',
                        borderRadius:3, padding:'1px 7px' }}>
                        {conflict.msg}
                      </span>
                    )}
                    {s.reuse && !existingRule && (
                      <span style={{ fontSize:10, fontFamily:'var(--mono)',
                        color:'var(--amber)', background:'rgba(245,166,35,0.1)',
                        border:'1px solid rgba(245,166,35,0.3)',
                        borderRadius:3, padding:'1px 7px' }}>
                        Rule not found in catalogue
                      </span>
                    )}
                    {done && (
                      <span style={{ fontSize:10, color: s.reuse ? reuseColor : 'var(--green)',
                        fontFamily:'var(--mono)', fontWeight:600, marginLeft:'auto' }}>
                        {s.reuse ? 'Allocated' : 'Added'}
                      </span>
                    )}
                  </div>

                  {/* Rule name */}
                  {s.reuse ? (
                    <div style={{ fontSize:12, fontFamily:'var(--mono)', fontWeight:600,
                      color:'var(--text)', marginBottom:6, padding:'5px 0' }}>
                      {s.existing_rule_name}
                    </div>
                  ) : (
                    <input type="text" value={cs.ruleName ?? s.rule_name}
                      onChange={e => setCard(i, 'ruleName', e.target.value)}
                      disabled={done}
                      style={{ width:'100%', padding:'5px 8px', fontSize:12,
                        fontFamily:'var(--mono)', fontWeight:600,
                        background: done ? 'transparent' : 'var(--bg)',
                        border: done ? 'none' : '1px solid var(--border)',
                        borderRadius:'var(--radius)', color:'var(--text)',
                        outline:'none', marginBottom:6 }}/>
                  )}

                  {/* Description + basis */}
                  <div style={{ fontSize:11, color:'var(--text2)', marginBottom:4 }}>
                    {s.reuse ? (existingRule?.rule_explanation || '') : s.description}
                  </div>
                  <div style={{ fontSize:10, color:'var(--text3)', fontStyle:'italic', marginBottom:8 }}>
                    {s.reuse ? 'Why reuse: ' : 'Based on: '}{s.basis}
                  </div>

                  {/* SQL preview + Copy SQL */}
                  {sqlToShow && (
                    <div style={{ marginBottom:8 }}>
                      <pre style={{ fontSize:10, fontFamily:'var(--mono)',
                        color:'var(--text3)', background:'var(--bg)',
                        border:'1px solid var(--border)', borderRadius:'var(--radius)',
                        padding:'6px 10px', whiteSpace:'pre-wrap', wordBreak:'break-all',
                        margin:'0 0 4px', maxHeight:60, overflow:'auto' }}>
                        {sqlToShow}
                      </pre>
                      <div style={{ display:'flex', justifyContent:'flex-end' }}>
                        <button onClick={() => handleCopySql(i)}
                          style={{ fontSize:10, padding:'2px 10px', cursor:'pointer',
                            background: testCopied[i] ? 'var(--green-bg)' : 'var(--bg)',
                            border: `1px solid ${testCopied[i] ? 'var(--green)' : 'var(--border)'}`,
                            borderRadius:'var(--radius)',
                            color: testCopied[i] ? 'var(--green)' : 'var(--text2)',
                            fontFamily:'var(--mono)', transition:'all 0.15s' }}>
                          {testCopied[i] ? 'Copied to clipboard!' : 'Copy SQL'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline controls */}
                  {!done && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      {/* Dimension */}
                      <select value={cs.dimension || s.dimension}
                        onChange={e => setCard(i, 'dimension', e.target.value)}
                        style={{ fontSize:10, padding:'3px 7px', cursor:'pointer',
                          background:'var(--bg)', border:'1px solid var(--border)',
                          borderRadius:'var(--radius)', color:'var(--text)',
                          fontFamily:'var(--mono)' }}>
                        {['Completeness','Validity','Uniqueness','Consistency','Timeliness','Accuracy']
                          .map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      {/* Mini RAG calculator */}
                      <div style={{ display:'flex', flexDirection:'column', gap:5,
                        padding:'8px 10px', background:'var(--bg3)',
                        border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
                        {cdeGreenThresh === null ? (
                          <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)', fontStyle:'italic' }}>
                            RAG score unavailable - no criticality is defined for this CDE
                          </div>
                        ) : (
                          <>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>Sample size</span>
                                <input type="number" min="0"
                                  value={(miniRagState[i] || {}).sampleSize || ''}
                                  onChange={e => setMiniRag(i, 'sampleSize', e.target.value)}
                                  placeholder="e.g. 1000"
                                  style={{ width:72, fontSize:10, padding:'3px 6px', fontFamily:'var(--mono)',
                                    background:'var(--bg)', border:'1px solid var(--border)',
                                    borderRadius:'var(--radius)', color:'var(--text)' }}/>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>Failing</span>
                                <input type="number" min="0"
                                  value={(miniRagState[i] || {}).failingCount || ''}
                                  onChange={e => setMiniRag(i, 'failingCount', e.target.value)}
                                  placeholder="e.g. 20"
                                  style={{ width:72, fontSize:10, padding:'3px 6px', fontFamily:'var(--mono)',
                                    background:'var(--bg)', border:'1px solid var(--border)',
                                    borderRadius:'var(--radius)', color:'var(--text)' }}/>
                              </div>
                              {(() => {
                                const mr = miniRagState[i] || {};
                                const ss = parseFloat(mr.sampleSize);
                                const fc = parseFloat(mr.failingCount);
                                if (!mr.sampleSize || !mr.failingCount || isNaN(ss) || isNaN(fc) || ss <= 0)
                                  return <RagBadge label="-"/>;
                                return <RagBadge label={getRagLabel(Math.max(0,(ss-fc)/ss), cdeGreenThresh)}/>;
                              })()}
                            </div>
                            <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                              {'Green >= '}{Math.round(cdeGreenThresh * 100)}{'%'}
                              {'  |  '}
                              {'Amber >= '}{Math.round((cdeGreenThresh - 0.10) * 100)}{'%'}
                            </div>
                          </>
                        )}
                      </div>
                      <button {...dp} onClick={() => handleAddRule(i)}
                        disabled={s.reuse && !existingRule}
                        style={{ marginLeft:'auto', fontSize:10, padding:'3px 12px',
                          cursor: s.reuse && !existingRule ? 'not-allowed' : 'pointer',
                          background: s.reuse ? reuseColor : 'var(--accent)', border:'none',
                          borderRadius:'var(--radius)', color:'#fff',
                          fontWeight:600, fontFamily:'var(--mono)',
                          opacity: s.reuse && !existingRule ? 0.4 : 1 }}>
                        {s.reuse ? 'Allocate Existing Rule' : 'Add Rule and Allocate'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!cde && (
        <div className="status-row status-info">
          Select a CDE above to begin generating rules.
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// CDE COVERAGE PAGE
// ===============================================================================
