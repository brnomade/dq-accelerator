function loadBaseVersion() {
  try { return localStorage.getItem(BASE_VERSION_KEY) || null; } catch { return null; }
}
function saveBaseVersion(v) {
  try { localStorage.setItem(BASE_VERSION_KEY, v); } catch {}
}
function loadBaseSnapshot() {
  try { return JSON.parse(localStorage.getItem(BASE_SNAPSHOT_KEY)) || null; } catch { return null; }
}
function saveBaseSnapshot(snapshot) {
  try { localStorage.setItem(BASE_SNAPSHOT_KEY, JSON.stringify(snapshot)); } catch {}
}

// Simple deterministic hash of a record for change detection
function hashRecord(record) {
  const str = JSON.stringify(record, Object.keys(record).sort());
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return h.toString(36);
}

// Build snapshot: { table: { pk: hash } } for delta-editable tables
function buildSnapshot(data) {
  const snap = {};
  for (const tbl of DELTA_TABLES) {
    snap[tbl] = {};
    const schema = SCHEMA[tbl];
    for (const row of (data[tbl] || [])) {
      snap[tbl][row[schema.pk]] = hashRecord(row);
    }
  }
  return snap;
}

// Generate next master version string: master-YYYYMMDD-NNN
function nextMasterVersion(current) {
  const now  = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const prefix = `master-${date}-`;
  if (current && current.startsWith(prefix)) {
    const seq = parseInt(current.slice(prefix.length)) || 0;
    return `${prefix}${String(seq + 1).padStart(3, '0')}`;
  }
  return `${prefix}001`;
}

const STEWARD_IDENTITY_KEY = 'moj_dq_steward_identity';

function loadStewardIdentity() {
  try { return JSON.parse(localStorage.getItem(STEWARD_IDENTITY_KEY)) || null; } catch { return null; }
}

const MASTER_DESIGNATION_KEY = 'moj_dq_master_v1';

function loadMasterDesignation() {
  try { return JSON.parse(localStorage.getItem(MASTER_DESIGNATION_KEY)) || null; } catch { return null; }
}

function saveMasterDesignation(stewardId) {
  try {
    localStorage.setItem(MASTER_DESIGNATION_KEY, JSON.stringify({ stewardId: stewardId }));
    window.dispatchEvent(new Event('storage'));
  } catch {}
}

function clearMasterDesignation() {
  try {
    localStorage.removeItem(MASTER_DESIGNATION_KEY);
    window.dispatchEvent(new Event('storage'));
  } catch {}
}

// Build delta: compare current data against base snapshot
// Returns { table: { inserted, updated, retired } } for changed tables only
function buildDelta(data, snapshot) {
  const changes = {};
  for (const tbl of DELTA_TABLES) {
    const schema   = SCHEMA[tbl];
    const pk       = schema.pk;
    const rows     = data[tbl] || [];
    const snap     = snapshot[tbl] || {};
    const inserted = [];
    const updated  = [];
    const retired  = [];

    for (const row of rows) {
      const id      = row[pk];
      const hash    = hashRecord(row);
      const wasSnap = snap[id] !== undefined;
      if (!wasSnap) {
        inserted.push(row);
      } else if (hash !== snap[id]) {
        if (row.retiring_timestamp) {
          retired.push(id);
        } else {
          updated.push(row);
        }
      }
    }

    if (inserted.length || updated.length || retired.length) {
      changes[tbl] = { inserted, updated, retired };
    }
  }
  return changes;
}

// ===============================================================================
// TASK 6 -- DELTA IMPORT: processing, merge application, report generation
// ===============================================================================

// Remap a record's own PK (if inserted) and any FK fields that point to
// newly inserted steward-namespace records, using the pkRemap lookup table.
function remapRecord(tbl, row, pkRemap) {
  const schema = SCHEMA[tbl];
  if (!schema) return row;
  const pkField = schema.pk;
  const out = { ...row };
  if (pkRemap[tbl] && pkRemap[tbl][out[pkField]] !== undefined) {
    out[pkField] = pkRemap[tbl][out[pkField]];
  }
  for (const col of schema.cols) {
    if (col.fk) {
      const fkTbl = col.fk.table;
      if (pkRemap[fkTbl] && pkRemap[fkTbl][out[col.name]] !== undefined) {
        out[col.name] = pkRemap[fkTbl][out[col.name]];
      }
    }
  }
  return out;
}

