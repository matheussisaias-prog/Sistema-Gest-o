/* ============================================================
   TASKFLOW — SCRIPT.JS
   Gestão de Atividades por Projeto
   Versão: 1.0.0
   Estrutura: pronta para integração com API/backend
============================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────────
   CONFIG
────────────────────────────────────────────────────────────── */
const CONFIG = {
  STORAGE_KEY:  'taskflow_activities',
  HISTORY_KEY:  'taskflow_history',
  MAX_HISTORY:  200,
  DATE_LOCALE:  'pt-BR',
  // Para futura integração com API:
  // API_BASE: 'https://seu-servidor.com/api',
  // API_TOKEN: '',
};

/* ──────────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────────── */
let state = {
  activities:       [],   // Array de objetos de atividade
  history:          [],   // Log de alterações
  currentSort:      { field: 'dueDate', dir: 'asc' },
  filters:          { project: '', team: '', status: '', dateFrom: '', dateTo: '' },
  editingId:        null,  // ID sendo editado
  reschedulingId:   null,  // ID sendo reprogramado
  currentView:      'dashboard',
};
window.state = state; // expõe para dashboard.js e outros módulos

/* ──────────────────────────────────────────────────────────────
   UTILITÁRIOS DE DATA
────────────────────────────────────────────────────────────── */

/** Retorna hoje no formato YYYY-MM-DD */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Formata YYYY-MM-DD para DD/MM/YYYY */
function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Diferença em dias entre data ISO e hoje (negativo = passado) */
function diffDays(iso) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

/** Formata timestamp para "HH:MM - DD/MM/YYYY" */
function formatTimestamp(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} — ${d.toLocaleDateString(CONFIG.DATE_LOCALE)}`;
}

/* ──────────────────────────────────────────────────────────────
   PRIORIDADE AUTOMÁTICA
────────────────────────────────────────────────────────────── */

/**
 * Retorna objeto { level, label, css } com base no atraso.
 * level: 'none' | 'low' | 'medium' | 'critical'
 */
function getPriority(activity) {
  if (activity.status === 'Concluído') return { level: 'none', label: '—', css: 'prio-none' };

  const diff = diffDays(activity.dueDate); // negativo = vencido

  if (diff > 0)    return { level: 'none',     label: 'Normal',   css: 'prio-none'     };
  if (diff === 0)  return { level: 'low',      label: 'Hoje',     css: 'prio-low'      };
  if (diff >= -2)  return { level: 'low',      label: '⚠ Leve',   css: 'prio-low'      };
  if (diff >= -4)  return { level: 'medium',   label: '⚡ Médio',  css: 'prio-medium'   };
  return               { level: 'critical', label: '🔥 Crítico', css: 'prio-critical' };
}

/* ──────────────────────────────────────────────────────────────
   LÓGICA DE STATUS AUTOMÁTICO
────────────────────────────────────────────────────────────── */

/**
 * Avalia se uma atividade deve ser marcada como "Vencido".
 * Regra: status != Concluído && data < hoje
 */
function autoUpdateStatus(activity) {
  if (activity.status === 'Concluído') return activity;
  const diff = diffDays(activity.dueDate);
  if (diff < 0 && activity.status !== 'Reprogramado') {
    activity.status = 'Vencido';
  }
  return activity;
}

/** Executa autoUpdateStatus em todas as atividades e persiste se houve mudança */
function runAutoUpdate() {
  let changed = false;
  state.activities = state.activities.map(a => {
    const before = a.status;
    const updated = autoUpdateStatus({ ...a });
    if (updated.status !== before) { changed = true; }
    return updated;
  });
  if (changed) persistActivities();
}

/* ──────────────────────────────────────────────────────────────
   PERSISTÊNCIA (LocalStorage — pronto para trocar por API)
────────────────────────────────────────────────────────────── */

function persistActivities() {
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.activities));
}

function persistHistory() {
  // Limita tamanho do histórico
  if (state.history.length > CONFIG.MAX_HISTORY) {
    state.history = state.history.slice(-CONFIG.MAX_HISTORY);
  }
  localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(state.history));
}

function loadData() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    state.activities = raw ? JSON.parse(raw) : [];
  } catch { state.activities = []; }

  try {
    const raw = localStorage.getItem(CONFIG.HISTORY_KEY);
    state.history = raw ? JSON.parse(raw) : [];
  } catch { state.history = []; }
}

/* ──────────────────────────────────────────────────────────────
   GERAÇÃO DE ID
────────────────────────────────────────────────────────────── */
function genId() {
  return `tf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/* ──────────────────────────────────────────────────────────────
   HISTÓRICO / LOG
────────────────────────────────────────────────────────────── */
function addHistory(action, activity, extra = '') {
  const entry = {
    id:        genId(),
    timestamp: Date.now(),
    action,
    activityId: activity.id,
    project:    activity.project,
    description: activity.description,
    extra,
  };
  state.history.unshift(entry); // mais recente primeiro
  persistHistory();
  renderHistory();
}

/* ──────────────────────────────────────────────────────────────
   CRUD DE ATIVIDADES
────────────────────────────────────────────────────────────── */

/** Cria nova atividade a partir dos campos do formulário */
function createActivity(data) {
  const activity = {
    id:          genId(),
    project:     data.project.trim(),
    team:        data.team || '',
    description: data.description.trim(),
    responsible: data.responsible ? data.responsible.trim() : '',
    local:       data.local       ? data.local.trim()       : '',
    servico:     data.servico     ? data.servico.trim()     : '',
    linha:       data.linha       ? data.linha.trim()       : '',
    lider:       data.lider       ? data.lider.trim()       : '',
    projetista:  data.projetista  ? data.projetista.trim()  : '',
    equipe:      Array.isArray(data.equipe) ? data.equipe   : [],
    startDate:   data.startDate || '',
    dueDate:     data.dueDate,
    duration:    data.duration  || null,
    status:      data.status || 'Pendente',
    progress:    data.progress != null ? parseInt(data.progress) : 0,
    obs:         data.obs ? data.obs.trim() : '',
    parentId:    data.parentId  || null,
    collapsed:   false,
    sortOrder:   Date.now(),
    createdAt:   Date.now(),
    updatedAt:   Date.now(),
  };
  autoUpdateStatus(activity);
  state.activities.push(activity);
  persistActivities();
  addHistory('Criada', activity);
  return activity;
}

/** Atualiza atividade existente */
function updateActivity(id, data, isReschedule = false) {
  const idx = state.activities.findIndex(a => a.id === id);
  if (idx === -1) return null;

  const prev = { ...state.activities[idx] };

  state.activities[idx] = {
    ...state.activities[idx],
    project:     data.project.trim(),
    team:        data.team || '',
    description: data.description.trim(),
    responsible: data.responsible ? data.responsible.trim() : '',
    local:       data.local       ? data.local.trim()       : '',
    servico:     data.servico     ? data.servico.trim()     : '',
    linha:       data.linha       ? data.linha.trim()       : '',
    lider:       data.lider       ? data.lider.trim()       : '',
    projetista:  data.projetista  ? data.projetista.trim()  : '',
    equipe:      Array.isArray(data.equipe) ? data.equipe   : (state.activities[idx].equipe || []),
    startDate:   data.startDate || state.activities[idx].startDate || '',
    dueDate:     data.dueDate,
    duration:    data.duration  || state.activities[idx].duration  || null,
    status:      isReschedule ? 'Reprogramado' : data.status,
    progress:    data.progress != null ? parseInt(data.progress) : (state.activities[idx].progress || 0),
    obs:         data.obs.trim(),
    parentId:    data.parentId !== undefined ? (data.parentId || null) : state.activities[idx].parentId,
    updatedAt:   Date.now(),
  };

  autoUpdateStatus(state.activities[idx]);
  persistActivities();

  const action = isReschedule ? 'Reprogramada' : 'Editada';
  const extra  = isReschedule ? `Nova data: ${formatDate(data.dueDate)}` : '';
  addHistory(action, state.activities[idx], extra);

  return state.activities[idx];
}

/** Marca como Concluído */
function completeActivity(id) {
  const idx = state.activities.findIndex(a => a.id === id);
  if (idx === -1) return;
  state.activities[idx].status    = 'Concluído';
  state.activities[idx].updatedAt = Date.now();
  persistActivities();
  addHistory('Concluída', state.activities[idx]);
}

/** Remove atividade */
function deleteActivity(id) {
  const activity = state.activities.find(a => a.id === id);
  if (!activity) return;
  state.activities = state.activities.filter(a => a.id !== id);
  persistActivities();
  addHistory('Excluída', activity);
}

/* ──────────────────────────────────────────────────────────────
   FILTROS E ORDENAÇÃO
────────────────────────────────────────────────────────────── */

function applyFilters() {
  state.filters.project  = document.getElementById('filter-project').value;
  state.filters.team     = document.getElementById('filter-team').value;
  state.filters.status   = document.getElementById('filter-status').value;
  state.filters.dateFrom = document.getElementById('filter-date-from').value;
  state.filters.dateTo   = document.getElementById('filter-date-to').value;
  renderActivities();
}

function clearFilters() {
  document.getElementById('filter-project').value   = '';
  document.getElementById('filter-team').value      = '';
  document.getElementById('filter-status').value    = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value   = '';
  state.filters = { project: '', team: '', status: '', dateFrom: '', dateTo: '' };
  renderActivities();
}

function getFiltered() {
  return state.activities.filter(a => {
    if (state.filters.project && a.project !== state.filters.project) return false;
    if (state.filters.team    && a.team    !== state.filters.team)    return false;
    if (state.filters.status  && a.status  !== state.filters.status)  return false;
    if (state.filters.dateFrom && a.dueDate < state.filters.dateFrom) return false;
    if (state.filters.dateTo   && a.dueDate > state.filters.dateTo)   return false;
    return true;
  });
}

function sortBy(field) {
  if (state.currentSort.field === field) {
    state.currentSort.dir = state.currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.currentSort = { field, dir: 'asc' };
  }
  renderActivities();
  updateSortArrows();
}

function getSorted(arr) {
  const { field, dir } = state.currentSort;
  return [...arr].sort((a, b) => {
    const va = field === 'progress' ? (a[field] || 0) : (a[field] || '').toString().toLowerCase();
    const vb = field === 'progress' ? (b[field] || 0) : (b[field] || '').toString().toLowerCase();
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

function updateSortArrows() {
  ['project', 'description', 'startDate', 'dueDate', 'responsible', 'status', 'progress'].forEach(f => {
    const el = document.getElementById(`sort-${f}`);
    if (!el) return;
    if (state.currentSort.field === f) {
      el.textContent = state.currentSort.dir === 'asc' ? '↑' : '↓';
    } else {
      el.textContent = '↕';
    }
  });
}

/* ──────────────────────────────────────────────────────────────
   RENDER — ROW
────────────────────────────────────────────────────────────── */
function rowClass(activity) {
  if (activity.status === 'Concluído')  return 'row-done';
  if (activity.status === 'Reprogramado') return 'row-rescheduled';
  const diff = diffDays(activity.dueDate);
  if (diff < 0)  return 'row-overdue';
  if (diff === 0) return 'row-today';
  return '';
}

function dateClass(activity) {
  if (activity.status === 'Concluído') return '';
  const diff = diffDays(activity.dueDate);
  if (diff < 0)  return 'date-overdue';
  if (diff === 0) return 'date-today';
  return 'date-future';
}

/* ──────────────────────────────────────────────────────────────
   DURAÇÃO AUTO-CALCULADA
────────────────────────────────────────────────────────────── */
function calcDurationHours(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate   + 'T00:00:00');
  const days = Math.round((e - s) / 86400000);
  return days > 0 ? days * 8 : null;
}

function autoCalcDuration() {
  const start    = document.getElementById('form-start-date').value;
  const end      = document.getElementById('form-date').value;
  const durField = document.getElementById('form-duration');
  if (!durField || durField.dataset.manualOverride) return;
  if (start && end) {
    const h = calcDurationHours(start, end);
    if (h !== null) durField.value = h;
  }
}

/* ──────────────────────────────────────────────────────────────
   ÁRVORE WBS (hierarquia ilimitada estilo MS Project)
────────────────────────────────────────────────────────────── */
function buildTree(activities) {
  const byId = {};
  activities.forEach(a => byId[a.id] = a);

  const roots = activities.filter(a => !a.parentId || !byId[a.parentId]);
  const childrenOf = {};
  activities.forEach(a => {
    if (a.parentId && byId[a.parentId]) {
      if (!childrenOf[a.parentId]) childrenOf[a.parentId] = [];
      childrenOf[a.parentId].push(a);
    }
  });

  const result = [];
  function walk(node, prefix, level) {
    const kids = (childrenOf[node.id] || []).sort((a, b) => (a.sortOrder||0) - (b.sortOrder||0));
    result.push({ ...node, _wbs: prefix, _level: level, _hasChildren: kids.length > 0 });
    if (!node.collapsed) {
      kids.forEach((child, i) => walk(child, `${prefix}.${i + 1}`, level + 1));
    }
  }
  roots.sort((a, b) => (a.sortOrder||0) - (b.sortOrder||0))
       .forEach((r, i) => walk(r, String(i + 1), 0));
  return result;
}

function toggleCollapse(id) {
  const idx = state.activities.findIndex(a => a.id === id);
  if (idx !== -1) {
    state.activities[idx].collapsed = !state.activities[idx].collapsed;
    persistActivities();
    renderActivities();
    renderCritical();
  }
}

function handleAddSub(parentId) {
  const parent = state.activities.find(a => a.id === parentId);
  state.editingId = null;
  openModal();
  setTimeout(() => {
    document.getElementById('form-parent').value = parentId;
    if (parent) {
      document.getElementById('form-project').value = parent.project || '';
      document.getElementById('form-team').value    = parent.team    || '';
    }
    document.getElementById('modal-title').textContent = 'Nova Sub-Atividade';
  }, 20);
}

function updateParentOptions(excludeId = null) {
  const sel = document.getElementById('form-parent');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Nenhuma (atividade raiz) —</option>';
  const tree = buildTree(state.activities.filter(a => a.id !== excludeId));
  tree.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    const pad = '  '.repeat(a._level);
    opt.textContent = `${pad}${a._wbs} — ${a.description.slice(0, 55)}`;
    sel.appendChild(opt);
  });
  sel.value = cur;
}

