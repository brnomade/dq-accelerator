# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**dq-accelerator** is a browser-only single-page application (SPA) for managing Data Quality metadata for the Ministry of Justice (MOJ). It has no backend, no npm, no node_modules — everything runs from a single bundled HTML file (`dist/dq-accelerator.html`) using CDN-loaded dependencies compiled by Babel at runtime.

## Build

```bash
cd build
python build.py
```

Output: `dist/dq-accelerator.html` (~500KB, self-contained). Open directly in a browser via `file://` or HTTP — no server required.

The build script (`build/build.py`):
1. Reads `build/template.html`
2. Concatenates all `src/*.css` and `src/*.js` files **in numeric filename order** (00–240)
3. Injects a React destructuring shim so JSX components can use `const { useState } = React`
4. Validates no non-ASCII characters in JS (CDN Babel limitation)
5. Writes the final bundle to `dist/dq-accelerator.html`

**There are no tests, no linter config, and no package.json.** Manual browser testing is the only validation mechanism.

## Source File Naming Convention

Files are prefixed `NN_name.js` to control concatenation order. The numbering zones are:

| Range | Purpose |
|-------|---------|
| `00_styles.css` | Master stylesheet |
| `10_constants.js` | SCHEMA, SHEET_MAP, TABLE_GROUPS |
| `20–40` | Data utils, export utils, localStorage |
| `50–90` | Context, icons, header/footer, sidebar, panels |
| `100–160` | Table/record views (generic + specialized) |
| `170–210` | Advanced screens (simulator, generator, coverage, DDL, import) |
| `220–230` | Dashboard + export screens |
| `240_app.js` | Root `App` component + routing |

When adding a new file, pick a number that places it after its dependencies.

## Implementing explicit specifications

When the user states a specific rule, algorithm, or filtering condition, implement it **literally and exactly** — do not add extra logic, intermediate lookups, or generalisations that were not requested.

If you identify an edge case or a reason the literal spec might not cover all scenarios, **state it explicitly before writing any code** and ask for clarification. Do not silently substitute your own interpretation and proceed.

Example of what NOT to do: user says "show rules named Generic - ... always, and rules named CDS_NAME - ... only when that CDS is selected". Do not add a lookup against all known CDS names to decide what counts as a CDS prefix — that is an assumption beyond the spec. Implement exactly what was described and flag any gaps first.

## Documentation

Designs are stored in the designs folder. 
Tasks or implementation plans are stored in the plans folder.
For all major implementation activities, a design and implementation plan needs to be produced, stored and presented to the user. No implementation shall start without the review of such documents and explicit approval by the user.
Issues are stored in the issues file called KNOWN_ISSUES.md

User documentation is stored in `documentation/user-guide/`. It consists of static HTML pages: an `index.html` main table of contents organised by topic, and individual "How to..." guide pages. Guides are text-only (no screenshots), written in direct step-focused language. Documentation grows alongside features — there is no separate retroactive documentation pass.

## Mandatory end-of-task steps

These four steps are required after every task. Triggers differ per step — read each one carefully.

1. **Update APP_TREE.md** — triggered by structural changes, not every build. Update immediately after any task that: creates, deletes, or renames a source file; adds, removes, or relabels a sidebar item; introduces or rewires a form panel; renames a component; or changes a route string. Move retired files to the Legacy section rather than deleting them. APP_TREE.md is the navigation map used at the start of every subsequent task — keep it accurate so the next session starts with correct file locations.

2. **Update CHANGELOG.md and SESSION_METRICS.md before running the build** — the build script bundles `CHANGELOG.md` and `KNOWN_ISSUES.md` into the release zip at build time, so any entries added after the build are absent from the zip. The correct sequence is:
   - Pre-generate the build ID by running: `python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"`
   - Write the CHANGELOG.md and SESSION_METRICS.md entries using that ID.
   - Run `python build.py` immediately (within the same minute so the ID matches).
   - The zip will now contain the up-to-date changelog.

