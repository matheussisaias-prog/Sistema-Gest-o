/* ============================================================
   TASKFLOW PRO — APP.JS
   Orquestrador principal: roteamento, Kanban, Gantt, modais, tabelas
============================================================ */
'use strict';

/* ── INICIALIZAÇÃO ─────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  loadActivities();
  loadProjects();
  loadCollaborators();
  loadHistory();
  loadDismissed();
  initTheme();
  initClock();
  populateSelects();
  renderAll();
  startAlertLoop();
  initKeyboardShortcuts();
  switchView('dashboard', document.querySelector('[data-view="dashboard"]'));
});

/* ── RENDER ALL ────────────────────────────────────────── */
function renderAll() {
  const v = state.currentView;
  if (v === 'dashboard')  renderDashboard();
  if (v === 'crisis')     renderCrisisPanel();
  if (v === 'activities') renderActivities();
  if (v === 'kanban')     renderKanban();
  if (v === 'gantt')      renderGantt();
  if (v === 'analytics')  renderAnalytics();
  if (v === 'projects')   renderProjects();
  if (v === 'team')       renderTeam();
  if (v === 'history')    renderHistory();
  checkAlerts();
}

window.renderAll = renderAll;

/* ── NAVEGAÇÃO ─────────────────────────────────────────── */
function switchView(viewName, navEl) {
  state.currentView = viewName;

  // Remove active de todos
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (navEl) navEl.classList.add('active');

  // Esconde todas as views
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));

  const view = document.getElementById('view-' + viewName);
  if (view) view.classList.remove('hidden');

  // Atualiza título
  const titles = {
    dashboard: 'Dashboard', crisis: '🔴 Modo Guerra', activities: 'Atividades',
    kanban: 'Kanban', gantt: 'Gantt', analytics: 'Analytics',
    projects: 'Projetos', team: 'Equipe', history: 'Histórico',
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[viewName] || viewName;

  renderAll();
}

window.switchView = switchView;

/* ── TEMA ──────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('taskflow_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('taskflow_theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
}

window.toggleTheme = toggleTheme;

/* ── RELÓGIO ─────────────────────────────────────────── */
function initClock() {
  function tick() {
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2,'0');
    const mm  = String(now.getMinutes()).padStart(2,'0');
    const ss  = String(now.getSeconds()).padStart(2,'0');
    const el  = document.getElementById('sidebar-clock');
    const de  = document.getElementById('sidebar-date');
    if (el) el.textContent = `${hh}:${mm}:${ss}`;
    if (de) de.textContent = now.toLocaleDateString('pt-BR');
  }
  tick();
  setInterval(tick, 1000);
}

/* ── POPULA SELECTS ──────────────────────────────────── */
function populateSelects() {
  // Projetos
  const projects = [...new Set(state.activities.map(a => a.project).filter(Boolean))].sort();
  ['filter-project','kanban-filter-project','gantt-filter-project','equipe-filter-project'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos os projetos</option>' +
      projects.map(p => `<option value="${escAttr(p)}"${p===cur?' selected':''}>${escHtml(p)}</option>`).join('');
  });

  // Teams
  const teams = [...new Set(state.activities.map(a => a.team).filter(Boolean))].sort();
  ['filter-team','kanban-filter-team'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todas as equipes</option>' +
      teams.map(t => `<option value="${escAttr(t)}"${t===cur?' selected':''}>${escHtml(t)}</option>`).join('');
  });

  // Form predecessor
  const predSel = document.getElementById('form-predecessor');
  if (predSel) {
    predSel.innerHTML = '<option value="">— Sem dependência —</option>' +
      state.activities.map(a => `<option value="${a.id}">[${escHtml(a.project)}] ${escHtml(a.description)}</option>`).join('');
  }

  // Datalist projetos
  const dl = document.getElementById('projects-list');
  if (dl) dl.innerHTML = projects.map(p => `<option value="${escAttr(p)}">`).join('');
}

window.populateSelects = populateSelects;

/* ── ATIVIDADES (TABELA PRINCIPAL) ─────────────────── */
function renderActivities() {
  const tbody = document.getElementById('main-tbody');
  const empty = document.getElementById('main-empty');
  if (!tbody) return;

  const acts = getFilteredActivities();

  if (!acts.length) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  // Ordenar por prioridade por padrão
  acts.sort((a, b) => calcPriorityScore(b) - calcPriorityScore(a));

  tbody.innerHTML = acts.map(a => buildTaskRow(a)).join('');
}

window.renderActivities = renderActivities;

