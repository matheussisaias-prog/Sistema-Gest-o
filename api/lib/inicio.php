<?php
/* Aprumo · servidor · tela "Início" (gestão à vista): farol das obras, atrasos e Travou abertos, RDO e documentos,
   agenda da semana. Também alimenta o modo TV. Administrador e gestor; liberado em todos os planos. */
declare(strict_types=1);

/** GET /api/inicio */
function rota_inicio(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id'];
    $hoje = rel_hoje(); $fim7 = Calendario::mais($hoje, 6);
    $obras = todos("SELECT * FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao IN ('Em andamento','Pausado') ORDER BY situacao = 'Em andamento' DESC, codigo, nome", [$eid]);
    $cod = []; foreach (todos('SELECT id, COALESCE(codigo, nome) AS c FROM projetos WHERE empresa_id = ?', [$eid]) as $o) $cod[(int)$o['id']] = $o['c'];

    // ── farol ──
    $farol = []; $folhas = [];
    foreach ($obras as $p) {
        $pid = (int)$p['id']; [$F, $base, $ev] = rel_base_obra($eid, $pid); $folhas[$pid] = $F;
        $real = rel_real($F, $base, $ev, $hoje); $prev = rel_previsto($F, $base, $hoje);
        $fimPlano = null; $fimBase = null;
        foreach ($F as $a) { if ($a['fim']) $fimPlano = max($fimPlano ?? $a['fim'], $a['fim']); $b = $base[(int)$a['id']] ?? null; if ($b && $b['fim']) $fimBase = max($fimBase ?? $b['fim'], $b['fim']); }
        $ref = $fimBase ?: $p['fim']; $dd = $fimPlano && $ref ? rel_dias($ref, $fimPlano) : null;
        $farol[] = ['id' => $pid, 'codigo' => $p['codigo'], 'nome' => $p['nome'], 'cliente' => $p['cliente'], 'situacao' => $p['situacao'], 'real' => $real, 'previsto' => $prev,
                    'desvio_dias' => $dd, 'termino' => $fimPlano, 'farol' => farol_obra($p, $real, $prev, $hoje) ?? 'cinza'];
    }
    $ordem = ['vermelho' => 0, 'amarelo' => 1, 'verde' => 2, 'cinza' => 3];
    usort($farol, fn($a, $b) => [$ordem[$a['farol']], $a['codigo'] ?? ''] <=> [$ordem[$b['farol']], $b['codigo'] ?? '']);

    // ── atrasos e Travou ──
    $travou = array_map(fn($o) => ['tipo' => 'travou', 'atividade' => $o['atividade'], 'atividade_id' => $o['atividade_id'] ? (int)$o['atividade_id'] : null, 'projeto_id' => (int)$o['projeto_id'],
            'obra' => $cod[(int)$o['projeto_id']] ?? '', 'motivo' => $o['tipo'], 'descricao' => $o['descricao'], 'responsavel' => $o['responsavel'], 'dias' => max(0, rel_dias($o['data'], $hoje))],
        $obras ? todos('SELECT o.*, a.descricao AS atividade, f.nome AS responsavel FROM ocorrencias o LEFT JOIN atividades a ON a.id = o.atividade_id LEFT JOIN funcionarios f ON f.id = a.responsavel_id
                        WHERE o.projeto_id IN (' . implode(',', array_column($farol, 'id')) . ') AND o.resolvida_em IS NULL ORDER BY o.data', []) : []);
    $presos = array_filter(array_column($travou, 'atividade_id'));
    $atras = [];
    foreach ($folhas as $pid => $F) foreach ($F as $a) if ($a['fim'] && $a['fim'] < $hoje && (int)$a['avanco'] < 100 && !in_array((int)$a['id'], $presos, true))
        $atras[] = ['tipo' => 'atraso', 'atividade' => $a['descricao'], 'atividade_id' => (int)$a['id'], 'projeto_id' => $pid, 'obra' => $cod[$pid] ?? '', 'avanco' => (int)$a['avanco'],
                    'fim' => $a['fim'], 'responsavel' => $a['responsavel'], 'dias' => rel_dias($a['fim'], $hoje)];
    usort($atras, fn($a, $b) => $b['dias'] <=> $a['dias']);

    // ── RDO e documentos ──
    $pend = array_map(fn($p) => $p + ['projeto_id' => (int)$p['projeto_id']], rdo_pendencias($u));
    $sst = rel_sst($eid, $hoje, $fim7);
    $docs = array_values(array_filter($sst['vencidos'], fn($v) => $v['obras'] !== ''));

    // ── agenda da semana ──
    $dias = []; for ($d = $hoje; $d <= $fim7; $d = Calendario::mais($d, 1)) $dias[$d] = [];
    foreach ($folhas as $pid => $F) foreach ($F as $a) {
        if ((int)$a['avanco'] >= 100) continue;
        if ($a['inicio'] && $a['inicio'] >= $hoje && $a['inicio'] <= $fim7) $dias[$a['inicio']][] = ['tipo' => 'comeca', 'texto' => $a['descricao'], 'obra' => $cod[$pid] ?? '', 'projeto_id' => $pid, 'atividade_id' => (int)$a['id']];
        if ($a['fim'] && $a['fim'] >= $hoje && $a['fim'] <= $fim7) $dias[$a['fim']][] = ['tipo' => 'termina', 'texto' => $a['descricao'], 'obra' => $cod[$pid] ?? '', 'projeto_id' => $pid, 'atividade_id' => (int)$a['id']];
    }
    foreach ($sst['ausencias'] as $x) for ($d = max($hoje, $x['inicio']); $d <= min($fim7, $x['fim']); $d = Calendario::mais($d, 1)) $dias[$d][] = ['tipo' => 'ausencia', 'texto' => $x['pessoa'] . ' · ' . mb_strtolower($x['tipo'])];
    $res = rc_reservas($eid, $hoje, $fim7);
    foreach (rc_conflitos($res) as $c) { $d = max($hoje, $c['de']); if ($d <= $fim7) $dias[$d][] = ['tipo' => 'conflito', 'texto' => (um('SELECT COALESCE(codigo, nome) AS n FROM recursos WHERE id = ?', [$c['recurso_id']])['n'] ?? 'Recurso') . (($nob = array_values(array_unique(array_column($c['atividades'], 'obra')))) && count($nob) > 1 ? ' em ' . count($nob) . ' obras' : ' em ' . count($c['atividades']) . ' atividades' . ($nob ? ' · ' . $nob[0] : '')), 'recurso_id' => (int)$c['recurso_id']]; }
    foreach (todos('SELECT l.devolucao_prevista, r.id, COALESCE(r.codigo, r.nome) AS n FROM locacoes l JOIN recursos r ON r.id = l.recurso_id WHERE l.empresa_id = ? AND l.excluido_em IS NULL AND l.devolvido_em IS NULL AND l.devolucao_prevista BETWEEN ? AND ?', [$eid, $hoje, $fim7]) as $l)
        $dias[$l['devolucao_prevista']][] = ['tipo' => 'devolver', 'texto' => $l['n'] . ' · devolver', 'recurso_id' => (int)$l['id']];
    $agenda = []; foreach ($dias as $d => $L) $agenda[] = ['data' => $d, 'itens' => $L];

    $cont = fn($f) => count(array_filter($farol, fn($o) => $o['farol'] === $f && $o['situacao'] === 'Em andamento'));
    $nome = um('SELECT nome FROM usuarios WHERE id = ?', [$u['id']])['nome'] ?? '';
    return ['usuario' => explode(' ', trim($nome))[0], 'empresa' => $u['empresa_nome'], 'hoje' => $hoje, 'agora' => gmdate('H:i', time() - 3 * 3600), 'tem_logo' => (bool)(um('SELECT logo FROM empresas WHERE id = ?', [$eid])['logo'] ?? null),
            'indicadores' => ['obras' => count(array_filter($farol, fn($o) => $o['situacao'] === 'Em andamento')), 'verde' => $cont('verde'), 'amarelo' => $cont('amarelo'), 'vermelho' => $cont('vermelho'),
                'travou' => count($travou), 'atrasadas' => count($atras), 'sem_rdo' => count(array_filter($pend, fn($p) => $p['tipo'] === 'sem')), 'nr_vencida' => count(array_unique(array_column($docs, 'pessoa')))],
            'obras' => $farol, 'atrasos' => array_merge($travou, $atras), 'pendencias' => $pend, 'documentos' => $docs, 'agenda' => $agenda];
}
