# PLAN — KI-9: Conflict Card Context & Show All Fields

Paired design: `designs/DESIGN_KI9_conflict_card_context.md`

## File changed

`src/210_screen_import.js` — `DeltaConflictCard` function only (lines 1–101)

---

## Steps

### Step 1 — Add `showAll` local state

Inside `DeltaConflictCard`, after existing destructuring:

```js
const [showAll, setShowAll] = useState(false);
```

### Step 2 — Compute `contextCols` (UPDATE only)

After `diffCols` is computed, derive context columns:

```js
const diffColNames = new Set(diffCols.map(c => c.name));
const contextCols = type === 'update'
  ? (schema.cols || [])
      .filter(col => col.name !== pkField && col.type !== 'datetime' && !diffColNames.has(col.name))
      .slice(0, 3)
  : [];
```

### Step 3 — Compute `allCols` (Show All mode)

```js
const allCols = (schema.cols || []).filter(col => col.name !== pkField);
```

### Step 4 — Replace side-by-side grid rendering

#### Master panel

- If `showAll`: render `allCols` — values in `var(--text1)` for all
- If `!showAll` and UPDATE:
  - Render `contextCols` (values in `var(--text2)`, label in `var(--text3)`)
  - Render a section divider ("CHANGED") if `diffCols.length > 0`
  - Render `diffCols` (existing style: label `var(--text3)`, value `var(--text1)`)
- If `!showAll` and RETIRE: existing 4-col rendering (unchanged)

#### Steward panel (UPDATE)

- If `showAll`: render `allCols`
  - If col is in `diffColNames`: value in `#22c98e` green
  - Otherwise: value in `var(--text2)` muted
- If `!showAll`: render `contextCols` (values muted) + divider + `diffCols` (existing green)

#### Steward panel (RETIRE)

Unchanged — always shows amber retirement message regardless of `showAll`.

### Step 5 — Add toggle button to footer

In the resolution-buttons `<div>`, add a right-aligned toggle button after the existing two buttons:

```jsx
<button className="btn btn-ghost"
  style={{ fontSize:11, padding:'3px 10px', marginLeft:'auto' }}
  onClick={() => setShowAll(s => !s)}>
  {showAll ? 'Hide fields ▲' : 'Show all fields ▼'}
</button>
```

(`▲` = ▲, `▼` = ▼ — avoids non-ASCII characters per build constraint)

---

## Acceptance criteria

- UPDATE card (showAll=false): up to 3 context cols visible above diff, muted; diff cols below with green steward values
- UPDATE card (showAll=true): all fields visible; changed steward values green, unchanged muted
- RETIRE card (showAll=false): existing behaviour unchanged
- RETIRE card (showAll=true): all master fields visible on left; right panel still shows retirement message
- Toggle button label updates correctly between states
- No non-ASCII characters introduced (build will reject)
- Build and manual test in browser before marking done
