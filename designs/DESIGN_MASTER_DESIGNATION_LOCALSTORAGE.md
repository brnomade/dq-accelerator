# DESIGN — Move Master Designation to localStorage

## Problem

The current mechanism for recording which steward is the "master" is a sentinel row in the `stewardship` table:

```
{ stewardship_id: N, critical_data_set_id: 0, data_steward_id: X, retiring_timestamp: null }
```

`critical_data_set_id = 0` does not correspond to any real CDS. It is an out-of-band signal used purely to identify the master steward. This causes:

- **Dashboard FK integrity alerts** — `runHealthCheck` flags the sentinel row because `critical_data_set_id = 0` resolves to no record in `critical_data_set`.
- **Data Browser noise** — the sentinel row appears in the stewardship table view alongside real data.
- **CSV FK warning** — when exporting/importing the stewardship table as CSV, the FK validator raises a spurious outbound warning.

The sentinel row approach is also semantically wrong: master designation is a **local session concept** (which browser is acting as master), not a shared data record. It should never travel in exports, delta files, or CSV backups.

---

## Solution: Option 1 — Dedicated localStorage key

Store the master designation in a dedicated localStorage key, separate from the stewardship data table.

### New localStorage key

```
moj_dq_master_v1  →  { stewardId: <integer> }
```

Access functions added to `71_master_version.js` (alongside the existing steward identity functions):

```js
const MASTER_DESIGNATION_KEY = 'moj_dq_master_v1';

function loadMasterDesignation() { ... }    // returns { stewardId } or null
function saveMasterDesignation(stewardId) { ... }  // writes + dispatches storage event
function clearMasterDesignation() { ... }   // removes + dispatches storage event
```

---

## Data Migration

Existing datasets may have the sentinel row. At first load after this change, the app detects and migrates it automatically:

1. In the `stored` useMemo in `App()`, after `loadFromStorage()`, scan `stewardship` for any row where `critical_data_set_id === 0`.
2. If found: write `saveMasterDesignation(row.data_steward_id)` (only if no designation already recorded), then strip the sentinel row from the stewardship array, and persist the cleaned data to localStorage.
3. The rest of the app initialises with clean data — no consumer sees the sentinel row.

---

## isMaster derivation (240_app.js)

**Before:**
```js
const isMaster = useMemo(() => {
  if (!stewardIdentity || !data) return false;
  return (data.stewardship || []).some(s =>
    s.critical_data_set_id === 0 &&
    s.data_steward_id === stewardIdentity.id &&
    !s.retiring_timestamp
  );
}, [data, stewardIdentity]);
```

**After:**
```js
const [masterDesignation, setMasterDesignationState] = useState(() => loadMasterDesignation());

// synced alongside the existing stewardIdentity useEffect
// handler: () => { setStewardIdentityState(...); setMasterDesignationState(loadMasterDesignation()); }

const isMaster = useMemo(() => {
  if (!stewardIdentity || !masterDesignation) return false;
  return masterDesignation.stewardId === stewardIdentity.id;
}, [stewardIdentity, masterDesignation]);
```

No longer depends on `data` — `isMaster` remains correct even before data is loaded.

---

## designateAsMaster (240_app.js)

**Before:** Inserted a stewardship row via `setData` + `persist`.

**After:**
```js
const designateAsMaster = useCallback((stewardDsId) => {
  saveMasterDesignation(stewardDsId);
}, []);
```

Pure localStorage write. The storage event fires, which updates `masterDesignation` state, which recomputes `isMaster`.

---

## SettingsPanel (70_header_footer.js)

Remove the stewardship data scan:

**Before:**
```js
const stewardships = data?.stewardship || [];
const masterRecord = stewardships.find(s => s.critical_data_set_id === 0 && !s.retiring_timestamp);
const isMasterSteward = masterRecord && masterRecord.data_steward_id === stewardId;
const masterSteward   = masterRecord ? stewards.find(s => s.data_steward_id === masterRecord.data_steward_id) : null;
```

**After:**
```js
const designation    = loadMasterDesignation();
const isMasterSteward = designation && designation.stewardId === stewardId;
const masterSteward  = designation ? stewards.find(s => s.data_steward_id === designation.stewardId) : null;
```

All three downstream usages (`handleStewardSave`, the MASTER badge, the "Master info" display) adapt naturally.

---

## handleReset (240_app.js)

Add `clearMasterDesignation()` and `setMasterDesignationState(null)` to the existing reset sequence.

---

## What Does Not Change

- The `designateAsMaster` function signature — callers pass `stewardDsId` as before.
- `saveStewardIdentity` / `clearStewardIdentity` — untouched.
- `SCHEMA`, `DELTA_TABLES` — no changes; stewardship table is unchanged structurally.
- All export, import, and delta paths — they no longer see the sentinel row (it never exists in data).
- The Settings UI layout — identical to the user; the designation prompt and MASTER badge behaviour are preserved.

---

## Impact on Alerts

After this change:
- `runHealthCheck` finds no FK violation in stewardship (sentinel row is gone).
- Data Browser shows only real stewardship records.
- CSV FK validator raises no spurious warning on stewardship imports.
