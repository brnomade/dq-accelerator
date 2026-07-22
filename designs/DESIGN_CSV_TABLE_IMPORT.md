# DESIGN: Single-Table CSV Import

## Purpose

Allow a user to fix data problems in a specific table (including duplicate PKs, corrupted values, or bad references) by exporting that table's CSV from the backup, editing it externally, and reimporting just that table to replace its content entirely.

This extends the existing Import screen with a third import mode: **Single Table CSV**.

---

## Problem Statement

The existing import paths are:
- **Excel workbook** — replaces all 20 tables at once; too coarse for a surgical fix
- **Master JSON** — full dataset round-trip; requires JSON editing and manual FK chasing
- **Delta JSON** — cannot change PKs; identifies updates by PK so PK fixes are structurally impossible

None of these support the workflow: *export one table → fix rows in a spreadsheet → reimport just that table*.

---

## Merge Semantics: Full Replace

When a CSV is imported, the target table's content is **completely replaced** by the rows in the CSV. No upsert, no merge. After the operation the table contains exactly and only the rows in the file.

Rationale: upsert-by-PK cannot fix duplicate PKs (it can't disambiguate which duplicate to keep). Full replace is the only strategy that handles all data fix scenarios correctly.

---

## Table Detection

Exported CSVs are named `<table_name>.csv` (e.g. `critical_data_element.csv`) by the existing `buildAllCSVsBlob()` function. The import uses the filename (minus `.csv`) to identify the target table by matching against SCHEMA keys.

If the filename does not match any SCHEMA table name, the import is blocked with an explanatory error.

**All tables are replaceable.** There is no restriction on which tables can be imported, including reference/lookup tables. The user is responsible for the correctness of the data they load.

---

## Access Control

This feature is **master-only**. The "Single Table CSV" tab is only rendered when `isMaster === true` (already available via `useApp()` in `210_screen_import.js`). Steward users do not see the tab.

---

## User Workflow

```
Import screen → "Single Table CSV" tab  (master users only)
  → Drop / select a .csv file
  → System detects table from filename
  → System parses CSV and validates content
  → Preview panel appears:
      - Table name (display label)
      - Current row count  →  Incoming row count  (delta)
      - FK warning list (outbound + inbound, if any)
  → User clicks "Replace Table" (or "Cancel")
  → Table is replaced in app state; localStorage saved
  → Success message with row count
```

---

## UI Layout

### Tab: Single Table CSV

```
┌─────────────────────────────────────────────────────────────┐
│  Drop a CSV file here, or click to select                   │
│  File must be named <table_name>.csv                        │
└─────────────────────────────────────────────────────────────┘
```

**After a valid file is loaded — Preview panel:**

```
┌─────────────────────────────────────────────────────────────┐
│  Table: Critical Data Element                               │
│  Rows:  Current 42  →  Incoming 41  (−1 row)               │
│                                                             │
│  ⚠  FK Warnings (2)                                        │
│     • 3 rows in "Data Quality Rule Allocation" will be      │
│       orphaned after this replace.          [Show rows]     │
│     • 1 incoming row references Critical Data Set values    │
│       that do not exist in this database.   [Show rows]     │
│                                                             │
│     ▼ Expanded outbound card:                               │
│     ┌──────────────────┬──────────────────┬──────────────┐  │
│     │ id               │ name             │ cds_id ⚠     │  │
│     │ 101              │ Policy Ref       │ 99 (amber)   │  │
│     └──────────────────┴──────────────────┴──────────────┘  │
│                                                             │
│  Warnings are informational. You may still proceed.         │
│                                                             │
│  [ Cancel ]                [ Replace Table ]               │
└─────────────────────────────────────────────────────────────┘
```

Warnings are informational — they do **not** block the import. The user sees the impact and decides. This matches the approach used by the existing delta merge conflict UI.

**Error states (block import):**
- Filename does not match any table: "Cannot identify table from filename. Rename the file to match a table name (e.g. critical_data_element.csv)."
- CSV is empty or has no rows after the header: "The CSV contains no data rows."
- CSV header does not contain the table’s PK column: "CSV is missing required column ‘{pk}’. This file may not belong to the selected table."

---

## Data Flow

```
User drops file.csv
  │
  ├─ Read as text  (FileReader)
  │
  ├─ Detect table from filename
  │     match filename (strip .csv) against Object.keys(SCHEMA)
  │     block if no match or readOnly
  │
  ├─ Parse via SheetJS
  │     XLSX.read(text, { type: 'string' })
  │     importSheet(ws, tableName)   ← reuses existing function unchanged
  │     → newRows[]
  │
  ├─ Validate header
  │     check PK column present in parsed rows
  │
  ├─ validateCsvReplace(tableName, newRows, currentData)
  │     → warnings[]  (see below)
  │
  ├─ Show preview panel
  │
  └─ On confirm:
        newData = { ...data, [tableName]: newRows }
        onImport(newData, [])
        save to localStorage (handled by onImport)
```

---

## FK Validation: Two Directions

A new utility function `validateCsvReplace(tableName, newRows, currentData)` is added to `20_data_utils.js`. It returns an array of warning objects; an empty array means no integrity concerns.

### Outbound FKs (new rows reference other tables)

For each FK column defined on `tableName` in SCHEMA, check that every non-null value in `newRows` for that column exists as a PK in the referenced table (using current in-memory data).

Example: importing `critical_data_element.csv` — every `critical_data_set_id` value must exist in `data.critical_data_set`.

### Inbound FKs (other tables reference this table)

For each other table in SCHEMA, for each of its FK columns that points to `tableName`, check whether any existing row in that table references a PK that will no longer exist after the replace (i.e. not present in `newRows`).

Example: importing `critical_data_element.csv` — any `data_quality_rule_allocation` rows whose `critical_data_element_id` is not in the incoming CSV will become orphaned.

### Warning object shape

```js
{
  direction: 'outbound' | 'inbound',
  // outbound:
  field: string,          // FK column name on the imported table
  targetTable: string,    // table being referenced
  count: number,          // number of incoming rows with broken FK
  brokenRows: object[],   // the actual incoming rows with the broken FK value
  // inbound:
  sourceTable: string,    // table holding the FK column
  sourceField: string,    // FK column name in sourceTable
  count: number,          // number of existing rows that will be orphaned
  orphanedRows: object[], // the actual existing rows that will be orphaned
}
```

### FK Warning Card (expandable)

Each warning is rendered as a `CsvFkWarningCard` component. The card shows the one-line summary with a **Show rows** toggle button. When expanded, it renders a full table of all columns for the affected rows, with the FK column highlighted in amber.

- **Outbound card**: shows the incoming CSV rows that have the broken FK value — all columns visible, FK column highlighted.
- **Inbound card**: shows the existing rows from the other table that will be orphaned — all columns of that other table visible, the FK column highlighted.

This matches the visual language of the delta import conflict card (`DeltaConflictCard`): monospace table, amber highlight for the column of interest, collapse/expand toggle.

---

## CSV Parsing

SheetJS already loaded via CDN can parse CSV natively:

```js
const wb = XLSX.read(csvText, { type: 'string' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = importSheet(ws, tableName);
```

`importSheet()` is reused without modification. It already handles type coercion for all schema types (int, float, bool, datetime, str, text) and filters rows with null PKs.

One caveat: `importSheet()` uses `XLSX.utils.sheet_to_json` with `{ raw: true }`. For CSV input, all cell values are strings (no Excel serial dates). The existing `coerceValue()` already handles string-to-type coercion, so this is handled correctly.

---

## What Does Not Change

- `importSheet()` — reused as-is
- `coerceValue()` — reused as-is
- `importWorkbook()` — untouched
- The Excel import tab and JSON import tab — untouched
- SCHEMA — no changes
- `onImport()` in `240_app.js` — called with the patched data object; existing save/rebuild logic applies

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| User exports CSV with soft-deleted rows excluded, then reimports | Soft-deleted rows in that table are permanently removed. Acceptable — this is the "current live state" of the table. |
| User reimports a CSV that is identical to current data | No visible change; row count is the same; no error. |
| CSV has extra columns not in SCHEMA | `importSheet()` ignores them (only reads columns defined in SCHEMA.cols). |
| CSV is missing optional columns | `importSheet()` returns `null` for those fields. Acceptable. |
| CSV has no rows (header only) | Blocked with error before reaching preview. |
| PK column absent from header | Blocked with error before reaching preview. |
| User renames the exported CSV | Table detection fails; user is told to rename to match table name. |
| Reference/lookup table CSV (e.g. quality_dimension.csv) | Permitted — no restriction. The user is responsible for keeping reference data consistent. |
| Steward user navigates to Import screen | The "Single Table CSV" tab is not rendered; stewards cannot access this feature. |
| Multi-table fix (e.g. fix PK in parent + FK in child) | User runs two sequential CSV imports. Order matters: parent first, then child. Not enforced by the app — documented in user guide. |
