/* ============================================================
   TASKFLOW PRO — TASKS.JS
   Gerenciamento de tarefas, prioridade automática, dependências
============================================================ */
'use strict';

/* ── CONFIG ─────────────────────────────────────────────────── */
const CONFIG = {
  STORAGE_KEY:       'taskflow_pro_activities',
  PROJECTS_KEY:      'taskflow_pro_projects',
  COLABS_KEY:        'taskflow_pro_colabs',
  HISTORY_KEY:       'taskflow_pro_history',
  DISMISSED_KEY:     'taskflow_pro_dismissed',
  MAX_HISTORY:       300,
  DATE_LOCALE:       'pt-BR',
};

/* ── STATE GLOBAL ──────────────────────────────────────────── */
window.state = {
  activities:    [],
  projects:      [],
  collaborators: [],
  history:       [],
  dismissedAlerts: [],
  currentView:   'dashboard',
  filters:       { project: '', team: '', status: '', dateFrom: '', dateTo: '', critOnly: false },
  sort:          { field: 'dueDate', dir: 'asc' },
  editingId:     null,
  reschedulingId: null,
};

/* ── UTILITÁRIOS DE DATA ─────────────────────────────────────── */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Diferença em dias: positivo = futuro, negativo = passado */
function diffDays(iso) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function calcDuration(start, end) {
  if (!start || !end) return null;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.max(0, Math.round((e - s) / 86400000));
}

function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return escHtml(s); }

function uuid() {
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

window.todayISO   = todayISO;
window.formatDate = formatDate;
window.diffDays   = diffDays;
window.calcDuration = calcDuration;
window.escHtml    = escHtml;
window.escAttr    = escAttr;
window.uuid       = uuid;

/* ── SCORE DE PRIORIDADE AUTOMÁTICA ─────────────────────────── */
/**
 * Calcula o score numérico de prioridade.
 * Quanto maior o score, mais urgente.
 *
 * Fatores:
 *  - Dias de atraso (multiplicado pelo peso)
 *  - Vence hoje
 *  - Vence em até 3 dias
 *  - Is crítica
 *  - Peso da tarefa (1-3)
 */
function calcPriorityScore(a) {
  if (a.status === 'Concluído') return -1;
  const diff   = diffDays(a.dueDate);
  const weight = a.weight || 1;
  let score    = 0;

  if (diff < 0)  score += Math.abs(diff) * 15 * weight;  // atraso
  if (diff === 0) score += 80;                             // vence hoje
  if (diff > 0 && diff <= 2)  score += 50;                // vence em 2 dias
  if (diff > 2 && diff <= 5)  score += 20;                // vence em até 5 dias
  if (a.isCritical) score += 60;                          // caminho crítico
  score += weight * 5;                                     // peso base

  return score;
}

/**
 * Retorna objeto { level, label, css, score } para exibição.
 */
function getPriority(a) {
  if (a.status === 'Concluído') return { level: 'none', label: '—', css: 'prio-none', score: -1 };
  const score = calcPriorityScore(a);
  const diff  = diffDays(a.dueDate);

  if (diff < 0 || score >= 100)
    return { level: 'critical', label: '🔥 Crítico', css: 'prio-critical', score };
  if (diff === 0 || score >= 60)
    return { level: 'high', label: '⚡ Alto', css: 'prio-high', score };
  if (score >= 25)
    return { level: 'medium', label: '⚠ Médio', css: 'prio-medium', score };
  return   { level: 'low', label: 'Normal', css: 'prio-low', score };
}

window.calcPriorityScore = calcPriorityScore;
window.getPriority       = getPriority;

/* ── STATUS AUTOMÁTICO ─────────────────────────────────────── */
function autoStatus(a) {
  if (a.status === 'Concluído' || a.status === 'Reprogramado') return a;
  if (diffDays(a.dueDate) < 0) a.status = 'Vencido';
  return a;
}

/* ── VERIFICAÇÃO DE BLOQUEIO POR DEPENDÊNCIA ─────────────────── */
function isBlocked(a) {
  if (!a.predecessorId) return false;
  const pred = state.activities.find(x => x.id === a.predecessorId);
  if (!pred) return false;
  return pred.status !== 'Concluído';
}

function getBlockingChain(a, visited = new Set()) {
  if (!a.predecessorId || visited.has(a.id)) return [];
  visited.add(a.id);
  const pred = state.activities.find(x => x.id === a.predecessorId);
  if (!pred) return [];
  const chain = getBlockingChain(pred, visited);
  return [...chain, pred];
}

window.isBlocked      = isBlocked;
window.getBlockingChain = getBlockingChain;

/* ── PERSISTÊNCIA ─────────────────────────────────────────── */
function saveActivities() {
  localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.activities));
}
function loadActivities() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    state.activities = raw ? JSON.parse(raw) : [];
    // Garante campos mínimos e atualiza status automático
    state.activities = state.activities.map(a => {
      if (!a.id)     a.id     = uuid();
      if (!a.weight) a.weight = 1;
      return autoStatus(a);
    });
  } catch(e) {
    state.activities = [];
  }
}

