// ===============================================================================
// SQL GENERATION HELPERS (shared by panel and legacy flow)
// ===============================================================================
function buildProfilingSQL(db, tbl, field, physType, semanticType, snapshotFilter) {
  const t = (semanticType || physType || 'STRING').toUpperCase();
  const isNumeric = ['INT','INTEGER','BIGINT','SMALLINT','TINYINT','DOUBLE','FLOAT','DECIMAL',
    'REAL','NUMERIC','LONG','NUMERIC'].some(p => t.startsWith(p));
  const isDate    = ['DATE','TIMESTAMP'].some(p => t.startsWith(p));
  const isBoolean = t.startsWith('BOOL');

  const snap         = snapshotFilter ? normalizeWhitespace(snapshotFilter.trim()) : null;
  const snapWhere    = snap ? `WHERE ${snap}` : '';
  const snapWhereAnd = snap ? `WHERE ${snap}\n  AND ` : 'WHERE ';

  const summarySQL = isNumeric ? `-- COLUMN PROFILING (numeric field)
SELECT
  COUNT(*)                                          AS total_rows,
  COUNT(${field})                                   AS non_null_rows,
  COUNT(*) - COUNT(${field})                        AS null_rows,
  ROUND(100.0 * (COUNT(*) - COUNT(${field})) / NULLIF(COUNT(*),0), 2) AS null_pct,
  COUNT(DISTINCT ${field})                          AS distinct_values,
  MIN(${field})                                     AS min_value,
  MAX(${field})                                     AS max_value,
  ROUND(AVG(CAST(${field} AS DOUBLE)), 4)           AS avg_value,
  APPROX_PERCENTILE(CAST(${field} AS DOUBLE), 0.5)  AS median_value
FROM ${db}.${tbl}
${snapWhereAnd}${field} IS NOT NULL;`

  : isDate ? `-- COLUMN PROFILING (date/timestamp field)
SELECT
  COUNT(*)                                                              AS total_rows,
  COUNT(${field})                                                       AS non_null_rows,
  COUNT(*) - COUNT(${field})                                            AS null_rows,
  ROUND(100.0 * (COUNT(*) - COUNT(${field})) / NULLIF(COUNT(*),0), 2)  AS null_pct,
  COUNT(DISTINCT ${field})                                              AS distinct_values,
  MIN(TRY_CAST(${field} AS DATE))                                       AS min_value,
  MAX(TRY_CAST(${field} AS DATE))                                       AS max_value,
  COUNT_IF(TRY_CAST(${field} AS DATE) > CURRENT_DATE)                   AS future_dates,
  COUNT_IF(TRY_CAST(${field} AS DATE) < DATE('2000-01-01'))              AS very_old_dates,
  COUNT_IF(TRY_CAST(${field} AS DATE) IS NULL AND ${field} IS NOT NULL)  AS invalid_date_format
FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''};`

  : `-- COLUMN PROFILING (string field)
SELECT
  COUNT(*)                                          AS total_rows,
  COUNT(${field})                                   AS non_null_rows,
  COUNT(*) - COUNT(${field})                        AS null_rows,
  COUNT_IF(TRIM(${field}) = '')                     AS blank_rows,
  MIN(LENGTH(${field}))                             AS min_length,
  MAX(LENGTH(${field}))                             AS max_length,
  COUNT(DISTINCT ${field})                          AS distinct_values,
  COUNT_IF(REGEXP_LIKE(${field}, '^[0-9]+$'))       AS numeric_values,
  COUNT_IF(REGEXP_LIKE(${field}, '^[0-9]+\\\\.[0-9]+$')) AS decimal_values,
  COUNT_IF(TRY_CAST(${field} AS INTEGER) IS NOT NULL) AS integer_castable,
  COUNT_IF(TRY_CAST(${field} AS DOUBLE) IS NOT NULL)  AS double_castable,
  COUNT_IF(TRY(DATE_PARSE(${field}, '%d/%m/%Y')) IS NOT NULL) AS date_ddmmyyyy,
  COUNT_IF(TRY(DATE_PARSE(${field}, '%Y-%m-%d')) IS NOT NULL) AS date_yyyymmdd,
  COUNT_IF(REGEXP_LIKE(${field}, '[^A-Za-z0-9 ]'))    AS special_char_values
FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''};`;

  const topValuesSQL = `-- FREQUENCY ANALYSIS (all types)
SELECT
  ${field},
  COUNT(*) AS occurrences,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''}
GROUP BY ${field}
ORDER BY occurrences DESC
LIMIT 50;`;

  const typePatternsSQL = isNumeric || isDate || isBoolean ? null : `-- PATTERN ANALYSIS (string fields)
SELECT
  CASE
    WHEN ${field} IS NULL                              THEN 'NULL'
    WHEN TRIM(${field}) = ''                           THEN 'BLANK'
    WHEN REGEXP_LIKE(${field}, '^[0-9]+$')             THEN 'INTEGER'
    WHEN REGEXP_LIKE(${field}, '^[0-9]+\\\\.[0-9]+$')  THEN 'DECIMAL'
    WHEN TRY(DATE_PARSE(${field}, '%d/%m/%Y')) IS NOT NULL THEN 'DATE_DDMMYYYY'
    WHEN TRY(DATE_PARSE(${field}, '%Y-%m-%d')) IS NOT NULL THEN 'DATE_YYYYMMDD'
    WHEN REGEXP_LIKE(${field}, '^[A-Za-z]+$')          THEN 'ALPHA'
    WHEN REGEXP_LIKE(${field}, '^[A-Za-z0-9]+$')       THEN 'ALPHANUMERIC'
    ELSE 'MIXED/SPECIAL'
  END AS detected_type,
  COUNT(*) AS record_count
FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''}
GROUP BY 1
ORDER BY record_count DESC;`;

  const lengthSQL = isNumeric || isDate || isBoolean ? null : `-- LENGTH PROFILE (string fields)
SELECT
  LENGTH(${field}) AS value_length,
  COUNT(*)         AS occurrences
FROM ${db}.${tbl}
${snapWhereAnd}${field} IS NOT NULL
GROUP BY LENGTH(${field})
ORDER BY value_length;`;

  const duplicateSQL = `-- DUPLICATE ANALYSIS (all types)
SELECT
  COUNT(*)                                               AS total_values,
  COUNT(DISTINCT ${field})                               AS unique_values,
  COUNT(*) - COUNT(DISTINCT ${field})                    AS excess_duplicates,
  ROUND(100.0 * COUNT(DISTINCT ${field}) / NULLIF(COUNT(*),0), 2) AS uniqueness_pct
FROM ${db}.${tbl}
${snapWhereAnd}${field} IS NOT NULL;`;

  const outlierSQL = isNumeric
    ? `-- OUTLIER ANALYSIS (numeric -- Z-score > 3)
WITH stats AS (
  SELECT
    AVG(CAST(${field} AS DOUBLE))    AS mean_val,
    STDDEV(CAST(${field} AS DOUBLE)) AS stddev_val
  FROM ${db}.${tbl}
  ${snapWhereAnd}${field} IS NOT NULL
)
SELECT
  t.${field}                                                       AS raw_value,
  ROUND(CAST(t.${field} AS DOUBLE), 4)                             AS numeric_value,
  ROUND(ABS(CAST(t.${field} AS DOUBLE) - s.mean_val)
    / NULLIF(s.stddev_val, 0), 2)                                  AS z_score
FROM ${db}.${tbl} t
CROSS JOIN stats s
${snapWhereAnd}t.${field} IS NOT NULL
  AND ABS(CAST(t.${field} AS DOUBLE) - s.mean_val) > 3 * s.stddev_val
ORDER BY z_score DESC
LIMIT 100;`
    : isBoolean ? null
    : `-- OUTLIER ANALYSIS (categorical -- low-frequency values)
WITH counts AS (
  SELECT ${field}, COUNT(*) AS cnt
  FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''}
  GROUP BY ${field}
),
total AS (SELECT SUM(cnt) AS n FROM counts)
SELECT
  c.${field}                            AS value,
  c.cnt                                 AS occurrences,
  ROUND(100.0 * c.cnt / t.n, 4)        AS pct
FROM counts c
CROSS JOIN total t
WHERE c.cnt <= 2 OR (100.0 * c.cnt / t.n < 0.1)
ORDER BY c.cnt ASC
LIMIT 50;`;

  return { summarySQL, topValuesSQL, typePatternsSQL, lengthSQL, duplicateSQL, outlierSQL };
}

