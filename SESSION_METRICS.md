# Session Metrics

Tracks effort per build. One entry per build, most recent first, matching CHANGELOG.md granularity.
Testing time is filled in manually by the user after browser validation.

---

## build-20260717-1631 — Feature: Rule Generator Step 3 mini RAG preview

**Date:** 2026-07-17

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Design + implementation | 15 min | 10 min | 20 min | |
| **Total** | **15 min** | **10 min** | **20 min** | |

### Changes delivered
- `src/180_screen_generator.js`: removed frequency dropdown and bumper stepper from Step 3 cards; added `miniRagState` state + `setMiniRag` helper; added criticality data arrays (`cde_criticality`, `criticality_group`, `criticality_level`, `criticality_group_weight`); added `groupById`, `levelById`, `agencyGroupWeights`, `cdeGreenThresh` computations; replaced removed controls with inline RAG calculator (sample size + failing records inputs, `RagBadge`, threshold legend, fallback message for CDE with no criticality)

---

## build-20260717-1549 — Fix: Rule Generator CDE prefix now includes the actual field name

**Date:** 2026-07-17

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Diagnosis + fix | 5 min | -- | 5 min | |
| **Total** | **5 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/180_screen_generator.js`: `buildSuggestionPrompt` — CDE prefix line now interpolates the actual field name (`CDE ${field} - `); rule_name example updated to show both Generic and CDE forms with the real field name

---

## build-20260717-1539 — Feature: NEW pill on Rule Generator suggestion cards

**Date:** 2026-07-17

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Implementation | 5 min | -- | 5 min | |
| **Total** | **5 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/180_screen_generator.js`: added green NEW pill (`!s.reuse`) to suggestion card header, placed before the existing blue REUSE EXISTING pill

---

## build-20260717-1442 — Feature: CDS context tooltip on Profiling field rows

**Date:** 2026-07-17

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Implementation | 15 min | 10 min | 20 min | |
| **Total** | **15 min** | **10 min** | **20 min** | |

### Changes delivered
- `src/200_screen_ddl.js`: `buildProfilingAgenda` accepts `cdeInfoMap`; builds `cdsInfoList` per field entry from CDE→CDS→Directorate→Agency chain; CDS/Agency tooltip attached to the existing CDE/CDE+SQL origin badge (cursor:help); no new column or grid change
- `documentation/user-guide/profiling/field-profile.html`: step 3 updated to mention the CDS badge
- `documentation/user-guide/profiling/field-cds-context.html`: new guide — how to identify which CDS a field belongs to
- `documentation/user-guide/index.html`: new guide added to Table & Field Profiling section

---

## build-20260716-1934 — Feature: Incomplete Definitions dashboard card is now expandable

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Implementation | -- | -- | 5 min | |
| **Total** | **0 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/220_screen_dashboard.js`: added `cdsById` lookup; Incomplete Definitions card converted to `ExpandableActionCard` with items listing each incomplete CDE by name and CDS

---

## build-20260716-1911 — Feature: Uncovered Dimensions dashboard card is now expandable

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Implementation | -- | -- | 5 min | |
| **Total** | **0 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/220_screen_dashboard.js`: Uncovered Dimensions card converted from plain navigation card to `ExpandableActionCard` — adds `items` array mapping each uncovered dimension to a labelled drillable entry pointing to Rules Explorer

---

## build-20260716-1905 — Feature: Ownership Hierarchy, Weights & Thresholds, Core Settings are Master-only

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Design discussion | 5 min | -- | -- | |
| Implementation | -- | -- | 5 min | |
| **Total** | **5 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/80_sidebar.js`: added `MASTER_ONLY_GROUPS` constant (`ownership`, `weights`, `settings`); `Sidebar` now accepts `isMaster` prop; groups in `MASTER_ONLY_GROUPS` return `null` for non-master users
- `src/240_app.js`: passes `isMaster` prop to `<Sidebar>`

---

## build-20260716-1852 — Fix: My Data filter in Rules Explorer hides unrelated rules

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Diagnosis | 5 min | -- | -- | |
| Implementation | -- | -- | 2 min | |
| **Total** | **5 min** | **0 min** | **2 min** | |

### Changes delivered
- `src/145_view_rules.js`: `hierarchy` useMemo — when `scopeCdsIds` is set (My Data active), filters out rule entries with `allocCount === 0` after the scope filter

---

## build-20260716-1850 — Polish: MANUAL toggle state uses amber styling

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Implementation | -- | -- | 2 min | |
| **Total** | **0 min** | **0 min** | **2 min** | |

### Changes delivered
- `src/145_view_rules.js`: MANUAL button state colour changed from `var(--text3)` / `var(--bg3)` / `var(--border)` to `var(--amber)` / `var(--amber-bg)` / `var(--amber)`

---

## build-20260716-1833 — Bug fix: rule automated flag defaults to true; toggle in Rules Explorer

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Code review | 5 min | -- | -- | |
| Implementation | -- | -- | 10 min | |
| **Total** | **5 min** | **0 min** | **10 min** | |

### Changes delivered
- `src/145_view_rules.js`: `handleAddRule` — `automated` default changed from `false` to `true`
- `src/145_view_rules.js`: `RulesRuleRow` — static AUTOMATED badge replaced with AUTOMATED/MANUAL toggle button; added `onToggleAutomated` prop and `handleToggleAutomated` handler in `RuleExplorerView`

---

## build-20260716-1825 — Bug fix: adding an agency now auto-creates weight rows

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Code review and diagnosis | 10 min | -- | -- | |
| Implementation | -- | -- | 5 min | |
| **Total** | **10 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/240_app.js`: `handleAgencySave` — on Add (new agency), iterates all active `quality_dimension` rows and creates `quality_dimension_weight` rows (weight 1), then iterates all active `criticality_group` rows and creates `criticality_group_weight` rows (weight 1). Added `data` to `useCallback` dependency array.

---

