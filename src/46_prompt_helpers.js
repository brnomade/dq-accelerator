// ===============================================================================
// AI PROMPTS -- all prompt construction for the application
// Shared building blocks at the top; full prompt builders below.
// To tune any AI prompt, edit this file only.
// Callers: RuleFormPanel (166_form_panel_rule.js)
//          DataRuleGeneratorScreen (180_screen_generator.js)
// ===============================================================================


// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function buildAthenaDialectPrompt() {
  return [
    'SQL DIALECT CONSTRAINT:',
    'All SQL you write must be valid AWS Athena SQL (Presto/Trino engine) -- this is the only',
    'engine the DQ Accelerator executes against. Do not use syntax, functions, or conventions',
    'valid in other dialects (e.g. T-SQL, MySQL, PostgreSQL-only functions) if they are not also',
    'valid in Athena. If a standard\'s example syntax is ever ambiguous between dialects, prefer',
    'the Athena-valid form.'
  ].join('\n');
}

function buildEngineMechanicsPrompt() {
  return [
    'HOW THE DQ ENGINE EXECUTES THIS SQL (read before proposing any fix):',
    'The DQ engine appends a snapshot/timestamp filter to both fields at run time. Your corrected',
    'SQL must anticipate this -- do not add your own snapshot/timestamp condition.',
    '',
    'The engine concatenates as follows:',
    '  sql_code        --> your query + " AND <timestamp_filter>"',
    '  sql_code_sample --> your query + " WHERE <timestamp_filter>"',
    '',
    'This means:',
    '  - sql_code MUST contain a WHERE clause with only the business logic condition(s).',
    '    It must NOT include the snapshot filter. It must NOT end with a semicolon.',
    '    Correct: SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} WHERE {SOURCE_FIELD_NAME} IS NULL',
    '    Do NOT do this: ...WHERE {SOURCE_FIELD_NAME} IS NULL AND snapshot_date = CURRENT_DATE',
    '    (the engine appends its own AND <timestamp_filter>, producing a duplicated/conflicting condition)',
    '  - sql_code_sample MUST NOT contain any WHERE clause at all.',
    '    The engine will append WHERE <timestamp_filter> to it at test time.',
    '    It must NOT end with a semicolon.',
    '    Correct: SELECT * FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME}'
  ].join('\n');
}

function buildSqlStandardsPrompt() {
  return [
    'SQL CODING STANDARDS (apply to every query):',
    '1. NEVER use CAST(). Always use TRY_CAST() to avoid runtime data conversion errors.',
    '   Example: TRY_CAST({SOURCE_FIELD_NAME} AS DATE) IS NULL instead of CAST(...) IS NULL',
    '2. NEVER check for null or empty strings using "field IS NULL" or "TRIM(field) = \'\'".',
    '   Always use: NULLIF(TRIM({SOURCE_FIELD_NAME}), \'\') IS NULL',
    '   This single expression correctly handles NULL, empty string, and whitespace-only values.',
    '   For the inverse (field is populated): NULLIF(TRIM({SOURCE_FIELD_NAME}), \'\') IS NOT NULL',
  ].join('\n');
}

