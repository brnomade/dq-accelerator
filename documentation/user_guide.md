# DQ Engine — User Guide

This guide covers how to run the DQ Engine, what it produces, and how to interpret its output.

For installation and configuration, see `documentation/installation_guide.md`.

---

## 1. What the Engine Does

The DQ Engine executes Data Steward-authored SQL rules against source data in Athena and records the results. For each active rule it:

1. Retrieves rule definitions and their source table identifiers from the metadata database.
2. Cleans, normalises, and safety-checks the rule SQL.
3. Executes the rule against the source data to obtain a count of failing records.
4. Executes (or generates) a denominator query to obtain the total record count.
5. Writes a measurement row to the output database.
6. Records an audit row for every rule, whether it executed successfully or was blocked.

Rules that fail the safety check or produce a runtime error are recorded in the audit table and skipped — they do not prevent the remaining rules from running.

---

## 2. Running the Engine

All invocations follow this pattern:

```bash
python scripts/dq_engine_runner.py --schedule SCHEDULE [--agency AGENCY ...] [--config PATH]
```

### 2.1 Arguments

| Argument | Required | Description |
|---|---|---|
| `--schedule` | Yes | One or more of: `hourly`, `daily`, `weekly`, `ad-hoc` |
| `--agency` | No | One or more agency acronyms (case-insensitive). Omit to run all agencies. |
| `--config` | No | Path to a deployment config file. Default: `config/dq_engine_config.yml` |

### 2.2 Schedule values

| Value | Rule type | Description |
|---|---|---|
| `hourly` | Automated | Rules flagged for hourly execution |
| `daily` | Automated | Rules flagged for daily execution |
| `weekly` | Automated | Rules flagged for weekly execution |
| `ad-hoc` | Manual | Processes manually uploaded metric files from uploader tables |

`ad-hoc` cannot be combined with other schedule values. Any other combination of `hourly`, `daily`, and `weekly` is valid and runs all matching rules in a single pass.

### 2.3 Examples

```bash
# Run all daily automated rules
python scripts/dq_engine_runner.py --schedule daily

# Run daily rules for two specific agencies
python scripts/dq_engine_runner.py --schedule daily --agency hmcts hmpps

# Run both hourly and daily rules together
python scripts/dq_engine_runner.py --schedule hourly daily

# Run all manual (ad-hoc) rules for one agency
python scripts/dq_engine_runner.py --schedule ad-hoc --agency mojd

# Use a non-default config (e.g. production deployment)
python scripts/dq_engine_runner.py --schedule daily \
    --config config/dq_engine_config_moj_prod.yml

# Run weekly rules for all agencies
python scripts/dq_engine_runner.py --schedule weekly \
    --config config/dq_engine_config_moj_prod.yml
```

### 2.4 Exit codes

| Code | Meaning |
|---|---|
| `0` | Run completed normally. Zero rules found is also code 0. |
| `1` | Config validation failed, unknown schedule, or output write error. Details are printed to stdout. |

---

## 3. What Gets Written

A successful run writes to three output tables in the output database configured in the config file. Table names are configurable; the defaults are shown.

### 3.1 `data_quality_poc__data_quality_measurement`

One row per rule execution result. Appended each run.

| Column | Type | Description |
|---|---|---|
| `data_quality_measurement_id` | VARCHAR | MD5 surrogate key: `md5(allocation_id \| run_timestamp \| measurement_timestamp)` |
| `data_quality_rule_allocation_id` | VARCHAR | Which rule allocation this row covers |
| `total_sample_count` | DOUBLE | Total records in scope (denominator) |
| `failures_count` | DOUBLE | Records that did not pass the rule (numerator) |
| `measurement_timestamp` | TIMESTAMP | Time of this measurement |
| `dbt_invocation_id` | VARCHAR | UUID of the run that produced this row |
| `dbt_run_timestamp` | TIMESTAMP | Timestamp at the start of the run |

### 3.2 `data_quality_poc__data_quality_run_control`

Rebuilt each run (DROP + CTAS in Athena). Holds the timestamp of the last successful run per allocation. Used by manual (ad-hoc) rule processing to determine which uploaded records are new.

| Column | Type | Description |
|---|---|---|
| `data_quality_rule_allocation_id` | VARCHAR | Rule allocation |
| `last_success_dbt_run_timestamp` | TIMESTAMP | Timestamp of the most recent successful run for this allocation |

