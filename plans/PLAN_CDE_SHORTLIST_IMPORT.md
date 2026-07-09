# PLAN: CDE Shortlist Import & Shortlist Tagging

Paired design: `DESIGN_CDE_SHORTLIST_IMPORT.md`

---

## Files Affected

| File | Action | Reason |
|------|--------|--------|
| `src/10_constants.js` | **Modify** | Add `shortlist_group` and `cde_shortlist_tag` to SCHEMA, SHEET_MAP, TABLE_GROUPS |
| `src/215_shortlist_import.js` | **Create** | All parsing, group resolution, analysis, conflict-review UI, and apply logic |
| `src/210_screen_import.js` | **Modify** | Add "CDE Shortlist" tab; render new component |
| `src/161_view_generic.js` or CDE panel file | **Modify** | Add shortlist group dropdown to CDE panel form |
| Export screen file | **Modify** | Add `shortlist_group` column; filter incomplete CDEs from export |

No changes to `critical_data_element` table definition. No changes to `50_context.js` or `240_app.js`.

---

## Step 1 — Update `src/10_constants.js`

### 1a. Add `shortlist_group` to SCHEMA

```js
shortlist_group: {
  pk: 'shortlist_group_id',
  cols: [
    { name: 'shortlist_group_id',    type: 'int',      label: 'ID' },
    { name: 'directorate_id',        type: 'int',      label: 'Directorate', required: true,
      fk: { table: 'directorate', field: 'directorate_id', display: 'directorate_name' } },
    { name: 'shortlist_group_label', type: 'str',      label: 'Label' },
    { name: 'shortlist_colour_hex',  type: 'str',      label: 'Colour (hex)' },
    { name: 'retiring_timestamp',    type: 'datetime', label: 'Retired' },
  ],
  label: 'Shortlist Group',
},
```

### 1b. Add `cde_shortlist_tag` to SCHEMA

```js
cde_shortlist_tag: {
  pk: 'cde_shortlist_tag_id',
  cols: [
    { name: 'cde_shortlist_tag_id',       type: 'int',      label: 'ID' },
    { name: 'critical_data_element_id',   type: 'int',      label: 'CDE', required: true,
      fk: { table: 'critical_data_element', field: 'critical_data_element_id', display: 'source_field_name' } },
    { name: 'shortlist_group_id',         type: 'int',      label: 'Shortlist Group', required: true,
      fk: { table: 'shortlist_group', field: 'shortlist_group_id', display: 'shortlist_group_label' } },
    { name: 'retiring_timestamp',         type: 'datetime', label: 'Retired' },
  ],
  label: 'CDE Shortlist Tag',
},
```

### 1c. Add to SHEET_MAP

```js
'Shortlist Group':    'shortlist_group',
'CDE Shortlist Tag':  'cde_shortlist_tag',
```

### 1d. Add to TABLE_GROUPS

Add both `'shortlist_group'` and `'cde_shortlist_tag'` to the `'dq'` group tables array.

---

## Step 2 — Create `src/215_shortlist_import.js`

### 2a. `parseShortlistWorkbook(workbook)`

- Find the target sheet: first sheet name not matching (case-insensitive) `"example"`, `"instructions"`, or `"version control"`.
- Read as 2-D array: `XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })`.
- Determine CDS column indices dynamically:
  ```js
  const cdsColIndices = [];
  let col = 1;
  while (col < (rows[0] || []).length) {
    const header = rows[0][col];
    if (!header || String(header).trim() === '') break;
    cdsColIndices.push(col);
    col++;
  }
  ```
  No hard maximum — the loop stops at the first empty header cell.
- Auto-detect first data row (skip metadata/owner rows with dark styled backgrounds):
  ```js
  var dataStartRow = 1;
  while (dataStartRow < rows.length) {
    var isMetadata = cdsColIndices.some(function(colIdx) {
      var addr = XLSX.utils.encode_cell({ r: dataStartRow, c: colIdx });
      var cell = ws[addr];
      return cell && cell.s && cell.s.fgColor && cell.s.fgColor.theme === 0;
    });
    if (!isMetadata) break;
    dataStartRow++;
  }
  ```
  Theme index 0 = dark Office background fill, characteristic of styled header/metadata rows (e.g. POAS owner row).
