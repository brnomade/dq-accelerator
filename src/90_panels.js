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
// DATA QUALITY RULE VIEW -- sorted by name, with inline CDE allocations
// ===============================================================================
