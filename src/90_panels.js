// ===============================================================================
// SQL COMPOSER -- substitutes placeholders, appends snapshot filter
// No case transformation -- preserves original SQL casing exactly.
// ===============================================================================
function composeSql(template, cde, mode) {
  if (!template || !cde) return null;
  const snapRaw = cde.source_snapshot_filter;

  let sql  = substituteCdeTokens(template, cde);
  const snap = snapRaw ? substituteCdeTokens(snapRaw, cde) : null;

  if (snap) {
    sql = mode === 'sample'
      ? sql + ' WHERE ' + snap
      : sql + ' AND '   + snap;
  }
  return sql;
}

// ===============================================================================
// SQL SLIDE-IN PANEL
// ===============================================================================
function SqlPanel({ panel, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!panel) return null;

  const copy = () => {
    navigator.clipboard.writeText(normalizeWhitespace(panel.sql)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position:'fixed', inset:0, zIndex:300,
        background:'var(--overlay-sm)',
      }}/>

      {/* Panel */}
      <div style={{
        position:'fixed', top:0, right:0, bottom:0,
        width:'min(600px, 55vw)',
        background:'var(--bg2)', borderLeft:'1px solid var(--border2)',
        zIndex:400, display:'flex', flexDirection:'column',
        boxShadow:'-4px 0 24px var(--overlay-md)',
        animation:'slideInRight 0.18s ease',
      }}>
        <style>{`@keyframes slideInRight{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}`}</style>

        {/* Header */}
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'flex-start', gap:12, flexShrink:0 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',
              textTransform:'uppercase', color: panel.mode === 'sample'
                ? 'var(--text2)' : 'var(--accent)',
              marginBottom:4 }}>
              {panel.mode === 'sample' ? 'Sample SQL' : 'Rule SQL'}
            </div>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text)',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {panel.ruleName}
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:3,
              display:'flex', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontFamily:'var(--mono)' }}>{panel.fieldName}</span>
              {panel.cdsName && <>
                <span style={{ opacity:0.4 }}>-</span>
                <span>{panel.cdsName}</span>
              </>}
              {panel.agencyAcronym && <>
                <span style={{ opacity:0.4 }}>-</span>
                <span>{panel.agencyAcronym}</span>
              </>}
            </div>
          </div>
          <div style={{ display:'flex', gap:6, flexShrink:0, marginTop:2 }}>
            <button className="btn btn-ghost" style={{ fontSize:11, padding:'4px 8px' }}
              onClick={copy} title="Copy to clipboard">
              {copied ? <Icon.Check/> : <Icon.Copy/>}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="btn btn-ghost" style={{ padding:'4px 8px' }}
              onClick={onClose} title="Close">
              <Icon.X/>
            </button>
          </div>
        </div>

        {/* SQL body */}
        <div style={{ flex:1, overflow:'auto', padding:'16px 18px' }}>
          <pre style={{
            fontFamily:'var(--mono)', fontSize:12, lineHeight:1.7,
            color:'var(--text)', background:'var(--bg)',
            border:'1px solid var(--border)', borderRadius:'var(--radius)',
            padding:'14px 16px', whiteSpace:'pre-wrap', wordBreak:'break-all',
            margin:0,
          }}>
            {panel.sql}
          </pre>

          {/* Snapshot filter info */}
          {panel.snapshotFilter && (
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:10, fontWeight:600, letterSpacing:'0.08em',
                textTransform:'uppercase', color:'var(--text3)', marginBottom:6 }}>
                Snapshot filter appended
              </div>
              <pre style={{
                fontFamily:'var(--mono)', fontSize:11, lineHeight:1.6,
                color:'var(--text3)', background:'var(--bg)',
                border:'1px solid var(--border)', borderRadius:'var(--radius)',
                padding:'10px 14px', whiteSpace:'pre-wrap', wordBreak:'break-all',
                margin:0,
              }}>
                {panel.snapshotFilter}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ===============================================================================
