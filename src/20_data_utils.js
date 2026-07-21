function coerceValue(raw, type) {
  if (raw === null || raw === undefined || raw === '' ||
      (typeof raw === 'number' && isNaN(raw))) return null;
  switch (type) {
    case 'int':   { const n = parseInt(raw, 10); return isNaN(n) ? null : n; }
    case 'float': { const n = parseFloat(raw); return isNaN(n) ? null : n; }
    case 'bool':
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') return raw.toLowerCase() === 'true';
      return Boolean(raw);
    case 'datetime':
      if (!raw) return null;
      // Excel dates come through as JS Date objects or serial numbers via SheetJS
      if (raw instanceof Date) return raw.toISOString();
      if (typeof raw === 'number') {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(raw);
        if (d) return new Date(d.y, d.m-1, d.d).toISOString();
      }
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
      return null;
    case 'str':
    case 'text':
    default:
      return String(raw).trim() === '' ? null : String(raw).trim();
  }
}

function importSheet(ws, tableName) {
  const schema = SCHEMA[tableName];
  if (!schema) return [];

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
  return rawRows.map(row => {
    const record = {};
    for (const col of schema.cols) {
      let val = row[col.name] ?? null;

      if (val === null || val === undefined || val === '') {
        record[col.name] = null;
        continue;
      }

      switch (col.type) {
        case 'bool':
          if (typeof val === 'boolean') break;
          val = String(val).toLowerCase() === 'true';
          break;
        case 'int':
          val = parseInt(val, 10);
          if (isNaN(val)) val = null;
          break;
        case 'float':
          val = parseFloat(val);
          if (isNaN(val)) val = null;
          break;
        case 'datetime':
          if (val instanceof Date) {
            // toISOString uses UTC -- use local date parts to avoid day-shift
            const y = val.getFullYear();
            const m = String(val.getMonth()+1).padStart(2,'0');
            const d = String(val.getDate()).padStart(2,'0');
            val = `${y}-${m}-${d}`;
          } else if (typeof val === 'number') {
            // Excel serial date
            const dt = XLSX.SSF.parse_date_code(val);
            if (dt) val = `${dt.y}-${String(dt.m).padStart(2,'0')}-${String(dt.d).padStart(2,'0')}`;
            else val = null;
          } else if (typeof val === 'string' && val.trim()) {
            // Already a string -- try to normalise to YYYY-MM-DD
            const parsed = new Date(val.trim());
            if (!isNaN(parsed)) {
              const y = parsed.getFullYear();
              const m = String(parsed.getMonth()+1).padStart(2,'0');
              const d = String(parsed.getDate()).padStart(2,'0');
              val = `${y}-${m}-${d}`;
            } else {
              val = val.trim();
            }
          } else {
            val = null;
          }
          break;
        case 'str':
        case 'text':
        default:
          val = String(val).trim() || null;
          break;
      }
      record[col.name] = val;
    }
    return record;
  }).filter(r => {
    const pk = schema.pk;
    return r[pk] !== null && r[pk] !== undefined;
  });
}

function importWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const result = {};
  const log = [];

  for (const [sheetName, tableName] of Object.entries(SHEET_MAP)) {
    if (!wb.SheetNames.includes(sheetName)) {
      log.push({ level: 'warn', msg: `Sheet "${sheetName}" not found -- table ${tableName} will be empty` });
      result[tableName] = [];
      continue;
    }
    const ws = wb.Sheets[sheetName];
    const rows = importSheet(ws, tableName);
    result[tableName] = rows;

    const pk = SCHEMA[tableName]?.pk;
    if (pk) {
      const seen = new Set();
      const dupes = new Set();
      for (const row of rows) {
        const pkVal = row[pk];
        if (pkVal !== null && pkVal !== undefined) {
          if (seen.has(pkVal)) dupes.add(pkVal);
          else seen.add(pkVal);
        }
      }
      if (dupes.size > 0) {
        const dupeList = [...dupes].sort((a, b) => a - b).join(', ');
        log.push({ level: 'err', msg: `${tableName}: ${dupes.size} duplicate PK${dupes.size > 1 ? 's' : ''} found (${pk}: ${dupeList}) -- fix the source data and re-import` });
      } else {
        log.push({ level: 'info', msg: `${tableName}: imported ${rows.length} rows` });
      }
    } else {
      log.push({ level: 'info', msg: `${tableName}: imported ${rows.length} rows` });
    }
  }

  // Second pass: FK integrity check across all loaded tables
  for (const [tableName, schema] of Object.entries(SCHEMA)) {
    const rows = result[tableName];
    if (!rows || rows.length === 0) continue;
    for (const col of (schema.cols || [])) {
      if (!col.fk) continue;
      const targetRows = result[col.fk.table];
      if (!targetRows) continue;
      const validPks = new Set(targetRows.map(r => r[col.fk.field]));
      const badVals  = new Set();
      for (const row of rows) {
        const v = row[col.name];
        if (v === null || v === undefined) continue;
        if (!validPks.has(v)) badVals.add(v);
      }
      if (badVals.size > 0) {
        const badList = [...badVals].sort((a, b) => a - b).join(', ');
        log.push({ level: 'err', msg: `${tableName}.${col.name}: ${badVals.size} unresolved FK value${badVals.size > 1 ? 's' : ''} not found in ${col.fk.table} (${badList}) -- fix the source data and re-import` });
      }
    }
  }

  return { data: result, log };
}

