# Design: Table & Field Profiling — Unified Screen

**Status:** Proposed — pending review  
**Files affected:** `src/200_screen_ddl.js`, `src/201_ddl_form_panel.js`, `src/10_constants.js`  
**Supersedes:** `DESIGN_TABLE_PROFILING_COVERAGE.md` (now safe to delete)

---

## Design evolution

Two earlier documents informed this combined design:

- **Coverage design** — proposed adding a quality dimension coverage grid to the DDL library, with collapsible table rows and an Overall / By CDS toggle.
- **Unified design** — shifted the page's primary purpose to a demand-driven profiling agenda: profile only what CDEs and rule SQL require, not everything.

This document merges both into a **single unified view** with no mode toggling. Profiling status and dimension coverage are both visible in every field row simultaneously. DDL management actions (add, edit, retire) are embedded directly in the table group header rows — following the same inline-action pattern as the Data and Stewardship page.

---

## 1. Purpose

> Profile only what is needed to support CDEs and their rules — not everything.

The current Table Profiling and Field Profiling screens are generic: they show all stored DDL tables and let the user select any field. This implicitly encourages profiling everything.

The redesigned screen inverts the entry point. It asks: of the tables and fields that the data model actually uses — in CDEs and in rule SQL — which ones are not yet profiled? That list is the agenda. The coverage view then answers: of the fields that are profiled and in use, how well are they covered across quality dimensions?

---

## 2. What "Needed" Means — Two Sources of Demand

The profiling agenda is built from two sources.

### Source 1 — CDE fields

Any live `critical_data_element` with `source_database_name` + `source_table_name` + `source_field_name` populated. The field is a candidate for profiling regardless of whether a rule is allocated.

The number of live rule allocations for that field is an **attribute** of the field row — not a separate source. It drives visual priority in the agenda (fields with active rules are highlighted) but the field enters the agenda the same way either way.

### Source 2 — Fields and tables extracted from rule SQL

Rule SQL bodies may reference tables and fields beyond the CDE's own coordinates. The three substitution placeholders (`{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, `{SOURCE_FIELD_NAME}`) are already captured by Source 1. Everything else in the SQL body is a hardcoded reference that should also be profiled.

All live `data_quality_rule` records are parsed — not just allocated ones — because any rule in the library is a candidate for future allocation.

**Flagged as SQL-origin in the agenda.**

#### SQL parsing approach

Operates on raw `sql_code` and `sql_code_sample`. Placeholder tokens are stripped first.

**Step 1 — Extract table references** from `FROM` and `JOIN` clauses:

```
Pattern:  (?:FROM|JOIN)\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)
Examples:
  FROM hmpps_db.offender_table   →  database=hmpps_db,  table=offender_table
  JOIN reference_lookup           →  database=unknown,   table=reference_lookup
  JOIN hmpps_db.ref_codes r       →  database=hmpps_db,  table=ref_codes  (alias r noted)
```

**Step 2 — Extract field references** using qualified `table_or_alias.field_name` patterns:

```
Pattern:  \b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b
Examples:
  o.customer_id   →  resolves alias o → offender_table,  field=customer_id
  ref_codes.code  →  table=ref_codes, field=code
```

Standalone field names without a table qualifier are ignored — too ambiguous to resolve reliably.

#### SQL parsing limitations

| Limitation | Effect |
|---|---|
| Unqualified table references (no `db.` prefix) | Database name unknown; only table name captured |
| Alias resolution | Works for same-statement aliases; CTEs and deep subqueries may fail |
| String literals | Field names inside quoted strings may produce false positives |
| Dynamic SQL | Runtime-constructed SQL is not detectable |

SQL-extracted entries are **labelled as heuristic** in the UI and can be individually dismissed. Dismissals are stored in `localStorage` per session.

SQL-extracted references are computed at render time — not persisted. No new table is needed.

---

## 3. Agency Scope Toggle

The agenda and coverage view are both scoped by the signed-in steward's agency by default. This mirrors the **My data sets** toggle on the Data and Stewardship page.

