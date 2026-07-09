# Step 1 — Data Bootstrap Layer

**Status:** Complete  
**Deliverable:** `dq_store_v1.html`  
**Date completed:** June 2026  

---

## Overview

Step 1 establishes the foundational data layer for the MoJ Data Quality Store Metadata Editor. It has no backend, no build pipeline, and no installation — it runs entirely in a browser from a single HTML file. All six tasks were implemented and delivered together.

---

## Tasks completed

### Task 1 — Internal data model

All 18 database tables are defined in a single `SCHEMA` constant. Each table definition includes:

- `pk` — the primary key field name
- `cols` — array of column definitions, each with `name`, `type`, `label`, and optionally `fk`
- `readOnly` — flag for reference/lookup tables that are not editable in the UI
- `label` — human-readable display name

**Column types** used across the schema: `int`, `str`, `float`, `bool`, `datetime`, `text`

**FK definitions** — every foreign key column carries a `fk` object with three fields:
- `table` — the referenced table name
- `field` — the referenced primary key column
- `display` — the column to show in dropdowns and resolved labels (never a raw ID)

**Table classification:**

| Classification | Tables |
|---|---|
| Editable | `critical_data_set`, `critical_data_element`, `data_quality_rule`, `data_quality_rule_allocation`, `cde_criticality`, `stewardship`, `executive_agency`, `directorate`, `data_patron`, `data_owner`, `data_steward`, `criticality_group_weight`, `quality_dimension_weight` |
| Read-only (reference) | `executive_agency_type`, `steward_role_type`, `quality_dimension`, `criticality_group`, `criticality_level` |

---

### Task 2 — Excel / CSV importer

A drag-and-drop file picker accepts the master Excel workbook (`.xlsx`). On drop or file selection:

1. `SheetJS` reads the binary into an `ArrayBuffer`
2. Each sheet is mapped to its target table via `SHEET_MAP` (18 sheet-name → table-name pairs)
3. `importSheet()` iterates each row, picks only the canonical schema columns, and coerces every value to the correct type using `coerceValue()`
4. Rows with a null primary key (Excel trailing blank rows) are dropped
5. An import log is produced — one entry per table showing row count, or a warning if a sheet was not found

**Helper column stripping** — the following column categories are explicitly excluded from import and never stored in state:

- Excel `Unnamed:` columns
- SQL template helper columns (`Column1`, `SQL CODE: …`, `SQL SAMPLE: …`, `Composed Rule`, `Composed Sample`)
- Display-only lookup columns that duplicate FK data (`directorate_name`, `agency_acronymn`, `data_set_name`, `dimension_name`, `rule_name`, `role_description`, `criticality_group_description`, `criticality_description`, etc.)

**Type coercion rules:**

| Schema type | Coercion logic |
|---|---|
| `int` | `parseInt()`, null on NaN |
| `float` | `parseFloat()`, null on NaN |
| `bool` | Pass-through for JS booleans; `"true"` → `true` for strings |
| `datetime` | ISO string if JS `Date`; Excel serial decoded via SheetJS; null if empty |
| `str` / `text` | `String().trim()`, null if empty string |

---

### Task 3 — ID resolution engine

Two utility functions are available to all UI components:

- **`buildLookups(data)`** — iterates all 18 tables and builds a `{tableName}ById` map (id → full row object). Called once after import and after any state change.
- **`resolveFk(maps, fkDef, id)`** — resolves a foreign key ID to its display string using the prebuilt maps. Returns `'—'` for null, `[id]` for broken references.
- **`getFkOptions(data, fkDef)`** — returns `{ value, label }` pairs for dropdown population, filtering out retired records (where `retiring_timestamp` is set).

No UI component ever displays or requires entry of a raw integer ID.

---

### Task 4 — localStorage persistence

| Function | Behaviour |
|---|---|
| `saveToStorage(data)` | Serialises full state + `savedAt` timestamp to `localStorage` under key `moj_dq_store_v1` |
| `loadFromStorage()` | Returns parsed state on load, or null if nothing stored |
| `clearStorage()` | Removes the key entirely (used by the Reset action) |

**On app load:** localStorage is checked first. If data exists, the import screen is skipped and the app goes directly to the Data Health tab, showing the last saved state with a timestamp in the header.

**On import:** state is saved to localStorage immediately after the workbook is parsed.

