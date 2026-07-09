# PLAN — KI-12 + KI-13: Delta Sync Hardening

See also: `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` (Gaps G3, G4)

Both changes are in `src/210_screen_import.js` only.

---

## KI-12 — Refresh master base snapshot after merge

**Problem:** `handleApplyMerge` writes the merged data via `onMerge(merged)` but never calls
`saveBaseSnapshot`. The master's snapshot stays at the originally imported version. Direct master
edits after a merge are invisible to subsequent conflict detection.

**Fix:** One line added to `handleApplyMerge` immediately after `onMerge(merged)`:

```js
saveBaseSnapshot(buildSnapshot(merged));
```

Both `saveBaseSnapshot` and `buildSnapshot` are globally available (defined in `71_master_version.js`).

---

## KI-13 — Warn on version mismatch when delta is imported

**Problem:** A steward delta carrying a stale `_base_version` is accepted without any warning.
Conflict detection may produce phantom conflicts because the reference snapshot does not match
the master's current state.

**Fix (two parts):**

**Part A — Compute mismatch at import time** (in `handleFile`, delta branch):

```js
const masterVersion  = loadBaseVersion();
const versionMismatch = !!(masterVersion && payload._base_version &&
  payload._base_version !== masterVersion);
setDeltaResult({ delta: payload, processResult, versionMismatch, masterVersion: masterVersion || 'unknown' });
```

**Part B — Show warning banner in `DeltaMergePanel`:**

Destructure `versionMismatch` and `masterVersion` from `deltaResult`. Render an amber warning
banner above the delta summary card when `versionMismatch` is true:

```
Version mismatch: delta built against <_base_version>, your version is <masterVersion>.
Conflict detection may be unreliable -- phantom conflicts are possible. You may still proceed.
```

The merge is not blocked — the master can proceed after reading the warning.

---

## Acceptance criteria

- After a merge, `moj_dq_base_snapshot` in localStorage reflects the merged state
- Importing a delta whose `_base_version` matches `loadBaseVersion()` shows no warning
- Importing a delta whose `_base_version` differs from `loadBaseVersion()` shows the amber banner
- The warning does not block the merge; all existing conflict resolution behaviour is unchanged
- Build passes clean
