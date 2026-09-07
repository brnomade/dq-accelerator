# DESIGN_RULE_COMBOBOX.md
## Searchable Rule Filter — Rule Allocation Panel

> **Superseded — build-20260904-1412.**
> The final implementation differs from this document. The CDS context filter (`contextFilter` / Filter button) described here was built and then retired in the same session. What shipped: a search input with a 3-character threshold, an always-visible × clear button, an always-visible rule count row, and the existing `<select>` showing all active rules with no automatic CDS filtering. See `KNOWN_ISSUES.md` KI-22 for the resolved-state description.

---

## Problem

The Rule `<select>` in `RuleAllocationFormPanel` (`130_view_rule_allocation.js`) becomes unwieldy as the rule library grows. The existing FILTER button reduces the pool, but even within a single CDS context a large number of rules can make scrolling through a native select impractical.

---

## Solution

Add a text search input directly above the existing Rule `<select>`. The select is preserved exactly as it is — it opens as a native dropdown, is scrollable, and behaves identically to today. The search input is optional: users who prefer to scroll the list can ignore it entirely. Users who want to narrow a long list type 3+ characters; the options inside the select are filtered in real time to only those rules whose `rule_name` or `rule_explanation` contain the typed text.

The FILTER button continues to constrain the option pool first. The text search then narrows within that pool.

---

## Scope

**Single file change:** `src/130_view_rule_allocation.js`

No new source files. No changes to constants, schema, context, or any other component.

---

## Layout — Rule section (Add mode only)

```
Rule  *
┌─────────────────────────────────────────────┐
│  🔍  Search rules...                        │   ← new text input
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  -- select rule --                       ▼  │   ← existing <select>, unchanged
└─────────────────────────────────────────────┘
3 of 12 rules match search                     ← new count hint (only when filtering)
[ Filter ]  Showing 12 of 47 rules...          ← existing button + hint, unchanged
```

Edit mode is unaffected — the rule is still shown as a read-only label.

---

## Behaviour

### Search input idle (< 3 characters typed or empty)

- The `<select>` receives the full `ruleOpts` array — identical to today.
- No count hint is shown.
- The user can open and scroll the select as normal without ever touching the search input.

### Search input active (3+ characters typed)

- A derived list `ruleDisplayOpts` is computed:
  ```
  ruleDisplayOpts = ruleOpts.filter(r =>
    rule_name contains query  OR  rule_explanation contains query
  )
  ```
  (case-insensitive substring match)
- The `<select>` is populated with `ruleDisplayOpts` instead of `ruleOpts`.
- A small count hint appears below the select: `"N of M rules match search"` where N = `ruleDisplayOpts.length`, M = `ruleOpts.length`.
- If `ruleDisplayOpts` is empty a "No rules match" notice replaces the count hint.
- The user clicks the select, sees the narrowed list, scrolls and picks as normal.

### Context resets

The search input is cleared (reset to `''`) whenever the CDS-level filter changes — i.e. when the Agency, Directorate, or Data Set dropdowns change — because those changes replace the entire rule context. The FILTER button toggle does **not** clear the search text; `ruleDisplayOpts` simply recomputes against the new pool automatically.

### FILTER button

Unchanged. Still shows/hides under `filterCdsId` being set. The `contextFilter` toggle and its hint text remain exactly as today. The text search and the FILTER constraint are independent and compose: FILTER first, text search second.

---

## State additions

One new state item in `RuleAllocationFormPanel`:

```js
const [ruleSearch, setRuleSearch] = useState('');
```

One new derived memo:

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

The `<select>` maps over `ruleDisplayOpts` instead of `ruleOpts`.

---

## Non-ASCII note

The search icon is rendered via `<Icon.Search/>` (existing SVG component) — no raw Unicode in JS source. Placeholder text uses only ASCII characters.
