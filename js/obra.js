/* Mercronos · obra.js — tela "Obra aberta": cabeçalho, abas e cronograma (tabela + Gantt), painel da atividade e celular */
(() => {
  'use strict';
  const PODE_TUDO = ['administrador', 'gestor'];
  const SIT_TXT = { 'Planejamento': 'Planejamento', 'Em andamento': 'Em andamento', 'Pausado': 'Pausada', 'Concluído': 'Concluída', 'Arquivado': 'Arquivada' };
  const SIT_CLS = { 'Planejamento': 'plan', 'Em andamento': 'and', 'Pausado': 'pau', 'Concluído': 'con', 'Arquivado': 'arq' };
  const TIPO_LIG = { TC: 'Término → Início', CC: 'Início → Início', TT: 'Término → Término', CT: 'Início → Término' };
  const ESCALA = { dias: 30, semanas: 14, meses: 4 };
  const ROW = 40;
  const O = { id: null, d: null, carregando: false, erro: null, aba: 'crono', escala: 'semanas', sel: new Set(), recolhidas: new Set(),
    f: { busca: '', resp: '', mostrar: 'todas', chip: 'todas' }, equipe: null, novoNivel: 0 };

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
  const svg = (tag, attrs, ...filhos) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); filhos.forEach(f => el.append(f)); return el; };
  const ic = n => h('i', { class: 'fa-solid ' + n, 'aria-hidden': 'true' });
  const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const eu = () => (window.tfServidor && tfServidor.estado.usuario) || {};
  const podeTudo = () => PODE_TUDO.includes(eu().perfil);
  const T = s => Date.parse(s + 'T00:00:00Z');
  const dias = (a, b) => Math.round((T(b) - T(a)) / 864e5);
  const mais = (s, n) => new Date(T(s) + n * 864e5).toISOString().slice(0, 10);
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
  const dBRano = s => s ? dBR(s) + '/' + s.slice(0, 4) : '';
  const durTxt = v => v == null ? '' : (Number(v) % 1 ? String(v).replace('.', ',') : String(Math.round(v))) + 'd';
  const celular = () => window.innerWidth <= 760;
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
  const raiz = () => document.getElementById('view-obra');
  function modal(titulo, corpo, botoes) {
    return new Promise(res => {
      const fechar = v => { f.remove(); document.removeEventListener('keydown', esc); res(v); };
      const esc = ev => { if (ev.key === 'Escape') fechar(null); };
      const f = h('div', { class: 'ob-fundo og-modal', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'og-janela' }, h('h3', null, titulo), corpo,
          h('div', { class: 'og-bts' }, botoes.map(([txt, val, cls]) => h('button', { class: 'ob-bt ' + (cls || ''), onclick: () => fechar(typeof val === 'function' ? val() : val) }, txt)))));
      f.addEventListener('mousedown', ev => { if (ev.target === f) fechar(null); });
      document.addEventListener('keydown', esc); document.body.append(f);
      (f.querySelector('textarea,input') || f.querySelector('.og-bts .ob-bt:last-child')).focus();
    });
  }
  async function equipe() { if (!O.equipe) O.equipe = (await api('funcionarios')).funcionarios || []; return O.equipe; }

  /* ── carregar ───────────────────────────────── */
  async function abrir(id) {
    O.id = +id; O.d = null; O.gx = null; O.sel.clear(); O.aba = 'crono'; O.f = { busca: '', resp: '', mostrar: 'todas', chip: 'todas' }; O.equipe = null;
    const nav = document.getElementById('nav-obras');
    window.switchView('obra', nav);
    await carregar();
  }
  async function carregar() {
    O.carregando = true; O.erro = null; if (!O.d) desenhar();
    try { O.d = await api(`obras/${O.id}/cronograma`); } catch (e) { O.erro = e.message; }
    O.carregando = false; desenhar();
  }
  function aposMudar(r, msg) {
    const n = (r && r.movidas || []).length;
    avisar(n ? `${msg} ${n} atividade${n > 1 ? 's foram empurradas' : ' foi empurrada'} pelas ligações.` : msg, 'success');
    try { if (window.tfServidor && tfServidor.recarregar) tfServidor.recarregar(); } catch (_) {}
    return carregar();
  }

  /* ── linhas visíveis (etapas recolhidas e filtros) ─ */
  function linhas() {
    const A = O.d.atividades, f = O.f, b = sem(f.busca.trim()), hoje = O.d.hoje, fimSemana = mais(hoje, 7);
    const filtrando = b || f.resp || f.mostrar !== 'todas' || f.chip !== 'todas';
    const porId = new Map(A.map(a => [a.id, a]));
    const casa = a => !a.etapa && (!b || sem(a.descricao + ' ' + (a.responsavel_nome || '')).includes(b)) && (!f.resp || String(a.responsavel_id) === f.resp)
      && (f.mostrar !== 'atrasadas' || a.atrasada) && (f.mostrar !== 'criticas' || a.critica)
      && (f.chip !== 'atrasadas' || a.atrasada) && (f.chip !== 'semana' || (a.inicio && a.inicio <= fimSemana && a.fim >= hoje && a.situacao !== 'Concluído'));
    if (filtrando) {
      const manter = new Set();
      A.forEach(a => { if (casa(a)) { manter.add(a.id); let p = a.pai_id; while (p && porId.has(p)) { manter.add(p); p = porId.get(p).pai_id; } } });
      return A.filter(a => manter.has(a.id));
    }
    const out = [];
    const escondido = a => { let p = a.pai_id; while (p && porId.has(p)) { if (O.recolhidas.has(p)) return true; p = porId.get(p).pai_id; } return false; };
    A.forEach(a => { if (!escondido(a)) out.push(a); });
    return out;
  }

  /* ── desenho geral ──────────────────────────── */
  function desenhar() {
    const R = raiz(); if (!R) return;
    const y = window.scrollY, gx = R.querySelector('.og-dir');
    if (gx) O.gx = gx.scrollLeft;
    R.style.minHeight = R.offsetHeight + 'px';           // segura a altura para a página não pular para o topo
    R.innerHTML = '';
    requestAnimationFrame(() => { R.style.minHeight = ''; window.scrollTo(0, y); });
    if (O.erro) { R.append(h('div', { class: 'ob-vazio' }, ic('fa-triangle-exclamation'), h('p', null, O.erro), h('button', { class: 'ob-bt', onclick: () => voltar() }, 'Voltar para Obras'))); return; }
    if (!O.d) { R.append(h('div', { class: 'ob-vazio' }, ic('fa-spinner fa-spin'), h('p', null, 'Carregando a obra…'))); return; }
    const w = h('div', { class: 'og' });
    w.append(cabecalho(), abas());
    if (O.aba === 'crono') w.append(celular() ? cronoCelular() : cronograma());
    else if (window.tfObraAbas && tfObraAbas[O.aba]) w.append(tfObraAbas[O.aba](O, { api, h, ic, carregar, avisar, modal, podeTudo, equipe, aposMudar, painel, desenhar, eu }));
    else w.append(h('div', { class: 'ob-vazio' }, ic('fa-person-digging'), h('p', null, 'Esta aba entra na próxima parte.')));
    R.append(w);
    if (celular() && podeTudo() && O.aba === 'crono' && O.d.atividades.length) R.append(h('button', { class: 'og-fab', onclick: () => painel(null) }, ic('fa-plus'), 'Atividade'));
  }
  function voltar() { const nav = document.getElementById('nav-obras'); window.switchView('obras', nav); }

  function cabecalho() {
    const o = O.d.obra || {}, fa = farolDe(o), hj = O.d.hoje;
    const prazo = !o.fim ? 'sem prazo final' : o.situacao === 'Concluído' ? 'concluída' : dias(hj, o.fim) < 0 ? `${-dias(hj, o.fim)} dias atrasada` : `faltam ${dias(hj, o.fim)} dias`;
    const barra = (rot, v, cls) => h('div', { class: 'og-bar ' + cls }, h('span', null, rot), h('div', { class: 'ob-bar-trilho' }, h('div', { class: 'ob-bar-ench', style: `width:${Math.max(0, Math.min(100, v || 0))}%` })), h('b', null, v == null ? '—' : Math.round(v) + '%'));
    const dado = (rot, ...v) => h('div', { class: 'og-dado' }, h('small', null, rot), h('div', null, ...v));
    const cal = O.d.calendario || {};
    const hs = cal.horas_semana || [8, 8, 8, 8, 8, 0, 0];
    const calTxt = `Seg–Sex ${hs[0]} h` + (hs[5] ? ` · Sáb ${hs[5]} h` : '') + (hs[6] ? ` · Dom ${hs[6]} h` : '') + (cal.id ? '' : ' · feriados nacionais');
    return h('section', { class: 'og-cab' },
      h('nav', { class: 'og-trilha', 'aria-label': 'Caminho' }, h('button', { class: 'og-link', onclick: voltar }, ic('fa-arrow-left'), 'Obras'), h('span', null, '›'), h('span', null, o.codigo || o.nome)),
      h('div', { class: 'og-cab-topo' },
        h('div', { class: 'og-cab-id' },
          h('div', { class: 'og-cod' }, h('span', { class: 'ob-cor', style: `background:${o.cor || '#94a3b8'}` }), o.codigo || '', o.tipo_servico ? h('span', { class: 'ob-tipo' }, o.tipo_servico) : null),
          h('h1', null, o.nome), h('div', { class: 'og-cli' }, [o.cliente, o.local_obra, o.numero_contrato ? 'Contrato ' + o.numero_contrato : null].filter(Boolean).join(' · ')),
          h('div', { class: 'ob-etqs' }, h('span', { class: 'ob-sit ' + SIT_CLS[o.situacao] }, SIT_TXT[o.situacao]),
            fa ? h('span', { class: 'ob-chip-farol ' + fa.cls }, h('i', { class: 'ob-ponto' }), fa.txt) : null)),
        podeTudo() ? h('div', { class: 'og-acoes' },
          h('button', { class: 'ob-bt og-so-pc', onclick: () => window.tfObras && tfObras.editar(o) }, ic('fa-pen'), 'Editar obra'),
          h('button', { class: 'ob-bt og-so-pc', onclick: salvarLinhaBase }, ic('fa-floppy-disk'), O.d.linha_base ? 'Reprogramar linha de base' : 'Salvar linha de base'),
          window.tfObraExportar ? h('button', { class: 'ob-bt og-so-pc', onclick: ev => tfObraExportar(ev.currentTarget, O) }, ic('fa-download'), 'Exportar') : null,
          h('button', { class: 'ob-bt ob-bt-pri og-so-pc', onclick: () => focarNova() }, ic('fa-plus'), 'Nova atividade'),
          h('button', { class: 'ob-menu-bt og-mais', 'aria-label': 'Mais ações', onclick: ev => menuObra(ev.currentTarget, o) }, ic('fa-ellipsis'))) : null),
      h('div', { class: 'og-dados' },
        h('div', { class: 'og-barras' }, barra('Real', o.avanco_real, 'real ' + (fa ? fa.cls : '')), barra('Previsto', o.avanco_previsto, 'prev')),
        dado('Prazo', `${o.inicio ? dBR(o.inicio) : '?'} → ${o.fim ? dBRano(o.fim) : '?'} · `, h('b', null, prazo)),
        dado('Atrasadas', h('b', { class: o.atrasadas ? 'verm' : 'verd' }, o.atrasadas ?? 0)),
        dado('Gestor · RT', [o.gestor || '—', o.rt_nome].filter(Boolean).join(' · '), o.art_numero ? h('small', { class: 'og-sub' }, 'ART ' + o.art_numero) : null),
        podeTudo() ? dado('Contrato', (o.valor_contrato != null ? Number(o.valor_contrato).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '—') + ' · Medido —') : null,
        dado('Calendário', window.tfObraCalendario && podeTudo() ? h('button', { class: 'og-link', onclick: () => tfObraCalendario(O, { carregar }) }, cal.nome) : h('span', null, cal.nome), h('small', { class: 'og-sub' }, calTxt))));
  }
  function farolDe(o) {
    const pts = o.desvio != null ? Math.max(0, Math.round(o.desvio)) : 0;
    if (o.farol === 'vermelho') return { cls: 'verm', txt: pts > 15 ? `Atrasada · ${pts} pts` : 'Atrasada · prazo vencido' };
    if (o.farol === 'amarelo') return { cls: 'amar', txt: `Atenção · ${pts} pts` };
    if (o.farol === 'verde') return { cls: 'verd', txt: 'No prazo' };
    return null;
  }
  function menuObra(bt, o) {
    document.querySelectorAll('.ob-menu').forEach(m => m.remove());
    const item = (icone, txt, fn, perigo) => h('button', { role: 'menuitem', class: perigo ? 'perigo' : '', onclick: () => { m.remove(); fn(); } }, ic(icone), txt);
    const mudar = async (sit, p) => { if (window.tfObras) { await tfObras.mudar(o, sit, p); carregar(); } };
    const m = h('div', { class: 'ob-menu', role: 'menu' },
      item('fa-pen', 'Editar obra', () => tfObras.editar(o)),
      item('fa-floppy-disk', O.d.linha_base ? 'Reprogramar linha de base' : 'Salvar linha de base', salvarLinhaBase),
      window.tfObraExportar ? item('fa-download', 'Exportar', () => tfObraExportar(bt, O)) : null,
      window.tfObraMontar ? item('fa-wand-magic-sparkles', 'Montar / importar cronograma', () => tfObraMontar(O, { carregar, api, avisar })) : null,
      window.tfObraSalvarModelo && O.d.atividades.length ? item('fa-clone', 'Salvar como modelo', () => tfObraSalvarModelo(O, { modal })) : null,
      o.situacao === 'Pausado' ? item('fa-play', 'Retomar', () => mudar('Em andamento', 'retomada')) : ['Em andamento', 'Planejamento'].includes(o.situacao) ? item('fa-pause', 'Pausar', () => mudar('Pausado', 'pausada')) : null,
      !['Concluído', 'Arquivado'].includes(o.situacao) ? item('fa-flag-checkered', 'Concluir', () => mudar('Concluído', 'concluída')) : null,
      o.situacao !== 'Arquivado' ? item('fa-box-archive', 'Arquivar', () => mudar('Arquivado', 'arquivada'), true) : null);
    document.body.append(m);
    const r = bt.getBoundingClientRect();
    m.style.top = (r.bottom + window.scrollY + 4) + 'px'; m.style.left = Math.max(8, Math.min(window.innerWidth - 198, r.right - 190)) + 'px';
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
  }
  function abas() {
    const ab = (id, txt) => h('button', { role: 'tab', class: 'og-aba' + (O.aba === id ? ' on' : ''), 'aria-selected': O.aba === id ? 'true' : 'false', onclick: () => { O.aba = id; desenhar(); } }, txt);
    return h('div', { class: 'og-abas', role: 'tablist' }, ab('crono', 'Cronograma'), ab('quadro', 'Quadro'), ab('equipe', celular() ? 'Equipe' : 'Equipe da obra'), ab('base', celular() ? 'Linha de base' : 'Linha de base e histórico'));
  }

  /* ── linha de base ──────────────────────────── */
  async function salvarLinhaBase() {
    const primeira = !O.d.linha_base;
    const motivo = h('textarea', { rows: 3, placeholder: primeira ? 'Opcional' : 'Ex.: chuva parou a obra 5 dias; cliente mudou o escopo do QGBT…', class: 'og-txt' });
    const corpo = h('div', { class: 'og-corpo' },
      h('p', null, primeira ? 'Guarda as datas de hoje como o plano original. A partir daí o Gantt mostra a diferença entre o plano e o que está acontecendo.'
        : `Já existe a linha de base nº ${O.d.linha_base.numero} (${O.d.linha_base.nome}). Uma nova reprogramação passa a ser a referência do previsto.`),
      h('label', { class: 'ob-campo' }, h('span', null, primeira ? 'Observação' : 'Motivo da reprogramação *'), motivo));
    const ok = await modal(primeira ? 'Salvar linha de base original' : 'Reprogramar linha de base', corpo, [['Cancelar', null], [primeira ? 'Salvar' : 'Reprogramar', true, 'ob-bt-pri']]);
    if (!ok) return;
    try { const r = await api(`obras/${O.id}/linhas-base`, 'POST', { motivo: motivo.value.trim() || null }); avisar(r.numero === 0 ? 'Linha de base original salva.' : `Reprogramação nº ${r.numero} salva.`, 'success'); carregar(); }
    catch (e) { avisar(e.message, 'error'); }
  }

  /* ── cronograma (computador) ────────────────── */
  function escalaTempo(L) {
    const ds = []; L.forEach(a => { if (a.inicio) ds.push(a.inicio); if (a.fim) ds.push(a.fim); });
    const o = O.d.obra || {}; if (o.inicio) ds.push(o.inicio); if (o.fim) ds.push(o.fim); ds.push(O.d.hoje);
    ds.sort(); let ini = mais(ds[0], -3), fim = mais(ds[ds.length - 1], 10);
    const dow = (new Date(T(ini)).getUTCDay() + 6) % 7; ini = mais(ini, -dow);              // começa numa segunda
    if (O.escala === 'meses') { ini = ini.slice(0, 8) + '01'; }
    const n = dias(ini, fim) + 1, px = ESCALA[O.escala];
    return { ini, fim, n, px, W: n * px, x: s => dias(ini, s) * px };
  }
  function cabecalhoTempo(E) {
    const cab = h('div', { class: 'og-tempo', style: `width:${E.W}px` });
    const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    if (O.escala === 'meses') {
      for (let d = E.ini; d <= E.fim; ) { const prox = (() => { const y = +d.slice(0, 4), m = +d.slice(5, 7); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; })();
        cab.append(h('div', { class: 'og-t', style: `left:${E.x(d)}px;width:${dias(d, prox) * E.px}px` }, MES[+d.slice(5, 7) - 1] + '/' + d.slice(2, 4))); d = prox; }
    } else if (O.escala === 'semanas') {
      for (let d = E.ini; d <= E.fim; d = mais(d, 7)) cab.append(h('div', { class: 'og-t', style: `left:${E.x(d)}px;width:${7 * E.px}px` }, dBR(d)));
    } else {
      for (let d = E.ini; d <= E.fim; d = mais(d, 1)) { const dw = new Date(T(d)).getUTCDay();
        cab.append(h('div', { class: 'og-t dia' + (dw === 0 || dw === 6 ? ' fds' : ''), style: `left:${E.x(d)}px;width:${E.px}px` }, d.slice(8, 10))); }
    }
    return cab;
  }
  function cronograma() {
    const L = linhas(), E = escalaTempo(L), base = (O.d.linha_base && O.d.linha_base.itens) || {}, edita = podeTudo();
    const box = h('div', { class: 'og-crono' });
    box.append(barraCrono());
    const esq = h('div', { class: 'og-esq' }), dir = h('div', { class: 'og-dir' }), area = h('div', { class: 'og-area', style: `width:${E.W}px;height:${(L.length + 2) * ROW}px` });
    esq.append(h('div', { class: 'og-lin og-th' }, h('span', { class: 'c-sel' }), h('span', { class: 'c-eap' }, 'EAP'), h('span', { class: 'c-nome' }, 'Atividade'), h('span', { class: 'c-resp' }, 'Resp.'),
      h('span', { class: 'c-data' }, 'Início'), h('span', { class: 'c-data' }, 'Fim'), h('span', { class: 'c-dur' }, 'Dur.'), h('span', { class: 'c-pred' }, 'Pred.'), h('span', { class: 'c-pct' }, '%')));
    dir.append(h('div', { class: 'og-dir-in', style: `width:${E.W}px` }, cabecalhoTempo(E), area));
    // fundo: fins de semana (escala dias/semanas) e linha do hoje
    if (O.escala !== 'meses') for (let d = E.ini; d <= E.fim; d = mais(d, 1)) { const dw = new Date(T(d)).getUTCDay(); if (dw === 0 || dw === 6) area.append(h('div', { class: 'og-fds', style: `left:${E.x(d)}px;width:${E.px}px` })); }
    if (O.escala === 'semanas') for (let d = E.ini; d <= E.fim; d = mais(d, 7)) area.append(h('div', { class: 'og-sem', style: `left:${E.x(d)}px` }));
    area.append(h('div', { class: 'og-hoje', style: `left:${E.x(O.d.hoje) + E.px / 2}px`, title: 'Hoje ' + dBR(O.d.hoje) }));
    const pos = new Map();
    L.forEach((a, i) => {
      esq.append(linhaTabela(a, edita));
      const y = i * ROW;
      if (!a.inicio || !a.fim) return;
      const x1 = E.x(a.inicio), x2 = E.x(a.fim) + E.px, b = base[a.id];
      if (b && !a.etapa && b.inicio && b.fim) area.append(h('div', { class: 'og-base', style: `left:${E.x(b.inicio)}px;width:${Math.max(3, E.x(b.fim) + E.px - E.x(b.inicio))}px;top:${y + 29}px`, title: `Linha de base: ${dBR(b.inicio)} → ${dBR(b.fim)}` }));
      if (a.marco) area.append(h('div', { class: 'og-marco', style: `left:${x1 + E.px / 2 - 7}px;top:${y + 13}px`, title: `${a.descricao} · ${dBRano(a.inicio)}`, onclick: () => painel(a) }));
      else {
        const cls = 'og-barra' + (a.etapa ? ' etapa' : '') + (a.atrasada ? ' atras' : '') + (a.critica ? ' crit' : '') + (a.situacao === 'Concluído' ? ' feita' : '');
        area.append(h('div', { class: cls, style: `left:${x1}px;width:${Math.max(4, x2 - x1)}px;top:${y + (a.etapa ? 14 : 10)}px`, title: `${a.eap} ${a.descricao}\n${dBR(a.inicio)} → ${dBR(a.fim)} · ${durTxt(a.duracao_dias)} · ${a.avanco}%`,
          onclick: () => painel(a) }, h('div', { class: 'og-feito', style: `width:${a.avanco}%` })));
      }
      pos.set(a.id, { x1, x2: a.marco ? x1 + E.px / 2 + 7 : x2, y: y + 20 });
    });
    // setas das ligações
    const S = svg('svg', { class: 'og-setas', width: E.W, height: (L.length + 1) * ROW });
    S.append(svg('defs', {}, svg('marker', { id: 'og-ponta', viewBox: '0 0 8 8', refX: '7', refY: '4', markerWidth: '7', markerHeight: '7', orient: 'auto' }, svg('path', { d: 'M0,0 L8,4 L0,8 z', fill: '#64748b' }))));
    (O.d.dependencias || []).forEach(d => {
      const p = pos.get(d.antes_id), s = pos.get(d.depois_id); if (!p || !s) return;
      const sx = d.tipo === 'CC' || d.tipo === 'CT' ? p.x1 : p.x2, ex = d.tipo === 'TT' || d.tipo === 'CT' ? s.x2 : s.x1;
      const mx = d.tipo === 'TT' || d.tipo === 'CT' ? Math.max(sx, ex) + 10 : Math.min(sx + 10, ex - 8);
      S.append(svg('path', { d: `M${sx},${p.y} H${mx} V${s.y} H${ex + (d.tipo === 'TT' || d.tipo === 'CT' ? 2 : -2)}`, fill: 'none', stroke: '#94a3b8', 'stroke-width': '1.4', 'marker-end': 'url(#og-ponta)' }));
    });
    area.append(S);
    if (edita) esq.append(linhaNova(L));
    if (!O.d.atividades.length) esq.append(h('div', { class: 'og-vazio-crono' }, h('b', null, 'O cronograma está vazio.'), ' Digite a primeira atividade acima.',
      window.tfObraMontar ? h('button', { class: 'ob-bt ob-bt-pri', onclick: () => tfObraMontar(O, { carregar, api, avisar }) }, ic('fa-wand-magic-sparkles'), 'Montar com modelo, cópia ou arquivo') : null));
    const grade = h('div', { class: 'og-grade' }, esq, dir);
    box.append(h('div', { class: 'og-tabela' }, grade), legenda());
    // rola o Gantt para perto de hoje
    const primeiro = L.find(a => a.inicio);
    const escalaAntes = O.gxEscala; O.gxEscala = O.escala;
    requestAnimationFrame(() => { dir.scrollLeft = O.gx != null && escalaAntes === O.escala ? O.gx : Math.max(0, Math.min(E.x(O.d.hoje) - 200, primeiro ? E.x(primeiro.inicio) - 3 * E.px : 0)); });
    return box;
  }
  function legenda() {
    return h('div', { class: 'og-legenda' },
      h('span', null, h('i', { class: 'lg planejado' }), 'Planejado ', h('i', { class: 'lg feito' }), 'Feito'),
      h('span', null, h('i', { class: 'lg crit' }), 'Caminho crítico'), h('span', null, h('i', { class: 'lg base' }), 'Linha de base'),
      h('span', null, h('i', { class: 'lg hoje' }), `Hoje (${dBR(O.d.hoje)})`), h('span', null, h('i', { class: 'lg marco' }), 'Marco'),
      h('span', { class: 'verm' }, 'Vermelho = atrasada'));
  }
  function barraCrono() {
    const f = O.f, edita = podeTudo();
    const busca = h('input', { type: 'search', placeholder: 'Buscar atividade', 'aria-label': 'Buscar atividade', value: f.busca });
    busca.oninput = () => { f.busca = busca.value; const p = busca.selectionStart; desenhar(); const n = raiz().querySelector('.og-busca input'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (_) {} } };
    const resp = [...new Map(O.d.atividades.filter(a => a.responsavel_id).map(a => [String(a.responsavel_id), a.responsavel_nome])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    const nSel = [...O.sel].filter(id => O.d.atividades.some(a => a.id === id)).length;
    const esc = (v, t) => h('button', { class: O.escala === v ? 'on' : '', 'aria-pressed': O.escala === v ? 'true' : 'false', onclick: () => { O.escala = v; desenhar(); } }, t);
    return h('div', { class: 'og-barra-crono' },
      h('label', { class: 'ob-busca og-busca' }, ic('fa-magnifying-glass'), busca),
      h('select', { class: 'ob-sel', 'aria-label': 'Responsável', onchange: e => { f.resp = e.target.value; desenhar(); } },
        h('option', { value: '' }, 'Todos os responsáveis'), resp.map(([id, n]) => h('option', { value: id, selected: f.resp === id }, n))),
      h('select', { class: 'ob-sel', 'aria-label': 'Mostrar', onchange: e => { f.mostrar = e.target.value; desenhar(); } },
        [['todas', 'Todas'], ['atrasadas', 'Atrasadas'], ['criticas', 'Caminho crítico']].map(([v, t]) => h('option', { value: v, selected: f.mostrar === v }, t))),
      edita ? h('span', { class: 'og-sep' }) : null,
      edita ? h('button', { class: 'ob-bt og-bt-p', disabled: nSel < 2, title: 'Cada selecionada começa quando a anterior termina', onclick: encadear }, ic('fa-link'), `Encadear${nSel ? ` (${nSel})` : ''}`) : null,
      edita ? h('button', { class: 'ob-bt og-bt-ic', disabled: !nSel, 'aria-label': 'Recuar (vira subatividade)', title: 'Recuar: vira subatividade da linha de cima', onclick: () => recuar(1) }, ic('fa-indent')) : null,
      edita ? h('button', { class: 'ob-bt og-bt-ic', disabled: !nSel, 'aria-label': 'Avançar (sobe um nível)', title: 'Avançar: sobe um nível', onclick: () => recuar(-1) }, ic('fa-outdent')) : null,
      edita ? h('span', { class: 'og-dica' }, 'Dica: ', h('b', null, 'Enter'), ' nova linha · ', h('b', null, 'Tab'), ' vira subatividade') : null,
      h('span', { style: 'flex:1' }),
      h('div', { class: 'og-escala', role: 'group', 'aria-label': 'Escala do Gantt' }, esc('dias', 'Dias'), esc('semanas', 'Semanas'), esc('meses', 'Meses')));
  }

  /* ── linha da tabela com edição na célula ───── */
  function linhaTabela(a, edita) {
    const pode = c => edita || (c === 'pct' && eu().perfil === 'encarregado');
    const cel = (cls, txt, campo, tipo) => {
      const el = h('span', { class: cls + (pode(campo) && campo && !(a.etapa && campo !== 'nome') ? ' ed' : ''), title: typeof txt === 'string' ? txt : null }, txt);
      if (pode(campo) && campo && !(a.etapa && campo !== 'nome')) el.onclick = ev => { ev.stopPropagation(); editarCelula(el, a, campo, tipo); };
      return el;
    };
    const recolhida = O.recolhidas.has(a.id);
    const nome = h('span', { class: 'c-nome' + (edita ? ' ed' : ''), style: `padding-left:${8 + a.nivel * 16}px` },
      a.etapa ? h('button', { class: 'og-tog', 'aria-label': recolhida ? 'Abrir etapa' : 'Fechar etapa', 'aria-expanded': recolhida ? 'false' : 'true',
        onclick: ev => { ev.stopPropagation(); recolhida ? O.recolhidas.delete(a.id) : O.recolhidas.add(a.id); desenhar(); } }, ic(recolhida ? 'fa-caret-right' : 'fa-caret-down')) : null,
      a.marco ? h('i', { class: 'og-losango', 'aria-hidden': 'true' }) : null,
      h('span', { class: 'og-nome-txt' }, a.descricao),
      a.travada ? h('span', { class: 'og-trav', title: 'Travou: ' + a.travada.descricao, 'aria-label': 'Travada: ' + a.travada.descricao }, ic('fa-triangle-exclamation')) : null,
      a.fotos ? h('span', { class: 'og-nfotos', title: `${a.fotos} foto${a.fotos > 1 ? 's' : ''} de campo` }, ic('fa-camera')) : null,
      h('button', { class: 'og-abre', 'aria-label': 'Abrir detalhes', title: 'Abrir detalhes', onclick: ev => { ev.stopPropagation(); painel(a); } }, ic('fa-up-right-from-square')));
    if (edita) nome.onclick = ev => { if (ev.target.closest('button')) return; editarCelula(nome, a, 'descricao', 'texto'); };
    const sel = h('input', { type: 'checkbox', 'aria-label': 'Selecionar ' + a.descricao, checked: O.sel.has(a.id), onclick: ev => { ev.stopPropagation(); ev.target.checked ? O.sel.add(a.id) : O.sel.delete(a.id); desenhar(); } });
    return h('div', { class: 'og-lin' + (a.etapa ? ' etapa' : '') + (a.atrasada ? ' atras' : '') + (O.sel.has(a.id) ? ' sel' : ''), 'data-id': a.id },
      h('span', { class: 'c-sel' }, edita ? sel : null), h('span', { class: 'c-eap' }, a.eap), nome,
      cel('c-resp', a.responsavel_nome || (a.etapa ? '' : '—'), 'responsavel_id', 'resp'),
      cel('c-data', dBR(a.inicio), 'inicio', 'data'), cel('c-data' + (a.atrasada ? ' verm' : ''), dBR(a.fim), 'fim', 'data'),
      cel('c-dur', durTxt(a.duracao_dias), 'duracao_dias', 'dur'),
      h('span', { class: 'c-pred' + (edita && !a.etapa ? ' ed' : ''), title: a.predecessoras, onclick: edita && !a.etapa ? () => painel(a, 'pred') : null }, a.predecessoras || ''),
      cel('c-pct', a.marco ? '' : a.avanco + '%', a.etapa || a.marco ? null : 'pct', 'pct'));
  }
  function editarCelula(el, a, campo, tipo) {
    if (el.querySelector('input,select')) return;
    const atual = { descricao: a.descricao, inicio: a.inicio, fim: a.fim, duracao_dias: durTxt(a.duracao_dias), responsavel_id: a.responsavel_id, pct: a.avanco }[campo];
    let inp;
    const terminar = async (salvar, ev) => {
      if (!inp.isConnected) return;
      const v = inp.value.trim(); inp.remove(); el.classList.remove('editando');
      if (!salvar) { desenhar(); return; }
      let campos = null;
      if (campo === 'descricao') { if (v && v !== a.descricao) campos = { descricao: v }; }
      else if (campo === 'inicio' || campo === 'fim') { if (v && v !== a[campo]) campos = { [campo]: v }; }
      else if (campo === 'duracao_dias') { const n = Number(v.replace(/[dD\s]/g, '').replace(',', '.')); if (v === '' || Number.isNaN(n) || n < 0) { avisar('Duração inválida. Use, por exemplo, 5d.', 'error'); desenhar(); return; } if (n !== Number(a.duracao_dias)) campos = { duracao_dias: n }; }
      else if (campo === 'responsavel_id') {
        const n = v ? +v : null;
        if (n !== a.responsavel_id) {
          campos = { responsavel_id: n };
          if (n && !a.etapa) { const ok = await checarResponsavel(a, n); if (!ok) { desenhar(); return; } campos = { responsavel_id: ok.id, ...(ok.pendencias ? { alocacao_pendencias: ok.pendencias } : {}) }; }
        }
      }
      else if (campo === 'pct') { const n = Math.max(0, Math.min(100, Math.round(Number(v)))); if (!Number.isNaN(n) && n !== a.avanco) campos = { avanco: n, situacao: n >= 100 ? 'Concluído' : n > 0 && a.situacao === 'Pendente' ? 'Em andamento' : a.situacao }; }
      if (campos) await salvarAtividade(a, campos);
      else desenhar();
      if (ev && ev.key === 'Enter' && campo === 'descricao') focarNova();
    };
    if (tipo === 'resp') {
      inp = h('select', { class: 'og-inp' }, h('option', { value: '' }, '—'));
      equipe().then(l => l.forEach(f => inp.append(h('option', { value: f.id, selected: f.id === a.responsavel_id }, f.nome))));
      inp.onchange = () => terminar(true);
    } else inp = h('input', { class: 'og-inp', type: tipo === 'data' ? 'date' : tipo === 'pct' ? 'number' : 'text', value: atual ?? '', min: tipo === 'pct' ? 0 : null, max: tipo === 'pct' ? 100 : null });
    inp.onkeydown = ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); terminar(true, ev); }
      else if (ev.key === 'Escape') { ev.preventDefault(); terminar(false); }
      else if (ev.key === 'Tab' && campo === 'descricao' && podeTudo()) { ev.preventDefault(); inp.remove(); O.sel = new Set([a.id]); recuar(ev.shiftKey ? -1 : 1); }
    };
    inp.onblur = () => setTimeout(() => terminar(true), 120);
    el.classList.add('editando'); el.append(inp); inp.focus(); if (inp.select) try { inp.select(); } catch (_) {}
  }
  function linhaNova(L) {
    const ult = L[L.length - 1];
    const nivel = Math.max(0, Math.min(O.novoNivel, ult ? ult.nivel + 1 : 0));
    const inp = h('input', { class: 'og-nova-inp', placeholder: nivel ? `+ Nova subatividade (nível ${nivel + 1}) — Shift+Tab volta` : '+ Digite uma nova atividade e tecle Enter', 'aria-label': 'Nova atividade' });
    inp.onkeydown = async ev => {
      if (ev.key === 'Tab') { ev.preventDefault(); O.novoNivel = Math.max(0, nivel + (ev.shiftKey ? -1 : 1)); const v = inp.value; desenhar(); const n = raiz().querySelector('.og-nova-inp'); n.value = v; n.focus(); return; }
      if (ev.key !== 'Enter' || !inp.value.trim()) return;
      ev.preventDefault();
      // pai = a última linha visível com nível = nivel-1
      let pai = null; if (nivel > 0) for (let i = L.length - 1; i >= 0; i--) if (L[i].nivel === nivel - 1) { pai = L[i].id; break; }
      const folhas = O.d.atividades.filter(a => !a.etapa && a.fim);
      const ini = folhas.length ? mais(folhas[folhas.length - 1].fim, 1) : (O.d.obra.inicio || O.d.hoje);
      const ordem = O.d.atividades.reduce((m, a) => Math.max(m, a.ordem || 0), 0) + 10;
      inp.disabled = true;
      try { await api('atividades', 'POST', { projeto_id: O.id, descricao: inp.value.trim(), pai_id: pai, inicio: ini, duracao_dias: 1, ordem }); await carregar(); focarNova(); }
      catch (e) { inp.disabled = false; avisar(e.message, 'error'); }
    };
    return h('div', { class: 'og-lin og-lin-nova' }, h('span', { class: 'c-sel' }), h('span', { class: 'c-eap' }), h('span', { class: 'c-nome', style: `padding-left:${8 + nivel * 16}px` }, inp));
  }
  function focarNova() { if (O.aba !== 'crono') { O.aba = 'crono'; desenhar(); } const n = raiz() && raiz().querySelector('.og-nova-inp'); if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); } else if (celular()) painel(null); }

  /* ── salvar com simulação (aviso do que vai ser empurrado) ── */
  async function confirmarEmpurrao(a, campos) {
    if (!podeTudo() || !['inicio', 'fim', 'duracao_dias'].some(k => k in campos)) return true;
    let s; try { s = await api(`obras/${O.id}/simular`, 'POST', { atividade_id: a.id, ...campos }); } catch (_) { return true; }
    if (!s.movidas || !s.movidas.length) return true;
    const lista = h('ul', { class: 'og-lista-mov' }, s.movidas.slice(0, 8).map(m => h('li', null, h('b', null, m.descricao), ` ${dBR(m.de_inicio)} → ${dBR(m.inicio)}`)));
    const corpo = h('div', { class: 'og-corpo' }, h('p', null, `Essa mudança empurra ${s.movidas.length} atividade${s.movidas.length > 1 ? 's' : ''} que dependem desta:`), lista,
      s.fim_obra_depois !== s.fim_obra_antes ? h('p', { class: 'og-alerta' }, ic('fa-triangle-exclamation'), ` O fim da obra passa de ${dBRano(s.fim_obra_antes)} para `, h('b', null, dBRano(s.fim_obra_depois)), '.') : null);
    return !!(await modal('Confirmar mudança de datas', corpo, [['Cancelar', false], [`Salvar e empurrar ${s.movidas.length}`, true, 'ob-bt-pri']]));
  }
  async function salvarAtividade(a, campos) {
    if (!(await confirmarEmpurrao(a, campos))) { desenhar(); return false; }
    try { const r = await api('atividades/' + a.id, 'PATCH', campos); await aposMudar(r, 'Atividade salva.'); return true; }
    catch (e) { avisar(e.message, 'error'); desenhar(); return false; }
  }
  async function encadear() {
    const ordem = O.d.atividades.filter(a => O.sel.has(a.id) && !a.etapa).map(a => a.id);
    if (ordem.length < 2) { avisar('Selecione pelo menos duas atividades (não etapas).', 'error'); return; }
    try { const r = await api(`obras/${O.id}/encadear`, 'POST', { ids: ordem }); O.sel.clear(); await aposMudar(r, `${r.ligacoes} ligaç${r.ligacoes === 1 ? 'ão criada' : 'ões criadas'}.`); }
    catch (e) { avisar(e.message, 'error'); }
  }
  async function recuar(dir) {
    const A = O.d.atividades, ids = A.filter(a => O.sel.has(a.id)).map(a => a.id);
    try {
      for (const id of ids) {
        const a = A.find(x => x.id === id), i = A.indexOf(a);
        if (dir > 0) {   // vira filha da linha de cima no mesmo nível
          let ant = null; for (let k = i - 1; k >= 0; k--) { if (A[k].nivel === a.nivel) { ant = A[k]; break; } if (A[k].nivel < a.nivel) break; }
          if (!ant) { avisar(`"${a.descricao}" não tem uma linha acima no mesmo nível para entrar.`, 'error'); continue; }
          await api('atividades/' + id, 'PATCH', { pai_id: ant.id });
        } else if (a.pai_id) {
          const pai = A.find(x => x.id === a.pai_id);
          await api('atividades/' + id, 'PATCH', { pai_id: pai ? pai.pai_id : null });
        }
      }
      await carregar();
    } catch (e) { avisar(e.message, 'error'); carregar(); }
  }

  /* ── painel da atividade ────────────────────── */
  /* ── aviso ao escolher o responsável (documentos, ausência, carga) ── */
  async function checarResponsavel(a, fid) {
    let r; try { r = await api(`atividades/${a.id}/checar-responsavel?funcionario_id=${fid}`); } catch (_) { return { id: fid }; }
    if (!r.pendencias.length) return { id: fid };
    return new Promise(res => {
      const fechar = v => { f.remove(); document.removeEventListener('keydown', esc); res(v); };
      const esc = ev => { if (ev.key === 'Escape') fechar(null); };
      const ICO = { grave: 'fa-circle-xmark', atencao: 'fa-triangle-exclamation', aviso: 'fa-chart-line' };
      const f = h('div', { class: 'ob-fundo og-modal og-aloc', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'og-aloc-t' },
        h('div', { class: 'og-janela' },
          h('small', { class: 'og-sub' }, `${a.eap || ''} · ${a.descricao} · ${dBR(a.inicio)} → ${dBR(a.fim)}`),
          h('h3', { id: 'og-aloc-t' }, `${r.pessoa.nome} tem pendências para esta atividade`),
          h('div', { class: 'og-aloc-lista' }, r.pendencias.map(p => h('div', { class: 'og-aloc-p ' + p.nivel }, ic(ICO[p.nivel] || 'fa-circle-info'), h('span', null, p.texto)))),
          r.sugestoes.length ? h('div', { class: 'og-aloc-sug' }, h('b', null, 'Quem pode fazer, sem pendência'),
            r.sugestoes.map(s2 => h('button', { class: 'og-aloc-pess', onclick: () => fechar({ id: s2.id }) },
              h('span', { class: 'og-aloc-av' }, s2.nome.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()),
              h('span', { class: 'og-aloc-n' }, h('b', null, s2.nome), h('small', null, s2.cargo || '')),
              h('span', { class: 'og-aloc-c' }, `carga ${s2.carga}%`), h('span', { class: 'ob-chip-farol verd' }, s2.atencao ? 'Com atenção' : 'Em dia')))) : null,
          h('div', { class: 'og-bts' }, h('button', { class: 'ob-bt', onclick: () => fechar(null) }, 'Escolher outra pessoa'),
            h('button', { class: 'ob-bt og-bt-laranja', onclick: () => fechar({ id: fid, pendencias: r.pendencias.map(p => p.texto).join('; ') }) }, 'Alocar mesmo assim')),
          h('small', { class: 'og-sub' }, 'Se alocar mesmo assim, fica registrado no histórico quem decidiu e as pendências.')));
      f.addEventListener('mousedown', ev => { if (ev.target === f) fechar(null); });
      document.addEventListener('keydown', esc); document.body.append(f);
      f.querySelector('.og-bts .ob-bt').focus();
    });
  }

  /* ── aviso ao reservar um recurso (conflito, manutenção, calibração vencida, locação) ── */
  async function checarRecurso(a, rid) {
    let r; try { r = await api(`atividades/${a.id}/checar-recurso?recurso=${rid}`); } catch (e) { avisar(e.message, 'error'); return null; }
    if (!r.pendencias.length) return { id: rid };
    return new Promise(res => {
      const fechar = v => { f.remove(); document.removeEventListener('keydown', esc); res(v); };
      const esc = ev => { if (ev.key === 'Escape') fechar(null); };
      const ICO = { grave: 'fa-circle-xmark', atencao: 'fa-triangle-exclamation', aviso: 'fa-circle-info' };
      const ICR = { equipamento: 'fa-gears', veiculo: 'fa-truck', ferramenta: 'fa-screwdriver-wrench', outro: 'fa-box' };
      const fForn = h('input', { type: 'text', maxlength: '160', placeholder: 'Fornecedor (ex.: LocaMáq)', 'aria-label': 'Fornecedor' });
      const fCusto = h('input', { type: 'number', min: '0', step: '0.01', placeholder: 'R$ por dia (opcional)', 'aria-label': 'Custo por dia' });
      const alugar = h('div', { class: 'og-rec-alugar', hidden: true }, fForn, fCusto, h('button', { class: 'ob-bt ob-bt-pri', onclick: async ev => {
        ev.target.disabled = true;
        try {
          const nome = r.recurso.nome + ' (alugado)';
          const n = await api('recursos', 'POST', { nome, tipo: r.recurso.tipo, propriedade: 'alugado', locacao: { fornecedor_nome: fForn.value.trim() || null, retirada: a.inicio, devolucao_prevista: a.fim || a.inicio, custo: fCusto.value === '' ? null : +fCusto.value, custo_unidade: 'dia' } });
          avisar(`Locação registrada: ${nome}, ${dBR(a.inicio)} a ${dBR(a.fim || a.inicio)}`, 'success'); fechar({ id: n.id });
        } catch (e) { avisar(e.message, 'error'); ev.target.disabled = false; }
      } }, 'Alugar e reservar'));
      const f = h('div', { class: 'ob-fundo og-modal og-aloc', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'og-rec-t' },
        h('div', { class: 'og-janela' },
          h('small', { class: 'og-sub' }, `${a.eap || ''} · ${a.descricao} · ${dBR(r.atividade.inicio)} → ${dBR(r.atividade.fim)}`),
          h('h3', { id: 'og-rec-t' }, `${r.recurso.nome} tem pendências nessas datas`),
          h('div', { class: 'og-aloc-lista' }, r.pendencias.map(p => h('div', { class: 'og-aloc-p ' + p.nivel }, ic(ICO[p.nivel] || 'fa-circle-info'), h('span', null, p.texto)))),
          h('div', { class: 'og-aloc-sug' }, h('b', null, r.sugestoes.length ? 'Livres e parecidos nessas datas' : 'Nenhum parecido livre nessas datas'),
            r.sugestoes.map(s2 => h('button', { class: 'og-aloc-pess og-rec-sug', onclick: () => fechar({ id: s2.id }) },
              h('span', { class: 'og-aloc-av' }, ic(ICR[s2.tipo] || 'fa-box')),
              h('span', { class: 'og-aloc-n' }, h('b', null, (s2.codigo ? s2.codigo + ' · ' : '') + s2.nome), h('small', null, `${s2.propriedade === 'alugado' ? 'Alugado' : 'Próprio'} · livre ${s2.livre}` + (s2.pendencias.length ? ' · ' + s2.pendencias[0].texto : ''))),
              h('span', { class: 'og-aloc-c' }, `ocupação ${s2.ocupacao}%`), h('span', { class: 'ob-chip-farol verd' }, 'Usar este'))),
            h('button', { class: 'og-aloc-pess og-rec-alugar-bt', onclick: () => { alugar.hidden = !alugar.hidden; if (!alugar.hidden) fForn.focus(); } },
              h('span', { class: 'og-aloc-av' }, ic('fa-tag')), h('span', { class: 'og-aloc-n' }, h('b', null, 'Alugar um ' + r.recurso.nome.toLowerCase().replace(/\s+\d.*$/, '')), h('small', null, `Cria o recurso como alugado, de ${dBR(r.atividade.inicio)} a ${dBR(r.atividade.fim)}, e reserva`)), h('span', { class: 'og-aloc-c' }, 'Alugar')),
            alugar),
          h('div', { class: 'og-bts' }, h('button', { class: 'ob-bt', onclick: () => fechar(null) }, 'Escolher outro'),
            h('button', { class: 'ob-bt og-bt-laranja', onclick: () => fechar({ id: rid, pendencias: r.pendencias.map(p => p.texto).join('; ') }) }, 'Reservar mesmo assim')),
          h('small', { class: 'og-sub' }, 'Se reservar mesmo assim, fica registrado no histórico quem decidiu e as pendências.')));
      f.addEventListener('mousedown', ev => { if (ev.target === f) fechar(null); });
      document.addEventListener('keydown', esc); document.body.append(f);
      f.querySelector('.og-bts .ob-bt').focus();
    });
  }

  async function painel(a, foco) {
    document.querySelectorAll('.og-painel-fundo').forEach(x => x.remove());
    const nova = !a, edita = podeTudo(), enc = eu().perfil === 'encarregado';
    const lista = await equipe().catch(() => []);
    const v = a || { descricao: '', inicio: O.d.obra.inicio && O.d.obra.inicio > O.d.hoje ? O.d.obra.inicio : O.d.hoje, duracao_dias: 1, avanco: 0, situacao: 'Pendente', peso: 1, pai_id: null };
    const campo = (rot, el, cls) => h('label', { class: 'ob-campo ' + (cls || '') }, h('span', null, rot), el);
    const dis = !edita;
    const fDesc = h('input', { value: v.descricao, maxlength: 255, disabled: dis });
    const fResp = h('select', { disabled: dis }, h('option', { value: '' }, '—'), lista.map(f => h('option', { value: f.id, selected: f.id === v.responsavel_id }, f.cargo ? `${f.nome} · ${f.cargo}` : f.nome)));
    const fIni = h('input', { type: 'date', value: v.inicio || '', disabled: dis || (a && a.etapa) });
    const fFim = h('input', { type: 'date', value: v.fim || '', disabled: dis || (a && a.etapa) });
    const fDur = h('input', { value: durTxt(v.duracao_dias), disabled: dis || (a && a.etapa), placeholder: 'ex.: 5d' });
    const fAv = h('input', { type: 'range', min: 0, max: 100, step: 5, value: v.avanco, disabled: !(edita || enc) || (a && a.etapa), 'aria-label': 'Avanço' });
    const avTxt = h('b', null, v.avanco + '%'); fAv.oninput = () => { avTxt.textContent = fAv.value + '%'; };
    const fSit = h('select', { disabled: !(edita || enc) || (a && a.etapa) }, ['Pendente', 'Em andamento', 'Concluído', 'Reprogramado'].map(s => h('option', { value: s, selected: s === v.situacao }, s)));
    const fPeso = h('input', { type: 'number', min: 0, step: 0.5, value: v.peso, disabled: dis || (a && a.etapa) });
    const etapas = O.d.atividades.filter(x => !a || (x.id !== a.id && !descendeDe(x, a.id)));
    const fPai = h('select', { disabled: dis }, h('option', { value: '' }, '— (nível principal)'), etapas.map(x => h('option', { value: x.id, selected: x.id === v.pai_id }, `${x.eap} · ${x.descricao}`)));
    const fObs = h('textarea', { rows: 2, disabled: !(edita || enc) }, v.observacoes || '');
    const aviso = h('div', { class: 'og-aviso', role: 'status', hidden: true });
    const btSalvar = h('button', { class: 'ob-bt ob-bt-pri' }, nova ? 'Criar atividade' : 'Salvar');
    let simulacao = null;
    const durNum = () => { const t = fDur.value.trim(); if (!t) return null; const n = Number(t.replace(/[dD\s]/g, '').replace(',', '.')); return Number.isNaN(n) ? NaN : n; };
    const mudancasDatas = () => {
      const c = {};
      if (fIni.value && fIni.value !== (v.inicio || '')) c.inicio = fIni.value;
      const n = durNum(); if (n != null && !Number.isNaN(n) && n !== Number(v.duracao_dias)) c.duracao_dias = n;
      else if (fFim.value && fFim.value !== (v.fim || '')) c.fim = fFim.value;
      return c;
    };
    let tmr;
    const simular = () => { clearTimeout(tmr); tmr = setTimeout(async () => {
      if (nova || !edita) return; const c = mudancasDatas(); simulacao = null; aviso.hidden = true; btSalvar.textContent = 'Salvar';
      if (!Object.keys(c).length) return;
      try { const s = await api(`obras/${O.id}/simular`, 'POST', { atividade_id: a.id, ...c }); simulacao = s;
        if (s.movidas.length) { aviso.hidden = false; aviso.innerHTML = '';
          aviso.append(ic('fa-triangle-exclamation'), h('div', null, h('b', null, `Isso empurra ${s.movidas.length} atividade${s.movidas.length > 1 ? 's' : ''}: `),
            s.movidas.slice(0, 5).map(m => m.descricao).join(', ') + (s.movidas.length > 5 ? '…' : '') + '.',
            s.fim_obra_depois !== s.fim_obra_antes ? [h('br'), 'O fim da obra passa de ', dBRano(s.fim_obra_antes), ' para ', h('b', null, dBRano(s.fim_obra_depois)), '.'] : null));
          btSalvar.textContent = `Salvar e empurrar ${s.movidas.length}`; }
      } catch (_) {}
    }, 300); };
    fIni.oninput = simular; fFim.oninput = () => { fDur.value = ''; simular(); }; fDur.oninput = simular;
    // predecessoras
    const predBox = h('div', { class: 'og-preds' });
    const desenharPreds = () => {
      predBox.innerHTML = '';
      if (nova) { predBox.append(h('small', { class: 'og-sub' }, 'Crie a atividade primeiro para ligar predecessoras.')); return; }
      const deps = (O.d.dependencias || []).filter(d => d.depois_id === a.id);
      deps.forEach(d => {
        const p = O.d.atividades.find(x => x.id === d.antes_id); if (!p) return;
        const tipo = h('select', { 'aria-label': 'Tipo de ligação', disabled: dis }, Object.entries(TIPO_LIG).map(([k, t]) => h('option', { value: k, selected: k === d.tipo }, t)));
        const folga = h('input', { type: 'number', value: d.folga_dias, 'aria-label': 'Folga em dias úteis', disabled: dis });
        const salvarLig = async () => { try { const r = await api('dependencias/' + d.id, 'PATCH', { tipo: tipo.value, folga_dias: +folga.value || 0 }); d.tipo = tipo.value; d.folga_dias = +folga.value || 0; await aposMudar(r, 'Ligação atualizada.'); painel(O.d.atividades.find(x => x.id === a.id)); } catch (e) { avisar(e.message, 'error'); } };
        tipo.onchange = salvarLig; folga.onchange = salvarLig;
        predBox.append(h('div', { class: 'og-pred' }, h('span', { class: 'og-pred-nome' }, `${p.eap} ${p.descricao}`), tipo, h('span', { class: 'og-folga' }, folga, 'd'),
          edita ? h('button', { class: 'og-x', 'aria-label': 'Remover ligação', onclick: async () => { try { await api('dependencias/' + d.id, 'DELETE'); await carregar(); painel(O.d.atividades.find(x => x.id === a.id), 'pred'); } catch (e) { avisar(e.message, 'error'); } } }, ic('fa-xmark')) : null));
      });
      if (!deps.length) predBox.append(h('small', { class: 'og-sub' }, 'Não depende de nenhuma atividade.'));
      if (edita) {
        const opc = O.d.atividades.filter(x => x.id !== a.id && !deps.some(d => d.antes_id === x.id));
        const sAt = h('select', { 'aria-label': 'Atividade predecessora' }, h('option', { value: '' }, 'Escolha a atividade…'), opc.map(x => h('option', { value: x.id }, `${x.eap} · ${x.descricao}`)));
        const sTi = h('select', { 'aria-label': 'Tipo de ligação' }, Object.entries(TIPO_LIG).map(([k, t]) => h('option', { value: k }, t)));
        const sFo = h('input', { type: 'number', value: 0, 'aria-label': 'Folga em dias úteis' });
        predBox.append(h('div', { class: 'og-pred nova' }, sAt, sTi, h('span', { class: 'og-folga' }, sFo, 'd'),
          h('button', { class: 'ob-bt og-bt-p', onclick: async () => {
            if (!sAt.value) return;
            try { const r = await api('dependencias', 'POST', { antes_id: +sAt.value, depois_id: a.id, tipo: sTi.value, folga_dias: +sFo.value || 0 }); await aposMudar(r, 'Ligação criada.'); painel(O.d.atividades.find(x => x.id === a.id), 'pred'); }
            catch (e) { avisar(e.message, 'error'); } } }, 'Ligar')));
      }
    };
    desenharPreds();
    const hist = h('ul', { class: 'og-hist' });
    if (!nova) api(`atividades/${a.id}/historico`).then(r => {
      const nomes = { descricao: 'nome', inicio: 'início', fim: 'fim', duracao_dias: 'duração', avanco: 'avanço', situacao: 'situação', responsavel_id: 'responsável', pai_id: 'etapa', observacoes: 'observações', peso: 'peso' };
      const oque = x => { const d = x.depois || {};
        if (x.acao === 'criou') return 'criou a atividade'; if (x.acao === 'excluiu') return 'excluiu';
        if ('travou' in d) return 'informou que travou: ' + d.travou + (d.descricao ? ' (' + d.descricao + ')' : '');
        if ('liberou' in d) return 'liberou a atividade';
        if ('alocou_com_pendencias' in d) return 'alocou o responsável mesmo com pendências: ' + d.alocou_com_pendencias;
        if ('documentos_exigidos' in d) return `mudou os documentos exigidos (${d.documentos_exigidos})`;
        if ('reservou_com_pendencias' in d) return `reservou ${d.recursos} mesmo com pendências: ${d.reservou_com_pendencias}`;
        if ('recursos' in d) return `mudou os recursos (${d.recursos})`;
        return 'mudou ' + Object.keys(d).filter(k => k !== 'fotos').map(k => nomes[k] || k).join(', ') + ('avanco' in d ? ` para ${d.avanco}%` : '') + (d.fotos ? ` (com ${d.fotos} foto${d.fotos > 1 ? 's' : ''})` : ''); };
      (r.historico || []).slice(0, 8).forEach(x => hist.append(h('li', null, h('b', null, x.usuario || 'Sistema'), ' ', oque(x), ' · ', new Date(x.quando.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))));
      if (!hist.children.length) hist.append(h('li', null, 'Sem alterações registradas.'));
    }).catch(() => {});
    const fotosBox = h('div', { class: 'og-fotos' });
    const exigBox = h('div', { class: 'og-exig' });
    if (a && !a.etapa) (async () => {
      let atuais = [], cat = [];
      try { atuais = (await api(`atividades/${a.id}/exigencias`)).tipos; if (edita) cat = (await api('tipos-documento')).tipos; } catch (_) {}
      const salvarEx = async ids => { try { atuais = (await api(`atividades/${a.id}/exigencias`, 'PUT', { tipos: ids })).tipos; des(); } catch (e) { avisar(e.message, 'error'); } };
      const des = () => {
        exigBox.innerHTML = '';
        atuais.forEach(t => exigBox.append(h('span', { class: 'og-exig-chip' }, t.nome, edita ? h('button', { 'aria-label': 'Tirar ' + t.nome, onclick: () => salvarEx(atuais.filter(x => x.id !== t.id).map(x => x.id)) }, '×') : null)));
        if (!atuais.length) exigBox.append(h('small', { class: 'og-sub' }, edita ? 'Só os do cargo de cada pessoa. Inclua aqui o que esta atividade pede a mais (ex.: NR-33, NR-35).' : 'Só os do cargo de cada pessoa.'));
        if (edita) exigBox.append(h('select', { class: 'og-exig-sel', 'aria-label': 'Exigir documento', onchange: e => { if (e.target.value) salvarEx([...atuais.map(x => x.id), +e.target.value]); } },
          h('option', { value: '' }, '+ Exigir documento…'), cat.filter(t => !atuais.some(x => x.id === t.id)).map(t => h('option', { value: t.id }, `${t.nr && !t.nome.startsWith(t.nr) ? t.nr + ' · ' : ''}${t.nome}`))));
      };
      des();
    })();
    const recBox = h('div', { class: 'og-exig og-rec' });
    if (a && !a.etapa) (async () => {
      let atuais = [], disp = [];
      try { const r = await api(`atividades/${a.id}/recursos`); atuais = r.recursos; disp = r.disponiveis; } catch (_) { return; }
      const ICR = { equipamento: 'fa-gears', veiculo: 'fa-truck', ferramenta: 'fa-screwdriver-wrench', outro: 'fa-box' };
      const salvar = async (ids, pend) => { try { const r = await api(`atividades/${a.id}/recursos`, 'PUT', { recursos: ids, pendencias: pend || {} }); atuais = r.recursos; disp = r.disponiveis; des(); } catch (e) { avisar(e.message, 'error'); } };
      const des = () => {
        recBox.innerHTML = '';
        atuais.forEach(x => { const g = x.pendencias.some(p => p.nivel === 'grave'), at = x.pendencias.length;
          recBox.append(h('span', { class: 'og-exig-chip' + (g ? ' grave' : at ? ' atencao' : ''), title: x.pendencias.map(p => p.texto).join('\n') || 'Sem pendências' }, ic(ICR[x.tipo] || 'fa-box'), ' ', (x.codigo ? x.codigo + ' ' : '') + x.nome,
            edita ? h('button', { 'aria-label': 'Tirar ' + x.nome, onclick: () => salvar(atuais.filter(y => y.id !== x.id).map(y => y.id)) }, '×') : null)); });
        if (!atuais.length) recBox.append(h('small', { class: 'og-sub' }, edita ? 'Equipamentos, veículos e ferramentas reservados nas datas da atividade. Mudou a data, a reserva acompanha.' : 'Nenhum recurso reservado.'));
        if (edita && disp.length) recBox.append(h('select', { class: 'og-exig-sel og-rec-sel', 'aria-label': 'Adicionar recurso', onchange: async e => {
            const id = +e.target.value; if (!id) return; e.target.disabled = true;
            const ok = await checarRecurso(a, id); e.target.disabled = false; e.target.value = '';
            if (!ok) return;
            salvar([...atuais.map(x => x.id).filter(x => x !== ok.id), ok.id], ok.pendencias ? { [ok.id]: ok.pendencias } : {});
          } }, h('option', { value: '' }, '+ Adicionar recurso…'),
          Object.entries({ veiculo: 'Veículos', equipamento: 'Equipamentos', ferramenta: 'Ferramentas', outro: 'Outros' }).map(([t, rot]) => {
            const L = disp.filter(x => x.tipo === t && !atuais.some(y => y.id === x.id)); return L.length ? h('optgroup', { label: rot }, L.map(x => h('option', { value: x.id }, (x.codigo ? x.codigo + ' · ' : '') + x.nome))) : null; })));
        else if (edita) recBox.append(h('small', { class: 'og-sub' }, 'Cadastre equipamentos em Recursos.'));
      };
      des();
    })();
    if (a && a.fotos) api(`atividades/${a.id}/fotos`).then(r => (r.fotos || []).forEach(f => fotosBox.append(h('a', { href: `api/fotos/${f.id}`, target: '_blank', rel: 'noopener', title: `${f.por} · ${f.tirada_em}` },
      h('img', { src: `api/fotos/${f.id}?mini=1`, alt: `Foto de ${f.por}`, loading: 'lazy' }),
      h('small', null, `${(f.por || '').split(' ')[0]} · ${f.tirada_em.slice(8, 10)}/${f.tirada_em.slice(5, 7)}${f.tipo === 'travou' ? ' · travou' : f.para != null ? ` · ${f.para}%` : ''}`))))).catch(() => {});
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = ev => { if (ev.key === 'Escape') fechar(); };
    btSalvar.onclick = async () => {
      const c = {};
      if (edita) {
        if (!fDesc.value.trim()) { avisar('Dê um nome à atividade.', 'error'); fDesc.focus(); return; }
        if (fDesc.value.trim() !== v.descricao) c.descricao = fDesc.value.trim();
        const resp = fResp.value ? +fResp.value : null; if (resp !== (v.responsavel_id || null)) c.responsavel_id = resp;
        const pai = fPai.value ? +fPai.value : null; if (pai !== (v.pai_id || null)) c.pai_id = pai;
        if (!a || !a.etapa) { Object.assign(c, mudancasDatas()); if (Number.isNaN(durNum())) { avisar('Duração inválida. Use, por exemplo, 5d.', 'error'); return; } if (+fPeso.value !== Number(v.peso)) c.peso = +fPeso.value || 0; }
      }
      if (edita || enc) {
        if (!a || !a.etapa) { if (+fAv.value !== v.avanco) c.avanco = +fAv.value; if (fSit.value !== v.situacao) c.situacao = fSit.value; }
        if ((fObs.value || '') !== (v.observacoes || '')) c.observacoes = fObs.value;
      }
      if (c.avanco === 100 && !('situacao' in c)) c.situacao = 'Concluído';
      if (!nova && c.responsavel_id && !a.etapa) { const ok = await checarResponsavel(a, c.responsavel_id); if (!ok) return; c.responsavel_id = ok.id; if (ok.pendencias) c.alocacao_pendencias = ok.pendencias; }
      if (c.situacao === 'Reprogramado' && !c.observacoes) {
        const mot = h('textarea', { rows: 3, class: 'og-txt', placeholder: 'Por que foi reprogramada?' });
        const ok = await modal('Motivo da reprogramação', h('div', { class: 'og-corpo' }, mot), [['Cancelar', null], ['Confirmar', true, 'ob-bt-pri']]);
        if (!ok || !mot.value.trim()) return;
        c.observacoes = ((v.observacoes ? v.observacoes + '\n' : '') + 'Reprogramada: ' + mot.value.trim());
      }
      btSalvar.disabled = true;
      try {
        if (nova) {
          const ordem = O.d.atividades.reduce((m, x) => Math.max(m, x.ordem || 0), 0) + 10;
          const r = await api('atividades', 'POST', { projeto_id: O.id, descricao: c.descricao || fDesc.value.trim(), responsavel_id: c.responsavel_id ?? null, pai_id: c.pai_id ?? null,
            inicio: fIni.value || O.d.hoje, duracao_dias: durNum() ?? 1, avanco: +fAv.value, situacao: fSit.value, peso: +fPeso.value || 1, observacoes: fObs.value || null, ordem });
          fechar(); await aposMudar(r, 'Atividade criada.');
        } else if (Object.keys(c).length) {
          const r = await api('atividades/' + a.id, 'PATCH', c); fechar(); await aposMudar(r, 'Atividade salva.');
        } else fechar();
      } catch (e) { btSalvar.disabled = false; avisar(e.message, 'error'); }
    };
    const excluir = async () => {
      const n = O.d.atividades.filter(x => descendeDe(x, a.id)).length;
      const ok = await modal('Excluir atividade', h('div', { class: 'og-corpo' }, h('p', null, `Excluir "${a.descricao}"` + (n ? ` e as ${n} subatividade${n > 1 ? 's' : ''} dela` : '') + '? As ligações com ela também saem.')),
        [['Cancelar', null], ['Excluir', true, 'og-bt-perigo']]);
      if (!ok) return;
      try { await api('atividades/' + a.id, 'DELETE'); fechar(); await aposMudar(null, 'Atividade excluída.'); } catch (e) { avisar(e.message, 'error'); }
    };
    const ap = h('aside', { class: 'og-painel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'og-p-t' },
      h('div', { class: 'og-p-cab' },
        h('div', { style: 'flex:1;min-width:0' }, h('small', { class: 'og-sub' }, a ? `${a.eap}${a.pai_id ? ' · ' + (O.d.atividades.find(x => x.id === a.pai_id) || {}).descricao : ''}` : 'Nova atividade'),
          h('h2', { id: 'og-p-t' }, a ? a.descricao : 'Nova atividade'),
          a ? h('div', { class: 'ob-etqs' }, h('span', { class: 'ob-sit ' + ({ 'Concluído': 'con', 'Em andamento': 'and', 'Reprogramado': 'pau' }[a.situacao] || 'arq') }, a.situacao),
            a.critica ? h('span', { class: 'ob-chip-farol verm' }, 'Caminho crítico') : null, a.atrasada ? h('span', { class: 'ob-chip-farol verm' }, 'Atrasada') : null, a.etapa ? h('span', { class: 'ob-tipo' }, 'Etapa: datas e avanço vêm das subatividades') : null) : null),
        h('button', { class: 'ob-x', 'aria-label': 'Fechar', onclick: fechar }, ic('fa-xmark'))),
      h('div', { class: 'og-p-corpo' },
        a && a.travada ? h('div', { class: 'og-p-trav', role: 'status' }, ic('fa-triangle-exclamation'),
          h('div', null, h('b', null, 'Travou: '), a.travada.descricao, h('small', null, `${a.travada.por || ''} · ${new Date(a.travada.desde.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`)),
          (edita || enc) ? h('button', { class: 'ob-bt', onclick: async () => { try { await api(`ocorrencias/${a.travada.id}/liberar`, 'PATCH', {}); fechar(); await aposMudar(null, 'Atividade liberada.'); } catch (e) { avisar(e.message, 'error'); } } }, 'Liberar') : null) : null,
        a && a.fotos ? h('div', { class: 'og-sec' }, h('b', null, `Fotos de campo (${a.fotos})`), fotosBox) : null,
        a && !a.etapa ? h('div', { class: 'og-sec' }, h('b', null, 'Documentos exigidos de quem fizer'), exigBox) : null,
        a && !a.etapa ? h('div', { class: 'og-sec' }, h('b', null, 'Recursos da atividade'), recBox) : null,
        campo('Nome da atividade', fDesc),
        campo('Responsável', fResp),
        h('div', { class: 'ob-g3' }, campo('Início', fIni), campo('Fim', fFim), campo('Duração', fDur)),
        h('small', { class: 'og-sub' }, `Dias úteis pelo calendário ${O.d.calendario.nome}. Digite "5d" e o fim é calculado.`),
        aviso,
        h('div', { class: 'og-sec' }, h('b', null, 'Depende de (predecessoras)'), predBox),
        h('div', { class: 'og-sec' }, h('div', { class: 'og-av-cab' }, h('b', null, 'Avanço'), avTxt), fAv),
        h('div', { class: 'ob-g3' }, campo('Situação', fSit), campo('Peso', fPeso), campo('Etapa', fPai)),
        campo('Observações', fObs),
        nova ? null : h('div', { class: 'og-sec' }, h('b', null, 'Histórico'), hist)),
      h('div', { class: 'og-p-pe' }, !nova && edita ? h('button', { class: 'ob-bt og-bt-perigo', onclick: excluir }, 'Excluir') : null, h('span', { style: 'flex:1' }),
        h('button', { class: 'ob-bt', onclick: fechar }, 'Cancelar'), (edita || enc) ? btSalvar : null));
    const fundo = h('div', { class: 'og-painel-fundo' }, ap);
    fundo.addEventListener('mousedown', ev => { if (ev.target === fundo) fechar(); });
    document.addEventListener('keydown', esc);
    document.body.append(fundo);
    if (foco === 'pred') predBox.scrollIntoView({ block: 'center' }); else if (nova) fDesc.focus();
  }
  function descendeDe(x, id) { let p = x.pai_id; const A = O.d.atividades; while (p) { if (p === id) return true; const q = A.find(y => y.id === p); p = q ? q.pai_id : null; } return false; }

  /* ── celular: cartões por etapa ─────────────── */
  function cronoCelular() {
    const f = O.f, L = linhas(), box = h('div', { class: 'og-cel' });
    const chip = (v, t) => h('button', { class: 'ob-chip' + (f.chip === v ? ' on' : ''), 'aria-pressed': f.chip === v ? 'true' : 'false', onclick: () => { f.chip = v; desenhar(); } }, t);
    box.append(h('div', { class: 'ob-chips og-chips' }, chip('todas', 'Todas'), chip('atrasadas', 'Atrasadas'), chip('semana', 'Desta semana')));
    const podeAv = podeTudo() || eu().perfil === 'encarregado';
    const grupos = []; let atual = null;
    L.forEach(a => { if (a.etapa && a.nivel === 0) { atual = { etapa: a, itens: [] }; grupos.push(atual); } else if (!a.etapa) { if (!atual) { atual = { etapa: null, itens: [] }; grupos.push(atual); } atual.itens.push(a); } });
    if (!grupos.length) box.append(h('div', { class: 'ob-vazio' + (O.d.atividades.length ? '' : ' og-vazio-crono') }, ic('fa-list-check'), h('p', null, O.d.atividades.length ? 'Nenhuma atividade com esse filtro.' : 'O cronograma está vazio.'),
      !O.d.atividades.length && podeTudo() && window.tfObraMontar ? h('button', { class: 'ob-bt ob-bt-pri', onclick: () => tfObraMontar(O, { carregar, api, avisar }) }, ic('fa-wand-magic-sparkles'), 'Montar com modelo, cópia ou arquivo') : null));
    grupos.forEach(g => {
      const sec = h('section', { class: 'og-cel-grupo' });
      if (g.etapa) sec.append(h('div', { class: 'og-cel-etapa' }, h('b', null, `${g.etapa.eap} · ${g.etapa.descricao}`), h('span', null, g.etapa.avanco + '%')));
      g.itens.sort((x, y) => (y.atrasada - x.atrasada) || (x.situacao === 'Concluído') - (y.situacao === 'Concluído'));
      g.itens.forEach(a => {
        const sit = a.atrasada ? ['Atrasada', 'verm'] : a.situacao === 'Concluído' ? ['Concluída', 'verd'] : a.situacao === 'Em andamento' ? ['Em andamento', 'azul'] : [a.situacao, 'cinz'];
        const mudar = async (n, extra) => { try { const r = await api('atividades/' + a.id, 'PATCH', { avanco: n, situacao: n >= 100 ? 'Concluído' : n > 0 && a.situacao === 'Pendente' ? 'Em andamento' : (n < 100 && a.situacao === 'Concluído' ? 'Em andamento' : a.situacao), ...(extra || {}) }); await aposMudar(r, `Avanço: ${n}%`); } catch (e) { avisar(e.message, 'error'); } };
        sec.append(h('article', { class: 'og-cel-card' + (a.atrasada ? ' atras' : '') },
          h('div', { class: 'og-cel-topo', onclick: () => painel(a) }, h('small', null, a.eap),
            h('div', { class: 'og-cel-nome' }, h('b', null, a.descricao), h('small', null, `${a.responsavel_nome || 'Sem responsável'} · ${dBR(a.inicio)} → ${dBR(a.fim)}`),
              a.travada ? h('small', { class: 'og-cel-trav' }, ic('fa-triangle-exclamation'), ' Travou: ', a.travada.descricao) : null),
            h('span', { class: 'og-sit ' + sit[1] }, sit[0])),
          a.marco ? null : h('div', { class: 'og-cel-av' },
            h('button', { class: 'ob-bt', 'aria-label': 'Diminuir 10%', disabled: !podeAv || a.avanco <= 0, onclick: () => mudar(Math.max(0, a.avanco - 10)) }, '−'),
            h('div', { class: 'og-cel-bar' }, h('div', { class: 'ob-bar-trilho' }, h('div', { class: 'ob-bar-ench ' + sit[1], style: `width:${a.avanco}%` })), h('small', null, `${a.avanco}% feito`)),
            h('button', { class: 'ob-bt', 'aria-label': 'Aumentar 10%', disabled: !podeAv || a.avanco >= 100, onclick: () => mudar(Math.min(100, a.avanco + 10)) }, '+'),
            h('button', { class: 'ob-bt og-ok', 'aria-label': 'Marcar como concluída', disabled: !podeAv || a.avanco >= 100, onclick: () => mudar(100) }, ic('fa-check')))));
      });
      box.append(sec);
    });
    return box;
  }

  /* ── ligação com o menu ─────────────────────── */
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome === 'obra') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Obra'; }
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); if (raiz() && raiz().classList.contains('active')) desenhar(); } }; })());
  window.tfObra = { abrir, recarregar: carregar, estado: O, painel: a => painel(a), salvarLinhaBase, desenhar };
})();
