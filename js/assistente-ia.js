/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · assistente-ia.js
   Assistente de IA: chat, anotações, duplicatas e prévia de atividades
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   ASSISTENTE IA — CHAT + PREVIEW DE ATIVIDADES
══════════════════════════════════════════════════ */

/* ── Arquivo anexado no chat ──────────────────── */

/* ── Sanitização da API Key ──────────────────────
   Remove caracteres invisíveis e não-ASCII que
   quebram o header HTTP (ISO-8859-1 obrigatório)
────────────────────────────────────────────────── */
function iaSanitizarApiKey(raw) {
  if (!raw) return '';
  return raw
    .trim()
    // Remove caracteres invisíveis: zero-width space, BOM, soft hyphen, etc.
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u180E]/g, '')
    // Remove aspas "inteligentes" que o Word/PDF coloca
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Mantém só caracteres ASCII imprimíveis (32-126) que são ISO-8859-1 válidos
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function iaGetApiKey() {
  const raw = localStorage.getItem('tf_apikey') || '';
  return iaSanitizarApiKey(raw);
}

/**
 * iaTraduzirErro(status, mensagemApi)
 * Converte erros da API Anthropic em mensagens amigáveis em PT-BR.
 */
function iaTraduzirErro(status, mensagemApi = '') {
  const msg = String(mensagemApi).toLowerCase();
  if (status === 401 || msg.includes('authentication') || msg.includes('invalid api key') || msg.includes('invalid x-api-key'))
    return '🔑 API Key inválida. Verifique se colou a chave correta em Importar → PDF com IA.';
  if (status === 403)
    return '🚫 Acesso negado. Sua API Key não tem permissão para este modelo.';
  if (status === 404)
    return '❓ Modelo não encontrado. O ID do modelo pode estar desatualizado.';
  if (status === 400 && (msg.includes('credit') || msg.includes('balance')))
    return '💳 Créditos insuficientes na sua conta Anthropic. Recarregue em console.anthropic.com.';
  if (status === 400)
    return '⚠️ Requisição inválida: ' + (mensagemApi || 'formato incorreto.');
  if (status === 429)
    return '⏳ Limite de requisições excedido. Aguarde alguns segundos e tente de novo.';
  if (status === 529 || status === 503)
    return '🔧 Servidores da Anthropic sobrecarregados agora. Tente novamente em instantes.';
  if (status === 500 || status === 502)
    return '🛠️ Erro interno na Anthropic. Tente de novo em alguns segundos.';
  if (status === 0 || msg.includes('failed to fetch') || msg.includes('network'))
    return '📡 Sem conexão com a API. Verifique sua internet.';
  return '❌ Erro ' + (status || '') + ': ' + (mensagemApi || 'falha desconhecida');
}

let iaChatAnexo = null; // { tipo, nome, conteudo, mediaType }

