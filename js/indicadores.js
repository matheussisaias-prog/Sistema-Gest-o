/* Aprumo · indicadores.js — tela Gráficos: quadro SQDCP com os 5 indicadores mais usados na indústria
   (Segurança, Qualidade, Entrega, Custo, Pessoas), PPC por semana, avanço real × previsto por obra
   e o diagrama de Ishikawa (6M) com as causas dos atrasos. Os gráficos antigos continuam embaixo.
   Só administrador e gestor veem os indicadores; os outros perfis veem só os gráficos antigos. */
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
  const num = (v, c = 0) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const pode = () => { const u = window.tfServidor && tfServidor.estado && tfServidor.estado.usuario; return !u || ['administrador', 'gestor'].includes(u.perfil); };

  const M = { d: null, erro: null, obra: '', ramo: null, carregando: false, negado: false };
  { const v = window.tfEstado && tfEstado.ler('indicadores'); if (v) { M.obra = v.obra || ''; M.ramo = v.ramo || null; } }   // F5: mesma obra e mesmo ramo aberto
  const guardar = () => window.tfEstado && tfEstado.gravar('indicadores', { obra: M.obra, ramo: M.ramo });

  function raiz() {
    const v = document.getElementById('view-graficos'); if (!v) return null;
    let r = document.getElementById('ind-raiz');
    if (!r) {
      r = h('div', { id: 'ind-raiz', class: 'ind' }); v.prepend(r);
      const antigos = v.querySelector(':scope > div:not(#ind-raiz)');
      if (antigos && !v.querySelector('.ind-antigos-t')) antigos.before(h('h2', { class: 'ind-antigos-t' }, 'Gráficos do cronograma'));
    }
    return r;
  }
  async function carregar() {
    if (!pode()) return;
    M.carregando = true; desenhar();
    try { M.d = await api('indicadores' + (M.obra ? '?obra=' + encodeURIComponent(M.obra) : '')); M.erro = null; }
    catch (e) { if (e.status === 403) M.negado = true; else M.erro = e.message; }
    M.carregando = false; desenhar();
  }

  /* ── desenho ─────────────────────────────────── */
  const FAROL = { verde: 'vd', amarelo: 'am', vermelho: 'vm', cinza: 'cz' };
  const TXT_FAROL = { verde: 'Dentro da meta', amarelo: 'Atenção', vermelho: 'Fora da meta', cinza: 'Sem dados' };
  function valor(k) {
    const v = k.valor;
    if (v == null) return '—';
    if (k.formato === '%') return num(v) + '%';
    if (k.formato === 'indice') return num(v, 2);
    if (k.formato === 'dias') return num(v) + (v === 1 ? ' dia' : ' dias');
    if (k.formato === 'dias_dec') return num(v, 1) + (v <= 1 ? ' dia' : ' dias');
    return String(v);
  }
  function cartao(k) {
    const f = FAROL[k.farol] || 'cz';
    return h('article', { class: 'ind-kpi ' + f, 'data-kpi': k.chave },
      h('div', { class: 'ind-kpi-t' }, h('span', { class: 'ind-letra ' + f, 'aria-hidden': 'true' }, k.chave), h('span', null, h('b', null, k.nome), h('small', null, k.titulo)),
        h('button', { class: 'ind-info', 'aria-label': 'O que é ' + k.titulo, title: k.explica, onclick: e => { const p = e.currentTarget.closest('.ind-kpi').querySelector('.ind-exp'); p.hidden = !p.hidden; } }, ic('fa-circle-info'))),
      h('div', { class: 'ind-val' }, valor(k)),
      h('div', { class: 'ind-meta' }, h('span', { class: 'ind-sel ' + f }, TXT_FAROL[k.farol] || ''), h('span', null, 'Meta: ' + k.meta)),
      h('p', { class: 'ind-det' }, k.detalhe),
      h('p', { class: 'ind-exp', hidden: true }, k.explica));
  }
  function graficoPPC(sem) {
    const W = 520, H = 210, L = 34, B = 30, T = 14, larg = (W - L - 10) / sem.length, y = v => T + (H - T - B) * (1 - v / 100);
    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ind-svg', role: 'img', 'aria-label': 'PPC por semana' });
    [0, 50, 100].forEach(v => g.append(s('line', { x1: L, x2: W - 6, y1: y(v), y2: y(v), class: 'ind-grade' }), s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ind-eixo' }, v + '%')));
    sem.forEach((w, i) => {
      const x = L + i * larg + larg * 0.18, bw = larg * 0.64, v = w.ppc;
      if (v != null) {
        const cls = v >= 80 ? 'vd' : v >= 60 ? 'am' : 'vm';
        g.append(s('rect', { x, y: y(v), width: bw, height: Math.max(2, y(0) - y(v)), rx: 5, class: 'ind-barra ' + cls }, s('title', null, `${dBR(w.inicio)} a ${dBR(w.fim)}: ${w.concluidas} de ${w.planejadas} no prazo`)),
          s('text', { x: x + bw / 2, y: y(v) - 5, 'text-anchor': 'middle', class: 'ind-rot' }, v + '%'));
      } else g.append(s('text', { x: x + bw / 2, y: y(0) - 6, 'text-anchor': 'middle', class: 'ind-eixo' }, 'sem plano'));
      g.append(s('text', { x: x + bw / 2, y: H - 10, 'text-anchor': 'middle', class: 'ind-eixo' }, 'sem ' + dBR(w.inicio)));
    });
    g.append(s('line', { x1: L, x2: W - 6, y1: y(80), y2: y(80), class: 'ind-metal' }), s('text', { x: W - 8, y: y(80) - 5, 'text-anchor': 'end', class: 'ind-metat' }, 'meta 80%'));
    return g;
  }
  function graficoAvanco(L) {
    if (!L.length) return h('p', { class: 'ind-vazio' }, 'Sem atividades nas obras.');
    return h('div', { class: 'ind-av' }, L.map(o => {
      const atras = o.previsto != null && o.real < o.previsto - 1;
      return h('button', { class: 'ind-av-l', onclick: () => window.tfObra && tfObra.abrir(o.id), title: `Abrir ${o.codigo}` },
        h('span', { class: 'ind-av-n' }, o.codigo),
        h('span', { class: 'ind-av-b' }, h('i', { class: 'r' + (atras ? ' atras' : ''), style: `width:${Math.min(100, o.real)}%` }), o.previsto != null ? h('i', { class: 'p', style: `left:${Math.min(100, o.previsto)}%` }) : null),
        h('span', { class: 'ind-av-v' + (atras ? ' atras' : '') }, `${num(o.real, 1)}% / ${o.previsto == null ? '—' : num(o.previsto, 1) + '%'}`));
    }), h('p', { class: 'ind-leg' }, h('i', { class: 'r' }), ' real  ', h('i', { class: 'p' }), ' previsto hoje'));
  }
  /* espinha de peixe: 3 ramos em cima, 3 embaixo, cabeça à direita com o efeito */
  function ishikawa(I) {
    const W = 1000, H = 360, meio = 180, cab = 840, R = I.ramos, max = Math.max(1, ...R.map(r => r.qtd));
    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ind-svg ind-ish', role: 'img', 'aria-label': 'Diagrama de Ishikawa das causas de atraso' });
    g.append(s('line', { x1: 40, y1: meio, x2: cab, y2: meio, class: 'ind-espinha' }), s('polygon', { points: `${cab},${meio - 9} ${cab + 14},${meio} ${cab},${meio + 9}`, class: 'ind-seta' }));
    g.append(s('rect', { x: cab + 18, y: meio - 46, width: W - cab - 22, height: 92, rx: 12, class: 'ind-cab' }),
      s('text', { x: cab + 18 + (W - cab - 22) / 2, y: meio - 10, 'text-anchor': 'middle', class: 'ind-cab-t' }, 'Atrasos'),
      s('text', { x: cab + 18 + (W - cab - 22) / 2, y: meio + 12, 'text-anchor': 'middle', class: 'ind-cab-t' }, 'nas obras'),
      s('text', { x: cab + 18 + (W - cab - 22) / 2, y: meio + 34, 'text-anchor': 'middle', class: 'ind-cab-n' }, `${I.atrasadas} atrasada${I.atrasadas === 1 ? '' : 's'}`));
    const xs = [215, 470, 725];
    R.forEach((r, i) => {
      const cima = i < 3, x0 = xs[i % 3], xTop = x0 - 110, yTop = cima ? 40 : H - 40, on = M.ramo === r.chave;
      const nivel = r.qtd === 0 ? 'z' : r.qtd >= max * 0.66 ? 'a' : r.qtd >= max * 0.33 ? 'm' : 'b';
      const ramo = s('g', { class: `ind-ramo n${nivel}${on ? ' on' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${r.nome}: ${r.qtd} causa${r.qtd === 1 ? '' : 's'}`, 'data-ramo': r.chave,
        onclick: () => { M.ramo = on ? null : r.chave; guardar(); desenhar(); },
        onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); M.ramo = on ? null : r.chave; guardar(); desenhar(); } } });
      ramo.append(s('line', { x1: xTop, y1: yTop + (cima ? 16 : -16), x2: x0 + 40, y2: meio, class: 'ind-osso' }));
      ramo.append(s('rect', { x: xTop - 82, y: cima ? yTop - 26 : yTop - 8, width: 164, height: 34, rx: 17, class: 'ind-ramo-cx' }),
        s('text', { x: xTop - 10, y: cima ? yTop - 4 : yTop + 14, 'text-anchor': 'middle', class: 'ind-ramo-t' }, r.nome),
        s('circle', { cx: xTop + 62, cy: cima ? yTop - 9 : yTop + 9, r: 13, class: 'ind-ramo-q' }),
        s('text', { x: xTop + 62, y: cima ? yTop - 5 : yTop + 13, 'text-anchor': 'middle', class: 'ind-ramo-qt' }, r.qtd));
      // causas ao longo do osso
      r.grupos.slice(0, 3).forEach((gr, j) => {
        const t = (j + 1) / 4.2, cx = xTop + (x0 + 40 - xTop) * t, cy = (yTop + (cima ? 16 : -16)) + (meio - (yTop + (cima ? 16 : -16))) * t;
        ramo.append(s('line', { x1: cx, y1: cy, x2: cx + 44, y2: cy, class: 'ind-galho' }),
          s('text', { x: cx + 48, y: cy + 4, class: 'ind-causa' }, `${gr.titulo.length > 30 ? gr.titulo.slice(0, 29) + '…' : gr.titulo} (${gr.qtd})`));
      });
      if (!r.grupos.length) ramo.append(s('text', { x: (xTop + x0 + 40) / 2 + 10, y: (yTop + meio) / 2 + 4, class: 'ind-causa cz' }, 'nada encontrado'));
      g.append(ramo);
    });
    return g;
  }
  function detalheRamo(r) {
    if (!r) return h('p', { class: 'ind-dica' }, ic('fa-hand-pointer'), ' Clique num ramo para ver as causas.');
    return h('div', { class: 'ind-det-ramo' },
      h('div', { class: 'ind-det-t' }, h('b', null, `${r.nome} · ${r.qtd} causa${r.qtd === 1 ? '' : 's'}`), h('button', { class: 'ind-x', 'aria-label': 'Fechar', onclick: () => { M.ramo = null; guardar(); desenhar(); } }, ic('fa-xmark'))),
      r.grupos.length ? h('div', { class: 'ind-grupos' }, r.grupos.map(g => h('section', { class: 'ind-grupo' },
        h('h4', null, g.titulo, h('span', null, g.qtd)),
        g.itens.map(it => it.projeto_id ? h('button', { class: 'ind-item', onclick: () => abrirAtividade(it.projeto_id, it.atividade_id) }, h('b', null, it.texto), h('small', null, it.sub))
          : h('div', { class: 'ind-item' }, h('b', null, it.texto), h('small', null, it.sub))),
        g.qtd > g.itens.length ? h('small', { class: 'ind-mais' }, `e mais ${g.qtd - g.itens.length}`) : null)))
        : h('p', { class: 'ind-vazio' }, 'Nenhuma causa deste tipo nas obras escolhidas.'));
  }
  async function abrirAtividade(pid, aid) {
    if (!window.tfObra || !pid) return;
    await tfObra.abrir(pid);
    if (aid) { const a = ((tfObra.estado.d || {}).atividades || []).find(x => x.id === aid); if (a) tfObra.painel(a); }
  }
  function desenhar() {
    const v = document.getElementById('view-graficos'); if (!v || !v.classList.contains('active')) return;
    const R = raiz(); if (!R) return;
    if (!pode() || M.negado) { R.innerHTML = ''; R.hidden = true; return; }
    R.hidden = false; R.innerHTML = '';
    const d = M.d;
    const sel = h('select', { class: 'ind-sel-obra', 'aria-label': 'Obra', onchange: e => { M.obra = e.target.value; M.ramo = null; guardar(); carregar(); } },
      h('option', { value: '' }, 'Todas as obras em andamento'), (d ? d.obras : []).map(o => h('option', { value: o.id, selected: String(o.id) === String(M.obra) }, `${o.codigo ? o.codigo + ' · ' : ''}${o.nome}`)));
    R.append(h('div', { class: 'ind-cab-tela' },
      h('div', null, h('h2', null, 'Indicadores SQDCP'), h('p', null, 'Os 5 indicadores do quadro usado na indústria: Segurança, Qualidade, Entrega, Custo e Pessoas.')),
      sel, M.carregando && d ? h('small', { class: 'ind-at' }, 'Atualizando…') : null));
    if (!d) { R.append(h('p', { class: 'ind-vazio' }, M.erro || 'Carregando…')); return; }
    if (M.erro) R.append(h('p', { class: 'ind-erro' }, M.erro));
    R.append(h('div', { class: 'ind-kpis' }, d.kpis.map(cartao)));
    R.append(h('div', { class: 'ind-duas' },
      h('section', { class: 'ind-card' }, h('h3', null, 'Entrega · PPC por semana', h('small', null, 'atividades que terminaram no dia previsto')), graficoPPC(d.ppc_semanas)),
      h('section', { class: 'ind-card' }, h('h3', null, 'Avanço real × previsto por obra', h('small', null, 'clique para abrir a obra')), graficoAvanco(d.avanco_obras))));
    const ramo = d.ishikawa.ramos.find(r => r.chave === M.ramo) || null;
    R.append(h('section', { class: 'ind-card ind-ish-card' },
      h('h3', null, 'Ishikawa · causas dos atrasos (6M)', h('small', null, 'Travou e ocorrências dos últimos 90 dias, documentos, equipamentos e registros de hoje')),
      h('div', { class: 'ind-ish-box' }, ishikawa(d.ishikawa)), detalheRamo(ramo)));
  }

  /* ── ligação com o menu ─────────────────────── */
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome === 'graficos') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Gráficos e indicadores'; desenhar(); carregar(); }
  };
  window.tfIndicadores = { abrir: () => window.switchView('graficos', document.querySelector(`.sidebar [onclick*="'graficos'"]`)), estado: M, recarregar: carregar };
})();
