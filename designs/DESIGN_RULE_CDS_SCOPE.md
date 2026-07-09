# DESIGN — Rule CDS Scope

**Feature:** Formal CDS-to-Rule scoping via a nullable FK on `data_quality_rule`
**Status:** Draft — awaiting user approval before implementation

---

## Problem statement

Rules are currently named with a "prefix — rule name" convention (e.g., `Generic - Completeness check`, `HMCTS - Court date validation`) to signal which CDS context they apply to. This is a workaround: filtering logic in both the Rule Generator and the Rules Explorer depends on string-matching the prefix. The convention is fragile, invisible to the data model, and not enforceable.

---

## Proposed solution

Add a nullable `critical_data_set_id` FK directly to `data_quality_rule`.

| Value | Meaning |
|-------|---------|
| `NULL` | Generic — rule applies in any CDS context |
| `<cds_id>` | CDS-specific — rule belongs to exactly one CDS |

Filter query for "show rules applicable to CDS X":
```
WHERE critical_data_set_id IS NULL OR critical_data_set_id = X
```

No separate link table is needed. No boolean flag is needed (`NULL` serves as the "generic" signal).

---

## Schema change — `10_constants.js`

Add one column to `data_quality_rule.cols`, after `automated` and before `retiring_timestamp`:

```js
{ name: 'critical_data_set_id', type: 'int', label: 'CDS Scope',
  optional: true,
  fk: { table: 'critical_data_set', field: 'critical_data_set_id', display: 'data_set_name' } }
```

No other schema tables change. No new table is created.

---

## Migration

**Manual.** Existing rules will have `critical_data_set_id: null` after the feature ships, making them all Generic by default. Stewards assign the correct CDS (or confirm Generic) for each rule at their own pace via the updated Rule form.

No automated migration, no bulk-assign UI in this phase.

---

## UI changes

### 1. Rule form panel — `166_form_panel_rule.js`

Add a **CDS Scope** dropdown below the rule name field:

- First option: `— Generic (applies to all CDS) —` → value `null`
- Remaining options: all active `critical_data_set` records, sorted by name, showing `data_set_name`
- Saves to `critical_data_set_id` on the rule record
- Not a required field (null is valid and means Generic)
- Displayed in both Add and Edit modes

Visual treatment: labelled `CDS Scope`, same style as other optional dropdowns in the form. Show a small muted `(Generic)` hint text when null is selected, to make the meaning obvious.

---

### 2. Rule Generator — `180_screen_generator.js`

Two changes:

**a. Replace prefix-based generic detection**

Current code:
```js
rules.filter(r => !r.retiring_timestamp && r.rule_name && r.rule_name.startsWith('Generic - '))
```
Replace with:
```js
rules.filter(r => !r.retiring_timestamp && r.critical_data_set_id == null)
```
This fixes the `genericRulesCtx` computation used in the AI prompt context builder.

**b. Pre-populate CDS scope when creating a rule from Step 3**

When a steward is in the generator with a CDS selected (`filterCdsId` is set) and creates a new rule from a proposal card, pre-fill `critical_data_set_id` with `filterCdsId`. The steward can still override to Generic from the rule form if opened for editing.

If no CDS is selected (generator opened without a CDS context), `critical_data_set_id` defaults to `null` (Generic).

---

### 3. Rules Explorer — `145_view_rules.js`

Two changes:

**a. CDS scope filter**

Add a **CDS scope** dropdown to the toolbar, alongside the existing search box and "My data only" toggle:

- Option: `All rules` (default — no filtering, current behaviour)
- Option: `Generic only` (show rules where `critical_data_set_id IS NULL`)
- Then one option per active CDS: `[CDS name] + Generic` (show rules where `critical_data_set_id IS NULL OR critical_data_set_id = X`)

The third option group ("CDS + Generic") is the primary use case: a steward picks their CDS and sees all rules available in that context — both rules specific to that CDS and generic rules that apply everywhere.

The filter is applied in `buildRuleHierarchy` before building the hierarchy, in addition to the existing `scopeCdsIds` steward-scope filter (both filters can be active simultaneously).

**b. CDS scope badge on each rule row**

Each rule row in the explorer displays a small badge next to the rule name:
- `Generic` — muted grey pill, when `critical_data_set_id` is null
- `[CDS name]` — coloured pill using the DQ group accent colour, when CDS-specific

This makes scope immediately visible without opening the rule.

---

## What does NOT change

- The naming convention (prefixes) is not automatically stripped. Existing rule names are untouched; stewards clean them up manually over time.
- The `data_quality_rule_allocation` table is unchanged. Allocation is still CDE-level.
- The Excel import/export (`SHEET_MAP`) works transparently — the new column appears in the `Data Quality Rule` sheet and is read/written like any other column.
- The generic `GenericTableView` for `data_quality_rule` gains the FK dropdown automatically from the SCHEMA definition (FK fields render as dropdowns in that view).

---

## Interaction between Rule CDS scope and existing `scopeCdsIds` (steward scope)

The existing "My data only" toggle in the Rules Explorer filters the *allocation tree* by the steward's assigned CDS IDs (which CDEs and CDSs appear in the hierarchy under each rule). The new CDS scope filter filters *which rules* appear in the list at all. These are independent filters that compose naturally — a steward can show "rules scoped to HMCTS + Generic, within my data only".

---

## Files touched

| File | Change |
|------|--------|
| `10_constants.js` | Add `critical_data_set_id` FK column to `data_quality_rule` schema |
| `166_form_panel_rule.js` | Add CDS Scope dropdown to rule add/edit form |
| `180_screen_generator.js` | Replace prefix-based generic detection; pre-fill CDS scope on rule creation |
| `145_view_rules.js` | Add CDS scope filter dropdown + CDS badge on rule rows |

No new files. No new tables. No changes to `240_app.js`.
