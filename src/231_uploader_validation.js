// ===============================================================================
// UPLOADER EXPORT VALIDATION
// Pure functions only. No JSX, no state, no side effects.
// Used by: 232_uploader_export.js (UploaderExportTab)
// ===============================================================================

// -----------------------------------------------------------------------
// isInvalidSourceField(val)
// -----------------------------------------------------------------------
// Returns null when the value is a valid SQL identifier, or a failure
// code string when it is not:
//   'blank'       - empty or whitespace only
//   'placeholder' - exact match on known placeholder terms (TBD/TBC/etc)
//   'spaces'      - contains one or more space characters
// -----------------------------------------------------------------------
const PLACEHOLDER_SOURCE_VALUES = ['tbd', 'tbc', 'to be confirmed'];

function isInvalidSourceField(val) {
  var trimmed = (val || '').trim();
  if (trimmed === '') return 'blank';
  if (PLACEHOLDER_SOURCE_VALUES.indexOf(trimmed.toLowerCase()) !== -1) return 'placeholder';
  if (trimmed.indexOf(' ') !== -1) return 'spaces';
  return null;
}

function buildSourceFieldReason(fieldName, failCode, rawVal) {
  if (failCode === 'blank')  return fieldName + ' is blank';
  if (failCode === 'spaces') return fieldName + ' contains spaces - not a valid SQL identifier';
  return fieldName + ' contains placeholder value \'' + (rawVal || '').trim() + '\'';
}