**Reset:** a confirmation prompt in the header clears localStorage and returns the app to the import screen.

---

### Task 5 — Data health check

`runHealthCheck(data)` runs on every load of the Data Health tab. It produces:

- **`tableCounts`** — per-table counts of `total`, `live` (no `retiring_timestamp`), and `retired` records
- **`issues`** — array of FK integrity violations, each with: `table`, `pk`, `field`, `value`, `refTable`, `msg`

**FK validation logic:** for every FK column in every table, the set of valid IDs is built from the referenced table. Any record whose FK value is not in that set is reported as an issue.

The health check UI displays:
- Three summary counters: total live records, total retired records, total FK issues
- Tables organised into four logical groups (see display groups below), each showing a live count, retired count, and FK issue count
- A detailed issue list (capped at 50 displayed, with overflow count) if any issues exist

---

### Task 6 — CSV export core

**`tableToCSV(tableName, data, includeSoftDeleted = false)`**  
Produces a CSV string for a single table:
- Header row uses the exact canonical column names from the schema
- No helper or display columns are included
- Rows where `retiring_timestamp` is non-null are excluded unless `includeSoftDeleted` is `true`
- Values are RFC-4180 escaped (commas, quotes, and newlines trigger double-quote wrapping)

**`exportSingleCSV(tableName, data, includeSoftDeleted)`**  
Downloads a single `{tableName}.csv` via `Blob` + `URL.createObjectURL`.

**`exportAllCSVs(data, includeSoftDeleted)`**  
Bundles all 18 CSVs into a zip via JSZip, downloaded as `dq_export_YYYYMMDD_HHMMSS.zip`. Each CSV inside the zip is named exactly as its table name (e.g. `critical_data_element.csv`).

**Export UI additions:**
- Per-group "Export group" button downloads only the tables in that group as a zip
- Per-table individual download button on every row
- `includeSoftDeleted` toggle (default off) applies uniformly to all export actions

---

## Display grouping — `TABLE_GROUPS`

All UI views (Data Health, Export) organise tables into four named groups. This constant is the single source of truth for grouping and will also drive the navigation sidebar in Step 2.

| Order | Group | Accent colour | Tables |
|---|---|---|---|
| 1 | **Data Quality Elements** | Green `#22c98e` | `critical_data_set`, `critical_data_element`, `data_quality_rule`, `data_quality_rule_allocation`, `cde_criticality`, `stewardship` |
| 2 | **Ownership Hierarchy** | Blue `#4f8ef7` | `executive_agency`, `directorate`, `data_patron`, `data_owner`, `data_steward` |
| 3 | **Weights & Thresholds** | Amber `#f5a623` | `criticality_group_weight`, `quality_dimension_weight` |
| 4 | **Core Settings** | Grey `#4e5e80` | `executive_agency_type`, `steward_role_type`, `quality_dimension`, `criticality_group`, `criticality_level` |

Reference (read-only) tables are visually tagged with a `ref` pill in the Health view.

---

## Technical dependencies

All loaded from CDN at runtime — no installation required.

| Library | Version | CDN | Purpose |
|---|---|---|---|
| React | 18.2.0 | cdnjs | UI framework |
| ReactDOM | 18.2.0 | cdnjs | DOM rendering |
| Babel standalone | 7.23.2 | cdnjs | In-browser JSX compilation |
| SheetJS (xlsx) | 0.18.5 | cdnjs | Excel workbook parsing |
| JSZip | 3.10.1 | cdnjs | ZIP bundle for CSV export |

Fonts: IBM Plex Sans + IBM Plex Mono via Google Fonts.

---

## Known constraints and notes

- **localStorage size limit** — browsers typically allow 5–10 MB. The full dataset at current volume is well within this. If data grows significantly, IndexedDB would be the migration path.
- **No multi-tab sync** — changes in one tab are not reflected in another tab until page reload.
- **Babel standalone** compiles JSX at runtime on first load; there is a ~1–2 second parse delay on very slow machines. This is acceptable for a desktop-only internal tool.
- **Excel `cellDates: true`** is passed to SheetJS so date serial numbers are parsed to JS `Date` objects before coercion to ISO strings.

---

## Files

| File | Description |
|---|---|
| `dq_store_v1.html` | Complete Step 1 deliverable — open in any modern browser |

---

*Next: Step 2 — Navigation shell, hierarchical sidebar, app routing, and global state context.*