- For each index in `cdsColIndices`:
  - For each row ≥ `dataStartRow`: if cell value non-empty, extract `fieldName` and `colourHex`.

**Colour extraction — combined fill and font:**

Replace the single `extractColourHex` with two helpers:

```js
// Maps Office theme colour index to approximate RGB hex for display
var THEME_COLOUR_MAP = {
  4: '4472C4', 5: 'ED7D31', 6: 'A9D18E',
  7: 'FFC000', 8: '5B9BD5', 9: '70AD47',
};

function colourFromObj(colorObj) {
  if (!colorObj) return null;
  if (colorObj.rgb) {
    var hex = colorObj.rgb.toUpperCase();
    if (hex.length === 8) hex = hex.slice(2);  // strip alpha
    if (hex === 'FFFFFF' || hex === '000000') return null;
    return hex;
  }
  if (colorObj.theme !== undefined && colorObj.theme !== null) {
    if (colorObj.theme === 0 || colorObj.theme === 1) return null;  // background / default text
    return THEME_COLOUR_MAP[colorObj.theme] || '808080';
  }
  return null;
}

function extractColourHex(ws, addr) {
  var cell = ws[addr];
  if (!cell || !cell.s) return null;
  // 1. Fill colour takes precedence
  var fillHex = colourFromObj(cell.s.fgColor);
  if (fillHex) return fillHex;
  // 2. Fall back to font colour
  var fontColor = cell.s.font && cell.s.font.color;
  return colourFromObj(fontColor) || null;
}
```

- Collect `encounteredColours`: ordered array of distinct hex keys, appended on first encounter scanning left-to-right across CDS columns, top-to-bottom within each column.
- If `encounteredColours.length === 0` after full parse, set `fallbackMode = true`.
- Return `{ items, encounteredColours, fallbackMode }`.

### 2b. `resolveShortlistGroups(encounteredColours, directorateId, existingGroups)`

`encounteredColours` is an **ordered array** (not a Set) of distinct hex values in the order they were first encountered during parsing — left-to-right across CDS columns, top-to-bottom within each column. Ordering is established in `parseShortlistWorkbook` by appending to the array on first encounter.

Each import session always creates new group records — no matching against existing groups:

```js
const colourMap = {};
const newGroups = [];
let nextGroupId = Math.max(0, ...existingGroups.map(g => g.shortlist_group_id)) + 1;

encounteredColours.forEach((colour, idx) => {
  const id = nextGroupId++;
  newGroups.push({
    shortlist_group_id:    id,
    directorate_id:        directorateId,
    shortlist_group_label: `Group ${idx + 1}`,
    shortlist_colour_hex:  colour,
    retiring_timestamp:    null,
  });
  colourMap[colour] = id;
});
```

- Return `{ colourMap, newGroups }`.
- Four colours → four records: Group 1, Group 2, Group 3, Group 4.
- Records are committed to `data.shortlist_group` during apply, not before.

### 2c. `resolveDirectorate(stewardIdentity, isMaster, data)`

Returns `{ mode, directorateId, options }`:
- `mode: 'auto'` — single directorate found, no picker needed. `directorateId` set.
- `mode: 'pick'` — multiple or zero directorates, or master user. `options` = array of `{ directorate_id, directorate_name }` for the picker. `directorateId` null until user selects.

Traversal: `stewardIdentity.id` → `data.stewardship` (active rows) → `critical_data_set_id` values → `data.critical_data_set.directorate_id` values → deduplicate → `data.directorate` labels.

If `isMaster`: always `mode: 'pick'`, all non-retired directorates as options.

### 2d. `analyseShortlist(parsed, colourMap, directorateId, data)`