## build-20260716-1816 — Bug fix: CDE criticality fields default to Medium on Add

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Code review and recommendation | 10 min | -- | -- | |
| Implementation | -- | -- | 5 min | |
| **Total** | **10 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/140_view_cde.js`: `critLevels` useState initializer — Add mode now seeds all active criticality groups with the Medium level ID instead of returning `{}`
- `src/120_view_cde_criticality.js`: `levelMap` useState initializer — when `existingRows` is empty/null, seeds all active criticality groups with the Medium level ID

---

## build-20260716-1800 — Bug fix: delta export now includes all 22 SCHEMA tables

**Date:** 2026-07-16

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Bug diagnosis and analysis | 10 min | -- | -- | |
| Implementation | -- | -- | 5 min | |
| **Total** | **10 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/70_header_footer.js`: expanded `DELTA_TABLES` from 7 to 22 tables — added `executive_agency_type`, `steward_role_type`, `quality_dimension`, `criticality_group`, `criticality_level`, `executive_agency`, `directorate`, `data_patron`, `data_owner`, `data_steward`, `criticality_group_weight`, `quality_dimension_weight`, `critical_data_set`, `shortlist_group`, `cde_shortlist_tag`

---

## build-20260701-2151 — Documentation: dashboard guide updated and style fixed

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Doc review and rewrite | -- | -- | 15 min | |
| **Total** | **0 min** | **0 min** | **15 min** | |

### Changes delivered
- `documentation/user-guide/dashboard/understand-dashboard.html`: full rewrite — header style aligned to current template (back link, CSS class names, layout); action cards table updated to reflect expandable Undocumented CDS behaviour; quality dimension and My CDS sections updated; related guides section added

---

## build-20260701-2143 — Dashboard: expandable Undocumented CDS card with pre-filtered navigation

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Design discussion | 15 min | -- | -- | |
| Implementation | -- | -- | 25 min | |
| **Total** | **15 min** | **0 min** | **25 min** | |

### Changes delivered
- `src/220_screen_dashboard.js`: `ExpandableActionCard` component; `dirById` lookup; undocumented CDS card now uses `items`; render loop dispatches by card type
- `src/240_app.js`: `CriticalDataElementView` receives `initialSearch` prop from router; key updated to force remount on pre-filtered navigation
- `src/141_view_cde_list.js`: `CriticalDataElementView` accepts `initialSearch` prop; seeds `search` state on mount

---

## build-20260701-2123 — Dashboard: fix Undocumented CDS navigation

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Root cause investigation | 5 min | -- | -- | |
| Fix | -- | -- | 2 min | |
| **Total** | **5 min** | **0 min** | **2 min** | |

### Changes delivered
- `src/220_screen_dashboard.js`: Undocumented CDS card route corrected (`critical_data_set` → `critical_data_element`)

---

## build-20260701-2101 — My Data toggle: consolidated across all screens

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Audit + consolidation design | 10 min | -- | -- | |
| Implementation | -- | -- | 25 min | |
| **Total** | **10 min** | **0 min** | **25 min** | |

### Changes delivered
- `src/20_data_utils.js`: added `getMyStewardCdsIds`, `loadMyDataPref`, `saveMyDataPref`
- `src/70_header_footer.js`: added shared `MyDataToggle` component
- `src/141_view_cde_list.js`: replaced inline derivation + non-persisted state with shared helpers; renamed `myCdsOnly` to `myDataOnly`; replaced button JSX with `MyDataToggle`
- `src/145_view_rules.js`: replaced inline derivation + state init + useEffect with shared helpers; replaced button JSX with `MyDataToggle`
- `src/200_screen_ddl.js`: replaced inline derivation + state init + useEffect with shared helpers; fixed serialisation and default; replaced button JSX with `MyDataToggle`
- `src/100_view_weights_org.js`: replaced label+toggle with `MyDataToggle`; replaced state init + useEffect with shared helpers; refactored `myAgencyIds` to use `getMyStewardCdsIds`

---

## build-20260701-2044 — Organisation page: My Data toggle added

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| My Data toggle for Organisation page | -- | -- | 10 min | |
| **Total** | **0 min** | **0 min** | **10 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: added `myDataOnly` state (default `true`, localStorage-persisted), `myAgencyIds` memo, agency filter in `trees` memo, and My Data toggle in page header

---

## build-20260701-2037 — Rules Explorer: My Data toggle on by default

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Fix default toggle state | -- | -- | 5 min | |
| **Total** | **0 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/145_view_rules.js`: changed `myDataOnly` initial state to default `true` when no localStorage value exists (previously defaulted to `false`)

---

## build-20260701-2032 — Dashboard: Undocumented CDS card added

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Undocumented CDS card + user docs | -- | -- | 15 min | |
| **Total** | **0 min** | **0 min** | **15 min** | |

### Changes delivered
- `src/220_screen_dashboard.js`: added `undocumentedCds` computation in `computeStewardGaps`; added 9th action card (Undocumented CDS) to `DashboardScreen`
- `documentation/user-guide/dashboard/understand-dashboard.html`: new guide — how to use the steward dashboard
- `documentation/user-guide/index.html`: Dashboard section added

---

## build-20260701-2021 — Dashboard: steward action centre

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Dashboard redesign — design discussion | 25 min | -- | -- | |
| Dashboard redesign — design + plan docs | -- | 20 min | -- | |
| Dashboard redesign — implementation | -- | -- | 30 min | |
| **Total** | **25 min** | **20 min** | **30 min** | |

### Changes delivered
- `src/220_screen_dashboard.js`: full replacement with `computeStewardGaps()` helper, `ActionCard` sub-component, and redesigned `DashboardScreen`
- `designs/DESIGN_DASHBOARD_STEWARD_ACTIONS.md`: full feature design (approved)
- `designs/DESIGN_REPORTING_PAGE.md`: outline stub for future master steward reporting page
- `plans/PLAN_DASHBOARD_STEWARD_ACTIONS.md`: implementation plan

---

## build-20260701-1847 — Sidebar: RAG Simulator and Rule Generator moved into Data Quality Elements group

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Sidebar reorganisation | 5 min | -- | 5 min | |
| **Total** | **5 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/80_sidebar.js`: removed standalone Rule Generator and RAG Simulator top-level nav items; added explicit ordered block for Data Quality Elements group (Data and Stewardship, RAG Simulator, Rule Generator, Rules Explorer, Profiling); added `dq` group skip guard in generic table loop
- `APP_TREE.md`: updated sidebar nav table and Data Quality Elements group to reflect new order

