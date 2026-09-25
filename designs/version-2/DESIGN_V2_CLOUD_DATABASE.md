# DESIGN_V2_CLOUD_DATABASE — V2 Cloud Database Integration

**Version:** 2.0-alpha  
**Date:** 2026-09-24  
**Status:** Approved for implementation  

---

## 1. Context and scope

Version 2 of the DQ Accelerator introduces a cloud database integration layer. The Master Steward can import the full dataset directly from a cloud-hosted database (instead of loading a master JSON file) and export the merged dataset back to the cloud database (instead of only exporting a local ZIP/CSV). All other workflows — steward delta export, master merge, file-based import/export — remain unchanged.

This is an additive change only. No existing screen, route, or data flow is removed or modified.

### In scope

- AWS Athena as first supported connector
- Master-only: cloud import and cloud export features are invisible to stewards
- New **Database Settings** screen for connector configuration and one-time database setup
- New **Import from Database** tab in the existing Import screen
- New **Export to Database** tab in the existing Export screen
- Connector abstraction supporting future connectors (Azure Synapse, Google BigQuery)

### Out of scope

- Azure Synapse connector implementation (design supports it; implementation is future work)
- Google BigQuery connector implementation (same)
- S3 bucket creation (pre-existing bucket is assumed; app creates database and tables only)
- Backend server or persistent API layer

---

## 2. Master workflow (V2)

```
[Athena DB in AWS]
       │
       │  ← Import from Database (new, master only)
       ▼
[Master browser state]
       │
       ├──→ Export master JSON ──→ [Stewards download]
       │                                   │
       │                    [Steward imports master JSON]
       │                    [Steward edits data]
       │                    [Steward exports delta JSON]
       │                                   │
       │    [Master imports delta JSON] ←──┘
       │    [Master resolves conflicts]
       │    [Master merges changes]
       │
       └──→ Export to Database (new, master only)
              │
              ▼
       [Athena DB in AWS]
```

The base snapshot (used for steward delta detection) is reset whenever the master imports from the database — exactly as it is reset when loading a master JSON file.

Steward workflow is **unchanged end-to-end**. Stewards never interact with Athena.

---

## 3. Architecture overview

### 3.1 Connector pattern

All cloud database operations are abstracted behind a `ConnectorRegistry`. The UI (Database Settings screen, Import tab, Export tab) is entirely generic — it renders from the active connector's declared config schema and calls standard connector methods. Adding a future connector requires only a new connector file and one registry entry; no UI code changes.

```
ConnectorRegistry = {
  athena:   AthenaConnector,
  // future:
  // synapse:  SynapseConnector,
  // bigquery: BigQueryConnector,
}
```

### 3.2 Connector interface

Every connector implements:

```js
{
  id: string,     // 'athena'
  label: string,  // 'AWS Athena'

  // Field definitions rendered dynamically in the settings form
  getConfigSchema(): FieldDef[],

  // Validate credentials and connectivity; does not modify state
  testConnection(config): Promise<{ ok: bool, error?: string }>,

  // Idempotent DDL: creates database + all 18 tables if not already present
  setupDatabase(config, onProgress): Promise<StepResult[]>,

  // Pull all 18 tables; return app-shaped data + any warnings
  importAllTables(config, onProgress): Promise<{ data: object, warnings: string[] }>,

  // Push all 18 tables with connector-specific write strategy
  // Athena uses DROP+CREATE; future connectors may use upsert/merge
  exportAllTables(config, data, onProgress): Promise<{ ok: bool, failedTables: string[] }>,
}

// onProgress(step: number, total: number, message: string)
// StepResult: { step: number, ok: bool, message: string, error?: string }
// FieldDef:   { key: string, label: string, type: 'text'|'password', required: bool, placeholder?: string }
```

### 3.3 HTTP transport — no SDK

All AWS API calls are made via the browser's native `fetch` API with **AWS Signature Version 4** signing implemented in `15_aws_sigv4.js` using `SubtleCrypto` (built into all modern browsers). No external SDK is loaded; the app bundle stays small.

