# DESIGN: Organisation Page — Directorate Row Expansion

**Date:** 2026-07-01
**Status:** Approved

---

## Goals

- Remove the patron row from the expanded agency view (already visible in the collapsed subtitle).
- Give each directorate row the same 2-line collapsed pattern as the agency row.
- Make directorate rows independently expandable, revealing a read-only CDS table with stewards per CDS.

---

## Revised expanded agency view structure

```
[Agency card — expanded]
  ↓ Directorate A (collapsed)
      Directorate Name                              [edit]  [retire]
      [Owner] Jane Smith  ·  3 stewards · 4 CDS · 18 CDE · 31 rules · 100% profiled

  ↓ Directorate A (expanded)
      Directorate Name                              [edit]  [retire]
      [Owner] Jane Smith  ·  3 stewards · 4 CDS · 18 CDE · 31 rules · 100% profiled

      Name                Description               Stewards
      ─────────────────────────────────────────────────────────────
      Alpha CDS           Primary records           Jane Doe (Lead)
      Beta CDS            Financial transactions    —
```

---

## Directorate row — 2-line pattern

Mirrors the agency row exactly.

**Line 1:** directorate name + retired badge (if applicable)

**Line 2:** `[Owner]` role pill + owner name (or *none assigned* in muted italic) + flat stat line

Stat line: `N stewards · N CDS · N CDE · N rules · XX% profiled`

- Owner count is removed from the stat line — the owner is now named inline.
- Steward count, CDS/CDE/rule counts and profiling remain.

**Right side:** edit + retire/restore buttons (unchanged, stopPropagation).

**Chevron** added to left, rotating on expand.

---

## Directorate expanded view — CDS table

A three-column read-only table:

| Column | Source field | Width |
|---|---|---|
| Name | `data_set_name` | ~30% |
| Description | `data_set_description` (or `—` if empty) | ~45% |
| Stewards | Chips from `stewardship` filtered by `critical_data_set_id` | ~25% |

- Sorted by `data_set_name` ascending.
- No edit or retire buttons — users must use the Data and Stewardship page to modify CDS.
- "No critical data sets found." shown when the directorate has none.
- Column headers shown as small uppercase labels above the rows.

---

## Data additions to each branch (inside `trees` useMemo)

```js
const cdsWithStewards = dataSets
  .filter(ds => isLive(ds))
  .sort((a,b) => (a.data_set_name||'').localeCompare(b.data_set_name||''))
  .map(ds => {
    const dsId = ds.critical_data_set_id;
    const cdsTewardships = (data.stewardship || [])
      .filter(s => s.critical_data_set_id === dsId && isLive(s));
    const cdsTewardIds = [...new Set(cdsTewardships.map(s => s.data_steward_id))];
    const cdsTewards = cdsTewardIds
      .map(sid => { ... })  // same pattern as existing steward resolution
      .filter(Boolean)
      .sort((a,b) => (a.data_steward_name||'').localeCompare(b.data_steward_name||''));
    return { ds, stewards: cdsTewards };
  });
```

Branch return gains: `cdsWithStewards`. Existing `stewards` array retained for stat count.

---

## State additions

```js
const [expandedDirs, setExpandedDirs] = useState({});
const toggleDir = (did) => setExpandedDirs(prev => ({ ...prev, [did]: !prev[did] }));
```

---

## What does not change

- Agency collapsed row — unchanged.
- Agency expanded: only patron row removed; directorate list stays in same container.
- Existing `stewards` aggregate per directorate — retained for stat count.
- All action buttons on directorate row — unchanged.
- `AggregatedWeightView` — untouched.

---

## File affected

`src/100_view_weights_org.js` — `OwnershipOrgChart` only.