---

## build-20260701-1832 — Organisation page: CDS pill baseline alignment fix

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| One-line fix | -- | -- | 1 min | |
| **Total** | **0 min** | **0 min** | **1 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: outer CDS flex container changed from `alignItems:'flex-start'` to `alignItems:'baseline'`

---

## build-20260701-1825 — Organisation page: CDS row single-column layout

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Layout rewrite + non-ASCII fix | -- | -- | 5 min | |
| **Total** | **0 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: CDS row restructured to single-column; `[CDS pill]` top-anchored; name+stats row 1; stewards row 2; description row 3 aligned with steward pills; no 2-column grid

---

## build-20260701-1818 — Organisation page: CDS row layout restructured

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Layout restructure | -- | -- | 5 min | |
| **Total** | **0 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: CDS row uses flex anchor pattern — `[CDS pill]` + right-side column containing (name+stats row 1, stewards row 2); steward indent derived from pill width automatically

---

## build-20260701-1814 — Organisation page: CDS stat line always shows full counts

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Revert zero-CDE conditional, restore full stat line | -- | -- | 2 min | |
| **Total** | **0 min** | **0 min** | **2 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: CDS stat line conditional removed; always renders `N CDEs · N rules · ProfilingSpan`

---

## build-20260701-1810 — Organisation page: profiling label and CDE pluralisation fixes

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Stat line audit + three fixes | 5 min | -- | 5 min | |
| **Total** | **5 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: `ProfilingSpan` null case → "no CDEs profiled"; agency CDE label pluralised; directorate CDE label pluralised

---

## build-20260701-1800 — Organisation page: CDS stat line redundant zero-CDE counts removed

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Fix zero-CDE stat line | -- | -- | 2 min | |
| **Total** | **0 min** | **0 min** | **2 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: CDS stat line now shows only `ProfilingSpan` when `cdsCdeCount === 0`; counts only render when CDEs exist

---

## build-20260701-1758 — Organisation page: CDS container borders removed, indentation increased

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Three visual tweaks | -- | -- | 3 min | |
| **Total** | **0 min** | **0 min** | **3 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: CDS container borders removed; `paddingLeft` 48; steward column `paddingLeft:16`

---

## build-20260701-1754 — Organisation page: CDS visual hierarchy and type badge

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Design discussion (indentation vs font weight) | 5 min | -- | -- | |
| Implementation | -- | -- | 3 min | |
| **Total** | **5 min** | **0 min** | **3 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: CDS container `paddingLeft` increased to 32 + `borderLeft` added; `[CDS]` neutral pill added before CDS name on line 1

---

## build-20260701-1734 — Organisation page: CDS table steward pill fix, description alignment, no headers

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Three targeted fixes | -- | -- | 5 min | |
| **Total** | **0 min** | **0 min** | **5 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: `physAccent` changed to `'#7c5cbf'` (hex); description `alignSelf:'flex-start'`; column headers removed

---

## build-20260701-1726 — Organisation page: CDS table redesign with stats and steward layout

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Layout clarification + confirmation | 5 min | -- | -- | |
| Implementation (per-CDS stats + JSX rewrite) | -- | -- | 10 min | |
| **Total** | **5 min** | **0 min** | **10 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: CDS entries now show name + stat line above a 2-column stewards/description layout; per-CDS CDE count, rule count and profiling % added to `cdsWithStewards` computation; stewards rendered as `[Role pill] name` plain text stacked vertically

---

## build-20260701-1711 — Organisation page: CDS table column order and steward stacking

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Column reorder + stacking layout | -- | -- | 3 min | |
| **Total** | **0 min** | **0 min** | **3 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: CDS table columns reordered to Stewards | Name | Description; stewards now `flex-direction:column` so multiple stewards stack vertically

---

## build-20260701-1707 — Organisation page: directorate row expansion with CDS table

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Requirements clarification (CDS table columns, read-only) | 5 min | -- | -- | |
| Design + plan docs (DESIGN_ORG_DIR_EXPAND, PLAN_ORG_DIR_EXPAND) | -- | 15 min | -- | |
| Implementation (expandedDirs state, cdsWithStewards, JSX rewrite) | -- | -- | 25 min | |
| Non-ASCII em-dash fix (build error) | -- | -- | 3 min | |
| User guide update (read-organisation-page.html) | -- | -- | 8 min | |
| Build + changelog + metrics | -- | -- | 3 min | |
| **Total** | **5 min** | **15 min** | **39 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: directorate rows now independently expandable; patron row removed from expanded agency view; 2-line directorate header with [Owner] pill; CDS table in expanded state (Name, Description, Stewards per CDS)
- `documentation/user-guide/ownership-hierarchy/read-organisation-page.html`: updated to document directorate expansion and CDS table

---

## build-20260701-1650 — Organisation page: "dir" expanded to full word

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| One-line label fix + rebuild | -- | -- | 2 min | |
| **Total** | **0 min** | **0 min** | **2 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: `' dir '` replaced with `' directorate' + (plural) + ' '`

---

## build-20260701-1648 — Organisation page: fix dot separator rendering

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Diagnose double-backslash escape bug | -- | -- | 5 min | |
| Fix with String.fromCharCode(183) + rebuild | -- | -- | 5 min | |
| **Total** | **0 min** | **0 min** | **10 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: separator now uses `String.fromCharCode(183)` constant (`mdot`) — ASCII-safe, renders correctly in Babel CDN environment

---

## build-20260701-1642 — Organisation page: agency row restructure

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Requirements clarification (patron, owner, steward dedup) | 15 min | -- | -- | |
| Design + plan docs | -- | 20 min | -- | |
| Implementation (100_view_weights_org.js) | -- | -- | 25 min | |
| Non-ASCII fix (build error) | -- | -- | 5 min | |
| User guide (new page + index update) | -- | -- | 10 min | |
| Build + changelog + metrics | -- | -- | 3 min | |
| **Total** | **15 min** | **20 min** | **43 min** | |

