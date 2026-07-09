# TASK_G_ASSISTANT.md

Detailed coding task list for Phase 1.6 -- Business Rule Assistant.
Reference BACKLOG.md (phase summary) and PROMPT_SPEC_ASSISTANT.md (prompt engineering spec).
Update status column as work progresses.

Status: `todo` | `in progress` | `done`

---

## Overview

New screen: `src/250_screen_assistant.js`
New sidebar entry: in `src/80_sidebar.js`
New route: in `src/240_app.js`
New localStorage key: `moj_dq_assistant_v1`
No new dependencies -- uses existing CDN libs (React, JSZip already loaded).

---

## G1 -- Rule intent + CDE scope panel

### G1.1 -- New screen file and component skeleton
Status: todo
File: `src/250_screen_assistant.js`

- Create `AssistantScreen` function component
- Destructure from `useApp()`: `data`, `canEdit`, `upsertRecord`, `nextPk`, `navigate`
- State variables:
  - `stage` -- integer 1-4, controls which stage panel is active
  - `conversationMode` -- string, 'business' (default) or 'technical'
  - `ruleIntent` -- string, the steward's plain-language rule description
  - `selectedCdeIds` -- array of integers
  - `extraTableIds` -- array of source_table_ddl IDs for supplementary context
  - `builtPrompt` -- string, the assembled prompt text (null until built)
  - `pasteText` -- string, the raw pasted text from the steward
  - `parsedProposals` -- array of proposal objects (null until parsed)
  - `proposals` -- array of proposal objects with added UI state (committed, errors)
  - `copyConfirmed` -- boolean, briefly true after clipboard copy
- On mount: call `loadAssistantState()` and hydrate state
- On state change: call `saveAssistantState()` (debounced 800ms for text fields)
- Render: stage progress indicator + stage panels (see G1.4)
- Gate: if `!canEdit`, show read-only notice instead of form (same pattern as other screens)

### G1.2 -- localStorage persistence functions
Status: todo
File: `src/250_screen_assistant.js`

Function `loadAssistantState()`:
- Read `moj_dq_assistant_v1` from localStorage
- Return parsed object or null on failure
- Returns: `{ rule_intent, cde_ids, extra_table_ids, conversation_mode, proposals, saved_at }`

Function `saveAssistantState(state)`:
- Write state object to `moj_dq_assistant_v1`
- state shape: `{ rule_intent, cde_ids, extra_table_ids, conversation_mode, proposals, saved_at: new Date().toISOString() }`
- conversation_mode: 'business' or 'technical' (default 'business' if missing on load)
- proposals: array of `{ ...proposal_fields, committed: bool, parsed_at: string }`

Function `clearAssistantState()`:
- Remove `moj_dq_assistant_v1` from localStorage
- Called by "Start new" button

### G1.3 -- CDE suggestion matching
Status: todo
File: `src/250_screen_assistant.js`

Function `suggestCdes(ruleIntentText, data)`:
- Input: free text string, full data object
- Search fields per CDE: source_field_name, source_table_name, source_system_name, source_database_name,
  data_element_definition, data_element_explanation
- Tokenise ruleIntentText to lowercase words (split on non-alpha, filter words < 3 chars)
- Score each CDE: count how many tokens appear in any of its searchable fields (case-insensitive)
- Return CDEs sorted by score descending, score > 0 only, max 8 results
- Called on ruleIntent change with 300ms debounce

### G1.4 -- Stage 1 panel UI
Status: todo
File: `src/250_screen_assistant.js`

Component `Stage1Panel({ conversationMode, onModeChange, ruleIntent, onRuleIntentChange,
  selectedCdeIds, onCdeToggle, extraTableIds, onExtraTableToggle, suggestions, data, onBuild })`:

Mode toggle (rendered at the top of Stage 1, above the rule textarea):
- Segmented control with two options: "Business" | "Technical"
- Default: "Business" (pre-selected on first load and after state clear)
- Business option label: "Business" with sub-text: "The AI guides you in plain language.
  No technical knowledge needed."
