# PLAN -- MoJ Quality Framework Profiling Alignment

Paired with: `designs/DESIGN_PROFILING_MOJ_ALIGNMENT.md`

---

## Step 1 -- Update schema in `10_constants.js`

In the `field_profiling.cols` array:

1. Update four existing column labels:
   - `summary_raw` label: `'Summary profile'` -> `'Column profiling'`
   - `top_values_raw` label: `'Top values'` -> `'Frequency analysis'`
   - `type_patterns_raw` label: `'Type patterns'` -> `'Pattern analysis'`
   - `length_distribution_raw` label: `'Length distribution'` -> `'Length profile'`

2. Insert two new columns after the `length_distribution_raw` entry and before `profiling_notes`:

```js
{ name: 'duplicate_analysis_raw', type: 'text', label: 'Duplicate analysis', optional: true },
{ name: 'outlier_analysis_raw',   type: 'text', label: 'Outlier analysis',   optional: true },
```

---

## Step 2 -- Update `buildProfilingSQL` in `200_screen_ddl.js`

### 2a. Rename SQL comments

| Old comment                      | New comment                         |
|----------------------------------|-------------------------------------|
| `-- SUMMARY PROFILE (numeric...` | `-- COLUMN PROFILING (numeric...`   |
| `-- SUMMARY PROFILE (date...`    | `-- COLUMN PROFILING (date...`      |
| `-- SUMMARY PROFILE (string...`  | `-- COLUMN PROFILING (string...`    |
| `-- TOP VALUES (all types)`      | `-- FREQUENCY ANALYSIS (all types)` |
| `-- TYPE PATTERNS (string fields)` | `-- PATTERN ANALYSIS (string fields)` |
| `-- LENGTH DISTRIBUTION (string fields)` | `-- LENGTH PROFILE (string fields)` |

### 2b. Add `duplicateSQL` after `lengthSQL`

Applies to all field types (no null branch):

```js
const duplicateSQL = `-- DUPLICATE ANALYSIS (all types)
SELECT
  COUNT(*)                                               AS total_values,
  COUNT(DISTINCT ${field})                               AS unique_values,
  COUNT(*) - COUNT(DISTINCT ${field})                    AS excess_duplicates,
  ROUND(100.0 * COUNT(DISTINCT ${field}) / NULLIF(COUNT(*),0), 2) AS uniqueness_pct
FROM ${db}.${tbl}
${snapWhereAnd}${field} IS NOT NULL;`;
```

### 2c. Add `outlierSQL` after `duplicateSQL`

Branches on `isNumeric`:

```js
const outlierSQL = isNumeric
  ? `-- OUTLIER ANALYSIS (numeric -- Z-score > 3)
WITH stats AS (
  SELECT
    AVG(CAST(${field} AS DOUBLE))    AS mean_val,
    STDDEV(CAST(${field} AS DOUBLE)) AS stddev_val
  FROM ${db}.${tbl}
  ${snapWhereAnd}${field} IS NOT NULL
)
SELECT
  t.${field}                                                       AS raw_value,
  ROUND(CAST(t.${field} AS DOUBLE), 4)                             AS numeric_value,
  ROUND(ABS(CAST(t.${field} AS DOUBLE) - s.mean_val)
    / NULLIF(s.stddev_val, 0), 2)                                  AS z_score
FROM ${db}.${tbl} t
CROSS JOIN stats s
${snapWhereAnd}t.${field} IS NOT NULL
  AND ABS(CAST(t.${field} AS DOUBLE) - s.mean_val) > 3 * s.stddev_val
ORDER BY z_score DESC
LIMIT 100;`
  : isBoolean ? null
  : `-- OUTLIER ANALYSIS (categorical -- low-frequency values)
WITH counts AS (
  SELECT ${field}, COUNT(*) AS cnt
  FROM ${db}.${tbl}${snap ? '\n' + snapWhere : ''}
  GROUP BY ${field}
),
total AS (SELECT SUM(cnt) AS n FROM counts)
SELECT
  c.${field}                                  AS value,
  c.cnt                                       AS occurrences,
  ROUND(100.0 * c.cnt / t.n, 4)              AS pct
FROM counts c
CROSS JOIN total t
WHERE c.cnt <= 2 OR (100.0 * c.cnt / t.n < 0.1)
ORDER BY c.cnt ASC
LIMIT 50;`;
```

### 2d. Update the return statement

```js
return { summarySQL, topValuesSQL, typePatternsSQL, lengthSQL, duplicateSQL, outlierSQL };
```

---

## Step 3 -- Update `FieldProfilingPanel` in `200_screen_ddl.js`

### 3a. Add two new state variables (alongside existing ones)

```js
const [duplicateRaw, setDuplicateRaw] = useState('');
const [outlierRaw,   setOutlierRaw]   = useState('');
```

### 3b. Populate from `existingProfile` in the `useEffect`

Add inside the `if (existingProfile)` block:

```js
setDuplicateRaw(existingProfile.duplicate_analysis_raw || '');
setOutlierRaw(existingProfile.outlier_analysis_raw     || '');
```

### 3c. Rename existing `ProfilingSqlStep` labels

| stepNum | Old label           | New label            |
|---------|---------------------|----------------------|
| 1       | Summary Profile     | Column Profiling     |
| 2       | Top Values          | Frequency Analysis   |
| 3       | Type Patterns       | Pattern Analysis     |
| 4       | Length Distribution | Length Profile       |

### 3d. Add two new `ProfilingSqlStep` cards after the Length Profile card

```jsx
<ProfilingSqlStep stepNum="5" label="Duplicate Analysis" sqlKey="duplicate"
  sql={sqls.duplicateSQL} value={duplicateRaw} onChange={setDuplicateRaw}
  accent={accent} copied={copied} onCopy={copySQL}/>
<ProfilingSqlStep stepNum="6" label="Outlier Analysis" sqlKey="outlier"
  sql={sqls.outlierSQL} value={outlierRaw} onChange={setOutlierRaw}
  accent={accent} copied={copied} onCopy={copySQL}/>
```

### 3e. Write new fields in `handleSave`

Add to the `upsertRecord` call:

```js
duplicate_analysis_raw: duplicateRaw || null,
outlier_analysis_raw:   outlierRaw   || null,
```

---

## Step 4 -- Build and verify

```bash
cd build && python build.py
```

### Manual checks

- Open any field profiling panel -- confirm 6 sections appear in Step 2
- Confirm section labels are: Column Profiling, Frequency Analysis, Pattern Analysis, Length Profile, Duplicate Analysis, Outlier Analysis
- Duplicate Analysis: all field types show a Copy SQL button (numeric, string, date)
- Outlier Analysis: numeric fields show Z-score query; string fields show low-frequency query; boolean shows "Not applicable"
- Save a profile with results pasted in the new sections -- re-open and confirm values persist
- Existing profiles (with only the original 4 sections filled): open and confirm the two new fields show empty textareas, no errors

---

## Files Changed

| File                    | Change                                                            |
|-------------------------|-------------------------------------------------------------------|
| `src/10_constants.js`   | 4 label updates + 2 new columns in `field_profiling`             |
| `src/200_screen_ddl.js` | `buildProfilingSQL` + `FieldProfilingPanel` (labels + 2 sections) |

## Estimated effort

~25 minutes coding + build + manual test
