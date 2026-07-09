# KNOWN_ISSUES.md

Tracks confirmed bugs deferred for later investigation.

Status labels: `open` · `investigating` · `fixed`

---

| #     | Status | Area | Summary |
|-------|--------|------|---------|
| KI-1  | fixed | PK namespace / identity | PK namespace not reset when user selects identity before becoming master |
| KI-2  | fixed | Header / master badge | Master badge does not appear after self-assigning as master on a fresh installation |
| KI-3  | open | Page titles / visual consistency | Colour accent marker on page titles is present on some screens but absent on others; no consistent colour logic |
| KI-4  | fixed | Table Profiling screen / copy | Subtitle counter reads "0 tables stored" -- should read "0 tables profiled" |
| KI-5  | fixed | Accessibility / theme | Dark colour scheme and 14 px base font cause readability difficulties for some users; no alternative theme available |
| KI-6  | open | Steward UX / identity state | +CDS and +CDE buttons inoperable after importing master Excel on a fresh session; reset-and-reassign identity required as workaround |
| KI-7  | open | Delta import / conflicts | Unexpected conflicts appear when steward delta is imported; believed to be a downstream consequence of KI-6 |
| KI-8  | open | PK namespace / uniqueness | Steward namespace boundary is displayed as N×1 000 000 but first usable ID is N×1 000 000+1; master global-max sequence can enter steward ranges if KI-1 has occurred |
| KI-9  | fixed | Delta import / conflict UI | Conflict cards show only changed fields; context fields that identify the record are absent, making side-by-side comparison harder than it should be |
| KI-10 | fixed | Delta sync / UX | No prompt or navigation shortcut to Export after a merge completes; master may forget to publish a new Master JSON |
| KI-11 | fixed | Delta sync / UX | No unsaved-changes warning when steward imports a new Master JSON; uncommitted local changes are silently lost |
| KI-12 | fixed | Delta sync / conflict detection | Master base snapshot is not updated after a delta merge; direct master edits post-merge may cause phantom conflicts in the next round |
| KI-13 | fixed | Delta sync / version safety | No version compatibility check on delta import; a delta based on a stale base version is accepted and merged without warning |
| KI-14 | open | Delta sync / multi-steward | Only one steward delta can be merged at a time; master must export a new Master JSON between each merge before the next steward can submit |
| KI-15 | fixed | The export configuration filename has a  '.' at the end and before the .zip suffix. |
| KI-16 | fixed | The export feature should give the user a chance to select a destination folder. The selected folder should be stored in the settings of the user so tht on the next export that folder is picked up as default (but the user has still a chance to modify before saving is done). |
| KI-17 | open | Is there a way for the export feature know what tables have been changed and give the chance to the user to just export the table that has modifications? |
| KI-18 | fixed | The Keep Master and Accept Master buttons on the reconciliation screen are too discreet and dark. It took me a while to find those. |
| KI-19 | deferred | The message for stewards to check their latest master didn't pop-up on the application start. |
| KI-20 | fixed | Bumpers should be from 1 to 5 only. |
| KI-21 | open | On the allocation, rules for other domains should be given a warning if picked up. |
| KI-22 | fixed (Option A) | On the allocation, the volume of rules will grow, need a better design for the view because the list box will grow very long. |
| KI-23 | open | Data steward believes that rules cannot be allocated to different quality dimensions. That is to avoid the stewards get confused by the same rule allocated |
| KI-24 | fixed | Profile should look at a snapshot and not the full table. |
| KI-25 | open | Delta sync / multi-steward | Only one steward delta can be merged at a time; master must export a new Master JSON between each merge before the next steward can submit |
| KI-26 | open | Delta sync / multi-steward | Only one steward delta can be merged at a time; master must export a new Master JSON between each merge before the next steward can submit |
| KI-27 | fixed | Rule Generator / cascade dropdowns | Directorate and data-set dropdowns disabled when agency or directorate has database ID = 0; JavaScript falsy check treated 0 as "nothing selected" |
| KI-28 | open | Data model / steward role classification | Lead steward identification on the Organisation page relies on a string match against `role_description` (contains "lead"). This is fragile — a dedicated boolean or role-class field on `steward_role_type` would make the distinction explicit and schema-driven. Enhancement to be evaluated. |
| KI-29 | open | Dashboard / Uncovered Dimensions | Clicking the "Uncovered Dimensions" action card navigates to the Rules Explorer, which is organised rule-first and gives no view of which dimensions are missing or which CDEs are uncovered for a given dimension. The steward cannot take any targeted action from there. The dimension coverage bar chart exists on the dashboard but is conditional (hidden when steward has no CDEs or quality_dimension table is empty) and is not actionable. Neither surface answers "for dimension X, which CDEs need a rule allocation?" |

