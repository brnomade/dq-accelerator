# Plan: Cascading Retirement + Confirmation Panel

Paired with: `DESIGN_CASCADE_RETIREMENT.md`

---

## Step 1 — Add `RETIRE_CASCADE` to `src/10_constants.js`

Insert after the closing `};` of `SCHEMA` and before the `SHEET_MAP` block:

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

---

## Step 2 — Add `getRecordDisplayName` + `RetireConfirmPanel` to `src/90_panels.js`

Append at the bottom of the file.

`getRecordDisplayName(tableName, record)` — returns a string label for the record:

```js
function getRecordDisplayName(tableName, record) {
  if (!record) return '';
  const map = {
    critical_data_element:        r => [r.source_database_name, r.source_table_name, r.source_field_name].filter(Boolean).join('.'),
    critical_data_set:            r => r.data_set_name || '',
    data_quality_rule:            r => r.rule_name || '',
    data_quality_rule_allocation: r => 'Allocation #' + r.data_quality_rule_allocation_id,
    cde_criticality:              r => 'Criticality #' + r.cde_criticality_id,
    stewardship:                  r => 'Stewardship #' + r.stewardship_id,
    executive_agency:             r => [r.agency_acronymn, r.agency_name].filter(Boolean).join(' – '),
    directorate:                  r => r.directorate_name || r.directorate_acronymn || '',
    data_patron:                  r => r.data_patron_name || '',
    data_owner:                   r => r.data_owner_name || '',
    data_steward:                 r => r.data_steward_name || '',
    shortlist_group:              r => r.shortlist_group_label || '',
    cde_shortlist_tag:            r => 'Tag #' + r.cde_shortlist_tag_id,
    source_table_ddl:             r => [r.source_database_name, r.source_table_name].filter(Boolean).join('.'),
    field_profiling:              r => [r.source_database_name, r.source_table_name, r.source_field_name].filter(Boolean).join('.'),
    criticality_group_weight:     r => 'Weight #' + r.criticality_group_weight_id,
    quality_dimension_weight:     r => 'Weight #' + r.quality_dimension_weight_id,
  };
  const fn = map[tableName];
  return fn ? fn(record) : '#' + record[SCHEMA[tableName]?.pk];
}
```

`RetireConfirmPanel({ confirm, onConfirm, onCancel })` — receives the pre-computed `confirm`
object from App state; renders backdrop + centred modal:

```jsx
function RetireConfirmPanel({ confirm, onConfirm, onCancel }) {
  const { tableName, record, cascadeSummary } = confirm;
  const schema      = SCHEMA[tableName];
  const displayName = getRecordDisplayName(tableName, record);
  const hasCascade  = cascadeSummary.length > 0;

  return (
    <>
      <div onClick={onCancel}
        style={{ position:'fixed', inset:0, zIndex:500, background:'var(--overlay-sm)' }}/>
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        zIndex:501, width:'min(480px,90vw)', background:'var(--bg2)',
        border:'1px solid var(--border2)', borderRadius:'var(--radius)',
        boxShadow:'0 8px 32px var(--overlay-md)', padding:24,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <Icon.AlertTriangle style={{ color:'var(--amber)', flexShrink:0, width:18, height:18 }}/>
          <div style={{ fontSize:15, fontWeight:600 }}>
            Retire {schema?.label}
          </div>
        </div>

        <div style={{
          fontSize:12, fontFamily:'var(--mono)', color:'var(--text2)',
          background:'var(--bg3)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', padding:'8px 12px', marginBottom:16,
        }}>
          {displayName}
        </div>

        {hasCascade ? (
          <div style={{
            background:'var(--amber-bg)', border:'1px solid rgba(245,166,35,0.4)',
            borderRadius:'var(--radius)', padding:'10px 14px', marginBottom:20,
          }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--amber)', marginBottom:6 }}>
              This will also retire:
            </div>
            {cascadeSummary.map(({ tbl, count }) => (
              <div key={tbl} style={{
                fontSize:12, color:'var(--text2)',
                display:'flex', alignItems:'center', gap:8, marginTop:4,
              }}>
                <span style={{
                  width:4, height:4, borderRadius:'50%',
                  background:'var(--amber)', flexShrink:0, display:'inline-block',
                }}/>
                {count} {SCHEMA[tbl]?.label} {count === 1 ? 'record' : 'records'}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20 }}>
            No dependent records will be affected. This can be undone by restoring the record.
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>
            <Icon.EyeOff/> Confirm retirement
          </button>
        </div>
      </div>
    </>
  );
}
```

---

## Step 3 — Update `src/240_app.js`

### 3a. Add `collectCascadeRetirements` before the `App` function

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

### 3b. Replace `retireRecord` body (cascade, no UI)

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

### 3c. Add retire confirm state + `openRetireConfirm` callback (after existing form state)

```js
const [retireConfirm, setRetireConfirm] = useState(null);

const openRetireConfirm = useCallback((tableName, pkValue) => {
  if (!stewardIdentity || !data) return;
  const pkField = SCHEMA[tableName]?.pk;
  const record  = (data[tableName] || []).find(r => r[pkField] === pkValue);
  if (!record) return;
  const toRetire      = collectCascadeRetirements(data, tableName, pkValue);
  const childCounts   = {};
  for (const { tbl } of toRetire.slice(1)) childCounts[tbl] = (childCounts[tbl] || 0) + 1;
  const cascadeSummary = Object.entries(childCounts).map(([tbl, count]) => ({ tbl, count }));
  setRetireConfirm({ tableName, pkValue, record, cascadeSummary });
}, [stewardIdentity, data]);
```

