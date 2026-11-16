/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · servidor.js
   Liga as telas ao servidor: exige login, carrega obras/atividades/equipe/ausências/recursos
   e grava cada mudança (as telas continuam usando load()/save() como antes).
   Carregado por último: substitui window.load / window.save definidos em extensoes.js.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const PODE_TUDO = ['administrador', 'gestor'];
  const SIT_PROJ = ['Planejamento', 'Em andamento', 'Pausado', 'Concluído', 'Arquivado'];
  const SIT_APP = { 'Pendente': 'Pendente', 'Em andamento': 'Em Andamento', 'Concluído': 'Concluído', 'Reprogramado': 'Reprogramado' };
  const SIT_SERV = { 'Pendente': 'Pendente', 'Em Andamento': 'Em andamento', 'Concluído': 'Concluído', 'Reprogramado': 'Reprogramado' };
  const TIPOS_AUS = ['Folga', 'Férias', 'Treinamento', 'Outra atividade', 'Afastamento – doença ou acidente', 'Afastamento – outro motivo'];
  const CHAVES_LOCAIS = ['tf_projects', 'tf_activities', 'tf_employees_v2', 'tf_team_calendar_v2', 'tf_resources_registry_v1'];

  const E = {
    usuario: null,
    snap: { proj: new Map(), act: new Map(), func: new Map(), aus: new Map(), rec: new Map() },
    func: new Map(),          // chave do nome -> id no servidor
    salvando: false, deNovo: false, timer: null, erro: null,
  };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  const dataOk = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d ? d : null;
  const horasDia = () => { try { return (typeof loadCalCfg === 'function' && loadCalCfg().horasDia) || 9; } catch (_) { return 9; } };
  const podeTudo = () => E.usuario && PODE_TUDO.includes(E.usuario.perfil);
  const aviso = (m, t) => { try { toast(m, t || 'info'); } catch (_) { console.log(m); } };

  /* ── Chamadas ao servidor ────────────────────── */
  async function api(rota, metodo, dados) {
    const op = { method: metodo || 'GET', credentials: 'same-origin', headers: {} };
    if (dados !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    let r;
    try { r = await fetch('api/' + rota, op); } catch (_) { const e = new Error('Sem conexão com o servidor'); e.rede = true; throw e; }
    let j = {}; try { j = await r.json(); } catch (_) {}
    if (r.status === 401) { window.location.href = 'entrar.html'; throw new Error('Sessão encerrada'); }
    if (!r.ok) { const e = new Error(j.erro || ('Erro ' + r.status)); e.status = r.status; throw e; }
    return j;
  }
  const listar = async (rota, campo) => { try { return (await api(rota))[campo] || []; } catch (e) { if (e.status === 403) return []; throw e; } };

  /* ── Conversões servidor <-> telas ───────────── */
  const projServ = p => ({
    nome: (p.name || '').trim(), codigo: (p.code || '').trim() || null, descricao: (p.desc || '').trim() || null,
    gestor_nome: (p.manager || '').trim() || null, situacao: SIT_PROJ.includes(p.status) ? p.status : 'Em andamento',
    inicio: dataOk(p.startDate), fim: dataOk(p.endDate), cor: p.color || null,
  });
  function actServ(a) {
    const proj = projects.find(p => p.id === a.projectId) || projects.find(p => p.name === a.project);
    const pai = a.parentId ? activities.find(x => x.id === a.parentId) : null;
    let sit = SIT_SERV[a.status];
    if (!sit) { const ant = E.snap.act.get(a._sid); sit = ant && ['Pendente', 'Em andamento'].includes(ant.situacao) ? ant.situacao : (a.progress > 0 ? 'Em andamento' : 'Pendente'); }
    const h = a.durationH != null && a.durationH !== '' ? parseFloat(a.durationH) : parseFloat(a.duration);
    const ini = dataOk(a.startDate); let fim = dataOk(a.dueDate);
    if (ini && fim && fim < ini) fim = ini;
    return {
      projeto_id: proj ? proj._sid || null : null, pai_id: pai ? pai._sid || null : null,
      descricao: (a.description || '').trim(), observacoes: (a.obs || '').trim() || null,
      responsavel_id: a.responsible ? (E.func.get(norm(a.responsible)) || null) : null,
      inicio: ini, fim, duracao_horas: isFinite(h) && h > 0 ? h : null,
      avanco: Math.max(0, Math.min(100, parseInt(a.progress) || 0)), situacao: sit, critica: a.isCritical ? 1 : 0,
    };
  }
  const funcServ = e => ({ nome: e.name, cargo: (e.role || '').trim() || null, equipe: e.team && e.team !== 'Não definida' ? e.team : null });
  function ausenciasDe(chave) {               // dias da pessoa -> períodos contínuos do mesmo tipo
    const dias = teamCalendar[chave] || {};
    const datas = Object.keys(dias).filter(dataOk).sort();
    const out = [];
    for (const d of datas) {
      const v = dias[d]; if (!v || !TIPOS_AUS.includes(v.type)) continue;
      const det = v.label && v.label !== v.type ? v.label : null;
      const ult = out[out.length - 1];
      const prox = ult && new Date(new Date(ult.fim + 'T00:00:00Z').getTime() + 864e5).toISOString().slice(0, 10);
      if (ult && prox === d && ult.tipo === v.type && ult.detalhe === det) ult.fim = d;
      else out.push({ inicio: d, fim: d, tipo: v.type, detalhe: det });
    }
    return out;
  }
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const diferencas = (novo, velho) => Object.fromEntries(Object.entries(novo).filter(([k, v]) => !igual(v, velho ? velho[k] : undefined)));

  /* ── Carregar tudo do servidor ───────────────── */
  async function carregar() {
    const [projs, acts, funcs, aus, recs] = await Promise.all([
      listar('projetos', 'projetos'), listar('atividades', 'atividades'), listar('funcionarios', 'funcionarios'),
      listar('ausencias', 'ausencias'), listar('recursos', 'recursos')]);
    const hd = horasDia();
    E.func = new Map(); E.snap = { proj: new Map(), act: new Map(), func: new Map(), aus: new Map(), rec: new Map() };
    funcs.forEach(f => E.func.set(norm(f.nome), f.id));
    acts.forEach(a => { if (a.responsavel_id && a.responsavel_nome && !E.func.has(norm(a.responsavel_nome))) E.func.set(norm(a.responsavel_nome), a.responsavel_id); });

    projects = projs.map((p, i) => ({ id: 'p' + p.id, _sid: p.id, name: p.nome, code: p.codigo || '', desc: p.descricao || '',
      manager: p.gestor_nome || '', status: p.situacao, startDate: p.inicio || '', endDate: p.fim || '',
      color: p.cor || COLORS[i % COLORS.length], progress: 0 }));
    const nomeProj = new Map(projects.map(p => [p._sid, p]));
    activities = acts.map(a => {
      const h = a.duracao_horas != null ? parseFloat(a.duracao_horas) : 0;
      const p = nomeProj.get(a.projeto_id);
      return { id: 'a' + a.id, _sid: a.id, project: p ? p.name : '', projectId: p ? p.id : '', description: a.descricao,
        responsible: a.responsavel_nome || '', startDate: a.inicio || '', dueDate: a.fim || '', status: SIT_APP[a.situacao] || 'Pendente',
        progress: parseInt(a.avanco) || 0, obs: a.observacoes || '', isCritical: !!+a.critica,
        duration: h ? `${h}h (${Math.ceil(h / hd)}d úteis)` : '', durationH: h || 0, parentId: a.pai_id ? 'a' + a.pai_id : '' };
    });
    projects.forEach(p => {                       // progresso da obra = média das atividades
      const l = activities.filter(a => a.projectId === p.id);
      p.progress = l.length ? Math.round(l.reduce((s, a) => s + a.progress, 0) / l.length) : 0;
      PROJECT_COLORS_MAP[p.name] = p.color;
    });
    employees = funcs.map(f => ({ id: 'f' + f.id, key: norm(f.nome), name: f.nome, team: f.equipe || 'Não definida', role: f.cargo || '', notes: '' }));
    resourceRegistry = funcs.map(f => ({ id: 'f' + f.id, name: f.nome, team: f.equipe || '', role: f.cargo || '', isCollaborator: true }))
      .concat(recs.map(r => ({ id: 'r' + r.id, _sid: r.id, name: r.nome, team: '', role: '', isCollaborator: false })));
    teamCalendar = {};
    aus.forEach(x => {
      const k = norm(x.funcionario_nome); if (!teamCalendar[k]) teamCalendar[k] = {};
      let d = new Date(x.inicio + 'T00:00:00Z'); const fim = new Date(x.fim + 'T00:00:00Z');
      for (let n = 0; d <= fim && n < 400; n++, d = new Date(d.getTime() + 864e5))
        teamCalendar[k][d.toISOString().slice(0, 10)] = { type: x.tipo, label: x.detalhe || x.tipo };
    });
    try { buildEmployeeDatabase(); } catch (_) {}
    // retrato do que está no servidor, para comparar na hora de gravar
    projects.forEach(p => E.snap.proj.set(p._sid, projServ(p)));
    activities.forEach(a => E.snap.act.set(a._sid, actServ(a)));
    acts.forEach(a => { const s = E.snap.act.get(a.id); if (s) s.situacao = a.situacao; });
    funcs.forEach(f => E.snap.func.set(f.id, { nome: f.nome, cargo: f.cargo || null, equipe: f.equipe || null }));
    const porFunc = new Map(); funcs.forEach(f => porFunc.set(f.id, norm(f.nome)));
    new Set(aus.map(x => x.funcionario_id)).forEach(fid => E.snap.aus.set(fid, ausenciasDe(porFunc.get(fid))));
    recs.forEach(r => E.snap.rec.set(r.id, true));
  }

  /* ── Gravar o que mudou ──────────────────────── */
  function agendar() { clearTimeout(E.timer); indicador('pendente'); E.timer = setTimeout(gravar, 400); }
  async function gravar() {
    if (E.salvando) { E.deNovo = true; return; }
    E.salvando = true; E.deNovo = false; indicador('salvando');
    try {
      if (podeTudo()) await gravarEquipe();
      await gravarProjetos();
      await gravarAtividades();
      if (podeTudo() || (E.usuario && E.usuario.perfil === 'encarregado')) await gravarAusencias();
      if (podeTudo()) await gravarRecursos();
      E.erro = null; indicador('ok');
    } catch (e) {
      E.erro = e; indicador('erro', e.message);
      aviso('Não foi possível salvar no servidor: ' + e.message, 'error');
    } finally {
      E.salvando = false;
      if (E.deNovo) gravar();
    }
  }
  async function gravarEquipe() {
    try { buildEmployeeDatabase(); } catch (_) {}
    const atuais = new Map();
    employees.forEach(e => { if (e.name) atuais.set(norm(e.name), e); });
    activities.forEach(a => { const k = norm(a.responsible); if (k && !atuais.has(k)) atuais.set(k, { name: a.responsible, role: '', team: '' }); });
    for (const [k, e] of atuais) {
      const dados = funcServ(e); const sid = E.func.get(k);
      if (!sid) { const r = await api('funcionarios', 'POST', dados); E.func.set(k, r.id); E.snap.func.set(r.id, dados); continue; }
      const dif = diferencas(dados, E.snap.func.get(sid));
      if (Object.keys(dif).length) { await api('funcionarios/' + sid, 'PATCH', dif); E.snap.func.set(sid, dados); }
    }
    for (const [k, sid] of [...E.func]) {
      if (atuais.has(k) || !E.snap.func.has(sid)) continue;
      await api('funcionarios/' + sid, 'DELETE'); E.func.delete(k); E.snap.func.delete(sid);
    }
  }
  async function gravarProjetos() {
    const vivos = new Set();
    for (const p of projects) {
      const dados = projServ(p);
      if (!dados.nome) continue;
      if (!p._sid) { if (!podeTudo()) continue; const r = await api('projetos', 'POST', dados); p._sid = r.id; E.snap.proj.set(r.id, dados); vivos.add(r.id); continue; }
      vivos.add(p._sid);
      const dif = diferencas(dados, E.snap.proj.get(p._sid));
      if (Object.keys(dif).length) { await api('projetos/' + p._sid, 'PATCH', dif); E.snap.proj.set(p._sid, dados); }
    }
    for (const sid of [...E.snap.proj.keys()]) if (!vivos.has(sid)) { await api('projetos/' + sid, 'DELETE'); E.snap.proj.delete(sid); }
  }
  async function gravarAtividades() {
    const nivel = a => { let n = 0, x = a; while (x && x.parentId && n < 20) { x = activities.find(y => y.id === x.parentId); n++; } return n; };
    const ordem = [...activities].sort((a, b) => nivel(a) - nivel(b));
    const vivos = new Set();
    for (const a of ordem) {
      const dados = actServ(a);
      if (!dados.descricao || !dados.projeto_id) continue;
      if (!a._sid) {
        if (!podeTudo()) continue;
        const r = await api('atividades', 'POST', { ...dados, ordem: activities.indexOf(a) });
        a._sid = r.id; E.snap.act.set(r.id, dados); vivos.add(r.id); continue;
      }
      vivos.add(a._sid);
      const dif = diferencas(dados, E.snap.act.get(a._sid));
      if (Object.keys(dif).length) { await api('atividades/' + a._sid, 'PATCH', dif); E.snap.act.set(a._sid, dados); }
    }
    for (const sid of [...E.snap.act.keys()]) if (!vivos.has(sid)) { await api('atividades/' + sid, 'DELETE'); E.snap.act.delete(sid); }
  }
  async function gravarAusencias() {
    const pessoas = new Set([...Object.keys(teamCalendar), ...[...E.snap.aus.keys()].map(sid => [...E.func].find(([, v]) => v === sid)?.[0]).filter(Boolean)]);
    for (const k of pessoas) {
      const sid = E.func.get(k); if (!sid) continue;
      const periodos = ausenciasDe(k);
      if (igual(periodos, E.snap.aus.get(sid) || [])) continue;
      await api('ausencias/funcionario/' + sid, 'PUT', { periodos }); E.snap.aus.set(sid, periodos);
    }
  }
  async function gravarRecursos() {
    const vivos = new Set();
    for (const r of resourceRegistry.filter(x => !x.isCollaborator)) {
      if (!r._sid) { const n = await api('recursos', 'POST', { nome: r.name }); r._sid = n.id; E.snap.rec.set(n.id, true); }
      vivos.add(r._sid);
    }
    for (const sid of [...E.snap.rec.keys()]) if (!vivos.has(sid)) { await api('recursos/' + sid, 'DELETE'); E.snap.rec.delete(sid); }
  }

  /* ── Importar o que estava só neste navegador ── */
  const ler = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const ehExemplo = (p) => /^p[123]$/.test(p.id) && ['Manipuladores', 'RETIFICA 01', 'RETIFICA 02'].includes(p.name);
  function dadosLocais(comExemplo) {
    const projs = (ler('tf_projects') || []).filter(p => p && p.name && (comExemplo || !ehExemplo(p)));
    const ids = new Set(projs.map(p => p.id)); const porNome = new Map(projs.map(p => [p.name, p]));
    const acts = (ler('tf_activities') || []).filter(a => a && a.description).map(a => ({ ...a, projectId: (ids.has(a.projectId) ? a.projectId : (porNome.get(a.project) || {}).id) }))
      .filter(a => a.projectId);
    const emps = ler('tf_employees_v2') || []; const regs = ler('tf_resources_registry_v1') || []; const cal = ler('tf_team_calendar_v2') || {};
    const usados = new Set(acts.map(a => norm(a.responsible)));
    const funcs = []; const vistos = new Set();
    [...emps.map(e => ({ nome: e.name, cargo: e.role, equipe: e.team })), ...regs.filter(r => r.isCollaborator).map(r => ({ nome: r.name, cargo: r.role, equipe: r.team }))]
      .forEach(f => { const k = norm(f.nome); if (k && !vistos.has(k) && (comExemplo || usados.has(k) || !emps.length || regs.some(r => norm(r.name) === k))) { vistos.add(k); funcs.push(f); } });
    const salva = teamCalendar; teamCalendar = cal;
    const ausencias = []; Object.keys(cal).forEach(k => ausenciasDe(k).forEach(p => ausencias.push({ ...p, funcionario_nome: (emps.find(e => norm(e.name) === k) || {}).name || k })));
    teamCalendar = salva;
    return {
      projetos: projs.map(p => ({ id_antigo: p.id, nome: p.name, codigo: p.code || null, descricao: p.desc || null, gestor_nome: p.manager || null,
        situacao: SIT_PROJ.includes(p.status) ? p.status : 'Em andamento', inicio: dataOk(p.startDate), fim: dataOk(p.endDate), cor: p.color || null })),
      atividades: acts.map((a, i) => { const h = a.durationH ? parseFloat(a.durationH) : parseFloat(a.duration); return {
        id_antigo: a.id, projeto_id_antigo: a.projectId, pai_id_antigo: a.parentId || null, descricao: a.description, observacoes: a.obs || null,
        responsavel_nome: a.responsible || null, inicio: dataOk(a.startDate), fim: dataOk(a.dueDate), duracao_horas: isFinite(h) && h > 0 ? h : null,
        avanco: Math.max(0, Math.min(100, parseInt(a.progress) || 0)), situacao: SIT_SERV[a.status] || (parseInt(a.progress) > 0 ? 'Em andamento' : 'Pendente'),
        critica: a.isCritical ? 1 : 0, ordem: i }; }),
      funcionarios: funcs, recursos: regs.filter(r => !r.isCollaborator && r.name).map(r => ({ nome: r.name, id_antigo: r.id })), ausencias,
    };
  }
  function oferecerImportacao() {
    if (!podeTudo() || projects.length || localStorage.getItem('tf_importado')) return;
    const real = dadosLocais(false), tudo = dadosLocais(true);
    if (!real.projetos.length && !real.atividades.length) return;     // só havia os dados de exemplo
    const temExemplo = tudo.projetos.length > real.projetos.length;
    const fundo = document.createElement('div');
    fundo.className = 'tf-imp-fundo';
    fundo.innerHTML = `<div class="tf-imp" role="dialog" aria-modal="true" aria-labelledby="tf-imp-t">
      <div class="tf-imp-ic"><i class="fa-solid fa-cloud-arrow-up"></i></div>
      <h3 id="tf-imp-t">Levar os dados deste navegador para o servidor?</h3>
      <p>Encontrei neste navegador <b>${real.projetos.length} obra(s)</b>, <b>${real.atividades.length} atividade(s)</b> e <b>${real.funcionarios.length} pessoa(s)</b> que ainda não estão no servidor. Importando, toda a equipe passa a ver os mesmos dados.</p>
      ${temExemplo ? '<label class="tf-imp-ex"><input type="checkbox" id="tf-imp-ex"> Incluir também os dados de exemplo (Manipuladores, Retífica 01 e 02)</label>' : ''}
      <p class="tf-imp-nota">Antes de importar, uma cópia desses dados é baixada para o seu computador.</p>
      <div class="tf-imp-bt"><button class="btn-secondary" id="tf-imp-nao">Agora não</button><button class="btn-primary" id="tf-imp-sim"><i class="fa-solid fa-upload"></i> Importar</button></div></div>`;
    document.body.appendChild(fundo);
    fundo.querySelector('#tf-imp-nao').onclick = () => fundo.remove();
    fundo.querySelector('#tf-imp-sim').onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando…';
      const dados = dadosLocais(!!(fundo.querySelector('#tf-imp-ex') || {}).checked);
      try {
        const copia = {}; CHAVES_LOCAIS.forEach(k => { copia[k] = ler(k); });
        const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 1)], { type: 'application/json' }));
        const lk = document.createElement('a'); lk.href = url; lk.download = 'taskflow-copia-do-navegador.json'; document.body.appendChild(lk); lk.click(); lk.remove();
        const r = await api('importar', 'POST', dados);
        localStorage.setItem('tf_importado', new Date().toISOString());
        fundo.remove();
        await carregar(); renderAll();
        aviso(`✓ Importado: ${r.projetos} obra(s), ${r.atividades} atividade(s), ${r.funcionarios} pessoa(s)`, 'success');
      } catch (e) { b.disabled = false; b.innerHTML = '<i class="fa-solid fa-upload"></i> Tentar de novo'; aviso('Importação não concluída: ' + e.message, 'error'); }
    };
  }

  /* ── Cabeçalho: quem está logado, situação da gravação, sair ── */
  function montarCabecalho() {
    if (E.usuario.perfil === 'funcionario') { document.getElementById('nav-obras')?.remove(); document.getElementById('nav-recursos')?.remove(); }   // funcionário usa "Minhas atividades"
    const st = document.createElement('style');
    st.textContent = `.tf-user{display:flex;align-items:center;gap:10px;margin-left:6px;padding-left:12px;border-left:1px solid var(--border)}
      .tf-user-txt{display:flex;flex-direction:column;line-height:1.15;max-width:170px}.tf-user-txt b{font-size:.8rem;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tf-user-txt span{font-size:.68rem;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tf-sync{width:9px;height:9px;border-radius:50%;background:var(--green);flex-shrink:0;cursor:default}.tf-sync.pendente,.tf-sync.salvando{background:var(--amber)}
      .tf-sync.salvando{animation:tfp 1s infinite}.tf-sync.erro{background:var(--red);cursor:pointer}@keyframes tfp{50%{opacity:.35}}
      .tf-sair{border:1px solid var(--border);background:var(--surface);color:var(--text-2);border-radius:8px;height:32px;padding:0 10px;font:inherit;font-size:.78rem;cursor:pointer;display:flex;gap:6px;align-items:center}
      .tf-sair:hover{border-color:var(--red);color:var(--red)}
      @media(max-width:760px){.tf-user-txt{display:none}.tf-user .tf-sair span{display:none}}
      .tf-imp-fundo{position:fixed;inset:0;background:rgba(15,22,41,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
      .tf-imp{background:var(--surface);border-radius:16px;max-width:460px;width:100%;padding:26px;box-shadow:0 20px 60px rgba(0,0,0,.25);color:var(--text-1)}
      .tf-imp h3{font-family:var(--font-head);font-size:1.15rem;margin:10px 0 8px}.tf-imp p{color:var(--text-2);font-size:.88rem;line-height:1.5;margin-bottom:10px}
      .tf-imp-ic{width:46px;height:46px;border-radius:12px;background:var(--blue-dim);color:var(--blue);display:flex;align-items:center;justify-content:center;font-size:1.2rem}
      .tf-imp-ex{display:flex;gap:8px;align-items:center;font-size:.84rem;color:var(--text-2);margin:4px 0 10px}.tf-imp-nota{font-size:.78rem!important;color:var(--text-3)!important}
      .tf-imp-bt{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}
      .tf-k-campo{display:block;font-size:.8rem;font-weight:600;color:var(--text-2);margin-bottom:12px}.tf-k-campo select,.tf-k-campo textarea{display:block;width:100%;margin-top:6px;border:1.5px solid var(--border);border-radius:8px;padding:9px 11px;font:inherit;font-size:.9rem;font-weight:400;background:var(--surface);color:var(--text-1)}
      .tf-k-campo textarea{resize:vertical;min-height:110px}
      .tf-rodape{display:flex;align-items:center;gap:6px;padding:14px 24px 18px;font-size:.75rem;color:var(--text-3)}.tf-rodape a{color:var(--text-3);text-decoration:underline;text-underline-offset:2px}.tf-rodape a:hover{color:var(--blue)}
      @media (max-width:760px){.tf-rodape{padding:12px 16px 84px}}
      .tf-badge{background:var(--red);color:#fff;border-radius:9px;font-size:.66rem;font-weight:700;min-width:18px;height:18px;padding:0 5px;display:inline-flex;align-items:center;justify-content:center}`;
    document.head.appendChild(st);
    const cab = document.querySelector('.header'); if (!cab) return;
    const box = document.createElement('div'); box.className = 'tf-user';
    const perfis = { administrador: 'Administrador', gestor: 'Gestor', encarregado: 'Encarregado', funcionario: 'Funcionário' };
    box.innerHTML = `<span class="tf-sync" id="tf-sync" title="Tudo salvo no servidor"></span>
      <div class="tf-user-txt"><b></b><span></span></div>
      <button class="tf-sair" id="tf-contato" title="Fale conosco"><i class="fa-regular fa-comment-dots"></i><span>Fale conosco</span></button>
      <button class="tf-sair" id="tf-sair" title="Sair"><i class="fa-solid fa-right-from-bracket"></i><span>Sair</span></button>`;
    box.querySelector('b').textContent = E.usuario.nome;
    box.querySelector('.tf-user-txt span').textContent = `${perfis[E.usuario.perfil] || E.usuario.perfil} · ${E.usuario.empresa}`;
    cab.appendChild(box);
    // rodapé da barra lateral: quem está logado (antes era um nome fixo)
    const av = document.querySelector('.user-avatar'), un = document.querySelector('.user-name'), ur = document.querySelector('.user-role');
    const ini = E.usuario.nome.trim().split(/\s+/); 
    if (av) av.textContent = ((ini[0] || '')[0] + (ini.length > 1 ? ini[ini.length - 1][0] : '')).toUpperCase();
    if (un) un.textContent = E.usuario.nome;
    if (ur) ur.textContent = (perfis[E.usuario.perfil] || E.usuario.perfil) + ' · ' + E.usuario.empresa;
    box.querySelector('#tf-sair').onclick = async () => {
      if (E.salvando || E.timer && !E.erro) { await new Promise(r => setTimeout(r, 600)); }
      try { await api('sair', 'POST', {}); } catch (_) {}
      try { Object.keys(localStorage).filter(k => k === 'tf-usuario' || k.startsWith('tf-minhas-')).forEach(k => localStorage.removeItem(k)); } catch (_) {}
      window.location.href = 'entrar.html';
    };
    box.querySelector('#tf-sync').onclick = () => { if (E.erro) gravar(); };
    if (+E.usuario.dono_plataforma) {
      const bt = box.querySelector('#tf-contato'); bt.title = 'Painel Mercurium: Fale conosco e empresas';
      bt.innerHTML = '<i class="fa-solid fa-gauge-high"></i><span>Painel Mercurium</span><b class="tf-badge" id="tf-badge" hidden></b>';
      bt.onclick = () => { window.location.href = 'painel.html'; }; contarCaixa();
    } else box.querySelector('#tf-contato').remove();
    // rodapé discreto: o Fale conosco fica só aqui (o balão do canto é o Assistente Task Flow)
    const mw = document.querySelector('.main-wrap');
    if (mw && !document.getElementById('tf-rodape')) {
      const pe = document.createElement('footer'); pe.id = 'tf-rodape'; pe.className = 'tf-rodape';
      pe.innerHTML = '<span>Task Flow · Mercurium</span>';
      if (!+E.usuario.dono_plataforma) {
        const a = document.createElement('a'); a.href = '#'; a.id = 'tf-rodape-contato'; a.textContent = 'Fale conosco';
        a.onclick = ev => { ev.preventDefault(); abrirContato(); };
        pe.append(' · ', a);
      }
      mw.appendChild(pe);
    }
  }
  function abrirContato() {
    const fundo = document.createElement('div'); fundo.className = 'tf-imp-fundo';
    fundo.innerHTML = `<form class="tf-imp" role="dialog" aria-modal="true" aria-labelledby="tf-k-t" novalidate>
      <div class="tf-imp-ic"><i class="fa-regular fa-comment-dots"></i></div>
      <h3 id="tf-k-t">Fale conosco</h3>
      <p>Dúvida, problema ou sugestão? Respondemos no seu e-mail (<b></b>).</p>
      <label class="tf-k-campo">Assunto<select id="tf-k-assunto"><option>Dúvida</option><option>Problema no sistema</option><option>Sugestão</option><option>Comercial</option><option>Outro</option></select></label>
      <label class="tf-k-campo">Mensagem<textarea id="tf-k-msg" rows="5" placeholder="Conte o que precisa"></textarea></label>
      <div class="tf-imp-bt"><button type="button" class="btn-secondary" id="tf-k-nao">Cancelar</button><button type="submit" class="btn-primary"><i class="fa-solid fa-paper-plane"></i> Enviar</button></div></form>`;
    fundo.querySelector('p b').textContent = E.usuario.email;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    fundo.querySelector('#tf-k-nao').onclick = fechar;
    fundo.addEventListener('click', ev => { if (ev.target === fundo) fechar(); });
    fundo.querySelector('#tf-k-msg').focus();
    fundo.querySelector('form').onsubmit = async ev => {
      ev.preventDefault();
      const msg = fundo.querySelector('#tf-k-msg').value.trim();
      if (msg.length < 10) { aviso('Escreva um pouco mais sobre o que precisa.', 'warning'); return; }
      const b = ev.submitter || fundo.querySelector('[type=submit]'); b.disabled = true;
      try { const r = await api('fale-conosco', 'POST', { assunto: fundo.querySelector('#tf-k-assunto').value, mensagem: msg }); fechar(); aviso('✓ ' + r.mensagem, 'success'); }
      catch (e) { b.disabled = false; aviso(e.message, 'error'); }
    };
  }
  async function contarCaixa() {
    try { const r = await api('fale-conosco'); const b = document.getElementById('tf-badge'); if (b) { b.textContent = r.pendentes; b.hidden = !r.pendentes; } return r; } catch (_) { return null; }
  }
  function indicador(estado, msg) {
    const el = document.getElementById('tf-sync'); if (!el) return;
    el.className = 'tf-sync ' + (estado === 'ok' ? '' : estado);
    el.title = { ok: 'Tudo salvo no servidor', pendente: 'Alterações a salvar…', salvando: 'Salvando no servidor…', erro: 'Erro ao salvar: ' + (msg || '') + ' — clique para tentar de novo' }[estado];
  }
  window.addEventListener('beforeunload', ev => { if (E.salvando || E.erro || E.timer && document.querySelector('.tf-sync.pendente')) { ev.preventDefault(); ev.returnValue = ''; } });

  /* ── Início (chamado pelo inicio.js) ─────────── */
  async function iniciar() {
    try { E.usuario = (await api('eu')).usuario; try { localStorage.setItem('tf-usuario', JSON.stringify(E.usuario)); } catch (_) {} }
    catch (e) {
      if (!e.rede) return false;
      // sem internet: quem já entrou neste aparelho abre Minhas atividades com a última lista guardada
      let u = null; try { u = JSON.parse(localStorage.getItem('tf-usuario') || 'null'); } catch (_) {}
      if (u && window.tfMinhas) {
        E.usuario = u; E.semRede = true; window.save = function () {}; montarCabecalho();
        const ld = document.getElementById('loader'); if (ld) { ld.classList.add('hidden'); ld.style.display = 'none'; }
        tfMinhas.abrir();
        window.addEventListener('online', () => setTimeout(() => { if (!(tfMinhas.fila.itens || []).length) location.reload(); }, 1500));
        return false;
      }
      document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Sem conexão com o servidor. Verifique a internet e recarregue a página.</p>';
      return false;
    }
    await carregar();
    window.load = function () {};                                   // os dados já vêm do servidor
    window.save = function () { try { vincularAtividadesProjetos(); } catch (_) {} agendar(); };
    window.scheduleGistSave = function () {};                       // a cópia no Gist deixa de ser usada
    montarCabecalho();
    if (['encarregado', 'funcionario'].includes(E.usuario.perfil) && window.tfMinhas) setTimeout(() => tfMinhas.abrir(), 0);   // quem é do campo começa pelas suas atividades
    setTimeout(oferecerImportacao, 900);
    return true;
  }
  window.tfContato = () => abrirContato();
  window.tfServidor = { iniciar, recarregar: async () => { await carregar(); renderAll(); }, estado: E };
})();