- Technical option label: "Technical" with sub-text: "The AI discusses SQL and implementation
  detail. For technically proficient stewards."
- Changing mode does NOT clear ruleIntent or CDE selection
- Changing mode after a prompt has been built: show inline note "Mode changed -- rebuild
  the prompt to apply this change" (does not auto-rebuild)
- Store selected mode in conversationMode state and persist to localStorage (G1.2)

- Textarea: "Describe the rule" (6 rows min, resizable)
  - placeholder: "e.g. Every offender record must have a valid date of birth and it must not be in the future"
  - onChange triggers debounced suggestion matching
- CDE suggestions strip (shows up to 5 suggested CDEs as clickable chips below textarea)
  - Each chip: "[field_name] . [table_name]" -- click to add to selectedCdeIds
  - Selected CDEs shown as removable tags
- CDE search: text input + scrollable list, all CDEs, selected ones highlighted
  - Shows: CDE field name, table name, system name
  - Searchable by any of those fields
- "Optional -- leave blank to let the AI suggest the relevant CDEs" hint text
- Supplementary tables section (collapsible, default collapsed):
  - "Add more context -- DDL and profiling for tables not covered by selected CDEs"
  - List of source_table_ddl entries not already covered by selected CDE tables
  - Checkboxes; selected ones shown as tags
- "Build prompt" button (primary):
  - Disabled if ruleIntent is empty or < 10 characters
  - On click: calls context builder (G2) with conversationMode, sets builtPrompt, advances to stage 2
- "Start new" link (small, bottom): clears all state after confirmation prompt

### G1.5 -- Stage progress indicator
Status: todo
File: `src/250_screen_assistant.js`

Component `StageIndicator({ stage })`:
- Horizontal row of 4 stages: [1 Define] [2 Prompt] [3 Paste] [4 Commit]
- Active stage: full colour (var(--accent))
- Completed stage: green with checkmark icon
- Future stage: muted (var(--text3))
- Separator lines between stages
- Clicking a completed stage navigates back to it (sets stage state)

---

## G2 -- Context builder

### G2.1 -- Main context builder function
Status: todo
File: `src/250_screen_assistant.js`

Function `buildAssistantPrompt(ruleIntent, selectedCdeIds, extraTableIds, conversationMode, data)`:
- conversationMode: 'business' or 'technical' -- passed through to all section builders
- Returns string: the full assembled prompt
- Assembles sections in order per PROMPT_SPEC_ASSISTANT.md
- Calls sub-functions for each section (G2.2 through G2.8)
- Applies truncation logic after full assembly (G2.9)
- Returns { promptText, characterCount, contextSummary }
  - contextSummary: { cdeCount, tableCount, dimensionCount, profilingAvailable, truncated, conversationMode }

### G2.2 -- Header section builder
Status: todo

Function `buildHeaderSection(conversationMode)`:
- Returns the PROMPT_VERSION and CONVERSATION_MODE lines plus separator
- Version string: "BRA-2"
- CONVERSATION_MODE line: "CONVERSATION_MODE: BUSINESS" or "CONVERSATION_MODE: TECHNICAL"
- These are the first two lines of the prompt (per spec assembly rule 3)

### G2.3 -- Role section builder
Status: todo

Function `buildRoleSection()`:
- Returns the static YOUR ROLE text per spec
- Identical for both modes -- no dynamic content

### G2.3a -- Conversation mode section builder
Status: todo

Function `buildConversationModeSection(conversationMode)`:
- Inserted immediately after YOUR ROLE (per spec assembly rule 5)
- BUSINESS mode: outputs the CONVERSATION MODE: BUSINESS block (plain language constraints,
  never show SQL during conversation, discuss threshold in business terms)
- TECHNICAL mode: outputs the CONVERSATION MODE: TECHNICAL block (SQL discussion allowed,
  invite technical feedback, confirm SQL before final proposal)
- See PROMPT_SPEC_ASSISTANT.md for exact wording of each block

### G2.4 -- Rule intent section builder
Status: todo

