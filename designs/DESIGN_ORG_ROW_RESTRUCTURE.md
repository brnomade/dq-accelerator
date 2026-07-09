# DESIGN: Organisation Page — Agency Row Restructure

**Date:** 2026-07-01
**Status:** Awaiting approval

---

## Problem statement

The collapsed agency row on the Organisation page mixes concerns poorly. Stats are shown as pill boxes in the middle of the row, the patron floats between stats and action buttons, and profiling is expressed as a raw count rather than a meaningful percentage. The row is hard to read at a glance.

---

## Goals

- Place patron and all stats on a single, scannable subtitle line below the agency name.
- Express profiling coverage as a percentage of CDEs, not a raw count.
- Replace pill/box stat components with a flat inline stat line.
- Apply the same treatment to directorate rows inside the expanded view.
- Document ERD constraints in code comments so they cannot be violated by future changes.

## Non-goals

- No changes to the expanded hierarchy content (patron section, directorate branches, owner/steward chips).
- No changes to action buttons.
- No changes to search, show-retired toggle, or page header.
- No schema or routing changes.

---

## ERD constraints documented by this change

| Constraint | Scope | Enforcement |
|---|---|---|
| An agency has at most one active data patron | Agency | Noted in code comment; form-level validation to follow separately |
| A directorate has at most one data owner | Directorate | Noted in code comment; `owners[0]` used (not `.map`) at display level |
| A data owner belongs to exactly one directorate and one agency | Owner | No deduplication needed at any aggregation level |

---

## Revised layout

### Agency row — collapsed

```
[chevron]  ACRONYM  Full Agency Name                     [+ Directorate]  [edit]  [retire]
           [Patron] Jane Smith  ·  3 dir · 4 owners · 6 stewards · 12 CDS · 48 CDE · 89 rules · 94% profiled
```

- Line 1: chevron + acronym + full name (unchanged)
- Line 2: `[Patron]` role pill + patron name, then separator dot, then flat stat line
- When patron is absent: `[Patron] none assigned  ·  ...stats...`
- Right side: action buttons only (no stats, no patron)

### Patron name handling

- At most one active patron per agency (ERD constraint).
- Show `patrons[0].data_patron_name` if present, else `none assigned` in muted colour.

### Stat line — agency level

Order: `N dir · N owners · N stewards · N CDS · N CDE · N rules · XX% profiled`

| Stat | Source | Notes |
|---|---|---|
| N dir | `branches.length` | Count of active directorates |
| N owners | `branches.reduce((s,b) => s + b.owners.length, 0)` | Raw sum — no dedup (one owner per directorate max) |
| N stewards | unique `data_steward_id` across all `branches[i].stewards` | Dedup by ID — same steward can be assigned to multiple CDS |
| N CDS | `agCdsCount` (existing) | |
| N CDE | `agCdeCount` (existing) | |
| N rules | `agRuleCount` (existing) | |
| profiling | `agProfiledPct` (new) | See profiling text rules below |

### Stat line — directorate level (inside expanded view)

Order: `1 owner · N stewards · N CDS · N CDE · N rules · XX% profiled`

| Stat | Source | Notes |
|---|---|---|
| owner | `owners.length` (0 or 1) | Display as `1 owner` or `no owner`; never plural |
| N stewards | `stewards.length` | Already unique per directorate |
| N CDS | `dataSetCount` (existing) | |
| N CDE | `cdeCount` (existing) | |
| N rules | `ruleCount` (existing) | |
| profiling | `profiledPct` (new) | See profiling text rules below |

### Profiling text rules

| Condition | Display |
|---|---|
| `cdeCount === 0` | `no CDEs defined` (muted colour) |
| `cdeCount > 0` and `profiledCount === 0` | `no CDEs profiled` (muted colour) |
| `cdeCount > 0` and `profiledCount > 0` and `< 100%` | `XX% profiled` (purple accent) |
| `profiledCount === cdeCount` | `100% profiled` (green accent) |

---

## Data changes

### New aggregations added to `trees` useMemo

```
agOwnerCount   = branches.reduce((s, b) => s + b.owners.length, 0)
agStewardCount = new Set(all branches' stewards mapped to data_steward_id).size
agProfiledPct  = agCdeCount > 0 ? Math.round(agProfiledCount / agCdeCount * 100) : null
```

### New field added to each branch (directorate)

```
profiledPct = cdeCount > 0 ? Math.round(profiledCount / cdeCount * 100) : null
```

---

## Component changes

### `StatPill` — removed

The `StatPill` sub-component defined inside `OwnershipOrgChart` is replaced by inline stat text. No other component uses it.

### `OrgStatLine` — new inline helper (defined inside `OwnershipOrgChart`)

A small helper that renders the flat dot-separated stat line. Keeps the agency and directorate row JSX clean.

---

## File affected

`src/100_view_weights_org.js` — `OwnershipOrgChart` function only. `AggregatedWeightView` is untouched.

---

## What does not change

- Expanded hierarchy content (patron chips, owner chips, steward chips) — identical to current
- Action buttons on agency and directorate rows — identical to current
- Page header, search, show-retired toggle — identical to current
- `AggregatedWeightView` (weights/criticality pages) — untouched
