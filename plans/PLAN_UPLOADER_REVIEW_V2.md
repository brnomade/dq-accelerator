# Implementation Plan: Uploader Review Screen V2

Paired with: `designs/DESIGN_UPLOADER_REVIEW_V2.md`

---

## Overview

Two files change. No schema changes. No new localStorage keys. No new source files.

| File | Nature of change |
|------|-----------------|
| `src/231_uploader_validation.js` | Extend validation logic; add structured check flags to output |
| `src/232_uploader_export.js` | Rewrite review view; settings view untouched |

---

## Step 1 — Update `231_uploader_validation.js`

### 1.1 Add `isInvalidSourceField` helper

Insert at the top of the file (before `computeUploaderExclusions`):

```js
const PLACEHOLDER_SOURCE_VALUES = ['tbd', 'tbc', 'to be confirmed'];

function isInvalidSourceField(val) {
  const trimmed = (val || '').trim();
  if (trimmed === '') return 'blank';
  if (PLACEHOLDER_SOURCE_VALUES.includes(trimmed.toLowerCase())) return 'placeholder:' + trimmed;
  if (trimmed.indexOf(' ') !== -1) return 'spaces';
  return null;  // valid
}
```

Returns `null` when valid, or a string code describing the failure type.

### 1.2 Update CDE checks in `computeUploaderExclusions`

Replace the three existing CDE blank checks:

```js
// BEFORE
if (!(cde.source_database_name || '').trim()) reasons.push('Missing source_database_name on CDE');
if (!(cde.source_table_name    || '').trim()) reasons.push('Missing source_table_name on CDE');
if (!(cde.source_field_name    || '').trim()) reasons.push('Missing source_field_name on CDE');
```

With:

```js
// AFTER
const dbFail    = isInvalidSourceField(cde.source_database_name);
const tableFail = isInvalidSourceField(cde.source_table_name);
const fieldFail = isInvalidSourceField(cde.source_field_name);

if (dbFail) reasons.push(buildSourceFieldReason('source_database_name', dbFail, cde.source_database_name));
if (tableFail) reasons.push(buildSourceFieldReason('source_table_name',  tableFail, cde.source_table_name));
if (fieldFail) reasons.push(buildSourceFieldReason('source_field_name',  fieldFail, cde.source_field_name));
```

Add `buildSourceFieldReason` helper:

```js
function buildSourceFieldReason(fieldName, failCode, rawVal) {
  if (failCode === 'blank')  return fieldName + ' is blank';
  if (failCode === 'spaces') return fieldName + ' contains spaces — not a valid SQL identifier';
  // placeholder
  return fieldName + ' contains placeholder value \'' + (rawVal || '').trim() + '\'';
}
```

### 1.3 Add structured `checks` flags to each excluded item

The review UI needs boolean flags per check to render ✓/✗ columns without parsing reason
strings. Extend the `excluded` array items to include a `checks` object.

After computing `reasons`, build:

```js
const checks = {
  dbOk:          !dbFail,
  tableOk:       !tableFail,
  fieldOk:       !fieldFail,
  sqlOk:         /* existing sql_code present check */,
  placeholdersOk:/* existing all-three-placeholders check */,
  balancedOk:    /* existing balanced quotes/parens check */,
};
```

Push `{ allocation, rule, cde, cds, reasons, checks }` to `excluded`.

### 1.4 Extend `computeUploaderExclusions` return value

Add a second lookup structure the UI needs: for each failed allocation, the Agency and
Directorate chain must be resolvable. The function should also accept and return the lookup
maps it builds internally so the UI component does not need to rebuild them:

```js
return {
  included,
  excluded,        // now includes checks:{} per item
  totalEvaluated,
  cdsMap,          // re-export for UI use
  cdeMap,          // re-export for UI use
  ruleMap,         // re-export for UI use
};
```

The UI will build Agency and Directorate maps from `data` directly — keeping them out of the
validation function which should stay pure.

---

## Step 2 — Rewrite the review view in `232_uploader_export.js`

The settings view (`view === 'settings'`, lines 77–119) is **not changed**.

All changes are to `view === 'review'` (lines 121–273 in the current file).

### 2.1 Additional state

```js
const [overrides,      setOverrides]      = useState({});  // { [allocation_id]: boolean }
const [agencyExpanded, setAgencyExpanded] = useState({});  // { [agency_id]: boolean }
const [cdsExpanded,    setCdsExpanded]    = useState({});  // { [cds_id]: boolean }
```

Overrides default all false (all failed allocations excluded). Agency and CDS groups default
expanded (empty object = all expanded; `false` = collapsed for that id).

### 2.2 Additional lookup maps (added to existing useMemo blocks)

```js
const agencyMap = useMemo(() => {
  const m = {};
  for (const a of (data.executive_agency || [])) m[a.executive_agency_id] = a;
  return m;
}, [data]);

const dirMap = useMemo(() => {
  const m = {};
  for (const d of (data.directorate || [])) m[d.directorate_id] = d;
  return m;
}, [data]);
```

`cdsMap`, `cdeMap`, `ruleMap` already exist in the component.

### 2.3 Build grouped structure at render time

When `view === 'review'`, compute the grouped tree from `reviewResult.excluded`:

```
agencyGroups = Map<agency_id, { agency, cdsGroups: Map<cds_id, { cds, items[] }> }>
```

Where `items` are the `excluded` entries belonging to that CDS.

Items with an unresolvable Agency/CDS chain (orphaned CDEs or CDSs) are placed in a
synthetic "Unknown Agency / Unknown CDS" group so nothing is silently dropped.

### 2.4 Render structure