/* ──────────────────────────────────────────────────────────────
   RENDER — ROW (hierarquia WBS)
────────────────────────────────────────────────────────────── */
function renderRow(activity) {
  const prio  = getPriority(activity);
  const rc    = rowClass(activity);
  const dc    = dateClass(activity);
  const obs   = activity.obs ? activity.obs.replace(/"/g, '&quot;') : '';
  const obsAttr = obs ? `data-obs="${obs}"` : '';

  const level   = activity._level    || 0;
  const wbs     = activity._wbs      || '—';
  const hasKids = activity._hasChildren || false;
  const indent  = level * 18;

  const durH    = (activity.duration !== undefined && activity.duration !== null && activity.duration !== '')
    ? activity.duration
    : calcDurationHours(activity.startDate, activity.dueDate);
  const durDisplay = durH ? `${durH}h` : '—';

  const expandBtn = hasKids
    ? `<button class="btn-expand" onclick="toggleCollapse('${activity.id}')" title="${activity.collapsed?'Expandir':'Colapsar'}">${activity.collapsed?'▶':'▼'}</button>`
    : `<span class="expand-placeholder"></span>`;

  return `
    <tr class="${rc} level-${level}" id="row-${activity.id}">
      <td class="wbs-cell">
        <div style="display:flex;align-items:center;gap:3px;padding-left:${indent}px">
          ${expandBtn}<span class="wbs-num">${wbs}</span>
        </div>
      </td>
      <td class="fw-bold" style="font-size:0.75rem;color:var(--text-muted)">${escHtml(activity.project)}</td>
      <td class="desc-cell ${obs?'obs-tooltip':''}" title="${escHtml(activity.description)}" ${obsAttr} style="padding-left:${indent?indent+4:0}px">
        ${level > 0 ? '<span class="sub-arrow">↳</span>' : ''}
        <span style="font-weight:${level===0?600:400}">${escHtml(activity.description)}</span>
        ${obs ? ' <span style="opacity:.45;font-size:.7rem;">●</span>' : ''}
      </td>
      <td style="white-space:nowrap">${activity.startDate ? formatDate(activity.startDate) : '—'}</td>
      <td class="${dc}" style="white-space:nowrap">${formatDate(activity.dueDate)}</td>
      <td>${escHtml(activity.responsible)}</td>
      <td class="dur-auto">${durDisplay}</td>
      <td>
        <div class="progress-cell" style="min-width:70px">
          <div class="progress-mini-bar"><div class="progress-mini-fill" style="width:${activity.progress||0}%"></div></div>
          <span style="font-size:.68rem;font-weight:700;color:var(--text-muted);flex-shrink:0">${activity.progress||0}%</span>
        </div>
      </td>
      <td><span class="status-badge status-${escHtml(activity.status)}">${escHtml(activity.status)}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn-action btn-add-sub" onclick="handleAddSub('${activity.id}')" title="Adicionar sub-atividade">↳+</button>
          ${activity.status !== 'Concluído' ? `
            <button class="btn-action btn-complete"   onclick="handleComplete('${activity.id}')">✓</button>
            <button class="btn-action btn-reschedule" onclick="handleReschedule('${activity.id}')">⟳</button>
          ` : ''}
          <button class="btn-action btn-edit"   onclick="handleEdit('${activity.id}')">✎</button>
          <button class="btn-action btn-delete" onclick="handleDelete('${activity.id}')">✕</button>
        </div>
      </td>
    </tr>`;
}

/* ──────────────────────────────────────────────────────────────
   RENDER — TABELAS PRINCIPAIS
────────────────────────────────────────────────────────────── */
function renderActivities() {
  const filtered = getFiltered();
  const tree     = buildTree(filtered);

  const tbody    = document.getElementById('main-tbody');
  const empty    = document.getElementById('main-empty');

  if (!tbody || !empty) return;

  if (!tree.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = tree.map(renderRow).join('');
  updateFilterOptions();
}

function renderCritical() {
  const criticalFlat = state.activities
    .filter(a => a.status !== 'Concluído' && diffDays(a.dueDate) < 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const critical = buildTree(criticalFlat);

  const tbody = document.getElementById('critical-tbody');
  const empty = document.getElementById('critical-empty');

  if (!tbody || !empty) return;

  if (!critical.length) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    const wrap = document.querySelector('.activity-table-wrap');
    if (wrap) wrap.style.overflow = 'visible';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = critical.map(renderRow).join('');
}

/* ──────────────────────────────────────────────────────────────
   RENDER — KPI DASHBOARD
────────────────────────────────────────────────────────────── */
function renderKPIs() {
  const today = todayISO();

  const overdue  = state.activities.filter(a => a.status === 'Vencido').length;
  const todayAct = state.activities.filter(a => a.dueDate === today && a.status !== 'Concluído').length;
  const ok       = state.activities.filter(a => a.dueDate > today && a.status !== 'Concluído' && a.status !== 'Vencido').length;
  const done     = state.activities.filter(a => a.status === 'Concluído').length;

  document.getElementById('kpi-overdue').textContent = overdue;
  document.getElementById('kpi-today').textContent   = todayAct;
  document.getElementById('kpi-ok').textContent      = ok;
  document.getElementById('kpi-done').textContent    = done;

  // Badge crítico se há atividades com 5+ dias de atraso
  const critical = state.activities.filter(a =>
    a.status !== 'Concluído' && diffDays(a.dueDate) <= -5
  ).length;
  const badge = document.getElementById('kpi-critical-badge');
  if (badge) badge.style.display = critical > 0 ? 'flex' : 'none';
}

/* ──────────────────────────────────────────────────────────────
   RENDER — HISTÓRICO
────────────────────────────────────────────────────────────── */
function renderHistory() {
  const list  = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');

  if (!list) return;

  if (!state.history.length) {
    list.innerHTML = '';
    if (empty) { list.appendChild(empty); empty.style.display = 'flex'; }
    return;
  }

  if (empty) empty.style.display = 'none';

  const actionColors = {
    'Criada':      '#4f8bff',
    'Editada':     '#a78bfa',
    'Concluída':   '#2ecc87',
    'Reprogramada':'#ffc531',
    'Excluída':    '#ff4757',
  };

  list.innerHTML = state.history.map(h => `
    <div class="history-item">
      <div class="history-dot" style="background:${actionColors[h.action] || '#4f8bff'}"></div>
      <div style="flex:1">
        <div class="history-text">
          <strong>${escHtml(h.action)}</strong> — 
          <strong>${escHtml(h.project)}</strong>: ${escHtml(h.description)}
          ${h.extra ? `<span class="text-muted"> · ${escHtml(h.extra)}</span>` : ''}
        </div>
        <div class="history-time">${formatTimestamp(h.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

/* ──────────────────────────────────────────────────────────────
   RENDER COMPLETO
────────────────────────────────────────────────────────────── */
function renderAll() {
  runAutoUpdate();
  renderKPIs();
  renderCritical();
  renderActivities();
  renderHistory();
  updateFilterOptions();
  // Atualiza Kanban se estiver visível
  if (state.currentView === 'kanban') renderKanban();
  // Atualiza gráficos se visíveis
  if (state.currentView === 'charts')   setTimeout(renderCharts, 50);
  if (state.currentView === 'dashboard') setTimeout(renderMiniCharts, 50);
  // Sempre re-renderiza mini charts do dashboard em background
  setTimeout(renderMiniCharts, 100);
}

/* ──────────────────────────────────────────────────────────────
   ATUALIZAR OPTIONS DOS FILTROS
────────────────────────────────────────────────────────────── */
function updateFilterOptions() {
  const projects = [...new Set(state.activities.map(a => a.project).filter(Boolean))].sort();
  const teams    = [...new Set(state.activities.map(a => a.team).filter(Boolean))].sort();

  const fpEl = document.getElementById('filter-project');
  const ftEl = document.getElementById('filter-team');
  const cur_p = fpEl.value;
  const cur_t = ftEl.value;

  fpEl.innerHTML = '<option value="">Todos</option>' +
    projects.map(p => `<option value="${escAttr(p)}"${p === cur_p ? ' selected' : ''}>${escHtml(p)}</option>`).join('');

  ftEl.innerHTML = '<option value="">Todas</option>' +
    teams.map(t => `<option value="${escAttr(t)}"${t === cur_t ? ' selected' : ''}>${escHtml(t)}</option>`).join('');

  // Datalist do modal
  const dl = document.getElementById('projects-list');
  if (dl) dl.innerHTML = projects.map(p => `<option value="${escAttr(p)}">`).join('');
}

/* ──────────────────────────────────────────────────────────────
   HANDLERS — AÇÕES DA TABELA
────────────────────────────────────────────────────────────── */
function handleComplete(id) {
  completeActivity(id);
  renderAll();
  showToast('Atividade marcada como concluída ✓', 'success');
}

function handleReschedule(id) {
  state.reschedulingId = id;
  const activity = state.activities.find(a => a.id === id);
  if (activity) {
    document.getElementById('reschedule-date').value   = activity.dueDate;
    document.getElementById('reschedule-reason').value = '';
  }
  document.getElementById('reschedule-overlay').classList.add('open');
}

function confirmReschedule() {
  const newDate = document.getElementById('reschedule-date').value;
  const reason  = document.getElementById('reschedule-reason').value.trim();

  if (!newDate) { showToast('Selecione uma data', 'error'); return; }
  if (newDate === todayISO() && diffDays(newDate) === 0) {
    // Permite reprogramar para hoje
  }

  const activity = state.activities.find(a => a.id === state.reschedulingId);
  if (!activity) return;

  updateActivity(state.reschedulingId, {
    ...activity,
    dueDate: newDate,
    obs: reason ? `[Reprogramado: ${reason}] ${activity.obs}` : activity.obs,
  }, true);

  closeReschedule();
  renderAll();
  showToast('Atividade reprogramada', 'warning');
}

function handleEdit(id) {
  const activity = state.activities.find(a => a.id === id);
  if (!activity) return;

  state.editingId = id;
  document.getElementById('modal-title').textContent = 'Editar Atividade';
  document.getElementById('form-id').value            = id;
  document.getElementById('form-original-date').value = activity.dueDate;
  document.getElementById('form-project').value       = activity.project;
  document.getElementById('form-local').value         = activity.local       || '';
  document.getElementById('form-servico').value       = activity.servico     || '';
  document.getElementById('form-linha').value         = activity.linha       || '';
  document.getElementById('form-lider').value         = activity.lider       || '';
  document.getElementById('form-projetista').value    = activity.projetista  || '';
  document.getElementById('form-description').value  = activity.description;
  document.getElementById('form-start-date').value   = activity.startDate || '';
  document.getElementById('form-date').value         = activity.dueDate;
  document.getElementById('form-duration').value     = activity.duration  || '';
  document.getElementById('form-status').value       = activity.status === 'Vencido' ? 'Pendente' : activity.status;
  document.getElementById('form-obs').value          = activity.obs;
  const progEl = document.getElementById('form-progress');
  if (progEl) { progEl.value = activity.progress || 0; document.getElementById('form-progress-val').textContent = (activity.progress||0)+'%'; }

  // equipe tags
  _equipeMembers = Array.isArray(activity.equipe) ? [...activity.equipe] : [];
  renderEquipeTags();

  const dur = document.getElementById('form-duration');
  if (dur) delete dur.dataset.manualOverride;
  updateParentOptions(id);
  document.getElementById('form-parent').value = activity.parentId || '';
  document.getElementById('conflict-alert').style.display = 'none';
  updateLocalsDatalist();
  document.getElementById('modal-overlay').classList.add('open');
}

function handleDelete(id) {
  const activity = state.activities.find(a => a.id === id);
  if (!activity) return;
  if (!confirm(`Excluir a atividade "${activity.description}"?`)) return;
  deleteActivity(id);
  renderAll();
  showToast('Atividade excluída', 'error');
}

/* ──────────────────────────────────────────────────────────────
   FILTRO RÁPIDO VIA KPI CARDS (Dashboard)
────────────────────────────────────────────────────────────── */
function filterAndGo(type) {
  switchView('activities', document.querySelector('[data-view="activities"]'));

  // Reseta filtros
  clearFilters();

  if (type === 'Vencido' || type === 'Concluído') {
    document.getElementById('filter-status').value = type;
    state.filters.status = type;
  } else if (type === 'today') {
    document.getElementById('filter-date-from').value = todayISO();
    document.getElementById('filter-date-to').value   = todayISO();
    state.filters.dateFrom = todayISO();
    state.filters.dateTo   = todayISO();
  } else if (type === 'ok') {
    document.getElementById('filter-date-from').value = new Date(Date.now() + 86400000).toISOString().slice(0,10);
    state.filters.dateFrom = document.getElementById('filter-date-from').value;
    document.getElementById('filter-status').value = 'Pendente';
    state.filters.status = 'Pendente';
  }

  renderActivities();
}

/* ──────────────────────────────────────────────────────────────
   MODAL — NOVA / EDITAR ATIVIDADE
────────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────────
   EQUIPE — TAGS MÚLTIPLAS
────────────────────────────────────────────────────────────── */

let _equipeMembers = [];

function handleEquipeKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); addEquipeMember(); }
}

function addEquipeMember() {
  const input = document.getElementById('form-equipe-input');
  const name  = (input.value || '').trim();
  if (!name) return;
  if (_equipeMembers.includes(name)) {
    showToast(`${name} já está na equipe`, 'error');
    input.value = '';
    return;
  }
  _equipeMembers.push(name);
  input.value = '';
  renderEquipeTags();
  checkConflicts();
}

function removeEquipeMember(name) {
  _equipeMembers = _equipeMembers.filter(m => m !== name);
  renderEquipeTags();
  checkConflicts();
}

function renderEquipeTags() {
  const container = document.getElementById('form-equipe-tags');
  if (!container) return;
  container.innerHTML = _equipeMembers.map(name => `
    <span style="display:inline-flex;align-items:center;gap:5px;background:rgba(79,139,255,.12);
                 color:var(--primary);border-radius:100px;padding:3px 10px 3px 12px;font-size:.75rem;font-weight:600;">
      ${escHtml(name)}
      <button type="button" onclick="removeEquipeMember(${JSON.stringify(name)})"
              style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:.8rem;
                     line-height:1;padding:0;opacity:.7" title="Remover">✕</button>
    </span>
  `).join('');
}

/* ──────────────────────────────────────────────────────────────
   DETECÇÃO DE CONFLITO
────────────────────────────────────────────────────────────── */

/**
 * Verifica se algum membro da equipe (exceto o líder) tem sobreposição
 * de datas com outra atividade já cadastrada.
 * Retorna array de { member, project, start, end }
 */
function detectConflicts(data) {
  const startNew = data.startDate || data.dueDate;
  const endNew   = data.dueDate;
  if (!startNew || !endNew) return [];

  const lider   = (data.lider   || '').trim().toLowerCase();
  // membros a verificar: equipe + projetista, exceto o líder
  const toCheck = [...data.equipe];
  const proj    = (data.projetista || '').trim();
  if (proj && !toCheck.includes(proj)) toCheck.push(proj);

  const membersToCheck = toCheck
    .map(m => m.trim())
    .filter(m => m && m.toLowerCase() !== lider);

  if (membersToCheck.length === 0) return [];

  const conflicts = [];
  const editingId = state.editingId;

  for (const member of membersToCheck) {
    const memberLower = member.toLowerCase();

    for (const act of state.activities) {
      if (act.id === editingId) continue; // ignora a própria atividade sendo editada
      if (act.status === 'Concluído') continue;

      const actStart = act.startDate || act.dueDate;
      const actEnd   = act.dueDate;
      if (!actStart || !actEnd) continue;

      // Verifica sobreposição de datas
      const overlap = startNew <= actEnd && endNew >= actStart;
      if (!overlap) continue;

      // Verifica se o membro aparece nessa atividade
      const actEquipe    = Array.isArray(act.equipe) ? act.equipe.map(m => m.toLowerCase()) : [];
      const actProjetista = (act.projetista || '').trim().toLowerCase();
      const actResponsavel = (act.responsible || '').trim().toLowerCase();

      const memberInActivity =
        actEquipe.includes(memberLower) ||
        actProjetista === memberLower   ||
        actResponsavel === memberLower;

      if (memberInActivity) {
        // Evita duplicatas do mesmo membro+projeto
        const already = conflicts.find(c => c.member === member && c.project === act.project);
        if (!already) {
          conflicts.push({
            member,
            project: act.project,
            start:   actStart,
            end:     actEnd,
          });
        }
      }
    }
  }

  return conflicts;
}

/** Atualiza o painel de conflito inline no modal (chamado ao digitar datas/equipe) */
function checkConflicts() {
  const alertEl = document.getElementById('conflict-alert');
  const listEl  = document.getElementById('conflict-list');
  if (!alertEl || !listEl) return;

  const data = {
    startDate:  document.getElementById('form-start-date').value,
    dueDate:    document.getElementById('form-date').value,
    lider:      document.getElementById('form-lider').value,
    projetista: document.getElementById('form-projetista').value,
    equipe:     [..._equipeMembers],
  };

  const conflicts = detectConflicts(data);

  if (conflicts.length === 0) {
    alertEl.style.display = 'none';
  } else {
    listEl.innerHTML = conflicts.map(c =>
      `• <strong>${escHtml(c.member)}</strong> está em <em>${escHtml(c.project)}</em> (${formatDate(c.start)} → ${formatDate(c.end)})`
    ).join('<br>');
    alertEl.style.display = 'block';
  }
}

/* ──────────────────────────────────────────────────────────────
   DATALISTS — SUGESTÕES AUTOMÁTICAS
────────────────────────────────────────────────────────────── */

/** Atualiza datalist de locais a partir das atividades existentes */
function updateLocalsDatalist() {
  const locals = [...new Set(state.activities.map(a => a.local).filter(Boolean))].sort();
  const dl = document.getElementById('locals-list');
  if (dl) dl.innerHTML = locals.map(l => `<option value="${escAttr(l)}">`).join('');
}

/** Atualiza datalist de membros (todos os membros já cadastrados) */
function updateMembersDatalist(datalistId, query) {
  const allMembers = new Set();
  state.activities.forEach(a => {
    if (a.lider)      allMembers.add(a.lider.trim());
    if (a.projetista) allMembers.add(a.projetista.trim());
    if (a.responsible) allMembers.add(a.responsible.trim());
    if (Array.isArray(a.equipe)) a.equipe.forEach(m => allMembers.add(m.trim()));
  });
  const filtered = [...allMembers].filter(m => m && (!query || m.toLowerCase().includes(query.toLowerCase()))).sort();
  const dl = document.getElementById(datalistId);
  if (dl) dl.innerHTML = filtered.map(m => `<option value="${escAttr(m)}">`).join('');
}

function openModal() {
  state.editingId = null;
  document.getElementById('modal-title').textContent = 'Nova Atividade';
  document.getElementById('form-id').value            = '';
  document.getElementById('form-original-date').value = '';
  document.getElementById('form-project').value       = '';
  document.getElementById('form-local').value         = '';
  document.getElementById('form-servico').value       = '';
  document.getElementById('form-linha').value         = '';
  document.getElementById('form-lider').value         = '';
  document.getElementById('form-projetista').value    = '';
  document.getElementById('form-start-date').value   = '';
  document.getElementById('form-duration').value     = '';
  document.getElementById('form-description').value  = '';
  document.getElementById('form-date').value         = todayISO();
  document.getElementById('form-status').value       = 'Pendente';
  document.getElementById('form-obs').value          = '';
  const progEl = document.getElementById('form-progress');
  if (progEl) { progEl.value = 0; document.getElementById('form-progress-val').textContent = '0%'; }
  // reset equipe tags
  _equipeMembers = [];
  renderEquipeTags();
  // reset manual override
  const dur = document.getElementById('form-duration');
  if (dur) delete dur.dataset.manualOverride;
  // reset conflito
  document.getElementById('conflict-alert').style.display = 'none';
  updateParentOptions();
  document.getElementById('form-parent').value = '';
  updateLocalsDatalist();
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  state.editingId = null;
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function saveActivity() {
  const data = {
    project:     document.getElementById('form-project').value,
    local:       document.getElementById('form-local').value,
    servico:     document.getElementById('form-servico').value,
    linha:       document.getElementById('form-linha').value,
    lider:       document.getElementById('form-lider').value,
    projetista:  document.getElementById('form-projetista').value,
    equipe:      [..._equipeMembers],
    description: document.getElementById('form-description').value,
    team:        document.getElementById('form-project').value, // compatibilidade
    responsible: document.getElementById('form-lider').value || document.getElementById('form-projetista').value,
    startDate:   document.getElementById('form-start-date').value,
    dueDate:     document.getElementById('form-date').value,
    duration:    document.getElementById('form-duration').value || null,
    status:      document.getElementById('form-status').value,
    progress:    parseInt(document.getElementById('form-progress')?.value || 0),
    obs:         document.getElementById('form-obs').value,
    parentId:    document.getElementById('form-parent').value || null,
  };

  // ── Validação
  if (!data.project)     { showToast('Informe o projeto',           'error'); return; }
  if (!data.local)       { showToast('Informe o local (empresa)',   'error'); return; }
  if (!data.servico)     { showToast('Informe o serviço',           'error'); return; }
  if (!data.description) { showToast('Descreva a atividade',        'error'); return; }
  if (!data.lider)       { showToast('Informe o líder do projeto',  'error'); return; }
  if (!data.projetista)  { showToast('Informe o projetista',        'error'); return; }
  if (!data.dueDate)     { showToast('Informe a data prevista',     'error'); return; }

  // ── Verificação de conflito (equipe, exceto líder)
  const conflicts = detectConflicts(data);
  if (conflicts.length > 0) {
    const names = conflicts.map(c => `• <strong>${c.member}</strong> já está em <em>${c.project}</em> (${formatDate(c.start)} → ${formatDate(c.end)})`).join('<br>');
    const proceed = confirm(
      `⚠ Conflito de Agenda Detectado!\n\n` +
      conflicts.map(c => `• ${c.member} já está em "${c.project}" (${formatDate(c.start)} → ${formatDate(c.end)})`).join('\n') +
      `\n\nDeseja adicionar mesmo assim?`
    );
    if (!proceed) return;
  }

  if (state.editingId) {
    const originalDate = document.getElementById('form-original-date').value;
    const isReschedule = originalDate && originalDate !== data.dueDate;
    updateActivity(state.editingId, data, isReschedule);
    showToast('Atividade atualizada ✓', 'success');
  } else {
    createActivity(data);
    showToast('Atividade criada ✓', 'success');
  }

  closeModal();
  renderAll();
}

/* ──────────────────────────────────────────────────────────────
   MODAL — REPROGRAMAR
────────────────────────────────────────────────────────────── */
function closeReschedule(e) {
  if (e && e.target !== document.getElementById('reschedule-overlay')) return;
  document.getElementById('reschedule-overlay').classList.remove('open');
  state.reschedulingId = null;
}

/* ──────────────────────────────────────────────────────────────
   HISTÓRICO — LIMPAR
────────────────────────────────────────────────────────────── */
function clearHistory() {
  if (!confirm('Limpar todo o histórico de alterações?')) return;
  state.history = [];
  persistHistory();
  renderHistory();
  showToast('Histórico limpo', 'info');
}

/* ──────────────────────────────────────────────────────────────
   VIEWS — NAVEGAÇÃO
────────────────────────────────────────────────────────────── */
function switchView(viewName, navEl) {
  // Esconde todas as views
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));

  // Mostra a view alvo
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove('hidden');

  // Atualiza nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = navEl || document.querySelector(`[data-view="${viewName}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Atualiza título
  const titles = { dashboard: 'Dashboard', activities: 'Atividades', history: 'Histórico' };
  document.getElementById('page-title').textContent = titles[viewName] || viewName;

  state.currentView = viewName;

  // Renderiza Kanban ao entrar
  if (viewName === 'kanban')    setTimeout(renderKanban, 50);
  if (viewName === 'portfolio') setTimeout(renderPortfolio, 50);
  if (viewName === 'recursos')  setTimeout(renderRecursos, 50);

  // Fecha sidebar em mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }

  return false; // previne navegação
}

/* ──────────────────────────────────────────────────────────────
   SIDEBAR TOGGLE (mobile)
────────────────────────────────────────────────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ──────────────────────────────────────────────────────────────
   TOAST
────────────────────────────────────────────────────────────── */
let toastTimer = null;

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

/* ──────────────────────────────────────────────────────────────
   CLOCK
────────────────────────────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2, '0');
  const mm  = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('sidebar-clock').textContent = `${hh}:${mm}`;
  document.getElementById('sidebar-date').textContent =
    now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ──────────────────────────────────────────────────────────────
   ESCAPE HELPERS (XSS prevention)
────────────────────────────────────────────────────────────── */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) { return escHtml(str); }

/* ──────────────────────────────────────────────────────────────
   DADOS DE DEMONSTRAÇÃO
────────────────────────────────────────────────────────────── */
function loadDemoData() {
  if (state.activities.length > 0) return; // Não sobrescreve dados existentes

  const today  = todayISO();
  const past3  = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const past7  = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const future5  = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const future15 = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

  const past14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const past10 = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const future20 = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  const future30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const demos = [
    { project: 'Portal Cliente',  description: 'Implementar login SSO',       responsible: 'Ana Lima',    lider: 'Ana Lima',    projetista: 'Bruno Souza', equipe: ['Ana Lima','Bruno Souza'],          startDate: past14,  dueDate: past7,    status: 'Pendente',     progress: 65, obs: 'Aguarda credenciais do cliente' },
    { project: 'Portal Cliente',  description: 'Testes de integração API',    responsible: 'Bruno Souza', lider: 'Ana Lima',    projetista: 'Bruno Souza', equipe: ['Bruno Souza','Carla Mendes'],      startDate: past7,   dueDate: past3,    status: 'Pendente',     progress: 30, obs: '' },
    { project: 'ERP Interno',     description: 'Módulo de relatórios',        responsible: 'Carla Mendes',lider: 'Carla Mendes',projetista: 'Diego Costa', equipe: ['Carla Mendes','Diego Costa'],      startDate: past10,  dueDate: today,    status: 'Pendente',     progress: 80, obs: 'Prioridade alta' },
    { project: 'ERP Interno',     description: 'Migração de banco de dados',  responsible: 'Diego Costa', lider: 'Carla Mendes',projetista: 'Diego Costa', equipe: ['Diego Costa','Bruno Souza'],       startDate: today,   dueDate: future5,  status: 'Pendente',     progress: 10, obs: '' },
    { project: 'App Mobile',      description: 'Tela de onboarding',          responsible: 'Elena Rocha', lider: 'Elena Rocha', projetista: 'Felipe Neto', equipe: ['Elena Rocha'],                     startDate: past14,  dueDate: future15, status: 'Concluído',    progress: 100,obs: 'Entregue antes do prazo' },
    { project: 'App Mobile',      description: 'Push notifications',          responsible: 'Felipe Neto', lider: 'Elena Rocha', projetista: 'Felipe Neto', equipe: ['Felipe Neto','Ana Lima'],          startDate: past3,   dueDate: future15, status: 'Pendente',     progress: 45, obs: '' },
    { project: 'Infraestrutura',  description: 'Atualização de servidores',   responsible: 'Gabi Alves',  lider: 'Gabi Alves',  projetista: 'Hugo Pires',  equipe: ['Gabi Alves','Hugo Pires'],         startDate: today,   dueDate: future20, status: 'Reprogramado', progress: 20, obs: '[Reprogramado: aguardo janela de manutenção]' },
    { project: 'Infraestrutura',  description: 'Backup automático',           responsible: 'Hugo Pires',  lider: 'Gabi Alves',  projetista: 'Hugo Pires',  equipe: ['Hugo Pires'],                      startDate: past14,  dueDate: past3,    status: 'Concluído',    progress: 100,obs: '' },
    { project: 'Infraestrutura',  description: 'Monitoramento de redes',      responsible: 'Ana Lima',    lider: 'Gabi Alves',  projetista: 'Ana Lima',    equipe: ['Ana Lima','Diego Costa'],          startDate: future5, dueDate: future30, status: 'Pendente',     progress: 0,  obs: 'Ana Lima também no Portal Cliente — conflito' },
  ];

  demos.forEach(d => createActivity(d));
}

/* ──────────────────────────────────────────────────────────────
   INTEGRAÇÃO COM API (placeholder para futuro backend)
   Basta descomentar e adaptar as funções abaixo para PHP/REST
────────────────────────────────────────────────────────────── */

/*
async function apiGetActivities() {
  const res = await fetch(`${CONFIG.API_BASE}/activities`, {
    headers: { 'Authorization': `Bearer ${CONFIG.API_TOKEN}` }
  });
  return res.json();
}

async function apiSaveActivity(data) {
  const method = data.id ? 'PUT' : 'POST';
  const url    = data.id ? `${CONFIG.API_BASE}/activities/${data.id}` : `${CONFIG.API_BASE}/activities`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.API_TOKEN}` },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function apiDeleteActivity(id) {
  await fetch(`${CONFIG.API_BASE}/activities/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${CONFIG.API_TOKEN}` }
  });
}
*/

/* ──────────────────────────────────────────────────────────────
   INICIALIZAÇÃO
────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // 1. Carrega dados do LocalStorage
  loadData();

  // 2. Insere dados de demo se não houver nada
  loadDemoData();

  // 3. Atualização automática de status vencidos
  runAutoUpdate();

  // 4. Renderiza tudo
  renderAll();

  // 5. Relógio
  updateClock();
  setInterval(updateClock, 1000);

  // 6. Auto-atualização a cada 5 minutos (para sistemas que ficam abertos o dia todo)
  setInterval(() => {
    runAutoUpdate();
    renderKPIs();
    renderCritical();
    if (state.currentView === 'activities') renderActivities();
  }, 5 * 60 * 1000);

  // 7. Atalho de teclado: ESC fecha modais
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      document.getElementById('reschedule-overlay').classList.remove('open');
    }
  });

  console.log('%c TaskFlow iniciado ✦ ', 'background:#4f8bff;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold');
});

/* ══════════════════════════════════════════════════════════════
   TELEGRAM INTEGRATION
══════════════════════════════════════════════════════════════ */

const WA_CONFIG_KEY = 'taskflow_wa_config';

function loadWAConfig() {
  try {
    const raw = localStorage.getItem(WA_CONFIG_KEY);
    return raw ? JSON.parse(raw) : { phone: '', apikey: '', auto: '1' };
  } catch { return { phone: '', apikey: '', auto: '1' }; }
}

window.saveWAConfig = function saveWAConfig() {
  const token   = document.getElementById('wa-apikey').value.trim();
  const chatId  = document.getElementById('wa-phone').value.trim();
  const auto    = document.getElementById('wa-auto').value;
  const company = (document.getElementById('wa-company')?.value || '').trim();
  if (!token)  return showToast('⚠ Cole o Token do bot', 'warning');
  if (!chatId) return showToast('⚠ Detecte ou informe o Chat ID', 'warning');
  const cfg = { phone: chatId, apikey: token, auto, company };
  localStorage.setItem(WA_CONFIG_KEY, JSON.stringify(cfg));
  if (company) localStorage.setItem('taskflow_brand', JSON.stringify({ name: company }));
  closeWAConfig();
  showToast('✅ Telegram configurado!', 'success');
}

function _waConfig() {
  try { return JSON.parse(localStorage.getItem(WA_CONFIG_KEY) || '{}'); } catch(_) { return {}; }
}

/**
 * Detecta o Chat ID automaticamente via getUpdates
 */
window.detectTelegramChatId = async function detectTelegramChatId() {
  const token = document.getElementById('wa-apikey').value.trim();
  if (!token) { showToast('Cole o Token primeiro', 'warning'); return; }

  const statusEl = document.getElementById('wa-status-msg');
  statusEl.style.display = 'block';
  statusEl.style.color   = 'var(--text-muted)';
  statusEl.innerHTML     = '⏳ Buscando Chat ID...';

  try {
    const res  = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const data = await res.json();

    if (!data.ok) {
      statusEl.style.color = '#dc2626';
      statusEl.innerHTML   = '✗ Token inválido. Verifique e tente novamente.';
      return;
    }

    if (!data.result || data.result.length === 0) {
      statusEl.style.color = '#d97706';
      statusEl.innerHTML   = '⚠ Nenhuma mensagem encontrada. Abra o Telegram, mande <strong>/start</strong> para <strong>@TaskeFlowbot</strong> e clique Detectar novamente.';
      return;
    }

    // Pega o chat ID da mensagem mais recente
    const msg    = data.result[data.result.length - 1];
    const chatId = msg.message?.chat?.id || msg.channel_post?.chat?.id;

    if (!chatId) {
      statusEl.style.color = '#dc2626';
      statusEl.innerHTML   = '✗ Não foi possível extrair o Chat ID. Mande uma mensagem ao bot e tente de novo.';
      return;
    }

    document.getElementById('wa-phone').value = chatId;
    statusEl.style.color = '#059669';
    statusEl.innerHTML   = `✅ Chat ID detectado: <strong>${chatId}</strong> — clique Salvar!`;

  } catch(e) {
    statusEl.style.color = '#dc2626';
    statusEl.innerHTML   = '✗ Erro: ' + e.message;
  }
}

/**
 * Envia mensagem via Telegram Bot API
 */
async function sendWAMessage(text, cfg) {
  const token  = (cfg && cfg.apikey) || _waConfig().apikey;
  const chatId = (cfg && cfg.phone)  || _waConfig().phone;
  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    chatId,
        text:       text,
        parse_mode: 'Markdown'
      })
    });
    const data = await res.json();
    if (data.ok) {
      console.log('✅ Telegram: mensagem enviada');
      return true;
    }
    console.warn('Telegram recusou:', data.description);
    return false;
  } catch(e) {
    console.error('Telegram erro:', e.message);
    return false;
  }
}

