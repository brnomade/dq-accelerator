# BACKLOG.md

Tracks build progress for the dq-accelerator MOJ POC. Update status as work is completed.

Status labels: `todo` · `in progress` · `done`

Known bugs deferred for later: see `KNOWN_ISSUES.md`

---

## Phase 1.5 — Multi-user Delta Sync

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4 | PK namespace | done | Steward PKs offset by `steward_id * 1,000,000` |
| 5 | Delta export | done | Steward exports changes-since-last-master as signed JSON delta |
| 6 | Delta import and merge | done | Master only — PK remap, FK remap, record-level conflict resolution UI, JSON merge report |
| 7 | UI gates | done | All gates confirmed: master export, delta export, delta import, CSV/ZIP exports, read-only banner |

### Task 5 — Delta export (detail)
- Compare current data against base snapshot using record hashes
- Capture inserts, updates, retirements per delta-tracked table
- Output: steward identity, timestamp, base version, change set
- Steward-only button; hidden for master and unregistered users

### Task 6 — Delta import and merge (detail)
- Master-only screen
- Remap steward-namespace PKs to master sequence
- Update FK references within the batch
- Record-level conflict detection with side-by-side resolution UI
- Auto-apply clean changes; retirements always surfaced as conflicts
- Downloadable JSON merge report

---

## Phase 1.6 — Business Rule Assistant (clipboard-mediated AI)

The app generates structured prompts the steward copies into their AI chat tool (Copilot, Teams AI, etc.).
The AI conversation happens externally. When ready, the AI produces a structured output block the steward
pastes back. The app parses it, validates it, and creates records. No API key, no backend, no fetch calls.

Starting point is a free-text rule description -- not CDE selection. Stewards think in rules first, not
data elements. CDE scope is added on the same opening panel using client-side text matching to suggest
relevant CDEs. If left blank, the AI suggests the CDE and the proposal includes a cde_suggestion field.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| G1 | Rule intent + CDE scope panel | done | Free text first; CDE multi-select with suggestion matching; optional supplementary table picker |
| G2 | Context builder | done | Serialises rule intent, CDEs, DDL (compressed), profiling, dimensions, existing rules into prompt |
| G3 | Prompt renderer | done | Readonly textarea, character count, "whats in this prompt" summary, one-click copy button |
| G4 | Paste zone + parser | done | Full-transcript paste; finds all RULE_PROPOSAL blocks by delimiter; graceful error messages |
| G5 | Proposal validator | done | Required field check; stale ID detection vs store; generates targeted refinement prompt for gaps |
| G6 | Review card | done | One editable card per proposal; SQL code block; resolved display names; commit or refine per card |
| G7 | Record creation | done | Creates data_quality_rule + data_quality_rule_allocation; links to new records on success |
| G8 | Persistence | done | Saves rule_intent, cde_ids, uncommitted proposals to moj_dq_assistant_v1; sidebar badge for pending |

### UI -- four progressive stages on one scrollable screen

Stage indicator at top: [1 Define] -- [2 Prompt] -- [3 Paste] -- [4 Commit]
Later stages are visible but muted until the prior stage completes.

**Stage 1 -- Define**
- Large textarea: "Describe the rule" (plain language, no structure required)
- CDE multi-selector below: searchable, suggestions match against field name, table, definition, explanation
  as the steward types. Optional -- if blank, prompt instructs AI to identify CDEs; proposal includes cde_suggestion.
- "Add tables" picker: supplementary DDL/profiling for tables not covered by selected CDEs
- "Build prompt" button assembles context and activates Stage 2

**Stage 2 -- Prompt**
- Readonly textarea with full generated prompt
- Header: context summary (N CDEs, N tables, N quality dimensions, ~N characters)
- Large "Copy to clipboard" primary button
- Collapsible "What's in this prompt?" (lists CDE names, tables, dimensions included)
- PROMPT_VERSION tag embedded in prompt for paste validation
- Stage 3 paste zone visible below but muted

