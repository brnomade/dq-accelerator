# Design: Uploader Review Screen V2

Replaces the flat two-section (Excluded / Included) review screen in the Uploader tab with a
navigable, collapsable table grouped by Agency and CDS, with per-allocation check columns and
a session-only steward override mechanism.

---

## 1. Scope

This design covers changes to the **Uploader tab review screen only** — the screen shown after
the Master Steward clicks "Export for Uploader". The settings view (soft-deleted toggle,
Export button) is unchanged. No other tabs on the Export screen are affected.

---

## 2. Review screen layout

### 2.1 Headline

A single line above the table:

> **51 allocations evaluated — 9 failed. All failed allocations excluded by default.**

When zero failures:

> **51 allocations evaluated — all passed. Ready to export.**

In the zero-failure case the table area is replaced by a brief confirmation message and the
Export button is enabled immediately with no further review required.

### 2.2 Table structure

Only **failed allocations** appear in the table. Passing allocations are silently included in
the export and are not shown.

The table has two levels of collapsable group headers above the data rows:

```
▼ HMPPS  (4 failed)                                               [ ☐ Select all ]
  ▼ Prisoner Record  (3 failed)                                   [ ☐ Select all ]
    ┌─────────────────┬──────────────┬────┬───────┬───────┬─────┬────┬─────┬──────────┐
    │ CDE             │ Rule         │ DB │ Table │ Field │ SQL │ PH │ Bal │ Include? │
    ├─────────────────┼──────────────┼────┼───────┼───────┼─────┼────┼─────┼──────────┤
    │ prison_number   │ Null Check   │ ✓  │   ✗   │   ✓   │  ✓  │  ✗ │  ✓  │   ☐      │
    │ prison_number   │ Range Check  │ ✓  │   ✗   │   ✓   │  ✓  │  ✗ │  ✓  │   ☐      │
    │ sentence_length │ Format Check │ ✗  │   ✗   │   ✓   │  ✓  │  ✓ │  ✓  │   ☐      │
    └─────────────────┴──────────────┴────┴───────┴───────┴─────┴────┴─────┴──────────┘
  ▶ Court Record  (1 failed)                                      [ ☐ Select all ]
▶ MOJ  (5 failed)                                                 [ ☐ Select all ]
```

#### Group headers

| Level | Content | Default state |
|-------|---------|---------------|
| Agency | Agency name + count of failed allocations + Select All checkbox | Expanded |
| CDS | CDS name + count of failed allocations + Select All checkbox | Expanded |

Collapsing an Agency row hides all its CDS rows and allocation rows. Collapsing a CDS row
hides its allocation rows only. Both levels are independently toggled by clicking the header.

When a section has **zero failures** (all allocations in that Agency/CDS passed):

> `▶  All checks passed — no issues`

This row is shown collapsed and cannot be expanded (there are no rows to show).

#### Column headers

Column headers are rendered **once per CDS section**, immediately above the first data row of
that section. They are not a single global sticky header. This ensures column labels remain
visible when the user has scrolled past the top of the page and multiple sections are open.

#### Check columns — definitions and tooltips