async function iaAnexarArquivo(file) {
  if (!file) return;

  const maxMB = 5;
  if (file.size > maxMB * 1024 * 1024) {
    toast('Arquivo muito grande (máx ' + maxMB + 'MB)', 'error'); return;
  }

  const ext = file.name.split('.').pop().toLowerCase();
  const tipos = { pdf:'document', txt:'text', csv:'text', png:'image', jpg:'image', jpeg:'image' };
  if (!tipos[ext]) { toast('Tipo não suportado. Use PDF, TXT, CSV, PNG ou JPG', 'error'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    const resultado = e.target.result;
    if (ext === 'txt' || ext === 'csv') {
      iaChatAnexo = { tipo: 'text', nome: file.name, conteudo: resultado, mediaType: null };
    } else if (ext === 'pdf') {
      iaChatAnexo = { tipo: 'document', nome: file.name, conteudo: resultado.split(',')[1], mediaType: 'application/pdf' };
    } else {
      const mt = ext === 'png' ? 'image/png' : 'image/jpeg';
      iaChatAnexo = { tipo: 'image', nome: file.name, conteudo: resultado.split(',')[1], mediaType: mt };
    }

    // Mostra preview
    document.getElementById('ia-file-preview-bar').style.display  = 'flex';
    document.getElementById('ia-file-preview-name').textContent   = file.name;
    document.getElementById('ia-file-input-chat').value           = '';
    toast('📎 ' + file.name + ' pronto para enviar', 'success');
  };

  if (ext === 'txt' || ext === 'csv') reader.readAsText(file);
  else reader.readAsDataURL(file);
}

function iaRemoverArquivo() {
  iaChatAnexo = null;
  document.getElementById('ia-file-preview-bar').style.display = 'none';
  document.getElementById('ia-file-preview-name').textContent  = '';
  document.getElementById('ia-file-input-chat').value          = '';
}

/* ── Anotações nas atividades ─────────────────── */
let iaNoteTargetId = null;

function iaAbrirNota(id) {
  const at = iaAtividadesGeradas.find(a => a.id === id);
  if (!at) return;
  iaNoteTargetId = id;
  document.getElementById('ia-note-modal-sub').textContent = at.description;
  document.getElementById('ia-note-textarea').value        = at.obs || '';
  document.getElementById('ia-note-modal-backdrop').classList.add('open');
  setTimeout(() => document.getElementById('ia-note-textarea').focus(), 80);
}

function iaNoteFechar(e) {
  if (e && e.target !== document.getElementById('ia-note-modal-backdrop')) return;
  document.getElementById('ia-note-modal-backdrop').classList.remove('open');
  iaNoteTargetId = null;
}

function iaNoteSalvar() {
  if (!iaNoteTargetId) return;
  const idx = iaAtividadesGeradas.findIndex(a => a.id === iaNoteTargetId);
  if (idx < 0) return;
  const nota = document.getElementById('ia-note-textarea').value.trim();
  iaAtividadesGeradas[idx].obs = nota;
  document.getElementById('ia-note-modal-backdrop').classList.remove('open');
  iaNoteTargetId = null;
  // Re-renderiza o preview para atualizar indicador
  iaRefreshPreview();
  toast('📝 Anotação salva', 'success');
}

function iaRefreshPreview() {
  if (!iaAtividadesGeradas.length) return;
  // Chama render com os dados atuais sem adicionar novos
  const projeto = iaAtividadesGeradas[0]?.project || 'Projeto';
  iaRenderPreviewDados(iaAtividadesGeradas, projeto);
}

/* ══════════════════════════════════════════════════
   DETECÇÃO DE DUPLICATAS
══════════════════════════════════════════════════ */

/**
 * iaDetectarDuplicatas(novas)
 * Compara lista de atividades novas com as existentes no TaskFlow.
 * Retorna { exatas, parciais, conflitos, novas }
 */
function iaDetectarDuplicatas(novas) {
  const existentes = (typeof activities !== 'undefined') ? activities : [];
  const resultado  = { exatas: [], parciais: [], conflitos: [], novas: [] };

  // Normaliza string para comparação
  const norm = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  novas.forEach(nova => {
    const nNova = norm(nova.description || '');
    let foiDuplicata = false;

    existentes.forEach(ex => {
      const nEx = norm(ex.description || '');
      if (!nNova || !nEx) return;

      // Duplicata exata
      if (nNova === nEx) {
        resultado.exatas.push({ nova: nova.description, existente: ex.description, id: ex.id });
        foiDuplicata = true;
        return;
      }

      // Similaridade (uma contém a outra ou distância curta)
      const sim = iaSimilaridade(nNova, nEx);
      if (sim >= 0.80 && sim < 1.0) {
        resultado.parciais.push({
          nova: nova.description, existente: ex.description,
          similaridade: Math.round(sim * 100), id: ex.id
        });
        foiDuplicata = true;
        return;
      }

      // Conflito de data no mesmo projeto
      if (nova.project === ex.project && nova.startDate && ex.startDate) {
        const ni = new Date(nova.startDate), nf = new Date(nova.dueDate || nova.startDate);
        const ei = new Date(ex.startDate),  ef = new Date(ex.dueDate  || ex.startDate);
        if (ni <= ef && nf >= ei && nova.responsible && ex.responsible && nova.responsible === ex.responsible) {
          resultado.conflitos.push({
            nova: nova.description, existente: ex.description,
            motivo: `Mesmo responsável (${nova.responsible}) no período ${nova.startDate} → ${nova.dueDate}`
          });
        }
      }
    });

    if (!foiDuplicata && !resultado.exatas.find(e => e.nova === nova.description)
        && !resultado.parciais.find(e => e.nova === nova.description)) {
      resultado.novas.push(nova.description);
    }
  });

  return resultado;
}

/**
 * iaSimilaridade(a, b) — coeficiente de Jaccard por bigramas
 */
function iaSimilaridade(a, b) {
  const bigramas = s => new Set([...s].map((c,i) => s.slice(i,i+2)).filter(g => g.length===2));
  const A = bigramas(a), B = bigramas(b);
  if (!A.size && !B.size) return 1;
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter(g => B.has(g)).length;
  return inter / (A.size + B.size - inter);
}

/**
 * iaRenderDuplicatasBanner(resultado)
 * Exibe banner de aviso no preview quando há duplicatas
 */
function iaRenderDuplicatasBanner(resultado) {
  // Remove banner anterior
  document.getElementById('ia-dup-banner')?.remove();

  const total = resultado.exatas.length + resultado.parciais.length + resultado.conflitos.length;
  if (!total) return;

  const body = document.getElementById('ia-preview-body');
  if (!body) return;

  const banner = document.createElement('div');
  banner.className = 'ia-dup-banner';
  banner.id = 'ia-dup-banner';

  let html = `<div class="ia-dup-banner-icon">⚠️</div>
    <div class="ia-dup-banner-body">
      <div class="ia-dup-banner-title">${total} problema(s) detectado(s)</div>
      <ul class="ia-dup-banner-list">`;

  resultado.exatas.forEach(d =>
    html += `<li>🔴 <b>Duplicata exata:</b> "${d.nova}" já existe no TaskFlow</li>`
  );
  resultado.parciais.forEach(d =>
    html += `<li>🟡 <b>Muito similar (${d.similaridade}%):</b> "${d.nova}" ≈ "${d.existente}"</li>`
  );
  resultado.conflitos.forEach(d =>
    html += `<li>🟠 <b>Conflito de agenda:</b> "${d.nova}" — ${d.motivo}</li>`
  );

  html += `</ul>
      <div style="margin-top:6px;font-size:.67rem;color:var(--text-3)">
        Revise os cards marcados antes de importar. Atividades novas: ${resultado.novas.length}
      </div>
    </div>`;

  banner.innerHTML = html;
  body.insertBefore(banner, body.firstChild);
}

/**
 * iaParseDuplicatasIA(resposta)
 * Extrai o bloco ===DUPLICATAS=== da resposta da IA (quando ela detecta)
 */
function iaParseDuplicatasIA(resposta) {
  const match = resposta.match(/===DUPLICATAS===([\s\S]*?)===FIM_DUPLICATAS===/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch { return null; }
}

let iaChatHistory  = [];   // histórico da conversa (role/content)
let iaAtividadesGeradas = []; // atividades no preview
let iaIsTyping     = false;

/* ── Gestão de histórico (pontos 3, 4, 5) ─────────────
 * 3) Remove arquivos (base64) de mensagens antigas antes de enviar
 *    → só a última mensagem do usuário carrega o arquivo
 * 4) Limita o histórico enviado às últimas IA_MAX_TURNS mensagens
 * 5) Persiste histórico em localStorage (sobrevive ao F5)
 */
const IA_MAX_TURNS      = 20;              // nº máximo de mensagens mantidas
const IA_HISTORY_KEY    = 'tf_ia_history'; // chave do localStorage

function iaSalvarHistorico() {
  try {
    // Não salva blocos binários pesados — guarda só texto legível
    const leve = iaChatHistory.map(m => ({
      role: m.role,
      content: iaStripAnexos(m.content)
    }));
    localStorage.setItem(IA_HISTORY_KEY, JSON.stringify(leve));
  } catch(e) { console.warn('Falha ao salvar histórico IA:', e); }
}

function iaCarregarHistorico() {
  try {
    const raw = localStorage.getItem(IA_HISTORY_KEY);
    if (raw) iaChatHistory = JSON.parse(raw) || [];
  } catch(e) { iaChatHistory = []; }
}

function iaLimparHistorico() {
  iaChatHistory = [];
  localStorage.removeItem(IA_HISTORY_KEY);
  const wrap = document.getElementById('ia-chat-messages');
  if (wrap) wrap.innerHTML = '';
  iaInitChat();
}

function iaConfirmarLimpar() {
  if (iaChatHistory.length === 0) {
    if (typeof toast === 'function') toast('Conversa já está vazia', 'info');
    return;
  }
  if (confirm('Apagar toda a conversa com o assistente? Isso não pode ser desfeito.')) {
    iaLimparHistorico();
    if (typeof toast === 'function') toast('Conversa limpa', 'success');
  }
}

/**
 * iaStripAnexos(content)
 * Remove blocos pesados (document/image base64) e retorna só o texto.
 * Usado para: (a) salvar histórico leve no localStorage,
 *             (b) enviar mensagens antigas sem reenviar o arquivo.
 */
function iaStripAnexos(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content))     return String(content ?? '');
  return content
    .map(p => {
      if (p.type === 'text')     return p.text;
      if (p.type === 'document') return '[arquivo PDF anexado anteriormente]';
      if (p.type === 'image')    return '[imagem anexada anteriormente]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * iaPrepararMessagesParaEnvio()
 * Monta a lista de mensagens que vai na requisição:
 * - Mantém a ÚLTIMA mensagem intacta (com arquivo se houver)
 * - Strippa arquivos de todas as mensagens anteriores
 * - Corta para as últimas IA_MAX_TURNS
 */
function iaPrepararMessagesParaEnvio() {
  const recorte = iaChatHistory.slice(-IA_MAX_TURNS);
  const ultimoIdx = recorte.length - 1;
  return recorte.map((m, i) => {
    if (i === ultimoIdx) return m; // última mensagem: envia como está
    return { role: m.role, content: iaStripAnexos(m.content) };
  });
}

/**
 * iaGerarSystemPrompt()
 * Gera o system prompt dinamicamente incluindo TODOS os dados
 * atuais do TaskFlow (projetos + atividades) para a IA ter
 * contexto completo desde a primeira mensagem.
 */
function iaGerarSystemPrompt() {
  // ── Coleta dados atuais do TaskFlow ──────────────
  const todasAtividades = (typeof activities !== 'undefined') ? activities : [];
  const todosProjetos   = (typeof projects   !== 'undefined') ? projects   : [];

  // Resume projetos
  const projetosResumo = todosProjetos.length
    ? todosProjetos.map(p => `  • ${p.name || p.id}`).join('\n')
    : '  (nenhum projeto cadastrado)';

  // Resume atividades agrupadas por projeto
  const porProjeto = {};
  todasAtividades.forEach(a => {
    const proj = a.project || 'Sem projeto';
    if (!porProjeto[proj]) porProjeto[proj] = [];
    porProjeto[proj].push(a);
  });

  let atividadesResumo = '';
  if (!todasAtividades.length) {
    atividadesResumo = '  (nenhuma atividade cadastrada ainda)';
  } else {
    for (const [proj, lista] of Object.entries(porProjeto)) {
      atividadesResumo += `\n  [${proj}] — ${lista.length} atividade(s):\n`;
      lista.forEach(a => {
        const pct  = a.progress ?? 0;
        const ini  = a.startDate || '?';
        const fim  = a.dueDate   || '?';
        const resp = a.responsible ? ` | resp: ${a.responsible}` : '';
        const obs  = a.obs ? ` | obs: "${a.obs}"` : '';
        atividadesResumo += `    - [${a.status || 'Pendente'}] ${a.description} (${ini} → ${fim}, ${pct}%${resp}${obs})\n`;
      });
    }
  }

  const totalAtiv  = todasAtividades.length;
  const concluidas = todasAtividades.filter(a => a.status === 'Concluído').length;
  const andamento  = todasAtividades.filter(a => a.status === 'Em Andamento').length;
  const pendentes  = todasAtividades.filter(a => a.status === 'Pendente').length;
  const progMedio  = totalAtiv
    ? Math.round(todasAtividades.reduce((s,a) => s + (a.progress||0), 0) / totalAtiv)
    : 0;

  return `Você é o assistente oficial do TaskFlow PRO — um sistema de gerenciamento de projetos. Você ajuda o usuário de DUAS formas: (1) tirando dúvidas sobre o próprio sistema (como usar, onde fica cada coisa) e (2) analisando/criando dados de projetos dele.

════════════════════════════════════════
SOBRE O TASKFLOW PRO (conheça o sistema)
════════════════════════════════════════

O TaskFlow PRO tem as seguintes seções (abas no menu lateral):

• **Dashboard** — visão geral: KPIs, gráficos resumidos, atividades recentes
• **Atividades** — lista completa de tarefas com filtros, status, datas, responsáveis, % de conclusão
• **Kanban** — board visual (Pendente / Em Andamento / Concluído) com drag-and-drop
• **Projetos** — gestão dos projetos: criar, editar, pastas personalizadas, baseline (planejado vs real)
• **Equipe** — cadastro de membros, alocação, detecção de conflitos de agenda
• **Gráficos** — análises visuais detalhadas (Chart.js)
• **Gantt** — cronograma hierárquico com WBS numerado, barras de progresso e subatividades (ainda sem dependências entre tarefas)
• **Portfólio** — timeline consolidada de todos os projetos
• **Recursos** — heatmap de alocação da equipe, identifica sobrecarga
• **Calendário de Atividades** / **Calendário da Equipe** — visões mensais com barras multi-dia
• **Importar / Exportar** — importação via PDF com IA, CSV, JSON; exportação em vários formatos
• **Histórico** — log de alterações
• **Assistente IA** (você) — chat para análises, criação e organização
• **Relatório PDF** — gera relatórios executivos em PDF

RECURSOS ESPECIAIS que o usuário pode usar:
- **Importação de PDF com IA** — você lê um PDF e extrai atividades automaticamente
- **Calculadora de horas úteis** — considera feriados brasileiros
- **Detecção de conflitos** — avisa quando um responsável tem tarefas sobrepostas
- **Anotações em atividades** — notas por tarefa (anexar arquivos ainda não existe)
- **Detecção de duplicatas** — ao importar, evita atividades repetidas
- **API Key** da Anthropic fica salva em Importar → PDF com IA (campo reutilizado por este chat)

COMO RESPONDER DÚVIDAS SOBRE O SISTEMA:
- Se o usuário perguntar "onde vejo X?" ou "como faço Y?", responda indicando a aba exata (ex: "Vai em Gantt no menu lateral...")
- Se ele perguntar sobre um recurso que existe, explique de forma objetiva
- Se for algo que o sistema NÃO tem, diga isso claramente e sugira uma alternativa dentro do que existe
- Seja direto e em português brasileiro

════════════════════════════════════════
CONTEXTO ATUAL DO TASKFLOW (dados do usuário)
════════════════════════════════════════

PROJETOS CADASTRADOS:
${projetosResumo}

RESUMO GERAL:
  • Total de atividades : ${totalAtiv}
  • Concluídas          : ${concluidas}
  • Em andamento        : ${andamento}
  • Pendentes           : ${pendentes}
  • Progresso médio     : ${progMedio}%

TODAS AS ATIVIDADES (detalhes completos):
${atividadesResumo}
════════════════════════════════════════

Com base nesses dados, você pode:
- Responder perguntas sobre qualquer atividade ou projeto acima
- Analisar riscos, atrasos ou gargalos
- Sugerir melhorias no cronograma
- Criar novas atividades coerentes com o que já existe
- Redistribuir tarefas ou ajustar datas

REGRAS PARA CRIAÇÃO/EDIÇÃO DE ATIVIDADES:
Quando o usuário pedir para criar ou organizar atividades, SEMPRE retorne um JSON estruturado — e também uma resposta amigável em texto. Separe os dois com o marcador ===JSON===:

Resposta amigável aqui...

===JSON===
{
  "projeto": "Nome do projeto (use os existentes acima quando possível)",
  "atividades": [
    {
      "titulo": "Nome da atividade",
      "inicio": "YYYY-MM-DD",
      "termino": "YYYY-MM-DD",
      "status": "Pendente|Em Andamento|Concluído",
      "progresso": 0,
      "responsavel": ""
    }
  ]
}

Regras de datas:
- Hoje é: ${(() => { const d=new Date(); return d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}); })()}
- Data ISO de hoje: ${todayISO()}
- Use SEMPRE esta data como referência para "hoje", "amanhã", "semana que vem", "próximo mês" etc.
- Distribua atividades em sequência lógica
- Duração mínima 1 dia, máxima 30 dias

DETECÇÃO DE DUPLICATAS E CONFLITOS (OBRIGATÓRIO ao receber arquivos):
Sempre que o usuário enviar um arquivo (PDF, CSV, imagem) ou uma lista de atividades, você DEVE:
1. Comparar cada atividade nova com as existentes no CONTEXTO ATUAL DO TASKFLOW acima
2. Identificar DUPLICATAS EXATAS: mesmo nome (ou nome muito similar, ex: "INSTALAÇÃO" e "Instalação")
3. Identificar DUPLICATAS PARCIAIS: mesma atividade com datas/status diferentes
4. Identificar CONFLITOS: atividades que se sobrepõem no mesmo período do mesmo projeto
5. Identificar ATIVIDADES NOVAS: não existem no sistema

Ao detectar qualquer um dos casos acima, ADICIONE uma seção especial na sua resposta de texto:

===DUPLICATAS===
{
  "duplicatas_exatas": ["nome1", "nome2"],
  "duplicatas_parciais": [{"nova": "nome novo", "existente": "nome existente", "motivo": "explicação"}],
  "conflitos": [{"atividade": "nome", "conflito_com": "outra atividade", "motivo": "explicação"}],
  "novas": ["nome3", "nome4"]
}
===FIM_DUPLICATAS===

Regras gerais:
- Seja conciso e direto
- Se for só conversa ou análise, responda sem o bloco JSON
- Para ajustes, retorne O CONJUNTO COMPLETO atualizado
- Ao referenciar atividades existentes, use os nomes exatos do contexto acima`;
}

function iaInitChat() {
  // Carrega histórico persistido do localStorage (ponto 5)
  if (iaChatHistory.length === 0) {
    iaCarregarHistorico();
  }

  const wrap = document.getElementById('ia-chat-messages');

  // Se já há histórico carregado e a tela está vazia, re-renderiza
  if (iaChatHistory.length > 0 && wrap && wrap.children.length === 0) {
    iaChatHistory.forEach(m => {
      const texto = iaStripAnexos(m.content);
      iaAddMessage(m.role === 'user' ? 'user' : 'ia', texto);
    });
  }

  if (iaChatHistory.length === 0) {
    // Gera boas-vindas contextualizada com os dados reais
    const todasAtiv  = (typeof activities !== 'undefined') ? activities : [];
    const projetos   = (typeof projects   !== 'undefined') ? projects   : [];
    const total      = todasAtiv.length;
    const emAndamento= todasAtiv.filter(a => a.status === 'Em Andamento').length;
    const pendentes  = todasAtiv.filter(a => a.status === 'Pendente').length;
    const nProj      = projetos.length;

    let boasVindas = 'Olá! Sou seu assistente de projetos e já li todo o seu TaskFlow. 👋\n\n';

    if (total > 0) {
      boasVindas += `**Contexto carregado:**\n`;
      boasVindas += `• ${nProj} projeto(s) · ${total} atividade(s) no total\n`;
      if (emAndamento) boasVindas += `• ${emAndamento} em andamento\n`;
      if (pendentes)   boasVindas += `• ${pendentes} pendente(s)\n`;
      boasVindas += `\nPode me perguntar sobre qualquer atividade ou projeto — já sei tudo que está cadastrado.\n\n`;
    } else {
      boasVindas += 'Seu TaskFlow ainda está vazio. Posso ajudar a criar o primeiro projeto!\n\n';
    }

    boasVindas += 'O que deseja fazer?\n\n• Pergunte sobre uma atividade específica\n• Peça análise de riscos ou atrasos\n• Crie novas atividades ou projetos\n• Annexe um PDF para eu interpretar';

    iaAddMessage('ia', boasVindas);
  }

  // Atualiza subtítulo do header com contagem atual
  const subEl = document.getElementById('ia-chat-header-sub');
  if (subEl) {
    const t = (typeof activities !== 'undefined') ? activities.length : 0;
    const p = (typeof projects   !== 'undefined') ? projects.length   : 0;
    subEl.textContent = t > 0
      ? `${p} projeto(s) · ${t} atividade(s) carregadas`
      : 'Nenhuma atividade — pronto para criar';
  }
}

function iaKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    iaEnviar();
  }
}

function iaQuick(texto) {
  document.getElementById('ia-chat-input').value = texto;
  iaEnviar();
}

async function iaEnviar() {
  const input  = document.getElementById('ia-chat-input');
  const texto  = input.value.trim();
  if (!texto || iaIsTyping) return;

  // Pega API key do campo da aba PDF (reutiliza)
  const apiKey = iaGetApiKey();
  if (!apiKey) {
    iaAddMessage('ia', '⚠️ Você precisa informar sua API Key da Anthropic. Vá em **Importar → PDF com IA** e cole sua chave lá — ela fica salva automaticamente.');
    return;
  }

  // Mostra mensagem do usuário (com tag de arquivo se houver)
  const textoComTag = iaChatAnexo
    ? `<span class="ia-msg-file-tag"><i class="fa-solid fa-paperclip"></i> ${iaChatAnexo.nome}</span><br>${texto || '(arquivo enviado)'}`
    : texto;
  iaAddMessage('user', textoComTag, true);
  input.value = '';
  input.style.height = 'auto';
  iaRemoverArquivo(); // limpa arquivo após enviar

  // Monta conteúdo da mensagem (texto + arquivo opcional)
  let userContent;
  if (iaChatAnexo) {
    const partsContent = [];
    if (iaChatAnexo.tipo === 'text') {
      // Texto: inclui como parte do prompt
      partsContent.push({ type: 'text', text: (texto ? texto + '\n\n' : '') + '--- CONTEÚDO DO ARQUIVO: ' + iaChatAnexo.nome + ' ---\n' + iaChatAnexo.conteudo.slice(0, 12000) });
    } else if (iaChatAnexo.tipo === 'document') {
      if (texto) partsContent.push({ type: 'text', text: texto });
      partsContent.push({ type: 'document', source: { type: 'base64', media_type: iaChatAnexo.mediaType, data: iaChatAnexo.conteudo } });
    } else if (iaChatAnexo.tipo === 'image') {
      if (texto) partsContent.push({ type: 'text', text: texto });
      partsContent.push({ type: 'image', source: { type: 'base64', media_type: iaChatAnexo.mediaType, data: iaChatAnexo.conteudo } });
    }
    userContent = partsContent;
  } else {
    userContent = texto;
  }

  // Adiciona ao histórico (armazena só o texto para o histórico futuro)
  iaChatHistory.push({ role: 'user', content: userContent });
  iaSalvarHistorico();

  // Mostra typing
  iaIsTyping = true;
  document.getElementById('ia-send-btn').disabled = true;
  const typingEl = iaShowTyping();

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 3000,
        system:     iaGerarSystemPrompt(),  // sempre atualizado com dados atuais
        messages:   iaPrepararMessagesParaEnvio(),
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(iaTraduzirErro(res.status, err.error?.message));
    }

    const data      = await res.json();
    const resposta  = data.content.find(b => b.type === 'text')?.text || '';

    // Salva no histórico
    iaChatHistory.push({ role: 'assistant', content: resposta });
    iaSalvarHistorico();

    // Separa texto e JSON
    const partes = resposta.split('===JSON===');
    const textoMsg = partes[0].trim();
    const jsonPart = partes[1]?.trim();

    // Remove typing e mostra resposta
    typingEl.remove();
    iaAddMessage('ia', textoMsg);

    // Processa JSON se existir
    if (jsonPart) {
      try {
        const jsonStr  = jsonPart.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
        const resultado = JSON.parse(jsonStr);
        if (resultado.atividades?.length) {
          iaRenderPreview(resultado);
        }
      } catch(e) {
        console.warn('JSON parse error:', e);
      }
    }

    // Processa bloco de duplicatas vindo da IA (análise de arquivo)
    const dupIA = iaParseDuplicatasIA(resposta);
    if (dupIA) {
      const totalDup = (dupIA.duplicatas_exatas||[]).length
        + (dupIA.duplicatas_parciais||[]).length
        + (dupIA.conflitos||[]).length;
      if (totalDup > 0) {
        // Converte para formato do banner local
        const convertido = {
          exatas:    (dupIA.duplicatas_exatas||[]).map(n => ({ nova: n, existente: n })),
          parciais:  (dupIA.duplicatas_parciais||[]).map(d => ({ nova: d.nova, existente: d.existente, similaridade: 90 })),
          conflitos: (dupIA.conflitos||[]).map(d => ({ nova: d.atividade, motivo: d.motivo })),
          novas:     (dupIA.novas||[])
        };
        iaRenderDuplicatasBanner(convertido);
      }
    }

  } catch(err) {
    typingEl.remove();
    // err.message já vem traduzido do iaTraduzirErro; fallback para falhas de rede
    const msgFinal = err.message && err.message.startsWith('Failed to fetch')
      ? iaTraduzirErro(0, err.message)
      : (err.message || 'Erro desconhecido');
    iaAddMessage('ia', msgFinal);
  } finally {
    iaIsTyping = false;
    document.getElementById('ia-send-btn').disabled = false;
  }
}

