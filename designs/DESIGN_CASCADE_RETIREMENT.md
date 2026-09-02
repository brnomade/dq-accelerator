# Design: Cascading Retirement + Confirmation Panel

## Problem

`retireRecord()` in `240_app.js` sets `retiring_timestamp` on a single row and stops. It does not
retire child records that reference the retired row via FK. This creates two distinct failure modes:

**Failure mode A — delta export pollution (observed)**
A steward creates a new CDE (steward-namespace PK, not in base snapshot). Creating the CDE
automatically creates `cde_criticality` rows (also steward-namespace, not in snapshot).
The steward then retires the CDE. After build-20260902-1613, the CDE is correctly suppressed from
`inserted`. But the `cde_criticality` rows have no `retiring_timestamp`, so they still appear in
`inserted` — sending the master an instruction to create orphaned criticality records for a CDE
that was never published.

**Failure mode B — UI data inconsistency**
Any view that filters live records by `!r.retiring_timestamp` will surface child records whose
parent is retired (e.g. live `cde_criticality` rows for a retired CDE).

**Failure mode C — no user feedback (UX)**
When a retire action has cascading effects the steward is not warned. A retire click on an Agency
would silently also retire its Directorates, CDSes, CDEs, and all their children — hundreds of
records — with no preview or confirmation.

---

## Design

### 1. Cascade map (`10_constants.js`)

A `RETIRE_CASCADE` constant declares, for each parent table, which child tables must be retired
and via which FK field. The map is recursive: retiring a Directorate retires its CDSes, which
retires their CDEs, which retires criticality/allocations/tags.

```js
const RETIRE_CASCADE = {
  executive_agency: [
    { table: 'directorate',               fk: 'executive_agency_id' },
    { table: 'data_patron',               fk: 'executive_agency_id' },
    { table: 'criticality_group_weight',  fk: 'executive_agency_id' },
    { table: 'quality_dimension_weight',  fk: 'executive_agency_id' },
  ],
  directorate: [
    { table: 'critical_data_set', fk: 'directorate_id' },
    { table: 'data_owner',        fk: 'directorate_id' },
    { table: 'shortlist_group',   fk: 'directorate_id' },
  ],
  critical_data_set: [
    { table: 'critical_data_element', fk: 'critical_data_set_id' },
    { table: 'stewardship',           fk: 'critical_data_set_id' },
  ],
  critical_data_element: [
    { table: 'cde_criticality',              fk: 'critical_data_element_id' },
    { table: 'data_quality_rule_allocation', fk: 'critical_data_element_id' },
    { table: 'cde_shortlist_tag',            fk: 'critical_data_element_id' },
  ],
  shortlist_group: [
    { table: 'cde_shortlist_tag', fk: 'shortlist_group_id' },
  ],
  data_quality_rule: [
    { table: 'data_quality_rule_allocation', fk: 'data_quality_rule_id' },
  ],
  data_steward: [
    { table: 'stewardship', fk: 'data_steward_id' },
  ],
};
```

Only **live** children (`!r.retiring_timestamp`) are retired. Already-retired children are skipped to
avoid re-stamping their timestamp (which would generate spurious `updated` entries in the delta).

### 2. Cascade collector helper (`240_app.js`)

Module-level function (before `App`). Walks the cascade map recursively and returns a flat list of
all records to retire, including the target itself as the first entry.

```js
function collectCascadeRetirements(data, tableName, pkValue) {
  const result = [{ tbl: tableName, pk: pkValue }];
  for (const { table, fk } of (RETIRE_CASCADE[tableName] || [])) {
    const childPkField = SCHEMA[table].pk;
    for (const child of (data[table] || []).filter(r => r[fk] === pkValue && !r.retiring_timestamp)) {
      result.push(...collectCascadeRetirements(data, table, child[childPkField]));
    }
  }
  return result;
}
```

### 3. Modified `retireRecord` (`240_app.js`)

Applies all retirements in a single `setData` call with one shared timestamp. Used for
**programmatic** retirements (no UI confirmation) — e.g. removing a steward from a CDS form.

```js
const retireRecord = useCallback((tableName, pkValue) => {
  if (!stewardIdentity) return;
  setData(prev => {
    const toRetire = collectCascadeRetirements(prev, tableName, pkValue);
    const ts = new Date().toISOString();
    let next = { ...prev };
    for (const { tbl, pk } of toRetire) {
      const pkField = SCHEMA[tbl].pk;
      next = { ...next, [tbl]: next[tbl].map(r => r[pkField] === pk ? { ...r, retiring_timestamp: ts } : r) };
    }
    persist(next);
    return next;
  });
}, [persist, stewardIdentity]);
```

### 4. Retirement confirmation panel

A centred modal overlay (not a side panel — this is a brief confirmation, not a form). Rendered at
App level to avoid the fixed-position ancestor constraint. Uses `position:fixed` centred with
`transform: translate(-50%, -50%)`.

**State** in `App`:
```js
const [retireConfirm, setRetireConfirm] = useState(null);
// shape: { tableName, pkValue, record, cascadeSummary: [{ tbl, count }] }
```

