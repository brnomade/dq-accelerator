# PLAN -- Agency Form with Inline Patron Association

Paired with: `designs/DESIGN_AGENCY_PATRON_FORM.md`

---

## Overview

Three files change. Implementation order matters: the new component file must come
before the wiring change in `240_app.js`.

| Step | File | Change |
|------|------|--------|
| 1 | `src/167_form_panel_agency.js` | New `AgencyFormPanel` component |
| 2 | `src/240_app.js` | Add `handleAgencySave`; wire `executive_agency` branch in form render |

---

## Step 1 -- Create `src/167_form_panel_agency.js`

New file. Numbered 167 so it loads after `163_form_panel_data_owner.js` (which it
patterns after) and before `240_app.js`.

### 1a. State

```js
function AgencyFormPanel({ record, onSave, onClose, data, stewardIdentity }) {
  const schema   = SCHEMA['executive_agency'];
  const accent   = '#18b4d4';
  const isEdit   = (data?.executive_agency || []).some(
    r => r.executive_agency_id === record?.executive_agency_id
  );

  // Today as YYYY-MM-DD (used as patron start date default)
  const todayIso = new Date().toISOString().slice(0, 10);

  // Agency fields
  const [agencyTypeId,  setAgencyTypeId]  = useState(record?.executive_agency_type_id ?? null);
  const [acronym,       setAcronym]       = useState(record?.agency_acronymn         ?? '');
  const [agencyName,    setAgencyName]    = useState(record?.agency_name              ?? '');

  // Patron fields
  const [patronName,      setPatronName]      = useState('');
  const [patronTitle,     setPatronTitle]     = useState('');
  const [patronEmail,     setPatronEmail]     = useState('');
  const [patronStartDate, setPatronStartDate] = useState(todayIso);

  const [errors, setErrors] = useState({});
```

### 1b. Existing patrons (edit mode)

```js
  const existingPatrons = useMemo(() => {
    if (!isEdit) return [];
    return (data?.data_patron || [])
      .filter(p => !p.retiring_timestamp && p.executive_agency_id === record?.executive_agency_id)
      .sort((a, b) => (a.data_patron_name || '').localeCompare(b.data_patron_name || ''));
  }, [data, isEdit, record]);
```

### 1c. Validation

Agency: `executive_agency_type_id` is required (matches `RecordFormPanel` logic).
Patron: if any patron field is filled, Name is required.

```js
  const validate = () => {
    const errs = {};
    if (!agencyTypeId) errs.agencyTypeId = 'Required';
    const patronAny = patronName.trim() || patronTitle.trim() || patronEmail.trim();
    if (patronAny && !patronName.trim()) errs.patronName = 'Name is required when adding a patron';
    return errs;
  };
```

### 1d. handleSave

Build `__newPatron` as a transient field; pass through `onSave`.

```js
  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const saved = {
      ...record,
      executive_agency_type_id: agencyTypeId,
      agency_acronymn:          acronym.trim()    || null,
      agency_name:              agencyName.trim() || null,
      retiring_timestamp:       null,
    };

    if (patronName.trim()) {
      saved.__newPatron = {
        name:      patronName.trim(),
        title:     patronTitle.trim()  || null,
        email:     patronEmail.trim()  || null,
        startDate: patronStartDate     || todayIso,
      };
    }

    onSave(saved);
  };
```

### 1e. Render structure

Inside `FormShell` (title: `isEdit ? 'Edit Agency' : 'Add Agency'`, accent `#18b4d4`):

1. **Agency section** heading label
2. Agency Type dropdown (active types only, `executive_agency_type` filtered by `!retiring_timestamp`)
3. Acronym text input
4. Name text input
5. _(Edit mode only)_ **Current patrons** read-only chip area — if `existingPatrons.length > 0`;
   each chip shows `name` + `title` in a small pill. If no patrons yet, show muted "None".
