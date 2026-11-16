/* Aprumo · obras.js — tela Obras (cartões, lista, filtros e formulário), ligada a /api/obras/resumo */
(() => {
  'use strict';
  const PODE_TUDO = ['administrador', 'gestor'];
  const TIPOS = ['Elétrica', 'NR-12', 'Montagem', 'SPDA', 'Automação', 'Manutenção', 'Outro'];
  const CORES = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];
  const SIT_TXT = { 'Planejamento': 'Planejamento', 'Em andamento': 'Em andamento', 'Pausado': 'Pausada', 'Concluído': 'Concluída', 'Arquivado': 'Arquivada' };
  const SIT_CLS = { 'Planejamento': 'plan', 'Em andamento': 'and', 'Pausado': 'pau', 'Concluído': 'con', 'Arquivado': 'arq' };
  const ATIVAS = ['Planejamento', 'Em andamento', 'Pausado'];
  const S = { obras: [], hoje: null, carregando: false, erro: null,
    f: { sit: 'ativas', gestor: '', cliente: '', farol: '', ordem: 'atraso', busca: '', chip: 'ativas' }, filtrosAbertos: false,
    vista: (() => { try { return localStorage.getItem('tf_obras_vista') || 'cartoes'; } catch (_) { return 'cartoes'; } })() };

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
  const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const eu = () => (window.tfServidor && tfServidor.estado.usuario) || {};
  const podeTudo = () => PODE_TUDO.includes(eu().perfil);
  const dias = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const dataCurta = (s, ano) => !s ? '' : (s.slice(0, 4) === ano ? s.slice(8, 10) + '/' + s.slice(5, 7) : dataBR(s));
  function dinheiro(v, curto) {
    if (v == null || v === '') return '—';
    v = Number(v);
    if (curto && v >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
    if (curto && v >= 1e3) return 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function lerDinheiro(t) {
    t = String(t || '').replace(/[^\d,.-]/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t); return isFinite(n) ? n : NaN;
  }
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));

  /* ── cálculos da tela ───────────────────────── */
  function farol(o) {
    const pts = o.desvio != null ? Math.max(0, Math.round(o.desvio)) : 0;
    if (o.farol === 'vermelho') return { cls: 'verm', txt: pts > 15 ? `Atrasada · ${pts} pts` : 'Atrasada · prazo vencido', curto: 'Atrasada' };
    if (o.farol === 'amarelo') return { cls: 'amar', txt: `Atenção · ${pts} pts`, curto: 'Atenção' };
    if (o.farol === 'verde') return { cls: 'verd', txt: 'No prazo', curto: 'No prazo' };
    const t = { 'Planejamento': 'Ainda não começou', 'Pausado': 'Pausada', 'Concluído': 'Concluída', 'Arquivado': 'Arquivada' }[o.situacao] || 'Sem farol';
    return { cls: 'cinz', txt: t, curto: SIT_TXT[o.situacao] || t };
  }
  function prazo(o) {
    const hj = S.hoje;
    if (o.situacao === 'Concluído') return { txt: 'concluída', cls: '' };
    if (o.situacao === 'Arquivado') return { txt: 'arquivada', cls: '' };
    if (o.situacao === 'Pausado') return { txt: 'pausada', cls: '' };
    if (o.situacao === 'Planejamento' && o.inicio && o.inicio > hj) { const d = dias(hj, o.inicio); return { txt: d === 1 ? 'começa amanhã' : `começa em ${d} dias`, cls: 'roxo' }; }
    if (!o.fim) return { txt: 'sem prazo final', cls: '' };
    const d = dias(hj, o.fim);
    if (d < 0) return { txt: `${-d} dia${d === -1 ? '' : 's'} atrasada`, cls: 'verm' };
    if (d === 0) return { txt: 'termina hoje', cls: 'amar' };
    return { txt: `faltam ${d} dia${d === 1 ? '' : 's'}`, cls: o.farol === 'vermelho' ? 'verm' : '' };
  }
  function nr(o) {
    if (!o.nr_com_documentos) return { txt: '—', cls: '', titulo: 'Ninguém da obra tem documentos de NR cadastrados ainda' };
    if (o.nr_vencidos) return { txt: `${o.nr_vencidos} vencida${o.nr_vencidos > 1 ? 's' : ''}`, cls: 'verm', titulo: 'Pessoas com documento de NR vencido' };
    if (o.nr_vencendo) return { txt: `${o.nr_vencendo} vencendo`, cls: 'amar', titulo: 'Pessoas com documento vencendo em 30 dias' };
    return { txt: 'em dia', cls: 'verd', titulo: 'Documentos de NR em dia' };
  }
  const ordemFarol = o => ({ vermelho: 0, amarelo: 1, verde: 2 })[o.farol] ?? (o.situacao === 'Planejamento' ? 3 : 4);
  function filtradas() {
    const f = S.f, b = sem(f.busca.trim()), me = eu().id;
    let l = S.obras.filter(o => {
      if (f.sit === 'ativas' && !ATIVAS.includes(o.situacao)) return false;
      if (f.sit === 'concluidas' && o.situacao !== 'Concluído') return false;
      if (f.sit === 'arquivadas' && o.situacao !== 'Arquivado') return false;
      if (f.gestor && o.gestor !== f.gestor) return false;
      if (f.cliente && o.cliente !== f.cliente) return false;
      if (f.farol && o.farol !== f.farol) return false;
      if (f.chip === 'atrasadas' && o.farol !== 'vermelho') return false;
      if (f.chip === 'minhas' && +o.gestor_id !== +me) return false;
      return !b || sem([o.nome, o.codigo, o.cliente, o.numero_contrato, o.local_obra].join(' ')).includes(b);
    });
    const porNome = (a, c) => String(a.nome).localeCompare(String(c.nome), 'pt-BR');
    if (f.ordem === 'atraso') l.sort((a, c) => ordemFarol(a) - ordemFarol(c) || (c.desvio ?? -99) - (a.desvio ?? -99) || porNome(a, c));
    else if (f.ordem === 'prazo') l.sort((a, c) => (a.fim || '9999') < (c.fim || '9999') ? -1 : (a.fim || '9999') > (c.fim || '9999') ? 1 : porNome(a, c));
    else l.sort(porNome);
    return l;
  }

  /* ── desenho ────────────────────────────────── */
  function raiz() { return document.getElementById('view-obras'); }
  async function carregar() {
    S.carregando = true; S.erro = null;
    try { const r = await api('obras/resumo'); S.obras = r.obras || []; S.hoje = r.hoje; }
    catch (e) { S.erro = e.message; }
    S.carregando = false; desenhar();
  }
  function desenhar() {
    const R = raiz(); if (!R) return;
    R.innerHTML = '';
    const ob = h('div', { class: 'ob' + (S.filtrosAbertos ? ' filtros-abertos' : '') });
    R.append(ob);
    const ativas = S.obras.filter(o => ATIVAS.includes(o.situacao));
    ob.append(h('div', { class: 'ob-cab' },
      h('div', null, h('h1', { class: 'ob-titulo' }, 'Obras'),
        h('p', { class: 'ob-sub' }, S.carregando && !S.obras.length ? 'Carregando…' : `${ativas.length} obra${ativas.length === 1 ? '' : 's'} ativa${ativas.length === 1 ? '' : 's'} · atualizado agora`)),
      podeTudo() ? h('button', { class: 'ob-bt ob-bt-pri', onclick: () => abrirFormulario(null) }, ic('fa-plus'), h('span', { class: 'ob-so-pc' }, 'Nova obra'), h('span', { class: 'ob-so-cel' }, 'Nova')) : null));
    if (S.erro) { ob.append(h('div', { class: 'ob-vazio' }, ic('fa-triangle-exclamation'), h('p', null, S.erro), h('button', { class: 'ob-bt', onclick: carregar }, 'Tentar de novo'))); return; }
    ob.append(kpis(ativas), barra());
    const l = filtradas();
    if (!l.length) {
      ob.append(h('div', { class: 'ob-vazio' }, ic('fa-building'),
        h('p', null, S.obras.length ? 'Nenhuma obra com esses filtros.' : podeTudo() ? 'Nenhuma obra cadastrada ainda.' : 'Você ainda não foi colocado em nenhuma obra. Fale com o gestor.'),
        !S.obras.length && podeTudo() ? h('button', { class: 'ob-bt ob-bt-pri', onclick: () => abrirFormulario(null) }, ic('fa-plus'), 'Cadastrar a primeira obra') : null));
      return;
    }
    ob.append(S.vista === 'lista' && window.innerWidth > 760 ? tabela(l) : h('div', { class: 'ob-grade' }, l.map(cartao)));
  }
  function kpis(ativas) {
    const and = ativas.filter(o => o.situacao === 'Em andamento');
    const plan = ativas.filter(o => o.situacao === 'Planejamento').length, pau = ativas.filter(o => o.situacao === 'Pausado').length;
    const verm = and.filter(o => o.farol === 'vermelho').length, amar = and.filter(o => o.farol === 'amarelo').length;
    const fim30 = and.filter(o => o.fim && dias(S.hoje, o.fim) >= 0 && dias(S.hoje, o.fim) <= 30).sort((a, c) => a.fim < c.fim ? -1 : 1);
    const carteira = ativas.reduce((t, o) => t + (Number(o.valor_contrato) || 0), 0);
    const k = (rot, val, sub, cls) => h('div', { class: 'ob-kpi' }, h('div', { class: 'ob-kpi-rot' }, rot), h('div', { class: 'ob-kpi-val ' + (cls || '') }, val), h('div', { class: 'ob-kpi-sub' }, sub));
    const subAnd = [plan ? `+${plan} em planejamento` : '', pau ? `${pau} pausada${pau > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') || '—';
    return h('div', { class: 'ob-kpis' + (podeTudo() ? '' : ' tres') },
      k('Em andamento', and.length, subAnd),
      k('Atrasadas', verm, amar ? `+${amar} em atenção` : 'nenhuma em atenção', verm ? 'verm' : ''),
      k('Terminam em 30 dias', fim30.length, fim30.length ? fim30.slice(0, 2).map(o => `${o.codigo || o.nome} · ${dataCurta(o.fim, S.hoje.slice(0, 4))}`).join(' · ') : '—'),
      podeTudo() ? k('Valor em carteira', dinheiro(carteira, true), 'Medido: — (entra com o RDO)') : null);
  }
  function barra() {
    const f = S.f, sel = (rot, chave, ops) => h('select', { class: 'ob-sel', 'aria-label': rot, onchange: e => { f[chave] = e.target.value; if (chave === 'sit') f.chip = e.target.value === 'ativas' ? 'ativas' : ''; desenhar(); } },
      ops.map(([v, t]) => h('option', { value: v, selected: f[chave] === v }, t)));
    const gestores = [...new Set(S.obras.map(o => o.gestor).filter(Boolean))].sort(), clientes = [...new Set(S.obras.map(o => o.cliente).filter(Boolean))].sort();
    const busca = h('input', { type: 'search', 'aria-label': 'Buscar obra', placeholder: 'Buscar por nome, código ou cliente', value: f.busca });
    busca.oninput = () => { f.busca = busca.value; const pos = busca.selectionStart; desenhar(); const n = raiz().querySelector('.ob-busca input'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} };
    const chip = (v, t) => h('button', { class: 'ob-chip' + (f.chip === v ? ' on' : ''), 'aria-pressed': f.chip === v ? 'true' : 'false', onclick: () => {
      f.chip = f.chip === v && v !== 'ativas' ? 'ativas' : v; f.sit = 'ativas'; desenhar(); } }, t);
    const vbt = (v, icone, rot) => h('button', { class: 'ob-vbt' + (S.vista === v ? ' on' : ''), 'aria-label': rot, 'aria-pressed': S.vista === v ? 'true' : 'false', title: rot,
      onclick: () => { S.vista = v; try { localStorage.setItem('tf_obras_vista', v); } catch (_) {} desenhar(); } }, ic(icone));
    return h('div', { class: 'ob-barra' },
      h('label', { class: 'ob-busca' }, ic('fa-magnifying-glass'), busca),
      h('div', { class: 'ob-chips' }, chip('ativas', 'Ativas'), chip('atrasadas', 'Atrasadas'), chip('minhas', 'Minhas'),
        h('button', { class: 'ob-chip' + (S.filtrosAbertos ? ' on' : ''), 'aria-expanded': S.filtrosAbertos ? 'true' : 'false', onclick: () => { S.filtrosAbertos = !S.filtrosAbertos; desenhar(); } }, ic('fa-sliders'), 'Filtros')),
      h('div', { class: 'ob-filtros' },
        sel('Situação', 'sit', [['ativas', 'Ativas'], ['concluidas', 'Concluídas'], ['arquivadas', 'Arquivadas'], ['todas', 'Todas']]),
        sel('Gestor', 'gestor', [['', 'Todos os gestores'], ...gestores.map(g => [g, g])]),
        sel('Cliente', 'cliente', [['', 'Todos os clientes'], ...clientes.map(c => [c, c])]),
        sel('Farol', 'farol', [['', 'Todo farol'], ['verde', 'No prazo'], ['amarelo', 'Atenção'], ['vermelho', 'Atrasada']]),
        sel('Ordenar', 'ordem', [['atraso', 'Mais atrasada primeiro'], ['prazo', 'Prazo mais próximo'], ['nome', 'Nome']])),
      h('div', { class: 'ob-vista', role: 'group', 'aria-label': 'Forma de ver' }, vbt('cartoes', 'fa-grip', 'Cartões'), vbt('lista', 'fa-list', 'Lista')));
  }
  function barras(o, fa) {
    const linha = (rot, v, cls) => h('div', { class: 'ob-bar ' + cls }, h('span', null, rot),
      h('div', { class: 'ob-bar-trilho' }, h('div', { class: 'ob-bar-ench', style: `width:${Math.min(100, Math.max(0, v || 0))}%` })), h('b', null, v == null ? '—' : Math.round(v) + '%'));
    return h('div', { class: 'ob-barras ' + fa.cls }, linha('Real', o.avanco_real, 'real'), linha('Previsto', o.avanco_previsto, 'prev'));
  }
  function cartao(o) {
    const fa = farol(o), pz = prazo(o), n = nr(o), ano = S.hoje.slice(0, 4);
    const periodo = o.inicio || o.fim ? `${dataCurta(o.inicio, ano) || '?'} → ${dataBR(o.fim) || '?'}` : 'Sem datas';
    const ini = String(o.gestor || '').trim().split(/\s+/); const sig = ((ini[0] || '')[0] || '') + (ini.length > 1 ? ini[ini.length - 1][0] : '');
    return h('article', { class: 'ob-card', 'data-id': o.id },
      h('div', { class: 'ob-card-topo' },
        h('span', { class: 'ob-cor', style: `background:${o.cor || '#94a3b8'}` }),
        h('span', { class: 'ob-cod' }, o.codigo || 'sem código'),
        o.tipo_servico ? h('span', { class: 'ob-tipo' }, o.tipo_servico) : null,
        h('span', { class: 'ob-chip-farol ob-so-cel ' + fa.cls }, h('i', { class: 'ob-ponto' }), fa.curto),
        h('span', { style: 'flex:1' }),
        podeTudo() ? botaoMenu(o) : null),
      h('div', null, h('h2', { class: 'ob-nome' }, o.nome), h('div', { class: 'ob-cli' }, [o.cliente, o.local_obra].filter(Boolean).join(' · ') || 'Cliente não informado')),
      h('div', { class: 'ob-etqs ob-so-pc' },
        h('span', { class: 'ob-sit ' + SIT_CLS[o.situacao] }, SIT_TXT[o.situacao]),
        fa.txt !== SIT_TXT[o.situacao] ? h('span', { class: 'ob-chip-farol ' + fa.cls }, h('i', { class: 'ob-ponto' }), fa.txt) : null),
      barras(o, fa),
      h('div', { class: 'ob-prazo ob-so-pc' }, ic('fa-regular fa-calendar'), h('span', null, periodo), h('span', { class: 'ob-pt' }, '·'), h('b', { class: pz.cls }, pz.txt)),
      h('div', { class: 'ob-mini ob-so-pc' },
        h('div', null, h('small', null, 'Atrasadas'), h('b', { class: o.atrasadas ? (o.farol === 'vermelho' ? 'verm' : 'amar') : 'verd' }, o.atrasadas)),
        h('div', null, h('small', null, 'Pessoas'), h('b', null, o.pessoas)),
        h('div', { title: n.titulo }, h('small', null, 'NR'), h('b', { class: n.cls }, n.txt))),
      h('div', { class: 'ob-linha-cel ob-so-cel' }, h('b', { class: pz.cls }, pz.txt),
        h('span', null, 'Atrasadas ', h('b', { class: o.atrasadas ? 'verm' : '' }, o.atrasadas)), h('span', null, 'Pessoas ', h('b', null, o.pessoas)),
        h('span', { title: n.titulo }, 'NR ', h('b', { class: n.cls }, n.txt))),
      h('div', { class: 'ob-rodape' },
        h('div', { class: 'ob-gestor ob-so-pc' }, h('span', { class: 'ob-av' }, sig.toUpperCase() || '?'),
          h('div', null, h('b', null, o.gestor || 'Sem gestor'), h('small', null, podeTudo() ? `Contrato ${dinheiro(o.valor_contrato, true)} · Medido —` : (o.rt_nome ? `RT ${o.rt_nome}` : '')))),
        h('button', { class: 'ob-abrir', onclick: () => abrirObra(o) }, 'Abrir obra', ic('fa-chevron-right'))));
  }
  function tabela(l) {
    const cab = ['Obra', 'Cliente', 'Gestor', 'Situação', 'Farol', 'Real / previsto', 'Prazo', 'Atrasadas', podeTudo() ? 'Contrato' : null, ''].filter(x => x !== null);
    return h('div', { class: 'ob-tab-caixa' }, h('table', { class: 'ob-tab' },
      h('thead', null, h('tr', null, cab.map(c => h('th', null, c)))),
      h('tbody', null, l.map(o => {
        const fa = farol(o), pz = prazo(o);
        return h('tr', null,
          h('td', null, h('div', { class: 'ob-tab-obra' }, h('span', { class: 'ob-cor', style: `background:${o.cor || '#94a3b8'}` }), h('div', null, h('small', null, o.codigo || ''), h('b', null, o.nome)))),
          h('td', null, o.cliente || '—'), h('td', null, o.gestor || '—'),
          h('td', null, h('span', { class: 'ob-sit ' + SIT_CLS[o.situacao] }, SIT_TXT[o.situacao])),
          h('td', null, h('span', { class: 'ob-chip-farol ' + fa.cls }, h('i', { class: 'ob-ponto' }), fa.curto)),
          h('td', { class: 'ob-num' }, `${Math.round(o.avanco_real)}% / ${o.avanco_previsto == null ? '—' : Math.round(o.avanco_previsto) + '%'}`),
          h('td', null, h('b', { class: pz.cls }, pz.txt)),
          h('td', { class: 'ob-num' }, o.atrasadas),
          podeTudo() ? h('td', { class: 'ob-num' }, dinheiro(o.valor_contrato, true)) : null,
          h('td', { class: 'ob-num' }, h('button', { class: 'ob-abrir peq', onclick: () => abrirObra(o) }, 'Abrir', ic('fa-chevron-right')), podeTudo() ? botaoMenu(o) : null));
      }))));
  }

  /* ── menu de ações do cartão ────────────────── */
  function botaoMenu(o) {
    const bt = h('button', { class: 'ob-menu-bt', 'aria-label': 'Mais ações', 'aria-haspopup': 'menu', title: 'Mais ações' }, ic('fa-ellipsis'));
    bt.onclick = ev => { ev.stopPropagation(); abrirMenu(bt, o); };
    return bt;
  }
  function fecharMenu() { document.querySelectorAll('.ob-menu').forEach(m => m.remove()); }
  function abrirMenu(bt, o) {
    fecharMenu();
    const item = (icone, txt, fn, perigo) => h('button', { role: 'menuitem', class: perigo ? 'perigo' : '', onclick: () => { fecharMenu(); fn(); } }, ic(icone), txt);
    const m = h('div', { class: 'ob-menu', role: 'menu' },
      item('fa-pen', 'Editar', () => abrirFormulario(o)),
      o.situacao === 'Pausado' ? item('fa-play', 'Retomar', () => mudar(o, 'Em andamento', 'retomada'))
        : ['Em andamento', 'Planejamento'].includes(o.situacao) ? item('fa-pause', 'Pausar', () => mudar(o, 'Pausado', 'pausada')) : null,
      !['Concluído', 'Arquivado'].includes(o.situacao) ? item('fa-flag-checkered', 'Concluir', () => mudar(o, 'Concluído', 'concluída')) : null,
      o.situacao === 'Arquivado' ? item('fa-box-open', 'Desarquivar', () => mudar(o, 'Concluído', 'desarquivada'))
        : item('fa-box-archive', 'Arquivar', () => mudar(o, 'Arquivado', 'arquivada'), true));
    document.body.append(m);
    const r = bt.getBoundingClientRect(), w = 190;
    m.style.top = (r.bottom + window.scrollY + 4) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    setTimeout(() => document.addEventListener('click', fecharMenu, { once: true }), 0);
  }
  async function mudar(o, situacao, palavra) {
    try { await api('projetos/' + o.id, 'PATCH', { situacao }); avisar(`Obra ${o.codigo || o.nome} ${palavra}.`, 'success'); await atualizarTudo(); }
    catch (e) { avisar(e.message, 'error'); }
  }
  async function atualizarTudo() {
    try { if (window.tfServidor && tfServidor.recarregar) await tfServidor.recarregar(); } catch (_) {}
    await carregar();
    if (document.getElementById('view-obra')?.classList.contains('active') && window.tfObra) tfObra.recarregar();
  }
  function abrirObra(o) {
    if (window.tfObra) return tfObra.abrir(o.id);
    const nav = document.querySelector('.nav-item[onclick*="\'gantt\'"]');
    window.switchView('gantt', nav);
    const sel = document.getElementById('gantt-f-project');
    if (sel) {
      if (![...sel.options].some(op => op.value === o.nome)) sel.append(h('option', { value: o.nome }, o.nome));
      sel.value = o.nome; if (typeof renderGantt === 'function') renderGantt();
    }
  }

  /* ── formulário Nova obra / Editar ──────────── */
  async function abrirFormulario(o) {
    let usuarios = [], equipe = [];
    try { [usuarios, equipe] = await Promise.all([api('usuarios').then(r => r.usuarios), api('funcionarios').then(r => r.funcionarios)]); }
    catch (e) { avisar(e.message, 'error'); return; }
    const gestores = usuarios.filter(x => PODE_TUDO.includes(x.perfil));
    const ed = !!o, v = o || { situacao: 'Planejamento', gestor_id: eu().id, cor: CORES[0] };
    let cor = v.cor || CORES[0];
    const campo = (rot, el, obrig, cls) => h('label', { class: 'ob-campo ' + (cls || '') }, h('span', null, rot, obrig ? ' *' : ''), el);
    const inp = (nome, val, extra) => h('input', Object.assign({ name: nome, value: val ?? '' }, extra || {}));
    const sel = (nome, ops, val) => h('select', { name: nome }, ops.map(([a, b]) => h('option', { value: a, selected: String(a) === String(val ?? '') }, b)));
    const coresEl = h('div', { class: 'ob-cores', role: 'radiogroup', 'aria-label': 'Cor da obra' }, CORES.map(c => h('button', { type: 'button', role: 'radio', 'aria-checked': c === cor ? 'true' : 'false', 'aria-label': 'Cor ' + c,
      class: 'ob-corbt' + (c === cor ? ' on' : ''), style: `background:${c}`, onclick: ev => { cor = c; coresEl.querySelectorAll('.ob-corbt').forEach(b => { const on = b === ev.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); } })));
    const erro = h('div', { class: 'ob-form-erro', role: 'alert', hidden: true });
    const form = h('form', { class: 'ob-form', novalidate: true },
      h('div', { class: 'ob-form-cab' }, h('div', null, h('h2', { id: 'ob-form-t' }, ed ? 'Editar obra' : 'Nova obra'), h('p', null, 'Campos com * são obrigatórios. O resto pode ser preenchido depois.')),
        h('button', { type: 'button', class: 'ob-x', 'aria-label': 'Fechar', onclick: () => fechar() }, ic('fa-xmark'))),
      h('div', { class: 'ob-form-corpo' },
        h('section', null, h('h3', null, 'Identificação'),
          h('div', { class: 'ob-g3a' }, campo('Código', inp('codigo', v.codigo, { maxlength: 30, required: true }), true), campo('Nome da obra', inp('nome', v.nome, { maxlength: 160, required: true }), true),
            campo('Tipo de serviço', sel('tipo_servico', [['', 'Escolha…'], ...TIPOS.map(t => [t, t])], v.tipo_servico))),
          h('div', { class: 'ob-corlinha' }, h('span', null, 'Cor da obra'), coresEl)),
        h('section', null, h('h3', null, 'Cliente e contrato'),
          h('div', { class: 'ob-g3b' }, campo('Cliente', inp('cliente', v.cliente, { maxlength: 160, required: true }), true),
            campo('Nº do contrato ou pedido', inp('numero_contrato', v.numero_contrato, { maxlength: 60, placeholder: 'Ex.: PC 4500123456' })),
            campo('Valor do contrato', inp('valor_contrato', v.valor_contrato != null ? Number(v.valor_contrato).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '', { inputmode: 'decimal', placeholder: 'R$ 0,00' })))),
        h('section', null, h('h3', null, 'Local e responsáveis'),
          campo('Local da obra', inp('local_obra', v.local_obra, { maxlength: 200, placeholder: 'Endereço, cidade e UF' })),
          h('div', { class: 'ob-g3' }, campo('Gestor da obra', sel('gestor_id', [['', 'Escolha…'], ...gestores.map(x => [x.id, x.nome])], v.gestor_id), true),
            campo('Responsável técnico', sel('rt_funcionario_id', [['', 'Nenhum'], ...equipe.map(x => [x.id, x.cargo ? `${x.nome} · ${x.cargo}` : x.nome])], v.rt_funcionario_id)),
            campo('Nº da ART', inp('art_numero', v.art_numero, { maxlength: 40, placeholder: 'Ex.: PE20260012345' })))),
        h('section', null, h('h3', null, 'Prazo e situação'),
          h('div', { class: 'ob-g3' }, campo('Início', inp('inicio', v.inicio, { type: 'date', required: true }), true), campo('Fim previsto', inp('fim', v.fim, { type: 'date', required: true }), true),
            campo('Situação', sel('situacao', (ed ? ['Planejamento', 'Em andamento', 'Pausado', 'Concluído', 'Arquivado'] : ['Planejamento', 'Em andamento']).map(s => [s, SIT_TXT[s]]), v.situacao))),
          campo('Descrição', h('textarea', { name: 'descricao', rows: 3, maxlength: 5000, placeholder: 'Escopo resumido, observações do contrato…' }, v.descricao || ''))),
        erro),
      h('div', { class: 'ob-form-pe' }, h('span', { class: 'ob-so-pc' }, ed ? 'As mudanças aparecem para toda a equipe.' : 'Depois de criar, você monta o cronograma na própria obra.'),
        h('div', null, h('button', { type: 'button', class: 'ob-bt', onclick: () => fechar() }, 'Cancelar'), h('button', { type: 'submit', class: 'ob-bt ob-bt-pri' }, ed ? 'Salvar' : 'Criar obra'))));
    const fundo = h('div', { class: 'ob-fundo', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ob-form-t' }, form);
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = ev => { if (ev.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc);
    fundo.addEventListener('mousedown', ev => { if (ev.target === fundo) fechar(); });
    form.onsubmit = async ev => {
      ev.preventDefault(); erro.hidden = true;
      const d = Object.fromEntries(new FormData(form).entries());
      for (const k of Object.keys(d)) d[k] = String(d[k]).trim();
      const falta = [['codigo', 'Código'], ['nome', 'Nome da obra'], ['cliente', 'Cliente'], ['gestor_id', 'Gestor da obra'], ['inicio', 'Início'], ['fim', 'Fim previsto']].filter(([k]) => !d[k]).map(([, t]) => t);
      if (falta.length) return mostrarErro('Preencha: ' + falta.join(', ') + '.');
      if (d.fim < d.inicio) return mostrarErro('O fim previsto não pode ser antes do início.');
      const valor = lerDinheiro(d.valor_contrato);
      if (Number.isNaN(valor)) return mostrarErro('Valor do contrato inválido. Use, por exemplo, 480.000,00.');
      const dados = { ...d, valor_contrato: valor, cor, gestor_id: +d.gestor_id, rt_funcionario_id: d.rt_funcionario_id ? +d.rt_funcionario_id : null };
      for (const k of ['tipo_servico', 'numero_contrato', 'local_obra', 'art_numero', 'descricao']) if (dados[k] === '') dados[k] = null;
      let envio = dados;
      if (ed) { envio = {}; for (const [k, val] of Object.entries(dados)) if (String(val ?? '') !== String(o[k] ?? '') && !(k === 'valor_contrato' && Number(val) === Number(o[k]))) envio[k] = val; }
      const bt = form.querySelector('[type=submit]'); bt.disabled = true;
      try {
        if (!ed) await api('projetos', 'POST', envio);
        else if (Object.keys(envio).length) await api('projetos/' + o.id, 'PATCH', envio);
        fechar(); avisar(ed ? 'Obra atualizada.' : `Obra ${dados.codigo} criada.`, 'success'); await atualizarTudo();
      } catch (e) { bt.disabled = false; mostrarErro(e.message); }
    };
    function mostrarErro(t) { erro.textContent = t; erro.hidden = false; erro.scrollIntoView({ block: 'nearest' }); }
    document.body.append(fundo);
    form.querySelector(ed ? '[name=nome]' : '[name=codigo]').focus();
  }

  /* ── ligação com o menu e com as outras telas ─ */
  const trocarOriginal = window.switchView;
  window.switchView = function (nome, el) {
    if (nome === 'projetos' || nome === 'portfolio') { nome = 'obras'; el = document.querySelector('.nav-item[onclick*="\'obras\'"]'); }
    trocarOriginal(nome, el);
    if (nome === 'obras') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Obras'; S.f.busca = ''; desenhar(); carregar(); }
  };
  window.addEventListener('resize', (() => { let w = window.innerWidth; return () => { if ((w > 760) !== (window.innerWidth > 760)) { w = window.innerWidth; if (raiz()?.classList.contains('active')) desenhar(); } }; })());
  window.tfObras = { recarregar: carregar, editar: o => abrirFormulario(o), mudar: (o, sit, palavra) => mudar(o, sit, palavra), avisar,
    novaObra: () => { if (!podeTudo()) { avisar('Só administrador e gestor cadastram obras.', 'error'); return; } abrirFormulario(null); } };
})();