---

## KI-2 — Master badge missing after master self-assignment on fresh install

**Status:** open  
**Area:** Header / identity state (Phase 1.5)

**Steps to reproduce (approximate -- exact sequence not yet confirmed):**
1. Fresh installation (no data in localStorage)
2. User registers themselves as master via the master version flow
3. Expected: header badge updates to show master status immediately
4. Actual: badge does not appear; the assignment appears to go unnoticed by the header component

**Root cause (confirmed -- same as KI-1):** The master badge is driven entirely by the `isMaster` computed value in `240_app.js`, which is `true` only when the master stewardship record (`critical_data_set_id = 0`) actually exists in `data.stewardship`. Because `upsertRecord` silently skips the insert (stale closure, `stewardIdentity = null`), that record is never created and `isMaster` stays `false`. KI-2 is therefore a symptom of KI-1's root cause, not an independent bug.

**Impact:** Visual -- user has no indication their designation succeeded. Compounded by the false-positive green success message (which fires unconditionally in `handleDesignateMaster` regardless of whether the insert occurred).

**Fix:** Resolved by the same `designateAsMaster` context function proposed in KI-1. No additional change needed for KI-2 once KI-1 is fixed.

---

## KI-1 — PK namespace not reset on late master promotion

**Status:** open  
**Area:** Identity / PK namespace (Phase 1.5)

**Confirmed reproduction sequence (tested 2026-06-18):**
1. Fresh installation (no data in localStorage)
2. Import the master Excel workbook
3. Open Settings, select steward identity, click Save identity -- green "Saved" confirmation appears; PK namespace shows steward range; yellow "designate me as master" box appears
4. Click "Yes, designate me as master"
5. Yellow box closes; green "Master steward record created successfully" message appears
6. **Actual:** PK namespace still shows the steward range; no master badge in header
7. Page refresh makes no difference -- state is the same after reload

**Root cause (confirmed by code analysis):**  
`isMaster` (`240_app.js:297`) is not a stored flag -- it is derived at runtime by checking whether `data.stewardship` contains a record with `critical_data_set_id = 0` and `data_steward_id === stewardIdentity.id`. For `isMaster` to become `true`, that record must actually be inserted and persisted.

`handleDesignateMaster` (`70_header_footer.js:78`) calls `upsertRecord('stewardship', {...})` to insert that record. However `upsertRecord` (`240_app.js`) gates on `stewardIdentity`:

```js
const upsertRecord = useCallback((tableName, record) => {
  if (!stewardIdentity) return;   // silent early return
```

When `handleDesignateMaster` runs, the `upsertRecord` captured from context still holds `stewardIdentity = null` in its closure -- the App has not yet completed the re-render triggered by the storage event from `saveStewardIdentity`. The stewardship record is never inserted. `setMasterSaved(true)` fires unconditionally after the call, showing a false-positive success message. Since nothing was written to `localStorage`, a page refresh cannot recover the state.

**Impact:**  
- Master designation silently fails every time the user sets their identity before clicking "designate me as master" in the same session.
- The only working sequence is to designate as master BEFORE selecting identity, which is not documented anywhere.
- False-positive green success message makes the failure invisible to the user.
- Master copy ends up with steward-namespaced PKs on all subsequently created records.

**Recommended fix:**  
Add a dedicated `designateAsMaster(stewardDsId)` callback to context that does not gate on `stewardIdentity` and inserts the master stewardship record directly using a global-max PK (not the steward namespace). SettingsPanel calls this instead of `upsertRecord`. This eliminates the stale closure entirely for this specific action.

```js
// 240_app.js -- new context function
const designateAsMaster = useCallback((stewardDsId) => {
  setData(prev => {
    const rows  = prev.stewardship || [];
    const maxPk = rows.reduce((m, r) => Math.max(m, r.stewardship_id ?? 0), 0);
    const rec   = { stewardship_id: maxPk + 1, critical_data_set_id: 0,
                    data_steward_id: stewardDsId, retiring_timestamp: null };
    const n = { ...prev, stewardship: [...rows, rec] };
    persist(n); return n;
  });
}, [persist]);
```

