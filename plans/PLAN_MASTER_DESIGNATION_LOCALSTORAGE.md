# PLAN — Move Master Designation to localStorage

Paired design: `DESIGN_MASTER_DESIGNATION_LOCALSTORAGE.md`

---

## Files Affected

| File | Action | Reason |
|------|--------|--------|
| `src/71_master_version.js` | **Modify** | Add `MASTER_DESIGNATION_KEY`, `loadMasterDesignation`, `saveMasterDesignation`, `clearMasterDesignation` |
| `src/240_app.js` | **Modify** | Migration in `stored` useMemo; rewrite `designateAsMaster`; add `masterDesignation` state; rewrite `isMaster`; update `handleReset` |
| `src/70_header_footer.js` | **Modify** | Replace stewardship data scan with `loadMasterDesignation()` in `SettingsPanel` |

No schema changes. No new source files. No CSS changes.

---

## Step 1 — Add localStorage functions to `71_master_version.js`

Append after the existing `loadStewardIdentity` function (after line 53).

```js
const MASTER_DESIGNATION_KEY = 'moj_dq_master_v1';

function loadMasterDesignation() {
  try { return JSON.parse(localStorage.getItem(MASTER_DESIGNATION_KEY)) || null; } catch { return null; }
}

function saveMasterDesignation(stewardId) {
  try {
    localStorage.setItem(MASTER_DESIGNATION_KEY, JSON.stringify({ stewardId: stewardId }));
    window.dispatchEvent(new Event('storage'));
  } catch {}
}

function clearMasterDesignation() {
  try {
    localStorage.removeItem(MASTER_DESIGNATION_KEY);
    window.dispatchEvent(new Event('storage'));
  } catch {}
}
```

---

## Step 2 — Update `240_app.js`

### 2a. Migration in `stored` useMemo (line 84)

Replace:
```js
const stored = useMemo(() => loadFromStorage(), []);
```

With:
```js
const stored = useMemo(function() {
  var s = loadFromStorage();
  if (s && s.data && s.data.stewardship) {
    var sentinel = s.data.stewardship.find(function(r) {
      return r.critical_data_set_id === 0 && !r.retiring_timestamp;
    });
    if (sentinel) {
      if (!loadMasterDesignation()) saveMasterDesignation(sentinel.data_steward_id);
      var cleanedStewardship = s.data.stewardship.filter(function(r) {
        return r.critical_data_set_id !== 0;
      });
      var cleanedData = Object.assign({}, s.data, { stewardship: cleanedStewardship });
      saveToStorage(cleanedData);
      return Object.assign({}, s, { data: cleanedData });
    }
  }
  return s;
}, []);
```

### 2b. Add `masterDesignation` state (near line 425, alongside the existing `stewardIdentity` state)

Add after `const [stewardIdentity, setStewardIdentityState] = useState(...)`:
```js
const [masterDesignation, setMasterDesignationState] = useState(function() { return loadMasterDesignation(); });
```

### 2c. Merge `masterDesignation` sync into the existing `storage` useEffect (line 428)

Replace:
```js
useEffect(() => {
  const handler = () => setStewardIdentityState(loadStewardIdentity());
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}, []);
```

With:
```js
useEffect(() => {
  const handler = () => {
    setStewardIdentityState(loadStewardIdentity());
    setMasterDesignationState(loadMasterDesignation());
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}, []);
```

### 2d. Rewrite `isMaster` useMemo (line 434)

Replace:
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

With:
```js
const isMaster = useMemo(() => {
  if (!stewardIdentity || !masterDesignation) return false;
  return masterDesignation.stewardId === stewardIdentity.id;
}, [stewardIdentity, masterDesignation]);
```

### 2e. Rewrite `designateAsMaster` callback (line 172)

Replace the entire `designateAsMaster` useCallback body:
```js
const designateAsMaster = useCallback((stewardDsId) => {
  saveMasterDesignation(stewardDsId);
}, []);
```

Remove `persist` from the dependency array (now empty).

### 2f. Update `handleReset` (line 201)

Add two lines to the reset sequence:
```js
clearMasterDesignation();
setMasterDesignationState(null);
```

### 2g. Update `ctxValue` useMemo deps (line 444)

Remove `designateAsMaster` from the deps array (it no longer changes) — or leave it; either way is correct since `useCallback(fn, [])` is stable.

---

## Step 3 — Update `SettingsPanel` in `70_header_footer.js`

### 3a. Remove stewardship scan (lines 69–78)

Delete:
```js
const stewardships = data?.stewardship || [];
const masterRecord = stewardships.find(s =>
  s.critical_data_set_id === 0 && !s.retiring_timestamp
);
const isMasterSteward = masterRecord && masterRecord.data_steward_id === stewardId;
const masterSteward   = masterRecord
  ? stewards.find(s => s.data_steward_id === masterRecord.data_steward_id)
  : null;
```

Replace with:
```js
var designation    = loadMasterDesignation();
var isMasterSteward = designation && designation.stewardId === stewardId;
var masterSteward  = designation
  ? stewards.find(function(s) { return s.data_steward_id === designation.stewardId; })
  : null;
```

### 3b. Update `handleStewardSave` (line 100)

Replace:
```js
if (!masterRecord) setMasterPrompt(true);
```
With:
```js
if (!loadMasterDesignation()) setMasterPrompt(true);
```

### 3c. Update "Master info" display (line 248)

Replace:
```js
{masterRecord && !isMasterSteward && (
  ...
  {masterSteward?.data_steward_name || `Steward #${masterRecord.data_steward_id}`}
  ...
)}
```
With:
```js
{designation && !isMasterSteward && (
  ...
  {masterSteward ? masterSteward.data_steward_name : 'Steward #' + designation.stewardId}
  ...
)}
```

Note: template literal replaced with string concatenation to avoid Babel edge cases.

---

## Step 4 — Build, Changelog, Session Metrics

Follow mandatory end-of-task sequence:
1. Pre-generate build ID
2. Write CHANGELOG.md and SESSION_METRICS.md entries
3. Run `python build.py`

No user documentation update needed — the Settings UI is visually identical; the change is internal storage architecture.

---

## Verification Checklist

After build, test the following in the browser:

- [ ] Open Settings, select identity, Save — master prompt appears (no master yet)
- [ ] Click "Designate me as master" — MASTER badge appears, PK namespace shows "master sequence"
- [ ] Reload page — MASTER badge still shows
- [ ] Open stewardship table view — no sentinel row with CDS=0
- [ ] Dashboard — no FK integrity alert for stewardship sentinel row
- [ ] Data Browser — no sentinel row visible
- [ ] Reset app — master designation cleared; MASTER badge gone after identity re-set
- [ ] Existing data migration — load a JSON that contains the old sentinel row; verify it is stripped and master designation is written to localStorage