### Changes delivered
- `src/100_view_weights_org.js`: agency row restructured; flat stat line with patron; profiling as %; directorate stat line added; StatPill removed; ERD constraints documented
- `documentation/user-guide/ownership-hierarchy/read-organisation-page.html`: new guide
- `documentation/user-guide/index.html`: new guide added to Ownership Hierarchy section

---

## build-20260701-1516 — Reset data: two-stage confirmation for unsaved delta changes

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Analysis: delta tracking mechanism | 5 min | -- | -- | |
| Design: two-stage approach | 5 min | -- | -- | |
| Implementation (240_app.js) | -- | -- | 10 min | |
| User guide update (export-and-reset.html) | -- | -- | 5 min | |
| Build + changelog + metrics | -- | -- | 3 min | |
| **Total** | **10 min** | **0 min** | **18 min** | |

### Changes delivered
- `src/240_app.js`: two-stage reset confirmation driven by live `buildDelta` count; no new state or context required

---

## build-20260701-1450 — Rule Generator: rename "Test It" to "Copy SQL"

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Button rename + rebuild | 2 min | -- | 2 min | |
| **Total** | **2 min** | **0 min** | **2 min** | |

### Changes delivered
- `src/180_screen_generator.js`: "Test It" label renamed to "Copy SQL"; `handleTestIt` renamed to `handleCopySql`

---

## build-20260701-1433 -- User Guide: Rule Generator section (2 guides)

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Source code review (180_screen_generator.js) | -- | -- | 8 min | |
| 2 guide pages authored | -- | -- | 20 min | |
| Index updated + build + changelog + metrics | -- | -- | 4 min | |
| **Total** | **0 min** | **0 min** | **32 min** | |

### Changes delivered
- `documentation/user-guide/rule-generator/` folder created with 2 guides: generate-suggestions, review-add-rules
- `documentation/user-guide/index.html` updated: new "Rule Generator" section added before Tools & Advanced Features; user-guide zip now contains 45 files

---

## build-20260701-1418 -- User Guide: RAG Simulator section (2 guides)

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Source code review (170_screen_simulator.js) | -- | -- | 6 min | |
| 2 guide pages authored | -- | -- | 18 min | |
| Index updated | -- | -- | 2 min | |
| Build + changelog + metrics | -- | -- | 3 min | |
| **Total** | **0 min** | **0 min** | **29 min** | |

### Changes delivered
- `documentation/user-guide/rag-simulator/` folder created with 2 guides: run-simulation, rag-calculation
- `documentation/user-guide/index.html` updated: new "RAG Simulator" section added; user-guide zip now contains 43 files

---

## build-20260701-1411 -- User Guide: Rules Explorer section (4 guides)

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Documentation structure proposal (4 guides) | 5 min | -- | -- | |
| Source code review (145_view_rules.js, 166_form_panel_rule.js) | -- | -- | 8 min | |
| 4 guide pages authored | -- | -- | 20 min | |
| Index updated | -- | -- | 2 min | |
| Build + changelog + metrics | -- | -- | 3 min | |
| **Total** | **5 min** | **0 min** | **33 min** | |

### Changes delivered
- `documentation/user-guide/rules-explorer/` folder created with 4 guides: navigate-rules-explorer, rule-add-edit, allocation-manage, view-sql
- `documentation/user-guide/index.html` updated: new "Rules Explorer" section added; user-guide zip now contains 41 files

---

## build-20260701-1359 -- User Guide: Data and Stewardship section (6 guides)

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Documentation structure proposal (6 guides) | 5 min | -- | -- | |
| Source code review (141_view_cde_list.js, 140_view_cde.js) | -- | -- | 8 min | |
| 6 guide pages authored | -- | -- | 25 min | |
| Index updated | -- | -- | 3 min | |
| Build + changelog + metrics | -- | -- | 3 min | |
| **Total** | **5 min** | **0 min** | **39 min** | |

### Changes delivered
- `documentation/user-guide/data-stewardship/` folder created with 6 guides: navigate-hierarchy, cds-add, cde-add, cde-edit-retire, rule-allocate, my-data
- `documentation/user-guide/index.html` updated: new "Data and Stewardship" section added with all 6 guide links; user-guide zip now contains 37 files

---

## build-20260701-1346 -- User Guide: align load-master-data with import-master

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Cross-reference audit (grep all 31 guides for master-loading links) | -- | -- | 3 min | |
| load-master-data.html updated | -- | -- | 5 min | |
| Changelog, metrics update | -- | -- | 3 min | |
| **Total** | **0 min** | **0 min** | **11 min** | |

### Changes delivered
- `getting-started/load-master-data.html`: lead updated to mention "latest version"; step 2 gains sub-note with filename format and link to `import-export/import-master.html`; related links section adds pointer to the full guide
- All 31 guide cross-references audited — Getting Started guides link within Getting Started, Import &amp; Export guides link within Import &amp; Export, both reachable from index. No mis-directed references found.

---

## build-20260701-1340 -- User Guide: import-master guide updated with version identification

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Requirements clarification (version convention, file naming) | 3 min | -- | -- | |
| Source code review (nextMasterVersion in 71_master_version.js) | -- | -- | 3 min | |
| Guide update authored | -- | -- | 8 min | |
| Changelog, metrics update | -- | -- | 3 min | |
| **Total** | **3 min** | **0 min** | **14 min** | |

### Changes delivered
- `import-master.html` extended with a "Identifying the correct file" section
- Format explained: `dq_master_master-YYYYMMDD-NNN.json` with date and daily sequence number
- Visual ranked example (4 files, oldest to newest) with colour-coded latest/older badges
- Note on consequence of loading an older version (version-mismatch warnings on delta merge)
- Import steps section retitled "Importing the file" to distinguish from the identification section

---

## build-20260701-1335 -- User Guide: Import & Export section (3 pages) + backlog item

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Scope clarification (3 guides, master-steward gate, backlog) | 5 min | -- | -- | |
| Source code review (230_screen_export.js, gating logic) | -- | -- | 5 min | |
| 3 guide pages authored | -- | -- | 10 min | |
| Index updated (Import & Export section populated) | -- | -- | 3 min | |
| Backlog item EXPORT-CSV-GATE written with implementation detail | -- | -- | 5 min | |
| Changelog, metrics update | -- | -- | 5 min | |
| **Total** | **5 min** | **0 min** | **28 min** | |

