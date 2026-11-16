/* ═══════════════════════════════════════════════════════════════
   Aprumo · extensoes.js
   Telas Projetos, Equipe, Gantt, Portfólio, Recursos, Kanban, Calendários e Relatório PDF; funcionários e pastas de projetos
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
(function(){
  const STORAGE_EMP='tf_employees_v2';
  const STORAGE_TEAMCAL='tf_team_calendar_v2';
  const STORAGE_RESOURCES='tf_resources_registry_v1';
  let chartTeamResAvg = null;
  let draggedKanbanId = null;
  const originalLoad = loadBase; // carregamento base (inicio.js)
  const originalSave = saveBase; // gravação base (inicio.js)

  window.employees = window.employees || [];
  window.teamCalendar = window.teamCalendar || {};
  window.resourceRegistry = window.resourceRegistry || [];

  function normalizeName(name){
    return String(name||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
  }
  function titleName(name){
    return String(name||'').trim().replace(/\s+/g,' ').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
  }
  function getProjectStatusGroup(status){
    if (status === 'Arquivado') return 'arquivados';
    if (status === 'Concluído') return 'concluidos';
    return 'ativos';
  }
  function isoToDate(iso){ return iso ? new Date(iso + 'T00:00:00') : null; }
  function rangeForActivity(a){
    const start = a.startDate || a.dueDate;
    const end = a.dueDate || a.startDate || start;
    return { start, end };
  }
  function activityRunsOn(a, dateStr){
    const r = rangeForActivity(a);
    if (!r.start && !r.end) return false;
    return dateStr >= (r.start || r.end) && dateStr <= (r.end || r.start);
  }
  function getCanonicalEmployeeName(raw){
    const key = normalizeName(raw);
    if (!key) return '';
    const found = employees.find(e => e.key === key);
    return found ? found.name : titleName(raw);
  }
  function buildEmployeeDatabase(){
    const map = new Map((employees||[]).map(e => [e.key, {...e}]));
    (resourceRegistry||[]).filter(r => r.isCollaborator).forEach(r => {
      const key = normalizeName(r.name);
      if (!key) return;
      const existing = map.get(key) || { id:r.id || ('emp_'+key.replace(/[^a-z0-9]+/g,'_')), key, name:titleName(r.name), team:'Não definida', notes:'' };
      existing.name = titleName(r.name);
      existing.team = r.team || existing.team || 'Não definida';
      existing.role = r.role || existing.role || '';
      map.set(key, existing);
    });
    activities.forEach(a => {
      const key = normalizeName(a.responsible);
      if (!key) return;
      const canonical = map.get(key)?.name || titleName(a.responsible);
      a.responsible = canonical;
      const existing = map.get(key) || { id:'emp_'+key.replace(/[^a-z0-9]+/g,'_'), key, name: canonical, team:'Não definida', notes:'' };
      existing.name = canonical;
      existing.lastProject = a.project || existing.lastProject || '';
      if (!existing.projects) existing.projects = [];
      if (a.project && !existing.projects.includes(a.project)) existing.projects.push(a.project);
      map.set(key, existing);
    });
    employees = [...map.values()].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  }
  function loadExtraStores(){
    try { employees = JSON.parse(localStorage.getItem(STORAGE_EMP) || '[]'); } catch(_) { employees = []; }
    try { teamCalendar = JSON.parse(localStorage.getItem(STORAGE_TEAMCAL) || '{}'); } catch(_) { teamCalendar = {}; }
    try { resourceRegistry = JSON.parse(localStorage.getItem(STORAGE_RESOURCES) || '[]'); } catch(_) { resourceRegistry = []; }
    projects.forEach(p => { if (!p.status) p.status = 'Em andamento'; });
    buildEmployeeDatabase();
  }
  function saveExtraStores(){
    localStorage.setItem(STORAGE_EMP, JSON.stringify(employees));
    localStorage.setItem(STORAGE_TEAMCAL, JSON.stringify(teamCalendar));
    localStorage.setItem(STORAGE_RESOURCES, JSON.stringify(resourceRegistry));
  }
  // Liga cada atividade ao projeto pelo id; o nome do projeto passa a ser derivado do id.
  // Atividades antigas (só com nome) ganham o id na primeira gravação.
  function vincularAtividadesProjetos(){
    const porId = new Map(projects.map(p => [p.id, p]));
    const porNome = new Map(projects.map(p => [p.name, p]));
    activities.forEach(a => {
      const p = (a.projectId && porId.get(a.projectId)) || porNome.get(a.project);
      if (p) { a.projectId = p.id; a.project = p.name; }
    });
  }
  window.vincularAtividadesProjetos = vincularAtividadesProjetos;
  window.buildEmployeeDatabase = function(){ buildEmployeeDatabase(); };
  window.load = function(){ originalLoad(); loadExtraStores(); vincularAtividadesProjetos(); };
  window.save = function(){ vincularAtividadesProjetos(); buildEmployeeDatabase(); originalSave(); saveExtraStores(); scheduleGistSave(); };

  function ensureProjectStatusOptions(){
    const sel = document.getElementById('proj-status');
    if (sel && ![...sel.options].some(o => o.value === 'Arquivado')) {
      const opt = document.createElement('option'); opt.value='Arquivado'; opt.textContent='Arquivado'; sel.appendChild(opt);
    }
  }
  function ensureActivityModalExtras(){
    const body = document.querySelector('#modal-activity .modal-body');
    if (!body || document.getElementById('act-parent-id')) return;
    const hidden = document.createElement('input'); hidden.type='hidden'; hidden.id='act-parent-id'; body.prepend(hidden);
  }
  function injectViewButtons(){
    const calHdr = document.querySelector('#view-cal-atividades .card-header');
    if (calHdr && !document.getElementById('btn-export-cal-pdf')) {
      const box = document.createElement('div'); box.className='calendar-toolbar-extra';
      box.innerHTML = '<button class="btn-secondary" id="btn-export-cal-pdf" onclick="exportCalAtivPdf()"><i class="fa-solid fa-file-pdf"></i> Exportar PDF</button>';
      calHdr.appendChild(box);
    }
    const ganttHdr = document.querySelector('#view-gantt .card-header');
    if (ganttHdr && !document.getElementById('btn-gantt-sub')) {
      const box = document.createElement('div'); box.className='gantt-toolbar-extra';
      box.innerHTML = '<button class="btn-secondary" id="btn-gantt-sub" onclick="addSubactivityFromGantt()"><i class="fa-solid fa-diagram-project"></i> Nova subatividade</button>';
      ganttHdr.appendChild(box);
    }
    const equipeView = document.getElementById('view-equipe');
    if (equipeView && !document.getElementById('team-res-chart-card')) {
      const card = document.createElement('div');
      card.className='card team-chart-card';
      card.id='team-res-chart-card';
      card.innerHTML = '<div class="card-header"><i class="fa-solid fa-chart-column" style="color:var(--green);font-size:.85rem"></i><span class="card-title">Tempo médio de resolução por pessoa</span></div><div class="card-body"><canvas id="team-resolution-chart" height="95"></canvas></div>';
      equipeView.insertBefore(card, document.getElementById('equipe-grid'));
    }
    const calEqHdr = document.querySelector('#view-cal-equipe .card-header');
    if (calEqHdr && !document.getElementById('btn-cal-equipe-status')) {
      const box = document.createElement('div'); box.className='calendar-toolbar-extra';
      box.innerHTML = '<button class="btn-secondary" id="btn-cal-equipe-status" onclick="openTeamStatusPrompt()"><i class="fa-solid fa-user-clock"></i> Lançar status</button>';
      calEqHdr.appendChild(box);
    }
  }
  function employeeOptionsHtml(selected=''){
    return employees.map(e => `<option value="${esc(e.name)}" ${e.name===selected?'selected':''}>${esc(e.name)}</option>`).join('');
  }
  function renderResourceRegistry(){
    const host = document.getElementById('resource-registry-list');
    if (!host) return;
    const cards = (resourceRegistry||[]).slice().sort((a,b)=>titleName(a.name).localeCompare(titleName(b.name),'pt-BR')).map(item => `
      <div class="resource-person-card">
        <h4>${esc(titleName(item.name))}</h4>
        <p>${item.isCollaborator ? 'Colaborador' : 'Recurso'}${item.team ? ' • ' + esc(item.team) : ''}</p>
        <div class="meta">
          <span class="badge ${item.isCollaborator ? 'badge-green' : 'badge-blue'}">${item.isCollaborator ? 'Equipe' : 'Recurso'}</span>
          ${item.role ? `<span class="badge badge-purple">${esc(item.role)}</span>` : ''}
          <button class="action-btn danger" onclick="deleteResourceEntry('${item.id}')" data-tooltip="Excluir"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`).join('');
    host.innerHTML = cards || `<div class="empty-state"><i class="fa-solid fa-id-badge"></i><p>Nenhum cadastro manual ainda</p></div>`;
  }
  window._openModalActivity = function(){
    ensureActivityModalExtras();
    editingActId = null;
    document.getElementById('modal-act-title').textContent = 'Nova Atividade';
    ['act-id','act-project','act-responsible','act-description','act-obs','act-parent-id'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value='';
    });
    document.getElementById('act-start').value = todayISO();
    document.getElementById('act-due').value = '';
    document.getElementById('act-status').value = 'Pendente';
    document.getElementById('act-progress').value = 0;
    { const c = document.getElementById('act-critical'); if (c) c.checked = false; }
    document.getElementById('modal-activity').classList.add('open');
    setTimeout(()=>document.getElementById('act-description')?.focus(),100);
  };
  window.editAct = function(id){
    ensureActivityModalExtras();
    const a = activities.find(x=>x.id===id);
    if (!a) return;
    editingActId = id;
    document.getElementById('modal-act-title').textContent = a.parentId ? 'Editar Subatividade' : 'Editar Atividade';
    document.getElementById('act-id').value = a.id;
    document.getElementById('act-project').value = a.project||'';
    document.getElementById('act-responsible').value = a.responsible||'';
    document.getElementById('act-description').value = a.description||'';
    document.getElementById('act-start').value = a.startDate||'';
    document.getElementById('act-due').value = a.dueDate||'';
    document.getElementById('act-status').value = a.status||'Pendente';
    document.getElementById('act-progress').value = a.progress||0;
    document.getElementById('act-obs').value = a.obs||'';
    document.getElementById('act-parent-id').value = a.parentId || '';
    { const c = document.getElementById('act-critical'); if (c) c.checked = !!a.isCritical; }
    const durHEl = document.getElementById('act-duration-h');
    if (durHEl) durHEl.value = a.durationH || '';
    document.getElementById('calc-result').style.display = 'none';
    document.getElementById('modal-activity').classList.add('open');
  };
  window.saveActivity = function(){
    ensureActivityModalExtras();
    const proj = document.getElementById('act-project').value.trim();
    const desc = document.getElementById('act-description').value.trim();
    let resp = document.getElementById('act-responsible').value.trim();
    if (!proj) return toast('Projeto é obrigatório', 'error');
    if (!desc) return toast('Título é obrigatório', 'error');
    const horasVal = document.getElementById('act-duration-h')?.value;
    const cfg = loadCalCfg();
    resp = resp ? getCanonicalEmployeeName(resp) : '';
    const durStr = horasVal ? `${horasVal}h (${Math.ceil(parseFloat(horasVal)/(cfg.horasDia||9))}d úteis)` : '';
    const data = {
      project: proj,
      description: desc,
      responsible: resp,
      startDate: document.getElementById('act-start').value,
      dueDate: document.getElementById('act-due').value,
      status: document.getElementById('act-status').value,
      progress: parseInt(document.getElementById('act-progress').value)||0,
      obs: document.getElementById('act-obs').value.trim(),
      isCritical: !!document.getElementById('act-critical')?.checked,
      duration: durStr,
      durationH: parseFloat(horasVal)||0,
      parentId: document.getElementById('act-parent-id')?.value || '',
      projectId: (projects.find(p => p.name === proj) || {}).id
    };
    if (editingActId) {
      const idx = activities.findIndex(a=>a.id===editingActId);
      if (idx>=0) activities[idx] = { ...activities[idx], ...data };
      addHistory('update', `${data.parentId?'Subatividade':'Atividade'} atualizada: ${data.description} (${data.project})`);
      toast('✓ Registro atualizado', 'success');
    } else {
      activities.push({ id:uid(), ...data });
      addHistory('create', `Nova ${data.parentId?'subatividade':'atividade'}: ${data.description} (${data.project})`);
      toast(`✓ ${data.parentId?'Subatividade':'Atividade'} criada`, 'success');
    }
    if (!projects.find(p=>p.name===proj)) {
      const color = COLORS[projects.length % COLORS.length];
      projects.push({ id:uid(), name:proj, code:'', desc:'', manager:'', status:'Em andamento', startDate:todayISO(), endDate:'', color, progress:0 });
      PROJECT_COLORS_MAP[proj] = color;
    }
    buildEmployeeDatabase();
    save(); closeModal('modal-activity');
    renderAll(); // renderAll já re-renderiza a view ativa automaticamente
  };
  window.saveProject = function(){
    const name = document.getElementById('proj-name').value.trim();
    const mgr  = document.getElementById('proj-manager').value.trim();
    if (!name) return toast('Nome é obrigatório', 'error');
    if (!mgr) return toast('Gestor é obrigatório', 'error');
    const selectedColor = document.getElementById('color-picker').dataset.selected || COLORS[0];
    const data = {
      name,
      code: document.getElementById('proj-code').value.trim(),
      desc: document.getElementById('proj-desc').value.trim(),
      manager: mgr,
      status: document.getElementById('proj-status').value,
      startDate: document.getElementById('proj-start').value,
      endDate: document.getElementById('proj-end').value,
      color: selectedColor,
    };
    if (editingProjId) {
      const idx = projects.findIndex(p=>p.id===editingProjId);
      const oldName = idx>=0 ? projects[idx].name : name;
      if (idx>=0) projects[idx] = {...projects[idx], ...data};
      activities.forEach(a => { if (a.projectId === editingProjId || a.project === oldName) { a.project = name; a.projectId = editingProjId; } });
      toast('✓ Projeto atualizado', 'success');
    } else {
      projects.push({ id:uid(), progress:0, ...data });
      toast('✓ Projeto criado', 'success');
    }
    PROJECT_COLORS_MAP[name] = selectedColor;
    save(); closeModal('modal-project'); renderAll();
  };
  window.renderKanban = function(){
    const board = document.getElementById('kanban-board'); if (!board) return;
    const cols = [
      { key:'Pendente', label:'Pendente', dot:'#3b82f6' },
      { key:'Em Andamento', label:'Em Andamento', dot:'#d97706' },
      { key:'Reprogramado', label:'Reprogramado', dot:'#7c3aed' },
      { key:'Vencido', label:'Atrasado', dot:'#dc2626' },
      { key:'Concluído', label:'Concluído', dot:'#059669' },
    ];
    board.innerHTML = cols.map(col => {
      const cards = activities.filter(a => a.status === col.key).sort((a,b) => (a.dueDate||'').localeCompare(b.dueDate||''));
      return `<div class="kanban-col">
        <div class="kanban-col-header"><div class="kanban-dot" style="background:${col.dot}"></div><span class="kanban-col-title">${col.label}</span><span class="kanban-col-count">${cards.length}</span></div>
        <div class="kanban-dropzone" data-status="${col.key}" ondragover="kanbanAllowDrop(event)" ondrop="kanbanDrop(event,'${col.key}')" ondragleave="kanbanDragLeave(event)">
          <div class="kanban-cards">
          ${cards.length ? cards.map(a => {
            const diff = diffDays(a.dueDate);
            const detail = a.parentId ? '<span class="badge badge-purple" style="font-size:.55rem">SUB</span>' : '';
            return `<div class="kanban-card" draggable="true" data-id="${a.id}" ondragstart="kanbanDragStart(event)" ondragend="kanbanDragEnd(event)" onclick="editAct('${a.id}')">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><div class="kanban-card-title">${esc(a.description)}</div>${detail}</div>
              <div class="kanban-card-meta"><span class="kanban-card-proj"><span class="project-dot" style="background:${projColor(a.project)}"></span>${esc(a.project)}</span><div class="kanban-card-avatar" title="${esc(a.responsible||'Sem responsável')}">${(a.responsible||'?')[0].toUpperCase()}</div></div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:.64rem;color:var(--text-4)"><span>${esc(a.responsible||'Sem responsável')}</span><span>${diff<0?Math.abs(diff)+'d atraso':a.dueDate?fmtDate(a.dueDate):'Sem data'}</span></div>
            </div>`;
          }).join('') : '<div style="padding:12px;text-align:center;font-size:.72rem;color:var(--text-4)">Arraste cards para cá</div>'}
          </div>
        </div>
      </div>`;
    }).join('');
  };
  window.kanbanDragStart = function(ev){ draggedKanbanId = ev.currentTarget.dataset.id; ev.currentTarget.classList.add('dragging'); };
  window.kanbanDragEnd = function(ev){ ev.currentTarget.classList.remove('dragging'); document.querySelectorAll('.kanban-dropzone').forEach(z=>z.classList.remove('drag-over')); };
  window.kanbanAllowDrop = function(ev){ ev.preventDefault(); ev.currentTarget.classList.add('drag-over'); };
  window.kanbanDragLeave = function(ev){ ev.currentTarget.classList.remove('drag-over'); };
  window.kanbanDrop = function(ev, status){ ev.preventDefault(); ev.currentTarget.classList.remove('drag-over'); if (!draggedKanbanId) return; const act = activities.find(a=>a.id===draggedKanbanId); if (!act) return; act.status = status; if (status==='Concluído') act.progress=100; if (status!=='Concluído' && act.progress===100) act.progress=90; addHistory('update', `Kanban: ${act.description} movida para ${status}`); save(); renderAll(); draggedKanbanId = null; };

/* ══════════════════════════════════════════════════
   PASTAS CUSTOMIZADAS DE PROJETOS
══════════════════════════════════════════════════ */
const FOLDERS_KEY = 'tf_project_folders';
let projectFolders = []; // [{ id, name, desc, color, projectIds:[], collapsed:false }]

