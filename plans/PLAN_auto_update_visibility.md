# PLAN: Show Auto-Updates in Delta Merge Panel

**Date:** 2026-09-03  
**Status:** Draft — awaiting approval before implementation  
**File affected:** `src/210_screen_import.js`

---

## Goal

When the master steward loads a steward delta file, auto-updates (changes the system applies without user intervention) are currently invisible except for a count badge. This plan adds an inspectable, collapsible section so users can see exactly which records and fields are being changed automatically before they click Apply.

---

## Background

`autoApplyUpdates` is an array of `{ table, row }` objects where `row` is the steward's proposed record (post-PK remap). Auto-updates occur when the master record has not changed since the base snapshot, so there is no conflict — the steward's change is trusted and applied silently.

The master row (the "before" state) must be looked up from `data` in context using the table name and the PK value from the steward row.

---

## Steps

### Step 1 — Add `AutoUpdateCard` component (`210_screen_import.js`, after `DeltaConflictCard`)

A read-only diff card. Props: `{ table, row, masterRow }`.

Behaviour:
- Computes `changedColNames` the same way `DeltaConflictCard` does: non-PK columns where `String(masterRow[col]) !== String(row[col])`.
- Renders a two-column diff table (no "steward" column label — just "before" and "after") showing **changed fields only** by default.
- Has a "Show all fields" toggle (same as `DeltaConflictCard`) to reveal unchanged fields.
- Header shows: `table | pk: value` and a green `AUTO` badge.
- Left border: `var(--green)` to distinguish from amber conflict cards.
- No action buttons — purely informational.

Column headers: `field` / `before` / `after`.

Changed field highlight: `after` cell uses `color: var(--green), fontWeight: 500`.

---

### Step 2 — Add `AutoUpdateSection` component (`210_screen_import.js`, after `AutoUpdateCard`)

A collapsible section wrapper. Props: `{ autoApplyUpdates, masterData }`.

- Returns `null` when `autoApplyUpdates.length === 0`.
- State: `expanded` (default `false`).
- Header: `"Auto-updates — N applied automatically"` with a `[+]` / `[-]` toggle and a small green `AUTO` badge, styled consistently with the `InsertReviewSection` header.
- When expanded, renders one `AutoUpdateCard` per entry, looking up the master row via:
  ```js
  const masterRow = (masterData[table] || []).find(r => r[SCHEMA[table].pk] === row[SCHEMA[table].pk]);
  ```
- If master row cannot be found (edge case), skip rendering the card for that entry.

---

### Step 3 — Wire up in `DeltaMergePanel` (`210_screen_import.js`, lines 413–575)

1. Add `const { data } = useApp();` at the top of `DeltaMergePanel`.
2. Insert `<AutoUpdateSection>` between the no-conflict notice / conflict cards block and the `<InsertReviewSection>` block:

```
[version mismatch warning]
[summary card]
[no-conflict notice]          ← existing
[conflict cards]              ← existing
[AutoUpdateSection]           ← NEW, collapsed by default
[InsertReviewSection]         ← existing
[Actions]                     ← existing
```

Pass `autoApplyUpdates={autoApplyUpdates}` and `masterData={data}`.

---

### Step 4 — Build and browser test

Pre-generate build ID:
```bash
python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"
```

Write CHANGELOG.md and SESSION_METRICS.md entries, then:
```bash
cd build && python build.py
```

**Test scenarios:**
1. Load a delta with auto-updates — section appears collapsed; expand it and verify each card shows the correct before/after diff.
2. Load a delta with zero auto-updates — section is absent entirely.
3. "Show all fields" toggle on a card with unchanged fields works correctly.
4. Conflicts and inserts sections still work normally alongside the new section.
5. Apply merge still works; auto-updates are applied as before (no logic change).

---

## What is NOT changing

- The `processDelta` / `applyMergedChanges` logic in `71_master_version.js` — no change.
- Auto-updates remain applied automatically on "Apply merge"; this is purely a display addition.
- The summary badge count ("N auto-updates") remains.
