# CHANGELOG_V2.md

Changes for DQ Accelerator **v2** — Cloud Database Integration line.

For v1 history see `CHANGELOG.md`.

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

