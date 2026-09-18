# DESIGN — Data Browser: Row Detail Panel

## Problem

The Data Browser grid truncates all cell values at `maxWidth: 280px` with CSS ellipsis.
Long text fields (descriptions, rule logic, free-text notes) are unreadable in the grid.
There is no way for a master steward to see the full value of a clipped cell without
exporting the data to Excel.

---

## Solution

Two complementary UX improvements:

1. **Primary — Click row → read-only right-slide detail panel.** Clicking any data row
   opens a panel on the right side of the screen listing every field and its full,
   untruncated value. Follows the existing `FormShell`/`SqlPanel` visual language exactly.

2. **Secondary — Hover tooltip on clipped cells.** A native `title` attribute on each `<td>`
   provides an instant zero-click preview of the full value for the common "I just want to
   see this one cell" case.

---

## Scope

**In scope:**
- `DataBrowserRowPanel` component inside `215_screen_databrowser.js`
- Row click handler and panel open/close state (local to `DataBrowserScreen`)
- Cursor and hover treatment on clickable rows
- `title` tooltip on data cells
- Panel renders via `ReactDOM.createPortal` to `document.body` (avoids
  overflow/transform ancestor clipping — consistent with the rule that
  `position:fixed` panels must not be rendered inside screen components)

**Out of scope:**
- No edit capability — panel is strictly read-only
- No FK resolution — raw values only, consistent with the rest of Data Browser
- No changes to bulk select, Undo retirement, filter, or sort logic

---

## Layout

```
[ Left panel  ]  [ Right panel grid                          ] [ Row detail panel    ]
[ table list  ]  [ Toolbar                                   ] [ ─────────────────── ]
[             ]  [ col1  col2  col3  ...                     ] [ TABLE NAME          ]
[             ]  [ ░░░░░ clicked row highlighted ░░░░░░░░░░░ ] [ PK value (mono)     ]
[             ]  [ row data ...                              ] [ ─────────────────── ]
[             ]  [ row data ...                              ] [ field_name          ]
[             ]  [                                           ] [ full value          ]
[             ]  [                                           ] [ ─────────────────── ]
[             ]  [                                           ] [ field_name          ]
[             ]  [                                           ] [ full value          ]
[             ]  [                                           ] [ ...                 ]
```

Panel width: `min(440px, 45vw)` — narrower than `FormShell` (560px) since it is
read-only and needs to leave the grid partially visible.

---

## Panel behaviour

| Action | Result |
|---|---|
| Click a data row | Opens `DataBrowserRowPanel` for that row; row gets a persistent highlight (`var(--accent)` left border + `var(--row-hover)` background) |
| Click the same row again | Closes the panel (toggle) |
| Click a different row | Panel updates to the new row without closing |
| Click backdrop | Closes the panel |
| Click `X` button in panel header | Closes the panel |
| Table selection changes (left panel) | Panel closes and `selectedRow` resets to `null` |
| Filter text changes | Panel stays open if the selected row is still in the filtered set; closes if the row is filtered out |
| Click Undo button on a retired row | Undo fires normally; `event.stopPropagation()` prevents the row click from also opening the panel |

---

## Panel anatomy

```
┌─────────────────────────────────┐
│  DATA BROWSER                   │  ← uppercase label, accent colour (var(--accent))
│  table_name                     │  ← physical table name, monospace, var(--text)
│                                 │  ← [RETIRED] amber badge if retiring_timestamp set
│                               X │  ← close button
├─────────────────────────────────┤
│  (scrollable body)              │
│                                 │
│  column_name  [PK]              │  ← amber [PK] badge on PK field label
│  ┌─────────────────────────┐   │
│  │ full value, no truncation│   │  ← monospace for PK/FK, normal for others
│  └─────────────────────────┘   │
│                                 │
│  column_name  [FK]              │  ← cyan [FK] badge on FK field labels
│  ┌─────────────────────────┐   │
│  │ full value              │   │
│  └─────────────────────────┘   │
│                                 │
│  column_name                    │
│  null                           │  ← italic, var(--text2) for null values
│  ...                            │
└─────────────────────────────────┘
```

**Field value box styling:**
- Background: `var(--bg3)`
- Border: `1px solid var(--border)`
- Border-radius: `var(--radius)`
- Padding: `7px 10px`
- `whiteSpace: 'pre-wrap'` so multi-line text values wrap naturally
- `wordBreak: 'break-word'` so very long unspaced strings do not overflow

---

## Tooltip behaviour

Every `<td>` in the data grid gets `title={cellValue ?? ''}`.  
For null values the title is empty (native tooltip shows nothing, which is correct).  
For non-null values the title shows the raw string, giving an immediate hover preview
before the user decides to click.

---

## Technical design

### State additions (DataBrowserScreen)

```js
const [selectedRow, setSelectedRow] = useState(null);
// null = panel closed; object = the row currently shown in the panel
```

`selectedRow` resets to `null` whenever `selectedTable` changes.

### Row click handler

```js
const handleRowClick = (row) => {
  setSelectedRow(prev => (prev === row ? null : row));
};
```

### Undo button propagation guard

```jsx
<button onClick={(e) => { e.stopPropagation(); restoreRecord(...); }}>
  Undo
</button>
```

### Panel rendering via portal

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

`ReactDOM` is available globally from the CDN bundle.

### DataBrowserRowPanel component (new, inside 215_screen_databrowser.js)

```
function DataBrowserRowPanel({ table, row, onClose }) {
  const schema  = SCHEMA[table];
  const pkField = schema.pk;
  const pkValue = row[pkField];
  const isRetired = !!row.retiring_timestamp;

  return ReactDOM.createPortal(...)   // — see above, portal already applied by caller
  // renders: backdrop div + panel div
  //   backdrop: position:fixed, inset:0, zIndex:300, onClick=onClose
  //   panel: position:fixed, top:0, right:0, bottom:0, width:'min(440px,45vw)', zIndex:400
}
```

Field list is `schema.cols` iterated in definition order, with the PK field first
(guaranteed by schema ordering — `pk` is always the first col in practice).

### Row highlight CSS

The clicked row gets:
```js
borderLeft: selectedRow === row ? '3px solid var(--accent)' : '3px solid transparent'
background:  selectedRow === row ? 'var(--row-hover)' : undefined
cursor: 'pointer'
```

---

## Dependencies

| Item | Location | Change needed |
|---|---|---|
| `ReactDOM.createPortal` | CDN global | None — already available |
| `SCHEMA` | `10_constants.js` | None |
| `restoreRecord` | AppContext via `useApp()` | None — already destructured |
| `DataBrowserScreen` | `215_screen_databrowser.js` | State + click handler + portal added |

Only `215_screen_databrowser.js` is modified. No other files change.

---

## Constraints

- No non-ASCII characters in JS. Em-dash, arrows etc. must use `{'—'}` / `{'↑'}` in JSX.
- Panel must render via `ReactDOM.createPortal` — not inline in the screen component — to
  avoid clipping by ancestor `overflow` or `transform` styles.
- No edit, no FK resolution, no save — read-only inspection only.
