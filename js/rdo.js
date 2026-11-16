/* Task Flow · rdo.js — tela "RDO": calendário da obra (dias úteis, situação de cada dia), pendências de todas as obras,
   RDO do dia (o sistema monta; encarregado completa; gestor fecha), documento A4 com a logo, entrega e folha assinada.
   Usa as peças visuais da Equipe (eq-*) e as próprias (rd-*). */
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
  const T = s => Date.parse(s + 'T00:00:00Z');
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '—';
  const dBRano = s => s ? dBR(s) + '/' + s.slice(0, 4) : '—';
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const celular = () => window.innerWidth <= 760;
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
  const raiz = () => document.getElementById('view-rdo');
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const lerImagem = (arq, max) => new Promise((res, rej) => {
    const url = URL.createObjectURL(arq), img = new Image();
    img.onload = () => { const k = Math.min(1, (max || 2000) / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(arq.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Envie uma imagem PNG ou JPG')); };
    img.src = url;
  });
  const EST = { sem: ['Sem RDO', 'vc'], prazo: ['No prazo', 'az'], hoje: ['Hoje', 'az'], rasc: ['Rascunho', 'ven'], fech: ['Fechado', 'az'], entr: ['Entregue', 'rx'], ass: ['Assinado', 'ok'], nao: ['Sem expediente', 'cz'], futuro: ['', 'cz'] };
  const SIT = { Rascunho: 'rasc', Fechado: 'fech', Entregue: 'entr', Assinado: 'ass' };
  const selo = (txt, cls) => h('span', { class: 'eq-selo ' + (cls || 'cz') }, txt);

  const M = { d: null, obra: null, mes: null, id: null, r: null, salvando: 0 };

  /* ── carga ──────────────────────────────────── */
  async function carregar() {
    try { M.d = await api('rdos' + (M.obra || M.mes ? '?' + new URLSearchParams(Object.assign({}, M.obra ? { obra: M.obra } : {}, M.mes ? { mes: M.mes } : {})) : '')); M.erro = null;
      if (M.d.obra) { M.obra = M.d.obra.id; M.mes = M.d.mes; } } catch (e) { M.erro = e.message; }
    desenhar();
  }
  async function abrirRdo(id) {
    M.id = id; M.r = null; desenhar(); window.scrollTo(0, 0);
    try { M.r = await api('rdos/' + id); } catch (e) { avisar(e.message, 'error'); M.id = null; }
    desenhar();
  }
  async function abrirDia(pid, data) {
    try { const r = await api(`obras/${pid}/rdos`, 'POST', data ? { data } : {}); abrirRdo(r.id); } catch (e) { avisar(e.message, 'error'); }
  }

  /* ── desenho ────────────────────────────────── */
  function desenhar() {
    const R = raiz(); if (!R || !R.classList.contains('active')) return;
    R.innerHTML = '';
    const box = h('div', { class: 'eq rd' }); R.append(box);
    if (M.id) { box.append(...dia().filter(Boolean)); return; }
    if (!M.d) { box.append(h('p', { class: 'eq-vazio' }, M.erro || 'Carregando…')); return; }
    box.append(...lista().filter(Boolean));
  }
  function lista() {
    const d = M.d, mob = celular();
    if (!d.obras.length) return [h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, 'RDO · Diário de obra'))), h('p', { class: 'eq-vazio' }, 'Nenhuma obra para mostrar.')];
    const [ano, mes] = (d.mes || d.hoje.slice(0, 7)).split('-').map(Number);
    const mudaMes = n => { const m = new Date(Date.UTC(ano, mes - 1 + n, 1)); M.mes = m.toISOString().slice(0, 7); carregar(); };
    const cab = h('div', { class: 'eq-cab' }, h('div', { class: 'eq-cab-t' }, h('h1', null, 'RDO · Diário de obra'), h('p', null, 'Um por obra em cada dia útil · o sistema monta com o que o campo registrou')),
      d.pode_logo && !mob ? h('button', { class: 'eq-bt', onclick: janelaLogo }, ic('fa-image'), ' Logo da empresa') : null,
      h('button', { class: 'eq-bt pri', onclick: () => abrirDia(M.obra) }, ic('fa-pen-to-square'), ' RDO de hoje'));
    const ctr = h('div', { class: 'eq-filtros' },
      h('select', { class: 'rd-obra', 'aria-label': 'Obra', onchange: e => { M.obra = +e.target.value; carregar(); } }, d.obras.map(o => h('option', { value: o.id, selected: o.id === M.obra }, `${o.codigo ? o.codigo + ' · ' : ''}${o.nome}`))),
      h('div', { class: 'rd-mes' }, h('button', { class: 'eq-bt', 'aria-label': 'Mês anterior', onclick: () => mudaMes(-1) }, ic('fa-chevron-left')), h('b', null, `${MESES[mes - 1]} ${ano}`),
        h('button', { class: 'eq-bt', 'aria-label': 'Próximo mês', onclick: () => mudaMes(1) }, ic('fa-chevron-right'))));
    const k = d.indicadores || {};
    const kpi = (n, t, cor) => h('div', { class: 'eq-kpi ' + cor }, h('b', null, n), h('span', null, t));
    const kpis = mob ? h('div', { class: 'eq-kpis' }, kpi(k.sem || 0, 'sem RDO', 'verm'), kpi(k.rasc || 0, 'rascunho', 'amar'), kpi(k.entr || 0, 'falta assinar', 'roxo'))
      : h('div', { class: 'eq-kpis' }, kpi(k.sem || 0, 'dia útil sem RDO', 'verm'), kpi(k.rasc || 0, 'rascunho para revisar e fechar', 'amar'), kpi(k.fech || 0, 'fechado, falta entregar', 'azul'),
          kpi(k.entr || 0, d.assinatura === false ? 'entregues ao cliente' : 'entregue, falta a folha assinada', 'roxo'), kpi(k.ass || 0, 'assinados no mês', 'verd'));
    return [cab, ctr, kpis, h('div', { class: 'rd-grade' }, mob ? listaDias() : calendario(ano, mes), pendencias())];
  }
  function cliqueDia(x) {
    if (x.rdo) return () => abrirRdo(x.rdo.id);
    if (x.estado === 'futuro') return null;
    if (x.util) return () => abrirDia(M.obra, x.data);
    return () => janela('Dia sem expediente', h('p', { class: 'rd-txt' }, `${dBRano(x.data)} não é dia útil nesta obra. Abrir um RDO para este dia mesmo assim (ex.: trabalho no fim de semana)?`), 'Abrir RDO', async () => abrirDia(M.obra, x.data));
  }
  function calendario(ano, mes) {
    const g = h('div', { class: 'rd-cal' }, ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(t => h('div', { class: 'rd-cal-s' }, t)));
    const pri = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay(); for (let i = 0; i < (pri + 6) % 7; i++) g.append(h('div'));
    M.d.dias.forEach(x => {
      const [t, c] = EST[x.estado]; const fn = cliqueDia(x); const n = +x.data.slice(8);
      const extra = x.rdo ? (x.rdo.situacao === 'Rascunho' ? (x.rdo.enviado ? 'enviado ao gestor' : 'em andamento') : x.rdo.situacao === 'Fechado' ? 'imprimir e entregar' : x.rdo.situacao === 'Entregue' ? 'falta a folha' : 'folha anexada') : x.estado === 'sem' ? 'faltou fazer' : x.estado === 'prazo' ? 'ainda dá tempo' : x.estado === 'hoje' ? 'abrir' : '';
      g.append(h(fn ? 'button' : 'div', { class: `rd-dia ${x.estado}` + (x.data === M.d.hoje ? ' hj' : ''), onclick: fn, 'aria-label': `${dBRano(x.data)} ${t}` },
        h('b', null, n), t ? h('span', { class: 'rd-dia-t ' + c }, x.rdo && x.rdo.numero ? `${t} · nº ${x.rdo.numero}` : t) : null, extra ? h('small', null, extra) : null));
    });
    return g;
  }
  function listaDias() {
    const L = M.d.dias.filter(x => x.estado !== 'futuro' && (x.util || x.rdo)).reverse();
    return h('div', { class: 'rd-lista' }, L.map(x => { const [t, c] = EST[x.estado]; const dt = new Date(T(x.data));
      return h('button', { class: 'rd-lin', onclick: cliqueDia(x) }, h('span', { class: 'rd-lin-d' }, h('b', null, dBR(x.data)), h('small', null, SEM[dt.getUTCDay()])),
        h('span', { class: 'rd-lin-t' }, x.rdo && x.rdo.numero ? `RDO nº ${x.rdo.numero}` : x.estado === 'hoje' ? 'Abrir o RDO de hoje' : 'Sem RDO'), selo(t || '—', c), ic('fa-chevron-right')); }));
  }
  function pendencias() {
    const P = M.d.pendencias, T2 = { sem: ['Sem RDO', 'vc'], rasc: ['Rascunho', 'ven'], fech: ['Fechado', 'az'], entr: ['Entregue', 'rx'] };
    const txt = p => p.tipo === 'sem' ? `${p.obra} · ${dBR(p.data)}` : p.tipo === 'rasc' ? `${p.obra} · ${dBR(p.data)}${p.enviado ? ' · enviado' : ''}` : p.tipo === 'fech' ? `${p.obra} · ${dBR(p.data)} · imprimir` : `${p.obra} · ${dBR(p.data)} · falta a folha`;
    return h('aside', { class: 'rd-lado' },
      h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, 'Pendências de todas as obras'), h('small', null, 'Últimos 30 dias'))),
        P.length ? h('div', { class: 'rd-pend' }, P.slice(0, celular() ? 6 : 14).map(p => h('button', { onclick: () => p.id ? abrirRdo(p.id) : abrirDia(p.projeto_id, p.data) }, selo(...T2[p.tipo]), h('span', null, txt(p)))),
          P.length > 14 ? h('small', null, `e mais ${P.length - 14}`) : null) : h('p', { class: 'eq-vazio' }, 'Nada pendente. 👍')),
      celular() ? null : h('section', { class: 'eq-painel rd-como' }, h('b', null, 'Como funciona'),
        h('ol', null, h('li', null, 'O sistema monta o rascunho do dia com os avanços, fotos, Travou e equipamentos.'), h('li', null, 'O encarregado completa clima, presentes e observações no celular.'),
          h('li', null, 'O gestor revisa e fecha: sai o documento com a logo para imprimir.'), h('li', null, 'O cliente assina e o encarregado fotografa a folha.'))));
  }

  /* ── RDO do dia ─────────────────────────────── */
  function dia() {
    const voltar = h('button', { class: 'eq-voltar', onclick: () => { M.id = null; M.r = null; carregar(); } }, ic('fa-arrow-left'), ' RDO', M.r ? ' · ' + (M.r.obra.codigo || M.r.obra.nome) : '');
    if (!M.r) return [voltar, h('p', { class: 'eq-vazio' }, 'Carregando…')];
    const R = M.r, r = R.rdo, P = R.pode, C = R.conteudo, mob = celular();
    const passos = ['Rascunho', 'Fechado', 'Entregue', 'Assinado'], at = passos.indexOf(r.situacao);
    const step = h('div', { class: 'rd-step' }, passos.map((p, i) => h('span', { class: i < at ? 'feito' : i === at ? 'atual' : '' }, h('i', null, i < at ? '✓' : i + 1), p)));
    const bts = h('div', { class: 'rd-acoes' },
      h('button', { class: 'eq-bt', onclick: () => abrirDocumento(false) }, ic('fa-file-lines'), r.situacao === 'Rascunho' ? ' Prévia' : ' Documento'),
      P.reabrir ? h('button', { class: 'eq-bt', onclick: reabrir }, 'Reabrir') : null,
      P.enviar && !P.fechar ? h('button', { class: 'eq-bt pri', onclick: enviar }, ic('fa-paper-plane'), ' Enviar para o gestor') : null,
      P.fechar ? h('button', { class: 'eq-bt pri', onclick: fechar }, ic('fa-lock'), ' Fechar e gerar PDF') : null,
      P.entregar ? h('button', { class: 'eq-bt pri', onclick: entregar }, 'Marcar como entregue') : null,
      P.anexar ? h('button', { class: 'eq-bt' + (P.entregar ? '' : ' pri'), onclick: anexar }, ic('fa-camera'), ' Anexar folha assinada') : null);
    const cab = h('div', { class: 'rd-cab' }, h('div', { class: 'rd-cab-t' }, h('h1', null, `RDO nº ${r.numero || '—'} · ${r.semana}, ${dBRano(r.data)}`),
        h('p', null, [R.obra.codigo, R.obra.nome, R.obra.cliente].filter(Boolean).join(' · ') + (r.aberto_por ? ` · aberto por ${r.aberto_por}` : ''))), step, bts);
    const aviso = r.situacao === 'Rascunho' && r.enviado_em ? h('div', { class: 'rd-aviso ok' }, ic('fa-circle-check'), ` Enviado por ${r.enviado_por} às ${r.enviado_em.slice(11, 16)} de ${dBR(r.enviado_em.slice(0, 10))}.` + (P.fechar ? ' Revise e feche.' : ' Aguardando o gestor fechar.'))
      : r.situacao === 'Rascunho' ? h('div', { class: 'rd-aviso' }, P.fechar ? 'Rascunho: o sistema já preencheu com o que o campo registrou. Confira, ajuste e feche.' : 'Rascunho: complete clima, presentes e observações e toque em "Enviar para o gestor".')
      : r.situacao === 'Fechado' ? h('div', { class: 'rd-aviso az' }, `Fechado por ${r.fechado_por} em ${dBR(r.fechado_em.slice(0, 10))} às ${r.fechado_em.slice(11, 16)} · código ${r.codigo}. Imprima, entregue ao cliente e depois anexe a folha assinada.`)
      : r.situacao === 'Entregue' ? h('div', { class: 'rd-aviso rx' }, `Entregue em ${dBRano(r.entregue_em)}. Falta anexar a foto da folha assinada.`)
      : h('div', { class: 'rd-aviso ok' }, ic('fa-circle-check'), ` Assinado por ${r.cliente_assinante} em ${dBRano(r.assinado_cliente_em)} · `, h('a', { href: `api/rdos/${r.id}/folha`, target: '_blank', rel: 'noopener' }, 'ver folha assinada'));
    const ed = P.editar;
    const col1 = [painelClima(r, ed), painelPresentes(C, r, ed)], col2 = [painelServicos(C), painelOcorrencias(C), painelEquip(C), painelObs(r, ed)];
    return [voltar, cab, aviso, mob ? h('div', { class: 'rd-col' }, col1, col2) : h('div', { class: 'rd-dois' }, h('div', { class: 'rd-col' }, col1), h('div', { class: 'rd-col' }, col2)),
      P.excluir ? h('button', { class: 'eq-bt rd-excluir', onclick: excluir }, ic('fa-trash'), ' Excluir este rascunho') : null];
  }
  const painel = (titulo, sub, ...corpo) => h('section', { class: 'eq-painel' }, h('div', { class: 'eq-painel-cab' }, h('div', null, h('b', null, titulo), sub ? h('small', null, sub) : null)), ...corpo);
  let salvoTimer;
  async function salvar(campos, sil) {
    M.salvando++; marca('Salvando…');
    try { const x = await api('rdos/' + M.id, 'PATCH', campos); Object.assign(M.r.conteudo, { presentes: x.presentes, total: x.total }); marca('Salvo ✓'); const t = document.getElementById('rd-total'); if (t) t.textContent = `Total: ${x.total} pessoa${x.total === 1 ? '' : 's'}`; }
    catch (e) { avisar(e.message, 'error'); marca(''); }
    M.salvando--;
  }
  function marca(t) { const m = document.getElementById('rd-salvo'); if (m) { m.textContent = t; clearTimeout(salvoTimer); if (t === 'Salvo ✓') salvoTimer = setTimeout(() => { m.textContent = ''; }, 2500); } }
  function painelClima(r, ed) {
    const linha = (rot, k) => h('div', { class: 'rd-clima' }, h('small', null, rot), h('div', { class: 'rd-chips', role: 'radiogroup', 'aria-label': 'Clima ' + rot },
      ['Bom', 'Nublado', 'Chuva', 'Impraticável'].map(o => h('button', { class: r[k] === o ? 'on' : '', role: 'radio', 'aria-checked': r[k] === o ? 'true' : 'false', disabled: !ed,
        onclick: () => { r[k] = r[k] === o ? null : o; salvar({ [k]: r[k] }); desenhar(); } }, o))));
    return painel('Clima', ed ? 'Toque para marcar.' : null, h('div', { class: 'rd-pad' }, linha('Manhã', 'clima_manha'), linha('Tarde', 'clima_tarde')), h('span', { id: 'rd-salvo', class: 'rd-salvo', 'aria-live': 'polite' }));
  }
  function painelPresentes(C, r, ed) {
    const L = C.presencas;
    const lin = p => h('label', { class: 'rd-pes' + (p.ausencia ? ' aus' : '') },
      h('input', { type: 'checkbox', checked: p.presente, disabled: !ed, onchange: e => { p.presente = e.target.checked; salvar({ presencas: [{ funcionario_id: p.id, presente: p.presente }] }); desenhar(); } }),
      h('b', null, p.nome), h('span', null, p.cargo || ''), p.ausencia ? selo(p.ausencia, 'az') : !p.presente ? selo('faltou', 'vc') : null);
    const fT = h('input', { type: 'number', min: '0', max: '500', value: r.terceiros ?? '', disabled: !ed, 'aria-label': 'Terceiros', placeholder: '0',
      onchange: e => { r.terceiros = e.target.value === '' ? null : +e.target.value; salvar({ terceiros: r.terceiros }); } });
    const fD = h('input', { type: 'text', maxlength: '200', value: r.terceiros_desc || '', disabled: !ed, 'aria-label': 'Empresa dos terceiros', placeholder: 'Empresa / serviço (opcional)',
      onchange: e => salvar({ terceiros_desc: e.target.value }) });
    const pres = L.filter(p => p.presente).length, tot = pres + (r.terceiros || 0);   // conta na hora, sem esperar o servidor
    return painel(`Presentes (${pres} de ${L.filter(p => !p.ausencia).length})`, ed ? 'Já marcados: quem tem atividade na obra hoje. Desmarque quem faltou.' : null,
      L.length ? L.map(lin) : h('p', { class: 'eq-vazio' }, 'Ninguém com atividade nesta obra no dia.'),
      h('div', { class: 'rd-terc' }, h('span', null, 'Terceiros'), fT, fD, h('b', { id: 'rd-total' }, `Total: ${tot} pessoa${tot === 1 ? '' : 's'}`)));
  }
  function painelServicos(C) {
    return painel(`Serviços executados (${C.servicos.length})`, 'Vêm dos avanços lançados no dia, com as fotos.',
      C.servicos.length ? C.servicos.map(s => h('div', { class: 'rd-serv' }, h('div', null, h('b', null, s.descricao), h('small', null, [s.por, ...s.comentarios].filter(Boolean).join(' · '))),
        h('span', { class: 'rd-av' }, `${s.de}% → ${s.para}%`),
        h('span', { class: 'rd-fotos' }, s.fotos.map(id => h('a', { href: `api/fotos/${id}`, target: '_blank', rel: 'noopener' }, h('img', { src: `api/fotos/${id}?mini=1`, alt: 'Foto do serviço', loading: 'lazy' }))))))
        : h('p', { class: 'eq-vazio' }, 'Nenhum avanço lançado no dia.'));
  }
  function painelOcorrencias(C) {
    return painel('Ocorrências', 'Travou e ocorrências do dia.', C.ocorrencias.length ? C.ocorrencias.map(o => h('div', { class: 'rd-oc' }, selo(o.tipo, 'ven'),
      h('span', null, (o.atividade ? o.atividade + ' — ' : '') + o.descricao + ` (${o.por || ''}, ${o.hora})`), o.liberada ? selo('Liberada ' + o.liberada, 'ok') : null)) : h('p', { class: 'eq-vazio' }, 'Nenhuma.'));
  }
  function painelEquip(C) {
    const I = { equipamento: 'fa-gears', veiculo: 'fa-truck', ferramenta: 'fa-screwdriver-wrench', outro: 'fa-box' };
    return painel('Equipamentos na obra', 'Recursos reservados nas atividades do dia.', C.equipamentos.length ? h('div', { class: 'rd-pad rd-eq' }, C.equipamentos.map(e => selo([ic(I[e.tipo] || 'fa-box'), ' ', (e.codigo ? e.codigo + ' ' : '') + e.nome + ' · ' + e.atividades.join(', ')], 'az')))
      : h('p', { class: 'eq-vazio' }, 'Nenhum reservado para o dia.'));
  }
  function painelObs(r, ed) {
    const t = h('textarea', { rows: celular() ? '4' : '3', maxlength: '5000', disabled: !ed, 'aria-label': 'Observações', placeholder: 'Visitas, pedidos do cliente, o que for importante…', onchange: e => { r.observacoes = e.target.value; salvar({ observacoes: e.target.value }); } }, r.observacoes || '');
    return painel('Observações', null, h('div', { class: 'rd-pad' }, t));
  }

  /* ── ações ──────────────────────────────────── */
  const espera = async () => { const t = document.activeElement; if (t && t.blur) t.blur(); for (let i = 0; i < 40 && M.salvando; i++) await new Promise(r => setTimeout(r, 100)); };
  function abrirDocumento(imprimir) {           // aba nova; se o navegador bloquear a janela, avisa em vez de sair do sistema
    const w = window.open(`api/rdos/${M.id}/documento${imprimir ? '?imprimir=1' : ''}`, '_blank');
    if (w) { try { w.opener = null; } catch (_) {} } else avisar('O navegador bloqueou a nova aba. Use o botão "Documento".', 'warning');
  }
  async function enviar() { await espera(); try { await api(`rdos/${M.id}/enviar`, 'POST', {}); avisar('Enviado para o gestor', 'success'); abrirRdo(M.id); } catch (e) { avisar(e.message, 'error'); } }
  async function fechar() {
    await espera();
    janela('Fechar o RDO', h('p', { class: 'rd-txt' }, 'Depois de fechado, o conteúdo fica congelado e sai o documento com a logo para imprimir e o cliente assinar. Dá para reabrir enquanto não for entregue.'), 'Fechar e abrir o documento', async () => {
      const r = await api(`rdos/${M.id}/fechar`, 'POST', {}); avisar(`RDO fechado · código ${r.codigo}`, 'success'); abrirDocumento(true); abrirRdo(M.id);
    });
  }
  async function reabrir() { try { await api(`rdos/${M.id}/reabrir`, 'POST', {}); avisar('RDO reaberto para correção', 'success'); abrirRdo(M.id); } catch (e) { avisar(e.message, 'error'); } }
  function entregar() {
    const f = h('input', { type: 'date', value: M.r.hoje, max: M.r.hoje, min: M.r.rdo.data, 'aria-label': 'Entregue em' });
    janela('Marcar como entregue', h('div', { class: 'eq-form' }, h('label', { class: 'eq-campo larga' }, h('span', null, 'Entregue ao cliente em'), f)), 'Salvar', async () => {
      await api(`rdos/${M.id}/entregue`, 'POST', { data: f.value }); avisar('Marcado como entregue', 'success'); abrirRdo(M.id); });
  }
  function anexar() {
    const fF = h('input', { type: 'file', accept: 'image/*,application/pdf', 'aria-label': 'Foto da folha assinada' }); if (celular()) fF.setAttribute('capture', 'environment');
    const prev = h('div', { class: 'rd-prev' }, ic('fa-camera'), h('span', null, 'Tirar foto da folha'));
    fF.onchange = () => { const a = fF.files[0]; if (!a) return; prev.innerHTML = ''; if (a.type.startsWith('image/')) prev.append(h('img', { src: URL.createObjectURL(a), alt: 'Folha assinada' })); else prev.append(h('span', null, a.name)); };
    const fQ = h('input', { type: 'text', maxlength: '160', placeholder: 'Ex.: Eng. Paulo Andrade', 'aria-label': 'Quem assinou' });
    const fD = h('input', { type: 'date', value: M.r.hoje, max: M.r.hoje, min: M.r.rdo.data, 'aria-label': 'Data da assinatura' });
    janela('Anexar a folha assinada', h('div', { class: 'eq-form' }, h('label', { class: 'eq-campo larga rd-foto' }, prev, fF), h('label', { class: 'eq-campo larga' }, h('span', null, 'Quem assinou pelo cliente'), fQ),
      h('label', { class: 'eq-campo larga' }, h('span', null, 'Data escrita na folha'), fD)), 'Salvar · RDO assinado', async () => {
      const a = fF.files[0]; if (!a) throw new Error('Tire a foto da folha assinada');
      let dados; if (a.type === 'application/pdf') dados = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(a); }); else dados = await lerImagem(a, 2200);
      await api(`rdos/${M.id}/assinado`, 'POST', { foto: { dados }, assinante: fQ.value.trim(), data: fD.value }); avisar('RDO assinado', 'success'); abrirRdo(M.id);
    });
  }
  function excluir() { janela('Excluir rascunho', h('p', { class: 'rd-txt' }, 'Excluir este rascunho? Os avanços e fotos do dia continuam nas atividades.'), 'Excluir', async () => { await api('rdos/' + M.id, 'DELETE'); M.id = null; M.r = null; carregar(); }); }
  async function janelaLogo() {
    let cab; try { cab = await api('empresa/cabecalho'); } catch (e) { avisar(e.message, 'error'); return; }
    const img = h('img', { alt: 'Logo atual', src: cab.tem_logo ? 'api/empresa/logo?v=' + Date.now() : '' }); if (!cab.tem_logo) img.hidden = true;
    const vazio = h('span', { class: 'rd-semlogo' }, cab.tem_logo ? '' : 'Sem logo: no documento sai o nome da empresa.');
    const linha = h('div', { class: 'rd-logo-linha', style: `border-color:${cab.cor}` });
    const prev = h('div', { class: 'rd-logo-prev' }, h('div', { class: 'rd-logo-cab' }, h('div', { class: 'rd-logo-img' }, img, vazio),
      h('div', { class: 'rd-logo-emp' }, h('b', null, cab.razao_social || cab.nome), h('span', null, [cab.cnpj ? 'CNPJ ' + cab.cnpj : null, cab.cidade ? cab.cidade + (cab.uf ? '/' + cab.uf : '') : null].filter(Boolean).join(' · ')), cab.telefone ? h('span', null, cab.telefone) : null),
      h('div', { class: 'rd-logo-tit', style: `color:${cab.cor}` }, h('b', null, 'RELATÓRIO DIÁRIO DE OBRA'), h('small', null, 'Nº 12 · 16/11/2026'))), linha);
    const f = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'aria-label': 'Nova logo' });
    f.onchange = async () => { const a = f.files[0]; if (!a) return; try { const dados = await lerImagem(a, 1200); const r = await api('empresa/logo', 'POST', { dados });
      img.src = 'api/empresa/logo?v=' + Date.now(); img.hidden = false; vazio.textContent = ''; if (window.tfLogoEmpresa) tfLogoEmpresa(true); if (r.cor) { linha.style.borderColor = r.cor; prev.querySelector('.rd-logo-tit').style.color = r.cor; } avisar('Logo atualizada', 'success'); } catch (e) { avisar(e.message, 'error'); } };
    const tirar = h('button', { class: 'eq-bt', onclick: async () => { try { await api('empresa/logo', 'DELETE'); img.hidden = true; vazio.textContent = 'Sem logo: no documento sai o nome da empresa.'; if (window.tfLogoEmpresa) tfLogoEmpresa(false); avisar('Logo removida', 'success'); } catch (e) { avisar(e.message, 'error'); } } }, 'Tirar logo');
    janela('Logo da empresa', h('div', { class: 'rd-logo' }, h('small', { class: 'eq-rot' }, 'ASSIM SAI NO CABEÇALHO DOS DOCUMENTOS'), prev,
      h('p', { class: 'rd-txt' }, 'PNG ou JPG, de preferência horizontal e com fundo transparente. O sistema ajusta o tamanho e usa a cor principal da logo na linha do cabeçalho.'),
      h('div', { class: 'rd-logo-bts' }, h('label', { class: 'eq-bt pri' }, ic('fa-upload'), ' Enviar logo', f), tirar)), null, null);
  }
  function janela(titulo, corpo, okTxt, aoOk) {
    const fundo = h('div', { class: 'eq-fundo', role: 'presentation' });
    const bt = okTxt ? h('button', { class: 'eq-bt pri' }, okTxt) : null;
    const j = h('div', { class: 'eq-jan', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      h('div', { class: 'eq-jan-cab' }, h('h2', null, titulo), h('button', { class: 'eq-x', 'aria-label': 'Fechar', onclick: () => fechar() }, ic('fa-xmark'))),
      h('div', { class: 'eq-jan-corpo' }, corpo), h('div', { class: 'eq-acoes' }, h('button', { class: 'eq-bt', onclick: () => fechar() }, 'Fechar'), bt));
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') fechar(); };
    if (bt && aoOk) bt.onclick = async () => { bt.disabled = true; try { await aoOk(); fechar(); } catch (e) { avisar(e.message, 'error'); } bt.disabled = false; };
    fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', esc); fundo.append(j); document.body.append(fundo);
    return fechar;
  }

  /* ── ligação com o menu ─────────────────────── */
  const trocar = window.switchView;
  window.switchView = function (nome, el) {
    trocar(nome, el);
    if (nome === 'rdo') { const t = document.getElementById('page-title'); if (t) t.textContent = 'RDO'; if (!M.vindo) { M.id = null; M.r = null; desenhar(); carregar(); } M.vindo = false; }
  };
  window.addEventListener('resize', (() => { let w = celular(); return () => { if (w !== celular()) { w = celular(); desenhar(); } }; })());
  const abrirMenu = () => window.switchView('rdo', document.getElementById('nav-rdo'));
  window.tfRdo = { abrir: abrirMenu, abrirRdo: id => { M.vindo = true; abrirMenu(); abrirRdo(id); }, hoje: pid => { M.vindo = true; abrirMenu(); M.obra = pid; abrirDia(pid); }, estado: M };
})();
