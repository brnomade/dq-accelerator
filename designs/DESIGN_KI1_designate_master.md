# DESIGN — KI-1 / KI-2: Master Designation Fix

## Problem

`handleDesignateMaster` in `70_header_footer.js` calls `upsertRecord('stewardship', {...})` to create the master stewardship record. `upsertRecord` gates on `stewardIdentity !== null`. When the user sets identity and immediately clicks "Designate me as master" in the same Settings session, the `upsertRecord` captured from context still has `stewardIdentity = null` in its closure (App re-render from the storage event has not yet completed). The record is silently never inserted. `setMasterSaved(true)` fires unconditionally, showing a false-positive success message.

Because `isMaster` is computed entirely from the existence of that record, it stays `false`. Page refresh cannot recover the state. Both KI-1 (PK namespace unchanged) and KI-2 (badge missing) are symptoms of the same failure.

## Solution

Add a dedicated `designateAsMaster(stewardDsId)` callback in `240_app.js` that:

- Does **not** gate on `stewardIdentity` (the steward ID is passed explicitly as a parameter)
- Uses a global-max PK for the stewardship record (no steward namespace)
- Persists to localStorage via `persist()`

Expose it in the context value. `SettingsPanel.handleDesignateMaster` calls this function instead of `upsertRecord`.

## Data flow

```
SettingsPanel.handleDesignateMaster(stewardId)
  └─ context.designateAsMaster(stewardId)
       └─ setData(prev => {
            insert { stewardship_id: maxPk+1, critical_data_set_id: 0,
                     data_steward_id: stewardDsId, retiring_timestamp: null }
            persist(n)
          })
  └─ isMaster recomputes → true
  └─ header badge appears, PK namespace shows "master sequence"
```

## Scope

- `src/240_app.js` — add `designateAsMaster` useCallback; add to context value and `ctxValue` useMemo deps
- `src/70_header_footer.js` — update `handleDesignateMaster` to call `designateAsMaster(stewardId)` from context; update `useApp()` destructure

No schema, routing, localStorage key, or UI layout changes.

## Out of scope

- KI-8 (master PK sequence entering steward ranges) — separate fix
- KI-6 (stale closure affecting +CDS/+CDE buttons) — same class of bug but different call site; address separately
