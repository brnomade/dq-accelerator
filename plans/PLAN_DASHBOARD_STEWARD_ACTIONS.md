# PLAN — Steward Action Dashboard

**Design:** `designs/DESIGN_DASHBOARD_STEWARD_ACTIONS.md`  
**File to change:** `src/220_screen_dashboard.js` (full replacement)  
**New helper function:** `computeStewardGaps(data, stewardIdentity)` — pure computation, no React (isMaster no longer changes scope)  
**Build impact:** single file change, no new source files needed

---

## Step 1 — Write `computeStewardGaps` helper

A pure function that takes `(data, stewardIdentity)` and returns:

```js
{
  myCdsIds:          Set<int>,     // CDSes owned by this steward
  myAgencyIds:       Set<int>,     // agencies derived from my CDSes
  myCdeIds:          Set<int>,     // CDEs in my CDSes
  unownedCds:        Array<row>,   // CDSes in my agencies with no steward
  emptyCds:          Array<row>,   // my CDSes with 0 CDEs
  unprotectedCds:    Array<row>,   // my CDSes with CDEs but 0 rule allocations
  unprotectedCdes:   Array<row>,   // my CDEs with 0 rule allocations
  unprofiledCdes:    Array<row>,   // my CDEs with no field_profiling match
  unratedCdes:       Array<row>,   // my CDEs with no cde_criticality record
  incompleteCdes:    Array<row>,   // my CDEs missing definition or explanation
  uncoveredDims:     Array<row>,   // quality_dimension rows with zero rule allocations in my scope
  dimensionCoverage: Array<{dim, coveredCount, totalCdes}>,  // one entry per dimension
  myCdsSummary:      Array<{cds, cdeCount, ruleCount, ratedCount, profiledCount}>,
  scopedIssues:      Array<issue>,  // FK integrity issues scoped to steward's CDEs/CDSes
}
```

Derivation detail:

**myCdsIds:**
- `stewardship` rows where `data_steward_id = stewardIdentity.id` AND `critical_data_set_id != 0` AND not retired → collect `critical_data_set_id`
- This applies equally to regular stewards and master stewards. The master marker record (`critical_data_set_id = 0`) is excluded — it is a role flag, not a CDS assignment.
- If the result is empty (master with no personal CDS assignments), all gap arrays will be empty and the dashboard shows the empty state.

**myAgencyIds:**
- For each CDS in myCdsIds → `critical_data_set.directorate_id` → `directorate.executive_agency_id`
- Collect unique agency IDs

**myCdeIds:**
- `critical_data_element` rows where `critical_data_set_id` in myCdsIds and not retired

**unownedCds:**
- All CDSes in directorates belonging to myAgencyIds
- Subtract CDSes that have at least one live `stewardship` record (where `critical_data_set_id != 0`)
- If myAgencyIds is empty (no personal CDSes), return empty array

**emptyCds:**
- myCdsIds where no live CDE has that `critical_data_set_id`

**unprotectedCds:**
- myCdsIds where CDEs exist but none of those CDE ids appear as `critical_data_element_id` in any live `data_quality_rule_allocation`

**unprotectedCdes:**
- myCdeIds not in the set of `critical_data_element_id` from live `data_quality_rule_allocation`

**unprofiledCdes:**
- Build a Set of `db|table|field` keys from live `field_profiling`
- myCdeIds rows where `source_database_name + '|' + source_table_name + '|' + source_field_name` not in that Set

**unratedCdes:**
- myCdeIds not in the set of `critical_data_element_id` from live `cde_criticality`

**incompleteCdes:**
- myCdeIds where `data_element_definition` is falsy OR `data_element_explanation` is falsy

**uncoveredDims:**
- All live `quality_dimension` records
- Build a Set of `quality_dimension_id` values from live `data_quality_rule_allocation` where `critical_data_element_id` is in myCdeIds
- Return `quality_dimension` rows whose `quality_dimension_id` is NOT in that Set

**dimensionCoverage:**
- For each live `quality_dimension`:
  - `coveredCount` = count of distinct `critical_data_element_id` values in live `data_quality_rule_allocation` where `quality_dimension_id` matches AND `critical_data_element_id` is in myCdeIds
  - `totalCdes` = myCdeIds.size
- Return array sorted by `coveredCount` ascending (gaps first)

**myCdsSummary:**
- For each CDS in myCdsIds: count CDEs, count distinct rule allocations, count rated CDEs, count profiled CDEs

