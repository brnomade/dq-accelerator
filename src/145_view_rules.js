// ===============================================================================
// RULES EXPLORER -- Rule -> Agency -> CDS -> Table -> CDE -> Allocation
// Depends on: CdeAllocFormPanel (141_view_cde_list.js), RuleFormPanel (166_form_panel_rule.js)
// ===============================================================================

function buildRuleHierarchy({ rules, allocs, cdes, cdss, dirs, agencies,
  profilingByKey, critsByCdeId, showRetired, scopeCdsIds }) {

  const cdeById    = Object.fromEntries(cdes.map(c => [c.critical_data_element_id, c]));
  const cdsById    = Object.fromEntries(cdss.map(d => [d.critical_data_set_id, d]));
  const dirById    = Object.fromEntries(dirs.map(d => [d.directorate_id, d]));
  const agencyById = Object.fromEntries(agencies.map(a => [a.executive_agency_id, a]));

  const allocsByRuleId = {};
  for (const a of allocs) {
    if (!showRetired && a.retiring_timestamp) continue;
    if (!allocsByRuleId[a.data_quality_rule_id]) allocsByRuleId[a.data_quality_rule_id] = [];
    allocsByRuleId[a.data_quality_rule_id].push(a);
  }

  const visibleRules = showRetired ? rules : rules.filter(r => !r.retiring_timestamp);

  return [...visibleRules]
    .sort((a, b) => (a.rule_name || '').localeCompare(b.rule_name || ''))
    .map(rule => {
      const ruleId     = rule.data_quality_rule_id;
      const ruleAllocs = allocsByRuleId[ruleId] || [];
      const agencyMap  = {};

      for (const alloc of ruleAllocs) {
        const cde = cdeById[alloc.critical_data_element_id];
        if (!cde) continue;
        const cds = cdsById[cde.critical_data_set_id];
        if (!cds) continue;
        if (scopeCdsIds && !scopeCdsIds.has(cde.critical_data_set_id)) continue;

        const dir    = dirById[cds.directorate_id];
        const agency = dir ? agencyById[dir.executive_agency_id] : null;
        const agKey  = String(agency ? agency.executive_agency_id : '__unknown__');
        const cdsKey = String(cds.critical_data_set_id);
        const tblKey = (cde.source_table_name || '') + '|||' + (cde.source_database_name || '');

        if (!agencyMap[agKey]) agencyMap[agKey] = { agency, cdsMap: {} };
        if (!agencyMap[agKey].cdsMap[cdsKey]) agencyMap[agKey].cdsMap[cdsKey] = { cds, tableMap: {} };
        if (!agencyMap[agKey].cdsMap[cdsKey].tableMap[tblKey])
          agencyMap[agKey].cdsMap[cdsKey].tableMap[tblKey] = {
            table: cde.source_table_name || '', db: cde.source_database_name || '', cdeList: [] };

        const profKey  = (cde.source_database_name || '') + '|||' + (cde.source_table_name || '') + '|||' + (cde.source_field_name || '');
        agencyMap[agKey].cdsMap[cdsKey].tableMap[tblKey].cdeList.push({
          cde, profiling: profilingByKey[profKey] || null,
          crits: critsByCdeId[cde.critical_data_element_id] || {},
          allocation: alloc,
        });
      }

      const agencyEntries = Object.entries(agencyMap)
        .sort(([,a],[,b]) => (a.agency ? (a.agency.agency_acronymn || 'ZZZ') : 'ZZZ')
          .localeCompare(b.agency ? (b.agency.agency_acronymn || 'ZZZ') : 'ZZZ'))
        .map(([agKey, { agency, cdsMap }]) => {
          const cdsEntries = Object.entries(cdsMap)
            .sort(([,a],[,b]) => (a.cds ? (a.cds.data_set_name || '') : '').localeCompare(b.cds ? (b.cds.data_set_name || '') : ''))
            .map(([cdsKey, { cds, tableMap }]) => {
              const tableEntries = Object.entries(tableMap)
                .sort(([a],[b]) => a.localeCompare(b))
                .map(([tblKey, { table, db, cdeList }]) => {
                  const sortedCdes = [...cdeList].sort((a,b) =>
                    (a.cde.source_field_name || '').localeCompare(b.cde.source_field_name || ''));
                  return { table, db, tblKey, isProfiled: sortedCdes.some(e => e.profiling), cdes: sortedCdes };
                });
              const cdeCount = tableEntries.reduce((s, t) => s + t.cdes.length, 0);
              return { cds, cdsKey, tables: tableEntries, tableCount: tableEntries.length, cdeCount, allocCount: cdeCount };
            });
          const cdeCount  = cdsEntries.reduce((s, c) => s + c.cdeCount, 0);
          const allocCount = cdsEntries.reduce((s, c) => s + c.allocCount, 0);
          return { agency, agKey, cdss: cdsEntries, cdsCount: cdsEntries.length, cdeCount, allocCount };
        });

      const agencyCount = agencyEntries.length;
      const cdeCount    = agencyEntries.reduce((s, a) => s + a.cdeCount, 0);
      const allocCount  = agencyEntries.reduce((s, a) => s + a.allocCount, 0);
      return { rule, agencies: agencyEntries, agencyCount, cdeCount, allocCount };
    });
}

