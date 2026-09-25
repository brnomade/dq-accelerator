# PLAN_V2_CLOUD_DATABASE — V2 Cloud Database Integration

**Design:** `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md`  
**Date:** 2026-09-24  
**Status:** In implementation. Phases 0, 1 and 2 complete. Phase 3: 3.1-3.5 and 3.8-3.11 all done and smoke-tested against live AWS -- the 3.11 test passed on 2026-09-25 (build-20260925-1718), which closes out `s3PutObject` and `setupDatabase` and proves the bucket CORS rule from a real browser origin. Remaining in Phase 3: 3.6 `importAllTables`, 3.7 `exportAllTables`, now in progress on branch `feature/athena-connector-transfer`.

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

Design section 5.4 has been amended to record D1. Design sections 5.5 and 5.7 have been amended to record D6 and D7. D2 and D3 are implementation detail below the level of the design doc and are recorded only here.

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
| 3.6 | Implement `importAllTables(config, onProgress)` — orchestrates 18 serial SELECT queries using 3.2 + 3.3, applies importSheet-style type coercion | [x] **Done, build-20260925-1735.** 20 steps (connect + 18 tables + completion). Step 1 calls `testConnection` first, so bad credentials fail in one round trip rather than eighteen. Coercion by new `athenaCoerceRecord`, the string-input subset of `importSheet` — Athena returns every cell as a string or null, so `importSheet`'s Date-object and Excel-serial branches are unreachable and deliberately not reproduced; string behaviour matches exactly, including `YYYY-MM-DD` datetime normalisation from local date parts. New `athenaCoerceTable` drops PK-less rows as `importSheet` does but reports the count, and warns on `SCHEMA` columns missing from the cloud table and on duplicate PKs. Returns `{ ok, data, warnings, failedTables }` per decision D6; `data` omits the four non-Athena tables per decision D7. **Untested — see task 3.12** |
| 3.7 | Implement `exportAllTables(config, data, onProgress)` — orchestrates 18 serial S3 upload + DROP + CREATE sequences with 3-attempt retry (2 s / 5 s backoff) | [ ] |
| 3.8 | Implement `setupDatabase(config, onProgress)` — CREATE DATABASE IF NOT EXISTS + 18 × CREATE EXTERNAL TABLE IF NOT EXISTS, DDL generated from SCHEMA constant | [x] **Done, build-20260925-1707.** 19 steps (1 database + 18 tables), idempotent, returns one `StepResult` per step. DDL built by `athenaCreateTableDDL` from `SCHEMA[table].cols`, every column `STRING`. Table set is the new `ATHENA_TABLES` constant, see decision D4. SerDe changed from the design's `ROW FORMAT DELIMITED`, see decision D5. `databaseName` passes `athenaAssertIdentifier` before it is interpolated into SQL. **Failure handling:** a failed CREATE DATABASE aborts the run (all 18 table statements would fail for the same reason and bury the cause); a failed table is recorded and the run continues, so one pass reports every broken table |
| 3.9 | Register connector: `ConnectorRegistry['athena'] = AthenaConnector` at bottom of file | [x] **Done early, build-20260925-1600.** Brought forward from its planned position because 3.5 is not reachable from the console without it |
| 3.10 | Browser smoke test: open built app, call `testConnection` from browser console with real credentials | [x] **PASS 2026-09-25, build-20260925-1619**, live Athena in `eu-west-1` from `http://localhost`. `testConnection` returns `{ ok: true }`. `athenaQuery` + `athenaGetResults` on a table-less `SELECT 1 AS one, 'abc' AS two` returned QueryExecutionId `2a70d9ec-...` and exactly one row `{ one: '1', two: 'abc' }`. Confirms three things: the `ClientRequestToken` fix works, decision D1 holds (no `QueryExecutionContext` sent and a table-less SELECT is accepted), and the repeated-header-row suppression in `athenaGetResults` behaves against real Athena output (1 row, not 2) |
| 3.11 | Browser smoke test for 3.4 and 3.8: `s3PutObject` against the live bucket, then `setupDatabase` end to end | [x] **PASS 2026-09-25, build-20260925-1718**, live AWS in `eu-west-1` from `http://localhost`. `s3PutObject` returned `s3://dq-accelerator-metada-store-512798217240-eu-west-1-an/smoke-test/probe.csv` with no CORS block -- the bucket CORS rule is now proven from a real browser origin, not just the simulated `Origin` header of the Phase 0 spike. `athenaCreateTableDDL` output reviewed and correct. `setupDatabase` returned 19 steps, all `ok: true`, in `ATHENA_TABLES` order (1 database + 18 tables, confirming decision D4 -- the four later SCHEMA additions are absent). A second run returned the same 19 successes, proving `IF NOT EXISTS` idempotency. **Steps used, retained for re-runs:** This is the first real browser preflight against S3 -- the Phase 0 spike only simulated an `Origin` header from Python, so the bucket CORS rule is proven for the first time here. User confirmed 2026-09-25 that the rule is applied to `dq-accelerator-metada-store-512798217240-eu-west-1-an` |

| 3.12 | Browser smoke test for 3.6: `importAllTables` against the live database | [ ] **Blocked on 3.7.** The 18 Athena tables exist after 3.11 but hold no data, so an import today can only prove "18 empty tables read without error" -- it cannot exercise the coercion in `athenaCoerceRecord`, the PK-drop path, or the duplicate-PK warning. Run this after 3.7 has uploaded a real dataset, as the read half of a full round trip: export local data, re-import it, and diff against the original. Until then the useful partial check is `const r = await AthenaConnector.importAllTables(cfg, (s,t,m) => console.log(s+'/'+t, m))` -- expect `r.ok === true`, 20 progress steps, `r.failedTables` empty, every `r.data` key an empty array, and exactly one warning naming the four tables from decision D7 |

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
| 5.4 | On success: call `dispatch({ type: 'LOAD_FROM_DB', data, resetSnapshot: true })` — resets base snapshot as well as local state | [ ] |
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