### Changes delivered
- 3 HTML guide pages created in `documentation/user-guide/import-export/`
- import-master: drop zone / browse flow, warning to export delta first, note about JSON vs Excel
- export-delta: Export screen → Delta export card → Export my delta → send to master steward; prerequisite notes
- export-csv-zip: Export configuration card → include soft-deleted toggle → Export all tables as zip; marked as master steward only; note about pending gate
- `index.html` Import & Export section populated with all 3 guide links
- Backlog item EXPORT-CSV-GATE: restrict CSV/ZIP exports to `isMaster`; current gap documented; table shows which buttons need re-gating
- Zip now bundles 31 user-guide files

---

## build-20260701-1325 -- User Guide: Table & Field Profiling section (8 pages)

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Approach proposal (sub-groups, 8-page scope) | 10 min | -- | -- | |
| Source code review (200_screen_ddl.js, 201_ddl_form_panel.js, sidebar labels) | -- | -- | 10 min | |
| 8 guide pages authored | -- | -- | 20 min | |
| Index page updated (new section) | -- | -- | 5 min | |
| Changelog, metrics update | -- | -- | 5 min | |
| **Total** | **10 min** | **0 min** | **40 min** | |

### Changes delivered
- 8 HTML guide pages created in `documentation/user-guide/profiling/`
- Table Library: table-add (Athena DDL flow), table-edit (re-profile), table-remove (retire)
- Field Profiling: field-profile (full 3-step workflow), field-update (re-profile existing), field-filter (status dropdown reference), field-my-data (My Data toggle + prereq), field-copy-sql (6 queries explained)
- `index.html` "Table & Field Profiling" section added and populated with all 8 guide links
- Zip now bundles 28 user-guide files

---

## build-20260701-1310 -- User Guide: Getting Started section (4 pages)

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Requirements clarification (scope, merge guides 4+5) | 10 min | -- | -- | |
| Source code review (import, export, reset flows) | -- | -- | 5 min | |
| 4 guide pages authored | -- | -- | 15 min | |
| Index page updated | -- | -- | 5 min | |
| Changelog, metrics update | -- | -- | 5 min | |
| **Total** | **10 min** | **0 min** | **30 min** | |

### Changes delivered
- 4 HTML guide pages created in `documentation/user-guide/getting-started/`
- Open the application: build-check step, extraction, session best-practice sequence
- Set steward identity: cog icon &rarr; dropdown &rarr; Save identity
- Load master data: master JSON import only, with warning about uncommitted changes
- Export and reset: delta export + reset flow merged in one page, plus abandon-changes path
- `index.html` Getting Started section populated with links to all 4 guides
- Zip now bundles 20 user-guide files

---

## build-20260701-1235 -- User Guide: Ownership Hierarchy guides (15 pages)

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Page list review and approval | 10 min | -- | -- | |
| Source code review (5 form panels + views) | -- | -- | 10 min | |
| 15 guide pages authored | -- | -- | 20 min | |
| Index page updated | -- | -- | 5 min | |
| Changelog, metrics update | -- | -- | 5 min | |
| **Total** | **10 min** | **0 min** | **40 min** | |

### Changes delivered
- 15 HTML guide pages created in `documentation/user-guide/ownership-hierarchy/`
- Covers add / modify / remove for: Executive Agency, Directorate, Data Patron, Data Owner, Data Steward
- Each guide includes: steward identity prerequisite, numbered steps with required/optional labels, retire note on remove guides, related guide links
- `index.html` Ownership Hierarchy section populated with links to all 15 guides
- Zip now bundles 16 user-guide files

---

## build-20260701-1142 -- User Guide: bundle, index page, and header button

**Date:** 2026-07-01

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Viability discussion + approach agreement | 15 min | -- | -- | |
| Build script update (zip bundling) | -- | -- | 5 min | |
| User Guide index page (HTML) | -- | -- | 10 min | |
| Header button + Book icon | -- | -- | 5 min | |
| Changelog, metrics update | -- | -- | 5 min | |
| **Total** | **15 min** | **0 min** | **25 min** | |

### Changes delivered
- `documentation/user-guide/index.html` created as the TOC landing page with six topic sections
- `user-guide/` folder included in zip on every build; count reported in build output
- `Icon.Book` added to `60_icons.js`
- User Guide button added to AppHeader (left of Settings), opens `user-guide/index.html` in new tab
- `build.py` handles empty or missing `documentation/user-guide/` gracefully

---

## build-20260629-1506 -- Profiling: CDE completion badge and Logical Type column

**Date:** 2026-06-29

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Requirements discussion | 15 min | -- | -- | |
| Design + plan documents | -- | 15 min | -- | |
| CDE completion badge (Enhancement A) | -- | -- | 5 min | |
| Physical / Logical Type columns (Enhancement B) | -- | -- | 10 min | |
| Non-ASCII escape fixes (build validation) | -- | -- | 5 min | |
| Backlog, changelog, metrics update | -- | -- | 5 min | |
| **Total** | **15 min** | **15 min** | **25 min** | |

### Changes delivered
- Green "CDEs ✓" badge on table header when all CDE-origin fields have profiling records
- "Phys Type" + "Log Type" columns replace the single "Type" column on field rows
- Logical type shown in purple when a semantic override is set; dimmed dash otherwise
- Grid templates updated in FieldRow, column header, and DimCoverageFooter to maintain alignment
- PROF-Q backlog item added for semantic-aware SQL generation (item c from requirements discussion)

---

## build-20260626-2102 -- Merge directorate management into Organisation page

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Design + plan documents | 10 min | 15 min | -- | |
| Add `+ Directorate` button to agency header | -- | -- | 5 min | |
| Add Edit + Retire/Restore to directorate rows | -- | -- | 5 min | |
| Remove directorate from sidebar | -- | -- | 2 min | |
| Backlog + changelog + metrics update | -- | -- | 5 min | |
| **Total** | **10 min** | **15 min** | **17 min** | |