### 3d. Add `openRetireConfirm` to the context value and its dependency array

```js
const ctxValue = useMemo(() => ({
  ...
  retireRecord, restoreRecord, bulkSetRetiring, openRetireConfirm,
  ...
}), [ ..., retireRecord, restoreRecord, bulkSetRetiring, openRetireConfirm, ...]);
```

### 3e. Render `RetireConfirmPanel` at App level

In the App return, after all existing panels (settings, CDE form, etc.) and before `</AppContext.Provider>`:

```jsx
{retireConfirm && (
  <RetireConfirmPanel
    confirm={retireConfirm}
    onConfirm={() => { retireRecord(retireConfirm.tableName, retireConfirm.pkValue); setRetireConfirm(null); }}
    onCancel={() => setRetireConfirm(null)}
  />
)}
```

---

## Step 4 — Update all UI retire call sites

In every file below:
1. Add `openRetireConfirm` to the `useApp()` destructure alongside `retireRecord`
2. Replace each UI `retireRecord(tbl, pk)` call with `openRetireConfirm(tbl, pk)`

**`src/100_view_weights_org.js`** (3 calls):
- Line 218: weights row toggle
- Line 580: org chart retire agency
- Line 674: org chart retire directorate

**`src/120_view_cde_criticality.js`** (1 call):
- Line 658: criticality row retire button

**`src/130_view_rule_allocation.js`** (1 call):
- Allocation row retire button

**`src/141_view_cde_list.js`** (2 calls):
- Line 733: CDE row retire button
- Line 884: inline allocation retire button

**`src/145_view_rules.js`** (2 calls):
- Line 591: `handleRetireRule`
- Line 596: `handleRetireAlloc`

**`src/150_view_cds_dir.js`** (1 call):
- Line 199: CDS row retire button

**`src/151_view_directorate.js`** (1 call):
- Line 185: directorate row retire button

**`src/200_screen_ddl.js`** (2 calls):
- Line 1343: `handleRetireDDL`
- Line 1541: DDL card onRetire prop

**Do NOT change**: `240_app.js:272` (`handleCdsSave` — programmatic stewardship removal, no confirmation needed).

---

## Step 5 — Remove inline confirm from `src/161_view_generic.js`

`161_view_generic.js` has its own `[confirmRetire, setConfirmRetire]` state and inline
"Confirm retire" button pattern (5 occurrences at lines 243, 324, 390, 454, 520). These are
replaced by the App-level panel:

1. Remove the `confirmRetire` state declaration
2. Replace each `{ retireRecord(tableName, pk); setConfirmRetire(null); }` onClick with
   `openRetireConfirm(tableName, pk)`
3. Remove all inline "Confirm retire / Cancel" button pairs and their wrapping conditions
4. Add `openRetireConfirm` to the `useApp()` destructure; remove `retireRecord` destructure
   if it is no longer called directly

---

## Step 6 — Manual verification

**A. CDE retirement cascade + panel**
- Import master JSON
- Create new CDE (auto-creates `cde_criticality` rows)
- Click retire on the new CDE → confirmation panel should open
- Panel should list the `cde_criticality` rows in the cascade summary
- Click Cancel → nothing changes
- Click retire again → Confirm retirement → CDE + criticality rows all retired
- Export delta → neither CDE nor criticality rows appear in `inserted`

**B. Deep cascade (CDS → CDE → children)**
- Retire a CDS that has live CDEs
- Panel shows count of CDEs + their criticality/allocation/tag children
- Confirm → inspect data: CDS, CDEs, and all grandchildren have `retiring_timestamp`

**C. No-cascade case**
- Retire a `data_quality_rule` that has no live allocations
- Panel shows "No dependent records" message
- Confirm → rule retired only

**D. Programmatic retire not blocked**
- Open a CDS form, remove a steward assignment → stewardship row retired silently (no panel)

**E. Generic view — inline confirm removed**
- Navigate to any table in the generic view
- Click retire on a row → App-level panel appears (not the old inline buttons)

---

## Step 7 — Update CHANGELOG.md and SESSION_METRICS.md (pre-generate build ID first)

```
python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"
```

No user-guide update required — this is an internal data-integrity and UX-polish fix with no
new workflow or screen.

---

## Step 8 — Build

```
cd build && python build.py
```

---

## Files touched

| File | Change |
|---|---|
| `src/10_constants.js` | Add `RETIRE_CASCADE` |
| `src/90_panels.js` | Add `getRecordDisplayName` + `RetireConfirmPanel` |
| `src/240_app.js` | `collectCascadeRetirements`; cascade `retireRecord`; `retireConfirm` state; `openRetireConfirm`; panel render; context update |
| `src/100_view_weights_org.js` | 3 call sites → `openRetireConfirm` |
| `src/120_view_cde_criticality.js` | 1 call site |
| `src/130_view_rule_allocation.js` | 1 call site |
| `src/141_view_cde_list.js` | 2 call sites |
| `src/145_view_rules.js` | 2 call sites |
| `src/150_view_cds_dir.js` | 1 call site |
| `src/151_view_directorate.js` | 1 call site |
| `src/161_view_generic.js` | Remove inline confirm; 5 call sites → `openRetireConfirm` |
| `src/200_screen_ddl.js` | 2 call sites |
| `CHANGELOG.md` | Release entry |
| `SESSION_METRICS.md` | Session entry |
