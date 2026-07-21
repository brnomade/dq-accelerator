# DESIGN — Data Browser

**Design approved:** 2026-07-21 (in-conversation review)

---

## Problem

The master steward has no way to inspect raw table data inside the application. To audit records
or investigate issues, they must export a full backup and open it in Excel. This is slow and
error-prone. A lightweight in-app inspector removes the round-trip.

---

## Scope

Master steward only. Not visible to regular stewards. Read-focused: no add/edit form
panels, no FK resolution, no display labels. The goal is "database client" access to the raw
state of all 22 SCHEMA tables.

---

## Layout

Single screen with a two-panel layout:

```
[ Left panel ]  [ Right panel                                    ]
[ table list ]  [ Toolbar: table name | filter | show-retired    ]
[             ] [ ─────────────────────────────────────────────  ]
[             ] [ col1  (PK)  col2  (FK)  col3 ...               ]
[             ] [ row data ...                                    ]
[             ] [ row data (retired, amber tint, Undo button) ... ]
```

---

## Left panel

- Lists all 22 SCHEMA tables alphabetically by physical name (`Object.keys(SCHEMA).sort()`)
- Monospace font for table names
- Each row shows: active row count | retired count in amber if non-zero (`+N`)
- Selected table: accent left border + `var(--row-hover)` background
- Width: 224 px, fixed

---

## Right panel — toolbar

- Selected table name in monospace accent colour (read-only label)
- Free-text filter bar: matches any column value (case-insensitive substring)
- "Show retired" checkbox (default: off)
- Row count display: `N rows`

---

## Right panel — data grid

- Columns in SCHEMA order, PK column first
- Column headers: `col.name` (physical, monospace), sortable (click header to sort asc/desc;
  click again to reverse; arrow indicator `↑`/`↓`)
- **PK badge**: amber inline badge on the PK column header
- **FK badge**: blue inline badge on FK column headers
- Null values: rendered as italic `null` in secondary text colour
- PK and FK cell values: monospace font
- Retired rows (when shown): 5% amber tint + 0.6 opacity
- **Undo retirement**: when "Show retired" is on, retired rows get a small amber "Undo" button
  that calls `restoreRecord(table, pkValue)`
- Sticky header row

---

## Constraints

- No edit, add, or retire actions beyond "Undo retirement"
- Physical names (`col.name`) throughout — no `col.label`, no `schema.label`
- No FK resolution — raw integer values only
- Non-ASCII characters: use `'↑'`/`'↓'` JS escapes for arrows; no raw non-ASCII
- Guard against non-master access: show a "master only" message if `!isMaster`
