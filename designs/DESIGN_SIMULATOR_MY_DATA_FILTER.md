# DESIGN: RAG Simulator — My Data Filter

## Summary

Add the standard "My data" scope toggle to the RAG Simulator page so that a steward can restrict the cascading CDE selector to only the Critical Data Sets they are assigned to via the stewardship table. This reuses the established `MyDataToggle` component and the `getMyStewardCdsIds` / `loadMyDataPref` / `saveMyDataPref` utilities that are already in use on the CDE List, Rules Explorer, and DDL screens.

---

## Scope

**In scope:**
- Toggle button on the Step 1 panel header (same position as other pages)
- Cascading dropdown filtering: Agency → Directorate → CDS options are scoped to the steward's assigned CDSes
- CDE options are already naturally scoped once the CDS is chosen
- Preference persisted in localStorage per steward session
- Default: ON for regular stewards, OFF for master stewards (consistent with all other pages)

**Out of scope:**
- No change to Step 2 rule measurements logic
- No change to the calculation or score display
- No new data structures or schema changes

---

## User Experience

### Toggle placement
The `MyDataToggle` pill button sits inline with the "Step 1 - Select Critical Data Element" label, right-aligned — identical to the CDE list and rules explorer pages.

The toggle is hidden entirely when no steward identity is configured (same rule as all other pages).

### Filter behaviour
| State | What the steward sees |
|---|---|
| My data ON | Agency, Directorate, and CDS dropdowns show only entries that contain at least one CDS assigned to the steward. CDEs are unchanged since they belong to a CDS already. |
| My data OFF | All active (non-retired) agencies, directorates, CDSes, and CDEs, same as before. |

### Selection reset on toggle
When the toggle is switched, all four cascading selections (agency, directorate, CDS, CDE) are cleared. This avoids the risk of a previously selected value being out of scope after the toggle changes.

---

## Technical Design

### New state and memos in `DQSimulatorScreen`

```
stewardIdentity, isMaster  ← added to useApp() destructuring

myStewardCdsIds  ← useMemo, getMyStewardCdsIds(data, stewardIdentity)
                   returns Set<critical_data_set_id> or null

myDataOnly       ← useState, initialised via loadMyDataPref('moj_dq_simulator_mydata_v1', isMaster)
                   useEffect persists on change via saveMyDataPref

scopeCdsIds      ← derived: myDataOnly && myStewardCdsIds ? myStewardCdsIds : null
                   null means "no filter applied"

scopeDirIds      ← useMemo: Set of directorate_ids that have at least one CDS in scopeCdsIds
scopeAgencyIds   ← useMemo: Set of executive_agency_ids that have at least one dir in scopeDirIds
```

### Filtering the cascading options

Each existing `useMemo` for dropdown options gains one extra filter clause:

```
agencyOpts  → additionally filter: !scopeAgencyIds || scopeAgencyIds.has(a.executive_agency_id)
dirOpts     → additionally filter: !scopeDirIds    || scopeDirIds.has(d.directorate_id)
cdsOpts     → additionally filter: !scopeCdsIds    || scopeCdsIds.has(d.critical_data_set_id)
cdeOpts     → no change needed (already scoped to the chosen CDS)
```

### Toggle wiring

```jsx
<MyDataToggle
  active={myDataOnly}
  onToggle={() => {
    setMyDataOnly(v => !v);
    setFilterAgencyId(null);
    setFilterDirId(null);
    setFilterCdsId(null);
    setSelectedCdeId(null);
    setInputs({});
  }}
  available={!!stewardIdentity}
  accent={accent}
/>
```

### localStorage key
`moj_dq_simulator_mydata_v1` — unique to this screen, consistent with the naming convention used by other screens.

---

## Dependencies

| Item | Location | Status |
|---|---|---|
| `MyDataToggle` component | `70_header_footer.js` | Existing — no changes needed |
| `getMyStewardCdsIds` | `20_data_utils.js` | Existing — no changes needed |
| `loadMyDataPref` / `saveMyDataPref` | `20_data_utils.js` | Existing — no changes needed |
| `stewardIdentity`, `isMaster` | AppContext via `useApp()` | Existing — just add to destructuring |

Only `170_screen_simulator.js` is modified.
