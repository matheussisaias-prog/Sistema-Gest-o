/* ================================================================
   TASKFLOW PRO — MELHORIAS v2.0
   Módulo de controle operacional avançado:
   • Horas Estimadas vs Realizadas + status automático
   • Cadastro e gestão de colaboradores
   • Visão Semanal da Equipe
   • Dashboard de Indicadores
   • Exportação PDF Profissional (nível executivo)
   ================================================================ */
'use strict';

(function () {

/* ─── STORAGE KEYS ─────────────────────────────────────────── */
const KEY_COLABS  = 'tf_colaboradores';
const KEY_ALOC    = 'tf_alocacoes';
const KEY_EMPRESA = 'tf_empresa_config';

/* ─── STATE LOCAL ───────────────────────────────────────────── */
let colaboradores = [];
let alocacoes     = [];
let empresaConfig = { nome:'Minha Empresa', logo:null, contato:'', obs:'' };

/* ─── PERSIST ───────────────────────────────────────────────── */
function saveColabs()  { try { localStorage.setItem(KEY_COLABS, JSON.stringify(colaboradores)); } catch(_){} }
function loadColabs()  { try { colaboradores = JSON.parse(localStorage.getItem(KEY_COLABS)||'null') || _seedColabs(); } catch(_){ colaboradores = _seedColabs(); } }
function saveAloc()    { try { localStorage.setItem(KEY_ALOC,   JSON.stringify(alocacoes));    } catch(_){} }
function loadAloc()    { try { alocacoes     = JSON.parse(localStorage.getItem(KEY_ALOC)  ||'[]'); } catch(_){ alocacoes=[]; } }
function saveEmpresa() { try { localStorage.setItem(KEY_EMPRESA, JSON.stringify(empresaConfig)); } catch(_){} }
function loadEmpresa() { try { empresaConfig = { ...empresaConfig, ...JSON.parse(localStorage.getItem(KEY_EMPRESA)||'{}') }; } catch(_){} }

function _seedColabs() {
  return [
    { id:'c01', nome:'Carlos Lima',    funcao:'Engenheiro Elétrico',  carga_semanal:44, equipe:'Equipe 01', cor:'#3b82f6' },
    { id:'c02', nome:'Ana Paula',      funcao:'Engenheira Civil',     carga_semanal:44, equipe:'Equipe 01', cor:'#6366f1' },
    { id:'c03', nome:'Pedro Souza',    funcao:'Técnico Suprimentos',  carga_semanal:44, equipe:'Equipe 01', cor:'#0ea5e9' },
    { id:'c04', nome:'Rafaela Cruz',   funcao:'Supervisora de Campo', carga_semanal:44, equipe:'Equipe 02', cor:'#f59e0b' },
    { id:'c05', nome:'Marcos Dias',    funcao:'Soldador Especialista',carga_semanal:44, equipe:'Equipe 02', cor:'#f97316' },
    { id:'c06', nome:'Diego Mendes',   funcao:'Gerente de Projeto',   carga_semanal:44, equipe:'Equipe 02', cor:'#ef4444' },
    { id:'c07', nome:'Fábio Ramos',    funcao:'Mecânico Industrial',  carga_semanal:44, equipe:'Equipe 03', cor:'#10b981' },
    { id:'c08', nome:'Sandra Melo',    funcao:'Inspetora Qualidade',  carga_semanal:44, equipe:'Equipe 03', cor:'#14b8a6' },
  ];
}

/* ================================================================
   1. HORAS ESTIMADAS vs REALIZADAS
   ================================================================ */

function calcStatusHoras(estimadas, realizadas) {
  if (!estimadas || estimadas <= 0) return null;
  const pct = (realizadas / estimadas) * 100;
  if (pct <= 100)      return { pct, label:'Dentro do previsto', css:'horas-ok',    icon:'🟢', cor:'#059669' };
  if (pct <= 120)      return { pct, label:'Em risco',           css:'horas-risco', icon:'🟡', cor:'#d97706' };
  return               { pct, label:'Estourado',                  css:'horas-over',  icon:'🔴', cor:'#dc2626' };
}

function getHorasAct(a) {
  return {
    estimadas:  parseFloat(a.horas_estimadas  || a.durationH || 0) || 0,
    realizadas: parseFloat(a.horas_realizadas || 0) || 0,
  };
}

window.calcStatusHoras = calcStatusHoras;
window.getHorasAct     = getHorasAct;

/* ================================================================
   2. ESTILO INJETADO (CSS das novas features)
   ================================================================ */
function injectStyles() {
  if (document.getElementById('melhoria-styles')) return;
  const s = document.createElement('style');
  s.id = 'melhoria-styles';
  s.textContent = `
/* ── HORAS STATUS BADGES ─────────────────────────────── */
.horas-badge { display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:.65rem;font-weight:700;white-space:nowrap; }
.horas-ok    { background:rgba(5,150,105,.12);color:#059669;border:1px solid rgba(5,150,105,.2); }
.horas-risco { background:rgba(217,119,6,.12); color:#d97706;border:1px solid rgba(217,119,6,.2); }
.horas-over  { background:rgba(220,38,38,.12); color:#dc2626;border:1px solid rgba(220,38,38,.2); }
.horas-bar-track { height:4px;background:var(--border);border-radius:4px;overflow:hidden;flex:1; }
.horas-bar-fill  { height:100%;border-radius:4px;transition:width .3s; }

/* ── VISÃO SEMANAL ───────────────────────────────────── */
.semanal-wrap { overflow-x:auto; }
.semanal-table { width:100%;border-collapse:collapse;font-size:.74rem; }
.semanal-table th { padding:8px 10px;text-align:center;font-weight:700;font-size:.68rem;color:var(--text-3);border-bottom:2px solid var(--border);white-space:nowrap;position:sticky;top:0;background:var(--surface);z-index:1; }
.semanal-table th:first-child { text-align:left;min-width:170px;position:sticky;left:0;z-index:2;background:var(--surface); }
.semanal-table td { padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top; }
.semanal-table td:first-child { position:sticky;left:0;background:var(--surface);z-index:1;border-right:1px solid var(--border); }
.semanal-cell { min-height:50px;display:flex;flex-direction:column;gap:3px;align-items:center; }
.semanal-horas-total { font-family:var(--font-mono);font-size:.7rem;font-weight:700;margin-bottom:2px; }
.semanal-livre  { color:var(--green); }
.semanal-atencao{ color:var(--amber); }
.semanal-over   { color:var(--red); }
.semanal-task-pill { font-size:.6rem;padding:2px 6px;border-radius:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;cursor:pointer;background:var(--blue-dim);color:var(--blue);border:1px solid rgba(37,99,235,.15); }
.semanal-footer-cell { padding:6px 8px;text-align:center;font-family:var(--font-mono);font-size:.7rem;font-weight:700;background:var(--surface2);border-top:2px solid var(--border); }

/* ── COLABORADORES GRID ──────────────────────────────── */
.colab-card { background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;transition:box-shadow .18s; }
.colab-card:hover { box-shadow:var(--shadow-md); }
.colab-avatar { width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:1rem;flex-shrink:0; }
.colab-ocupacao-bar { height:6px;border-radius:6px;background:var(--border);overflow:hidden;margin-top:4px; }
.colab-ocupacao-fill { height:100%;border-radius:6px; }

/* ── INDICADORES DASHBOARD ───────────────────────────── */
.ind-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:16px; }
.ind-card { background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px; }
.ind-label { font-size:.68rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px; }
.ind-val { font-family:var(--font-head);font-weight:800;font-size:1.6rem;line-height:1;color:var(--text-1); }
.ind-sub { font-size:.68rem;color:var(--text-4);margin-top:4px; }
.ranking-row { display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border); }
.ranking-row:last-child { border:none; }
.ranking-name { font-size:.78rem;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.ranking-bar-wrap { flex:1;display:flex;align-items:center;gap:6px; }
.ranking-bar { height:6px;border-radius:4px;min-width:4px;transition:width .3s; }

/* ── PDF MODAL ───────────────────────────────────────── */
.pdf-section-title { font-size:.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;display:flex;align-items:center;gap:6px; }
.pdf-check-row { display:flex;align-items:center;gap:8px;padding:6px 0;font-size:.8rem;cursor:pointer; }
.pdf-check-row input[type=checkbox] { width:15px;height:15px;cursor:pointer; }

/* ── NAV BADGE NOVO ──────────────────────────────────── */
.nav-badge-new { background:#059669;color:#fff;font-size:.5rem;padding:1px 4px;border-radius:8px;margin-left:4px;font-weight:700; }
`;
  document.head.appendChild(s);
}

/* ================================================================
   3. INJETAR CAMPOS NO MODAL DE ATIVIDADE
   ================================================================ */
function injectActivityModalFields() {
  if (document.getElementById('act-horas-bloco')) return;
  const footer = document.querySelector('#modal-activity .modal-footer');
  if (!footer) return;

  const bloco = document.createElement('div');
  bloco.id = 'act-horas-bloco';
  bloco.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px 14px;display:flex;flex-direction:column;gap:10px;';
  bloco.innerHTML = `
    <div style="display:flex;align-items:center;gap:7px;margin-bottom:2px">
      <i class="fa-solid fa-clock" style="color:var(--blue);font-size:.8rem"></i>
      <span style="font-size:.75rem;font-weight:700;color:var(--text-2)">Controle de Horas</span>
      <span id="horas-status-badge" style="margin-left:auto"></span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="form-group" style="margin:0">
        <label class="form-label">Horas Estimadas</label>
        <input class="form-control" type="number" id="act-horas-est" min="0" step="0.5" placeholder="Ex: 40" oninput="window._updateHorasPreview()" style="font-family:var(--font-mono)"/>
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Horas Realizadas</label>
        <input class="form-control" type="number" id="act-horas-real" min="0" step="0.5" placeholder="Ex: 36" oninput="window._updateHorasPreview()" style="font-family:var(--font-mono)"/>
      </div>
    </div>
    <div id="horas-preview-bar" style="display:none">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:.68rem;color:var(--text-4)">
        <span id="horas-preview-label"></span>
        <span id="horas-preview-pct" style="font-family:var(--font-mono);font-weight:700"></span>
      </div>
      <div class="horas-bar-track"><div id="horas-preview-fill" class="horas-bar-fill" style="width:0%;background:#059669"></div></div>
    </div>
    <div class="form-group" style="margin:0">
      <label class="form-label">Equipe Envolvida</label>
      <div id="equipe-chips-container" style="display:flex;flex-wrap:wrap;gap:4px;min-height:32px;padding:4px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer" onclick="window._toggleEquipeDropdown()"></div>
      <input type="hidden" id="act-equipe-ids" value="[]"/>
      <div id="equipe-dropdown" style="display:none;position:absolute;z-index:500;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);box-shadow:var(--shadow-md);padding:6px;max-height:180px;overflow-y:auto;width:300px" id="equipe-dropdown"></div>
    </div>
  `;
  footer.before(bloco);
}

window._updateHorasPreview = function() {
  const est  = parseFloat(document.getElementById('act-horas-est')?.value)  || 0;
  const real = parseFloat(document.getElementById('act-horas-real')?.value) || 0;
  const badge = document.getElementById('horas-status-badge');
  const bar   = document.getElementById('horas-preview-bar');
  const fill  = document.getElementById('horas-preview-fill');
  const label = document.getElementById('horas-preview-label');
  const pctEl = document.getElementById('horas-preview-pct');
  if (!badge) return;
  if (!est) { badge.innerHTML=''; if(bar) bar.style.display='none'; return; }
  const s = calcStatusHoras(est, real);
  if (!s) return;
  badge.innerHTML = `<span class="horas-badge ${s.css}">${s.icon} ${s.label}</span>`;
  if (bar) {
    bar.style.display = '';
    const w = Math.min(s.pct, 100);
    fill.style.width      = w + '%';
    fill.style.background = s.cor;
    label.textContent     = `${real}h realizadas de ${est}h estimadas`;
    pctEl.textContent     = s.pct.toFixed(0) + '%';
  }
};

window._toggleEquipeDropdown = function() {
  const dd = document.getElementById('equipe-dropdown');
  if (!dd) return;
  if (dd.style.display === 'none') {
    _renderEquipeDropdown();
    dd.style.display = '';
    // Posicionar abaixo do container
    const cont = document.getElementById('equipe-chips-container');
    if (cont) {
      const rect = cont.getBoundingClientRect();
      dd.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
      dd.style.left = rect.left + 'px';
      dd.style.position = 'fixed';
    }
    setTimeout(() => document.addEventListener('click', _closeEquipeDDOutside, { once: true }), 100);
  } else {
    dd.style.display = 'none';
  }
};

function _closeEquipeDDOutside(e) {
  const dd   = document.getElementById('equipe-dropdown');
  const cont = document.getElementById('equipe-chips-container');
  if (dd && !dd.contains(e.target) && !cont?.contains(e.target)) dd.style.display = 'none';
}

function _renderEquipeDropdown() {
  const dd    = document.getElementById('equipe-dropdown');
  const hidEl = document.getElementById('act-equipe-ids');
  if (!dd || !hidEl) return;
  let sel = [];
  try { sel = JSON.parse(hidEl.value || '[]'); } catch(_){}
  dd.innerHTML = colaboradores.map(c => `
    <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;cursor:pointer;font-size:.76rem;hover:background:var(--surface2)">
      <input type="checkbox" value="${_esc(c.id)}" ${sel.includes(c.id)?'checked':''} onchange="window._toggleColabSel('${_esc(c.id)}')"/>
      <span style="width:20px;height:20px;border-radius:50%;background:${c.cor||'#64748b'};display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:.6rem;font-weight:700;flex-shrink:0">${c.nome[0]}</span>
      <span style="flex:1">${_esc(c.nome)}</span>
      <span style="font-size:.62rem;color:var(--text-4)">${_esc(c.equipe)}</span>
    </label>
  `).join('') || '<div style="padding:8px;color:var(--text-4);font-size:.74rem">Nenhum colaborador cadastrado</div>';
}

window._toggleColabSel = function(id) {
  const hidEl = document.getElementById('act-equipe-ids');
  if (!hidEl) return;
  let sel = []; try { sel = JSON.parse(hidEl.value||'[]'); } catch(_){}
  if (sel.includes(id)) sel = sel.filter(x=>x!==id); else sel.push(id);
  hidEl.value = JSON.stringify(sel);
  _renderEquipeChips(sel);
};

function _renderEquipeChips(sel) {
  const cont = document.getElementById('equipe-chips-container');
  if (!cont) return;
  if (!sel.length) { cont.innerHTML = `<span style="font-size:.68rem;color:var(--text-4);padding:2px 4px">Clique para selecionar a equipe...</span>`; return; }
  cont.innerHTML = sel.map(id => {
    const c = colaboradores.find(x=>x.id===id);
    if (!c) return '';
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;background:${c.cor||'#64748b'}20;color:${c.cor||'#64748b'};border:1px solid ${c.cor||'#64748b'}40;font-size:.65rem;font-weight:600">${_esc(c.nome)} <span onclick="event.stopPropagation();window._toggleColabSel('${_esc(id)}')" style="cursor:pointer;opacity:.6">✕</span></span>`;
  }).join('');
}

/* Extender saveActivity original para salvar campos novos */
const _origSaveAct = window.saveActivity;
if (_origSaveAct) {
  window.saveActivity = function() {
    // Buscar os valores dos novos campos antes de chamar o original
    const hEst  = parseFloat(document.getElementById('act-horas-est')?.value)  || 0;
    const hReal = parseFloat(document.getElementById('act-horas-real')?.value) || 0;
    const equip = document.getElementById('act-equipe-ids')?.value || '[]';
    _origSaveAct.call(this);
    // Aplicar nos dados salvos (pegar a atividade recém-salva)
    const acts = window.activities || [];
    if (acts.length) {
      const last = acts[acts.length - 1];
      // Se estava editando, pegar pelo editingActId
      const id = window.editingActId || last.id;
      const idx = acts.findIndex(a=>a.id===id);
      if (idx >= 0) {
        acts[idx].horas_estimadas  = hEst;
        acts[idx].horas_realizadas = hReal;
        acts[idx].equipe_ids       = JSON.parse(equip||'[]');
        // salvar
        try { localStorage.setItem('tf_activities', JSON.stringify(acts)); } catch(_){}
      }
    }
  };
}

/* Extender editAct para preencher campos novos */
const _origEditAct = window.editAct;
if (_origEditAct) {
  window.editAct = function(id) {
    _origEditAct.call(this, id);
    const a = (window.activities||[]).find(x=>x.id===id);
    if (!a) return;
    setTimeout(() => {
      const hEst  = document.getElementById('act-horas-est');
      const hReal = document.getElementById('act-horas-real');
      const hidEl = document.getElementById('act-equipe-ids');
      if (hEst)  hEst.value  = a.horas_estimadas  || '';
      if (hReal) hReal.value = a.horas_realizadas || '';
      const eqIds = a.equipe_ids || [];
      if (hidEl) { hidEl.value = JSON.stringify(eqIds); _renderEquipeChips(eqIds); }
      window._updateHorasPreview();
    }, 80);
  };
}

/* ================================================================
   4. PATCH NA TABELA DE ATIVIDADES — adicionar coluna Horas
   ================================================================ */
function patchAtividadesTable() {
  const thead = document.querySelector('#view-atividades thead tr');
  if (!thead || thead.querySelector('.th-horas')) return;
  // Adicionar cabeçalho antes da coluna "Ações"
  const thHoras = document.createElement('th');
  thHoras.className = 'th-horas';
  thHoras.textContent = 'Horas';
  const lastTh = thead.lastElementChild;
  thead.insertBefore(thHoras, lastTh);
}

/* Monkey-patch renderAtividades para incluir coluna horas */
const _origRenderAts = window.renderAtividades;
if (_origRenderAts) {
  window.renderAtividades = function() {
    _origRenderAts.call(this);
    patchAtividadesTable();
    // Inserir célula de horas em cada linha
    const tbody = document.getElementById('acts-tbody');
    if (!tbody) return;
    const acts = window.activities || [];
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
      if (tr.querySelector('.td-horas')) return;
      // Tentar encontrar qual atividade é essa linha
      const btn = tr.querySelector('[onclick^="editAct"]');
      if (!btn) return;
      const match = btn.getAttribute('onclick').match(/editAct\('([^']+)'\)/);
      if (!match) return;
      const a = acts.find(x=>x.id===match[1]);
      if (!a) return;
      const h   = getHorasAct(a);
      const st  = h.estimadas ? calcStatusHoras(h.estimadas, h.realizadas) : null;
      const td  = document.createElement('td');
      td.className = 'td-horas';
      td.style.whiteSpace = 'nowrap';
      if (st) {
        td.innerHTML = `<div style="display:flex;flex-direction:column;gap:3px">
          <span class="horas-badge ${st.css}">${st.icon} ${st.pct.toFixed(0)}%</span>
          <span style="font-size:.62rem;color:var(--text-4);font-family:var(--font-mono)">${h.realizadas}/${h.estimadas}h</span>
        </div>`;
      } else if (h.estimadas) {
        td.innerHTML = `<span style="font-size:.7rem;color:var(--text-4);font-family:var(--font-mono)">${h.estimadas}h est.</span>`;
      } else {
        td.innerHTML = `<span style="font-size:.65rem;color:var(--text-4)">—</span>`;
      }
      const lastTd = tr.lastElementChild;
      tr.insertBefore(td, lastTd);
    });
  };
}

