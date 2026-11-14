<?php
/* TaskFlow PRO · servidor · cadastro da empresa, login, convites e senha */
declare(strict_types=1);

/** POST /api/cadastro — "Cadastrar minha empresa". Quem cadastra vira administrador e já diz quem é quem. */
function rota_cadastro(): array {
    $d = corpo();
    $emp = is_array($d['empresa'] ?? null) ? $d['empresa'] : [];
    $adm = is_array($d['admin'] ?? null) ? $d['admin'] : [];
    $equipe = is_array($d['equipe'] ?? null) ? $d['equipe'] : [];
    if (count($equipe) > 500) throw new ErroApi('Equipe grande demais para um cadastro só');

    $nome_emp = campo($emp, 'nome', true, 160);
    $cnpj = campo($emp, 'cnpj', false, 18);
    if ($cnpj !== null) {
        $cnpj = preg_replace('/\D/', '', $cnpj);
        if (strlen($cnpj) !== 14) throw new ErroApi('CNPJ inválido');
        if (um('SELECT id FROM empresas WHERE cnpj = ?', [$cnpj])) throw new ErroApi('Já existe uma empresa cadastrada com este CNPJ', 409);
    }
    $adm_nome = campo($adm, 'nome', true, 160);
    $adm_email = email_valido($adm['email'] ?? '');
    $adm_senha = senha_valida($adm['senha'] ?? '');
    if (um('SELECT id FROM usuarios WHERE email = ?', [$adm_email])) throw new ErroApi('Este e-mail já tem cadastro. Faça login.', 409);

    // valida a equipe antes de gravar qualquer coisa
    $emails = [$adm_email => true];
    $pessoas = [];
    foreach ($equipe as $i => $p) {
        if (!is_array($p)) throw new ErroApi("Pessoa $i inválida");
        $perfil = $p['perfil'] ?? 'funcionario';
        if (!in_array($perfil, ['gestor', 'encarregado', 'funcionario'], true)) throw new ErroApi("Perfil inválido para " . ($p['nome'] ?? "pessoa $i"));
        $email = isset($p['email']) && trim((string)$p['email']) !== '' ? email_valido($p['email']) : null;
        if ($email !== null) {
            if (isset($emails[$email])) throw new ErroApi("E-mail repetido na equipe: $email");
            if (um('SELECT id FROM usuarios WHERE email = ?', [$email])) throw new ErroApi("O e-mail $email já tem cadastro no sistema", 409);
            $emails[$email] = true;
        }
        $tipo = $p['tipo_trabalho'] ?? 'campo';
        if (!in_array($tipo, ['campo', 'escritorio', 'ambos'], true)) $tipo = 'campo';
        $pessoas[] = ['nome' => campo($p, 'nome', true, 160), 'cargo' => campo($p, 'cargo', false, 80),
                      'equipe' => campo($p, 'equipe', false, 80), 'perfil' => $perfil, 'email' => $email, 'tipo' => $tipo];
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        q('INSERT INTO empresas (nome, razao_social, cnpj, telefone, cidade, uf) VALUES (?,?,?,?,?,?)', [
            $nome_emp, campo($emp, 'razao_social', false, 200), $cnpj, campo($emp, 'telefone', false, 30),
            campo($emp, 'cidade', false, 100), ($uf = campo($emp, 'uf', false, 2)) ? mb_strtoupper($uf) : null]);
        $eid = (int)$pdo->lastInsertId();

        $tok = token();
        q('INSERT INTO usuarios (empresa_id, nome, email, senha_hash, perfil, acao_token_hash, acao_tipo, acao_expira)
           VALUES (?,?,?,?, "administrador", ?, "confirmar_email", DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY))',
          [$eid, $adm_nome, $adm_email, password_hash($adm_senha, PASSWORD_DEFAULT), hash_token($tok)]);
        $uid = (int)$pdo->lastInsertId();
        q('UPDATE empresas SET cadastrada_por = ? WHERE id = ?', [$uid, $eid]);
        $admin = ['id' => $uid];

        // cópia do catálogo de NRs para a empresa (prazos da norma seguem travados)
        q('INSERT INTO tipos_documento (empresa_id, nr, nome, categoria, prazo_origem, prazo_valor, prazo_unidade, referencia,
                gatilho_afastamento_dias, gatilho_motivo, gatilho_referencia, observacao, bloqueia_alocacao, aviso_dias, substitui_id)
           SELECT ?, nr, nome, categoria, prazo_origem, prazo_valor, prazo_unidade, referencia,
                gatilho_afastamento_dias, gatilho_motivo, gatilho_referencia, observacao, bloqueia_alocacao, aviso_dias, id
           FROM tipos_documento WHERE empresa_id IS NULL AND ativo = 1', [$eid]);

        $convites = [];
        foreach ($pessoas as $p) {
            q('INSERT INTO funcionarios (empresa_id, nome, cargo, equipe, tipo_trabalho, email) VALUES (?,?,?,?,?,?)',
              [$eid, $p['nome'], $p['cargo'], $p['equipe'], $p['tipo'], $p['email']]);
            $fid = (int)$pdo->lastInsertId();
            if ($p['email'] !== null) $convites[] = criar_convite($admin, $eid, $p['nome'], $p['email'], $p['perfil'], $fid);
        }
        registrar($admin, $eid, 'empresas', $eid, 'criou', null, ['nome' => $nome_emp, 'equipe' => count($pessoas), 'convites' => count($convites)]);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }

    enviar_email($adm_email, 'Confirme seu e-mail no TaskFlow PRO',
        "Olá, $adm_nome.\n\nPara ativar o cadastro da $nome_emp, abra o link abaixo (vale 48 horas):\n" . link_app("/?confirmar=$tok") . "\n");
    foreach ($convites as $c) enviar_convite($c, $nome_emp);

    return ['ok' => true, 'empresa_id' => $eid, 'convites_enviados' => count($convites),
            'mensagem' => 'Cadastro feito. Enviamos um link de confirmação para o seu e-mail.'];
}

