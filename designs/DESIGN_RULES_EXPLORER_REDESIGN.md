# Design: Rules Explorer Redesign

**Status:** Proposed — open questions resolved, pending final review  
**Replaces:** `DataQualityRuleView` in `src/110_view_rules.js`  
**Design pattern:** Mirrors the Data & Stewardship page (`141_view_cde_list.js`) exactly — same visual language, same expand/collapse mechanics, same counter style, same toolbar, same panel approach.

---

## 1. Purpose

Replace the current flat Rules Explorer (rule groups → rules → allocation list) with a deep hierarchical view that puts the **rule at the top** and drills down through the data ownership chain: Agencies → CDSs → Tables → CDEs → Allocations.

This gives stewards a way to answer "who is affected by this rule?" at a glance, and brings the Rules Explorer into visual and interaction parity with the Data & Stewardship page.

---

## 2. Hierarchy

```
Rule                          [collapsible — top level]
  Agency                      [collapsible]
    Critical Data Set (CDS)   [collapsible]
      Source Table            [collapsible]
        Critical Data Element [collapsible leaf]
          Rule Allocation     [inline panel — expanded under CDE]
```

Each Rule contains only the Agencies, CDSs, Tables, and CDEs that have at least one active allocation to that rule. A CDE appears under a rule only if `data_quality_rule_allocation` links them.

---

## 3. Page Layout

```
Header: | Rules Explorer   N rules · N allocations    [+ Add Rule]
Toolbar: [Search...] [My data] [Show retired]
Result count / empty state
Rule list (collapsible rows, vertical gap between each)
```

Accent colour for the rule level: `#4f8ef7` (blue — distinct from the green used in Data & Stewardship and purple used in profiling).

---

## 4. Level Specifications

### 4.1 Rule row (top level)

Visual: `border-left: 3px solid #4f8ef7` (live) or `3px solid var(--border)` (retired).

**Header row contents (left → right):**
- Chevron (rotates 90° when expanded)
- Rule name (mono, bold, `var(--text)`)
- Rule explanation (truncated, `var(--text3)`, smaller)
- `AUTOMATED` badge (amber) if `automated = true`
- Rule ID badge (muted, mono)
- Counter strip: `· N agencies · N CDEs · N allocations`
- Edit button (pencil icon) → opens `RuleFormPanel` in edit mode
- Retire / Restore toggle (eye-off / eye icon)

**Expanded content:** Agency rows for this rule.

**No "+ Add Allocation" at rule level** — allocations are added from the CDE level.

---

### 4.2 Agency row (second level)

Visual: `border-left: 3px solid #4f8ef780` (lighter blue), `background: var(--bg2)`.

**Header row contents:**
- Chevron
- Agency acronym (bold) + Agency name (muted, smaller)
- Counter strip: `· N CDSs · N CDEs · N allocations`

**Expanded content:** CDS rows for this agency within this rule.

---

### 4.3 CDS row (third level)

Visual: `border-left: 3px solid #4f8ef740`, `background: var(--bg2)`.

**Header row contents:**
- Chevron
- CDS name
- Counter strip: `· N tables · N CDEs · N allocations`

**Expanded content:** Table rows for this CDS within this rule.

---

### 4.4 Table row (fourth level)

Visual: `background: var(--bg)`, `border: 1px solid var(--border)`.

**Header row contents:**
- Chevron
- Table name (mono, bold) + `in database` (muted, smaller) — same `table in database` pattern as Data & Stewardship and Profiling
- Profiling badge (green `profiled` if field_profiling record exists for any field in this table; grey otherwise)
- Counter strip: `· N CDEs · N allocations`

**Expanded content:** CDE rows for this table within this rule/CDS.

---

### 4.5 CDE row (fifth level — collapsible leaf)

Visual: Same as CDE row in Data & Stewardship.

**Row contents (collapsed):**
- Chevron (always shown — every CDE here has exactly one allocation)
- Field name (mono, accent `#4f8ef7`)
- `profiled` badge (green, if field has a profiling record)
- Criticality badges (per criticality group — same amber chips as D&S)
- No action buttons at CDE level (allocation management is done at the allocation row)

**Expanded content:** One allocation row (see 4.6).

---

### 4.6 Allocation row (inline panel — expanded under CDE)

Visual: `background: var(--bg3)`, indented, matches D&S allocation row style.

**Row contents:**
- Dimension name (accent colour, mono)
- Frequency
- Bumper value (amber badge if set, grey dash if null)
- SQL buttons: `{ }` (copy sql_code) · `{ }` (copy sql_code_sample or DEF badge if null)
- Missing snapshot filter warning icon (amber ⚠) if sql_code_sample is null
- Edit button (pencil) → opens `CdeAllocFormPanel` in edit mode, pre-seeded with this allocation
- Retire / Restore toggle

**No "+ Add Allocation" at this level** — a CDE can only be allocated to a given rule once (duplicate check enforced in `CdeAllocFormPanel`).

---

## 5. Toolbar

```
[ Search...          ] [My data] [Show retired]
```

- **Search:** Filters across rule name, rule explanation, agency name/acronym, CDS name, table name, database name, CDE field name. A rule is shown if it or any of its descendant items match.
- **My data toggle:** When active, shows only rules that have at least one allocation to a CDE in a CDS assigned to the current steward. Greyed out if no steward identity set. Persisted in localStorage as `moj_dq_rulenav_scope_v1`.
- **Show retired:** Shows retired rules (with muted styling) and retired allocations. Hidden if no retired records exist.

---

## 6. Header

```
Rules Explorer                    N rules · N allocations    [+ Add Rule]
```

- **N rules**: count of live rules visible under current filter
- **N allocations**: count of live allocations visible under current filter
- **+ Add Rule**: opens `RuleFormPanel` in add mode (blank form) — carried over from current explorer

