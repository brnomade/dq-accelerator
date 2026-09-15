# DESIGN — Table Profiling: Snapshot Metadata Capture

**Status:** Draft — awaiting user approval  
**Area:** DDL form panel (`201_ddl_form_panel.js`) + schema (`10_constants.js`)  
**Feature:** Add a Step 2 to the table profiling form to capture whether a table is a snapshot table and which field identifies the snapshot period.

---

## Problem

The data quality journey starts with table profiling (the DDL form panel). For the current client, many source tables are snapshot-type tables — records are duplicated across snapshot dates, so the same business entity appears multiple times representing its state at each extraction point. The profiling step has no mechanism to record this structural characteristic at the table level, leading to:

- Profiling statistics (null counts, distinct values, duplicates) that are inflated across all snapshots rather than reflecting a single point-in-time state.
- No machine-readable indication that a table is a snapshot table, preventing downstream tooling from automatically scoping queries.
- Users having to manually remember which tables need snapshot-scoped SQL before running profiling queries.

---

## Solution

Add two new fields to the `source_table_ddl` schema and a new **Step 2 — Snapshot configuration** block to the DDL form panel. The new step is always visible (not gated behind parsing). The snapshot field selector is inactive until columns have been parsed in Step 1, showing a contextual placeholder message in that state.

---

## Data model changes

### `source_table_ddl` — two new columns

| Field | Type | Label | Notes |
|---|---|---|---|
| `is_snapshot_table` | `bool` | Snapshot table | Defaults to false/null if not set |
| `snapshot_date_field` | `str` | Snapshot field | Name of the column that identifies the snapshot period (e.g. `snapshot_date`, `etl_run_date`) |

These are added to `source_table_ddl.cols` in `10_constants.js` **only**. No other table in the schema is modified.

---

## UI changes — DDL form panel (`201_ddl_form_panel.js`)

### Step renumbering

| Before | After |
|---|---|
| Step 1 — Get the DDL from Athena | Step 1 — Get the DDL from Athena (unchanged) |
| Step 2 — Verify columns (conditional) | Step 2 — Snapshot configuration (new, always visible) |
| — | Step 3 — Verify columns (renumbered, still conditional) |

### Step 2 — Snapshot configuration

A new card block rendered unconditionally between Step 1 and the (now Step 3) verify-columns block. Contents:

**Toggle row**  
A labelled checkbox: "This is a snapshot table". Checked state binds to `isSnapshotTable` state variable.

**Snapshot field selector** (shown only when `isSnapshotTable = true`)  
A dropdown `<select>`. Two states:

| Condition | Behaviour |
|---|---|
| `parsed.length === 0` | Single disabled option: `"— Profile the table to see available fields"` |
| `parsed.length > 0` | Dropdown populated with all parsed column names; user selects the snapshot date/period field |

The user may save the record with `isSnapshotTable = true` and `snapshotDateField = ''` — this is an acceptable partial state. The UI does not enforce completion of the snapshot field.

### Left-border colour convention

- `is_snapshot_table = false` or not set: neutral border (`var(--border)`)
- `is_snapshot_table = true`, `snapshot_date_field` set: green border (`var(--green)`)
- `is_snapshot_table = true`, `snapshot_date_field` empty: amber border (`var(--amber)`) with a small hint: "Snapshot field not yet selected — return to complete."

### Save behaviour

`handleSave()` includes `is_snapshot_table` and `snapshot_date_field` in the saved record object alongside the existing fields. No validation errors are raised for a missing snapshot field — it is optional.

---

## Out of scope

- Propagation of `snapshot_date_field` to `critical_data_element.source_snapshot_filter` — to be revisited in a separate work item.
- Auto-generating snapshot-scoped profiling SQL from the table-level field — to be revisited.
- Displaying a SNAPSHOT badge on the profiling view table cards — to be revisited.
- Editing `snapshot_date_field` outside the DDL form panel.

---

## Files changed

| File | Change |
|---|---|
| `src/10_constants.js` | Add `is_snapshot_table` (bool) and `snapshot_date_field` (str) to `source_table_ddl.cols` |
| `src/201_ddl_form_panel.js` | Add `isSnapshotTable` and `snapshotDateField` state; add Step 2 block; renumber Verify columns to Step 3; include new fields in `handleSave()` |

No other files, no routing changes, no new tables, no build template changes.
