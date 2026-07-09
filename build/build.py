#!/usr/bin/env python3
"""
build.py  --  assembles dist/dq-accelerator.html from src/ modules
Usage:  python build.py
Output: dist/dq-accelerator.html
        dist/dq-accelerator-<build-number>.zip  (HTML + CHANGELOG.md + KNOWN_ISSUES.md)
"""

import glob, os, re, sys, hashlib, datetime, zipfile
from pathlib import Path

ROOT         = Path(__file__).parent.parent
SRC          = ROOT / 'src'
DIST         = ROOT / 'dist'
TEMPLATE     = ROOT / 'build' / 'template.html'
OUT          = DIST / 'dq-accelerator.html'
CHANGELOG    = ROOT / 'CHANGELOG.md'
KNOWN_ISSUES = ROOT / 'KNOWN_ISSUES.md'
USER_GUIDE   = ROOT / 'documentation' / 'user-guide'

DIST.mkdir(exist_ok=True)

# ── 1. Load template ──────────────────────────────────────────
template = TEMPLATE.read_text(encoding='utf-8')

# ── 2. Load CSS ───────────────────────────────────────────────
css_files = sorted(SRC.glob('*.css'))
if not css_files:
    sys.exit('ERROR: no .css files found in src/')
css = '\n'.join(f.read_text(encoding='utf-8') for f in css_files)
print(f"  CSS: {', '.join(f.name for f in css_files)}")

# ── 3. Load JS in numeric order ───────────────────────────────
def sort_key(p):
    m = re.match(r'^(\d+)', p.name)
    return int(m.group(1)) if m else 999999

js_files = sorted(SRC.glob('*.js'), key=sort_key)
if not js_files:
    sys.exit('ERROR: no .js files found in src/')

js_parts = []
for f in js_files:
    js_parts.append(f.read_text(encoding='utf-8'))
    print(f"  JS:  {f.name}  ({f.stat().st_size:,} bytes)")
js = '\n'.join(js_parts)

# ── 4a. Generate build number and inject into JS ─────────────
build_number = datetime.datetime.now().strftime('build-%Y%m%d-%H%M')
if '<!-- INJECT_BUILD -->' not in js:
    sys.exit('ERROR: <!-- INJECT_BUILD --> placeholder not found in JS modules')
js = js.replace('<!-- INJECT_BUILD -->', build_number)
print(f"  Build: {build_number}")

# ── 4b. Validate JS: no non-ASCII ────────────────────────────
bad = [(js[:i].count('\n')+1, ord(c), c)
       for i, c in enumerate(js) if ord(c) > 127]
if bad:
    print('\nERROR: non-ASCII characters in JS modules:')
    for line, cp, ch in bad[:10]:
        print(f'  line {line}: U+{cp:04X}  {ch!r}')
    sys.exit(1)

# ── 5. Assemble ───────────────────────────────────────────────
react_destructure = (
    'const { useState, useEffect, useCallback, useRef, '
    'useMemo, createContext, useContext } = React;'
)
css_block = f'<style>\n{css}\n</style>'
js_block  = f'<script type="text/babel">\n{react_destructure}\n\n{js}\n</script>'

if '<!-- INJECT_CSS -->' not in template:
    sys.exit('ERROR: <!-- INJECT_CSS --> not found in template.html')
if '<!-- INJECT_JS -->'  not in template:
    sys.exit('ERROR: <!-- INJECT_JS --> not found in template.html')

html = template.replace('<!-- INJECT_CSS -->', css_block)
html = html.replace('<!-- INJECT_JS -->',  js_block)

# ── 6. Validate output ────────────────────────────────────────
errors = []

# One babel block
babel_blocks = re.findall(r'<script[^>]+text/babel', html, re.IGNORECASE)
if len(babel_blocks) != 1:
    errors.append(f'Expected 1 babel block, found {len(babel_blocks)}')

# No </script> inside babel block
b_start = html.index('<script type="text/babel">') + len('<script type="text/babel">')
b_end   = html.index('</script>', b_start)
babel_inner = html[b_start:b_end]
if '</script>' in babel_inner.lower():
    errors.append('</script> found inside babel block')

# Each structural tag appears exactly once
for tag in ['<head>', '</head>', '<body>', '</body>']:
    n = html.lower().count(tag.lower())
    if n != 1:
        errors.append(f'{tag!r} appears {n} times (expected 1)')

if errors:
    print('\nERROR: output validation failed:')
    for e in errors:
        print(f'  - {e}')
    sys.exit(1)

# ── 7. Write output ───────────────────────────────────────────
OUT.write_text(html, encoding='utf-8')

lines       = html.count('\n')
size        = OUT.stat().st_size
md5         = hashlib.md5(html.encode()).hexdigest()
babel_lines = babel_inner.count('\n')

# ── 8. Zip the output (HTML + release docs + user guide) ──────
zip_name = f'dq-accelerator-{build_number}.zip'
zip_path = DIST / zip_name

guide_files = sorted(USER_GUIDE.rglob('*')) if USER_GUIDE.exists() else []
guide_files = [f for f in guide_files if f.is_file()]

with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    zf.write(OUT, arcname='dq-accelerator.html')
    if CHANGELOG.exists():
        zf.write(CHANGELOG, arcname='CHANGELOG.md')
    if KNOWN_ISSUES.exists():
        zf.write(KNOWN_ISSUES, arcname='KNOWN_ISSUES.md')
    for gf in guide_files:
        rel = gf.relative_to(USER_GUIDE).as_posix()
        zf.write(gf, arcname=f'user-guide/{rel}')

zip_size = zip_path.stat().st_size

bundled = ['dq-accelerator.html']
if CHANGELOG.exists():    bundled.append('CHANGELOG.md')
if KNOWN_ISSUES.exists(): bundled.append('KNOWN_ISSUES.md')
if guide_files:           bundled.append(f'user-guide/ ({len(guide_files)} files)')
else:                     print('  Note   : user-guide/ is empty -- skipped from zip')

print(f'\nBuild OK')
print(f'  Build  : {build_number}')
print(f'  Output : {OUT}')
print(f'  Size   : {size:,} bytes')
print(f'  Lines  : {lines:,}')
print(f'  Babel  : {babel_lines:,} lines')
print(f'  MD5    : {md5}')
print(f'  Zip    : {zip_path.name}  ({zip_size:,} bytes)  [{", ".join(bundled)}]')
