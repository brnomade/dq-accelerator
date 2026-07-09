// ===============================================================================
// AGENCY FORM PANEL -- Add / Edit Executive Agency with optional inline patron
// Patron section: toggle between creating a new patron or reactivating a retired one.
// ===============================================================================
function AgencyFormPanel({ record, onSave, onClose, data, stewardIdentity }) {
  const accent = '#18b4d4';
  const isEdit = (data?.executive_agency || []).some(
    r => r.executive_agency_id === record?.executive_agency_id
  );

  const todayIso = new Date().toISOString().slice(0, 10);

  // Agency fields
  const [agencyTypeId, setAgencyTypeId] = useState(record?.executive_agency_type_id ?? null);
  const [acronym,      setAcronym]      = useState(record?.agency_acronymn ?? '');
  const [agencyName,   setAgencyName]   = useState(record?.agency_name ?? '');

  // Patron section mode: 'none' | 'new' | 'existing'
  const [patronMode, setPatronMode] = useState('none');

  // Create-new patron fields
  const [patronName,      setPatronName]      = useState('');
  const [patronTitle,     setPatronTitle]     = useState('');
  const [patronEmail,     setPatronEmail]     = useState('');
  const [patronStartDate, setPatronStartDate] = useState(todayIso);

  // Select-existing patron fields
  const [selectedPatronId,   setSelectedPatronId]   = useState(null);
  const [reassignStartDate,  setReassignStartDate]  = useState(todayIso);

  // Patron IDs marked for removal (unlink from agency on save)
  const [removedPatronIds, setRemovedPatronIds] = useState([]);
  const removePatron = (id) => setRemovedPatronIds(prev => [...prev, id]);

  const [errors, setErrors] = useState({});

  const clearErr = (key) => setErrors(prev => ({ ...prev, [key]: null }));

  const agencyTypes = useMemo(() =>
    (data?.executive_agency_type || [])
      .filter(t => !t.retiring_timestamp)
      .sort((a, b) => (a.executive_agency_type_description || '').localeCompare(b.executive_agency_type_description || '')),
    [data]);

  // Active patrons already assigned to this agency (shown as read-only chips in edit mode)
  const existingPatrons = useMemo(() => {
    if (!isEdit) return [];
    return (data?.data_patron || [])
      .filter(p => !p.retiring_timestamp && p.executive_agency_id === record?.executive_agency_id)
      .sort((a, b) => (a.data_patron_name || '').localeCompare(b.data_patron_name || ''));
  }, [data, isEdit, record]);

  // Active patrons with no agency assignment yet -- available for selection
  const availablePatrons = useMemo(() =>
    (data?.data_patron || [])
      .filter(p => !p.retiring_timestamp && !p.executive_agency_id)
      .sort((a, b) => (a.data_patron_name || '').localeCompare(b.data_patron_name || '')),
    [data]);

  const validate = () => {
    const errs = {};
    if (!agencyTypeId) errs.agencyTypeId = 'Required';
    if (patronMode === 'new' && !patronName.trim()) errs.patronName = 'Name is required';
    if (patronMode === 'existing' && !selectedPatronId) errs.selectedPatronId = 'Select a patron';
    return errs;
  };

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

    if (patronMode === 'new' && patronName.trim()) {
      saved.__newPatron = {
        name:      patronName.trim(),
        title:     patronTitle.trim()  || null,
        email:     patronEmail.trim()  || null,
        startDate: patronStartDate     || todayIso,
      };
    }

    if (patronMode === 'existing' && selectedPatronId) {
      const existingP = (data?.data_patron || []).find(p => p.data_patron_id === selectedPatronId);
      if (existingP) {
        saved.__reassignPatron = {
          ...existingP,
          executive_agency_id:   saved.executive_agency_id,
          retiring_timestamp:    null,
          assignment_start_date: reassignStartDate || todayIso,
        };
      }
    }

    if (removedPatronIds.length > 0) {
      saved.__removePatrons = existingPatrons
        .filter(p => removedPatronIds.includes(p.data_patron_id))
        .map(p => ({ ...p, executive_agency_id: null }));
    }

    onSave(saved);
  };

  const ibs = (err) => ({
    width: '100%', padding: '7px 10px', fontSize: 13, background: 'var(--bg3)',
    border: '1px solid ' + (err ? 'var(--red)' : 'var(--border)'),
    borderRadius: 'var(--radius)', color: 'var(--text)',
    fontFamily: 'var(--sans)', outline: 'none',
  });

  const Lbl = ({ text, required, err }) => (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
      color: err ? 'var(--red)' : 'var(--text2)', marginBottom: 4, letterSpacing: '0.03em' }}>
      {text}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
    </label>
  );

  const ErrMsg = ({ msg }) => !msg ? null : (
    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}><Icon.Warning/></span>
      {msg}
    </div>
  );

  const SectionLabel = ({ text }) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
      color: accent, marginBottom: 10, marginTop: 4 }}>
      {text}
    </div>
  );

  const modeBtn = (mode, label) => (
    <button
      onClick={() => { setPatronMode(mode); setErrors({}); }}
      style={{
        flex: 1, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
        background: patronMode === mode ? accent : 'var(--bg3)',
        color: patronMode === mode ? '#fff' : 'var(--text2)',
        border: '1px solid ' + (patronMode === mode ? accent : 'var(--border)'),
        borderRadius: 'var(--radius)', fontFamily: 'var(--sans)', fontWeight: 500,
      }}>
      {label}
    </button>
  );

  return (
    <FormShell
      title={isEdit ? 'Edit Agency' : 'Add Agency'}
      subtitle={null}
      accent={accent}
      saveLabel={isEdit ? 'Save' : 'Add'}
      onSave={handleSave}
      onClose={onClose}>

      <SectionLabel text="Agency"/>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Type" required={true} err={!!errors.agencyTypeId}/>
        <select value={agencyTypeId ?? ''} style={{ ...ibs(!!errors.agencyTypeId), cursor: 'pointer' }}
          onChange={e => {
            const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
            setAgencyTypeId(v);
            clearErr('agencyTypeId');
          }}>
          <option value="">-- select type --</option>
          {agencyTypes.map(t => (
            <option key={t.executive_agency_type_id} value={t.executive_agency_type_id}>
              {t.executive_agency_type_description}
            </option>
          ))}
        </select>
        <ErrMsg msg={errors.agencyTypeId}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Acronym" required={false} err={false}/>
        <input type="text" value={acronym} style={ibs(false)}
          onChange={e => setAcronym(e.target.value)}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Name" required={false} err={false}/>
        <input type="text" value={agencyName} style={ibs(false)}
          onChange={e => setAgencyName(e.target.value)}/>
      </div>

      {/* Patron section */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 16 }}>
        <SectionLabel text="Data Patron (optional)"/>

        {isEdit && existingPatrons.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)',
              marginBottom: 6, letterSpacing: '0.03em' }}>
              Current patrons
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {existingPatrons
                .filter(p => !removedPatronIds.includes(p.data_patron_id))
                .map(p => (
                  <div key={p.data_patron_id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 6px 3px 10px', background: 'var(--bg)', fontSize: 11,
                    border: '1px solid var(--border2)', borderRadius: 20, color: 'var(--text2)',
                  }}>
                    <span style={{ fontWeight: 600 }}>{p.data_patron_name}</span>
                    {p.data_patron_title && (
                      <span style={{ color: 'var(--text3)' }}>{p.data_patron_title}</span>
                    )}
                    <button onClick={() => removePatron(p.data_patron_id)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, padding: 0, cursor: 'pointer',
                      background: 'transparent', border: 'none',
                      color: 'var(--text3)', borderRadius: '50%',
                      flexShrink: 0,
                    }}>
                      <Icon.X/>
                    </button>
                  </div>
                ))
              }
              {existingPatrons.every(p => removedPatronIds.includes(p.data_patron_id)) && (
                <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>None</div>
              )}
            </div>
          </div>
        )}

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {modeBtn('none',     'Skip')}
          {modeBtn('new',      'Create new')}
          {modeBtn('existing', 'Select existing')}
        </div>

        {patronMode === 'new' && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 14px' }}>

            <div style={{ marginBottom: 12 }}>
              <Lbl text="Name" required={true} err={!!errors.patronName}/>
              <input type="text" value={patronName} style={ibs(!!errors.patronName)}
                onChange={e => { setPatronName(e.target.value); clearErr('patronName'); }}/>
              <ErrMsg msg={errors.patronName}/>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Lbl text="Title" required={false} err={false}/>
              <input type="text" value={patronTitle} style={ibs(false)}
                onChange={e => setPatronTitle(e.target.value)}/>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Lbl text="Email" required={false} err={false}/>
              <input type="text" value={patronEmail} style={ibs(false)}
                onChange={e => setPatronEmail(e.target.value)}/>
            </div>

            <div style={{ marginBottom: 4 }}>
              <Lbl text="Start date" required={false} err={false}/>
              <input type="date" value={parseDateVal(patronStartDate)} style={ibs(false)}
                onChange={e => setPatronStartDate(e.target.value || todayIso)}/>
            </div>

          </div>
        )}

        {patronMode === 'existing' && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '12px 14px' }}>

            {availablePatrons.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '4px 0' }}>
                No active patrons available for assignment.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Lbl text="Patron" required={true} err={!!errors.selectedPatronId}/>
                  <select value={selectedPatronId ?? ''} style={{ ...ibs(!!errors.selectedPatronId), cursor: 'pointer' }}
                    onChange={e => {
                      const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
                      setSelectedPatronId(v);
                      clearErr('selectedPatronId');
                    }}>
                    <option value="">-- select patron --</option>
                    {availablePatrons.map(p => (
                      <option key={p.data_patron_id} value={p.data_patron_id}>
                        {p.data_patron_name}
                        {p.data_patron_title ? ' - ' + p.data_patron_title : ''}
                      </option>
                    ))}
                  </select>
                  <ErrMsg msg={errors.selectedPatronId}/>
                </div>

                <div style={{ marginBottom: 4 }}>
                  <Lbl text="New start date" required={false} err={false}/>
                  <input type="date" value={parseDateVal(reassignStartDate)} style={ibs(false)}
                    onChange={e => setReassignStartDate(e.target.value || todayIso)}/>
                </div>
              </>
            )}

          </div>
        )}

      </div>

    </FormShell>
  );
}
