# Data Quality Accelerator

A browser-based metadata management tool for the Ministry of Justice (MoJ) Data Management practice, built as a proof-of-concept by Cognizant Technology Consulting. The application enables data stewards to manage Critical Data Elements (CDEs), data quality rules, organisational accountability, and field profiling metadata — with AI-assisted rule generation and a multi-user delta sync model for distributed collaboration.

---

## Overview

The DQ Accelerator is a single-file HTML application. All application logic, styles, and templates are bundled into one `.html` file that runs entirely in the browser. There is no server, no build pipeline, and no installation — the file can be opened directly in a browser or hosted on SharePoint without IT infrastructure changes.

---

## Architecture

### Runtime stack

| Layer | Technology | Rationale |
|---|---|---|
| UI framework | React 18 (via CDN) | Component model without build tooling |
| JSX compilation | Babel standalone (via CDN) | Browser-side JSX transpilation; no Node.js required |
| Persistence | localStorage | Zero-infrastructure storage; sufficient for single-user and delta-sync workflows |
| Styling | CSS custom properties (variables) | Theme-consistent dark UI without a CSS framework |
| AI integration | Claude / GitHub Copilot (copy-paste) | No API key required in the browser; prompt is assembled by the app, pasted by the user |

### Single-file constraint

The single-file model was a deliberate architectural decision driven by the deployment context — the file is hosted on SharePoint and accessed by data stewards without IT involvement. This rules out multi-file bundles, Node.js servers, and build pipelines.

**Consequences of this constraint:**

- All React components are top-level named functions (Babel standalone does not support anonymous default exports in some scoping contexts)
- No non-ASCII characters in JSX text nodes (Babel standalone rejects them; HTML entities are used instead)
- No ES module `import/export` syntax — all code is in a single `<script type="text/babel">` block
- CDN dependencies loaded via `<script>` tags in the document head

### Component model

The application uses React Context (`AppContext`) as its single state store. All application data, lookup tables, write operations, and navigation state are exposed via `useApp()`. Components are pure consumers — they read from context and call context-provided functions; they do not manage their own data state.

**Key context values:**

| Value | Type | Purpose |
|---|---|---|
| `data` | Object | All table data keyed by table name |
| `lookups` | Object | Pre-computed FK resolution maps |
| `stewardIdentity` | Object \| null | Current user's steward identity (`{ id, name }`) |
| `isMaster` | Boolean | Whether current user is the master steward |
| `canEdit` | Boolean | Whether the current user can make changes (`!!stewardIdentity`) |
| `upsertRecord` | Function | Create or update a record (gated by `canEdit`) |
| `retireRecord` | Function | Soft-delete a record (gated by `canEdit`) |
| `restoreRecord` | Function | Restore a retired record (gated by `canEdit`) |
| `nextPk` | Function | Generate the next PK for a table (namespace-aware) |

---

## Data model

The application implements 20 tables across 5 logical groups, based on the physical data model for the MoJ Data Quality Store (`mojdm_dataquality_store`).

### Group 1 — Data Quality Elements
`critical_data_set`, `critical_data_element`, `data_quality_rule`, `data_quality_rule_allocation`, `cde_criticality`, `stewardship`

### Group 2 — Ownership Hierarchy
`executive_agency`, `directorate`, `data_patron`, `data_owner`, `data_steward`

### Group 3 — Weights and Thresholds
`criticality_group_weight`, `quality_dimension_weight`

### Group 4 — Core Settings (read-only reference data)
`executive_agency_type`, `steward_role_type`, `quality_dimension`, `criticality_group`, `criticality_level`

### Group 5 — Physical Layer
`source_table_ddl`, `field_profiling`

### Schema definition

Every table is defined in a `SCHEMA` constant that drives form generation, validation, FK resolution, CSV export, and read-only enforcement. Each table entry includes:

- `pk` — primary key field name
- `label` — display name used in the sidebar and breadcrumbs
- `readOnly` — if true, no Add/Edit/Retire buttons are rendered for any user
- `cols` — column definitions: `name`, `type`, `label`, `required`, `fk`
- `fk` entries include `table`, `field`, and `display` for automatic lookup resolution

### Soft-delete pattern

Records are never hard-deleted. Retirement is implemented by setting `retiring_timestamp` to an ISO datetime string. All views default to showing only live records (`retiring_timestamp === null`) with an optional toggle to show retired records.

---

## SCHEMA-driven architecture

The `SCHEMA` object is the single source of truth for the entire application. It drives:

- **Form generation** — `RecordFormPanel` reads column definitions to render the correct input type for each field, including FK dropdowns populated from related tables
- **CSV export** — column names and order
- **Generic table view** — `GenericTableView` reads `readOnly` and column definitions to render the correct row layout and action buttons
- **PK generation** — `nextPk()` reads the schema to find the correct PK field per table
- **Delta sync** — `DELTA_TABLES` references schema-defined table names to determine which tables are steward-editable

