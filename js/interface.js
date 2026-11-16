/* ═══════════════════════════════════════════════════════════════
   Mercronos · interface.js
   Navegação entre telas, modais, tema claro/escuro e avisos (toast)
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════════ */
function switchView(name, el) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-'+name)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el?.classList.add('active');
  const titles = {
    dashboard:'Dashboard', atividades:'Atividades', kanban:'Kanban',
    projetos:'Projetos', equipe:'Equipe', graficos:'Gráficos',
    gantt:'Gantt', portfolio:'Portfólio', recursos:'Recursos',
    'cal-atividades':'Calendário de Atividades', 'cal-equipe':'Calendário da Equipe',
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

function toggleTheme() {
  const html = document.documentElement;
  const dark = html.dataset.theme === 'dark';
  html.dataset.theme = dark ? 'light' : 'dark';
  document.getElementById('theme-icon').className = dark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
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
