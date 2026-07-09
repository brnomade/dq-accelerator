# Implementation Plan: Rules Explorer Redesign

**Design ref:** `designs/DESIGN_RULES_EXPLORER_REDESIGN.md`  
**Status:** Pending design review  
**Primary file:** `src/110_view_rules.js` (full replacement)  
**Supporting files:** `src/240_app.js` (minor — allocPanel wiring), `src/80_sidebar.js` (none expected)  
**Panels reused unchanged:** `RuleFormPanel` (already in `110_view_rules.js`), `CdeAllocFormPanel` (in `141_view_cde_list.js`)

---

## Review gate

> **Do not begin implementation until the design has been reviewed and approved.**  
> Update the status line above to `Approved — ready to implement` after review sign-off.

---

## Design decisions confirmed

| Q | Decision |
|---|----------|
| 1 | Retired rules hidden until "Show retired" toggle is on |
| 2 | No new allocations from Rules Explorer — stays in Data & Stewardship |
| 3 | Rules with zero allocations shown with empty-state message |
| 4 | File renamed `110_view_rules.js` → `145_view_rules.js` |

---

## Task list

| # | Status | Task |
|---|--------|------|
| 1 | `todo` | Data assembly: `buildRuleHierarchy` function |
| 2 | `todo` | Component: `CdeRow` with inline allocation panel |
| 3 | `todo` | Component: `TableRow` |
| 4 | `todo` | Component: `CdsRow` |
| 5 | `todo` | Component: `AgencyRow` |
| 6 | `todo` | Component: `RuleRow` |
| 7 | `todo` | Component: `RuleExplorerView` — outer shell, toolbar, state, render |
| 8 | `todo` | Wiring: allocPanel state connected to `CdeAllocFormPanel` |
| 9 | `todo` | Build and smoke test |

---

## Implementation reference — pre-resolved details

These answers prevent mid-build source reads.

### allocPanel and rulePanel state ownership

Both panels live **inside `RuleExplorerView`** (not App-level). Render both via `ReactDOM.createPortal(..., document.body)` to avoid fixed-position issues with ancestor `overflow` or `transform`. No changes needed to `240_app.js` beyond the component rename.

### myStewardCdsIds — exact logic (copy from 141_view_cde_list.js)

```js
const myStewardCdsIds = useMemo(() => {
  if (!stewardIdentity || isMaster || !data) return null;
  const ids = new Set(
    (data.stewardship || [])
      .filter(s => !s.retiring_timestamp &&
        s.data_steward_id === stewardIdentity.id &&
        s.critical_data_set_id !== 0)
      .map(s => s.critical_data_set_id)
  );
  return ids.size > 0 ? ids : null;
}, [data, stewardIdentity, isMaster]);
```

Pull `stewardIdentity`, `isMaster` from `useApp()`.

### fieldProfiling data source

```js
const profilingByKey = useMemo(() => {
  const m = {};
  for (const p of (data?.field_profiling || []))
    if (!p.retiring_timestamp)
      m[`${p.source_database_name}|||${p.source_table_name}|||${p.source_field_name}`] = p;
  return m;
}, [data]);
```

At table level, `isProfiled = cdes.some(c => profilingByKey[...] exists)`.  
At CDE level, `profiling = profilingByKey[db|||table|||field]`.

### Profiling badge logic (table level)

```js
const isProfiled = tableEntry.cdes.some(c =>
  profilingByKey[`${c.cde.source_database_name}|||${c.cde.source_table_name}|||${c.cde.source_field_name}`]
);
```

### critsByCdeId — exact logic (copy from 141_view_cde_list.js)

```js
const critsByCdeId = useMemo(() => {
  const m = {};
  for (const cr of (data?.cde_criticality || [])) {
    if (cr.retiring_timestamp) continue;
    if (!m[cr.critical_data_element_id]) m[cr.critical_data_element_id] = {};
    m[cr.critical_data_element_id][cr.criticality_group_id] = cr.criticality_level_id;
  }
  return m;
}, [data]);
```

### Criticality chips rendering (copy from 141_view_cde_list.js CDE row)

```jsx
{critGroupsSorted.map(g => {
  const levelId = (critsByCdeId[cde.critical_data_element_id] || {})[g.criticality_group_id];
  const level   = levelId ? levels.find(l => l.criticality_level_id === levelId) : null;
  return (
    <span key={g.criticality_group_id} title={g.criticality_group_name}
      style={{ fontSize:9, fontWeight:700, fontFamily:'var(--mono)',
        padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap',
        background: level ? 'var(--amber-bg)' : 'var(--bg3)',
        color:       level ? 'var(--amber)'    : 'var(--text3)',
        border:      level ? '1px solid var(--amber)' : '1px solid var(--border)' }}>
      {g.criticality_group_acronym || g.criticality_group_name.slice(0,3).toUpperCase()}
      {level ? ` - ${level.criticality_level_description}` : ''}
    </span>
  );
})}
```

