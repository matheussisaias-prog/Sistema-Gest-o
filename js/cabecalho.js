/* Aprumo · cabecalho.js — peças fixas do topo: busca (atividades e obras de todas as obras), sininho com o que precisa
   de atenção agora (Travou, atrasos, RDO, documentos) e o botão do calendário levando para Empresa › Calendário. */
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
  const dBR = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '';
  const eu = () => (window.tfServidor && tfServidor.estado && tfServidor.estado.usuario) || {};
  const gestao = () => ['administrador', 'gestor'].includes(eu().perfil);
  async function api(rota) {
    const r = await fetch('api/' + rota, { credentials: 'same-origin', cache: 'no-store' }); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(j.erro || 'Não foi possível carregar.'); return j;
  }
  async function abrirAtividade(pid, aid) {
    if (!window.tfObra || !pid) return;
    await tfObra.abrir(pid);
    if (aid) { const a = ((tfObra.estado.d || {}).atividades || []).find(x => x.id === aid); if (a) tfObra.painel(a); }
  }
  const fecharTudo = () => { document.querySelectorAll('.tf-pop').forEach(p => p.remove()); document.getElementById('notif-btn')?.setAttribute('aria-expanded', 'false'); };
  document.addEventListener('click', e => { if (!e.target.closest('.tf-pop, #notif-btn, .header-search')) fecharTudo(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharTudo(); });

  /* ── busca do topo ─────────────────────────── */
  function resultados(q) {
    const t = sem(q).trim(); if (t.length < 2) return [];
    const P = (typeof projects !== 'undefined' ? projects : []), A = (typeof activities !== 'undefined' ? activities : []);
    const obras = P.filter(p => sem(p.name + ' ' + p.code + ' ' + (p.client || '')).includes(t)).slice(0, 4)
      .map(p => ({ tipo: 'obra', titulo: (p.code ? p.code + ' · ' : '') + p.name, sub: 'Obra', ir: () => window.tfObra && tfObra.abrir(p._sid) }));
    const ativ = A.filter(a => sem(a.description + ' ' + (a.responsible || '')).includes(t)).slice(0, 8).map(a => {
      const p = P.find(x => x.id === a.projectId) || {};
      return { tipo: 'ativ', titulo: a.description, sub: [p.code || a.project, a.responsible, a.dueDate ? 'até ' + dBR(a.dueDate) : '', a.status === 'Vencido' ? 'atrasada' : ''].filter(Boolean).join(' · '),
               atras: a.status === 'Vencido', ir: () => abrirAtividade(p._sid, a._sid) };
    });
    return [...obras, ...ativ];
  }
  function ligarBusca() {
    const caixa = document.querySelector('.header > .header-search'), inp = caixa && caixa.querySelector('input'); if (!inp || inp.dataset.ligado) return;
    inp.dataset.ligado = '1'; inp.type = 'search'; inp.placeholder = 'Buscar atividade ou obra…'; inp.setAttribute('aria-label', 'Buscar atividade ou obra em todas as obras');
    let sel = 0, lista = [];
    const desenhar = () => {
      document.querySelectorAll('.tf-busca').forEach(p => p.remove());
      if (!inp.value.trim()) return;
      lista = resultados(inp.value); sel = Math.min(sel, Math.max(0, lista.length - 1));
      const pop = h('div', { class: 'tf-pop tf-busca', role: 'listbox' },
        lista.length ? lista.map((r, i) => h('button', { class: 'tf-pop-item' + (i === sel ? ' sel' : ''), role: 'option', onmousedown: e => { e.preventDefault(); escolher(i); } },
          h('span', { class: 'tf-pop-i ' + (r.tipo === 'obra' ? 'az' : r.atras ? 'vm' : 'cz') }, ic(r.tipo === 'obra' ? 'fa-building' : 'fa-list-check')),
          h('span', { class: 'tf-pop-t' }, h('b', null, r.titulo), h('small', null, r.sub))))
          : h('p', { class: 'tf-pop-vazio' }, inp.value.trim().length < 2 ? 'Digite pelo menos 2 letras.' : 'Nada encontrado.'));
      caixa.append(pop);
    };
    const escolher = i => { const r = lista[i]; if (!r) return; inp.value = ''; inp.blur(); fecharTudo(); r.ir(); };
    let t; inp.addEventListener('input', () => { clearTimeout(t); sel = 0; t = setTimeout(desenhar, 120); });
    inp.addEventListener('focus', () => { if (inp.value.trim()) desenhar(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, Math.min(lista.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); desenhar(); }
      else if (e.key === 'Enter') { e.preventDefault(); escolher(sel); }
    });
    // atalho: "/" em qualquer lugar (fora de campos) vai para a busca
    document.addEventListener('keydown', e => { if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); inp.focus(); } });
  }

  /* ── sininho ────────────────────────────────── */
  const S = { itens: [], quando: 0, carregando: false };
  const irLink = l => { const m = /^obra:(\d+)(?::(\d+))?/.exec(l || ''); if (m) abrirAtividade(+m[1], m[2] ? +m[2] : null); };
  async function novidades() {          // avisos guardados para a pessoa (Travou na obra dela, acidente…), lidos ou não
    try { const r = await api('avisos'); S.naoLidos = r.nao_lidos; return r.avisos.slice(0, 8).map(a => ({ novo: !a.lido, cls: a.tipo === 'ocorrencia' ? 'vm' : 'az', ico: a.tipo === 'ocorrencia' ? 'fa-bell' : 'fa-circle-info', titulo: a.titulo,
      sub: new Date(a.criado_em.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), quando: a.lido ? '' : 'novo', ir: () => irLink(a.link) })); }
    catch (_) { S.naoLidos = 0; return []; }
  }
  async function avisos() {
    const out = [];
    if (gestao()) {
      const d = await api('inicio');
      for (const a of d.atrasos) out.push(a.tipo === 'travou'
        ? { cls: 'vm', ico: 'fa-hand', titulo: `Travou · ${a.atividade || 'atividade'}`, sub: `${a.obra} · ${a.motivo}${a.descricao ? ': ' + a.descricao : ''}`, quando: a.dias ? `há ${a.dias} d` : 'hoje', ir: () => abrirAtividade(a.projeto_id, a.atividade_id) }
        : { cls: 'am', ico: 'fa-clock', titulo: `Atrasada · ${a.atividade}`, sub: `${a.obra} · ${a.responsavel || 'sem responsável'} · ${a.avanco}%`, quando: `${a.dias} d`, ir: () => abrirAtividade(a.projeto_id, a.atividade_id) });
      const rdo = d.pendencias.filter(p => p.tipo !== 'sem'), semRdo = d.pendencias.filter(p => p.tipo === 'sem');
      for (const p of rdo.slice(0, 6)) out.push({ cls: 'rx', ico: 'fa-clipboard-list', titulo: `RDO de ${dBR(p.data)} · ${p.obra}`, sub: { rasc: p.enviado ? 'enviado pelo encarregado, falta fechar' : 'em rascunho', fech: 'fechado, falta entregar ao cliente', entr: 'entregue, falta a folha assinada' }[p.tipo] || '', quando: '', ir: () => window.tfRdo && tfRdo.abrirRdo(p.id) });
      if (semRdo.length) out.push({ cls: 'rx', ico: 'fa-calendar-xmark', titulo: semRdo.length > 1 ? `${semRdo.length} dias úteis sem RDO` : '1 dia útil sem RDO', sub: [...new Set(semRdo.map(p => p.obra))].join(' · '), quando: '', ir: () => window.tfRdo && tfRdo.abrir() });
      const pessoas = [...new Set(d.documentos.map(v => v.pessoa))];
      if (pessoas.length) out.push({ cls: 'am', ico: 'fa-helmet-safety', titulo: `${pessoas.length} pessoa${pessoas.length > 1 ? 's' : ''} em obra com documento vencido ou faltando`, sub: pessoas.slice(0, 3).join(' · ') + (pessoas.length > 3 ? '…' : ''), quando: '', ir: () => window.tfEquipe && tfEquipe.abrir() });
    } else {
      const d = await api('minhas-atividades');
      for (const a of d.grupos.atrasadas) out.push({ cls: a.travada ? 'vm' : 'am', ico: a.travada ? 'fa-hand' : 'fa-clock', titulo: (a.travada ? 'Travou · ' : 'Atrasada · ') + a.descricao, sub: `${a.codigo || a.obra} · ${a.avanco}%`, quando: `${a.atraso_dias} d`, ir: () => window.tfMinhas && tfMinhas.abrir() });
      for (const a of d.grupos.hoje.filter(x => x.travada)) out.push({ cls: 'vm', ico: 'fa-hand', titulo: 'Travou · ' + a.descricao, sub: a.codigo || a.obra, quando: 'hoje', ir: () => window.tfMinhas && tfMinhas.abrir() });
    }
    return out;
  }
  async function atualizar(forcar) {
    if (S.carregando || (!forcar && Date.now() - S.quando < 60000)) return;
    S.carregando = true;
    try { const [a, n] = await Promise.all([avisos(), novidades()]); S.itens = a; S.novidades = n; S.quando = Date.now(); S.erro = null; } catch (e) { S.erro = e.message; }
    S.carregando = false; contador();
    if (document.querySelector('.tf-sino')) abrirSino(true);
  }
  function contador() {
    const b = document.getElementById('notif-btn'), dot = document.getElementById('notif-dot'); if (!b || !dot) return;
    const n = S.itens.length + (S.naoLidos || 0);
    dot.textContent = n > 99 ? '99+' : n ? String(n) : ''; dot.classList.toggle('tem', n > 0); dot.hidden = !n;
    const t = n ? `${n} aviso${n > 1 ? 's' : ''} pedindo atenção` : 'Nenhum aviso';
    b.setAttribute('data-tooltip', t); b.setAttribute('aria-label', t);
  }
  const item = it => h('button', { class: 'tf-pop-item' + (it.novo ? ' novo' : ''), onclick: () => { fecharTudo(); it.ir(); } },
    h('span', { class: 'tf-pop-i ' + it.cls }, ic(it.ico)), h('span', { class: 'tf-pop-t' }, h('b', null, it.titulo), h('small', null, it.sub)), it.quando ? h('span', { class: 'tf-pop-q' }, it.quando) : null);
  function abrirSino(manter) {
    const b = document.getElementById('notif-btn'); if (!b) return;
    const aberto = document.querySelector('.tf-sino');
    if (aberto && !manter) { fecharTudo(); return; }
    fecharTudo(); b.setAttribute('aria-expanded', 'true');
    const n = S.itens.length;
    if (S.naoLidos && !manter) fetch('api/avisos/lidos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(() => { S.naoLidos = 0; contador(); }).catch(() => {});   // abriu o sininho: novidades lidas
    const pop = h('div', { class: 'tf-pop tf-sino', role: 'dialog', 'aria-label': 'Avisos' },
      h('div', { class: 'tf-pop-cab' }, h('b', null, 'Avisos'), h('small', null, S.carregando && !S.quando ? 'carregando…' : n ? `${n} pedindo atenção` : 'tudo em dia'),
        h('button', { class: 'tf-pop-x', 'aria-label': 'Atualizar', title: 'Atualizar', onclick: () => atualizar(true) }, ic('fa-rotate'))),
      S.erro ? h('p', { class: 'tf-pop-vazio' }, S.erro) : null,
      !n && !(S.novidades || []).length && S.quando ? h('p', { class: 'tf-pop-vazio ok' }, ic('fa-circle-check'), ' Nada atrasado, travado ou pendente.') : null,
      h('div', { class: 'tf-pop-lista' },
        (S.novidades || []).length ? [h('p', { class: 'tf-pop-sec' }, 'Novidades'), S.novidades.map(item)] : null,
        S.itens.length ? [h('p', { class: 'tf-pop-sec' }, 'Pedindo atenção agora'), S.itens.slice(0, 40).map(item)] : null),
      gestao() ? h('button', { class: 'tf-pop-pe', onclick: () => { fecharTudo(); window.tfInicio && tfInicio.abrir(); } }, 'Ver tudo no Início ', ic('fa-arrow-right')) : null);
    document.body.append(pop);
    // abre logo abaixo do sininho, sem passar da borda da tela
    const r = b.getBoundingClientRect(), w = Math.min(420, window.innerWidth - 24);
    pop.style.top = (r.bottom + 8) + 'px'; pop.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w + 40)) + 'px'; pop.style.width = w + 'px';
  }

  /* ── ligação ────────────────────────────────── */
  window.toggleNotif = () => { abrirSino(); atualizar(); };
  function ligar() {
    ligarBusca();
    const cal = document.querySelector('.header .hdr-cal');
    if (cal) {
      if (gestao()) { cal.onclick = () => window.tfEmpresa ? tfEmpresa.abrir('calendario') : openModal('modal-config-cal'); cal.setAttribute('data-tooltip', 'Calendário e feriados'); cal.setAttribute('aria-label', 'Calendário e feriados'); }
      else cal.style.display = 'none';   // calendário é configuração da gestão
    }
    const b = document.getElementById('notif-btn'); if (b) { b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); }
    atualizar(true); setInterval(() => atualizar(), 5 * 60000);
  }
  // espera o usuário carregar (tfServidor.estado.usuario) para saber o perfil
  const esperar = setInterval(() => { if (eu().perfil) { clearInterval(esperar); ligar(); } }, 300);
  window.tfCabecalho = { atualizar: () => atualizar(true), estado: S, resultados };
})();