**scopedIssues:**
- Call `runHealthCheck(data)` to get all FK issues
- Filter to issues where the affected record belongs to the steward's scope:
  - `table === 'critical_data_element'` → `pk` in myCdeIds
  - `table === 'critical_data_set'` → `pk` in myCdsIds
  - `table === 'data_quality_rule_allocation'` → find the allocation row, check its `critical_data_element_id` is in myCdeIds
  - `table === 'cde_criticality'` → find the row, check its `critical_data_element_id` is in myCdeIds
  - `table === 'stewardship'` → find the row, check its `critical_data_set_id` is in myCdsIds
  - all other tables → exclude

---

## Step 2 — Rewrite `DashboardScreen`

Replace the entire component body. Structure:

```
if (!hasData) → show "No data loaded" state (keep existing behaviour)

const gaps = useMemo(() => computeStewardGaps(data, stewardIdentity), [data, stewardIdentity])

if (!stewardIdentity) → show identity prompt card

render:
  1. Identity bar (name, CDS count, agency names, Master badge if isMaster)
  2. If myCdsIds is empty → empty-state prompt (master: points to Reporting page; regular: contact master steward)
  3. Action cards (8 cards, wrapping flex row) — or "All clear" banner if all gaps are 0
  4. Coverage by Quality Dimension section
  5. My CDSes table
  6. Data integrity section (collapsible, collapsed by default)
```

### ActionCard sub-component (local, not exported)

```jsx
function ActionCard({ count, label, description, navigateTo, onNavigate, accent }) { ... }
```

- `count` — number
- `label` — string
- `description` — one-line explanation
- `navigateTo` — `{ screen, table }` object
- `onNavigate` — from `useApp().navigate`
- `accent` — colour: amber if count > 0, green if 0

Card renders: large count number, label, description, chevron arrow. Entire card is clickable.

---

## Step 3 — Identity bar

Show: steward name (from `data.data_steward` lookup by `stewardIdentity.id`) · CDS count · agency acronyms (derived via myCdsIds → directorate → agency)

If `isMaster`: append a small **Master** badge (pill, `var(--amber)` background) after the steward name. All other identity bar content remains the same — it still reflects their personal CDS scope, not a global one.

---

## Step 4 — Coverage by Quality Dimension section

Section header: "Rule coverage by quality dimension"  
Sub-note: "Partial coverage is expected — not every CDE requires every dimension. Zero coverage flags a dimension entirely absent from your portfolio."

One row per quality dimension from `gaps.dimensionCoverage`, sorted gaps first (ascending `coveredCount`).

Each row:
```
[Dimension name]   [████████░░░░░░░░]   [coveredCount / totalCdes CDEs]
```

Bar implementation: a fixed-width container div with an inner div whose `width` is `(coveredCount / totalCdes * 100) + '%'`.

Row accent colour:
- `coveredCount === 0` → amber text + amber bar fill
- `coveredCount === totalCdes` → green bar fill
- otherwise → `var(--accent)` bar fill, no text highlight

Skip this section entirely if `myCdeIds.size === 0` (nothing to show).

---

## Step 5 — My CDSes table

One row per CDS. Columns: Name, CDEs, Rules, Rated (n/total), Profiled (n/total).  
Row border: amber left if any gap, green left if all columns are complete.  
Click a row → navigate to Data and Stewardship.

---

## Step 6 — Data integrity section (collapsible)

Rendered at the bottom of the page, always visible but collapsed by default.

Header shows: **"Data integrity"** label + a pill badge with the issue count (amber if > 0, grey if 0) + a collapse chevron (`▸` closed, `▾` open). Entire header row is clickable.

When expanded:
- If `scopedIssues.length === 0`: show "No integrity issues found in your scope."
- Otherwise: reuse `issue-list` / `issue-item` / `issue-badge` CSS classes, cap at 30 items, show "...and N more" footer if exceeded.

State: `const [fkOpen, setFkOpen] = useState(false)` — local to `DashboardScreen`.

---

## Step 7 — No-identity state

Single centred card with amber border:
> "No steward identity set — this dashboard is personalised to your steward account. Open Settings to identify yourself."

---

## Constraints

- No new source files — all code stays in `220_screen_dashboard.js`
- `computeStewardGaps` must be a plain function (not a hook) so it can be called inside `useMemo`
- No non-ASCII characters in JS (use escape sequences if needed)
- `navigate` is available via `useApp()` — use it for card click handlers
- `runHealthCheck` IS still used — called inside `computeStewardGaps` and its output filtered to steward scope for the `scopedIssues` array
- `isMaster` is read from context for the Master badge and empty-state message only; it does not change computation scope

---

## Files changed

| File | Change |
|------|--------|
| `src/220_screen_dashboard.js` | Full replacement |

---

## Out of scope

- Pre-filtering target screens when navigating from a card
- Inline editing on the dashboard
- Charting libraries — progress bars are pure CSS width tricks
