/* Aprumo · relatorios.js — tela "Relatórios": os 4 tipos (obra para o cliente, gerencial, Equipe e SST, Recursos e locação),
   formulário com período, seções e resumo do gestor, prévia ao lado (o mesmo A4 que sai impresso), emissão numerada com
   conteúdo congelado, lista dos emitidos (Abrir / Excel). Usa as peças visuais da Equipe (eq-*) e as próprias (rl-*). */
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
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
  const celular = () => window.innerWidth <= 760;
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
  const raiz = () => document.getElementById('view-relatorio');
  async function api(rota, metodo, dados, texto) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op);
    if (texto && r.ok) return r.text();
    let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const iso = d => d.toISOString().slice(0, 10);
  const dia = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const TIPOS = {
    obra: { t: 'Obra para o cliente', d: 'Avanço real × previsto, curva S, feito e atrasado, Travou, fotos e próximos passos.', cor: '#2563eb', i: 'fa-helmet-safety' },
    gerencial: { t: 'Gerencial de todas as obras', d: 'Farol de cada obra, atraso, avanço, RDOs pendentes, equipe e conflitos de recursos.', cor: '#0f172a', i: 'fa-chart-column' },
    sst: { t: 'Equipe e SST', d: 'Documentos de NR vencidos e vencendo, ausências e carga por pessoa no período.', cor: '#16a34a', i: 'fa-user-shield' },
    recursos: { t: 'Recursos e locação', d: 'Uso dos equipamentos, conflitos, calibração e custo de locação por obra.', cor: '#d97706', i: 'fa-truck-pickup' },
  };
  const SECOES = [['curva', 'Avanço real × previsto e curva S'], ['feito', 'Atividades concluídas e em andamento no período'], ['atrasadas', 'Atrasadas e impedimentos (Travou)'],
    ['fotos', 'Fotos do período (até 12, primeiro as dos avanços)'], ['proximas', 'Próximas 2 semanas'], ['rdos', 'RDOs do período (lista)']];
  const PERIODOS = [['semana', 'Semana passada'], ['mes', 'Este mês'], ['mes_ant', 'Mês passado']];

  const M = { d: null, erro: null, f: null, filtro: '' };
  function periodo(k, hoje) {
    if (k === 'semana') { const dw = (new Date(hoje + 'T12:00:00Z').getUTCDay() + 6) % 7; const seg = dia(hoje, -dw - 7); return [seg, dia(seg, 6)]; }
    if (k === 'mes') return [hoje.slice(0, 8) + '01', hoje];
    const ini = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 2, 1)), fim = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, 0));
    return [iso(ini), iso(fim)];
  }

  /* ── carga ──────────────────────────────────── */
  async function carregar() {
    try { M.d = await api('relatorios'); M.erro = null; } catch (e) { M.erro = e.message; }
    desenhar();
  }
  function novo(tipo) {
    const hoje = M.d.hoje, pk = tipo === 'obra' ? 'semana' : 'mes', [ini, fim] = periodo(pk, hoje);
    const ob = M.d.obras.find(o => o.situacao === 'Em andamento') || M.d.obras[0];
    M.f = { tipo, projeto_id: ob ? ob.id : null, per: pk, inicio: ini, fim, secoes: ['curva', 'feito', 'atrasadas', 'fotos', 'proximas'], resumo: '', editado: false, html: null, conteudo: null, carregando: false };
    desenhar(); window.scrollTo(0, 0); atualizar(true);
  }

  /* ── desenho ────────────────────────────────── */
  function desenhar() {
    const R = raiz(); if (!R || !R.classList.contains('active')) return;
    R.innerHTML = '';
    const box = h('div', { class: 'eq rl' }); R.append(box);
    if (!M.d) { box.append(h('p', { class: 'eq-vazio' }, M.erro || 'Carregando…')); return; }
    box.append(...(M.f ? formulario() : lista()).filter(Boolean));
  }
  function lista() {
    const mob = celular();
    const cab = h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, 'Relatórios'), h('p', null, 'Documento A4 com a logo da empresa + planilha Excel com os números')));
    const cards = h('div', { class: 'rl-tipos' }, Object.entries(TIPOS).map(([k, x]) => {
      const sem = k === 'obra' && !M.d.obras.length;
      return h('button', { class: 'rl-tipo', style: `border-top-color:${x.cor}`, disabled: sem, onclick: () => novo(k), 'data-tipo': k },
        h('span', { class: 'rl-tipo-i', style: `color:${x.cor}` }, ic(x.i)), h('b', null, x.t), mob ? null : h('span', { class: 'rl-tipo-d' }, sem ? 'Cadastre uma obra primeiro.' : x.d),
        h('span', { class: 'rl-tipo-bt' }, 'Gerar ', ic('fa-arrow-right')));
    }));
    const E = M.d.emitidos.filter(r => !M.filtro || r.tipo === M.filtro);
    const filtros = h('div', { class: 'rl-filtro' }, [['', 'Todos'], ...Object.entries(TIPOS).map(([k, x]) => [k, k === 'obra' ? 'Obra' : k === 'gerencial' ? 'Gerencial' : k === 'sst' ? 'SST' : 'Recursos'])]
      .map(([k, t]) => h('button', { class: M.filtro === k ? 'on' : '', onclick: () => { M.filtro = k; desenhar(); } }, t)));
    const acoes = r => h('span', { class: 'rl-acoes' },
      h('button', { class: 'eq-bt', onclick: () => abrirDoc(r.id), 'aria-label': 'Abrir ' + r.referencia }, ic('fa-file-lines'), mob ? null : ' Abrir'),
      h('a', { class: 'eq-bt', href: `api/relatorios/${r.id}/excel`, download: r.referencia + '.xlsx', 'aria-label': 'Excel ' + r.referencia }, ic('fa-file-excel'), mob ? null : ' Excel'),
      M.d.pode_excluir ? h('button', { class: 'eq-bt rl-x', onclick: () => excluir(r), 'aria-label': 'Excluir ' + r.referencia, title: 'Excluir' }, ic('fa-trash-can')) : null);
    const quando = r => `${dBR(r.emitido_em.slice(0, 10))} ${r.emitido_em.slice(11, 16)}`;
    let corpo;
    if (!E.length) corpo = h('p', { class: 'eq-vazio' }, M.filtro ? 'Nenhum relatório deste tipo ainda.' : 'Nenhum relatório emitido ainda. Escolha um tipo acima para gerar o primeiro.');
    else if (mob) corpo = h('div', { class: 'rl-cards' }, E.map(r => h('div', { class: 'rl-card' },
      h('div', null, h('b', null, r.referencia), h('small', null, `${r.tipo_nome} · ${r.obra}`), h('small', null, `${r.periodo} · ${r.emitido_por || '—'} · ${quando(r)}`)), acoes(r))));
    else corpo = h('div', { class: 'rl-tab' }, h('div', { class: 'rl-lin rl-th' }, ['Nº', 'Relatório', 'Obra', 'Período', 'Emitido por', 'Quando', ''].map(t => h('span', null, t))),
      E.map(r => h('div', { class: 'rl-lin' }, h('b', null, r.referencia), h('span', null, r.tipo_nome), h('span', null, r.obra), h('span', null, r.periodo), h('span', { class: 'cz' }, r.emitido_por || '—'), h('span', { class: 'cz' }, quando(r)), acoes(r))));
    const hist = h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Relatórios emitidos'), h('small', null, 'Ficam guardados como foram entregues (conteúdo congelado). Abrir de novo mostra igual.')), mob ? null : filtros), mob ? filtros : null, corpo);
    return [cab, cards, hist];
  }
  function formulario() {
    const F = M.f, X = TIPOS[F.tipo], mob = celular();
    const voltar = h('button', { class: 'eq-voltar', onclick: () => { M.f = null; desenhar(); } }, ic('fa-arrow-left'), ' Relatórios');
    const campo = (t, el) => h('label', { class: 'rl-campo' }, h('span', null, t), el);
    const muda = (k, v, ja) => { F[k] = v; if (k === 'inicio' || k === 'fim') F.per = 'pers'; desenhar(); atualizar(ja); };
    const form = h('section', { class: 'rl-form' },
      h('div', { class: 'rl-form-t' }, h('span', { style: `color:${X.cor}` }, ic(X.i)), h('b', null, F.tipo === 'obra' ? 'Relatório da obra para o cliente' : X.t)),
      F.tipo === 'obra' ? campo('Obra', h('select', { class: 'rl-in', id: 'rl-obra', onchange: e => { F.projeto_id = +e.target.value; F.editado = false; desenhar(); atualizar(true); } },
        M.d.obras.map(o => h('option', { value: o.id, selected: o.id === F.projeto_id }, `${o.codigo ? o.codigo + ' · ' : ''}${o.nome}${o.situacao !== 'Em andamento' ? ' (' + o.situacao.toLowerCase() + ')' : ''}`)))) : null,
      h('div', { class: 'rl-chips', role: 'group', 'aria-label': 'Período' }, PERIODOS.map(([k, t]) => h('button', { class: F.per === k ? 'on' : '', onclick: () => { const [i, f] = periodo(k, M.d.hoje); F.per = k; F.inicio = i; F.fim = f; F.editado = false; desenhar(); atualizar(true); } }, t)),
        h('button', { class: F.per === 'pers' ? 'on' : '', onclick: () => { F.per = 'pers'; desenhar(); document.getElementById('rl-ini')?.focus(); } }, 'Personalizado')),
      h('div', { class: 'rl-dois' }, campo('De', h('input', { type: 'date', class: 'rl-in', id: 'rl-ini', value: F.inicio, max: M.d.hoje, onchange: e => e.target.value && (F.editado = false, muda('inicio', e.target.value, true)) })),
        campo('Até', h('input', { type: 'date', class: 'rl-in', id: 'rl-fim', value: F.fim, onchange: e => e.target.value && (F.editado = false, muda('fim', e.target.value, true)) }))),
      F.tipo === 'obra' ? h('div', { class: 'rl-secoes' }, h('b', null, 'O que entra'), SECOES.map(([k, t]) => h('label', { class: 'rl-chk' },
        h('input', { type: 'checkbox', checked: F.secoes.includes(k), onchange: e => { F.secoes = e.target.checked ? [...F.secoes, k] : F.secoes.filter(x => x !== k); atualizar(true); } }), t))) : null,
      F.tipo === 'obra' ? h('div', { class: 'rl-res' }, h('div', { class: 'rl-res-cab' }, h('b', null, 'Resumo do período'), h('small', null, F.editado ? 'ajustado por você' : 'sugerido pelo sistema com os números, ajuste antes de emitir'),
        F.editado ? h('button', { class: 'rl-link', onclick: () => { F.editado = false; F.resumo = F.conteudo ? F.conteudo.resumo_sugerido : ''; desenhar(); atualizar(true); } }, ic('fa-rotate'), ' Refazer com os números') : null),
        h('textarea', { class: 'rl-in rl-txt', id: 'rl-resumo', rows: mob ? 7 : 6, maxlength: 5000, placeholder: F.carregando ? 'Montando o texto…' : 'Resumo do período', oninput: e => { F.resumo = e.target.value; F.editado = true; atualizar(false, 900); } }, F.resumo)) : null,
      F.conteudo ? numeros(F) : null,
      h('div', { class: 'rl-bts' }, mob ? h('button', { class: 'eq-bt', onclick: verPrevia }, ic('fa-eye'), ' Ver prévia') : null,
        h('button', { class: 'eq-bt pri', id: 'rl-emitir', onclick: emitir }, ic('fa-stamp'), ' Emitir relatório')),
      h('p', { class: 'rl-nota' }, 'Ao emitir, o relatório ganha número e fica guardado como está: mudanças depois na obra não alteram o que foi entregue.'));
    if (mob) return [voltar, form];
    const prev = h('section', { class: 'rl-prev' }, h('div', { class: 'rl-prev-cab' }, h('b', null, 'PRÉVIA'), h('span', null, F.carregando ? 'atualizando…' : 'é assim que sai impresso')),
      h('div', { class: 'rl-folha' }, F.html ? frame(F.html) : h('p', { class: 'eq-vazio' }, 'Montando a prévia…')));
    return [voltar, h('div', { class: 'rl-grade' }, form, prev)];
  }
  function numeros(F) {
    const k = F.conteudo.indicadores || {}, n = v => v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ',');
    const item = (v, t, cor) => h('div', { class: 'rl-num ' + (cor || '') }, h('b', null, v), h('span', null, t));
    if (F.tipo === 'obra') return h('div', { class: 'rl-nums' }, item(n(k.real) + '%', 'real'), item(n(k.previsto) + '%', 'previsto'),
      item((k.desvio > 0 ? '+' : '') + n(k.desvio) + ' pts', 'desvio', k.desvio < -5 ? 'verm' : k.desvio < 0 ? 'amar' : 'verd'), item((k.desvio_dias > 0 ? '+' : '') + (k.desvio_dias ?? '—') + ' d', 'no término', k.desvio_dias > 0 ? 'verm' : 'verd'));
    if (F.tipo === 'gerencial') return h('div', { class: 'rl-nums' }, item(k.obras, 'em andamento'), item(k.atencao, 'atenção', 'amar'), item(k.atrasadas, 'atrasadas', 'verm'), item(k.sem_rdo, 'dias sem RDO', k.sem_rdo ? 'verm' : ''));
    if (F.tipo === 'sst') return h('div', { class: 'rl-nums' }, item(k.pessoas, 'pessoas'), item(k.vencidos, 'vencido ou falta', k.vencidos ? 'verm' : 'verd'), item(k.vencendo, 'vencendo', k.vencendo ? 'amar' : ''), item(k.ausentes, 'ausentes'));
    return h('div', { class: 'rl-nums' }, item(k.equipamentos, 'equipamentos'), item(k.alugados, 'alugados'), item('R$ ' + Number(k.custo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'locação'), item(k.conflitos, 'conflitos', k.conflitos ? 'amar' : ''));
  }
  const frame = html => h('iframe', { class: 'rl-frame', title: 'Prévia do relatório', sandbox: 'allow-same-origin', srcdoc: html });

  /* ── prévia (debounce) ──────────────────────── */
  let tmr = null, seq = 0;
  function atualizar(json, espera) {
    clearTimeout(tmr); tmr = setTimeout(() => carregarPrevia(json !== false), espera || 350);
  }
  function corpoF() {
    const F = M.f; return { tipo: F.tipo, projeto_id: F.projeto_id, inicio: F.inicio, fim: F.fim, secoes: F.secoes, resumo: F.tipo === 'obra' ? F.resumo : undefined };
  }
  async function carregarPrevia(json) {
    const F = M.f; if (!F) return; const n = ++seq;
    F.carregando = true; marcar();
    try {
      if (json || !F.conteudo) { const r = await api('relatorios/previa', 'POST', corpoF()); if (n !== seq || M.f !== F) return; F.conteudo = r.conteudo;
        if (F.tipo === 'obra' && !F.editado) { F.resumo = r.conteudo.resumo_sugerido; const t = document.getElementById('rl-resumo'); if (t) t.value = F.resumo; } }
      if (!celular()) { const html = await api('relatorios/previa/documento', 'POST', corpoF(), true); if (n !== seq || M.f !== F) return; F.html = html; }
      F.erro = null;
    } catch (e) { if (n !== seq) return; F.erro = e.message; avisar(e.message, 'error'); }
    F.carregando = false;
    redesenharSemPerderFoco();
  }
  function marcar() { const s = document.querySelector('.rl-prev-cab span'); if (s) s.textContent = 'atualizando…'; }
  function redesenharSemPerderFoco() {
    const a = document.activeElement, id = a && a.id, sel = a && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
    const rolagem = document.querySelector('.rl-frame')?.contentWindow?.scrollY || 0;
    desenhar();
    const fr = document.querySelector('.rl-frame'); if (fr && rolagem) fr.addEventListener('load', () => { try { fr.contentWindow.scrollTo(0, rolagem); } catch (_) {} }, { once: true });
    if (id) { const el = document.getElementById(id); if (el) { el.focus(); if (sel) try { el.setSelectionRange(...sel); } catch (_) {} } }
  }
  async function verPrevia() {
    const F = M.f, fundo = h('div', { class: 'eq-fundo rl-tela', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Prévia do relatório' });
    const fechar = () => fundo.remove();
    const area = h('div', { class: 'rl-tela-corpo' }, h('p', { class: 'eq-vazio' }, 'Montando a prévia…'));
    fundo.append(h('div', { class: 'rl-tela-cab' }, h('b', null, 'Prévia'), h('button', { class: 'eq-bt', onclick: fechar }, ic('fa-xmark'), ' Fechar')), area);
    document.body.append(fundo);
    try { const html = await api('relatorios/previa/documento', 'POST', corpoF(), true); area.innerHTML = ''; area.append(frame(html)); } catch (e) { area.innerHTML = ''; area.append(h('p', { class: 'eq-vazio' }, e.message)); }
  }

  /* ── ações ──────────────────────────────────── */
  function abrirDoc(id, imprimir) {
    const w = window.open('api/relatorios/' + id + '/documento' + (imprimir ? '?imprimir=1' : ''), '_blank');
    if (w) w.opener = null; else avisar('Libere as janelas (pop-ups) deste site para abrir o relatório.', 'warning');
  }
  async function emitir() {
    const F = M.f, bt = document.getElementById('rl-emitir'); if (bt) bt.disabled = true;
    if (F.tipo === 'obra' && !F.projeto_id) { avisar('Escolha a obra', 'error'); if (bt) bt.disabled = false; return; }
    try {
      const r = await api('relatorios', 'POST', corpoF());
      avisar(`Relatório ${r.referencia} emitido`, 'success');
      M.f = null; M.d = null; abrirDoc(r.id); await carregar();
    } catch (e) { avisar(e.message, 'error'); if (bt) bt.disabled = false; }
  }
  function excluir(r) {
    janela('Excluir relatório', h('p', { class: 'rl-nota' }, `Excluir ${r.referencia} (${r.tipo_nome}, ${r.periodo})? Ele sai da lista; o número não é reaproveitado.`), 'Excluir', async () => {
      await api('relatorios/' + r.id, 'DELETE'); avisar(`${r.referencia} excluído`, 'success'); await carregar();
    });
  }
  function janela(titulo, corpo, okTxt, aoOk) {
    const fundo = h('div', { class: 'eq-fundo', role: 'presentation' });
    const bt = h('button', { class: 'eq-bt pri rl-perigo' }, okTxt);
    const j = h('div', { class: 'eq-jan', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div', { class: 'eq-jan-cab' }, h('h2', null, titulo), h('button', { class: 'eq-x', 'aria-label': 'Fechar', onclick: () => fechar() }, ic('fa-xmark'))),
      h('div', { class: 'eq-jan-corpo' }, corpo), h('div', { class: 'eq-acoes' }, h('button', { class: 'eq-bt', onclick: () => fechar() }, 'Cancelar'), bt));
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') fechar(); };
    bt.onclick = async () => { bt.disabled = true; try { await aoOk(); fechar(); } catch (e) { avisar(e.message, 'error'); } bt.disabled = false; };
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', esc); fundo.append(j); document.body.append(fundo);
  }

  /* ── ligação com o menu ─────────────────────── */
  window.renderRelatorio = function () {
    const t = document.getElementById('page-title'); if (t) t.textContent = 'Relatórios';
    if (M.vindo) { M.vindo = false; return; }
    M.f = null; desenhar(); carregar();
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); desenhar(); if (M.f && !w) atualizar(false); } }; })());
  const abrirMenu = () => window.switchView('relatorio', document.getElementById('nav-relatorios'));
  window.tfRelatorios = { abrir: abrirMenu, gerar: async tipo => { M.vindo = true; abrirMenu(); if (!M.d) await carregar(); novo(tipo); }, estado: M };
})();
