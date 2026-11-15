/* Task Flow · obra-abas.js — abas Quadro, Equipe da obra e Linha de base e histórico; calendário de trabalho do gestor */
(() => {
  'use strict';
  const COLS = [['Pendente', '#94a3b8'], ['Em andamento', '#2563eb'], ['Concluído', '#059669'], ['Reprogramado', '#d97706']];
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
  const dBRano = s => s ? dBR(s) + '/' + s.slice(0, 4) : '';
  const T = s => Date.parse(s + 'T00:00:00Z');
  const iniciais = n => { const p = String(n || '').trim().split(/\s+/); return ((p[0] || '')[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : ''); };
  const quando = s => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  /* ══ Quadro (Kanban) ═══════════════════════════════════════════ */
  const fq = { resp: '', etapa: '' };
  function quadro(O, c) {
    const { h, ic, api, podeTudo, aposMudar, avisar, modal, painel, eu } = c;
    const pode = podeTudo() || eu().perfil === 'encarregado';
    const A = O.d.atividades, porId = new Map(A.map(a => [a.id, a]));
    const etapaDe = a => { let p = a.pai_id, e = null; while (p && porId.has(p)) { e = porId.get(p); p = e.pai_id; } return e; };
    const folhas = A.filter(a => !a.etapa).filter(a => (!fq.resp || String(a.responsavel_id) === fq.resp) && (!fq.etapa || String((etapaDe(a) || {}).id) === fq.etapa));
    async function mover(a, sit) {
      if (a.situacao === sit) return;
      const campos = { situacao: sit };
      if (sit === 'Concluído') campos.avanco = 100;
      if (a.situacao === 'Concluído' && sit !== 'Concluído' && a.avanco >= 100) campos.avanco = 90;
      if (sit === 'Reprogramado') {
        const mot = h('textarea', { rows: 3, class: 'og-txt', placeholder: 'Ex.: material não chegou; cliente pediu para adiar…' });
        const ok = await modal('Por que foi reprogramada?', h('div', { class: 'og-corpo' }, h('p', null, a.descricao), mot), [['Cancelar', null], ['Reprogramar', true, 'ob-bt-pri']]);
        if (!ok) return c.desenhar();
        if (!mot.value.trim()) { avisar('Informe o motivo da reprogramação.', 'error'); return c.desenhar(); }
        campos.observacoes = (a.observacoes ? a.observacoes + '\n' : '') + `Reprogramada em ${new Date().toLocaleDateString('pt-BR')}: ${mot.value.trim()}`;
      }
      try { const r = await api('atividades/' + a.id, 'PATCH', campos); await aposMudar(r, `"${a.descricao}" foi para ${sit}.`); } catch (e) { avisar(e.message, 'error'); }
    }
    const resp = [...new Map(A.filter(a => a.responsavel_id).map(a => [String(a.responsavel_id), a.responsavel_nome])).entries()];
    const etapas = A.filter(a => a.etapa && !a.pai_id);
    const box = h('div', { class: 'oq' },
      h('div', { class: 'oq-barra' },
        h('select', { class: 'ob-sel', 'aria-label': 'Responsável', onchange: e => { fq.resp = e.target.value; c.desenhar(); } }, h('option', { value: '' }, 'Todos os responsáveis'), resp.map(([id, n]) => h('option', { value: id, selected: fq.resp === id }, n))),
        h('select', { class: 'ob-sel', 'aria-label': 'Etapa', onchange: e => { fq.etapa = e.target.value; c.desenhar(); } }, h('option', { value: '' }, 'Todas as etapas'), etapas.map(e => h('option', { value: e.id, selected: fq.etapa === String(e.id) }, `${e.eap} · ${e.descricao}`))),
        pode ? h('span', { class: 'og-dica' }, window.innerWidth > 760 ? 'Arraste o cartão para mudar a situação. Ir para "Reprogramado" pede o motivo.' : 'Toque em "Mover" para mudar a situação.') : null));
    const grade = h('div', { class: 'oq-grade' });
    COLS.forEach(([sit, cor]) => {
      const lista = folhas.filter(a => a.situacao === sit).sort((x, y) => (y.atrasada - x.atrasada) || String(x.fim).localeCompare(String(y.fim)));
      const col = h('section', { class: 'oq-col', 'data-sit': sit },
        h('div', { class: 'oq-col-cab' }, h('i', { class: 'oq-ponto', style: `background:${cor}` }), h('b', null, sit), h('span', { class: 'oq-qtd' }, lista.length)));
      if (pode) {
        col.ondragover = ev => { ev.preventDefault(); col.classList.add('sobre'); };
        col.ondragleave = () => col.classList.remove('sobre');
        col.ondrop = ev => { ev.preventDefault(); col.classList.remove('sobre'); const a = porId.get(+ev.dataTransfer.getData('text/plain')); if (a) mover(a, sit); };
      }
      lista.forEach(a => {
        const e = etapaDe(a), atr = a.atrasada;
        const mv = pode ? h('select', { class: 'oq-mover', 'aria-label': 'Mover para', onclick: ev => ev.stopPropagation(), onchange: ev => mover(a, ev.target.value) },
          COLS.map(([s]) => h('option', { value: s, selected: s === sit }, s === sit ? 'Mover…' : s))) : null;
        const card = h('article', { class: 'oq-card' + (atr ? ' atras' : ''), draggable: pode ? 'true' : null, tabindex: 0, onclick: () => painel(a), onkeydown: ev => { if (ev.key === 'Enter') painel(a); } },
          h('div', { class: 'oq-c-topo' }, h('span', null, `${a.eap}${e ? ' · ' + e.descricao : ''}`), h('span', { class: atr ? 'verm' : '' }, a.fim ? (atr ? 'venceu ' : 'até ') + dBR(a.fim) : '')),
          h('b', { class: 'oq-c-nome' }, a.descricao),
          a.marco ? null : h('div', { class: 'ob-bar-trilho' }, h('div', { class: 'ob-bar-ench ' + (atr ? 'verm' : a.avanco >= 100 ? 'verd' : 'azul'), style: `width:${a.avanco}%` })),
          h('div', { class: 'oq-c-pe' }, h('span', { class: 'oq-resp' }, h('i', { class: 'oq-av' }, iniciais(a.responsavel_nome).toUpperCase()), a.responsavel_nome || 'Sem responsável'),
            mv || h('b', null, a.marco ? 'marco' : a.avanco + '%')));
        if (pode) card.ondragstart = ev => { ev.dataTransfer.setData('text/plain', a.id); card.classList.add('arrastando'); };
        card.ondragend = () => card.classList.remove('arrastando');
        col.append(card);
      });
      if (!lista.length) col.append(h('div', { class: 'oq-vazia' }, 'Nenhuma atividade'));
      grade.append(col);
    });
    box.append(grade);
    return box;
  }

  /* ══ Equipe da obra ═════════════════════════════════════════════ */
  function equipeAba(O, c) {
    const { h, ic, api, podeTudo, avisar, modal } = c;
    const box = h('div', { class: 'oe' }, h('div', { class: 'ob-vazio' }, ic('fa-spinner fa-spin'), h('p', null, 'Carregando a equipe…')));
    const PAPEL = { gestor: 'Gestor', encarregado: 'Encarregado', funcionario: 'Funcionário' };
    async function carregar() {
      let d; try { d = await api(`obras/${O.id}/equipe`); } catch (e) { box.innerHTML = ''; box.append(h('div', { class: 'ob-vazio' }, h('p', null, e.message))); return; }
      box.innerHTML = '';
      // acesso
      const acesso = h('section', { class: 'oe-sec' }, h('div', { class: 'oe-sec-cab' }, h('h3', null, 'Quem tem acesso a esta obra'),
        podeTudo() ? h('button', { class: 'ob-bt og-bt-p', onclick: adicionar }, ic('fa-user-plus'), 'Adicionar pessoa') : null),
        h('p', { class: 'og-sub' }, 'Administradores e gestores veem todas as obras. Encarregados e funcionários só veem as obras em que estão aqui.'));
      const lista = h('div', { class: 'oe-lista' });
      if (d.gestor) lista.append(h('div', { class: 'oe-pessoa' }, h('i', { class: 'oq-av g' }, iniciais(d.gestor.nome).toUpperCase()), h('div', null, h('b', null, d.gestor.nome), h('small', null, 'Gestor da obra')), h('span', { class: 'ob-tipo' }, 'Gestor')));
      d.membros.forEach(m => lista.append(h('div', { class: 'oe-pessoa' }, h('i', { class: 'oq-av' }, iniciais(m.nome).toUpperCase()),
        h('div', null, h('b', null, m.nome), h('small', null, m.email)), h('span', { class: 'ob-tipo' }, PAPEL[m.papel] || m.papel),
        podeTudo() ? h('button', { class: 'og-x', 'aria-label': 'Tirar acesso de ' + m.nome, title: 'Tirar acesso', onclick: async () => {
          const ok = await modal('Tirar acesso', h('div', { class: 'og-corpo' }, h('p', null, `${m.nome} deixa de ver esta obra. Pode ser adicionado de novo depois.`)), [['Cancelar', null], ['Tirar acesso', true, 'og-bt-perigo']]);
          if (!ok) return; try { await api('membros/' + m.id, 'DELETE'); avisar('Acesso retirado.', 'success'); carregar(); } catch (e) { avisar(e.message, 'error'); } } }, ic('fa-xmark')) : null)));
      if (!d.membros.length && !d.gestor) lista.append(h('p', { class: 'og-sub' }, 'Ninguém além dos administradores e gestores.'));
      acesso.append(lista);
      // quem trabalha
      const cap = d.capacidade_14 || 10;
      const trab = h('section', { class: 'oe-sec' }, h('div', { class: 'oe-sec-cab' }, h('h3', null, 'Quem trabalha nas atividades')),
        h('p', { class: 'og-sub' }, `Carga = dias de trabalho que ainda faltam nas próximas 2 semanas (${String(cap).replace('.', ',')} dias úteis disponíveis).`));
      const tab = h('div', { class: 'oe-tab' }, h('div', { class: 'oe-lin oe-th' }, h('span', null, 'Pessoa'), h('span', null, 'Atividades'), h('span', null, 'Atrasadas'), h('span', null, 'Carga 2 semanas'), h('span', null, 'NR')));
      d.pessoas.forEach(p => {
        const pct = Math.round(p.dias_proximas / cap * 100), cls = pct > 100 ? 'verm' : pct > 80 ? 'amar' : 'azul';
        const nr = !p.nr.total ? h('span', { class: 'og-sub' }, 'sem documentos') : p.nr.vencidos ? h('b', { class: 'verm' }, `${p.nr.vencidos} vencido${p.nr.vencidos > 1 ? 's' : ''}`)
          : p.nr.vencendo ? h('b', { class: 'amar' }, `${p.nr.vencendo} vencendo`) : h('b', { class: 'verd' }, 'em dia');
        tab.append(h('div', { class: 'oe-lin' },
          h('span', { class: 'oe-nome' }, h('i', { class: 'oq-av' }, iniciais(p.nome).toUpperCase()), h('span', null, h('b', null, p.nome), h('small', null, p.cargo || ''))),
          h('span', null, `${p.abertas} em aberto de ${p.atividades}`),
          h('span', null, p.atrasadas ? h('b', { class: 'verm' }, p.atrasadas) : '0'),
          h('span', { class: 'oe-carga' }, h('div', { class: 'ob-bar-trilho' }, h('div', { class: 'ob-bar-ench ' + cls, style: `width:${Math.min(100, pct)}%` })), h('small', { class: pct > 100 ? 'verm' : '' }, `${String(p.dias_proximas).replace('.', ',')} d · ${pct}%`)),
          h('span', { title: p.nr.pendentes.map(x => `${x.documento} (${x.situacao === 'vencido' ? 'vencido' : 'vence ' + dBRano(x.vence_em)})`).join('\n') }, nr)));
      });
      if (!d.pessoas.length) tab.append(h('p', { class: 'og-sub', style: 'padding:14px' }, 'Nenhuma atividade tem responsável ainda.'));
      trab.append(tab);
      box.append(acesso, trab);
    }
    async function adicionar() {
      let us = []; try { us = (await api('usuarios')).usuarios; } catch (e) { avisar(e.message, 'error'); return; }
      const sU = h('select', null, h('option', { value: '' }, 'Escolha…'), us.filter(x => !['administrador'].includes(x.perfil)).map(x => h('option', { value: x.id }, `${x.nome} · ${x.perfil}`)));
      const sP = h('select', null, ['encarregado', 'funcionario', 'gestor'].map(p => h('option', { value: p }, PAPEL[p])));
      const ok = await modal('Adicionar pessoa à obra', h('div', { class: 'og-corpo' }, h('label', { class: 'ob-campo' }, h('span', null, 'Pessoa'), sU), h('label', { class: 'ob-campo' }, h('span', null, 'Papel nesta obra'), sP)),
        [['Cancelar', null], ['Adicionar', true, 'ob-bt-pri']]);
      if (!ok || !sU.value) return;
      try { await api(`projetos/${O.id}/membros`, 'POST', { usuario_id: +sU.value, papel: sP.value }); avisar('Pessoa adicionada à obra.', 'success'); carregar(); } catch (e) { avisar(e.message, 'error'); }
    }
    carregar();
    return box;
  }

  /* ══ Linha de base e histórico ══════════════════════════════════ */
  const fb = { comparar: '', hist: '' };
  function baseAba(O, c) {
    const { h, ic, api, podeTudo, avisar } = c;
    const box = h('div', { class: 'ol' }, h('div', { class: 'ob-vazio' }, ic('fa-spinner fa-spin'), h('p', null, 'Carregando…')));
    const NOMES = { descricao: 'nome', inicio: 'início', fim: 'fim', duracao_dias: 'duração', avanco: 'avanço', situacao: 'situação', responsavel_id: 'responsável', pai_id: 'etapa',
      observacoes: 'observações', peso: 'peso', nome: 'nome', cliente: 'cliente', gestor_id: 'gestor', calendario_id: 'calendário', valor_contrato: 'valor', codigo: 'código' };
    async function carregar() {
      let lb, hist;
      try { [lb, hist] = await Promise.all([api(`obras/${O.id}/linhas-base`), api(`obras/${O.id}/historico`)]); } catch (e) { box.innerHTML = ''; box.append(h('p', null, e.message)); return; }
      lb = lb.linhas_base; hist = hist.historico;
      box.innerHTML = '';
      const sec = h('section', { class: 'oe-sec' }, h('div', { class: 'oe-sec-cab' }, h('h3', null, 'Linhas de base'),
        podeTudo() ? h('button', { class: 'ob-bt og-bt-p', onclick: () => tfObra.salvarLinhaBase().then(() => carregar()) }, ic('fa-floppy-disk'), lb.length ? 'Reprogramar' : 'Salvar a original') : null));
      if (!lb.length) sec.append(h('p', { class: 'og-sub' }, 'Ainda não há linha de base. Salve a original quando o cronograma estiver aprovado; a partir daí o previsto passa a ser medido contra ela.'));
      else {
        const t = h('div', { class: 'ol-tab' }, h('div', { class: 'ol-lin ol-th' }, h('span', null, 'Nº'), h('span', null, 'Nome'), h('span', null, 'Data'), h('span', null, 'Fim previsto'), h('span', null, 'Motivo'), h('span', null, 'Aprovada por'), h('span')));
        lb.slice().reverse().forEach((x, i) => t.append(h('div', { class: 'ol-lin' + (i === 0 ? ' atual' : '') }, h('b', null, x.numero), h('span', null, x.nome, i === 0 ? h('small', { class: 'ob-tipo' }, 'atual') : null),
          h('span', null, quando(x.criado_em).slice(0, 10)), h('span', null, dBRano(x.fim)), h('span', { class: 'ol-mot' }, x.motivo || '—'), h('span', null, x.aprovada_por_nome || '—'),
          h('button', { class: 'og-link', onclick: () => { fb.comparar = String(x.id); comparar(x); } }, 'Comparar'))));
        sec.append(t);
      }
      const cmp = h('div', { class: 'ol-cmp' });
      sec.append(cmp);
      async function comparar(x) {
        cmp.innerHTML = '';
        let r; try { r = await api('linhas-base/' + x.id); } catch (e) { avisar(e.message, 'error'); return; }
        const itens = new Map(r.itens.map(i => [i.atividade_id, i]));
        const linhas = O.d.atividades.filter(a => !a.etapa && itens.has(a.id)).map(a => { const b = itens.get(a.id); return { a, b, dif: a.fim && b.fim ? Math.round((T(a.fim) - T(b.fim)) / 864e5) : 0 }; });
        const novas = O.d.atividades.filter(a => !a.etapa && !itens.has(a.id));
        cmp.append(h('div', { class: 'oe-sec-cab' }, h('h4', null, `Plano atual × linha de base nº ${x.numero} (${x.nome})`), h('button', { class: 'og-x', 'aria-label': 'Fechar comparação', onclick: () => { cmp.innerHTML = ''; fb.comparar = ''; } }, ic('fa-xmark'))));
        const t = h('div', { class: 'ol-tab' }, h('div', { class: 'ol-lin ol-cmp-lin ol-th' }, h('span', null, 'EAP'), h('span', null, 'Atividade'), h('span', null, 'Fim na linha de base'), h('span', null, 'Fim atual'), h('span', null, 'Diferença')));
        linhas.sort((p, q) => q.dif - p.dif).forEach(({ a, b, dif }) => t.append(h('div', { class: 'ol-lin ol-cmp-lin' }, h('span', null, a.eap), h('span', null, a.descricao), h('span', null, dBRano(b.fim)), h('span', null, dBRano(a.fim)),
          h('b', { class: dif > 0 ? 'verm' : dif < 0 ? 'verd' : '' }, dif > 0 ? `+${dif} dia${dif > 1 ? 's' : ''}` : dif < 0 ? `${dif} dia${dif < -1 ? 's' : ''}` : 'igual'))));
        novas.forEach(a => t.append(h('div', { class: 'ol-lin ol-cmp-lin' }, h('span', null, a.eap), h('span', null, a.descricao), h('span', null, '—'), h('span', null, dBRano(a.fim)), h('span', { class: 'og-sub' }, 'nova'))));
        cmp.append(t);
      }
      if (fb.comparar) { const x = lb.find(y => String(y.id) === fb.comparar); if (x) comparar(x); }
      // histórico
      const hs = h('section', { class: 'oe-sec' }, h('div', { class: 'oe-sec-cab' }, h('h3', null, 'Histórico da obra'),
        h('select', { class: 'ob-sel', 'aria-label': 'Filtrar histórico', onchange: e => { fb.hist = e.target.value; desenharHist(); } },
          [['', 'Tudo'], ['atividades', 'Atividades'], ['projetos', 'Dados da obra'], ['linhas_base', 'Linhas de base']].map(([v, t]) => h('option', { value: v, selected: fb.hist === v }, t)))));
      const ul = h('ul', { class: 'ol-hist' });
      function frase(x) {
        const campos = Object.keys(x.depois || {}).filter(k => NOMES[k]).map(k => NOMES[k]);
        if (x.tabela === 'linhas_base') return x.depois && x.depois.numero > 0 ? `reprogramou a linha de base (nº ${x.depois.numero}): ${x.depois.motivo || ''}` : 'salvou a linha de base original';
        if (x.tabela === 'projetos') return x.acao === 'criou' ? 'criou a obra' : x.depois && x.depois.encadeou ? 'encadeou atividades' : `mudou ${campos.join(', ') || 'a obra'}${x.depois && x.depois.situacao ? ' para ' + x.depois.situacao : ''}`;
        const at = x.atividade ? `"${x.atividade}"` : 'uma atividade';
        if (x.acao === 'criou') return `criou ${at}`;
        if (x.acao === 'excluiu') return `excluiu ${at}`;
        return `mudou ${campos.join(', ')} de ${at}` + (x.depois && 'avanco' in x.depois ? ` para ${x.depois.avanco}%` : '');
      }
      function desenharHist() {
        ul.innerHTML = '';
        const l = hist.filter(x => !fb.hist || x.tabela === fb.hist);
        l.slice(0, 120).forEach(x => ul.append(h('li', null, h('span', { class: 'ol-q' }, quando(x.quando)), h('span', null, h('b', null, x.usuario || 'Sistema'), ' ', frase(x)))));
        if (!l.length) ul.append(h('li', { class: 'og-sub' }, 'Nada registrado ainda.'));
      }
      desenharHist();
      hs.append(ul);
      box.append(sec, hs);
    }
    carregar();
    return box;
  }

  /* ══ Calendário de trabalho (escolher e editar) ═════════════════ */
  async function calendario(O, ctx) {
    const h = (tag, attrs, ...f) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k.startsWith('on')) el[k] = v; else el.setAttribute(k, v === true ? '' : v); } f.flat(9).forEach(x => x != null && x !== false && el.append(x.nodeType ? x : document.createTextNode(String(x)))); return el; };
    const ic = n => h('i', { class: 'fa-solid ' + n, 'aria-hidden': 'true' });
    const api = async (rota, metodo, dados) => { const r = await fetch('api/' + rota, { method: metodo || 'GET', headers: dados ? { 'Content-Type': 'application/json' } : {}, body: dados ? JSON.stringify(dados) : undefined, cache: 'no-store' });
      let j = {}; try { j = await r.json(); } catch (_) {} if (!r.ok) throw new Error(j.erro || 'Não foi possível concluir.'); return j; };
    const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));
    let d; try { d = await api('calendarios'); } catch (e) { avisar(e.message, 'error'); return; }
    let atual = O.d.calendario.id;
    const fundo = h('div', { class: 'ob-fundo og-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'oc-t' });
    const fechar = () => fundo.remove();
    fundo.addEventListener('mousedown', ev => { if (ev.target === fundo) fechar(); });
    const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const resumo = c => { const hs = c.horas_semana; const dias = DIAS.map((n, i) => hs[i] ? `${n.slice(0, 3)} ${hs[i]}h` : null).filter(Boolean); return dias.join(' · ') + (c.feriados_nacionais ? ' · feriados nacionais' : ''); };
    function escolher() {
      fundo.innerHTML = '';
      const opc = [{ id: null, nome: 'Padrão', horas_semana: [8, 8, 8, 8, 8, 0, 0], feriados_nacionais: 1, obras: [] }, ...d.calendarios];
      let sel = atual;
      const lista = h('div', { class: 'oc-lista', role: 'radiogroup', 'aria-label': 'Calendários' }, opc.map(c => {
        const b = h('div', { class: 'oc-op' + (c.id === sel ? ' on' : ''), role: 'radio', tabindex: 0, 'aria-checked': c.id === sel ? 'true' : 'false', onkeydown: ev => { if (ev.key === ' ' || ev.key === 'Enter') { ev.preventDefault(); b.click(); } }, onclick: () => { sel = c.id; lista.querySelectorAll('.oc-op').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); } },
          h('div', null, h('b', null, c.nome), h('small', null, resumo(c)), h('small', null, c.id ? `De ${c.dono_nome || '—'} · usado em ${c.obras.length} obra${c.obras.length === 1 ? '' : 's'}` : 'Seg a sex, 8 h, feriados nacionais')),
          c.pode_editar ? h('button', { class: 'og-link', onclick: ev => { ev.stopPropagation(); editar(c); } }, 'Editar') : null);
        return b;
      }));
      fundo.append(h('div', { class: 'og-janela oc-jan' }, h('h3', { id: 'oc-t' }, 'Calendário de trabalho desta obra'),
        h('p', { class: 'og-sub' }, 'As durações em dias úteis seguem o calendário escolhido. Trocar de calendário recalcula as datas mantendo o início e a duração de cada atividade.'),
        lista, h('button', { class: 'ob-bt og-bt-p', onclick: () => editar(null) }, ic('fa-plus'), 'Novo calendário'),
        h('div', { class: 'og-bts' }, h('button', { class: 'ob-bt', onclick: fechar }, 'Cancelar'), h('button', { class: 'ob-bt ob-bt-pri', onclick: async () => {
          if (sel === atual) return fechar();
          try { const r = await api('projetos/' + O.id, 'PATCH', { calendario_id: sel }); fechar(); avisar('Calendário trocado e datas recalculadas.', 'success'); ctx.carregar(); } catch (e) { avisar(e.message, 'error'); } } }, 'Usar este calendário'))));
    }
    function editar(c) {
      fundo.innerHTML = '';
      const v = c || { nome: '', horas_semana: [8, 8, 8, 8, 8, 0, 0], feriados_nacionais: 1, dias: [] };
      const fNome = h('input', { value: v.nome, maxlength: 120, placeholder: 'Ex.: Padrão Recife/PE' });
      const horas = v.horas_semana.slice();
      const dias = DIAS.map((n, i) => {
        const on = horas[i] > 0, inp = h('input', { type: 'number', min: 0, max: 24, step: 0.5, value: horas[i] || 8, disabled: !on, 'aria-label': 'Horas de ' + n });
        const sw = h('button', { type: 'button', role: 'switch', class: 'oc-sw' + (on ? ' on' : ''), 'aria-checked': on ? 'true' : 'false', 'aria-label': 'Trabalha ' + n });
        sw.onclick = () => { const liga = !sw.classList.contains('on'); sw.classList.toggle('on', liga); sw.setAttribute('aria-checked', liga); inp.disabled = !liga; if (liga && !+inp.value) inp.value = 8; };
        return { sw, inp, el: h('div', { class: 'oc-dia' }, sw, h('span', null, n), h('label', null, inp, ' h')) };
      });
      const fNac = h('input', { type: 'checkbox', checked: !!+v.feriados_nacionais });
      const linhas = h('div', { class: 'oc-dias' });
      const addLinha = (x) => {
        const e = x || { inicio: '', fim: '', tipo: 'feriado', nome: '', todo_ano: 0 };
        const tipo = h('select', { 'aria-label': 'Tipo' }, [['feriado', 'Feriado'], ['parado', 'Dia parado']].map(([k, t]) => h('option', { value: k, selected: e.tipo === k }, t)));
        const ini = h('input', { type: 'date', value: e.inicio, 'aria-label': 'Data' }), fim = h('input', { type: 'date', value: e.fim !== e.inicio ? e.fim : '', 'aria-label': 'Até (opcional)' });
        const nome = h('input', { value: e.nome, placeholder: 'Ex.: Data Magna de PE; chuva; recesso', 'aria-label': 'Nome' });
        const ano = h('label', { class: 'oc-ano', title: 'Repete todo ano' }, h('input', { type: 'checkbox', checked: !!+e.todo_ano }), 'todo ano');
        const l = h('div', { class: 'oc-linha' }, tipo, ini, fim, nome, ano, h('button', { type: 'button', class: 'og-x', 'aria-label': 'Remover', onclick: () => l.remove() }, ic('fa-xmark')));
        l._ler = () => ({ tipo: tipo.value, inicio: ini.value, fim: fim.value || ini.value, nome: nome.value.trim(), todo_ano: ano.querySelector('input').checked });
        linhas.append(l);
      };
      (v.dias || []).forEach(addLinha);
      const nac = Object.entries(d.feriados_nacionais || {}).filter(([dt]) => dt >= new Date().toISOString().slice(0, 10)).slice(0, 6).map(([dt, n]) => `${dt.slice(8, 10)}/${dt.slice(5, 7)} ${n}`).join(' · ');
      fundo.append(h('div', { class: 'og-janela oc-jan larga' }, h('h3', { id: 'oc-t' }, c ? 'Editar calendário' : 'Novo calendário'),
        c && c.obras.length ? h('p', { class: 'og-sub' }, `Usado em ${c.obras.map(o => o.codigo || o.nome).join(', ')}. Salvar recalcula as datas dessas obras.`) : null,
        h('label', { class: 'ob-campo' }, h('span', null, 'Nome do calendário'), fNome),
        h('div', { class: 'oc-cols' },
          h('fieldset', { class: 'oc-fs' }, h('legend', null, 'Dias trabalhados e horas por dia'), dias.map(x => x.el)),
          h('div', { class: 'oc-fs' }, h('label', { class: 'oc-nac' }, fNac, ' Incluir os feriados nacionais automaticamente'), h('small', { class: 'og-sub' }, 'Próximos: ' + nac),
            h('b', { class: 'oc-tit' }, 'Feriados estaduais e municipais, e dias parados'), linhas,
            h('button', { type: 'button', class: 'ob-bt og-bt-p', onclick: () => addLinha() }, ic('fa-plus'), 'Adicionar'))),
        h('div', { class: 'og-bts' }, c && !c.obras.length ? h('button', { class: 'ob-bt og-bt-perigo', style: 'margin-right:auto', onclick: async () => { try { await api('calendarios/' + c.id, 'DELETE'); d = await api('calendarios'); avisar('Calendário apagado.', 'success'); escolher(); } catch (e) { avisar(e.message, 'error'); } } }, 'Apagar') : null,
          h('button', { class: 'ob-bt', onclick: escolher }, 'Voltar'),
          h('button', { class: 'ob-bt ob-bt-pri', onclick: async () => {
            const dados = { nome: fNome.value.trim(), horas_semana: dias.map(x => x.sw.classList.contains('on') ? +x.inp.value || 0 : 0), feriados_nacionais: fNac.checked,
              dias: [...linhas.children].map(l => l._ler()).filter(x => x.inicio || x.nome) };
            if (!dados.nome) { avisar('Dê um nome ao calendário.', 'error'); fNome.focus(); return; }
            try {
              if (c) { await api('calendarios/' + c.id, 'PATCH', dados); }
              else { const r = await api('calendarios', 'POST', dados); if (!atual) { await api('projetos/' + O.id, 'PATCH', { calendario_id: r.id }); atual = r.id; } }
              avisar(c ? 'Calendário salvo; datas recalculadas.' : 'Calendário criado.', 'success'); d = await api('calendarios'); ctx.carregar(); escolher();
            } catch (e) { avisar(e.message, 'error'); } } }, 'Salvar calendário'))));
      fNome.focus();
    }
    escolher();
    document.body.append(fundo);
  }

  window.tfObraAbas = { quadro, equipe: equipeAba, base: baseAba };
  window.tfObraCalendario = calendario;
})();