/* ================================================================
   5. VIEW: COLABORADORES
   ================================================================ */
function renderColaboradores() {
  const el = document.getElementById('view-colaboradores-content');
  if (!el) return;

  const equipes = [...new Set(colaboradores.map(c=>c.equipe).filter(Boolean))].sort();
  const fEq     = document.getElementById('colab-f-equipe')?.value || '';
  const fFn     = document.getElementById('colab-f-funcao')?.value.toLowerCase() || '';

  let list = [...colaboradores];
  if (fEq) list = list.filter(c=>c.equipe === fEq);
  if (fFn) list = list.filter(c=>(c.funcao||'').toLowerCase().includes(fFn));

  // Preencher select equipes
  const selEq = document.getElementById('colab-f-equipe');
  if (selEq && selEq.options.length <= 1) {
    equipes.forEach(eq => { const o=document.createElement('option'); o.value=eq; o.textContent=eq; selEq.appendChild(o); });
  }

  const acts = window.activities || [];
  el.innerHTML = list.map(c => {
    const myActs  = acts.filter(a => (a.responsible||'').toLowerCase() === c.nome.toLowerCase() || (a.equipe_ids||[]).includes(c.id));
    const done    = myActs.filter(a=>a.status==='Concluído').length;
    const hTotEst = myActs.reduce((s,a)=>s+(parseFloat(a.horas_estimadas)||0),0);
    const hTotReal= myActs.reduce((s,a)=>s+(parseFloat(a.horas_realizadas)||0),0);
    const ocupPct = c.carga_semanal > 0 ? Math.min(Math.round(hTotReal / c.carga_semanal * 10), 200) : 0;
    const ocupCor = ocupPct >= 100 ? '#dc2626' : ocupPct >= 80 ? '#d97706' : '#059669';
    return `<div class="colab-card">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px">
        <div class="colab-avatar" style="background:${c.cor||'#64748b'}">${c.nome[0]}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.85rem;color:var(--text-1)">${_esc(c.nome)}</div>
          <div style="font-size:.7rem;color:var(--text-4)">${_esc(c.funcao)}</div>
          <span style="font-size:.62rem;padding:1px 7px;border-radius:10px;background:var(--blue-dim);color:var(--blue);font-weight:600">${_esc(c.equipe)}</span>
        </div>
        <div style="display:flex;gap:4px">
          <button class="action-btn" onclick="window._editColab('${c.id}')" data-tooltip="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="action-btn danger" onclick="window._delColab('${c.id}')" data-tooltip="Excluir"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;text-align:center">
        <div style="padding:6px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
          <div style="font-family:var(--font-head);font-weight:800;font-size:1rem;color:var(--text-1)">${myActs.length}</div>
          <div style="font-size:.58rem;color:var(--text-4);text-transform:uppercase">Tarefas</div>
        </div>
        <div style="padding:6px;background:rgba(5,150,105,.08);border-radius:8px;border:1px solid rgba(5,150,105,.15)">
          <div style="font-family:var(--font-head);font-weight:800;font-size:1rem;color:var(--green)">${done}</div>
          <div style="font-size:.58rem;color:var(--green);text-transform:uppercase">Concluídas</div>
        </div>
        <div style="padding:6px;background:var(--surface2);border-radius:8px;border:1px solid var(--border)">
          <div style="font-family:var(--font-head);font-weight:800;font-size:1rem;color:var(--text-1)">${c.carga_semanal}h</div>
          <div style="font-size:.58rem;color:var(--text-4);text-transform:uppercase">Carga/sem</div>
        </div>
      </div>
      ${hTotEst > 0 ? `<div style="font-size:.68rem;color:var(--text-4);margin-bottom:4px">Horas: ${hTotReal}h realizadas de ${hTotEst}h estimadas</div>` : ''}
      <div style="font-size:.68rem;color:var(--text-3);margin-bottom:4px">Ocupação semanal: <strong style="color:${ocupCor}">${ocupPct}%</strong></div>
      <div class="colab-ocupacao-bar"><div class="colab-ocupacao-fill" style="width:${Math.min(ocupPct,100)}%;background:${ocupCor}"></div></div>
    </div>`;
  }).join('') || `<div class="empty-state" style="grid-column:1/-1;padding:40px"><i class="fa-solid fa-users"></i><p>Nenhum colaborador cadastrado</p></div>`;
}

