/* Aprumo · historico-tela.js — telas "Histórico" (linha do tempo de quem mudou o quê, com filtros e Excel) e
   "Importar cronograma" (MS Project ou planilha → prévia → obra nova ou existente). Usa as peças eq-* da Equipe e as hi-*. */
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
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
  const dBRano = s => s ? dBR(s) + '/' + s.slice(0, 4) : '—';
  const SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const selo = (t, c) => h('span', { class: 'eq-selo ' + (c || 'cz') }, t);
  const ICO = { av: ['fa-chart-line', 'av'], trav: ['fa-hand', 'tr'], crono: ['fa-calendar-days', 'cr'], rdo: ['fa-clipboard-list', 'rd'], eq: ['fa-helmet-safety', 'eq'], rec: ['fa-truck-pickup', 'rc'], usu: ['fa-user-gear', 'us'] };
  const iso = d => d.toISOString().slice(0, 10);
  const hojeBR = () => iso(new Date(Date.now() - 3 * 3600e3));
  const menos = (s, n) => iso(new Date(Date.parse(s + 'T12:00:00Z') - n * 864e5));

  /* ══ Histórico ═══════════════════════════════ */
  const H = { d: null, f: { obra: '', pessoa: '', tipo: '', per: '7', q: '' }, itens: [], carregando: false, erro: null };
  const raizH = () => document.getElementById('view-historico');
  function params(extra) {
    const f = H.f, hoje = hojeBR(), p = {};
    if (f.obra) p.obra = f.obra; if (f.pessoa) p.pessoa = f.pessoa; if (f.tipo) p.tipo = f.tipo; if (f.q.trim()) p.q = f.q.trim();
    if (f.per !== 'tudo') { p.de = f.per === 'hoje' ? hoje : menos(hoje, +f.per - 1); }
    return new URLSearchParams({ ...p, ...(extra || {}) }).toString();
  }
  async function carregarH(mais) {
    H.carregando = true; if (!mais) { H.pagina = 1; }
    try {
      const d = await api('historico?' + params({ pagina: mais ? H.pagina + 1 : 1 }));
      if (mais) { H.itens.push(...d.itens); H.pagina = d.pagina; H.d.mais = d.mais; }
      else { H.d = d; H.itens = d.itens; }
      H.erro = null;
    } catch (e) { H.erro = e.message; }
    H.carregando = false; desenharH();
  }
  let tmrBusca;
  function desenharH() {
    const R = raizH(); if (!R || !R.classList.contains('active')) return;
    const y = window.scrollY, foco = document.activeElement && document.activeElement.id, sel = foco === 'hi-busca' ? document.activeElement.selectionStart : null;
    R.innerHTML = ''; const box = h('div', { class: 'eq hi' }); R.append(box);
    const d = H.d, mob = celular();
    const anos = d && d.limite_dias ? (d.limite_dias >= 365 ? 'o último ano' : `os últimos ${d.limite_dias} dias`) : 'tudo';
    box.append(h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, 'Histórico'), h('p', null, d ? `Quem mudou o quê${d.pessoas.length ? ', em todas as obras' : ', nas suas obras'} · plano ${d.plano} mostra ${anos}` : 'Quem mudou o quê')),
      d && !mob ? h('a', { class: 'eq-bt', id: 'hi-excel', href: 'api/historico/excel?' + params(), download: 'historico.xlsx' }, ic('fa-file-excel'), ' Baixar Excel') : null));
    if (!d) { box.append(h('p', { class: 'eq-vazio' }, H.erro || 'Carregando…')); return; }
    const f = H.f, muda = (k, v) => { f[k] = v; carregarH(); };
    const PER = [['hoje', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 3 meses'], ['tudo', d.limite_dias ? (d.limite_dias >= 365 ? 'Último ano' : `Últimos ${d.limite_dias} dias`) : 'Tudo']];
    box.append(h('div', { class: 'hi-filtros' },
      h('input', { class: 'em-in', id: 'hi-busca', type: 'search', placeholder: 'Buscar atividade, pessoa, recurso…', value: f.q, 'aria-label': 'Buscar', oninput: e => { f.q = e.target.value; clearTimeout(tmrBusca); tmrBusca = setTimeout(() => carregarH(), 400); } }),
      h('select', { class: 'em-in', id: 'hi-obra', 'aria-label': 'Obra', onchange: e => muda('obra', e.target.value) }, h('option', { value: '' }, 'Todas as obras'), d.obras.map(o => h('option', { value: o.id, selected: String(o.id) === f.obra }, o.codigo || o.nome))),
      d.pessoas.length ? h('select', { class: 'em-in', id: 'hi-pessoa', 'aria-label': 'Pessoa', onchange: e => muda('pessoa', e.target.value) }, h('option', { value: '' }, 'Todas as pessoas'), d.pessoas.map(p => h('option', { value: p.id, selected: String(p.id) === f.pessoa }, p.nome))) : null,
      h('select', { class: 'em-in', id: 'hi-per', 'aria-label': 'Período', onchange: e => muda('per', e.target.value) }, PER.map(([v, t]) => h('option', { value: v, selected: f.per === v }, t)))));
    box.append(h('div', { class: 'hi-tipos', role: 'group', 'aria-label': 'Tipo' }, [['', 'Tudo'], ...Object.entries(d.tipos)].map(([k, t]) => h('button', { class: f.tipo === k ? 'on' : '', 'data-tipo': k, onclick: () => muda('tipo', k) }, t))));
    const lista = h('section', { class: 'eq-painel hi-lista' });
    if (!H.itens.length) lista.append(h('p', { class: 'eq-vazio' }, H.carregando ? 'Carregando…' : 'Nada registrado com esses filtros.'));
    let dia = null;
    H.itens.forEach(x => {
      const dd = x.quando.slice(0, 10);
      if (dd !== dia) { dia = dd; const ds = SEM[new Date(dd + 'T12:00:00Z').getUTCDay()]; lista.append(h('div', { class: 'hi-dia' }, (dd === d.hoje ? 'Hoje · ' : dd === menos(d.hoje, 1) ? 'Ontem · ' : '') + `${ds}, ${dBRano(dd)}`)); }
      const tp = x.tipo === 'av' && /travou|liberou/.test(x.texto) ? 'trav' : x.tipo; const [i, c] = ICO[tp] || ICO.usu;
      const abrir = x.link ? h('button', { class: 'hi-abrir', onclick: () => irLink(x.link), 'aria-label': 'Abrir' }, 'Abrir ', ic('fa-chevron-right')) : null;
      lista.append(h('div', { class: 'hi-item', 'data-id': x.id },
        mob ? null : h('span', { class: 'hi-hora' }, x.quando.slice(11, 16)), h('span', { class: 'hi-ic ' + c }, ic(i)),
        h('div', { class: 'hi-txt' }, h('b', null, x.usuario), ' ', x.texto, x.sub ? h('small', null, x.sub) : null, mob ? h('small', { class: 'hi-meta' }, x.quando.slice(11, 16), x.obra ? ' · ' + x.obra.codigo : '') : null,
          x.detalhes.length ? h('div', { class: 'hi-det' }, x.detalhes.map(z => h('div', null, h('span', null, z.campo), h('span', null, z.antes != null ? h('s', null, z.antes) : null, z.antes != null ? ' → ' : '', h('b', null, z.depois))))) : null,
          mob && abrir ? abrir : null),
        mob ? null : h('span', { class: 'hi-dir' }, x.obra ? selo(x.obra.codigo, 'az') : null, abrir)));
    });
    if (d.mais) lista.append(h('div', { class: 'hi-mais' }, h('button', { class: 'eq-bt', id: 'hi-mais', disabled: H.carregando, onclick: () => carregarH(true) }, H.carregando ? 'Carregando…' : 'Mostrar mais')));
    const lado = mob ? null : h('aside', { class: 'hi-lado' },
      h('div', { class: 'eq-kpi azul' }, h('b', null, d.total.toLocaleString('pt-BR')), h('span', null, 'alterações no período')),
      h('div', { class: 'eq-kpi verd' }, h('b', null, d.pessoas_no_periodo), h('span', null, d.pessoas_no_periodo === 1 ? 'pessoa mexeu' : 'pessoas mexeram')),
      d.ranking.length ? h('section', { class: 'eq-painel hi-rank' }, h('b', null, 'Quem mais registrou'), d.ranking.map(r => h('div', null, h('span', null, r.nome), h('b', null, r.n)))) : null,
      h('p', { class: 'hi-nota' }, 'O registro fica guardado para sempre. O que aparece aqui segue o plano: Essencial 30 dias, Profissional 1 ano, Empresa e Corporativo tudo.'));
    box.append(h('div', { class: 'hi-grade' }, lista, lado));
    window.scrollTo(0, y);
    if (foco === 'hi-busca') { const el = document.getElementById('hi-busca'); el.focus(); try { el.setSelectionRange(sel, sel); } catch (_) {} }
  }
  function irLink(l) {
    if (l.tipo === 'obra' || l.tipo === 'atividade') {
      if (!window.tfObra) return;
      (async () => { await tfObra.abrir(l.tipo === 'obra' ? l.id : l.obra_id);
        if (l.tipo === 'atividade') { const a = ((tfObra.estado.d || {}).atividades || []).find(x => x.id === l.id); if (a) tfObra.painel(a); } })(); return;
    }
    if (l.tipo === 'rdo' && window.tfRdo) return tfRdo.abrirRdo(l.id);
    if (l.tipo === 'relatorio') { const w = window.open('api/relatorios/' + l.id + '/documento', '_blank'); if (w) w.opener = null; return; }
    if (l.tipo === 'recurso' && window.tfRecursos) return tfRecursos.abrirFicha(l.id);
    if (l.tipo === 'pessoa' && window.tfEquipe) return tfEquipe.abrirFicha(l.id, 'documentos');
    if (l.tipo === 'empresa' && window.tfEmpresa) return tfEmpresa.abrir(l.aba);
    if (l.tipo === 'view') return window.switchView(l.view, document.querySelector(`[onclick*="'${l.view}'"]`));
  }
  window.renderHistorico = function () {
    const t = document.getElementById('page-title'); if (t) t.textContent = 'Histórico';
    if (!H.d) desenharH(); carregarH();   // chamado de novo (sincronização): atualiza sem apagar a tela
  };

  /* ══ Importar cronograma ═════════════════════ */
  const I = { passo: 1, arq: null, pv: null, dados: null, destino: 'nova', obra: { codigo: '', nome: '', cliente: '', inicio: '' }, projeto_id: '', substituir: false, lista: null, enviando: false };
  const raizI = () => document.getElementById('view-importar');
  async function carregarI() { try { I.lista = await api('importacoes'); } catch (e) { I.lista = { erro: e.message, importacoes: [], obras: [] }; } desenharI(); }
  function lerArquivo(a) {
    const ext = (a.name.split('.').pop() || '').toLowerCase();
    if (!['xml', 'xlsx', 'csv', 'txt'].includes(ext)) return avisar('Use MS Project (.xml), Excel (.xlsx) ou CSV', 'error');
    if (a.size > 6 * 1024 * 1024) return avisar('Arquivo grande demais (até 6 MB)', 'error');
    const formato = ext === 'xml' ? 'mspdi' : ext === 'xlsx' ? 'xlsx' : 'csv';
    const r = new FileReader();
    r.onload = async () => {
      const conteudo = formato === 'xlsx' ? String(r.result).split(',')[1] : String(r.result);
      I.arq = { nome: a.name, tamanho: a.size, formato }; I.dados = { formato, conteudo, arquivo: a.name }; I.pv = null; I.passo = 1; desenharI();
      try { I.pv = await api('importar/previa', 'POST', I.dados); const inf = I.pv.info;
        I.obra = { codigo: '', nome: inf.nome || '', cliente: '', inicio: inf.inicio || '' }; I.passo = 2; }
      catch (e) { I.arq.erro = e.message; }
      desenharI();
    };
    if (formato === 'xlsx') r.readAsDataURL(a); else r.readAsText(a);
  }
  const FORM = { mspdi: 'MS Project', xlsx: 'Excel', csv: 'CSV' };
  function desenharI() {
    const R = raizI(); if (!R || !R.classList.contains('active')) return;
    const y = window.scrollY, foco = document.activeElement && document.activeElement.id;
    R.innerHTML = ''; const box = h('div', { class: 'eq hi im' }); R.append(box);
    const mob = celular(), pv = I.pv;
    const passos = h('div', { class: 'im-passos' }, ['Arquivo', 'Para onde', 'Conferir e importar'].map((t, i) => h('span', { class: i + 1 < I.passo ? 'feito' : i + 1 === I.passo ? 'atual' : '' }, h('i', null, i + 1 < I.passo ? '✓' : i + 1), mob ? null : t)));
    box.append(h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, 'Importar cronograma'), h('p', null, 'Traga o cronograma do MS Project ou de uma planilha')), passos));
    // 1 · arquivo
    const inp = h('input', { type: 'file', accept: '.xml,.xlsx,.csv,.txt', id: 'im-arq', hidden: true, onchange: e => e.target.files[0] && lerArquivo(e.target.files[0]) });
    const drop = I.arq ? h('div', { class: 'im-arq' + (I.arq.erro ? ' erro' : '') }, h('span', { class: 'im-arq-i' }, ic(I.arq.formato === 'mspdi' ? 'fa-diagram-project' : 'fa-file-excel')),
        h('div', null, h('b', null, I.arq.nome), h('small', null, I.arq.erro || (pv ? `${FORM[I.arq.formato]} · ${Math.max(1, Math.round(I.arq.tamanho / 1024))} KB${pv.info.nome ? ' · “' + pv.info.nome + '”' : ''}${pv.info.inicio ? ' · início ' + dBRano(pv.info.inicio) : ''}` : 'Lendo o arquivo…'))),
        h('button', { class: 'eq-bt', onclick: () => inp.click() }, 'Trocar'))
      : h('button', { class: 'im-drop', id: 'im-drop', onclick: () => inp.click(), ondragover: e => { e.preventDefault(); e.currentTarget.classList.add('sobre'); }, ondragleave: e => e.currentTarget.classList.remove('sobre'),
          ondrop: e => { e.preventDefault(); e.currentTarget.classList.remove('sobre'); const a = e.dataTransfer.files[0]; if (a) lerArquivo(a); } },
          ic('fa-cloud-arrow-up'), h('b', null, mob ? 'Escolher o arquivo' : 'Arraste o arquivo aqui ou clique para escolher'), h('small', null, 'MS Project (.xml), Excel (.xlsx) ou CSV'));
    const s1 = h('section', { class: 'im-sec' }, h('b', { class: 'im-t' }, '1 · Arquivo'), inp, drop,
      h('small', { class: 'im-nota' }, 'No MS Project: Arquivo › Salvar como › “Formato XML (*.xml)”. Planilha: colunas Atividade, Duração, Início, Responsável e Predecessoras (EAP opcional). ',
        h('a', { href: 'api/importar/modelo', download: 'modelo-cronograma-aprumo.xlsx' }, 'Baixar planilha modelo')));
    // 2 · para onde
    let s2 = null;
    if (pv) {
      const obras = (I.lista && I.lista.obras) || [];
      const campo = (k, t, extra) => h('label', { class: 'em-campo' }, h('span', null, t), h('input', { class: 'em-in', id: 'im-' + k, value: I.obra[k] || '', type: k === 'inicio' ? 'date' : 'text', maxlength: extra,
        oninput: e => { I.obra[k] = e.target.value; if (k === 'nome') { const ok = !!e.target.value.trim(), b = document.getElementById('im-importar'), t3 = document.querySelector('.im-t3 .eq-selo'); if (b) b.disabled = !ok || I.enviando; if (t3) t3.replaceWith(selo(ok ? 'Pronto para importar' : 'Falta o nome da obra', ok ? 'ok' : 'ven')); } } }));   // sem redesenhar ao sair do campo: redesenhar no meio da digitação jogava fora o que se digitava no campo seguinte
      const opc = (k, t, s) => h('button', { class: 'im-op' + (I.destino === k ? ' on' : ''), 'data-destino': k, onclick: () => { I.destino = k; desenharI(); } }, h('b', null, t), h('small', null, s));
      s2 = h('section', { class: 'im-sec' }, h('b', { class: 'im-t' }, '2 · Para onde'),
        h('div', { class: 'im-ops' }, opc('nova', 'Nova obra', 'Cria a obra com o cronograma do arquivo'), opc('existente', 'Obra que já existe', 'Acrescenta ou substitui o cronograma')),
        I.destino === 'nova' ? [h('div', { class: 'im-cod' }, campo('codigo', 'Código', 30), campo('nome', 'Nome', 200)), h('div', { class: 'em-dois' }, campo('cliente', 'Cliente', 200), campo('inicio', 'Início')),
            h('small', { class: 'im-nota' }, pv.info.inicio ? `As datas do arquivo são mantidas (começa em ${dBRano(pv.info.inicio)}). Mudou o início, tudo anda junto.` : 'O arquivo não traz datas: as atividades começam no início escolhido.')]
          : [h('label', { class: 'em-campo' }, h('span', null, 'Obra'), h('select', { class: 'em-in', id: 'im-obra', onchange: e => { I.projeto_id = e.target.value; desenharI(); } }, h('option', { value: '' }, 'Escolha a obra…'),
              obras.map(o => h('option', { value: o.id, selected: String(o.id) === String(I.projeto_id) }, `${o.codigo ? o.codigo + ' · ' : ''}${o.nome} (${o.atividades} atividades)`)))),
            h('div', { class: 'im-ops' }, h('button', { class: 'im-op' + (!I.substituir ? ' on' : ''), onclick: () => { I.substituir = false; desenharI(); } }, h('b', null, 'Acrescentar'), h('small', null, 'Entra depois das atividades que já existem')),
              h('button', { class: 'im-op' + (I.substituir ? ' on' : ''), 'data-substituir': '1', onclick: () => { I.substituir = true; desenharI(); } }, h('b', null, 'Substituir'), h('small', null, 'Apaga o cronograma atual e põe o do arquivo')))]);
    }
    // 3 · conferir
    let s3 = null;
    if (pv) {
      const r = pv.responsaveis, falta = r.lista.filter(x => !x.achado);
      const kpi = (n, t, cor) => h('div', { class: 'eq-kpi ' + cor }, h('b', null, n), h('span', null, t));
      const pronto = I.destino === 'nova' ? !!(I.obra.nome || '').trim() : !!I.projeto_id;
      const linhas = h('div', { class: 'im-tab' }, mob ? null : h('div', { class: 'im-lin im-th' }, ['Atividade', 'Duração', 'Início', 'Responsável'].map(t => h('span', null, t))),
        pv.linhas.slice(0, mob ? 12 : 60).map(l => h('div', { class: 'im-lin' + (l.etapa ? ' etapa' : '') }, h('span', { style: `padding-left:${l.nivel * 16}px` }, l.descricao),
          h('span', null, l.duracao_dias != null ? String(l.duracao_dias).replace('.', ',') + ' d' : '—'), mob ? null : h('span', null, dBR(l.inicio)),
          mob ? null : h('span', null, l.responsavel ? selo((l.achado ? '✓ ' : '? ') + l.responsavel, l.achado ? 'ok' : 'ven') : ''))),
        pv.linhas.length > (mob ? 12 : 60) || pv.mais ? h('small', { class: 'im-nota pad' }, `… e mais ${pv.atividades - (mob ? 12 : 60)} linhas`) : null);
      s3 = h('section', { class: 'im-sec' }, h('div', { class: 'im-t3' }, h('b', { class: 'im-t' }, '3 · Conferir'), selo(pronto ? 'Pronto para importar' : I.destino === 'nova' ? 'Falta o nome da obra' : 'Escolha a obra', pronto ? 'ok' : 'ven')),
        h('div', { class: 'eq-kpis im-kpis' }, kpi(pv.atividades, 'atividades', 'azul'), kpi(pv.etapas, 'etapas', ''), kpi(pv.ligacoes, 'ligações (predecessoras)', 'verd'),
          kpi(r.total ? `${r.achados} de ${r.total}` : '—', r.total ? 'responsáveis encontrados na Equipe' : 'sem responsáveis no arquivo', r.total && r.achados < r.total ? 'amar' : 'verd')),
        falta.length ? h('p', { class: 'im-aviso' }, `${falta.map(x => '“' + x.nome + '”').join(', ')} não ${falta.length > 1 ? 'estão' : 'está'} na Equipe: ${falta.length > 1 ? 'as atividades entram' : 'a atividade entra'} sem responsável e você escolhe depois.`) : null,
        I.destino === 'existente' && I.substituir ? h('p', { class: 'im-aviso vm' }, 'Substituir apaga as atividades atuais da obra (o histórico guarda o que foi feito).') : null,
        linhas, h('div', { class: 'em-bts' }, h('button', { class: 'eq-bt', onclick: () => { I.arq = null; I.pv = null; I.dados = null; I.passo = 1; desenharI(); } }, 'Recomeçar'),
          h('button', { class: 'eq-bt pri', id: 'im-importar', disabled: !pronto || I.enviando, onclick: importar }, ic('fa-file-import'), I.enviando ? ' Importando…' : ' Importar e abrir a obra')));
      if (pronto) I.passo = 3; else I.passo = 2;
      passos.querySelectorAll('span').forEach((s, i) => { s.className = i + 1 < I.passo ? 'feito' : i + 1 === I.passo ? 'atual' : ''; s.querySelector('i').textContent = i + 1 < I.passo ? '✓' : i + 1; });
    }
    box.append(mob ? h('div', { class: 'im-col' }, s1, s2, s3) : h('div', { class: 'im-grade' + (pv ? '' : ' so') }, h('div', { class: 'im-col' }, s1, s2), s3 || ajuda()));
    const L = I.lista;
    if (L && L.importacoes && L.importacoes.length) box.append(h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Importações feitas'), h('small', null, 'Quem importou, quando e de qual arquivo'))),
      h('div', { class: 'im-hist' }, L.importacoes.map(x => h('div', { class: 'im-hist-l' }, h('b', null, x.arquivo || 'arquivo'), h('span', null, x.obra, ' · ', { nova: 'nova obra', substituiu: 'substituiu', acrescentou: 'acrescentou' }[x.destino] || x.destino, ` · ${x.atividades} atividades`),
        h('span', { class: 'cz' }, x.usuario || '—'), h('span', { class: 'cz' }, `${dBR(x.quando.slice(0, 10))} ${x.quando.slice(11, 16)}`))))));
    window.scrollTo(0, y);
    if (foco && foco.startsWith('im-')) { const el = document.getElementById(foco); if (el) el.focus(); }
  }
  function ajuda() {
    return h('section', { class: 'im-sec im-ajuda' }, h('b', { class: 'im-t' }, 'Como funciona'),
      h('ol', null, h('li', null, 'Escolha o arquivo do MS Project (.xml) ou a planilha.'), h('li', null, 'Diga se é uma obra nova ou uma que já existe.'),
        h('li', null, 'Confira o que veio: atividades, etapas, ligações e quem é responsável.'), h('li', null, 'Importe: a obra abre pronta, com as datas calculadas pelo calendário da empresa.')),
      h('small', { class: 'im-nota' }, 'Os nomes dos responsáveis precisam ser iguais aos da Equipe para entrarem sozinhos.'));
  }
  async function importar() {
    if (I.destino === 'existente' && I.substituir && !I.confirmado) {
      const o = ((I.lista && I.lista.obras) || []).find(x => String(x.id) === String(I.projeto_id));
      return janela('Substituir o cronograma', h('p', { class: 'rl-nota' }, `As ${o ? o.atividades : ''} atividades atuais de ${o ? (o.codigo || o.nome) : 'esta obra'} saem e entram as ${I.pv.atividades} do arquivo. O histórico guarda o que existia.`),
        'Substituir', () => { I.confirmado = true; importar(); });
    }
    I.confirmado = false; I.enviando = true; desenharI();
    try {
      const corpo = { ...I.dados, destino: I.destino, ...(I.destino === 'nova' ? { obra: { ...I.obra } } : { projeto_id: +I.projeto_id, substituir: I.substituir }) };
      const r = await api('importar/obra', 'POST', corpo);
      try { if (window.tfServidor && tfServidor.recarregar) tfServidor.recarregar(); } catch (_) {}   // telas antigas (Gantt geral, gráficos) passam a ver a obra nova sem recarregar a página
      avisar(`${r.atividades} atividades importadas${r.ligacoes ? ' com ' + r.ligacoes + ' ligações' : ''}`, 'success');
      Object.assign(I, { passo: 1, arq: null, pv: null, dados: null, enviando: false, obra: { codigo: '', nome: '', cliente: '', inicio: '' }, projeto_id: '', substituir: false, lista: null });
      if (window.tfObra) await tfObra.abrir(r.projeto_id);
    } catch (e) { I.enviando = false; avisar(e.message, 'error'); desenharI(); }
  }
  function janela(titulo, corpo, okTxt, aoOk) {
    const fundo = h('div', { class: 'eq-fundo', role: 'presentation' });
    const fechar = () => fundo.remove();
    fundo.append(h('div', { class: 'eq-jan em-jan', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div', { class: 'eq-jan-cab' }, h('h2', null, titulo), h('button', { class: 'eq-x', 'aria-label': 'Fechar', onclick: fechar }, ic('fa-xmark'))),
      h('div', { class: 'eq-jan-corpo' }, h('div', { class: 'em-jan-pad' }, corpo)),
      h('div', { class: 'eq-acoes' }, h('button', { class: 'eq-bt', onclick: fechar }, 'Voltar'), h('button', { class: 'eq-bt pri em-perigo', id: 'im-ok', onclick: () => { fechar(); aoOk(); } }, okTxt))));
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    document.body.append(fundo);
  }
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome === 'importar') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Importar cronograma'; desenharI(); carregarI(); }
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); desenharH(); desenharI(); } }; })());
  window.tfHistorico = { abrir: () => window.switchView('historico', document.getElementById('nav-historico')), estado: H };
  window.tfImportar = { abrir: () => window.switchView('importar', document.getElementById('nav-importar')), estado: I };
})();
