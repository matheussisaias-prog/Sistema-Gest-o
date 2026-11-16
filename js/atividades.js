/* ═══════════════════════════════════════════════════════════════
   Mercronos · atividades.js
   Lista de atividades com filtros e ordenação
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   ATIVIDADES TABLE
══════════════════════════════════════════════════ */
function renderAtividades() {
  const tbody = document.getElementById('acts-tbody');
  const fp = document.getElementById('f-projeto')?.value || '';
  const fs = document.getElementById('f-status')?.value || '';

  let list = [...activities];
  if (fp) list = list.filter(a => a.project === fp);
  if (fs) list = list.filter(a => a.status === fs);
  list.sort((a,b) => {
    let va = a[sortField]||'', vb = b[sortField]||'';
    if (typeof va === 'number') return sortDir * (va - vb);
    return sortDir * String(va).localeCompare(String(vb));
  });

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Nenhuma atividade encontrada</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((a, i) => {
    const diff = diffDays(a.dueDate);
    let rowCls = '';
    if (a.status === 'Concluído') rowCls = 'row-done';
    else if (diff < 0) rowCls = 'row-overdue';
    else if (diff === 0) rowCls = 'row-today';

    const pct = a.progress || 0;
    const fillCls = pct===100?'fill-green':diff<0?'fill-red':'';

    let stBadge = '';
    if (a.status==='Vencido')       stBadge = `<span class="badge badge-red">${esc(a.status)}</span>`;
    else if (a.status==='Concluído') stBadge = `<span class="badge badge-green">${esc(a.status)}</span>`;
    else if (a.status==='Reprogramado') stBadge = `<span class="badge badge-purple">${esc(a.status)}</span>`;
    else if (a.status==='Em Andamento') stBadge = `<span class="badge badge-amber">${esc(a.status)}</span>`;
    else                             stBadge = `<span class="badge badge-blue">${esc(a.status)}</span>`;

    return `<tr class="${rowCls}">
      <td><span style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-4)">${i+1}</span></td>
      <td><span class="project-chip"><span class="project-dot" style="background:${projColor(a.project)}"></span>${esc(a.project)}</span></td>
      <td style="max-width:200px">
        <span style="font-weight:600;color:var(--text-1);font-size:.8rem">${esc(a.description)}</span>
        ${a.isCritical ? '<span class="badge badge-red" style="margin-left:4px;font-size:.55rem">CRÍTICO</span>' : ''}
      </td>
      <td><span style="font-size:.75rem;font-family:var(--font-mono);color:var(--text-3)">${fmtDate(a.startDate)}</span></td>
      <td><span style="font-size:.75rem;font-family:var(--font-mono);color:${diff<0?'var(--red)':diff===0?'var(--amber)':'var(--text-3)'}">${fmtDate(a.dueDate)}</span></td>
      <td><span style="font-size:.78rem">${esc(a.responsible||'—')}</span></td>
      <td><span style="font-size:.72rem;font-family:var(--font-mono);color:var(--text-4)">${esc(a.duration||'—')}</span></td>
      <td>
        <div class="progress-bar-wrap">
          <div class="progress-bar-track"><div class="progress-bar-fill ${fillCls}" style="width:${pct}%"></div></div>
          <span class="progress-val">${pct}%</span>
        </div>
      </td>
      <td>${stBadge}</td>
      <td>
        <div class="action-btns">
          ${a.status!=='Concluído'?`<button class="action-btn success" onclick="completeAct('${a.id}')" data-tooltip="Concluir"><i class="fa-solid fa-check"></i></button>`:''}
          <button class="action-btn" onclick="editAct('${a.id}')" data-tooltip="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="action-btn danger" onclick="deleteAct('${a.id}')" data-tooltip="Excluir"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Atualiza filtro de projeto
  const fp_el = document.getElementById('f-projeto');
  if (fp_el && fp_el.options.length <= 1) {
    projects.forEach(p => {
      const o = document.createElement('option');
      o.value = p.name; o.textContent = p.name;
      fp_el.appendChild(o);
    });
  }
}

function sortActs(field) {
  if (sortField === field) sortDir *= -1;
  else { sortField = field; sortDir = 1; }
  renderAtividades();
}

function clearFilters() {
  document.getElementById('f-projeto').value = '';
  document.getElementById('f-status').value  = '';
  renderAtividades();
}

/* ══════════════════════════════════════════════════
   KANBAN
══════════════════════════════════════════════════ */