**Stage 3 -- Paste**
- Textarea accepts full AI conversation transcript; parser scans for delimiters regardless of surrounding text
- "Parse result" button
- "Add context + copy" button: pick additional tables, generates short supplementary prompt for ongoing thread
- Parse outcomes:
  - Found: N proposals detected -- Stage 4 activates
  - Incomplete: proposal found but fields missing -- gap list + "Generate refinement prompt" button
  - Not found: message showing what delimiters should look like

**Stage 4 -- Commit**
One review card per parsed RULE_PROPOSAL:
- Editable: rule name, explanation, SQL (code block), bumper value, frequency dropdown, automated toggle
- Resolved to display names: quality dimension, CDE -- warns if ID no longer exists in current store
- "Create rule" per card; "Refine further" generates refinement prompt
- After commit: success badge with links to new rule and allocation records

### Output format (embedded verbatim in the generated prompt)
```
===RULE_PROPOSAL_START===
{
  "rule_name": "...",
  "rule_explanation": "...",
  "sql_code": "SELECT ...",
  "sql_code_sample": "...",
  "quality_dimension_id": 3,
  "cde_id": 42,
  "cde_suggestion": "field name or table.field if CDE was not pre-selected",
  "bumper_value": 0.95,
  "frequency": "daily",
  "automated": true,
  "steward_notes": "..."
}
===RULE_PROPOSAL_END===
```
Multiple blocks per paste supported (e.g. completeness + validity from one AI conversation).

### Persistence (moj_dq_assistant_v1)
- Persisted: rule_intent text, cde_ids array, uncommitted proposals array, saved_at timestamp
- Not persisted: generated prompt text -- always regenerated fresh from current store to avoid staleness
- On load: proposal cde_id and quality_dimension_id validated against current store; stale IDs flagged
- Sidebar nav item shows badge count of uncommitted (not yet committed) proposals

### Constraints
- No API calls, no keys, no backend -- purely clipboard-mediated
- Non-ASCII characters forbidden in JS source (all prompt string literals must use ASCII)
- Prompt character count shown so steward knows it fits their AI tool input limit
- DDL compressed: full schema for CDE-direct tables; column names only for related tables
- Records created via upsertRecord follow existing canEdit and PK namespace rules (steward-scoped)

---

## Phase 1 — Remaining Features

| ID | Feature | Status | Notes |
|----|---------|--------|-------|
| EXPORT-CSV-GATE | Restrict CSV/ZIP export to master steward | todo | See detail below. |
| KI-22-B | Rule picker: expandable tree view | todo | Replace flat rule `<select>` in Add Allocation panel with a two-level tree (group headings expand to show rules). Option A (CDS-context filter) already implemented; Option B is a polish upgrade for when rule volumes make even the filtered list unwieldy. See KI-22 in KNOWN_ISSUES.md for full analysis. |
| CLEAN-1 | Dead code removal — 3 unreachable screen files | todo | See detail below. Saves ~37 KB (~5% of bundle). Low-risk but requires one pre-flight check before executing. |
| CLEAN-2 | Remove DirectorateView from codebase | todo | `DirectorateView` in `151_view_directorate.js` and the `route.table === 'directorate'` case in `240_app.js` are now dead code (directorate management merged into Organisation page, sidebar entry removed). Safe to delete in a future session. |
| CDS-SCOPE | Rule CDS Scope — formal CDS-to-rule scoping via nullable FK | todo | Design: `designs/DESIGN_RULE_CDS_SCOPE.md`. Replaces the "Generic - " / "CDSNAME - " prefix naming workaround. Adds nullable `critical_data_set_id` FK to `data_quality_rule`; touches 4 files, no new tables. See detail in plan. |
| B | CDE detail view | todo | Superseded by CDS1 (CDE Hub) -- the expanded CDE row in the hub delivers this; no separate implementation needed |
| C | Dashboard improvements | todo | Health indicators, coverage summary, gap warnings. Includes KI-29: make "Uncovered Dimensions" card actionable — clicking a zero-coverage dimension should reveal which CDEs are missing a rule for that dimension and allow the steward to navigate to allocate one. |
| D | Weights editing UI redesign | todo | Single-screen editor per agency for all dimensions/groups; save gated on completeness |
| E | Rule library polish | todo | Minor improvements to Data Quality Rule view |
| F | Documentation and final polish | todo | Word doc update, QA pass across all pages |
| P1 | Table Profiling -- CSV column import | todo | Alternative input method: upload a CSV of column definitions instead of pasting DDL |
| CDS1 | CDE Hub — unified data management page | todo | Single page replacing CDS directory, CDE list, CDE Criticality, and Rule Allocation views; expandable CDE rows show rules + criticality inline; stewards manage all DQ metadata for a CDE without leaving the page |
| Q1 | Sample query customisation per allocation | todo | Allow stewards to override `sql_code_sample` (denominator) at the allocation level; rule-level default is preserved; edit surface in Rule Generator Step 3 and CDE Hub inline rules panel |
| PROF-Q | Profiling — semantic-aware SQL generation | todo | Extend `SEMANTIC_TYPES` and `buildProfilingSQL()` in `200_screen_ddl.js` to generate type-specific profiling queries when a semantic override is selected. Priority targets: `DATE_STRING` (multi-format date parsing), `ID` (uniqueness + pattern classification), `CARD_NUMBER` (PCI flag + format validation), `PHONE` / `POSTCODE` / `EMAIL` (UK-specific format checks). PCI warning banner (static, no SQL) for CARD_NUMBER fields. See full proposal in session discussion 2026-06-29. |

