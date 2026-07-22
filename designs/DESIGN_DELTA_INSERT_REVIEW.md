# DESIGN — Delta Import: Insert Review Panel

## Overview

When a master steward imports a steward delta, all proposed inserts are currently applied blindly — only conflicts require review. This design adds an **Insert Review** section to the `DeltaMergePanel` so the master can inspect, approve, or reject individual inserted records before the merge is applied.

---

## Goal

Give the master steward visibility into every record a steward proposes to insert, grouped by table, with the ability to:
- Accept all inserts in one click (the fast path, default state)
- Reject specific records by unchecking them
- Drill into the full field values of any insert before deciding

---

## Scope

| In scope | Out of scope |
|----------|--------------|
| Reviewing and selectively rejecting proposed inserts in a delta | Reviewing auto-updates (master never touched, steward changed) |
| Per-table grouping with expand/collapse | Inline editing of insert field values |
| Row-level checkboxes with accept/reject | Filtering or sorting the insert list |
| Apply count reflects selection | Modifying the steward delta file itself |

---

## Layout Order in DeltaMergePanel

The panel renders top-to-bottom in this order — **no changes to the existing conflict section order**:

```
1. Version mismatch warning      (existing)
2. Delta summary card            (existing — shows insert count badge)
3. No-conflict notice OR         (existing)
   Conflict cards (N cards)
4. Insert Review section         (NEW — appears after all conflict cards)
5. Apply button                  (existing — updated label)
```

Conflicts are resolved first because they are blocking and require a decision before proceeding. Inserts come after: the master sees the full conflict picture first, then decides which new records to accept.

---

## UX Flow

### Fast path (trust all inserts)
1. Master resolves conflicts as normal.
2. Scrolls past the Insert Review section — all rows are pre-checked.
3. Clicks **"Apply merge (517 of 517 inserts)"** — proceeds as before.

### Selective review path
1. Master resolves conflicts.
2. Scrolls to Insert Review section, which shows a table-grouped summary.
3. Clicks **"Reject all"** on a suspicious table group (e.g. `stewardship`) to start from zero for that group.
4. Expands the group to inspect individual rows.
5. Checks specific rows to accept them.
6. Applies: **"Apply merge (67 of 517 inserts)"** reflects the reduced count.

### Full rejection
1. Master clicks global **"Reject all inserts"** button.
2. Apply button shows **"Apply merge (0 of 517 inserts)"** — still enabled; conflicts can still be merged without any inserts.

---

## Component Design

### New: `InsertReviewSection`

Rendered inside `DeltaMergePanel`, below the conflict cards. Receives:

```
props:
  remappedInserts    — { [tableName]: recordArray[] }  (already exists in processResult)
  selections         — { [tableKey: string]: boolean }  (new state in DeltaMergePanel)
  onToggleRow        — (tableKey, pkValue) => void
  onAcceptTable      — (tableName) => void
  onRejectTable      — (tableName) => void
  onAcceptAll        — () => void
  onRejectAll        — () => void
```

Where `tableKey` is `"tableName:pkValue"` (same pattern as conflict resolution keys).

**Section header row:**

```
Inserts — [selected] of [total] selected    [Accept all] [Reject all]
```

- "Accept all" and "Reject all" operate across all tables simultaneously.
- The counts update live as checkboxes change.
- If `total === 0`, the section is not rendered.

**Per-table group (`InsertTableGroup`):**

Each table that has at least one insert renders as a collapsible group card, styled consistently with conflict cards.

Group header (always visible):
```
▶ stewardship   450 inserts   [Accept table] [Reject table]   [N selected]
```

- Clicking the row or the chevron toggles expand/collapse.
- Collapsed by default to avoid overwhelming the screen on large imports.
- `[N selected]` badge shows how many of that table's inserts are currently checked, coloured green if all selected, amber if partial, grey if none.

Expanded body — compact table:
```
☑  | PK     | col1     | col2     | col3     | ... | [Show all]
☑  | 10042  | Alice    | Jones    | ...      | ... |
☐  | 10043  | Bob      | Smith    | ...      | ... |
```

