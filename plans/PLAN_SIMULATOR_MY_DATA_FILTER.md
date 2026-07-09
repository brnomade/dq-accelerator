# PLAN: RAG Simulator — My Data Filter

Paired with: `DESIGN_SIMULATOR_MY_DATA_FILTER.md`
Branch: `feature/rag-simulator-my-data-filter`
File modified: `src/170_screen_simulator.js` only

---

## Steps

### 1. Extend `useApp()` destructuring
Add `stewardIdentity` and `isMaster` to the destructured values at the top of `DQSimulatorScreen`.

### 2. Add `myDataOnly` state
```js
const [myDataOnly, setMyDataOnly] = useState(
  () => loadMyDataPref('moj_dq_simulator_mydata_v1', isMaster)
);
useEffect(
  () => { saveMyDataPref('moj_dq_simulator_mydata_v1', myDataOnly); },
  [myDataOnly]
);
```

### 3. Derive scope sets
After the existing `myStewardCdsIds` memo:
```js
const myStewardCdsIds = useMemo(
  () => getMyStewardCdsIds(data, stewardIdentity),
  [data, stewardIdentity]
);

// active filter set -- null means no filter
const scopeCdsIds = (myDataOnly && myStewardCdsIds) ? myStewardCdsIds : null;

const scopeDirIds = useMemo(() => {
  if (!scopeCdsIds) return null;
  return new Set(
    cdSets
      .filter(d => !d.retiring_timestamp && scopeCdsIds.has(d.critical_data_set_id))
      .map(d => d.directorate_id)
  );
}, [cdSets, scopeCdsIds]);

const scopeAgencyIds = useMemo(() => {
  if (!scopeDirIds) return null;
  return new Set(
    dirs
      .filter(d => !d.retiring_timestamp && scopeDirIds.has(d.directorate_id))
      .map(d => d.executive_agency_id)
  );
}, [dirs, scopeDirIds]);
```

### 4. Add scope filter to cascading option memos
- `agencyOpts`: add `.filter(a => !scopeAgencyIds || scopeAgencyIds.has(a.executive_agency_id))`
- `dirOpts`: add `.filter(d => !scopeDirIds || scopeDirIds.has(d.directorate_id))`
- `cdsOpts`: add `.filter(d => !scopeCdsIds || scopeCdsIds.has(d.critical_data_set_id))`
- `cdeOpts`: no change (already scoped to selected CDS)

Update memo dependency arrays to include the new scope sets.

### 5. Place `MyDataToggle` in the Step 1 header
Change the Step 1 label `<div>` into a flex row:
```jsx
<div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
  <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
    textTransform:'uppercase', color:accent }}>
    Step 1 - Select Critical Data Element
  </div>
  <MyDataToggle
    active={myDataOnly}
    onToggle={() => {
      setMyDataOnly(v => !v);
      setFilterAgencyId(null); setFilterDirId(null);
      setFilterCdsId(null);   setSelectedCdeId(null);
      setInputs({});
    }}
    available={!!stewardIdentity}
    accent={accent}
  />
</div>
```

### 6. Build and verify
- Run `python build.py`
- Test with identity set: toggle ON restricts all dropdowns; toggle OFF shows all
- Test with no identity: toggle is hidden, all dropdowns show full list
- Test default state: regular steward defaults to ON, master defaults to OFF

### 7. Commit, update CHANGELOG, build for release
- Pre-generate build ID
- Write CHANGELOG entry
- Run final build
- Commit docs + source + dist

---

## Risk / Notes

- `scopeCdsIds` is derived inline (not a memo) from `myDataOnly` and `myStewardCdsIds`. Since both are stable references, this is safe without wrapping in `useMemo`.
- `scopeDirIds` and `scopeAgencyIds` ARE memos because they iterate arrays.
- No guard is needed if a steward has zero CDS assignments: `getMyStewardCdsIds` returns `null` in that case, so `scopeCdsIds` is `null` and no filtering is applied — same as toggle OFF.
