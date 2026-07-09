# PLAN — KI-10 + KI-11: Delta Sync UX Safety

See also: `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` (Gaps G1, G2)

Both changes are in `src/210_screen_import.js` only.

---

## KI-10 — Prompt to export Master JSON after merge

**Problem:** Post-merge summary card has only "Import another file". No path to Export.

**Fix:**
- Add `navigate` to `useApp()` destructure in `ImportScreen`
- Add "Export new Master JSON" primary button to the post-merge summary card that calls
  `navigate({ screen:'export', table:null })`
- Demote "Import another file" to a ghost button alongside it

---

## KI-11 — Uncommitted-changes warning before master JSON import

**Problem:** Importing a master JSON silently overwrites uncommitted local changes.

**Fix (three parts):**

**Part A — new state:**
```js
const [pendingMasterImport, setPendingMasterImport] = useState(null);
```

**Part B — intercept in `handleFile` (master JSON branch):**
Before processing the import, check for uncommitted changes:
```js
const snapshot = loadBaseSnapshot();
if (snapshot && data) {
  const changes     = buildDelta(data, snapshot);
  const totalChanges = Object.values(changes)
    .reduce((s, c) => s + c.inserted.length + c.updated.length + c.retired.length, 0);
  if (totalChanges > 0) {
    setImporting(false);
    setPendingMasterImport({ payload, totalChanges });
    return;
  }
}
// proceed as normal
```

**Part C — new render branch** (after `mergeReport` check, before `deltaResult` check):
Shows an amber warning card with the change count and three actions:
- **Go to Export first** → `navigate({ screen:'export', table:null })` — steward can export delta before overwriting
- **Import anyway** → applies the master JSON import inline (same logic as normal flow, adds a warn log entry)
- **Cancel** → `setPendingMasterImport(null)` → returns to standard import view

---

## Acceptance criteria

- Post-merge summary shows "Export new Master JSON" as primary CTA; "Import another file" remains as secondary
- Clicking "Export new Master JSON" navigates to the Export screen
- Importing a master JSON with no base snapshot (fresh install) proceeds without warning
- Importing a master JSON when no uncommitted changes exist proceeds without warning
- Importing a master JSON when uncommitted changes exist shows the warning card with correct count
- "Import anyway" completes the import and includes a warn-level log entry
- "Cancel" returns to the standard import drop zone
- Build passes clean
