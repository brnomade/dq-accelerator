# Step 2 — Navigation Shell

**Status:** Complete  
**Deliverable:** `dq_store_v2.html`  
**Date completed:** June 2026  
**Builds on:** Step 1 (`dq_store_v1.html`) — all Step 1 logic preserved verbatim

---

## Overview

Step 2 transforms the Step 1 bootstrap tool into a full application frame. It adds a persistent shell (header, sidebar, content area, footer), a global state context, and a suite of specialised views for the most important tables. All Step 1 functionality (import, data health, export) is preserved and integrated into the new shell.

---

## Tasks completed

### Task 1 — Global state context

`AppContext` is provided directly by the root `App` component (no separate provider wrapper — data is initialised synchronously from `localStorage` via `useMemo` to avoid the stale-state problem of `useEffect`-based initialisation).

The context exposes:

| Value / function | Description |
|---|---|
| `data` | Full 18-table state object |
| `lookups` | `{tableName}ById` maps, auto-rebuilt via `useMemo` on every data change |
| `savedAt` | ISO timestamp of last localStorage write |
| `hasData` | Boolean convenience flag |
| `updateTable(tableName, rows)` | Replace an entire table and persist |
| `upsertRecord(tableName, record)` | Insert or update a single record by PK and persist |
| `retireRecord(tableName, pkValue)` | Set `retiring_timestamp` to now and persist |
| `restoreRecord(tableName, pkValue)` | Clear `retiring_timestamp` and persist |
| `nextPk(tableName)` | Return `max(pk) + 1` for the given table |

`useApp()` is the hook consumed by all screens.

---

### Task 2 — App layout shell

Three-zone layout filling `100vh`:

- **Header** — full width, fixed height 52px, sticky, `z-index: 200`
- **Body** — `display: flex`, fills remaining height; sidebar on left, scrollable content area on right
- **Footer** — full width, fixed height 32px, `z-index: 200`

The body uses `overflow: hidden` to contain independent scrolling in the sidebar and content area.

---

### Task 3 — Header with client logo

**`AppHeader`** component. Two zones:

- **Left** — client logo slot, width mirrors the sidebar (collapses when sidebar collapses). Shows either the stored logo image or a `DQ` placeholder.
- **Right** — record count, last-saved time, settings gear, reset button.

**`LogoSettingsPanel`** — opens as a fixed overlay from the gear icon. Accepts any image file via drag-and-drop or file picker. The image is stored as a base64 data URL under `localStorage` key `moj_dq_client_logo_v1`. Persists across sessions. Can be removed with a "Remove logo" button.

---

### Task 4 — Footer

**`AppFooter`** — slim 32px bar. Left: `© {year} Cognizant Technology Solutions`. Right: Cognizant wordmark as inline SVG text. All rendered with CSS variables — adapts to any future theme changes.

---

### Task 5 — Collapsible sidebar

**`Sidebar`** component. Two persistent states stored in `localStorage`:

| Key | Content |
|---|---|
| `moj_dq_sidebar_v1` | `{ collapsed: boolean }` — sidebar expanded/collapsed preference |
| `moj_dq_groups_v1` | `{ [groupId]: boolean }` — per-group collapsed state |

**Expanded state** (220px): group headers with chevrons, table nav items with live record count badges.

**Collapsed state** (48px): one coloured dot per group; clicking any dot expands the sidebar.

**Special nav items** (not table rows — custom screens injected at the top of their group):

| Item | Group | Screen route |
|---|---|---|
| Organisation | Ownership Hierarchy | `orgchart` |
| Quality Rule Navigator | Data Quality Elements | `rulenav` |

The collapse toggle arrow sits at the bottom of the sidebar and notifies `App` via `onToggle` prop so the header logo slot width stays in sync.

---

### Task 6 — Generic table view

**`GenericTableView`** — works for all 18 tables from the schema definition alone. No table-specific code required.

Features:
- Search bar filtering across the 2–3 most meaningful display fields (defined in `getDisplayFields`)
- Show retired toggle (hidden if no retired records exist)
- FK values resolved to display names via `resolveDisplayValue` — no raw IDs shown
- Retire action with confirmation step; restore action (no confirmation)
- "Add record" button placeholder (wired up in a future step)

**`getDisplayFields(tableName)`** — returns the ordered list of fields to show as primary and secondary display for each table. Overrides defined for all 18 tables.

**`resolveDisplayValue(tableName, fieldName, value, data)`** — resolves FK integer values to their display string using the schema `fk` definition. Handles booleans (`true/false` → `Yes/No`). Returns `'—'` for null.

