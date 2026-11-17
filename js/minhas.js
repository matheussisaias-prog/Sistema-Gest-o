/* Aprumo · minhas.js — tela "Minhas atividades": o que cada pessoa tem para fazer, avanço com foto, "Travou",
   e funcionamento sem internet (fila guardada no aparelho, enviada quando a conexão volta). */
(() => {
  'use strict';
  /* ── utilidades ─────────────────────────────── */
  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el[k] = v; else el.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat(9)) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
    return el;
  }
  const ic = n => h('i', { class: 'fa-solid ' + n, 'aria-hidden': 'true' });
  const eu = () => (window.tfServidor && tfServidor.estado && tfServidor.estado.usuario) || {};
  const T = s => Date.parse(s + 'T00:00:00Z');
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
  const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const SEMANA_LONGA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const diaSem = s => SEMANA[new Date(T(s)).getUTCDay()];
  const hora = iso => { if (!iso) return ''; const d = new Date(String(iso).replace(' ', 'T') + (String(iso).length <= 19 && !/Z|[+-]\d\d:?\d\d$/.test(iso) ? 'Z' : '')); return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); };
  const plural = (n, um, varios) => n === 1 ? `1 ${um}` : `${n} ${varios}`;
  const celular = () => window.innerWidth <= 760;
  const largo = () => window.innerWidth > 1100;
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
  const novoId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const raiz = () => document.getElementById('view-minhas');
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    let r; try { r = await fetch('api/' + rota, op); } catch (_) { const e = new Error('Sem internet'); e.rede = true; throw e; }
    let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }

  /* ── fila sem internet (IndexedDB) ──────────── */
  const DB = { db: null };
  function abrirDB() {
    if (DB.db) return Promise.resolve(DB.db);
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('sem IndexedDB')); return; }
      const r = indexedDB.open('tf-campo', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('fila', { keyPath: 'id_local' }); };
      r.onsuccess = () => { DB.db = r.result; res(DB.db); }; r.onerror = () => rej(r.error);
    });
  }
  async function fila(op, val) {
    const db = await abrirDB();
    return new Promise((res, rej) => {
      const t = db.transaction('fila', op === 'listar' ? 'readonly' : 'readwrite'), st = t.objectStore('fila');
      const r = op === 'listar' ? st.getAll() : op === 'por' ? st.put(val) : st.delete(val);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  const F = { itens: [], enviando: false, erro: null };
  async function lerFila() { try { F.itens = (await fila('listar')).filter(x => x.usuario === eu().id).sort((a, b) => a.criado - b.criado); } catch (_) { F.itens = F.itens || []; } }
  async function guardar(item) {
    item.usuario = eu().id; item.criado = Date.now();
    try { await fila('por', item); } catch (_) { F.itens.push(item); }
    await lerFila();
  }
  async function enviarFila() {
    if (F.enviando) return; await lerFila();
    if (!F.itens.length) return;
    F.enviando = true; desenharAviso();
    let enviou = 0;
    for (const it of [...F.itens]) {
      try {
        await api(`atividades/${it.atividade_id}/${it.tipo}`, 'POST', it.dados);
        await fila('apagar', it.id_local).catch(() => {}); enviou++; F.erro = null;
      } catch (e) {
        if (e.rede || e.status >= 500 || e.status === 401 || e.status === 408 || e.status === 429) { F.erro = e.rede ? null : e.message; break; }
        await fila('apagar', it.id_local).catch(() => {});                 // recusado pelo servidor: não adianta reenviar
        avisar(`Não foi possível enviar “${it.titulo}”: ${e.message}`, 'error');
      }
    }
    F.enviando = false; await lerFila();
    if (enviou) { avisar(`✓ ${plural(enviou, 'atualização enviada', 'atualizações enviadas')}`, 'success'); if (window.tfServidor && tfServidor.estado.semRede) { location.reload(); return; } carregar(true); }
    else desenharAviso();
  }

  /* ── estado e carga ─────────────────────────── */
  const M = { d: null, ver: '', obra: '', carregando: false, erro: null, mais: false };
  // Como o Kanban: cada grupo mostra só os cartões que cabem na tela e pagina ("‹ 1/N ›"); a página continua depois de atualizar (F5)
  const MP = { pag: {}, por: 0, alt: 170 };
  try { const g = JSON.parse(sessionStorage.getItem('tf-minhas-pag') || 'null'); if (g) { MP.pag = g.pag || {}; M.mais = !!g.mais; } } catch (_) {}
  const mpGuardar = () => { try { sessionStorage.setItem('tf-minhas-pag', JSON.stringify({ pag: MP.pag, mais: M.mais })); } catch (_) {} };
  const mpLim = n => Math.max(1, Math.min(10, n));
  const chaveCache = () => `tf-minhas-${eu().id}-${M.ver || 'auto'}-${M.obra || ''}`;
  async function abrir() {
    const nav = document.getElementById('nav-minhas');
    window.switchView('minhas', nav);
  }
  async function carregar(silencioso) {
    const chave = chaveCache();
    if (!M.d) { try { const c = localStorage.getItem(chave); if (c) { M.d = JSON.parse(c); M.d._cache = true; } } catch (_) {} }
    M.carregando = true; if (!silencioso) desenhar();
    try {
      const q = new URLSearchParams(); if (M.ver) q.set('ver', M.ver); if (M.obra) q.set('obra', M.obra);
      M.d = await api('minhas-atividades' + (q.toString() ? '?' + q : ''));
      try { localStorage.setItem(chave, JSON.stringify(M.d)); } catch (_) {}            // guardada com o mesmo nome com que será procurada
      M.ver = M.d.ver; M.erro = null;
      try { localStorage.setItem(chaveCache(), JSON.stringify(M.d)); } catch (_) {}
    } catch (e) { M.erro = e.rede ? null : e.message; if (M.d) M.d._cache = true; }
    M.carregando = false; await lerFila(); desenhar();
  }

  /* ── desenho ────────────────────────────────── */
  function saudacao() { const hh = +new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }); return hh < 12 ? 'Bom dia' : hh < 18 ? 'Boa tarde' : 'Boa noite'; }
  function dataLonga(s) { const d = new Date(T(s)); return `${SEMANA_LONGA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; }
  function desenharAviso() {
    const box = document.querySelector('#view-minhas .mi-aviso-box'); if (!box) return;
    box.innerHTML = '';
    const n = F.itens.length, off = !navigator.onLine || (window.tfServidor && tfServidor.estado.semRede);
    if (off) box.append(h('div', { class: 'mi-aviso', role: 'status' }, ic('fa-wifi'), h('span', null, h('b', null, 'Sem internet. '),
      n ? `${plural(n, 'atualização guardada', 'atualizações guardadas')}; envia${n > 1 ? 'm' : ''} quando a conexão voltar.` : 'Mostrando a última lista carregada. O que você atualizar fica guardado.')));
    else if (n) box.append(h('div', { class: 'mi-aviso azul', role: 'status' }, ic(F.enviando ? 'fa-arrows-rotate fa-spin' : 'fa-cloud-arrow-up'),
      h('span', null, F.enviando ? `Enviando ${plural(n, 'atualização', 'atualizações')}…` : `${plural(n, 'atualização aguardando', 'atualizações aguardando')} envio${F.erro ? ' (' + F.erro + ')' : ''}.`),
      F.enviando ? null : h('button', { onclick: enviarFila }, 'Enviar agora')));
  }
  function desenhar(fixo) {
    const R = raiz(); if (!R || !R.classList.contains('active')) return;
    let por = MP.por || (largo() ? 3 : 2);
    pintar(por);
    if (fixo || !M.d || !R.offsetParent) return;
    const sobra = () => { const box = R.querySelector('.mi'); return box ? Math.max(0, ...[...box.children].map(c => c.getBoundingClientRect().bottom)) - (window.innerHeight - 12) : 0; };   // pintar() refaz a tela: procura de novo
    const medir = () => { const cs = [...R.querySelectorAll('.mi-grupo .mi-card')]; if (cs.length) MP.alt = Math.max(...cs.map(c => c.getBoundingClientRect().height)); };
    medir();
    for (let i = 0; i < 4; i++) {
      const s = sobra(), passo = MP.alt + 10;
      const novo = s > 0 ? mpLim(por - Math.ceil(s / passo)) : s < -passo ? mpLim(por + Math.floor(-s / passo)) : por;
      if (novo === por) break;
      pintar(novo); medir();
      if (novo > por && sobra() > 0) { pintar(por); break; }
      por = novo;
    }
    MP.por = por;
  }
  function pintar(por) {
    const R = raiz(); if (!R) return;
    const y = window.scrollY;
    R.innerHTML = '';
    const box = h('div', { class: 'mi' + (largo() ? ' largo' : '') });
    R.append(box);
    box.append(h('div', { class: 'mi-aviso-box' }));
    const d = M.d;
    if (!d) { box.append(h('div', { class: 'mi-vazio' }, M.erro ? h('p', { class: 'mi-erro' }, M.erro) : h('p', null, 'Carregando…'))); desenharAviso(); return; }
    const pend = new Map(F.itens.map(x => [x.atividade_id + ':' + x.tipo, x]));
    const nome = (d.nome || eu().nome || '').split(' ')[0];
    const cab = h('div', { class: 'mi-cab' },
      h('div', { class: 'mi-ola' }, h('h1', null, `${saudacao()}, ${nome}`), h('p', null, dataLonga(d.hoje), d.obras_encarregado && d.obras_encarregado.length ? ` · encarregado na ${d.obras_encarregado.join(' e na ')}` : '')));
    const ctr = h('div', { class: 'mi-ctr' });
    if (d.pode_equipe) {
      const b = (v, t) => h('button', { 'aria-pressed': d.ver === v ? 'true' : 'false', class: d.ver === v ? 'on' : '', onclick: () => { if (M.ver === v) return; M.ver = v; M.d = null; carregar(); } }, t);
      ctr.append(h('div', { class: 'mi-seg', role: 'group', 'aria-label': 'Quais atividades' }, b('minhas', 'Minhas'), b('equipe', 'Da minha equipe')));
    }
    if (d.obras.length > 1 || M.obra) ctr.append(h('select', { class: 'mi-sel', 'aria-label': 'Obra', onchange: e => { M.obra = e.target.value; M.d = null; carregar(); } },
      h('option', { value: '' }, 'Todas as obras'), d.obras.map(o => h('option', { value: o.id, selected: String(o.id) === String(M.obra) }, `${o.codigo ? o.codigo + ' · ' : ''}${o.nome}`))));
    if (window.tfRdo && eu().perfil && eu().perfil !== 'funcionario' && d.obras.length) {        // encarregado e gestor: RDO do dia da obra
      const alvo = d.obras.find(o => String(o.id) === String(M.obra)) || d.obras.find(o => (d.obras_encarregado || []).includes(o.codigo)) || d.obras[0];
      const rh = (d.rdos_hoje || {})[alvo.id], tarde = new Date().getHours() >= 16, falta = d.rdo_lembrete && tarde && (!rh || (rh.situacao === 'Rascunho' && !rh.enviado));
      ctr.append(h('button', { class: 'mi-rdo' + (falta ? ' lembrete' : ''), onclick: () => tfRdo.hoje(alvo.id) }, h('i', { class: 'fa-solid ' + (falta ? 'fa-bell' : 'fa-clipboard-list'), 'aria-hidden': 'true' }),
        falta ? ` RDO de hoje ainda não enviado · ${alvo.codigo || alvo.nome}` : ` RDO de hoje · ${alvo.codigo || alvo.nome}`));
    }
    if (ctr.childNodes.length) cab.append(ctr);
    box.append(cab);
    const r = d.resumo;
    const ind = (n, t, cls, alvo) => h('button', { class: 'mi-ind ' + cls, onclick: () => { if (M.mais) { M.mais = false; mpGuardar(); desenhar(true); } const g = document.getElementById('mi-g-' + alvo); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' }); } }, h('b', null, n), h('span', null, t));
    const inds = h('div', { class: 'mi-inds' }, ind(r.atrasadas, r.atrasadas === 1 ? 'atrasada' : 'atrasadas', 'verm', 'atrasadas'));
    if (r.travadas || !celular()) inds.append(ind(r.travadas, r.travadas === 1 ? 'travada' : 'travadas', 'lar', 'atrasadas'));
    inds.append(ind(r.hoje, 'para hoje', 'azul', 'hoje'), ind(r.semana, 'esta semana', 'cinza', 'semana'));
    box.append(inds);
    if (d.ver === 'minhas' && !d.tem_ficha) box.append(h('div', { class: 'mi-vazio' }, h('p', null, 'Seu usuário não está ligado a uma pessoa da equipe, então não há atividades no seu nome. Veja "Da minha equipe".')));
    const g = h('div', { class: 'mi-grupos' });
    const grupo = (k, titulo, cls, lista) => {
      const s = h('section', { class: 'mi-grupo', id: 'mi-g-' + k, 'aria-label': titulo }, h('h2', { class: cls }, h('span', null, titulo), h('span', null, lista.length)));
      if (!lista.length) s.append(h('p', { class: 'mi-nada' }, k === 'atrasadas' ? 'Nada atrasado.' : k === 'hoje' ? 'Nada para hoje.' : 'Nada começando esta semana.'));
      const paginas = Math.max(1, Math.ceil(lista.length / por));
      const pg = Math.min(Math.max(MP.pag[k] || 0, 0), paginas - 1); if (R.offsetParent) MP.pag[k] = pg;
      lista.slice(pg * por, pg * por + por).forEach(a => s.append(cartao(a, k, pend)));
      if (paginas > 1) {
        const ir = passo => () => { MP.pag[k] = pg + passo; mpGuardar(); desenhar(true); };
        s.append(h('div', { class: 'mi-pag' },
          h('button', { type: 'button', class: 'mi-pbt', 'aria-label': 'Página anterior', disabled: pg === 0, onclick: ir(-1) }, ic('fa-chevron-left')),
          h('span', null, `${pg + 1}/${paginas}`),
          h('button', { type: 'button', class: 'mi-pbt', 'aria-label': 'Próxima página', disabled: pg >= paginas - 1, onclick: ir(1) }, ic('fa-chevron-right'))));
      }
      return s;
    };
    const extra = d.grupos.proximas.length + d.grupos.concluidas.length;
    if (!extra && M.mais) M.mais = false;
    if (M.mais) { g.classList.add('dois'); g.append(grupo('proximas', 'Próximas', 'cinza', d.grupos.proximas), grupo('concluidas', 'Concluídas nos últimos 7 dias', 'verd', d.grupos.concluidas)); }
    else g.append(grupo('atrasadas', 'Atrasadas', 'verm', d.grupos.atrasadas), grupo('hoje', 'Hoje', 'azul', d.grupos.hoje), grupo('semana', 'Esta semana', 'cinza', d.grupos.semana));
    if (extra) {
      box.append(h('button', { class: 'mi-mais', 'aria-expanded': M.mais ? 'true' : 'false', onclick: () => { M.mais = !M.mais; mpGuardar(); desenhar(); } },
        M.mais ? 'Voltar para atrasadas, hoje e esta semana' : `Próximas (${d.grupos.proximas.length}) · Concluídas nos últimos 7 dias (${d.grupos.concluidas.length})`));
    }
    box.append(g);
    if (d._cache && navigator.onLine && M.carregando) box.append(h('p', { class: 'mi-nota' }, 'Atualizando…'));
    if (M.erro) box.append(h('p', { class: 'mi-erro' }, M.erro));
    desenharAviso();
    window.scrollTo(0, y);
  }
  function cartao(a, grupo, pend) {
    const d = M.d, aberta = a.situacao !== 'Concluído' && a.avanco < 100;
    const p1 = pend.get(a.id + ':avanco'), p2 = pend.get(a.id + ':impedimento');
    const av = p1 ? p1.dados.avanco : a.avanco;
    const trav = p2 ? { descricao: p2.titulo2, desde: null, por: 'Você', pendente: true } : a.travada;
    const tipo = !aberta || av >= 100 ? 'ok' : grupo === 'atrasadas' ? 'atr' : grupo === 'hoje' ? 'hoje' : 'sem';
    const selo = tipo === 'ok' ? 'Concluída' : tipo === 'atr' ? plural(a.atraso_dias, 'dia', 'dias') : grupo === 'hoje' ? 'Hoje' : a.inicio ? diaSem(a.inicio).replace(/^./, c => c.toUpperCase()) + ' ' + dBR(a.inicio) : '';
    let datas;
    if (tipo === 'atr') datas = `${dBR(a.inicio)} → ${dBR(a.fim)} · ${plural(a.atraso_dias, 'dia', 'dias')} de atraso`;
    else if (grupo === 'hoje') datas = `${dBR(a.inicio)} → ${dBR(a.fim)}${a.fim === d.hoje ? ' · termina hoje' : ''}`;
    else if (grupo === 'semana' || grupo === 'proximas') datas = `Começa ${diaSem(a.inicio)}, ${dBR(a.inicio)}${a.duracao_dias ? ' · ' + plural(Math.round(a.duracao_dias), 'dia útil', 'dias úteis') : ''}`;
    else datas = `${dBR(a.inicio)} → ${dBR(a.fim)}`;
    const quem = a.minha ? 'Você' : (a.responsavel_nome || 'Sem responsável');
    const pode = d.perfil !== 'funcionario' || a.minha;
    const passo = n => () => {
      const alvo = Math.max(0, Math.min(100, n));
      if (d.foto_obrigatoria || alvo >= 100) folhaAvanco(a, alvo); else salvarAvanco(a, alvo, [], '');
    };
    const c = h('article', { class: 'mi-card ' + tipo + (p1 ? ' pend' : ''), 'data-id': a.id },
      h('button', { class: 'mi-card-topo', onclick: () => folhaAvanco(a, null), 'aria-label': `Atualizar ${a.descricao}` },
        h('span', { class: 'mi-card-t' }, h('small', null, `${a.codigo ? a.codigo + ' · ' : ''}${a.obra}`), h('b', null, a.descricao), h('small', null, datas)),
        selo ? h('span', { class: 'mi-selo ' + tipo }, selo) : null));
    if (trav && aberta) c.append(h('div', { class: 'mi-trav' }, ic('fa-triangle-exclamation'),
      h('span', null, 'Travou: ', trav.descricao, trav.pendente ? ' · guardado, avisa o gestor quando a internet voltar' : trav.desde ? ` · avisado às ${hora(trav.desde)}` : ''),
      !trav.pendente && d.perfil !== 'funcionario' && a.travada ? h('button', { onclick: () => liberar(a) }, 'Liberar') : null));
    if (aberta || p1) c.append(h('div', { class: 'mi-av' },
      h('button', { class: 'mi-bt', 'aria-label': 'Diminuir 10%', disabled: !pode || av <= 0, onclick: passo(av - 10) }, '−'),
      h('div', { class: 'mi-barra' }, h('div', { class: 'mi-trilho' }, h('i', { style: `width:${av}%` })),
        h('small', null, h('span', null, `${av}% feito`), p1 ? h('span', { class: 'mi-guard' }, ic('fa-clock'), ' guardado') : (a.ultimo && a.ultimo.com_foto) ? h('span', { class: 'mi-foto' }, ic('fa-camera'), ' com foto') : null)),
      h('button', { class: 'mi-bt', 'aria-label': 'Aumentar 10%', disabled: !pode || av >= 100, onclick: passo(av + 10) }, '+'),
      h('button', { class: 'mi-bt ok', 'aria-label': 'Concluir', disabled: !pode || av >= 100, onclick: passo(100) }, ic('fa-check'))));
    c.append(h('div', { class: 'mi-pe' }, h('span', null, quem, a.fotos ? h('button', { class: 'mi-link', onclick: () => verFotos(a) }, ` · ${plural(a.fotos, 'foto', 'fotos')}`) : null),
      aberta && pode ? h('button', { class: 'mi-travou', onclick: () => folhaTravou(a) }, ic('fa-triangle-exclamation'), ' Travou') : null));
    return c;
  }

  /* ── folhas (janelas de baixo) ──────────────── */
  function folha(titulo, sub, corpo, cls) {
    const fundo = h('div', { class: 'mi-fundo', role: 'presentation' });
    const f = h('div', { class: 'mi-folha ' + (cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('span', { class: 'mi-puxa', 'aria-hidden': 'true' }),
      h('div', { class: 'mi-folha-cab' }, h('div', null, h('small', null, sub), h('h2', null, titulo)), h('button', { class: 'mi-x', 'aria-label': 'Fechar', onclick: () => fechar() }, ic('fa-xmark'))),
      corpo);
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') fechar(); };
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', esc);
    fundo.append(f); document.body.append(fundo);
    return fechar;
  }
  // foto: reduz para 1600 px (JPEG) e guarda hora e GPS
  let gps = null;
  function pedirGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => { gps = { latitude: p.coords.latitude, longitude: p.coords.longitude }; }, () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 120000 });
  }
  function reduzir(arq) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(arq), img = new Image();
      img.onload = () => {
        const r = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não consegui abrir essa imagem')); };
      img.src = url;
    });
  }
  function seletorFotos(fotos, obrig, aoMudar) {
    const box = h('div', { class: 'mi-fotos' });
    const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, hidden: true, 'aria-label': 'Foto do serviço',
      onchange: async e => {
        for (const arq of [...e.target.files].slice(0, 6 - fotos.length)) {
          try { fotos.push({ dados: await reduzir(arq), tirada_em: new Date().toISOString(), ...(gps || {}) }); } catch (er) { avisar(er.message, 'error'); }
        }
        inp.value = ''; desenha(); aoMudar();
      } });
    const desenha = () => {
      box.innerHTML = '';
      fotos.forEach((f, i) => box.append(h('div', { class: 'mi-mini', style: `background-image:url('${f.dados}')` },
        h('span', null, hora(f.tirada_em), f.latitude != null ? ' · GPS ok' : ''),
        h('button', { 'aria-label': 'Tirar a foto ' + (i + 1), onclick: () => { fotos.splice(i, 1); desenha(); aoMudar(); } }, '×'))));
      if (fotos.length < 6) box.append(h('button', { class: 'mi-add-foto', onclick: () => inp.click() }, ic('fa-camera'), fotos.length ? 'Mais uma' : 'Tirar foto'));
      box.append(inp);
    };
    desenha();
    return h('div', { class: 'mi-campo' }, h('div', { class: 'mi-rot' }, 'Foto do serviço ', h('span', { class: obrig ? 'obrig' : '' }, obrig ? '· obrigatória' : '· opcional')), box);
  }
  function folhaAvanco(a, alvo) {
    const d = M.d, obrig = d.foto_obrigatoria;
    if (d.perfil === 'funcionario' && !a.minha) return;
    pedirGps();
    const atual = a.avanco;
    let novo = alvo != null ? alvo : Math.min(100, Math.ceil((atual + 1) / 10) * 10);
    if (novo === atual && atual < 100) novo = Math.min(100, atual + 10);
    const fotos = [];
    const valor = h('b', null);
    const opcoes = h('div', { class: 'mi-ops', role: 'radiogroup', 'aria-label': 'Novo avanço' });
    const sug = [...new Set([Math.min(100, Math.floor(atual / 10) * 10 + 10), Math.min(100, Math.floor(atual / 10) * 10 + 20), Math.min(100, Math.floor(atual / 10) * 10 + 30), novo, 100])].filter(v => v > atual || v === novo).sort((x, y) => x - y).slice(-4);
    const faixa = h('input', { type: 'range', min: '0', max: '100', step: '5', value: novo, 'aria-label': 'Avanço em %', oninput: e => { novo = +e.target.value; atualizar(); } });
    const com = h('textarea', { rows: '2', placeholder: 'Ex.: concluído o trecho A, falta o trecho B', 'aria-label': 'Comentário', oninput: () => atualizar() });
    const rotCom = h('span', { class: 'mi-rot' });
    const salvar = h('button', { class: 'mi-bt-pri' });
    const nota = h('p', { class: 'mi-nota-f' });
    const atualizar = () => {
      valor.innerHTML = ''; valor.append(h('s', null, `${atual}%`), ' → ', h('b', null, `${novo}%`));
      opcoes.innerHTML = '';
      sug.forEach(v => opcoes.append(h('button', { class: novo === v ? 'on' : '', role: 'radio', 'aria-checked': novo === v ? 'true' : 'false', onclick: () => { novo = v; faixa.value = v; atualizar(); } }, v === 100 ? '100% ✓' : `${v}%`)));
      const falta = obrig && !fotos.length, semCom = d.comentario_concluir && novo >= 100 && atual < 100 && !com.value.trim();
      rotCom.textContent = d.comentario_concluir && novo >= 100 ? 'Comentário · obrigatório para concluir' : 'Comentário (opcional)';
      salvar.disabled = falta || semCom || novo === atual;
      salvar.textContent = novo >= 100 ? `Concluir${fotos.length ? ' com ' + plural(fotos.length, 'foto', 'fotos') : ''}` : `Salvar avanço${fotos.length ? ' com ' + plural(fotos.length, 'foto', 'fotos') : ''}`;
      nota.textContent = falta ? 'Tire uma foto do serviço para salvar.' : semCom ? 'Escreva o que foi entregue para concluir.' : !navigator.onLine ? 'Sem internet: fica guardado e envia quando a conexão voltar.' : '';
    };
    const corpo = h('div', { class: 'mi-folha-corpo' },
      h('div', { class: 'mi-campo' }, h('div', { class: 'mi-rot linha' }, h('span', null, 'Avanço'), valor), opcoes, faixa),
      seletorFotos(fotos, obrig, atualizar),
      h('label', { class: 'mi-campo' }, rotCom, com),
      salvar, nota);
    const fechar = folha(a.descricao, `${a.codigo ? a.codigo + ' · ' : ''}${a.obra}`, corpo);
    salvar.onclick = async () => { salvar.disabled = true; await salvarAvanco(a, novo, fotos, com.value.trim()); fechar(); };
    atualizar();
  }
  async function salvarAvanco(a, novo, fotos, comentario) {
    const item = { id_local: novoId(), tipo: 'avanco', atividade_id: a.id, titulo: a.descricao, dados: { avanco: novo, comentario, fotos } };
    item.dados.id_local = item.id_local;
    await guardar(item);
    desenhar();
    if (navigator.onLine) await enviarFila(); else avisar('Guardado: envia quando a internet voltar.', 'info');
  }
  function folhaTravou(a) {
    pedirGps();
    let motivo = '';
    const fotos = [];
    const lista = h('div', { class: 'mi-motivos', role: 'radiogroup', 'aria-label': 'O que travou' });
    const txt = h('textarea', { rows: '2', placeholder: 'Ex.: faltam 40 caixas 4x4', 'aria-label': 'O que falta' });
    const bt = h('button', { class: 'mi-bt-pri laranja', disabled: true }, 'Avisar o gestor');
    const ICONES = { material: 'fa-box', liberacao: 'fa-lock', clima: 'fa-cloud-rain', equipamento: 'fa-screwdriver-wrench', outro: 'fa-pen' };
    const des = () => {
      lista.innerHTML = '';
      M.d.motivos.forEach(m => lista.append(h('button', { class: motivo === m.id ? 'on' : '', role: 'radio', 'aria-checked': motivo === m.id ? 'true' : 'false', onclick: () => { motivo = m.id; des(); } }, ic(ICONES[m.id] || 'fa-circle'), m.nome)));
      bt.disabled = !motivo;
    };
    des();
    const corpo = h('div', { class: 'mi-folha-corpo' }, lista,
      h('label', { class: 'mi-campo' }, h('span', { class: 'mi-rot' }, 'O que falta? (ajuda o gestor a resolver)'), txt),
      seletorFotos(fotos, false, () => {}), bt, h('p', { class: 'mi-nota-f' }, 'A atividade fica marcada como travada na obra até alguém liberar.'));
    const fechar = folha('O que travou?', `${a.codigo ? a.codigo + ' · ' : ''}${a.descricao}`, corpo, 'travou');
    bt.onclick = async () => {
      if (motivo === 'outro' && !txt.value.trim()) { avisar('Conte o que travou.', 'error'); txt.focus(); return; }
      bt.disabled = true;
      const nomeMotivo = M.d.motivos.find(m => m.id === motivo).nome;
      const item = { id_local: novoId(), tipo: 'impedimento', atividade_id: a.id, titulo: a.descricao, titulo2: nomeMotivo + (txt.value.trim() ? ': ' + txt.value.trim() : ''),
                     dados: { motivo, descricao: txt.value.trim(), fotos } };
      item.dados.id_local = item.id_local;
      await guardar(item); fechar(); desenhar();
      if (navigator.onLine) await enviarFila(); else avisar('Guardado: avisa o gestor quando a internet voltar.', 'info');
    };
  }
  async function liberar(a) {
    try { await api(`ocorrencias/${a.travada.id}/liberar`, 'PATCH', {}); avisar('✓ Atividade liberada', 'success'); carregar(true); }
    catch (e) { avisar(e.message, 'error'); }
  }
  async function verFotos(a) {
    let L = [];
    try { L = (await api(`atividades/${a.id}/fotos`)).fotos; } catch (e) { avisar(e.rede ? 'Sem internet para abrir as fotos agora.' : e.message, 'error'); return; }
    const g = h('div', { class: 'mi-galeria' });
    L.forEach(f => g.append(h('a', { href: `api/fotos/${f.id}`, target: '_blank', rel: 'noopener', class: 'mi-gal-item' },
      h('img', { src: `api/fotos/${f.id}?mini=1`, alt: `Foto de ${f.por}`, loading: 'lazy' }),
      h('small', null, `${f.por.split(' ')[0]} · ${hora(f.tirada_em)} ${f.tirada_em.slice(8, 10)}/${f.tirada_em.slice(5, 7)}`, f.tipo === 'travou' ? ' · travou' : f.para != null ? ` · ${f.de}% → ${f.para}%` : ''))));
    folha(`Fotos · ${a.descricao}`, `${a.codigo || ''}`, h('div', { class: 'mi-folha-corpo' }, L.length ? g : h('p', null, 'Ainda sem fotos.')));
  }

  /* ── ligação com o menu ─────────────────────── */
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome === 'minhas') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Minhas atividades'; desenhar(); carregar(); }
  };
  window.addEventListener('online', () => { desenharAviso(); setTimeout(enviarFila, 800); });
  window.addEventListener('offline', desenharAviso);
  window.addEventListener('resize', (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => { const R = raiz(); if (R && R.classList.contains('active')) { MP.por = 0; desenhar(); } }, 150); }; })());
  setInterval(() => { if (navigator.onLine && F.itens.length && !F.enviando) enviarFila(); }, 30000);
  window.tfMinhas = { abrir, recarregar: () => carregar(true), estado: M, fila: F, enviarFila };
  lerFila().then(() => { if (navigator.onLine && F.itens.length) enviarFila(); });
})();
