function DirectorateView() {
  const { data, restoreRecord, openForm, nextPk, canEdit, openRetireConfirm } = useApp();
  const dp = !canEdit ? { style:{ opacity:0.35, cursor:'not-allowed', pointerEvents:'none' }, title:'Set your steward identity in Settings to make changes' } : {};

  const [search,      setSearch]      = useState('');
  const [showRetired, setShowRetired] = useState(false);

  const rows    = data?.directorate || [];
  const agencies = data?.executive_agency || [];
  const accent  = TABLE_GROUPS.find(g => g.tables.includes('directorate'))?.accent || 'var(--accent)';

  const agencyById = useMemo(() =>
    Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])),
  [agencies]);

  const openAdd            = () => openForm('directorate', buildBlankRecord('directorate', nextPk, data));
  const openAddForAgency   = (agencyId) => openForm('directorate', { ...buildBlankRecord('directorate', nextPk, data), executive_agency_id: agencyId });
  const openEdit           = (row) => openForm('directorate', { ...row });

  const liveCount    = rows.filter(r => !r.retiring_timestamp).length;
  const retiredCount = rows.filter(r =>  r.retiring_timestamp).length;

  // Group directorates by agency, apply filters, sort
  const grouped = useMemo(() => {
    const visible = showRetired ? rows : rows.filter(r => !r.retiring_timestamp);
    const map = {};
    for (const row of visible) {
      const aid = row.executive_agency_id;
      if (!map[aid]) map[aid] = [];
      map[aid].push(row);
    }
    let entries = Object.entries(map).map(([aid, dirs]) => ({
      agencyId: parseInt(aid),
      agency:   agencyById[parseInt(aid)],
      dirs:     [...dirs].sort((a, b) => (a.directorate_name || '').localeCompare(b.directorate_name || '')),
    })).sort((a, b) =>
      (a.agency?.agency_acronymn || '').localeCompare(b.agency?.agency_acronymn || '')
    );

    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries
        .map(entry => ({
          ...entry,
          dirs: entry.dirs.filter(d =>
            (d.directorate_name     || '').toLowerCase().includes(q) ||
            (d.directorate_acronymn || '').toLowerCase().includes(q) ||
            (entry.agency?.agency_acronymn || '').toLowerCase().includes(q) ||
            (entry.agency?.agency_name     || '').toLowerCase().includes(q)
          ),
        }))
        .filter(entry => entry.dirs.length > 0);
    }
    return entries;
  }, [rows, showRetired, search, agencyById]);

  const agencyCount = grouped.length;

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            {SCHEMA.directorate.label}
          </div>
          <div className="page-sub">
            {agencyCount} agenc{agencyCount !== 1 ? 'ies' : 'y'} - {liveCount} live records
            {retiredCount > 0 && ` - ${retiredCount} retired`}
          </div>
        </div>
        <button {...dp} className="btn btn-primary" style={{ marginTop:4 }} onClick={openAdd}>
          <Icon.Plus/> Add record
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ flex:1, position:'relative' }}>
          <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
            color:'var(--text3)', width:14, height:14, pointerEvents:'none' }}>
            <Icon.Search/>
          </div>
          <input className="table-search" style={{ paddingLeft:32 }}
            placeholder="Search by agency or directorate..."
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {retiredCount > 0 && (
          <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer',
            whiteSpace:'nowrap', fontSize:12, color:'var(--text3)' }}>
            <div className="toggle" style={{ width:30, height:16 }}>
              <input type="checkbox" checked={showRetired}
                onChange={e => setShowRetired(e.target.checked)}/>
              <div className="toggle-track"/>
              <div className="toggle-thumb" style={{ width:10, height:10, top:3, left:3 }}/>
            </div>
            Show retired
          </label>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="status-row status-info">No records match the current filter.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {grouped.map(({ agencyId, agency, dirs }) => (
            <div key={agencyId} style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${accent}`,
              borderRadius: 'var(--radius-lg)',
              padding: '12px 14px',
            }}>
              {/* Agency header */}
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                  {agency?.agency_acronymn || `Agency #${agencyId}`}
                </span>
                {agency?.agency_name &&
                  <span style={{ fontSize:11, color:'var(--text3)' }}>{agency.agency_name}</span>
                }
                <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text3)',
                  fontFamily:'var(--mono)' }}>
                  {dirs.length} directorate{dirs.length !== 1 ? 's' : ''}
                </span>
                <button {...dp} className="btn btn-ghost"
                  style={{ fontSize:10, padding:'2px 8px', flexShrink:0 }}
                  title="Add a new directorate to this agency"
                  onClick={() => openAddForAgency(agencyId)}>
                  <Icon.Plus/> Add
                </button>
              </div>

              {/* Directorate sub-rows */}
              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                {dirs.map(dir => {
                  const pk        = dir.directorate_id;
                  const isRetired = !!dir.retiring_timestamp;
                  return (
                    <div key={pk} style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'6px 10px',
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      opacity: isRetired ? 0.5 : 1,
                    }}>
                      {/* Acronym pill */}
                      <span style={{
                        fontFamily:'var(--mono)', fontSize:10, fontWeight:600,
                        color: accent, background:'var(--bg)',
                        border:`1px solid ${accent}25`,
                        borderRadius:3, padding:'1px 6px',
                        whiteSpace:'nowrap', flexShrink:0,
                      }}>
                        {dir.directorate_acronymn || '--'}
                      </span>

                      {/* Full name */}
                      <span style={{ fontSize:12, color:'var(--text2)', flex:1 }}>
                        {dir.directorate_name || `Directorate #${pk}`}
                        {isRetired &&
                          <span style={{ marginLeft:6, fontSize:10, color:'var(--text3)' }}>
                            (retired)
                          </span>
                        }
                      </span>

                      {/* Actions */}
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        {!isRetired && (
                          <button {...dp} className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
                            onClick={() => openEdit(dir)} title="Edit">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                        {isRetired ? (
                          <button {...dp} className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
                            onClick={() => canEdit && restoreRecord('directorate', pk)}>
                            <Icon.Eye/>
                          </button>
                        ) : (
                          <button {...dp} className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
                            onClick={() => canEdit && openRetireConfirm('directorate', pk)} title="Retire">
                            <Icon.EyeOff/>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// RECORD FORM PANEL -- slide-in add/edit form for any table
// Tier 1: tables with no FK fields (pure string/int/float/bool inputs)
// Tier 2+: FK dropdowns wired in the same component via schema.fk definitions
// ===============================================================================

// Build a blank record with sensible defaults for a given table
