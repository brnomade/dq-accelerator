# Changelog

Records high-level changes delivered in each build. Most recent release is listed first.

---

## build-20260722-1836 — Fix: Dashboard integrity issue list now fully scrollable

### Changed
- **Dashboard — Data Integrity section** — the issue list is now a fixed-height scrollable panel (approx. 10 rows visible at a time) showing all issues. Each row has a row number for easy reference. The previous hard cap of 50 items with a "...and N more" footer has been removed.

---

## build-20260722-1810 — Feature: Single-Table CSV Import

### Added
- **Import — Single Table CSV tab** (master only) — new third tab on the Import screen allowing a master steward to replace the contents of any single table by uploading a CSV backup file. The table is fully flushed and repopulated from the file; no upsert or merge.
- **Import — Table detection from filename** — the table is identified automatically from the CSV filename (must match a SCHEMA table name, e.g. `critical_data_element.csv`). An error is shown if the filename does not match.
- **Import — Pre-commit preview panel** — before replacing, a panel shows the table label, current row count, incoming row count with a delta badge, and any FK integrity warnings in both directions (outbound: incoming rows reference non-existent PKs in other tables; inbound: existing rows in other tables will be orphaned after the replace). Warnings are informational and do not block the import.
- **`validateCsvReplace()` utility** (`20_data_utils.js`) — new function that cross-validates a set of incoming rows against the current in-memory data in both FK directions. Returns an array of warning objects consumed by the preview panel.

### Behaviour
- CSV parsing reuses the existing `importSheet()` and `coerceValue()` pipeline via SheetJS (`XLSX.read(text, { type: 'string' })`); no new parsing code was required.
- After replace, `onImport()` is called with the patched data object (all other tables unchanged), which triggers `buildLookups()` and localStorage save through the existing context machinery.
- The tab is only rendered for master users (`isMaster === true`); stewards do not see it.

---

## build-20260721-2211 — Feature: Dashboard Data Integrity improvements

### Added
- **Dashboard — Data Integrity section** — PK duplicate detection added to `runHealthCheck` (previously only FK violations were checked). All 18 tables are now checked for both duplicate PKs and FK violations; the previous 5-table scope in `computeStewardGaps` has been replaced with a comprehensive per-table scope map covering all SCHEMA tables.
- **Dashboard — Master Steward** — Data Integrity section is now always visible when a steward identity is set, regardless of whether they have personal CDS assignments. Master stewards see all issues across the entire database (`allIssues`); regular stewards see only issues scoped to their data (`scopedIssues`). The section header includes a `(full database)` label for masters.
- **Dashboard — Data Integrity section** — Issue list limit raised from 30 to 50. Empty state message is context-aware ("...in the database" for master, "...in your scope" for regular stewards).

---

## build-20260721-2135 — Feature: Data Browser FK integrity indicators

### Added
- **Data Browser — table list** — warning icon moved to a fixed-width column to the left of the table name, so all names align regardless of whether a table has errors. Icon now covers both duplicate PK errors and FK integrity errors. Tooltip lists all issues for the table (duplicate PKs on one line, each unresolved FK column on its own line).
- **Data Browser — toolbar** — FK error count shown as a separate red badge alongside the existing duplicate PK badge when the selected table has FK integrity issues (e.g. `3 FK errors`).
- **Data Browser — row grid** — rows with at least one unresolved FK value are highlighted with the same red background (`--red-bg`) as duplicate PK rows.

---

## build-20260721-2129 — Feature: Import FK integrity check

### Added
- **Import — FK integrity validation** — `importWorkbook` now runs a second pass after all sheets are loaded, checking every foreign key column in every table against the PK set of the referenced table. Any FK value that cannot be resolved (i.e. the referenced record does not exist in the imported data) is reported as an `err`-level log entry, e.g. `data_quality_rule_allocation.critical_data_set_id: 3 unresolved FK values not found in critical_data_set (12, 45, 99) -- fix the source data and re-import`. Null FK values are skipped (optional FK). The check covers all SCHEMA-defined FK relationships automatically with no hardcoding.

---

## build-20260721-2122 — Feature: Data Browser bulk retire / un-retire via checkboxes

### Added
- **Data Browser — row selection** — each data row now has a checkbox in a new leftmost column. A header checkbox selects or deselects all rows in the current filtered view; it shows an indeterminate state when only some rows are selected.
- **Data Browser — Retire / Un-retire button** — a context-sensitive button appears in the toolbar. When only live rows are selected it reads "Retire selected"; when only retired rows are selected it reads "Un-retire selected". When both live and retired rows are selected simultaneously it reads "Mixed selection" and is disabled. When nothing is selected it is disabled. After the action completes the selection is cleared.
- **`240_app.js`** — new `bulkSetRetiring(tableName, pkValues, retire)` context function performs a single `setData` call to retire or un-retire a Set of PK values, keeping the per-row Undo button unchanged.

---

## build-20260721-2112 — Fix: Data Browser duplicate row indicator — colour only, no icon

### Changed
- **Data Browser — row grid** — removed the warning icon and red PK cell colour from duplicate rows. Row background colour (`--red-bg`) is sufficient to identify duplicates; the icon was visual noise.

---

## build-20260721-2110 — Feature: Data Browser flags duplicate PKs in table list and row grid

### Changed
- **Data Browser — table list** — tables with duplicate primary key values now show a red warning icon (`Icon.Warning`) to the right of the row counter. Hovering the icon shows a native tooltip listing the count and the specific duplicate PK values (e.g. `2 duplicate PKs: 182, 183`).
- **Data Browser — toolbar** — when the selected table has duplicate PKs, a red warning summary appears in the toolbar between the table name and the filter input (e.g. `2 duplicate PKs`).
- **Data Browser — row grid** — rows whose PK value is duplicated are highlighted with a red background (`--red-bg`) and the PK cell value is coloured red with a warning icon and tooltip `Duplicate PK`. Row keys changed from `row[pkField]` to the array index `ri` to avoid React duplicate-key warnings when the same PK value appears multiple times.

---

## build-20260721-2104 — Fix: Import Proceed button style and label

### Fixed
- **Import screen — Proceed button** — button was missing the `btn` base class, giving it inconsistent styling. Now uses `btn btn-primary` to match all other primary action buttons in the app. Label shortened from "Proceed to Dashboard" to "Proceed".

---

## build-20260721-2101 — Feature: Import requires explicit Proceed to Dashboard after every import

### Changed
- **Import screen** — the screen no longer auto-navigates to the dashboard after an Excel import. Instead, a "Proceed to Dashboard" button appears below the import log once the import finishes. This gives the steward time to read all log messages (including duplicate PK errors) before moving on. The button is always shown after a completed import, regardless of whether the log contains errors or only info entries.

---

## build-20260721-2059 — Fix: Import stays on screen when errors are present

### Fixed
- **Import — error visibility** — `handleImport` in `240_app.js` was navigating to the dashboard immediately after every Excel import, regardless of whether the import log contained errors. This meant duplicate PK error messages (and any other `err`-level log entries) were never visible to the user. The fix: navigation to the dashboard is now suppressed when the import log contains at least one `err`-level entry, keeping the steward on the Import screen so the errors are readable.

---

## build-20260721-2052 — Fix: Import validation detects and reports duplicate primary keys

### Fixed
- **Import — duplicate PK detection** — `importWorkbook` in `20_data_utils.js` now scans each imported table for duplicate primary key values after loading rows from the Excel sheet. If duplicates are found the import log emits an `err`-level entry (shown in red in the Import screen) listing the table name, PK field, count, and the specific duplicated IDs (e.g. `cde_criticality: 2 duplicate PKs found (cde_criticality_id: 182, 183) -- fix the source data and re-import`). Non-duplicate tables still receive the normal `info`-level row count entry. The import continues so the steward can see all problems in one pass, but the red error messages make it unmissable that the data must be corrected before use.

---

## build-20260721-2017 — Feature: Data Browser table list shows live/total row counts

