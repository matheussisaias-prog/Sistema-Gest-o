/* TaskFlow PRO · entrar.js — login, cadastro da empresa, convite, senha e confirmação de e-mail */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
  const cadastro = { empresa: {}, admin: {} };
  let tokenSenha = null, modoSenha = null;

  /* ── API ─────────────────────────────────────── */
  async function api(rota, dados, metodo) {
    const op = { method: metodo || (dados ? 'POST' : 'GET'), credentials: 'same-origin', headers: {} };
    if (dados) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(dados); }
    let r;
    try { r = await fetch('api/' + rota, op); }
    catch (_) { throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.'); }
    let j = {};
    try { j = await r.json(); } catch (_) {}
    if (!r.ok) { const e = new Error(j.erro || 'Algo deu errado. Tente de novo.'); e.status = r.status; throw e; }
    return j;
  }

  /* ── Telas ───────────────────────────────────── */
  function ir(nome) {
    avisar();
    $$('.passo').forEach(s => { s.hidden = s.id !== 'v-' + nome; });
    $('.cartao').classList.toggle('largo', nome === 'cadastro-3');
    const alvo = $('#v-' + nome);
    const foco = alvo && alvo.querySelector('input:not([type=hidden])');
    if (foco && window.innerWidth > 860) setTimeout(() => foco.focus(), 30);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function avisar(msg, tipo) {
    const a = $('#aviso');
    if (!msg) { a.hidden = true; a.textContent = ''; return; }
    a.className = 'aviso ' + (tipo || 'erro');
    a.innerHTML = '<i class="fa-solid ' + (tipo === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation') + '"></i><span></span>';
    a.querySelector('span').textContent = msg;
    a.hidden = false;
  }
  function ocupado(botao, sim) {
    botao.disabled = sim;
    if (sim) { botao.dataset.txt = botao.innerHTML; botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Aguarde…</span>'; }
    else if (botao.dataset.txt) botao.innerHTML = botao.dataset.txt;
  }
  function marcarErro(el, msg) { el.classList.add('erro'); el.focus(); avisar(msg); return false; }
  function limparErros(form) { $$('.erro', form).forEach(e => e.classList.remove('erro')); avisar(); }
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  /* ── Detalhes de campo ───────────────────────── */
  $$('.olho').forEach(b => b.addEventListener('click', () => {
    const i = b.previousElementSibling; const ver = i.type === 'password';
    i.type = ver ? 'text' : 'password';
    b.innerHTML = '<i class="fa-regular ' + (ver ? 'fa-eye-slash' : 'fa-eye') + '"></i>';
  }));
  function forca(s) {
    let n = 0; if (s.length >= 8) n++; if (s.length >= 12) n++;
    if (/[A-Z]/.test(s) && /[a-z]/.test(s)) n++; if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) n++;
    return s ? Math.max(1, n) : 0;
  }
  $$('input[autocomplete=new-password]').forEach(i => i.addEventListener('input', () => {
    const f = i.closest('.campo').querySelector('.forca'); if (f) f.dataset.n = forca(i.value);
  }));
  $('#c-uf').innerHTML = '<option value="">—</option>' + UFS.map(u => `<option>${u}</option>`).join('');
  $('#c-cnpj').addEventListener('input', e => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 14);
    e.target.value = d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  });
  $('#c-tel').addEventListener('input', e => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = d.length > 10 ? d.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
      : d.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/^(\d{2})(\d{0,4})$/, '($1) $2');
  });
  $$('[data-ir]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); ir(b.dataset.ir); }));

  /* ── Entrar ──────────────────────────────────── */
  $('#f-entrar').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; limparErros(f);
    const email = $('#e-email'), senha = $('#e-senha');
    if (!emailOk(email.value)) return marcarErro(email, 'Digite um e-mail válido.');
    if (!senha.value) return marcarErro(senha, 'Digite a senha.');
    const b = f.querySelector('button[type=submit]'); ocupado(b, true);
    try {
      await api('entrar', { email: email.value.trim(), senha: senha.value });
      window.location.href = destino();
    } catch (err) { avisar(err.message); senha.select(); }
    finally { ocupado(b, false); }
  });

  /* ── Cadastro: empresa ───────────────────────── */
  $('#f-empresa').addEventListener('submit', e => {
    e.preventDefault(); const f = e.target; limparErros(f);
    const nome = $('#c-nome'), cnpj = $('#c-cnpj');
    if (!nome.value.trim()) return marcarErro(nome, 'Informe o nome da empresa.');
    if (cnpj.value && cnpj.value.replace(/\D/g, '').length !== 14) return marcarErro(cnpj, 'O CNPJ precisa ter 14 números.');
    cadastro.empresa = { nome: nome.value.trim(), razao_social: $('#c-razao').value.trim(), cnpj: cnpj.value,
      telefone: $('#c-tel').value, cidade: $('#c-cidade').value.trim(), uf: $('#c-uf').value };
    ir('cadastro-2');
  });

  /* ── Cadastro: administrador ─────────────────── */
  $('#f-admin').addEventListener('submit', e => {
    e.preventDefault(); const f = e.target; limparErros(f);
    const nome = $('#a-nome'), email = $('#a-email'), senha = $('#a-senha');
    if (!nome.value.trim()) return marcarErro(nome, 'Informe seu nome.');
    if (!emailOk(email.value)) return marcarErro(email, 'Digite um e-mail válido.');
    if (senha.value.length < 8) return marcarErro(senha, 'A senha precisa ter pelo menos 8 caracteres.');
    cadastro.admin = { nome: nome.value.trim(), email: email.value.trim(), senha: senha.value };
    if (!$$('.pessoa').length) { novaPessoa(); novaPessoa(); }
    ir('cadastro-3');
  });

  /* ── Cadastro: equipe ────────────────────────── */
  function novaPessoa(d) {
    const n = $('#t-pessoa').content.firstElementChild.cloneNode(true);
    if (d) { n.querySelector('.p-nome').value = d.nome || ''; n.querySelector('.p-cargo').value = d.cargo || '';
      n.querySelector('.p-perfil').value = d.perfil || 'funcionario'; n.querySelector('.p-email').value = d.email || ''; }
    n.querySelector('.p-remover').addEventListener('click', () => n.remove());
    $('#equipe').appendChild(n);
    return n;
  }
  $('#add-pessoa').addEventListener('click', () => { const n = novaPessoa(); n.querySelector('.p-nome').focus(); });

  $('#concluir').addEventListener('click', async e => {
    const b = e.currentTarget; avisar(); $$('#equipe .erro').forEach(x => x.classList.remove('erro'));
    const equipe = [], vistos = new Set([cadastro.admin.email.toLowerCase()]);
    for (const p of $$('.pessoa')) {
      const nome = p.querySelector('.p-nome'), email = p.querySelector('.p-email');
      const temAlgo = nome.value.trim() || p.querySelector('.p-cargo').value.trim() || email.value.trim();
      if (!temAlgo) continue;                                   // linha vazia é ignorada
      if (!nome.value.trim()) return marcarErro(nome, 'Falta o nome de uma pessoa da equipe.');
      if (email.value.trim()) {
        if (!emailOk(email.value)) return marcarErro(email, 'E-mail inválido para ' + nome.value.trim() + '.');
        const k = email.value.trim().toLowerCase();
        if (vistos.has(k)) return marcarErro(email, 'Este e-mail aparece duas vezes.');
        vistos.add(k);
      }
      equipe.push({ nome: nome.value.trim(), cargo: p.querySelector('.p-cargo').value.trim(),
        perfil: p.querySelector('.p-perfil').value, email: email.value.trim() || null });
    }
    ocupado(b, true);
    try {
      const r = await api('cadastro', { empresa: cadastro.empresa, admin: cadastro.admin, equipe });
      const conv = r.convites_enviados;
      $('#feito-texto').textContent = `Enviamos um link para ${cadastro.admin.email} ativar o cadastro (vale 48 horas).` +
        (conv ? ` ${conv} ${conv === 1 ? 'pessoa da equipe recebeu' : 'pessoas da equipe receberam'} o convite para criar a senha.` : '');
      ir('feito');
    } catch (err) {
      avisar(err.message);
      if (/CNPJ/.test(err.message)) ir('cadastro-1'), avisar(err.message);
      else if (/e-mail já tem cadastro/i.test(err.message) && !/equipe|O e-mail /.test(err.message)) ir('cadastro-2'), avisar(err.message);
    } finally { ocupado(b, false); }
  });

  /* ── Esqueci a senha ─────────────────────────── */
  $('#f-esqueci').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; limparErros(f);
    const email = $('#r-email');
    if (!emailOk(email.value)) return marcarErro(email, 'Digite um e-mail válido.');
    const b = f.querySelector('button[type=submit]'); ocupado(b, true);
    try { const r = await api('esqueci-senha', { email: email.value.trim() }); ir('entrar'); avisar(r.mensagem, 'ok'); }
    catch (err) { avisar(err.message); }
    finally { ocupado(b, false); }
  });

  /* ── Nova senha (convite / redefinir) ────────── */
  $('#f-senha').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; limparErros(f);
    const s1 = $('#n-senha'), s2 = $('#n-senha2');
    if (s1.value.length < 8) return marcarErro(s1, 'A senha precisa ter pelo menos 8 caracteres.');
    if (s1.value !== s2.value) return marcarErro(s2, 'As duas senhas não são iguais.');
    const b = f.querySelector('button[type=submit]'); ocupado(b, true);
    try {
      if (modoSenha === 'convite') { await api('convites/aceitar', { token: tokenSenha, senha: s1.value }); window.location.href = 'index.html'; return; }
      const r = await api('redefinir-senha', { token: tokenSenha, senha: s1.value });
      history.replaceState(null, '', 'entrar.html'); ir('entrar'); avisar(r.mensagem, 'ok');
    } catch (err) { avisar(err.message); }
    finally { ocupado(b, false); }
  });

  /* ── Fale conosco ────────────────────────────── */
  $('#f-contato').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; limparErros(f);
    const nome = $('#k-nome'), email = $('#k-email'), msg = $('#k-msg');
    if (!nome.value.trim()) return marcarErro(nome, 'Informe seu nome.');
    if (!emailOk(email.value)) return marcarErro(email, 'Digite um e-mail válido para a resposta.');
    if (msg.value.trim().length < 10) return marcarErro(msg, 'Escreva um pouco mais sobre o que precisa.');
    const b = f.querySelector('button[type=submit]'); ocupado(b, true);
    try {
      const r = await api('fale-conosco', { nome: nome.value.trim(), email: email.value.trim(), assunto: $('#k-assunto').value, mensagem: msg.value.trim(), site: $('#k-site').value });
      f.reset(); ir('entrar'); avisar(r.mensagem, 'ok');
    } catch (err) { avisar(err.message); }
    finally { ocupado(b, false); }
  });

  // para onde ir depois de entrar: só destinos conhecidos (nada de endereço vindo de fora)
  function destino() { return new URLSearchParams(location.search).get('voltar') === 'painel' ? 'painel.html' : 'index.html'; }

  /* ── Início: links que chegam por e-mail ─────── */
  async function iniciar() {
    const q = new URLSearchParams(location.search);
    if (q.get('confirmar')) {
      ir('confirmando');
      try { const r = await api('confirmar-email', { token: q.get('confirmar') }); history.replaceState(null, '', 'entrar.html'); ir('entrar'); avisar(r.mensagem, 'ok'); }
      catch (err) { history.replaceState(null, '', 'entrar.html'); ir('entrar'); avisar(err.message); }
      return;
    }
    if (q.get('convite') || q.get('redefinir')) {
      modoSenha = q.get('convite') ? 'convite' : 'redefinir'; tokenSenha = q.get('convite') || q.get('redefinir');
      $('#senha-titulo').textContent = modoSenha === 'convite' ? 'Criar sua senha' : 'Nova senha';
      $('#senha-sub').textContent = modoSenha === 'convite' ? 'Você foi convidado para o sistema. Crie uma senha para entrar.'
        : 'Crie uma nova senha. Os aparelhos conectados com a senha antiga serão desconectados.';
      ir('senha'); return;
    }
    if (location.hash === '#cadastro') { ir('cadastro-1'); return; }
    if (location.hash === '#contato') { ir('contato'); return; }
    ir('entrar');
    try { await api('eu'); window.location.href = destino(); } catch (_) { /* não está logado: fica no login */ }
  }
  window.addEventListener('hashchange', () => {
    if (location.hash === '#contato') ir('contato');
    else if (location.hash === '#cadastro') ir('cadastro-1');
  });
  iniciar();
})();