function applyFilters() {
  state.filters.project  = document.getElementById('filter-project')?.value || '';
  state.filters.team     = document.getElementById('filter-team')?.value || '';
  state.filters.status   = document.getElementById('filter-status')?.value || '';
  state.filters.dateFrom = document.getElementById('filter-date-from')?.value || '';
  state.filters.dateTo   = document.getElementById('filter-date-to')?.value || '';
  state.filters.critOnly = document.getElementById('filter-crit-only')?.checked || false;
  state.filters.search   = document.getElementById('filter-search')?.value || '';
  renderActivities();
}

function clearFilters() {
  state.filters = { project: '', team: '', status: '', dateFrom: '', dateTo: '', critOnly: false, search: '' };
  ['filter-project','filter-team','filter-status','filter-date-from','filter-date-to'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const ch = document.getElementById('filter-crit-only');
  if (ch) ch.checked = false;
  const sr = document.getElementById('filter-search');
  if (sr) sr.value = '';
  renderActivities();
}

function filterByTeam(team) {
  state.filters.team = team;
  const sel = document.getElementById('filter-team');
  if (sel) sel.value = team;
  switchView('activities', document.querySelector('[data-view="activities"]'));
}

window.applyFilters = applyFilters;
window.clearFilters = clearFilters;
window.filterByTeam = filterByTeam;

/* ── AÇÕES RÁPIDAS ────────────────────────────────── */
function quickComplete(id) {
  updateActivity(id, { status: 'Concluído' });
  showToast('✅ Tarefa concluída!', 'success');
  populateSelects();
  renderAll();
}

function deleteTask(id) {
  if (!confirm('Excluir esta tarefa?')) return;
  deleteActivity(id);
  showToast('🗑 Tarefa excluída.', 'info');
  populateSelects();
  renderAll();
}

function filterAndGo(filter) {
  state.filters.status = filter === 'ok' ? '' : filter;
  if (filter === 'today') { state.filters.status = ''; state.filters.dateFrom = state.filters.dateTo = todayISO(); }
  switchView('activities', document.querySelector('[data-view="activities"]'));
}

window.quickComplete = quickComplete;
window.deleteTask    = deleteTask;
window.filterAndGo   = filterAndGo;

/* ── KANBAN ────────────────────────────────────────── */
const KANBAN_COLS = [
  { id: 'Pendente',      label: 'Pendente',    color: '#3b82f6' },
  { id: 'Em andamento',  label: 'Em andamento', color: '#f59e0b' },
  { id: 'Vencido',       label: 'Atrasado',    color: '#ef4444' },
  { id: 'Reprogramado',  label: 'Reprogramado', color: '#8b5cf6' },
  { id: 'Concluído',     label: 'Concluído',   color: '#10b981' },
];

function renderKanban() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  const filtProj = document.getElementById('kanban-filter-project')?.value || '';
  const filtTeam = document.getElementById('kanban-filter-team')?.value || '';

  let acts = state.activities;
  if (filtProj) acts = acts.filter(a => a.project === filtProj);
  if (filtTeam) acts = acts.filter(a => a.team    === filtTeam);

  board.innerHTML = KANBAN_COLS.map(col => {
    const colActs = acts.filter(a => a.status === col.id)
      .sort((a, b) => calcPriorityScore(b) - calcPriorityScore(a));

    const cards = colActs.map(a => {
      const diff    = diffDays(a.dueDate);
      const blocked = isBlocked(a);
      const urgClass = diff < 0 ? 'kanban-card-overdue' : diff === 0 ? 'kanban-card-today' : '';
      return `
        <div class="kanban-card ${urgClass} ${a.isCritical ? 'kanban-card-critical' : ''}"
             draggable="true" data-id="${a.id}"
             ondragstart="kanbanDragStart(event)" ondragend="kanbanDragEnd(event)">
          <div class="kanban-card-top">
            <span class="kanban-project-dot" style="background:${getProjectColor(a.project)}"></span>
            <span class="kanban-card-project">${escHtml(a.project)}</span>
            ${a.isCritical ? '<span class="kanban-crit-dot">●</span>' : ''}
            ${blocked ? '<span class="kanban-blocked">🔗</span>' : ''}
          </div>
          <div class="kanban-card-title">${escHtml(a.description)}</div>
          <div class="kanban-card-meta">
            <span>👤 ${escHtml(a.responsible)}</span>
            <span class="${diff < 0 ? 'date-overdue' : ''}">📅 ${formatDate(a.dueDate)}</span>
          </div>
          <div class="kanban-card-footer">
            <span class="team-tag-sm">${escHtml(a.team)}</span>
            <div class="kanban-card-actions">
              ${a.status !== 'Concluído' ? `<button onclick="quickComplete('${a.id}')" title="Concluir">✓</button>` : ''}
              <button onclick="openModal('${a.id}')" title="Editar">✎</button>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="kanban-col" id="kanban-col-${col.id}"
           ondragover="kanbanDragOver(event)" ondrop="kanbanDrop(event,'${escAttr(col.id)}')">
        <div class="kanban-col-header" style="--col-color:${col.color}">
          <span class="kanban-col-dot"></span>
          <span class="kanban-col-title">${col.label}</span>
          <span class="kanban-col-count">${colActs.length}</span>
        </div>
        <div class="kanban-col-body">${cards || '<div class="kanban-empty">Sem tarefas</div>'}</div>
      </div>`;
  }).join('');
}

let _kanbanDragId = null;

function kanbanDragStart(e) {
  _kanbanDragId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function kanbanDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
}

function kanbanDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function kanbanDrop(e, newStatus) {
  e.preventDefault();
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drag-over'));
  if (!_kanbanDragId) return;
  updateActivity(_kanbanDragId, { status: newStatus });
  _kanbanDragId = null;
  showToast(`Status atualizado para "${newStatus}"`, 'info');
  renderKanban();
}

window.renderKanban    = renderKanban;
window.kanbanDragStart = kanbanDragStart;
window.kanbanDragEnd   = kanbanDragEnd;
window.kanbanDragOver  = kanbanDragOver;
window.kanbanDrop      = kanbanDrop;

function getProjectColor(name) {
  const proj = state.projects.find(p => p.name === name);
  return proj?.color || '#64748b';
}

/* ── GANTT SIMPLES ─────────────────────────────────── */
let ganttZoomFactor = 28; // px por dia

function renderGantt() {
  const wrap = document.getElementById('gantt-wrap');
  if (!wrap) return;

  const filtProj = document.getElementById('gantt-filter-project')?.value || '';
  let acts = state.activities
    .filter(a => !filtProj || a.project === filtProj)
    .filter(a => a.startDate && a.dueDate)
    .sort((a, b) => (a.startDate > b.startDate ? 1 : -1));

  if (!acts.length) {
    wrap.innerHTML = '<div class="empty-state"><span>▬</span><p>Nenhuma tarefa com datas definidas</p></div>';
    return;
  }

  const allDates = acts.flatMap(a => [a.startDate, a.dueDate]);
  const minDate  = new Date(allDates.reduce((a, b) => a < b ? a : b) + 'T00:00:00');
  const maxDate  = new Date(allDates.reduce((a, b) => a > b ? a : b) + 'T00:00:00');
  minDate.setDate(minDate.getDate() - 5);
  maxDate.setDate(maxDate.getDate() + 10);

  const totalDays = Math.round((maxDate - minDate) / 86400000);
  const dayW      = ganttZoomFactor;
  const rowH      = 44;
  const labelW    = 260;

  // Cabeçalho dos dias
  let headerHtml = '';
  let prevMonth  = '';
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minDate); d.setDate(d.getDate() + i);
    const ym = d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
    const isWknd  = d.getDay() === 0 || d.getDay() === 6;
    const isToday = d.toISOString().slice(0, 10) === todayISO();
    const dayNum  = d.getDate();
    headerHtml += `<div class="gantt-day ${isWknd ? 'gantt-weekend' : ''} ${isToday ? 'gantt-today-col' : ''}"
      style="width:${dayW}px;left:${i * dayW}px">
      ${dayNum === 1 || i === 0 ? `<span class="gantt-month-label">${ym}</span>` : ''}
      <span class="gantt-day-num">${dayW >= 20 ? dayNum : ''}</span>
    </div>`;
  }

  // Linhas das tarefas
  let rowsHtml   = '';
  let barsHtml   = '';
  let arrowsHtml = '';

  acts.forEach((a, idx) => {
    const s    = new Date(a.startDate + 'T00:00:00');
    const e    = new Date(a.dueDate   + 'T00:00:00');
    const left = Math.round((s - minDate) / 86400000) * dayW;
    const w    = Math.max(Math.round((e - s) / 86400000) * dayW, dayW);
    const top  = idx * rowH + 8;

    const diff    = diffDays(a.dueDate);
    const isOver  = diff < 0 && a.status !== 'Concluído';
    const isDone  = a.status === 'Concluído';
    const isCrit  = a.isCritical;

    const barColor = isDone ? '#10b981' : isOver ? '#ef4444' : isCrit ? '#f59e0b' : '#3b82f6';

    rowsHtml += `
      <div class="gantt-label-row" data-id="${a.id}" style="top:${idx * rowH}px;height:${rowH}px">
        <span class="gantt-row-num">${idx + 1}</span>
        ${isCrit ? '<span class="gantt-crit-dot">●</span>' : ''}
        <span class="gantt-label-text" title="${escAttr(a.description)}">${escHtml(a.description)}</span>
        <span class="gantt-label-team">${escHtml(a.team)}</span>
        <button class="gantt-row-del" title="Excluir atividade" onclick="ganttDeleteRow('${a.id}', event)">×</button>
      </div>`;

    barsHtml += `
      <div class="gantt-bar" title="${escAttr(a.description)} | ${a.responsible} | ${formatDate(a.dueDate)}"
           style="left:${left}px;top:${top}px;width:${w}px;background:${barColor};${isDone ? 'opacity:.6' : ''}">
        ${a.isCritical && !isDone ? '<span class="gantt-bar-crit-ring"></span>' : ''}
        <span class="gantt-bar-label">${escHtml(a.description)}</span>
        ${isOver ? `<span class="gantt-bar-delay">${Math.abs(diff)}d</span>` : ''}
      </div>`;

    // Seta de dependência
    if (a.predecessorId) {
      const predIdx = acts.findIndex(x => x.id === a.predecessorId);
      if (predIdx >= 0) {
        const pred     = acts[predIdx];
        const predEnd  = new Date(pred.dueDate + 'T00:00:00');
        const fromX    = Math.round((predEnd - minDate) / 86400000) * dayW;
        const fromY    = predIdx * rowH + rowH / 2;
        const toX      = left;
        const toY      = idx * rowH + rowH / 2;
        arrowsHtml += `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}"
          stroke="rgba(148,163,184,.35)" stroke-width="1.5" stroke-dasharray="4 3"
          marker-end="url(#arrowhead)"/>`;
      }
    }
  });

  // Linha do hoje
  const todayOffset = Math.round((new Date(todayISO() + 'T00:00:00') - minDate) / 86400000) * dayW;
  const canvasH = acts.length * rowH + 20;

  wrap.innerHTML = `
    <div class="gantt-container">
      <div class="gantt-left" style="width:${labelW}px">
        <div class="gantt-left-header">
          <span>Tarefa</span><span style="margin-left:auto;font-size:.6rem">Equipe</span>
        </div>
        <div class="gantt-left-body" style="height:${canvasH}px;position:relative">${rowsHtml}</div>
      </div>
      <div class="gantt-right" id="gantt-right-scroll">
        <div class="gantt-header-area" style="position:relative;height:36px;border-bottom:2px solid var(--border)">${headerHtml}</div>
        <div style="position:relative;height:${canvasH}px;width:${totalDays * dayW}px">
          <!-- Hoje -->
          <div style="position:absolute;left:${todayOffset}px;top:0;bottom:0;width:2px;background:rgba(59,130,246,.5);z-index:3;pointer-events:none"></div>
          <!-- Barras -->
          ${barsHtml}
          <!-- Setas SVG -->
          <svg style="position:absolute;top:0;left:0;overflow:visible;pointer-events:none" width="${totalDays * dayW}" height="${canvasH}">
            <defs><marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="rgba(148,163,184,.5)"/>
            </marker></defs>
            ${arrowsHtml}
          </svg>
        </div>
      </div>
    </div>`;

  // Sincroniza scroll vertical entre left e right
  const leftBody = wrap.querySelector('.gantt-left-body');
  const rightScroll = document.getElementById('gantt-right-scroll');
  if (leftBody && rightScroll) {
    rightScroll.addEventListener('scroll', () => leftBody.scrollTop = rightScroll.scrollTop, { passive: true });
  }
}