Expose via context; call from `handleDesignateMaster` in SettingsPanel replacing `upsertRecord`.

**Deferred:** Targeted one-function fix; low risk. Blocked only by explicit approval to implement.

---

## KI-3 — Page title colour accent marker is inconsistent across screens

**Status:** open  
**Area:** Visual design / page titles

**Observation:**
Some screens render a coloured vertical bar or accent to the left of the page title; others render the title with no accent. There is also no consistent logic governing which colour is used where one is present.

Screens with a colour accent: Rule Generator, RAG Simulator, CDE Coverage  
Screens without: Dashboard, Rule Assistant, Export, Import

**Desired outcome:**
- Every top-level screen should have a colour accent on its page title
- A clear colour convention should be decided before implementing, for example:
  - A single accent colour (`var(--accent)`) applied uniformly to all page titles, OR
  - Category-based colouring that mirrors the sidebar group accents (e.g. DQ group colour for rule-related screens, ownership group colour for org/stewardship screens, neutral accent for utility screens such as Import/Export)
- Once the convention is agreed the fix is mechanical: update each screen's `page-title` markup to include the accent element consistently

**Deferred:** Colour convention decision needed before implementing. Low effort to fix once decided.

---

## KI-4 — Table Profiling screen copy errors

**Status:** open  
**Area:** Table Profiling screen (`200_screen_ddl.js`) / copy

**Observation (a):** The subtitle counter beneath the page title reads "N tables stored". Should read "N tables profiled".

**Observation (b):** The empty state (no profiles added yet) shows two lines: "No DDLs stored yet." followed by "Click Add Table to paste your first CREATE TABLE statement". The first line should be removed -- the second line alone is sufficient and more accurate.

**Status note:** Both strings were removed in a prior refactor of `ProfilingView` (`200_screen_ddl.js`). The subtitle now reads "{N} tables · {N} fields in scope" and the empty state reads "No fields in scope. Add CDEs to your Directorate to get started." No further change required.

---

## KI-5 — Dark colour scheme and small font reduce readability for some users

**Status:** fixed (font-size uplift only; light theme and --text3 contrast remain open)  
**Area:** Accessibility / theme (`00_styles.css`)

**Observation:**  
All backgrounds are very dark: `--bg: #0f1117`, `--bg2: #161b27`, `--bg3: #1e2535`. The base body font-size is **14 px**. Secondary and tertiary text colours (`--text2: #8492b4`, `--text3: #4e5e80`) produce low contrast against these dark backgrounds — `--text3` on `--bg3` fails WCAG AA. There is no light theme, high-contrast mode, or font-size override available anywhere in the application.

**Impact:**  
- Users with visual impairments, colour sensitivity, or working on low-brightness displays find the screen difficult to read.  
- 14 px body text is below the recommended 16 px minimum for extended reading.  
- `--text3` (labels, PK namespace readout, column headers) may be functionally invisible in poor lighting conditions.

**Considered approaches:**
1. **Font-size uplift (low effort):** Raise base font-size from 14 px to 16 px in `00_styles.css`. Labels and secondary text proportionally larger with no layout breaking. Lowest effort, highest immediate benefit.
2. **Light theme toggle (medium effort):** Add a `data-theme="light"` attribute to `<html>` and override CSS custom properties under that selector. The settings panel already has a toggle area; a theme button could sit alongside the logo upload section. Requires auditing ~20 colour tokens; layout unchanged.
3. **High-contrast mode (medium effort):** A separate `data-theme="hc"` variant using near-white text on near-black, eliminating the tertiary colour entirely. Useful alongside option 2 rather than instead of it.

**Recommendation:** Start with font-size uplift (option 1) as a standalone fix, then plan the light theme (option 2) for a subsequent iteration. These are independent changes.

**Deferred:** Colour convention for the light theme palette needs agreement before implementing option 2. Font-size uplift can proceed immediately if approved.

---

## KI-6 — +CDS / +CDE buttons inoperable after Excel master import on a fresh session

**Status:** open  
**Area:** Steward UX / identity state (`240_app.js`, `70_header_footer.js`, `150_view_cds_dir.js`, `141_view_cde_list.js`)