/** Cria um convite e devolve os dados para envio (o token só existe aqui, no banco fica o hash). */
function criar_convite(array $autor, int $eid, string $nome, string $email, string $perfil, ?int $fid): array {
    $tok = token();
    q('INSERT INTO convites (empresa_id, nome, email, perfil, funcionario_id, token_hash, criado_por, enviado_em, expira_em)
       VALUES (?,?,?,?,?,?,?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))',
      [$eid, $nome, $email, $perfil, $fid, hash_token($tok), $autor['id'], TF_CONVITE_DIAS]);
    return ['nome' => $nome, 'email' => $email, 'perfil' => $perfil, 'token' => $tok];
}
function enviar_convite(array $c, string $empresa): void {
    enviar_email($c['email'], "Convite para o TaskFlow PRO — $empresa",
        "Olá, {$c['nome']}.\n\nVocê foi convidado para o sistema de gestão da $empresa como {$c['perfil']}.\n" .
        "Crie sua senha neste link (vale " . TF_CONVITE_DIAS . " dias):\n" . link_app("/?convite={$c['token']}") . "\n");
}

/** POST /api/confirmar-email {token} */
function rota_confirmar_email(): array {
    $tok = campo(corpo(), 'token', true, 64);
    $u = um('SELECT id, empresa_id FROM usuarios WHERE acao_token_hash = ? AND acao_tipo = "confirmar_email" AND acao_expira > UTC_TIMESTAMP()', [hash_token($tok)]);
    if (!$u) throw new ErroApi('Link inválido ou vencido', 400);
    q('UPDATE usuarios SET email_confirmado_em = UTC_TIMESTAMP(), acao_token_hash = NULL, acao_tipo = NULL, acao_expira = NULL WHERE id = ?', [$u['id']]);
    q('UPDATE empresas SET situacao = "ativo" WHERE id = ? AND situacao = "teste"', [$u['empresa_id']]);
    return ['ok' => true, 'mensagem' => 'E-mail confirmado. Já pode entrar.'];
}

