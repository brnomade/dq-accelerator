# DESIGN: Color Theme Revision V2 — "Dark but Readable"

**Date:** 2026-06-19  
**Author:** Andre Ballista / Claude Code  
**Status:** Awaiting approval

---

## 1. Problem Statement

User feedback consistently reports that the current dark theme is "too dark to read." The specific
complaint is legibility — primary content text blends into the background and secondary labels are
barely visible. The UI looks polished but sacrifices readability for aesthetics.

---

## 2. Reference Analysis — AWS Athena Dark Mode

The reference image (`example_color_scheme.png`) shows Amazon Athena's dark mode. Key
characteristics that make it readable despite being dark:

| Characteristic | AWS Athena | Current Scheme |
|----------------|-----------|----------------|
| Primary text brightness | Near-white (~`#f0f4f8`) | Muted lavender (`#d4daf0`) |
| Secondary text | Medium blue-grey (~`#c8d4e4`) | Dim blue-grey (`#8492b4`) |
| Muted/label text | Visible dim grey (~`#879596`) | Very dim (`#4e5e80`) |
| Accent colour | Bright teal-cyan (`~#00a8c5`) | Mid blue (`#4f8ef7`) |
| Background differentiation | Well-separated dark navy layers | Similar dark layers, low contrast |
| Border visibility | Clearly visible separators | Subtle separators |

**Root cause of the readability problem:** `--text` at `#d4daf0` has a contrast ratio of ~5:1
against `--bg2` (`#161b27`). WCAG AA requires 4.5:1, so it technically passes — but users
perceive it as dim because the colour has a blue-lavender tint that blends into the background
rather than popping off it. The AWS reference achieves contrast ratios of 8:1+ for primary text
by using near-white with no saturation.

The AWS theme also uses a **teal-cyan accent** rather than blue. Teal has stronger visual contrast
against a dark navy background because it occupies a completely different hue range, making active
items and interactive elements "pop" more clearly.

---

## 3. Proposed Colour Palette

### 3a. CSS Variable Changes (`src/00_styles.css` `:root`)

| Variable | Current Value | Proposed Value | Change Rationale |
|----------|--------------|----------------|-----------------|
| `--bg` | `#0f1117` | `#0d1117` | Minimal — slightly deeper base |
| `--bg2` | `#161b27` | `#18212e` | Cooler, slightly more teal-navy |
| `--bg3` | `#1e2535` | `#1e2d40` | More distinct elevated surface |
| `--bg4` | `#232d42` | `#263550` | More distinct active state |
| `--border` | `#2a3348` | `#2d4060` | **Key**: more visible separators |
| `--border2` | `#3a4a66` | `#3e5575` | More visible hover/focus borders |
| `--text` | `#d4daf0` | `#edf0fa` | **Critical fix**: near-white, high contrast |
| `--text2` | `#8492b4` | `#9aaecc` | Noticeably more readable secondary text |
| `--text3` | `#4e5e80` | `#5f7294` | Visible muted text for labels/metadata |
| `--accent` | `#4f8ef7` | `#18b4d4` | Teal (matches AWS ref, pops on dark navy) |
| `--accent2` | `#2563c4` | `#0e8cac` | Darker teal for button borders/hover |

**Unchanged variables** (already well-calibrated):

| Variable | Value | Reason |
|----------|-------|--------|
| `--green` | `#22c98e` | Matches reference exactly |
| `--green-bg` | `#0d2e22` | Unchanged |
| `--amber` | `#f5a623` | Close to AWS orange; unchanged |
| `--amber-bg` | `#2a1f0a` | Unchanged |
| `--red` | `#f25f5c` | Unchanged |
| `--red-bg` | `#2e1010` | Unchanged |

### 3b. Hardcoded Hex Values in CSS

Four hardcoded values in `00_styles.css` also need updating:

| Location | Current | Proposed | Context |
|----------|---------|----------|---------|
| Line 249 `.btn-primary:hover` | `#6ba3fa` | `#3ecde8` | Button hover state (blue → teal) |
| Line 305 `.upload-zone:hover` | `#0f1a2e` | `#0d1e30` | Upload zone hover background |
| Line 316 `.issue-item` border | `#4a3010` | unchanged | Amber-themed; fine as-is |
| Line 320 `.issue-badge` bg | `#5a3a10` | unchanged | Amber-themed; fine as-is |
| Line 334 `.badge-blue` bg | `#0f2040` | `#0d2035` | Badge background (dark teal-blue) |

### 3c. Hardcoded Hex Values in JS Files

The accent colour `#4f8ef7` is hardcoded as inline styles in several JS files. All must be updated
to `#18b4d4` (new teal accent):

| File | Line | Usage |
|------|------|-------|
| `10_constants.js` | 296 | Group accent colour in TABLE_GROUPS |
| `10_constants.js` | 321 | Muted group colour → update to `#5f7294` |
| `100_view_weights_org.js` | 275 | Chart/org accent variable |
| `145_view_rules.js` | 478 | Rules view accent variable |
| `161_view_generic.js` | 291 | Inline style on active field highlight + rgba background |
| `163_form_panel_data_owner.js` | 7 | Panel accent variable |
| `170_screen_simulator.js` | 183 | Simulator accent variable |
| `240_app.js` | 36 | Inline span colour |
| `70_header_footer.js` | 91 | Header accent variable |
| `70_header_footer.js` | 250 | Conditional span colour |
| `71_master_version.js` | 345 | SVG `fill` for "Cognizant" text → update to `#5f7294` |

The `rgba(79,142,247,0.12)` in `161_view_generic.js:291` must also change to
`rgba(24,180,212,0.12)` (teal equivalent at 12% opacity).

---

## 4. Visual Impact Summary

### What changes visually:

1. **All body text becomes noticeably brighter** — table rows, record lists, form labels, sidebar
   items — immediately more readable without any perception of "washed out."

2. **All interactive/accent elements shift from blue to teal** — active nav items, tab indicators,
   primary buttons, links, active field highlights, chart accents. The teal reads strongly on dark
   navy and is the dominant characteristic of the AWS reference.

3. **Borders and separators become more visible** — users can distinguish layout sections without
   squinting.

4. **Secondary text gains clarity** — metadata, type badges, timestamps, and sub-labels become
   readable instead of barely-there.

5. **Background layer separation improves slightly** — the four bg layers (`--bg` through `--bg4`)
   become slightly more distinguishable, improving depth perception.

### What does NOT change:

- Status colours (green, amber, red) — already correct
- Fonts and typography
- Spacing and layout
- Purple graph colour (`#7c5cbf`) used in org charts — unchanged
- All semantic colour-token usages in CSS that reference `var(--*)` — automatically inherit new
  values without any extra changes

---

## 5. Scope Estimate

- **Files to edit:** 12 (1 CSS + 11 JS)
- **Lines to change:** ~25–30
- **Risk:** Low. Changes are pure presentational. No logic or data flow is affected.
- **Reversibility:** Fully reversible via git.

---

## 6. Open Questions for User Review

1. **Accent colour change (blue → teal):** This is the most visible shift. The AWS reference uses
   teal throughout. Do you want to keep it, or would you prefer to keep the blue accent and only
   fix text brightness?

2. **`--text` brightness level:** Proposed `#edf0fa` is near-white with a faint cool tint. If you
   want full white, we can use `#f0f3fa` or `#ffffff`. If you prefer something slightly softer,
   `#e4e8f5` is the midpoint.

3. **`--text2` and `--text3`:** Secondary and muted text are brightened moderately. This is a
   conservative change. Feedback welcome.
