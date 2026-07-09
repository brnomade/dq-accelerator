# PLAN -- Merge Executive Agency CRUD into Organisation Page

Paired with: `designs/DESIGN_ORG_AGENCY_MERGE.md`

---

## Step 1 -- Rename SCHEMA label in `10_constants.js`

Find:
```js
  executive_agency: {
    pk: 'executive_agency_id',
    ...
    label: 'Executive Agency',
```

Change label value from `'Executive Agency'` to `'Agency'`.

---

## Step 2 -- Hide from sidebar in `80_sidebar.js`

In the `group.tables.map(t => { ... })` block, add one line alongside the existing
`field_profiling` exclusion:

```js
if (t === 'field_profiling') return null;
if (t === 'executive_agency') return null;   // <-- add this
```

---

## Step 3 -- Add agency controls to `OwnershipOrgChart` in `100_view_weights_org.js`

### 3a. Extend the `useApp()` destructure

Current:
```js
const { data } = useApp();
```

New:
```js
const { data, openForm, retireRecord, restoreRecord, canEdit, nextPk } = useApp();
```

### 3b. Add "Add Agency" button to the page header

The header currently has the title div on the left and the "Show retired" toggle on the right.
Add the button between them (or alongside the toggle, flex row right side):

```jsx
<div style={{ display:'flex', alignItems:'center', gap:10 }}>
  {canEdit && (
    <button
      className="btn btn-primary"
      style={{ fontSize:12, padding:'5px 12px' }}
      onClick={() => openForm('executive_agency', {
        executive_agency_id:      nextPk('executive_agency'),
        executive_agency_type_id: null,
        agency_acronymn:          null,
        agency_name:              null,
        retiring_timestamp:       null,
      })}>
      + Add Agency
    </button>
  )}
  {/* existing Show retired toggle */}
</div>
```

### 3c. Add Edit + Retire/Restore buttons to each agency header row

Currently the agency header row ends after the "retired" badge. Add an action group AFTER the
badge, inside `onClick e.stopPropagation()`:

```jsx
{canEdit && (
  <div onClick={e => e.stopPropagation()}
    style={{ display:'flex', alignItems:'center', gap:4, marginLeft:4, flexShrink:0 }}>
    <button
      title="Edit agency"
      className="btn btn-ghost"
      style={{ padding:'2px 6px', fontSize:10 }}
      onClick={() => openForm('executive_agency', agency)}>
      <Icon.Pencil/>
    </button>
    {isRetired ? (
      <button
        title="Restore agency"
        className="btn btn-ghost"
        style={{ padding:'2px 6px', fontSize:10 }}
        onClick={() => restoreRecord('executive_agency', aid)}>
        <Icon.Eye/>
      </button>
    ) : (
      <button
        title="Retire agency"
        className="btn btn-ghost"
        style={{ padding:'2px 6px', fontSize:10 }}
        onClick={() => retireRecord('executive_agency', aid)}>
        <Icon.EyeOff/>
      </button>
    )}
  </div>
)}
```

The `isRetired` and `aid` variables are already available in the `.map()` scope.

---

## Step 4 -- Build and verify

```bash
cd build && python build.py
```

### Manual checks

- Organisation page: "Add Agency" button appears when a steward identity is set
- Click "Add Agency" -- RecordFormPanel opens titled "Add Agency" with empty fields
  (Type dropdown, Acronym, Name); save creates a new row visible in the org chart
- Click Edit pencil on an existing agency -- form opens titled "Edit Agency" pre-populated
- Click Retire eye-off on an active agency -- row dims and gets "retired" badge; Restore
  eye icon appears; clicking it restores the agency
- Sidebar Ownership group: "Executive Agency" entry is gone; "Organisation" link remains
- Read-only mode (no steward identity): Add Agency button hidden, Edit/Retire buttons hidden

---

## Files changed

| File | Change |
|------|--------|
| `src/10_constants.js` | 1-line label rename |
| `src/80_sidebar.js` | 1-line exclusion in nav map |
| `src/100_view_weights_org.js` | `useApp` destructure + Add button in header + Edit/Retire per row |

## Estimated effort

~20 minutes coding + build + manual test