function ganttZoom(delta) {
  if (delta === 0) ganttZoomFactor = 28;
  else ganttZoomFactor = Math.max(10, Math.min(60, ganttZoomFactor + delta * 6));
  renderGantt();
}

function ganttDeleteRow(id, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  const a = (window.activities || []).find(x => x.id === id);
  const nome = a ? a.description : 'esta atividade';
  if (!confirm(`Excluir "${nome}"?\n\nEsta ação não pode ser desfeita.`)) return;
  if (typeof deleteActivity === 'function') {
    deleteActivity(id);
  }
  renderGantt();
}

window.renderGantt     = renderGantt;
window.ganttZoom       = ganttZoom;
window.ganttDeleteRow  = ganttDeleteRow;

/* ── PROJETOS ──────────────────────────────────────── */
function renderProjects() {
  const grid  = document.getElementById('projects-grid');
  const empty = document.getElementById('projects-empty');
  if (!grid) return;

  if (!state.projects.length) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  grid.innerHTML = state.projects.map(p => {
    const proActs   = state.activities.filter(a => a.project === p.name);
    const m         = calcMetrics(proActs);
    const hColor    = { ok: '#10b981', risk: '#f59e0b', late: '#ef4444' }[m.healthLevel];

    return `
      <div class="project-card" style="--proj-color:${p.color || '#3b82f6'}">
        <div class="project-card-header">
          <div class="project-card-dot" style="background:${p.color}"></div>
          <div class="project-card-title">${escHtml(p.name)}</div>
          <div class="project-card-code">${escHtml(p.code || '')}</div>
        </div>
        <div class="project-card-desc">${escHtml(p.description || '')}</div>
        <div class="project-card-meta">
          <span>👤 ${escHtml(p.manager)}</span>
          <span>📅 ${formatDate(p.startDate)} → ${formatDate(p.endDate)}</span>
        </div>
        <div class="project-progress-wrap">
          <div class="project-progress-bar" style="width:${m.pctDone}%;background:${hColor}"></div>
        </div>
        <div class="project-kpis">
          <div class="proj-kpi"><div class="proj-kpi-val">${m.total}</div><div class="proj-kpi-lbl">Total</div></div>
          <div class="proj-kpi"><div class="proj-kpi-val" style="color:#10b981">${m.done}</div><div class="proj-kpi-lbl">Concluídas</div></div>
          <div class="proj-kpi"><div class="proj-kpi-val" style="color:#ef4444">${m.overdue}</div><div class="proj-kpi-lbl">Atrasadas</div></div>
          <div class="proj-kpi"><div class="proj-kpi-val" style="color:${hColor}">${m.pctDone}%</div><div class="proj-kpi-lbl">Progresso</div></div>
        </div>
        <div class="project-health-tag" style="background:${hColor}22;color:${hColor};border:1px solid ${hColor}44">
          ${m.healthLabel}
        </div>
        <div class="project-card-actions">
          <button class="btn-action" onclick="openModalForProject('${escAttr(p.name)}')" style="background:rgba(99,102,241,.1);color:var(--primary);border:1px solid rgba(99,102,241,.3);font-weight:700" title="Nova atividade neste projeto">＋ Atividade</button>
          <button class="btn-action btn-edit" onclick="editProject('${p.id}')">✎ Editar</button>
          <button class="btn-action btn-delete" onclick="deleteProjectAction('${p.id}')">✕ Excluir</button>
        </div>
      </div>`;
  }).join('');
}