### Changes delivered
- `+ Directorate` button on each live agency card header (editor-only); opens directorate form with agency pre-selected
- Edit + Retire/Restore buttons on each directorate row in expanded agency card
- Directorate removed from sidebar navigation
- CLEAN-2 backlog item added for future DirectorateView code removal

---

## build-20260626-2047 -- Agency form: remove patron assignment via X on chip

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Implement X button on patron chips + __removePatrons transient field + handler update | -- | -- | 10 min | |
| **Total** | **--** | **--** | **10 min** | |

### Changes delivered
- X button on each current patron chip in edit mode
- Clicking X removes chip immediately; on save sets executive_agency_id = null on that patron record
- handleAgencySave updated to process __removePatrons array

---

## build-20260626-2018 -- Agency form: correct select-existing patron filter (unassigned only)

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Correct filter to active patrons with null executive_agency_id only | -- | -- | 5 min | |
| **Total** | **--** | **--** | **5 min** | |

### Issues resolved
- availablePatrons filter now: `!retiring_timestamp && !executive_agency_id`

---

## build-20260626-2016 -- Agency form: correct select-existing patron filter

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Diagnose wrong filter (was showing retired patrons, should show active unassigned) | 2 min | -- | -- | |
| Fix availablePatrons filter + empty-state message | -- | -- | 5 min | |
| **Total** | **2 min** | **--** | **5 min** | |

### Issues resolved
- Select existing dropdown now shows active patrons not assigned to the current agency (retired patrons excluded)

---

## build-20260626-2012 -- Agency form: fix type dropdown + patron select-existing mode

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Diagnose type dropdown bug (wrong field name) + redesign patron section for select-existing | 5 min | -- | -- | |
| Implement fix + three-mode patron toggle (Skip / Create new / Select existing) | -- | -- | 15 min | |
| **Total** | **5 min** | **--** | **15 min** | |

### Issues resolved
- Agency Type dropdown now shows all active types (was reading non-existent `executive_agency_type_name` field)
- Patron section redesigned: Skip (default) / Create new / Select existing retired patron

---

## build-20260626-2005 -- Agency form: inline Data Patron creation

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Evaluate feature request; read data_patron schema + existing custom form panel patterns | 5 min | -- | -- | |
| Design doc (DESIGN_AGENCY_PATRON_FORM.md) | -- | 10 min | -- | |
| Plan doc (PLAN_AGENCY_PATRON_FORM.md) + PK capture ordering risk | -- | 10 min | -- | |
| Implement AgencyFormPanel (167) + handleAgencySave wiring in 240_app.js | -- | -- | 15 min | |
| **Total** | **5 min** | **20 min** | **15 min** | |

### Changes delivered
- New `AgencyFormPanel` component in `src/167_form_panel_agency.js`
- Optional inline patron creation in Add/Edit Agency form
- Edit mode shows existing active patron chips
- `handleAgencySave` in `240_app.js` handles split save (agency + optional patron)
- `executive_agency` form branch wired in App-level form render block

---

## build-20260626-1948 -- Merge Executive Agency CRUD into Organisation page

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Analyse current org chart + agency page; identify risks (title gap, cascade retire, sidebar) | 10 min | -- | -- | |
| Design doc (DESIGN_ORG_AGENCY_MERGE.md) + Plan doc (PLAN_ORG_AGENCY_MERGE.md) | -- | 15 min | -- | |
| Implement 4 files: constants label, sidebar filter, RecordFormPanel title, org chart controls | -- | -- | 15 min | |
| **Total** | **10 min** | **15 min** | **15 min** | |

### Changes delivered
- Add Agency button in Organisation page header
- Edit + Retire/Restore buttons per agency row
- Executive Agency removed from sidebar
- RecordFormPanel titles now use schema label (all tables improved)
- executive_agency schema label renamed to 'Agency'

---

## build-20260626-1933 -- Normalize Unicode whitespace in all Copy SQL handlers

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Diagnose Unicode whitespace issue + agree on fix approach | 5 min | -- | -- | |
| Implement normalizeWhitespace utility + wire into buildProfilingSQL + 6 copy handlers | -- | -- | 10 min | |
| **Total** | **5 min** | **--** | **10 min** | |

### Issues resolved
- Unicode space variants (U+00A0 etc.) from Excel copy-paste no longer survive into clipboard SQL; Athena no longer rejects copied queries due to invisible non-standard spaces.

---

## build-20260626-1917 -- MoJ Quality Framework profiling alignment

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Terminology analysis -- map current 4 sections to MoJ framework, identify 2 gaps | 10 min | -- | -- | |
| Design doc (DESIGN_PROFILING_MOJ_ALIGNMENT.md) + Plan doc (PLAN_PROFILING_MOJ_ALIGNMENT.md) | -- | 15 min | -- | |
| Implement renames + Duplicate Analysis + Outlier Analysis (2 files) | -- | -- | 20 min | |
| **Total** | **10 min** | **15 min** | **20 min** | |

### Changes delivered
- 4 section labels renamed to MoJ terminology (Column Profiling, Frequency Analysis, Pattern Analysis, Length Profile)
- Duplicate Analysis added (section 5, all field types, uniqueness_pct metric)
- Outlier Analysis added (section 6, Z-score for numeric; low-frequency for categorical; N/A for boolean)
- 2 new schema columns on field_profiling: duplicate_analysis_raw, outlier_analysis_raw

---

## How to read

| Column | Description |
|--------|-------------|
| **Discussion** | Understanding, reproducing, agreeing on approach |
| **Design / Plan** | Producing design docs and plan docs |
| **Coding** | First file edit to clean build |
| **Testing** | Manually added by user after browser testing |
| **Total (excl. testing)** | Sum of Discussion + Design/Plan + Coding |

---

## build-20260626-1845 — Table Profiling panel: Parse button fix

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Button style inconsistency fix + reposition | 5 min | -- | 5 min | |

---

