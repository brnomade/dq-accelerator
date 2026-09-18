# PLAN: Task List Export Tab

**Design ref:** DESIGN_task_list_export.md  
**Branch:** feature/task-list-export  
**Status:** Awaiting user approval

---

## Implementation Steps

### Step 1 — Create `src/235_export_tasklist.js`

New file. Contains four things in order:

#### 1a. `buildTaskListRows(data, isMaster, stewardIdentity)`

Pure function. Returns `[]` if no data.

- Build id→record lookup maps for: `critical_data_element`, `critical_data_set`, `directorate`, `executive_agency`, `data_quality_rule`, `quality_dimension`, `data_steward`
- Build `cdsToStewards` map: `critical_data_set_id → [steward_name, ...]` — from active (non-retired) `stewardship` records only
- Determine `scopeCdsIds`: `null` if `isMaster`, else result of `getMyStewardCdsIds(data, stewardIdentity)`
- Iterate `data.data_quality_rule_allocation`:
  - Skip if `retiring_timestamp` set
  - Look up `cde`; skip if not found or retired
  - If `scopeCdsIds !== null`, skip if `cde.critical_data_set_id` not in `scopeCdsIds`
  - Look up `rule`; skip if not found or retired
  - Look up `cds`, `dir`, `agency`, `dim` (missing lookups → empty string, not a skip)
  - `task_type = (rule.sql_code && rule.sql_code.trim()) ? 'TEST' : 'IMPLEMENT'`
  - Compose SQL fields only if `task_type === 'TEST'`:
    - `sql_code`: `composeSql(rule.sql_code, cde, 'rule') || ''`
    - `sql_sample`: `rule.sql_code_sample ? composeSql(rule.sql_code_sample, cde, 'sample') || '' : ''`
    - `sql_snapshot_filter`: `substituteCdeTokens(cde.source_snapshot_filter, cde) || ''`
  - `steward_names`: `(cdsToStewards[cde.critical_data_set_id] || []).join(' - ')`
  - Push row object with all 13 fields

#### 1b. `buildTaskListCSV(rows)`

- Header: `['Task Type','Agency Acronym','CDS Name','CDE Table','CDE Database','CDE Field','Quality Dimension','Rule Name','Rule Explanation','Steward Name','SQL Code','SQL Sample','SQL Snapshot Filter']`
- For each row: map the 13 fields in column order, apply CSV escaping (same logic as `tableToCSV` in `40_storage.js`: wrap in quotes if field contains comma/quote/newline, double internal quotes)
- Return joined string

#### 1c. `TaskListRowPanel({ row, onClose })`

Component. Renders via `ReactDOM.createPortal(el, document.body)`.

- Same structure as `DataBrowserRowPanel`: backdrop + slide-in panel
- Header: `'TASK LIST'` label (accent colour) + badge: `'TEST'` (green) or `'IMPLEMENT'` (amber) based on `row.task_type`
- Field list: render all 13 fields as label + value blocks
- SQL fields (indices 10–12) use `font-family: var(--mono)`, `white-space: pre-wrap`, `font-size: 11px`
- Empty/null values: show italic `{'—'}` (em dash) placeholder
- Close: backdrop `onClick={onClose}`, X button `onClick={onClose}`
- Animation: reuse `slideInRight` keyframe (same CSS as Data Browser)

#### 1d. `TaskListExportTab()`

Component.

State:
- `rows` — computed from `buildTaskListRows`; recalculated via `useMemo` on `data`/`isMaster`/`stewardIdentity`
- `selectedKeys` — `Set` of row indices; initialised to all indices on mount and whenever `rows` changes (via `useEffect`)
- `selectedRow` — row object or `null` for detail panel

Layout:

```
[Header bar: "N rows · M selected" + Export button]
[Scrollable table grid]
[TaskListRowPanel (portal, conditionally)]
```

