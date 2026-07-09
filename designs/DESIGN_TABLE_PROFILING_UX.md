# DESIGN — Table Profiling Panel UX Improvements

**Feature:** Improve the Table Profiling panel so users understand the required steps without guessing, specifically that step one requires running a command in Athena and pasting the result.

---

## Problem

The Table Profiling panel (`201_ddl_form_panel.js`) has three invisible expectations:

1. **No instruction on where the DDL comes from.** The label says "CREATE TABLE statement" with a blank textarea. There is nothing telling the user they need to run a command in their query tool first.

2. **The SQL command is not provided.** Every other SQL flow in the app pre-generates a query for the user to copy. The user has to independently know to run `SHOW CREATE TABLE database.table;` in Athena.

3. **Parse-before-Save sequencing is hidden.** The Parse button and Save button sit at the same visual level. A first-time user hitting Save without parsing receives a confusing validation error.

---

## Proposed Changes

### A — "Copy Athena command" button

Once `dbName` and `tableName` are both non-empty, display a copyable command block immediately above the DDL textarea:

```sql
SHOW CREATE TABLE {dbName}.{tableName};
```

- Styled consistently with the COPY SQL buttons in the Field Profiling panel
- Activates as soon as both fields are populated; shows a placeholder prompt when they are not
- Copies the command string to clipboard; shows a brief "Copied" confirmation

### B — Contextual instruction line

Replace the plain "CREATE TABLE statement *" label with a small instruction context:

- When db + table are known: **"Run the command above in Athena, then paste the output here."**
- When db + table are not yet filled: **"Select or enter a database and table above to generate the Athena command."**

Single line, subdued text style (`var(--text3)`, 11px). No modal, no tooltip.

### C — Step labels

Wrap the panel body into two visually distinct sections matching the Field Profiling panel's step card style:

| Step | Contents |
|------|----------|
| **Step 1 — Get the DDL** | Table selector dropdown, Database + Table inputs, copy command block, instruction line, DDL textarea, Parse button |
| **Step 2 — Verify columns** | Parsed column table — only rendered once columns have been parsed (i.e. `parsed.length > 0` or `parseMsg` is set) |

The "Last Profiled" box remains at the top outside both steps, unchanged.

---

## What is NOT changing

- `parseDDL`, `handleParse`, `handleSave` logic — untouched
- Validation rules — untouched
- The table selector dropdown and db/table pre-fill logic — untouched
- The parsed column table content — untouched
- No schema changes, no routing changes

---

## Scope

Single file: `src/201_ddl_form_panel.js`