### EXPORT-CSV-GATE — Restrict CSV/ZIP export to master steward (detail)

**Goal:** The "Export all tables as zip" button and the per-group download buttons on the Export screen should only be available to the master steward. Currently they are enabled for any user with a steward identity set (`canEdit`), which means any steward can produce and potentially distribute a CSV package that has not been through the master merge process.

#### Current gating (as of build-20260701-1325)

| Export | Current gate | Required gate |
|--------|-------------|--------------|
| Delta export | `!isMaster && stewardIdentity` | Correct — stewards only |
| Master JSON export | `isMaster` | Correct — master only |
| Export all as ZIP | `canEdit` | **Needs: `isMaster`** |
| Export group as ZIP | `canEdit` | **Needs: `isMaster`** |
| Export single CSV | `canEdit` | **Needs: `isMaster`** |

#### Implementation (all in `230_screen_export.js`)

- Wrap the Export configuration card and all per-group/per-table export controls in `{isMaster && (...)}` or disable with a tooltip if the user is not the master steward.
- Show a clear message to non-master stewards explaining that CSV exports are performed by the master steward after merging all deltas.
- The `handleExportAll`, `handleExportGroup`, and `exportSingleCSV` calls do not need changes — only the UI gate needs updating.

#### Related

- Phase 1.5 Task 7 already confirmed other UI gates (delta export steward-only, master JSON master-only). This item extends the same pattern to CSV exports, which were intentionally left ungated at the time.
- User guide `import-export/export-csv-zip.html` documents this as a master-steward-only action and notes the gate is pending.

---

### CLEAN-1 — Dead code removal: 3 unreachable screen files (detail)

**Investigation date:** 2026-06-19  
**Investigated by:** audit of `240_app.js` router vs `80_sidebar.js` navigation links

#### Files to delete

| File | Size | Finding |
|------|------|---------|
| `190_screen_coverage.js` | 26 KB | Defines `CDECoverageScreen`. Has a router entry (`case 'coverage'` in `240_app.js:340`) but **no sidebar link** navigates to `'coverage'`. Completely unreachable from the UI. |
| `150_view_cds_dir.js` | 10 KB | Defines `CriticalDataSetView`. **Never referenced anywhere** — not in `240_app.js`, not in any other src file. `critical_data_set` is also absent from `TABLE_GROUPS` so there is no sidebar entry either. |
| `110_view_rules.js` | <1 KB | Contains only a one-line comment: `// DataQualityRuleView replaced by RuleExplorerView in 145_view_rules.js`. Zero functional code. |

**Total saving:** ~37 KB source; ~37 KB off the bundle (765 KB → ~728 KB, ~5% reduction).

#### Routing lines to clean up alongside deletions