function ProfilingSqlStep({ stepNum, label, sqlKey, sql, value, onChange, required, accent, copied, onCopy }) {
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
        <span style={{ fontSize:10, fontWeight:700, fontFamily:'var(--mono)',
          color:accent, background:`${accent}18`, border:`1px solid ${accent}35`,
          borderRadius:3, padding:'1px 7px', flexShrink:0 }}>
          {stepNum}
        </span>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text2)', flex:1 }}>
          {label}
          {required && <span style={{ color:'var(--red)', marginLeft:4 }}>*</span>}
          {!required && <span style={{ fontSize:10, color:'var(--text3)', fontWeight:400,
            marginLeft:6 }}>(optional)</span>}
        </span>
        {sql ? (
          <button onClick={() => onCopy(sqlKey, sql)}
            title={sql}
            style={{ fontSize:10, padding:'3px 10px', cursor:'pointer',
              background:'var(--bg3)', border:`1px solid ${accent}`,
              borderRadius:'var(--radius)', color:accent,
              fontWeight:600, fontFamily:'var(--mono)', flexShrink:0 }}>
            {copied[sqlKey] ? 'Copied!' : 'Copy SQL'}
          </button>
        ) : (
          <span style={{ fontSize:10, color:'var(--text3)', fontStyle:'italic' }}>
            Not applicable for this type
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={sql ? 'Paste Athena results here...' : 'Not applicable for this field type'}
        disabled={!sql}
        style={{ width:'100%', padding:'7px 10px', fontSize:11,
          background:'var(--bg3)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', color:'var(--text)',
          fontFamily:'var(--mono)', outline:'none',
          resize:'vertical', lineHeight:1.5, minHeight:90,
          opacity: sql ? 1 : 0.4 }}/>
    </div>
  );
}

// ===============================================================================
// DDL PARSING
// ===============================================================================
function parseDDL(ddlText) {
  if (!ddlText) return [];
  const cols = [];
  const lineRe = /^\s*`?([a-zA-Z_][a-zA-Z0-9_]*)`?\s+([A-Za-z]+(?:\([^)]*\))?)/gm;
  let m;
  while ((m = lineRe.exec(ddlText)) !== null) {
    const name = m[1].toLowerCase();
    const type = m[2].toUpperCase();
    if (['CREATE','EXTERNAL','TABLE','STORED','AS','ROW','FORMAT','LOCATION',
         'TBLPROPERTIES','PARTITIONED','BY','WITH','COMMENT','LIKE'].includes(name.toUpperCase())) continue;
    cols.push({ name, type });
  }
  return cols;
}

// ===============================================================================
// SQL REFERENCE PARSING  (Tasks 2)
// ===============================================================================
function parseTableRefs(sqlCode) {
  if (!sqlCode) return [];
  const sql = sqlCode
    .replace(/\{SOURCE_DATABASE_NAME\}/gi, 'PHDB')
    .replace(/\{SOURCE_TABLE_NAME\}/gi,    'PHTBL')
    .replace(/\{SOURCE_FIELD_NAME\}/gi,    'PHFLD')
    .toLowerCase();
  const refs = [];
  const re = /(?:from|join)\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/g;
  let match;
  while ((match = re.exec(sql)) !== null) {
    const full  = match[1];
    const alias = match[2] || null;
    if (full.startsWith('phdb') || full.startsWith('phtbl') || full === 'phtbl') continue;
    const parts = full.split('.');
    const db    = parts.length >= 2 ? parts[0] : null;
    const table = parts.length >= 2 ? parts[1] : parts[0];
    if (table === 'phtbl') continue;
    refs.push({ db, table, alias: alias || table });
  }
  return refs;
}

