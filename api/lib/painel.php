<?php
/* Aprumo · servidor · painel da Mercurium (só para os donos da plataforma)
   A empresa marcada como "plataforma" é a da administração: fica fora das listas e dos números de uso. */
declare(strict_types=1);

/** Ids das empresas da administração. Enquanto nenhuma estiver marcada, vale a empresa de quem está no painel. */
function painel_empresas_plataforma(array $u): array {
    $ids = array_map('intval', array_column(todos('SELECT id FROM empresas WHERE plataforma = 1 AND excluido_em IS NULL'), 'id'));
    return $ids ?: [(int)$u['empresa_id']];
}
function painel_in(array $ids): string { return implode(',', array_map('intval', $ids)) ?: '0'; }

/** GET /api/painel/empresas — empresas clientes com os números de uso, e a empresa da administração à parte */
function rota_painel_empresas(): array {
    $u = exigir_dono();
    $plat = painel_empresas_plataforma($u); $fora = painel_in($plat);
    $lista = todos("
        SELECT e.id, e.nome, e.razao_social, e.cnpj, e.telefone, e.cidade, e.uf, e.plano, e.situacao, e.plataforma, e.criado_em,
               a.nome AS admin_nome, a.email AS admin_email,
               (SELECT COUNT(*) FROM usuarios x WHERE x.empresa_id = e.id AND x.excluido_em IS NULL) AS usuarios,
               (SELECT COUNT(*) FROM usuarios x WHERE x.empresa_id = e.id AND x.excluido_em IS NULL AND x.desativado_em IS NULL AND x.email_confirmado_em IS NOT NULL) AS usuarios_ativos,
               (SELECT COUNT(*) FROM projetos x WHERE x.empresa_id = e.id AND x.excluido_em IS NULL) AS obras,
               (SELECT COUNT(*) FROM funcionarios x WHERE x.empresa_id = e.id AND x.excluido_em IS NULL) AS funcionarios,
               (SELECT COUNT(*) FROM fale_conosco x WHERE x.empresa_id = e.id) AS mensagens,
               (SELECT COUNT(DISTINCT x.usuario_id) FROM acessos x WHERE x.empresa_id = e.id AND x.dia >= DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) - INTERVAL 6 DAY) AS pessoas_7d,
               (SELECT COALESCE(SUM(x.visitas), 0) FROM acessos x WHERE x.empresa_id = e.id AND x.dia >= DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) - INTERVAL 29 DAY) AS acessos_30d,
               GREATEST(COALESCE((SELECT MAX(x.ultimo_acesso) FROM usuarios x WHERE x.empresa_id = e.id), '1000-01-01'),
                        COALESCE((SELECT MAX(s.usado_em) FROM sessoes s JOIN usuarios x ON x.id = s.usuario_id WHERE x.empresa_id = e.id), '1000-01-01'),
                        COALESCE((SELECT MAX(x.ultimo) FROM acessos x WHERE x.empresa_id = e.id), '1000-01-01')) AS ultimo_acesso
        FROM empresas e LEFT JOIN usuarios a ON a.id = e.cadastrada_por
        WHERE e.excluido_em IS NULL ORDER BY e.criado_em DESC");
    $clientes = []; $adm = null;
    foreach ($lista as $e) {
        if (str_starts_with((string)$e['ultimo_acesso'], '1000-')) $e['ultimo_acesso'] = null;
        foreach (['usuarios', 'usuarios_ativos', 'obras', 'funcionarios', 'mensagens', 'pessoas_7d', 'acessos_30d', 'plataforma'] as $k) $e[$k] = (int)$e[$k];
        $e['sua'] = (int)$e['id'] === (int)$u['empresa_id'];
        if (in_array((int)$e['id'], $plat, true)) { if ($e['sua'] || !$adm) $adm = $e; }
        else $clientes[] = $e;
    }
    if ($adm) $adm['dados'] = painel_contar_dados((int)$adm['id']);
    return ['empresas' => $clientes, 'plataforma' => $adm];
}

