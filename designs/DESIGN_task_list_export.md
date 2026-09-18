# DESIGN: Task List Export Tab

**Feature:** Task List CSV export for Trello card creation  
**Branch:** feature/task-list-export  
**Status:** Delivered — build-20260918-1828

---

## 1. Overview

A new **Task List** tab in the Export Screen generates a scoped CSV of data quality rule allocations. Each row represents one active allocation and provides all context needed to create a Trello implementation card. Two card types are distinguished: **TEST** (SQL already defined — verify it works) and **IMPLEMENT** (SQL not yet written — someone must write it).

---

## 2. Scope and Visibility

| User type | Visible? | Data scope |
|-----------|----------|------------|
| Master (`isMaster = true`) | Yes | All active allocations across all CDSs |
| Steward (identity set, not master) | Yes | Only allocations for CDEs in their assigned CDSs |
| Unidentified (non-master, no `stewardIdentity`) | Yes (tab shown) | Empty — message directs user to set identity |

Scoping reuses the existing `getMyStewardCdsIds(data, stewardIdentity)` utility from `20_data_utils.js`. A `null` result from that function (master, or no assignments) means all rows are included; a Set result means filtering applies.

---

## 3. CSV Structure

One row per active `data_quality_rule_allocation`. Retired allocations, CDEs, and rules are excluded.

| # | Column header | Source | Derivation path | Notes |
|---|--------------|--------|-----------------|-------|
| 1 | Task Type | Derived | — | `'TEST'` if `rule.sql_code` is non-empty; `'IMPLEMENT'` otherwise |
| 2 | Agency Acronym | `executive_agency.agency_acronymn` | allocation → CDE → CDS → directorate → executive_agency | |
| 3 | CDS Name | `critical_data_set.data_set_name` | allocation → CDE → CDS | |
| 4 | CDE Table | `critical_data_element.source_table_name` | allocation → CDE | |
| 5 | CDE Database | `critical_data_element.source_database_name` | allocation → CDE | |
| 6 | CDE Field | `critical_data_element.source_field_name` | allocation → CDE | |
| 7 | Quality Dimension | `quality_dimension.dimension_name` | allocation → quality_dimension | |
| 8 | Rule Name | `data_quality_rule.rule_name` | allocation → rule | |
| 9 | Rule Explanation | `data_quality_rule.rule_explanation` | allocation → rule | May be null |
| 10 | Steward Name | `data_steward.data_steward_name` | CDE's CDS → stewardship → data_steward (active only) | Multiple stewards concatenated with ` - ` |
| 11 | SQL Code | Composed | `composeSql(rule.sql_code, cde, 'rule')` | Empty string when Task Type = IMPLEMENT |
| 12 | SQL Sample | Composed | `composeSql(rule.sql_code_sample, cde, 'sample')` | Empty string when IMPLEMENT or no sample |
| 13 | SQL Snapshot Filter | Substituted | `substituteCdeTokens(cde.source_snapshot_filter, cde)` | Empty string when IMPLEMENT |

### SQL composition note

`composeSql` (defined in `90_panels.js`) substitutes `{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, `{SOURCE_FIELD_NAME}` into the template, then appends the snapshot filter (`AND <filter>` for rule mode, `WHERE <filter>` for sample mode). This produces ready-to-run SQL for the specific CDE. The Snapshot Filter column shows the substituted filter expression on its own (useful reference).

---

## 4. Filename Pattern

| User type | Filename |
|-----------|----------|
| Master | `dq_task_list_master_{YYYYMMDDHHMMSS}.csv` |
| Steward | `dq_task_list_{sanitised_name}_{YYYYMMDDHHMMSS}.csv` |

Name sanitisation: spaces → underscores, non-alphanumeric/underscore characters removed, lowercased. Matches the pattern used by the delta export (`dq_delta_{name}_{ts}.json`).

---

## 5. UI Structure

### 5.1 Tab layout

The tab renders a single-pane layout (no left panel, unlike Data Browser):

```
[ Header: row count summary + Export button ]
[ Preview table (scrollable, fills remaining height) ]
```

### 5.2 Preview table

Grid columns: 11 (all `TASK_LIST_COLS` except `agency_acronym` and `cds_name`, which become group headers).

**Grouping:**
- Rows grouped by Agency (alphabetical) → CDS (alphabetical within agency)
- Agency and CDS rows rendered as header rows inside `<tbody>` spanning all grid columns
- Each group header shows: collapse triangle button + name + row count
- Collapsing hides data rows; does not affect selection or export

**Sorting:**
- All column headers are clickable; click cycles asc → desc → asc
- Sort applies within each CDS group independently
- Active sort column highlighted with colour and up/down arrow indicator
- `sortCol` / `sortDir` state; `groupRows()` pure function applies sort per group

**Selection:**
- Header checkbox (top-left): select/deselect all rows; indeterminate via `useRef`
- Agency-level checkbox: select/deselect all rows in that agency
- CDS-level checkbox: select/deselect all rows in that CDS
- Per-row checkbox: toggle individual row
- All checkboxes use indeterminate state when partially selected; implemented via `GroupCheckbox` component (self-contained `useRef` + `useEffect`)
- All rows pre-selected on mount and whenever the row set changes

**Cell behaviour:**
- **Cell truncation**: `maxWidth: 200px`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`
- **Tooltip**: native `title={cellValue}` on each `<td>` — shows full value on hover
- **Row click**: opens `TaskListRowPanel` slide-in detail panel
- **Row highlight**: `borderLeft: '3px solid var(--accent)'` on the selected row