- For each `{ cdsName, fields }`:
  - Find existing CDS: `data.critical_data_set.find(r => !r.retiring_timestamp && r.directorate_id === directorateId && r.data_set_name.trim().toLowerCase() === cdsName.trim().toLowerCase())`.
  - `cdsStatus: 'new' | 'existing'`, `existingCdsId`.
  - For each field:
    - `shortlistGroupId = colourMap[field.colourHex] ?? null`.
    - If `cdsStatus === 'existing'`: find existing CDE by `critical_data_set_id + source_field_name` (case-insensitive trim, no retiring_timestamp).
    - `fieldStatus: 'new' | 'duplicate'`, `existingCdeId`.
    - If `cdsStatus === 'new'`: all fields are `'new'` by definition.
- Return `{ summary: { newCds, existingCds, newCde, duplicateCde }, items }`.

### 2e. `applyShortlistImport(analysis, resolutions, directorateId, newGroups, data)`

- Spread all relevant tables.
- Append `newGroups` to `data.shortlist_group`.
- Compute starting PKs:
  ```js
  let nextCdsId = Math.max(0, ...data.critical_data_set.map(r => r.critical_data_set_id)) + 1;
  let nextCdeId = Math.max(0, ...data.critical_data_element.map(r => r.critical_data_element_id)) + 1;
  let nextTagId = Math.max(0, ...(data.cde_shortlist_tag || []).map(r => r.cde_shortlist_tag_id)) + 1;
  ```
- For each `item` in `analysis.items`:
  - Determine `resolvedCdsId`:
    - `cdsStatus === 'new'` → create CDS, assign `nextCdsId++`.
    - `cdsStatus === 'existing'`, resolution `'A'` → use `existingCdsId`.
    - `cdsStatus === 'existing'`, resolution `'B'` → create new CDS, assign `nextCdsId++`.
  - For each field:
    - `fieldStatus === 'new'` → create CDE.
    - `fieldStatus === 'duplicate'`, resolution `'A'` (Skip) → skip both CDE and tag.
    - `fieldStatus === 'duplicate'`, resolution `'B'` → create CDE.
  - CDE row:
    ```js
    {
      critical_data_element_id: nextCdeId++,
      critical_data_set_id:     resolvedCdsId,
      source_field_name:        field.fieldName,
      source_platform_name: '', source_system_name: '',
      source_database_name: '', source_table_name: '',
      source_snapshot_filter: '', data_element_definition: '',
      data_element_explanation: '', retiring_timestamp: null,
    }
    ```
  - If `field.shortlistGroupId` is non-null: create tag row:
    ```js
    {
      cde_shortlist_tag_id:     nextTagId++,
      critical_data_element_id: newCdeId,
      shortlist_group_id:       field.shortlistGroupId,
      retiring_timestamp:       null,
    }
    ```
- Return `{ newData, counts: { newCds, newCde, shortlisted } }`.

### 2f. `ShortlistImportTab` component — render flow

State:
```js
const [file, setFile]               = useState(null);
const [parsed, setParsed]           = useState(null);
const [fallbackMode, setFallback]   = useState(false);
const [dirMode, setDirMode]         = useState(null);   // 'auto' | 'pick'
const [dirOptions, setDirOptions]   = useState([]);
const [directorateId, setDirId]     = useState(null);
const [groupResult, setGroupResult] = useState(null);   // { colourMap, newGroups }
const [analysis, setAnalysis]       = useState(null);
const [resolutions, setResolutions] = useState({});     // all defaulted to 'A'
const [done, setDone]               = useState(null);
```

Render phases (sequential, each phase revealed after previous is complete):

**Phase 1 — File picker**
- `<input type="file" accept=".xlsx">` → on change: read buffer, parse, set `parsed + fallbackMode`.
- If `fallbackMode`: amber warning banner.

**Phase 2 — Directorate (revealed after parse)**
- Run `resolveDirectorate`; set `dirMode + dirOptions + directorateId` (if auto).
- If `mode === 'auto'`: read-only label "Importing into: {name}".
- If `mode === 'pick'`: `<select>` over `dirOptions`. Confirm button enables when a selection is made.

**Phase 3 — Group preview (revealed after directorate confirmed)**
- Run `resolveShortlistGroups`; set `groupResult`.
- Render `ColourGroupPreview` — table of colour swatches + labels + new/existing badge.
- "Proceed to analysis" button.