**Steps to reproduce (approximate — exact sequence not yet confirmed):**
1. Fresh start (no localStorage data).
2. Steward sets their identity via Settings (selects their name from the `data_steward` dropdown).
3. Steward imports the master Excel workbook.
4. After import, the +CDS and +CDE action buttons appear disabled or unresponsive.
5. Workaround: open Settings, clear identity, re-select it — buttons then work.

**Root cause (hypothesis):**  
`canEdit` in `240_app.js` (line 312) is defined as `!!stewardIdentity`. The buttons are gated solely on this flag. `stewardIdentity` is initialised from `localStorage.getItem(STEWARD_IDENTITY_KEY)` at App mount (`useState(() => loadStewardIdentity())`), and subsequently updated only via a `window.storage` event listener.

The Settings panel writes the identity to localStorage and then dispatches `window.dispatchEvent(new Event('storage'))` (line 22 of `70_header_footer.js`). This synthetic event should trigger the listener in `240_app.js` (lines 291–295) and refresh `stewardIdentity`. However, **if the master Excel import is processed after this dispatch but causes a full `setData` re-render that also re-reads the stewardship table**, `isMaster` is recomputed against the newly imported data. If the imported dataset does not contain a `stewardship` record with `critical_data_set_id === 0` and the steward's `data_steward_id`, `isMaster` flips to `false`. Although this does not affect `canEdit` directly, the `nextPk` logic branches on `!isMaster`, and there may be a downstream interaction where the form callbacks (`openCdeForm`, `openCdsForm`) hold stale closures over the previous `stewardIdentity` value if the synthetic storage event and the import `setData` call race.

A second hypothesis is that the steward's `data_steward_id` stored in `stewardIdentity` does not match the ID in the imported Excel (e.g. the master assigned a different numeric PK for that steward), causing FK lookup failures inside the form that silently abort the open operation.

**Impact:**  
- Stewards in a fresh session cannot create new CDS or CDE records without a manual workaround (reset and reassign identity), losing time and risking data loss if they proceed without realising the buttons are failing.  
- Likely root cause of KI-7: if a steward works around KI-6 by resetting identity mid-session, records created before and after the reset will carry inconsistent ID namespaces.

**Deferred:** Requires a controlled reproduction run with browser devtools open to confirm which of the two hypotheses applies. The fix is a targeted change to either: (a) pass `setStewardIdentityState` through context so Settings can update App state directly without relying on the storage event, or (b) add a post-import step that re-validates and re-applies the stored identity against the newly loaded `data_steward` table.

**See also:** `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` — this issue is documented as Gap G6 in the delta sync workflow design.

---

## KI-7 — Unexpected conflicts during steward delta import; provenance of conflicting records unclear

**Status:** open  
**Area:** Delta import / conflicts (`71_master_version.js`, `210_screen_import.js`)

**Observation:**  
When a steward's delta ZIP is imported by the master steward, some records surface as conflicts even though neither party recalls editing those records. The steward cannot explain how or when the conflicting changes were made.

**Root cause (hypothesis):**  
This is believed to be a downstream consequence of KI-6. If a steward's identity was not properly set when they created records (buttons appeared to work after the workaround reset), some records may have been created using the master global-max sequence (`nextPk` without namespace prefix) rather than the steward namespace. When the delta is built (`buildDelta` in `71_master_version.js`), those records appear as insertions with IDs that may already exist in the master dataset, generating unexpected conflict signals. Additionally, if the steward reset their identity mid-session, the same logical record may appear in the delta with two different PK values (one from before the reset, one after), producing a phantom duplicate.

A secondary hypothesis: the base snapshot saved at import time (`saveBaseSnapshot`) may have been written with an empty or partial dataset if the import occurred before data was fully committed to `localStorage`. Subsequent delta comparison would then treat all records as new insertions rather than unchanged baseline records.

**Impact:**  
- Conflicts the master steward cannot resolve confidently, requiring out-of-band communication with the steward to determine the correct value.  
- Possible silent data corruption if the master steward resolves conflicts using incorrect assumptions about provenance.

**Deferred:** Resolution depends on fixing KI-6 first and then running a clean end-to-end test. If phantom conflicts persist after KI-6 is fixed, a separate investigation into snapshot timing will be required.

---

## KI-8 — Steward PK namespace: boundary off-by-one and potential master-sequence bleed

