# Design: AI Assistant for Rule Form Panel

## Overview

Add a copy-to-clipboard AI prompt button to the ADD/EDIT Rule panel, and extract shared prompt text blocks into a reusable helper file used by both the rule panel and the existing rule generator.

---

## Context

The ADD/EDIT Rule panel (`166_form_panel_rule.js`) already validates SQL in real time using `45_rule_sql_warnings.js`, surfacing CRITICAL and SEVERE warnings. Currently the panel only tells the user to correct errors — it offers no guidance on how.

The Rule Generator (`180_screen_generator.js`) already has a proven copy-to-clipboard AI prompt pattern. This design extends the same UX to the rule form panel and deduplicates the shared SQL standards and naming convention text that both prompts need.

---

## Goals

1. Give users a one-click way to get AI help resolving SQL warnings (or reviewing clean SQL) directly from the rule form panel.
2. Include rule name assessment in the prompt so the AI can flag naming convention violations and recommend a corrected name.
3. Eliminate duplication of SQL coding standards and naming convention text between the generator and the new prompt.

---

## What is NOT in scope

- Prompt preview textarea in the panel (silent copy is sufficient; panel is already form-heavy).
- Open-in-Claude / Open-in-Copilot shortcut buttons (generator has these; rule panel does not need them).
- Any AI response parsing or structured JSON output (this is a conversational prompt, not a generator).
- Changes to the SQL warning display logic itself.

---

## Shared Prompt Helpers — `46_prompt_helpers.js`

A new file `src/46_prompt_helpers.js` will export two string constants:

### `DQ_SQL_STANDARDS_PROMPT`

The SQL coding standards block currently in `180_screen_generator.js` lines 92–113:
- DQ Engine snapshot filter rule (WHERE required, AND/WHERE append behaviour, no semicolons)
- TRY_CAST() over CAST()
- NULLIF/TRIM pattern for null/empty checks
- Required placeholders: `{SOURCE_DATABASE_NAME}`, `{SOURCE_TABLE_NAME}`, `{SOURCE_FIELD_NAME}`

### `DQ_NAMING_CONVENTIONS_PROMPT`

The rule naming conventions block currently in `180_screen_generator.js` lines 116–130:
- Names must be assertive (enforce, not check)
- No field-specific names unless the rule cannot be parameterised
- Three prefix patterns: `Generic -`, `[CDS_NAME] -`, `CDE [field_name] -`

`180_screen_generator.js` will be updated to reference these constants instead of duplicating the text. No behaviour change.

---

## AI Assistant Button — `166_form_panel_rule.js`

### Placement

Below the `<RuleSqlWarningNotices>` block, above the Automated toggle. Visible only when at least one of `sql_code` or `rule_name` is populated.

### UX

A small styled button labelled **"AI Assistant"**. On click:
- Builds the prompt (see below).
- Copies it to the clipboard via `navigator.clipboard.writeText()`.
- Label changes to **"Copied!"** for 1.8 seconds, then reverts.

Single new state variable: `const [aiBtnCopied, setAiBtnCopied] = useState(false)`.

### Prompt structure — `buildRuleAssistantPrompt(values, warnings)`

The function takes the current form values and the computed warnings array.

```
You are a data quality expert reviewing a Data Quality rule.

RULE DETAILS:
  Name:        {rule_name}
  Explanation: {rule_explanation}        (omitted if blank)
  Dimension:   {quality_dimension_id resolved label, or blank}

SQL CODE:
  {sql_code}

SQL SAMPLE:
  {sql_code_sample}                      (omitted if blank)

--- [DQ_SQL_STANDARDS_PROMPT] ---

--- [DQ_NAMING_CONVENTIONS_PROMPT] ---
Note: without a CDE or CDS in context, the applicable prefixes are
"Generic -" (universally reusable) or "CDE [field_name] -" (field-specific).

CURRENT VALIDATION WARNINGS:
  [CRITICAL] {message}
  [SEVERE]   {message}
  ...

TASK (when warnings exist):
Ask clarifying questions about the intent of each rule and the data being
checked. Then provide corrected SQL for both fields that resolves all warnings,
ready to paste back. Also assess whether the rule name follows the naming
convention above — if not, state the issue and recommend a corrected name,
but do not apply it (the user will update the name field manually).

TASK (when no warnings):
Confirm the SQL is correct and follows all standards above. Suggest any
optimisations if relevant. Also assess the rule name against the convention
and recommend a correction if needed.
```

The two TASK sections are mutually exclusive — the function emits only the one that applies based on whether `warnings.length > 0`.

---

## File Changes Summary

| File | Change |
|------|--------|
| `src/46_prompt_helpers.js` | New file — `DQ_SQL_STANDARDS_PROMPT` and `DQ_NAMING_CONVENTIONS_PROMPT` constants |
| `src/180_screen_generator.js` | Replace duplicated text blocks with references to the two constants |
| `src/166_form_panel_rule.js` | Add `buildRuleAssistantPrompt`, `aiBtnCopied` state, and "AI Assistant" button |

No other files are affected. No schema changes, no routing changes, no new screens.

---

## Open Questions

None — all design decisions were resolved during the design discussion.
