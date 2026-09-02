# PLAN: Data Uploader Export

**Date:** 2026-09-02
**Design:** `designs/DESIGN_EXPORT_FOR_UPLOADER.md`
**Status:** Approved — ready for implementation

---

## Overview

Two related changes delivered together:

1. **Export page tabs** — refactor `230_screen_export.js` from a single-scroll page to a tabbed layout (matching the Import page pattern). Existing export features are restructured into tabs with no behaviour changes.
2. **Uploader tab** — new master-only tab backed by two new files: `231_uploader_validation.js` (pure logic) and `232_uploader_export.js` (UI component).

---

## Files affected

| File | Change |
|------|--------|
| `src/230_screen_export.js` | Add tab state + tab bar; wrap each existing section in its tab |
| `src/231_uploader_validation.js` | **New file** — `computeUploaderExclusions` + `buildUploaderReceipt`; pure logic only, no UI |
| `src/232_uploader_export.js` | **New file** — `UploaderExportTab` component; UI only, calls into `231` |
| `APP_TREE.md` | Register both new files |
| `documentation/user-guide/index.html` | Add entry for new guide |
| `documentation/user-guide/how-to-uploader-export.html` | **New guide** |
| `CHANGELOG.md` | Release entry |
| `SESSION_METRICS.md` | Session entry |

---

## File structure rationale

The validity logic (`231_uploader_validation.js`) is intentionally isolated from the UI component (`232_uploader_export.js`). This mirrors the existing `45_rule_sql_warnings.js` pattern — a dedicated pure-logic file that can be opened, read, and edited entirely independently of any rendering code.

When checks need to be tuned based on real-world examples (expected to happen repeatedly), the engineer opens only `231_uploader_validation.js`. The UI file is never touched. The blast radius of a logic change is zero for the UI.

Within `231_uploader_validation.js`, checks are grouped by type with clear section comments. Adding or adjusting a check is: find the right section, add/change one condition, add/change one reason string.

---

## Step 1 — Create `src/231_uploader_validation.js`

Pure functions only. No JSX, no `useState`, no component definitions.

### 1a. `computeUploaderExclusions(data)`

Iterates all non-retired `data_quality_rule_allocation` records and classifies each as included or excluded.

**Lookup maps to build first** (index by PK for O(1) access):
- `ruleMap`: `data_quality_rule_id → rule record`
- `cdeMap`: `critical_data_element_id → cde record`
- `cdsMap`: `critical_data_set_id → cds record`

**Per-allocation checks — section: Rule checks**

| Check | Reason string if fails |
|-------|----------------------|
| `rule` record not found in `ruleMap` | `'Linked rule record not found (ID: X)'` |
| `rule.sql_code` blank or whitespace-only | `'Rule has no SQL code'` |

**Per-allocation checks — section: CDE checks**

| Check | Reason string if fails |
|-------|----------------------|
| `cde` record not found in `cdeMap` | `'Linked CDE record not found (ID: X)'` |
| `cde.source_database_name` blank | `'Missing source_database_name on CDE'` |
| `cde.source_table_name` blank | `'Missing source_table_name on CDE'` |
| `cde.source_field_name` blank | `'Missing source_field_name on CDE'` |

**Per-allocation checks — section: Substitution + sanity checks**

Run **only when** both `rule` and `cde` were found AND the above checks produced zero reasons. This prevents misleading secondary errors from already-broken data and keeps the "substitution" section clearly about a separate class of problem.

| Check | Reason string if fails |
|-------|----------------------|
| After substituting CDE source fields into `sql_code`, `{SOURCE_DATABASE_NAME}` still present | `'Unresolved placeholder {SOURCE_DATABASE_NAME} in sql_code'` |
| After substituting, `{SOURCE_TABLE_NAME}` still present | `'Unresolved placeholder {SOURCE_TABLE_NAME} in sql_code'` |
| After substituting, `{SOURCE_FIELD_NAME}` still present | `'Unresolved placeholder {SOURCE_FIELD_NAME} in sql_code'` |
| `sql_code` is empty/whitespace after substitution | `'SQL is empty after field substitution'` |
| Odd count of single-quote characters | `'Unbalanced single quotes in sql_code'` |
| Odd count of double-quote characters | `'Unbalanced double quotes in sql_code'` |
| Parenthesis depth does not return to zero | `'Unbalanced parentheses in sql_code'` |

