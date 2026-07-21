// ===============================================================================
// NO-DATA SCREEN
// ===============================================================================
function NoDataScreen({ onNavigateImport }) {
  return (
    <div className="fade-in" style={{ display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', minHeight:'60vh', textAlign:'center' }}>
      <div className="nodata-icon" style={{ opacity:0.2, marginBottom:20 }}><Icon.Database/></div>
      <div className="page-title" style={{ marginBottom:8 }}>No data loaded</div>
      <div className="page-sub" style={{ marginBottom:20 }}>Import your Excel workbook to get started.</div>
      <button className="btn btn-primary" onClick={onNavigateImport}>
        <Icon.Upload/> Go to import
      </button>
    </div>
  );
}

// ===============================================================================
// TASK 5b -- BREADCRUMB
// ===============================================================================
function Breadcrumb({ route }) {
  if (route.screen === 'dashboard') return null;
  if (route.screen === 'import')    return null;
  if (route.screen === 'rulenav') {
    return (
      <div className="breadcrumb">
        <span style={{ color:'var(--green)' }}>Data Quality Elements</span>
        <span className="breadcrumb-sep">&#x203a;</span>
        <span className="breadcrumb-current">Rules Explorer</span>
      </div>
    );
  }
  if (route.screen === 'orgchart') {
    return (
      <div className="breadcrumb">
        <span style={{ color:'#18b4d4' }}>Ownership Hierarchy</span>
        <span className="breadcrumb-sep">&#x203a;</span>
        <span className="breadcrumb-current">Organisation</span>
      </div>
    );
  }
  if (route.screen === 'export') {
    return (
      <div className="breadcrumb">
        <span className="breadcrumb-current">Export</span>
      </div>
    );
  }
  if (route.screen === 'databrowser') {
    return (
      <div className="breadcrumb">
        <span className="breadcrumb-current">Data Browser</span>
      </div>
    );
  }
  if (route.screen === 'assistant') {
    return (
      <div className="breadcrumb">
        <span style={{ color:'var(--accent)' }}>AI Tools</span>
        <span className="breadcrumb-sep">&#x203a;</span>
        <span className="breadcrumb-current">DQ Assistant</span>
      </div>
    );
  }
  if (route.screen === 'table' && route.table) {
    const group      = TABLE_GROUPS.find(g => g.tables.includes(route.table));
    const schema     = SCHEMA[route.table];
    const crumbLabel = route.table === 'critical_data_element' ? 'Data and Stewardship' : schema?.label;
    return (
      <div className="breadcrumb">
        {group && <><span style={{ color:group.accent }}>{group.label}</span><span className="breadcrumb-sep">&#x203a;</span></>}
        <span className="breadcrumb-current">{crumbLabel}</span>
      </div>
    );
  }
  return null;
}

// ===============================================================================
// ROOT APP -- single source of state, also provides AppContext directly
// ===============================================================================
function App() {
  // -- Core state ------------------------------------------
  const stored = useMemo(() => loadFromStorage(), []);
  const [data,         setData]         = useState(stored?.data || null);
  const [savedAt,      setSavedAt]      = useState(stored?.savedAt || null);
  const [route,        setRoute]        = useState(() =>
    stored?.data ? { screen:'dashboard', table:null } : { screen:'import', table:null }
  );
  const [resetStage,        setResetStage]        = useState(0); // 0=hidden, 1=first confirm, 2=second confirm (pending changes)
  const [resetPendingCount, setResetPendingCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => loadSidebarPrefs().collapsed);

  // -- Lookups rebuild whenever data changes ----------------
  const lookups = useMemo(() => data ? buildLookups(data) : {}, [data]);

  // -- Persist helper ---------------------------------------
  const persist = useCallback((newData) => {
    saveToStorage(newData);
    setSavedAt(new Date().toISOString());
  }, []);

  // -- Context operations -----------------------------------
  const updateTable = useCallback((tableName, rows) => {
    setData(prev => { const n = {...prev, [tableName]:rows}; persist(n); return n; });
  }, [persist]);

  const upsertRecord = useCallback((tableName, record) => {
    if (!stewardIdentity) return;
    const pk = SCHEMA[tableName]?.pk;
    if (!pk) return;
    setData(prev => {
      const rows = prev[tableName] || [];
      const idx  = rows.findIndex(r => r[pk] === record[pk]);
      const next = idx >= 0 ? [...rows.slice(0,idx), record, ...rows.slice(idx+1)] : [...rows, record];
      const n = {...prev, [tableName]:next}; persist(n); return n;
    });
  }, [persist, stewardIdentity]);

  const retireRecord = useCallback((tableName, pkValue) => {
    if (!stewardIdentity) return;
    const pk = SCHEMA[tableName]?.pk;
    if (!pk) return;
    setData(prev => {
      const rows = prev[tableName] || [];
      const next = rows.map(r => r[pk]===pkValue ? {...r, retiring_timestamp:new Date().toISOString()} : r);
      const n = {...prev, [tableName]:next}; persist(n); return n;
    });
  }, [persist, stewardIdentity]);

  const restoreRecord = useCallback((tableName, pkValue) => {
    if (!stewardIdentity) return;
    const pk = SCHEMA[tableName]?.pk;
    if (!pk) return;
    setData(prev => {
      const rows = prev[tableName] || [];
      const next = rows.map(r => r[pk]===pkValue ? {...r, retiring_timestamp:null} : r);
      const n = {...prev, [tableName]:next}; persist(n); return n;
    });
  }, [persist, stewardIdentity]);

  const nextPk = useCallback((tableName) => {
    const pk = SCHEMA[tableName]?.pk;
    if (!pk || !data) return 1;
    const rows = data[tableName] || [];

    // Steward namespace: steward_id * 1000000 + sequence
    // Master or unidentified: standard max+1 sequence
    if (stewardIdentity && !isMaster) {
      const ns      = stewardIdentity.id * 1000000;
      const nsMax   = rows
        .filter(r => (r[pk] ?? 0) > ns && (r[pk] ?? 0) < ns + 1000000)
        .reduce((m, r) => Math.max(m, r[pk] ?? 0), ns);
      return nsMax + 1;
    }
    return rows.reduce((m, r) => Math.max(m, r[pk] ?? 0), 0) + 1;
  }, [data, stewardIdentity, isMaster]);

  const designateAsMaster = useCallback((stewardDsId) => {
    setData(prev => {
      const rows  = (prev && prev.stewardship) ? prev.stewardship : [];
      const maxPk = rows.reduce((m, r) => Math.max(m, r.stewardship_id ?? 0), 0);
      const rec   = {
        stewardship_id:       maxPk + 1,
        critical_data_set_id: 0,
        data_steward_id:      stewardDsId,
        retiring_timestamp:   null,
      };
      const n = { ...prev, stewardship: [...rows, rec] };
      persist(n);
      return n;
    });
  }, [persist]);

  // -- Navigation & import ----------------------------------
  const navigate = useCallback((newRoute) => setRoute(newRoute), []);

  const handleImport = useCallback((importedData, importLog) => {
    setData(importedData);
    persist(importedData);
    const hasErrors = importLog && importLog.some(function(e) { return e.level === 'err'; });
    if (!hasErrors) setRoute({ screen:'dashboard', table:null });
  }, [persist]);

  const handleDeltaMerge = useCallback((mergedData) => {
    setData(mergedData);
    persist(mergedData);
  }, [persist]);

  const handleReset = () => {
    clearStorage();
    localStorage.removeItem(STEWARD_IDENTITY_KEY);
    localStorage.removeItem(BASE_VERSION_KEY);
    localStorage.removeItem(BASE_SNAPSHOT_KEY);
    setData(null);
    setSavedAt(null);
    setStewardIdentityState(null);
    setRoute({ screen:'import', table:null });
    setResetStage(0);
  };

  const handleShowReset = () => {
    if (resetStage > 0) { setResetStage(0); return; }
    let count = 0;
    if (!isMaster) {
      const snapshot = loadBaseSnapshot();
      if (snapshot) {
        const changes = buildDelta(data || {}, snapshot);
        count = Object.values(changes).reduce(
          (s, t) => s + t.inserted.length + t.updated.length + t.retired.length, 0
        );
      }
    }
    setResetPendingCount(count);
    setResetStage(1);
  };

  // -- Sidebar collapse callback (passed to Sidebar) --------
  const onSidebarToggle = useCallback((collapsed) => {
    setSidebarCollapsed(collapsed);
  }, []);

  // -- Global form panel state (lifted above scroll container)
  const [formRecord,   setFormRecord]   = useState(null);
  const [formTable,    setFormTable]    = useState(null);
  const openForm  = useCallback((tableName, record) => {
    if (!stewardIdentity) return;
    setFormTable(tableName); setFormRecord(record);
  }, [stewardIdentity]);
  const closeForm = useCallback(() => {
    setFormTable(null); setFormRecord(null);
  }, []);
  const handleFormSave = useCallback((record) => {
    upsertRecord(formTable, record); closeForm();
  }, [formTable, upsertRecord, closeForm]);

  const handleCdsSave = useCallback((record) => {
    const stewardId            = record.__stewardId ?? null;
    const addStewardId         = record.__addStewardId ?? null;
    const removeStewardshipIds = record.__removeStewardshipIds ?? [];
    const cdsRecord = { ...record };
    delete cdsRecord.__stewardId;
    delete cdsRecord.__addStewardId;
    delete cdsRecord.__removeStewardshipIds;
    upsertRecord('critical_data_set', cdsRecord);
    if (stewardId) {
      upsertRecord('stewardship', {
        stewardship_id:       nextPk('stewardship'),
        critical_data_set_id: cdsRecord.critical_data_set_id,
        data_steward_id:      stewardId,
        retiring_timestamp:   null,
      });
    }
    for (const sid of removeStewardshipIds) retireRecord('stewardship', sid);
    if (addStewardId) {
      upsertRecord('stewardship', {
        stewardship_id:       nextPk('stewardship'),
        critical_data_set_id: cdsRecord.critical_data_set_id,
        data_steward_id:      addStewardId,
        retiring_timestamp:   null,
      });
    }
    closeForm();
  }, [upsertRecord, retireRecord, nextPk, closeForm]);

  const handleAgencySave = useCallback((record) => {
    const newPatron      = record.__newPatron      ?? null;
    const reassignPatron = record.__reassignPatron ?? null;
    const removePatrons  = record.__removePatrons  ?? [];
    const patronPk       = newPatron?.name ? nextPk('data_patron') : null;
    const agencyRecord   = { ...record };
    delete agencyRecord.__newPatron;
    delete agencyRecord.__reassignPatron;
    delete agencyRecord.__removePatrons;

    const isNew = !(data.executive_agency || []).some(
      r => r.executive_agency_id === agencyRecord.executive_agency_id
    );

    upsertRecord('executive_agency', agencyRecord);

    if (isNew) {
      const agencyId   = agencyRecord.executive_agency_id;
      const dimensions = (data.quality_dimension  || []).filter(d => !d.retiring_timestamp);
      const critGroups = (data.criticality_group  || []).filter(g => !g.retiring_timestamp);
      let qdwPk = nextPk('quality_dimension_weight');
      for (const dim of dimensions) {
        upsertRecord('quality_dimension_weight', {
          quality_dimension_weight_id: qdwPk++,
          executive_agency_id:         agencyId,
          quality_dimension_id:        dim.quality_dimension_id,
          weight_value:                1,
          retiring_timestamp:          null,
        });
      }
      let cgwPk = nextPk('criticality_group_weight');
      for (const grp of critGroups) {
        upsertRecord('criticality_group_weight', {
          criticality_group_weight_id: cgwPk++,
          executive_agency_id:         agencyId,
          criticality_group_id:        grp.criticality_group_id,
          weight_value:                1,
          retiring_timestamp:          null,
        });
      }
    }

    if (newPatron?.name) {
      upsertRecord('data_patron', {
        data_patron_id:        patronPk,
        executive_agency_id:   agencyRecord.executive_agency_id,
        data_patron_name:      newPatron.name,
        data_patron_title:     newPatron.title     || null,
        data_patron_email:     newPatron.email     || null,
        assignment_start_date: newPatron.startDate,
        retiring_timestamp:    null,
      });
    }

    if (reassignPatron) {
      upsertRecord('data_patron', {
        ...reassignPatron,
        executive_agency_id: agencyRecord.executive_agency_id,
      });
    }

    for (const p of removePatrons) {
      upsertRecord('data_patron', p);
    }

    closeForm();
  }, [upsertRecord, nextPk, closeForm, data]);

  const [critFormCdeId,     setCritFormCdeId]     = useState(null);
  const [critFormRows,      setCritFormRows]      = useState(null);
  const [critFormPreAgency, setCritFormPreAgency] = useState(null);
  const [critFormPreDir,    setCritFormPreDir]    = useState(null);
  const [critFormPreCds,    setCritFormPreCds]    = useState(null);
  const openCritForm  = useCallback((cdeId, rows, preAgencyId, preDirId, preCdsId) => {
    if (!stewardIdentity) return;
    setCritFormCdeId(cdeId);
    setCritFormRows(rows);
    setCritFormPreAgency(preAgencyId ?? null);
    setCritFormPreDir(preDirId ?? null);
    setCritFormPreCds(preCdsId ?? null);
  }, [stewardIdentity]);
  const closeCritForm = useCallback(() => {
    setCritFormCdeId(null); setCritFormRows(null);
    setCritFormPreAgency(null); setCritFormPreDir(null); setCritFormPreCds(null);
  }, []);

  // Rule allocation form state
  const [allocFormRecord, setAllocFormRecord] = useState(null);
  const [allocFormIsEdit, setAllocFormIsEdit] = useState(false);
  const openAllocForm  = useCallback((record, isEdit) => {
    if (!stewardIdentity) return;
    setAllocFormRecord(record); setAllocFormIsEdit(!!isEdit);
  }, [stewardIdentity]);

  // CDE form state
  const [cdeFormRecord,   setCdeFormRecord]   = useState(null);
  const [cdeFormIsEdit,   setCdeFormIsEdit]   = useState(false);
  const [cdeFormPreCdsId, setCdeFormPreCdsId] = useState(null);
  const [cdeFormPreTable, setCdeFormPreTable] = useState(null);
  const [cdeFormPreDb,    setCdeFormPreDb]    = useState(null);
  const openCdeForm = useCallback((record, isEdit, preCdsId, preTable, preDb) => {
    if (!stewardIdentity) return;
    setCdeFormRecord(record); setCdeFormIsEdit(!!isEdit);
    setCdeFormPreCdsId(preCdsId ?? null); setCdeFormPreTable(preTable ?? null);
    setCdeFormPreDb(preDb ?? null);
  }, [stewardIdentity]);
  const closeCdeForm = useCallback(() => {
    setCdeFormRecord(null); setCdeFormIsEdit(false);
    setCdeFormPreCdsId(null); setCdeFormPreTable(null); setCdeFormPreDb(null);
  }, []);
  const handleCdeSave = useCallback((record) => {
    const crits = record.__criticalities ?? null;
    const cdeRecord = { ...record };
    delete cdeRecord.__criticalities;
    upsertRecord('critical_data_element', cdeRecord);
    if (crits) {
      for (const crit of crits) upsertRecord('cde_criticality', crit);
    }
    closeCdeForm();
  }, [upsertRecord, closeCdeForm]);
  const closeAllocForm = useCallback(() => {
    setAllocFormRecord(null); setAllocFormIsEdit(false);
  }, []);
  const handleAllocSave = useCallback((record) => {
    upsertRecord('data_quality_rule_allocation', record); closeAllocForm();
  }, [upsertRecord, closeAllocForm]);

  // DDL form state
  const [ddlFormRecord, setDdlFormRecord] = useState(null);
  const openDdlForm  = useCallback((record) => {
    if (!stewardIdentity) return;
    setDdlFormRecord(record ?? null);
  }, [stewardIdentity]);
  const closeDdlForm = useCallback(() => setDdlFormRecord(null), []);
  const handleDdlSave = useCallback((record) => {
    upsertRecord('source_table_ddl', record); closeDdlForm();
  }, [upsertRecord, closeDdlForm]);

  // Global SQL panel state
  const [sqlPanel,    setSqlPanel]    = useState(null);
  const openSqlPanel  = useCallback((panel) => setSqlPanel(panel), []);
  const closeSqlPanel = useCallback(() => setSqlPanel(null), []);

  // -- Derived ----------------------------------------------
  const totalRows = data ? Object.values(data).reduce((s,arr) => s+(arr?.length||0), 0) : 0;
  const hasData   = !!data;

  // -- Master detection -------------------------------------
  const [stewardIdentity, setStewardIdentityState] = useState(() => loadStewardIdentity());

  // Re-read steward identity when storage changes (settings panel writes it)
  useEffect(() => {
    const handler = () => setStewardIdentityState(loadStewardIdentity());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const isMaster = useMemo(() => {
    if (!stewardIdentity || !data) return false;
    return (data.stewardship || []).some(s =>
      s.critical_data_set_id === 0 &&
      s.data_steward_id === stewardIdentity.id &&
      !s.retiring_timestamp
    );
  }, [data, stewardIdentity]);

  // -- Context value ----------------------------------------
  const ctxValue = useMemo(() => ({
    data, lookups, savedAt, hasData,
    updateTable, upsertRecord, retireRecord, restoreRecord, nextPk, designateAsMaster,
    openForm, openCritForm, openSqlPanel, openAllocForm, openCdeForm, navigate, openDdlForm,
    isMaster, stewardIdentity,
    canEdit: !!stewardIdentity,
  }), [data, lookups, savedAt, hasData, updateTable, upsertRecord, retireRecord, restoreRecord, nextPk, designateAsMaster, openForm, openCritForm, openSqlPanel, openAllocForm, openCdeForm, navigate, openDdlForm, isMaster, stewardIdentity]);

  // -- Screen renderer --------------------------------------
  const renderScreen = () => {
    if (!data && route.screen !== 'import') {
      return <NoDataScreen onNavigateImport={() => navigate({ screen:'import', table:null })}/>;
    }
    switch (route.screen) {
      case 'import':      return <ImportScreen onImport={handleImport} onMerge={handleDeltaMerge}/>;
      case 'databrowser': return <DataBrowserScreen/>;
      case 'rulegenerator': return <DataRuleGeneratorScreen/>;
      case 'assistant':     return <AssistantScreen/>;
      case 'coverage':    return <CDECoverageScreen/>;
      case 'simulator':   return <DQSimulatorScreen/>;
      case 'dashboard': return <DashboardScreen/>;
      case 'export':    return <ExportScreen/>;
      case 'orgchart':  return <OwnershipOrgChart/>;
      case 'rulenav':   return <RuleExplorerView/>;
      case 'table':     return route.table
        ? ((['criticality_group_weight','quality_dimension_weight'].includes(route.table))
            ? <AggregatedWeightView key={route.table} tableName={route.table}/>
            : route.table === 'directorate'
            ? <DirectorateView key="directorate"/>
            : route.table === 'critical_data_element'
            ? <CriticalDataElementView key={'cde_' + (route.initialSearch || '')} initialSearch={route.initialSearch || ''}/>
            : route.table === 'data_quality_rule_allocation'
            ? <RuleAllocationView key="data_quality_rule_allocation"/>
            : route.table === 'source_table_ddl'
            ? <DDLLibraryView key="source_table_ddl"/>
            : route.table === 'field_profiling'
            ? <FieldProfilingScreen key="field_profiling"/>
            : <GenericTableView key={route.table} tableName={route.table}/>)
        : null;
      default:          return null;
    }
  };

  return (
    <AppContext.Provider value={ctxValue}>
      <div style={{ display:'flex', flexDirection:'row', height:'100vh', width:'100vw', overflow:'hidden' }}>

        {/* Sidebar -- full height, left */}
        <Sidebar
          route={route}
          onNavigate={navigate}
          data={data}
          onToggle={onSidebarToggle}
          isMaster={isMaster}
        />

        {/* Right column -- header + content + footer */}
        <div style={{ display:'flex', flexDirection:'column', flex:'1 1 0', overflow:'hidden', minWidth:0, width:0 }}>

          <AppHeader
            savedAt={savedAt}
            totalRows={totalRows}
            onShowReset={handleShowReset}
            isMaster={isMaster}
            stewardIdentity={stewardIdentity}
          />

          <main className="content-area">
            {resetStage > 0 && (
              <div className="reset-confirm fade-in">
                <Icon.Warning/>
                {resetStage === 1 && resetPendingCount === 0 && (
                  <span>This will clear all data from localStorage. Are you sure?</span>
                )}
                {resetStage === 1 && resetPendingCount > 0 && (
                  <span>You have <strong>{resetPendingCount}</strong> unsaved delta change{resetPendingCount !== 1 ? 's' : ''} that have not been exported. Export your delta first to avoid losing them.</span>
                )}
                {resetStage === 2 && (
                  <span>Your {resetPendingCount} unsaved change{resetPendingCount !== 1 ? 's' : ''} will be permanently lost and cannot be recovered. Are you absolutely sure?</span>
                )}
                {resetStage === 1 && resetPendingCount === 0 && (
                  <button className="btn btn-danger" style={{ marginLeft:'auto' }} onClick={handleReset}>Yes, reset</button>
                )}
                {resetStage === 1 && resetPendingCount > 0 && (
                  <button className="btn btn-danger" style={{ marginLeft:'auto' }} onClick={() => setResetStage(2)}>Reset anyway</button>
                )}
                {resetStage === 2 && (
                  <button className="btn btn-danger" style={{ marginLeft:'auto' }} onClick={handleReset}>Yes, discard and reset</button>
                )}
                <button className="btn btn-ghost" onClick={() => setResetStage(0)}>Cancel</button>
              </div>
            )}
            <Breadcrumb route={route}/>
            {!stewardIdentity && data && (
              <div style={{ display:'flex', alignItems:'center', gap:8,
                padding:'6px 12px', marginBottom:12,
                background:'rgba(245,166,35,0.08)',
                border:'1px solid rgba(245,166,35,0.3)',
                borderRadius:'var(--radius)', fontSize:11, color:'var(--amber)' }}>
                <span style={{ width:14, height:14, flexShrink:0 }}><Icon.Warning/></span>
                Read-only mode - no steward identity set. Open Settings to select your identity before making changes.
              </div>
            )}
            {renderScreen()}
          </main>

          <AppFooter/>
        </div>
      </div>

      {/* SQL panel -- rendered at App level */}
      <SqlPanel panel={sqlPanel} onClose={closeSqlPanel}/>

      {/* DDL form -- rendered at App level */}
      {ddlFormRecord !== null && (
        <DDLFormPanel
          record={ddlFormRecord}
          onClose={closeDdlForm}
          onSave={handleDdlSave}
          nextPk={() => nextPk('source_table_ddl')}
          accent="#7c5cbf"
          data={data}
          stewardIdentity={stewardIdentity}
        />
      )}

      {/* CDE form -- rendered at App level */}
      {cdeFormRecord && (
        <CriticalDataElementFormPanel
          record={cdeFormRecord}
          isEdit={cdeFormIsEdit}
          preCdsId={cdeFormPreCdsId}
          preTableName={cdeFormPreTable}
          preDbName={cdeFormPreDb}
          onSave={handleCdeSave}
          onClose={closeCdeForm}
          data={data}
        />
      )}

      {/* Rule allocation form -- rendered at App level */}
      {allocFormRecord && (
        <RuleAllocationFormPanel
          record={allocFormRecord}
          isEdit={allocFormIsEdit}
          onSave={handleAllocSave}
          onClose={closeAllocForm}
          data={data}
        />
      )}

      {/* Form panel -- rendered at App level, outside scroll container */}
      {formRecord && formTable && (
        formTable === 'critical_data_set' ? (
          <CdsFormPanel
            record={formRecord}
            onSave={handleCdsSave}
            onClose={closeForm}
            data={data}
            stewardIdentity={stewardIdentity}
          />
        ) : formTable === 'executive_agency' ? (
          <AgencyFormPanel
            record={formRecord}
            onSave={handleAgencySave}
            onClose={closeForm}
            data={data}
            stewardIdentity={stewardIdentity}
          />
        ) : formTable === 'data_owner' ? (
          <DataOwnerFormPanel
            record={formRecord}
            onSave={handleFormSave}
            onClose={closeForm}
            data={data}
          />
        ) : formTable === 'stewardship' ? (
          <StewardshipFormPanel
            record={formRecord}
            onSave={handleFormSave}
            onClose={closeForm}
            data={data}
          />
        ) : (formTable === 'criticality_group_weight' || formTable === 'quality_dimension_weight') ? (
          <WeightFormPanel
            tableName={formTable}
            record={formRecord}
            onSave={handleFormSave}
            onClose={closeForm}
            data={data}
          />
        ) : formTable === 'data_quality_rule' ? (
          <RuleFormPanel
            record={formRecord}
            onSave={handleFormSave}
            onClose={closeForm}
            data={data}
          />
        ) : (
          <RecordFormPanel
            tableName={formTable}
            record={formRecord}
            onSave={handleFormSave}
            onClose={closeForm}
            data={data}
          />
        )
      )}

      {/* CDE Criticality bulk form -- rendered at App level */}
      {critFormCdeId !== null && (
        <CdeCriticalityFormPanel
          cdeId={critFormCdeId || null}
          existingRows={critFormRows}
          preAgencyId={critFormPreAgency}
          preDirId={critFormPreDir}
          preCdsId={critFormPreCds}
          onClose={closeCritForm}
          data={data}
        />
      )}
    </AppContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App/>);

// Show any captured errors on screen
setTimeout(() => {
  if (window.__errors && window.__errors.length > 0) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#2e1010;color:#f25f5c;padding:16px;z-index:9999;font-family:monospace;font-size:12px;white-space:pre-wrap;max-height:60vh;overflow:auto;border-bottom:2px solid #f25f5c';
    div.textContent = 'ERRORS DETECTED:\n\n' + window.__errors.map(e =>
      `${e.msg}\n${e.src ? 'at ' + e.src + ':' + e.line + ':' + e.col : ''}\n${e.stack || ''}`
    ).join('\n---\n');
    document.body.appendChild(div);
  }
}, 2000);