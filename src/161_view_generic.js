function getDisplayFields(tableName) {
  const overrides = {
    executive_agency:             ['agency_acronymn', 'agency_name'],
    executive_agency_type:        ['executive_agency_type_description'],
    directorate:                  ['directorate_name', 'directorate_acronymn'],
    critical_data_set:            ['data_set_name', 'directorate_id'],
    critical_data_element:        ['source_field_name', 'source_table_name', 'critical_data_set_id'],
    data_quality_rule:            ['rule_name', 'automated'],
    data_quality_rule_allocation: ['critical_data_element_id', 'data_quality_rule_id', 'quality_dimension_id'],
    cde_criticality:              ['critical_data_element_id', 'criticality_group_id', 'criticality_level_id'],
    stewardship:                  ['critical_data_set_id', 'data_steward_id'],
    data_patron:                  ['data_patron_name', 'executive_agency_id', 'data_patron_title'],
    data_owner:                   ['data_owner_name', 'data_owner_title'],
    data_steward:                 ['data_steward_name', 'steward_role_type_id', 'assignment_start_date'],
    quality_dimension:            ['dimension_name', 'dimension_acronymn'],
    criticality_group:            ['criticality_group_description', 'criticality_group_acronymn'],
    criticality_level:            ['criticality_description', 'criticality_score', 'overall_criticality_score'],
    criticality_group_weight:     ['executive_agency_id', 'criticality_group_id', 'weight_value'],
    quality_dimension_weight:     ['executive_agency_id', 'quality_dimension_id', 'weight_value'],
    steward_role_type:            ['role_description'],
  };
  return overrides[tableName] || SCHEMA[tableName].cols.slice(1, 3).map(c => c.name);
}

function resolveDisplayValue(tableName, fieldName, value, data) {
  if (value === null || value === undefined) return '--';
  const schema = SCHEMA[tableName];
  const col = schema.cols.find(c => c.name === fieldName);
  if (col?.fk && data) {
    const refRows = data[col.fk.table] || [];
    const refRow  = refRows.find(r => r[col.fk.field] === value);
    return refRow ? (refRow[col.fk.display] ?? String(value)) : `[${value}]`;
  }
  if (col?.type === 'bool') return value ? 'Yes' : 'No';
  return String(value);
}

