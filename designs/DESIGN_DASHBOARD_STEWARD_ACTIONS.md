# DESIGN — Steward Action Dashboard

**Feature:** Redesign `DashboardScreen` from a census view into a steward-scoped action centre.  
**File:** `src/220_screen_dashboard.js`  
**Status:** Approved — ready for implementation  
**Related:** `DESIGN_REPORTING_PAGE.md` (planned follow-on for master steward org-wide reporting)

---

## Problem

The current dashboard shows totals for all 18 tables. It tells the steward *how much* data exists but not *what needs their attention*. It is not scoped to the logged-in steward and offers no call to action.

---

## Goal

Replace the table-census layout with a gap-analysis view scoped to the identified steward. Every section surfaces something that is missing or incomplete, with a clear next action. The steward should be able to open the dashboard and immediately know what to do next.

---

## Personas

| Mode | Condition | Behaviour |
|------|-----------|-----------|
| No identity | `stewardIdentity` is null | Show single prompt card: "Set your steward identity in Settings to personalise this view" |
| Identified steward | `stewardIdentity` set, `isMaster` false | Scoped to steward's own CDSes and agency |
| Master steward | `isMaster` true | Same personal scope as identified steward — scoped to their own CDS assignments. Master badge shown in identity bar. If no personal CDS assignments exist, an empty-state prompt directs to the Quality Reporting page (planned). Org-wide reporting is handled by the separate Quality Reporting page, not the dashboard. |

---

## Layout

