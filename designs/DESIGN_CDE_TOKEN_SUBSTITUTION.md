# DESIGN — CDE Token Substitution: Bug Fix + Centralisation

**Feature:** Fix missing token substitution in the Profiling page field panel, and extract the substitution logic into a single shared utility used by all screens that need it.

---

## The Bug

On the Profiling page (`FieldProfilingPanel` in `200_screen_ddl.js`), the `snapshotFilter` shown in Step 1 and embedded into every profiling SQL query (Step 2 COPY SQL buttons) contains raw template tokens such as:

```
event_month = '{SOURCE_TABLE_NAME}'
```

instead of the resolved values:

```
event_month = 'my_actual_table'
```

### Root Cause

In `200_screen_ddl.js:279`, when the `fieldMap` is assembled from CDE records, the `snapshotFilter` is stored verbatim:

```js
snapshotFilter: cde.source_snapshot_filter || null,  // ← raw, unsubstituted
```

This raw value is then:
- **Displayed** as-is in the Step 1 "Snapshot filter" pill (line 943)
- **Passed** to `buildProfilingSQL` (line 781), which embeds it directly into WHERE clauses

The three tokens that should be substituted are:

| Token | Substituted From |
|-------|-----------------|
| `{SOURCE_DATABASE_NAME}` | `cde.source_database_name` |
| `{SOURCE_TABLE_NAME}` | `cde.source_table_name` |
| `{SOURCE_FIELD_NAME}` | `cde.source_field_name` |

---

## The Duplication Problem

The identical 3-line substitution logic is currently copy-pasted into five separate locations:

| File | Location | Variable name |
|------|----------|---------------|
| `90_panels.js` | `composeSql()` lines 12-15 | `substitute` |
| `130_view_rule_allocation.js` | `openSql` callback lines 528-531 | `substitute` |
| `141_view_cde_list.js` | `openSql` callback lines 157-160 | `substitute` |
| `145_view_rules.js` | `handleOpenSql` callback lines 608-611 | `sub` |
| `180_screen_generator.js` | `resolvePlaceholders` lines 422-426 | (function itself) |

The `200_screen_ddl.js` profiling path is the sixth site — it simply forgot to do the substitution at all.

---

## Proposed Solution

### 1. New shared utility: `substituteCdeTokens(str, cde)`

Add to `20_data_utils.js` (loaded first, visible to all files):

```js
function substituteCdeTokens(str, cde) {
  if (!str || !cde) return str || '';
  return str
    .replace(/\{SOURCE_DATABASE_NAME\}/gi, cde.source_database_name || '')
    .replace(/\{SOURCE_TABLE_NAME\}/gi,    cde.source_table_name    || '')
    .replace(/\{SOURCE_FIELD_NAME\}/gi,    cde.source_field_name    || '');
}
```

**Design decisions:**
- Returns `str || ''` if either argument is falsy, preserving existing null-handling behaviour.
- Signature takes a `cde` object rather than three separate strings — matches every call site.
- Placed in `20_data_utils.js` so it loads before all consumers (90, 130, 141, 145, 180, 200).

### 2. Bug fix in `200_screen_ddl.js`

Apply `substituteCdeTokens` when assembling `fieldEntry.snapshotFilter` (line 279):

```js
// Before:
snapshotFilter: cde.source_snapshot_filter || null,

// After:
snapshotFilter: cde.source_snapshot_filter
  ? substituteCdeTokens(cde.source_snapshot_filter, cde)
  : null,
```

This fixes both the Step 1 display and the Step 2 SQL generation in one place, with no changes needed inside `buildProfilingSQL` or `FieldProfilingPanel`.

### 3. Replace all five duplicate inline functions

| File | Change |
|------|--------|
| `90_panels.js` | `composeSql()`: replace `const substitute = (str) => str.replace(...)×3` + its two usages with calls to `substituteCdeTokens(str, cde)` |
| `130_view_rule_allocation.js` | Remove `const substitute` block; replace its two usages |
| `141_view_cde_list.js` | Remove `const substitute` block; replace its two usages |
| `145_view_rules.js` | Remove `const sub` block; replace its one usage |
| `180_screen_generator.js` | Replace body of `resolvePlaceholders` with `substituteCdeTokens(text, cde)` |

---

## What is NOT changing

- `buildProfilingSQL` signature and logic — untouched.
- `SqlPanel` component in `90_panels.js` — untouched.
- All other substitution call sites remain behaviorally identical; this is purely deduplication.
- No schema changes, no routing changes.

---

## Risk Assessment

**Low.** The substitution logic is identical across all six sites — the regex patterns, flags, and fallback values are the same. Centralising them cannot introduce a behavioural difference. The only risk is a load-order mistake (new function called before it is defined), which is prevented by placing it in `20_data_utils.js`.

The bug fix is a single-line change at the `fieldMap` assembly point — it affects only the Profiling page.