**Status:** open  
**Area:** PK namespace / uniqueness (`240_app.js` line 134, `70_header_footer.js` line 258)

**Findings:**

**Finding A — Off-by-one in namespace filter:**  
The `nextPk` function filters rows using `> ns` (exclusive lower bound), so the first ID actually issued is `ns + 1`, not `ns`. The Settings UI displays the range as `N×1 000 000 – N×1 000 000 + 999 999`, which implies `N×1 000 000` is usable, but it never will be. This is a display inconsistency, not a data integrity risk, but it can confuse stewards checking their range.

```js
// 240_app.js line 143–144 — lower bound is exclusive
.filter(r => (r[pk] ?? 0) > ns && (r[pk] ?? 0) < ns + 1000000)
```

**Finding B — Master global-max sequence can enter steward namespace ranges:**  
The master `nextPk` path returns `rows.reduce((m, r) => Math.max(m, r[pk]) , 0) + 1` — the global maximum across all records plus one. If the KI-1 scenario has occurred (master holds records with steward-namespace PKs from before promotion), those high-numbered PKs become part of the global maximum. Subsequent master inserts will continue from that high point and may land inside another steward's declared range. Example: master data contains IDs up to `2 500 000` (steward 2's range) due to KI-1; master creates a new record and receives PK `2 500 001`, which is inside steward 2's range and will collide with steward 2's next insert.

**Finding C — Ranges are otherwise non-overlapping by construction:**  
For distinct positive-integer steward IDs, ranges `[N×1M+1, N×1M+999 999]` are mathematically disjoint. There is no steward-vs-steward collision risk in normal operation.

**Impact:**  
- Finding A: cosmetic / confusing documentation only.  
- Finding B: data integrity risk in any deployment where KI-1 has occurred. Steward inserts and master inserts can produce the same PK, causing silent overwrites or spurious delta conflicts.

**Recommended fix for Finding B:** After global-max PK is computed for a master insert, skip past any steward namespace boundary:  
```js
// pseudocode
let pk = globalMax + 1;
// advance past steward ranges: any ID in [X*1M+1, X*1M+999999] is reserved
while (pk % 1000000 !== 0 && pk > 1000000) pk = Math.ceil(pk / 1000000) * 1000000 + 1;
```
Alternatively, reserve the first million IDs (0–999 999) exclusively for master use and ensure master records never receive steward-range IDs.

**Deferred:** Fix for Finding B should be paired with the KI-1 fix to avoid recurring.

---

## KI-9 — Delta conflict cards show only changed fields; full record context not visible

**Status:** open  
**Area:** Delta import / conflict UI (`210_screen_import.js` lines 10–14, 51–81)

**Observation:**  
When an UPDATE conflict is displayed in `DeltaConflictCard`, `diffCols` is computed as only the columns where the master and steward values differ:

```js
// 210_screen_import.js line 10–13
const diffCols = type === 'update'
  ? (schema.cols || []).filter(col =>
      col.name !== pkField &&
      String(masterRow[col.name] ?? '') !== String(stewardRow[col.name] ?? ''))
  ...
```

Only those differing columns are rendered in the side-by-side panel. The card header shows the table name and PK number (e.g. "Data Quality Rule #2000015") but no identifying label fields. For records with opaque numeric PKs, this provides no human-readable context about which specific record is being resolved.

**Example:** A `data_quality_rule` update conflict shows only the `rule_sql` column changed. The master steward sees the old and new SQL but has no visible `rule_name`, `quality_dimension_id`, or `critical_data_element_id` to understand which rule this is or what it applies to without looking it up separately.

**Impact:**  
- Master steward must open a separate table view in another browser tab to identify the conflicting record by PK before making a resolution decision.  
- Increases error rate during conflict resolution; users may accept or reject changes without full context.

**Recommended fix:**  
Add a "context row" above the diff columns showing the first two or three non-PK, non-datetime schema columns regardless of whether they differ, styled distinctly (e.g. muted grey, no highlight) to separate them from the actual diff. For UPDATE conflicts retain current colour coding (green = steward change) only for differing columns. For RETIRE conflicts the existing "up to 4 columns" display is reasonable but should also prioritise label/name fields over arbitrary column order.

Optionally add a collapsible "Show all fields" toggle on each card so an expert user can inspect the full record without the extra UI always being visible.

**Effort:** Low — the data is already present in `masterRow` and `stewardRow`; the change is purely in how `diffCols` is constructed and rendered.