function loadFolders() {
  try { projectFolders = JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]'); } catch(_) { projectFolders = []; }
}
function saveFolders() {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(projectFolders));
}

/* ── MODAL ── */
function openFolderModal(id) {
  loadFolders();
  document.getElementById('folder-edit-id').value = id || '';
  document.getElementById('folder-modal-title').textContent = id ? 'Editar Pasta' : 'Nova Pasta';

  if (id) {
    const f = projectFolders.find(x => x.id === id) || {};
    document.getElementById('folder-name').value = f.name || '';
    document.getElementById('folder-desc').value = f.desc || '';
    buildFolderColorPicker(f.color || '#f59e0b');
  } else {
    document.getElementById('folder-name').value = '';
    document.getElementById('folder-desc').value = '';
    buildFolderColorPicker('#f59e0b');
  }
  document.getElementById('modal-folder').classList.add('open');
  setTimeout(() => document.getElementById('folder-name')?.focus(), 80);
}

function buildFolderColorPicker(selected) {
  const COLORS = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444','#ec4899','#0ea5e9','#f97316'];
  const el = document.getElementById('folder-color-picker');
  if (!el) return;
  el.dataset.selected = selected;
  el.innerHTML = COLORS.map(c => `
    <div onclick="selectFolderColor('${c}')"
      style="width:22px;height:22px;border-radius:6px;background:${c};cursor:pointer;
             transition:transform .15s;outline:${c===selected?'2.5px solid '+c:'none'};
             outline-offset:2px;transform:${c===selected?'scale(1.25)':'scale(1)'}"
      data-fc="${c}"></div>`).join('');
}

function selectFolderColor(c) {
  const el = document.getElementById('folder-color-picker');
  if (!el) return;
  el.dataset.selected = c;
  el.querySelectorAll('[data-fc]').forEach(d => {
    const isActive = d.dataset.fc === c;
    d.style.transform    = isActive ? 'scale(1.25)' : 'scale(1)';
    d.style.outline      = isActive ? `2.5px solid ${c}` : 'none';
    d.style.outlineOffset = '2px';
  });
}

function saveFolder() {
  const name  = document.getElementById('folder-name').value.trim();
  const desc  = document.getElementById('folder-desc').value.trim();
  const color = document.getElementById('folder-color-picker')?.dataset.selected || '#f59e0b';
  const editId = document.getElementById('folder-edit-id').value;

  if (!name) return toast('Nome da pasta é obrigatório', 'error');

  loadFolders();
  if (editId) {
    const f = projectFolders.find(x => x.id === editId);
    if (f) { f.name = name; f.desc = desc; f.color = color; }
    toast('✓ Pasta atualizada', 'success');
  } else {
    projectFolders.push({ id: uid(), name, desc, color, projectIds: [], collapsed: false });
    toast('✓ Pasta criada', 'success');
  }
  saveFolders();
  closeModal('modal-folder');
  renderProjetos();
}

function deleteFolder(id) {
  if (!confirm('Excluir esta pasta? Os projetos dentro não serão excluídos.')) return;
  loadFolders();
  projectFolders = projectFolders.filter(f => f.id !== id);
  saveFolders();
  renderProjetos();
  toast('Pasta excluída', 'info');
}

function toggleFolder(id) {
  loadFolders();
  const f = projectFolders.find(x => x.id === id);
  if (f) f.collapsed = !f.collapsed;
  saveFolders();
  // Toggling sem re-render completo
  const el = document.getElementById('cf-' + id);
  if (el) el.classList.toggle('collapsed', f.collapsed);
}

/* ── Atribuir / remover projeto de pasta ── */
function assignProjectToFolder(projId, folderId) {
  loadFolders();
  // Remove o projeto de qualquer pasta anterior
  projectFolders.forEach(f => {
    f.projectIds = (f.projectIds || []).filter(id => id !== projId);
  });
  if (folderId) {
    const f = projectFolders.find(x => x.id === folderId);
    if (f) { if (!f.projectIds) f.projectIds = []; f.projectIds.push(projId); }
  }
  saveFolders();
  renderProjetos();
}

function getFolderOfProject(projId) {
  return projectFolders.find(f => (f.projectIds || []).includes(projId)) || null;
}

/* ── Drag & Drop ── */
let _dragProjId = null;

function onProjDragStart(e, projId) {
  _dragProjId = projId;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.querySelector(`[data-proj-id="${projId}"]`);
    if (el) el.classList.add('dragging');
  }, 0);
}

function onProjDragEnd() {
  document.querySelectorAll('.card.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.folder-drop-zone.dragover').forEach(el => el.classList.remove('dragover'));
  _dragProjId = null;
}

function onFolderDragOver(e, folderId) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.folder-drop-zone').forEach(el => el.classList.remove('dragover'));
  document.getElementById('fdz-' + folderId)?.classList.add('dragover');
}

function onFolderDrop(e, folderId) {
  e.preventDefault();
  if (_dragProjId) { assignProjectToFolder(_dragProjId, folderId); }
  document.querySelectorAll('.folder-drop-zone').forEach(el => el.classList.remove('dragover'));
}

function removeFromFolder(projId) {
  assignProjectToFolder(projId, null);
}

/* ── Render das pastas ── */
function renderCustomFolders(projectCardFn) {
  loadFolders();
  const wrap = document.getElementById('custom-folders-wrap');
  if (!wrap) return;
  if (!projectFolders.length) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = projectFolders.map(f => {
    const folderProjects = (f.projectIds || [])
      .map(id => projects.find(p => p.id === id))
      .filter(Boolean);

    const cards = folderProjects.length
      ? folderProjects.map(p => projectCardFn(p, f.id)).join('')
      : `<div class="empty-state" style="padding:20px;grid-column:1/-1">
           <i class="fa-solid fa-folder-open"></i>
           <p>Arraste projetos para esta pasta</p>
         </div>`;

    return `
      <div class="custom-folder ${f.collapsed ? 'collapsed' : ''}" id="cf-${f.id}">
        <div class="custom-folder-header" onclick="toggleFolder('${f.id}')">
          <span class="custom-folder-color-dot" style="background:${f.color}"></span>
          <i class="fa-solid fa-folder custom-folder-icon" style="color:${f.color}"></i>
          <span class="custom-folder-name">${esc(f.name)}</span>
          <span class="custom-folder-meta">${folderProjects.length} projeto(s)</span>
          <div class="custom-folder-actions" onclick="event.stopPropagation()">
            <button class="action-btn" onclick="openFolderModal('${f.id}')" title="Renomear pasta">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="action-btn danger" onclick="deleteFolder('${f.id}')" title="Excluir pasta">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
          <i class="fa-solid fa-chevron-down custom-folder-chevron"></i>
        </div>
        <div class="custom-folder-body">
          ${f.desc ? `<div style="font-size:.72rem;color:var(--text-4);margin-bottom:10px;font-style:italic">${esc(f.desc)}</div>` : ''}
          <div class="project-grid">${cards}</div>
          <!-- Drop zone -->
          <div class="folder-drop-zone" id="fdz-${f.id}"
            ondragover="onFolderDragOver(event,'${f.id}')"
            ondrop="onFolderDrop(event,'${f.id}')"
            ondragleave="this.classList.remove('dragover')">
            <i class="fa-solid fa-arrow-down" style="margin-right:4px"></i>
            Solte projetos aqui para adicionar à pasta
          </div>
        </div>
      </div>`;
  }).join('');
}

