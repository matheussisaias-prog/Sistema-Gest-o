/* Aprumo · obra-plano.js — abas da obra:
   - "Plano da semana" (Last Planner): a equipe se compromete com o avanço de cada atividade na semana; o sistema mede
     sozinho, pelo avanço lançado, o que foi cumprido (PPC) e pede o motivo do que não foi.
   - "Custos" (só gestão): custo orçado, lançamentos de custo realizado, valor agregado, IDC e estimativa no término. */
(() => {
  'use strict';
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
  const dBRa = s => s ? dBR(s) + '/' + s.slice(0, 4) : '—';
  const mais = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const num = (v, c = 0) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const reais = v => v == null ? '—' : 'R$ ' + num(v, 2);
  const SIT = { cumprido: ['Cumprido', 'ok'], andamento: ['Em andamento', 'az'], nao_cumprido: ['Não cumprido', 'vc'] };
  const P = { semana: {} };   // semana vista por obra

  /* ══ Plano da semana ═════════════════════════════════════════ */
  function plano(O, c) {
    const { h, ic, api, avisar, modal } = c;
    const box = h('div', { class: 'op' }, h('div', { class: 'ob-vazio' }, ic('fa-spinner fa-spin'), h('p', null, 'Carregando o plano da semana…')));
    async function carregar() {
      let d; try { d = await api(`obras/${O.id}/plano` + (P.semana[O.id] ? '?semana=' + P.semana[O.id] : '')); } catch (e) { box.innerHTML = ''; box.append(h('div', { class: 'ob-vazio' }, h('p', null, e.message))); return; }
      P.semana[O.id] = d.semana; desenharP(d);
    }
    const irSemana = n => { P.semana[O.id] = mais(P.semana[O.id], 7 * n); carregar(); };
    function desenharP(d) {
      box.innerHTML = '';
      const L = d.compromissos, cumpr = L.filter(x => x.situacao === 'cumprido').length;
      const selo = d.fechada ? (d.ppc == null ? 'Sem compromissos' : `PPC ${d.ppc}%`) : L.length ? `${cumpr} de ${L.length} já cumpridos` : 'Sem compromissos ainda';
      box.append(h('div', { class: 'op-cab' },
        h('div', { class: 'op-sem' }, h('button', { class: 'og-x', 'aria-label': 'Semana anterior', onclick: () => irSemana(-1) }, ic('fa-chevron-left')),
          h('div', null, h('b', null, `Semana de ${dBR(d.semana)} a ${dBR(d.fim)}`), h('small', null, d.atual ? 'semana atual' : d.fechada ? 'semana fechada' : 'semana futura')),
          h('button', { class: 'og-x', 'aria-label': 'Próxima semana', onclick: () => irSemana(1) }, ic('fa-chevron-right'))),
        h('span', { class: 'op-ppc ' + (d.fechada && d.ppc != null ? (d.ppc >= 80 ? 'ok' : d.ppc >= 60 ? 'ven' : 'vc') : 'az') }, selo),
        h('p', { class: 'op-dica' }, ic('fa-circle-info'), ' Last Planner: comprometa só o que a equipe consegue cumprir de verdade. O sistema confere pelo avanço lançado; no fim da semana, o que não cumpriu pede o motivo.')));
      // histórico do PPC (8 semanas)
      const H = d.historico;
      box.append(h('div', { class: 'op-hist', 'aria-label': 'PPC das últimas 8 semanas' }, H.map(s => h('div', { class: 'op-hb', title: s.ppc == null ? (s.comprometidas ? `${s.cumpridas} de ${s.comprometidas} (semana em andamento)` : 'sem plano') : `${s.cumpridas} de ${s.comprometidas} cumpridos` },
        h('span', { class: 'op-hb-v' }, s.ppc == null ? (s.comprometidas ? '…' : '—') : s.ppc + '%'),
        h('span', { class: 'op-hb-b' }, h('i', { class: s.ppc == null ? '' : s.ppc >= 80 ? 'ok' : s.ppc >= 60 ? 'ven' : 'vc', style: `height:${s.ppc == null ? 4 : Math.max(4, s.ppc)}%` })),
        h('small', null, dBR(s.semana))))));
      // compromissos
      const sec = h('section', { class: 'op-sec' }, h('h3', null, 'Compromissos da semana', h('small', null, `${L.length}`)));
      if (!L.length) sec.append(h('p', { class: 'og-sub' }, d.pode_editar ? 'Nenhuma atividade comprometida. Escolha embaixo.' : 'Nenhum compromisso nesta semana.'));
      L.forEach(x => {
        const [st, cls] = SIT[x.situacao];
        const motivo = h('select', { class: 'ob-sel op-mot', 'aria-label': 'Motivo de não cumprir', onchange: async e => { try { await api('plano/' + x.id, 'PATCH', { motivo: e.target.value }); avisar('Motivo registrado.', 'success'); } catch (er) { avisar(er.message, 'error'); } } },
          h('option', { value: '' }, x.situacao === 'nao_cumprido' ? 'Por que não cumpriu?' : 'Motivo (se houver)'), d.motivos.map(m => h('option', { value: m.id, selected: x.motivo === m.id }, m.nome)));
        sec.append(h('div', { class: 'op-lin ' + cls },
          h('div', { class: 'op-lin-t' }, h('b', null, (x.codigo_eap ? x.codigo_eap + ' · ' : '') + x.descricao), h('small', null, `${x.responsavel || 'sem responsável'} · ${dBR(x.inicio)} → ${dBR(x.fim)}`)),
          h('div', { class: 'op-lin-av' }, h('span', { class: 'op-bar' }, h('i', { class: 'ini', style: `width:${x.avanco_inicio}%` }), h('i', { class: 'av', style: `width:${Math.min(x.avanco, 100)}%` }), h('em', { style: `left:${x.meta}%`, title: 'meta' })),
            h('small', null, `${x.avanco}% · meta `, d.pode_editar ? h('input', { type: 'number', class: 'op-meta', min: x.avanco_inicio + 1, max: 100, value: x.meta, 'aria-label': 'Meta de avanço',
              onchange: async e => { try { await api('plano/' + x.id, 'PATCH', { meta: +e.target.value }); carregar(); } catch (er) { avisar(er.message, 'error'); } } }) : `${x.meta}`, '%')),
          h('span', { class: 'ob-tipo op-st ' + cls }, st),
          x.situacao !== 'cumprido' ? motivo : h('span'),
          d.pode_editar ? h('button', { class: 'og-x', 'aria-label': 'Tirar do plano', title: 'Tirar do plano', onclick: async () => { try { await api('plano/' + x.id, 'DELETE'); carregar(); } catch (er) { avisar(er.message, 'error'); } } }, ic('fa-xmark')) : h('span')));
      });
      box.append(sec);
      // adicionar
      if (d.pode_editar) {
        const sel = new Map();
        const ad = h('section', { class: 'op-sec' }, h('h3', null, 'Adicionar ao plano', h('small', null, 'atrasadas primeiro · meta sugerida pelo cronograma')));
        if (!d.candidatas.length) ad.append(h('p', { class: 'og-sub' }, 'Nenhuma atividade aberta para esta semana.'));
        const bt = h('button', { class: 'ob-bt og-bt-p', disabled: true, onclick: async () => {
          const itens = [...sel.entries()].map(([id, meta]) => ({ atividade_id: id, meta }));
          bt.disabled = true;
          try { const r = await api(`obras/${O.id}/plano`, 'POST', { semana: d.semana, itens }); avisar(`${r.salvos} compromisso${r.salvos > 1 ? 's' : ''} no plano.`, 'success'); carregar(); } catch (e) { bt.disabled = false; avisar(e.message, 'error'); }
        } }, ic('fa-check'), ' Comprometer');
        const atual = () => { bt.disabled = !sel.size; bt.lastChild.textContent = sel.size ? ` Comprometer ${sel.size} atividade${sel.size > 1 ? 's' : ''}` : ' Comprometer'; };
        d.candidatas.forEach(a => {
          const meta = h('input', { type: 'number', class: 'op-meta', min: a.avanco + 1, max: 100, value: Math.min(100, a.sugestao), 'aria-label': 'Meta de avanço', onchange: () => { if (sel.has(a.atividade_id)) sel.set(a.atividade_id, +meta.value); } });
          const ck = h('input', { type: 'checkbox', 'aria-label': 'Comprometer ' + a.descricao, onchange: e => { if (e.target.checked) sel.set(a.atividade_id, +meta.value); else sel.delete(a.atividade_id); atual(); } });
          ad.append(h('label', { class: 'op-cand' + (a.atrasada ? ' atr' : '') }, ck,
            h('div', { class: 'op-lin-t' }, h('b', null, (a.codigo_eap ? a.codigo_eap + ' · ' : '') + a.descricao), h('small', null, `${a.responsavel || 'sem responsável'} · ${dBR(a.inicio)} → ${dBR(a.fim)} · hoje ${a.avanco}%${a.atrasada ? ' · atrasada' : ''}`)),
            h('span', { class: 'op-meta-l' }, 'meta ', meta, '%')));
        });
        if (d.candidatas.length) ad.append(h('div', { class: 'op-pe' }, bt));
        box.append(ad);
      }
    }
    carregar();
    return box;
  }

  /* ══ Custos ══════════════════════════════════════════════════ */
  function custos(O, c) {
    const { h, ic, api, avisar, modal } = c;
    const box = h('div', { class: 'op' }, h('div', { class: 'ob-vazio' }, ic('fa-spinner fa-spin'), h('p', null, 'Carregando os custos…')));
    async function carregar() {
      let d; try { d = await api(`obras/${O.id}/custos`); } catch (e) { box.innerHTML = ''; box.append(h('div', { class: 'ob-vazio' }, h('p', null, e.message))); return; }
      desenharC(d);
    }
    function grafico(S) {
      if (S.length < 1) return null;
      const NS = 'http://www.w3.org/2000/svg', sv = (t, a, ...f) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a || {})) if (v != null) e.setAttribute(k, v); f.forEach(x => e.append(x.nodeType ? x : document.createTextNode(x))); return e; };
      const W = 700, H = 200, L = 64, B = 24, T = 10, mx = Math.max(1, ...S.flatMap(p => [p.custo_real, p.valor_agregado, p.valor_planejado || 0]));
      const x = i => L + (S.length === 1 ? (W - L - 10) / 2 : i * (W - L - 10) / (S.length - 1)), y = v => T + (H - T - B) * (1 - v / mx);
      const g = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'op-svg', role: 'img', 'aria-label': 'Custo realizado × valor agregado por mês' });
      [0, .5, 1].forEach(f => g.append(sv('line', { x1: L, x2: W - 10, y1: y(mx * f), y2: y(mx * f), class: 'op-grade' }), sv('text', { x: L - 6, y: y(mx * f) + 4, 'text-anchor': 'end', class: 'op-eixo' }, mx * f >= 1e6 ? num(mx * f / 1e6, 1) + ' mi' : num(mx * f / 1e3) + ' mil')));
      S.forEach((p, i) => g.append(sv('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'op-eixo' }, p.mes.slice(5) + '/' + p.mes.slice(2, 4))));
      const lin = (k, cls) => { let d = ''; S.forEach((p, i) => { if (p[k] == null) return; d += (d ? 'L' : 'M') + x(i) + ' ' + y(p[k]) + ' '; }); g.append(sv('path', { d, class: cls })); S.forEach((p, i) => { if (p[k] != null) g.append(sv('circle', { cx: x(i), cy: y(p[k]), r: 3, class: cls + '-p' })); }); };
      lin('valor_planejado', 'op-l-vp'); lin('valor_agregado', 'op-l-va'); lin('custo_real', 'op-l-cr');
      return g;
    }
    function desenharC(d) {
      box.innerHTML = '';
      const r = d.resumo;
      const k = (t, v, s, cls) => h('div', { class: 'op-k ' + (cls || '') }, h('small', null, t), h('b', null, v), s ? h('span', null, s) : null);
      const idcCls = r.idc == null ? '' : r.idc >= 0.95 ? 'ok' : r.idc >= 0.85 ? 'ven' : 'vc';
      box.append(h('div', { class: 'op-ks' },
        k('Custo orçado', reais(r.orcamento), r.orcamento_proprio ? 'orçamento da obra' : r.orcamento ? 'usando o valor do contrato' : 'informe o orçamento'),
        k('Gasto até hoje', reais(r.custo_real), `${num(r.real, 1)}% da obra feito`),
        k('Valor agregado', reais(r.valor_agregado), 'orçado × % feito'),
        k('IDC (CPI)', r.idc == null ? '—' : num(r.idc, 2), r.idc == null ? 'lance custos para medir' : r.idc >= 1 ? 'gastando dentro do orçado' : `gastando ${num((1 / r.idc - 1) * 100)}% a mais`, idcCls),
        k('Estimativa no término', reais(r.estimativa_termino), r.estimativa_termino && r.orcamento ? (r.estimativa_termino > r.orcamento ? `${reais(r.estimativa_termino - r.orcamento)} acima do orçado` : 'dentro do orçado') : 'orçado ÷ IDC', r.estimativa_termino > r.orcamento ? 'vc' : '')));
      // orçamento
      const orc = h('input', { type: 'number', min: 0, step: '0.01', class: 'em-in op-orc', value: d.orcamento ?? '', placeholder: d.valor_contrato ? `contrato: ${num(d.valor_contrato, 2)}` : 'R$', 'aria-label': 'Custo orçado da obra' });
      box.append(h('section', { class: 'op-sec op-orc-l' }, h('label', null, h('b', null, 'Custo orçado da obra'), h('small', null, 'Quanto a obra deve custar (não é o preço de venda). Sem ele, o valor do contrato é usado.')), orc,
        h('button', { class: 'ob-bt', onclick: async () => { try { await api('projetos/' + O.id, 'PATCH', { orcamento: orc.value === '' ? null : +orc.value }); avisar('Orçamento salvo.', 'success'); carregar(); } catch (e) { avisar(e.message, 'error'); } } }, 'Salvar')));
      // gráfico e categorias
      const g = grafico(d.serie), mxC = Math.max(1, ...d.categorias.map(x => x.valor));
      box.append(h('div', { class: 'op-duas' },
        h('section', { class: 'op-sec' }, h('h3', null, 'Gasto × valor agregado por mês'), h('div', { class: 'op-leg' }, h('span', null, h('i', { class: 'cr' }), 'gasto acumulado'), h('span', null, h('i', { class: 'va' }), 'valor agregado'), h('span', null, h('i', { class: 'vp' }), 'valor planejado')), g || h('p', { class: 'og-sub' }, 'Sem lançamentos.')),
        h('section', { class: 'op-sec' }, h('h3', null, 'Por categoria'), d.categorias.map(x => h('div', { class: 'op-cat' }, h('span', null, x.categoria), h('span', { class: 'op-cat-b' }, h('i', { style: `width:${x.valor / mxC * 100}%` })), h('b', null, reais(x.valor)))))));
      // lançar
      const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
      const f = { data: h('input', { type: 'date', class: 'em-in', value: hoje, max: hoje, 'aria-label': 'Data' }), cat: h('select', { class: 'em-in', 'aria-label': 'Categoria' }, d.opcoes.map(o => h('option', null, o))),
        desc: h('input', { class: 'em-in', placeholder: 'Ex.: NF 1234 · cabos 25 mm²', maxlength: 200, 'aria-label': 'Descrição' }), valor: h('input', { type: 'number', min: 0.01, step: '0.01', class: 'em-in', placeholder: 'Valor R$', 'aria-label': 'Valor' }) };
      box.append(h('section', { class: 'op-sec' }, h('h3', null, 'Lançar custo realizado'),
        h('form', { class: 'op-form', onsubmit: async e => { e.preventDefault(); try { await api(`obras/${O.id}/custos`, 'POST', { data: f.data.value, categoria: f.cat.value, descricao: f.desc.value, valor: f.valor.value === '' ? null : +f.valor.value }); avisar('Custo lançado.', 'success'); carregar(); } catch (er) { avisar(er.message, 'error'); } } },
          f.data, f.cat, f.desc, f.valor, h('button', { type: 'submit', class: 'ob-bt og-bt-p' }, ic('fa-plus'), ' Lançar'))));
      // lista
      const lst = h('section', { class: 'op-sec' }, h('h3', null, 'Lançamentos', h('small', null, `${d.lancamentos.length}`)));
      if (!d.lancamentos.length) lst.append(h('p', { class: 'og-sub' }, 'Nenhum custo lançado ainda.'));
      d.lancamentos.forEach(l => lst.append(h('div', { class: 'op-lc' }, h('span', null, dBRa(l.data)), h('span', { class: 'ob-tipo' }, l.categoria), h('span', { class: 'op-lc-d' }, l.descricao, h('small', null, l.por || '')), h('b', null, reais(l.valor)),
        h('button', { class: 'og-x', 'aria-label': 'Apagar lançamento', title: 'Apagar', onclick: async () => {
          const ok = await modal('Apagar lançamento', h('div', { class: 'og-corpo' }, h('p', null, `${l.descricao} · ${reais(l.valor)}`)), [['Cancelar', null], ['Apagar', true, 'og-bt-perigo']]);
          if (!ok) return; try { await api('custos/' + l.id, 'DELETE'); avisar('Lançamento apagado.', 'success'); carregar(); } catch (e) { avisar(e.message, 'error'); } } }, ic('fa-trash')))));
      box.append(lst);
    }
    carregar();
    return box;
  }

  const juntar = () => { if (!window.tfObraAbas) return setTimeout(juntar, 50); tfObraAbas.plano = plano; tfObraAbas.custos = custos; };
  juntar();
})();
