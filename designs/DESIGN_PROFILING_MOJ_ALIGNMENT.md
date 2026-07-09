# DESIGN -- MoJ Quality Framework Profiling Alignment

## Goal

Align Field Profiling panel (Step 2) section labels and SQL queries with the MoJ Quality Framework
terminology, and add two missing analysis types (Duplicate Analysis and Outlier Analysis).

---

## Current vs Proposed Sections

| # | Current label     | sqlKey       | Proposed label       | Action                              |
|---|-------------------|--------------|----------------------|-------------------------------------|
| 1 | Summary Profile   | summary      | Column Profiling     | Rename label + SQL comment          |
| 2 | Top Values        | topValues    | Frequency Analysis   | Rename label + SQL comment          |
| 3 | Type Patterns     | typePatterns | Pattern Analysis     | Rename label + SQL comment          |
| 4 | Length Distribution | length     | Length Profile       | Rename label + SQL comment (minor)  |
| 5 | (new)             | duplicate    | Duplicate Analysis   | New SQL + state + schema column     |
| 6 | (new)             | outlier      | Outlier Analysis     | New SQL + state + schema column     |

Sections 3 and 4 have no direct MoJ equivalent but are retained because they surface format
consistency and length anomalies which are genuinely useful for DQ assessment.

---

## New Section: Duplicate Analysis

Measures field-level uniqueness. Applies to all field types (no null branch).

```sql
-- DUPLICATE ANALYSIS
SELECT
  COUNT(*)                                              AS total_values,
  COUNT(DISTINCT field)                                 AS unique_values,
  COUNT(*) - COUNT(DISTINCT field)                      AS excess_duplicates,
  ROUND(100.0 * COUNT(DISTINCT field) / NULLIF(COUNT(*),0), 2) AS uniqueness_pct
FROM db.table
WHERE snapshotFilter AND field IS NOT NULL;
```

Interpretation: `uniqueness_pct = 100` means all non-null values are distinct. Lower values
indicate duplicated field values and a potential completeness or integrity issue.

---

## New Section: Outlier Analysis

Branches on field type.

### Numeric fields (INT, BIGINT, DOUBLE, FLOAT, DECIMAL, REAL, NUMERIC, LONG):

Z-score detection -- rows where the value is more than 3 standard deviations from the mean.

```sql
-- OUTLIER ANALYSIS (numeric -- Z-score > 3)
WITH stats AS (
  SELECT
    AVG(CAST(field AS DOUBLE))    AS mean_val,
    STDDEV(CAST(field AS DOUBLE)) AS stddev_val
  FROM db.table
  WHERE snapshotFilter AND field IS NOT NULL
)
SELECT
  t.field                                                            AS raw_value,
  ROUND(CAST(t.field AS DOUBLE), 4)                                  AS numeric_value,
  ROUND(ABS(CAST(t.field AS DOUBLE) - s.mean_val)
    / NULLIF(s.stddev_val, 0), 2)                                    AS z_score
FROM db.table t
CROSS JOIN stats s
WHERE snapshotFilter AND t.field IS NOT NULL
  AND ABS(CAST(t.field AS DOUBLE) - s.mean_val) > 3 * s.stddev_val
ORDER BY z_score DESC
LIMIT 100;
```

### String / Date / Other fields (low-frequency outliers):

Values that appear very rarely (occurrences <= 2 OR frequency below 0.1%).

```sql
-- OUTLIER ANALYSIS (categorical -- low-frequency values)
WITH counts AS (
  SELECT field, COUNT(*) AS cnt
  FROM db.table
  WHERE snapshotFilter
  GROUP BY field
),
total AS (SELECT SUM(cnt) AS n FROM counts)
SELECT
  c.field                                                AS value,
  c.cnt                                                  AS occurrences,
  ROUND(100.0 * c.cnt / t.n, 4)                         AS pct
FROM counts c
CROSS JOIN total t
WHERE c.cnt <= 2 OR (100.0 * c.cnt / t.n < 0.1)
ORDER BY c.cnt ASC
LIMIT 50;
```

### Boolean and not-applicable types: `null` (panel shows "Not applicable for this type").

---

## Schema Changes

Two new optional `text` columns added to `field_profiling` in `10_constants.js`:

| Column name              | Type | Label               | optional |
|--------------------------|------|---------------------|----------|
| `duplicate_analysis_raw` | text | Duplicate analysis  | true     |
| `outlier_analysis_raw`   | text | Outlier analysis    | true     |

Inserted after `length_distribution_raw`, before `profiling_notes`.

Four existing column labels updated (no column name changes -- storage is unaffected):

| Column name          | Old label           | New label          |
|----------------------|---------------------|--------------------|
| `summary_raw`        | Summary profile     | Column profiling   |
| `top_values_raw`     | Top values          | Frequency analysis |
| `type_patterns_raw`  | Type patterns       | Pattern analysis   |
| `length_distribution_raw` | Length distribution | Length profile |

---

## Impact on Existing Profiling Records

No migration required. Existing records simply have `duplicate_analysis_raw = null` and
`outlier_analysis_raw = null`, which renders as empty textareas in the panel (same as any
optional field that was not filled in). Storage column renames are not performed -- only
display labels change.

---

## Files Changed

| File                  | Change                                                       |
|-----------------------|--------------------------------------------------------------|
| `src/10_constants.js` | Add 2 columns to `field_profiling`; update 4 display labels |
| `src/200_screen_ddl.js` | `buildProfilingSQL`: rename comments, add `duplicateSQL`/`outlierSQL`; `FieldProfilingPanel`: add 2 states, 2 ProfilingSqlStep cards, write 2 fields in `handleSave` |