## build-20260626-1841 — Table Profiling panel UX improvements

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| UX analysis of Table Profiling panel - identify 3 gaps | 10 min | -- | -- | |
| Design doc (DESIGN_TABLE_PROFILING_UX.md) + Plan doc (PLAN_TABLE_PROFILING_UX.md) | -- | 10 min | -- | |
| Implement step cards, Athena copy block, instruction line | -- | -- | 20 min | |
| **Total** | **10 min** | **10 min** | **20 min** | |

### Changes delivered
- Two-step card layout replacing flat layout
- Auto-generated `SHOW CREATE TABLE` Athena command with copy button
- Contextual instruction line above DDL paste area

---

## build-20260626-1822 — Fix snapshot_filter token substitution on Profiling page

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Bug triage - trace raw snapshotFilter through fieldMap assembly, confirm missing substitution | 5 min | -- | -- | |
| Codebase audit - find all 5 duplicate inline substitute closures | 5 min | -- | -- | |
| Design + plan docs (DESIGN_CDE_TOKEN_SUBSTITUTION.md, PLAN_CDE_TOKEN_SUBSTITUTION.md) | -- | 10 min | -- | |
| Implement substituteCdeTokens utility + refactor 6 files + bug fix | -- | -- | 15 min | |
| **Total** | **10 min** | **10 min** | **15 min** | |

### Issues resolved
- Profiling page snapshot_filter shown and embedded in SQL with unsubstituted `{SOURCE_*}` tokens.
- Eliminated 5 duplicate inline token-substitution closures across the codebase.

---

## build-20260626-1755 — Add steward assignment controls to Edit CDS panel

**Date:** 2026-06-26

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Bug triage - confirm missing feature in edit mode stewards section | 5 min | -- | -- | |
| Design + plan docs (DESIGN_CDS_STEWARD_ASSIGNMENT.md, PLAN_CDS_STEWARD_ASSIGNMENT.md) | -- | 10 min | -- | |
| Implement interactive stewards section + handleCdsSave retire/add logic | -- | -- | 20 min | |
| **Total** | **5 min** | **10 min** | **20 min** | |

### Issues resolved
- Missing feature: no way to add or remove stewards from the Edit CDS panel; edit mode now has full add/remove controls.

---

## design-20260619 — Rule CDS Scope + Dead Code Audit (no build)

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Dead code audit — trace routing vs sidebar nav, identify 3 unreachable files | 10 min | -- | -- | n/a |
| Size + effort + risk assessment for CLEAN-1 | 5 min | -- | -- | n/a |
| Rule CDS Scope — requirements discussion (model options, nullable FK decision) | 15 min | -- | -- | n/a |
| Rule CDS Scope — design doc + plan doc (DESIGN_RULE_CDS_SCOPE.md, PLAN_RULE_CDS_SCOPE.md) | -- | 20 min | -- | n/a |
| Backlog updates (CLEAN-1, CDS-SCOPE entries) | -- | 5 min | -- | n/a |
| **Total** | **30 min** | **25 min** | **--** | n/a |

**Outputs:**
- CLEAN-1 backlog entry: 3 dead files identified (`190_screen_coverage.js`, `150_view_cds_dir.js`, `110_view_rules.js`), ~37 KB saving, pre-flight check noted
- `designs/DESIGN_RULE_CDS_SCOPE.md` — nullable `critical_data_set_id` FK on `data_quality_rule`; 4 files touched, no new tables
- `plans/PLAN_RULE_CDS_SCOPE.md` — 6-step implementation plan, ready to build when approved

---

## build-20260619-1702 — KI-18: Reconciliation resolution button colours

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Identify button styling in 210_screen_import.js | 2 min | -- | -- | |
| Replace ghost class with dynamic btn-primary / btn-green | -- | -- | 3 min | |
| **Total** | **2 min** | **--** | **3 min** | |

**Issues resolved:**
- KI-18 resolved — resolution buttons now use filled colour classes when selected

---

## build-20260619-1651 — KI-22 (Option A): Correct rule filter logic

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Diagnose incorrect generic classification (allCdsNames false-positive) | 5 min | -- | -- | |
| Fix filter logic in 141 and 130 | -- | -- | 5 min | |
| **Total** | **5 min** | **--** | **5 min** | |

**Issues resolved:**
- KI-22 filter logic corrected -- rules with any CDS prefix other than "Generic" or the current CDS are now hidden

---

## build-20260619-1646 — KI-22 (Option A): Fix applied to correct file (Data and Stewardship page)

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Identify correct panel (141_view_cde_list.js / CdeAllocFormPanel) | 3 min | -- | -- | |
| Apply CDS-context rule filter + hint text to correct file | -- | -- | 5 min | |
| **Total** | **3 min** | **--** | **5 min** | |

**Issues resolved:**
- KI-22 (Option A, corrected) -- Rule dropdown in Data and Stewardship Add Allocation panel now filters to generic + CDS-matching rules

---

## build-20260619-1634 — KI-22 (Option A): Rule dropdown filtered by CDS context in Add Allocation panel

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-22 Option A/B analysis and decision | 10 min | 5 min | -- | |
| CDS-context rule filter + cascade reset + hint text (1 file) | -- | -- | 8 min | |
| BACKLOG + KNOWN_ISSUES documentation | -- | 5 min | -- | |
| **Total** | **10 min** | **10 min** | **8 min** | |

**Issues resolved:**
- KI-22 (Option A) -- Rule dropdown now filters to generic + CDS-specific rules when a Data Set is selected

---

## build-20260619-1617 — KI-15: Trailing-dot filename fix extended to group export downloads

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-15 missed regex in handleExportGroup (1 line, 1 file) | 2 min | — | 1 min | |
| **Total** | **2 min** | **—** | **1 min** | |

**Issues resolved:**
- KI-15 (complete) — Group export download buttons now also produce clean filenames

---

## build-20260619-1613 — KI-16: Folder picker for master and full-dataset exports; export group buttons icon-only

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-16 save picker + refactor + button UI (3 file edits) | 10 min | 5 min | 10 min | |
| **Total** | **10 min** | **5 min** | **10 min** | |

**Issues resolved:**
- KI-16 — Export feature should let user select destination folder

---

