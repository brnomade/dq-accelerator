# CHANGELOG_V2.md

Changes for DQ Accelerator **v2** — Cloud Database Integration line.

For v1 history see `CHANGELOG.md`.

---

## build-20260925-1735 - V2 Phase 3 (part): Athena import, and 3.11 smoke test passed

**Plan:** `plans/PLAN_V2_CLOUD_DATABASE.md` (Phase 3, tasks 3.6 and 3.11; new decisions D6 and D7)
**Design:** `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` (sections 5.5 and 5.7, both amended)
**Branch:** `feature/athena-connector-transfer`

### Added
- `src/47_connector_athena.js` - **`AthenaConnector.importAllTables(config, onProgress)`** (task 3.6), replacing the "not implemented yet" stub. 20 steps: connect, then one `SELECT * FROM` per table, then completion. Each table runs `athenaQuery` + `athenaGetResults` and coerces the result into app-shaped records. All SQL is fully qualified and no `QueryExecutionContext` is sent (decision D1).
  - Step 1 calls `testConnection` before any table is read, so bad credentials fail in one round trip instead of eighteen.
  - **Failure handling** (decision D6). Every table is attempted even after one fails, so a single run diagnoses every problem rather than only the first. The result carries `ok: false` and `failedTables` when any table failed. This widens the design's return contract from `{ data, warnings }` to `{ ok, data, warnings, failedTables }`.
  - New `athenaCoerceRecord(tableName, row)` is the string-input subset of `importSheet` (`20_data_utils.js:29`). Athena returns every cell as a string or null, so `importSheet`'s Date-object and Excel-serial branches are unreachable here and are deliberately not reproduced. Behaviour for string input matches `importSheet` exactly, including the `YYYY-MM-DD` datetime normalisation from local date parts - never `toISOString`, which shifts the day east of UTC - and the empty-string-to-null collapse. An Athena import and an Excel import of the same values therefore produce identical records.
  - New `athenaCoerceTable(tableName, rawRows)` drops rows with no primary key exactly as `importSheet` does, but reports what it dropped instead of swallowing it. It also warns on a `SCHEMA` column missing from the cloud table (once per column, not once per row - every value for it silently becomes null) and on duplicate primary keys, which break FK resolution because the lookup maps in `50_context.js` keep only the last occurrence.
  - New `athenaUnfetchedTables()` names the `SCHEMA` tables this connector does not hold. Derived from `ATHENA_TABLES` rather than hardcoded, so a future `SCHEMA` addition surfaces here automatically.

### Changed
- `src/16_connector_base.js` - the `importAllTables` interface contract updated for decisions D6 and D7: the return shape, the rule that callers must apply nothing unless `ok` is true, and the rule that `data` may legitimately omit tables and so must be merged rather than assigned.
- `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` - section 5.5's interface signature and section 5.7's success behaviour amended for D6 and D7. Section 5.7 previously said a successful import "replaces full local state"; it now records that only the 18 fetched tables are replaced.
- `plans/PLAN_V2_CLOUD_DATABASE.md` - tasks 3.6 and 3.11 ticked; decisions D6 and D7 added; status line updated.
- `APP_TREE.md` - `47_connector_athena.js` entry updated with `importAllTables` and the three new import helpers.

### Tested
- **Task 3.11 browser smoke test PASSED** (2026-09-25, build-20260925-1718) against live AWS in `eu-west-1`, served over `http://localhost`. This closes out tasks 3.4 and 3.8.
  - `s3PutObject` returned `s3://dq-accelerator-metada-store-512798217240-eu-west-1-an/smoke-test/probe.csv` with no CORS block. This is the first write to S3 from a real browser origin - the Phase 0 spike only simulated an `Origin` header from Python, so the bucket CORS rule is proven for the first time here.
  - `athenaCreateTableDDL` output reviewed and correct.
  - `setupDatabase` returned 19 steps, all `ok: true`, in `ATHENA_TABLES` order - 1 database plus 18 tables, confirming decision D4 holds and the four later `SCHEMA` additions are absent.
  - A second identical run returned the same 19 successes, proving the `IF NOT EXISTS` idempotency.

### Known limitations
- `importAllTables` is not yet reachable from the UI - the Import screen tab is Phase 5. It is callable from the browser console and awaits the task 3.12 smoke test.
- `exportAllTables` (task 3.7) remains stubbed, so a full round trip cannot be tested yet.
- Per decision D7, `source_table_ddl`, `field_profiling`, `shortlist_group` and `cde_shortlist_tag` are absent from the returned `data` and are named in `warnings`. Phase 5 must merge the result into existing state, not assign over it, or local profiling data and shortlist groups would be lost on every database import.

