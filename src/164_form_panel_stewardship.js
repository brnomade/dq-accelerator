// ===============================================================================
// STEWARDSHIP FORM PANEL -- Add / Edit Stewardship
// 3-level cascade: Agency (filter) -> Directorate (filter) -> Data Set (saved).
// ===============================================================================
function StewardshipFormPanel({ record, onSave, onClose, data }) {
  const isEdit = (data?.stewardship || []).some(r => r.stewardship_id === record?.stewardship_id);
  const accent = 'var(--green)';

  // Derive initial filter state from existing CDS when editing
  const initCds = record?.critical_data_set_id
    ? (data?.critical_data_set || []).find(c => c.critical_data_set_id === record.critical_data_set_id)
    : null;
  const initDir = initCds?.directorate_id
    ? (data?.directorate || []).find(d => d.directorate_id === initCds.directorate_id)
    : null;

  const [filterAgencyId, setFilterAgencyId] = useState(() => initDir?.executive_agency_id ?? null);
  const [filterDirId,    setFilterDirId]    = useState(() => initCds?.directorate_id ?? null);

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

  const filteredCdSets = useMemo(() => {
    if (!filterDirId) return [];
    return (data?.critical_data_set || [])
      .filter(c => !c.retiring_timestamp && c.directorate_id === filterDirId)
      .sort((a, b) => (a.data_set_name || '').localeCompare(b.data_set_name || ''));
  }, [data, filterDirId]);

  const stewards = useMemo(() =>
    (data?.data_steward || [])
      .filter(s => !s.retiring_timestamp)
      .sort((a, b) => (a.data_steward_name || '').localeCompare(b.data_steward_name || '')),
    [data]);

  const validate = () => {
    const errs = {};
    if (!values.critical_data_set_id) errs.critical_data_set_id = 'Required';
    if (!values.data_steward_id)      errs.data_steward_id      = 'Required';
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
      title={isEdit ? 'Edit Stewardship' : 'Add Stewardship'}
      subtitle="Stewardship"
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
            setFilterDirId(null);
            set('critical_data_set_id', null);
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
        <Lbl text="Directorate" required={false} err={false}/>
        <select value={filterDirId ?? ''} style={{ ...ibs(false), cursor: 'pointer' }}
          disabled={!filterAgencyId}
          onChange={e => {
            const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
            setFilterDirId(v);
            set('critical_data_set_id', null);
          }}>
          <option value="">-- select directorate --</option>
          {filteredDirs.map(d => <option key={d.directorate_id} value={d.directorate_id}>{d.directorate_name}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Data Set" required={true} err={!!errors.critical_data_set_id}/>
        <select value={values.critical_data_set_id ?? ''} style={{ ...ibs(!!errors.critical_data_set_id), cursor: 'pointer' }}
          disabled={!filterDirId}
          onChange={e => set('critical_data_set_id', e.target.value === '' ? null : parseInt(e.target.value, 10))}>
          <option value="">-- select data set --</option>
          {filteredCdSets.map(c => <option key={c.critical_data_set_id} value={c.critical_data_set_id}>{c.data_set_name}</option>)}
        </select>
        <ErrMsg msg={errors.critical_data_set_id}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Steward" required={true} err={!!errors.data_steward_id}/>
        <select value={values.data_steward_id ?? ''} style={{ ...ibs(!!errors.data_steward_id), cursor: 'pointer' }}
          onChange={e => set('data_steward_id', e.target.value === '' ? null : parseInt(e.target.value, 10))}>
          <option value="">-- select steward --</option>
          {stewards.map(s => <option key={s.data_steward_id} value={s.data_steward_id}>{s.data_steward_name}</option>)}
        </select>
        <ErrMsg msg={errors.data_steward_id}/>
      </div>

    </FormShell>
  );
}