window.openFolderModal     = openFolderModal;
window.saveFolder          = saveFolder;
window.deleteFolder        = deleteFolder;
window.toggleFolder        = toggleFolder;
window.selectFolderColor   = selectFolderColor;
window.removeFromFolder    = removeFromFolder;
window.onProjDragStart     = onProjDragStart;
window.onProjDragEnd       = onProjDragEnd;
window.onFolderDragOver    = onFolderDragOver;
window.onFolderDrop        = onFolderDrop;
window.assignProjectToFolder = assignProjectToFolder;

  window.renderProjetos = function(){
    const grid = document.getElementById('projetos-grid'); if (!grid) return;
    loadFolders();

    // Projetos dentro de alguma pasta customizada
    const inFolderIds = new Set(projectFolders.flatMap(f => f.projectIds || []));

    // projectCard com drag support + botão mover para pasta
    function projectCard(p, currentFolderId) {
      const acts    = activities.filter(a => a.project === p.name);
      const done    = acts.filter(a => a.status === 'Concluído').length;
      const overdue = acts.filter(a => a.status === 'Vencido').length;
      const pct     = acts.length ? Math.round((done/acts.length)*100) : (p.progress||0);
      const group   = getProjectStatusGroup(p.status);

      // Dropdown de pastas para mover
      const folderOptions = projectFolders
        .filter(f => f.id !== currentFolderId)
        .map(f => `<option value="${f.id}">${esc(f.name)}</option>`)
        .join('');
      const moveBtn = projectFolders.length
        ? `<select class="filter-select" style="font-size:.68rem;height:28px;padding:0 6px"
             onchange="if(this.value){assignProjectToFolder('${p.id}',this.value==='-'?null:this.value);this.value=''}"
             onclick="event.stopPropagation()">
             <option value="">📁 Mover...</option>
             ${currentFolderId ? `<option value="-">↩ Remover da pasta</option>` : ''}
             ${folderOptions}
           </select>`
        : '';

      return `<div class="card" style="overflow:hidden;cursor:grab" draggable="true"
        data-proj-id="${p.id}"
        ondragstart="onProjDragStart(event,'${p.id}')"
        ondragend="onProjDragEnd()">
        <div style="height:4px;background:${p.color||'var(--blue)'}"></div>
        <div style="padding:14px 16px">
          <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
            <div style="flex:1">
              <div style="font-family:var(--font-head);font-weight:700;font-size:.88rem;color:var(--text-1)">${esc(p.name)}</div>
              <div style="font-size:.62rem;color:var(--text-4);font-family:var(--font-mono);margin-top:1px">${esc(p.code||'')}</div>
            </div>
            <span class="badge ${group==='ativos'?'badge-blue':group==='concluidos'?'badge-green':'badge-purple'}">${esc(p.status)}</span>
          </div>
          <div style="font-size:.73rem;color:var(--text-3);margin-bottom:10px;min-height:16px">${esc(p.desc||'')}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
            <div class="progress-bar-track" style="flex:1"><div class="progress-bar-fill" style="width:${pct}%;background:${p.color}"></div></div>
            <span style="font-family:var(--font-mono);font-size:.65rem;font-weight:700;color:var(--text-3)">${pct}%</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:.68rem;color:var(--text-3)">
            <span><i class="fa-solid fa-list-check" style="color:var(--blue)"></i> ${acts.length}</span>
            <span><i class="fa-solid fa-check" style="color:var(--green)"></i> ${done}</span>
            ${overdue>0?`<span><i class="fa-solid fa-triangle-exclamation" style="color:var(--red)"></i> ${overdue}</span>`:''}
            <span><i class="fa-solid fa-user" style="opacity:.5"></i> ${esc(p.manager||'—')}</span>
          </div>
        </div>
        <div style="border-top:1px solid var(--border);padding:8px 14px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <button class="btn-secondary" style="flex:1;justify-content:center;font-size:.72rem" onclick="addActForProject('${esc(p.name)}')"><i class="fa-solid fa-plus"></i> Atividade</button>
          <button class="btn-secondary" style="flex:1;justify-content:center;font-size:.72rem" onclick="editProj('${p.id}')"><i class="fa-solid fa-pen"></i> Editar</button>
          ${moveBtn}
          ${group!=='arquivados'
            ? `<button class="action-btn" onclick="setProjectStatus('${p.id}','Arquivado')" title="Arquivar"><i class="fa-solid fa-box-archive"></i></button>`
            : `<button class="action-btn" onclick="setProjectStatus('${p.id}','Em andamento')" title="Reativar"><i class="fa-solid fa-box-open"></i></button>`}
          <button class="action-btn danger" onclick="deleteProj('${p.id}')" title="Excluir"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    }

    // Renderiza pastas customizadas
    renderCustomFolders(projectCard);

    // Projetos sem pasta — agrupa por status igual antes
    const sections = [
      { key:'ativos',    title:'Projetos ativos',    sub:'Em andamento, planejamento e pausados' },
      { key:'concluidos',title:'Projetos concluídos', sub:'Finalizados e preservados para histórico' },
      { key:'arquivados',title:'Projetos arquivados', sub:'Passados e guardados em pasta de consulta' },
    ];

    const loose = projects.filter(p => !inFolderIds.has(p.id));

    if (!loose.length && !projectFolders.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-folder-open"></i><p>Nenhum projeto cadastrado</p></div>`;
      return;
    }

    grid.innerHTML = sections.map(sec => {
      const list = loose.filter(p => getProjectStatusGroup(p.status) === sec.key);
      if (!list.length) return '';
      return `<div class="project-folder" style="grid-column:1/-1">
        <div class="project-folder-title">
          <i class="fa-solid ${sec.key==='ativos'?'fa-folder-open':sec.key==='concluidos'?'fa-folder-check':'fa-box-archive'}"></i>
          ${sec.title}<span class="project-folder-sub">${sec.sub}</span>
        </div>
        <div class="project-grid">${list.map(p => projectCard(p, null)).join('')}</div>
      </div>`;
    }).join('');
  };
  window.setProjectStatus = function(id, status){ const p = projects.find(x=>x.id===id); if(!p) return; p.status = status; addHistory('update', `Projeto ${p.name} alterado para ${status}`); save(); renderProjetos(); renderPortfolio(); toast('Status do projeto atualizado', 'success'); };
  window.addSubactivityFromGantt = function(parentId=''){
    window._openModalActivity();
    if (!parentId) return;
    const parent = activities.find(a => a.id === parentId); if (!parent) return;
    document.getElementById('act-parent-id').value = parent.id;
    document.getElementById('act-project').value = parent.project || '';
    document.getElementById('act-start').value = parent.startDate || todayISO();
    document.getElementById('act-due').value = parent.dueDate || '';
    document.getElementById('act-description').value = `Subatividade — ${parent.description}`;
    document.getElementById('modal-act-title').textContent = 'Nova Subatividade';
  };
  window.clearGanttFilters = function() {
    const ids = ['gantt-f-search','gantt-f-project','gantt-f-status','gantt-f-resp'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.selectedIndex = 0;
      else el.value = '';
    });
    // Resetar opções dinâmicas para forçar repovoamento
    ['gantt-f-project','gantt-f-resp'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      while (el.options.length > 1) el.remove(1);
    });
    renderGantt();
  };
  window.clearGanttFilters = window.clearGanttFilters;

  /* Estado de ordenação do Gantt */
  if (!window._ganttSort) window._ganttSort = { field: 'wbs', dir: 1 };

  window.ganttSortBy = function(field) {
    if (window._ganttSort.field === field) window._ganttSort.dir *= -1;
    else { window._ganttSort.field = field; window._ganttSort.dir = 1; }
    renderGantt();
  };

  /* ── Agrupamento por projeto ── */
  window.toggleGanttGroup = function() {
    const cur = localStorage.getItem('gantt_group_by_project') === '1';
    if (cur) localStorage.removeItem('gantt_group_by_project');
    else localStorage.setItem('gantt_group_by_project', '1');
    renderGantt();
    // Atualiza visual do botão
    const btn = document.getElementById('gantt-group-btn');
    if (btn) btn.classList.toggle('active', !cur);
  };

  window.toggleGanttGroupCollapse = function(key) {
    if (!window._ganttCollapsedGroups) window._ganttCollapsedGroups = new Set();
    if (window._ganttCollapsedGroups.has(key)) window._ganttCollapsedGroups.delete(key);
    else window._ganttCollapsedGroups.add(key);
    // Salva estado
    localStorage.setItem('gantt_collapsed_groups', JSON.stringify([...window._ganttCollapsedGroups]));
    renderGantt();
  };

  // Restaura estado de grupos colapsados ao carregar
  try {
    const saved = JSON.parse(localStorage.getItem('gantt_collapsed_groups') || '[]');
    window._ganttCollapsedGroups = new Set(saved);
  } catch(e) { window._ganttCollapsedGroups = new Set(); }

  /* ══════════════════════════════════════════════════
     RELATÓRIO PDF — exportação profissional
  ══════════════════════════════════════════════════ */
  window.renderRelatorio = function() {
    // Popula select de projetos
    const sel = document.getElementById('rel-projetos');
    if (sel) {
      const projs = [...new Set(activities.map(a => a.project).filter(Boolean))].sort();
      sel.innerHTML = projs.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    }
    // Data padrão = hoje
    const dataEl = document.getElementById('rel-data');
    if (dataEl && !dataEl.value) dataEl.value = todayISO();
    // Preparado por padrão = se houver
    const prepEl = document.getElementById('rel-preparado');
    if (prepEl && !prepEl.value) prepEl.value = localStorage.getItem('rel_preparado_default') || '';
    // Restaura cliente, assinatura e logo salvos
    const cliEl  = document.getElementById('rel-cliente');
    if (cliEl && !cliEl.value) cliEl.value = localStorage.getItem('rel_cliente_default') || '';
    const asgN = document.getElementById('rel-assinatura-nome');
    if (asgN && !asgN.value) asgN.value = localStorage.getItem('rel_assinatura_nome') || '';
    const asgC = document.getElementById('rel-assinatura-cargo');
    if (asgC && !asgC.value) asgC.value = localStorage.getItem('rel_assinatura_cargo') || '';
    const corEl = document.getElementById('rel-cor');
    if (corEl) corEl.value = localStorage.getItem('rel_cor_default') || '#2563eb';
    // Restaura preview do logo
    const savedLogo = localStorage.getItem('rel_logo_data');
    if (savedLogo) {
      const img = document.getElementById('rel-logo-img');
      const prev = document.getElementById('rel-logo-preview');
      if (img && prev) { img.src = savedLogo; prev.style.display = 'block'; }
    }
  };

  window.loadRelLogo = function(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    if (file.size > 500*1024) {
      toast('Logo muito grande. Use uma imagem com menos de 500KB.', 'warning');
      ev.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const data = e.target.result;
      try {
        localStorage.setItem('rel_logo_data', data);
      } catch(err) {
        toast('Não foi possível salvar o logo (storage cheio)', 'error');
        return;
      }
      const img = document.getElementById('rel-logo-img');
      const prev = document.getElementById('rel-logo-preview');
      if (img && prev) { img.src = data; prev.style.display = 'block'; }
      toast('✓ Logo carregado', 'success');
    };
    reader.readAsDataURL(file);
  };

  window.clearRelLogo = function() {
    localStorage.removeItem('rel_logo_data');
    const inp = document.getElementById('rel-logo');
    const prev = document.getElementById('rel-logo-preview');
    if (inp) inp.value = '';
    if (prev) prev.style.display = 'none';
    toast('Logo removido', 'info');
  };

  window.generatePrintReport = function() {
    // ── Coleta opções ──
    const titulo    = (document.getElementById('rel-titulo').value    || 'Cronograma de Projetos').trim();
    const subtitulo = (document.getElementById('rel-subtitulo').value || '').trim();
    const cliente   = (document.getElementById('rel-cliente').value   || '').trim();
    const preparado = (document.getElementById('rel-preparado').value || '').trim();
    const dataRel   = document.getElementById('rel-data').value || todayISO();
    const corDest   = document.getElementById('rel-cor').value || '#2563eb';
    const orient    = document.getElementById('rel-orient').value || 'landscape';
    const asgNome   = (document.getElementById('rel-assinatura-nome').value  || '').trim();
    const asgCargo  = (document.getElementById('rel-assinatura-cargo').value || '').trim();
    const logoData  = localStorage.getItem('rel_logo_data') || '';

    const incCapa   = document.getElementById('rel-sec-capa').checked;
    const incToc    = document.getElementById('rel-sec-toc').checked;
    const incResumo = document.getElementById('rel-sec-resumo').checked;
    const incGantt  = document.getElementById('rel-sec-gantt').checked;
    const incTabela = document.getElementById('rel-sec-tabela').checked;
    const incRodape = document.getElementById('rel-sec-rodape').checked;

    // Salva defaults para próxima vez
    if (preparado) localStorage.setItem('rel_preparado_default', preparado);
    if (cliente)   localStorage.setItem('rel_cliente_default', cliente);
    if (asgNome)   localStorage.setItem('rel_assinatura_nome', asgNome);
    if (asgCargo)  localStorage.setItem('rel_assinatura_cargo', asgCargo);
    if (corDest)   localStorage.setItem('rel_cor_default', corDest);

    // ── Filtra atividades pelos projetos selecionados ──
    const selEl = document.getElementById('rel-projetos');
    const projsSelecionados = [...selEl.selectedOptions].map(o => o.value);
    let acts = projsSelecionados.length
      ? activities.filter(a => projsSelecionados.includes(a.project))
      : [...activities];

    if (!acts.length) {
      toast('Nenhuma atividade encontrada para gerar o relatório', 'warning');
      return;
    }

    // Ordena por projeto + data início
    acts.sort((a,b) => {
      const pc = (a.project||'').localeCompare(b.project||'');
      if (pc !== 0) return pc;
      return (a.startDate||'').localeCompare(b.startDate||'');
    });

    // ── KPIs ──
    const total      = acts.length;
    const concluidas = acts.filter(a => a.status === 'Concluído').length;
    const vencidas   = acts.filter(a => diffDays(a.dueDate) < 0 && a.status !== 'Concluído').length;
    const emAndam    = acts.filter(a => a.status === 'Em Andamento' || a.status === 'Em andamento').length;
    const pctConcl   = total ? Math.round((concluidas/total)*100) : 0;
    const projetosUnq = [...new Set(acts.map(a => a.project).filter(Boolean))];

    // ── Datas para o Gantt ──
    const allDates = acts.flatMap(a => [a.startDate, a.dueDate].filter(Boolean)).sort();
    const minDate  = allDates.length ? new Date(allDates[0] + 'T00:00:00') : new Date();
    const maxDate  = allDates.length ? new Date(allDates[allDates.length-1] + 'T00:00:00') : new Date();
    minDate.setDate(minDate.getDate() - 3);
    maxDate.setDate(maxDate.getDate() + 7);
    const totalDays = Math.max(1, Math.round((maxDate - minDate) / 86400000));

    // Largura disponível em mm para Gantt (A4 paisagem = 297mm, margens ~15mm cada lado, label ~75mm)
    const ganttWidthMM = orient === 'landscape' ? 195 : 100;
    const dayWmm = ganttWidthMM / totalDays;

    // Header de meses + anos
    let monthsHtml = '';
    let yearsHtml = '';
    let cur = new Date(minDate);
    const yearWidths = {};
    while (cur < maxDate) {
      const start = new Date(cur);
      const end   = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
      const days  = Math.max(1, Math.round((Math.min(end, maxDate) - start) / 86400000));
      const w     = days * dayWmm;
      const monthName = start.toLocaleDateString('pt-BR',{month:'long'}).toUpperCase();
      monthsHtml += `<div class="rel-gantt-month" style="width:${w}mm">${monthName}</div>`;
      yearWidths[start.getFullYear()] = (yearWidths[start.getFullYear()] || 0) + w;
      cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
    }
    Object.entries(yearWidths).forEach(([year, w]) => {
      yearsHtml += `<div class="rel-gantt-year" style="width:${w}mm">${year}</div>`;
    });

    // Bandas de fim de semana (faixas verticais sutis)
    let weekendBandsHtml = '';
    const cursor = new Date(minDate);
    for (let i = 0; i < totalDays; i++) {
      const dow = cursor.getDay();
      if (dow === 0 || dow === 6) {
        weekendBandsHtml += `<div class="rel-weekend-band" style="left:${i * dayWmm}mm;width:${dayWmm}mm"></div>`;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Linha de hoje
    const today = new Date(todayISO() + 'T00:00:00');
    const todayInRange = today >= minDate && today <= maxDate;
    const todayLeftMM = todayInRange ? Math.round((today - minDate) / 86400000) * dayWmm : -1;

    // Data formatada por extenso (estilo brasileiro)
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const dRel = new Date(dataRel + 'T00:00:00');
    const dataLongFmt = `${String(dRel.getDate()).padStart(2,'0')} de ${meses[dRel.getMonth()]} de ${dRel.getFullYear()}`;

    // Referência do documento
    const docRef = `REL-${dRel.getFullYear()}${String(dRel.getMonth()+1).padStart(2,'0')}${String(dRel.getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*900)+100)}`;

    // ── Numeração dinâmica de seções (só conta as que estão ativas) ──
    const secList = [];
    if (incResumo) secList.push({ id: 'sec-resumo', titulo: 'Resumo Executivo',     sub: 'Visão Geral do Portfólio' });
    if (incGantt)  secList.push({ id: 'sec-gantt',  titulo: 'Cronograma Visual',    sub: 'Diagrama de Gantt' });
    if (incTabela) secList.push({ id: 'sec-tabela', titulo: 'Detalhamento por Projeto', sub: 'Lista de Atividades' });
    function secNum(id) {
      const i = secList.findIndex(s => s.id === id);
      return i >= 0 ? String(i+1).padStart(2,'0') : '';
    }

    // ── Linhas do Gantt ──
    const ganttRows = acts.map((a, i) => {
      const sd_d = new Date((a.startDate || a.dueDate) + 'T00:00:00');
      const ed_d = new Date((a.dueDate   || a.startDate) + 'T00:00:00');
      const left = Math.max(0, Math.round((sd_d - minDate) / 86400000)) * dayWmm;
      const bw   = Math.max(0.8, Math.round((ed_d - sd_d) / 86400000 + 1)) * dayWmm;
      const pct  = a.progress || 0;
      const isDone = a.status === 'Concluído';
      const isOver = diffDays(a.dueDate) < 0 && !isDone;
      const color = isOver ? '#dc2626' : isDone ? '#16a34a' : (typeof projColor === 'function' ? projColor(a.project) : corDest);
      const rowBg = i % 2 === 0 ? '#fafafa' : '#ffffff';

      return `<tr>
        <td class="rel-cell-num">${String(i+1).padStart(2,'0')}</td>
        <td class="rel-cell-desc"><strong>${esc(a.description)}</strong><br><span class="rel-cell-meta">${esc(a.project||'—')} · ${esc(a.responsible||'—')}</span></td>
        <td class="rel-cell-date">${fmtDate(a.startDate)}</td>
        <td class="rel-cell-date">${fmtDate(a.dueDate)}</td>
        <td class="rel-cell-pct">${pct}%</td>
        <td class="rel-cell-bar">
          <div class="rel-bar-bg" style="width:${ganttWidthMM}mm">
            ${weekendBandsHtml}
            ${todayInRange ? `<div class="rel-today-line" style="left:${todayLeftMM}mm"></div>` : ''}
            <div class="rel-bar" style="left:${left}mm;width:${bw}mm;background:${color}">
              ${pct > 0 ? `<div class="rel-bar-progress" style="width:${pct}%"></div>` : ''}
            </div>
          </div>
        </td>
      </tr>`;
    }).join('');

    // ── Linhas da tabela detalhada (agrupada por projeto) ──
    const grupos = {};
    acts.forEach(a => {
      const k = a.project || 'Sem projeto';
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(a);
    });

    const tabelaHtml = Object.entries(grupos).map(([proj, items]) => {
      const projConcl = items.filter(a => a.status === 'Concluído').length;
      const projPct = Math.round((projConcl / items.length) * 100);
      const projColor2 = typeof projColor === 'function' ? projColor(proj) : corDest;

      const linhas = items.map(a => {
        const isDone = a.status === 'Concluído';
        const isOver = diffDays(a.dueDate) < 0 && !isDone;
        const statusColor = isDone ? '#16a34a' : isOver ? '#dc2626' : '#2563eb';
        return `<tr>
          <td>${esc(a.description)}</td>
          <td style="white-space:nowrap">${esc(a.responsible||'—')}</td>
          <td style="white-space:nowrap">${fmtDate(a.startDate)}</td>
          <td style="white-space:nowrap">${fmtDate(a.dueDate)}</td>
          <td><span class="rel-status" style="background:${statusColor}1a;color:${statusColor};border:1px solid ${statusColor}40">${esc(a.status||'—')}</span></td>
          <td style="text-align:right;white-space:nowrap"><strong>${a.progress||0}%</strong></td>
        </tr>`;
      }).join('');

      return `<div class="rel-grupo">
        <div class="rel-grupo-header" style="border-left:5px solid ${projColor2}">
          <span class="rel-grupo-nome">${esc(proj)}</span>
          <span class="rel-grupo-stats">${items.length} atividade${items.length!==1?'s':''} · ${projConcl} concluída${projConcl!==1?'s':''} · <strong>${projPct}%</strong></span>
        </div>
        <table class="rel-tabela">
          <thead>
            <tr>
              <th style="width:40%">Atividade</th>
              <th>Responsável</th>
              <th>Início</th>
              <th>Término</th>
              <th>Status</th>
              <th style="text-align:right">Progresso</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
    }).join('');

    // ── Monta HTML completo do relatório ──
    const dataFmt = fmtDate(dataRel);
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${esc(titulo)}${cliente ? ' — ' + esc(cliente) : ''}</title>
<style>
@page {
  size: A4 ${orient};
  margin: 18mm 14mm 18mm 14mm;
  ${incRodape ? `@bottom-left { content: "${esc(titulo).replace(/"/g,'')}"; font-family: Helvetica, Arial, sans-serif; font-size: 7pt; color: #94a3b8; }
  @bottom-center { content: counter(page) " / " counter(pages); font-family: Helvetica, Arial, sans-serif; font-size: 7pt; color: #94a3b8; }
  @bottom-right { content: "${dataFmt}"; font-family: Helvetica, Arial, sans-serif; font-size: 7pt; color: #94a3b8; }` : ''}
}
@page :first {
  ${incCapa ? `margin: 0;
  @bottom-left { content: ""; }
  @bottom-center { content: ""; }
  @bottom-right { content: ""; }` : ''}
}
@media print {
  .no-print { display: none !important; }
  .capa, .toc-page, .section, * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
}

* {
  box-sizing: border-box;
  margin: 0; padding: 0;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  color-adjust: exact !important;
}
html, body {
  background: #fff;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
body {
  font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: #0f172a;
  font-size: 9pt;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
.serif { font-family: Georgia, "Times New Roman", serif; }

.no-print {
  position: fixed; top: 0; left: 0; right: 0;
  background: #0f172a; color: #fff;
  padding: 14px 24px;
  font-size: 13px; font-weight: 500;
  z-index: 9999;
  display: flex; align-items: center; gap: 16px;
  box-shadow: 0 4px 16px rgba(0,0,0,.3);
  border-bottom: 3px solid ${corDest};
}
.no-print-icon {
  font-size: 22px;
}
.no-print-text { flex: 1; line-height: 1.4; }
.no-print-text strong { color: ${corDest}; font-weight: 700; }
.no-print-btn {
  background: ${corDest}; color: #fff;
  padding: 10px 20px; border: none; border-radius: 4px;
  font-size: 13px; font-weight: 700; cursor: pointer;
  letter-spacing: .04em; text-transform: uppercase;
  white-space: nowrap;
}
.no-print-btn:hover { background: #fff; color: ${corDest}; }
body.has-banner { padding-top: 70px; }
@media print { body.has-banner { padding-top: 0; } }

/* ═══════════════════════════════════════
   CAPA
═══════════════════════════════════════ */
.capa {
  page-break-after: always;
  position: relative;
  width: ${orient === 'landscape' ? '297mm' : '210mm'};
  height: ${orient === 'landscape' ? '210mm' : '297mm'};
  padding: 0;
  overflow: hidden;
  background: #fff;
}
.capa-side {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  width: ${orient === 'landscape' ? '90mm' : '70mm'};
  background: #0f172a;
  color: #fff;
  padding: 30mm 16mm;
  display: flex; flex-direction: column; justify-content: space-between;
}
.capa-side::before {
  content: '';
  position: absolute;
  top: 0; right: 0; width: 6mm; height: 100%;
  background: ${corDest};
}
.capa-monogram {
  font-family: Georgia, serif;
  font-size: 48pt;
  font-weight: 400;
  color: ${corDest};
  line-height: 1;
  letter-spacing: -.02em;
}
.capa-side-info {
  font-size: 7.5pt;
  color: rgba(255,255,255,.6);
  letter-spacing: .08em;
  text-transform: uppercase;
  line-height: 1.8;
}
.capa-side-info strong {
  display: block;
  color: #fff;
  font-size: 9pt;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  margin-top: 1mm;
}
.capa-side-divider {
  height: 0.5mm; width: 16mm; background: ${corDest}; margin: 4mm 0;
}

.capa-main {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  left: ${orient === 'landscape' ? '90mm' : '70mm'};
  padding: 30mm 22mm 24mm 22mm;
  display: flex; flex-direction: column; justify-content: space-between;
  background: #fff;
}
.capa-eyebrow {
  font-size: 7.5pt; font-weight: 700; text-transform: uppercase;
  letter-spacing: .25em; color: ${corDest}; margin-bottom: 14mm;
  position: relative; padding-left: 14mm;
}
.capa-eyebrow::before {
  content: ''; position: absolute; left: 0; top: 50%;
  width: 10mm; height: 1px; background: ${corDest};
}
.capa-titulo {
  font-family: Georgia, "Times New Roman", serif;
  font-size: ${orient === 'landscape' ? '36pt' : '42pt'};
  font-weight: 400;
  color: #0f172a;
  line-height: 1.05;
  letter-spacing: -.015em;
  margin-bottom: 8mm;
}
.capa-subtitulo {
  font-size: 12pt;
  color: #475569;
  font-weight: 300;
  line-height: 1.4;
  max-width: 140mm;
  border-top: 1px solid #e2e8f0;
  padding-top: 6mm;
  margin-top: 4mm;
}
.capa-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8mm 12mm;
  margin-top: auto;
  padding-top: 16mm;
  border-top: 1px solid #e2e8f0;
}
.capa-meta-item {
  font-size: 8pt;
}
.capa-meta-label {
  text-transform: uppercase;
  letter-spacing: .12em;
  color: #94a3b8;
  font-size: 6.5pt;
  font-weight: 600;
  margin-bottom: 1.5mm;
}
.capa-meta-value {
  color: #0f172a;
  font-size: 11pt;
  font-weight: 500;
}

/* ═══════════════════════════════════════
   CABEÇALHO DE SEÇÃO
═══════════════════════════════════════ */
.section { margin-bottom: 12mm; page-break-inside: avoid; }
.section-hd {
  display: flex; align-items: baseline; gap: 6mm;
  margin-bottom: 8mm;
  border-bottom: 1px solid #0f172a;
  padding-bottom: 3mm;
}
.section-num {
  font-family: Georgia, serif;
  font-size: 22pt;
  font-weight: 400;
  color: ${corDest};
  line-height: 1;
}
.section-titulo {
  font-family: Georgia, serif;
  font-size: 16pt;
  font-weight: 400;
  color: #0f172a;
  letter-spacing: -.01em;
}
.section-sub {
  margin-left: auto;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: .15em;
  color: #94a3b8;
  font-weight: 600;
}

/* ═══════════════════════════════════════
   KPIs
═══════════════════════════════════════ */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0;
  border: 1px solid #e2e8f0;
  border-radius: 1mm;
  overflow: hidden;
}
.kpi-card {
  padding: 6mm 5mm;
  border-right: 1px solid #e2e8f0;
  position: relative;
  background: #fff;
}
.kpi-card:last-child { border-right: 0; }
.kpi-card::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 1mm;
  background: #cbd5e1;
}
.kpi-card.is-accent::before { background: ${corDest}; }
.kpi-card.is-success::before { background: #16a34a; }
.kpi-card.is-warning::before { background: #d97706; }
.kpi-card.is-danger::before { background: #dc2626; }
.kpi-label {
  font-size: 7pt;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #94a3b8;
  font-weight: 700;
  margin-bottom: 3mm;
}
.kpi-value {
  font-family: Georgia, serif;
  font-size: 26pt;
  font-weight: 400;
  color: #0f172a;
  line-height: 1;
  letter-spacing: -.02em;
}
.kpi-card.is-accent .kpi-value { color: ${corDest}; }
.kpi-card.is-success .kpi-value { color: #16a34a; }
.kpi-card.is-warning .kpi-value { color: #d97706; }
.kpi-card.is-danger .kpi-value { color: #dc2626; }

.progress-block {
  margin-top: 8mm;
  padding: 6mm 7mm;
  background: #f8fafc;
  border-left: 3px solid ${corDest};
}
.progress-block-label {
  font-size: 7pt;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: #64748b;
  font-weight: 700;
  margin-bottom: 3mm;
}
.progress-block-bar {
  display: flex; align-items: center; gap: 6mm;
}
.progress-bar-track {
  flex: 1;
  height: 4mm;
  background: #e2e8f0;
  border-radius: 0;
  overflow: hidden;
}
.progress-bar-fill {
  height: 100%;
  background: ${corDest};
}
.progress-bar-pct {
  font-family: Georgia, serif;
  font-size: 18pt;
  font-weight: 400;
  color: ${corDest};
  min-width: 22mm;
  text-align: right;
  line-height: 1;
}

/* ═══════════════════════════════════════
   GANTT
═══════════════════════════════════════ */
.rel-gantt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 7.5pt;
  border: 1px solid #cbd5e1;
}
.rel-gantt-table thead th {
  background: #0f172a;
  color: #fff;
  padding: 2.8mm 2mm;
  font-weight: 600;
  font-size: 7pt;
  text-transform: uppercase;
  letter-spacing: .08em;
  border-right: 1px solid #1e293b;
  text-align: left;
  vertical-align: bottom;
}
.rel-gantt-table thead th:last-child { border-right: 0; padding: 0; }
.rel-gantt-table tbody td {
  border-bottom: 1px solid #f1f5f9;
  border-right: 1px solid #f1f5f9;
  padding: 2.5mm 2mm;
  vertical-align: middle;
}
.rel-gantt-table tbody tr:nth-child(even) td { background: #fafbfc; }
.rel-gantt-table tbody tr:last-child td { border-bottom: 1px solid #cbd5e1; }

.rel-cell-num {
  width: 9mm;
  text-align: center;
  color: #94a3b8;
  font-size: 7pt;
  font-family: Georgia, serif;
  font-weight: 400;
}
.rel-cell-desc { width: 60mm; max-width: 60mm; overflow: hidden; }
.rel-cell-desc strong {
  font-size: 8pt;
  color: #0f172a;
  font-weight: 600;
  display: block;
  letter-spacing: -.01em;
}
.rel-cell-meta {
  font-size: 6.5pt;
  color: #94a3b8;
  font-weight: 400;
  letter-spacing: .02em;
}
.rel-cell-date {
  width: 18mm;
  font-size: 7pt;
  color: #475569;
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.rel-cell-pct {
  width: 12mm;
  font-size: 7.5pt;
  text-align: right;
  font-weight: 600;
  color: #0f172a;
  font-variant-numeric: tabular-nums;
  font-family: Georgia, serif;
}
.rel-cell-bar { padding: 0 !important; border-right: 0 !important; }

.rel-bar-bg {
  position: relative;
  height: 8mm;
  background: #fff;
}
.rel-weekend-band {
  position: absolute;
  top: 0; bottom: 0;
  background: #f1f5f9;
  pointer-events: none;
}
.rel-bar {
  position: absolute;
  top: 2mm;
  height: 4mm;
  border-radius: 0.5mm;
  min-width: 0.6mm;
  box-shadow: 0 0.3mm 0.8mm rgba(15,23,42,.18);
  overflow: hidden;
  z-index: 2;
}
.rel-bar-progress {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: rgba(255,255,255,.42);
  border-right: 0.3mm solid rgba(255,255,255,.85);
}
.rel-today-line {
  position: absolute;
  top: -1mm; bottom: -1mm;
  width: 0.4mm;
  background: #dc2626;
  z-index: 3;
}
.rel-today-line::after {
  content: 'HOJE';
  position: absolute;
  top: -2mm; left: 50%;
  transform: translateX(-50%);
  font-size: 5pt;
  font-weight: 700;
  color: #dc2626;
  background: #fff;
  padding: 0 1mm;
  letter-spacing: .05em;
}

.rel-gantt-years {
  display: flex;
  background: #1e293b;
  border-bottom: 1px solid #334155;
}
.rel-gantt-year {
  font-size: 7pt;
  font-weight: 700;
  color: #fff;
  padding: 1.2mm 0;
  text-align: center;
  letter-spacing: .15em;
  border-right: 1px solid #334155;
  font-family: Georgia, serif;
}
.rel-gantt-year:last-child { border-right: 0; }
.rel-gantt-months {
  display: flex;
  background: #f8fafc;
}
.rel-gantt-month {
  font-size: 6pt;
  font-weight: 700;
  color: #475569;
  padding: 1.5mm 1mm;
  border-right: 1px solid #e2e8f0;
  text-align: center;
  letter-spacing: .08em;
}
.rel-gantt-month:last-child { border-right: 0; }

.rel-legenda {
  display: flex;
  gap: 8mm;
  margin-top: 5mm;
  padding: 3mm 4mm;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 7pt;
  color: #475569;
  flex-wrap: wrap;
  align-items: center;
}
.rel-legenda-titulo {
  font-size: 6.5pt;
  text-transform: uppercase;
  letter-spacing: .1em;
  color: #94a3b8;
  font-weight: 700;
}
.rel-legenda-item {
  display: flex;
  align-items: center;
  gap: 2mm;
}
.rel-legenda-cor {
  display: inline-block;
  width: 5mm;
  height: 2.5mm;
  border-radius: 0.5mm;
}

/* ═══════════════════════════════════════
   TABELA DETALHADA
═══════════════════════════════════════ */
.rel-grupo {
  margin-bottom: 8mm;
  page-break-inside: avoid;
}
.rel-grupo-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4mm 5mm;
  background: #0f172a;
  color: #fff;
  border-left: 4mm solid ${corDest};
}
.rel-grupo-nome {
  font-family: Georgia, serif;
  font-size: 12pt;
  font-weight: 400;
  letter-spacing: -.01em;
}
.rel-grupo-stats {
  font-size: 7.5pt;
  color: rgba(255,255,255,.7);
  text-transform: uppercase;
  letter-spacing: .06em;
}
.rel-grupo-stats strong {
  color: #fff;
  font-weight: 700;
  font-size: 9pt;
  font-family: Georgia, serif;
  letter-spacing: 0;
}
.rel-tabela {
  width: 100%;
  border-collapse: collapse;
  font-size: 8pt;
  border: 1px solid #e2e8f0;
  border-top: 0;
}
.rel-tabela thead th {
  background: #f8fafc;
  color: #64748b;
  padding: 2.5mm 3mm;
  font-size: 6.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
  border-bottom: 1px solid #cbd5e1;
  text-align: left;
}
.rel-tabela tbody td {
  padding: 2.5mm 3mm;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}
.rel-tabela tbody tr:last-child td { border-bottom: 0; }
.rel-status {
  display: inline-block;
  padding: 0.5mm 2.5mm;
  border-radius: 0;
  font-size: 6pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
}

/* ═══════════════════════════════════════
   LOGO NA CAPA
═══════════════════════════════════════ */
.capa-logo-wrap {
  background: #fff;
  padding: 6mm 8mm;
  border-radius: 1mm;
  display: inline-block;
  margin-bottom: 6mm;
  max-width: 60mm;
}
.capa-logo-img {
  max-width: 100%;
  max-height: 22mm;
  object-fit: contain;
  display: block;
}

/* ═══════════════════════════════════════
   SUMÁRIO (TOC)
═══════════════════════════════════════ */
.toc-page { page-break-after: always; padding-top: 6mm; }
.toc-titulo {
  font-family: Georgia, serif;
  font-size: 28pt;
  font-weight: 400;
  color: #0f172a;
  letter-spacing: -.02em;
  margin-bottom: 2mm;
}
.toc-eyebrow {
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: .25em;
  color: ${corDest};
  font-weight: 700;
  margin-bottom: 4mm;
  position: relative;
  padding-left: 14mm;
}
.toc-eyebrow::before {
  content: '';
  position: absolute;
  left: 0; top: 50%;
  width: 10mm; height: 1px;
  background: ${corDest};
}
.toc-divider {
  height: 1px;
  background: #0f172a;
  margin: 8mm 0 12mm 0;
}
.toc-list { list-style: none; padding: 0; margin: 0; }
.toc-item {
  display: flex;
  align-items: baseline;
  padding: 5mm 0;
  border-bottom: 1px dotted #cbd5e1;
  gap: 6mm;
}
.toc-item:last-child { border-bottom: 0; }
.toc-num {
  font-family: Georgia, serif;
  font-size: 20pt;
  font-weight: 400;
  color: ${corDest};
  width: 18mm;
  flex-shrink: 0;
  line-height: 1;
}
.toc-text { flex: 1; }
.toc-text-titulo {
  font-family: Georgia, serif;
  font-size: 14pt;
  color: #0f172a;
  font-weight: 400;
  margin-bottom: 1mm;
  letter-spacing: -.01em;
}
.toc-text-sub {
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: #94a3b8;
  font-weight: 600;
}
.toc-dots {
  flex: 0 1 auto;
  border-bottom: 1px dotted #94a3b8;
  height: 1px;
  align-self: center;
  min-width: 20mm;
}

/* ═══════════════════════════════════════
   ASSINATURA
═══════════════════════════════════════ */
.assinatura-block {
  margin-top: 16mm;
  page-break-inside: avoid;
}
.assinatura-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16mm;
  max-width: 180mm;
}
.assinatura-item {
  text-align: center;
}
.assinatura-linha {
  height: 0.4mm;
  background: #0f172a;
  margin-bottom: 3mm;
}
.assinatura-nome {
  font-family: Georgia, serif;
  font-size: 11pt;
  font-weight: 400;
  color: #0f172a;
  letter-spacing: -.01em;
}
.assinatura-cargo {
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: .12em;
  color: #64748b;
  font-weight: 600;
  margin-top: 1mm;
}
.assinatura-local {
  text-align: right;
  font-size: 8.5pt;
  color: #475569;
  margin-bottom: 12mm;
  font-style: italic;
}

/* ═══════════════════════════════════════
   QUEBRAS
═══════════════════════════════════════ */
.page-break { page-break-before: always; }
</style>
</head>
<body class="has-banner">

<div class="no-print">
  <div class="no-print-icon">📄</div>
  <div class="no-print-text">
    <strong>Importante:</strong> ao imprimir, clique em <strong>"Mais configurações"</strong> e <strong>marque a opção "Gráficos de fundo"</strong> — caso contrário as cores não aparecem no PDF.
  </div>
  <button class="no-print-btn" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
</div>

${incCapa ? `
<!-- ═══════════ CAPA ═══════════ -->
<div class="capa">
  <div class="capa-side">
    <div>
      ${logoData
        ? `<div class="capa-logo-wrap"><img src="${logoData}" class="capa-logo-img" alt="Logo"/></div>`
        : `<div class="capa-monogram">P</div>`}
      <div class="capa-side-divider"></div>
      <div class="capa-side-info" style="color:rgba(255,255,255,.85);font-weight:600;letter-spacing:.05em">
        ${preparado ? esc(preparado).split(' ').slice(0,3).join(' ') : 'Project<br>Management'}
      </div>
    </div>
    <div class="capa-side-info">
      Documento<strong>${docRef}</strong>
      <br><br>
      Confidencial<strong>Uso restrito</strong>
    </div>
  </div>

  <div class="capa-main">
    <div>
      <div class="capa-eyebrow">Relatório de Cronograma</div>
      <h1 class="capa-titulo">${esc(titulo)}</h1>
      ${subtitulo ? `<div class="capa-subtitulo">${esc(subtitulo)}</div>` : ''}
    </div>

    <div class="capa-meta-grid">
      ${cliente ? `
      <div class="capa-meta-item">
        <div class="capa-meta-label">Preparado para</div>
        <div class="capa-meta-value">${esc(cliente)}</div>
      </div>` : ''}
      ${preparado ? `
      <div class="capa-meta-item">
        <div class="capa-meta-label">Preparado por</div>
        <div class="capa-meta-value">${esc(preparado)}</div>
      </div>` : ''}
      <div class="capa-meta-item">
        <div class="capa-meta-label">Data de Emissão</div>
        <div class="capa-meta-value">${dataLongFmt}</div>
      </div>
      <div class="capa-meta-item">
        <div class="capa-meta-label">Escopo</div>
        <div class="capa-meta-value">${projetosUnq.length} projeto${projetosUnq.length!==1?'s':''} · ${total} atividade${total!==1?'s':''}</div>
      </div>
    </div>
  </div>
</div>
` : ''}

${incCapa && incToc && secList.length > 0 ? `
<!-- ═══════════ SUMÁRIO ═══════════ -->
<div class="toc-page">
  <div class="toc-eyebrow">Sumário</div>
  <h1 class="toc-titulo">${esc(titulo)}</h1>
  <div style="font-size:9pt;color:#64748b">${dataLongFmt}${cliente ? ' · ' + esc(cliente) : ''}</div>
  <div class="toc-divider"></div>
  <ul class="toc-list">
    ${secList.map(s => `
      <li class="toc-item">
        <span class="toc-num">${secNum(s.id)}</span>
        <div class="toc-text">
          <div class="toc-text-titulo">${esc(s.titulo)}</div>
          <div class="toc-text-sub">${esc(s.sub)}</div>
        </div>
      </li>
    `).join('')}
  </ul>
</div>
` : ''}

${incResumo ? `
<!-- ═══════════ RESUMO ═══════════ -->
<div class="section">
  <div class="section-hd">
    <div class="section-num">${secNum('sec-resumo')}</div>
    <div class="section-titulo">Resumo Executivo</div>
    <div class="section-sub">Visão Geral do Portfólio</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi-card is-accent">
      <div class="kpi-label">Projetos</div>
      <div class="kpi-value">${projetosUnq.length}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Atividades</div>
      <div class="kpi-value">${total}</div>
    </div>
    <div class="kpi-card is-success">
      <div class="kpi-label">Concluídas</div>
      <div class="kpi-value">${concluidas}</div>
    </div>
    <div class="kpi-card is-warning">
      <div class="kpi-label">Em Andamento</div>
      <div class="kpi-value">${emAndam}</div>
    </div>
    <div class="kpi-card is-danger">
      <div class="kpi-label">Vencidas</div>
      <div class="kpi-value">${vencidas}</div>
    </div>
  </div>
  <div class="progress-block">
    <div class="progress-block-label">Progresso geral do portfólio</div>
    <div class="progress-block-bar">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pctConcl}%"></div>
      </div>
      <div class="progress-bar-pct">${pctConcl}%</div>
    </div>
  </div>
</div>
` : ''}

${incGantt ? `
<!-- ═══════════ GANTT ═══════════ -->
<div class="section ${incResumo ? '' : ''}">
  <div class="section-hd">
    <div class="section-num">${secNum('sec-gantt')}</div>
    <div class="section-titulo">Cronograma Visual</div>
    <div class="section-sub">Diagrama de Gantt</div>
  </div>
  <table class="rel-gantt-table">
    <thead>
      <tr>
        <th>Nº</th>
        <th>Atividade</th>
        <th style="text-align:center">Início</th>
        <th style="text-align:center">Término</th>
        <th style="text-align:right">%</th>
        <th>
          <div class="rel-gantt-years">${yearsHtml}</div>
          <div class="rel-gantt-months">${monthsHtml}</div>
        </th>
      </tr>
    </thead>
    <tbody>${ganttRows}</tbody>
  </table>
  <div class="rel-legenda">
    <div class="rel-legenda-titulo">Legenda</div>
    <div class="rel-legenda-item"><span class="rel-legenda-cor" style="background:${corDest}"></span> Em andamento</div>
    <div class="rel-legenda-item"><span class="rel-legenda-cor" style="background:#16a34a"></span> Concluída</div>
    <div class="rel-legenda-item"><span class="rel-legenda-cor" style="background:#dc2626"></span> Vencida</div>
    <div class="rel-legenda-item"><span class="rel-legenda-cor" style="background:#f1f5f9;border:0.3mm solid #cbd5e1"></span> Fim de semana</div>
    <div class="rel-legenda-item"><span style="display:inline-block;width:0.5mm;height:3mm;background:#dc2626;vertical-align:middle"></span> Linha de hoje</div>
  </div>
</div>
` : ''}

${incTabela ? `
<!-- ═══════════ TABELA DETALHADA ═══════════ -->
<div class="section page-break">
  <div class="section-hd">
    <div class="section-num">${secNum('sec-tabela')}</div>
    <div class="section-titulo">Detalhamento por Projeto</div>
    <div class="section-sub">Lista de Atividades</div>
  </div>
  ${tabelaHtml}
</div>
` : ''}

${(asgNome || asgCargo) ? `
<!-- ═══════════ ASSINATURA ═══════════ -->
<div class="assinatura-block">
  <div class="assinatura-local">${cliente ? esc(cliente.split(',')[0]) + ', ' : ''}${dataLongFmt}</div>
  <div class="assinatura-grid">
    <div class="assinatura-item">
      <div class="assinatura-linha"></div>
      <div class="assinatura-nome">${esc(asgNome || preparado || '—')}</div>
      <div class="assinatura-cargo">${esc(asgCargo || 'Responsável')}</div>
    </div>
    <div class="assinatura-item">
      <div class="assinatura-linha"></div>
      <div class="assinatura-nome">${esc(cliente || '—')}</div>
      <div class="assinatura-cargo">Cliente — Ciente e de acordo</div>
    </div>
  </div>
</div>
` : ''}

</body>
</html>`;

    // ── Abre nova janela e imprime ──
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) {
      toast('Pop-up bloqueado! Permita pop-ups para gerar o relatório.', 'error');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();

    // NÃO dispara print automaticamente — usuário precisa ler instruções
    // sobre habilitar "Gráficos de fundo" e clicar no botão.
    win.onload = () => { try { win.focus(); } catch(e) {} };

    toast('✓ Relatório aberto em nova aba. Leia as instruções e clique em "Imprimir / Salvar PDF".', 'success');
  };

  window.renderGantt = function(){
    const wrap = document.getElementById('gantt-wrap'); if (!wrap) return;

    /* Sincroniza estado visual do botão de agrupamento */
    const grpBtn = document.getElementById('gantt-group-btn');
    if (grpBtn) grpBtn.classList.toggle('active', localStorage.getItem('gantt_group_by_project') === '1');

    /* ── Popula selects ── */
    const fpEl = document.getElementById('gantt-f-project');
    const frEl = document.getElementById('gantt-f-resp');
    if (fpEl && fpEl.options.length <= 1) {
      [...new Set(activities.map(a=>a.project).filter(Boolean))].sort().forEach(p=>{
        const o=document.createElement('option'); o.value=p; o.textContent=p; fpEl.appendChild(o);
      });
    }
    if (frEl && frEl.options.length <= 1) {
      [...new Set(activities.map(a=>a.responsible).filter(Boolean))].sort().forEach(r=>{
        const o=document.createElement('option'); o.value=r; o.textContent=r; frEl.appendChild(o);
      });
    }

    /* ── Filtros ── */
    const fSearch  = (document.getElementById('gantt-f-search')?.value  || '').toLowerCase();
    const fProject = document.getElementById('gantt-f-project')?.value  || '';
    const fStatus  = document.getElementById('gantt-f-status')?.value   || '';
    const fResp    = document.getElementById('gantt-f-resp')?.value     || '';

    /* ── Gera WBS hierárquico para TODAS as atividades ── */
    function buildWBS(list) {
      // monta árvore com WBS recursivo
      const byId = {};
      list.forEach(a => byId[a.id] = {...a});
      const roots = list.filter(a => !a.parentId || !byId[a.parentId]);
      const result = [];
      let rootIdx = 0;
      function walk(node, prefix) {
        const wbs = prefix;
        result.push({...node, _wbs: wbs});
        const children = list.filter(c => c.parentId === node.id);
        children.forEach((child, ci) => walk(child, prefix + '.' + (ci+1)));
      }
      roots.forEach((r, ri) => {
        rootIdx++;
        walk(r, String(rootIdx));
      });
      // Orphans (parentId aponta para id fora da lista filtrada)
      const inResult = new Set(result.map(r=>r.id));
      list.filter(a => !inResult.has(a.id)).forEach((a, i) => {
        result.push({...a, _wbs: '?.' + (i+1)});
      });
      return result;
    }

    /* ── Aplica filtros ── */
    let allActs = [...activities].filter(a => a.startDate || a.dueDate);

    /* Ordena pais antes de filtrar para WBS correto */
    const sortField = window._ganttSort.field;
    const sortDir   = window._ganttSort.dir;
    const sortFn = {
      wbs:         (a,b) => (a.startDate||'').localeCompare(b.startDate||''),
      description: (a,b) => (a.description||'').localeCompare(b.description||''),
      project:     (a,b) => (a.project||'').localeCompare(b.project||''),
      startDate:   (a,b) => (a.startDate||'').localeCompare(b.startDate||''),
      dueDate:     (a,b) => (a.dueDate||'').localeCompare(b.dueDate||''),
      responsible: (a,b) => (a.responsible||'').localeCompare(b.responsible||''),
    };
    if (sortFn[sortField]) {
      allActs.sort((a,b) => sortDir * sortFn[sortField](a,b));
    }

    /* Gera WBS antes de filtrar */
    const withWBS = buildWBS(allActs);

    /* Aplica filtros preservando a estrutura hierárquica */
    let filtered = withWBS.filter(a => {
      if (fSearch  && !a.description?.toLowerCase().includes(fSearch) &&
                      !a.project?.toLowerCase().includes(fSearch) &&
                      !a.responsible?.toLowerCase().includes(fSearch) &&
                      !a._wbs?.includes(fSearch)) return false;
      if (fProject && a.project     !== fProject) return false;
      if (fStatus  && a.status      !== fStatus)  return false;
      if (fResp    && a.responsible !== fResp)    return false;
      return true;
    });

    /* Contador */
    const countEl = document.getElementById('gantt-count');
    if (countEl) countEl.textContent = filtered.length > 0 ? `${filtered.length} atividade(s)` : '';
    if (!filtered.length) {
      wrap.innerHTML = '<div class="empty-state"><i class="fa-solid fa-bars-staggered"></i><p>Nenhuma atividade encontrada</p></div>';
      return;
    }

    /* ── Datas ── */
    const allDates = filtered.flatMap(a => [a.startDate, a.dueDate].filter(Boolean)).sort();
    const minDate  = new Date(allDates[0] + 'T00:00:00');
    const maxDate  = new Date(allDates[allDates.length-1] + 'T00:00:00');
    maxDate.setDate(maxDate.getDate() + 14);
    minDate.setDate(minDate.getDate() - 7);
    const totalDays = Math.max(1, Math.round((maxDate - minDate) / 86400000));
    const pxPerDay  = 5;
    const totalW    = totalDays * pxPerDay;

    document.getElementById('gantt-range').textContent =
      `${fmtDate(dataLocalISO(minDate))} → ${fmtDate(dataLocalISO(maxDate))}`;

    /* ── Header meses ── */
    let monthsHtml = '';
    let cur = new Date(minDate);
    while (cur < maxDate) {
      const start = new Date(cur);
      const end   = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
      const days  = Math.max(1, Math.round((Math.min(end, maxDate) - start) / 86400000));
      const w     = days * pxPerDay;
      monthsHtml += `<div class="gantt-month" style="width:${w}px">${start.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})}</div>`;
      cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
    }
    const todayLeft = Math.round((new Date() - minDate) / 86400000) * pxPerDay;

    /* ── Helpers de sort arrow ── */
    const sf = window._ganttSort.field;
    const sd = window._ganttSort.dir;
    function sortIcon(field) {
      if (sf !== field) return '<i class="fa-solid fa-sort" style="opacity:.25;font-size:.6rem;margin-left:3px"></i>';
      return sd > 0
        ? '<i class="fa-solid fa-sort-up" style="color:var(--blue);font-size:.6rem;margin-left:3px"></i>'
        : '<i class="fa-solid fa-sort-down" style="color:var(--blue);font-size:.6rem;margin-left:3px"></i>';
    }

    /* ── Linhas ── */
    const groupByProject = localStorage.getItem('gantt_group_by_project') === '1';
    const collapsed = window._ganttCollapsedGroups || (window._ganttCollapsedGroups = new Set());

    function renderActivityRow(a) {
      const wbs    = a._wbs || '—';
      const depth  = (wbs.match(/\./g)||[]).length;
      const isSub  = depth > 0;
      const indent = depth * 14;

      const sd_d = isoToDate(a.startDate || a.dueDate);
      const ed_d = isoToDate(a.dueDate   || a.startDate);
      const left = Math.max(0, Math.round((sd_d - minDate) / 86400000)) * pxPerDay;
      const bw   = Math.max(4, Math.round((ed_d - sd_d) / 86400000 + 1)) * pxPerDay;
      const pct  = a.progress || 0;
      const diff = diffDays(a.dueDate);

      let barColor = isSub ? 'var(--purple)' : projColor(a.project);
      if (diff < 0 && a.status !== 'Concluído') barColor = 'var(--red)';
      const opacity = a.status === 'Concluído' ? .55 : 1;
      const barStyle = `left:${left}px;width:${bw}px;background:${barColor};opacity:${opacity}`;

      const arrowHtml = isSub
        ? `<span style="color:var(--text-4);font-size:.7rem;margin-right:3px;padding-left:${indent-10}px">↳</span>`
        : '';

      const progressLayer = pct > 0
        ? `<div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:rgba(255,255,255,.28);border-radius:4px 0 0 4px;pointer-events:none"></div>`
        : '';

      const groupClass = groupByProject ? `gantt-group-row" data-group="${esc(a.project||'__sem__')}` : '';
      const hiddenStyle = groupByProject && collapsed.has(a.project||'__sem__') ? 'display:none;' : '';

      return `<tr class="${groupClass}" style="${hiddenStyle}${isSub ? 'background:rgba(124,58,237,.03)' : ''}">
        <td style="width:52px;min-width:52px;font-family:var(--font-mono);font-size:.65rem;color:${isSub?'var(--purple)':'var(--text-4)'};font-weight:${isSub?600:500};white-space:nowrap">${wbs}</td>
        <td style="min-width:220px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <div style="display:flex;align-items:center;padding-left:${indent + (groupByProject ? 16 : 0)}px">
            ${arrowHtml}
            <span style="font-weight:${isSub?500:600};color:var(--text-1);font-size:${isSub?'.77rem':'.8rem'}">${esc(a.description)}</span>
            <button class="gantt-inline-btn" onclick="event.stopPropagation();addSubactivityFromGantt('${a.id}')" title="Criar subatividade" style="margin-left:5px"><i class="fa-solid fa-plus"></i></button>
            <button class="gantt-inline-btn gantt-inline-del" onclick="event.stopPropagation();deleteAct('${a.id}')" title="Excluir atividade" style="margin-left:3px"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </td>
        <td style="min-width:100px"><span class="project-chip"><span class="project-dot" style="background:${projColor(a.project)}"></span>${esc(a.project)}</span></td>
        <td style="font-family:var(--font-mono);font-size:.68rem;color:var(--text-3);white-space:nowrap">${fmtDate(a.startDate)}</td>
        <td style="font-family:var(--font-mono);font-size:.68rem;color:${diff<0?'var(--red)':'var(--text-3)'};white-space:nowrap">${fmtDate(a.dueDate)}</td>
        <td class="gantt-bar-cell" style="min-width:${totalW}px">
          <div class="gantt-bar-bg" style="width:${totalW}px">
            <div class="gantt-today-line" style="left:${todayLeft}px"></div>
            <div class="gantt-bar" style="${barStyle}" title="${esc(a.description)} [${wbs}] (${pct}%)" onclick="editAct('${a.id}')">
              ${progressLayer}
              <span style="position:relative;z-index:1;font-size:.6rem">${esc(a.description)}</span>
            </div>
          </div>
        </td>
      </tr>`;
    }

    function renderProjectHeader(projName, items) {
      const key = projName || '__sem__';
      const isCollapsed = collapsed.has(key);
      const color = projColor(projName);

      // Calcula span do projeto (menor início, maior término)
      const starts = items.map(a => isoToDate(a.startDate || a.dueDate)).filter(Boolean);
      const ends   = items.map(a => isoToDate(a.dueDate   || a.startDate)).filter(Boolean);
      const ps = starts.length ? new Date(Math.min(...starts)) : null;
      const pe = ends.length   ? new Date(Math.max(...ends))   : null;
      const left = ps ? Math.max(0, Math.round((ps - minDate)/86400000)) * pxPerDay : 0;
      const bw   = (ps && pe) ? Math.max(6, Math.round((pe - ps)/86400000 + 1)) * pxPerDay : 0;

      // Progresso médio
      const avgPct = items.length ? Math.round(items.reduce((s,a)=>s+(a.progress||0),0)/items.length) : 0;
      const done   = items.filter(a => a.status === 'Concluído').length;

      const caret = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';

      return `<tr class="gantt-project-header" data-group-key="${esc(key)}" onclick="toggleGanttGroupCollapse('${esc(key).replace(/'/g,"\\'")}')">
        <td colspan="5" style="background:linear-gradient(90deg,${color}22,${color}08);border-left:4px solid ${color};font-weight:700;cursor:pointer;padding:10px 12px">
          <div style="display:flex;align-items:center;gap:10px">
            <i class="fa-solid ${caret}" style="color:${color};font-size:.7rem;width:10px"></i>
            <span class="project-dot" style="background:${color};width:10px;height:10px;border-radius:50%;display:inline-block"></span>
            <span style="color:var(--text-1);font-size:.82rem">${esc(projName || 'Sem projeto')}</span>
            <span style="color:var(--text-4);font-size:.7rem;font-weight:500">${items.length} atividade${items.length!==1?'s':''} • ${done} concluída${done!==1?'s':''} • ${avgPct}%</span>
          </div>
        </td>
        <td class="gantt-bar-cell" style="min-width:${totalW}px;background:linear-gradient(90deg,${color}11,transparent);border-left:0">
          <div class="gantt-bar-bg" style="width:${totalW}px">
            <div class="gantt-today-line" style="left:${todayLeft}px"></div>
            ${bw > 0 ? `<div class="gantt-bar gantt-summary-bar" style="left:${left}px;width:${bw}px;background:${color};opacity:.85" title="${esc(projName||'Sem projeto')}: ${items.length} atividades">
              <div style="position:absolute;left:0;top:0;bottom:0;width:${avgPct}%;background:rgba(255,255,255,.35);border-radius:3px 0 0 3px;pointer-events:none"></div>
              <span style="position:relative;z-index:1;font-size:.58rem;font-weight:700">${esc(projName||'Sem projeto')} (${avgPct}%)</span>
            </div>` : ''}
          </div>
        </td>
      </tr>`;
    }

    let rows;
    if (groupByProject) {
      // Agrupa por projeto preservando a ordem do filtered (que já está ordenado)
      const groups = new Map();
      filtered.forEach(a => {
        const k = a.project || '__sem__';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(a);
      });
      rows = [...groups.entries()].map(([projName, items]) =>
        renderProjectHeader(projName === '__sem__' ? '' : projName, items) +
        items.map(renderActivityRow).join('')
      ).join('');
    } else {
      rows = filtered.map(renderActivityRow).join('');
    }

    /* ── Monta tabela ── */
    wrap.innerHTML = `<table class="gantt-table">
      <thead>
        <tr>
          <th style="width:52px;cursor:pointer" onclick="ganttSortBy('wbs')">WBS${sortIcon('wbs')}</th>
          <th style="cursor:pointer" onclick="ganttSortBy('description')">Atividade${sortIcon('description')}</th>
          <th style="cursor:pointer" onclick="ganttSortBy('project')">Projeto${sortIcon('project')}</th>
          <th style="cursor:pointer" onclick="ganttSortBy('startDate')">Início${sortIcon('startDate')}</th>
          <th style="cursor:pointer" onclick="ganttSortBy('dueDate')">Término${sortIcon('dueDate')}</th>
          <th><div style="display:flex">${monthsHtml}</div></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

    /* ── Alças de redimensionamento estilo Excel ── */
    if (typeof setupGanttResize === 'function') setupGanttResize();
  };

  /* ══ Resize estilo Excel — colunas (horizontal) e linhas (vertical) ══ */
  function setupGanttResize() {
    const table = document.querySelector('#gantt-wrap .gantt-table');
    if (!table) return;

    const COL_KEY = 'gantt_col_widths_v1';
    const EXPAND_KEY = 'gantt_rows_expanded_v1';
    const ROW_H_KEY = 'gantt_row_height_v1';

    const savedWidths = JSON.parse(localStorage.getItem(COL_KEY) || '{}');
    const savedRowH = parseInt(localStorage.getItem(ROW_H_KEY) || '0', 10);
    const isExpanded = localStorage.getItem(EXPAND_KEY) === '1';

    if (isExpanded) table.classList.add('gantt-rows-expanded');

    const headers = table.querySelectorAll('thead th');
    const lastIdx = headers.length - 1; // coluna da barra do gantt — não redimensiona

    // Aplica larguras salvas
    headers.forEach((th, idx) => {
      if (idx === lastIdx) return;
      if (savedWidths[idx]) applyColWidth(idx, savedWidths[idx]);
    });

    // Aplica altura salva
    if (savedRowH > 0 && !isExpanded) {
      table.querySelectorAll('tbody tr').forEach(tr => tr.style.height = savedRowH + 'px');
    }

    function applyColWidth(idx, w) {
      const th = headers[idx]; if (!th) return;
      th.style.width = w + 'px';
      th.style.minWidth = w + 'px';
      th.style.maxWidth = w + 'px';
      table.querySelectorAll(`tbody tr > td:nth-child(${idx+1})`).forEach(td => {
        td.style.width = w + 'px';
        td.style.minWidth = w + 'px';
        td.style.maxWidth = w + 'px';
      });
    }

    function autofitCol(idx) {
      const th = headers[idx]; if (!th) return;
      const cells = [th, ...table.querySelectorAll(`tbody tr > td:nth-child(${idx+1})`)];
      let maxW = 0;
      cells.forEach(cell => {
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('.gantt-col-resize, .gantt-row-resize').forEach(g => g.remove());
        clone.style.cssText = `position:absolute;visibility:hidden;width:auto;min-width:0;max-width:none;white-space:nowrap;font:${getComputedStyle(cell).font};padding:${getComputedStyle(cell).padding}`;
        document.body.appendChild(clone);
        maxW = Math.max(maxW, clone.offsetWidth);
        document.body.removeChild(clone);
      });
      const finalW = Math.min(700, Math.max(50, maxW + 20));
      applyColWidth(idx, finalW);
      savedWidths[idx] = finalW;
      localStorage.setItem(COL_KEY, JSON.stringify(savedWidths));
    }

    // Cria alças de coluna em cada th (exceto a última)
    headers.forEach((th, idx) => {
      if (idx === lastIdx) return;
      th.style.position = 'relative';
      const grip = document.createElement('div');
      grip.className = 'gantt-col-resize';
      grip.title = 'Arraste para redimensionar • Duplo-clique para auto-ajustar';
      th.appendChild(grip);

      grip.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const startX = e.clientX;
        const startW = th.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        function onMove(ev) {
          const newW = Math.max(40, startW + (ev.clientX - startX));
          applyColWidth(idx, newW);
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          savedWidths[idx] = th.offsetWidth;
          localStorage.setItem(COL_KEY, JSON.stringify(savedWidths));
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      grip.addEventListener('dblclick', e => {
        e.preventDefault(); e.stopPropagation();
        autofitCol(idx);
      });
    });

    // Cria alça de linha (uma só, na primeira linha — controla altura global)
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(tr => {
      const firstCell = tr.cells[0]; if (!firstCell) return;
      firstCell.style.position = 'relative';
      const grip = document.createElement('div');
      grip.className = 'gantt-row-resize';
      grip.title = 'Arraste para redimensionar altura • Duplo-clique para mostrar todo o texto';
      firstCell.appendChild(grip);

      grip.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        const startY = e.clientY;
        const startH = tr.offsetHeight;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        // Sai do modo expandido se estiver
        table.classList.remove('gantt-rows-expanded');
        localStorage.removeItem(EXPAND_KEY);
        function onMove(ev) {
          const newH = Math.max(20, startH + (ev.clientY - startY));
          rows.forEach(r => r.style.height = newH + 'px');
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          localStorage.setItem(ROW_H_KEY, tr.offsetHeight);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      grip.addEventListener('dblclick', e => {
        e.preventDefault(); e.stopPropagation();
        // Alterna modo expandido — texto quebra em várias linhas
        const nowExp = table.classList.toggle('gantt-rows-expanded');
        if (nowExp) {
          rows.forEach(r => r.style.height = '');
          localStorage.setItem(EXPAND_KEY, '1');
          localStorage.removeItem(ROW_H_KEY);
        } else {
          localStorage.removeItem(EXPAND_KEY);
        }
      });
    });
  }
  window.setupGanttResize = setupGanttResize;
  function calcAvgResolution(person){
    const done = activities.filter(a => a.responsible===person && a.status==='Concluído');
    if (!done.length) return 0;
    const vals = done.map(a => {
      if (a.startDate && a.dueDate) return Math.max(1, Math.round((isoToDate(a.dueDate)-isoToDate(a.startDate))/86400000)+1);
      if (a.durationH) return Math.max(1, Math.ceil(a.durationH / (loadCalCfg().horasDia || 9)));
      return 1;
    });
    return Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10;
  }
  function renderTeamResolutionChart(people){
    const canvas = document.getElementById('team-resolution-chart'); if (!canvas || typeof Chart === 'undefined') return;
    if (chartTeamResAvg) chartTeamResAvg.destroy();
    chartTeamResAvg = new Chart(canvas, { type:'bar', data:{ labels:people, datasets:[{ label:'Dias médios', data:people.map(calcAvgResolution), backgroundColor:'rgba(37,99,235,.65)', borderRadius:6, borderSkipped:false }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:'#94a3b8', font:{ size:10 } }, grid:{ display:false } }, y:{ ticks:{ color:'#94a3b8', font:{ size:10 } }, grid:{ color:'rgba(148,163,184,.12)' } } } } });
  }
  window.saveResourceEntry = function(){
    const nameEl = document.getElementById('resource-name');
    const teamEl = document.getElementById('resource-team');
    const roleEl = document.getElementById('resource-role');
    const collabEl = document.getElementById('resource-is-collaborator');
    if (!nameEl) return;
    const rawName = nameEl.value || '';
    const key = normalizeName(rawName);
    if (!key) return toast('Digite o nome do cadastro', 'warning');
    const exists = (resourceRegistry||[]).some(r => normalizeName(r.name) === key);
    if (exists) return toast('Esse nome já está cadastrado', 'warning');
    resourceRegistry.push({
      id: 'res_'+Date.now(),
      name: titleName(rawName),
      team: (teamEl?.value || '').trim(),
      role: (roleEl?.value || '').trim(),
      isCollaborator: !!collabEl?.checked
    });
    if (nameEl) nameEl.value = '';
    if (teamEl) teamEl.value = '';
    if (roleEl) roleEl.value = '';
    if (collabEl) collabEl.checked = true;
    save();
    renderRecursos();
    renderEquipe();
    renderCalEquipe();
    toast('Cadastro salvo com sucesso', 'success');
  };
  window.deleteResourceEntry = function(id){
    const item = (resourceRegistry||[]).find(r => r.id === id);
    resourceRegistry = (resourceRegistry||[]).filter(r => r.id !== id);
    if (item?.isCollaborator) {
      const key = normalizeName(item.name);
      employees = employees.filter(e => e.key !== key || activities.some(a => normalizeName(a.responsible) === key));
    }
    save();
    renderRecursos();
    renderEquipe();
    renderCalEquipe();
    toast('Cadastro removido', 'success');
  };

  window.renderEquipe = function(){
    const grid = document.getElementById('equipe-grid'); if (!grid) return;
    const people = employees.map(e=>e.name);
    renderTeamResolutionChart(people);
    if (!people.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa-solid fa-users"></i><p>Nenhum colaborador encontrado</p></div>`; return; }
    grid.innerHTML = people.map((name, i) => {
      const emp = employees.find(e=>e.name===name) || {};
      const myActs = activities.filter(a => a.responsible === name); const done = myActs.filter(a => a.status==='Concluído').length; const overdue = myActs.filter(a => a.status==='Vencido').length; const pct = myActs.length ? Math.round((done/myActs.length)*100) : 0; const avg = calcAvgResolution(name);
      return `<div class="card"><div style="padding:16px 18px"><div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,${COLORS[i%COLORS.length]},${COLORS[(i+2)%COLORS.length]});display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:.95rem;flex-shrink:0">${name[0].toUpperCase()}</div><div style="flex:1"><div style="font-weight:700;font-size:.85rem;color:var(--text-1)">${esc(name)}</div><div style="font-size:.68rem;color:var(--text-4)">${esc(emp.team||'Não definida')} · ${myActs.length} atividades</div></div><span class="badge badge-blue">${avg||0}d méd.</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px"><div style="text-align:center;padding:8px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)"><div style="font-family:var(--font-head);font-weight:800;font-size:1.1rem;color:var(--text-1)">${myActs.length}</div><div style="font-size:.58rem;color:var(--text-4);text-transform:uppercase">Total</div></div><div style="text-align:center;padding:8px;background:var(--green-dim);border-radius:8px;border:1px solid rgba(5,150,105,.15)"><div style="font-family:var(--font-head);font-weight:800;font-size:1.1rem;color:var(--green)">${done}</div><div style="font-size:.58rem;color:var(--green);text-transform:uppercase">Concl.</div></div><div style="text-align:center;padding:8px;background:${overdue?'var(--red-dim)':'var(--surface2)'};border-radius:8px;border:1px solid var(--border)"><div style="font-family:var(--font-head);font-weight:800;font-size:1.1rem;color:${overdue?'var(--red)':'var(--text-1)'}">${overdue}</div><div style="font-size:.58rem;color:var(--text-4);text-transform:uppercase">Atras.</div></div><div style="text-align:center;padding:8px;background:var(--blue-dim);border-radius:8px;border:1px solid rgba(37,99,235,.14)"><div style="font-family:var(--font-head);font-weight:800;font-size:1.1rem;color:var(--blue)">${avg||0}</div><div style="font-size:.58rem;color:var(--blue);text-transform:uppercase">Dias méd.</div></div></div>
      <div style="display:flex;align-items:center;gap:6px"><div class="progress-bar-track" style="flex:1"><div class="progress-bar-fill fill-${pct===100?'green':''}" style="width:${pct}%"></div></div><span style="font-family:var(--font-mono);font-size:.65rem;color:var(--text-4)">${pct}%</span></div></div></div>`;
    }).join('');
  };
  window.renderPortfolio = function(){
    const kpiEl = document.getElementById('pf-kpis');
    const tlEl = document.getElementById('pf-timeline');
    if (!kpiEl || !tlEl) return;
    const total = projects.length, ativos = projects.filter(p=>getProjectStatusGroup(p.status)==='ativos').length, concluidos = projects.filter(p=>p.status==='Concluído').length, arquivados = projects.filter(p=>p.status==='Arquivado').length, overdue = activities.filter(a=>a.status==='Vencido').length;
    kpiEl.innerHTML = `<div class="card" style="padding:14px 16px"><div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);margin-bottom:6px">Projetos ativos</div><div style="font-family:var(--font-head);font-size:1.8rem;font-weight:800;color:var(--text-1)">${ativos}</div><div style="font-size:.68rem;color:var(--text-4)">${total} no portfólio</div></div><div class="card" style="padding:14px 16px"><div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--green);margin-bottom:6px">Concluídos</div><div style="font-family:var(--font-head);font-size:1.8rem;font-weight:800;color:var(--green)">${concluidos}</div><div style="font-size:.68rem;color:var(--text-4)">Entregues e mantidos no histórico</div></div><div class="card" style="padding:14px 16px"><div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--purple);margin-bottom:6px">Arquivados</div><div style="font-family:var(--font-head);font-size:1.8rem;font-weight:800;color:var(--purple)">${arquivados}</div><div style="font-size:.68rem;color:var(--text-4)">Guardados por pasta</div></div><div class="card" style="padding:14px 16px"><div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${overdue?'var(--red)':'var(--text-3)'};margin-bottom:6px">Risco operacional</div><div style="font-family:var(--font-head);font-size:1.8rem;font-weight:800;color:${overdue?'var(--red)':'var(--green)'}">${overdue}</div><div style="font-size:.68rem;color:var(--text-4)">Atividades vencidas abertas</div></div>`;
    const info = `<div class="portfolio-info"><strong>O que esta aba mostra:</strong> visão macro do portfólio — status de cada projeto, gestor responsável, progresso consolidado, tarefas abertas e projetos em risco. É a visão executiva para decidir prioridade, capacidade e saúde do setor.</div>`;
    const rows = projects.map(p => {
      const acts = activities.filter(a=>a.project===p.name); const done = acts.filter(a=>a.status==='Concluído').length; const open = acts.filter(a=>a.status!=='Concluído').length; const late = acts.filter(a=>a.status==='Vencido').length; const pct = acts.length ? Math.round((done/acts.length)*100) : (p.progress||0);
      return `<div class="portfolio-row"><div><div class="title">${esc(p.name)}</div><div class="sub">${esc(p.manager||'Sem gestor')} · ${esc(p.code||'Sem código')}</div></div><div><span class="badge ${p.status==='Concluído'?'badge-green':p.status==='Arquivado'?'badge-purple':'badge-blue'}">${esc(p.status||'Em andamento')}</span></div><div><strong>${pct}%</strong><div class="sub">progresso</div></div><div><strong>${open}</strong><div class="sub">abertas</div></div><div><strong style="color:${late?'var(--red)':'var(--green)'}">${late}</strong><div class="sub">vencidas</div></div></div>`;
    }).join('');
    tlEl.innerHTML = info + `<div class="portfolio-list">${rows || `<div class="empty-state"><i class="fa-solid fa-folder"></i><p>Nenhum projeto</p></div>`}</div>`;
  };
  window.renderRecursos = function(){
    const wrap = document.getElementById('recursos-wrap'); const confEl = document.getElementById('conflitos-list'); if (!wrap) return;
    const people = employees;
    const today = new Date(); today.setHours(0,0,0,0); const weeks=[];
    for (let i=0;i<recPeriod;i++){ const ws=new Date(today); ws.setDate(today.getDate()+i*7); const we=new Date(ws); we.setDate(ws.getDate()+6); weeks.push({start:ws,end:we,label:`S${i+1}`}); }
    const conflicts=[];
    const heads = weeks.map(w=>`<th>${w.label}</th>`).join('');
    const rows = people.map(emp => {
      const cells = weeks.map(w => {
        const myActs = activities.filter(a => { if (a.responsible !== emp.name || a.status==='Concluído') return false; const r=rangeForActivity(a); if(!r.start&&!r.end) return false; const sd=isoToDate(r.start); const ed=isoToDate(r.end); return sd<=w.end && ed>=w.start; });
        const load = myActs.length; let cls='heat-empty', label='—'; if(load>0){ if(load>=3){ cls='heat-over'; } else if(load>=2){ cls='heat-warn'; } else { cls='heat-free'; } label=load; if(load>2 && !conflicts.find(c=>c.person===emp.name)) conflicts.push({person:emp.name,load,week:w.label}); }
        return `<td><div class="heat-cell ${cls}">${label}</div></td>`;
      }).join('');
      return `<tr><td style="text-align:left;font-weight:600;font-size:.78rem;white-space:nowrap;min-width:190px"><div>${esc(emp.name)}</div><div style="font-size:.62rem;color:var(--text-4);font-weight:500">Equipe: ${esc(emp.team||'Não definida')}</div></td>${cells}</tr>`;
    }).join('');
    const dbCards = people.map(emp => `<div class="resource-person-card"><h4>${esc(emp.name)}</h4><p>${esc(emp.team||'Não definida')}</p><div class="meta"><span class="badge badge-blue">${(emp.projects||[]).length} projeto(s)</span><span class="badge badge-green">Cadastro ativo</span><button class="btn-secondary" style="padding:3px 8px;font-size:.62rem" onclick="editEmployeeTeam('${esc(emp.name)}')"><i class="fa-solid fa-users"></i> Equipe</button></div></div>`).join('');
    wrap.innerHTML = `<div class="card" style="margin:14px 14px 16px;padding:14px;border:1px solid var(--border);background:var(--surface)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap"><div><div style="font-weight:700;color:var(--text-1)">Cadastro rápido</div><div style="font-size:.7rem;color:var(--text-4)">Use o campo de colaborador para mandar a pessoa direto para Equipe e Calendário de Equipe.</div></div></div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto auto;gap:10px;align-items:end">
        <label style="display:flex;flex-direction:column;gap:6px;font-size:.7rem;color:var(--text-3)">Nome
          <input id="resource-name" class="input" placeholder="Ex: Carlos Silva" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:.7rem;color:var(--text-3)">Equipe
          <input id="resource-team" class="input" placeholder="Ex: Produção" />
        </label>
        <label style="display:flex;flex-direction:column;gap:6px;font-size:.7rem;color:var(--text-3)">Função
          <input id="resource-role" class="input" placeholder="Ex: Soldador" />
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:.76rem;color:var(--text-2);padding:0 4px 11px 4px;white-space:nowrap"><input type="checkbox" id="resource-is-collaborator" checked> Cadastrar colaborador</label>
        <button class="btn-primary" onclick="saveResourceEntry()"><i class="fa-solid fa-plus"></i> Salvar</button>
      </div>
    </div>
    <div id="resource-registry-list" class="recursos-db"></div>
    <div class="recursos-db">${dbCards || `<div class="empty-state"><i class="fa-solid fa-users"></i><p>Nenhum colaborador alocado ainda</p></div>`}</div><table class="recursos-table"><thead><tr><th style="text-align:left">Funcionário</th>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
    renderResourceRegistry();
    confEl.innerHTML = conflicts.length ? conflicts.map(c=>`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);font-size:.75rem"><span class="badge badge-red"><i class="fa-solid fa-triangle-exclamation"></i>Conflito</span><span style="color:var(--text-2)"><strong>${esc(c.person)}</strong> — ${c.load} atividades simultâneas (${c.week})</span></div>`).join('') : `<div style="font-size:.75rem;color:var(--text-4);padding:8px 0">✅ Nenhum conflito detectado.</div>`;
  };
  window.editEmployeeTeam = function(name){
    const emp = employees.find(e=>e.name===name); if(!emp) return; const next = prompt(`Defina a equipe de ${name}:`, emp.team || ''); if(next===null) return; emp.team = next.trim() || 'Não definida'; save(); renderRecursos(); renderEquipe(); renderCalEquipe(); toast('Equipe atualizada', 'success'); };
  function eventClassForActivity(a){ const diff=diffDays(a.dueDate); if(a.status==='Concluído') return 'ev-green'; if(a.status==='Reprogramado') return 'ev-purple'; if(diff<0) return 'ev-red'; if(diff===0) return 'ev-amber'; return ''; }
  window.renderCalBase = function(containerId, actsFiltered){
    const wrap = document.getElementById(containerId); if(!wrap) return;
    wrap.classList.add('print-section');
    const today = new Date(); const firstDay = new Date(calYear, calMonth, 1); const lastDay = new Date(calYear, calMonth+1, 0); const startDow = firstDay.getDay(); const monthName = firstDay.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    let html = `<div class="cal-header"><button class="btn-secondary" onclick="calNav(-1,'${containerId}')"><i class="fa-solid fa-chevron-left"></i></button><span class="cal-title">${monthName.charAt(0).toUpperCase()+monthName.slice(1)}</span><button class="btn-secondary" onclick="calNav(1,'${containerId}')"><i class="fa-solid fa-chevron-right"></i></button><button class="btn-secondary" onclick="calToday('${containerId}')">Hoje</button></div><div class="cal-grid">`;
    const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']; html += days.map(d=>`<div class="cal-day-header">${d}</div>`).join('');
    for(let i=0;i<startDow;i++) html += `<div class="cal-day other-month"></div>`;
    for(let d=1; d<=lastDay.getDate(); d++){
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; const isToday = today.getFullYear()===calYear && today.getMonth()===calMonth && today.getDate()===d; const dayActs = actsFiltered.filter(a => activityRunsOn(a, dateStr));
      const evHtml = dayActs.slice(0,4).map(a=>`<div class="cal-event ${eventClassForActivity(a)}" title="${esc(a.description)} — ${esc(a.responsible||'Sem responsável')}" onclick="editAct('${a.id}')">${esc(a.description)}<span style="opacity:.9"> · ${esc(a.responsible||'—')}</span></div>`).join('');
      html += `<div class="cal-day ${isToday?'today':''}"><div class="cal-day-num">${d}</div>${evHtml}${dayActs.length>4?`<div class="cal-event-more">+${dayActs.length-4} mais</div>`:''}</div>`;
    }
    html += '</div>'; wrap.innerHTML = html;
  };
  window.renderCalAtiv = function(){ renderCalBase('cal-ativ-wrap', activities); };
  function teamEntryClass(type){ return type==='Folga' ? 'folga' : type==='Férias' ? 'ferias' : type==='Treinamento' ? 'treinamento' : type==='Outra atividade' ? 'outra' : 'project'; }
  function getTeamEntriesForDay(empName, dateStr){
    const key = normalizeName(empName); const manual = teamCalendar[key]?.[dateStr];
    if (manual) return [{ label: manual.label || manual.type, type: manual.type }];
    const acts = activities.filter(a => a.responsible === empName && activityRunsOn(a, dateStr));
    return acts.map(a => ({ label: `${a.project}: ${a.description}`, type: 'Projeto' }));
  }
  function renderTeamCalendarSelector(){
    const sel = document.getElementById('cal-eq-pessoa'); if (!sel) return; const cur = sel.value; sel.innerHTML = '<option value="">Todos</option>' + employeeOptionsHtml(cur);
    if (cur && [...sel.options].some(o=>o.value===cur)) sel.value=cur;
  }
  window.renderCalEquipe = function(){
    renderTeamCalendarSelector();
    const pessoa = document.getElementById('cal-eq-pessoa')?.value || '';
    const wrap = document.getElementById('cal-equipe-wrap'); if (!wrap) return;
    const firstDay = new Date(calYear, calMonth, 1); const lastDay = new Date(calYear, calMonth+1, 0); const totalDays = lastDay.getDate(); const names = (pessoa ? employees.filter(e=>e.name===pessoa) : employees).map(e=>e.name);
    const headDays = Array.from({length:totalDays}, (_,i)=>`<th>${String(i+1).padStart(2,'0')}</th>`).join('');
    const rows = names.map(name => {
      const emp = employees.find(e=>e.name===name) || {}; const cells = Array.from({length:totalDays}, (_,i)=>{ const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`; const entries = getTeamEntriesForDay(name, dateStr); return `<td class="team-day-cell" onclick="setTeamDayStatus('${esc(name)}','${dateStr}')"><div class="team-day-stack">${entries.length ? entries.slice(0,2).map(entry=>`<div class="team-pill ${teamEntryClass(entry.type)}" title="${esc(entry.label)}">${esc(entry.label)}</div>`).join('') : '<div style="font-size:.58rem;color:var(--text-4)">Livre</div>'}${entries.length>2?`<div style="font-size:.55rem;color:var(--text-4)">+${entries.length-2}</div>`:''}</div></td>`; }).join('');
      return `<tr><td><div style="font-weight:700">${esc(name)}</div><div style="font-size:.62rem;color:var(--text-4)">${esc(emp.team||'Não definida')}</div></td>${cells}</tr>`;
    }).join('');
    wrap.classList.add('print-section');
    wrap.innerHTML = `<div class="cal-header"><button class="btn-secondary" onclick="calNav(-1,'cal-equipe-wrap')"><i class="fa-solid fa-chevron-left"></i></button><span class="cal-title">${firstDay.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</span><button class="btn-secondary" onclick="calNav(1,'cal-equipe-wrap')"><i class="fa-solid fa-chevron-right"></i></button><button class="btn-secondary" onclick="calToday('cal-equipe-wrap')">Hoje</button></div><div class="team-calendar-matrix"><table class="team-calendar-table"><thead><tr><th>Funcionário</th>${headDays}</tr></thead><tbody>${rows || `<tr><td colspan="${totalDays+1}"><div class="empty-state"><i class="fa-solid fa-users"></i><p>Nenhum colaborador cadastrado</p></div></td></tr>`}</tbody></table></div>`;
  };
  // Status da equipe: formulário (antes eram caixas prompt() do navegador)
  function abrirStatusEquipe(name, dateStr){
    const sel = document.getElementById('ts-pessoa'); if (!sel) return;
    sel.innerHTML = '<option value="">Selecione o funcionário</option>' + employeeOptionsHtml(name || '');
    const data = dateStr || todayISO();
    document.getElementById('ts-inicio').value = data;
    document.getElementById('ts-fim').value = '';
    const atual = name ? teamCalendar[normalizeName(name)]?.[data] : null;
    document.getElementById('ts-tipo').value = atual?.type && ['Folga','Férias','Treinamento','Outra atividade'].includes(atual.type) ? atual.type : 'Folga';
    document.getElementById('ts-detalhe').value = atual && atual.label && atual.label !== atual.type ? atual.label : '';
    document.getElementById('modal-team-status').classList.add('open');
    setTimeout(() => (name ? document.getElementById('ts-tipo') : sel).focus(), 100);
  }
  window.setTeamDayStatus = function(name, dateStr){ abrirStatusEquipe(name, dateStr); };
  window.openTeamStatusPrompt = function(){ renderTeamCalendarSelector(); abrirStatusEquipe('', todayISO()); };
  window.saveTeamStatus = function(){
    const name = document.getElementById('ts-pessoa').value;
    const ini = document.getElementById('ts-inicio').value;
    const fim = document.getElementById('ts-fim').value || ini;
    const tipo = document.getElementById('ts-tipo').value;
    const detalhe = document.getElementById('ts-detalhe').value.trim();
    if (!name) return toast('Escolha o funcionário', 'error');
    if (!ini) return toast('Informe a data', 'error');
    if (fim < ini) return toast('A data final está antes da inicial', 'error');
    const key = normalizeName(name); if (!teamCalendar[key]) teamCalendar[key] = {};
    let dias = 0;
    for (let d = new Date(ini + 'T12:00:00'); dias < 366; d.setDate(d.getDate() + 1)) {
      const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (ds > fim) break;
      if (tipo === '__limpar') delete teamCalendar[key][ds];
      else teamCalendar[key][ds] = { type: tipo, label: detalhe || tipo };
      dias++;
    }
    save(); renderCalEquipe(); closeModal('modal-team-status');
    toast(tipo === '__limpar' ? `Status removido (${dias} dia(s))` : `Status lançado para ${dias} dia(s)`, 'success');
  };
  window.exportCalAtivPdf = function(){
    const section = document.getElementById('cal-ativ-wrap'); if (!section) return;
    const win = window.open('', '_blank');
    if (!win) { toast('Permita pop-up para exportar o PDF', 'warning'); return; }
    win.document.write(`<!DOCTYPE html><html><head><title>Calendário de Atividades</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.cal-day-header{font-weight:700;padding:8px;background:#e5e7eb;border:1px solid #d1d5db}.cal-day{min-height:110px;border:1px solid #d1d5db;padding:6px;border-radius:6px}.cal-event{font-size:11px;background:#2563eb;color:#fff;border-radius:4px;padding:3px 5px;margin-bottom:3px}.cal-day-num{font-weight:700;margin-bottom:6px}.cal-header{display:flex;justify-content:center;margin-bottom:14px}.cal-title{font-size:22px;font-weight:700}</style></head><body><h2 style="margin-bottom:16px">Calendário de Atividades</h2>${section.innerHTML}<script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    win.document.close();
  };
  document.addEventListener('DOMContentLoaded', function(){ ensureProjectStatusOptions(); ensureActivityModalExtras(); injectViewButtons(); renderTeamCalendarSelector(); });
})();
