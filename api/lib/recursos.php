<?php
/* Aprumo · servidor · Recursos: equipamentos, veículos e ferramentas — reserva por atividade (as datas vêm da atividade),
   conflitos, locação (fornecedor, período, custo, devolução), calibração/manutenção/inspeção com vencimento e paradas. */
declare(strict_types=1);

const RC_TIPOS = ['equipamento', 'veiculo', 'ferramenta', 'outro'];
const RC_CTRL = ['calibracao' => 'Calibração', 'manutencao' => 'Manutenção', 'inspecao' => 'Inspeção'];
const REGRAS_RECURSO2 = [
    'nome' => ['texto', 160], 'tipo' => ['lista', RC_TIPOS], 'codigo' => ['texto', 30], 'modelo' => ['texto', 160], 'numero_serie' => ['texto', 80],
    'propriedade' => ['lista', ['proprio', 'alugado']], 'custo' => ['num', 0, 1e9], 'custo_unidade' => ['lista', ['hora', 'dia']], 'ativo' => ['bool'], 'observacao' => ['texto', 2000],
];
const REGRAS_LOCACAO = [
    'fornecedor_id' => ['id'], 'contrato' => ['texto', 60], 'retirada' => ['data'], 'devolucao_prevista' => ['data'], 'devolvido_em' => ['data'],
    'custo' => ['num', 0, 1e9], 'custo_unidade' => ['lista', ['dia', 'semana', 'mes']], 'observacao' => ['texto', 2000],
];
const REGRAS_FORNECEDOR = ['nome' => ['texto', 160], 'contato' => ['texto', 120], 'telefone' => ['texto', 40], 'email' => ['texto', 190]];

function rc_mais(string $d, int $n): string { return gmdate('Y-m-d', strtotime("$d 12:00:00 UTC") + $n * 86400); }
function rc_dias(string $a, string $b): int { return (int)round((strtotime("$b 12:00:00 UTC") - strtotime("$a 12:00:00 UTC")) / 86400); }
function rc_br(?string $d): string { return $d ? substr($d, 8, 2) . '/' . substr($d, 5, 2) : '—'; }
function rc_br_ano(?string $d): string { return $d ? substr($d, 8, 2) . '/' . substr($d, 5, 2) . '/' . substr($d, 0, 4) : '—'; }
function rc_ver_custo(array $u): bool { return in_array($u['perfil'], PODE_TUDO, true); }

