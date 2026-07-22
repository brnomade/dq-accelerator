# PLAN: Single-Table CSV Import

Paired design: `DESIGN_CSV_TABLE_IMPORT.md`

---

## Files Affected

| File | Action | Reason |
|------|--------|--------|
| `src/20_data_utils.js` | **Modify** | Add `validateCsvReplace()` utility function |
| `src/210_screen_import.js` | **Modify** | Add "Single Table CSV" tab, file handler, preview panel, and confirmation logic |
| `documentation/user-guide/` | **Create** | New guide page: "How to fix table data using CSV import" |

No schema changes. No new source files. No changes to `240_app.js`, `50_context.js`, `10_constants.js`, or any other file.

---

## Step 1 — Add `validateCsvReplace()` to `20_data_utils.js`

Append after the last existing function in the file.

Each warning now includes the actual row objects alongside the count, so the UI can render an expandable detail table without re-scanning the data.

```js
function validateCsvReplace(tableName, newRows, currentData) {
  const warnings = [];
  const schema = SCHEMA[tableName];
  const newPkSet = new Set(newRows.map(function(r) { return r[schema.pk]; }));

  // Outbound: new rows' FK fields must resolve in current other-table data
  schema.cols.forEach(function(col) {
    if (!col.fk) return;
    var targetSchema = SCHEMA[col.fk.table];
    if (!targetSchema) return;
    var targetData = currentData[col.fk.table] || [];
    var targetPks = new Set(targetData.map(function(r) { return r[targetSchema.pk]; }));
    var brokenRows = newRows.filter(function(r) {
      return r[col.name] != null && !targetPks.has(r[col.name]);
    });
    if (brokenRows.length > 0) {
      warnings.push({
        direction: 'outbound',
        field: col.name,
        label: col.label,
        targetTable: col.fk.table,
        targetLabel: targetSchema.label,
        count: brokenRows.length,
        brokenRows: brokenRows,       // actual rows for expandable UI
      });
    }
  });

  // Inbound: existing rows in other tables referencing PKs being removed
  Object.keys(SCHEMA).forEach(function(otherTable) {
    if (otherTable === tableName) return;
    var otherSchema = SCHEMA[otherTable];
    otherSchema.cols.forEach(function(col) {
      if (!col.fk || col.fk.table !== tableName) return;
      var otherData = currentData[otherTable] || [];
      var orphanedRows = otherData.filter(function(r) {
        return r[col.name] != null && !newPkSet.has(r[col.name]);
      });
      if (orphanedRows.length > 0) {
        warnings.push({
          direction: 'inbound',
          sourceTable: otherTable,
          sourceLabel: otherSchema.label,
          sourceField: col.name,
          sourceFieldLabel: col.label,
          count: orphanedRows.length,
          orphanedRows: orphanedRows, // actual rows for expandable UI
        });
      }
    });
  });

  return warnings;
}
```

## Step 1b — Add `CsvFkWarningCard` component to `210_screen_import.js`

Add before `DeltaConflictCard` at the top of the file. The component receives a single `warning` object and `importedTableName`. It renders the one-line summary plus a **Show rows** toggle that expands to a full field-level table. The FK column is highlighted in amber — matching the visual language of `DeltaConflictCard`.

- Outbound: renders the incoming rows (`warning.brokenRows`) using the schema of the table being imported.
- Inbound: renders the existing orphaned rows (`warning.orphanedRows`) using the schema of `warning.sourceTable`.

---

## Step 2 — Extend `ImportScreen` in `210_screen_import.js`

All changes are inside the existing `ImportScreen` component. Three sub-steps:

### 2a. Add state variables

In the `useState` block at the top of `ImportScreen` (around line 274–285), add:

```js
const [csvFile, setCsvFile]             = useState(null);   // { name, tableName, rows, warnings, currentCount }
const [csvError, setCsvError]           = useState(null);   // string | null
const [csvConfirming, setCsvConfirming] = useState(false);  // preview panel visible
```

### 2b. Add `handleCsvFile()` handler

Add this function inside `ImportScreen`, after `handleFile()` (after line ~357). Note: `isMaster` is already destructured at line 275 — no change needed there.