| Column | Checks | Tooltip text |
|--------|--------|--------------|
| DB | `source_database_name` not blank, not a placeholder, no spaces | "Source database name — must be a valid SQL identifier" |
| Table | `source_table_name` not blank, not a placeholder, no spaces | "Source table name — must be a valid SQL identifier" |
| Field | `source_field_name` not blank, not a placeholder, no spaces | "Source field name — must be a valid SQL identifier" |
| SQL | `sql_code` present and not whitespace-only after substitution | "Rule SQL code — must be present and non-empty" |
| PH | All three `{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, `{SOURCE_FIELD_NAME}` placeholders present in `sql_code` | "SQL placeholders — all three source tokens must appear in the SQL template" |
| Bal | Balanced single quotes, double quotes, and parentheses in `sql_code` | "SQL balance — single quotes, double quotes, and parentheses must be balanced" |

#### Check column visual states

- Pass: green tick (`✓`)
- Fail: red cross (`✗`)
- Column header cells also carry a `title` attribute for the tooltip

#### Data rows

Each row represents one failed `data_quality_rule_allocation` record.

| Cell | Content |
|------|---------|
| CDE | `source_field_name` of the linked CDE (repeated per row even when the same CDE appears multiple times) |
| Rule | `rule_name` of the linked rule |
| DB / Table / Field | ✓ or ✗ for the three CDE source field checks |
| SQL / PH / Bal | ✓ or ✗ for the three rule SQL checks |
| Include? | Checkbox — ticked means "include this allocation despite failures" |

---

## 3. Source field validation rules

Applied to `source_database_name`, `source_table_name`, `source_field_name`:

A field is **invalid** if any of the following are true:

1. The trimmed value is blank (empty string)
2. The trimmed lowercase value exactly matches one of: `tbd`, `tbc`, `to be confirmed`
3. The trimmed value contains one or more space characters

Real SQL identifiers never contain spaces. Case-insensitive exact-match placeholder detection
catches the most common steward conventions without risking false positives on legitimate names.

Failure reason texts (used in the exclusion receipt):

| Cause | Reason text |
|-------|-------------|
| Blank | `"source_table_name is blank"` |
| Placeholder | `"source_table_name contains placeholder value 'TBC'"` |
| Spaces | `"source_table_name contains spaces — not a valid SQL identifier"` |

---

## 4. Override mechanism

### 4.1 Semantics

Ticking the **Include?** checkbox on an allocation row means:

> "I, the Master Steward, knowingly accept the engine risk for this allocation and want it
> included in this export despite the validation failures shown."

This is a deliberate accept-risk action, not a data fix. The underlying data remains unchanged.

### 4.2 Scope

- Override is **per allocation** (one checkbox per row).
- The "Select All" checkbox on Agency and CDS headers ticks/unticks all Include? checkboxes
  within that group. This is a **UX bulk-action only** — it has no semantic meaning beyond
  setting each individual checkbox. Individual checkboxes can be changed freely after a
  bulk-tick.

### 4.3 Persistence

Overrides are **session-only**. They live in component state and are cleared when:

- The steward clicks Cancel (returns to settings view)
- The steward navigates away from the Export screen
- The export completes and the view resets to settings

There is no localStorage persistence of overrides. The steward reviews and decides fresh on
every export run.

---

## 5. Summary bar and action buttons

Fixed at the bottom of the review screen (below the table, above the page footer):

```
9 failed  |  2 overridden to include  |  7 still excluded

[ Export ZIP + receipt ]     [ Cancel ]
```

The summary bar updates live as Include? checkboxes are changed. When all failed allocations
are overridden: "0 still excluded" shown in green.

The Export button label reflects what will be produced:

| Condition | Button label |
|-----------|-------------|
| Exclusions remain | `Export ZIP + receipt` |
| All overridden (zero excluded) | `Export ZIP` |
| Zero failures (no review needed) | `Export ZIP` |

---

## 6. Receipt changes

The JSON receipt (`dq_uploader_receipt_YYYYMMDDHHMMSS.json`) is extended with a second section
for allocations that were manually included despite failing checks.

Updated receipt structure:

```json
{
  "_type": "uploader_exclusion_receipt",
  "_generated_at": "ISO-8601 timestamp",
  "_total_evaluated": 51,
  "_total_included": 44,
  "_total_excluded": 5,
  "_total_overridden": 2,
  "excluded_allocations": [ ... ],
  "overridden_allocations": [
    {
      "data_quality_rule_allocation_id": 123,
      "critical_data_set_name": "Prisoner Record",
      "critical_data_element_id": 45,
      "critical_data_element_name": "prison_number",
      "data_quality_rule_id": 67,
      "data_quality_rule_name": "Null Check",
      "known_failures": [
        "source_table_name contains placeholder value 'TBC'",
        "Missing placeholder {SOURCE_TABLE_NAME} in sql_code"
      ],
      "override_note": "Manually included by Master Steward despite validation failures"
    }
  ]
}
```

The receipt is produced only when `excluded_allocations` or `overridden_allocations` is
non-empty. If all allocations pass and none are overridden, no receipt is generated.

---

## 7. Files affected

| File | Change |
|------|--------|
| `src/231_uploader_validation.js` | Add `isInvalidSourceField()` helper; update CDE checks to use it; add structured `checks` flags to output alongside existing `reasons[]` |
| `src/232_uploader_export.js` | Full rewrite of review view; settings view unchanged; add Agency/CDS maps; build grouped tree; render collapsable headers, column headers per section, allocation rows, summary bar, override state |

No other files require changes.

---

## 8. Out of scope

- Changes to the settings view (soft-deleted toggle, Export button)
- Changes to Master, Backup, Tables, or Delta tabs
- Changes to the CDE or Rule editing screens
- Persistence of override decisions between sessions
- Free-text override reason/comment field
- The `isInvalidSourceField` check being applied anywhere other than the uploader validation