/** POST /api/entrar {email, senha} */
function rota_entrar(): array {
    $d = corpo();
    $email = mb_strtolower(trim((string)($d['email'] ?? '')));
    $senha = (string)($d['senha'] ?? '');
    $u = um('SELECT id, senha_hash, email_confirmado_em, tentativas_erradas, bloqueado_ate FROM usuarios WHERE email = ? AND excluido_em IS NULL', [$email]);
    $erro = new ErroApi('E-mail ou senha incorretos', 401);
    if (!$u) { password_hash($senha, PASSWORD_DEFAULT); throw $erro; } // gasta o mesmo tempo, para não revelar se o e-mail existe
    if ($u['bloqueado_ate'] && strtotime($u['bloqueado_ate'] . ' UTC') > time())
        throw new ErroApi('Muitas tentativas erradas. Tente de novo em ' . TF_BLOQUEIO_MIN . ' minutos.', 429);
    if (!$u['senha_hash'] || !password_verify($senha, $u['senha_hash'])) {
        $n = (int)$u['tentativas_erradas'] + 1;
        if ($n >= TF_MAX_TENTATIVAS) q('UPDATE usuarios SET tentativas_erradas = 0, bloqueado_ate = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE) WHERE id = ?', [TF_BLOQUEIO_MIN, $u['id']]);
        else q('UPDATE usuarios SET tentativas_erradas = ? WHERE id = ?', [$n, $u['id']]);
        throw $erro;
    }
    if (!$u['email_confirmado_em']) throw new ErroApi('Confirme seu e-mail antes de entrar (veja a caixa de entrada)', 403);
    if (password_needs_rehash($u['senha_hash'], PASSWORD_DEFAULT)) q('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [password_hash($senha, PASSWORD_DEFAULT), $u['id']]);
    q('UPDATE usuarios SET tentativas_erradas = 0, bloqueado_ate = NULL, ultimo_acesso = UTC_TIMESTAMP() WHERE id = ?', [$u['id']]);
    abrir_sessao((int)$u['id']);
    $me = um('SELECT id, empresa_id FROM usuarios WHERE id = ?', [$u['id']]);
    registrar(['id' => (int)$u['id']], (int)$me['empresa_id'], 'usuarios', (int)$u['id'], 'entrou');
    return ['ok' => true, 'usuario' => dados_eu((int)$u['id'])];
}

function dados_eu(int $id): array {
    return um('SELECT u.id, u.nome, u.email, u.perfil, u.funcionario_id, u.empresa_id, e.nome AS empresa
               FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE u.id = ?', [$id]);
}
function rota_eu(): array { $u = exigir_login(); return ['usuario' => dados_eu((int)$u['id'])]; }
function rota_sair(): array { fechar_sessao(); return ['ok' => true]; }

/** POST /api/convites — administrador convida alguém depois do cadastro */
function rota_convidar(): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador']);
    $d = corpo();
    $email = email_valido($d['email'] ?? '');
    $perfil = $d['perfil'] ?? '';
    if (!in_array($perfil, TF_PERFIS, true)) throw new ErroApi('Perfil inválido');
    if (um('SELECT id FROM usuarios WHERE email = ?', [$email])) throw new ErroApi('Este e-mail já tem cadastro', 409);
    $fid = isset($d['funcionario_id']) ? (int)$d['funcionario_id'] : null;
    if ($fid && !um('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ?', [$fid, $u['empresa_id']])) throw new ErroApi('Funcionário não encontrado', 404);
    $c = criar_convite($u, (int)$u['empresa_id'], campo($d, 'nome', true, 160), $email, $perfil, $fid);
    registrar($u, (int)$u['empresa_id'], 'convites', null, 'criou', null, ['email' => $email, 'perfil' => $perfil]);
    enviar_convite($c, $u['empresa_nome']);
    return ['ok' => true];
}

/** POST /api/convites/aceitar {token, nome?, senha} */
function rota_aceitar_convite(): array {
    $d = corpo();
    $c = um('SELECT * FROM convites WHERE token_hash = ? AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > UTC_TIMESTAMP()',
            [hash_token(campo($d, 'token', true, 64))]);
    if (!$c) throw new ErroApi('Convite inválido ou vencido. Peça um novo ao administrador.', 400);
    $senha = senha_valida($d['senha'] ?? '');
    if (um('SELECT id FROM usuarios WHERE email = ?', [$c['email']])) throw new ErroApi('Este e-mail já tem cadastro. Faça login.', 409);
    $pdo = db(); $pdo->beginTransaction();
    try {
        q('INSERT INTO usuarios (empresa_id, nome, email, senha_hash, perfil, funcionario_id, email_confirmado_em) VALUES (?,?,?,?,?,?, UTC_TIMESTAMP())',
          [$c['empresa_id'], $c['nome'], $c['email'], password_hash($senha, PASSWORD_DEFAULT), $c['perfil'], $c['funcionario_id']]);
        $uid = (int)$pdo->lastInsertId();
        q('UPDATE convites SET aceito_em = UTC_TIMESTAMP() WHERE id = ?', [$c['id']]);
        registrar(['id' => $uid], (int)$c['empresa_id'], 'usuarios', $uid, 'criou', null, ['via' => 'convite', 'perfil' => $c['perfil']]);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    abrir_sessao($uid);
    return ['ok' => true, 'usuario' => dados_eu($uid)];
}

/** POST /api/esqueci-senha {email} — responde igual exista ou não o e-mail */
function rota_esqueci_senha(): array {
    $email = mb_strtolower(trim((string)(corpo()['email'] ?? '')));
    $u = um('SELECT id, nome FROM usuarios WHERE email = ? AND excluido_em IS NULL AND email_confirmado_em IS NOT NULL', [$email]);
    if ($u) {
        $tok = token();
        q('UPDATE usuarios SET acao_token_hash = ?, acao_tipo = "redefinir_senha", acao_expira = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE id = ?', [hash_token($tok), $u['id']]);
        enviar_email($email, 'Redefinir sua senha do TaskFlow PRO',
            "Olá, {$u['nome']}.\n\nPara criar uma nova senha, abra o link (vale 1 hora):\n" . link_app("/?redefinir=$tok") . "\n\nSe não foi você, ignore este e-mail.\n");
    }
    return ['ok' => true, 'mensagem' => 'Se o e-mail tiver cadastro, enviamos um link para redefinir a senha.'];
}

/** POST /api/redefinir-senha {token, senha} — encerra todas as sessões abertas */
function rota_redefinir_senha(): array {
    $d = corpo();
    $u = um('SELECT id, empresa_id FROM usuarios WHERE acao_token_hash = ? AND acao_tipo = "redefinir_senha" AND acao_expira > UTC_TIMESTAMP()', [hash_token(campo($d, 'token', true, 64))]);
    if (!$u) throw new ErroApi('Link inválido ou vencido', 400);
    $senha = senha_valida($d['senha'] ?? '');
    q('UPDATE usuarios SET senha_hash = ?, acao_token_hash = NULL, acao_tipo = NULL, acao_expira = NULL, tentativas_erradas = 0, bloqueado_ate = NULL WHERE id = ?',
      [password_hash($senha, PASSWORD_DEFAULT), $u['id']]);
    q('DELETE FROM sessoes WHERE usuario_id = ?', [$u['id']]);
    registrar(['id' => (int)$u['id']], (int)$u['empresa_id'], 'usuarios', (int)$u['id'], 'alterou', null, ['senha' => 'redefinida']);
    return ['ok' => true, 'mensagem' => 'Senha alterada. Entre com a nova senha.'];
}