function parseFieldRefs(sqlCode, tableRefs) {
  if (!sqlCode || !tableRefs || tableRefs.length === 0) return [];
  const sql = sqlCode
    .replace(/\{SOURCE_DATABASE_NAME\}/gi, 'PHDB')
    .replace(/\{SOURCE_TABLE_NAME\}/gi,    'PHTBL')
    .replace(/\{SOURCE_FIELD_NAME\}/gi,    'PHFLD')
    .toLowerCase();
  const aliasMap = {};
  for (const ref of tableRefs) {
    if (ref.alias) aliasMap[ref.alias] = { db: ref.db, table: ref.table };
    aliasMap[ref.table] = { db: ref.db, table: ref.table };
  }
  const SKIP = new Set([
    'count','sum','avg','min','max','trim','length','upper','lower','cast','try',
    'coalesce','nullif','round','floor','ceil','substr','substring','replace',
    'regexp_like','approx_percentile','date_parse','try_cast','count_if',
    'date_diff','date_add','year','month','day','hour','minute','second',
    'array_agg','string_agg','listagg','json_extract','element_at',
  ]);
  const results = [];
  const seen    = new Set();
  const re      = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g;
  let match;
  while ((match = re.exec(sql)) !== null) {
    const qualifier = match[1];
    const field     = match[2];
    if (field === 'phfld' || qualifier === 'phdb' || qualifier === 'phtbl') continue;
    if (SKIP.has(qualifier)) continue;
    const resolved = aliasMap[qualifier];
    if (!resolved) continue;
    const key = `${resolved.db || ''}|||${resolved.table}|||${field}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ db: resolved.db, table: resolved.table, field });
  }
  return results;
}

// ===============================================================================
// AGENDA ASSEMBLY  (Task 3)
// ===============================================================================
function buildProfilingAgenda({ cdes, rules, allocs, fieldProfiling, ddls, dimensions, scopeCdsIds, cdeInfoMap }) {
  // --- lookup maps ---
  const profilingByKey = {};
  for (const p of fieldProfiling) {
    if (!p.retiring_timestamp)
      profilingByKey[`${p.source_database_name}|||${p.source_table_name}|||${p.source_field_name}`] = p;
  }

  const ddlByKey = {};
  for (const d of ddls) {
    if (!d.retiring_timestamp)
      ddlByKey[`${d.source_database_name}|||${d.source_table_name}`] = d;
  }

  const allocsByCdeId = {};
  for (const a of allocs) {
    if (!a.retiring_timestamp) {
      if (!allocsByCdeId[a.critical_data_element_id]) allocsByCdeId[a.critical_data_element_id] = [];
      allocsByCdeId[a.critical_data_element_id].push(a);
    }
  }

  // --- field map: fieldKey -> entry ---
  const fieldMap = {};

  // Step 1: CDE fields
  const liveCdes = cdes.filter(c =>
    !c.retiring_timestamp &&
    c.source_database_name && c.source_table_name && c.source_field_name
  );
  const scopedCdes = scopeCdsIds
    ? liveCdes.filter(c => scopeCdsIds.has(c.critical_data_set_id))
    : liveCdes;

  const cdeCountByTable = {};
  const ruleIdsByTable  = {};
  for (const cde of scopedCdes) {
    const key = `${cde.source_database_name}|||${cde.source_table_name}|||${cde.source_field_name}`;
    const tk  = `${cde.source_database_name}|||${cde.source_table_name}`;
    if (!fieldMap[key]) {
      fieldMap[key] = {
        db:             cde.source_database_name,
        table:          cde.source_table_name,
        field:          cde.source_field_name,
        origin:         'CDE',
        cdeIds:         [],
        ruleCount:      0,
        dimsCovered:    new Set(),
        snapshotFilter: cde.source_snapshot_filter
          ? substituteCdeTokens(cde.source_snapshot_filter, cde)
          : null,
      };
    }
    fieldMap[key].cdeIds.push(cde.critical_data_element_id);
    const cdeInfo = cdeInfoMap && cdeInfoMap[cde.critical_data_element_id];
    if (cdeInfo) {
      if (!fieldMap[key].cdsSeenIds) fieldMap[key].cdsSeenIds = new Set();
      if (!fieldMap[key].cdsInfoList) fieldMap[key].cdsInfoList = [];
      if (!fieldMap[key].cdsSeenIds.has(cdeInfo.cdsId)) {
        fieldMap[key].cdsSeenIds.add(cdeInfo.cdsId);
        fieldMap[key].cdsInfoList.push(cdeInfo);
      }
    }
    const cdeAllocs = allocsByCdeId[cde.critical_data_element_id] || [];
    fieldMap[key].ruleCount += cdeAllocs.length;
    for (const a of cdeAllocs) fieldMap[key].dimsCovered.add(a.quality_dimension_id);
    cdeCountByTable[tk] = (cdeCountByTable[tk] || 0) + 1;
    if (!ruleIdsByTable[tk]) ruleIdsByTable[tk] = new Set();
    for (const a of cdeAllocs) ruleIdsByTable[tk].add(a.data_quality_rule_id);
  }

  // Step 2: SQL-extracted fields
  const scopedCdeIdSet = new Set(scopedCdes.map(c => c.critical_data_element_id));
  let rulesToParse = rules.filter(r => !r.retiring_timestamp);
  if (scopeCdsIds) {
    const scopedRuleIds = new Set();
    for (const a of allocs) {
      if (!a.retiring_timestamp && scopedCdeIdSet.has(a.critical_data_element_id))
        scopedRuleIds.add(a.data_quality_rule_id);
    }
    rulesToParse = rulesToParse.filter(r => scopedRuleIds.has(r.data_quality_rule_id));
  }

  for (const rule of rulesToParse) {
    const sqls = [rule.sql_code, rule.sql_code_sample].filter(Boolean);
    for (const sqlBody of sqls) {
      const tableRefs = parseTableRefs(sqlBody);
      const fieldRefs = parseFieldRefs(sqlBody, tableRefs);
      for (const ref of fieldRefs) {
        const key = ref.db
          ? `${ref.db}|||${ref.table}|||${ref.field}`
          : `__unknown__|||${ref.table}|||${ref.field}`;
        if (fieldMap[key]) {
          if (fieldMap[key].origin === 'CDE') fieldMap[key].origin = 'CDE+SQL';
        } else {
          fieldMap[key] = {
            db: ref.db || null, table: ref.table, field: ref.field,
            origin: 'SQL', cdeIds: [], ruleCount: 0, dimsCovered: new Set(),
          };
        }
      }
    }
  }

  // Step 3: Group by db+table
  const tableMap = {};
  for (const entry of Object.values(fieldMap)) {
    const tableKey = entry.db
      ? `${entry.db}|||${entry.table}`
      : `__unknown__|||${entry.table}`;
    if (!tableMap[tableKey]) {
      tableMap[tableKey] = {
        db: entry.db, table: entry.table,
        ddl: ddlByKey[tableKey] || null,
        fields: [],
        tableKey,
      };
    }
    const tg = tableMap[tableKey];
    const parsedCols = tg.ddl && tg.ddl.parsed_columns
      ? JSON.parse(tg.ddl.parsed_columns) : [];
    const colType = parsedCols.find(
      c => c.name.toLowerCase() === entry.field.toLowerCase()
    )?.type || null;
    const profRecord = profilingByKey[
      `${entry.db || ''}|||${entry.table}|||${entry.field}`
    ];
    const dimCoverage = dimensions.map(d => ({
      id:      d.quality_dimension_id,
      acronym: (d.dimension_acronymn || d.dimension_name || '???').slice(0, 3).toUpperCase(),
      name:    d.dimension_name,
      covered: entry.dimsCovered.has(d.quality_dimension_id),
    }));
    const coveredCount = dimCoverage.filter(d => d.covered).length;
    tg.fields.push({
      key:            `${entry.db || ''}|||${entry.table}|||${entry.field}`,
      db:             entry.db,
      table:          entry.table,
      field:          entry.field,
      origin:         entry.origin,
      ruleCount:      entry.ruleCount,
      type:           colType,
      profiling:      profRecord || null,
      dimCoverage,
      coveredCount,
      snapshotFilter: entry.snapshotFilter || null,
      cdsInfoList:    entry.cdsInfoList || [],
    });
  }

  // Step 4: Stats + sort
  return Object.values(tableMap).map(tg => {
    const total     = tg.fields.length;
    const profiled  = tg.fields.filter(f => f.profiling).length;
    const dimCount  = dimensions.length;
    const totalCovPossible = total * dimCount;
    const totalCovered     = tg.fields.reduce((s, f) => s + f.coveredCount, 0);
    const coveragePct      = totalCovPossible > 0
      ? Math.round(100 * totalCovered / totalCovPossible) : 0;
    const fullCov  = tg.fields.filter(f => f.coveredCount === dimCount).length;
    const noneRules = tg.fields.filter(f => f.coveredCount === 0).length;
    const tgKey = tg.db ? `${tg.db}|||${tg.table}` : `__unknown__|||${tg.table}`;
    return {
      ...tg,
      cdeCount:       cdeCountByTable[tgKey] || 0,
      tableRuleCount: ruleIdsByTable[tgKey] ? ruleIdsByTable[tgKey].size : 0,
      profilingStats: { total, profiled, notProfiled: total - profiled },
      coverageStats:  { full: fullCov, partial: total - fullCov - noneRules, none: noneRules },
      coveragePct,
      hasSqlFields: tg.fields.some(f => f.origin === 'SQL' || f.origin === 'CDE+SQL'),
    };
  }).sort((a, b) => {
    if (!a.db && b.db) return 1;
    if (a.db && !b.db) return -1;
    return (`${a.db || ''}|||${a.table}`).localeCompare(`${b.db || ''}|||${b.table}`);
  });
}

// ===============================================================================
// PROFILING SUMMARY STRIP  (Task 4)
// ===============================================================================
function ProfilingSummaryStrip({ tableGroups, dimCount }) {
  const totals = useMemo(() => {
    let noDdl = 0, notProfiled = 0, profiled = 0, noRules = 0, partial = 0, full = 0;
    for (const tg of tableGroups) {
      if (!tg.ddl) { noDdl++; continue; }
      notProfiled += tg.profilingStats.notProfiled;
      profiled    += tg.profilingStats.profiled;
      noRules  += tg.coverageStats.none;
      partial  += tg.coverageStats.partial;
      full     += tg.coverageStats.full;
    }
    return { noDdl, notProfiled, profiled, noRules, partial, full };
  }, [tableGroups]);

  const chip = (val, label, color) => (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5,
      fontSize:11, fontFamily:'var(--mono)', color, whiteSpace:'nowrap' }}>
      <span style={{ fontWeight:700 }}>{val}</span>
      <span style={{ opacity:0.75 }}>{label}</span>
    </span>
  );

  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
      borderRadius:'var(--radius)', padding:'8px 14px', marginBottom:14,
      display:'flex', flexDirection:'column', gap:5 }}>
      <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
        <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
          textTransform:'uppercase', color:'var(--text3)', width:72, flexShrink:0 }}>
          Profiling
        </span>
        {chip(totals.noDdl,       'DDL missing',  'var(--amber)')}
        {chip(totals.notProfiled, 'not profiled', 'var(--amber)')}
        {chip(totals.profiled,    'profiled',      'var(--green)')}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
        <span style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
          textTransform:'uppercase', color:'var(--text3)', width:72, flexShrink:0 }}>
          Coverage
        </span>
        {chip(totals.noRules, 'no rules',  'var(--text3)')}
        {chip(totals.partial, 'partial',   'var(--amber)')}
        {chip(totals.full,    'full',       'var(--green)')}
      </div>
    </div>
  );
}

// ===============================================================================
// FIELD ROW  (Task 5)
// ===============================================================================
function FieldRow({ fieldEntry, dimensions, onProfile, canEdit, accent }) {
  const { field, origin, ruleCount, type, profiling, dimCoverage, coveredCount, cdsInfoList } = fieldEntry;
  const isProfiled = !!profiling;
  const rulesBlind = !isProfiled && ruleCount > 0;
  const dimCount   = dimensions.length;

  const badge = origin === 'CDE'
    ? { label:'CDE',     color:'var(--green)' }
    : origin === 'SQL'
    ? { label:'SQL',     color:'#a06af9' }
    : { label:'CDE+SQL', color:'#5b9cf6' };

  const profileTooltip = isProfiled
    ? ('Profiled on' + (profiling.profiled_at ? ' ' + profiling.profiled_at : '') +
       (profiling.profiled_by ? ' by ' + profiling.profiled_by : ''))
    : 'Not yet profiled';

  const cdsTooltip = cdsInfoList && cdsInfoList.length > 0
    ? cdsInfoList.map(function(c) { return (c.agencyName || 'Unknown Agency') + ' / ' + (c.cdsName || 'Unknown CDS'); }).join('\n')
    : null;

  return (
    <div style={{
      display:'grid',
      gridTemplateColumns:`22px 60px 1fr 60px 60px 44px repeat(${dimCount}, 38px) 96px`,
      alignItems:'center',
      padding:'4px 10px',
      background: rulesBlind ? 'rgba(245,166,35,0.04)' : 'transparent',
      borderBottom:'1px solid var(--border)',
      minHeight:32,
    }}>
      {/* Check */}
      <div style={{ textAlign:'center', lineHeight:1 }}>
        {isProfiled && (
          <span title={profileTooltip}
            style={{ color:'var(--green)', fontSize:12, cursor:'default' }}>
            {'\u2713'}
          </span>
        )}
      </div>

      {/* Origin badge - CDS tooltip on CDE/CDE+SQL rows */}
      <div style={{ display:'flex', justifyContent:'center' }}>
        <span title={cdsTooltip || undefined}
          style={{ fontSize:9, fontWeight:700, letterSpacing:'0.05em',
            color: badge.color, background: badge.color + '18',
            border: `1px solid ${badge.color}40`,
            borderRadius:3, padding:'1px 5px', whiteSpace:'nowrap',
            cursor: cdsTooltip ? 'help' : 'default' }}>
          {badge.label}
        </span>
      </div>

      {/* Field name */}
      <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--text)',
        fontWeight:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        paddingRight:6 }}>
        {field}
      </div>
      {/* Physical type */}
      <div style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)',
        textAlign:'center', overflow:'hidden', textOverflow:'ellipsis',
        paddingLeft:4, paddingRight:4 }}>
        {type || ''}
      </div>

      {/* Logical type */}
      <div style={{ fontSize:9, fontFamily:'var(--mono)',
        color: (profiling && profiling.semantic_type) ? 'var(--purple)' : 'var(--text3)',
        textAlign:'center', overflow:'hidden', textOverflow:'ellipsis',
        paddingLeft:4, paddingRight:4 }}>
        {(profiling && profiling.semantic_type) ? profiling.semantic_type : '\u2014'}
      </div>

      {/* Rules count */}
      <div style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)',
        textAlign:'center' }}>
        {ruleCount > 0 ? ruleCount : ''}
      </div>

      {/* Dimension coverage dots */}
      {dimCoverage.map(d => (
        <div key={d.id} title={`${d.name}: ${d.covered ? 'covered' : 'not covered'}`}
          style={{ textAlign:'center', fontSize:13, lineHeight:1, cursor:'default',
            color: d.covered ? 'var(--green)' : 'var(--border)' }}>
          {d.covered ? '\u25cf' : '\u2013'}
        </div>
      ))}

      {/* Action */}
      <div style={{ textAlign:'right' }}>
        {canEdit && (
          <button onClick={() => onProfile(fieldEntry)}
            style={{ fontSize:10, padding:'2px 8px', cursor:'pointer',
              background: rulesBlind ? 'rgba(245,166,35,0.12)' : 'var(--bg3)',
              border: `1px solid ${rulesBlind ? 'var(--amber)' : 'var(--border)'}`,
              borderRadius:'var(--radius)',
              color: rulesBlind ? 'var(--amber)' : (isProfiled ? 'var(--text3)' : 'var(--text2)'),
              fontWeight:400, whiteSpace:'nowrap' }}>
            {isProfiled ? 'Re-profile' : 'Profile'}
          </button>
        )}
      </div>
    </div>
  );
}

// ===============================================================================
// DIM COVERAGE FOOTER  (Task 6)
// ===============================================================================
function DimCoverageFooter({ fields, dimensions }) {
  const dimCount = dimensions.length;
  const perDim = dimensions.map(d => {
    const covered = fields.filter(f =>
      f.dimCoverage.some(c => c.id === d.quality_dimension_id && c.covered)
    ).length;
    const pct = fields.length > 0 ? Math.round(100 * covered / fields.length) : 0;
    return { id: d.quality_dimension_id, name: d.dimension_name, pct };
  });

  return (
    <div style={{
      display:'grid',
      gridTemplateColumns:`1fr 60px 60px repeat(${dimCount}, 38px) 52px 96px`,
      alignItems:'center',
      padding:'5px 10px',
      borderTop:'1px solid var(--border)',
      background:'var(--bg)',
    }}>
      <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.06em',
        textTransform:'uppercase', color:'var(--text3)' }}>
        Dim coverage
      </div>
      <div/>
      <div/>
      {perDim.map(d => (
        <div key={d.id} title={`${d.name}: ${d.pct}%`}
          style={{ textAlign:'center', fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
            color: d.pct >= 80 ? 'var(--green)' : d.pct >= 40 ? 'var(--amber)' : 'var(--text3)' }}>
          {d.pct}%
        </div>
      ))}
      <div/>
      <div/>
    </div>
  );
}

// ===============================================================================
// TABLE GROUP ROW  (Task 7)
// ===============================================================================
function TableGroupRow({ tableGroup, dimensions, onProfile, onEditDDL, onRetireDDL, onAddDDL, canEdit, dismissedKeys, onDismiss, accent }) {
  const [open, setOpen] = useState(false);
  const { ddl, db, table, fields, profilingStats, hasSqlFields, tableKey, cdeCount, tableRuleCount } = tableGroup;
  const cdeFields = fields.filter(f => f.origin === 'CDE' || f.origin === 'CDE+SQL');
  const allCdesProfiled = cdeFields.length > 0 && cdeFields.every(f => !!f.profiling);
  const dimCount  = dimensions.length;
  const isDismissed = dismissedKeys.has(tableKey);

  const colHdrStyle = {
    fontSize:9, fontWeight:700, letterSpacing:'0.06em',
    textTransform:'uppercase', color:'var(--text3)', textAlign:'center',
    padding:'4px 2px', borderBottom:'1px solid var(--border)',
  };

  return (
    <div style={{
      border:'1px solid var(--border)',
      borderLeft:`3px solid ${ddl ? accent : 'var(--amber)'}`,
      borderRadius:'var(--radius-lg)', overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10,
        padding:'9px 12px', cursor:'pointer',
        background: open ? 'var(--bg3)' : 'var(--bg2)' }}
        onClick={() => setOpen(v => !v)}>

        <div style={{ color: open ? accent : 'var(--text3)', width:12, height:12, flexShrink:0,
          transform: open ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>
          <Icon.ChevronR/>
        </div>

        {ddl && (
          <span
            title={'Profiled on' + (ddl.parsed_at ? ' ' + ddl.parsed_at : '') + (ddl.parsed_by ? ' by ' + ddl.parsed_by : '')}
            style={{
              fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
              color: accent, background: `${accent}15`,
              border: `1px solid ${accent}40`,
              borderRadius:3, padding:'1px 6px', flexShrink:0, whiteSpace:'nowrap',
              cursor:'default',
            }}>
            profiled
          </span>
        )}
        {allCdesProfiled && (
          <span
            title="All CDE fields on this table have been profiled"
            style={{
              fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
              color:'var(--green)', background:'rgba(34,201,142,0.09)',
              border:'1px solid rgba(34,201,142,0.35)',
              borderRadius:3, padding:'1px 6px', flexShrink:0, whiteSpace:'nowrap',
              cursor:'default',
            }}>
            CDEs {'\u2713'}
          </span>
        )}

        <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'baseline', gap:6 }}>
          <span style={{ fontSize:13, fontFamily:'var(--mono)', fontWeight:600, color:'var(--text)' }}>
            {table}
          </span>
          {db && (
            <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', fontWeight:400 }}>
              in {db}
            </span>
          )}
        </div>

        <span style={{ fontSize:10, color:'var(--text3)',
          fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap' }}>
          &middot; {profilingStats.total} field{profilingStats.total !== 1 ? 's' : ''}{' '}
          &middot; {cdeCount} CDE{cdeCount !== 1 ? 's' : ''}{' '}
          &middot; {tableRuleCount} rule{tableRuleCount !== 1 ? 's' : ''}
        </span>

        {/* Profile actions */}
        <div onClick={e => e.stopPropagation()}
          style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
          {ddl && canEdit && (
            <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
              title="Retire table profile" onClick={() => onRetireDDL(tableGroup)}>
              <Icon.EyeOff/>
            </button>
          )}
          {canEdit && (() => {
            const tblBlind = !ddl && tableRuleCount > 0;
            return (
              <button
                style={{ fontSize:10, padding:'2px 8px', cursor:'pointer',
                  background: tblBlind ? 'rgba(245,166,35,0.12)' : 'var(--bg3)',
                  border: `1px solid ${tblBlind ? 'var(--amber)' : 'var(--border)'}`,
                  borderRadius:'var(--radius)',
                  color: tblBlind ? 'var(--amber)' : (ddl ? 'var(--text3)' : 'var(--text2)'),
                  fontWeight:400, whiteSpace:'nowrap' }}
                onClick={() => ddl ? onEditDDL(tableGroup) : onAddDDL(tableGroup)}>
                {ddl ? 'Re-profile' : 'Profile'}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Expanded */}
      {open && fields.length > 0 && (
        <div>
          {/* SQL heuristic notice */}
          {hasSqlFields && !isDismissed && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px',
              background:'rgba(160,106,249,0.06)',
              borderBottom:'1px solid rgba(160,106,249,0.2)',
              fontSize:11, color:'#a06af9' }}>
              <span style={{ flexShrink:0 }}>{'\u24d8'}</span>
              <span>
                {fields.filter(f => f.origin === 'SQL' || f.origin === 'CDE+SQL').length} field(s)
                were extracted from rule SQL - verify they are relevant before profiling.
              </span>
              <button onClick={() => onDismiss(tableKey)}
                style={{ marginLeft:'auto', fontSize:10, padding:'1px 8px',
                  background:'rgba(160,106,249,0.12)', border:'1px solid rgba(160,106,249,0.3)',
                  borderRadius:'var(--radius)', cursor:'pointer',
                  color:'#a06af9', flexShrink:0, fontWeight:600 }}>
                Dismiss
              </button>
            </div>
          )}

          {/* Column headers */}
          <div style={{
            display:'grid',
            gridTemplateColumns:`22px 60px 1fr 60px 60px 44px repeat(${dimCount}, 38px) 96px`,
            padding:'0 10px',
            background:'var(--bg)', borderBottom:'1px solid var(--border)',
          }}>
            <div style={colHdrStyle}/>
            <div style={colHdrStyle}/>
            <div style={{ ...colHdrStyle, textAlign:'left' }}>Field</div>
            <div style={colHdrStyle}>Phys Type</div>
            <div style={colHdrStyle}>Log Type</div>
            <div style={colHdrStyle}>Rules</div>
            {dimensions.map(d => (
              <div key={d.quality_dimension_id} title={d.dimension_name} style={colHdrStyle}>
                {(d.dimension_acronymn || d.dimension_name || '???').slice(0,3).toUpperCase()}
              </div>
            ))}
            <div style={colHdrStyle}/>
          </div>

          {/* Field rows */}
          {fields.map(f => (
            <FieldRow key={f.key} fieldEntry={f} dimensions={dimensions}
              onProfile={onProfile} canEdit={canEdit} accent={accent}/>
          ))}

        </div>
      )}
    </div>
  );
}

// ===============================================================================
// FIELD PROFILING PANEL  (Tasks 9, 10)
// ===============================================================================
function FieldProfilingPanel({ fieldEntry, initialDdl, onClose, accent }) {
  const { data, upsertRecord, nextPk, stewardIdentity, canEdit } = useApp();

  const ddl = initialDdl;

  // Profiling state
  const [semanticType,     setSemanticType]     = useState('');
  const [summaryRaw,       setSummaryRaw]       = useState('');
  const [typePatternsRaw,  setTypePatternsRaw]  = useState('');
  const [topValuesRaw,     setTopValuesRaw]     = useState('');
  const [lengthRaw,        setLengthRaw]        = useState('');
  const [duplicateRaw,     setDuplicateRaw]     = useState('');
  const [outlierRaw,       setOutlierRaw]       = useState('');
  const [notes,            setNotes]            = useState('');
  const [saved,            setSaved]            = useState(false);
  const [copied,           setCopied]           = useState({});

  const existingProfile = useMemo(() => {
    if (!fieldEntry || !data) return null;
    return (data.field_profiling || []).find(p =>
      p.source_database_name === (fieldEntry.db || '') &&
      p.source_table_name    === fieldEntry.table &&
      p.source_field_name    === fieldEntry.field &&
      !p.retiring_timestamp
    ) || null;
  }, [data, fieldEntry]);

  useEffect(() => {
    if (existingProfile) {
      setSemanticType(existingProfile.semantic_type || '');
      setSummaryRaw(existingProfile.summary_raw || '');
      setTypePatternsRaw(existingProfile.type_patterns_raw || '');
      setTopValuesRaw(existingProfile.top_values_raw || '');
      setLengthRaw(existingProfile.length_distribution_raw || '');
      setDuplicateRaw(existingProfile.duplicate_analysis_raw || '');
      setOutlierRaw(existingProfile.outlier_analysis_raw || '');
      setNotes(existingProfile.profiling_notes || '');
    }
  }, [existingProfile]);

  const physicalType = useMemo(() => {
    if (!ddl) return fieldEntry?.type || '';
    const cols = ddl.parsed_columns ? JSON.parse(ddl.parsed_columns) : [];
    return cols.find(c => c.name.toLowerCase() === (fieldEntry?.field || '').toLowerCase())?.type
      || fieldEntry?.type || '';
  }, [ddl, fieldEntry]);

  const sqls = useMemo(() => {
    if (!fieldEntry) return null;
    return buildProfilingSQL(
      fieldEntry.db || '', fieldEntry.table, fieldEntry.field,
      physicalType, semanticType, fieldEntry.snapshotFilter || null
    );
  }, [fieldEntry, physicalType, semanticType]);

  const copySQL = (key, sql) => {
    navigator.clipboard.writeText(normalizeWhitespace(sql)).then(() => {
      setCopied(p => ({ ...p, [key]: true }));
      setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1800);
    });
  };

  const handleSave = () => {
    if (!fieldEntry) return;
    const now = new Date();
    const ds  = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    upsertRecord('field_profiling', {
      field_profiling_id:       existingProfile?.field_profiling_id ?? nextPk('field_profiling'),
      source_database_name:     fieldEntry.db || '',
      source_table_name:        fieldEntry.table,
      source_field_name:        fieldEntry.field,
      physical_data_type:       physicalType,
      semantic_type:            semanticType || null,
      profiled_at:              ds,
      profiled_by:              stewardIdentity?.name || null,
      summary_raw:              summaryRaw,
      type_patterns_raw:        typePatternsRaw || null,
      top_values_raw:           topValuesRaw || null,
      length_distribution_raw:  lengthRaw || null,
      duplicate_analysis_raw:   duplicateRaw || null,
      outlier_analysis_raw:     outlierRaw || null,
      profiling_notes:          notes || null,
      retiring_timestamp:       null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputBase = {
    width:'100%', padding:'7px 10px', fontSize:12,
    background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:'var(--radius)', color:'var(--text)',
    fontFamily:'var(--sans)', outline:'none',
  };
  const monoTA = {
    ...inputBase, fontFamily:'var(--mono)', fontSize:11,
    resize:'vertical', lineHeight:1.5, minHeight:90,
  };

  const rulesBlind = !existingProfile && (fieldEntry?.ruleCount || 0) > 0;

  return (
    <>
      <div onClick={onClose}
        style={{ position:'fixed', inset:0, zIndex:300, background:'var(--overlay-sm)' }}/>
      <div style={{
        position:'fixed', top:0, right:0, bottom:0, width:'min(780px, 82vw)',
        background:'var(--bg2)', borderLeft:'1px solid var(--border2)',
        zIndex:400, display:'flex', flexDirection:'column',
        boxShadow:'-4px 0 24px var(--overlay-md)', animation:'slideInRight 0.18s ease',
      }}>
        {/* Panel header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'flex-start', gap:12, flexShrink:0 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:accent, marginBottom:3 }}>
              {existingProfile ? 'Re-profile field' : 'Profile field'}
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:14, fontFamily:'var(--mono)', fontWeight:700,
                color:'var(--text)', overflowWrap:'anywhere' }}>{fieldEntry?.field}</span>
              <span style={{ fontSize:12, fontFamily:'var(--mono)', color:'var(--text3)',
                overflowWrap:'anywhere' }}>
                in {fieldEntry?.db || 'unknown db'}.{fieldEntry?.table}
              </span>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
            {saved && (
              <span style={{ fontSize:11, color:'var(--green)', fontFamily:'var(--mono)',
                fontWeight:600 }}>Saved</span>
            )}
            {canEdit && (
              <button className="btn btn-primary" onClick={handleSave}
                style={{ padding:'6px 14px', fontSize:12 }}>
                <Icon.Check/> {existingProfile ? 'Update profile' : 'Save profile'}
              </button>
            )}
            <button className="btn btn-ghost" style={{ padding:'6px 8px' }} onClick={onClose}>
              <Icon.X/>
            </button>
          </div>
        </div>

        <div style={{ flex:1, overflow:'auto', padding:'16px 18px',
          display:'flex', flexDirection:'column', gap:16 }}>

          {/* Profiling workflow */}
          {sqls && (
            <>
              {/* Step 1 row: Last Profiled + Semantic type */}
              <div style={{ display:'flex', gap:12, alignItems:'stretch' }}>
                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
                  borderLeft:`3px solid ${existingProfile ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius:'var(--radius-lg)',
                  padding:'14px 16px', flexShrink:0, minWidth:150 }}>
                  <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
                    textTransform:'uppercase',
                    color: existingProfile ? 'var(--green)' : 'var(--text3)',
                    marginBottom:10 }}>
                    Last Profiled
                  </div>
                  {existingProfile ? (
                    <>
                      <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text2)', lineHeight:1.5, overflowWrap:'anywhere' }}>
                        {existingProfile.profiled_at}
                      </div>
                      <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', marginTop:4, overflowWrap:'anywhere' }}>
                        {existingProfile.profiled_by ? `by ${existingProfile.profiled_by}` : 'by unknown'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)' }}>
                      Never
                    </div>
                  )}
                </div>
                {/* Step 1: Semantic type */}
                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
                  borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
                  padding:'14px 16px', flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
                    textTransform:'uppercase', color:accent, marginBottom:10 }}>
                    Step 1 - Define Semantic type
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>
                      Physical:
                      <span style={{ fontFamily:'var(--mono)', fontWeight:600,
                        color:accent, marginLeft:6 }}>
                        {physicalType || '--'}
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <label style={{ fontSize:11, fontWeight:600, color:'var(--text2)',
                        whiteSpace:'nowrap' }}>Override (optional):</label>
                      <select value={semanticType} style={{ ...inputBase, width:'auto',
                        fontSize:11, cursor:'pointer' }}
                        onChange={e => setSemanticType(e.target.value)}>
                        <option value="">-- use physical type --</option>
                        {SEMANTIC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  {fieldEntry?.snapshotFilter ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8,
                      marginTop:8, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, fontWeight:600, color:'var(--text2)',
                        whiteSpace:'nowrap' }}>Snapshot filter:</span>
                      <span style={{ fontFamily:'var(--mono)', fontSize:11,
                        color:'var(--amber)', background:'rgba(245,166,35,0.08)',
                        border:'1px solid rgba(245,166,35,0.25)',
                        borderRadius:'var(--radius)', padding:'2px 8px',
                        overflowWrap:'anywhere' }}>
                        {fieldEntry.snapshotFilter}
                      </span>
                    </div>
                  ) : (fieldEntry?.ruleCount > 0) && (
                    <div style={{ fontSize:11, color:'var(--amber)', marginTop:8 }}>
                      No snapshot filter set. Queries will scan the full table.
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: SQL queries */}
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
                borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
                padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
                  textTransform:'uppercase', color:accent, marginBottom:14 }}>
                  Step 2 - Run profiling queries and paste results
                </div>
                <ProfilingSqlStep stepNum="1" label="Column Profiling" sqlKey="summary"
                  sql={sqls.summarySQL} value={summaryRaw} onChange={setSummaryRaw}
                  required accent={accent} copied={copied} onCopy={copySQL}/>
                <ProfilingSqlStep stepNum="2" label="Frequency Analysis" sqlKey="topValues"
                  sql={sqls.topValuesSQL} value={topValuesRaw} onChange={setTopValuesRaw}
                  accent={accent} copied={copied} onCopy={copySQL}/>
                <ProfilingSqlStep stepNum="3" label="Pattern Analysis" sqlKey="typePatterns"
                  sql={sqls.typePatternsSQL} value={typePatternsRaw}
                  onChange={setTypePatternsRaw}
                  accent={accent} copied={copied} onCopy={copySQL}/>
                <ProfilingSqlStep stepNum="4" label="Length Profile" sqlKey="length"
                  sql={sqls.lengthSQL} value={lengthRaw} onChange={setLengthRaw}
                  accent={accent} copied={copied} onCopy={copySQL}/>
                <ProfilingSqlStep stepNum="5" label="Duplicate Analysis" sqlKey="duplicate"
                  sql={sqls.duplicateSQL} value={duplicateRaw} onChange={setDuplicateRaw}
                  accent={accent} copied={copied} onCopy={copySQL}/>
                <ProfilingSqlStep stepNum="6" label="Outlier Analysis" sqlKey="outlier"
                  sql={sqls.outlierSQL} value={outlierRaw} onChange={setOutlierRaw}
                  accent={accent} copied={copied} onCopy={copySQL}/>
              </div>

              {/* Step 3: Notes */}
              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
                borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
                padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
                  textTransform:'uppercase', color:accent, marginBottom:10 }}>
                  Step 3 - Notes
                  <span style={{ fontSize:10, textTransform:'none', color:'var(--text3)',
                    fontWeight:400, letterSpacing:0, marginLeft:6 }}>(optional)</span>
                </div>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Context, known issues, business meaning, data quirks..."
                  style={{ ...monoTA, minHeight:70 }}/>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ===============================================================================
