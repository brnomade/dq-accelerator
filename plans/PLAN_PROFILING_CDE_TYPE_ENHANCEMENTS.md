# PLAN — Profiling Page Enhancements: CDE Completion Indicator & Logical Type Column

**Date:** 2026-06-29  
**Design:** `designs/DESIGN_PROFILING_CDE_TYPE_ENHANCEMENTS.md`  
**File touched:** `src/200_screen_ddl.js` only  
**Build required:** yes

---

## Steps

### Step 1 — Enhancement B: Update grid templates

**In `FieldRow` (~line 519):**  
Change `gridTemplateColumns` from `22px 60px 1fr 60px 44px repeat(${dimCount}, 38px) 96px` to `22px 60px 1fr 60px 60px 44px repeat(${dimCount}, 38px) 96px`.

**In `TableGroupRow` column header block (~line 749):**  
Change same grid template string (applied to the header div wrapping colHdrStyle divs).

**In `DimCoverageFooter` (~line 608):**  
Change `gridTemplateColumns` from `1fr 60px repeat(${dimCount}, 38px) 52px 96px` to `1fr 60px 60px repeat(${dimCount}, 38px) 52px 96px`.

### Step 2 — Enhancement B: Update column headers

In the `TableGroupRow` column header block, rename the `Type` header to `Phys Type` and add a new `Log Type` header immediately after it (in the new 60px column).

### Step 3 — Enhancement B: Add logical type cell to `FieldRow`

After the physical type cell (`fieldEntry.type`), add a new `<div>` in the 60px logical type column showing:
- `fieldEntry.profiling?.semantic_type` if set — in `var(--purple)`, mono font, 9px
- `—` (em dash) if null/empty — in `var(--text3)`

### Step 4 — Enhancement B: Add blank column to `DimCoverageFooter`

Add a `<div/>` after the existing `<div/>` (currently mapped to the rules column) in the footer to occupy the new logical type column.

### Step 5 — Enhancement A: Compute CDE completion in `TableGroupRow`

Inside `TableGroupRow`, derive:
```js
const cdeFields = fields.filter(f => f.origin === 'CDE' || f.origin === 'CDE+SQL');
const allCdesProfiled = cdeFields.length > 0 && cdeFields.every(f => !!f.profiling);
```

### Step 6 — Enhancement A: Add CDE completion badge to table header

In the `TableGroupRow` header row, after the existing `profiled` badge (which is conditional on `ddl`), add a new `<span>` conditional on `allCdesProfiled`:
- Label: `CDEs ✓`
- Style: pill matching the existing profiled badge but always green
- Title: `"All CDE fields on this table have been profiled"`

### Step 7 — Build and verify

Run `python build.py` from the `build/` directory.  
Open `dist/dq-accelerator.html` and verify:
- Both type columns appear and are correctly labelled
- Logical type cells show purple values for profiled fields with a semantic type, em dash otherwise
- Physical type column still shows DDL types correctly
- CDE completion badge appears on tables where all CDE fields have profiling records
- Badge does not appear on tables with unproifled CDE fields
- Dim coverage footer dots remain visually aligned with the field row dots
- No build errors (non-ASCII check passes)

### Step 8 — Update CHANGELOG.md and SESSION_METRICS.md

---

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Grid misalignment (footer dots don't line up) | Low | Template strings are changed in all 3 places atomically |
| Non-ASCII char in JS | None | Using `✓` and `—` escape sequences throughout |
| Logical type shows stale data | None | Reads live from `fieldEntry.profiling` which is rebuilt from store on every render |

## Estimated effort

~30 minutes coding + build + verify.
