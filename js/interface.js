/* ═══════════════════════════════════════════════════════════════
   Aprumo · interface.js
   Navegação entre telas, modais, tema claro/escuro e avisos (toast)
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════════ */
/* F5 em todo o site: cada tela guarda na aba do navegador (sessionStorage) o que estava aberto e filtrado,
   e volta assim depois de atualizar. "voltando" fica ligado só durante a volta automática do F5. */
window.tfEstado = {
  voltando: false,
  ler(k) { try { return JSON.parse(sessionStorage.getItem('tf-e-' + k) || 'null'); } catch (_) { return null; } },
  gravar(k, v) { try { sessionStorage.setItem('tf-e-' + k, JSON.stringify(v)); } catch (_) {} },
  // devolve o que estava guardado só na primeira vez que a tela abre depois de carregar a página
  primeira(k) { this._ja = this._ja || {}; if (this._ja[k]) return null; this._ja[k] = 1; return this.ler(k); },
  // filtros das telas antigas (Atividades, Gantt, Calendário da equipe): guardados quando mudam, repostos no F5
  CAMPOS: ['f-projeto', 'f-status', 'gantt-f-search', 'gantt-f-project', 'gantt-f-status', 'gantt-f-resp', 'cal-eq-pessoa'],
  restaurarCampos() {
    const v = this.ler('campos'); if (!v) return false; let mudou = false;
    for (const [id, val] of Object.entries(v)) {
      const el = document.getElementById(id); if (!el || el.value === val) continue;
      if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === val)) continue;
      el.value = val; mudou = true;
    }
    return mudou;
  }
};
['change', 'input'].forEach(ev => document.addEventListener(ev, e => {
  if (!e.target || !tfEstado.CAMPOS.includes(e.target.id)) return;
  const v = tfEstado.ler('campos') || {}; v[e.target.id] = e.target.value; tfEstado.gravar('campos', v);
}, true));
function switchView(name, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-'+name)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el?.classList.add('active');
  const titles = {
    dashboard:'Dashboard', atividades:'Atividades', kanban:'Kanban',
    projetos:'Projetos', equipe:'Equipe', graficos:'Gráficos',
    gantt:'Gantt', portfolio:'Portfólio', recursos:'Recursos',
    'cal-atividades':'Calendário de atividades', 'cal-equipe':'Calendário da equipe',
    importar:'Importar / Exportar', historico:'Histórico', 'ia-chat':'Assistente IA',
    relatorio:'Relatório PDF'
  };
  document.getElementById('page-title').textContent = titles[name]||name;
  if (name==='graficos')        renderFullCharts();
  if (name==='kanban')          renderKanban();
  if (name==='equipe')          renderEquipe();
  if (name==='projetos')        renderProjetos();
  if (name==='gantt')           renderGantt();
  if (name==='portfolio')       renderPortfolio();
  if (name==='recursos')        renderRecursos();
  if (name==='cal-atividades')  renderCalAtiv();
  if (name==='cal-equipe')      renderCalEquipe();
  if (name==='historico')       renderHistorico();
  if (name==='ia-chat')          iaInitChat();
  if (name==='relatorio')       renderRelatorio();
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

function closeModalOutside(e, id) {
  if (e.target.id === id) closeModal(id);
}

function tfIconeTema() {
  const escuro = document.documentElement.dataset.theme === 'dark', i = document.getElementById('theme-icon'), b = i && i.closest('button');
  if (i) i.className = escuro ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  if (b) { const t = escuro ? 'Usar tema claro' : 'Usar tema escuro'; b.setAttribute('data-tooltip', t); b.setAttribute('aria-label', t); }
  const ni = document.getElementById('nav-tema-i'), nt = document.getElementById('nav-tema-t');   // no celular o tema fica na barra lateral
  if (ni) ni.className = escuro ? 'fa-solid fa-sun' : 'fa-solid fa-moon'; if (nt) nt.textContent = escuro ? 'Tema claro' : 'Tema escuro';
}
document.addEventListener('DOMContentLoaded', tfIconeTema);
function toggleTheme() {
  const html = document.documentElement;
  const dark = html.dataset.theme === 'dark';
  html.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('tf-tema', html.dataset.theme); } catch (_) {}   // o tema escolhido continua depois de sair e entrar
  tfIconeTema();
  // Redraw charts
  if (chartProj) { chartProj.destroy(); chartProj=null; }
  if (chartDonut){ chartDonut.destroy(); chartDonut=null; }
  renderCharts();
}

function toggleNotif() {
  const list = activities.filter(a=>a.status==='Vencido');
  if (!list.length) { toast('✓ Nenhuma atividade vencida', 'success'); return; }
  toast(`⚠ ${list.length} atividade(s) vencida(s)`, 'warning');
}

let _toastT;
function toast(msg, type='info') {
  const wrap = document.getElementById('toast-wrap');
  const el   = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success:'fa-check', error:'fa-xmark', warning:'fa-triangle-exclamation', info:'fa-info' };
  const ic = document.createElement('i'); ic.className = `fa-solid ${icons[type]||'fa-info'}`;
  el.append(ic, ' ' + String(msg).replace(/^\s*✓\s*/, ''));   // texto puro (nomes vindos do usuário) e sem "✓" repetido junto do ícone
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; setTimeout(()=>el.remove(),300); }, 3500);
}