- `240_app.js:340` — remove `case 'coverage': return <CDECoverageScreen/>;`
- `200_screen_ddl.js:1458` — remove `function FieldProfilingScreen() { return <ProfilingView/>; }` (the `field_profiling` table is explicitly skipped in the sidebar at `80_sidebar.js:200`; this stub is dead code inside an otherwise active file)

#### Effort

~10 minutes: delete 3 files, remove 2 lines, rebuild.

#### Risk

- `110_view_rules.js` — zero risk (empty file).
- `190_screen_coverage.js` — low risk. No user can reach `coverage` via the UI; only exposure is a manually crafted localStorage route string.
- `150_view_cds_dir.js` — **requires one pre-flight check before deleting.** Grep the codebase for any `navigate({ screen:'table', table:'critical_data_set' })` calls. If found, those screens would fall back silently to `GenericTableView` (not a crash, but a behaviour change). If none found, safe to delete.

Note: `150_view_cds_dir.js` is also listed as a deletion target in backlog item **CDS1** (CDE Hub). If CDS1 is implemented first, CLEAN-1 is partially superseded — only `190_screen_coverage.js` and `110_view_rules.js` would remain to clean up.

---

### P1 — Table Profiling: CSV column import (detail)

**Goal:** Let stewards define a table's column schema by uploading a CSV file instead of pasting a raw CREATE TABLE statement. The end result written to `source_table_ddl` is identical either way.

#### CSV file contract

| Column | Required | Description |
|--------|----------|-------------|
| `name` | yes | Column name (maps to `parsed_columns[].name`) |
| `type` | yes | Data type, e.g. VARCHAR, BIGINT (maps to `parsed_columns[].type`) |
| `display_name` | no | Human-readable label -- stored in `parsed_columns[].display_name`; enriches AI prompt context |
| `description` | no | Column-level description -- stored in `parsed_columns[].description`; enriches AI prompt context |

If either required column (`name` or `type`) is absent the import is rejected with a clear inline error listing the missing headers. Optional columns are silently ignored if absent.

#### Changes to `parsed_columns` shape

Current: `[{ name, type }]`  
After P1: `[{ name, type, display_name?, description? }]`

This is backward-compatible -- all existing consumers read only `name` and `type`. The extra fields are bonus context picked up by the assistant prompt builder (`250_screen_assistant.js`) which already includes `parsed_columns` verbatim.

#### UI changes (all in `201_ddl_form_panel.js`)

- **Input mode toggle** at the top of the form: `[Paste DDL]` | `[Upload CSV]` (default: Paste DDL)
- **CSV mode replaces the DDL textarea** with a file input (`accept=".csv"`) and a format reminder: "CSV must have columns: name, type (display_name and description are optional)"
- **Table name pre-fill**: filename without extension is used to pre-populate the table name field (user can override)
- **Parse step**: CSV is parsed immediately on file selection; results are shown in the same column pill format used by DDL parsing
- **Validation**: same rules as DDL mode -- database, table required; at least one column must be detected. Error if required CSV headers missing.
- **Storage**: raw CSV text is written to `ddl_text` prefixed with a comment line `-- source: csv import` so the stored record is self-describing. `parsed_columns` is stored as enriched JSON as above.

#### No schema changes required

`source_table_ddl` already has `ddl_text` and `parsed_columns` columns. `parsed_columns` is a freeform JSON string so the extra fields are stored without any migration.

#### Implementation scope

- `201_ddl_form_panel.js` -- all UI and logic changes (input mode toggle, file reader, CSV parser, validation, save path)
- `200_screen_ddl.js` -- no changes expected; column pills already read `parsed_columns` generically

---

### Q1 — Sample query customisation per allocation (detail)

**Context:** Each `data_quality_rule` has two SQL fields:
- `sql_code` — the numerator: counts failing records (`SELECT COUNT(*) ... WHERE <business condition>`)
- `sql_code_sample` — the denominator: counts total records in scope (`SELECT * FROM table LIMIT 100`; engine appends `WHERE <snapshot_filter>`)

The pass rate the DQ engine reports is `1 - (numerator / denominator)`. The denominator normally covers the full table snapshot, but for some rules the correct denominator is a subset — for example, a completeness rule on an optional field should only count records where the field is expected to be populated, not the entire table.