function buildNamingConventionsPrompt() {
  return [
    'RULE NAMING CONVENTIONS (follow strictly):',
    'Rule names must be assertive -- they state what is enforced, not what is checked.',
    '  GOOD: "Values for this field cannot be null or empty"',
    '  BAD:  "Check if the value is null or empty" / "Validate null values"',
    '',
    'There are exactly four valid prefix forms:',
    '  1. "GENERIC - "     : the rule is fully generic (applies to any field).',
    '  2. "{CDE_NAME} - "  : the CDE\'s own name used directly as the prefix (e.g. "BUBLE - ").',
    '                        Indicates the rule only works for that specific CDE. Use the actual',
    '                        CDE name, not the literal word "CDE". If the name is long, shorten it',
    '                        in a way that stays logical and recognisable.',
    '  3. "{CDS_NAME} - "   : the CDS\'s own name used directly as the prefix (e.g. "BIG BUBLE - ").',
    '                        Indicates the rule only works in the context of that specific CDS.',
    '                        Use the actual CDS name, not the literal word "CDS". If the name is long, ',
    '                        shorten it in a way that stays logical and recognisable.',
    '  4. (no prefix)      : also denotes a generic rule, but is a legacy/alternative form.',
    '',
    'When authoring or correcting a name, ALWAYS use form 1 ("GENERIC - ") for generic rules.',
    'NEVER recommend form 4 (no prefix) for a new or corrected name, even though it also means',
    '"generic" -- only treat form 4 as acceptable if it already exists in a name you are assessing,',
    'not one you are producing yourself.',
    '',
    'Do not name a specific field or CDE directly in the rule name unless the rule cannot possibly',
    'be parameterised. Rules are reusable templates; naming a field directly signals it is a one-off',
    'and not reusable.',
    '',
    'CHOOSING BETWEEN FORM 2 (CDE-specific) AND FORM 3 (CDS-specific):',
    'This distinction depends on business intent that you cannot reliably infer from the SQL or a',
    'short explanation alone. Do NOT decide this yourself. If a rule is not clearly generic AND its',
    'current name does not already use form 2 or form 3, ask the Data Steward directly -- as one of',
    'your Clarifying Questions -- whether the rule is scoped to this single CDE only, or to the CDS',
    'as a whole (e.g. a relationship/consistency check spanning more than one CDE within it). Only',
    'recommend form 2 or form 3 once the Steward has confirmed the scope; if they have not yet',
    'confirmed it, ask rather than guess.',
    '',
    'If the rule\'s CURRENT name already uses form 2 or form 3, trust the Steward\'s existing scope',
    'choice. Do not challenge, question, or re-litigate whether they picked the right one of the two',
    '-- assess only whether the name is otherwise well-formed (assertive phrasing, correct CDE/CDS',
    'name used, appropriately shortened if long).'
  ].join('\n');
}

function buildWorkedExamplePrompt() {
  return [
    'WORKED EXAMPLE:',
    'Input -- Name: "Check customer email" | Explanation: "Email field should not be blank" |',
    'sql_code: "SELECT COUNT(*) FROM sales.customers WHERE email IS NULL;" | Warnings: missing',
    '{SOURCE_DATABASE_NAME}, {SOURCE_TABLE_NAME}, and {SOURCE_FIELD_NAME} placeholders.',
    '',
    'Expected output:',
    '### Clarifying Questions',
    'Nothing to ask',
    '',
    '### Corrected sql_code',
    'SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} WHERE NULLIF(TRIM({SOURCE_FIELD_NAME}), \'\') IS NULL',
    '',
    '### Corrected sql_code_sample',
    'No change needed',
    '',
    '### Additional Observations',
    'Nothing to add',
    '',
    '### Name Assessment',
    'Compliant: No',
    'Issue: names a specific field ("customer email") for a pattern that is fully generic',
    '(null/empty check), and is phrased as a check rather than an assertion.',
    'Recommended name: "GENERIC - Values for this field cannot be null or empty"'
  ].join('\n');
}

function buildScopePromptForRuleAssistantPrompt() {
  return [
    'SCOPE OF REVIEW:',
    '- Fix every warning listed below, following the constraints and standards above.',
    '- If you notice a problem NOT in the warnings list (e.g. a business-logic issue, a likely wrong',
    '  comparison operator), report it separately under an "Additional Observations" heading -- do not',
    '  silently fix it, and do not silently ignore it.',
    '- Preserve the Data Steward\'s original logic. Change only what is needed to resolve a listed',
    '  warning or a standards violation above. Do not restructure, simplify, or "improve" logic beyond',
    '  that, even if you think a different approach is better -- note any such suggestion under',
    '  Additional Observations instead of applying it.'
  ].join('\n');
}