> **CORS: validated 2026-09-24, no proxy required.** Browser `fetch` calls to Athena's API endpoint and to S3 both require `Access-Control-Allow-Origin` headers. The spike test (`tests/spike_athena_cors.py`) confirmed all 6 checks PASS against region `eu-west-1`: both `athena.eu-west-1.amazonaws.com` and the S3 bucket endpoint return `Access-Control-Allow-Origin: *`, and authenticated Athena `ListWorkGroups` plus S3 `PutObject`/`GetObject`/`DeleteObject` all succeeded. Full output: `designs/version-2/spike-results.txt`. The local Python proxy fallback contemplated in the first draft is therefore **not** being built.
>
> One-time client prerequisite: S3 bucket CORS is opt-in per bucket, so the target bucket needs a CORS rule (AllowedOrigin `*`, AllowedMethod GET/PUT/DELETE/HEAD, AllowedHeader `*`) before the app can reach it.

---

## 4. New screen: Database Settings

**Route:** `screen:database-settings`  
**Source file:** `217_screen_db_settings.js`  
**Visibility:** Master only  
**Sidebar group:** Database Actions (existing group)

### Sections

**Connection**
- Connector selector dropdown (AWS Athena; extensible)
- Dynamic config form rendered from `connector.getConfigSchema()`
- Test Connection button → inline PASS / FAIL result
- Save settings button → persists to localStorage key `moj_dq_db_config_v1`

**Database Setup** *(visible only after a successful test connection)*
- Description: lists what will be created (database name, 18 tables)
- Setup Database button → runs `connector.setupDatabase()`
- Step-by-step progress log output

**Saved Settings**
- Clear saved credentials button (removes `moj_dq_db_config_v1` from localStorage)

---

## 5. Athena connector

### 5.1 Config schema fields

| Field | Key | Type | Required | Notes |
|---|---|---|---|---|
| AWS Region | `region` | text | yes | e.g. `eu-west-2` |
| Access Key ID | `accessKeyId` | text | yes | IAM user or assumed-role |
| Secret Access Key | `secretAccessKey` | password | yes | masked |
| Session Token | `sessionToken` | password | no | for STS / SSO / assumed-role temporary credentials; leave blank for long-lived IAM keys |
| S3 Bucket | `s3Bucket` | text | yes | pre-existing; app does not create it |
| Athena Database Name | `databaseName` | text | yes | e.g. `dq_accelerator` |
| Athena Workgroup | `workgroup` | text | yes | defaults to `primary` |
| Query Results S3 Prefix | `queryResultsPrefix` | text | yes | path within bucket where Athena writes result files, e.g. `athena-results/` |

Stored in localStorage under key `moj_dq_db_config_v1`. **Never written** to master JSON exports, delta files, ZIP bundles, or any downloadable artifact.

### 5.2 S3 layout convention

```
s3://{s3Bucket}/
  {databaseName}/
    {table_name}/
      data.csv                  ← one CSV per table; overwritten on each export
  {queryResultsPrefix}/
    {query-execution-id}.csv    ← Athena-managed result files; read during import
```

### 5.3 SigV4 signing (`15_aws_sigv4.js`)

Exports a single async function used by all Athena and S3 calls:

```js
async function signAwsRequest(method, url, headers, body, credentials, region, service)
// Returns: augmented headers object with Authorization, X-Amz-Date,
//          X-Amz-Content-Sha256, and X-Amz-Security-Token (if session token present)
```

Signing chain uses only `SubtleCrypto`:
- `SubtleCrypto.digest('SHA-256', data)` for payload hash and string-to-sign hash
- `SubtleCrypto.sign({ name: 'HMAC', hash: 'SHA-256' }, key, data)` for the four-step signing key derivation and final signature

### 5.4 Athena API calls

All calls: `POST https://athena.{region}.amazonaws.com/`  
Headers: `Content-Type: application/x-amz-json-1.1`, `X-Amz-Target: AmazonAthena.{Operation}`

| Operation | X-Amz-Target | Body |
|---|---|---|
| Test connection | `AmazonAthena.ListWorkGroups` | `{}` |
| Run DDL or SELECT | `AmazonAthena.StartQueryExecution` | `{ QueryString, ResultConfiguration: { OutputLocation }, WorkGroup }` |
| Poll query status | `AmazonAthena.GetQueryExecution` | `{ QueryExecutionId }` |
| Fetch results page | `AmazonAthena.GetQueryResults` | `{ QueryExecutionId, NextToken? }` |

Poll interval: 250 ms. Query timeout: 60 s per table.

