// ===============================================================================
// PROMPT HELPERS -- shared text blocks for AI assistant prompts
// Used by: DataRuleGeneratorScreen (180), RuleFormPanel (166)
// ===============================================================================

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