// -------------------------------------------------------------------------------
// CDE row -- collapsible leaf with inline allocation panel
// -------------------------------------------------------------------------------
function RulesCdeRow({ cdeEntry, rule, critGroupsSorted, critLevelsById, dimensionsById,
  expanded, onToggle, onEditAlloc, onRetireAlloc, onRestoreAlloc, onOpenSql, canEdit, accent }) {
  const { cde, profiling, crits, allocation } = cdeEntry;
  const pk             = cde.critical_data_element_id;
  const expKey         = 'cde_' + rule.data_quality_rule_id + '_' + pk;
  const isOpen         = !!expanded[expKey];
  const isAllocRetired = !!allocation.retiring_timestamp;
  const dim            = dimensionsById[allocation.quality_dimension_id];
  const missingFlt     = !cde.source_snapshot_filter;
  const hasSample      = !!rule.sql_code_sample;
  const physAccent     = 'var(--purple)';

  return (
    <React.Fragment>
      <div style={{ display:'flex', alignItems:'center', gap:7, padding:'5px 10px',
        background:'var(--bg2)', cursor:'pointer', opacity: isAllocRetired ? 0.5 : 1 }}
        onClick={() => onToggle(expKey)}>
        <div style={{ color: isOpen ? accent : 'var(--text3)', width:11, height:11, flexShrink:0,
          transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>
          <Icon.ChevronR/>
        </div>
        <span style={{ fontSize:12, fontFamily:'var(--mono)', fontWeight:500, color:accent,
          flex:1, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {cde.source_field_name || ('CDE #' + pk)}
        </span>
        {profiling && (
          <span title={'Profiled ' + (profiling.profiled_at || '')}
            style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:600, color:physAccent,
              background:physAccent + '22', border:'1px solid ' + physAccent + '44',
              borderRadius:3, padding:'1px 6px', flexShrink:0, whiteSpace:'nowrap' }}>
            profiled
          </span>
        )}
        {critGroupsSorted.map(g => {
          const levelId = crits[g.criticality_group_id];
          const level   = levelId ? critLevelsById[levelId] : null;
          return (
            <span key={g.criticality_group_id}
              title={(g.criticality_group_description || g.criticality_group_name) + ': ' + (level ? level.criticality_description : 'not set')}
              style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
                color: level ? 'var(--amber)' : 'var(--text3)',
                background: level ? 'rgba(245,166,35,0.10)' : 'var(--bg3)',
                border: '1px solid ' + (level ? 'rgba(245,166,35,0.30)' : 'var(--border)'),
                borderRadius:3, padding:'1px 5px', flexShrink:0, whiteSpace:'nowrap' }}>
              {(g.criticality_group_acronymn || g.criticality_group_name.slice(0,3).toUpperCase()) + ': ' + (level ? level.criticality_description : '--')}
            </span>
          );
        })}
      </div>

      {isOpen && (
        <div style={{ borderTop:'1px solid var(--border)', background:'var(--bg3)',
          padding:'5px 10px 5px 28px', display:'flex', alignItems:'center', gap:8,
          flexWrap:'wrap', opacity: isAllocRetired ? 0.5 : 1 }}>
          <span style={{ fontSize:11, fontFamily:'var(--mono)', color:accent,
            flex:1, minWidth:120, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {dim ? dim.dimension_name : '--'}
          </span>
          <span style={{ fontSize:11, color:'var(--text2)', flexShrink:0, whiteSpace:'nowrap' }}>
            {allocation.frequency || '--'}
          </span>
          <div style={{ flexShrink:0 }}>
            {allocation.bumper_value !== null && allocation.bumper_value !== undefined
              ? <span style={{ fontSize:11, fontFamily:'var(--mono)', fontWeight:600,
                  color:'var(--amber)', background:'var(--amber-bg)', border:'1px solid var(--amber)',
                  borderRadius:3, padding:'1px 7px', whiteSpace:'nowrap' }}>
                  {allocation.bumper_value}
                </span>
              : <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>--</span>
            }
          </div>
          <div style={{ display:'flex', gap:3, alignItems:'center', flexShrink:0 }}>
            <button className="btn btn-ghost"
              style={{ padding:'2px 5px', color: missingFlt ? 'var(--red)' : 'var(--accent)' }}
              disabled={missingFlt}
              title={missingFlt ? 'Missing snapshot filter' : 'View composed rule SQL'}
              onClick={e => { e.stopPropagation(); onOpenSql('rule', rule, allocation, cde); }}>
              <div style={{ width:13, height:13 }}><Icon.Code/></div>
            </button>
            {hasSample
              ? <button className="btn btn-ghost" style={{ padding:'2px 5px', color:'var(--text2)' }}
                  disabled={missingFlt}
                  title={missingFlt ? 'Missing snapshot filter' : 'View composed sample SQL'}
                  onClick={e => { e.stopPropagation(); onOpenSql('sample', rule, allocation, cde); }}>
                  <div style={{ width:13, height:13 }}><Icon.Sample/></div>
                </button>
              : <span style={{ fontSize:8, fontFamily:'var(--mono)', fontWeight:600, letterSpacing:'0.04em',
                  color:'var(--text3)', background:'var(--bg)', border:'1px solid var(--border)',
                  borderRadius:3, padding:'1px 4px', whiteSpace:'nowrap' }}
                  title="No sample code -- engine uses default approach">DEF</span>
            }
            {missingFlt && (
              <span title="Missing snapshot filter -- SQL cannot be composed"
                style={{ color:'var(--amber)', width:13, height:13, flexShrink:0, display:'inline-flex' }}>
                <Icon.Warning/>
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:2, alignItems:'center', flexShrink:0 }}>
            {!isAllocRetired ? (
              <>
                <button className="btn btn-ghost" style={{ padding:'2px 4px' }}
                  disabled={!canEdit} title="Edit allocation"
                  onClick={e => { e.stopPropagation(); onEditAlloc(allocation); }}>
                  <div style={{ width:11, height:11 }}><Icon.Pencil/></div>
                </button>
                <button className="btn btn-ghost" style={{ padding:'2px 4px', color:'var(--red)' }}
                  disabled={!canEdit} title="Retire allocation"
                  onClick={e => { e.stopPropagation(); onRetireAlloc(allocation); }}>
                  <div style={{ width:11, height:11 }}><Icon.EyeOff/></div>
                </button>
              </>
            ) : (
              <button className="btn btn-ghost" style={{ padding:'2px 4px', color:'var(--text3)' }}
                disabled={!canEdit} title="Restore allocation"
                onClick={e => { e.stopPropagation(); onRestoreAlloc(allocation); }}>
                <div style={{ width:11, height:11 }}><Icon.Eye/></div>
              </button>
            )}
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

// -------------------------------------------------------------------------------
// Table row
// -------------------------------------------------------------------------------
function RulesTableRow({ tableEntry, ruleId, cdsId, rule, critGroupsSorted, critLevelsById,
  dimensionsById, expanded, onToggle, onEditAlloc, onRetireAlloc, onRestoreAlloc, onOpenSql, canEdit, accent }) {
  const { table, db, tblKey, isProfiled, cdes } = tableEntry;
  const expKey     = 'tbl_' + ruleId + '_' + cdsId + '_' + tblKey;
  const isOpen     = !!expanded[expKey];
  const physAccent = 'var(--purple)';

  return (
    <div style={{ border:'1px solid var(--border)', borderRadius:'var(--radius)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px',
        cursor:'pointer', background: isOpen ? 'var(--bg2)' : 'var(--bg)' }}
        onClick={() => onToggle(expKey)}>
        <div style={{ color: isOpen ? accent : 'var(--text3)', width:11, height:11, flexShrink:0,
          transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>
          <Icon.ChevronR/>
        </div>
        <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'baseline', gap:6, flexWrap:'wrap' }}>
          <span style={{ fontSize:11, fontFamily:'var(--mono)', fontWeight:600, color:'var(--text)' }}>
            {table || 'no table assigned'}
          </span>
          {db && (
            <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', fontWeight:400 }}>
              in {db}
            </span>
          )}
        </div>
        <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
          color: isProfiled ? physAccent : 'var(--text3)',
          background: isProfiled ? (physAccent + '22') : 'var(--bg3)',
          border: '1px solid ' + (isProfiled ? (physAccent + '44') : 'var(--border)'),
          borderRadius:3, padding:'1px 6px', flexShrink:0, whiteSpace:'nowrap' }}>
          {isProfiled ? 'profiled' : 'not profiled'}
        </span>
        <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap' }}>
          &middot; {cdes.length} CDE{cdes.length !== 1 ? 's' : ''} &middot; {cdes.length} allocation{cdes.length !== 1 ? 's' : ''}
        </span>
      </div>
      {isOpen && (
        <div style={{ borderTop:'1px solid var(--border)', marginLeft:12, paddingLeft:12,
          borderLeft:'2px solid ' + accent + '30', display:'flex', flexDirection:'column', gap:0 }}>
          {cdes.map((cdeEntry, idx) => (
            <div key={cdeEntry.cde.critical_data_element_id}
              style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
              <RulesCdeRow
                cdeEntry={cdeEntry} rule={rule}
                critGroupsSorted={critGroupsSorted} critLevelsById={critLevelsById}
                dimensionsById={dimensionsById} expanded={expanded} onToggle={onToggle}
                onEditAlloc={onEditAlloc} onRetireAlloc={onRetireAlloc} onRestoreAlloc={onRestoreAlloc}
                onOpenSql={onOpenSql} canEdit={canEdit} accent={accent}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------
// CDS row
// -------------------------------------------------------------------------------
function RulesCdsRow({ cdsEntry, ruleId, rule, critGroupsSorted, critLevelsById,
  dimensionsById, expanded, onToggle, onEditAlloc, onRetireAlloc, onRestoreAlloc, onOpenSql, canEdit, accent }) {
  const { cds, cdsKey, tables, tableCount, cdeCount, allocCount } = cdsEntry;
  const expKey = 'cds_' + ruleId + '_' + cdsKey;
  const isOpen = !!expanded[expKey];

  return (
    <div style={{ border:'1px solid var(--border)', borderLeft:'3px solid ' + accent + '40',
      borderRadius:'var(--radius)', overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
        cursor:'pointer', background: isOpen ? 'var(--bg)' : 'var(--bg3)' }}
        onClick={() => onToggle(expKey)}>
        <div style={{ color: isOpen ? accent : 'var(--text3)', width:12, height:12, flexShrink:0,
          transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>
          <Icon.ChevronR/>
        </div>
        <span style={{ fontSize:12, fontWeight:500, color:'var(--text)', flex:1 }}>
          {cds ? (cds.data_set_name || 'Unnamed data set') : 'No data set assigned'}
        </span>
        <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap' }}>
          &middot; {tableCount} table{tableCount !== 1 ? 's' : ''} &middot; {cdeCount} CDE{cdeCount !== 1 ? 's' : ''} &middot; {allocCount} allocation{allocCount !== 1 ? 's' : ''}
        </span>
      </div>
      {isOpen && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'6px 12px 8px',
          display:'flex', flexDirection:'column', gap:4 }}>
          {tables.map(tableEntry => (
            <RulesTableRow
              key={tableEntry.tblKey}
              tableEntry={tableEntry} ruleId={ruleId} cdsId={cdsKey} rule={rule}
              critGroupsSorted={critGroupsSorted} critLevelsById={critLevelsById}
              dimensionsById={dimensionsById} expanded={expanded} onToggle={onToggle}
              onEditAlloc={onEditAlloc} onRetireAlloc={onRetireAlloc} onRestoreAlloc={onRestoreAlloc}
              onOpenSql={onOpenSql} canEdit={canEdit} accent={accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------
// Agency row
// -------------------------------------------------------------------------------
function RulesAgencyRow({ agencyEntry, ruleId, rule, critGroupsSorted, critLevelsById,
  dimensionsById, expanded, onToggle, onEditAlloc, onRetireAlloc, onRestoreAlloc, onOpenSql, canEdit, accent }) {
  const { agency, agKey, cdss, cdsCount, cdeCount, allocCount } = agencyEntry;
  const expKey = 'ag_' + ruleId + '_' + agKey;
  const isOpen = !!expanded[expKey];

  return (
    <div style={{ border:'1px solid var(--border)', borderLeft:'3px solid ' + accent + '80',
      borderRadius:'var(--radius)', overflow:'hidden', background:'var(--bg2)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
        cursor:'pointer', background: isOpen ? 'var(--bg3)' : 'var(--bg2)' }}
        onClick={() => onToggle(expKey)}>
        <div style={{ color: isOpen ? accent : 'var(--text3)', width:12, height:12, flexShrink:0,
          transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.15s' }}>
          <Icon.ChevronR/>
        </div>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
          {agency ? (agency.agency_acronymn || 'Unknown') : 'Unknown'}
        </span>
        {agency && agency.agency_name && (
          <span style={{ fontSize:11, color:'var(--text3)' }}>{agency.agency_name}</span>
        )}
        <span style={{ marginLeft:'auto', fontSize:10, color:'var(--text3)',
          fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap' }}>
          &middot; {cdsCount} CDS &middot; {cdeCount} CDE{cdeCount !== 1 ? 's' : ''} &middot; {allocCount} allocation{allocCount !== 1 ? 's' : ''}
        </span>
      </div>
      {isOpen && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'6px 12px 8px',
          display:'flex', flexDirection:'column', gap:4 }}>
          {cdss.map(cdsEntry => (
            <RulesCdsRow
              key={cdsEntry.cdsKey}
              cdsEntry={cdsEntry} ruleId={ruleId} rule={rule}
              critGroupsSorted={critGroupsSorted} critLevelsById={critLevelsById}
              dimensionsById={dimensionsById} expanded={expanded} onToggle={onToggle}
              onEditAlloc={onEditAlloc} onRetireAlloc={onRetireAlloc} onRestoreAlloc={onRestoreAlloc}
              onOpenSql={onOpenSql} canEdit={canEdit} accent={accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------
// Rule row (top level)
// -------------------------------------------------------------------------------
function RulesRuleRow({ ruleEntry, critGroupsSorted, critLevelsById, dimensionsById,
  expanded, onToggle, onEdit, onRetire, onRestore, onEditAlloc, onRetireAlloc, onRestoreAlloc,
  onOpenSql, canEdit, accent }) {
  const { rule, agencies, agencyCount, cdeCount, allocCount } = ruleEntry;
  const pk        = rule.data_quality_rule_id;
  const expKey    = 'rule_' + pk;
  const isOpen    = !!expanded[expKey];
  const isRetired = !!rule.retiring_timestamp;
  const hasAllocs = allocCount > 0;

  return (
    <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',
      borderLeft:'3px solid ' + (isRetired ? 'var(--border)' : accent),
      borderRadius:'var(--radius-lg)', overflow:'hidden', opacity: isRetired ? 0.65 : 1 }}>

      <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'11px 14px',
        cursor: hasAllocs ? 'pointer' : 'default' }}
        onClick={() => hasAllocs && onToggle(expKey)}>
        <div style={{ color: isOpen ? accent : 'var(--text3)', width:14, height:14,
          marginTop:2, flexShrink:0,
          transform: isOpen ? 'rotate(90deg)' : 'none', transition:'transform 0.15s',
          visibility: hasAllocs ? 'visible' : 'hidden' }}>
          <Icon.ChevronR/>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontFamily:'var(--mono)', fontWeight:600,
            color: isRetired ? 'var(--text3)' : 'var(--text)',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {rule.rule_name || ('Rule #' + pk)}
            {isRetired && <span style={{ marginLeft:8, fontSize:10, color:'var(--text3)', fontWeight:400 }}>(retired)</span>}
          </div>
          {rule.rule_explanation && (
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {rule.rule_explanation}
            </div>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          {rule.automated && (
            <span style={{ fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
              color:'var(--amber)', background:'var(--amber-bg)', border:'1px solid var(--amber)',
              borderRadius:3, padding:'1px 6px', whiteSpace:'nowrap' }}>AUTOMATED</span>
          )}
          <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)' }}>{'#' + pk}</span>
          {hasAllocs && (
            <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', whiteSpace:'nowrap' }}>
              &middot; {agencyCount} agenc{agencyCount !== 1 ? 'ies' : 'y'} &middot; {cdeCount} CDE{cdeCount !== 1 ? 's' : ''} &middot; {allocCount} allocation{allocCount !== 1 ? 's' : ''}
            </span>
          )}
          <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
            disabled={!canEdit} title="Edit rule"
            onClick={e => { e.stopPropagation(); onEdit(rule); }}>
            <Icon.Pencil/>
          </button>
          {isRetired ? (
            <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
              disabled={!canEdit} title="Restore rule"
              onClick={e => { e.stopPropagation(); onRestore(rule); }}>
              <Icon.Eye/>
            </button>
          ) : (
            <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
              disabled={!canEdit} title="Retire rule"
              onClick={e => { e.stopPropagation(); onRetire(rule); }}>
              <Icon.EyeOff/>
            </button>
          )}
        </div>
      </div>

      {!hasAllocs && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'8px 14px 10px' }}>
          <div style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>
            No allocations -- use the Data and Stewardship page to assign this rule to a CDE.
          </div>
        </div>
      )}

      {isOpen && hasAllocs && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'8px 14px 10px',
          display:'flex', flexDirection:'column', gap:6 }}>
          {agencies.map(agencyEntry => (
            <RulesAgencyRow
              key={agencyEntry.agKey}
              agencyEntry={agencyEntry} ruleId={pk} rule={rule}
              critGroupsSorted={critGroupsSorted} critLevelsById={critLevelsById}
              dimensionsById={dimensionsById} expanded={expanded} onToggle={onToggle}
              onEditAlloc={onEditAlloc} onRetireAlloc={onRetireAlloc} onRestoreAlloc={onRestoreAlloc}
              onOpenSql={onOpenSql} canEdit={canEdit} accent={accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------
// RuleExplorerView -- outer shell, state, toolbar
// -------------------------------------------------------------------------------
function RuleExplorerView() {
  const { data, upsertRecord, retireRecord, restoreRecord, nextPk, canEdit,
    stewardIdentity, isMaster, openSqlPanel } = useApp();

  const accent = '#18b4d4';

  const [search,      setSearch]      = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [myDataOnly,  setMyDataOnly]  = useState(() => loadMyDataPref('moj_dq_rulenav_scope_v1', isMaster));
  const [expanded,   setExpanded]   = useState({});
  const [rulePanel,  setRulePanel]  = useState(null);
  const [allocPanel, setAllocPanel] = useState(null);

  useEffect(() => { saveMyDataPref('moj_dq_rulenav_scope_v1', myDataOnly); }, [myDataOnly]);

  const myStewardCdsIds = useMemo(() => getMyStewardCdsIds(data, stewardIdentity), [data, stewardIdentity]);

  const critGroupsSorted = useMemo(() =>
    (data?.criticality_group || []).filter(g => !g.retiring_timestamp)
      .sort((a,b) => a.criticality_group_id - b.criticality_group_id),
  [data]);

  const critLevelsById = useMemo(() =>
    Object.fromEntries((data?.criticality_level || []).map(l => [l.criticality_level_id, l])),
  [data]);

  const critsByCdeId = useMemo(() => {
    const m = {};
    for (const c of (data?.cde_criticality || [])) {
      if (c.retiring_timestamp) continue;
      if (!m[c.critical_data_element_id]) m[c.critical_data_element_id] = {};
      m[c.critical_data_element_id][c.criticality_group_id] = c.criticality_level_id;
    }
    return m;
  }, [data]);

  const profilingByKey = useMemo(() => {
    const m = {};
    for (const p of (data?.field_profiling || [])) {
      if (!p.retiring_timestamp)
        m[(p.source_database_name || '') + '|||' + (p.source_table_name || '') + '|||' + (p.source_field_name || '')] = p;
    }
    return m;
  }, [data]);

  const dimensionsById = useMemo(() =>
    Object.fromEntries((data?.quality_dimension || []).map(d => [d.quality_dimension_id, d])),
  [data]);

  const cdsById    = useMemo(() => Object.fromEntries((data?.critical_data_set  || []).map(d => [d.critical_data_set_id,    d])), [data]);
  const dirById    = useMemo(() => Object.fromEntries((data?.directorate        || []).map(d => [d.directorate_id,          d])), [data]);
  const agencyById = useMemo(() => Object.fromEntries((data?.executive_agency   || []).map(a => [a.executive_agency_id,     a])), [data]);

  const scopeCdsIds = myDataOnly ? myStewardCdsIds : null;

  const hierarchy = useMemo(() => {
    if (!data) return [];
    return buildRuleHierarchy({
      rules:    data.data_quality_rule            || [],
      allocs:   data.data_quality_rule_allocation || [],
      cdes:     data.critical_data_element        || [],
      cdss:     data.critical_data_set            || [],
      dirs:     data.directorate                  || [],
      agencies: data.executive_agency             || [],
      profilingByKey, critsByCdeId, showRetired, scopeCdsIds,
    });
  }, [data, profilingByKey, critsByCdeId, showRetired, scopeCdsIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return hierarchy;
    const q = search.toLowerCase();
    return hierarchy.filter(ruleEntry => {
      const r = ruleEntry.rule;
      if ((r.rule_name        || '').toLowerCase().includes(q)) return true;
      if ((r.rule_explanation || '').toLowerCase().includes(q)) return true;
      for (const ag of ruleEntry.agencies) {
        if ((ag.agency ? (ag.agency.agency_acronymn || '') : '').toLowerCase().includes(q)) return true;
        if ((ag.agency ? (ag.agency.agency_name     || '') : '').toLowerCase().includes(q)) return true;
        for (const cds of ag.cdss) {
          if ((cds.cds ? (cds.cds.data_set_name || '') : '').toLowerCase().includes(q)) return true;
          for (const tbl of cds.tables) {
            if ((tbl.table || '').toLowerCase().includes(q)) return true;
            if ((tbl.db   || '').toLowerCase().includes(q)) return true;
            for (const ce of tbl.cdes) {
              if ((ce.cde.source_field_name || '').toLowerCase().includes(q)) return true;
            }
          }
        }
      }
      return false;
    });
  }, [hierarchy, search]);

  const allRules     = data?.data_quality_rule || [];
  const liveCount    = allRules.filter(r => !r.retiring_timestamp).length;
  const retiredCount = allRules.filter(r =>  r.retiring_timestamp).length;
  const totalAllocs  = filtered.reduce((s, r) => s + r.allocCount, 0);

  const toggleKey = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const handleAddRule  = () => setRulePanel({ record: {
    data_quality_rule_id: nextPk('data_quality_rule'),
    rule_name: null, rule_explanation: null,
    sql_code: null, sql_code_sample: null,
    source_code_link: null, automated: false, retiring_timestamp: null,
  }});
  const handleEditRule    = (rule) => setRulePanel({ record: { ...rule } });
  const handleRuleSave    = (saved) => { upsertRecord('data_quality_rule', saved); setRulePanel(null); };
  const handleRetireRule  = (rule) => { if (canEdit) retireRecord('data_quality_rule', rule.data_quality_rule_id); };
  const handleRestoreRule = (rule) => { if (canEdit) restoreRecord('data_quality_rule', rule.data_quality_rule_id); };

  const handleEditAlloc    = (alloc) => setAllocPanel({ record: { ...alloc }, isEdit: true });
  const handleAllocSave    = (saved) => { upsertRecord('data_quality_rule_allocation', saved); setAllocPanel(null); };
  const handleRetireAlloc  = (alloc) => { if (canEdit) retireRecord('data_quality_rule_allocation', alloc.data_quality_rule_allocation_id); };
  const handleRestoreAlloc = (alloc) => { if (canEdit) restoreRecord('data_quality_rule_allocation', alloc.data_quality_rule_allocation_id); };

  const handleOpenSql = useCallback((mode, rule, alloc, cde) => {
    const cds    = cdsById[cde.critical_data_set_id];
    const dir    = cds ? dirById[cds.directorate_id] : null;
    const agency = dir ? agencyById[dir.executive_agency_id] : null;
    const template = mode === 'sample' ? rule.sql_code_sample : rule.sql_code;
    const sql = composeSql(template, cde, mode);
    openSqlPanel({
      mode, sql,
      ruleName:       rule.rule_name,
      fieldName:      cde.source_field_name || '',
      cdsName:        cds ? (cds.data_set_name || '') : '',
      agencyAcronym:  agency ? (agency.agency_acronymn || '') : '',
      snapshotFilter: cde.source_snapshot_filter
        ? substituteCdeTokens(cde.source_snapshot_filter, cde) : null,
    });
  }, [cdsById, dirById, agencyById, openSqlPanel]);

  return (
    <>
    <div className="fade-in">
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <div className="page-title" style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:4, height:22, borderRadius:2, background:accent, flexShrink:0 }}/>
            Rules Explorer
          </div>
          <div className="page-sub">
            {filtered.length} rule{filtered.length !== 1 ? 's' : ''} &middot; {totalAllocs} allocation{totalAllocs !== 1 ? 's' : ''}
            {retiredCount > 0 && (' - ' + retiredCount + ' retired')}
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop:4 }}
          disabled={!canEdit}
          title={!canEdit ? 'Set your steward identity in Settings to make changes' : undefined}
          onClick={handleAddRule}>
          <Icon.Plus/> Add rule
        </button>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ flex:1, position:'relative' }}>
          <div style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
            color:'var(--text3)', width:14, height:14, pointerEvents:'none' }}>
            <Icon.Search/>
          </div>
          <input className="table-search" style={{ paddingLeft:32, paddingRight: search ? 28 : 10 }}
            placeholder="Search rules, agencies, data sets, tables, fields..."
            value={search} onChange={e => setSearch(e.target.value)}/>
          {search && (
            <button onClick={() => setSearch('')}
              style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)',
                background:'var(--text3)', border:'none', cursor:'pointer', padding:0,
                color:'var(--bg)', width:16, height:16, display:'flex',
                alignItems:'center', justifyContent:'center', borderRadius:'50%', flexShrink:0 }}
              title="Clear search">
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/>
              </svg>
            </button>
          )}
        </div>
        <MyDataToggle
          active={myDataOnly}
          onToggle={function() { setMyDataOnly(function(v) { return !v; }); }}
          available={!!stewardIdentity}
          accent={accent}
        />
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

      <div style={{ fontSize:11, color:'var(--text3)', marginBottom:10, fontFamily:'var(--mono)' }}>
        Showing {filtered.length} of {liveCount} rule{liveCount !== 1 ? 's' : ''}
        {search && (' matching "' + search + '"')}
      </div>

      {filtered.length === 0 ? (
        <div className="status-row status-info">No rules match the current filter.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(ruleEntry => (
            <RulesRuleRow
              key={ruleEntry.rule.data_quality_rule_id}
              ruleEntry={ruleEntry}
              critGroupsSorted={critGroupsSorted} critLevelsById={critLevelsById}
              dimensionsById={dimensionsById} expanded={expanded} onToggle={toggleKey}
              onEdit={handleEditRule} onRetire={handleRetireRule} onRestore={handleRestoreRule}
              onEditAlloc={handleEditAlloc} onRetireAlloc={handleRetireAlloc} onRestoreAlloc={handleRestoreAlloc}
              onOpenSql={handleOpenSql} canEdit={canEdit} accent={accent}
            />
          ))}
        </div>
      )}
    </div>

    {rulePanel && ReactDOM.createPortal(
      <RuleFormPanel
        record={rulePanel.record}
        onSave={handleRuleSave}
        onClose={() => setRulePanel(null)}
        data={data}
      />,
      document.body
    )}

    {allocPanel && ReactDOM.createPortal(
      <CdeAllocFormPanel
        record={allocPanel.record}
        isEdit={allocPanel.isEdit}
        onSave={handleAllocSave}
        onClose={() => setAllocPanel(null)}
        data={data}
      />,
      document.body
    )}
    </>
  );
}
