import sys

filepath = (
    r'C:\Users\2264421\OneDrive - Cognizant\Documents\Data Management'
    r'\Data Quality\Tooling\MOJ POC\dq-accelerator\src\200_screen_ddl.js'
)

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# ─── Change 1: Strip type badge, rules counter, lastProfiled from header ──────
# Replace the whole sub-row div with just the rulesBlind warning
c1_start = content.find(
    "            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4, flexWrap:'wrap' }}>"
)
assert c1_start != -1, 'C1 start not found'

# end: closing </div> of that row, just before the outer </div> that wraps flex:1
c1_end_anchor = '\n          </div>\n          <div style={{ display:\'flex\', alignItems:\'center\', gap:8, flexShrink:0 }}>'
c1_end = content.find(c1_end_anchor, c1_start)
assert c1_end != -1, 'C1 end not found'

old1 = content[c1_start:c1_end]
new1 = (
    "            {rulesBlind && (\n"
    "              <div style={{ fontSize:10, fontWeight:600, color:'var(--amber)',\n"
    "                fontFamily:'var(--mono)', marginTop:4 }}>\n"
    "                Rules running without a profile\n"
    "              </div>\n"
    "            )}"
)
content = content[:c1_start] + new1 + content[c1_end:]
changes += 1
print('Change 1 OK — header sub-row stripped')

# ─── Change 2: Wrap Step 1 in flex row with Last Profiled box ─────────────────
c2_start_anchor = (
    '          {/* Profiling workflow */}\n'
    '          {!gateMode && sqls && (\n'
    '            <>\n'
    '              {/* Step 1: Semantic type */}\n'
    "              <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',\n"
    '                borderLeft:`3px solid ${accent}`, borderRadius:\'var(--radius-lg)\',\n'
    "                padding:'14px 16px' }}>"
)
c2_start = content.find(c2_start_anchor)
assert c2_start != -1, 'C2 start not found'

# End of Step 1 block: closing </div> before Step 2 comment
c2_end_anchor = '\n\n              {/* Step 2: SQL queries */}'
c2_end = content.find(c2_end_anchor, c2_start)
assert c2_end != -1, 'C2 end not found'

old2 = content[c2_start:c2_end]

new2 = (
    '          {/* Profiling workflow */}\n'
    '          {!gateMode && sqls && (\n'
    '            <>\n'
    '              {/* Step 1 row: Last Profiled (re-profile only) + Semantic type */}\n'
    "              <div style={{ display:'flex', gap:12, alignItems:'stretch' }}>\n"
    '                {existingProfile && (\n'
    "                  <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',\n"
    "                    borderLeft:'3px solid #22c98e', borderRadius:'var(--radius-lg)',\n"
    "                    padding:'14px 16px', flexShrink:0, minWidth:150 }}>\n"
    "                    <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',\n"
    "                      textTransform:'uppercase', color:'#22c98e', marginBottom:10 }}>\n"
    '                      Last Profiled\n'
    '                    </div>\n'
    "                    <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text2)', lineHeight:1.5 }}>\n"
    '                      {existingProfile.profiled_at}\n'
    '                    </div>\n'
    '                    {existingProfile.profiled_by && (\n'
    "                      <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', marginTop:4 }}>\n"
    '                        by {existingProfile.profiled_by}\n'
    '                      </div>\n'
    '                    )}\n'
    '                  </div>\n'
    '                )}\n'
    '                {/* Step 1: Semantic type */}\n'
    "                <div style={{ background:'var(--bg2)', border:'1px solid var(--border)',\n"
    '                  borderLeft:`3px solid ${accent}`, borderRadius:\'var(--radius-lg)\',\n'
    "                  padding:'14px 16px', flex:1 }}>\n"
    "                  <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.08em',\n"
    "                    textTransform:'uppercase', color:accent, marginBottom:10 }}>\n"
    '                    Step 1 - Semantic type\n'
    '                  </div>\n'
    "                  <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>\n"
    "                    <div style={{ fontSize:11, color:'var(--text3)' }}>\n"
    '                      Physical:\n'
    "                      <span style={{ fontFamily:'var(--mono)', fontWeight:600,\n"
    '                        color:accent, marginLeft:6 }}>\n'
    '                        {physicalType || \'--\'}\n'
    '                      </span>\n'
    '                    </div>\n'
    "                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>\n"
    "                      <label style={{ fontSize:11, fontWeight:600, color:'var(--text2)',\n"
    "                        whiteSpace:'nowrap' }}>Override (optional):</label>\n"
    '                      <select value={semanticType} style={{ ...inputBase, width:\'auto\',\n'
    "                        fontSize:11, cursor:'pointer' }}\n"
    '                        onChange={e => setSemanticType(e.target.value)}>\n'
    "                        <option value=\"\">-- use physical type --</option>\n"
    '                        {SEMANTIC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}\n'
    '                      </select>\n'
    '                    </div>\n'
    '                  </div>\n'
    '                </div>\n'
    '              </div>'
)

content = content[:c2_start] + new2 + content[c2_end:]
changes += 1
print('Change 2 OK — Step 1 wrapped with Last Profiled box')

# ─── Validate no non-ASCII ────────────────────────────────────────────────────
bad = [(i, ch) for i, ch in enumerate(content) if ord(ch) > 127]
if bad:
    print(f'ERROR: non-ASCII at {bad[:3]}')
    sys.exit(1)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'\nDone. {changes} changes applied.')