/**
 * Monta e envia alertas das atividades atrasadas
 */
async function sendOverdueAlerts(cfg, triggeredBy = 'auto') {
  if (!cfg || !cfg.phone || !cfg.apikey) return;

  const overdue = state.activities.filter(a =>
    a.status !== 'Concluído' && diffDays(a.dueDate) < 0
  ).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const today = state.activities.filter(a =>
    a.status !== 'Concluído' && diffDays(a.dueDate) === 0
  );

  if (overdue.length === 0 && today.length === 0) return;

  let msg = `⚠️ *TaskFlow PRO — Alertas*
`;
  msg += `📅 ${new Date().toLocaleDateString('pt-BR')}

`;

  if (overdue.length > 0) {
    msg += `🔴 *Atrasadas (${overdue.length}):*
`;
    overdue.slice(0, 5).forEach(a => {
      const dias = Math.abs(diffDays(a.dueDate));
      msg += `• ${a.description} — ${a.project} (${dias}d atraso)\n`;
    });
    if (overdue.length > 5) msg += `_...e mais ${overdue.length - 5}_\n`;
    msg += '\n';
  }

  if (today.length > 0) {
    msg += `🟡 *Vencem hoje (${today.length}):*\n`;
    today.forEach(a => {
      msg += `• ${a.description} — ${a.project}\n`;
    });
  }

  await sendWAMessage(msg, cfg);
}

function scheduleAutoAlerts() {
  // Roda a cada 30 minutos — envia apenas se passou 30min desde o último envio
  setInterval(() => {
    const c = loadWAConfig();
    if (c.auto !== '1') return;
    const last = parseInt(localStorage.getItem('taskflow_wa_last_sent') || '0');
    if ((Date.now() - last) >= 30 * 60 * 1000) {
      sendOverdueAlerts(c, 'interval');
    }
  }, 30 * 60 * 1000);
}

window.openWAConfig = function openWAConfig() {
  const cfg = loadWAConfig();
  document.getElementById('wa-apikey').value = cfg.apikey  || '';
  document.getElementById('wa-phone').value  = cfg.phone   || '';
  document.getElementById('wa-auto').value   = cfg.auto    || '1';
  const compEl = document.getElementById('wa-company');
  if (compEl) compEl.value = cfg.company || '';
  document.getElementById('wa-status-msg').style.display = 'none';
  document.getElementById('wa-config-overlay').classList.add('open');
}

window.closeWAConfig = function closeWAConfig() {
  document.getElementById('wa-config-overlay').classList.remove('open');
}

window.closeWAConfigOutside = function closeWAConfigOutside(e) {
  if (e.target === document.getElementById('wa-config-overlay')) closeWAConfig();
}

window.testWAMessage = async function testWAMessage() {
  const token  = document.getElementById('wa-apikey').value.trim();
  const chatId = document.getElementById('wa-phone').value.trim();
  if (!token || !chatId) {
    showToast('Preencha Token e Chat ID (use o botão Detectar)', 'warning');
    return;
  }

  const statusEl = document.getElementById('wa-status-msg');
  statusEl.style.display = 'block';
  statusEl.style.color   = 'var(--text-muted)';
  statusEl.innerHTML     = '⏳ Enviando mensagem de teste...';

  const msg = '✅ *TaskFlow PRO* — Conexão confirmada\! Alertas de atividades ativados.';
  const ok  = await sendWAMessage(msg, { phone: chatId, apikey: token });

  if (ok) {
    statusEl.style.color = '#059669';
    statusEl.innerHTML   = '✅ Mensagem enviada! Verifique o Telegram.';
  } else {
    statusEl.style.color = '#dc2626';
    statusEl.innerHTML   = '✗ Falhou. Verifique o Token e o Chat ID.';
  }
}

window.closeWAConfig         = closeWAConfig;
window.closeWAConfigOutside  = closeWAConfigOutside;
window.testWAMessage         = testWAMessage;
window.sendWAMessage         = sendWAMessage;
window.scheduleAutoAlerts    = scheduleAutoAlerts;

/* ══════════════════════════════════════════════════════════════
   PROJETOS — CRUD
══════════════════════════════════════════════════════════════ */

const PROJECTS_KEY    = 'taskflow_projects';
const PROJECT_COLORS  = [
  '#4f8bff','#2ecc87','#ffc531','#ff4757','#a78bfa',
  '#ff6b35','#00d2d3','#ff9ff3','#54a0ff','#5f27cd'
];

let projectState = {
  projects: [],
  editingProjectId: null,
  selectedColor: PROJECT_COLORS[0],
};

function loadProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    projectState.projects = raw ? JSON.parse(raw) : [];
  } catch { projectState.projects = []; }
}

function persistProjects() {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projectState.projects));
}

function genProjectId() {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
}

function saveProject() {
  const code     = document.getElementById('proj-code').value.trim();
  const name     = document.getElementById('proj-name').value.trim();
  const desc     = document.getElementById('proj-desc').value.trim();
  const manager  = document.getElementById('proj-manager').value.trim();
  const status   = document.getElementById('proj-status').value;
  const start    = document.getElementById('proj-start').value;
  const end      = document.getElementById('proj-end').value;
  const duration = document.getElementById('proj-duration').value;
  const progress = parseInt(document.getElementById('proj-progress').value, 10) || 0;
  const color    = projectState.selectedColor;

  if (!name)    { showToast('Informe o nome do projeto', 'error'); return; }
  if (!manager) { showToast('Informe o responsável', 'error'); return; }
  if (!start)   { showToast('Informe a data de início', 'error'); return; }

  if (projectState.editingProjectId) {
    const idx = projectState.projects.findIndex(p => p.id === projectState.editingProjectId);
    if (idx !== -1) {
      projectState.projects[idx] = { ...projectState.projects[idx], code, name, desc, manager, status, start, end, duration, progress, color, updatedAt: Date.now() };
      showToast('Projeto atualizado ✓', 'success');
    }
  } else {
    const proj = { id: genProjectId(), code, name, desc, manager, status, start, end, duration, progress, color, createdAt: Date.now(), updatedAt: Date.now() };
    projectState.projects.push(proj);
    showToast('Projeto criado ✓', 'success');

    // Também adiciona ao datalist de atividades
    updateFilterOptions();
  }

  persistProjects();
  closeProjectModal();
  renderProjects();
}

function deleteProject(id) {
  const proj = projectState.projects.find(p => p.id === id);
  if (!proj) return;
  if (!confirm(`Excluir o projeto "${proj.name}"? As atividades vinculadas não serão removidas.`)) return;
  projectState.projects = projectState.projects.filter(p => p.id !== id);
  persistProjects();
  renderProjects();
  showToast('Projeto excluído', 'error');
}

function editProject(id) {
  const proj = projectState.projects.find(p => p.id === id);
  if (!proj) return;

  projectState.editingProjectId = id;
  document.getElementById('project-modal-title').textContent = 'Editar Projeto';
  document.getElementById('proj-form-id').value    = id;
  document.getElementById('proj-code').value       = proj.code     || '';
  document.getElementById('proj-name').value       = proj.name;
  document.getElementById('proj-desc').value       = proj.desc     || '';
  document.getElementById('proj-manager').value    = proj.manager  || '';
  document.getElementById('proj-status').value     = proj.status   || 'Em andamento';
  document.getElementById('proj-start').value      = proj.start    || '';
  document.getElementById('proj-end').value        = proj.end      || '';
  document.getElementById('proj-duration').value   = proj.duration || '';
  const prog = proj.progress ?? 0;
  document.getElementById('proj-progress').value   = prog;
  document.getElementById('proj-progress-val').textContent = prog + '%';
  projectState.selectedColor = proj.color || PROJECT_COLORS[0];
  renderColorPicker();
  document.getElementById('project-modal-overlay').classList.add('open');
}

/* ── Render projetos ── */
function renderProjects() {
  const grid  = document.getElementById('projects-grid');
  const empty = document.getElementById('projects-empty');

  if (!projectState.projects.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = projectState.projects.map(proj => {
    // Calcula atividades vinculadas
    const linked    = state.activities.filter(a => a.project === proj.name);
    const total     = linked.length;
    const done      = linked.filter(a => a.status === 'Concluído').length;
    const overdue   = linked.filter(a => a.status === 'Vencido').length;
    // Usa progresso manual do Gantt se não há atividades vinculadas
    const pct       = total > 0 ? Math.round((done / total) * 100) : (proj.progress ?? 0);

    // Datas
    const startFmt  = proj.start ? formatDate(proj.start) : '—';
    const endFmt    = proj.end   ? formatDate(proj.end)   : '—';
    let deadlineWarn = '';
    if (proj.end && proj.status !== 'Encerrado' && proj.status !== 'Finalizadas') {
      const d = diffDays(proj.end);
      if (d < 0)   deadlineWarn = `<span style="color:var(--red);font-size:.7rem;"> ● Prazo vencido</span>`;
      else if (d <= 7) deadlineWarn = `<span style="color:var(--yellow);font-size:.7rem;"> ● Vence em ${d}d</span>`;
    }

    // Badge de status com ícone do Gantt
    const statusIcon = {
      'Em andamento': '●', 'Novas': '✦', 'Finalizadas': '✓',
      'Ativo': '●', 'Pausado': '⏸', 'Encerrado': '✓'
    }[proj.status] || '●';

    return `
    <div class="project-card" id="projcard-${proj.id}">
      <div class="project-card-accent" style="background:${escHtml(proj.color || PROJECT_COLORS[0])}"></div>
      <div class="project-card-header">
        <div>
          ${proj.code ? `<div style="font-size:.68rem;font-weight:600;color:var(--text-muted);letter-spacing:.04em;margin-bottom:3px">${escHtml(proj.code)}</div>` : ''}
          <div class="project-card-name">${escHtml(proj.name)}</div>
          <span class="project-status-badge proj-${escHtml(proj.status)}" style="margin-top:5px;display:inline-flex">
            ${statusIcon} ${escHtml(proj.status)}
          </span>
        </div>
        <div class="project-card-actions">
          <button class="btn-action btn-edit"   onclick="editProject('${proj.id}')">✎</button>
          <button class="btn-action btn-delete" onclick="deleteProject('${proj.id}')">✕</button>
        </div>
      </div>

      ${proj.desc ? `<div class="project-card-desc">${escHtml(proj.desc)}</div>` : '<div class="project-card-desc" style="opacity:.4">Sem descrição</div>'}

      <div class="project-meta">
        <div class="project-meta-row">👤 <strong>Gestor:</strong> ${escHtml(proj.manager || '—')}
        </div>
        <div class="project-meta-row">📅 <strong>Início:</strong> ${startFmt} &nbsp;→&nbsp; <strong>Fim:</strong> ${endFmt}${deadlineWarn}</div>
        ${proj.duration ? `<div class="project-meta-row">⏱ <strong>Duração:</strong> ${escHtml(String(proj.duration))}h</div>` : ''}
      </div>

      <div class="project-progress-wrap">
        <div class="project-progress-label">
          <span>Progresso${total > 0 ? ' (atividades)' : ' (Gantt)'}</span>
          <span style="font-weight:700;color:var(--primary)">${pct}%${total > 0 ? ` · ${done}/${total}${overdue > 0 ? ` · <span style="color:var(--red)">${overdue} atrasada(s)</span>` : ''}` : ''}</span>
        </div>
        <div class="project-progress-bar">
          <div class="project-progress-fill" style="width:${pct}%;background:${escHtml(proj.color || PROJECT_COLORS[0])}"></div>
        </div>
      </div>

      <div class="project-card-footer">
        <span class="project-tasks-count">◈ ${total} atividade(s)</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn btn-ghost btn-sm" onclick="openModalForProject('${escAttr(proj.name)}')" title="Adicionar atividade neste projeto" style="color:var(--primary);font-weight:700">＋ Atividade</button>
          <button class="btn btn-ghost btn-sm" onclick="filterAndGo('proj_${escAttr(proj.name)}')">Ver atividades →</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── Abrir modal de atividade pré-selecionando o projeto ── */
function openModalForProject(projName) {
  openModal();
  setTimeout(() => {
    const inp = document.getElementById('form-project');
    if (inp) inp.value = projName;
    document.getElementById('form-description')?.focus();
  }, 80);
}
window.openModalForProject = openModalForProject;

/* ── Modal projeto ── */
function openProjectModal() {
  projectState.editingProjectId = null;
  document.getElementById('project-modal-title').textContent = 'Novo Projeto';
  document.getElementById('proj-form-id').value    = '';
  document.getElementById('proj-code').value       = '';
  document.getElementById('proj-name').value       = '';
  document.getElementById('proj-desc').value       = '';
  document.getElementById('proj-manager').value    = '';
  document.getElementById('proj-status').value     = 'Em andamento';
  document.getElementById('proj-start').value      = todayISO();
  document.getElementById('proj-end').value        = '';
  document.getElementById('proj-duration').value   = '';
  document.getElementById('proj-progress').value   = 0;
  document.getElementById('proj-progress-val').textContent = '0%';
  projectState.selectedColor = PROJECT_COLORS[0];
  renderColorPicker();
  document.getElementById('project-modal-overlay').classList.add('open');
}

function closeProjectModal() {
  document.getElementById('project-modal-overlay').classList.remove('open');
  projectState.editingProjectId = null;
}

function closeProjectModalOutside(e) {
  if (e.target === document.getElementById('project-modal-overlay')) closeProjectModal();
}

function renderColorPicker() {
  const wrap = document.getElementById('proj-color-picker');
  if (!wrap) return;
  wrap.innerHTML = PROJECT_COLORS.map(c => `
    <div class="color-swatch ${c === projectState.selectedColor ? 'selected' : ''}"
         style="background:${c}"
         onclick="selectProjectColor('${c}', this)"
         title="${c}"></div>
  `).join('');
}

function selectProjectColor(color, el) {
  projectState.selectedColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

/* ── Estende filterAndGo para projetos ── */
const _origFilterAndGo = filterAndGo;
filterAndGo = function(type) {
  if (typeof type === 'string' && type.startsWith('proj_')) {
    const projName = type.replace('proj_', '');
    switchView('activities', document.querySelector('[data-view="activities"]'));
    clearFilters();
    document.getElementById('filter-project').value = projName;
    state.filters.project = projName;
    renderActivities();
    return;
  }
  _origFilterAndGo(type);
};

/* ── Estende renderRow para mostrar botão WA ── */
const _origRenderRow = renderRow;
renderRow = function(activity) {
  let html = _origRenderRow(activity);
  // Insere botão WA apenas se estiver atrasada
  if (activity.status !== 'Concluído' && diffDays(activity.dueDate) < 0) {
    html = html.replace(
      `<button class="btn-action btn-edit"   onclick="handleEdit('${activity.id}')">`,
      `<button class="btn-action btn-wa" onclick="sendSingleActivityAlert('${activity.id}')" title="Alertar via WhatsApp">📱</button>
       <button class="btn-action btn-edit"   onclick="handleEdit('${activity.id}')">`,
    );
  }
  return html;
};

/* ══════════════════════════════════════════════════════════════
   INICIALIZAÇÃO — EXTENSÃO
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Carrega projetos
  loadProjects();
  renderProjects();

  // Atualiza título de projects na navegação
  const origSwitchView = switchView;
  // Patch titles para incluir Projetos
  const _origTitles = { dashboard: 'Dashboard', activities: 'Atividades', history: 'Histórico', charts: 'Gráficos', kanban: 'Kanban', projects: 'Projetos' };

  // Marca ponto verde se WA já configurado
  const waCfg = loadWAConfig();
  if (waCfg.phone && waCfg.apikey) {
    document.getElementById('wa-dot').classList.remove('hidden');
    scheduleAutoAlerts();

    // Alerta ao abrir — só envia se passou 30min desde o último
    if (waCfg.auto === '1') {
      const lastSent = parseInt(localStorage.getItem('taskflow_wa_last_sent') || '0');
      if ((Date.now() - lastSent) >= 30 * 60 * 1000) {
        setTimeout(() => sendOverdueAlerts(waCfg, 'startup'), 3000);
      }
    }
  }

  // Patch page-title para projetos
  const origSwitch = window.switchView;
  window.switchView = function(viewName, navEl) {
    const result = origSwitch ? origSwitch(viewName, navEl) : null;
    const titles = { dashboard: 'Dashboard', activities: 'Atividades', history: 'Histórico', charts: 'Gráficos', kanban: 'Kanban', projects: 'Projetos' };
    const titleEl = document.getElementById('page-title');
    if (titleEl && titles[viewName]) titleEl.textContent = titles[viewName];
    if (viewName === 'projects') renderProjects();
    if (viewName === 'charts')   setTimeout(renderCharts, 50);
    if (viewName === 'dashboard') setTimeout(renderMiniCharts, 50);
    return result;
  };

  console.log('%c WhatsApp + Projetos carregados ✦ ', 'background:#25d366;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold');
});

/* ══════════════════════════════════════════════════════════════
   GRÁFICOS — Chart.js
══════════════════════════════════════════════════════════════ */
const _chartInstances = {};

function _destroyChart(id) {
  if (_chartInstances[id]) {
    _chartInstances[id].destroy();
    delete _chartInstances[id];
  }
}

function _getThemeColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    text:    s.getPropertyValue('--text-primary').trim()  || '#1e293b',
    muted:   s.getPropertyValue('--text-muted').trim()    || '#94a3b8',
    surface: s.getPropertyValue('--surface').trim()       || '#ffffff',
    border:  s.getPropertyValue('--border').trim()        || '#e2e8f0',
  };
}

const CHART_PALETTE = ['#1d4ed8','#059669','#d97706','#ea580c','#7c3aed','#0891b2','#64748b','#db2777'];

function renderCharts() {
  const acts = state.activities;
  const t    = _getThemeColors();

  const gridColor  = 'rgba(148,163,184,0.15)';
  const fontFamily = "'Inter', 'Plus Jakarta Sans', sans-serif";

  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: t.text, font: { family: fontFamily, size: 12 } } } },
  };

  // ── 1. Donut — Status Geral ──────────────────────────────────
  const statusCounts = {
    'Concluído':    acts.filter(a => a.status === 'Concluído').length,
    'Pendente':     acts.filter(a => a.status === 'Pendente').length,
    'Vencido':      acts.filter(a => a.status === 'Vencido').length,
    'Reprogramado': acts.filter(a => a.status === 'Reprogramado').length,
  };
  _destroyChart('status');
  const ctxStatus = document.getElementById('chart-status-donut');
  if (ctxStatus) {
    if (acts.length === 0) {
      _drawEmpty(ctxStatus, t);
    } else {
      _chartInstances['status'] = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: Object.keys(statusCounts),
          datasets: [{ data: Object.values(statusCounts),
            backgroundColor: ['#059669','#1d4ed8','#ef4444','#d97706'],
            borderWidth: 0, hoverOffset: 8 }]
        },
        options: { ...baseOpts, cutout: '65%',
          plugins: { ...baseOpts.plugins,
            legend: { position: 'bottom', labels: { color: t.text, font: { family: fontFamily, size: 11 }, padding: 16 } } } }
      });
    }
  }

  // ── 2. Barras horizontais — Por Equipe ───────────────────────
  const teams = [...new Set(acts.map(a => a.team).filter(Boolean))].sort();
  _destroyChart('team');
  const ctxTeam = document.getElementById('chart-team-bar');
  if (ctxTeam) {
    if (teams.length === 0) {
      _drawEmpty(ctxTeam, t);
    } else {
      const doneByTeam    = teams.map(te => acts.filter(a => a.team === te && a.status === 'Concluído').length);
      const pendByTeam    = teams.map(te => acts.filter(a => a.team === te && a.status === 'Pendente').length);
      const overdueByTeam = teams.map(te => acts.filter(a => a.team === te && a.status === 'Vencido').length);
      _chartInstances['team'] = new Chart(ctxTeam, {
        type: 'bar',
        data: {
          labels: teams,
          datasets: [
            { label: 'Concluídas', data: doneByTeam,    backgroundColor: '#059669' },
            { label: 'Pendentes',  data: pendByTeam,    backgroundColor: '#1d4ed8' },
            { label: 'Vencidas',   data: overdueByTeam, backgroundColor: '#ef4444' },
          ]
        },
        options: { ...baseOpts, indexAxis: 'y', scales: {
          x: { stacked: true, grid: { color: gridColor }, ticks: { color: t.muted, font: { family: fontFamily } } },
          y: { stacked: true, grid: { display: false },   ticks: { color: t.text,  font: { family: fontFamily } } }
        }, plugins: { ...baseOpts.plugins, legend: { position: 'bottom', labels: { color: t.text, font: { family: fontFamily, size: 11 }, padding: 12 } } } }
      });
    }
  }

  // ── 3. Barras empilhadas — Por Projeto ───────────────────────
  const projects = [...new Set(acts.map(a => a.project).filter(Boolean))].sort();
  _destroyChart('project');
  const ctxProj = document.getElementById('chart-project-stacked');
  if (ctxProj) {
    if (projects.length === 0) {
      _drawEmpty(ctxProj, t);
    } else {
      const doneByProj    = projects.map(p => acts.filter(a => a.project === p && a.status === 'Concluído').length);
      const pendByProj    = projects.map(p => acts.filter(a => a.project === p && a.status === 'Pendente').length);
      const overdueByProj = projects.map(p => acts.filter(a => a.project === p && a.status === 'Vencido').length);
      _chartInstances['project'] = new Chart(ctxProj, {
        type: 'bar',
        data: {
          labels: projects,
          datasets: [
            { label: 'Concluídas', data: doneByProj,    backgroundColor: '#059669' },
            { label: 'Pendentes',  data: pendByProj,    backgroundColor: '#1d4ed8' },
            { label: 'Vencidas',   data: overdueByProj, backgroundColor: '#ef4444' },
          ]
        },
        options: { ...baseOpts, scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: t.text, font: { family: fontFamily, size: 11 }, maxRotation: 30 } },
          y: { stacked: true, grid: { color: gridColor }, ticks: { color: t.muted, font: { family: fontFamily } } }
        }, plugins: { ...baseOpts.plugins, legend: { position: 'bottom', labels: { color: t.text, font: { family: fontFamily, size: 11 }, padding: 12 } } } }
      });
    }
  }

  // ── 4. Linha do Tempo — prazos por mês ───────────────────────
  _destroyChart('timeline');
  const ctxTime = document.getElementById('chart-timeline');
  if (ctxTime) {
    if (acts.length === 0) {
      _drawEmpty(ctxTime, t);
    } else {
      // Agrupa por mês/ano
      const monthMap = {};
      acts.forEach(a => {
        if (!a.dueDate) return;
        const key = a.dueDate.slice(0, 7); // "YYYY-MM"
        if (!monthMap[key]) monthMap[key] = { total: 0, done: 0, overdue: 0 };
        monthMap[key].total++;
        if (a.status === 'Concluído') monthMap[key].done++;
        if (a.status === 'Vencido')   monthMap[key].overdue++;
      });
      const sortedMonths = Object.keys(monthMap).sort();
      const labels = sortedMonths.map(m => {
        const [y, mo] = m.split('-');
        return new Date(+y, +mo - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      });
      _chartInstances['timeline'] = new Chart(ctxTime, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Total',      data: sortedMonths.map(m => monthMap[m].total),   borderColor: '#1d4ed8', backgroundColor: 'rgba(29,78,216,0.08)', fill: true, tension: 0.4, pointRadius: 5 },
            { label: 'Concluídas', data: sortedMonths.map(m => monthMap[m].done),    borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.08)',  fill: true, tension: 0.4, pointRadius: 5 },
            { label: 'Vencidas',   data: sortedMonths.map(m => monthMap[m].overdue), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',  fill: true, tension: 0.4, pointRadius: 5 },
          ]
        },
        options: { ...baseOpts, scales: {
          x: { grid: { color: gridColor }, ticks: { color: t.muted, font: { family: fontFamily } } },
          y: { grid: { color: gridColor }, ticks: { color: t.muted, font: { family: fontFamily }, stepSize: 1 }, beginAtZero: true }
        }, plugins: { ...baseOpts.plugins, legend: { position: 'bottom', labels: { color: t.text, font: { family: fontFamily, size: 11 }, padding: 16 } } } }
      });
    }
  }
}

/* ── Mini gráficos do Dashboard ─────────────────────────────── */
function renderMiniCharts() {
  const acts = state.activities;
  const t    = _getThemeColors();
  const fontFamily = "'Inter', sans-serif";

  // Mini donut — status geral
  _destroyChart('mini-donut');
  const ctxMD = document.getElementById('chart-donut-dash');
  if (ctxMD) {
    if (acts.length === 0) { _drawEmpty(ctxMD, t, true); }
    else {
      _chartInstances['mini-donut'] = new Chart(ctxMD, {
        type: 'doughnut',
        data: {
          labels: ['Concluído','Pendente','Vencido','Reprogramado'],
          datasets: [{ data: [
            acts.filter(a => a.status === 'Concluído').length,
            acts.filter(a => a.status === 'Pendente').length,
            acts.filter(a => a.status === 'Vencido').length,
            acts.filter(a => a.status === 'Reprogramado').length,
          ], backgroundColor: ['#059669','#1d4ed8','#ef4444','#d97706'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: { legend: { display: false }, tooltip: { bodyFont: { family: fontFamily } } } }
      });
    }
  }

  // Mini bar — por projeto
  _destroyChart('mini-bar');
  const ctxMB = document.getElementById('chart-bar-dash');
  if (ctxMB) {
    const projects = [...new Set(acts.map(a => a.project).filter(Boolean))].slice(0, 6);
    if (projects.length === 0) { _drawEmpty(ctxMB, t, true); }
    else {
      _chartInstances['mini-bar'] = new Chart(ctxMB, {
        type: 'bar',
        data: {
          labels: projects,
          datasets: [
            { label: 'Concluídas', data: projects.map(p => acts.filter(a => a.project === p && a.status === 'Concluído').length), backgroundColor: '#059669' },
            { label: 'Pendentes',  data: projects.map(p => acts.filter(a => a.project === p && a.status !== 'Concluído').length),  backgroundColor: '#1d4ed8' },
          ]
        },
        options: { responsive: true, maintainAspectRatio: false,
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: t.muted, font: { family: fontFamily, size: 10 }, maxRotation: 30 } },
            y: { stacked: true, grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { color: t.muted, font: { family: fontFamily, size: 10 } }, beginAtZero: true }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }
}

/* ── Placeholder quando não há dados ────────────────────────── */
function _drawEmpty(canvas, t, mini = false) {
  const ctx = canvas.getContext('2d');
  canvas.style.opacity = '0.4';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = t.muted || '#94a3b8';
  ctx.font = `${mini ? 11 : 13}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Sem dados para exibir', canvas.width / 2, canvas.height / 2);
}

// Alias para o botão no topbar
function openWhatsAppConfig() { openWAConfig(); }

/* ══════════════════════════════════════════════════════════════
   IMPORTAR ATIVIDADES — PDF / XLSX / CSV / XML (MS Project)
══════════════════════════════════════════════════════════════ */

// Configura worker do PDF.js
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let importState = {
  rawRows:    [],   // linhas brutas lidas
  headers:    [],   // cabeçalhos detectados (para Excel/CSV)
  parsed:     [],   // atividades parseadas prontas para preview
  fileName:   '',
  fileType:   '',   // 'pdf' | 'excel' | 'xml'
};

/* ── Drag & Drop ── */
function importDragOver(e) {
  e.preventDefault();
  document.getElementById('import-drop-zone').classList.add('drag-over');
}
function importDragLeave(e) {
  document.getElementById('import-drop-zone').classList.remove('drag-over');
}
function importDrop(e) {
  e.preventDefault();
  document.getElementById('import-drop-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processImportFile(file);
}
function importFileSelected(e) {
  const file = e.target.files[0];
  if (file) processImportFile(file);
}

/* ── Entrada principal ── */
async function processImportFile(file) {
  importState.fileName = file.name;
  const ext = file.name.split('.').pop().toLowerCase();
  importState.fileType = ext === 'pdf' ? 'pdf' : ext === 'xml' ? 'xml' : 'excel';

  showImportStatus('⏳', `Lendo ${file.name}...`);
  importClearPreview();

  try {
    if (ext === 'pdf') {
      await importReadPDF(file);
    } else if (ext === 'xml') {
      await importReadXML(file);
    } else {
      await importReadExcel(file);
    }
  } catch (err) {
    showImportStatus('❌', `Erro ao ler arquivo: ${err.message}`);
    console.error(err);
  }
}

/* ══════════════════════════════════════════════════════════════
   LEITOR PDF — usa PDF.js para extrair texto e parsear
══════════════════════════════════════════════════════════════ */
async function importReadPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Agrupa items por linha (y aproximado)
    const items = content.items;
    const lines = {};
    items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push(item.str);
    });
    // Ordena por y decrescente (topo→base) e junta
    Object.keys(lines).sort((a,b) => b-a).forEach(y => {
      fullText += lines[y].join(' ') + '\n';
    });
  }

  const activities = parsePDFGantt(fullText);
  if (!activities.length) {
    showImportStatus('⚠', 'Nenhuma atividade detectada. O PDF pode estar em formato de imagem.');
    return;
  }
  importState.parsed = activities;
  showImportStatus('✅', `${activities.length} atividades encontradas em "${file.name}"`);
  renderImportPreview();
}