// ===============================================================================
// TASK 3 -- ID RESOLUTION ENGINE
// Builds lookup maps from loaded data. Rebuilt whenever state changes.
// ===============================================================================

function buildLookups(data) {
  const maps = {};
  for (const [tableName, schema] of Object.entries(SCHEMA)) {
    const rows = data[tableName] || [];
    const pk = schema.pk;
    // byId: id -> row
    maps[`${tableName}ById`] = Object.fromEntries(
      rows.map(r => [r[pk], r])
    );
    // index all FK display values: for dropdowns
  }
  return maps;
}

// Resolve a FK value to its display string
function resolveFk(maps, fkDef, id) {
  if (id === null || id === undefined) return '--';
  const byId = maps[`${fkDef.table}ById`];
  if (!byId) return String(id);
  const row = byId[id];
  if (!row) return `[${id}]`;
  return row[fkDef.display] ?? String(id);
}

// Get dropdown options for a FK field
function getFkOptions(data, fkDef) {
  const rows = data[fkDef.table] || [];
  return rows
    .filter(r => !r.retiring_timestamp)
    .map(r => ({
      value: r[fkDef.field],
      label: r[fkDef.display] ?? String(r[fkDef.field]),
    }));
}

// Replace Unicode space variants (U+00A0, U+2000-U+200B, U+202F, U+205F,
// U+3000, U+FEFF, U+00AD) with plain ASCII space -- Athena rejects these.
function normalizeWhitespace(str) {
  if (!str) return str;
  return str.replace(/[\u00A0\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u200B\u202F\u205F\u3000\uFEFF\u00AD]/g, ' ');
}

function substituteCdeTokens(str, cde) {
  if (!str || !cde) return str || '';
  return str
    .replace(/\{SOURCE_DATABASE_NAME\}/gi, cde.source_database_name || '')
    .replace(/\{SOURCE_TABLE_NAME\}/gi,    cde.source_table_name    || '')
    .replace(/\{SOURCE_FIELD_NAME\}/gi,    cde.source_field_name    || '');
}

// ===============================================================================
// MY DATA FILTER -- shared utilities used by all screens with a scope toggle
// ===============================================================================

// Returns a Set of CDS ids owned by the steward (live stewardship records only),
// or null when no identity is set or the steward has no live CDS assignments.
function getMyStewardCdsIds(data, stewardIdentity) {
  if (!data || !stewardIdentity) return null;
  var ids = new Set(
    (data.stewardship || [])
      .filter(function(s) {
        return !s.retiring_timestamp &&
               s.data_steward_id === stewardIdentity.id &&
               s.critical_data_set_id !== 0;
      })
      .map(function(s) { return s.critical_data_set_id; })
  );
  return ids.size > 0 ? ids : null;
}

// Reads myDataOnly preference from localStorage.
// When no stored value exists, defaults to true for regular stewards and false for masters,
// so masters see the full org picture by default while stewards see their own scope.
function loadMyDataPref(key, isMaster) {
  try {
    var stored = localStorage.getItem(key);
    return stored === null ? !isMaster : stored === '1';
  } catch(e) { return !isMaster; }
}

function saveMyDataPref(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch(e) {}
}

// Shared custom hook: My Data scope filter.
// Encapsulates myDataOnly state, localStorage persistence, and the three scope
// sets (CDS, directorate, agency) derived from the steward's stewardship records.
// storageKey must be unique per screen (e.g. 'moj_dq_simulator_mydata_v1').
function useMyDataScope(data, stewardIdentity, isMaster, cdSets, dirs, storageKey) {
  const [myDataOnly, setMyDataOnly] = useState(
    function() { return loadMyDataPref(storageKey, isMaster); }
  );
  useEffect(function() { saveMyDataPref(storageKey, myDataOnly); }, [myDataOnly]);

  const myStewardCdsIds = useMemo(
    function() { return getMyStewardCdsIds(data, stewardIdentity); },
    [data, stewardIdentity]
  );

  const scopeCdsIds = (myDataOnly && myStewardCdsIds) ? myStewardCdsIds : null;

  const scopeDirIds = useMemo(function() {
    if (!scopeCdsIds) return null;
    return new Set(
      cdSets.filter(function(d) { return !d.retiring_timestamp && scopeCdsIds.has(d.critical_data_set_id); })
            .map(function(d) { return d.directorate_id; })
    );
  }, [cdSets, scopeCdsIds]);

  const scopeAgencyIds = useMemo(function() {
    if (!scopeDirIds) return null;
    return new Set(
      dirs.filter(function(d) { return !d.retiring_timestamp && scopeDirIds.has(d.directorate_id); })
          .map(function(d) { return d.executive_agency_id; })
    );
  }, [dirs, scopeDirIds]);

  return { myDataOnly, setMyDataOnly, scopeCdsIds, scopeDirIds, scopeAgencyIds };
}

// ===============================================================================
// TASK 4 -- LOCALSTORAGE PERSISTENCE
// ===============================================================================
