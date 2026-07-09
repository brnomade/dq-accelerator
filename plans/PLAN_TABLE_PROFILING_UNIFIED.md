# Implementation Plan: Table & Field Profiling — Unified Screen

**Design ref:** `designs/DESIGN_TABLE_PROFILING_UNIFIED.md`  
**Status:** Complete — signed off 2026-06-11  
**Primary file:** `src/200_screen_ddl.js`  
**Supporting files:** `src/201_ddl_form_panel.js`, `src/10_constants.js`

---

## Review gate

> **Do not begin implementation until the design has been reviewed and approved.**  
> Update the status line above to `Approved — ready to implement` after review sign-off.

---

## Task list

Tasks are numbered and ordered by dependency. Status is updated in place as work progresses.

| # | Status | Task |
|---|---|---|
| 1 | `completed` | Schema: add `profiled_by` to `field_profiling` |
| 2 | `completed` | Data logic: SQL parsing utilities |
| 3 | `completed` | Data logic: agenda assembly function |
| 4 | `completed` | Component: `ProfilingSummaryStrip` |
| 5 | `completed` | Component: `FieldRow` |
| 6 | `completed` | Component: `DimCoverageFooter` |
| 7 | `completed` | Component: `TableGroupRow` with inline DDL actions |
| 8 | `completed` | Component: `ProfilingView` (outer container + toolbar) |
| 9 | `completed` | Panel: adapt `FieldProfilingScreen` as slide-in |
| 10 | `removed` | Panel: DDL gate step inside profiling panel — removed by design decision; table and field profiling are independent |
| 11 | `completed` | Feature: My data scope toggle + localStorage persistence |
| 12 | `completed` | Feature: Status filter dropdown |
| 13 | `completed` | Feature: SQL-origin heuristic notice + dismiss |
| 14 | `completed` | Feature: "database unknown" group for unqualified SQL refs |
| 15 | `completed` | Wiring: replace `DDLLibraryView` with `ProfilingView` in screen entry point |
| 16 | `completed` | Build and smoke test — signed off 2026-06-11 |
| 17 | `completed` | Post-plan polish — see section below |

---

## Task details

### Task 1 — Schema: add `profiled_by` to `field_profiling`

**File:** `src/10_constants.js`

Add a new column to the `field_profiling` table definition in `SCHEMA`:

```js
{ name: 'profiled_by', type: 'str', label: 'Profiled By' },
```

Insert after the existing `profiled_at` column. This field is optional (`null` when no steward identity is set). It is populated at save time from `stewardIdentity.name`.

No data migration needed — existing records without the field will read as `null`.

---

### Task 2 — Data logic: SQL parsing utilities

**File:** `src/200_screen_ddl.js` (new helper functions, above component definitions)

Write two pure functions. No React, no side effects.

#### `parseTableRefs(sqlCode)`