function saveProjects() {
  localStorage.setItem(CONFIG.PROJECTS_KEY, JSON.stringify(state.projects));
}
function loadProjects() {
  try {
    const raw = localStorage.getItem(CONFIG.PROJECTS_KEY);
    state.projects = raw ? JSON.parse(raw) : [];
  } catch(e) { state.projects = []; }
}

function saveCollaborators() {
  localStorage.setItem(CONFIG.COLABS_KEY, JSON.stringify(state.collaborators));
}
function loadCollaborators() {
  try {
    const raw = localStorage.getItem(CONFIG.COLABS_KEY);
    state.collaborators = raw ? JSON.parse(raw) : [];
  } catch(e) { state.collaborators = []; }
}

function saveHistory() {
  localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(state.history.slice(0, CONFIG.MAX_HISTORY)));
}
function loadHistory() {
  try {
    const raw = localStorage.getItem(CONFIG.HISTORY_KEY);
    state.history = raw ? JSON.parse(raw) : [];
  } catch(e) { state.history = []; }
}

function addHistory(action, data) {
  state.history.unshift({ ts: Date.now(), action, data });
  saveHistory();
}

window.saveActivities    = saveActivities;
window.loadActivities    = loadActivities;
window.saveProjects      = saveProjects;
window.loadProjects      = loadProjects;
window.saveCollaborators = saveCollaborators;
window.loadCollaborators = loadCollaborators;
window.addHistory        = addHistory;
window.autoStatus        = autoStatus;

/* ── CRUD DE ATIVIDADES ───────────────────────────────────── */
function createActivity(data) {
  const a = {
    id:            uuid(),
    project:       data.project        || '',
    team:          data.team           || '',
    description:   data.description   || '',
    responsible:   data.responsible   || '',
    startDate:     data.startDate      || todayISO(),
    dueDate:       data.dueDate        || todayISO(),
    duration:      data.duration       || null,
    status:        data.status         || 'Pendente',
    isCritical:    data.isCritical     || false,
    predecessorId: data.predecessorId  || null,
    depType:       data.depType        || 'FS',
    weight:        parseInt(data.weight) || 1,
    obs:           data.obs            || '',
    parentId:      data.parentId       || null,
    createdAt:     Date.now(),
  };
  autoStatus(a);
  state.activities.push(a);
  saveActivities();
  addHistory('CRIAR', { id: a.id, description: a.description });
  return a;
}

function updateActivity(id, data) {
  const idx = state.activities.findIndex(a => a.id === id);
  if (idx < 0) return null;
  const prev = { ...state.activities[idx] };
  Object.assign(state.activities[idx], data);
  autoStatus(state.activities[idx]);
  saveActivities();
  addHistory('EDITAR', { id, prev, next: { ...state.activities[idx] } });
  return state.activities[idx];
}

function deleteActivity(id) {
  const a = state.activities.find(x => x.id === id);
  if (!a) return;
  state.activities = state.activities.filter(x => x.id !== id);
  // Remove dependências que apontem para esta tarefa
  state.activities.forEach(x => { if (x.predecessorId === id) x.predecessorId = null; });
  saveActivities();
  addHistory('DELETAR', { id, description: a.description });
}

/**
 * Reprogramação inteligente: atualiza data de uma tarefa e
 * opcionalmente propaga para dependentes.
 */
function rescheduleActivity(id, newDate, reason, propagate = false) {
  const a = state.activities.find(x => x.id === id);
  if (!a) return;
  const oldDate = a.dueDate;
  const deltaMs = new Date(newDate) - new Date(oldDate);
  const deltaDays = Math.round(deltaMs / 86400000);

  a.dueDate   = newDate;
  a.status    = 'Reprogramado';
  a.obs       = (a.obs ? a.obs + ' | ' : '') + `Reprogramado: ${reason || 'sem motivo'}`;
  autoStatus(a);

  if (propagate && deltaDays !== 0) {
    // Propaga para todas as tarefas que dependem desta (direto e indireto)
    propagateDates(id, deltaDays);
  }

  saveActivities();
  addHistory('REPROGRAMAR', { id, oldDate, newDate, reason, propagate });
}