function buildOutputFormatPromptForRuleAssistantPrompt() {
  return [
    'REQUIRED OUTPUT FORMAT:',
    'Respond in exactly this structure, so the output can be parsed and pasted back into the form:',
    '',
    '### Clarifying Questions',
    '(bullet list, max 3 -- report "Nothing to ask" if none)',
    '',
    '### Corrected sql_code',
    '(single SQL statement, "No change needed", or -- if the rule is blocked per Step 1 --',
    '"Cannot be determined until Clarifying Questions are answered")',
    '',
    '### Corrected sql_code_sample',
    '(single SQL statement, "No change needed", or -- if the rule is blocked per Step 1 --',
    '"Cannot be determined until Clarifying Questions are answered")',
    '',
    '### Additional Observations',
    '(bullet list of anything noticed outside the listed warnings -- report "Nothing to add" if nothing noticed)',
    '',
    '### Name Assessment',
    'Compliant: Yes / No / Cannot be determined until Clarifying Questions are answered',
    'If No: what is wrong + recommended replacement name'
  ].join('\n');
}


// ---------------------------------------------------------------------------
// Rule Form Panel prompt  (166_form_panel_rule.js)
// Context: user is reviewing / fixing an existing or new rule in the form panel.
// No CDE or CDS context is available -- only the rule fields themselves.
// ---------------------------------------------------------------------------

function buildWithWarningsTaskPrompt() {
  return [
    'TASK:',
    'Work through these steps in order:',
    '1. Check for real intent, and decide if the rule is BLOCKED. If the Name, Explanation,',
    '   and SQL together give no genuine business context to work from (e.g. placeholder',
    '   text, gibberish, or a query with no recoverable logic), this rule is blocked: do not',
    '   invent a plausible-sounding fix. Go straight to step 2 to ask what the rule is meant',
    '   to check, then STOP -- do not attempt steps 3 and 4 in this turn. Still complete step',
    '   5 if the name can be judged independently of the SQL\'s intent; if the name is equally',
    '   meaningless, say so there instead of guessing. If the rule is not blocked, continue.',
    '2. Clarify if genuinely needed. Ask at most 2-3 clarifying questions -- either because',
    '   the rule is blocked per step 1, or because a fix cannot otherwise proceed without an',
    '   answer. Do not ask questions you could reasonably infer.',
    '3. Correct the SQL (skip entirely if step 1 found the rule blocked). Provide corrected',
    '   sql_code and/or sql_code_sample that resolve every warning listed above, in Athena-',
    '   valid SQL, following the engine mechanics, coding standards, and scope rules above.',
    '4. Self-check before responding (skip if blocked). Confirm silently: no trailing',
    '   semicolon; no CAST(); no snapshot/timestamp condition added by you; all three',
    '   placeholders present where relevant; NULLIF(TRIM(...)) pattern used for null/empty',
    '   checks; SQL is Athena-valid. Fix anything that fails before outputting.',
    '5. Assess the name. Check the Name above against the naming convention above. If it',
    '   does not comply, state what is wrong and recommend a corrected name -- but do not',
    '   apply it. The user will update the Name field manually.'
  ].join('\n');
}

function buildPassingRuleTaskPrompt() {
  return [
    'TASK:',
    'The SQL passes all automated validation checks. Work through these steps in order:',
    '1. Check for real intent, and decide if the rule is BLOCKED. Automated checks only',
    '   confirm structural correctness, not that the SQL is meaningful. If the Name,',
    '   Explanation, and SQL together give no genuine business context (e.g. gibberish table,',
    '   column, or field names with no recoverable logic), this rule is blocked: do not',
    '   invent a plausible-sounding review -- ask what the rule is meant to check instead,',
    '   then STOP. Still complete step 3 if the name can be judged independently; if it is',
    '   equally meaningless, say so there instead of guessing. If not blocked, continue.',
    '2. Confirm the SQL is correct, is valid Athena SQL, and follows all standards above.',
    '   Suggest any optimisations if relevant, but do not change the logic unless something',
    '   above is actually violated.',
    '3. Assess the name. Check the Name above against the naming convention above. If it',
    '   does not comply, state what is wrong and recommend a corrected name -- but do not',
    '   apply it. The user will update the Name field manually.'
  ].join('\n');
}

