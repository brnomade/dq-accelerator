// ===============================================================================
// AWS ATHENA CONNECTOR
//
// Implements the connector interface documented in 16_connector_base.js against
// AWS Athena plus S3, using direct browser fetch() calls signed with SigV4.
// No AWS SDK is loaded.
//
// Dependencies:
//   10_constants.js      SCHEMA (table and column definitions)
//   15_aws_sigv4.js      signAwsRequest()
//   16_connector_base.js ConnectorRegistry (registration at bottom of this file)
//   20_data_utils.js     coerceValue()      -- used by importAllTables
//   40_storage.js        tableToCSV()       -- used by exportAllTables
//
// Transport was validated end-to-end against live Athena and S3 in region
// eu-west-1 on 2026-09-24; see designs/version-2/spike-results.txt.
// ===============================================================================

const ATHENA_POLL_INTERVAL_MS  = 250;    // design section 5.4
const ATHENA_QUERY_TIMEOUT_MS  = 60000;  // 60 s per query, design section 5.4
const ATHENA_RESULTS_PAGE_SIZE = 1000;   // GetQueryResults maximum, design section 5.7

// ---------------------------------------------------------------------------
// Config schema (task 3.1)
// ---------------------------------------------------------------------------
// Rendered verbatim by the Database Settings form. Keys match design section 5.1
// and are the property names of the config object every method below receives.
const ATHENA_CONFIG_SCHEMA = [
  { key: 'region',             label: 'AWS Region',              type: 'text',     required: true,  placeholder: 'eu-west-2' },
  { key: 'accessKeyId',        label: 'Access Key ID',           type: 'text',     required: true,  placeholder: 'AKIA...' },
  { key: 'secretAccessKey',    label: 'Secret Access Key',       type: 'password', required: true },
  { key: 'sessionToken',       label: 'Session Token',           type: 'password', required: false, placeholder: 'Leave blank for long-lived IAM keys' },
  { key: 's3Bucket',           label: 'S3 Bucket',               type: 'text',     required: true,  placeholder: 'my-dq-bucket' },
  { key: 'databaseName',       label: 'Athena Database Name',    type: 'text',     required: true,  placeholder: 'dq_accelerator' },
  { key: 'workgroup',          label: 'Athena Workgroup',        type: 'text',     required: true,  placeholder: 'primary' },
  { key: 'queryResultsPrefix', label: 'Query Results S3 Prefix', type: 'text',     required: true,  placeholder: 'athena-results/' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function athenaSleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Keep error messages readable when a failing query is long.
function athenaTruncate(str, max) {
  const limit = max || 200;
  const s = String(str || '');
  return s.length <= limit ? s : s.slice(0, limit) + '...';
}

// Accepts 'athena-results', 'athena-results/', '/athena-results/' and
// 'athena-results//' identically. Normalising silently was chosen over
// validate-and-reject so a harmless trailing-slash typo cannot fail a setup.
function athenaNormalisePrefix(prefix) {
  return String(prefix || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

// s3://{bucket}/{prefix}/ -- where Athena writes its own result files.
function athenaOutputLocation(config) {
  const prefix = athenaNormalisePrefix(config.queryResultsPrefix);
  return 's3://' + String(config.s3Bucket || '').trim() + '/' + (prefix ? prefix + '/' : '');
}

// StartQueryExecution needs an idempotency token. AWS documents ClientRequestToken
// as optional only because the official SDKs generate one for you; the raw API
// rejects the call with "clientRequestToken is null or empty" without it.
// Must be 32-128 characters from [a-zA-Z0-9-_].
//
// A fresh token per call is deliberate. Athena treats a repeated token as a
// repeat of the original request and returns the first QueryExecutionId instead
// of running the query again -- so the per-table retry logic in task 3.7 must
// generate a new token for each attempt, or a retry would silently return the
// failed execution it was meant to replace.
function athenaClientRequestToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'dq-' + crypto.randomUUID();   // 39 chars
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += ('0' + bytes[i].toString(16)).slice(-2);
  }
  return 'dq-' + hex;                     // 35 chars
}

function athenaCredentials(config) {
  const creds = {
    accessKeyId:     String(config.accessKeyId || '').trim(),
    secretAccessKey: String(config.secretAccessKey || '').trim(),
  };
  const token = String(config.sessionToken || '').trim();
  if (token) creds.sessionToken = token;
  return creds;
}

// AWS JSON 1.1 error bodies are shaped { __type, message } or { __type, Message }.
// Fall back to the raw body when it is not JSON (gateway errors, HTML pages).
function athenaFormatError(operation, status, bodyText) {
  let detail = athenaTruncate(bodyText, 400);
  try {
    const parsed = JSON.parse(bodyText);
    const msg  = parsed.message || parsed.Message || '';
    const type = parsed.__type || '';
    if (msg || type) detail = (type ? type + ': ' : '') + msg;
  } catch (e) {
    // not JSON -- keep the raw body
  }
  return 'Athena ' + operation + ' failed (HTTP ' + status + '): ' + detail;
}

// Single signed POST to the Athena JSON API. Every Athena operation goes
// through here. Note signAwsRequest() deliberately omits 'host' from the
// returned headers -- fetch() sets it and the browser forbids overriding it.
async function athenaApiCall(config, operation, payload) {
  const region = String(config.region || '').trim();
  const url    = 'https://athena.' + region + '.amazonaws.com/';
  const body   = JSON.stringify(payload || {});

  const headers = {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Target': 'AmazonAthena.' + operation,
  };

  const signed = await signAwsRequest(
    'POST', url, headers, body, athenaCredentials(config), region, 'athena'
  );

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: signed, body: body });
  } catch (e) {
    // fetch() rejects on network failure and on a blocked CORS preflight; the
    // browser withholds the detail, so say what the likely causes are.
    throw new Error(
      'Athena ' + operation + ' could not reach ' + url +
      '. Check the region, network access, and that the browser is not offline. (' +
      (e && e.message ? e.message : String(e)) + ')'
    );
  }

  const text = await res.text();
  if (!res.ok) throw new Error(athenaFormatError(operation, res.status, text));
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Athena ' + operation + ' returned a non-JSON body: ' + athenaTruncate(text));
  }
}

