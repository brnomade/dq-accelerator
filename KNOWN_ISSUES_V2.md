# KNOWN_ISSUES_V2.md

Tracks confirmed bugs for DQ Accelerator **v2**.

For v1 issues see `KNOWN_ISSUES.md`.

Status labels: `open` · `investigating` · `fixed`

---

| #     | Status | Area | Summary |
|-------|--------|------|---------|
| V2-01 | open | Cloud DB / Athena import | **`datetime` values lose their time component through a cloud round trip.** `athenaCoerceRecord` rebuilds a `datetime` from local date parts only, so `2026-08-19T15:18:39.106Z` returns as `2026-08-19`. Confirmed by the task 3.13 round trip 2026-09-25 on all 47 retired rows. This is deliberate parity with `importSheet`, which truncates identically for the same reason (`toISOString` would shift the day west of UTC), so it predates V2 and affects every `datetime` column, not just `retiring_timestamp`. **No impact found today:** every read of `retiring_timestamp` in `src/` is a truthiness test, a retired-row count, or a write -- nothing sorts by it, compares two of them, or renders the value. **The one dependency:** `buildDelta` hashes whole records, so truncation changes the hash and would re-report these rows as `retired`; task 5.4's `resetSnapshot: true` prevents this by rebuilding the baseline from the imported data. Fixing the truncation would mean changing `importSheet` too, and nothing currently needs it. |
