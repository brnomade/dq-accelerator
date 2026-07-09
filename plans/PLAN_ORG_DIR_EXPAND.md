# PLAN: Organisation Page — Directorate Row Expansion

**Date:** 2026-07-01
**Design:** DESIGN_ORG_DIR_EXPAND.md
**Status:** Approved

---

## File

`src/100_view_weights_org.js` — `OwnershipOrgChart` only.

---

## Steps

### Step 1 — Add `expandedDirs` state

After the existing `expanded` state declaration, add:

```js
const [expandedDirs, setExpandedDirs] = useState({});
const toggleDir = (did) => setExpandedDirs(prev => ({ ...prev, [did]: !prev[did] }));
```

### Step 2 — Add `cdsWithStewards` to each branch in `trees` useMemo

Inside `branches.map(dir => ...)`, after `ruleCount` is computed, add:

```js
const cdsWithStewards = dataSets
  .filter(ds => isLive(ds))
  .sort((a,b) => (a.data_set_name||'').localeCompare(b.data_set_name||''))
  .map(ds => {
    const dsId = ds.critical_data_set_id;
    const cwStewardships = (data.stewardship || [])
      .filter(s => s.critical_data_set_id === dsId && isLive(s));
    const cwStewardIds = [...new Set(cwStewardships.map(s => s.data_steward_id))];
    const cwStewards = cwStewardIds
      .map(sid => {
        const steward = (data.data_steward || []).find(st => st.data_steward_id === sid);
        const role    = (data.steward_role_type || []).find(r =>
          r.steward_role_type_id === steward?.steward_role_type_id);
        return steward ? { ...steward, role_description: role?.role_description || '' } : null;
      })
      .filter(Boolean)
      .sort((a,b) => (a.data_steward_name||'').localeCompare(b.data_steward_name||''));
    return { ds, stewards: cwStewards };
  });
```

Update branch return: add `cdsWithStewards`.

### Step 3 — Remove patron row from expanded agency view

Delete the patron row block (currently lines 531–546):
```jsx
{/* Patron row */}
<div style={{ ... paddingLeft:12, marginBottom:14, ... }}>
  ...
</div>
```

### Step 4 — Rewrite directorate header row

Replace current directorate header (static bar + name + stat line + buttons) with:

```jsx
{/* Directorate header row -- clickable to expand */}
<div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}
  onClick={() => toggleDir(dir.directorate_id)}>

  {/* Chevron */}
  <div style={{ color:'var(--text3)', width:12, height:12, flexShrink:0,
    transform: isDirOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>
    <Icon.ChevronR/>
  </div>

  {/* Name + owner + stats */}
  <div style={{ flex:1, minWidth:0 }}>
    {/* Line 1 */}
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
        {dir.directorate_name}
      </span>
      {dir.retiring_timestamp &&
        <span className="badge badge-amber" style={{ fontSize:9 }}>retired</span>}
    </div>
    {/* Line 2: [Owner] name + stats */}
    <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2, flexWrap:'wrap' }}>
      <OrgRolePill label="Owner" color={accent}/>
      <span style={{ fontSize:11, fontFamily:'var(--mono)',
        color: owner ? 'var(--text2)' : 'var(--text3)',
        fontStyle: owner ? 'normal' : 'italic', marginRight:2 }}>
        {owner ? owner.data_owner_name : 'none assigned'}
      </span>
      <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
        {mdot + ' ' + stewards.length + ' steward' + (stewards.length !== 1 ? 's' : '') +
         ' ' + mdot + ' ' + dataSetCount + ' CDS' +
         ' ' + mdot + ' ' + cdeCount + ' CDE' +
         ' ' + mdot + ' ' + ruleCount + ' rules ' + mdot + ' '}
      </span>
      <ProfilingSpan pct={profiledPct}/>
    </div>
  </div>

  {/* Edit/retire buttons (stopPropagation) */}
  {canEdit && ( ... unchanged ... )}
</div>
```

Where `owner = owners[0] || null` is computed at the top of the branches.map callback.

Remove the old Owner row and Stewards row blocks entirely.

### Step 5 — Add directorate expanded content (CDS table)

After the directorate header row div, add:

```jsx
{isDirOpen && (
  <div style={{ borderTop:'1px solid var(--border)', marginTop:8,
    paddingTop:10, paddingLeft:20 }}>
    {cdsWithStewards.length === 0 ? (
      <div style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>
        No critical data sets found.
      </div>
    ) : (
      <div>
        {/* Column headers */}
        <div style={{ display:'grid',
          gridTemplateColumns:'1fr 2fr 1.5fr',
          gap:12, padding:'0 0 6px',
          borderBottom:'1px solid var(--border)' }}>
          {['Name','Description','Stewards'].map(h => (
            <span key={h} style={{ fontSize:9, fontWeight:600,
              textTransform:'uppercase', letterSpacing:'0.06em',
              color:'var(--text3)', fontFamily:'var(--mono)' }}>{h}</span>
          ))}
        </div>
        {/* CDS rows */}
        {cdsWithStewards.map(({ ds, stewards: cdsStews }, ci) => (
          <div key={ds.critical_data_set_id}
            style={{ display:'grid', gridTemplateColumns:'1fr 2fr 1.5fr',
              gap:12, padding:'8px 0',
              borderBottom: ci < cdsWithStewards.length-1
                ? '1px solid var(--border)' : 'none',
              alignItems:'flex-start' }}>
            <span style={{ fontSize:12, fontWeight:500, color:'var(--text)' }}>
              {ds.data_set_name || '—'}
            </span>
            <span style={{ fontSize:12, color:'var(--text2)', lineHeight:1.5 }}>
              {ds.data_set_description || '—'}
            </span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {cdsStews.length === 0
                ? <OrgNone/>
                : cdsStews.map(s => (
                    <OrgPersonChip key={s.data_steward_id}
                      name={s.data_steward_name}
                      subtitle={s.role_description}/>
                  ))
              }
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

### Step 6 — Update branches destructure in JSX

Add `cdsWithStewards` to the branches.map destructure.

### Step 7 — Build and verify

- Patron row gone from expanded agency view
- Directorate rows are clickable and expand/collapse independently
- Directorate line 2 shows owner name (like patron on agency)
- Expanded directorate shows CDS table: Name | Description | Stewards
- No edit/retire controls on CDS rows
- Stat counts still accurate

---

## Acceptance criteria

- [ ] Patron row removed from expanded agency view
- [ ] Directorate chevron rotates on expand/collapse
- [ ] Directorate line 2: [Owner] name · stewards · CDS · CDE · rules · profiling
- [ ] "none assigned" shown when no owner
- [ ] CDS table: 3 columns (Name, Description, Stewards)
- [ ] CDS rows sorted by name ascending
- [ ] No edit/retire buttons on CDS rows
- [ ] Stewards shown per CDS, not per directorate
- [ ] Empty states handled: no CDS, no stewards
- [ ] Build passes with no non-ASCII errors