// ---------------------------------------------------------------------------
// athenaQuery (task 3.2)
// ---------------------------------------------------------------------------
// Runs any SQL statement (DDL or SELECT) and polls to completion.
// Returns the QueryExecutionId on success; throws on FAILED, CANCELLED or timeout.
//
// QueryExecutionContext is deliberately never sent. Omitting it keeps a single
// code path for CREATE DATABASE (which cannot name a database that does not yet
// exist), so every statement passed in here MUST fully qualify its table as
// {databaseName}.{table_name}.
async function athenaQuery(config, queryString) {
  const start = await athenaApiCall(config, 'StartQueryExecution', {
    QueryString: queryString,
    ClientRequestToken: athenaClientRequestToken(),
    ResultConfiguration: { OutputLocation: athenaOutputLocation(config) },
    WorkGroup: String(config.workgroup || 'primary').trim(),
  });

  const queryExecutionId = start && start.QueryExecutionId;
  if (!queryExecutionId) {
    throw new Error('Athena StartQueryExecution returned no QueryExecutionId.');
  }

  const deadline = Date.now() + ATHENA_QUERY_TIMEOUT_MS;
  for (;;) {
    const res    = await athenaApiCall(config, 'GetQueryExecution', { QueryExecutionId: queryExecutionId });
    const status = ((res && res.QueryExecution) || {}).Status || {};
    const state  = status.State;

    if (state === 'SUCCEEDED') return queryExecutionId;

    if (state === 'FAILED' || state === 'CANCELLED') {
      throw new Error(
        'Athena query ' + state + ': ' + (status.StateChangeReason || 'no reason given') +
        ' [SQL: ' + athenaTruncate(queryString) + ']'
      );
    }

    if (Date.now() >= deadline) {
      throw new Error(
        'Athena query timed out after ' + (ATHENA_QUERY_TIMEOUT_MS / 1000) + ' s in state ' +
        (state || 'UNKNOWN') + ' [SQL: ' + athenaTruncate(queryString) + ']'
      );
    }

    await athenaSleep(ATHENA_POLL_INTERVAL_MS);
  }
}

