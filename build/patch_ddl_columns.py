import sys

filepath = (
    r'C:\Users\2264421\OneDrive - Cognizant\Documents\Data Management'
    r'\Data Quality\Tooling\MOJ POC\dq-accelerator\src\201_ddl_form_panel.js'
)

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# ─── Change 1: Add profKeys + cdeKeys useMemo hooks after existing useMemo ────
# Insert after the cdePairs useMemo closing ), [data, existingDdls, record]);
anchor_after = '  }, [data, existingDdls, record]);\n\n'
insert_pos = content.find(anchor_after)
assert insert_pos != -1, 'Anchor for useMemo insert not found'
insert_pos += len(anchor_after)

new_hooks = (
    '\n'
    '  const profKeys = useMemo(() => {\n'
    '    const db  = dbName.toLowerCase();\n'
    '    const tbl = tableName.toLowerCase();\n'
    '    return new Set(\n'
    '      (data?.field_profiling || [])\n'
    '        .filter(p => !p.retiring_timestamp &&\n'
    '          (p.source_database_name || \'\').toLowerCase() === db &&\n'
    '          (p.source_table_name    || \'\').toLowerCase() === tbl)\n'
    '        .map(p => (p.source_field_name || \'\').toLowerCase())\n'
    '    );\n'
    '  }, [data, dbName, tableName]);\n'
    '\n'
    '  const cdeKeys = useMemo(() => {\n'
    '    const db  = dbName.toLowerCase();\n'
    '    const tbl = tableName.toLowerCase();\n'
    '    return new Set(\n'
    '      (data?.critical_data_element || [])\n'
    '        .filter(c => !c.retiring_timestamp &&\n'
    '          (c.source_database_name || \'\').toLowerCase() === db &&\n'
    '          (c.source_table_name    || \'\').toLowerCase() === tbl)\n'
    '        .map(c => (c.source_field_name || \'\').toLowerCase())\n'
    '    );\n'
    '  }, [data, dbName, tableName]);\n'
)

content = content[:insert_pos] + new_hooks + content[insert_pos:]
print('Change 1 OK — profKeys + cdeKeys hooks added')

# ─── Change 2: Replace the chips render with a proper table ───────────────────
old2_start = content.find('              {parsed.length > 0 && (\n'
                           '                <div style={{ display:\'flex\', flexWrap:\'wrap\', gap:4 }}>')
assert old2_start != -1, 'Change 2 start not found'

old2_end_anchor = '                </div>\n              )}\n            </div>\n          )}'
old2_end = content.find(old2_end_anchor, old2_start)
assert old2_end != -1, 'Change 2 end not found'
old2_end += len(old2_end_anchor)

old2 = content[old2_start:old2_end]

# Build checkmark using ASCII escape sequence (backslash + u2713)
ck = "{'\\u2713'}"

new2 = (
    '              {parsed.length > 0 && (\n'
    "                <div style={{ overflow:'auto', maxHeight:260,\n"
    "                  border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>\n"
    "                  <table style={{ width:'100%', borderCollapse:'collapse',\n"
    "                    fontSize:11, fontFamily:'var(--mono)', minWidth:320 }}>\n"
    '                    <thead>\n'
    "                      <tr style={{ background:'var(--bg3)', position:'sticky', top:0, zIndex:1 }}>\n"
    "                        {['', 'CDE', 'Type', 'Field'].map((h, i) => (\n"
    '                          <th key={i} style={{\n'
    "                            padding:'4px 8px', textAlign: i >= 2 ? 'left' : 'center',\n"
    "                            borderBottom:'1px solid var(--border)',\n"
    "                            color:'var(--text3)', fontWeight:700, fontSize:9,\n"
    "                            letterSpacing:'0.06em', textTransform:'uppercase',\n"
    '                            width: i===0 ? 28 : i===1 ? 44 : i===2 ? 90 : undefined,\n'
    "                            whiteSpace:'nowrap',\n"
    '                          }}>{h}</th>\n'
    '                        ))}\n'
    '                      </tr>\n'
    '                    </thead>\n'
    '                    <tbody>\n'
    '                      {parsed.map((c, i) => {\n'
    '                        const isProf = profKeys.has(c.name.toLowerCase());\n'
    '                        const isCde  = cdeKeys.has(c.name.toLowerCase());\n'
    '                        return (\n'
    '                          <tr key={c.name} style={{\n'
    "                            background: i%2===0 ? 'var(--bg)' : 'var(--bg2)',\n"
    "                            borderBottom:'1px solid var(--border)',\n"
    '                          }}>\n'
    "                            <td style={{ textAlign:'center', padding:'4px 8px',\n"
    "                              color:'#22c98e', fontSize:12 }}>\n"
    '                              {isProf && ' + ck + '}\n'
    '                            </td>\n'
    "                            <td style={{ textAlign:'center', padding:'4px 8px' }}>\n"
    '                              {isCde && (\n'
    '                                <span style={{ fontSize:9, fontWeight:700,\n'
    '                                  color:accent, background:`${accent}18`,\n'
    "                                  border:`1px solid ${accent}40`,\n"
    "                                  borderRadius:3, padding:'1px 5px' }}>CDE</span>\n"
    '                              )}\n'
    '                            </td>\n'
    "                            <td style={{ padding:'4px 8px', color:'var(--text3)',\n"
    "                              whiteSpace:'nowrap' }}>{c.type}</td>\n"
    "                            <td style={{ padding:'4px 8px', color:'var(--text)',\n"
    "                              whiteSpace:'nowrap' }}>{c.name}</td>\n"
    '                          </tr>\n'
    '                        );\n'
    '                      })}\n'
    '                    </tbody>\n'
    '                  </table>\n'
    '                </div>\n'
    '              )}\n'
    '            </div>\n'
    '          )}'
)

content = content[:old2_start] + new2 + content[old2_end:]
print('Change 2 OK — chips replaced with table')

# ─── Validate no non-ASCII ────────────────────────────────────────────────────
bad = [(i, ch) for i, ch in enumerate(content) if ord(ch) > 127]
if bad:
    print(f'ERROR: non-ASCII at {bad[:3]}')
    sys.exit(1)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
