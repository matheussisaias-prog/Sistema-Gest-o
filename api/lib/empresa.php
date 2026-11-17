<?php
/* Aprumo · servidor · tela "Empresa e usuários": usuários (perfil, desativar/reativar, link de nova senha), convites por
   e-mail ou link para WhatsApp, dados da empresa, calendário padrão, regras do campo e plano (uso e limites).
   Só o administrador altera; o gestor vê. */
declare(strict_types=1);

/* ── Planos (limites; o plano da empresa é definido pela Mercurium no painel) ── */
const TF_PLANOS = [
    'teste'        => ['nome' => 'Teste grátis', 'preco' => null, 'obras' => 10, 'escritorio' => 5, 'gb' => 5, 'gestao_vista' => true],
    'essencial'    => ['nome' => 'Essencial', 'preco' => 297, 'obras' => 3, 'escritorio' => 2, 'gb' => 10, 'gestao_vista' => true],
    'profissional' => ['nome' => 'Profissional', 'preco' => 697, 'obras' => 10, 'escritorio' => 5, 'gb' => 50, 'gestao_vista' => true],
    'empresa'      => ['nome' => 'Empresa', 'preco' => 1497, 'obras' => 30, 'escritorio' => 15, 'gb' => 200, 'gestao_vista' => true],
    'corporativo'  => ['nome' => 'Corporativo', 'preco' => null, 'obras' => null, 'escritorio' => null, 'gb' => null, 'gestao_vista' => true],
];
const TF_ESCRITORIO = ['administrador', 'gestor'];
function plano_da_empresa(int $eid): array {
    $k = (string)(um('SELECT plano FROM empresas WHERE id = ?', [$eid])['plano'] ?? 'teste');
    return ['id' => isset(TF_PLANOS[$k]) ? $k : 'teste'] + (TF_PLANOS[$k] ?? TF_PLANOS['teste']);
}
/** Usuários de escritório que contam no plano: ativos + convites em aberto. */
function escritorio_em_uso(int $eid, ?int $semUsuario = null, ?int $semConvite = null): int {
    $u = (int)um("SELECT COUNT(*) AS n FROM usuarios WHERE empresa_id = ? AND excluido_em IS NULL AND desativado_em IS NULL AND perfil IN ('administrador','gestor')" . ($semUsuario ? ' AND id <> ' . $semUsuario : ''), [$eid])['n'];
    $c = (int)um("SELECT COUNT(*) AS n FROM convites WHERE empresa_id = ? AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > UTC_TIMESTAMP() AND perfil IN ('administrador','gestor')" . ($semConvite ? ' AND id <> ' . $semConvite : ''), [$eid])['n'];
    return $u + $c;
}
function exigir_vaga_escritorio(int $eid, string $perfil, ?int $semUsuario = null, ?int $semConvite = null): void {
    if (!in_array($perfil, TF_ESCRITORIO, true)) return;
    $p = plano_da_empresa($eid); if ($p['escritorio'] === null) return;
    if (escritorio_em_uso($eid, $semUsuario, $semConvite) + 1 > $p['escritorio'])
        throw new ErroApi("O plano {$p['nome']} permite {$p['escritorio']} usuários de escritório (administrador e gestor). Desative alguém ou fale com a Mercurium para mudar de plano.", 409);
}

/* ── Regras do campo ───────────────────────────────────────────── */
const TF_REGRAS_PADRAO = ['foto' => 'funcionario', 'comentario_concluir' => false, 'travou_email' => true, 'rdo_prazo' => 1, 'rdo_lembrete' => true, 'rdo_assinatura' => true,
    // metas dos indicadores (tela Gráficos e indicadores)
    'meta_ppc' => 80, 'meta_idp' => 0.95, 'meta_idc' => 0.95, 'meta_destravar' => 2, 'meta_conformidade' => 100, 'meta_retrabalho' => 95];
const TF_METAS = ['meta_ppc' => ['PPC', 10, 100], 'meta_idp' => ['IDP', 0.5, 1.2], 'meta_idc' => ['IDC', 0.5, 1.2], 'meta_destravar' => ['Tempo para destravar', 0.5, 30],
                  'meta_conformidade' => ['Conformidade SST', 50, 100], 'meta_retrabalho' => ['Atividades sem retrabalho', 50, 100]];