// ---------------------------------------------------------------------------
// athenaGetResults (task 3.3)
// ---------------------------------------------------------------------------
// Fetches every page of a completed query and returns an array of plain row
// objects keyed by column name. Values are raw strings, or null where Athena
// reported the cell as absent -- type coercion happens later in importAllTables.
//
// Two Athena API behaviours are handled here:
//   1. Column names come from ResultSetMetadata.ColumnInfo, not from the rows.
//   2. For a SELECT, the first row of the first page repeats the column labels.
//      It is dropped only when its cells match the column names exactly, so a
//      genuine data row that merely resembles the header is never lost.
async function athenaGetResults(config, queryExecutionId) {
  const rows = [];
  let columns   = null;
  let firstPage = true;
  let nextToken = null;

  for (;;) {
    const payload = { QueryExecutionId: queryExecutionId, MaxResults: ATHENA_RESULTS_PAGE_SIZE };
    if (nextToken) payload.NextToken = nextToken;

    const res       = await athenaApiCall(config, 'GetQueryResults', payload);
    const resultSet = (res && res.ResultSet) || {};

    if (!columns) {
      const columnInfo = (resultSet.ResultSetMetadata || {}).ColumnInfo || [];
      columns = columnInfo.map(function (c) { return c.Name; });
    }

    const pageRows = resultSet.Rows || [];
    pageRows.forEach(function (row, index) {
      const cells = (row.Data || []).map(function (cell) {
        return (cell && Object.prototype.hasOwnProperty.call(cell, 'VarCharValue'))
          ? cell.VarCharValue
          : null;
      });

      // Drop the repeated header row -- first row of the first page only.
      if (firstPage && index === 0 && athenaCellsMatchColumns(cells, columns)) return;

      const record = {};
      columns.forEach(function (name, i) {
        record[name] = (i < cells.length) ? cells[i] : null;
      });
      rows.push(record);
    });

    firstPage = false;
    nextToken = (res && res.NextToken) ? res.NextToken : null;
    if (!nextToken) break;
  }

  return rows;
}

function athenaCellsMatchColumns(cells, columns) {
  if (!columns.length || cells.length !== columns.length) return false;
  return columns.every(function (name, i) { return cells[i] === name; });
}

// ---------------------------------------------------------------------------
// Tables published to the cloud database
// ---------------------------------------------------------------------------
// The 18 core metadata tables, in SCHEMA declaration order.
//
// Deliberately an explicit list rather than Object.keys(SCHEMA). SCHEMA has
// since grown to 22 entries, and source_table_ddl, field_profiling,
// shortlist_group and cde_shortlist_tag are excluded from the cloud database by
// decision on 2026-09-25 -- the first two are local profiling working data, and
// all four post-date the design. This is the authoritative table set for
// setupDatabase, importAllTables and exportAllTables alike.
const ATHENA_TABLES = [
  'executive_agency_type',
  'executive_agency',
  'directorate',
  'critical_data_set',
  'critical_data_element',
  'data_quality_rule',
  'data_quality_rule_allocation',
  'cde_criticality',
  'stewardship',
  'data_patron',
  'data_owner',
  'data_steward',
  'quality_dimension',
  'criticality_group',
  'criticality_level',
  'criticality_group_weight',
  'quality_dimension_weight',
  'steward_role_type',
];

// Load-time consistency check, so a table rename in 10_constants.js surfaces
// here rather than as an Athena error mid-export. Logged rather than thrown:
// this file is concatenated into a single bundle with the whole app, so a throw
// would take down every screen over a cloud-database-only problem.
ATHENA_TABLES.forEach(function (t) {
  if (!SCHEMA[t]) {
    console.error('47_connector_athena.js: ATHENA_TABLES names "' + t + '", which is not in SCHEMA.');
  }
});

// ---------------------------------------------------------------------------
// S3 helpers (task 3.4)
// ---------------------------------------------------------------------------