function GenericTableView({ tableName }) {
  const { data, lookups, restoreRecord, upsertRecord, nextPk, openForm, canEdit, openRetireConfirm } = useApp();
  const dp = !canEdit ? { style:{ opacity:0.35, cursor:'not-allowed', pointerEvents:'none' }, title:'Set your steward identity in Settings to make changes' } : {};

  const [search,      setSearch]      = useState('');
  const [showRetired, setShowRetired] = useState(false);

  const schema      = SCHEMA[tableName];
  const rows        = data?.[tableName] || [];
  const displayCols = getDisplayFields(tableName);
  const group       = TABLE_GROUPS.find(g => g.tables.includes(tableName));
  const accent      = group?.accent || 'var(--accent)';

  const openAdd  = () => openForm(tableName, buildBlankRecord(tableName, nextPk, data));
  const openEdit = (row) => openForm(tableName, { ...row });

  // Tables that should be sorted alphabetically, and which field to sort by
  const SORT_FIELD = {
    data_quality_rule:   'rule_name',
    criticality_level:   'criticality_description',
    criticality_group:   'criticality_group_description',
    quality_dimension:   'dimension_name',
    steward_role_type:   'role_description',
    data_steward:        'data_steward_name',
    data_owner:          'data_owner_name',
    data_patron:         'data_patron_name',
  };

  // Tables needing compound / resolved sorts
  const stewardshipMaps = useMemo(() => {
    if (tableName !== 'stewardship') return null;
    const cdsById    = Object.fromEntries((data?.critical_data_set || []).map(d => [d.critical_data_set_id, d]));
    const dirById    = Object.fromEntries((data?.directorate || []).map(d => [d.directorate_id, d]));
    const agencyById = Object.fromEntries((data?.executive_agency || []).map(a => [a.executive_agency_id, a]));
    return { cdsById, dirById, agencyById };
  }, [data, tableName]);

  const agencyById = useMemo(() => ({}), []);

  const SORT_FN = tableName === 'stewardship' && stewardshipMaps ? {
    stewardship: (a, b) => {
      const { cdsById, dirById, agencyById: abid } = stewardshipMaps;
      const cdsA = cdsById[a.critical_data_set_id];
      const cdsB = cdsById[b.critical_data_set_id];
      const dirA = dirById[cdsA?.directorate_id];
      const dirB = dirById[cdsB?.directorate_id];
      const agyA = abid[dirA?.executive_agency_id]?.agency_acronymn || '';
      const agyB = abid[dirB?.executive_agency_id]?.agency_acronymn || '';
      const agyCmp = agyA.localeCompare(agyB);
      if (agyCmp !== 0) return agyCmp;
      const dirCmp = (dirA?.directorate_name || '').localeCompare(dirB?.directorate_name || '');
      if (dirCmp !== 0) return dirCmp;
      return (cdsA?.data_set_name || '').localeCompare(cdsB?.data_set_name || '');
    }
  } : {};

  const filtered = useMemo(() => {
    let r = showRetired ? rows : rows.filter(row => !row.retiring_timestamp);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(row =>
        displayCols.some(f => {
          const v = resolveDisplayValue(tableName, f, row[f], data);
          return v.toLowerCase().includes(q);
        }) ||
        String(row[schema.pk]).includes(q)
      );
    }
    if (SORT_FN[tableName]) {
      r = [...r].sort(SORT_FN[tableName]);
    } else if (SORT_FIELD[tableName]) {
      const sf = SORT_FIELD[tableName];
      r = [...r].sort((a, b) => (a[sf] || '').localeCompare(b[sf] || ''));
    }
    return r;
  }, [rows, search, showRetired, displayCols, agencyById]);

  const liveCount    = rows.filter(r => !r.retiring_timestamp).length;
  const retiredCount = rows.filter(r =>  r.retiring_timestamp).length;

  const primaryField    = displayCols[0];
  const secondaryFields = displayCols.slice(1);

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            {schema.label}
            {schema.readOnly &&
              <span className="badge badge-gray" style={{ fontSize:9, verticalAlign:'middle' }}>ref</span>
            }
          </div>
          <div className="page-sub">
            {liveCount} live record{liveCount !== 1 ? 's' : ''}
            {retiredCount > 0 && ` - ${retiredCount} retired`}
          </div>
        </div>
        {!schema.readOnly && canEdit && (
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
            placeholder={`Search ${schema.label.toLowerCase()}...`}
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>

        {retiredCount > 0 && (
          <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', whiteSpace:'nowrap', fontSize:12, color:'var(--text3)' }}>
            <div className="toggle" style={{ width:30, height:16 }}>
              <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)}/>
              <div className="toggle-track"/>
              <div className="toggle-thumb" style={{ width:10, height:10, top:3, left:3 }}/>
            </div>
            Show retired
          </label>
        )}
      </div>

      {/* Count line */}
      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10, fontFamily:'var(--mono)' }}>
        Showing {filtered.length} of {liveCount}{showRetired && retiredCount > 0 ? ` + ${retiredCount} retired` : ''} records
        {search && ` matching "${search}"`}
      </div>

      {/* Records */}
      {filtered.length === 0 ? (
        <div className="status-row status-info">No records match the current filter.</div>
      ) : (
        <div>
          {filtered.map(row => {
            const pk        = row[schema.pk];
            const isRetired = !!row.retiring_timestamp;

            // -- stewardship: three-line layout --------------
            if (tableName === 'stewardship') {
              const maps     = stewardshipMaps || {};
              const cds      = maps.cdsById?.[row.critical_data_set_id];
              const dir      = maps.dirById?.[cds?.directorate_id];
              const agency   = maps.agencyById?.[dir?.executive_agency_id];
              const steward  = (data?.data_steward || []).find(s => s.data_steward_id === row.data_steward_id);
              const role     = (data?.steward_role_type || []).find(r => r.steward_role_type_id === steward?.steward_role_type_id);
              return (
                <div key={pk}
                  className={`record-row ${isRetired ? 'record-retired' : ''}`}
                  style={{ borderLeftColor: isRetired ? 'var(--border)' : accent }}>
                  <div className="record-row-pk">#{pk}</div>
                  <div className="record-row-main">
                    <div className="record-row-primary">
                      {cds?.data_set_name || `Data Set #${row.critical_data_set_id}`}
                      {cds?.data_set_description &&
                        <span style={{ fontWeight:400, color:'var(--text3)', marginLeft:8, fontSize:12 }}>
                          {cds.data_set_description}
                        </span>
                      }
                    </div>
                    <div className="record-row-secondary">
                      {steward?.data_steward_name &&
                        <span style={{ color:'var(--text2)' }}>{steward.data_steward_name}</span>
                      }
                      {role?.role_description &&
                        <span style={{ color:'var(--text3)', marginLeft:4 }}>({role.role_description})</span>
                      }
                      {steward?.data_steward_name && (agency?.agency_acronymn || dir?.directorate_name) &&
                        <span style={{ margin:'0 5px', opacity:0.4 }}>-</span>
                      }
                      {agency?.agency_acronymn &&
                        <span style={{ color:'var(--text2)', fontWeight:500 }}>{agency.agency_acronymn}</span>
                      }
                      {agency?.agency_acronymn && dir?.directorate_name &&
                        <span style={{ margin:'0 5px', opacity:0.4 }}>-</span>
                      }
                      {dir?.directorate_name &&
                        <span>{dir.directorate_name}</span>
                      }
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    {!isRetired && !schema.readOnly && canEdit && (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openEdit(row)} title="Edit record">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                    {canEdit && (isRetired ? (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => restoreRecord(tableName, pk)}>
                        <Icon.Eye/> Restore
                      </button>
                    ) : (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openRetireConfirm(tableName, pk)} title="Retire">
                        <Icon.EyeOff/>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            // -- data_steward: two-row layout ----------------
            if (tableName === 'data_steward') {
              const role = (data?.steward_role_type || []).find(r => r.steward_role_type_id === row.steward_role_type_id);
              const startDate = row.assignment_start_date
                ? new Date(row.assignment_start_date).toLocaleDateString('en-GB', { year:'numeric', month:'short', day:'numeric' })
                : null;
              const identity   = loadStewardIdentity();
              const isMe       = identity?.id === pk;
              const masterStwd = (data?.stewardship || []).find(s =>
                s.critical_data_set_id === 0 && !s.retiring_timestamp);
              const isMasterRow = masterStwd?.data_steward_id === pk;
              return (
                <div key={pk}
                  className={`record-row ${isRetired ? 'record-retired' : ''}`}
                  style={{ borderLeftColor: isRetired ? 'var(--border)' : accent }}>
                  <div className="record-row-pk">#{pk}</div>
                  <div className="record-row-main">
                    <div className="record-row-primary" style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span>{row.data_steward_name || `Record #${pk}`}</span>
                      {isMasterRow && (
                        <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
                          color:'var(--amber)', background:'rgba(245,166,35,0.12)',
                          border:'1px solid rgba(245,166,35,0.4)',
                          borderRadius:3, padding:'1px 6px' }}>
                          MASTER
                        </span>
                      )}
                      {isMe && (
                        <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
                          color:'#18b4d4', background:'var(--accent-tint)',
                          border:'1px solid var(--accent-border)',
                          borderRadius:3, padding:'1px 6px' }}>
                          YOU
                        </span>
                      )}
                      {role?.role_description &&
                        <span style={{ fontWeight:400, color:'var(--text2)', fontSize:12 }}>
                          {role.role_description}
                        </span>
                      }
                    </div>
                    {startDate && (
                      <div className="record-row-secondary">
                        <span>{startDate}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    {!isRetired && !schema.readOnly && canEdit && (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openEdit(row)} title="Edit record">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                    {canEdit && (isRetired ? (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => restoreRecord(tableName, pk)}>
                        <Icon.Eye/> Restore
                      </button>
                    ) : (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openRetireConfirm(tableName, pk)} title="Retire">
                        <Icon.EyeOff/>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            // -- data_patron: two-row layout -----------------
            if (tableName === 'data_patron') {
              const agency = (data?.executive_agency || []).find(a => a.executive_agency_id === row.executive_agency_id);
              const startDate = row.assignment_start_date
                ? new Date(row.assignment_start_date).toLocaleDateString('en-GB', { year:'numeric', month:'short', day:'numeric' })
                : null;
              return (
                <div key={pk}
                  className={`record-row ${isRetired ? 'record-retired' : ''}`}
                  style={{ borderLeftColor: isRetired ? 'var(--border)' : accent }}>
                  <div className="record-row-pk">#{pk}</div>
                  <div className="record-row-main">
                    <div className="record-row-primary">
                      {row.data_patron_name || `Record #${pk}`}
                      {row.data_patron_title &&
                        <span style={{ fontWeight:400, color:'var(--text2)', marginLeft:8, fontSize:12 }}>
                          {row.data_patron_title}
                        </span>
                      }
                    </div>
                    <div className="record-row-secondary">
                      {agency?.agency_acronymn &&
                        <span style={{ color:'var(--text2)', fontWeight:500 }}>{agency.agency_acronymn}</span>
                      }
                      {agency?.agency_acronymn && startDate &&
                        <span style={{ margin:'0 5px', opacity:0.4 }}>--</span>
                      }
                      {startDate &&
                        <span>{startDate}</span>
                      }
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    {!isRetired && !schema.readOnly && canEdit && (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openEdit(row)} title="Edit record">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                    {canEdit && (isRetired ? (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => restoreRecord(tableName, pk)}>
                        <Icon.Eye/> Restore
                      </button>
                    ) : (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openRetireConfirm(tableName, pk)} title="Retire">
                        <Icon.EyeOff/>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            // -- data_owner: two-row layout ------------------
            if (tableName === 'data_owner') {
              const directorate = (data?.directorate || []).find(d => d.directorate_id === row.directorate_id);
              const agency      = (data?.executive_agency || []).find(a => a.executive_agency_id === directorate?.executive_agency_id);
              return (
                <div key={pk}
                  className={`record-row ${isRetired ? 'record-retired' : ''}`}
                  style={{ borderLeftColor: isRetired ? 'var(--border)' : accent }}>
                  <div className="record-row-pk">#{pk}</div>
                  <div className="record-row-main">
                    <div className="record-row-primary">
                      {row.data_owner_name || `Record #${pk}`}
                      {row.data_owner_title &&
                        <span style={{ fontWeight:400, color:'var(--text2)', marginLeft:8, fontSize:12 }}>
                          {row.data_owner_title}
                        </span>
                      }
                    </div>
                    <div className="record-row-secondary">
                      {agency?.agency_acronymn &&
                        <span style={{ color:'var(--text2)', fontWeight:500 }}>{agency.agency_acronymn}</span>
                      }
                      {agency?.agency_acronymn && directorate?.directorate_name &&
                        <span style={{ margin:'0 5px', opacity:0.4 }}>--</span>
                      }
                      {directorate?.directorate_name &&
                        <span>{directorate.directorate_name}</span>
                      }
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    {!isRetired && !schema.readOnly && canEdit && (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openEdit(row)} title="Edit record">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                    {canEdit && (isRetired ? (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => restoreRecord(tableName, pk)}>
                        <Icon.Eye/> Restore
                      </button>
                    ) : (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openRetireConfirm(tableName, pk)} title="Retire">
                        <Icon.EyeOff/>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            // -- default layout ------------------------------
            const primary     = resolveDisplayValue(tableName, primaryField, row[primaryField], data);
            const secondaries = secondaryFields.map(f => ({
              label: schema.cols.find(c => c.name === f)?.label || f,
              value: resolveDisplayValue(tableName, f, row[f], data),
            }));

            return (
              <div key={pk}
                className={`record-row ${isRetired ? 'record-retired' : ''}`}
                style={{ borderLeftColor: isRetired ? 'var(--border)' : accent }}>

                <div className="record-row-pk">#{pk}</div>

                <div className="record-row-main">
                  <div className="record-row-primary">{primary || `Record #${pk}`}</div>
                  {secondaries.length > 0 && (
                    <div className="record-row-secondary">
                      {secondaries.map((s, i) => (
                        <span key={i}>
                          {i > 0 && <span style={{ margin:'0 6px', opacity:0.4 }}>-</span>}
                          <span style={{ color:'var(--text3)' }}>{s.label}: </span>
                          <span>{s.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                  {!isRetired && !schema.readOnly && canEdit && (
                    <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                      onClick={() => openEdit(row)} title="Edit record">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  )}
                  {isRetired ? (
                    <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                      onClick={() => restoreRecord(tableName, pk)}
                      title="Restore record">
                      <Icon.Eye/> Restore
                    </button>
                  ) : (
                    (
                      <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'3px 8px' }}
                        onClick={() => openRetireConfirm(tableName, pk)}
                        title="Retire record">
                        <Icon.EyeOff/>
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
