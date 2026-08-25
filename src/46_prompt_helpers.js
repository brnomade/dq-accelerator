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

function buildSqlStandardsPrompt() {
  return [
    'CRITICAL -- SNAPSHOT FILTER RULE (read carefully):',
    'The DQ engine that executes these queries will append a snapshot/timestamp filter at run time.',
    'DO NOT include any snapshot or timestamp filter condition in either query.',
    'The engine concatenates as follows:',
    '  sql_code        -->  your query + " AND <timestamp_filter>"',
    '  sql_code_sample -->  your query + " WHERE <timestamp_filter>"',
    'This means:',
    '  - sql_code MUST contain a WHERE clause with only the business logic condition(s).',
    '    It must NOT include the snapshot filter. It must NOT end with a semicolon.',
    '    Example: SELECT COUNT(*) FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} WHERE {SOURCE_FIELD_NAME} IS NULL',
    '  - sql_code_sample MUST NOT contain any WHERE clause at all.',
    '    The engine will append WHERE <timestamp_filter> to it at test time.',
    '    It must NOT end with a semicolon.',
    '    Example: SELECT * FROM {SOURCE_DATABASE_NAME}.{SOURCE_TABLE_NAME} LIMIT 100',
    '',
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
  var lines = [
    'RULE NAMING CONVENTIONS (follow strictly):',
    'Rule names must be assertive -- they state what is enforced, not what is checked.',
    '  GOOD: "Values for this field cannot be null or empty"',
    '  BAD:  "Check if the value is null or empty" / "Validate null values"',
    'Do not name a specific field or CDE directly in the rule name unless the rule',
    'cannot possibly be parameterised. Rules are reusable templates; naming a field',
    'directly signals it is a one-off and not reusable.',
    'Apply one of these three prefixes based on scope:',
    '  "Generic - "     : rule is universally applicable to any field (e.g. null check, uniqueness)',
  ];
  if (cdsName) {
    var shortCds = cdsName.length > 30 ? cdsName.substring(0, 28).trim() + '..' : cdsName;
    lines.push('  "' + shortCds + ' - " : rule is meaningful only in the context of this Critical Data Set');
  }
  if (fieldName) {
    lines.push('  "CDE ' + fieldName + ' - " : rule is highly specific to this one field and cannot be generalised -- replace "' + fieldName + '" with the actual field name exactly as shown');
  } else {
    lines.push('  "CDE [field_name] - " : rule is highly specific to this one field and cannot be generalised -- replace [field_name] with the actual field name');
  }
  lines.push('If a CDS or CDE name is long, shorten it in a way that remains logical and recognisable.');
  return lines.join('\n');
}


// ---------------------------------------------------------------------------
// Rule Form Panel prompt  (166_form_panel_rule.js)
// Context: user is reviewing / fixing an existing or new rule in the form panel.
// No CDE or CDS context is available -- only the rule fields themselves.
// ---------------------------------------------------------------------------

function buildRuleAssistantPrompt(values, warnings) {
  var lines = [
    'You are a data quality expert reviewing a Data Quality rule.',
    '',
    'RULE DETAILS:',
  ];
  lines.push('  Name: ' + (values.rule_name || '(not set)'));
  if (values.rule_explanation && values.rule_explanation.trim()) {
    lines.push('  Explanation: ' + values.rule_explanation.trim());
  }
  if (values.sql_code && values.sql_code.trim()) {
    lines.push('');
    lines.push('SQL CODE:');
    lines.push(values.sql_code.trim());
  }
  if (values.sql_code_sample && values.sql_code_sample.trim()) {
    lines.push('');
    lines.push('SQL SAMPLE:');
    lines.push(values.sql_code_sample.trim());
  }
  lines.push('');
  lines.push(buildSqlStandardsPrompt());
  lines.push('');
  lines.push(buildNamingConventionsPrompt());
  lines.push('Note: without a specific CDE or CDS in context, the applicable prefixes are');
  lines.push('"Generic -" for rules reusable across any field, or "CDE [field_name] -" for field-specific rules.');
  if (warnings && warnings.length > 0) {
    lines.push('');
    lines.push('CURRENT VALIDATION WARNINGS:');
    warnings.forEach(function(w) {
      lines.push('  [' + w.level + '] ' + w.msg);
    });
    lines.push('');
    lines.push('TASK:');
    lines.push('Ask clarifying questions about the intent of this rule and the data it checks.');
    lines.push('Then provide corrected versions of sql_code and/or sql_code_sample that resolve');
    lines.push('all warnings listed above, ready to paste back into the form.');
    lines.push('Also assess whether the rule name follows the naming convention above. If it');
    lines.push('does not, state what is wrong and recommend a corrected name -- but do not');
    lines.push('apply it. The user will update the Name field manually.');
  } else {
    lines.push('');
    lines.push('TASK:');
    lines.push('The SQL passes all automated validation checks. Confirm it is correct and follows');
    lines.push('all standards above. Suggest any optimisations if relevant.');
    lines.push('Also assess whether the rule name follows the naming convention above. If it');
    lines.push('does not, state what is wrong and recommend a corrected name -- but do not');
    lines.push('apply it. The user will update the Name field manually.');
  }
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
