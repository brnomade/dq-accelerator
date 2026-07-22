const LOGO_STORAGE_KEY = 'moj_dq_client_logo_v1';

function loadClientLogo() {
  try { return localStorage.getItem(LOGO_STORAGE_KEY) || null; } catch { return null; }
}
function saveClientLogo(dataUrl) {
  try {
    localStorage.setItem(LOGO_STORAGE_KEY, dataUrl);
    window.dispatchEvent(new Event('storage'));
  } catch {}
}
function clearClientLogo() {
  try {
    localStorage.removeItem(LOGO_STORAGE_KEY);
    window.dispatchEvent(new Event('storage'));
  } catch {}
}

function saveStewardIdentity(obj) {
  try {
    localStorage.setItem(STEWARD_IDENTITY_KEY, JSON.stringify(obj));
    window.dispatchEvent(new Event('storage'));
  } catch {}
}
function clearStewardIdentity() {
  try {
    localStorage.removeItem(STEWARD_IDENTITY_KEY);
    window.dispatchEvent(new Event('storage'));
  } catch {}
}

// Shared pill-button toggle used by all screens that have a My Data scope filter.
// accent -- any CSS colour value (hex or CSS var); used for border + text when active.
// available -- whether to render the toggle at all (hide when no steward identity set).
function MyDataToggle({ active, onToggle, available, accent }) {
  if (!available) return null;
  var activeColor = accent || 'var(--accent)';
  return (
    <button
      onClick={onToggle}
      title={active ? 'Show all data' : 'Show only my data'}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px',
        background: 'var(--bg3)',
        border: '1px solid ' + (active ? activeColor : 'var(--border)'),
        borderRadius: 12, fontSize: 11, cursor: 'pointer',
        color: active ? activeColor : 'var(--text3)',
        whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
      }}
    >
      My data
    </button>
  );
}

