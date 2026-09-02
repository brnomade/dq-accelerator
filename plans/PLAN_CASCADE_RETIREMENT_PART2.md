# Plan: Cascading Retirement — Part 2 (null_fk action + remaining call sites)

Pairs with `DESIGN_CASCADE_RETIREMENT_PART2.md`.

## Steps

### Step 1 — Extend `RETIRE_CASCADE` in `src/10_constants.js`

Add `action: 'retire'` or `action: 'null_fk'` to every entry in `RETIRE_CASCADE`.

New mapping:
```
executive_agency → directorate              : null_fk
executive_agency → data_patron              : null_fk
executive_agency → criticality_group_weight : retire
executive_agency → quality_dimension_weight : retire
directorate → critical_data_set             : null_fk
directorate → data_owner                    : null_fk
directorate → shortlist_group               : retire
critical_data_set → critical_data_element   : null_fk
critical_data_set → stewardship             : retire
critical_data_element → cde_criticality     : retire
critical_data_element → data_quality_rule_allocation : retire
critical_data_element → cde_shortlist_tag   : retire
shortlist_group → cde_shortlist_tag         : retire
data_quality_rule → data_quality_rule_allocation : retire
data_steward → stewardship                  : retire
```

---

### Step 2 — Update `collectCascadeRetirements` in `src/240_app.js`

Replace the existing function (lines ~82–96) with the version from the design:
- Return shape: `[{ tbl, pk, action, fk }]`
- Only recurse when `entry.action === 'retire'`
- For `null_fk` entries: push `{ tbl, pk, action: 'null_fk', fk }` with no recursion

---

### Step 3 — Update `retireRecord` in `src/240_app.js`

Replace the existing `retireRecord` useCallback (lines ~153–166) with the version from the design:
- `action === 'retire'` → stamp `retiring_timestamp`
- `action === 'null_fk'` → set `record[fk] = null`, keep record alive

---

### Step 4 — Update `openRetireConfirm` in `src/240_app.js`

Replace the existing `openRetireConfirm` useCallback (lines ~393–400):
- Build `retireSummary` and `nullFkSummary` separately from `toProcess.slice(1)`
- `setRetireConfirm` shape: `{ tableName, pkValue, record, retireSummary, nullFkSummary }`

---

### Step 5 — Update `RetireConfirmPanel` in `src/90_panels.js`

Update the panel component to handle the new state shape:
- If `retireSummary.length > 0`: render existing amber "Will also be retired:" section
- If `nullFkSummary.length > 0`: render new blue "Will be unlinked (FK cleared, records kept):" section
- If both arrays are empty: render "No dependent records." message (unchanged)
- The two sections can both appear simultaneously when a parent has mixed children

---

### Step 6 — Migrate remaining call sites

Work through each file independently. In each case: find the existing `retireRecord(...)` call
on the retire button, replace with `openRetireConfirm(tableName, pkValue)`.

**6a. `src/100_view_weights_org.js`** — 3 calls
- Agency retire button
- Directorate retire button
- Weights row retire button

**6b. `src/120_view_cde_criticality.js`** — 1 call
- Criticality row retire button

**6c. `src/130_view_rule_allocation.js`** — 1 call
- Allocation row retire button

**6d. `src/141_view_cde_list.js`** — 1 call
- Inline allocation retire (the CDE retire was already migrated in Part 1)

**6e. `src/145_view_rules.js`** — 2 calls
- Rule retire button
- Allocation retire button within rule view

**6f. `src/150_view_cds_dir.js`** — 1 call
- CDS row retire button

**6g. `src/151_view_directorate.js`** — 1 call
- Directorate row retire button

**6h. `src/161_view_generic.js`** — 5 calls
- Remove inline `confirmRetire` state and the two-step confirm UI entirely
- Replace all 5 retire button handlers with `openRetireConfirm`

**6i. `src/200_screen_ddl.js`** — 2 calls
- DDL table retire button
- Field profiling retire button

---

### Step 7 — Pre-build admin

1. Pre-generate build ID: `python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"`
2. Update `CHANGELOG.md` with the generated ID
3. Update `SESSION_METRICS.md`
4. Update user documentation: `import-export/export-delta.html` or equivalent if null_fk
   orphaned records have any user-facing implication worth documenting

---

### Step 8 — Build

```bash
cd build && python build.py
```

Verify: no non-ASCII errors, build OK, zip produced.

---

## Testing checklist (manual, in browser)

- [ ] Retire a CDE → `cde_criticality`, `data_quality_rule_allocation`, `cde_shortlist_tag` all retired
- [ ] Retire a CDS → `stewardship` retired; CDEs' `critical_data_set_id` cleared (CDEs remain live)
- [ ] Retire a Directorate → `shortlist_group` retired; CDSes' `directorate_id` cleared; Data Owners' `directorate_id` cleared
- [ ] Retire an Agency → weights retired; Directorates' `executive_agency_id` cleared; Data Patrons' `executive_agency_id` cleared
- [ ] Confirm panel shows amber "retire" section AND blue "unlink" section correctly separated for CDS retire
- [ ] Confirm panel shows amber only for CDE retire (all retire-action children)
- [ ] Confirm panel shows "No dependent records" for records with no cascade children
- [ ] Unlinked records (e.g. CDEs with null CDS FK) remain visible and editable in the CDE list
- [ ] Retire button in `161_view_generic.js` opens confirm panel (not old inline confirm)
- [ ] Retire button in `100_view_weights_org.js`, `145_view_rules.js`, `200_screen_ddl.js` opens confirm panel
- [ ] Delta export after CDS retire: no phantom updates; cleared-FK CDEs appear as `updated` (correct — FK was changed)
