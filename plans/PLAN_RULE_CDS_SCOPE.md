# PLAN — Rule CDS Scope

**Design:** `designs/DESIGN_RULE_CDS_SCOPE.md`
**Status:** Draft — awaiting user approval before implementation

---

## Steps

### Step 1 — Schema: add `critical_data_set_id` to `data_quality_rule` (`10_constants.js`)

Insert after the `automated` column entry, before `retiring_timestamp`:

```js
{ name: 'critical_data_set_id', type: 'int', label: 'CDS Scope',
  optional: true,
  fk: { table: 'critical_data_set', field: 'critical_data_set_id', display: 'data_set_name' } },
```

**Verify:** open the generic `data_quality_rule` table view — the column should appear with a CDS dropdown in the form. Existing rows show blank (null).

---

### Step 2 — Rule form panel: add CDS Scope field (`166_form_panel_rule.js`)

Add a CDS Scope dropdown below the rule name field:

- Build options list from `data.critical_data_set`, filtered to non-retired records, sorted by `data_set_name`
- First option: value `''` / null, label `— Generic (applies to all CDS) —`
- Bind to `values.critical_data_set_id` (null when blank option selected)
- Show a muted hint below: `"Leave blank to make this rule available in all CDS contexts"`
- Works in both Add (new record) and Edit modes

**Verify:** open Add Rule — dropdown present. Select a CDS, save, re-open — selection persists. Select blank, save — field is null.

---

### Step 3 — Rule Generator: fix generic detection + pre-fill scope (`180_screen_generator.js`)

**a.** Find `genericRulesCtx` (line ~229–233). Replace:
```js
r.rule_name.startsWith('Generic - ')
```
with:
```js
r.critical_data_set_id == null
```

**b.** Find `handleAddRule` (the function that creates a rule record from a Step 3 proposal card). Add `critical_data_set_id: filterCdsId ?? null` to the new rule record object.

**Verify:** with a CDS selected in Step 1 of the generator, create a rule from Step 3 — inspect the saved rule record and confirm `critical_data_set_id` is set to the selected CDS. With no CDS selected, confirm it is null.

---

### Step 4 — Rules Explorer: CDS scope filter + badge (`145_view_rules.js`)

**a. Toolbar filter dropdown**

Add state: `const [scopeRuleCdsId, setScopeRuleCdsId] = useState('all');`

Build dropdown options:
- `'all'` → "All rules"
- `'generic'` → "Generic only"
- One entry per active CDS (value = `critical_data_set_id`, label = `data_set_name + " + Generic"`)

Render dropdown in the toolbar row alongside the search input.

**b. Filter application in `buildRuleHierarchy`**

Add a `ruleCdsScopeFilter` parameter to `buildRuleHierarchy`. Apply it in the `visibleRules` computation:

```js
const visibleRules = (showRetired ? rules : rules.filter(r => !r.retiring_timestamp))
  .filter(r => {
    if (!ruleCdsScopeFilter || ruleCdsScopeFilter === 'all') return true;
    if (ruleCdsScopeFilter === 'generic') return r.critical_data_set_id == null;
    return r.critical_data_set_id == null || r.critical_data_set_id === ruleCdsScopeFilter;
  });
```

Pass `scopeRuleCdsId` as `ruleCdsScopeFilter` from `RuleExplorerView`.

**c. CDS scope badge on rule rows**

In `RulesRuleRow` (or wherever the rule name header is rendered), add a badge after the rule name:
- `critical_data_set_id == null` → pill: `Generic`, style: muted grey (`var(--text3)` border/text)
- Otherwise → pill: CDS name (look up from `cdsById`), style: green accent (`var(--green)`)

**Verify:**
- "All rules" shows everything (unchanged from current)
- "Generic only" hides CDS-specific rules
- Selecting a CDS shows that CDS's rules plus generic rules
- Badges appear on every rule row

---

### Step 5 — Build and smoke test

```bash
cd build && python build.py
```

Smoke test checklist:
- [ ] Rule form: CDS Scope dropdown present, saves correctly, null saves as null
- [ ] Generic rules (null `critical_data_set_id`) appear in "Generic only" filter and in any "CDS + Generic" filter
- [ ] CDS-specific rules appear only in their CDS filter (and "All rules")
- [ ] Rule badges show "Generic" or CDS name correctly on all rule rows
- [ ] Rule Generator: creating a rule with a CDS selected pre-fills `critical_data_set_id`
- [ ] Rule Generator: generic context list now uses `critical_data_set_id == null` (not prefix)
- [ ] Existing rules (all null) treated as Generic — no regressions in Explorer or Generator

---

### Step 6 — Changelog + Session Metrics

Update `CHANGELOG.md` and `SESSION_METRICS.md` with the build ID.

---

## Risk notes

- Existing rules all have `critical_data_set_id: null` — they are Generic by default. No data loss, no broken views.
- The `GenericTableView` for `data_quality_rule` automatically gains the FK dropdown from the SCHEMA definition — no extra code needed there.
- The Excel import is backward-compatible: files without a `CDS Scope` column will import fine (missing columns default to null).
