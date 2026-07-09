filepath = (
    r'C:\Users\2264421\OneDrive - Cognizant\Documents\Data Management'
    r'\Data Quality\Tooling\MOJ POC\dq-accelerator\src\201_ddl_form_panel.js'
)
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# ── Step 1: remove the two misplaced useMemo blocks ──────────────────────────
start = content.find('\n\n  const profKeys = useMemo')
assert start != -1, 'profKeys block not found'
end   = content.find('\n  }, [data, dbName, tableName]);\n', start)
end  += len('\n  }, [data, dbName, tableName]);\n')
# end is now just past the cdeKeys closing line
# verify
print('Removing:', repr(content[start:start+40]), '...')
removed_block = content[start:end]
content = content[:start] + content[end:]
print('Removed block OK')

# ── Step 2: insert the two useMemos after parsed state declaration ────────────
# anchor: after `const [parsed, setParsed] = useState(...)` block
anchor = '  const [errors,    setErrors]    = useState({});\n'
ins    = content.find(anchor)
assert ins != -1, 'errors useState anchor not found'

new_hooks = (
    '\n'
    '  const profKeys = useMemo(() => {\n'
    '    const db  = (dbName  || \'\').toLowerCase();\n'
    '    const tbl = (tableName || \'\').toLowerCase();\n'
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
    '    const db  = (dbName  || \'\').toLowerCase();\n'
    '    const tbl = (tableName || \'\').toLowerCase();\n'
    '    return new Set(\n'
    '      (data?.critical_data_element || [])\n'
    '        .filter(c => !c.retiring_timestamp &&\n'
    '          (c.source_database_name || \'\').toLowerCase() === db &&\n'
    '          (c.source_table_name    || \'\').toLowerCase() === tbl)\n'
    '        .map(c => (c.source_field_name || \'\').toLowerCase())\n'
    '    );\n'
    '  }, [data, dbName, tableName]);\n'
    '\n'
)

content = content[:ins] + new_hooks + content[ins:]
print('Re-inserted hooks after parsed state OK')

# ── Step 3: guard c.name in table render ──────────────────────────────────────
old3 = (
    '                        const isProf = profKeys.has(c.name.toLowerCase());\n'
    '                        const isCde  = cdeKeys.has(c.name.toLowerCase());\n'
)
new3 = (
    '                        const isProf = profKeys.has((c.name || \'\').toLowerCase());\n'
    '                        const isCde  = cdeKeys.has((c.name || \'\').toLowerCase());\n'
)
assert old3 in content, 'c.name guard anchor not found'
content = content.replace(old3, new3, 1)
print('c.name guards added OK')

# ── Validate ──────────────────────────────────────────────────────────────────
bad = [(i, ch) for i, ch in enumerate(content) if ord(ch) > 127]
assert not bad, 'Non-ASCII: ' + str(bad[:3])

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done.')
