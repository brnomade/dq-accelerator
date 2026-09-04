# PLAN_RULE_COMBOBOX.md
## Searchable Rule Filter — Rule Allocation Panel

Paired with: `DESIGN_RULE_COMBOBOX.md`

---

## Scope

One file modified: `src/130_view_rule_allocation.js`

No new source files. No build template changes. No schema, context, or routing changes.

---

## Steps

### Step 1 — Add `ruleSearch` state and `ruleDisplayOpts` memo

In `RuleAllocationFormPanel`, after the existing `const [contextFilter, setContextFilter] = useState(true);` line, add:

```js
const [ruleSearch, setRuleSearch] = useState('');
```

After the `ruleOpts` memo, add:

```js
const ruleDisplayOpts = useMemo(() => {
  const q = ruleSearch.trim().toLowerCase();
  if (q.length < 3) return ruleOpts;
  return ruleOpts.filter(r =>
    (r.rule_name || '').toLowerCase().includes(q) ||
    (r.rule_explanation || '').toLowerCase().includes(q)
  );
}, [ruleOpts, ruleSearch]);
```

---

### Step 2 — Clear `ruleSearch` on context reset

In the three cascade-filter `onChange` handlers (Agency, Directorate, Data Set selects), add `setRuleSearch('')` alongside the existing `set('data_quality_rule_id', null)` calls. This ensures a stale search term does not carry over when the user navigates to a different CDS context.

Exact locations:
- Agency `onChange` (currently calls `setFilterAgencyId`, `setFilterDirId(null)`, `setFilterCdsId(null)`, `setContextFilter(true)`, then two `set()` calls) — append `setRuleSearch('')`
- Directorate `onChange` — same
- Data Set `onChange` — same

---

### Step 3 — Add search input above the Rule `<select>`

In the Rule section (Add mode branch, inside the `<>` fragment), directly before the existing `<select>`, insert:

```jsx
<div style={{ position:'relative' }}>
  <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
    color:'var(--text3)', width:14, height:14, pointerEvents:'none' }}>
    <Icon.Search/>
  </div>
  <input
    type="text"
    value={ruleSearch}
    onChange={e => setRuleSearch(e.target.value)}
    placeholder="Search rules..."
    style={{ ...inputBase, paddingLeft:32, border:'1px solid var(--border)' }}
  />
</div>
```

---

### Step 4 — Update the `<select>` to use `ruleDisplayOpts`

Change the existing `<select>` map from `ruleOpts` to `ruleDisplayOpts`:

```jsx
{ruleDisplayOpts.map(r => (
  <option key={r.data_quality_rule_id} value={r.data_quality_rule_id}>
    {r.rule_name}
  </option>
))}
```

---

### Step 5 — Add count hint and no-match notice

Between the `<select>` closing tag and the error/warning messages, insert:

```jsx
{(() => {
  const q = ruleSearch.trim();
  if (q.length < 3) return null;
  if (ruleDisplayOpts.length === 0) return (
    <div style={{ fontSize:11, color:'var(--text3)', marginTop:3, fontStyle:'italic' }}>
      No rules match search.
    </div>
  );
  if (ruleDisplayOpts.length < ruleOpts.length) return (
    <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>
      {ruleDisplayOpts.length} of {ruleOpts.length} rules match search
    </div>
  );
  return null;
})()}
```

---

### Step 6 — Verify behaviour

Manual browser checks:

1. **Search input idle** — select shows full ruleOpts list; behaviour identical to today.
2. **Type 1–2 chars** — no change to select options; count hint not shown.
3. **Type 3+ chars** — select options narrow to matching rules.
4. **Type query with no matches** — select shows only `-- select rule --`; "No rules match search" notice appears.
5. **Clear search input** — select returns to full list.
6. **FILTER toggle while search active** — `ruleDisplayOpts` recomputes; count hint updates; search text preserved.
7. **Change Agency/Directorate/Data Set** — search input clears; select returns to full ruleOpts for new context.
8. **Pick rule from narrowed list** — rule selected correctly; no regression on duplicate check, warnings, SQL preview.
9. **Edit mode** — rule field still renders as read-only label; search input not present.
10. **Validation** — error/warning messages still appear in correct position below select.

---

### Step 7 — Update CHANGELOG.md and SESSION_METRICS.md

Pre-generate build ID, write entries, then immediately run build.

---

### Step 8 — Run build

```bash
cd build && python build.py
```

---

### Step 9 — Update user documentation

Update the "How to add a rule allocation" guide page in `documentation/user-guide/` to describe the search input.
