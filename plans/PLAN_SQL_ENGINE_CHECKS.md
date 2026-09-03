# PLAN: SQL Engine Checks — LIMIT and COUNT validation

**Branch:** feature/auto-update-visibility (current)
**Paired design:** DESIGN_SQL_ENGINE_CHECKS.md
**Status:** Awaiting approval

---

## Problem

The DQ engine fails at run time when `sql_code` or `sql_code_sample` on a
`data_quality_rule` record contains either of these errors:

- **LIMIT keyword** — the engine does not support LIMIT in SQL templates.
- **Plain SELECT without COUNT** — the engine requires `SELECT COUNT(...)` to
  return a numeric count of failing records; a plain SELECT produces
  incompatible output.

These errors were discovered via the Uploader tab on the Export page. They are
not currently caught by any in-app validation.

---

## Scope

Three files change. No new files created. No schema changes.

| File | Change |
|------|--------|
| `src/45_rule_sql_warnings.js` | Add LIMIT + no-COUNT checks to `computeRuleSqlWarnings` for both `sql_code` and `sql_code_sample` |
| `src/231_uploader_validation.js` | Add LIMIT + no-COUNT checks as uploader exclusion reasons; rename `balancedOk` flag to `engOk` (absorbed into renamed group) |
| `src/232_uploader_export.js` | Rename `CHECK_COLS` entry from `{ key:'balancedOk', label:'Bal' }` to `{ key:'engOk', label:'Eng' }` with updated tooltip |

---

## Detailed changes

### 1. `45_rule_sql_warnings.js` — `computeRuleSqlWarnings`

Additions for `sql_code` (`s`), immediately after the existing WHERE check:

```
if (/\bLIMIT\b/i.test(s))
  CRITICAL: "Rule SQL contains a LIMIT keyword. The engine does not support
             LIMIT in sql_code."

if (!/\bCOUNT\s*\(/i.test(s))
  CRITICAL: "Rule SQL uses plain SELECT without COUNT. The engine requires
             SELECT COUNT(...) to return the number of failing records."
```

Additions for `sql_code_sample` (`p`), inside the `if (p)` block after the
existing WHERE-present check:

```
if (/\bLIMIT\b/i.test(p))
  CRITICAL: "Sample SQL contains a LIMIT keyword. The engine does not support
             LIMIT in sql_code_sample."

if (!/\bCOUNT\s*\(/i.test(p))
  CRITICAL: "Sample SQL uses plain SELECT without COUNT. The engine requires
             SELECT COUNT(...) to return the number of failing records."
```

These warnings appear in: `RuleFormPanel` (166), `RuleAllocationFormPanel`
(130), and `CdeAllocFormPanel` (141) — all three already consume
`computeRuleSqlWarnings` and will pick up the new checks automatically.

### 2. `231_uploader_validation.js` — `computeUploaderExclusions`

Inside the `if (reasons.length === 0)` block, after the existing balance checks:

```javascript
var noLimitSql  = !/\bLIMIT\b/i.test(rule.sql_code);
var hasCountSql = /\bCOUNT\s*\(/i.test(rule.sql_code);
if (!noLimitSql)  reasons.push('sql_code contains a LIMIT keyword - not supported by the DQ engine');
if (!hasCountSql) reasons.push('sql_code uses plain SELECT without COUNT - the DQ engine requires SELECT COUNT(...)');

var noLimitSample  = true;
var hasCountSample = true;
if (rule.sql_code_sample && rule.sql_code_sample.trim()) {
  noLimitSample  = !/\bLIMIT\b/i.test(rule.sql_code_sample);
  hasCountSample = /\bCOUNT\s*\(/i.test(rule.sql_code_sample);
  if (!noLimitSample)  reasons.push('sql_code_sample contains a LIMIT keyword - not supported by the DQ engine');
  if (!hasCountSample) reasons.push('sql_code_sample uses plain SELECT without COUNT - the DQ engine requires SELECT COUNT(...)');
}
```

The `engOk` flag replaces `balancedOk` in the `checks` object:

```javascript
engOk: balancedOk && noLimitSql && hasCountSql && noLimitSample && hasCountSample,
```

`engOk` is `true` only when all five sub-checks pass:
balanced quotes, balanced parens, no LIMIT in sql_code, COUNT present in
sql_code, no LIMIT in sample (if defined), COUNT present in sample (if defined).

### 3. `232_uploader_export.js` — `CHECK_COLS`

Replace:
```javascript
{ key:'balancedOk', label:'Bal', tip:'SQL balance - single quotes, double quotes, and parentheses must be balanced' },
```
With:
```javascript
{ key:'engOk', label:'Eng', tip:'SQL engine checks - quotes and parentheses must be balanced, no LIMIT keyword, and SELECT COUNT(...) must be present in sql_code and sql_code_sample (when defined)' },
```

---

## What does NOT change

- No new `checks` columns in the uploader table — the Eng column replaces Bal.
- No inline badges on Rules Explorer tree rows.
- No changes to `CdeAllocFormPanel` or `RuleAllocationFormPanel` — they already
  consume `RuleSqlWarningNotices` and will pick up the new warnings automatically.
- No schema or localStorage changes.

---

## Mandatory end-of-task steps

1. Update `CHANGELOG.md` and `SESSION_METRICS.md` (pre-generate build ID first).
2. Update user documentation: the existing uploader guide will need a note about
   the two new engine checks and the Bal → Eng column rename.
3. Run `python build.py`.
4. `APP_TREE.md` — no structural changes, no update needed.