// RFC 3986 encoding for one path segment. encodeURIComponent leaves !'()* alone
// but SigV4 expects them percent-encoded, and a mismatch between the path we
// sign and the path we send is a SignatureDoesNotMatch with no useful detail.
function s3EncodeSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

// Virtual-hosted-style endpoint: the form the Phase 0 spike validated, and the
// only form that honours a per-bucket CORS rule. Segments are encoded one at a
// time so a '/' in the key stays a delimiter. S3 signs the single-encoded path,
// which is exactly what URL.pathname gives back for the string built here.
function s3ObjectUrl(config, key) {
  const bucket  = String(config.s3Bucket || '').trim();
  const region  = String(config.region || '').trim();
  const encoded = String(key || '')
    .split('/')
    .filter(function (seg) { return seg !== ''; })
    .map(s3EncodeSegment)
    .join('/');
  return 'https://' + bucket + '.s3.' + region + '.amazonaws.com/' + encoded;
}

// {databaseName}/{table_name}/data.csv -- design section 5.2. One CSV per
// table, overwritten on each export.
function athenaTableDataKey(config, tableName) {
  return String(config.databaseName || '').trim() + '/' + tableName + '/data.csv';
}

// The LOCATION a CREATE EXTERNAL TABLE must point at. Athena requires the
// containing folder, never the file, and requires the trailing slash.
function athenaTableLocation(config, tableName) {
  return 's3://' + String(config.s3Bucket || '').trim() + '/' +
         String(config.databaseName || '').trim() + '/' + tableName + '/';
}

// S3 reports errors as an XML <Error> document, not the JSON that Athena uses,
// so athenaFormatError cannot be reused here.
function s3FormatError(operation, status, bodyText) {
  const body = String(bodyText || '');
  const code = (body.match(/<Code>([^<]*)<\/Code>/) || [])[1] || '';
  const msg  = (body.match(/<Message>([^<]*)<\/Message>/) || [])[1] || '';
  const detail = (code || msg)
    ? ((code ? code + ': ' : '') + msg)
    : athenaTruncate(body, 400);
  return 'S3 ' + operation + ' failed (HTTP ' + status + '): ' + detail;
}

// Uploads one object with a signed PUT. Returns the s3:// URI on success and
// throws on any non-2xx, mirroring how athenaQuery reports failure.
//
// Content-Type is set here rather than left to fetch() on purpose. fetch()
// defaults a string body to 'text/plain;charset=UTF-8', which is not the value
// the signature was computed over, and S3 would reject that as
// SignatureDoesNotMatch. Setting it explicitly keeps signed and sent identical.
async function s3PutObject(config, key, csvString) {
  const region = String(config.region || '').trim();
  const url    = s3ObjectUrl(config, key);
  const body   = String((csvString === null || csvString === undefined) ? '' : csvString);

  const signed = await signAwsRequest(
    'PUT', url, { 'Content-Type': 'text/plain' }, body,
    athenaCredentials(config), region, 's3'
  );

  let res;
  try {
    res = await fetch(url, { method: 'PUT', headers: signed, body: body });
  } catch (e) {
    // The browser withholds CORS detail, so name the likely causes instead.
    throw new Error(
      'S3 PutObject could not reach ' + url +
      '. Check the bucket name, the region, and that the bucket has a CORS rule allowing PUT. (' +
      (e && e.message ? e.message : String(e)) + ')'
    );
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(s3FormatError('PutObject', res.status, text));
  }

  return 's3://' + String(config.s3Bucket || '').trim() + '/' + key;
}

// ---------------------------------------------------------------------------
// DDL generation (task 3.8)
// ---------------------------------------------------------------------------

// Identifiers are interpolated straight into SQL text. Table and column names
// come from SCHEMA and are trusted; databaseName comes from the settings form
// and is not, so it is checked before it reaches a statement.
function athenaAssertIdentifier(value, what) {
  const s = String(value || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    throw new Error(
      what + ' must start with a letter or underscore and contain only letters, ' +
      'numbers and underscores. Got: "' + athenaTruncate(s, 60) + '"'
    );
  }
  return s;
}

