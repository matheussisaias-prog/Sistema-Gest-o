/* Aprumo · empresa.js — tela "Empresa e usuários": usuários (perfil, desativar, nova senha), convites por e-mail ou link
   para WhatsApp, dados e logo da empresa, calendário padrão, regras do campo e plano. Só o administrador altera.
   Usa as peças visuais da Equipe (eq-*) e as próprias (em-*). */
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
  const celular = () => window.innerWidth <= 760;
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
  const raiz = () => document.getElementById('view-empresa');
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
  const dBRano = s => s ? dBR(s) + '/' + s.slice(0, 4) : '—';
  const PERF = { administrador: ['Administrador', 'rx', 'Tudo, inclusive usuários, dados da empresa e plano.'], gestor: ['Gestor', 'az', 'Obras, cronograma, equipe, recursos, RDO e relatórios.'],
    encarregado: ['Encarregado', 'ven', 'Minhas atividades, a equipe dele e o RDO das obras dele.'], funcionario: ['Funcionário', 'cz', 'Só Minhas atividades: avanço com foto e Travou.'] };
  const ABAS = [['usuarios', 'Usuários', 'Usuários'], ['empresa', 'Empresa', 'Empresa'], ['calendario', 'Calendário padrão', 'Calendário'], ['regras', 'Regras do campo', 'Regras'], ['plano', 'Plano', 'Plano']];
  const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const selo = (t, c) => h('span', { class: 'eq-selo ' + (c || 'cz') }, t);
  const iniciais = n => String(n || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const tel = v => { const d = String(v || '').replace(/\D/g, '').slice(0, 11); return d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : d.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/^(\d{2})(\d{0,4})$/, '($1) $2'); };
  function quando(s) {
    if (!s) return 'nunca entrou';
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), d = s.slice(0, 10), hr = s.slice(11, 16);
    const ontem = new Date(Date.parse(hoje + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
    return d === hoje ? 'hoje ' + hr : d === ontem ? 'ontem ' + hr : dBRano(d);
  }

  const M = { aba: 'usuarios', U: null, E: null, C: null, P: null, busca: '', perfil: '', sit: 'ativos', erro: null };
  const pode = () => !!(M.U ? M.U.pode_editar : M.E && M.E.pode_editar);

  /* ── carga ──────────────────────────────────── */
  async function carregar(aba) {
    const a = aba || M.aba;
    try {
      if (a === 'usuarios') M.U = await api('empresa/usuarios');
      if (a === 'empresa' || a === 'regras' || !M.E) M.E = await api('empresa');
      if (a === 'calendario') { M.C = await api('empresa/calendario'); M.Cdias = M.C.dias.map(x => ({ ...x })); M.Choras = [...M.C.horas_semana]; M.Cnac = M.C.feriados_nacionais; }
      if (a === 'plano') M.P = await api('empresa/plano');
      M.erro = null;
    } catch (e) { M.erro = e.message; }
    desenhar();
  }

  /* ── desenho ────────────────────────────────── */
  function desenhar() {
    const R = raiz(); if (!R || !R.classList.contains('active')) return;
    tfEstado.gravar('empresa', { aba: M.aba, busca: M.busca, perfil: M.perfil, sit: M.sit });
    const y = window.scrollY; R.innerHTML = '';
    const box = h('div', { class: 'eq em' }); R.append(box);
    const E = M.E && M.E.empresa, mob = celular();
    box.append(h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, 'Empresa e usuários'),
      h('p', null, [E ? E.nome : '', M.E ? 'plano ' + M.E.plano : '', M.E && !M.E.pode_editar ? 'só o administrador altera' : ''].filter(Boolean).join(' · ')))));
    box.append(h('div', { class: 'em-abas', role: 'tablist' }, ABAS.map(([k, t, tm]) => h('button', { role: 'tab', 'aria-selected': M.aba === k ? 'true' : 'false', class: M.aba === k ? 'on' : '', 'data-aba': k,
      onclick: () => { if (M.aba === k) return; M.aba = k; desenhar(); carregar(k); } }, mob ? tm : t))));
    if (M.erro) { box.append(h('p', { class: 'eq-vazio' }, M.erro)); return; }
    const corpo = { usuarios: abaUsuarios, empresa: abaEmpresa, calendario: abaCalendario, regras: abaRegras, plano: abaPlano }[M.aba]();
    box.append(...[corpo].flat().filter(Boolean));
    window.scrollTo(0, y);
  }
  const carregando = () => h('p', { class: 'eq-vazio' }, 'Carregando…');

  /* ══ Usuários ═══════════════════════════════ */
  function linhas() {
    const U = M.U, b = M.busca.trim().toLowerCase();
    const L = [...U.usuarios.map(x => ({ ...x, tipo: 'u' })), ...U.convites.map(c => ({ ...c, tipo: 'c', situacao: c.vencido ? 'vencido' : 'convite' }))];
    return L.filter(x => (!M.perfil || x.perfil === M.perfil) && (M.sit === 'todos' || (M.sit === 'desativados' ? x.situacao === 'desativado' : x.situacao !== 'desativado'))
      && (!b || [x.nome, x.email, x.telefone, x.cargo].join(' ').toLowerCase().includes(b)))
      .sort((a, z) => (a.situacao === 'desativado') - (z.situacao === 'desativado') || (a.tipo === 'c') - (z.tipo === 'c') || a.nome.localeCompare(z.nome, 'pt-BR'));
  }
  const SIT = { ativo: ['Ativo', 'ok'], convite: ['Convite enviado', 'ven'], vencido: ['Convite vencido', 'vc'], desativado: ['Desativado', 'cz'] };
  const acesso = x => x.email || (x.telefone ? '📱 ' + x.telefone : x.tipo === 'c' && x.canal === 'whatsapp' ? '📱 Link pelo WhatsApp' : '—');
  const quandoLin = x => x.tipo === 'c' ? (x.vencido ? 'venceu ' + dBR(x.expira_em) : 'convidado ' + quando(x.enviado_em).replace(/ \d\d:\d\d$/, '')) : x.situacao === 'desativado' ? 'desde ' + dBR(x.desativado_em) : quando(x.ultimo_acesso);
  function abaUsuarios() {
    if (!M.U) return carregando();
    const U = M.U, k = U.indicadores, mob = celular(), P = U.plano;
    const kpi = (n, t, cor) => h('div', { class: 'eq-kpi ' + cor }, h('b', null, n), h('span', null, t));
    const kpis = h('div', { class: 'eq-kpis em-kpis' }, kpi(P.escritorio ? `${k.escritorio} de ${P.escritorio}` : k.escritorio, mob ? 'escritório' : 'usuários de escritório (adm. e gestor) no plano', 'azul'),
      kpi(k.campo, mob ? 'campo' : 'usuários de campo (sem limite)', 'verd'), kpi(k.convites, mob ? 'convites' : 'convites esperando a pessoa entrar', 'amar'), mob ? null : kpi(k.desativados, 'desativados (histórico mantido)', ''));
    const filtros = h('div', { class: 'em-filtros' },
      h('input', { class: 'em-in', type: 'search', placeholder: 'Buscar pessoa, e-mail ou celular', value: M.busca, 'aria-label': 'Buscar', oninput: e => { M.busca = e.target.value; redesenharLista(); } }),
      h('select', { class: 'em-in', 'aria-label': 'Perfil', onchange: e => { M.perfil = e.target.value; redesenharLista(); } }, h('option', { value: '' }, 'Todos os perfis'), Object.entries(PERF).map(([v, p]) => h('option', { value: v, selected: M.perfil === v }, p[0]))),
      h('select', { class: 'em-in', 'aria-label': 'Situação', onchange: e => { M.sit = e.target.value; redesenharLista(); } }, [['ativos', 'Ativos e convites'], ['desativados', 'Desativados'], ['todos', 'Todos']].map(([v, t]) => h('option', { value: v, selected: M.sit === v }, t))));
    const lista = h('div', { id: 'em-lista' }, listaUsuarios());
    const bt = U.pode_editar ? h('button', { class: 'eq-bt pri', id: 'em-convidar', onclick: () => janelaConvite() }, ic('fa-user-plus'), ' Convidar pessoa') : null;
    const painel = h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, `Usuários (${U.usuarios.filter(x => x.situacao === 'ativo').length} ativos)`),
      h('small', null, 'Quem entra no Aprumo. Desativar tira o acesso na hora e mantém o nome nos registros.')), mob ? null : bt), mob && bt ? h('div', { class: 'em-pad' }, bt) : null, h('div', { class: 'em-pad' }, filtros), lista);
    const perfis = h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('b', null, 'O que cada perfil pode fazer')),
      h('div', { class: 'em-perfis' }, Object.values(PERF).map(p => h('div', null, h('b', null, p[0]), h('span', null, p[2])))));
    return [kpis, painel, perfis];
  }
  function redesenharLista() { const l = document.getElementById('em-lista'); if (l) { l.innerHTML = ''; l.append(...[listaUsuarios()].flat()); } }
  function listaUsuarios() {
    const L = linhas(), mob = celular(), P = M.U.pode_editar;
    if (!L.length) return h('p', { class: 'eq-vazio' }, M.busca || M.perfil ? 'Ninguém com esses filtros.' : M.sit === 'desativados' ? 'Nenhum usuário desativado.' : 'Ninguém ainda.');
    if (mob) return h('div', { class: 'em-cards' }, L.map(x => h('button', { class: 'em-card' + (x.situacao === 'desativado' ? ' off' : ''), onclick: () => P ? folhaAcoes(x) : null, 'data-nome': x.nome },
      h('span', { class: 'em-av' }, iniciais(x.nome)), h('span', { class: 'em-card-t' }, h('b', null, x.nome, x.eu ? ' (você)' : ''), h('small', null, `${PERF[x.perfil][0]} · ${quandoLin(x)}`), selo(...SIT[x.situacao])),
      P ? ic('fa-chevron-right') : null)));
    return h('div', { class: 'em-tab' }, h('div', { class: 'em-lin em-th' }, ['Pessoa', 'E-mail / acesso', 'Perfil', 'Situação', 'Último acesso', ''].map(t => h('span', null, t))),
      L.map(x => {
        const perf = P && !x.eu && x.situacao !== 'desativado'
          ? h('select', { class: 'em-perf', 'aria-label': 'Perfil de ' + x.nome, onchange: e => mudarPerfil(x, e.target.value, e.target) }, Object.entries(PERF).map(([v, p]) => h('option', { value: v, selected: x.perfil === v }, p[0])))
          : selo(PERF[x.perfil][0], PERF[x.perfil][1]);
        let acoes = null;
        if (P && x.tipo === 'c') acoes = [h('button', { class: 'eq-bt', onclick: () => reenviar(x) }, x.canal === 'whatsapp' ? ic('fa-brands fa-whatsapp') : ic('fa-envelope'), ' Reenviar'),
          h('button', { class: 'eq-bt em-x', title: 'Cancelar convite', 'aria-label': 'Cancelar convite de ' + x.nome, onclick: () => cancelarConvite(x) }, ic('fa-xmark'))];
        else if (P && x.situacao === 'desativado') acoes = h('button', { class: 'eq-bt', onclick: () => reativar(x) }, ic('fa-rotate-left'), ' Reativar');
        else if (P && !x.eu) acoes = h('button', { class: 'eq-bt em-mais', 'aria-label': 'Mais ações de ' + x.nome, onclick: e => menu(e.currentTarget, x) }, ic('fa-ellipsis'));
        return h('div', { class: 'em-lin' + (x.situacao === 'desativado' ? ' off' : ''), 'data-nome': x.nome },
          h('span', { class: 'em-pes' }, h('span', { class: 'em-av' }, iniciais(x.nome)), h('span', null, h('b', null, x.nome, x.eu ? ' (você)' : ''), h('small', null, x.cargo || (x.tipo === 'c' ? 'convidado' : '')))),
          h('span', { class: 'em-mail' }, acesso(x)), h('span', null, perf), h('span', null, selo(...SIT[x.situacao])), h('span', { class: 'cz' }, quandoLin(x)), h('span', { class: 'em-acoes' }, acoes));
      }));
  }
  function menu(alvo, x) {
    document.querySelector('.em-menu')?.remove();
    const r = alvo.getBoundingClientRect();
    const m = h('div', { class: 'em-menu', role: 'menu', style: `top:${r.bottom + window.scrollY + 4}px; left:${Math.max(8, r.right + window.scrollX - 250)}px` },
      h('button', { role: 'menuitem', onclick: () => { fechar(); linkSenha(x); } }, ic('fa-key'), ' Gerar link de nova senha'),
      h('button', { role: 'menuitem', class: 'perigo', onclick: () => { fechar(); desativar(x); } }, ic('fa-user-slash'), ' Desativar acesso'));
    const fechar = () => { m.remove(); document.removeEventListener('mousedown', fora, true); };
    const fora = e => { if (!m.contains(e.target) && e.target !== alvo) fechar(); };
    document.body.append(m); setTimeout(() => document.addEventListener('mousedown', fora, true), 0);
  }
  function folhaAcoes(x) {
    const itens = [];
    if (x.tipo === 'c') itens.push([x.canal === 'whatsapp' ? '📱 Mandar o link de novo pelo WhatsApp' : '✉️ Mandar o convite de novo por e-mail', 'pri' + (x.canal === 'whatsapp' ? ' wa' : ''), () => reenviar(x)],
      ['Trocar perfil', '', () => trocarPerfilJanela(x)], ['Cancelar convite', 'perigo', () => cancelarConvite(x)]);
    else if (x.situacao === 'desativado') itens.push(['Reativar acesso', 'pri', () => reativar(x)]);
    else if (!x.eu) itens.push(['Trocar perfil', '', () => trocarPerfilJanela(x)], ['Gerar link de nova senha', '', () => linkSenha(x)], ['Desativar acesso', 'perigo', () => desativar(x)]);
    else itens.push(['Este é você. Para mudar o seu perfil, peça a outro administrador.', 'txt', null]);
    const fundo = h('div', { class: 'eq-fundo em-folha-fundo', role: 'dialog', 'aria-modal': 'true', 'aria-label': x.nome });
    const fechar = () => fundo.remove();
    fundo.append(h('div', { class: 'em-folha' }, h('i', { class: 'em-alca' }), h('b', null, `${x.nome} · ${PERF[x.perfil][0]}`),
      h('small', null, x.tipo === 'c' ? `${SIT[x.situacao][0]} ${x.canal === 'whatsapp' ? 'pelo WhatsApp' : 'por e-mail'} · ${quandoLin(x)}` : `${acesso(x)} · ${quandoLin(x)}`),
      itens.map(([t, c, fn]) => c === 'txt' ? h('p', { class: 'rl-nota' }, t) : h('button', { class: 'eq-bt ' + c, onclick: () => { fechar(); fn(); } }, t)),
      h('button', { class: 'eq-bt', onclick: fechar }, 'Fechar')));
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    document.body.append(fundo);
  }
  function trocarPerfilJanela(x) {
    let v = x.perfil;
    const chips = h('div', { class: 'em-chips4' }, Object.entries(PERF).map(([k, p]) => h('button', { class: k === v ? 'on' : '', onclick: e => { v = k; chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, h('b', null, p[0]), h('small', null, p[2]))));
    janela('Trocar perfil · ' + x.nome, chips, 'Salvar', () => mudarPerfil(x, v));
  }
  async function mudarPerfil(x, perfil, sel) {
    if (perfil === x.perfil) return;
    try { await api((x.tipo === 'c' ? 'convites/' : 'usuarios/') + x.id, 'PATCH', { perfil }); avisar(`${x.nome} agora é ${PERF[perfil][0].toLowerCase()}`, 'success'); await carregar('usuarios'); }
    catch (e) { avisar(e.message, 'error'); if (sel) sel.value = x.perfil; }
  }
  function desativar(x) {
    janela('Desativar acesso', h('p', { class: 'rl-nota' }, `${x.nome} deixa de entrar no Aprumo agora (quem estiver usando é desconectado). O nome continua nos avanços, RDOs e fotos que já registrou. Dá para reativar depois.`),
      'Desativar', async () => { await api(`usuarios/${x.id}/desativar`, 'POST'); avisar(`${x.nome} desativado`, 'success'); await carregar('usuarios'); }, true);
  }
  async function reativar(x) { try { await api(`usuarios/${x.id}/reativar`, 'POST'); avisar(`${x.nome} reativado`, 'success'); await carregar('usuarios'); } catch (e) { avisar(e.message, 'error'); } }
  function cancelarConvite(x) {
    janela('Cancelar convite', h('p', { class: 'rl-nota' }, `O link enviado para ${x.nome} deixa de funcionar.`), 'Cancelar convite', async () => { await api('convites/' + x.id, 'DELETE'); avisar('Convite cancelado', 'success'); await carregar('usuarios'); }, true);
  }
  async function reenviar(x) {
    try { const r = await api(`convites/${x.id}/reenviar`, 'POST'); await carregar('usuarios');
      if (r.canal === 'email') avisar(`Convite reenviado para ${x.email}`, 'success'); else janela('Link novo para ' + x.nome, caixaLink(r, 'O link anterior deixou de valer. Este vale por 7 dias e só uma vez.')); }
    catch (e) { avisar(e.message, 'error'); }
  }
  async function linkSenha(x) {
    try { const r = await api(`usuarios/${x.id}/link-senha`, 'POST'); janela('Link de nova senha · ' + x.nome, caixaLink(r, 'Mande pelo WhatsApp: a pessoa abre, cria a nova senha e entra. Vale por 24 horas.')); }
    catch (e) { avisar(e.message, 'error'); }
  }
  function caixaLink(r, txt) {
    const copiar = async () => { try { await navigator.clipboard.writeText(r.link); avisar('Link copiado', 'success'); } catch (_) { inp.select(); document.execCommand && document.execCommand('copy'); avisar('Link copiado', 'success'); } };
    const inp = h('input', { class: 'em-in', readonly: true, value: r.link, 'aria-label': 'Link', onfocus: e => e.target.select() });
    const wa = h('a', { class: 'eq-bt pri wa', href: r.whatsapp, target: '_blank', rel: 'noopener noreferrer' }, ic('fa-brands fa-whatsapp'), ' Abrir WhatsApp');
    return h('div', { class: 'em-link' }, h('p', null, h('b', null, 'Link criado. '), txt), h('div', { class: 'em-link-l' }, inp, h('button', { class: 'eq-bt', onclick: copiar }, ic('fa-copy'), ' Copiar'), wa), h('div', { class: 'em-msg' }, r.mensagem));
  }

  /* convite */
  function janelaConvite() {
    const U = M.U, f = { nome: '', perfil: 'funcionario', canal: 'whatsapp', email: '', telefone: '', funcionario_id: '' };
    const nome = h('input', { class: 'em-in', id: 'cv-nome', placeholder: 'Nome da pessoa', oninput: e => f.nome = e.target.value });
    const email = h('input', { class: 'em-in', id: 'cv-email', type: 'email', placeholder: 'pessoa@empresa.com.br', oninput: e => { f.email = e.target.value; ajustar(); } });
    const fone = h('input', { class: 'em-in', id: 'cv-tel', inputmode: 'tel', placeholder: '(81) 99876-5432', oninput: e => { e.target.value = tel(e.target.value); f.telefone = e.target.value; ajustar(); } });
    const ficha = h('select', { class: 'em-in', id: 'cv-ficha', onchange: e => { f.funcionario_id = e.target.value; const x = U.fichas.find(p => String(p.id) === e.target.value);
      if (x) { nome.value = f.nome = x.nome; if (x.telefone) fone.value = f.telefone = x.telefone; if (x.email) { email.value = f.email = x.email; } ajustar(); } } },
      h('option', { value: '' }, U.fichas.length ? '— Sem ficha (só o acesso) —' : 'Todos da Equipe já têm acesso'), U.fichas.map(x => h('option', { value: x.id }, `${x.nome}${x.cargo ? ' · ' + x.cargo : ''}`)));
    const chips = h('div', { class: 'em-chips4', role: 'radiogroup', 'aria-label': 'Perfil' }, Object.entries(PERF).map(([k, p]) => h('button', { 'data-perfil': k, class: k === f.perfil ? 'on' : '', role: 'radio',
      onclick: e => { f.perfil = k; chips.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, h('b', null, p[0]), h('small', null, p[2]))));
    const canal = h('div', { class: 'em-canal' }, [['email', '✉️ Por e-mail'], ['whatsapp', '📱 Link para WhatsApp']].map(([k, t]) => h('button', { 'data-canal': k, class: k === f.canal ? 'on ' + k : k,
      onclick: e => { f.canal = k; canal.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget)); ajustar(); } }, t)));
    const rotEmail = h('span'), rotTel = h('span'), dica = h('p', { class: 'rl-nota' }), area = h('div');
    const ajustar = () => {
      rotEmail.textContent = f.canal === 'email' ? 'E-mail' : 'E-mail (opcional)';
      rotTel.textContent = f.canal === 'whatsapp' ? (f.email.trim() ? 'Celular (para abrir o WhatsApp)' : 'Celular · é com ele que a pessoa vai entrar') : 'Celular (opcional)';
      dica.textContent = f.canal === 'whatsapp' ? (f.email.trim() ? 'A pessoa entra com o e-mail e a senha que criar.' : 'Sem e-mail? Tudo bem: a pessoa entra com o número do celular e a senha que criar.') : 'O link chega no e-mail e vale por 7 dias.';
    };
    ajustar();
    const corpo = h('div', { class: 'em-conv' },
      h('div', { class: 'em-dois' }, h('label', { class: 'em-campo' }, h('span', null, 'Ligar à ficha da Equipe'), ficha), h('label', { class: 'em-campo' }, h('span', null, 'Nome'), nome)),
      h('div', { class: 'em-campo' }, h('span', null, 'Perfil'), chips), h('div', { class: 'em-campo' }, h('span', null, 'Como enviar'), canal),
      h('div', { class: 'em-dois' }, h('label', { class: 'em-campo' }, rotEmail, email), h('label', { class: 'em-campo' }, rotTel, fone)), dica, area);
    const fechar = janela('Convidar pessoa', corpo, 'Enviar convite', async bt => {
      const r = await api('convites', 'POST', { nome: f.nome.trim(), perfil: f.perfil, canal: f.canal, email: f.email.trim() || null, telefone: f.telefone || null, funcionario_id: f.funcionario_id ? +f.funcionario_id : null });
      await carregar('usuarios');
      if (r.canal === 'email') { avisar(`Convite enviado para ${f.email.trim()}`, 'success'); return true; }
      area.innerHTML = ''; area.append(caixaLink(r, `Mande pelo WhatsApp: a pessoa abre, cria a senha e já entra como ${PERF[f.perfil][0].toLowerCase()}. Vale por 7 dias e só uma vez.`));
      corpo.querySelectorAll('input, select, .em-chips4 button, .em-canal button').forEach(x => { if (!area.contains(x)) x.disabled = true; });
      bt.style.display = 'none'; area.scrollIntoView({ block: 'nearest' }); return false;
    });
  }

  /* ══ Empresa ═════════════════════════════════ */
  function abaEmpresa() {
    if (!M.E) return carregando();
    const E = M.E.empresa, P = M.E.pode_editar, f = { ...E };
    const campo = (k, t, extra) => h('label', { class: 'em-campo' + (extra && extra.cls ? ' ' + extra.cls : '') }, h('span', null, t),
      h('input', { class: 'em-in', id: 'emp-' + k, value: E[k] || '', disabled: !P, maxlength: extra && extra.max, inputmode: extra && extra.mode,
        oninput: e => { if (k === 'cnpj') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
          if (k === 'telefone') e.target.value = tel(e.target.value); f[k] = e.target.value; } }));
    const salvar = P ? h('button', { class: 'eq-bt pri', id: 'emp-salvar', onclick: async e => { e.target.disabled = true;
      try { await api('empresa', 'PATCH', { nome: f.nome, razao_social: f.razao_social, cnpj: f.cnpj, telefone: f.telefone, endereco: f.endereco, cidade: f.cidade, uf: f.uf, email_contato: f.email_contato, site: f.site });
        avisar('Dados da empresa salvos', 'success'); await carregar('empresa'); } catch (er) { avisar(er.message, 'error'); e.target.disabled = false; } } }, 'Salvar') : null;
    const cad = h('section', { class: 'em-sec' }, h('b', { class: 'em-sec-t' }, 'Cadastro da empresa'), h('small', null, 'Sai no cabeçalho do RDO e dos relatórios'),
      h('div', { class: 'em-dois' }, campo('nome', 'Nome fantasia', { max: 160 }), campo('razao_social', 'Razão social', { max: 200 }), campo('cnpj', 'CNPJ', { mode: 'numeric' }), campo('telefone', 'Telefone', { mode: 'tel' })),
      h('div', { class: 'em-end' }, campo('endereco', 'Endereço', { max: 200 }), campo('cidade', 'Cidade', { max: 100 }), campo('uf', 'UF', { max: 2 })),
      h('div', { class: 'em-dois' }, campo('email_contato', 'E-mail de contato'), campo('site', 'Site', { max: 120 })), salvar ? h('div', { class: 'em-bts' }, salvar) : null);
    const v = Date.now();
    const arq = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true, id: 'emp-logo-arq', onchange: e => trocarLogo(e.target.files[0]) });
    const logo = h('section', { class: 'em-sec' }, h('b', { class: 'em-sec-t' }, 'Logo'), h('small', null, 'Barra lateral e cabeçalho dos documentos'),
      h('div', { class: 'em-logo' }, E.tem_logo ? h('img', { src: 'api/empresa/logo?v=' + v, alt: 'Logo de ' + E.nome }) : h('span', null, 'Sem logo: os documentos saem com o nome da empresa')),
      E.tem_logo ? h('div', { class: 'em-cor' }, h('i', { style: `background:${E.logo_cor}` }), 'Cor do cabeçalho tirada da logo: ', h('b', null, E.logo_cor)) : null,
      P ? h('div', { class: 'em-bts esq' }, arq, h('button', { class: 'eq-bt', onclick: () => arq.click() }, ic('fa-image'), E.tem_logo ? ' Trocar logo' : ' Enviar logo'),
        E.tem_logo ? h('button', { class: 'eq-bt', onclick: tirarLogo }, 'Tirar') : null) : null, h('small', null, 'PNG ou JPG; fundo transparente fica melhor.'));
    const prev = h('section', { class: 'em-prev' }, h('small', null, 'COMO SAI NO CABEÇALHO'),
      h('div', { class: 'em-cabdoc', style: `border-bottom-color:${E.logo_cor}` }, E.tem_logo ? h('img', { src: 'api/empresa/logo?v=' + v, alt: '' }) : h('b', { style: `color:${E.logo_cor}` }, E.nome),
        h('div', { class: 'em-cabdoc-e' }, h('b', null, E.razao_social || E.nome), h('br'), [E.cnpj ? 'CNPJ ' + E.cnpj : '', E.cidade ? E.cidade + (E.uf ? '/' + E.uf : '') : ''].filter(Boolean).join(' · '), E.telefone ? [h('br'), E.telefone] : null),
        h('div', { class: 'em-cabdoc-t', style: `color:${E.logo_cor}` }, h('b', null, 'RELATÓRIO DIÁRIO DE OBRA'), h('small', null, 'Nº 128 · ' + dBRano(new Date().toISOString().slice(0, 10))))));
    return [h('div', { class: 'em-grade' }, cad, logo), prev];
  }
  async function trocarLogo(a) {
    if (!a) return;
    if (!/^image\/(png|jpeg|webp)$/.test(a.type)) return avisar('Envie a logo em PNG ou JPG', 'error');
    const dados = await new Promise((res, rej) => { const url = URL.createObjectURL(a), img = new Image();
      img.onload = () => { const k = Math.min(1, 1200 / img.naturalWidth, 400 / img.naturalHeight), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png')); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Não consegui abrir a imagem')); }; img.src = url; }).catch(e => { avisar(e.message, 'error'); return null; });
    if (!dados) return;
    try { await api('empresa/logo', 'POST', { dados }); avisar('Logo atualizada', 'success'); window.tfLogoEmpresa && tfLogoEmpresa(true); await carregar('empresa'); } catch (e) { avisar(e.message, 'error'); }
  }
  async function tirarLogo() { try { await api('empresa/logo', 'DELETE'); avisar('Logo retirada', 'success'); window.tfLogoEmpresa && tfLogoEmpresa(false); await carregar('empresa'); } catch (e) { avisar(e.message, 'error'); } }

  /* ══ Calendário padrão ═══════════════════════ */
  function abaCalendario() {
    if (!M.C) return carregando();
    const C = M.C, P = C.pode_editar, mob = celular();
    const dias = h('section', { class: 'em-sec' }, h('b', { class: 'em-sec-t' }, 'Semana de trabalho'), h('small', null, 'Toda obra sem calendário próprio segue este'),
      DIAS.map((d, i) => { const on = M.Choras[i] > 0;
        return h('div', { class: 'em-dia' + (on ? '' : ' off') }, h('b', null, d), interruptor(on, !P, v => { M.Choras[i] = v ? (i === 5 ? 4 : 8) : 0; desenhar(); }, 'Trabalha ' + d),
          on ? h('label', { class: 'em-horas' }, h('input', { class: 'em-in', type: 'number', min: '0.5', max: '24', step: '0.5', value: M.Choras[i], disabled: !P, 'aria-label': 'Horas de ' + d, onchange: e => { M.Choras[i] = Math.max(0, Math.min(24, +e.target.value || 0)); } }), ' horas') : h('span', { class: 'cz' }, 'sem expediente')); }),
      h('p', { class: 'em-nota' }, `Usado por ${C.obras} obra${C.obras === 1 ? '' : 's'}. Ao salvar, o sistema mostra quantas atividades ainda não iniciadas mudam de data.`));
    const nac = Object.entries(C.nacionais).map(([d, n]) => ({ inicio: d, fim: d, nome: n, nacional: true }));
    const todos = [...(M.Cnac ? nac : []), ...M.Cdias.map((x, i) => ({ ...x, i }))].sort((a, z) => (a.todo_ano ? a.inicio.slice(5) : a.inicio.slice(5)).localeCompare(z.todo_ano ? z.inicio.slice(5) : z.inicio.slice(5)));
    const nova = { inicio: '', fim: '', nome: '', tipo: 'feriado', todo_ano: false };
    const add = P ? h('div', { class: 'em-add' }, h('input', { class: 'em-in', type: 'date', 'aria-label': 'Data', oninput: e => nova.inicio = e.target.value }),
      h('input', { class: 'em-in', type: 'date', 'aria-label': 'Até (opcional)', title: 'Até (para paradas de vários dias)', oninput: e => nova.fim = e.target.value }),
      h('input', { class: 'em-in', placeholder: 'Nome (ex.: São João)', 'aria-label': 'Nome do feriado', oninput: e => nova.nome = e.target.value }),
      h('label', { class: 'em-chk' }, h('input', { type: 'checkbox', onchange: e => nova.todo_ano = e.target.checked }), ' todo ano'),
      h('button', { class: 'eq-bt', onclick: () => { if (!nova.inicio || !nova.nome.trim()) return avisar('Informe a data e o nome', 'error'); if (nova.fim && nova.fim < nova.inicio) return avisar('O fim não pode ser antes do início', 'error');
        M.Cdias.push({ inicio: nova.inicio, fim: nova.fim || nova.inicio, nome: nova.nome.trim(), tipo: nova.fim && nova.fim !== nova.inicio ? 'parado' : 'feriado', todo_ano: nova.todo_ano }); desenhar(); } }, ic('fa-plus'), ' Adicionar')) : null;
    const fer = h('section', { class: 'em-sec' }, h('b', { class: 'em-sec-t' }, `Feriados e paradas · ${C.ano}`), h('small', null, 'Nacionais automáticos + os da cidade e da empresa'),
      h('div', { class: 'em-dia' }, h('span', null, 'Feriados nacionais automáticos'), interruptor(M.Cnac, !P, v => { M.Cnac = v; desenhar(); }, 'Feriados nacionais')),
      h('div', { class: 'em-fer' }, todos.length ? todos.map(x => h('div', { class: 'em-fer-l' }, h('b', null, x.fim && x.fim !== x.inicio ? `${dBR(x.inicio)} a ${dBR(x.fim)}` : dBR(x.inicio)), h('span', null, x.nome),
        x.nacional ? selo('Nacional', 'az') : selo(x.todo_ano ? 'Todo ano' : x.tipo === 'parado' ? 'Parada' : 'Empresa', x.todo_ano ? 'ven' : 'rx'),
        P && !x.nacional ? h('button', { class: 'em-x2', 'aria-label': 'Tirar ' + x.nome, onclick: () => { M.Cdias.splice(x.i, 1); desenhar(); } }, ic('fa-xmark')) : h('i'))) : h('p', { class: 'eq-vazio' }, 'Nenhum feriado.')), add);
    const salvar = P ? h('div', { class: 'em-bts' }, h('button', { class: 'eq-bt pri', id: 'cal-salvar', onclick: salvarCalendario }, 'Salvar calendário')) : null;
    return [h('div', { class: 'em-grade cal' }, dias, fer), salvar];
  }
  async function salvarCalendario() {
    const corpo = { horas_semana: M.Choras, feriados_nacionais: M.Cnac, dias: M.Cdias.map(({ inicio, fim, nome, tipo, todo_ano }) => ({ inicio, fim, nome, tipo, todo_ano })) };
    try {
      const s = await api('empresa/calendario', 'PUT', { ...corpo, simular: true });
      const go = async () => { const r = await api('empresa/calendario', 'PUT', corpo); avisar(r.mudaram ? `Calendário salvo · ${r.mudaram} atividade${r.mudaram > 1 ? 's' : ''} com data nova` : 'Calendário salvo', 'success'); await carregar('calendario'); };
      if (!s.mudam) return go();
      janela('Salvar o calendário', h('p', { class: 'rl-nota' }, `${s.mudam} atividade${s.mudam > 1 ? 's' : ''} ainda não iniciada${s.mudam > 1 ? 's' : ''} em ${s.obras} obra${s.obras > 1 ? 's' : ''} ${s.mudam > 1 ? 'terão' : 'terá'} o fim recalculado com os novos dias de trabalho. As já iniciadas não mudam.`), 'Salvar e recalcular', go);
    } catch (e) { avisar(e.message, 'error'); }
  }
  function interruptor(on, off, fn, rot) {
    return h('button', { class: 'em-sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': rot, disabled: off, onclick: () => fn(!on) }, h('i'));
  }

  /* ══ Regras do campo ═════════════════════════ */
  function abaRegras() {
    if (!M.E) return carregando();
    const R = M.E.regras, P = M.E.pode_editar;
    const salvar = async (k, v) => { try { const r = await api('empresa/regras', 'PUT', { [k]: v }); M.E.regras = r.regras; avisar('Regra salva', 'success'); desenhar(); } catch (e) { avisar(e.message, 'error'); desenhar(); } };
    const regra = (k, t, d, extra) => h('div', { class: 'em-regra' }, h('div', null, h('b', null, t), h('small', null, d), extra || null), interruptor(!!R[k], !P, v => salvar(k, v), t));
    const sel = (k, ops) => h('select', { class: 'em-in em-sel', disabled: !P, 'aria-label': k, onchange: e => salvar(k, isNaN(+e.target.value) ? e.target.value : +e.target.value) }, ops.map(([v, t]) => h('option', { value: v, selected: String(R[k]) === String(v) }, t)));
    const FOTO = [['funcionario', 'Funcionário'], ['campo', 'Funcionário e encarregado'], ['todos', 'Todos os perfis'], ['ninguem', 'Ninguém (foto opcional)']];
    return h('section', { class: 'eq-painel em-regras' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Regras do campo'), h('small', null, 'Valem para todas as obras' + (P ? ' · salvam na hora' : '')))),
      h('div', { class: 'em-grupo' }, 'AVANÇO E TRAVOU'),
      h('div', { class: 'em-regra' }, h('div', null, h('b', null, 'Foto obrigatória no avanço'), h('small', null, 'Sem foto o botão Salvar fica desligado para quem a regra pega.'), sel('foto', FOTO)), h('i')),
      regra('comentario_concluir', 'Comentário obrigatório ao concluir', 'Pede uma frase sobre o que foi entregue ao marcar 100%.'),
      regra('travou_email', 'Travou avisa o gestor por e-mail', 'Além do aviso no sistema, manda e-mail ao gestor da obra.'),
      h('div', { class: 'em-grupo' }, 'RDO'),
      h('div', { class: 'em-regra' }, h('div', null, h('b', null, 'Prazo para fazer o RDO'), h('small', null, 'Depois disso o dia sem RDO aparece como pendente em vermelho.'),
        sel('rdo_prazo', [[1, 'Até o dia útil seguinte'], [2, 'Até 2 dias úteis'], [3, 'Até 3 dias úteis'], [5, 'Até 5 dias úteis']])), h('i')),
      regra('rdo_lembrete', 'Lembrete ao encarregado', 'A partir das 16h, Minhas atividades avisa se o RDO do dia ainda não foi enviado.'),
      regra('rdo_assinatura', 'Assinatura do cliente obrigatória', 'O RDO só sai das pendências com a foto da folha assinada.'),
      h('div', { class: 'em-grupo' }, 'METAS DOS INDICADORES'),
      ...[['meta_ppc', 'PPC · plano semanal cumprido', 'Percentual mínimo dos compromissos da semana cumpridos (Last Planner costuma usar 80%).', '%', 1],
          ['meta_idp', 'IDP · desempenho de prazo', 'Abaixo disso a obra é marcada fora do prazo (1,00 = exatamente no plano).', '', 0.01],
          ['meta_idc', 'IDC · desempenho de custo', 'Abaixo disso o custo fica em atenção (1,00 = gastando o orçado).', '', 0.01],
          ['meta_destravar', 'Tempo para destravar', 'Máximo de dias para a gestão liberar um Travou.', 'dias', 0.5],
          ['meta_conformidade', 'Conformidade SST', 'Percentual mínimo das pessoas em campo com a documentação em dia.', '%', 1],
          ['meta_retrabalho', 'Atividades sem retrabalho', 'Percentual mínimo das atividades trabalhadas sem refazer serviço.', '%', 1]].map(([k, t, d, un, passo]) =>
        h('div', { class: 'em-regra' }, h('div', null, h('b', null, t), h('small', null, d)),
          h('span', { class: 'em-meta' }, h('input', { type: 'number', class: 'em-in', step: passo, value: R[k], disabled: !P, 'aria-label': 'Meta de ' + t, onchange: e => salvar(k, e.target.value) }), un ? h('small', null, un) : null))));
  }

  /* ══ Plano ═══════════════════════════════════ */
  function abaPlano() {
    if (!M.P) return carregando();
    const P = M.P, p = P.plano, U = P.uso;
    const barra = (t, [a, b], un) => { const pct = b ? Math.min(100, Math.round(a / b * 100)) : 8;
      return h('div', { class: 'em-uso' }, h('div', null, h('span', null, t), h('b', null, `${String(a).replace('.', ',')}${un || ''}`), h('small', null, b ? ` de ${b}${un || ''}` : ' · sem limite')),
        h('div', { class: 'em-barra' }, h('i', { style: `width:${pct}%; background:${b && pct >= 90 ? '#dc2626' : b ? '#2563eb' : '#16a34a'}` }))); };
    const sit = { ativo: ['Ativo', 'ok'], teste: ['Em teste', 'ven'], suspenso: ['Suspenso', 'vc'] }[P.situacao] || [P.situacao, 'cz'];
    const card = h('section', { class: 'em-plano' }, h('div', { class: 'em-plano-t' }, h('div', null, h('small', null, 'PLANO ATUAL'), h('b', null, p.nome), p.preco ? h('span', null, ` R$ ${p.preco}/mês`) : null), selo(...sit)),
      h('small', { class: 'cz' }, `Cliente desde ${dBRano(P.cliente_desde)} · cobrança pela Mercurium`),
      barra('Obras em andamento', U.obras), barra('Usuários de escritório (adm. e gestor)', U.escritorio), barra('Usuários de campo', U.campo), barra('Fotos e certificados', U.espaco_gb, ' GB'),
      p.gestao_vista ? null : h('p', { class: 'em-nota' }, h('b', null, 'Sem: '), 'Início (gestão à vista de todas as obras), disponível nos planos Empresa e Corporativo.'),
      h('div', { class: 'em-bts esq' }, h('button', { class: 'eq-bt', onclick: verPlanos }, 'Ver os planos'),
        h('button', { class: 'eq-bt pri', onclick: () => window.tfContato ? tfContato() : avisar('Use o link Fale conosco no rodapé', 'info') }, ic('fa-comments'), ' Falar com a Mercurium')));
    return card;
  }
  function verPlanos() {
    const L = M.P.planos.filter(x => x.id !== 'teste'), lim = v => v == null ? 'ilimitado' : v;
    janela('Planos do Aprumo', h('div', { class: 'em-planos' }, L.map(x => h('div', { class: 'em-pl' + (x.id === M.P.plano.id ? ' on' : '') }, h('b', null, x.nome), h('span', null, x.preco ? `R$ ${x.preco.toLocaleString('pt-BR')}/mês` : 'sob consulta'),
      h('small', null, `Obras: ${lim(x.obras)}`), h('small', null, `Escritório: ${lim(x.escritorio)}`), h('small', null, 'Campo: ilimitado'), h('small', null, `Fotos: ${x.gb ? x.gb + ' GB' : 'sob medida'}`), h('small', null, x.gestao_vista ? '✓ Gestão à vista' : '— Gestão à vista'),
      x.id === M.P.plano.id ? selo('Seu plano', 'ok') : null))), null, null);
  }

  /* ── janela ──────────────────────────────────── */
  function janela(titulo, corpo, okTxt, aoOk, perigo) {
    const fundo = h('div', { class: 'eq-fundo', role: 'presentation' });
    const bt = okTxt ? h('button', { class: 'eq-bt pri' + (perigo ? ' em-perigo' : ''), id: 'em-ok' }, okTxt) : null;
    const j = h('div', { class: 'eq-jan em-jan', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div', { class: 'eq-jan-cab' }, h('h2', null, titulo), h('button', { class: 'eq-x', 'aria-label': 'Fechar', onclick: () => fechar() }, ic('fa-xmark'))),
      h('div', { class: 'eq-jan-corpo' }, h('div', { class: 'em-jan-pad' }, corpo)), h('div', { class: 'eq-acoes' }, h('button', { class: 'eq-bt', onclick: () => fechar() }, okTxt ? (perigo ? 'Voltar' : 'Cancelar') : 'Fechar'), bt));
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') fechar(); };
    if (bt && aoOk) bt.onclick = async () => { bt.disabled = true; try { const r = await aoOk(bt); if (r !== false) fechar(); else { const c = j.querySelector('.eq-acoes .eq-bt'); if (c) c.textContent = 'Fechar'; } } catch (e) { avisar(e.message, 'error'); } bt.disabled = false; };
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', esc); fundo.append(j); document.body.append(fundo);
    setTimeout(() => j.querySelector('input:not([disabled]), select')?.focus(), 30);
    return fechar;
  }

  /* ── ligação com o menu ─────────────────────── */
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome === 'empresa') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Empresa e usuários'; const v = tfEstado.primeira('empresa'); if (v && tfEstado.voltando) { for (const k of ['busca', 'perfil', 'sit']) if (v[k] != null) M[k] = v[k]; if (['usuarios', 'empresa', 'calendario', 'regras', 'plano'].includes(v.aba)) M.aba = v.aba; } desenhar(); carregar(); }
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); desenhar(); } }; })());
  const abrirMenu = aba => { if (aba) M.aba = aba; window.switchView('empresa', document.getElementById('nav-empresa')); };
  window.tfEmpresa = { abrir: abrirMenu, estado: M };
})();
