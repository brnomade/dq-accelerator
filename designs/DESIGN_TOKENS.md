# DESIGN: Design Token Centralisation

**Date:** 2026-06-19  
**Author:** Andre Ballista / Claude Code  
**Status:** Phase 1 approved for implementation

---

## 1. Problem Statement

When the colour scheme was updated (see `DESIGN_COLORTHEME_V2.md`), changes were required in
12 files — 1 CSS file and 11 JS files. The JS files all held hardcoded hex strings duplicated
from the CSS variable definitions. This means the CSS `:root` block and the scattered JS inline
styles are two independent sources of truth for the same design tokens, and they inevitably drift.

The same problem applies to font-family strings (`"'IBM Plex Mono', monospace"` repeated 241
times across 27 files) and font-size integers (667 occurrences across 28 files).

---

## 2. Analysis

### 2a. Why did hardcoded values accumulate?

The project has no module system. There are no `import`/`export` statements. All source files are
concatenated by the build script into a single Babel `<script>` block. This means:

- CSS custom properties (`:root` vars) are available to all CSS rules automatically.
- JS inline styles, however, are plain JS objects — they are not CSS rules and do not
  automatically inherit CSS custom properties by name.
- The natural (but wrong) solution was to copy the hex value from the CSS into the JS.

### 2b. Can `var(--...)` be used in JS inline styles?

Yes, fully. Modern browsers resolve CSS custom properties in inline `style` attributes:

```jsx
<div style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }} />
```

This is equivalent to writing `color: var(--accent)` in a CSS rule. The browser resolves the
variable at paint time, so the token definition in `:root` is the single source of truth.

### 2c. What about rgba() values?

Initial analysis suggested rgba values (e.g. `rgba(24,180,212,0.12)`) required special JS
helper functions because CSS variables cannot carry an alpha component. This was wrong.

An rgba value at a **fixed predefined opacity** is simply another named colour token. It can be
defined once in `:root` and referenced like any other variable:

```css
--accent-tint: rgba(24,180,212,0.12);
--accent-border: rgba(24,180,212,0.4);
```

```jsx
<span style={{ background: 'var(--accent-tint)', border: '1px solid var(--accent-border)' }} />
```

A JS helper function would only be necessary if the opacity were computed at runtime from data
(e.g. a chart where opacity encodes a value). That pattern does not exist in this codebase.

### 2d. What about colours not in the current `:root`?

Some colours appear in JS but are absent from the CSS variable palette:

| Value | Where used | Proposed token |
|-------|-----------|----------------|
| `#7c5cbf` | Org chart, CDE criticality physical accent | `--purple` |
| `rgba(24,180,212,0.12)` | "YOU" badge background | `--accent-tint` |
| `rgba(24,180,212,0.4)` | "YOU" badge border | `--accent-border` |
| `#fff` / `#ffffff` | Toggle thumb, button text | keep as-is (universal white) |

The purple colour was initially placed in the proposed JS THEME object as a "special case". This
was incorrect — there is no reason it cannot live in `:root` alongside all other palette colours.

### 2e. Why not centralise font-sizes too?

Font-sizes (667 occurrences) follow the same argument and could be centralised as CSS vars
(`--fxs: 10px`, `--fsm: 11px`, `--fbase: 13px`, `--fmd: 15px`, `--flg: 20px`). However:

- Font-sizes change far less frequently than colours. This week's theme work proved colours are
  the active maintenance pain point.
- 667 mechanical substitutions across 28 files is a large refactor for a moderate gain.
- Phase 2 is reserved for font-sizes if and when the team needs a global type-scale change.

---

## 3. Proposed Solution

### Single source of truth: `00_styles.css` `:root`

Every design token — colours, rgba tints, font-families — lives in the `:root` block. Nothing
is defined twice. JS inline styles reference tokens by name using `'var(--...)'` strings.

No separate JS theme file is needed.

### Findings from implementation scan

Before implementing, all JS files were scanned for unique hardcoded values. Key findings:

**Font families:** Already use CSS vars (`var(--mono)`, `var(--sans)`) throughout the codebase.
One exception: an SVG `<text>` attribute in `71_master_version.js`. SVG presentation attributes
cannot use CSS custom properties in the same way as React inline styles, so this stays as-is.

