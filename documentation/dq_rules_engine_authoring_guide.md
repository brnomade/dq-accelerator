# Data Quality Rules Engine — Rule Authoring Guide

> **Related documentation:**
> - [Overview](dq_rules_engine_overview.md) — architecture, data model, dbt models, schedules, output schema, and configuration
> - [Engine Internals & Flow](dq_rules_engine_internals.md) — runtime flowchart, macro breakdown, and compiled SQL examples

This guide explains how to write data quality rules, populate the required metadata tables, and get measurements recorded by the engine.

---

## Overview

The engine is driven by three metadata tables that you populate:

| Table | Purpose |
|---|---|
| `critical_data_element` | Describes the table/column being checked |
| `data_quality_rule` | Contains the SQL template for a check |
| `data_quality_rule_allocation` | Joins a rule to a CDE and sets its schedule |

At run time, the engine reads these tables, substitutes placeholders in your SQL, validates it for safety, executes each query against Athena, and writes results into `data_quality_poc__data_quality_measurement`.

Ensure there is a matching value in all three reference tables before submitting a rule.

---

## Step 1 — Define a Critical Data Element (CDE)

A CDE identifies the exact Athena table (and optionally column) that a rule will run against.

| Column | Required | Description |
|---|---|---|
| `critical_data_element_id` | ✅ | Unique identifier for this CDE |
| `critical_dataset_id` | ✅ | Parent dataset this CDE belongs to |
| `source_database_name` | ✅ | Athena database name |
| `source_table_name` | ✅ | Athena table name |
| `source_field_name` | automated rules only | Column name to check |
| `source_snapshot_filter` | optional | A filter predicate added to both the failures query and the denominator query — used to pin checks to the latest snapshot (see [Snapshot Filters](#snapshot-filters)) |
| `retiring_timestamp` | optional | Set to deactivate this CDE; leave null to keep active |

---

## Step 2 — Write a Rule

Rules are stored in `data_quality_rule`. There are two types: **automated** and **manual**.

### Rule columns

| Column | Required | Description |
|---|---|---|
| `data_quality_rule_id` | ✅ | Unique identifier |
| `sql_code` | ✅ | SQL template (see formats below) |
| `automated` | ✅ | `true` for automated rules, `false` for manual rules |
| `rule_name` | optional | Human-readable name |
| `rule_description` | optional | What the rule is checking |
| `source_code_link` | optional | Link to further documentation |
| `retiring_timestamp` | optional | Set to deactivate; leave null to keep active |

---

### Automated Rules

An automated rule runs a SQL query directly against your source data. The engine counts the failures and the total sample size on every scheduled run.

**Your SQL must return a single numeric value — the count of failing records.**

#### Required structure

```sql
SELECT COUNT(*)
FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME}
WHERE <your failure condition>
```

#### Examples

```sql
-- Count nulls in a field
SELECT COUNT(*)
FROM {source_database_name}.{source_table_name}
WHERE {source_field_name} IS NULL

-- Count records with a future date
SELECT COUNT(*)
FROM {source_database_name}.{source_table_name}
WHERE DATE({source_field_name}) > CURRENT_DATE

-- Count negative values
SELECT COUNT(*)
FROM {source_database_name}.{source_table_name}
WHERE CAST({source_field_name} AS DOUBLE) < 0

-- Count records failing an allowed-values check
SELECT COUNT(*)
FROM {source_database_name}.{source_table_name}
WHERE {source_field_name} NOT IN ('North', 'South', 'East', 'West')
```

The engine automatically generates a second query for the denominator (total sample count) using the same table and any snapshot filter you have defined.

#### Placeholders

These placeholders are replaced at run time with values from the linked CDE. They are **case-insensitive** — `{source_table_name}` and `{SOURCE_TABLE_NAME}` both work — but must be consistently cased (all upper or all lower, not `{Source_database_name}`).

| Placeholder | Replaced with | Output format |
|---|---|---|
| `{SOURCE_DATABASE_NAME}` | CDE `source_database_name` | `"my_database"` (double-quoted) |
| `{SOURCE_TABLE_NAME}` | CDE `source_table_name` | `"my_table"` (double-quoted) |
| `{SOURCE_FIELD_NAME}` | CDE `source_field_name` | `"my_column"` (double-quoted) |

> The engine adds double-quotes automatically. Both bare (`{SOURCE_TABLE_NAME}`) and pre-quoted (`"{SOURCE_TABLE_NAME}"`) placeholders are handled correctly.

Because identifiers are double-quoted, reserved words and mixed-case names are handled correctly.

#### `$partitions` references

When referencing Hive partition metadata tables, the `$partitions` suffix needs to sit inside the quoted identifier. Both of these input patterns are handled:

- `"{SOURCE_TABLE_NAME}$partitions"` → `"my_table$partitions"`
- `{SOURCE_TABLE_NAME}$partitions` → `"my_table$partitions"`

```sql
SELECT MAX(glueexporteddate)
FROM {SOURCE_DATABASE_NAME}."{SOURCE_TABLE_NAME}$partitions"
```

#### Referencing other tables

If your rule joins to tables other than the one defined in the CDE, write the database and table names directly — **do not use placeholders for tables that are not your CDE's source table**.

```sql
SELECT COUNT(*)
FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME}
WHERE {SOURCE_FIELD_NAME} NOT IN (
  SELECT DISTINCT status_code
  FROM my_other_database.reference_table
)
```

---

### Snapshot Filters

A snapshot filter pins your query to the latest partition (e.g., the most recent `glueexporteddate`). It is defined on the **CDE**, not the rule, and is shared between the failures query and the denominator (sample count) query.

#### How it is applied

The engine concatenates your filter with `AND` onto your `sql_code` *before* placeholder substitution:

```sql
-- Your sql_code:
SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME}
WHERE {SOURCE_FIELD_NAME} IS NULL

-- After filter injection and placeholder substitution:
SELECT COUNT(*) FROM "my_db"."my_table"
WHERE "my_field" IS NULL
AND glueexporteddate = (SELECT MAX(glueexporteddate) FROM "my_db"."my_table")
```

#### Mandatory requirement: your SQL must have a `WHERE` clause

Because the filter is appended with `AND`, your `sql_code` **must** end with a `WHERE` clause at the outermost query level. If your SQL does not have an outer `WHERE`, use `WHERE 1=1` or `WHERE true`:

```sql
-- ❌ BREAKS — no outer WHERE, so "AND filter" produces invalid SQL
SELECT COUNT(*) FROM (
  SELECT ... FROM ... WHERE ... JOIN ...
)

-- ✅ WORKS — WHERE 1=1 gives the AND something to attach to
SELECT COUNT(*) FROM (
  SELECT ... FROM ... WHERE ... JOIN ...
) WHERE 1=1
```

#### Snapshot filters support placeholders

Your filter value can use the same `{SOURCE_DATABASE_NAME}` and `{SOURCE_TABLE_NAME}` placeholders:

```
glueexporteddate = (SELECT MAX(glueexporteddate) FROM "{SOURCE_DATABASE_NAME}"."{SOURCE_TABLE_NAME}$partitions")
```

---

### Manual / Ad-hoc Rules

A manual rule reads pre-computed metrics from an upload table rather than computing them from source data. Use this when your DQ logic is too complex for a single SQL predicate, or when metrics are produced by an external system.

The customer uploads pre-calculated metrics to a table specific to that metric using the MoJ Data Uploader. There is no single global "manual feed" table — each rule's `sql_code` points at the uploader table that contains its metrics.

**Your SQL must return exactly these four columns:**

| Column | Type | Format |
|---|---|---|
| `failures_count` | Numeric | Integer or decimal |
| `total_sample_count` | Numeric | Integer or decimal |
| `measurement_timestamp` | String | `DD/MM/YYYY` |
| `extraction_timestamp` | String | `YYYYMMDDHHmmssZ` (e.g. `20251201143000Z`) |

```sql
SELECT
  failures_count,
  total_sample_count,
  measurement_timestamp,
  extraction_timestamp
FROM {source_database_name}.{source_table_name}
```

The engine uses `extraction_timestamp` to deduplicate: on each run it only ingests rows with an `extraction_timestamp` newer than the last successful run, so it is safe to leave old rows in the upload table.

**n.b.** The `extraction_timestamp` is added automatically by the Data Uploader. You do not need to add this column to your upload, but you do need to define the other columns as above.

#### Schedule

Manual rules must have `frequency` set to `ad-hoc` and are triggered separately:

```bash
dbt run --select <model> --vars '{schedule: "ad-hoc"}'
```

> **You cannot mix `ad-hoc` with other schedules in the same run.** The engine will raise an error.

---

## Step 3 — Allocate a Rule to a CDE

`data_quality_rule_allocation` joins a rule to a CDE and sets how often it runs.

| Column | Required | Description |
|---|---|---|
| `data_quality_rule_allocation_id` | ✅ | Unique identifier |
| `data_quality_rule_id` | ✅ | The rule to run |
| `critical_data_element_id` | ✅ | The CDE to run it against |
| `frequency` | ✅ | One of `hourly`, `daily`, `weekly`, `ad-hoc` |
| `retiring_timestamp` | optional | Set to deactivate; leave null to keep active |

### Schedule values

| Value | When it runs |
|---|---|
| `hourly` | Every hour |
| `daily` | Every day |
| `weekly` | Once a week |
| `ad-hoc` | Only when manually triggered |

> **Note:** `ad-hoc` cannot be combined with other schedules in a single dbt run. Automated rules (`hourly`, `daily`, `weekly`) run together; manual rules (`ad-hoc`) must be triggered separately.

---

## How the Engine Processes Your Rule

When you submit a rule, the engine performs these steps in order:

1. **Unicode cleaning** — invisible characters, non-standard spaces, and control codes from CSV ingestion are normalised or removed (this happens upstream in the `rules_lookup` view).
2. **Snapshot filter injection** — if your CDE has a `source_snapshot_filter`, it is concatenated onto your SQL with `AND`.
3. **Normalisation** — trailing semicolons are stripped, newlines are flattened to spaces, and whitespace is trimmed.
4. **Placeholder substitution** — `{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, and `{SOURCE_FIELD_NAME}` are replaced with the actual values from your CDE, wrapped in double-quotes.
5. **Safety validation** — the final SQL is checked against a set of rules (see below). If it fails, the rule is **blocked and logged** but does not stop the run.
6. **Execution** — the validated SQL is compiled into `SELECT` statements (one per rule allocation), joined with `UNION ALL`, and executed against Athena.

For more detail on the runtime flow, see [Engine Internals & Flow](dq_rules_engine_internals.md).

---

## SQL Safety Rules

Before execution, every SQL statement is validated. A rule is **skipped and logged** if it:

- Does not start with `SELECT` (leading comments are not allowed)
- Contains a semicolon outside string literals (only single statements are permitted)
- Contains any of the following keywords as standalone tokens: `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`

### CTEs are not allowed

CTEs (`WITH ... AS (...)`) are blocked in the current iteration because they do not start with `SELECT`. Rewrite CTE logic as subqueries:

```sql
-- ❌ Blocked — does not start with SELECT
WITH recent AS (
  SELECT * FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME}
  WHERE snapshot_date = (SELECT MAX(snapshot_date) ...)
)
SELECT COUNT(*) FROM recent WHERE {SOURCE_FIELD_NAME} IS NULL

-- ✅ Allowed — same logic as a subquery
SELECT COUNT(*) FROM (
  SELECT * FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME}
  WHERE snapshot_date = (SELECT MAX(snapshot_date) ...)
) WHERE {SOURCE_FIELD_NAME} IS NULL
```

---

## Checklist Before Submitting a Rule

Use this checklist to validate your rule before adding it to the seed CSV:

- [ ] **SQL starts with `SELECT`** — no leading comments, no CTE
- [ ] **Returns a single numeric count** (automated) or exactly four columns (manual)
- [ ] **Uses placeholders** for the CDE's database, table, and field — not hardcoded names
- [ ] **Does not contain semicolons** outside of string literals
- [ ] **Does not contain** `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `DROP`, `TRUNCATE`, `ALTER`, or `CREATE` as standalone words
- [ ] **Has an outer `WHERE` clause** if a snapshot filter is defined on the CDE (use `WHERE 1=1` if needed)
- [ ] **`$partitions` references** are written as `"{SOURCE_TABLE_NAME}$partitions"` (pre-quoted)
- [ ] **Other table references** (joins to lookup tables etc.) use literal names, not placeholders
- [ ] **Rule runs** by checking in the Athena console first

---

## Quick Reference — Example Rows

### `critical_data_element`

| critical_data_element_id | source_database_name | source_table_name | source_field_name | source_snapshot_filter |
|---|---|---|---|---|
| cde_001 | my_database | contacts | date_of_birth | `glueexporteddate = (SELECT MAX(glueexporteddate) FROM {source_database_name}.{source_table_name})` |
| cde_002 | my_database | manual_dq_uploads | _(null)_ | _(null)_ |

### `data_quality_rule`

| data_quality_rule_id | automated | sql_code |
|---|---|---|
| rule_001 | true | `SELECT COUNT(*) FROM {source_database_name}.{source_table_name} WHERE {source_field_name} IS NULL` |
| rule_002 | false | `SELECT failures_count, total_sample_count, measurement_timestamp, extraction_timestamp FROM {source_database_name}.{source_table_name}` |

### `data_quality_rule_allocation`

| allocation_id | critical_data_element_id | data_quality_rule_id | frequency |
|---|---|---|---|
| alloc_001 | cde_001 | rule_001 | daily |
| alloc_002 | cde_002 | rule_002 | ad-hoc |