- First column: checkbox (checked = accept, unchecked = reject).
- Remaining columns: PK field first, then all non-PK schema columns in definition order.
- Values are shown as-is (monospace, truncated to ~24 chars with ellipsis if long).
- A **"Show all fields"** link per row expands an inline sub-row showing the full record as a two-column `field | value` list, matching the visual language of conflict cards. Clicking again collapses it.
- Horizontal scroll if the table is wide.

---

## State Changes in `DeltaMergePanel`

Add one new state variable:

```js
const [insertSelections, setInsertSelections] = useState(() => {
  // default: all inserts accepted
  const initial = {};
  Object.entries(remappedInserts).forEach(([table, rows]) => {
    rows.forEach(row => {
      initial[`${table}:${row[SCHEMA[table].pk]}`] = true;
    });
  });
  return initial;
});
```

Helper values derived from state (no new state needed):

```js
const totalInserts    = Object.values(remappedInserts).reduce((s, a) => s + a.length, 0);
const selectedInserts = Object.values(insertSelections).filter(Boolean).length;
```

Handlers:

| Handler | Behaviour |
|---------|-----------|
| `handleToggleRow(tableKey)` | Flip the boolean at `insertSelections[tableKey]` |
| `handleAcceptTable(table)` | Set all keys for `table` to `true` |
| `handleRejectTable(table)` | Set all keys for `table` to `false` |
| `handleAcceptAll()` | Set all keys to `true` |
| `handleRejectAll()` | Set all keys to `false` |

---

## Apply Button

Label unchanged: `Apply merge and download report`

The selected/total insert count is shown in the **Insert Review section header** and in each **per-table group header** — not on the Apply button. This keeps the button label clean and consistent.

Enabled when: all conflicts resolved (unchanged). Zero selected inserts is allowed (user may want to merge only conflict resolutions and auto-updates, rejecting all inserts).

---

## Changes to `applyMergedChanges` (71_master_version.js)

Current signature:
```js
function applyMergedChanges(base, remappedInserts, autoApplyUpdates, resolvedConflicts)
```

New signature:
```js
function applyMergedChanges(base, remappedInserts, autoApplyUpdates, resolvedConflicts, insertSelections)
```

Change in the inserts pass (currently line 186-188):

```js
// BEFORE
merged[table] = [...(existing), ...remappedInserts[table]];

// AFTER — filter by selection
const accepted = remappedInserts[table].filter(row => {
  const key = `${table}:${row[SCHEMA[table].pk]}`;
  return insertSelections[key] !== false;  // true or missing = accept
});
merged[table] = [...(existing), ...accepted];
```

The `insertSelections` parameter is passed from `handleApplyMerge` in `ImportScreen`, which already passes `resolutions` down the same call chain.

---

## Merge Report Update

The merge report JSON (downloaded on apply) should record insert decisions:

```json
"inserts_summary": {
  "total_proposed": 517,
  "accepted": 67,
  "rejected": 450,
  "rejected_by_table": {
    "stewardship": 450
  }
}
```

This gives the master an audit trail of which inserts were skipped and why (answerable by reviewing the table name).

---

## Files to Change

| File | Change |
|------|--------|
| `src/210_screen_import.js` | Add `insertSelections` state + handlers; add `InsertReviewSection` + `InsertTableGroup` components; update Apply button label; pass `insertSelections` to `onApply` |
| `src/71_master_version.js` | Add `insertSelections` parameter to `applyMergedChanges`; filter inserts before merge; add rejected count to merge report |

No new files required. No schema changes. No routing changes.

---

## Acceptance Criteria

1. The Inserts Review section appears below all conflict cards and above the Apply button.
2. All inserts are pre-checked (accepted) on load — the fast path requires zero extra clicks.
3. Each table group is collapsed by default; clicking the header expands it.
4. Per-table "Accept table" / "Reject table" buttons toggle all rows in that group.
5. Global "Accept all" / "Reject all" buttons toggle all rows across all tables.
6. The Apply button label reads "Apply merge (N of M inserts)" and updates live.
7. Clicking Apply with some inserts unchecked applies only the checked rows; unchecked rows are absent from the merged dataset.
8. The downloaded merge report includes `inserts_summary` with accepted/rejected counts.
9. The section is not rendered if `totalInserts === 0`.
10. "Show all fields" per row expands an inline detail view; clicking again collapses it.