function buildRuleAssistantPrompt(values, warnings) {
  var lines = [
    'You are a data quality expert reviewing a Data Quality (DQ) rule authored by a Data Steward,',
    'before it is finalised in the MoJ DQ Accelerator.',
    '',
    'RULE UNDER REVIEW:',
  ];
  lines.push('  Name: ' + (values.rule_name || '(not set)'));
  if (values.rule_explanation && values.rule_explanation.trim()) {
    lines.push('  Explanation: ' + values.rule_explanation.trim());
  }
  if (values.sql_code && values.sql_code.trim()) {
    lines.push('');
    lines.push('sql_code:');
    lines.push(values.sql_code.trim());
  }
  if (values.sql_code_sample && values.sql_code_sample.trim()) {
    lines.push('');
    lines.push('sql_code_sample:');
    lines.push(values.sql_code_sample.trim());
  }

  lines.push('');
  lines.push(buildAthenaDialectPrompt());
  lines.push('');
  lines.push(buildEngineMechanicsPrompt());
  lines.push('');
  lines.push(buildSqlStandardsPrompt());
  lines.push('');
  lines.push(buildNamingConventionsPrompt());
  lines.push('');
  lines.push(buildScopePromptForRuleAssistantPrompt());
  lines.push('');
  lines.push(buildWorkedExamplePrompt());

  if (warnings && warnings.length > 0) {
    lines.push('');
    lines.push('CURRENT VALIDATION WARNINGS:');
    warnings.forEach(function(w) {
      lines.push('  [' + w.level + '] ' + w.msg);
    });
    lines.push('');
    lines.push(buildWithWarningsTaskPrompt());
  } else {
    lines.push('');
    lines.push(buildPassingRuleTaskPrompt());
  }
  lines.push('');
  lines.push(buildOutputFormatPromptForRuleAssistantPrompt());

  return lines.join('\n');
}


// ---------------------------------------------------------------------------
// Rule Generator prompt  (180_screen_generator.js)
// Context: user has selected a CDE with profiling data and wants AI-suggested
// rules. Response must be a JSON array the application can parse and import.
// ---------------------------------------------------------------------------

function buildGeneratorNamingConventionsPrompt(field) {
  return [
    'RULE NAMING CONVENTIONS (follow strictly):',
    'Rule names must be assertive -- they state what is enforced, not what is checked.',
    '  GOOD: "Values for this field cannot be null or empty"',
    '  BAD:  "Check if the value is null or empty" / "Validate null values"',
    '',
    'You may only use one of these two prefix forms when naming a suggestion:',
    '  1. "GENERIC - "        : the rule is fully generic (applies to any field).',
    '  2. "' + field + ' - " : use this CDE\'s own name ("' + field + '") directly as the prefix.',
    '                       Indicates the rule only works for this specific CDE. If the name is',
    '                       long, shorten it in a way that stays logical and recognisable.',
    '',
    'You do NOT have visibility into other CDEs in this CDS -- only this field\'s profiling data.',
    'For that reason, NEVER propose a CDS-level prefix (a rule spanning multiple CDEs), and NEVER',
    'omit the prefix entirely (an unprefixed name is a legacy form used elsewhere, not valid for',
    'suggestions you produce). If a concern you identify feels like it might actually be CDS-wide',
    '(e.g. a cross-field consistency issue), still propose the best Generic or CDE-specific version',
    'of it you can, and say so explicitly in "basis" so the Steward can escalate it manually.',
    '',
    'Do not name a specific field directly in the rule name unless the rule cannot possibly be',
    'parameterised -- rules are reusable templates, and naming a field directly signals a one-off.'
  ].join('\n');
}

function buildProfilingEvidenceBlock(profRecord) {
  var blocks = [];
  if (profRecord.summary_raw) {
    blocks.push('Summary:\n' + profRecord.summary_raw);
  }
  if (profRecord.type_patterns_raw) {
    blocks.push('Type patterns:\n' + profRecord.type_patterns_raw);
  }
  if (profRecord.top_values_raw) {
    blocks.push('Top values:\n' + profRecord.top_values_raw);
  }
  if (profRecord.length_distribution_raw) {
    blocks.push('Length distribution:\n' + profRecord.length_distribution_raw);
  }
  if (profRecord.profiling_notes) {
    blocks.push('Steward notes:\n' + profRecord.profiling_notes);
  }
  return blocks.join('\n\n');
}