### 3.3 `data_quality_poc__compiled_sql_audit`

One row per rule per run, recording the compiled SQL and whether the rule was blocked. Created automatically on first run if it does not exist.

| Column | Type | Description |
|---|---|---|
| `data_quality_rule_allocation_id` | VARCHAR | Which allocation this row covers |
| `compiled_sql` | VARCHAR | The post-substitution SQL that was submitted (or the raw `sql_code` if blocked before substitution) |
| `is_blocked` | BOOLEAN | `true` if the rule did not execute (blocked by validation or runtime error) |
| `blocked_reason` | VARCHAR | `null` for executed rules; the validation message or `runtime_error: …` for blocked rules |
| `rule_type` | VARCHAR | `'automated'` or `'manual'` |
| `dbt_invocation_id` | VARCHAR | UUID of the run |
| `dbt_run_timestamp` | TIMESTAMP | Timestamp at the start of the run |

---

## 4. How Rules Are Processed

### 4.1 Automated rules

Each rule's `sql_code` goes through the following steps:

1. **Unicode clean** — invisible characters, control codes, and non-standard spaces (BOM, NBSP, zero-width characters) are removed or replaced.
2. **Snapshot filter injection** — if the rule's CDE has a `source_snapshot_filter`, it is appended to the SQL as `AND {filter}` before normalisation. This allows rules to operate only on records within a defined time window.
3. **Normalise** — leading/trailing whitespace trimmed, trailing `;` stripped, newlines flattened.
4. **Placeholder substitution** — `{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, and `{SOURCE_FIELD_NAME}` (and their lowercase variants) are replaced with double-quoted identifiers from the CDE row.
5. **Safety check** — the resulting SQL is validated. If rejected, a blocked audit row is written and the rule is skipped.
6. **Execute** — the numerator SQL and denominator SQL are each executed as a single scalar COUNT.

The **denominator** is determined by:
- If the rule has a `sql_code_sample` value: that SQL is processed through steps 1/3/4/5 and executed.
- Otherwise: the engine generates `SELECT COUNT(*) FROM "database"."table"[ WHERE snapshot_filter]` automatically.

### 4.2 Manual (ad-hoc) rules

Manual rules read from uploader tables where Data Stewards have pre-loaded metric rows. The engine:

1. Applies the same pipeline (steps 1/3/4/5) to the rule SQL.
2. Appends a freshness filter based on `run_control`: only rows uploaded since the last successful run are retrieved. On the first run for an allocation, all rows are ingested.
3. Returns one measurement row per qualifying uploaded row (not a single aggregate).

### 4.3 Rule filtering

Rules are excluded from a run if:
- Their `retiring_timestamp` is set and in the past (applies to rule, allocation, and CDE).
- Their `frequency` does not match the requested `--schedule` value(s).
- Their agency does not match the `--agency` filter (when specified).

---

## 5. SQL Safety Validation

All Data Steward-authored SQL is validated before execution. The validator enforces:

- Single SELECT statement only (no stacked statements)
- Outermost projection must be a single COUNT, SUM, or APPROX_DISTINCT (or a MAX/MIN consumed by a comparison)
- No SELECT *, no multi-column projections
- No GROUP BY in the outermost SELECT
- No CROSS JOIN or implicit comma joins
- All JOINs must have explicit ON or USING conditions with column references
- No access to `information_schema`, `system`, or other metadata catalogs
- No UNION at the outermost level (UNION ALL inside a FROM-clause derived table is permitted)
- No recursive CTEs
- At most 5 tables directly joined in a single FROM/JOIN chain
- Partition filters present for any table registered as partitioned

If a rule's SQL is rejected, the compiled SQL and rejection reason are written to the audit table with `is_blocked = true`. The run continues with the next rule.

The engine-generated denominator (`SELECT COUNT(*) FROM ...`) is not passed through the validator because it is authored by the engine itself, not by a Data Steward.

---

## 6. Console Output

A typical run prints:

```
DQ Engine: 12 rule(s) found. run_id=a1b2c3d4-...
  Blocked: allocation alloc-007 — CROSS JOIN is not permitted
  Blocked: allocation alloc-011 — runtime_error: Table not found: mydb.missing_table