// Every column is declared STRING regardless of its SCHEMA type (design section
// 5.6). Coercion happens in the app on import, which stops Athena rejecting a
// row over an empty int or an out-of-range date.
//
// OpenCSVSerde replaces the ROW FORMAT DELIMITED shown in design section 5.9.
// tableToCSV() emits RFC 4180 quoted fields and the delimited SerDe has no
// concept of quoting, so a description containing a comma would shift every
// later column on that row. OpenCSVSerde also requires all-STRING columns,
// which the design already mandates. Decided with the user 2026-09-25.
//
// Known remaining limit: OpenCSVSerde still cannot read a newline inside a
// quoted value, because Athena splits records on newlines before the SerDe sees
// them. exportAllTables (task 3.7) must collapse newlines in values on upload.
function athenaCreateTableDDL(config, tableName) {
  const database = athenaAssertIdentifier(config.databaseName, 'Athena Database Name');
  const schema   = SCHEMA[tableName];
  if (!schema) {
    throw new Error('athenaCreateTableDDL: no SCHEMA entry for table "' + tableName + '".');
  }

  const columns = schema.cols.map(function (c) {
    return '  `' + c.name + '` STRING';
  }).join(',\n');

  return 'CREATE EXTERNAL TABLE IF NOT EXISTS `' + database + '`.`' + tableName + '` (\n' +
    columns + '\n' +
    ')\n' +
    "ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.OpenCSVSerde'\n" +
    'WITH SERDEPROPERTIES (\n' +
    "  'separatorChar' = ',',\n" +
    "  'quoteChar' = '\"',\n" +
    "  'escapeChar' = '\\\\'\n" +
    ')\n' +
    'STORED AS TEXTFILE\n' +
    "LOCATION '" + athenaTableLocation(config, tableName) + "'\n" +
    "TBLPROPERTIES ('skip.header.line.count' = '1')";
}

// ---------------------------------------------------------------------------
// Import helpers (task 3.6)
// ---------------------------------------------------------------------------

// SCHEMA tables that importAllTables does not fetch, named in the warnings so
// the caller can tell "not fetched" from "genuinely empty". Derived rather than
// hardcoded, so adding a table to SCHEMA surfaces here automatically.
// See plan decisions D4 and D7.
function athenaUnfetchedTables() {
  return Object.keys(SCHEMA).filter(function (t) {
    return ATHENA_TABLES.indexOf(t) === -1;
  });
}

// Coerce one Athena result row into an app-shaped record.
//
// This is the string-input subset of importSheet (20_data_utils.js:29). Athena
// returns every cell as a string or null -- OpenCSVSerde with all-STRING
// columns, per decision D5 -- so importSheet's Date-object and Excel-serial
// branches are unreachable here and are deliberately not reproduced. The
// type-by-type behaviour for string input matches importSheet exactly,
// including the YYYY-MM-DD normalisation of datetime and the empty-string to
// null collapse, so an Athena import and an Excel import of the same values
// produce identical records.
function athenaCoerceRecord(tableName, row) {
  const schema = SCHEMA[tableName];
  const record = {};

  schema.cols.forEach(function (col) {
    const raw = Object.prototype.hasOwnProperty.call(row, col.name) ? row[col.name] : null;

    if (raw === null || raw === undefined || String(raw).trim() === '') {
      record[col.name] = null;
      return;
    }

    const val = String(raw).trim();

    switch (col.type) {
      case 'bool':
        record[col.name] = val.toLowerCase() === 'true';
        break;
      case 'int': {
        const n = parseInt(val, 10);
        record[col.name] = isNaN(n) ? null : n;
        break;
      }
      case 'float': {
        const n = parseFloat(val);
        record[col.name] = isNaN(n) ? null : n;
        break;
      }
      case 'datetime': {
        // Same normalisation as importSheet: local date parts, never
        // toISOString, which would shift the day for anything east of UTC.
        const parsed = new Date(val);
        if (!isNaN(parsed)) {
          const y = parsed.getFullYear();
          const m = String(parsed.getMonth() + 1).padStart(2, '0');
          const d = String(parsed.getDate()).padStart(2, '0');
          record[col.name] = y + '-' + m + '-' + d;
        } else {
          record[col.name] = val;
        }
        break;
      }
      case 'str':
      case 'text':
      default:
        record[col.name] = val;
        break;
    }
  });

  return record;
}

