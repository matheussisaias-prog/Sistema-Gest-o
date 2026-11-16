/* ═══════════════════════════════════════════════════════════════
   Mercronos · importar-pdf-ia.js
   Importação de cronograma em PDF lido pela IA
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   IMPORTAR / EXPORTAR
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   PDF → IA IMPORT
══════════════════════════════════════════════════ */
let pdfBase64 = null;
let pdfAtividades = [];

// (a chave da IA salva é carregada no fim de assistente-ia.js, depois de iaSanitizarApiKey existir)

function switchImportTab(tab) {
  ['csv','pdf'].forEach(t => {
    document.getElementById('tab-'+t)?.classList.toggle('active', t===tab);
    document.getElementById('panel-'+t)?.classList.toggle('active', t===tab);
  });
  // Carregar API key ao abrir aba PDF
  if (tab === 'pdf') {
    const saved = localStorage.getItem('tf_apikey');
    const el = document.getElementById('pdf-api-key');
    if (el && saved) el.value = saved;
  }
}

function onPdfDrop(e) {
  e.preventDefault();
  document.getElementById('pdf-drop').classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) onPdfFileSelect(file);
}

function onPdfFileSelect(file) {
  if (!file || file.type !== 'application/pdf') {
    toast('Selecione um arquivo PDF', 'error'); return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    pdfBase64 = e.target.result.split(',')[1];
    document.getElementById('pdf-drop').classList.add('loaded');
    document.getElementById('pdf-drop').querySelector('i').className = 'fa-solid fa-circle-check';
    document.getElementById('pdf-drop-title').textContent = file.name;
    document.getElementById('pdf-drop-sub').textContent = (file.size/1024).toFixed(0) + ' KB · pronto para análise';
    document.getElementById('btn-ia-extract').disabled = false;
  };
  reader.readAsDataURL(file);
}

async function extrairPdfComIA() {
  const apiKey = iaSanitizarApiKey(document.getElementById('pdf-api-key')?.value || iaGetApiKey());
  if (!apiKey) { toast('Informe a API Key da Anthropic', 'error'); return; }
  if (!apiKey.startsWith('sk-ant-')) {
    toast('⚠️ Chave inválida? Deve começar com sk-ant-...', 'error');
    // Não bloqueia — tenta mesmo assim (pode ser formato novo)
  }
  if (!pdfBase64) { toast('Carregue um PDF primeiro', 'error'); return; }

  document.getElementById('btn-ia-extract').disabled = true;
  document.getElementById('ia-loading-bar').style.display = 'block';
  document.getElementById('ia-status').style.display = 'flex';
  document.getElementById('ia-status-text').textContent = 'Analisando cronograma com IA...';
  document.getElementById('pdf-preview').style.display = 'none';

  const prompt = `Você é especialista em gerenciamento de projetos.

Analise este PDF de cronograma de projeto e extraia TODAS as atividades/tarefas.

Retorne APENAS um JSON válido (sem markdown, sem texto extra):

{
  "projeto": "Nome do projeto",
  "atividades": [
    {
      "titulo": "Nome da atividade",
      "inicio": "YYYY-MM-DD",
      "termino": "YYYY-MM-DD",
      "status": "Concluído|Em Andamento|Pendente",
      "progresso": 0
    }
  ]
}

Regras:
- Datas em YYYY-MM-DD (use 2026 se o ano não aparecer)
- status: "Concluído" para 100%/Finalizadas, "Em Andamento" para progresso > 0, "Pendente" para 0%/Novas
- progresso: inteiro 0-100
- Inclua TODAS as tarefas (pai e filho)
- Retorne SÓ o JSON`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':            'application/json',
        'x-api-key':               apiKey,
        'anthropic-version':       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(iaTraduzirErro(res.status, err.error?.message));
    }

    const data    = await res.json();
    const texto   = data.content.find(b => b.type === 'text')?.text || '';
    const jsonStr = texto.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
    const resultado = JSON.parse(jsonStr);

    pdfAtividades = (resultado.atividades || []).map(a => ({
      id:          uid(),
      project:     resultado.projeto || 'Projeto',
      description: a.titulo || '',
      responsible: '',
      startDate:   a.inicio || '',
      dueDate:     a.termino || '',
      status:      a.status || 'Pendente',
      progress:    parseInt(a.progresso) || 0,
      isCritical:  false, obs: '', duration: ''
    })).filter(a => a.description);

    if (!pdfAtividades.length) throw new Error('Nenhuma atividade encontrada');

    showPdfPreview(pdfAtividades);
    toast('✓ ' + pdfAtividades.length + ' atividades extraídas!', 'success');

  } catch(err) {
    document.getElementById('ia-status-text').textContent = 'Erro: ' + err.message;
    toast('Erro: ' + err.message, 'error');
  } finally {
    document.getElementById('ia-loading-bar').style.display = 'none';
    document.getElementById('btn-ia-extract').disabled = false;
    if (!document.getElementById('ia-status-text').textContent.startsWith('Erro')) {
      document.getElementById('ia-status').style.display = 'none';
    }
  }
}

function showPdfPreview(data) {
  const preview = document.getElementById('pdf-preview');
  const content = document.getElementById('pdf-preview-content');
  document.getElementById('pdf-preview-count').textContent = data.length + ' atividade(s) encontradas';
  preview.style.display = 'block';

  content.innerHTML = data.slice(0, 6).map(a =>
    `<div style="font-size:.7rem;padding:5px 8px;background:var(--surface2);border-radius:4px;margin-bottom:3px;display:flex;gap:8px;align-items:center">
      <span style="font-weight:600;color:var(--text-1);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.description)}</span>
      <span style="color:var(--text-4);white-space:nowrap">${esc(a.startDate)}</span>
      <span style="color:var(--text-4);white-space:nowrap">${a.progress}%</span>
    </div>`
  ).join('') +
  (data.length > 6 ? `<div style="font-size:.67rem;color:var(--text-4);margin-top:4px">...e mais ${data.length-6} atividades</div>` : '');
}

function confirmPdfImport() {
  if (!pdfAtividades.length) return;
  pdfAtividades.forEach(a => activities.push(a));
  save(); renderAll();
  addHistory('import', pdfAtividades.length + ' atividades importadas via PDF/IA');
  toast('✓ ' + pdfAtividades.length + ' atividade(s) importadas!', 'success');
  cancelPdfImport();
}

function cancelPdfImport() {
  pdfAtividades = [];
  pdfBase64 = null;
  document.getElementById('pdf-preview').style.display = 'none';
  document.getElementById('pdf-drop').classList.remove('loaded');
  document.getElementById('pdf-drop').querySelector('i').className = 'fa-solid fa-file-pdf';
  document.getElementById('pdf-drop-title').textContent = 'Arraste o PDF do cronograma aqui';
  document.getElementById('pdf-drop-sub').textContent = 'Gantt, EAP, planilhas de projeto...';
  document.getElementById('btn-ia-extract').disabled = true;
  document.getElementById('pdf-file-input').value = '';
  document.getElementById('ia-status').style.display = 'none';
}