**Return shape:**
```js
{
  included: [ ...allocation records that passed ],
  excluded: [
    {
      allocation: { ...allocation record },
      rule:       { ...rule record } | null,
      cde:        { ...cde record }  | null,
      cds:        { ...cds record }  | null,
      reasons:    [ 'string', ... ]
    }
  ],
  totalEvaluated: number
}
```

---

### 1b. `buildUploaderReceipt(excluded, totalEvaluated)`

Pure function. Returns a `Blob` (`application/json`). Called only when `excluded.length > 0`.

**Blob content** — JSON matching the structure in the design (§4.2):
```js
{
  _type:            'uploader_exclusion_receipt',
  _generated_at:    new Date().toISOString(),
  _total_evaluated: totalEvaluated,
  _total_included:  totalEvaluated - excluded.length,
  _total_excluded:  excluded.length,
  excluded_allocations: excluded.map(item => ({
    data_quality_rule_allocation_id: item.allocation.data_quality_rule_allocation_id,
    critical_data_set_name:          item.cds  ? (item.cds.critical_data_set_name || '-') : '-',
    critical_data_element_id:        item.allocation.critical_data_element_id,
    critical_data_element_name:      item.cde  ? (item.cde.source_field_name || '-') : '-',
    data_quality_rule_id:            item.allocation.data_quality_rule_id,
    data_quality_rule_name:          item.rule ? (item.rule.rule_name || '-') : '-',
    reasons:                         item.reasons,
  }))
}
```

---

## Step 2 — Create `src/232_uploader_export.js`

UI component only. Calls `computeUploaderExclusions` and `buildUploaderReceipt` from `231_uploader_validation.js` — no validation logic here.

### `UploaderExportTab` component

Uses `useApp()` for `data` and `canEdit`. Manages its own local state — nothing pushed into AppContext.

**State:**
```js
const [view,               setView]               = useState('settings'); // 'settings' | 'review'
const [includeSoftDeleted, setIncludeSoftDeleted]  = useState(false);
const [reviewResult,       setReviewResult]        = useState(null);
const [exporting,          setExporting]           = useState(false);
```

**`handleAnalyse`** (called by "Export for Uploader" button):
```js
const result = computeUploaderExclusions(data);
setReviewResult(result);
setView('review');
```

**`handleConfirm`** (called by the confirm button in review view):
```js
setExporting(true);
try {
  const ts = new Date().toISOString().replace(/[:\-T.Z]/g,'').slice(0,14);
  const filteredData = { ...data, data_quality_rule_allocation: reviewResult.included };

  // Build ZIP inline — same 6-line pattern as group export in 230_screen_export.js
  const zip = new JSZip();
  const folder = zip.folder('dq_uploader_' + ts);
  for (const tableName of Object.keys(SCHEMA)) {
    folder.file(tableName + '.csv', tableToCSV(tableName, filteredData, includeSoftDeleted));
  }
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = zipUrl; a.download = 'dq_uploader_' + ts + '.zip'; a.click();
  URL.revokeObjectURL(zipUrl);

  // Receipt — only when exclusions exist; silent <a>.click() (no save dialog)
  if (reviewResult.excluded.length > 0) {
    const receiptBlob = buildUploaderReceipt(reviewResult.excluded, reviewResult.totalEvaluated);
    const rUrl = URL.createObjectURL(receiptBlob);
    const b = document.createElement('a');
    b.href = rUrl; b.download = 'dq_uploader_receipt_' + ts + '.json'; b.click();
    URL.revokeObjectURL(rUrl);
  }

  setView('settings');
  setReviewResult(null);
} finally {
  setExporting(false);
}
```

**Settings view renders:**
- Short description of what the export does
- Soft-deleted toggle (same markup as Backup tab)
- `"Export for Uploader"` button — `disabled={!canEdit}`

**Review view renders:**
- Headline: `"X of Y Rule Allocations will be included. Z excluded."`
- **Excluded section** (expanded by default, collapsible toggle):
  - Each item: CDS name / CDE `source_field_name` / Rule name + reason list
  - Omit this section entirely when `excluded.length === 0`