**Fixed:** Context columns (up to 3 non-PK, non-datetime identifying fields) now appear above the diff section in muted colour. A "Show all fields / Hide fields" toggle in the card footer expands to show every field; in the steward panel changed fields remain green and unchanged fields are muted. RETIRE cards gain the same toggle for the master record side.

---

## KI-10 — No prompt to export Master JSON after a delta merge completes

**Status:** open  
**Area:** Delta sync / UX (`210_screen_import.js`)

**Observation:**  
After the master applies a delta merge, the app shows a post-merge summary card (total inserted / updated / retired / conflicts resolved) and a single "Import another file" button. There is no prompt, call-to-action, or navigation shortcut guiding the master to export a new Master JSON. The master must remember to navigate to Export manually.

**Impact:**  
If the master forgets step 7 of the workflow, stewards continue working from the previous version. Their next delta will be based on an outdated base snapshot, increasing the likelihood of spurious conflicts.

**Recommended fix:**  
Add a secondary action button to the post-merge summary card: "Export new Master JSON" that triggers the same export handler as the Export screen, or navigates directly to Export with a visual cue.

**See also:** `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` — documented as Gap G1.

---

## KI-11 — No unsaved-changes warning when steward imports a new Master JSON

**Status:** open  
**Area:** Delta sync / UX (`210_screen_import.js`)

**Observation:**  
When a steward imports a new Master JSON, their entire local dataset is immediately replaced and the base snapshot is reset. Any changes made since their last delta export are silently discarded. No warning is shown and there is no opportunity to export a delta first.

**Impact:**  
A steward who imports a new Master JSON without first exporting their delta permanently loses all uncommitted work with no recovery path.

**Recommended fix:**  
Before processing a master JSON import, compare the current data against the stored base snapshot (using `buildDelta`). If any changes are detected, show a warning modal: "You have N uncommitted changes. Export your delta before importing, or proceed and lose these changes." Provide "Export delta first" and "Import anyway" actions.

**See also:** `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` — documented as Gap G2.

---

## KI-12 — Master base snapshot not updated after a delta merge

**Status:** open  
**Area:** Delta sync / conflict detection (`210_screen_import.js`, `71_master_version.js`)

**Observation:**  
When the master applies a delta merge (`applyMergedChanges`), the merged data is written to localStorage via `onMerge`. However, `saveBaseSnapshot` is not called — the master's base snapshot remains the one recorded when they last imported a master JSON or Excel file.

**Impact:**  
If the master makes direct edits to the dataset after a merge (before exporting and re-importing the new Master JSON), those edits are invisible to the base snapshot. When the next steward delta arrives, the conflict detection sees those master edits as baseline, treating unchanged steward records as conflicting. This produces phantom conflicts.

**Recommended fix:**  
After `applyMergedChanges` completes, call `saveBaseSnapshot(buildSnapshot(mergedData))` to bring the master's snapshot up to date with the merged state.

**See also:** `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` — documented as Gap G3.

---

## KI-13 — No version compatibility check on delta import

**Status:** open  
**Area:** Delta sync / version safety (`210_screen_import.js`)

**Observation:**  
When a steward delta is imported, `payload._base_version` is displayed in the merge panel but never validated against the master's current base version (`loadBaseVersion()`). A delta built against `master-20260601-001` will be accepted and processed even if the master is now at `master-20260618-003`.

**Impact:**  
Stale deltas produce unreliable conflict detection. Records the steward never touched may appear as conflicts because the base snapshot they used no longer reflects the master's current state. The master has no indication the delta is out of date.

**Recommended fix:**  
At delta import time, compare `payload._base_version` against `loadBaseVersion()`. If they differ, show a warning before proceeding: "This delta was built against version X; your current version is Y. Conflicts may be unreliable. Proceed?" This does not block the merge but ensures the master is aware.

**See also:** `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` — documented as Gap G4.

---

## KI-14 — Only one steward delta can be merged per master cycle

**Status:** open  
**Area:** Delta sync / multi-steward (`71_master_version.js`, `210_screen_import.js`)

**Observation:**  
The conflict detection algorithm compares a steward's changes against the master's current data and the base snapshot. After one merge is applied, the master's data changes. If a second steward's delta (also based on the original base version) is imported immediately after, the conflict detection baseline is now the post-merge data, not the original snapshot both stewards worked from. This means the second delta may produce spurious conflicts for records the first steward already changed.