function rc_recurso(array $u, int $id): array {
    $r = um('SELECT * FROM recursos WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$r) throw new ErroApi('Recurso não encontrado', 404);
    return $r;
}
/** Reservas (recurso escolhido em atividade aberta de obra ativa) que tocam o período. */
function rc_reservas(int $eid, string $ini, string $fim, ?array $rids = null, bool $concluidas = false): array {
    $p = [$eid, $fim, $ini]; $f = '';
    if ($rids !== null) { if (!$rids) return []; $f = ' AND ar.recurso_id IN (' . implode(',', array_map('intval', $rids)) . ')'; }
    $L = todos("SELECT ar.recurso_id, ar.pendencias, a.id AS atividade_id, a.descricao, a.inicio, COALESCE(a.fim, a.inicio) AS fim, a.situacao, a.avanco,
                       p.id AS projeto_id, p.codigo, p.nome AS obra
                FROM atividade_recursos ar JOIN atividades a ON a.id = ar.atividade_id AND a.excluido_em IS NULL
                JOIN projetos p ON p.id = a.projeto_id AND p.excluido_em IS NULL AND p.situacao NOT IN ('Concluído','Arquivado')
                WHERE ar.empresa_id = ? AND a.inicio IS NOT NULL AND a.inicio <= ? AND COALESCE(a.fim, a.inicio) >= ?" . ($concluidas ? '' : " AND a.situacao <> 'Concluído'") . "$f
                ORDER BY a.inicio, a.id", $p);
    foreach ($L as &$x) { $x['recurso_id'] = (int)$x['recurso_id']; $x['atividade_id'] = (int)$x['atividade_id']; $x['projeto_id'] = (int)$x['projeto_id']; $x['avanco'] = (int)$x['avanco']; $x['obra_cod'] = $x['codigo'] ?: $x['obra']; }
    return $L;
}
function rc_paradas(int $eid, string $ini, string $fim, ?array $rids = null): array {
    $f = $rids !== null ? ($rids ? ' AND recurso_id IN (' . implode(',', array_map('intval', $rids)) . ')' : ' AND 0') : '';
    return array_map(fn($x) => ['id' => (int)$x['id'], 'recurso_id' => (int)$x['recurso_id'], 'inicio' => $x['inicio'], 'fim' => $x['fim'], 'motivo' => $x['motivo']],
        todos("SELECT * FROM recurso_paradas WHERE empresa_id = ? AND excluido_em IS NULL AND inicio <= ? AND fim >= ?$f ORDER BY inicio", [$eid, $fim, $ini]));
}
/** Situação de cada controle (o lançamento mais novo de cada tipo + item vale). */
function rc_controles(int $eid, ?array $rids, string $hoje): array {
    $f = $rids !== null ? ($rids ? ' AND recurso_id IN (' . implode(',', array_map('intval', $rids)) . ')' : ' AND 0') : '';
    $out = [];
    foreach (todos("SELECT * FROM recurso_controles WHERE empresa_id = ? AND excluido_em IS NULL$f ORDER BY feito_em DESC, id DESC", [$eid]) as $c) {
        $k = $c['tipo'] . '|' . eq_norm($c['item']); $r = (int)$c['recurso_id'];
        $c['id'] = (int)$c['id']; $c['tem_arquivo'] = (bool)$c['arquivo']; unset($c['arquivo']);
        if (isset($out[$r]['itens'][$k])) { $out[$r]['historico'][] = $c; continue; }
        if (!$c['vence_em']) [$c['situacao'], $c['situacao_texto']] = ['ok', 'Sem vencimento'];
        elseif ($c['vence_em'] < $hoje) [$c['situacao'], $c['situacao_texto']] = ['vencido', 'Venceu ' . rc_br_ano($c['vence_em'])];
        elseif ($c['vence_em'] <= rc_mais($hoje, 30)) { $n = rc_dias($hoje, $c['vence_em']); [$c['situacao'], $c['situacao_texto']] = ['vencendo', $n === 0 ? 'Vence hoje' : "Vence em $n dia" . ($n > 1 ? 's' : '')]; }
        else [$c['situacao'], $c['situacao_texto']] = ['ok', 'Em dia'];
        $out[$r]['itens'][$k] = $c;
    }
    return $out;
}
function rc_locacoes_ativas(int $eid, ?array $rids = null): array {
    $f = $rids !== null ? ($rids ? ' AND l.recurso_id IN (' . implode(',', array_map('intval', $rids)) . ')' : ' AND 0') : '';
    $o = [];
    foreach (todos("SELECT l.*, f.nome AS fornecedor, f.telefone AS fornecedor_telefone, f.contato AS fornecedor_contato FROM locacoes l LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
                    WHERE l.empresa_id = ? AND l.excluido_em IS NULL AND l.devolvido_em IS NULL$f ORDER BY l.retirada", [$eid]) as $l) $o[(int)$l['recurso_id']] = $l;
    return $o;
}
function rc_custo_dia(array $l): float {
    $c = (float)($l['custo'] ?? 0);
    return ['dia' => $c, 'semana' => $c / 7, 'mes' => $c / 30][$l['custo_unidade']] ?? $c;
}
function rc_locacao_resumo(array $l, string $hoje, bool $custo): array {
    $fim = $l['devolvido_em'] ?: $l['devolucao_prevista'];
    $ateHoje = min($hoje, $fim);
    $diasUso = max(0, rc_dias($l['retirada'], $ateHoje) + 1); $diasTot = max(1, rc_dias($l['retirada'], $fim) + 1);
    $o = ['id' => (int)$l['id'], 'fornecedor_id' => $l['fornecedor_id'] ? (int)$l['fornecedor_id'] : null, 'fornecedor' => $l['fornecedor'] ?? null,
          'fornecedor_telefone' => $l['fornecedor_telefone'] ?? null, 'fornecedor_contato' => $l['fornecedor_contato'] ?? null, 'contrato' => $l['contrato'],
          'retirada' => $l['retirada'], 'devolucao_prevista' => $l['devolucao_prevista'], 'devolvido_em' => $l['devolvido_em'], 'observacao' => $l['observacao'],
          'dias_para_devolver' => $l['devolvido_em'] ? null : rc_dias($hoje, $l['devolucao_prevista']), 'dias_uso' => $diasUso];
    if ($custo) $o += ['custo' => $l['custo'] !== null ? (float)$l['custo'] : null, 'custo_unidade' => $l['custo_unidade'],
        'custo_ate_agora' => $l['custo'] !== null ? round(rc_custo_dia($l) * $diasUso, 2) : null, 'custo_previsto' => $l['custo'] !== null ? round(rc_custo_dia($l) * $diasTot, 2) : null];
    return $o;
}
/** Pares de reservas do mesmo recurso que se sobrepõem. */
function rc_conflitos(array $reservas): array {
    $por = []; $out = [];
    foreach ($reservas as $r) $por[$r['recurso_id']][] = $r;
    foreach ($por as $rid => $L) for ($i = 0; $i < count($L); $i++) for ($j = $i + 1; $j < count($L); $j++) {
        $a = $L[$i]; $b = $L[$j];
        if ($a['atividade_id'] === $b['atividade_id'] || $a['inicio'] > $b['fim'] || $b['inicio'] > $a['fim']) continue;
        $out[] = ['recurso_id' => $rid, 'de' => max($a['inicio'], $b['inicio']), 'ate' => min($a['fim'], $b['fim']),
                  'atividades' => array_map(fn($x) => ['id' => $x['atividade_id'], 'descricao' => $x['descricao'], 'obra' => $x['obra_cod'], 'projeto_id' => $x['projeto_id'], 'inicio' => $x['inicio'], 'fim' => $x['fim']], [$a, $b])];
    }
    return $out;
}
function rc_ocupacao(array $reservas, string $hoje, int $dias = 14): int {
    $fim = rc_mais($hoje, $dias - 1); $soma = 0;
    foreach ($reservas as $r) { $i = max($r['inicio'], $hoje); $f = min($r['fim'], $fim); if ($i <= $f) $soma += rc_dias($i, $f) + 1; }
    return (int)round($soma / $dias * 100);
}
function rc_periodo(string $i, string $f): string { return $i === $f ? rc_br($i) : rc_br($i) . ' a ' . rc_br($f); }

/** Situação de hoje, alertas e resumo de um recurso (usado na lista e na ficha). */
function rc_montar(array $r, array $res, array $par, array $ctrl, ?array $loc, array $conf, string $hoje, bool $custo): array {
    $id = (int)$r['id'];
    $agora = array_values(array_filter($res, fn($x) => $x['inicio'] <= $hoje && $x['fim'] >= $hoje));
    $prox = array_values(array_filter($res, fn($x) => $x['inicio'] > $hoje));
    $parHoje = array_values(array_filter($par, fn($x) => $x['inicio'] <= $hoje && $x['fim'] >= $hoje));
    if (!(int)$r['ativo']) $sit = ['tipo' => 'inativo', 'texto' => 'Inativo'];
    elseif ($r['propriedade'] === 'alugado' && !$loc) $sit = ['tipo' => 'inativo', 'texto' => 'Devolvido ao fornecedor'];
    elseif ($parHoje) $sit = ['tipo' => 'manutencao', 'texto' => 'Em manutenção até ' . rc_br($parHoje[0]['fim']), 'motivo' => $parHoje[0]['motivo']];
    elseif ($agora) $sit = ['tipo' => 'em_uso', 'texto' => 'Em uso · ' . $agora[0]['obra_cod'], 'obra' => $agora[0]['obra_cod']];
    else $sit = ['tipo' => 'livre', 'texto' => 'Livre'];
    $al = [];
    foreach ($conf as $c) $al[] = ['nivel' => 'grave', 'tipo' => 'conflito', 'texto' => 'Conflito ' . ($c['de'] === $c['ate'] ? rc_br($c['de']) : substr($c['de'], 8, 2) . '–' . rc_br($c['ate']))];
    $okCtrl = null;
    foreach ($ctrl['itens'] ?? [] as $c) {
        if ($c['situacao'] === 'vencido') $al[] = ['nivel' => 'grave', 'tipo' => 'controle', 'texto' => RC_CTRL[$c['tipo']] . ' vencida'];
        elseif ($c['situacao'] === 'vencendo') $al[] = ['nivel' => 'atencao', 'tipo' => 'controle', 'texto' => RC_CTRL[$c['tipo']] . ' ' . mb_strtolower($c['situacao_texto'])];
        else $okCtrl ??= $c;
    }
    if ($loc) {
        $n = rc_dias($hoje, $loc['devolucao_prevista']);
        if ($n < 0) $al[] = ['nivel' => 'grave', 'tipo' => 'locacao', 'texto' => 'Devolução atrasada ' . -$n . ' dia' . (-$n > 1 ? 's' : '')];
        elseif ($n <= 7) $al[] = ['nivel' => 'atencao', 'tipo' => 'locacao', 'texto' => $n === 0 ? 'Devolver hoje' : "Devolver em $n dia" . ($n > 1 ? 's' : '')];
        if (array_filter($res, fn($x) => $x['fim'] > $loc['devolucao_prevista'])) $al[] = ['nivel' => 'atencao', 'tipo' => 'locacao', 'texto' => 'Reserva depois da devolução'];
    }
    foreach ($par as $p) if ($p['inicio'] > $hoje && array_filter($res, fn($x) => $x['inicio'] <= $p['fim'] && $x['fim'] >= $p['inicio']))
        { $al[] = ['nivel' => 'grave', 'tipo' => 'parada', 'texto' => 'Reservado durante manutenção ' . rc_periodo($p['inicio'], $p['fim'])]; break; }
    if (!array_filter($al, fn($a) => $a['tipo'] === 'controle') && $okCtrl) $al[] = ['nivel' => 'ok', 'tipo' => 'controle', 'texto' => RC_CTRL[$okCtrl['tipo']] . ' em dia'];
    $atual = $agora[0] ?? null; $pr = $prox[0] ?? null;
    $o = ['id' => $id, 'codigo' => $r['codigo'], 'nome' => $r['nome'], 'tipo' => $r['tipo'], 'modelo' => $r['modelo'], 'numero_serie' => $r['numero_serie'],
        'propriedade' => $r['propriedade'], 'ativo' => (bool)(int)$r['ativo'], 'observacao' => $r['observacao'],
        'situacao' => $sit, 'alertas' => $al, 'ocupacao' => rc_ocupacao($res, $hoje),
        'atual' => $atual ? ['atividade_id' => $atual['atividade_id'], 'descricao' => $atual['descricao'], 'obra' => $atual['obra_cod'], 'projeto_id' => $atual['projeto_id'], 'inicio' => $atual['inicio'], 'fim' => $atual['fim']] : null,
        'proxima' => $pr ? ['atividade_id' => $pr['atividade_id'], 'descricao' => $pr['descricao'], 'obra' => $pr['obra_cod'], 'projeto_id' => $pr['projeto_id'], 'inicio' => $pr['inicio'], 'fim' => $pr['fim']] : null,
        'obras' => array_values(array_unique(array_map(fn($x) => $x['obra_cod'], $res))),
        'locacao' => $loc ? rc_locacao_resumo($loc, $hoje, $custo) : null];
    if ($custo) $o += ['custo' => $r['custo'] !== null ? (float)$r['custo'] : null, 'custo_unidade' => $r['custo_unidade']];
    return $o;
}

/** GET /api/recursos — lista com situação, alertas e indicadores. */
function rota_recursos_listar(): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    $eid = (int)$u['empresa_id']; $hoje = eq_hoje(); $ate = rc_mais($hoje, 60); $custo = rc_ver_custo($u);
    $R = todos('SELECT * FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL ORDER BY ativo DESC, nome', [$eid]);
    $res = rc_reservas($eid, $hoje, $ate); $par = rc_paradas($eid, $hoje, $ate); $ctrl = rc_controles($eid, null, $hoje); $loc = rc_locacoes_ativas($eid);
    $conf = rc_conflitos($res);
    $by = fn($L, $id) => array_values(array_filter($L, fn($x) => $x['recurso_id'] === $id));
    $L = []; $k = ['em_uso' => 0, 'livres' => 0, 'devolucoes' => 0, 'vencidos' => 0, 'conflitos' => count($conf), 'alugados' => 0, 'total' => 0];
    foreach ($R as $r) {
        $id = (int)$r['id'];
        $o = rc_montar($r, $by($res, $id), $by($par, $id), $ctrl[$id] ?? [], $loc[$id] ?? null, $by($conf, $id), $hoje, $custo);
        $L[] = $o;
        if (!$o['ativo']) continue;
        $k['total']++;
        if ($o['situacao']['tipo'] === 'em_uso') $k['em_uso']++;
        if ($o['situacao']['tipo'] === 'livre') $k['livres']++;
        if ($o['locacao']) { $k['alugados']++; if ($o['locacao']['dias_para_devolver'] <= 7) $k['devolucoes']++; }
        if (array_filter($o['alertas'], fn($a) => $a['tipo'] === 'controle' && $a['nivel'] === 'grave')) $k['vencidos']++;
    }
    foreach ($conf as &$c) $c['recurso'] = (function ($id) use ($L) { foreach ($L as $x) if ($x['id'] === $id) return ['id' => $id, 'nome' => $x['nome'], 'codigo' => $x['codigo'], 'tipo' => $x['tipo']]; return null; })($c['recurso_id']);
    return ['hoje' => $hoje, 'pode_editar' => $custo, 'recursos' => $L, 'indicadores' => $k, 'conflitos' => $conf,
            'fornecedores' => array_map(fn($f) => ['id' => (int)$f['id'], 'nome' => $f['nome'], 'contato' => $f['contato'], 'telefone' => $f['telefone'], 'email' => $f['email']],
                todos('SELECT * FROM fornecedores WHERE empresa_id = ? AND excluido_em IS NULL ORDER BY nome', [$eid]))];
}

/** GET /api/recursos/{id} — ficha. */
function rota_recurso_ficha(int $id): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    $r = rc_recurso($u, $id); $eid = (int)$u['empresa_id']; $hoje = eq_hoje(); $custo = rc_ver_custo($u);
    $res = rc_reservas($eid, rc_mais($hoje, -60), '2999-12-31', [$id], true);
    $abertas = array_values(array_filter($res, fn($x) => $x['situacao'] !== 'Concluído' && $x['fim'] >= $hoje));
    $par = rc_paradas($eid, rc_mais($hoje, -365), '2999-12-31', [$id]);
    $ctrl = rc_controles($eid, [$id], $hoje)[$id] ?? ['itens' => [], 'historico' => []];
    $loc = rc_locacoes_ativas($eid, [$id])[$id] ?? null;
    $o = rc_montar($r, $abertas, array_values(array_filter($par, fn($p) => $p['fim'] >= $hoje)), $ctrl, $loc, rc_conflitos($abertas), $hoje, $custo);
    $o['reservas'] = array_map(function ($x) use ($loc, $hoje) {
        $s = $x['situacao'] === 'Concluído' ? 'concluida' : ($x['fim'] < $hoje ? 'atrasada' : ($x['inicio'] <= $hoje ? 'andamento' : 'futura'));
        return ['atividade_id' => $x['atividade_id'], 'descricao' => $x['descricao'], 'obra' => $x['obra_cod'], 'projeto_id' => $x['projeto_id'], 'inicio' => $x['inicio'], 'fim' => $x['fim'],
                'avanco' => $x['avanco'], 'situacao' => $s, 'depois_devolucao' => $loc && $x['fim'] > $loc['devolucao_prevista'] && $s !== 'concluida', 'pendencias' => $x['pendencias']];
    }, $res);
    $o['controles'] = array_values($ctrl['itens'] ?? []); $o['controles_historico'] = $ctrl['historico'] ?? [];
    $o['paradas'] = $par;
    $o['locacoes'] = array_map(fn($l) => rc_locacao_resumo($l, $hoje, $custo),
        todos('SELECT l.*, f.nome AS fornecedor, f.telefone AS fornecedor_telefone, f.contato AS fornecedor_contato FROM locacoes l LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
               WHERE l.recurso_id = ? AND l.empresa_id = ? AND l.excluido_em IS NULL ORDER BY l.retirada DESC', [$id, $eid]));
    $o['hoje'] = $hoje; $o['pode_editar'] = $custo;
    return $o;
}

/** GET /api/recursos-mapa?inicio=&semanas= — linhas por recurso com reservas, paradas, calibração vencida e locação. */
function rota_recursos_mapa(): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    $eid = (int)$u['empresa_id']; $hoje = eq_hoje();
    $sem = max(2, min(12, (int)($_GET['semanas'] ?? 4)));
    $ini = !empty($_GET['inicio']) ? data_ok((string)$_GET['inicio'], 'início') : rc_mais($hoje, -((int)gmdate('N', strtotime("$hoje 12:00:00 UTC")) - 1));
    $fim = rc_mais($ini, $sem * 7 - 1);
    $R = todos('SELECT * FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 ORDER BY nome', [$eid]);
    $res = rc_reservas($eid, $ini, $fim); $par = rc_paradas($eid, $ini, $fim); $ctrl = rc_controles($eid, null, $hoje); $loc = rc_locacoes_ativas($eid);
    $conf = rc_conflitos($res); $L = [];
    foreach ($R as $r) {
        $id = (int)$r['id'];
        $venc = array_values(array_filter($ctrl[$id]['itens'] ?? [], fn($c) => $c['situacao'] === 'vencido'));
        $l = $loc[$id] ?? null;
        $L[] = ['id' => $id, 'codigo' => $r['codigo'], 'nome' => $r['nome'], 'tipo' => $r['tipo'], 'propriedade' => $r['propriedade'],
            'reservas' => array_values(array_map(fn($x) => ['atividade_id' => $x['atividade_id'], 'descricao' => $x['descricao'], 'obra' => $x['obra_cod'], 'projeto_id' => $x['projeto_id'], 'inicio' => $x['inicio'], 'fim' => $x['fim'],
                'conflito' => (bool)array_filter($conf, fn($c) => $c['recurso_id'] === $id && in_array($x['atividade_id'], array_column($c['atividades'], 'id'), true))], array_filter($res, fn($x) => $x['recurso_id'] === $id))),
            'paradas' => array_values(array_filter($par, fn($p) => $p['recurso_id'] === $id)),
            'controle_vencido' => $venc ? RC_CTRL[$venc[0]['tipo']] . ' venceu ' . rc_br($venc[0]['vence_em']) : null,
            'locacao' => $l ? ['retirada' => $l['retirada'], 'devolucao_prevista' => $l['devolucao_prevista']] : null,
            'sub' => $l ? 'Alugado ' . rc_br($l['retirada']) . ' → ' . rc_br($l['devolucao_prevista']) : ($r['propriedade'] === 'alugado' ? 'Alugado · devolvido' : 'Próprio')];
    }
    return ['inicio' => $ini, 'fim' => $fim, 'hoje' => $hoje, 'semanas' => $sem, 'linhas' => $L, 'conflitos' => count($conf)];
}

/** Corpo do recurso validado; "custo_unidade" vazio vira NULL (sem custo). */
function rc_campos(): array {
    $d = corpo(); $semUnid = array_key_exists('custo_unidade', $d) && ($d['custo_unidade'] === null || $d['custo_unidade'] === '');
    if ($semUnid) unset($d['custo_unidade']);
    $c = limpar($d, REGRAS_RECURSO2);
    if ($semUnid) $c['custo_unidade'] = null;
    return $c;
}
function rc_validar_codigo(int $eid, ?string $cod, int $exceto = 0): void {
    if ($cod && um('SELECT id FROM recursos WHERE empresa_id = ? AND codigo = ? AND excluido_em IS NULL AND id <> ?', [$eid, $cod, $exceto])) throw new ErroApi("Já existe um recurso com o código $cod");
}
function rc_fornecedor(array $u, array $d): ?int {
    if (!empty($d['fornecedor_id'])) {
        if (!um('SELECT id FROM fornecedores WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [(int)$d['fornecedor_id'], $u['empresa_id']])) throw new ErroApi('Fornecedor inválido');
        return (int)$d['fornecedor_id'];
    }
    $n = trim((string)($d['fornecedor_nome'] ?? ''));
    if ($n === '') return null;
    $f = um('SELECT id FROM fornecedores WHERE empresa_id = ? AND nome = ? AND excluido_em IS NULL', [$u['empresa_id'], mb_substr($n, 0, 160)]);
    return $f ? (int)$f['id'] : inserir('fornecedores', ['empresa_id' => $u['empresa_id'], 'nome' => mb_substr($n, 0, 160)]);
}
function rc_criar_locacao(array $u, int $rid, array $d): int {
    $c = limpar($d, REGRAS_LOCACAO); unset($c['devolvido_em']);
    if (empty($c['retirada']) || empty($c['devolucao_prevista'])) throw new ErroApi('Informe a retirada e a devolução prevista da locação');
    if ($c['devolucao_prevista'] < $c['retirada']) throw new ErroApi('A devolução não pode ser antes da retirada');
    if (um('SELECT id FROM locacoes WHERE recurso_id = ? AND devolvido_em IS NULL AND excluido_em IS NULL', [$rid])) throw new ErroApi('Este recurso já tem uma locação em aberto: registre a devolução antes');
    $c['fornecedor_id'] = rc_fornecedor($u, $d);
    return inserir('locacoes', ['empresa_id' => $u['empresa_id'], 'recurso_id' => $rid, 'criado_por' => $u['id']] + $c);
}

/** POST /api/recursos — {nome, tipo, codigo?, ..., propriedade, locacao?: {...}} */
function rota_recursos_criar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id'];
    $d = corpo(); $c = rc_campos();
    if (empty($c['nome'])) throw new ErroApi('Campo obrigatório: nome');
    rc_validar_codigo($eid, $c['codigo'] ?? null);
    db()->beginTransaction();
    try {
        $id = inserir('recursos', ['empresa_id' => $eid] + $c);
        if (($c['propriedade'] ?? 'proprio') === 'alugado' && !empty($d['locacao'])) rc_criar_locacao($u, $id, (array)$d['locacao']);
        db()->commit();
    } catch (Throwable $e) { db()->rollBack(); throw $e; }
    registrar($u, $eid, 'recursos', $id, 'criou', null, $c);
    return ['ok' => true, 'id' => $id];
}
/** PATCH /api/recursos/{id} */
function rota_recursos_alterar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $r = rc_recurso($u, $id);
    $c = rc_campos();
    if (array_key_exists('nome', $c) && empty($c['nome'])) throw new ErroApi('Campo obrigatório: nome');
    if (array_key_exists('codigo', $c)) rc_validar_codigo((int)$u['empresa_id'], $c['codigo'], $id);
    atualizar('recursos', $id, $c);
    registrar($u, (int)$u['empresa_id'], 'recursos', $id, 'alterou', array_intersect_key($r, $c), $c);
    return ['ok' => true];
}
function rota_recursos_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); rc_recurso($u, $id);
    q('UPDATE recursos SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    q('DELETE FROM atividade_recursos WHERE recurso_id = ? AND empresa_id = ?', [$id, $u['empresa_id']]);
    registrar($u, (int)$u['empresa_id'], 'recursos', $id, 'excluiu');
    return ['ok' => true];
}

/** POST /api/recursos/{id}/controles — {tipo, item, feito_em, vence_em? | validade_meses?, instituicao?, observacao?, arquivo?: {dados}} */
function rota_controle_lancar(int $rid): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); rc_recurso($u, $rid); $eid = (int)$u['empresa_id'];
    $d = corpo();
    if (!isset(RC_CTRL[$d['tipo'] ?? ''])) throw new ErroApi('Escolha: calibração, manutenção ou inspeção');
    $item = trim((string)($d['item'] ?? '')); if ($item === '') $item = RC_CTRL[$d['tipo']];
    $feito = data_ok((string)($d['feito_em'] ?? ''), 'data'); if (!$feito) throw new ErroApi('Informe quando foi feito');
    if ($feito > eq_hoje()) throw new ErroApi('A data não pode ser no futuro');
    $vence = !empty($d['vence_em']) ? data_ok((string)$d['vence_em'], 'vencimento') : null;
    if (!$vence && !empty($d['validade_meses'])) {
        $m = (int)$d['validade_meses']; if ($m < 1 || $m > 120) throw new ErroApi('Validade em meses inválida');
        $vence = (new DateTime($feito))->modify("+$m months")->format('Y-m-d');
    }
    if ($vence && $vence <= $feito) throw new ErroApi('O vencimento tem que ser depois da data em que foi feito');
    $arq = !empty($d['arquivo']['dados']) ? eq_gravar_arquivo($eid, (string)$d['arquivo']['dados']) : null;
    $id = inserir('recurso_controles', ['empresa_id' => $eid, 'recurso_id' => $rid, 'tipo' => $d['tipo'], 'item' => mb_substr($item, 0, 160), 'feito_em' => $feito, 'vence_em' => $vence,
        'instituicao' => trim((string)($d['instituicao'] ?? '')) !== '' ? mb_substr(trim((string)$d['instituicao']), 0, 160) : null,
        'observacao' => trim((string)($d['observacao'] ?? '')) !== '' ? mb_substr(trim((string)$d['observacao']), 0, 2000) : null, 'arquivo' => $arq, 'criado_por' => $u['id']]);
    registrar($u, $eid, 'recursos', $rid, 'alterou', null, ['controle' => RC_CTRL[$d['tipo']] . ' · ' . $item, 'feito_em' => $feito, 'vence_em' => $vence, 'certificado' => (bool)$arq]);
    return ['ok' => true, 'id' => $id, 'vence_em' => $vence];
}
/** GET /api/controles/{id}/arquivo */
function rota_controle_arquivo(int $id): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    $c = um('SELECT * FROM recurso_controles WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$c || !$c['arquivo']) throw new ErroApi('Arquivo não encontrado', 404);
    $arq = pasta_arquivos() . '/' . $c['arquivo'];
    if (!is_file($arq)) throw new ErroApi('Arquivo não encontrado', 404);
    $ext = pathinfo($arq, PATHINFO_EXTENSION);
    $tipo = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $tipo); header('Content-Length: ' . filesize($arq)); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline; filename="certificado.' . $ext . '"');
    readfile($arq); exit;
}
function rota_controle_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $c = um('SELECT * FROM recurso_controles WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$c) throw new ErroApi('Lançamento não encontrado', 404);
    q('UPDATE recurso_controles SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'recursos', (int)$c['recurso_id'], 'alterou', ['controle_id' => $id], ['controle_excluido' => true]);
    return ['ok' => true];
}

/** POST /api/recursos/{id}/paradas — {inicio, fim, motivo} (fora de uso: manutenção, conserto) */
function rota_parada_criar(int $rid): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); rc_recurso($u, $rid);
    $d = corpo(); $i = data_ok((string)($d['inicio'] ?? ''), 'início'); $f = data_ok((string)($d['fim'] ?? ''), 'fim');
    if (!$i || !$f) throw new ErroApi('Informe o início e o fim'); if ($f < $i) throw new ErroApi('O fim não pode ser antes do início');
    $id = inserir('recurso_paradas', ['empresa_id' => $u['empresa_id'], 'recurso_id' => $rid, 'inicio' => $i, 'fim' => $f,
        'motivo' => trim((string)($d['motivo'] ?? '')) !== '' ? mb_substr(trim((string)$d['motivo']), 0, 200) : null, 'criado_por' => $u['id']]);
    registrar($u, (int)$u['empresa_id'], 'recursos', $rid, 'alterou', null, ['parada' => rc_periodo($i, $f), 'motivo' => $d['motivo'] ?? null]);
    $afeta = array_values(array_filter(rc_reservas((int)$u['empresa_id'], $i, $f, [$rid]), fn($x) => true));
    return ['ok' => true, 'id' => $id, 'reservas_afetadas' => array_map(fn($x) => $x['obra_cod'] . ' · ' . $x['descricao'], $afeta)];
}
function rota_parada_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $p = um('SELECT * FROM recurso_paradas WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$p) throw new ErroApi('Parada não encontrada', 404);
    q('UPDATE recurso_paradas SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'recursos', (int)$p['recurso_id'], 'alterou', ['parada_id' => $id], ['parada_excluida' => true]);
    return ['ok' => true];
}

/** POST /api/recursos/{id}/locacoes — nova locação (o recurso passa a ser alugado). */
function rota_locacao_criar(int $rid): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $r = rc_recurso($u, $rid);
    $id = rc_criar_locacao($u, $rid, corpo());
    if ($r['propriedade'] !== 'alugado') q("UPDATE recursos SET propriedade = 'alugado' WHERE id = ?", [$rid]);
    registrar($u, (int)$u['empresa_id'], 'recursos', $rid, 'alterou', null, ['locacao' => $id]);
    return ['ok' => true, 'id' => $id];
}
/** PATCH /api/locacoes/{id} — estender (devolucao_prevista), registrar devolução (devolvido_em) ou corrigir dados. */
function rota_locacao_alterar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $l = um('SELECT * FROM locacoes WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$l) throw new ErroApi('Locação não encontrada', 404);
    $d = corpo(); $c = limpar($d, REGRAS_LOCACAO);
    if (array_key_exists('fornecedor_nome', $d) || array_key_exists('fornecedor_id', $d)) $c['fornecedor_id'] = rc_fornecedor($u, $d);
    $ret = $c['retirada'] ?? $l['retirada'];
    if (!empty($c['devolucao_prevista']) && $c['devolucao_prevista'] < $ret) throw new ErroApi('A devolução não pode ser antes da retirada');
    if (!empty($c['devolvido_em'])) {
        if ($c['devolvido_em'] < $ret) throw new ErroApi('A devolução não pode ser antes da retirada');
        if ($c['devolvido_em'] > eq_hoje()) throw new ErroApi('A devolução não pode ser no futuro');
    }
    if (!$c) throw new ErroApi('Nada para alterar');
    atualizar('locacoes', $id, $c);
    registrar($u, (int)$u['empresa_id'], 'recursos', (int)$l['recurso_id'], 'alterou', array_intersect_key($l, $c), ['locacao' => $id] + $c);
    return ['ok' => true];
}