Currently `sql_code_sample` is stored on `data_quality_rule` only. Editing it requires navigating to the generic rule table editor, which is not discoverable and disrupts the flow.

#### The architectural issue

A Generic rule allocated to multiple CDEs shares one `sql_code_sample`. If CDE A needs `WHERE status = 'ACTIVE'` in its denominator and CDE B does not, the current schema forces a choice between:
- Duplicating the rule (defeats the purpose of Generic rules), or
- Accepting a wrong denominator for one of the allocations

#### Proposed solution: per-allocation denominator override

Add an optional `sql_code_sample_override` field to `data_quality_rule_allocation`. The DQ engine uses this override if present; falls back to the rule-level `sql_code_sample` if null. This preserves Generic rule reuse while allowing CDE-specific customisation without duplication.

#### Schema change required

`data_quality_rule_allocation` gains one new optional column:

| Field | Type | Notes |
|-------|------|-------|
| `sql_code_sample_override` | `text` (nullable) | If set, replaces `sql_code_sample` from the parent rule for this allocation only |

This is a backward-compatible addition -- all existing allocations have `null` here, which means "use the rule default", preserving current behaviour.

#### Edit surfaces

**Rule Generator -- Step 3 (immediate improvement):**
- Each suggestion card already shows `sql_code` in a preview block
- Add a collapsible "Sample query" section below it showing `sql_code_sample`
- Make it editable inline before the rule is added; the edited value is saved as the rule-level default (this is a new rule, so the rule and the first allocation are created together)
- "Test It" button resolves placeholders in the sample query the same way it does for the numerator

**CDE Hub -- inline rules panel (CDS1 dependency):**
- Each allocation row in the hub's rules section expands to show both SQL fields
- A "Customise denominator" toggle reveals a textarea pre-populated with the rule-level `sql_code_sample`
- On save, the edited value is written to `sql_code_sample_override` on the allocation record only
- A visual indicator (e.g. a small "custom" badge) on the allocation row flags that an override is active
- A "Reset to rule default" action clears the override

#### Implementation scope

| File | Change |
|------|--------|
| `10_constants.js` | Add `sql_code_sample_override` column to `data_quality_rule_allocation` SCHEMA entry |
| `180_screen_generator.js` | Step 3 card: add collapsible sample query preview + editable textarea; pass edited value through `handleAddRule` |
| `141_view_cde_list.js` | (CDS1) Allocation row expand: show both SQL fields; customise-denominator toggle; save override; custom badge |
| `130_view_rule_allocation.js` | Show override indicator in flat table view; edit field accessible from row panel |

#### Not in scope

- Changing how the DQ engine reads the fields -- that is a downstream system concern
- Validating that the override SQL is syntactically correct -- steward responsibility, same as current rule SQL

---

### CDS1 — CDE Hub: unified data management page (detail)

**Goal:** Replace four separate screens with a single CDE-centric hub. The CDE is the natural anchor entity — every other piece of DQ metadata (criticality, rules, profiling) is either a parent or a child of a CDE. Currently, getting a complete picture of one CDE requires visiting three or four separate screens. The hub collapses all of that into one place.

#### Screens retired by this feature

| Screen | File | Replacement |
|--------|------|-------------|
| Critical Data Set directory | `150_view_cds_dir.js` | CDS becomes a collapsible level within the hub |
| CDE Criticality | `120_view_cde_criticality.js` | Criticality facets shown inline on each CDE row; inline edit panel |
| Rule Allocation (CDE-scoped view) | `130_view_rule_allocation.js` (partial) | Rule list shown inline on each CDE row; keep as flat power-user table only |

The Rule Allocation table view (`130_view_rule_allocation.js`) may be kept as a read-only flat table for bulk inspection, but all routine per-CDE allocation work moves to the hub.

#### Hierarchy and collapsibility

Four collapsible levels:

```
Agency                       [collapsible]
  Critical Data Set          [collapsible]
    Source Table             [collapsible]
      Critical Data Element  [expandable leaf row]
```

All non-leaf levels expand/collapse independently, with state preserved across re-renders. CDE rows expand on click to show the detail panel below.

#### Counters at each level

