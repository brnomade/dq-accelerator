# PLAN — CDE Token Substitution: Bug Fix + Centralisation

Paired with: `DESIGN_CDE_TOKEN_SUBSTITUTION.md`

---

## Step 1 — Add `substituteCdeTokens` to `20_data_utils.js`

Append after the last existing function in the file:

```js
function substituteCdeTokens(str, cde) {
  if (!str || !cde) return str || '';
  return str
    .replace(/\{SOURCE_DATABASE_NAME\}/gi, cde.source_database_name || '')
    .replace(/\{SOURCE_TABLE_NAME\}/gi,    cde.source_table_name    || '')
    .replace(/\{SOURCE_FIELD_NAME\}/gi,    cde.source_field_name    || '');
}
```

---

## Step 2 — Fix `200_screen_ddl.js` (the bug)

Line 279 — apply substitution when assembling `fieldEntry.snapshotFilter`:

```js
// Replace:
snapshotFilter: cde.source_snapshot_filter || null,

// With:
snapshotFilter: cde.source_snapshot_filter
  ? substituteCdeTokens(cde.source_snapshot_filter, cde)
  : null,
```

---

## Step 3 — Refactor `90_panels.js` — `composeSql()`

```js
// Remove the inline substitute function:
const substitute = (str) => str
  .replace(/\{SOURCE_DATABASE_NAME\}/gi, db)
  .replace(/\{SOURCE_TABLE_NAME\}/gi,    table)
  .replace(/\{SOURCE_FIELD_NAME\}/gi,    field);

// Change its two usages to:
let sql  = substituteCdeTokens(template, cde);
const snap = snapRaw ? substituteCdeTokens(snapRaw, cde) : null;
```

Also remove the now-unused `const db`, `const table`, `const field` locals
(they were only there to feed the inline substitute closure).

---

## Step 4 — Refactor `130_view_rule_allocation.js`

Lines 525-532. Remove:
```js
const db    = cde?.source_database_name || '';
const table = cde?.source_table_name    || '';
const field = cde?.source_field_name    || '';
const substitute = (str) => str
  .replace(/\{SOURCE_DATABASE_NAME\}/gi, db)
  .replace(/\{SOURCE_TABLE_NAME\}/gi,    table)
  .replace(/\{SOURCE_FIELD_NAME\}/gi,    field);
const snapSubstituted = cde?.source_snapshot_filter ? substitute(cde.source_snapshot_filter) : null;
```

Replace with:
```js
const snapSubstituted = cde?.source_snapshot_filter
  ? substituteCdeTokens(cde.source_snapshot_filter, cde) : null;
```

Note: `const field` is also used for `fieldName` — keep it if still needed, or inline it. Check usage at the `openSqlPanel` call.

---

## Step 5 — Refactor `141_view_cde_list.js`

Lines 154-163. Remove:
```js
const db    = cde?.source_database_name || '';
const table = cde?.source_table_name    || '';
const field = cde?.source_field_name    || '';
const substitute = (str) => str
  .replace(/\{SOURCE_DATABASE_NAME\}/gi, db)
  .replace(/\{SOURCE_TABLE_NAME\}/gi,    table)
  .replace(/\{SOURCE_FIELD_NAME\}/gi,    field);
const snapSubstituted = cde?.source_snapshot_filter
  ? substitute(cde.source_snapshot_filter) : null;
```

Replace with:
```js
const snapSubstituted = cde?.source_snapshot_filter
  ? substituteCdeTokens(cde.source_snapshot_filter, cde) : null;
```

Keep `const db`, `const table`, `const field` only if they are used elsewhere in the function.

---

## Step 6 — Refactor `145_view_rules.js`

Lines 607-618. Remove:
```js
const sub = (str) => str
  .replace(/\{SOURCE_DATABASE_NAME\}/gi, cde.source_database_name || '')
  .replace(/\{SOURCE_TABLE_NAME\}/gi,    cde.source_table_name    || '')
  .replace(/\{SOURCE_FIELD_NAME\}/gi,    cde.source_field_name    || '');
```

Replace usage at line 618:
```js
snapshotFilter: cde.source_snapshot_filter ? sub(cde.source_snapshot_filter) : null,
// becomes:
snapshotFilter: cde.source_snapshot_filter
  ? substituteCdeTokens(cde.source_snapshot_filter, cde) : null,
```

---

## Step 7 — Refactor `180_screen_generator.js`

Lines 422-426. Replace body of `resolvePlaceholders`:

```js
// Before:
const resolvePlaceholders = (text) =>
  (text || '')
    .replace(/\{SOURCE_DATABASE_NAME\}/gi, cde.source_database_name || '')
    .replace(/\{SOURCE_TABLE_NAME\}/gi,    cde.source_table_name    || '')
    .replace(/\{SOURCE_FIELD_NAME\}/gi,    cde.source_field_name    || '');

// After:
const resolvePlaceholders = (text) => substituteCdeTokens(text, cde);
```

---

## Step 8 — Build and verify

```bash
cd build && python build.py
```

### Manual checks

**Profiling bug fix:**
- Open the Profiling page, click a field that has a `source_snapshot_filter` with tokens (e.g. `{SOURCE_DATABASE_NAME}`)
- Step 1: Snapshot filter pill shows resolved values (no curly braces)
- Step 2: COPY each SQL, paste into a text editor — WHERE clause uses real db/table/field names

**Regression — Rules Explorer:**
- Open Rules Explorer, click View SQL on a rule with a snapshot filter — still works correctly

**Regression — Rule Allocation screen:**
- Open a rule allocation, click SQL — snapshot filter still substituted

**Regression — CDE List:**
- Open CDE list SQL panel — snapshot filter still substituted

**Regression — Rule Generator:**
- Open Rule Generator, use Test It — still copies correctly substituted SQL

---

## Files Changed

| File | Type of change |
|------|---------------|
| `src/20_data_utils.js` | Add `substituteCdeTokens` utility |
| `src/90_panels.js` | Refactor — replace inline substitute in `composeSql` |
| `src/130_view_rule_allocation.js` | Refactor — remove inline substitute |
| `src/141_view_cde_list.js` | Refactor — remove inline substitute |
| `src/145_view_rules.js` | Refactor — remove inline `sub` |
| `src/180_screen_generator.js` | Refactor — simplify `resolvePlaceholders` |
| `src/200_screen_ddl.js` | **Bug fix** — apply substitution at `fieldMap` assembly |

---

## Estimated effort

~40 minutes coding + build + manual test