> **Amended 2026-09-25 (decision D1 in the plan).** `QueryExecutionContext` is deliberately omitted from every `StartQueryExecution` body. The first draft of this section included `QueryExecutionContext: { Database }`, but that cannot work for `CREATE DATABASE IF NOT EXISTS` in section 5.9 — Athena rejects a context naming a database that does not yet exist. Rather than special-casing that one statement, no statement sends a context and every statement fully qualifies its table as `{databaseName}.{table_name}`. All DDL and SELECT strings in sections 5.7, 5.8 and 5.9 are already written fully qualified, so this is a single code path with no call-site change.

### 5.5 S3 API calls

| Operation | HTTP method | URL pattern |
|---|---|---|
| Upload table CSV | PUT | `https://{s3Bucket}.s3.{region}.amazonaws.com/{databaseName}/{table_name}/data.csv` |

Content-Type: `text/plain`. Body: CSV string from existing `tableToCSV()`.

### 5.6 Data type mapping

All columns in Athena DDL are declared as `STRING`, regardless of the app's internal type (`int`, `float`, `bool`, `datetime`, `text`). Type coercion is applied in the app on import using the existing `importSheet` parsing logic. This avoids Athena rejecting CSV rows with nulls or edge-case values.

### 5.7 Import flow

20 steps total (2 overhead + 18 tables), serial execution.

```
Step  1 / 20   Connecting to AWS…
Step  2 / 20   Importing critical_data_set…
Step  3 / 20   Importing critical_data_element…
               …
Step 19 / 20   Importing criticality_level…
Step 20 / 20   Complete — 18 tables loaded.
```

Per-table steps:
1. `StartQueryExecution`: `SELECT * FROM {databaseName}.{table_name}`
2. Poll `GetQueryExecution` until status is `SUCCEEDED` or `FAILED`
3. `GetQueryResults` paginated (1 000 rows / call) → accumulate all rows
4. Parse rows using existing `importSheet` type-coercion logic
5. `onProgress(step, 20, tableName)`

On success: replaces full local state and **resets the base snapshot** — the Athena dataset becomes the new delta baseline for steward delta tracking. Behaviour is identical to importing a master JSON file.

### 5.8 Export flow with retry

20 steps total (2 overhead + 18 tables), serial execution.

Per-table retry policy:

```
Attempt 1 → FAIL → wait 2 s → Attempt 2 → FAIL → wait 5 s → Attempt 3 → FAIL → mark FAILED
```

Each attempt covers the full per-table sequence as a unit:
1. S3 `PutObject`: upload `tableToCSV(tableName, data)` to `s3://{s3Bucket}/{databaseName}/{table_name}/data.csv`
2. `StartQueryExecution`: `DROP TABLE IF EXISTS {databaseName}.{table_name}`; poll to completion
3. `StartQueryExecution`: `CREATE EXTERNAL TABLE {databaseName}.{table_name} (...)  LOCATION 's3://...'`; poll to completion

**All-or-nothing rule:** if any table fails all 3 attempts, the overall export is marked failed. The UI displays which tables failed and their error details. The master must retry the entire export. Because each table export is DROP + CREATE, a clean full retry is always safe — previously-succeeded tables are simply overwritten.

The progress bar shows a retry indicator (e.g. "Exporting data_quality_rule… (retry 2/3)") during retry attempts.

### 5.9 Setup Database flow

Idempotent — safe to re-run at any time.

1. `StartQueryExecution`: `CREATE DATABASE IF NOT EXISTS {databaseName}`; poll to completion
2. For each of the 18 tables in SCHEMA order:  
   ```sql
   CREATE EXTERNAL TABLE IF NOT EXISTS {databaseName}.{table_name} (
     col1 STRING, col2 STRING, ...   -- all columns STRING regardless of app type
   )
   ROW FORMAT DELIMITED
   FIELDS TERMINATED BY ','
   LINES TERMINATED BY '\n'
   STORED AS TEXTFILE
   TBLPROPERTIES ('skip.header.line.count'='1')
   LOCATION 's3://{s3Bucket}/{databaseName}/{table_name}/'
   ```
3. `onProgress` called after each step

---

## 6. Import screen changes

**File:** `210_screen_import.js`

Add one new tab visible to master only: **Import from Database**

Tab content:
- Connector status indicator (configured with saved credentials / not configured → link to Database Settings)
- Import button (disabled if connector not configured)
- Progress bar: step N of 20, current table name, spinner
- On success: row-count summary per table
- On error: step-level error message with full detail

---

## 7. Export screen changes

**File:** `230_screen_export.js`

Add one new tab visible to master only: **Export to Database**