### Changed
- **Data Browser — table list row counter** — each table row now shows `live/total` instead of `active +retired`. The active (live) count is shown first; the total (active + retired) follows after a `/`. When there are no retired rows the fraction is shown in muted text; when retired rows exist the total is shown in amber, giving a quick visual signal of how many rows have been soft-deleted per table.

---

## build-20260721-2013 — Fix: Data Browser header transparent background

### Fixed
- **Data Browser — sticky header** — two undefined CSS variables (`--surface`, `--row-hover`) were used in `215_screen_databrowser.js`. Neither is declared in `:root`, so both resolved to `transparent`, making the column-header row see-through as data rows scrolled beneath it. Replaced `--surface` with `--bg2` and `--row-hover` with `--bg3`, which are the correct defined variables for panel surfaces and hover/selected states respectively.

---

## build-20260721-1949 — Fix: Steward identity cleared on reset; duplicate Profiling menu removed

### Fixed
- **Reset Data — steward identity** — pressing Reset Data now clears the steward identity, base version, and base snapshot from localStorage and React state. Previously only the main data store was cleared, leaving a stale identity that could mismatch the newly imported dataset.
- **Sidebar — duplicate Profiling item** — the Data Quality Elements group had a hardcoded "Profiling" link to `source_table_ddl` that became a duplicate after the dedicated Profiling group was added in build-20260717-1655. The hardcoded entry has been removed; the Profiling group is now the sole sidebar entry for that screen.

---

## build-20260721-1758 — Feature: Data Browser screen for master stewards

### Added
- **Data Browser** — new master-only screen accessible from the sidebar between Import and the table-group separator. Provides a raw database-client view of all 22 SCHEMA tables without any FK resolution, display labels, or edit actions. Left panel lists all tables alphabetically with active row count and retired row count (in amber). Right panel shows the selected table in a sortable grid using physical column names (`col.name`); PK columns carry an amber `PK` badge, FK columns carry a blue `FK` badge; clicking any column header sorts ascending then descending with an arrow indicator. A free-text filter bar narrows rows by any field value. A "Show retired" toggle (default off) reveals soft-deleted rows with an amber tint; each retired row shows an "Undo" button that calls `restoreRecord` to clear the `retiring_timestamp`.

---

## build-20260721-1731 — Feature: Conflict card redesigned as physical 3-column diff table

### Changed
- **Delta import — conflict card** — the two-panel side-by-side layout has been replaced with a unified 3-column diff table (`field | master | steward`). All field names now show the raw physical column name (`col.name`) instead of the display label. The table header shows the physical table name and PK field name (`cde_criticality · cde_criticality_id: 182`) instead of the display label. The PK field is now the first visible row with an amber `PK` badge and is always shown. Changed rows are highlighted with a subtle amber row tint; steward changed values are shown in green. Default collapsed view shows PK row + changed rows only; "Show all fields" expands to all columns. Retire conflicts show all master rows so the master steward can see what would be lost, with an amber notice row and the "Show all fields" toggle hidden.

---

## build-20260721-1659 — Fix: DQ Assistant no longer generates spurious LIMIT in sql_code_sample

### Fixed
- **DQ Assistant — output format prompt** — the `sql_code_sample` field was described only as "Optional: simplified SQL for technical reference", causing the AI to fill it in with a `SELECT ... LIMIT 100` row-level query on every rule it generated. The description is now replaced with an explicit note that explains the field's true purpose (custom denominator for bounded rules), when it must be `null` (the common case), what form it must take when populated (`COUNT(*)` with a matching bounding condition), and that `LIMIT` is never valid here. The default in the output format template is now `null`.

### Documentation
- **User guide — Rules Explorer** — corrected the SQL sample field description in the "How to add or edit a rule" page. The previous description ("row-level sample alongside the aggregate check") was misleading.
- **User guide — Rules Explorer** — new guide page "When to use the SQL sample field" added, covering how the failure rate is calculated, what the default universe is, the bounded-rule scenario that warrants a custom denominator, and the rules for what sql_code_sample must contain.

---

## build-20260717-1655 — Fix: All 22 tables now exportable for master users; Profiling group added

### Fixed
- **Export screen — master view** — five tables were missing from the per-group and per-table export sections: `critical_data_set`, `data_quality_rule`, `data_quality_rule_allocation`, `cde_criticality`, and `stewardship`. All are now included.

### Changed
- **TABLE_GROUPS** — `critical_data_set`, `data_quality_rule`, `data_quality_rule_allocation`, `cde_criticality` added to the **Data Quality Elements** group; `stewardship` added to **Ownership Hierarchy**; `source_table_ddl` and `field_profiling` moved out of Data Quality Elements into a new dedicated **Profiling** group. All 22 schema tables are now represented across the 5 export groups.

---

## build-20260717-1642 — Feature: Export screen simplified for non-master users

### Changed
- **Export screen — non-master view** — users who are not the master steward now see only two export options: **Delta export** and **Backup export**. The per-group and per-table CSV export sections are hidden for non-masters and remain visible only to the master steward.
- **Export screen — Delta export card** — the delta export card is now always visible to non-master users, even when no steward identity has been set. In that state it shows a prompt: "Set your steward identity in Settings to enable delta export." Previously the card was hidden entirely.
- **Export screen — Backup export** — the "Export configuration" card is renamed to "Backup export" and its button label changed from "Export all N tables as zip" to "Export backup". The soft-deleted toggle remains as a single control affecting the backup zip content.

---

## build-20260717-1631 — Feature: Rule Generator Step 3 mini RAG preview

### Changed
- **Rule Generator — Step 3 suggestion cards** — the frequency dropdown and bumper stepper have been removed from each suggestion card. In their place, a compact inline RAG preview lets data stewards enter a sample size and a failing record count and instantly see the resulting RAG badge (GREEN / AMBER / RED) together with the green and amber pass-rate thresholds derived from the CDE's criticality scores. When no criticality is defined for the selected CDE, the calculator area shows "RAG score unavailable - no criticality is defined for this CDE" instead of the inputs.

---

## build-20260717-1549 — Fix: Rule Generator CDE prefix now includes the actual field name

### Fixed
- **Rule Generator prompt — CDE prefix naming** — the AI was producing rule names with the literal prefix `CDE -` instead of substituting the actual field name. The prompt now instructs the AI to use `CDE {field_name} - ` (e.g. `CDE staff_id - values must be unique`) and provides a concrete example in the rule_name hint. The field name is interpolated into the prompt at generation time so the AI has no ambiguity about what to substitute.

---

## build-20260717-1539 — Feature: NEW pill on Rule Generator suggestion cards

### Changed
- **Rule Generator — Step 3 suggestion cards** — new rule suggestions now show a green **NEW** pill at the start of the card header, mirroring the existing blue **REUSE EXISTING** pill. Every suggestion card now opens with an unambiguous intent label before the dimension badge.

---

## build-20260717-1442 — Feature: CDS context tooltip on Profiling field rows

### Changed
- **Profiling page — field rows** — the CDE and CDE+SQL origin badges now carry a hover tooltip listing every Critical Data Set the field belongs to, formatted as `Agency / CDS name` (one line per CDS). No new column is added. SQL-only fields have no tooltip. The change helps data stewards navigate directly to the correct CDS in the Rule Generator after profiling a field.

---

## build-20260716-1934 — Feature: Incomplete Definitions dashboard card is now expandable

### Changed
- **Incomplete Definitions card** — the Dashboard card now uses the expandable pattern. The count badge can be expanded to reveal a drillable list of each CDE missing a definition or explanation, showing the CDE name and the CDS it belongs to. Each item navigates to the Data and Stewardship table.

---

## build-20260716-1911 — Feature: Uncovered Dimensions dashboard card is now expandable

### Changed
- **Uncovered Dimensions card** — the Dashboard card now uses the expandable pattern (same as Undocumented CDS). The count badge can be expanded to reveal a drillable list of each uncovered quality dimension by name and acronym. Each item navigates to the Rules Explorer.

---

