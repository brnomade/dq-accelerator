// ===============================================================================
// COMPUTE STEWARD GAPS -- pure function, no React, called inside useMemo
// ===============================================================================
function computeStewardGaps(data, stewardIdentity) {
  const live = (t) => (data[t] || []).filter(r => !r.retiring_timestamp);

  // My CDS ids -- exclude master marker record (critical_data_set_id = 0)
  const myStew = live('stewardship').filter(s =>
    s.data_steward_id === stewardIdentity.id && s.critical_data_set_id !== 0
  );
  const myCdsIds = new Set(myStew.map(s => s.critical_data_set_id));

  // Index tables for fast lookup
  const cdsById = {};
  live('critical_data_set').forEach(c => { cdsById[c.critical_data_set_id] = c; });
  const dirById = {};
  live('directorate').forEach(d => { dirById[d.directorate_id] = d; });

  // Agencies derived from my CDSes via directorate chain
  const myAgencyIds = new Set();
  myCdsIds.forEach(id => {
    const cds = cdsById[id];
    if (!cds) return;
    const dir = dirById[cds.directorate_id];
    if (dir) myAgencyIds.add(dir.executive_agency_id);
  });

  // All directorate ids in my agencies
  const myAgencyDirIds = new Set(
    live('directorate')
      .filter(d => myAgencyIds.has(d.executive_agency_id))
      .map(d => d.directorate_id)
  );

  // My CDEs
  const myCdes = live('critical_data_element').filter(c => myCdsIds.has(c.critical_data_set_id));
  const myCdeIds = new Set(myCdes.map(c => c.critical_data_element_id));

  // CDSes in my agencies that have no live stewardship record
  const ownedCdsIds = new Set(
    live('stewardship')
      .filter(s => s.critical_data_set_id !== 0)
      .map(s => s.critical_data_set_id)
  );
  const unownedCds = live('critical_data_set').filter(c =>
    myAgencyDirIds.has(c.directorate_id) && !ownedCdsIds.has(c.critical_data_set_id)
  );

  // CDE count per CDS (for empty/unprotected detection)
  const cdeCountByCds = {};
  live('critical_data_element').forEach(c => {
    cdeCountByCds[c.critical_data_set_id] = (cdeCountByCds[c.critical_data_set_id] || 0) + 1;
  });

  // Empty CDSes: my CDSes with 0 CDEs
  const emptyCds = live('critical_data_set').filter(c =>
    myCdsIds.has(c.critical_data_set_id) && !cdeCountByCds[c.critical_data_set_id]
  );

  // Rule allocations covering my CDEs
  const myAllocations = live('data_quality_rule_allocation').filter(a =>
    myCdeIds.has(a.critical_data_element_id)
  );
  const coveredCdeIds = new Set(myAllocations.map(a => a.critical_data_element_id));

  // Unprotected CDSes: have CDEs but zero rules on any of them
  const unprotectedCds = live('critical_data_set').filter(c => {
    if (!myCdsIds.has(c.critical_data_set_id)) return false;
    const cdesInCds = myCdes.filter(cde => cde.critical_data_set_id === c.critical_data_set_id);
    if (cdesInCds.length === 0) return false;
    return !cdesInCds.some(cde => coveredCdeIds.has(cde.critical_data_element_id));
  });

  // Unprotected CDEs: individually have no rule allocations
  const unprotectedCdes = myCdes.filter(c => !coveredCdeIds.has(c.critical_data_element_id));

  // Profiling key set: db|table|field
  const profilingKey = r =>
    (r.source_database_name || '') + '|' +
    (r.source_table_name    || '') + '|' +
    (r.source_field_name    || '');
  const profilingKeys = new Set(live('field_profiling').map(profilingKey));

  // Unprofiled CDEs: no matching field_profiling record
  const unprofiledCdes = myCdes.filter(c => !profilingKeys.has(profilingKey(c)));

  // Unrated CDEs: no cde_criticality record
  const ratedCdeIds = new Set(live('cde_criticality').map(c => c.critical_data_element_id));
  const unratedCdes = myCdes.filter(c => !ratedCdeIds.has(c.critical_data_element_id));

  // Incomplete definitions: missing definition or explanation
  const incompleteCdes = myCdes.filter(c =>
    !c.data_element_definition || !c.data_element_explanation
  );

  // Undocumented CDSes: my CDSes missing a data_set_description
  const undocumentedCds = live('critical_data_set').filter(c =>
    myCdsIds.has(c.critical_data_set_id) && !c.data_set_description
  );

  // Quality dimension coverage
  const dims = (data.quality_dimension || []);
  const coveredDimIds = new Set(myAllocations.map(a => a.quality_dimension_id));
  const uncoveredDims = dims.filter(d => !coveredDimIds.has(d.quality_dimension_id));
  const dimensionCoverage = dims.map(d => {
    const coveredCount = new Set(
      myAllocations
        .filter(a => a.quality_dimension_id === d.quality_dimension_id)
        .map(a => a.critical_data_element_id)
    ).size;
    return { dim: d, coveredCount, totalCdes: myCdeIds.size };
  }).sort((a, b) => a.coveredCount - b.coveredCount);

  // Profiled CDE ids (for summary)
  const profiledCdeIds = new Set(
    myCdes.filter(c => profilingKeys.has(profilingKey(c))).map(c => c.critical_data_element_id)
  );

  // My CDSes summary: one row per CDS I own
  const myCdsSummary = live('critical_data_set')
    .filter(c => myCdsIds.has(c.critical_data_set_id))
    .map(cds => {
      const cdesInCds  = myCdes.filter(c => c.critical_data_set_id === cds.critical_data_set_id);
      const cdeCount   = cdesInCds.length;
      const cdeIdsInCds = new Set(cdesInCds.map(c => c.critical_data_element_id));
      const ruleCount  = myAllocations.filter(a => cdeIdsInCds.has(a.critical_data_element_id)).length;
      const ratedCount = cdesInCds.filter(c => ratedCdeIds.has(c.critical_data_element_id)).length;
      const profiledCount = cdesInCds.filter(c => profiledCdeIds.has(c.critical_data_element_id)).length;
      return { cds, cdeCount, ruleCount, ratedCount, profiledCount };
    });

  // Scoped FK integrity issues: filter runHealthCheck output to my scope
  const { issues: allIssues } = runHealthCheck(data);
  const scopedIssues = allIssues.filter(iss => {
    if (iss.table === 'critical_data_element')        return myCdeIds.has(iss.pk);
    if (iss.table === 'critical_data_set')            return myCdsIds.has(iss.pk);
    if (iss.table === 'data_quality_rule_allocation') {
      const a = (data.data_quality_rule_allocation || []).find(r => r.data_quality_rule_allocation_id === iss.pk);
      return a && myCdeIds.has(a.critical_data_element_id);
    }
    if (iss.table === 'cde_criticality') {
      const c = (data.cde_criticality || []).find(r => r.cde_criticality_id === iss.pk);
      return c && myCdeIds.has(c.critical_data_element_id);
    }
    if (iss.table === 'stewardship') {
      const s = (data.stewardship || []).find(r => r.stewardship_id === iss.pk);
      return s && myCdsIds.has(s.critical_data_set_id);
    }
    return false;
  });

  return {
    myCdsIds, myAgencyIds, myCdeIds,
    unownedCds, emptyCds, unprotectedCds, unprotectedCdes,
    unprofiledCdes, unratedCdes, incompleteCdes, undocumentedCds,
    uncoveredDims, dimensionCoverage,
    myCdsSummary, scopedIssues,
  };
}

