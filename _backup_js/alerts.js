/* ============================================================
   TASKFLOW PRO — ALERTS.JS
   Sistema de alertas, toasts e notificações
============================================================ */
'use strict';

/* ── TOAST ──────────────────────────────────────────────────── */
let _toastTimer = null;

function showToast(msg, type = 'info', duration = 4000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = `toast toast-${type} show`;
  el.innerHTML = msg;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

window.showToast = showToast;

/* ── VERIFICAÇÃO DE ALERTAS (chamada periódica) ─────────────── */
let _alertCheckTimer = null;

function startAlertLoop() {
  checkAlerts();
  clearInterval(_alertCheckTimer);
  _alertCheckTimer = setInterval(checkAlerts, 60 * 1000); // a cada minuto
}

function checkAlerts() {
  if (!state.activities) return;
  const today = todayISO();
  const alerts = [];

  state.activities.forEach(a => {
    if (a.status === 'Concluído') return;
    const diff = diffDays(a.dueDate);
    const key  = `${a.id}-${a.dueDate}`;

    if (state.dismissedAlerts && state.dismissedAlerts.includes(key)) return;

    if (diff < 0) {
      alerts.push({ key, level: 'critical', icon: '🔴', msg: `<strong>${escHtml(a.description)}</strong> está ${Math.abs(diff)} dia(s) atrasada`, taskId: a.id });
    } else if (diff === 0) {
      alerts.push({ key, level: 'high', icon: '🟠', msg: `<strong>${escHtml(a.description)}</strong> vence <strong>hoje</strong>`, taskId: a.id });
    } else if (diff === 1) {
      alerts.push({ key, level: 'medium', icon: '🟡', msg: `<strong>${escHtml(a.description)}</strong> vence <strong>amanhã</strong>`, taskId: a.id });
    }
  });

  // Atualiza badge do sino
  const dot = document.getElementById('notif-dot');
  if (dot) {
    if (alerts.length > 0) dot.classList.remove('hidden');
    else dot.classList.add('hidden');
  }

  // Persiste alertas na UI
  renderAlertPanel(alerts);

  // Notificação do browser (se permitida)
  if (Notification.permission === 'granted' && alerts.filter(a => a.level === 'critical').length > 0) {
    const critCount = alerts.filter(a => a.level === 'critical').length;
    new Notification('TaskFlow PRO', {
      body: `⚠ ${critCount} tarefa(s) crítica(s) aguardam sua ação`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="%23ef4444"/><text x="50%" y="55%" font-size="18" text-anchor="middle" dominant-baseline="middle" fill="white">!</text></svg>'
    });
  }

  return alerts;
}

function renderAlertPanel(alerts) {
  const body = document.getElementById('notif-panel-body');
  if (!body) return;

  if (!alerts || alerts.length === 0) {
    body.innerHTML = `<div style="padding:12px 0;text-align:center;color:var(--text-muted);font-size:.82rem">✅ Nenhum alerta pendente</div>`;
    return;
  }

  body.innerHTML = alerts.map(al => `
    <div class="alert-item alert-item-${al.level}" data-key="${escAttr(al.key)}">
      <span class="alert-icon">${al.icon}</span>
      <span class="alert-msg">${al.msg}</span>
      <div class="alert-actions">
        <button onclick="dismissAlert('${escAttr(al.key)}')" title="Dispensar">✕</button>
      </div>
    </div>
  `).join('');
}

function dismissAlert(key) {
  if (!state.dismissedAlerts) state.dismissedAlerts = [];
  if (!state.dismissedAlerts.includes(key)) state.dismissedAlerts.push(key);
  // Salva dismissed
  try { localStorage.setItem(CONFIG.DISMISSED_KEY, JSON.stringify(state.dismissedAlerts)); } catch(e) {}
  checkAlerts();
}

function loadDismissed() {
  try {
    const raw = localStorage.getItem(CONFIG.DISMISSED_KEY);
    state.dismissedAlerts = raw ? JSON.parse(raw) : [];
  } catch(e) { state.dismissedAlerts = []; }
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) checkAlerts();
}

async function requestNotifPermission() {
  if (!('Notification' in window)) {
    showToast('Seu navegador não suporta notificações', 'warning');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('✅ Notificações ativadas!', 'success');
    document.getElementById('notif-enable-btn') && (document.getElementById('notif-enable-btn').textContent = '✅ Ativo');
  } else {
    showToast('Notificações bloqueadas pelo navegador', 'warning');
  }
}

window.checkAlerts           = checkAlerts;
window.startAlertLoop        = startAlertLoop;
window.dismissAlert          = dismissAlert;
window.loadDismissed         = loadDismissed;
window.toggleNotifPanel      = toggleNotifPanel;
window.requestNotifPermission = requestNotifPermission;
