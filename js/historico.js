/* ═══════════════════════════════════════════════════════════════
   Mercronos · historico.js
   Histórico de alterações
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   HISTÓRICO
══════════════════════════════════════════════════ */
const HIST_KEY = 'tf_history';
let history = [];

function loadHistory() { try { history = JSON.parse(localStorage.getItem(HIST_KEY)||'[]'); } catch(_) { history=[]; } }
function saveHistory() { try { localStorage.setItem(HIST_KEY, JSON.stringify(history.slice(0,200))); } catch(_){} }

function addHistory(action, detail) {
  loadHistory();
  const icons = { create:'fa-plus', update:'fa-pen', delete:'fa-trash', complete:'fa-check', import:'fa-file-import' };
  const colors= { create:'var(--blue)', update:'var(--amber)', delete:'var(--red)', complete:'var(--green)', import:'var(--purple)' };
  history.unshift({ id:uid(), action, detail, ts:Date.now(), icon:icons[action]||'fa-circle', color:colors[action]||'var(--text-3)' });
  saveHistory();
}

function renderHistorico() {
  loadHistory();
  const el = document.getElementById('hist-list');
  if (!el) return;
  if (!history.length) {
    el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i><p>Nenhuma alteração registrada</p></div>';
    return;
  }
  el.innerHTML = history.slice(0,50).map(h => {
    const d = new Date(h.ts);
    const time = d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
    return `<div class="hist-item">
      <div class="hist-icon" style="background:${h.color}22;color:${h.color}"><i class="fa-solid ${h.icon}"></i></div>
      <div class="hist-body">
        <div class="hist-text">${esc(h.detail)}</div>
        <div class="hist-time">${time}</div>
      </div>
    </div>`;
  }).join('');
}

function clearHistory() {
  if (!confirm('Limpar todo o histórico?')) return;
  history = [];
  saveHistory();
  renderHistorico();
  toast('Histórico limpo', 'info');
}

// renderCalAtiv e renderCalEquipe são exportadas em extensoes.js
window.calNav           = calNav;
window.calToday         = calToday;
window.setRecPeriod     = setRecPeriod;
window.handleImportDrop = handleImportDrop;
window.handleImportFile = handleImportFile;
window.confirmImport    = confirmImport;
window.cancelImport     = cancelImport;
window.exportJSON       = exportJSON;
window.exportCSV        = exportCSV;
window.clearHistory     = clearHistory;
