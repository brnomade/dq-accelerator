# CHANGELOG_V2.md

Changes for DQ Accelerator **v2** — Cloud Database Integration line.

For v1 history see `CHANGELOG.md`.

---

## build-20260925-1923 - Retired rows now survive an Athena round trip (decision D13)

**Plan:** `plans/PLAN_V2_CLOUD_DATABASE.md` (Phase 3, task 3.7 amended; new decision D13)
**Branch:** `fix/athena-select-quoting`

### Changed
- `src/47_connector_athena.js` - **`exportAllTables` now exports retired rows** (`retiring_timestamp` set) instead of filtering them out, by passing `includeSoftDeleted = true` to `athenaBuildTableCSV`.
  - Previously the cloud database held live rows only, the literal reading of design section 5.8. Task 3.13's row-count check quantified what that cost on the live dataset: **47 rows across 6 tables** would not survive a round trip - 26 `data_quality_rule_allocation`, 14 `data_quality_rule`, 3 `data_owner`, 2 `critical_data_element`, 1 `stewardship`, 1 `data_patron`.
  - The effect was that retirement became a **hard delete** once data had been through the cloud: a master exporting and re-importing silently discarded the retirement audit trail, contradicting the soft-delete semantics the cascade-retirement work is built on. Decided by the user after seeing the counts.
  - **No DDL change and no `setupDatabase` re-run.** `retiring_timestamp` is already a `SCHEMA` column on all six affected tables, so it was already declared in the `CREATE EXTERNAL TABLE` DDL and already written as an empty CSV field for live rows. Only the row filter changed.
  - **`rowCounts` now reports the local total rather than the live count.** Anything querying Athena directly - dashboards, ad-hoc SQL, future consumers - must filter on `retiring_timestamp IS NULL`.
  - `athenaBuildTableCSV`'s third argument was already in place, mirroring `tableToCSV()`; this build is the first caller to use it.

### Known divergence
- **Design section 5.8 now contradicts the code** and needs amending to record D13. Flagged, not yet done.

### Not changed
- No UI, no user-facing behaviour. Phase 3 remains console-only; the screens are Phases 4 to 6. No user documentation update for this build.

---

## build-20260925-1845 - Fix: Athena import rejected with HTTP 400 (backtick identifiers in DML)

**Plan:** `plans/PLAN_V2_CLOUD_DATABASE.md` (Phase 3, tasks 3.12 and 3.13; new decision D12)
**Branch:** `fix/athena-select-quoting`

### Fixed
- `src/47_connector_athena.js` - **`importAllTables` now quotes identifiers with double quotes instead of backticks.** Every one of the 18 table imports failed with `HTTP 400 Bad Request` on `StartQueryExecution`, found by the task 3.12 browser test against live AWS.
  - Cause: Athena runs DDL through Hive, which accepts backtick-quoted identifiers, but DML through Trino, which rejects them. The connector's four generated statements all used backticks, copied from the Hive DDL examples in the design, and `SELECT * FROM` is the only DML among them.
  - The failure arrives as an HTTP 400 at submit time rather than as a `FAILED` query state, because Athena parses DML synchronously in `StartQueryExecution`. That is why it presented as a transport error rather than a query error.
  - `CREATE DATABASE`, `CREATE EXTERNAL TABLE` and `DROP TABLE` are unchanged and keep their backticks - they are Hive DDL and all three are already proven against live AWS by tasks 3.11 and 3.13.
  - Recorded as decision D12, which also states the standing rule: **any future DML added to this connector must use double quotes.**
  - Why no earlier test caught it: task 3.10 exercised `athenaQuery` with `SELECT 1 AS one, 'abc' AS two`, which quotes no identifiers, and tasks 3.11 and 3.13 exercise DDL only. Task 3.12 is the first test to issue DML against a named table.

### Changed
- `plans/PLAN_V2_CLOUD_DATABASE.md` - decision D12 added. Task 3.13's console steps had a placeholder `getAppData()` that is not a real function; replaced with `loadFromStorage().data` (the global in `30_export_utils.js:13`, which returns `{ data, savedAt }`), with a note that it reads the last save rather than the live UI and must be re-fetched immediately before an export. Tasks 3.12 and 3.13 statuses updated with the results of this session's test run.

### Not changed
- No UI, no user-facing behaviour. Phase 3 is still console-only; the screens are Phases 4 to 6. No user documentation update for this build.

---

## build-20260925-1803 - V2 Phase 3 complete (implementation): Athena export, and retry on both transfer directions

**Plan:** `plans/PLAN_V2_CLOUD_DATABASE.md` (Phase 3, task 3.7; new decisions D8 to D11; new task 3.13)
**Design:** `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` (sections 5.5, 5.7 and 5.8, all amended)
**Branch:** `feature/athena-connector-export`

### Added
- `src/47_connector_athena.js` - **`AthenaConnector.exportAllTables(config, data, onProgress)`** (task 3.7), replacing the last "not implemented yet" stub. 20 steps: connect, one step per table, then completion. Per table: `s3PutObject` of the table CSV, then `DROP TABLE IF EXISTS`, then `CREATE EXTERNAL TABLE`. All SQL is fully qualified and no `QueryExecutionContext` is sent (decision D1).
  - Step 1 calls `testConnection` before anything is written, so bad credentials fail in one round trip instead of eighteen - same shape as `importAllTables`.
  - **Retry.** 3 attempts per table with a 2 s then 5 s wait, as design section 5.8 specifies. New `athenaExportTable` wraps upload + DROP + CREATE as a single retry unit, so a retry re-uploads as well as re-creating and a half-finished attempt leaves nothing behind that the next attempt does not overwrite. Each attempt re-invokes `athenaQuery`, which mints a fresh `ClientRequestToken` per call - load-bearing, because Athena treats a repeated token as a repeat of the original request and would return the very failure the retry was meant to replace.
  - **All-or-nothing**, per design section 5.8: one table exhausting its attempts makes the whole export `ok: false` and the master must re-run the lot, which is always safe because each table is DROP + CREATE. Every table is still attempted, so one run reports every problem rather than only the first.
  - The CSV is built once per table, outside the retry loop: a CSV that cannot be built is a deterministic failure and three attempts would not change the outcome.