This was proposed early in the design process as the foundation for the application. Starting from the physical data model (ERD) and encoding it as a structured schema before writing any UI code was the primary factor enabling rapid feature development.

---

## Persistence

### localStorage

All data is stored under the key `moj_dq_store_v1` as a serialised JSON object. Ancillary keys:

| Key | Content |
|---|---|
| `moj_dq_steward_identity` | Current user's steward identity `{ id, name }` |
| `moj_dq_base_version` | Version string of the last imported master file |
| `moj_dq_base_snapshot` | Hash map of all delta-tracked records at last master import |
| `moj_dq_client_logo_v1` | Base64-encoded client logo image |
| `moj_dq_sidebar_v1` | Sidebar collapsed/expanded state |

### Master JSON format

The master export produces a versioned JSON file:

```json
{
  "_type": "master",
  "_version": "master-YYYYMMDD-NNN",
  "_exported_at": "ISO timestamp",
  "data": { ...all table data... }
}
```

The version string increments per export per day (`master-20260601-001`, `master-20260601-002`, etc).

---

## Multi-user delta sync (Phase 1.5)

The application supports a distributed editing model without a shared database. Each data steward works from their own local copy of the HTML file. Changes are shared via delta JSON files and merged by a designated master user.

### Steward identity

Each user selects their identity from the `data_steward` table via the Settings panel. The selection is persisted in localStorage independently of the application data, so it survives a master import (data reset).

### Master designation

The master user is identified by a stewardship record with `critical_data_set_id = 0`. This sentinel value is a convention — it does not reference a real data set. The record is included in the master JSON export and is imported along with all other data. No special configuration is required.

This approach reuses the existing data model for access control rather than introducing a separate user management system.

### PK namespace

To prevent primary key collisions across steward copies, each steward's new records are assigned PKs in a namespace derived from their `data_steward_id`:

```
steward PK = steward_id × 1,000,000 + sequence
```

Examples: steward 5 creates records 5000001, 5000002, etc. Master uses the standard max+1 sequence (low numbers). Namespaces never collide.

`nextPk()` applies the namespace automatically for non-master steward copies. The master copy and unidentified sessions use the standard sequence.

### Delta-tracked tables

Only steward-editable tables are included in delta exports:

- `critical_data_element`
- `data_quality_rule`
- `data_quality_rule_allocation`
- `cde_criticality`
- `stewardship`
- `source_table_ddl`
- `field_profiling`

Master-managed tables (org hierarchy, weights, reference data) are excluded from deltas. Only the master copy can modify them.

### Base snapshot

On master import, a hash map is built across all delta-tracked tables:

```json
{ "critical_data_element": { "1001": "a3f9b2", "1002": "c7d4e1" }, ... }
```

Each record is hashed deterministically from its sorted JSON keys. This snapshot is stored in localStorage and used by the delta export to identify inserted, updated, and retired records since the last sync.

### Delta export

The delta export diffs current localStorage data against the base snapshot and produces:

```json
{
  "delta_version": "1.0",
  "steward_id": 5,
  "steward_name": "...",
  "exported_at": "ISO timestamp",
  "base_version": "master-YYYYMMDD-NNN",
  "changes": {
    "critical_data_element": {
      "inserted": [...],
      "updated":  [...],
      "retired":  [...]
    }
  }
}
```

### Delta import and merge (master only)

The master user imports a steward delta. The merge process:

1. Remaps all steward-namespace PKs to master-sequence PKs
2. Updates all FK references within the delta batch to match remapped PKs
3. Detects field-level conflicts (same record, same field, different value in master vs delta since base version)
4. Auto-applies non-conflicting changes
5. Presents a conflict resolution UI for conflicting fields (keep master / use delta)
6. Generates a downloadable merge report

After merge, stewards discard their local copy and re-import the new master. Steward identity is preserved across this reset.

---

## Read-only and permission model

### Three access levels

| Level | Condition | Capabilities |
|---|---|---|
| Unidentified | No steward identity set | Read-only; no writes |
| Steward | Identity set, not master | Edit delta-tracked tables; export delta |
| Master | Identity matches (0,0,0) stewardship record | All steward capabilities plus: edit restricted tables, export master, import delta |

### Read-only enforcement

Enforced at two levels:

**Source level** — `upsertRecord`, `retireRecord`, `restoreRecord`, and all `openForm` variants return early if `stewardIdentity` is null. Nothing can be written regardless of UI state.

**UI level** — A `canEdit` boolean (`!!stewardIdentity`) is exposed via context. Each view computes a `dp` (disabled props) object:

```javascript
const dp = !canEdit ? {
  style: { opacity: 0.35, cursor: 'not-allowed', pointerEvents: 'none' },
  title: 'Set your steward identity in Settings to make changes'
} : {};
```

This object is spread onto every write button (`{...dp}`). Buttons remain visible but are visually dimmed and non-interactive. `pointerEvents: 'none'` prevents clicks without touching any `onClick` handler.

