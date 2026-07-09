# DESIGN — Profiling Page Enhancements: CDE Completion Indicator & Logical Type Column

**Date:** 2026-06-29  
**Status:** Approved for implementation  
**Scope:** `200_screen_ddl.js` only — no schema changes, no new files

---

## Enhancement A — CDE Completion Indicator on Table Row

### Problem

The table row in the Profiling page shows a `profiled` badge when a DDL record exists for that table.  
There is no indicator to show when **all CDE-origin fields** on that table have been individually field-profiled.  
This distinction matters because DDL profiling (table structure) and field profiling (column statistics) are separate steps.

### Data available

Each `fields` array entry in a table group has:
- `origin` — `'CDE'`, `'SQL'`, or `'CDE+SQL'`
- `profiling` — `null` if not profiled, or a `field_profiling` record if profiled

The table group also has `cdeCount` — the number of CDE-origin fields.

### Proposed logic

```js
const cdeFields = fields.filter(f => f.origin === 'CDE' || f.origin === 'CDE+SQL');
const allCdesProfiled = cdeFields.length > 0 && cdeFields.every(f => !!f.profiling);
```

A `CDE+SQL` field is treated as "done" once it has any profiling record, regardless of its SQL origin.

### Visual treatment

A new badge is added in the `TableGroupRow` header row, immediately after the existing `profiled` badge:

- Label: `CDEs ✓`
- Colour: `var(--green)` (same as the existing profiled badge)
- Style: same pill style (border, background tint, mono font, 9px)
- Tooltip: `"All CDE fields on this table have been profiled"`
- Only shown when `allCdesProfiled === true`

The badge does **not** replace the existing `profiled` badge — both can appear together.  
The `profiled` badge covers DDL (table structure); the new badge covers field-level CDE completeness.

---

## Enhancement B — Physical Type and Logical Type Columns

### Problem

Each field row currently shows a single "Type" column with the physical DDL type.  
The logical (semantic) type — set by the steward when profiling a field — is stored on `field_profiling.semantic_type` but is never surfaced in the field row.  
Stewards must open the Profile panel to see whether a semantic override has been applied.

### Data available

- Physical type: `fieldEntry.type` (from DDL `parsed_columns`)
- Logical type: `fieldEntry.profiling?.semantic_type` (from `field_profiling` record, may be null)

### Grid changes

The field row and column header share a grid template. A new 60px column is added between the physical type column and the rules column. The `DimCoverageFooter` grid also gains a matching 60px blank column to keep the dimension coverage dots aligned.

| Component | Before | After |
|-----------|--------|-------|
| `FieldRow` grid | `22px 60px 1fr 60px 44px repeat(N,38px) 96px` | `22px 60px 1fr 60px 60px 44px repeat(N,38px) 96px` |
| Column header grid (in `TableGroupRow`) | same as above | same as above |
| `DimCoverageFooter` grid | `1fr 60px repeat(N,38px) 52px 96px` | `1fr 60px 60px repeat(N,38px) 52px 96px` |

### Column header labels

| Before | After |
|--------|-------|
| `Type` | `Phys Type` |
| _(new)_ | `Log Type` |

### Logical type cell rendering

- If `fieldEntry.profiling?.semantic_type` is set: display value in `var(--purple)` (the profiling accent) with mono font, matching the colour used in the profiling panel header
- If null or empty: display `—` (em dash) in `var(--text3)` (dimmed, not distracting)

### No tooltip or extra chrome needed

The label "Log Type" combined with the purple colour is sufficient. The full value is visible in the cell.

---

## Constraints

- No non-ASCII characters in JS source — `✓` (checkmark) and `—` (em dash) must be used as escape sequences
- Grid template strings must match exactly between `FieldRow`, the column header div in `TableGroupRow`, and `DimCoverageFooter`
- Both enhancements touch only `200_screen_ddl.js`