| State | What is shown |
|---|---|
| **My data** (default) | CDE fields belonging to CDSs in the steward's agency. SQL-extracted fields from rules allocated to those CDEs only. |
| **All data** | All CDE fields across all agencies. All SQL-extracted fields from all live rules. |

If no steward identity is set (master mode), defaults to **All data** and the **My data** option is greyed out with a tooltip: *"Set your steward identity in Settings to filter by agency."*

Toggle persists in `localStorage` as `moj_dq_profiling_scope_v1`.

---

## 4. Page Layout

```
┌─ Page header ──────────────────────────────────────────────────────────────┐
│  ▌ Data Profiling                                                           │
│    8 tables · 24 fields in scope                                            │
├─ Stat blobs (four cards, equal width) ─────────────────────────────────────┤
│  TABLE PROFILING (?)  │ FIELD PROFILING (?)  │ FIELD COVERAGE (?) │ BLIND RULES (?) │
│  5 profiled 3 pending │ 12 profiled 8 pending│ 4 no rules         │ 6 prof. 2 blind │
│                       │                      │ 6 partial          │                 │
│                       │                      │ 2 full             │                 │
├─ Filter row ───────────────────────────────────────────────────────────────┤
│  [ Search table or field... ]   [ My data ]   Status: [ All v ]            │
└────────────────────────────────────────────────────────────────────────────┘

[ Table groups — collapsible ]

[ Profiling panel — slide-in, triggered from field rows ]
```

There is no mode toggle and no separate scope bar. The **My data** toggle sits in the filter row below the stat blobs. The Status dropdown filters by profiling/coverage state. There is no Manage DDLs button — DDL add/edit/retire actions are embedded directly in the table group rows (see Section 5.2).

Each stat blob carries a `?` tooltip icon that explains its computation (see Section 4.1).

### 4.1 Stat blob counter definitions

#### TABLE PROFILING
| Counter | Definition |
|---|---|
| **Profiled** | Tables that have at least one live `source_table_ddl` record (DDL has been added). |
| **Pending** | Tables referenced by CDEs or SQL-extracted fields but with no DDL record yet. |

#### FIELD PROFILING
| Counter | Definition |
|---|---|
| **Profiled** | Fields (across all table groups, with or without DDL) that have a live `field_profiling` record. |
| **Pending** | Fields in scope that have no `field_profiling` record. |
| **TBC** | Shown in place of both counters when no table has a DDL record yet. |

Note: a field can be profiled even if its table has no DDL. The profiling record captures semantic type, raw query results, and notes independently of the physical schema.

#### FIELD COVERAGE
| Counter | Definition |
|---|---|
| **No rules** | Fields with zero rule allocations across any quality dimension. |
| **Partial** | Fields where at least one but not all active quality dimensions have a rule allocated. |
| **Full** | Fields where every active quality dimension has at least one rule allocated. |

Coverage is based purely on rule allocation across quality dimensions. DDL presence and profiling status have no effect on coverage counters.

#### BLIND RULES
| Counter | Definition |
|---|---|
| **Profiled** | Live rules with at least one allocated CDE whose source field has a `field_profiling` record. |
| **Not profiled** | Live rules that have allocations but none of their allocated CDEs map to a profiled field — these rules are executing without profiling context. |

Rules with no allocations are excluded from both counters.

---

## 5. Profiling Agenda — Primary View

### 5.1 How the agenda is assembled

```
1. Collect CDE fields  (Source 1)
   → all live CDEs with db + table + field populated
   → filter by steward's agency if "My data" is active
   → for each field, count live rule allocations (drives visual priority, not membership)

2. Collect SQL-extracted fields  (Source 2)
   → parse sql_code from all live data_quality_rule records
   → extract (db|null, table, field|null) tuples
   → if "My data": restrict to rules allocated to in-scope CDEs
   → tag each as SQL

3. Merge into a unified field list
   → key: db + table + field
   → de-duplicate; tag with all origins: CDE | SQL | CDE+SQL
   → unqualified SQL refs (no db): grouped under "database unknown"

4. Group by db + table → collapsible table groups

5. Per field:
   → DDL status:       does source_table_ddl exist for db+table?
   → Physical type:    from parsed_columns if DDL exists
   → Profiling status: does field_profiling exist for db+table+field?
   → Rule count:       live allocations for any CDE on this field
```