function propagateDates(fromId, deltaDays) {
  const dependents = state.activities.filter(a => a.predecessorId === fromId);
  dependents.forEach(dep => {
    if (dep.startDate) {
      const s = new Date(dep.startDate + 'T00:00:00');
      s.setDate(s.getDate() + deltaDays);
      dep.startDate = s.toISOString().slice(0, 10);
    }
    const d = new Date(dep.dueDate + 'T00:00:00');
    d.setDate(d.getDate() + deltaDays);
    dep.dueDate = d.toISOString().slice(0, 10);
    dep.status  = 'Reprogramado';
    autoStatus(dep);
    propagateDates(dep.id, deltaDays); // recursivo
  });
}

window.createActivity   = createActivity;
window.updateActivity   = updateActivity;
window.deleteActivity   = deleteActivity;
window.rescheduleActivity = rescheduleActivity;
window.propagateDates   = propagateDates;

/* ── MÉTRICAS GERAIS ─────────────────────────────────────── */
function calcMetrics(acts) {
  const total    = acts.length;
  const done     = acts.filter(a => a.status === 'Concluído').length;
  const overdue  = acts.filter(a => a.status === 'Vencido' || (a.status !== 'Concluído' && diffDays(a.dueDate) < 0)).length;
  const today    = acts.filter(a => a.status !== 'Concluído' && diffDays(a.dueDate) === 0).length;
  const critical = acts.filter(a => a.isCritical && a.status !== 'Concluído').length;
  const pending  = acts.filter(a => a.status === 'Pendente' || a.status === 'Reprogramado').length;
  const blocked  = acts.filter(a => isBlocked(a) && a.status !== 'Concluído').length;

  const pctDone    = total > 0 ? (done / total * 100).toFixed(1) : 0;
  const pctOverdue = total > 0 ? (overdue / total * 100).toFixed(1) : 0;
  const pctOnTime  = total > 0 ? ((done / total) * 100).toFixed(1) : 0;

  // SPI simplificado
  const spi = (pending + done) > 0
    ? (done / Math.max(done + overdue, 1)).toFixed(2)
    : '—';

  // Status do projeto
  let healthLevel, healthLabel, healthColor;
  if (parseFloat(pctOverdue) === 0 && critical === 0) {
    healthLevel = 'ok';    healthLabel = 'PROJETO OK';     healthColor = '#10b981';
  } else if (parseFloat(pctOverdue) < 20 || critical <= 2) {
    healthLevel = 'risk';  healthLabel = 'RISCO';          healthColor = '#f59e0b';
  } else {
    healthLevel = 'late';  healthLabel = 'PROJETO ATRASADO'; healthColor = '#ef4444';
  }

  return { total, done, overdue, today, critical, pending, blocked,
           pctDone, pctOverdue, pctOnTime, spi,
           healthLevel, healthLabel, healthColor };
}

window.calcMetrics = calcMetrics;

/* ── MÉTRICAS POR EQUIPE ──────────────────────────────────── */
function calcTeamMetrics() {
  const teams = [...new Set(state.activities.map(a => a.team).filter(Boolean))].sort();
  return teams.map(team => {
    const acts    = state.activities.filter(a => a.team === team);
    const total   = acts.length;
    const done    = acts.filter(a => a.status === 'Concluído').length;
    const overdue = acts.filter(a => a.status === 'Vencido' || (a.status !== 'Concluído' && diffDays(a.dueDate) < 0)).length;
    const critical = acts.filter(a => a.isCritical && a.status !== 'Concluído').length;

    // Tempo médio de atraso (só nas vencidas)
    const overdueActs = acts.filter(a => a.status !== 'Concluído' && diffDays(a.dueDate) < 0);
    const avgDelay = overdueActs.length > 0
      ? Math.round(overdueActs.reduce((s, a) => s + Math.abs(diffDays(a.dueDate)), 0) / overdueActs.length)
      : 0;

    const pctOnTime = total > 0 ? Math.round(done / total * 100) : 0;
    const pctOverdue = total > 0 ? Math.round(overdue / total * 100) : 0;

    return { team, total, done, overdue, critical, avgDelay, pctOnTime, pctOverdue };
  });
}

window.calcTeamMetrics = calcTeamMetrics;

