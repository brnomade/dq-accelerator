# DESIGN — Quality Reporting Page

**Feature:** Org-wide data quality reporting and monitoring screen for master stewards.  
**Route:** `screen:reporting`  
**Planned phase:** Follow-on (after Dashboard redesign)  
**Status:** Outline only — not yet ready for implementation

---

## Purpose

The Quality Reporting page is the tool master stewards use to prepare escalations and briefings for Data Patrons and the CDO. It answers the question: *"What is the state of data quality across the organisation?"* — as opposed to the Dashboard, which answers: *"What do I personally need to do?"*

This page is read-oriented. It aggregates, compares, and summarises. It is not an action centre.

---

## Audience

- Master stewards preparing patron briefings or CDO reports
- Data Patrons reviewing their agency's data quality posture

---

## Scope toggle

A segmented control at the top of the page:

```
[ All ]  [ Agency ▾ ]  [ Directorate ▾ ]
```

- **All** — organisation-wide view
- **Agency** — dropdown lists all executive agencies; selecting one scopes all sections
- **Directorate** — dropdown lists all directorates; selecting one scopes all sections

This is the page-level toggle deliberately excluded from the Dashboard. Here it is appropriate because the reader is not acting — they are reporting.

---

## Planned sections

### 1. Aggregate gap cards (same 8 as Dashboard but at selected scope)
Same card definitions as the Dashboard (unowned CDSes, empty CDSes, unprotected CDSes/CDEs, unprofiled CDEs, unrated CDEs, incomplete definitions, uncovered dimensions) but computed across all CDSes in the selected scope rather than a personal assignment.

### 2. Per-agency or per-directorate breakdown table
One row per agency (or directorate), showing each gap count as columns. Enables side-by-side comparison — which agencies are furthest behind?

### 3. Coverage by Quality Dimension (scope-level)
Same bar chart as the Dashboard but across all CDEs in scope.

### 4. FK integrity issues
The full list from `runHealthCheck` — relevant for a master steward or CDO auditing data integrity. Excluded from the Dashboard.

### 5. Print / export
A print-friendly layout or CSV export for patron briefing packs.

---

## Sidebar placement

Visible only when `isMaster` is true. Suggested position: between Dashboard and DQ Assistant in the top-level nav (not inside a group — it is an administrative/reporting tool).

---

## Dependencies

- Must be built after the Dashboard redesign is complete and stable
- Reuses `computeStewardGaps` logic but generalised to accept an arbitrary set of CDS ids rather than a steward's personal assignments
- No new data model changes required
