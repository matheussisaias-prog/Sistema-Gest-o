/* Task Flow · equipe.js — tela "Equipe": pessoas, situação, documentos de NR (cargo + atividade), certificados,
   ausências, agenda, fotos de campo; cargos e documentos exigidos. */
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
  const T = s => Date.parse(s + 'T00:00:00Z');
  const mais = (s, n) => new Date(T(s) + n * 864e5).toISOString().slice(0, 10);
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
  const dBRano = s => s ? dBR(s) + '/' + s.slice(0, 4) : '—';
  const celular = () => window.innerWidth <= 760;
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
  const iniciais = n => String(n || '?').replace(/\([^)]*\)/g, ' ').trim().split(/\s+/).filter(w => /^\p{L}/u.test(w)).map((p, i, a) => i === 0 || i === a.length - 1 ? p[0] : '').join('').slice(0, 2).toUpperCase() || '?';
  const raiz = () => document.getElementById('view-pessoas');
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const lerArquivo = arq => new Promise((res, rej) => {
    if (arq.type === 'application/pdf') { if (arq.size > 10 * 1024 * 1024) { rej(new Error('PDF grande demais (até 10 MB)')); return; } const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new Error('Não consegui ler o arquivo')); fr.readAsDataURL(arq); return; }
    const url = URL.createObjectURL(arq), img = new Image();
    img.onload = () => { const r = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Envie PDF, JPG ou PNG')); };
    img.src = url;
  });
  const SELO = { ok: 'ok', vencendo: 'ven', vence_antes: 'ven', vencido: 'vc', falta: 'vc', trabalhando: 'ok', ferias: 'az', afastado: 'lr', ausente: 'cz' };
  const selo = (txt, k) => h('span', { class: 'eq-selo ' + (SELO[k] || k || 'cz') }, txt);
  const barraCarga = c => { const cor = c > 100 ? 'verm' : c >= 85 ? 'lar' : c === 0 ? 'cinza' : 'azul'; return h('div', { class: 'eq-carga ' + cor }, h('span', null, h('i', { style: `width:${Math.min(100, c)}%` })), h('b', null, c >= 999 ? 'ausente' : c + '%')); };

  const M = { d: null, ficha: null, f: null, aba: 'documentos', filtro: { busca: '', cargo: '', enc: '', doc: '', inativos: false }, tipos: null, carregando: false };

  /* ── carga ──────────────────────────────────── */
  async function carregar() {
    M.carregando = true; desenhar();
    try { M.d = await api('equipe'); M.erro = null; } catch (e) { M.erro = e.message; }
    M.carregando = false; desenhar();
  }
  async function abrirFicha(id, aba) {
    M.ficha = id; M.f = null; if (aba) M.aba = aba; desenhar(); window.scrollTo(0, 0);
    try { M.f = await api('equipe/' + id); } catch (e) { avisar(e.message, 'error'); M.ficha = null; }
    desenhar();
  }
  async function tipos() { if (!M.tipos) M.tipos = (await api('tipos-documento')).tipos; return M.tipos; }

  /* ── desenho ────────────────────────────────── */
  function desenhar() {
    const R = raiz(); if (!R || !R.classList.contains('active')) return;
    R.innerHTML = '';
    const box = h('div', { class: 'eq' }); R.append(box);
    if (M.ficha) { box.append(...ficha()); return; }
    if (!M.d) { box.append(h('p', { class: 'eq-vazio' }, M.erro || 'Carregando…')); return; }
    box.append(...lista());
  }
  function lista() {
    const d = M.d, P = d.pessoas, f = M.filtro;
    const ativos = P.filter(p => p.ativo);
    const k = {
      trab: ativos.filter(p => p.situacao.tipo === 'trabalhando').length, aus: ativos.filter(p => p.situacao.tipo !== 'trabalhando').length,
      venc: ativos.filter(p => p.documentos.nivel === 'vencido').length, vencendo: ativos.filter(p => p.documentos.nivel === 'vencendo').length, acima: ativos.filter(p => p.carga > 100 && p.carga < 999).length,
    };
    const campo = ativos.filter(p => p.tipo_trabalho !== 'escritorio').length;
    const cab = h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, 'Equipe'), h('p', null, `${ativos.length} pessoa${ativos.length === 1 ? '' : 's'} · ${campo} em campo`)),
      h('button', { class: 'eq-bt', onclick: abrirCargos }, ic('fa-id-card'), ' Cargos e documentos exigidos'),
      d.pode_editar ? h('button', { class: 'eq-bt pri', onclick: () => formPessoa(null) }, ic('fa-plus'), ' Nova pessoa') : null);
    const kpi = (n, t, cor, fn) => h('button', { class: 'eq-kpi ' + cor + (fn === f.doc || fn === f.sit ? ' on' : ''), onclick: () => { if (fn === 'ausentes') { f.sit = f.sit === 'ausentes' ? '' : 'ausentes'; f.doc = ''; } else if (fn === 'acima') { f.sit = f.sit === 'acima' ? '' : 'acima'; f.doc = ''; } else if (fn) { f.doc = f.doc === fn ? '' : fn; f.sit = ''; } desenhar(); } }, h('b', null, n), h('span', null, t));
    const kpis = celular()
      ? h('div', { class: 'eq-kpis' }, kpi(k.venc, 'doc. vencido', 'verm', 'vencido'), kpi(k.vencendo, 'vencendo', 'amar', 'vencendo'), kpi(k.aus, 'ausentes', 'azul', 'ausentes'))
      : h('div', { class: 'eq-kpis' }, kpi(k.trab, 'trabalhando hoje', 'verd', null), kpi(k.aus, 'de férias ou afastadas', 'azul', 'ausentes'), kpi(k.venc, 'com documento vencido ou faltando', 'verm', 'vencido'), kpi(k.vencendo, 'documentos vencendo em 30 dias', 'amar', 'vencendo'), kpi(k.acima, 'acima da capacidade (14 dias)', 'lar', 'acima'));
    const busca = h('input', { type: 'search', placeholder: 'Buscar pessoa', 'aria-label': 'Buscar pessoa', value: f.busca, oninput: e => { f.busca = e.target.value; desenharGrade(); } });
    const sel = (rot, val, ops, fn) => h('select', { 'aria-label': rot, onchange: e => { fn(e.target.value); desenharGrade(); } }, ops.map(([v, t]) => h('option', { value: v, selected: String(v) === String(val) }, t)));
    const filtros = h('div', { class: 'eq-filtros' }, h('label', { class: 'eq-busca' }, ic('fa-magnifying-glass'), busca),
      celular() ? null : sel('Cargo', f.cargo, [['', 'Todos os cargos'], ...d.cargos.map(c => [c, c])], v => f.cargo = v),
      celular() ? null : sel('Encarregado', f.enc, [['', 'Todos os encarregados'], ...d.encarregados.map(e => [e.id, e.nome])], v => f.enc = v),
      celular() ? null : sel('Documentos', f.doc, [['', 'Documentos: todos'], ['vencido', 'Vencido ou faltando'], ['vencendo', 'Vencendo em 30 dias'], ['ok', 'Em dia']], v => { f.doc = v; f.sit = ''; }),
      h('label', { class: 'eq-chk' }, h('input', { type: 'checkbox', checked: f.inativos, onchange: e => { f.inativos = e.target.checked; desenharGrade(); } }), ' Inativos'));
    const grade = h('div', { class: 'eq-grade', id: 'eq-grade' });
    setTimeout(desenharGrade, 0);
    return [cab, kpis, filtros, grade];
  }
  function desenharGrade() {
    const g = document.getElementById('eq-grade'); if (!g) return;
    const f = M.filtro, b = sem(f.busca.trim());
    const L = M.d.pessoas.filter(p => (f.inativos || p.ativo) && (!b || sem(p.nome + ' ' + (p.apelido || '') + ' ' + (p.cargo || '')).includes(b))
      && (!f.cargo || p.cargo === f.cargo) && (!f.enc || String(p.encarregado_id) === String(f.enc))
      && (!f.doc || p.documentos.nivel === f.doc) && (f.sit !== 'ausentes' || p.situacao.tipo !== 'trabalhando') && (f.sit !== 'acima' || (p.carga > 100 && p.carga < 999)));
    g.innerHTML = '';
    if (!L.length) { g.append(h('p', { class: 'eq-vazio' }, 'Ninguém com esses filtros.')); return; }
    L.forEach(p => g.append(h('button', { class: 'eq-card' + (p.ativo ? '' : ' inativo'), onclick: () => abrirFicha(p.id, 'documentos') },
      h('div', { class: 'eq-card-cab' }, h('span', { class: 'eq-av' }, iniciais(p.nome)), h('span', { class: 'eq-card-t' }, h('b', null, p.nome), h('small', null, [p.cargo, { campo: 'campo', escritorio: 'escritório', ambos: 'campo e escritório' }[p.tipo_trabalho]].filter(Boolean).join(' · ')))),
      h('div', { class: 'eq-selos' }, p.ativo ? selo(p.situacao.texto, p.situacao.tipo) : selo('Inativo', 'cz'), selo(p.documentos.texto, p.documentos.nivel)),
      h('dl', { class: 'eq-dl' }, h('dt', null, 'Encarregado'), h('dd', null, p.encarregado_nome || '—'), h('dt', null, 'Obras agora'), h('dd', null, p.obras.length ? p.obras.join(' · ') : '—')),
      h('div', null, h('small', { class: 'eq-rot' }, 'Carga nos próximos 14 dias' + (p.carga > 100 && p.carga < 999 ? ' · acima da capacidade' : '')), barraCarga(p.carga)))));
  }

  /* ── ficha ──────────────────────────────────── */
  function ficha() {
    const voltar = h('button', { class: 'eq-voltar', onclick: () => { M.ficha = null; M.f = null; carregar(); } }, ic('fa-arrow-left'), ' Equipe');
    if (!M.f) return [voltar, h('p', { class: 'eq-vazio' }, 'Carregando…')];
    const F = M.f, p = F.pessoa;
    const tel = (p.telefone || '').replace(/\D/g, '');
    const cab = h('div', { class: 'eq-ficha-cab' },
      h('span', { class: 'eq-av g' }, iniciais(p.nome)),
      h('div', { class: 'eq-ficha-t' }, h('h1', null, p.nome),
        h('p', null, [p.cargo, { campo: 'campo', escritorio: 'escritório', ambos: 'campo e escritório' }[p.tipo_trabalho], p.encarregado_nome ? 'encarregado ' + p.encarregado_nome : null, celular() ? null : p.telefone, celular() ? null : p.email].filter(Boolean).join(' · ')),
        h('div', { class: 'eq-selos' }, selo(F.situacao, F.situacao === 'Trabalhando' ? 'trabalhando' : F.situacao.startsWith('Férias') ? 'ferias' : 'afastado'), selo(F.documentos_resumo.texto, F.documentos_resumo.nivel),
          p.acesso ? selo('Acesso ao sistema: ' + p.acesso, 'cz') : null, p.ativo ? null : selo('Inativo', 'cz'))),
      h('div', { class: 'eq-ficha-carga' }, h('small', { class: 'eq-rot' }, 'Carga nos próximos 14 dias'), barraCarga(F.carga)),
      celular() && tel ? h('div', { class: 'eq-contato' }, h('a', { class: 'eq-bt', href: 'tel:' + tel }, ic('fa-phone'), ' Ligar'), h('a', { class: 'eq-bt', href: 'https://wa.me/' + (tel.length <= 11 ? '55' + tel : tel), target: '_blank', rel: 'noopener' }, ic('fa-comment'), ' WhatsApp')) : null,
      F.pode_editar && !celular() ? h('button', { class: 'eq-bt', onclick: () => { M.aba = 'dados'; desenhar(); } }, 'Editar dados') : null);
    const abas = [['documentos', `Documentos (${F.documentos.length})`], ['ausencias', 'Ausências'], ['agenda', 'Agenda'], ['campo', 'Do campo'], ['dados', 'Dados']];
    const tabs = h('div', { class: 'eq-abas', role: 'tablist' }, abas.map(([k, t]) => h('button', { role: 'tab', 'aria-selected': M.aba === k ? 'true' : 'false', class: M.aba === k ? 'on' : '', onclick: () => { M.aba = k; desenhar(); } }, t)));
    const corpo = { documentos: abaDocumentos, ausencias: abaAusencias, agenda: abaAgenda, campo: abaCampo, dados: abaDados }[M.aba]();
    return [voltar, cab, tabs, corpo];
  }
  function abaDocumentos() {
    const F = M.f;
    const box = h('section', { class: 'eq-painel' },
      h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Documentos exigidos'), h('small', null, `Pelo cargo${F.pessoa.cargo ? ' (' + F.pessoa.cargo + ')' : ''}, pelas obras e pelas atividades em que ${F.pessoa.nome.split(' ')[0]} está. Vencimento calculado pela norma.`)),
        F.pode_documentos ? h('button', { class: 'eq-bt pri', onclick: () => lancarDoc(null) }, ic('fa-plus'), ' Lançar documento') : null));
    if (!F.documentos.length) box.append(h('p', { class: 'eq-vazio' }, 'Nenhum documento exigido. Defina os documentos do cargo em "Cargos e documentos exigidos" ou na atividade, na obra.'));
    const linha = d => h('div', { class: 'eq-doc ' + d.situacao },
      h('div', { class: 'eq-doc-n' }, h('b', null, d.nome), h('small', null, d.exigido_por ? d.exigido_por : 'Lançado sem exigência', d.prazo ? ' · ' + d.prazo : '')),
      h('span', { class: 'eq-doc-d' }, h('small', null, 'Emissão'), dBRano(d.emissao)), h('span', { class: 'eq-doc-d' }, h('small', null, 'Vence'), d.vence ? dBRano(d.vence) : d.emissao ? 'sem validade' : '—'),
      h('span', null, selo(d.situacao_texto, d.situacao)),
      h('span', { class: 'eq-doc-a' }, d.arquivo === 'ver' ? h('a', { href: `api/documentos/${d.documento_id}/arquivo`, target: '_blank', rel: 'noopener' }, ic('fa-paperclip'), ' certificado') : d.arquivo === 'restrito' ? h('small', { title: 'Arquivo de saúde: só o administrador abre' }, ic('fa-lock'), ' restrito') : h('small', null, 'sem arquivo')),
      F.pode_documentos ? h('button', { class: 'eq-bt' + (d.documento_id ? '' : ' pri'), onclick: () => lancarDoc(d.tipo_id) }, d.documento_id ? 'Renovar' : celular() ? 'Lançar com foto' : 'Lançar') : h('span'));
    F.documentos.forEach(d => box.append(linha(d)));
    if (F.outros_documentos.length) { box.append(h('div', { class: 'eq-sub' }, 'Outros documentos lançados')); F.outros_documentos.forEach(d => box.append(linha(d))); }
    box.append(h('p', { class: 'eq-nota' }, ic('fa-circle-info'), ' Afastamento longo depois da emissão invalida o treinamento (NR-01): o sistema marca sozinho. O arquivo do ASO fica restrito ao administrador.'));
    return box;
  }
  async function lancarDoc(tipoId) {
    let L; try { L = await tipos(); } catch (e) { avisar(e.message, 'error'); return; }
    const fT = h('select', { 'aria-label': 'Documento' }, h('option', { value: '' }, 'Escolha o documento…'),
      [...new Set(L.map(t => t.nr || 'Outros'))].map(nr => h('optgroup', { label: nr }, L.filter(t => (t.nr || 'Outros') === nr).map(t => h('option', { value: t.id, selected: t.id === tipoId }, `${t.nome} (${t.prazo})`)))));
    const fE = h('input', { type: 'date', max: M.f.hoje, 'aria-label': 'Emissão' });
    const fV = h('input', { type: 'date', 'aria-label': 'Validade' });
    const fI = h('input', { type: 'text', maxlength: '160', placeholder: 'Ex.: SENAI', 'aria-label': 'Instituição' });
    const fA = h('select', { 'aria-label': 'Resultado do ASO' }, h('option', { value: '1' }, 'Apto'), h('option', { value: '0' }, 'Inapto'));
    const fArq = h('input', { type: 'file', accept: 'application/pdf,image/*', 'aria-label': 'Certificado' });
    if (celular()) fArq.setAttribute('capture', 'environment');
    const rotV = h('label', { class: 'eq-campo', hidden: true }, h('span', null, 'Validade (escrita no documento)'), fV);
    const rotA = h('label', { class: 'eq-campo', hidden: true }, h('span', null, 'Resultado'), fA);
    const info = h('small', { class: 'eq-nota' });
    const ajusta = () => { const t = L.find(x => String(x.id) === fT.value); rotV.hidden = !(t && t.pede_validade); rotA.hidden = !(t && t.categoria === 'exame'); info.textContent = t ? (t.pede_validade ? 'A validade vem escrita no documento.' : `Vencimento calculado: ${t.prazo}.`) + (t.categoria === 'exame' ? ' O arquivo do ASO fica restrito ao administrador.' : '') : ''; };
    fT.onchange = ajusta; ajusta();
    const corpo = h('div', { class: 'eq-form' }, h('label', { class: 'eq-campo larga' }, h('span', null, 'Documento'), fT), h('label', { class: 'eq-campo' }, h('span', null, 'Data de emissão'), fE), rotV, rotA,
      h('label', { class: 'eq-campo' }, h('span', null, 'Instituição (opcional)'), fI), h('label', { class: 'eq-campo larga' }, h('span', null, 'Certificado (PDF ou foto)'), fArq), info);
    janela(`Lançar documento · ${M.f.pessoa.nome}`, corpo, 'Salvar documento', async () => {
      if (!fT.value) throw new Error('Escolha o documento');
      if (!fE.value) throw new Error('Informe a data de emissão');
      const dados = { tipo_documento_id: +fT.value, emissao: fE.value, instituicao: fI.value.trim() || null };
      if (!rotV.hidden) dados.validade = fV.value;
      if (!rotA.hidden) dados.apto = fA.value === '1';
      if (fArq.files[0]) dados.arquivo = { dados: await lerArquivo(fArq.files[0]), nome: fArq.files[0].name };
      await api(`funcionarios/${M.f.pessoa.id}/documentos`, 'POST', dados);
      avisar('✓ Documento lançado', 'success'); abrirFicha(M.f.pessoa.id, 'documentos');
    });
    (tipoId ? fE : fT).focus();
  }
  const TIPOS_AUS = ['Férias', 'Folga', 'Treinamento', 'Outra atividade', 'Afastamento – doença ou acidente', 'Afastamento – outro motivo'];
  function abaAusencias() {
    const F = M.f, box = h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Ausências'), h('small', null, 'Férias, folgas, treinamentos e afastamentos. Ficam de fora da carga e avisam quem for alocar.'))));
    const salvar = async lista => { try { await api(`ausencias/funcionario/${F.pessoa.id}`, 'PUT', { periodos: lista.map(a => ({ inicio: a.inicio, fim: a.fim, tipo: a.tipo, detalhe: a.detalhe || null })) }); avisar('✓ Ausências salvas', 'success'); abrirFicha(F.pessoa.id, 'ausencias'); } catch (e) { avisar(e.message, 'error'); } };
    if (F.pode_documentos) {
      const fT = h('select', { 'aria-label': 'Tipo' }, TIPOS_AUS.map(t => h('option', null, t))), fI = h('input', { type: 'date', 'aria-label': 'De' }), fF = h('input', { type: 'date', 'aria-label': 'Até' }), fD = h('input', { type: 'text', maxlength: '200', placeholder: 'Detalhe (opcional)', 'aria-label': 'Detalhe' });
      box.append(h('div', { class: 'eq-aus-nova' }, fT, fI, fF, fD, h('button', { class: 'eq-bt pri', onclick: () => { if (!fI.value || !fF.value || fF.value < fI.value) { avisar('Confira as datas.', 'error'); return; } salvar([...F.ausencias, { inicio: fI.value, fim: fF.value, tipo: fT.value, detalhe: fD.value.trim() }]); } }, ic('fa-plus'), ' Incluir')));
    }
    if (!F.ausencias.length) box.append(h('p', { class: 'eq-vazio' }, 'Nenhuma ausência registrada.'));
    F.ausencias.forEach((a, i) => {
      const dias = Math.round((T(a.fim) - T(a.inicio)) / 864e5) + 1, agora = a.inicio <= F.hoje && a.fim >= F.hoje;
      box.append(h('div', { class: 'eq-aus' + (agora ? ' agora' : '') }, h('b', null, a.tipo), h('span', null, `${dBRano(a.inicio)} a ${dBRano(a.fim)} · ${dias} dia${dias > 1 ? 's' : ''}${agora ? ' · agora' : a.fim < F.hoje ? '' : ' · programada'}`), h('small', null, a.detalhe || ''),
        F.pode_documentos ? h('button', { class: 'eq-x', 'aria-label': 'Tirar esta ausência', onclick: () => salvar(F.ausencias.filter((_, j) => j !== i)) }, ic('fa-xmark')) : null));
    });
    return box;
  }
  function abaAgenda() {
    const F = M.f, box = h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Agenda'), h('small', null, 'Atividades da última semana às próximas 8 semanas.'))));
    if (!F.agenda.length) { box.append(h('p', { class: 'eq-vazio' }, 'Nenhuma atividade nesse período.')); return box; }
    const ini = mais(F.hoje, -7 - ((new Date(T(F.hoje)).getUTCDay() + 6) % 7)), dias = 63;
    const pct = d => Math.max(0, Math.min(100, (T(d) - T(ini)) / 864e5 / dias * 100));
    const g = h('div', { class: 'eq-gantt' });
    const sem = h('div', { class: 'eq-g-sem' }); for (let k = 0; k < 9; k++) sem.append(h('span', { style: `left:${k / 9 * 100}%` }, dBR(mais(ini, k * 7))));
    g.append(h('div', { class: 'eq-g-lin cab' }, h('span', null, 'Atividade'), sem));
    const hoje = h('i', { class: 'eq-g-hoje', style: `left:${pct(F.hoje)}%` });
    F.agenda.forEach(a => g.append(h('div', { class: 'eq-g-lin' }, h('button', { class: 'eq-g-nome', title: `${a.codigo || ''} · ${a.descricao}`, onclick: () => { if (window.tfObra && M.d && M.d.pode_editar) tfObra.abrir(a.projeto_id); } }, h('small', null, a.codigo || a.obra), ' ', a.descricao),
      h('span', { class: 'eq-g-area' }, h('i', { class: 'eq-g-b' + (a.situacao === 'Concluído' ? ' ok' : a.fim < F.hoje ? ' atr' : ''), style: `left:${pct(a.inicio)}%;width:${Math.max(1.2, pct(mais(a.fim || a.inicio, 1)) - pct(a.inicio))}%`, title: `${dBR(a.inicio)} → ${dBR(a.fim)} · ${a.avanco}%` })))));
    F.ausencias.filter(a => a.fim >= ini && a.inicio <= mais(ini, dias)).forEach(a => g.append(h('div', { class: 'eq-g-lin aus' }, h('span', { class: 'eq-g-nome' }, a.tipo),
      h('span', { class: 'eq-g-area' }, h('i', { class: 'eq-g-b aus', style: `left:${pct(a.inicio)}%;width:${Math.max(1.2, pct(mais(a.fim, 1)) - pct(a.inicio))}%` })))));
    g.append(h('div', { class: 'eq-g-hoje-box' }, hoje));
    box.append(g); return box;
  }
  function abaCampo() {
    const F = M.f, box = h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Do campo'), h('small', null, 'Fotos e avanços registrados em Minhas atividades.'))));
    if (F.fotos.length) box.append(h('div', { class: 'eq-fotos' }, F.fotos.map(f => h('a', { href: `api/fotos/${f.id}`, target: '_blank', rel: 'noopener' }, h('img', { src: `api/fotos/${f.id}?mini=1`, alt: 'Foto de ' + (f.atividade || 'campo'), loading: 'lazy' }), h('small', null, `${dBR(f.tirada_em.slice(0, 10))} · ${f.codigo || ''} ${f.atividade || ''}`)))));
    if (F.avancos.length) box.append(h('ul', { class: 'eq-avancos' }, F.avancos.map(v => h('li', null, h('b', null, `${v.de_avanco}% → ${v.para_avanco}%`), ` ${v.codigo || ''} · ${v.atividade}`, v.comentario ? h('small', null, ' “' + v.comentario + '”') : null, h('small', null, ' · ' + new Date(v.criado_em.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }))))));
    if (!F.fotos.length && !F.avancos.length) box.append(h('p', { class: 'eq-vazio' }, 'Nada registrado no campo ainda.'));
    return box;
  }
  function abaDados() { const box = h('section', { class: 'eq-painel' }); box.append(...formCampos(M.f.pessoa, !M.f.pode_editar)); return box; }
  function formCampos(p, so) {
    const v = p || { tipo_trabalho: 'campo', ativo: true };
    const cargos = h('datalist', { id: 'eq-cargos' }, ((M.d && M.d.cargos) || []).map(c => h('option', { value: c })));
    const inp = (k, tipo, extra) => h('input', Object.assign({ type: tipo || 'text', value: v[k] ?? '', disabled: so, 'data-k': k }, extra || {}));
    const encs = ((M.d && M.d.encarregados) || []).filter(e => !p || e.id !== p.id);
    const fEnc = h('select', { disabled: so, 'data-k': 'encarregado_id' }, h('option', { value: '' }, '—'), encs.map(e => h('option', { value: e.id, selected: e.id === v.encarregado_id }, e.nome)));
    const fTipo = h('select', { disabled: so, 'data-k': 'tipo_trabalho' }, [['campo', 'Campo'], ['escritorio', 'Escritório'], ['ambos', 'Campo e escritório']].map(([k, t]) => h('option', { value: k, selected: v.tipo_trabalho === k }, t)));
    const pode = M.d ? M.d.pode_editar : M.f && M.f.pode_editar;
    const campos = h('div', { class: 'eq-form' },
      h('label', { class: 'eq-campo larga' }, h('span', null, 'Nome completo'), inp('nome', 'text', { maxlength: '160', required: true })),
      h('label', { class: 'eq-campo' }, h('span', null, 'Apelido (como é chamado na obra)'), inp('apelido', 'text', { maxlength: '160' })),
      h('label', { class: 'eq-campo' }, h('span', null, 'Cargo'), inp('cargo', 'text', { maxlength: '80', list: 'eq-cargos' }), cargos),
      h('label', { class: 'eq-campo' }, h('span', null, 'Onde trabalha'), fTipo),
      h('label', { class: 'eq-campo' }, h('span', null, 'Encarregado'), fEnc),
      h('label', { class: 'eq-campo' }, h('span', null, 'Telefone / WhatsApp'), inp('telefone', 'tel', { maxlength: '30' })),
      h('label', { class: 'eq-campo' }, h('span', null, 'E-mail'), inp('email', 'email', { maxlength: '190' })),
      pode ? h('label', { class: 'eq-campo' }, h('span', null, 'Custo por hora (R$)'), inp('custo_hora', 'number', { min: '0', step: '0.01' })) : null,
      p ? h('label', { class: 'eq-chk larga' }, h('input', { type: 'checkbox', checked: v.ativo, disabled: so, 'data-k': 'ativo' }), ' Ativo (desmarque quando sair da empresa; o histórico fica guardado)') : null);
    const ler = () => { const o = {}; campos.querySelectorAll('[data-k]').forEach(el => { const k = el.dataset.k; let x = el.type === 'checkbox' ? el.checked : el.value.trim(); if (k === 'encarregado_id') x = x ? +x : null; if (k === 'custo_hora') x = x === '' ? null : +x; if (x === '' && k !== 'nome') x = null; o[k] = x; }); return o; };
    if (so) return [campos];
    const bt = h('button', { class: 'eq-bt pri', onclick: async () => {
      const o = ler(); if (!o.nome) { avisar('Informe o nome.', 'error'); return; }
      bt.disabled = true;
      try {
        if (p) { const dif = {}; Object.keys(o).forEach(k => { if ((o[k] ?? null) !== (p[k] ?? null)) dif[k] = o[k]; }); if (Object.keys(dif).length) await api('funcionarios/' + p.id, 'PATCH', dif); avisar('✓ Dados salvos', 'success'); abrirFicha(p.id, 'dados'); if (window.tfServidor) tfServidor.recarregar().catch(() => {}); }
        else { const r = await api('funcionarios', 'POST', o); fechar && fechar(); avisar('✓ Pessoa cadastrada', 'success'); await carregar(); abrirFicha(r.id, 'documentos'); if (window.tfServidor) tfServidor.recarregar().catch(() => {}); }
      } catch (e) { avisar(e.message, 'error'); } bt.disabled = false;
    } }, p ? 'Salvar dados' : 'Cadastrar pessoa');
    let fechar = null;
    if (!p) { fechar = janela('Nova pessoa', campos, null, null, bt); return []; }
    return [campos, h('div', { class: 'eq-acoes' }, bt)];
  }
  function formPessoa() { formCampos(null, false); }

  /* ── cargos e documentos exigidos ───────────── */
  async function abrirCargos() {
    let C, L; try { [C, L] = await Promise.all([api('cargos-documentos'), tipos()]); } catch (e) { avisar(e.message, 'error'); return; }
    let atual = C.cargos[0] ? C.cargos[0].cargo : '';
    const sel = new Map(C.cargos.map(c => [c.cargo, new Set(c.tipos)]));
    const esq = h('div', { class: 'eq-cg-lista' }), dir = h('div', { class: 'eq-cg-docs' });
    const busca = h('input', { type: 'search', placeholder: 'Buscar no catálogo (NR, nome)', 'aria-label': 'Buscar no catálogo' });
    const desenha = () => {
      esq.innerHTML = '';
      C.cargos.forEach(c => esq.append(h('button', { class: 'eq-cg' + (c.cargo === atual ? ' on' : ''), onclick: () => { atual = c.cargo; desenha(); } }, h('b', null, c.cargo), h('small', null, `${c.pessoas} pessoa${c.pessoas === 1 ? '' : 's'} · ${(sel.get(c.cargo) || new Set()).size} documento${(sel.get(c.cargo) || new Set()).size === 1 ? '' : 's'}`))));
      if (C.pode_editar) { const n = h('input', { type: 'text', placeholder: 'Novo cargo', maxlength: '80', 'aria-label': 'Novo cargo' }); esq.append(h('div', { class: 'eq-cg-novo' }, n, h('button', { class: 'eq-bt', onclick: () => { const v = n.value.trim(); if (!v) return; if (!C.cargos.find(c => sem(c.cargo) === sem(v))) { C.cargos.push({ cargo: v, pessoas: 0, tipos: [] }); sel.set(v, new Set()); } atual = C.cargos.find(c => sem(c.cargo) === sem(v)).cargo; desenha(); } }, ic('fa-plus')))); }
      dir.innerHTML = '';
      if (!atual) { dir.append(h('p', { class: 'eq-vazio' }, 'Cadastre um cargo para escolher os documentos.')); return; }
      const S = sel.get(atual) || new Set(); sel.set(atual, S);
      const b = sem(busca.value.trim());
      dir.append(h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, `${atual} precisa de`), h('small', null, 'Marque no catálogo das NRs. A atividade, na obra, pode exigir mais (ex.: NR-33).'))), busca);
      const lista = h('div', { class: 'eq-cg-cat' });
      const ordem = [...L].sort((x, y) => (S.has(y.id) - S.has(x.id)));
      ordem.filter(t => !b || sem(`${t.nr} ${t.nome}`).includes(b)).forEach(t => lista.append(h('label', { class: 'eq-cg-item' + (S.has(t.id) ? ' on' : '') },
        h('input', { type: 'checkbox', checked: S.has(t.id), disabled: !C.pode_editar, onchange: e => { e.target.checked ? S.add(t.id) : S.delete(t.id); desenha(); } }),
        h('span', null, h('b', null, t.nr && !t.nome.startsWith(t.nr) ? t.nr + ' · ' : ''), t.nome), h('small', null, t.prazo))));
      dir.append(lista);
    };
    busca.oninput = () => { const pos = busca.selectionStart; desenha(); busca.focus(); busca.setSelectionRange(pos, pos); };
    desenha();
    const corpo = h('div', { class: 'eq-cg-grade' }, esq, dir);
    janela('Cargos e documentos exigidos', corpo, C.pode_editar ? 'Salvar este cargo' : null, async () => {
      await api('cargos-documentos', 'PUT', { cargo: atual, tipos: [...(sel.get(atual) || [])] });
      avisar(`✓ Documentos de ${atual} salvos`, 'success'); carregar();
      throw Object.assign(new Error(''), { manter: true });
    }, null, 'grande');
  }

  /* ── janela genérica ────────────────────────── */
  function janela(titulo, corpo, okTxt, aoOk, btPronto, cls) {
    const fundo = h('div', { class: 'eq-fundo', role: 'presentation' });
    const bt = btPronto || (okTxt ? h('button', { class: 'eq-bt pri' }, okTxt) : null);
    const j = h('div', { class: 'eq-jan ' + (cls || ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div', { class: 'eq-jan-cab' }, h('h2', null, titulo), h('button', { class: 'eq-x', 'aria-label': 'Fechar', onclick: () => fechar() }, ic('fa-xmark'))),
      h('div', { class: 'eq-jan-corpo' }, corpo), bt ? h('div', { class: 'eq-acoes' }, h('button', { class: 'eq-bt', onclick: () => fechar() }, 'Fechar'), bt) : null);
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') fechar(); };
    if (bt && aoOk) bt.onclick = async () => { bt.disabled = true; try { await aoOk(); fechar(); } catch (e) { if (!e.manter) avisar(e.message, 'error'); } bt.disabled = false; };
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', esc);
    fundo.append(j); document.body.append(fundo);
    return fechar;
  }

  /* ── ligação com o menu ─────────────────────── */
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome === 'pessoas') { const t = document.getElementById('page-title'); if (t) t.textContent = 'Equipe'; M.ficha = null; M.f = null; desenhar(); carregar(); }
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); desenhar(); } }; })());
  window.tfEquipe = { abrir: () => window.switchView('pessoas', document.getElementById('nav-pessoas')), abrirFicha: (id, aba) => { window.switchView('pessoas', document.getElementById('nav-pessoas')); abrirFicha(id, aba); }, estado: M };
})();
