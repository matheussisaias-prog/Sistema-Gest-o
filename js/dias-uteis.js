/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · dias-uteis.js
   Configuração de jornada, feriados e cálculo de dias e horas úteis
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   CONFIGURAÇÃO DE CALENDÁRIO
══════════════════════════════════════════════════ */
const CAL_CFG_KEY = 'tf_cal_config';

const FERIADOS_BR = [
  // 2025
  { date:'2025-01-01', nome:'Confraternização Universal' },
  { date:'2025-03-03', nome:'Carnaval' },
  { date:'2025-03-04', nome:'Carnaval' },
  { date:'2025-04-18', nome:'Sexta-feira Santa' },
  { date:'2025-04-21', nome:'Tiradentes' },
  { date:'2025-05-01', nome:'Dia do Trabalho' },
  { date:'2025-06-19', nome:'Corpus Christi' },
  { date:'2025-09-07', nome:'Independência do Brasil' },
  { date:'2025-10-12', nome:'Nossa Senhora Aparecida' },
  { date:'2025-11-02', nome:'Finados' },
  { date:'2025-11-15', nome:'Proclamação da República' },
  { date:'2025-11-20', nome:'Consciência Negra' },
  { date:'2025-12-25', nome:'Natal' },
  // 2026
  { date:'2026-01-01', nome:'Confraternização Universal' },
  { date:'2026-02-16', nome:'Carnaval' },
  { date:'2026-02-17', nome:'Carnaval' },
  { date:'2026-04-03', nome:'Sexta-feira Santa' },
  { date:'2026-04-21', nome:'Tiradentes' },
  { date:'2026-05-01', nome:'Dia do Trabalho' },
  { date:'2026-06-04', nome:'Corpus Christi' },
  { date:'2026-09-07', nome:'Independência do Brasil' },
  { date:'2026-10-12', nome:'Nossa Senhora Aparecida' },
  { date:'2026-11-02', nome:'Finados' },
  { date:'2026-11-15', nome:'Proclamação da República' },
  { date:'2026-11-20', nome:'Consciência Negra' },
  { date:'2026-12-25', nome:'Natal' },
];

function loadCalCfg() {
  try {
    const raw = localStorage.getItem(CAL_CFG_KEY);
    if (raw) return JSON.parse(raw);
  } catch(_) {}
  return {
    horasDia: 9,
    diasUteis: [1,2,3,4,5], // seg-sex
    feriados: FERIADOS_BR.slice()
  };
}

function saveCalConfig() {
  const horasDia = parseInt(document.getElementById('cfg-horas-dia').value) || 9;
  const diasUteis = [0,1,2,3,4,5,6].filter(d => document.getElementById('d'+d)?.checked);
  const cfg = loadCalCfg();
  cfg.horasDia  = horasDia;
  cfg.diasUteis = diasUteis;
  localStorage.setItem(CAL_CFG_KEY, JSON.stringify(cfg));
  closeModal('modal-config-cal');
  toast('✓ Configurações salvas!', 'success');
}

function openModal(id) {
  if (id === 'modal-config-cal') {
    const cfg = loadCalCfg();
    document.getElementById('cfg-horas-dia').value = cfg.horasDia || 9;
    // Dias da semana
    [0,1,2,3,4,5,6].forEach(d => {
      const el = document.getElementById('d'+d);
      if (el) el.checked = cfg.diasUteis.includes(d);
      updateDayLabel(d);
    });
    renderFeriadosList();
    document.getElementById('modal-config-cal').classList.add('open');
  } else if (id === 'activity') {
    window._openModalActivity();
  } else if (id === 'project') {
    window._openModalProject();
  }
}

function updateDayLabel(d) {
  const labels = ['lbl-dom','lbl-seg','lbl-ter','lbl-qua','lbl-qui','lbl-sex','lbl-sab'];
  const el = document.getElementById(labels[d]);
  if (!el) return;
  const checked = document.getElementById('d'+d)?.checked;
  el.style.background    = checked ? 'var(--blue-dim)' : 'var(--surface2)';
  el.style.borderColor   = checked ? 'var(--blue)'     : 'var(--border)';
  el.style.color         = checked ? 'var(--blue)'     : 'var(--text-3)';
}