DQ Engine: processing complete — 10 result(s), 2 blocked/errored.
DQ Engine: run complete.
```

- **`run_id`** — a UUID4 generated at the start of this run. Use it to find all output rows from this run in the measurement and audit tables.
- **Blocked lines** — printed for each rule that did not produce a measurement. The reason is also recorded in the audit table.
- **Processing complete** — shows the total results written and the count of blocked/errored rules.

If no rules are found:

```
DQ Engine: no rules found for schedule=['daily'], agency=all. Nothing to do.
```

---

## 7. Error Handling

| Situation | What happens |
|---|---|
| Config file missing or invalid YAML | Exits immediately with a clear error message. No network calls made. |
| Environment variable referenced in config is not set | Exits immediately, listing every unresolved variable. |
| Unknown `--schedule` value | Exits immediately before any database calls. |
| `ad-hoc` combined with other schedules | Exits immediately. |
| Rule SQL blocked by validator | Audit row written (`is_blocked=true`); run continues with next rule. |
| Rule SQL causes a runtime error in Athena (table not found, permission denied, etc.) | Audit row written (`is_blocked=true`, `blocked_reason='runtime_error: ...'`); run continues with next rule. |
| Numerator or denominator returns empty result set | Treated as `0`; a warning is printed. |
| No rules found for the requested schedule/agency | Run exits cleanly. Nothing is written to any output table. |
| Measurement INSERT fails | Error printed; run_control refresh skipped; audit write is still attempted. Exits with code 1. |
| Audit table does not exist | Created automatically on first run. |

---

## 8. Scheduling

The engine is a standard CLI process with no built-in scheduler. Invoke it from whatever job runner is in use.

### GitHub Actions example

```yaml
- name: Run DQ Engine (daily)
  run: |
    python scripts/dq_engine_runner.py \
      --schedule daily \
      --config config/dq_engine_config_moj_prod.yml
  env:
    AWS_ACCESS_KEY_ID:     ${{ secrets.DQ_AWS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.DQ_AWS_SECRET }}
```

### Linux cron example

```cron
# Daily at 06:00 UTC
0 6 * * * cd /opt/dq-engine && python scripts/dq_engine_runner.py \
    --schedule daily \
    --config config/dq_engine_config_prod.yml \
    >> /var/log/dq-engine-daily.log 2>&1
```

---

## 9. Multi-Instance Deployments

The same codebase supports multiple parallel deployments. Each instance selects its own config file at runtime:

```bash
# MOJ production
python scripts/dq_engine_runner.py --schedule daily \
    --config config/dq_engine_config_moj_prod.yml

# MOJ development
python scripts/dq_engine_runner.py --schedule daily \
    --config config/dq_engine_config_moj_dev.yml

# Client B production
python scripts/dq_engine_runner.py --schedule daily \
    --config config/dq_engine_config_clientb_prod.yml
```

Each config file carries its own database names, workgroup, and S3 locations. The S3 locations **must be unique** per instance; sharing an S3 prefix between two instances corrupts the Parquet output.

---

## 10. Relationship to the dbt Engine

The Python engine is a drop-in replacement for the dbt-based DQ Rules Engine. It reads from and writes to the same metadata and output tables with the same column names. Downstream queries and dashboards that read from `data_quality_poc__data_quality_measurement` or `data_quality_poc__data_quality_run_control` do not require any changes.

The column `dbt_invocation_id` and `dbt_run_timestamp` retain their original names for compatibility. In the Python engine, `dbt_invocation_id` is a UUID4 (rather than a dbt invocation ID), and `dbt_run_timestamp` is the UTC timestamp at the start of the Python run.

---

## 11. Known Limitations

See `KNOWN_ISSUES.md` for the full list. Key points relevant to day-to-day operation:

- **Partial INSERT on retry**: if a run crashes mid-INSERT, partial rows may be written. Retry produces the same surrogate key hashes, enabling deduplication downstream. Deduplicate on `data_quality_measurement_id` when aggregating.
- **run_control briefly unavailable**: there is a short window during which `run_control` does not exist while it is being rebuilt (DROP + CTAS). This matches dbt's table materialisation behaviour and has no impact on within-run execution.
- **Sequential execution**: rules run one at a time. Large rule sets take proportionally longer.
- **Semicolons in string literals**: a rule whose SQL contains a semicolon inside a string literal (e.g. `WHERE note = 'call at 3;30pm'`) will be rejected by the validator. Rewrite the literal to avoid the semicolon.
- **UNION ALL in CTEs**: UNION ALL is only permitted inside a FROM-clause derived table subquery. The equivalent CTE form is blocked.