### 5.2 Table group — collapsed

The header shows both profiling completeness and dimension coverage in a single line. The mini bar represents dimension coverage (green ≥80%, amber ≥40%, red <40%).

Inline DDL actions appear on the right of every table group header, matching the icon-button pattern used on the Data and Stewardship page:

- **Rows with a stored DDL:** pencil icon (edit DDL) + eye-off icon (retire DDL)
- **Rows without a DDL:** `+ Add DDL` text button

**With DDL, some fields pending:**
```
▶  offender_table  (hmpps_db)
   5 fields  ·  3/5 profiled  ·  ▓▓▓▓░░░░░░  40%              ✎  👁‍🗨
```

**With DDL, all profiled and fully covered:**
```
▶  ref_codes  (hmpps_db)
   4 fields  ·  4/4 profiled  ·  ▓▓▓▓▓▓▓▓▓▓  100%   ✓          ✎  👁‍🗨
```

**No DDL stored:**
```
▶  unknown_table  (hmpps_db)
   2 fields  ·  DDL ⚠ missing                                  [ + Add DDL ]
```

- Pencil (✎) — opens the `DDLFormPanel` pre-populated with the stored DDL, ready to edit.
- Eye-off — marks the DDL as retired (same retire/restore toggle as other tables). A retired DDL row is shown muted; the table group remains visible if there are still CDE or SQL-extracted fields referencing it.
- `+ Add DDL` — opens the `DDLFormPanel` pre-filled with the known database and table name.

These actions are only shown to users with write permission (non-read-only mode). In master / isMaster mode all actions are available; in limited steward mode, only DDLs owned by the steward's agency are editable.

### 5.3 Field rows — expanded

Profiling status and dimension coverage appear in the same row. No mode switch needed.

```
▼  offender_table  (hmpps_db)  ·  DDL ✓  parsed 2025-11-04

   ┌──────────────────────────┬───────┬─────┬─────┬─────┬─────┬─────┬─────┬──────┬────────────┐
   │ Field                    │ Type  │ ACC │ COM │ TIM │ CON │ UNQ │ VAL │ Cov  │            │
   ├──────────────────────────┼───────┼─────┼─────┼─────┼─────┼─────┼─────┼──────┼────────────┤
   │ ✓ offender_id   [CDE]    │ INT   │  ●  │  ●  │  ─  │  ●  │  ●  │  ─  │ 4/6  │            │
   │ ⚠ customer_ref  [CDE]    │ VCHAR │  ─  │  ●  │  ─  │  ─  │  ─  │  ─  │ 1/6  │ [Profile]  │
   │ ⚠ status_code   [SQL]    │ VCHAR │  ─  │  ─  │  ─  │  ─  │  ─  │  ─  │ 0/6  │ [Profile]  │
   │ ✓ created_date  [CDE]    │ DATE  │  ●  │  ●  │  ●  │  ●  │  ●  │  ●  │ 6/6  │            │
   ├──────────────────────────┴───────┴─────┼─────┼─────┼─────┼─────┼─────┼──────┼────────────┤
   │ Dimension coverage                     │ 50% │ 75% │ 25% │ 50% │ 50% │ 25%  │            │
   └────────────────────────────────────────┴─────┴─────┴─────┴─────┴─────┴──────┴────────────┘

   ⓘ  status_code was extracted from rule SQL — verify it is relevant.  [ Dismiss ]
```

**Column widths (estimated, px):**