/**
 * Parser preciso para PDF Gantt no formato dhtmlx/rowtech
 * Estrutura da linha: [ID] TÍTULO DATA_INÍCIO [HH:MM] DATA_FIM [HH:MM] [RESPONSÁVEL] [DURAÇÃO] [STATUS]
 */
function parsePDFGantt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];

  const toISO = (d) => {
    if (!d) return '';
    const parts = d.split('/');
    if (parts.length !== 3) return '';
    return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
  };

  // Responsáveis conhecidos do PDF (lista explícita para máxima precisão)
  const KNOWN_RESP = [
    'WENDELL XAVIER', 'WENDELL XAVIE', 'PAULO MELO', 'CAROLINE BERNARDO',
    'CAROLINE BERNA', 'MATHEUS ISAIAS', 'NAYARA DE SOUSA', 'NAYARA DE SOUS',
    'Vitoria Lima', 'VITORIA LIMA', 'Caroline Lima',
  ];

  const STATUS_MAP = {
    'finalizadas': 'Concluído', 'finalizada': 'Concluído',
    'em andamento': 'Pendente', 'andamento': 'Pendente',
    'novas': 'Pendente', 'nova': 'Pendente',
    'pendente': 'Pendente',
    'atrasad': 'Vencido', 'vencid': 'Vencido',
  };

  // Linhas a ignorar totalmente
  const IGNORE = [
    /^Id/i, /^Título/i, /^Data de/i, /^Responsável/i,
    /^Duração/i, /^Status/i, /^This document/i,
    /^Projeto:/i,
    /^(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+\d{4}/i,
    /^\d{1,2}\s+\d{1,2}\s+\d{1,2}\s+\d{1,2}/,  // linha de números do Gantt visual
    /^\d+\s*%\s/,   // linhas de progresso visual
    /^0\s*%/, /^100\s*%/,
  ];

  // Títulos que são apenas agrupadores (não são tarefas reais)
  const GROUP_TITLES = /^(PROJETO\s+PERFILTECK|CRG-\d+|EAP\s+-\s+ADEQUA[CÇ]ÃO|PLANEJAMENTO$|PROJETOS$|AQUISI[CÇ]ÕES\s+DE\s+MATERIAIS$|FABRICA[CÇ]ÃO$|MOBILIZA[CÇ]ÃO$|INSTALA[CÇ]ÃO$|DOCUMENTA[CÇ]ÃO$|PRANCHA\s+DE\s+DETALHAMENTO$)/i;

  // Detecta nome do projeto
  let projectName = importState.fileName
    ? importState.fileName.replace(/\.[^.]+$/, '').replace(/[_()\[\]]/g,' ').trim().slice(0,60)
    : 'Importado';

  for (const line of lines) {
    // Extrai nome do projeto da linha "Projeto: X"
    const projMatch = line.match(/^Projeto:\s*(.+)/i);
    if (projMatch) { projectName = projMatch[1].trim().slice(0,60); continue; }

    // Pula linhas ignoradas
    if (IGNORE.some(rx => rx.test(line))) continue;

    // ── Extrai TODAS as datas da linha ──
    const dateRx = /(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2})?/g;
    const dates = [];
    let dm;
    dateRx.lastIndex = 0;
    while ((dm = dateRx.exec(line)) !== null) dates.push(dm[1]);
    if (dates.length < 2) continue;

    // ── Extrai STATUS ──
    let status = 'Pendente';
    const stRx = /\b(Em andamento|Finalizadas?|Novas?|Pendente|Concluíd[ao]|Atrasad[ao]|Vencid[ao])\b/gi;
    const stMatch = stRx.exec(line);
    if (stMatch) {
      const raw = stMatch[1].toLowerCase();
      for (const [k,v] of Object.entries(STATUS_MAP)) {
        if (raw.includes(k)) { status = v; break; }
      }
    }

    // ── Extrai RESPONSÁVEL ──
    // Estratégia: remove ID, datas, duração, status da linha → o que sobra entre título e datas é o responsável
    let responsible = '';

    // Tenta match com lista conhecida primeiro (mais preciso)
    for (const name of KNOWN_RESP) {
      if (line.includes(name)) { responsible = name; break; }
    }

    // Se não achou na lista, tenta extrair do trecho após a última data
    if (!responsible) {
      const afterLastDate = line
        .replace(/^.*?(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2})?\s*(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2})?/,'')
        .replace(/\b\d+[,.]?\d*\s*h\b/gi,'')
        .replace(/\b(Em andamento|Finalizadas?|Novas?|Pendente|Concluíd[ao]|Atrasad[ao])\b/gi,'')
        .trim();

      // Só aceita se parece nome próprio (tem letra maiúscula, sem palavras de tarefa)
      const TASK_KW = /^(EAP|LISTA|PLANO|MANUAL|PROJETO|CRG|PRANCHAS|PRANCHA|MODELAMENTO|APRESENTA|INSTAL|FABRICA|MOBILI|AQUISI|MONTAGEM|MATERIAL|SERVI|EMBALA|DOCUMENTA|DETALHA|USINAGEM|ELÉTRI|MECÂNI|PNEUMA|QUADROS|AS-BUILT|RETÍFICA|MANIPULADOR|NR12|ADEQUA|ACEITE|REUNIÃO|LEVANTA)/i;
      if (afterLastDate.length > 3 && afterLastDate.length < 45 &&
          /^[A-ZÁÉÍÓÚÀÂÊÔÃÕÇ]/.test(afterLastDate) &&
          !TASK_KW.test(afterLastDate)) {
        responsible = afterLastDate.replace(/\s{2,}/g,' ').trim();
      }
    }

    // ── Monta TÍTULO ──
    let title = line
      .replace(/^\d{3,5}\s+/, '')                              // remove ID numérico
      .replace(/(\d{2}\/\d{2}\/\d{4})(\s+\d{2}:\d{2})?/g, '') // remove datas
      .replace(/\b\d+[,.]?\d*\s*h\b/gi, '')                 // remove duração
      .replace(/\b(Em andamento|Finalizadas?|Novas?|Pendente|Concluíd[ao]|Atrasad[ao]|Vencid[ao])\b/gi, '') // remove status
      .trim();

    // Remove responsável do título
    if (responsible) {
      title = title.replace(responsible, '').trim();
    }
    // Remove responsáveis conhecidos que possam ter ficado
    for (const name of KNOWN_RESP) {
      title = title.replace(name, '').trim();
    }

    // Limpa título
    title = title
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–—●•]+|[\s\-–—●•]+$/g, '')
      .trim();

    // Filtros finais
    if (!title || title.length < 4) continue;
    if (/^CRG-\d+/i.test(title)) continue;
    if (GROUP_TITLES.test(title)) continue;

    const startISO = toISO(dates[0]);
    const endISO   = toISO(dates[dates.length > 1 ? 1 : 0]);
    if (!startISO || !endISO) continue;

    // Evita duplicatas
    if (results.some(r => r.description === title && r.dueDate === endISO)) continue;

    results.push({
      description: title,
      project:     projectName,
      responsible: responsible,
      startDate:   startISO,
      dueDate:     endISO,
      status,
      obs: `Importado de: ${importState.fileName}`,
    });
  }

  return results;
}

/* ══════════════════════════════════════════════════════════════
   LEITOR EXCEL / CSV
══════════════════════════════════════════════════════════════ */
async function importReadExcel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) {
    showImportStatus('⚠', 'Planilha vazia ou sem dados suficientes.');
    return;
  }

  // Primeira linha = cabeçalhos
  importState.headers = rows[0].map(h => String(h).trim());
  importState.rawRows = rows.slice(1).filter(r => r.some(c => c !== ''));

  // Auto-detecta colunas
  const autoMap = autoDetectColumns(importState.headers);
  renderColumnMapper(importState.headers, autoMap);
  applyExcelMapping(autoMap);
}

function autoDetectColumns(headers) {
  const map = { description: -1, start: -1, end: -1, responsible: -1, project: -1, status: -1 };
  const patterns = {
    description: /título|title|descri|task|tarefa|atividade|nome/i,
    start:       /início|inicio|start|começo|data.?in/i,
    end:         /término|termino|fim|end|prazo|entrega|conclus/i,
    responsible: /respons|assignee|recurso|resource|executor/i,
    project:     /projeto|project/i,
    status:      /status|situação|situacao|estado/i,
  };
  headers.forEach((h, i) => {
    for (const [key, rx] of Object.entries(patterns)) {
      if (rx.test(h) && map[key] === -1) map[key] = i;
    }
  });
  return map;
}

function applyExcelMapping(map) {
  const results = [];
  const projName = importState.fileName.replace(/\.[^.]+$/, '').slice(0, 60);

  importState.rawRows.forEach(row => {
    const get = (idx) => idx >= 0 && idx < row.length ? String(row[idx] || '').trim() : '';
    const desc = get(map.description);
    if (!desc || desc.length < 2) return;

    const rawEnd   = get(map.end);
    const rawStart = get(map.start);

    results.push({
      description: desc,
      project:     map.project >= 0 ? get(map.project) : projName,
      responsible: get(map.responsible),
      startDate:   parseFlexDate(rawStart),
      dueDate:     parseFlexDate(rawEnd) || parseFlexDate(rawStart),
      status:      normalizeStatus(get(map.status)),
      obs:         `Importado de: ${importState.fileName}`,
    });
  });

  importState.parsed = results.filter(r => r.dueDate);
  showImportStatus('✅', `${importState.parsed.length} atividades encontradas em "${importState.fileName}"`);
  renderImportPreview();
}

/* ══════════════════════════════════════════════════════════════
   LEITOR XML (MS Project exportado)
══════════════════════════════════════════════════════════════ */
async function importReadXML(file) {
  const text = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');

  const tasks = xml.querySelectorAll('Task');
  if (!tasks.length) {
    showImportStatus('⚠', 'Nenhuma tarefa encontrada no XML. Verifique se é um arquivo MS Project XML.');
    return;
  }

  // Mapa de recursos (UID → Name)
  const resources = {};
  xml.querySelectorAll('Resource').forEach(r => {
    const uid  = r.querySelector('UID')?.textContent;
    const name = r.querySelector('Name')?.textContent;
    if (uid && name) resources[uid] = name;
  });

  // Mapa de atribuição tarefa → recurso
  const assignments = {};
  xml.querySelectorAll('Assignment').forEach(a => {
    const tid = a.querySelector('TaskUID')?.textContent;
    const rid = a.querySelector('ResourceUID')?.textContent;
    if (tid && rid && resources[rid]) assignments[tid] = resources[rid];
  });

  const projName = xml.querySelector('Name')?.textContent || importState.fileName.replace(/\.[^.]+$/, '');
  const results = [];

  tasks.forEach(task => {
    const uid     = task.querySelector('UID')?.textContent || '';
    if (uid === '0') return; // tarefa raiz

    const name    = task.querySelector('Name')?.textContent?.trim() || '';
    if (!name) return;

    const start   = task.querySelector('Start')?.textContent || '';
    const finish  = task.querySelector('Finish')?.textContent || '';
    const pct     = parseInt(task.querySelector('PercentComplete')?.textContent || '0');
    const isSummary = task.querySelector('Summary')?.textContent === '1';
    if (isSummary) return; // pula grupos/resumos

    const responsible = assignments[uid] || '';

    let status = 'Pendente';
    if (pct === 100) status = 'Concluído';
    else if (finish && parseFlexDate(finish) < todayISO()) status = 'Vencido';

    results.push({
      description: name,
      project:     projName,
      responsible: responsible,
      startDate:   parseFlexDate(start),
      dueDate:     parseFlexDate(finish) || parseFlexDate(start),
      status:      status,
      obs:         `Importado de: ${importState.fileName}`,
    });
  });

  importState.parsed = results.filter(r => r.description && r.dueDate);
  showImportStatus('✅', `${importState.parsed.length} atividades encontradas em "${importState.fileName}"`);
  renderImportPreview();
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */

/** Aceita múltiplos formatos de data e retorna YYYY-MM-DD */
function parseFlexDate(raw) {
  if (!raw) return '';
  raw = String(raw).trim();
  if (!raw) return '';

  // YYYY-MM-DDTHH:MM:SS (ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  // dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const [d, m, y] = raw.split('/');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // mm/dd/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(raw)) {
    const parts = raw.split('/');
    return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  }

  // Excel serial date (number)
  const num = parseFloat(raw);
  if (!isNaN(num) && num > 10000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    return date.toISOString().slice(0, 10);
  }

  return '';
}

function normalizeStatus(raw) {
  if (!raw) return 'Pendente';
  const r = raw.toLowerCase();
  if (/finaliz|conclu|done|complet|100/.test(r)) return 'Concluído';
  if (/atras|vencid|overdue|late/.test(r))        return 'Vencido';
  if (/reprog|reschedul/.test(r))                 return 'Reprogramado';
  return 'Pendente';
}

