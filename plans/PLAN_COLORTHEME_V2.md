# PLAN: Color Theme Revision V2 — Implementation

**Date:** 2026-06-19  
**Design:** `designs/DESIGN_COLORTHEME_V2.md`  
**Status:** Awaiting approval

---

## Prerequisites

- User has reviewed and approved `DESIGN_COLORTHEME_V2.md`
- Git working tree is clean (or changes are stashed)

---

## Step 1 — Update CSS Variables (`:root` block)

**File:** `src/00_styles.css` (lines 1–27)

Replace the entire `:root` block with the new palette:

```css
:root {
  --bg:        #0d1117;
  --bg2:       #18212e;
  --bg3:       #1e2d40;
  --bg4:       #263550;
  --border:    #2d4060;
  --border2:   #3e5575;
  --text:      #edf0fa;
  --text2:     #9aaecc;
  --text3:     #5f7294;
  --accent:    #18b4d4;
  --accent2:   #0e8cac;
  --green:     #22c98e;
  --green-bg:  #0d2e22;
  --amber:     #f5a623;
  --amber-bg:  #2a1f0a;
  --red:       #f25f5c;
  --red-bg:    #2e1010;
  --mono:      'IBM Plex Mono', monospace;
  --sans:      'IBM Plex Sans', sans-serif;
  --radius:    6px;
  --radius-lg: 10px;
  --header-h:  52px;
  --footer-h:  32px;
  --sidebar-w: 220px;
  --sidebar-collapsed: 48px;
}
```

---

## Step 2 — Fix Hardcoded Hex Values in CSS

**File:** `src/00_styles.css`

| Line | Old value | New value |
|------|-----------|-----------|
| 249 (`.btn-primary:hover`) | `#6ba3fa` | `#3ecde8` |
| 305 (`.upload-zone:hover` bg) | `#0f1a2e` | `#0d1e30` |
| 334 (`.badge-blue` bg) | `#0f2040` | `#0d2035` |

---

## Step 3 — Fix Hardcoded Accent in JS Files

New accent value: `#18b4d4`  
New rgba equivalent: `rgba(24,180,212,0.12)`

### 3a. `src/10_constants.js`

- Line 296: `'#4f8ef7'` → `'#18b4d4'`  
- Line 321: `'#4e5e80'` → `'#5f7294'`

### 3b. `src/100_view_weights_org.js`

- Line 275: `const accent = '#4f8ef7'` → `const accent = '#18b4d4'`

### 3c. `src/145_view_rules.js`

- Line 478: `const accent = '#4f8ef7'` → `const accent = '#18b4d4'`

### 3d. `src/161_view_generic.js`

- Line 291: `color:'#4f8ef7'` → `color:'#18b4d4'`
- Line 291: `background:'rgba(79,142,247,0.12)'` → `background:'rgba(24,180,212,0.12)'`

### 3e. `src/163_form_panel_data_owner.js`

- Line 7: `const accent = '#4f8ef7'` → `const accent = '#18b4d4'`

### 3f. `src/170_screen_simulator.js`

- Line 183: `const accent = '#4f8ef7'` → `const accent = '#18b4d4'`

### 3g. `src/240_app.js`

- Line 36: `color:'#4f8ef7'` → `color:'#18b4d4'`

### 3h. `src/70_header_footer.js`

- Line 91: `const accent = '#4f8ef7'` → `const accent = '#18b4d4'`
- Line 250: `'#4f8ef7'` → `'#18b4d4'` (conditional span colour)

### 3i. `src/71_master_version.js`

- Line 345: `fill="#4e5e80"` → `fill="#5f7294"` (SVG text fill)

---

## Step 4 — Build and Verify

```bash
cd build
python build.py
```

Open `dist/dq-accelerator.html` in browser. Verify:

- [ ] Primary body text is clearly readable against all backgrounds
- [ ] Sidebar navigation text is legible (including inactive items)
- [ ] Active nav item uses teal accent (not blue)
- [ ] Primary buttons are teal (Run, Save, etc.)
- [ ] Tab active indicator is teal
- [ ] Table record rows show bright readable text
- [ ] Form field labels are visible
- [ ] Metadata/type badges (`--text3`) are legible
- [ ] Status rows (green/amber/red) unchanged in appearance
- [ ] Dashboard cards look correct
- [ ] Org hierarchy view still renders with correct colours
- [ ] Rules view accent is teal
- [ ] Import/upload zone hover state looks correct

---

## Step 5 — Update KNOWN_ISSUES.md

Remove any open issue entries related to text readability/contrast, marking them resolved.

---

## Estimated Effort

| Step | Files | Estimated time |
|------|-------|----------------|
| Step 1–2 (CSS) | 1 | 5 min |
| Step 3 (JS) | 10 | 10 min |
| Step 4 (Build + browser check) | — | 10 min |
| Step 5 (KNOWN_ISSUES) | 1 | 2 min |
| **Total** | 12 | **~27 min** |
