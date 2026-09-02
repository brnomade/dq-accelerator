// ===============================================================================
// UPLOADER EXPORT VALIDATION
// Pure functions only. No JSX, no state, no side effects.
// Used by: 232_uploader_export.js (UploaderExportTab)
// ===============================================================================

// -----------------------------------------------------------------------
// computeUploaderExclusions(data, includeSoftDeleted)
// -----------------------------------------------------------------------
// Classifies every data_quality_rule_allocation record as included or
// excluded for the uploader ZIP.
//
// includeSoftDeleted behaviour:
//   false -> soft-deleted allocations are skipped entirely (not in output)
//   true  -> soft-deleted allocations bypass validation and go to included
//            (the engine never executes retired allocations so validity is moot)
//
// Returns { included, excluded, totalEvaluated }
//   included       - raw allocation records that will appear in the ZIP
//   excluded       - { allocation, rule, cde, cds, reasons[] } objects
//   totalEvaluated - count of allocations actually processed (included + excluded)
// -----------------------------------------------------------------------
function computeUploaderExclusions(data, includeSoftDeleted) {
  const allocations = data.data_quality_rule_allocation || [];
  const rules       = data.data_quality_rule            || [];
  const cdes        = data.critical_data_element        || [];
  const cdss        = data.critical_data_set            || [];

  const ruleMap = {};
  for (const r of rules) ruleMap[r.data_quality_rule_id] = r;
  const cdeMap = {};
  for (const c of cdes) cdeMap[c.critical_data_element_id] = c;
  const cdsMap = {};
  for (const c of cdss) cdsMap[c.critical_data_set_id] = c;

  const included = [];
  const excluded = [];

  for (const alloc of allocations) {
    const isSoftDeleted = !!alloc.retiring_timestamp;

    if (isSoftDeleted && !includeSoftDeleted) continue;

    if (isSoftDeleted) {
      included.push(alloc);
      continue;
    }

    const reasons = [];
    const rule = ruleMap[alloc.data_quality_rule_id]      || null;
    const cde  = cdeMap[alloc.critical_data_element_id]   || null;
    const cds  = cde ? (cdsMap[cde.critical_data_set_id] || null) : null;

    // -- Rule checks -------------------------------------------------
    if (!rule) {
      reasons.push('Linked rule record not found (ID: ' + alloc.data_quality_rule_id + ')');
    } else if (!(rule.sql_code || '').trim()) {
      reasons.push('Rule has no SQL code');
    }

    // -- CDE checks --------------------------------------------------
    if (!cde) {
      reasons.push('Linked CDE record not found (ID: ' + alloc.critical_data_element_id + ')');
    } else {
      if (!(cde.source_database_name || '').trim()) reasons.push('Missing source_database_name on CDE');
      if (!(cde.source_table_name    || '').trim()) reasons.push('Missing source_table_name on CDE');
      if (!(cde.source_field_name    || '').trim()) reasons.push('Missing source_field_name on CDE');
    }

    // -- Substitution + sanity checks (only when no prior reasons) ---
    if (reasons.length === 0) {
      const substituted = rule.sql_code
        .replace(/\{SOURCE_DATABASE_NAME\}/g, cde.source_database_name)
        .replace(/\{SOURCE_TABLE_NAME\}/g,    cde.source_table_name)
        .replace(/\{SOURCE_FIELD_NAME\}/g,    cde.source_field_name);

      if (rule.sql_code.indexOf('{SOURCE_DATABASE_NAME}') === -1)
        reasons.push('Missing placeholder {SOURCE_DATABASE_NAME} in sql_code');
      if (rule.sql_code.indexOf('{SOURCE_TABLE_NAME}') === -1)
        reasons.push('Missing placeholder {SOURCE_TABLE_NAME} in sql_code');
      if (rule.sql_code.indexOf('{SOURCE_FIELD_NAME}') === -1)
        reasons.push('Missing placeholder {SOURCE_FIELD_NAME} in sql_code');

      if (!substituted.trim())
        reasons.push('SQL is empty after field substitution');

      let sqCount = 0, dqCount = 0, parenDepth = 0;
      for (let i = 0; i < substituted.length; i++) {
        const ch = substituted[i];
        if      (ch === "'") sqCount++;
        else if (ch === '"') dqCount++;
        else if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
      }
      if (sqCount % 2 !== 0) reasons.push('Unbalanced single quotes in sql_code');
      if (dqCount % 2 !== 0) reasons.push('Unbalanced double quotes in sql_code');
      if (parenDepth !== 0)  reasons.push('Unbalanced parentheses in sql_code');
    }

    if (reasons.length > 0) {
      excluded.push({ allocation: alloc, rule, cde, cds, reasons });
    } else {
      included.push(alloc);
    }
  }

  return {
    included,
    excluded,
    totalEvaluated: included.length + excluded.length,
  };
}

// -----------------------------------------------------------------------
// buildUploaderReceipt(excluded, totalEvaluated)
// -----------------------------------------------------------------------
// Builds a JSON Blob documenting every excluded allocation with full CDE
// details and the specific reason(s) for exclusion.
// Called only when excluded.length > 0.
// -----------------------------------------------------------------------
function buildUploaderReceipt(excluded, totalEvaluated) {
  const receipt = {
    _type:            'uploader_exclusion_receipt',
    _generated_at:    new Date().toISOString(),
    _total_evaluated: totalEvaluated,
    _total_included:  totalEvaluated - excluded.length,
    _total_excluded:  excluded.length,
    excluded_allocations: excluded.map(item => ({
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
      reasons:                         item.reasons,
    })),
  };
  return new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
}
