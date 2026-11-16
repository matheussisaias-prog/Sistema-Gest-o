<?php
/* Aprumo · servidor · tela Obras: resumo de cada obra (avanço real × previsto, farol, atrasos, equipe, NR) */
declare(strict_types=1);

/** Fração do período já decorrida em $hoje (0 a 1), contando dias corridos com início e fim inclusos. */
function fracao_prevista(?string $ini, ?string $fim, string $hoje): ?float {
    if (!$ini || !$fim) return null;
    if ($hoje < $ini) return 0.0;
    if ($hoje >= $fim) return 1.0;
    $t = (strtotime($fim) - strtotime($ini)) / 86400 + 1;
    $d = (strtotime($hoje) - strtotime($ini)) / 86400 + 1;
    return $t > 0 ? min(1.0, max(0.0, $d / $t)) : 1.0;
}

/** Farol de uma obra em andamento: diferença (pontos) entre previsto e real, ou prazo final vencido. */
function farol_obra(array $p, float $real, ?float $prev, string $hoje): ?string {
    if ($p['situacao'] !== 'Em andamento') return null;
    if ($p['fim'] && $p['fim'] < $hoje && $real < 100) return 'vermelho';
    if ($prev === null) return 'verde';
    $dif = $prev - $real;
    return $dif > 15 ? 'vermelho' : ($dif > 5 ? 'amarelo' : 'verde');
}

/** GET /api/obras/resumo — tudo o que a tela Obras mostra, já calculado. */
function rota_obras_resumo(): array {
    $u = exigir_login();
    if ($u['perfil'] === 'funcionario') throw new ErroApi('Esta tela é da gestão das obras', 403);
    $eid = (int)$u['empresa_id'];
    $hoje = gmdate('Y-m-d', time() - 3 * 3600);   // dia de hoje no Brasil (UTC−3)
    $vis = obras_visiveis($u);
    if ($vis === []) return ['obras' => [], 'hoje' => $hoje];
    $filtro = $vis === null ? '' : ' AND p.id IN (' . implode(',', array_map('intval', $vis)) . ')';
    $obras = todos("SELECT p.id, p.codigo, p.nome, p.descricao, p.tipo_servico, p.cliente, p.numero_contrato, p.local_obra,
                           p.gestor_id, COALESCE(g.nome, p.gestor_nome) AS gestor, p.rt_funcionario_id, rt.nome AS rt_nome, rt.cargo AS rt_cargo,
                           p.art_numero, p.situacao, p.inicio, p.fim, p.cor, p.valor_contrato, p.atualizado_em
                    FROM projetos p
                    LEFT JOIN usuarios g ON g.id = p.gestor_id
                    LEFT JOIN funcionarios rt ON rt.id = p.rt_funcionario_id
                    WHERE p.empresa_id = ? AND p.excluido_em IS NULL$filtro ORDER BY p.nome", [$eid]);
    if (!$obras) return ['obras' => [], 'hoje' => $hoje];
    $ids = implode(',', array_map(fn($o) => (int)$o['id'], $obras));

    $ativ = todos("SELECT id, projeto_id, pai_id, inicio, fim, avanco, situacao, peso, responsavel_id
                   FROM atividades WHERE empresa_id = ? AND excluido_em IS NULL AND projeto_id IN ($ids)", [$eid]);
    $temFilho = [];
    foreach ($ativ as $a) if ($a['pai_id']) $temFilho[(int)$a['pai_id']] = true;

    // linha de base mais recente de cada obra (datas e peso planejados)
    $base = [];
    foreach (todos("SELECT lb.projeto_id, i.atividade_id, i.inicio, i.fim, i.peso
                    FROM linhas_base lb JOIN linha_base_itens i ON i.linha_base_id = lb.id
                    WHERE lb.empresa_id = ? AND lb.projeto_id IN ($ids)
                      AND lb.numero = (SELECT MAX(x.numero) FROM linhas_base x WHERE x.projeto_id = lb.projeto_id)", [$eid]) as $b)
        $base[(int)$b['atividade_id']] = $b;

    // documentos de NR de quem trabalha em cada obra
    $docs = [];
    foreach (todos("SELECT funcionario_id, vence_em, invalidado_por_afastamento FROM v_documentos_situacao WHERE empresa_id = ?", [$eid]) as $d) {
        $f = (int)$d['funcionario_id'];
        $docs[$f] ??= ['vencidos' => 0, 'vencendo' => 0, 'total' => 0];
        $docs[$f]['total']++;
        if ($d['invalidado_por_afastamento'] || ($d['vence_em'] && $d['vence_em'] < $hoje)) $docs[$f]['vencidos']++;
        elseif ($d['vence_em'] && $d['vence_em'] <= gmdate('Y-m-d', strtotime($hoje . ' +30 days'))) $docs[$f]['vencendo']++;
    }

    $por = [];
    foreach ($ativ as $a) $por[(int)$a['projeto_id']][] = $a;
    $podeValor = in_array($u['perfil'], PODE_TUDO, true);
    foreach ($obras as &$o) {
        $lista = $por[(int)$o['id']] ?? [];
        $sp = $sr = $spp = $sprev = 0.0; $atrasadas = 0; $pessoas = []; $folhas = 0;
        foreach ($lista as $a) {
            if ($a['responsavel_id']) $pessoas[(int)$a['responsavel_id']] = true;
            if (isset($temFilho[(int)$a['id']])) continue;          // só as atividades "folha" contam no avanço
            $folhas++;
            $b = $base[(int)$a['id']] ?? null;
            $peso = (float)($b['peso'] ?? $a['peso'] ?? 1) ?: 1.0;
            $sp += $peso; $sr += $peso * (int)$a['avanco'];
            $fr = fracao_prevista($b['inicio'] ?? $a['inicio'], $b['fim'] ?? $a['fim'], $hoje);
            if ($fr !== null) { $spp += $peso; $sprev += $peso * $fr * 100; }
            if ($a['fim'] && $a['fim'] < $hoje && $a['situacao'] !== 'Concluído' && (int)$a['avanco'] < 100) $atrasadas++;
        }
        $real = $sp > 0 ? round($sr / $sp, 1) : 0.0;
        $prev = $spp > 0 ? round($sprev / $spp, 1) : null;
        $nrV = $nrA = $nrT = 0;
        foreach (array_keys($pessoas) as $f) if (isset($docs[$f])) { $nrV += $docs[$f]['vencidos'] ? 1 : 0; $nrA += (!$docs[$f]['vencidos'] && $docs[$f]['vencendo']) ? 1 : 0; $nrT++; }
        $o += [
            'atividades' => $folhas, 'avanco_real' => $real, 'avanco_previsto' => $prev,
            'desvio' => $prev === null ? null : round($prev - $real, 1),
            'farol' => farol_obra($o, $real, $prev, $hoje), 'atrasadas' => $atrasadas, 'pessoas' => count($pessoas),
            'nr_vencidos' => $nrV, 'nr_vencendo' => $nrA, 'nr_com_documentos' => $nrT,
            'valor_medido' => null,
        ];
        if (!$podeValor) unset($o['valor_contrato'], $o['numero_contrato']);
    }
    unset($o);
    return ['obras' => $obras, 'hoje' => $hoje];
}

/** GET /api/usuarios — pessoas com acesso ao sistema (para escolher o gestor da obra). */
function rota_usuarios_listar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    return ['usuarios' => todos('SELECT id, nome, perfil FROM usuarios WHERE empresa_id = ? AND excluido_em IS NULL AND desativado_em IS NULL AND email_confirmado_em IS NOT NULL ORDER BY nome', [$u['empresa_id']])];
}
