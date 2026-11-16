/* ═══════════════════════════════════════════════════════════════
   Mercronos · dados.js
   Estado global (atividades, projetos, filtros) e dados de exemplo
   (separado do index.html na Fase 0 — a ordem de carregamento importa)
═══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
const STORAGE_ACTS  = 'tf_activities';
const STORAGE_PROJ  = 'tf_projects';

let activities = [];
let projects   = [];
let sortField  = 'dueDate';
let sortDir    = 1;
let editingActId  = null;
let editingProjId = null;
let chartProj = null, chartDonut = null, chartStatusFull = null, chartTeamFull = null, chartProjFull = null;

const COLORS = ['#2563eb','#059669','#d97706','#dc2626','#7c3aed','#0ea5e9','#f97316','#ec4899'];
const PROJECT_COLORS_MAP = {};

/* ══════════════════════════════════════════════════
   SEED DATA
══════════════════════════════════════════════════ */
// Data no formato AAAA-MM-DD no fuso local (toISOString() usa UTC e pode virar o dia).
function dataLocalISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function iso(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return dataLocalISO(d);
}

const SEED_PROJECTS = [
  { id:'p1', name:'Manipuladores',  code:'MAN-001', desc:'Manipuladores 1 e 2',               manager:'Enagio',     status:'Em andamento', startDate:iso(-30), endDate:iso(40),  color:'#2563eb', progress:35 },
  { id:'p2', name:'RETIFICA 01',    code:'RET-001', desc:'Cronograma de entrega Retífica 01', manager:'João Paulo', status:'Em andamento', startDate:iso(-20), endDate:iso(50),  color:'#059669', progress:28 },
  { id:'p3', name:'RETIFICA 02',    code:'RET-002', desc:'Cronograma de entrega Retífica 02', manager:'João Paulo', status:'Em andamento', startDate:iso(-10), endDate:iso(60),  color:'#d97706', progress:15 },
];

const SEED_ACTS = [
  { id:'a1',  project:'Manipuladores', description:'Compra de material',           responsible:'JOÃO PAULO', startDate:iso(-14), dueDate:iso(5),   status:'Pendente',    progress:50, duration:'152h', isCritical:false, obs:'' },
  { id:'a2',  project:'Manipuladores', description:'Fabricação das peças',         responsible:'JOÃO PAULO', startDate:iso(-5),  dueDate:iso(25),  status:'Pendente',    progress:0,  duration:'200h', isCritical:true,  obs:'' },
  { id:'a3',  project:'Manipuladores', description:'Pintura geral',                responsible:'JOÃO PAULO', startDate:iso(22),  dueDate:iso(34),  status:'Pendente',    progress:0,  duration:'24h',  isCritical:false, obs:'' },
  { id:'a4',  project:'Manipuladores', description:'Mobilização do material',      responsible:'JOÃO PAULO', startDate:iso(30),  dueDate:iso(37),  status:'Pendente',    progress:0,  duration:'8h',   isCritical:false, obs:'' },
  { id:'a5',  project:'Manipuladores', description:'Instalação da máquina',        responsible:'JOÃO PAULO', startDate:iso(35),  dueDate:iso(42),  status:'Pendente',    progress:0,  duration:'32h',  isCritical:true,  obs:'' },
  { id:'a6',  project:'RETIFICA 01',   description:'Compra de material',           responsible:'JOÃO PAULO', startDate:iso(-9),  dueDate:iso(0),   status:'Pendente',    progress:0,  duration:'24h',  isCritical:true,  obs:'' },
  { id:'a7',  project:'RETIFICA 01',   description:'Fabricação',                   responsible:'JOÃO PAULO', startDate:iso(6),   dueDate:iso(24),  status:'Pendente',    progress:0,  duration:'112h', isCritical:false, obs:'' },
  { id:'a8',  project:'RETIFICA 01',   description:'Pintura',                      responsible:'JOÃO PAULO', startDate:iso(20),  dueDate:iso(31),  status:'Pendente',    progress:0,  duration:'8h',   isCritical:false, obs:'' },
  { id:'a9',  project:'RETIFICA 01',   description:'Mobilização',                  responsible:'JOÃO PAULO', startDate:iso(28),  dueDate:iso(37),  status:'Pendente',    progress:0,  duration:'8h',   isCritical:false, obs:'' },
  { id:'a10', project:'RETIFICA 01',   description:'Instalação',                   responsible:'JOÃO PAULO', startDate:iso(35),  dueDate:iso(44),  status:'Reprogramado',progress:0,  duration:'32h',  isCritical:true,  obs:'' },
  { id:'a11', project:'RETIFICA 02',   description:'Aquisição dos materiais',      responsible:'JOÃO PAULO', startDate:iso(-9),  dueDate:iso(18),  status:'Pendente',    progress:0,  duration:'144h', isCritical:false, obs:'' },
  { id:'a12', project:'RETIFICA 02',   description:'Fabricação de partes mecânicas', responsible:'JOÃO PAULO', startDate:iso(18), dueDate:iso(40),  status:'Pendente',    progress:0,  duration:'72h',  isCritical:false, obs:'' },
  { id:'a13', project:'RETIFICA 02',   description:'Montagem de quadro elétrico',  responsible:'DAVID',      startDate:iso(36),  dueDate:iso(52),  status:'Pendente',    progress:0,  duration:'56h',  isCritical:false, obs:'' },
  { id:'a14', project:'RETIFICA 02',   description:'Pintura',                      responsible:'JOÃO PAULO', startDate:iso(44),  dueDate:iso(55),  status:'Pendente',    progress:0,  duration:'16h',  isCritical:false, obs:'' },
  { id:'a15', project:'RETIFICA 02',   description:'Fabricação Mecânica',          responsible:'Joao Paulo', startDate:iso(28),  dueDate:iso(59),  status:'Pendente',    progress:0,  duration:'304h', isCritical:false, obs:'' },
];