## build-20260716-1905 — Feature: Ownership Hierarchy, Weights & Thresholds, Core Settings are Master-only

### Changed
- **Master-only sidebar sections** — the Ownership Hierarchy, Weights & Thresholds, and Core Settings navigation groups are now hidden from non-master (steward) users. They remain fully visible to master users. The Data Quality Elements group is unaffected and visible to everyone. No hard redirect is applied if a steward is already on one of those screens when this takes effect.

---

## build-20260716-1852 — Fix: My Data filter in Rules Explorer hides unrelated rules

### Fixed
- **My Data filter scope** — when My Data is active, rules with no allocations linked to the steward's CDSes are now excluded from the list entirely. Previously those rules were still shown with empty allocation counts, making the filter ineffective at narrowing the view.

---

## build-20260716-1850 — Polish: MANUAL toggle state uses amber styling

### Changed
- **MANUAL button colour** — the AUTOMATED/MANUAL toggle on each rule row now uses amber (`var(--amber)`) for the MANUAL state, matching the brightness and weight of the AUTOMATED state. Previously MANUAL was rendered in faint grey.

---

## build-20260716-1833 — Bug fix: rule automated flag defaults to true; toggle in Rules Explorer

### Fixed
- **Automated default** — new Data Quality Rules now default `automated = true`. Previously they always defaulted to false, meaning newly created rules were silently excluded from the DQ engine.

### Changed
- **Automated toggle in Rules Explorer** — the static yellow "AUTOMATED" badge on each rule row has been replaced with a clickable AUTOMATED / MANUAL toggle button. Green when automated, grey when manual. Clicking it flips the flag immediately without opening the edit form. Disabled in read-only mode.

---

## build-20260716-1825 — Bug fix: adding an agency now auto-creates weight rows

### Fixed
- **Missing weight rows on new agency** — adding an Executive Agency now automatically creates one `quality_dimension_weight` row and one `criticality_group_weight` row for every active quality dimension and criticality group, each with `weight_value = 1`. Previously the user had to populate these manually or they remained absent, breaking RAG scoring for that agency.

---

## build-20260716-1816 — Bug fix: CDE criticality fields default to Medium on Add

### Fixed
- **CDE criticality defaults** — when adding a new CDE, all criticality group dropdowns now pre-select "Medium". Previously they were blank, causing zero `cde_criticality` rows to be written if the user did not manually choose a level, which made the CDE invisible in views that require criticality data.
- Applied consistently in both the Add CDE form (`CriticalDataElementFormPanel`) and the standalone criticality bulk-edit panel (`CdeCriticalityFormPanel`). If the Medium level is absent from reference data, both forms fall back to the previous blank behaviour.

---

## build-20260716-1800 — Bug fix: delta export now includes all 22 SCHEMA tables

### Fixed
- **Delta export missing tables** — `DELTA_TABLES` previously tracked only 7 tables (`critical_data_element`, `data_quality_rule`, `data_quality_rule_allocation`, `cde_criticality`, `stewardship`, `source_table_ddl`, `field_profiling`). New CDS records created by a steward were absent from the delta, leaving dangling FK references in CDE and stewardship rows on import to master. `DELTA_TABLES` now covers all 22 SCHEMA tables: the full 18-table standard data model plus `shortlist_group`, `cde_shortlist_tag`, `source_table_ddl`, and `field_profiling`.

---

## build-20260709-1929 — Rule Generator: My Data filter; shared useMyDataScope hook

### What's new
- **My Data toggle** added to the Rule Generator Step 1 panel, identical behaviour to the RAG Simulator: restricts Agency, Directorate, and CDS dropdowns to the steward's assigned scope. Default ON for regular stewards, OFF for masters.

### Refactor
- **`useMyDataScope` custom hook** extracted to `20_data_utils.js`. Encapsulates `myDataOnly` state, localStorage persistence, and the three scope sets (`scopeCdsIds`, `scopeDirIds`, `scopeAgencyIds`). The RAG Simulator now uses this hook instead of its previous inline implementation, eliminating duplication.

---

## build-20260709-1906 — RAG Simulator: My Data filter and score display improvements

### What's new
- **My Data toggle** added to the RAG Simulator Step 1 panel. When active, the Agency, Directorate, and CDS cascading dropdowns are restricted to the scope assigned to the current steward via the stewardship table. Default is ON for regular stewards, OFF for master stewards. Toggle is hidden when no steward identity is configured.

### Fixed
- **Weighted criticality score** — the overall score now uses per-agency group weights from the `criticality_group_weight` table. Previously a plain average was used, ignoring configured weights. Falls back to equal weighting when no weight rows exist for the agency.
- **Score label** — the Overall score box now shows the human-readable criticality level (Very Low / Low / Medium / High / Very High) instead of `/ 25`.
- **Score box alignment** — both the Overall score and Relative score boxes are now horizontally centred with consistent font sizes and accent colours.

---

## build-20260701-2151 — Documentation: dashboard guide updated and style fixed

### Fixed
- **Dashboard guide** (`dashboard/understand-dashboard.html`) updated to describe the expandable Undocumented CDS card and its pre-filtered navigation behaviour.
- Header template on the dashboard guide now matches all other sub-pages: `&larr; User Guide` back link replaces the old `USER GUIDE` badge; `justify-content:space-between` added to header; CSS class names and layout aligned to the current guide template.
- Related guides section added at the bottom.

---

## build-20260701-2143 — Dashboard: expandable Undocumented CDS card with pre-filtered navigation

### What's new
- **Undocumented CDS card** on the Dashboard is now expandable. Clicking the card reveals an inline list of each CDS that is missing a description, with its agency acronym as a sub-label.
- Clicking a CDS name in the list navigates to the Data and Stewardship page with the search box pre-filled with that CDS name, immediately scoping the view to that set.
- **`ExpandableActionCard`** component added to `220_screen_dashboard.js`. Generic pattern (`items: [{ label, sublabel?, navigateTo }]`) ready to reuse for other dashboard metrics that need drillable lists. Presence of `items` on a card definition selects this variant; absence keeps the existing `ActionCard` behaviour.
- **`CriticalDataElementView`** now accepts an optional `initialSearch` prop, seeding its search state on mount. Passed from the router via `route.initialSearch`.

---

## build-20260701-2123 — Dashboard: fix Undocumented CDS navigation

### Fixed
- **Undocumented CDS card** on the Dashboard now navigates to the Data and Stewardship page (`critical_data_element`) instead of the retired "Critical Data Set" generic table view. (KI-29 partial fix — navigation corrected; actionability improvement for b) deferred to backlog item C.)

---

## build-20260701-2101 — My Data toggle: consolidated across all screens

### What's new
- **Shared utilities** added to `20_data_utils.js`: `getMyStewardCdsIds()`, `loadMyDataPref()`, `saveMyDataPref()` — single source of truth for all scope-filter logic
- **`MyDataToggle` component** added to `70_header_footer.js` — one pill-button widget used by all four screens; accent passed as prop, no alpha hex concatenation
- **Consistent behaviour across all screens**: default `true` for regular stewards, `false` for masters (masters see all data by default, can opt in); all four screens now persist state to localStorage using `'1'`/`'0'` serialisation
- **Data and Stewardship** (`141`): toggle now persisted (`moj_dq_cde_mydata_v1`); state renamed `myDataOnly`; `isMaster` guard removed from CDS derivation
- **Rules Explorer** (`145`): state init and persistence replaced with shared helpers; `isMaster` guard removed
- **Profiling** (`200`): fixed default (was `false`, now respects master/steward role); fixed serialisation (was `'my'`/`'all'`, now `'1'`/`'0'`); `isMaster` guard removed
- **Organisation** (`100`): label+toggle replaced with `MyDataToggle` pill; state init and persistence replaced with shared helpers

---

## build-20260701-2044 — Organisation page: My Data toggle added

### What's new
- **My Data toggle** added to the Organisation page header, on by default
- When on, only agencies containing CDS assigned to the identified steward are shown; when off, all agencies are shown
- Toggle state is persisted in localStorage (`moj_dq_org_mydata_v1`)
- Toggle label highlights in accent colour when active, matching the Rules Explorer pattern

