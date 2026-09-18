// ===============================================================================
// TASK LIST EXPORT TAB
// Generates a scoped CSV of rule allocations for Trello card creation.
// Each row = one active allocation. Task Type: TEST (sql_code present) or IMPLEMENT.
// ===============================================================================

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
  { key: 'sql_code',            label: 'SQL Code'            },
  { key: 'sql_sample',          label: 'SQL Sample'          },
  { key: 'sql_snapshot_filter', label: 'SQL Snapshot Filter' },
];

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

  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [selectedRow,  setSelectedRow]  = useState(null);
  const [exporting,    setExporting]    = useState(false);

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

  const handleRowClick = row => {
    setSelectedRow(prev => prev === row ? null : row);
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

  const selCount = selectedKeys.size;

  return (
    <div>
      {/* Summary + export button */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"><span className="dot"/>Task List</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
          {rows.length + ' allocation' + (rows.length === 1 ? '' : 's') + ' in scope. Select rows to include in the export.'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handleExport}
            disabled={exporting || selCount === 0}>
            <Icon.Download/>
            {exporting ? 'Preparing...' : 'Export ' + selCount + ' selected row' + (selCount === 1 ? '' : 's')}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>
            {selCount + ' / ' + rows.length + ' selected'}
          </span>
        </div>
      </div>

      {/* Preview table */}
      <div style={{
        overflowX: 'auto', overflowY: 'auto',
        maxHeight: 'calc(100vh - 340px)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
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
              {TASK_LIST_COLS.map(col => (
                <th key={col.key} style={{
                  padding: '7px 10px', textAlign: 'left',
                  fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
                  whiteSpace: 'nowrap', color: 'var(--text)',
                  position: 'sticky', top: 0, zIndex: 2,
                  background: 'var(--bg2)', boxShadow: '0 1px 0 var(--border)',
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isChecked = selectedKeys.has(i);
              const isRowSel  = selectedRow === row;
              const isTest    = row.task_type === 'TEST';
              return (
                <tr key={i} onClick={() => handleRowClick(row)}
                  style={{ cursor: 'pointer' }}>
                  <td style={{
                    padding: '5px 0 5px 7px', textAlign: 'center',
                    borderBottom: '1px solid var(--border)', width: 36,
                    borderLeft: isRowSel ? '3px solid var(--accent)' : '3px solid transparent',
                  }}>
                    <input type="checkbox" checked={isChecked}
                      onClick={e => e.stopPropagation()}
                      onChange={() => handleRowCheck(i)}/>
                  </td>
                  {TASK_LIST_COLS.map(col => {
                    const val     = row[col.key];
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
                          fontWeight:  isTypeCol ? 700        : undefined,
                          fontFamily:  isTypeCol ? 'var(--mono)' : undefined,
                          fontSize:    isTypeCol ? 10         : undefined,
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