// ===============================================================================
// ACTION CARD -- simple click-to-navigate card
// ===============================================================================
function ActionCard({ count, label, description, screen, table, onNavigate }) {
  const hasGap = count > 0;
  const accent = hasGap ? 'var(--amber)' : 'var(--green)';
  return (
    <div
      onClick={() => onNavigate({ screen: screen, table: table || null })}
      style={{
        background: 'var(--bg2)',
        border: '1px solid ' + (hasGap ? 'var(--amber)' : 'var(--border)'),
        borderLeft: '3px solid ' + accent,
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
        cursor: 'pointer',
        flex: '1 1 155px',
        maxWidth: 215,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1, marginBottom: 6 }}>
        {count}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>
        {description}
      </div>
    </div>
  );
}

// ===============================================================================
// EXPANDABLE ACTION CARD -- card that reveals a drillable item list on click.
// Each item has { label, sublabel?, navigateTo } where navigateTo is passed
// directly to onNavigate -- same contract as the navigate() context function.
// Use this variant when the steward needs to act on a specific named record,
// not just navigate to a generic page.
// ===============================================================================
function ExpandableActionCard({ count, label, description, items, onNavigate }) {
  const [open, setOpen] = useState(false);
  const hasGap = count > 0;
  const accent = hasGap ? 'var(--amber)' : 'var(--green)';
  const isOpen = hasGap && open;

  return (
    <div style={{ flex: '1 1 155px', maxWidth: 215 }}>
      <div
        onClick={function() { if (hasGap) setOpen(function(o) { return !o; }); }}
        style={{
          background: 'var(--bg2)',
          border: '1px solid ' + (hasGap ? 'var(--amber)' : 'var(--border)'),
          borderLeft: '3px solid ' + accent,
          borderRadius: isOpen ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)',
          padding: '14px 16px',
          cursor: hasGap ? 'pointer' : 'default',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1, marginBottom: 6 }}>
            {count}
          </div>
          {hasGap && (
            <span style={{
              color: 'var(--text3)', fontSize: 12, flexShrink: 0,
              display: 'inline-block',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}>{'\u25be'}</span>
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>
          {description}
        </div>
      </div>

      {isOpen && (
        <div style={{
          border: '1px solid var(--amber)',
          borderTop: 'none',
          borderRadius: '0 0 var(--radius) var(--radius)',
          background: 'var(--bg3)',
          maxHeight: 180,
          overflowY: 'auto',
        }}>
          {items.map(function(item, i) {
            return (
              <div
                key={i}
                onClick={function() { onNavigate(item.navigateTo); }}
                style={{
                  padding: '7px 10px',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 500, color: 'var(--text)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {item.label}
                  </div>
                  {item.sublabel && (
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{item.sublabel}</div>
                  )}
                </div>
                <span style={{ color: 'var(--text3)', fontSize: 11, flexShrink: 0 }}>{'\u2192'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===============================================================================
// DASHBOARD SCREEN
// ===============================================================================
function DashboardScreen() {
  const { data, hasData, stewardIdentity, isMaster, navigate } = useApp();
  const [fkOpen, setFkOpen] = useState(false);

  const gaps = useMemo(
    () => (data && stewardIdentity) ? computeStewardGaps(data, stewardIdentity) : null,
    [data, stewardIdentity]
  );

  // No data loaded
  if (!hasData) {
    return (
      <div className="fade-in">
        <div className="page-title">Dashboard</div>
        <div className="page-sub">No data loaded. Use Import to load your data.</div>
      </div>
    );
  }

  // No steward identity set
  if (!stewardIdentity) {
    return (
      <div className="fade-in">
        <div className="page-title">Dashboard</div>
        <div style={{
          marginTop: 32, padding: '24px 28px', maxWidth: 520,
          background: 'var(--bg2)',
          border: '1px solid var(--amber)',
          borderLeft: '3px solid var(--amber)',
          borderRadius: 'var(--radius)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--amber)', fontSize: 13 }}>
            No steward identity set
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            This dashboard is personalised to your steward account.
            Open <strong>Settings</strong> (top-right) to identify yourself.
          </div>
        </div>
      </div>
    );
  }

  // Steward display name
  const stewardRec  = (data.data_steward || []).find(s => s.data_steward_id === stewardIdentity.id);
  const stewardName = stewardRec ? stewardRec.data_steward_name : ('Steward #' + stewardIdentity.id);

  // Agency acronym display
  const agencyById  = {};
  (data.executive_agency || []).forEach(a => { agencyById[a.executive_agency_id] = a; });
  const dirById = {};
  (data.directorate || []).forEach(d => { dirById[d.directorate_id] = d; });
  const agencyNames = Array.from(gaps.myAgencyIds)
    .map(id => agencyById[id] ? agencyById[id].agency_acronymn : String(id))
    .join(', ');

  const hasPersonalCds = gaps.myCdsIds.size > 0;

  const cards = [
    { count: gaps.unownedCds.length,      label: 'Unowned CDS',         description: 'CDS in your agency not yet assigned to any steward.',                        screen: 'table',   table: 'critical_data_element' },
    { count: gaps.emptyCds.length,        label: 'Empty CDS',            description: 'Your CDS with no Critical Data Elements defined yet.',                      screen: 'table',   table: 'critical_data_element' },
    { count: gaps.unprotectedCds.length,  label: 'Unprotected CDS',      description: 'Your CDS that have CDEs but no rules allocated to any of them.',            screen: 'rulenav', table: null },
    { count: gaps.unprotectedCdes.length, label: 'Unprotected CDEs',       description: 'Individual CDEs with no rule allocations \u2014 not validated.',              screen: 'rulenav', table: null },
    { count: gaps.unprofiledCdes.length,  label: 'Unprofiled CDEs',        description: 'CDEs with no matching field profiling record.',                               screen: 'table',   table: 'source_table_ddl' },
    { count: gaps.unratedCdes.length,     label: 'Unrated CDEs',           description: 'CDEs with no criticality assessment. Invisible to the RAG Simulator.',        screen: 'table',   table: 'critical_data_element' },
    { count: gaps.incompleteCdes.length,  label: 'Incomplete Definitions',  description: 'CDEs missing a definition or explanation.',                                   screen: 'table',   table: 'critical_data_element' },
    { count: gaps.uncoveredDims.length,   label: 'Uncovered Dimensions',   description: 'Quality dimensions with zero rule coverage across all your CDEs.',             screen: 'rulenav', table: null },
    {
      count: gaps.undocumentedCds.length,
      label: 'Undocumented CDS',
      description: 'The description field is empty for your CDS. All sets should have a clear definition.',
      items: gaps.undocumentedCds.map(function(cds) {
        var dir    = dirById[cds.directorate_id];
        var agency = dir ? agencyById[dir.executive_agency_id] : null;
        return {
          label:      cds.data_set_name || ('CDS #' + cds.critical_data_set_id),
          sublabel:   agency ? agency.agency_acronymn : null,
          navigateTo: { screen: 'table', table: 'critical_data_element', initialSearch: cds.data_set_name || '' },
        };
      }),
    },
  ];

  const allClear = hasPersonalCds &&
    cards.every(c => c.count === 0) &&
    gaps.scopedIssues.length === 0;

  return (
    <div className="fade-in">
      <div className="page-title">Dashboard</div>

      {/* Identity bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 16px', marginBottom: 20,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--green)',
        borderRadius: 'var(--radius)',
      }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{stewardName}</div>
        {isMaster && (
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
            background: 'var(--amber)', color: '#fff', letterSpacing: '0.04em',
          }}>MASTER</span>
        )}
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {gaps.myCdsIds.size} CDS{gaps.myCdsIds.size !== 1 ? 'es' : ''}
          {agencyNames ? ' \u00b7 ' + agencyNames : ''}
        </div>
      </div>

      {/* Empty state: no personal CDS assignments */}
      {!hasPersonalCds && (
        <div style={{
          padding: '18px 22px',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          fontSize: 13, color: 'var(--text2)', lineHeight: 1.6,
        }}>
          {isMaster
            ? 'You have no personal CDS assignments. Use the Quality Reporting page (coming soon) to view org-wide data quality status.'
            : 'You have no CDS assignments yet. Contact your master steward to have CDS assigned to you.'
          }
        </div>
      )}

      {hasPersonalCds && (
        <div>

          {/* All clear banner OR action cards */}
          {allClear ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 18px', marginBottom: 20,
              background: 'var(--green-bg)',
              border: '1px solid var(--green)',
              borderRadius: 'var(--radius)',
            }}>
              <span style={{ fontSize: 16, color: 'var(--green)', fontWeight: 700 }} >&#x2713;< /span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--green)', fontSize: 13 }}>All clear</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>No gaps found in your portfolio.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {cards.map(function(c, i) {
                return c.items
                  ? <ExpandableActionCard key={i} count={c.count} label={c.label} description={c.description} items={c.items} onNavigate={navigate}/>
                  : <ActionCard key={i} count={c.count} label={c.label} description={c.description} screen={c.screen} table={c.table} onNavigate={navigate}/>;
              })}
            </div>
          )}

          {/* Coverage by quality dimension */}
          {gaps.myCdeIds.size > 0 && gaps.dimensionCoverage.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div className="section-label">Rule coverage by quality dimension</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, marginTop: -4 }}>
                Partial coverage is expected as not every CDE requires every dimension.
                Zero coverage flags a dimension entirely absent from your portfolio.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {gaps.dimensionCoverage.map(function(item) {
                  var dim = item.dim;
                  var coveredCount = item.coveredCount;
                  var totalCdes = item.totalCdes;
                  var pct      = totalCdes > 0 ? Math.round(coveredCount / totalCdes * 100) : 0;
                  var isZero   = coveredCount === 0;
                  var isFull   = coveredCount === totalCdes && totalCdes > 0;
                  var barColor = isZero ? 'var(--amber)' : isFull ? 'var(--green)' : 'var(--accent)';
                  return (
                    <div key={dim.quality_dimension_id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 12px',
                      background: 'var(--bg2)',
                      border: '1px solid ' + (isZero ? 'var(--amber)' : 'var(--border)'),
                      borderLeft: '3px solid ' + barColor,
                      borderRadius: 'var(--radius)',
                    }}>
                      <div style={{
                        width: 150, fontSize: 12, flexShrink: 0,
                        fontWeight: isZero ? 600 : 400,
                        color: isZero ? 'var(--amber)' : 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {dim.dimension_name}
                      </div>
                      <div style={{
                        flex: 1, height: 6, background: 'var(--bg3)',
                        borderRadius: 3, overflow: 'hidden',
                      }}>
                        <div style={{
                          width: pct + '%', height: '100%',
                          background: barColor, borderRadius: 3,
                        }}/>
                      </div>
                      <div style={{
                        fontSize: 11, flexShrink: 0, width: 85, textAlign: 'right',
                        color: isZero ? 'var(--amber)' : 'var(--text3)',
                      }}>
                        {coveredCount} / {totalCdes} CDEs
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* My CDSes summary table */}
          <div style={{ marginBottom: 24 }}>
            <div className="section-label">My CDS</div>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 56px 56px 80px 80px',
                padding: '7px 14px',
                background: 'var(--bg3)',
                borderBottom: '1px solid var(--border)',
                fontSize: 11, fontWeight: 600, color: 'var(--text3)',
              }}>
                <div>Critical Data Set</div>
                <div style={{ textAlign: 'center' }}>CDEs</div>
                <div style={{ textAlign: 'center' }}>Rules</div>
                <div style={{ textAlign: 'center' }}>Rated</div>
                <div style={{ textAlign: 'center' }}>Profiled</div>
              </div>
              {gaps.myCdsSummary.map(function(row, i) {
                var cds = row.cds;
                var cdeCount = row.cdeCount;
                var ruleCount = row.ruleCount;
                var ratedCount = row.ratedCount;
                var profiledCount = row.profiledCount;
                var hasGap = cdeCount === 0 || (cdeCount > 0 && (ruleCount === 0 || ratedCount < cdeCount || profiledCount < cdeCount));
                var rowBorder = hasGap ? 'var(--amber)' : 'var(--green)';
                return (
                  <div key={cds.critical_data_set_id}
                    onClick={() => navigate({ screen: 'table', table: 'critical_data_element' })}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 56px 56px 80px 80px',
                      padding: '9px 14px',
                      borderLeft: '3px solid ' + rowBorder,
                      borderBottom: i < gaps.myCdsSummary.length - 1 ? '1px solid var(--border)' : 'none',
                      background: 'var(--bg2)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}>
                    <div style={{
                      color: 'var(--text)', fontWeight: 500,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {cds.data_set_name}
                    </div>
                    <div style={{ textAlign: 'center', color: cdeCount === 0 ? 'var(--amber)' : 'var(--text2)' }}>
                      {cdeCount}
                    </div>
                    <div style={{ textAlign: 'center', color: cdeCount > 0 && ruleCount === 0 ? 'var(--amber)' : 'var(--text2)' }}>
                      {ruleCount}
                    </div>
                    <div style={{ textAlign: 'center', color: cdeCount > 0 && ratedCount < cdeCount ? 'var(--amber)' : 'var(--text2)' }}>
                      {cdeCount > 0 ? ratedCount + ' / ' + cdeCount : '\u2014'}
                    </div>
                    <div style={{ textAlign: 'center', color: cdeCount > 0 && profiledCount < cdeCount ? 'var(--amber)' : 'var(--text2)' }}>
                      {cdeCount > 0 ? profiledCount + ' / ' + cdeCount : '\u2014'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Data integrity -- collapsible, scoped to steward's data */}
          <div style={{ marginBottom: 24 }}>
            <div
              onClick={() => setFkOpen(function(o) { return !o; })}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', cursor: 'pointer',
                background: 'var(--bg2)',
                border: '1px solid ' + (gaps.scopedIssues.length ? 'var(--amber)' : 'var(--border)'),
                borderLeft: '3px solid ' + (gaps.scopedIssues.length ? 'var(--amber)' : 'var(--border)'),
                borderRadius: fkOpen ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)',
              }}
            >
              <span style={{
                fontWeight: 600, fontSize: 12,
                color: gaps.scopedIssues.length ? 'var(--amber)' : 'var(--text3)',
              }}>
                Data integrity
              </span>
              <span style={{
                fontSize: 11, padding: '1px 7px', borderRadius: 10,
                background: gaps.scopedIssues.length ? 'var(--amber-bg)' : 'var(--bg3)',
                color: gaps.scopedIssues.length ? 'var(--amber)' : 'var(--text3)',
                border: '1px solid ' + (gaps.scopedIssues.length ? 'var(--amber)' : 'var(--border)'),
              }}>
                {gaps.scopedIssues.length} issue{gaps.scopedIssues.length !== 1 ? 's' : ''}
              </span>
              <span style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 12 }}>
                {fkOpen ? '\u25be' : '\u25b8'}
              </span>
            </div>
            {fkOpen && (
              <div style={{
                border: '1px solid var(--border)',
                borderTop: 'none',
                borderRadius: '0 0 var(--radius) var(--radius)',
                overflow: 'hidden',
              }}>
                {gaps.scopedIssues.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text3)' }}>
                    No integrity issues found in your scope.
                  </div>
                ) : (
                  <div className="issue-list" style={{ margin: 0, borderRadius: 0 }}>
                    {gaps.scopedIssues.slice(0, 30).map(function(iss, i) {
                      return (
                        <div key={i} className="issue-item">
                          <span className="issue-badge">{iss.table}</span>
                          <span style={{ color: 'var(--amber)', fontSize: 11 }}>{iss.msg}</span>
                        </div>
                      );
                    })}
                    {gaps.scopedIssues.length > 30 && (
                      <div className="status-row status-warn">
                        ...and {gaps.scopedIssues.length - 30} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