3. **Update user documentation** — after every build that introduces a user-facing change (new screen, new feature, changed workflow, renamed label, new field), create or update the relevant guide page(s) in `documentation/user-guide/` **before** running the build so the updated guides are included in the zip. Each guide is an individual HTML page covering one task (e.g. "How to add a Data Owner"). Keep the `index.html` table of contents in sync whenever pages are added or removed. Guides are text-only — no screenshots, no placeholder image blocks. Do not update documentation for internal refactors or bug fixes that have no user-visible effect.

## Architecture

### State Management

`50_context.js` defines `AppContext`. `240_app.js` is the root — it owns all state and wraps the tree in `<AppContext.Provider>`. Every component accesses state via `useApp()`.

Key state shape:
```js
{ data, lookups, savedAt, hasData }
```

- `data` — object keyed by table name (`critical_data_set`, `data_quality_rule`, etc.)
- `lookups` — pre-computed FK resolution maps (id → display value)
- `savedAt` — ISO timestamp of last localStorage save
- `hasData` — boolean, false until first import or load

### Schema-Driven Design

`10_constants.js` exports `SCHEMA` — the single source of truth for all 18 tables. Each table entry defines:
- `pk` — primary key field
- `cols` — array of `{ name, type, label, fk? }` (types: `int`, `str`, `float`, `bool`, `datetime`, `text`)
- `readOnly` — true for reference/lookup tables
- `label` — display name

The generic view (`161_view_generic.js`) renders any table from SCHEMA with no per-table code. Specialized views (`110_view_rules.js`, `120_view_cde_criticality.js`, etc.) extend this for complex interactions.

### The 18 Tables

**Editable** (green `#22c98e`): `critical_data_set`, `critical_data_element`, `data_quality_rule`, `data_quality_rule_allocation`, `cde_criticality`, `stewardship`, `executive_agency`, `directorate`, `data_patron`, `data_owner`, `data_steward`, `criticality_group_weight`, `quality_dimension_weight`

**Read-only** (grey `#4e5e80`): `executive_agency_type`, `steward_role_type`, `quality_dimension`, `criticality_group`, `criticality_level`

### localStorage Keys

| Key | Content |
|-----|---------|
| `moj_dq_store_v1` | Full data state + savedAt timestamp |
| `moj_dq_client_logo_v1` | Base64 client logo |
| `moj_dq_sidebar_v1` | Sidebar collapsed state |
| `moj_dq_groups_v1` | Per-group nav collapsed state |

### Routing

`240_app.js` owns the active screen string. The sidebar (`80_sidebar.js`) sets it via context. Screens are rendered by a switch in the App render function — no URL routing library.

### CDN Dependencies (loaded in template.html)

- React 18.2.0 + ReactDOM 18.2.0
- Babel standalone 7.23.2 (JSX compiled in-browser — no build transpiler)
- SheetJS (xlsx) 0.18.5 — Excel import
- JSZip 3.10.1 — ZIP export
- IBM Plex Sans/Mono via Google Fonts

## Key Constraints

- **No non-ASCII characters in JS files** — Babel CDN will fail to parse them. Use `\uXXXX` escape sequences inside JS string literals, or `String.fromCharCode(N)` for runtime values.
- **`\uXXXX` escapes do NOT work in JSX text nodes** — they are only interpreted inside JS string literals. Raw JSX text such as `No conflicts — all` renders the literal string `—` in the browser. Wrap in a JS expression: `No conflicts {'—'} all`. This applies to every special character (em dash, arrow, bullet, checkmark, etc.) that appears directly between JSX tags.
- **Non-ASCII incident protocol** — At the first sign of a non-ASCII problem (build failure, literal `\uXXXX` rendered in the browser, or detected during code review): **stop all other work immediately**, grep the affected file(s) for all offending occurrences, present the complete list to the user, and ask: "Please fix these manually, or confirm you want me to continue and I will fix them." Do not attempt automated Python/shell scripts to fix the file — they fail due to Windows encoding issues. Wait for the user's response before resuming.
- **Load order matters** — a file can only call functions/components defined in lower-numbered files.
- **No module system** — there are no `import`/`export` statements. All names are globals within the Babel `<script type="text/babel">` block. The build script injects `const { useState, useEffect, useContext, useRef, useCallback, useMemo, createContext } = React;` so these hooks are available everywhere.
- **5–10 MB localStorage limit** — current datasets are well within this, but large Excel imports could approach it.
