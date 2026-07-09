# PLAN — CDS Steward Assignment in Edit Panel

Paired with: `DESIGN_CDS_STEWARD_ASSIGNMENT.md`

---

## Steps

### Step 1 — Update `162_form_panel_cds.js`

**a) Add state vars** (after the existing `stewardId` state, line 27):
```js
const [pendingRemoveIds, setPendingRemoveIds] = useState(() => new Set());
const [pendingAddId,     setPendingAddId]     = useState(null);
```

**b) Add derived memos** (after `existingStewards`, line 60):
```js
// Stewardship records for this CDS, indexed by stewardship_id — needed to pass IDs to save
const existingStewardships = useMemo(() => {
  if (!isEdit) return [];
  return (data?.stewardship || [])
    .filter(s => !s.retiring_timestamp && s.critical_data_set_id === record?.critical_data_set_id);
}, [data, isEdit, record]);

// Active assignments after applying pending removals
const effectiveStewardships = useMemo(() =>
  existingStewardships.filter(s => !pendingRemoveIds.has(s.stewardship_id)),
  [existingStewardships, pendingRemoveIds]);

// Steward IDs already effectively assigned (+ pending add) — for dropdown exclusion
const assignedStewardIds = useMemo(() => {
  const ids = new Set(effectiveStewardships.map(s => s.data_steward_id));
  if (pendingAddId) ids.add(pendingAddId);
  return ids;
}, [effectiveStewardships, pendingAddId]);

// Stewards available to add
const availableStewards = useMemo(() =>
  allStewards.filter(s => !assignedStewardIds.has(s.data_steward_id)),
  [allStewards, assignedStewardIds]);
```

**c) Update `handleSave`** — replace line 77:
```js
// was: if (!isEdit && stewardId) saved.__stewardId = stewardId;
if (!isEdit && stewardId) saved.__stewardId = stewardId;
if (isEdit) {
  saved.__removeStewardshipIds = [...pendingRemoveIds];
  saved.__addStewardId = pendingAddId;
}
```

**d) Replace the edit-mode Stewards render block** (lines 170–200) with the interactive version:

- Map `effectiveStewardships` → chip with steward name/title + `×` button that adds to `pendingRemoveIds`
- If `pendingAddId` is set: show a preview chip with `×` to clear it
- Show the Add dropdown (disabled if `availableStewards` is empty) + "Add" button
- "Add" button calls `setPendingAddId(selectedDropdownValue)` and resets dropdown selection to `null`

---

### Step 2 — Update `240_app.js` `handleCdsSave`

**a)** Extract new transient fields:
```js
const addStewardId         = record.__addStewardId ?? null;
const removeStewardshipIds = record.__removeStewardshipIds ?? [];
```

**b)** Delete them before upserting:
```js
delete cdsRecord.__addStewardId;
delete cdsRecord.__removeStewardshipIds;
```

**c)** Process removals and additions after the CDS upsert:
```js
for (const sid of removeStewardshipIds) retireRecord('stewardship', sid);
if (addStewardId) {
  upsertRecord('stewardship', {
    stewardship_id:       nextPk('stewardship'),
    critical_data_set_id: cdsRecord.critical_data_set_id,
    data_steward_id:      addStewardId,
    retiring_timestamp:   null,
  });
}
```

**d)** Add `retireRecord` to `useCallback` dependency array.

---

### Step 3 — Build and verify

```bash
cd build && python build.py
```

Manual checks:
- Open Edit CDS panel — Stewards section shows existing stewards with `×` buttons
- Click `×` on a steward — chip disappears, dropdown now includes that steward
- Select a steward from dropdown, click Add — preview chip appears
- Click `×` on preview chip — pending add cancelled, steward back in dropdown
- Save — retired stewardship records no longer shown; new record appears
- New CDS flow unchanged — steward dropdown still works as before

---

## Files Changed

| File | Change type |
|------|-------------|
| `src/162_form_panel_cds.js` | Edit — interactive stewards section in edit mode |
| `src/240_app.js` | Edit — `handleCdsSave` retirement + add logic |

---

## Estimated effort

~45 minutes coding + build + manual test
