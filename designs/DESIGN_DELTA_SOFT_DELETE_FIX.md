# Design: Delta Export — Soft-Deleted New Rows Bug Fix

## Problem

`buildDelta()` in `71_master_version.js` classifies every row **not present in the base snapshot** as `inserted`, regardless of whether it has a `retiring_timestamp`. This produces incorrect delta files in two observable ways:

1. **Born-and-died records leaked to master** — a steward creates a record and later soft-deletes it (all within one working session, before any delta export). The record was never in the master. From the master's perspective it does not exist and should never be created. Yet the delta exports it as an `inserted` row — with `retiring_timestamp` set — instructing the master to insert a record that is already dead.

2. **Misleading co-appearance in delta** — when the same delta also contains legitimate `updated` entries (e.g., a real CDE edit), the spurious `inserted`-with-`retiring_timestamp` entry appears alongside them, making the delta look as if the CDE edit produced a duplicate row.

## Existing behaviour (correct cases, must be preserved)

| Row state | In snapshot? | retiring_timestamp? | Current outcome | Correct? |
|---|---|---|---|---|
| Unchanged | Yes | No | Not in delta | ✓ |
| Modified | Yes | No | `updated` | ✓ |
| Soft-deleted | Yes | Yes | `retired` (id only) | ✓ |
| Restored | Yes | No (was Yes) | `updated` | ✓ |
| Newly created | No | No | `inserted` | ✓ |
| **Created then soft-deleted** | **No** | **Yes** | **`inserted` ← bug** | **✗** |

## Fix

Single guard added to the `!wasSnap` branch of `buildDelta()`:

```js
// Before
if (!wasSnap) {
  inserted.push(row);
}

// After
if (!wasSnap) {
  if (!row.retiring_timestamp) inserted.push(row);
}
```

Rows that were born and died entirely within the steward's working session are silently omitted. The master never knew about them, so there is nothing to communicate.

## Scope

- **File changed**: `src/71_master_version.js` — two lines touched inside `buildDelta()`
- **No other files change**: `buildSnapshot`, `processDelta`, `applyMergedChanges`, `230_screen_export.js` are all unaffected
- **Delta import side unchanged**: `processDelta` does not need to handle this case because the malformed `inserted`-with-`retiring_timestamp` rows will no longer arrive

## Edge cases

**Steward creates a record, exports delta (correctly included in `inserted`), then soft-deletes it before master merges**  
— First delta: record has no `retiring_timestamp` → included in `inserted` correctly  
— Second delta (if the steward exports again before master merges): record has `retiring_timestamp`, NOT in snapshot → skipped by the fix  
— Master received the insert in delta 1. If master merges delta 1, re-exports master, and steward re-imports, the record is now in the snapshot. On the next delta export the soft-delete will appear as `retired` (correct path).  
— Net: the potential gap (delta 1 was never merged) is the same ambiguity that exists today for any unmerged delta. No regression.

**Snapshot includes retired rows**  
`buildSnapshot` hashes ALL rows including those with `retiring_timestamp`. This is intentional — if master has a retired row, a steward restoring it must be communicated as an `updated` (hash change, no `retiring_timestamp`). This behaviour is unchanged.

## What this does NOT fix

The `includeSoftDeleted` toggle on the Export screen currently applies only to backup CSV exports — not to delta exports. This is a separate UX concern. The delta export correctly communicates retirements via the `retired` array; the toggle concept does not map naturally onto delta semantics. That is a separate design decision and is out of scope here.