// Coerce a whole result set, dropping rows with no primary key exactly as
// importSheet does, and reporting what was dropped rather than swallowing it.
// Returns { rows, warnings }.
function athenaCoerceTable(tableName, rawRows) {
  const schema   = SCHEMA[tableName];
  const pk       = schema.pk;
  const warnings = [];
  const rows     = [];
  let dropped    = 0;

  // A column in SCHEMA but absent from the result set means the cloud table is
  // stale relative to the app -- every value for it silently becomes null, so
  // say so once per column rather than once per row.
  if (rawRows.length) {
    const present = rawRows[0];
    schema.cols.forEach(function (col) {
      if (!Object.prototype.hasOwnProperty.call(present, col.name)) {
        warnings.push(tableName + ': column "' + col.name +
                      '" is missing from the cloud table -- imported as empty');
      }
    });
  }

  rawRows.forEach(function (raw) {
    const record = athenaCoerceRecord(tableName, raw);
    if (record[pk] === null || record[pk] === undefined) { dropped++; return; }
    rows.push(record);
  });

  if (dropped) {
    warnings.push(tableName + ': ' + dropped + ' row' + (dropped === 1 ? '' : 's') +
                  ' skipped with no ' + pk);
  }

  // Duplicate primary keys break FK resolution downstream, and the lookups in
  // 50_context.js keep only the last one silently. Same check importWorkbook
  // makes on an Excel import.
  const seen  = {};
  const dupes = [];
  rows.forEach(function (r) {
    const key = String(r[pk]);
    if (seen[key]) { if (dupes.indexOf(key) === -1) dupes.push(key); }
    seen[key] = true;
  });
  if (dupes.length) {
    warnings.push(tableName + ': duplicate ' + pk + ' value' + (dupes.length === 1 ? '' : 's') +
                  ' ' + athenaTruncate(dupes.join(', '), 120));
  }

  return { rows: rows, warnings: warnings };
}

// ---------------------------------------------------------------------------
// Connector object
// ---------------------------------------------------------------------------