// Process a steward delta against current master data and base snapshot.
// Returns { remappedInserts, autoApplyUpdates, conflicts, pkRemap }.
// Retirements are always surfaced as conflicts -- master steward must decide.
function processDelta(delta, masterData, snapshot) {
  const changes = delta.changes || {};
  const tables  = Object.keys(changes);
  const snap    = snapshot || {};

  // Pass 1: assign fresh master-sequence PKs to all inserted records
  const pkRemap = {};
  for (const tbl of tables) {
    const schema = SCHEMA[tbl];
    if (!schema) continue;
    const pkField  = schema.pk;
    const inserted = changes[tbl].inserted || [];
    pkRemap[tbl]   = {};
    let maxPk = (masterData[tbl] || []).reduce((m, r) => Math.max(m, r[pkField] ?? 0), 0);
    for (const row of inserted) { pkRemap[tbl][row[pkField]] = ++maxPk; }
  }

  // Pass 2: remap inserted records (own PK + FK fields)
  const remappedInserts = {};
  for (const tbl of tables) {
    remappedInserts[tbl] = (changes[tbl].inserted || []).map(r => remapRecord(tbl, r, pkRemap));
  }

  // Pass 3: remap FK fields in updated records (may reference newly inserted records)
  const remappedUpdates = {};
  for (const tbl of tables) {
    remappedUpdates[tbl] = (changes[tbl].updated || []).map(r => remapRecord(tbl, r, pkRemap));
  }

  // Pass 4: conflict detection for updates
  const autoApplyUpdates = [];
  const conflicts = [];

  for (const tbl of tables) {
    const schema     = SCHEMA[tbl];
    if (!schema) continue;
    const pkField    = schema.pk;
    const masterRows = masterData[tbl] || [];
    const snapTable  = snap[tbl] || {};

    for (const stewardRow of (remappedUpdates[tbl] || [])) {
      const pkVal     = stewardRow[pkField];
      const masterRow = masterRows.find(r => r[pkField] === pkVal);
      if (!masterRow) continue;
      if (hashRecord(masterRow) === snapTable[pkVal]) {
        autoApplyUpdates.push({ table: tbl, row: stewardRow });
      } else {
        conflicts.push({ table: tbl, pk: pkVal, masterRow, stewardRow, type: 'update' });
      }
    }

    // Pass 5: retirements always become conflicts
    for (const retiredPk of (changes[tbl].retired || [])) {
      const masterRow = masterRows.find(r => r[pkField] === retiredPk);
      if (!masterRow || masterRow.retiring_timestamp) continue;
      conflicts.push({ table: tbl, pk: retiredPk, masterRow, stewardRow: null, type: 'retire' });
    }
  }

  return { remappedInserts, autoApplyUpdates, conflicts, pkRemap };
}

// Apply resolved merge to master data. Returns new merged data object.
function applyMergedChanges(masterData, processResult, resolutions, insertSelections) {
  const { remappedInserts, autoApplyUpdates, conflicts } = processResult;
  const merged = {};
  for (const tbl of Object.keys(masterData)) merged[tbl] = [...(masterData[tbl] || [])];

  for (const tbl of Object.keys(remappedInserts)) {
    if (!merged[tbl]) merged[tbl] = [];
    const pkField = SCHEMA[tbl].pk;
    const accepted = insertSelections
      ? remappedInserts[tbl].filter(row => insertSelections[tbl + ':' + row[pkField]] !== false)
      : remappedInserts[tbl];
    merged[tbl] = [...merged[tbl], ...accepted];
  }
  for (const { table: tbl, row } of autoApplyUpdates) {
    const pkField = SCHEMA[tbl].pk;
    merged[tbl] = merged[tbl].map(r => r[pkField] === row[pkField] ? row : r);
  }
  for (const { table: tbl, pk: pkVal, stewardRow, type } of conflicts) {
    const resolution = resolutions[`${tbl}:${pkVal}`] || 'master';
    if (resolution === 'master') continue;
    const pkField = SCHEMA[tbl].pk;
    if (type === 'retire') {
      merged[tbl] = merged[tbl].map(r =>
        r[pkField] === pkVal ? { ...r, retiring_timestamp: new Date().toISOString() } : r
      );
    } else {
      merged[tbl] = merged[tbl].map(r => r[pkField] === pkVal ? stewardRow : r);
    }
  }
  return merged;
}