Function `buildRuleIntentSection(ruleIntent, selectedCdeIds, data)`:
- Includes the steward's rule description in quotes
- If selectedCdeIds non-empty: lists CDE display names
- If empty: includes the "help identify" instruction

### G2.5 -- CDE context section builder
Status: todo

Function `buildCdeSection(selectedCdeIds, data)`:
- If CDEs selected: full block per CDE (all fields from schema)
- If no CDEs: compact table (id | field_name | table_name | system_name), all CDEs, max 50 rows
- Null/undefined field values shown as "not specified"

### G2.6 -- Table schema section builder
Status: todo

Function `buildSchemaSection(selectedCdeIds, extraTableIds, conversationMode, data)`:
- Identify "primary tables": source_table_ddl entries whose table_name matches any selected CDE's source_table_name
- Identify "supplementary tables": extraTableIds entries not already primary
- Primary tables: full DDL (column_name, data_type, nullable, description per column)
- Supplementary tables: column names only joined by comma
- BUSINESS mode: section labels use plain language per spec
  (e.g. "(contains the field in scope)" not "(primary -- referenced by selected CDE)")
- TECHNICAL mode: technical labels acceptable
- If source_table_ddl is empty: note that no DDL is registered; suggest adding via DDL screen

### G2.7 -- Field profiling section builder
Status: todo

Function `buildProfilingSection(selectedCdeIds, conversationMode, data, compressed)`:
- Get field_profiling records for primary table columns
- BUSINESS mode full format:
  "[col]: [x]% of records have a value, [n] distinct values seen, range: [min] to [max], examples: [v1], [v2], [v3]"
- TECHNICAL mode full format:
  "[col]: null_rate=[x]%, distinct=[n], min=[v], max=[v], sample_values=[v1,v2,v3]"
- Compressed format (compressed=true, both modes): null_rate and distinct count only
- If no profiling: note absence per table; suggest using DDL screen
- compressed flag set by truncation logic in G2.9

### G2.8 -- Dimensions, existing rules, conversation instructions section builders
Status: todo

Function `buildDimensionsSection(conversationMode, data)`:
- All quality_dimension records: id | name: description
- Always included in full (never truncated -- required for AI to classify rule)
- BUSINESS mode: section header "CONTEXT: TYPES OF DATA QUALITY CHECK" with an intro sentence
  explaining the list is used to categorise the rule
- TECHNICAL mode: section header "CONTEXT: QUALITY DIMENSIONS" with no intro sentence

Function `buildExistingRulesSection(selectedCdeIds, conversationMode, data)`:
- Find data_quality_rule_allocation records where critical_data_element_id in selectedCdeIds
- For each: join to data_quality_rule and quality_dimension
- BUSINESS mode: section header "CONTEXT: EXISTING CHECKS ON THESE FIELDS"
  - Output: rule_name + dimension_name + rule_explanation (no SQL)
  - Intro: "The following checks are already in place. Do not reproduce these."
- TECHNICAL mode: section header "CONTEXT: EXISTING RULES ON THESE CDEs"
  - Output: rule_name, dimension_name, sql_code (first 200 chars if long)
- If none: mode-appropriate "no rules" message (see PROMPT_SPEC_ASSISTANT.md)

Function `buildConversationInstructionsSection(conversationMode)`:
- BUSINESS mode: 6-step process (understand intent, identify dimension, confirm rule in plain
  language, provide concrete examples, agree pass threshold, produce proposal)
  Uses plain-language framing throughout; references rule_narrative and rule_examples in step 3/4
- TECHNICAL mode: shorter 6-point process (read context, clarify, identify dimension, draft SQL,
  confirm SQL, produce proposal)
- See PROMPT_SPEC_ASSISTANT.md for exact wording of each step

Function `buildOutputFormatSection(conversationMode)`:
- BUSINESS mode: output format block including rule_narrative (plain language statement of rule)
  and rule_examples array as required fields
- TECHNICAL mode: same fields included; both rule_narrative and rule_examples required in both modes
- Outputs verbatim the ===RULE_PROPOSAL_START=== block with all field names and their instructions
- Must be the final section (per spec assembly rule 4)

