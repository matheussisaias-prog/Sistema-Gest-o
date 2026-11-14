/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · painel.js
   Dashboard: indicadores, próximas a vencer, recomendações, prioridades e gráficos
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   KPIs
══════════════════════════════════════════════════ */
function renderKPIs() {
  const overdue  = activities.filter(a => a.status === 'Vencido' || (a.status !== 'Concluído' && a.dueDate && diffDays(a.dueDate) < 0)).length;
  const ongoing  = activities.filter(a => a.status !== 'Concluído' && a.status !== 'Vencido').length;
  const done     = activities.filter(a => a.status === 'Concluído').length;
  const critical = activities.filter(a => a.isCritical && a.status !== 'Concluído').length;

  document.getElementById('kpi-overdue').textContent  = overdue;
  document.getElementById('kpi-ongoing').textContent  = ongoing;
  document.getElementById('kpi-done').textContent     = done;
  document.getElementById('kpi-critical').textContent = critical;
}

function updateBadge() {
  const n = activities.filter(a => a.status === 'Vencido').length;
  const b = document.getElementById('badge-overdue');
  b.textContent = n;
  b.style.display = n > 0 ? '' : 'none';
  document.getElementById('notif-dot').style.display = n > 0 ? '' : 'none';
}

/* ══════════════════════════════════════════════════
   UPCOMING TABLE
══════════════════════════════════════════════════ */
function renderUpcoming() {
  const tbody = document.getElementById('upcoming-tbody');
  const list = [...activities]
    .filter(a => a.status !== 'Concluído')
    .sort((a,b) => (a.dueDate||'9999').localeCompare(b.dueDate||'9999'))
    .slice(0,5);

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Nenhuma atividade pendente</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(a => {
    const diff = diffDays(a.dueDate);
    let rowCls = '', statusBadge = '';

    if (diff < 0) rowCls = 'row-overdue';
    else if (diff === 0) rowCls = 'row-today';

    if (a.status === 'Vencido')       statusBadge = `<span class="badge badge-red"><i class="fa-solid fa-circle-exclamation"></i>${esc(a.status)}</span>`;
    else if (a.status === 'Concluído') statusBadge = `<span class="badge badge-green"><i class="fa-solid fa-check"></i>${esc(a.status)}</span>`;
    else if (a.status === 'Reprogramado') statusBadge = `<span class="badge badge-purple">${esc(a.status)}</span>`;
    else if (diff === 0)               statusBadge = `<span class="badge badge-amber"><i class="fa-solid fa-clock"></i>Hoje</span>`;
    else if (diff <= 3 && diff > 0)    statusBadge = `<span class="badge badge-amber">Em ${diff}d</span>`;
    else                               statusBadge = `<span class="badge badge-blue">${esc(a.status)}</span>`;

    const pct = a.progress || 0;
    const fillCls = pct === 100 ? 'fill-green' : diff < 0 ? 'fill-red' : '';

    return `<tr class="${rowCls}">
      <td><span style="font-weight:600;color:var(--text-1)">${esc(a.description)}</span></td>
      <td><span class="project-chip"><span class="project-dot" style="background:${projColor(a.project)}"></span>${esc(a.project)}</span></td>
      <td><span style="font-size:.75rem">${esc(a.responsible||'—')}</span></td>
      <td><span style="font-size:.75rem;font-family:var(--font-mono);color:${diff<0?'var(--red)':diff===0?'var(--amber)':'var(--text-3)'}">${fmtDate(a.dueDate)}</span></td>
      <td>${statusBadge}</td>
      <td><div class="action-btns">
        <button class="action-btn success" onclick="completeAct('${a.id}')" data-tooltip="Concluir"><i class="fa-solid fa-check"></i></button>
        <button class="action-btn" onclick="editAct('${a.id}')" data-tooltip="Editar"><i class="fa-solid fa-pen"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════
   ALERTS / RECOMENDAÇÕES
══════════════════════════════════════════════════ */
function renderAlerts() {
  const el = document.getElementById('alert-list');
  const alerts = [];

  const overdue = activities.filter(a => a.status !== 'Concluído' && a.dueDate && diffDays(a.dueDate) < 0);
  if (overdue.length > 0) {
    alerts.push({ type:'red', icon:'fa-triangle-exclamation', text:`<strong>${overdue.length} atividade(s) vencida(s)</strong> precisam de ação imediata.` });
  }

  const today = activities.filter(a => a.status !== 'Concluído' && a.dueDate && diffDays(a.dueDate) === 0);
  if (today.length > 0) {
    alerts.push({ type:'amber', icon:'fa-clock', text:`<strong>${today.length} atividade(s) vencem hoje</strong> — ${today.map(a=>a.description).join(', ')}.` });
  }

  const critical = activities.filter(a => a.isCritical && a.status !== 'Concluído');
  if (critical.length > 0) {
    alerts.push({ type:'blue', icon:'fa-route', text:`<strong>${critical.length} atividade(s) no caminho crítico</strong> precisam de acompanhamento.` });
  }

  const soon = activities.filter(a => a.status !== 'Concluído' && a.dueDate && diffDays(a.dueDate) > 0 && diffDays(a.dueDate) <= 3);
  if (soon.length > 0) {
    alerts.push({ type:'amber', icon:'fa-calendar-day', text:`<strong>${soon.length} atividade(s)</strong> vencem em até 3 dias.` });
  }

  if (!alerts.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px"><i class="fa-solid fa-shield-check"></i><p>Tudo em dia! Nenhum alerta.</p></div>`;
    return;
  }

  el.innerHTML = alerts.map(a => `
    <div class="alert-item alert-${a.type}">
      <i class="fa-solid ${a.icon} alert-icon"></i>
      <span class="alert-text">${a.text}</span>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════
   PRIORITY LIST
══════════════════════════════════════════════════ */
function renderPriority() {
  const el = document.getElementById('priority-list');
  const list = [...activities]
    .filter(a => a.status !== 'Concluído')
    .map(a => {
      const d = diffDays(a.dueDate);
      let score = 0;
      if (a.isCritical) score += 100;
      if (d < 0) score += 80 + Math.abs(d);
      else if (d === 0) score += 60;
      else if (d <= 3) score += 40;
      return { ...a, _score: score, _diff: d };
    })
    .filter(a => a._score > 0)
    .sort((a,b) => b._score - a._score)
    .slice(0, 7);

  if (!list.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px"><i class="fa-solid fa-inbox"></i><p>Nenhuma pendência urgente</p></div>`;
    return;
  }

  el.innerHTML = list.map((a, i) => {
    let urgBadge = '';
    if (a._diff < 0) urgBadge = `<span class="badge badge-red">${Math.abs(a._diff)}d atraso</span>`;
    else if (a._diff === 0) urgBadge = `<span class="badge badge-amber">Hoje</span>`;
    else if (a._diff <= 3) urgBadge = `<span class="badge badge-amber">Em ${a._diff}d</span>`;
    else if (a.isCritical) urgBadge = `<span class="badge badge-purple">Crítico</span>`;

    return `<div class="priority-item" onclick="editAct('${a.id}')">
      <span class="priority-rank">${i+1}</span>
      <div class="priority-info">
        <div class="priority-name">${esc(a.description)}</div>
        <div class="priority-meta">
          <span class="project-dot" style="background:${projColor(a.project)};width:5px;height:5px;border-radius:50%;display:inline-block"></span>
          ${esc(a.project)} · ${esc(a.responsible||'—')}
        </div>
      </div>
      <div class="priority-urgency">${urgBadge}</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════ */
function renderCharts() {
  renderChartProj();
  renderChartDonut();
  if (document.getElementById('view-graficos').classList.contains('active')) {
    renderFullCharts();
  }
}

function renderChartProj() {
  const ctx = document.getElementById('chart-proj');
  if (!ctx) return;
  const labels = projects.map(p => p.name);
  const done   = labels.map(n => activities.filter(a => a.project===n && a.status==='Concluído').length);
  const pend   = labels.map(n => activities.filter(a => a.project===n && a.status!=='Concluído').length);

  if (chartProj) chartProj.destroy();
  chartProj = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Concluídas', data:done, backgroundColor:'rgba(5,150,105,.7)', borderRadius:4, borderSkipped:false },
        { label:'Pendentes',  data:pend, backgroundColor:'rgba(37,99,235,.5)', borderRadius:4, borderSkipped:false },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:true,
      plugins:{ legend:{ labels:{ font:{family:'DM Sans',size:11}, color:'#64748b' } } },
      scales:{
        x:{ grid:{display:false}, ticks:{font:{family:'DM Sans',size:10},color:'#94a3b8'} },
        y:{ grid:{color:'rgba(100,116,139,.08)'}, ticks:{font:{family:'DM Sans',size:10},color:'#94a3b8'} }
      }
    }
  });
}

function renderChartDonut() {
  const ctx = document.getElementById('chart-donut');
  if (!ctx) return;

  const statuses = ['Pendente','Em Andamento','Concluído','Vencido','Reprogramado'];
  const colors   = ['#3b82f6','#d97706','#059669','#dc2626','#7c3aed'];
  const counts   = statuses.map(s => activities.filter(a => a.status===s).length).filter((_,i) => {
    return activities.filter(a => a.status===statuses[i]).length > 0;
  });
  const lbls   = statuses.filter((_,i) => activities.filter(a => a.status===statuses[i]).length > 0);
  const clrs   = colors.filter((_,i) => activities.filter(a => a.status===statuses[i]).length > 0);

  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:lbls, datasets:[{ data:counts, backgroundColor:clrs, borderWidth:0, hoverOffset:4 }] },
    options:{
      responsive:false, cutout:'72%',
      plugins:{legend:{display:false}, tooltip:{callbacks:{ label: c => ` ${c.label}: ${c.parsed}` }}}
    }
  });

  const legend = document.getElementById('donut-legend');
  if (legend) {
    legend.innerHTML = lbls.map((l,i) => `
      <div style="display:flex;align-items:center;gap:6px">
        <div style="width:8px;height:8px;border-radius:2px;background:${clrs[i]};flex-shrink:0"></div>
        <span style="color:var(--text-2)">${l}</span>
        <span style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-4);margin-left:auto">${counts[i]}</span>
      </div>`).join('');
  }
}

function renderFullCharts() {
  const c1 = document.getElementById('chart-status-full');
  const c2 = document.getElementById('chart-team-full');
  const c3 = document.getElementById('chart-proj-full');

  if (c1 && !chartStatusFull) {
    const statuses = ['Pendente','Em Andamento','Concluído','Vencido','Reprogramado'];
    const colors   = ['#3b82f6','#d97706','#059669','#dc2626','#7c3aed'];
    chartStatusFull = new Chart(c1, {
      type:'doughnut',
      data:{ labels:statuses, datasets:[{ data:statuses.map(s=>activities.filter(a=>a.status===s).length), backgroundColor:colors, borderWidth:0 }] },
      options:{ responsive:true, plugins:{ legend:{ position:'right', labels:{ font:{family:'DM Sans',size:11}, color:'#64748b' } } } }
    });
  }

  if (c2 && !chartTeamFull) {
    const people = [...new Set(activities.map(a=>a.responsible))].slice(0,8);
    chartTeamFull = new Chart(c2, {
      type:'bar',
      data:{
        labels:people,
        datasets:[
          { label:'Total', data:people.map(p=>activities.filter(a=>a.responsible===p).length), backgroundColor:'rgba(37,99,235,.6)', borderRadius:5, borderSkipped:false },
          { label:'Vencidas', data:people.map(p=>activities.filter(a=>a.responsible===p && a.status==='Vencido').length), backgroundColor:'rgba(220,38,38,.6)', borderRadius:5, borderSkipped:false },
        ]
      },
      options:{ responsive:true, plugins:{legend:{labels:{font:{family:'DM Sans',size:11},color:'#64748b'}}}, scales:{x:{grid:{display:false},ticks:{color:'#94a3b8',font:{family:'DM Sans',size:10}}},y:{grid:{color:'rgba(100,116,139,.08)'},ticks:{color:'#94a3b8',font:{family:'DM Sans',size:10}}}} }
    });
  }

  if (c3 && !chartProjFull) {
    chartProjFull = new Chart(c3, {
      type:'bar',
      data:{
        labels:projects.map(p=>p.name),
        datasets:[
          { label:'Concluídas', data:projects.map(p=>activities.filter(a=>a.project===p.name&&a.status==='Concluído').length), backgroundColor:'rgba(5,150,105,.7)', borderRadius:4 },
          { label:'Em dia',     data:projects.map(p=>activities.filter(a=>a.project===p.name&&a.status!=='Concluído'&&a.status!=='Vencido').length), backgroundColor:'rgba(37,99,235,.5)', borderRadius:4 },
          { label:'Vencidas',   data:projects.map(p=>activities.filter(a=>a.project===p.name&&a.status==='Vencido').length), backgroundColor:'rgba(220,38,38,.6)', borderRadius:4 },
        ]
      },
      options:{ responsive:true, plugins:{legend:{labels:{font:{family:'DM Sans',size:11},color:'#64748b'}}}, scales:{x:{grid:{display:false},ticks:{color:'#94a3b8',font:{family:'DM Sans',size:10}}},y:{grid:{color:'rgba(100,116,139,.08)'},ticks:{color:'#94a3b8',font:{family:'DM Sans',size:10}}}} }
    });
  }
}