A global amber banner is shown in the content area when no identity is set.

### Core settings protection

Tables in Group 4 (Core Settings) have `readOnly: true` in the schema. This is enforced at the `GenericTableView` level independently of `canEdit` — these tables are always read-only for all users.

---

## AI-assisted rule generation

The Data Rule Generator page assembles a structured prompt from:

- CDE metadata (field name, database, table, snapshot filter, physical type, semantic type)
- Profiling data (summary statistics, type patterns, top values, length distribution, notes)
- Instructions for the AI to return a JSON array with specific fields

The prompt instructs the AI to return complete Athena SQL (both COUNT and sample SELECT variants) using placeholder variables (`{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, `{SOURCE_FIELD_NAME}`).

The response parser handles Copilot and Claude output formats, including:

- Markdown code fences (` ```json ` wrappers)
- Markdown-escaped characters (`\_`, `\[`, `\*`)
- Invalid JSON escape sequences from regex patterns (`\d`, `\s`, `\w`)
- Surrounding prose before or after the JSON array

Parsed suggestions are rendered as cards with inline editable fields (rule name, dimension, frequency, bumper). A single "Add Rule and Allocate" button creates both the `data_quality_rule` record and the `data_quality_rule_allocation` record in one action.

Conflict detection checks whether the CDE already has a rule allocation for the same quality dimension, or whether a rule with a similar name already exists.

---

## Field profiling workflow

Field profiling is a 5-step SQL generation workflow. For a selected field, the application generates Athena SQL for:

1. **Summary profile** — null count, blank count, distinct values, row count, special characters, castability counts, date format counts
2. **Type pattern analysis** — breakdown by detected value type (INTEGER, DATE_DDMMYYYY, ALPHA, MIXED, etc.)
3. **Top values** — most frequent values and their counts
4. **Length distribution** — min, max, mean, and percentile length of values
5. **Future/invalid dates** — count of values that fail date parsing or are in the future

The SQL is type-aware — different templates are generated depending on the field's physical type (VARCHAR vs numeric). Results are pasted back into the profiling form and stored against the CDE's source coordinates (database, table, field).

---

## Navigation and layout

### Sidebar structure

- **Top nav** — Dashboard, Data Rule Generator, RAG Simulator, CDE Coverage, Export, Import
- **Data Quality Elements** — Quality Rule Navigator, Critical Data Set, Critical Data Element, Data Quality Rule, Rule Allocation, CDE Criticality, Stewardship
- **Ownership Hierarchy** — Organisation (chart), Executive Agency, Directorate, Data Patron, Data Owner, Data Steward
- **Weights and Thresholds** — Criticality Group Weight, Quality Dimension Weight
- **Core Settings** (read-only) — Executive Agency Type, Steward Role Type, Quality Dimension, Criticality Group, Criticality Level
- **Physical Layer** — Table Profiling, Field Profiling

The sidebar is collapsible. Record counts are shown on each table item.

### Routing

Routing is managed by a `route` state object in App: `{ screen, table }`. All navigation calls `navigate({ screen, table })` from context. There are no URLs or browser history entries.

---

## Known constraints and planned improvements

### Weights editing UI

Both the Quality Dimension Weight and Criticality Group Weight pages currently edit one weight at a time via a generic form. The planned redesign will show all dimensions/groups for a selected agency simultaneously on one screen, with save only enabled when all entries are complete.

### Svelte migration

A migration from React + Babel standalone to Svelte was evaluated and deferred. The single-file deployment model is a hard constraint that Svelte's compile-time architecture complicates. The appropriate point to revisit this is if a build pipeline is introduced for the SharePoint Lists backend (Phase 2).

### SharePoint Lists backend (Phase 2)

The planned Phase 2 replaces localStorage with SharePoint Lists via Microsoft Graph API and MSAL.js. This requires:

- An Azure AD app registration (Application ID, Tenant ID, Redirect URI)
- API permissions: `User.Read`, `Sites.Read.All`, `Sites.ReadWrite.All` (delegated)
- Admin consent granted for the organisation
- 20 SharePoint Lists provisioned (one per table)
- MSAL.js authentication integrated into the app shell

The rest of the application — all views, forms, simulators — remains unchanged. Only the data read/write layer changes.

---

## Development notes

### Babel constraints (non-negotiable)

- No non-ASCII characters in JSX text nodes — use HTML entities (`&mdash;`, `&times;`, etc.)
- All sub-components must be top-level named functions — anonymous components inside other components cause Babel scoping errors
- No ES module syntax — everything in one `<script type="text/babel">` block

### Build verification checklist

After every code change:

1. Brace balance: `script.count('{') - script.count('}')` must equal 0
2. No duplicate function names
3. No orphaned code blocks (check line count delta after large replacements)
4. `{...dp}` spread present on all write buttons in views
5. `dp` helper declared exactly once per view function

---

*Data Quality Accelerator — Cognizant Technology Consulting for Ministry of Justice*
*Revision: v0.2 | June 2026*