```js
async function handleCsvFile(file) {
  setCsvError(null);
  setCsvFile(null);
  setCsvConfirming(false);

  // Detect table from filename
  var rawName = file.name.replace(/\.csv$/i, '');
  var tableName = rawName;
  if (!SCHEMA[tableName]) {
    setCsvError('Cannot identify table from filename. Rename the file to match a table name (e.g. critical_data_element.csv).');
    return;
  }

  // Parse CSV
  var text = await file.text();
  var wb = XLSX.read(text, { type: 'string' });
  var ws = wb.Sheets[wb.SheetNames[0]];
  var rows = importSheet(ws, tableName);

  // Validate header has PK column
  var pk = SCHEMA[tableName].pk;
  if (rows.length === 0 || rows[0][pk] === undefined) {
    var allEmpty = rows.length === 0;
    setCsvError(
      allEmpty
        ? 'The CSV contains no data rows.'
        : 'CSV is missing required column “' + pk + '”. This file may not belong to the selected table.'
    );
    return;
  }

  // FK validation
  var warnings = validateCsvReplace(tableName, rows, data);
  var currentCount = (data[tableName] || []).length;

  setCsvFile({ name: file.name, tableName, rows, warnings, currentCount });
  setCsvConfirming(true);
}
```

### 2c. Add CSV tab UI

Inside the `ImportScreen` render, gate the tab button and its entire panel inside `{isMaster && (...)}`. Add the tab button alongside the existing tab buttons:

```jsx
{isMaster && (
  <button
    className={'import-tab-btn' + (tab === 'csv' ? ' active' : '')}
    onClick={function() { setTab('csv'); setCsvFile(null); setCsvError(null); setCsvConfirming(false); }}
  >Single Table CSV</button>
)}
```

Add the tab content panel (rendered when `tab === 'csv'` — already inside an `isMaster` block so no extra guard needed):

```jsx
{tab === 'csv' && (
  <div className="import-tab-panel">
    {!csvConfirming && (
      <div
        className={'import-drop-zone' + (dragging ? ' dragging' : '')}
        onDragOver={function(e) { e.preventDefault(); setDragging(true); }}
        onDragLeave={function() { setDragging(false); }}
        onDrop={function(e) {
          e.preventDefault();
          setDragging(false);
          var f = e.dataTransfer.files[0];
          if (f) handleCsvFile(f);
        }}
        onClick={function() {
          var inp = document.createElement('input');
          inp.type = 'file';
          inp.accept = '.csv';
          inp.onchange = function(e) { if (e.target.files[0]) handleCsvFile(e.target.files[0]); };
          inp.click();
        }}
      >
        <div className="import-drop-label">Drop a CSV file here, or click to select</div>
        <div className="import-drop-hint">File must be named {'<'}table_name{'>'}.csv</div>
      </div>
    )}

    {csvError && (
      <div className="import-error-banner">{csvError}</div>
    )}

    {csvConfirming && csvFile && (
      <div className="csv-preview-panel">
        <div className="csv-preview-header">
          <span className="csv-preview-table">{SCHEMA[csvFile.tableName].label}</span>
          <span className="csv-preview-filename">{csvFile.name}</span>
        </div>

        <div className="csv-preview-counts">
          <span>Rows: current <strong>{csvFile.currentCount}</strong></span>
          {' → '}
          <span>incoming <strong>{csvFile.rows.length}</strong></span>
          {csvFile.rows.length !== csvFile.currentCount && (
            <span className={'csv-row-delta ' + (csvFile.rows.length < csvFile.currentCount ? 'negative' : 'positive')}>
              {'(' + (csvFile.rows.length > csvFile.currentCount ? '+' : '') + (csvFile.rows.length - csvFile.currentCount) + ' rows)'}
            </span>
          )}
        </div>

        {csvFile.warnings.length > 0 && (
          <div className="csv-warnings">
            <div className="csv-warnings-title">{'⚠'} FK Warnings ({csvFile.warnings.length})</div>
            {csvFile.warnings.map(function(w, i) {
              return (
                <div key={i} className="csv-warning-item">
                  {w.direction === 'inbound'
                    ? csvFile.rows.length < (w.count + csvFile.currentCount - csvFile.rows.length)
                      ? w.count + ' rows in “' + w.sourceLabel + '” reference ' + SCHEMA[csvFile.tableName].label + ' records not present in the incoming CSV. Those rows will become orphaned.'
                      : w.count + ' rows in “' + w.sourceLabel + '” will be orphaned after this replace.'
                    : w.count + ' incoming rows reference ' + w.targetLabel + ' values that do not exist in this database.'
                  }
                </div>
              );
            })}
            <div className="csv-warnings-note">Warnings are informational. You may still proceed.</div>
          </div>
        )}

        <div className="csv-preview-actions">
          <button className="btn-secondary" onClick={function() { setCsvConfirming(false); setCsvFile(null); }}>Cancel</button>
          <button className="btn-danger" onClick={function() {
            var newData = Object.assign({}, data, { [csvFile.tableName]: csvFile.rows });
            onImport(newData, []);
            setCsvConfirming(false);
            setCsvFile(null);
            setLog([{ type: 'ok', msg: 'Replaced ' + SCHEMA[csvFile.tableName].label + ': ' + csvFile.rows.length + ' rows loaded.' }]);
            setTab('csv');
          }}>Replace Table</button>
        </div>
      </div>
    )}

    {log.length > 0 && tab === 'csv' && !csvConfirming && (
      <div className="import-log">
        {log.map(function(entry, i) {
          return <div key={i} className={'import-log-' + entry.type}>{entry.msg}</div>;
        })}
      </div>
    )}
  </div>
)}
```

