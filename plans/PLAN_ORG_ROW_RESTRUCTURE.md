# PLAN: Organisation Page — Agency Row Restructure

**Date:** 2026-07-01
**Design:** DESIGN_ORG_ROW_RESTRUCTURE.md
**Status:** Awaiting approval

---

## Scope

Single file: `src/100_view_weights_org.js`
Function: `OwnershipOrgChart` only.
`AggregatedWeightView` is not touched.

---

## Steps

### Step 1 — Add new aggregations to `trees` useMemo

Inside the `trees` useMemo (currently ends around line 366), add to the agency-level totals block:

```js
// ERD: one owner per directorate max -- raw sum is the unique individual count
const agOwnerCount = branches.reduce((s, b) => s + b.owners.length, 0);

// Stewards deduplicated by data_steward_id (same steward can span multiple CDS)
const agStewardIds = new Set(
  branches.flatMap(b => b.stewards.map(s => s.data_steward_id))
);
const agStewardCount = agStewardIds.size;

const agProfiledPct = agCdeCount > 0
  ? Math.round(agProfiledCount / agCdeCount * 100)
  : null;
```

Update the return object of the agency map to include `agOwnerCount`, `agStewardCount`, `agProfiledPct`.

### Step 2 — Add `profiledPct` to each branch (directorate)

Inside the `branches` map, after `profiledCount` is computed, add:

```js
const profiledPct = cdeCount > 0
  ? Math.round(profiledCount / cdeCount * 100)
  : null;
```

Update the branch return object to include `profiledPct`.

Also add a comment noting the ERD constraint:
```js
// ERD: at most one data owner per directorate
```

### Step 3 — Remove `StatPill`, add `OrgStatLine` helper

Remove the `StatPill` function defined inside `OwnershipOrgChart`.

Add `OrgStatLine` helper (also inside `OwnershipOrgChart`):

```js
function OrgStatLine({ items }) {
  // items: array of { value, label, color?, muted? }
  // Renders: val label · val label · ...
}
```

Stat items for the agency line:
- `{ value: branches.length, label: 'dir' }`
- `{ value: agOwnerCount, label: 'owner' + (agOwnerCount !== 1 ? 's' : '') }`
- `{ value: agStewardCount, label: 'steward' + (agStewardCount !== 1 ? 's' : '') }`
- `{ value: agCdsCount, label: 'CDS' }`
- `{ value: agCdeCount, label: 'CDE' }`
- `{ value: agRuleCount, label: 'rules' }`
- Profiling text (see profiling rules below)

Profiling text helper (inline, not a separate component):

| Condition | Text | Colour |
|---|---|---|
| `pct === null` (no CDEs) | `no CDEs defined` | `var(--text3)` |
| `pct === 0` | `no CDEs profiled` | `var(--text3)` |
| `0 < pct < 100` | `${pct}% profiled` | `var(--purple)` |
| `pct === 100` | `100% profiled` | `var(--green)` |

### Step 4 — Rewrite agency header row JSX

Replace the current agency header row content (chevron + name div + StatPills + patron preview + buttons) with:

```
[chevron]
[name block]
  Line 1: ACRONYM  Full Name
  Line 2: [Patron pill] patron name (or "none assigned")  ·  [OrgStatLine]
[action buttons]
```

- Remove the `StatPills` block entirely.
- Remove the separate patron preview block (currently shown to the right of stats).
- Patron and stat line are now inside the name block's subtitle line.
- Action buttons remain in their current position (right, stopPropagation).

### Step 5 — Rewrite directorate header row JSX

Replace the current directorate header content (name + StatPills + edit/retire buttons) with:

```
[name]
[stat line: 1 owner / no owner · N stewards · N CDS · N CDE · N rules · XX% profiled]
[edit/retire buttons]
```

- Remove `StatPills` block.
- Add flat stat line below directorate name.
- ERD comment: at most 1 owner per directorate — display `owners[0]` count only (0 or 1).

### Step 6 — Build and verify

Run `python build.py`. Verify in browser:
- Agency row with patron + stat line renders correctly
- Profiling % shows correct variants (no CDEs defined / no CDEs profiled / XX% / 100%)
- Directorate expanded rows show flat stat line
- Action buttons still work (expand, edit, retire, add directorate)
- Show retired toggle still works

---

## Risk

Low. All changes are within a single function. No state, context, schema, or routing changes. The existing expanded-view content is untouched.

---

## Acceptance criteria

- [ ] Agency collapsed row: patron + stats on one subtitle line, no pill boxes
- [ ] Profiling shows as percentage with correct text for all three states
- [ ] Agency stat line order: dir · owners · stewards · CDS · CDE · rules · profiling
- [ ] Directorate stat line order: owner · stewards · CDS · CDE · rules · profiling
- [ ] "1 owner" or "no owner" (never "2 owners") at directorate level
- [ ] Steward count at agency level deduplicates by data_steward_id
- [ ] Owner count at agency level is raw sum (ERD guarantees uniqueness)
- [ ] Action buttons unchanged and functional
- [ ] Build passes with no non-ASCII errors
