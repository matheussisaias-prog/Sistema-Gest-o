/* ============================================================
   TASKFLOW PRO — DASHBOARD.JS
   Dashboard executivo, Painel de Crise (Modo Guerra), Sugestões
============================================================ */
'use strict';

/* ── DASHBOARD PRINCIPAL ─────────────────────────────────── */
function renderDashboard() {
  const acts = state.activities;
  const m    = calcMetrics(acts);

  // ── KPIs principais
  setEl('kpi-overdue',   m.overdue);
  setEl('kpi-today',     m.today);
  setEl('kpi-ok',        acts.filter(a => a.status !== 'Concluído' && diffDays(a.dueDate) > 0).length);
  setEl('kpi-done',      m.done);
  setEl('kpi-critical',  m.critical);
  setEl('kpi-blocked',   m.blocked);

  // ── Indicadores percentuais
  setEl('kpi-pct-overdue',  m.pctOverdue + '%');
  setEl('kpi-pct-done',     m.pctDone    + '%');
  setEl('kpi-spi',          m.spi);
  setEl('kpi-total',        m.total);

  // Barra de progresso
  const bar = document.getElementById('kpi-progress-bar');
  if (bar) bar.style.width = m.pctDone + '%';
  setEl('kpi-progress-label', m.pctDone + '%');

  // ── Indicador de saúde do projeto
  renderHealthIndicator(m);

  // ── Tarefas críticas na tabela do dashboard
  renderCriticalTable();

  // ── Sugestões inteligentes
  renderSuggestions();

  // ── Mini gráficos
  renderDashboardCharts(m, acts);

  // ── Próximas a Vencer
  renderUpcoming();
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function renderHealthIndicator(m) {
  const el = document.getElementById('health-indicator');
  if (!el) return;

  const icons = { ok: '✅', risk: '⚠', late: '🚨' };
  const colors = { ok: '#10b981', risk: '#f59e0b', late: '#ef4444' };

  el.className = `health-indicator health-${m.healthLevel}`;
  el.style.setProperty('--health-color', colors[m.healthLevel]);
  el.innerHTML = `
    <div class="health-icon">${icons[m.healthLevel]}</div>
    <div class="health-body">
      <div class="health-label">${m.healthLabel}</div>
      <div class="health-sub">
        ${m.pctOverdue}% atrasadas · ${m.critical} críticas abertas · SPI ${m.spi}
      </div>
    </div>
    <div class="health-pct" style="color:${colors[m.healthLevel]}">${m.pctDone}%<span>concluído</span></div>
  `;
}

function renderCriticalTable() {
  const tbody = document.getElementById('critical-tbody');
  const empty = document.getElementById('critical-empty');
  if (!tbody) return;

  const acts = state.activities
    .filter(a => a.status !== 'Concluído' && (a.isCritical || diffDays(a.dueDate) <= 2))
    .sort((a, b) => calcPriorityScore(b) - calcPriorityScore(a))
    .slice(0, 12);

  if (!acts.length) {
    tbody.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    return;
  }
  if (empty) empty.classList.add('hidden');

  tbody.innerHTML = acts.map(a => buildTaskRow(a)).join('');
}

/* ── PAINEL DE CRISE (MODO GUERRA) ─────────────────────────── */
function renderCrisisPanel() {
  const overdue  = state.activities.filter(a => a.status === 'Vencido' || (a.status !== 'Concluído' && diffDays(a.dueDate) < 0));
  const dueToday = state.activities.filter(a => a.status !== 'Concluído' && diffDays(a.dueDate) === 0);
  const critical = state.activities.filter(a => a.isCritical && a.status !== 'Concluído');

  // Atualiza contadores
  setEl('war-count-overdue',  overdue.length);
  setEl('war-count-today',    dueToday.length);
  setEl('war-count-critical', critical.length);

  // Listas
  renderWarList('war-list-overdue',  overdue.sort((a,b) => diffDays(a.dueDate) - diffDays(b.dueDate)));
  renderWarList('war-list-today',    dueToday);
  renderWarList('war-list-critical', critical.sort((a,b) => calcPriorityScore(b) - calcPriorityScore(a)));

  // Cronômetro de alerta
  const total = overdue.length + dueToday.length;
  const warHead = document.getElementById('war-alert-bar');
  if (warHead) {
    if (total === 0) {
      warHead.className = 'war-alert-bar war-alert-ok';
      warHead.innerHTML = '✅ Nenhuma tarefa crítica pendente — situação sob controle';
    } else {
      warHead.className = 'war-alert-bar war-alert-fire';
      warHead.innerHTML = `🚨 MODO GUERRA ATIVO — ${total} tarefa(s) exigem ação imediata`;
    }
  }
}

function renderWarList(containerId, acts) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!acts.length) {
    el.innerHTML = `<div class="war-empty">✓ Nenhuma tarefa aqui</div>`;
    return;
  }

  el.innerHTML = acts.map(a => {
    const diff    = diffDays(a.dueDate);
    const blocked = isBlocked(a);
    const delayTxt = diff < 0 ? `<span class="war-delay">${Math.abs(diff)}d atraso</span>` :
                     diff === 0 ? `<span class="war-today">HOJE</span>` : '';
    return `
      <div class="war-task-card ${a.isCritical ? 'war-task-critical' : ''}">
        <div class="war-task-top">
          <span class="war-task-name">${escHtml(a.description)}</span>
          ${delayTxt}
          ${blocked ? '<span class="war-blocked-badge">🔗 BLOQUEADA</span>' : ''}
        </div>
        <div class="war-task-meta">
          <span>📁 ${escHtml(a.project)}</span>
          <span>👤 ${escHtml(a.responsible)}</span>
          <span>📅 ${formatDate(a.dueDate)}</span>
          <span>🏷 ${escHtml(a.team)}</span>
        </div>
        <div class="war-task-actions">
          <button class="war-btn war-btn-complete" onclick="quickComplete('${a.id}')">✓ Concluir</button>
          <button class="war-btn war-btn-reschedule" onclick="openReschedule('${a.id}')">📅 Reprogramar</button>
          <button class="war-btn war-btn-edit" onclick="openModal('${a.id}')">✎ Editar</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ── SUGESTÕES INTELIGENTES ─────────────────────────────── */
function renderSuggestions() {
  const el = document.getElementById('suggestions-container');
  if (!el) return;

  const suggestions = generateSuggestions();

  if (!suggestions.length) {
    el.innerHTML = `<div class="suggestion-empty">✅ Sistema sem alertas no momento — projeto sob controle.</div>`;
    return;
  }

  el.innerHTML = suggestions.map(s => `
    <div class="suggestion-card suggestion-${s.type}">
      <div class="suggestion-icon">${s.icon}</div>
      <div class="suggestion-body">
        <div class="suggestion-msg">${escHtml(s.msg)}</div>
      </div>
      <button class="suggestion-action" onclick="${s.taskId ? `openModal('${s.taskId}')` : s.teamName ? `filterByTeam('${escAttr(s.teamName)}')` : 'void(0)'}">${escHtml(s.action)}</button>
    </div>
  `).join('');
}

/* ── MINI GRÁFICOS DO DASHBOARD ─────────────────────────── */
let _dashCharts = {};

function renderDashboardCharts(m, acts) {
  renderMiniDonut(m, acts);
  renderMiniTeamBar();
}

function renderMiniDonut(m, acts) {
  const ctx = document.getElementById('chart-dash-donut');
  if (!ctx) return;
  if (_dashCharts.donut) { _dashCharts.donut.destroy(); }
  const done    = m.done;
  const overdue = m.overdue;
  const today   = m.today;
  const ok      = Math.max(0, m.total - done - overdue - today);

  _dashCharts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Concluídas', 'Atrasadas', 'Hoje', 'Em dia'],
      datasets: [{ data: [done, overdue, today, ok],
        backgroundColor: ['#10b981','#ef4444','#f59e0b','#3b82f6'],
        borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      cutout: '72%', plugins: { legend: { display: false } },
      animation: { duration: 500 }
    }
  });
}

function renderMiniTeamBar() {
  const ctx = document.getElementById('chart-dash-team');
  if (!ctx) return;
  if (_dashCharts.team) { _dashCharts.team.destroy(); }
  const tm = calcTeamMetrics();
  _dashCharts.team = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: tm.map(t => t.team),
      datasets: [
        { label: 'Concluídas', data: tm.map(t => t.done),    backgroundColor: '#10b981' },
        { label: 'Atrasadas',  data: tm.map(t => t.overdue), backgroundColor: '#ef4444' },
        { label: 'Pendentes',  data: tm.map(t => t.total - t.done - t.overdue), backgroundColor: '#3b82f6' },
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } },
      scales: {
        x: { stacked: true, ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { stacked: true, ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
      },
      animation: { duration: 500 }
    }
  });
}

/* ── ANALYTICS — DESEMPENHO POR EQUIPE ─────────────────── */
function renderAnalytics() {
  renderTeamPerformanceTable();
  renderAnalyticsCharts();
}

function renderTeamPerformanceTable() {
  const tbody = document.getElementById('analytics-tbody');
  if (!tbody) return;
  const tm = calcTeamMetrics();

  if (!tm.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">Sem dados</td></tr>';
    return;
  }

  tbody.innerHTML = tm.map(t => {
    const healthColor = t.pctOverdue > 30 ? '#ef4444' : t.pctOverdue > 10 ? '#f59e0b' : '#10b981';
    return `
      <tr>
        <td><span class="team-badge">${escHtml(t.team)}</span></td>
        <td style="font-weight:700;font-variant-numeric:tabular-nums">${t.total}</td>
        <td style="color:#10b981;font-weight:600">${t.done}</td>
        <td style="color:${t.overdue > 0 ? '#ef4444' : 'var(--text-muted)';}">${t.overdue}</td>
        <td style="color:#f59e0b">${t.critical}</td>
        <td style="color:${t.avgDelay > 0 ? '#ef4444' : '#10b981'}">${t.avgDelay > 0 ? t.avgDelay + 'd' : '—'}</td>
        <td>
          <div class="perf-bar-wrap">
            <div class="perf-bar" style="width:${t.pctOnTime}%;background:${healthColor}"></div>
          </div>
          <span style="font-size:.72rem;color:${healthColor};font-weight:700">${t.pctOnTime}%</span>
        </td>
      </tr>`;
  }).join('');
}

let _analyticsCharts = {};

function renderAnalyticsCharts() {
  renderTeamRadar();
  renderTimelineChart();
}

function renderTeamRadar() {
  const ctx = document.getElementById('chart-team-radar');
  if (!ctx) return;
  if (_analyticsCharts.radar) { _analyticsCharts.radar.destroy(); }
  const tm = calcTeamMetrics();

  _analyticsCharts.radar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Conclusão %', 'Sem Atraso', 'Volume', 'Críticas Resolvidas', 'Eficiência'],
      datasets: tm.map((t, i) => ({
        label: t.team,
        data: [
          t.pctOnTime,
          100 - t.pctOverdue,
          Math.min(100, t.total * 5),
          t.critical === 0 ? 100 : Math.max(0, 100 - t.critical * 15),
          t.avgDelay === 0 ? 100 : Math.max(0, 100 - t.avgDelay * 8),
        ],
        borderColor: ['#3b82f6','#f59e0b','#10b981','#8b5cf6','#ef4444'][i % 5],
        backgroundColor: ['rgba(59,130,246,.12)','rgba(245,158,11,.12)','rgba(16,185,129,.12)','rgba(139,92,246,.12)','rgba(239,68,68,.12)'][i % 5],
        borderWidth: 2, pointRadius: 3,
      }))
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        r: {
          ticks: { color: '#475569', backdropColor: 'transparent', font: { size: 9 } },
          grid:  { color: 'rgba(255,255,255,0.06)' },
          pointLabels: { color: '#94a3b8', font: { size: 10 } },
          min: 0, max: 100,
        }
      },
      animation: { duration: 600 }
    }
  });
}

function renderTimelineChart() {
  const ctx = document.getElementById('chart-timeline-analytics');
  if (!ctx) return;
  if (_analyticsCharts.timeline) { _analyticsCharts.timeline.destroy(); }

  // Agrupa por mês
  const monthData = {};
  state.activities.forEach(a => {
    const ym = a.dueDate ? a.dueDate.slice(0, 7) : null;
    if (!ym) return;
    if (!monthData[ym]) monthData[ym] = { done: 0, overdue: 0, pending: 0 };
    if (a.status === 'Concluído') monthData[ym].done++;
    else if (a.status === 'Vencido' || diffDays(a.dueDate) < 0) monthData[ym].overdue++;
    else monthData[ym].pending++;
  });

  const labels = Object.keys(monthData).sort();
  _analyticsCharts.timeline = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => {
        const [y, m] = l.split('-');
        return new Date(+y, +m-1).toLocaleString('pt-BR', { month: 'short', year: '2-digit' });
      }),
      datasets: [
        { label: 'Concluídas', data: labels.map(l => monthData[l].done),    backgroundColor: '#10b981' },
        { label: 'Atrasadas',  data: labels.map(l => monthData[l].overdue), backgroundColor: '#ef4444' },
        { label: 'Pendentes',  data: labels.map(l => monthData[l].pending), backgroundColor: '#3b82f6' },
      ]
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { stacked: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.04)' } }
      },
      animation: { duration: 600 }
    }
  });
}


/* ── PRÓXIMAS A VENCER ───────────────────────────────────── */
function renderUpcoming() {
  const wrap  = document.getElementById('upcoming-cards');
  const empty = document.getElementById('upcoming-empty');
  if (!wrap) return;

  // Suporta tanto state.activities (script.js) quanto outros nomes
  // Tenta várias fontes possíveis para as atividades
  let allActs = [];
  if (typeof state !== 'undefined' && Array.isArray(state.activities) && state.activities.length > 0) {
    allActs = state.activities;
  } else if (typeof window.state !== 'undefined' && Array.isArray(window.state.activities)) {
    allActs = window.state.activities;
  } else {
    // Fallback: lê direto do localStorage
    try {
      const raw = localStorage.getItem('taskflow_activities');
      if (raw) allActs = JSON.parse(raw);
    } catch(_) {}
  }

  // Pega TODAS as atividades não concluídas, com ou sem data
  // Ordena: com data primeiro (pela mais próxima), sem data no final
  const upcoming = allActs
    .filter(a => a.status !== 'Concluído' && a.status !== 'concluido')
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    })
    .slice(0, 5);

  if (!upcoming.length) {
    wrap.innerHTML = '<div style="color:var(--text-muted);font-size:.82rem;padding:16px 0">Nenhuma atividade cadastrada.</div>';
    return;
  }

  // Busca cor do projeto — suporta tanto state.projects quanto projectState.projects
  function projColor(projName) {
    const pool = (typeof projectState !== 'undefined' && projectState.projects)
      ? projectState.projects
      : (state.projects || []);
    const p = pool.find(x => x.name === projName);
    if (p && p.color) return p.color;
    // Fallback: gera cor determinística pelo nome
    const palette = ['#3b82f6','#f59e0b','#10b981','#8b5cf6','#ef4444','#ec4899','#0ea5e9','#f97316'];
    let h = 0;
    for (let i = 0; i < (projName || '').length; i++) h = (h * 31 + projName.charCodeAt(i)) % palette.length;
    return palette[Math.abs(h)];
  }

  wrap.innerHTML = upcoming.map(a => {
    const diff  = diffDays(a.dueDate);
    let cardCls, dueCls, dueLabel, badgeBg, badgeColor;

    if (!a.dueDate) {
      cardCls = 'uc-normal'; dueCls = 'due-normal';
      dueLabel = 'Sem prazo definido';
      badgeBg = 'rgba(148,163,184,.12)'; badgeColor = 'var(--text-muted)';
    } else if (diff < 0) {
      cardCls = 'uc-today'; dueCls = 'due-today';
      dueLabel = `Venceu há ${Math.abs(diff)} dia(s)`;
      badgeBg = 'rgba(239,68,68,.12)'; badgeColor = '#dc2626';
    } else if (diff === 0) {
      cardCls = 'uc-today'; dueCls = 'due-today';
      dueLabel = 'Vence hoje!';
      badgeBg = 'rgba(239,68,68,.12)'; badgeColor = '#dc2626';
    } else if (diff <= 3) {
      cardCls = 'uc-soon'; dueCls = 'due-soon';
      dueLabel = `Em ${diff} dia(s)`;
      badgeBg = 'rgba(245,158,11,.12)'; badgeColor = '#d97706';
    } else {
      cardCls = 'uc-normal'; dueCls = 'due-normal';
      dueLabel = `Em ${diff} dia(s)`;
      badgeBg = 'rgba(59,130,246,.10)'; badgeColor = '#2563eb';
    }

    const color = projColor(a.project);
    const projName = a.project || '—';
    const statusBadge = a.status || 'Pendente';
    const safeId = (a.id || '').replace(/'/g, "\'");

    return `
      <div class="upcoming-card ${cardCls}" title="Clique para editar" style="cursor:pointer;border-top:3px solid ${color}" onclick="openModal('${safeId}')">
        <div class="upcoming-card-proj">
          <div class="upcoming-card-proj-dot" style="background:${color}"></div>
          ${escHtml(projName)}
        </div>
        <div class="upcoming-card-title">${escHtml(a.description || a.title || '—')}</div>
        <div class="upcoming-card-meta">
          <span class="upcoming-card-resp">👤 ${escHtml(a.responsible || '—')}</span>
          <span class="upcoming-card-badge" style="background:${badgeBg};color:${badgeColor}">${escHtml(statusBadge)}</span>
        </div>
        <div class="upcoming-card-due ${dueCls}">📅 ${a.dueDate ? formatDate(a.dueDate) + " · " : ""}${dueLabel}</div>
      </div>`;
  }).join('');
}

window.renderDashboard   = renderDashboard;
window.renderCrisisPanel = renderCrisisPanel;
window.renderAnalytics   = renderAnalytics;
window.renderSuggestions = renderSuggestions;

/* ── HELPER: LINHA DE TAREFA ────────────────────────────── */
function buildTaskRow(a) {
  const diff    = diffDays(a.dueDate);
  const prio    = getPriority(a);
  const blocked = isBlocked(a);
  const durDays = calcDuration(a.startDate, a.dueDate);

  let statusCss = '';
  if (a.status === 'Vencido')    statusCss = 'status-overdue';
  if (a.status === 'Concluído')  statusCss = 'status-done';
  if (a.status === 'Reprogramado') statusCss = 'status-rescheduled';
  if (diff === 0 && a.status !== 'Concluído') statusCss = 'status-today';

  const delayBadge = diff < 0 && a.status !== 'Concluído'
    ? `<span class="delay-badge">${Math.abs(diff)}d</span>` : '';

  // Ordem: WBS | Projeto | Título | Início | Término | Responsável | Duração | % | Status | Ações
  const durDisplay = a.duration ? `${a.duration}h` : (durDays ? `${durDays}d` : '—');

  return `
    <tr class="${a.isCritical ? 'row-critical' : ''} ${a.status === 'Concluído' ? 'row-done' : ''}">
      <td class="wbs-cell"><span style="color:var(--text-muted);font-size:.75rem">${escHtml(a._wbs || '—')}</span></td>
      <td><span class="project-tag">${escHtml(a.project)}</span></td>
      <td>
        <div class="cell-desc">
          ${a.isCritical ? '<span class="crit-dot" title="Caminho crítico">●</span>' : ''}
          ${blocked ? '<span class="blocked-dot" title="Bloqueada">🔗</span>' : ''}
          <span>${escHtml(a.description)}</span>
        </div>
      </td>
      <td style="white-space:nowrap">${formatDate(a.startDate)}</td>
      <td class="${diff < 0 && a.status !== 'Concluído' ? 'date-overdue' : ''}" style="white-space:nowrap">${formatDate(a.dueDate)} ${delayBadge}</td>
      <td>${escHtml(a.responsible)}</td>
      <td class="dur-auto">${durDisplay}</td>
      <td>
        <div class="progress-cell" style="min-width:70px">
          <div class="progress-mini-bar"><div class="progress-mini-fill" style="width:${a.progress||0}%"></div></div>
          <span style="font-size:.68rem;font-weight:700;color:var(--text-muted)">${a.progress||0}%</span>
        </div>
      </td>
      <td><span class="status-badge ${statusCss}">${escHtml(a.status)}</span></td>
      <td>
        <div class="action-btns">
          ${a.status !== 'Concluído' ? `<button class="btn-action btn-complete" onclick="quickComplete('${a.id}')" title="Concluir">✓</button>` : ''}
          <button class="btn-action btn-edit"       onclick="openModal('${a.id}')"        title="Editar">✎</button>
          <button class="btn-action btn-reschedule" onclick="openReschedule('${a.id}')"   title="Reprogramar">⟳</button>
          <button class="btn-action btn-delete"     onclick="deleteTask('${a.id}')"       title="Excluir">✕</button>
        </div>
      </td>
    </tr>`;
}

window.buildTaskRow = buildTaskRow;

window.renderUpcoming = renderUpcoming;