// Build merge report object for JSON download
function buildMergeReport(delta, processResult, resolutions, insertSelections) {
  const { remappedInserts, autoApplyUpdates, conflicts, pkRemap } = processResult;
  const applied = {};
  const tally = (tbl, field) => {
    if (!applied[tbl]) applied[tbl] = { inserted: 0, updated: 0, retired: 0 };
    applied[tbl][field]++;
  };
  for (const tbl of Object.keys(remappedInserts)) {
    const pkField = SCHEMA[tbl] ? SCHEMA[tbl].pk : null;
    (remappedInserts[tbl] || []).forEach(row => {
      const key = pkField ? (tbl + ':' + row[pkField]) : null;
      if (!insertSelections || !key || insertSelections[key] !== false) tally(tbl, 'inserted');
    });
  }
  for (const { table: tbl } of autoApplyUpdates) tally(tbl, 'updated');
  for (const c of conflicts) {
    if ((resolutions[`${c.table}:${c.pk}`] || 'master') === 'steward') {
      tally(c.table, c.type === 'retire' ? 'retired' : 'updated');
    }
  }
  const pkRemapReport = {};
  for (const tbl of Object.keys(pkRemap)) {
    if (Object.keys(pkRemap[tbl]).length) pkRemapReport[tbl] = pkRemap[tbl];
  }
  let totalInserted = 0, totalUpdated = 0, totalRetired = 0;
  for (const t of Object.keys(applied)) {
    totalInserted += applied[t].inserted;
    totalUpdated  += applied[t].updated;
    totalRetired  += applied[t].retired;
  }

  // Inserts summary: track proposed vs accepted vs rejected
  let insertsProposed = 0, insertsAccepted = 0;
  const rejectedByTable = {};
  for (const tbl of Object.keys(remappedInserts)) {
    const pkField = SCHEMA[tbl] ? SCHEMA[tbl].pk : null;
    (remappedInserts[tbl] || []).forEach(row => {
      insertsProposed++;
      const key = pkField ? (tbl + ':' + row[pkField]) : null;
      if (!insertSelections || !key || insertSelections[key] !== false) {
        insertsAccepted++;
      } else {
        rejectedByTable[tbl] = (rejectedByTable[tbl] || 0) + 1;
      }
    });
  }

  return {
    _type:         'merge_report',
    _merged_at:    new Date().toISOString(),
    _steward_id:   delta._steward_id,
    _steward_name: delta._steward_name,
    _base_version: delta._base_version,
    pk_remaps:     pkRemapReport,
    applied,
    conflicts: conflicts.map(c => ({
      table:      c.table,
      pk:         c.pk,
      type:       c.type,
      resolution: resolutions[`${c.table}:${c.pk}`] || 'master',
    })),
    inserts_summary: {
      total_proposed: insertsProposed,
      accepted:       insertsAccepted,
      rejected:       insertsProposed - insertsAccepted,
      rejected_by_table: rejectedByTable,
    },
    summary: {
      total_inserted:  totalInserted,
      total_updated:   totalUpdated,
      total_retired:   totalRetired,
      total_conflicts: conflicts.length,
    },
  };
}

function AppHeader({ savedAt, totalRows, onShowReset, isMaster, stewardIdentity }) {
  const [showSettings, setShowSettings] = useState(false);
  const [logo,         setLogo]         = useState(() => loadClientLogo());

  const handleSettingsClose = () => {
    setShowSettings(false);
    setLogo(loadClientLogo());
  };

  // Listen for logo changes from other tabs
  useEffect(() => {
    const handler = () => setLogo(loadClientLogo());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <>
      <header className="app-header">
        <div className="header-left">
          <div className="header-app-id">
            <div>
              <div className="header-app-name">Data Quality Accelerator</div>
              <div className="header-app-sub"><!-- INJECT_BUILD --></div>
            </div>
          </div>
        </div>

        <div className="header-right">
          {/* Steward identity */}
          {stewardIdentity && (
            <div style={{ display:'flex', alignItems:'center', gap:6,
              padding:'3px 10px', background:'var(--bg3)',
              border:`1px solid ${isMaster ? 'rgba(245,166,35,0.4)' : 'var(--border)'}`,
              borderRadius:'var(--radius)',
              fontSize:11, color:'var(--text2)', fontFamily:'var(--mono)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {stewardIdentity.name}
              {isMaster && (
                <span style={{ fontSize:9, fontWeight:700,
                  color:'var(--amber)', background:'rgba(245,166,35,0.15)',
                  border:'1px solid rgba(245,166,35,0.4)',
                  borderRadius:3, padding:'1px 5px', marginLeft:2 }}>
                  MASTER
                </span>
              )}
            </div>
          )}
          {totalRows > 0 && (
            <span className="header-meta">
              {totalRows.toLocaleString()} records
              {savedAt && ` - saved ${new Date(savedAt).toLocaleTimeString()}`}
            </span>
          )}
          <button className="btn btn-ghost" style={{ padding:'6px 10px' }}
            onClick={() => window.open('user-guide/index.html', '_blank')}
            title="User Guide">
            <Icon.Book/>
          </button>
          <button className="btn btn-ghost" style={{ padding:'6px 10px' }}
            onClick={() => setShowSettings(true)} title="Settings">
            <Icon.Settings/>
          </button>
          {totalRows > 0 && (
            <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={onShowReset}>
              <Icon.Trash/> Reset data
            </button>
          )}
        </div>
      </header>

      {showSettings && <SettingsPanel onClose={handleSettingsClose}/>}
    </>
  );
}

// ===============================================================================
// TASK 4 -- FOOTER
// ===============================================================================
function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="app-footer">
      <span className="footer-copy">(c) {year} Cognizant Technology Solutions</span>
      <div className="footer-logo">
        {/* Cognizant wordmark as inline SVG */}
        <svg height="14" viewBox="0 0 140 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Cognizant">
          <text x="0" y="18" fontFamily="'IBM Plex Sans', sans-serif" fontSize="15" fontWeight="600" fill="#5f7294" letterSpacing="0.5">Cognizant</text>
        </svg>
      </div>
    </footer>
  );
}

