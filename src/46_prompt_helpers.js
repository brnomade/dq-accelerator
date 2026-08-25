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

function buildNamingConventionsPrompt(opts) {
  var cdsName   = (opts && opts.cdsName)   || null;
  var fieldName = (opts && opts.fieldName) || null;
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
    'and not reusable.'
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
    '(none -- intent is unambiguous)',
    '',
    '### Corrected sql_code',
    'SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} WHERE NULLIF(TRIM({SOURCE_FIELD_NAME}), \'\') IS NULL',
    '',
    '### Corrected sql_code_sample',
    'No change needed',
    '',
    '### Additional Observations',
    '(none)',
    '',
    '### Name Assessment',
    'Compliant: No',
    'Issue: names a specific field ("customer email") for a pattern that is fully generic',
    '(null/empty check), and is phrased as a check rather than an assertion.',
    'Recommended name: "GENERIC - Values for this field cannot be null or empty"'
  ].join('\n');
}

function buildOutputFormatPromptForRuleAssistantPrompt() {
  return [
    'REQUIRED OUTPUT FORMAT:',
    'Respond in exactly this structure, so the output can be parsed and pasted back into the form:',
    '',
    '### Clarifying Questions',
    '(bullet list, max 3 -- omit this section entirely if none)',
    '',
    '### Corrected sql_code',
    '(single SQL statement, or "No change needed")',
    '',
    '### Corrected sql_code_sample',
    '(single SQL statement, or "No change needed")',
    '',
    '### Additional Observations',
    '(bullet list of anything noticed outside the listed warnings -- omit if none)',
    '',
    '### Name Assessment',
    'Compliant: Yes / No',
    'If No: what is wrong + recommended replacement name'
  ].join('\n');
}