**Alphabetical sort** — the following tables are sorted by their natural name field using `localeCompare`:

| Table | Sort field |
|---|---|
| `data_quality_rule` | `rule_name` |
| `criticality_level` | `criticality_description` |
| `criticality_group` | `criticality_group_description` |
| `quality_dimension` | `dimension_name` |
| `steward_role_type` | `role_description` |
| `data_steward` | `data_steward_name` |
| `data_owner` | `data_owner_name` |
| `data_patron` | `data_patron_name` |

**Custom two-row renderers** (inline within `GenericTableView`) for tables where the default layout is insufficient:

- **`data_owner`** — top row: name + title; bottom row: agency acronym — directorate name (resolved via `directorate.executive_agency_id`)
- **`data_patron`** — top row: name + title; bottom row: agency acronym — assignment start date (formatted `DD Mon YYYY`)

---

## Specialised views (beyond GenericTableView)

### `DirectorateView`

Replaces the generic view for `directorate`. Groups all directorates by agency (sorted A→Z by acronym), with each agency as a card and sub-rows per directorate. Each sub-row shows the directorate acronym pill and full name. Search filters across agency and directorate fields.

**Join:** `directorate.executive_agency_id → executive_agency`

---

### `CriticalDataSetView`

Replaces the generic view for `critical_data_set`. Groups all data sets by agency (via directorate), sorted A→Z by agency acronym, then A→Z by data set name within each agency.

Each card shows agency acronym + full name + data set count. Each sub-row shows data set name (top) and parent directorate name (bottom).

**Join chain:** `critical_data_set.directorate_id → directorate.executive_agency_id → executive_agency`

---

### `AggregatedWeightView`

Shared by `criticality_group_weight` and `quality_dimension_weight`. Groups records by agency, one card per agency. Within each card, the weight entries are rendered as small boxes (not rows), each showing:

- Dimension/group acronym (top, in accent colour)
- Weight value (centre, prominent monospace)
- Row ID (bottom, muted)
- Hover-reveal retire/restore button

The box sizes are intentionally compact to match the overall design density. Tooltips on each box show the full dimension/group description.

**`isCriticality` flag** distinguishes the two tables and resolves the correct FK fields (`criticality_group_id` vs `quality_dimension_id`) and display fields.

---

### `OwnershipOrgChart` (screen: `orgchart`)

Collapsible list of all agencies. Each agency row shows acronym, full name, directorate count, and the patron name as a preview on the collapsed header.

Clicking a row expands the full accountability hierarchy:
- **Patron** — resolved from `data_patron.executive_agency_id`
- **Directorates** (sorted A→Z) — each showing name and data set count
  - **Owner** — resolved from `data_owner.directorate_id`
  - **Stewards** — aggregated across all data sets in the directorate via `stewardship → critical_data_set → directorate`. Each steward appears once regardless of how many data sets they steward. Role resolved from `steward_role_type`.

Show-retired toggle applies to all agencies simultaneously. All absent assignments show "none assigned".

**Helper components** (defined outside `OwnershipOrgChart` to avoid Babel standalone issues):
- `OrgRolePill` — small labelled pill with role colour
- `OrgPersonChip` — name + subtitle chip
- `OrgNone` — italic "none assigned" span

---

### `DataQualityRuleView` (screen: `rulenav`, menu label: Quality Rule Navigator)

Sorted alphabetically by `rule_name`. Each rule is a collapsible row showing name, truncated explanation, CDE count badge, automated badge, and retire/restore action.

When expanded, shows all CDE allocations for that rule in a five-column grid:

| Column | Content |
|---|---|
| Critical data element | Field name (monospace) + data set name + agency acronym (top); table name + database name (bottom) |
| Dimension | Quality dimension name in accent colour |
| Frequency | Run frequency |
| Bumper | Numeric value as amber badge, or `--` |
| SQL | Two icon buttons (see below) |

**Error flag** — if `source_snapshot_filter` is null on a CDE, the row border turns red, a warning icon appears, and the SQL buttons are disabled. The snapshot filter is required for SQL composition.

**SQL icon buttons:**
- `</>` (Code icon, blue) — opens `SqlPanel` with the composed rule SQL
- Table icon (muted) — opens `SqlPanel` with the composed sample SQL. If `sql_code_sample` is null, replaced with a `DEF` badge (engine uses default approach)

---

### `composeSql(template, cde, mode)`

Substitutes the three placeholders in SQL templates without any case transformation, preserving the original SQL exactly. The snapshot filter receives the same substitution before being appended.