function SettingsPanel({ onClose }) {
  const { data, designateAsMaster } = useApp();
  const [logo,          setLogo]          = useState(() => loadClientLogo());
  const [storedIdentity, setStoredIdentity] = useState(() => loadStewardIdentity());
  const [stewardId,     setStewardId]     = useState(() => loadStewardIdentity()?.id || null);
  const [masterPrompt,  setMasterPrompt]  = useState(false);
  const [masterSaved,   setMasterSaved]   = useState(false);
  const [identitySaved, setIdentitySaved] = useState(false);

  const stewards   = (data?.data_steward || []).filter(s => !s.retiring_timestamp)
    .sort((a,b) => (a.data_steward_name||'').localeCompare(b.data_steward_name||''));

  var designation    = loadMasterDesignation();
  var isMasterSteward = designation && designation.stewardId === stewardId;
  var masterSteward  = designation
    ? stewards.find(function(s) { return s.data_steward_id === designation.stewardId; })
    : null;

  const [baseVersion, setBaseVersionState] = useState(() => loadBaseVersion());

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      saveClientLogo(e.target.result);
      setLogo(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleStewardSave = () => {
    const s = stewards.find(st => st.data_steward_id === stewardId);
    if (!s) return;
    const identity = { id: s.data_steward_id, name: s.data_steward_name };
    saveStewardIdentity(identity);
    setStoredIdentity(identity);
    setIdentitySaved(true);
    setTimeout(() => setIdentitySaved(false), 2000);
    if (!loadMasterDesignation()) setMasterPrompt(true);
  };

  const handleDesignateMaster = () => {
    if (!stewardId) return;
    designateAsMaster(stewardId);
    setMasterPrompt(false);
    setMasterSaved(true);
    setTimeout(() => setMasterSaved(false), 2500);
  };

  const handleClose = () => {
    setLogo(loadClientLogo());
    onClose();
  };

  const accent = '#18b4d4';
  const inputStyle = {
    width:'100%', padding:'7px 10px', fontSize:13,
    background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:'var(--radius)', color:'var(--text)',
    fontFamily:'var(--sans)', outline:'none', cursor:'pointer',
  };
  const divider = (
    <div style={{ height:1, background:'var(--border)', margin:'16px 0' }}/>
  );

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}
        style={{ maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center',
          justifyContent:'space-between', marginBottom:16 }}>
          <div className="settings-title">Settings</div>
          <button className="btn btn-ghost" style={{ padding:'4px 8px' }}
            onClick={handleClose}>
            <Icon.X/>
          </button>
        </div>

        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text2)',
            textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
            Steward Identity
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8 }}>
            Select your identity. This determines your PK namespace and delta export.
          </div>
          <select value={stewardId !== null ? String(stewardId) : ''}
            onChange={e => { setStewardId(e.target.value ? parseInt(e.target.value) : null); setMasterPrompt(false); }}
            style={inputStyle}>
            <option value="">-- select your identity --</option>
            {stewards.map(s => (
              <option key={s.data_steward_id} value={String(s.data_steward_id)}>
                {s.data_steward_name}
                {s.data_steward_title ? ` - ${s.data_steward_title}` : ''}
              </option>
            ))}
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
            <button className="btn btn-primary"
              disabled={!stewardId}
              style={{ fontSize:12, padding:'5px 14px',
                opacity: stewardId ? 1 : 0.5 }}
              onClick={handleStewardSave}>
              Save identity
            </button>
            {storedIdentity && (
              <button className="btn btn-ghost"
                style={{ fontSize:12, padding:'5px 10px' }}
                onClick={() => { clearStewardIdentity(); setStewardId(null); setStoredIdentity(null); setMasterPrompt(false); }}>
                Reset identity
              </button>
            )}
            {identitySaved && (
              <span style={{ fontSize:11, color:'var(--green)',
                fontFamily:'var(--mono)', fontWeight:600 }}>Saved</span>
            )}
          </div>

          {/* Current identity display */}
          {storedIdentity && (
            <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8,
              padding:'6px 10px', background:'var(--bg3)',
              border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span style={{ fontSize:12, color:'var(--text2)' }}>
                {storedIdentity.name}
              </span>
              {isMasterSteward && (
                <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
                  color:'var(--amber)', background:'rgba(245,166,35,0.12)',
                  border:'1px solid rgba(245,166,35,0.4)',
                  borderRadius:3, padding:'1px 6px', marginLeft:4 }}>
                  MASTER
                </span>
              )}
            </div>
          )}
        </div>

        {/* SECTION: Master setup prompt */}
        {masterPrompt && (
          <div style={{ padding:'10px 12px', marginBottom:14,
            background:'rgba(245,166,35,0.08)',
            border:'1px solid rgba(245,166,35,0.35)',
            borderRadius:'var(--radius)' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--amber)', marginBottom:6 }}>
              No master steward configured
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8 }}>
              Would you like to designate yourself as the master steward for this copy?
              This enables delta import, master export, and editing of restricted records.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleDesignateMaster}
                style={{ fontSize:11, padding:'4px 12px', cursor:'pointer',
                  background:'var(--amber)', border:'none',
                  borderRadius:'var(--radius)', color:'#000',
                  fontWeight:600, fontFamily:'var(--mono)' }}>
                Yes, designate me as master
              </button>
              <button onClick={() => setMasterPrompt(false)}
                style={{ fontSize:11, padding:'4px 10px', cursor:'pointer',
                  background:'transparent', border:'1px solid var(--border)',
                  borderRadius:'var(--radius)', color:'var(--text3)',
                  fontFamily:'var(--mono)' }}>
                Not now
              </button>
            </div>
          </div>
        )}

        {masterSaved && (
          <div style={{ padding:'8px 12px', marginBottom:14,
            background:'rgba(34,201,142,0.08)',
            border:'1px solid rgba(34,201,142,0.3)',
            borderRadius:'var(--radius)',
            fontSize:11, color:'var(--green)', fontFamily:'var(--mono)', fontWeight:600 }}>
            Master steward record created successfully.
          </div>
        )}

        {/* Master info if exists */}
        {designation && !isMasterSteward && (
          <div style={{ marginBottom:14, padding:'6px 10px',
            background:'var(--bg3)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', fontSize:11, color:'var(--text3)' }}>
            Master steward: <span style={{ color:'var(--text2)', fontWeight:500 }}>
              {masterSteward ? masterSteward.data_steward_name : 'Steward #' + designation.stewardId}
            </span>
          </div>
        )}

        {/* Base version */}
        {baseVersion && (
          <div style={{ marginBottom:14, padding:'6px 10px',
            background:'var(--bg3)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', fontSize:11, color:'var(--text3)',
            fontFamily:'var(--mono)' }}>
            Base version: <span style={{ color:accent }}>{baseVersion}</span>
          </div>
        )}

        {/* Namespace info */}
        {storedIdentity && (
          <div style={{ marginBottom:14, padding:'6px 10px',
            background:'var(--bg3)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', fontSize:11, color:'var(--text3)',
            fontFamily:'var(--mono)' }}>
            PK namespace:
            <span style={{ color: isMasterSteward ? 'var(--amber)' : '#18b4d4', marginLeft:6 }}>
              {isMasterSteward
                ? 'master sequence (no prefix)'
                : `${storedIdentity.id * 1000000} - ${storedIdentity.id * 1000000 + 999999}`}
            </span>
          </div>
        )}

        {divider}

        {/* SECTION: Client Logo */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:600, color:'var(--text2)',
            textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>
            Client Logo
          </div>
          {logo ? (
            <div style={{ marginBottom:10 }}>
              <div style={{ background:'var(--bg3)', border:'1px solid var(--border)',
                borderRadius:'var(--radius)', padding:12,
                display:'flex', alignItems:'center', justifyContent:'center', minHeight:60 }}>
                <img src={logo} style={{ height:48, width:'auto',
                  maxWidth:'100%', objectFit:'contain', display:'block' }}/>
              </div>
              <button className="btn btn-danger"
                style={{ marginTop:10, fontSize:12 }}
                onClick={() => { clearClientLogo(); setLogo(null); }}>
                <Icon.Trash/> Remove logo
              </button>
            </div>
          ) : (
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8 }}>
              No logo set
            </div>
          )}
          <div className="settings-drop-zone">
            <input type="file" accept="image/*"
              onChange={e => handleFile(e.target.files[0])}/>
            <div style={{ color:'var(--text2)' }}><Icon.Image/></div>
            <div className="settings-drop-text">
              {logo ? 'Drop a new image to replace' : 'Drop an image file here'}
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>
              PNG, SVG, JPG
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const BASE_VERSION_KEY  = 'moj_dq_base_version';
const BASE_SNAPSHOT_KEY = 'moj_dq_base_snapshot';

// Tables included in delta sync -- all 22 SCHEMA tables
const DELTA_TABLES = [
  // Reference lookups
  'executive_agency_type',
  'steward_role_type',
  'quality_dimension',
  'criticality_group',
  'criticality_level',
  // Organisational hierarchy
  'executive_agency',
  'directorate',
  // People
  'data_patron',
  'data_owner',
  'data_steward',
  // Weights
  'criticality_group_weight',
  'quality_dimension_weight',
  // Core data model
  'critical_data_set',
  'critical_data_element',
  'stewardship',
  'cde_criticality',
  // Rules
  'data_quality_rule',
  'data_quality_rule_allocation',
  // Shortlists
  'shortlist_group',
  'cde_shortlist_tag',
  // Profiling
  'source_table_ddl',
  'field_profiling',
];