**rgba values at multiple opacities:** The amber, green, red, and purple chart colours are used
at many different opacity levels (e.g. amber at 0.04, 0.08, 0.10, 0.12, 0.15, 0.3, 0.35, 0.4,
0.5 across various components). Defining a CSS var for every combination would produce a bloated
palette with no readability benefit. These remain as hardcoded `rgba(...)` inline.

**Old blue accent still in 3 files:** The colour theme update (DESIGN_COLORTHEME_V2.md) missed
`rgba(79,142,247,...)` occurrences in `210_screen_import.js`, `230_screen_export.js`, and
`250_screen_assistant.js`. These use the old blue `#4f8ef7` as the rgba base and must be updated
to teal `rgba(24,180,212,...)`. Since they appear at multiple opacities, they stay as rgba().

**`#e05252` — vivid red:** A slightly different red (`rgb(224,82,82)`) from `--red: #f25f5c`
(`rgb(242,95,92)`). Used consistently in data-viz traffic lights (simulator RAG status, coverage
bars) alongside `rgba(224,82,82,...)` tints. Added as `--red-vivid` to preserve the intentional
distinction from the UI alert red.

**SQL syntax colours** (`#a06af9` purple, `#5b9cf6` blue in `200_screen_ddl.js`): These are
deliberate code-editor syntax highlighting colours, not palette colours. Left as-is.

### New tokens to add to `:root`

```css
/* Extended palette */
--purple:        #7c5cbf;
--red-vivid:     #e05252;
--overlay-sm:    rgba(0,0,0,0.25);
--overlay-md:    rgba(0,0,0,0.30);
--accent-tint:   rgba(24,180,212,0.12);
--accent-border: rgba(24,180,212,0.40);
```

### Substitution rules for JS inline styles

| Old pattern | New pattern |
|------------|-------------|
| `'#18b4d4'` | `'var(--accent)'` |
| `'#0e8cac'` | `'var(--accent2)'` |
| `'#22c98e'` | `'var(--green)'` |
| `'#0d2e22'` | `'var(--green-bg)'` |
| `'#f5a623'` | `'var(--amber)'` |
| `'#2a1f0a'` | `'var(--amber-bg)'` |
| `'#f25f5c'` | `'var(--red)'` |
| `'#2e1010'` | `'var(--red-bg)'` |
| `'#edf0fa'` | `'var(--text)'` |
| `'#9aaecc'` | `'var(--text2)'` |
| `'#5f7294'` | `'var(--text3)'` |
| `'#0d1117'` | `'var(--bg)'` |
| `'#18212e'` | `'var(--bg2)'` |
| `'#1e2d40'` | `'var(--bg3)'` |
| `'#263550'` | `'var(--bg4)'` |
| `'#2d4060'` | `'var(--border)'` |
| `'#3e5575'` | `'var(--border2)'` |
| `'#7c5cbf'` | `'var(--purple)'` |
| `rgba(24,180,212,0.12)` | `'var(--accent-tint)'` |
| `rgba(24,180,212,0.4...)` | `'var(--accent-border)'` |
| `"'IBM Plex Mono', monospace"` | `'var(--mono)'` |
| `"'IBM Plex Sans', sans-serif"` | `'var(--sans)'` |
| `"IBM Plex Mono"` (short form) | `'var(--mono)'` |
| `"IBM Plex Sans"` (short form) | `'var(--sans)'` |

---

## 4. Phases

### Phase 1 — Colours and fonts (this document)

- Extend `:root` with missing palette tokens
- Replace all hardcoded hex colours in JS inline styles with `var(--...)` references
- Replace all hardcoded rgba values in JS inline styles with `var(--...)` references
- Replace all hardcoded font-family strings in JS inline styles with `var(--mono)` / `var(--sans)`
- **Scope:** ~28 JS files, ~440 substitutions, 0 logic changes

### Phase 2 — Font sizes (future, if needed)

- Add font-size scale vars to `:root` (`--fxs` through `--flg`)
- Replace all hardcoded `fontSize: N` values in JS inline styles
- **Scope:** ~28 JS files, ~667 substitutions

---

## 5. Risk Assessment

**Risk: Low.**

- All changes are purely presentational. No component logic, state, or data flow is affected.
- CSS variable resolution happens at paint time in the browser — identical visual output.
- Fully reversible via git.
- Build script validates no non-ASCII characters; CSS var strings are all ASCII.