/** Quanto de dado de uso (obras, equipe, recursos…) a empresa tem — para saber se há teste a limpar */
function painel_contar_dados(int $eid): array {
    $c = fn(string $t) => (int)(um("SELECT COUNT(*) AS n FROM $t WHERE empresa_id = ?", [$eid])['n'] ?? 0);
    $d = ['obras' => $c('projetos'), 'atividades' => $c('atividades'), 'funcionarios' => $c('funcionarios'), 'recursos' => $c('recursos'),
          'rdos' => $c('rdos'), 'relatorios' => $c('relatorios'), 'fotos' => $c('fotos'), 'modelos' => $c('modelos_cronograma'),
          'fornecedores' => $c('fornecedores')];
    $d['outros_usuarios'] = count(array_filter(todos('SELECT email FROM usuarios WHERE empresa_id = ?', [$eid]), fn($x) => !eh_dono_plataforma($x['email'])));
    $d['total'] = array_sum($d);
    return $d;
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
    if ($nova === 'suspenso' && in_array($id, array_merge(painel_empresas_plataforma($u), [(int)$u['empresa_id']]), true)) throw new ErroApi('Você não pode suspender a empresa da administração', 400);
    q('UPDATE empresas SET situacao = ? WHERE id = ?', [$nova, $id]);
    if ($nova === 'suspenso')   // encerra quem estiver logado agora
        q('DELETE s FROM sessoes s JOIN usuarios x ON x.id = s.usuario_id WHERE x.empresa_id = ?', [$id]);
    registrar($u, $id, 'empresas', $id, 'alterou', ['situacao' => $e['situacao']], ['situacao' => $nova]);
    return ['ok' => true, 'situacao' => $nova];
}

