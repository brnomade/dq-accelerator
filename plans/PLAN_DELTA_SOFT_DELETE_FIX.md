# Plan: Delta Export — Soft-Deleted New Rows Bug Fix

Paired with: `DESIGN_DELTA_SOFT_DELETE_FIX.md`

## Change summary

One two-line edit in `src/71_master_version.js` inside `buildDelta()`. No other files change.

## Steps

### 1. Edit `src/71_master_version.js`

In `buildDelta()`, locate the `!wasSnap` branch (~line 92):

```js
// Current
if (!wasSnap) {
  inserted.push(row);
}

// Replace with
if (!wasSnap) {
  if (!row.retiring_timestamp) inserted.push(row);
}
```

### 2. Manual verification

Open the built app as a steward (non-master). Reproduce the bug scenario:

a. Import a master JSON file (establishes base snapshot).  
b. Create a new record in any delta-tracked table (e.g., add a CDE).  
c. Soft-delete that record via the retire button.  
d. Export delta and open the JSON file.  
e. Confirm the born-and-died record does NOT appear in `inserted` for that table.  
f. Also confirm that a record you edited (but did not retire) DOES appear in `updated`.  
g. Also confirm that a record that existed in the snapshot and was then retired DOES appear in `retired` (as an id).

### 3. Update CHANGELOG.md and SESSION_METRICS.md

Pre-generate build ID:
```
python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"
```

Add entry to CHANGELOG.md under the generated build ID. No user-guide update needed — this is an internal delta file correction with no UI change.

### 4. Build

```
cd build && python build.py
```

## Files touched

| File | Change |
|---|---|
| `src/71_master_version.js` | 2-line guard in `buildDelta()` |
| `CHANGELOG.md` | Release entry |
| `SESSION_METRICS.md` | Session entry |
