# Design: Cascading Retirement — Part 2 (null_fk action + remaining call sites)

## Problem

The `RETIRE_CASCADE` map introduced in Part 1 treats every child relationship as a hard retire
(`retiring_timestamp` stamped on the child). This is correct for records whose existence is
semantically bound to the parent (e.g. a `stewardship` row bound to a `critical_data_set`).

However, several child relationships are **reallocation relationships**, not ownership relationships.
A `critical_data_element` can exist independently of any one `critical_data_set`; retiring the CDS
should not retire the CDE — it should merely clear the CDS foreign key so the CDE becomes
unassigned and can be reallocated. The same applies to:

- `directorate → critical_data_set` (CDS can be reassigned to another directorate)
- `directorate → data_owner` (Data Owner can be reassigned to another directorate)
- `executive_agency → directorate` (Directorate can be reassigned to another agency)
- `executive_agency → data_patron` (Data Patron can be reassigned to another agency)
- `critical_data_set → critical_data_element` (CDE can be reassigned to another CDS)

Part 2 also completes the remaining call site migrations (13 retire buttons across 8 files)
that were deferred from Part 1.

---

## Design

### 1. Extended `RETIRE_CASCADE` (`10_constants.js`)

Each entry gains a mandatory `action` field with two possible values:

| Action | Effect | Recursion |
|---|---|---|
| `'retire'` | Stamp `retiring_timestamp` on the child record | Yes — recurse into child's own cascade chain |
| `'null_fk'` | Set `record[fk] = null`, keep record alive | No — record stays alive, its children are untouched |

```js
const RETIRE_CASCADE = {
  executive_agency: [
    { table: 'directorate',               fk: 'executive_agency_id',  action: 'null_fk' },
    { table: 'data_patron',               fk: 'executive_agency_id',  action: 'null_fk' },
    { table: 'criticality_group_weight',  fk: 'executive_agency_id',  action: 'retire'  },
    { table: 'quality_dimension_weight',  fk: 'executive_agency_id',  action: 'retire'  },
  ],
  directorate: [
    { table: 'critical_data_set', fk: 'directorate_id', action: 'null_fk' },
    { table: 'data_owner',        fk: 'directorate_id', action: 'null_fk' },
    { table: 'shortlist_group',   fk: 'directorate_id', action: 'retire'  },
  ],
  critical_data_set: [
    { table: 'critical_data_element', fk: 'critical_data_set_id', action: 'null_fk' },
    { table: 'stewardship',           fk: 'critical_data_set_id', action: 'retire'  },
  ],
  critical_data_element: [
    { table: 'cde_criticality',              fk: 'critical_data_element_id', action: 'retire' },
    { table: 'data_quality_rule_allocation', fk: 'critical_data_element_id', action: 'retire' },
    { table: 'cde_shortlist_tag',            fk: 'critical_data_element_id', action: 'retire' },
  ],
  shortlist_group: [
    { table: 'cde_shortlist_tag', fk: 'shortlist_group_id', action: 'retire' },
  ],
  data_quality_rule: [
    { table: 'data_quality_rule_allocation', fk: 'data_quality_rule_id', action: 'retire' },
  ],
  data_steward: [
    { table: 'stewardship', fk: 'data_steward_id', action: 'retire' },
  ],
};
```

### 2. Updated `collectCascadeRetirements` (`240_app.js`)

Return shape changes from `[{ tbl, pk }]` to `[{ tbl, pk, action, fk }]`.

- The target record itself is always `action: 'retire'`, `fk: null`.
- For each cascade entry: collect all matching live children with the entry's action and fk.
- Only recurse when `action === 'retire'`. A `null_fk` record is kept alive so its own children
  are unaffected.

```js
function collectCascadeRetirements(data, tableName, pkValue) {
  var result = [{ tbl: tableName, pk: pkValue, action: 'retire', fk: null }];
  var cascades = RETIRE_CASCADE[tableName] || [];
  for (var i = 0; i < cascades.length; i++) {
    var entry = cascades[i];
    var childPkField = SCHEMA[entry.table].pk;
    var children = (data[entry.table] || []).filter(function(r) {
      return r[entry.fk] === pkValue && !r.retiring_timestamp;
    });
    for (var j = 0; j < children.length; j++) {
      var childPk = children[j][childPkField];
      if (entry.action === 'retire') {
        var sub = collectCascadeRetirements(data, entry.table, childPk);
        for (var k = 0; k < sub.length; k++) result.push(sub[k]);
      } else {
        result.push({ tbl: entry.table, pk: childPk, action: 'null_fk', fk: entry.fk });
      }
    }
  }
  return result;
}
```

### 3. Updated `retireRecord` (`240_app.js`)

Iterates the collected list and applies the correct mutation per action:

