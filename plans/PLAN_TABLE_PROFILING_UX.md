# PLAN — Table Profiling Panel UX Improvements

Paired with: `DESIGN_TABLE_PROFILING_UX.md`

---

## Step 1 — Add copy-command state to `DDLFormPanel`

Add a `copiedCmd` boolean state for the copy button feedback, alongside the existing state vars:

```js
const [copiedCmd, setCopiedCmd] = useState(false);
```

Add a derived value for the Athena command (empty string when db/table not yet set):

```js
const athenaCmd = dbName.trim() && tableName.trim()
  ? `SHOW CREATE TABLE ${dbName.trim()}.${tableName.trim()};`
  : '';
```

Add a copy handler:

```js
const handleCopyCmd = () => {
  if (!athenaCmd) return;
  navigator.clipboard.writeText(athenaCmd).then(() => {
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1800);
  }).catch(() => {});
};
```

---

## Step 2 — Restructure the panel body

Replace the current flat layout (selector → db/table → DDL area → parse result) with two step cards plus the existing "Last Profiled" box at the top.

### Step 1 card — "Get the DDL"

Wraps: table selector, db+table inputs, copy command block, instruction line, DDL textarea + Parse button.

**Copy command block** (rendered between the db/table inputs and the DDL textarea):

```jsx
<div style={{ background:'var(--bg)', border:'1px solid var(--border)',
  borderRadius:'var(--radius)', padding:'10px 12px' }}>
  {athenaCmd ? (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <code style={{ flex:1, fontFamily:'var(--mono)', fontSize:11,
        color:'var(--text)', overflowWrap:'anywhere' }}>
        {athenaCmd}
      </code>
      <button onClick={handleCopyCmd} style={{ ... }}>
        {copiedCmd ? <Icon.Check/> : <Icon.Copy/>}
        {copiedCmd ? 'Copied' : 'Copy'}
      </button>
    </div>
  ) : (
    <span style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>
      Select or enter a database and table above to generate the Athena command.
    </span>
  )}
</div>
```

**Instruction line** (rendered between the copy block and the DDL textarea label):

```jsx
{athenaCmd && (
  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>
    Run the command above in Athena, then paste the output here.
  </div>
)}
```

### Step 2 card — "Verify columns"

Wraps the existing parse result block (`parseMsg` + parsed column table).

Rendered only when `parseMsg || parsed.length > 0` — same condition as today, just moved inside a step card container.

---

## Step 3 — Build and verify

```bash
cd build && python build.py
```

### Manual checks

- Open Table Profiling panel on a new table — Step 1 card visible, Step 2 card absent
- Before selecting a table: copy block shows "Select or enter..." placeholder
- After selecting a table from dropdown: copy block shows the `SHOW CREATE TABLE` command
- Click Copy — clipboard contains `SHOW CREATE TABLE db.table;`, button shows "Copied" briefly
- Paste DDL, click Parse — Step 2 card appears with column table
- Save — works as before

---

## Files Changed

| File | Change |
|------|--------|
| `src/201_ddl_form_panel.js` | Add copy-command state + handler; restructure body into two step cards |

## Estimated effort

~30 minutes coding + build + manual test
