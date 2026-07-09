# DESIGN — KI-24: Snapshot-aware profiling SQL

**Status:** Draft — awaiting user approval  
**Area:** Profiling screen (`200_screen_ddl.js`)  
**Issue:** KI-24 — Profile should look at a snapshot, not the full table

---

## Problem

The profiling SQL generated in `buildProfilingSQL` always queries the full source table:

```sql
FROM ${db}.${tbl}
WHERE ${field} IS NOT NULL
```

For large production tables (hundreds of millions of rows, Athena scanned-data billing) this is:
- Too slow to be usable during a profiling session
- Too expensive (cost per query)
- Too disruptive to the source system / query queue

The `critical_data_element` table already has a `source_snapshot_filter` column (`10_constants.js:57`) intended to hold a SQL WHERE predicate that scopes the query to a representative snapshot (e.g. a single partition date, a latest-snapshot flag, or any other row-filter). This field is currently never read by the profiling machinery.

---

## Root Cause

Three call points all ignore `source_snapshot_filter`:

| Location | Issue |
|---|---|
| `buildProfilingSQL` (`200_screen_ddl.js:4`) | No `snapshotFilter` parameter; SQL templates target full table |
| `buildProfilingAgenda` (`200_screen_ddl.js:227`) | Does not carry `source_snapshot_filter` from the CDE into `fieldMap` entries |
| `FieldProfilingPanel.sqls` memo (`200_screen_ddl.js:771`) | Calls `buildProfilingSQL` with 5 args; snapshot filter never passed |

---

## `source_snapshot_filter` semantics

The field is typed `text` and stores a raw SQL WHERE-clause predicate fragment — **not** a full SELECT statement. Examples:

```
snapshot_date = DATE('2024-12-01')
year = 2024 AND month = 12
extract_date = (SELECT MAX(extract_date) FROM db.table_snapshots)
partition_key = 'latest'
```

This predicate is injected verbatim as a WHERE or AND clause in the generated SQL. The application treats it as trusted internal data (entered by the data steward), not end-user free text, so no further sanitisation is required beyond `trim()`.

---

## Data flow

```
CDE.source_snapshot_filter
        │
        ▼ (buildProfilingAgenda — Step 1)
fieldMap[key].snapshotFilter
        │
        ▼ (buildProfilingAgenda — Step 3)
tg.fields[i].snapshotFilter
        │
        ▼ (FieldProfilingPanel — sqls memo)
buildProfilingSQL(..., snapshotFilter)
        │
        ▼
Generated SQL with WHERE / AND clause
```

---

## SQL injection strategy

Each of the four SQL blocks requires a different injection point depending on whether the block already has a WHERE clause:

| Block | Existing WHERE? | Injection |
|---|---|---|
| `summarySQL` (numeric) | Yes — `WHERE field IS NOT NULL` | Prepend: `WHERE snap\n  AND field IS NOT NULL` |
| `summarySQL` (date) | No | Append after FROM: `\nWHERE snap` |
| `summarySQL` (string) | No | Append after FROM: `\nWHERE snap` |
| `topValuesSQL` | No | Append after FROM: `\nWHERE snap` |
| `typePatternsSQL` (string) | No | Append after FROM, before GROUP BY: `\nWHERE snap` |
| `lengthSQL` (string) | Yes — `WHERE field IS NOT NULL` | Prepend: `WHERE snap\n  AND field IS NOT NULL` |

Two helper strings cover all cases:

```js
const snap         = snapshotFilter ? snapshotFilter.trim() : null;
const snapWhere    = snap ? `WHERE ${snap}` : '';
const snapWhereAnd = snap ? `WHERE ${snap}\n  AND ` : 'WHERE ';
```

- `snapWhereAnd` replaces the literal `WHERE ` token in blocks that already have a WHERE clause.
- `snapWhere` is inserted as a new line in blocks without one; omitted entirely when `snap` is null.

---

## Multi-CDE / same-field scenario

A physical `db.table.field` combination can be registered as a CDE under multiple critical data sets. Each CDE may carry a different `source_snapshot_filter`. The profiling panel shows one field at a time — it uses the `snapshotFilter` from the first CDE that registered the field in `buildProfilingAgenda`.

This is acceptable because:
1. In practice all CDEs for the same physical field on the same table will share the same snapshot predicate (they share the same source extract).
2. The panel UI will display the active snapshot filter so the user can see and verify it.
3. If a conflict arises, the user can manually adjust the copied SQL before running it.

---

## UI changes

### `FieldProfilingPanel` — Step 1 block

Add a read-only "Snapshot filter" info row next to the physical type, visible only when `fieldEntry.snapshotFilter` is non-null:

```
Physical:  VARCHAR(10)    Snapshot filter:  snapshot_date = DATE('2024-12-01')
```

Use amber colouring with a small warning icon if there is **no** snapshot filter set but `fieldEntry.ruleCount > 0` (i.e. the field has rules but no snapshot guard), to prompt the data steward to add one.

---

## Out of scope

- Editing `source_snapshot_filter` from within the profiling panel — this field should be edited via the CDE record form.
- Snapshot filter validation / SQL syntax checking.
- Support for snapshot filters that reference a different table (e.g. a snapshot view) — the current design only supports row-filter predicates on the same `db.table`.
- Table-level snapshot filter (applied to all CDEs of a table regardless of which CDE is being profiled) — not modelled; per-CDE is sufficient.

---

## Files changed

| File | Change |
|---|---|
| `src/200_screen_ddl.js` | `buildProfilingSQL` — add `snapshotFilter` param, inject into all six SQL blocks |
| `src/200_screen_ddl.js` | `buildProfilingAgenda` — carry `source_snapshot_filter` from CDE into fieldMap and tg.fields |
| `src/200_screen_ddl.js` | `FieldProfilingPanel` — pass `fieldEntry.snapshotFilter` to `buildProfilingSQL`; show filter in Step 1 UI |

No schema changes, no new tables, no build template changes required.