---

## build-20260701-2037 — Rules Explorer: My Data toggle on by default

### Fixed
- The My Data toggle in the Rules Explorer now defaults to **on** for users who have never toggled it (previously defaulted to off). Users who have explicitly toggled it retain their saved preference.

---

## build-20260701-2032 — Dashboard: Undocumented CDS card added

### What's new
- 9th action card added: **Undocumented CDS** — flags CDS records in the steward's portfolio that have no description set; navigates to the Critical Data Set table on click
- User documentation for the Dashboard screen created (`dashboard/understand-dashboard.html`); Dashboard section added to user guide index

---

## build-20260701-2021 — Dashboard: steward action centre

### What's new
- Dashboard completely redesigned as a personal gap-analysis view for the identified steward
- **Identity bar** — shows steward name, CDS count, agency, and Master badge when applicable
- **8 action cards** — Unowned CDSes, Empty CDSes, Unprotected CDSes, Unprotected CDEs, Unprofiled CDEs, Unrated CDEs, Incomplete Definitions, Uncovered Dimensions; each navigates to the relevant screen
- **All clear banner** — replaces cards when no gaps found
- **Rule coverage by quality dimension** — one progress bar per dimension, amber on zero coverage
- **My CDSes table** — per-CDS summary with CDE, rule, rated, and profiled counts; amber/green row borders
- **Data integrity section** — collapsible, scoped to steward's CDEs/CDSes, reuses FK check logic
- Empty states for no data, no identity, and no CDS assignments (with Master-specific messaging)

---

## build-20260701-1847 — Sidebar: RAG Simulator and Rule Generator moved into Data Quality Elements group

### What's new
- RAG Simulator and Rule Generator are now sub-items of the **Data Quality Elements** sidebar group (green), removed from the top-level nav
- Group item order: Data and Stewardship → RAG Simulator → Rule Generator → Rules Explorer → Profiling

---

## build-20260701-1832 — Organisation page: CDS pill baseline alignment fix

### Fixed
- CDS pill now aligns by text baseline with the CDS name (`alignItems:'baseline'`), so the pill text and name text sit on the same optical line

---

## build-20260701-1825 — Organisation page: CDS row single-column layout

### What's new
- CDS row is now a single-column layout: `[CDS pill]` top-aligned, then to its right: name + dot separator + stats on row 1; stewards stacked on row 2; description on row 3 aligned left with the steward pills
- Removed side-by-side description column — description always appears below stewards regardless of length

---

## build-20260701-1818 — Organisation page: CDS row layout restructured

### What's new
- CDS row column 1 now uses a flex anchor layout: `[CDS pill]` pins the left edge; name + stats appear inline on row 1 to its right; stewards appear on row 2 naturally aligned under the CDS name
- Steward role pill left-aligns with the CDS name without any hardcoded pixel offset

---

## build-20260701-1814 — Organisation page: CDS stat line always shows full counts

### Fixed
- CDS stat line now always shows CDE count, rule count and profiling — consistent with Agency and Directorate levels
- Zero-CDE case now reads "0 CDEs · 0 rules · no CDEs profiled"

---

## build-20260701-1810 — Organisation page: profiling label and CDE pluralisation fixes

### Fixed
- "no CDEs defined" replaced with "no CDEs profiled" across all levels (Agency, Directorate, CDS) — applies to both the zero-CDEs case and the zero-profiled case
- CDE count now pluralises correctly at Agency level (`N CDE` → `N CDEs`) and Directorate level, matching the CDS level

---

## build-20260701-1800 — Organisation page: CDS stat line redundant zero-CDE counts removed

### Fixed
- When a CDS has no CDEs, stat line now shows only "no CDEs defined" instead of "0 CDEs · 0 rules · no CDEs defined"

---

## build-20260701-1758 — Organisation page: CDS container borders removed, indentation increased

### Fixed
- Removed top and left borders from CDS container (visual noise)
- Increased CDS block indentation (paddingLeft 32 → 48)
- Steward pill and name indented an additional 16px relative to CDS name

---

## build-20260701-1754 — Organisation page: CDS visual hierarchy and type badge

### What's new
- CDS block is now indented further (paddingLeft 20 → 32) and has a faint left border to visually subordinate it beneath the directorate
- Each CDS entry shows a neutral grey `[CDS]` type pill before the name to distinguish data artefacts from org units

---

## build-20260701-1734 — Organisation page: CDS table steward pill fix, description alignment, no headers

### Fixed
- Steward role pill now renders correctly — was using `var(--purple)` CSS variable which broke the hex-appended alpha values (`color+'18'`); changed to `#7c5cbf` hex to match patron/owner pill pattern
- CDS description column now aligns to the top of its grid cell
- Removed "Stewards" / "Description" column headers from the CDS table

---

## build-20260701-1726 — Organisation page: CDS table redesign with stats and steward layout

### What's new
- Each CDS entry in the expanded directorate now shows: line 1 CDS name (bold), line 2 stat line (CDEs · rules · profiling %), then a 2-column layout below
- 2-column layout: left column shows stewards as `[Role pill] Name` stacked vertically; right column shows description
- Per-CDS CDE count, rule count and profiling % computed from `critical_data_element` and `data_quality_rule_allocation` filtered by CDS

---

## build-20260701-1711 — Organisation page: CDS table column order and steward stacking

### Fixed
- CDS table column order is now Stewards | Name | Description
- Multiple stewards on a CDS now stack vertically (one per line) instead of wrapping side-by-side

---

## build-20260701-1707 — Organisation page: directorate row expansion with CDS table

### What's new
- Directorate rows in the expanded agency view are now individually expandable — click to reveal or hide
- Chevron on each directorate row rotates 90deg on expand to indicate open state
- Patron row removed from expanded agency view (patron is already visible in the agency subtitle line)
- Directorate collapsed view shows 2-line layout: name + `[Owner]` pill with owner name (or "none assigned") and flat stat line (stewards · CDS · CDE · rules · profiling)
- Directorate expanded view shows a read-only 3-column CDS table: Name | Description | Stewards per CDS
- CDS rows sorted by name ascending; each CDS shows its own assigned stewards as person chips
- Empty states handled: "No critical data sets found." when directorate has no CDS; "—" chip when a CDS has no stewards

---

## build-20260701-1650 — Organisation page: "dir" expanded to "directorate/directorates"

### Fixed
- Stat line now shows full word: "1 directorate", "3 directorates" — no abbreviations

---

## build-20260701-1648 — Organisation page: fix dot separator rendering

### Fixed
- Stat line separators now render as middle dot characters instead of literal `·` text; replaced escape sequence approach with `String.fromCharCode(183)` which is ASCII-safe and unambiguous

---

## build-20260701-1642 — Organisation page: agency row restructure

### What's new
- Agency row now shows patron name and all stats on a single subtitle line below the agency name, replacing the previous pill boxes
- Stat line order: dir &middot; owners &middot; stewards &middot; CDS &middot; CDE &middot; rules &middot; profiling
- Profiling expressed as a percentage of CDEs (not raw count): shows "no CDEs defined", "no CDEs profiled", "XX% profiled", or "100% profiled" (green)
- Directorate rows (expanded view) show the same flat stat line scoped to that directorate, including "1 owner" or "no owner"
- ERD constraints documented in code: at most one active patron per agency; at most one data owner per directorate

---

## build-20260701-1516 — Reset data: two-stage confirmation when unsaved delta changes exist

### What's new
- Clicking **Reset data** now checks for pending delta changes before proceeding
- If no changes exist: single confirmation as before ("Yes, reset")
- If unsaved delta changes exist: first prompt warns with the count of changes and recommends exporting; clicking **Reset anyway** triggers a second prompt requiring an explicit "Yes, discard and reset" to proceed

---

## build-20260701-1450 — Rule Generator: rename "Test It" button to "Copy SQL"

