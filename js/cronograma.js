/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · cronograma.js
   Apoio de Gantt, Portfólio e Recursos (a renderização está em extensoes.js)
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   GANTT
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   PORTFÓLIO
══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   RECURSOS
══════════════════════════════════════════════════ */
let recPeriod = 8;

function setRecPeriod(w) { recPeriod = w; renderRecursos(); }