`levels` = `(data?.criticality_level || []).filter(l => !l.retiring_timestamp)` — build as a const in `RuleExplorerView`.

### Table key format

Within `buildRuleHierarchy`, use `${cde.source_table_name}|||${cde.source_database_name || ''}` as the table grouping key. In `expanded` state, the key includes the rule and CDS context: `tbl_${ruleId}_${cdsId}_${tableKey}`.

### SQL buttons on allocation row — SQL comes from the rule, not the allocation

```js
// Resolve rule record from ruleEntry
const sqlCode   = ruleEntry.rule.sql_code        || null;
const sqlSample = ruleEntry.rule.sql_code_sample || null;
```

Pass `ruleEntry.rule` down through agency/CDS/table/CDE levels to allocation row, or resolve from a `rulesById` lookup map built in `buildRuleHierarchy`.

### Search filter algorithm

The `filtered` useMemo applies a two-pass filter:

```
For each ruleObj in hierarchy:
  1. Check rule-level match: rule.rule_name or rule.rule_explanation contains query
  2. If no rule-level match, check descendants:
     For each agency:
       match if agency.agency_acronym or agency.agency_name contains query
       For each cds:
         match if cds.cds_name contains query
         For each table:
           match if table.table or table.db contains query
           For each cde:
             match if cde.cde.source_field_name contains query
  3. Rule passes if any of the above matched
  4. If showRetired is false, skip rules where rule.retiring_timestamp is set
     and skip allocations where allocation.retiring_timestamp is set
```

Implementation: flatten all matchable strings for a rule into one array, check if any `.toLowerCase().includes(q)`. Do not prune sub-levels — if a rule passes, show all its descendants unfiltered.

### allocPanel save handler

```js
const handleAllocSave = (saved) => {
  upsertRecord('data_quality_rule_allocation', saved);
  setAllocPanel(null);
};
```

`CdeAllocFormPanel` receives: `record`, `isEdit`, `onSave={handleAllocSave}`, `onClose={() => setAllocPanel(null)}`, `data`.  
Note: `CdeAllocFormPanel` does **not** receive a `cdeId` prop — the `critical_data_element_id` is embedded in the `record` object itself.

---

## Task details

### Task 1 — Data assembly: `buildRuleHierarchy`

**File:** `src/110_view_rules.js`  
**Function signature:**
```js
function buildRuleHierarchy({
  rules, allocs, cdes, cdss, dirs, agencies,
  fieldProfiling, critsByGroup, critGroupsSorted,
  scopeCdsIds   // Set<id> | null
})
```

**Steps:**
1. Build lookup maps:
   - `cdeById` — `critical_data_element_id → cde`
   - `cdsById` — `critical_data_set_id → cds`
   - `dirById` — `directorate_id → directorate`
   - `agencyById` — `executive_agency_id → agency`
   - `profilingByKey` — `db|||table|||field → profiling record`
   - `critsByCdeId` — `cde_id → { group_id → level_id }` (built from `cde_criticality`)
   - `allocsByCdeId` — not needed here; we iterate allocations by rule

2. Group live allocations by `data_quality_rule_id`
3. For each live rule (optionally including retired if `showRetired`):
   - Find its allocations (live, or all if `showRetired`)
   - For each allocation, resolve CDE → CDS → directorate → agency
   - If `scopeCdsIds` active, skip allocations where CDS not in scope
   - Group: agency → CDS → table (`source_table_name + source_database_name`) → CDE
   - At table level, compute `isProfiled` (any field in this table has a profiling record)
   - At CDE level, attach `profiling` (record or null) and `crits` (group→level map)
   - Compute rollup counts: `agencyCount`, `cdeCount`, `allocCount` per rule
4. Sort rules by `rule_name`; within each rule sort agencies by `agency_acronym`; within each agency sort CDSs by `cds_name`; within each CDS sort tables alphabetically; within each table sort CDEs by `source_field_name`

**Returns:** Array of rule objects as specified in the design (section 7).

---

### Task 2 — Component: `CdeRow`

**File:** `src/110_view_rules.js`  
**Props:** `{ cdeEntry, ruleId, dimensions, expanded, onToggle, onEditAlloc, onRetireAlloc, canEdit, accent }`

Where `cdeEntry` is:
```js
{ cde, profiling, crits, allocation }
```

**Collapsed row shows:**
- Chevron (always — every CDE here has exactly one allocation)
- CDE field name (mono, accent blue)
- `profiled` badge if `profiling` exists
- Criticality chips (per group in `critGroupsSorted`) — amber if level set, grey if not — matching D&S rendering exactly
- No action buttons collapsed