- **Included section** (collapsed by default, expandable toggle):
  - Header shows count; expanded shows CDS / CDE / Rule name per allocation
- Confirm button: label `"Export ZIP + receipt"` when `excluded.length > 0`, `"Export ZIP"` when `excluded.length === 0`; `disabled={exporting}`
- `"Cancel"` button: `onClick={() => setView('settings')}`

**Non-ASCII note:** All punctuation in JSX text nodes (dashes, bullets, pipes) must use JS expression wrappers or `String.fromCharCode()` — no literal special characters between JSX tags.

---

## Step 3 — Refactor `src/230_screen_export.js`

### 3a. Add tab state

```js
const [tab, setTab] = useState(() => isMaster ? 'master' : 'delta');
```

Lazy initializer ensures the default tab is always visible to the current user type.

### 3b. Build tab bar

Copy the inline pattern from `210_screen_import.js:854-869`. Build tabs array conditionally:

```js
const tabs = isMaster
  ? [
      { id: 'master',   label: 'Master'   },
      { id: 'uploader', label: 'Uploader' },
      { id: 'backup',   label: 'Backup'   },
      { id: 'tables',   label: 'Tables'   },
    ]
  : [
      { id: 'delta',  label: 'Delta'  },
      { id: 'backup', label: 'Backup' },
    ];
```

Active tab underline: `var(--accent)` (import screen uses `var(--green)`; export uses accent to distinguish).

### 3c. Wrap each existing section in its tab

| Existing section | Tab id |
|-----------------|--------|
| Master JSON export card | `'master'` |
| Backup export card | `'backup'` |
| Delta export card | `'delta'` |
| TABLE_GROUPS per-group section | `'tables'` |

Add Uploader tab:
```jsx
{tab === 'uploader' && <UploaderExportTab />}
```

### 3d. Move the read-only banner

The read-only mode banner currently renders before the Backup card. Move it inside the Backup tab content so it only shows when relevant.

---

## Step 4 — Update `APP_TREE.md`

Add both new files to the Infrastructure files table:

```
| `231_uploader_validation.js` | `computeUploaderExclusions(data)`, `buildUploaderReceipt(excluded, totalEvaluated)` — allocation validity filter and receipt builder; pure logic, no UI |
| `232_uploader_export.js`     | `UploaderExportTab` — uploader export tab component; calls into `231_uploader_validation.js` |
```

---

## Step 5 — Update user documentation

### 5a. New guide: `documentation/user-guide/how-to-uploader-export.html`

Cover:
- What the Uploader Export is (engine-bound ZIP with invalid allocations excluded)
- How to run it: Export page → Uploader tab → set soft-deleted toggle → Export for Uploader button
- Reading the review screen: what excluded means, how to act on it (navigate to fix in editing views, re-run)
- The receipt file: what it contains and how to share it with field stewards

### 5b. Update `documentation/user-guide/index.html`

Add the new guide to the Export / Data Exchange section of the TOC.

---

## Step 6 — CHANGELOG + SESSION_METRICS + build

**Must be done before running the build** — the build bundles CHANGELOG into the release zip:

1. Pre-generate the build ID:
   ```bash
   python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"
   ```
2. Write CHANGELOG.md entry using that ID.
3. Write SESSION_METRICS.md entry.
4. Run build:
   ```bash
   cd build && python build.py
   ```

---

## Risk notes

- **Non-ASCII in JSX text nodes** — the review screen renders CDS/CDE/Rule names and reason strings that may contain special characters from user-entered data. All static punctuation in JSX text nodes must use escape wrappers. User-entered data rendered via `{variable}` is safe.
- **Load order** — `232_uploader_export.js` depends on functions in `231_uploader_validation.js`, which in turn uses `SCHEMA` (10), `data` from context (50). All dependencies load before `231`. Satisfied.
- **`computeRuleSqlWarnings` overlap** — the validity filter and the existing SQL warnings in the Rule form check related but different things. An allocation can appear in both the uploader exclusion list and generate warnings in the Rule form. This is correct and intentional — no deduplication needed.
- **Zero-exclusion path** — the review screen is always shown; it is never skipped even when exclusions = 0. Confirm button reads `"Export ZIP"`, no receipt is produced.