### 5.3 Row detail panel (`TaskListRowPanel`)

Modelled on `DataBrowserRowPanel` with these adaptations:

- Header label: `TASK LIST` (accent colour)
- Task type badge next to the label: `TEST` in green (`var(--accent)`), `IMPLEMENT` in amber (`var(--amber)`)
- Fields rendered vertically: label (small mono text) + value block (pre-wrap, word-break)
- SQL fields (`SQL Code`, `SQL Sample`, `SQL Snapshot Filter`): `font-family: var(--mono)`, `white-space: pre-wrap`, `font-size: 11px`
- Null/empty fields: italic `—` placeholder
- **Must be rendered via `ReactDOM.createPortal(el, document.body)`** to escape overflow/transform ancestors (fixed-panels rule)
- Backdrop click or X button closes the panel

### 5.4 Export action

- Button label: `Export {n} selected rows` — disabled if `n === 0`
- On click: builds CSV from selected rows only → `saveWithPicker(blob, filename, 'CSV File', '.csv')`
- No receipt, no confirmation dialog

### 5.5 Empty / error states

| Condition | Message |
|-----------|---------|
| No identity (non-master, no `stewardIdentity`) | "Set your steward identity in Settings to enable Task List export." |
| Identity set but no allocations in scope | "No allocations found in your data." |

---

## 6. Data Build Logic (`buildTaskListRows`)

Build lookup maps up front (id → record for all FK chains), then iterate allocations:

```
Input: data, isMaster, stewardIdentity
Output: array of row objects (13 fields each)

1. Build maps:
   - cdeMap:        critical_data_element_id → cde
   - cdsMap:        critical_data_set_id → cds
   - dirMap:        directorate_id → directorate
   - agencyMap:     executive_agency_id → agency
   - ruleMap:       data_quality_rule_id → rule
   - dimMap:        quality_dimension_id → dimension
   - stewardMap:    data_steward_id → steward
   - cdsToStewards: critical_data_set_id → [steward names] (active stewardship only)

2. Determine scope:
   - Master: scopeCdsIds = null (no filter)
   - Steward: scopeCdsIds = getMyStewardCdsIds(data, stewardIdentity)

3. For each allocation where retiring_timestamp is null:
   a. Look up CDE; skip if not found or retired
   b. If scopeCdsIds is not null, skip if CDE's critical_data_set_id not in scopeCdsIds
   c. Look up rule; skip if not found or retired
   d. Look up CDS, directorate, agency, dimension
   e. Determine task_type: rule.sql_code?.trim() ? 'TEST' : 'IMPLEMENT'
   f. Compose SQL fields (only if TEST)
   g. Collect steward names: cdsToStewards[cde.critical_data_set_id] || []
   h. Push row object
```

---

## 7. CSV Build Logic (`buildTaskListCSV`)

Takes selected row objects (already built). Outputs RFC 4180 CSV string.

- Header row: 13 column labels
- Each data row: values in same order, each field escaped (wrap in quotes if value contains comma, quote, or newline; double internal quotes)
- Reuses the same escaping pattern as `tableToCSV` in `40_storage.js`

---

## 8. Files Affected

| Action | File | Change |
|--------|------|--------|
| Create | `src/235_export_tasklist.js` | `buildTaskListRows`, `buildTaskListCSV`, `TaskListRowPanel`, `TaskListExportTab` |
| Modify | `src/230_screen_export.js` | Add `tasklist` tab to both master and non-master tab lists; add render case |
| Create | `documentation/user-guide/how-to-export-task-list.html` | New user guide page |
| Modify | `documentation/user-guide/index.html` | Add link to new guide |

---

## 9. Constraints and Risks

- **Non-ASCII characters in JS**: All special characters (em dash, bullets) in string literals must use `\uXXXX` escapes or `String.fromCharCode()`.
- **JSX special chars in text nodes**: Wrap any non-ASCII characters in JS expressions `{'—'}` not raw JSX text.
- **Fixed-position panel**: `TaskListRowPanel` must use `ReactDOM.createPortal` — failure to do so has caused bugs previously.
- **composeSql availability**: `composeSql` is defined in `90_panels.js` (loaded before `235_`). Safe to call directly.
- **getMyStewardCdsIds availability**: Defined in `20_data_utils.js`. Safe to call directly.
- **Large datasets**: No pagination planned for MVP. If a steward has hundreds of allocations, the table will scroll. Acceptable for initial release.
