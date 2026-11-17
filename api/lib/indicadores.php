<?php
/* Aprumo · servidor · tela "Indicadores" (antiga Gráficos): os 5 indicadores do quadro SQDCP usado na indústria
   (Segurança, Qualidade, Entrega, Custo, Pessoas/Produtividade) e o diagrama de Ishikawa (6M) das causas de atraso.
   Administrador e gestor. Filtro opcional por obra (?obra=ID). */
declare(strict_types=1);

const IND_SEMANAS = 6;          // semanas no gráfico do PPC
const IND_JANELA = 90;          // dias olhados para trás nas ocorrências (Travou, acidentes, clima…)

/** Segunda-feira da semana de $d. */
function ind_segunda(string $d): string { $w = (int)gmdate('N', strtotime("$d 12:00:00 UTC")); return Calendario::mais($d, 1 - $w); }
function ind_farol(?float $v, float $verde, float $amarelo, bool $maiorMelhor = true): string {
    if ($v === null) return 'cinza';
    return $maiorMelhor ? ($v >= $verde ? 'verde' : ($v >= $amarelo ? 'amarelo' : 'vermelho')) : ($v <= $verde ? 'verde' : ($v <= $amarelo ? 'amarelo' : 'vermelho'));
}

/** GET /api/indicadores?obra= */
function rota_indicadores(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id']; $hoje = rel_hoje();
    $todas = todos("SELECT * FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao IN ('Em andamento','Pausado') ORDER BY codigo, nome", [$eid]);
    $filtro = (int)($_GET['obra'] ?? 0);
    $obras = $filtro ? array_values(array_filter($todas, fn($p) => (int)$p['id'] === $filtro)) : $todas;
    if ($filtro && !$obras) { $p = um('SELECT * FROM projetos WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$filtro, $eid]); if (!$p) throw new ErroApi('Obra não encontrada', 404); $obras = [$p]; }
    $pids = array_map(fn($p) => (int)$p['id'], $obras); $inP = $pids ? implode(',', $pids) : '0';
    $cod = []; foreach ($obras as $p) $cod[(int)$p['id']] = $p['codigo'] ?: $p['nome'];
    $desde = Calendario::mais($hoje, -IND_JANELA);

    $dados = []; foreach ($obras as $p) $dados[(int)$p['id']] = rel_base_obra($eid, (int)$p['id']);
    $planoFim = fn(array $a, array $base) => ($base[(int)$a['id']]['fim'] ?? null) ?: $a['fim'];

    // ── D · Entrega: PPC (Percentual do Planejado Concluído, do Last Planner) por semana ──
    $seg = ind_segunda($hoje); $semanas = [];
    for ($i = IND_SEMANAS - 1; $i >= 0; $i--) { $ini = Calendario::mais($seg, -7 * $i); $semanas[] = ['inicio' => $ini, 'fim' => min(Calendario::mais($ini, 6), $hoje), 'planejadas' => 0, 'concluidas' => 0]; }
    $atrasadas = 0; $abertasAtras = [];
    foreach ($dados as $pid => [$F, $base, $ev]) foreach ($F as $a) {
        $pf = $planoFim($a, $base); if (!$pf) continue;
        foreach ($semanas as &$s) if ($pf >= $s['inicio'] && $pf <= $s['fim']) {
            $s['planejadas']++;
            if (rel_avanco_em($a, $ev[(int)$a['id']] ?? [], $pf) >= 100) $s['concluidas']++;
        }
        unset($s);
        if ($a['fim'] && $a['fim'] < $hoje && (int)$a['avanco'] < 100) { $atrasadas++; $abertasAtras[] = $a + ['projeto_id' => $pid]; }
    }
    foreach ($semanas as &$s) $s['ppc'] = $s['planejadas'] ? (int)round($s['concluidas'] / $s['planejadas'] * 100) : null; unset($s);
    $ult = array_values(array_filter($semanas, fn($s) => $s['planejadas'] > 0));
    $ppc4 = array_slice($ult, -4); $pl = array_sum(array_column($ppc4, 'planejadas')); $co = array_sum(array_column($ppc4, 'concluidas'));
    $ppc = $pl ? (int)round($co / $pl * 100) : null;

    // ── C · Custo: valor agregado (análise de valor agregado com o valor do contrato) ──
    $va = $vp = 0.0; $comValor = 0; $somaR = $somaP = 0.0; $n = 0; $porObra = [];
    foreach ($obras as $p) { $pid = (int)$p['id']; [$F, $base, $ev] = $dados[$pid]; if (!$F) continue;
        $real = rel_real($F, $base, $ev, $hoje); $prev = rel_previsto($F, $base, $hoje);
        $porObra[] = ['id' => $pid, 'codigo' => $cod[$pid], 'real' => $real, 'previsto' => $prev];
        if ($prev === null) continue;
        $somaR += $real; $somaP += $prev; $n++;
        $v = (float)($p['valor_contrato'] ?? 0); if ($v > 0) { $va += $v * $real / 100; $vp += $v * $prev / 100; $comValor++; } }
    $idp = $comValor && $vp > 0 ? round($va / $vp, 2) : ($n && $somaP > 0 ? round($somaR / $somaP, 2) : null);

    // ── S · Segurança: dias sem acidente ──
    $acid = todos("SELECT o.data, o.descricao, o.projeto_id FROM ocorrencias o WHERE o.empresa_id = ? AND o.excluido_em IS NULL AND o.tipo = 'Acidente' AND o.projeto_id IN ($inP) ORDER BY o.data DESC", [$eid]);
    $inicioObras = $obras ? min(array_filter(array_map(fn($p) => $p['inicio'], $obras)) ?: [$hoje]) : $hoje;
    $diasSem = $acid ? rel_dias($acid[0]['data'], $hoje) : max(0, rel_dias($inicioObras, $hoje));
    $acid90 = count(array_filter($acid, fn($o) => $o['data'] >= $desde));

    // ── Q · Qualidade e conformidade: pessoas nas obras com os documentos exigidos em dia ──
    $P = todos('SELECT f.* FROM funcionarios f WHERE f.empresa_id = ? AND f.excluido_em IS NULL AND f.ativo = 1', [$eid]);
    $fids = array_map(fn($x) => (int)$x['id'], $P);
    $carga = eq_cargas($eid, $fids, $hoje); $exig = eq_exigencias($eid, $P, $hoje); $docs = eq_documentos($eid, $fids); $nomes = eq_nomes_tipos($eid);
    $codSet = array_flip(array_values($cod));
    $nasObras = []; $docProb = []; $sobrecarga = [];
    foreach ($P as $x) { $f = (int)$x['id']; $ob = array_values(array_filter($carga[$f]['obras'] ?? [], fn($c) => isset($codSet[$c]))); if (!$ob) continue;
        $nasObras[$f] = true;
        foreach ($exig[$f] ?? [] as $t => $e) { [$s] = eq_situacao($docs[$f][$t] ?? null, $hoje, $e['ate']); if ($s === 'falta' || $s === 'vencido') { $docProb[$f][] = ($nomes[$t] ?? 'documento') . ($s === 'falta' ? ' (falta)' : ' (vencido)'); } }
        if (($carga[$f]['carga'] ?? 0) > 100) $sobrecarga[] = $x['nome'] . ' · ' . $carga[$f]['carga'] . '%'; }
    $conf = $nasObras ? (int)round((count($nasObras) - count($docProb)) / count($nasObras) * 100) : null;

    // ── P · Pessoas e produtividade: tempo médio para destravar (Travou resolvidos nos últimos 90 dias) ──
    $oc = todos("SELECT o.*, a.descricao AS atividade FROM ocorrencias o LEFT JOIN atividades a ON a.id = o.atividade_id
                 WHERE o.empresa_id = ? AND o.excluido_em IS NULL AND o.projeto_id IN ($inP) AND (o.data >= ? OR o.resolvida_em IS NULL) ORDER BY o.data DESC", [$eid, $desde]);
    $res = array_filter($oc, fn($o) => $o['resolvida_em'] && $o['data'] >= $desde);
    $horas = array_map(fn($o) => max(0, (strtotime($o['resolvida_em']) - strtotime($o['criado_em'])) / 3600), $res);
    $mediaDias = $horas ? round(array_sum($horas) / count($horas) / 24, 1) : null;
    $abertos = count(array_filter($oc, fn($o) => !$o['resolvida_em']));

    $kpis = [
        ['chave' => 'S', 'nome' => 'Segurança', 'titulo' => 'Dias sem acidente', 'valor' => $diasSem, 'formato' => 'dias',
         'farol' => $acid && $acid[0]['data'] >= Calendario::mais($hoje, -30) ? 'vermelho' : ($acid90 ? 'amarelo' : 'verde'),
         'meta' => 'Nenhum acidente', 'detalhe' => $acid ? "Último em " . rel_br_ano($acid[0]['data']) . " · $acid90 nos últimos 90 dias" : 'Nenhum acidente registrado',
         'explica' => 'Conta os dias desde o último Travou ou ocorrência do tipo Acidente.'],
        ['chave' => 'Q', 'nome' => 'Qualidade', 'titulo' => 'Conformidade documental (NR)', 'valor' => $conf, 'formato' => '%',
         'farol' => ind_farol($conf === null ? null : (float)$conf, 100, 90), 'meta' => '100% das pessoas em campo',
         'detalhe' => $nasObras ? (count($nasObras) - count($docProb)) . ' de ' . count($nasObras) . ' pessoas nas obras com documentos em dia' : 'Ninguém alocado nas obras',
         'explica' => 'Pessoas alocadas nas obras com todos os documentos exigidos pelo cargo (NR, ASO…) em dia.'],
        ['chave' => 'D', 'nome' => 'Entrega', 'titulo' => 'PPC · plano semanal cumprido', 'valor' => $ppc, 'formato' => '%',
         'farol' => ind_farol($ppc === null ? null : (float)$ppc, 80, 60), 'meta' => '80% ou mais',
         'detalhe' => $pl ? "$co de $pl atividades terminadas no dia previsto (4 semanas)" : 'Nenhuma atividade prevista para terminar nas últimas semanas',
         'explica' => 'Percentual do Planejado Concluído (Last Planner): das atividades previstas para terminar na semana, quantas terminaram no prazo.'],
        ['chave' => 'C', 'nome' => 'Custo', 'titulo' => 'IDP · valor agregado', 'valor' => $idp, 'formato' => 'indice',
         'farol' => ind_farol($idp, 0.95, 0.85), 'meta' => '0,95 ou mais',
         'detalhe' => $comValor ? 'Agregado ' . rel_reais($va) . ' de ' . rel_reais($vp) . ' previstos · ' . ($va - $vp >= 0 ? '+' : '−') . rel_reais(abs($va - $vp)) : 'Sem valor de contrato: calculado pelo avanço físico',
         'explica' => 'Índice de desempenho de prazo (SPI): valor agregado ÷ valor planejado até hoje, usando o valor do contrato. 1,00 = no plano.'],
        ['chave' => 'P', 'nome' => 'Pessoas', 'titulo' => 'Tempo médio para destravar', 'valor' => $mediaDias, 'formato' => 'dias_dec',
         'farol' => $mediaDias === null ? ($abertos ? 'amarelo' : 'cinza') : ind_farol($mediaDias, 2, 5, false), 'meta' => 'Até 2 dias',
         'detalhe' => count($res) . ' Travou resolvido' . (count($res) === 1 ? '' : 's') . " em 90 dias · $abertos aberto" . ($abertos === 1 ? '' : 's'),
         'explica' => 'Tempo entre o aviso de Travou e a liberação. Mede a rapidez da gestão para tirar a equipe do impedimento.'],
    ];

    // ── Ishikawa (6M): causas de atraso ──
    $ocTipo = fn(array $tipos) => array_values(array_filter($oc, fn($o) => in_array($o['tipo'], $tipos, true) && $o['data'] >= $desde));
    $itOc = fn(array $l) => array_map(fn($o) => ['texto' => $o['descricao'] ?: $o['tipo'], 'sub' => ($cod[(int)$o['projeto_id']] ?? '') . ($o['atividade'] ? ' · ' . $o['atividade'] : '') . ' · ' . rel_br($o['data']) . ($o['resolvida_em'] ? '' : ' · aberto'), 'projeto_id' => (int)$o['projeto_id'], 'atividade_id' => $o['atividade_id'] ? (int)$o['atividade_id'] : null], $l);
    $grupo = fn(string $titulo, array $itens) => ['titulo' => $titulo, 'qtd' => count($itens), 'itens' => array_slice($itens, 0, 12)];

    // máquinas: manutenção, calibração e conflitos ligados às obras
    $R = todos('SELECT id, nome, codigo, tipo FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1', [$eid]);
    $rids = array_map(fn($r) => (int)$r['id'], $R); $rn = []; foreach ($R as $r) $rn[(int)$r['id']] = $r['nome'] . ($r['codigo'] ? " ({$r['codigo']})" : '');
    $ctrl = $rids ? rc_controles($eid, $rids, $hoje) : [];
    $manut = []; $calib = [];
    foreach ($ctrl as $rid => $c) foreach ($c['itens'] ?? [] as $x) if ($x['vence_em'] && $x['vence_em'] < $hoje) {
        $l = ['texto' => ($rn[$rid] ?? 'Recurso') . ' · ' . rc_nome_controle($x), 'sub' => 'Venceu em ' . rel_br_ano($x['vence_em'])];
        if ($x['tipo'] === 'calibracao') $calib[] = $l; else $manut[] = $l; }
    $res14 = $rids ? rc_reservas($eid, $hoje, Calendario::mais($hoje, 30), $rids) : [];
    $res14 = array_values(array_filter($res14, fn($x) => in_array((int)$x['projeto_id'], $pids, true)));
    $confl = array_map(fn($c) => ['texto' => ($rn[(int)$c['recurso_id']] ?? 'Recurso') . ' reservado em ' . count($c['atividades']) . ' atividades ao mesmo tempo', 'sub' => rc_periodo($c['de'], $c['ate'] ?? $c['de'])], rc_conflitos($res14));

    // método e medida: atrasadas sem responsável, sem avanço lançado há 7 dias e RDO pendente
    $semResp = []; $parado = [];
    foreach ($abertasAtras as $a) {
        $l = ['texto' => $a['descricao'], 'sub' => ($cod[$a['projeto_id']] ?? '') . ' · devia terminar ' . rel_br($a['fim']), 'projeto_id' => $a['projeto_id'], 'atividade_id' => (int)$a['id']];
        if (!$a['responsavel_id']) $semResp[] = $l;
        $ev = $dados[$a['projeto_id']][2][(int)$a['id']] ?? []; $ultimo = $ev ? end($ev)[0] : null;
        if (!$ultimo || $ultimo < Calendario::mais($hoje, -7)) $parado[] = ['sub' => $l['sub'] . ' · ' . ($ultimo ? 'último avanço ' . rel_br($ultimo) : 'nunca atualizada')] + $l;
    }
    $rdoSem = array_values(array_filter(rdo_pendencias($u), fn($r) => $r['tipo'] === 'sem' && in_array((int)$r['projeto_id'], $pids, true)));
    $rdoSem = array_map(fn($r) => ['texto' => 'Dia sem RDO · ' . $r['obra'], 'sub' => rel_br_ano($r['data'])], $rdoSem);
    $docL = []; foreach ($docProb as $f => $l) { $nm = ''; foreach ($P as $x) if ((int)$x['id'] === $f) $nm = $x['nome']; $docL[] = ['texto' => $nm, 'sub' => implode(' · ', $l)]; }

    $ishikawa = [
        'efeito' => 'Atrasos nas obras', 'atrasadas' => $atrasadas,
        'ramos' => [
            ['chave' => 'mao', 'nome' => 'Mão de obra', 'grupos' => [$grupo('Acidentes', $itOc($ocTipo(['Acidente']))), $grupo('Documentos vencidos ou faltando', $docL), $grupo('Pessoas acima da capacidade', array_map(fn($t) => ['texto' => $t, 'sub' => 'próximos 14 dias'], $sobrecarga))]],
            ['chave' => 'maquina', 'nome' => 'Máquina', 'grupos' => [$grupo('Travou por equipamento', $itOc($ocTipo(['Equipamento']))), $grupo('Manutenção ou inspeção vencida', $manut), $grupo('Conflito de reserva', $confl)]],
            ['chave' => 'material', 'nome' => 'Material', 'grupos' => [$grupo('Travou por falta de material', $itOc($ocTipo(['Falta de material'])))]],
            ['chave' => 'metodo', 'nome' => 'Método', 'grupos' => [$grupo('Atrasadas sem responsável', $semResp), $grupo('Travou por outros motivos', $itOc($ocTipo(['Outro'])))]],
            ['chave' => 'meio', 'nome' => 'Meio ambiente', 'grupos' => [$grupo('Clima', $itOc($ocTipo(['Clima']))), $grupo('Pendência do cliente', $itOc($ocTipo(['Pendência do cliente'])))]],
            ['chave' => 'medida', 'nome' => 'Medida', 'grupos' => [$grupo('Calibração vencida', $calib), $grupo('Atrasadas sem avanço lançado há 7 dias', $parado), $grupo('Dias sem RDO', $rdoSem)]],
        ],
    ];
    foreach ($ishikawa['ramos'] as &$r) { $r['grupos'] = array_values(array_filter($r['grupos'], fn($g) => $g['qtd'] > 0)); $r['qtd'] = array_sum(array_column($r['grupos'], 'qtd')); } unset($r);

    return ['hoje' => $hoje, 'obra' => $filtro ?: null,
            'obras' => array_map(fn($p) => ['id' => (int)$p['id'], 'codigo' => $p['codigo'], 'nome' => $p['nome']], $todas),
            'kpis' => $kpis, 'ppc_semanas' => $semanas, 'avanco_obras' => $porObra, 'ishikawa' => $ishikawa];
}
