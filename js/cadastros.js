/* ═══════════════════════════════════════════════════════════════
   Mercronos · cadastros.js
   Criar, concluir e excluir atividades e projetos; calculadora de prazo do projeto
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   CRUD ATIVIDADES
══════════════════════════════════════════════════ */

window._openModalProject = function() {
    editingProjId = null;
    document.getElementById('modal-proj-title').textContent = 'Novo Projeto';
    ['proj-id','proj-name','proj-code','proj-desc','proj-manager'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('proj-status').value = 'Em andamento';
    document.getElementById('proj-start').value  = todayISO();
    document.getElementById('proj-end').value    = '';
    const puEl = document.getElementById('proj-dias-uteis'); if(puEl) puEl.value='';
    const prEl = document.getElementById('proj-calc-result'); if(prEl) prEl.style.display='none';
    selectColor(COLORS[Math.floor(Math.random()*COLORS.length)]);
    document.getElementById('modal-project').classList.add('open');
    setTimeout(()=>document.getElementById('proj-name')?.focus(),100);
};

function completeAct(id) {
  const a = activities.find(x=>x.id===id);
  if (!a) return;
  a.status = 'Concluído';
  a.progress = 100;
  addHistory('complete', `Atividade concluída: ${a.description} (${a.project})`);
  save(); renderAll();
  toast('✓ Atividade concluída!', 'success');
}

function deleteAct(id) {
  if (!confirm('Excluir esta atividade?')) return;
  addHistory('delete', `Atividade excluída: ${activities.find(a=>a.id===id)?.description||id}`);
  activities = activities.filter(a=>a.id!==id);
  save(); renderAll();
  toast('Atividade excluída', 'info');
}

function addActForProject(projName) {
  openModal('activity');
  setTimeout(()=>{ document.getElementById('act-project').value = projName; },80);
}

/* ══════════════════════════════════════════════════
   CRUD PROJETOS
══════════════════════════════════════════════════ */
function editProj(id) {
  const p = projects.find(x=>x.id===id);
  if (!p) return;
  editingProjId = id;
  document.getElementById('modal-proj-title').textContent = 'Editar Projeto';
  document.getElementById('proj-id').value      = p.id;
  document.getElementById('proj-name').value    = p.name||'';
  document.getElementById('proj-code').value    = p.code||'';
  document.getElementById('proj-desc').value    = p.desc||'';
  document.getElementById('proj-manager').value = p.manager||'';
  document.getElementById('proj-status').value  = p.status||'Em andamento';
  document.getElementById('proj-start').value   = p.startDate||'';
  document.getElementById('proj-end').value     = p.endDate||'';
  selectColor(p.color||COLORS[0]);
  document.getElementById('modal-project').classList.add('open');
}

/* ══════════════════════════════════════════════════
   CALCULADORA DE PRAZO — PROJETO
   Exclui sábado (6) e domingo (0)
══════════════════════════════════════════════════ */

/** Avança N dias úteis (sem sáb/dom) a partir de startISO */
function projAddDiasUteis(startISO, nDias) {
  const d = new Date(startISO + 'T00:00:00');
  let count = 0;
  // O próprio dia de início conta se for dia útil
  if (nDias <= 1) {
    // garante que o dia de início seja útil
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return dataLocalISO(d);
  }
  // Avança a partir do dia seguinte ao início
  let started = false;
  while (count < nDias) {
    if (started) d.setDate(d.getDate() + 1);
    started = true;
    if (d.getDay() !== 0 && d.getDay() !== 6) count++;
  }
  return dataLocalISO(d);
}

/** Conta dias úteis entre duas datas (inclusivo) */
function projContaDiasUteis(startISO, endISO) {
  let cur  = new Date(startISO + 'T00:00:00');
  const fim = new Date(endISO   + 'T00:00:00');
  let count = 0;
  while (cur <= fim) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Chamada quando usuário muda Início ou Dias úteis → calcula Término */
function projCalcFim() {
  const start = document.getElementById('proj-start')?.value;
  const dias  = parseInt(document.getElementById('proj-dias-uteis')?.value);
  const resEl = document.getElementById('proj-calc-result');

  if (!start || !dias || dias < 1) {
    if (resEl) resEl.style.display = 'none';
    return;
  }

  const fim = projAddDiasUteis(start, dias);
  const endEl = document.getElementById('proj-end');
  if (endEl) endEl.value = fim;

  // Dias corridos
  const diasCorridos = Math.round(
    (new Date(fim + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000
  ) + 1;

  if (resEl) {
    resEl.style.display = 'flex';
    resEl.innerHTML = `
      <span style="display:flex;align-items:center;gap:5px;color:var(--green);font-weight:700">
        <i class="fa-solid fa-calendar-check"></i> ${formatDate(fim)}
      </span>
      <span class="badge badge-blue">${dias} dia(s) útil(is)</span>
      <span class="badge badge-gray">${diasCorridos} dia(s) corrido(s)</span>`;
  }
}

/** Chamada quando usuário muda Término manualmente → calcula Dias úteis */
function projCalcDias() {
  const start = document.getElementById('proj-start')?.value;
  const end   = document.getElementById('proj-end')?.value;
  const resEl = document.getElementById('proj-calc-result');

  if (!start || !end || end < start) {
    if (resEl) resEl.style.display = 'none';
    return;
  }

  const dias = projContaDiasUteis(start, end);
  const diasUtilEl = document.getElementById('proj-dias-uteis');
  if (diasUtilEl) diasUtilEl.value = dias;

  const diasCorridos = Math.round(
    (new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000
  ) + 1;

  if (resEl) {
    resEl.style.display = 'flex';
    resEl.innerHTML = `
      <span style="display:flex;align-items:center;gap:5px;color:var(--blue);font-weight:700">
        <i class="fa-solid fa-hourglass-half"></i> ${dias} dia(s) útil(is)
      </span>
      <span class="badge badge-gray">${diasCorridos} dia(s) corrido(s)</span>`;
  }
}

window.projCalcFim  = projCalcFim;
window.projCalcDias = projCalcDias;

function deleteProj(id) {
  const p = projects.find(x=>x.id===id);
  if (!p) return;
  if (!confirm(`Excluir projeto "${p.name}"?`)) return;
  projects = projects.filter(x=>x.id!==id);
  save(); renderAll();
  toast('Projeto excluído', 'info');
}

function buildColorPicker() {
  const el = document.getElementById('color-picker');
  if (!el) return;
  el.innerHTML = COLORS.map(c => `
    <div onclick="selectColor('${c}')" style="width:22px;height:22px;border-radius:6px;background:${c};cursor:pointer;transition:transform .15s;box-shadow:0 1px 3px rgba(0,0,0,.2)" data-color="${c}" title="${c}"></div>
  `).join('');
  selectColor(COLORS[0]);
}

function selectColor(color) {
  const el = document.getElementById('color-picker');
  if (!el) return;
  el.dataset.selected = color;
  el.querySelectorAll('[data-color]').forEach(d => {
    d.style.transform = d.dataset.color === color ? 'scale(1.25)' : 'scale(1)';
    d.style.outline   = d.dataset.color === color ? `2px solid ${color}` : 'none';
    d.style.outlineOffset = '2px';
  });
}

function updateProjectsDatalist() {
  const dl = document.getElementById('projects-datalist');
  if (!dl) return;
  dl.innerHTML = projects.map(p => `<option value="${esc(p.name)}">`).join('');
}