- `src/47_connector_athena.js` - **new Athena-local CSV writer** (decision D8). `athenaBuildTableCSV(tableName, data)` returns `{ csv, rowCount }`, mirroring `tableToCSV()`'s structure - `SCHEMA.cols` order, header row first (the DDL declares `skip.header.line.count = 1`), RFC 4180 quoting via `athenaCsvField`.
  - `athenaSanitiseValue(value)` applies the two write-side fixes `OpenCSVSerde` cannot do for itself: newlines collapse to a single space, because Athena splits records on line terminators before the SerDe sees the quoting, and backslashes are doubled, because `escapeChar` is `\` and cannot be disabled. Backslashes are doubled first, so the backslash that escapes a backslash is not doubled again by the newline pass.
  - Both fixes are lossy, which is why they are **not** applied to `tableToCSV()`.

### Changed
- `src/47_connector_athena.js` - **`importAllTables` now retries each table download** (decision D11, requested by the user): 3 attempts, 2 s then 5 s apart, identical to the export. Previously a single dropped connection, throttled API call or expired session token failed that table outright - and under decision D6 one failed table makes the whole import `ok: false`, so the master applied nothing and re-ran all 18 by hand.
  - New shared `athenaRunWithRetry(run, onAttempt)` holds the single copy of the policy and is used by both transfer directions. It returns `{ ok, value }` or `{ ok, error }` and never throws, because both callers carry on through the remaining tables after a failure. The export's inline retry loop was replaced by it, and the constants renamed `ATHENA_EXPORT_*` to `ATHENA_TRANSFER_*` to match.
  - The retry unit on import is the `SELECT` plus its paginated fetch together. A retry re-runs the query rather than resuming a half-read result set: a `QueryExecutionId` whose pagination failed part way through is not worth resuming, and the query is cheap to repeat.
  - Coercion stays outside the retry. It touches no network and is deterministic, so a second pass would fail identically and would duplicate the warnings the first pass already produced. A coercion failure is still recorded as a failed table rather than unwinding the whole import.
  - The progress bar gains the same retry indicator the export has: `Importing data_quality_rule (retry 2/3)`.
- `src/16_connector_base.js` - the `exportAllTables` interface contract updated for decision D9: the widened return shape, the all-or-nothing rule, and the note that a connector-agnostic caller may read only `ok` and `failedTables`.
- `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md` - section 5.5's `exportAllTables` signature amended for D9; section 5.8 amended for D8 and D10, and its retry step gained the `ClientRequestToken` rationale.
- `plans/PLAN_V2_CLOUD_DATABASE.md` - task 3.7 ticked; decisions D8, D9 and D10 added; task 3.13 added with its console steps; task 3.12 unblocked; status line updated.
- `APP_TREE.md` - `47_connector_athena.js` entry updated with `exportAllTables`, the four new write helpers, and the standing warning not to "fix" `tableToCSV()` to suit the Athena path.

### Decisions recorded
- **D8 - Athena-local CSV writer; `tableToCSV()` untouched.** Directed by the user. `tableToCSV()` (`40_storage.js:11`) feeds the V1 ZIP export, the uploader export and the CSV-per-table export, where multi-line free text is valid output that must be preserved. Sanitising there would degrade three working V1 paths to fix one V2 path. **Consequence:** the two writers must be kept in step by hand.
- **D9 - widened `exportAllTables` return shape** to `{ ok, failedTables, rowCounts, errors }`. Phase 6 must show a per-table row count summary (6.4) and per-table error detail (6.5); neither is derivable from `{ ok, failedTables }`. Same precedent as D6 for import.
- **D10 - a lone CR is collapsed too.** The design names only `\r\n` and `\n`, but Hadoop's line reader treats a bare CR as a record terminator, so leaving it would split exactly the row the fix exists to protect.
- **D11 - the table download retries as well.** Requested by the user. The design specified retry for export only. **Consequence:** a genuinely broken import now takes up to 7 s longer per failing table before it reports, and a wholly unreachable database takes around 2 minutes to fail all 18 rather than failing fast. Accepted because step 1 still pre-flights the credentials, so the common case of bad credentials fails in one round trip.

### Known limitations
- **Untested.** `exportAllTables` has not been run against live AWS - that is task 3.13, and it must be run before task 3.12. Every line of the export path is unexercised, and the retry branches are unexercised on both sides: a clean run never enters them, so they need provoking deliberately. Plan task 3.13 records how (point `s3Bucket` or `databaseName` at something that does not exist).
- **`importAllTables` changed after its own code was written and has not been re-run** either. The retry wrapper is new on a path that was already untested.
- **Retired rows are excluded from the cloud database.** This is the literal reading of design section 5.8, which calls `tableToCSV(tableName, data)` with `includeSoftDeleted` defaulted to false. A row retired locally disappears from the cloud store rather than arriving marked as retired. `athenaBuildTableCSV` takes the same third argument, so this is a one-word change if the round trip shows retirement state needs to survive.
- `exportAllTables` is not yet reachable from the UI - the Export screen tab is Phase 6. It is callable from the browser console.
- Per decision D4, `source_table_ddl`, `field_profiling`, `shortlist_group` and `cde_shortlist_tag` are not exported. Profiling data and shortlist groups remain local-only.

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