/* ══════════════════════════════════════════════════════════════
   RENDER PREVIEW
══════════════════════════════════════════════════════════════ */
function renderImportPreview() {
  const preview = document.getElementById('import-preview');
  const tbody   = document.getElementById('import-tbody');
  const title   = document.getElementById('import-preview-title');
  const sub     = document.getElementById('import-preview-sub');

  const skipDone = document.getElementById('import-skip-done')?.checked;
  const shown = skipDone
    ? importState.parsed.filter(r => r.status !== 'Concluído')
    : importState.parsed;

  title.textContent = `${shown.length} atividade(s) para importar`;
  sub.textContent   = `Arquivo: ${importState.fileName} · ${importState.parsed.length} total · ${importState.parsed.length - shown.length} ignoradas (concluídas)`;

  // Verifica quais já existem no sistema
  tbody.innerHTML = shown.map((row, i) => {
    const exists = state.activities.some(a =>
      a.description.toLowerCase() === row.description.toLowerCase() && a.dueDate === row.dueDate
    );
    const tag = exists
      ? `<span class="import-tag import-tag-exists">Já existe</span>`
      : `<span class="import-tag import-tag-new">Novo</span>`;

    const rowClass = exists ? 'import-row-skip' : '';

    return `<tr class="${rowClass}" id="irow-${i}">
      <td><input type="checkbox" class="import-row-check" data-idx="${i}" ${exists ? '' : 'checked'} style="width:auto"/></td>
      <td>${escHtml(row.description)}</td>
      <td>${escHtml(row.project || '—')}</td>
      <td>${escHtml(row.responsible || '—')}</td>
      <td>${row.startDate ? formatDate(row.startDate) : '—'}</td>
      <td>${row.dueDate  ? formatDate(row.dueDate)  : '—'}</td>
      <td><span class="status-badge status-${escHtml(row.status)}">${escHtml(row.status)}</span></td>
      <td>${tag}</td>
    </tr>`;
  }).join('');

  preview.classList.remove('hidden');
  document.getElementById('import-status').classList.add('hidden');
}

function renderColumnMapper(headers, map) {
  const row = document.getElementById('import-map-row');
  row.style.display = 'flex';

  const opts = ['<option value="-1">— Ignorar —</option>',
    ...headers.map((h, i) => `<option value="${i}">${escHtml(h)}</option>`)
  ].join('');

  ['description','start','end','responsible','project','status'].forEach(key => {
    const sel = document.getElementById(`map-${key}`);
    if (sel) {
      sel.innerHTML = opts;
      sel.value = map[key] ?? -1;
    }
  });
}

function importRemap() {
  const map = {
    description: parseInt(document.getElementById('map-description').value),
    start:       parseInt(document.getElementById('map-start').value),
    end:         parseInt(document.getElementById('map-end').value),
    responsible: parseInt(document.getElementById('map-responsible').value),
    project:     parseInt(document.getElementById('map-project').value),
    status:      parseInt(document.getElementById('map-status').value),
  };
  applyExcelMapping(map);
}

function importToggleAll(cb) {
  document.querySelectorAll('.import-row-check').forEach(c => c.checked = cb.checked);
}

/* ══════════════════════════════════════════════════════════════
   CONFIRMAR IMPORTAÇÃO
══════════════════════════════════════════════════════════════ */
function importConfirm() {
  const checked = [...document.querySelectorAll('.import-row-check:checked')];
  if (!checked.length) { showToast('Nenhuma atividade selecionada', 'warning'); return; }

  const skipDone = document.getElementById('import-skip-done')?.checked;
  const shown = skipDone
    ? importState.parsed.filter(r => r.status !== 'Concluído')
    : importState.parsed;

  let imported = 0;
  let skipped  = 0;

  checked.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const row = shown[idx];
    if (!row) return;

    // Verifica duplicata
    const exists = state.activities.some(a =>
      a.description.toLowerCase() === row.description.toLowerCase() && a.dueDate === row.dueDate
    );
    if (exists) { skipped++; return; }

    // Detecta ou cria equipe padrão
    const team = row.team || 'Equipe 01';

    createActivity({
      project:     row.project     || 'Importado',
      team:        team,
      description: row.description,
      responsible: row.responsible || '',
      dueDate:     row.dueDate,
      status:      row.status      || 'Pendente',
      obs:         row.obs         || '',
    });
    imported++;
  });

  renderAll();
  showToast(`✓ ${imported} atividade(s) importada(s)${skipped ? ` · ${skipped} ignoradas` : ''}`, 'success');
  importClear();
  switchView('activities', document.querySelector('[data-view="activities"]'));
}

/* ── UI Helpers ── */
function showImportStatus(icon, text) {
  const el = document.getElementById('import-status');
  document.getElementById('import-status-icon').textContent = icon;
  document.getElementById('import-status-text').textContent = text;
  el.classList.remove('hidden');
}

function importClear() {
  importState = { rawRows: [], headers: [], parsed: [], fileName: '', fileType: '' };
  importClearPreview();
  document.getElementById('import-status').classList.add('hidden');
  document.getElementById('import-file-input').value = '';
}

function importClearPreview() {
  document.getElementById('import-preview').classList.add('hidden');
  document.getElementById('import-tbody').innerHTML = '';
  document.getElementById('import-map-row').style.display = 'none';
}

// Patch titles para incluir Importar
const _importTitlePatch = window.switchView;
window.switchView = function(viewName, navEl) {
  const r = _importTitlePatch ? _importTitlePatch(viewName, navEl) : null;
  const extras = { import: 'Importar' };
  if (extras[viewName]) {
    const t = document.getElementById('page-title');
    if (t) t.textContent = extras[viewName];
  }
  return r;
};

/* ══════════════════════════════════════════════════════════════
   EXPORT — EXCEL
══════════════════════════════════════════════════════════════ */
function exportExcel() {
  if (!state.activities.length) { showToast('Nenhuma atividade para exportar', 'warning'); return; }

  const rows = [
    ['Projeto', 'Equipe', 'Descrição', 'Responsável', 'Data Prevista', 'Status', 'Prioridade', 'Observações']
  ];

  state.activities.forEach(a => {
    const prio = getPriority(a);
    rows.push([
      a.project, a.team, a.description, a.responsible,
      formatDate(a.dueDate), a.status, prio.label, a.obs || ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Largura das colunas
  ws['!cols'] = [
    {wch:20},{wch:12},{wch:40},{wch:20},
    {wch:14},{wch:14},{wch:12},{wch:30}
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Atividades');

  const date = new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');
  XLSX.writeFile(wb, `TaskFlow_Atividades_${date}.xlsx`);
  showToast('Excel exportado ✓', 'success');
}

/* ══════════════════════════════════════════════════════════════
   EXPORT — PDF (via impressão / window.print)
══════════════════════════════════════════════════════════════ */
function exportPDF() {
  if (!state.activities.length) { showToast('Nenhuma atividade para exportar', 'warning'); return; }

  const date = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });

  const rows = state.activities.map(a => {
    const prio = getPriority(a);
    const diff = diffDays(a.dueDate);
    const dateColor = a.status === 'Concluído' ? '' :
                      diff < 0  ? 'color:#dc2626;font-weight:600' :
                      diff === 0 ? 'color:#d97706;font-weight:600' : '';
    return `
      <tr>
        <td><span class="badge badge-${prio.css.replace('prio-','')}">${prio.label}</span></td>
        <td><strong>${a.project}</strong></td>
        <td>${a.team}</td>
        <td>${a.description}</td>
        <td>${a.responsible}</td>
        <td style="${dateColor}">${formatDate(a.dueDate)}</td>
        <td><span class="badge badge-status-${a.status}">${a.status}</span></td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>TaskFlow — Relatório de Atividades</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #0f172a; background: #fff; padding: 28px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; }
  .header-title { font-size: 18px; font-weight: 800; color: #1d4ed8; letter-spacing: -0.02em; }
  .header-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .header-date { font-size: 10px; color: #94a3b8; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead tr { background: #f1f5f9; }
  th { padding: 8px 10px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 700; border-bottom: 1px solid #e2e8f0; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:hover { background: #fafafa; }
  .badge { display: inline-block; font-size: 8px; font-weight: 700; padding: 2px 7px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
  .badge-none     { background:#f1f5f9; color:#94a3b8; }
  .badge-low      { background:#fef3c7; color:#d97706; }
  .badge-medium   { background:#ffedd5; color:#ea580c; }
  .badge-critical { background:#fee2e2; color:#dc2626; }
  .badge-status-Pendente     { background:#f1f5f9; color:#475569; }
  .badge-status-Concluído    { background:#d1fae5; color:#059669; }
  .badge-status-Vencido      { background:#fee2e2; color:#dc2626; }
  .badge-status-Reprogramado { background:#dbeafe; color:#1d4ed8; }
  .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="header-title">⬡ TaskFlow — Relatório de Atividades</div>
      <div class="header-sub">${state.activities.length} atividade(s) · Gerado em ${date}</div>
    </div>
    <div class="header-date">TaskFlow v3.0</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Prioridade</th><th>Projeto</th><th>Equipe</th>
        <th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">TaskFlow v3.0 · Relatório gerado automaticamente em ${date}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  showToast('PDF aberto para impressão ✓', 'success');
}

/* ══════════════════════════════════════════════════════════════
   MODAL PROJETO — ABAS + IMPORTAÇÃO POR PROJETO
══════════════════════════════════════════════════════════════ */

let projImportState = {
  parsed:   [],
  fileName: '',
};

/* ── Troca de aba ── */
function switchProjTab(tab) {
  // Atualiza botões
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`proj-tab-${tab}`).classList.add('active');

  // Mostra/oculta painéis
  document.getElementById('proj-panel-info').classList.toggle('hidden', tab !== 'info');
  document.getElementById('proj-panel-import').classList.toggle('hidden', tab !== 'import');

  // Atualiza footer
  const footer  = document.getElementById('proj-modal-footer');
  const saveBtn = document.getElementById('proj-save-btn');

  if (tab === 'import') {
    // Verifica se projeto tem nome preenchido
    const projName = document.getElementById('proj-name').value.trim();
    const warning  = document.getElementById('proj-import-warning');
    const body     = document.getElementById('proj-import-body');

    if (!projName) {
      warning.classList.remove('hidden');
      body.classList.add('hidden');
    } else {
      warning.classList.add('hidden');
      body.classList.remove('hidden');
      document.getElementById('proj-import-name-label').textContent = projName;
    }

    // Muda footer para mostrar botão de importar
    saveBtn.textContent = '⇪ Importar para este projeto';
    saveBtn.onclick = projImportConfirm;
  } else {
    saveBtn.textContent = 'Salvar Projeto';
    saveBtn.onclick = saveProject;
  }
}

/* ── Drag & Drop na aba do projeto ── */
function importDragOver2(e) {
  e.preventDefault();
  document.getElementById('proj-import-drop-zone').classList.add('drag-over');
}
function importDragLeave2(e) {
  document.getElementById('proj-import-drop-zone').classList.remove('drag-over');
}
function importDrop2(e) {
  e.preventDefault();
  document.getElementById('proj-import-drop-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processProjImportFile(file);
}
function projImportFileSelected(e) {
  const file = e.target.files[0];
  if (file) processProjImportFile(file);
}

/* ── Processa arquivo no contexto do projeto ── */
async function processProjImportFile(file) {
  projImportState.fileName = file.name;
  const ext = file.name.split('.').pop().toLowerCase();

  // Reusa as funções de leitura globais, mas salva em projImportState
  importState.fileName = file.name;
  importState.fileType = ext === 'pdf' ? 'pdf' : ext === 'xml' ? 'xml' : 'excel';

  showProjImportStatus('⏳', `Lendo ${file.name}...`);
  document.getElementById('proj-import-preview').classList.add('hidden');

  try {
    if (ext === 'pdf') {
      await importReadPDF(file);
    } else if (ext === 'xml') {
      await importReadXML(file);
    } else {
      await importReadExcel(file);
    }

    // Copia o resultado do importState global para o projImportState
    projImportState.parsed = importState.parsed.map(r => ({
      ...r,
      project: document.getElementById('proj-name').value.trim() || r.project,
    }));

    renderProjImportPreview();
  } catch (err) {
    showProjImportStatus('❌', `Erro: ${err.message}`);
  }
}

/* ── Render preview compacto ── */
function renderProjImportPreview() {
  const skipDone = document.getElementById('proj-import-skip-done')?.checked;
  const shown    = skipDone
    ? projImportState.parsed.filter(r => r.status !== 'Concluído')
    : projImportState.parsed;

  document.getElementById('proj-import-count').textContent = `${shown.length} atividade(s) encontradas`;
  document.getElementById('proj-import-sub').textContent   =
    `${projImportState.parsed.length - shown.length} concluídas ignoradas · ${projImportState.fileName}`;

  const tbody = document.getElementById('proj-import-tbody');
  tbody.innerHTML = shown.map((row, i) => {
    const exists = state.activities.some(a =>
      a.description.toLowerCase() === row.description.toLowerCase() && a.dueDate === row.dueDate
    );
    return `<tr ${exists ? 'class="import-row-skip"' : ''}>
      <td><input type="checkbox" class="proj-import-check" data-idx="${i}" ${exists ? '' : 'checked'} style="width:auto"/></td>
      <td title="${escHtml(row.description)}" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(row.description)}</td>
      <td>${escHtml(row.responsible || '—')}</td>
      <td>${row.startDate ? formatDate(row.startDate) : '—'}</td>
      <td>${row.dueDate   ? formatDate(row.dueDate)   : '—'}</td>
      <td><span class="status-badge status-${escHtml(row.status)}">${escHtml(row.status)}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('proj-import-preview').classList.remove('hidden');
  document.getElementById('proj-import-status').classList.add('hidden');
}

function projImportToggleAll(cb) {
  document.querySelectorAll('.proj-import-check').forEach(c => c.checked = cb.checked);
}

function projImportClear() {
  projImportState = { parsed: [], fileName: '' };
  document.getElementById('proj-import-preview').classList.add('hidden');
  document.getElementById('proj-import-status').classList.add('hidden');
  document.getElementById('proj-import-file').value = '';
}

/* ── Confirmar importação no projeto ── */
function projImportConfirm() {
  const projName = document.getElementById('proj-name').value.trim();
  if (!projName) { showToast('Salve o projeto antes de importar', 'warning'); switchProjTab('info'); return; }

  // Garante que o projeto existe no cadastro
  const projExists = projectState.projects.some(p => p.name === projName);
  if (!projExists) {
    // Salva o projeto automaticamente
    const saved = _saveProjectSilent();
    if (!saved) return;
  }

  const checked = [...document.querySelectorAll('.proj-import-check:checked')];
  if (!checked.length) { showToast('Nenhuma atividade selecionada', 'warning'); return; }

  const skipDone = document.getElementById('proj-import-skip-done')?.checked;
  const shown    = skipDone
    ? projImportState.parsed.filter(r => r.status !== 'Concluído')
    : projImportState.parsed;

  let imported = 0, skipped = 0;

  checked.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    const row = shown[idx];
    if (!row) return;

    const exists = state.activities.some(a =>
      a.description.toLowerCase() === row.description.toLowerCase() && a.dueDate === row.dueDate
    );
    if (exists) { skipped++; return; }

    createActivity({
      project:     projName,
      team:        'Equipe 01',
      description: row.description,
      responsible: row.responsible || '',
      dueDate:     row.dueDate,
      status:      row.status || 'Pendente',
      obs:         row.obs    || `Importado de: ${projImportState.fileName}`,
    });
    imported++;
  });

  renderAll();
  renderProjects();
  showToast(`✓ ${imported} atividade(s) importada(s) para "${projName}"${skipped ? ` · ${skipped} já existiam` : ''}`, 'success');
  closeProjectModal();
  switchView('activities', document.querySelector('[data-view="activities"]'));

  // Filtra direto no projeto
  setTimeout(() => {
    document.getElementById('filter-project').value = projName;
    state.filters.project = projName;
    renderActivities();
  }, 100);
}

/* ── Salva projeto silenciosamente (sem fechar modal) ── */
function _saveProjectSilent() {
  const code     = document.getElementById('proj-code').value.trim();
  const name     = document.getElementById('proj-name').value.trim();
  const desc     = document.getElementById('proj-desc').value.trim();
  const manager  = document.getElementById('proj-manager').value.trim();
  const status   = document.getElementById('proj-status').value;
  const start    = document.getElementById('proj-start').value;
  const end      = document.getElementById('proj-end').value;
  const duration = document.getElementById('proj-duration').value;
  const progress = parseInt(document.getElementById('proj-progress').value, 10) || 0;
  const color    = projectState.selectedColor;

  if (!name)    { showToast('Informe o nome do projeto', 'error'); switchProjTab('info'); return false; }
  if (!manager) { showToast('Informe o responsável', 'error');     switchProjTab('info'); return false; }
  if (!start)   { showToast('Informe a data de início', 'error');  switchProjTab('info'); return false; }

  if (projectState.editingProjectId) {
    const idx = projectState.projects.findIndex(p => p.id === projectState.editingProjectId);
    if (idx !== -1) projectState.projects[idx] = { ...projectState.projects[idx], code, name, desc, manager, status, start, end, duration, progress, color, updatedAt: Date.now() };
  } else {
    const proj = { id: genProjectId(), code, name, desc, manager, status, start, end, duration, progress, color, createdAt: Date.now(), updatedAt: Date.now() };
    projectState.projects.push(proj);
    projectState.editingProjectId = proj.id;
  }

  persistProjects();
  renderProjects();
  updateFilterOptions();
  return true;
}

/* ── Mostra status na aba do projeto ── */
function showProjImportStatus(icon, text) {
  const el = document.getElementById('proj-import-status');
  document.getElementById('proj-import-status-icon').textContent = icon;
  document.getElementById('proj-import-status-text').textContent = text;
  el.classList.remove('hidden');
}

/* ── Patch: ao abrir modal, sempre começa na aba Info ── */
const _origOpenProjectModal = openProjectModal;
openProjectModal = function() {
  _origOpenProjectModal();
  setTimeout(() => {
    switchProjTab('info');
    projImportClear();
  }, 10);
};

const _origEditProject = editProject;
editProject = function(id) {
  _origEditProject(id);
  setTimeout(() => {
    switchProjTab('info');
    projImportClear();
    // Libera aba de importação imediatamente pois projeto já existe
    document.getElementById('proj-import-warning').classList.add('hidden');
    document.getElementById('proj-import-body').classList.remove('hidden');
    const name = document.getElementById('proj-name').value.trim();
    document.getElementById('proj-import-name-label').textContent = name;
  }, 10);
};

/* ── Patch: atualiza banner com cor e nome do projeto ── */
const _origSwitchProjTab = switchProjTab;
switchProjTab = function(tab) {
  _origSwitchProjTab(tab);

  if (tab === 'import') {
    const projName  = document.getElementById('proj-name').value.trim();
    const nameLabel = document.getElementById('proj-import-name-label');
    const icon      = document.getElementById('proj-import-banner-icon');

    if (nameLabel) nameLabel.textContent = projName || '—';

    // Aplica cor do projeto no ícone do banner
    if (icon && projectState.selectedColor) {
      icon.style.background = projectState.selectedColor;
    }
  }
};

/* ── Patch: usa equipe selecionada ao importar ── */
const _origProjImportConfirm = projImportConfirm;
projImportConfirm = function() {
  // Injeta equipe nos dados antes de confirmar
  const team = document.getElementById('proj-import-team')?.value || 'Equipe 01';
  projImportState.parsed = projImportState.parsed.map(r => ({ ...r, team }));
  _origProjImportConfirm();
};

/* ══════════════════════════════════════════════════════════════
   KANBAN — RENDER POR FASES DO PROJETO
   Fases: Planejamento → Projetos → Aquisições → Fabricação → Mobilização → Instalação → Documentação
══════════════════════════════════════════════════════════════ */

const KANBAN_PHASES = [
  { id: 'planejamento', label: 'Planejamento',  color: '#8b5cf6', keywords: /planejamento|aceite|reunião|levantamento técnico/i },
  { id: 'projetos',     label: 'Projetos',      color: '#1d4ed8', keywords: /projeto|modelamento|pranchas|detalhamento|elétrico|mecânico|apresenta/i },
  { id: 'aquisicoes',   label: 'Aquisições',    color: '#d97706', keywords: /material|materiais|aquisição|usinagem|pneumática|rolamento|talha/i },
  { id: 'fabricacao',   label: 'Fabricação',    color: '#ea580c', keywords: /fabricação|mecânica retífica|montagem quadros/i },
  { id: 'mobilizacao',  label: 'Mobilização',   color: '#0891b2', keywords: /mobilização|embalagem|separação|frete/i },
  { id: 'instalacao',   label: 'Instalação',    color: '#059669', keywords: /instalação/i },
  { id: 'documentacao', label: 'Documentação',  color: '#64748b', keywords: /documentação|as-built|manual técnico/i },
];

function getActivityPhase(activity) {
  const desc = (activity.description || '').toLowerCase();
  for (const phase of KANBAN_PHASES) {
    if (phase.keywords.test(desc)) return phase.id;
  }
  // Fallback: tenta pelo status
  return 'planejamento';
}

function renderKanban() {
  const board       = document.getElementById('kanban-board');
  const filterProj  = document.getElementById('kanban-filter-project')?.value || '';
  const filterTeam  = document.getElementById('kanban-filter-team')?.value    || '';

  if (!board) return;

  let acts = state.activities.filter(a => {
    if (filterProj && a.project !== filterProj) return false;
    if (filterTeam && a.team    !== filterTeam)  return false;
    return true;
  });

  const byPhase = {};
  KANBAN_PHASES.forEach(p => byPhase[p.id] = []);
  acts.forEach(a => {
    const phase = getActivityPhase(a);
    byPhase[phase].push(a);
  });

  updateKanbanFilters();

  board.innerHTML = KANBAN_PHASES.map(phase => {
    const cards       = byPhase[phase.id];
    const doneCount   = cards.filter(a => a.status === 'Concluído').length;
    const overdueCount= cards.filter(a => a.status === 'Vencido').length;
    const progress    = cards.length > 0 ? Math.round((doneCount / cards.length) * 100) : 0;

    const cardHTML = cards.length === 0
      ? `<div class="kanban-empty">Nenhuma atividade</div>`
      : cards.map(a => {
          const diff   = diffDays(a.dueDate);
          const dcls   = a.status === 'Concluído' ? 'date-future' :
                         diff < 0  ? 'date-overdue' : diff === 0 ? 'date-today' : 'date-future';
          const prioBg = a.status === 'Concluído' ? 'var(--green)' :
                         diff <= -5 ? 'var(--red)' : diff < 0 ? '#f97316' :
                         diff === 0 ? 'var(--yellow)' : phase.color;
          return `
            <div class="kanban-card"
                 draggable="true"
                 data-id="${a.id}"
                 data-phase="${phase.id}"
                 ondragstart="kanbanDragStart(event)"
                 ondragend="kanbanDragEnd(event)"
                 onclick="handleEdit('${a.id}')">
              <div class="kanban-card-prio" style="background:${prioBg}"></div>
              <div class="kanban-card-project">${escHtml(a.project)}</div>
              <div class="kanban-card-desc">${escHtml(a.description)}</div>
              <div class="kanban-card-meta">
                <span>${escHtml(a.responsible || '—')}</span>
                <span class="${dcls}">${formatDate(a.dueDate)}</span>
              </div>
              <div style="margin-top:6px">
                <span class="status-badge status-${escHtml(a.status)}" style="font-size:0.65rem;padding:2px 7px">${escHtml(a.status)}</span>
              </div>
            </div>`;
        }).join('');

    return `
      <div class="kanban-col" data-phase="${phase.id}"
           ondragover="kanbanDragOver(event)"
           ondragleave="kanbanDragLeave(event)"
           ondrop="kanbanDrop(event)">
        <div class="kanban-col-header" style="border-top:3px solid ${phase.color}">
          <div>
            <div class="kanban-col-title" style="color:${phase.color}">${phase.label}</div>
            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px">${doneCount}/${cards.length} concluídas${overdueCount > 0 ? ` · <span style="color:var(--red)">${overdueCount} atrasada(s)</span>` : ''}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="kanban-col-count">${cards.length}</span>
            <div style="width:48px;height:3px;background:var(--bg-input);border-radius:99px;overflow:hidden">
              <div style="width:${progress}%;height:100%;background:${phase.color};border-radius:99px;transition:width 0.5s"></div>
            </div>
          </div>
        </div>
        <div class="kanban-col-body">${cardHTML}</div>
      </div>`;
  }).join('');
}

/* ── Drag & Drop do Kanban ────────────────────────────────── */
let _kanbanDraggingId   = null;
let _kanbanDraggingPhase= null;

function kanbanDragStart(e) {
  _kanbanDraggingId    = e.currentTarget.dataset.id;
  _kanbanDraggingPhase = e.currentTarget.dataset.phase;
  e.currentTarget.classList.add('kanban-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _kanbanDraggingId);
}

function kanbanDragEnd(e) {
  e.currentTarget.classList.remove('kanban-dragging');
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('kanban-col-over'));
}

function kanbanDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const col = e.currentTarget.closest('.kanban-col');
  if (col) {
    document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('kanban-col-over'));
    col.classList.add('kanban-col-over');
  }
}

