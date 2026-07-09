const STORAGE_KEY = 'moj_dq_store_v1';

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, savedAt: new Date().toISOString() }));
    return true;
  } catch(e) {
    console.error('Storage write failed:', e);
    return false;
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch(e) {
    return null;
  }
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

// ===============================================================================
// TASK 5 -- DATA HEALTH CHECK
// Validates FK integrity on all records.
// ===============================================================================

function runHealthCheck(data) {
  const issues = [];
  const tableCounts = {};

  for (const [tableName, schema] of Object.entries(SCHEMA)) {
    const rows = data[tableName] || [];
    const live = rows.filter(r => !r.retiring_timestamp);
    const retired = rows.filter(r => r.retiring_timestamp);
    tableCounts[tableName] = { total: rows.length, live: live.length, retired: retired.length };

    // Check FK references
    for (const col of schema.cols) {
      if (!col.fk) continue;
      const refTable = data[col.fk.table] || [];
      const refIds = new Set(refTable.map(r => r[col.fk.field]));

      for (const row of rows) {
        const val = row[col.name];
        if (val === null || val === undefined) continue;
        if (!refIds.has(val)) {
          issues.push({
            table: tableName,
            pk: row[schema.pk],
            field: col.name,
            value: val,
            refTable: col.fk.table,
            msg: `${tableName}[${row[schema.pk]}].${col.name} = ${val} -- no matching record in ${col.fk.table}`,
          });
        }
      }
    }
  }

  return { issues, tableCounts };
}

// ===============================================================================
// TASK 6 -- CSV EXPORT CORE
// Produces one CSV string per table. includeSoftDeleted defaults to false.
// ===============================================================================