---

## Step 3 — CSS additions to `00_styles.css`

Add these selectors. All values use the existing design token palette.

```css
/* CSV preview panel */
.csv-preview-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.csv-preview-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.csv-preview-table {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-primary);
}
.csv-preview-filename {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.csv-preview-counts {
  font-size: 0.95rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.csv-row-delta {
  font-weight: 600;
  font-size: 0.85rem;
}
.csv-row-delta.negative { color: #e05555; }
.csv-row-delta.positive { color: var(--accent); }

/* FK warnings block */
.csv-warnings {
  background: #2a2118;
  border: 1px solid #6b4c1a;
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.csv-warnings-title {
  font-weight: 600;
  color: #e8a04a;
  font-size: 0.9rem;
}
.csv-warning-item {
  font-size: 0.85rem;
  color: #c8a06a;
  padding-left: 10px;
}
.csv-warnings-note {
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Danger button (destructive replace) */
.btn-danger {
  background: #c0392b;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 18px;
  font-size: 0.9rem;
  cursor: pointer;
  font-family: var(--font-sans);
}
.btn-danger:hover { background: #a93226; }

/* Error banner */
.import-error-banner {
  background: #2d1a1a;
  border: 1px solid #7a2e2e;
  border-radius: 6px;
  color: #e07070;
  padding: 12px 16px;
  font-size: 0.9rem;
  margin-top: 12px;
}

.csv-preview-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
```

---

## Step 4 — User Documentation

Create `documentation/user-guide/how-to-fix-table-data-csv-import.html`.

Content: step-by-step guide covering:
1. When to use single-table CSV import (data fixes, duplicate PK resolution)
2. How to export the backup CSV ZIP and extract the relevant file
3. How to edit the CSV (keep column headers intact, fix the rows)
4. How to import: Import screen → Single Table CSV tab → drop file → review warnings → Replace Table
5. Multi-table fix order (parent tables before child tables)

Update `documentation/user-guide/index.html` to include the new page under the appropriate section.

---

## Step 5 — Build, Changelog, Session Metrics

Follow the mandatory end-of-task sequence:
1. Pre-generate build ID: `python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"`
2. Write CHANGELOG.md entry with that build ID
3. Write SESSION_METRICS.md entry
4. Run `python build.py`

---

## Implementation Notes

- `importSheet()` in `20_data_utils.js` is called unchanged. When fed a SheetJS worksheet parsed from CSV text (all cells are strings), `coerceValue()` already handles string-to-type conversion for all schema types. No changes needed there.
- The `log` state in `ImportScreen` is shared across tabs. After a successful CSV replace, the log entry is set and `csvConfirming` is cleared, causing the tab to revert to the drop zone with the result message visible below.
- `onImport(newData, [])` is the existing hook — it triggers `buildLookups()`, updates context, and saves to localStorage. Passing the full patched data object with only one key changed is safe; all other tables are untouched.
- The `btn-secondary` class already exists in the stylesheet. Only `btn-danger` is new.
- The warning message rendering in 2c uses simple string concatenation (no template literals) to avoid Babel edge cases with the existing CDN setup.
