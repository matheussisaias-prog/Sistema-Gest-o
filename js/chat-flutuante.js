/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · chat-flutuante.js
   Bolha de chat com a IA no canto da tela
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ── Estado do chat flutuante ─────────────────── */
let fabOpen   = false;
let fabTyping = false;

function fabToggle() {
  const panel      = document.getElementById('fab-chat-panel');
  const iconClosed = document.getElementById('fab-icon-closed');
  const iconOpen   = document.getElementById('fab-icon-open');
  fabOpen = !fabOpen;
  if (fabOpen) {
    panel.classList.remove('fab-closed');
    iconClosed.style.display = 'none';
    iconOpen.style.display   = '';
    fabRenderHistorico();
    setTimeout(() => document.getElementById('fab-input')?.focus(), 260);
  } else {
    panel.classList.add('fab-closed');
    iconClosed.style.display = '';
    iconOpen.style.display   = 'none';
  }
}

/* Re-renderiza o histórico APENAS no fab-messages (sem duplicar no tab) */
function fabRenderHistorico() {
  const wrap = document.getElementById('fab-messages');
  if (!wrap) return;

  // Carrega do localStorage se ainda vazio em memória
  if (typeof iaChatHistory !== 'undefined' && iaChatHistory.length === 0) {
    if (typeof iaCarregarHistorico === 'function') iaCarregarHistorico();
  }

  wrap.innerHTML = '';
  const hist = (typeof iaChatHistory !== 'undefined') ? iaChatHistory : [];

  if (hist.length === 0) {
    // Boas-vindas contextualizada
    const t = (typeof activities !== 'undefined') ? activities.length : 0;
    const p = (typeof projects   !== 'undefined') ? projects.length   : 0;
    let boas = 'Olá! Sou o assistente do TaskFlow PRO. 👋\n\n';
    boas += 'Posso te ajudar com:\n';
    boas += '- **Dúvidas sobre o sistema** — onde fica cada recurso, como usar\n';
    boas += '- **Seus projetos** — analisar, criar, reorganizar atividades\n';
    boas += '- **Análises** — prazos, riscos, sobrecarga de equipe\n\n';
    if (t > 0) boas += `📊 Você tem **${p} projeto(s)** e **${t} atividade(s)** carregadas.\n\n`;
    boas += 'O que você quer saber?';
    fabRenderOnly('ia', boas);
  } else {
    hist.forEach(m => {
      const texto = (typeof iaStripAnexos === 'function') ? iaStripAnexos(m.content) : String(m.content || '');
      fabRenderOnly(m.role === 'user' ? 'user' : 'ia', texto);
    });
  }

  // Subtítulo do header
  const sub = document.getElementById('fab-head-sub');
  if (sub) {
    const t = (typeof activities !== 'undefined') ? activities.length : 0;
    const p = (typeof projects   !== 'undefined') ? projects.length   : 0;
    sub.textContent = t > 0 ? `${p} projeto(s) · ${t} atividade(s)` : 'Como posso ajudar?';
  }
}

/* Renderiza mensagem APENAS no fab-messages (sem broadcast ao tab) */
function fabRenderOnly(role, texto) {
  const wrap = document.getElementById('fab-messages');
  if (!wrap) return;
  const hora = new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  const html = (typeof iaRenderMarkdown === 'function') ? iaRenderMarkdown(texto) : texto;
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
}

function fabKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    fabEnviar();
    return;
  }
  // auto-resize
  setTimeout(() => {
    const el = document.getElementById('fab-input');
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 100) + 'px'; }
  }, 0);
}

async function fabEnviar() {
  const input = document.getElementById('fab-input');
  const texto = input.value.trim();
  if (!texto || fabTyping) return;

  const apiKey = iaGetApiKey();
  if (!apiKey) {
    iaAddMessage('ia', '⚠️ Você precisa informar sua API Key da Anthropic. Vá em **Importar → PDF com IA** e cole sua chave lá.');
    return;
  }

  // iaAddMessage faz broadcast para fab-messages E ia-chat-messages
  iaAddMessage('user', texto);
  input.value = '';
  input.style.height = 'auto';

  iaChatHistory.push({ role: 'user', content: texto });
  iaSalvarHistorico();

  fabTyping = true;
  document.getElementById('fab-send-btn').disabled = true;
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
        system:     iaGerarSystemPrompt(),
        messages:   iaPrepararMessagesParaEnvio(),
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(iaTraduzirErro(res.status, err.error?.message));
    }

    const data     = await res.json();
    const resposta = data.content.find(b => b.type === 'text')?.text || '';

    iaChatHistory.push({ role: 'assistant', content: resposta });
    iaSalvarHistorico();

    typingEl.remove();

    // Se houver bloco JSON de criação de atividades, mostra só o texto no chat
    const textoMsg = resposta.split('===JSON===')[0].trim();
    iaAddMessage('ia', textoMsg);

  } catch (err) {
    typingEl.remove();
    const msgFinal = err.message && err.message.startsWith('Failed to fetch')
      ? iaTraduzirErro(0, err.message)
      : (err.message || 'Erro desconhecido');
    iaAddMessage('ia', msgFinal);
  } finally {
    fabTyping = false;
    const btn = document.getElementById('fab-send-btn');
    if (btn) btn.disabled = false;
  }
}

function fabLimpar() {
  if (iaChatHistory.length === 0) return;
  if (confirm('Apagar toda a conversa com o assistente?')) {
    iaChatHistory = [];
    localStorage.removeItem(IA_HISTORY_KEY);
    const fab = document.getElementById('fab-messages');
    const tab = document.getElementById('ia-chat-messages');
    if (fab) fab.innerHTML = '';
    if (tab) tab.innerHTML = '';
    fabRenderHistorico();
    if (typeof toast === 'function') toast('Conversa limpa', 'success');
  }
}
