/* Mercronos · recursos.js — tela "Recursos": equipamentos, veículos e ferramentas; reservas pelas atividades, conflitos,
   mapa de reservas, locação (fornecedor, período, custo, devolução), calibração/manutenção/inspeção e paradas.
   Usa as peças visuais da Equipe (eq-*) e as próprias (rc-*). */
(() => {
  'use strict';
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
  const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const T = s => Date.parse(s + 'T00:00:00Z');
  const mais = (s, n) => new Date(T(s) + n * 864e5).toISOString().slice(0, 10);
  const dias = (a, b) => Math.round((T(b) - T(a)) / 864e5);
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
  const dBRano = s => s ? dBR(s) + '/' + s.slice(0, 4) : '—';
  const per = (i, f) => i === f ? dBR(i) : `${dBR(i)} a ${dBR(f)}`;
  const reais = n => n == null ? '—' : 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const celular = () => window.innerWidth <= 760;
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
  const raiz = () => document.getElementById('view-recursos');
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const lerArquivo = arq => new Promise((res, rej) => {
    if (arq.type === 'application/pdf') { if (arq.size > 10 * 1024 * 1024) { rej(new Error('PDF grande demais (até 10 MB)')); return; } const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Não consegui ler o arquivo')); fr.readAsDataURL(arq); return; }
    const url = URL.createObjectURL(arq), img = new Image();
    img.onload = () => { const r = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Envie PDF, JPG ou PNG')); };
    img.src = url;
  });
  const TIPO = { equipamento: ['Equipamento', 'fa-gears'], veiculo: ['Veículo', 'fa-truck'], ferramenta: ['Ferramenta', 'fa-screwdriver-wrench'], outro: ['Outro', 'fa-box'] };
  const CTRL = { calibracao: 'Calibração', manutencao: 'Manutenção', inspecao: 'Inspeção' };
  const icone = (t, g) => h('span', { class: 'rc-ic' + (g ? ' g' : '') }, ic((TIPO[t] || TIPO.outro)[1]));
  const NIVEL = { grave: 'vc', atencao: 'ven', ok: 'ok', aviso: 'cz' };
  const SIT = { em_uso: 'ok', livre: 'cz', manutencao: 'rx', inativo: 'cz' };
  const selo = (txt, cls) => h('span', { class: 'eq-selo ' + (cls || 'cz') }, txt);
  const barra = c => { const cor = c > 100 ? 'verm' : c === 0 ? 'cinza' : 'azul'; return h('div', { class: 'eq-carga ' + cor }, h('span', null, h('i', { style: `width:${Math.min(100, c)}%` })), h('b', null, c + '%')); };
  const abrirObra = pid => { if (window.tfObra && pid) tfObra.abrir(pid); };

  const M = { d: null, ficha: null, f: null, aba: 'geral', modo: 'cartoes', mapa: null, semanas: 4, inicio: null, filtro: { busca: '', tipo: '', prop: '', sit: '', obra: '', inativos: false } };

  /* ── carga ──────────────────────────────────── */
  async function carregar() {
    try { M.d = await api('recursos'); M.erro = null; } catch (e) { M.erro = e.message; }
    if (M.modo === 'mapa' && !celular()) await carregarMapa(); else desenhar();
  }
  async function carregarMapa() {
    try { M.mapa = await api(`recursos-mapa?semanas=${M.semanas}` + (M.inicio ? '&inicio=' + M.inicio : '')); } catch (e) { avisar(e.message, 'error'); }
    desenhar();
  }
  async function abrirFicha(id, aba) {
    M.ficha = id; M.f = null; M.aba = aba || (celular() ? 'reservas' : 'geral'); desenhar(); window.scrollTo(0, 0);
    try { M.f = await api('recursos/' + id); } catch (e) { avisar(e.message, 'error'); M.ficha = null; }
    desenhar();
  }
  const recarregarFicha = () => abrirFicha(M.ficha, M.aba);

  /* ── desenho ────────────────────────────────── */
  function desenhar() {
    const R = raiz(); if (!R || !R.classList.contains('active')) return;
    R.innerHTML = '';
    const box = h('div', { class: 'eq rc' }); R.append(box);
    if (M.ficha) { box.append(...ficha().filter(Boolean)); return; }
    if (!M.d) { box.append(h('p', { class: 'eq-vazio' }, M.erro || 'Carregando…')); return; }
    box.append(...lista().filter(Boolean));
  }
  function lista() {
    const d = M.d, k = d.indicadores, f = M.filtro, mob = celular();
    const cab = h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, 'Recursos'),
        h('p', null, `${k.total} equipamento${k.total === 1 ? '' : 's'}, veículos e ferramentas · ${k.alugados} alugado${k.alugados === 1 ? '' : 's'}`)),
      d.pode_editar && !mob ? h('button', { class: 'eq-bt', onclick: abrirFornecedores }, ic('fa-handshake'), ' Fornecedores de locação') : null,
      d.pode_editar ? h('button', { class: 'eq-bt pri', onclick: novoRecurso }, ic('fa-plus'), ' Novo recurso') : null);
    const kpi = (n, t, cor, fn) => h('button', { class: 'eq-kpi ' + cor + (fn && f.sit === fn ? ' on' : ''), onclick: () => { f.sit = f.sit === fn ? '' : (fn || ''); if (M.modo === 'mapa') M.modo = 'cartoes'; desenhar(); } }, h('b', null, n), h('span', null, t));
    const kpis = mob
      ? h('div', { class: 'eq-kpis' }, kpi(k.em_uso, 'em uso', 'verd', 'em_uso'), kpi(k.vencidos, 'vencidos', 'verm', 'vencido'), kpi(k.devolucoes, 'devolver', 'amar', 'devolver'))
      : h('div', { class: 'eq-kpis' }, kpi(k.em_uso, 'em uso hoje', 'verd', 'em_uso'), kpi(k.livres, 'livres hoje', 'cinz', 'livre'), kpi(k.devolucoes, 'devoluções de locação em 7 dias', 'amar', 'devolver'),
          kpi(k.vencidos, 'calibração ou manutenção vencida', 'verm', 'vencido'), kpi(k.conflitos, 'conflito de reserva', 'lar', 'conflito'));
    const busca = h('input', { type: 'search', placeholder: 'Buscar recurso ou código', 'aria-label': 'Buscar recurso', value: f.busca, oninput: e => { f.busca = e.target.value; desenharGrade(); } });
    const sel = (rot, val, ops, fn) => h('select', { 'aria-label': rot, onchange: e => { fn(e.target.value); M.modo === 'mapa' ? desenhar() : desenharGrade(); } }, ops.map(([v, t]) => h('option', { value: v, selected: String(v) === String(val) }, t)));
    const obras = [...new Set(d.recursos.flatMap(r => r.obras))].sort();
    const filtros = h('div', { class: 'eq-filtros' }, h('label', { class: 'eq-busca' }, ic('fa-magnifying-glass'), busca),
      mob ? null : sel('Tipo', f.tipo, [['', 'Todos os tipos'], ...Object.entries(TIPO).map(([v, [t]]) => [v, t])], v => f.tipo = v),
      mob ? null : sel('Propriedade', f.prop, [['', 'Próprios e alugados'], ['proprio', 'Próprios'], ['alugado', 'Alugados']], v => f.prop = v),
      mob ? null : sel('Situação', f.sit, [['', 'Situação: todas'], ['em_uso', 'Em uso'], ['livre', 'Livres'], ['manutencao', 'Em manutenção'], ['vencido', 'Calibração/manutenção vencida'], ['devolver', 'Devolver em 7 dias'], ['conflito', 'Com conflito']], v => f.sit = v),
      mob ? null : sel('Obra', f.obra, [['', 'Todas as obras'], ...obras.map(o => [o, o])], v => f.obra = v),
      mob ? null : h('span', { class: 'rc-modo', role: 'group', 'aria-label': 'Ver como' },
        h('button', { class: M.modo === 'cartoes' ? 'on' : '', onclick: () => { M.modo = 'cartoes'; desenhar(); } }, 'Cartões'),
        h('button', { class: M.modo === 'mapa' ? 'on' : '', onclick: () => { M.modo = 'mapa'; carregarMapa(); } }, 'Mapa de reservas')));
    const chips = mob ? h('div', { class: 'rc-chips' }, [['', 'Todos'], ['em_uso', 'Em uso'], ['livre', 'Livres'], ['vencido', 'Vencidos'], ['alugado', 'Alugados']].map(([v, t]) =>
      h('button', { class: (v === 'alugado' ? f.prop === 'alugado' : f.sit === v && !f.prop) ? 'on' : '', onclick: () => { if (v === 'alugado') { f.prop = f.prop ? '' : 'alugado'; f.sit = ''; } else { f.sit = v; f.prop = ''; } desenhar(); } }, t))) : null;
    const out = [cab, kpis, filtros, chips];
    if (d.conflitos.length && (M.modo === 'mapa' || f.sit === 'conflito' || !mob)) out.push(avisoConflitos(d.conflitos));
    if (M.modo === 'mapa' && !mob) out.push(mapa());
    else { const g = h('div', { class: 'eq-grade', id: 'rc-grade' }); out.push(g); setTimeout(desenharGrade, 0); }
    return out;
  }
  function avisoConflitos(C) {
    const c = C[0], a = c.atividades;
    return h('div', { class: 'rc-conf' }, h('b', null, ic('fa-triangle-exclamation'), ` ${C.length} conflito${C.length > 1 ? 's' : ''}`),
      h('span', null, `${c.recurso ? c.recurso.nome : 'Recurso'} reservado em `, h('b', null, `${a[0].obra} · ${a[0].descricao}`), ' e ', h('b', null, `${a[1].obra} · ${a[1].descricao}`), ` em ${per(c.de, c.ate)}.`,
        C.length > 1 ? ` E mais ${C.length - 1}.` : ''),
      h('button', { class: 'eq-bt', onclick: () => abrirObra(a[1].projeto_id) }, 'Abrir a obra'),
      M.modo !== 'mapa' && !celular() ? h('button', { class: 'eq-bt', onclick: () => { M.modo = 'mapa'; carregarMapa(); } }, 'Ver no mapa') : null);
  }
  function filtrar(L) {
    const f = M.filtro, b = sem(f.busca.trim());
    return L.filter(r => (f.inativos || r.ativo || f.sit === 'inativo') && (!b || sem([r.nome, r.codigo, r.modelo, r.locacao && r.locacao.fornecedor].join(' ')).includes(b))
      && (!f.tipo || r.tipo === f.tipo) && (!f.prop || r.propriedade === f.prop) && (!f.obra || r.obras.includes(f.obra))
      && (!f.sit || (f.sit === 'vencido' ? r.alertas.some(a => a.tipo === 'controle' && a.nivel === 'grave') : f.sit === 'devolver' ? r.locacao && r.locacao.dias_para_devolver <= 7
        : f.sit === 'conflito' ? r.alertas.some(a => a.tipo === 'conflito') : r.situacao.tipo === f.sit)));
  }
  function cartao(r) {
    const prox = r.atual || r.proxima;
    return h('button', { class: 'eq-card rc-card' + (r.ativo ? '' : ' inativo'), onclick: () => abrirFicha(r.id) },
      h('div', { class: 'eq-card-cab' }, icone(r.tipo), h('span', { class: 'eq-card-t' }, h('b', null, r.nome),
        h('small', null, [r.codigo, r.propriedade === 'alugado' ? 'Alugado' + (r.locacao && r.locacao.fornecedor ? ' · ' + r.locacao.fornecedor : '') : 'Próprio'].filter(Boolean).join(' · ')))),
      h('div', { class: 'eq-selos' }, selo(r.situacao.texto, SIT[r.situacao.tipo]), r.alertas.map(a => selo(a.texto, NIVEL[a.nivel]))),
      h('dl', { class: 'eq-dl' }, h('dt', null, 'Atividade'), h('dd', null, r.situacao.tipo === 'manutencao' ? (r.situacao.motivo || 'Manutenção') : prox ? (r.atual ? '' : 'Próxima: ') + prox.descricao + ' — ' + prox.obra : '—'),
        h('dt', null, 'Quando'), h('dd', null, prox && r.situacao.tipo !== 'manutencao' ? (r.atual ? 'até ' + dBR(prox.fim) : per(prox.inicio, prox.fim)) : '—')),
      h('div', null, h('small', { class: 'eq-rot' }, 'Ocupação nos próximos 14 dias' + (r.ocupacao > 100 ? ' · reservado em dobro' : '')), barra(r.ocupacao)));
  }
  function desenharGrade() {
    const g = document.getElementById('rc-grade'); if (!g) return;
    const L = filtrar(M.d.recursos); g.innerHTML = '';
    if (!M.d.recursos.length) { g.append(h('div', { class: 'rc-vazio' }, h('b', null, 'Nenhum recurso cadastrado'), h('span', null, 'Cadastre plataformas, caminhões, geradores, instrumentos de medição… e escolha-os nas atividades da obra.'),
      M.d.pode_editar ? h('button', { class: 'eq-bt pri', onclick: novoRecurso }, ic('fa-plus'), ' Novo recurso') : null)); return; }
    if (!L.length) { g.append(h('p', { class: 'eq-vazio' }, 'Nenhum recurso com esses filtros.')); return; }
    L.forEach(r => g.append(cartao(r)));
  }

  /* ── mapa de reservas ───────────────────────── */
  function mapa() {
    const m = M.mapa;
    const nav = h('div', { class: 'rc-mapa-nav' },
      h('button', { class: 'eq-bt', 'aria-label': 'Semanas anteriores', onclick: () => { M.inicio = mais(m.inicio, -7 * Math.max(1, M.semanas / 2)); carregarMapa(); } }, ic('fa-chevron-left')),
      h('button', { class: 'eq-bt', onclick: () => { M.inicio = null; carregarMapa(); } }, 'Hoje'),
      h('button', { class: 'eq-bt', 'aria-label': 'Próximas semanas', onclick: () => { M.inicio = mais(m.inicio, 7 * Math.max(1, M.semanas / 2)); carregarMapa(); } }, ic('fa-chevron-right')),
      m ? h('span', null, `${dBRano(m.inicio)} a ${dBRano(m.fim)}`) : null,
      h('span', { class: 'rc-modo' }, [4, 8, 12].map(n => h('button', { class: M.semanas === n ? 'on' : '', onclick: () => { M.semanas = n; carregarMapa(); } }, n + ' sem'))));
    if (!m) return h('div', null, nav, h('p', { class: 'eq-vazio' }, 'Carregando…'));
    const D = m.semanas * 7, pct = s => Math.max(0, Math.min(100, dias(m.inicio, s) / D * 100)), larg = (i, f) => Math.max(0.6, pct(mais(f, 1)) - pct(i));
    const f = M.filtro, b = sem(f.busca.trim()), info = new Map(M.d.recursos.map(r => [r.id, r]));
    const linhas = m.linhas.filter(l => { const r = info.get(l.id) || {}; return (!b || sem(l.nome + ' ' + (l.codigo || '')).includes(b)) && (!f.tipo || l.tipo === f.tipo) && (!f.prop || l.propriedade === f.prop) && (!f.obra || l.reservas.some(x => x.obra === f.obra)); });
    const sems = []; for (let k = 0; k < m.semanas; k++) sems.push(mais(m.inicio, k * 7));
    const grade = () => sems.map((s, k) => h('i', { class: 'rc-g-sem', style: `left:${k / m.semanas * 100}%` }));
    const cab = h('div', { class: 'rc-m-lin cab' }, h('span', null, 'Recurso'), h('span', { class: 'rc-m-area' }, sems.map((s, k) => h('span', { class: 'rc-m-s', style: `left:${k / m.semanas * 100}%` }, (m.semanas > 6 ? '' : 'semana de ') + dBR(s)))));
    const corpo = linhas.map(l => {
      const faixas = []; const pistas = [];           // reservas que se cruzam vão para pistas diferentes
      l.reservas.forEach(x => { let p = pistas.findIndex(fim => fim < x.inicio); if (p < 0) { p = pistas.length; pistas.push(x.fim); } else pistas[p] = x.fim; faixas.push([x, p]); });
      const area = h('span', { class: 'rc-m-area' }, grade(),
        l.locacao ? h('i', { class: 'rc-m-loc', style: `left:${pct(l.locacao.retirada)}%;width:${larg(l.locacao.retirada < m.inicio ? m.inicio : l.locacao.retirada, l.locacao.devolucao_prevista)}%`, title: `Locação até ${dBRano(l.locacao.devolucao_prevista)}` }) : null,
        l.controle_vencido ? h('i', { class: 'rc-m-b cal', style: 'left:0;width:100%', title: l.controle_vencido }, l.controle_vencido + ' — não use até renovar') : null,
        l.paradas.map(p => h('i', { class: 'rc-m-b man', style: `left:${pct(p.inicio)}%;width:${larg(p.inicio < m.inicio ? m.inicio : p.inicio, p.fim)}%`, title: `Manutenção ${per(p.inicio, p.fim)}` + (p.motivo ? ' · ' + p.motivo : '') }, 'Manutenção' + (p.motivo ? ' · ' + p.motivo : ''))),
        faixas.map(([x, p]) => h('button', { class: 'rc-m-b' + (x.conflito ? ' conf' : ''), style: `left:${pct(x.inicio)}%;width:${larg(x.inicio < m.inicio ? m.inicio : x.inicio, x.fim)}%;top:${8 + p * 27}px`,
          title: `${x.obra} · ${x.descricao} · ${per(x.inicio, x.fim)}${x.conflito ? ' · CONFLITO' : ''}`, onclick: () => abrirObra(x.projeto_id) }, `${x.obra} · ${x.descricao}`)),
        m.hoje >= m.inicio && m.hoje <= m.fim ? h('i', { class: 'rc-m-hoje', style: `left:${pct(m.hoje)}%` }) : null);
      return h('div', { class: 'rc-m-lin', style: `height:${Math.max(48, 16 + Math.max(1, pistas.length) * 27)}px` },
        h('button', { class: 'rc-m-nome', onclick: () => abrirFicha(l.id) }, h('b', null, (l.codigo ? l.codigo + ' · ' : '') + l.nome), h('small', null, l.controle_vencido || l.sub)), area);
    });
    const leg = h('div', { class: 'rc-m-leg' }, [['', 'Reservado para atividade'], ['conf', 'Conflito (mesmo recurso, mesmos dias)'], ['man', 'Manutenção'], ['cal', 'Calibração/manutenção vencida'], ['loc', 'Período de locação']].map(([c, t]) => h('span', null, h('i', { class: 'rc-m-ley ' + c }), t)));
    return h('div', null, nav, h('div', { class: 'rc-mapa' }, cab, linhas.length ? corpo : h('p', { class: 'eq-vazio' }, 'Nenhum recurso com esses filtros.'), leg));
  }

  /* ── ficha ──────────────────────────────────── */
  function ficha() {
    const voltar = h('button', { class: 'eq-voltar', onclick: () => { M.ficha = null; M.f = null; carregar(); } }, ic('fa-arrow-left'), ' Recursos');
    if (!M.f) return [voltar, h('p', { class: 'eq-vazio' }, 'Carregando…')];
    const F = M.f, mob = celular();
    const cab = h('div', { class: 'eq-ficha-cab' }, icone(F.tipo, true),
      h('div', { class: 'eq-ficha-t' }, h('h1', null, F.nome),
        h('p', null, [F.codigo, TIPO[F.tipo][0], F.propriedade === 'alugado' ? 'Alugado' : 'Próprio', F.modelo, F.numero_serie ? 'série ' + F.numero_serie : null].filter(Boolean).join(' · ')),
        h('div', { class: 'eq-selos' }, selo(F.situacao.texto, SIT[F.situacao.tipo]), F.alertas.map(a => selo(a.texto, NIVEL[a.nivel])))),
      h('div', { class: 'eq-ficha-carga' }, h('small', { class: 'eq-rot' }, 'Ocupação nos próximos 14 dias'), barra(F.ocupacao)),
      F.pode_editar && !mob ? h('button', { class: 'eq-bt', onclick: () => { M.aba = 'dados'; desenhar(); } }, 'Editar') : null);
    const vencido = F.alertas.find(a => a.tipo === 'controle' && a.nivel === 'grave');
    const alerta = vencido ? h('div', { class: 'rc-alerta' }, `${vencido.texto}. Medições ou uso com ele ficam sem respaldo até renovar. Ao reservar numa atividade, o sistema avisa.`) : null;
    const abas = [mob ? null : ['geral', 'Visão geral'], ['reservas', `Reservas (${F.reservas.filter(r => r.situacao !== 'concluida').length})`], ['controles', mob ? 'Calibração' : 'Calibração e manutenção'], ['locacao', 'Locação'], ['dados', 'Dados']].filter(Boolean);
    const tabs = h('div', { class: 'eq-abas', role: 'tablist' }, abas.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': M.aba === k ? 'true' : 'false', class: M.aba === k ? 'on' : '', onclick: () => { M.aba = k; desenhar(); } }, t)));
    let corpo;
    if (M.aba === 'geral') corpo = h('div', { class: 'rc-geral' }, h('div', { class: 'rc-col' }, painelLocacao(true), painelParadas()), h('div', { class: 'rc-col' }, painelReservas(true), painelControles()));
    else corpo = { reservas: () => painelReservas(), controles: () => h('div', { class: 'rc-col' }, painelControles(), painelParadas()), locacao: () => painelLocacao(), dados: abaDados }[M.aba]();
    return [voltar, cab, alerta, tabs, corpo];
  }
  const painel = (titulo, sub, botoes, ...corpo) => h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, titulo), h('small', null, sub)), botoes ? h('div', { class: 'rc-bts' }, botoes) : null), ...corpo);
  function painelReservas(resumo) {
    const F = M.f, L = F.reservas.filter(r => !resumo || r.situacao !== 'concluida');
    const SR = { andamento: ['Em andamento', 'az'], futura: ['Programada', 'cz'], atrasada: ['Atrasada', 'vc'], concluida: ['Concluída', 'ok'] };
    return painel('Reservas', 'Vêm das atividades em que o recurso foi escolhido. Mudou a data da atividade, a reserva acompanha.', null,
      L.length ? L.map(r => h('button', { class: 'rc-res', onclick: () => abrirObra(r.projeto_id) },
        h('span', { class: 'rc-res-o' }, r.obra), h('span', { class: 'rc-res-d' }, h('b', null, r.descricao), r.pendencias ? h('small', null, 'Reservado com pendências: ' + r.pendencias) : null),
        h('span', null, per(r.inicio, r.fim)), h('span', { class: 'eq-selos' }, selo(...SR[r.situacao]), r.depois_devolucao ? selo('Depois da devolução', 'ven') : null))) : h('p', { class: 'eq-vazio' }, 'Nenhuma reserva. Escolha o recurso no painel da atividade, na obra.'));
  }
  function painelControles() {
    const F = M.f;
    const bt = F.pode_editar ? h('button', { class: 'eq-bt' + (celular() ? ' pri' : ''), onclick: () => lancarControle(null) }, ic('fa-plus'), celular() ? ' Lançar com foto' : ' Lançar calibração ou manutenção') : null;
    const cor = { vencido: 'vc', vencendo: 'ven', ok: 'ok' };
    const linhas = F.controles.map(c => h('div', { class: 'rc-ctrl ' + c.situacao },
      h('div', { class: 'rc-ctrl-n' }, h('b', null, c.item), h('small', null, [CTRL[c.tipo], c.instituicao].filter(Boolean).join(' · '))),
      h('div', null, h('small', null, 'Feito em'), dBRano(c.feito_em)), h('div', null, h('small', null, c.situacao === 'vencido' ? 'Venceu em' : 'Vence em'), c.vence_em ? dBRano(c.vence_em) : 'sem vencimento'),
      h('div', null, selo(c.situacao_texto, cor[c.situacao])),
      h('div', { class: 'rc-ctrl-a' }, c.tem_arquivo ? h('a', { href: `api/controles/${c.id}/arquivo`, target: '_blank', rel: 'noopener' }, ic('fa-paperclip'), ' certificado') : h('small', null, 'sem arquivo'),
        F.pode_editar ? h('button', { class: 'eq-bt', onclick: () => lancarControle(c) }, 'Renovar') : null)));
    const hist = F.controles_historico.length ? h('details', { class: 'rc-hist' }, h('summary', null, `Lançamentos anteriores (${F.controles_historico.length})`),
      F.controles_historico.map(c => h('div', null, `${CTRL[c.tipo]} · ${c.item} — feito em ${dBRano(c.feito_em)}${c.vence_em ? ', vencia em ' + dBRano(c.vence_em) : ''}`, c.tem_arquivo ? h('a', { href: `api/controles/${c.id}/arquivo`, target: '_blank', rel: 'noopener' }, ' · certificado') : null))) : null;
    return painel('Calibração e manutenção', 'Certificados e revisões com vencimento. Vencido ou vencendo no período: o sistema avisa ao reservar.', bt,
      F.controles.length ? linhas : h('p', { class: 'eq-vazio' }, 'Nenhum lançamento. Ex.: calibração RBC do instrumento, inspeção anual da plataforma, revisão do caminhão.'), hist);
  }
  function painelParadas() {
    const F = M.f;
    const bt = F.pode_editar ? h('button', { class: 'eq-bt', onclick: novaParada }, ic('fa-wrench'), ' Registrar parada') : null;
    const L = F.paradas.filter(p => p.fim >= F.hoje);
    return painel('Fora de uso', 'Períodos em manutenção ou conserto. Quem reservar nesses dias é avisado.', bt,
      L.length ? L.map(p => h('div', { class: 'rc-par' }, h('span', null, h('b', null, per(p.inicio, p.fim)), ' ', p.motivo || ''),
        F.pode_editar ? h('button', { class: 'eq-x', 'aria-label': 'Excluir parada', onclick: async () => { try { await api('paradas/' + p.id, 'DELETE'); recarregarFicha(); } catch (e) { avisar(e.message, 'error'); } } }, ic('fa-xmark')) : null))
        : h('p', { class: 'eq-vazio' }, 'Nenhuma parada programada.'));
  }
  function painelLocacao(resumo) {
    const F = M.f, l = F.locacoes.find(x => !x.devolvido_em), ed = F.pode_editar;
    if (!l) {
      if (resumo && F.propriedade !== 'alugado') return null;
      return painel('Locação', F.propriedade === 'alugado' ? 'Devolvido ao fornecedor.' : 'Recurso próprio.',
        ed ? h('button', { class: 'eq-bt', onclick: novaLocacao }, ic('fa-plus'), F.propriedade === 'alugado' ? ' Nova locação' : ' Registrar locação') : null, historicoLocacoes());
    }
    const campo = (k, v) => h('div', null, h('small', null, k), h('b', null, v));
    const n = l.dias_para_devolver;
    const depois = F.reservas.filter(r => r.depois_devolucao);
    return painel('Locação', `Alugado${l.fornecedor ? ' de ' + l.fornecedor : ''} — período, custo e devolução.`,
      ed ? [h('button', { class: 'eq-bt', onclick: () => estender(l) }, 'Estender locação'), h('button', { class: 'eq-bt pri', onclick: () => devolver(l) }, 'Registrar devolução')] : null,
      h('div', { class: 'rc-loc' }, campo('Fornecedor', l.fornecedor || '—'), campo('Contrato', l.contrato || '—'), campo('Retirada', dBRano(l.retirada)),
        campo('Devolução prevista', dBRano(l.devolucao_prevista) + (n < 0 ? ` · atrasada ${-n} dia${-n > 1 ? 's' : ''}` : n === 0 ? ' · hoje' : ` · em ${n} dia${n > 1 ? 's' : ''}`)),
        'custo' in l ? campo('Custo', l.custo == null ? '—' : `${reais(l.custo)} / ${{ dia: 'dia', semana: 'semana', mes: 'mês' }[l.custo_unidade]}`) : null,
        'custo' in l ? campo('Até agora', l.custo_ate_agora == null ? '—' : `${reais(l.custo_ate_agora)} (${l.dias_uso} dia${l.dias_uso > 1 ? 's' : ''})`) : null,
        'custo' in l ? campo('Previsto total', reais(l.custo_previsto)) : null, campo('Contato', l.fornecedor_telefone || l.fornecedor_contato || '—')),
      depois.length ? h('p', { class: 'eq-nota' }, `A reserva ${depois.map(r => `"${r.descricao}" (até ${dBR(r.fim)})`).join(', ')} termina depois da devolução. Estenda a locação até ${dBR(depois.reduce((a, r) => r.fim > a ? r.fim : a, ''))} ou troque o recurso na atividade.`) : null,
      resumo ? null : historicoLocacoes());
  }
  function historicoLocacoes() {
    const L = M.f.locacoes.filter(x => x.devolvido_em);
    return L.length ? h('details', { class: 'rc-hist' }, h('summary', null, `Locações anteriores (${L.length})`),
      L.map(l => h('div', null, `${l.fornecedor || 'Fornecedor'} · ${dBRano(l.retirada)} a ${dBRano(l.devolvido_em)}${'custo_ate_agora' in l && l.custo_ate_agora != null ? ' · ' + reais(l.custo_ate_agora) : ''}`))) : null;
  }
  function abaDados() {
    const F = M.f, ed = F.pode_editar;
    const inp = (k, v, extra) => h('input', Object.assign({ 'data-k': k, value: v == null ? '' : v, disabled: !ed }, extra || {}));
    const tipo = h('select', { 'data-k': 'tipo', disabled: !ed }, Object.entries(TIPO).map(([v, [t]]) => h('option', { value: v, selected: v === F.tipo }, t)));
    const unid = h('select', { 'data-k': 'custo_unidade', disabled: !ed }, [['', '—'], ['hora', 'por hora'], ['dia', 'por dia']].map(([v, t]) => h('option', { value: v, selected: v === (F.custo_unidade || '') }, t)));
    const ativo = h('input', { type: 'checkbox', 'data-k': 'ativo', checked: F.ativo, disabled: !ed });
    const obs = h('textarea', { 'data-k': 'observacao', rows: '3', disabled: !ed }, F.observacao || '');
    const campo = (t, el, larga) => h('label', { class: 'eq-campo' + (larga ? ' larga' : '') }, h('span', null, t), el);
    const form = h('div', { class: 'eq-form' }, campo('Nome', inp('nome', F.nome, { maxlength: '160' })), campo('Código', inp('codigo', F.codigo, { maxlength: '30', placeholder: 'Ex.: MUN-01' })),
      campo('Tipo', tipo), campo('Modelo', inp('modelo', F.modelo, { maxlength: '160' })), campo('Número de série / placa', inp('numero_serie', F.numero_serie, { maxlength: '80' })),
      'custo' in F && F.propriedade === 'proprio' ? campo('Custo interno (opcional)', h('div', { class: 'rc-custo' }, inp('custo', F.custo, { type: 'number', min: '0', step: '0.01' }), unid)) : null,
      campo('Observação', obs, true), h('label', { class: 'eq-chk larga' }, ativo, ' Ativo (desmarque se vendeu, sucateou ou não usa mais)'));
    const acoes = ed ? h('div', { class: 'eq-acoes rc-acoes' },
      h('button', { class: 'eq-bt rc-perigo', onclick: excluir }, ic('fa-trash'), ' Excluir recurso'),
      h('button', { class: 'eq-bt pri', onclick: async () => {
        const o = {}; form.querySelectorAll('[data-k]').forEach(el => { o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value.trim() === '' ? null : el.value.trim(); });
        if (!o.nome) { avisar('Informe o nome', 'error'); return; }
        try { await api('recursos/' + F.id, 'PATCH', o); avisar('Dados salvos', 'success'); recarregarFicha(); } catch (e) { avisar(e.message, 'error'); }
      } }, 'Salvar')) : null;
    return h('section', { class: 'eq-painel' }, form, acoes);
  }

  /* ── janelas ────────────────────────────────── */
  function janela(titulo, corpo, okTxt, aoOk, cls) {
    const fundo = h('div', { class: 'eq-fundo', role: 'presentation' });
    const bt = okTxt ? h('button', { class: 'eq-bt pri' }, okTxt) : null;
    const j = h('div', { class: 'eq-jan ' + (cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div', { class: 'eq-jan-cab' }, h('h2', null, titulo), h('button', { class: 'eq-x', 'aria-label': 'Fechar', onclick: () => fechar() }, ic('fa-xmark'))),
      h('div', { class: 'eq-jan-corpo' }, corpo), h('div', { class: 'eq-acoes' }, h('button', { class: 'eq-bt', onclick: () => fechar() }, 'Fechar'), bt));
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') fechar(); };
    if (bt && aoOk) bt.onclick = async () => { bt.disabled = true; try { await aoOk(); fechar(); } catch (e) { avisar(e.message, 'error'); } bt.disabled = false; };
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', esc);
    fundo.append(j); document.body.append(fundo);
    return fechar;
  }
  const campo = (t, el, larga) => h('label', { class: 'eq-campo' + (larga ? ' larga' : '') }, h('span', null, t), el);
  function camposLocacao(forn) {
    const fF = h('input', { type: 'text', list: 'rc-forn-lista', maxlength: '160', placeholder: 'Ex.: LocaMáq', 'aria-label': 'Fornecedor' });
    const dl = h('datalist', { id: 'rc-forn-lista' }, (forn || []).map(x => h('option', { value: x.nome })));
    const fC = h('input', { type: 'text', maxlength: '60', placeholder: 'Nº do contrato (opcional)', 'aria-label': 'Contrato' });
    const hoje = (M.d && M.d.hoje) || (M.f && M.f.hoje);
    const fR = h('input', { type: 'date', value: hoje, 'aria-label': 'Retirada' }), fD = h('input', { type: 'date', 'aria-label': 'Devolução prevista' });
    const fV = h('input', { type: 'number', min: '0', step: '0.01', placeholder: '0,00', 'aria-label': 'Custo' });
    const fU = h('select', { 'aria-label': 'Unidade do custo' }, [['dia', 'por dia'], ['semana', 'por semana'], ['mes', 'por mês']].map(([v, t]) => h('option', { value: v }, t)));
    const els = [campo('Fornecedor', h('div', null, fF, dl)), campo('Contrato', fC), campo('Retirada', fR), campo('Devolução prevista', fD), campo('Custo da locação', h('div', { class: 'rc-custo' }, fV, fU))];
    const ler = () => {
      if (!fR.value || !fD.value) throw new Error('Informe a retirada e a devolução prevista');
      const nome = fF.value.trim(), ex = (forn || []).find(x => x.nome === nome);
      return { ...(ex ? { fornecedor_id: ex.id } : { fornecedor_nome: nome || null }), contrato: fC.value.trim() || null, retirada: fR.value, devolucao_prevista: fD.value, custo: fV.value === '' ? null : +fV.value, custo_unidade: fU.value };
    };
    return [els, ler];
  }
  function novoRecurso() {
    const fN = h('input', { type: 'text', maxlength: '160', placeholder: 'Ex.: Plataforma tesoura 12 m', 'aria-label': 'Nome' });
    const fC = h('input', { type: 'text', maxlength: '30', placeholder: 'Ex.: PLT-02', 'aria-label': 'Código' });
    const fT = h('select', { 'aria-label': 'Tipo' }, Object.entries(TIPO).map(([v, [t]]) => h('option', { value: v }, t)));
    const fM = h('input', { type: 'text', maxlength: '160', placeholder: 'Marca / modelo (opcional)', 'aria-label': 'Modelo' });
    const fS = h('input', { type: 'text', maxlength: '80', placeholder: 'Série ou placa (opcional)', 'aria-label': 'Série' });
    const fP = h('select', { 'aria-label': 'Propriedade' }, h('option', { value: 'proprio' }, 'Próprio'), h('option', { value: 'alugado' }, 'Alugado'));
    const [locEls, lerLoc] = camposLocacao(M.d.fornecedores);
    const loc = h('div', { class: 'eq-form rc-sub', hidden: true }, h('b', { class: 'larga' }, 'Locação'), locEls);
    fP.onchange = () => { loc.hidden = fP.value !== 'alugado'; };
    const corpo = h('div', null, h('div', { class: 'eq-form' }, campo('Nome', fN, true), campo('Código', fC), campo('Tipo', fT), campo('Modelo', fM), campo('Série / placa', fS), campo('Próprio ou alugado', fP)), loc);
    janela('Novo recurso', corpo, 'Cadastrar', async () => {
      if (!fN.value.trim()) throw new Error('Informe o nome');
      const o = { nome: fN.value.trim(), codigo: fC.value.trim() || null, tipo: fT.value, modelo: fM.value.trim() || null, numero_serie: fS.value.trim() || null, propriedade: fP.value };
      if (fP.value === 'alugado') o.locacao = lerLoc();
      const r = await api('recursos', 'POST', o);
      avisar('Recurso cadastrado', 'success'); M.d = null; abrirFicha(r.id, celular() ? 'controles' : 'geral');
    });
    fN.focus();
  }
  function lancarControle(base) {
    const F = M.f;
    const fT = h('select', { 'aria-label': 'Tipo' }, Object.entries(CTRL).map(([v, t]) => h('option', { value: v, selected: base ? base.tipo === v : F.tipo === 'ferramenta' ? v === 'calibracao' : v === 'manutencao' }, t)));
    const itens = [...new Set(F.controles.map(c => c.item))];
    const fI = h('input', { type: 'text', list: 'rc-itens', maxlength: '160', value: base ? base.item : '', placeholder: 'Ex.: Calibração (RBC), Inspeção anual, Revisão 10.000 km', 'aria-label': 'Item' });
    const dl = h('datalist', { id: 'rc-itens' }, itens.map(i => h('option', { value: i })));
    const fF = h('input', { type: 'date', max: F.hoje, 'aria-label': 'Feito em' });
    const fV = h('select', { 'aria-label': 'Validade' }, [['12', '1 ano'], ['6', '6 meses'], ['3', '3 meses'], ['24', '2 anos'], ['data', 'Data escrita no certificado'], ['', 'Sem vencimento']].map(([v, t]) => h('option', { value: v }, t)));
    if (base && base.vence_em && base.feito_em) { const m = Math.round(dias(base.feito_em, base.vence_em) / 30.4); if ([3, 6, 12, 24].includes(m)) fV.value = String(m); }
    const fD = h('input', { type: 'date', 'aria-label': 'Vence em' }); const rotD = campo('Vence em', fD); rotD.hidden = true;
    fV.onchange = () => { rotD.hidden = fV.value !== 'data'; };
    const fIn = h('input', { type: 'text', maxlength: '160', placeholder: 'Laboratório ou oficina (opcional)', 'aria-label': 'Instituição' });
    const fA = h('input', { type: 'file', accept: 'application/pdf,image/*', 'aria-label': 'Certificado' }); if (celular()) fA.setAttribute('capture', 'environment');
    const corpo = h('div', { class: 'eq-form' }, campo('Tipo', fT), campo('Item', h('div', null, fI, dl)), campo('Feito em', fF), campo('Validade', fV), rotD, campo('Instituição', fIn), campo('Certificado ou laudo (PDF ou foto)', fA, true));
    janela(`${base ? 'Renovar' : 'Lançar'} · ${F.nome}`, corpo, 'Salvar', async () => {
      if (!fF.value) throw new Error('Informe quando foi feito');
      const o = { tipo: fT.value, item: fI.value.trim() || null, feito_em: fF.value, instituicao: fIn.value.trim() || null };
      if (fV.value === 'data') { if (!fD.value) throw new Error('Informe a data de vencimento'); o.vence_em = fD.value; } else if (fV.value) o.validade_meses = +fV.value;
      if (fA.files[0]) o.arquivo = { dados: await lerArquivo(fA.files[0]), nome: fA.files[0].name };
      const r = await api(`recursos/${F.id}/controles`, 'POST', o);
      avisar(r.vence_em ? `Lançado · vence em ${dBRano(r.vence_em)}` : 'Lançado', 'success'); recarregarFicha();
    });
    (base ? fF : fI).focus();
  }
  function novaParada() {
    const F = M.f;
    const fI = h('input', { type: 'date', value: F.hoje, 'aria-label': 'Início' }), fF = h('input', { type: 'date', 'aria-label': 'Fim' });
    const fM = h('input', { type: 'text', maxlength: '200', placeholder: 'Ex.: Troca do regulador de tensão', 'aria-label': 'Motivo' });
    janela(`Fora de uso · ${F.nome}`, h('div', { class: 'eq-form' }, campo('De', fI), campo('Até', fF), campo('Motivo', fM, true)), 'Registrar', async () => {
      if (!fI.value || !fF.value) throw new Error('Informe o período');
      const r = await api(`recursos/${F.id}/paradas`, 'POST', { inicio: fI.value, fim: fF.value, motivo: fM.value.trim() || null });
      avisar(r.reservas_afetadas.length ? `Parada registrada. Atenção: reservado nesses dias em ${r.reservas_afetadas.join('; ')}` : 'Parada registrada', r.reservas_afetadas.length ? 'warning' : 'success'); recarregarFicha();
    });
  }
  async function novaLocacao() {
    let forn = []; try { forn = (await api('fornecedores')).fornecedores; } catch (_) {}
    const [els, ler] = camposLocacao(forn);
    janela(`Locação · ${M.f.nome}`, h('div', { class: 'eq-form' }, els), 'Salvar', async () => {
      await api(`recursos/${M.f.id}/locacoes`, 'POST', ler()); avisar('Locação registrada', 'success'); recarregarFicha();
    });
  }
  function estender(l) {
    const fD = h('input', { type: 'date', value: l.devolucao_prevista, min: l.retirada, 'aria-label': 'Nova devolução' });
    const depois = M.f.reservas.filter(r => r.depois_devolucao); if (depois.length) fD.value = depois.reduce((a, r) => r.fim > a ? r.fim : a, l.devolucao_prevista);
    janela('Estender locação', h('div', { class: 'eq-form' }, campo('Nova data de devolução', fD), depois.length ? h('small', { class: 'eq-nota larga' }, 'Já sugerimos o fim da última reserva.') : null), 'Estender', async () => {
      await api('locacoes/' + l.id, 'PATCH', { devolucao_prevista: fD.value }); avisar('Locação estendida até ' + dBRano(fD.value), 'success'); recarregarFicha();
    });
  }
  function devolver(l) {
    const fD = h('input', { type: 'date', value: M.f.hoje, max: M.f.hoje, min: l.retirada, 'aria-label': 'Devolvido em' });
    const abertas = M.f.reservas.filter(r => r.situacao !== 'concluida' && r.fim >= M.f.hoje);
    janela('Registrar devolução', h('div', { class: 'eq-form' }, campo('Devolvido em', fD),
      abertas.length ? h('small', { class: 'eq-nota larga' }, `Ainda há ${abertas.length} reserva${abertas.length > 1 ? 's' : ''} com este recurso (${abertas.map(r => r.descricao).join(', ')}). Troque o recurso nessas atividades.`) : null), 'Registrar devolução', async () => {
      await api('locacoes/' + l.id, 'PATCH', { devolvido_em: fD.value }); avisar('Devolução registrada', 'success'); recarregarFicha();
    });
  }
  function excluir() {
    const F = M.f;
    janela('Excluir recurso', h('p', { class: 'rc-txt' }, `Excluir "${F.nome}"? Ele sai das atividades em que estava reservado. Se só parou de usar, desmarque "Ativo" em vez de excluir.`), 'Excluir', async () => {
      await api('recursos/' + F.id, 'DELETE'); avisar('Recurso excluído', 'success'); M.ficha = null; M.f = null; carregar();
    });
  }
  async function abrirFornecedores() {
    let L; try { L = (await api('fornecedores')).fornecedores; } catch (e) { avisar(e.message, 'error'); return; }
    const lista = h('div', { class: 'rc-forn' });
    const desenharF = () => {
      lista.innerHTML = '';
      if (!L.length) lista.append(h('p', { class: 'eq-vazio' }, 'Nenhum fornecedor ainda. Ele também é criado ao registrar uma locação.'));
      L.forEach(x => {
        const ins = ['nome', 'contato', 'telefone', 'email'].map(k => h('input', { value: x[k] || '', 'data-k': k, placeholder: { nome: 'Nome', contato: 'Contato', telefone: 'Telefone', email: 'E-mail' }[k], 'aria-label': k }));
        lista.append(h('div', { class: 'rc-forn-lin' }, ins, h('small', null, x.em_aberto ? `${x.em_aberto} em aberto` : ''),
          h('button', { class: 'eq-bt', onclick: async () => { const o = {}; ins.forEach(i => o[i.dataset.k] = i.value.trim() || null); try { await api('fornecedores/' + x.id, 'PATCH', o); Object.assign(x, o); avisar('Fornecedor salvo', 'success'); } catch (e) { avisar(e.message, 'error'); } } }, 'Salvar'),
          h('button', { class: 'eq-x', 'aria-label': 'Excluir fornecedor', onclick: async () => { try { await api('fornecedores/' + x.id, 'DELETE'); L = L.filter(y => y !== x); desenharF(); } catch (e) { avisar(e.message, 'error'); } } }, ic('fa-trash'))));
      });
    };
    const fN = h('input', { placeholder: 'Nome do fornecedor', 'aria-label': 'Novo fornecedor' }), fT = h('input', { placeholder: 'Telefone', 'aria-label': 'Telefone' });
    const add = h('div', { class: 'rc-forn-novo' }, fN, fT, h('button', { class: 'eq-bt pri', onclick: async () => {
      if (!fN.value.trim()) { avisar('Informe o nome', 'error'); return; }
      try { const r = await api('fornecedores', 'POST', { nome: fN.value.trim(), telefone: fT.value.trim() || null }); L.push({ id: r.id, nome: fN.value.trim(), telefone: fT.value.trim(), em_aberto: 0 }); fN.value = fT.value = ''; desenharF(); } catch (e) { avisar(e.message, 'error'); }
    } }, ic('fa-plus'), ' Adicionar'));
    desenharF();
    janela('Fornecedores de locação', h('div', null, add, lista), null, null, 'grande-m');
  }

  /* ── ligação com o menu ─────────────────────── */
  window.renderRecursos = () => { if (M.d) desenhar(); };     // substitui a tela antiga "Conflito de Recursos" (a carga é feita ao abrir o menu)
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome === 'recursos') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Recursos'; M.ficha = null; M.f = null; desenhar(); carregar(); }
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); if (w && M.aba === 'geral') M.aba = 'reservas'; desenhar(); } }; })());
  window.tfRecursos = { abrir: () => window.switchView('recursos', document.getElementById('nav-recursos')), abrirFicha: id => { window.switchView('recursos', document.getElementById('nav-recursos')); abrirFicha(id); }, estado: M };
})();
