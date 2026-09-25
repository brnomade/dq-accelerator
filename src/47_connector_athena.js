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

  // --- Not yet implemented (plan tasks 3.6, 3.7, 3.8) ----------------------
  setupDatabase: async function () {
    throw new Error('AthenaConnector.setupDatabase is not implemented yet (plan task 3.8).');
  },

  importAllTables: async function () {
    throw new Error('AthenaConnector.importAllTables is not implemented yet (plan task 3.6).');
  },

  exportAllTables: async function () {
    throw new Error('AthenaConnector.exportAllTables is not implemented yet (plan task 3.7).');
  },
};

// Registration (task 3.9). Runs at load time, which is why 16_connector_base.js
// must be numbered below this file.
ConnectorRegistry['athena'] = AthenaConnector;
