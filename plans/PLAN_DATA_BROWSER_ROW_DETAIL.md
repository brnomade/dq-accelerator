# PLAN — Data Browser: Row Detail Panel

**Paired design:** `designs/DESIGN_DATA_BROWSER_ROW_DETAIL.md`

---

## Steps

### 1. Add `DataBrowserRowPanel` component to `215_screen_databrowser.js`

New function placed **above** `DataBrowserScreen`, after the closing brace of any
existing helper functions in that file.

Structure:
- Backdrop `div`: `position:fixed, inset:0, zIndex:300, onClick=onClose`
- Panel `div`: `position:fixed, top:0, right:0, bottom:0, width:'min(440px,45vw)', zIndex:400`
- Panel header: accent label `DATA BROWSER`, table name (monospace), optional `[RETIRED]`
  amber badge, close `X` button
- Panel body (scrollable `overflow:auto, flex:1`): iterate `SCHEMA[table].cols`, render
  each field as label + value box
  - PK field label gets amber `[PK]` badge
  - FK field labels get cyan `[FK]` badge
  - Null values: italic `null` in `var(--text2)`
  - Value box: `var(--bg3)` background, border, `whiteSpace:'pre-wrap'`, `wordBreak:'break-word'`
  - PK/FK values in monospace; all other values in default font

Component does **not** self-portal — the caller (`DataBrowserScreen`) wraps it in
`ReactDOM.createPortal(..., document.body)`.

---

### 2. Add `selectedRow` state to `DataBrowserScreen`

```js
const [selectedRow, setSelectedRow] = useState(null);
```

Reset `selectedRow` to `null` inside the `setSelectedTable` call site (left panel
table-click handler) so switching tables always closes the panel.

---

### 3. Add row click handler

```js
const handleRowClick = (row) => {
  setSelectedRow(prev => (prev === row ? null : row));
};
```

Toggle behaviour: clicking the already-selected row closes the panel.

---

### 4. Update the `<tr>` elements in the data grid

For each data row `<tr>`:
- Add `onClick={() => handleRowClick(row)}`
- Add `style={{ cursor:'pointer' }}`
- Drive the left-border highlight:
  ```js
  borderLeft: selectedRow === row
    ? '3px solid var(--accent)'
    : '3px solid transparent'
  ```

---

### 5. Guard Undo button against row-click propagation

Locate the Undo `<button>` in the per-row action column and add:
```js
onClick={(e) => { e.stopPropagation(); restoreRecord(selectedTable, row[pkField]); }}
```

Removes the current plain `onClick={() => restoreRecord(...)}` and replaces it.

---

### 6. Add `title` tooltip to data cells

On every data `<td>`:
```jsx
title={val !== null && val !== undefined ? String(val) : ''}
```

`val` is the already-computed cell display value (before ellipsis truncation).

---

### 7. Render panel via portal

At the bottom of `DataBrowserScreen`'s return JSX, after the main layout `<div>`:

```jsx
{selectedRow && ReactDOM.createPortal(
  <DataBrowserRowPanel
    table={selectedTable}
    row={selectedRow}
    onClose={() => setSelectedRow(null)}
  />,
  document.body
)}
```

---

### 8. Close panel when filtered row disappears

After computing `displayRows` (the filtered + sorted row list), add:

```js
useEffect(() => {
  if (!selectedRow) return;
  const still = displayRows.some(r => r.row === selectedRow);
  if (!still) setSelectedRow(null);
}, [displayRows]);
```

(Adjust `r.row` vs direct row reference to match how `displayRows` is structured in the
current implementation — if `displayRows` contains raw row objects directly, use
`r === selectedRow`.)

---

### 9. Pre-generate build ID, update CHANGELOG.md and SESSION_METRICS.md

```bash
python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"
```

Write the CHANGELOG entry and SESSION_METRICS entry using that ID **before** running the
build.

---

### 10. Run build

```bash
cd build && python build.py
```

---

## Files changed

| File | Change |
|---|---|
| `src/215_screen_databrowser.js` | Add `DataBrowserRowPanel` component; add `selectedRow` state; add `handleRowClick`; update `<tr>` click/highlight; Undo button `stopPropagation`; `title` on cells; portal render; filter disappear effect |
| `CHANGELOG.md` | New entry |
| `SESSION_METRICS.md` | New entry |

## Files NOT changed

| File | Reason |
|---|---|
| `APP_TREE.md` | No new source file, no new route, no new sidebar item |
| `src/240_app.js` | Panel state is local to `DataBrowserScreen`; no App-level state needed |
| `documentation/user-guide/` | Data Browser is master-only; no user-facing guide exists for it (per original PLAN_DATA_BROWSER.md decision). No update required. |

---

## Mandatory end-of-task steps

- [ ] Pre-generate build ID and write CHANGELOG.md + SESSION_METRICS.md entries **before** build
- [ ] Run `python build.py`
- [ ] APP_TREE.md: no update required (no structural change)
- [ ] User docs: no update required (master-only tool, no existing guide)
