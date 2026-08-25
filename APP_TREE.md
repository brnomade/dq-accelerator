# APP_TREE -- Application Navigation & File Map

Quick-reference for locating screens, views, and form panels without searching the code.

---

## Sidebar navigation

Items appear in this order. Route format is `{ screen, table }`.

| Sidebar label | Route | Screen component | Source file |
|---|---|---|---|
| Dashboard | `screen:dashboard` | `DashboardScreen` | `220_screen_dashboard.js` |
| DQ Assistant | `screen:assistant` | `AssistantScreen` | `250_screen_assistant.js` |

---

## Sidebar groups

### Data Quality Elements (green, `var(--green)`)

| Sidebar label | Route | View component | Source file |
|---|---|---|---|
| Data and Stewardship | `screen:table / critical_data_element` | `CriticalDataElementView` | `141_view_cde_list.js` |
| RAG Simulator | `screen:simulator` | `DQSimulatorScreen` | `170_screen_simulator.js` |
| Rule Generator | `screen:rulegenerator` | `DataRuleGeneratorScreen` | `180_screen_generator.js` |
| Rules Explorer | `screen:rulenav` | `RuleExplorerView` | `145_view_rules.js` |
| _(Field Profiling -- hidden from sidebar)_ | `screen:table / field_profiling` | `FieldProfilingScreen` | `200_screen_ddl.js` |

### Ownership Hierarchy (blue, `#18b4d4`)

| Sidebar label | Route | View component | Source file |
|---|---|---|---|
| Organisation | `screen:orgchart` | `OwnershipOrgChart` | `100_view_weights_org.js` |
| Directorate | `screen:table / directorate` | `DirectorateView` | `151_view_directorate.js` |
| Data Patron | `screen:table / data_patron` | `GenericTableView` | `161_view_generic.js` |
| Data Owner | `screen:table / data_owner` | `GenericTableView` | `161_view_generic.js` |
| Data Steward | `screen:table / data_steward` | `GenericTableView` | `161_view_generic.js` |
| _(Executive Agency -- hidden from sidebar; managed via Organisation page)_ | `screen:table / executive_agency` | `GenericTableView` | `161_view_generic.js` |

### Weights & Thresholds (amber, `var(--amber)`)

| Sidebar label | Route | View component | Source file |
|---|---|---|---|
| Criticality Group Weight | `screen:table / criticality_group_weight` | `AggregatedWeightView` | `100_view_weights_org.js` |
| Quality Dimension Weight | `screen:table / quality_dimension_weight` | `AggregatedWeightView` | `100_view_weights_org.js` |

### Database Actions (green, `var(--green)`)

| Sidebar label | Route | View component | Source file |
|---|---|---|---|
| Export | `screen:export` | `ExportScreen` | `230_screen_export.js` |
| Import | `screen:import` | `ImportScreen` | `210_screen_import.js` |
| Data Browser _(master only)_ | `screen:databrowser` | `DataBrowserScreen` | `215_screen_databrowser.js` |
| Profiling | `screen:table / source_table_ddl` | `DDLLibraryView` | `200_screen_ddl.js` |

### Core Settings (grey, `#5f7294`) -- read-only reference tables

| Sidebar label | Route | View component | Source file |
|---|---|---|---|
| Executive Agency Type | `screen:table / executive_agency_type` | `GenericTableView` | `161_view_generic.js` |
| Steward Role Type | `screen:table / steward_role_type` | `GenericTableView` | `161_view_generic.js` |
| Quality Dimension | `screen:table / quality_dimension` | `GenericTableView` | `161_view_generic.js` |
| Criticality Group | `screen:table / criticality_group` | `GenericTableView` | `161_view_generic.js` |
| Criticality Level | `screen:table / criticality_level` | `GenericTableView` | `161_view_generic.js` |

---

## Screens not in sidebar (programmatic navigation only)

| Screen | Route | Component | Source file | How reached |
|---|---|---|---|---|
| CDE Coverage | `screen:coverage` | `CDECoverageScreen` | `190_screen_coverage.js` | Internal link (legacy / not wired in current sidebar) |
| Organisation Chart | `screen:orgchart` | `OwnershipOrgChart` | `100_view_weights_org.js` | Ownership Hierarchy group |

---

## Form panels catalogue

