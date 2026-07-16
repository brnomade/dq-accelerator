# Changelog

Records high-level changes delivered in each build. Most recent release is listed first.

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