## build-20260619-1559 — KI-15: Export zip filename no longer contains a trailing dot

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-15 timestamp regex fix (3 lines, 2 files) | 5 min | — | 2 min | |
| **Total** | **5 min** | **—** | **2 min** | |

**Issues resolved:**
- KI-15 — Export configuration filename had a `.` before the `.zip` suffix

---

## build-20260619-1511 — KI-24: Profiling SQL now scoped to snapshot filter

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-24 snapshot filter wiring (10 file edits, 1 file) | 10 min | 10 min | 10 min | |
| **Total** | **10 min** | **10 min** | **10 min** | |

**Issues resolved:**
- KI-24 — Profile should look at a snapshot and not the full table

---

## build-20260619-1448 — KI-20: Bumper value range corrected to 1–5

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-20 bumper dropdown + stepper clamp (4 file edits) | 5 min | — | 5 min | |
| **Total** | **5 min** | **—** | **5 min** | |

**Issues resolved:**

| # | Title | Resolution |
|---|-------|-----------|
| KI-20 | Bumper value range incorrect (included 0) | Dropdowns now offer 1–5 only; stepper lower bound clamped to `Math.max(1, ...)` in Simulator and Generator |

---

## build-20260619-1430 — Rule Generator: directorate dropdown blocked for agency/directorate with ID 0

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-27 cascade dropdown truthiness fix | 5 min | — | 5 min | |
| **Total** | **5 min** | **—** | **5 min** | |

**Issues resolved:**

| # | Title | Resolution |
|---|-------|-----------|
| KI-27 | Rule Generator directorate dropdown blocked when agency/directorate ID = 0 | Replaced `!filterAgencyId` / `!filterDirId` truthiness guards with `=== null` checks in `180_screen_generator.js` |

---

## build-20260619-1411 — Directorate screen: per-agency "+ Add" shortcut button

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Per-agency "+ Add" shortcut — design + implementation | 10 min | 15 min | 5 min | |
| **Total** | **10 min** | **15 min** | **5 min** | |

**Design documents produced:**

| Document | Status |
|----------|--------|
| `designs/DESIGN_D_DIRECTORATE_QUICK_ADD.md` | Complete |

---

## build-20260619-1344 — Colour theme V2 + design token centralisation

**Date:** 2026-06-19

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| Colour theme V2 + design token centralisation | — | — | — | |
| **Total** | **unknown** | **unknown** | **unknown** | |

_Note: Built in a prior conversation; time estimates not available._

---

## build-20260618-1945 — Delta sync UX: post-merge export CTA + uncommitted-changes intercept

**Date:** 2026-06-18

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-10 / KI-11 delta sync UX safety | 5 min | 5 min | 15 min | |
| KI-14 gap analysis + KNOWN_ISSUES additions (pre-build) | 10 min | 15 min | — | |
| Startup version check exploration (no build produced) | 20 min | 20 min | — | |
| Session metrics doc + memory directive | 5 min | 10 min | — | |
| **Total** | **40 min** | **50 min** | **15 min** | |

**Issues resolved:**

| # | Title | Resolution |
|---|-------|-----------|
| KI-10 | No post-merge export prompt | "Export new Master JSON" CTA added to post-merge summary card |
| KI-11 | No uncommitted-changes warning on import | Intercept with change count + Export delta / Import anyway / Cancel flow |

_Note: `DESIGN_STARTUP_VERSION_CHECK.md` produced but not committed to a build — exploratory only; awaiting multi-steward pilot feedback._

---

## build-20260618-1937 — Delta sync hardening: snapshot update after merge + version mismatch warning

**Date:** 2026-06-18

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-12 / KI-13 delta sync hardening | 5 min | 5 min | 10 min | |
| Delta sync workflow design doc (pre-build) | 15 min | 20 min | — | |
| **Total** | **20 min** | **25 min** | **10 min** | |

**Design documents produced:**

| Document | Status |
|----------|--------|
| `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` | Complete — full 8-step workflow reference including data structures, localStorage keys, PK namespace strategy, and gaps table |

**Issues resolved:**

| # | Title | Resolution |
|---|-------|-----------|
| KI-12 | Master snapshot not updated after merge | `saveBaseSnapshot` called inside `handleApplyMerge` |
| KI-13 | No version check on delta import | Amber warning banner shown when `_base_version` mismatches current master version |

---

## build-20260618-1832 — KI-1 / KI-2: Master designation stale closure fix

**Date:** 2026-06-18

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-1 / KI-2 investigation + user reproduction test | 25 min | 10 min | 10 min | |
| **Total** | **25 min** | **10 min** | **10 min** | |

**Design documents produced:**

| Document | Status |
|----------|--------|
| `designs/DESIGN_KI1_designate_master.md` | Complete |

**Issues resolved:**

| # | Title | Resolution |
|---|-------|-----------|
| KI-1 | PK namespace not reset on late master promotion | `designateAsMaster()` context function bypasses stale `stewardIdentity` closure |
| KI-2 | Master badge missing after self-assignment | Same root cause as KI-1; resolved by the same fix |

---

## build-20260618-1811 — KI-5 font-size uplift + KI-9 conflict card context

**Date:** 2026-06-18

| Activity | Discussion | Design / Plan | Coding | Testing |
|----------|-----------|--------------|--------|---------|
| KI-5 font-size uplift (14 px → 16 px) | 5 min | — | 3 min | |
| KI-9 conflict card context + "Show all fields" toggle | 10 min | 15 min | 15 min | |
| KI-4 check (already fixed in prior refactor) | 5 min | — | — | |
| **Total** | **20 min** | **15 min** | **18 min** | |

**Design documents produced:**

| Document | Status |
|----------|--------|
| `designs/DESIGN_KI9_conflict_card_context.md` | Complete |

**Issues resolved:**

| # | Title | Resolution |
|---|-------|-----------|
| KI-4 | Table Profiling copy errors | Already fixed in a prior refactor; no code change needed |
| KI-5 | 14 px base font readability | Font-size uplifted to 16 px in `00_styles.css` |
| KI-9 | Conflict cards missing record context | Context cols (up to 3) above diff section + "Show all fields" toggle added |

---

_Testing times to be added by user after browser validation._