| Level | Counters shown |
|-------|---------------|
| Agency | X data sets · Y CDEs · Z profiled · W rules · V criticalities |
| CDS | X tables · Y CDEs · Z profiled · W rules · V criticalities |
| Table | X fields · Y profiled · Z rules |
| CDE (collapsed) | profiling badge · rule count · criticality completeness indicator |

- Profiled badge: green when profiled, amber when not
- Criticality indicator: green when all 4 facets set, amber when partial, grey when none
- Rule count: integer badge; amber when 0

#### CDE expanded row -- inline detail panel

When a CDE row is expanded, a detail panel appears below the row header showing three sections:

**Rules section**
- List of active rule allocations for this CDE: rule name, dimension badge, frequency, bumper value
- Each row: inline "remove allocation" (retire) action
- "Add rule allocation" button: opens the existing allocation slide-in panel pre-seeded with this CDE
- "Open in Rule Generator" button: navigates to the Rule Generator with this CDE pre-selected
- Empty state: "No rules allocated. Use Add rule allocation or open the Rule Generator."

**Criticality section**
- Shows the 4 criticality facet chips (OPS / POL / REP / STRAT) with their current levels, same visual as the current CDE Criticality view
- "Edit criticality" button: opens the existing `CdeCriticalityFormPanel` slide-in pre-seeded with this CDE
- Empty state: "No criticality defined." with an "Add criticality" button

**Profiling section**
- Shows profiling status: date profiled, data type, semantic type, summary stats if available
- "Go to profiling" button: navigates to the Field Profiling screen filtered to this field
- Empty state: "Not profiled." with a "Go to profiling" button

#### CDS creation

- Global "Add data set" button in the page header
- Per-agency "+" button pre-seeds the agency FK
- Uses the same inline slide-in form panel pattern as CDEs
- No separate CDS page or sidebar entry required after this feature lands

#### Add CDE flows (preserved from current page)

- Global "Add CDE" button (blank form)
- Per-CDS "+" button (pre-seeds `critical_data_set_id`)
- Per-table "+" button (pre-seeds `critical_data_set_id`, `source_table_name`, `source_database_name`)

#### Navigation changes

| Change | Detail |
|--------|--------|
| Remove sidebar entry | "Critical Data Set" (`150_view_cds_dir.js`) -- route removed |
| Remove sidebar entry | "CDE Criticality" (`120_view_cde_criticality.js`) -- route removed |
| Rename sidebar entry | "Critical Data Element" → "Data Sets & CDEs" |
| Rule Allocation sidebar | Keep entry but mark as advanced / power-user flat table |

#### Implementation scope

| File | Change |
|------|--------|
| `141_view_cde_list.js` | Extended: CDS-level add button; inline expanded panel per CDE (rules, criticality, profiling sections); counters at all levels |
| `150_view_cds_dir.js` | Deleted |
| `120_view_cde_criticality.js` | `CdeCriticalityView` retired; `CdeCriticalityFormPanel` kept and reused from the hub |
| `80_sidebar.js` | Remove CDS and Criticality entries; rename CDE entry |
| `240_app.js` | Remove `cds` and `criticality` routes; no other routing changes required |

**Net complexity:** The CDE list file grows by roughly 150–200 lines (inline panels). Two files are deleted (~250 + ~670 lines). Net result is a meaningful reduction in total codebase size and a significant reduction in navigation complexity.

---

## Phase 4 — AI Provider Integration (direct API mode)

Builds on Phase 1.6 (Business Rule Assistant). Adds a direct API mode alongside the existing
copy & paste flow. Both modes share all prompt construction, output parsing, and record creation
code. Only the delivery mechanism differs. Copy & paste is never removed -- it remains the
default fallback for clients that cannot permit API access.

Full design: `API_Layer.MD`