window._editColab = function(id) {
  const c = colaboradores.find(x=>x.id===id);
  if (!c) return;
  document.getElementById('colab-id').value    = c.id;
  document.getElementById('colab-nome').value  = c.nome;
  document.getElementById('colab-funcao').value= c.funcao;
  document.getElementById('colab-carga').value = c.carga_semanal;
  document.getElementById('colab-equipe').value= c.equipe;
  document.getElementById('colab-cor').value   = c.cor||'#3b82f6';
  document.getElementById('modal-colab').classList.add('open');
};

window._delColab = function(id) {
  if (!confirm('Excluir colaborador?')) return;
  colaboradores = colaboradores.filter(c=>c.id!==id);
  saveColabs();
  renderColaboradores();
  _toast('Colaborador removido', 'info');
};

window._saveColab = function() {
  const id    = document.getElementById('colab-id').value;
  const nome  = document.getElementById('colab-nome').value.trim();
  const funcao= document.getElementById('colab-funcao').value.trim();
  const carga = parseFloat(document.getElementById('colab-carga').value)||44;
  const equipe= document.getElementById('colab-equipe').value.trim();
  const cor   = document.getElementById('colab-cor').value||'#3b82f6';
  if (!nome) return _toast('Nome é obrigatório','error');
  if (id) {
    const idx = colaboradores.findIndex(c=>c.id===id);
    if (idx>=0) colaboradores[idx] = { ...colaboradores[idx], nome, funcao, carga_semanal:carga, equipe, cor };
  } else {
    colaboradores.push({ id:'c'+Date.now().toString(36), nome, funcao, carga_semanal:carga, equipe, cor });
  }
  saveColabs();
  document.getElementById('modal-colab').classList.remove('open');
  renderColaboradores();
  _toast('Colaborador salvo ✓','success');
};

