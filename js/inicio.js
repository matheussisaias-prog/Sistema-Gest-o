/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · inicio.js
   Inicialização da página, carregamento e gravação base, renderAll
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  backupAndResetStaleBrowserData();

  // Fase 1: com o servidor, os dados vêm de lá (e o login é obrigatório)
  if (window.tfServidor) {
    const ok = await tfServidor.iniciar();   // sem login, vai para entrar.html
    if (!ok) return;
  } else {
  // Tenta carregar do Gist primeiro, somente se estiver configurado manualmente
  const gistData = await gistLoad();
  if (gistData && (gistData.activities || gistData.projects)) {
    try {
      if (gistData.activities)       activities = gistData.activities;
      if (gistData.projects)         projects   = gistData.projects;
      if (gistData.employees)        { try { employees        = gistData.employees; } catch(_){} }
      if (gistData.teamCalendar)     { try { teamCalendar     = gistData.teamCalendar; } catch(_){} }
      if (gistData.resourceRegistry) { try { resourceRegistry = gistData.resourceRegistry; } catch(_){} }
      if (gistData.projectFolders)   { try { projectFolders   = gistData.projectFolders; } catch(_){} }
      projects.forEach((p,i) => { PROJECT_COLORS_MAP[p.name] = p.color || COLORS[i % COLORS.length]; });
      setTimeout(() => toast('✅ Dados sincronizados do servidor', 'success'), 1500);
    } catch(e) {
      load();
    }
  } else {
    load();
  }
  }

  // Loader
  setTimeout(() => {
    const ld = document.getElementById('loader');
    ld.classList.add('hidden');
    setTimeout(() => { ld.style.display = 'none'; }, 500);   // sai de vez (no celular ainda ocupava largura)
  }, 1200);

  renderAll();
  buildColorPicker();
  loadHistory();


  if (!isGistSyncEnabled()) {
    console.info('Gist sync desativado: usando apenas dados locais deste navegador.');
  }
});

function loadBase() {
  try {
    const ra = localStorage.getItem(STORAGE_ACTS);
    const rp = localStorage.getItem(STORAGE_PROJ);
    activities = ra ? JSON.parse(ra) : SEED_ACTS;
    projects   = rp ? JSON.parse(rp) : SEED_PROJECTS;
  } catch(e) {
    activities = [...SEED_ACTS];
    projects   = [...SEED_PROJECTS];
  }
  // Mapa de cores
  projects.forEach((p,i) => { PROJECT_COLORS_MAP[p.name] = p.color || COLORS[i % COLORS.length]; });
}

function saveBase() {
  localStorage.setItem(STORAGE_ACTS, JSON.stringify(activities));
  localStorage.setItem(STORAGE_PROJ, JSON.stringify(projects));
  scheduleGistSave();
}

function renderAll() {
  autoUpdateStatus();
  renderKPIs();
  renderUpcoming();
  renderAlerts();
  renderPriority();
  renderCharts();
  renderAtividades();
  renderKanban();
  renderProjetos();
  renderEquipe();
  updateBadge();
  updateProjectsDatalist();
  // Re-renderiza a view ativa se for uma das que exibe atividades
  const activeView = document.querySelector('.view.active')?.id;
  if (activeView === 'view-gantt')           { if (typeof renderGantt === 'function')      renderGantt(); }
  if (activeView === 'view-portfolio')       { if (typeof renderPortfolio === 'function')  renderPortfolio(); }
  if (activeView === 'view-recursos')        { if (typeof renderRecursos === 'function')   renderRecursos(); }
  if (activeView === 'view-cal-atividades')  { if (typeof renderCalAtiv === 'function')    renderCalAtiv(); }
  if (activeView === 'view-cal-equipe')      { if (typeof renderCalEquipe === 'function')  renderCalEquipe(); }
  if (activeView === 'view-historico')       { if (typeof renderHistorico === 'function')  renderHistorico(); }
}