All panels render at App level (outside scroll container) to avoid `position:fixed` / overflow ancestor issues.

### Panels wired through `openForm` + `formTable` branch in `240_app.js`

| Table | Panel component | Source file | Opened from |
|---|---|---|---|
| `executive_agency` | `AgencyFormPanel` | `167_form_panel_agency.js` | Organisation page (+ Add Agency / Edit Agency buttons) |
| `critical_data_set` | `CdsFormPanel` | `162_form_panel_cds.js` | Data and Stewardship view (inline CDS add/edit) |
| `data_owner` | `DataOwnerFormPanel` | `163_form_panel_data_owner.js` | Data Owner generic table view |
| `stewardship` | `StewardshipFormPanel` | `164_form_panel_stewardship.js` | Stewardship table or CDS form |
| `criticality_group_weight` | `WeightFormPanel` | `165_form_panel_weights.js` | Criticality Group Weight view |
| `quality_dimension_weight` | `WeightFormPanel` | `165_form_panel_weights.js` | Quality Dimension Weight view |
| `data_quality_rule` | `RuleFormPanel` | `166_form_panel_rule.js` | Rules Explorer |
| All other tables | `RecordFormPanel` | `160_record_form_panel.js` | Generic table view (directorate, data_patron, data_steward, settings tables) |

### Panels with dedicated state (opened via their own `open*Form` callbacks)

| Panel component | Source file | State hook | Opened from |
|---|---|---|---|
| `CriticalDataElementFormPanel` | `140_view_cde.js` | `openCdeForm` / `cdeFormRecord` | Data and Stewardship view |
| `CdeCriticalityFormPanel` | `120_view_cde_criticality.js` | `openCritForm` / `critFormCdeId` | Data and Stewardship view (criticality bulk edit) |
| `RuleAllocationFormPanel` | `130_view_rule_allocation.js` | `openAllocForm` / `allocFormRecord` | Rule allocation view (also inline from CDE detail) |
| `DDLFormPanel` | `201_ddl_form_panel.js` | `openDdlForm` / `ddlFormRecord` | Profiling view |

### Panel chrome (shared)

| Component | File | Purpose |
|---|---|---|
| `FormShell` | `160_record_form_panel.js` | Reusable backdrop + slide-in panel chrome used by all specialised panels |
| `SqlPanel` | `90_panels.js` | Read-only SQL viewer panel (opened via `openSqlPanel`) |

---

## Infrastructure files (no UI)

| File | Contents |
|---|---|
| `10_constants.js` | `SCHEMA`, `SHEET_MAP`, `TABLE_GROUPS` -- single source of truth for all 18 tables |
| `20_data_utils.js` | `buildLookups`, `getFkOptions`, `normalizeWhitespace`, misc data helpers |
| `30_export_utils.js` | Excel / ZIP export helpers |
| `40_storage.js` | localStorage read/write (`loadFromStorage`, `saveToStorage`, `loadStewardIdentity`) |
| `45_rule_sql_warnings.js` | `computeRuleSqlWarnings(sql, sample)` pure function; `RuleSqlWarningNotices` display component |
| `46_prompt_helpers.js` | All AI prompt construction: shared building blocks (`buildSqlStandardsPrompt`, `buildNamingConventionsPrompt`) plus full prompt builders (`buildRuleAssistantPrompt` for Rule Form Panel, `buildSuggestionPrompt` for Rule Generator). Edit this file to tune any AI prompt. |
| `50_context.js` | `AppContext` definition + `useApp()` hook |
| `60_icons.js` | `Icon.*` SVG components |
| `70_header_footer.js` | `AppHeader`, `AppFooter`, settings panel |
| `71_master_version.js` | Master version / delta merge logic |
| `240_app.js` | Root `App` component -- all state, routing, save handlers |

---

## Legacy / dead files (still in build, no active routes)

| File | Component | Status |
|---|---|---|
| `110_view_rules.js` | _(stub, 73 bytes)_ | Dead -- replaced by `145_view_rules.js` |
| `150_view_cds_dir.js` | `CriticalDataSetView` | Dead -- CDS management moved into `141_view_cde_list.js` |
| `190_screen_coverage.js` | `CDECoverageScreen` | Dormant -- route exists (`coverage`) but no sidebar link |