6. Divider / card: **Data Patron (optional)** section heading
7. Name text input (with required-if-any validation error)
8. Title text input
9. Email text input
10. Start date `<input type="date">` (pre-filled with `todayIso`)

### Styling notes

- Reuse `ibs(err)` inline-style helper (same pattern as `DataOwnerFormPanel`)
- Reuse `Lbl` / `ErrMsg` local helper components
- Patron card: `background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', marginTop: 16`
- Existing patron chips: `display: inline-flex, alignItems: center, gap: 6, padding: '3px 8px', background: 'var(--bg)', border: '1px solid var(--border2)', borderRadius: 20, fontSize: 11`

---

## Step 2 -- Wire `240_app.js`

### 2a. Add `handleAgencySave` callback (near `handleCdsSave`)

```js
  const handleAgencySave = useCallback((record) => {
    const newPatron = record.__newPatron ?? null;
    const agencyRecord = { ...record };
    delete agencyRecord.__newPatron;

    upsertRecord('executive_agency', agencyRecord);

    if (newPatron?.name) {
      upsertRecord('data_patron', {
        data_patron_id:        nextPk('data_patron'),
        executive_agency_id:   agencyRecord.executive_agency_id,
        data_patron_name:      newPatron.name,
        data_patron_title:     newPatron.title     || null,
        data_patron_email:     newPatron.email     || null,
        assignment_start_date: newPatron.startDate,
        retiring_timestamp:    null,
      });
    }

    closeForm();
  }, [upsertRecord, nextPk, closeForm]);
```

### 2b. Add `executive_agency` branch in form render

In the `{formRecord && formTable && (...)}` block, insert a new branch before the
fallthrough `RecordFormPanel`:

```jsx
) : formTable === 'executive_agency' ? (
  <AgencyFormPanel
    record={formRecord}
    onSave={handleAgencySave}
    onClose={closeForm}
    data={data}
    stewardIdentity={stewardIdentity}
  />
) : (
  <RecordFormPanel .../>
```

---

## Risks and constraints

| Risk | Mitigation |
|------|-----------|
| Non-ASCII characters in JS | Use only ASCII in the new file; no emoji, no smart quotes, no `\uXXXX` literals typed directly |
| `parseDateVal` availability | It is defined in `160_record_form_panel.js` (lower-numbered) — safe to call in 167 |
| `nextPk` called inside `handleAgencySave` | `nextPk` reads `data` at call time; the agency upsert updates state asynchronously. For the patron PK, call `nextPk('data_patron')` before `upsertRecord('executive_agency', ...)` fires a re-render — or inline the PK assignment before both upserts. Because both upserts run in the same callback, state hasn't updated between them, so `nextPk('data_patron')` must be captured first. |
| Edit mode: `executive_agency_id` on new patron | Use `agencyRecord.executive_agency_id` (already on the record); safe in both Add and Edit modes |

### PK capture order (important)

Call `nextPk('data_patron')` **before** `upsertRecord('executive_agency', ...)`:

```js
  const handleAgencySave = useCallback((record) => {
    const newPatron     = record.__newPatron ?? null;
    const patronPk      = newPatron?.name ? nextPk('data_patron') : null;   // capture first
    const agencyRecord  = { ...record };
    delete agencyRecord.__newPatron;

    upsertRecord('executive_agency', agencyRecord);

    if (newPatron?.name) {
      upsertRecord('data_patron', {
        data_patron_id:        patronPk,
        ...
      });
    }
    closeForm();
  }, [upsertRecord, nextPk, closeForm]);
```

---

## Verification checklist

- [ ] Add Agency: save with no patron -- agency row created, no patron row
- [ ] Add Agency: fill patron Name only -- patron row created with today's start date
- [ ] Add Agency: fill patron Title + Email but leave Name blank -- patron ignored
- [ ] Add Agency: leave Type blank -- validation error shown, save blocked
- [ ] Edit Agency: existing patrons shown as chips; adding new patron works
- [ ] Edit Agency: no patron section filled -- no new patron created
- [ ] Build passes with no non-ASCII errors
