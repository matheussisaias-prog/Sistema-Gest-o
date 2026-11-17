/* Aprumo · painel-mercurium.js — painel da Mercurium: acessos, empresas clientes e Fale conosco (só donos da plataforma) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const S = { msgs: [], emps: [], plat: null, ac: null, sel: null, aba: 'acessos', notaSuja: false };

  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    let r;
    try { r = await fetch('api/' + rota, op); } catch (_) { const e = new Error('Sem conexão com o servidor. Verifique a internet.'); e.rede = true; throw e; }
    let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Algo deu errado. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }

  /* ── utilidades ─────────────────────────────── */
  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el[k] = v; else el.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
    return el;
  }
  const ic = c => h('i', { class: c, 'aria-hidden': 'true' });
  const data = s => s ? new Date(String(s).replace(' ', 'T') + 'Z') : null;
  const sem = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function quando(s, longo) {
    const d = data(s); if (!d) return '—';
    if (longo) return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const min = Math.round((Date.now() - d) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
    const dias = Math.floor(min / 1440);
    if (dias === 1) return 'ontem';
    if (dias < 30) return `há ${dias} dias`;
    return d.toLocaleDateString('pt-BR');
  }
  let tt;
  function aviso(txt, erro) {
    const t = $('#toast'); t.textContent = txt; t.className = 'toast' + (erro ? ' erro' : ''); t.hidden = false;
    clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 3800);
  }
  function confirmar(titulo, texto, botao, perigo) {
    return new Promise(res => {
      const fechar = v => { f.remove(); res(v); };
      const f = h('div', { class: 'fundo', onclick: ev => { if (ev.target === f) fechar(false); } },
        h('div', { class: 'janela', role: 'dialog', 'aria-modal': 'true' }, h('h3', null, titulo), h('p', null, texto),
          h('div', { class: 'bts' },
            h('button', { class: 'bt', onclick: () => fechar(false) }, 'Cancelar'),
            h('button', { class: 'bt ' + (perigo ? 'bt-perigo' : 'bt-pri'), onclick: () => fechar(true) }, botao))));
      document.body.append(f); f.querySelector('.bt:last-child').focus();
    });
  }
  /** Confirmação para o que não tem volta: só libera o botão depois de digitar a palavra pedida */
  function confirmarDigitando(titulo, texto, palavra, botao) {
    return new Promise(res => {
      const fechar = v => { f.remove(); res(v); };
      const campo = h('input', { class: 'digite', type: 'text', autocomplete: 'off', 'aria-label': 'Digite ' + palavra });
      const bt = h('button', { class: 'bt bt-perigo', disabled: true, onclick: () => fechar(true) }, botao);
      campo.oninput = () => { bt.disabled = sem(campo.value.trim()) !== sem(palavra); };
      campo.onkeydown = ev => { if (ev.key === 'Enter' && !bt.disabled) fechar(true); };
      const f = h('div', { class: 'fundo', onclick: ev => { if (ev.target === f) fechar(false); } },
        h('div', { class: 'janela', role: 'dialog', 'aria-modal': 'true' }, h('h3', null, titulo), h('p', null, texto),
          h('label', { class: 'digite-rot' }, 'Para confirmar, digite ', h('b', null, palavra)), campo,
          h('div', { class: 'bts' }, h('button', { class: 'bt', onclick: () => fechar(false) }, 'Cancelar'), bt)));
      document.body.append(f); campo.focus();
    });
  }
  const SIT = { ativo: ['Ativa', 'ok'], teste: ['Em teste', 'teste'], suspenso: ['Suspensa', 'pend'] };
  const PERFIS = { administrador: 'Administrador', gestor: 'Gestor', encarregado: 'Encarregado', funcionario: 'Funcionário' };
  const num = n => Number(n || 0).toLocaleString('pt-BR');
  const diaCurto = d => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; };

  /* ── dados ──────────────────────────────────── */
  async function carregar() {
    const [c, e, a] = await Promise.all([api('fale-conosco'), api('painel/empresas'), api(rotaAcessos())]);
    S.msgs = c.mensagens || []; S.emps = e.empresas || []; S.plat = e.plataforma || null; S.ac = a;
    if (S.sel && !S.msgs.some(m => m.id === S.sel)) S.sel = null;
    $('#atualizado').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    opcoesEmpresa(); desenharContato(); desenharEmpresas(); desenharAcessos();
  }

  /* ── Fale conosco ───────────────────────────── */
  function filtradas() {
    const b = sem($('#c-busca').value.trim()), sit = $('#c-situacao').value, ass = $('#c-assunto').value, ori = $('#c-origem').value;
    return S.msgs.filter(m => (!sit || (sit === 'pend') === !m.respondido_em) && (!ass || m.assunto === ass) && (!ori || m.origem === ori)
      && (!b || sem([m.nome, m.email, m.empresa, m.mensagem, m.anotacao].join(' ')).includes(b)));
  }
  function desenharContato() {
    const pend = S.msgs.filter(m => !m.respondido_em).length, semana = Date.now() - 7 * 864e5;
    $('#k-pend').textContent = pend; $('#k-resp').textContent = S.msgs.length - pend; $('#k-tot').textContent = S.msgs.length;
    $('#k-sem').textContent = S.msgs.filter(m => data(m.criado_em) >= semana).length;
    const cp = $('#cont-pend'); cp.textContent = pend; cp.hidden = !pend;
    const lista = $('#c-lista'); lista.innerHTML = '';
    const ms = filtradas();
    if (!ms.length) lista.append(h('div', { class: 'vazio' }, ic('fa-regular fa-envelope'), h('p', null, S.msgs.length ? 'Nenhuma mensagem com esses filtros.' : 'Nenhuma mensagem por enquanto.')));
    ms.forEach(m => lista.append(h('button', { class: 'item' + (m.respondido_em ? ' resp' : '') + (m.id === S.sel ? ' sel' : ''), 'data-id': m.id, onclick: () => abrir(m.id) },
      h('div', { class: 'it-topo' }, h('span', { class: 'it-ass' }, m.assunto + (m.respondido_em ? ' · respondida' : '')), h('span', null, quando(m.criado_em))),
      h('div', { class: 'it-nome' }, m.nome, m.empresa ? ` · ${m.empresa}` : ''),
      h('div', { class: 'it-txt' }, m.mensagem),
      m.anotacao ? h('div', { class: 'it-nota' }, ic('fa-regular fa-note-sticky'), ' ', m.anotacao) : null)));
    if (!S.notaSuja) desenharDetalhe();
  }
  function abrir(id) {
    S.notaSuja = false;   // anotação não salva de outra mensagem é descartada
    S.sel = id; $('#duas').classList.add('lendo');
    $$('.item').forEach(i => i.classList.toggle('sel', +i.dataset.id === id));
    desenharDetalhe(); if (window.innerWidth <= 900) window.scrollTo({ top: 0 });
  }
  function desenharDetalhe() {
    const box = $('#c-detalhe'), m = S.msgs.find(x => x.id === S.sel);
    box.innerHTML = '';
    if (!m) { $('#duas').classList.remove('lendo'); box.append(h('div', { class: 'vazio' }, ic('fa-regular fa-envelope-open'), h('p', null, 'Escolha uma mensagem para ler.'))); return; }
    const assunto = 'Re: ' + m.assunto + ' (Aprumo)';
    const corpo = `Olá, ${m.nome.split(' ')[0]}!\n\n\n\n— Equipe Aprumo · suporte\n\n> Sua mensagem de ${quando(m.criado_em, true)}:\n> ${m.mensagem.replace(/\n/g, '\n> ')}`;
    const nota = h('textarea', { id: 'dt-nota', placeholder: 'Ex.: liguei, quer demonstração na terça. Só a equipe Aprumo vê esta anotação.', maxlength: 5000 });
    nota.value = m.anotacao || '';
    const btNota = h('button', { class: 'bt bt-mini', disabled: true, onclick: async () => {
      btNota.disabled = true;
      try { await api('fale-conosco/' + m.id, 'PATCH', { anotacao: nota.value }); m.anotacao = nota.value.trim() || null; S.notaSuja = false; aviso('Anotação salva.'); desenharContato(); }
      catch (e) { btNota.disabled = false; aviso(e.message, true); }
    } }, ic('fa-solid fa-floppy-disk'), 'Salvar anotação');
    nota.oninput = () => { S.notaSuja = nota.value !== (m.anotacao || ''); btNota.disabled = !S.notaSuja; };
    const emp = m.empresa_id ? S.emps.find(e => +e.id === +m.empresa_id) : null;
    box.append(
      h('button', { class: 'bt bt-mini dt-voltar', onclick: () => { S.sel = null; S.notaSuja = false; desenharContato(); } }, ic('fa-solid fa-arrow-left'), 'Voltar à lista'),
      h('div', { class: 'dt-cab' },
        h('div', { class: 'chips' },
          h('span', { class: 'chip' }, m.assunto),
          h('span', { class: 'chip ' + (m.respondido_em ? 'ok' : 'pend') }, m.respondido_em ? 'Respondida' : 'Pendente'),
          h('span', { class: 'chip cinza' }, m.origem === 'login' ? 'Tela de entrada' : 'Dentro do sistema')),
        h('span', { class: 'dt-data' }, quando(m.criado_em, true))),
      h('div', { class: 'dt-nome' }, m.nome),
      h('div', { class: 'dt-de' },
        h('span', null, ic('fa-regular fa-envelope'), m.email),
        m.empresa ? h('span', null, ic('fa-regular fa-building'),
          h('button', { class: 'link', title: 'Ver a empresa', onclick: () => { trocarAba('empresas'); $('#e-busca').value = m.empresa; desenharEmpresas(); } }, m.empresa),
          emp ? ` · ${SIT[emp.situacao]?.[0] || emp.situacao}` : '') : null),
      h('div', { class: 'dt-msg' }, m.mensagem),
      h('div', { class: 'dt-acoes' },
        h('a', { class: 'bt bt-pri', href: 'mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(corpo) },
          ic('fa-solid fa-reply'), 'Responder por e-mail'),
        h('button', { class: 'bt ' + (m.respondido_em ? '' : 'bt-ok'), onclick: async ev => {
          const b = ev.currentTarget; b.disabled = true;
          try { await api('fale-conosco/' + m.id, 'PATCH', { respondida: !m.respondido_em }); aviso(m.respondido_em ? 'Mensagem reaberta.' : 'Marcada como respondida.'); await carregar(); }
          catch (e) { b.disabled = false; aviso(e.message, true); }
        } }, m.respondido_em ? [ic('fa-solid fa-rotate-left'), 'Reabrir'] : [ic('fa-solid fa-check'), 'Marcar como respondida']),
        h('button', { class: 'bt bt-perigo', onclick: async () => {
          if (!await confirmar('Excluir esta mensagem?', `A mensagem de ${m.nome} sai da caixa de vez. Use para testes e spam.`, 'Excluir', true)) return;
          try { await api('fale-conosco/' + m.id, 'DELETE'); S.sel = null; S.notaSuja = false; aviso('Mensagem excluída.'); await carregar(); }
          catch (e) { aviso(e.message, true); }
        } }, ic('fa-regular fa-trash-can'), 'Excluir')),
      h('div', { class: 'dt-nota' }, h('label', { for: 'dt-nota' }, 'Anotação interna', h('small', null, 'o cliente não vê')), nota, btNota));
  }

  /* ── Acessos ────────────────────────────────── */
  const rotaAcessos = () => `painel/acessos?dias=${$('#a-dias').value}` + ($('#a-empresa').value ? `&empresa=${$('#a-empresa').value}` : '');
  async function recarregarAcessos() {
    try { S.ac = await api(rotaAcessos()); desenharAcessos(); } catch (e) { aviso(e.message, true); }
  }
  function opcoesEmpresa() {
    const sel = $('#a-empresa'), v = sel.value;
    sel.replaceChildren(h('option', { value: '' }, 'Todas as empresas'), ...S.emps.map(e => h('option', { value: e.id }, e.nome)));
    sel.value = S.emps.some(e => String(e.id) === v) ? v : '';
  }
  function desenharAcessos() {
    const A = S.ac; if (!A) return;
    const R = A.resumo, P = A.pessoas || [];
    $('#a-hoje').textContent = num(R.hoje);
    $('#a-pessoas').textContent = num(R.pessoas); $('#a-pessoas-sub').textContent = `de ${num(R.cadastrados)} cadastrada(s)`;
    $('#a-acessos').textContent = num(R.acessos); $('#a-acessos-sub').textContent = R.entradas === 1 ? '1 com senha' : `${num(R.entradas)} com senha`;
    $('#a-emps').textContent = num(R.empresas_ativas); $('#a-emps-sub').textContent = `de ${num(R.empresas)} empresa(s)`;
    const cel = R.celular, pc = R.computador;
    $('#a-cel').textContent = R.pessoas ? num(cel) : '—';
    $('#a-cel-sub').textContent = R.pessoas ? `de ${num(R.pessoas)} · ${num(pc)} no computador` : 'ninguém entrou ainda';
    $('#a-acoes').textContent = num(R.acoes);
    grafico(A.serie || []);
    // pessoas
    const b = sem($('#a-busca').value.trim()), quem = $('#a-quem').value;
    const lista = P.filter(p => (!quem || (quem === 'entrou') === p.acessos > 0) && (!b || sem([p.nome, p.email, p.empresa].join(' ')).includes(b)));
    const corpo = $('#a-corpo'); corpo.innerHTML = '';
    if (!lista.length) {
      corpo.append(h('tr', null, h('td', { class: 'td-vazio', colspan: 7 }, P.length ? 'Ninguém com esses filtros.'
        : 'Nenhuma empresa cliente cadastrada ainda. Quando uma empresa criar a conta e as pessoas entrarem, elas aparecem aqui.')));
      return;
    }
    lista.forEach(p => corpo.append(h('tr', { class: p.acessos ? null : 'sem-acesso' },
      h('td', { class: 'td-emp' }, h('div', { class: 'em-nome' }, p.nome,
        p.situacao === 'convite' ? h('span', { class: 'chip teste' }, 'convite') : p.situacao === 'desativado' ? h('span', { class: 'chip cinza' }, 'desativado') : null),
        h('div', { class: 'em-sub' }, p.email || '—')),
      h('td', { 'data-r': 'Empresa' }, p.empresa),
      h('td', { 'data-r': 'Perfil' }, PERFIS[p.perfil] || p.perfil),
      h('td', { 'data-r': 'Último acesso', title: p.ultimo ? quando(p.ultimo, true) : '' }, p.ultimo ? quando(p.ultimo) : h('span', { class: 'nunca' }, 'nunca entrou')),
      h('td', { class: 'num', 'data-r': 'Acessos' }, num(p.acessos)),
      h('td', { class: 'num', 'data-r': 'Dias' }, num(p.dias)),
      h('td', { 'data-r': 'Aparelho' }, h('span', { class: 'aparelhos' },
        p.computador ? h('span', { title: 'Computador' }, ic('fa-solid fa-desktop')) : null,
        p.celular ? h('span', { title: 'Celular' }, ic('fa-solid fa-mobile-screen')) : null,
        !p.computador && !p.celular ? '—' : null)))));
  }
  /** Barras: pessoas diferentes por dia; passando o mouse, aparecem também os acessos do dia */
  function grafico(serie) {
    const box = $('#a-grafico'); box.innerHTML = '';
    const max = Math.max(1, ...serie.map(d => d.pessoas));
    if (!serie.some(d => d.acessos || d.pessoas)) { box.append(h('div', { class: 'graf-vazio' }, ic('fa-regular fa-chart-bar'), h('p', null, 'Nenhum acesso de cliente no período.'))); return; }
    const NS = 'http://www.w3.org/2000/svg', W = 760, H = 180, base = 150, n = serie.length, larg = W / n;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Pessoas e acessos por dia'); svg.classList.add('graf');
    const el = (t, at, txt) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); if (txt != null) e.textContent = txt; svg.append(e); return e; };
    el('line', { x1: 0, x2: W, y1: base, y2: base, class: 'g-eixo' });
    const passo = n > 31 ? 14 : n > 10 ? 5 : 1;
    serie.forEach((d, i) => {
      const x = i * larg, w = Math.max(2, larg * 0.62), xa = x + (larg - w) / 2;
      const hp = (d.pessoas / max) * (base - 18);
      const g = document.createElementNS(NS, 'g'); svg.append(g);
      const t = document.createElementNS(NS, 'title'); t.textContent = `${diaCurto(d.dia)}: ${d.pessoas} pessoa(s), ${d.acessos} acesso(s)`; g.append(t);
      const fundo = document.createElementNS(NS, 'rect'); Object.entries({ x, y: 0, width: larg, height: base, class: 'g-alvo' }).forEach(([k, v]) => fundo.setAttribute(k, v)); g.append(fundo);
      const r = document.createElementNS(NS, 'rect'); Object.entries({ x: xa, y: base - hp, width: w, height: hp, rx: 3, class: 'g-p' }).forEach(([k, v]) => r.setAttribute(k, v)); g.append(r);
      if (n <= 31 && d.pessoas) { const tx = document.createElementNS(NS, 'text'); Object.entries({ x: x + larg / 2, y: base - hp - 5, class: 'g-num' }).forEach(([k, v]) => tx.setAttribute(k, v)); tx.textContent = d.pessoas; g.append(tx); }
      if ((n - 1 - i) % passo === 0) el('text', { x: x + larg / 2, y: H - 10, class: 'g-dia' }, diaCurto(d.dia));
    });
    box.append(svg);
  }
  function verAcessos(e) { $('#a-empresa').value = String(e.id); $('#a-quem').value = ''; $('#a-busca').value = ''; trocarAba('acessos'); recarregarAcessos(); }

  /* ── Empresas ───────────────────────────────── */
  function desenharPlataforma() {
    const box = $('#plataforma'), P = S.plat; box.innerHTML = '';
    if (!P) { box.hidden = true; return; }
    box.hidden = false;
    const D = P.dados || {}, itens = [['obras', 'obra(s)'], ['atividades', 'atividade(s)'], ['funcionarios', 'pessoa(s) na equipe'], ['recursos', 'recurso(s)'],
      ['rdos', 'RDO(s)'], ['relatorios', 'relatório(s)'], ['fotos', 'foto(s)'], ['modelos', 'modelo(s)'], ['outros_usuarios', 'outro(s) usuário(s)']].filter(([k]) => D[k]);
    const limpa = !itens.length;
    box.className = 'plataforma' + (limpa ? ' limpa' : '');
    box.append(
      h('div', { class: 'pl-ic' }, ic('fa-solid fa-shield-halved')),
      h('div', { class: 'pl-txt' },
        h('b', null, `${P.nome} · administração da plataforma`),
        h('span', null, limpa ? 'Só a conta da administração, sem obras nem equipe. Fica fora das listas e dos números de acesso.'
          : 'Ainda tem dados de teste: ' + itens.map(([k, t]) => `${num(D[k])} ${t}`).join(', ') + '.')),
      limpa ? h('span', { class: 'chip ok' }, ic('fa-solid fa-check'), ' Limpa')
        : h('button', { class: 'bt bt-perigo', onclick: limparPlataforma }, ic('fa-solid fa-eraser'), 'Apagar dados de teste'));
  }
  async function limparPlataforma() {
    const ok = await confirmarDigitando('Apagar os dados de teste da administração?',
      `Saem de vez as obras, atividades, RDOs, relatórios, fotos, equipe, recursos, modelos e qualquer usuário da ${S.plat.nome} que não seja da administração. A sua conta continua entrando e passa a abrir direto neste painel. Não dá para desfazer.`,
      'APAGAR', 'Apagar de vez');
    if (!ok) return;
    try { await api('painel/plataforma/limpar', 'POST', { confirmar: 'APAGAR' }); aviso('Dados de teste apagados.'); await carregar(); $('#bt-sistema').hidden = true; }
    catch (err) { aviso(err.message, true); }
  }
  async function excluirEmpresa(e) {
    const ok = await confirmarDigitando(`Excluir ${e.nome} de vez?`,
      `Saem a empresa, os ${e.usuarios} usuário(s), as ${e.obras} obra(s) e tudo o que foi lançado (RDOs, fotos, documentos, histórico). Ninguém da ${e.nome} entra mais. Não dá para desfazer; para só bloquear o acesso, use Suspender.`,
      e.nome, 'Excluir de vez');
    if (!ok) return;
    try { await api('painel/empresas/' + e.id, 'DELETE', { confirmar: e.nome }); aviso(`${e.nome} excluída.`); if ($('#a-empresa').value === String(e.id)) $('#a-empresa').value = ''; await carregar(); }
    catch (err) { aviso(err.message, true); }
  }
  function desenharEmpresas() {
    desenharPlataforma();
    const E = S.emps, n = s => E.filter(e => e.situacao === s).length;
    $('#k-emp').textContent = E.length; $('#k-ativ').textContent = n('ativo'); $('#k-teste').textContent = n('teste'); $('#k-susp').textContent = n('suspenso');
    $('#k-usu').textContent = E.reduce((t, e) => t + e.usuarios, 0); $('#cont-emp').textContent = E.length;
    const b = sem($('#e-busca').value.trim()), sit = $('#e-situacao').value;
    const lista = E.filter(e => (!sit || e.situacao === sit) && (!b || sem([e.nome, e.razao_social, e.cnpj, e.cidade, e.uf, e.admin_nome, e.admin_email].join(' ')).includes(b)));
    const corpo = $('#e-corpo'); corpo.innerHTML = '';
    if (!lista.length) { corpo.append(h('tr', null, h('td', { class: 'td-vazio', colspan: 9 }, E.length ? 'Nenhuma empresa com esses filtros.' : 'Nenhuma empresa cliente cadastrada ainda.'))); return; }
    lista.forEach(e => {
      const [rot, cls] = SIT[e.situacao] || [e.situacao, 'cinza'];
      const susp = e.situacao === 'suspenso';
      const parada = !susp && e.usuarios_ativos > 0 && (!e.ultimo_acesso || Date.now() - data(e.ultimo_acesso) > 7 * 864e5);
      corpo.append(h('tr', { class: susp ? 'susp' : null },
        h('td', { class: 'td-emp' },
          h('div', { class: 'em-nome' }, e.nome, parada ? h('span', { class: 'chip pend', title: 'Ninguém entrou nos últimos 7 dias' }, 'parada') : null),
          h('div', { class: 'em-sub' }, [e.cnpj, [e.cidade, e.uf].filter(Boolean).join('/'), 'desde ' + data(e.criado_em).toLocaleDateString('pt-BR')].filter(Boolean).join(' · '))),
        h('td', { 'data-r': 'Administrador' }, h('div', null, h('div', null, e.admin_nome || '—'), h('div', { class: 'ad-sub' }, e.admin_email || ''))),
        h('td', { class: 'num', 'data-r': 'Ativos 7 dias', title: `${e.usuarios} usuário(s), ${e.usuarios_ativos} com e-mail confirmado` }, `${e.pessoas_7d} de ${e.usuarios}`),
        h('td', { class: 'num', 'data-r': 'Acessos 30 dias' }, num(e.acessos_30d)),
        h('td', { class: 'num', 'data-r': 'Obras' }, `${e.obras}`),
        h('td', { class: 'num', 'data-r': 'Equipe' }, `${e.funcionarios}`),
        h('td', { 'data-r': 'Último acesso', title: e.ultimo_acesso ? quando(e.ultimo_acesso, true) : '' }, e.ultimo_acesso ? quando(e.ultimo_acesso) : 'nunca'),
        h('td', { 'data-r': 'Situação' }, h('span', { class: 'chip ' + cls }, rot),
          h('select', { class: 'em-plano', 'aria-label': 'Plano de ' + e.nome, onchange: ev => mudarPlano(e, ev.target.value) },
            [['teste', 'Teste'], ['essencial', 'Essencial'], ['profissional', 'Profissional'], ['empresa', 'Empresa'], ['corporativo', 'Corporativo']].map(([v, t]) => h('option', { value: v, selected: e.plano === v ? 'selected' : null }, t)))),
        h('td', { class: 'td-acao' }, h('div', { class: 'acoes' },
          h('button', { class: 'bt bt-mini', onclick: () => verAcessos(e) }, ic('fa-solid fa-chart-column'), 'Acessos'),
          h('button', { class: 'bt bt-mini ' + (susp ? 'bt-ok' : 'bt-perigo'), onclick: () => mudarSituacao(e) },
            susp ? [ic('fa-solid fa-play'), 'Reativar'] : [ic('fa-solid fa-ban'), 'Suspender']),
          h('button', { class: 'bt bt-mini bt-perigo bt-icone', title: 'Excluir de vez', 'aria-label': 'Excluir ' + e.nome, onclick: () => excluirEmpresa(e) }, ic('fa-regular fa-trash-can'))))));
    });
  }
  async function mudarPlano(e, plano) {
    try { await api('painel/empresas/' + e.id, 'PATCH', { plano }); aviso(`Plano de ${e.nome} mudado.`); e.plano = plano; }
    catch (err) { aviso(err.message, true); await carregar(); }
  }
  async function mudarSituacao(e) {
    const susp = e.situacao !== 'suspenso';
    const ok = await confirmar(susp ? `Suspender ${e.nome}?` : `Reativar ${e.nome}?`,
      susp ? `Ninguém da ${e.nome} vai conseguir entrar, e quem estiver usando agora será desconectado. Os dados ficam guardados e voltam ao reativar.`
           : `As ${e.usuarios} pessoa(s) da ${e.nome} voltam a entrar normalmente, com todos os dados como estavam.`,
      susp ? 'Suspender' : 'Reativar', susp);
    if (!ok) return;
    try { await api('painel/empresas/' + e.id, 'PATCH', { situacao: susp ? 'suspenso' : 'ativo' }); aviso(susp ? `${e.nome} suspensa.` : `${e.nome} reativada.`); await carregar(); }
    catch (err) { aviso(err.message, true); }
  }

  /* ── abas e eventos ─────────────────────────── */
  function trocarAba(a) {
    S.aba = a;
    $$('.aba').forEach(b => { const on = b.dataset.aba === a; b.classList.toggle('ativa', on); b.setAttribute('aria-selected', on); });
    ['acessos', 'empresas', 'contato'].forEach(x => { $('#aba-' + x).hidden = a !== x; });
    history.replaceState(null, '', a === 'acessos' ? location.pathname : '#' + a);
  }
  $$('.aba').forEach(b => b.onclick = () => trocarAba(b.dataset.aba));
  ['#c-busca', '#c-situacao', '#c-assunto', '#c-origem'].forEach(s => $(s).addEventListener('input', desenharContato));
  ['#e-busca', '#e-situacao'].forEach(s => $(s).addEventListener('input', desenharEmpresas));
  ['#a-busca', '#a-quem'].forEach(s => $(s).addEventListener('input', desenharAcessos));
  ['#a-dias', '#a-empresa'].forEach(s => $(s).addEventListener('change', recarregarAcessos));
  $('#bt-sair').onclick = async () => { try { await api('sair', 'POST', {}); } catch (_) {} location.href = 'entrar.html'; };
  window.addEventListener('beforeunload', ev => { if (S.notaSuja) { ev.preventDefault(); ev.returnValue = ''; } });

  /* ── início ─────────────────────────────────── */
  (async () => {
    let eu;
    try { eu = (await api('eu')).usuario; }
    catch (e) {
      if (e.status === 401) { location.replace('entrar.html?voltar=painel'); return; }
      $('#carregando').textContent = e.message; return;
    }
    $('#quem-nome').textContent = eu.nome; $('#quem-email').textContent = eu.email; $('#topo-dir').hidden = false;
    if (!+eu.dono_plataforma) { $('#carregando').hidden = true; $('#negado').hidden = false; return; }
    $('#bt-sistema').hidden = !!+eu.empresa_plataforma;   // a conta da administração não tem obras: fica só no painel
    let v = null; try { v = JSON.parse(sessionStorage.getItem('tf-e-painel') || 'null'); } catch (_) {}
    if (v && v.campos) for (const s of ['#a-dias', '#a-empresa']) if (v.campos[s] != null) { const el = $(s); if (s === '#a-empresa') el.append(h('option', { value: v.campos[s] }, '')); el.value = v.campos[s]; }
    try { await carregar(); } catch (e) { $('#carregando').textContent = e.message; return; }
    $('#carregando').hidden = true; $('#conteudo').hidden = false;
    if (['#empresas', '#contato'].includes(location.hash)) trocarAba(location.hash.slice(1));
    // F5: volta com os mesmos filtros e a mesma mensagem aberta
    const CAMPOS = ['#c-busca', '#c-situacao', '#c-assunto', '#c-origem', '#e-busca', '#e-situacao', '#a-busca', '#a-quem', '#a-dias', '#a-empresa'];
    try {
      if (v) { for (const [s, val] of Object.entries(v.campos || {})) { const el = $(s); if (el && val != null) el.value = val; } desenharContato(); desenharEmpresas(); desenharAcessos(); if (v.sel && S.msgs.some(m => m.id === v.sel)) abrir(v.sel); }
    } catch (_) {}
    const guardarPainel = () => { try { const campos = {}; CAMPOS.forEach(s => { const el = $(s); if (el) campos[s] = el.value; }); sessionStorage.setItem('tf-e-painel', JSON.stringify({ sel: S.sel, campos })); } catch (_) {} };
    document.addEventListener('input', guardarPainel, true); document.addEventListener('click', () => setTimeout(guardarPainel, 0), true);
    // novidades: a cada minuto e quando a aba volta a ficar visível
    const atualizar = () => { if (!document.hidden && !S.notaSuja) carregar().catch(() => {}); };
    setInterval(atualizar, 60000); document.addEventListener('visibilitychange', atualizar);
  })();
})();
