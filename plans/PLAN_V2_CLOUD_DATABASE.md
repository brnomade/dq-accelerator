# PLAN_V2_CLOUD_DATABASE — V2 Cloud Database Integration

**Design:** `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md`  
**Date:** 2026-09-24  
**Status:** In implementation. Phases 0, 1 and 2 complete. Phase 3 is implemented and its transfer path is proven both ways against live AWS: tasks 3.10, 3.11 and 3.12 all pass, and task 3.13 is **substantially passed** on build-20260925-1923 -- CSV inspection, the 18-table export, the round trip, local/exported/re-imported row-count agreement on all 18 tables, and retired-row survival (47 rows, 2/14/26/1/1/3, matching exactly). Two fixes came out of the testing: decision **D12** (the `SELECT` used backtick identifiers, which Athena's DML engine rejects with HTTP 400 -- backticks for DDL, double quotes for DML) and decision **D13** (retired rows are now exported, so a round trip is lossless at row level). Merged to `v2`; branch `fix/athena-select-quoting` closed.

**Phase 3 remains open on three task 3.13 checks, none of them blocking Phase 4:**
1. The **sanitisation read-back** -- a backslash, comma, quote and newline in one `data_quality_rule` description, exported and re-imported, must return as ONE row with the newline as a space. This is the last untested logic in the write path (`athenaSanitiseValue`).
2. The **S3 console check** -- `{databaseName}/{table_name}/data.csv` present for all 18 with a recent timestamp.
3. The **retry provocation** on both directions -- `athenaRunWithRetry`'s retry branch has never executed. Point `s3Bucket` at a non-existent bucket for the export and `databaseName` at a non-existent database for the import; expect `(retry 2/3)`, `(retry 3/3)`, roughly 7 s, then `failedTables`.

Round-trip precision is lossy on `datetime` columns -- see issue **V2-01**; no impact found, and task 5.4 is annotated with the one dependency. Nothing in Phase 3 is UI-reachable yet; the screens are Phases 4-6, starting at task 4.1.

---

## Prerequisites

All prerequisites are satisfied:

1. ~~Run `tests/spike_athena_cors.py` (see Phase 0)~~ -- done 2026-09-24
2. ~~Review spike results and choose transport strategy~~ -- all 6 tests PASS; **direct browser calls confirmed, no local proxy required**
3. ~~If proxy fallback is needed, append a Phase 0.5 to this plan~~ -- not needed; no Phase 0.5

### File numbering

Confirmed 2026-09-24, superseding the numbers in the first draft of the design. The foundation files sit in the low band because they have no dependencies; only the React screen stays in the 200s. See "Numbering rationale" in the design doc.

| Draft number | Actual number | Reason |
|---|---|---|
| `213_aws_sigv4.js` | `15_aws_sigv4.js` | Zero dependencies; pure `SubtleCrypto` primitive |
| `214_connector_base.js` | `16_connector_base.js` | Zero dependencies; must load before any connector registers |
| `216_connector_athena.js` | `47_connector_athena.js` | Needs `SCHEMA` (10), sigv4 (15), registry (16), `coerceValue` (20), `tableToCSV` (40) |
| `217_screen_db_settings.js` | `217_screen_db_settings.js` | Unchanged -- React screen, belongs with the other screens |

### Phase 3 implementation decisions

Three questions were not settled by the design doc. Resolved with the user 2026-09-25 before any Phase 3 code was written.

| # | Question | Decision |
|---|---|---|
| D1 | `QueryExecutionContext.Database` cannot name a database that does not yet exist, so `CREATE DATABASE` (task 3.8) needs different handling from every other statement | **Never send `QueryExecutionContext` at all.** Every statement passed to `athenaQuery` must fully qualify its table as `{databaseName}.{table_name}`. One code path for all SQL, no special case for 3.8. **Supersedes the body shape shown in design section 5.4.** |
| D2 | How to handle a `queryResultsPrefix` with a missing, leading or doubled slash | **Normalise silently.** `athenaNormalisePrefix()` strips leading and trailing slashes, so `athena-results`, `athena-results/` and `/athena-results/` behave identically. No validation error, no Phase 4 UI work. |
| D3 | What `athenaQuery` returns on success | **The bare `QueryExecutionId` string**, exactly as task 3.2 specifies. Callers needing statistics or output location re-fetch `GetQueryExecution` themselves. |

Two further gaps were found when task 3.8 was started, and resolved with the user on 2026-09-25 before any DDL was written.

| # | Question | Decision |
|---|---|---|
| D4 | The design and this plan both say "18 tables", but `SCHEMA` has grown to 22 since the design was written. The four later additions are `source_table_ddl`, `field_profiling`, `shortlist_group` and `cde_shortlist_tag`. Every existing export path (`230_screen_export.js`, `232_uploader_export.js`, `40_storage.js`) enumerates `Object.keys(SCHEMA)`, so the literal reading of the design's "generate DDL from SCHEMA" constraint would have produced 22 tables and a 23-step setup. | **Only the original 18.** Recorded as the explicit `ATHENA_TABLES` array in `47_connector_athena.js`, in SCHEMA declaration order, and **not** derived from `Object.keys(SCHEMA)`. It is the authoritative table set for 3.6, 3.7 and 3.8 alike. A load-time check logs to the console if a name in it is missing from `SCHEMA`; it logs rather than throws, because the file is concatenated into one bundle with the whole app. **Consequence:** step counts are 19 for setup and 20 for import/export (2 overhead + 18), not the 23/24 the literal reading gave. **Consequence:** shortlist groups and CDE shortlist tags do not survive an Athena round trip, and profiling data stays local-only. |
| D5 | `tableToCSV()` (`40_storage.js:11`) emits RFC 4180 quoted fields, but design section 5.9 specifies `ROW FORMAT DELIMITED FIELDS TERMINATED BY ','` -- Hive's LazySimpleSerDe, which has no concept of quoting. Against real data this corrupts silently: `data_set_description` = `Offenders, victims and cases` splits into two columns and shifts every later field left, and quoted values keep their literal `"` characters. At least five free-text columns in the 18-table set are exposed: `data_set_description`, `data_element_definition`, `data_element_explanation`, `source_snapshot_filter`, and the rule description fields. | **Use `OpenCSVSerde`**, with `separatorChar ','`, `quoteChar '"'`, `escapeChar '\\'`. It reads RFC 4180 quoting correctly and requires all columns to be `STRING`, which design section 5.6 already mandates -- so it is a drop-in swap. **Supersedes the `ROW FORMAT DELIMITED` block in design section 5.9.** This fixes commas and quotes only; see the two write-side constraints on task 3.7 below for what it cannot fix. |

Two more gaps were found when task 3.6 was started, and resolved with the user on 2026-09-25 before any import code was written.

| # | Question | Decision |
|---|---|---|
| D6 | Neither the design nor this plan says what `importAllTables` should do when one of the 18 SELECT queries fails. The two existing precedents disagree: `setupDatabase` (3.8) continues and reports every broken table, while task 3.7 is specified as strictly all-or-nothing. Import cannot simply copy either -- design section 5.7 has a successful import "replace full local state and reset the base snapshot", so applying a dataset in which three of eighteen tables silently came back empty would corrupt FK resolution and hand the steward a false delta baseline. | **Continue through all 18, then report failure.** Every table is attempted so one pass diagnoses every problem, and the result carries `ok: false` plus `failedTables` so Phase 5 can refuse to apply it. **Widens the design's return contract** from `{ data, warnings }` to `{ ok, data, warnings, failedTables }`; design section 5.5 amended. **Consequence:** Phase 5 must check `ok` before touching local state -- a partial `data` object is always returned and is never safe to apply on its own. |
| D7 | Following D4, only 18 of the 22 `SCHEMA` tables round-trip. What should the returned `data` hold for `source_table_ddl`, `field_profiling`, `shortlist_group` and `cde_shortlist_tag`? Returning them as `[]` would give a complete state shape that Phase 5 could assign directly, but would silently wipe local profiling data and shortlist groups on every database import, with no way to tell "genuinely empty" from "never fetched". | **Omit the four keys entirely** and add a warning naming them. The connector reports only what it actually fetched, and the merge-or-wipe decision belongs to Phase 5 where it can be shown to the user. **Consequence:** `data` from this connector is an 18-key object, not a full state object -- Phase 5 must merge it into existing state rather than replacing state wholesale. Rejected alternative: having the connector read local state for the four and pass them through, which would make the connector depend on app state when nothing else in the interface does. |

Three further points were resolved when task 3.7 was started on 2026-09-25. The user directed that `tableToCSV()` must not be modified and that the Athena write path gets its own local code, which settles D8's implementation location; D9 and D10 are recorded here as deviations from the literal text of the design.

| # | Question | Decision |
|---|---|---|
| D8 | The newline and backslash sanitisation the two write-side constraints below require has to live somewhere, and `tableToCSV()` (`40_storage.js:11`) is the function design section 5.8 names. It is shared with the V1 ZIP export, the uploader export and the CSV-per-table export, where multi-line free text is valid output and must be preserved -- sanitising there would silently degrade three working V1 paths to fix one V2 one. | **Athena-local CSV writer; `tableToCSV()` untouched.** Directed by the user 2026-09-25. `athenaBuildTableCSV(tableName, data)` in `47_connector_athena.js` mirrors `tableToCSV()`'s structure -- `SCHEMA.cols` order, header row first, RFC 4180 quoting -- and applies `athenaSanitiseValue` to every value on the way. It returns `{ csv, rowCount }` so the caller can report a per-table count without re-deriving the soft-delete filter. **Consequence:** the two functions must be kept in step by hand. A future column-order or quoting change in `tableToCSV()` does not reach the Athena path. **Consequence:** retired rows are excluded, because design 5.8 specifies `tableToCSV(tableName, data)` with `includeSoftDeleted` defaulted to false, and that literal reading is what was implemented -- a row retired locally disappears from the cloud database rather than arriving in it marked as retired. `athenaBuildTableCSV` takes the same third argument, so flipping this is a one-word change if the round trip in task 3.13 shows retirement state needs to survive. |
| D9 | The connector interface in design section 5.5 returns `{ ok, failedTables }` from `exportAllTables`, but Phase 6 tasks 6.4 and 6.5 require the Export tab to display a per-table row count summary on success and per-table error detail on failure. Neither is derivable from that shape -- the UI would have to re-count rows itself and would have no error text at all. | **Widen the return shape** to `{ ok, failedTables, rowCounts, errors }`. `rowCounts` is keyed by table for the tables that succeeded; `errors` is keyed by table for those that failed, holding the message from the final attempt. Same precedent as D6, which widened the import shape for the same reason. `ok` and `failedTables` keep their meaning exactly, so a connector-agnostic caller reading only those two is unaffected. **Design section 5.5 amended.** |
| D10 | The write-side newline constraint below names `\r\n` and `\n`. A lone CR is not mentioned. | **Collapse a lone CR as well.** Hadoop's line reader treats a bare CR as a record terminator alongside LF and CRLF, so a value containing one would split into two broken rows -- exactly the corruption the constraint exists to prevent. Handled by the single expression `/\r\n|\r|\n/g` in `athenaSanitiseValue`. Recorded as a deliberate widening of the literal spec rather than left as an undocumented judgement call. |

One further point was raised by the user on 2026-09-25, after 3.7 was written and built.

| # | Question | Decision |
|---|---|---|
| D11 | The design specifies the 3-attempt retry for export only. Import runs 18 serial `SELECT`s with no retry at all, so one dropped connection, one throttled API call or one session token expiring mid-run fails that table -- and under decision D6 a single failed table makes the whole import `ok: false`, so the master applies nothing and re-runs all 18 by hand. | **The table download retries too:** 3 attempts, 2 s then 5 s, identical to export. Requested by the user. The retry unit is the `SELECT` plus its paginated fetch together -- a retry re-runs the query rather than resuming a half-read result set, because a `QueryExecutionId` whose pagination failed part way through is not worth resuming and the query is cheap to repeat. Coercion stays **outside** the retry: it touches no network and is deterministic, so a second pass would fail identically and would duplicate the warnings the first pass already produced. Both halves now share one implementation, `athenaRunWithRetry(run, onAttempt)`, which holds the single copy of the policy; the constants were renamed `ATHENA_EXPORT_*` to `ATHENA_TRANSFER_*` to match. **Design section 5.7 amended.** **Consequence:** a genuinely broken import now takes up to 7 s longer per failing table before it reports, and a wholly unreachable database takes ~2 minutes to fail all 18 rather than failing fast. Accepted: step 1 still pre-flights the credentials, so the common case of bad credentials fails in one round trip. |
| D12 | Identifier quoting was never stated. All four generated statements used backticks, copied from the Hive DDL examples in the design. | **Backticks for DDL, double quotes for DML.** Athena runs DDL through Hive, which accepts backticks, but DML through Trino, which rejects them outright -- and rejects them as `InvalidRequestException` / HTTP 400 at `StartQueryExecution`, not as a `FAILED` query state, because Athena parses DML synchronously at submit time. `SELECT * FROM` in `importAllTables` is the **only** DML statement in the connector, so it is the only one that changes; `CREATE DATABASE`, `CREATE EXTERNAL TABLE` and `DROP TABLE` keep their backticks. Found by the 3.12 test on 2026-09-25 -- 400 on all 18 tables. Task 3.10 could not have caught it: it ran `SELECT 1 AS one, 'abc' AS two`, which quotes no identifiers. **Any future DML added to this file must use double quotes.** |
| D13 | Design section 5.8 read literally excludes retired rows (`retiring_timestamp` set) from the cloud database, which is how 3.7 was first written. Task 3.13 step 1 quantified the effect on the live dataset: **47 rows across 6 tables would not survive a round trip** -- 26 `data_quality_rule_allocation`, 14 `data_quality_rule`, 3 `data_owner`, 2 `critical_data_element`, 1 `stewardship`, 1 `data_patron`. | **Retired rows are exported.** Decided by the user 2026-09-25 after seeing the counts. Excluding them made retirement behave as a hard delete once data had been through the cloud, which contradicts the soft-delete semantics the cascade-retirement work was built on -- a master's export/import cycle silently discarded the retirement audit trail. `exportAllTables` now passes `includeSoftDeleted = true` to `athenaBuildTableCSV`. **No DDL or `setupDatabase` change:** `retiring_timestamp` is already a `SCHEMA` column on all six tables, so it is already in the DDL and was already being written as an empty field for live rows. **Consequence:** anything querying Athena directly -- dashboards, ad-hoc SQL, future consumers -- must filter on `retiring_timestamp IS NULL`, and `rowCounts` now matches the local **total** rather than the live count. **Design section 5.8 now contradicts the code and needs amending.** |

Design section 5.4 has been amended to record D1. Design section 5.5 has been amended to record D9, section 5.7 to record D11, and section 5.8 to record D8 and D10. Design sections 5.5 and 5.7 have been amended to record D6 and D7. D2 and D3 are implementation detail below the level of the design doc and are recorded only here.

---

## Phase 0 — Spike: validate browser ↔ AWS connectivity

**Goal:** confirm that the browser can make direct `fetch` calls to Athena's API endpoint and S3 without CORS errors, and that SigV4 signing works end-to-end.

| Task | Description | Done |
|---|---|---|
| 0.1 | Configure `tests/spike_athena_cors.py` with real AWS credentials, bucket, and region | [x] |
| 0.2 | Run spike test; review all 6 test results | [x] |
| 0.3 | If Athena CORS → PASS and S3 CORS → PASS: proceed to Phase 1 | [x] **All 6 tests PASS (2026-09-24). Direct browser → AWS confirmed. No proxy needed.** |
| 0.4 | If either CORS test → FAIL: design minimal Python proxy fallback, add Phase 0.5 to this plan, confirm approach with team before proceeding | N/A |

**Expected duration:** 1–2 hours

---

## Phase 1 — SigV4 signing infrastructure

**Goal:** create the low-level AWS signing function that all subsequent connector code depends on.

| Task | Description | Done |
|---|---|---|
| 1.1 | Create `src/15_aws_sigv4.js` — implement `signAwsRequest(method, url, headers, body, credentials, region, service)` using `SubtleCrypto.digest` and `SubtleCrypto.sign` | [x] **Done, build-20260924-2008.** Ported from `tests/spike_athena_cors.py`. ASCII-clean; loads between `10_constants.js` and `20_data_utils.js` |
| 1.2 | Manually test in browser console: sign a synthetic request, verify the Authorization header format matches AWS SigV4 spec | [x] **PASS 2026-09-24.** All 3 frozen-clock cases (Athena with and without session token, S3 PutObject) produced signatures identical to the Python reference. `host` correctly excluded from returned headers; payload hash verified |

**Key constraints:**
- No non-ASCII characters in JS
- Function must be async (SubtleCrypto is Promise-based)
- Must handle optional `sessionToken` (adds `X-Amz-Security-Token` header)

**Expected duration:** 2–3 hours

---

## Phase 2 — Connector base

**Goal:** define the registry and shared types.

| Task | Description | Done |
|---|---|---|
| 2.1 | Create `src/16_connector_base.js` — define `ConnectorRegistry = {}` (initially empty), add `FieldDef` and `StepResult` type documentation as comments | [x] **Done, build-20260925-1600.** Registry plus `FieldDef`, `StepResult`, `onProgress` and full connector-interface contracts as comments |

**Note:** `AthenaConnector` registers itself at the bottom of `47_connector_athena.js` via `ConnectorRegistry['athena'] = AthenaConnector` — no changes to `16_connector_base.js` needed when adding future connectors.

**Expected duration:** 30 minutes

---

## Phase 3 — Athena connector

**Goal:** implement the full Athena connector against the interface defined in the design.

Build and test each method in isolation before wiring into the UI.

| Task | Description | Done |
|---|---|---|
| 3.1 | Create `src/47_connector_athena.js` skeleton — `getConfigSchema()` and config constant | [x] **Done, build-20260925-1600.** `ATHENA_CONFIG_SCHEMA` holds all 8 fields from design section 5.1; `setupDatabase` / `importAllTables` / `exportAllTables` stubbed to throw a named "not implemented yet" error |
| 3.2 | Implement Athena API helper: `athenaQuery(config, queryString)` — calls StartQueryExecution, polls GetQueryExecution, returns QueryExecutionId | [x] **Done, build-20260925-1600.** 250 ms poll, 60 s timeout, returns the bare `QueryExecutionId` string; throws with `StateChangeReason` on FAILED/CANCELLED and with the state on timeout. Shares one signed transport helper `athenaApiCall()` with every other Athena operation. **Amended build-20260925-1619:** a fresh `ClientRequestToken` is now sent on every call -- the raw API rejects StartQueryExecution without it (found by the 3.10 smoke test) |
| 3.3 | Implement `athenaGetResults(config, queryExecutionId)` — paginated GetQueryResults, returns array of row objects | [x] **Done, build-20260925-1600.** 1 000 rows/page via `NextToken`; column names taken from `ResultSetMetadata.ColumnInfo`; the repeated header row Athena returns as row 1 of page 1 is dropped only when its cells match the column names exactly. Values stay raw strings (coercion belongs to 3.6) |
| 3.4 | Implement S3 helper: `s3PutObject(config, key, csvString)` | [x] **Done, build-20260925-1707.** Signed `PUT https://{bucket}.s3.{region}.amazonaws.com/{key}`, virtual-hosted style, `Content-Type: text/plain`. Returns the `s3://` URI on success, throws on any non-2xx. `Content-Type` is set explicitly rather than left to `fetch()`, which would default a string body to `text/plain;charset=UTF-8` and break the signature. Key path segments RFC 3986-encoded via `s3EncodeSegment` (`encodeURIComponent` plus `!'()*`, which SigV4 expects encoded). S3 errors are XML not JSON, so `s3FormatError` parses `<Code>`/`<Message>` instead of reusing `athenaFormatError`. Helpers `athenaTableDataKey` and `athenaTableLocation` added for the design section 5.2 layout |
| 3.5 | Implement `testConnection(config)` — calls ListWorkGroups, returns ok/error | [x] **Done, build-20260925-1600.** Pre-flights the required fields for a readable error, then calls ListWorkGroups. Returns `{ ok }` / `{ ok, error }` exactly as the design interface specifies |
| 3.6 | Implement `importAllTables(config, onProgress)` — orchestrates 18 serial SELECT queries using 3.2 + 3.3, applies importSheet-style type coercion | [x] **Done, build-20260925-1735.** 20 steps (connect + 18 tables + completion). Step 1 calls `testConnection` first, so bad credentials fail in one round trip rather than eighteen. Coercion by new `athenaCoerceRecord`, the string-input subset of `importSheet` — Athena returns every cell as a string or null, so `importSheet`'s Date-object and Excel-serial branches are unreachable and deliberately not reproduced; string behaviour matches exactly, including `YYYY-MM-DD` datetime normalisation from local date parts. New `athenaCoerceTable` drops PK-less rows as `importSheet` does but reports the count, and warns on `SCHEMA` columns missing from the cloud table and on duplicate PKs. Returns `{ ok, data, warnings, failedTables }` per decision D6; `data` omits the four non-Athena tables per decision D7. **Amended build-20260925-1803:** each table now carries the same 3-attempt / 2 s / 5 s retry as the export, via the shared `athenaRunWithRetry` -- see decision D11. **Untested — see task 3.12** |
| 3.7 | Implement `exportAllTables(config, data, onProgress)` — orchestrates 18 serial S3 upload + DROP + CREATE sequences with 3-attempt retry (2 s / 5 s backoff) | [x] **Done, build-20260925-1756.** 20 steps (connect + 18 tables + completion). Step 1 calls `testConnection` first, as import does. Per table: `s3PutObject` then `DROP TABLE IF EXISTS` then `athenaCreateTableDDL`, the three wrapped as one retry unit in `athenaExportTable` so a retry re-uploads as well as re-creates. 3 attempts, 2 s then 5 s wait, through the shared `athenaRunWithRetry` (see decision D11 -- the import uses the same helper); each attempt re-invokes `athenaQuery`, which mints a fresh `ClientRequestToken` per call, so the token-replay trap in the key constraints below cannot be hit. All-or-nothing per design 5.8, but every table is still attempted so one run reports every problem. The CSV is built once per table outside the retry loop -- a CSV that cannot be built is deterministic and three attempts would not change it. New Athena-local CSV writer `athenaBuildTableCSV` + `athenaCsvField` + `athenaSanitiseValue`; `tableToCSV()` is deliberately **not** reused or modified, see decision D8. Returns `{ ok, failedTables, rowCounts, errors }`, widened per decision D9. **Amended build-20260925-1858:** retired rows are now exported rather than filtered out, see decision D13 -- `rowCounts` therefore reports the local total, not the live count. **Untested -- see task 3.13** |
| 3.8 | Implement `setupDatabase(config, onProgress)` — CREATE DATABASE IF NOT EXISTS + 18 × CREATE EXTERNAL TABLE IF NOT EXISTS, DDL generated from SCHEMA constant | [x] **Done, build-20260925-1707.** 19 steps (1 database + 18 tables), idempotent, returns one `StepResult` per step. DDL built by `athenaCreateTableDDL` from `SCHEMA[table].cols`, every column `STRING`. Table set is the new `ATHENA_TABLES` constant, see decision D4. SerDe changed from the design's `ROW FORMAT DELIMITED`, see decision D5. `databaseName` passes `athenaAssertIdentifier` before it is interpolated into SQL. **Failure handling:** a failed CREATE DATABASE aborts the run (all 18 table statements would fail for the same reason and bury the cause); a failed table is recorded and the run continues, so one pass reports every broken table |
| 3.9 | Register connector: `ConnectorRegistry['athena'] = AthenaConnector` at bottom of file | [x] **Done early, build-20260925-1600.** Brought forward from its planned position because 3.5 is not reachable from the console without it |
| 3.10 | Browser smoke test: open built app, call `testConnection` from browser console with real credentials | [x] **PASS 2026-09-25, build-20260925-1619**, live Athena in `eu-west-1` from `http://localhost`. `testConnection` returns `{ ok: true }`. `athenaQuery` + `athenaGetResults` on a table-less `SELECT 1 AS one, 'abc' AS two` returned QueryExecutionId `2a70d9ec-...` and exactly one row `{ one: '1', two: 'abc' }`. Confirms three things: the `ClientRequestToken` fix works, decision D1 holds (no `QueryExecutionContext` sent and a table-less SELECT is accepted), and the repeated-header-row suppression in `athenaGetResults` behaves against real Athena output (1 row, not 2) |
| 3.11 | Browser smoke test for 3.4 and 3.8: `s3PutObject` against the live bucket, then `setupDatabase` end to end | [x] **PASS 2026-09-25, build-20260925-1718**, live AWS in `eu-west-1` from `http://localhost`. `s3PutObject` returned `s3://dq-accelerator-metada-store-512798217240-eu-west-1-an/smoke-test/probe.csv` with no CORS block -- the bucket CORS rule is now proven from a real browser origin, not just the simulated `Origin` header of the Phase 0 spike. `athenaCreateTableDDL` output reviewed and correct. `setupDatabase` returned 19 steps, all `ok: true`, in `ATHENA_TABLES` order (1 database + 18 tables, confirming decision D4 -- the four later SCHEMA additions are absent). A second run returned the same 19 successes, proving `IF NOT EXISTS` idempotency. **Steps used, retained for re-runs:** This is the first real browser preflight against S3 -- the Phase 0 spike only simulated an `Origin` header from Python, so the bucket CORS rule is proven for the first time here. User confirmed 2026-09-25 that the rule is applied to `dq-accelerator-metada-store-512798217240-eu-west-1-an` |

| 3.13 | Browser smoke test for 3.7: `exportAllTables` against the live database, then a full round trip | [~] **Steps 1, 2 and 3 PASS 2026-09-25**, build-20260925-1803, live AWS in `eu-west-1` from `http://localhost`. Step 1: `athenaBuildTableCSV` on `critical_data_set` -- row count matched the line count, so no value carried a raw newline. Step 2: `exportAllTables` returned `ok: true`, empty `failedTables`, and 20 progress steps with no `(retry n/3)` suffix. Step 3 (the 3.12 round trip, on build-20260925-1845): row counts matched across `rowCounts` and the re-imported data on all 18 tables. Step 1 of the checks below (local vs exported) **PASSED** on build-20260925-1845: `live` equalled `exported` on all 18 tables, and the retired-row gap it exposed led to decision D13. **Still outstanding:** a re-run of the export and round trip under D13, where `rowCounts` must now equal the local **total** on all 18 tables and the 47 retired rows must come back still marked retired **[both PASSED 2026-09-25 on build-20260925-1923 -- local = exported = back on all 18 tables, and retired rows returned 2/14/26/1/1/3 = 47, matching exactly. The timestamps come back date-only, logged as issue V2-01]**; the sanitisation read-back, the S3 console check that `{databaseName}/{table_name}/data.csv` exists for all 18, and the deliberate retry provocation on both sides. Steps recorded below. Steps recorded below. Covers: 20 progress steps with the retry suffix absent on a clean run, `ok: true`, empty `failedTables`, `rowCounts` matching the local row counts with retired rows excluded (decision D8), the CSV objects present in S3 under `{databaseName}/{table_name}/data.csv`, and a `SELECT COUNT(*)` per table in the Athena console agreeing with `rowCounts`. Then exercise the sanitisation deliberately: put a backslash, a comma, a double quote and a newline into one `data_quality_rule` description, export, and confirm the value reads back with the backslash and quote intact and the newline collapsed to a space -- not split across two rows |
| 3.12 | Browser smoke test for 3.6: `importAllTables` against the live database | [x] **PASS 2026-09-25**, build-20260925-1845, live AWS in `eu-west-1` from `http://localhost`. `importAllTables` returned `ok: true` with an empty `failedTables`, and the re-imported row count matched `exportAllTables`' `rowCounts` on all 18 tables (5 / 19 / 46 / 119 / 145 / 146 / 384 / 580 / 85 / 18 / 43 / 47 / 6 / 4 / 5 / 72 / 108 / 2). Proves the full write-then-read path: `athenaBuildTableCSV` output is readable by `OpenCSVSerde`, the `skip.header.line.count` DDL property and the repeated-header suppression in `athenaGetResults` do not double-count or double-drop, and `athenaCoerceTable` dropped no rows. **Earlier run FAILED 2026-09-25** against build-20260925-1803: HTTP 400 on `StartQueryExecution` for all 18 tables. Cause was backtick-quoted identifiers in the only DML statement in the connector -- see decision D12. Fixed on branch `fix/athena-select-quoting` and proven by the passing run above. Previously blocked: The 18 Athena tables exist after 3.11 but hold no data, so an import today can only prove "18 empty tables read without error" -- it cannot exercise the coercion in `athenaCoerceRecord`, the PK-drop path, or the duplicate-PK warning. Run this after 3.7 has uploaded a real dataset, as the read half of a full round trip: export local data, re-import it, and diff against the original. Until then the useful partial check is `const r = await AthenaConnector.importAllTables(cfg, (s,t,m) => console.log(s+'/'+t, m))` -- expect `r.ok === true`, 20 progress steps, `r.failedTables` empty, every `r.data` key an empty array, and exactly one warning naming the four tables from decision D7 |

### Task 3.11 smoke test steps

Open the built bundle over `http://localhost` (not `file://` -- a `file://` origin is `null` and S3 CORS will reject it), then in the console:

```js
const cfg = {
  region: 'eu-west-1', accessKeyId: '...', secretAccessKey: '...',
  s3Bucket: 'dq-accelerator-metada-store-512798217240-eu-west-1-an',
  databaseName: 'dq_accelerator', workgroup: 'primary',
  queryResultsPrefix: 'athena-results',
};

// 1. S3 write path (task 3.4). Expect the s3:// URI back, no throw.
await s3PutObject(cfg, 'smoke-test/probe.csv', 'a,b\n1,2');

// 2. Inspect one generated statement before running 19 of them (task 3.8).
console.log(athenaCreateTableDDL(cfg, 'critical_data_set'));

// 3. Full setup. Expect 19 StepResults, every one ok: true.
const steps = await AthenaConnector.setupDatabase(cfg, (s, t, m) => console.log(s + '/' + t, m));
console.log(steps.filter(s => !s.ok));   // expect []
```

Then confirm in the AWS console that database `dq_accelerator` exists with 18 tables. Re-run step 3 once more to prove idempotency -- it must return 19 `ok: true` results again, not errors.

### Task 3.13 smoke test steps

Same `cfg` as task 3.11, same `http://localhost` requirement. Load a real dataset into the app first, so the export has something to write. Then in the console:

```js
// 1. Inspect one CSV before uploading 18 of them. Check the header matches the
//    DDL column order, and that no value contains a raw newline.
const appData = loadFromStorage().data;   // { data, savedAt } -- 30_export_utils.js
const built = athenaBuildTableCSV('critical_data_set', appData);
console.log(built.rowCount, built.csv.split('\n').length - 1);   // expect these to be equal
console.log(built.csv.slice(0, 500));

// 2. Full export. Expect ok: true, failedTables [], and 20 progress steps
//    with no "(retry n/3)" suffix on any of them.
const r = await AthenaConnector.exportAllTables(cfg, appData, (s, t, m) => console.log(s + '/' + t, m));
console.log(r.ok, r.failedTables, r.rowCounts);

// 3. Read it straight back (this is task 3.12) and diff the round trip.
const back = await AthenaConnector.importAllTables(cfg, (s, t, m) => console.log(s + '/' + t, m));
console.log(back.ok, back.failedTables, back.warnings);
ATHENA_TABLES.forEach(t => console.log(t, r.rowCounts[t], back.data[t].length));
```

`loadFromStorage()` is the global from `30_export_utils.js:13`; it returns `{ data, savedAt }`, so the export wants its `.data` property. It reads the **last save, not the live UI** -- re-fetch it immediately before the export rather than reusing a binding captured earlier, or an edit made since the last autosave will be missing from the CSV. This matters for the sanitisation check below, where the awkward characters are typed into a rule and must actually reach S3. If it returns `null`, no dataset is loaded -- import one through the Import screen first. Sanity check that step 1 read live data: `built.rowCount > 0`, since `athenaBuildTableCSV` returns a lone header row for an absent table rather than throwing.

**What to check, beyond step counts:**
- Row counts agree in all three places: local, `r.rowCounts`, and `back.data[t].length`. A local count that is higher than the exported count is expected only where that table holds retired rows -- decision D8 excludes them.
- The sanitisation actually works. Before exporting, put all four awkward characters into one `data_quality_rule` description: a backslash, a comma, a double quote, and a newline. After the round trip that description must come back with the backslash and the quote intact, the comma intact, and the newline replaced by a single space -- and as **one** row, not two. This is the only check that exercises decisions D5, D8 and D10 together, and it is the reason the round trip is worth more than either half alone.
- In the S3 console, `{databaseName}/{table_name}/data.csv` exists for all 18 tables with a recent timestamp.
- **The retry branches stay unexercised on a clean run** and need provoking once, for both halves. Cheapest way: copy `cfg`, point `s3Bucket` at a bucket that does not exist, and run the export -- each table should log `(retry 2/3)` then `(retry 3/3)`, take roughly 7 s before it gives up, and land in `failedTables` with the S3 error in `errors`. Point `databaseName` at a database that does not exist and run the import for the same check on the read side. This is the only way to see decision D11 working before Phase 8's task 8.7.

**Key constraints:**
- **Every `StartQueryExecution` must carry a fresh `ClientRequestToken`.** AWS documents the field as optional because the official SDKs generate it silently; the raw API rejects the call with `InvalidRequestException: clientRequestToken is null or empty`. Handled inside `athenaQuery` by `athenaClientRequestToken()`, so callers get this for free -- but note **the token must never be reused across retry attempts in task 3.7**: Athena treats a repeated token as a repeat of the original request and returns the first `QueryExecutionId` rather than re-running the query, so a retry reusing a token would silently return the very failure it was meant to replace. Because `athenaQuery` mints a new token per call, a retry that re-invokes `athenaQuery` is already correct; a retry that caches and replays a payload would not be.
- **Task 3.7 must collapse newlines inside values before upload.** `OpenCSVSerde` (decision D5) fixes commas and quotes but cannot read a newline inside a quoted value: Athena's `TextInputFormat` splits records on newlines before the SerDe ever sees them, so a multi-line description becomes two broken rows. No SerDe choice can recover this, so the fix has to be on the write side -- replace `\r\n` and `\n` in each value with a single space. Multi-line text loses its line breaks; nothing else corrupts. Agreed with the user 2026-09-25 as part of D5.
- **Task 3.7 must also double backslashes inside values before upload.** `OpenCSVSerde`'s `escapeChar` is `\` (its default; there is no way to disable escaping), so a literal backslash in the data consumes the character after it on read. `tableToCSV()` doubles `"` but does **not** touch `\`, so this is not handled today. Most likely to bite on regex patterns in `data_quality_rule`. Same fix location as the newline constraint above.
- `exportAllTables` must implement all-or-nothing semantics: if any table exhausts all 3 retry attempts, mark overall export as failed and return `{ ok: false, failedTables: [...] }`
- All Athena DDL strings must be generated dynamically from `SCHEMA` (not hardcoded per table), but iterating the `ATHENA_TABLES` list, never `Object.keys(SCHEMA)` -- see decision D4
- All column types in DDL → `STRING` regardless of SCHEMA type
- No non-ASCII characters in JS strings

**Expected duration:** 6–8 hours

---

## Phase 4 — Database Settings screen

**Goal:** build the UI for configuring the connector and running one-time database setup.

| Task | Description | Done |
|---|---|---|
| 4.1 | Create `src/217_screen_db_settings.js` — `DatabaseSettingsScreen` component | [ ] |
| 4.2 | Implement connector selector dropdown (reads keys from `ConnectorRegistry`) | [ ] |
| 4.3 | Implement dynamic config form — renders `FieldDef[]` from `connector.getConfigSchema()`; password fields masked | [ ] |
| 4.4 | Implement Test Connection button — calls `connector.testConnection(config)`; shows inline PASS/FAIL | [ ] |
| 4.5 | Implement Save Settings — writes `{ connectorId, config }` to localStorage `moj_dq_db_config_v1` | [ ] |
| 4.6 | Implement Setup Database section (visible only after successful test) — progress log driven by `onProgress` | [ ] |
| 4.7 | Implement Clear Saved Credentials button | [ ] |

**Expected duration:** 3–4 hours

---

## Phase 5 — Import screen: Import from Database tab

**Goal:** add the master-only "Import from Database" tab to the existing Import screen.

| Task | Description | Done |
|---|---|---|
| 5.1 | Add tab to tab list in `210_screen_import.js`; hide from non-master roles | [ ] |
| 5.2 | Implement connector status indicator — reads `moj_dq_db_config_v1`; shows "Configured" or "Not configured (go to Database Settings)" | [ ] |
| 5.3 | Implement Import button and progress bar (20 steps; displays current table name) | [ ] |
| 5.4 | On success: call `dispatch({ type: 'LOAD_FROM_DB', data, resetSnapshot: true })` — resets base snapshot as well as local state | [ ] **`resetSnapshot: true` is load-bearing for two reasons, do not trim it.** The obvious one is that the imported data is a new baseline. The second, found by the 3.13 round trip: a cloud round trip truncates every `datetime` to `YYYY-MM-DD` (issue V2-01), which changes the whole-record hash `buildDelta` compares, so without the reset all previously retired rows would be re-reported as `retired` on the next delta. Also note decision D7 -- **merge** the imported tables into existing state, never assign over it, or local profiling and shortlist data is wiped. |
| 5.5 | On error: display step-level error detail | [ ] |

**Note on snapshot reset:** the import must call both the existing state-replace logic AND `saveBaseSnapshot(data)` — same behaviour as the master JSON import path in `210_screen_import.js`.

**Expected duration:** 2–3 hours

---

## Phase 6 — Export screen: Export to Database tab

**Goal:** add the master-only "Export to Database" tab to the existing Export screen.

| Task | Description | Done |
|---|---|---|
| 6.1 | Add tab to tab list in `230_screen_export.js`; hide from non-master roles | [ ] |
| 6.2 | Implement connector status indicator | [ ] |
| 6.3 | Implement Export button and progress bar (20 steps; displays current table name + retry count if retrying) | [ ] |
| 6.4 | On success: display per-table row count summary | [ ] |
| 6.5 | On error: display failed table(s) with error detail; show "Please retry the full export" instruction | [ ] |

**Expected duration:** 2–3 hours

---

## Phase 7 — Routing and sidebar

**Goal:** wire the new screen into the app shell.

| Task | Description | Done |
|---|---|---|
| 7.1 | Add `screen:database-settings` route to the switch in `240_app.js`; render `DatabaseSettingsScreen`; guard to master only | [ ] |
| 7.2 | Add "Database Settings" sidebar entry to the Database Actions group in `80_sidebar.js`; master-only visibility | [ ] |
| 7.3 | Update `APP_TREE.md` — add new screen, new source files, new sidebar entry | [ ] |

**Expected duration:** 1 hour

---

## Phase 8 — Testing and build

| Task | Description | Done |
|---|---|---|
| 8.1 | Run `python build.py` and open `dist/dq-accelerator.html` in browser | [ ] |
| 8.2 | Test: Database Settings screen renders; connector selector works; config form renders all fields | [ ] |
| 8.3 | Test: Test Connection with valid credentials → PASS; with invalid credentials → FAIL with readable error | [ ] |
| 8.4 | Test: Setup Database runs to completion; verify tables exist in Athena console | [ ] |
| 8.5 | Test: Import from Database — 20-step progress bar; data replaces local state; base snapshot resets | [ ] |
| 8.6 | Test: Export to Database — 20-step progress bar; tables visible in Athena with correct row counts | [ ] |
| 8.7 | Test: Export failure simulation (temporarily break S3 key) — retry indicators shown; failure reported; export marked failed | [ ] |
| 8.8 | Test: Steward role — "Import from Database" and "Export to Database" tabs not visible; Database Settings not in sidebar | [ ] |
| 8.9 | Test: existing file-based Import and Export paths unaffected | [ ] |
| 8.10 | Test: saved credentials not present in any exported JSON, delta, or ZIP artifact | [ ] |
| 8.11 | Produce final build with correct build ID, update CHANGELOG.md and SESSION_METRICS.md, update user documentation | [ ] |

**Expected duration:** 3–4 hours

---

## Estimated total effort

| Phase | Hours |
|---|---|
| 0 — Spike | 1–2 |
| 1 — SigV4 | 2–3 |
| 2 — Connector base | 0.5 |
| 3 — Athena connector | 6–8 |
| 4 — Database Settings screen | 3–4 |
| 5 — Import tab | 2–3 |
| 6 — Export tab | 2–3 |
| 7 — Routing + sidebar | 1 |
| 8 — Testing + build | 3–4 |
| **Total** | **21–28 hours** |

---

## Decision gate

Phase 0 (spike) was a hard gate: Phase 1 could not begin until the CORS question was resolved and the transport strategy confirmed.

**Gate cleared 2026-09-24.** All 6 spike tests passed against region `eu-west-1` (see `designs/version-2/spike-results.txt`). Athena and S3 both returned `Access-Control-Allow-Origin: *`. Transport strategy is direct browser `fetch` with SigV4 signing; no local proxy.