function kanbanDragLeave(e) {
  const col = e.currentTarget.closest('.kanban-col');
  if (col && !col.contains(e.relatedTarget)) {
    col.classList.remove('kanban-col-over');
  }
}

function kanbanDrop(e) {
  e.preventDefault();
  const col      = e.currentTarget.closest('.kanban-col');
  if (!col) return;
  col.classList.remove('kanban-col-over');

  const targetPhase = col.dataset.phase;
  const id          = _kanbanDraggingId;
  if (!id || targetPhase === _kanbanDraggingPhase) return;

  // Mapa de fase → status automático
  const phaseStatusMap = {
    'planejamento': 'Pendente',
    'projetos':     'Pendente',
    'aquisicoes':   'Pendente',
    'fabricacao':   'Pendente',
    'mobilizacao':  'Pendente',
    'instalacao':   'Pendente',
    'documentacao': 'Pendente',
  };

  const activity = state.activities.find(a => a.id === id);
  if (!activity) return;

  // Mapa de fase → campo de descrição para o histórico
  const phaseLabel = KANBAN_PHASES.find(p => p.id === targetPhase)?.label || targetPhase;

  // Atualiza a fase na descrição (obs) e mantém status atual ou aplica padrão
  const newStatus = activity.status === 'Concluído' ? 'Concluído' :
                    activity.status === 'Reprogramado' ? 'Reprogramado' :
                    phaseStatusMap[targetPhase] || 'Pendente';

  updateActivity(id, {
    ...activity,
    team: _phaseToTeam(targetPhase, activity.team),
    obs:  (activity.obs ? activity.obs + '\n' : '') + `[Movido para fase: ${phaseLabel}]`,
    status: newStatus,
  });

  showToast(`Card movido para ${phaseLabel}`, 'success');
  renderKanban();
}

/* Sugere equipe com base na fase (mantém a original se não houver mapeamento) */
function _phaseToTeam(phase, currentTeam) {
  return currentTeam; // mantém equipe atual — usuário pode editar se quiser
}


function updateKanbanFilters() {
  const fp = document.getElementById('kanban-filter-project');
  const ft = document.getElementById('kanban-filter-team');
  if (!fp || !ft) return;

  const curP = fp.value, curT = ft.value;
  const projects = [...new Set(state.activities.map(a => a.project).filter(Boolean))].sort();
  const teams    = [...new Set(state.activities.map(a => a.team).filter(Boolean))].sort();

  fp.innerHTML = '<option value="">Todos os projetos</option>' +
    projects.map(p => `<option value="${escAttr(p)}"${p===curP?' selected':''}>${escHtml(p)}</option>`).join('');
  ft.innerHTML = '<option value="">Todas as equipes</option>' +
    teams.map(t => `<option value="${escAttr(t)}"${t===curT?' selected':''}>${escHtml(t)}</option>`).join('');
}

/* ══════════════════════════════════════════════════════════════
   SEED DATA — PROJETO PERFILTECK AÇO CEARENSE (do Gantt PDF)
══════════════════════════════════════════════════════════════ */
function loadSeedData() {
  // Limpa tudo antes de inserir dados frescos
  if (state.activities.length > 0 || projectState.projects.length > 0) {
    if (!confirm('Isso vai apagar TODAS as atividades e projetos atuais e carregar os dados do Gantt PDF. Deseja continuar?')) return;
    state.activities = [];
    state.history    = [];
    projectState.projects = [];
    persistActivities();
    persistHistory();
    persistProjects();
  }

  const projects = [
    { id:'proj_retifica', name:'RETÍFICA - AÇO CEARENSE',
      desc:'Adequação NR12 — Retífica 01 e 02 (CRG-04-260219-01)',
      manager:'WENDELL XAVIER', status:'Ativo',
      start:'2026-02-19', end:'2026-05-16', color:'#1d4ed8',
      createdAt:Date.now(), updatedAt:Date.now() },
    { id:'proj_manipulador', name:'MANIPULADOR - AÇO CEARENSE',
      desc:'Adequação NR12 — Manipuladores 01 e 02 (CRG-04-260219-03)',
      manager:'WENDELL XAVIER', status:'Ativo',
      start:'2026-02-19', end:'2026-04-28', color:'#059669',
      createdAt:Date.now(), updatedAt:Date.now() },
  ];
  projectState.projects = projects;
  persistProjects();

  const R = 'RETÍFICA - AÇO CEARENSE';
  const M = 'MANIPULADOR - AÇO CEARENSE';

  const acts = [
    // ── RETÍFICA ──
    [R,'Equipe 01','ACEITE DO PEDIDO',                                                          '','2026-02-19','2026-02-19','Concluído',''],
    [R,'Equipe 01','REUNIÃO DE ABERTURA DO PROJETO (RAP)',                                       'WENDELL XAVIER','2026-02-20','2026-02-20','Concluído',''],
    [R,'Equipe 01','LEVANTAMENTO TÉCNICO',                                                       'WENDELL XAVIER','2026-02-20','2026-02-20','Concluído',''],
    [R,'Equipe 02','PROJETO MECÂNICO - RETÍFICA 01',                                            'PAULO MELO','2026-02-23','2026-03-20','Pendente',''],
    [R,'Equipe 02','MODELAMENTO 3D - RETÍFICA 01',                                              'PAULO MELO','2026-02-23','2026-03-03','Concluído',''],
    [R,'Equipe 02','APRESENTAÇÃO INTERNA PROJETO',                                               'PAULO MELO','2026-03-04','2026-03-04','Concluído',''],
    [R,'Equipe 02','PRANCHAS DE DETALHAMENTO / PLANO TRABALHO / LISTA MATERIAL - RETÍFICA 01', 'PAULO MELO','2026-03-06','2026-03-20','Pendente',''],
    [R,'Equipe 02','APRESENTAÇÃO 01 - AÇO CEARENSE',                                           'PAULO MELO','2026-03-06','2026-03-06','Concluído',''],
    [R,'Equipe 02','PROJETO ELÉTRICO - RETÍFICA 01',                                            'PAULO MELO','2026-02-27','2026-03-04','Concluído',''],
    [R,'Equipe 02','PROJETO MECÂNICO - RETÍFICA 02',                                            'PAULO MELO','2026-03-23','2026-03-29','Pendente',''],
    [R,'Equipe 02','MODELAMENTO 3D - RETÍFICA 02',                                              'PAULO MELO','2026-03-23','2026-03-24','Pendente',''],
    [R,'Equipe 02','PRANCHAS DE DETALHAMENTO / PLANO TRABALHO / LISTA MATERIAL - RETÍFICA 02', 'PAULO MELO','2026-03-25','2026-03-29','Pendente',''],
    [R,'Equipe 02','APRESENTAÇÃO 02 - AÇO CEARENSE',                                           'PAULO MELO','2026-03-31','2026-03-31','Pendente',''],
    [R,'Equipe 02','PROJETO ELÉTRICO - RETÍFICA 02',                                            'PAULO MELO','2026-03-09','2026-03-12','Concluído',''],
    [R,'Equipe 03','MATERIAIS METALURGIA - RETÍFICA 01',                                        'CAROLINE BERNARDO','2026-03-21','2026-03-30','Pendente',''],
    [R,'Equipe 03','MATERIAIS ELÉTRICOS / SEGURANÇA - RETÍFICA 01 E 02',                       'CAROLINE BERNARDO','2026-03-12','2026-04-06','Pendente',''],
    [R,'Equipe 03','MATERIAIS DE METALURGIA - RETÍFICA 02',                                     'CAROLINE BERNARDO','2026-03-29','2026-04-08','Pendente',''],
    [R,'Equipe 04','MECÂNICA RETÍFICA 01',                                                      'MATHEUS ISAIAS','2026-03-31','2026-04-09','Pendente',''],
    [R,'Equipe 04','MONTAGEM QUADROS - RETÍFICA 01 / 02',                                       'MATHEUS ISAIAS','2026-04-06','2026-04-13','Pendente',''],
    [R,'Equipe 04','MECÂNICA RETÍFICA 02',                                                      'MATHEUS ISAIAS','2026-04-22','2026-05-01','Pendente',''],
    [R,'Equipe 05','EMBALAGEM / SEPARAÇÃO / FRETE - RETÍFICA 01',                              'Vitoria Lima','2026-04-13','2026-04-15','Pendente',''],
    [R,'Equipe 05','EMBALAGEM / SEPARAÇÃO / FRETE - RETÍFICA 02',                              'Vitoria Lima','2026-05-04','2026-05-06','Pendente',''],
    [R,'Equipe 05','INSTALAÇÃO ELETROMECÂNICA - RETÍFICA 01',                                   'NAYARA DE SOUSA','2026-04-16','2026-04-20','Pendente',''],
    [R,'Equipe 05','INSTALAÇÃO ELETROMECÂNICA - RETÍFICA 02',                                   'NAYARA DE SOUSA','2026-05-07','2026-05-11','Pendente',''],
    [R,'Equipe 01','AS-BUILT RETÍFICA 01',                                                      'WENDELL XAVIER','2026-04-22','2026-04-26','Pendente',''],
    [R,'Equipe 01','AS-BUILT RETÍFICA 02',                                                      'WENDELL XAVIER','2026-05-12','2026-05-16','Pendente',''],
    // ── MANIPULADOR ──
    [M,'Equipe 01','ACEITE DO PEDIDO',                                                          'WENDELL XAVIER','2026-02-19','2026-02-19','Concluído',''],
    [M,'Equipe 01','REUNIÃO ABERTURA DO PROJETO',                                               'WENDELL XAVIER','2026-02-20','2026-02-20','Concluído',''],
    [M,'Equipe 01','LEVANTAMENTO TÉCNICO - MANIPULADORES',                                      'WENDELL XAVIER','2026-02-24','2026-02-25','Concluído',''],
    [M,'Equipe 02','PROJETO MECÂNICO - MANIPULADORES',                                          'PAULO MELO','2026-02-26','2026-03-13','Pendente',''],
    [M,'Equipe 02','MODELAMENTO 3D - MANIPULADORES',                                            'PAULO MELO','2026-02-26','2026-03-06','Concluído',''],
    [M,'Equipe 02','APRESENTAÇÃO INTERNA PROJETO - MANIPULADORES',                              'PAULO MELO','2026-03-05','2026-03-05','Concluído',''],
    [M,'Equipe 02','APRESENTAÇÃO 01 - AÇO CEARENSE - MANIPULADORES',                           'PAULO MELO','2026-03-06','2026-03-06','Concluído',''],
    [M,'Equipe 02','DETALHAMENTO - COLUNA E BRAÇO DE SUSTENTAÇÃO (LISTA MATERIAL 01)',          'PAULO MELO','2026-03-09','2026-03-11','Pendente',''],
    [M,'Equipe 02','DETALHAMENTO - GARRA (LISTA MATERIAL 02)',                                  'PAULO MELO','2026-03-10','2026-03-13','Pendente',''],
    [M,'Equipe 03','MATERIAIS METALURGIA - COLUNA E BRAÇO (LISTA MATERIAL 01)',                 'CAROLINE BERNARDO','2026-03-11','2026-03-18','Pendente',''],
    [M,'Equipe 03','AQUISIÇÃO ROLAMENTOS',                                                      'CAROLINE BERNARDO','2026-03-11','2026-03-13','Pendente',''],
    [M,'Equipe 03','SERVIÇO USINAGEM',                                                          'CAROLINE BERNARDO','2026-03-14','2026-03-23','Pendente',''],
    [M,'Equipe 03','AQUISIÇÃO TALHA ELÉTRICA',                                                  'CAROLINE BERNARDO','2026-03-11','2026-03-30','Pendente',''],
    [M,'Equipe 03','MATERIAL PNEUMÁTICA',                                                       'CAROLINE BERNARDO','2026-03-11','2026-03-26','Pendente',''],
    [M,'Equipe 03','MATERIAIS METALURGIA - BRAÇOS GARRAS (LISTA MATERIAL 02)',                  'CAROLINE BERNARDO','2026-03-16','2026-03-20','Pendente',''],
    [M,'Equipe 04','FABRICAÇÃO MANIPULADOR 01 / 02',                                            'MATHEUS ISAIAS','2026-03-18','2026-04-11','Pendente',''],
    [M,'Equipe 05','EMBALAGEM / SEPARAÇÃO / FRETE - MANIPULADORES',                            'Vitoria Lima','2026-04-13','2026-04-15','Pendente',''],
    [M,'Equipe 05','INSTALAÇÃO MANIPULADOR 01',                                                 'NAYARA DE SOUSA','2026-04-16','2026-04-17','Pendente',''],
    [M,'Equipe 05','INSTALAÇÃO MANIPULADOR 02',                                                 'NAYARA DE SOUSA','2026-04-20','2026-04-21','Pendente',''],
    [M,'Equipe 01','MANUAL TÉCNICO MANIPULADORES',                                              'WENDELL XAVIER','2026-04-22','2026-04-28','Pendente',''],
  ];

  acts.forEach(([project, team, description, responsible, startDate, dueDate, status, obs]) => {
    createActivity({ project, team, description, responsible, startDate, dueDate, status, obs });
  });

  renderAll();
  renderProjects();
  renderKanban();
  // Esconde botão após carregar
  const btn = document.getElementById('btn-load-seed');
  if (btn) btn.style.display = 'none';
  showToast(`✓ ${acts.length} atividades dos 2 projetos carregadas!`, 'success');
  // Vai direto para o Kanban
  setTimeout(() => switchView('kanban', document.querySelector('[data-view="kanban"]')), 800);
}


/* ══════════════════════════════════════════════════════════════
   FASE 1 — GANTT + CAMINHO CRÍTICO + KPIs PRO
══════════════════════════════════════════════════════════════ */

// ── Constantes ──────────────────────────────────────────────────
const GANTT_CFG = { DAY_PX: 26, ROW_H: 40, HDR_H: 56 };
const CPM_MS = 86400000;

// ── Helpers ─────────────────────────────────────────────────────
function isoToDays(iso) {
  if (!iso) return 0;
  return Math.floor(new Date(iso + 'T00:00:00').getTime() / CPM_MS);
}
function daysToISO(n) {
  return new Date(n * CPM_MS).toISOString().slice(0, 10);
}
function durDays(act) {
  if (!act.startDate || !act.dueDate) return 1;
  return Math.max(isoToDays(act.dueDate) - isoToDays(act.startDate), 1);
}

// ── CAMINHO CRÍTICO (CPM) ─────────────────────────────────────────
let _cpmCache = null;

function runCPM() {
  if (_cpmCache) return _cpmCache;
  const acts = state.activities;
  const byId = Object.fromEntries(acts.map(a => [a.id, a]));
  const EST = {}, EFT = {}, LST = {}, LFT = {};
  const vis = new Set();

  function fw(id) {
    if (vis.has(id)) return;
    vis.add(id);
    const a = byId[id]; if (!a) return;
    let est = isoToDays(a.startDate || todayISO());
    for (const dep of (a.predecessors || [])) {
      const pred = byId[dep.predId]; if (!pred) continue;
      fw(dep.predId);
      if (dep.type === 'SS') est = Math.max(est, EST[dep.predId] ?? est);
      else                   est = Math.max(est, EFT[dep.predId] ?? est);
    }
    EST[id] = est;
    EFT[id] = est + durDays(a);
  }
  acts.forEach(a => fw(a.id));

  const projEnd = acts.length ? Math.max(...acts.map(a => EFT[a.id] || 0)) : isoToDays(todayISO());

  // Mapa de sucessores
  const succs = {};
  acts.forEach(a => {
    for (const dep of (a.predecessors || [])) {
      if (!succs[dep.predId]) succs[dep.predId] = [];
      succs[dep.predId].push({ succId: a.id, type: dep.type });
    }
  });

  const bvis = new Set();
  function bw(id) {
    if (bvis.has(id)) return;
    bvis.add(id);
    const a = byId[id]; if (!a) return;
    let lft = projEnd;
    for (const { succId, type } of (succs[id] || [])) {
      bw(succId);
      if (type === 'SS') lft = Math.min(lft, (LST[succId] ?? projEnd) + durDays(byId[succId] || {}));
      else               lft = Math.min(lft, LST[succId] ?? projEnd);
    }
    LFT[id] = lft;
    LST[id] = lft - durDays(a);
  }
  acts.forEach(a => { if (!succs[a.id]?.length) bw(a.id); });
  acts.forEach(a => bw(a.id));

  const floats = {}, critical = new Set();
  acts.forEach(a => {
    if (a.status === 'Concluído') return;
    const f = (LST[a.id] ?? 0) - (EST[a.id] ?? 0);
    floats[a.id] = f;
    if (f <= 0) critical.add(a.id);
  });

  _cpmCache = { critical, floats, EST, EFT, LST, LFT, projEnd };
  return _cpmCache;
}

// ── KPIs PRO ──────────────────────────────────────────────────────
function renderKPIsPro() {
  const acts = state.activities;
  const total = acts.length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  if (!total) {
    ['kpi-pro-pct','kpi-pro-spi','kpi-pro-critical','kpi-pro-inprogress','kpi-pro-total'].forEach(id => set(id, '0'));
    return;
  }

  const today = todayISO();
  const done     = acts.filter(a => a.status === 'Concluído').length;
  const overdue  = acts.filter(a => a.status !== 'Concluído' && a.dueDate < today).length;
  const active   = acts.filter(a => a.status === 'Pendente' && a.dueDate >= today).length;
  const pct      = Math.round((done / total) * 100);
  const planned  = acts.filter(a => a.dueDate <= today).length;
  const spiNum   = planned > 0 ? done / planned : null;
  const cpm      = runCPM();
  const critCount= cpm.critical.size;

  set('kpi-pro-pct', pct + '%');
  set('kpi-pro-total', total);
  set('kpi-pro-inprogress', active);
  set('kpi-pro-critical', critCount);
  set('kpi-pro-done-sub', `${done} de ${total} concluídas`);
  set('kpi-pro-overdue-sub', `${overdue} vencida${overdue !== 1 ? 's' : ''}`);

  const pbar = document.getElementById('kpi-pro-pbar');
  if (pbar) pbar.style.width = pct + '%';

  if (spiNum !== null) {
    const spiEl = document.getElementById('kpi-pro-spi');
    if (spiEl) {
      spiEl.textContent = spiNum.toFixed(2);
      spiEl.style.color = spiNum >= 1 ? 'var(--green)' : spiNum >= 0.8 ? 'var(--yellow)' : 'var(--red)';
    }
  } else {
    set('kpi-pro-spi', '—');
  }
}

// ── GANTT STATE ───────────────────────────────────────────────────
const _gs = { zoom: 1, filterProject: '', minDay: 0 };

function ganttDPX() { return Math.round(GANTT_CFG.DAY_PX * _gs.zoom); }

function ganttZoom(delta) {
  if (delta === 0) _gs.zoom = 1;
  else _gs.zoom = Math.max(0.4, Math.min(4, _gs.zoom + delta * 0.25));
  renderGantt();
}

function ganttSetProject(val) {
  _gs.filterProject = val;
  renderGantt();
}

