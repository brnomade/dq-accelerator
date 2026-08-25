// ===============================================================================
// RULE SQL VALIDATION -- shared utility and display component
// Used by: RuleAllocationFormPanel (130), CdeAllocFormPanel (141), RuleFormPanel (166)
// ===============================================================================
function computeRuleSqlWarnings(sql, sample) {
  const s = (sql    || '').trim();
  const p = (sample || '').trim();
  const warns = [];
  if (!s) {
    warns.push({ level: 'SEVERE', msg: 'Rule has no SQL code defined.' });
    return warns;
  }
  if (!/\bWHERE\b/i.test(s))
    warns.push({ level: 'CRITICAL', msg: 'Rule SQL has no WHERE clause. The engine appends AND <snapshot_filter> to sql_code at run time, which requires a WHERE clause to be present.' });
  if (s.endsWith(';'))
    warns.push({ level: 'CRITICAL', msg: 'Rule SQL ends with a semicolon. The engine appends AND <snapshot_filter> after it, producing invalid SQL.' });
  if (/\bCAST\s*\(/i.test(s))
    warns.push({ level: 'SEVERE', msg: 'Rule SQL uses CAST(). TRY_CAST() is required to avoid runtime data conversion errors in Athena.' });
  const hasIsNull      = /\bIS\s+NULL\b/i.test(s);
  const hasNullif      = /\bNULLIF\b/i.test(s);
  const hasEmptyStrCmp = /=\s*''/.test(s) || /=\s*""/.test(s);
  if ((hasIsNull && !hasNullif) || hasEmptyStrCmp)
    warns.push({ level: 'SEVERE', msg: "Rule SQL uses a bare IS NULL or empty-string check (= ''). Use NULLIF(TRIM(field), '') IS NULL to correctly handle NULL, empty, and whitespace-only values." });
  if (s.indexOf('{SOURCE_DATABASE_NAME}') === -1)
    warns.push({ level: 'SEVERE', msg: 'Rule SQL is missing the {SOURCE_DATABASE_NAME} placeholder. The engine substitutes this with the actual database name at run time.' });
  if (s.indexOf('{SOURCE_TABLE_NAME}') === -1)
    warns.push({ level: 'SEVERE', msg: 'Rule SQL is missing the {SOURCE_TABLE_NAME} placeholder. The engine substitutes this with the actual table name at run time.' });
  if (s.indexOf('{SOURCE_FIELD_NAME}') === -1)
    warns.push({ level: 'SEVERE', msg: 'Rule SQL is missing the {SOURCE_FIELD_NAME} placeholder. The engine substitutes this with the actual field name at run time.' });
  if (p) {
    if (/\bWHERE\b/i.test(p))
      warns.push({ level: 'CRITICAL', msg: 'Sample SQL contains a WHERE clause. The engine appends WHERE <snapshot_filter> to sql_code_sample, which would produce a duplicate WHERE clause.' });
    if (p.endsWith(';'))
      warns.push({ level: 'CRITICAL', msg: 'Sample SQL ends with a semicolon. The engine appends WHERE <snapshot_filter> after it, producing invalid SQL.' });
    if (/\bCAST\s*\(/i.test(p))
      warns.push({ level: 'SEVERE', msg: 'Sample SQL uses CAST(). TRY_CAST() is required to avoid runtime data conversion errors in Athena.' });
    if (p.indexOf('{SOURCE_DATABASE_NAME}') === -1)
      warns.push({ level: 'SEVERE', msg: 'Sample SQL is missing the {SOURCE_DATABASE_NAME} placeholder. The engine substitutes this with the actual database name at run time.' });
    if (p.indexOf('{SOURCE_TABLE_NAME}') === -1)
      warns.push({ level: 'SEVERE', msg: 'Sample SQL is missing the {SOURCE_TABLE_NAME} placeholder. The engine substitutes this with the actual table name at run time.' });
  }
  return warns;
}

function RuleSqlWarningNotices({ warnings, hint }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:6 }}>
        {warnings.map((w, i) => (
          <div key={i} style={{
            display:'flex', gap:8, alignItems:'flex-start',
            padding:'6px 10px',
            background: w.level === 'CRITICAL' ? 'rgba(224,82,82,0.08)' : 'rgba(245,166,35,0.08)',
            border: '1px solid ' + (w.level === 'CRITICAL' ? 'rgba(224,82,82,0.3)' : 'rgba(245,166,35,0.3)'),
            borderRadius:'var(--radius)',
          }}>
            <span style={{
              fontSize:9, fontWeight:700, fontFamily:'var(--mono)',
              letterSpacing:'0.06em', textTransform:'uppercase',
              padding:'2px 6px', borderRadius:3, flexShrink:0, marginTop:1,
              color: w.level === 'CRITICAL' ? 'var(--red)' : 'var(--amber)',
              background: w.level === 'CRITICAL' ? 'rgba(224,82,82,0.15)' : 'rgba(245,166,35,0.15)',
              border: '1px solid ' + (w.level === 'CRITICAL' ? 'rgba(224,82,82,0.4)' : 'rgba(245,166,35,0.4)'),
            }}>
              {w.level}
            </span>
            <span style={{ fontSize:11, lineHeight:1.5,
              color: w.level === 'CRITICAL' ? 'var(--red)' : 'var(--amber)' }}>
              {w.msg}
            </span>
          </div>
        ))}
      </div>
      {hint && (
        <div style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>
          {hint}
        </div>
      )}
    </div>
  );
}
