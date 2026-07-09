// Normalises a stored date-like value to YYYY-MM-DD for <input type="date">
function parseDateVal(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return '';
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// ===============================================================================
// FORM SHELL -- reusable panel chrome (backdrop + header + scrollable body)
// All specialised form panels compose their content inside FormShell.
// ===============================================================================
function FormShell({ title, subtitle, accent, saveLabel, onSave, onClose, children }) {
  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed', inset:0, zIndex:300, background:'var(--overlay-sm)',
      }}/>
      <div style={{
        position:'fixed', top:0, right:0, bottom:0, width:'min(560px, 60vw)',
        background:'var(--bg2)', borderLeft:'1px solid var(--border2)',
        zIndex:400, display:'flex', flexDirection:'column',
        boxShadow:'-4px 0 24px var(--overlay-md)', animation:'slideInRight 0.18s ease',
      }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:accent, marginBottom:3 }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>
                {subtitle}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={onSave} style={{ padding:'6px 14px', fontSize:12 }}>
            <Icon.Check/> {saveLabel || 'Save'}
          </button>
          <button className="btn btn-ghost" style={{ padding:'6px 8px' }} onClick={onClose}>
            <Icon.X/>
          </button>
        </div>
        <div style={{ flex:1, overflow:'auto', padding:'16px 18px' }}>
          {children}
        </div>
      </div>
    </>
  );
}

// ===============================================================================
// BLANK RECORD BUILDER -- utility used by the generic table view (161_view_generic)
// ===============================================================================
function buildBlankRecord(tableName, nextPkFn, data) {
  const schema = SCHEMA[tableName];
  const blank  = {};
  for (const col of schema.cols) {
    if (col.name === schema.pk)             { blank[col.name] = nextPkFn(tableName); continue; }
    if (col.name === 'retiring_timestamp')  { blank[col.name] = null; continue; }
    if (col.type === 'bool')                { blank[col.name] = false; continue; }
    blank[col.name] = null;
  }
  return blank;
}

