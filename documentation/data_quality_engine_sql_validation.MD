# Data Quality Rule SQL Validator

**Status:** production, actively hardened against real-world usage

**Primary file:** `check_sql_validator.py` (single-file, drop-in importable module)

**Entry point:** `check_sql(sql: str, dialect: str = "trino") -> tuple[bool, list[str]]`

This document is the reference for anyone who needs to understand, extend,
or audit this validator — engineers picking up the code, and security
reviewers assessing what it does and does not guarantee. Read this before
touching `check_sql_validator.py`.

---

## 1. What this project is

Data Stewards author SQL rules in plain text. Each rule is executed
against Athena (Trino engine v3)-backed datasets, and is expected to
return exactly one thing: **a single number — the count of records that
fail the rule.** That number gets stored and tracked over time as a data
quality metric.

The problem: a Data Steward's rule is arbitrary, human-authored SQL. Before
it's allowed to run, something has to confirm two things:

1. **Shape** — does this query actually produce a single number, or could
   it return raw rows, arbitrary columns, or something else entirely?
2. **Safety** — could this query, even if shaped correctly, be used to pull
   data it shouldn't, or to run in a way that's needlessly expensive or
   unbounded?

`check_sql_validator.py` is that gate. It parses the submitted SQL with
[sqlglot](https://github.com/tobymao/sqlglot), inspects the resulting AST
against a fixed set of structural rules, and returns `(True, [])` if the
query is safe to run, or `(False, [reason])` if it isn't.

**This is one layer of a multi-layer system, not the only line of
defense.** See [§4](#4-what-this-validator-deliberately-does-not-do) —
understanding what's *intentionally* out of scope here is as important as
understanding what's in scope.

---

## 2. How the code is structured

The whole module is one file, organized top to bottom as a pipeline:

```
Configuration constants
        │
ValidationResult (internal return-value helper)
        │
Individual check functions, one per concern
        │
check_sql()  ── the entry point, just wires the above in sequence
        │
Self-test suite ── runs only when the file is executed directly
```

### 2.1 The pipeline, in the order it actually runs

```python
def check_sql(sql: str, dialect: str = "trino") -> tuple[bool, list[str]]:
    1. _reject_stacked_statements(sql)        # text-level guard, pre-parse
    2. _reject_recursive_cte_keyword(sql)      # text-level guard, pre-parse
    3. _parse_single_statement(sql, dialect)   # sqlglot parse, lenient
    4. _unwrap_to_outermost_select(statement)  # find the SELECT that matters
    5. _STRUCTURAL_CHECKS (in order):
         _check_no_blocked_catalogs_or_schemas
         _check_join_shape
         _check_partition_filters_present
         _check_outermost_projection_is_count
    6. _check_strict_dialect_compliance(sql, dialect)  # final syntax gate
```

Every check function returns `None` (pass) or a `ValidationResult(safe=False,
messages=[...])` (reject, with a human-readable reason). `check_sql` just
walks this list and returns on the first rejection, or `(True, [])` if
everything passes.

**Why this shape:** a reviewer should be able to read `check_sql` top to
bottom and see every gate the SQL has to pass, without needing to
understand any function's internals to see *that* the gate exists. The
internals are where the risk-specific reasoning lives (see §3).

### 2.2 Key data structures

- **`ValidationResult`** — a small dataclass (`safe: bool`, `messages:
  list[str]`) so every check has one consistent return shape.
- **Configuration constants** at the top of the file, meant to be tuned
  per deployment without touching logic:
  - `APPROVED_COUNT_FUNCTIONS` — aggregate functions whose result is safe
    to expose directly (`COUNT`, `SUM`, `APPROX_DISTINCT`).
  - `VALUE_AGGREGATE_FUNCTIONS` — aggregates that return an actual raw
    data value (`MAX`, `MIN`), safe only when consumed by further
    computation, never exposed bare.
  - `BLOCKED_SCHEMAS` / `BLOCKED_CATALOGS` — metadata pseudo-catalogs
    (`information_schema`, `system`) denied regardless of what the
    external database allow-list covers.
  - `MAX_JOINED_TABLES` — cap on tables joined together in a single
    FROM/JOIN chain.
  - `PARTITIONED_TABLES` — a map you populate from your Glue catalog:
    `{"schema.table": ("partition_col", ...)}`. Ships empty; a table not
    listed here gets no partition-filter enforcement at all.

### 2.3 Running it

```python
from check_sql_validator import check_sql

safe, messages = check_sql(sql, dialect="trino")
if not safe:
    raise ValueError(f"rule rejected: {messages[0]}")
```

```bash
# Run the self-test suite (allowed patterns + every known attack/edge case):
python check_sql_validator.py
```

The self-test suite is not optional reading — it's the fastest way to see
concretely what this validator accepts and rejects, and it's the harness
that has actually caught real bugs (see §6).

---

## 3. The checks, and why each one is considered critical

The starting requirement drives everything: **the outermost query must
resolve to exactly one number, derived only from aggregates, with no path
for a raw row-level value to escape.** Every check exists to close one
specific way that requirement could be violated.

| Check | Risk it closes | Why this one made the cut |
|---|---|---|
| `_reject_stacked_statements` | Multiple/stacked statement injection (`SELECT ...; DROP TABLE ...`) | The most basic SQL-injection primitive. sqlglot can silently drop everything after the first statement rather than raising, so a post-parse statement count isn't sufficient on its own — this is a pre-parse text guard specifically because of that gap. |
| `_reject_recursive_cte_keyword` | `WITH RECURSIVE` — unbounded recursion, a direct cost/DoS risk on a bytes-scanned-billed engine | Originally enforced only via the AST's recursive flag; **real-environment testing found that flag unreliable against the pinned sqlglot version** (see §6). This text-level backstop was added because the AST check alone was empirically proven insufficient. |
| `_unwrap_to_outermost_select` | Non-`SELECT` statements (DDL/DML), `UNION` at the top level | Rules must be read-only and resolve to a single `SELECT`. Also handles non-recursive `WITH` (CTEs), which Data Stewards use routinely and which is safe as long as the *final* SELECT still meets the shape requirement. |
| `_check_no_blocked_catalogs_or_schemas` | `information_schema`/`system.*` reconnaissance | Defense-in-depth. The primary database access boundary is an **external mechanism outside this engine** (AWS Lake Formation fine-grained grants) — but that boundary may not cover Athena's pseudo-catalogs, which aren't "databases" in the Glue sense. Cheap to check, doesn't depend on knowing the legitimate database list. |
| `_check_no_union_anywhere` | `UNION`/`UNION ALL` in CTE bodies, scalar subqueries, IN/EXISTS, and any position other than a directly-wrapping FROM/JOIN derived-table subquery | `_unwrap_to_outermost_select` only rejects a UNION that is the top-level statement node. When UNION appears inside a CTE body (`WITH combined AS (SELECT ... UNION ALL SELECT ...)`), the outer `SELECT COUNT(*) FROM cte` passes every check while the inner UNION executes undetected. This check uses `statement.find_all(exp.Union)` to walk the full tree and reject any Union node that is not the direct body of a FROM/JOIN derived-table subquery. **Exception (added 2026-09-17):** UNION ALL is permitted when `Union.parent = Subquery` and `Subquery.parent = From` or `Join` (i.e., an inline derived table). This is safe because (a) the outer `COUNT(*)` is independently enforced by `_check_outermost_projection_is_count`, (b) all `find_all`-based structural checks already traverse into the UNION branches, and (c) no raw values can escape. CTE-body UNION remains blocked. AST parent-chain verified against sqlglot 30.8.0. Note: `INTERSECT` and `EXCEPT` (`exp.Intersect`, `exp.Except`) are structurally similar and not yet covered; add them here if they appear in future attack cases. |
| `_check_join_shape` | `CROSS JOIN`, comma-joins, unbounded join fan-out | On a bytes-scanned-billed engine, an uncontrolled cartesian product is a direct billing/DoS risk, not just a performance concern. The cap is applied **per SELECT scope**, not globally — a table referenced multiple times in independent, unrelated scalar filters is not the same risk as an actual N-way join (this distinction was learned the hard way; see §6). |
| `_check_partition_filters_present` | Unfiltered full-table scans on known-partitioned tables | The single most common real-world Athena cost incident is not malicious — it's an innocent rule that forgot a partition filter and scanned an entire table. This is a heuristic (name-matching, not full semantic binding), explicitly not a guarantee — see §5. |
| `_check_outermost_projection_is_count` | Direct data exfiltration via `SELECT *`, raw columns, `GROUP BY` keys surviving to the result, a bare `MAX`/`MIN` exposing an actual data value, or arithmetic/encoding operations that disguise a `MAX`/`MIN` result without reducing it to a non-recoverable form | This is the core control. It does **not** just check "is the top node a `COUNT` call" — it recursively verifies that (a) an approved aggregate is present, (b) every raw column reference anywhere in the expression is nested inside one of those aggregates' arguments, (c) any embedded scalar subquery is independently validated by these same rules, and (d) every `MAX`/`MIN` call anywhere in the projection has a comparison operator on its ancestor path — the only operation that provably collapses a raw value to a non-recoverable binary result. This last rule (`_value_aggregate_has_comparison_ancestor`) closes the arithmetic-masking bypass (`COUNT(*) * 0 + MAX(...)`) and all re-encoding variants (`TO_HEX(MAX(...))`, `LOWER(MAX(...))`, `ABS(MAX(...))` without a comparison, etc.). |
| `_check_strict_dialect_compliance` | Dialect/syntax edge cases the lenient parse pass let through | Re-parses in strict mode; anything that only the lenient `WARN`-level parse accepted is now a **rejection**, not just an advisory message. The original code this replaced collected these as warnings and never acted on them — always returning `safe=True` regardless. That gap is closed here. |

### 3.1 Why the projection check is the most heavily engineered piece

`_check_outermost_projection_is_count` (and its helpers
`_contains_known_aggregate`, `_all_columns_inside_known_aggregates_or_subqueries`,
`_is_bare_value_aggregate`, `_validate_nested_subqueries`,
`_iter_value_aggregates_stopping_at_selects`,
`_value_aggregate_has_comparison_ancestor`) is where nearly every real bug has
surfaced (see §6), because it's the one place doing recursive, structural reasoning
over an arbitrary expression tree rather than simple pattern-matching. If you're
extending this validator, this is where to be most careful, and where a new failure
is most likely.

---

## 4. What this validator deliberately does not do

These are not gaps someone forgot — they are **explicit, documented
decisions** made during security review, each with a stated reason and,
where relevant, a compensating control that lives *outside* this code.

- **Which databases/tables/schemas are reachable at all.** Enforced by an
  access-control mechanism outside this engine (AWS Lake Formation
  fine-grained grants), before rules ever reach this validator. This
  validator's `information_schema`/`system.*` deny-list is a narrow,
  cheap defense-in-depth addition on top of that — not a replacement for
  it.

- **Inferential ("blind boolean") data leakage.** A `WHERE` predicate like
  `WHERE ssn LIKE '123-45-%'` can leak data one bit at a time by watching
  how the returned count changes — even though the query's *output
  shape* is a perfectly legitimate single count. Restricting output shape
  (this validator's whole job) closes **direct** exfiltration; it does
  **not** close inference-based leakage. This residual risk is accepted
  and should be mitigated by rule review / usage monitoring, not by AST
  inspection — no static analysis of the submitted text can distinguish
  a legitimate filter from an inferential probe.

- **View-hopping.** If a rule reads from a view, this validator cannot see
  what tables that view itself reads from. That requires a catalog-level
  control (e.g. validating what a view actually resolves to), not a
  SQL-shape control on the submitted rule text.

- **Cost/DoS enforcement beyond the two coarse heuristics here** (join
  count, partition-filter presence). The authoritative backstop is an
  **Athena workgroup `BytesScannedCutoffPerQuery` limit**, enforced by
  the query engine itself regardless of what this validator concludes.
  `_check_partition_filters_present` targets only the single most common
  real-world incident; it is a heuristic, not a guarantee (see §5).

**The general principle:** this validator is layer one of (at least)
three. Layer two is the database access-control mechanism (Lake
Formation). Layer three is the engine-level cost backstop (Athena
workgroup limits). Treat this code as a fast, cheap, good-UX first filter
— not the security boundary. If you're a reviewer evaluating overall
system security, the other two layers matter as much as this file does.

---

## 5. Known limitations and heuristic boundaries

Documented explicitly so nobody mistakes a heuristic for a guarantee:

- **`_check_partition_filters_present` matches partition columns by name**,
  without full semantic binding (sqlglot has no catalog to resolve against).
  Two joined tables that both happen to have a same-named column could
  produce a false negative. A table not listed in `PARTITIONED_TABLES`
  gets zero coverage from this check, regardless of whether it's actually
  partitioned — **keeping that config in sync with the Glue catalog is a
  manual operational responsibility, not something this code can verify.**

- **`VALUE_AGGREGATE_FUNCTIONS` (`MAX`/`MIN`) exposure risk is substantially
  closed.** The `_value_aggregate_has_comparison_ancestor` check (added in BL-03)
  requires every `MAX`/`MIN` call in the outermost projection to have a comparison
  operator on its ancestor path. This closes the bare exposure case, the arithmetic
  masking bypass (`COUNT(*) * 0 + MAX(...)`), re-encoding attacks
  (`TO_HEX(MAX(...))`, `LOWER(MAX(...))`), and the `CASE WHEN TRUE THEN
  MAX(sensitive_col) ELSE NULL END` pattern that was previously accepted as a
  residual risk. No concrete remaining attack pattern has been identified, but treat
  any rule applying `MAX`/`MIN` to a genuinely sensitive column as warranting human
  review given the theoretical possibility of exotic constructs or future sqlglot AST
  changes.

- **`_reject_stacked_statements`' semicolon check is a raw substring
  match**, not tokenizer-aware. It will also reject a legitimate semicolon
  inside a string literal or comment (e.g. `WHERE notes = 'call at
  3;30pm'`). This is an accepted, deliberate trade-off: fail-closed
  (reject a legitimate query) is preferred over any risk of a stacked
  statement slipping through.

- **`_check_join_shape`'s table cap has a known, accepted gap**: a query
  joining many *subqueries* together at one level (each wrapping just one
  table) counts zero direct tables at that level, since the cap only
  counts raw table references. This is intentional, not an oversight —
  pre-aggregating in a subquery before joining is a standard,
  cost-*reducing* pattern, and penalizing it would discourage exactly the
  query shape Data Stewards should be writing.

- **This validator does not verify against a live catalog.** It has no
  concept of whether a referenced table actually exists, what columns it
  has, or what a view resolves to. All reasoning is purely syntactic
  (AST-shape), which is precisely why the layers described in §4 exist
  alongside it.

- **UNION ALL in CTE bodies remains blocked.** Data Stewards who need to
  combine two result sets before counting must use an inline derived table
  (`SELECT COUNT(*) FROM (... UNION ALL ...) WHERE ...`) rather than a named
  CTE. The FROM-derived-table form is permitted because all structural checks
  traverse into it via `find_all`; the CTE-body form was the original TEST-09
  security gap and its ban is retained as a conservative control.

---

## 6. Verification history — real bugs this design has already hit

This section exists because the pattern has repeated enough times to be
worth calling out explicitly: **AST reasoning written without executing
against the actual pinned sqlglot version has repeatedly missed things
that only surfaced against real production SQL.** If you're extending
this file, budget for the same thing happening to your change, and treat
every rejection a Data Steward reports as a potential design gap, not
just a query to special-case.

Confirmed issues found and fixed, in the order they surfaced:

1. **`SELECT CASE ...` rejected outright.** The original projection check
   required the outermost node to be *directly* a `COUNT`/`SUM` call.
   Legitimate rules using `CASE WHEN COUNT(*) > 100 THEN COUNT(*) ELSE 0
   END` were rejected. Fixed by making the check recursive: an aggregate
   must be *present*, and every raw column must be *nested inside* one —
   not "the whole expression must be one bare call."

2. **`MAX`/`MIN`-based freshness checks rejected.** A common staleness-check
   pattern (`CASE WHEN date_diff(..., MAX(date_col), ...) > 1 THEN 1 ELSE
   0 END`) used `MAX`, which wasn't on the approved list at all. Simply
   adding `MAX`/`MIN` to the same approved list as `COUNT`/`SUM` would have
   reopened direct exfiltration (`SELECT MAX(salary) FROM payroll`), since
   `MAX`/`MIN` return actual data values, not magnitudes. Fixed by
   introducing a second category (`VALUE_AGGREGATE_FUNCTIONS`) with
   different rules: safe when nested inside further computation, never
   safe bare.

3. **Legitimate multi-table queries rejected on join count.** A query
   joining a handful of pre-aggregated subqueries, plus the same base
   table referenced independently in several unrelated scalar "latest
   snapshot" filters (`WHERE x = (SELECT MAX(x) FROM t)`, used more than
   once), was rejected as "6 tables, max 5" — because the original check
   counted every table reference *anywhere in the whole statement*,
   conflating actual N-way joins with unrelated independent scalar
   subqueries. Fixed by scoping the count to tables joined together
   within a single SELECT's own FROM/JOIN chain.

4. **Arithmetic combining independent scalar `COUNT` subqueries rejected.**
   `(SELECT COUNT(*) FROM a WHERE ...) + (SELECT COUNT(*) FROM b WHERE
   ...)` was rejected because the raw-column scan recursed into each
   subquery's own `WHERE` clause and flagged its filter columns as
   "leaked," even though those columns never leave the subquery's own
   execution. Fixed by making the column scan stop at any nested `SELECT`
   boundary, and separately, recursively validating each embedded
   subquery's own shape as an independent unit before trusting it. This
   fix also closed a related gap found while designing it: a bare
   `SELECT (SELECT MAX(salary) FROM payroll)` had been slipping past the
   bare-value-aggregate check, since that check only looked at the
   outermost node directly, not through a trivial subquery wrapper.

5. **Real-environment self-test run surfaced two version-specific gaps**
   that no amount of reasoning from documentation would have caught:
   - `With.args["recursive"]` was not reliably set for `WITH RECURSIVE`
     against the actual pinned sqlglot version — a recursive CTE parsed
     cleanly and passed every check. Fixed with a text-level regex
     backstop, independent of the AST.
   - Direct-table detection used a strict `isinstance(node, exp.Table)`
     check on `from_clause.this`/`join.this`, which matched nothing in
     that sqlglot version — silently disabling *both* the join-count cap
     and the partition-filter check at once (same root cause, two
     symptoms). Fixed with a bounded recursive search that only refuses
     to cross a nested `SELECT`, rather than assuming a specific AST shape.

6. **UNION inside a CTE body passed the UNION check.** `_unwrap_to_outermost_select`
   rejects a UNION only when it is the *top-level* parsed statement node. When a
   UNION appeared inside a CTE body (`WITH combined AS (SELECT ... UNION ALL SELECT
   ...)`), the top-level node was `With(this=Select(...))` — the outer
   `SELECT COUNT(*) FROM combined` passed every check while the inner UNION executed
   undetected. Fixed by adding `_check_no_union_anywhere` to `_STRUCTURAL_CHECKS`,
   which uses `statement.find_all(exp.Union)` to walk the entire AST and reject any
   UNION node regardless of nesting depth. A corresponding test case was added to
   both the functional and attack suites.

7. **Arithmetic masking of a `MAX` value bypassed the bare-exposure check.** The
   expression `COUNT(*) * 0 + MAX(CAST(SUBSTR(CAST(account_id AS VARCHAR), 1, 4) AS
   BIGINT))` passed all checks because `_is_bare_value_aggregate` only fires when
   `MAX`/`MIN` is the *top-level node* of the projection. The top-level node here was
   `Add`, so the check did not trigger. The root cause was that no rule governed *how*
   a `MAX`/`MIN` result was consumed once produced — arithmetic operators are not
   value-reducing (the original value is trivially recoverable), but neither are
   encoding or transformation functions (`TO_HEX`, `ABS`, `date_diff` alone, etc.).

   Fixed by adding `_iter_value_aggregates_stopping_at_selects` and
   `_value_aggregate_has_comparison_ancestor`, which together require every
   `MAX`/`MIN` call in the outermost projection to have a comparison operator on its
   ancestor path. A comparison is the only operation that provably collapses a raw
   value to a non-recoverable binary result. This also closed the previously accepted
   `CASE WHEN TRUE THEN MAX(sensitive_col) ELSE NULL END` residual risk (KI-02), since
   that pattern likewise has no comparison on the ancestor path of the THEN-branch
   `MAX`. Five new test cases added to the functional suite; TEST-08 in the adversarial
   suite now correctly blocked. Open gap count reduced to zero.

8. **UNION ALL in FROM-derived table rejected alongside the CTE body case.** Two real
   Data Steward rules (allocation IDs 236 and 377, 2026-09-17) were rejected by
   `_check_no_union_anywhere`. Both used the pattern:
   `SELECT COUNT(*) FROM (SELECT ... UNION ALL SELECT ...) WHERE ...`
   — UNION ALL inside a derived table in a FROM clause, not inside a CTE body.

   Root cause: the fix for TEST-09 (UNION in CTE body) used `statement.find_all(exp.Union)`
   and rejected every Union node unconditionally. That was the correct fail-closed
   choice at the time, but it also blocked the structurally different derived-table case.

   The difference: in a CTE body, `Union.parent = CTE`; in a FROM-derived table,
   `Union.parent = Subquery` and `Subquery.parent = From`. All structural checks
   (`_check_no_blocked_catalogs_or_schemas`, `_check_join_shape`,
   `_check_partition_filters_present`) already traverse into UNION branches via
   `find_all(exp.Select)` and `find_all(exp.Table)`. The outer `COUNT(*)` is
   independently enforced by `_check_outermost_projection_is_count`. No concrete
   attack path exists that UNION in a FROM-derived table enables that isn't blocked
   by other checks.

   Fixed by adding `_is_union_in_from_derived_table` and updating
   `_check_no_union_anywhere` to permit Union nodes only when
   `Union.parent = Subquery` and `Subquery.parent = From/Join`. CTE-body UNION
   remains blocked. Parent chain verified against sqlglot 30.8.0 before the logic
   was written. Three new cases added to the functional suite (TC-A allowed,
   TC-B allowed, TC-C blocked-catalog branch still rejected); two new cases
   added to the attack suite (TEST-09b: CTE body still blocked; TEST-09c:
   non-COUNT outer still blocked). Original TEST-09 case still present and blocking.

**The lesson embedded in this history:** every fix above followed the same
pattern — a real, legitimate query was rejected, the root cause turned out
to be broader than the one failing case, and the fix was designed to close
the *general* gap, with a new test case added to prevent regression. Continue
that pattern. Don't patch a single failing query string; find and fix the
underlying rule.

---

## 7. Extending this validator

- **New check function:** write it with the same signature as the
  existing ones — `(statement: exp.Expression, outer_select: exp.Select)
  -> Optional[ValidationResult]` for structural checks, or `(sql: str) ->
  Optional[ValidationResult]` for text-level pre-parse guards. Add it to
  `_STRUCTURAL_CHECKS` (or call it explicitly in `check_sql` if it's a
  pre-parse guard). Update the check-to-risk mapping table in the module
  docstring and in §3 of this document.

- **Before trusting any change:** run `python check_sql_validator.py`.
  Add new cases to `_SELF_TEST_CASES` for both the pattern you're fixing
  *and* the attack/edge case your fix must not reopen — every historical
  fix in §6 added both.

- **If a real rejection comes in:** don't just add a special case for the
  exact query. Ask what the *general* rule should have been, the way each
  entry in §6 did. The self-test suite exists specifically to make that
  discipline cheap.

- **Configuration that needs periodic upkeep, not code changes:**
  `PARTITIONED_TABLES` should be kept in sync with the Glue catalog as
  tables are added or their partition schemes change. This is an
  operational responsibility, not something the code can self-verify.

---

## 8. Quick reference for security reviewers

If you're auditing this module and have limited time, read in this order:

1. §3's table — confirms every check maps to a stated risk.
2. §4 — confirms what's explicitly out of scope, and where the
   compensating control actually lives (this is where you should verify
   the *other* layers — Lake Formation grants, Athena workgroup cutoff —
   are actually configured, since this file's safety assumes they are).
3. §5 — the honest limitations list; nothing here should surprise you if
   you've read it.
4. §6 — evidence of how this module responds to real-world failure: does
   it patch narrowly, or fix the general case? Judge the codebase's
   trustworthiness by that pattern holding up over time, not by assuming
   the current state is complete.
5. The self-test suite itself (`_SELF_TEST_CASES` in
   `check_sql_validator.py`) — the concrete, executable specification of
   what this validator accepts and rejects.