function editProject(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;
  // Pre-fill form and open modal
  openProjectModal(p);
}

function deleteProjectAction(id) {
  if (!confirm('Excluir este projeto?')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  saveProjects();
  renderProjects();
  showToast('Projeto excluído.', 'info');
}

window.renderProjects      = renderProjects;
window.editProject         = editProject;
window.deleteProjectAction = deleteProjectAction;

/* ── EQUIPE ───────────────────────────────────────── */
function renderTeam() {
  const grid  = document.getElementById('team-grid');
  const empty = document.getElementById('team-empty');
  if (!grid) return;

  if (!state.collaborators.length) {
    grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  const tm = calcTeamMetrics();

  grid.innerHTML = state.collaborators.map(c => {
    const myActs  = state.activities.filter(a => a.responsible === c.name && a.status !== 'Concluído');
    const myOver  = myActs.filter(a => diffDays(a.dueDate) < 0).length;
    const initials = c.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

    return `
      <div class="team-card">
        <div class="team-card-header">
          <div class="team-avatar" style="background:${c.color || '#3b82f6'}">${initials}</div>
          <div>
            <div class="team-name">${escHtml(c.name)}</div>
            <div class="team-role">${escHtml(c.role || '')} · ${escHtml(c.team)}</div>
          </div>
          ${myOver > 0 ? `<span class="team-over-badge">${myOver} atrasadas</span>` : ''}
        </div>
        <div class="team-card-meta">
          <span>📋 ${myActs.length} tarefa(s) ativa(s)</span>
          ${c.costHour ? `<span>💰 R$ ${parseFloat(c.costHour).toFixed(0)}/h</span>` : ''}
        </div>
      </div>`;
  }).join('');

  // Tabela de performance por equipe
  const perfTable = document.getElementById('team-perf-tbody');
  if (perfTable) {
    perfTable.innerHTML = tm.map(t => `
      <tr>
        <td><strong>${escHtml(t.team)}</strong></td>
        <td>${t.total}</td>
        <td style="color:#10b981">${t.done}</td>
        <td style="color:${t.overdue>0?'#ef4444':'var(--text-muted)'}">${t.overdue}</td>
        <td style="color:#f59e0b">${t.critical}</td>
        <td style="color:${t.avgDelay>0?'#ef4444':'#10b981'}">${t.avgDelay > 0 ? t.avgDelay+'d' : '—'}</td>
        <td>
          <div class="perf-bar-wrap">
            <div class="perf-bar" style="width:${t.pctOnTime}%;background:${t.pctOverdue>30?'#ef4444':t.pctOverdue>10?'#f59e0b':'#10b981'}"></div>
          </div>
          <span style="font-size:.72rem;font-weight:700">${t.pctOnTime}%</span>
        </td>
      </tr>`).join('');
  }
}

window.renderTeam = renderTeam;

/* ── HISTÓRICO ─────────────────────────────────────── */
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!el) return;
  if (!state.history.length) {
    el.innerHTML = '<div class="empty-state"><span>◎</span><p>Nenhuma alteração registrada</p></div>';
    return;
  }
  const actionLabels = { CRIAR: '✦ Criado', EDITAR: '✎ Editado', DELETAR: '✕ Excluído', REPROGRAMAR: '📅 Reprogramado', SEED: '⇪ Dados carregados' };
  el.innerHTML = state.history.slice(0, 100).map(h => `
    <div class="history-item">
      <span class="history-action">${actionLabels[h.action] || h.action}</span>
      <span class="history-desc">${escHtml(h.data?.description || h.data?.id || JSON.stringify(h.data).slice(0, 60))}</span>
      <span class="history-time">${new Date(h.ts).toLocaleString('pt-BR')}</span>
    </div>`).join('');
}

