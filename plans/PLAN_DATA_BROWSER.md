# PLAN — Data Browser

**Design approved:** 2026-07-21
**Paired design:** `designs/DESIGN_DATA_BROWSER.md`

---

## Steps

1. **Create `src/215_screen_databrowser.js`** — `DataBrowserScreen` component
   - Left panel: alphabetical SCHEMA table list with active/retired counts
   - Right panel: toolbar (filter + show-retired toggle + row count) + sortable data grid
   - PK/FK column badges; retired row tint + Undo button; null cell display
   - Non-master guard

2. **Update `src/80_sidebar.js`** — add master-only "Data Browser" nav item after Import,
   before the separator line. Uses `Icon.Database`.

3. **Update `src/240_app.js`** — two edits:
   - Add `case 'databrowser': return <DataBrowserScreen/>;` in `renderScreen`
   - Add breadcrumb branch for `route.screen === 'databrowser'`

4. **Update `APP_TREE.md`** — add Data Browser row to sidebar navigation table

5. **Update `CHANGELOG.md` and `SESSION_METRICS.md`** — before build

6. **Run `python build.py`**

---

## Mandatory end-of-task steps

- Update CHANGELOG.md and SESSION_METRICS.md before build (pre-generate build ID first)
- Run `python build.py`
- No user guide update required (master-only internal tool, no workflow visible to stewards)
- APP_TREE.md update required (new screen, new sidebar item)