```
┌─────────────────────────────────────────────────┐
│  My Responsibility  (identity bar)               │
│  [Name]  ·  [N CDSes]  ·  [Agency]              │
└─────────────────────────────────────────────────┘

Action cards row (horizontal, wrapping):
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Unowned CDSs │ │  Empty CDSs  │ │Unprotected   │ │Unprotected   │
│  in agency   │ │  (no CDEs)   │ │CDSs          │ │CDEs          │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Unprofiled   │ │  Unrated     │ │  Incomplete  │ │  Uncovered   │
│    CDEs      │ │    CDEs      │ │  Definitions │ │  Dimensions  │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

Coverage by Quality Dimension
┌─────────────────────────────────────────────────┐
│  Completeness    ████████████░░░░  10 / 14 CDEs │
│  Accuracy        ████░░░░░░░░░░░░   4 / 14 CDEs │
│  Timeliness      ░░░░░░░░░░░░░░░░   0 / 14 CDEs │ ← amber
│  ...                                            │
└─────────────────────────────────────────────────┘

My CDSes (one row per CDS)
┌─────────────────────────────────────────────────┐
│  CDS Name  │  CDEs  │  Rules  │  Rated  │  Prof. │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

If all cards are zero, show a single green "All clear" banner instead of individual cards.

---

## Action Cards

Each card shows:
- A count (large, coloured amber if > 0, green if 0)
- A label
- A one-line description of what it means
- An arrow button → navigates to the relevant screen

### Card 1 — Unowned CDSes

**Label:** Unowned CDSes  
**Description:** CDSes in your agency not yet assigned to any steward.

**Derivation:**
1. `stewardIdentity.id` → `stewardship` (where `data_steward_id = me`, live) → my `critical_data_set_id`s
2. My CDSes → `critical_data_set.directorate_id` → `directorate.executive_agency_id` → my agency IDs
3. All CDSes in those agencies (via directorate chain)
4. Subtract CDSes that have at least one live `stewardship` record
5. Remainder = unowned

**Navigation:** Data and Stewardship (filtered to unowned CDSes — or just navigate there)

---

### Card 2 — Empty CDSes

**Label:** Empty CDSes  
**Description:** Your CDSes with no Critical Data Elements defined yet.

**Derivation:** My CDSes where `critical_data_element` count (live, matching `critical_data_set_id`) = 0

**Navigation:** Data and Stewardship

---

### Card 3 — Unprotected CDSes

**Label:** Unprotected CDSes  
**Description:** Your CDSes that have CDEs but no rules allocated to any of them.

**Derivation:** My CDSes where CDEs exist but no live `data_quality_rule_allocation` record references any of those CDEs

**Navigation:** Rules Explorer

---

### Card 4 — Unprotected CDEs

**Label:** Unprotected CDEs  
**Description:** Individual CDEs with no rule allocations. These elements are not validated.

**Derivation:** CDEs in my CDSes with no live `data_quality_rule_allocation` record (by `critical_data_element_id`)

**Navigation:** Rules Explorer

---

### Card 5 — Unprofiled CDEs

**Label:** Unprofiled CDEs  
**Description:** CDEs with no matching record in Field Profiling. Without profiling data, quality cannot be assessed in context.

**Derivation:** CDEs in my CDSes where no `field_profiling` record exists with matching `source_database_name` + `source_table_name` + `source_field_name`

**Navigation:** Profiling

---

### Card 6 — Unrated CDEs

**Label:** Unrated CDEs  
**Description:** CDEs with no criticality assessment. Without a rating, these elements are invisible to the RAG Simulator — they contribute nothing to your data quality score.

**Derivation:** CDEs in my CDSes with no live `cde_criticality` record (by `critical_data_element_id`)

**Navigation:** Data and Stewardship (criticality tab)

---

### Card 7 — Incomplete Definitions

**Label:** Incomplete Definitions  
**Description:** CDEs missing a definition or explanation. Accurate metadata is required for governance and audit.

**Derivation:** CDEs in my CDSes where `data_element_definition` is blank/null OR `data_element_explanation` is blank/null

**Navigation:** Data and Stewardship

---

### Card 8 — Uncovered Dimensions

**Label:** Uncovered Dimensions  
**Description:** Quality dimensions with no rule allocations across any of your CDEs. A dimension entirely absent from your portfolio is a governance gap — not a partial one.

**Derivation:**
1. Collect all live `quality_dimension` records
2. Collect the distinct `quality_dimension_id` values from live `data_quality_rule_allocation` records whose `critical_data_element_id` is in myCdeIds
3. Count = dimensions in (1) that do not appear in (2)

**Navigation:** Rules Explorer

---

## Coverage by Quality Dimension Section

Positioned between the action cards and the My CDSes table.

One row per quality dimension. Each row shows:
- Dimension name
- A proportional fill bar: CDEs with at least one rule in this dimension / total CDEs in my scope
- The fraction as text (e.g. "10 / 14 CDEs")

**Colour rules:**
- 0 coverage → amber row (matches Card 8 signal — this is a true gap)
- Partial coverage → neutral (grey bar, no highlight — steward judges whether it is intentional)
- Full coverage → green bar

**Framing:** The section header reads "Rule coverage by quality dimension" with a sub-note: "Partial coverage is expected — not every CDE requires every dimension. Zero coverage indicates a dimension is absent from your portfolio."

This framing prevents the steward from reading partial bars as errors. Only zero is flagged as amber.

---

## My CDSes Section

A table below the cards showing one row per CDS the steward owns:

| Column | Source |
|--------|--------|
| CDS Name | `critical_data_set.data_set_name` |
| CDEs | count of live CDEs |
| Rules | count of distinct live rule allocations across CDEs |
| Rated | fraction of CDEs with at least one criticality entry (e.g. "4 / 6") |
| Profiled | fraction of CDEs with a profiling record (e.g. "2 / 6") |

Rows with any gaps are highlighted (amber left border). A fully complete row has a green left border.

---

## Master steward behaviour

When `isMaster` is true the dashboard behaves identically to the identified steward mode — all eight cards and all sections are scoped to the master steward's own CDS assignments (rows in `stewardship` where `data_steward_id = stewardIdentity.id` and `critical_data_set_id != 0`).

The identity bar shows a **Master** badge alongside the steward's name to make the role visible.

**Empty state for master with no personal CDSes:** A master steward who has not been assigned any specific CDSes (only the master marker record) will see all gap cards at zero with a neutral grey colour and a note:

> "You have no personal CDS assignments. Use the Quality Reporting page to view org-wide data quality status."

The note links to the Quality Reporting page (navigates to `screen:reporting`) when that page is built. Until then, the note is static text.

**Org-wide reporting is explicitly out of scope for this screen.** The dashboard is a personal action centre for all stewards regardless of role. Escalation and patron-level reporting is handled by the dedicated Quality Reporting page (see `DESIGN_REPORTING_PAGE.md`).

---

## What is removed

- Per-table tile grid (all 18 tables)
- Global live/retired totals summary
- FK integrity issue list (moved to Quality Reporting page)

---

## Follow-on: Quality Reporting Page

A separate screen (`screen:reporting`) is planned for a subsequent phase. It will be the primary tool for master stewards preparing escalations or briefings for Data Patrons and the CDO. Key capabilities:

- Scope toggle: Agency / Directorate / All
- Aggregate gap cards at the selected scope level
- Per-agency and per-directorate breakdown tables
- FK integrity issues (org-wide)
- Print / export friendly layout

See `DESIGN_REPORTING_PAGE.md` for the full specification when drafted.

---

## Non-goals

- No filter pre-population on target screens (cards navigate to the screen; steward applies their own filter)
- No inline editing on the dashboard
- No charts — progress bars in the dimension section are CSS width tricks, not a charting library
