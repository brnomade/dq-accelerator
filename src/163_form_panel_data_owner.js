// ===============================================================================
// DATA OWNER FORM PANEL -- Add / Edit Data Owner
// Agency->Directorate cascade; directorate_id is saved, agency is a filter only.
// ===============================================================================
function DataOwnerFormPanel({ record, onSave, onClose, data }) {
  const isEdit = (data?.data_owner || []).some(r => r.data_owner_id === record?.data_owner_id);
  const accent = '#18b4d4';

  const [filterAgencyId, setFilterAgencyId] = useState(() => {
    if (record?.directorate_id) {
      const dir = (data?.directorate || []).find(d => d.directorate_id === record.directorate_id);
      return dir?.executive_agency_id ?? null;
    }
    return null;
  });

  const [values, setValues] = useState({ ...record });
  const [errors, setErrors] = useState({});

  const set = (field, val) => {
    setValues(prev => ({ ...prev, [field]: val }));
    setErrors(prev => ({ ...prev, [field]: null }));
  };

  const agencies = useMemo(() =>
    (data?.executive_agency || [])
      .filter(a => !a.retiring_timestamp)
      .sort((a, b) => (a.agency_acronymn || '').localeCompare(b.agency_acronymn || '')),
    [data]);

  const filteredDirs = useMemo(() => {
    if (!filterAgencyId) return [];
    return (data?.directorate || [])
      .filter(d => !d.retiring_timestamp && d.executive_agency_id === filterAgencyId)
      .sort((a, b) => (a.directorate_name || '').localeCompare(b.directorate_name || ''));
  }, [data, filterAgencyId]);

  const noDirectorates = !!filterAgencyId && filteredDirs.length === 0;

  const validate = () => {
    const errs = {};
    if (!values.directorate_id)              errs.directorate_id        = 'Required';
    if (!values.data_owner_name?.trim())     errs.data_owner_name       = 'Required';
    if (!values.data_owner_title?.trim())    errs.data_owner_title      = 'Required';
    if (!values.assignment_start_date)       errs.assignment_start_date = 'Required';
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const saved = { ...values, retiring_timestamp: null };
    onSave(saved);
  };

  const ibs = (err) => ({
    width: '100%', padding: '7px 10px', fontSize: 13, background: 'var(--bg3)',
    border: `1px solid ${err ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: 'var(--radius)', color: 'var(--text)',
    fontFamily: 'var(--sans)', outline: 'none',
  });

  const ErrMsg = ({ msg }) => !msg ? null : (
    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}><Icon.Warning/></span>
      {msg}
    </div>
  );

  const Lbl = ({ text, required, err }) => (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
      color: err ? 'var(--red)' : 'var(--text2)', marginBottom: 4, letterSpacing: '0.03em' }}>
      {text}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
    </label>
  );

  return (
    <FormShell
      title={isEdit ? 'Edit Data Owner' : 'Add Data Owner'}
      subtitle="Data Owner"
      accent={accent}
      saveLabel={isEdit ? 'Save' : 'Add'}
      onSave={handleSave}
      onClose={onClose}>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Agency" required={false} err={false}/>
        <select value={filterAgencyId ?? ''} style={{ ...ibs(false), cursor: 'pointer' }}
          onChange={e => {
            const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
            setFilterAgencyId(v);
            set('directorate_id', null);
          }}>
          <option value="">-- select agency --</option>
          {agencies.map(a => (
            <option key={a.executive_agency_id} value={a.executive_agency_id}>
              {a.agency_acronymn} - {a.agency_name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Directorate" required={true} err={!!errors.directorate_id}/>
        {noDirectorates ? (
          <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--amber)',
            background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)',
            borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flexShrink: 0 }}><Icon.Warning/></span>
            No directorates defined for this agency. Add a directorate first.
          </div>
        ) : (
          <select value={values.directorate_id ?? ''} style={{ ...ibs(!!errors.directorate_id), cursor: 'pointer' }}
            onChange={e => set('directorate_id', e.target.value === '' ? null : parseInt(e.target.value, 10))}>
            <option value="">-- select directorate --</option>
            {filteredDirs.map(d => <option key={d.directorate_id} value={d.directorate_id}>{d.directorate_name}</option>)}
          </select>
        )}
        <ErrMsg msg={errors.directorate_id}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Name" required={true} err={!!errors.data_owner_name}/>
        <input type="text" value={values.data_owner_name ?? ''} style={ibs(!!errors.data_owner_name)}
          onChange={e => set('data_owner_name', e.target.value || null)}/>
        <ErrMsg msg={errors.data_owner_name}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Title" required={true} err={!!errors.data_owner_title}/>
        <input type="text" value={values.data_owner_title ?? ''} style={ibs(!!errors.data_owner_title)}
          onChange={e => set('data_owner_title', e.target.value || null)}/>
        <ErrMsg msg={errors.data_owner_title}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Email" required={false} err={false}/>
        <input type="text" value={values.data_owner_email ?? ''} style={ibs(false)}
          onChange={e => set('data_owner_email', e.target.value || null)}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Start date" required={true} err={!!errors.assignment_start_date}/>
        <input type="date" value={parseDateVal(values.assignment_start_date)} style={ibs(!!errors.assignment_start_date)}
          onChange={e => set('assignment_start_date', e.target.value || null)}/>
        <ErrMsg msg={errors.assignment_start_date}/>
      </div>

    </FormShell>
  );
}
