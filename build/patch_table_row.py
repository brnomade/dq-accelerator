import sys

filepath = (
    r'C:\Users\2264421\OneDrive - Cognizant\Documents\Data Management'
    r'\Data Quality\Tooling\MOJ POC\dq-accelerator\src\200_screen_ddl.js'
)

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

original = content
changes = 0

# ─── Change 1: Add declarations before scopedCdes loop ───────────────────────
# Insert cdeCountByTable / ruleIdsByTable declarations and tk constant
c1_old = (
    '  for (const cde of scopedCdes) {\n'
    '    const key = `${cde.source_database_name}|||${cde.source_table_name}|||${cde.source_field_name}`;'
)
c1_new = (
    '  const cdeCountByTable = {};\n'
    '  const ruleIdsByTable  = {};\n'
    '  for (const cde of scopedCdes) {\n'
    '    const key = `${cde.source_database_name}|||${cde.source_table_name}|||${cde.source_field_name}`;\n'
    '    const tk  = `${cde.source_database_name}|||${cde.source_table_name}`;'
)
assert c1_old in content, 'ERROR: Change 1 anchor not found'
content = content.replace(c1_old, c1_new, 1)
changes += 1
print('Change 1 OK')

# ─── Change 2: Add per-table tracking at end of scopedCdes loop body ─────────
c2_old = (
    '    fieldMap[key].ruleCount += cdeAllocs.length;\n'
    '    for (const a of cdeAllocs) fieldMap[key].dimsCovered.add(a.quality_dimension_id);\n'
    '  }\n'
    '\n'
    '  // Step 2: SQL-extracted fields'
)
c2_new = (
    '    fieldMap[key].ruleCount += cdeAllocs.length;\n'
    '    for (const a of cdeAllocs) fieldMap[key].dimsCovered.add(a.quality_dimension_id);\n'
    '    cdeCountByTable[tk] = (cdeCountByTable[tk] || 0) + 1;\n'
    '    if (!ruleIdsByTable[tk]) ruleIdsByTable[tk] = new Set();\n'
    '    for (const a of cdeAllocs) ruleIdsByTable[tk].add(a.data_quality_rule_id);\n'
    '  }\n'
    '\n'
    '  // Step 2: SQL-extracted fields'
)
assert c2_old in content, 'ERROR: Change 2 anchor not found'
content = content.replace(c2_old, c2_new, 1)
changes += 1
print('Change 2 OK')

# ─── Change 3: Add cdeCount / tableRuleCount to Step 4 return ────────────────
c3_old = (
    '    return {\n'
    '      ...tg,\n'
    '      profilingStats: { total, profiled, notProfiled: total - profiled },'
)
c3_new = (
    '    const tgKey = tg.db ? `${tg.db}|||${tg.table}` : `__unknown__|||${tg.table}`;\n'
    '    return {\n'
    '      ...tg,\n'
    '      cdeCount:       cdeCountByTable[tgKey] || 0,\n'
    '      tableRuleCount: ruleIdsByTable[tgKey] ? ruleIdsByTable[tgKey].size : 0,\n'
    '      profilingStats: { total, profiled, notProfiled: total - profiled },'
)
assert c3_old in content, 'ERROR: Change 3 anchor not found'
content = content.replace(c3_old, c3_new, 1)
changes += 1
print('Change 3 OK')

# ─── Change 4: Update TableGroupRow destructuring, remove barFilled/barColor ─
# Find start of destructuring line
destr_start = content.find(
    '  const { ddl, db, table, fields, profilingStats, coveragePct, hasSqlFields, tableKey } = tableGroup;'
)
assert destr_start != -1, 'ERROR: Change 4 destructuring not found'

# Find end: the isDismissed line (inclusive)
is_dismissed_line = '  const isDismissed = dismissedKeys.has(tableKey);'
is_dismissed_pos = content.find(is_dismissed_line, destr_start)
assert is_dismissed_pos != -1, 'ERROR: Change 4 isDismissed not found'
destr_end = is_dismissed_pos + len(is_dismissed_line)