### What's new
- Step 3 of the Rule Generator now shows a **Copy SQL** button instead of "Test It", more accurately reflecting the action (copies resolved SQL to clipboard)

---

## build-20260701-1433 -- User Guide: Rule Generator section (2 guides)

### What's new

- **New documentation section: Rule Generator** added under `documentation/user-guide/rule-generator/` with 2 guides:
  - `generate-suggestions.html` &mdash; full Steps 1 and 2 workflow: cascade-select a profiled CDE, check profiling status in the summary card, click Build suggestion prompt, send to Claude or Copilot, paste the JSON response, click Parse response. Includes prerequisite amber warning about field profiling and a note on what the prompt contains.
  - `review-add-rules.html` &mdash; Step 3 review workflow: two card types (new rule vs. REUSE EXISTING), all four conflict warning types (dimension covered, duplicate name, similar name, rule not found), adjusting name/dimension/frequency/bumper before adding, Test It button (copies composed SQL for Athena), adding individually or all at once, managing mistakes via Rules Explorer.
- **Index updated:** new "Rule Generator" section added before Tools &amp; Advanced Features; user-guide zip now contains 45 files.

---

## build-20260701-1418 -- User Guide: RAG Simulator section (2 guides)

### What's new

- **New documentation section: RAG Simulator** added under `documentation/user-guide/rag-simulator/` with 2 guides:
  - `run-simulation.html` &mdash; full two-step workflow: cascade-select a CDE, read the criticality panel, optionally adjust criticality levels, enter sample size and failing count per rule, read pass rate and RAG badges, save adjusted bumpers or criticality back to the data.
  - `rag-calculation.html` &mdash; methodology reference: criticality group scores (0/6/12/17/25), overall score (average), relative score (4% per point on 0&ndash;25 scale), bumper adjustment formula, AMBER threshold (GREEN &minus; 10%), worked example with three outcome scenarios.
- **Index updated:** new "RAG Simulator" section added before Tools &amp; Advanced Features; user-guide zip now contains 43 files.

---

## build-20260701-1411 -- User Guide: Rules Explorer section (4 guides)

### What's new