| Column | Width | Notes |
|---|---|---|
| Field | flex (min 160px) | Icon + name + source badge inline |
| Type | 58px | |
| ACC · COM · TIM · CON · UNQ · VAL | 38px each = 228px | 3-char acronym, full name on hover |
| Cov | 52px | N/6 fraction |
| Action | 90px | Reserved on all rows; empty when profiled |
| **Total fixed** | **428px** | Field column takes remaining space |

At a typical content area of ~1000px this leaves ~570px for the field name — comfortably more than needed.

### 5.4 Field row columns

| Column | Source | Notes |
|---|---|---|
| Field | CDE `source_field_name` or SQL-extracted name | Mono. Leading ✓ (green) = profiled; ⚠ (amber) = not profiled. Hover on icon shows "Profiled by X · date". |
| Source badge | Origin tag | `[CDE]` green · `[SQL]` purple · inline after field name |
| Type | `parsed_columns` from DDL | Small grey badge; blank if no DDL |
| ACC…VAL | `data_quality_rule_allocation` via CDEs for this field | ● green = covered; ─ grey = not covered |
| Cov | Computed | `N/6` fraction, colour-coded (green = 6/6, amber = partial, red = 0/6) |
| Action | — | `[Profile]` shown only for not-yet-profiled rows; empty cell reserved for profiled rows |

### 5.5 Row visual states

There are four meaningful states. All are visible in a single row — no toggling required.

| Profiling | Coverage | Meaning | Visual treatment |
|---|---|---|---|
| ⚠ not profiled | all ─ (0/6) | Field declared but no rules and no profile | Standard row, `[Profile]` present |
| ⚠ not profiled | some ● (>0/6) | Rules are running against an unprofiled field | **Amber left border**, `[Profile]` prominent — most urgent |
| ✓ profiled | all ─ (0/6) | Field understood but no rules allocated yet | Muted row, no CTA |
| ✓ profiled | some/all ● | Field profiled and rules allocated | Muted row, green Cov chip, no CTA |

The second state — "rules running blind" — is the highest-priority call to action on the page. The field data is not understood but quality rules are already executing against it.

### 5.6 SQL-origin heuristic notice

One dismissible info banner per table group when SQL-extracted fields are present:

> ⓘ  N field(s) on this table were extracted from rule SQL — verify they are relevant before profiling.  [Dismiss]

### 5.7 Fields with unknown database

SQL-extracted references where the database could not be determined are grouped in a special table group:

```
▶  ref_lookup  (database unknown)
   1 field  ·  DDL ⚠ missing                         [ + Add DDL ]
   SQL-extracted reference — database name could not be determined.
```

The `+ Add DDL` form opens without the database pre-filled. Once the DDL is saved with a database name, the entry is re-keyed under the confirmed `db + table` pair.

### 5.8 Status filter

Filters the field list to the most actionable subset. Because profiling and coverage are both visible in every row, the filter works across both dimensions.

| Option | Shows |
|---|---|
| All | Every field in scope |
| Needs DDL | Tables with no stored DDL |
| Needs profiling | Fields where DDL exists but no profiling record |
| Rules running blind | Not profiled AND has at least one rule allocation — highest urgency |
| Profiled | Fields with a live profiling record |

Default: **All**.

---

## 6. Profiling Action — Slide-in Panel

Triggered by clicking `Profile` or `Re-profile` on any field row in Agenda mode.

### 6.1 Panel header

```
Profile field
  customer_ref  ·  offender_table  (hmpps_db)
  VARCHAR  ·  Referenced by 2 CDEs  ·  1 rule allocated
```

For SQL-origin-only fields:
```
Profile field
  status_code  ·  offender_table  (hmpps_db)
  VARCHAR  ·  Referenced in rule SQL (no CDE)
```

### 6.2 Panel steps

The field is pre-scoped; no selectors needed.

**Step 1 — Semantic type (optional)**  
Physical type shown read-only from DDL. User can override (STRING / NUMERIC / DATE / BOOLEAN / CATEGORICAL / FREE_TEXT) to influence which SQL queries are generated.

