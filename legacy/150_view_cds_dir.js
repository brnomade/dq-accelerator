// ===============================================================================
// CRITICAL DATA SET VIEW -- grouped by agency, sub-rows per data set
// ===============================================================================
function CriticalDataSetView() {
  const { data, retireRecord, restoreRecord, openForm, nextPk, canEdit } = useApp();
  const dp = !canEdit ? { style:{ opacity:0.35, cursor:'not-allowed', pointerEvents:'none' }, title:'Set your steward identity in Settings to make changes' } : {};

  const [search,      setSearch]      = useState('');
  const [showRetired, setShowRetired] = useState(false);

  const rows        = data?.critical_data_set || [];
  const directorates = data?.directorate || [];
  const agencies    = data?.executive_agency || [];
  const accent      = TABLE_GROUPS.find(g => g.tables.includes('critical_data_set'))?.accent || 'var(--accent)';

  const dirById = useMemo(() =>
    Object.fromEntries(directorates.map(d => [d.directorate_id, d])),
  [directorates]);

  const agencyById = useMemo(() =>
    Object.fromEntries(agencies.map(a => [a.executive_agency_id, a])),
  [agencies]);

  // openAdd optionally pre-sets the agency via filterAgencyId seed on the blank record
  const openAdd = (preAgencyId) => {
    const blank = buildBlankRecord('critical_data_set', nextPk, data);
    // Pass a __preAgencyId hint so RecordFormPanel can seed filterAgencyId
    openForm('critical_data_set', preAgencyId ? { ...blank, __preAgencyId: preAgencyId } : blank);
  };
  const openEdit = (row) => openForm('critical_data_set', { ...row });

  const liveCount    = rows.filter(r => !r.retiring_timestamp).length;
  const retiredCount = rows.filter(r =>  r.retiring_timestamp).length;

  // Group data sets by agency (via directorate), sort agency A->Z, sets A->Z within
  const grouped = useMemo(() => {
    const visible = showRetired ? rows : rows.filter(r => !r.retiring_timestamp);
    const map = {};
    for (const row of visible) {
      const dir = dirById[row.directorate_id];
      const aid = dir?.executive_agency_id ?? '__unknown__';
      if (!map[aid]) map[aid] = [];
      map[aid].push(row);
    }
    let entries = Object.entries(map).map(([aid, sets]) => {
      const agency = aid === '__unknown__' ? null : agencyById[parseInt(aid)];
      return {
        agencyId: aid,
        agency,
        sets: [...sets].sort((a, b) => (a.data_set_name || '').localeCompare(b.data_set_name || '')),
      };
    }).sort((a, b) =>
      (a.agency?.agency_acronymn || 'ZZZ').localeCompare(b.agency?.agency_acronymn || 'ZZZ')
    );

    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries
        .map(entry => ({
          ...entry,
          sets: entry.sets.filter(s =>
            (s.data_set_name        || '').toLowerCase().includes(q) ||
            (s.data_set_description || '').toLowerCase().includes(q) ||
            (dirById[s.directorate_id]?.directorate_name || '').toLowerCase().includes(q) ||
            (entry.agency?.agency_acronymn || '').toLowerCase().includes(q) ||
            (entry.agency?.agency_name     || '').toLowerCase().includes(q)
          ),
        }))
        .filter(entry => entry.sets.length > 0);
    }
    return entries;
  }, [rows, showRetired, search, dirById, agencyById]);

  const agencyCount = grouped.length;

  return (
    <div className="fade-in">
      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            {SCHEMA.critical_data_set.label}
          </div>
          <div className="page-sub">
            {agencyCount} agenc{agencyCount !== 1 ? 'ies' : 'y'} - {liveCount} live records
            {retiredCount > 0 && ` - ${retiredCount} retired`}
          </div>
        </div>
        <button {...dp} className="btn btn-primary" style={{ marginTop:4 }} onClick={() => openAdd()}>
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
            placeholder="Search by agency, directorate or data set name..."
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
          {grouped.map(({ agencyId, agency, sets }) => (
            <div key={agencyId} style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${accent}`,
              borderRadius: 'var(--radius-lg)',
              padding: '12px 14px',
            }}>
              {/* Agency header */}
              <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:10 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>
                  {agency?.agency_acronymn || 'Unknown agency'}
                </span>
                {agency?.agency_name &&
                  <span style={{ fontSize:11, color:'var(--text3)' }}>{agency.agency_name}</span>
                }
                <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text3)',
                  fontFamily:'var(--mono)' }}>
                  {sets.length} CDS{sets.length !== 1 ? 's' : ''}
                </span>
                {/* Per-agency Add button */}
                <button {...dp} className="btn btn-ghost" style={{ fontSize:11, padding:'2px 8px', marginLeft:6 }}
                  onClick={() => openAdd(agency?.executive_agency_id)}
                  title={`Add data set to ${agency?.agency_acronymn || 'this agency'}`}>
                  <Icon.Plus/>
                </button>
              </div>

              {/* Data set sub-rows */}
              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                {sets.map(ds => {
                  const pk        = ds.critical_data_set_id;
                  const isRetired = !!ds.retiring_timestamp;
                  const dir       = dirById[ds.directorate_id];
                  return (
                    <div key={pk} style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'7px 10px',
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      opacity: isRetired ? 0.5 : 1,
                    }}>
                      {/* Name + directorate */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, color:'var(--text)', fontWeight:500,
                          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {ds.data_set_name || `Data Set #${pk}`}
                          {isRetired &&
                            <span style={{ marginLeft:6, fontSize:10, color:'var(--text3)',
                              fontWeight:400 }}>(retired)</span>
                          }
                        </div>
                        {dir &&
                          <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                            {dir.directorate_name}
                          </div>
                        }
                      </div>

                      {/* Actions */}
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        {!isRetired && (
                          <button {...dp} className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
                            onClick={() => openEdit(ds)} title="Edit">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        )}
                        {isRetired ? (
                          <button {...dp} className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
                            onClick={() => canEdit && restoreRecord('critical_data_set', pk)}>
                            <Icon.Eye/>
                          </button>
                        ) : (
                          <button {...dp} className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
                            onClick={() => canEdit && retireRecord('critical_data_set', pk)} title="Retire">
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
// DIRECTORATE VIEW -- grouped by agency, sub-rows per directorate
// ===============================================================================
