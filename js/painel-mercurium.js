/* Mercronos · painel-mercurium.js — painel da Mercurium: Fale conosco e empresas (só donos da plataforma) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const S = { msgs: [], emps: [], sel: null, aba: 'contato', notaSuja: false };

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
  const SIT = { ativo: ['Ativa', 'ok'], teste: ['Em teste', 'teste'], suspenso: ['Suspensa', 'pend'] };

  /* ── dados ──────────────────────────────────── */
  async function carregar() {
    const [c, e] = await Promise.all([api('fale-conosco'), api('painel/empresas')]);
    S.msgs = c.mensagens || []; S.emps = e.empresas || [];
    if (S.sel && !S.msgs.some(m => m.id === S.sel)) S.sel = null;
    $('#atualizado').textContent = 'Atualizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    desenharContato(); desenharEmpresas();
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
    const assunto = 'Re: ' + m.assunto + ' (Mercronos)';
    const corpo = `Olá, ${m.nome.split(' ')[0]}!\n\n\n\n— Equipe Mercronos · suporte\n\n> Sua mensagem de ${quando(m.criado_em, true)}:\n> ${m.mensagem.replace(/\n/g, '\n> ')}`;
    const nota = h('textarea', { id: 'dt-nota', placeholder: 'Ex.: liguei, quer demonstração na terça. Só a equipe Mercronos vê esta anotação.', maxlength: 5000 });
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
        } }, m.respondido_em ? [ic('fa-solid fa-rotate-left'), 'Reabrir'] : [ic('fa-solid fa-check'), 'Marcar como respondida'])),
      h('div', { class: 'dt-nota' }, h('label', { for: 'dt-nota' }, 'Anotação interna', h('small', null, 'o cliente não vê')), nota, btNota));
  }

  /* ── Empresas ───────────────────────────────── */
  function desenharEmpresas() {
    const E = S.emps, n = s => E.filter(e => e.situacao === s).length;
    $('#k-emp').textContent = E.length; $('#k-ativ').textContent = n('ativo'); $('#k-teste').textContent = n('teste'); $('#k-susp').textContent = n('suspenso');
    $('#k-usu').textContent = E.reduce((t, e) => t + e.usuarios, 0); $('#cont-emp').textContent = E.length;
    const b = sem($('#e-busca').value.trim()), sit = $('#e-situacao').value;
    const lista = E.filter(e => (!sit || e.situacao === sit) && (!b || sem([e.nome, e.razao_social, e.cnpj, e.cidade, e.uf, e.admin_nome, e.admin_email].join(' ')).includes(b)));
    const corpo = $('#e-corpo'); corpo.innerHTML = '';
    if (!lista.length) { corpo.append(h('tr', null, h('td', { class: 'td-vazio', colspan: 9 }, E.length ? 'Nenhuma empresa com esses filtros.' : 'Nenhuma empresa cadastrada.'))); return; }
    lista.forEach(e => {
      const [rot, cls] = SIT[e.situacao] || [e.situacao, 'cinza'];
      const susp = e.situacao === 'suspenso';
      corpo.append(h('tr', { class: susp ? 'susp' : null },
        h('td', { class: 'td-emp' },
          h('div', { class: 'em-nome' }, e.nome, e.sua ? h('span', { class: 'sua' }, 'sua empresa') : null),
          h('div', { class: 'em-sub' }, [e.cnpj, [e.cidade, e.uf].filter(Boolean).join('/'), e.telefone].filter(Boolean).join(' · ') || 'Sem CNPJ e cidade informados')),
        h('td', { 'data-r': 'Administrador' }, h('div', null, h('div', null, e.admin_nome || '—'), h('div', { class: 'ad-sub' }, e.admin_email || ''))),
        h('td', { class: 'num', 'data-r': 'Usuários', title: `${e.usuarios_ativos} com e-mail confirmado` }, `${e.usuarios}`),
        h('td', { class: 'num', 'data-r': 'Obras' }, `${e.obras}`),
        h('td', { class: 'num', 'data-r': 'Equipe' }, `${e.funcionarios}`),
        h('td', { 'data-r': 'Último acesso', title: e.ultimo_acesso ? quando(e.ultimo_acesso, true) : '' }, e.ultimo_acesso ? quando(e.ultimo_acesso) : 'nunca'),
        h('td', { 'data-r': 'Cadastro' }, data(e.criado_em).toLocaleDateString('pt-BR')),
        h('td', { 'data-r': 'Situação' }, h('span', { class: 'chip ' + cls }, rot),
          h('select', { class: 'em-plano', 'aria-label': 'Plano de ' + e.nome, onchange: ev => mudarPlano(e, ev.target.value) },
            [['teste', 'Teste'], ['essencial', 'Essencial'], ['profissional', 'Profissional'], ['empresa', 'Empresa'], ['corporativo', 'Corporativo']].map(([v, t]) => h('option', { value: v, selected: e.plano === v ? 'selected' : null }, t)))),
        h('td', { class: 'td-acao' }, e.sua ? null : h('button', { class: 'bt bt-mini ' + (susp ? 'bt-ok' : 'bt-perigo'), onclick: () => mudarSituacao(e) },
          susp ? [ic('fa-solid fa-play'), 'Reativar'] : [ic('fa-solid fa-ban'), 'Suspender']))));
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
    $('#aba-contato').hidden = a !== 'contato'; $('#aba-empresas').hidden = a !== 'empresas';
    history.replaceState(null, '', a === 'empresas' ? '#empresas' : location.pathname);
  }
  $$('.aba').forEach(b => b.onclick = () => trocarAba(b.dataset.aba));
  ['#c-busca', '#c-situacao', '#c-assunto', '#c-origem'].forEach(s => $(s).addEventListener('input', desenharContato));
  ['#e-busca', '#e-situacao'].forEach(s => $(s).addEventListener('input', desenharEmpresas));
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
    try { await carregar(); } catch (e) { $('#carregando').textContent = e.message; return; }
    $('#carregando').hidden = true; $('#conteudo').hidden = false;
    if (location.hash === '#empresas') trocarAba('empresas');
    // novidades: a cada minuto e quando a aba volta a ficar visível
    const atualizar = () => { if (!document.hidden && !S.notaSuja) carregar().catch(() => {}); };
    setInterval(atualizar, 60000); document.addEventListener('visibilitychange', atualizar);
  })();
})();