**Step 2 — Run profiling queries and paste results**
- Summary Profile (required)
- Top Values (optional)
- Type Patterns (optional — string fields only)
- Length Distribution (optional — string fields only)

Each sub-step shows generated SQL with a Copy button and a textarea for Athena results.

**Step 3 — Notes (optional)**  
Free text for business context, known issues, data quirks.

**Footer:** `Save profile` / `Update profile`. Populates `profiled_by` from `stewardIdentity.name` (falls back to `null` if no identity set).

### 6.3 DDL missing — gate step

If no DDL exists for the field's table, the panel opens with a gate step before the profiling workflow:

```
Before profiling this field, add the CREATE TABLE DDL for offender_table (hmpps_db).

[ Paste CREATE TABLE statement here... ]

[ Parse & Save DDL ]  [ Cancel ]
```

After saving the DDL, the panel advances to Step 1 without closing.

---

## 7. DDL Management — Inline Row Actions

There is no separate DDL management panel or button. All DDL operations are performed directly from the table group header rows (Section 5.2).

| Action | Trigger | Where |
|---|---|---|
| Add DDL | `+ Add DDL` button on header of any table group missing a DDL | Table group header (no-DDL state) |
| Edit DDL | Pencil icon on header of any table group with a stored DDL | Table group header (DDL present) |
| Retire DDL | Eye-off icon on header | Table group header (DDL present) |
| Restore DDL | Eye-on icon on header of a retired DDL row | Table group header (retired state) |

The existing `DDLFormPanel` (`201_ddl_form_panel.js`) is reused unchanged for both add and edit. All interactions open the panel in a slide-in without navigating away from the profiling view.

---

## 8. Multi-User Profiling Model

### Decision

**Last write wins is acceptable** for profiling data. The concern is attribution: users must be able to see who profiled a field and when, so that at merge time the surviving record is understandable.

### Schema change — `profiled_by`

Add `profiled_by` (type `str`, optional) to `field_profiling`:

```
field_profiling:
  + profiled_by  str  optional  "Steward name at time of save"
```

Populated from `stewardIdentity.name` at save time. Displayed on the field row as:

> ✓ Profiled by J. Smith · 2025-11-04

### Merge handling

When two stewards independently profile the same field and their datasets are merged into the master, two `field_profiling` records exist for the same `db + table + field`. Which record to retain, and whether to prompt the user, is **deferred to the merging/sync design**. Attribution via `profiled_by` + `profiled_at` ensures the conflict is understandable at that point.

---

## 9. Component Plan

All changes stay within `200_screen_ddl.js`. No new files are needed.

### New sub-components

| Component | Purpose |
|---|---|
| `ProfilingView` | Outer container: toolbar + summary strip + table groups |
| `TableGroupRow` | Collapsible table group header with inline DDL actions (pencil / eye-off / + Add DDL) |
| `FieldRow` | Single field row: profiling icon + type + 6 dim cells + coverage + CTA |
| `DimCoverageFooter` | Per-dimension % row at the bottom of each expanded table group |
| `ProfilingSummaryStrip` | Two-row summary bar (profiling row + coverage row) |

The My data toggle is rendered inline in the toolbar — no separate `ScopeBar` component needed.

### Reused components (unchanged)

| Component | File | Notes |
|---|---|---|
| `FieldProfilingScreen` | `200_screen_ddl.js` | Becomes the slide-in panel (Section 6) |
| `ProfilingSqlStep` | `200_screen_ddl.js` | Individual SQL step cards — unchanged |
| `DDLFormPanel` | `201_ddl_form_panel.js` | Add/edit DDL form — reused for all inline DDL actions |

### Retired components

| Component | Replaced by |
|---|---|
| `DDLLibraryView` | `ProfilingView` + `TableGroupRow` |
| `FieldProfilingScreen` (as full-page section) | Slide-in panel scoped to a selected field |

---

## 10. Schema Changes Summary

