function CriticalDataElementFormPanel({ record, isEdit, preCdsId, preTableName, preDbName, onSave, onClose, data }) {
  const { nextPk } = useApp();
  const accent     = TABLE_GROUPS.find(g => g.tables.includes('critical_data_element'))?.accent || 'var(--accent)';
  const physAccent = 'var(--purple)';
  const schema     = SCHEMA.critical_data_element;

  const cdSets   = data?.critical_data_set || [];
  const dirs     = data?.directorate || [];
  const agencies = data?.executive_agency || [];
  const ddls     = useMemo(() =>
    (data?.source_table_ddl || []).filter(r => !r.retiring_timestamp), [data]);
  const profiling = data?.field_profiling || [];

  const cdsById    = useMemo(() => Object.fromEntries(cdSets.map(d => [d.critical_data_set_id, d])),  [cdSets]);
  const dirById    = useMemo(() => Object.fromEntries(dirs.map(d   => [d.directorate_id, d])),        [dirs]);
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])), [agencies]);

  // DDL-derived options
  const ddlTableOpts = useMemo(() =>
    [...ddls].sort((a,b) =>
      `${a.source_database_name}.${a.source_table_name}`
        .localeCompare(`${b.source_database_name}.${b.source_table_name}`)),
  [ddls]);

  // Resolve initial agency/dir from existing record or pre-seed
  const initCdsId = isEdit ? record?.critical_data_set_id : (preCdsId || null);
  const initCds   = initCdsId ? cdsById[initCdsId] : null;
  const initDir   = initCds ? dirById[initCds.directorate_id] : null;

  const [filterAgencyId, setFilterAgencyId] = useState(initDir?.executive_agency_id ?? null);
  const [filterDirId,    setFilterDirId]    = useState(initCds?.directorate_id ?? null);
  const [selectedDdlKey, setSelectedDdlKey] = useState(() => {
    const db  = record?.source_database_name || preDbName;
    const tbl = record?.source_table_name    || preTableName;
    if (db && tbl) return `${db}|||${tbl}`;
    return '';
  });

  const [values, setValues] = useState({
    [schema.pk]:               record?.[schema.pk]               ?? nextPk('critical_data_element'),
    critical_data_set_id:      record?.critical_data_set_id      ?? preCdsId ?? null,
    source_platform_name:      record?.source_platform_name      ?? null,
    source_system_name:        record?.source_system_name        ?? null,
    source_database_name:      record?.source_database_name      ?? preDbName ?? null,
    source_table_name:         record?.source_table_name         ?? preTableName ?? null,
    source_field_name:         record?.source_field_name         ?? null,
    source_snapshot_filter:    record?.source_snapshot_filter    ?? null,
    data_element_definition:   record?.data_element_definition   ?? null,
    data_element_explanation:  record?.data_element_explanation  ?? null,
    retiring_timestamp:        null,
  });
  const [errors, setErrors] = useState({});

  const set = (field, val) => {
    setValues(prev => ({ ...prev, [field]: val || null }));
    setErrors(prev => ({ ...prev, [field]: null }));
  };

  // Selected DDL derived data
  const selectedDdl = ddls.find(d =>
    `${d.source_database_name}|||${d.source_table_name}` === selectedDdlKey
  );
  const ddlCols = useMemo(() =>
    selectedDdl?.parsed_columns ? JSON.parse(selectedDdl.parsed_columns) : [],
  [selectedDdl]);
  const physicalType = ddlCols.find(c => c.name === values.source_field_name)?.type || null;

  // Profiling for current field
  const fieldProfile = useMemo(() => {
    if (!values.source_database_name || !values.source_table_name || !values.source_field_name) return null;
    return profiling.find(p =>
      p.source_database_name === values.source_database_name &&
      p.source_table_name    === values.source_table_name &&
      p.source_field_name    === values.source_field_name &&
      !p.retiring_timestamp
    ) || null;
  }, [profiling, values.source_database_name, values.source_table_name, values.source_field_name]);

  // Count of profiled fields in the currently selected table (for add mode hint)
  const tableProfiledCount = useMemo(() => {
    if (!values.source_database_name || !values.source_table_name) return 0;
    return profiling.filter(p =>
      !p.retiring_timestamp &&
      p.source_database_name === values.source_database_name &&
      p.source_table_name    === values.source_table_name
    ).length;
  }, [profiling, values.source_database_name, values.source_table_name]);

  const critGroups = useMemo(() =>
    (data?.criticality_group || [])
      .filter(g => !g.retiring_timestamp)
      .sort((a,b) => a.criticality_group_id - b.criticality_group_id),
  [data]);

  const critLevelOpts = useMemo(() =>
    (data?.criticality_level || [])
      .filter(l => !l.retiring_timestamp)
      .sort((a,b) => (b.criticality_score||0) - (a.criticality_score||0)),
  [data]);

  // In edit mode: map of criticality_group_id -> { levelId, rowId }
  const [critLevels, setCritLevels] = useState(() => {
    if (isEdit) {
      const m = {};
      for (const c of (data?.cde_criticality || [])) {
        if (!c.retiring_timestamp && c.critical_data_element_id === record?.[SCHEMA.critical_data_element.pk]) {
          m[c.criticality_group_id] = { levelId: c.criticality_level_id, rowId: c.cde_criticality_id };
        }
      }
      return m;
    }
    // Add mode: default all criticality groups to Medium
    const medium = (data?.criticality_level || []).find(l => !l.retiring_timestamp && l.criticality_description === 'Medium');
    if (!medium) return {};
    const m = {};
    for (const g of (data?.criticality_group || []).filter(g => !g.retiring_timestamp)) {
      m[g.criticality_group_id] = { levelId: medium.criticality_level_id };
    }
    return m;
  });

  const handleDdlTableSelect = (key) => {
    setSelectedDdlKey(key);
    if (key && key !== '__manual__') {
      const [db, tbl] = key.split('|||');
      set('source_database_name', db);
      set('source_table_name', tbl);
      set('source_field_name', null);
    }
  };

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

  // Edit read-only labels
  const editCds    = isEdit ? cdsById[values.critical_data_set_id] : null;
  const editDir    = editCds ? dirById[editCds.directorate_id] : null;
  const editAgency = editDir ? agencyById[editDir.executive_agency_id] : null;

  const validate = () => {
    const errs = {};
    if (!values.critical_data_set_id)                errs.critical_data_set_id    = 'Required';
    if (!values.source_database_name?.trim())         errs.source_database_name    = 'Required';
    if (!values.source_table_name?.trim())            errs.source_table_name       = 'Required';
    if (!values.source_field_name?.trim())            errs.source_field_name       = 'Required';
    if (!values.source_snapshot_filter?.trim())       errs.source_snapshot_filter  = 'Required';
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const saved = { ...values };
    if (critGroups.length > 0) {
      const maxExistingPk = (data?.cde_criticality || []).reduce((m, r) => Math.max(m, r.cde_criticality_id || 0), 0);
      let newPkBase = maxExistingPk + 1;
      saved.__criticalities = critGroups
        .filter(g => critLevels[g.criticality_group_id]?.levelId)
        .map(g => {
          const entry = critLevels[g.criticality_group_id];
          const rowId = entry?.rowId ?? newPkBase++;
          return {
            cde_criticality_id:         rowId,
            critical_data_element_id:   values[SCHEMA.critical_data_element.pk],
            criticality_group_id:       g.criticality_group_id,
            criticality_level_id:       entry.levelId,
            retiring_timestamp:         null,
          };
        });
    }
    onSave(saved);
  };

  const inputBase = {
    width:'100%', padding:'7px 10px', fontSize:13,
    background:'var(--bg3)', borderRadius:'var(--radius)',
    color:'var(--text)', fontFamily:'var(--sans)', outline:'none',
  };
  const borderFor = (f) => ({
    border: `1px solid ${errors[f] ? 'var(--red)' : 'var(--border)'}`,
  });
  const monoInput = { fontFamily:'var(--mono)', fontSize:12 };

  function renderField(label, fieldKey, required, tall, mono) {
    return (
    <div style={{ marginBottom:12 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:600,
        color: errors[fieldKey] ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
        {label}{required && <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>}
        {!required && <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400, marginLeft:6 }}>(optional)</span>}
      </label>
      {tall ? (
        <textarea rows={3} value={values[fieldKey] ?? ''}
          onChange={e => set(fieldKey, e.target.value)}
          style={{ ...inputBase, ...borderFor(fieldKey), ...(mono ? monoInput : {}),
            resize:'vertical', lineHeight:1.5 }}/>
      ) : (
        <input type="text" value={values[fieldKey] ?? ''}
          onChange={e => set(fieldKey, e.target.value)}
          style={{ ...inputBase, ...borderFor(fieldKey), ...(mono ? monoInput : {}) }}/>
      )}
      {errors[fieldKey] && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{errors[fieldKey]}</div>}
    </div>
    );
  }

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
              {isEdit ? 'Edit' : 'Add'} CDE
            </div>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Critical Data Element</div>
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

          {/* Data Set -- cascading on Add, read-only on Edit */}
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:600,
              color: errors.critical_data_set_id ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
              Critical Data Set <span style={{ color:'var(--red)' }}>*</span>
            </label>
            {isEdit ? (
              <div style={{ padding:'7px 10px', background:'var(--bg3)',
                border:'1px solid var(--border)', borderRadius:'var(--radius)',
                fontSize:12, fontFamily:'var(--mono)', color:'var(--text)' }}>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>
                  {editAgency?.agency_acronymn}
                </div>
                <div>{editCds?.data_set_name}</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <select value={filterAgencyId ?? ''} style={{ ...inputBase, cursor:'pointer', border:'1px solid var(--border)' }}
                  onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
                    setFilterAgencyId(v); setFilterDirId(null); set('critical_data_set_id', null); }}>
                  <option value="">-- select agency --</option>
                  {agencyOpts.map(a => <option key={a.executive_agency_id} value={a.executive_agency_id}>{a.agency_acronymn} - {a.agency_name}</option>)}
                </select>
                {filterAgencyId && dirOpts.length === 0 ? (
                  <div style={{ padding:'7px 10px', background:'var(--bg3)', border:'1px solid var(--amber)',
                    borderRadius:'var(--radius)', fontSize:12, color:'var(--amber)',
                    display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ width:13, height:13 }}><Icon.Warning/></span>
                    No directorates found for this agency.
                  </div>
                ) : (
                  <select value={filterDirId ?? ''} disabled={!filterAgencyId}
                    style={{ ...inputBase, cursor: filterAgencyId ? 'pointer' : 'not-allowed',
                      opacity: filterAgencyId ? 1 : 0.5, border:'1px solid var(--border)' }}
                    onChange={e => { const v = e.target.value ? parseInt(e.target.value) : null;
                      setFilterDirId(v); set('critical_data_set_id', null); }}>
                    <option value="">{filterAgencyId ? '-- select directorate --' : '-- select agency first --'}</option>
                    {dirOpts.map(d => <option key={d.directorate_id} value={d.directorate_id}>{d.directorate_name}</option>)}
                  </select>
                )}
                {filterDirId && cdsOpts.length === 0 ? (
                  <div style={{ padding:'7px 10px', background:'var(--bg3)', border:'1px solid var(--amber)',
                    borderRadius:'var(--radius)', fontSize:12, color:'var(--amber)',
                    display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ width:13, height:13 }}><Icon.Warning/></span>
                    No data sets found in this directorate.
                  </div>
                ) : (
                  <select value={values.critical_data_set_id ?? ''} disabled={!filterDirId}
                    style={{ ...inputBase, cursor: filterDirId ? 'pointer' : 'not-allowed',
                      opacity: filterDirId ? 1 : 0.5, ...borderFor('critical_data_set_id') }}
                    onChange={e => set('critical_data_set_id', e.target.value ? parseInt(e.target.value) : null)}>
                    <option value="">{filterDirId ? '-- select data set --' : '-- select directorate first --'}</option>
                    {cdsOpts.map(d => <option key={d.critical_data_set_id} value={d.critical_data_set_id}>{d.data_set_name}</option>)}
                  </select>
                )}
                {errors.critical_data_set_id && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{errors.critical_data_set_id}</div>}
              </div>
            )}
          </div>

          {/* Source fields group */}
          <div style={{ marginBottom:6, paddingBottom:10,
            borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:'var(--text3)', marginBottom:10 }}>
              Source location
            </div>

            {/* DDL table selector */}
            {ddlTableOpts.length > 0 && (
              <div style={{ marginBottom:10 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:600,
                  color:'var(--text2)', marginBottom:4 }}>
                  Select from Table Profiling
                  <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400, marginLeft:6 }}>
                    (optional - pre-fills database, table and field)
                  </span>
                </label>
                <select value={selectedDdlKey} style={{ width:'100%', padding:'7px 10px',
                  fontSize:12, background:'var(--bg3)', border:'1px solid var(--border)',
                  borderRadius:'var(--radius)', color:'var(--text)',
                  fontFamily:'var(--mono)', cursor:'pointer', outline:'none' }}
                  onChange={e => handleDdlTableSelect(e.target.value)}>
                  <option value="">-- select from Table Profiling or fill manually --</option>
                  {ddlTableOpts.map(d => (
                    <option key={d.source_table_ddl_id}
                      value={`${d.source_database_name}|||${d.source_table_name}`}>
                      {d.source_database_name} / {d.source_table_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {renderField("Platform", "source_platform_name", false, false, true)}
              {renderField("System", "source_system_name", false, false, true)}
              {renderField("Database", "source_database_name", true, false, true)}
              {renderField("Table", "source_table_name", true, false, true)}
            </div>

            {/* Field name - dropdown from DDL if available, else free text */}
            <div style={{ marginBottom:12 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600,
                color: errors.source_field_name ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
                Field name <span style={{ color:'var(--red)' }}>*</span>
              </label>
              {ddlCols.length > 0 ? (
                <select value={values.source_field_name ?? ''}
                  style={{ width:'100%', padding:'7px 10px', fontSize:12,
                    background:'var(--bg3)', borderRadius:'var(--radius)',
                    color:'var(--text)', fontFamily:'var(--mono)', cursor:'pointer', outline:'none',
                    border:`1px solid ${errors.source_field_name ? 'var(--red)' : 'var(--border)'}` }}
                  onChange={e => set('source_field_name', e.target.value || null)}>
                  <option value="">-- select field from DDL --</option>
                  {ddlCols.map(c => (
                    <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                  ))}
                </select>
              ) : (
                <input type="text" value={values.source_field_name ?? ''}
                  onChange={e => set('source_field_name', e.target.value)}
                  style={{ width:'100%', padding:'7px 10px', fontSize:12,
                    background:'var(--bg3)', borderRadius:'var(--radius)',
                    color:'var(--text)', fontFamily:'var(--mono)', outline:'none',
                    border:`1px solid ${errors.source_field_name ? 'var(--red)' : 'var(--border)'}` }}/>
              )}
              {errors.source_field_name && (
                <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{errors.source_field_name}</div>
              )}
            </div>

            {/* Table-level profiling hint -- shown in add mode before a field is chosen */}
            {!values.source_field_name && tableProfiledCount > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px',
                background:`${physAccent}10`, border:`1px solid ${physAccent}40`,
                borderRadius:'var(--radius)', marginBottom:4, fontSize:11,
                color:physAccent, fontFamily:'var(--mono)', fontWeight:600 }}>
                <span style={{ width:12, height:12, flexShrink:0 }}><Icon.Chart/></span>
                {tableProfiledCount} field{tableProfiledCount !== 1 ? 's' : ''} profiled in this table
              </div>
            )}

            {/* Profiling + type info panel -- shown once a field is selected */}
            {values.source_field_name && (
              <div style={{ display:'flex', gap:10, padding:'8px 12px',
                background:'var(--bg3)', border:'1px solid var(--border)',
                borderRadius:'var(--radius)', marginBottom:4 }}>
                {physicalType && (
                  <>
                    <div>
                      <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2 }}>Physical type</div>
                      <div style={{ fontSize:12, fontFamily:'var(--mono)', fontWeight:600,
                        color:physAccent }}>{physicalType}</div>
                    </div>
                    <div style={{ width:1, background:'var(--border)' }}/>
                  </>
                )}
                {fieldProfile ? (
                  <>
                    {fieldProfile.semantic_type && (
                      <>
                        <div>
                          <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2 }}>Semantic type</div>
                          <div style={{ fontSize:12, fontFamily:'var(--mono)', fontWeight:600,
                            color:physAccent }}>{fieldProfile.semantic_type}</div>
                        </div>
                        <div style={{ width:1, background:'var(--border)' }}/>
                      </>
                    )}
                    <div>
                      <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2 }}>Profiling</div>
                      <div style={{ fontSize:11, fontFamily:'var(--mono)', fontWeight:600,
                        color:'var(--green)' }}>Available ({fieldProfile.profiled_at})</div>
                    </div>
                  </>
                ) : (
                  <div>
                    <div style={{ fontSize:9, color:'var(--text3)', marginBottom:2 }}>Profiling</div>
                    <div style={{ fontSize:11, fontFamily:'var(--mono)',
                      color:'var(--amber)' }}>Not yet profiled</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Criticality */}
          {critGroups.length > 0 && (
            <div style={{ marginBottom:6, paddingBottom:10, borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
                textTransform:'uppercase', color:'var(--text3)', marginBottom:10 }}>
                Criticality
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {critGroups.map(g => {
                  const entry = critLevels[g.criticality_group_id] || {};
                  return (
                    <div key={g.criticality_group_id} style={{ marginBottom:0 }}>
                      <label style={{ display:'block', fontSize:11, fontWeight:600,
                        color:'var(--text2)', marginBottom:4 }}>
                        {g.criticality_group_description}
                      </label>
                      <select value={entry.levelId ?? ''} style={{ width:'100%', padding:'7px 10px', fontSize:13,
                        background:'var(--bg3)', border:'1px solid var(--border)',
                        borderRadius:'var(--radius)', color:'var(--text)',
                        fontFamily:'var(--sans)', outline:'none', cursor:'pointer' }}
                        onChange={e => {
                          const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                          setCritLevels(prev => ({ ...prev, [g.criticality_group_id]: { ...prev[g.criticality_group_id], levelId: v } }));
                        }}>
                        <option value="">-- select level --</option>
                        {critLevelOpts.map(l => (
                          <option key={l.criticality_level_id} value={l.criticality_level_id}>
                            {l.criticality_description}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Snapshot filter */}
          <div style={{ marginBottom:6, paddingBottom:10,
            borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:'var(--text3)', marginBottom:10 }}>
              Filter
            </div>
            {renderField("Snapshot filter", "source_snapshot_filter", true, true, true)}
          </div>

          {/* Description fields */}
          <div>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:'var(--text3)', marginBottom:10 }}>
              Description
            </div>
            {renderField("Definition", "data_element_definition", false, true, false)}
            {renderField("Explanation", "data_element_explanation", false, true, false)}
          </div>

        </div>
      </div>
    </>
  );
}

// ===============================================================================
// CRITICAL DATA ELEMENT VIEW -- grouped agency -> data set -> table, collapsible
// ===============================================================================
