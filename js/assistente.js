/* Task Flow · assistente.js — Assistente Task Flow (balão flutuante e Ctrl+K), sem IA externa:
   Buscar (dados do sistema + dúvidas de uso) e Montar obra por perguntas (com prévia do Gantt). */
(() => {
  'use strict';
  /* ── utilidades ─────────────────────────────── */
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
  const palavras = s => sem(s).replace(/[^a-z0-9\-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const eu = () => (window.tfServidor && tfServidor.estado && tfServidor.estado.usuario) || {};
  const podeTudo = () => ['administrador', 'gestor'].includes(eu().perfil);
  const celular = () => window.innerWidth <= 760;
  const T = s => Date.parse(s + 'T00:00:00Z');
  const mais = (s, n) => new Date(T(s) + n * 864e5).toISOString().slice(0, 10);
  const dBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : '';
  const dBRano = s => s ? dBR(s) + '/' + s.slice(0, 4) : '';
  const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const num = n => Number(n).toLocaleString('pt-BR');
  const diasTxt = n => { n = Math.round(Number(n) * 10) / 10; return (String(n).replace('.', ',')) + (n === 1 ? ' dia útil' : ' dias úteis'); };
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    const r = await fetch('api/' + rota, op); let j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Não foi possível concluir. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }
  const avisar = (m, t) => (typeof toast === 'function' ? toast(m, t) : alert(m));

  /* ── dúvidas de uso (base de perguntas e respostas do sistema) ── */
  const AJUDA = [
    ['Como crio uma obra nova?', 'No topo da tela, clique em "Nova obra" e preencha código, nome, cliente e datas. Se preferir, use a aba "Montar obra" deste assistente: ele faz as perguntas e já cria a obra com o cronograma.', 'nova obra criar cadastrar obra projeto', { tipo: 'view', view: 'obras', rotulo: 'Ir para Obras' }],
    ['Como monto o cronograma sem digitar tudo?', 'Abra a obra e use o menu ⋯ › "Montar / importar cronograma". Dá para usar um modelo pronto, montar por perguntas, copiar de outra obra, importar MS Project ou Excel, ou colar linhas do Excel.', 'montar cronograma modelo pronto rapido eap', { tipo: 'montar', rotulo: 'Montar por perguntas' }],
    ['Como funciona a montagem por perguntas?', 'Você responde o tipo de serviço, o que está incluído, as quantidades, as datas e o tamanho da equipe. O assistente calcula as durações pelas quantidades, liga as atividades e mostra o Gantt antes de criar. Se o prazo não couber, ele avisa e sugere ajustes.', 'perguntas assistente montar obra gantt automatico', { tipo: 'montar', rotulo: 'Começar agora' }],
    ['Como incluo uma atividade?', 'No cronograma, digite na última linha ("Digite a atividade e tecle Enter"). Enter cria a próxima linha; Tab transforma a linha em subatividade da de cima.', 'nova atividade incluir adicionar linha tarefa digitar enter'],
    ['Como transformo uma atividade em subatividade (etapa)?', 'Selecione a linha e clique em "Recuar" (ou tecle Tab ao digitar). A linha de cima vira etapa e passa a mostrar as datas e o avanço das filhas. "Avançar" desfaz.', 'subatividade etapa recuar avancar tab nivel filha mae hierarquia'],
    ['Como ligo uma atividade à outra?', 'Na coluna "Pred." escreva o número da linha que vem antes, por exemplo "3". Para começar junto use "3CC", com folga "3CC+2". Também dá para selecionar várias linhas e clicar em "Encadear": cada uma começa quando a anterior termina.', 'ligacao predecessora dependencia ligar encadear depois antes sequencia'],
    ['O que significam TC, CC, TT e CT?', 'TC: termina uma, começa a outra (o mais comum). CC: as duas começam juntas. TT: as duas terminam juntas. CT: a outra termina quando esta começa. O número depois do + é a folga em dias úteis.', 'tc cc tt ct tipo ligacao termino inicio folga significado'],
    ['Por que as datas de outras atividades mudaram sozinhas?', 'Quando uma atividade atrasa ou fica maior, as que dependem dela são empurradas para a frente. Antes de confirmar, o sistema mostra quais vão mudar. Atividades concluídas não se movem.', 'empurrou mudou data sozinha moveu empurrar dependencia aviso'],
    ['Por que uma atividade fica atrasada?', 'Quando a data de fim já passou e o avanço ainda não chegou a 100%. Ela aparece em vermelho no cronograma e conta no farol da obra.', 'atrasada atraso vermelho vencida fim passou'],
    ['O que é o caminho crítico?', 'São as atividades sem folga: se qualquer uma atrasar, a obra inteira atrasa. Elas aparecem em vermelho no Gantt, e o filtro "Caminho crítico" mostra só elas.', 'caminho critico critica folga vermelho gantt'],
    ['Como salvo a linha de base?', 'Na obra aberta, clique em "Salvar linha de base". Ela guarda as datas planejadas para comparar com o que está acontecendo. Só administrador e gestor podem salvar.', 'linha de base salvar baseline planejado original'],
    ['Como reprogramo a linha de base?', 'Clique em "Reprogramar linha de base" na obra aberta e escreva o motivo, que é obrigatório. As versões anteriores continuam guardadas na aba "Linha de base" para comparar.', 'reprogramar reprogramacao linha de base motivo nova versao'],
    ['Como funciona o farol da obra?', 'Compara o avanço real com o previsto para hoje. Verde: até 5 pontos de diferença. Amarelo: de 5 a 15. Vermelho: mais de 15 ou prazo vencido. Só as obras em andamento têm farol.', 'farol verde amarelo vermelho cor obra real previsto status'],
    ['Como é calculado o avanço real e o previsto?', 'O real é a média do avanço das atividades, pesada pelo peso de cada uma. O previsto é quanto já deveria estar pronto hoje pelas datas da linha de base mais recente (ou do cronograma, se ainda não houver linha de base).', 'avanco real previsto porcentagem calculo peso media'],
    ['Como crio um calendário de trabalho (sábado, feriado local)?', 'Na obra aberta, clique no nome do calendário (no cabeçalho) e em "Novo calendário". Defina as horas de cada dia (sábado de 4 h conta meio dia) e os feriados locais, que podem repetir todo ano. Os feriados nacionais já vêm marcados.', 'calendario sabado feriado local municipal horas jornada dias uteis criar'],
    ['Como importo um cronograma do MS Project ou do Excel?', 'Na obra, menu ⋯ › "Montar / importar cronograma" › "Importar arquivo". Aceita MS Project (.xml), Excel (.xlsx) e CSV, com prévia antes de criar. No MS Project, salve como "XML".', 'importar ms project excel xlsx csv xml arquivo planilha'],
    ['Como colo linhas do Excel?', 'Copie as linhas na planilha e cole na linha nova do cronograma (ou use menu ⋯ › "Montar / importar" › "Colar do Excel"). Ele reconhece atividade, duração, responsável e predecessoras.', 'colar excel copiar planilha ctrl v linhas'],
    ['Como exporto o cronograma (PDF, Excel, MS Project)?', 'Na obra aberta, clique em "Exportar" e escolha PDF para imprimir, Excel (.xlsx) ou MS Project (.xml).', 'exportar pdf imprimir excel ms project baixar download'],
    ['Como salvo uma obra como modelo?', 'Na obra aberta, menu ⋯ › "Salvar como modelo". O modelo aparece para toda a empresa na hora de montar o próximo cronograma.', 'modelo salvar template reaproveitar padrao'],
    ['Como copio o cronograma de outra obra?', 'Menu ⋯ › "Montar / importar cronograma" › "Copiar de outra obra". Dá para copiar tudo ou só algumas etapas; as datas são ajustadas para o novo início.', 'copiar duplicar outra obra reaproveitar etapas'],
    ['Como uso o Quadro (Kanban)?', 'Na obra aberta, aba "Quadro": as atividades ficam em colunas por situação. Arraste o cartão para mudar de Pendente para Em andamento ou Concluída. No celular, use o seletor do cartão.', 'quadro kanban cartao arrastar coluna situacao'],
    ['Onde vejo quem trabalha na obra e os documentos de NR?', 'Na obra aberta, aba "Equipe": mostra as pessoas, a carga dos próximos 14 dias e a situação dos documentos de NR de cada uma.', 'equipe pessoas nr documentos carga quem trabalha'],
    ['Como vejo o histórico de uma atividade?', 'Clique na atividade para abrir o painel lateral. Lá estão as predecessoras, o responsável e o histórico de todas as mudanças, com quem fez e quando.', 'historico alteracoes quem mudou painel atividade log'],
    ['Como atualizo o avanço pelo celular?', 'Abra a obra no celular: cada atividade aparece como um cartão com os botões − e + (10% por toque) e ✓ para concluir.', 'celular avanco atualizar porcentagem campo mobile'],
    ['O que o encarregado pode fazer?', 'O encarregado vê as obras em que está e atualiza avanço e situação das atividades. Criar obra, mexer em datas, ligações e linha de base fica com administrador e gestor.', 'encarregado perfil permissao pode acesso funcionario gestor administrador'],
    ['Como pauso, concluo ou arquivo uma obra?', 'Na tela Obras, use o menu ⋯ do cartão da obra: Pausar, Retomar, Concluir ou Arquivar.', 'pausar concluir arquivar retomar obra situacao encerrar'],
    ['Como uso a busca do assistente?', 'Escreva do seu jeito, por exemplo: "atividades atrasadas da ELE-014", "o que o João tem essa semana", "obras no vermelho", "quem está com NR-10 vencida". Atalho no computador: Ctrl+K.', 'buscar busca assistente pesquisar ctrl k atalho'],
    ['Como atualizo o avanço com foto?', 'Em Minhas atividades, toque no + do cartão (ou no próprio cartão), escolha o novo avanço e tire a foto do serviço. Para funcionário, a foto é obrigatória; para encarregado e gestor, é opcional. A foto guarda a hora e, se o celular permitir, a localização.', 'foto avanco atualizar minhas atividades camera registrar celular', { tipo: 'view', view: 'minhas', rotulo: 'Abrir Minhas atividades' }],
    ['O que faço quando o serviço travou?', 'No cartão da atividade, toque em "Travou", escolha o motivo (falta material, aguardando liberação, chuva, equipamento ou outro) e diga o que falta. O gestor da obra recebe o aviso no sistema e por e-mail, e a atividade fica marcada como travada até alguém liberar.', 'travou travada impedimento parado falta material liberacao chuva avisar gestor'],
    ['Funciona sem internet?', 'Sim, em Minhas atividades. Sem conexão, o sistema mostra a última lista carregada e guarda as atualizações e fotos no celular; elas são enviadas sozinhas quando a internet volta. O aviso amarelo no topo mostra quantas estão guardadas.', 'sem internet offline conexao sinal guardar enviar depois'],
    ['Como libero uma atividade travada?', 'Abra a atividade (na obra ou em Minhas atividades) e toque em "Liberar". Encarregado, gestor e administrador podem liberar.', 'liberar destravar travada impedimento resolver'],
    ['Como falo com o suporte?', 'Use o link "Fale conosco" no rodapé da tela. A resposta chega no seu e-mail.', 'suporte fale conosco contato ajuda problema erro mercurium', { tipo: 'contato', rotulo: 'Abrir Fale conosco' }],
  ].map(([p, r, chaves, link]) => ({ p, r, link, k: palavras(p + ' ' + chaves).filter(w => w.length > 2) }));
  const PARADAS = new Set(['como', 'que', 'para', 'pra', 'uma', 'por', 'com', 'dos', 'das', 'nos', 'nas', 'meu', 'minha', 'esta', 'isso', 'onde', 'qual', 'quais', 'tem', 'ser']);
  function parecido(a, b) {
    if (a === b) return true;
    if (a.length >= 5 && (b.startsWith(a) || a.startsWith(b))) return true;
    if (a.length < 4 || b.length < 4) return false;
    const tol = b.length >= 8 ? 2 : 1; if (Math.abs(a.length - b.length) > tol) return false;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length] <= tol;
  }
  function duvidas(q) {
    const t = palavras(q).filter(w => w.length > 2 && !PARADAS.has(w));
    if (!t.length) return [];
    return AJUDA.map(a => ({ a, n: t.filter(w => a.k.some(k => parecido(w, k))).length / Math.max(2, t.length) }))
      .filter(x => x.n >= 0.34).sort((x, y) => y.n - x.n).slice(0, 4).map(x => x.a);
  }

  /* ── estado e montagem do balão ─────────────── */
  const S = { aberto: false, aba: 'b', q: '', res: null, buscando: false, seq: 0, timer: null, aberta: 0 };
  let bt, jan;
  function criar() {
    if (bt) return;
    bt = h('button', { id: 'tfa-bt', class: 'tfa-bt', 'aria-label': 'Abrir o Assistente Task Flow', 'aria-expanded': 'false', title: 'Assistente Task Flow (Ctrl+K)', onclick: () => S.aberto ? fechar() : abrir() }, ic('fa-magnifying-glass'));
    jan = h('div', { id: 'tfa-jan', class: 'tfa-jan', role: 'dialog', 'aria-label': 'Assistente Task Flow', hidden: true });
    document.body.append(jan, bt);
    document.addEventListener('keydown', ev => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && sem(ev.key) === 'k') { ev.preventDefault(); abrir('b'); }
      else if (ev.key === 'Escape' && S.aberto && !document.querySelector('.tfa-folha')) fechar();
    });
    window.addEventListener('resize', () => { if (S.aberto) desenhar(); });
  }
  function abrir(aba, semIniciar) {
    criar();
    if (aba) S.aba = aba;
    if (S.aba === 'm' && !podeTudo()) S.aba = 'b';
    S.aberto = true; jan.hidden = false; bt.setAttribute('aria-expanded', 'true'); bt.setAttribute('aria-label', 'Fechar o assistente'); bt.innerHTML = ''; bt.append(ic('fa-xmark'));
    document.body.classList.add('tfa-aberto');
    desenhar();
    if (S.aba === 'b') { const i = jan.querySelector('.tfa-busca input'); if (i) { i.focus(); i.select(); } }
    if (S.aba === 'm' && !M.tipos && !semIniciar) iniciarMontar();
  }
  function fechar() {
    S.aberto = false; jan.hidden = true; bt.setAttribute('aria-expanded', 'false'); bt.setAttribute('aria-label', 'Abrir o Assistente Task Flow'); bt.innerHTML = ''; bt.append(ic('fa-magnifying-glass'));
    document.body.classList.remove('tfa-aberto');
    const f = document.querySelector('.tfa-folha'); if (f) f.remove();
    bt.focus();
  }
  function desenhar() {
    const grande = S.aba === 'm';
    jan.className = 'tfa-jan' + (grande ? ' tfa-grande' : '');
    jan.innerHTML = '';
    const cab = h('div', { class: 'tfa-cab' },
      h('span', { class: 'tfa-logo' }, ic('fa-magnifying-glass')),
      h('div', { class: 'tfa-cab-t' }, h('h2', null, 'Assistente Task Flow'),
        h('p', null, S.aba === 'b' ? 'Busca nas obras, pessoas, recursos, RDOs e na ajuda' : M.passos ? `Montar obra por perguntas · ${M.i < contaPerguntas() ? `pergunta ${M.i + 1} de ${contaPerguntas()}` : 'pronto para criar'}` : 'Montar obra por perguntas')),
      h('button', { class: 'tfa-x', 'aria-label': 'Fechar o assistente', onclick: fechar }, ic('fa-xmark')));
    const abas = podeTudo() ? h('div', { class: 'tfa-abas', role: 'tablist', 'aria-label': 'Assistente' },
      h('button', { role: 'tab', 'aria-selected': S.aba === 'b' ? 'true' : 'false', class: S.aba === 'b' ? 'on' : '', onclick: () => { S.aba = 'b'; desenhar(); setTimeout(() => jan.querySelector('.tfa-busca input')?.focus(), 20); } }, 'Buscar'),
      h('button', { role: 'tab', 'aria-selected': S.aba === 'm' ? 'true' : 'false', class: S.aba === 'm' ? 'on' : '', onclick: () => { S.aba = 'm'; if (!M.tipos) iniciarMontar(); else desenhar(); } }, 'Montar obra')) : null;
    if (grande) {
      const esq = h('div', { class: 'tfa-esq' }, cab, abas, conversa());
      jan.append(esq); if (!celular()) jan.append(previaPainel());
    } else jan.append(...[cab, abas, ...buscarCorpo()].filter(Boolean));
  }

  /* ══ Buscar ═══════════════════════════════════════════════════ */
  function sugestoes() {
    const p = eu().perfil;
    if (p === 'funcionario') return ['o que eu tenho hoje', 'minhas atividades atrasadas', 'como atualizo o avanço com foto'];
    if (p === 'encarregado') return ['atividades travadas', 'atividades atrasadas', 'funciona sem internet?'];
    return ['o que o João tem essa semana', 'obras no vermelho', 'como importar do MS Project', 'quem está com NR-10 vencida'];
  }
  async function buscar() {
    const q = S.q.trim(), seq = ++S.seq;
    if (!q) { S.res = null; S.buscando = false; desenharResultados(); return; }
    S.buscando = true;
    try { const r = await api('assistente/buscar?q=' + encodeURIComponent(q)); if (seq !== S.seq) return; S.res = r; }
    catch (e) { if (seq !== S.seq) return; S.res = { erro: e.message }; }
    S.buscando = false; S.aberta = 0; desenharResultados();
  }
  function tirarChip(c) {
    const fora = new Set(c.termos.map(t => t.replace(/[^a-z0-9]/g, '')));
    S.q = S.q.split(/\s+/).filter(w => !fora.has(sem(w).replace(/[^a-z0-9]/g, ''))).join(' ');
    const i = jan.querySelector('.tfa-busca input'); if (i) i.value = S.q;
    buscar();
  }
  function buscarCorpo() {
    const inp = h('input', { type: 'search', 'aria-label': 'Pergunte ou busque', placeholder: 'Pergunte ou busque: obra, pessoa, “atrasadas”…', value: S.q, autocomplete: 'off',
      oninput: e => { S.q = e.target.value; clearTimeout(S.timer); S.timer = setTimeout(buscar, 260); },
      onkeydown: e => { if (e.key === 'Enter') { clearTimeout(S.timer); buscar(); } } });
    setTimeout(desenharResultados, 0);
    return [h('div', { class: 'tfa-busca-box' }, h('label', { class: 'tfa-busca' }, ic('fa-magnifying-glass'), inp, celular() ? null : h('kbd', null, 'Ctrl K')), h('div', { class: 'tfa-entendi', 'aria-live': 'polite' })),
      h('div', { class: 'tfa-res' }), h('div', { class: 'tfa-pe' })];
  }
  function irLink(l) {
    if (!l) return;
    if (l.tipo === 'montar') { S.aba = 'm'; if (!M.tipos) iniciarMontar(); else desenhar(); return; }
    if (l.tipo === 'contato') { fechar(); window.tfContato ? tfContato() : avisar('Use o link Fale conosco no rodapé.', 'info'); return; }
    if (l.tipo === 'pessoa') { S.q = 'atividades de ' + l.texto; const i = jan.querySelector('.tfa-busca input'); if (i) i.value = S.q; buscar(); return; }
    if (l.tipo === 'view') {
      if (!document.getElementById('view-' + l.view)) { avisar('Esta tela está sendo refeita e chega nas próximas entregas.', 'info'); return; }
      if (celular()) fechar();
      window.switchView(l.view, document.querySelector(`[onclick*="'${l.view}'"]`)); return;
    }
    if (!window.tfObra) return;
    if (celular()) fechar();
    (async () => {
      await tfObra.abrir(l.tipo === 'obra' ? l.id : l.obra_id);
      const O = tfObra.estado;
      if (l.tipo === 'obra' && (l.filtro || l.resp)) {
        if (l.filtro === 'atrasadas') { O.f.mostrar = 'atrasadas'; O.f.chip = 'atrasadas'; }
        if (l.filtro === 'semana') O.f.chip = 'semana';
        if (l.resp) O.f.resp = String(l.resp);
        tfObra.desenhar();
      }
      if (l.tipo === 'atividade' && O.d) { const a = O.d.atividades.find(x => x.id === l.id); if (a) tfObra.painel(a); }
    })();
  }
  const SELO = { verm: 'verm', verd: 'verd', amar: 'amar', azul: 'azul', cinza: 'cinza' };
  function linhaItem(it) {
    return h('button', { class: 'tfa-item', onclick: () => irLink(it.link) },
      h('span', { class: 'tfa-item-t' }, h('b', null, it.titulo), it.info ? h('small', null, it.info) : null),
      it.selo ? h('span', { class: 'tfa-selo ' + (SELO[it.selo_cor] || 'cinza') }, it.selo) : null, ic('fa-chevron-right'));
  }
  function desenharResultados() {
    if (!jan || S.aba !== 'b') return;
    const box = jan.querySelector('.tfa-res'), ent = jan.querySelector('.tfa-entendi'), pe = jan.querySelector('.tfa-pe');
    if (!box) return;
    box.innerHTML = ''; ent.innerHTML = ''; pe.innerHTML = '';
    const r = S.res, q = S.q.trim();
    const exemplos = sugestoes().map((s, i) => [i ? ' · ' : '', h('a', { href: '#', onclick: e => { e.preventDefault(); S.q = s; jan.querySelector('.tfa-busca input').value = s; buscar(); } }, s)]);
    pe.append('Experimente: ', ...exemplos.flat());
    if (!q) {
      box.append(h('div', { class: 'tfa-vazio' }, h('b', null, 'Pergunte do seu jeito'), h('p', null, 'Busco nas obras, atividades, pessoas, recursos e RDOs que você pode ver, e explico como usar cada tela.')),
        secaoDuvidas(AJUDA.filter(a => a.link && a.link.tipo === 'montar' || /atrasada|linha de base|farol/.test(a.p)).slice(0, 4), 'Perguntas frequentes'));
      return;
    }
    if (S.buscando && !r) { box.append(h('p', { class: 'tfa-carregando' }, 'Buscando…')); return; }
    if (!r) return;
    if (r.erro) { box.append(h('p', { class: 'tfa-erro' }, r.erro)); return; }
    if (r.entendi.length) {
      ent.append('Entendi: ');
      r.entendi.forEach(c => ent.append(h('span', { class: 'tfa-chip' }, c.rotulo, c.termos.length ? h('button', { 'aria-label': 'Tirar ' + c.rotulo, onclick: () => tirarChip(c) }, '×') : null)));
    }
    const dv = duvidas(q);
    if (r.ajuda && dv.length) box.append(secaoDuvidas(dv, 'Dúvidas de uso'));
    const res = r.resposta;
    if (res) {
      const sec = h('section', { class: 'tfa-card', 'aria-label': 'Resposta' }, h('div', { class: 'tfa-card-cab' }, h('b', null, res.titulo), res.sub ? h('small', null, res.sub) : null));
      res.itens.forEach(it => sec.append(linhaItem(it)));
      if (res.total > res.itens.length) sec.append(h('p', { class: 'tfa-nota' }, `Mostrando ${res.itens.length} de ${res.total}.`));
      if (res.nota) sec.append(h('p', { class: 'tfa-nota' }, res.nota));
      if (res.acao) sec.append(h('div', { class: 'tfa-card-pe' }, h('button', { class: 'tfa-bt-sec', onclick: () => irLink(res.acao.link) }, res.acao.rotulo)));
      box.append(sec);
    }
    if (r.tambem.length) {
      const sec = h('section', { 'aria-label': 'Também encontrei' }, h('h3', null, 'Também encontrei'));
      const card = h('div', { class: 'tfa-card' });
      r.tambem.forEach(t => card.append(h('button', { class: 'tfa-item tfa-ent', onclick: () => irLink(t.link) },
        h('span', { class: 'tfa-sigla ' + (SELO[t.cor] || 'cinza') }, t.sigla), h('span', { class: 'tfa-item-t' }, h('b', null, t.titulo), h('small', null, t.info)), ic('fa-chevron-right'))));
      sec.append(card); box.append(sec);
    }
    if (!r.ajuda && dv.length) box.append(secaoDuvidas(dv.slice(0, 3), 'Dúvidas de uso'));
    if ((!res || !res.total) && !r.tambem.length && !dv.length)
      box.append(h('div', { class: 'tfa-vazio' }, h('b', null, 'Não encontrei nada com essas palavras'), h('p', null, 'Tente o código da obra, o nome de uma pessoa, uma situação ("atrasadas", "no vermelho") ou uma pergunta como "como importar do MS Project".')));
  }
  function secaoDuvidas(lista, titulo) {
    const sec = h('section', { 'aria-label': titulo }, h('h3', null, titulo));
    const card = h('div', { class: 'tfa-card' });
    lista.forEach((a, i) => {
      const d = h('details', { class: 'tfa-duv' }, h('summary', null, ic('fa-book-open'), a.p),
        h('p', null, a.r, a.link ? [' ', h('a', { href: '#', onclick: e => { e.preventDefault(); irLink(a.link); } }, a.link.rotulo)] : null));
      if (i === 0) d.open = true;
      card.append(d);
    });
    sec.append(card); return sec;
  }

  /* ══ Montar obra por perguntas ═══════════════════════════════ */
  const M = { tipos: null, r: null, i: 0, passos: null, previa: null, carregando: false, erro: null, alvo: null, calendarios: [], pessoas: [], obrasVazias: [], manter: false, seq: 0, outro: false };
  function novoR() {
    const seg = (() => { const d = hoje(); const w = new Date(T(d)).getUTCDay(); return mais(d, w === 1 ? 7 : (8 - w) % 7 || 7); })();
    return { tipo: null, escopo: null, qtd: {}, etapas: null, equipe: 4, encarregado_id: '', inicio: seg, prazo: '', semPrazo: false, calendario_id: '', paralelo: false,
             destino: 'nova', codigo: '', titulo: '', cliente: '', obra_id: '', substituir: false };
  }
  async function iniciarMontar(alvo) {
    M.alvo = alvo || null; M.r = novoR(); M.i = 0; M.previa = null; M.manter = false; M.erro = null; M.outro = false;
    if (M.alvo) { M.r.destino = 'obra'; M.r.obra_id = String(M.alvo.id); if (M.alvo.inicio) M.r.inicio = M.alvo.inicio; if (M.alvo.fim) M.r.prazo = M.alvo.fim; if (M.alvo.calendario_id) M.r.calendario_id = String(M.alvo.calendario_id); }
    calcPassos(); desenhar();
    try {
      const [t, c, f, o] = await Promise.all([api('assistente/tipos'), api('calendarios').catch(() => ({ calendarios: [] })), api('funcionarios').catch(() => ({ funcionarios: [] })), api('obras/resumo').catch(() => ({ obras: [] }))]);
      M.tipos = t.tipos; M.calendarios = c.calendarios || []; M.pessoas = (f.funcionarios || []).filter(p => p.ativo != 0);
      M.obrasVazias = (o.obras || []).filter(x => !x.atividades && !['Concluído', 'Arquivado'].includes(x.situacao));
      const enc = M.pessoas.filter(p => /encarreg/i.test(p.cargo || '')); if (enc.length === 1) M.r.encarregado_id = String(enc[0].id);
    } catch (e) { M.erro = e.message; }
    calcPassos(); desenhar();
  }
  const tipo = () => (M.tipos || []).find(t => t.id === M.r.tipo);
  function calcPassos() {
    const t = tipo(); const P = ['tipo'];
    if (t) {
      if (t.id === 'generica') P.push('etapas');
      else { P.push('escopo'); const esc = M.r.escopo || t.escopo.filter(e => e.padrao).map(e => e.id); t.perguntas.forEach(p => { if (!p.se || esc.includes(p.se)) P.push('q:' + p.id); }); }
      P.push('datas', 'equipe'); if (!M.alvo) P.push('obra');
    } else P.push('…', 'datas', 'equipe', ...(M.alvo ? [] : ['obra']));
    P.push('fim'); M.passos = P;
  }
  const contaPerguntas = () => M.passos ? M.passos.length - 1 : 7;
  function dadosPrevia() {
    const r = M.r, t = tipo();
    const d = { tipo: r.tipo, equipe: r.equipe, inicio: r.inicio || null, prazo: r.semPrazo ? null : (r.prazo || null), calendario_id: r.calendario_id ? +r.calendario_id : null,
                paralelo: r.paralelo, encarregado_id: r.encarregado_id ? +r.encarregado_id : null, titulo: r.titulo || null };
    if (t && t.id === 'generica') d.etapas = r.etapas || t.etapas; else if (t) { d.escopo = r.escopo || t.escopo.filter(e => e.padrao).map(e => e.id); d.qtd = r.qtd; }
    return d;
  }
  async function atualizarPrevia() {
    if (!M.r.tipo) { M.previa = null; desenharPrevia(); return; }
    const seq = ++M.seq; M.carregando = true; desenharPrevia();
    try { const p = await api('assistente/previa', 'POST', dadosPrevia()); if (seq !== M.seq) return; M.previa = p; M.erro = null; }
    catch (e) { if (seq !== M.seq) return; M.erro = e.message; }
    M.carregando = false; desenharPrevia(); desenharBotaoCel();
  }
  function responder(passo, valor) {
    const r = M.r, t = tipo();
    if (passo === 'tipo') { if (r.tipo !== valor) { const k = r; M.r = Object.assign(novoR(), { inicio: k.inicio, prazo: k.prazo, semPrazo: k.semPrazo, calendario_id: k.calendario_id, equipe: k.equipe, encarregado_id: k.encarregado_id, destino: k.destino, obra_id: k.obra_id, codigo: k.codigo, cliente: k.cliente }); M.r.tipo = valor; M.manter = false; } }
    else if (passo.startsWith('q:')) r.qtd[passo.slice(2)] = valor;
    calcPassos();
    M.outro = false;
    M.i = Math.min(M.passos.length - 1, M.passos.indexOf(passo) + 1);
    if (passo === 'tipo' && t !== tipo()) M.i = 1;
    desenhar(); atualizarPrevia();
  }
  function respostaTxt(passo) {
    const r = M.r, t = tipo();
    if (passo === 'tipo') return t ? t.nome : '';
    if (passo === 'escopo') { const esc = r.escopo || t.escopo.filter(e => e.padrao).map(e => e.id); return t.escopo.filter(e => esc.includes(e.id)).map(e => e.nome.replace(/ \(.*\)$/, '')).join(' · ') || 'Nada marcado'; }
    if (passo === 'etapas') return (r.etapas || t.etapas).map(e => `${e.nome} (${e.dias}d)`).join(' · ');
    if (passo.startsWith('q:')) { const p = t.perguntas.find(x => x.id === passo.slice(2)); const v = r.qtd[p.id] ?? p.padrao; return p.escolha ? v : `${num(v)} ${p.unidade}`; }
    if (passo === 'datas') { const cal = M.calendarios.find(c => String(c.id) === String(r.calendario_id)); return `Começa ${dBRano(r.inicio)} · ${r.semPrazo || !r.prazo ? 'sem prazo definido' : 'terminar até ' + dBRano(r.prazo)} · calendário ${cal ? cal.nome : 'Padrão'}`; }
    if (passo === 'equipe') { const p = M.pessoas.find(x => String(x.id) === String(r.encarregado_id)); return `${r.equipe} ${r.equipe === 1 ? 'pessoa' : 'pessoas'}${p ? ' · encarregado ' + p.nome.split(' ')[0] : ''}`; }
    if (passo === 'obra') { if (r.destino === 'obra') { const o = M.obrasVazias.find(x => String(x.id) === r.obra_id); return o ? `Na obra ${o.codigo || o.nome}` : 'Obra já cadastrada'; } return `Nova obra: ${[r.codigo, r.titulo || (M.previa && M.previa.titulo)].filter(Boolean).join(' · ')}${r.cliente ? ' · ' + r.cliente : ''}`; }
    return '';
  }
  function perguntaTxt(passo) {
    const t = tipo();
    if (passo === 'tipo') return ['Qual é o tipo de serviço?', 'Escolha o mais parecido; dá para ajustar tudo depois.'];
    if (passo === 'escopo') return ['O que está incluído nesta obra?', 'Desmarque o que não faz parte. As ligações se ajustam sozinhas.'];
    if (passo === 'etapas') return ['Quais são as etapas e quantos dias úteis cada uma leva?', 'Uma etapa começa quando a anterior termina.'];
    if (passo.startsWith('q:')) { const p = t.perguntas.find(x => x.id === passo.slice(2)); return [p.texto, p.escolha ? 'Muda o ritmo do trabalho (acesso, altura, complexidade).' : 'Uso para calcular as durações. Pode ser aproximado.']; }
    if (passo === 'datas') return ['Quando começa e até quando precisa terminar?', 'Com o prazo, eu aviso se não couber e sugiro ajustes.'];
    if (passo === 'equipe') { const ex = M.previa && M.previa.linhas.find(l => l.explica && / por dia com /.test(l.explica)); return ['Quantas pessoas na equipe de campo?', 'Uso isso para calcular a duração.' + (ex ? ' Ex.: ' + ex.explica + '.' : '')]; }
    if (passo === 'obra') return ['Para qual obra é este cronograma?', 'Pode ser uma obra nova ou uma já cadastrada que ainda está sem cronograma.'];
    return ['', ''];
  }
  function conversa() {
    const box = h('div', { class: 'tfa-conv' });
    const barra = h('div', { class: 'tfa-prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(contaPerguntas()), 'aria-valuenow': String(M.i) }, h('span', { style: `width:${Math.round(M.i / contaPerguntas() * 100)}%` }));
    if (!M.r) { box.append(h('p', { class: 'tfa-carregando' }, 'Carregando…')); return [barra, box]; }
    if (M.erro && !M.tipos) { box.append(h('p', { class: 'tfa-erro' }, M.erro)); return [barra, box]; }
    if (M.alvo) box.append(h('div', { class: 'tfa-bal p' }, `Vou montar o cronograma da obra ${M.alvo.codigo || ''} ${M.alvo.nome}.`.replace(/\s+/g, ' ')));
    M.passos.forEach((p, k) => {
      if (k >= M.i || p === '…' || p === 'fim') return;
      box.append(h('div', { class: 'tfa-bal p' }, perguntaTxt(p)[0]),
        h('button', { class: 'tfa-bal r', title: 'Mudar esta resposta', onclick: () => { M.i = k; M.outro = false; desenhar(); } }, respostaTxt(p)));
    });
    const atual = M.passos[M.i];
    const area = h('div', { class: 'tfa-resp' });
    if (atual === 'fim') {
      box.append(h('div', { class: 'tfa-bal p' }, h('b', null, 'Pronto! Confira a prévia e crie o cronograma.'), h('br'), h('small', null, 'Toque em qualquer resposta acima para mudar.')));
      if (M.alvo && M.alvo.temAtividades) area.append(h('label', { class: 'tfa-check' }, h('input', { type: 'checkbox', checked: M.r.substituir, onchange: e => { M.r.substituir = e.target.checked; } }), `Substituir as ${M.alvo.temAtividades} atividades atuais (sem marcar, acrescenta no fim)`));
      area.append(h('div', { class: 'tfa-acoes' }, h('button', { class: 'tfa-bt-sec', onclick: () => { M.i = Math.max(0, M.i - 1); desenhar(); } }, 'Voltar'),
        h('button', { class: 'tfa-bt-pri', disabled: !M.previa || M.carregando, onclick: criarObra }, M.previa ? `Criar cronograma (${M.previa.atividades} atividades)` : 'Criar cronograma')));
    } else if (M.tipos) {
      const [pq, dica] = perguntaTxt(atual);
      box.append(h('div', { class: 'tfa-bal p atual' }, h('b', null, pq), dica ? h('small', null, dica) : null));
      controles(atual, area);
    }
    setTimeout(() => { box.scrollTop = box.scrollHeight; }, 0);
    const res = [barra, box, area];
    if (celular()) res.push(h('div', { class: 'tfa-cel-prev' }));
    setTimeout(desenharBotaoCel, 0);
    return res;
  }
  const chip = (txt, on, fn, extra) => h('button', { class: 'tfa-op' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: fn }, txt, extra || null);
  function acoes(area, okTxt, ok, podeVoltar = true) {
    area.append(h('div', { class: 'tfa-acoes' }, podeVoltar && M.i > 0 ? h('button', { class: 'tfa-bt-sec', onclick: () => { M.i--; M.outro = false; desenhar(); } }, 'Voltar') : null,
      h('button', { class: 'tfa-bt-pri', onclick: ok }, okTxt)));
  }
  function controles(passo, area) {
    const r = M.r, t = tipo();
    if (passo === 'tipo') {
      const g = h('div', { class: 'tfa-tipos', role: 'radiogroup', 'aria-label': 'Tipo de serviço' });
      M.tipos.forEach(x => g.append(h('button', { class: 'tfa-tipo' + (r.tipo === x.id ? ' on' : ''), role: 'radio', 'aria-checked': r.tipo === x.id ? 'true' : 'false', onclick: () => responder('tipo', x.id) }, h('b', null, x.nome), h('small', null, x.desc))));
      area.append(g); return;
    }
    if (passo === 'escopo') {
      const esc = new Set(r.escopo || t.escopo.filter(e => e.padrao).map(e => e.id));
      const lista = h('div', { class: 'tfa-checks' });
      t.escopo.forEach(e => lista.append(h('label', { class: 'tfa-check' }, h('input', { type: 'checkbox', checked: esc.has(e.id), onchange: ev => { ev.target.checked ? esc.add(e.id) : esc.delete(e.id); r.escopo = [...esc]; calcPassos(); atualizarPrevia(); } }), e.nome)));
      area.append(lista); acoes(area, 'Continuar', () => { if (!esc.size) { avisar('Marque pelo menos um item.', 'error'); return; } r.escopo = [...esc]; responder('escopo'); });
      return;
    }
    if (passo === 'etapas') {
      r.etapas = r.etapas || t.etapas.map(e => ({ ...e }));
      const lista = h('div', { class: 'tfa-etapas' });
      const desenhaEt = () => {
        lista.innerHTML = '';
        r.etapas.forEach((e, k) => lista.append(h('div', { class: 'tfa-etapa' },
          h('input', { type: 'text', value: e.nome, 'aria-label': 'Nome da etapa ' + (k + 1), oninput: ev => { e.nome = ev.target.value; }, onchange: atualizarPrevia }),
          h('input', { type: 'number', min: '0', max: '999', value: e.dias, 'aria-label': 'Dias úteis da etapa ' + (k + 1), oninput: ev => { e.dias = Math.max(0, +ev.target.value || 0); }, onchange: atualizarPrevia }),
          h('span', null, 'dias'), h('button', { class: 'tfa-x peq', 'aria-label': 'Tirar a etapa ' + e.nome, onclick: () => { r.etapas.splice(k, 1); desenhaEt(); atualizarPrevia(); } }, ic('fa-xmark')))));
        lista.append(h('button', { class: 'tfa-bt-sec', onclick: () => { r.etapas.push({ nome: 'Nova etapa', dias: 5 }); desenhaEt(); atualizarPrevia(); setTimeout(() => lista.querySelectorAll('input[type=text]')[r.etapas.length - 1]?.select(), 10); } }, ic('fa-plus'), ' Etapa'));
      };
      desenhaEt(); area.append(lista);
      acoes(area, 'Continuar', () => { r.etapas = r.etapas.filter(e => e.nome.trim()); if (!r.etapas.length) { avisar('Diga pelo menos uma etapa.', 'error'); return; } responder('etapas'); });
      return;
    }
    if (passo.startsWith('q:')) {
      const p = t.perguntas.find(x => x.id === passo.slice(2)); const v = r.qtd[p.id] ?? p.padrao;
      const g = h('div', { class: 'tfa-ops', role: 'radiogroup', 'aria-label': p.texto });
      p.opcoes.forEach(o => g.append(chip(p.escolha ? o : `${num(o)} ${p.unidade}`, String(v) === String(o) && !M.outro, () => responder(passo, o))));
      if (!p.escolha) {
        const outroOn = M.outro || !p.opcoes.map(String).includes(String(v));
        g.append(chip('Outro…', outroOn, () => { M.outro = true; desenhar(); setTimeout(() => jan.querySelector('.tfa-outro input')?.focus(), 20); }));
        area.append(g);
        if (outroOn) {
          const inp = h('input', { type: 'number', min: '1', step: 'any', value: p.opcoes.map(String).includes(String(v)) ? '' : v, 'aria-label': p.texto, placeholder: 'Quantidade' });
          const ok = () => { const n = parseFloat(String(inp.value).replace(',', '.')); if (!(n > 0)) { avisar('Digite um número maior que zero.', 'error'); return; } responder(passo, n); };
          inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
          area.append(h('div', { class: 'tfa-outro' }, inp, h('span', null, p.unidade), h('button', { class: 'tfa-bt-pri', onclick: ok }, 'Responder')));
        }
      } else area.append(g);
      if (M.i > 0) area.append(h('div', { class: 'tfa-acoes' }, h('button', { class: 'tfa-bt-sec', onclick: () => { M.i--; M.outro = false; desenhar(); } }, 'Voltar')));
      return;
    }
    if (passo === 'datas') {
      const fIni = h('input', { type: 'date', value: r.inicio, 'aria-label': 'Começa em', onchange: e => { r.inicio = e.target.value; atualizarPrevia(); } });
      const fPrazo = h('input', { type: 'date', value: r.prazo, disabled: r.semPrazo, 'aria-label': 'Terminar até', onchange: e => { r.prazo = e.target.value; M.manter = false; atualizarPrevia(); } });
      const fSem = h('input', { type: 'checkbox', checked: r.semPrazo, onchange: e => { r.semPrazo = e.target.checked; fPrazo.disabled = r.semPrazo; atualizarPrevia(); } });
      const fCal = h('select', { 'aria-label': 'Calendário de trabalho', onchange: e => { r.calendario_id = e.target.value; atualizarPrevia(); } },
        h('option', { value: '' }, 'Padrão (seg a sex, 8 h, feriados nacionais)'), M.calendarios.map(c => h('option', { value: c.id, selected: String(c.id) === String(r.calendario_id) }, c.nome)));
      area.append(h('div', { class: 'tfa-campos' }, h('label', null, h('span', null, 'Começa em'), fIni), h('label', null, h('span', null, 'Terminar até'), fPrazo),
        h('label', { class: 'tfa-check' }, fSem, 'Sem prazo definido'), h('label', { class: 'larga' }, h('span', null, 'Calendário'), fCal)));
      acoes(area, 'Continuar', () => { if (!r.inicio) { avisar('Diga quando começa.', 'error'); return; } if (!r.semPrazo && r.prazo && r.prazo < r.inicio) { avisar('O prazo não pode ser antes do início.', 'error'); return; } responder('datas'); });
      return;
    }
    if (passo === 'equipe') {
      const g = h('div', { class: 'tfa-ops', role: 'radiogroup', 'aria-label': 'Tamanho da equipe' });
      const padrao = [2, 4, 6, 8]; const outroOn = M.outro || !padrao.includes(r.equipe);
      padrao.forEach(n => g.append(chip(`${n} pessoas`, r.equipe === n && !M.outro, () => { r.equipe = n; M.outro = false; desenhar(); atualizarPrevia(); })));
      g.append(chip('Outro…', outroOn, () => { M.outro = true; desenhar(); setTimeout(() => jan.querySelector('.tfa-outro input')?.focus(), 20); }));
      area.append(g);
      if (outroOn) area.append(h('div', { class: 'tfa-outro' }, h('input', { type: 'number', min: '1', max: '60', value: r.equipe, 'aria-label': 'Pessoas na equipe', onchange: e => { r.equipe = Math.max(1, Math.min(60, +e.target.value || 1)); atualizarPrevia(); } }), h('span', null, 'pessoas')));
      area.append(h('label', { class: 'tfa-linha' }, h('span', null, 'Encarregado'), h('select', { 'aria-label': 'Encarregado', onchange: e => { r.encarregado_id = e.target.value; atualizarPrevia(); } },
        h('option', { value: '' }, 'Definir depois'), M.pessoas.map(p => h('option', { value: p.id, selected: String(p.id) === String(r.encarregado_id) }, p.nome + (p.cargo ? ' · ' + p.cargo : ''))))));
      acoes(area, 'Responder', () => responder('equipe'));
      return;
    }
    if (passo === 'obra') {
      const nova = r.destino === 'nova';
      const g = h('div', { class: 'tfa-ops', role: 'radiogroup', 'aria-label': 'Destino' },
        chip('Obra nova', nova, () => { r.destino = 'nova'; desenhar(); }),
        M.obrasVazias.length ? chip(`Obra já cadastrada (${M.obrasVazias.length})`, !nova, () => { r.destino = 'obra'; if (!r.obra_id) r.obra_id = String(M.obrasVazias[0].id); desenhar(); }) : null);
      area.append(g);
      if (nova) {
        const sug = M.previa ? M.previa.titulo : '';
        area.append(h('div', { class: 'tfa-campos' },
          h('label', null, h('span', null, 'Código'), h('input', { type: 'text', value: r.codigo, placeholder: 'Ex.: ELE-019', maxlength: '30', oninput: e => { r.codigo = e.target.value.trim(); } })),
          h('label', null, h('span', null, 'Cliente'), h('input', { type: 'text', value: r.cliente, maxlength: '160', oninput: e => { r.cliente = e.target.value; } })),
          h('label', { class: 'larga' }, h('span', null, 'Nome da obra'), h('input', { type: 'text', value: r.titulo || sug, maxlength: '160', oninput: e => { r.titulo = e.target.value; } }))));
      } else {
        area.append(h('label', { class: 'tfa-linha' }, h('span', null, 'Obra'), h('select', { 'aria-label': 'Obra sem cronograma', onchange: e => { r.obra_id = e.target.value; } },
          M.obrasVazias.map(o => h('option', { value: o.id, selected: String(o.id) === r.obra_id }, `${o.codigo ? o.codigo + ' · ' : ''}${o.nome}`)))));
      }
      acoes(area, 'Continuar', () => { if (nova && !(r.titulo || (M.previa && M.previa.titulo) || '').trim()) { avisar('Dê um nome para a obra.', 'error'); return; } if (nova && !r.titulo) r.titulo = M.previa ? M.previa.titulo : ''; responder('obra'); });
    }
  }
  async function criarObra() {
    const r = M.r, p = M.previa; if (!p) return;
    const bt2 = jan.querySelector('.tfa-resp .tfa-bt-pri'); if (bt2) { bt2.disabled = true; bt2.textContent = 'Criando…'; }
    try {
      let id = M.alvo ? M.alvo.id : (r.destino === 'obra' ? +r.obra_id : null);
      if (!id) {
        const c = await api('projetos', 'POST', { codigo: r.codigo || null, nome: (r.titulo || p.titulo).trim(), cliente: r.cliente || null, tipo_servico: p.tipo_servico || null, situacao: 'Planejamento',
          inicio: p.inicio, fim: r.semPrazo || !r.prazo ? p.fim : (r.prazo > p.fim ? r.prazo : p.fim), calendario_id: r.calendario_id ? +r.calendario_id : null });
        id = c.id;
      }
      const res = await api(`obras/${id}/assistente-montar`, 'POST', Object.assign(dadosPrevia(), { substituir: !!(M.alvo && M.alvo.temAtividades && r.substituir) }));
      avisar(`✓ Cronograma criado: ${res.atividades} atividades e ${res.ligacoes} ligações.`, 'success');
      if (window.tfServidor && tfServidor.recarregar) tfServidor.recarregar().catch(() => {});
      if (window.tfObras && tfObras.recarregar) try { tfObras.recarregar(); } catch (_) {}
      M.tipos = null; M.r = null; S.aba = 'b'; fechar();
      if (window.tfObra) tfObra.abrir(id);
    } catch (e) {
      avisar(e.message, 'error'); if (bt2) { bt2.disabled = false; bt2.textContent = `Criar cronograma (${p.atividades} atividades)`; }
    }
  }

  /* ── prévia do Gantt ───────────────────────── */
  function previaPainel() {
    const box = h('div', { class: 'tfa-dir' }); setTimeout(desenharPrevia, 0); return box;
  }
  function conteudoPrevia() {
    const p = M.previa, r = M.r || {};
    const frag = [];
    const titulo = p ? [r.codigo, r.titulo || p.titulo].filter(Boolean).join(' · ') : '';
    frag.push(h('div', { class: 'tfa-dir-cab' }, h('div', null, h('h2', null, 'Prévia do cronograma'), h('p', null, p ? `${titulo} — vai se formando a cada resposta` : 'Escolha o tipo de serviço para ver o Gantt se formar.')),
      p ? h('div', { class: 'tfa-num' }, h('span', null, h('b', null, p.atividades), ' atividades'), h('span', null, h('b', null, String(p.dias_uteis).replace('.', ',')), ' dias úteis'), h('span', null, h('b', null, p.ligacoes), ' ligações')) : null));
    if (M.erro && M.tipos) frag.push(h('p', { class: 'tfa-erro' }, M.erro));
    if (!p) { frag.push(h('div', { class: 'tfa-gantt-vazio' }, ic('fa-chart-gantt'), h('p', null, M.carregando ? 'Montando…' : 'Nada por aqui ainda.'))); return frag; }
    if (p.prazo && !p.prazo.cabe && !M.manter) {
      const al = h('div', { class: 'tfa-alerta', role: 'alert' }, h('b', null, `Termina em ${dBRano(p.fim)} — ${diasTxt(p.prazo.dias)} depois do prazo (${dBRano(p.prazo.data)})`),
        h('small', null, p.sugestoes.length ? 'O caminho crítico está em vermelho. Escolha um ajuste ou mantenha assim:' : 'Não achei ajuste que encurte. Revise o prazo, as quantidades ou mantenha assim.'));
      const bts = h('div', { class: 'tfa-sug' });
      p.sugestoes.forEach(s => bts.append(h('button', { onclick: () => { Object.assign(M.r, s.aplicar); atualizarPrevia(); desenhar(); } }, `${s.rotulo} · −${diasTxt(s.ganho)}${s.cabe ? ' ✓ cabe' : ''}`)));
      bts.append(h('button', { class: 'neutro', onclick: () => { M.manter = true; desenharPrevia(); } }, 'Manter e avisar o cliente'));
      al.append(bts); frag.push(al);
    } else if (p.prazo && p.prazo.cabe) frag.push(h('div', { class: 'tfa-ok' }, ic('fa-circle-check'), ` Cabe no prazo (${dBRano(p.prazo.data)})${p.prazo.dias ? `, com ${diasTxt(p.prazo.dias)} de folga` : ''}.`));
    else if (p.prazo && M.manter) frag.push(h('div', { class: 'tfa-ok aviso' }, `Mantido: termina ${diasTxt(p.prazo.dias)} depois do prazo.`));
    if (M.r && M.r.paralelo) frag.push(h('div', { class: 'tfa-ok azul' }, 'Etapas em paralelo aplicadas. ', h('button', { class: 'tfa-link', onclick: () => { M.r.paralelo = false; atualizarPrevia(); } }, 'Desfazer')));
    frag.push(gantt(p));
    const como = p.linhas.filter(l => !l.etapa && l.explica);
    if (como.length) frag.push(h('details', { class: 'tfa-como' }, h('summary', null, 'Como calculei as durações'), h('ul', null, como.map(l => h('li', null, h('b', null, l.descricao), ': ', l.explica)))));
    return frag;
  }
  function gantt(p) {
    const ini = p.linhas.reduce((m, l) => l.inicio && l.inicio < m ? l.inicio : m, p.inicio);
    const w0 = mais(ini, -((new Date(T(ini)).getUTCDay() + 6) % 7));        // segunda
    let fim = p.fim; if (p.prazo && p.prazo.data > fim) fim = p.prazo.data;
    const nDias = Math.max(14, Math.ceil((T(fim) - T(w0)) / 864e5) + 8);
    const nSem = Math.ceil(nDias / 7);
    const pct = d => ((T(d) - T(w0)) / 864e5) / (nSem * 7) * 100;
    const g = h('div', { class: 'tfa-gantt' });
    const cabS = h('div', { class: 'tfa-g-sem' });
    for (let k = 0; k < nSem; k++) cabS.append(h('span', { style: `left:${k / nSem * 100}%` }, dBR(mais(w0, k * 7))));
    g.append(h('div', { class: 'tfa-g-lin cab' }, h('span', { class: 'tfa-g-nome' }, 'Atividade'), h('span', { class: 'tfa-g-dur' }, 'Dur.'), cabS));
    const corpo = h('div', { class: 'tfa-g-corpo' });
    p.linhas.forEach(l => {
      const barra = l.inicio ? h('i', { class: 'tfa-g-b' + (l.etapa ? ' etapa' : l.critica ? ' crit' : '') + (!l.etapa && l.dur === 0 ? ' marco' : ''),
        style: `left:${pct(l.inicio)}%;width:${l.dur === 0 && !l.etapa ? 0 : Math.max(0.6, pct(mais(l.fim, 1)) - pct(l.inicio))}%`, title: `${dBRano(l.inicio)} → ${dBRano(l.fim)}${l.explica ? '\n' + l.explica : ''}` }) : null;
      corpo.append(h('div', { class: 'tfa-g-lin' + (l.etapa ? ' etapa' : '') },
        h('span', { class: 'tfa-g-nome', title: l.descricao }, l.descricao), h('span', { class: 'tfa-g-dur' }, l.etapa ? '' : (l.dur === 0 ? 'marco' : String(l.dur).replace('.', ',') + 'd')), h('span', { class: 'tfa-g-area' }, barra)));
    });
    if (p.prazo) corpo.append(h('span', { class: 'tfa-g-prazo', style: `--x:${pct(mais(p.prazo.data, 1)).toFixed(3)}` }, h('em', null, 'Prazo ' + dBR(p.prazo.data))));
    g.append(corpo);
    g.append(h('div', { class: 'tfa-leg' }, h('span', null, h('i', { class: 'crit' }), 'Caminho crítico'), h('span', null, h('i', null), 'Com folga'), p.prazo ? h('span', null, h('i', { class: 'prazo' }), 'Prazo') : null));
    return g;
  }
  function desenharPrevia() {
    if (!jan || S.aba !== 'm') return;
    const dir = jan.querySelector('.tfa-dir') || document.querySelector('.tfa-folha .tfa-dir');
    if (dir) {
      dir.innerHTML = ''; dir.append(...conteudoPrevia());
      if (!celular()) dir.append(h('div', { class: 'tfa-dir-pe' }, h('span', null, 'Tudo pode ser editado depois, no cronograma.'),
        h('button', { class: 'tfa-bt-pri', disabled: !M.previa || M.carregando || !M.passos || M.passos[M.i] !== 'fim', title: M.passos && M.passos[M.i] !== 'fim' ? 'Responda as perguntas para criar' : '', onclick: criarObra },
          M.previa ? `Criar cronograma (${M.previa.atividades} atividades)` : 'Criar cronograma')));
    }
  }
  function desenharBotaoCel() {
    const box = jan && jan.querySelector('.tfa-cel-prev'); if (!box) return;
    box.innerHTML = '';
    const p = M.previa; if (!p) return;
    const ruim = p.prazo && !p.prazo.cabe && !M.manter;
    box.append(h('button', { class: 'tfa-cel-bt' + (ruim ? ' ruim' : ''), onclick: abrirFolha },
      h('span', null, h('b', null, `Prévia: ${p.atividades} atividades · termina ${dBR(p.fim)}`), h('small', null, ruim ? `${diasTxt(p.prazo.dias)} depois do prazo · ver Gantt e ajustes` : 'Ver o Gantt')), ic('fa-chevron-right')));
    const cv = jan.querySelector('.tfa-conv'); if (cv) cv.scrollTop = cv.scrollHeight;
  }
  function abrirFolha() {
    const f = h('div', { class: 'tfa-folha', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Prévia do cronograma' },
      h('div', { class: 'tfa-folha-cab' }, h('b', null, 'Prévia do cronograma'), h('button', { class: 'tfa-x', 'aria-label': 'Fechar a prévia', onclick: () => { f.remove(); desenharBotaoCel(); } }, ic('fa-xmark'))),
      h('div', { class: 'tfa-dir' }));
    document.body.append(f); desenharPrevia();
  }

  /* ── ligação com o resto do sistema ─────────── */
  window.tfAssistente = {
    abrir: (aba) => abrir(aba || 'b'),
    buscar: (q) => { abrir('b'); S.q = q; const i = jan.querySelector('.tfa-busca input'); if (i) i.value = q; buscar(); },
    montar: (obra) => { abrir('m', true); iniciarMontar(obra || null); },
    fechar: () => fechar(), estado: S
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', criar); else criar();
})();
