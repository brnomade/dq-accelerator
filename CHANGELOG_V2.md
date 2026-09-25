# CHANGELOG_V2.md

Changes for DQ Accelerator **v2** — Cloud Database Integration line.

For v1 history see `CHANGELOG.md`.

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

