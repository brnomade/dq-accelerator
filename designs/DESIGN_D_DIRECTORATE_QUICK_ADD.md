# DESIGN D — Directorate Quick-Add Button per Agency Row

**Feature:** Per-agency "+ Add" shortcut on the Directorate screen  
**Status:** Draft — awaiting user approval  
**Date:** 2026-06-19

---

## 1. Problem Statement

The Directorate screen groups directorates under their parent agency. When a user is viewing a specific agency's block and wants to add a new directorate to it, they must:

1. Click the top-level "Add record" button
2. Manually select the correct agency from the dropdown

This is unnecessary friction when the agency context is already visually established. The user is looking at Agency X and wants to add a directorate under it — the agency should be pre-filled automatically.

---

## 2. Proposed Solution

Add a small `+ Add` button to the **right end of each agency header row**. Clicking it opens the existing `RecordFormPanel` slide-in panel with `executive_agency_id` pre-populated to that agency. All other fields remain blank and editable.

---

## 3. UX Specification

### 3.1 Button Placement

The agency header row is a flex container (currently `alignItems: 'baseline'`):

```
[ AGENCY_ACRONYM ]  [ agency_name ]  ... margin-auto ...  [ N directorates ]
```

The new button sits to the right of the directorate count, **within the same flex row**:

```
[ AGENCY_ACRONYM ]  [ agency_name ]  ... margin-auto ...  [ N directorates ]  [ + Add ]
```

The `marginLeft: 'auto'` currently lives on the count span. It stays there — the count and the button both sit on the right, with a small gap between them. The alignment needs to change from `alignItems: 'baseline'` to `alignItems: 'center'` so the button aligns properly with the text.

### 3.2 Button Styling

- **Class:** `btn btn-ghost`  
- **Size:** `fontSize: 10, padding: '2px 8px'`  (matches the Edit/Retire micro-buttons in sub-rows)
- **Icon:** `<Icon.Plus/>` followed by the text ` Add`
- **Colour:** inherits ghost styling — no accent fill, just a subtle border on hover
- **Tooltip:** `title="Add a new directorate to this agency"` (shows on hover via native browser tooltip)
- **Disabled state:** Wrapped in `{...dp}` — same disabled/opacity treatment as all other edit controls when no steward identity is set

### 3.3 Interaction

1. User hovers the button — native tooltip appears: `"Add a new directorate to this agency"`
2. User clicks — the `RecordFormPanel` slides in from the right (same animation as the top-level "Add record" button)
3. Panel opens with:
   - `directorate_id` — auto-assigned next PK (non-editable display)
   - `executive_agency_id` — **pre-selected** to the clicked agency (the dropdown shows the agency acronym)
   - All other fields (`directorate_acronymn`, `directorate_name`, `directorate_level`, `retiring_timestamp`) — blank/null
4. User fills in remaining fields and saves. The new directorate appears in the correct agency block immediately.

### 3.4 Visual Mockup (text representation)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ▌ HMCTS   HM Courts & Tribunals Service          3 directorates   [+ Add]       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  [ CSD ]  Courts and Service Delivery                          [edit] [retire]   │
│  [ OPS ]  Operations                                           [edit] [retire]   │
│  [ STS ]  Strategy                                             [edit] [retire]   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Technical Design

### 4.1 Pre-fill Mechanism

The `RecordFormPanel` (generic component in `160_record_form_panel.js`) renders all fields from `SCHEMA.directorate.cols`. FK fields with a value already in the record are displayed as pre-selected dropdowns — no special handling is needed.

The pre-fill simply creates a blank record and overwrites the FK field directly:

```js
const openAddForAgency = (agencyId) => {
  const blank = buildBlankRecord('directorate', nextPk, data);
  openForm('directorate', { ...blank, executive_agency_id: agencyId });
};
```

This is distinct from the `__preAgencyId` hint pattern used in `150_view_cds_dir.js` — that pattern was needed because the CDS form is a specialised panel that consumed the hint separately. For directorates, the generic panel directly renders the FK value as a dropdown, so direct assignment works cleanly.

### 4.2 Files Changed

| File | Change |
|------|--------|
| `src/151_view_directorate.js` | Only file changed |

**Specific changes inside `151_view_directorate.js`:**

1. **Add `openAddForAgency` function** (alongside the existing `openAdd` and `openEdit` at lines 16–17):
   ```js
   const openAddForAgency = (agencyId) => {
     const blank = buildBlankRecord('directorate', nextPk, data);
     openForm('directorate', { ...blank, executive_agency_id: agencyId });
   };
   ```

2. **Change agency header `alignItems`** from `'baseline'` to `'center'` (line 115) so the button vertically aligns with the text.

3. **Add the button** inside the agency header flex row, after the directorate count span (line 122–125):
   ```jsx
   <button {...dp} className="btn btn-ghost"
     style={{ fontSize:10, padding:'2px 8px', marginLeft:8, flexShrink:0 }}
     title="Add a new directorate to this agency"
     onClick={() => openAddForAgency(agencyId)}>
     <Icon.Plus/> Add
   </button>
   ```

### 4.3 No Ripple Effects

- No schema changes
- No context changes
- No new components
- The `RecordFormPanel` is unchanged — it already handles pre-filled FK values correctly
- The top-level "Add record" button is unchanged and remains for use when no specific agency context is needed

---

## 5. Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| No steward identity set | Button is visible but disabled (opacity 0.35, no pointer events) — same as all other edit controls via `{...dp}` |
| Agency with zero visible directorates (all retired, `showRetired` off) | The agency block does not appear in the grouped list, so the button is not shown — no orphan button |
| Agency with zero directorates (new agency, nothing added yet) | An agency with no directorates at all does not appear in the grouped list (grouped is built from directorate rows). The per-agency button is therefore not reachable for a brand-new empty agency — the top-level "Add record" button remains the entry point in that case. This is acceptable; once the first directorate is added the agency block appears and the shortcut button becomes available. |
| User changes the agency dropdown in the panel after opening | Fully supported — the panel is editable; the pre-fill is a default, not a lock |

---

## 6. Out of Scope

- Adding a similar quick-add button on other screens (e.g., executive_agency view) — separate feature request
- Locking the agency field when opened via the shortcut button — not needed; user should always be able to correct a mistaken click
- Keyboard shortcut for the per-agency add action

---

## 7. Acceptance Criteria

- [ ] A `+ Add` button appears at the right of every agency header row on the Directorate screen
- [ ] Hovering the button shows the tooltip `"Add a new directorate to this agency"`
- [ ] Clicking the button opens the slide-in RecordFormPanel with the correct agency pre-selected in the Agency dropdown
- [ ] All other fields in the panel are blank/null (normal new-record defaults)
- [ ] The button is disabled (opacity, no pointer events) when no steward identity is set
- [ ] The top-level "Add record" button is unchanged and still works
- [ ] No visual regression on the directorate sub-rows or overall screen layout