---

## build-20260925-1707 - V2 Phase 3 (part): S3 upload + Athena database setup

**Plan:** `plans/PLAN_V2_CLOUD_DATABASE.md` (Phase 3, tasks 3.4 and 3.8; new decisions D4 and D5; two new constraints on task 3.7)
**Design:** `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` (sections 5.5 and 5.9, section 5.9 amended)
**Branch:** `feature/athena-connector-operations`

### Added
- `src/47_connector_athena.js` - **`s3PutObject(config, key, csvString)`** (task 3.4). Signed `PUT` to the virtual-hosted endpoint `https://{bucket}.s3.{region}.amazonaws.com/{key}`, `Content-Type: text/plain`. Returns the `s3://` URI on success; throws on any non-2xx. This is the first code in the app that writes to S3 from the browser.
  - `Content-Type` is set explicitly rather than left to `fetch()`. `fetch()` defaults a string body to `text/plain;charset=UTF-8`, which is not the value the signature was computed over, and S3 rejects the mismatch as `SignatureDoesNotMatch` with no useful detail.
  - New `s3EncodeSegment()` encodes key path segments to RFC 3986, adding the `!'()*` characters that `encodeURIComponent` leaves alone but SigV4 expects percent-encoded. Segments are encoded individually so a `/` in the key stays a delimiter.
  - New `s3FormatError()` parses S3's XML `<Error>` document for `<Code>` and `<Message>`. `athenaFormatError` could not be reused - Athena returns JSON, S3 returns XML.
  - New `s3ObjectUrl()`, `athenaTableDataKey()` and `athenaTableLocation()` implement the design section 5.2 layout: `{databaseName}/{table_name}/data.csv` for the object, and the containing folder with a trailing slash for a `CREATE EXTERNAL TABLE` `LOCATION`.
- `src/47_connector_athena.js` - **`AthenaConnector.setupDatabase(config, onProgress)`** (task 3.8), replacing the "not implemented yet" stub. 19 steps: `CREATE DATABASE IF NOT EXISTS`, then one `CREATE EXTERNAL TABLE IF NOT EXISTS` per table. Idempotent - it touches the catalog only, never data, so it is safe to re-run at any time. Returns one `StepResult` per step as documented in `16_connector_base.js`, and calls `onProgress(step, 19, message)` after each.
  - **Failure handling.** A failed `CREATE DATABASE` aborts the run: all 18 table statements would fail for the same reason and bury the real cause under 18 identical errors. A failed individual table is recorded and the run continues, so a single pass reports every broken table rather than only the first.
  - New `athenaCreateTableDDL(config, tableName)` generates the statement from `SCHEMA[table].cols` with every column declared `STRING` (design section 5.6).
  - New `athenaAssertIdentifier()` validates `databaseName` against `/^[A-Za-z_][A-Za-z0-9_]*$/` before it is interpolated into SQL. Table and column names come from `SCHEMA` and are trusted; `databaseName` comes from the settings form and is not.
- `src/47_connector_athena.js` - **`ATHENA_TABLES`**, the authoritative list of the 18 tables published to the cloud database. See decision D4 below for why it is an explicit list rather than `Object.keys(SCHEMA)`. A load-time check logs to the console if any name in it is missing from `SCHEMA`; it logs rather than throws because this file is concatenated into a single bundle with the whole app, and a throw would take down every screen over a cloud-database-only problem.

### Changed
- `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` - section 5.9's DDL block amended to `OpenCSVSerde` (decision D5), with the two write-side limits it cannot fix recorded against section 5.8. A second amendment note pins what "18 tables" means throughout the document (decision D4).
- `plans/PLAN_V2_CLOUD_DATABASE.md` - tasks 3.4 and 3.8 ticked; decisions D4 and D5 added; two new Phase 3 key constraints added against task 3.7; new task 3.11 added with the browser smoke-test steps for this build.
- `APP_TREE.md` - `47_connector_athena.js` entry updated with the new helpers and the `ATHENA_TABLES` constant.

### Decisions recorded

Two gaps between the design and the current codebase were found before any DDL was written, and resolved with the user.

