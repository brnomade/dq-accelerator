// ===============================================================================
// DATA BROWSER SCREEN -- master-steward raw table inspector
// ===============================================================================
function DataBrowserScreen() {
  const { data, isMaster, restoreRecord } = useApp();
  const [selectedTable, setSelectedTable] = useState(null);
  const [filterText,    setFilterText]    = useState('');
  const [showRetired,   setShowRetired]   = useState(false);
  const [sortCol,       setSortCol]       = useState(null);
  const [sortDir,       setSortDir]       = useState('asc');

  const tables = useMemo(() => Object.keys(SCHEMA).sort(), []);

  const rowCounts = useMemo(() => {
    if (!data) return {};
    const out = {};
    for (const t of tables) {
      const rows = data[t] || [];
      out[t] = {
        active:  rows.filter(r => !r.retiring_timestamp).length,
        retired: rows.filter(r => !!r.retiring_timestamp).length,
      };
    }
    return out;
  }, [data, tables]);

  // dupePkMap: tableName -> Set of PK values that appear more than once
  const dupePkMap = useMemo(() => {
    if (!data) return {};
    const out = {};
    for (const t of tables) {
      const pk   = SCHEMA[t]?.pk;
      if (!pk) continue;
      const rows = data[t] || [];
      const seen = new Set();
      const dupes = new Set();
      for (const row of rows) {
        const v = row[pk];
        if (v === null || v === undefined) continue;
        if (seen.has(v)) dupes.add(v);
        else seen.add(v);
      }
      if (dupes.size > 0) out[t] = dupes;
    }
    return out;
  }, [data, tables]);

  useEffect(() => {
    if (!selectedTable && tables.length) setSelectedTable(tables[0]);
  }, []);

  const schema  = selectedTable ? SCHEMA[selectedTable] : null;
  const pkField = schema ? schema.pk : null;
  const cols    = schema ? (schema.cols || []) : [];

  const displayCols = useMemo(() => {
    if (!schema || !pkField) return cols.map(c => ({ ...c, isPk: false }));
    const pkColDef   = cols.find(c => c.name === pkField);
    const restColDef = cols.filter(c => c.name !== pkField);
    if (!pkColDef) return cols.map(c => ({ ...c, isPk: false }));
    return [{ ...pkColDef, isPk: true }, ...restColDef.map(c => ({ ...c, isPk: false }))];
  }, [schema, pkField, cols]);

  const allRows = useMemo(() => {
    return (selectedTable && data) ? (data[selectedTable] || []) : [];
  }, [selectedTable, data]);

  const displayRows = useMemo(() => {
    let rows = allRows;
    if (!showRetired) rows = rows.filter(r => !r.retiring_timestamp);
    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      rows = rows.filter(r =>
        Object.values(r).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol] ?? '';
        const bv = b[sortCol] ?? '';
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [allRows, showRetired, filterText, sortCol, sortDir]);

  const handleSort = (colName) => {
    if (sortCol === colName) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(colName);
      setSortDir('asc');
    }
  };

  const handleTableSelect = (t) => {
    setSelectedTable(t);
    setFilterText('');
    setSortCol(null);
    setSortDir('asc');
  };

  if (!isMaster) {
    return (
      <div className="fade-in" style={{ display:'flex', alignItems:'center',
        justifyContent:'center', height:'100%' }}>
        <div style={{ color:'var(--text2)', fontSize:14 }}>
          Data Browser is only available to the master steward.
        </div>
      </div>
    );
  }

  const colSpanTotal  = displayCols.length + (showRetired ? 1 : 0);
  const sortArrow     = sortDir === 'asc' ? String.fromCharCode(8593) : String.fromCharCode(8595);
  const selectedDupes = selectedTable ? (dupePkMap[selectedTable] || null) : null;

  return (
    <div className="fade-in" style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* LEFT PANEL -- table list */}
      <div style={{
        width: 224, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        overflowY: 'auto', background: 'var(--bg2)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '10px 14px 8px', fontSize: 10, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          Tables
        </div>
        {tables.map(t => {
          const counts     = rowCounts[t] || { active: 0, retired: 0 };
          const isSelected = t === selectedTable;
          const dupes      = dupePkMap[t];
          const dupeList   = dupes ? [...dupes].sort((a, b) => a - b).join(', ') : null;
          const dupeTitle  = dupeList
            ? (dupes.size + ' duplicate PK' + (dupes.size > 1 ? 's' : '') + ': ' + dupeList)
            : null;
          return (
            <div key={t}
              onClick={() => handleTableSelect(t)}
              style={{
                padding: '7px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                background: isSelected ? 'var(--bg3)' : 'transparent',
                borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
              }}>
              <span style={{
                flex: 1, fontSize: 11, fontFamily: 'var(--mono)',
                color: isSelected ? 'var(--text)' : 'var(--text2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {t}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text2)', flexShrink: 0 }}>
                {counts.active}
                <span style={{ color: counts.retired > 0 ? 'var(--amber)' : 'var(--text2)' }}>
                  {'/' + (counts.active + counts.retired)}
                </span>
              </span>
              {dupeTitle && (
                <span title={dupeTitle} style={{ color: 'var(--red)', flexShrink: 0, lineHeight: 1 }}>
                  <Icon.Warning/>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* RIGHT PANEL */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          background: 'var(--bg2)',
        }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
            color: 'var(--accent)', flexShrink: 0,
          }}>
            {selectedTable || ''}
          </div>
          {selectedDupes && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: 'var(--red)', flexShrink: 0,
            }}>
              <Icon.Warning/>
              {selectedDupes.size + ' duplicate PK' + (selectedDupes.size > 1 ? 's' : '')}
            </div>
          )}
          <input
            type="text"
            placeholder="Filter rows..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            style={{
              flex: 1, padding: '4px 8px', fontSize: 12, minWidth: 0,
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text)', outline: 'none',
            }}
          />
          <label style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 12, color: 'var(--text2)', cursor: 'pointer',
            userSelect: 'none', flexShrink: 0,
          }}>
            <input type="checkbox" checked={showRetired}
              onChange={e => setShowRetired(e.target.checked)}/>
            Show retired
          </label>
          <div style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>
            {displayRows.length}{' '}{displayRows.length === 1 ? 'row' : 'rows'}
          </div>
        </div>

        {/* Grid */}
        {!selectedTable ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text2)', fontSize: 13 }}>
            Select a table to inspect.
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
              <thead>
                <tr>
                  {displayCols.map(col => {
                    const isSorted = sortCol === col.name;
                    const isFk     = !col.isPk && !!col.fk;
                    return (
                      <th key={col.name}
                        onClick={() => handleSort(col.name)}
                        style={{
                          padding: '7px 10px', textAlign: 'left',
                          fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                          color: isSorted ? 'var(--accent)' : 'var(--text)',
                          userSelect: 'none',
                          position: 'sticky', top: 0, zIndex: 2,
                          background: 'var(--bg2)',
                          boxShadow: '0 1px 0 var(--border)',
                        }}>
                        {col.name}
                        {col.isPk && (
                          <span style={{
                            marginLeft: 5, fontSize: 9, fontWeight: 700,
                            padding: '1px 4px', borderRadius: 3, fontFamily: 'var(--sans)',
                            background: 'var(--amber-bg)', color: 'var(--amber)',
                            border: '1px solid var(--amber)',
                          }}>{'PK'}</span>
                        )}
                        {isFk && (
                          <span style={{
                            marginLeft: 5, fontSize: 9, fontWeight: 700,
                            padding: '1px 4px', borderRadius: 3, fontFamily: 'var(--sans)',
                            background: 'rgba(24,180,212,0.12)', color: '#18b4d4',
                            border: '1px solid rgba(24,180,212,0.35)',
                          }}>{'FK'}</span>
                        )}
                        {isSorted && (
                          <span style={{ marginLeft: 4, fontSize: 11 }}>
                            {sortArrow}
                          </span>
                        )}
                      </th>
                    );
                  })}
                  {showRetired && (
                    <th style={{
                      padding: '7px 10px', width: 60,
                      position: 'sticky', top: 0, zIndex: 2,
                      background: 'var(--bg2)',
                      boxShadow: '0 1px 0 var(--border)',
                    }}/>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={colSpanTotal}
                      style={{ padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 12 }}>
                      No rows.
                    </td>
                  </tr>
                ) : displayRows.map((row, ri) => {
                  const isRetired = !!row.retiring_timestamp;
                  const isDupe    = selectedDupes && pkField && selectedDupes.has(row[pkField]);
                  let rowBg = 'transparent';
                  if (isDupe)     rowBg = 'var(--red-bg)';
                  else if (isRetired) rowBg = 'rgba(255,176,32,0.05)';
                  return (
                    <tr key={ri}
                      style={{
                        opacity:    isRetired ? 0.6 : 1,
                        background: rowBg,
                      }}>
                      {displayCols.map(col => {
                        const val    = row[col.name];
                        const isNull = val === null || val === undefined;
                        return (
                          <td key={col.name}
                            style={{
                              padding: '5px 10px',
                              borderBottom: '1px solid var(--border)',
                              fontFamily: (col.isPk || col.fk) ? 'var(--mono)' : 'inherit',
                              color: isNull ? 'var(--text2)' : (isDupe && col.isPk ? 'var(--red)' : 'var(--text)'),
                              maxWidth: 280, overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                            {isNull
                              ? <span style={{ fontStyle: 'italic', fontSize: 11 }}>{'null'}</span>
                              : col.isPk && isDupe
                                ? <span style={{ display:'inline-flex', alignItems:'center', gap: 4 }}>
                                    {String(val)}
                                    <span title={'Duplicate PK'} style={{ color:'var(--red)', lineHeight:1 }}>
                                      <Icon.Warning/>
                                    </span>
                                  </span>
                                : String(val)
                            }
                          </td>
                        );
                      })}
                      {showRetired && (
                        <td style={{
                          padding: '5px 10px', borderBottom: '1px solid var(--border)',
                          width: 60, textAlign: 'right',
                        }}>
                          {isRetired && pkField && (
                            <button
                              onClick={() => restoreRecord(selectedTable, row[pkField])}
                              style={{
                                fontSize: 10, padding: '2px 7px', cursor: 'pointer',
                                fontWeight: 600, borderRadius: 4,
                                background: 'var(--amber-bg)', color: 'var(--amber)',
                                border: '1px solid var(--amber)',
                              }}>
                              Undo
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