// RETIRE CONFIRM PANEL
// ===============================================================================
function getRecordDisplayName(tableName, record) {
  if (!record) return '';
  const map = {
    critical_data_element:        function(r) { return [r.source_database_name, r.source_table_name, r.source_field_name].filter(Boolean).join('.'); },
    critical_data_set:            function(r) { return r.data_set_name || ''; },
    data_quality_rule:            function(r) { return r.rule_name || ''; },
    data_quality_rule_allocation: function(r) { return 'Allocation #' + r.data_quality_rule_allocation_id; },
    cde_criticality:              function(r) { return 'Criticality #' + r.cde_criticality_id; },
    stewardship:                  function(r) { return 'Stewardship #' + r.stewardship_id; },
    executive_agency:             function(r) { return [r.agency_acronymn, r.agency_name].filter(Boolean).join(' - '); },
    directorate:                  function(r) { return r.directorate_name || r.directorate_acronymn || ''; },
    data_patron:                  function(r) { return r.data_patron_name || ''; },
    data_owner:                   function(r) { return r.data_owner_name || ''; },
    data_steward:                 function(r) { return r.data_steward_name || ''; },
    shortlist_group:              function(r) { return r.shortlist_group_label || ''; },
    cde_shortlist_tag:            function(r) { return 'Tag #' + r.cde_shortlist_tag_id; },
    source_table_ddl:             function(r) { return [r.source_database_name, r.source_table_name].filter(Boolean).join('.'); },
    field_profiling:              function(r) { return [r.source_database_name, r.source_table_name, r.source_field_name].filter(Boolean).join('.'); },
    criticality_group_weight:     function(r) { return 'Weight #' + r.criticality_group_weight_id; },
    quality_dimension_weight:     function(r) { return 'Weight #' + r.quality_dimension_weight_id; },
  };
  var fn = map[tableName];
  return fn ? fn(record) : '#' + record[SCHEMA[tableName] && SCHEMA[tableName].pk];
}

function RetireConfirmPanel({ confirm, onConfirm, onCancel }) {
  var tableName     = confirm.tableName;
  var record        = confirm.record;
  var cascadeSummary = confirm.cascadeSummary;
  var schema        = SCHEMA[tableName];
  var displayName   = getRecordDisplayName(tableName, record);
  var hasCascade    = cascadeSummary.length > 0;

  return (
    <>
      <div onClick={onCancel} style={{ position:'fixed', inset:0, zIndex:500, background:'var(--overlay-sm)' }}/>
      <div style={{
        position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
        zIndex:501, width:'min(480px,90vw)', background:'var(--bg2)',
        border:'1px solid var(--border2)', borderRadius:'var(--radius)',
        boxShadow:'0 8px 32px var(--overlay-md)', padding:24,
      }}>

        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <span style={{ color:'var(--amber)', flexShrink:0, width:18, height:18 }}><Icon.Warning/></span>
          <div style={{ fontSize:15, fontWeight:600 }}>
            Retire {schema && schema.label}
          </div>
        </div>

        <div style={{
          fontSize:12, fontFamily:'var(--mono)', color:'var(--text2)',
          background:'var(--bg3)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', padding:'8px 12px', marginBottom:16,
        }}>
          {displayName}
        </div>

        {hasCascade ? (
          <div style={{
            background:'var(--amber-bg)', border:'1px solid rgba(245,166,35,0.4)',
            borderRadius:'var(--radius)', padding:'10px 14px', marginBottom:20,
          }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--amber)', marginBottom:6 }}>
              This will also retire:
            </div>
            {cascadeSummary.map(function(item) {
              return (
                <div key={item.tbl} style={{
                  fontSize:12, color:'var(--text2)',
                  display:'flex', alignItems:'center', gap:8, marginTop:4,
                }}>
                  <span style={{
                    width:4, height:4, borderRadius:'50%',
                    background:'var(--amber)', flexShrink:0, display:'inline-block',
                  }}/>
                  {item.count} {SCHEMA[item.tbl] && SCHEMA[item.tbl].label} {item.count === 1 ? 'record' : 'records'}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20 }}>
            No dependent records will be affected. This can be undone by restoring the record.
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>
            <Icon.EyeOff/> Confirm retirement
          </button>
        </div>
      </div>
    </>
  );
}

// ===============================================================================
// DATA QUALITY RULE VIEW -- sorted by name, with inline CDE allocations
// ===============================================================================
