# PLAN_V2_CLOUD_DATABASE — V2 Cloud Database Integration

**Design:** `designs/version-2/DESIGN_V2_CLOUD_DATABASE.md`  
**Date:** 2026-09-24  
**Status:** In implementation. Phases 0, 1 and 2 complete; Phase 3 partially complete and smoke-tested against live Athena (3.1, 3.2, 3.3, 3.5, 3.9, 3.10 all PASS) on branch `feature/athena-connector-core`. Remaining in Phase 3: 3.4 `s3PutObject`, 3.6 `importAllTables`, 3.7 `exportAllTables`, 3.8 `setupDatabase`.

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

Design section 5.4 has been amended to record D1. D2 and D3 are implementation detail below the level of the design doc and are recorded only here.

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
| 3.4 | Implement S3 helper: `s3PutObject(config, key, csvString)` | [ ] |
| 3.5 | Implement `testConnection(config)` — calls ListWorkGroups, returns ok/error | [x] **Done, build-20260925-1600.** Pre-flights the required fields for a readable error, then calls ListWorkGroups. Returns `{ ok }` / `{ ok, error }` exactly as the design interface specifies |
| 3.6 | Implement `importAllTables(config, onProgress)` — orchestrates 18 serial SELECT queries using 3.2 + 3.3, applies importSheet-style type coercion | [ ] |
| 3.7 | Implement `exportAllTables(config, data, onProgress)` — orchestrates 18 serial S3 upload + DROP + CREATE sequences with 3-attempt retry (2 s / 5 s backoff) | [ ] |
| 3.8 | Implement `setupDatabase(config, onProgress)` — CREATE DATABASE IF NOT EXISTS + 18 × CREATE EXTERNAL TABLE IF NOT EXISTS, DDL generated from SCHEMA constant | [ ] |
| 3.9 | Register connector: `ConnectorRegistry['athena'] = AthenaConnector` at bottom of file | [x] **Done early, build-20260925-1600.** Brought forward from its planned position because 3.5 is not reachable from the console without it |
| 3.10 | Browser smoke test: open built app, call `testConnection` from browser console with real credentials | [x] **PASS 2026-09-25, build-20260925-1619**, live Athena in `eu-west-1` from `http://localhost`. `testConnection` returns `{ ok: true }`. `athenaQuery` + `athenaGetResults` on a table-less `SELECT 1 AS one, 'abc' AS two` returned QueryExecutionId `2a70d9ec-...` and exactly one row `{ one: '1', two: 'abc' }`. Confirms three things: the `ClientRequestToken` fix works, decision D1 holds (no `QueryExecutionContext` sent and a table-less SELECT is accepted), and the repeated-header-row suppression in `athenaGetResults` behaves against real Athena output (1 row, not 2) |

**Key constraints:**
- **Every `StartQueryExecution` must carry a fresh `ClientRequestToken`.** AWS documents the field as optional because the official SDKs generate it silently; the raw API rejects the call with `InvalidRequestException: clientRequestToken is null or empty`. Handled inside `athenaQuery` by `athenaClientRequestToken()`, so callers get this for free -- but note **the token must never be reused across retry attempts in task 3.7**: Athena treats a repeated token as a repeat of the original request and returns the first `QueryExecutionId` rather than re-running the query, so a retry reusing a token would silently return the very failure it was meant to replace. Because `athenaQuery` mints a new token per call, a retry that re-invokes `athenaQuery` is already correct; a retry that caches and replays a payload would not be.
- `exportAllTables` must implement all-or-nothing semantics: if any table exhausts all 3 retry attempts, mark overall export as failed and return `{ ok: false, failedTables: [...] }`
- All Athena DDL strings must be generated dynamically from `SCHEMA` (not hardcoded per table)
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
