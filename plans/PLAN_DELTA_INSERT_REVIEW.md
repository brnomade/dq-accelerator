# PLAN — Delta Import: Insert Review Panel

Paired with: `designs/DESIGN_DELTA_INSERT_REVIEW.md`

## Steps

### Step 1 — Update `applyMergedChanges` in `71_master_version.js`
- Add `insertSelections` as 4th parameter (default `null` for backwards compatibility)
- Filter `remappedInserts[tbl]` rows: keep only those where `insertSelections["tbl:pk"] !== false`
- If `insertSelections` is null/undefined, keep all inserts (unchanged behaviour)

### Step 2 — Update `buildMergeReport` in `71_master_version.js`
- Add `insertSelections` as 4th parameter
- Change insert tally to only count accepted inserts
- Add `inserts_summary` block to the returned report: `{ total_proposed, accepted, rejected, rejected_by_table }`

### Step 3 — Add `InsertTableGroup` component to `210_screen_import.js`
New component, rendered inside InsertReviewSection. Props:
`tableName, rows, selections, onToggleRow, onAcceptTable, onRejectTable`
- Group header: table name, insert count, selected badge (green=all, amber=partial, grey=none), Accept/Reject table buttons, expand/collapse toggle
- Collapsed by default
- Expanded: horizontal-scroll table — checkbox col, then all schema cols in order, then "Show all fields" button per row
- "Show all fields" expands an inline sub-row showing all fields as a 2-col field/value list

### Step 4 — Add `InsertReviewSection` component to `210_screen_import.js`
New component, rendered in DeltaMergePanel after conflict cards. Props:
`remappedInserts, selections, onToggleRow, onAcceptTable, onRejectTable, onAcceptAll, onRejectAll`
- Not rendered if total inserts is 0
- Section header: `"Inserts — [selected] of [total] selected"` with global Accept all / Reject all buttons
- Renders one InsertTableGroup per table with at least 1 insert

### Step 5 — Update `DeltaMergePanel` in `210_screen_import.js`
- Add `insertSelections` state initialised from `remappedInserts` (all true)
- Add handlers: `handleToggleRow`, `handleAcceptTable`, `handleRejectTable`, `handleAcceptAll`, `handleRejectAll`
- Render `InsertReviewSection` after conflict cards, before the Actions row
- Change `onApply()` call to `onApply(insertSelections)` — passes selections back to ImportScreen

### Step 6 — Update `handleApplyMerge` in `ImportScreen` (`210_screen_import.js`)
- Add `insertSelections` parameter to the callback
- Pass it to `applyMergedChanges` and `buildMergeReport`

## Files Changed
| File | Change |
|------|--------|
| `src/71_master_version.js` | Steps 1–2 |
| `src/210_screen_import.js` | Steps 3–6 |

## Non-ASCII safety notes
- Em dash in JSX: `{'—'}` inside JS expression, not raw `—`
- Expand/collapse indicators: use ASCII text `[+]` / `[-]` rather than unicode triangles
- No other special characters required

## No-change list
- SCHEMA, routing, localStorage, APP_TREE.md (no new files/screens/components added to sidebar)
- Apply button label stays: `Apply merge and download report`
- Conflict card behaviour unchanged
