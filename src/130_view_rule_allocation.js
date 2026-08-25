function RuleAllocationFormPanel({ record, isEdit, onSave, onClose, data }) {
  const { upsertRecord, nextPk } = useApp();
  const accent = TABLE_GROUPS.find(g => g.tables.includes('data_quality_rule_allocation'))?.accent || 'var(--accent)';

  const schema = SCHEMA.data_quality_rule_allocation;

  const cdes        = data?.critical_data_element || [];
  const rules       = data?.data_quality_rule || [];
  const dimensions  = data?.quality_dimension || [];
  const dataSets    = data?.critical_data_set || [];
  const dirs        = data?.directorate || [];
  const agencies    = data?.executive_agency || [];
  const allAllocs   = data?.data_quality_rule_allocation || [];

  const cdeById    = useMemo(() => Object.fromEntries(cdes.map(c  => [c.critical_data_element_id, c])), [cdes]);
  const cdsById    = useMemo(() => Object.fromEntries(dataSets.map(d => [d.critical_data_set_id, d])), [dataSets]);
  const dirById    = useMemo(() => Object.fromEntries(dirs.map(d   => [d.directorate_id, d])),         [dirs]);
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])),  [agencies]);
  const ruleById   = useMemo(() => Object.fromEntries(rules.map(r  => [r.data_quality_rule_id, r])),   [rules]);

  // Cascading filter states (add only)
  const [filterAgencyId, setFilterAgencyId] = useState(() => {
    if (!isEdit || !record.critical_data_element_id) return null;
    const cde = cdeById[record.critical_data_element_id];
    const cds = cde ? cdsById[cde.critical_data_set_id] : null;
    const dir = cds ? dirById[cds.directorate_id] : null;
    return dir?.executive_agency_id ?? null;
  });
  const [filterDirId,  setFilterDirId]  = useState(() => {
    if (!isEdit || !record.critical_data_element_id) return null;
    const cde = cdeById[record.critical_data_element_id];
    const cds = cde ? cdsById[cde.critical_data_set_id] : null;
    return cds?.directorate_id ?? null;
  });
  const [filterCdsId,  setFilterCdsId]  = useState(() => {
    if (!isEdit || !record.critical_data_element_id) return null;
    const cde = cdeById[record.critical_data_element_id];
    return cde?.critical_data_set_id ?? null;
  });

  const [contextFilter, setContextFilter] = useState(true);

  const [values, setValues] = useState({
    [schema.pk]:               record?.[schema.pk] ?? nextPk('data_quality_rule_allocation'),
    critical_data_element_id:  record?.critical_data_element_id  ?? null,
    data_quality_rule_id:      record?.data_quality_rule_id      ?? null,
    quality_dimension_id:      record?.quality_dimension_id      ?? null,
    bumper_value:              record?.bumper_value               ?? null,
    frequency:                 record?.frequency                  ?? null,
    retiring_timestamp:        null,
  });
  const [errors,   setErrors]   = useState({});
  const [warnings, setWarnings] = useState({});

  const set = (field, value) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: null }));
    setWarnings(prev => ({ ...prev, [field]: null }));
  };

  // Cascading options
  const agencyOpts = useMemo(() =>
    [...agencies].filter(a => !a.retiring_timestamp)
      .sort((a,b) => (a.agency_acronymn||'').localeCompare(b.agency_acronymn||'')), [agencies]);
  const dirOpts = useMemo(() =>
    [...dirs].filter(d => !d.retiring_timestamp && d.executive_agency_id === filterAgencyId)
      .sort((a,b) => (a.directorate_name||'').localeCompare(b.directorate_name||'')), [dirs, filterAgencyId]);
  const cdsOpts = useMemo(() =>
    [...dataSets].filter(d => !d.retiring_timestamp && d.directorate_id === filterDirId)
      .sort((a,b) => (a.data_set_name||'').localeCompare(b.data_set_name||'')), [dataSets, filterDirId]);
  const cdeOpts = useMemo(() =>
    [...cdes].filter(c => !c.retiring_timestamp && c.critical_data_set_id === filterCdsId)
      .sort((a,b) => (a.source_field_name||'').localeCompare(b.source_field_name||'')), [cdes, filterCdsId]);

  // When contextFilter is ON: show generic rules (no prefix, or "Generic - " prefix) plus rules
  // whose prefix exactly matches the selected CDS name. Any other CDS-prefixed rule is hidden.
  // When contextFilter is OFF: bypass filtering and show all active rules.
  const ruleOpts = useMemo(() => {
    const base = [...rules].filter(r => !r.retiring_timestamp);
    if (!filterCdsId || !contextFilter) return base.sort((a,b) => (a.rule_name||'').localeCompare(b.rule_name||''));
    const cdsName = cdsById[filterCdsId]?.data_set_name || '';
    return base
      .filter(r => {
        const name = r.rule_name || '';
        const sepIdx = name.indexOf(' - ');
        if (sepIdx === -1) return true;                       // no prefix: generic
        const prefix = name.slice(0, sepIdx);
        if (prefix.toLowerCase() === 'generic') return true; // explicit generic prefix
        return prefix === cdsName;                            // hide all other CDS rules
      })
      .sort((a,b) => (a.rule_name||'').localeCompare(b.rule_name||''));
  }, [rules, filterCdsId, cdsById, contextFilter]);
  const dimOpts = useMemo(() =>
    [...dimensions].filter(d => !d.retiring_timestamp)
      .sort((a,b) => (a.dimension_name||'').localeCompare(b.dimension_name||'')), [dimensions]);

  // Resolved edit labels
  const editCde    = isEdit ? cdeById[values.critical_data_element_id] : null;
  const editCds    = editCde ? cdsById[editCde.critical_data_set_id] : null;
  const editDir    = editCds ? dirById[editCds.directorate_id] : null;
  const editAgency = editDir ? agencyById[editDir.executive_agency_id] : null;
  const editRule   = isEdit ? ruleById[values.data_quality_rule_id] : null;

  // Duplicate check: same rule on same CDE (regardless of dimension), excluding current record
  // Only relevant on Add -- on Edit the CDE and Rule are read-only so no duplicate can be created
  const checkDuplicate = (cdeId, ruleId) => {
    if (isEdit || !cdeId || !ruleId) return false;
    return allAllocs.some(a =>
      a.critical_data_element_id === parseInt(cdeId) &&
      a.data_quality_rule_id === parseInt(ruleId) &&
      !a.retiring_timestamp
    );
  };

  // Live duplicate warning
  useEffect(() => {
    if (checkDuplicate(values.critical_data_element_id, values.data_quality_rule_id)) {
      setWarnings(prev => ({ ...prev, data_quality_rule_id:
        'This rule is already allocated to this CDE.' }));
    } else {
      setWarnings(prev => ({ ...prev, data_quality_rule_id: null }));
    }
  }, [values.critical_data_element_id, values.data_quality_rule_id]);

  const ruleSqlWarnings = useMemo(() => {
    const rule = ruleById[values.data_quality_rule_id];
    if (!rule) return [];
    return computeRuleSqlWarnings(rule.sql_code, rule.sql_code_sample);
  }, [values.data_quality_rule_id, ruleById]);

  const validate = () => {
    const errs = {};
    if (!values.critical_data_element_id) errs.critical_data_element_id = 'Required';
    if (!values.data_quality_rule_id)     errs.data_quality_rule_id     = 'Required';
    if (!values.quality_dimension_id)     errs.quality_dimension_id     = 'Required';
    if (!values.frequency || !String(values.frequency).trim()) errs.frequency = 'Required';
    if (checkDuplicate(values.critical_data_element_id, values.data_quality_rule_id)) {
      errs.data_quality_rule_id = 'This rule is already allocated to this CDE.';
    }
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

  // Compute SQL inline whenever CDE + Rule are both selected
  const inlineSql = useMemo(() => {
    const cde  = cdeById[values.critical_data_element_id];
    const rule = ruleById[values.data_quality_rule_id];
    if (!cde || !rule || !cde.source_snapshot_filter) return null;
    return {
      rule:   composeSql(rule.sql_code,        cde, 'rule'),
      sample: rule.sql_code_sample ? composeSql(rule.sql_code_sample, cde, 'sample') : null,
    };
  }, [values.critical_data_element_id, values.data_quality_rule_id, cdeById, ruleById]);

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
        position:'fixed', top:0, right:0, bottom:0, width:'min(560px, 60vw)',
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
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Rule Allocation</div>
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

          {/* CDE -- cascading on add, read-only on edit */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600,
              color: errors.critical_data_element_id ? 'var(--red)' : 'var(--text2)',
              marginBottom:4 }}>
              Critical Data Element <span style={{ color:'var(--red)' }}>*</span>
            </label>
            {isEdit ? (
              <div style={{ padding:'7px 10px', background:'var(--bg3)',
                border:'1px solid var(--border)', borderRadius:'var(--radius)',
                fontSize:12, fontFamily:'var(--mono)', color:'var(--text)' }}>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>
                  {[editAgency?.agency_acronymn, editCds?.data_set_name].filter(Boolean).join(' - ')}
                </div>
                <div style={{ wordBreak:'break-all' }}>{editCde?.source_field_name}</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <select value={filterAgencyId ?? ''} style={{ ...inputBase, cursor:'pointer', border:'1px solid var(--border)' }}
                  onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
                    setFilterAgencyId(v); setFilterDirId(null); setFilterCdsId(null);
                    setContextFilter(true);
                    set('critical_data_element_id', null); set('data_quality_rule_id', null); }}>
                  <option value="">-- select agency --</option>
                  {agencyOpts.map(a => <option key={a.executive_agency_id} value={a.executive_agency_id}>{a.agency_acronymn} - {a.agency_name}</option>)}
                </select>
                <select value={filterDirId ?? ''} disabled={!filterAgencyId}
                  style={{ ...inputBase, cursor: filterAgencyId ? 'pointer' : 'not-allowed', opacity: filterAgencyId ? 1 : 0.5, border:'1px solid var(--border)' }}
                  onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
                    setFilterDirId(v); setFilterCdsId(null); setContextFilter(true);
                    set('critical_data_element_id', null); set('data_quality_rule_id', null); }}>
                  <option value="">{filterAgencyId ? '-- select directorate --' : '-- select agency first --'}</option>
                  {dirOpts.map(d => <option key={d.directorate_id} value={d.directorate_id}>{d.directorate_name}</option>)}
                </select>
                {filterDirId && cdsOpts.length === 0 ? (
                  <div style={{ padding:'8px 12px', background:'var(--bg3)',
                    border:'1px solid var(--amber)', borderRadius:'var(--radius)',
                    fontSize:12, color:'var(--amber)', display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ width:14, height:14, flexShrink:0 }}><Icon.Warning/></span>
                    No data sets found in this directorate.
                  </div>
                ) : (
                  <select value={filterCdsId ?? ''} disabled={!filterDirId}
                    style={{ ...inputBase, cursor: filterDirId ? 'pointer' : 'not-allowed', opacity: filterDirId ? 1 : 0.5, border:'1px solid var(--border)' }}
                    onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
                      setFilterCdsId(v); setContextFilter(true);
                      set('critical_data_element_id', null); set('data_quality_rule_id', null); }}>
                    <option value="">{filterDirId ? '-- select data set --' : '-- select directorate first --'}</option>
                    {cdsOpts.map(d => <option key={d.critical_data_set_id} value={d.critical_data_set_id}>{d.data_set_name}</option>)}
                  </select>
                )}
                <select value={values.critical_data_element_id ?? ''} disabled={!filterCdsId}
                  style={{ ...inputBase, cursor: filterCdsId ? 'pointer' : 'not-allowed',
                    opacity: filterCdsId ? 1 : 0.5, ...borderFor('critical_data_element_id') }}
                  onChange={e => set('critical_data_element_id', e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">{filterCdsId ? '-- select field --' : '-- select data set first --'}</option>
                  {cdeOpts.map(c => <option key={c.critical_data_element_id} value={c.critical_data_element_id}>{c.source_field_name}</option>)}
                </select>
                {errors.critical_data_element_id && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{errors.critical_data_element_id}</div>}
              </div>
            )}
          </div>

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
                {filterCdsId && (() => {
                  const totalActive = rules.filter(r => !r.retiring_timestamp).length;
                  const cdsName = cdsById[filterCdsId]?.data_set_name || '';
                  const hint = !contextFilter
                    ? 'Showing all available rules'
                    : ruleOpts.length < totalActive
                      ? ('Showing ' + ruleOpts.length + ' of ' + totalActive + ' rules. Rules withou prefix or prefixed with "Generic - " or "' + cdsName + ' - " listed.')
                      : null;
                  return (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                      <button onClick={() => setContextFilter(v => !v)} style={{
                        display:'flex', alignItems:'center', gap:5,
                        padding:'4px 10px', background:'var(--bg3)',
                        border: '1px solid ' + (contextFilter ? accent : 'var(--border)'),
                        borderRadius:12, fontSize:11, cursor:'pointer',
                        color: contextFilter ? accent : 'var(--text3)',
                        whiteSpace:'nowrap', flexShrink:0, transition:'all 0.15s',
                      }}>
                        Filter
                      </button>
                      {hint && <span style={{ fontSize:11, color:'var(--text3)' }}>{hint}</span>}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Dimension */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600,
              color: errors.quality_dimension_id ? 'var(--red)' : 'var(--text2)',
              marginBottom:4 }}>
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
            {errors.bumper_value && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{errors.bumper_value}</div>}
          </div>

          <RuleSqlWarningNotices warnings={ruleSqlWarnings} hint="Review and correct this rule in the Rules Explorer page." />

          {/* Inline SQL preview -- auto-shown when CDE + Rule selected */}
          {inlineSql && (
            <div style={{ marginTop:6 }}>
              {/* Rule SQL */}
              <div style={{ marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  marginBottom:4 }}>
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

              {/* Sample SQL */}
              {inlineSql.sample ? (
                <div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    marginBottom:4 }}>
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
          {values.critical_data_element_id && values.data_quality_rule_id &&
            !cdeById[values.critical_data_element_id]?.source_snapshot_filter && (
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

// ===============================================================================
// RULE ALLOCATION VIEW -- grouped by rule, collapsible, with SQL buttons
// ===============================================================================
function RuleAllocationView() {
  const { data, retireRecord, restoreRecord, openSqlPanel, openAllocForm, nextPk, canEdit } = useApp();
  const dp = !canEdit ? { style:{ opacity:0.35, cursor:'not-allowed', pointerEvents:'none' }, title:'Set your steward identity in Settings to make changes' } : {};

  const [search,      setSearch]      = useState(() => { const h = _allocSearchHint; _allocSearchHint = ''; return h; });
  const [showRetired, setShowRetired] = useState(false);
  const [expanded,    setExpanded]    = useState({});

  const openAdd  = () => openAllocForm({
    data_quality_rule_allocation_id: nextPk('data_quality_rule_allocation'),
    critical_data_element_id: null, data_quality_rule_id: null,
    quality_dimension_id: null, bumper_value: null,
    frequency: null, retiring_timestamp: null,
  }, false);
  const openEdit = (alloc) => openAllocForm({ ...alloc }, true);

  const rows        = data?.data_quality_rule_allocation || [];
  const rules       = data?.data_quality_rule || [];
  const cdes        = data?.critical_data_element || [];
  const dimensions  = data?.quality_dimension || [];
  const dataSets    = data?.critical_data_set || [];
  const directorates = data?.directorate || [];
  const agencies    = data?.executive_agency || [];
  const profiling   = data?.field_profiling || [];
  const accent      = TABLE_GROUPS.find(g => g.tables.includes('data_quality_rule_allocation'))?.accent || 'var(--accent)';
  const physAccent  = 'var(--purple)';

  const ruleById   = useMemo(() => Object.fromEntries(rules.map(r  => [r.data_quality_rule_id, r])),     [rules]);
  const cdeById    = useMemo(() => Object.fromEntries(cdes.map(c   => [c.critical_data_element_id, c])), [cdes]);
  const dimById    = useMemo(() => Object.fromEntries(dimensions.map(d => [d.quality_dimension_id, d])), [dimensions]);
  const cdsById    = useMemo(() => Object.fromEntries(dataSets.map(d  => [d.critical_data_set_id, d])),  [dataSets]);
  const dirById    = useMemo(() => Object.fromEntries(directorates.map(d => [d.directorate_id, d])),     [directorates]);
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a  => [a.executive_agency_id, a])),   [agencies]);

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

  const toggleExpand = (ruleId) => setExpanded(prev => ({ ...prev, [ruleId]: !prev[ruleId] }));

  // Group allocations by rule, sorted by rule name
  const grouped = useMemo(() => {
    const visible = showRetired ? rows : rows.filter(r => !r.retiring_timestamp);
    const map = {};
    for (const alloc of visible) {
      const rid = alloc.data_quality_rule_id;
      if (!map[rid]) map[rid] = [];
      map[rid].push(alloc);
    }
    let entries = Object.entries(map).map(([rid, allocs]) => ({
      ruleId: parseInt(rid),
      rule:   ruleById[parseInt(rid)],
      allocs: [...allocs].sort((a, b) =>
        (cdeById[a.critical_data_element_id]?.source_field_name || '')
          .localeCompare(cdeById[b.critical_data_element_id]?.source_field_name || '')
      ),
    })).sort((a, b) => (a.rule?.rule_name || '').localeCompare(b.rule?.rule_name || ''));

    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries
        .map(entry => ({
          ...entry,
          allocs: entry.allocs.filter(alloc => {
            const cde = cdeById[alloc.critical_data_element_id];
            const dim = dimById[alloc.quality_dimension_id];
            return (
              (entry.rule?.rule_name        || '').toLowerCase().includes(q) ||
              (cde?.source_field_name       || '').toLowerCase().includes(q) ||
              (dim?.dimension_name          || '').toLowerCase().includes(q)
            );
          }),
        }))
        .filter(e => e.allocs.length > 0 ||
          (e.rule?.rule_name || '').toLowerCase().includes(q));
    }
    return entries;
  }, [rows, showRetired, search, ruleById, cdeById, dimById]);

  const openSql = (mode, alloc) => {
    const rule   = ruleById[alloc.data_quality_rule_id];
    const cde    = cdeById[alloc.critical_data_element_id];
    const cds    = cde ? cdsById[cde.critical_data_set_id] : null;
    const dir    = cds ? dirById[cds.directorate_id] : null;
    const agency = dir ? agencyById[dir.executive_agency_id] : null;
    const template = mode === 'sample' ? rule?.sql_code_sample : rule?.sql_code;
    const sql = composeSql(template, cde, mode);
    const snapSubstituted = cde?.source_snapshot_filter
      ? substituteCdeTokens(cde.source_snapshot_filter, cde) : null;
    openSqlPanel({ mode, sql, ruleName: rule?.rule_name || '',
      fieldName: cde?.source_field_name || '', cdsName: cds?.data_set_name || '',
      agencyAcronym: agency?.agency_acronymn || '',
      snapshotFilter: snapSubstituted });
  };

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            {SCHEMA.data_quality_rule_allocation.label}
          </div>
          <div className="page-sub">
            {grouped.length} rule{grouped.length !== 1 ? 's' : ''} - {liveCount} live records
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
            placeholder="Search by rule, field or dimension..."
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
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {grouped.map(({ ruleId, rule, allocs }) => {
            const isOpen    = !!expanded[ruleId];
            const isRetired = !!rule?.retiring_timestamp;
            return (
              <div key={ruleId} style={{
                background:'var(--bg2)', border:'1px solid var(--border)',
                borderLeft:`3px solid ${isRetired ? 'var(--border)' : accent}`,
                borderRadius:'var(--radius-lg)',
                opacity: isRetired ? 0.6 : 1,
              }}>
                {/* Rule header -- clickable */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:10,
                  padding:'11px 14px', cursor:'pointer' }}
                  onClick={() => toggleExpand(ruleId)}>
                  <div style={{ color:'var(--text3)', width:14, height:14, marginTop:2,
                    flexShrink:0, transform: isOpen ? 'rotate(90deg)' : 'none',
                    transition:'transform 0.15s' }}>
                    <Icon.ChevronR/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'var(--text)',
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {rule?.rule_name || `Rule #${ruleId}`}
                    </div>
                    {rule?.rule_explanation && (
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:2,
                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {rule.rule_explanation}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)',
                      background:'var(--bg3)', padding:'1px 6px',
                      borderRadius:3, border:'1px solid var(--border)' }}>
                      {allocs.length} CDE{allocs.length !== 1 ? 's' : ''}
                    </span>
                    {rule?.automated &&
                      <span className="badge badge-green" style={{ fontSize:9 }}>automated</span>
                    }
                  </div>
                </div>

                {/* Expanded allocations */}
                {isOpen && (
                  <div style={{ borderTop:'1px solid var(--border)', padding:'8px 14px 10px' }}>
                    {allocs.length === 0 ? (
                      <div style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic', padding:'4px 0' }}>
                        No allocations.
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                        {/* Column headers */}
                        <div style={{ display:'grid',
                          gridTemplateColumns:'1fr 110px 70px 60px 64px 28px',
                          gap:8, padding:'0 8px 4px',
                          borderBottom:'1px solid var(--border)' }}>
                          {['Critical data element','Dimension','Frequency','Bumper','SQL',''].map(h => (
                            <span key={h} style={{ fontSize:10, fontWeight:600,
                              color:'var(--text3)', letterSpacing:'0.05em',
                              textTransform:'uppercase' }}>{h}</span>
                          ))}
                        </div>

                        {allocs.map(alloc => {
                          const pk        = alloc.data_quality_rule_allocation_id;
                          const isAllocRetired = !!alloc.retiring_timestamp;
                          const cde       = cdeById[alloc.critical_data_element_id];
                          const dim       = dimById[alloc.quality_dimension_id];
                          const cds       = cde ? cdsById[cde.critical_data_set_id] : null;
                          const dir       = cds ? dirById[cds.directorate_id] : null;
                          const agency    = dir ? agencyById[dir.executive_agency_id] : null;
                          const missingFilter = cde && !cde.source_snapshot_filter;
                          const hasSample = !!rule?.sql_code_sample;
                          const profKey   = `${cde?.source_database_name}|||${cde?.source_table_name}|||${cde?.source_field_name}`;
                          const hasProfile = !!profilingByKey[profKey];
                          return (
                            <div key={pk} style={{
                              display:'grid',
                              gridTemplateColumns:'1fr 110px 70px 60px 64px 28px',
                              gap:8, padding:'5px 8px',
                              background:'var(--bg3)',
                              border: missingFilter ? '1px solid var(--red)' : '1px solid var(--border)',
                              borderRadius:'var(--radius)',
                              opacity: isAllocRetired ? 0.5 : 1,
                              alignItems:'center',
                            }}>
                              {/* CDE */}
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:12, color:'var(--text)',
                                  display:'flex', alignItems:'center', gap:5,
                                  overflow:'hidden' }}>
                                  <span style={{ fontFamily:'var(--mono)', fontWeight:500,
                                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                    {cde?.source_field_name || `CDE #${alloc.critical_data_element_id}`}
                                  </span>
                                  {missingFilter && (
                                    <span title="Missing snapshot filter"
                                      style={{ color:'var(--red)', width:12, height:12,
                                        flexShrink:0, display:'inline-flex' }}>
                                      <Icon.Warning/>
                                    </span>
                                  )}
                                  {hasProfile && (
                                    <span title={`Profiled ${profilingByKey[profKey].profiled_at}`}
                                      style={{ fontSize:9, fontFamily:'var(--mono)',
                                        fontWeight:600, color:physAccent,
                                        background:`${physAccent}15`,
                                        border:`1px solid ${physAccent}40`,
                                        borderRadius:3, padding:'1px 5px',
                                        flexShrink:0, whiteSpace:'nowrap' }}>
                                      profiled
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize:10, color:'var(--text3)', marginTop:2,
                                  fontFamily:'var(--mono)', whiteSpace:'nowrap',
                                  overflow:'hidden', textOverflow:'ellipsis' }}>
                                  {[cde?.source_database_name, cde?.source_table_name]
                                    .filter(Boolean).join('.')}
                                  {(cde?.source_database_name || cde?.source_table_name) &&
                                    (cds?.data_set_name || agency?.agency_acronymn) && ' - '}
                                  {[cds?.data_set_name, agency?.agency_acronymn]
                                    .filter(Boolean).join(' - ')}
                                </div>
                              </div>
                              {/* Dimension */}
                              <span style={{ fontSize:11, color:accent, fontFamily:'var(--mono)' }}>
                                {dim?.dimension_name || '--'}
                              </span>
                              {/* Frequency */}
                              <span style={{ fontSize:11, color:'var(--text2)' }}>
                                {alloc.frequency || '--'}
                              </span>
                              {/* Bumper */}
                              <div>
                                {alloc.bumper_value !== null && alloc.bumper_value !== undefined ? (
                                  <span style={{ fontSize:11, fontFamily:'var(--mono)',
                                    fontWeight:600, color:'var(--amber)',
                                    background:'var(--amber-bg)',
                                    border:'1px solid var(--amber)',
                                    borderRadius:3, padding:'1px 7px' }}>
                                    {alloc.bumper_value}
                                  </span>
                                ) : (
                                  <span style={{ fontSize:11, color:'var(--text3)',
                                    fontFamily:'var(--mono)' }}>--</span>
                                )}
                              </div>
                              {/* SQL */}
                              <div style={{ display:'flex', gap:3, alignItems:'center' }}>
                                <button className="btn btn-ghost"
                                  style={{ padding:'2px 5px',
                                    color: missingFilter ? 'var(--red)' : 'var(--accent)' }}
                                  disabled={!cde || !rule || missingFilter}
                                  title={missingFilter ? 'Missing snapshot filter' : 'View composed rule SQL'}
                                  onClick={e => { e.stopPropagation(); openSql('rule', alloc); }}>
                                  <div style={{ width:13, height:13 }}><Icon.Code/></div>
                                </button>
                                {hasSample ? (
                                  <button className="btn btn-ghost"
                                    style={{ padding:'2px 5px', color:'var(--text2)' }}
                                    disabled={!cde || !rule || missingFilter}
                                    title={missingFilter ? 'Missing snapshot filter' : 'View composed sample SQL'}
                                    onClick={e => { e.stopPropagation(); openSql('sample', alloc); }}>
                                    <div style={{ width:13, height:13 }}><Icon.Sample/></div>
                                  </button>
                                ) : (
                                  <span style={{ fontSize:8, fontFamily:'var(--mono)',
                                    fontWeight:600, color:'var(--text3)',
                                    background:'var(--bg)', border:'1px solid var(--border)',
                                    borderRadius:3, padding:'1px 4px' }}
                                    title="No sample code -- engine uses default approach">DEF</span>
                                )}
                              </div>
                              {/* Edit */}
                              {!isAllocRetired && (
                                <button {...dp} className="btn btn-ghost" style={{ padding:'2px 4px' }}
                                  onClick={e => { e.stopPropagation(); openEdit(alloc); }}
                                  title="Edit allocation">
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
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
      )}
    </div>
  );
}

