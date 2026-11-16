/* ═══════════════════════════════════════════════════════════════
   Mercronos · importar-exportar.js
   Importação CSV/JSON e exportação JSON/CSV
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
let importData = null;

function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('import-drop').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processImportFile(file);
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (file) processImportFile(file);
}

function processImportFile(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      if (file.name.endsWith('.json')) {
        importData = JSON.parse(ev.target.result);
        showImportPreview(Array.isArray(importData) ? importData : importData.activities || []);
      } else {
        // CSV
        const lines = ev.target.result.split('\n').filter(l=>l.trim());
        const headers = lines[0].split(',').map(h=>h.trim().toLowerCase());
        importData = lines.slice(1).map(line => {
          const vals = line.split(',').map(v=>v.trim().replace(/^"|"$/g,''));
          const obj  = {};
          headers.forEach((h,i) => obj[h]=vals[i]||'');
          return {
            id: uid(),
            project:     obj.projeto||obj.project||'',
            description: obj.titulo||obj.title||obj.description||'',
            responsible: obj.responsavel||obj.responsible||'',
            startDate:   obj.inicio||obj.start||'',
            dueDate:     obj.termino||obj.end||obj.due||'',
            status:      obj.status||'Pendente',
            progress:    parseInt(obj.progresso||obj.progress||0)||0,
            isCritical:  false, obs:'', duration:''
          };
        }).filter(a=>a.description);
        showImportPreview(importData);
      }
    } catch(e) {
      toast('Erro ao ler arquivo: '+e.message, 'error');
    }
  };
  reader.readAsText(file);
}

function showImportPreview(data) {
  const preview = document.getElementById('import-preview');
  const content = document.getElementById('import-preview-content');
  preview.style.display = 'block';
  content.innerHTML = `<div style="font-size:.75rem;color:var(--text-3);margin-bottom:6px">${data.length} atividade(s) encontradas</div>` +
    data.slice(0,5).map(a=>`<div style="font-size:.72rem;padding:4px 8px;background:var(--surface2);border-radius:4px;margin-bottom:3px;display:flex;gap:8px">
      <span style="font-weight:600;color:var(--text-1)">${esc(a.description)}</span>
      <span style="color:var(--text-4)">${esc(a.project)}</span>
      <span style="color:var(--text-4)">${esc(a.dueDate)}</span>
    </div>`).join('') +
    (data.length>5?`<div style="font-size:.68rem;color:var(--text-4);margin-top:4px">...e mais ${data.length-5}</div>`:'');
}

function confirmImport() {
  if (!importData) return;
  const data = Array.isArray(importData) ? importData : importData.activities || [];
  data.forEach(a => { if (!a.id) a.id = uid(); activities.push(a); });
  save(); renderAll();
  document.getElementById('import-preview').style.display = 'none';
  importData = null;
  toast(`✓ ${data.length} atividade(s) importadas!`, 'success');
  addHistory('import', `${data.length} atividades importadas`);
}

function cancelImport() {
  importData = null;
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('import-file').value = '';
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({activities,projects},null,2)], {type:'application/json'});
  dlBlob(blob, 'mercronos-backup.json');
  toast('✓ Backup exportado', 'success');
}

function exportCSV() {
  const header = 'projeto,titulo,responsavel,inicio,termino,status,progresso';
  const rows = activities.map(a => [a.project,a.description,a.responsible,a.startDate,a.dueDate,a.status,a.progress].map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(','));
  const blob = new Blob([[header,...rows].join('\n')], {type:'text/csv'});
  dlBlob(blob, 'mercronos-atividades.csv');
  toast('✓ CSV exportado', 'success');
}

function dlBlob(blob, name) {
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
}