| ID | Task | Status | Notes |
|----|------|--------|-------|
| H1 | AIProvider module | todo | `src/85_ai_provider.js` -- provider config, `invokeAI()`, streaming callback |
| H2 | Settings panel -- provider section | todo | Mode toggle, provider selector, API key input, test connection button; security warning banner |
| H3 | Claude API adapter | todo | Anthropic Messages API; SSE streaming; API key from settings |
| H4 | OpenAI adapter | todo | Chat Completions API; SSE streaming; optional endpoint override for Azure OpenAI |
| H5 | Assistant screen -- API mode stages | todo | Stage 2: Send + stream; Stage 3: auto-parse + follow-up input; Stage 1 and 4 unchanged |
| H6 | Multi-turn conversation state | todo | `conversationHistory` array in assistant state; passed to `invokeAI` on each turn |
| H7 | Copilot adapter | todo | Microsoft Graph API; requires Phase 2 MSAL token; build after Phase 2 |

### Constraints
- Copy & paste mode is never removed -- always the default; all copy mode code paths remain
- `invokeAI(prompt, history, onChunk, onDone, onError)` is the only call surface for AI features
- API keys stored in `moj_dq_provider_v1` (localStorage) with visible security warning; move to secure store in Phase 2
- H7 (Copilot) depends on Phase 2 Azure AD registration and MSAL.js being in place

---

## Phase 1.7 — RCA Assistant (clipboard-mediated AI)

Helps data stewards move beyond fixing individual failing records by identifying the underlying root cause of data quality failures. Follows the same clipboard-mediated AI pattern as Phase 1.6 (no API key, no backend). The steward supplies failure metrics and sample records; the app builds structured prompts; the AI conversation happens externally; findings are pasted back and persisted.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| R1 | Investigation context panel | todo | Select failing rule + CDE; enter observed pass rate, failure count, whether recurring; paste sample failing records |
| R2 | Error profile prompt builder | todo | Serialises rule SQL, CDE profile, field_profiling data, DDL, quality dimension into characterisation prompt |
| R3 | Hypothesis generator | todo | Parses AI error characterisation; builds ranked hypothesis prompt; returns structured RCA_HYPOTHESIS blocks |
| R4 | Hypothesis parser + validator | todo | Finds all RCA_HYPOTHESIS blocks by delimiter; validates required fields; flags unknown rca_class values |
| R5 | Investigation drill-down | todo | Per hypothesis: generate targeted investigation prompt with specific questions and data checks |
| R6 | Conclude + action plan | todo | Confirmed hypothesis drives action plan prompt; output is structured action block; optionally trigger rule refinement |
| R7 | Persistence + sidebar | todo | Saves active investigation to `moj_dq_rca_v1`; sidebar badge for open investigations |
| R8 | RCA record creation | todo | Writes confirmed root cause + action to a lightweight rca_record structure (localStorage, mirroring future Phase 2 schema) |

### RCA classes

| Class | Description |
|-------|-------------|
| `data_remediation` | Fix the offending records directly -- does not resolve underlying cause |
| `process_adjustment` | Upstream business process is producing bad data; workflow change needed |
| `reskilling` | Human error due to training gap; resolution is knowledge or tooling improvement |
| `technical_enhancement` | System or integration improvement required (validation, constraint, UI fix) |
| `pipeline_fault` | ETL bug, wrong join, truncation, encoding issue, or field mapping drift |
| `source_system_change` | Schema rename, platform migration, or changed upstream business logic |
| `rule_definition_issue` | Rule is too strict, misaligned with intent, or written against stale DDL; resolution is rule refinement |
| `referential_temporal` | Out-of-sequence records, stale reference data, timing gaps between dependent tables |
| `new_pattern` | New trend, use case, or data need not anticipated when the rule was written |

### Five-stage screen flow

**Stage 1 -- Select:** Pick the failing rule + CDE from existing records. Enter observed pass rate, failure count, approximate failure start date, and whether the failure is new or recurring. Optionally paste sample failing records from the steward's query tool.

**Stage 2 -- Profile:** App builds a characterisation prompt from rule SQL, CDE definition, `field_profiling` data (summary_raw, top_values_raw, profiling_notes), DDL schema, and the steward-supplied samples. Steward copies to AI, pastes the error characterisation back.

**Stage 3 -- Hypothesise:** App incorporates the error characterisation into a hypothesis-generation prompt. AI returns ranked `RCA_HYPOTHESIS` blocks. App parses, validates RCA class labels, and presents a ranked hypothesis list with evidence needed per hypothesis.

