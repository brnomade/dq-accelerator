# DESIGN -- Agency Form with Inline Patron Association

## Goal

Extend the Add Agency / Edit Agency form panel to allow an optional data patron to be
created and associated in the same operation, instead of requiring a separate visit to the
Data Patron screen.

---

## Scope

| | Add mode | Edit mode |
|---|---|---|
| Agency fields (Type, Acronym, Name) | Editable | Editable |
| Existing patrons | n/a (new agency has none) | Read-only chips above the input section |
| Add new patron | Optional section (name, title, email, start date) | Same optional section |
| Remove an existing patron | Out of scope (separate backlog item) | Out of scope |

Patron creation is always optional. If the Name field is left blank, no patron record is
created even if Title or Email are filled in.

---

## New component: AgencyFormPanel

Replaces the generic `RecordFormPanel` for `executive_agency` in `240_app.js`.

### Agency section

| Field | Input | Required |
|---|---|---|
| Type | Dropdown from `executive_agency_type` (active only) | Yes |
| Acronym | Text | No |
| Name | Text | No |

Validation: Type is required (same as the generic form).

### Patron section (collapsible or always visible)

Rendered as a card below the agency fields, labelled "Data Patron (optional)".

| Field | Input | Required |
|---|---|---|
| Name | Text | Only if any patron field is filled |
| Title | Text | No |
| Email | Text | No |
| Start date | Date picker | Defaults to today; user can change |

If Name is blank on save, the entire patron section is ignored regardless of other fields.
If Name is filled and Start date is blank, default to today.

In Edit mode, a read-only "Current patrons" area shows existing active patron chips
(name + title) above the input section.

---

## Data flow

### Transient field

`AgencyFormPanel` passes one transient field through `onSave`:

```js
record.__newPatron = {
  name:      patronName.trim() || null,
  title:     patronTitle.trim() || null,
  email:     patronEmail.trim() || null,
  startDate: patronStartDate || todayIso,
}
// or null if patron section is empty
```

### App-level save handler: `handleAgencySave` in `240_app.js`

```js
const newPatron = record.__newPatron ?? null;
const agencyRecord = { ...record };
delete agencyRecord.__newPatron;

upsertRecord('executive_agency', agencyRecord);

if (newPatron?.name) {
  upsertRecord('data_patron', {
    data_patron_id:        nextPk('data_patron'),
    executive_agency_id:   agencyRecord.executive_agency_id,
    data_patron_name:      newPatron.name,
    data_patron_title:     newPatron.title || null,
    data_patron_email:     newPatron.email || null,
    assignment_start_date: newPatron.startDate,
    retiring_timestamp:    null,
  });
}

closeForm();
```

---

## Wiring change in `240_app.js`

Add a branch in the form panel render block for `formTable === 'executive_agency'`:

```jsx
formTable === 'executive_agency' ? (
  <AgencyFormPanel
    record={formRecord}
    onSave={handleAgencySave}
    onClose={closeForm}
    data={data}
    stewardIdentity={stewardIdentity}
  />
) : ...
```

---

## Out of scope

- Removing existing patrons from the edit panel (separate backlog item)
- Creating multiple patrons in a single form save (one at a time is sufficient)
- Selecting an existing patron to re-associate (patrons are per-agency; creation is the right model)

---

## Files changed

| File | Change |
|------|--------|
| `src/167_form_panel_agency.js` | New `AgencyFormPanel` component |
| `src/240_app.js` | Add `handleAgencySave`; add `executive_agency` branch in form panel render |