function buildRuleCataloguePrompt(existingRulesCtx, cdsName) {
  var rCtx    = existingRulesCtx || {};
  var gRules  = rCtx.genericRules || [];
  var cRules  = rCtx.cdsRules     || [];
  var ceRules = rCtx.cdeRules     || [];

  if (!gRules.length && !cRules.length && !ceRules.length) {
    return null;
  }

  var lines = [
    'EXISTING RULE CATALOGUE -- AVOID DUPLICATES:',
    'If a suggestion you would make is equivalent to any rule listed below, do not create a new',
    'one -- output a REUSE suggestion referencing it instead, using its exact existing name (do not',
    'paraphrase it). This applies especially to Generic rules: never create a new Generic rule that',
    'overlaps with one already listed.',
    ''
  ];
  if (gRules.length) {
    lines.push('Generic rules (reusable across any field -- exact names, do not reinvent these):');
    gRules.forEach(function(r) { lines.push('  - "' + r.rule_name + '"'); });
    lines.push('');
  }
  if (cRules.length) {
    lines.push('Rules already applied to other CDEs in this CDS' + (cdsName ? ' ("' + cdsName + '")' : '') + ':');
    cRules.forEach(function(r) { lines.push('  - "' + r.rule_name + '"' + (r.dimension ? ' (' + r.dimension + ')' : '')); });
    lines.push('');
  }
  if (ceRules.length) {
    lines.push('Rules already allocated to this specific CDE (do not re-suggest):');
    ceRules.forEach(function(r) { lines.push('  - "' + r.rule_name + '"' + (r.dimension ? ' (' + r.dimension + ')' : '')); });
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '');
}

function buildOutputSchemaPrompt() {
  return [
    'OUTPUT SCHEMA:',
    'Each element of the array is either a NEW suggestion or a REUSE suggestion.',
    '',
    'NEW (no equivalent exists in the catalogue):',
    '{',
    '  "rule_name": "prefix + assertive statement -- see RULE NAMING CONVENTIONS above",',
    '  "dimension": "one of: Completeness, Validity, Uniqueness, Consistency, Timeliness, Accuracy",',
    '  "description": "business rule statement, starting with \'As a business rule, \' -- plain',
    '                  English only, no SQL, thresholds, or technical implementation details",',
    '  "basis": "what in the profiling evidence triggered this suggestion",',
    '  "sql_code": "the business-logic query -- see engine mechanics and coding standards above",',
    '  "sql_code_sample": "the unfiltered sample query -- see engine mechanics above"',
    '}',
    '',
    'REUSE (an existing catalogue rule already covers this concern):',
    '{',
    '  "reuse": true,',
    '  "existing_rule_name": "exact name copied from the catalogue above",',
    '  "dimension": "one of: Completeness, Validity, Uniqueness, Consistency, Timeliness, Accuracy",',
    '  "basis": "why this existing rule applies here, and what in the profiling evidence confirms it"',
    '}'
  ].join('\n');
}

function buildGeneratorWorkedExamplePrompt() {
  return [
    'WORKED EXAMPLE:',
    'Profiling evidence (abridged) -- field "email": 12% of values are NULL; top malformed values',
    'include entries with no "@" character.',
    'Existing catalogue -- Generic rule "GENERIC - Values for this field cannot be null or empty"',
    'already exists.',
    '',
    'Expected output:',
    '[',
    '  {',
    '    "reuse": true,',
    '    "existing_rule_name": "GENERIC - Values for this field cannot be null or empty",',
    '    "dimension": "Completeness",',
    '    "basis": "12% of values are NULL, matching an existing generic completeness rule -- no new rule needed"',
    '  },',
    '  {',
    '    "rule_name": "email - values must contain an @ character",',
    '    "dimension": "Validity",',
    '    "description": "As a business rule, every populated email value must contain an \'@\' character to be considered a valid email address.",',
    '    "basis": "Top values include entries with no \'@\' character, indicating malformed emails not covered by any existing rule",',
    '    "sql_code": "SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} WHERE NULLIF(TRIM({SOURCE_FIELD_NAME}), \'\') IS NOT NULL AND {SOURCE_FIELD_NAME} NOT LIKE \'%@%\'",',
    '    "sql_code_sample": "SELECT * FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME}"',
    '  }',
    ']'
  ].join('\n');
}