### G2.9 -- Truncation logic
Status: todo

Applied after full assembly. Character thresholds:
- Under 6,000: no truncation
- 6,000 - 8,000: rebuild with compressed profiling (G2.7 compressed=true)
- 8,000 - 10,000: rebuild with profiling omitted entirely; add note in profiling section
- Over 10,000: additionally truncate existing rules to names only (no SQL); warn steward in UI
  (show amber banner above copy button: "This prompt is very large (~N chars). Check your AI tool
  supports inputs of this size.")

---

## G3 -- Prompt renderer

### G3.1 -- Stage 2 panel UI
Status: todo
File: `src/250_screen_assistant.js`

Component `Stage2Panel({ builtPrompt, contextSummary, onCopy, copyConfirmed, onProceedToPaste })`:

- Context summary strip (above textarea):
  - Chips: "N CDEs", "N tables", "N quality dimensions", "~N characters"
  - If truncated: amber chip "Context compressed"
  - If very large: amber banner (see G2.9)
- Collapsible "What's in this prompt?" section:
  - Lists: CDE field names, table names, dimension names
  - Link: "Missing a table? Add more context" -- navigates back to Stage 1 extra tables picker
- Readonly textarea (tall, monospace font) displaying builtPrompt
- "Copy to clipboard" primary button:
  - Uses navigator.clipboard.writeText(builtPrompt)
  - Fallback: select all text in textarea + document.execCommand('copy')
  - On success: button text briefly changes to "Copied!" (1.5 seconds), copyConfirmed=true
  - copyConfirmed state used to show "proceed to paste" hint below button
- Hint after copy: "Paste this into your AI assistant. Come back here when it has produced a rule proposal."
- "Edit scope" button: navigates back to Stage 1 (does not clear built prompt)

### G3.2 -- Clipboard copy utility
Status: todo
File: `src/250_screen_assistant.js`

Function `copyToClipboard(text, onSuccess, onFail)`:
- Try navigator.clipboard.writeText(text)
- Catch: select a hidden textarea containing text, document.execCommand('copy')
- Call onSuccess or onFail accordingly

---

## G4 -- Paste zone + parser

### G4.1 -- Stage 3 panel UI
Status: todo
File: `src/250_screen_assistant.js`

Component `Stage3Panel({ pasteText, onPasteChange, onParse, parseError, onAddContext,
  data, selectedCdeIds, extraTableIds })`:

- Instruction text: "Paste your AI assistant's output below. You can paste the full conversation
  transcript -- we will extract the rule proposal automatically."
- Tall textarea (8 rows min): value=pasteText, onChange=onPasteChange
- "Parse result" button (primary): calls parser, sets parsedProposals or parseError
- Parse status display:
  - Success: green banner "N rule proposal(s) found -- scroll down to review"
  - Incomplete: amber banner listing gaps + "Generate refinement prompt" button
  - Not found: error message showing example of what delimiters should look like
  - Multiple found: info strip "N proposals found"
- "Add context + copy" section (collapsible, labelled "AI needs more information?"):
  - Table picker: checkboxes for source_table_ddl tables not already in context
  - "Copy supplementary prompt" button: builds supplementary prompt (G4.3) and copies
- "Re-generate main prompt" link: if scope has changed, regenerates and goes back to Stage 2

### G4.2 -- Proposal parser
Status: todo
File: `src/250_screen_assistant.js`

Function `parseProposals(text)`:
- Regex: find all occurrences of ===RULE_PROPOSAL_START=== ... ===RULE_PROPOSAL_END===
  (multiline, non-greedy match)
- For each match: attempt JSON.parse of the content between delimiters
- Per proposal: assign `parsed_at: new Date().toISOString()`, `committed: false`
- Fields to extract (all optional at parse time -- validator checks required ones):
  rule_name, rule_explanation, rule_narrative, rule_examples (array), sql_code, sql_code_sample,
  quality_dimension_id, cde_id, cde_suggestion, bumper_value, frequency, automated, steward_notes
- Returns: `{ proposals: [...], errors: [{ index, message }] }`
- If no delimiters found: returns `{ proposals: [], notFound: true }`
- If delimiters found but JSON invalid: returns `{ proposals: [], parseError: true, raw: matchedText }`

Version check:
- Scan pasted text for PROMPT_VERSION tag
- If found and version != "BRA-2": add `versionMismatch: true` to result with warning message
- If CONVERSATION_MODE tag found: record it on result as `detectedMode` for UI reference
- If not found: no warning (user may have pasted partial output)

### G4.3 -- Supplementary context prompt builder
Status: todo
File: `src/250_screen_assistant.js`

Function `buildSupplementaryPrompt(tableIds, data)`:
- Builds short prompt per PROMPT_SPEC_ASSISTANT.md "Supplementary context prompt" section
- Includes full DDL + profiling for selected tableIds
- Returns prompt string
- Copies to clipboard via copyToClipboard()

### G4.4 -- Refinement prompt builder
Status: todo
File: `src/250_screen_assistant.js`

Function `buildRefinementPrompt(proposal, gaps, data)`:
- Builds refinement prompt per PROMPT_SPEC_ASSISTANT.md "Refinement prompt" section
- gaps: array of strings describing what is missing or invalid
- Includes the original (incomplete) proposal JSON
- Returns prompt string

---

## G5 -- Proposal validator

### G5.1 -- Validation function
Status: todo
File: `src/250_screen_assistant.js`

Function `validateProposal(proposal, data)`:

Required field checks (gaps if missing or empty):
- rule_name: non-empty string
- rule_narrative: non-empty string (plain language statement of the rule; written to
  rule_explanation on commit -- if missing the steward cannot meaningfully review the rule)
- rule_examples: non-empty array with at least one string entry (display only -- not
  persisted to the data store; listed as a gap so the steward can request a refinement
  if the AI omitted them, but does NOT block commit if the steward chooses to proceed)
- sql_code: non-empty string, must contain SELECT (case-insensitive)
- quality_dimension_id: integer present in data.quality_dimension records
- bumper_value: number between 0 and 1 (inclusive)
- frequency: one of "daily", "weekly", "monthly"
- cde_id OR cde_suggestion: at least one must be present

Blocking vs non-blocking gaps:
- Blocking (prevent commit): rule_name, rule_narrative, sql_code, quality_dimension_id,
  bumper_value, frequency, cde_id/cde_suggestion
- Non-blocking (show amber warning, do not prevent commit): rule_examples missing,
  stale IDs (flagged separately)

Stale ID checks:
- quality_dimension_id: verify exists in data.quality_dimension; flag if not found
- cde_id: verify exists in data.critical_data_element and is not retired; flag if not found

Returns:
```js
{
  valid: bool,
  gaps: ['rule_name is missing', 'sql_code does not contain SELECT', ...],
  staleIds: ['quality_dimension_id 99 not found in current store', ...]
}
```

### G5.2 -- Batch validation on parse
Status: todo

After parsing proposals (G4.2), validate each immediately:
- proposals with valid=true: pass to Stage 4 review cards directly
- proposals with gaps: show inline gap list on the parse result and "Generate refinement prompt" button
- proposals with staleIds: show in review card with amber warning (not a blocker)

---

## G6 -- Review card

### G6.1 -- Stage 4 panel UI
Status: todo
File: `src/250_screen_assistant.js`

Component `Stage4Panel({ proposals, onCommit, onRefine, onUpdateProposal, data })`:
- Section header: "Review and commit [N] rule proposal(s)"
- One ProposalReviewCard per proposal
- If all committed: success summary card with "Start new conversation" button

### G6.2 -- ProposalReviewCard component
Status: todo
File: `src/250_screen_assistant.js`

Component `ProposalReviewCard({ proposal, index, onCommit, onRefine, onUpdate, data })`:

Layout: two sections separated by a divider -- "Business review" and "Technical details"

**Business review section (always visible, shown first):**
- rule_name: text input (required, editable)
- rule_narrative: textarea labelled "Rule description" (required, editable)
  - This is the primary review surface for business stewards
  - Label: "What this rule checks" or "Rule description (plain language)"
- rule_examples: each example shown as a bullet point (readonly display, not editable, not persisted)
  - Label: "Examples of failing records"
  - These are ephemeral -- shown here to help the steward confirm the rule is correct,
    but not written to the data store on commit
  - If empty or missing: amber note "The AI did not provide examples -- consider refining"
- rule_explanation: textarea labelled "Explanation" (optional, editable)
- quality_dimension_id: select element populated from data.quality_dimension (labelled "Type of check")
  - If stale ID: amber warning + forces re-selection
- cde_id: select element populated from data.critical_data_element (non-retired only)
  - Label: "Data field"
  - If cde_id null/stale and cde_suggestion present: show cde_suggestion text + CDE selector
  - Amber warning if stale
- bumper_value: number input, step=0.01, min=0, max=1 (labelled "Pass target")
  - Helper text: "Proportion of records that must pass, e.g. 0.99 = 99 in every 100"
- frequency: select -- "daily", "weekly", "monthly"
- automated: checkbox (default true)
- steward_notes: readonly display (from AI, shown as a grey info box if non-empty)

**Technical details section (collapsible, collapsed by default):**
- Toggle link: "Show technical details" / "Hide technical details"
- sql_code: textarea with `fontFamily: var(--mono)` (required, editable, must contain SELECT)
  - Label: "SQL rule"
- sql_code_sample: textarea, monospace (optional, editable)
  - Label: "Simplified SQL (reference)"

Card state:
- Normal: all fields editable per above
- Committed: all fields readonly, success badge, links to created records
- Error: red border, error message below relevant field

Buttons:
- "Create rule" (primary): disabled if rule_name empty, rule_narrative empty, sql_code empty,
  or no cde_id selected. On click: calls onCommit(index, proposal)
- "Refine further" (ghost): generates refinement prompt for this proposal specifically,
  copies to clipboard, shows "Paste the updated output in Step 3" instruction
- "Discard" (ghost, danger colour): removes this proposal from the list after confirmation

---

## G7 -- Record creation

### G7.1 -- Commit handler
Status: todo
File: `src/250_screen_assistant.js`

Function `handleCommitProposal(proposalIndex, proposal, data, upsertRecord, nextPk)`:

Step 1: create data_quality_rule record
```js
const ruleId = nextPk('data_quality_rule');
upsertRecord('data_quality_rule', {
  data_quality_rule_id: ruleId,
  rule_name: proposal.rule_name,
  rule_explanation: proposal.rule_narrative || proposal.rule_explanation || '',
  sql_code: proposal.sql_code,
  sql_code_sample: proposal.sql_code_sample || '',
  source_code_link: '',
  automated: proposal.automated ?? true,
  retiring_timestamp: null,
});
```
Note: rule_narrative (the steward-confirmed plain-language statement) is written to the
existing rule_explanation column -- prefer rule_narrative if present, fall back to
rule_explanation. No schema change is needed. rule_examples is not persisted; it is
a review artefact used only in Stage 4 and retained in moj_dq_assistant_v1 as part
of the committed proposal record.

Step 2: create data_quality_rule_allocation record
```js
const allocId = nextPk('data_quality_rule_allocation');
upsertRecord('data_quality_rule_allocation', {
  data_quality_rule_allocation_id: allocId,
  data_quality_rule_id: ruleId,
  critical_data_element_id: proposal.cde_id,
  quality_dimension_id: proposal.quality_dimension_id,
  bumper_value: proposal.bumper_value,
  frequency: proposal.frequency,
  retiring_timestamp: null,
});
```

Step 3: mark proposal as committed in state and localStorage

Step 4: update card to success state, show:
- "Rule created: [rule_name]"
- "Navigate to rule" link -- calls navigate({ screen: 'rulenav' })
- "Navigate to allocation" link -- calls navigate({ screen: 'table', table: 'data_quality_rule_allocation' })

Error handling: if upsertRecord throws, show error message in card, do not mark committed.

---

## G8 -- Persistence and sidebar badge

### G8.1 -- Sidebar badge
Status: todo
File: `src/80_sidebar.js`

- `Sidebar` currently receives `data` prop but not assistant state
- Add logic to read `moj_dq_assistant_v1` from localStorage on mount and on storage events
- Count proposals where `committed === false`
- If count > 0: show a small badge on the assistant nav item (same style as nav-table-badge)
- Badge should update when localStorage changes (use storage event listener)

### G8.2 -- Auto-save on state change
Status: todo
File: `src/250_screen_assistant.js`

- useEffect watching [ruleIntent, selectedCdeIds, extraTableIds, conversationMode]:
  - Debounced 800ms
  - Calls saveAssistantState() including current conversationMode
- useEffect watching [proposals]:
  - Immediate (proposals change when committed; don't delay)
  - Calls saveAssistantState()

### G8.3 -- Load and stale ID validation on mount
Status: todo
File: `src/250_screen_assistant.js`

On mount, after loading state:
- For each loaded proposal: run validateProposal() against current data
- If stale IDs found: mark proposal.hasStaleIds = true; show amber warning in review card
- Do not auto-discard stale proposals -- steward may still be able to fix manually
- If loaded proposals exist: start at Stage 4 (review) not Stage 1

---

## Wiring -- new screen into the app

### W1 -- Route registration
Status: todo
File: `src/240_app.js`

- Add case to renderScreen switch:
  `case 'assistant': return <AssistantScreen/>;`
- No additional props needed (uses useApp() internally)

### W2 -- Sidebar nav item
Status: todo
File: `src/80_sidebar.js`

- Add nav item between "Data Rule Generator" and "RAG Simulator" (or at top of DQ group -- decide on review)
- Label: "Rule Assistant"
- Icon: Icon.Chat (if exists) or Icon.Code as fallback -- check 60_icons.js
- Collapsed state: icon only with tooltip "Rule Assistant"
- Badge: count of uncommitted proposals (see G8.1)

### W3 -- Icon check / addition
Status: todo
File: `src/60_icons.js`

- Check if a suitable icon exists (chat bubble, assistant, sparkle)
- If not: add Icon.Assistant or reuse Icon.Code

### W4 -- Build and smoke test
Status: todo

- Run `python build.py` from build/
- Open dist/app.html in browser
- Verify: new nav item appears, assistant screen loads, no console errors
- Verify: canEdit gate works (read-only banner shown when not registered)
- Verify: stage progression works end to end with a sample rule

---

## Implementation order

Build in this sequence to allow incremental testing:

1. W3 (icon check)
2. W1 + W2 (route + nav item -- blank screen first)
3. G1.1 + G1.2 (screen skeleton + persistence)
4. G1.3 + G1.4 (CDE suggestion + Stage 1 UI)
5. G1.5 (stage indicator)
6. G2.1 - G2.9 (context builder including G2.3a mode section -- test output by console.log before wiring to UI)
7. G3.1 + G3.2 (prompt renderer + clipboard)
8. G4.2 (parser -- unit test with sample proposal text before UI)
9. G4.1 (Stage 3 UI)
10. G4.3 + G4.4 (supplementary + refinement prompt builders)
11. G5.1 + G5.2 (validator)
12. G6.1 + G6.2 (review cards)
13. G7.1 (record creation)
14. G8.1 - G8.3 (persistence + badge)
15. W4 (build + smoke test)

---

## Design constraints (apply throughout)

- No API calls, no external fetch, no keys
- All JS string literals ASCII only -- no smart quotes, em dashes, curly apostrophes
- All new functions and components in `src/250_screen_assistant.js` (except sidebar and route wiring)
- No import/export statements -- all names are globals within the Babel block
- Follow existing canEdit + dp pattern for read-only gating
- Records created via upsertRecord + nextPk -- PK namespace rules apply automatically
- localStorage key: `moj_dq_assistant_v1` (do not reuse or alias existing keys)