```js
const retireRecord = useCallback((tableName, pkValue) => {
  if (!stewardIdentity) return;
  setData(prev => {
    var toProcess = collectCascadeRetirements(prev, tableName, pkValue);
    var ts = new Date().toISOString();
    var next = { ...prev };
    for (var i = 0; i < toProcess.length; i++) {
      var item = toProcess[i];
      var pkField = SCHEMA[item.tbl].pk;
      if (item.action === 'retire') {
        next = { ...next, [item.tbl]: next[item.tbl].map(function(r) {
          return r[pkField] === item.pk ? { ...r, retiring_timestamp: ts } : r;
        })};
      } else {
        next = { ...next, [item.tbl]: next[item.tbl].map(function(r) {
          return r[pkField] === item.pk ? { ...r, [item.fk]: null } : r;
        })};
      }
    }
    persist(next);
    return next;
  });
}, [persist, stewardIdentity]);
```

### 4. Updated `openRetireConfirm` (`240_app.js`)

Builds two separate summary lists: one for retire-action children, one for null_fk-action children.
`retireConfirm` state shape changes from `{ ..., cascadeSummary }` to `{ ..., retireSummary, nullFkSummary }`.

```js
const openRetireConfirm = useCallback(function(tableName, pkValue) {
  if (!stewardIdentity || !data) return;
  var pkField = SCHEMA[tableName] && SCHEMA[tableName].pk;
  var record  = (data[tableName] || []).find(function(r) { return r[pkField] === pkValue; });
  if (!record) return;
  var toProcess = collectCascadeRetirements(data, tableName, pkValue);
  var retireCounts = {}, nullFkCounts = {};
  for (var i = 1; i < toProcess.length; i++) {
    var item = toProcess[i];
    if (item.action === 'retire') retireCounts[item.tbl] = (retireCounts[item.tbl] || 0) + 1;
    else                          nullFkCounts[item.tbl] = (nullFkCounts[item.tbl] || 0) + 1;
  }
  var retireSummary = Object.keys(retireCounts).map(function(t) { return { tbl: t, count: retireCounts[t] }; });
  var nullFkSummary = Object.keys(nullFkCounts).map(function(t) { return { tbl: t, count: nullFkCounts[t] }; });
  setRetireConfirm({ tableName: tableName, pkValue: pkValue, record: record, retireSummary: retireSummary, nullFkSummary: nullFkSummary });
}, [stewardIdentity, data]);
```

### 5. Updated `RetireConfirmPanel` (`90_panels.js`)

The amber warning section splits into two sub-sections when both action types are present.
The "unlinked" section uses blue rather than amber to signal that the effect is less destructive.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⚠  Retire Critical Data Set                                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  HMPPS Identity — Offender Records                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ amber box ──────────────────────────────────────────────────┐   │
│  │  Will also be retired:                                        │   │
│  │  • 1  Stewardship record                                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ blue box ───────────────────────────────────────────────────┐   │
│  │  Will be unlinked (CDS FK cleared, records kept):            │   │
│  │  • 4  Critical Data Elements                                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│                              [Cancel]  [Confirm retirement]         │
└──────────────────────────────────────────────────────────────────────┘
```

When only retire-action children exist (no null_fk), the panel is unchanged from Part 1.
When there are no children at all, the panel shows the "No dependent records" message as before.

### 6. Remaining call site migrations (Part 2 — 13 sites across 8 files)

Same changes as described in the original `DESIGN_CASCADE_RETIREMENT.md` §5. Each UI retire
button calls `openRetireConfirm(tableName, pkValue)` instead of calling `retireRecord` directly.
`161_view_generic.js` inline `confirmRetire` state is removed entirely.

| File | Calls |
|---|---|
| `src/100_view_weights_org.js` | 3 |
| `src/120_view_cde_criticality.js` | 1 |
| `src/130_view_rule_allocation.js` | 1 |
| `src/141_view_cde_list.js` | 1 (remaining inline allocation retire) |
| `src/145_view_rules.js` | 2 |
| `src/150_view_cds_dir.js` | 1 |
| `src/151_view_directorate.js` | 1 |
| `src/161_view_generic.js` | 5 (remove inline confirm state; switch all) |
| `src/200_screen_ddl.js` | 2 |

---

## Scope boundaries (unchanged from Part 1)

- `bulkSetRetiring` — not cascaded; excluded.
- `restoreRecord` — not cascaded; conscious decision.
- Read-only reference tables — excluded.

---

## Files affected

| File | Change |
|---|---|
| `src/10_constants.js` | Add `action` field to all `RETIRE_CASCADE` entries |
| `src/240_app.js` | Update `collectCascadeRetirements`, `retireRecord`, `openRetireConfirm`; update `retireConfirm` state shape |
| `src/90_panels.js` | Update `RetireConfirmPanel` to render two sections |
| `src/100_view_weights_org.js` | Switch 3 retire calls to `openRetireConfirm` |
| `src/120_view_cde_criticality.js` | Switch 1 retire call |
| `src/130_view_rule_allocation.js` | Switch 1 retire call |
| `src/141_view_cde_list.js` | Switch 1 retire call |
| `src/145_view_rules.js` | Switch 2 retire calls |
| `src/150_view_cds_dir.js` | Switch 1 retire call |
| `src/151_view_directorate.js` | Switch 1 retire call |
| `src/161_view_generic.js` | Remove inline confirm state; switch 5 retire calls |
| `src/200_screen_ddl.js` | Switch 2 retire calls |