```
<div>
  {/* Headline */}

  {agencyGroups.map(agencyGroup => (
    <AgencyGroupRow>
      {agencyGroup.cdsGroups.map(cdsGroup => (
        <CdsGroupRow>
          <ColumnHeaders />
          {cdsGroup.items.map(item => (
            <AllocationRow />
          ))}
        </CdsGroupRow>
      ))}
    </AgencyGroupRow>
  ))}

  {/* Summary bar + action buttons */}
</div>
```

All of the above is inline JSX in `UploaderExportTab` — no new named sub-components are
extracted (keeps the single-file approach consistent with the rest of the codebase).

### 2.5 Agency group header row

```
▼/▶  {agency.agency_name || agency.agency_acronymn}  ({N} failed)    [ ☐ Select all ]
```

- Click on row (excluding checkbox) toggles `agencyExpanded[id]`
- Select All checkbox: `onChange` iterates all allocation IDs in this agency group and sets
  each to `true` in overrides. If already all ticked, unticks all. Tri-state not required —
  indeterminate state is a nice-to-have only.

### 2.6 CDS group header row (only rendered when parent agency is expanded)

```
  ▼/▶  {cds.data_set_name}  ({N} failed)    [ ☐ Select all ]
```

Same toggle and Select All pattern as Agency, scoped to this CDS's items.

### 2.7 Column headers row (only rendered when CDS is expanded)

One header row per CDS, rendered immediately above the first allocation row:

```
  CDE | Rule | DB | Table | Field | SQL | PH | Bal | Include?
```

Each of the 6 check column headers has a `title` attribute set to the tooltip text from the
design. `DB`, `Table`, `Field`, `SQL`, `PH`, `Bal` are the display labels.

### 2.8 Allocation row (only rendered when CDS is expanded)

```
  {cde.source_field_name} | {rule.rule_name} | ✓/✗ × 6 | ☐
```

Check mark rendering helper:

```js
function CheckMark(props) {
  return props.ok
    ? <span style={{ color:'var(--green)', fontWeight:700 }}>{'✓'}</span>
    : <span style={{ color:'var(--red)',   fontWeight:700 }}>{'✗'}</span>;
}
```

The Include? checkbox:

```js
<input type="checkbox"
  checked={!!overrides[allocId]}
  onChange={e => setOverrides(prev => ({ ...prev, [allocId]: e.target.checked }))} />
```

### 2.9 Summary bar (below all groups)

Computed values:

```js
const totalFailed     = reviewResult.excluded.length;
const totalOverridden = Object.values(overrides).filter(Boolean).length;
const totalExcluded   = totalFailed - totalOverridden;
```

Rendered as a row:

```
{totalFailed} failed  |  {totalOverridden} overridden to include  |  {totalExcluded} still excluded
```

"still excluded" shown in red when > 0, green when 0.

### 2.10 Action buttons

Export button label:

```js
const hasExclusions = (reviewResult.excluded.length - totalOverridden) > 0;
const confirmLabel  = exporting ? 'Exporting...' : (hasExclusions ? 'Export ZIP + receipt' : 'Export ZIP');
```

### 2.11 Update `handleConfirm`

Before building the ZIP, split `reviewResult.excluded` into:

```js
const overriddenItems = reviewResult.excluded.filter(item =>
  overrides[item.allocation.data_quality_rule_allocation_id]
);
const stillExcluded = reviewResult.excluded.filter(item =>
  !overrides[item.allocation.data_quality_rule_allocation_id]
);
```

`filteredData.data_quality_rule_allocation` includes:
- All of `reviewResult.included`
- All `overriddenItems.map(i => i.allocation)`

Receipt generation receives both `stillExcluded` and `overriddenItems`.

### 2.12 Update `buildUploaderReceipt` in `231_uploader_validation.js`

Signature changes to:

```js
function buildUploaderReceipt(excluded, overridden, totalEvaluated)
```

Add `_total_overridden` to the top-level fields. Add `overridden_allocations` array alongside
`excluded_allocations`, using the same shape but with a `known_failures` key (same content as
`reasons`) and a static `override_note` string.

Receipt is produced when `excluded.length > 0 || overridden.length > 0`.

---

## Step 3 — Reset override state when leaving review

In `handleConfirm` (on successful export completion) and in the Cancel button handler, reset:

```js
setOverrides({});
setAgencyExpanded({});
setCdsExpanded({});
```

This ensures a clean slate for the next export run.

---

## Step 4 — Manual testing checklist

Before marking complete:

- [ ] Zero failed allocations → confirm message shown, Export button enabled, no table rendered
- [ ] Failed allocations grouped correctly by Agency and CDS
- [ ] Agency collapse/expand works; CDS collapse/expand works independently
- [ ] Column headers appear per CDS section, with correct tooltips on hover
- [ ] ✓/✗ marks correct for each of the 6 check types
- [ ] TBD/TBC/To Be Confirmed in source fields shows ✗ on DB/Table/Field column
- [ ] Field with spaces in source name shows ✗ on DB/Table/Field column
- [ ] Include? checkbox toggles override; summary bar updates immediately
- [ ] Select All on Agency ticks all rows in all its CDS groups
- [ ] Select All on CDS ticks only rows in that CDS
- [ ] Individual checkboxes can be changed after a bulk-tick
- [ ] Export button label switches between "Export ZIP" and "Export ZIP + receipt"
- [ ] ZIP contains all allocation records (included + overridden); still-excluded records absent
- [ ] Receipt produced when exclusions or overrides exist; absent when neither exist
- [ ] Receipt `overridden_allocations` section populated correctly
- [ ] Cancel resets all override and expand state
- [ ] Orphaned CDE (missing CDS link) appears in "Unknown" group rather than crashing

---

## Estimated size

| File | Current lines | Expected after |
|------|--------------|----------------|
| `231_uploader_validation.js` | 143 | ~200 |
| `232_uploader_export.js` | 274 | ~430 |
