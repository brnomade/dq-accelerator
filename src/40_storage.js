function tableToCSV(tableName, data, includeSoftDeleted = false) {
  const schema = SCHEMA[tableName];
  if (!schema) return '';
  const cols = schema.cols;
  const rows = data[tableName] || [];

  const filtered = includeSoftDeleted
    ? rows
    : rows.filter(r => !r.retiring_timestamp);

  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = cols.map(c => c.name).join(',');
  const dataRows = filtered.map(row =>
    cols.map(c => escape(row[c.name])).join(',')
  );
  return [header, ...dataRows].join('\n');
}

async function buildAllCSVsBlob(data, includeSoftDeleted = false) {
  const zip = new JSZip();
  const ts = new Date().toISOString().replace(/[:\-T.Z]/g,'').slice(0,14);
  const folder = zip.folder(`dq_export_${ts}`);
  for (const tableName of Object.keys(SCHEMA)) {
    folder.file(`${tableName}.csv`, tableToCSV(tableName, data, includeSoftDeleted));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: `dq_export_${ts}.zip` };
}

async function saveWithPicker(blob, filename, description, ext) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept: { [blob.type]: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  return true;
}

function exportSingleCSV(tableName, data, includeSoftDeleted = false) {
  const csv = tableToCSV(tableName, data, includeSoftDeleted);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tableName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===============================================================================
// TASK 1 -- GLOBAL STATE CONTEXT (provided directly by root App)
// ===============================================================================
