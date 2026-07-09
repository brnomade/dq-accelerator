// ===============================================================================
// WEIGHT FORM PANEL -- Add / Edit Criticality Group Weight or Quality Dimension Weight
// Shared panel for both tables. Filters group/dimension dropdown to unassigned only.
// ===============================================================================
function WeightFormPanel({ tableName, record, onSave, onClose, data }) {
  const schema        = SCHEMA[tableName];
  const isEdit        = (data?.[tableName] || []).some(r => r[schema.pk] === record?.[schema.pk]);
  const accent        = 'var(--amber)';
  const isCritGroup   = tableName === 'criticality_group_weight';
  const itemFkField   = isCritGroup ? 'criticality_group_id'          : 'quality_dimension_id';
  const itemIdField   = isCritGroup ? 'criticality_group_id'          : 'quality_dimension_id';
  const itemLabelField= isCritGroup ? 'criticality_group_description' : 'dimension_name';
  const panelTitle    = isCritGroup ? 'Criticality Group Weight'       : 'Quality Dimension Weight';
  const itemPlural    = isCritGroup ? 'group'                          : 'dimension';
  const itemLabel     = isCritGroup ? 'Criticality Group'              : 'Quality Dimension';

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

  const allItems = useMemo(() => {
    const src = isCritGroup ? (data?.criticality_group || []) : (data?.quality_dimension || []);
    return src.filter(i => !i.retiring_timestamp);
  }, [data, isCritGroup]);

  // IDs already assigned to the selected agency (active rows), excluding current record when editing
  const assignedIds = useMemo(() => {
    if (!values.executive_agency_id) return new Set();
    return new Set(
      (data?.[tableName] || [])
        .filter(w => !w.retiring_timestamp &&
          w.executive_agency_id === values.executive_agency_id &&
          w[schema.pk] !== record?.[schema.pk])
        .map(w => w[itemFkField])
    );
  }, [data, tableName, schema.pk, values.executive_agency_id, itemFkField, record]);

  const availableItems = useMemo(() =>
    allItems
      .filter(i => !assignedIds.has(i[itemIdField]))
      .sort((a, b) => (a[itemLabelField] || '').localeCompare(b[itemLabelField] || '')),
    [allItems, assignedIds, itemIdField, itemLabelField]);

  const validate = () => {
    const errs = {};
    if (!values.executive_agency_id) errs.executive_agency_id = 'Required';
    if (!values[itemFkField])        errs[itemFkField]        = 'Required';
    const w = parseFloat(values.weight_value);
    if (values.weight_value === null || values.weight_value === undefined ||
        String(values.weight_value).trim() === '') {
      errs.weight_value = 'Required';
    } else if (isNaN(w)) {
      errs.weight_value = 'Must be a number';
    }
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const saved = {
      ...values,
      executive_agency_id: parseInt(values.executive_agency_id, 10),
      [itemFkField]:        parseInt(values[itemFkField], 10),
      weight_value:         parseFloat(values.weight_value),
      retiring_timestamp:   null,
    };
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
      title={isEdit ? ('Edit ' + panelTitle) : ('Add ' + panelTitle)}
      subtitle={panelTitle}
      accent={accent}
      saveLabel={isEdit ? 'Save' : 'Add'}
      onSave={handleSave}
      onClose={onClose}>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Agency" required={true} err={!!errors.executive_agency_id}/>
        <select value={values.executive_agency_id ?? ''} style={{ ...ibs(!!errors.executive_agency_id), cursor: 'pointer' }}
          onChange={e => {
            set('executive_agency_id', e.target.value === '' ? null : parseInt(e.target.value, 10));
            set(itemFkField, null);
          }}>
          <option value="">-- select agency --</option>
          {agencies.map(a => (
            <option key={a.executive_agency_id} value={a.executive_agency_id}>
              {a.agency_acronymn} - {a.agency_name}
            </option>
          ))}
        </select>
        <ErrMsg msg={errors.executive_agency_id}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text={itemLabel} required={true} err={!!errors[itemFkField]}/>
        <select value={values[itemFkField] ?? ''} style={{ ...ibs(!!errors[itemFkField]), cursor: 'pointer' }}
          disabled={!values.executive_agency_id}
          onChange={e => set(itemFkField, e.target.value === '' ? null : parseInt(e.target.value, 10))}>
          <option value="">{'-- select ' + itemPlural + ' --'}</option>
          {availableItems.map(i => (
            <option key={i[itemIdField]} value={i[itemIdField]}>{i[itemLabelField]}</option>
          ))}
        </select>
        <ErrMsg msg={errors[itemFkField]}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Weight" required={true} err={!!errors.weight_value}/>
        <input type="number" step="0.01" value={values.weight_value ?? ''} style={ibs(!!errors.weight_value)}
          onChange={e => set('weight_value', e.target.value === '' ? null : e.target.value)}/>
        <ErrMsg msg={errors.weight_value}/>
      </div>

    </FormShell>
  );
}
