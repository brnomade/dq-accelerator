# PLAN — Table Profiling: Snapshot Metadata Capture

**Design:** `designs/DESIGN_TABLE_DDL_SNAPSHOT_METADATA.md`  
**Status:** Draft — awaiting user approval  
**Files:** `src/10_constants.js`, `src/201_ddl_form_panel.js`

---

## Step 1 — Schema: add two columns to `source_table_ddl`

In `src/10_constants.js`, locate the `source_table_ddl.cols` array (around line 219). Insert the two new fields **before** `retiring_timestamp`:

```js
{ name: 'is_snapshot_table',  type: 'bool', label: 'Snapshot table' },
{ name: 'snapshot_date_field', type: 'str',  label: 'Snapshot field' },
```

Result:
```js
source_table_ddl: {
  pk: 'source_table_ddl_id',
  cols: [
    { name: 'source_table_ddl_id',   type: 'int',  label: 'ID' },
    { name: 'source_database_name',  type: 'str',  label: 'Database',  required: true },
    { name: 'source_table_name',     type: 'str',  label: 'Table',     required: true },
    { name: 'ddl_text',              type: 'text', label: 'DDL',       required: true, tall: true },
    { name: 'parsed_columns',        type: 'text', label: 'Parsed columns' },
    { name: 'parsed_at',             type: 'str',  label: 'Parsed at' },
    { name: 'parsed_by',             type: 'str',  label: 'Parsed by' },
    { name: 'is_snapshot_table',     type: 'bool', label: 'Snapshot table' },
    { name: 'snapshot_date_field',   type: 'str',  label: 'Snapshot field' },
    { name: 'retiring_timestamp',    type: 'datetime', label: 'Retired' },
  ],
  label: 'Profiling',
},
```

---

## Step 2 — State variables in `DDLFormPanel`

In `src/201_ddl_form_panel.js`, after the existing `useState` declarations (around line 37–40), add:

```js
const [isSnapshotTable,   setIsSnapshotTable]   = useState(record?.is_snapshot_table   || false);
const [snapshotDateField, setSnapshotDateField] = useState(record?.snapshot_date_field || '');
```

---

## Step 3 — New Step 2 block (snapshot configuration)

In `src/201_ddl_form_panel.js`, insert the following JSX **between** the closing `</div>` of the Step 1 block (line 308) and the conditional Step 2 block that begins `{(parseMsg || parsed.length > 0) && (` (line 311).

Determine the step 2 border colour with a local variable computed just before the JSX:

```js
const snapBorderColor = isSnapshotTable
  ? (snapshotDateField ? 'var(--green)' : 'var(--amber)')
  : 'var(--border)';
```

New Step 2 JSX block:

```jsx
{/* Step 2 -- Snapshot configuration */}
<div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
  borderLeft:`3px solid ${snapBorderColor}`,
  borderRadius:'var(--radius-lg)', padding:'14px 16px',
  display:'flex', flexDirection:'column', gap:12 }}>
  <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
    textTransform:'uppercase', color: snapBorderColor === 'var(--border)' ? accent : snapBorderColor }}>
    Step 2 - Snapshot configuration
  </div>

  {/* Toggle */}
  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none' }}>
    <input type="checkbox" checked={isSnapshotTable}
      onChange={e => {
        setIsSnapshotTable(e.target.checked);
        if (!e.target.checked) setSnapshotDateField('');
      }}
      style={{ width:14, height:14, cursor:'pointer' }}/>
    <span style={{ fontSize:12, color:'var(--text)', fontWeight:500 }}>
      This is a snapshot table
    </span>
  </label>

  {/* Snapshot field selector — only when toggle is on */}
  {isSnapshotTable && (
    <div>
      <label style={{ display:'block', fontSize:11, fontWeight:600,
        color:'var(--text2)', marginBottom:4 }}>
        Snapshot date / period field
      </label>
      {parsed.length > 0 ? (
        <select value={snapshotDateField}
          onChange={e => setSnapshotDateField(e.target.value)}
          style={{ ...inputBase, ...monoInput, cursor:'pointer' }}>
          <option value="">-- select the snapshot field --</option>
          {parsed.map(c => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      ) : (
        <select disabled style={{ ...inputBase, ...monoInput, opacity:0.5, cursor:'not-allowed' }}>
          <option>{'-- Profile the table to see available fields --'}</option>
        </select>
      )}
      {isSnapshotTable && !snapshotDateField && (
        <div style={{ fontSize:11, color:'var(--amber)', marginTop:4 }}>
          Snapshot field not yet selected {'—'} return to complete.
        </div>
      )}
    </div>
  )}
</div>
```

---

## Step 4 — Renumber Verify columns to Step 3

In `src/201_ddl_form_panel.js`, locate the label `Step 2 - Verify columns` (around line 319) and change it to `Step 3 - Verify columns`.

---

## Step 5 — Include new fields in `handleSave()`

In `src/201_ddl_form_panel.js`, in the `handleSave()` function (around line 117), add the two new fields to the saved object:

```js
onSave({
  source_table_ddl_id:  record?.source_table_ddl_id ?? nextPk(),
  source_database_name: dbName.trim(),
  source_table_name:    tableName.trim(),
  ddl_text:             ddlText,
  parsed_columns:       JSON.stringify(parsed),
  parsed_at:            dateStr,
  parsed_by:            stewardIdentity?.name || null,
  is_snapshot_table:    isSnapshotTable || false,
  snapshot_date_field:  snapshotDateField || null,
  retiring_timestamp:   null,
});
```

---

## Step 6 — Build and verify

Pre-generate the build ID:
```bash
python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"
```

Then write CHANGELOG.md and SESSION_METRICS.md entries, then run:
```bash
cd build && python build.py
```

Open `dist/dq-accelerator.html`. On the Profiling screen, click "Profile" on any table group:

1. **Step 2 visible immediately** — confirm the snapshot block appears before the DDL is pasted.
2. **Toggle off (default)** — confirm step uses neutral border, snapshot field not shown.
3. **Toggle on, no DDL parsed** — confirm disabled dropdown shows `"-- Profile the table to see available fields --"` and the amber hint message appears.
4. **Paste DDL and parse** — confirm the snapshot field dropdown populates with parsed column names.
5. **Select a field** — confirm border turns green and hint disappears.
6. **Save** — confirm the saved record includes `is_snapshot_table: true` and the selected `snapshot_date_field` value (check via the generic table view for `source_table_ddl`).
7. **Re-open the panel** — confirm saved values are restored correctly in both toggle and dropdown.
8. **Toggle off and save** — confirm `is_snapshot_table: false` and `snapshot_date_field: null` are saved.
9. **Step 3** — confirm Verify columns is correctly numbered Step 3.

---

## Step 7 — Post-build updates

- Update `CHANGELOG.md` with build ID.
- Update `SESSION_METRICS.md` with time estimates.
- No `KNOWN_ISSUES.md` changes required.
- Update user documentation: add a note on snapshot configuration to the table profiling guide in `documentation/user-guide/`.
- Update `APP_TREE.md` only if component names or file names change (they do not for this task).

---

## Risk

Low. Only two files are touched. Schema change adds optional columns — existing records without these fields behave identically (falsy defaults). No routing, no new files, no shared component changes.