Strips placeholder tokens (`{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, `{SOURCE_FIELD_NAME}`) from the SQL, then extracts all `FROM` / `JOIN` table references.

Returns an array of `{ db, table, alias }` objects where `db` may be `null` for unqualified references.

```
Input:  "SELECT * FROM hmpps_db.offender_table o JOIN ref_codes r ON ..."
Output: [
  { db: 'hmpps_db', table: 'offender_table', alias: 'o' },
  { db: null,       table: 'ref_codes',       alias: 'r' }
]
```

Regex pattern: `(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?`

#### `parseFieldRefs(sqlCode, tableRefs)`

Takes the output of `parseTableRefs` (for alias resolution) and extracts qualified `alias.field` or `table.field` references.

Returns an array of `{ db, table, field }` objects. `db` may be `null` when the table matched only by name (no alias with a db prefix).

Regex pattern: `\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b`

Both functions are case-insensitive (lower-case the SQL input before matching).

---

### Task 3 — Data logic: agenda assembly function

**File:** `src/200_screen_ddl.js` (new helper, above component definitions)

#### `buildProfilingAgenda({ cdes, rules, fieldProfiling, ddls, scopeAgencyId })`

Returns a list of `tableGroup` objects used to render the page.

**Step 1 — Collect CDE fields (Source 1)**

Iterate `cdes`. Include records where:
- `status` is not `retired`
- `source_database_name`, `source_table_name`, `source_field_name` are all non-empty
- If `scopeAgencyId` is set, the CDE's parent CDS belongs to that agency

Build a map keyed by `db|table|field`. For each entry record:
- `origin: 'CDE'`
- `ruleCount`: count of live `data_quality_rule_allocation` records for this CDE

**Step 2 — Collect SQL-extracted fields (Source 2)**

Iterate all live `data_quality_rule` records. For each rule, call `parseTableRefs` + `parseFieldRefs` on `sql_code` (and `sql_code_sample` if populated). Strip placeholder references that match a CDE field already in the map from Step 1.

If `scopeAgencyId` is set, restrict to rules allocated to at least one in-scope CDE.

Merge into the same map. For existing entries: upgrade `origin` to `'CDE+SQL'`. For new entries: set `origin: 'SQL'`.

**Step 3 — Group by `db + table`**

```js
[
  {
    db: 'hmpps_db',
    table: 'offender_table',
    ddl: { /* source_table_ddl record or null */ },
    fields: [
      {
        field: 'offender_id',
        origin: 'CDE',          // 'CDE' | 'SQL' | 'CDE+SQL'
        ruleCount: 2,
        type: 'INT',            // from ddl.parsed_columns, null if no DDL
        profiling: { /* field_profiling record or null */ },
        dimCoverage: [          // one entry per quality_dimension, in order
          { acronym: 'ACC', covered: true },
          ...
        ],
      },
      ...
    ],
    profilingStats: { total, profiled, notProfiled },
    coverageStats:  { full, partial, none },
  },
  ...
]
```

Entries where `db` is `null` are grouped under a single synthetic table group with `db: null, table: <tableName>`.

This function is called inside a `useMemo` — inputs are taken from `AppContext`. It is not persisted.

---

### Task 4 — Component: `ProfilingSummaryStrip`

**File:** `src/200_screen_ddl.js`

Two-row fixed summary bar at the top of the content area. Always visible.

```
Profiling:  ⚠ DDL missing: 3   ⚠ Not profiled: 14   ✓ Profiled: 24
Coverage:   ○ No rules: 8      ◑ Partial: 28         ● Full: 14
```

Props: `{ profilingStats, coverageStats }` — aggregated from `buildProfilingAgenda` output.

---

### Task 5 — Component: `FieldRow`

**File:** `src/200_screen_ddl.js`

Single field row within an expanded table group. Renders:

- Col 1 (flex): profiling icon (✓ green / ⚠ amber) + field name (monospace) + source badge (`[CDE]` / `[SQL]`) + rule count chip if > 0
- Col 2 (58px): physical type badge (grey, from DDL)
- Cols 3–8 (38px each): one cell per quality dimension — ● green if covered, ─ grey if not
- Col 9 (52px): coverage fraction `N/6`, colour-coded
- Col 10 (90px): `[Profile]` button if not yet profiled; empty if profiled

**Row states:**
- Not profiled + coverage > 0: amber left border (rules running blind — highest urgency)
- Profiled: muted text, no CTA
- SQL origin: no left border unless also rules running blind

Hover on profiling icon: tooltip — `Profiled by <name> · <date>` or `Not yet profiled`.

Props: `{ fieldEntry, dimensions, onProfile }` where `onProfile(fieldEntry)` opens the slide-in panel.

---

### Task 6 — Component: `DimCoverageFooter`

**File:** `src/200_screen_ddl.js`

A footer row at the bottom of each expanded table group showing per-dimension coverage percentages across all fields in that group.

```
Dimension coverage    50%   75%   25%   50%   50%   25%
```

One cell per dimension aligned with the FieldRow dimension columns. Percentage = (fields covered by this dimension) / (total fields in group).

Props: `{ fields, dimensions }`.

---

### Task 7 — Component: `TableGroupRow`

**File:** `src/200_screen_ddl.js`

Collapsible table group. Manages its own expand/collapse state (`useState`).

**Header — DDL present:**
```
▶/▼  <table>  (<db>)   N fields · M/N profiled · [mini bar] XX%   ✎  👁‍
```

**Header — no DDL:**
```
▶/▼  <table>  (<db>)   N fields · DDL ⚠ missing                  [+ Add DDL]
```

Inline action buttons (right-aligned):
- **Pencil icon** — calls `onEditDDL(tableGroup)`, opens `DDLFormPanel` in edit mode
- **Eye-off icon** — calls `onRetireDDL(tableGroup)`, marks DDL retired
- **`+ Add DDL` button** — calls `onAddDDL(tableGroup)`, opens `DDLFormPanel` pre-filled with `db` + `table`

When expanded, renders:
1. Column header row (Field / Type / ACC / COM / TIM / CON / UNQ / VAL / Cov / Action)
2. One `FieldRow` per field
3. `DimCoverageFooter`
4. SQL-origin heuristic notice if any SQL fields present (dismissible — see Task 13)

Props: `{ tableGroup, dimensions, onProfile, onEditDDL, onRetireDDL, onAddDDL, dismissedGroups, onDismiss }`.

---

### Task 8 — Component: `ProfilingView`

**File:** `src/200_screen_ddl.js`

Outer container. Owns:
- `useMemo` call to `buildProfilingAgenda`
- Search input state
- My data toggle state (read/write `moj_dq_profiling_scope_v1` in localStorage)
- Status filter state
- Active slide-in panel state (`null` | `{ type: 'profile', fieldEntry }` | `{ type: 'ddl', tableGroup, mode }`)
- SQL dismiss state (read/write `moj_dq_profiling_dismiss_v1` in localStorage)

**Toolbar layout:**
```
[ 🔍 Search table or field... ]   [ My data ☑ ]   Status: [ All ▾ ]
```

Renders:
1. Toolbar
2. `ProfilingSummaryStrip`
3. List of `TableGroupRow` components (filtered by search + status)
4. Slide-in `FieldProfilingPanel` or `DDLFormPanel` when active

**Status filter options** (see design Section 5.8):
- All
- Needs DDL
- Needs profiling
- Rules running blind
- Profiled

---

### Task 9 — Panel: adapt `FieldProfilingScreen` as slide-in

**File:** `src/200_screen_ddl.js`

The existing `FieldProfilingScreen` component currently renders as a full-page section. Adapt it to:
- Accept a `fieldEntry` prop (pre-scoped — no table/field selectors needed)
- Render inside a slide-in panel overlay (same pattern as other panels in the app)
- Show panel header: field name · table (db) · type · CDE/rule count context line
- Pass `profiled_by` = `stewardIdentity.name` on save (falls back to `null`)

The internal step structure (Step 1 semantic type, Step 2 SQL queries, Step 3 notes) remains unchanged.

---

### Task 10 — Panel: DDL gate step

**File:** `src/200_screen_ddl.js`

When the profiling panel is opened for a field whose table has no DDL, prepend a gate step:

```
Before profiling this field, add the CREATE TABLE DDL for <table> (<db>).
[ Paste CREATE TABLE statement here... ]
[ Parse & Save DDL ]   [ Cancel ]
```

After `Parse & Save DDL` succeeds, advance to Step 1 of the profiling workflow without closing the panel. Reuse the parse-and-save logic already in `DDLFormPanel`.

---

### Task 11 — Feature: My data scope toggle + localStorage

**File:** `src/200_screen_ddl.js`

The My data toggle in the toolbar reads/writes `moj_dq_profiling_scope_v1` in localStorage (`'my'` | `'all'`).

Default: `'my'` if a steward identity is set; `'all'` if not.

When `'my'` and no steward identity: toggle is greyed out with tooltip `"Set your steward identity in Settings to filter by agency."`.

The toggle value is passed as `scopeAgencyId` into `buildProfilingAgenda` — either the steward's `executive_agency_id` or `null` (all data).

---

### Task 12 — Feature: Status filter dropdown

**File:** `src/200_screen_ddl.js`

The Status `<select>` in the toolbar filters the `tableGroups` array returned by `buildProfilingAgenda`. Filtering happens at the field level; a table group is hidden only when all its fields are filtered out.

| Filter value | Include field row when |
|---|---|
| `all` | Always |
| `needs_ddl` | Table group has no DDL |
| `needs_profiling` | DDL exists + no profiling record |
| `rules_blind` | No profiling record + ruleCount > 0 |
| `profiled` | Has a profiling record |

---

### Task 13 — Feature: SQL-origin notice + dismiss

**File:** `src/200_screen_ddl.js`

When a table group contains at least one SQL-origin field, render a dismissible info banner inside the expanded group:

> ⓘ  N field(s) on this table were extracted from rule SQL — verify they are relevant before profiling.  [Dismiss]

Dismissed groups are stored as a set of `db|table` keys in `localStorage` under `moj_dq_profiling_dismiss_v1` (JSON array). Dismissals persist for the session but are cleared on next data import.

---

### Task 14 — Feature: "database unknown" group

**File:** `src/200_screen_ddl.js`

SQL-extracted fields where `db` is `null` are grouped into a synthetic table group rendered at the bottom of the list:

```
▶  <table>  (database unknown)
   N fields  ·  DDL ⚠ missing                      [+ Add DDL]
   SQL-extracted reference — database name could not be determined.
```

`+ Add DDL` opens `DDLFormPanel` without a pre-filled database. Once saved with a database name, the group re-keys under the resolved `db + table` pair (handled automatically by `buildProfilingAgenda` on next render).

---

### Task 15 — Wiring: replace `DDLLibraryView` with `ProfilingView`

**File:** `src/200_screen_ddl.js`

Replace the current screen entry point — which renders `DDLLibraryView` followed by `FieldProfilingScreen` — with a single `<ProfilingView />` render. Remove `DDLLibraryView` and the standalone `FieldProfilingScreen` page section.

The screen export (`DDLScreen` or equivalent) stays; only its render body changes.

---

### Task 16 — Build and smoke test

Run `python build.py` from the `build/` directory. Open `dist/dq-accelerator.html` in a browser.

Verify:
- [ ] Page loads without console errors
- [ ] Table & Field Profiling nav item opens the unified view
- [ ] At least one table group renders (requires data loaded from import)
- [ ] Expand/collapse a table group
- [ ] Click `[Profile]` — panel opens scoped to correct field
- [ ] Click pencil icon — `DDLFormPanel` opens in edit mode
- [ ] Click `+ Add DDL` — `DDLFormPanel` opens with db/table pre-filled
- [ ] My data toggle filters table groups
- [ ] Status filter `Rules running blind` shows only amber-bordered rows
- [ ] SQL-origin notice appears and can be dismissed
- [ ] Build output contains no non-ASCII characters (build script validates this)

---

## Post-plan polish (Task 17) — completed 2026-06-11

Additional items resolved after the original plan tasks were signed off:

| Item | Detail |
|---|---|
| Design Q6 closed | `source_field_name` is required on CDE creation — incomplete coordinates cannot occur |
| Design Q7 resolved | Orphaned DDLs hidden by default; "Show extras" toggle added to filter row (right side); count badge shown |
| Design Q8 resolved | Database-unknown SQL groups remain visible always as a separate section — they signal actionable work |
| DDL gate removed | Gate step inside `FieldProfilingPanel` fully removed (state, handlers, JSX, props); table and field profiling are independent |
| Scope filtering bug fixed | BLIND RULES stat blob was counting all rules ignoring `scopeCdsIds`; fixed to filter CDEs and allocations by scope |
| FIELD PROFILING TBC bug fixed | TBC condition changed from `tableProfiled === 0` to `totalFields === 0`; fields from CDEs are always known even without a DDL |
| UK date format | All profiling dates now stored and displayed as `dd/mm/yyyy` |
| Tooltips | Table profiled badge: "Profiled on [date] by [user]"; field checkmark: same format |
| Table profiling panel (`201_ddl_form_panel.js`) | Added Last Profiled box (date + by user); `parsed_by` saved on save; hook ordering fixed (TDZ bug); column headers cleaned up; textarea height reduced; field table height increased; flex stretch removed in Add mode |
| Field row left border removed | `FieldRow` no longer has a coloured left border; amber background tint retained for blind-rule rows |
| "Field Profiling" nav item removed | `field_profiling` excluded from sidebar table loop (stays in TABLE_GROUPS for CSV export) |

## File change summary

| File | Change |
|---|---|
| `src/10_constants.js` | Added `profiled_by` to `field_profiling`; added `parsed_by` to `source_table_ddl` |
| `src/200_screen_ddl.js` | Full rewrite (Tasks 2–15) + post-plan polish (Task 17) |
| `src/201_ddl_form_panel.js` | Last Profiled box; `parsed_by` save; hook ordering fix; UI sizing; column header labels |
| `src/80_sidebar.js` | Skip `field_profiling` in table nav loop |
| `src/240_app.js` | Pass `stewardIdentity` prop to `DDLFormPanel` |

---

## Completed tasks

| # | Task | Notes |
|---|---|---|
| 1 | Schema: `profiled_by` added to `field_profiling` | `src/10_constants.js` — inserted after `profiling_notes` |
| 2 | SQL parsing utilities | `parseTableRefs` + `parseFieldRefs` in `src/200_screen_ddl.js` |
| 3 | Agenda assembly | `buildProfilingAgenda` — CDE + SQL field merge, grouped by db+table |
| 4 | `ProfilingSummaryStrip` | Two-row profiling + coverage chip bar |
| 5 | `FieldRow` | Field grid row with dim dots, origin badge, Profile/Re-profile button |
| 6 | `DimCoverageFooter` | Per-dimension % footer aligned to FieldRow columns |
| 7 | `TableGroupRow` | Collapsible group with inline pencil/eye-off/+Add DDL actions |
| 8 | `ProfilingView` | Outer container, toolbar (search + My data + Status), renders agenda |
| 9 | `FieldProfilingPanel` | Slide-in panel replacing standalone FieldProfilingScreen |
| 10 | DDL gate step | Auto-shown when table has no DDL; saves DDL then advances to profiling |
| 11 | My data toggle | Reads/writes `moj_dq_profiling_scope_v1` in localStorage |
| 12 | Status filter dropdown | Needs DDL / Needs profiling / Rules blind / Profiled |
| 13 | SQL-origin notice | Dismissible info banner; dismissals in `moj_dq_profiling_dismiss_v1` |
| 14 | Database unknown group | SQL refs with no db grouped at bottom with `database unknown` label |
| 15 | Wiring | `DDLLibraryView` and `FieldProfilingScreen` are stubs returning `<ProfilingView/>` |