Header bar:
- Row count: `{rows.length} rows`
- Selected count badge: `{selectedKeys.size} selected`
- Export button: `'Export selected rows'` — disabled if `selectedKeys.size === 0`
- `onClick`: build CSV from `rows.filter((_, i) => selectedKeys.has(i))`, call `saveWithPicker`

Filename generation:
```js
const ts = new Date().toISOString().replace(/[:\-T.Z]/g,'').slice(0,14);
const namePart = isMaster ? 'master'
  : (stewardIdentity?.name || 'unknown').toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
const filename = `dq_task_list_${namePart}_${ts}.csv`;
```

Table grid (inside scrollable container):
- Sticky `<thead>` (same sticky pattern as Data Browser)
- Header row: checkbox cell + 13 column header cells (no sort needed)
- Header checkbox: `checked={allSel}`, `indeterminate` via ref, `onChange={handleHeaderCheck}`
- Body rows: one `<tr>` per row
  - Checkbox cell: `checked={selectedKeys.has(i)}`, `onClick={e => e.stopPropagation()}`, `onChange={() => handleRowCheck(i)}`
  - 13 data cells: `title={String(val)}`, `maxWidth: 200`, ellipsis truncation
  - `onClick={() => setSelectedRow(prev => prev === row ? null : row)}`
  - `borderLeft` highlight if `selectedRow === row`

Empty/no-identity states (render instead of table):
- Non-master with no `stewardIdentity`: message card
- `rows.length === 0`: "No allocations found in your data." message

---

### Step 2 — Modify `src/230_screen_export.js`

Two changes only:

**2a. Tab list** — add `{ id: 'tasklist', label: 'Task List' }` to both the master tab array and the non-master tab array (append at end of each).

**2b. Render** — add after the existing tab render blocks:
```jsx
{tab === 'tasklist' && <TaskListExportTab />}
```

---

### Step 3 — User documentation

#### 3a. Create `documentation/user-guide/how-to-export-task-list.html`

New guide page. Text-only, no screenshots. Covers:
- What the Task List export is for
- How scoping works (steward sees their data; master sees all)
- How to deselect rows before exporting
- How to use the row detail panel (click a row)
- How to save the file

#### 3b. Update `documentation/user-guide/index.html`

Add a link to the new guide in the Export section of the table of contents.

---

### Step 4 — Pre-build housekeeping (before running build)

1. Pre-generate build ID:
   ```
   python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"
   ```
2. Add CHANGELOG.md entry with that build ID
3. Add SESSION_METRICS.md entry with that build ID
4. Run `python build.py` immediately

---

### Step 5 — Post-build

5. Update `APP_TREE.md`:
   - Add `235_export_tasklist.js` to the source file list under Export Screen
   - Add "Task List" tab entry under Export Screen in the screen list

---

## Acceptance Criteria

- [ ] "Task List" tab appears in Export Screen for all recognised users (master + steward)
- [ ] Rows are scoped correctly: steward sees only their CDS allocations, master sees all
- [ ] Task Type column correctly shows TEST (sql_code present) or IMPLEMENT (absent)
- [ ] SQL columns contain fully substituted, ready-to-run SQL for TEST rows; empty for IMPLEMENT rows
- [ ] Multiple stewards concatenated with ` - ` in Steward Name column
- [ ] All rows pre-selected on load; deselect works per-row and via header checkbox
- [ ] Row click opens slide-in detail panel from the right
- [ ] Tooltip on hover shows full cell value
- [ ] Export button opens file picker and saves valid CSV
- [ ] Filename follows `dq_task_list_{name}_{datetime}.csv` pattern
- [ ] No non-ASCII characters in JS source
- [ ] Build produces no errors

---

## Non-goals (out of scope for this task)

- Row filtering / search within the preview table
- Sort by column
- Column visibility toggles
- Trello API integration (export is CSV only)
- Similar rules column
- Implementation checklist column