/* ── SUGESTÕES INTELIGENTES ──────────────────────────────── */
function generateSuggestions() {
  const suggestions = [];
  const today = todayISO();

  state.activities.forEach(a => {
    if (a.status === 'Concluído') return;
    const diff = diffDays(a.dueDate);

    // Deveria ter iniciado
    if (a.startDate && a.startDate < today && a.status === 'Pendente' && !isBlocked(a)) {
      suggestions.push({
        type: 'warning',
        icon: '⏰',
        task: a.description,
        msg: `"${a.description}" deveria ter iniciado em ${formatDate(a.startDate)} — ${Math.abs(diffDays(a.startDate))} dia(s) sem ação.`,
        action: 'Reprogramar',
        taskId: a.id,
      });
    }

    // Atrasada sem reprogramação
    if (diff < -3 && a.status === 'Vencido' && a.isCritical) {
      suggestions.push({
        type: 'critical',
        icon: '🔥',
        task: a.description,
        msg: `"${a.description}" está ${Math.abs(diff)} dias atrasada no caminho crítico — reprogramar urgente.`,
        action: 'Reprogramar',
        taskId: a.id,
      });
    }
  });

  // Equipes sobrecarregadas
  const teamMetrics = calcTeamMetrics();
  teamMetrics.forEach(t => {
    if (t.pctOverdue > 50) {
      suggestions.push({
        type: 'critical',
        icon: '👥',
        task: t.team,
        msg: `${t.team} tem ${t.pctOverdue}% das tarefas vencidas (${t.overdue} de ${t.total}). Redistribuir carga.`,
        action: 'Ver equipe',
        teamName: t.team,
      });
    } else if (t.critical > 2) {
      suggestions.push({
        type: 'warning',
        icon: '⚡',
        task: t.team,
        msg: `${t.team} acumula ${t.critical} tarefas críticas abertas — atenção redobrada necessária.`,
        action: 'Ver tarefas',
        teamName: t.team,
      });
    }
  });

  // Tarefas bloqueadas por dependência atrasada
  state.activities.forEach(a => {
    if (a.status !== 'Concluído' && isBlocked(a)) {
      const pred = state.activities.find(x => x.id === a.predecessorId);
      if (pred && pred.status === 'Vencido') {
        suggestions.push({
          type: 'warning',
          icon: '🔗',
          task: a.description,
          msg: `"${a.description}" está bloqueada porque "${pred.description}" está vencida.`,
          action: 'Ver bloqueio',
          taskId: a.id,
        });
      }
    }
  });

  // Retorna no máx. 8 sugestões, priorizando critical
  suggestions.sort((a, b) => (a.type === 'critical' ? -1 : 1));
  return suggestions.slice(0, 8);
}

window.generateSuggestions = generateSuggestions;

/* ── FILTRO E ORDENAÇÃO ──────────────────────────────────── */
function getFilteredActivities() {
  const f = state.filters;
  let acts = [...state.activities];

  if (f.project)  acts = acts.filter(a => a.project  === f.project);
  if (f.team)     acts = acts.filter(a => a.team     === f.team);
  if (f.status)   acts = acts.filter(a => a.status   === f.status);
  if (f.dateFrom) acts = acts.filter(a => a.dueDate  >= f.dateFrom);
  if (f.dateTo)   acts = acts.filter(a => a.dueDate  <= f.dateTo);
  if (f.critOnly) acts = acts.filter(a => a.isCritical);
  if (f.search)   acts = acts.filter(a =>
    a.description.toLowerCase().includes(f.search.toLowerCase()) ||
    (a.responsible||'').toLowerCase().includes(f.search.toLowerCase())
  );

  // Ordenação
  const { field, dir } = state.sort;
  acts.sort((a, b) => {
    let va = a[field] || '', vb = b[field] || '';
    if (field === 'priority') { va = calcPriorityScore(a); vb = calcPriorityScore(b); }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  return acts;
}

window.getFilteredActivities = getFilteredActivities;

/* ── SEED DATA ───────────────────────────────────────────── */
function loadSeedData() {
  if (!window.SEED_DATA) return;
  state.activities    = SEED_DATA.activities.map(a => ({ ...a, createdAt: Date.now() }));
  state.projects      = SEED_DATA.projects;
  state.collaborators = SEED_DATA.collaborators;
  // Atualiza status automático
  state.activities.forEach(a => autoStatus(a));
  saveActivities();
  saveProjects();
  saveCollaborators();
  addHistory('SEED', { count: state.activities.length });
  showToast(`✅ ${state.activities.length} atividades carregadas com sucesso!`, 'success');
  renderAll();
}

window.loadSeedData = loadSeedData;