// ---------------------------------------------------------------------------
// Rule Form Panel prompt  (166_form_panel_rule.js)
// Context: user is reviewing / fixing an existing or new rule in the form panel.
// No CDE or CDS context is available -- only the rule fields themselves.
// ---------------------------------------------------------------------------

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
  lines.push('SQL DIALECT CONSTRAINT:');
  lines.push('All SQL you write must be valid AWS Athena SQL (Presto/Trino engine) -- this is the only');
  lines.push('engine the DQ Accelerator executes against. Do not use syntax, functions, or conventions');
  lines.push('valid in other dialects (e.g. T-SQL, MySQL, PostgreSQL-only functions) if they are not also');
  lines.push('valid in Athena. If a standard\'s example syntax is ever ambiguous between dialects, prefer');
  lines.push('the Athena-valid form.');

  lines.push('');
  lines.push(buildEngineMechanicsPrompt());
  lines.push('');
  lines.push(buildSqlStandardsPrompt());
  lines.push('');
  lines.push(buildNamingConventionsPrompt());
  lines.push('');
  lines.push(buildWorkedExamplePrompt());

  if (warnings && warnings.length > 0) {
    lines.push('');
    lines.push('CURRENT VALIDATION WARNINGS:');
    warnings.forEach(function(w) {
      lines.push('  [' + w.level + '] ' + w.msg);
    });
    lines.push('');
    lines.push('TASK:');
    lines.push('Work through these steps in order:');
    lines.push('1. Check for real intent. If the Name or Explanation give no genuine business context');
    lines.push('   (e.g. placeholder text, gibberish, or too vague to act on), do not invent a plausible-');
    lines.push('   sounding fix -- ask what the rule is meant to check instead.');
    lines.push('2. Clarify if genuinely needed. Ask at most 2-3 clarifying questions, and only where a');
    lines.push('   fix cannot proceed without an answer. Do not ask questions you could reasonably infer.');
    lines.push('3. Correct the SQL. Provide corrected sql_code and/or sql_code_sample that resolve every');
    lines.push('   warning listed above, in Athena-valid SQL, following the engine mechanics, coding');
    lines.push('   standards, and scope rules above.');
    lines.push('4. Self-check before responding. Confirm silently: no trailing semicolon; no CAST();');
    lines.push('   no snapshot/timestamp condition added by you; all three placeholders present where');
    lines.push('   relevant; NULLIF(TRIM(...)) pattern used for null/empty checks; SQL is Athena-valid.');
    lines.push('   Fix anything that fails before outputting.');
    lines.push('5. Assess the name. Check the Name above against the naming convention above. If it');
    lines.push('   does not comply, state what is wrong and recommend a corrected name -- but do not');
    lines.push('   apply it. The user will update the Name field manually.');
  } else {
    lines.push('');
    lines.push('TASK:');
    lines.push('The SQL passes all automated validation checks. Work through these steps in order:');
    lines.push('1. Confirm the SQL is correct, is valid Athena SQL, and follows all standards above.');
    lines.push('   Suggest any optimisations if relevant, but do not change the logic unless something');
    lines.push('   above is actually violated.');
    lines.push('2. Assess the name. Check the Name above against the naming convention above. If it');
    lines.push('   does not comply, state what is wrong and recommend a corrected name -- but do not');
    lines.push('   apply it. The user will update the Name field manually.');
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

function buildSuggestionPrompt(cde, ddlCols, profRecord, cdsName, existingRulesCtx) {
  const db    = cde.source_database_name || '';
  const tbl   = cde.source_table_name    || '';
  const field = cde.source_field_name    || '';
  const snap  = cde.source_snapshot_filter || '';
  const phys  = ddlCols.find(c => c.name === field)?.type || profRecord.physical_data_type || 'UNKNOWN';
  const sem   = profRecord.semantic_type || '';

  const lines = [
    'You are a data quality expert helping define SQL-based data quality rules for AWS Athena.',
    '',
    'FIELD DETAILS:',
    'Field name:      ' + field,
    'Database:        ' + db,
    'Table:           ' + tbl,
    'Physical type:   ' + phys,
    sem ? ('Semantic type:   ' + sem) : '',
    'Snapshot filter: ' + (snap || 'none'),
    '',
  ];

  if (profRecord.summary_raw) {
    lines.push('PROFILING SUMMARY:');
    lines.push(profRecord.summary_raw);
    lines.push('');
  }
  if (profRecord.type_patterns_raw) {
    lines.push('TYPE PATTERNS:');
    lines.push(profRecord.type_patterns_raw);
    lines.push('');
  }
  if (profRecord.top_values_raw) {
    lines.push('TOP VALUES:');
    lines.push(profRecord.top_values_raw);
    lines.push('');
  }
  if (profRecord.length_distribution_raw) {
    lines.push('LENGTH DISTRIBUTION:');
    lines.push(profRecord.length_distribution_raw);
    lines.push('');
  }
  if (profRecord.profiling_notes) {
    lines.push('NOTES:');
    lines.push(profRecord.profiling_notes);
    lines.push('');
  }

  const rCtx    = existingRulesCtx || {};
  const gRules  = rCtx.genericRules || [];
  const cRules  = rCtx.cdsRules     || [];
  const ceRules = rCtx.cdeRules     || [];
  if (gRules.length || cRules.length || ceRules.length) {
    lines.push('EXISTING RULES IN CATALOGUE -- DO NOT DUPLICATE:');
    lines.push('If a suggestion you would make is equivalent to any rule listed below, omit it entirely.');
    lines.push('For Generic rules: do NOT create a new Generic rule that overlaps with one already listed.');
    lines.push('Reuse the exact existing rule name where applicable -- do not paraphrase it.');
    lines.push('');
    if (gRules.length) {
      lines.push('Generic rules (reusable across any field -- exact names, do not reinvent these):');
      gRules.forEach(r => lines.push('  - "' + r.rule_name + '"'));
      lines.push('');
    }
    if (cRules.length) {
      lines.push('Rules already applied to other CDEs in this Critical Data Set' + (cdsName ? ' ("' + cdsName + '")' : '') + ':');
      cRules.forEach(r => lines.push('  - "' + r.rule_name + '"' + (r.dimension ? ' (' + r.dimension + ')' : '')));
      lines.push('');
    }
    if (ceRules.length) {
      lines.push('Rules already allocated to this specific CDE (do not re-suggest):');
      ceRules.forEach(r => lines.push('  - "' + r.rule_name + '"' + (r.dimension ? ' (' + r.dimension + ')' : '')));
      lines.push('');
    }
  }

  lines.push('TASK:');
  lines.push('Based on the profiling data above, suggest data quality rules for this field.');
  lines.push('Each rule must be implementable as an Athena SQL SELECT COUNT(*) query counting failing records.');
  lines.push('Use these exact placeholders in the SQL: {SOURCE_DATABASE_NAME}, {SOURCE_TABLE_NAME}, {SOURCE_FIELD_NAME}.');
  lines.push('');
  lines.push(buildSqlStandardsPrompt());
  if (snap) lines.push('Note: the snapshot filter for this table is "' + snap + '" -- be aware of it when designing the WHERE clause logic, but do NOT include it in either query.');
  lines.push('');
  lines.push('Respond ONLY with a valid JSON array. No explanation, no markdown, no code fences.');
  lines.push(buildNamingConventionsPrompt({ cdsName: cdsName, fieldName: field }));
  lines.push('');
  lines.push('Each element is either a NEW rule or a REUSE suggestion -- choose based on the catalogue above.');
  lines.push('');
  lines.push('NEW rule (no equivalent exists in the catalogue):');
  lines.push('[');
  lines.push('  {');
  lines.push('    "rule_name": "prefix + assertive statement, e.g. \'Generic - field values cannot be null or empty\' or \'CDE ' + field + ' - values must match the expected pattern\'",');
  lines.push('    "dimension": "one of: Completeness, Validity, Uniqueness, Consistency, Timeliness, Accuracy",');
  lines.push('    "description": "business rule statement -- must start with \'As a business rule, \' and complete the sentence in plain English. Do not mention SQL, thresholds, or technical implementation details.",');
  lines.push('    "basis": "what in the profiling data triggered this suggestion",');
  lines.push('    "sql_code": "SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} WHERE <business logic only -- no snapshot filter -- no semicolon>",');
  lines.push('    "sql_code_sample": "SELECT * FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} LIMIT 100 (no WHERE clause -- no semicolon)"');
  lines.push('  }');
  lines.push(']');
  lines.push('');
  lines.push('REUSE suggestion (an existing rule from the catalogue already covers this concern):');
  lines.push('[');
  lines.push('  {');
  lines.push('    "reuse": true,');
  lines.push('    "existing_rule_name": "exact rule name copied from the catalogue list above",');
  lines.push('    "dimension": "one of: Completeness, Validity, Uniqueness, Consistency, Timeliness, Accuracy",');
  lines.push('    "basis": "why this existing rule applies to this CDE, and what in the profiling confirms it"');
  lines.push('  }');
  lines.push(']');
  lines.push('');
  lines.push('Return a single JSON array mixing both types as appropriate.');
  lines.push('For each concern you identify, prefer REUSE over NEW if an equivalent rule exists in the catalogue.');

  return lines.filter(l => l !== null).join('\n');
}
