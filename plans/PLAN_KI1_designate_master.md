# PLAN — KI-1 / KI-2: Master Designation Fix

Paired design: `designs/DESIGN_KI1_designate_master.md`

## Files changed

- `src/240_app.js` — new `designateAsMaster` callback + context wiring
- `src/70_header_footer.js` — `SettingsPanel` calls new context function

---

## Step 1 — Add `designateAsMaster` to `240_app.js`

After the `nextPk` useCallback, add:

```js
const designateAsMaster = useCallback((stewardDsId) => {
  setData(prev => {
    const rows  = prev.stewardship || [];
    const maxPk = rows.reduce((m, r) => Math.max(m, r.stewardship_id ?? 0), 0);
    const rec   = {
      stewardship_id:       maxPk + 1,
      critical_data_set_id: 0,
      data_steward_id:      stewardDsId,
      retiring_timestamp:   null,
    };
    const n = { ...prev, stewardship: [...rows, rec] };
    persist(n);
    return n;
  });
}, [persist]);
```

## Step 2 — Add `designateAsMaster` to context value in `240_app.js`

In `ctxValue` useMemo:
- Add `designateAsMaster` to the value object
- Add `designateAsMaster` to the dependency array

## Step 3 — Update `SettingsPanel` in `70_header_footer.js`

**Destructure from context:**
```js
const { data, upsertRecord, nextPk, designateAsMaster } = useApp();
```

**Replace `handleDesignateMaster`:**
```js
const handleDesignateMaster = () => {
  if (!stewardId) return;
  designateAsMaster(stewardId);
  setMasterPrompt(false);
  setMasterSaved(true);
  setTimeout(() => setMasterSaved(false), 2500);
};
```

Remove the `nextPk` call for the stewardship PK — that logic moves into `designateAsMaster`.

---

## Acceptance criteria

- Sequence: fresh install → import Excel → select identity → save → designate as master
- After designation: PK namespace immediately shows "master sequence (no prefix)"
- After designation: MASTER badge appears in header
- After page refresh: state is preserved (MASTER badge and namespace still correct)
- No regression: stewards (non-master) continue to receive steward-namespace PKs
- Build passes with no non-ASCII characters