const TF_FOTO_OPCOES = ['ninguem' => [], 'funcionario' => ['funcionario'], 'campo' => ['funcionario', 'encarregado'], 'todos' => ['funcionario', 'encarregado', 'gestor', 'administrador']];
function empresa_regras(int $eid): array {
    static $cache = [];
    if (isset($cache[$eid])) return $cache[$eid];
    $r = json_decode((string)(um('SELECT regras FROM empresas WHERE id = ?', [$eid])['regras'] ?? ''), true);
    return $cache[$eid] = array_merge(TF_REGRAS_PADRAO, is_array($r) ? array_intersect_key($r, TF_REGRAS_PADRAO) : []);
}
function foto_obrigatoria_para(array $u): bool { return in_array($u['perfil'], TF_FOTO_OPCOES[empresa_regras((int)$u['empresa_id'])['foto']] ?? ['funcionario'], true); }

/* ── Telefone (login de quem não tem e-mail) ─────────────────────── */
function tel_norm(?string $t): ?string {
    $d = preg_replace('/\D/', '', (string)$t);
    if ($d === '') return null;
    if (strlen($d) >= 12 && str_starts_with($d, '55')) $d = substr($d, 2);
    if (strlen($d) === 11 && $d[0] === '0') $d = substr($d, 1);
    if (strlen($d) < 10 || strlen($d) > 11) throw new ErroApi('Telefone inválido: use DDD + número (ex.: 81 99876-5432)');
    return $d;
}
function tel_fmt(?string $d): ?string {
    if (!$d) return null;
    return strlen($d) === 11 ? sprintf('(%s) %s-%s', substr($d, 0, 2), substr($d, 2, 5), substr($d, 7)) : sprintf('(%s) %s-%s', substr($d, 0, 2), substr($d, 2, 4), substr($d, 6));
}
const TF_PERFIL_NOME = ['administrador' => 'Administrador', 'gestor' => 'Gestor', 'encarregado' => 'Encarregado', 'funcionario' => 'Funcionário'];