- **D4 - the cloud database holds 18 tables, not 22.** The design and plan both say "18 tables", but `SCHEMA` has grown to 22 entries since the design was written, and every existing export path (`230_screen_export.js`, `232_uploader_export.js`, `40_storage.js`) enumerates `Object.keys(SCHEMA)`. A literal reading of the design's "generate DDL from SCHEMA" constraint would therefore have created 22 tables and a 23-step setup. Decision: only the original 18, held as the explicit `ATHENA_TABLES` array. **Consequence:** `shortlist_group` and `cde_shortlist_tag` do not survive an Athena round trip, and `source_table_ddl` and `field_profiling` stay local-only.
- **D5 - `OpenCSVSerde` instead of `ROW FORMAT DELIMITED`.** `tableToCSV()` (`40_storage.js:11`) emits RFC 4180 quoted fields, but design section 5.9 specified the delimited SerDe, which has no concept of quoting. Against real data that corrupts silently - a `data_set_description` of `Offenders, victims and cases` splits into two columns and shifts every later field on the row, and quoted values keep their literal `"` characters. At least five free-text columns in the 18-table set are exposed. `OpenCSVSerde` reads the quoting correctly and requires all-`STRING` columns, which the design already mandates, so it is a drop-in swap.

### Known limits carried forward to task 3.7

`OpenCSVSerde` fixes commas and quotes. Two write-side problems remain, and neither can be fixed by any SerDe choice - both are now recorded as task 3.7 constraints in the plan:

- **Newlines inside a value.** Athena's `TextInputFormat` splits records on newlines before the SerDe sees them, so a multi-line description becomes two broken rows. `exportAllTables` must replace `\r\n` and `\n` in each value with a space. Multi-line text loses its line breaks; nothing else corrupts.
- **Backslashes inside a value.** `OpenCSVSerde`'s `escapeChar` is `\` and cannot be disabled, so a literal backslash consumes the character after it on read. `tableToCSV()` doubles `"` but does not touch `\`. `exportAllTables` must double backslashes. Most likely to bite on regex patterns in `data_quality_rule`.

### Not included
- Tasks 3.6 `importAllTables` and 3.7 `exportAllTables` remain stubbed and still throw a named "not implemented yet" error.
- No user-facing change. Nothing is wired into the UI - `setupDatabase` is reachable only from the browser console until the Database Settings screen lands in Phase 4 - so there is no user documentation change in this build.

### Verification status - NOT YET TESTED
Build is ASCII-clean and bundles. **Plan task 3.11 is outstanding** and is the first real browser preflight against S3: the Phase 0 spike only simulated an `Origin` header from Python, so the bucket CORS rule on `dq-accelerator-metada-store-512798217240-eu-west-1-an` is exercised by a real browser for the first time here. The user confirmed on 2026-09-25 that the rule is applied. Smoke-test steps are in the plan under "Task 3.11 smoke test steps" - note the bundle must be served over `http://localhost`, because a `file://` origin is `null` and S3 CORS will reject it.

---


## build-20260925-1619 - Fix: StartQueryExecution requires ClientRequestToken

**Plan:** `plans/PLAN_V2_CLOUD_DATABASE.md` (Phase 3, task 3.2; constraint added to task 3.7)
**Branch:** `feature/athena-connector-core`
**Found by:** plan task 3.10 browser smoke test against live Athena, region eu-west-1

### Fixed
- `src/47_connector_athena.js` - `athenaQuery()` now sends a `ClientRequestToken` on every `StartQueryExecution`. Without it the raw API returns `HTTP 400 InvalidRequestException: clientRequestToken is null or empty` and no query ever starts.
  - AWS documents `ClientRequestToken` as *not required* purely because the official SDKs generate one silently on the caller's behalf. Any client calling the API directly - as this app does, by design, with no SDK - must supply it. The Phase 0 spike did not catch this because it only ever called `ListWorkGroups`.
  - New helper `athenaClientRequestToken()` returns `'dq-' + crypto.randomUUID()` (39 chars), falling back to `'dq-' + 32 hex chars` from `crypto.getRandomValues` (35 chars) if `randomUUID` is unavailable. Both satisfy the API's 32-128 character `[a-zA-Z0-9-_]` constraint.

### Changed
- `plans/PLAN_V2_CLOUD_DATABASE.md` - a new first entry in the Phase 3 key constraints records the token requirement **and its consequence for the task 3.7 retry logic**: Athena treats a repeated token as a repeat of the original request and returns the first `QueryExecutionId` instead of re-running the query. A retry that reused a token would therefore silently hand back the failure it was meant to replace. Because `athenaQuery` mints a fresh token per call, a retry that re-invokes `athenaQuery` is already correct; a retry that caches and replays a request payload would not be. Task 3.2 annotated with the amendment; task 3.10 ticked PASS after the live re-test.
- `.gitignore` (new) - the repo had none. `dist/` is now ignored and its 89 previously tracked files (`dq-accelerator.html` plus 88 zips) untracked with `git rm --cached`. The folder is generated entirely by `build/build.py` from `src/` and `build/template.html`, so it is reproducible and does not belong in the repo, and it was churning a ~1 MB bundle into every diff. Files are untouched on disk. This does not rewrite history - the previously committed bundles remain in earlier commits.
- `DEVELOPER_ONBOARDING.md` - records that `dist/` is gitignored, so a fresh clone has no runnable app until `build.py` is run. Noted in both the prerequisites table and the build step.

