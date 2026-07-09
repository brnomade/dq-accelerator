// ===============================================================================
// CDS FORM PANEL -- Add / Edit Critical Data Set
// Agency->Directorate cascade with no-directorate warning.
// Accepts __preAgencyId transient field; strips it before save.
// New mode: steward dropdown pre-filled with current user; saved as __stewardId.
// Edit mode: shows existing steward assignments read-only.
// ===============================================================================
function CdsFormPanel({ record, onSave, onClose, data, stewardIdentity }) {
  const isEdit = (data?.critical_data_set || []).some(r => r.critical_data_set_id === record?.critical_data_set_id);
  const accent = 'var(--green)';

  const [filterAgencyId, setFilterAgencyId] = useState(() => {
    if (record?.__preAgencyId != null) return record.__preAgencyId;
    if (record?.directorate_id) {
      const dir = (data?.directorate || []).find(d => d.directorate_id === record.directorate_id);
      return dir?.executive_agency_id ?? null;
    }
    return null;
  });

  const [values, setValues] = useState(() => {
    const v = { ...record };
    delete v.__preAgencyId;
    return v;
  });
  const [errors,          setErrors]          = useState({});
  const [stewardId,       setStewardId]       = useState(() => stewardIdentity?.id ?? null);
  const [pendingRemoveIds, setPendingRemoveIds] = useState(() => new Set());
  const [pendingAddId,     setPendingAddId]     = useState(null);
  const [addDropdownVal,   setAddDropdownVal]   = useState(null);

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

  const allStewards = useMemo(() =>
    (data?.data_steward || [])
      .filter(s => !s.retiring_timestamp)
      .sort((a, b) => (a.data_steward_name || '').localeCompare(b.data_steward_name || '')),
    [data]);

  // Stewardship records for this CDS (edit mode)
  const existingStewardships = useMemo(() => {
    if (!isEdit) return [];
    return (data?.stewardship || [])
      .filter(s => !s.retiring_timestamp && s.critical_data_set_id === record?.critical_data_set_id);
  }, [data, isEdit, record]);

  // Active assignments after pending removals
  const effectiveStewardships = useMemo(() =>
    existingStewardships.filter(s => !pendingRemoveIds.has(s.stewardship_id)),
    [existingStewardships, pendingRemoveIds]);

  // Steward IDs effectively assigned (including pending add) - used to filter dropdown
  const assignedStewardIds = useMemo(() => {
    const ids = new Set(effectiveStewardships.map(s => s.data_steward_id));
    if (pendingAddId) ids.add(pendingAddId);
    return ids;
  }, [effectiveStewardships, pendingAddId]);

  // Stewards available to add
  const availableStewards = useMemo(() =>
    allStewards.filter(s => !assignedStewardIds.has(s.data_steward_id)),
    [allStewards, assignedStewardIds]);

  const noDirectorates = !!filterAgencyId && filteredDirs.length === 0;

  const validate = () => {
    const errs = {};
    if (!values.directorate_id)        errs.directorate_id = 'Required';
    if (!values.data_set_name?.trim()) errs.data_set_name  = 'Required';
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const saved = { ...values };
    delete saved.__preAgencyId;
    saved.retiring_timestamp = null;
    if (!isEdit && stewardId) saved.__stewardId = stewardId;
    if (isEdit) {
      saved.__removeStewardshipIds = [...pendingRemoveIds];
      saved.__addStewardId = pendingAddId;
    }
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
      title={isEdit ? 'Edit CDS' : 'Add CDS'}
      subtitle="Critical Data Set"
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
        <Lbl text="Name" required={true} err={!!errors.data_set_name}/>
        <input type="text" value={values.data_set_name ?? ''} style={ibs(!!errors.data_set_name)}
          onChange={e => set('data_set_name', e.target.value || null)}/>
        <ErrMsg msg={errors.data_set_name}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Description" required={false} err={false}/>
        <textarea value={values.data_set_description ?? ''} rows={3}
          onChange={e => set('data_set_description', e.target.value || null)}
          style={{ ...ibs(false), resize: 'vertical', lineHeight: 1.5 }}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Subdivision" required={false} err={false}/>
        <input type="text" value={values.data_set_subdivision ?? ''}
          onChange={e => set('data_set_subdivision', e.target.value || null)}
          style={ibs(false)}/>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 14, marginBottom: 12 }}>
        <Lbl text={isEdit ? 'Stewards' : 'Steward'} required={false} err={false}/>
        {isEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {effectiveStewardships.length === 0 && !pendingAddId && (
              <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '2px 0 6px' }}>
                No stewards assigned
              </div>
            )}
            {effectiveStewardships.map(s => {
              const steward = (data?.data_steward || []).find(d => d.data_steward_id === s.data_steward_id);
              if (!steward) return null;
              return (
                <div key={s.stewardship_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 12, color: 'var(--text)', padding: '6px 10px',
                  background: 'var(--bg3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <span>
                    {steward.data_steward_name}
                    {steward.data_steward_title && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>{steward.data_steward_title}</span>
                    )}
                  </span>
                  <button type="button" title="Remove steward"
                    onClick={() => setPendingRemoveIds(prev => { const n = new Set(prev); n.add(s.stewardship_id); return n; })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)',
                      padding: '0 2px', lineHeight: 1, fontSize: 14, display: 'flex', alignItems: 'center' }}>
                    <Icon.X/>
                  </button>
                </div>
              );
            })}
            {pendingAddId && (() => {
              const steward = allStewards.find(s => s.data_steward_id === pendingAddId);
              return steward ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 12, color: 'var(--green)', padding: '6px 10px',
                  background: 'rgba(34,201,142,0.08)', borderRadius: 'var(--radius)',
                  border: '1px solid rgba(34,201,142,0.35)' }}>
                  <span>
                    {steward.data_steward_name}
                    {steward.data_steward_title && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>{steward.data_steward_title}</span>
                    )}
                    <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>(to be added)</span>
                  </span>
                  <button type="button" title="Cancel add"
                    onClick={() => { setPendingAddId(null); setAddDropdownVal(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)',
                      padding: '0 2px', lineHeight: 1, fontSize: 14, display: 'flex', alignItems: 'center' }}>
                    <Icon.X/>
                  </button>
                </div>
              ) : null;
            })()}
            {!pendingAddId && (
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <select value={addDropdownVal ?? ''} style={{ ...ibs(false), cursor: availableStewards.length ? 'pointer' : 'default', flex: 1 }}
                  disabled={availableStewards.length === 0}
                  onChange={e => setAddDropdownVal(e.target.value === '' ? null : parseInt(e.target.value, 10))}>
                  {availableStewards.length === 0
                    ? <option value="">-- all stewards assigned --</option>
                    : <>
                        <option value="">-- select steward to add --</option>
                        {availableStewards.map(s => (
                          <option key={s.data_steward_id} value={s.data_steward_id}>{s.data_steward_name}</option>
                        ))}
                      </>
                  }
                </select>
                <button type="button"
                  disabled={!addDropdownVal}
                  onClick={() => { if (addDropdownVal) { setPendingAddId(addDropdownVal); setAddDropdownVal(null); } }}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 'var(--radius)',
                    cursor: addDropdownVal ? 'pointer' : 'not-allowed',
                    background: addDropdownVal ? accent : 'var(--bg3)',
                    color: addDropdownVal ? '#fff' : 'var(--text3)',
                    fontFamily: 'var(--sans)', whiteSpace: 'nowrap' }}>
                  Add
                </button>
              </div>
            )}
          </div>
        ) : (
          <select value={stewardId ?? ''} style={{ ...ibs(false), cursor: 'pointer' }}
            onChange={e => setStewardId(e.target.value === '' ? null : parseInt(e.target.value, 10))}>
            <option value="">-- none --</option>
            {allStewards.map(s => (
              <option key={s.data_steward_id} value={s.data_steward_id}>{s.data_steward_name}</option>
            ))}
          </select>
        )}
      </div>

    </FormShell>
  );
}
