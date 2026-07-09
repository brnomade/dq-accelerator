function DDLFormPanel({ record, onSave, onClose, nextPk, accent, data, stewardIdentity }) {
  const isEdit = !!(record?.source_table_ddl_id);

  // Build distinct db+table pairs from CDEs that don't have a DDL yet
  const existingDdls = useMemo(() => new Set(
    (data?.source_table_ddl || [])
      .filter(r => !r.retiring_timestamp)
      .map(r => `${r.source_database_name}|||${r.source_table_name}`)
  ), [data]);

  const cdePairs = useMemo(() => {
    const seen = new Set();
    const pairs = [];
    for (const cde of (data?.critical_data_element || [])) {
      if (cde.retiring_timestamp) continue;
      const db  = cde.source_database_name;
      const tbl = cde.source_table_name;
      if (!db || !tbl) continue;
      const key = `${db}|||${tbl}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Only include pairs without a DDL (unless we're editing this pair)
      if (!existingDdls.has(key) || key === `${record?.source_database_name}|||${record?.source_table_name}`) {
        pairs.push({ db, tbl, key });
      }
    }
    return pairs.sort((a,b) => a.key.localeCompare(b.key));
  }, [data, existingDdls, record]);

  const [pairSel,   setPairSel]   = useState(() => {
    if (record?.source_database_name && record?.source_table_name)
      return `${record.source_database_name}|||${record.source_table_name}`;
    return '';
  });
  const [dbName,    setDbName]    = useState(record?.source_database_name || '');
  const [tableName, setTableName] = useState(record?.source_table_name    || '');
  const [ddlText,   setDdlText]   = useState(record?.ddl_text             || '');
  const [parsed,    setParsed]    = useState(() =>
    record?.parsed_columns ? JSON.parse(record.parsed_columns) : []
  );

  const profKeys = useMemo(() => {
    const db  = (dbName  || '').toLowerCase();
    const tbl = (tableName || '').toLowerCase();
    return new Set(
      (data?.field_profiling || [])
        .filter(p => !p.retiring_timestamp &&
          (p.source_database_name || '').toLowerCase() === db &&
          (p.source_table_name    || '').toLowerCase() === tbl)
        .map(p => (p.source_field_name || '').toLowerCase())
    );
  }, [data, dbName, tableName]);

  const cdeKeys = useMemo(() => {
    const db  = (dbName  || '').toLowerCase();
    const tbl = (tableName || '').toLowerCase();
    return new Set(
      (data?.critical_data_element || [])
        .filter(c => !c.retiring_timestamp &&
          (c.source_database_name || '').toLowerCase() === db &&
          (c.source_table_name    || '').toLowerCase() === tbl)
        .map(c => (c.source_field_name || '').toLowerCase())
    );
  }, [data, dbName, tableName]);

  const [errors,    setErrors]    = useState({});
  const [parseMsg,  setParseMsg]  = useState('');
  const [copiedCmd, setCopiedCmd] = useState(false);

  const athenaCmd = dbName.trim() && tableName.trim()
    ? `SHOW CREATE TABLE ${dbName.trim()}.${tableName.trim()};`
    : '';

  const handleCopyCmd = () => {
    if (!athenaCmd) return;
    navigator.clipboard.writeText(normalizeWhitespace(athenaCmd)).then(() => {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    }).catch(() => {});
  };

  const handlePairSelect = (val) => {
    setPairSel(val);
    if (val && val !== '__custom__') {
      const [db, tbl] = val.split('|||');
      setDbName(db); setTableName(tbl);
    } else if (val === '__custom__') {
      setDbName(''); setTableName('');
    }
    setErrors({});
  };

  const handleParse = () => {
    const cols = parseDDL(ddlText);
    if (cols.length === 0) {
      setParseMsg('No columns detected. Check the DDL format.');
    } else {
      setParsed(cols);
      setParseMsg(`${cols.length} column${cols.length!==1?'s':''} detected.`);
      const tblMatch = ddlText.match(/CREATE\s+(?:EXTERNAL\s+)?TABLE\s+(?:`?([^`\s.(]+)`?\.)?`?([^`\s(]+)`?/i);
      if (tblMatch) {
        if (!dbName && tblMatch[1]) setDbName(tblMatch[1]);
        if (!tableName && tblMatch[2]) setTableName(tblMatch[2]);
      }
    }
  };

  const handleSave = () => {
    const errs = {};
    if (!dbName.trim())    errs.db    = 'Required';
    if (!tableName.trim()) errs.table = 'Required';
    if (!ddlText.trim())   errs.ddl   = 'Required';
    if (parsed.length === 0) errs.ddl = 'Parse the DDL first to confirm columns were detected.';
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
    onSave({
      source_table_ddl_id:  record?.source_table_ddl_id ?? nextPk(),
      source_database_name: dbName.trim(),
      source_table_name:    tableName.trim(),
      ddl_text:             ddlText,
      parsed_columns:       JSON.stringify(parsed),
      parsed_at:            dateStr,
      parsed_by:            stewardIdentity?.name || null,
      retiring_timestamp:   null,
    });
  };

  const inputBase = {
    width:'100%', padding:'7px 10px', fontSize:13,
    background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:'var(--radius)', color:'var(--text)',
    fontFamily:'var(--sans)', outline:'none',
  };
  const monoInput = { fontFamily:'var(--mono)', fontSize:12 };
  const isCustom = pairSel === '__custom__' || pairSel === '';

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:300, background:'var(--overlay-sm)' }}/>
      <div style={{
        position:'fixed', top:0, right:0, bottom:0, width:'min(780px, 82vw)',
        background:'var(--bg2)', borderLeft:'1px solid var(--border2)',
        zIndex:400, display:'flex', flexDirection:'column',
        boxShadow:'-4px 0 24px var(--overlay-md)', animation:'slideInRight 0.18s ease',
      }}>
        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:accent, marginBottom:3 }}>
              {isEdit ? 'Edit Profile' : 'Add Profile'}
            </div>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>Table Profiling</div>
          </div>
          <button className="btn btn-primary" onClick={handleSave} style={{ padding:'6px 14px', fontSize:12 }}>
            <Icon.Check/> {isEdit ? 'Save' : 'Add'}
          </button>
          <button className="btn btn-ghost" style={{ padding:'6px 8px' }} onClick={onClose}>
            <Icon.X/>
          </button>
        </div>

        <div style={{ flex:1, overflow:'auto', padding:'16px 18px',
          display:'flex', flexDirection:'column', gap:14 }}>

          {/* Last Profiled box */}
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
            borderLeft:`3px solid ${record?.parsed_at ? 'var(--green)' : 'var(--border)'}`,
            borderRadius:'var(--radius-lg)', padding:'10px 14px' }}>
            <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase',
              color: record?.parsed_at ? 'var(--green)' : 'var(--text3)',
              marginBottom:6 }}>
              Last Profiled
            </div>
            {record?.parsed_at ? (
              <>
                <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text2)', lineHeight:1.5, overflowWrap:'anywhere' }}>
                  {record.parsed_at}
                </div>
                <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', marginTop:3, overflowWrap:'anywhere' }}>
                  {record.parsed_by ? `by ${record.parsed_by}` : 'by unknown'}
                </div>
              </>
            ) : (
              <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)' }}>Never</div>
            )}
          </div>

          {/* Step 1 -- Get the DDL */}
          <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
            borderLeft:`3px solid ${accent}`, borderRadius:'var(--radius-lg)',
            padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color:accent }}>
              Step 1 - Get the DDL from Athena
            </div>

            {/* Table selector */}
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:600,
                color:'var(--text2)', marginBottom:4 }}>
                Select from CDE related tables yet to be profiled
              </label>
              <select value={pairSel} style={{ ...inputBase, ...monoInput, cursor:'pointer' }}
                onChange={e => handlePairSelect(e.target.value)}>
                <option value="">-- select a table or enter manually below --</option>
                {cdePairs.map(p => (
                  <option key={p.key} value={p.key}>{p.db} / {p.tbl}</option>
                ))}
                <option value="__custom__">-- enter new database / table manually --</option>
              </select>
            </div>

            {/* Database + Table fields */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:600,
                  color: errors.db ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
                  Database <span style={{ color:'var(--red)' }}>*</span>
                </label>
                <input type="text" value={dbName}
                  onChange={e => { setDbName(e.target.value); setErrors(p => ({...p, db:null})); }}
                  style={{ ...inputBase, ...monoInput,
                    border:`1px solid ${errors.db ? 'var(--red)' : 'var(--border)'}`,
                    background: !isCustom ? 'var(--bg)' : 'var(--bg3)' }}
                  placeholder="e.g. data_eng_uploader_prod_opg_stage_1"/>
                {errors.db && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{errors.db}</div>}
              </div>
              <div>
                <label style={{ display:'block', fontSize:11, fontWeight:600,
                  color: errors.table ? 'var(--red)' : 'var(--text2)', marginBottom:4 }}>
                  Table <span style={{ color:'var(--red)' }}>*</span>
                </label>
                <input type="text" value={tableName}
                  onChange={e => { setTableName(e.target.value); setErrors(p => ({...p, table:null})); }}
                  style={{ ...inputBase, ...monoInput,
                    border:`1px solid ${errors.table ? 'var(--red)' : 'var(--border)'}`,
                    background: !isCustom ? 'var(--bg)' : 'var(--bg3)' }}
                  placeholder="e.g. card_payments_statsheets_updated"/>
                {errors.table && <div style={{ fontSize:11, color:'var(--red)', marginTop:2 }}>{errors.table}</div>}
              </div>
            </div>

            {/* Athena command copy block */}
            <div style={{ background:'var(--bg)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:'10px 12px' }}>
              <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
                textTransform:'uppercase', color:'var(--text3)', marginBottom:8 }}>
                Athena command
              </div>
              {athenaCmd ? (
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <code style={{ flex:1, fontFamily:'var(--mono)', fontSize:11,
                    color:'var(--text)', overflowWrap:'anywhere' }}>
                    {athenaCmd}
                  </code>
                  <button onClick={handleCopyCmd}
                    style={{ display:'flex', alignItems:'center', gap:5,
                      fontSize:11, padding:'4px 12px', cursor:'pointer', flexShrink:0,
                      background: copiedCmd ? 'rgba(34,201,142,0.12)' : 'var(--bg3)',
                      border:`1px solid ${copiedCmd ? 'var(--green)' : accent}`,
                      borderRadius:'var(--radius)',
                      color: copiedCmd ? 'var(--green)' : accent,
                      fontWeight:600, fontFamily:'var(--mono)' }}>
                    {copiedCmd ? <Icon.Check/> : <Icon.Copy/>}
                    {copiedCmd ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ) : (
                <span style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>
                  Select or enter a database and table above to generate the Athena command.
                </span>
              )}
            </div>

            {/* DDL paste area */}
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {athenaCmd && (
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:2 }}>
                  Run the command above in Athena, then paste the output here.
                </div>
              )}
              <label style={{ fontSize:11, fontWeight:600, marginBottom:4, display:'block',
                color: errors.ddl ? 'var(--red)' : 'var(--text2)' }}>
                CREATE TABLE statement <span style={{ color:'var(--red)' }}>*</span>
              </label>
              <textarea value={ddlText}
                onChange={e => { setDdlText(e.target.value); setParsed([]); setParseMsg(''); setErrors(p => ({...p, ddl:null})); }}
                placeholder={'CREATE EXTERNAL TABLE database.table (\n  field_name STRING,\n  another_field BIGINT,\n  date_col VARCHAR(10)\n)'}
                style={{ ...inputBase, ...monoInput, resize:'none',
                  lineHeight:1.6, minHeight:100,
                  border:`1px solid ${errors.ddl ? 'var(--red)' : 'var(--border)'}` }}/>
              {errors.ddl && <div style={{ fontSize:11, color:'var(--red)', marginTop:3 }}>{errors.ddl}</div>}
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
                <button onClick={handleParse}
                  style={{ display:'flex', alignItems:'center', gap:5,
                    fontSize:11, padding:'4px 12px', cursor:'pointer', flexShrink:0,
                    background:'var(--bg3)', border:`1px solid ${accent}`,
                    borderRadius:'var(--radius)', color:accent,
                    fontWeight:600, fontFamily:'var(--mono)' }}>
                  <Icon.Check/> Parse
                </button>
              </div>
            </div>
          </div>

          {/* Step 2 -- Verify columns */}
          {(parseMsg || parsed.length > 0) && (
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
              borderLeft:`3px solid ${parsed.length > 0 ? 'var(--green)' : 'var(--amber)'}`,
              borderRadius:'var(--radius-lg)', padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
                textTransform:'uppercase',
                color: parsed.length > 0 ? 'var(--green)' : 'var(--amber)',
                marginBottom:10 }}>
                Step 2 - Verify columns
              </div>
              <div style={{ fontSize:11, fontWeight:600, marginBottom:8,
                color: parsed.length > 0 ? 'var(--green)' : 'var(--amber)' }}>
                {parseMsg}
              </div>
              {parsed.length > 0 && (
                <div style={{ overflow:'auto', maxHeight:360,
                  border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse',
                    fontSize:11, fontFamily:'var(--mono)', minWidth:320 }}>
                    <thead>
                      <tr style={{ background:'var(--bg3)', position:'sticky', top:0, zIndex:1 }}>
                        {['', '', 'Type', 'Field Name'].map((h, i) => (
                          <th key={i} style={{
                            padding:'4px 8px', textAlign: i >= 2 ? 'left' : 'center',
                            borderBottom:'1px solid var(--border)',
                            color:'var(--text3)', fontWeight:700, fontSize:9,
                            letterSpacing:'0.06em', textTransform:'uppercase',
                            width: i===0 ? 28 : i===1 ? 44 : i===2 ? 90 : undefined,
                            whiteSpace:'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.map((c, i) => {
                        const isProf = profKeys.has((c.name || '').toLowerCase());
                        const isCde  = cdeKeys.has((c.name || '').toLowerCase());
                        return (
                          <tr key={c.name} style={{
                            background: i%2===0 ? 'var(--bg)' : 'var(--bg2)',
                            borderBottom:'1px solid var(--border)',
                          }}>
                            <td style={{ textAlign:'center', padding:'4px 8px',
                              color:'var(--green)', fontSize:12 }}>
                              {isProf && '\u2713'}
                            </td>
                            <td style={{ textAlign:'center', padding:'4px 8px' }}>
                              {isCde && (
                                <span style={{ fontSize:9, fontWeight:700,
                                  color:accent, background:`${accent}18`,
                                  border:`1px solid ${accent}40`,
                                  borderRadius:3, padding:'1px 5px' }}>CDE</span>
                              )}
                            </td>
                            <td style={{ padding:'4px 8px', color:'var(--text3)',
                              whiteSpace:'nowrap' }}>{c.type}</td>
                            <td style={{ padding:'4px 8px', color:'var(--text)',
                              whiteSpace:'nowrap' }}>{c.name}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ===============================================================================
// IMPORT TAB (preserved from Step 1)
// ===============================================================================
