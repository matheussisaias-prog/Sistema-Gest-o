/* Aprumo · indicadores.js — tela "Gráficos e indicadores" para a gestão de planejamento.
   De cima para baixo: resumo em uma frase · quadro SQDCP (tendência, mini-linha de 8 semanas, meta, farol e lista do que
   compõe o número) · prazo das obras · Curva S com projeção · causas dos atrasos (Ishikawa 6M + Pareto em dias perdidos) ·
   pendências de controle · carga da equipe e ocupação dos equipamentos. Exporta em PDF (impressão) e lembra filtros no F5.
   Só administrador e gestor; os outros perfis continuam vendo os gráficos antigos. */
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
  const NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...filhos) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k.startsWith('on')) el[k] = v; else el.setAttribute(k, v); }
    for (const f of filhos.flat(9)) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
    return el;
  }
  const ic = n => h('i', { class: 'fa-solid ' + n, 'aria-hidden': 'true' });
  async function api(rota) {
    const r = await fetch('api/' + rota, { credentials: 'same-origin', cache: 'no-store' }); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível carregar. Tente de novo.'); e.status = r.status; throw e; } return j;
  }
  const dBR = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '—';
  const dBRa = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '—';
  const num = (v, c = 0) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const eu = () => (window.tfServidor && tfServidor.estado && tfServidor.estado.usuario) || {};
  const pode = () => !eu().perfil || ['administrador', 'gestor'].includes(eu().perfil);
  const celular = () => window.innerWidth <= 760;

  const M = { d: null, erro: null, obra: '', periodo: 28, ramo: null, carregando: false, negado: false, aberto: {} };
  { const v = window.tfEstado && tfEstado.ler('indicadores'); if (v) { M.obra = v.obra || ''; M.ramo = v.ramo || null; if ([7, 28, 90].includes(v.periodo)) M.periodo = v.periodo; } }
  const guardar = () => window.tfEstado && tfEstado.gravar('indicadores', { obra: M.obra, ramo: M.ramo, periodo: M.periodo });

  function raiz() {
    const v = document.getElementById('view-graficos'); if (!v) return null;
    let r = document.getElementById('ind-raiz');
    if (!r) { r = h('div', { id: 'ind-raiz', class: 'ind' }); v.prepend(r); }
    return r;
  }
  async function carregar() {
    if (!pode()) return;
    M.carregando = true; desenhar();
    try { M.d = await api(`indicadores?periodo=${M.periodo}` + (M.obra ? '&obra=' + encodeURIComponent(M.obra) : '')); M.erro = null; }
    catch (e) { if (e.status === 403) M.negado = true; else M.erro = e.message; }
    M.carregando = false; desenhar();
  }

  /* ── abrir o que está por trás de cada número ── */
  async function abrirAtividade(pid, aid, aba) {
    if (!window.tfObra || !pid) return;
    await tfObra.abrir(pid);
    if (aba && tfObra.estado) { tfObra.estado.aba = aba; tfObra.desenhar(); return; }
    if (aid) { const a = ((tfObra.estado.d || {}).atividades || []).find(x => x.id === aid); if (a) tfObra.painel(a); }
  }
  function irItem(it) {
    fecharGaveta();
    if (it.rdo_id && window.tfRdo) return tfRdo.abrirRdo(it.rdo_id);
    if (it.data && it.projeto_id && !it.atividade_id && window.tfRdo) return tfRdo.dia(it.projeto_id, it.data);
    if (it.recurso_id && window.tfRecursos) return tfRecursos.abrirFicha(it.recurso_id);
    if (it.equipe && window.tfEquipe) return tfEquipe.abrir();
    if (it.projeto_id) return abrirAtividade(it.projeto_id, it.atividade_id, it.aba);
  }
  const clicavel = it => !!(it.projeto_id || it.recurso_id || it.equipe || it.rdo_id);
  const linhaItem = it => clicavel(it) ? h('button', { class: 'ind-item', onclick: () => irItem(it) }, h('b', null, it.texto), h('small', null, it.sub), h('i', { class: 'fa-solid fa-chevron-right ind-item-ir', 'aria-hidden': 'true' }))
    : h('div', { class: 'ind-item' }, h('b', null, it.texto), h('small', null, it.sub));

  /* gaveta lateral com a explicação e a lista do indicador */
  function fecharGaveta() { document.querySelectorAll('.ind-gaveta-fundo').forEach(g => g.remove()); }
  function gaveta(k) {
    fecharGaveta();
    const f = h('div', { class: 'ind-gaveta-fundo', onclick: e => { if (e.target === f) fecharGaveta(); } },
      h('aside', { class: 'ind-gaveta', role: 'dialog', 'aria-label': k.nome + ' · ' + k.titulo },
        h('div', { class: 'ind-gav-cab' }, h('span', { class: 'ind-letra ' + FAROL[k.farol] }, k.chave), h('div', null, h('small', null, k.nome), h('h3', null, k.titulo)),
          h('button', { class: 'ind-x', 'aria-label': 'Fechar', onclick: fecharGaveta }, ic('fa-xmark'))),
        h('div', { class: 'ind-gav-val' }, h('b', null, valor(k)), tendencia(k), h('span', { class: 'ind-sel ' + FAROL[k.farol] }, TXT_FAROL[k.farol]), h('span', { class: 'ind-meta-t' }, 'Meta: ' + k.meta)),
        h('p', { class: 'ind-gav-exp' }, k.explica), h('p', { class: 'ind-gav-form' }, ic('fa-calculator'), ' ', k.formula),
        h('div', { class: 'ind-gav-serie' }, h('small', null, k.serie_rotulo + ' (8 semanas)'), sparkline(k.serie, 300, 60, true)),
        h('h4', null, 'O que compõe o número'),
        k.itens.length ? h('div', { class: 'ind-gav-lista' }, k.itens.map(linhaItem)) : h('p', { class: 'ind-vazio' }, 'Nada a listar no período.')));
    document.body.append(f);
    f.querySelector('.ind-x').focus();
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharGaveta(); });

  /* ── peças ───────────────────────────────────── */
  const FAROL = { verde: 'vd', amarelo: 'am', vermelho: 'vm', cinza: 'cz' };
  const TXT_FAROL = { verde: 'Dentro da meta', amarelo: 'Atenção', vermelho: 'Fora da meta', cinza: 'Sem dados' };
  function valor(k) {
    const v = k.valor; if (v == null) return '—';
    if (k.formato === '%') return num(v) + '%';
    if (k.formato === 'indice') return num(v, 2);
    if (k.formato === 'dias') return num(v) + (v === 1 ? ' dia' : ' dias');
    return String(v);
  }
  function tendencia(k) {
    const t = k.tendencia; if (!t || t.delta == null) return h('span', { class: 'ind-tend cz', title: 'Sem dado do período anterior para comparar' }, '—');
    if (t.melhorou == null) return h('span', { class: 'ind-tend cz', title: 'Igual ao período anterior' }, ic('fa-equals'), ' igual');
    const up = t.delta > 0, txt = (up ? '+' : '−') + (k.formato === 'indice' ? num(Math.abs(t.delta), 2) : num(Math.abs(t.delta))) + (t.texto ? ' ' + t.texto : '');
    return h('span', { class: 'ind-tend ' + (t.melhorou ? 'vd' : 'vm'), title: 'Comparado ao período anterior' }, ic(up ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'), ' ', txt);
  }
  function sparkline(serie, W = 120, H = 30, eixo = false) {
    const v = serie.map(x => x == null ? null : +x), ok = v.filter(x => x != null);
    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ind-spark', width: W, height: H, 'aria-hidden': 'true' });
    if (ok.length < 2) { g.append(s('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle', class: 'ind-eixo' }, ok.length ? 'pouco histórico' : 'sem histórico')); return g; }
    const mn = Math.min(...ok), mx = Math.max(...ok), amp = mx - mn || 1, px = i => 4 + i * (W - 8) / (v.length - 1), py = x => H - 5 - (x - mn) / amp * (H - 12);
    let d = '', ini = true; v.forEach((x, i) => { if (x == null) { ini = true; return; } d += (ini ? 'M' : 'L') + px(i).toFixed(1) + ' ' + py(x).toFixed(1) + ' '; ini = false; });
    g.append(s('path', { d, class: 'ind-spark-l' }));
    const u = v.length - 1 - [...v].reverse().findIndex(x => x != null);
    g.append(s('circle', { cx: px(u), cy: py(v[u]), r: 3, class: 'ind-spark-p' }));
    if (eixo) g.append(s('text', { x: 2, y: 10, class: 'ind-eixo' }, num(mx, mx < 5 ? 2 : 0)), s('text', { x: 2, y: H - 1, class: 'ind-eixo' }, num(mn, mn < 5 ? 2 : 0)));
    return g;
  }
  function cartao(k) {
    const f = FAROL[k.farol] || 'cz';
    return h('article', { class: 'ind-kpi ' + f, 'data-kpi': k.chave, tabindex: 0, role: 'button', 'aria-label': `${k.nome}: ${k.titulo} ${valor(k)}. Abrir detalhes`,
        onclick: e => { if (!e.target.closest('.ind-info')) gaveta(k); }, onkeydown: e => { if (e.key === 'Enter') gaveta(k); } },
      h('div', { class: 'ind-kpi-t' }, h('span', { class: 'ind-letra ' + f, 'aria-hidden': 'true' }, k.chave), h('span', null, h('b', null, k.nome), h('small', null, k.titulo)),
        h('button', { class: 'ind-info', 'aria-label': 'O que é ' + k.titulo, title: k.explica, onclick: e => { e.stopPropagation(); const p = e.currentTarget.closest('.ind-kpi').querySelector('.ind-exp'); p.hidden = !p.hidden; } }, ic('fa-circle-question'))),
      h('div', { class: 'ind-val-l' }, h('div', { class: 'ind-val' }, valor(k)), sparkline(k.serie)),
      h('div', { class: 'ind-meta' }, h('span', { class: 'ind-sel ' + f }, TXT_FAROL[k.farol] || ''), tendencia(k)),
      h('div', { class: 'ind-meta-t' }, 'Meta: ' + k.meta),
      h('p', { class: 'ind-det' }, k.detalhe),
      h('div', { class: 'ind-sec' }, h('i', { class: 'ind-dot ' + (FAROL[k.secundario.farol] || 'cz') }), h('span', null, k.secundario.rotulo), h('b', null, k.secundario.valor)),
      h('p', { class: 'ind-exp', hidden: true }, k.explica));
  }
  function secao(titulo, sub, ...corpo) { return h('section', { class: 'ind-card' }, h('h3', null, titulo, sub ? h('small', null, sub) : null), ...corpo); }

  function tabelaPrazo(L) {
    if (!L.length) return h('p', { class: 'ind-vazio' }, 'Sem obra com cronograma.');
    const cab = ['Obra', 'Real × previsto', 'Desvio', 'IDP', 'Término previsto', 'Contrato', 'Atraso no término'];
    return h('div', { class: 'ind-tab-w' }, h('table', { class: 'ind-tab' },
      h('thead', null, h('tr', null, cab.map(c => h('th', null, c)))),
      h('tbody', null, L.map(o => {
        const f = FAROL[o.farol] || 'cz', sobe = o.idp != null && o.idp_7 != null ? o.idp - o.idp_7 : null;
        return h('tr', { class: 'ind-tr', tabindex: 0, onclick: () => window.tfObra && tfObra.abrir(o.id), onkeydown: e => { if (e.key === 'Enter') tfObra.abrir(o.id); } },
          h('td', null, h('span', { class: 'ind-dot ' + f }), h('b', null, o.codigo), h('small', null, o.nome)),
          h('td', null, h('span', { class: 'ind-av-b' }, h('i', { class: 'r ' + f, style: `width:${Math.min(100, o.real)}%` }), o.previsto != null ? h('i', { class: 'p', style: `left:${Math.min(100, o.previsto)}%` }) : null),
            h('small', null, `${num(o.real, 1)}% / ${o.previsto == null ? '—' : num(o.previsto, 1) + '%'}`)),
          h('td', { class: o.desvio_pts < -1 ? 'vm' : '' }, o.desvio_pts == null ? '—' : (o.desvio_pts > 0 ? '+' : o.desvio_pts < 0 ? '−' : '') + num(Math.abs(o.desvio_pts), 1) + ' pts'),
          h('td', { class: o.farol === 'vermelho' ? 'vm' : '' }, o.idp == null ? '—' : num(o.idp, 2), sobe != null && Math.abs(sobe) >= 0.01 ? h('i', { class: 'fa-solid ' + (sobe > 0 ? 'fa-arrow-up vd' : 'fa-arrow-down vm') + ' ind-seta-t', title: 'vs 7 dias atrás' }) : null),
          h('td', null, dBRa(o.termino_previsto)), h('td', null, dBRa(o.termino_contrato)),
          h('td', { class: o.desvio_dias > 0 ? 'vm' : 'vd' }, o.desvio_dias == null ? '—' : o.desvio_dias > 0 ? `+${o.desvio_dias} dias` : o.desvio_dias < 0 ? `${-o.desvio_dias} dias de folga` : 'no dia'));
      }))));
  }
  function curvaS(C) {
    if (!C) return h('p', { class: 'ind-vazio' }, 'Sem cronograma para desenhar a curva.');
    const W = 1100, H = 290, L = 44, Rm = 16, T = 18, B = 30, P = C.pontos;
    const t0 = Date.parse(P[0].data), t1 = Date.parse(P[P.length - 1].data), x = d => L + (Date.parse(d) - t0) / Math.max(1, t1 - t0) * (W - L - Rm), y = v => T + (H - T - B) * (1 - v / 100);
    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ind-svg', role: 'img', 'aria-label': 'Curva S: avanço previsto, real e projeção' });
    [0, 25, 50, 75, 100].forEach(v => g.append(s('line', { x1: L, x2: W - Rm, y1: y(v), y2: y(v), class: 'ind-grade' }), s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ind-eixo' }, v + '%')));
    const meses = []; for (const p of P) { const m = p.data.slice(0, 7); if (!meses.includes(m)) meses.push(m); }
    const passoM = Math.ceil(meses.length / 8);
    meses.forEach((m, i) => { if (i % passoM) return; const d = m + '-01'; if (Date.parse(d) < t0) return; g.append(s('text', { x: x(d), y: H - 10, 'text-anchor': 'middle', class: 'ind-eixo' }, ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m.slice(5) - 1] + '/' + m.slice(2, 4))); });
    const linha = (k, cls) => { let d = ''; P.forEach(p => { if (p[k] == null) return; d += (d ? 'L' : 'M') + x(p.data).toFixed(1) + ' ' + y(p[k]).toFixed(1) + ' '; }); if (d) g.append(s('path', { d, class: cls })); };
    linha('previsto', 'ind-c-prev'); linha('projetado', 'ind-c-proj'); linha('real', 'ind-c-real');
    const marca = (d, cls, txt) => { if (!d || Date.parse(d) < t0 || Date.parse(d) > t1) return; const xx = x(d), dir = xx > W - 90; g.append(s('line', { x1: xx, x2: xx, y1: T, y2: H - B, class: cls }), s('text', { x: dir ? xx - 4 : xx + 4, y: T + 10, 'text-anchor': dir ? 'end' : 'start', class: 'ind-c-mt ' + cls }, txt)); };
    marca(C.hoje, 'ind-c-hoje', 'hoje'); marca(C.fim_contrato, 'ind-c-contr', 'contrato');
    const hj = P.find(p => p.hoje); if (hj) g.append(s('circle', { cx: x(hj.data), cy: y(hj.real), r: 4.5, class: 'ind-c-pt' }));
    const atraso = C.fim_projetado && C.fim_contrato ? Math.round((Date.parse(C.fim_projetado) - Date.parse(C.fim_contrato)) / 864e5) : null;
    return h('div', null,
      h('div', { class: 'ind-c-leg' }, h('span', null, h('i', { class: 'prev' }), 'previsto (linha de base)'), h('span', null, h('i', { class: 'real' }), 'real'), h('span', null, h('i', { class: 'proj' }), 'projeção pelo ritmo das últimas 4 semanas')),
      g,
      h('p', { class: 'ind-c-info' },
        hj ? h('span', null, 'Hoje: ', h('b', null, num(hj.real, 1) + '% feito'), ' de ', h('b', null, num(hj.previsto, 1) + '% previsto')) : null,
        h('span', null, 'Ritmo: ', h('b', null, num(C.ritmo_semana, 1) + ' pts/semana')),
        h('span', null, 'Término projetado: ', h('b', { class: atraso > 0 ? 'vm' : '' }, C.fim_projetado ? dBRa(C.fim_projetado) : 'sem ritmo para projetar'),
          C.fim_contrato ? ` (contrato ${dBRa(C.fim_contrato)}${atraso != null ? (atraso > 0 ? `, ${atraso} dias depois` : atraso < 0 ? `, ${-atraso} dias antes` : ', no dia') : ''})` : '')));
  }
  /* espinha de peixe: 3 ramos em cima, 3 embaixo; número = dias perdidos */
  function ishikawa(C) {
    const W = 1000, H = 360, meio = 180, cab = 840, R = C.ramos, max = Math.max(1, ...R.map(r => r.dias));
    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ind-svg ind-ish', role: 'img', 'aria-label': 'Diagrama de Ishikawa das causas dos atrasos' });
    g.append(s('line', { x1: 40, y1: meio, x2: cab, y2: meio, class: 'ind-espinha' }), s('polygon', { points: `${cab},${meio - 9} ${cab + 14},${meio} ${cab},${meio + 9}`, class: 'ind-seta' }));
    const cx = cab + 18 + (W - cab - 22) / 2;
    g.append(s('rect', { x: cab + 18, y: meio - 46, width: W - cab - 22, height: 92, rx: 12, class: 'ind-cab' }),
      s('text', { x: cx, y: meio - 10, 'text-anchor': 'middle', class: 'ind-cab-t' }, 'Atrasos'), s('text', { x: cx, y: meio + 12, 'text-anchor': 'middle', class: 'ind-cab-t' }, 'nas obras'),
      s('text', { x: cx, y: meio + 34, 'text-anchor': 'middle', class: 'ind-cab-n' }, `${C.total_dias} dias perdidos`));
    const xs = [215, 470, 725];
    R.forEach((r, i) => {
      const cima = i < 3, x0 = xs[i % 3], xTop = x0 - 110, yTop = cima ? 40 : H - 40, on = M.ramo === r.chave, yB = yTop + (cima ? 16 : -16);
      const nivel = r.dias === 0 ? 'z' : r.dias >= max * 0.66 ? 'a' : r.dias >= max * 0.33 ? 'm' : 'b';
      const sel = () => { M.ramo = on ? null : r.chave; guardar(); desenhar(); };
      const ramo = s('g', { class: `ind-ramo n${nivel}${on ? ' on' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${r.nome}: ${r.dias} dias perdidos em ${r.qtd} registro${r.qtd === 1 ? '' : 's'}`, 'data-ramo': r.chave,
        onclick: sel, onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sel(); } } });
      ramo.append(s('line', { x1: xTop, y1: yB, x2: x0 + 40, y2: meio, class: 'ind-osso' }),
        s('rect', { x: xTop - 92, y: cima ? yTop - 26 : yTop - 8, width: 184, height: 34, rx: 17, class: 'ind-ramo-cx' }),
        s('text', { x: xTop - 18, y: cima ? yTop - 4 : yTop + 14, 'text-anchor': 'middle', class: 'ind-ramo-t' }, r.nome),
        s('rect', { x: xTop + 42, y: cima ? yTop - 21 : yTop - 3, width: 44, height: 24, rx: 12, class: 'ind-ramo-q' }),
        s('text', { x: xTop + 64, y: cima ? yTop - 4 : yTop + 14, 'text-anchor': 'middle', class: 'ind-ramo-qt' }, r.dias + ' d'));
      r.grupos.slice(0, 3).forEach((gr, j) => {
        const t = (j + 1) / 4.2, gx = xTop + (x0 + 40 - xTop) * t, gy = yB + (meio - yB) * t;
        ramo.append(s('line', { x1: gx, y1: gy, x2: gx + 44, y2: gy, class: 'ind-galho' }), s('text', { x: gx + 48, y: gy + 4, class: 'ind-causa' }, `${gr.titulo} · ${gr.dias} d`));
      });
      if (!r.grupos.length) ramo.append(s('text', { x: (xTop + x0 + 40) / 2 + 10, y: (yTop + meio) / 2 + 4, class: 'ind-causa cz' }, 'nada registrado'));
      g.append(ramo);
    });
    return g;
  }
  function pareto(L, tot) {
    if (!L.length) return h('p', { class: 'ind-vazio' }, 'Nenhuma causa de atraso registrada no período.');
    const mx = L[0].dias;
    return h('div', { class: 'ind-par' }, L.map((c, i) => h('div', { class: 'ind-par-l' + (i === 0 || L[i - 1].acum < 80 ? ' foco' : '') },
      h('span', { class: 'ind-par-n' }, h('b', null, c.causa), h('small', null, `${c.ramo} · ${c.qtd} registro${c.qtd > 1 ? 's' : ''}`)),
      h('span', { class: 'ind-par-b' }, h('i', { style: `width:${Math.max(3, c.dias / mx * 100)}%` })),
      h('span', { class: 'ind-par-v' }, `${c.dias} d`, h('small', null, `${c.pct}% · acum. ${c.acum}%`)))),
      h('p', { class: 'ind-leg' }, ic('fa-bullseye'), ` Em destaque: as causas que somam até 80% dos ${tot} dias perdidos. Atacar estas primeiro.`));
  }
  function detalheRamo(r) {
    if (!r) return h('p', { class: 'ind-dica' }, ic('fa-hand-pointer'), ' Clique num ramo para ver os registros.');
    return h('div', { class: 'ind-det-ramo' },
      h('div', { class: 'ind-det-t' }, h('b', null, `${r.nome} · ${r.dias} dias perdidos · ${r.qtd} registro${r.qtd === 1 ? '' : 's'}`), h('button', { class: 'ind-x', 'aria-label': 'Fechar', onclick: () => { M.ramo = null; guardar(); desenhar(); } }, ic('fa-xmark'))),
      r.grupos.length ? h('div', { class: 'ind-grupos' }, r.grupos.map(g => h('section', { class: 'ind-grupo' }, h('h4', null, g.titulo, h('span', null, `${g.dias} d`)), g.itens.map(it => linhaItem({ ...it, sub: `${it.sub} · ${it.dias} d` })))))
        : h('p', { class: 'ind-vazio' }, 'Nada registrado neste ramo no período.'));
  }
  function pendencias(G) {
    if (!G.length) return h('p', { class: 'ind-vazio ok' }, ic('fa-circle-check'), ' Nenhuma pendência de controle.');
    return h('div', { class: 'ind-pend' }, G.map(g => {
      const aberto = !!M.aberto[g.chave], mostra = aberto ? g.itens : g.itens.slice(0, 3);
      return h('section', { class: 'ind-pend-g' + (g.chave === 'sem_causa' ? ' alerta' : '') },
        h('h4', null, g.titulo, h('span', null, g.qtd)), h('p', { class: 'ind-pend-d' }, g.dica), mostra.map(linhaItem),
        g.itens.length > 3 ? h('button', { class: 'ind-mais-bt', onclick: () => { M.aberto[g.chave] = !aberto; desenhar(); } }, aberto ? 'Mostrar menos' : `Ver todos (${g.qtd})`) : null);
    }));
  }
  function barras(L, campo, rot, limite) {
    if (!L.length) return h('p', { class: 'ind-vazio' }, 'Nada para mostrar.');
    const mx = Math.max(limite || 100, ...L.map(x => Math.min(300, x[campo])));
    return h('div', { class: 'ind-bar' }, L.map(x => h('div', { class: 'ind-bar-l', title: x.obras || '' },
      h('span', { class: 'ind-bar-n' }, x.nome), h('span', { class: 'ind-bar-b' }, h('i', { class: x[campo] > (limite || 100) ? 'vm' : x[campo] >= 85 ? 'am' : '', style: `width:${Math.min(100, x[campo] / mx * 100)}%` }), limite ? h('em', { style: `left:${limite / mx * 100}%` }) : null),
      h('span', { class: 'ind-bar-v' }, x[campo] >= 999 ? 'sem dias úteis' : x[campo] + rot))));
  }

  /* ── tela ────────────────────────────────────── */
  function desenhar() {
    const v = document.getElementById('view-graficos'); if (!v || !v.classList.contains('active')) return;
    const R = raiz(); if (!R) return;
    const antigos = v.querySelector('.ind-antigos');
    if (!pode() || M.negado) { R.innerHTML = ''; R.hidden = true; if (antigos) antigos.style.display = 'grid'; return; }
    if (antigos) antigos.style.display = 'none';           // a gestão vê o painel novo; os gráficos antigos ficam para os outros perfis
    R.hidden = false; const y = window.scrollY; R.innerHTML = '';
    const d = M.d;
    const sel = h('select', { class: 'ind-sel-obra', 'aria-label': 'Obra', onchange: e => { M.obra = e.target.value; M.ramo = null; guardar(); carregar(); } },
      h('option', { value: '' }, 'Todas as obras em andamento'), (d ? d.obras : []).map(o => h('option', { value: o.id, selected: String(o.id) === String(M.obra) }, `${o.codigo ? o.codigo + ' · ' : ''}${o.nome}`)));
    const per = h('div', { class: 'ind-seg', role: 'group', 'aria-label': 'Período' }, [[7, '7 dias'], [28, '4 semanas'], [90, '90 dias']].map(([n, t]) =>
      h('button', { class: M.periodo === n ? 'on' : '', 'aria-pressed': M.periodo === n ? 'true' : 'false', onclick: () => { if (M.periodo === n) return; M.periodo = n; guardar(); carregar(); } }, t)));
    R.append(h('div', { class: 'ind-cab-tela' },
      h('div', null, h('h2', null, 'Gráficos e indicadores'), h('p', null, d ? `Atualizado às ${d.agora} · período de ${dBR(d.desde)} a ${dBR(d.hoje)}` : 'Carregando…', M.carregando && d ? ' · atualizando…' : '')),
      h('div', { class: 'ind-ctr' }, sel, per,
        h('button', { class: 'ind-bt', onclick: () => window.print(), title: 'Gera o PDF pela impressão do navegador (escolha "Salvar como PDF")' }, ic('fa-file-pdf'), ' Exportar PDF'),
        eu().perfil === 'administrador' ? h('button', { class: 'ind-bt', onclick: () => window.tfEmpresa && tfEmpresa.abrir('regras') }, ic('fa-bullseye'), ' Metas') : null)));
    if (!d) { R.append(h('p', { class: 'ind-vazio' }, M.erro || 'Carregando…')); return; }
    if (M.erro) R.append(h('p', { class: 'ind-erro' }, M.erro));
    R.append(h('div', { class: 'ind-resumo', role: 'status' }, ic('fa-lightbulb'), h('span', null, d.resumo)));
    R.append(h('div', { class: 'ind-kpis' }, d.kpis.map(cartao)));
    R.append(secao('Prazo das obras', 'da mais atrasada para a mais adiantada · clique para abrir', tabelaPrazo(d.prazo_obras)));
    R.append(h('div', { class: 'ind-c-box' }, secao('Curva S', d.curva ? d.curva.titulo : '', curvaS(d.curva))));
    const ramo = d.causas.ramos.find(r => r.chave === M.ramo) || null;
    R.append(secao('Causas dos atrasos', `em dias perdidos · Travou, compromissos não cumpridos e atividades sem responsável do período${d.causas.sem_causa ? ` · ${d.causas.sem_causa} atraso${d.causas.sem_causa > 1 ? 's' : ''} sem causa registrada (veja as pendências)` : ''}`,
      h('div', { class: 'ind-causas' }, h('div', { class: 'ind-ish-box' }, ishikawa(d.causas)), h('div', { class: 'ind-par-box' }, h('h4', null, 'Pareto · o que atacar primeiro'), pareto(d.causas.pareto, d.causas.total_dias))),
      detalheRamo(ramo)));
    R.append(secao('Pendências de controle', 'não atrasam a obra sozinhas, mas deixam os números incompletos ou criam risco', pendencias(d.pendencias)));
    R.append(h('div', { class: 'ind-duas' },
      secao('Carga da equipe', '% da capacidade nos próximos 14 dias · linha = 100%', barras(d.equipe, 'carga', '%', 100)),
      secao('Ocupação dos equipamentos', '% dos próximos 14 dias com reserva', barras(d.equipamentos, 'ocupacao', '%'))));
    window.scrollTo(0, y);
  }

  /* ── ligação com o menu ─────────────────────── */
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome !== 'graficos') fecharGaveta();
    if (nome === 'graficos') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Gráficos e indicadores'; desenhar(); carregar(); }
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); desenhar(); } }; })());
  window.tfIndicadores = { abrir: () => window.switchView('graficos', document.querySelector(`.sidebar [onclick*="'graficos'"]`)), estado: M, recarregar: carregar };
})();