// PROFILING VIEW -- outer container  (Tasks 8, 11, 12, 13, 14, 15)
// ===============================================================================
function OrphanDdlRow({ ddl, accent, canEdit, onEdit, onRetire }) {
  const tip = 'Profiled on' +
    (ddl.parsed_at ? ' ' + ddl.parsed_at : '') +
    (ddl.parsed_by ? ' by ' + ddl.parsed_by : '');
  return (
    <div style={{
      border:'1px solid var(--border)', borderLeft:'3px solid var(--border)',
      borderRadius:'var(--radius-lg)', background:'var(--bg2)',
      display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
    }}>
      <span title={tip} style={{
        fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
        color:'var(--text3)', background:'var(--bg3)',
        border:'1px solid var(--border)',
        borderRadius:3, padding:'1px 6px', flexShrink:0, whiteSpace:'nowrap', cursor:'default',
      }}>profiled</span>

      <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'baseline', gap:6 }}>
        <span style={{ fontSize:13, fontFamily:'var(--mono)', fontWeight:600, color:'var(--text2)' }}>
          {ddl.source_table_name}
        </span>
        {ddl.source_database_name && (
          <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', fontWeight:400 }}>
            in {ddl.source_database_name}
          </span>
        )}
      </div>

      <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)',
        flexShrink:0, whiteSpace:'nowrap', fontStyle:'italic' }}>
        no active CDEs or rules
      </span>

      {canEdit && (
        <div style={{ display:'flex', gap:4 }}>
          <button title="Edit table profile" onClick={onEdit}
            style={{ background:'none', border:'none', cursor:'pointer',
              color:'var(--text3)', padding:'2px 4px',
              display:'flex', alignItems:'center', width:20, height:20 }}>
            <Icon.Pencil/>
          </button>
          <button title="Retire table DDL" onClick={onRetire}
            style={{ background:'none', border:'none', cursor:'pointer',
              color:'var(--text3)', padding:'2px 4px',
              display:'flex', alignItems:'center', width:20, height:20 }}>
            <Icon.EyeOff/>
          </button>
        </div>
      )}
    </div>
  );
}

