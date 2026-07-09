# PLAN — KI-24: Snapshot-aware profiling SQL

**Design:** `designs/DESIGN_KI24_SNAPSHOT_PROFILING.md`  
**Status:** Draft — awaiting user approval  
**File:** `src/200_screen_ddl.js` only

---

## Steps

### Step 1 — `buildProfilingSQL`: add snapshotFilter parameter

Add `snapshotFilter` as the 6th parameter. Add two helper variables:

```js
const snap         = snapshotFilter ? snapshotFilter.trim() : null;
const snapWhere    = snap ? `WHERE ${snap}` : '';
const snapWhereAnd = snap ? `WHERE ${snap}\n  AND ` : 'WHERE ';
```

Modify the six SQL template strings:

**summarySQL (numeric)** — replace literal `WHERE ` with `${snapWhereAnd}`:
```
FROM ${db}.${tbl}
${snapWhereAnd}${field} IS NOT NULL;
```

**summarySQL (date)** — no existing WHERE; append after FROM line:
```
FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''};
```

**summarySQL (string)** — same pattern as date:
```
FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''};
```

**topValuesSQL** — append after FROM, before GROUP BY:
```
FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''}
GROUP BY ${field}
```

**typePatternsSQL** — append after FROM, before GROUP BY:
```
FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''}
GROUP BY 1
```

**lengthSQL** — replace literal `WHERE ` with `${snapWhereAnd}`:
```
FROM ${db}.${tbl}
${snapWhereAnd}${field} IS NOT NULL
GROUP BY LENGTH(${field})
```

---

### Step 2 — `buildProfilingAgenda`: carry snapshotFilter from CDE

In Step 1 of the agenda build (the `if (!fieldMap[key])` block, around line 264), add `snapshotFilter`:

```js
fieldMap[key] = {
  db:             cde.source_database_name,
  table:          cde.source_table_name,
  field:          cde.source_field_name,
  origin:         'CDE',
  cdeIds:         [],
  ruleCount:      0,
  dimsCovered:    new Set(),
  snapshotFilter: cde.source_snapshot_filter || null,   // <-- add
};
```

In Step 3 (the `tg.fields.push` call, around line 349), add `snapshotFilter`:

```js
tg.fields.push({
  key:            ...,
  db:             entry.db,
  table:          entry.table,
  field:          entry.field,
  origin:         entry.origin,
  ruleCount:      entry.ruleCount,
  type:           colType,
  profiling:      profRecord || null,
  dimCoverage,
  coveredCount,
  snapshotFilter: entry.snapshotFilter || null,         // <-- add
});
```

---

### Step 3 — `FieldProfilingPanel`: wire snapshotFilter through

**sqls memo** (around line 771) — add 6th argument:

```js
return buildProfilingSQL(
  fieldEntry.db || '', fieldEntry.table, fieldEntry.field,
  physicalType, semanticType, fieldEntry.snapshotFilter || null
);
```

**Step 1 UI block** (the "Physical / Semantic type" row, around line 906) — add snapshot filter display:

```jsx
{fieldEntry?.snapshotFilter ? (
  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
    <label style={{ fontSize:11, fontWeight:600, color:'var(--text2)',
      whiteSpace:'nowrap' }}>Snapshot filter:</label>
    <span style={{ fontFamily:'var(--mono)', fontSize:11,
      color:'var(--amber)', background:'rgba(245,166,35,0.08)',
      border:'1px solid rgba(245,166,35,0.25)',
      borderRadius:'var(--radius)', padding:'2px 8px',
      overflowWrap:'anywhere' }}>
      {fieldEntry.snapshotFilter}
    </span>
  </div>
) : (fieldEntry?.ruleCount > 0) && (
  <div style={{ fontSize:11, color:'var(--amber)' }}>
    No snapshot filter set. Queries will scan the full table.
  </div>
)}
```

---

### Step 4 — Build and verify

```bash
cd build && python build.py
```

Open `dist/dq-accelerator.html`. On the Profiling screen:

1. Select a field on a CDE that has a `source_snapshot_filter` value set → click Profile.
2. Verify the Step 2 SQL blocks all include the snapshot predicate in their WHERE clauses.
3. Verify the Step 1 block shows the snapshot filter label in amber.
4. Select a field on a CDE with no snapshot filter → verify SQL is unchanged (no empty WHERE clause).
5. Verify numeric, date, and string field types each produce correct SQL with and without a filter.

---

### Step 5 — Post-build updates

- Update `CHANGELOG.md` with build ID.
- Update `SESSION_METRICS.md` with build ID and time estimates.
- Mark KI-24 as **fixed** in `KNOWN_ISSUES.md`.

---

## Risk

Low. All changes are contained within `buildProfilingSQL`, `buildProfilingAgenda`, and `FieldProfilingPanel` in a single file. No schema changes, no new tables, no routing changes. The `snapshotFilter` parameter defaults to `null`/`undefined` so all existing call sites with no filter produce identical SQL to the current behaviour.
