/* Aprumo · gestao-vista.js — tela "Início" (gestão à vista) para administrador e gestor: números do dia, farol das
   obras, atrasos e Travou abertos, RDO e documentos, agenda da semana; e o modo TV (tela cheia, atualiza sozinho a cada
   2 min e troca de página a cada 20 s). Usa as peças eq-* da Equipe e as gv-*. */
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
  async function api(rota) {
    const r = await fetch('api/' + rota, { credentials: 'same-origin', cache: 'no-store' }); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(j.erro || 'Não foi possível carregar. Tente de novo.'); return j;
  }
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
  const pct = v => v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ',') + '%';
  const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], SEMX = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const FAR = { verde: ['Em dia', 'vd'], amarelo: ['Atenção', 'am'], vermelho: ['Atrasada', 'vm'], cinza: ['Sem previsão', 'cz'] };
  const AG = { comeca: ['fa-play', 'az', 'começa'], termina: ['fa-flag-checkered', 'vd', 'termina'], ausencia: ['fa-umbrella-beach', 'cz', 'ausência'], conflito: ['fa-triangle-exclamation', 'vm', 'conflito'], devolver: ['fa-truck-ramp-box', 'am', 'devolução'] };
  const PEND = { sem: d => [`${d.obra} · dia útil sem RDO`, `${SEMX[new Date(d.data + 'T12:00:00Z').getUTCDay()]}, ${dBR(d.data)}`, 'abrir'],
    rasc: d => [`RDO de ${dBR(d.data)} da ${d.obra} ${d.enviado ? 'enviado, para fechar' : 'em rascunho'}`, d.enviado ? 'o encarregado já enviou' : 'ainda com o encarregado', d.enviado ? 'fechar' : 'rascunho'],
    fech: d => [`RDO de ${dBR(d.data)} da ${d.obra} fechado`, 'falta entregar ao cliente', 'entregar'], entr: d => [`RDO de ${dBR(d.data)} da ${d.obra} sem a folha assinada`, 'entregue ao cliente', 'anexar'] };
  const M = { d: null, erro: null, quando: 0, tv: null };
  const raiz = () => document.getElementById('view-inicio');
  async function carregar() {
    try { M.d = await api('inicio'); M.erro = null; M.quando = Date.now(); } catch (e) { M.erro = e.message; }
    desenhar(); if (M.tv) desenharTV();
  }
  const ha = () => { const m = Math.round((Date.now() - M.quando) / 60000); return m < 1 ? 'agora' : `há ${m} min`; };

  /* ── peças ──────────────────────────────────── */
  function cartao(o, tv) {
    const [txt, c] = FAR[o.farol] || FAR.cinza;
    return h(tv ? 'div' : 'button', { class: 'gv-obra ' + c, 'data-obra': o.id, onclick: tv ? null : () => window.tfObra && tfObra.abrir(o.id), 'aria-label': tv ? null : `Abrir ${o.codigo || o.nome}` },
      h('div', { class: 'gv-obra-t' }, h('b', null, o.codigo || o.nome), o.situacao === 'Pausado' ? h('small', null, 'pausada') : null, h('span', { class: 'gv-far ' + c }, '● ', txt)),
      h('div', { class: 'gv-obra-n' }, o.nome), o.cliente ? h('small', { class: 'gv-obra-c' }, o.cliente) : null,
      h('div', { class: 'gv-barra', title: `real ${pct(o.real)} · previsto ${pct(o.previsto)}` }, h('i', { style: `width:${Math.min(100, o.real || 0)}%` }), o.previsto != null ? h('em', { style: `left:${Math.min(100, o.previsto)}%` }) : null),
      h('div', { class: 'gv-obra-r' }, h('span', null, h('b', null, pct(o.real)), ' real · ', pct(o.previsto), ' previsto'), h('span', { class: 'gv-dd' + (o.desvio_dias > 0 ? ' mau' : '') }, o.desvio_dias == null ? '' : (o.desvio_dias > 0 ? '+' : '') + o.desvio_dias + ' d'),
        h('span', { class: 'gv-fim' }, ' · fim ' + dBR(o.termino))));
  }
  function linhaAtraso(a, tv) {
    const trav = a.tipo === 'travou';
    return h(tv ? 'div' : 'button', { class: 'gv-lin', onclick: tv ? null : () => abrirAtividade(a.projeto_id, a.atividade_id) },
      h('span', { class: 'gv-lin-i ' + (trav ? 'vm' : 'am') }, ic(trav ? 'fa-hand' : 'fa-clock')),
      h('div', null, h('b', null, a.atividade || 'Obra', ' · ', a.obra), h('small', null, trav ? `Travou: ${a.descricao || a.motivo}${a.responsavel ? ' · ' + a.responsavel : ''}` : `${a.responsavel || 'sem responsável'} · ${a.avanco}% · devia terminar ${dBR(a.fim)}`)),
      h('span', { class: 'gv-lin-d' }, trav ? (a.dias ? `há ${a.dias} d` : 'hoje') : `${a.dias} d atraso`));
  }
  function linhaPend(p, tv) {
    const [t, s, d] = PEND[p.tipo](p);
    return h(tv ? 'div' : 'button', { class: 'gv-lin', onclick: tv ? null : () => { if (!window.tfRdo) return; if (p.id) tfRdo.abrirRdo(p.id); else tfRdo.dia(p.projeto_id, p.data); } },
      h('span', { class: 'gv-lin-i rx' }, ic(p.tipo === 'entr' ? 'fa-signature' : 'fa-clipboard-list')), h('div', null, h('b', null, t), h('small', null, s)), h('span', { class: 'gv-lin-d' }, d));
  }
  function linhaDoc(v, tv) {
    return h(tv ? 'div' : 'button', { class: 'gv-lin', onclick: tv ? null : () => window.switchView('pessoas', document.querySelector("[onclick*=\"'pessoas'\"]")) },
      h('span', { class: 'gv-lin-i am' }, ic('fa-helmet-safety')), h('div', null, h('b', null, `${v.pessoa} · ${v.documento}`), h('small', null, `${v.situacao} · alocada em ${v.obras}`)), h('span', { class: 'gv-lin-d' }, v.situacao.startsWith('Falta') ? 'falta' : 'vencida'));
  }
  function agenda(tv) {
    const d = M.d;
    return h('div', { class: 'gv-semana' }, d.agenda.map((x, i) => {
      const dt = new Date(x.data + 'T12:00:00Z'), fds = [0, 6].includes(dt.getUTCDay()), max = tv ? 5 : 6;
      return h('div', { class: 'gv-dia' + (i === 0 ? ' hoje' : '') + (fds ? ' fds' : '') }, h('b', null, `${SEM[dt.getUTCDay()]} ${x.data.slice(8, 10)}`),
        x.itens.slice(0, max).map(it => { const [i2, c, rot] = AG[it.tipo];
          return h(tv || !it.atividade_id ? 'div' : 'button', { class: 'gv-ag ' + c, title: `${rot}: ${it.texto}${it.obra ? ' · ' + it.obra : ''}`, onclick: tv || !it.atividade_id ? null : () => abrirAtividade(it.projeto_id, it.atividade_id) },
            ic(i2), ' ', it.texto, it.obra ? h('small', null, ' · ' + it.obra) : null); }),
        x.itens.length > max ? h('small', { class: 'gv-ag-mais' }, `+${x.itens.length - max}`) : null, !x.itens.length ? h('small', { class: 'gv-ag-vazio' }, '—') : null);
    }));
  }
  async function abrirAtividade(pid, aid) {
    if (!window.tfObra || !pid) return;
    await tfObra.abrir(pid);
    if (aid) { const a = ((tfObra.estado.d || {}).atividades || []).find(x => x.id === aid); if (a) tfObra.painel(a); }
  }

  /* ── tela ───────────────────────────────────── */
  function desenhar() {
    const R = raiz(); if (!R || !R.classList.contains('active')) return;
    const y = window.scrollY; R.innerHTML = ''; const box = h('div', { class: 'eq gv' }); R.append(box);
    const d = M.d, mob = celular();
    if (!d) { box.append(h('p', { class: 'eq-vazio' }, M.erro || 'Carregando…')); return; }
    const hr = new Date().getHours(), oi = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite', k = d.indicadores;
    const dt = new Date(d.hoje + 'T12:00:00Z');
    box.append(h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, `${oi}, ${d.usuario}`),
      h('p', null, `${SEMX[dt.getUTCDay()][0].toUpperCase() + SEMX[dt.getUTCDay()].slice(1)}, ${dBR(d.hoje)} · ${k.obras} obra${k.obras === 1 ? '' : 's'} em andamento · `, h('span', { id: 'gv-ha' }, 'atualizado ' + ha()))),
      mob ? null : h('button', { class: 'eq-bt', id: 'gv-tv', onclick: abrirTV }, ic('fa-tv'), ' Modo TV')));
    const kpi = (n, t, cor, id) => h('div', { class: 'eq-kpi ' + cor, id }, h('b', null, n), h('span', null, t));
    box.append(h('div', { class: 'eq-kpis gv-kpis' }, kpi(h('span', null, h('i', { class: 'gv-n vd' }, k.verde), ' · ', h('i', { class: 'gv-n am' }, k.amarelo), ' · ', h('i', { class: 'gv-n vm' }, k.vermelho)), 'em dia · atenção · atrasada', 'azul', 'gv-k-farol'),
      kpi(k.travou, 'Travou sem liberar', k.travou ? 'verm' : 'verd'), kpi(k.atrasadas, 'atividades atrasadas', k.atrasadas ? 'amar' : 'verd'),
      kpi(k.sem_rdo, 'dias úteis sem RDO', k.sem_rdo ? 'roxo' : 'verd'), mob ? null : kpi(k.nr_vencida, 'NR vencida de quem está alocado', k.nr_vencida ? 'amar' : 'verd')));
    box.append(h('section', { class: 'eq-painel gv-farol' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Farol das obras'), h('small', null, 'barra = real · traço = previsto · clique para abrir'))),
      d.obras.length ? h('div', { class: 'gv-obras' }, d.obras.map(o => cartao(o))) : h('p', { class: 'eq-vazio' }, 'Nenhuma obra em andamento.')));
    const lista = (t, s, itens, fn, vazio) => h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, t), h('small', null, s))),
      itens.length ? h('div', { class: 'gv-lista' }, itens.slice(0, 8).map(x => fn(x)), itens.length > 8 ? h('small', { class: 'gv-mais' }, `e mais ${itens.length - 8}`) : null) : h('p', { class: 'eq-vazio gv-ok' }, ic('fa-circle-check'), ' ', vazio));
    const pend = [...d.pendencias.map(p => ({ p })), ...d.documentos.map(v => ({ v }))];
    box.append(h('div', { class: 'gv-duas' }, lista('Atrasos e Travou abertos', 'Quem precisa de ajuda agora', d.atrasos, a => linhaAtraso(a), 'Nada atrasado nem travado.'),
      lista('RDO e documentos', 'O que está pendente de papel', pend, x => x.p ? linhaPend(x.p) : linhaDoc(x.v), 'RDOs em dia e documentos em ordem.')));
    box.append(h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Agenda da semana'), h('small', null, 'começa · termina · ausência · conflito de recurso · devolução de locação'))), agenda()));
    window.scrollTo(0, y);
  }

  /* ── modo TV ────────────────────────────────── */
  function abrirTV() {
    if (M.tv) return;
    const el = h('div', { class: 'gv-tv', role: 'dialog', 'aria-label': 'Modo TV' });
    document.body.append(el); document.body.classList.add('gv-tv-on');
    M.tv = { el, pag: 0, giro: setInterval(() => { M.tv.pag = (M.tv.pag + 1) % 3; desenharTV(); }, 20000), atual: setInterval(carregar, 120000) };
    try { el.requestFullscreen && el.requestFullscreen().catch(() => {}); } catch (_) {}
    document.addEventListener('keydown', escTV); document.addEventListener('fullscreenchange', saiuTela);
    desenharTV();
  }
  function fecharTV() {
    if (!M.tv) return; clearInterval(M.tv.giro); clearInterval(M.tv.atual); M.tv.el.remove(); M.tv = null;
    document.body.classList.remove('gv-tv-on'); document.removeEventListener('keydown', escTV); document.removeEventListener('fullscreenchange', saiuTela);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    desenhar();
  }
  const escTV = e => { if (e.key === 'Escape') fecharTV(); else if (e.key === 'ArrowRight' && M.tv) { M.tv.pag = (M.tv.pag + 1) % 3; desenharTV(); } };
  const saiuTela = () => { if (!document.fullscreenElement && M.tv && M.tv.cheia) fecharTV(); else if (document.fullscreenElement && M.tv) M.tv.cheia = true; };
  function desenharTV() {
    const T = M.tv, d = M.d; if (!T || !d) return; const k = d.indicadores, el = T.el; el.innerHTML = '';
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), dt = new Date(d.hoje + 'T12:00:00Z');
    el.append(h('div', { class: 'gv-tv-cab' }, d.tem_logo ? h('img', { src: 'api/empresa/logo', alt: '' }) : h('span', { class: 'gv-tv-ini' }, (d.empresa || 'TF').slice(0, 2).toUpperCase()),
      h('div', { class: 'gv-tv-tit' }, h('b', null, `${d.empresa} · gestão à vista`), h('small', null, `${SEMX[dt.getUTCDay()]}, ${dBR(d.hoje)} · ${hora} · atualiza sozinho a cada 2 min`)),
      [[k.verde, 'em dia', 'vd'], [k.amarelo, 'atenção', 'am'], [k.vermelho, 'atrasada', 'vm'], [k.travou, 'Travou aberto', 'vm'], [k.sem_rdo, 'dias sem RDO', 'rx']].map(([n, t, c]) => h('div', { class: 'gv-tv-k ' + c }, h('b', null, n), h('small', null, t))),
      h('button', { class: 'gv-tv-x', onclick: fecharTV, 'aria-label': 'Sair do modo TV' }, ic('fa-xmark'))));
    const corpo = h('div', { class: 'gv-tv-corpo' });
    if (T.pag === 0) corpo.append(h('div', { class: 'gv-obras tv' }, d.obras.slice(0, 9).map(o => cartao(o, true))),
      h('div', { class: 'gv-duas tv' }, h('section', { class: 'gv-tv-sec' }, h('b', null, 'Atrasos e Travou abertos'), d.atrasos.length ? d.atrasos.slice(0, 3).map(a => linhaAtraso(a, true)) : h('p', { class: 'gv-ok' }, ic('fa-circle-check'), ' Nada atrasado nem travado.')),
        h('section', { class: 'gv-tv-sec' }, h('b', null, 'Esta semana'), agenda(true))));
    else if (T.pag === 1) corpo.append(h('div', { class: 'gv-duas tv alto' }, h('section', { class: 'gv-tv-sec' }, h('b', null, 'Atrasos e Travou abertos'), d.atrasos.length ? d.atrasos.slice(0, 8).map(a => linhaAtraso(a, true)) : h('p', { class: 'gv-ok' }, ic('fa-circle-check'), ' Nada atrasado nem travado.')),
      h('section', { class: 'gv-tv-sec' }, h('b', null, 'RDO e documentos'), [...d.pendencias.slice(0, 8).map(p => linhaPend(p, true)), ...d.documentos.slice(0, 3).map(v => linhaDoc(v, true))].slice(0, 8), !d.pendencias.length && !d.documentos.length ? h('p', { class: 'gv-ok' }, ic('fa-circle-check'), ' RDOs em dia e documentos em ordem.') : null)));
    else corpo.append(h('section', { class: 'gv-tv-sec alto' }, h('b', null, 'Agenda da semana'), agenda(true)));
    el.append(corpo, h('div', { class: 'gv-tv-pe' }, [0, 1, 2].map(i => h('i', { class: i === T.pag ? 'on' : '' })), h('small', null, `página ${T.pag + 1} de 3 · troca a cada 20 s · Esc para sair`)));
  }

  /* ── ligação com o menu ─────────────────────── */
  let relogio = null;
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    clearInterval(relogio);
    if (nome !== 'inicio') { const R = raiz(); if (R) R.innerHTML = ''; }   // não deixa a tela escondida com elementos repetidos
    if (nome === 'inicio') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Início'; desenhar(); carregar();
      relogio = setInterval(() => { const s = document.getElementById('gv-ha'); if (s) s.textContent = 'atualizado ' + ha(); if (Date.now() - M.quando > 300000 && !M.tv) carregar(); }, 30000); }
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); desenhar(); } }; })());
  window.tfInicio = { abrir: () => window.switchView('inicio', document.getElementById('nav-inicio')), tv: abrirTV, sairTV: fecharTV, estado: M };
})();