function ProfilingView() {
  const { data, restoreRecord, openDdlForm, canEdit, stewardIdentity, isMaster, openRetireConfirm } = useApp();
  const accent = 'var(--purple)';

  const myStewardCdsIds = useMemo(() => getMyStewardCdsIds(data, stewardIdentity), [data, stewardIdentity]);

  const [myDataOnly, setMyDataOnly] = useState(() => loadMyDataPref('moj_dq_profiling_scope_v1', isMaster));
  useEffect(() => { saveMyDataPref('moj_dq_profiling_scope_v1', myDataOnly); }, [myDataOnly]);

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showExtras,   setShowExtras]   = useState(false);

  // SQL heuristic dismissals (Task 13)
  const [dismissedKeys, setDismissedKeys] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('moj_dq_profiling_dismiss_v1') || '[]')); }
    catch { return new Set(); }
  });
  const handleDismiss = (key) => {
    setDismissedKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      try { localStorage.setItem('moj_dq_profiling_dismiss_v1', JSON.stringify([...next])); }
      catch {}
      return next;
    });
  };

  // Profiling slide-in panel state (Task 9)
  const [profilingPanel, setProfilingPanel] = useState(null);

  const dimensions = useMemo(() =>
    (data?.quality_dimension || [])
      .filter(d => !d.retiring_timestamp)
      .sort((a, b) => a.quality_dimension_id - b.quality_dimension_id),
  [data]);

  const scopeCdsIds = (myDataOnly && myStewardCdsIds) ? myStewardCdsIds : null;

  // CDE -> CDS -> Directorate -> Agency lookup map for CDS pill
  const cdeInfoMap = useMemo(() => {
    if (!data) return {};
    const cdsById = {};
    for (const c of (data.critical_data_set || []))
      if (!c.retiring_timestamp) cdsById[c.critical_data_set_id] = c;
    const dirById = {};
    for (const d of (data.directorate || []))
      if (!d.retiring_timestamp) dirById[d.directorate_id] = d;
    const agencyById = {};
    for (const a of (data.executive_agency || []))
      if (!a.retiring_timestamp) agencyById[a.executive_agency_id] = a;
    const map = {};
    for (const cde of (data.critical_data_element || [])) {
      if (cde.retiring_timestamp) continue;
      const cds = cdsById[cde.critical_data_set_id];
      if (!cds) continue;
      const dir    = dirById[cds.directorate_id];
      const agency = dir ? agencyById[dir.executive_agency_id] : null;
      map[cde.critical_data_element_id] = {
        cdsId:      cds.critical_data_set_id,
        cdsName:    cds.data_set_name || '',
        agencyName: agency ? (agency.agency_name || agency.agency_acronymn || '') : '',
      };
    }
    return map;
  }, [data]);

  // Build agenda (Task 3)
  const tableGroups = useMemo(() => {
    if (!data) return [];
    return buildProfilingAgenda({
      cdes:          data.critical_data_element        || [],
      rules:         data.data_quality_rule            || [],
      allocs:        data.data_quality_rule_allocation || [],
      fieldProfiling: data.field_profiling             || [],
      ddls:          data.source_table_ddl             || [],
      dimensions,
      scopeCdsIds,
      cdeInfoMap,
    });
  }, [data, dimensions, scopeCdsIds, cdeInfoMap]);

  const orphanDdls = useMemo(() => {
    if (!data) return [];
    const agendaKeys = new Set(tableGroups.map(tg => tg.tableKey));
    return (data.source_table_ddl || []).filter(d =>
      !d.retiring_timestamp &&
      !agendaKeys.has(`${d.source_database_name}|||${d.source_table_name}`)
    );
  }, [tableGroups, data]);

  // Filter (Tasks 12, search)
  const filteredGroups = useMemo(() => {
    let groups = tableGroups;

    if (search.trim()) {
      const q = search.toLowerCase();
      groups = groups
        .map(tg => {
          const matchesHeader = tg.table.toLowerCase().includes(q) ||
            (tg.db || '').toLowerCase().includes(q);
          if (matchesHeader) return tg;
          const fields = tg.fields.filter(f => f.field.toLowerCase().includes(q));
          if (fields.length === 0) return null;
          return { ...tg, fields };
        })
        .filter(Boolean);
    }

    if (statusFilter !== 'all') {
      groups = groups.map(tg => {
        if (statusFilter === 'needs_ddl') return !tg.ddl ? tg : null;
        let fields = tg.fields;
        if      (statusFilter === 'needs_profiling') fields = fields.filter(f => !f.profiling);
        else if (statusFilter === 'rules_blind')     fields = fields.filter(f => !f.profiling && f.ruleCount > 0);
        else if (statusFilter === 'profiled')        fields = fields.filter(f =>  f.profiling);
        if (fields.length === 0) return null;
        return { ...tg, fields };
      }).filter(Boolean);
    }

    return groups;
  }, [tableGroups, search, statusFilter]);

  const totalTables = tableGroups.length;
  const totalFields = tableGroups.reduce((s, tg) => s + tg.fields.length, 0);

  const stats = useMemo(() => {
    const tableProfiled = tableGroups.filter(tg =>  tg.ddl).length;
    const tablePending  = tableGroups.filter(tg => !tg.ddl).length;
    let fieldProfiled = 0, fieldPending = 0, noRules = 0, partial = 0, full = 0;
    for (const tg of tableGroups) {
      fieldProfiled += tg.profilingStats.profiled;
      fieldPending  += tg.profilingStats.notProfiled;
      noRules += tg.coverageStats.none;
      partial += tg.coverageStats.partial;
      full    += tg.coverageStats.full;
    }

    // Blind rules: per allocated rule, check whether any of its CDEs have been profiled
    // Respect scope filter -- only count rules whose allocations touch scoped CDEs
    const scopedCdeIdSet = scopeCdsIds
      ? new Set((data?.critical_data_element || [])
          .filter(c => !c.retiring_timestamp && scopeCdsIds.has(c.critical_data_set_id))
          .map(c => c.critical_data_element_id))
      : null;

    const profiledKeys = new Set(
      (data?.field_profiling || [])
        .filter(p => !p.retiring_timestamp)
        .map(p => `${p.source_database_name}|||${p.source_table_name}|||${p.source_field_name}`)
    );
    const cdeKey = {};
    for (const c of (data?.critical_data_element || [])) {
      if (!c.retiring_timestamp && c.source_database_name && c.source_table_name && c.source_field_name &&
          (!scopedCdeIdSet || scopedCdeIdSet.has(c.critical_data_element_id)))
        cdeKey[c.critical_data_element_id] =
          `${c.source_database_name}|||${c.source_table_name}|||${c.source_field_name}`;
    }
    const allocsByRule = {};
    for (const a of (data?.data_quality_rule_allocation || [])) {
      if (!a.retiring_timestamp && (!scopedCdeIdSet || scopedCdeIdSet.has(a.critical_data_element_id))) {
        if (!allocsByRule[a.data_quality_rule_id]) allocsByRule[a.data_quality_rule_id] = [];
        allocsByRule[a.data_quality_rule_id].push(a.critical_data_element_id);
      }
    }
    let ruleProfiled = 0, ruleBlind = 0;
    for (const r of (data?.data_quality_rule || [])) {
      if (r.retiring_timestamp) continue;
      const cdeIds = allocsByRule[r.data_quality_rule_id] || [];
      if (cdeIds.length === 0) continue;
      const hasProfile = cdeIds.some(id => cdeKey[id] && profiledKeys.has(cdeKey[id]));
      if (hasProfile) ruleProfiled++; else ruleBlind++;
    }

    return { tableProfiled, tablePending, fieldProfiled, fieldPending,
             noRules, partial, full, ruleProfiled, ruleBlind };
  }, [tableGroups, data, scopeCdsIds]);

  const handleProfile = (fieldEntry) => {
    const tg = tableGroups.find(g => g.db === fieldEntry.db && g.table === fieldEntry.table);
    setProfilingPanel({ fieldEntry, ddl: tg?.ddl || null });
  };

  // DDL inline actions (Task 7 wiring)
  const handleEditDDL    = (tg) => openDdlForm(tg.ddl);
  const handleRetireDDL  = (tg) => openRetireConfirm('source_table_ddl', tg.ddl.source_table_ddl_id);
  const handleAddDDL     = (tg) => openDdlForm({
    source_database_name: tg.db || '',
    source_table_name:    tg.table,
  });

  const inputBase = {
    padding:'7px 10px', fontSize:11, background:'var(--bg3)',
    border:'1px solid var(--border)', borderRadius:'var(--radius)',
    color:'var(--text)', fontFamily:'var(--sans)', outline:'none',
  };

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start',
        justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            Profiling
          </div>
          <div className="page-sub">
            {totalTables} table{totalTables !== 1 ? 's' : ''} &middot;{' '}
            {totalFields} field{totalFields !== 1 ? 's' : ''} in scope
          </div>
        </div>
      </div>

      {/* Stat blobs */}
      <div style={{ display:'flex', gap:10, marginBottom:12 }}>
        {[
          {
            title: 'TABLE PROFILING',
            tip: 'Profiled = tables already profiled. Pending = tables not yet profiled.',
            items: [
              { val: stats.tableProfiled, label: 'profiled', color: 'var(--green)' },
              { val: stats.tablePending,  label: 'pending',  color: 'var(--amber)' },
            ],
          },
          {
            title: 'FIELD PROFILING',
            tip: 'Profiled = fields already profiled. Pending = fields not yet profiled.',
            tbc: totalFields === 0,
            items: [
              { val: stats.fieldProfiled, label: 'profiled', color: 'var(--green)' },
              { val: stats.fieldPending,  label: 'pending',  color: 'var(--amber)' },
            ],
          },
          {
            title: 'FIELD COVERAGE',
            tip: 'Counts fields with at least one quality dimension covered by a quality rule. Full = all dimensions covered. Partial = some covered. No rules = no rule allocations at all.',
            items: [
              { val: stats.noRules, label: 'no rules', color: 'var(--text3)' },
              { val: stats.partial, label: 'partial',  color: 'var(--amber)' },
              { val: stats.full,    label: 'full',     color: 'var(--green)' },
            ],
          },
          {
            title: 'BLIND RULES',
            tip: 'Profiled = rules allocated to a profiled CDE. Not profiled = rules allocated CDEs not yet profiled. Rules with no allocations are excluded.',
            items: [
              { val: stats.ruleProfiled, label: 'profiled',     color: 'var(--green)' },
              { val: stats.ruleBlind,    label: 'not profiled', color: 'var(--amber)' },
            ],
          },
        ].map(blob => (
          <div key={blob.title} style={{
            flex:1, padding:'10px 14px',
            background:'var(--bg2)', border:'1px solid var(--border)',
            borderTop:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:7 }}>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.1em',
                textTransform:'uppercase', color:'var(--text3)' }}>
                {blob.title}
              </span>
              <span title={blob.tip}
                style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                  width:13, height:13, borderRadius:'50%', flexShrink:0,
                  background:'var(--bg3)', border:'1px solid var(--border)',
                  color:'var(--text3)', fontSize:8, fontWeight:700, cursor:'default',
                  lineHeight:1 }}>
                ?
              </span>
            </div>
            <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
              {blob.items.map((item, i) => (
                <span key={item.label} style={{ display:'inline-flex', alignItems:'baseline',
                  gap:4, fontSize:12, whiteSpace:'nowrap' }}>
                  {i > 0 && (
                    <span style={{ color:'var(--border)', marginRight:2,
                      fontSize:14, lineHeight:1 }}>&middot;</span>
                  )}
                  <span style={{ fontSize:18, fontWeight:700, fontFamily:'var(--mono)',
                    color: blob.tbc ? 'var(--text3)' : item.color, lineHeight:1 }}>
                    {blob.tbc ? 'TBC' : item.val}
                  </span>
                  <span style={{ fontSize:11, color:'var(--text3)' }}>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ flex:1, position:'relative' }}>
          <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
            color:'var(--text3)', width:14, height:14, pointerEvents:'none' }}>
            <Icon.Search/>
          </div>
          <input className="table-search" style={{ paddingLeft:32 }}
            placeholder="Search table or field..."
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <MyDataToggle
          active={myDataOnly}
          onToggle={function() { setMyDataOnly(function(v) { return !v; }); }}
          available={!!stewardIdentity}
          accent="#7c5cbf"
        />
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <label style={{ fontSize:11, color:'var(--text3)', whiteSpace:'nowrap' }}>Filter:</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inputBase, cursor:'pointer' }}>
            <option value="all">All</option>
            <option value="needs_ddl">Tables Pending</option>
            <option value="needs_profiling">Fields Pending</option>
            <option value="rules_blind">Blind Rules</option>
            <option value="profiled">Profiled</option>
          </select>
        </div>
        {orphanDdls.length > 0 && (
          <button
            onClick={() => setShowExtras(v => !v)}
            title={showExtras ? 'Hide tables not referenced by any CDE or rule' : 'Show tables not referenced by any CDE or rule'}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px',
              background: showExtras ? `${accent}15` : 'var(--bg3)',
              border: `1px solid ${showExtras ? accent + '40' : 'var(--border)'}`,
              borderRadius:12, fontSize:11, cursor:'pointer',
              color: showExtras ? accent : 'var(--text3)',
              whiteSpace:'nowrap', flexShrink:0, transition:'all 0.15s' }}>
            {showExtras ? 'Hide extras' : 'Show extras'}
            <span style={{ fontSize:9, fontWeight:700,
              background: showExtras ? `${accent}25` : 'var(--bg)',
              border: `1px solid ${showExtras ? accent + '40' : 'var(--border)'}`,
              borderRadius:8, padding:'1px 5px' }}>
              {orphanDdls.length}
            </span>
          </button>
        )}
      </div>

      {/* Empty states */}
      {tableGroups.length === 0 && (
        <div className="status-row status-info">
          No fields in scope. Add CDEs to your Directorate to get started.
        </div>
      )}
      {tableGroups.length > 0 && filteredGroups.length === 0 && (
        <div className="status-row status-info">No records match the current filter.</div>
      )}

      {/* Table group list */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filteredGroups.map(tg => (
          <TableGroupRow
            key={tg.tableKey}
            tableGroup={tg}
            dimensions={dimensions}
            onProfile={handleProfile}
            onEditDDL={handleEditDDL}
            onRetireDDL={handleRetireDDL}
            onAddDDL={handleAddDDL}
            canEdit={canEdit}
            dismissedKeys={dismissedKeys}
            onDismiss={handleDismiss}
            accent={accent}/>
        ))}
      </div>

      {/* Extras: orphaned DDLs not referenced by any CDE or rule */}
      {showExtras && orphanDdls.length > 0 && (
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.07em',
            textTransform:'uppercase', color:'var(--text3)', marginBottom:8 }}>
            Extras &mdash; {orphanDdls.length} Table{orphanDdls.length !== 1 ? 's' : ''} not referenced by any CDE or rule
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {orphanDdls.map(ddl => (
              <OrphanDdlRow
                key={ddl.source_table_ddl_id}
                ddl={ddl}
                accent={accent}
                canEdit={canEdit}
                onEdit={() => openDdlForm(ddl)}
                onRetire={() => openRetireConfirm('source_table_ddl', ddl.source_table_ddl_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Profiling slide-in panel -- portalled to body so position:fixed works outside overflow:hidden ancestors */}
      {profilingPanel && ReactDOM.createPortal(
        <FieldProfilingPanel
          fieldEntry={profilingPanel.fieldEntry}
          initialDdl={profilingPanel.ddl}
          onClose={() => setProfilingPanel(null)}
          accent={accent}/>,
        document.body
      )}
    </div>
  );
}

// Backward-compat stubs -- routing in 240_app.js maps these keys to the unified view
function DDLLibraryView()      { return <ProfilingView/>; }
function FieldProfilingScreen() { return <ProfilingView/>; }
