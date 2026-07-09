
// ===============================================================================
// DATA RULE GENERATOR
// ===============================================================================

const CLAUDE_URL  = 'https://claude.ai/new';
const COPILOT_URL = 'https://copilot.microsoft.com/';

  const ruleAccent = 'var(--green)';

function buildSuggestionPrompt(cde, ddlCols, profRecord, cdsName, existingRulesCtx) {
  const db    = cde.source_database_name || '';
  const tbl   = cde.source_table_name    || '';
  const field = cde.source_field_name    || '';
  const snap  = cde.source_snapshot_filter || '';
  const phys  = ddlCols.find(c => c.name === field)?.type || profRecord.physical_data_type || 'UNKNOWN';
  const sem   = profRecord.semantic_type || '';

  const lines = [
    'You are a data quality expert helping define SQL-based data quality rules for AWS Athena.',
    '',
    'FIELD DETAILS:',
    `Field name:      ${field}`,
    `Database:        ${db}`,
    `Table:           ${tbl}`,
    `Physical type:   ${phys}`,
    sem ? `Semantic type:   ${sem}` : '',
    `Snapshot filter: ${snap || 'none'}`,
    '',
  ];

  if (profRecord.summary_raw) {
    lines.push('PROFILING SUMMARY:');
    lines.push(profRecord.summary_raw);
    lines.push('');
  }
  if (profRecord.type_patterns_raw) {
    lines.push('TYPE PATTERNS:');
    lines.push(profRecord.type_patterns_raw);
    lines.push('');
  }
  if (profRecord.top_values_raw) {
    lines.push('TOP VALUES:');
    lines.push(profRecord.top_values_raw);
    lines.push('');
  }
  if (profRecord.length_distribution_raw) {
    lines.push('LENGTH DISTRIBUTION:');
    lines.push(profRecord.length_distribution_raw);
    lines.push('');
  }
  if (profRecord.profiling_notes) {
    lines.push('NOTES:');
    lines.push(profRecord.profiling_notes);
    lines.push('');
  }

  // Existing rules context -- inject before TASK so AI avoids duplicates
  const rCtx    = existingRulesCtx || {};
  const gRules  = rCtx.genericRules || [];
  const cRules  = rCtx.cdsRules     || [];
  const ceRules = rCtx.cdeRules     || [];
  if (gRules.length || cRules.length || ceRules.length) {
    lines.push('EXISTING RULES IN CATALOGUE -- DO NOT DUPLICATE:');
    lines.push('If a suggestion you would make is equivalent to any rule listed below, omit it entirely.');
    lines.push('For Generic rules: do NOT create a new Generic rule that overlaps with one already listed.');
    lines.push('Reuse the exact existing rule name where applicable -- do not paraphrase it.');
    lines.push('');
    if (gRules.length) {
      lines.push('Generic rules (reusable across any field -- exact names, do not reinvent these):');
      gRules.forEach(r => lines.push('  - "' + r.rule_name + '"'));
      lines.push('');
    }
    if (cRules.length) {
      lines.push('Rules already applied to other CDEs in this Critical Data Set' + (cdsName ? ' ("' + cdsName + '")' : '') + ':');
      cRules.forEach(r => lines.push('  - "' + r.rule_name + '"' + (r.dimension ? ' (' + r.dimension + ')' : '')));
      lines.push('');
    }
    if (ceRules.length) {
      lines.push('Rules already allocated to this specific CDE (do not re-suggest):');
      ceRules.forEach(r => lines.push('  - "' + r.rule_name + '"' + (r.dimension ? ' (' + r.dimension + ')' : '')));
      lines.push('');
    }
  }

  lines.push('TASK:');
  lines.push('Based on the profiling data above, suggest data quality rules for this field.');
  lines.push('Each rule must be implementable as an Athena SQL SELECT COUNT(*) query counting failing records.');
  lines.push('Use these exact placeholders in the SQL: {SOURCE_DATABASE_NAME}, {SOURCE_TABLE_NAME}, {SOURCE_FIELD_NAME}.');
  lines.push('');
  lines.push('CRITICAL -- SNAPSHOT FILTER RULE (read carefully):');
  lines.push('The DQ engine that executes these queries will append a snapshot/timestamp filter at run time.');
  lines.push('DO NOT include any snapshot or timestamp filter condition in either query.');
  lines.push('The engine concatenates as follows:');
  lines.push('  sql_code        -->  your query + " AND <timestamp_filter>"');
  lines.push('  sql_code_sample -->  your query + " WHERE <timestamp_filter>"');
  lines.push('This means:');
  lines.push('  - sql_code MUST contain a WHERE clause with only the business logic condition(s).');
  lines.push('    It must NOT include the snapshot filter. It must NOT end with a semicolon.');
  lines.push('    Example: SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} WHERE {SOURCE_FIELD_NAME} IS NULL');
  lines.push('  - sql_code_sample MUST NOT contain any WHERE clause at all.');
  lines.push('    The engine will append WHERE <timestamp_filter> to it at test time.');
  lines.push('    It must NOT end with a semicolon.');
  lines.push('    Example: SELECT * FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} LIMIT 100');
  if (snap) lines.push(`Note: the snapshot filter for this table is "${snap}" -- be aware of it when designing the WHERE clause logic, but do NOT include it in either query.`);
  lines.push('');
  lines.push('SQL CODING STANDARDS (apply to every query generated):');
  lines.push('1. NEVER use CAST(). Always use TRY_CAST() to avoid runtime data conversion errors.');
  lines.push('   Example: TRY_CAST({SOURCE_FIELD_NAME} AS DATE) IS NULL instead of CAST(...) IS NULL');
  lines.push('2. NEVER check for null or empty strings using "field IS NULL" or "TRIM(field) = \'\'".');
  lines.push('   Always use: NULLIF(TRIM({SOURCE_FIELD_NAME}), \'\') IS NULL');
  lines.push('   This single expression correctly handles NULL, empty string, and whitespace-only values.');
  lines.push('   For the inverse (field is populated): NULLIF(TRIM({SOURCE_FIELD_NAME}), \'\') IS NOT NULL');
  lines.push('');
  lines.push('Respond ONLY with a valid JSON array. No explanation, no markdown, no code fences.');
  lines.push('RULE NAMING CONVENTIONS (follow strictly):');
  lines.push('Rule names must be assertive -- they state what is enforced, not what is checked.');
  lines.push('  GOOD: "Values for this field cannot be null or empty"');
  lines.push('  BAD:  "Check if the value is null or empty" / "Validate null values"');
  lines.push('Do not name a specific field or CDE directly in the rule name unless the rule');
  lines.push('cannot possibly be parameterised. Rules are reusable templates; naming a field');
  lines.push('directly signals it is a one-off and not reusable.');
  lines.push('Apply one of these three prefixes based on scope:');
  lines.push('  "Generic - "     : rule is universally applicable to any field (e.g. null check, uniqueness)');
  if (cdsName) {
    const shortCds = cdsName.length > 30 ? cdsName.substring(0, 28).trim() + '..' : cdsName;
    lines.push(`  "${shortCds} - " : rule is meaningful only in the context of this Critical Data Set`);
  }
  lines.push('  "CDE - "         : rule is highly specific to this one field and cannot be generalised');
  lines.push('If a CDS or CDE name is long, shorten it in a way that remains logical and recognisable.');
  lines.push('');
  lines.push('Each element is either a NEW rule or a REUSE suggestion -- choose based on the catalogue above.');
  lines.push('');
  lines.push('NEW rule (no equivalent exists in the catalogue):');
  lines.push('[');
  lines.push('  {');
  lines.push('    "rule_name": "prefix + assertive statement, e.g. \'Generic - field values cannot be null or empty\'",');
  lines.push('    "dimension": "one of: Completeness, Validity, Uniqueness, Consistency, Timeliness, Accuracy",');
  lines.push('    "description": "business rule statement -- must start with \'As a business rule, \' and complete the sentence in plain English. Do not mention SQL, thresholds, or technical implementation details.",');
  lines.push('    "basis": "what in the profiling data triggered this suggestion",');
  lines.push('    "sql_code": "SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} WHERE <business logic only -- no snapshot filter -- no semicolon>",');
  lines.push('    "sql_code_sample": "SELECT * FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} LIMIT 100 (no WHERE clause -- no semicolon)"');
  lines.push('  }');
  lines.push(']');
  lines.push('');
  lines.push('REUSE suggestion (an existing rule from the catalogue already covers this concern):');
  lines.push('[');
  lines.push('  {');
  lines.push('    "reuse": true,');
  lines.push('    "existing_rule_name": "exact rule name copied from the catalogue list above",');
  lines.push('    "dimension": "one of: Completeness, Validity, Uniqueness, Consistency, Timeliness, Accuracy",');
  lines.push('    "basis": "why this existing rule applies to this CDE, and what in the profiling confirms it"');
  lines.push('  }');
  lines.push(']');
  lines.push('');
  lines.push('Return a single JSON array mixing both types as appropriate.');
  lines.push('For each concern you identify, prefer REUSE over NEW if an equivalent rule exists in the catalogue.');

  return lines.filter(l => l !== null).join('\n');
}

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

  // Step 3 per-card state: { [idx]: { ruleName, dimension, frequency, bumper, status } }
  const [cardState,     setCardState]    = useState({});
  const [addedRules,    setAddedRules]   = useState({});
  const [testCopied,    setTestCopied]   = useState({});

  const cdes     = data?.critical_data_element || [];
  const cdSets   = data?.critical_data_set     || [];
  const dirs     = data?.directorate           || [];
  const agencies = data?.executive_agency      || [];
  const profiling = data?.field_profiling      || [];
  const ddls     = data?.source_table_ddl      || [];
  const dims     = data?.quality_dimension     || [];
  const rules    = data?.data_quality_rule     || [];
  const allocs   = data?.data_quality_rule_allocation || [];

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
    setParseError(''); setSuggestions([]); setCardState({}); setAddedRules({});
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
      cs[i] = { ruleName: s.rule_name, dimension: s.dimension, frequency: 'DAILY', bumper: 1 };
    });
    setCardState(cs);
  };

  const setCard = (i, field, val) =>
    setCardState(prev => ({ ...prev, [i]: { ...prev[i], [field]: val } }));

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
            This CDE has no profiling data. Go to Physical Layer - Field Profiling to profile
            this field before generating rules.
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
                      {/* Frequency */}
                      <select value={cs.frequency || 'DAILY'}
                        onChange={e => setCard(i, 'frequency', e.target.value)}
                        style={{ fontSize:10, padding:'3px 7px', cursor:'pointer',
                          background:'var(--bg)', border:'1px solid var(--border)',
                          borderRadius:'var(--radius)', color:'var(--text)',
                          fontFamily:'var(--mono)' }}>
                        {['DAILY','WEEKLY','MONTHLY','AD-HOC'].map(f =>
                          <option key={f} value={f}>{f}</option>)}
                      </select>
                      {/* Bumper */}
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                          Bumper:
                        </span>
                        <button onClick={() => setCard(i, 'bumper', Math.max(1, (cs.bumper??1) - 1))}
                          style={{ background:'var(--bg)', border:'1px solid var(--border)',
                            borderRadius:3, width:18, height:20, cursor:'pointer',
                            color:'var(--text2)', fontSize:10,
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                          -
                        </button>
                        <span style={{ fontSize:11, fontFamily:'var(--mono)', fontWeight:600,
                          color:'var(--amber)', minWidth:16, textAlign:'center' }}>
                          {cs.bumper ?? 1}
                        </span>
                        <button onClick={() => setCard(i, 'bumper', Math.min(5, (cs.bumper??1) + 1))}
                          style={{ background:'var(--bg)', border:'1px solid var(--border)',
                            borderRadius:3, width:18, height:20, cursor:'pointer',
                            color:'var(--text2)', fontSize:10,
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                          +
                        </button>
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