**Expanded inline panel (`background: var(--bg3)`, indented):**
- Dimension name (accent, mono) from `allocation.quality_dimension_id` resolved via lookup
- Frequency text
- Bumper value (amber badge if set, grey dash if null)
- SQL copy buttons: `{ }` for `sql_code`, `{ }` for `sql_code_sample` (or `DEF` badge if null)
- Missing snapshot filter warning (amber ⚠) if `sql_code_sample` is null — same as D&S
- Edit button → calls `onEditAlloc(allocation, cde.critical_data_element_id)`
- Retire / Restore button → calls `onRetireAlloc(allocation)`

Key: `cde_${ruleId}_${cde.critical_data_element_id}` in `expanded`.

---

### Task 3 — Component: `TableRow`

**File:** `src/110_view_rules.js`  
**Props:** `{ tableEntry, ruleId, cdsId, dimensions, expanded, onToggle, onEditAlloc, onRetireAlloc, canEdit, accent }`

Where `tableEntry` is:
```js
{ table, db, isProfiled, cdes: [...] }
```

**Collapsed header:**
- Chevron
- Table name (mono, bold) + `in {db}` (muted, smaller) — same pattern as D&S and Profiling
- `profiled` badge (green) if `isProfiled`, grey otherwise
- Counter: `· N CDEs · N allocations`

**Expanded:** `CdeRow` list.

Key: `tbl_${ruleId}_${cdsId}_${table}|||${db}` in `expanded`.

---

### Task 4 — Component: `CdsRow`

**File:** `src/110_view_rules.js`  
**Props:** `{ cdsEntry, ruleId, agencyId, dimensions, expanded, onToggle, onEditAlloc, onRetireAlloc, canEdit, accent }`

Where `cdsEntry` is:
```js
{ cds, tables: [...], tableCount, cdeCount, allocCount }
```

**Collapsed header:**
- Chevron
- CDS name
- Counter: `· N tables · N CDEs · N allocations`

**Expanded:** `TableRow` list.

Key: `cds_${ruleId}_${cds.critical_data_set_id}` in `expanded`.

---

### Task 5 — Component: `AgencyRow`

**File:** `src/110_view_rules.js`  
**Props:** `{ agencyEntry, ruleId, dimensions, expanded, onToggle, onEditAlloc, onRetireAlloc, canEdit, accent }`

Where `agencyEntry` is:
```js
{ agency, cdss: [...], cdsCount, cdeCount, allocCount }
```

**Collapsed header:**
- Chevron
- Agency acronym (bold) + Agency name (muted)
- Counter: `· N CDSs · N CDEs · N allocations`

**Expanded:** `CdsRow` list.

Key: `ag_${ruleId}_${agency.executive_agency_id}` in `expanded`.

---

### Task 6 — Component: `RuleRow`

**File:** `src/110_view_rules.js`  
**Props:** `{ ruleEntry, dimensions, expanded, onToggle, onEdit, onRetire, onRestore, onEditAlloc, onRetireAlloc, canEdit, accent }`

Where `ruleEntry` is the full rule object from `buildRuleHierarchy`.

**Collapsed header:**
- Chevron
- Rule name (mono, bold, `var(--text)` if live, `var(--text3)` if retired)
- Rule explanation (truncated, muted)
- `AUTOMATED` badge (amber) if `automated = true`
- Rule ID badge (mono, muted)
- Counter: `· N agencies · N CDEs · N allocations`
- Edit button (pencil) → `onEdit(ruleEntry.rule)` — opens `RuleFormPanel` in edit mode
- Retire / Restore toggle → `onRetire` / `onRestore`

**Empty state (rule has zero allocations):** Below the header (non-collapsible), a muted message: `No allocations — use the Data & Stewardship page to assign this rule to a CDE.`

**Expanded (rule has allocations):** `AgencyRow` list.

**Border:** `3px solid ${accent}` if live, `3px solid var(--border)` if retired.

Key: `rule_${rule.data_quality_rule_id}` in `expanded`.

---

### Task 7 — Component: `RuleExplorerView`

**File:** `src/110_view_rules.js` (replaces `DataQualityRuleView`)

**State:**
```js
const [search,      setSearch]      = useState('');
const [showRetired, setShowRetired] = useState(false);
const [myDataOnly,  setMyDataOnly]  = useState(/* from moj_dq_rulenav_scope_v1 */);
const [expanded,    setExpanded]    = useState({});
const [rulePanel,   setRulePanel]   = useState(null);
const [allocPanel,  setAllocPanel]  = useState(null);
```