- **New documentation section: Rules Explorer** added under `documentation/user-guide/rules-explorer/` with 4 guides:
  - `navigate-rules-explorer.html` &mdash; explains the rule-first hierarchy (Rule &rarr; Agency &rarr; CDS &rarr; Table &rarr; CDE), what each rule row shows (name, explanation, AUTOMATED badge, counts), how rules with no allocations behave, expanding/collapsing, search, My data filter, and Show retired toggle.
  - `rule-add-edit.html` &mdash; how to add a rule (Add rule button &rarr; form panel), edit a rule (pencil icon), retire and restore. Full field reference including SQL code requirements (must contain SELECT), SQL sample, source link, and Automated flag.
  - `allocation-manage.html` &mdash; how to edit, retire, and restore individual allocations inline from the Rules Explorer hierarchy; clarifies that new allocations must be created from Data and Stewardship.
  - `view-sql.html` &mdash; how to open the SQL viewer for a specific allocation; button state table (active, DEF badge, disabled); token substitution reference (&#123;table&#125;, &#123;field&#125;, &#123;database&#125;, &#123;snapshot&#125;).
- **Index updated:** new "Rules Explorer" section added between Data and Stewardship and Data Quality Elements; user-guide zip now contains 41 files.

---

## build-20260701-1359 -- User Guide: Data and Stewardship section (6 guides)

### What's new

- **New documentation section: Data and Stewardship** added under `documentation/user-guide/data-stewardship/` with 6 guides:
  - `navigate-hierarchy.html` &mdash; explains the four-level collapsible hierarchy (Agency &rarr; CDS &rarr; Table &rarr; CDE), the summary counts at each level, search, and toolbar options.
  - `cds-add.html` &mdash; how to add a Critical Data Set (CDS), including field reference and the prerequisite that a directorate must exist first.
  - `cde-add.html` &mdash; how to add a Critical Data Element, covering all three entry points (header, per-CDS, per-table), the Table Library dropdown vs. manual entry, the snapshot filter requirement, and optional criticality ratings.
  - `cde-edit-retire.html` &mdash; how to edit a CDE, retire it, and restore a retired CDE using the Show retired toggle.
  - `rule-allocate.html` &mdash; how to assign a data quality rule to a CDE, view the expanded allocations list (rule, dimension, frequency, bumper value, SQL buttons), and edit or retire individual allocations.
  - `my-data.html` &mdash; how the My data filter works, its prerequisites (steward identity + CDS assignment), and that it auto-enables for non-master stewards with assignments.
- **Index updated:** new "Data and Stewardship" section added between Ownership Hierarchy and Data Quality Elements; old "Data Quality Elements" section comment updated.

---

## build-20260701-1346 -- User Guide: align load-master-data with import-master

### What's new

- **getting-started/load-master-data.html updated:** lead paragraph now states "load the latest version" and notes that the highest version number is always correct. Step 2 gains a sub-note with the filename format (`dq_master_master-YYYYMMDD-NNN.json`) and a cross-reference to the full version-identification guide in Import &amp; Export. Related links section adds a pointer to `import-export/import-master.html`.
- All cross-references audited: Getting Started guides consistently link within Getting Started; Import &amp; Export guides consistently link within Import &amp; Export. Both sections are linked from the index. No broken or mis-directed references found.

---

## build-20260701-1340 -- User Guide: import-master guide updated with version identification

### What's new

- **import-master.html updated:** added a dedicated "Identifying the correct file" section with the full filename convention (`dq_master_master-YYYYMMDD-NNN.json`), an explanation of both parts (date and daily sequence), a visual example showing four files ranked from oldest to newest with a "use this one" badge on the latest, and a note explaining the consequence of loading an older version (version-mismatch warnings on merge).

---

## build-20260701-1335 -- User Guide: Import & Export section (3 pages) + backlog item

### What's new

- **3 Import &amp; Export guides added** under `documentation/user-guide/import-export/`: import the master data file, export your delta, generate the CSV package for Athena upload.
- **CSV package guide** marks the Athena export as a master-steward-only action and notes the application gate is pending a future update.
- **Index updated:** Import &amp; Export section now lists all 3 guides (previously empty).
- **Backlog item EXPORT-CSV-GATE added:** restrict the CSV/ZIP export buttons to `isMaster` check; currently gated only by `canEdit`. Includes full implementation detail.
- **Zip updated:** Build now bundles 31 user-guide files.

---

## build-20260701-1325 -- User Guide: Table & Field Profiling section (8 pages)

### What's new

- **8 how-to guides added** under `documentation/user-guide/profiling/`, covering Table Library management and field profiling workflows.
- **Table Library guides (3):** add a table (DDL from Athena &rarr; parse &rarr; verify), edit a table profile (re-profile after schema change), remove a table.
- **Field Profiling guides (5):** profile a field (semantic type &rarr; 6 SQL queries &rarr; notes &rarr; save), update an existing profile, filter by status (Tables Pending / Fields Pending / Blind Rules / Profiled), scope to own data (My Data toggle), copy generated SQL.
- **Index updated:** new "Table &amp; Field Profiling" section added between "Import &amp; Export" and "Tools &amp; Advanced Features", listing all 8 guides.
- **Zip updated:** Build now bundles 28 user-guide files.

---

## build-20260701-1310 -- User Guide: Getting Started section (4 pages)

### What's new

- **4 Getting Started guides added** under `documentation/user-guide/getting-started/`: open the application, set steward identity, load master data, export and reset.
- **Open the application** covers: checking the build number, extracting the zip, and the full session best-practice sequence (export &rarr; reset &rarr; load &rarr; work &rarr; export &rarr; reset).
- **Export and reset** is a single merged guide covering delta export, the reset confirmation flow, and the abandon-changes path.
- **Index updated:** Getting Started section now lists all 4 guides.
- **Zip updated:** Build now bundles 20 user-guide files.

---

## build-20260701-1235 -- User Guide: Ownership Hierarchy guides (15 pages)

### What's new

- **15 how-to guides added** under `documentation/user-guide/ownership-hierarchy/`, covering add, modify, and remove for: Executive Agency, Directorate, Data Patron, Data Owner, and Data Steward.
- **Index updated:** The Ownership Hierarchy section in `index.html` now links to all 15 guides.
- **Zip updated:** Build now bundles 16 user-guide files (index + 15 guides).

---

## build-20260701-1142 -- User Guide: bundle, index page, and header button

### What's new

- **User Guide bundled in zip:** Every build now includes the `user-guide/` folder inside the distribution zip. When the zip is extracted, `user-guide/index.html` sits alongside `dq-accelerator.html` and can be opened directly in a browser.
- **User Guide index page:** `documentation/user-guide/index.html` created as the main table of contents. Sections cover Getting Started, Ownership Hierarchy, Data Quality Elements, Weights & Thresholds, Import & Export, and Tools & Advanced Features. Individual guides will be added to each section as features are built or modified.
- **User Guide button in header:** A book icon button has been added to the application header (to the left of the Settings button). Clicking it opens `user-guide/index.html` in a new browser tab. Requires the full zip to have been extracted so the `user-guide/` folder is present alongside the HTML file.
- **Book icon:** Added `Icon.Book` to the shared icon set (`60_icons.js`).
- **Build script:** `build.py` updated to walk `documentation/user-guide/` and include all files in the zip under the `user-guide/` prefix. Handles empty or missing folder gracefully.

---

## build-20260629-1506 -- Profiling: CDE completion badge and Logical Type column

### What's new

- **CDE completion badge on table rows:** When all CDE-origin fields on a table have been individually field-profiled, a green "CDEs ✓" badge appears in the table header row alongside the existing "profiled" badge. Fields with origin `CDE` or `CDE+SQL` are counted; a field is complete once it has any profiling record.
- **Physical Type and Logical Type columns on field rows:** The single "Type" column has been replaced with two separate columns. "Phys Type" shows the DDL physical type (as before). "Log Type" shows the semantic type override set during field profiling, displayed in purple when set, or a dim dash when no override is recorded.
- **Backlog:** Added `PROF-Q` (semantic-aware SQL generation for pattern-based fields) as a future backlog item.

---

## build-20260626-2102 -- Merge directorate management into Organisation page

### What's new

- **`+ Directorate` button on each agency card:** A `+ Directorate` ghost button now appears in the agency header action area (editor-only, hidden on retired agencies). Clicking it opens the standard directorate form panel with the agency pre-selected.
- **Edit + Retire/Restore on directorate rows:** Each directorate row in the expanded agency card now shows a pencil (edit) button and an eye-off/eye (retire/restore) button, giving full directorate lifecycle management without leaving the Organisation page.
- **Directorate removed from sidebar:** The standalone "Directorate" sidebar entry has been removed. All directorate management is now done via the Organisation page. Import/export of the directorate table is unaffected.

### Known issues

- `DirectorateView` component and its dead router entry remain in the codebase — scheduled for cleanup under CLEAN-2 in the backlog.

---

## build-20260626-2047 -- Agency form: remove patron assignment via X on chip

### What's new

- **X button on current patron chips (edit mode):** Each patron chip in the "Current patrons" area now has a small X button. Clicking it removes the chip immediately (visual feedback) and on save sets `executive_agency_id` to null on that patron record, unlinking the patron from the agency without deleting either record. If all patrons are removed the chip area shows "None".

---

## build-20260626-2018 -- Agency form: correct select-existing patron filter (unassigned only)

### Fixed

- **Select existing patron list now shows only active patrons with no agency assignment** (`executive_agency_id` null, `retiring_timestamp` null). Previously it was incorrectly showing patrons assigned to other agencies.

---

## build-20260626-2016 -- Agency form: correct select-existing patron filter

### Fixed

- **Select existing patron list was showing retired patrons instead of active ones.** The dropdown now shows only active patron records (`retiring_timestamp` null) that are not already assigned to the current agency. Retired patrons are excluded. This covers the scenario where an active patron from one agency is re-assigned to another.

---

## build-20260626-2012 -- Agency form: fix type dropdown + patron select-existing mode

### Fixed

- **Agency Type dropdown was empty:** The form was reading `executive_agency_type_name` which does not exist on the schema; the correct field is `executive_agency_type_description`. All active types now appear in the dropdown.

### What's new

- **Patron section now has three modes** (Skip / Create new / Select existing), replacing the previous always-visible create-new form.
  - **Skip** (default): no patron action taken on save.
  - **Create new**: original behaviour — fill Name, Title, Email, Start date to insert a new `data_patron` record.
  - **Select existing**: dropdown listing all currently retired (inactive) patron records, showing Name, Title, and previous agency for context. Selecting one and saving reactivates that patron record (clears `retiring_timestamp`, updates `executive_agency_id` to the current agency, and sets a new `assignment_start_date`). This covers the patron-retirement-and-reappointment lifecycle.

---

## build-20260626-2005 -- Agency form: inline Data Patron creation

### What's new

- **Inline patron creation in Add/Edit Agency form:** The Add Agency and Edit Agency panels now include an optional "Data Patron (optional)" section below the agency fields. Filling in the patron Name (and optionally Title, Email, and Start date) creates a new `data_patron` record associated to the agency in the same save operation. If Name is left blank the patron section is silently ignored regardless of other fields.
- **Edit mode shows existing patrons:** When editing an existing agency the form displays read-only chips for all current active patrons (name + title) above the new-patron input area.
- **Start date defaults to today:** The patron Start date field is pre-filled with today's date; the user can change it.
- **New component `AgencyFormPanel`** (`src/167_form_panel_agency.js`) replaces the generic `RecordFormPanel` for `executive_agency`, routing through a new `handleAgencySave` handler in `240_app.js` that splits the save into an agency upsert and an optional patron upsert.

---

## build-20260626-1948 -- Merge Executive Agency CRUD into Organisation page

### What's new

- **Add Agency button:** The Organisation page header now has an "+ Add Agency" button (visible when a steward identity is set). Clicking it opens the standard record form panel pre-titled "Add Agency".
- **Edit button per agency row:** Each agency row in the org chart now shows a pencil icon button on the right. Clicking it opens the form panel titled "Edit Agency" pre-populated with the existing record. The expand/collapse toggle is not affected (stopPropagation applied).
- **Retire / Restore per agency row:** Each agency row shows an eye-off button (retire) for active agencies and an eye button (restore) for retired ones, alongside the edit button. Behaviour is identical to the generic table view.
- **Executive Agency removed from sidebar:** The "Executive Agency" entry is no longer shown in the Ownership group in the sidebar. The Organisation page is the single entry point for agency management. The underlying route (`table/executive_agency`) remains functional for backward compatibility.

### Changed

- **Record form panel titles:** `RecordFormPanel` now derives its panel title from the table schema label (e.g., "Add Agency", "Edit Directorate") instead of the generic "Add record" / "Edit record". The subtitle line is suppressed when no subtitle is passed. This improves clarity across all tables using the generic form panel.
- **`executive_agency` schema label** renamed from `'Executive Agency'` to `'Agency'` to match the new panel titles.

---

## build-20260626-1933 -- Normalize Unicode whitespace in all Copy SQL handlers

### Fixed

- **Non-standard space characters in copied SQL (Athena compatibility):** SQL and snapshot filter strings copied from the app may have contained Unicode whitespace variants (most commonly U+00A0 non-breaking space from Excel copy-paste) that Athena's SQL parser rejects. A shared `normalizeWhitespace()` utility has been added to `20_data_utils.js`; it replaces all known Unicode space variants (U+00A0, U+2000--U+200B, U+202F, U+205F, U+3000, U+FEFF, U+00AD) with plain ASCII space before writing to the clipboard. Applied to:
  - Snapshot filter at the point it is embedded into profiling SQL (`buildProfilingSQL` in `200_screen_ddl.js`)
  - All six Copy SQL / Copy button clipboard handlers (`90_panels.js`, `130_view_rule_allocation.js`, `141_view_cde_list.js`, `180_screen_generator.js`, `200_screen_ddl.js`, `201_ddl_form_panel.js`)

---

## build-20260626-1917 -- MoJ Quality Framework profiling alignment: rename sections + add Duplicate and Outlier Analysis

### What's new

- **Section renames (MoJ terminology):** The four Step 2 profiling sections in the Field Profiling panel have been renamed to align with MoJ Quality Framework terminology:
  - "Summary Profile" -> "Column Profiling"
  - "Top Values" -> "Frequency Analysis"
  - "Type Patterns" -> "Pattern Analysis"
  - "Length Distribution" -> "Length Profile"
  The underlying SQL and storage column names are unchanged; only display labels and SQL comments are updated.
- **Duplicate Analysis (new section 5):** A new "Duplicate Analysis" section is added for all field types. The generated SQL counts total values, unique values, excess duplicates, and `uniqueness_pct`. A field with `uniqueness_pct = 100` has no duplicate values.
- **Outlier Analysis (new section 6):** A new "Outlier Analysis" section is added. For numeric fields (INT, BIGINT, DOUBLE, FLOAT, etc.) the query uses Z-score detection (rows where the value is more than 3 standard deviations from the mean). For string and date fields it uses low-frequency detection (values appearing 2 or fewer times, or below 0.1% frequency). Boolean fields show "Not applicable".
- **Schema extended:** Two new optional `text` columns added to `field_profiling`: `duplicate_analysis_raw` and `outlier_analysis_raw`. Existing profiling records are unaffected (fields default to null).

---

## build-20260626-1845 — Table Profiling panel: Parse button style and position fix

### Fixed
- Parse button now matches the Copy button style exactly (`fontSize:11`, `padding:'4px 12px'`, flex with icon).
- Parse button moved below the DDL textarea (was inline with the label above it).

---

## build-20260626-1841 — Table Profiling panel UX: step labels, Athena command copy block

### What's new
- **Step 1 card**: The Table Profiling panel body is now wrapped in a labelled "Step 1 - Get the DDL from Athena" card, matching the visual style of the Field Profiling panel.
- **Athena command copy block**: Once a database and table are selected or typed, a `SHOW CREATE TABLE db.table;` command is generated and displayed with a one-click Copy button (shows "Copied" confirmation for 1.8s). Before a table is selected, a contextual placeholder message is shown instead.
- **Instruction line**: When the Athena command is active, a brief instruction "Run the command above in Athena, then paste the output here." appears above the DDL textarea.
- **Step 2 card**: The parsed column table is now shown inside a labelled "Step 2 - Verify columns" card that only appears after parsing, with green/amber accent matching parse success/failure.

---

## build-20260626-1822 — Fix snapshot_filter token substitution on Profiling page; centralise utility

### Fixed
- **Profiling page bug**: The snapshot_filter shown in Step 1 and embedded into all four Step 2 COPY SQL queries now has `{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, and `{SOURCE_FIELD_NAME}` tokens replaced with the actual CDE values. Previously raw template text was displayed and copied verbatim.

### What's new
- **`substituteCdeTokens(str, cde)`** added to `20_data_utils.js` as the single shared implementation of CDE token substitution. Previously the same 3-line regex replacement was duplicated in five separate inline closures across `90_panels.js`, `130_view_rule_allocation.js`, `141_view_cde_list.js`, `145_view_rules.js`, and `180_screen_generator.js`. All five now call the shared utility.

---

## build-20260626-1755 — Add steward assignment controls to Edit CDS panel

### What's new
- **Edit CDS steward management**: The Stewards section in the Edit CDS panel is now interactive. Each currently assigned steward is shown as a chip with a remove (x) button. A dropdown + Add button allows a new steward to be added. A pending-add steward is shown in green with a "(to be added)" label and can be cancelled before saving. All changes (adds and removals) are committed atomically on Save.
- The Add dropdown is automatically filtered to exclude already-assigned stewards, preventing duplicates. When all stewards are assigned it shows "-- all stewards assigned --" and is disabled.

---

## build-20260619-1702 — KI-18: Reconciliation resolution buttons now use coloured fills

### Fixed
- **KI-18**: "Keep master" and "Accept steward/retirement" buttons on the conflict reconciliation card were styled as ghost buttons, blending into the dark `--bg3` background. They now switch to filled styles when selected (`btn-primary` accent-blue for Keep master, `btn-green` for Accept steward/retirement), giving an unambiguous visual signal for the active choice. Unselected state remains ghost, preserving clarity.

---

## build-20260619-1651 — KI-22 (Option A): Correct rule filter logic — hide all other-CDS rules

### Fixed

- **Filter logic corrected (KI-22):** The previous filter allowed any rule whose prefix was not found in the set of known CDS names to pass through as "generic". This meant rules named `"OtherCDS - something"` were wrongly shown. The rule is now: a rule with a ` - ` prefix is hidden unless its prefix is literally `"generic"` (case-insensitive) or exactly matches the current CDS name. Rules with no prefix at all remain always visible. Same correction applied to both `141_view_cde_list.js` and `130_view_rule_allocation.js`.

---

## build-20260619-1646 — KI-22 (Option A): Fix applied to correct file (Data and Stewardship page)

### Fixed

- **KI-22 fix moved to the correct panel:** The previous build (1634) applied the CDS-context rule filter to `130_view_rule_allocation.js` (standalone Rule Allocation table), but the user-reported issue was on the **Data and Stewardship** page, whose Add Allocation panel lives in `CdeAllocFormPanel` inside `141_view_cde_list.js`. The filter is now applied there instead. Because `CdeAllocFormPanel` is opened from a CDE row that already knows its CDS, the filtering is immediate — no cascading selection required by the user.

---

## build-20260619-1634 — KI-22 (Option A): Rule dropdown filtered by CDS context in Add Allocation panel

### Fixed

- **KI-22 — Rule list filtered by CDS context (Option A):** When the user selects a Data Set in the Add Allocation panel's cascading selector, the Rule dropdown now shows only: (a) generic rules — rules whose name contains no ` - ` separator, or whose prefix does not match any known CDS name — and (b) rules whose name follows the `CDS_NAME - Rule Name` pattern for the selected CDS. If no CDS has been selected, all rules are shown as before.
- **Rule resets on CDS change:** Selecting a different agency, directorate, or data set now clears any previously chosen rule, keeping the form consistent with the new context.
- **Filter hint:** A muted label below the rule dropdown shows "Showing X of Y rules -- generic + [CDS name] rules only" when filtering is active.

### Backlog / issues

- **Option B parked in backlog (KI-22-B):** An expandable tree picker for the rule dropdown — showing group headings (Generic, LPA, OPG Investigations, ...) that expand to reveal individual rules — has been designed and recorded in BACKLOG.md and KNOWN_ISSUES.md for future implementation if rule volumes grow beyond what the CDS filter handles.

---

## build-20260619-1617 — KI-15: Trailing-dot filename fix extended to group export downloads

### Fixed

- **`handleExportGroup` timestamp regex was missed in KI-15:** The `replace(/[:\-T]/g,'').slice(0,15)` line in `handleExportGroup` had different whitespace from the two lines corrected in the previous build, so the `replace_all` pass did not reach it. Fixed to `/[:\-T.Z]/g` with `slice(0,14)`, matching the other three export timestamp lines.

---

## build-20260619-1613 — KI-16: Folder picker for master and full-dataset exports; export group buttons icon-only

### What's new

- **Native Save dialog on supported browsers (KI-16):** "Export master JSON" and "Export all tables as zip" now use `window.showSaveFilePicker()` on Chrome/Edge. The browser opens a native OS Save dialog with the application-generated filename pre-filled; the user may navigate to any folder and confirm (or change the filename). The browser natively remembers the last-used folder across sessions. On Firefox/Safari (no API support) the existing silent direct-download behaviour is preserved as a fallback. Cancelling the dialog is a no-op — no file is written and, for the master export, the version counter is not incremented.
- **`buildAllCSVsBlob` / `saveWithPicker` utilities added to `40_storage.js`:** `exportAllCSVs` has been replaced by `buildAllCSVsBlob` (returns `{blob, filename}`) and a shared `saveWithPicker(blob, filename, description, ext)` helper used by both affected export actions.
- **Export group buttons simplified:** The four "Export group" buttons have been reduced to icon-only download buttons matching the style of the individual CSV row buttons. The `title` attribute provides the tooltip label.

## build-20260619-1559 — KI-15: Export zip filename no longer contains a trailing dot

### Fixed

- **Export filenames had a trailing dot before `.zip` (KI-15):** The timestamp regex `/[:\-T]/g` stripped hyphens, colons, and `T` from the ISO string but left the `.` before milliseconds, causing `.slice(0,15)` to capture a trailing dot (e.g. `dq_export_20260619143000..zip`). Fixed by extending the regex to `/[:\-T.Z]/g` and reducing the slice to 14 characters, producing clean `YYYYMMDDHHMMSS` timestamps. Applied to `40_storage.js` (`exportAllCSVs`) and both timestamp lines in `230_screen_export.js` (`handleExportDelta`, `handleExportGroup`).

---

## build-20260619-1511 — KI-24: Profiling SQL now scoped to snapshot filter

### Fixed

- **Profiling queries scanned full tables (KI-24):** The `buildProfilingSQL` function generated all six query blocks (`summarySQL`, `topValuesSQL`, `typePatternsSQL`, `lengthSQL`) targeting `FROM db.table` with no row filter. For large Athena tables this caused excessive data scanned, high cost, and disruption to the source system. The `source_snapshot_filter` field on `critical_data_element` (which holds a SQL WHERE-predicate fragment such as `snapshot_date = DATE('2024-12-01')`) was present in the schema but never used by the profiling machinery. Fix: `buildProfilingSQL` now accepts a sixth `snapshotFilter` argument and injects it into every SQL block — either as `WHERE <filter>` (blocks with no existing WHERE) or as `WHERE <filter>\n  AND <existing condition>` (blocks that already had a WHERE). `buildProfilingAgenda` now carries `source_snapshot_filter` from each CDE into the fieldMap and field entries. `FieldProfilingPanel` passes `fieldEntry.snapshotFilter` through to `buildProfilingSQL`. When a snapshot filter is set the panel Step 1 block shows it in amber; when it is absent but the field has allocated rules a warning prompts the steward to add one.

---

## build-20260619-1448 — KI-20: Bumper value range corrected to 1–5

### Fixed

- **Bumper dropdown excluded 0 (KI-20):** Bumper value dropdowns in the Add Allocation panel (`130_view_rule_allocation.js`) and the Data and Ownership inline allocation form (`141_view_cde_list.js`) previously offered `0` as a selectable option, which is outside the valid range. The options list has been changed from `[0,1,2,3,4,5]` to `[1,2,3,4,5]`; the `-- none --` blank option remains as the "not defined" state (equivalent to level 1). The decrement buttons in the RAG Simulator and Rule Generator stepper controls were also floored at `0`; both now clamp to `Math.max(1, ...)` so the in-place editor cannot produce an invalid value either.

---

## build-20260619-1430 — Rule Generator: directorate dropdown blocked for agency/directorate with ID 0

### Fixed

- **Directorate dropdown disabled when agency ID = 0 (Rule Generator):** The directorate and data-set dropdowns used JavaScript truthiness checks (`!filterAgencyId`, `!filterDirId`) to decide whether to disable the next cascade level. Because `0` is falsy in JavaScript, selecting an agency or directorate whose database ID is `0` left the downstream dropdown permanently disabled even though matching records existed. Fixed by replacing all four falsy guards with explicit `=== null` / `!== null` checks in `180_screen_generator.js` (lines 552–563). Root cause: `parseInt("0")` correctly yields `0`, but `!0 === true` so the disable flag fired incorrectly.

---

## build-20260619-1411 — Directorate quick-add button per agency

### What's new

- **Per-agency "+ Add" shortcut (Directorate screen):** Each agency block in the Directorate screen now shows a small `+ Add` button at the right of the agency header row. Clicking it opens the standard Add Directorate panel with the agency pre-selected, eliminating the need to manually pick the agency from the dropdown. Button is disabled when no steward identity is set. Top-level "Add record" button unchanged.

---

## build-20260619-1344 — Colour theme refresh + design token centralisation

### Fixed

- **Colour theme V2 (readability):** Replaced the original dark palette with a higher-contrast scheme modelled on the AWS Athena dark mode reference. Primary text lifted from `#d4daf0` to `#edf0fa` (near-white), secondary text from `#8492b4` to `#9aaecc`, muted text from `#4e5e80` to `#5f7294`. Accent colour shifted from blue (`#4f8ef7`) to teal (`#18b4d4`) for stronger contrast against dark navy backgrounds. Background layers and borders made more distinct. Amber/yellow action buttons and bright green status indicators preserved unchanged.
- **Design token centralisation (Phase 1):** All hardcoded colour hex literals and rgba values in JS inline styles replaced with CSS custom property references (`var(--...)`). New tokens added to `:root`: `--purple`, `--red-vivid`, `--overlay-sm`, `--overlay-md`, `--accent-tint`, `--accent-border`. `src/00_styles.css` `:root` is now the single source of truth for all design tokens; future theme changes require editing one block in one file. Font-size centralisation deferred to Phase 2.
- **Old blue accent remnants fixed:** Three screens (`210_screen_import`, `230_screen_export`, `250_screen_assistant`) retained rgba values based on the old blue accent (`rgba(79,142,247,...)`); updated to teal (`rgba(24,180,212,...)`).

---

## build-20260612 — Phase 1 + Phase 1.5

### What's new

- **Delta sync workflow (Phase 1.5):** Master steward can publish a versioned master Excel; stewards export a delta ZIP containing only their changes; master imports the delta, reviews conflicts side-by-side, and merges with a single click.
- **Steward identity and PK namespacing:** Each steward selects their identity in Settings; all records they create are assigned IDs within a dedicated million-wide namespace (steward_id * 1,000,000) so deltas never collide at merge time.
- **Master designation:** A steward can self-register as the master by entering the master passphrase; the header badge and PK logic update accordingly.
- **DQ Assistant (AI rules):** Paste a data description and the assistant proposes DQ rules using the configured Claude API key; accepted proposals are written directly into the rule tables.
- **Rule Generator:** Generates executable SQL DQ checks from stored rules and the linked table DDL.
- **RAG Simulator:** Simulates overall RAG status for a CDS given a set of rule pass/fail inputs and the configured dimension and criticality weights.
- **CDE Coverage screen:** Visualises which CDEs have DQ rules assigned and flags gaps.
- **DDL / Table Profiling:** Stores CREATE TABLE statements and field-level profiling notes; used by the Rule Generator for SQL generation.
- **Organisation chart:** Visual hierarchy of executive agencies, directorates, data patrons, owners, and stewards.
- **Rules Explorer:** Grouped view of all DQ rules linked to CDEs and CDSs.
- **Full table CRUD:** All 13 editable tables support add, edit, and retire via the generic table view or specialised views (CDS/CDE, rules, allocations, criticality, stewardship, weights).
- **Export:** Exports the full dataset as a multi-sheet Excel workbook or as a ZIP of individual CSVs; also supports steward delta ZIP export.
- **Import:** Accepts master Excel workbook (full import) and steward delta ZIP (merge workflow).
- **Settings panel:** Upload a client logo; select steward identity; view PK namespace; register as master.
- **Collapsible sidebar with live record counts.**
- **localStorage persistence** with auto-save on every change.

### Known issues in this release

See Known Issues screen for the full list (KI-1 through KI-9).

---

## How to read this log

Each section corresponds to a build of `dist/dq-accelerator.html`. Build numbers follow the pattern `build-YYYYMMDD-HHMM`. Changes are grouped as **What's new**, **Fixed**, and **Known issues in this release**. Items carried forward without change are not repeated.