function buildSuggestionPrompt(cde, ddlCols, profRecord, cdsName, existingRulesCtx) {
  var db    = cde.source_database_name || '';
  var tbl   = cde.source_table_name    || '';
  var field = cde.source_field_name    || '';
  var snap  = cde.source_snapshot_filter || '';
  var ddlMatch = (ddlCols || []).find(function(c) { return c.name === field; }) || '';
  var phys  = (ddlMatch && ddlMatch.type) || profRecord.physical_data_type || 'UNKNOWN';
  var sem   = profRecord.semantic_type || '';

  var lines = [
    'You are a data quality expert helping a Data Steward define SQL-based data quality rules',
    'for a single Critical Data Element (CDE), for execution on AWS Athena.',
    '',
    'FIELD UNDER REVIEW:',
    '  Field name:      ' + field,
    '  Database:        ' + db,
    '  Table:           ' + tbl,
    '  Physical type:   ' + phys
  ];
  if (sem) {
    lines.push('  Semantic type:   ' + sem);
  }
  lines.push('  Snapshot filter: ' + (snap || 'none'));

  lines.push('');
  lines.push(buildAthenaDialectPrompt());

  lines.push('');
  lines.push(buildEngineMechanicsPrompt());
  if (snap) {
    lines.push('');
    lines.push('This field\'s snapshot filter is: "' + snap + '". Be aware of it when reasoning about');
    lines.push('the WHERE clause logic above, but do NOT include it in either query yourself.');
  }

  lines.push('');
  lines.push(buildSqlStandardsPrompt());

  lines.push('');
  lines.push(buildGeneratorNamingConventionsPrompt(field));

  var evidenceBlocks = buildProfilingEvidenceBlock(profRecord);
  if (evidenceBlocks.length) {
    lines.push('');
    lines.push('PROFILING INSTRUCTIONS:');
    lines.push('Base every suggestion on the following evidence -- do not suggest anything it does not support.');
    lines.push('');
    lines.push('PROFILING EVIDENCE:');
    lines.push('');
    lines.push(evidenceBlocks);
    lines.push('');
  } else {
    lines.push('PROFILING EVIDENCE:');
    lines.push('');
    lines.push('No profiling evidence is available for this field.');
  }

  var cataloguePrompt = buildRuleCataloguePrompt(existingRulesCtx, cdsName);
  if (cataloguePrompt) {
    lines.push('');
    lines.push(cataloguePrompt);
  }

  lines.push('');
  lines.push(buildGeneratorWorkedExamplePrompt());

  lines.push('');
  lines.push('DECISION PROCEDURE:');
  lines.push('For each data quality concern you identify from the profiling evidence:');
  lines.push('1. Check the existing rule catalogue above first (if provided).');
  lines.push('2. If an existing rule at any level (Generic, CDS, or CDE) already covers the same');
  lines.push('   concern, output a REUSE suggestion referencing it -- do not also create a NEW');
  lines.push('   suggestion for the same concern. Prefer REUSE over NEW whenever both are possible.');
  lines.push('3. Only if no existing rule covers the concern, output a NEW suggestion, following the');
  lines.push('   dialect constraint, engine mechanics, and coding standards above exactly.');
  lines.push('4. If the profiling evidence above is empty, or too sparse to support any specific,');
  lines.push('   evidence-based suggestion, do not invent one -- return an empty array [] instead.');

  lines.push('');
  lines.push(buildOutputSchemaPrompt());

  lines.push('');
  lines.push('REQUIRED OUTPUT FORMAT:');
  lines.push('Respond with ONLY a single valid JSON array mixing NEW and REUSE elements as appropriate.');
  lines.push('No explanation, no markdown, no code fences, no text before or after the array. If there');
  lines.push('is nothing to suggest (see step 4 above), respond with exactly: []');

  return lines.join('\n');
}