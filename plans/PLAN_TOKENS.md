# PLAN: Design Token Centralisation — Phase 1 Implementation

**Date:** 2026-06-19  
**Design:** `designs/DESIGN_TOKENS.md`  
**Status:** Approved — Phase 1

---

## Step 1 — Extend `:root` in `src/00_styles.css`

Add the following tokens to the existing `:root` block:

```css
--purple:        #7c5cbf;
--accent-tint:   rgba(24,180,212,0.12);
--accent-border: rgba(24,180,212,0.40);
--green-tint:    rgba(34,201,142,0.12);
--amber-tint:    rgba(245,166,35,0.12);
--red-tint:      rgba(242,95,92,0.12);
```

Plus any additional rgba tokens discovered during the scan in Step 2.

---

## Step 2 — Scan all JS files for unique hardcoded values

Before editing, grep every JS file to catalogue all unique colour and font-family literals.
Map each one to its CSS var equivalent (or flag as needing a new `:root` token).

---

## Step 3 — Substitute per file

Work through each JS file systematically, replacing hardcoded values with `var(--...)` strings.
Each substitution is verified against the mapping table in the design document.

Files to touch (all files containing hardcoded colour or font-family values):
- `src/70_header_footer.js`
- `src/71_master_version.js`
- `src/80_sidebar.js`
- `src/90_panels.js`
- `src/100_view_weights_org.js`
- `src/120_view_cde_criticality.js`
- `src/130_view_rule_allocation.js`
- `src/140_view_cde.js`
- `src/141_view_cde_list.js`
- `src/145_view_rules.js`
- `src/150_view_cds_dir.js`
- `src/151_view_directorate.js`
- `src/160_record_form_panel.js`
- `src/161_view_generic.js`
- `src/162_form_panel_cds.js`
- `src/163_form_panel_data_owner.js`
- `src/164_form_panel_stewardship.js`
- `src/165_form_panel_weights.js`
- `src/166_form_panel_rule.js`
- `src/170_screen_simulator.js`
- `src/180_screen_generator.js`
- `src/190_screen_coverage.js`
- `src/200_screen_ddl.js`
- `src/201_ddl_form_panel.js`
- `src/210_screen_import.js`
- `src/220_screen_dashboard.js`
- `src/230_screen_export.js`
- `src/240_app.js`
- `src/250_screen_assistant.js`
- `src/10_constants.js`

---

## Step 4 — Build

```bash
cd build && python build.py
```

Verify: Build OK, no non-ASCII errors.

---

## Step 5 — Browser verification

Open `dist/dq-accelerator.html`. Spot-check:
- [ ] All screens render correctly (no missing colours)
- [ ] Org chart purple colour renders
- [ ] "YOU" badge teal tint renders
- [ ] Green / amber / red status rows unchanged
- [ ] Font families render correctly (mono and sans)

---

## Step 6 — Confirm no remaining hardcoded palette values in JS

Run a final grep for the old hex values to confirm all substitutions were made.
