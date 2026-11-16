/* ═══════════════════════════════════════════════════════════════
   Mercronos · calendarios.js
   Navegação dos calendários de atividades e de equipe
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   CALENDÁRIOS
══════════════════════════════════════════════════ */
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function calNav(dir, containerId) {
  calMonth += dir;
  if (calMonth > 11) { calMonth=0; calYear++; }
  if (calMonth < 0)  { calMonth=11; calYear--; }
  if (containerId === 'cal-ativ-wrap')   renderCalAtiv();
  else                                    renderCalEquipe();
}

function calToday(containerId) {
  calYear  = new Date().getFullYear();
  calMonth = new Date().getMonth();
  if (containerId === 'cal-ativ-wrap') renderCalAtiv();
  else                                  renderCalEquipe();
}
