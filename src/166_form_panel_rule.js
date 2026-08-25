// ===============================================================================
// RULE FORM PANEL -- Add / Edit Data Quality Rule
// SQL validation: sql_code must contain a SELECT statement.
// ===============================================================================

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

function RuleFormPanel({ record, onSave, onClose, data }) {
  const isEdit = (data?.data_quality_rule || []).some(r => r.data_quality_rule_id === record?.data_quality_rule_id);
  const accent = 'var(--green)';

  const [values, setValues] = useState({ ...record });
  const [errors, setErrors] = useState({});
  const [aiBtnCopied, setAiBtnCopied] = useState(false);

  const set = (field, val) => {
    setValues(prev => ({ ...prev, [field]: val }));
    setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const errs = {};
    if (!values.rule_name?.trim()) {
      errs.rule_name = 'Required';
    }
    if (!values.sql_code?.trim()) {
      errs.sql_code = 'Required';
    } else if (!values.sql_code.toUpperCase().includes('SELECT')) {
      errs.sql_code = 'SQL must contain a SELECT statement';
    }
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const saved = {
      ...values,
      automated: !!values.automated,
      retiring_timestamp: null,
    };
    onSave(saved);
  };

  const ruleSqlWarnings = useMemo(() => {
    if (!values.sql_code) return [];
    return computeRuleSqlWarnings(values.sql_code, values.sql_code_sample);
  }, [values.sql_code, values.sql_code_sample]);

  const ibs = (err) => ({
    width: '100%', padding: '7px 10px', fontSize: 13, background: 'var(--bg3)',
    border: `1px solid ${err ? 'var(--red)' : 'var(--border)'}`,
    borderRadius: 'var(--radius)', color: 'var(--text)',
    fontFamily: 'var(--sans)', outline: 'none',
  });

  const ErrMsg = ({ msg }) => !msg ? null : (
    <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}><Icon.Warning/></span>
      {msg}
    </div>
  );

  const Lbl = ({ text, required, err }) => (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 600,
      color: err ? 'var(--red)' : 'var(--text2)', marginBottom: 4, letterSpacing: '0.03em' }}>
      {text}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}
    </label>
  );

  return (
    <FormShell
      title={isEdit ? 'Edit Rule' : 'Add Rule'}
      subtitle="Data Quality Rule"
      accent={accent}
      saveLabel={isEdit ? 'Save' : 'Add'}
      onSave={handleSave}
      onClose={onClose}>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Name" required={true} err={!!errors.rule_name}/>
        <input type="text" value={values.rule_name ?? ''} style={ibs(!!errors.rule_name)}
          onChange={e => set('rule_name', e.target.value || null)}/>
        <ErrMsg msg={errors.rule_name}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Explanation" required={false} err={false}/>
        <textarea value={values.rule_explanation ?? ''} rows={3}
          onChange={e => set('rule_explanation', e.target.value || null)}
          style={{ ...ibs(false), resize: 'vertical', lineHeight: 1.5 }}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="SQL code" required={true} err={!!errors.sql_code}/>
        <textarea value={values.sql_code ?? ''} rows={8}
          onChange={e => set('sql_code', e.target.value || null)}
          style={{ ...ibs(!!errors.sql_code), resize: 'vertical', lineHeight: 1.5,
            fontFamily: 'var(--mono)', fontSize: 12 }}/>
        <ErrMsg msg={errors.sql_code}/>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Lbl text="SQL sample" required={false} err={false}/>
        <textarea value={values.sql_code_sample ?? ''} rows={4}
          onChange={e => set('sql_code_sample', e.target.value || null)}
          style={{ ...ibs(false), resize: 'vertical', lineHeight: 1.5,
            fontFamily: 'var(--mono)', fontSize: 12 }}/>
      </div>

      <RuleSqlWarningNotices warnings={ruleSqlWarnings} hint="Correct the issues above before running the DQ Engine." />

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

      <div style={{ marginBottom: 12 }}>
        <Lbl text="Automated" required={false} err={false}/>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <div className="toggle">
            <input type="checkbox" checked={!!values.automated}
              onChange={e => set('automated', e.target.checked)}/>
            <div className="toggle-track"/>
            <div className="toggle-thumb"/>
          </div>
          <span style={{ fontSize: 13, color: values.automated ? 'var(--text)' : 'var(--text3)' }}>
            {values.automated ? 'Yes' : 'No'}
          </span>
        </label>
      </div>

    </FormShell>
  );
}