/* ══ Usuários ════════════════════════════════════════════════════ */
function exigir_admin(): array { $u = exigir_login(); exigir_perfil($u, ['administrador']); return $u; }
function usuario_da_empresa(array $u, int $id): array {
    $x = um('SELECT * FROM usuarios WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$x) throw new ErroApi('Usuário não encontrado', 404);
    return $x;
}
/** GET /api/empresa/usuarios — usuários, convites em aberto, fichas da Equipe sem acesso e o limite do plano. */
function rota_empresa_usuarios(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id'];
    $U = todos('SELECT u.id, u.nome, u.email, u.telefone, u.perfil, u.funcionario_id, u.desativado_em, f.cargo,
                       GREATEST(COALESCE(u.ultimo_acesso, "1000-01-01"), COALESCE((SELECT MAX(s.usado_em) FROM sessoes s WHERE s.usuario_id = u.id), "1000-01-01")) AS acesso
                FROM usuarios u LEFT JOIN funcionarios f ON f.id = u.funcionario_id
                WHERE u.empresa_id = ? AND u.excluido_em IS NULL AND u.email_confirmado_em IS NOT NULL ORDER BY u.desativado_em IS NOT NULL, u.nome', [$eid]);
    $C = todos('SELECT c.id, c.nome, c.email, c.telefone, c.canal, c.perfil, c.funcionario_id, c.enviado_em, c.expira_em, f.cargo FROM convites c LEFT JOIN funcionarios f ON f.id = c.funcionario_id
                WHERE c.empresa_id = ? AND c.aceito_em IS NULL AND c.cancelado_em IS NULL ORDER BY c.enviado_em DESC', [$eid]);
    $fichas = todos('SELECT f.id, f.nome, f.cargo, f.telefone, f.email FROM funcionarios f WHERE f.empresa_id = ? AND f.excluido_em IS NULL AND f.ativo = 1
                     AND NOT EXISTS (SELECT 1 FROM usuarios x WHERE x.funcionario_id = f.id AND x.excluido_em IS NULL)
                     AND NOT EXISTS (SELECT 1 FROM convites c WHERE c.funcionario_id = f.id AND c.aceito_em IS NULL AND c.cancelado_em IS NULL AND c.expira_em > UTC_TIMESTAMP()) ORDER BY f.nome', [$eid]);
    $pl = plano_da_empresa($eid); $ag = gmdate('Y-m-d H:i:s');
    $loc = fn($d) => $d && !str_starts_with((string)$d, '1000-') ? gmdate('Y-m-d H:i:s', strtotime($d . ' UTC') - 3 * 3600) : null;
    $usuarios = array_map(fn($x) => ['id' => (int)$x['id'], 'nome' => $x['nome'], 'email' => $x['email'], 'telefone' => tel_fmt($x['telefone']), 'perfil' => $x['perfil'], 'cargo' => $x['cargo'],
        'funcionario_id' => $x['funcionario_id'] ? (int)$x['funcionario_id'] : null, 'situacao' => $x['desativado_em'] ? 'desativado' : 'ativo',
        'desativado_em' => $loc($x['desativado_em']), 'ultimo_acesso' => $loc($x['acesso']), 'eu' => (int)$x['id'] === (int)$u['id']], $U);
    $convites = array_map(fn($c) => ['id' => (int)$c['id'], 'nome' => $c['nome'], 'email' => $c['email'], 'telefone' => tel_fmt($c['telefone']), 'canal' => $c['canal'], 'perfil' => $c['perfil'], 'cargo' => $c['cargo'],
        'enviado_em' => $loc($c['enviado_em']), 'vencido' => $c['expira_em'] <= $ag, 'expira_em' => $loc($c['expira_em'])], $C);
    $ativos = array_filter($usuarios, fn($x) => $x['situacao'] === 'ativo');
    return ['pode_editar' => $u['perfil'] === 'administrador', 'eu' => (int)$u['id'], 'usuarios' => $usuarios, 'convites' => $convites,
            'fichas' => array_map(fn($f) => ['id' => (int)$f['id'], 'nome' => $f['nome'], 'cargo' => $f['cargo'], 'telefone' => tel_fmt($f['telefone']), 'email' => $f['email']], $fichas),
            'plano' => ['nome' => $pl['nome'], 'escritorio' => $pl['escritorio']],
            'indicadores' => ['escritorio' => escritorio_em_uso($eid), 'campo' => count(array_filter($ativos, fn($x) => !in_array($x['perfil'], TF_ESCRITORIO, true))),
                'convites' => count(array_filter($convites, fn($c) => !$c['vencido'])), 'desativados' => count($usuarios) - count($ativos)]];
}
/** PATCH /api/usuarios/{id} {perfil?, funcionario_id?} */
function rota_usuario_alterar(int $id): array {
    $u = exigir_admin(); $x = usuario_da_empresa($u, $id); $eid = (int)$u['empresa_id']; $d = corpo(); $c = [];
    if (array_key_exists('perfil', $d)) {
        $p = (string)$d['perfil']; if (!in_array($p, TF_PERFIS, true)) throw new ErroApi('Perfil inválido');
        if ($p !== $x['perfil']) {
            if ($id === (int)$u['id']) throw new ErroApi('Você não pode mudar o seu próprio perfil (peça a outro administrador)', 400);
            if (!in_array($x['perfil'], TF_ESCRITORIO, true) && !$x['desativado_em']) exigir_vaga_escritorio($eid, $p, $id);
            $c['perfil'] = $p;
        }
    }
    if (array_key_exists('funcionario_id', $d)) {
        $fid = $d['funcionario_id'] ? (int)$d['funcionario_id'] : null;
        if ($fid && !um('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$fid, $eid])) throw new ErroApi('Ficha da Equipe não encontrada', 404);
        if ($fid && um('SELECT id FROM usuarios WHERE funcionario_id = ? AND id <> ? AND excluido_em IS NULL', [$fid, $id])) throw new ErroApi('Esta ficha já está ligada a outro usuário', 409);
        $c['funcionario_id'] = $fid;
    }
    if (!$c) return ['ok' => true];
    atualizar('usuarios', $id, $c);
    registrar($u, $eid, 'usuarios', $id, 'alterou', array_intersect_key($x, $c), $c);
    return ['ok' => true];
}
/** POST /api/usuarios/{id}/desativar — tira o acesso na hora (encerra as sessões); o nome fica nos registros. */
function rota_usuario_desativar(int $id): array {
    $u = exigir_admin(); $x = usuario_da_empresa($u, $id);
    if ($id === (int)$u['id']) throw new ErroApi('Você não pode desativar a si mesmo', 400);
    if ($x['desativado_em']) return ['ok' => true];
    q('UPDATE usuarios SET desativado_em = UTC_TIMESTAMP(), acao_token_hash = NULL, acao_tipo = NULL, acao_expira = NULL WHERE id = ?', [$id]);
    q('DELETE FROM sessoes WHERE usuario_id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'usuarios', $id, 'alterou', ['situacao' => 'ativo'], ['situacao' => 'desativado', 'nome' => $x['nome']]);
    return ['ok' => true];
}
/** POST /api/usuarios/{id}/reativar */
function rota_usuario_reativar(int $id): array {
    $u = exigir_admin(); $x = usuario_da_empresa($u, $id);
    if (!$x['desativado_em']) return ['ok' => true];
    exigir_vaga_escritorio((int)$u['empresa_id'], $x['perfil'], $id);
    q('UPDATE usuarios SET desativado_em = NULL, tentativas_erradas = 0, bloqueado_ate = NULL WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'usuarios', $id, 'alterou', ['situacao' => 'desativado'], ['situacao' => 'ativo', 'nome' => $x['nome']]);
    return ['ok' => true];
}
/** POST /api/usuarios/{id}/link-senha — link de nova senha (24 h) para mandar pelo WhatsApp (quem entra pelo telefone não recebe e-mail). */
function rota_usuario_link_senha(int $id): array {
    $u = exigir_admin(); $x = usuario_da_empresa($u, $id);
    if ($x['desativado_em']) throw new ErroApi('Reative o usuário antes de gerar a nova senha', 400);
    $tok = token();
    q('UPDATE usuarios SET acao_token_hash = ?, acao_tipo = "redefinir_senha", acao_expira = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR) WHERE id = ?', [hash_token($tok), $id]);
    registrar($u, (int)$u['empresa_id'], 'usuarios', $id, 'alterou', null, ['link_senha' => 'gerado', 'nome' => $x['nome']]);
    $link = link_app("/entrar.html?redefinir=$tok"); $p = explode(' ', trim($x['nome']))[0];
    $msg = "Olá, $p! Para criar uma nova senha do Aprumo da {$u['empresa_nome']}, toque no link (vale por 24 horas): $link";
    return ['ok' => true, 'link' => $link, 'mensagem' => $msg, 'whatsapp' => wa_link($x['telefone'], $msg)];
}
function wa_link(?string $tel, string $msg): string { return 'https://wa.me/' . ($tel ? '55' . $tel : '') . '?text=' . rawurlencode($msg); }

/* ══ Convites ════════════════════════════════════════════════════ */
function convite_mensagem(string $nome, string $empresa, string $quem, string $perfil, string $link, ?string $loginTel): string {
    $p = explode(' ', trim($nome))[0];
    return "Olá, $p! $quem convidou você para o Aprumo da $empresa, como " . mb_strtolower(TF_PERFIL_NOME[$perfil]) . '. Toque no link para criar sua senha (vale por ' . TF_CONVITE_DIAS . ' dias): ' . $link
        . ($loginTel ? ' Depois, para entrar, use o número ' . tel_fmt($loginTel) . ' e a senha que você criar.' : '');
}
/** Envia (e-mail) ou devolve o link pronto para o WhatsApp. */
function convite_entregar(array $u, array $c, string $tok): array {
    $link = link_app("/entrar.html?convite=$tok");
    if ($c['canal'] === 'email') { enviar_email($c['email'], email_convite($c['nome'], $u['empresa_nome'], $u['nome'], $c['perfil'], $link, TF_CONVITE_DIAS)); return ['ok' => true, 'id' => (int)$c['id'], 'canal' => 'email']; }
    $msg = convite_mensagem($c['nome'], $u['empresa_nome'], $u['nome'], $c['perfil'], $link, $c['email'] ? null : $c['telefone']);
    return ['ok' => true, 'id' => (int)$c['id'], 'canal' => 'whatsapp', 'link' => $link, 'mensagem' => $msg, 'whatsapp' => wa_link($c['telefone'], $msg)];
}
/** POST /api/convites {nome, perfil, canal: email|whatsapp, email?, telefone?, funcionario_id?} */
function rota_convidar(): array {
    $u = exigir_admin(); $eid = (int)$u['empresa_id']; $d = corpo();
    $nome = campo($d, 'nome', true, 160);
    $perfil = (string)($d['perfil'] ?? ''); if (!in_array($perfil, TF_PERFIS, true)) throw new ErroApi('Perfil inválido');
    $canal = (string)($d['canal'] ?? 'email'); if (!in_array($canal, ['email', 'whatsapp'], true)) throw new ErroApi('Escolha como enviar: e-mail ou WhatsApp');
    $email = trim((string)($d['email'] ?? '')) !== '' ? email_valido($d['email']) : null;
    $tel = tel_norm($d['telefone'] ?? null);
    if ($canal === 'email' && !$email) throw new ErroApi('Informe o e-mail (ou envie o link pelo WhatsApp)');
    if ($canal === 'whatsapp' && !$email && !$tel) throw new ErroApi('Sem e-mail, informe o celular: é com ele que a pessoa vai entrar');
    if ($email && um('SELECT id FROM usuarios WHERE email = ? AND excluido_em IS NULL', [$email])) throw new ErroApi('Este e-mail já tem cadastro', 409);
    if ($tel && um('SELECT id FROM usuarios WHERE telefone = ? AND excluido_em IS NULL', [$tel])) throw new ErroApi('Este celular já é usado por outro usuário', 409);
    $fid = !empty($d['funcionario_id']) ? (int)$d['funcionario_id'] : null;
    if ($fid && !um('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$fid, $eid])) throw new ErroApi('Ficha da Equipe não encontrada', 404);
    if ($fid && um('SELECT id FROM usuarios WHERE funcionario_id = ? AND excluido_em IS NULL', [$fid])) throw new ErroApi('Esta pessoa da Equipe já tem acesso', 409);
    // convite antigo em aberto para o mesmo e-mail/celular/ficha (desta empresa) é substituído
    $velhos = todos('SELECT id FROM convites WHERE empresa_id = ? AND aceito_em IS NULL AND cancelado_em IS NULL AND ((email IS NOT NULL AND email = ?) OR (telefone IS NOT NULL AND telefone = ?) OR (funcionario_id IS NOT NULL AND funcionario_id = ?))', [$eid, $email, $tel, $fid]);
    if ($email && um('SELECT id FROM convites WHERE email = ? AND empresa_id <> ? AND aceito_em IS NULL AND cancelado_em IS NULL AND expira_em > UTC_TIMESTAMP()', [$email, $eid])) throw new ErroApi('Este e-mail tem um convite em aberto de outra empresa', 409);
    exigir_vaga_escritorio($eid, $perfil, null, null);
    foreach ($velhos as $v) q('UPDATE convites SET cancelado_em = UTC_TIMESTAMP() WHERE id = ?', [$v['id']]);
    $tok = token();
    $id = inserir('convites', ['empresa_id' => $eid, 'nome' => $nome, 'email' => $email, 'telefone' => $tel, 'canal' => $canal, 'perfil' => $perfil, 'funcionario_id' => $fid,
        'token_hash' => hash_token($tok), 'criado_por' => $u['id'], 'enviado_em' => gmdate('Y-m-d H:i:s'), 'expira_em' => gmdate('Y-m-d H:i:s', time() + TF_CONVITE_DIAS * 86400)]);
    registrar($u, $eid, 'convites', $id, 'criou', null, ['nome' => $nome, 'perfil' => $perfil, 'canal' => $canal]);
    return convite_entregar($u, um('SELECT * FROM convites WHERE id = ?', [$id]), $tok);
}
function convite_da_empresa(array $u, int $id): array {
    $c = um('SELECT * FROM convites WHERE id = ? AND empresa_id = ? AND aceito_em IS NULL AND cancelado_em IS NULL', [$id, $u['empresa_id']]);
    if (!$c) throw new ErroApi('Convite não encontrado (já aceito ou cancelado)', 404);
    return $c;
}
/** POST /api/convites/{id}/reenviar — link novo (o anterior deixa de valer) e mais 7 dias. */
function rota_convite_reenviar(int $id): array {
    $u = exigir_admin(); $c = convite_da_empresa($u, $id); $tok = token();
    q('UPDATE convites SET token_hash = ?, enviado_em = UTC_TIMESTAMP(), expira_em = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY) WHERE id = ?', [hash_token($tok), TF_CONVITE_DIAS, $id]);
    registrar($u, (int)$u['empresa_id'], 'convites', $id, 'alterou', null, ['reenviado' => $c['canal'], 'nome' => $c['nome']]);
    return convite_entregar($u, um('SELECT * FROM convites WHERE id = ?', [$id]), $tok);
}
/** PATCH /api/convites/{id} {perfil} */
function rota_convite_alterar(int $id): array {
    $u = exigir_admin(); $c = convite_da_empresa($u, $id);
    $p = (string)(corpo()['perfil'] ?? ''); if (!in_array($p, TF_PERFIS, true)) throw new ErroApi('Perfil inválido');
    if ($p === $c['perfil']) return ['ok' => true];
    if (!in_array($c['perfil'], TF_ESCRITORIO, true)) exigir_vaga_escritorio((int)$u['empresa_id'], $p, null, $id);
    q('UPDATE convites SET perfil = ? WHERE id = ?', [$p, $id]);
    registrar($u, (int)$u['empresa_id'], 'convites', $id, 'alterou', ['perfil' => $c['perfil']], ['perfil' => $p]);
    return ['ok' => true];
}
/** DELETE /api/convites/{id} */
function rota_convite_cancelar(int $id): array {
    $u = exigir_admin(); $c = convite_da_empresa($u, $id);
    q('UPDATE convites SET cancelado_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'convites', $id, 'excluiu', ['nome' => $c['nome'], 'perfil' => $c['perfil']]);
    return ['ok' => true];
}
/** GET /api/convites/info?token= — para a página do convite dizer quem convidou e com o que a pessoa vai entrar. */
function rota_convite_info(): array {
    $c = um('SELECT c.nome, c.email, c.telefone, c.perfil, e.nome AS empresa FROM convites c JOIN empresas e ON e.id = c.empresa_id
             WHERE c.token_hash = ? AND c.aceito_em IS NULL AND c.cancelado_em IS NULL AND c.expira_em > UTC_TIMESTAMP()', [hash_token((string)($_GET['token'] ?? ''))]);
    if (!$c) throw new ErroApi('Convite inválido ou vencido. Peça um novo ao administrador.', 400);
    return ['nome' => $c['nome'], 'empresa' => $c['empresa'], 'perfil' => TF_PERFIL_NOME[$c['perfil']], 'entrar_com' => $c['email'] ?: tel_fmt($c['telefone']), 'por_telefone' => !$c['email']];
}

/* ══ Dados da empresa ════════════════════════════════════════════ */
function empresa_dados(int $eid): array {
    $e = um('SELECT nome, razao_social, cnpj, telefone, endereco, cidade, uf, email_contato, site, logo, logo_cor, plano, situacao FROM empresas WHERE id = ?', [$eid]);
    $cnpj = $e['cnpj'] && strlen($e['cnpj']) === 14 ? preg_replace('/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/', '$1.$2.$3/$4-$5', $e['cnpj']) : $e['cnpj'];
    return ['nome' => $e['nome'], 'razao_social' => $e['razao_social'], 'cnpj' => $cnpj, 'telefone' => $e['telefone'], 'endereco' => $e['endereco'], 'cidade' => $e['cidade'], 'uf' => $e['uf'],
            'email_contato' => $e['email_contato'], 'site' => $e['site'], 'tem_logo' => (bool)$e['logo'], 'logo_cor' => $e['logo_cor'] ?: '#0f3d6e'];
}
/** GET|PATCH /api/empresa */
function rota_empresa(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id'];
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'PATCH') {
        exigir_perfil($u, ['administrador']); $d = corpo(); $c = [];
        foreach (['nome' => 160, 'razao_social' => 200, 'telefone' => 30, 'endereco' => 200, 'cidade' => 100, 'site' => 120] as $k => $max)
            if (array_key_exists($k, $d)) $c[$k] = $k === 'nome' ? campo($d, 'nome', true, $max) : campo($d, $k, false, $max);
        if (array_key_exists('nome', $c) && !$c['nome']) throw new ErroApi('Informe o nome da empresa');
        if (array_key_exists('uf', $d)) { $uf = strtoupper(trim((string)$d['uf'])); if ($uf !== '' && !preg_match('/^[A-Z]{2}$/', $uf)) throw new ErroApi('UF inválida'); $c['uf'] = $uf ?: null; }
        if (array_key_exists('email_contato', $d)) $c['email_contato'] = trim((string)$d['email_contato']) !== '' ? email_valido($d['email_contato']) : null;
        if (array_key_exists('cnpj', $d)) {
            $n = preg_replace('/\D/', '', (string)$d['cnpj']);
            if ($n !== '' && strlen($n) !== 14) throw new ErroApi('O CNPJ precisa ter 14 números');
            if ($n !== '' && um('SELECT id FROM empresas WHERE cnpj = ? AND id <> ?', [$n, $eid])) throw new ErroApi('Este CNPJ já está cadastrado em outra empresa', 409);
            $c['cnpj'] = $n ?: null;
        }
        if (!$c) throw new ErroApi('Nada para alterar');
        $antes = empresa_dados($eid);
        atualizar('empresas', $eid, $c);
        registrar($u, $eid, 'empresas', $eid, 'alterou', array_intersect_key($antes, $c), $c);
    }
    $pl = plano_da_empresa($eid);
    return ['pode_editar' => $u['perfil'] === 'administrador', 'empresa' => empresa_dados($eid), 'regras' => empresa_regras($eid), 'plano' => $pl['nome']];
}
/** PUT /api/empresa/regras */
function rota_empresa_regras(): array {
    $u = exigir_admin(); $eid = (int)$u['empresa_id']; $d = corpo(); $r = empresa_regras($eid); $antes = $r;
    if (array_key_exists('foto', $d)) { if (!isset(TF_FOTO_OPCOES[$d['foto']])) throw new ErroApi('Opção de foto inválida'); $r['foto'] = $d['foto']; }
    foreach (['comentario_concluir', 'travou_email', 'rdo_lembrete', 'rdo_assinatura'] as $k) if (array_key_exists($k, $d)) $r[$k] = (bool)$d[$k];
    if (array_key_exists('rdo_prazo', $d)) { $n = (int)$d['rdo_prazo']; if ($n < 1 || $n > 5) throw new ErroApi('Prazo do RDO: de 1 a 5 dias úteis'); $r['rdo_prazo'] = $n; }
    foreach (TF_METAS as $k => [$nome, $min, $max]) if (array_key_exists($k, $d)) {
        $v = (float)str_replace(',', '.', (string)$d[$k]); if ($v < $min || $v > $max) throw new ErroApi("Meta de $nome: entre " . str_replace('.', ',', (string)$min) . ' e ' . str_replace('.', ',', (string)$max));
        $r[$k] = round($v, 2); }
    q('UPDATE empresas SET regras = ? WHERE id = ?', [json_encode($r), $eid]);
    registrar($u, $eid, 'empresas', $eid, 'alterou', ['regras' => array_diff_assoc($antes, $r)], ['regras' => array_diff_assoc($r, $antes)]);
    return ['ok' => true, 'regras' => $r];
}

/* ══ Calendário padrão ═══════════════════════════════════════════ */
function empresa_calendario_id(int $eid): ?int { $c = um('SELECT calendario_id FROM empresas WHERE id = ?', [$eid]); return $c && $c['calendario_id'] ? (int)$c['calendario_id'] : null; }
/** Obras que seguem o padrão: sem calendário próprio, ou com o próprio calendário padrão. */
function obras_do_padrao(int $eid, ?int $cid): array {
    return todos('SELECT id, codigo, nome FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao <> "Arquivado" AND (calendario_id IS NULL' . ($cid ? ' OR calendario_id = ' . $cid : '') . ') ORDER BY codigo', [$eid]);
}
/** Atividades ainda não iniciadas que mudariam de fim com o calendário $cal. */
function calendario_afetadas(int $eid, array $obras, Calendario $cal): array {
    $out = [];
    foreach ($obras as $p) foreach (todos('SELECT id, inicio, fim, duracao_dias FROM atividades WHERE projeto_id = ? AND excluido_em IS NULL AND inicio IS NOT NULL AND duracao_dias IS NOT NULL AND avanco = 0
            AND NOT EXISTS (SELECT 1 FROM atividades f WHERE f.pai_id = atividades.id AND f.excluido_em IS NULL)', [$p['id']]) as $a) {
        $f = $cal->fim($a['inicio'], (float)$a['duracao_dias']); if ($f !== $a['fim']) $out[] = ['id' => (int)$a['id'], 'projeto_id' => (int)$p['id'], 'fim' => $f];
    }
    return $out;
}
/** GET|PUT /api/empresa/calendario {horas_semana[7], feriados_nacionais, dias[], simular?} */
function rota_empresa_calendario(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id']; $cid = empresa_calendario_id($eid);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'PUT') {
        exigir_perfil($u, ['administrador']); $d = corpo();
        $c = validar_calendario($d + ['nome' => 'Padrão da empresa']);
        $dias = is_array($d['dias'] ?? null) ? array_values($d['dias']) : [];
        if (count($dias) > 200) throw new ErroApi('Feriados demais (até 200)');
        foreach ($dias as $x) {   // confere tudo antes de gravar
            $l = limpar((array)$x, ['inicio' => ['data'], 'fim' => ['data'], 'tipo' => ['lista', ['feriado', 'parado']], 'nome' => ['texto', 120], 'todo_ano' => ['bool']]);
            if (empty($l['inicio']) || empty($l['nome'])) throw new ErroApi('Cada feriado ou dia parado precisa de data e nome');
            if (!empty($l['fim']) && $l['fim'] < $l['inicio']) throw new ErroApi('Dia parado com fim antes do início');
        }
        $obras = obras_do_padrao($eid, $cid);
        $novo = new Calendario(json_decode($c['horas_semana'] ?? '[8,8,8,8,8,0,0]', true), (bool)($c['feriados_nacionais'] ?? 1),
            array_map(fn($x) => ['inicio' => (string)($x['inicio'] ?? ''), 'fim' => (string)($x['fim'] ?? $x['inicio'] ?? ''), 'todo_ano' => !empty($x['todo_ano'])], array_filter($dias, fn($x) => !empty($x['inicio']))));
        $af = calendario_afetadas($eid, $obras, $novo);
        if (!empty($d['simular'])) return ['ok' => true, 'mudam' => count($af), 'obras' => count(array_unique(array_column($af, 'projeto_id')))];
        if (!$cid) { $cid = inserir('calendarios', ['empresa_id' => $eid, 'dono_id' => null, 'nome' => 'Padrão da empresa'] + $c); q('UPDATE empresas SET calendario_id = ? WHERE id = ?', [$cid, $eid]); }
        else atualizar('calendarios', $cid, $c);
        gravar_dias_calendario($cid, $dias);
        foreach ($af as $a) q('UPDATE atividades SET fim = ? WHERE id = ?', [$a['fim'], $a['id']]);
        $mov = []; foreach (array_unique(array_column($af, 'projeto_id')) as $pid) $mov = array_merge($mov, recalcular_obra((int)$pid, $eid));
        registrar($u, $eid, 'calendarios', $cid, 'alterou', null, ['padrao' => true, 'horas_semana' => $c['horas_semana'] ?? null, 'dias' => count($dias), 'atividades' => count($af)]);
        return ['ok' => true, 'mudaram' => count($af), 'movidas' => count($mov)];
    }
    $c = $cid ? um('SELECT * FROM calendarios WHERE id = ?', [$cid]) : null; $ano = (int)gmdate('Y');
    return ['pode_editar' => $u['perfil'] === 'administrador', 'horas_semana' => $c ? json_decode($c['horas_semana'], true) : [8, 8, 8, 8, 8, 0, 0],
            'feriados_nacionais' => $c ? (bool)$c['feriados_nacionais'] : true,
            'dias' => $cid ? array_map(fn($x) => ['inicio' => $x['inicio'], 'fim' => $x['fim'], 'tipo' => $x['tipo'], 'nome' => $x['nome'], 'todo_ano' => (bool)$x['todo_ano']], todos('SELECT * FROM calendario_dias WHERE calendario_id = ? ORDER BY inicio', [$cid])) : [],
            'nacionais' => Calendario::feriadosNacionais($ano), 'ano' => $ano, 'obras' => count(obras_do_padrao($eid, $cid))];
}

/* ══ Plano ═══════════════════════════════════════════════════════ */
function tamanho_pasta(string $dir): int {
    if (!is_dir($dir)) return 0; $t = 0;
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $f) if ($f->isFile()) $t += $f->getSize();
    return $t;
}
/** GET /api/empresa/plano — plano contratado e o que já está em uso. */
function rota_empresa_plano(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id']; $p = plano_da_empresa($eid);
    $e = um('SELECT situacao, criado_em FROM empresas WHERE id = ?', [$eid]);
    $obras = (int)um("SELECT COUNT(*) AS n FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao = 'Em andamento'", [$eid])['n'];
    $campo = (int)um("SELECT COUNT(*) AS n FROM usuarios WHERE empresa_id = ? AND excluido_em IS NULL AND desativado_em IS NULL AND email_confirmado_em IS NOT NULL AND perfil IN ('encarregado','funcionario')", [$eid])['n'];
    $bytes = tamanho_pasta(pasta_arquivos() . '/' . $eid);
    return ['plano' => ['id' => $p['id'], 'nome' => $p['nome'], 'preco' => $p['preco'], 'gestao_vista' => $p['gestao_vista']], 'situacao' => $e['situacao'], 'cliente_desde' => substr($e['criado_em'], 0, 10),
            'uso' => ['obras' => [$obras, $p['obras']], 'escritorio' => [escritorio_em_uso($eid), $p['escritorio']], 'campo' => [$campo, null], 'espaco_gb' => [round($bytes / 1073741824, 2), $p['gb']]],
            'planos' => array_map(fn($k, $x) => ['id' => $k] + $x, array_keys(TF_PLANOS), TF_PLANOS)];
}