Tab content:
- Connector status indicator
- Export button (disabled if connector not configured)
- Progress bar: step N of 20, current table name, retry indicator if retrying
- On success: row-count summary per table
- On error: list of failed tables with error detail; instruction to retry full export

---

## 8. Source file changes

### New files

| File | Contents | Load-order dependencies |
|---|---|---|
| `15_aws_sigv4.js` | `signAwsRequest()` async function; SigV4 via SubtleCrypto | none (pure `SubtleCrypto` + JS builtins) |
| `16_connector_base.js` | `ConnectorRegistry` map; `FieldDef` and `StepResult` type comments | none |
| `47_connector_athena.js` | Full `AthenaConnector` implementation | `10_constants.js` (`SCHEMA`), `15_aws_sigv4.js`, `16_connector_base.js`, `20_data_utils.js` (`coerceValue`), `40_storage.js` (`tableToCSV`) |
| `217_screen_db_settings.js` | `DatabaseSettingsScreen` component | `16_connector_base.js`, `47_connector_athena.js` |

### Numbering rationale

The two foundation files sit in the low band rather than the 200s. `signAwsRequest()` and `ConnectorRegistry` have no dependencies whatsoever, so numbering them next to the screen files would imply a dependency chain that does not exist. `47_connector_athena.js` sits immediately after the existing utility band (20-46) because it consumes `SCHEMA`, `coerceValue` and `tableToCSV`. Only the React screen remains in the 200s, alongside the other screens.

Two properties of `build/build.py` make the low numbers safe: its `sort_key` orders by the leading integer via `int()`, so no zero-padding is required for a low number to sort correctly; and CSS and JS are globbed separately into the `<style>` and `<script>` blocks, so a JS file numbered below 10 never competes with `00_styles.css`.

**Load-time vs runtime dependencies.** The only hard load-order constraint in this set is that `16_connector_base.js` must be evaluated before `47_connector_athena.js`, because the registration line `ConnectorRegistry['athena'] = AthenaConnector` runs at load time. Every other reference in this feature resolves at runtime inside a function body, long after all files have loaded -- including the Import and Export screens calling connector methods from event handlers, and the connector calling `signAwsRequest()`.

### Existing files modified

| File | Change |
|---|---|
| `210_screen_import.js` | Add "Import from Database" tab (master-only) |
| `230_screen_export.js` | Add "Export to Database" tab (master-only) |
| `80_sidebar.js` | Add "Database Settings" entry in Database Actions group |
| `240_app.js` | Add `screen:database-settings` route |
| `build/template.html` | No change |

---

## 9. localStorage changes

| Key | Change |
|---|---|
| `moj_dq_db_config_v1` | New key — stores active connector ID + connector config (credentials included) |

No existing key is modified.

---

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Athena API endpoint does not return CORS headers | ~~Medium~~ **RESOLVED** | High | Spike test (2026-09-24) confirmed `Access-Control-Allow-Origin: *` on `athena.eu-west-1.amazonaws.com`. Direct browser fetch() is viable. No proxy required. |
| S3 bucket CORS not configured | ~~Medium~~ **RESOLVED** | High | Spike test (2026-09-24) confirmed S3 CORS preflight passes once bucket CORS rule is applied (AllowedOrigin: *, AllowedMethod: GET/PUT/DELETE/HEAD). One-time setup step for the client. |
| `SubtleCrypto` unavailable | Very low | High | Only absent on plain `http://` origins; app already requires a modern browser |
| Athena query timeout on large tables | Low | Low | DQ metadata tables are small (hundreds of rows); 60 s timeout is generous |
| Session token expiry mid-operation | Low | Medium | UI prompts to re-enter credentials; operation can be retried cleanly |
| Partial export leaves Athena inconsistent | Low | Medium | All-or-nothing retry policy + DROP+CREATE idempotence means a full retry always recovers |

---

## 11. Future connectors

| Cloud | Service | Auth model | Write strategy |
|---|---|---|---|
| Azure | Synapse Analytics Serverless SQL Pool | Service principal or SAS token | DROP + CREATE EXTERNAL TABLE (ADLS Gen2-backed; near-identical to Athena) |
| GCP | BigQuery | Service account JSON key | `INSERT OVERWRITE` or `MERGE` (native storage; upsert supported) |

The `exportAllTables` interface explicitly supports both DROP+CREATE (Athena, Synapse) and upsert (BigQuery) — the calling code in the Export tab is connector-agnostic.