// ===============================================================================
// GENERIC RECORD FORM PANEL
// Handles any table not routed to a specialised panel by 240_app.js.
// No cascade dropdowns, no custom validation -- purely schema-driven.
// ===============================================================================
function RecordFormPanel({ tableName, record, onSave, onClose, data }) {
  const schema   = SCHEMA[tableName];
  const group    = TABLE_GROUPS.find(g => g.tables.includes(tableName));
  const accent   = group?.accent || 'var(--accent)';
  const isEdit   = (data?.[tableName] || []).some(r => r[schema.pk] === record?.[schema.pk]);
  const editCols = schema.cols.filter(c => c.name !== schema.pk && c.name !== 'retiring_timestamp');

  const [values,   setValues]   = useState(() => ({ ...record }));
  const [errors,   setErrors]   = useState({});
  const [warnings, setWarnings] = useState({});

  const set = (field, val) => {
    setValues(prev => ({ ...prev, [field]: val }));
    setErrors(prev => ({ ...prev, [field]: null }));
  };

  const isRequired = (col) => {
    if (col.optional) return false;
    if (col.required) return true;
    return col.type === 'str' && !col.fk;
  };

  const validate = () => {
    const errs = {};
    for (const col of editCols) {
      if (!isRequired(col)) continue;
      const v = values[col.name];
      if (v === null || v === undefined || String(v).trim() === '') errs[col.name] = 'Required';
    }
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const saved = { ...values };
    for (const col of editCols) {
      const v = saved[col.name];
      if (col.type === 'int'   && v !== null) saved[col.name] = parseInt(v, 10) || null;
      if (col.type === 'float' && v !== null) saved[col.name] = parseFloat(v)   || null;
      if (col.type === 'bool')                saved[col.name] = !!v;
    }
    saved[schema.pk]            = values[schema.pk];
    saved['retiring_timestamp'] = null;
    onSave(saved);
  };

  const renderInput = (col) => {
    const v   = values[col.name];
    const err = errors[col.name];
    const ib  = {
      width:'100%', padding:'7px 10px', fontSize:13, background:'var(--bg3)',
      border:`1px solid ${err ? 'var(--red)' : warnings[col.name] ? 'var(--amber)' : 'var(--border)'}`,
      borderRadius:'var(--radius)', color:'var(--text)',
      fontFamily:'var(--sans)', outline:'none', transition:'border-color 0.15s',
    };

    if (col.fk) {
      // Agency FK: display acronym + name for readability
      if (col.fk.table === 'executive_agency') {
        const ags = (data?.executive_agency || [])
          .filter(a => !a.retiring_timestamp)
          .sort((a,b) => (a.agency_acronymn||'').localeCompare(b.agency_acronymn||''));
        return (
          <select value={v ?? ''} onChange={e => set(col.name, e.target.value === '' ? null : parseInt(e.target.value, 10))}
            style={{ ...ib, cursor:'pointer' }}>
            <option value="">-- select agency --</option>
            {ags.map(a => <option key={a.executive_agency_id} value={a.executive_agency_id}>{a.agency_acronymn} - {a.agency_name}</option>)}
          </select>
        );
      }
      const opts = getFkOptions(data, col.fk).sort((a,b) => (a.label||'').localeCompare(b.label||''));
      return (
        <select value={v ?? ''} onChange={e => set(col.name, e.target.value === '' ? null : parseInt(e.target.value, 10))}
          style={{ ...ib, cursor:'pointer' }}>
          <option value="">-- select --</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }

    if (col.type === 'bool') {
      return (
        <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
          <div className="toggle">
            <input type="checkbox" checked={!!v} onChange={e => set(col.name, e.target.checked)}/>
            <div className="toggle-track"/>
            <div className="toggle-thumb"/>
          </div>
          <span style={{ fontSize:13, color: v ? 'var(--text)' : 'var(--text3)' }}>{v ? 'Yes' : 'No'}</span>
        </label>
      );
    }

    if (col.type === 'text') {
      return (
        <textarea value={v ?? ''} rows={col.tall ? 8 : 3}
          onChange={e => set(col.name, e.target.value || null)}
          style={{ ...ib, resize:'vertical', lineHeight:1.5,
            fontFamily: col.tall ? 'var(--mono)' : 'var(--sans)', fontSize: col.tall ? 12 : 13 }}/>
      );
    }

    if (col.type === 'datetime') {
      return <input type="date" value={parseDateVal(v)} onChange={e => set(col.name, e.target.value || null)} style={ib}/>;
    }

    if (col.type === 'int' || col.type === 'float') {
      return (
        <input type="number" value={v ?? ''} step={col.type === 'float' ? '0.01' : '1'}
          onChange={e => set(col.name, e.target.value === '' ? null : e.target.value)}
          style={ib}/>
      );
    }

    return <input type="text" value={v ?? ''} onChange={e => set(col.name, e.target.value || null)} style={ib}/>;
  };

  return (
    <FormShell
      title={isEdit ? 'Edit ' + schema.label : 'Add ' + schema.label}
      subtitle={null}
      accent={accent}
      saveLabel={isEdit ? 'Save' : 'Add'}
      onSave={handleSave}
      onClose={onClose}>

      <div style={{ marginBottom:14, padding:'6px 10px',
        background:'var(--bg3)', border:'1px solid var(--border)',
        borderRadius:'var(--radius)', fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
        {schema.pk}: {values[schema.pk]} (auto-assigned)
      </div>

      {editCols.map(col => (
        <div key={col.name} style={{ marginBottom:12 }}>
          <label style={{ display:'block', fontSize:11, fontWeight:600,
            color: errors[col.name] ? 'var(--red)' : warnings[col.name] ? 'var(--amber)' : 'var(--text2)',
            marginBottom:4, letterSpacing:'0.03em' }}>
            {col.label}
            {isRequired(col) && <span style={{ color:'var(--red)', marginLeft:3 }}>*</span>}
          </label>
          {renderInput(col)}
          {errors[col.name] && (
            <div style={{ fontSize:11, color:'var(--red)', marginTop:3, display:'flex', alignItems:'flex-start', gap:4 }}>
              <span style={{ flexShrink:0, marginTop:1 }}><Icon.Warning/></span>
              {errors[col.name]}
            </div>
          )}
          {!errors[col.name] && warnings[col.name] && (
            <div style={{ fontSize:11, color:'var(--amber)', marginTop:3, display:'flex', alignItems:'flex-start', gap:4 }}>
              <span style={{ flexShrink:0, marginTop:1 }}><Icon.Warning/></span>
              {warnings[col.name]}
            </div>
          )}
        </div>
      ))}
    </FormShell>
  );
}
