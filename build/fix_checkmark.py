filepath = (
    r'C:\Users\2264421\OneDrive - Cognizant\Documents\Data Management'
    r'\Data Quality\Tooling\MOJ POC\dq-accelerator\src\201_ddl_form_panel.js'
)
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('isProf &&')
assert idx != -1, 'isProf not found'

# Slice out exactly the bad token: {isProf && {'✓'}}  (idx-1 to idx+22)
old = content[idx-1:idx+22]
print('old:', repr(old))

# Build new: {isProf && '✓'}  where ✓ is ASCII backslash-u-2-7-1-3
new = '{isProf && ' + "'" + chr(92) + 'u2713' + "'}"
print('new:', repr(new))

content = content[:idx-1] + new + content[idx+22:]

bad = [(i, ch) for i, ch in enumerate(content) if ord(ch) > 127]
assert not bad, 'Non-ASCII: ' + str(bad[:3])

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done.')
