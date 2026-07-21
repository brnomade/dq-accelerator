// ===============================================================================
// TASK 5 -- COLLAPSIBLE SIDEBAR
// ===============================================================================
const SIDEBAR_STORAGE_KEY  = 'moj_dq_sidebar_v1';
const GROUP_COLLAPSE_KEY   = 'moj_dq_groups_v1';

function loadSidebarPrefs() {
  try {
    const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { collapsed: false };
  } catch { return { collapsed: false }; }
}
function saveSidebarPrefs(prefs) {
  try { localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(prefs)); } catch {}
}
function loadGroupCollapse() {
  try {
    const raw = localStorage.getItem(GROUP_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveGroupCollapse(state) {
  try { localStorage.setItem(GROUP_COLLAPSE_KEY, JSON.stringify(state)); } catch {}
}

const MASTER_ONLY_GROUPS = new Set(['ownership', 'weights', 'settings']);

function Sidebar({ route, onNavigate, data, onToggle, isMaster }) {
  const [collapsed,   setCollapsed]   = useState(() => loadSidebarPrefs().collapsed);
  const [groupClosed, setGroupClosed] = useState(() => loadGroupCollapse());
  const [logo,        setLogo]        = useState(() => loadClientLogo());
  const [assistantBadge, setAssistantBadge] = useState(0);

  const refreshAssistantBadge = () => {
    try {
      const raw = localStorage.getItem('moj_dq_assistant_v1');
      if (!raw) { setAssistantBadge(0); return; }
      const s = JSON.parse(raw);
      const count = (s.proposals || []).filter(p => !p.committed).length;
      setAssistantBadge(count);
    } catch { setAssistantBadge(0); }
  };

  // Refresh logo when it changes in localStorage (set by the settings panel)
  useEffect(() => {
    refreshAssistantBadge();
    const handler = () => { setLogo(loadClientLogo()); refreshAssistantBadge(); };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    saveSidebarPrefs({ collapsed: next });
    onToggle && onToggle(next);
  };
  const toggleGroup = (id) => {
    const next = { ...groupClosed, [id]: !groupClosed[id] };
    setGroupClosed(next);
    saveGroupCollapse(next);
  };

  // Live record counts per table
  const liveCounts = useMemo(() => {
    if (!data) return {};
    const out = {};
    for (const t of Object.keys(SCHEMA)) {
      out[t] = (data[t] || []).filter(r => !r.retiring_timestamp).length;
    }
    return out;
  }, [data]);

  const isActive = (screen, table) =>
    route.screen === screen && route.table === (table || null);

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>

      {/* Logo block -- square area at top of sidebar */}
      <div className={`sidebar-logo-block ${collapsed ? 'collapsed' : ''}`}
        title={logo ? '' : 'Click settings to add a logo'}
      >
        {logo
          ? <img src={logo} alt="Client logo"/>
          : <div className="client-logo-placeholder">{collapsed ? 'DQ' : 'DQ'}</div>
        }
      </div>

      <div className="sidebar-scroll">

        {/* Dashboard */}
        <div className={`nav-item ${isActive('dashboard') ? 'active' : ''}`}
          onClick={() => onNavigate({ screen: 'dashboard', table: null })}>
          <span className="nav-item-icon"><Icon.Grid/></span>
          {!collapsed && <span className="nav-item-label">Dashboard</span>}
        </div>

        {/* Rule Assistant */}
        <div className={`nav-item ${isActive('assistant') ? 'active' : ''}`}
          onClick={() => onNavigate({ screen: 'assistant', table: null })}>
          <span className="nav-item-icon"><Icon.Assistant/></span>
          {!collapsed && <span className="nav-item-label" style={{ flex:1 }}>DQ Assistant</span>}
          {!collapsed && assistantBadge > 0 && (
            <span className="nav-table-badge" style={{ background:'var(--amber-bg)', color:'var(--amber)', borderColor:'var(--amber)' }}>
              {assistantBadge}
            </span>
          )}
          {collapsed && assistantBadge > 0 && (
            <span style={{ position:'absolute', top:6, right:6, width:7, height:7,
              borderRadius:'50%', background:'var(--amber)' }}/>
          )}
        </div>

        {/* Export */}
        <div className={`nav-item ${isActive('export') ? 'active' : ''}`}
          onClick={() => onNavigate({ screen: 'export', table: null })}>
          <span className="nav-item-icon"><Icon.Download/></span>
          {!collapsed && <span className="nav-item-label">Export</span>}
        </div>

        {/* Import */}
        <div className={`nav-item ${isActive('import') ? 'active' : ''}`}
          onClick={() => onNavigate({ screen: 'import', table: null })}>
          <span className="nav-item-icon"><Icon.Upload/></span>
          {!collapsed && <span className="nav-item-label">Import</span>}
        </div>

        {/* Data Browser -- master only */}
        {isMaster && (
          <div className={`nav-item ${isActive('databrowser') ? 'active' : ''}`}
            onClick={() => onNavigate({ screen: 'databrowser', table: null })}>
            <span className="nav-item-icon"><Icon.Database/></span>
            {!collapsed && <span className="nav-item-label">Data Browser</span>}
          </div>
        )}

        <div style={{ height:8, borderBottom:'1px solid var(--border)', marginBottom:8 }}/>

        {/* TABLE GROUPS */}
        {TABLE_GROUPS.map(group => {
          if (MASTER_ONLY_GROUPS.has(group.id) && !isMaster) return null;
          const open = !groupClosed[group.id];

          if (collapsed) {
            // Collapsed: show a coloured dot as group indicator
            return (
              <div key={group.id} className="nav-group-dot"
                title={group.label}
                onClick={toggleCollapse}>
                <div className="nav-group-dot-inner" style={{ background: group.accent }}/>
              </div>
            );
          }

          return (
            <div key={group.id} className="nav-group">
              <div className="nav-group-header" onClick={() => toggleGroup(group.id)}>
                <div className="nav-group-accent" style={{ background: group.accent }}/>
                <span>{group.label}</span>
                <span className={`nav-group-chevron ${open ? 'open' : ''}`}>
                  <Icon.ChevronR/>
                </span>
              </div>

              {/* Organisation -- first item in ownership group */}
              {open && group.id === 'ownership' && (
                <div
                  className={`nav-table-item ${isActive('orgchart') ? 'active' : ''}`}
                  onClick={() => onNavigate({ screen: 'orgchart', table: null })}>
                  <span style={{
                    width: 3, height: 10, borderRadius: 1,
                    background: group.accent, opacity: 0.8, flexShrink: 0,
                  }}/>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                    color: isActive('orgchart') ? 'var(--text)' : 'var(--text2)' }}>
                    Organisation
                  </span>
                </div>
              )}
              {/* Data Quality Elements group -- explicit ordered items */}
              {open && group.id === 'dq' && (
                <div
                  className={`nav-table-item ${isActive('table', 'critical_data_element') ? 'active' : ''}`}
                  onClick={() => onNavigate({ screen: 'table', table: 'critical_data_element' })}>
                  <span style={{ width: 3, height: 10, borderRadius: 1,
                    background: group.accent, opacity: 0.5, flexShrink: 0 }}/>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Data and Stewardship
                  </span>
                  <span className="nav-table-badge">{liveCounts['critical_data_element'] ?? 0}</span>
                </div>
              )}
              {open && group.id === 'dq' && (
                <div
                  className={`nav-table-item ${isActive('simulator') ? 'active' : ''}`}
                  onClick={() => onNavigate({ screen: 'simulator', table: null })}>
                  <span style={{ width: 3, height: 10, borderRadius: 1,
                    background: group.accent, opacity: 0.8, flexShrink: 0 }}/>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                    color: isActive('simulator') ? 'var(--text)' : 'var(--text2)' }}>
                    RAG Simulator
                  </span>
                </div>
              )}
              {open && group.id === 'dq' && (
                <div
                  className={`nav-table-item ${isActive('rulegenerator') ? 'active' : ''}`}
                  onClick={() => onNavigate({ screen: 'rulegenerator', table: null })}>
                  <span style={{ width: 3, height: 10, borderRadius: 1,
                    background: group.accent, opacity: 0.8, flexShrink: 0 }}/>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                    color: isActive('rulegenerator') ? 'var(--text)' : 'var(--text2)' }}>
                    Rule Generator
                  </span>
                </div>
              )}
              {open && group.id === 'dq' && (
                <div
                  className={`nav-table-item ${isActive('rulenav') ? 'active' : ''}`}
                  onClick={() => onNavigate({ screen: 'rulenav', table: null })}>
                  <span style={{ width: 3, height: 10, borderRadius: 1,
                    background: group.accent, opacity: 0.8, flexShrink: 0 }}/>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                    color: isActive('rulenav') ? 'var(--text)' : 'var(--text2)' }}>
                    Rules Explorer
                  </span>
                </div>
              )}
              {open && group.id === 'dq' && (
                <div
                  className={`nav-table-item ${isActive('table', 'source_table_ddl') ? 'active' : ''}`}
                  onClick={() => onNavigate({ screen: 'table', table: 'source_table_ddl' })}>
                  <span style={{ width: 3, height: 10, borderRadius: 1,
                    background: group.accent, opacity: 0.5, flexShrink: 0 }}/>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Profiling
                  </span>
                  <span className="nav-table-badge">{liveCounts['source_table_ddl'] ?? 0}</span>
                </div>
              )}
              {open && group.tables.map(t => {
                if (group.id === 'dq') return null;
                if (t === 'field_profiling') return null;
                if (t === 'executive_agency') return null;
                if (t === 'directorate') return null;
                const schema = SCHEMA[t];
                const count  = liveCounts[t] ?? 0;
                return (
                  <div key={t}
                    className={`nav-table-item ${isActive('table', t) ? 'active' : ''}`}
                    onClick={() => onNavigate({ screen: 'table', table: t })}>
                    <span style={{
                      width: 3, height: 10, borderRadius: 1,
                      background: group.accent, opacity: 0.5, flexShrink: 0,
                    }}/>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t === 'critical_data_element' ? 'Data and Stewardship' : schema.label}
                    </span>
                    <span className="nav-table-badge">{count}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Collapse toggle */}
      <div className="sidebar-toggle" onClick={toggleCollapse}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <Icon.ChevronR/> : <Icon.ChevronL/>}
      </div>
    </nav>
  );
}

// ===============================================================================
// AGGREGATED WEIGHT VIEW -- one card per agency showing all group weights
// Used by criticality_group_weight and quality_dimension_weight
// ===============================================================================