/* ── Render mensagens ─────────────────────────── */

/**
 * iaRenderMarkdown(texto)
 * Converte markdown para HTML com suporte a:
 * headers, bold, itálico, código inline, blocos de código,
 * listas (- e *), listas numeradas, links.
 */
function iaRenderMarkdown(texto) {
  // Escapa HTML primeiro
  let t = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Blocos de código ```...```
  t = t.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre style="background:#1e293b;color:#e2e8f0;padding:10px;border-radius:6px;overflow-x:auto;font-size:12px;margin:6px 0;"><code>${code.trim()}</code></pre>`
  );

  // Código inline `xxx`
  t = t.replace(/`([^`\n]+)`/g, '<code style="background:rgba(148,163,184,.18);padding:1px 5px;border-radius:4px;font-size:.9em;">$1</code>');

  // Headers ###, ##, #
  t = t.replace(/^### (.+)$/gm, '<div style="font-weight:700;font-size:1.02em;margin:8px 0 4px;">$1</div>');
  t = t.replace(/^## (.+)$/gm,  '<div style="font-weight:700;font-size:1.08em;margin:10px 0 4px;">$1</div>');
  t = t.replace(/^# (.+)$/gm,   '<div style="font-weight:700;font-size:1.15em;margin:12px 0 6px;">$1</div>');

  // Bold e itálico
  t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>');

  // Links [texto](url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#3b82f6;text-decoration:underline;">$1</a>');

  // Listas não-ordenadas (- ou *)
  t = t.replace(/(?:^|\n)((?:[ \t]*[-*] .+\n?)+)/g, (bloco) => {
    const itens = bloco.trim().split('\n').map(l =>
      '<li>' + l.replace(/^[ \t]*[-*] /, '') + '</li>'
    ).join('');
    return '\n<ul style="margin:4px 0 4px 18px;padding:0;">' + itens + '</ul>\n';
  });

  // Listas numeradas (1. 2. 3.)
  t = t.replace(/(?:^|\n)((?:[ \t]*\d+\. .+\n?)+)/g, (bloco) => {
    const itens = bloco.trim().split('\n').map(l =>
      '<li>' + l.replace(/^[ \t]*\d+\. /, '') + '</li>'
    ).join('');
    return '\n<ol style="margin:4px 0 4px 20px;padding:0;">' + itens + '</ol>\n';
  });

  // Quebras de linha restantes (fora de tags de bloco)
  t = t.replace(/\n(?!<\/?(ul|ol|li|pre|div))/g, '<br>');

  return t;
}

function iaAddMessage(role, texto, rawHtml = false) {
  const hora  = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});

  // Converte markdown (ou usa html raw)
  const html = rawHtml ? texto : iaRenderMarkdown(texto);

  // Renderiza em TODOS os containers ativos (tab + bolha flutuante)
  const containers = [
    document.getElementById('ia-chat-messages'),
    document.getElementById('fab-messages')
  ].filter(Boolean);

  let elRef = null;
  containers.forEach(wrap => {
    const el = document.createElement('div');
    el.className = 'ia-msg ' + role;
    el.innerHTML = `
      <div class="ia-msg-avatar">${role === 'ia' ? '🤖' : '<i class="fa-solid fa-user" style="font-size:10px"></i>'}</div>
      <div>
        <div class="ia-msg-bubble">${html}</div>
        <div class="ia-msg-time">${hora}</div>
      </div>`;
    wrap.appendChild(el);
    wrap.scrollTop = wrap.scrollHeight;
    elRef = el; // retorna o último (compatível com código existente)
  });

  return elRef;
}

function iaShowTyping() {
  const containers = [
    document.getElementById('ia-chat-messages'),
    document.getElementById('fab-messages')
  ].filter(Boolean);

  const created = [];
  containers.forEach(wrap => {
    const el = document.createElement('div');
    el.className = 'ia-msg ia ia-typing-msg';
    el.innerHTML = `
      <div class="ia-msg-avatar">🤖</div>
      <div class="ia-typing">
        <div class="ia-typing-dots"><span></span><span></span><span></span></div>
        Pensando...
      </div>`;
    wrap.appendChild(el);
    wrap.scrollTop = wrap.scrollHeight;
    created.push(el);
  });

  // Retorna um objeto com .remove() que apaga os elementos em ambos containers
  return {
    remove: () => created.forEach(el => el.remove())
  };
}

/* ── Render preview de atividades ─────────────── */
function iaRenderPreview(resultado) {
  const projeto = resultado.projeto || 'Novo Projeto';
  const novas   = (resultado.atividades || []).map(a => ({
    id:          uid(),
    project:     projeto,
    description: a.titulo   || '',
    responsible: a.responsavel || '',
    startDate:   a.inicio   || '',
    dueDate:     a.termino  || '',
    status:      a.status   || 'Pendente',
    progress:    parseInt(a.progresso) || 0,
    isCritical: false, obs: '', duration: ''
  })).filter(a => a.description);

  if (!novas.length) return;

  // ── Detecção de duplicatas (client-side) ──────────
  const dupResult = iaDetectarDuplicatas(novas);
  // Marca cards com flag de duplicata
  novas.forEach(a => {
    if (dupResult.exatas.find(d => d.nova === a.description)) a._dupExata = true;
    if (dupResult.parciais.find(d => d.nova === a.description)) a._dupParcial = true;
  });

  // Acumula atividades (não substitui — permite refinamentos)
  iaAtividadesGeradas = [...iaAtividadesGeradas, ...novas];

  const body     = document.getElementById('ia-preview-body');
  const emptyEl  = document.getElementById('ia-empty-preview');
  const countEl  = document.getElementById('ia-preview-count');
  const btnImp   = document.getElementById('ia-btn-importar');
  const btnLim   = document.getElementById('ia-btn-limpar');

  emptyEl.style.display = 'none';
  countEl.style.display = 'inline-flex';
  btnImp.style.display  = 'inline-flex';
  btnLim.style.display  = 'inline-flex';
  countEl.textContent   = iaAtividadesGeradas.length + ' atividades';

  // Agrupa por status
  const grupos = {
    'Em Andamento': iaAtividadesGeradas.filter(a => a.status === 'Em Andamento'),
    'Pendente':     iaAtividadesGeradas.filter(a => a.status === 'Pendente'),
    'Concluído':    iaAtividadesGeradas.filter(a => a.status === 'Concluído'),
  };
  const icones = { 'Em Andamento':'🔵', 'Pendente':'🟡', 'Concluído':'🟢' };
  const slugMap = { 'Em Andamento':'andamento', 'Pendente':'pendente', 'Concluído':'concluido' };

  let html = `<div style="font-size:.7rem;font-weight:700;color:var(--text-3);margin-bottom:10px;display:flex;align-items:center;gap:6px">
    <i class="fa-solid fa-folder-open" style="color:var(--purple)"></i> ${esc(projeto)}
  </div>`;

  for (const [statusLabel, lista] of Object.entries(grupos)) {
    if (!lista.length) continue;
    html += `<div class="ia-act-group">
      <div class="ia-act-group-title">${icones[statusLabel]} ${statusLabel} (${lista.length})</div>
      <div class="ia-act-grid">`;
    for (const a of lista) {
      const slug  = slugMap[a.status] || 'pendente';
      const pct   = a.progress || 0;
      const fillClass = pct === 100 ? 'green' : pct > 0 ? '' : 'amber';
      const dur   = (a.startDate && a.dueDate)
        ? Math.max(1, Math.round((new Date(a.dueDate)-new Date(a.startDate))/(86400000))) + 'd'
        : '';
      const isDupEx  = !!a._dupExata;
      const isDupPar = !!a._dupParcial;
      const dupClass = isDupEx ? ' is-duplicate' : '';
      html += `
        <div class="ia-act-card st-${slug}${dupClass}">
          <div class="ia-act-card-body">
            <div class="ia-act-card-title">${esc(a.description)}</div>
            <div class="ia-act-card-meta">
              ${a.startDate ? `<span class="ia-act-meta-item"><i class="fa-regular fa-calendar"></i> ${a.startDate}</span>` : ''}
              ${a.dueDate   ? `<span class="ia-act-meta-item"><i class="fa-solid fa-arrow-right" style="font-size:.55rem"></i> ${a.dueDate}</span>` : ''}
              ${dur         ? `<span class="ia-act-meta-item"><i class="fa-regular fa-clock"></i> ${dur}</span>` : ''}
              ${a.responsible ? `<span class="ia-act-meta-item"><i class="fa-solid fa-user"></i> ${esc(a.responsible)}</span>` : ''}
              <span class="badge-sm ${slug}">${statusLabel}</span>
              ${isDupEx  ? '<span class="ia-dup-tag">⛔ duplicata</span>' : ''}
              ${isDupPar ? '<span class="ia-sim-tag">⚠️ similar</span>'  : ''}
            </div>
            ${a.obs
              ? `<div style="margin-top:6px;font-size:.67rem;color:var(--amber);background:var(--amber-dim);border-radius:4px;padding:4px 7px;line-height:1.4">
                  📝 ${esc(a.obs)}
                  <button class="ia-note-indicator" onclick="iaAbrirNota('${a.id}')" style="margin-left:6px">editar</button>
                </div>`
              : `<button class="ia-note-btn" onclick="iaAbrirNota('${a.id}')" style="margin-top:5px">
                  <i class="fa-solid fa-plus" style="font-size:.6rem"></i> Adicionar anotação
                </button>`
            }
          </div>
          <div class="ia-act-progress-wrap">
            <div class="ia-act-progress-bar">
              <div class="ia-act-progress-fill ${fillClass}" style="width:${pct}%"></div>
            </div>
            <div class="ia-act-progress-pct">${pct}%</div>
          </div>
        </div>`;
    }
    html += '</div></div>';
  }

  body.innerHTML = html;
}

function iaRenderPreviewDados(lista, projeto) {
  // Re-renderiza o preview com a lista atual (sem adicionar novos itens)
  const body    = document.getElementById('ia-preview-body');
  const countEl = document.getElementById('ia-preview-count');
  const btnImp  = document.getElementById('ia-btn-importar');
  const btnLim  = document.getElementById('ia-btn-limpar');

  countEl.style.display = 'inline-flex';
  btnImp.style.display  = 'inline-flex';
  btnLim.style.display  = 'inline-flex';
  countEl.textContent   = lista.length + ' atividades';

  const grupos  = {
    'Em Andamento': lista.filter(a => a.status === 'Em Andamento'),
    'Pendente':     lista.filter(a => a.status === 'Pendente'),
    'Concluído':    lista.filter(a => a.status === 'Concluído'),
  };
  const icones  = { 'Em Andamento':'🔵', 'Pendente':'🟡', 'Concluído':'🟢' };
  const slugMap = { 'Em Andamento':'andamento', 'Pendente':'pendente', 'Concluído':'concluido' };

  let html = `<div style="font-size:.7rem;font-weight:700;color:var(--text-3);margin-bottom:10px;display:flex;align-items:center;gap:6px">
    <i class="fa-solid fa-folder-open" style="color:var(--purple)"></i> ${esc(projeto)}
  </div>`;

  for (const [statusLabel, itemLista] of Object.entries(grupos)) {
    if (!itemLista.length) continue;
    const slug = slugMap[statusLabel] || 'pendente';
    html += `<div class="ia-act-group">
      <div class="ia-act-group-title">${icones[statusLabel]} ${statusLabel} (${itemLista.length})</div>
      <div class="ia-act-grid">`;
    for (const a of itemLista) {
      const pct  = a.progress || 0;
      const fillClass = pct === 100 ? 'green' : pct > 0 ? '' : 'amber';
      const dur  = (a.startDate && a.dueDate)
        ? Math.max(1, Math.round((new Date(a.dueDate)-new Date(a.startDate))/(86400000))) + 'd'
        : '';
      html += `
        <div class="ia-act-card st-${slug}">
          <div class="ia-act-card-body">
            <div class="ia-act-card-title">${esc(a.description)}</div>
            <div class="ia-act-card-meta">
              ${a.startDate ? `<span class="ia-act-meta-item"><i class="fa-regular fa-calendar"></i> ${a.startDate}</span>` : ''}
              ${a.dueDate   ? `<span class="ia-act-meta-item"><i class="fa-solid fa-arrow-right" style="font-size:.55rem"></i> ${a.dueDate}</span>` : ''}
              ${dur         ? `<span class="ia-act-meta-item"><i class="fa-regular fa-clock"></i> ${dur}</span>` : ''}
              ${a.responsible ? `<span class="ia-act-meta-item"><i class="fa-solid fa-user"></i> ${esc(a.responsible)}</span>` : ''}
              <span class="badge-sm ${slug}">${statusLabel}</span>
            </div>
            ${a.obs
              ? `<div style="margin-top:6px;font-size:.67rem;color:var(--amber);background:var(--amber-dim);border-radius:4px;padding:4px 7px;line-height:1.4">
                  📝 ${esc(a.obs)}
                  <button class="ia-note-indicator" onclick="iaAbrirNota('${a.id}')" style="margin-left:6px">editar</button>
                </div>`
              : `<button class="ia-note-btn" onclick="iaAbrirNota('${a.id}')" style="margin-top:5px">
                  <i class="fa-solid fa-plus" style="font-size:.6rem"></i> Adicionar anotação
                </button>`
            }
          </div>
          <div class="ia-act-progress-wrap">
            <div class="ia-act-progress-bar">
              <div class="ia-act-progress-fill ${fillClass}" style="width:${pct}%"></div>
            </div>
            <div class="ia-act-progress-pct">${pct}%</div>
          </div>
        </div>`;
    }
    html += '</div></div>';
  }
  body.innerHTML = html;

  // Banner de duplicatas
  const dupRes = iaDetectarDuplicatas(iaAtividadesGeradas);
  iaRenderDuplicatasBanner(dupRes);
}

function iaLimparPreview() {
  iaAtividadesGeradas = [];
  document.getElementById('ia-preview-body').innerHTML =
    '<div class="ia-empty-preview" id="ia-empty-preview"><div class="empty-icon">🤖</div><p>Converse com o assistente e as atividades geradas aparecerão aqui como cards visuais, prontas para importar.</p></div>';
  document.getElementById('ia-preview-count').style.display = 'none';
  document.getElementById('ia-btn-importar').style.display  = 'none';
  document.getElementById('ia-btn-limpar').style.display    = 'none';
}

function iaImportarTudo() {
  if (!iaAtividadesGeradas.length) return;
  iaAtividadesGeradas.forEach(a => activities.push(a));
  save(); renderAll();
  addHistory('import', iaAtividadesGeradas.length + ' atividades criadas via Assistente IA');
  toast('✓ ' + iaAtividadesGeradas.length + ' atividade(s) importadas com sucesso!', 'success');
  iaLimparPreview();
  // Navega para atividades
  const navAtvEl = document.querySelector('[onclick*=\'atividades\']');
  switchView('atividades', navAtvEl);
}

// Carregar API key salva
(function() {
  const saved = iaSanitizarApiKey(localStorage.getItem('tf_apikey') || '');
  if (saved) {
    localStorage.setItem('tf_apikey', saved); // re-salva já limpa
    const el = document.getElementById('pdf-api-key');
    if (el) el.value = saved;
  }
})();