function clearHistory() {
  if (!confirm('Limpar todo o histórico?')) return;
  state.history = [];
  saveHistory();
  renderHistory();
}

window.renderHistory = renderHistory;
window.clearHistory  = clearHistory;

/* ── MODAL NOVA/EDITAR ATIVIDADE ─────────────────── */
function openModal(id = null) {
  state.editingId = id || null;
  populateSelects();
  const modal    = document.getElementById('modal-overlay');
  const titleEl  = document.getElementById('modal-title');
  const formId   = document.getElementById('form-id');

  if (id) {
    const a = state.activities.find(x => x.id === id);
    if (!a) return;
    titleEl.textContent = 'Editar Atividade';
    formId.value                                              = a.id;
    document.getElementById('form-project').value           = a.project || '';
    document.getElementById('form-team').value              = a.team    || '';
    document.getElementById('form-description').value       = a.description || '';
    document.getElementById('form-responsible').value       = a.responsible || '';
    document.getElementById('form-start-date').value        = a.startDate || '';
    document.getElementById('form-date').value              = a.dueDate   || '';
    document.getElementById('form-status').value            = a.status    || 'Pendente';
    document.getElementById('form-critical').checked        = a.isCritical || false;
    document.getElementById('form-weight').value            = a.weight     || 1;
    document.getElementById('form-predecessor').value       = a.predecessorId || '';
    document.getElementById('form-dep-type').value          = a.depType || 'FS';
    document.getElementById('form-obs').value               = a.obs     || '';
  } else {
    titleEl.textContent = 'Nova Atividade';
    formId.value = '';
    document.getElementById('form-project').value     = '';
    document.getElementById('form-team').value        = '';
    document.getElementById('form-description').value = '';
    document.getElementById('form-responsible').value = '';
    document.getElementById('form-start-date').value  = todayISO();
    document.getElementById('form-date').value        = '';
    document.getElementById('form-status').value      = 'Pendente';
    document.getElementById('form-critical').checked  = false;
    document.getElementById('form-weight').value      = 1;
    document.getElementById('form-predecessor').value = '';
    document.getElementById('form-dep-type').value    = 'FS';
    document.getElementById('form-obs').value         = '';
  }

  modal.classList.add('open');
  setTimeout(() => document.getElementById('form-description')?.focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.editingId = null;
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function saveActivity() {
  const desc  = document.getElementById('form-description').value.trim();
  const proj  = document.getElementById('form-project').value.trim();
  const team  = document.getElementById('form-team').value;
  const resp  = document.getElementById('form-responsible').value.trim();
  const due   = document.getElementById('form-date').value;

  if (!desc)  return showToast('⚠ Descrição é obrigatória', 'warning');
  if (!proj)  return showToast('⚠ Projeto é obrigatório', 'warning');
  if (!team)  return showToast('⚠ Equipe é obrigatória', 'warning');
  if (!resp)  return showToast('⚠ Responsável é obrigatório', 'warning');
  if (!due)   return showToast('⚠ Data de término é obrigatória', 'warning');

  const data = {
    project:       proj,
    team,
    description:   desc,
    responsible:   resp,
    startDate:     document.getElementById('form-start-date').value,
    dueDate:       due,
    status:        document.getElementById('form-status').value,
    isCritical:    document.getElementById('form-critical').checked,
    weight:        parseInt(document.getElementById('form-weight').value) || 1,
    predecessorId: document.getElementById('form-predecessor').value || null,
    depType:       document.getElementById('form-dep-type').value,
    obs:           document.getElementById('form-obs').value,
  };

  const editId = document.getElementById('form-id').value;
  if (editId) {
    updateActivity(editId, data);
    showToast('✅ Atividade atualizada', 'success');
  } else {
    createActivity(data);
    showToast('✅ Atividade criada', 'success');
  }

  closeModal();
  populateSelects();
  renderAll();
}

window.openModal         = openModal;

function openModalForProject(projName) {
  openModal();
  setTimeout(() => {
    const inp = document.getElementById('form-project');
    if (inp) inp.value = projName;
    document.getElementById('form-description')?.focus();
  }, 80);
}
window.openModalForProject = openModalForProject;
window.closeModal        = closeModal;
window.closeModalOutside = closeModalOutside;
window.saveActivity      = saveActivity;

/* ── MODAL REPROGRAMAR ────────────────────────────── */
function openReschedule(id) {
  state.reschedulingId = id;
  const a = state.activities.find(x => x.id === id);
  if (!a) return;

  const hasDeps = state.activities.some(x => x.predecessorId === id);
  const propWrap = document.getElementById('reschedule-propagate-wrap');
  if (propWrap) propWrap.style.display = hasDeps ? 'block' : 'none';

  document.getElementById('reschedule-date').value  = a.dueDate;
  document.getElementById('reschedule-reason').value = '';
  document.getElementById('reschedule-overlay').classList.add('open');
}

function closeReschedule() {
  document.getElementById('reschedule-overlay').classList.remove('open');
  state.reschedulingId = null;
}

function closeRescheduleOutside(e) {
  if (e.target === document.getElementById('reschedule-overlay')) closeReschedule();
}

function confirmReschedule() {
  const id     = state.reschedulingId;
  const date   = document.getElementById('reschedule-date').value;
  const reason = document.getElementById('reschedule-reason').value;
  const prop   = document.getElementById('reschedule-propagate')?.checked || false;

  if (!date) return showToast('Informe a nova data', 'warning');
  rescheduleActivity(id, date, reason, prop);
  showToast(prop ? '📅 Reprogramado + dependentes atualizados' : '📅 Atividade reprogramada', 'success');
  closeReschedule();
  renderAll();
}

window.openReschedule         = openReschedule;
window.closeReschedule        = closeReschedule;
window.closeRescheduleOutside = closeRescheduleOutside;
window.confirmReschedule      = confirmReschedule;

/* ── MODAL PROJETO ──────────────────────────────── */
function openProjectModal(proj = null) {
  const modal = document.getElementById('project-modal-overlay');
  const titleEl = document.getElementById('project-modal-title');
  const COLORS = ['#3b82f6','#f59e0b','#10b981','#8b5cf6','#ef4444','#ec4899','#0ea5e9','#f97316'];

  if (proj) {
    titleEl.textContent = 'Editar Projeto';
    document.getElementById('proj-form-id').value   = proj.id;
    document.getElementById('proj-name').value      = proj.name;
    document.getElementById('proj-code').value      = proj.code || '';
    document.getElementById('proj-desc').value      = proj.description || '';
    document.getElementById('proj-manager').value   = proj.manager || '';
    document.getElementById('proj-status').value    = proj.status || 'Em andamento';
    document.getElementById('proj-start').value     = proj.startDate || '';
    document.getElementById('proj-end').value       = proj.endDate || '';
    document.getElementById('proj-duration').value  = proj.duration || '';
    document.getElementById('proj-progress').value  = proj.progress || 0;
    document.getElementById('proj-progress-val').textContent = (proj.progress || 0) + '%';
  } else {
    titleEl.textContent = 'Novo Projeto';
    ['proj-form-id','proj-name','proj-code','proj-desc','proj-manager'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    document.getElementById('proj-status').value = 'Em andamento';
    document.getElementById('proj-start').value  = todayISO();
    document.getElementById('proj-end').value    = '';
    document.getElementById('proj-duration').value = '';
    document.getElementById('proj-progress').value = 0;
    document.getElementById('proj-progress-val').textContent = '0%';
  }

  // Color picker
  const picker = document.getElementById('proj-color-picker');
  if (picker) {
    const curColor = proj?.color || COLORS[0];
    picker.innerHTML = COLORS.map(c =>
      `<div class="color-dot ${c === curColor ? 'active' : ''}" style="background:${c}"
        onclick="this.parentNode.querySelectorAll('.color-dot').forEach(x=>x.classList.remove('active'));this.classList.add('active');this.parentNode.dataset.selected='${c}'"></div>`
    ).join('');
    picker.dataset.selected = curColor;
  }

  modal.classList.add('open');
}

function closeProjectModal() {
  document.getElementById('project-modal-overlay').classList.remove('open');
}

function closeProjectModalOutside(e) {
  if (e.target === document.getElementById('project-modal-overlay')) closeProjectModal();
}

function saveProject() {
  const name = document.getElementById('proj-name').value.trim();
  const mgr  = document.getElementById('proj-manager').value.trim();
  if (!name) return showToast('⚠ Nome do projeto é obrigatório', 'warning');
  if (!mgr)  return showToast('⚠ Responsável é obrigatório', 'warning');

  const data = {
    name,
    code:        document.getElementById('proj-code').value.trim(),
    description: document.getElementById('proj-desc').value.trim(),
    manager:     mgr,
    status:      document.getElementById('proj-status').value,
    startDate:   document.getElementById('proj-start').value,
    endDate:     document.getElementById('proj-end').value,
    duration:    document.getElementById('proj-duration').value,
    progress:    parseInt(document.getElementById('proj-progress').value) || 0,
    color:       document.getElementById('proj-color-picker')?.dataset.selected || '#3b82f6',
  };

  const editId = document.getElementById('proj-form-id').value;
  if (editId) {
    const idx = state.projects.findIndex(p => p.id === editId);
    if (idx >= 0) Object.assign(state.projects[idx], data);
  } else {
    state.projects.push({ id: uuid(), ...data });
  }

  saveProjects();
  closeProjectModal();
  renderProjects();
  populateSelects();
  showToast('✅ Projeto salvo', 'success');
}

window.openProjectModal         = openProjectModal;
window.closeProjectModal        = closeProjectModal;
window.closeProjectModalOutside = closeProjectModalOutside;
window.saveProject              = saveProject;

/* ── ATALHOS DE TECLADO ──────────────────────────── */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

    const map = {
      'n': () => openModal(),
      'd': () => switchView('dashboard',  document.querySelector('[data-view="dashboard"]')),
      'w': () => switchView('crisis',     document.querySelector('[data-view="crisis"]')),
      'a': () => switchView('activities', document.querySelector('[data-view="activities"]')),
      'k': () => switchView('kanban',     document.querySelector('[data-view="kanban"]')),
      'g': () => switchView('gantt',      document.querySelector('[data-view="gantt"]')),
      'y': () => switchView('analytics',  document.querySelector('[data-view="analytics"]')),
      't': () => toggleTheme(),
      'Escape': () => { closeModal(); closeReschedule(); closeProjectModal(); },
      '?': () => document.getElementById('shortcuts-overlay')?.classList.add('open'),
    };

    const fn = map[e.key.toLowerCase()] || map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });
}