window._openNovoColab = function() {
  ['colab-id','colab-nome','colab-funcao','colab-equipe'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  const cEl = document.getElementById('colab-carga'); if(cEl) cEl.value=44;
  const corEl= document.getElementById('colab-cor'); if(corEl) corEl.value='#3b82f6';
  document.getElementById('modal-colab').classList.add('open');
};

/* ================================================================
   6. VISÃO SEMANAL DA EQUIPE
   ================================================================ */
function renderSemanal() {
  const el = document.getElementById('semanal-content');
  if (!el) return;

  const fProj = document.getElementById('sem-f-proj')?.value || '';
  const fEq   = document.getElementById('sem-f-equipe')?.value || '';
  const semOffset = parseInt(document.getElementById('sem-offset')?.value||0);

  // Calcular a semana atual + offset
  const hoje  = new Date(); hoje.setHours(0,0,0,0);
  const dow   = hoje.getDay(); // 0=dom
  const seg   = new Date(hoje); seg.setDate(hoje.getDate() - (dow===0?6:dow-1) + semOffset*7);
  const dias  = Array.from({length:7}, (_,i) => { const d=new Date(seg); d.setDate(seg.getDate()+i); return d; });
  const diasNomes = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

  let pessoas = [...colaboradores];
  if (fEq) pessoas = pessoas.filter(c=>c.equipe===fEq);

  const acts = (window.activities||[]).filter(a => {
    if (fProj && a.project!==fProj) return false;
    return true;
  });

  // Atualizar filtros
  const selProj = document.getElementById('sem-f-proj');
  if (selProj && selProj.options.length <= 1) {
    const projs = [...new Set(acts.map(a=>a.project).filter(Boolean))].sort();
    projs.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; selProj.appendChild(o); });
  }
  const selEq2 = document.getElementById('sem-f-equipe');
  if (selEq2 && selEq2.options.length <= 1) {
    const eqs = [...new Set(colaboradores.map(c=>c.equipe).filter(Boolean))].sort();
    eqs.forEach(e=>{ const o=document.createElement('option'); o.value=e; o.textContent=e; selEq2.appendChild(o); });
  }

  // Label da semana
  const semLabel = document.getElementById('sem-label');
  if (semLabel) {
    const fmt = d => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
    semLabel.textContent = `${fmt(dias[0])} – ${fmt(dias[6])}`;
  }

  function horasDia(pessoa, dia) {
    const dStr = dia.toISOString().slice(0,10);
    const myActs = acts.filter(a => {
      const resp = (a.responsible||'').toLowerCase() === pessoa.nome.toLowerCase();
      const emEq = (a.equipe_ids||[]).includes(pessoa.id);
      if (!resp && !emEq) return false;
      if (!a.startDate || !a.dueDate) return false;
      return dStr >= a.startDate && dStr <= a.dueDate;
    });
    const total = myActs.reduce((s,a)=>{
      const est = parseFloat(a.horas_estimadas||a.durationH||0)||0;
      if (!est || !a.startDate || !a.dueDate) return s+8; // assume 8h/dia se não tiver estimativa
      const dias = Math.max(1, Math.round((new Date(a.dueDate)-new Date(a.startDate))/86400000)+1);
      return s + est/dias;
    },0);
    return { total: Math.round(total*10)/10, acts:myActs };
  }

  // Totais por dia
  const totaisDia = dias.map(d => {
    const t = pessoas.reduce((s,p)=>s+horasDia(p,d).total,0);
    return Math.round(t*10)/10;
  });

  if (!pessoas.length) {
    el.innerHTML = `<div class="empty-state" style="padding:40px"><i class="fa-solid fa-calendar-week"></i><p>Nenhum colaborador para exibir. Cadastre colaboradores primeiro.</p></div>`;
    return;
  }

  const headDias = dias.map((d,i) => {
    const isHoje = d.toDateString()===hoje.toDateString();
    return `<th style="${isHoje?'color:var(--blue);background:var(--blue-dim)':''}">${diasNomes[i]}<br><span style="font-family:var(--font-mono);font-size:.6rem;font-weight:400">${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span></th>`;
  }).join('');

  const rows = pessoas.map(pessoa => {
    const cargaDia = (pessoa.carga_semanal||44) / 5;
    const cells = dias.map(d => {
      const { total, acts:dayActs } = horasDia(pessoa, d);
      const dow2 = d.getDay();
      if (dow2===0||dow2===6) return `<td style="background:var(--surface2);opacity:.4"><div class="semanal-cell"></div></td>`;
      const pct = cargaDia > 0 ? (total/cargaDia)*100 : 0;
      let cls = total===0?'':'semanal-livre';
      if (pct>=100) cls='semanal-over'; else if (pct>=80) cls='semanal-atencao';
      const pills = dayActs.slice(0,2).map(a=>`<span class="semanal-task-pill" onclick="window.editAct&&editAct('${a.id}')" title="${_esc(a.description)} (${a.project})">${_esc(a.description.length>14?a.description.slice(0,12)+'…':a.description)}</span>`).join('');
      return `<td>
        <div class="semanal-cell">
          <span class="semanal-horas-total ${cls}">${total>0?total+'h':'—'}</span>
          ${pills}
          ${dayActs.length>2?`<span style="font-size:.55rem;color:var(--text-4)">+${dayActs.length-2}</span>`:''}
        </div>
      </td>`;
    }).join('');

    const semTotal = dias.filter(d=>d.getDay()!==0&&d.getDay()!==6).reduce((s,d)=>s+horasDia(pessoa,d).total,0);
    const semCap   = pessoa.carga_semanal||44;
    const semPct   = semCap>0?Math.round(semTotal/semCap*100):0;
    const semCor   = semPct>=100?'#dc2626':semPct>=80?'#d97706':'#059669';

    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:50%;background:${pessoa.cor||'#64748b'};display:flex;align-items:center;justify-content:center;color:#fff;font-size:.7rem;font-weight:800;flex-shrink:0">${pessoa.nome[0]}</div>
          <div>
            <div style="font-weight:700;font-size:.78rem">${_esc(pessoa.nome)}</div>
            <div style="font-size:.62rem;color:var(--text-4)">${_esc(pessoa.funcao)}</div>
          </div>
          <span style="margin-left:auto;font-size:.68rem;font-family:var(--font-mono);font-weight:700;color:${semCor}">${semPct}%</span>
        </div>
      </td>
      ${cells}
      <td class="semanal-footer-cell" style="border-top:none;font-size:.72rem;color:${semCor}">${Math.round(semTotal*10)/10}h</td>
    </tr>`;
  }).join('');

  const footerCells = totaisDia.map((t,i)=>{
    if (dias[i].getDay()===0||dias[i].getDay()===6) return `<td class="semanal-footer-cell" style="opacity:.4">—</td>`;
    return `<td class="semanal-footer-cell">${t}h</td>`;
  }).join('');

  el.innerHTML = `<div class="semanal-wrap">
    <table class="semanal-table">
      <thead><tr><th>Colaborador</th>${headDias}<th style="text-align:center">Semana</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="semanal-footer-cell" style="text-align:left;font-size:.68rem">Total do dia</td>${footerCells}<td class="semanal-footer-cell"></td></tr></tfoot>
    </table>
  </div>`;
}

window.renderSemanal = renderSemanal;
window.semNavWeek = function(dir) {
  const el = document.getElementById('sem-offset');
  if (!el) return;
  el.value = parseInt(el.value||0) + dir;
  renderSemanal();
};

/* ================================================================
   7. DASHBOARD DE INDICADORES
   ================================================================ */
function renderIndicadores() {
  const el = document.getElementById('indicadores-content');
  if (!el) return;
  const acts = window.activities || [];

  // Cálculos gerais
  const comHoras  = acts.filter(a=>a.horas_estimadas>0);
  const totEst    = comHoras.reduce((s,a)=>s+(parseFloat(a.horas_estimadas)||0),0);
  const totReal   = comHoras.reduce((s,a)=>s+(parseFloat(a.horas_realizadas)||0),0);
  const desvioPct = totEst>0 ? ((totReal-totEst)/totEst*100).toFixed(1) : null;
  const overCount = comHoras.filter(a=>{const s=calcStatusHoras(a.horas_estimadas,a.horas_realizadas);return s&&s.pct>120;}).length;

  // Ocupação por colaborador
  const colabData = colaboradores.map(c => {
    const myActs = acts.filter(a=>(a.responsible||'').toLowerCase()===c.nome.toLowerCase()||(a.equipe_ids||[]).includes(c.id));
    const hReal  = myActs.reduce((s,a)=>s+(parseFloat(a.horas_realizadas)||0),0);
    const pct    = c.carga_semanal>0 ? Math.round(hReal/c.carga_semanal*10) : 0;
    return { ...c, hReal, pct };
  }).sort((a,b)=>b.pct-a.pct);

  // Horas por projeto
  const projs = [...new Set(acts.map(a=>a.project).filter(Boolean))];
  const projData = projs.map(p => {
    const pActs = acts.filter(a=>a.project===p);
    const est   = pActs.reduce((s,a)=>s+(parseFloat(a.horas_estimadas)||0),0);
    const real  = pActs.reduce((s,a)=>s+(parseFloat(a.horas_realizadas)||0),0);
    return { nome:p, est, real };
  }).sort((a,b)=>b.real-a.real);

  el.innerHTML = `
    <!-- KPIs rápidos -->
    <div class="ind-grid">
      <div class="ind-card">
        <div class="ind-label">Horas Estimadas (total)</div>
        <div class="ind-val">${totEst.toFixed(0)}<span style="font-size:.9rem;color:var(--text-4)">h</span></div>
        <div class="ind-sub">${comHoras.length} tarefas com estimativa</div>
      </div>
      <div class="ind-card">
        <div class="ind-label">Horas Realizadas (total)</div>
        <div class="ind-val" style="color:${totReal>totEst?'var(--red)':'var(--green)'}">${totReal.toFixed(0)}<span style="font-size:.9rem;color:var(--text-4)">h</span></div>
        <div class="ind-sub">${desvioPct!==null?`Desvio: ${desvioPct>0?'+':''}${desvioPct}%`:'Sem dados'}</div>
      </div>
      <div class="ind-card">
        <div class="ind-label">Tarefas Estouradas</div>
        <div class="ind-val" style="color:${overCount>0?'var(--red)':'var(--green)'}">${overCount}</div>
        <div class="ind-sub">Acima de 120% do estimado</div>
      </div>
      <div class="ind-card">
        <div class="ind-label">Eficiência Média</div>
        <div class="ind-val" style="color:${desvioPct===null?'var(--text-4)':parseFloat(desvioPct)>20?'var(--red)':parseFloat(desvioPct)>0?'var(--amber)':'var(--green)'}">
          ${desvioPct===null?'—':totEst>0?(totEst/totReal*100).toFixed(0)+'%':'—'}
        </div>
        <div class="ind-sub">Estimado / Realizado</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <!-- Ranking sobrecarga -->
      <div class="card">
        <div class="card-header">
          <i class="fa-solid fa-ranking-star" style="color:var(--red);font-size:.85rem"></i>
          <span class="card-title">Ranking de Ocupação</span>
        </div>
        <div class="card-body" style="padding:14px 18px">
          ${colabData.slice(0,8).map((c,i) => {
            const cor = c.pct>=100?'var(--red)':c.pct>=80?'var(--amber)':'var(--green)';
            const w   = Math.min(c.pct,100);
            return `<div class="ranking-row">
              <span style="font-size:.65rem;font-weight:700;color:var(--text-4);width:16px">${i+1}</span>
              <span class="ranking-name">${_esc(c.nome)}</span>
              <div class="ranking-bar-wrap">
                <div class="ranking-bar" style="width:${w}%;background:${cor}"></div>
                <span style="font-family:var(--font-mono);font-size:.68rem;font-weight:700;color:${cor};white-space:nowrap">${c.pct}%</span>
              </div>
              ${c.pct>=100?'<span class="horas-badge horas-over" style="font-size:.58rem">⚠ Sobrecarga</span>':''}
            </div>`;
          }).join('') || '<div style="color:var(--text-4);font-size:.75rem;padding:8px">Nenhum dado</div>'}
        </div>
      </div>

      <!-- Horas por projeto -->
      <div class="card">
        <div class="card-header">
          <i class="fa-solid fa-chart-bar" style="color:var(--blue);font-size:.85rem"></i>
          <span class="card-title">Horas por Projeto</span>
        </div>
        <div class="card-body" style="padding:14px 18px">
          ${projData.map(p => {
            const pct = p.est>0?Math.min(Math.round(p.real/p.est*100),150):0;
            const cor = pct>120?'var(--red)':pct>100?'var(--amber)':'var(--blue)';
            return `<div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                <span style="font-size:.75rem;font-weight:600">${_esc(p.nome)}</span>
                <span style="font-size:.68rem;font-family:var(--font-mono);color:var(--text-4)">${p.real}h / ${p.est>0?p.est+'h':'sem est.'}</span>
              </div>
              ${p.est>0?`<div class="horas-bar-track"><div class="horas-bar-fill" style="width:${Math.min(pct,100)}%;background:${cor}"></div></div>`:''}
            </div>`;
          }).join('') || '<div style="color:var(--text-4);font-size:.75rem;padding:8px">Nenhum dado</div>'}
        </div>
      </div>
    </div>
  `;
}

window.renderIndicadores = renderIndicadores;

/* ================================================================
   8. PDF PROFISSIONAL
   ================================================================ */
window._abrirModalPdf = function() {
  // Preencher select de projetos
  const sel = document.getElementById('pdf-projeto');
  if (sel) {
    const projs = [...new Set((window.activities||[]).map(a=>a.project).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">Todos os projetos</option>' + projs.map(p=>`<option value="${_esc(p)}">${_esc(p)}</option>`).join('');
  }
  document.getElementById('modal-pdf').classList.add('open');
};

window._gerarPDF = function() {
  const projFiltro = document.getElementById('pdf-projeto')?.value || '';
  const empNome    = document.getElementById('pdf-empresa')?.value || empresaConfig.nome || 'Minha Empresa';
  const empContato = document.getElementById('pdf-contato')?.value || empresaConfig.contato || '';
  const empObs     = document.getElementById('pdf-obs')?.value     || empresaConfig.obs || '';
  const logoData   = empresaConfig.logo || null;

  // Salvar config
  empresaConfig.nome    = empNome;
  empresaConfig.contato = empContato;
  empresaConfig.obs     = empObs;
  saveEmpresa();

  const acts = (window.activities||[]).filter(a => !projFiltro || a.project===projFiltro);
  if (!acts.length) return _toast('Nenhuma atividade para exportar','warning');

  const projs = projFiltro ? (window.projects||[]).filter(p=>p.name===projFiltro) : (window.projects||[]);
  const today = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  const num   = `OS-${Date.now().toString().slice(-6)}`;

  // Métricas para resumo executivo
  const total   = acts.length;
  const done    = acts.filter(a=>a.status==='Concluído').length;
  const overdue = acts.filter(a=>a.status==='Vencido'||(a.status!=='Concluído'&&a.dueDate&&new Date(a.dueDate)<new Date())).length;
  const pctDone = total>0?Math.round(done/total*100):0;
  const totEst  = acts.reduce((s,a)=>s+(parseFloat(a.horas_estimadas)||0),0);
  const totReal = acts.reduce((s,a)=>s+(parseFloat(a.horas_realizadas)||0),0);
  const desvio  = totEst>0?((totReal-totEst)/totEst*100).toFixed(1):null;
  const sitLabel= overdue===0&&pctDone>=80?'Dentro do prazo':overdue>0&&overdue<=total*0.3?'Em risco':'Atrasado';
  const sitCor  = sitLabel==='Dentro do prazo'?'#059669':sitLabel==='Em risco'?'#d97706':'#dc2626';

  // Tabela de atividades
  const rowsAtiv = acts.map(a => {
    const h  = getHorasAct(a);
    const st = h.estimadas>0?calcStatusHoras(h.estimadas,h.realizadas):null;
    const stIcon = st?st.icon:'—';
    const stLabel= st?st.label:'—';
    const stCor  = st?st.cor:'#64748b';
    const equipeNomes = (a.equipe_ids||[]).map(id=>{ const c=colaboradores.find(x=>x.id===id); return c?c.nome:''; }).filter(Boolean).join(', ');
    const diffD  = a.dueDate?Math.round((new Date(a.dueDate)-new Date())/86400000):null;
    const statusCor = a.status==='Concluído'?'#059669':a.status==='Vencido'?'#dc2626':a.status==='Em Andamento'?'#d97706':'#2563eb';
    return `<tr>
      <td>${_esc(a.project)}</td>
      <td><strong>${_esc(a.description)}</strong>${a.isCritical?'<br><span style="font-size:9px;color:#dc2626;font-weight:700">CRÍTICO</span>':''}</td>
      <td>${_esc(a.responsible||'—')}</td>
      <td style="font-size:10px">${_esc(equipeNomes||'—')}</td>
      <td style="text-align:center">${h.estimadas>0?h.estimadas+'h':'—'}</td>
      <td style="text-align:center">${h.realizadas>0?h.realizadas+'h':'—'}</td>
      <td style="text-align:center"><span style="color:${stCor};font-weight:600">${stIcon} ${stLabel}</span></td>
      <td><span style="color:${statusCor};font-weight:700">${_esc(a.status)}</span></td>
    </tr>`;
  }).join('');

  // Tabela equipe
  const rowsEquipe = colaboradores.map(c => {
    const myActs = acts.filter(a=>(a.responsible||'').toLowerCase()===c.nome.toLowerCase()||(a.equipe_ids||[]).includes(c.id));
    const hReal  = myActs.reduce((s,a)=>s+(parseFloat(a.horas_realizadas)||0),0);
    const ocupPct= c.carga_semanal>0?Math.round(hReal/c.carga_semanal*10):0;
    const cor    = ocupPct>=100?'#dc2626':ocupPct>=80?'#d97706':'#059669';
    return `<tr>
      <td>${_esc(c.nome)}</td>
      <td>${_esc(c.funcao)}</td>
      <td>${_esc(c.equipe)}</td>
      <td style="text-align:center">${c.carga_semanal}h/sem</td>
      <td style="text-align:center">${hReal}h</td>
      <td style="text-align:center;color:${cor};font-weight:700">${ocupPct}%</td>
    </tr>`;
  }).filter((_,i)=>colaboradores[i]&&acts.some(a=>(a.responsible||'').toLowerCase()===colaboradores[i].nome.toLowerCase()||(a.equipe_ids||[]).includes(colaboradores[i].id))).join('');

  const logoHtml = logoData
    ? `<img src="${logoData}" style="max-height:60px;max-width:160px;object-fit:contain"/>`
    : `<div style="width:60px;height:60px;border-radius:12px;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;letter-spacing:-1px">${empNome[0]}</div>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>OS ${num}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:'Inter',Arial,sans-serif;color:#1a202c;font-size:11px;background:#fff; }
  .page { max-width:900px;margin:0 auto;padding:40px 44px; }

  /* CABEÇALHO */
  .header { display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #1e3a5f;margin-bottom:28px; }
  .header-logo { display:flex;align-items:center;gap:16px; }
  .header-empresa { }
  .header-empresa h1 { font-size:20px;font-weight:800;color:#1e3a5f;letter-spacing:-.5px; }
  .header-empresa p { font-size:10px;color:#718096;margin-top:2px; }
  .header-os { text-align:right; }
  .os-numero { font-size:22px;font-weight:900;color:#1e3a5f;letter-spacing:-1px; }
  .os-data { font-size:10px;color:#718096;margin-top:4px; }
  .os-badge { display:inline-block;background:#1e3a5f;color:#fff;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;margin-top:6px; }

  /* SEÇÃO */
  .section { margin-bottom:28px; }
  .section-title { font-size:10px;font-weight:800;color:#4a5568;text-transform:uppercase;letter-spacing:.12em;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:14px;display:flex;align-items:center;gap:6px; }
  .section-title::before { content:'';display:inline-block;width:3px;height:12px;background:#1e3a5f;border-radius:2px; }

  /* RESUMO EXECUTIVO */
  .resumo-grid { display:grid;grid-template-columns:2fr 1fr;gap:16px; }
  .resumo-texto { background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px; }
  .resumo-texto p { line-height:1.6;color:#4a5568;font-size:10.5px; }
  .resumo-kpis { display:flex;flex-direction:column;gap:8px; }
  .kpi-box { background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;text-align:center; }
  .kpi-box .v { font-size:22px;font-weight:800;color:#1e3a5f;line-height:1; }
  .kpi-box .l { font-size:9px;color:#718096;text-transform:uppercase;letter-spacing:.08em;margin-top:2px; }
  .situacao-badge { display:inline-block;padding:4px 12px;border-radius:20px;font-weight:700;font-size:10px;border:2px solid; }

  /* TABELA */
  table { width:100%;border-collapse:collapse;font-size:10px; }
  th { background:#1e3a5f;color:#fff;padding:8px 10px;text-align:left;font-weight:700;font-size:9.5px;letter-spacing:.05em; }
  td { padding:7px 10px;border-bottom:1px solid #edf2f7;vertical-align:top; }
  tr:nth-child(even) td { background:#f8fafc; }
  tr:hover td { background:#ebf4ff; }

  /* INDICADORES */
  .ind-row { display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px; }
  .ind-box { background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center; }
  .ind-box .v { font-size:18px;font-weight:800;color:#1e3a5f; }
  .ind-box .l { font-size:9px;color:#718096;text-transform:uppercase;letter-spacing:.06em;margin-top:2px; }

  /* RODAPÉ */
  .footer { margin-top:40px;padding-top:16px;border-top:2px solid #1e3a5f;display:flex;justify-content:space-between;align-items:flex-start;color:#718096;font-size:9px; }
  .assinatura-box { border-top:1px solid #4a5568;width:200px;padding-top:6px;text-align:center;font-size:9px;color:#4a5568; }

  @media print {
    .page { padding:20px 24px; }
    body { print-color-adjust:exact;-webkit-print-color-adjust:exact; }
  }
  @page { size:A4;margin:12mm; }
</style>
</head>
<body>
<div class="page">

  <!-- CABEÇALHO -->
  <div class="header">
    <div class="header-logo">
      ${logoHtml}
      <div class="header-empresa">
        <h1>${_esc(empNome)}</h1>
        <p>${_esc(empContato)}</p>
      </div>
    </div>
    <div class="header-os">
      <div class="os-numero">${num}</div>
      <div class="os-data">Emitido em ${today}</div>
      ${projs.length===1?`<div style="margin-top:4px;font-size:10px;color:#4a5568">Projeto: <strong>${_esc(projs[0].name)}</strong></div>`:''}
      ${projs.length===1&&projs[0].manager?`<div style="font-size:10px;color:#4a5568">Responsável: <strong>${_esc(projs[0].manager)}</strong></div>`:''}
      <div><span class="os-badge">ORDEM DE SERVIÇO</span></div>
    </div>
  </div>

  <!-- RESUMO EXECUTIVO -->
  <div class="section">
    <div class="section-title">Resumo Executivo</div>
    <div class="resumo-grid">
      <div class="resumo-texto">
        <p>
          Este relatório apresenta o status atual ${projFiltro?`do projeto <strong>${_esc(projFiltro)}</strong>`:'dos projetos em andamento'}.
          ${done === total ? `Todas as <strong>${total}</strong> atividades foram <strong>concluídas com sucesso</strong>.` :
            `Das <strong>${total}</strong> atividades registradas, <strong>${done}</strong> foram concluídas (${pctDone}%),
            ${overdue>0?`<strong>${overdue}</strong> estão atrasadas e `:''}${total-done-overdue} permanecem em andamento.`}
          ${totEst>0?`O projeto tem <strong>${totEst.toFixed(0)}h estimadas</strong> e <strong>${totReal.toFixed(0)}h realizadas</strong>${desvio?` (desvio de ${desvio}%)`:''}.`:''}
        </p>
        <div style="margin-top:12px">
          <span class="situacao-badge" style="color:${sitCor};border-color:${sitCor}">${sitLabel==='Dentro do prazo'?'✔ ':sitLabel==='Em risco'?'⚠ ':'✖ '}${sitLabel}</span>
        </div>
      </div>
      <div class="resumo-kpis">
        <div class="kpi-box"><div class="v">${pctDone}%</div><div class="l">Concluído</div></div>
        <div class="kpi-box"><div class="v" style="color:${overdue>0?'#dc2626':'#059669'}">${overdue}</div><div class="l">Atrasadas</div></div>
        <div class="kpi-box"><div class="v">${totEst>0?totEst.toFixed(0)+'h':'—'}</div><div class="l">Horas prev.</div></div>
      </div>
    </div>
  </div>

  <!-- INDICADORES -->
  <div class="section">
    <div class="section-title">Indicadores do Projeto</div>
    <div class="ind-row">
      <div class="ind-box"><div class="v">${totEst>0?totEst.toFixed(0)+'h':'—'}</div><div class="l">Total Planejado</div></div>
      <div class="ind-box"><div class="v" style="color:${totReal>totEst&&totEst>0?'#dc2626':'#059669'}">${totReal>0?totReal.toFixed(0)+'h':'—'}</div><div class="l">Total Executado</div></div>
      <div class="ind-box"><div class="v" style="color:${desvio&&parseFloat(desvio)>0?'#dc2626':'#059669'}">${desvio?`${desvio>0?'+':''}${desvio}%`:'—'}</div><div class="l">Desvio</div></div>
      <div class="ind-box"><div class="v" style="color:${sitCor}">${sitLabel}</div><div class="l">Situação Geral</div></div>
    </div>
  </div>

  <!-- ATIVIDADES -->
  <div class="section">
    <div class="section-title">Detalhamento das Atividades</div>
    <table>
      <thead>
        <tr>
          <th>Projeto</th>
          <th>Atividade</th>
          <th>Responsável</th>
          <th>Equipe</th>
          <th style="text-align:center">H. Est.</th>
          <th style="text-align:center">H. Real.</th>
          <th style="text-align:center">Horas Status</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rowsAtiv}</tbody>
    </table>
  </div>

  ${rowsEquipe ? `
  <!-- EQUIPE -->
  <div class="section" style="page-break-before:auto">
    <div class="section-title">Visão da Equipe</div>
    <table>
      <thead>
        <tr>
          <th>Colaborador</th>
          <th>Função</th>
          <th>Equipe</th>
          <th style="text-align:center">Carga Semanal</th>
          <th style="text-align:center">H. Trabalhadas</th>
          <th style="text-align:center">% Ocupação</th>
        </tr>
      </thead>
      <tbody>${rowsEquipe}</tbody>
    </table>
  </div>` : ''}

  <!-- RODAPÉ -->
  <div class="footer">
    <div>
      <div style="font-weight:700;color:#4a5568;font-size:10px">${_esc(empNome)}</div>
      ${empContato?`<div>${_esc(empContato)}</div>`:''}
      ${empObs?`<div style="margin-top:4px;max-width:300px">${_esc(empObs)}</div>`:''}
    </div>
    <div style="text-align:right">
      <div class="assinatura-box">Assinatura / Aprovação</div>
      <div style="margin-top:8px;font-size:9px;color:#a0aec0">Gerado por TaskFlow PRO</div>
    </div>
  </div>

</div>
<script>window.onload=function(){setTimeout(()=>window.print(),400)};<\/script>
</body>
</html>`;

  const nomeProjeto = projFiltro ? projFiltro.replace(/\s+/g,'_') : 'GERAL';
  const win = window.open('','_blank');
  if (!win) return _toast('Permita pop-ups para gerar o PDF','warning');
  win.document.write(html);
  win.document.close();
  _toast(`PDF gerado: OS_${num}_${nomeProjeto}.pdf`,'success');
};

/* ================================================================
   9. LOGO UPLOAD
   ================================================================ */
window._handleLogoUpload = function(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    empresaConfig.logo = ev.target.result;
    saveEmpresa();
    const preview = document.getElementById('logo-preview');
    if (preview) preview.innerHTML = `<img src="${ev.target.result}" style="max-height:50px;border-radius:6px"/>`;
    _toast('Logo carregado ✓','success');
  };
  r.readAsDataURL(f);
};

/* ================================================================
   10. INJETAR HTML (views, modais, nav)
   ================================================================ */
function injectHTML() {
  // ── NAV ITEM: Colaboradores, Indicadores, Semanal
  const navCalendarios = document.querySelector('.sidebar-section:has(a[onclick*="cal-atividades"])');
  if (navCalendarios && !document.getElementById('nav-colaboradores')) {
    const newSection = document.createElement('div');
    newSection.className = 'sidebar-section';
    newSection.innerHTML = `
      <div class="sidebar-section-label">Operacional</div>
      <a class="nav-item" id="nav-colaboradores" onclick="switchView('colaboradores', this)" data-tooltip="Colaboradores">
        <span class="nav-icon"><i class="fa-solid fa-id-card"></i></span>
        <span>Colaboradores</span>
      </a>
      <a class="nav-item" id="nav-semanal" onclick="switchView('semanal', this)" data-tooltip="Visão Semanal">
        <span class="nav-icon"><i class="fa-solid fa-calendar-week"></i></span>
        <span>Visão Semanal</span>
      </a>
      <a class="nav-item" id="nav-indicadores" onclick="switchView('indicadores', this)" data-tooltip="Indicadores">
        <span class="nav-icon"><i class="fa-solid fa-gauge-high"></i></span>
        <span>Indicadores</span>
      </a>
    `;
    navCalendarios.before(newSection);
  }

  // ── VIEWS
  const mainContent = document.getElementById('main-content') || document.querySelector('.main-content') || document.querySelector('.content') || document.querySelector('main');
  if (!mainContent) return;

  if (!document.getElementById('view-colaboradores')) {
    const vColab = document.createElement('div');
    vColab.className = 'view';
    vColab.id = 'view-colaboradores';
    vColab.innerHTML = `
      <div class="section-hd">
        <span class="section-hd-title">Colaboradores</span>
        <button class="btn-primary" onclick="window._openNovoColab()"><i class="fa-solid fa-plus"></i> Novo Colaborador</button>
      </div>
      <div class="card">
        <div class="filter-bar">
          <span class="filter-label">Filtrar:</span>
          <select class="filter-select" id="colab-f-equipe" onchange="renderColaboradores()"><option value="">Todas as equipes</option></select>
          <input class="filter-select" id="colab-f-funcao" placeholder="Buscar função..." oninput="renderColaboradores()" style="width:160px"/>
          <button class="btn-secondary" onclick="document.getElementById('colab-f-equipe').value='';document.getElementById('colab-f-funcao').value='';renderColaboradores()" style="margin-left:auto"><i class="fa-solid fa-xmark"></i> Limpar</button>
        </div>
      </div>
      <div id="view-colaboradores-content" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px"></div>
    `;
    mainContent.appendChild(vColab);
  }

  if (!document.getElementById('view-semanal')) {
    const vSem = document.createElement('div');
    vSem.className = 'view';
    vSem.id = 'view-semanal';
    vSem.innerHTML = `
      <div class="section-hd">
        <span class="section-hd-title">Visão Semanal da Equipe</span>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          <button class="btn-secondary" onclick="window.semNavWeek(-1)"><i class="fa-solid fa-chevron-left"></i></button>
          <span id="sem-label" style="font-size:.8rem;font-weight:600;min-width:140px;text-align:center;color:var(--text-2)">...</span>
          <button class="btn-secondary" onclick="window.semNavWeek(1)"><i class="fa-solid fa-chevron-right"></i></button>
          <button class="btn-secondary" onclick="document.getElementById('sem-offset').value=0;renderSemanal()"><i class="fa-solid fa-house"></i> Hoje</button>
        </div>
      </div>
      <div class="card">
        <div class="filter-bar">
          <span class="filter-label">Filtrar:</span>
          <select class="filter-select" id="sem-f-proj" onchange="renderSemanal()"><option value="">Todos os projetos</option></select>
          <select class="filter-select" id="sem-f-equipe" onchange="renderSemanal()"><option value="">Todas as equipes</option></select>
          <input type="hidden" id="sem-offset" value="0"/>
        </div>
        <div class="card-body" style="padding:0">
          <div id="semanal-content"></div>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px;font-size:.72rem;color:var(--text-3)"><span style="width:12px;height:12px;border-radius:3px;background:#059669;display:inline-block"></span> Dentro da capacidade (&lt;80%)</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:.72rem;color:var(--text-3)"><span style="width:12px;height:12px;border-radius:3px;background:#d97706;display:inline-block"></span> Atenção (80–100%)</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:.72rem;color:var(--text-3)"><span style="width:12px;height:12px;border-radius:3px;background:#dc2626;display:inline-block"></span> Sobrecarregado (≥100%)</div>
      </div>
    `;
    mainContent.appendChild(vSem);
  }

  if (!document.getElementById('view-indicadores')) {
    const vInd = document.createElement('div');
    vInd.className = 'view';
    vInd.id = 'view-indicadores';
    vInd.innerHTML = `
      <div class="section-hd">
        <span class="section-hd-title">Indicadores Operacionais</span>
        <button class="btn-secondary" onclick="renderIndicadores()"><i class="fa-solid fa-arrows-rotate"></i> Atualizar</button>
      </div>
      <div id="indicadores-content"></div>
    `;
    mainContent.appendChild(vInd);
  }

  // ── MODAL COLABORADOR
  if (!document.getElementById('modal-colab')) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-colab';
    m.setAttribute('onclick', "if(event.target.id==='modal-colab')this.classList.remove('open')");
    m.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <i class="fa-solid fa-id-card" style="color:var(--blue)"></i>
          <span class="modal-title">Colaborador</span>
          <button class="modal-close" onclick="document.getElementById('modal-colab').classList.remove('open')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="colab-id"/>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Nome <span class="req">*</span></label>
              <input class="form-control" id="colab-nome" placeholder="Nome completo"/>
            </div>
            <div class="form-group">
              <label class="form-label">Função</label>
              <input class="form-control" id="colab-funcao" placeholder="Ex: Engenheiro, Técnico..."/>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Equipe</label>
              <input class="form-control" id="colab-equipe" placeholder="Ex: Equipe 01"/>
            </div>
            <div class="form-group">
              <label class="form-label">Carga Semanal (h)</label>
              <input class="form-control" type="number" id="colab-carga" value="44" min="1" max="80" style="font-family:var(--font-mono)"/>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Cor de identificação</label>
            <input class="form-control" type="color" id="colab-cor" value="#3b82f6" style="height:36px;padding:2px 6px"/>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="document.getElementById('modal-colab').classList.remove('open')">Cancelar</button>
          <button class="btn-primary" onclick="window._saveColab()"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
  }

  // ── MODAL PDF
  if (!document.getElementById('modal-pdf')) {
    const m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-pdf';
    m.setAttribute('onclick', "if(event.target.id==='modal-pdf')this.classList.remove('open')");
    m.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <i class="fa-solid fa-file-pdf" style="color:var(--red)"></i>
          <span class="modal-title">Exportar PDF — Ordem de Serviço</span>
          <button class="modal-close" onclick="document.getElementById('modal-pdf').classList.remove('open')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="pdf-section-title"><i class="fa-solid fa-building"></i> Dados da Empresa</div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Nome da Empresa</label>
              <input class="form-control" id="pdf-empresa" placeholder="Ex: Minha Empresa Ltda"/>
            </div>
            <div class="form-group">
              <label class="form-label">Contato / Site</label>
              <input class="form-control" id="pdf-contato" placeholder="Ex: contato@empresa.com.br"/>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Logo da Empresa <span style="color:var(--text-4);font-weight:400">(opcional)</span></label>
            <div style="display:flex;align-items:center;gap:10px">
              <label style="cursor:pointer">
                <input type="file" accept="image/*" onchange="window._handleLogoUpload(event)" style="display:none"/>
                <span class="btn-secondary" style="display:inline-flex;align-items:center;gap:6px"><i class="fa-solid fa-image"></i> Escolher logo</span>
              </label>
              <div id="logo-preview" style="min-height:30px"></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Observações gerais (rodapé)</label>
            <input class="form-control" id="pdf-obs" placeholder="Ex: Documento sujeito a aprovação do cliente."/>
          </div>
          <div class="pdf-section-title" style="margin-top:8px"><i class="fa-solid fa-filter"></i> Conteúdo</div>
          <div class="form-group">
            <label class="form-label">Projeto</label>
            <select class="form-control" id="pdf-projeto">
              <option value="">Todos os projetos</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="document.getElementById('modal-pdf').classList.remove('open')">Cancelar</button>
          <button class="btn-primary" onclick="window._gerarPDF()" style="background:var(--red);box-shadow:0 2px 8px rgba(220,38,38,.3)">
            <i class="fa-solid fa-file-pdf"></i> Gerar PDF
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
  }

  // ── BOTÃO PDF no header
  const headerBtns = document.querySelector('.header-actions') || document.querySelector('.header-right') || document.querySelector('.page-header div:last-child');
  if (headerBtns && !document.getElementById('btn-exportar-pdf-global')) {
    const btn = document.createElement('button');
    btn.id = 'btn-exportar-pdf-global';
    btn.className = 'btn-secondary';
    btn.setAttribute('onclick', "window._abrirModalPdf()");
    btn.title = 'Exportar OS em PDF';
    btn.innerHTML = '<i class="fa-solid fa-file-pdf" style="color:var(--red)"></i> <span>Exportar OS</span>';
    headerBtns.appendChild(btn);
  }
}

/* Patch switchView para suportar novas views */
const _origSwitchView = window.switchView;
if (_origSwitchView) {
  window.switchView = function(name, el) {
    _origSwitchView.call(this, name, el);
    const extra = {
      colaboradores:'Colaboradores',
      semanal:'Visão Semanal',
      indicadores:'Indicadores',
    };
    if (extra[name]) {
      const tEl = document.getElementById('page-title');
      if (tEl) tEl.textContent = extra[name];
    }
    if (name==='colaboradores') renderColaboradores();
    if (name==='semanal')       renderSemanal();
    if (name==='indicadores')   renderIndicadores();
  };
}

/* ─── UTILS LOCAIS ──────────────────────────────────────────── */
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _toast(msg, type='info') {
  if (window.toast) { window.toast(msg, type); return; }
  if (window.showToast) { window.showToast(msg, type); return; }
  console.log('[Toast]', msg);
}

/* ================================================================
   INIT
   ================================================================ */
function init() {
  injectStyles();
  loadColabs();
  loadAloc();
  loadEmpresa();
  injectHTML();
  injectActivityModalFields();

  // Pré-preencher campos empresa
  const empNome = document.getElementById('pdf-empresa');
  const empCont = document.getElementById('pdf-contato');
  const empObs  = document.getElementById('pdf-obs');
  if (empNome) empNome.value = empresaConfig.nome||'';
  if (empCont) empCont.value = empresaConfig.contato||'';
  if (empObs)  empObs.value  = empresaConfig.obs||'';

  // Logo preview
  if (empresaConfig.logo) {
    const preview = document.getElementById('logo-preview');
    if (preview) preview.innerHTML = `<img src="${empresaConfig.logo}" style="max-height:50px;border-radius:6px"/>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  setTimeout(init, 500); // garante que o sistema principal carregou primeiro
}

})(); // fim IIFE
