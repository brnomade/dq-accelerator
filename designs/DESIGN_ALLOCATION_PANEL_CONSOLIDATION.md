# Design: Allocation Panel Consolidation

**Status:** Proposed  
**Date:** 2026-08-25  
**Author:** Andre Ballista  

---

## Problem

There are currently two separate React components that render the Add/Edit Allocation panel:

| Component | File | Entry point |
|-----------|------|-------------|
| `CdeAllocFormPanel` | `141_view_cde_list.js` | Data and Stewardship CDE list, Rules Explorer |
| `RuleAllocationFormPanel` | `130_view_rule_allocation.js` | Rule Allocation view (sidebar, no longer reachable) |

The two components share identical logic for: rule dropdown filtering, Context Filter toggle, quality dimension selection, frequency selection, bumper value selection, duplicate check, SQL preview, SQL validation notices, and inline validation. Any change to shared logic must be applied twice — as demonstrated twice in succession:

- **Context Filter (2026-08-25):** the filter pill was implemented in `130` and only added to `141` in a follow-up fix commit after it was found missing.
- **SQL validation notices (2026-08-25):** the `ruleSqlWarnings` useMemo and notices block were implemented in `130` and again had to be duplicated into `141` in a separate commit, then extended to edit mode in a third commit.

Additionally, `RuleAllocationFormPanel` and the `RuleAllocationView` it lives in are unreachable — there is no sidebar entry for `data_quality_rule_allocation`. The `openAllocForm` context function and related app-level state (`allocFormRecord`, `allocFormIsEdit`) exist solely to serve this dead path.

---

## Goal

- Single `AllocationFormPanel` component covering both Add and Edit modes
- No duplicated rule filtering, validation, or SQL preview logic
- Dead code (`RuleAllocationView`, `openAllocForm` wiring) removed from `240_app.js`
- No change to the user-visible behaviour of the Add Allocation panel

---

## Current State — Structural Differences

The only meaningful structural difference between the two panels is how the CDE is established:

**`CdeAllocFormPanel`** — CDE is pre-established  
The CDE `record.critical_data_element_id` is passed in when the panel opens. No CDE picker is shown. The header displays `cde.source_field_name` and `cds.data_set_name`.

**`RuleAllocationFormPanel`** — CDE is picked by the user  
No CDE is known on open. The panel renders four cascading dropdowns (Agency → Directorate → Data Set → Field) to let the user select a CDE. The header shows a generic "Rule Allocation" subtitle.

All other fields — rule dropdown with Context Filter, quality dimension, frequency, bumper value, SQL preview, SQL validation notices (`ruleSqlWarnings`), duplicate check — are identical in both.

---

## Proposed Approach

### Single component: `AllocationFormPanel`

Defined in `130_view_rule_allocation.js`. Accepts:

```
AllocationFormPanel({ record, isEdit, onSave, onClose, data })
```

Behaviour driven by whether `record.critical_data_element_id` is pre-set on open:

- **Pre-set CDE** (`record.critical_data_element_id` is not null): hide the cascading picker; show read-only CDE display in the header (same as current `CdeAllocFormPanel`)
- **No CDE** (`record.critical_data_element_id` is null): show the four cascading dropdowns (same as current `RuleAllocationFormPanel` Add mode)
- **Edit mode** (`isEdit = true`): CDE always shown read-only regardless; same as current Edit behaviour in both panels

The cascading filter state variables (`filterAgencyId`, `filterDirId`, `filterCdsId`) are initialised as usual but remain unused when a CDE is pre-set — they add no overhead.

### Callers after consolidation

| Caller | File | Change |
|--------|------|--------|
| Data and Stewardship CDE list | `141_view_cde_list.js` | Replace `CdeAllocFormPanel` with `AllocationFormPanel` |
| Rules Explorer | `145_view_rules.js` | Replace `CdeAllocFormPanel` with `AllocationFormPanel` |
| App-level panel | `240_app.js` | Remove `allocFormRecord`, `allocFormIsEdit`, `openAllocForm`, `closeAllocForm`, `handleAllocSave` — no longer needed |

### Dead code to retire

- `RuleAllocationView` component in `130_view_rule_allocation.js` — move to `legacy/`
- `openAllocForm` context function and all related state in `240_app.js` — remove
- The `route.table === 'data_quality_rule_allocation'` routing branch in `240_app.js` — remove

---

## Files Touched

| File | Change type |
|------|-------------|
| `src/130_view_rule_allocation.js` | Rename/rewrite `RuleAllocationFormPanel` → `AllocationFormPanel`; delete `RuleAllocationView` |
| `src/141_view_cde_list.js` | Delete `CdeAllocFormPanel`; update caller to use `AllocationFormPanel` |
| `src/145_view_rules.js` | Update caller to use `AllocationFormPanel` |
| `src/240_app.js` | Remove `openAllocForm` wiring and `RuleAllocationView` route |
| `APP_TREE.md` | Update component map; move `RuleAllocationView` to Legacy section |

---

## Risks and Constraints

**Load order** — `AllocationFormPanel` must remain in `130_view_rule_allocation.js` (lower number than `141` and `145`) so it is defined before the files that call it. No renumbering needed.

**No module system** — the component name becomes a global. Rename from `RuleAllocationFormPanel` to `AllocationFormPanel` is a safe search-and-replace across the three caller files.

**Edit mode caller in `141_view_cde_list.js`** — the Rules Explorer (`145_view_rules.js`) also opens the alloc panel in Edit mode via a local `allocPanel` state. This continues to work — the unified component handles Edit mode identically to the current `CdeAllocFormPanel`.

**`openAllocForm` removal** — once `RuleAllocationView` is retired, `openAllocForm` is called from nowhere. Removing it from context and `240_app.js` is safe. Verify with a grep before deleting.

---

## Out of Scope

- No changes to the rule filtering logic or Context Filter behaviour
- No changes to the SQL preview or duplicate-check logic  
- No changes to the sidebar or routing for any other screen
- No schema or localStorage changes