const AthenaConnector = {
  id:    'athena',
  label: 'AWS Athena',

  getConfigSchema: function () {
    return ATHENA_CONFIG_SCHEMA;
  },

  // Task 3.5 -- ListWorkGroups is the cheapest authenticated Athena call and
  // touches no state, so a PASS proves region, credentials, signing and CORS
  // are all working.
  testConnection: async function (config) {
    const cfg = config || {};

    const missing = ATHENA_CONFIG_SCHEMA
      .filter(function (f) { return f.required && !String(cfg[f.key] || '').trim(); })
      .map(function (f) { return f.label; });

    if (missing.length) {
      return { ok: false, error: 'Missing required settings: ' + missing.join(', ') };
    }

    try {
      await athenaApiCall(cfg, 'ListWorkGroups', {});
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  },

  // Task 3.8 -- idempotent catalog setup: CREATE DATABASE IF NOT EXISTS, then
  // one CREATE EXTERNAL TABLE IF NOT EXISTS per entry in ATHENA_TABLES. Safe to
  // re-run at any time; it never touches data, only the catalog. Returns one
  // StepResult per step, as documented in 16_connector_base.js.
  //
  // Failure handling: if CREATE DATABASE fails the run stops, because every
  // table statement would then fail for the same reason and bury the real cause
  // under 18 identical errors. A single table failure is recorded and the run
  // continues, so one pass reports every broken table rather than just the first.
  setupDatabase: async function (config, onProgress) {
    const cfg     = config || {};
    const results = [];
    const total   = 1 + ATHENA_TABLES.length;

    const report = function (step, ok, message, error) {
      const entry = { step: step, ok: ok, message: message };
      if (!ok) entry.error = error;
      results.push(entry);
      if (typeof onProgress === 'function') onProgress(step, total, message);
      return entry;
    };

    let database;
    try {
      database = athenaAssertIdentifier(cfg.databaseName, 'Athena Database Name');
      await athenaQuery(cfg, 'CREATE DATABASE IF NOT EXISTS `' + database + '`');
      report(1, true, 'Database ' + database + ' created or already present');
    } catch (e) {
      report(
        1, false,
        'Failed to create database ' + (String(cfg.databaseName || '').trim() || '(not set)'),
        (e && e.message) ? e.message : String(e)
      );
      return results;
    }

    for (let i = 0; i < ATHENA_TABLES.length; i++) {
      const tableName = ATHENA_TABLES[i];
      const step      = i + 2;
      try {
        await athenaQuery(cfg, athenaCreateTableDDL(cfg, tableName));
        report(step, true, 'Table ' + database + '.' + tableName + ' created or already present');
      } catch (e) {
        report(
          step, false,
          'Failed to create table ' + database + '.' + tableName,
          (e && e.message) ? e.message : String(e)
        );
      }
    }

    return results;
  },

  // --- Import (task 3.6) ---------------------------------------------------
  //
  // 20 steps: connect, then one SELECT per table, then completion -- the step
  // numbering of design section 5.7.
  //
  // Every table is attempted even after one fails, so a single run diagnoses
  // every problem, and `ok` is false if any did (decision D6). `data` is
  // therefore always partial on failure and must not be applied to local state
  // unless `ok` is true. `data` holds only the ATHENA_TABLES set, never the
  // four later SCHEMA additions, which are named in `warnings` (decision D7).
  importAllTables: async function (config, onProgress) {
    const cfg          = config || {};
    const data         = {};
    const warnings     = [];
    const failedTables = [];
    const total        = ATHENA_TABLES.length + 2;

    const report = function (step, message) {
      if (typeof onProgress === 'function') onProgress(step, total, message);
    };

    // Step 1: fail on bad credentials here rather than 18 queries later.
    report(1, 'Connecting to AWS');
    const database = athenaAssertIdentifier(cfg.databaseName, 'Athena Database Name');
    const probe    = await AthenaConnector.testConnection(cfg);
    if (!probe.ok) {
      throw new Error('Cannot connect to AWS: ' + probe.error);
    }

    for (let i = 0; i < ATHENA_TABLES.length; i++) {
      const tableName = ATHENA_TABLES[i];
      report(i + 2, 'Importing ' + tableName);

      try {
        // Fully qualified, no QueryExecutionContext -- decision D1.
        const queryId = await athenaQuery(
          cfg, 'SELECT * FROM `' + database + '`.`' + tableName + '`'
        );
        const rawRows  = await athenaGetResults(cfg, queryId);
        const coerced  = athenaCoerceTable(tableName, rawRows);
        data[tableName] = coerced.rows;
        coerced.warnings.forEach(function (w) { warnings.push(w); });
      } catch (e) {
        failedTables.push(tableName);
        warnings.push(tableName + ': import failed -- ' + ((e && e.message) ? e.message : String(e)));
      }
    }

    const unfetched = athenaUnfetchedTables();
    if (unfetched.length) {
      warnings.push('Not held in the cloud database, so left untouched by this import: ' +
                    unfetched.join(', '));
    }

    const loaded = ATHENA_TABLES.length - failedTables.length;
    report(total, failedTables.length
      ? 'Finished with errors -- ' + loaded + ' of ' + ATHENA_TABLES.length + ' tables loaded'
      : 'Complete -- ' + loaded + ' tables loaded');

    return {
      ok:           failedTables.length === 0,
      data:         data,
      warnings:     warnings,
      failedTables: failedTables,
    };
  },

  // --- Not yet implemented (plan task 3.7) ---------------------------------

  exportAllTables: async function () {
    throw new Error('AthenaConnector.exportAllTables is not implemented yet (plan task 3.7).');
  },
};

// Registration (task 3.9). Runs at load time, which is why 16_connector_base.js
// must be numbered below this file.
ConnectorRegistry['athena'] = AthenaConnector;