// -----------------------------------------------------------------------
// computeUploaderExclusions(data, includeSoftDeleted)
// -----------------------------------------------------------------------
// Classifies every data_quality_rule_allocation record as included or
// excluded for the uploader ZIP.
//
// Returns { included, excluded, totalEvaluated, cdsMap, cdeMap, ruleMap }
//   included       - raw allocation records that will appear in the ZIP
//   excluded       - { allocation, rule, cde, cds, reasons[], checks{} }
//   totalEvaluated - count of allocations actually processed
//   cdsMap/cdeMap/ruleMap - lookup maps built internally, re-exported for UI
// -----------------------------------------------------------------------
function computeUploaderExclusions(data, includeSoftDeleted) {
  var allocations = data.data_quality_rule_allocation || [];
  var rules       = data.data_quality_rule            || [];
  var cdes        = data.critical_data_element        || [];
  var cdss        = data.critical_data_set            || [];

  var ruleMap = {};
  for (var r = 0; r < rules.length; r++) ruleMap[rules[r].data_quality_rule_id] = rules[r];
  var cdeMap = {};
  for (var c = 0; c < cdes.length; c++) cdeMap[cdes[c].critical_data_element_id] = cdes[c];
  var cdsMap = {};
  for (var s = 0; s < cdss.length; s++) cdsMap[cdss[s].critical_data_set_id] = cdss[s];

  var included = [];
  var excluded = [];

  for (var i = 0; i < allocations.length; i++) {
    var alloc        = allocations[i];
    var isSoftDeleted = !!alloc.retiring_timestamp;

    if (isSoftDeleted && !includeSoftDeleted) continue;

    if (isSoftDeleted) {
      included.push(alloc);
      continue;
    }

    var reasons = [];
    var rule = ruleMap[alloc.data_quality_rule_id]    || null;
    var cde  = cdeMap[alloc.critical_data_element_id] || null;
    var cds  = cde ? (cdsMap[cde.critical_data_set_id] || null) : null;

    // -- Rule checks -------------------------------------------------
    var sqlOk = false;
    if (!rule) {
      reasons.push('Linked rule record not found (ID: ' + alloc.data_quality_rule_id + ')');
    } else if (!(rule.sql_code || '').trim()) {
      reasons.push('Rule has no SQL code');
    } else {
      sqlOk = true;
    }

    // -- CDE source field checks ------------------------------------
    var dbFail    = null;
    var tableFail = null;
    var fieldFail = null;

    if (!cde) {
      reasons.push('Linked CDE record not found (ID: ' + alloc.critical_data_element_id + ')');
    } else {
      dbFail    = isInvalidSourceField(cde.source_database_name);
      tableFail = isInvalidSourceField(cde.source_table_name);
      fieldFail = isInvalidSourceField(cde.source_field_name);
      if (dbFail)    reasons.push(buildSourceFieldReason('source_database_name', dbFail,    cde.source_database_name));
      if (tableFail) reasons.push(buildSourceFieldReason('source_table_name',   tableFail, cde.source_table_name));
      if (fieldFail) reasons.push(buildSourceFieldReason('source_field_name',   fieldFail, cde.source_field_name));
    }

    // -- Substitution + sanity checks (only when no prior reasons) ---
    var placeholdersOk = false;
    var phFieldOk      = false;
    var balancedOk     = false;
    var noLimitSql     = false;
    var hasCountSql    = false;
    var noLimitSample  = true;
    var hasCountSample = true;

    if (reasons.length === 0) {
      var substituted = rule.sql_code
        .replace(/\{SOURCE_DATABASE_NAME\}/g, cde.source_database_name)
        .replace(/\{SOURCE_TABLE_NAME\}/g,    cde.source_table_name)
        .replace(/\{SOURCE_FIELD_NAME\}/g,    cde.source_field_name);

      var phDb    = rule.sql_code.indexOf('{SOURCE_DATABASE_NAME}') !== -1;
      var phTable = rule.sql_code.indexOf('{SOURCE_TABLE_NAME}')    !== -1;
      var phField = rule.sql_code.indexOf('{SOURCE_FIELD_NAME}')    !== -1;

      if (!phDb)    reasons.push('Missing placeholder {SOURCE_DATABASE_NAME} in sql_code');
      if (!phTable) reasons.push('Missing placeholder {SOURCE_TABLE_NAME} in sql_code');
      if (!phField) reasons.push('Missing placeholder {SOURCE_FIELD_NAME} in sql_code');
      placeholdersOk = phDb && phTable;
      phFieldOk      = phField;

      if (!substituted.trim()) reasons.push('SQL is empty after field substitution');

      var sqCount = 0, dqCount = 0, parenDepth = 0;
      for (var k = 0; k < substituted.length; k++) {
        var ch = substituted[k];
        if      (ch === "'") sqCount++;
        else if (ch === '"') dqCount++;
        else if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
      }
      if (sqCount % 2 !== 0) reasons.push('Unbalanced single quotes in sql_code');
      if (dqCount % 2 !== 0) reasons.push('Unbalanced double quotes in sql_code');
      if (parenDepth !== 0)  reasons.push('Unbalanced parentheses in sql_code');
      balancedOk = (sqCount % 2 === 0) && (dqCount % 2 === 0) && (parenDepth === 0);

      noLimitSql  = !/\bLIMIT\b/i.test(rule.sql_code);
      hasCountSql = /\bCOUNT\s*\(/i.test(rule.sql_code);
      if (!noLimitSql)  reasons.push('sql_code contains a LIMIT keyword - not supported by the DQ engine');
      if (!hasCountSql) reasons.push('sql_code uses plain SELECT without COUNT - the DQ engine requires SELECT COUNT(...)');

      if (rule.sql_code_sample && rule.sql_code_sample.trim()) {
        noLimitSample  = !/\bLIMIT\b/i.test(rule.sql_code_sample);
        hasCountSample = /\bCOUNT\s*\(/i.test(rule.sql_code_sample);
        if (!noLimitSample)  reasons.push('sql_code_sample contains a LIMIT keyword - not supported by the DQ engine');
        if (!hasCountSample) reasons.push('sql_code_sample uses plain SELECT without COUNT - the DQ engine requires SELECT COUNT(...)');
      }
    }

    // -- Build structured checks flags for UI column rendering ------
    var checks = {
      dbOk:           !dbFail && !!cde,
      tableOk:        !tableFail && !!cde,
      fieldOk:        !fieldFail && !!cde,
      sqlOk:          sqlOk,
      placeholdersOk: placeholdersOk,
      phFieldOk:      phFieldOk,
      engOk:          balancedOk && noLimitSql && hasCountSql && noLimitSample && hasCountSample,
    };

    if (reasons.length > 0) {
      excluded.push({ allocation: alloc, rule, cde, cds, reasons, checks });
    } else {
      included.push(alloc);
    }
  }

  return {
    included,
    excluded,
    totalEvaluated: included.length + excluded.length,
    cdsMap,
    cdeMap,
    ruleMap,
  };
}

// -----------------------------------------------------------------------
// buildUploaderReceipt(excluded, overridden, totalEvaluated)
// -----------------------------------------------------------------------
// Builds a JSON Blob documenting excluded allocations and any allocations
// that were manually included by the Master Steward despite failures.
// Called when excluded.length > 0 or overridden.length > 0.
// -----------------------------------------------------------------------
function buildUploaderReceipt(excluded, overridden, totalEvaluated) {
  var totalOverridden = overridden.length;
  var totalExcluded   = excluded.length;
  var totalIncluded   = totalEvaluated - totalExcluded;

  function mapItem(item) {
    return {
      data_quality_rule_allocation_id: item.allocation.data_quality_rule_allocation_id,
      critical_data_element_id:        item.allocation.critical_data_element_id,
      critical_data_set_id:            item.cde  ? item.cde.critical_data_set_id           : null,
      critical_data_set_name:          item.cds  ? (item.cds.data_set_name              || '-') : '-',
      source_database_name:            item.cde  ? (item.cde.source_database_name       || '-') : '-',
      source_table_name:               item.cde  ? (item.cde.source_table_name          || '-') : '-',
      source_field_name:               item.cde  ? (item.cde.source_field_name          || '-') : '-',
      data_element_definition:         item.cde  ? (item.cde.data_element_definition    || '-') : '-',
      data_quality_rule_id:            item.allocation.data_quality_rule_id,
      data_quality_rule_name:          item.rule ? (item.rule.rule_name                 || '-') : '-',
    };
  }

  var receipt = {
    _type:               'uploader_exclusion_receipt',
    _generated_at:       new Date().toISOString(),
    _total_evaluated:    totalEvaluated,
    _total_included:     totalIncluded,
    _total_excluded:     totalExcluded,
    _total_overridden:   totalOverridden,
    excluded_allocations: excluded.map(function(item) {
      var out = mapItem(item);
      out.reasons = item.reasons;
      return out;
    }),
    overridden_allocations: overridden.map(function(item) {
      var out = mapItem(item);
      out.known_failures = item.reasons;
      out.override_note  = 'Manually included by Master Steward despite validation failures';
      return out;
    }),
  };

  return new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
}
