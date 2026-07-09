# DESIGN -- Merge Executive Agency CRUD into Organisation Page

## Goal

Add agency management controls (Add, Edit, Retire/Restore) directly to the Organisation page,
then remove the Executive Agency entry from the sidebar. The functionality is identical to the
generic table view today; only the surface changes.

---

## Current state

| Surface | Behaviour |
|---------|-----------|
| Organisation page (`orgchart` route) | Read-only hierarchy. No agency CRUD. |
| Executive Agency table (`table/executive_agency` route) | Full CRUD via GenericTableView. Reachable from sidebar under Ownership group. |

---

## Proposed changes

### 1. Add Agency button

Placed in the page header right-hand side, next to the "Show retired" toggle.

- Label: `+ Add Agency`
- Disabled (greyed out) when `!canEdit`
- On click: calls `openForm('executive_agency', { executive_agency_id: nextPk('executive_agency'), executive_agency_type_id: null, agency_acronymn: null, agency_name: null, retiring_timestamp: null })`
- The existing `RecordFormPanel` (already mounted in `240_app.js`) handles the rest

### 2. Edit button per agency row

Placed on the right side of each agency header row, inside `onClick e.stopPropagation()` wrapper
to prevent the expand/collapse toggle firing.

- Icon: `Icon.Pencil`
- Only rendered when `canEdit`
- On click: `openForm('executive_agency', agency)` -- the form pre-populates from the existing record

### 3. Retire / Restore button per agency row

Placed beside the Edit button on each agency row.

- Active agency: `Icon.EyeOff`, calls `retireRecord('executive_agency', aid)`
- Retired agency: `Icon.Eye`, calls `restoreRecord('executive_agency', aid)`
- Only rendered when `canEdit`
- Follows the same pattern as the Directorate screen retire buttons

### 4. Panel title: rename SCHEMA label

The `RecordFormPanel` derives its title from `SCHEMA[tableName].label`.
Changing `executive_agency.label` from `'Executive Agency'` to `'Agency'` makes the panel read
"Add Agency" / "Edit Agency" as the user requested.

Impact of this rename:
- Sidebar nav entry (being removed anyway) -- no visible impact
- Breadcrumb when navigating to `table/executive_agency` directly -- shows "Agency" (acceptable)
- Generic table view header -- shows "Agency" (acceptable, rarely visited after this change)
- `SHEET_MAP` key `'Executive Agency'` -- **unchanged** (SHEET_MAP uses its own string keys, not schema labels; Excel import is unaffected)

### 5. Hide Executive Agency from the sidebar

Add `if (t === 'executive_agency') return null;` in the `group.tables.map` loop in `80_sidebar.js`,
following the existing pattern that already hides `field_profiling`.

The route `table/executive_agency` continues to work if navigated to directly; the generic view
is not deleted. Dead-code removal (the full CLEAN-1 audit) is a separate backlog item.

---

## What is NOT changing

- `RecordFormPanel` -- no changes needed; handles `executive_agency` generically
- `240_app.js` -- no changes needed; `openForm` / `handleFormSave` already work for any table
- `executive_agency` data, schema columns, FK references -- unchanged
- Excel import/export (`SHEET_MAP`) -- unchanged

---

## Files changed

| File | Change |
|------|--------|
| `src/10_constants.js` | `executive_agency.label` renamed from `'Executive Agency'` to `'Agency'` |
| `src/80_sidebar.js` | Exclude `executive_agency` from sidebar nav list |
| `src/100_view_weights_org.js` | Add agency controls to `OwnershipOrgChart`: Add button, Edit + Retire/Restore per row |