### Not included
No user-facing change - still nothing wired into the UI, so no user documentation change.

### Re-test (task 3.10) - PASS 2026-09-25
Verified against live Athena in `eu-west-1` from `http://localhost`. `testConnection` returns `{ ok: true }`. The previously failing step now returns QueryExecutionId `2a70d9ec-...` and exactly one row `{ one: '1', two: 'abc' }`, which confirms the token fix, decision D1 (no `QueryExecutionContext` sent, table-less SELECT accepted) and the repeated-header-row suppression in `athenaGetResults` (1 row returned, not 2).

The step, unchanged:

```js
const id = await athenaQuery(cfg, 'SELECT 1 AS one, 'abc' AS two');
const rows = await athenaGetResults(cfg, id);
console.log(id, rows);
// expect one row: [{ one: '1', two: 'abc' }]
```

Two things this now also proves if it passes: that decision D1 holds (no `QueryExecutionContext` sent, and a table-less SELECT is still accepted), and that the header-row suppression in `athenaGetResults` works against real Athena output.

---

## build-20260925-1600 - Phase 2 + Phase 3 (part): Athena connector core

**Design:** `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` (sections 3.1, 3.2, 5.1, 5.4)
**Plan:** `plans/PLAN_V2_CLOUD_DATABASE.md` (Phase 2; Phase 3 tasks 3.1, 3.2, 3.3, 3.5, 3.9)
**Branch:** `feature/athena-connector-core`

### Added
- `src/16_connector_base.js` (Phase 2) - `ConnectorRegistry` plus the `FieldDef`, `StepResult`, `onProgress` and connector-interface contracts as comments. Zero dependencies. It must load before any connector file because registration runs at load time; this is the only hard load-order constraint in the feature.
- `src/47_connector_athena.js` (Phase 3, part) - `AthenaConnector`, registered as `ConnectorRegistry['athena']`.
  - `getConfigSchema()` (task 3.1) - all 8 fields from design section 5.1, with `secretAccessKey` and `sessionToken` typed `password` so the Phase 4 form masks them.
  - `athenaApiCall(config, operation, payload)` - the single signed POST that every Athena operation goes through. Distinguishes an AWS error response (parses the JSON 1.1 `__type` / `message` body) from an unreachable endpoint (a `fetch` rejection, which the browser reports without detail, so the message names the likely causes instead).
  - `athenaQuery(config, queryString)` (task 3.2) - StartQueryExecution then poll GetQueryExecution at 250 ms to a 60 s timeout. Returns the bare `QueryExecutionId`. Throws with Athena's `StateChangeReason` on FAILED or CANCELLED, and with the last observed state on timeout; the offending SQL is appended to both, truncated to 200 characters.
  - `athenaGetResults(config, queryExecutionId)` (task 3.3) - paginated GetQueryResults, 1 000 rows per call, returning plain row objects keyed by column name. Values stay raw strings; type coercion belongs to `importAllTables` (task 3.6).
  - `testConnection(config)` (task 3.5) - checks the required fields are present for a readable error, then calls ListWorkGroups. Returns `{ ok: true }` or `{ ok: false, error }` exactly as the design interface specifies.
  - `setupDatabase`, `importAllTables` and `exportAllTables` are present but throw a named "not implemented yet" error citing their plan task. They exist so the connector satisfies the full interface from the moment it is registered.

### Changed
- `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` section 5.4 - `QueryExecutionContext` removed from the documented `StartQueryExecution` body, with an amendment note explaining why. The first draft included it, but it cannot work for the `CREATE DATABASE IF NOT EXISTS` statement in section 5.9: Athena rejects a context naming a database that does not yet exist. No statement now sends a context and every statement fully qualifies its table as `{databaseName}.{table_name}` - which sections 5.7, 5.8 and 5.9 already did, so no call site changes.
- `plans/PLAN_V2_CLOUD_DATABASE.md` - tasks 2.1, 3.1, 3.2, 3.3, 3.5 and 3.9 ticked; a "Phase 3 implementation decisions" table added recording the three questions the design did not settle (D1 query execution context, D2 prefix normalisation, D3 `athenaQuery` return shape) and the decisions taken with the user before coding.
- `APP_TREE.md` - `16_connector_base.js` and `47_connector_athena.js` added to the infrastructure table, each marked with which methods are live and which are still stubbed.