old4 = content[destr_start:destr_end]
new4 = (
    '  const { ddl, db, table, fields, profilingStats, hasSqlFields, tableKey, cdeCount, tableRuleCount } = tableGroup;\n'
    '  const dimCount  = dimensions.length;\n'
    '  const isDismissed = dismissedKeys.has(tableKey);'
)
content = content[:destr_start] + new4 + content[destr_end:]
changes += 1
print('Change 4 OK')

# ─── Change 5: Replace table row header JSX ───────────────────────────────────
# Start: the <span> for the table name
c5_start_anchor = (
    "        <span style={{ fontSize:13, fontFamily:'var(--mono)', fontWeight:600, color:'var(--text)' }}>\n"
    "          {table}\n"
    "        </span>"
)
c5_start = content.find(c5_start_anchor)
assert c5_start != -1, 'ERROR: Change 5 start not found'

# End: just before the closing tag of the header div (the </div> that ends the header row)
# Pattern: the actions </div> is followed by \n      </div>\n\n      {/* Expanded */
c5_end_anchor = '\n      </div>\n\n      {/* Expanded */'
c5_end = content.find(c5_end_anchor, c5_start)
assert c5_end != -1, 'ERROR: Change 5 end not found'

old5 = content[c5_start:c5_end]

new5 = """\
        <div style={{ flex:1, minWidth:0, display:'flex', alignItems:'baseline', gap:6 }}>
          <span style={{ fontSize:13, fontFamily:'var(--mono)', fontWeight:600, color:'var(--text)' }}>
            {table}
          </span>
          {db && (
            <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', fontWeight:400 }}>
              in {db}
            </span>
          )}
        </div>

        <span style={{
          fontSize:9, fontFamily:'var(--mono)', fontWeight:600,
          color: ddl ? accent : 'var(--text3)',
          background: ddl ? `${accent}15` : 'var(--bg3)',
          border: `1px solid ${ddl ? accent+'40' : 'var(--border)'}`,
          borderRadius:3, padding:'1px 6px', flexShrink:0, whiteSpace:'nowrap',
        }}>
          {ddl ? 'profiled' : 'not profiled'}
        </span>

        <span style={{ fontSize:10, color:'var(--text3)',
          fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap' }}>
          &middot; {profilingStats.total} field{profilingStats.total !== 1 ? 's' : ''}{' '}
          &middot; {cdeCount} CDE{cdeCount !== 1 ? 's' : ''}{' '}
          &middot; {tableRuleCount} rule{tableRuleCount !== 1 ? 's' : ''}
        </span>

        {/* Profile actions */}
        <div onClick={e => e.stopPropagation()}
          style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
          {ddl && canEdit && (
            <button className="btn btn-ghost" style={{ fontSize:10, padding:'2px 6px' }}
              title="Retire table profile" onClick={() => onRetireDDL(tableGroup)}>
              <Icon.EyeOff/>
            </button>
          )}
          {canEdit && (
            <button className="btn btn-ghost"
              style={{ fontSize:10, padding:'2px 9px',
                color: ddl ? 'var(--text2)' : accent,
                border: `1px solid ${ddl ? accent+'40' : 'var(--border)'}`,
                borderRadius:'var(--radius)',
                display:'flex', alignItems:'center', gap:4 }}
              onClick={() => ddl ? onEditDDL(tableGroup) : onAddDDL(tableGroup)}>
              {ddl ? 'Re-profile' : 'Profile'}
            </button>
          )}
        </div>"""

content = content[:c5_start] + new5 + content[c5_end:]
changes += 1
print('Change 5 OK')

# ─── Validate no non-ASCII ────────────────────────────────────────────────────
bad = [(i, ch) for i, ch in enumerate(content) if ord(ch) > 127]
if bad:
    print(f'ERROR: non-ASCII chars found at positions: {bad[:5]}')
    sys.exit(1)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nDone. {changes} changes applied.')