/** GET /api/painel/acessos?dias=7|30|90&empresa= — quem entrou, quantas vezes, por dia (só empresas clientes) */
function rota_painel_acessos(): array {
    $u = exigir_dono();
    $dias = (int)($_GET['dias'] ?? 30); if (!in_array($dias, [7, 30, 90], true)) $dias = 30;
    $emp = (int)($_GET['empresa'] ?? 0);
    $fora = painel_in(painel_empresas_plataforma($u));
    $hoje = (string)um('SELECT DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) AS d')['d'];
    $ini = date('Y-m-d', strtotime("$hoje -" . ($dias - 1) . ' days'));
    $filtro = "a.empresa_id NOT IN ($fora)" . ($emp ? ' AND a.empresa_id = ' . $emp : '');

    $porDia = []; foreach (todos("SELECT a.dia, COUNT(DISTINCT a.usuario_id) AS pessoas, SUM(a.visitas) AS acessos, SUM(a.entradas) AS entradas
                                  FROM acessos a WHERE $filtro AND a.dia >= ? GROUP BY a.dia", [$ini]) as $r) $porDia[$r['dia']] = $r;
    $serie = [];
    for ($t = strtotime($ini); $t <= strtotime($hoje); $t += 86400) {
        $d = date('Y-m-d', $t); $r = $porDia[$d] ?? null;
        $serie[] = ['dia' => $d, 'pessoas' => (int)($r['pessoas'] ?? 0), 'acessos' => (int)($r['acessos'] ?? 0)];
    }
    $tot = um("SELECT COUNT(DISTINCT a.usuario_id) AS pessoas, COALESCE(SUM(a.visitas), 0) AS acessos, COALESCE(SUM(a.entradas), 0) AS entradas,
                      COUNT(DISTINCT a.empresa_id) AS empresas,
                      COUNT(DISTINCT CASE WHEN a.celular = 1 THEN a.usuario_id END) AS celular,
                      COUNT(DISTINCT CASE WHEN a.computador = 1 THEN a.usuario_id END) AS computador
               FROM acessos a WHERE $filtro AND a.dia >= ?", [$ini]);
    $hojeN = um("SELECT COUNT(DISTINCT a.usuario_id) AS n FROM acessos a WHERE $filtro AND a.dia = ?", [$hoje]);
    $uFiltro = "u.empresa_id NOT IN ($fora)" . ($emp ? ' AND u.empresa_id = ' . $emp : '');
    $cadastrados = um("SELECT COUNT(*) AS n FROM usuarios u JOIN empresas e ON e.id = u.empresa_id WHERE $uFiltro AND u.excluido_em IS NULL AND e.excluido_em IS NULL")['n'];
    $empTotal = um("SELECT COUNT(*) AS n FROM empresas e WHERE e.excluido_em IS NULL AND e.id NOT IN ($fora)" . ($emp ? ' AND e.id = ' . $emp : ''))['n'];

    // Pessoas: quem entrou no período e quem ainda não entrou (cadastrado mas sem acesso)
    $pessoas = todos("
        SELECT u.id, u.nome, u.email, u.perfil, u.desativado_em, u.email_confirmado_em, e.id AS empresa_id, e.nome AS empresa,
               COALESCE(SUM(a.visitas), 0) AS acessos, COUNT(a.dia) AS dias, MAX(a.celular) AS celular, MAX(a.computador) AS computador,
               (SELECT MAX(x.ultimo) FROM acessos x WHERE x.usuario_id = u.id) AS ultimo, u.ultimo_acesso, u.criado_em
        FROM usuarios u JOIN empresas e ON e.id = u.empresa_id
        LEFT JOIN acessos a ON a.usuario_id = u.id AND a.dia >= ?
        WHERE $uFiltro AND u.excluido_em IS NULL AND e.excluido_em IS NULL
        GROUP BY u.id ORDER BY ultimo IS NULL, ultimo DESC, u.nome", [$ini]);
    foreach ($pessoas as &$p) {
        $p['ultimo'] = $p['ultimo'] ?: $p['ultimo_acesso'];
        foreach (['acessos', 'dias', 'celular', 'computador', 'empresa_id'] as $k) $p[$k] = (int)$p[$k];
        $p['situacao'] = $p['desativado_em'] ? 'desativado' : (!$p['email_confirmado_em'] ? 'convite' : 'ativo');
        unset($p['desativado_em'], $p['email_confirmado_em'], $p['ultimo_acesso']);
    }
    unset($p);
    // Uso real no período: o que as empresas clientes registraram no sistema
    $h = "h.empresa_id NOT IN ($fora)" . ($emp ? ' AND h.empresa_id = ' . $emp : '');
    $uso = um("SELECT COUNT(*) AS acoes FROM historico h WHERE $h AND h.acao <> 'entrou' AND h.quando >= ?", [$ini . ' 03:00:00']);
    return [
        'dias' => $dias, 'inicio' => $ini, 'hoje' => $hoje, 'serie' => $serie,
        'resumo' => ['hoje' => (int)$hojeN['n'], 'pessoas' => (int)$tot['pessoas'], 'acessos' => (int)$tot['acessos'], 'entradas' => (int)$tot['entradas'],
                     'empresas_ativas' => (int)$tot['empresas'], 'empresas' => (int)$empTotal, 'cadastrados' => (int)$cadastrados,
                     'celular' => (int)$tot['celular'], 'computador' => (int)$tot['computador'],
                     'acoes' => (int)($uso['acoes'] ?? 0)],
        'pessoas' => $pessoas,
    ];
}

/** Apaga de vez tudo o que pertence à empresa. $manter = ids de usuários que ficam (a empresa também fica).
    Devolve quantas linhas saíram de cada tabela. */
function painel_apagar_empresa(int $eid, array $manter): array {
    $pdo = db(); $cont = [];
    $manterSql = painel_in($manter ?: [0]);
    $tabelas = ['acessos', 'avisos', 'mensagens', 'historico', 'fale_conosco', 'custos', 'plano_semanal', 'ocorrencias', 'apontamentos', 'fotos',
                'avancos', 'relatorios', 'rdos', 'atividade_recursos', 'recurso_paradas', 'recurso_controles', 'locacoes', 'fornecedores', 'recursos',
                'documentos_funcionario', 'exigencias_documento', 'tipos_documento', 'ausencias', 'linhas_base', 'dependencias', 'atividades',
                'dispositivos_obra', 'projeto_membros', 'projetos', 'modelos_cronograma', 'calendarios', 'convites', 'funcionarios'];
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $pdo->beginTransaction();
    try {
        q('DELETE c FROM calendario_dias c JOIN calendarios k ON k.id = c.calendario_id WHERE k.empresa_id = ?', [$eid]);
        q('DELETE i FROM linha_base_itens i JOIN linhas_base l ON l.id = i.linha_base_id WHERE l.empresa_id = ?', [$eid]);
        q('DELETE p FROM rdo_presencas p JOIN rdos r ON r.id = p.rdo_id WHERE r.empresa_id = ?', [$eid]);
        q("DELETE s FROM sessoes s JOIN usuarios x ON x.id = s.usuario_id WHERE x.empresa_id = ? AND x.id NOT IN ($manterSql)", [$eid]);
        foreach ($tabelas as $t) {
            $sql = $t === 'acessos' ? "DELETE FROM acessos WHERE empresa_id = ? AND usuario_id NOT IN ($manterSql)" : "DELETE FROM $t WHERE empresa_id = ?";
            $n = q($sql, [$eid])->rowCount(); if ($n) $cont[$t] = $n;
        }
        $n = q("DELETE FROM usuarios WHERE empresa_id = ? AND id NOT IN ($manterSql)", [$eid])->rowCount(); if ($n) $cont['usuarios'] = $n;
        if ($manter) q('UPDATE usuarios SET funcionario_id = NULL WHERE empresa_id = ?', [$eid]);
        if ($manter) q('UPDATE empresas SET calendario_id = NULL WHERE id = ?', [$eid]);
        else q('DELETE FROM empresas WHERE id = ?', [$eid]);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); $pdo->exec('SET FOREIGN_KEY_CHECKS = 1'); throw $e; }
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    // arquivos (fotos, documentos, logo) — guardados por empresa fora da pasta pública
    try {
        $logo = $manter ? (string)(um('SELECT logo FROM empresas WHERE id = ?', [$eid])['logo'] ?? '') : '';
        painel_apagar_pasta(pasta_arquivos() . '/' . $eid, $logo !== '' ? pasta_arquivos() . '/' . $logo : '');
    } catch (Throwable $e) { error_log('[Aprumo painel] arquivos: ' . $e->getMessage()); }
    return $cont;
}
function painel_apagar_pasta(string $dir, string $manter = ''): void {
    if (!is_dir($dir)) return;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $f) {
        $p = $f->getPathname();
        if ($manter !== '' && ($p === $manter || str_starts_with($manter, $p . '/'))) continue;
        $f->isDir() ? @rmdir($p) : @unlink($p);
    }
    if ($manter === '' || !str_starts_with($manter, $dir . '/')) @rmdir($dir);
}

/** DELETE /api/painel/empresas/{id} {confirmar: "<nome da empresa>"} — exclui de vez uma empresa cliente e tudo dela */
function rota_painel_empresa_excluir(int $id): array {
    $u = exigir_dono();
    $e = um('SELECT id, nome, plataforma FROM empresas WHERE id = ?', [$id]);
    if (!$e) throw new ErroApi('Empresa não encontrada', 404);
    if ((int)$e['plataforma'] || $id === (int)$u['empresa_id'] || in_array($id, painel_empresas_plataforma($u), true))
        throw new ErroApi('A empresa da administração não pode ser excluída. Use "Apagar dados de teste".', 400);
    if (mb_strtolower(trim((string)(corpo()['confirmar'] ?? ''))) !== mb_strtolower(trim($e['nome'])))
        throw new ErroApi('Para excluir, digite o nome da empresa exatamente como aparece.', 400);
    $cont = painel_apagar_empresa($id, []);
    registrar($u, (int)$u['empresa_id'], 'empresas', $id, 'excluiu', ['nome' => $e['nome']], null);
    return ['ok' => true, 'apagados' => $cont];
}

/** POST /api/painel/plataforma/limpar {confirmar: "APAGAR"} — a empresa de quem está no painel vira a da administração:
    apaga obras, equipe, recursos e qualquer usuário que não seja dono da plataforma. Os donos continuam entrando. */
function rota_painel_plataforma_limpar(): array {
    $u = exigir_dono();
    if (trim((string)(corpo()['confirmar'] ?? '')) !== 'APAGAR') throw new ErroApi('Para apagar, digite APAGAR.', 400);
    $eid = (int)$u['empresa_id'];
    $donos = array_map('intval', array_column(array_filter(todos('SELECT id, email FROM usuarios WHERE empresa_id = ?', [$eid]), fn($x) => eh_dono_plataforma($x['email'])), 'id'));
    if (!in_array((int)$u['id'], $donos, true)) $donos[] = (int)$u['id'];
    $cont = painel_apagar_empresa($eid, $donos);
    q('UPDATE empresas SET plataforma = 1, situacao = "ativo" WHERE id = ?', [$eid]);
    registrar($u, $eid, 'empresas', $eid, 'alterou', null, ['limpeza' => $cont]);
    return ['ok' => true, 'apagados' => $cont];
}

/** DELETE /api/fale-conosco/{id} — apaga uma mensagem (ex.: teste) */
function rota_fale_conosco_excluir(int $id): array {
    exigir_dono();
    $n = q('DELETE FROM fale_conosco WHERE id = ?', [$id])->rowCount();
    if (!$n) throw new ErroApi('Mensagem não encontrada', 404);
    return ['ok' => true];
}