/* ── EXPORTAR EXCEL ─────────────────────────────── */
function exportExcel() {
  if (!window.XLSX) return showToast('Biblioteca XLSX não carregada', 'warning');
  const rows = state.activities.map(a => ({
    Projeto: a.project, Equipe: a.team, Descrição: a.description,
    Responsável: a.responsible, Início: a.startDate, Término: a.dueDate,
    Status: a.status, Crítica: a.isCritical ? 'Sim' : 'Não',
    Prioridade: getPriority(a).label,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Atividades');
  XLSX.writeFile(wb, `taskflow-${todayISO()}.xlsx`);
  showToast('📥 Excel exportado!', 'success');
}

window.exportExcel = exportExcel;

/* ── SIDEBAR TOGGLE (MOBILE) ─────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

window.toggleSidebar = toggleSidebar;

/* ── FECHAR SHORTCUTS ───────────────────────────── */
function openShortcutsOverlay()  { document.getElementById('shortcuts-overlay')?.classList.add('open'); }
function closeShortcutsOverlay() { document.getElementById('shortcuts-overlay')?.classList.remove('open'); }
function closeShortcutsOutside(e) { if (e.target === document.getElementById('shortcuts-overlay')) closeShortcutsOverlay(); }

window.openShortcutsOverlay  = openShortcutsOverlay;
window.closeShortcutsOverlay = closeShortcutsOverlay;
window.closeShortcutsOutside = closeShortcutsOutside;
