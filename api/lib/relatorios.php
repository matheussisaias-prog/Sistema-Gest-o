<?php
/* Aprumo · servidor · Relatórios: da obra para o cliente (curva S, feito, atrasadas, Travou, fotos, próximos passos e resumo
   do gestor), gerencial de todas as obras, Equipe e SST, Recursos e locação. Documento A4 com a logo da empresa + Excel.
   Cada relatório emitido fica guardado com número e conteúdo congelado. Só administrador e gestor. */
declare(strict_types=1);

const REL_TIPOS = ['obra' => 'Obra para o cliente', 'gerencial' => 'Gerencial de todas as obras', 'sst' => 'Equipe e SST', 'recursos' => 'Recursos e locação'];
const REL_SIGLA = ['gerencial' => 'GER', 'sst' => 'SST', 'recursos' => 'REC'];
const REL_SECOES = ['curva', 'feito', 'atrasadas', 'fotos', 'proximas', 'rdos'];

function rel_hoje(): string { return gmdate('Y-m-d', time() - 3 * 3600); }
function rel_br(?string $d): string { return $d ? substr($d, 8, 2) . '/' . substr($d, 5, 2) : '—'; }
function rel_br_ano(?string $d): string { return $d ? substr($d, 8, 2) . '/' . substr($d, 5, 2) . '/' . substr($d, 0, 4) : '—'; }
function rel_dias(string $a, string $b): int { return (int)round((strtotime("$b 12:00:00 UTC") - strtotime("$a 12:00:00 UTC")) / 86400); }
function rel_periodo_txt(string $i, string $f): string {
    if (substr($i, 8) === '01' && $f === gmdate('Y-m-t', strtotime("$i 12:00:00 UTC"))) return ucfirst(['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][(int)substr($i, 5, 2) - 1]) . '/' . substr($i, 0, 4);
    return rel_br($i) . ' a ' . rel_br_ano($f);
}
function rel_reais(?float $v): string { return $v === null ? '—' : 'R$ ' . number_format($v, 2, ',', '.'); }

/* ══ Relatório da obra ══════════════════════════════════════════════════════════ */
/** Atividades "folha" da obra com a linha de base (datas e peso planejados) e o histórico de avanço de cada uma. */
function rel_base_obra(int $eid, int $pid): array {
    $A = todos('SELECT a.id, a.pai_id, a.codigo_eap, a.descricao, a.inicio, a.fim, a.avanco, a.situacao, a.peso, a.responsavel_id, f.nome AS responsavel
                FROM atividades a LEFT JOIN funcionarios f ON f.id = a.responsavel_id WHERE a.projeto_id = ? AND a.empresa_id = ? AND a.excluido_em IS NULL ORDER BY a.ordem, a.id', [$pid, $eid]);
    $pais = []; foreach ($A as $a) if ($a['pai_id']) $pais[(int)$a['pai_id']] = true;
    $F = array_values(array_filter($A, fn($a) => !isset($pais[(int)$a['id']])));
    $base = [];
    foreach (todos('SELECT i.atividade_id, i.inicio, i.fim, i.peso FROM linhas_base lb JOIN linha_base_itens i ON i.linha_base_id = lb.id
                    WHERE lb.projeto_id = ? AND lb.numero = (SELECT MAX(x.numero) FROM linhas_base x WHERE x.projeto_id = ?)', [$pid, $pid]) as $b) $base[(int)$b['atividade_id']] = $b;
    $ev = [];                                    // eventos de avanço por atividade: [dia local, de, para]
    if ($F) {
        $in = implode(',', array_map(fn($a) => (int)$a['id'], $F));
        foreach (todos("SELECT atividade_id, de_avanco, para_avanco, criado_em FROM avancos WHERE atividade_id IN ($in) ORDER BY criado_em, id") as $v)
            $ev[(int)$v['atividade_id']][] = [gmdate('Y-m-d', strtotime($v['criado_em'] . ' UTC') - 3 * 3600), (int)$v['de_avanco'], (int)$v['para_avanco'], $v['criado_em']];
        foreach (todos("SELECT registro_id, antes, depois, quando FROM historico WHERE tabela = 'atividades' AND acao = 'alterou' AND registro_id IN ($in) AND depois LIKE '%\"avanco\"%' ORDER BY quando, id") as $h) {
            $d = json_decode((string)$h['depois'], true) ?: []; if (!array_key_exists('avanco', $d)) continue; $a0 = json_decode((string)$h['antes'], true) ?: [];
            $k = (int)$h['registro_id']; $t = gmdate('Y-m-d', strtotime($h['quando'] . ' UTC') - 3 * 3600);
            $dup = false; foreach ($ev[$k] ?? [] as $e) if ($e[0] === $t && $e[2] === (int)$d['avanco']) { $dup = true; break; }   // o avanço do campo grava nos dois lugares
            if (!$dup) $ev[$k][] = [$t, (int)($a0['avanco'] ?? 0), (int)$d['avanco'], $h['quando']];
        }
        foreach ($ev as &$l) usort($l, fn($x, $y) => strcmp($x[3], $y[3])); unset($l);
    }
    return [$F, $base, $ev];
}
/** Avanço de uma atividade no fim do dia $d (reconstruído pelo histórico). */
function rel_avanco_em(array $a, array $ev, string $d): int {
    if (!$ev) return (int)$a['avanco'];
    if ($d < $ev[0][0]) return $ev[0][1];
    $v = $ev[0][1]; foreach ($ev as $e) { if ($e[0] > $d) break; $v = $e[2]; }
    return $v;
}
function rel_peso(array $a, array $base): float { $b = $base[(int)$a['id']] ?? null; return (float)($b['peso'] ?? $a['peso'] ?? 1) ?: 1.0; }
function rel_real(array $F, array $base, array $ev, string $d): float {
    $sp = $sr = 0.0; foreach ($F as $a) { $p = rel_peso($a, $base); $sp += $p; $sr += $p * rel_avanco_em($a, $ev[(int)$a['id']] ?? [], $d); }
    return $sp > 0 ? round($sr / $sp, 1) : 0.0;
}
function rel_previsto(array $F, array $base, string $d): ?float {
    $sp = $sv = 0.0;
    foreach ($F as $a) { $b = $base[(int)$a['id']] ?? null; $fr = fracao_prevista($b['inicio'] ?? $a['inicio'], $b['fim'] ?? $a['fim'], $d);
        if ($fr === null) continue; $p = rel_peso($a, $base); $sp += $p; $sv += $p * $fr * 100; }
    return $sp > 0 ? round($sv / $sp, 1) : null;
}

/** Conteúdo do relatório da obra no período. */
function rel_obra(int $eid, array $p, string $ini, string $fim, array $secoes): array {
    $pid = (int)$p['id']; $hoje = rel_hoje(); $ate = min($fim, $hoje);
    [$F, $base, $ev] = rel_base_obra($eid, $pid);
    $real = rel_real($F, $base, $ev, $ate); $real0 = rel_real($F, $base, $ev, Calendario::mais($ini, -1));
    $prev = rel_previsto($F, $base, $ate); $prev0 = rel_previsto($F, $base, Calendario::mais($ini, -1));
    $fimPlano = null; $fimBase = null; $iniObra = null;
    foreach ($F as $a) { if ($a['fim']) $fimPlano = max($fimPlano ?? $a['fim'], $a['fim']); if ($a['inicio']) $iniObra = min($iniObra ?? $a['inicio'], $a['inicio']);
        $b = $base[(int)$a['id']] ?? null; if ($b && $b['fim']) $fimBase = max($fimBase ?? $b['fim'], $b['fim']); }
    $ref = $fimBase ?: $p['fim'];
    $desvioDias = $fimPlano && $ref ? rel_dias($ref, $fimPlano) : null;
    // curva S: pontos semanais do início ao fim previsto (real só até a data do relatório)
    $curva = [];
    $iniC = $iniObra ?: ($p['inicio'] ?: $ini); $fimC = max($fimPlano ?? $ate, $fimBase ?? $ate, $ate);
    $passo = max(1, (int)ceil(rel_dias($iniC, $fimC) / 40));
    for ($d = $iniC; $d <= $fimC; $d = Calendario::mais($d, $passo)) $curva[] = ['data' => $d, 'previsto' => rel_previsto($F, $base, $d), 'real' => $d <= $ate ? rel_real($F, $base, $ev, $d) : null];
    if (end($curva)['data'] !== $fimC) $curva[] = ['data' => $fimC, 'previsto' => rel_previsto($F, $base, $fimC), 'real' => $fimC <= $ate ? rel_real($F, $base, $ev, $fimC) : null];
    if (!array_filter($curva, fn($c) => $c['data'] === $ate)) { $curva[] = ['data' => $ate, 'previsto' => rel_previsto($F, $base, $ate), 'real' => $real]; usort($curva, fn($x, $y) => strcmp($x['data'], $y['data'])); }
    // feito no período
    $feito = [];
    foreach ($F as $a) { $e = $ev[(int)$a['id']] ?? []; $de = rel_avanco_em($a, $e, Calendario::mais($ini, -1)); $para = rel_avanco_em($a, $e, $ate);
        if ($para !== $de) $feito[] = ['atividade' => trim(($a['codigo_eap'] ? $a['codigo_eap'] . ' ' : '') . $a['descricao']), 'de' => $de, 'para' => $para, 'situacao' => $para >= 100 ? 'Concluída' : 'Em andamento', 'responsavel' => $a['responsavel']]; }
    usort($feito, fn($x, $y) => ($y['para'] - $y['de']) <=> ($x['para'] - $x['de']));
    // atrasadas (no fim do período) com o motivo aberto, e impedimentos do período
    $abertas = []; foreach (todos('SELECT atividade_id, descricao, data FROM ocorrencias WHERE projeto_id = ? AND resolvida_em IS NULL ORDER BY data', [$pid]) as $o) if ($o['atividade_id']) $abertas[(int)$o['atividade_id']] = $o['descricao'];
    $atras = [];
    foreach ($F as $a) { $v = rel_avanco_em($a, $ev[(int)$a['id']] ?? [], $ate);
        if ($a['fim'] && $a['fim'] < $ate && $v < 100) $atras[] = ['atividade' => $a['descricao'], 'fim' => $a['fim'], 'avanco' => $v, 'dias' => rel_dias($a['fim'], $ate), 'motivo' => $abertas[(int)$a['id']] ?? null, 'responsavel' => $a['responsavel']]; }
    usort($atras, fn($x, $y) => $y['dias'] <=> $x['dias']);
    $imped = array_map(fn($o) => ['data' => $o['data'], 'tipo' => $o['tipo'], 'atividade' => $o['atividade'], 'descricao' => $o['descricao'], 'liberada' => $o['resolvida_em'] ? gmdate('Y-m-d', strtotime($o['resolvida_em'] . ' UTC') - 3 * 3600) : null],
        todos('SELECT o.*, a.descricao AS atividade FROM ocorrencias o LEFT JOIN atividades a ON a.id = o.atividade_id WHERE o.projeto_id = ? AND o.data BETWEEN ? AND ? ORDER BY o.data', [$pid, $ini, $fim]));
    // fotos do período (as de avanço primeiro), próximas 2 semanas e RDOs
    $fotos = array_map(fn($f) => ['id' => (int)$f['id'], 'data' => gmdate('Y-m-d', strtotime($f['tirada_em'] . ' UTC') - 3 * 3600), 'atividade' => $f['atividade']],
        todos("SELECT f.id, f.tirada_em, a.descricao AS atividade FROM fotos f LEFT JOIN atividades a ON a.id = f.atividade_id WHERE f.projeto_id = ? AND f.excluido_em IS NULL AND f.no_rdo = 1
               AND f.tirada_em >= ? AND f.tirada_em < ? ORDER BY f.avanco_id IS NULL, f.tirada_em DESC LIMIT 12", [$pid, gmdate('Y-m-d H:i:s', strtotime("$ini 03:00:00 UTC")), gmdate('Y-m-d H:i:s', strtotime("$fim 03:00:00 UTC") + 86400)]));
    $lim = Calendario::mais($ate, 14);
    $prox = [];
    foreach ($F as $a) if ($a['inicio'] && $a['inicio'] <= $lim && ($a['fim'] ?: $a['inicio']) > $ate && (int)$a['avanco'] < 100) $prox[] = ['atividade' => $a['descricao'], 'inicio' => $a['inicio'], 'fim' => $a['fim'], 'responsavel' => $a['responsavel'], 'avanco' => (int)$a['avanco']];
    usort($prox, fn($x, $y) => strcmp($x['inicio'], $y['inicio'])); $prox = array_slice($prox, 0, 15);
    $rdos = array_map(fn($r) => ['numero' => $r['numero'] ? (int)$r['numero'] : null, 'data' => $r['data'], 'situacao' => $r['situacao'], 'efetivo' => $r['efetivo'] !== null ? (int)$r['efetivo'] : null],
        todos('SELECT numero, data, situacao, efetivo FROM rdos WHERE projeto_id = ? AND excluido_em IS NULL AND data BETWEEN ? AND ? ORDER BY data', [$pid, $ini, $fim]));
    $k = ['real' => $real, 'previsto' => $prev, 'desvio' => $prev === null ? null : round($real - $prev, 1), 'desvio_dias' => $desvioDias, 'termino' => $fimPlano,
          'avancou' => round($real - $real0, 1), 'previsto_periodo' => $prev === null || $prev0 === null ? null : round($prev - $prev0, 1), 'real_inicio' => $real0, 'ate' => $ate];
    return ['indicadores' => $k, 'curva' => $curva, 'feito' => $feito, 'atrasadas' => $atras, 'impedimentos' => $imped, 'fotos' => $fotos, 'proximas' => $prox, 'rdos' => $rdos, 'secoes' => $secoes,
            'resumo_sugerido' => rel_resumo_obra($k, $feito, $atras, $imped, $prox, $ini, $fim)];
}
/** Texto pronto com os números do período (o gestor ajusta). */
function rel_resumo_obra(array $k, array $feito, array $atras, array $imped, array $prox, string $ini, string $fim): string {
    $n = fn($v) => rtrim(rtrim(number_format((float)$v, 1, ',', ''), '0'), ',');
    $t = 'No período de ' . rel_br($ini) . ' a ' . rel_br_ano($fim) . ' a obra avançou ' . $n($k['avancou']) . ' ponto' . (abs($k['avancou']) == 1 ? '' : 's') . ' (de ' . $n($k['real_inicio']) . '% para ' . $n($k['real']) . '%)';
    if ($k['previsto_periodo'] !== null) $t .= ', contra ' . $n($k['previsto_periodo']) . ' ponto' . ($k['previsto_periodo'] == 1 ? '' : 's') . ' previsto' . ($k['previsto_periodo'] == 1 ? '' : 's');
    $t .= '.';
    if ($k['desvio'] !== null) $t .= $k['desvio'] < -0.5 ? ' Estamos ' . $n(-$k['desvio']) . ' pontos abaixo do planejado' : ($k['desvio'] > 0.5 ? ' Estamos ' . $n($k['desvio']) . ' pontos acima do planejado' : ' O avanço está em linha com o planejado');
    if ($k['desvio_dias']) $t .= $k['desvio_dias'] > 0 ? ', com previsão de término ' . $k['desvio_dias'] . ' dia' . ($k['desvio_dias'] > 1 ? 's' : '') . ' depois da data de referência' : ', com previsão de término ' . -$k['desvio_dias'] . ' dia' . ($k['desvio_dias'] < -1 ? 's' : '') . ' antes da data de referência';
    $t .= $k['desvio'] !== null || $k['desvio_dias'] ? '.' : '';
    $conc = array_values(array_filter($feito, fn($f) => $f['situacao'] === 'Concluída')); $and = array_values(array_filter($feito, fn($f) => $f['situacao'] !== 'Concluída'));
    if ($conc) $t .= ' Concluímos ' . implode(', ', array_map(fn($f) => mb_strtolower(mb_substr($f['atividade'], 0, 1)) . mb_substr($f['atividade'], 1), array_slice($conc, 0, 3))) . '.';
    if ($and) $t .= ' Seguimos em ' . implode(', ', array_map(fn($f) => preg_replace('/^[\d.]+ /', '', $f['atividade']) . ' (' . $f['para'] . '%)', array_slice($and, 0, 3))) . '.';
    if ($imped) $t .= ' Tivemos ' . count($imped) . ' impedimento' . (count($imped) > 1 ? 's' : '') . ' no período (' . implode('; ', array_map(fn($i) => mb_strtolower($i['tipo']) . ($i['atividade'] ? ' em ' . $i['atividade'] : ''), array_slice($imped, 0, 2))) . ').';
    if ($atras) $t .= ' ' . count($atras) . ' atividade' . (count($atras) > 1 ? 's estão' : ' está') . ' atrasada' . (count($atras) > 1 ? 's' : '') . '.';
    $novas = array_values(array_filter($prox, fn($p) => $p['inicio'] > $k['ate']));
    if ($novas) $t .= ' Próximos passos: ' . implode(', ', array_map(fn($p) => $p['atividade'] . ' (a partir de ' . rel_br($p['inicio']) . ')', array_slice($novas, 0, 3))) . '.';
    return $t;
}

/* ══ Gerencial, Equipe e SST, Recursos ══════════════════════════════════════════ */
function rel_gerencial(int $eid, string $ini, string $fim): array {
    $hoje = rel_hoje(); $ate = min($fim, $hoje); $ontem = Calendario::mais($hoje, -1);
    $obras = todos("SELECT * FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao IN ('Em andamento','Pausado') ORDER BY codigo, nome", [$eid]);
    $res = rc_reservas($eid, $ini, max($fim, Calendario::mais($hoje, 14))); $conf = rc_conflitos($res);
    $L = []; $pontos = [];
    foreach ($obras as $p) {
        $pid = (int)$p['id']; [$F, $base, $ev] = rel_base_obra($eid, $pid);
        $real = rel_real($F, $base, $ev, $ate); $prev = rel_previsto($F, $base, $ate);
        $fimPlano = null; $fimBase = null; foreach ($F as $a) { if ($a['fim']) $fimPlano = max($fimPlano ?? $a['fim'], $a['fim']); $b = $base[(int)$a['id']] ?? null; if ($b && $b['fim']) $fimBase = max($fimBase ?? $b['fim'], $b['fim']); }
        $ref = $fimBase ?: $p['fim']; $dd = $fimPlano && $ref ? rel_dias($ref, $fimPlano) : null;
        $atr = count(array_filter($F, fn($a) => $a['fim'] && $a['fim'] < $ate && rel_avanco_em($a, $ev[(int)$a['id']] ?? [], $ate) < 100));
        $cal = calendario_da_obra($pid, $eid); $tem = array_column(todos('SELECT data, situacao FROM rdos WHERE projeto_id = ? AND excluido_em IS NULL AND data BETWEEN ? AND ?', [$pid, $ini, $fim]), 'situacao', 'data');
        $semRdo = 0; for ($d = max($ini, $p['inicio'] ?: $ini); $d <= min($fim, $ontem); $d = Calendario::mais($d, 1)) if ($cal->util($d) && !isset($tem[$d])) $semRdo++;
        $rasc = count(array_filter($tem, fn($s) => $s === 'Rascunho'));
        $eq = count(array_unique(array_filter(array_map(fn($a) => $a['responsavel_id'] && $a['inicio'] && $a['inicio'] <= $fim && ($a['fim'] ?: $a['inicio']) >= $ini ? (int)$a['responsavel_id'] : null, $F))));
        $cf = count(array_filter($conf, fn($c) => in_array($pid, array_column($c['atividades'], 'projeto_id'), true)));
        $farol = farol_obra($p, $real, $prev, $ate) ?? 'cinza';
        $L[] = ['codigo' => $p['codigo'], 'nome' => $p['nome'], 'situacao' => $p['situacao'], 'real' => $real, 'previsto' => $prev, 'desvio_dias' => $dd, 'farol' => $farol, 'atrasadas' => $atr,
                'sem_rdo' => $semRdo, 'rascunhos' => $rasc, 'equipe' => $eq, 'conflitos' => $cf];
        $cod = $p['codigo'] ?: $p['nome'];
        if ($atr) $pontos[] = "$cod: $atr atividade" . ($atr > 1 ? 's' : '') . ' atrasada' . ($atr > 1 ? 's' : '') . ($dd > 0 ? ", término previsto $dd dia" . ($dd > 1 ? 's' : '') . ' depois do planejado' : '') . '.';
        if ($semRdo) $pontos[] = "$cod: $semRdo " . ($semRdo > 1 ? 'dias úteis' : 'dia útil') . ' sem RDO no período.';
    }
    foreach (array_slice($conf, 0, 3) as $c) $pontos[] = (um('SELECT nome FROM recursos WHERE id = ?', [$c['recurso_id']])['nome'] ?? 'Recurso') . ': reservas ao mesmo tempo em ' . implode(' e ', array_map(fn($a) => $a['obra'], $c['atividades'])) . ' (' . rel_br($c['de']) . ($c['ate'] !== $c['de'] ? ' a ' . rel_br($c['ate']) : '') . ').';
    $sst = rel_sst($eid, $ini, $fim, true);
    if ($sst['indicadores']['alocados_vencidos']) $pontos[] = $sst['indicadores']['alocados_vencidos'] . ' pessoa' . ($sst['indicadores']['alocados_vencidos'] > 1 ? 's' : '') . ' com documento de NR vencido ou faltando alocada' . ($sst['indicadores']['alocados_vencidos'] > 1 ? 's' : '') . ' nas próximas 2 semanas.';
    $k = ['obras' => count(array_filter($L, fn($o) => $o['situacao'] === 'Em andamento')), 'atencao' => count(array_filter($L, fn($o) => $o['farol'] === 'amarelo')),
          'atrasadas' => count(array_filter($L, fn($o) => $o['farol'] === 'vermelho')), 'sem_rdo' => array_sum(array_column($L, 'sem_rdo')), 'conflitos' => count($conf)];
    return ['indicadores' => $k, 'obras' => $L, 'pontos' => $pontos ?: ['Nenhum ponto de atenção no período.']];
}
function rel_sst(int $eid, string $ini, string $fim, bool $soResumo = false): array {
    $hoje = rel_hoje();
    $P = todos('SELECT f.*, NULL AS encarregado_nome FROM funcionarios f WHERE f.empresa_id = ? AND f.excluido_em IS NULL AND f.ativo = 1 ORDER BY f.nome', [$eid]);
    $fids = array_map(fn($p) => (int)$p['id'], $P);
    $exig = eq_exigencias($eid, $P, $hoje); $docs = eq_documentos($eid, $fids); $nomes = eq_nomes_tipos($eid); $carga = eq_cargas($eid, $fids, $hoje);
    $venc = []; $vencendo = []; $comProblema = [];
    foreach ($P as $p) { $f = (int)$p['id'];
        foreach ($exig[$f] ?? [] as $t => $x) { $d = $docs[$f][$t] ?? null; [$s, $txt] = eq_situacao($d, $hoje, $x['ate']);
            $l = ['pessoa' => $p['nome'], 'cargo' => $p['cargo'], 'documento' => $nomes[$t] ?? 'Documento', 'obras' => implode(' · ', $carga[$f]['obras'] ?? [])];
            if ($s === 'falta' || $s === 'vencido') { $venc[] = $l + ['situacao' => $s === 'falta' ? 'Falta' : ($txt === 'Vencido' && $d ? 'Vencido ' . rel_br($d['vence_em']) : $txt)]; $comProblema[$f] = true; }
            elseif ($s === 'vencendo' || $s === 'vence_antes') $vencendo[] = $l + ['vence' => $d['vence_em']]; } }
    usort($vencendo, fn($a, $b) => strcmp($a['vence'], $b['vence']));
    $aloc = count(array_filter(array_keys($comProblema), fn($f) => !empty($carga[$f]['obras'])));
    $k = ['pessoas' => count($P), 'vencidos' => count($venc), 'vencendo' => count($vencendo), 'alocados_vencidos' => $aloc];
    if ($soResumo) return ['indicadores' => $k];
    $aus = array_map(fn($a) => ['pessoa' => $a['nome'], 'tipo' => $a['tipo'], 'inicio' => $a['inicio'], 'fim' => $a['fim']],
        todos('SELECT a.*, f.nome FROM ausencias a JOIN funcionarios f ON f.id = a.funcionario_id WHERE a.empresa_id = ? AND a.excluido_em IS NULL AND a.inicio <= ? AND a.fim >= ? ORDER BY a.inicio', [$eid, $fim, $ini]));
    $k['ausentes'] = count(array_unique(array_column($aus, 'pessoa')));
    $cg = [];
    foreach ($P as $p) { $c = $carga[(int)$p['id']] ?? null; if ($c && ($c['carga'] >= 85 || $c['carga'] >= 999)) $cg[] = ['pessoa' => $p['nome'], 'carga' => $c['carga'], 'obras' => implode(' · ', $c['obras'])]; }
    usort($cg, fn($a, $b) => $b['carga'] <=> $a['carga']);
    return ['indicadores' => $k, 'vencidos' => $venc, 'vencendo' => $vencendo, 'ausencias' => $aus, 'carga' => $cg];
}
function rel_recursos(int $eid, string $ini, string $fim, bool $custo): array {
    $dias = rel_dias($ini, $fim) + 1; $hoje = rel_hoje();
    $res = rc_reservas($eid, $ini, $fim, null, true);
    $loc = []; $total = 0.0;
    foreach (todos('SELECT l.*, f.nome AS fornecedor, r.nome AS recurso, r.codigo FROM locacoes l JOIN recursos r ON r.id = l.recurso_id LEFT JOIN fornecedores f ON f.id = l.fornecedor_id
                    WHERE l.empresa_id = ? AND l.excluido_em IS NULL AND l.retirada <= ? AND COALESCE(l.devolvido_em, l.devolucao_prevista) >= ? ORDER BY l.retirada', [$eid, $fim, $ini]) as $l) {
        $a = max($ini, $l['retirada']); $b = min($fim, $l['devolvido_em'] ?: $l['devolucao_prevista']); $n = max(0, rel_dias($a, $b) + 1);
        $v = $l['custo'] !== null ? round(rc_custo_dia($l) * $n, 2) : null; if ($v) $total += $v;
        $obras = array_values(array_unique(array_map(fn($x) => $x['obra_cod'], array_filter($res, fn($x) => $x['recurso_id'] === (int)$l['recurso_id'] && $x['inicio'] <= $b && $x['fim'] >= $a))));
        $loc[] = ['recurso' => trim(($l['codigo'] ? $l['codigo'] . ' ' : '') . $l['recurso']), 'fornecedor' => $l['fornecedor'], 'obras' => implode(' · ', $obras) ?: '—', 'de' => $a, 'ate' => $b, 'dias' => $n] + ($custo ? ['custo' => $v] : []);
    }
    $uso = [];
    foreach (todos('SELECT id, codigo, nome FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 ORDER BY nome', [$eid]) as $r) {
        $D = []; $ob = [];
        foreach ($res as $x) if ($x['recurso_id'] === (int)$r['id']) { $ob[$x['obra_cod']] = true; for ($d = max($ini, $x['inicio']); $d <= min($fim, $x['fim']); $d = Calendario::mais($d, 1)) $D[$d] = true; }
        $uso[] = ['recurso' => trim(($r['codigo'] ? $r['codigo'] . ' ' : '') . $r['nome']), 'dias' => count($D), 'ocupacao' => (int)round(count($D) / $dias * 100), 'obras' => implode(' · ', array_keys($ob)) ?: '—'];
    }
    usort($uso, fn($a, $b) => $b['dias'] <=> $a['dias']);
    $ctrl = [];
    foreach (rc_controles($eid, null, $hoje) as $rid => $c) foreach ($c['itens'] ?? [] as $i) if (in_array($i['situacao'], ['vencido', 'vencendo'], true)) {
        $r = um('SELECT codigo, nome FROM recursos WHERE id = ? AND excluido_em IS NULL', [$rid]); if ($r) $ctrl[] = ['recurso' => trim(($r['codigo'] ? $r['codigo'] . ' ' : '') . $r['nome']), 'item' => $i['item'], 'situacao' => $i['situacao_texto']]; }
    $conf = array_map(fn($c) => ['recurso' => um('SELECT nome FROM recursos WHERE id = ?', [$c['recurso_id']])['nome'] ?? '', 'obras' => implode(' e ', array_map(fn($a) => $a['obra'] . ' · ' . $a['descricao'], $c['atividades'])), 'de' => $c['de'], 'ate' => $c['ate']], rc_conflitos(array_values(array_filter($res, fn($x) => $x['situacao'] !== 'Concluído'))));
    $k = ['equipamentos' => count($uso), 'alugados' => count(array_unique(array_column($loc, 'recurso'))), 'conflitos' => count($conf)] + ($custo ? ['custo' => round($total, 2)] : []);
    return ['indicadores' => $k, 'locacoes' => $loc, 'uso' => $uso, 'controles' => $ctrl, 'conflitos' => $conf];
}

/* ══ Rotas ══════════════════════════════════════════════════════════════════════ */
function rel_entrada(array $u, array $d): array {
    $tipo = (string)($d['tipo'] ?? ''); if (!isset(REL_TIPOS[$tipo])) throw new ErroApi('Tipo de relatório inválido');
    $ini = data_ok((string)($d['inicio'] ?? ''), 'início'); $fim = data_ok((string)($d['fim'] ?? ''), 'fim');
    if (!$ini || !$fim) throw new ErroApi('Informe o período'); if ($fim < $ini) throw new ErroApi('O fim não pode ser antes do início');
    if (rel_dias($ini, $fim) > 400) throw new ErroApi('Período grande demais (até 13 meses)');
    if ($ini > rel_hoje()) throw new ErroApi('O período ainda não começou');
    $p = null;
    if ($tipo === 'obra') { $p = obra_da_empresa($u, (int)($d['projeto_id'] ?? 0)); }
    $sec = is_array($d['secoes'] ?? null) ? array_values(array_intersect(REL_SECOES, $d['secoes'])) : ['curva', 'feito', 'atrasadas', 'fotos', 'proximas'];
    return [$tipo, $ini, $fim, $p, $sec];
}
function rel_conteudo(array $u, string $tipo, string $ini, string $fim, ?array $p, array $sec): array {
    $eid = (int)$u['empresa_id'];
    return match ($tipo) { 'obra' => rel_obra($eid, $p, $ini, $fim, $sec), 'gerencial' => rel_gerencial($eid, $ini, $fim), 'sst' => rel_sst($eid, $ini, $fim), 'recursos' => rel_recursos($eid, $ini, $fim, true) };
}
/** POST /api/relatorios/previa — conteúdo calculado (e o resumo sugerido, no da obra). */
function rota_relatorio_previa(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    [$tipo, $ini, $fim, $p, $sec] = rel_entrada($u, corpo());
    return ['tipo' => $tipo, 'conteudo' => rel_conteudo($u, $tipo, $ini, $fim, $p, $sec)];
}
/** GET|POST /api/relatorios — emitidos (GET) e emitir (POST {tipo, projeto_id?, inicio, fim, secoes?, resumo?}). */
function rota_relatorios(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id'];
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $d = corpo(); [$tipo, $ini, $fim, $p, $sec] = rel_entrada($u, $d);
        $cont = rel_conteudo($u, $tipo, $ini, $fim, $p, $sec);
        $resumo = $tipo === 'obra' ? mb_substr(trim((string)($d['resumo'] ?? '')) ?: $cont['resumo_sugerido'], 0, 5000) : null;
        $pid = $p ? (int)$p['id'] : null;
        $num = (int)(um('SELECT MAX(numero) AS n FROM relatorios WHERE empresa_id = ? AND tipo = ?' . ($pid ? ' AND projeto_id = ' . $pid : ''), [$eid, $tipo])['n'] ?? 0) + 1;
        $ref = $tipo === 'obra' ? sprintf('REL-%s-%02d', preg_replace('/[^A-Za-z0-9\-]/', '', (string)($p['codigo'] ?: 'OBRA' . $pid)), $num) : sprintf('REL-%s-%03d', REL_SIGLA[$tipo], $num);
        $obra = $p ? ['codigo' => $p['codigo'], 'nome' => $p['nome'], 'cliente' => $p['cliente'], 'contrato' => $p['numero_contrato'], 'local' => $p['local_obra']] : null;
        $nome = um('SELECT nome FROM usuarios WHERE id = ?', [$u['id']])['nome'] ?? '';
        $dados = ['conteudo' => $cont, 'empresa' => rdo_empresa($eid), 'obra' => $obra, 'emitido_por' => $nome, 'emitido_em' => gmdate('Y-m-d H:i:s', time() - 3 * 3600)];
        $codigo = strtoupper(substr(bin2hex(random_bytes(4)), 0, 4) . '-' . substr(bin2hex(random_bytes(4)), 0, 4));
        $id = inserir('relatorios', ['empresa_id' => $eid, 'tipo' => $tipo, 'numero' => $num, 'referencia' => $ref, 'projeto_id' => $pid, 'inicio' => $ini, 'fim' => $fim,
            'secoes' => implode(',', $sec), 'resumo' => $resumo, 'dados' => json_encode($dados, JSON_UNESCAPED_UNICODE), 'codigo' => $codigo, 'emitido_por' => $u['id'], 'emitido_em' => gmdate('Y-m-d H:i:s')]);
        registrar($u, $eid, 'relatorios', $id, 'criou', null, ['referencia' => $ref, 'tipo' => $tipo, 'periodo' => "$ini a $fim"]);
        return ['ok' => true, 'id' => $id, 'referencia' => $ref];
    }
    $L = todos('SELECT r.id, r.tipo, r.referencia, r.inicio, r.fim, r.emitido_em, r.projeto_id, u.nome AS emitido_por, p.codigo, p.nome AS obra
                FROM relatorios r LEFT JOIN usuarios u ON u.id = r.emitido_por LEFT JOIN projetos p ON p.id = r.projeto_id
                WHERE r.empresa_id = ? AND r.excluido_em IS NULL ORDER BY r.emitido_em DESC, r.id DESC LIMIT 200', [$eid]);
    return ['hoje' => rel_hoje(), 'pode_excluir' => $u['perfil'] === 'administrador', 'tipos' => REL_TIPOS,
            'emitidos' => array_map(fn($r) => ['id' => (int)$r['id'], 'tipo' => $r['tipo'], 'referencia' => $r['referencia'], 'tipo_nome' => REL_TIPOS[$r['tipo']], 'obra' => $r['codigo'] ?: ($r['obra'] ?: 'Todas'),
                'periodo' => rel_periodo_txt($r['inicio'], $r['fim']), 'inicio' => $r['inicio'], 'fim' => $r['fim'], 'emitido_por' => $r['emitido_por'], 'emitido_em' => gmdate('Y-m-d H:i:s', strtotime($r['emitido_em'] . ' UTC') - 3 * 3600)], $L),
            'obras' => array_map(fn($o) => ['id' => (int)$o['id'], 'codigo' => $o['codigo'], 'nome' => $o['nome'], 'situacao' => $o['situacao']],
                todos("SELECT id, codigo, nome, situacao FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao <> 'Arquivado' ORDER BY situacao = 'Em andamento' DESC, codigo", [$eid]))];
}
function rel_ler(array $u, int $id): array {
    exigir_perfil($u, PODE_TUDO);
    $r = um('SELECT * FROM relatorios WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$r) throw new ErroApi('Relatório não encontrado', 404);
    return $r;
}
function rota_relatorio_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador']); $r = rel_ler($u, $id);
    q('UPDATE relatorios SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'relatorios', $id, 'excluiu', ['referencia' => $r['referencia']]);
    return ['ok' => true];
}

/* ══ Documento A4 ═══════════════════════════════════════════════════════════════ */
function rel_e($s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function rel_tabela(array $cab, array $linhas): string {
    if (!$linhas) return '<div class="caixa">Nada no período.</div>';
    return '<table><tr>' . implode('', array_map(fn($c) => '<th>' . rel_e($c) . '</th>', $cab)) . '</tr>' . implode('', array_map(fn($l) => '<tr>' . implode('', array_map(fn($c) => '<td>' . (is_array($c) ? $c[0] : rel_e($c)) . '</td>', $l)) . '</tr>', $linhas)) . '</table>';
}
function rel_kpi($n, string $t, string $cor = ''): string { return '<div class="kpi"><b' . ($cor ? " style=\"color:$cor\"" : '') . '>' . rel_e($n) . '</b><span>' . rel_e($t) . '</span></div>'; }
function rel_svg_curva(array $C, string $cor): string {
    $w = 700; $h = 170; $n = count($C); if ($n < 2) return '';
    $X = fn($i) => 34 + $i * ($w - 44) / ($n - 1); $Y = fn($v) => $h - 18 - $v * ($h - 30) / 100;
    $g = ''; foreach ([0, 25, 50, 75, 100] as $v) $g .= '<line x1="34" x2="' . ($w - 10) . '" y1="' . $Y($v) . '" y2="' . $Y($v) . '" stroke="#e2e8f0"/><text x="2" y="' . ($Y($v) + 3) . '" font-size="9" fill="#64748b">' . $v . '%</text>';
    $pp = []; $rr = []; $ultimo = null;
    foreach ($C as $i => $c) { if ($c['previsto'] !== null) $pp[] = round($X($i), 1) . ',' . round($Y($c['previsto']), 1); if ($c['real'] !== null) { $rr[] = round($X($i), 1) . ',' . round($Y($c['real']), 1); $ultimo = [$i, $c]; } }
    $rot = ''; foreach ([0, (int)floor(($n - 1) / 2), $n - 1] as $i) $rot .= '<text x="' . round($X($i) - 14) . '" y="' . ($h - 3) . '" font-size="9" fill="#64748b">' . rel_br($C[$i]['data']) . '</text>';
    $hoje = $ultimo ? '<line x1="' . $X($ultimo[0]) . '" x2="' . $X($ultimo[0]) . '" y1="6" y2="' . ($h - 18) . '" stroke="#0f172a" stroke-dasharray="3 3" opacity=".45"/><text x="' . ($X($ultimo[0]) + 4) . '" y="' . max(12, $Y($ultimo[1]['real']) - 6) . '" font-size="10" font-weight="700" fill="' . $cor . '">real ' . rtrim(rtrim(number_format($ultimo[1]['real'], 1, ',', ''), '0'), ',') . '%</text>' : '';
    return '<svg viewBox="0 0 ' . $w . ' ' . $h . '" width="100%" role="img" aria-label="Curva S">' . $g . $rot . '<polyline points="' . implode(' ', $pp) . '" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 4"/>'
        . '<polyline points="' . implode(' ', $rr) . '" fill="none" stroke="' . $cor . '" stroke-width="2.8"/>' . $hoje
        . '<text x="' . ($w - 120) . '" y="16" font-size="9" fill="#64748b">— — previsto   ━ real</text></svg>';
}
function rel_corpo(string $tipo, array $C, ?array $O, ?string $resumo, string $cor, string $fb): string {
    $pct = fn($v) => $v === null ? '—' : rtrim(rtrim(number_format((float)$v, 1, ',', ''), '0'), ',') . '%';
    $h = '';
    if ($tipo === 'obra') {
        $k = $C['indicadores']; $s = $C['secoes'];
        $h .= '<table class="k"><tr><td>Obra</td><td>' . rel_e(trim(($O['codigo'] ? $O['codigo'] . ' · ' : '') . $O['nome'])) . ($O['local'] ? ' · ' . rel_e($O['local']) : '') . '</td></tr><tr><td>Cliente</td><td>' . rel_e($O['cliente'] ?: '—') . ($O['contrato'] ? ' · Contrato ' . rel_e($O['contrato']) : '') . '</td></tr></table>';
        $h .= '<div class="kpis">' . rel_kpi($pct($k['real']), 'avanço real') . rel_kpi($pct($k['previsto']), 'previsto para ' . rel_br($k['ate']))
            . rel_kpi($k['desvio'] === null ? '—' : ($k['desvio'] > 0 ? '+' : '') . rtrim(rtrim(number_format($k['desvio'], 1, ',', ''), '0'), ',') . ' pts', $k['desvio'] < 0 ? 'abaixo do previsto' : 'em relação ao previsto', $k['desvio'] < -5 ? '#b91c1c' : ($k['desvio'] < 0 ? '#b45309' : '#15803d'))
            . rel_kpi($k['desvio_dias'] === null ? '—' : ($k['desvio_dias'] > 0 ? '+' : '') . $k['desvio_dias'] . ' dias', 'desvio no término', $k['desvio_dias'] > 0 ? '#b91c1c' : '#15803d') . rel_kpi(rel_br_ano($k['termino']), 'término previsto') . '</div>';
        $h .= '<h2>Resumo do período</h2><div class="caixa">' . nl2br(rel_e($resumo)) . '</div>';
        if (in_array('curva', $s, true)) $h .= '<h2>Curva S · avanço acumulado</h2><div class="graf">' . rel_svg_curva($C['curva'], $cor) . '</div>';
        if (in_array('feito', $s, true)) $h .= '<h2>Feito no período</h2>' . rel_tabela(['Atividade', 'Avanço no período', 'Situação', 'Responsável'], array_map(fn($f) => [$f['atividade'], $f['de'] . '% → ' . $f['para'] . '%', $f['situacao'], $f['responsavel'] ?: '—'], $C['feito']));
        if (in_array('atrasadas', $s, true)) {
            $h .= '<h2>Atrasadas</h2>' . rel_tabela(['Atividade', 'Previsto terminar', 'Avanço', 'Motivo'], array_map(fn($a) => [$a['atividade'], rel_br($a['fim']) . ' (' . $a['dias'] . ' d)', $a['avanco'] . '%', $a['motivo'] ?: '—'], $C['atrasadas']));
            $h .= '<h2>Impedimentos (Travou)</h2>' . rel_tabela(['Dia', 'Tipo', 'Atividade', 'Descrição', 'Liberada'], array_map(fn($i) => [rel_br($i['data']), $i['tipo'], $i['atividade'] ?: '—', $i['descricao'], $i['liberada'] ? rel_br($i['liberada']) : 'em aberto'], $C['impedimentos']));
        }
        if (in_array('fotos', $s, true) && $C['fotos']) $h .= '<h2>Fotos (' . count($C['fotos']) . ')</h2><div class="fotos">' . implode('', array_map(fn($f) => '<figure><img src="' . $fb . (int)$f['id'] . '" alt=""><figcaption>' . rel_br($f['data']) . ($f['atividade'] ? ' · ' . rel_e($f['atividade']) : '') . '</figcaption></figure>', $C['fotos'])) . '</div>';
        if (in_array('proximas', $s, true)) $h .= '<h2>Próximas 2 semanas</h2>' . rel_tabela(['Atividade', 'Início', 'Fim', 'Responsável'], array_map(fn($p) => [$p['atividade'], rel_br($p['inicio']), rel_br($p['fim']), $p['responsavel'] ?: '—'], $C['proximas']));
        if (in_array('rdos', $s, true)) $h .= '<h2>RDOs do período</h2>' . rel_tabela(['Nº', 'Dia', 'Situação', 'Efetivo'], array_map(fn($r) => [$r['numero'] ?: '—', rel_br($r['data']), $r['situacao'], $r['efetivo'] ?? '—'], $C['rdos']));
    } elseif ($tipo === 'gerencial') {
        $k = $C['indicadores']; $far = ['verde' => ['#15803d', 'Em dia'], 'amarelo' => ['#b45309', 'Atenção'], 'vermelho' => ['#b91c1c', 'Atrasada'], 'cinza' => ['#64748b', '—']];
        $h .= '<div class="kpis">' . rel_kpi($k['obras'], 'obras em andamento') . rel_kpi($k['atencao'], 'em atenção', '#b45309') . rel_kpi($k['atrasadas'], 'atrasadas', '#b91c1c') . rel_kpi($k['sem_rdo'], 'dias úteis sem RDO', $k['sem_rdo'] ? '#b91c1c' : '') . rel_kpi($k['conflitos'], 'conflitos de recurso', $k['conflitos'] ? '#b45309' : '') . '</div>';
        $h .= '<h2>Obras</h2>' . rel_tabela(['Obra', 'Real / previsto', 'Desvio término', 'Farol', 'Atrasadas', 'RDO pendente', 'Equipe', 'Conflitos'], array_map(fn($o) => [['<b>' . rel_e($o['codigo']) . '</b> · ' . rel_e($o['nome']) . ($o['situacao'] === 'Pausado' ? ' <i>(pausada)</i>' : '')],
            $pct($o['real']) . ' / ' . $pct($o['previsto']), $o['desvio_dias'] === null ? '—' : ($o['desvio_dias'] > 0 ? '+' : '') . $o['desvio_dias'] . ' d', ['<b style="color:' . $far[$o['farol']][0] . ';white-space:nowrap">● ' . $far[$o['farol']][1] . '</b>'], $o['atrasadas'], $o['sem_rdo'] + $o['rascunhos'], $o['equipe'], $o['conflitos']], $C['obras']));
        $h .= '<h2>Avanço real × previsto (traço = previsto)</h2><div class="graf barras">' . implode('', array_map(fn($o) => '<div class="br"><span>' . rel_e($o['codigo'] ?: $o['nome']) . '</span><div><i style="width:' . min(100, (float)$o['real']) . '%;background:' . $far[$o['farol']][0] . '"></i>' . ($o['previsto'] !== null ? '<em style="left:' . min(100, (float)$o['previsto']) . '%"></em>' : '') . '</div></div>', $C['obras'])) . '</div>';
        $h .= '<h2>Pontos de atenção</h2><div class="caixa"><ul>' . implode('', array_map(fn($p) => '<li>' . rel_e($p) . '</li>', $C['pontos'])) . '</ul></div>';
    } elseif ($tipo === 'sst') {
        $k = $C['indicadores'];
        $h .= '<div class="kpis">' . rel_kpi($k['pessoas'], 'pessoas ativas') . rel_kpi($k['vencidos'], 'vencido ou faltando', $k['vencidos'] ? '#b91c1c' : '') . rel_kpi($k['vencendo'], 'vencendo em 30 dias', $k['vencendo'] ? '#b45309' : '') . rel_kpi($k['ausentes'], 'ausentes no período') . '</div>';
        $h .= '<h2>Documentos vencidos ou faltando</h2>' . rel_tabela(['Pessoa', 'Cargo', 'Documento', 'Situação', 'Alocada em'], array_map(fn($v) => [$v['pessoa'], $v['cargo'] ?: '—', $v['documento'], $v['situacao'], $v['obras'] ?: '—'], $C['vencidos']));
        $h .= '<h2>Vencendo em 30 dias</h2>' . rel_tabela(['Pessoa', 'Documento', 'Vence em'], array_map(fn($v) => [$v['pessoa'], $v['documento'], rel_br_ano($v['vence'])], $C['vencendo']));
        $h .= '<h2>Ausências no período</h2>' . rel_tabela(['Pessoa', 'Tipo', 'Período'], array_map(fn($a) => [$a['pessoa'], $a['tipo'], rel_br($a['inicio']) . ' a ' . rel_br($a['fim'])], $C['ausencias']));
        $h .= '<h2>Carga alta (próximos 14 dias)</h2>' . rel_tabela(['Pessoa', 'Carga', 'Obras'], array_map(fn($c) => [$c['pessoa'], $c['carga'] >= 999 ? 'ausente' : $c['carga'] . '%' . ($c['carga'] > 100 ? ' · acima' : ''), $c['obras'] ?: '—'], $C['carga']));
    } else {
        $k = $C['indicadores'];
        $h .= '<div class="kpis">' . rel_kpi($k['equipamentos'], 'equipamentos ativos') . rel_kpi($k['alugados'], 'alugados no período') . (isset($k['custo']) ? rel_kpi(rel_reais($k['custo']), 'locação no período', '#0f3d6e') : '') . rel_kpi($k['conflitos'], 'conflitos', $k['conflitos'] ? '#b45309' : '') . '</div>';
        $h .= '<h2>Locação no período</h2>' . rel_tabela(array_merge(['Equipamento', 'Fornecedor', 'Obras', 'Período', 'Dias'], isset($k['custo']) ? ['Custo'] : []), array_merge(array_map(fn($l) => array_merge([$l['recurso'], $l['fornecedor'] ?: '—', $l['obras'], rel_br($l['de']) . ' a ' . rel_br($l['ate']), $l['dias']], array_key_exists('custo', $l) ? [rel_reais($l['custo'])] : []), $C['locacoes']),
            isset($k['custo']) && $C['locacoes'] ? [['', '', '', '', [ '<b>Total</b>'], ['<b>' . rel_reais($k['custo']) . '</b>']]] : []));
        $h .= '<h2>Uso dos equipamentos</h2>' . rel_tabela(['Equipamento', 'Dias reservados', 'Ocupação', 'Obras'], array_map(fn($x) => [$x['recurso'], $x['dias'], $x['ocupacao'] . '%', $x['obras']], array_values(array_filter($C['uso'], fn($x) => $x['dias'] > 0))));
        $h .= '<h2>Calibração e manutenção</h2>' . rel_tabela(['Equipamento', 'Item', 'Situação'], array_map(fn($x) => [$x['recurso'], $x['item'], $x['situacao']], $C['controles']));
        $h .= '<h2>Conflitos de reserva</h2>' . rel_tabela(['Equipamento', 'Atividades', 'Dias'], array_map(fn($x) => [$x['recurso'], $x['obras'], rel_br($x['de']) . ' a ' . rel_br($x['ate'])], $C['conflitos']));
    }
    return $h;
}
function rel_html(string $tipo, array $D, ?string $resumo, string $ini, string $fim, ?string $ref, ?string $codigo, bool $previa, bool $embutido = false): string {
    $fb = $embutido ? 'api/fotos/' : '../../fotos/';
    $E = $D['empresa']; $cor = preg_match('/^#[0-9a-f]{6}$/i', (string)$E['cor']) ? $E['cor'] : '#0f3d6e';
    $tit = ['obra' => 'RELATÓRIO DE ANDAMENTO DA OBRA', 'gerencial' => 'RELATÓRIO GERENCIAL DAS OBRAS', 'sst' => 'EQUIPE E SST', 'recursos' => 'RECURSOS E LOCAÇÃO'][$tipo];
    $logo = $E['logo'] ? '<img class="logo" src="' . rel_e($E['logo']) . '" alt="' . rel_e($E['nome']) . '">' : '<div class="logo-txt">' . rel_e($E['nome']) . '</div>';
    $emp = '<b>' . rel_e($E['razao_social'] ?: $E['nome']) . '</b><br>' . implode(' · ', array_filter([$E['cnpj'] ? 'CNPJ ' . rel_e($E['cnpj']) : null, $E['cidade'] ? rel_e($E['cidade'] . ($E['uf'] ? '/' . $E['uf'] : '')) : null])) . ($E['telefone'] ? '<br>' . rel_e($E['telefone']) : '');
    $sub = ($ref ? rel_e($ref) . ' · ' : '') . rel_e(rel_periodo_txt($ini, $fim));
    $assin = $tipo === 'obra' ? '<div class="ass"><div>' . rel_e($E['nome']) . ($D['emitido_por'] ? ' · ' . rel_e($D['emitido_por']) : '') . '</div><div>Cliente · ciente</div></div>' : '';
    $rod = $previa ? 'Prévia gerada em ' . rel_br_ano(rel_hoje()) . ' · não emitida' : 'Emitido em ' . rel_e(rel_br_ano(substr($D['emitido_em'], 0, 10)) . ' ' . substr($D['emitido_em'], 11, 5)) . ' por ' . rel_e($D['emitido_por']) . ' · ' . rel_e($ref) . ' · código ' . rel_e($codigo) . ($tipo === 'obra' ? '' : ' · uso interno');
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' . rel_e(($ref ?: 'Prévia') . ' · ' . REL_TIPOS[$tipo]) . '</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@page{size:A4;margin:14mm 14mm 16mm;@bottom-right{content:"Página " counter(page) " de " counter(pages);font:9px Arial;color:#555}}
*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font:11px/1.4 Arial,Helvetica,sans-serif;color:#111}
.barra{position:sticky;top:0;display:flex;gap:10px;align-items:center;justify-content:center;padding:10px;background:#0f172a;color:#fff;font:600 14px Arial;z-index:2;flex-wrap:wrap}
.barra button,.barra a{height:38px;padding:0 16px;border:0;border-radius:8px;background:#2563eb;color:#fff;font:700 14px Arial;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}.barra a{background:#16a34a}.barra span{opacity:.8;font-weight:400}
.folha{width:210mm;min-height:297mm;margin:16px auto;background:#fff;padding:14mm;position:relative;box-shadow:0 6px 24px rgba(0,0,0,.15)}
.cab{display:grid;grid-template-columns:44mm 1fr auto;gap:5mm;align-items:center;border-bottom:2px solid ' . $cor . ';padding-bottom:3mm;margin-bottom:4mm}
.logo{max-width:44mm;max-height:18mm;object-fit:contain;display:block}.logo-txt{font:700 17px Arial;color:' . $cor . '}
.emp{font-size:10px;line-height:1.45;color:#333;border-left:1px solid #cbd5e1;padding-left:4mm}.emp b{font-size:11.5px;color:#111}
.tit{text-align:right}.tit b{display:block;font-size:14.5px;color:' . $cor . '}.tit small{display:block;font-size:10.5px}
h2{font-size:10.5px;letter-spacing:.06em;color:' . $cor . ';margin:4mm 0 1.5mm;text-transform:uppercase;break-after:avoid}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #94a3b8;padding:3.5px 6px;text-align:left;vertical-align:top}th{background:#eef2f7;font-weight:700}tr{break-inside:avoid}
.k td:first-child{width:32mm;background:#f8fafc;font-weight:700}.caixa{border:1px solid #94a3b8;padding:5px 8px;line-height:1.5}ul{margin:0;padding-left:16px}li{margin:2px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(28mm,1fr));gap:2mm;margin:3mm 0}.kpi{border:1px solid #cbd5e1;border-radius:5px;padding:2mm 3mm}.kpi b{display:block;font-size:16px}.kpi span{font-size:9px;color:#475569}
.graf{border:1px solid #cbd5e1;padding:2mm;break-inside:avoid}.barras .br{display:grid;grid-template-columns:24mm 1fr;gap:2mm;align-items:center;font-size:9.5px;margin:1.5mm 0}.barras .br div{position:relative;height:3.5mm;background:#f1f5f9}
.barras i{position:absolute;left:0;top:.6mm;bottom:.6mm}.barras em{position:absolute;top:-.6mm;bottom:-.6mm;border-left:2px solid #0f172a}
.fotos{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm}figure{margin:0;break-inside:avoid}figure img{width:100%;height:30mm;object-fit:cover;border:1px solid #94a3b8;display:block}figcaption{font-size:8.5px;color:#555}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:14mm;break-inside:avoid}.ass div{border-top:1px solid #111;padding-top:2mm;text-align:center;font-size:10.5px}
.rod{margin-top:5mm;font-size:8.5px;color:#555;text-align:center}
.marca{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font:700 70px Arial;color:rgba(37,99,235,.08);transform:rotate(-30deg)}
@media print{body{background:#fff}.barra{display:none}.folha{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}}
@media (max-width:820px){.folha{width:auto;margin:8px;padding:5mm}.cab{grid-template-columns:1fr}.tit{text-align:left}.fotos{grid-template-columns:repeat(2,1fr)}}
' . ($embutido ? 'body{background:#e5e7eb}.barra{display:none}.folha{margin:10px auto}' : '') . '
</style></head><body>
<div class="barra"><button onclick="window.print()">Imprimir / Salvar em PDF</button>' . (!$previa && !empty($D['_excel']) ? '<a href="' . rel_e($D['_excel']) . '">Baixar Excel</a>' : '') . '<span>' . ($previa ? 'Prévia: emita para numerar e guardar' : 'Para PDF: em "Destino" escolha "Salvar como PDF"') . '</span></div>
<div class="folha">' . ($previa ? '<div class="marca">PRÉVIA</div>' : '') . '
<div class="cab"><div>' . $logo . '</div><div class="emp">' . $emp . '</div><div class="tit"><b>' . $tit . '</b><small>' . $sub . '</small></div></div>
' . rel_corpo($tipo, $D['conteudo'], $D['obra'] ?? null, $resumo, $cor, $fb) . $assin . '
<div class="rod">' . $rod . ' · Aprumo</div></div>' . (!empty($_GET['imprimir']) ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),400))</script>' : '') . '</body></html>';
}
function rel_cabecalhos_html(): void {
    header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
}
/** GET /api/relatorios/{id}/documento — o emitido, congelado. */
function rota_relatorio_documento(int $id): array {
    $u = exigir_login(); $r = rel_ler($u, $id);
    $D = json_decode($r['dados'], true); $D['_excel'] = 'excel';
    rel_cabecalhos_html(); echo rel_html($r['tipo'], $D, $r['resumo'], $r['inicio'], $r['fim'], $r['referencia'], $r['codigo'], false); exit;
}
/** POST /api/relatorios/previa/documento — prévia não emitida (marca d'água), para a tela mostrar ao lado do formulário. */
function rota_relatorio_previa_documento(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $d = corpo(); [$tipo, $ini, $fim, $p, $sec] = rel_entrada($u, $d);
    $C = rel_conteudo($u, $tipo, $ini, $fim, $p, $sec);
    $D = ['conteudo' => $C, 'empresa' => rdo_empresa((int)$u['empresa_id']), 'obra' => $p ? ['codigo' => $p['codigo'], 'nome' => $p['nome'], 'cliente' => $p['cliente'], 'contrato' => $p['numero_contrato'], 'local' => $p['local_obra']] : null,
          'emitido_por' => um('SELECT nome FROM usuarios WHERE id = ?', [$u['id']])['nome'] ?? '', 'emitido_em' => null];
    $res = $tipo === 'obra' ? (trim((string)($d['resumo'] ?? '')) !== '' ? mb_substr((string)$d['resumo'], 0, 5000) : $C['resumo_sugerido']) : null;
    rel_cabecalhos_html(); echo rel_html($tipo, $D, $res, $ini, $fim, null, null, true, true); exit;
}

/* ══ Excel (.xlsx gerado aqui, sem biblioteca) ══════════════════════════════════ */
function xlsx_col(int $i): string { $s = ''; for ($i++; $i > 0; $i = intdiv($i - 1, 26)) $s = chr(65 + ($i - 1) % 26) . $s; return $s; }
function xlsx_gerar(array $abas): string {
    $x = fn($s) => htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $tmp = tempnam(sys_get_temp_dir(), 'tfx'); $z = new ZipArchive(); $z->open($tmp, ZipArchive::OVERWRITE);
    $nomes = []; $i = 0;
    foreach ($abas as $nome => $linhas) {
        $i++; $nome = mb_substr(preg_replace('#[\[\]\*\?/\\\\:]#', ' ', (string)$nome), 0, 31); $nomes[] = $nome;
        $larg = []; foreach ($linhas as $l) foreach (array_values($l) as $c => $v) $larg[$c] = max($larg[$c] ?? 8, min(60, mb_strlen((string)$v) + 2));
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
        foreach ($larg as $c => $w) $xml .= '<col min="' . ($c + 1) . '" max="' . ($c + 1) . '" width="' . $w . '" customWidth="1"/>';
        $xml .= '</cols><sheetData>';
        foreach (array_values($linhas) as $r => $l) {
            $xml .= '<row r="' . ($r + 1) . '">';
            foreach (array_values($l) as $c => $v) {
                $ref = xlsx_col($c) . ($r + 1); $st = $r === 0 ? ' s="1"' : '';
                if ($v === null || $v === '') $xml .= '<c r="' . $ref . '"' . $st . '/>';
                elseif ((is_int($v) || is_float($v)) && $r > 0) $xml .= '<c r="' . $ref . '"><v>' . $v . '</v></c>';
                else $xml .= '<c r="' . $ref . '" t="inlineStr"' . $st . '><is><t xml:space="preserve">' . $x($v) . '</t></is></c>';
            }
            $xml .= '</row>';
        }
        $z->addFromString("xl/worksheets/sheet$i.xml", $xml . '</sheetData></worksheet>');
    }
    $z->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        . implode('', array_map(fn($k) => '<Override PartName="/xl/worksheets/sheet' . $k . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>', range(1, $i))) . '</Types>');
    $z->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    $z->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        . implode('', array_map(fn($k, $n) => '<sheet name="' . $x($n) . '" sheetId="' . $k . '" r:id="rId' . $k . '"/>', range(1, $i), $nomes)) . '</sheets></workbook>');
    $z->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        . implode('', array_map(fn($k) => '<Relationship Id="rId' . $k . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $k . '.xml"/>', range(1, $i)))
        . '<Relationship Id="rId' . ($i + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    $z->addFromString('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F3D6E"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
    $z->close(); $bin = (string)file_get_contents($tmp); @unlink($tmp); return $bin;
}
function rel_abas(string $tipo, array $C, ?array $O, ?string $resumo, string $ini, string $fim): array {
    $n = fn($v) => $v === null ? '' : (float)$v;
    if ($tipo === 'obra') {
        $k = $C['indicadores'];
        return ['Resumo' => [['Campo', 'Valor'], ['Obra', trim(($O['codigo'] ?? '') . ' ' . ($O['nome'] ?? ''))], ['Período', rel_br_ano($ini) . ' a ' . rel_br_ano($fim)], ['Avanço real (%)', $n($k['real'])], ['Previsto (%)', $n($k['previsto'])],
                    ['Desvio (pontos)', $n($k['desvio'])], ['Desvio no término (dias)', $k['desvio_dias'] ?? ''], ['Término previsto', rel_br_ano($k['termino'])], ['Resumo', (string)$resumo]],
            'Curva S' => array_merge([['Data', 'Previsto (%)', 'Real (%)']], array_map(fn($c) => [rel_br_ano($c['data']), $n($c['previsto']), $n($c['real'])], $C['curva'])),
            'Feito no período' => array_merge([['Atividade', 'De (%)', 'Para (%)', 'Situação', 'Responsável']], array_map(fn($f) => [$f['atividade'], $f['de'], $f['para'], $f['situacao'], $f['responsavel'] ?? ''], $C['feito'])),
            'Atrasadas' => array_merge([['Atividade', 'Previsto terminar', 'Dias de atraso', 'Avanço (%)', 'Motivo']], array_map(fn($a) => [$a['atividade'], rel_br_ano($a['fim']), $a['dias'], $a['avanco'], $a['motivo'] ?? ''], $C['atrasadas'])),
            'Impedimentos' => array_merge([['Dia', 'Tipo', 'Atividade', 'Descrição', 'Liberada']], array_map(fn($i) => [rel_br_ano($i['data']), $i['tipo'], $i['atividade'] ?? '', $i['descricao'], $i['liberada'] ? rel_br_ano($i['liberada']) : 'em aberto'], $C['impedimentos'])),
            'Próximas 2 semanas' => array_merge([['Atividade', 'Início', 'Fim', 'Responsável']], array_map(fn($p) => [$p['atividade'], rel_br_ano($p['inicio']), rel_br_ano($p['fim']), $p['responsavel'] ?? ''], $C['proximas']))];
    }
    if ($tipo === 'gerencial') return ['Obras' => array_merge([['Código', 'Obra', 'Situação', 'Real (%)', 'Previsto (%)', 'Desvio término (dias)', 'Farol', 'Atrasadas', 'Dias sem RDO', 'Rascunhos', 'Equipe', 'Conflitos']],
        array_map(fn($o) => [$o['codigo'], $o['nome'], $o['situacao'], $n($o['real']), $n($o['previsto']), $o['desvio_dias'] ?? '', $o['farol'], $o['atrasadas'], $o['sem_rdo'], $o['rascunhos'], $o['equipe'], $o['conflitos']], $C['obras'])),
        'Pontos de atenção' => array_merge([['Ponto']], array_map(fn($p) => [$p], $C['pontos']))];
    if ($tipo === 'sst') return ['Vencidos ou faltando' => array_merge([['Pessoa', 'Cargo', 'Documento', 'Situação', 'Alocada em']], array_map(fn($v) => [$v['pessoa'], $v['cargo'] ?? '', $v['documento'], $v['situacao'], $v['obras']], $C['vencidos'])),
        'Vencendo em 30 dias' => array_merge([['Pessoa', 'Documento', 'Vence em']], array_map(fn($v) => [$v['pessoa'], $v['documento'], rel_br_ano($v['vence'])], $C['vencendo'])),
        'Ausências' => array_merge([['Pessoa', 'Tipo', 'Início', 'Fim']], array_map(fn($a) => [$a['pessoa'], $a['tipo'], rel_br_ano($a['inicio']), rel_br_ano($a['fim'])], $C['ausencias'])),
        'Carga' => array_merge([['Pessoa', 'Carga (%)', 'Obras']], array_map(fn($c) => [$c['pessoa'], $c['carga'], $c['obras']], $C['carga']))];
    return ['Locação' => array_merge([['Equipamento', 'Fornecedor', 'Obras', 'De', 'Até', 'Dias', 'Custo (R$)']], array_map(fn($l) => [$l['recurso'], $l['fornecedor'] ?? '', $l['obras'], rel_br_ano($l['de']), rel_br_ano($l['ate']), $l['dias'], $l['custo'] ?? ''], $C['locacoes'])),
        'Uso' => array_merge([['Equipamento', 'Dias reservados', 'Ocupação (%)', 'Obras']], array_map(fn($x) => [$x['recurso'], $x['dias'], $x['ocupacao'], $x['obras']], $C['uso'])),
        'Calibração e manutenção' => array_merge([['Equipamento', 'Item', 'Situação']], array_map(fn($x) => [$x['recurso'], $x['item'], $x['situacao']], $C['controles'])),
        'Conflitos' => array_merge([['Equipamento', 'Atividades', 'De', 'Até']], array_map(fn($x) => [$x['recurso'], $x['obras'], rel_br_ano($x['de']), rel_br_ano($x['ate'])], $C['conflitos']))];
}
/** GET /api/relatorios/{id}/excel */
function rota_relatorio_excel(int $id): array {
    $u = exigir_login(); $r = rel_ler($u, $id);
    if (!class_exists('ZipArchive')) throw new ErroApi('O servidor não tem a extensão ZIP do PHP para gerar o Excel', 500);
    $D = json_decode($r['dados'], true);
    $bin = xlsx_gerar(rel_abas($r['tipo'], $D['conteudo'], $D['obra'] ?? null, $r['resumo'], $r['inicio'], $r['fim']));
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); header('Content-Length: ' . strlen($bin));
    header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9\-]/', '', $r['referencia']) . '.xlsx"'); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
    echo $bin; exit;
}
