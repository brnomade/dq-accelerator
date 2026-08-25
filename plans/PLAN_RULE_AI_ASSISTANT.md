# Implementation Plan: AI Assistant for Rule Form Panel

Pairs with: `designs/DESIGN_RULE_AI_ASSISTANT.md`

---

## Step 1 — Create feature branch

```bash
git checkout -b feature/rule-ai-assistant
```

---

## Step 2 — Create `src/46_prompt_helpers.js`

New file between `45_rule_sql_warnings.js` (load order safe — no dependencies on higher-numbered files).

Define two functions (globals, no export):

### `buildSqlStandardsPrompt()`
Returns a multi-line string covering:
- CRITICAL snapshot filter rule (AND append to `sql_code`, WHERE append to `sql_code_sample`)
- No semicolons rule
- SQL CODING STANDARDS: TRY_CAST over CAST, NULLIF/TRIM over bare IS NULL

Extracted verbatim from `180_screen_generator.js` lines 91–113 minus the snapshot-specific note (line 105), which is conditional on a runtime value and stays in the generator.

### `buildNamingConventionsPrompt(opts)`
`opts = { cdsName, fieldName }` — both optional.

Returns a multi-line string covering:
- Assertive naming rule (GOOD/BAD examples)
- No field-specific names unless unavoidable
- Prefix rules: always emits `Generic -`; emits `[cdsName] -` only if `opts.cdsName` is set; emits `CDE [fieldName] -` with the actual name if `opts.fieldName` is set, otherwise a generic `CDE [field_name] -` placeholder.

---

## Step 3 — Refactor `src/180_screen_generator.js`

Replace the duplicated text blocks inside `buildSuggestionPrompt` (lines 91–130):

| Before | After |
|--------|-------|
| Lines 91–113 (SQL standards pushes) | `lines.push(buildSqlStandardsPrompt());` |
| Line 105 (snap note — conditional, stays) | `if (snap) lines.push('Note: ...' + snap + '...');` |
| Lines 116–130 (naming convention pushes) | `lines.push(buildNamingConventionsPrompt({ cdsName, fieldName: field }));` |

Line 115 (`'Respond ONLY with a valid JSON array...'`) is generator-specific and is NOT moved to the helper.

No behaviour change — prompt output must be identical to the current output (verify by diffing output strings mentally against the existing lines).

---

## Step 4 — Update `src/166_form_panel_rule.js`

### 4a. Add `buildRuleAssistantPrompt(values, warnings)` above the component (line 5)

Function is a plain JS function (no React). Takes:
- `values` — current form state (has `rule_name`, `rule_explanation`, `sql_code`, `sql_code_sample`)
- `warnings` — the `ruleSqlWarnings` array (`[{ level, msg }]`)

Prompt structure:
```
You are a data quality expert reviewing a Data Quality rule.

RULE DETAILS:
  Name:        {values.rule_name}
  Explanation: {values.rule_explanation}   <- omit section if blank
  
SQL CODE:
{values.sql_code}                          <- omit section if blank

SQL SAMPLE:
{values.sql_code_sample}                   <- omit section if blank

{buildSqlStandardsPrompt()}

{buildNamingConventionsPrompt()}            <- no opts (no CDE/CDS context)
Note: without a specific CDE or CDS in context, use "Generic -" for rules
applicable to any field, or "CDE [field_name] -" for field-specific rules.

CURRENT VALIDATION WARNINGS:              <- section only if warnings.length > 0
  [CRITICAL] {msg}
  [SEVERE]   {msg}
  ...

TASK:                                     <- warnings-present variant
Ask clarifying questions about the intent of this rule and the data it checks.
Then provide corrected versions of sql_code and/or sql_code_sample that resolve
all warnings listed above, ready to paste back into the form.
Also assess whether the rule name follows the naming convention above. If it
does not, state what is wrong and recommend a corrected name -- but do not
apply it. The user will update the Name field manually.

TASK:                                     <- no-warnings variant (mutually exclusive)
The SQL passes all validation checks. Confirm it is correct and follows all
standards above. Suggest any optimisations if relevant.
Also assess whether the rule name follows the naming convention above. If it
does not, state what is wrong and recommend a corrected name -- but do not
apply it. The user will update the Name field manually.
```

All string concatenation uses `+` and array `.join('\n')` — no template literals with backticks to stay safe with the Babel CDN parser.

### 4b. Add `aiBtnCopied` state inside `RuleFormPanel`

```javascript
const [aiBtnCopied, setAiBtnCopied] = useState(false);
```

Add after line 10 (alongside existing `errors` state).

### 4c. Add AI Assistant button after `<RuleSqlWarningNotices>` (after line 107)

Render condition: `!!(values.sql_code || values.rule_name)` — only show when there is something to send.

```jsx
{!!(values.sql_code || values.rule_name) && (
  <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
    <button
      onClick={() => {
        navigator.clipboard.writeText(
          buildRuleAssistantPrompt(values, ruleSqlWarnings)
        ).then(() => {
          setAiBtnCopied(true);
          setTimeout(() => setAiBtnCopied(false), 1800);
        });
      }}
      style={{
        fontSize: 10, padding: '4px 12px', cursor: 'pointer',
        background: 'var(--bg3)', border: '1px solid var(--green)',
        borderRadius: 'var(--radius)', color: 'var(--green)',
        fontWeight: 600, fontFamily: 'var(--mono)',
      }}>
      {aiBtnCopied ? 'Copied!' : 'AI Assistant'}
    </button>
  </div>
)}
```

---

## Step 5 — Pre-build steps (in order)

1. Run `python -c "import datetime; print(datetime.datetime.now().strftime('build-%Y%m%d-%H%M'))"` to generate build ID.
2. Add CHANGELOG.md entry.
3. Add SESSION_METRICS.md entry.
4. Update user documentation: add "How to use the AI Assistant in the Rule form" section or guide page in `documentation/user-guide/`.
5. Run `python build.py`.

---

## Step 6 — Manual browser test checklist

- [ ] Open the ADD Rule panel with no SQL entered — AI Assistant button is hidden.
- [ ] Enter a valid rule name only — button appears.
- [ ] Enter SQL with warnings — button appears; click copies prompt; paste into a text editor and verify warnings are listed, SQL standards and naming convention sections are present, and TASK text is the warnings-present variant.
- [ ] Fix all SQL warnings — click button; verify prompt contains no warnings section and TASK is the no-warnings variant.
- [ ] Verify generator still works end-to-end (prompt copy + paste + parse) — confirms the refactor in Step 3 did not break its output.
- [ ] Verify "Copied!" feedback appears for ~1.8s then reverts to "AI Assistant".

---

## Files changed

| File | Type |
|------|------|
| `src/46_prompt_helpers.js` | New |
| `src/180_screen_generator.js` | Modified (refactor only, no behaviour change) |
| `src/166_form_panel_rule.js` | Modified (new function + state + button) |
| `documentation/user-guide/` | New/updated guide page |
| `CHANGELOG.md` | New entry |
| `SESSION_METRICS.md` | New entry |
| `APP_TREE.md` | Update (new source file `46_prompt_helpers.js`) |
