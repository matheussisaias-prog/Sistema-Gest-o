/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · utilitarios.js
   Funções de apoio: datas, escape de HTML, ids, cores, status automático
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════ */
function todayISO() { return new Date().toISOString().slice(0,10); }

function diffDays(iso) {
  if (!iso) return 999;
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(iso + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function uid() { return '_' + Math.random().toString(36).slice(2,9); }

function projColor(name) { return PROJECT_COLORS_MAP[name] || '#64748b'; }

function autoUpdateStatus() {
  activities.forEach(a => {
    if (a.status === 'Concluído' || a.status === 'Reprogramado') return;
    if (a.dueDate && diffDays(a.dueDate) < 0) a.status = 'Vencido';
  });
}