function renderFeriadosList() {
  const cfg  = loadCalCfg();
  const list = document.getElementById('feriados-list');
  if (!list) return;
  if (!cfg.feriados.length) {
    list.innerHTML = '<div style="font-size:.72rem;color:var(--text-4);padding:6px 0">Nenhum feriado cadastrado</div>';
    return;
  }
  const sorted = [...cfg.feriados].sort((a,b)=>a.date.localeCompare(b.date));
  list.innerHTML = sorted.map((f,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px">
      <span style="font-family:var(--font-mono);font-size:.7rem;color:var(--text-3)">${fmtDate(f.date)}</span>
      <span style="font-size:.75rem;color:var(--text-2);flex:1">${esc(f.nome)}</span>
      <button style="background:none;border:none;cursor:pointer;color:var(--text-4);font-size:.72rem;padding:2px 5px;border-radius:4px" onclick="removeFeriado('${f.date}')" title="Remover">✕</button>
    </div>`).join('');
}

function addFeriado() {
  const date = document.getElementById('novo-feriado').value;
  const nome = document.getElementById('novo-feriado-nome').value.trim();
  if (!date) return toast('Selecione uma data', 'error');
  const cfg = loadCalCfg();
  if (cfg.feriados.find(f=>f.date===date)) return toast('Feriado já cadastrado', 'warning');
  cfg.feriados.push({ date, nome: nome || 'Feriado' });
  localStorage.setItem(CAL_CFG_KEY, JSON.stringify(cfg));
  document.getElementById('novo-feriado').value = '';
  document.getElementById('novo-feriado-nome').value = '';
  renderFeriadosList();
}

function removeFeriado(date) {
  const cfg = loadCalCfg();
  cfg.feriados = cfg.feriados.filter(f=>f.date!==date);
  localStorage.setItem(CAL_CFG_KEY, JSON.stringify(cfg));
  renderFeriadosList();
}

function loadFeriadosBR() {
  const cfg = loadCalCfg();
  let added = 0;
  FERIADOS_BR.forEach(f => {
    if (!cfg.feriados.find(x=>x.date===f.date)) { cfg.feriados.push(f); added++; }
  });
  localStorage.setItem(CAL_CFG_KEY, JSON.stringify(cfg));
  renderFeriadosList();
  toast(`✓ ${added} feriado(s) carregados`, 'success');
}

window.updateDayLabel  = updateDayLabel;
window.addFeriado      = addFeriado;
window.removeFeriado   = removeFeriado;
window.loadFeriadosBR  = loadFeriadosBR;
window.saveCalConfig   = saveCalConfig;

/* ══════════════════════════════════════════════════
   CALCULADORA DE PRAZO
══════════════════════════════════════════════════ */

/** Verifica se uma data ISO é dia útil (não é fim de semana nem feriado) */
function isDiaUtil(dateISO) {
  const cfg  = loadCalCfg();
  const d    = new Date(dateISO + 'T00:00:00');
  const dow  = d.getDay(); // 0=dom...6=sab
  if (!cfg.diasUteis.includes(dow)) return false;
  if (cfg.feriados.find(f=>f.date===dateISO)) return false;
  return true;
}

/** Avança N dias úteis a partir de uma data ISO */
function addDiasUteis(startISO, nDias) {
  const d = new Date(startISO + 'T00:00:00');
  let count = 0;
  while (count < nDias) {
    d.setDate(d.getDate() + 1);
    const iso = dataLocalISO(d);
    if (isDiaUtil(iso)) count++;
  }
  return dataLocalISO(d);
}

/** Conta horas úteis entre duas datas */
function horasUteisEntre(startISO, endISO) {
  const cfg     = loadCalCfg();
  const hpd     = cfg.horasDia || 9;
  let cur       = new Date(startISO + 'T00:00:00');
  const fim     = new Date(endISO   + 'T00:00:00');
  let diasUteis = 0;
  while (cur <= fim) {
    const iso = dataLocalISO(cur);
    if (isDiaUtil(iso)) diasUteis++;
    cur.setDate(cur.getDate() + 1);
  }
  return diasUteis * hpd;
}

/** Calcula término a partir de início + horas */
function calcTermino(startISO, horas) {
  const cfg  = loadCalCfg();
  const hpd  = cfg.horasDia || 9;
  const dias = Math.ceil(horas / hpd);
  return addDiasUteis(startISO, dias - 1); // -1 pq o próprio dia de início conta
}

/** Chamada pelo input: calcula término quando usuário digita horas */
function calcPrazo() {
  const start = document.getElementById('act-start')?.value;
  const horas = parseFloat(document.getElementById('act-duration-h')?.value);
  const resEl = document.getElementById('calc-result');
  if (!resEl) return;

  if (!start) { resEl.style.display='none'; return; }

  if (!horas || horas <= 0) {
    resEl.style.display = 'none';
    return;
  }

  const cfg   = loadCalCfg();
  const hpd   = cfg.horasDia || 9;
  const dias  = Math.ceil(horas / hpd);
  const fim   = calcTermino(start, horas);

  // Preenche campo de término
  const dueEl = document.getElementById('act-due');
  if (dueEl) dueEl.value = fim;

  // Também preenche duração no campo principal da atividade
  const durEl = document.getElementById('act-duration-h');
  
  // Conta feriados no período
  const cfg2 = loadCalCfg();
  let feriadosNoPeriodo = 0;
  let cur = new Date(start + 'T00:00:00');
  const fimD = new Date(fim + 'T00:00:00');
  while (cur <= fimD) {
    const iso = dataLocalISO(cur);
    const dow = cur.getDay();
    if (cfg2.diasUteis.includes(dow) && cfg2.feriados.find(f=>f.date===iso)) feriadosNoPeriodo++;
    cur.setDate(cur.getDate()+1);
  }

  // Dias corridos totais
  const diasCorridos = Math.round((fimD - new Date(start+'T00:00:00'))/86400000) + 1;

  resEl.style.display = 'flex';
  resEl.style.flexWrap = 'wrap';
  resEl.style.gap = '10px';
  resEl.innerHTML = `
    <span style="display:flex;align-items:center;gap:4px">
      <i class="fa-solid fa-calendar-check" style="color:var(--green)"></i>
      <strong style="color:var(--green)">${fmtDate(fim)}</strong>
      <span style="color:var(--text-4)">término calculado</span>
    </span>
    <span class="badge badge-blue">${dias} dia(s) útil(is)</span>
    <span class="badge badge-gray">${diasCorridos} dias corridos</span>
    ${feriadosNoPeriodo > 0 ? `<span class="badge badge-amber"><i class="fa-solid fa-umbrella-beach"></i> ${feriadosNoPeriodo} feriado(s) no período</span>` : ''}
    <span class="badge badge-gray"><i class="fa-solid fa-clock"></i> ${hpd}h/dia</span>`;
}

/** Chamada quando usuário muda o término manualmente — calcula as horas */
function calcDurFromDates() {
  const start = document.getElementById('act-start')?.value;
  const due   = document.getElementById('act-due')?.value;
  const resEl = document.getElementById('calc-result');
  if (!start || !due || due < start) { if(resEl) resEl.style.display='none'; return; }

  const horas = horasUteisEntre(start, due);
  const durEl = document.getElementById('act-duration-h');
  if (durEl) durEl.value = horas;

  const cfg  = loadCalCfg();
  const hpd  = cfg.horasDia || 9;
  const dias = Math.round(horas / hpd);

  if (resEl) {
    resEl.style.display = 'flex';
    resEl.style.flexWrap = 'wrap';
    resEl.style.gap = '10px';
    resEl.innerHTML = `
      <span style="display:flex;align-items:center;gap:4px">
        <i class="fa-solid fa-hourglass-half" style="color:var(--blue)"></i>
        <strong style="color:var(--blue)">${horas}h</strong>
        <span style="color:var(--text-4)">de trabalho efetivo</span>
      </span>
      <span class="badge badge-blue">${dias} dia(s) útil(is)</span>
      <span class="badge badge-gray"><i class="fa-solid fa-clock"></i> ${hpd}h/dia</span>`;
  }
}

window.calcPrazo        = calcPrazo;
window.calcDurFromDates = calcDurFromDates;