---

## 7. Data Assembly

A single `buildRuleHierarchy` function (pure, no side effects) takes:

```js
buildRuleHierarchy({
  rules, allocs, cdes, cdss, dirs, agencies,
  fieldProfiling, critsByGroup, critGroupsSorted,
  scopeCdsIds   // Set<id> | null — null means all data
})
```

Returns an array of rule objects, each containing:

```js
{
  rule,           // source rule record
  agencies: [     // agencies with allocations to this rule
    {
      agency,
      cdss: [
        {
          cds,
          tables: [
            {
              table, db, isProfiled,
              cdes: [
                {
                  cde, profiling, crits,
                  allocation   // the single allocation record for this CDE + rule
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  agencyCount, cdeCount, allocCount
}
```

Assembly steps:
1. Build lookup maps: `allocsByCdeId`, `cdeById`, `cdsById`, `dirById`, `agencyById`, `profilingByKey`, `critsByCdeId`
2. For each live rule, find its live allocations
3. For each allocation, resolve CDE → CDS → directorate → agency
4. If `scopeCdsIds` active, skip allocations whose CDS is not in scope
5. Group by rule → agency → CDS → table (from `cde.source_table_name + source_database_name`) → CDE
6. Compute rollup counts at each level

---

## 8. State

```js
const [search,       setSearch]       = useState('');
const [showRetired,  setShowRetired]  = useState(false);
const [myDataOnly,   setMyDataOnly]   = useState(/* from localStorage */);
const [expanded,     setExpanded]     = useState({});
const [rulePanel,    setRulePanel]    = useState(null);   // { record } | null
const [allocPanel,   setAllocPanel]   = useState(null);   // { record, isEdit, cdeId } | null
```

`expanded` keys follow the pattern:
- `rule_{rule_id}` — rule expanded
- `ag_{rule_id}_{agency_id}` — agency expanded within a rule
- `cds_{rule_id}_{cds_id}` — CDS expanded
- `tbl_{rule_id}_{cds_id}_{tableKey}` — table expanded
- `cde_{rule_id}_{cde_id}` — CDE allocation expanded

`toggleKey(key)` callback flips a single key in `expanded`.

---

## 9. Panels (reused unchanged)

| Panel | Trigger | Props |
|-------|---------|-------|
| `RuleFormPanel` | "+ Add Rule" button (add mode) or rule edit button (edit mode) | `record`, `onSave`, `onClose`, `nextPk`, `accent` |
| `CdeAllocFormPanel` | Allocation edit button (edit mode only at this level) | `record`, `isEdit`, `cdeId`, `onSave`, `onClose`, `data`, `accent` |

Both panels are rendered at App level (via `240_app.js`) or using `ReactDOM.createPortal` to avoid fixed-position issues.

> **Note:** From within the Rules Explorer, allocations are only edited or retired — never added fresh. The CDE already belongs to this rule, so there is no ambiguity about which rule is being allocated. Adding brand-new allocations (linking a new CDE to a rule) is possible from the Data & Stewardship page.

---

## 10. What Changes vs Today

| Aspect | Today | Proposed |
|--------|-------|----------|
| Entry point | Rule prefix groups → Rules → Flat allocation list | Rule → Agency → CDS → Table → CDE → Allocation |
| Hierarchy depth | 3 levels | 6 levels |
| Agency/CDS/Table context | Not shown | Explicit collapsible levels |
| Profiling status | Not shown | Profiling badge at Table and CDE level |
| Criticality | Not shown | Criticality chips at CDE level (same as D&S) |
| Prefix grouping | Yes (by first word before `-`) | Removed — rules are the top level |
| My data filter | No | Yes — same as D&S and Profiling page |
| Search | Rule name + explanation only | Rule name, explanation, agency, CDS, table, db, CDE field |
| + Add Allocation | Not available | Not available (allocation management stays in D&S) |
| Edit Rule | Pencil at rule card level | Pencil at rule row level — carried over |
| + Add Rule | Button in header | Button in header — carried over |
| Visual language | Custom rule cards | Matches Data & Stewardship exactly |

---

## 11. Component Plan

| Component | Description |
|-----------|-------------|
| `buildRuleHierarchy` | Pure data assembly function — returns nested rule objects |
| `RuleRow` | Top-level collapsible row for a single rule |
| `AgencyRow` | Collapsible agency row within a rule |
| `CdsRow` | Collapsible CDS row within an agency/rule |
| `TableRow` | Collapsible table row within a CDS/rule |
| `CdeRow` | Collapsible CDE leaf row with inline allocation panel |
| `RuleExplorerView` | Outer container — state, toolbar, search, hierarchy render |

All components live in `src/110_view_rules.js` (replaces current content).  
Reused without changes: `RuleFormPanel`, `CdeAllocFormPanel` (from `141_view_cde_list.js`).

---

## 12. Resolved Design Decisions

| Q | Decision |
|---|----------|
| 1 | Retired rules are **hidden** until the "Show retired" toggle is turned on. When shown, they render with muted styling. |
| 2 | **No new allocations from the Rules Explorer.** Adding a new allocation (linking a CDE to a rule) stays in the Data & Stewardship page, where the steward has full ownership context (agency → CDS → table → field) before committing. The Rules Explorer supports editing and retiring existing allocations only. |
| 3 | Rules with **zero allocations are shown** with an empty-state message beneath the header ("No allocations — this rule has not been assigned to any CDEs."). The primary purpose of the page is easy access and editing of all rules, not just allocated ones. |
| 4 | `110_view_rules.js` renamed to `145_view_rules.js` so it loads after `141_view_cde_list.js` and can reuse `CdeAllocFormPanel` without duplication. |