**useMemo computations:**
- `myStewardCdsIds` — same as D&S: Set of CDS IDs assigned to current steward (null if master or no identity)
- `dimensions` — live quality_dimension records sorted by id
- `critGroupsSorted` — live criticality_group records sorted by id
- `critsByCdeId` — `cde_criticality` records grouped into `{ cde_id → { group_id → level_id } }`
- `hierarchy` — result of `buildRuleHierarchy(...)` recomputed when data or scope changes
- `filtered` — applies search and showRetired filter to `hierarchy`; a rule passes if rule name/explanation matches OR any descendant CDE field/table/db/agency/CDS matches

**Handlers:**
- `toggleKey(key)` — flips key in `expanded`
- `handleAddRule()` — `setRulePanel({ record: {} })`
- `handleEditRule(rule)` — `setRulePanel({ record: rule })`
- `handleRetireRule(rule)` — `retireRecord('data_quality_rule', rule.data_quality_rule_id)`
- `handleRestoreRule(rule)` — `restoreRecord('data_quality_rule', rule.data_quality_rule_id)`
- `handleEditAlloc(alloc, cdeId)` — `setAllocPanel({ record: alloc, isEdit: true, cdeId })`
- `handleRetireAlloc(alloc)` — `retireRecord('data_quality_rule_allocation', alloc.data_quality_rule_allocation_id)`
- `handleRestoreAlloc(alloc)` — `restoreRecord('data_quality_rule_allocation', alloc.data_quality_rule_allocation_id)`

**JSX structure:**
```
Page outer div (fade-in, standard padding)
  Page header
    Title "Rules Explorer" + counts
    [+ Add Rule] button
  Toolbar
    Search input
    My data toggle (if myStewardCdsIds)
    Show retired toggle (if any retired rules exist)
  Result count / empty state
  filtered.map() → RuleRow
  rulePanel && RuleFormPanel (portal or app-level)
  allocPanel && CdeAllocFormPanel (portal or app-level)
```

**localStorage:** Read/write `moj_dq_rulenav_scope_v1` for `myDataOnly` (same pattern as profiling + D&S).

---

### Task 8 — Wiring: allocPanel → `CdeAllocFormPanel`

**File:** `src/110_view_rules.js` (inline render or portal)

`CdeAllocFormPanel` is defined in `141_view_cde_list.js` which is loaded before `110_view_rules.js` — **this is a load-order problem**.

**Resolved (design decision 4):** Rename `110_view_rules.js` to `145_view_rules.js`. This preserves the single definition of `CdeAllocFormPanel` in `141_view_cde_list.js`, loads after it, and requires only updating the filename reference in `240_app.js`.

Before renaming, grep `DataQualityRuleView` across all src files to confirm nothing in the `110–144` range depends on it.

---

### Task 9 — Build and smoke test

Run `python build.py` from `build/` and verify:

- [ ] Build passes with no non-ASCII errors
- [ ] "Rules Explorer" sidebar item navigates to new view
- [ ] Rule list renders with correct names and IDs
- [ ] Expand a rule → agencies appear
- [ ] Expand an agency → CDSs appear
- [ ] Expand a CDS → tables appear (with profiling badge)
- [ ] Expand a table → CDEs appear (with profiling badge + criticality chips)
- [ ] Expand a CDE → allocation row appears (dimension, frequency, bumper, SQL buttons)
- [ ] Edit button on rule → `RuleFormPanel` opens in edit mode
- [ ] + Add Rule → `RuleFormPanel` opens blank
- [ ] Edit button on allocation → `CdeAllocFormPanel` opens in edit mode
- [ ] Retire / restore rule works
- [ ] Retire / restore allocation works
- [ ] Search filters correctly (rule name, CDE field, table, agency)
- [ ] My data toggle filters to steward's CDSs
- [ ] Show retired toggle shows retired rules/allocations
- [ ] Rule with zero allocations shows empty-state message
- [ ] No console errors

---

## File change summary

| File | Change |
|------|--------|
| `src/110_view_rules.js` → `src/145_view_rules.js` | Full replacement — new `RuleExplorerView`, `RuleRow`, `AgencyRow`, `CdsRow`, `TableRow`, `CdeRow`, `buildRuleHierarchy`; `RuleFormPanel` carried over |
| `src/141_view_cde_list.js` | No changes — `CdeAllocFormPanel` stays here; load order allows `145_view_rules.js` to use it |
| `src/240_app.js` | Update `rulenav` case to reference new component name if changed (currently `DataQualityRuleView` → `RuleExplorerView`) |
| `src/80_sidebar.js` | No changes — `rulenav` nav item label and route unchanged |

---

## Dependency order

Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 (sequential — each level depends on the next inner level being defined first).  
Task 8 can be resolved at the start (file rename decision) before coding begins.  
Task 9 runs after all others.