```
Placeholders (case-insensitive match):
  {SOURCE_DATABASE_NAME} → cde.source_database_name
  {SOURCE_TABLE_NAME}    → cde.source_table_name
  {SOURCE_FIELD_NAME}    → cde.source_field_name

Append:
  mode = 'rule'   → sql + ' AND '   + substituted_snapshot_filter
  mode = 'sample' → sql + ' WHERE ' + substituted_snapshot_filter
```

Case-insensitive regex flags (`/gi`) are used because the snapshot filter in source data uses lowercase placeholder names while rule SQL uses uppercase — both are matched correctly.

---

### `SqlPanel`

Fixed slide-in panel (right side, 600px wide, `z-index: 400`). Semi-transparent backdrop closes the panel on click.

Shows:
- Mode label (Rule SQL / Sample SQL) in accent colour
- Rule name
- CDE field name, data set name, agency acronym as context
- Fully composed SQL in a `<pre>` monospace block with word-wrap
- The substituted snapshot filter shown separately below for transparency
- **Copy** button — writes SQL to clipboard via `navigator.clipboard.writeText`

Animates in via `@keyframes slideInRight`.

---

## Routing table

| `route.screen` | `route.table` | Component rendered |
|---|---|---|
| `import` | — | `ImportScreen` |
| `dashboard` | — | `DashboardScreen` |
| `export` | — | `ExportScreen` |
| `orgchart` | — | `OwnershipOrgChart` |
| `rulenav` | — | `DataQualityRuleView` |
| `table` | `directorate` | `DirectorateView` |
| `table` | `critical_data_set` | `CriticalDataSetView` |
| `table` | `criticality_group_weight` | `AggregatedWeightView` |
| `table` | `quality_dimension_weight` | `AggregatedWeightView` |
| `table` | any other | `GenericTableView` |

---

## Sidebar nav structure

```
Dashboard
Export
Import
──────────────────
Data Quality Elements
  Quality Rule Navigator    [rulenav]
  Critical Data Set         [table: critical_data_set]
  Critical Data Element     [table: critical_data_element]
  Data Quality Rule         [table: data_quality_rule]
  Rule Allocation           [table: data_quality_rule_allocation]
  CDE Criticality           [table: cde_criticality]
  Stewardship               [table: stewardship]

Ownership Hierarchy
  Organisation              [orgchart]
  Executive Agency          [table: executive_agency]
  Directorate               [table: directorate]
  Data Patron               [table: data_patron]
  Data Owner                [table: data_owner]
  Data Steward              [table: data_steward]

Weights & Thresholds
  Criticality Group Weight  [table: criticality_group_weight]
  Quality Dimension Weight  [table: quality_dimension_weight]

Core Settings (all read-only)
  Executive Agency Type     [table: executive_agency_type]
  Steward Role Type         [table: steward_role_type]
  Quality Dimension         [table: quality_dimension]
  Criticality Group         [table: criticality_group]
  Criticality Level         [table: criticality_level]
```

---

## localStorage keys

| Key | Content |
|---|---|
| `moj_dq_store_v1` | Full data state + `savedAt` timestamp (from Step 1) |
| `moj_dq_client_logo_v1` | Base64 data URL of client logo image |
| `moj_dq_sidebar_v1` | `{ collapsed: boolean }` |
| `moj_dq_groups_v1` | `{ [groupId]: boolean }` per-group collapsed state |

---

## Known decisions and notes

- **Babel standalone unicode** — all non-ASCII characters in JSX text nodes use plain ASCII equivalents to avoid Babel 7 CDN compilation errors. Non-ASCII in JS comments is safe and preserved.
- **Sub-components outside parent functions** — `OrgRolePill`, `OrgPersonChip`, `OrgNone` are defined as top-level named functions rather than inline arrow functions to avoid Babel standalone issues with nested JSX-returning arrow functions.
- **`position: fixed` panels** — `SqlPanel` uses `position: fixed` rather than a portal because the app has `overflow: hidden` on the body shell, which would clip a non-fixed overlay.
- **`data_quality_rule` has two views** — the simple generic row view (management) and the Quality Rule Navigator (analysis + SQL composition). They are separate routes and serve different purposes.
- **Steward aggregation** — in `OwnershipOrgChart`, stewards are aggregated at the directorate level (unique steward IDs across all data sets in the directorate). Each steward appears once with their role, regardless of how many data sets they steward.

---

## Files

| File | Description |
|---|---|
| `dq_store_v2.html` | Complete Step 2 deliverable — open in any modern browser |

---

*Next: Step 2 Task 7 — CDE-centric detail view, then Add Record for all tables.*
