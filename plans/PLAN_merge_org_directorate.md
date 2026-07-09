# PLAN: Merge Directorate Management into Organisation Page

**Paired design:** `designs/DESIGN_merge_org_directorate.md`  
**Date:** 2026-06-26  
**Status:** Draft — awaiting approval before implementation

---

## Goal

Embed full directorate management (add, edit, retire, restore) into the Organisation page (`OwnershipOrgChart`) and remove the standalone Directorate page from the sidebar.

---

## Steps

### Step 1 — Add `+ Directorate` button to each agency header (`100_view_weights_org.js`)

**Location:** Inside the `onClick={e => e.stopPropagation()}` div at approximately line 492 — the same div that holds the Edit and Retire/Restore buttons for the agency.

**Change:** Add a `+ Directorate` button **before** the existing Edit pencil button. The button:
- Is shown only when `canEdit && !isRetired`
- Calls `openForm('directorate', { ...buildBlankRecord('directorate', nextPk, data), executive_agency_id: aid })`
- Has `fontSize: 10, padding: '2px 8px'` styling to match the existing ghost buttons

---

### Step 2 — Add Edit + Retire/Restore buttons to each directorate sub-row (`100_view_weights_org.js`)

**Location:** Inside the directorate header div at approximately lines 555–576, currently containing the name, stat pills, and retired badge.

**Change:** After the retired badge, add an action group:
- Edit button (hidden when directorate is retired): `openForm('directorate', { ...dir })`
- Retire button (when live): `retireRecord('directorate', dir.directorate_id)`
- Restore button (when retired): `restoreRecord('directorate', dir.directorate_id)`

All wrapped in `onClick={e => e.stopPropagation()}` to prevent the parent expand toggle from firing.

---

### Step 3 — Remove Directorate from sidebar (`80_sidebar.js`)

**Location:** Lines 199–201 — the filter at the top of `group.tables.map()`.

**Change:** Add `if (t === 'directorate') return null;` so the entry is hidden from the navigation menu.

---

### Step 4 — Add backlog item

Add the following item to `BACKLOG.md`:

> **[BACKLOG] Remove DirectorateView from codebase**  
> Now that directorate management is embedded in the Organisation page, `DirectorateView` in `151_view_directorate.js` and the `route.table === 'directorate'` case in `240_app.js` are dead code. Remove both when convenient.

---

### Step 5 — Build and browser test

```bash
cd build
python build.py
```

Open `dist/dq-accelerator.html` in a browser and verify:

| Test | Expected |
|---|---|
| "Directorate" entry absent from sidebar | Pass |
| "Organisation" page still loads | Pass |
| Expanding an agency card shows directorates | Pass |
| `+ Directorate` button visible (editor mode) on each agency card header | Pass |
| `+ Directorate` opens form panel with correct agency pre-selected | Pass |
| Saving new directorate adds it to the expanded card | Pass |
| "Edit" button appears on each live directorate row | Pass |
| Edit button opens form panel pre-populated with directorate data | Pass |
| Saving edit updates the directorate row | Pass |
| Retire button retires directorate (row goes grey / gets retired badge) | Pass |
| Restore button restores retired directorate | Pass |
| Export to Excel still includes Directorate sheet with correct data | Pass |
| Import of Excel with Directorate sheet still works | Pass |

---

### Step 6 — Update CHANGELOG.md and SESSION_METRICS.md

After successful build, add entries to both files using the build ID as the heading.

---

## File change summary

| File | Change type | Description |
|---|---|---|
| `src/100_view_weights_org.js` | Edit | Add `+ Directorate` button to agency header; add Edit + Retire/Restore to directorate rows |
| `src/80_sidebar.js` | Edit | Add `directorate` to sidebar exclusion filter |
| `BACKLOG.md` | Edit | Add backlog item for future codebase cleanup |
| `CHANGELOG.md` | Edit | Post-build entry |
| `SESSION_METRICS.md` | Edit | Post-build entry |

**Files not changed:** `151_view_directorate.js`, `240_app.js`, `10_constants.js`, all export/import files.

---

## Estimated effort

| Activity | Estimate |
|---|---|
| Coding (3 targeted edits) | ~30 min |
| Build + browser testing | ~15 min |
| Docs update | ~5 min |
| **Total** | **~50 min** |