**Phase 4 — Analysis & conflict review (revealed after group preview confirmed)**
- Run `analyseShortlist`; set `analysis`.
- Default all conflict resolutions to `'A'`.
- Render `ConflictSummaryBanner`.
- Render CDS conflict cards (existingCds only).
- Render CDE conflict cards (duplicates only, grouped under their CDS).
- "Apply import" button — always enabled (defaults cover all conflicts).

**Phase 5 — Success**
- Run `applyShortlistImport` → `setData(newData)` → `persist(newData)` → set `done`.
- Banner: "Imported: X CDS, Y CDE (Z shortlisted across N groups)."
- "Import another file" button resets all state.

Sub-components (all defined within `215_shortlist_import.js`):
- `ColourGroupPreview({ newGroups, existingMatches })` — colour swatches with labels + new/existing badge.
- `ConflictSummaryBanner({ summary })` — counts row.
- `CdsConflictCard({ item, resolution, onResolve })`.
- `CdeConflictCard({ cdsName, field, resolution, onResolve })`.

---

## Step 3 — Modify `src/210_screen_import.js`

- Add `'shortlist'` to the tab list.
- Tab label: "CDE Shortlist".
- Render `<ShortlistImportTab />` when active tab is `'shortlist'`.

---

## Step 4 — CDE Panel: Shortlist Tag Editing

Identify the CDE panel form (in the generic view or specialised CDE view). Add a **Shortlist Group** section below the existing fields.

**Read path:**
- Find the active `cde_shortlist_tag` row for this CDE: `data.cde_shortlist_tag.find(t => t.critical_data_element_id === cde.critical_data_element_id && !t.retiring_timestamp)`.
- Resolve label via `data.shortlist_group`.
- Display: colour swatch + label, or "Not shortlisted".

**Edit path:**
- Dropdown options: all active `shortlist_group` records where `directorate_id` matches the CDE's directorate (resolved via `critical_data_set_id → critical_data_set.directorate_id`), plus a "None — remove tag" option.
- On save:
  - If "None" selected: retire the existing active tag row (set `retiring_timestamp = new Date().toISOString()`). No new row.
  - If a group selected and it differs from current: retire the existing active tag row (if any), create a new `cde_shortlist_tag` row. If it matches the current: no-op.
  - Both operations happen in a single state update via `setData`.

---

## Step 5 — Export Screen: Shortlist Column & Incomplete Filter

Locate the CDE export logic.

**5a. Add shortlist group column**

When building CDE export rows, look up the active `cde_shortlist_tag` for each CDE → resolve `shortlist_group_label`. Add as column `"Shortlist Group"`. Empty string if not shortlisted.

**5b. Completeness filter — user-selectable**

Add a filter control to the export UI (radio buttons or a select):
- "Complete only" (default)
- "Incomplete only"
- "All"

Before building export rows, always partition:
```js
const isComplete = r => r.source_platform_name && r.source_system_name && r.source_database_name && r.source_table_name;
const complete   = cdes.filter(isComplete);
const incomplete = cdes.filter(r => !isComplete(r));
```

Apply the selected filter:
```js
const toExport = filter === 'complete'   ? complete
               : filter === 'incomplete' ? incomplete
               : cdes;
```

Always show a count summary regardless of selection: "X complete, Y incomplete" so the user knows the split before downloading. Default filter state = `'complete'`.

---

## Implementation Order

Dependencies require this sequence:

1. `10_constants.js` — schema changes (all other files depend on SCHEMA)
2. `215_shortlist_import.js` — full component + logic
3. `210_screen_import.js` — tab addition
4. CDE panel file — shortlist tag editing section
5. Export screen — column + filter
6. Docs + changelog + build

---

## Build Sequence

Per mandatory end-of-task procedure:

1. Pre-generate build ID: `python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"`
2. Write CHANGELOG.md entry.
3. Write SESSION_METRICS.md entry.
4. Add guide "How to import CDEs from the CDE Shortlist template" to `documentation/user-guide/`; update `index.html` TOC.
5. Update APP_TREE.md — add `215_shortlist_import.js`; add `shortlist_group` and `cde_shortlist_tag` to schema table list.
6. Run `cd build && python build.py`.