### Implementation notes
- **Task 3.9 was brought forward.** The plan places registration after tasks 3.6 to 3.8, but `testConnection` cannot be reached from the browser console without it, so the one-line registration ships now.
- **Athena repeats the header row.** For a SELECT, GetQueryResults returns the column labels as row 1 of page 1 in addition to `ResultSetMetadata.ColumnInfo`. `athenaGetResults` drops that row only when every cell matches its column name exactly, so a genuine data row that happens to resemble the header is never silently lost.
- **`queryResultsPrefix` is normalised, not validated.** `athena-results`, `athena-results/` and `/athena-results/` all behave identically.

### Not included
No user-facing change. Nothing is wired into the UI - no new screen, route, sidebar entry or tab, so no user documentation change. The Database Settings screen arrives in Phase 4. Remaining in Phase 3: `s3PutObject` (3.4), `importAllTables` (3.6), `exportAllTables` (3.7), `setupDatabase` (3.8).

### Browser smoke test (task 3.10, pending)
Open the built bundle and run in the console:

```js
await AthenaConnector.testConnection({
  region: 'eu-west-1', accessKeyId: '...', secretAccessKey: '...',
  s3Bucket: '...', databaseName: 'dq_accelerator',
  workgroup: 'primary', queryResultsPrefix: 'athena-results/'
});
// expect { ok: true }; corrupt the secret key and expect { ok: false, error: '...' }
```

To exercise tasks 3.2 and 3.3 together, against a database that already has a table:

```js
const cfg = { /* as above */ };
const id = await athenaQuery(cfg, 'SELECT * FROM dq_accelerator.executive_agency_type');
const rows = await athenaGetResults(cfg, id);
console.log(rows.length, rows[0]);
```

---

## build-20260924-2008 - Phase 1: AWS SigV4 signing foundation

**Design:** `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` (section 5.3)
**Plan:** `plans/PLAN_V2_CLOUD_DATABASE.md` (Phase 1)
**Branch:** `feature/aws-sigv4`

### Added
- `src/15_aws_sigv4.js` - `signAwsRequest(method, url, headers, body, credentials, region, service)`. Signs browser `fetch` requests for AWS APIs using AWS Signature Version 4, implemented entirely with `SubtleCrypto`. No AWS SDK, no new CDN dependency, no change to `template.html`.
  - Returns the caller's headers plus `Authorization`, `X-Amz-Date`, `X-Amz-Content-Sha256`, and `X-Amz-Security-Token` when a session token is supplied (STS / SSO / assumed-role credentials).
  - `host` is included in the signature as the spec requires, but deliberately not returned - browsers forbid setting the Host header.
  - Throws a readable error when `SubtleCrypto` is unavailable (plain `http://` origins) instead of failing with an opaque property error.
  - Ported from the reference implementation in `tests/spike_athena_cors.py`, which was validated against live Athena and S3 endpoints on 2026-09-24.

### Changed
- File numbering for the V2 connector files revised from the design's first draft: `213_aws_sigv4.js` to `15_aws_sigv4.js`, `214_connector_base.js` to `16_connector_base.js`, `216_connector_athena.js` to `47_connector_athena.js`. The foundation files have zero dependencies, so numbering them beside the screen files implied a dependency chain that does not exist. `217_screen_db_settings.js` is unchanged. Design and plan docs updated to match.
- `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` - CORS section 3.3 rewritten to record the resolved spike outcome rather than the open risk; numbering rationale and load-time vs runtime dependency notes added to section 8.
- `plans/PLAN_V2_CLOUD_DATABASE.md` - prerequisites and decision gate marked cleared; file numbering table added.
- `APP_TREE.md` - `15_aws_sigv4.js` added. Corrected two pre-existing errors in the infrastructure table: the descriptions of `30_export_utils.js` and `40_storage.js` were swapped (30 is the localStorage layer, 40 is the CSV export layer), and `loadStewardIdentity` was listed against `40_storage.js` when it lives in `71_master_version.js`.

### Not included
No user-facing change. Nothing is wired into the UI yet - there is no new screen, route, or sidebar entry, and no user documentation change. The Database Settings screen arrives in Phase 4.

---

