# DESIGN — KI-9: Conflict Card Context & Show All Fields

## Problem

`DeltaConflictCard` currently shows only the columns that *differ* between master and steward (UPDATE conflicts) or the first four non-datetime columns (RETIRE conflicts). The card header shows a raw PK (e.g. "Data Quality Rule #2000015") with no human-readable label fields, forcing the master steward to open a separate tab to identify the record before making a resolution decision.

## Solution Overview

Two additions to `DeltaConflictCard` in `210_screen_import.js`:

1. **Context section** — always-visible identifying fields rendered *above* the diff, muted to distinguish from actual changes.
2. **Show all fields toggle** — collapses/expands to reveal every field in both master and steward rows.

No schema, state, or routing changes are needed. All data (`masterRow`, `stewardRow`, `schema.cols`) is already present in the component.

---

## Column Classification

### Context columns (UPDATE only)
- Non-PK, non-datetime columns **not already in `diffCols`**
- Up to 3 columns, taken in schema order
- Purpose: identify *which record* is being resolved

### Diff columns (unchanged)
- Columns that differ between master and steward (UPDATE)
- First four non-PK, non-datetime columns (RETIRE — existing behaviour)

### All columns (Show All mode)
- All non-PK columns from `schema.cols` in schema order

---

## Visual Behaviour

### UPDATE conflict — default (showAll = false)

```
┌─ Card header ──────────────────────────────────────────┐
│  Data Quality Rule #2000015  [UPDATE]  Unresolved      │
├─ Side-by-side grid ────────────────────────────────────┤
│  Master (current)       │  Steward change              │
│  ── context ────────────────────────────────────────── │
│  rule_name: [val]       │  rule_name: [val] (muted)    │
│  quality_dimension: [v] │  quality_dimension: [v]      │
│  ── changed ────────────────────────────────────────── │
│  rule_sql: [old sql]    │  rule_sql: [new sql] (green) │
├─ Footer ───────────────────────────────────────────────┤
│  Keep master  Accept steward  │  Show all fields ▼     │
└────────────────────────────────────────────────────────┘
```

### UPDATE conflict — expanded (showAll = true)

```
┌─ Card header ──────────────────────────────────────────┐
│  Data Quality Rule #2000015  [UPDATE]  Unresolved      │
├─ Side-by-side grid ────────────────────────────────────┤
│  Master (current)       │  Steward change              │
│  rule_name: [val]       │  rule_name: [val] (muted)    │
│  quality_dimension: [v] │  quality_dimension: [v]      │
│  rule_sql: [old sql]    │  rule_sql: [new sql] (green) │
│  is_active: true        │  is_active: true (muted)     │
│  ... (all fields)       │  ...                         │
├─ Footer ───────────────────────────────────────────────┤
│  Keep master  Accept steward  │  Hide fields ▲         │
└────────────────────────────────────────────────────────┘
```

### RETIRE conflict — default (showAll = false)

Existing four-column view on the left is retained as-is. Right panel shows amber retirement message.

Toggle button is added to the footer.

### RETIRE conflict — expanded (showAll = true)

All master fields shown on the left. Right panel unchanged (retirement message).

---

## Colour Conventions

| Element | Colour |
|---------|--------|
| Context col label | `var(--text3)` (muted) |
| Context col value — master | `var(--text2)` |
| Context col value — steward (unchanged) | `var(--text2)` |
| Section divider label "CHANGED" | `var(--text3)`, uppercase, 9px |
| Diff col value — master | `var(--text1)` (existing) |
| Diff col value — steward | `#22c98e` green (existing) |
| Show all / Hide fields button | `btn-ghost`, 11px, right-aligned in footer |
| Show All — unchanged steward value | `var(--text2)` (muted, not green) |
| Show All — changed steward value | `#22c98e` green |

---

## Scope

- **File changed:** `src/210_screen_import.js` — `DeltaConflictCard` component only (~100 lines)
- **No changes to:** `DeltaMergePanel`, `ImportScreen`, context, schema, localStorage, routing

---

## Out of Scope

- Collapsible auto-scroll to unresolved card
- Conflict sorting / filtering
- Light theme / contrast (KI-5 separate)