**Stage 4 -- Investigate:** Steward selects hypotheses to pursue. App generates a targeted investigation prompt per hypothesis with specific questions and data checks. Steward pastes findings back. Repeat as needed until a hypothesis is confirmed or ruled out.

**Stage 5 -- Conclude + Act:** Confirmed hypothesis drives an action-plan prompt. AI returns a structured action block. App persists the confirmed root cause, RCA class, and recommended actions. If RCA class is `rule_definition_issue`, a shortcut to the Rule Assistant is offered.

### Structured output format

```
===RCA_HYPOTHESIS_START===
{
  "hypothesis": "...",
  "rca_class": "pipeline_fault",
  "confidence": "medium",
  "evidence_needed": ["...", "..."],
  "investigation_steps": ["...", "..."],
  "suggested_action": "..."
}
===RCA_HYPOTHESIS_END===
```

### Data consumed from the app

| Source | What is used |
|--------|-------------|
| `data_quality_rule` | Rule SQL, explanation, quality dimension, frequency |
| `data_quality_rule_allocation` | Linked CDE, agency, pass target |
| `critical_data_element` | Field name, table, source system, definition, explanation |
| `field_profiling` | summary_raw, top_values_raw, profiling_notes -- richest RCA input |
| `source_table_ddl` | Column types, full schema context |
| `stewardship` | Owner/steward contacts -- informs who to involve |
| `cde_criticality` | Business criticality -- informs prioritisation of the fix |
| `quality_dimension` | Failure type shapes the hypothesis set |

Steward-supplied externally (not stored in app): actual pass rate from last run, failure count, sample failing records, failure start date.

### Persistence (`moj_dq_rca_v1`)

Stores: selected rule_id, cde_id, failure context (pass rate, count, recurring flag, samples), error characterisation text, hypotheses array (with status: open/investigating/confirmed/ruled_out), confirmed root cause, action items, saved_at.

The localStorage schema mirrors the shape a future `rca_record` Phase 2 table would have, making the eventual backend migration clean.

### Constraints
- No API calls, no keys, no backend -- clipboard-mediated throughout
- Prompt version tag `RCA-1` embedded in all prompts for paste validation
- Non-ASCII characters forbidden in JS source
- Sidebar badge count = number of investigations with status not yet concluded

---

## Phase 2 — SharePoint Lists backend (recommended long-term)

| Status | Notes |
|--------|-------|
| todo | Replace localStorage with SharePoint Lists via Microsoft Graph API + MSAL.js. Azure AD app registration required. Full IT spec to be written before build starts. Estimated 1–2 weeks. |

---

## Phase 3 — Shared JSON on SharePoint (potentially superseded)

| Status | Notes |
|--------|-------|
| parked | Simpler intermediate — versioned JSON on SharePoint with eTag conflict detection. Likely unnecessary if Phase 1.5 meets collaboration needs. |

---

## Recently completed

| Date | Item |
|------|------|
| 2026-06-11 | Table & Field Profiling unified screen complete and signed off — design Q6/Q7/Q8 resolved; extras toggle for orphaned DDLs; scope filtering bug fixed (blind rules + field profiling TBC); UK date format; tooltips with date+user; DDL gate removed; panel polish (Last Profiled box, parsed_by, hook fix, sizing); field row border removed; Field Profiling nav duplicate removed |
| 2026-06-10 | Phase 1.6 G1-G8: Business Rule Assistant complete -- 4-stage clipboard AI flow, two conversation modes, CDE suggestion matching, full prompt builder, proposal parser/validator, review cards, record creation, persistence + sidebar badge |
| 2026-06-09 | Phase 1.5 Task 7: UI gates confirmed complete (audit across export + import screens) |
| 2026-06-09 | Phase 1.5 Task 6: Delta import and merge — PK/FK remap, conflict UI, apply + JSON report |
| 2026-06-09 | Export screen: all export buttons gated by `canEdit` (read-only mode blocks all exports) |
| 2026-06-09 | Phase 1.5 Task 5: Delta export confirmed complete |
| 2026-06-09 | Phase 1.5 Task 4: PK namespace for steward copies |
