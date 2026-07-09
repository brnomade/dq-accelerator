# DESIGN: Merge Directorate Management into Organisation Page

**Feature ref:** Merge Org + Directorate pages  
**Date:** 2026-06-26  
**Status:** Draft — awaiting review

---

## Problem statement

The Organisation page and the Directorate page are two separate screens that share a common concern: the agency–directorate hierarchy. Users must navigate away from the Organisation page to add or edit a directorate, creating unnecessary context-switching. The goal is to expose full directorate management directly within the Organisation page and retire the standalone Directorate page from the navigation menu.

---

## Current state

| Aspect | Organisation page (`OwnershipOrgChart`) | Directorate page (`DirectorateView`) |
|---|---|---|
| File | `100_view_weights_org.js` | `151_view_directorate.js` |
| Route | `{ screen: 'orgchart' }` via sidebar "Organisation" item | `{ screen: 'table', table: 'directorate' }` via sidebar "Directorate" item |
| Directorate display | Read-only rows inside expanded agency card | Editable grouped list with per-agency "+ Add" and per-row "Edit" buttons |
| Add directorate | Not available | "+ Add" button per agency (pre-selects agency) |
| Edit directorate | Not available | "Edit" button per directorate row |
| Retire / restore | Not available | Eye icon buttons per directorate row |
| Form panel | n/a | Generic `RecordFormPanel` |

---

## Target state

### Organisation page enhancements

Each **agency card header** gains a **`+ Directorate`** button (editor-only, stops row-expand propagation).  
Clicking it opens the generic `RecordFormPanel` for the `directorate` table with the `executive_agency_id` pre-set to that agency — identical to the `openAddForAgency` behaviour in DirectorateView.

Each **directorate sub-row** (inside the expanded card) gains:
- **Edit** button → opens `RecordFormPanel` populated with the directorate's existing data
- **Retire / Restore** button (eye-off / eye icon) → calls `retireRecord` / `restoreRecord`

### Sidebar

The **"Directorate"** entry is removed from the sidebar navigation by adding it to the existing exclusion filter alongside `field_profiling` and `executive_agency`.

### Import / Export

Completely unaffected. The `directorate` table is driven by `SCHEMA`, `SHEET_MAP`, and the data store — none of which change. The table will continue to be exported to Excel and importable from Excel.

---

## Technical approach

### `100_view_weights_org.js`

**Agency header row** (currently lines 491–513 — the `onClick={e => e.stopPropagation()}` div):

Add a `+ Directorate` button as the first element in that action group:
```jsx
{canEdit && !isRetired && (
  <button className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }}
    title="Add directorate to this agency"
    onClick={() => openForm('directorate', {
      ...buildBlankRecord('directorate', nextPk, data),
      executive_agency_id: aid
    })}>
    + Directorate
  </button>
)}
```

**Directorate sub-row** (currently lines 555–576 — directorate header div):

Add action buttons after the stat pills, mirroring DirectorateView's row actions:
```jsx
{canEdit && (
  <div onClick={e => e.stopPropagation()}
    style={{ display:'flex', gap:2, flexShrink:0 }}>
    {!dir.retiring_timestamp && (
      <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
        title="Edit directorate"
        onClick={() => openForm('directorate', { ...dir })}>
        <Icon.Pencil/>
      </button>
    )}
    {dir.retiring_timestamp ? (
      <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
        title="Restore directorate"
        onClick={() => restoreRecord('directorate', dir.directorate_id)}>
        <Icon.Eye/>
      </button>
    ) : (
      <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
        title="Retire directorate"
        onClick={() => retireRecord('directorate', dir.directorate_id)}>
        <Icon.EyeOff/>
      </button>
    )}
  </div>
)}
```

### `80_sidebar.js`

In the `group.tables.map()` filter block (currently lines 199–218), add:
```js
if (t === 'directorate') return null;
```
alongside the existing `field_profiling` and `executive_agency` exclusions.

### Files NOT changed

| File | Reason |
|---|---|
| `240_app.js` | The `route.table === 'directorate'` case can stay as dead code — it does not appear in the sidebar and the route is never navigated to |
| `151_view_directorate.js` | Kept in codebase for now; removal is a backlog item |
| `10_constants.js` | No schema or TABLE_GROUPS changes needed |
| All export/import files | Not affected |

---

## Constraints and risks

| Risk | Mitigation |
|---|---|
| `buildBlankRecord` is defined in `160_record_form_panel.js`, which comes after `100_view_weights_org.js` in file order | `buildBlankRecord` is a `function` declaration — JavaScript hoisting makes it available throughout the concatenated script scope regardless of file position. No action needed. |
| Agency FK dropdown is editable | The generic `RecordFormPanel` always shows the full FK dropdown; the user could change the agency after opening. This matches existing DirectorateView behaviour and is accepted. |
| Directorate acronym field is `directorate_acronymn` (double n) | This is existing data; no change required. |
| Retired directorates are only visible when "Show retired" is on | Retire/restore buttons are only added when `showRetired` includes the row — consistent with existing pattern. |

---

## Out of scope

- Removing `DirectorateView` and its routing from the codebase (added to backlog)
- Visual redesign of the directorate rows in OwnershipOrgChart
- Adding directorate search/filter to the Organisation page
