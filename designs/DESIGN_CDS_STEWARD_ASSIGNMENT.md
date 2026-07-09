# DESIGN — CDS Steward Assignment in Edit Panel

**Feature:** Allow users to add and remove steward assignments directly from the Edit CDS panel (Data & Stewardship page).

---

## Problem

When editing an existing Critical Data Set, the Stewards section of `CdsFormPanel` is read-only. It shows assigned stewards as plain text chips with no controls. There is no way to:

- Add a new steward assignment to an existing CDS
- Remove an existing steward assignment from a CDS

The only current workaround is the dedicated Stewardship table screen, which is less discoverable and requires navigating away.

---

## Data Model

The `stewardship` table is the junction table linking a CDS to a Data Steward:

| Column | Type | Notes |
|--------|------|-------|
| `stewardship_id` | int PK | |
| `critical_data_set_id` | int FK | links to `critical_data_set` |
| `data_steward_id` | int FK | links to `data_steward` |
| `retiring_timestamp` | datetime | null = active, non-null = retired |

Multiple stewards can be assigned to one CDS (one-to-many via stewardship).

---

## Proposed UX — Edit Mode Stewards Section

Replace the static read-only list with an interactive section:

**Current assigned stewards list**
- Each active stewardship record is shown as a chip: `[Name — Title  ×]`
- Clicking `×` marks that stewardship for removal (chip disappears immediately from the list; change is applied on Save)

**Pending add area**
- A dropdown listing all active Data Stewards not currently assigned to this CDS (excluding any pending-removal ones, so a just-removed steward can be re-added)
- An "Add" button next to the dropdown
- Selecting and clicking Add shows a preview chip with a cancel (×) button so the user can undo before saving

**On Save**
- Stewardships marked for removal are retired (`retiring_timestamp` set)
- The pending-add steward (if any) gets a new `stewardship` record created

**Edge cases**
- Dropdown only lists stewards not already in the effective assigned list (prevents duplicates)
- If all stewards are assigned, the dropdown shows "-- all stewards already assigned --" and the Add button is disabled
- If no stewards exist at all, a warning note is shown (same pattern as the no-directorates warning)

---

## Scope of Changes

### `src/162_form_panel_cds.js`

1. Add two new state vars in the component:
   - `pendingRemoveIds` — a `Set` of `stewardship_id` values to retire on save (initialised empty)
   - `pendingAddId` — a `data_steward_id | null` for the steward to add on save (initialised `null`)

2. Derive `effectiveStewardships` — existing stewardship records for this CDS, filtered to exclude `pendingRemoveIds`.

3. Derive `availableStewards` — active Data Stewards not in `effectiveStewardships` (and not equal to `pendingAddId`), for the Add dropdown.

4. Replace the read-only render block with the interactive section described above.

5. In `handleSave`, append to the saved record:
   - `__removeStewardshipIds: [...pendingRemoveIds]`
   - `__addStewardId: pendingAddId` (or null)

### `src/240_app.js` — `handleCdsSave`

Extract and process the two new transient fields:

```
__removeStewardshipIds  → call retireRecord('stewardship', id) for each
__addStewardId          → call upsertRecord('stewardship', new record) if non-null
```

Add `retireRecord` to the `useCallback` dependency array.

---

## What is NOT changing

- New-mode behaviour is unchanged (`__stewardId` flow stays as-is)
- The dedicated Stewardship table screen (`164_form_panel_stewardship.js`) is untouched
- No schema changes

---

## Risks / Notes

- `nextPk('stewardship')` is called once per save (for the optional add). No batching issue since the remove path uses `retireRecord` (separate update), not `upsertRecord`.
- The `pendingAddId` dropdown must be reset if the user changes the CDS record (not applicable — the CDS is fixed in edit mode). No reset logic needed.