/** Fornecedores de locação */
function rota_fornecedores(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $c = limpar(corpo(), REGRAS_FORNECEDOR); if (empty($c['nome'])) throw new ErroApi('Informe o nome do fornecedor');
        if (um('SELECT id FROM fornecedores WHERE empresa_id = ? AND nome = ? AND excluido_em IS NULL', [$u['empresa_id'], $c['nome']])) throw new ErroApi('Esse fornecedor já está cadastrado');
        return ['ok' => true, 'id' => inserir('fornecedores', ['empresa_id' => $u['empresa_id']] + $c)];
    }
    return ['fornecedores' => todos('SELECT f.id, f.nome, f.contato, f.telefone, f.email, (SELECT COUNT(*) FROM locacoes l WHERE l.fornecedor_id = f.id AND l.devolvido_em IS NULL AND l.excluido_em IS NULL) AS em_aberto
                                     FROM fornecedores f WHERE f.empresa_id = ? AND f.excluido_em IS NULL ORDER BY f.nome', [$u['empresa_id']])];
}
function rota_fornecedor_alterar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    if (!um('SELECT id FROM fornecedores WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']])) throw new ErroApi('Fornecedor não encontrado', 404);
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'DELETE') { q('UPDATE fornecedores SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]); return ['ok' => true]; }
    $c = limpar(corpo(), REGRAS_FORNECEDOR); if (array_key_exists('nome', $c) && empty($c['nome'])) throw new ErroApi('Informe o nome do fornecedor');
    atualizar('fornecedores', $id, $c);
    return ['ok' => true];
}

/* ══ Recursos da atividade ═══════════════════════════════════════ */
/** Pendências de reservar o recurso $r na atividade $a. */
function rc_pendencias(int $eid, array $r, array $a, string $hoje): array {
    $rid = (int)$r['id']; $ini = $a['inicio'] ?: $hoje; $fim = $a['fim'] ?: $ini; $pend = [];
    if (!(int)$r['ativo']) $pend[] = ['nivel' => 'grave', 'texto' => 'Recurso inativo'];
    foreach (rc_reservas($eid, $ini, $fim, [$rid]) as $x) if ($x['atividade_id'] !== (int)$a['id'])
        $pend[] = ['nivel' => 'grave', 'tipo' => 'conflito', 'texto' => "Já reservado em {$x['obra_cod']} · {$x['descricao']}, " . rc_periodo(max($ini, $x['inicio']), min($fim, $x['fim'])) . '. Uma das atividades vai ficar sem ele.'];
    foreach (rc_paradas($eid, $ini, $fim, [$rid]) as $p)
        $pend[] = ['nivel' => 'grave', 'tipo' => 'parada', 'texto' => 'Em manutenção ' . rc_periodo($p['inicio'], $p['fim']) . ($p['motivo'] ? " ({$p['motivo']})" : '')];
    foreach ((rc_controles($eid, [$rid], $hoje)[$rid]['itens'] ?? []) as $c) {
        if (!$c['vence_em']) continue; $nm = rc_nome_controle($c);
        if ($c['vence_em'] < $hoje) $pend[] = ['nivel' => 'grave', 'tipo' => 'controle', 'texto' => "$nm vencida desde " . rc_br_ano($c['vence_em'])];
        elseif ($c['vence_em'] < $ini) $pend[] = ['nivel' => 'atencao', 'tipo' => 'controle', 'texto' => "$nm vence em " . rc_br($c['vence_em']) . ', antes da atividade'];
        elseif ($c['vence_em'] <= $fim) $pend[] = ['nivel' => 'atencao', 'tipo' => 'controle', 'texto' => "$nm vence em " . rc_br($c['vence_em']) . ', durante a atividade'];
    }
    if ($r['propriedade'] === 'alugado') {
        $l = rc_locacoes_ativas($eid, [$rid])[$rid] ?? null;
        if (!$l) $pend[] = ['nivel' => 'grave', 'tipo' => 'locacao', 'texto' => 'Alugado e já devolvido ao fornecedor'];
        elseif ($l['devolucao_prevista'] < $fim) $pend[] = ['nivel' => 'atencao', 'tipo' => 'locacao', 'texto' => 'Locação termina em ' . rc_br($l['devolucao_prevista']) . ', antes do fim da atividade (estenda ou troque)'];
        elseif ($l['retirada'] > $ini) $pend[] = ['nivel' => 'atencao', 'tipo' => 'locacao', 'texto' => 'Retirada só em ' . rc_br($l['retirada']) . ', depois do início da atividade'];
    }
    return $pend;
}
function rc_nome_controle(array $c): string {
    $t = RC_CTRL[$c['tipo']];
    return str_contains(eq_norm($c['item']), eq_norm($t)) ? $c['item'] : "$t ({$c['item']})";
}
/** Nome-base para achar substitutos: as duas primeiras palavras significativas ("Caminhão munck 12 t" → "caminhao munck"). */
function rc_base(string $nome): string {
    $w = array_values(array_filter(preg_split('/\s+/', eq_norm($nome)), fn($x) => mb_strlen($x) > 2 && !preg_match('/\d/', $x)));
    return implode(' ', array_slice($w, 0, 2));
}
function rc_texto_pendencias(array $pend): string { return mb_substr(implode('; ', array_map(fn($p) => $p['texto'], array_filter($pend, fn($p) => $p['nivel'] !== 'aviso'))), 0, 500); }

/** GET|PUT /api/atividades/{id}/recursos — PUT {recursos: [ids], pendencias?: {id: texto}} */
function rota_atividade_recursos(int $id): array {
    $u = exigir_login(); $a = atividade_visivel($u, $id); $eid = (int)$u['empresa_id'];
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'PUT') {
        exigir_perfil($u, PODE_TUDO);
        $d = corpo(); $ids = array_values(array_unique(array_map('intval', is_array($d['recursos'] ?? null) ? $d['recursos'] : [])));
        if ($ids && count(todos('SELECT id FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL AND id IN (' . implode(',', $ids) . ')', [$eid])) !== count($ids)) throw new ErroApi('Recurso inválido');
        $antes = array_map('intval', array_column(todos('SELECT recurso_id FROM atividade_recursos WHERE atividade_id = ?', [$id]), 'recurso_id'));
        $pend = is_array($d['pendencias'] ?? null) ? $d['pendencias'] : [];
        q('DELETE FROM atividade_recursos WHERE atividade_id = ? AND empresa_id = ?' . ($ids ? ' AND recurso_id NOT IN (' . implode(',', $ids) . ')' : ''), [$id, $eid]);
        $novos = array_values(array_diff($ids, $antes));
        foreach ($novos as $r) q('INSERT INTO atividade_recursos (empresa_id, atividade_id, recurso_id, pendencias, criado_por) VALUES (?,?,?,?,?)',
            [$eid, $id, $r, isset($pend[(string)$r]) && trim((string)$pend[(string)$r]) !== '' ? mb_substr(trim((string)$pend[(string)$r]), 0, 500) : null, $u['id']]);
        if ($novos || array_diff($antes, $ids)) {
            $nomes = fn($L) => $L ? implode(', ', array_map(fn($x) => ($x['codigo'] ? $x['codigo'] . ' ' : '') . $x['nome'], todos('SELECT codigo, nome FROM recursos WHERE id IN (' . implode(',', $L) . ')'))) : '';
            $h = ['recursos' => $nomes($ids) ?: 'nenhum'];
            $comP = array_values(array_filter($novos, fn($r) => !empty($pend[(string)$r])));
            if ($comP) $h['reservou_com_pendencias'] = implode('; ', array_map(fn($r) => mb_substr((string)$pend[(string)$r], 0, 200), $comP));
            registrar($u, $eid, 'atividades', $id, 'alterou', ['recursos' => $nomes($antes) ?: 'nenhum'], $h);
        }
    }
    $hoje = eq_hoje();
    return ['recursos' => array_map(fn($x) => ['id' => (int)$x['id'], 'codigo' => $x['codigo'], 'nome' => $x['nome'], 'tipo' => $x['tipo'], 'propriedade' => $x['propriedade'],
            'pendencias_ao_reservar' => $x['pendencias'], 'pendencias' => rc_pendencias($eid, $x, $a, $hoje)],
        todos('SELECT r.*, ar.pendencias FROM atividade_recursos ar JOIN recursos r ON r.id = ar.recurso_id AND r.excluido_em IS NULL WHERE ar.atividade_id = ? AND ar.empresa_id = ? ORDER BY r.nome', [$id, $eid])),
        'disponiveis' => array_map(fn($x) => ['id' => (int)$x['id'], 'codigo' => $x['codigo'], 'nome' => $x['nome'], 'tipo' => $x['tipo']],
            todos('SELECT id, codigo, nome, tipo FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 ORDER BY tipo, nome', [$eid])),
        'pode_editar' => in_array($u['perfil'], PODE_TUDO, true)];
}
/** GET /api/atividades/{id}/checar-recurso?recurso= — pendências e até 3 livres do mesmo tipo. */
function rota_checar_recurso(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $a = atividade_visivel($u, $id); $eid = (int)$u['empresa_id']; $hoje = eq_hoje();
    $r = rc_recurso($u, (int)($_GET['recurso'] ?? 0));
    $pend = rc_pendencias($eid, $r, $a, $hoje);
    $sug = [];
    if (array_filter($pend, fn($p) => $p['nivel'] !== 'aviso')) {
        $ini = $a['inicio'] ?: $hoje; $fim = $a['fim'] ?: $ini;
        $ocup = []; foreach (rc_reservas($eid, $hoje, rc_mais($hoje, 13)) as $x) $ocup[$x['recurso_id']][] = $x;
        $base = rc_base($r['nome']); $ja = array_map('intval', array_column(todos('SELECT recurso_id FROM atividade_recursos WHERE atividade_id = ?', [$id]), 'recurso_id'));
        foreach (todos('SELECT * FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 AND tipo = ? AND id <> ?', [$eid, $r['tipo'], $r['id']]) as $o) {
            $bo = rc_base($o['nome']);                    // mesmo nome-base ("caminhao munck"); com uma palavra só, basta a primeira
            if ($bo !== $base && !((!str_contains($bo, ' ') || !str_contains($base, ' ')) && explode(' ', $bo)[0] === explode(' ', $base)[0])) continue;
            if (in_array((int)$o['id'], $ja, true)) continue;
            $p = rc_pendencias($eid, $o, $a, $hoje);
            if (array_filter($p, fn($x) => $x['nivel'] === 'grave')) continue;
            $sug[] = ['id' => (int)$o['id'], 'codigo' => $o['codigo'], 'nome' => $o['nome'], 'tipo' => $o['tipo'], 'propriedade' => $o['propriedade'],
                      'pendencias' => $p, 'ocupacao' => rc_ocupacao($ocup[(int)$o['id']] ?? [], $hoje), 'livre' => rc_periodo($ini, $fim)];
        }
        usort($sug, fn($x, $y) => [count($x['pendencias']), $x['ocupacao']] <=> [count($y['pendencias']), $y['ocupacao']]);
    }
    return ['recurso' => ['id' => (int)$r['id'], 'codigo' => $r['codigo'], 'nome' => $r['nome'], 'tipo' => $r['tipo']],
            'atividade' => ['id' => (int)$a['id'], 'descricao' => $a['descricao'], 'inicio' => $a['inicio'], 'fim' => $a['fim']],
            'pendencias' => $pend, 'sugestoes' => array_slice($sug, 0, 3), 'base' => $base ?? rc_base($r['nome'])];
}
