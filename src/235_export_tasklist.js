// ===============================================================================
// TASK LIST EXPORT TAB
// Generates a scoped CSV of rule allocations for Trello card creation.
// Each row = one active allocation. Task Type: TEST (sql_code present) or IMPLEMENT.
// ===============================================================================

// All 13 columns -- used for CSV export and the row detail panel.
const TASK_LIST_COLS = [
  { key: 'task_type',           label: 'Task Type'           },
  { key: 'agency_acronym',      label: 'Agency Acronym'      },
  { key: 'cds_name',            label: 'CDS Name'            },
  { key: 'cde_table',           label: 'CDE Table'           },
  { key: 'cde_database',        label: 'CDE Database'        },
  { key: 'cde_field',           label: 'CDE Field'           },
  { key: 'quality_dimension',   label: 'Quality Dimension'   },
  { key: 'rule_name',           label: 'Rule Name'           },
  { key: 'rule_explanation',    label: 'Rule Explanation'    },
  { key: 'steward_name',        label: 'Steward Name'        },
  { key: 'sql_code',            label: 'Failures Counter    '},
  { key: 'sql_sample',          label: 'Denominator Counter '},
  { key: 'sql_snapshot_filter', label: 'CDE Snapshot Filter '},
];

// Grid columns -- Agency and CDS are group headers, not grid columns.
const GRID_COLS = TASK_LIST_COLS.filter(
  c => c.key !== 'agency_acronym' && c.key !== 'cds_name'
);

const TASK_LIST_SQL_KEYS = new Set(['sql_code', 'sql_sample', 'sql_snapshot_filter']);