The only safe workflow is: merge steward A → export new Master JSON → steward B imports new version → steward B re-exports delta → master merges steward B's delta.

**Impact:**  
In a team with multiple stewards, the master must run a full export-distribute-wait cycle between each steward's contribution. There is no way to batch-merge multiple deltas in a single session.

**Recommended fix:**  
Not straightforward to fix without a multi-delta merge architecture. A partial mitigation is to update the base snapshot after each merge (KI-12), so the second delta's conflicts are at least computed against the post-first-merge state rather than a stale snapshot. Full resolution requires rethinking the conflict detection model for multi-steward concurrent edits.

**See also:** `designs/DESIGN_DELTA_SYNC_WORKFLOW.md` — documented as Gap G5.

---

## KI-22 — Add Allocation panel: rule dropdown becomes unmanageably long at scale

**Status:** fixed (Option A implemented; Option B parked in backlog as KI-22-B)
**Area:** Rule Allocation / Add Allocation panel (`130_view_rule_allocation.js`)

**Observation:**
The rule `<select>` in `RuleAllocationFormPanel` listed every non-retired rule in the database, sorted alphabetically. As rule volumes grow (generic rules + per-CDS rules across multiple agencies), the list becomes impractically long and makes selection error-prone.

**Root cause:**
`ruleOpts` was computed as all non-retired rules with no context-aware filtering.

### Option A — CDS-context filter (implemented)

When the user selects a Data Set in the cascading CDE selector, the rule dropdown now filters to show only:
- **Generic rules** — rules whose name has no ` - ` separator, or whose prefix does not match any known CDS name
- **CDS-specific rules** — rules whose name follows the `CDS_NAME - Rule Name` pattern, where `CDS_NAME` matches the selected Data Set name

If no CDS is selected yet, all rules are shown (unchanged behaviour).

A muted hint below the dropdown shows the active filter count: "Showing X of Y rules -- generic + [CDS name] rules only".

Changing the agency, directorate, or data set now also resets any previously selected rule, keeping the form consistent.

**Relies on naming convention:** Rules must follow `CDS_NAME - Rule Name` for CDS-specific classification. Rules not matching this pattern are treated as generic and always shown.

### Option B — Expandable tree picker (parked)

A richer alternative: replace the flat `<select>` with a two-level expandable tree showing group headings (Generic, LPA, OPG Investigations, etc.) that expand to reveal individual rules. This would work regardless of CDS context and would be discoverable even from the top-level "Add record" button.

**Why parked:** 3-4x the implementation effort of Option A; requires a custom interactive widget with keyboard navigation and scroll-into-view on edit pre-selection. Deferred until Option A proves insufficient at production rule volumes.

**Backlog entry:** Phase 1 — Feature KI-22-B.

---

## KI-19 — Steward startup reminder to check for a new Master JSON

**Status:** deferred  
**Area:** Delta sync / steward UX

**Observation:**  
When a steward opens the app, there is no reminder to check whether the master has published a new Master JSON before they start making changes. Working from a stale base version increases the likelihood of conflicts in the next delta cycle.

**Investigation finding (2026-06-19):**  
This feature was **never implemented**. There is no startup notification, banner, or toast anywhere in the codebase. The issue was logged as a desired behaviour observed to be missing, not as a regression of something that previously worked.

**Why deferred:**  
A pop-up on every page refresh would be annoying and likely to be dismissed without being read, defeating its purpose. A better trigger or delivery mechanism needs to be decided before implementing.

**Options to consider before implementing:**
1. **Once-per-session dismissable banner** — show a top-of-content banner on first render of the session only (in-memory flag, gone on dismiss, reappears on next page load). Still fires on every refresh, which is the concern.
2. **Once-per-master-version** — record the last Master JSON version the steward acknowledged in localStorage; only show the reminder when a newer master version is detected in the imported data. Requires the steward to have imported at least one master to populate the version key.
3. **Passive indicator** — instead of a pop-up, show a persistent but non-intrusive badge or icon in the header when the steward's base version is older than N days, linking to the Import screen.
4. **No automatic reminder** — rely on the workflow documentation and the master steward to communicate when a new version is available out-of-band (e.g. email, Teams message).

**Recommended approach:** Option 3 (passive indicator) or Option 4. Decide before implementing.
