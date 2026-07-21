# PLAN — Delta Conflict Card Redesign

**Design approved:** 2026-07-21 (in-conversation review)
**Paired design:** no separate design doc — design agreed verbally, recorded in this plan.

---

## Problem

The current `DeltaConflictCard` in `210_screen_import.js` presents conflict data in a
UX-friendly but physically inaccurate way:

- Table name shows the display label (`CDE Criticality`) not the physical name (`cde_criticality`)
- Header ID shows `#182` with no PK field name
- Column names show display labels (`Group`, `Level`) not physical column names
- PK field is excluded from the field list with no explicit PK indicator anywhere
- Each field takes two rows (label stacked above value) instead of one inline row

## Design

Replace the two-panel side-by-side layout with a single unified 3-column diff table:

```
field_name           │ master        │ steward
─────────────────────┼───────────────┼───────────────
cde_criticality_id   │ 182           │ 182       ← PK row, amber PK badge, always shown
criticality_group_id │ 2             │ 3         ← changed row, amber row tint, green steward value
criticality_level_id │ 1             │ 2         ← changed row
retiring_timestamp   │ null          │ null      ← unchanged, shown only when expanded
```

**Header:** `cde_criticality · cde_criticality_id: 182 │ UPDATE │ Unresolved`
- Raw table name (physical), raw PK field name + value, existing badges

**Column names:** `col.name` throughout — no `col.label` anywhere in the card

**PK row:** first row, always visible, amber `PK` badge inline after field name

**Changed rows (update):** subtle amber row tint + green steward value + medium weight

**Default collapsed view (update):** PK row + changed rows only
**Expanded (show all fields):** all rows including unchanged

**Retire conflicts:** all master rows shown (so master can see what would be lost); steward
column shows `--` for all value cells; an amber notice row spans all 3 columns at top
of body: "Steward proposes to retire this record". No "Show all fields" toggle for retires.

## File

`src/210_screen_import.js` — replace `DeltaConflictCard` function (lines 4–179)

## Non-ASCII constraint

Middle dot separator uses `{'·'}` (JS string literal in JSX expression). No raw
non-ASCII characters in text nodes.

## Mandatory end-of-task steps

- Update CHANGELOG.md and SESSION_METRICS.md before build
- Run `python build.py`
- No APP_TREE.md update needed (no new files or routes)
- No user guide update needed (internal UI change, no workflow change)