| Table | Change | Required for |
|---|---|---|
| `field_profiling` | Add `profiled_by str` | Multi-user attribution (Section 9) |
| `data_quality_rule` | No change | SQL parsed at render time |
| `source_table_ddl` | No change | — |

SQL-extracted references are computed at render time. Dismissals are client-side only (`localStorage`). No additional tables required.

---

## 11. What Changes vs Today

| Aspect | Today | Proposed |
|---|---|---|
| Entry point | DDL table list → pick a field | Demand-driven view driven by CDEs and rule SQL |
| Scope of fields shown | All fields in all stored DDLs | Only fields referenced by CDEs or rule SQL |
| Table + Field Profiling | Two separate sections | One unified flow |
| DDL management | Primary section | Inline row actions (pencil / eye-off / + Add DDL on table group headers) |
| "Profile everything" pressure | Implicit | Removed |
| Profiling status | Full section per field | Icon (✓/⚠) inline in field name cell |
| Dimension coverage | Not shown | 6 fixed-width dim columns in every field row, no toggle |
| Mode switching | n/a | Eliminated — profiling + coverage always co-visible |
| Priority guidance | None | "Rules running blind" state highlighted with amber border |
| Agency scope | None | My data / All data toggle |
| Multi-user awareness | None | `profiled_by` + `profiled_at` on hover |
| Rule SQL references | Not surfaced | Parsed, added to view, heuristic + dismissible |

---

## 12. Relationship to CDE Coverage Page

The existing **CDE Coverage** screen (`190_screen_coverage.js`) remains. The two screens answer different questions:

| Screen | Organises by | Primary question |
|---|---|---|
| Table & Field Profiling — Coverage View | Physical table → field | Which physical fields have DQ rules, and which dimensions are covered? |
| CDE Coverage | Agency → CDS → table → CDE | How well are my declared CDEs covered across quality dimensions? |

They share the same underlying data but serve different perspectives: the data engineer checking source table readiness vs the data owner checking their declared model. The CDE Coverage screen should be retained.

If in a future iteration the CDE Coverage screen is deprecated, the Coverage View in this page already replicates its dimension matrix pattern, so migration would be low effort.

---

## 13. Open Questions

| # | Status | Question |
|---|---|---|
| 1 | **Resolved** | SQL parsing confirmed. All live rule SQL is parsed for hardcoded table/field references. SQL-origin entries are heuristic and dismissible. Database name may be unknown for unqualified references. |
| 2 | **Resolved** | `profiled_by` to be added to `field_profiling`. Last write wins is acceptable. Merge conflict handling deferred to the sync design. |
| 3 | **Resolved** | Agency scope uses the My data / All data toggle, defaulting to the steward's agency. |
| 4 | **Resolved** | Dimension headers use 3-character acronyms (`dimension_acronymn`) with full name on hover. Fixed at 38px per column. 6 dimensions = 228px total. No horizontal scroll. |
| 5 | **Resolved** | No separate Overall / By CDS toggle. Coverage scope is driven entirely by the My data / All data toggle — My data shows allocations for the steward's agency CDEs only; All data shows all agencies. |
| 6 | **Open** | **CDEs with incomplete source coordinates:** CDEs missing db/table/field cannot appear in this view. Should a callout be shown — "N CDEs excluded due to incomplete source coordinates" — with a link to the Data and Stewardship page? |
| 7 | **Open** | **Orphaned DDLs:** Tables in `source_table_ddl` not referenced by any CDE or rule SQL do not appear in the profiling view. Should they be shown anyway — perhaps in a collapsed "Unreferenced DDLs" group at the bottom — so users can retire them from the same page? |
| 8 | **Open** | **Database inference for unqualified SQL refs:** If a rule says `JOIN ref_codes` with no database prefix, should the system match against existing DDL records and propose a database name? Useful but risks false matches. |
| 9 | **Deferred** | **CDE Coverage page:** Keep as-is. Re-evaluate once this page ships — the physical-layer dimension grid may reduce its usefulness. |
