/* Mercronos · obra-montar.js — montar o cronograma (modelo, copiar, importar arquivo, colar do Excel) e exportar (PDF, Excel, MS Project) */
(() => {
  'use strict';
  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v; else if (k.startsWith('on')) el[k] = v; else el.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat(9)) if (f != null && f !== false) el.append(f.nodeType ? f : document.createTextNode(String(f)));
    return el;
  }
  const ic = n => h('i', { class: 'fa-solid ' + n, 'aria-hidden': 'true' });
  const sem = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  async function api(rota, metodo, dados) {
    const r = await fetch('api/' + rota, { method: metodo || 'GET', credentials: 'same-origin', headers: dados ? { 'Content-Type': 'application/json' } : {}, body: dados ? JSON.stringify(dados) : undefined, cache: 'no-store' });
    let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(j.erro || 'Não foi possível concluir. Tente de novo.');
    return j;
  }
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
  const OPCOES = [
    ['modelo', 'A', 'Usar um modelo', 'Etapas, durações e ligações prontas por tipo de serviço.'],
    ['perguntas', 'B', 'Montar por perguntas', 'O assistente pergunta o essencial e monta o Gantt com você.'],
    ['copiar', 'F', 'Copiar de outra obra', 'A obra inteira ou só algumas etapas, com as datas ajustadas.'],
    ['arquivo', 'G', 'Importar arquivo', 'MS Project (.xml), Excel (.xlsx) ou CSV.'],
    ['colar', 'C', 'Colar do Excel', 'Copie as linhas na planilha e cole aqui.'],
  ];

  /* ══ Montar ═══════════════════════════════════════════════════ */
  async function montar(O, ctx, modo, texto) {
    const temAtiv = O.d.atividades.length > 0;
    const st = { modo: modo || 'modelo', modelos: null, modelo: null, busca: '', previa: null, envio: null, copiarDe: null, etapas: null, arquivo: null };
    const fIni = h('input', { type: 'date', value: O.d.obra.inicio || O.d.hoje, 'aria-label': 'Início' });
    const fSubst = h('select', { 'aria-label': 'O que fazer com o cronograma atual' }, h('option', { value: '' }, 'Acrescentar no fim do cronograma'), h('option', { value: '1' }, 'Substituir o cronograma atual'));
    const corpo = h('div', { class: 'om-corpo' });
    const btOk = h('button', { class: 'ob-bt ob-bt-pri' }, 'Usar este modelo');
    const btZero = h('button', { class: 'ob-bt' }, 'Começar do zero');
    const lista = h('div', { class: 'om-ops', role: 'radiogroup', 'aria-label': 'Forma de montar' });
    const fundo = h('div', { class: 'ob-fundo og-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'om-t' });
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = ev => { if (ev.key === 'Escape') fechar(); };
    fundo.addEventListener('mousedown', ev => { if (ev.target === fundo) fechar(); });
    btZero.onclick = () => { fechar(); setTimeout(() => { const n = document.querySelector('.og-nova-inp'); if (n) n.focus(); }, 50); };
    function desenharOps() {
      lista.innerHTML = '';
      OPCOES.forEach(([k, l, t, d]) => {
        const on = st.modo === k, off = k === 'perguntas' && !window.tfAssistente;
        lista.append(h('button', { class: 'om-op' + (on ? ' on' : '') + (off ? ' off' : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false', 'aria-disabled': off ? 'true' : null,
          onclick: () => { if (off) return;
            if (k === 'perguntas') { const o = O.d.obra; fechar(); tfAssistente.montar({ id: o.id, codigo: o.codigo, nome: o.nome, inicio: o.inicio, fim: o.fim, calendario_id: O.d.calendario && O.d.calendario.id, temAtividades: O.d.atividades.filter(a => !a.etapa).length }); return; }
            st.modo = k; st.previa = null; st.envio = null; desenharOps(); desenharCorpo(); } },
          h('span', { class: 'om-letra' }, l), h('span', null, h('b', null, t), h('small', null, d))));
      });
    }
    function previaTabela(p) {
      const t = h('div', { class: 'om-previa' }, h('div', { class: 'om-previa-cab' }, h('span', null, 'PRÉVIA'), h('span', null, `${p.atividades} linhas · ${p.ligacoes} ligações`)));
      p.previa.slice(0, 60).forEach(x => t.append(h('div', { class: 'om-pl' + (x.etapa ? ' etapa' : '') }, h('span', { style: `padding-left:${x.nivel * 16}px` }, x.descricao),
        h('span', null, x.etapa ? '' : x.duracao_dias == null ? '1d' : String(x.duracao_dias).replace('.', ',') + 'd'), h('span', null, x.inicio ? dBR(x.inicio) : ''))));
      if (p.previa.length > 60) t.append(h('div', { class: 'om-pl' }, h('span', { class: 'og-sub' }, `… e mais ${p.previa.length - 60}`)));
      return t;
    }
    async function pedirPrevia(rota, dados) {
      st.previa = null; st.envio = null;
      try { st.previa = await api(rota, 'POST', { ...dados, previa: true }); st.envio = { rota, dados }; } catch (e) { avisar(e.message, 'error'); }
      desenharCorpo();
    }
    async function desenharCorpo() {
      corpo.innerHTML = ''; btOk.disabled = true;
      if (st.modo === 'modelo') {
        btOk.textContent = 'Usar este modelo';
        if (!st.modelos) { corpo.append(h('p', { class: 'og-sub' }, 'Carregando modelos…')); try { st.modelos = (await api('modelos')).modelos; } catch (e) { avisar(e.message, 'error'); st.modelos = []; } return desenharCorpo(); }
        const busca = h('input', { type: 'search', placeholder: 'Buscar modelo', value: st.busca, 'aria-label': 'Buscar modelo', oninput: e => { st.busca = e.target.value; desenharLista(); } });
        const porCargo = h('input', { type: 'checkbox', checked: true });
        const grade = h('div', { class: 'om-mods' });
        const prev = h('div');
        function desenharLista() {
          grade.innerHTML = '';
          const tipo = O.d.obra.tipo_servico;
          st.modelos.filter(m => !st.busca || sem(m.nome + ' ' + m.tipo_servico).includes(sem(st.busca)))
            .sort((a, b) => (b.tipo_servico === tipo) - (a.tipo_servico === tipo)).forEach(m => {
              const escolher = () => { st.modelo = m; desenharLista(); mostrar(); };
              grade.append(h('div', { class: 'om-mod' + (st.modelo === m ? ' on' : ''), role: 'radio', tabindex: 0, 'aria-checked': st.modelo === m ? 'true' : 'false', onclick: escolher, onkeydown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); escolher(); } } },
                h('b', null, m.nome), h('span', null, `${m.atividades} atividades · ${m.tipo_servico || '—'}`), h('small', null, m.origem),
                typeof m.id === 'number' ? h('button', { class: 'om-apaga', title: 'Apagar modelo', 'aria-label': 'Apagar modelo ' + m.nome,
                  onclick: async ev => { ev.stopPropagation(); if (!(await confirmar(`Apagar o modelo "${m.nome}"?`, 'Apagar'))) return; try { await api('modelos/' + m.id, 'DELETE'); st.modelos = st.modelos.filter(x => x !== m); if (st.modelo === m) st.modelo = null; desenharLista(); mostrar(); } catch (e) { avisar(e.message, 'error'); } } }, ic('fa-trash-can')) : null));
            });
        }
        function mostrar() {
          prev.innerHTML = '';
          if (!st.modelo) { prev.append(h('p', { class: 'og-sub' }, 'Escolha um modelo para ver a prévia.')); btOk.disabled = true; return; }
          const m = st.modelo, linhas = m.linhas;
          prev.append(previaTabela({ atividades: linhas.length, ligacoes: linhas.filter(l => l.pred).reduce((t, l) => t + String(l.pred).split(/[;,]/).filter(Boolean).length, 0),
            previa: linhas.map((l, i) => ({ descricao: l.descricao, nivel: l.nivel, etapa: linhas[i + 1] && linhas[i + 1].nivel > l.nivel, duracao_dias: l.duracao })) }));
          btOk.disabled = false;
          st.envio = { rota: `obras/${O.id}/aplicar-modelo`, dados: { modelo: m.id }, extra: () => ({ por_cargo: porCargo.checked }) };
        }
        if (!st.modelo) st.modelo = st.modelos.find(m => m.tipo_servico === O.d.obra.tipo_servico) || st.modelos[0];
        desenharLista(); mostrar();
        corpo.append(h('label', { class: 'ob-busca om-busca' }, ic('fa-magnifying-glass'), busca), grade, prev,
          h('label', { class: 'om-chk' }, porCargo, 'Já colocar o responsável pelo cargo (encarregado, eletricista, engenheiro…) quando houver uma só pessoa no cargo'));
      } else if (st.modo === 'copiar') {
        btOk.textContent = 'Copiar';
        let obras = []; try { obras = (await api('obras/resumo')).obras.filter(o => o.id !== O.id && o.atividades > 0); } catch (e) { avisar(e.message, 'error'); }
        if (!obras.length) { corpo.append(h('p', { class: 'og-sub' }, 'Nenhuma outra obra tem cronograma para copiar.')); return; }
        const sObra = h('select', { 'aria-label': 'Obra de origem' }, h('option', { value: '' }, 'Escolha a obra…'), obras.map(o => h('option', { value: o.id, selected: st.copiarDe === o.id }, `${o.codigo || ''} · ${o.nome} (${o.atividades} atividades)`)));
        const etapasBox = h('div', { class: 'om-etapas' });
        sObra.onchange = async () => {
          st.copiarDe = +sObra.value || null; etapasBox.innerHTML = ''; btOk.disabled = true; if (!st.copiarDe) return;
          const c = await api(`obras/${st.copiarDe}/cronograma`);
          const raizes = c.atividades.filter(a => !a.pai_id);
          etapasBox.append(h('b', null, 'O que copiar'), ...raizes.map(a => h('label', { class: 'om-chk' }, h('input', { type: 'checkbox', checked: true, value: a.id }), `${a.eap} · ${a.descricao}` + (a.etapa ? ` (${c.atividades.filter(x => x.eap.startsWith(a.eap + '.')).length} atividades)` : ''))));
          btOk.disabled = false;
          st.envio = { rota: `obras/${O.id}/copiar`, dados: { origem_id: st.copiarDe }, extra: () => { const ids = [...etapasBox.querySelectorAll('input:checked')].map(i => +i.value); return { etapas: ids.length === raizes.length ? null : ids }; } };
        };
        corpo.append(h('label', { class: 'ob-campo' }, h('span', null, 'Copiar de'), sObra), etapasBox,
          h('p', { class: 'og-sub' }, 'As datas são deslocadas para o início escolhido, mantendo os intervalos e as ligações. O avanço volta a zero.'));
        if (st.copiarDe) sObra.onchange();
      } else if (st.modo === 'arquivo') {
        btOk.textContent = 'Importar';
        const inp = h('input', { type: 'file', accept: '.xml,.xlsx,.csv,.txt', 'aria-label': 'Arquivo' });
        inp.onchange = async () => {
          const f = inp.files[0]; if (!f) return;
          const ext = f.name.split('.').pop().toLowerCase();
          if (f.size > 6e6) { avisar('Arquivo grande demais (máximo de 6 MB).', 'error'); return; }
          let formato = ext === 'xml' ? 'mspdi' : ext === 'xlsx' ? 'xlsx' : 'csv', conteudo;
          if (formato === 'xlsx') conteudo = await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
          else conteudo = await f.text();
          st.arquivo = f.name;
          pedirPrevia(`obras/${O.id}/importar`, { formato, conteudo });
        };
        corpo.append(h('div', { class: 'om-arq' }, ic('fa-file-import'), h('div', null, h('b', null, st.arquivo || 'Escolha o arquivo'),
          h('small', null, 'MS Project: Arquivo › Salvar como › Formato XML (*.xml). Excel: a 1ª planilha, com colunas Atividade, Duração, Início, Responsável, Predecessoras (EAP opcional).')), inp));
        if (st.previa) { corpo.append(previaTabela(st.previa)); btOk.disabled = false; }
      } else if (st.modo === 'colar') {
        btOk.textContent = 'Criar atividades';
        const ta = h('textarea', { class: 'og-txt om-ta', rows: 8, placeholder: 'Cole aqui (Ctrl+V) as linhas copiadas do Excel.\nColunas: Atividade, Duração, Início, Responsável — ou com cabeçalho (EAP, Atividade, Duração, Início, Fim, Responsável, Predecessoras).' }, texto || '');
        let tmr; ta.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { if (ta.value.trim()) pedirPrevia(`obras/${O.id}/importar`, { formato: 'linhas', conteudo: ta.value }).then(() => { texto = ta.value; }); }, 500); };
        corpo.append(ta, h('small', { class: 'og-sub' }, 'Dica: use a coluna EAP (1, 1.1, 1.2…) ou espaços no começo do nome para criar etapas e subatividades. Predecessoras como 3 ou 3CC+2.'));
        if (st.previa) { corpo.append(previaTabela(st.previa)); btOk.disabled = false; }
        else if (texto && texto.trim()) { pedirPrevia(`obras/${O.id}/importar`, { formato: 'linhas', conteudo: texto }); }
        setTimeout(() => ta.focus(), 30);
      }
    }
    btOk.onclick = async () => {
      if (!st.envio) return;
      const subst = fSubst.value === '1';
      if (subst && !(await confirmar(`Substituir o cronograma atual (${O.d.atividades.length} linhas)? As atividades atuais serão apagadas.`, 'Substituir'))) return;
      btOk.disabled = true;
      try {
        const dados = { ...st.envio.dados, ...(st.envio.extra ? st.envio.extra() : {}), substituir: subst, previa: false };
        if (!(st.modo === 'arquivo' && fIni.dataset.mexeu !== '1')) dados.inicio = fIni.value;   // arquivo: mantém as datas dele, a menos que mude o início
        const r = await api(st.envio.rota, 'POST', dados);
        fechar(); avisar(`${r.atividades} linha${r.atividades === 1 ? '' : 's'} criada${r.atividades === 1 ? '' : 's'}${r.ligacoes ? `, ${r.ligacoes} ligações` : ''}.`, 'success');
        try { if (window.tfServidor && tfServidor.recarregar) tfServidor.recarregar(); } catch (_) {}
        ctx.carregar();
      } catch (e) { btOk.disabled = false; avisar(e.message, 'error'); }
    };
    fIni.oninput = () => { fIni.dataset.mexeu = '1'; };
    desenharOps();
    fundo.append(h('div', { class: 'og-janela om-jan' },
      h('div', { class: 'om-cab' }, h('div', null, h('h3', { id: 'om-t' }, 'Como você quer montar o cronograma?'),
        h('small', { class: 'og-sub' }, `${O.d.obra.codigo || ''} · ${O.d.obra.nome} — calendário ${O.d.calendario.nome}`)),
        h('button', { class: 'ob-x', 'aria-label': 'Fechar', onclick: fechar }, ic('fa-xmark'))),
      h('div', { class: 'om-grade' }, lista, corpo),
      h('div', { class: 'om-pe' }, h('label', { class: 'om-ini' }, 'Começa em', fIni), temAtiv ? fSubst : null, h('span', { style: 'flex:1' }), btZero, btOk)));
    document.addEventListener('keydown', esc);
    document.body.append(fundo);
    desenharCorpo();
  }
  function confirmar(msg, botao) {
    return new Promise(res => {
      const f = h('div', { class: 'ob-fundo og-modal', role: 'alertdialog', 'aria-modal': 'true', style: 'z-index:100002' });
      const fim = v => { f.remove(); res(v); };
      f.append(h('div', { class: 'og-janela' }, h('h3', null, 'Confirmar'), h('div', { class: 'og-corpo' }, h('p', null, msg)),
        h('div', { class: 'og-bts' }, h('button', { class: 'ob-bt', onclick: () => fim(false) }, 'Cancelar'), h('button', { class: 'ob-bt og-bt-perigo', onclick: () => fim(true) }, botao || 'Confirmar'))));
      document.body.append(f); f.querySelector('.og-bt-perigo').focus();
    });
  }

  /* ══ Salvar como modelo ═══════════════════════════════════════ */
  async function salvarModelo(O, ctx) {
    const nome = h('input', { value: O.d.obra.nome, maxlength: 120, class: 'og-txt', style: 'height:42px' });
    const ok = await ctx.modal('Salvar como modelo', h('div', { class: 'og-corpo' }, h('p', null, 'O cronograma desta obra (etapas, durações e ligações, sem datas nem avanço) vira um modelo para as próximas obras da empresa.'),
      h('label', { class: 'ob-campo' }, h('span', null, 'Nome do modelo'), nome)), [['Cancelar', null], ['Salvar modelo', true, 'ob-bt-pri']]);
    if (!ok || !nome.value.trim()) return;
    try { await api(`obras/${O.id}/salvar-modelo`, 'POST', { nome: nome.value.trim() }); avisar('Modelo salvo. Ele aparece em "Montar o cronograma".', 'success'); } catch (e) { avisar(e.message, 'error'); }
  }

  /* ══ Exportar ═════════════════════════════════════════════════ */
  function exportar(bt, O) {
    document.querySelectorAll('.ob-menu').forEach(m => m.remove());
    const item = (icone, txt, sub, fn) => h('button', { role: 'menuitem', onclick: () => { m.remove(); fn(); } }, ic(icone), h('span', null, txt, h('small', null, sub)));
    const baixar = f => { const a = h('a', { href: `api/obras/${O.id}/exportar?formato=${f}`, download: '' }); document.body.append(a); a.click(); a.remove(); };
    const m = h('div', { class: 'ob-menu om-exp', role: 'menu' },
      item('fa-file-pdf', 'PDF para imprimir', 'tabela e Gantt em folha deitada', () => imprimir(O)),
      item('fa-file-excel', 'Excel (.xlsx)', 'planilha com todas as colunas', () => baixar('xlsx')),
      item('fa-diagram-project', 'MS Project (.xml)', 'abre no Project com ligações', () => baixar('mspdi')));
    document.body.append(m);
    const r = bt.getBoundingClientRect();
    m.style.top = (r.bottom + window.scrollY + 4) + 'px'; m.style.left = Math.max(8, Math.min(window.innerWidth - 268, r.left)) + 'px';
    setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
  }
  function imprimir(O) {
    const w = window.open('', '_blank');
    if (!w) { avisar('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.', 'error'); return; }
    const o = O.d.obra, A = O.d.atividades, T = s => Date.parse(s + 'T00:00:00Z');
    const ds = A.flatMap(a => [a.inicio, a.fim]).filter(Boolean).sort(); const ini = ds[0] || O.d.hoje, fim = ds[ds.length - 1] || O.d.hoje;
    const tot = Math.max(1, (T(fim) - T(ini)) / 864e5 + 1), pc = s => ((T(s) - T(ini)) / 864e5 / tot * 100).toFixed(2);
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const linhas = A.map(a => `<tr class="${a.etapa ? 'etapa' : ''}${a.atrasada ? ' atras' : ''}"><td>${a.eap}</td><td style="padding-left:${6 + a.nivel * 12}px">${esc(a.descricao)}</td><td>${esc(a.responsavel_nome || '')}</td>
      <td>${a.inicio ? dBR(a.inicio) : ''}</td><td>${a.fim ? dBR(a.fim) : ''}</td><td>${a.duracao_dias ?? ''}</td><td>${esc(a.predecessoras)}</td><td>${a.marco ? '' : a.avanco + '%'}</td>
      <td class="g">${a.inicio && a.fim ? (a.marco ? `<i class="m" style="left:${pc(a.inicio)}%"></i>` : `<i class="b${a.critica ? ' c' : ''}" style="left:${pc(a.inicio)}%;width:${Math.max(.6, ((T(a.fim) - T(a.inicio)) / 864e5 + 1) / tot * 100).toFixed(2)}%"><s style="width:${a.avanco}%"></s></i>`) : ''}
      <i class="h" style="left:${pc(O.d.hoje)}%"></i></td></tr>`).join('');
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc((o.codigo ? o.codigo + ' · ' : '') + o.nome)} — cronograma</title><style>
      @page{size:A4 landscape;margin:10mm} body{font:10px/1.35 Arial,sans-serif;color:#0f172a;margin:0} h1{font-size:15px;margin:0 0 2px} .sub{color:#475569;margin-bottom:8px}
      .dados{display:flex;gap:18px;margin:0 0 8px;font-size:10px} .dados b{display:block;font-size:8px;color:#64748b;text-transform:uppercase}
      table{width:100%;border-collapse:collapse;table-layout:fixed} th{background:#f1f5f9;font-size:8px;text-transform:uppercase;color:#475569;text-align:left;padding:4px}
      td{border-bottom:1px solid #e2e8f0;padding:3px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} tr.etapa td{font-weight:bold;background:#f8fafc} tr.atras td:nth-child(5){color:#b91c1c;font-weight:bold}
      td.g{position:relative;padding:0;height:16px} td.g i{position:absolute;top:4px;height:8px;border-radius:2px} i.b{background:#bfdbfe;overflow:hidden} i.b s{display:block;height:100%;background:#2563eb;text-decoration:none}
      i.c{outline:1.5px solid #dc2626} tr.etapa i.b{background:#cbd5e1} tr.etapa i.b s{background:#475569} i.m{width:7px;height:7px;background:#0f172a;transform:rotate(45deg);margin-left:-3px}
      i.h{top:0!important;bottom:0;height:auto!important;width:1px;background:#2563eb;opacity:.6} .rod{margin-top:8px;color:#64748b;font-size:9px;display:flex;justify-content:space-between}
      @media print{.nao{display:none}} .nao{position:fixed;top:8px;right:8px;padding:8px 14px;background:#2563eb;color:#fff;border:0;border-radius:6px;font:bold 12px Arial;cursor:pointer}
    </style></head><body><button class="nao" onclick="print()">Imprimir / salvar em PDF</button>
    <h1>${esc((o.codigo ? o.codigo + ' · ' : '') + o.nome)}</h1><div class="sub">${esc([o.cliente, o.local_obra, o.numero_contrato ? 'Contrato ' + o.numero_contrato : ''].filter(Boolean).join(' · '))}</div>
    <div class="dados"><span><b>Prazo</b>${o.inicio ? dBR(o.inicio) : '?'} → ${o.fim ? dBR(o.fim) : '?'}</span><span><b>Real × previsto</b>${Math.round(o.avanco_real || 0)}% × ${o.avanco_previsto == null ? '—' : Math.round(o.avanco_previsto) + '%'}</span>
      <span><b>Gestor</b>${esc(o.gestor || '—')}</span><span><b>Responsável técnico</b>${esc(o.rt_nome || '—')}${o.art_numero ? ' · ART ' + esc(o.art_numero) : ''}</span><span><b>Calendário</b>${esc(O.d.calendario.nome)}</span></div>
    <table><colgroup><col style="width:4%"><col style="width:22%"><col style="width:10%"><col style="width:6%"><col style="width:6%"><col style="width:4%"><col style="width:7%"><col style="width:4%"><col></colgroup>
    <thead><tr><th>EAP</th><th>Atividade</th><th>Resp.</th><th>Início</th><th>Fim</th><th>Dur.</th><th>Pred.</th><th>%</th><th>${dBR(ini)} → ${dBR(fim)}</th></tr></thead><tbody>${linhas}</tbody></table>
    <div class="rod"><span>Mercronos by mercurium · gerado em ${new Date().toLocaleString('pt-BR')}</span><span>Barra azul = feito · contorno vermelho = caminho crítico · linha azul = hoje</span></div>
    <script>setTimeout(function(){print()},400)<\/script></body></html>`);
    w.document.close();
  }

  /* ══ Colar várias linhas na nova atividade abre o "Colar do Excel" ══ */
  document.addEventListener('paste', ev => {
    const alvo = ev.target;
    if (!alvo || !alvo.classList || !alvo.classList.contains('og-nova-inp') || !window.tfObra) return;
    const t = (ev.clipboardData || window.clipboardData).getData('text');
    if (!t || (!t.includes('\n') && !t.includes('\t'))) return;
    ev.preventDefault();
    montar(tfObra.estado, { carregar: tfObra.recarregar }, 'colar', t);
  });

  window.tfObraMontar = (O, ctx, modo) => montar(O, ctx, modo);
  window.tfObraExportar = exportar;
  window.tfObraSalvarModelo = salvarModelo;
})();