function updateGanttFilters() {
  const sel = document.getElementById('gantt-filter-project');
  if (!sel) return;
  const cur = sel.value;
  const projs = [...new Set(state.activities.map(a => a.project).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">Todos os projetos</option>' +
    projs.map(p => `<option value="${escAttr(p)}"${p===cur?' selected':''}>${escHtml(p)}</option>`).join('');
}

// ── RENDER GANTT ───────────────────────────────────────────────────
function renderGantt() {
  const wrap = document.getElementById('gantt-wrap');
  if (!wrap) return;

  try {
    _cpmCache = null; // força recálculo
    const cpm = runCPM();

    // Aceita atividades com pelo menos dueDate; usa dueDate como startDate se não tiver
    let acts = state.activities.filter(a => {
      if (_gs.filterProject && a.project !== _gs.filterProject) return false;
      return !!a.dueDate;
    }).map(a => ({
      ...a,
      startDate: a.startDate || a.dueDate, // fallback: 1 dia antes do término
    }));

    if (!acts.length) {
      wrap.innerHTML = '<div class="empty-state" style="padding:40px"><span>📅</span><p>Sem atividades com datas para exibir.<br><small>Recarregue os dados de demo ou adicione atividades com datas.</small></p></div>';
      return;
    }

    const tree = buildTree(acts);
    const DPX  = ganttDPX();
    const ROW  = GANTT_CFG.ROW_H;
    const today = isoToDays(todayISO());

  // Range de datas
  const allD = acts.flatMap(a => [isoToDays(a.startDate), isoToDays(a.dueDate)]).filter(Boolean);
  const minDay = Math.min(...allD) - 2;
  const maxDay = Math.max(...allD) + 10;
  _gs.minDay = minDay;
  const totalDays = maxDay - minDay;
  const totalW = totalDays * DPX;
  const totalH = tree.length * ROW;

  // ── Header: meses ──
  let monthsHTML = '';
  let d = minDay;
  while (d < maxDay) {
    const dt = new Date(d * CPM_MS);
    const mo = dt.getMonth(), yr = dt.getFullYear();
    let end = d;
    while (end < maxDay) {
      const dt2 = new Date(end * CPM_MS);
      if (dt2.getMonth() !== mo || dt2.getFullYear() !== yr) break;
      end++;
    }
    const w = (end - d) * DPX;
    monthsHTML += `<div class="gantt-month" style="width:${w}px">${dt.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})}</div>`;
    d = end;
  }

  // ── Header: dias ──
  let daysHTML = '';
  for (let dd = minDay; dd < maxDay; dd++) {
    const dt = new Date(dd * CPM_MS);
    const weekend = dt.getDay()===0||dt.getDay()===6;
    const isT = dd === today;
    daysHTML += `<div class="gantt-day ${weekend?'gantt-day-weekend':''} ${isT?'gantt-day-today':''}" style="width:${DPX}px">${dt.getDate()}</div>`;
  }

  // ── Rows esquerda + barras ──
  let leftHTML = '', barsHTML = '', sepHTML = '';
  const treeById = Object.fromEntries(tree.map((a,i) => [a.id, { act: a, row: i }]));

  tree.forEach((act, i) => {
    const isCrit = cpm.critical.has(act.id);
    const s = isoToDays(act.startDate);
    const e = isoToDays(act.dueDate);
    const bLeft = (s - minDay) * DPX;
    const bW    = Math.max((e - s) * DPX, DPX * 0.5);
    const top   = i * ROW;
    const indent = act._level * 14;

    const colMap = { 'Concluído':'#059669','Pendente':'#1d4ed8','Vencido':'#ef4444','Reprogramado':'#d97706' };
    const barColor = colMap[act.status] || '#1d4ed8';

    // Painel esquerdo
    const pct2 = act.progress || 0;
    leftHTML += `
      <div class="gantt-left-row ${isCrit?'gantt-crit-row':''}" style="height:${ROW}px" ondblclick="handleEdit('${act.id}')">
        <span class="gantt-wbs">${act._wbs||''}</span>
        <span class="gantt-task-name" style="padding-left:${indent}px" title="${escHtml(act.description)}">${escHtml(act.description.slice(0,26))}${act.description.length>26?'…':''}</span>
        <span style="font-size:.6rem;font-weight:700;color:${pct2===100?'#059669':'var(--text-muted)'};margin-left:auto;flex-shrink:0;padding-right:4px">${pct2}%</span>
        ${isCrit?'<span class="gantt-crit-dot" title="Caminho crítico">●</span>':''}
      </div>`;

    // Barra
    const progressPct = Math.min(100, Math.max(0, act.progress || 0));
    const blDiff = getBaselineDiff(act.id);
    let blBarHTML = '';
    if (blDiff) {
      const blLeft = (blDiff.blStart - minDay) * DPX;
      const blW    = Math.max((blDiff.blEnd - blDiff.blStart) * DPX, DPX * 0.5);
      const diffLabel = blDiff.endDiff > 0 ? `+${blDiff.endDiff}d adiantado` : blDiff.endDiff < 0 ? `${blDiff.endDiff}d atrasado` : 'no prazo';
      blBarHTML = `<div style="position:absolute;left:${blLeft}px;width:${blW}px;height:4px;top:${top + ROW - 8}px;background:rgba(148,163,184,.5);border-radius:2px;pointer-events:none" title="Baseline: ${formatDate(blDiff.blStartISO)} → ${formatDate(blDiff.blEndISO)} (${diffLabel})"></div>`;
    }
    barsHTML += `
      <div class="gantt-bar-row" style="top:${top}px;height:${ROW}px">
        <div class="gantt-bar ${isCrit?'gantt-bar-critical':''} ${act.status==='Concluído'?'gantt-bar-done':''}"
             style="left:${bLeft}px;width:${bW}px;background:${barColor}"
             data-id="${act.id}"
             title="${escHtml(act.description)} | ${formatDate(act.startDate)} → ${formatDate(act.dueDate)} | ${progressPct}% concluído"
             onmousedown="ganttBarMD(event,'${act.id}','move')"
             ondblclick="handleEdit('${act.id}')">
          <div class="gantt-bar-progress" style="width:${progressPct}%"></div>
          <span class="gantt-bar-label" style="position:relative;z-index:1">${DPX > 18 ? escHtml(act.description.slice(0,22)) : ''}</span>
          <div class="gantt-bar-resize" onmousedown="ganttBarMD(event,'${act.id}','resize')"></div>
        </div>
      </div>
      ${blBarHTML}`;

    // Separadores de linha
    sepHTML += `<div class="gantt-row-sep" style="top:${(i+1)*ROW}px;width:${totalW}px"></div>`;
  });

  // ── Linhas verticais de grade ──
  let vlines = '';
  for (let dd = 0; dd < totalDays; dd++) {
    const dt = new Date((minDay+dd)*CPM_MS);
    const weekend = dt.getDay()===0||dt.getDay()===6;
    vlines += `<div class="gantt-vline ${weekend?'gantt-vline-weekend':''}" style="left:${dd*DPX}px;height:${totalH}px;${weekend?`width:${DPX}px`:''}"></div>`;
  }

  // ── Linha de hoje ──
  const todayX = (today - minDay) * DPX;
  const todayLine = todayX >= 0 && todayX <= totalW
    ? `<div class="gantt-today-line" style="left:${todayX}px;height:${totalH}px"></div>` : '';

  // ── Setas de dependência (SVG) ──
  let svgPaths = '';
  tree.forEach(act => {
    for (const dep of (act.predecessors || [])) {
      const predInfo = treeById[dep.predId];
      const succInfo = treeById[act.id];
      if (!predInfo || !succInfo) continue;

      const pred = predInfo.act;
      const isCrit = cpm.critical.has(act.id) && cpm.critical.has(dep.predId);
      const color = isCrit ? '#ef4444' : '#94a3b8';

      let x1, x2;
      if (dep.type === 'SS') {
        x1 = (isoToDays(pred.startDate) - minDay) * DPX + 4;
        x2 = (isoToDays(act.startDate)  - minDay) * DPX + 4;
      } else {
        x1 = (isoToDays(pred.dueDate)   - minDay) * DPX + Math.max((isoToDays(pred.dueDate)-isoToDays(pred.startDate))*DPX, 8);
        x2 = (isoToDays(act.startDate)  - minDay) * DPX;
      }
      const y1 = predInfo.row * ROW + ROW / 2;
      const y2 = succInfo.row * ROW + ROW / 2;
      const mx = (x1 + x2) / 2;

      svgPaths += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="${color}" stroke-width="1.5" fill="none" marker-end="url(#arr-${isCrit?'r':'g'})"/>`;
    }
  });

  // ── Monta HTML final ──
  wrap.innerHTML = `
    <div class="gantt-inner">
      <div class="gantt-left-panel">
        <div class="gantt-left-header"><span>WBS</span><span>Título</span></div>
        <div class="gantt-left-rows" id="gantt-left-rows">${leftHTML}</div>
      </div>
      <div class="gantt-right-panel" id="gantt-right-panel">
        <div class="gantt-header-sticky">
          <div class="gantt-months-row" style="width:${totalW}px">${monthsHTML}</div>
          <div class="gantt-days-row"   style="width:${totalW}px">${daysHTML}</div>
        </div>
        <div class="gantt-bars-area" id="gantt-bars-area" style="width:${totalW}px;height:${totalH}px">
          ${vlines}${todayLine}${sepHTML}${barsHTML}
          <svg class="gantt-arrows-svg" width="${totalW}" height="${totalH}">
            <defs>
              <marker id="arr-g" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8"/></marker>
              <marker id="arr-r" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#ef4444"/></marker>
            </defs>
            ${svgPaths}
          </svg>
        </div>
      </div>
    </div>`;

  // Scroll sync
  const leftRows   = document.getElementById('gantt-left-rows');
  const rightPanel = document.getElementById('gantt-right-panel');
  let _sync = false;
  if (leftRows && rightPanel) {
    rightPanel.addEventListener('scroll', () => {
      if (_sync) return; _sync = true;
      leftRows.scrollTop = rightPanel.scrollTop;
      _sync = false;
    });
    leftRows.addEventListener('scroll', () => {
      if (_sync) return; _sync = true;
      rightPanel.scrollTop = leftRows.scrollTop;
      _sync = false;
    });
  }
  } catch(err) {
    console.error('Gantt render error:', err);
    wrap.innerHTML = `<div class="empty-state" style="padding:40px"><span>⚠</span><p>Erro ao renderizar o Gantt.<br><small>${err.message}</small></p></div>`;
  }
}

// ── Gantt Drag ─────────────────────────────────────────────────────
let _gd = null;

function ganttBarMD(e, id, type) {
  e.preventDefault(); e.stopPropagation();
  const act = state.activities.find(a => a.id === id);
  if (!act || act.status === 'Concluído') return;
  _gd = { id, type, startX: e.clientX, origS: act.startDate, origE: act.dueDate, DPX: ganttDPX() };
}

document.addEventListener('mousemove', function(e) {
  if (!_gd) return;
  const dx   = e.clientX - _gd.startX;
  const dD   = Math.round(dx / _gd.DPX);
  if (!dD) return;

  const origS = isoToDays(_gd.origS);
  const origE = isoToDays(_gd.origE);
  let newS = origS, newE = origE;
  if (_gd.type === 'move')   { newS = origS + dD; newE = origE + dD; }
  else                        { newE = Math.max(origE + dD, origS + 1); }

  const bar = document.querySelector(`.gantt-bar[data-id="${_gd.id}"]`);
  if (bar) {
    bar.style.left  = ((newS - _gs.minDay) * _gd.DPX) + 'px';
    bar.style.width = Math.max((newE - newS) * _gd.DPX, 4) + 'px';
  }
  _gd._ns = daysToISO(newS);
  _gd._ne = daysToISO(newE);
});

document.addEventListener('mouseup', function() {
  if (!_gd) return;
  if (_gd._ns && _gd._ne) {
    const act = state.activities.find(a => a.id === _gd.id);
    if (act) {
      updateActivity(_gd.id, { ...act, startDate: _gd._ns, dueDate: _gd._ne });
      _cpmCache = null;
      showToast('Datas atualizadas via Gantt ✓', 'success');
      setTimeout(renderGantt, 50);
    }
  }
  _gd = null;
});

// ── Predecessor modal ──────────────────────────────────────────────
function updatePredecessorOptions(excludeId) {
  const sel = document.getElementById('form-predecessor');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Sem dependência —</option>';
  buildTree(state.activities.filter(a => a.id !== excludeId)).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${'  '.repeat(a._level)}${a._wbs} — ${a.description.slice(0,50)}`;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

// ── Patches: openModal, handleEdit, saveActivity, renderAll ────────
const _tf1_openModal = openModal;
openModal = function() {
  _tf1_openModal();
  setTimeout(() => { updateParentOptions(null); updatePredecessorOptions(null); }, 15);
};

const _tf1_handleEdit = handleEdit;
handleEdit = function(id) {
  _tf1_handleEdit(id);
  setTimeout(() => {
    updatePredecessorOptions(id);
    const act = state.activities.find(a => a.id === id);
    if (act?.predecessors?.length) {
      const p = act.predecessors[0];
      const ps = document.getElementById('form-predecessor');
      const dt = document.getElementById('form-dep-type');
      if (ps) ps.value = p.predId;
      if (dt) dt.value = p.type || 'FS';
    }
  }, 40);
};

const _tf1_saveActivity = saveActivity;
saveActivity = function() {
  const predId  = document.getElementById('form-predecessor')?.value || '';
  const depType = document.getElementById('form-dep-type')?.value || 'FS';
  const editId  = state.editingId; // captura antes de _origSave limpar
  _tf1_saveActivity();
  // Atualiza predecessors no item salvo
  const targetId = editId || state.activities[state.activities.length - 1]?.id;
  if (targetId) {
    const idx = state.activities.findIndex(a => a.id === targetId);
    if (idx !== -1) {
      state.activities[idx].predecessors = predId ? [{ predId, type: depType }] : [];
      persistActivities();
      _cpmCache = null;
    }
  }
};

const _tf1_renderAll = renderAll;
renderAll = function() {
  _cpmCache = null;
  _tf1_renderAll();
  renderKPIsPro();
  if (state.currentView === 'gantt') renderGantt();
};

// ── Patch switchView para Gantt ────────────────────────────────────
const _tf1_switchView = window.switchView;
window.switchView = function(viewName, navEl) {
  const r = _tf1_switchView ? _tf1_switchView(viewName, navEl) : null;
  if (viewName === 'gantt') {
    const t = document.getElementById('page-title');
    if (t) t.textContent = 'Gantt';
    updateGanttFilters();
    setTimeout(() => {
      _cpmCache = null;
      renderGantt();
    }, 80);
  }
  return r;
};

// ── Destaque visual tarefas críticas na tabela ─────────────────────
const _tf1_renderRow = renderRow;
renderRow = function(activity) {
  let html = _tf1_renderRow(activity);
  try {
    const cpm = runCPM();
    if (cpm.critical.has(activity.id)) {
      html = html.replace(`id="row-${activity.id}"`, `id="row-${activity.id}" class="row-critical"`);
    }
  } catch(e) {}
  return html;
};

// ── Init KPIs Pro no DOMContentLoaded ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(renderKPIsPro, 300);
});


/* ══════════════════════════════════════════════════════════════
   BASELINE — SALVAR / COMPARAR PLANEJADO vs REALIZADO
══════════════════════════════════════════════════════════════ */

const BASELINE_KEY = 'taskflow_baseline';

function saveBaseline() {
  if (!state.activities.length) { showToast('Nenhuma atividade para salvar como baseline', 'error'); return; }
  if (!confirm('Salvar baseline agora? Isso registra as datas atuais como "planejado original". Você pode sobrescrever depois.')) return;
  const snapshot = state.activities.map(a => ({
    id:        a.id,
    startDate: a.startDate,
    dueDate:   a.dueDate,
    progress:  a.progress || 0,
    savedAt:   Date.now(),
  }));
  localStorage.setItem(BASELINE_KEY, JSON.stringify(snapshot));
  showToast('✓ Baseline salva! As datas atuais foram registradas como planejado original.', 'success');
}

function loadBaseline() {
  try { return JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null'); }
  catch { return null; }
}

function clearBaseline() {
  if (!confirm('Apagar a baseline atual?')) return;
  localStorage.removeItem(BASELINE_KEY);
  showToast('Baseline removida.', 'info');
  renderGantt();
}

/** Retorna { startDiff, endDiff } em dias entre baseline e atual (positivo = adiantado, negativo = atrasado) */
function getBaselineDiff(activityId) {
  const bl = loadBaseline();
  if (!bl) return null;
  const entry = bl.find(b => b.id === activityId);
  if (!entry) return null;
  const act = state.activities.find(a => a.id === activityId);
  if (!act) return null;
  const blStart = isoToDays(entry.startDate);
  const blEnd   = isoToDays(entry.dueDate);
  const curStart = isoToDays(act.startDate || act.dueDate);
  const curEnd   = isoToDays(act.dueDate);
  return {
    startDiff: blStart - curStart,
    endDiff:   blEnd   - curEnd,
    blStart, blEnd, curStart, curEnd,
    blStartISO: entry.startDate,
    blEndISO:   entry.dueDate,
  };
}

/* ══════════════════════════════════════════════════════════════
   PORTFÓLIO DE PROJETOS
══════════════════════════════════════════════════════════════ */

let _portfolioView = 'timeline';

function setPortfolioView(v) {
  _portfolioView = v;
  document.getElementById('pf-view-timeline').classList.toggle('active', v === 'timeline');
  document.getElementById('pf-view-list').classList.toggle('active', v === 'list');
  document.getElementById('portfolio-timeline-section').style.display = v === 'timeline' ? '' : 'none';
  document.getElementById('portfolio-list-section').style.display     = v === 'list'     ? '' : 'none';
  renderPortfolio();
}

function renderPortfolio() {
  loadProjects();
  const projs = projectState.projects;

  // ── KPIs ──
  const kpiWrap = document.getElementById('portfolio-kpis');
  if (kpiWrap) {
    const total    = projs.length;
    const ativos   = projs.filter(p => p.status === 'Em andamento' || p.status === 'Ativo').length;
    const vencidos = projs.filter(p => p.end && diffDays(p.end) < 0 && p.status !== 'Encerrado' && p.status !== 'Finalizadas').length;
    const allPct   = projs.map(p => {
      const linked = state.activities.filter(a => a.project === p.name);
      return linked.length > 0 ? Math.round(linked.filter(a => a.status === 'Concluído').length / linked.length * 100) : (p.progress || 0);
    });
    const avgPct = total ? Math.round(allPct.reduce((s,v)=>s+v,0) / total) : 0;
    const conflitos = _detectAllResourceConflicts().length;
    kpiWrap.innerHTML = `
      <div class="portfolio-kpi"><div class="portfolio-kpi-label">Total de projetos</div><div class="portfolio-kpi-value">${total}</div><div class="portfolio-kpi-sub">${ativos} em andamento</div></div>
      <div class="portfolio-kpi"><div class="portfolio-kpi-label">Progresso médio</div><div class="portfolio-kpi-value">${avgPct}%</div><div class="portfolio-kpi-sub">média de conclusão</div></div>
      <div class="portfolio-kpi"><div class="portfolio-kpi-label">Prazo vencido</div><div class="portfolio-kpi-value" style="color:${vencidos>0?'#ef4444':'#059669'}">${vencidos}</div><div class="portfolio-kpi-sub">projeto(s) atrasado(s)</div></div>
      <div class="portfolio-kpi"><div class="portfolio-kpi-label">Conflitos de recurso</div><div class="portfolio-kpi-value" style="color:${conflitos>0?'#ef4444':'#059669'}">${conflitos}</div><div class="portfolio-kpi-sub">pessoas sobrepostas</div></div>`;
  }

  if (!projs.length) {
    document.getElementById('portfolio-timeline-wrap').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted)">Nenhum projeto cadastrado. Crie projetos na aba Projetos.</div>';
    return;
  }

  if (_portfolioView === 'timeline') _renderPortfolioTimeline(projs);
  else _renderPortfolioList(projs);
}

function _projSemaforo(proj) {
  const linked  = state.activities.filter(a => a.project === proj.name);
  const overdue = linked.filter(a => a.status === 'Vencido').length;
  const pct     = linked.length > 0 ? Math.round(linked.filter(a=>a.status==='Concluído').length/linked.length*100) : (proj.progress||0);
  if (proj.status === 'Encerrado' || proj.status === 'Finalizadas') return { cls:'sem-cinza', label:'Encerrado', pct };
  if (overdue > 0 || (proj.end && diffDays(proj.end) < 0)) return { cls:'sem-vermelho', label:'Atrasado', pct };
  if (proj.end && diffDays(proj.end) <= 14) return { cls:'sem-amarelo', label:'Atenção', pct };
  return { cls:'sem-verde', label:'No prazo', pct };
}

function _renderPortfolioTimeline(projs) {
  const wrap = document.getElementById('portfolio-timeline-wrap');
  if (!wrap) return;

  // Calcular range de datas
  const allDates = projs.flatMap(p => [p.start, p.end].filter(Boolean));
  if (!allDates.length) { wrap.innerHTML = '<div style="padding:24px;color:var(--text-muted)">Projetos sem datas cadastradas.</div>'; return; }

  const minISO = allDates.reduce((a,b) => a < b ? a : b);
  const maxISO = allDates.reduce((a,b) => a > b ? a : b);
  const minD   = isoToDays(minISO) - 3;
  const maxD   = isoToDays(maxISO) + 10;
  const today  = isoToDays(todayISO());
  const totalDays = maxD - minD;
  const PX_PER_DAY = Math.max(3, Math.min(12, 860 / totalDays));
  const totalW = Math.round(totalDays * PX_PER_DAY);

  // Header meses
  let monthsHTML = '';
  let d = minD;
  while (d < maxD) {
    const dt = new Date(d * 86400000);
    const mo = dt.getMonth(), yr = dt.getFullYear();
    let end = d;
    while (end < maxD) { const d2 = new Date(end*86400000); if (d2.getMonth()!==mo||d2.getFullYear()!==yr) break; end++; }
    const w = Math.round((end-d)*PX_PER_DAY);
    monthsHTML += `<div class="portfolio-tl-month" style="width:${w}px">${dt.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})}</div>`;
    d = end;
  }

  // Linha de hoje
  const todayX = Math.round((today - minD) * PX_PER_DAY);
  const todayLine = todayX >= 0 && todayX <= totalW ? `<div class="portfolio-tl-today" style="left:${todayX}px"></div>` : '';

  const bl = loadBaseline();

  // Rows
  const rowsHTML = projs.map(proj => {
    const sem    = _projSemaforo(proj);
    const pStart = proj.start ? isoToDays(proj.start) : null;
    const pEnd   = proj.end   ? isoToDays(proj.end)   : null;

    let barHTML = '';
    if (pStart && pEnd && pEnd >= pStart) {
      const bL = Math.round((pStart - minD) * PX_PER_DAY);
      const bW = Math.max(Math.round((pEnd - pStart) * PX_PER_DAY), 6);
      const color = proj.color || '#1d4ed8';
      const pct   = sem.pct;

      // Baseline bar (cinza, fina abaixo)
      let blBar = '';
      if (bl) {
        // Pega datas de baseline das atividades do projeto
        const projActs = state.activities.filter(a => a.project === proj.name);
        const blEntries = bl.filter(b => projActs.some(a => a.id === b.id));
        if (blEntries.length) {
          const blStartD = Math.min(...blEntries.map(b => isoToDays(b.startDate)).filter(Boolean));
          const blEndD   = Math.max(...blEntries.map(b => isoToDays(b.dueDate)).filter(Boolean));
          if (blStartD && blEndD) {
            const blL = Math.round((blStartD - minD) * PX_PER_DAY);
            const blW = Math.max(Math.round((blEndD - blStartD) * PX_PER_DAY), 6);
            blBar = `<div class="portfolio-tl-baseline" style="left:${blL}px;width:${blW}px;background:${color}"></div>`;
          }
        }
      }

      barHTML = `
        <div class="portfolio-tl-bar" style="left:${bL}px;width:${bW}px;background:${color}">
          <div class="portfolio-tl-progress" style="width:${pct}%;background:#fff;border-radius:4px 0 0 4px;position:absolute;left:0;top:0;bottom:0"></div>
          <span class="portfolio-tl-bar-label" style="position:relative;z-index:1">${escHtml(proj.name)} ${pct}%</span>
        </div>
        ${blBar}`;
    }

    // Milestones (atividades com duração 0 ou marcadas como marco)
    const milestones = state.activities.filter(a => a.project === proj.name && a.isMilestone);
    const milestonesHTML = milestones.map(m => {
      if (!m.dueDate) return '';
      const mX = Math.round((isoToDays(m.dueDate) - minD) * PX_PER_DAY);
      return `<div class="portfolio-tl-milestone" style="left:${mX-9}px;background:${proj.color||'#1d4ed8'}" title="Marco: ${escHtml(m.description)}"></div>`;
    }).join('');

    return `
      <div class="portfolio-tl-row">
        <div class="portfolio-tl-name-cell">
          <span class="portfolio-tl-proj-name" title="${escHtml(proj.name)}">${escHtml(proj.name)}</span>
          <span class="semaforo ${sem.cls}" style="font-size:.62rem;padding:1px 7px">${sem.label}</span>
        </div>
        <div class="portfolio-tl-bars" style="min-width:${totalW}px">
          ${todayLine}${barHTML}${milestonesHTML}
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <div style="overflow-x:auto">
      <div style="min-width:${totalW+220}px">
        <div class="portfolio-tl-head">
          <div class="portfolio-tl-names" style="padding:8px 12px;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Projeto</div>
          <div class="portfolio-tl-months" style="width:${totalW}px">${monthsHTML}</div>
        </div>
        <div class="portfolio-tl-body">${rowsHTML}</div>
      </div>
    </div>`;
}

function _renderPortfolioList(projs) {
  const list = document.getElementById('portfolio-list');
  if (!list) return;
  const bl = loadBaseline();

  list.innerHTML = projs.map(proj => {
    const linked  = state.activities.filter(a => a.project === proj.name);
    const total   = linked.length;
    const done    = linked.filter(a => a.status === 'Concluído').length;
    const overdue = linked.filter(a => a.status === 'Vencido').length;
    const pct     = total > 0 ? Math.round(done/total*100) : (proj.progress||0);
    const sem     = _projSemaforo(proj);

    // Desvio de baseline
    let blDesvio = '';
    if (bl) {
      const projActs = state.activities.filter(a => a.project === proj.name);
      const blEntries = bl.filter(b => projActs.some(a => a.id === b.id));
      if (blEntries.length) {
        const blEndD  = Math.max(...blEntries.map(b => isoToDays(b.dueDate)).filter(Boolean));
        const curEndD = proj.end ? isoToDays(proj.end) : null;
        if (blEndD && curEndD) {
          const diff = blEndD - curEndD;
          if (diff > 0) blDesvio = `<span class="baseline-diff-pos">+${diff}d adiantado</span>`;
          else if (diff < 0) blDesvio = `<span class="baseline-diff-neg">${diff}d atrasado</span>`;
          else blDesvio = `<span style="font-size:.68rem;color:var(--text-muted)">No prazo</span>`;
        }
      }
    }

    const color = proj.color || '#1d4ed8';
    return `
      <div class="portfolio-row" style="border-left:4px solid ${color}">
        <div>
          <div class="pf-row-name">${proj.code ? `<span style="font-size:.68rem;color:var(--text-muted);margin-right:6px">${escHtml(proj.code)}</span>` : ''}${escHtml(proj.name)}</div>
          <div class="pf-row-meta">👤 ${escHtml(proj.manager||'—')} &nbsp;·&nbsp; 📅 ${proj.start?formatDate(proj.start):'?'} → ${proj.end?formatDate(proj.end):'?'}</div>
        </div>
        <span class="semaforo ${sem.cls}">${sem.label}</span>
        <div style="text-align:center">
          <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:4px">Progresso</div>
          <div style="font-weight:800;font-size:1.1rem;color:var(--primary)">${pct}%</div>
          <div class="pf-pbar-wrap" style="margin:4px auto 0">
            <div class="pf-pbar-real" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>
        <div style="text-align:center;font-size:.78rem">
          <div style="color:var(--text-muted);font-size:.65rem;margin-bottom:3px">Atividades</div>
          <div>${done}/${total}${overdue>0?` <span style="color:#ef4444">(${overdue} atrasada${overdue>1?'s':''})</span>`:''}</div>
          ${blDesvio ? `<div style="margin-top:3px">${blDesvio}</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="filterAndGo('proj_${escAttr(proj.name)}')">Ver →</button>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   CONFLITO DE RECURSOS — HEATMAP SEMANAL
══════════════════════════════════════════════════════════════ */

let _recursosPeriod = 4;

function setRecursosPeriod(weeks, btn) {
  _recursosPeriod = weeks;
  document.querySelectorAll('.recursos-period-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderRecursos();
}

/** Detecta todos os conflitos de recurso entre projetos */
function _detectAllResourceConflicts() {
  const conflicts = [];
  const acts = state.activities.filter(a => a.status !== 'Concluído' && a.dueDate);

  // Agrupa todas as pessoas com suas atividades
  const personMap = {};
  acts.forEach(act => {
    const start = act.startDate || act.dueDate;
    const end   = act.dueDate;
    const people = [...(Array.isArray(act.equipe) ? act.equipe : []), act.projetista, act.responsible, act.lider].filter(Boolean).map(p=>p.trim().toLowerCase());
    const uniquePeople = [...new Set(people)];
    uniquePeople.forEach(p => {
      if (!personMap[p]) personMap[p] = [];
      personMap[p].push({ ...act, _start: start, _end: end });
    });
  });

  // Para cada pessoa, verifica sobreposição entre projetos distintos
  Object.entries(personMap).forEach(([person, tasks]) => {
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i+1; j < tasks.length; j++) {
        const a = tasks[i], b = tasks[j];
        if (a.project === b.project) continue;
        const overlap = a._start <= b._end && a._end >= b._start;
        if (overlap) {
          const already = conflicts.find(c => c.person === person && ((c.projA === a.project && c.projB === b.project)||(c.projA === b.project && c.projB === a.project)));
          if (!already) conflicts.push({ person, projA: a.project, projB: b.project, startA: a._start, endA: a._end, startB: b._start, endB: b._end });
        }
      }
    }
  });
  return conflicts;
}

function renderRecursos() {
  const heatmap = document.getElementById('recursos-heatmap');
  const conflictList = document.getElementById('recursos-conflict-list');
  if (!heatmap) return;

  const weeks = _recursosPeriod;
  const todayD = isoToDays(todayISO());

  // Gera semanas
  const weekStarts = [];
  for (let w = 0; w < weeks; w++) {
    const start = todayD + w * 7;
    weekStarts.push(start);
  }

  // Coleta todas as pessoas únicas
  const allPeople = new Set();
  state.activities.forEach(act => {
    if (act.status === 'Concluído') return;
    [act.lider, act.projetista, act.responsible, ...(Array.isArray(act.equipe)?act.equipe:[])].filter(Boolean).forEach(p => allPeople.add(p.trim()));
  });

  if (!allPeople.size) {
    heatmap.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted)">Nenhum recurso com atividades ativas. Adicione atividades com equipe preenchida.</div>';
    if (conflictList) conflictList.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;padding:12px">Nenhum conflito detectado.</div>';
    return;
  }

  // Header de semanas
  const weeksHeadHTML = weekStarts.map(ws => {
    const dt = new Date(ws * 86400000);
    return `<div class="recursos-week-hd">${dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</div>`;
  }).join('');

  // Rows por pessoa
  const rowsHTML = [...allPeople].sort().map(person => {
    const personLower = person.toLowerCase();

    const cellsHTML = weekStarts.map(ws => {
      const we = ws + 6;
      // Horas alocadas na semana
      const weekActs = state.activities.filter(act => {
        if (act.status === 'Concluído') return false;
        const s = isoToDays(act.startDate || act.dueDate);
        const e = isoToDays(act.dueDate);
        const overlap = s <= we && e >= ws;
        if (!overlap) return false;
        const people = [act.lider, act.projetista, act.responsible, ...(Array.isArray(act.equipe)?act.equipe:[])].filter(Boolean).map(p=>p.trim().toLowerCase());
        return people.includes(personLower);
      });

      const totalH = weekActs.reduce((sum, a) => {
        const h = a.duration ? parseFloat(a.duration) : calcDurationHours(a.startDate, a.dueDate) || 8;
        // Distribui proporcionalmente pela semana
        const actDays = Math.max(1, isoToDays(a.dueDate) - isoToDays(a.startDate||a.dueDate) + 1);
        const overlapDays = Math.min(we, isoToDays(a.dueDate)) - Math.max(ws, isoToDays(a.startDate||a.dueDate)) + 1;
        return sum + (h / actDays) * Math.max(0, overlapDays);
      }, 0);

      const availH = 40; // 40h/semana padrão
      const pct = Math.round(totalH / availH * 100);

      let cls = 'rc-empty';
      let label = '';
      if (totalH > 0) {
        label = `${Math.round(totalH)}h`;
        if (pct >= 100)    cls = 'rc-over';
        else if (pct >= 70) cls = 'rc-warn';
        else               cls = 'rc-free';
      }

      const projNames = [...new Set(weekActs.map(a => a.project))].join(', ');
      return `<div class="recursos-cell ${cls}" title="${projNames ? projNames + ' — ' : ''}${Math.round(totalH)}h (${pct}%)">${label}</div>`;
    }).join('');

    return `
      <div class="recursos-heatmap-row">
        <div class="recursos-person-cell">
          <span class="recursos-person-name">${escHtml(person)}</span>
        </div>
        <div class="recursos-weeks" style="flex:1;display:flex">${cellsHTML}</div>
      </div>`;
  }).join('');

  heatmap.innerHTML = `
    <div class="recursos-heatmap-head">
      <div class="recursos-name-col">Pessoa</div>
      <div class="recursos-weeks" style="flex:1;display:flex">${weeksHeadHTML}</div>
    </div>
    ${rowsHTML}`;

  // Lista de conflitos
  const conflicts = _detectAllResourceConflicts();
  if (conflictList) {
    if (!conflicts.length) {
      conflictList.innerHTML = '<div style="color:#059669;font-size:.8rem;padding:12px">✓ Nenhum conflito detectado entre projetos.</div>';
    } else {
      conflictList.innerHTML = conflicts.map(c => `
        <div class="conflict-item">
          <div class="conflict-item-title">⚠ ${escHtml(c.person)}</div>
          <div class="conflict-item-detail">
            Está alocado em <strong>${escHtml(c.projA)}</strong> (${formatDate(c.startA)} → ${formatDate(c.endA)}) 
            e em <strong>${escHtml(c.projB)}</strong> (${formatDate(c.startB)} → ${formatDate(c.endB)}) simultaneamente.
          </div>
        </div>`).join('');
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   FASE 2 — GESTÃO DE EQUIPE + CARGA + CUSTOS
══════════════════════════════════════════════════════════════ */

const COLAB_KEY = 'taskflow_colaboradores';
const COLAB_COLORS = ['#1d4ed8','#059669','#d97706','#ea580c','#7c3aed','#0891b2','#db2777','#64748b'];

let colabState = { colabs: [], editingId: null };

// ── Persistência ───────────────────────────────────────────────
function loadColabs() {
  try { colabState.colabs = JSON.parse(localStorage.getItem(COLAB_KEY) || '[]'); }
  catch { colabState.colabs = []; }
}

function persistColabs() {
  localStorage.setItem(COLAB_KEY, JSON.stringify(colabState.colabs));
}

function genColabId() {
  return `col_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
}

// ── CRUD ───────────────────────────────────────────────────────
function saveColab() {
  const name     = document.getElementById('colab-name').value.trim();
  const role     = document.getElementById('colab-role').value.trim();
  const team     = document.getElementById('colab-team').value;
  const capacity = parseFloat(document.getElementById('colab-capacity').value) || 8;
  const costHour = parseFloat(document.getElementById('colab-cost-hour').value) || 0;
  const color    = document.getElementById('colab-color').value;
  const obs      = document.getElementById('colab-obs').value.trim();

  if (!name) { showToast('Informe o nome do colaborador', 'error'); return; }

  if (colabState.editingId) {
    const idx = colabState.colabs.findIndex(c => c.id === colabState.editingId);
    if (idx !== -1) {
      colabState.colabs[idx] = { ...colabState.colabs[idx], name, role, team, capacity, costHour, color, obs, updatedAt: Date.now() };
      showToast('Colaborador atualizado ✓', 'success');
    }
  } else {
    colabState.colabs.push({ id: genColabId(), name, role, team, capacity, costHour, color, obs, createdAt: Date.now() });
    showToast('Colaborador cadastrado ✓', 'success');
  }

  persistColabs();
  closeColabModal();
  renderEquipe();
}

function deleteColab(id) {
  const c = colabState.colabs.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Remover colaborador "${c.name}"?`)) return;
  colabState.colabs = colabState.colabs.filter(x => x.id !== id);
  persistColabs();
  renderEquipe();
  showToast('Colaborador removido', 'error');
}

function editColab(id) {
  const c = colabState.colabs.find(x => x.id === id);
  if (!c) return;
  colabState.editingId = id;
  document.getElementById('colab-modal-title').textContent = 'Editar Colaborador';
  document.getElementById('colab-form-id').value     = id;
  document.getElementById('colab-name').value        = c.name;
  document.getElementById('colab-role').value        = c.role || '';
  document.getElementById('colab-team').value        = c.team || 'Equipe 01';
  document.getElementById('colab-capacity').value   = c.capacity || 8;
  document.getElementById('colab-cost-hour').value  = c.costHour || '';
  document.getElementById('colab-color').value      = c.color || '#1d4ed8';
  document.getElementById('colab-obs').value        = c.obs || '';
  document.getElementById('colab-modal-overlay').classList.add('open');
}

// ── Cálculo de carga ───────────────────────────────────────────
function calcColabLoad(colab, filterProject) {
  const myTasks = state.activities.filter(a => {
    if (a.status === 'Concluído') return false;
    if (filterProject && a.project !== filterProject) return false;
    const name = (a.responsible || '').toLowerCase().trim();
    return name === colab.name.toLowerCase().trim();
  });

  const totalHours = myTasks.reduce((sum, a) => {
    const h = a.duration
      ? parseFloat(a.duration)
      : calcDurationHours(a.startDate, a.dueDate) || 0;
    return sum + h;
  }, 0);

  // Dias de trabalho disponíveis (próximos 30 dias úteis)
  const availHours = (colab.capacity || 8) * 22; // ~1 mês
  const pct = availHours > 0 ? Math.min((totalHours / availHours) * 100, 200) : 0;

  // Custo total alocado
  const costTotal = totalHours * (colab.costHour || 0);

  return { totalHours, availHours, pct, myTasks, costTotal };
}

function loadStatus(pct) {
  if (pct > 110) return { label: 'Sobrecarregado', css: 'colab-badge-over', color: '#ef4444' };
  if (pct > 85)  return { label: 'Atenção',        css: 'colab-badge-warn', color: '#d97706' };
  return               { label: 'Normal',           css: 'colab-badge-ok',  color: '#059669' };
}

// ── Render ─────────────────────────────────────────────────────
function renderEquipe() {
  loadColabs();
  const grid  = document.getElementById('equipe-grid');
  const empty = document.getElementById('equipe-empty');
  const summary = document.getElementById('equipe-summary-grid');
  const filterProj = document.getElementById('equipe-filter-project')?.value || '';

  // Atualiza filtro de projeto
  const fpSel = document.getElementById('equipe-filter-project');
  if (fpSel) {
    const cur = fpSel.value;
    const projs = [...new Set(state.activities.map(a => a.project).filter(Boolean))].sort();
    fpSel.innerHTML = '<option value="">Todos os projetos</option>' +
      projs.map(p => `<option value="${escAttr(p)}"${p===cur?' selected':''}>${escHtml(p)}</option>`).join('');
  }

  if (!colabState.colabs.length) {
    if (grid)  grid.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    if (summary) summary.innerHTML = '';
    return;
  }
  if (empty) empty.classList.add('hidden');

  // ── Summary cards ──
  const allLoads = colabState.colabs.map(c => calcColabLoad(c, filterProj));
  const totalAloc = allLoads.reduce((s, l) => s + l.totalHours, 0);
  const totalCost = allLoads.reduce((s, l) => s + l.costTotal, 0);
  const overCount = allLoads.filter(l => l.pct > 110).length;
  const warnCount = allLoads.filter(l => l.pct > 85 && l.pct <= 110).length;

  if (summary) {
    summary.innerHTML = `
      <div class="load-summary-card">
        <div class="load-summary-label">Total Alocado</div>
        <div class="load-summary-value">${totalAloc.toFixed(0)}h</div>
        <div class="load-summary-sub">${colabState.colabs.length} colaborador(es)</div>
      </div>
      <div class="load-summary-card">
        <div class="load-summary-label">Custo Total Alocado</div>
        <div class="load-summary-value" style="font-size:1.1rem">R$ ${totalCost.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
        <div class="load-summary-sub">horas × custo/hora</div>
      </div>
      <div class="load-summary-card">
        <div class="load-summary-label">Sobrecarregados</div>
        <div class="load-summary-value" style="color:${overCount>0?'#ef4444':'#059669'}">${overCount}</div>
        <div class="load-summary-sub">${warnCount} em atenção</div>
      </div>
      <div class="load-summary-card">
        <div class="load-summary-label">Média de Carga</div>
        <div class="load-summary-value">${colabState.colabs.length ? Math.round(allLoads.reduce((s,l)=>s+l.pct,0)/colabState.colabs.length) : 0}%</div>
        <div class="load-summary-sub">do mês disponível</div>
      </div>`;
  }

  // ── Colaborador cards ──
  if (grid) {
    grid.innerHTML = colabState.colabs.map((c, i) => {
      const load   = allLoads[i];
      const status = loadStatus(load.pct);
      const initials = c.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
      const barColor = load.pct > 110 ? '#ef4444' : load.pct > 85 ? '#d97706' : '#059669';
      const taskItems = load.myTasks.slice(0,4).map(a =>
        `<div class="colab-task-item">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${escHtml(a.description)}</span>
          <span style="flex-shrink:0;margin-left:6px;color:${diffDays(a.dueDate)<0?'#ef4444':'var(--text-muted)'}">${formatDate(a.dueDate)}</span>
        </div>`
      ).join('');
      const moreTasks = load.myTasks.length > 4
        ? `<div style="font-size:.62rem;color:var(--text-muted);padding-top:3px">+${load.myTasks.length-4} tarefa(s)</div>` : '';

      return `
        <div class="colab-card">
          <div class="colab-card-header">
            <div class="colab-avatar" style="background:${c.color||'#1d4ed8'}">${initials}</div>
            <div style="flex:1">
              <div class="colab-name">${escHtml(c.name)}</div>
              <div class="colab-role">${escHtml(c.role||'—')} · ${escHtml(c.team||'—')}</div>
            </div>
            <span class="colab-badge ${status.css}">${status.label}</span>
          </div>

          <div class="colab-load-wrap">
            <div class="colab-load-label">
              <span>Carga alocada</span>
              <span style="font-weight:700;color:${barColor}">${load.totalHours.toFixed(0)}h / ${load.availHours}h (${Math.round(load.pct)}%)</span>
            </div>
            <div class="colab-load-bar">
              <div class="colab-load-fill" style="width:${Math.min(load.pct,100)}%;background:${barColor}"></div>
            </div>
          </div>

          <div class="colab-meta-row">
            <div class="colab-meta-item">⏱ ${c.capacity||8}h/dia</div>
            ${c.costHour ? `<div class="colab-meta-item">💰 R$ ${parseFloat(c.costHour).toFixed(2)}/h</div>` : ''}
            ${load.costTotal > 0 ? `<div class="colab-meta-item" style="color:var(--primary)">Total: R$ ${load.costTotal.toLocaleString('pt-BR',{minimumFractionDigits:0})}</div>` : ''}
            <div class="colab-meta-item">📋 ${load.myTasks.length} tarefa(s)</div>
          </div>

          ${load.myTasks.length ? `
            <div class="colab-tasks-list">${taskItems}${moreTasks}</div>
          ` : '<div style="font-size:.65rem;color:var(--text-muted);margin-top:8px">Nenhuma tarefa ativa alocada</div>'}

          <div class="colab-actions">
            <button class="btn-action btn-edit" onclick="editColab('${c.id}')">✎ Editar</button>
            <button class="btn-action btn-delete" onclick="deleteColab('${c.id}')">✕ Remover</button>
          </div>
        </div>`;
    }).join('');
  }
}

// ── Modal Colab ────────────────────────────────────────────────
function openColabModal() {
  colabState.editingId = null;
  document.getElementById('colab-modal-title').textContent = 'Novo Colaborador';
  document.getElementById('colab-form-id').value    = '';
  document.getElementById('colab-name').value       = '';
  document.getElementById('colab-role').value       = '';
  document.getElementById('colab-team').value       = 'Equipe 01';
  document.getElementById('colab-capacity').value  = 8;
  document.getElementById('colab-cost-hour').value = '';
  document.getElementById('colab-color').value     = COLAB_COLORS[colabState.colabs.length % COLAB_COLORS.length];
  document.getElementById('colab-obs').value       = '';
  document.getElementById('colab-modal-overlay').classList.add('open');
}

function closeColabModal() {
  document.getElementById('colab-modal-overlay').classList.remove('open');
  colabState.editingId = null;
}

function closeColabModalOutside(e) {
  if (e.target === document.getElementById('colab-modal-overlay')) closeColabModal();
}

// ── Patch switchView para Equipe ───────────────────────────────
const _tf2_switchView = window.switchView;
window.switchView = function(viewName, navEl) {
  const r = _tf2_switchView ? _tf2_switchView(viewName, navEl) : null;
  if (viewName === 'equipe') {
    const t = document.getElementById('page-title');
    if (t) t.textContent = 'Equipe';
    loadColabs();
    renderEquipe();
  }
  return r;
};

// ── KPI Equipe no Dashboard ────────────────────────────────────
function renderKPIsEquipe() {
  loadColabs();
  if (!colabState.colabs.length) return;
  const loads = colabState.colabs.map(c => calcColabLoad(c, ''));
  const over  = loads.filter(l => l.pct > 110).length;
  // Adiciona badge no nav item de Equipe se houver sobrecarga
  const navEl = document.querySelector('[data-view="equipe"]');
  if (navEl) {
    let badge = navEl.querySelector('.equipe-alert-badge');
    if (over > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'equipe-alert-badge';
        badge.style.cssText = 'background:#ef4444;color:#fff;font-size:.55rem;font-weight:800;padding:1px 5px;border-radius:100px;margin-left:auto';
        navEl.appendChild(badge);
      }
      badge.textContent = over;
    } else if (badge) {
      badge.remove();
    }
  }
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadColabs();
  setTimeout(renderKPIsEquipe, 500);
});

// ── Patch renderAll para atualizar badge de equipe ─────────────
const _tf2_renderAll = renderAll;
renderAll = function() {
  _tf2_renderAll();
  renderKPIsEquipe();
};