**`openRetireConfirm`** — new context function replacing UI-level `retireRecord` calls:
```js
const openRetireConfirm = useCallback((tableName, pkValue) => {
  if (!stewardIdentity || !data) return;
  const pkField = SCHEMA[tableName]?.pk;
  const record  = (data[tableName] || []).find(r => r[pkField] === pkValue);
  if (!record) return;
  const toRetire = collectCascadeRetirements(data, tableName, pkValue);
  const childCounts = {};
  for (const { tbl } of toRetire.slice(1)) childCounts[tbl] = (childCounts[tbl] || 0) + 1;
  const cascadeSummary = Object.entries(childCounts).map(([tbl, count]) => ({ tbl, count }));
  setRetireConfirm({ tableName, pkValue, record, cascadeSummary });
}, [stewardIdentity, data]);
```

**Panel layout** (rendered in `90_panels.js` as `RetireConfirmPanel`):

```
┌──────────────────────────────────────────────────────────────┐
│  ⚠  Retire Critical Data Element                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  HMPPS_NOMIS.OFFENDERS.BIRTH_DATE                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─ amber warning box ─────────────────────────────────┐   │
│  │  This will also retire:                              │   │
│  │  • 3  CDE Criticality records                        │   │
│  │  • 2  Rule Allocation records                        │   │
│  │  • 1  CDE Shortlist Tag records                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│                            [Cancel]  [Confirm retirement]   │
└──────────────────────────────────────────────────────────────┘
```

When there are no cascade children:
```
┌──────────────────────────────────────────────────────────────┐
│  ⚠  Retire Data Quality Rule                                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Generic - null check                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  No dependent records. This can be undone by restoring.     │
│                                                              │
│                            [Cancel]  [Confirm retirement]   │
└──────────────────────────────────────────────────────────────┘
```

**Record display helper** (`getRecordDisplayName`) lives in `90_panels.js` as a module-level
function. Returns a human-readable label for the record being retired:

| Table | Display |
|---|---|
| `critical_data_element` | `DB.Table.Field` |
| `critical_data_set` | `data_set_name` |
| `data_quality_rule` | `rule_name` |
| `data_quality_rule_allocation` | `Allocation #N` |
| `cde_criticality` | `Criticality #N` |
| `executive_agency` | `Acronym – Name` |
| `directorate` | `directorate_name` |
| `data_patron` / `data_owner` / `data_steward` | person name |
| `stewardship` | `Stewardship #N` |
| `shortlist_group` | `shortlist_group_label` |
| `cde_shortlist_tag` | `Tag #N` |
| `source_table_ddl` | `DB.Table` |
| `field_profiling` | `DB.Table.Field` |
| `criticality_group_weight` / `quality_dimension_weight` | `Weight #N` |

### 5. Call site changes

**14 existing `retireRecord` calls in 9 UI files** must switch to `openRetireConfirm`.
**1 programmatic call** (`240_app.js:272` in `handleCdsSave`) keeps `retireRecord` — it removes
steward assignments silently as part of a save operation.

`161_view_generic.js` already has its own inline two-step confirm pattern (`setConfirmRetire`).
That inline mechanism is **removed entirely** — replaced by routing through `openRetireConfirm`.

Files to update:

| File | Retire calls | Action |
|---|---|---|
| `100_view_weights_org.js` | 3 (weights row, agency, directorate) | switch to `openRetireConfirm` |
| `120_view_cde_criticality.js` | 1 (criticality row) | switch |
| `130_view_rule_allocation.js` | 1 (allocation row) | switch |
| `141_view_cde_list.js` | 2 (CDE row; allocation inline) | switch |
| `145_view_rules.js` | 2 (rule; allocation) | switch |
| `150_view_cds_dir.js` | 1 (CDS row) | switch |
| `151_view_directorate.js` | 1 (directorate row) | switch |
| `161_view_generic.js` | 5 (inline confirm × 5) | remove inline confirm state; switch to `openRetireConfirm` |
| `200_screen_ddl.js` | 2 (DDL; profiling) | switch |

---

## Scope boundaries

### `bulkSetRetiring` — NOT cascaded in this fix
Bulk select-and-retire in list views is excluded to limit blast radius. Noted as future work.

### `restoreRecord` — NOT cascaded (conscious decision)
When a record is restored, its children remain retired. A steward may have independently retired
specific child records and auto-restore would undo that intent. Restoring children requires
explicit action.

### Read-only reference tables — excluded
`executive_agency_type`, `steward_role_type`, `quality_dimension`, `criticality_group`,
`criticality_level` are `readOnly: true` and are not in `RETIRE_CASCADE`.

---

## Files affected

| File | Change |
|---|---|
| `src/10_constants.js` | Add `RETIRE_CASCADE` constant after `SCHEMA` |
| `src/90_panels.js` | Add `getRecordDisplayName` helper + `RetireConfirmPanel` component |
| `src/240_app.js` | Add `collectCascadeRetirements`; update `retireRecord`; add `retireConfirm` state; add `openRetireConfirm`; render panel; add `openRetireConfirm` to context |
| `src/100_view_weights_org.js` | Switch 3 retire calls to `openRetireConfirm` |
| `src/120_view_cde_criticality.js` | Switch 1 retire call |
| `src/130_view_rule_allocation.js` | Switch 1 retire call |
| `src/141_view_cde_list.js` | Switch 2 retire calls |
| `src/145_view_rules.js` | Switch 2 retire calls |
| `src/150_view_cds_dir.js` | Switch 1 retire call |
| `src/151_view_directorate.js` | Switch 1 retire call |
| `src/161_view_generic.js` | Remove inline confirm; switch 5 retire calls |
| `src/200_screen_ddl.js` | Switch 2 retire calls |
