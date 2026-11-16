<?php
/* Mercronos · servidor · painel da Mercurium (só para os donos da plataforma) */
declare(strict_types=1);

/** GET /api/painel/empresas — todas as empresas com os números de uso */
function rota_painel_empresas(): array {
    $u = exigir_dono();
    $lista = todos('
        SELECT e.id, e.nome, e.razao_social, e.cnpj, e.telefone, e.cidade, e.uf, e.plano, e.situacao, e.criado_em,
               a.nome AS admin_nome, a.email AS admin_email,
               (SELECT COUNT(*) FROM usuarios x WHERE x.empresa_id = e.id AND x.excluido_em IS NULL) AS usuarios,
               (SELECT COUNT(*) FROM usuarios x WHERE x.empresa_id = e.id AND x.excluido_em IS NULL AND x.desativado_em IS NULL AND x.email_confirmado_em IS NOT NULL) AS usuarios_ativos,
               (SELECT COUNT(*) FROM projetos x WHERE x.empresa_id = e.id AND x.excluido_em IS NULL) AS obras,
               (SELECT COUNT(*) FROM funcionarios x WHERE x.empresa_id = e.id AND x.excluido_em IS NULL) AS funcionarios,
               (SELECT COUNT(*) FROM fale_conosco x WHERE x.empresa_id = e.id) AS mensagens,
               GREATEST(COALESCE((SELECT MAX(x.ultimo_acesso) FROM usuarios x WHERE x.empresa_id = e.id), "1000-01-01"),
                        COALESCE((SELECT MAX(s.usado_em) FROM sessoes s JOIN usuarios x ON x.id = s.usuario_id WHERE x.empresa_id = e.id), "1000-01-01")) AS ultimo_acesso
        FROM empresas e LEFT JOIN usuarios a ON a.id = e.cadastrada_por
        WHERE e.excluido_em IS NULL ORDER BY e.criado_em DESC');
    foreach ($lista as &$e) {
        if (str_starts_with((string)$e['ultimo_acesso'], '1000-')) $e['ultimo_acesso'] = null;
        foreach (['usuarios', 'usuarios_ativos', 'obras', 'funcionarios', 'mensagens'] as $k) $e[$k] = (int)$e[$k];
        $e['sua'] = (int)$e['id'] === (int)$u['empresa_id'];
    }
    unset($e);
    return ['empresas' => $lista];
}

/** PATCH /api/painel/empresas/{id} {situacao: "ativo"|"suspenso"} ou {plano} — suspende/reativa o acesso ou muda o plano */
function rota_painel_empresa_situacao(int $id): array {
    $u = exigir_dono();
    $e = um('SELECT id, nome, situacao, plano FROM empresas WHERE id = ? AND excluido_em IS NULL', [$id]);
    if (!$e) throw new ErroApi('Empresa não encontrada', 404);
    $d = corpo();
    if (array_key_exists('plano', $d)) {
        $pl = (string)$d['plano']; if (!isset(TF_PLANOS[$pl])) throw new ErroApi('Plano inválido');
        q('UPDATE empresas SET plano = ? WHERE id = ?', [$pl, $id]);
        registrar($u, $id, 'empresas', $id, 'alterou', ['plano' => $e['plano']], ['plano' => $pl]);
        return ['ok' => true, 'plano' => $pl];
    }
    $nova = (string)($d['situacao'] ?? '');
    if (!in_array($nova, ['ativo', 'suspenso'], true)) throw new ErroApi('Situação inválida');
    if ($nova === 'suspenso' && $id === (int)$u['empresa_id']) throw new ErroApi('Você não pode suspender a sua própria empresa', 400);
    q('UPDATE empresas SET situacao = ? WHERE id = ?', [$nova, $id]);
    if ($nova === 'suspenso')   // encerra quem estiver logado agora
        q('DELETE s FROM sessoes s JOIN usuarios x ON x.id = s.usuario_id WHERE x.empresa_id = ?', [$id]);
    registrar($u, $id, 'empresas', $id, 'alterou', ['situacao' => $e['situacao']], ['situacao' => $nova]);
    return ['ok' => true, 'situacao' => $nova];
}