// ---------------------------------------------------------------------------
// buildTaskListRows -- pure function, returns array of flat row objects
// ---------------------------------------------------------------------------
function buildTaskListRows(data, isMaster, stewardIdentity) {
  if (!data) return [];

  const toMap = (arr, pk) => {
    const m = {};
    for (const r of (arr || [])) m[r[pk]] = r;
    return m;
  };

  const cdeMap    = toMap(data.critical_data_element,  'critical_data_element_id');
  const cdsMap    = toMap(data.critical_data_set,       'critical_data_set_id');
  const dirMap    = toMap(data.directorate,             'directorate_id');
  const agencyMap = toMap(data.executive_agency,        'executive_agency_id');
  const ruleMap   = toMap(data.data_quality_rule,       'data_quality_rule_id');
  const dimMap    = toMap(data.quality_dimension,       'quality_dimension_id');
  const stewMap   = toMap(data.data_steward,            'data_steward_id');

  // CDS id -> [steward name, ...] (active stewardship only)
  const cdsToStewards = {};
  for (const s of (data.stewardship || [])) {
    if (s.retiring_timestamp) continue;
    const stew = stewMap[s.data_steward_id];
    if (!stew) continue;
    const nm = stew.data_steward_name || '';
    if (!cdsToStewards[s.critical_data_set_id]) cdsToStewards[s.critical_data_set_id] = [];
    cdsToStewards[s.critical_data_set_id].push(nm);
  }

  // Scope: null = no filter (master); Set = only these CDS ids (steward)
  let scopeCdsIds;
  if (isMaster) {
    scopeCdsIds = null;
  } else {
    const ids = getMyStewardCdsIds(data, stewardIdentity);
    scopeCdsIds = ids || new Set();
  }

  const rows = [];
  for (const alloc of (data.data_quality_rule_allocation || [])) {
    if (alloc.retiring_timestamp) continue;

    const cde = cdeMap[alloc.critical_data_element_id];
    if (!cde || cde.retiring_timestamp) continue;

    if (scopeCdsIds !== null && !scopeCdsIds.has(cde.critical_data_set_id)) continue;

    const rule = ruleMap[alloc.data_quality_rule_id];
    if (!rule || rule.retiring_timestamp) continue;

    const cds    = cdsMap[cde.critical_data_set_id]    || {};
    const dir    = dirMap[cds.directorate_id]          || {};
    const agency = agencyMap[dir.executive_agency_id]  || {};
    const dim    = dimMap[alloc.quality_dimension_id]  || {};

    const isTest = !!(rule.sql_code && rule.sql_code.trim());

    rows.push({
      task_type:           isTest ? 'TEST' : 'IMPLEMENT',
      agency_acronym:      agency.agency_acronymn        || '',
      cds_name:            cds.data_set_name             || '',
      cde_table:           cde.source_table_name         || '',
      cde_database:        cde.source_database_name      || '',
      cde_field:           cde.source_field_name         || '',
      quality_dimension:   dim.dimension_name            || '',
      rule_name:           rule.rule_name                || '',
      rule_explanation:    rule.rule_explanation         || '',
      steward_name:        (cdsToStewards[cde.critical_data_set_id] || []).join(' - '),
      sql_code:            isTest ? (composeSql(rule.sql_code, cde, 'rule')               || '') : '',
      sql_sample:          isTest && rule.sql_code_sample
                             ? (composeSql(rule.sql_code_sample, cde, 'sample')           || '') : '',
      sql_snapshot_filter: isTest ? (substituteCdeTokens(cde.source_snapshot_filter, cde) || '') : '',
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// buildTaskListCSV -- converts selected row objects to RFC 4180 CSV string
// ---------------------------------------------------------------------------
function buildTaskListCSV(rows) {
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header   = TASK_LIST_COLS.map(c => c.label).join(',');
  const dataRows = rows.map(row => TASK_LIST_COLS.map(c => escape(row[c.key])).join(','));
  return [header, ...dataRows].join('\n');
}

// ---------------------------------------------------------------------------
// groupRows -- groups flat row array by agency then CDS, sorts within groups
// ---------------------------------------------------------------------------
function groupRows(rows, sortCol, sortDir) {
  const agencyMap = new Map();
  rows.forEach((r, i) => {
    const ag = r.agency_acronym || '(no agency)';
    const cd = r.cds_name       || '(no CDS)';
    if (!agencyMap.has(ag)) agencyMap.set(ag, new Map());
    const cdsMap = agencyMap.get(ag);
    if (!cdsMap.has(cd)) cdsMap.set(cd, []);
    cdsMap.get(cd).push({ r, i });
  });

  return [...agencyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([agency, cdsMap]) => {
      const cdsList = [...cdsMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([cds, items]) => {
          const sorted = sortCol
            ? [...items].sort((a, b) => {
                const av = a.r[sortCol] ?? '';
                const bv = b.r[sortCol] ?? '';
                const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
                return sortDir === 'asc' ? cmp : -cmp;
              })
            : items;
          return { cds, items: sorted };
        });
      return { agency, cdsList };
    });
}

// ---------------------------------------------------------------------------
// GroupCheckbox -- checkbox with self-managed indeterminate state
// ---------------------------------------------------------------------------
function GroupCheckbox({ indices, selectedKeys, onToggle }) {
  const ref  = useRef(null);
  const all  = indices.length > 0 && indices.every(i => selectedKeys.has(i));
  const some = indices.some(i => selectedKeys.has(i));
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some && !all;
  }, [some, all]);
  return (
    <input type="checkbox" ref={ref} checked={all}
      onChange={() => onToggle(indices, !all)}/>
  );
}

// ---------------------------------------------------------------------------
// TaskListRowPanel -- slide-in detail panel, rendered via portal
// ---------------------------------------------------------------------------
function TaskListRowPanel({ row, onClose }) {
  const isTest = row.task_type === 'TEST';
  return (
    <>
      <style>{'@keyframes slideInRight{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}'}</style>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'var(--overlay-sm)',
      }}/>
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(480px, 48vw)',
        background: 'var(--bg2)',
        borderLeft: '1px solid var(--border2)',
        zIndex: 400,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px var(--overlay-md)',
        animation: 'slideInRight 0.18s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 3,
            }}>
              {'TASK LIST'}
            </div>
            <div style={{
              fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text)',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              {row.rule_name || '(no rule name)'}
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'var(--sans)',
                padding: '1px 6px', borderRadius: 3,
                background: isTest ? 'var(--accent-tint)' : 'var(--amber-bg)',
                color:      isTest ? 'var(--accent)'      : 'var(--amber)',
                border:     isTest ? '1px solid var(--accent-border)' : '1px solid var(--amber)',
              }}>
                {row.task_type}
              </span>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ flexShrink: 0 }}>
            <Icon.X/>
          </button>
        </div>
        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
          {TASK_LIST_COLS.map(col => {
            const val     = row[col.key];
            const isEmpty = val === null || val === undefined || val === '';
            const isSql   = TASK_LIST_SQL_KEYS.has(col.key);
            return (
              <div key={col.key} style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600,
                  color: 'var(--text2)', marginBottom: 4,
                }}>
                  {col.label}
                </div>
                <div style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '7px 10px',
                  fontSize: isSql ? 11 : 12,
                  fontFamily: isSql ? 'var(--mono)' : 'inherit',
                  color: isEmpty ? 'var(--text2)' : 'var(--text)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  minHeight: 32,
                }}>
                  {isEmpty
                    ? <span style={{ fontStyle: 'italic', fontSize: 11 }}>{'null'}</span>
                    : String(val)
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// TaskListExportTab -- main tab component
// ---------------------------------------------------------------------------
function TaskListExportTab() {
  const { data, isMaster, stewardIdentity } = useApp();

  const rows = useMemo(
    () => buildTaskListRows(data, isMaster, stewardIdentity),
    [data, isMaster, stewardIdentity]
  );

  const [sortCol,           setSortCol]           = useState(null);
  const [sortDir,           setSortDir]           = useState('asc');
  const [collapsedAgencies, setCollapsedAgencies] = useState(() => new Set());
  const [collapsedCds,      setCollapsedCds]      = useState(() => new Set());
  const [selectedKeys,      setSelectedKeys]      = useState(() => new Set());
  const [selectedRow,       setSelectedRow]       = useState(null);
  const [exporting,         setExporting]         = useState(false);

  const headerCheckRef = useRef(null);

  // Pre-select all rows whenever the row set changes
  useEffect(() => {
    const all = new Set();
    rows.forEach((_, i) => all.add(i));
    setSelectedKeys(all);
    setSelectedRow(null);
  }, [rows]);

  const allSel  = rows.length > 0 && rows.every((_, i) => selectedKeys.has(i));
  const someSel = rows.some((_, i) => selectedKeys.has(i));

  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = someSel && !allSel;
    }
  }, [someSel, allSel]);

  const grouped = useMemo(
    () => groupRows(rows, sortCol, sortDir),
    [rows, sortCol, sortDir]
  );

  const handleSort = key => {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  };

  const handleHeaderCheck = () => {
    if (allSel) {
      setSelectedKeys(new Set());
    } else {
      const all = new Set();
      rows.forEach((_, i) => all.add(i));
      setSelectedKeys(all);
    }
  };

  const handleRowCheck = i => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleGroupToggle = (indices, value) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      indices.forEach(i => value ? next.add(i) : next.delete(i));
      return next;
    });
  };

  const handleRowClick = row => {
    setSelectedRow(prev => prev === row ? null : row);
  };

  const toggleAgency = agency => {
    setCollapsedAgencies(prev => {
      const next = new Set(prev);
      if (next.has(agency)) next.delete(agency); else next.add(agency);
      return next;
    });
  };

  const toggleCds = key => {
    setCollapsedCds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleCollapseAll = () => {
    setCollapsedAgencies(new Set(grouped.map(g => g.agency)));
  };

  const handleExpandAll = () => {
    setCollapsedAgencies(new Set());
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const selected = rows.filter((_, i) => selectedKeys.has(i));
      const csv      = buildTaskListCSV(selected);
      const blob     = new Blob([csv], { type: 'text/csv' });
      const ts       = new Date().toISOString().replace(/[:\-T.Z]/g, '').slice(0, 14);
      const namePart = isMaster
        ? 'master'
        : (stewardIdentity && stewardIdentity.name
            ? stewardIdentity.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
            : 'unknown');
      await saveWithPicker(blob, 'dq_task_list_' + namePart + '_' + ts + '.csv', 'CSV File', '.csv');
    } finally {
      setExporting(false);
    }
  };

  // No identity
  if (!isMaster && !stewardIdentity) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 12, color: 'var(--text3)', padding: '8px 12px',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          Set your steward identity in Settings to enable Task List export.
        </div>
      </div>
    );
  }

  // No rows in scope
  if (rows.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{
          fontSize: 12, color: 'var(--text3)', padding: '8px 12px',
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          No allocations found in your data.
        </div>
      </div>
    );
  }

  const selCount  = selectedKeys.size;
  const upArrow   = String.fromCharCode(8593);
  const downArrow = String.fromCharCode(8595);
  const rightTri  = String.fromCharCode(9654);
  const downTri   = String.fromCharCode(9660);

  return (
    <div>
      {/* Summary + export button */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><span className="dot"/>Task List</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleExport}
            disabled={exporting || selCount === 0}>
            <Icon.Download/>
            {exporting ? 'Preparing...' : 'Export ' + selCount + ' selected row' + (selCount === 1 ? '' : 's')}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            {selCount + ' of ' + rows.length + ' allocation' + (rows.length === 1 ? '' : 's') + ' selected'}
          </span>
        </div>
      </div>

      {/* Group controls */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
        <button className="btn btn-ghost" onClick={handleExpandAll}
          style={{ fontSize: 11, padding: '3px 10px' }}>
          Expand All
        </button>
        <button className="btn btn-ghost" onClick={handleCollapseAll}
          style={{ fontSize: 11, padding: '3px 10px' }}>
          Collapse All
        </button>
      </div>

      {/* Preview table */}
      <div style={{
        overflowX: 'auto', overflowY: 'auto',
        maxHeight: 'calc(100vh - 450px)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{
                width: 36, padding: '7px 0 7px 10px', textAlign: 'center',
                position: 'sticky', top: 0, zIndex: 2,
                background: 'var(--bg2)', boxShadow: '0 1px 0 var(--border)',
              }}>
                <input type="checkbox" ref={headerCheckRef}
                  checked={allSel} onChange={handleHeaderCheck}/>
              </th>
              {GRID_COLS.map(col => {
                const isSorted = sortCol === col.key;
                return (
                  <th key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      padding: '7px 10px', textAlign: 'left',
                      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
                      whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                      color: isSorted ? 'var(--accent)' : 'var(--text)',
                      position: 'sticky', top: 0, zIndex: 2,
                      background: 'var(--bg2)', boxShadow: '0 1px 0 var(--border)',
                    }}>
                    {col.label}
                    {isSorted && (
                      <span style={{ marginLeft: 4, fontSize: 11 }}>
                        {sortDir === 'asc' ? upArrow : downArrow}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ agency, cdsList }) => {
              const agencyCollapsed = collapsedAgencies.has(agency);
              const agencyIndices   = cdsList.flatMap(({ items }) => items.map(({ i }) => i));
              const cdsKey = cds => agency + '|' + cds;

              return (
                <React.Fragment key={agency}>
                  {/* Agency header row */}
                  <tr style={{ background: 'var(--bg3)' }}>
                    <td style={{
                      padding: '6px 0 6px 7px', textAlign: 'center',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <GroupCheckbox
                        indices={agencyIndices}
                        selectedKeys={selectedKeys}
                        onToggle={handleGroupToggle}
                      />
                    </td>
                    <td colSpan={GRID_COLS.length} style={{
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => toggleAgency(agency)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text3)', fontSize: 10, padding: '0 2px',
                            fontFamily: 'var(--mono)', lineHeight: 1,
                          }}>
                          {agencyCollapsed ? rightTri : downTri}
                        </button>
                        <span style={{
                          fontWeight: 700, fontSize: 12,
                          color: 'var(--accent)', fontFamily: 'var(--mono)',
                        }}>
                          {agency}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {agencyIndices.length + ' row' + (agencyIndices.length === 1 ? '' : 's')}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {!agencyCollapsed && cdsList.map(({ cds, items }) => {
                    const ck         = cdsKey(cds);
                    const cdsCollapsed = collapsedCds.has(ck);
                    const cdsIndices  = items.map(({ i }) => i);

                    return (
                      <React.Fragment key={ck}>
                        {/* CDS header row */}
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <td style={{
                            padding: '5px 0 5px 7px', textAlign: 'center',
                            borderBottom: '1px solid var(--border)',
                          }}>
                            <GroupCheckbox
                              indices={cdsIndices}
                              selectedKeys={selectedKeys}
                              onToggle={handleGroupToggle}
                            />
                          </td>
                          <td colSpan={GRID_COLS.length} style={{
                            padding: '5px 10px 5px 28px',
                            borderBottom: '1px solid var(--border)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button
                                onClick={() => toggleCds(ck)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: 'var(--text3)', fontSize: 10, padding: '0 2px',
                                  fontFamily: 'var(--mono)', lineHeight: 1,
                                }}>
                                {cdsCollapsed ? rightTri : downTri}
                              </button>
                              <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600 }}>
                                {cds}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                                {cdsIndices.length + ' row' + (cdsIndices.length === 1 ? '' : 's')}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Data rows */}
                        {!cdsCollapsed && items.map(({ r, i }) => {
                          const isChecked = selectedKeys.has(i);
                          const isRowSel  = selectedRow === r;
                          const isTest    = r.task_type === 'TEST';
                          return (
                            <tr key={i} onClick={() => handleRowClick(r)}
                              style={{ cursor: 'pointer' }}>
                              <td style={{
                                padding: '5px 0 5px 7px', textAlign: 'center',
                                borderBottom: '1px solid var(--border)', width: 36,
                                borderLeft: isRowSel
                                  ? '3px solid var(--accent)' : '3px solid transparent',
                              }}>
                                <input type="checkbox" checked={isChecked}
                                  onClick={e => e.stopPropagation()}
                                  onChange={() => handleRowCheck(i)}/>
                              </td>
                              {GRID_COLS.map(col => {
                                const val     = r[col.key];
                                const isEmpty = val === null || val === undefined || val === '';
                                const isTypeCol = col.key === 'task_type';
                                return (
                                  <td key={col.key}
                                    title={isEmpty ? '' : String(val)}
                                    style={{
                                      padding: '5px 10px',
                                      borderBottom: '1px solid var(--border)',
                                      maxWidth: 200, overflow: 'hidden',
                                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      fontWeight:  isTypeCol ? 700           : undefined,
                                      fontFamily:  isTypeCol ? 'var(--mono)' : undefined,
                                      fontSize:    isTypeCol ? 10            : undefined,
                                      color: isTypeCol
                                        ? (isTest ? 'var(--accent)' : 'var(--amber)')
                                        : (isEmpty ? 'var(--text2)' : 'var(--text)'),
                                    }}>
                                    {isEmpty
                                      ? <span style={{ fontStyle: 'italic', fontSize: 11 }}>{'null'}</span>
                                      : String(val)
                                    }
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Row detail panel -- portal to escape overflow ancestors */}
      {selectedRow && ReactDOM.createPortal(
        <TaskListRowPanel row={selectedRow} onClose={() => setSelectedRow(null)}/>,
        document.body
      )}
    </div>
  );
}
