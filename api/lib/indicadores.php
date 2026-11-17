<?php
/* Aprumo · servidor · tela "Gráficos e indicadores" (gestão de planejamento)
   - Resumo em uma frase; quadro SQDCP com tendência, série de 8 semanas e lista do que compõe cada número:
     S Segurança (dias sem acidente · conformidade SST), Q Qualidade (atividades sem retrabalho),
     D Entrega/prazo (IDP · obras fora do prazo), C Custo (IDC com custo realizado), P Planejamento (PPC do plano semanal).
   - Prazo das obras, Curva S com projeção, causas dos atrasos (Ishikawa 6M + Pareto pesados por dias perdidos),
     pendências de controle (separadas das causas), carga da equipe e ocupação dos equipamentos.
   Administrador e gestor. Filtros: ?obra=ID&periodo=7|28|90 (dias). */
declare(strict_types=1);

const IND_RAMO_DE = ['Acidente' => 'mao', 'Falta de equipe' => 'mao', 'Equipamento' => 'maquina', 'Falta de material' => 'material',
                     'Projeto' => 'metodo', 'Outro' => 'metodo', 'Clima' => 'meio', 'Pendência do cliente' => 'meio', 'Retrabalho' => 'medida'];
const IND_RAMOS = ['mao' => 'Mão de obra', 'maquina' => 'Máquina', 'material' => 'Material', 'metodo' => 'Método', 'meio' => 'Meio ambiente', 'medida' => 'Medida'];

function ind_segunda(string $d): string { $w = (int)gmdate('N', strtotime("$d 12:00:00 UTC")); return Calendario::mais($d, 1 - $w); }
function ind_farol(?float $v, float $verde, float $amarelo, bool $maiorMelhor = true): string {
    if ($v === null) return 'cinza';
    return $maiorMelhor ? ($v >= $verde ? 'verde' : ($v >= $amarelo ? 'amarelo' : 'vermelho')) : ($v <= $verde ? 'verde' : ($v <= $amarelo ? 'amarelo' : 'vermelho'));
}
function ind_num(float $v, int $c = 0): string { return number_format($v, $c, ',', '.'); }
/** R$ curto para caber no cartão: R$ 950, R$ 116 mil, R$ 1,2 mi. */
function ind_reais_curto(float $v): string { $a = abs($v); return 'R$ ' . ($a >= 1e6 ? ind_num($v / 1e6, 1) . ' mi' : ($a >= 1e3 ? ind_num($v / 1e3) . ' mil' : ind_num($v))); }
/** IDP consolidado (valor agregado ÷ planejado) das obras na data, pesando pelo orçamento/contrato (ou igual quando não há valor). */
function ind_idp(array $obras, array $dados, string $d): ?float {
    $va = $vp = 0.0;
    foreach ($obras as $p) { [$F, $base, $ev] = $dados[(int)$p['id']]; if (!$F) continue;
        $prev = rel_previsto($F, $base, $d); if ($prev === null || $prev <= 0) continue;
        $peso = (float)($p['orcamento'] ?: $p['valor_contrato'] ?: 1);
        $va += $peso * rel_real($F, $base, $ev, $d); $vp += $peso * $prev; }
    return $vp > 0 ? round($va / $vp, 2) : null;
}

/** GET /api/indicadores?obra=&periodo= */
function rota_indicadores(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id']; $hoje = rel_hoje(); $R = empresa_regras($eid);
    $per = in_array((int)($_GET['periodo'] ?? 28), [7, 28, 90], true) ? (int)($_GET['periodo'] ?? 28) : 28;
    $desde = Calendario::mais($hoje, -$per + 1); $antesIni = Calendario::mais($desde, -$per); $antesFim = Calendario::mais($desde, -1);
    $todas = todos("SELECT * FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao IN ('Em andamento','Pausado') ORDER BY codigo, nome", [$eid]);
    $filtro = (int)($_GET['obra'] ?? 0);
    $obras = $filtro ? array_values(array_filter($todas, fn($p) => (int)$p['id'] === $filtro)) : $todas;
    if ($filtro && !$obras) { $p = um('SELECT * FROM projetos WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$filtro, $eid]); if (!$p) throw new ErroApi('Obra não encontrada', 404); $obras = [$p]; }
    $pids = array_map(fn($p) => (int)$p['id'], $obras); $inP = $pids ? implode(',', $pids) : '0';
    $cod = []; foreach ($obras as $p) $cod[(int)$p['id']] = $p['codigo'] ?: $p['nome'];
    $dados = []; foreach ($obras as $p) $dados[(int)$p['id']] = rel_base_obra($eid, (int)$p['id']);
    $semanas = []; for ($i = 7; $i >= 0; $i--) $semanas[] = Calendario::mais(ind_segunda($hoje), -7 * $i);
    $fimSem = fn(string $s) => min(Calendario::mais($s, 6), $hoje);
    $janela = Calendario::mais($hoje, -max(90, $per * 2));
    $oc = todos("SELECT o.*, a.descricao AS atividade FROM ocorrencias o LEFT JOIN atividades a ON a.id = o.atividade_id
                 WHERE o.empresa_id = ? AND o.excluido_em IS NULL AND o.projeto_id IN ($inP) AND (o.data >= ? OR o.resolvida_em IS NULL) ORDER BY o.data DESC", [$eid, $janela]);
    $itOc = fn(array $o) => ['texto' => ($o['atividade'] ? $o['atividade'] . ' · ' : '') . ($o['descricao'] ?: $o['tipo']), 'sub' => ($cod[(int)$o['projeto_id']] ?? '') . ' · ' . $o['tipo'] . ' · ' . rel_br_ano($o['data']) . ($o['resolvida_em'] ? '' : ' · aberto'),
                             'projeto_id' => (int)$o['projeto_id'], 'atividade_id' => $o['atividade_id'] ? (int)$o['atividade_id'] : null];

    // ── equipe nas obras (conformidade e carga) ──
    $P = todos('SELECT f.* FROM funcionarios f WHERE f.empresa_id = ? AND f.excluido_em IS NULL AND f.ativo = 1 ORDER BY f.nome', [$eid]);
    $fids = array_map(fn($x) => (int)$x['id'], $P);
    $carga = eq_cargas($eid, $fids, $hoje); $exig = eq_exigencias($eid, $P, $hoje); $docs = eq_documentos($eid, $fids); $nomes = eq_nomes_tipos($eid);
    $codSet = array_flip(array_values($cod)); $nasObras = []; $docProb = []; $cargaL = [];
    foreach ($P as $x) { $f = (int)$x['id']; $ob = array_values(array_filter($carga[$f]['obras'] ?? [], fn($c) => isset($codSet[$c]))); if (!$ob) continue;
        $nasObras[$f] = $x['nome'];
        foreach ($exig[$f] ?? [] as $t => $e) { [$s] = eq_situacao($docs[$f][$t] ?? null, $hoje, $e['ate']); if ($s === 'falta' || $s === 'vencido') $docProb[$f][] = ($nomes[$t] ?? 'documento') . ($s === 'falta' ? ' (falta)' : ' (vencido)'); }
        $cargaL[] = ['nome' => $x['nome'], 'carga' => min(999, (int)($carga[$f]['carga'] ?? 0)), 'obras' => implode(' · ', $ob)]; }
    usort($cargaL, fn($a, $b) => $b['carga'] <=> $a['carga']);
    $conf = $nasObras ? (int)round((count($nasObras) - count($docProb)) / count($nasObras) * 100) : null;

    /* ═══ S · Segurança ═══ */
    $acid = array_values(array_filter($oc, fn($o) => $o['tipo'] === 'Acidente'));
    $ultimo = um("SELECT MAX(data) AS d FROM ocorrencias WHERE empresa_id = ? AND excluido_em IS NULL AND tipo = 'Acidente' AND projeto_id IN ($inP)", [$eid])['d'] ?? null;
    $inis = array_filter(array_map(fn($p) => $p['inicio'], $obras)); $inicioObras = $inis ? min($inis) : $hoje;
    $diasSem = $ultimo ? rel_dias($ultimo, $hoje) : max(0, rel_dias($inicioObras, $hoje));
    $acNo = fn(string $i, string $f) => count(array_filter($acid, fn($o) => $o['data'] >= $i && $o['data'] <= $f));
    $kS = ['chave' => 'S', 'nome' => 'Segurança', 'titulo' => 'Dias sem acidente', 'valor' => $diasSem, 'formato' => 'dias',
        'farol' => $ultimo && $ultimo >= Calendario::mais($hoje, -30) ? 'vermelho' : ($ultimo && $ultimo >= Calendario::mais($hoje, -90) ? 'amarelo' : 'verde'), 'meta' => 'Nenhum acidente',
        'detalhe' => $ultimo ? 'Último acidente em ' . rel_br_ano($ultimo) : 'Nenhum acidente registrado nas obras',
        'secundario' => ['rotulo' => 'Conformidade SST', 'valor' => $conf === null ? '—' : "$conf%", 'farol' => ind_farol($conf === null ? null : (float)$conf, (float)$R['meta_conformidade'], (float)$R['meta_conformidade'] - 10)],
        'tendencia' => ['atual' => $acNo($desde, $hoje), 'anterior' => $acNo($antesIni, $antesFim), 'texto' => 'acidentes no período', 'menor_melhor' => true],
        'serie' => array_map(fn($s) => $acNo($s, $fimSem($s)), $semanas), 'serie_rotulo' => 'acidentes por semana',
        'explica' => 'Dias desde o último acidente registrado (pelo RDO ou pelo Travou). Embaixo: % das pessoas em campo com todos os documentos exigidos (NR, ASO…) em dia.',
        'formula' => 'Dias sem acidente = hoje − data do último acidente · Conformidade = pessoas em dia ÷ pessoas alocadas',
        'itens' => array_merge(array_map($itOc, array_slice($acid, 0, 15)), array_map(fn($f, $l) => ['texto' => $nasObras[$f] . ' · documentos', 'sub' => implode(' · ', $l), 'equipe' => true], array_keys($docProb), $docProb))];

    /* ═══ Q · Qualidade: atividades sem retrabalho ═══ */
    $trabalhadas = function (string $i, string $f) use ($dados): array { $ids = [];
        foreach ($dados as [$F, , $ev]) foreach ($F as $a) foreach ($ev[(int)$a['id']] ?? [] as $e) if ($e[0] >= $i && $e[0] <= $f) { $ids[(int)$a['id']] = true; break; }
        return $ids; };
    $retr = array_values(array_filter($oc, fn($o) => $o['tipo'] === 'Retrabalho'));
    $qNo = function (string $i, string $f) use ($trabalhadas, $retr): ?int {
        $T = $trabalhadas($i, $f); $r = []; foreach ($retr as $o) if ($o['data'] >= $i && $o['data'] <= $f && $o['atividade_id']) $r[(int)$o['atividade_id']] = true;
        $tot = count($T + $r); return $tot ? (int)round(($tot - count($r)) / $tot * 100) : null; };
    $qAtual = $qNo($desde, $hoje); $retrPer = array_values(array_filter($retr, fn($o) => $o['data'] >= $desde));
    $diasRetr = array_sum(array_map(fn($o) => max(1, rel_dias($o['data'], $o['resolvida_em'] ? substr($o['resolvida_em'], 0, 10) : $hoje)), $retrPer));
    $kQ = ['chave' => 'Q', 'nome' => 'Qualidade', 'titulo' => 'Atividades sem retrabalho', 'valor' => $qAtual, 'formato' => '%',
        'farol' => ind_farol($qAtual === null ? null : (float)$qAtual, (float)$R['meta_retrabalho'], (float)$R['meta_retrabalho'] - 10), 'meta' => ind_num((float)$R['meta_retrabalho']) . '% ou mais',
        'detalhe' => $qAtual === null ? 'Nenhuma atividade com avanço lançado no período' : (count($retrPer) ? count($retrPer) . ' retrabalho' . (count($retrPer) > 1 ? 's' : '') . ' registrado' . (count($retrPer) > 1 ? 's' : '') : 'Nenhum retrabalho registrado'),
        'secundario' => ['rotulo' => 'Dias perdidos com retrabalho', 'valor' => (string)$diasRetr, 'farol' => $diasRetr ? 'amarelo' : 'verde'],
        'tendencia' => ['atual' => $qAtual, 'anterior' => $qNo($antesIni, $antesFim), 'texto' => 'pontos', 'menor_melhor' => false],
        'serie' => array_map(fn($s) => $qNo($s, $fimSem($s)), $semanas), 'serie_rotulo' => '% sem retrabalho por semana',
        'explica' => 'Das atividades que tiveram avanço no período, quantas não precisaram refazer serviço. Retrabalho é registrado no Travou (motivo "Retrabalho") ou no RDO.',
        'formula' => '(atividades trabalhadas − com retrabalho) ÷ atividades trabalhadas', 'itens' => array_map($itOc, array_slice($retrPer, 0, 30))];

    /* ═══ D · Entrega: IDP e obras fora do prazo ═══ */
    $prazo = [];
    foreach ($obras as $p) { $pid = (int)$p['id']; [$F, $base, $ev] = $dados[$pid]; if (!$F) continue;
        $real = rel_real($F, $base, $ev, $hoje); $prev = rel_previsto($F, $base, $hoje);
        $fimPlano = null; $fimBase = null;
        foreach ($F as $a) { if ($a['fim']) $fimPlano = max($fimPlano ?? $a['fim'], $a['fim']); $b = $base[(int)$a['id']] ?? null; if ($b && $b['fim']) $fimBase = max($fimBase ?? $b['fim'], $b['fim']); }
        $contrato = $p['fim'] ?: $fimBase; $idpO = $prev ? round($real / $prev, 2) : null;
        $d7 = Calendario::mais($hoje, -7); $pv7 = rel_previsto($F, $base, $d7); $idp7 = $pv7 ? round(rel_real($F, $base, $ev, $d7) / $pv7, 2) : null;
        $prazo[] = ['id' => $pid, 'codigo' => $cod[$pid], 'nome' => $p['nome'], 'real' => $real, 'previsto' => $prev, 'desvio_pts' => $prev === null ? null : round($real - $prev, 1),
            'idp' => $idpO, 'idp_7' => $idp7, 'termino_previsto' => $fimPlano, 'termino_contrato' => $contrato, 'desvio_dias' => $fimPlano && $contrato ? rel_dias($contrato, $fimPlano) : null,
            'farol' => farol_obra($p, $real, $prev, $hoje) ?? 'cinza', 'situacao' => $p['situacao']]; }
    usort($prazo, fn($a, $b) => [$a['idp'] ?? 9, -($a['desvio_dias'] ?? 0)] <=> [$b['idp'] ?? 9, -($b['desvio_dias'] ?? 0)]);
    $idp = ind_idp($obras, $dados, $hoje);
    $mIdp = (float)$R['meta_idp'];
    foreach ($prazo as &$o) {   // farol do prazo: dentro da meta de IDP e sem estourar o término do contrato
        $o['farol'] = ($o['idp'] === null || $o['idp'] >= $mIdp) && ($o['desvio_dias'] ?? 0) <= 0 ? 'verde' : (($o['idp'] === null || $o['idp'] >= $mIdp - 0.1) && ($o['desvio_dias'] ?? 0) <= 7 ? 'amarelo' : 'vermelho'); }
    unset($o);
    $fora = array_values(array_filter($prazo, fn($o) => $o['farol'] !== 'verde'));
    $pior = $prazo[0] ?? null;
    $kD = ['chave' => 'D', 'nome' => 'Entrega', 'titulo' => 'IDP · desempenho de prazo', 'valor' => $idp, 'formato' => 'indice',
        'farol' => ind_farol($idp, (float)$R['meta_idp'], (float)$R['meta_idp'] - 0.1), 'meta' => ind_num((float)$R['meta_idp'], 2) . ' ou mais',
        'detalhe' => $idp === null ? 'Sem obra com previsão até hoje' : ($idp >= 1 ? 'No plano ou adiantado' : 'Andando a ' . ind_num($idp * 100) . '% do ritmo planejado'),
        'secundario' => ['rotulo' => 'Obras fora do prazo', 'valor' => count($fora) . ' de ' . count($prazo), 'farol' => $fora ? 'vermelho' : 'verde'],
        'tendencia' => ['atual' => $idp, 'anterior' => ind_idp($obras, $dados, $antesFim), 'texto' => '', 'menor_melhor' => false],
        'serie' => array_map(fn($s) => ind_idp($obras, $dados, $fimSem($s)), $semanas), 'serie_rotulo' => 'IDP no fim de cada semana',
        'explica' => 'Índice de desempenho de prazo (SPI): quanto da obra foi feito ÷ quanto devia estar feito hoje, pela linha de base. 1,00 = no plano; 0,90 = 10% mais devagar.',
        'formula' => 'IDP = avanço real ÷ avanço previsto (ponderado pelo valor de cada obra)',
        'itens' => array_map(fn($o) => ['texto' => $o['codigo'] . ' · IDP ' . ($o['idp'] === null ? '—' : ind_num($o['idp'], 2)), 'sub' => ind_num($o['real'], 1) . '% real · ' . ($o['previsto'] === null ? '—' : ind_num($o['previsto'], 1) . '% previsto') . ($o['desvio_dias'] ? ' · término ' . ($o['desvio_dias'] > 0 ? '+' : '') . $o['desvio_dias'] . ' d' : ''), 'projeto_id' => $o['id']], $prazo)];

    /* ═══ C · Custo: IDC ═══ */
    $cus = []; $crT = $vaT = 0.0; $comCusto = 0;
    foreach ($obras as $p) { $c = cu_resumo($eid, $p); $cus[(int)$p['id']] = $c; if ($c['custo_real'] > 0) { $comCusto++; $crT += $c['custo_real']; $vaT += $c['valor_agregado']; } }
    $idcEm = function (string $d) use ($obras, $eid): ?float { $cr = $va = 0.0; foreach ($obras as $p) { $c = cu_resumo($eid, $p, $d); if ($c['custo_real'] > 0) { $cr += $c['custo_real']; $va += $c['valor_agregado']; } } return $cr > 0 ? round($va / $cr, 2) : null; };
    $idc = $crT > 0 ? round($vaT / $crT, 2) : null;
    $kC = ['chave' => 'C', 'nome' => 'Custo', 'titulo' => 'IDC · desempenho de custo', 'valor' => $idc, 'formato' => 'indice',
        'farol' => ind_farol($idc, (float)$R['meta_idc'], (float)$R['meta_idc'] - 0.1), 'meta' => ind_num((float)$R['meta_idc'], 2) . ' ou mais',
        'detalhe' => $idc === null ? 'Sem custo lançado. Lance os custos na obra (aba Custos).' : ($idc >= 1 ? 'Gastando dentro do orçado' : 'Gastando ' . ind_num((1 / $idc - 1) * 100) . '% a mais que o orçado para o que foi feito'),
        'secundario' => ['rotulo' => 'Gasto × agregado', 'valor' => $comCusto ? ind_reais_curto($crT) . ' × ' . ind_reais_curto($vaT) : '—', 'farol' => $idc === null ? 'cinza' : ($vaT >= $crT ? 'verde' : 'vermelho')],
        'tendencia' => ['atual' => $idc, 'anterior' => $comCusto ? $idcEm($antesFim) : null, 'texto' => '', 'menor_melhor' => false],
        'serie' => $comCusto ? array_map(fn($s) => $idcEm($fimSem($s)), $semanas) : array_fill(0, count($semanas), null), 'serie_rotulo' => 'IDC no fim de cada semana',
        'explica' => 'Índice de desempenho de custo (CPI): valor agregado ÷ custo realizado. O valor agregado é o custo orçado × % feito. 1,00 = gastando o orçado; abaixo de 1 = gastando mais.',
        'formula' => 'IDC = (orçamento × avanço real) ÷ custo lançado',
        'itens' => array_values(array_map(fn($p) => ['texto' => $cod[(int)$p['id']] . ' · IDC ' . ($cus[(int)$p['id']]['idc'] === null ? '—' : ind_num($cus[(int)$p['id']]['idc'], 2)),
            'sub' => 'Gasto ' . rel_reais($cus[(int)$p['id']]['custo_real']) . ' · agregado ' . rel_reais($cus[(int)$p['id']]['valor_agregado']) . ($cus[(int)$p['id']]['orcamento_proprio'] ? '' : ' · orçamento = valor do contrato'), 'projeto_id' => (int)$p['id'], 'aba' => 'custos'], $obras))];

    /* ═══ P · Planejamento: PPC do plano semanal ═══ */
    $ppcS = pl_ppc($eid, $pids, $semanas);
    $ppcNo = function (string $i, string $f) use ($ppcS): ?int { $c = $k = 0; foreach ($ppcS as $s => $v) if (!$v['aberta'] && $s >= ind_segunda($i) && $s <= $f) { $c += $v['comprometidas']; $k += $v['cumpridas']; } return $c ? (int)round($k / $c * 100) : null; };
    $semAtual = $ppcS[ind_segunda($hoje)] ?? null;
    $temPlano = array_sum(array_column($ppcS, 'comprometidas')) > 0;
    $ppc = $ppcNo($desde, $hoje);
    $compPer = array_sum(array_map(fn($s) => $s['semana'] >= ind_segunda($desde) ? $s['comprometidas'] : 0, $ppcS));
    $res = array_filter($oc, fn($o) => $o['resolvida_em'] && $o['atividade_id'] && $o['tipo'] !== 'Acidente' && $o['data'] >= $desde && strtotime($o['resolvida_em']) - strtotime($o['criado_em']) > 60);
    $horas = array_map(fn($o) => (strtotime($o['resolvida_em']) - strtotime($o['criado_em'])) / 3600, $res);
    $medH = $horas ? array_sum($horas) / count($horas) : null;
    $abertos = array_values(array_filter($oc, fn($o) => !$o['resolvida_em']));
    $naoCumpr = pl_motivos_nao_cumpridos($eid, $pids, $desde);
    $kP = ['chave' => 'P', 'nome' => 'Planejamento', 'titulo' => 'PPC · plano semanal cumprido', 'valor' => $ppc, 'formato' => '%',
        'farol' => ind_farol($ppc === null ? null : (float)$ppc, (float)$R['meta_ppc'], (float)$R['meta_ppc'] - 20), 'meta' => ind_num((float)$R['meta_ppc']) . '% ou mais',
        'detalhe' => !$temPlano ? 'Sem plano da semana. Monte na obra (aba Plano da semana).' : (($ppc === null ? 'Ainda sem semana fechada no período' : "$compPer compromisso" . ($compPer > 1 ? 's' : '') . ' no período') . ($semAtual && $semAtual['comprometidas'] ? " · esta semana: {$semAtual['cumpridas']} de {$semAtual['comprometidas']} já cumpridos" : '')),
        'secundario' => ['rotulo' => 'Tempo médio para destravar', 'valor' => $medH === null ? '—' : ($medH < 24 ? ($medH < 1 ? 'menos de 1 h' : ind_num(round($medH)) . ' h') : ind_num($medH / 24, 1) . ' dias'),
                         'farol' => $medH === null ? 'cinza' : ind_farol($medH / 24, (float)$R['meta_destravar'], (float)$R['meta_destravar'] * 2, false)],
        'tendencia' => ['atual' => $ppc, 'anterior' => $ppcNo($antesIni, $antesFim), 'texto' => 'pontos', 'menor_melhor' => false],
        'serie' => array_map(fn($s) => $ppcS[$s]['ppc'], $semanas), 'serie_rotulo' => 'PPC de cada semana',
        'explica' => 'Percentual do Plano Concluído (Last Planner): das tarefas que a equipe se comprometeu a fazer na semana, quantas cumpriu. Embaixo: quanto tempo a gestão leva para liberar um Travou.',
        'formula' => 'PPC = compromissos cumpridos ÷ compromissos da semana · Destravar = média (liberado − avisado)',
        'itens' => array_merge(array_map(fn($c) => ['texto' => $c['descricao'] . ' · não cumprido', 'sub' => ($cod[$c['projeto_id']] ?? '') . ' · semana ' . rel_br($c['semana']) . ' · ' . $c['avanco'] . '% de ' . $c['meta'] . '%' . ($c['motivo'] ? ' · ' . (MOTIVOS_TRAVOU[$c['motivo']][1] ?? '') : ' · sem motivo'), 'projeto_id' => $c['projeto_id'], 'atividade_id' => $c['atividade_id'], 'aba' => 'plano'], $naoCumpr),
                               array_map($itOc, array_slice($abertos, 0, 10)))];
    $kpis = [$kS, $kQ, $kD, $kC, $kP];
    foreach ($kpis as &$k) { $t = $k['tendencia']; $dl = $t['atual'] !== null && $t['anterior'] !== null ? round((float)$t['atual'] - (float)$t['anterior'], 2) : null;
        $k['tendencia']['delta'] = $dl; $k['tendencia']['melhorou'] = $dl === null || abs($dl) < 0.005 ? null : (($dl > 0) !== $t['menor_melhor']); } unset($k);

    /* ═══ Causas dos atrasos (só o que trava a obra), pesadas por dias perdidos ═══ */
    $atrasadas = []; foreach ($dados as $pid => [$F]) foreach ($F as $a) if ($a['fim'] && $a['fim'] < $hoje && (int)$a['avanco'] < 100) $atrasadas[] = $a + ['projeto_id' => $pid];
    $causas = []; $comCausa = [];
    foreach ($oc as $o) { if ($o['data'] < $desde && $o['resolvida_em']) continue; if (!isset(IND_RAMO_DE[$o['tipo']])) continue;
        if ($o['tipo'] === 'Acidente' && !$o['atividade_id']) continue;   // acidente sem parar serviço conta na Segurança, não como causa de atraso
        $fim = $o['resolvida_em'] ? substr($o['resolvida_em'], 0, 10) : $hoje; $dias = max(1, rel_dias(max($o['data'], $desde), $fim));
        $causas[] = ['ramo' => IND_RAMO_DE[$o['tipo']], 'causa' => $o['tipo'], 'dias' => $dias] + $itOc($o); if ($o['atividade_id']) $comCausa[(int)$o['atividade_id']] = true; }
    foreach ($naoCumpr as $c) { $tipo = MOTIVOS_TRAVOU[$c['motivo'] ?? ''][0] ?? null; if (!$tipo) continue;
        $causas[] = ['ramo' => IND_RAMO_DE[$tipo] ?? 'metodo', 'causa' => $tipo, 'dias' => 1, 'texto' => $c['descricao'] . ' · compromisso não cumprido', 'sub' => ($cod[$c['projeto_id']] ?? '') . ' · semana ' . rel_br($c['semana']), 'projeto_id' => $c['projeto_id'], 'atividade_id' => $c['atividade_id']];
        $comCausa[$c['atividade_id']] = true; }
    $semCausa = [];
    foreach ($atrasadas as $a) { $l = ['texto' => $a['descricao'], 'sub' => ($cod[$a['projeto_id']] ?? '') . ' · ' . rel_dias($a['fim'], $hoje) . ' d de atraso' . ($a['responsavel'] ? ' · ' . $a['responsavel'] : ''), 'projeto_id' => $a['projeto_id'], 'atividade_id' => (int)$a['id']];
        if (!$a['responsavel_id']) { $causas[] = ['ramo' => 'metodo', 'causa' => 'Sem responsável', 'dias' => max(1, rel_dias(max($a['fim'], $desde), $hoje))] + $l; $comCausa[(int)$a['id']] = true; }
        elseif (!isset($comCausa[(int)$a['id']])) $semCausa[] = $l; }
    $ramos = [];
    foreach (IND_RAMOS as $k => $n) { $L = array_values(array_filter($causas, fn($c) => $c['ramo'] === $k)); $g = [];
        foreach ($L as $c) { $g[$c['causa']]['titulo'] = $c['causa']; $g[$c['causa']]['dias'] = ($g[$c['causa']]['dias'] ?? 0) + $c['dias']; $g[$c['causa']]['qtd'] = ($g[$c['causa']]['qtd'] ?? 0) + 1; $g[$c['causa']]['itens'][] = $c; }
        usort($g, fn($a, $b) => $b['dias'] <=> $a['dias']);
        foreach ($g as &$x) { usort($x['itens'], fn($a, $b) => $b['dias'] <=> $a['dias']); $x['itens'] = array_slice($x['itens'], 0, 15); } unset($x);
        $ramos[] = ['chave' => $k, 'nome' => $n, 'dias' => array_sum(array_column($L, 'dias')), 'qtd' => count($L), 'grupos' => array_values($g)]; }
    $porCausa = []; foreach ($causas as $c) { $porCausa[$c['causa']]['causa'] = $c['causa']; $porCausa[$c['causa']]['ramo'] = IND_RAMOS[$c['ramo']]; $porCausa[$c['causa']]['dias'] = ($porCausa[$c['causa']]['dias'] ?? 0) + $c['dias']; $porCausa[$c['causa']]['qtd'] = ($porCausa[$c['causa']]['qtd'] ?? 0) + 1; }
    usort($porCausa, fn($a, $b) => $b['dias'] <=> $a['dias']); $tot = array_sum(array_column($porCausa, 'dias')); $acc = 0;
    foreach ($porCausa as &$c) { $c['pct'] = $tot ? (int)round($c['dias'] / $tot * 100) : 0; $acc += $c['dias']; $c['acum'] = $tot ? (int)round($acc / $tot * 100) : 0; } unset($c);

    /* ═══ Pendências de controle (não são causas: são registros e controles em falta) ═══ */
    $R2 = todos('SELECT id, nome, codigo, tipo FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 ORDER BY nome', [$eid]);
    $rids = array_map(fn($r) => (int)$r['id'], $R2); $rn = []; foreach ($R2 as $r) $rn[(int)$r['id']] = $r['nome'] . ($r['codigo'] ? " ({$r['codigo']})" : '');
    $ctrl = $rids ? rc_controles($eid, $rids, $hoje) : []; $venc = [];
    foreach ($ctrl as $rid => $c) foreach ($c['itens'] ?? [] as $x) if ($x['vence_em'] && $x['vence_em'] < $hoje) $venc[] = ['texto' => ($rn[$rid] ?? 'Recurso') . ' · ' . rc_nome_controle($x), 'sub' => 'Venceu em ' . rel_br_ano($x['vence_em']), 'recurso_id' => $rid];
    $resv = $rids ? array_values(array_filter(rc_reservas($eid, $hoje, Calendario::mais($hoje, 30), $rids), fn($x) => in_array((int)$x['projeto_id'], $pids, true))) : [];
    $confl = array_map(fn($c) => ['texto' => ($rn[(int)$c['recurso_id']] ?? 'Recurso') . ' em duas atividades ao mesmo tempo', 'sub' => implode(' × ', array_map(fn($a) => $a['obra'] . ' · ' . $a['descricao'], $c['atividades'])) . ' · ' . rc_periodo($c['de'], $c['ate']), 'recurso_id' => (int)$c['recurso_id']], rc_conflitos($resv));
    $parado = [];
    foreach ($atrasadas as $a) { $ev = $dados[$a['projeto_id']][2][(int)$a['id']] ?? []; $ul = $ev ? end($ev)[0] : null;
        if (!$ul || $ul < Calendario::mais($hoje, -7)) $parado[] = ['texto' => $a['descricao'], 'sub' => ($cod[$a['projeto_id']] ?? '') . ' · ' . ($ul ? 'último avanço em ' . rel_br($ul) : 'nunca atualizada'), 'projeto_id' => $a['projeto_id'], 'atividade_id' => (int)$a['id']]; }
    $rdoP = array_values(array_filter(rdo_pendencias($u), fn($r) => in_array((int)$r['projeto_id'], $pids, true)));
    $rdoL = array_map(fn($r) => ['texto' => $r['tipo'] === 'sem' ? "Dia sem RDO · {$r['obra']}" : 'RDO de ' . rel_br($r['data']) . " · {$r['obra']}", 'sub' => ['sem' => rel_br_ano($r['data']), 'rasc' => 'em rascunho', 'fech' => 'fechado, falta entregar', 'entr' => 'falta a folha assinada'][$r['tipo']] ?? '', 'rdo_id' => $r['id'] ?? null, 'projeto_id' => (int)$r['projeto_id'], 'data' => $r['data']], $rdoP);
    $sobre = array_values(array_map(fn($c) => ['texto' => $c['nome'] . ' · ' . $c['carga'] . '% da capacidade', 'sub' => 'próximos 14 dias · ' . $c['obras'], 'equipe' => true], array_filter($cargaL, fn($c) => $c['carga'] > 100)));
    $pend = array_values(array_filter([
        ['chave' => 'sem_causa', 'titulo' => 'Atrasos sem causa registrada', 'dica' => 'Peça ao responsável para registrar o Travou: sem causa não dá para agir.', 'itens' => $semCausa],
        ['chave' => 'parado', 'titulo' => 'Atrasadas sem avanço lançado há 7 dias', 'dica' => 'O número pode estar desatualizado.', 'itens' => $parado],
        ['chave' => 'rdo', 'titulo' => 'RDO pendente', 'dica' => 'Dias úteis sem RDO e RDOs ainda não concluídos.', 'itens' => $rdoL],
        ['chave' => 'docs', 'titulo' => 'Documentos vencidos ou faltando', 'dica' => 'Pessoas alocadas nas obras.', 'itens' => array_map(fn($f, $l) => ['texto' => $nasObras[$f], 'sub' => implode(' · ', $l), 'equipe' => true], array_keys($docProb), $docProb)],
        ['chave' => 'controles', 'titulo' => 'Calibração, manutenção ou inspeção vencida', 'dica' => 'Equipamentos ativos.', 'itens' => $venc],
        ['chave' => 'conflitos', 'titulo' => 'Conflitos de reserva de equipamento', 'dica' => 'Próximos 30 dias.', 'itens' => $confl],
        ['chave' => 'sobrecarga', 'titulo' => 'Pessoas acima da capacidade', 'dica' => 'Próximos 14 dias.', 'itens' => $sobre],
    ], fn($g) => count($g['itens']) > 0));
    foreach ($pend as &$g) { $g['qtd'] = count($g['itens']); $g['itens'] = array_slice($g['itens'], 0, 20); } unset($g);

    /* ═══ Curva S (previsto × real × projeção) ═══ */
    $curva = null;
    $comF = array_values(array_filter($obras, fn($p) => !empty($dados[(int)$p['id']][0])));
    if ($comF) {
        $ini = null; $fim = null;
        foreach ($comF as $p) { [$F, $base] = $dados[(int)$p['id']];
            foreach ($F as $a) { $b = $base[(int)$a['id']] ?? []; foreach ([$b['inicio'] ?? null, $a['inicio']] as $d) if ($d) $ini = min($ini ?? $d, $d); foreach ([$b['fim'] ?? null, $a['fim']] as $d) if ($d) $fim = max($fim ?? $d, $d); }
            if ($p['fim']) $fim = max($fim ?? $p['fim'], $p['fim']); }
        $ini = ind_segunda($ini ?? $hoje); $fim = $fim ?? $hoje;
        $peso = fn($p) => (float)($p['orcamento'] ?: $p['valor_contrato'] ?: 1); $somaP = array_sum(array_map($peso, $comF));
        $em = function (string $d, bool $real) use ($comF, $dados, $peso, $somaP) { $s = 0.0;
            foreach ($comF as $p) { [$F, $base, $ev] = $dados[(int)$p['id']]; $v = $real ? rel_real($F, $base, $ev, $d) : (rel_previsto($F, $base, $d) ?? 0); $s += $peso($p) * $v; }
            return round($s / $somaP, 1); };
        $passo = max(7, (int)ceil(rel_dias($ini, $fim) / 60 / 7) * 7);    // até ~60 pontos
        $pts = []; for ($d = $ini; ; $d = Calendario::mais($d, $passo)) { if ($d === $hoje) continue; $pts[] = ['data' => $d, 'previsto' => $em($d, false), 'real' => $d <= $hoje ? $em($d, true) : null]; if ($d >= $fim) break; }
        $rh = $em($hoje, true); $r4 = $em(Calendario::mais($hoje, -28), true); $ritmo = ($rh - $r4) / 28;      // pontos por dia nas últimas 4 semanas
        $fimProj = $rh >= 100 ? $hoje : ($ritmo > 0.01 ? Calendario::mais($hoje, (int)ceil((100 - $rh) / $ritmo)) : null);
        $pts[] = ['data' => $hoje, 'previsto' => $em($hoje, false), 'real' => $rh, 'hoje' => true];
        usort($pts, fn($a, $b) => strcmp($a['data'], $b['data']));
        foreach ($pts as &$x) $x['projetado'] = $x['data'] >= $hoje && $ritmo > 0.01 ? min(100, round($rh + $ritmo * rel_dias($hoje, $x['data']), 1)) : null; unset($x);
        $ult = end($pts)['data'];
        if ($fimProj && $fimProj > $ult && rel_dias($ult, $fimProj) < 730) $pts[] = ['data' => $fimProj, 'previsto' => 100.0, 'real' => null, 'projetado' => 100.0];
        $contr = array_filter(array_map(fn($p) => $p['fim'], $comF));
        $curva = ['pontos' => $pts, 'hoje' => $hoje, 'fim_previsto' => $fim, 'fim_contrato' => $contr ? max($contr) : null, 'fim_projetado' => $fimProj, 'ritmo_semana' => round($ritmo * 7, 1),
                  'titulo' => count($comF) === 1 ? $cod[(int)$comF[0]['id']] : 'Todas as obras (ponderado pelo valor)'];
    }

    /* ═══ Equipamentos: ocupação nos próximos 14 dias ═══ */
    $equip = [];
    if ($rids) { $res14 = rc_reservas($eid, $hoje, Calendario::mais($hoje, 13), $rids); $porR = []; foreach ($res14 as $x) if (!$filtro || in_array((int)$x['projeto_id'], $pids, true)) $porR[(int)$x['recurso_id']][] = $x;
        foreach ($R2 as $r) { $o = rc_ocupacao($porR[(int)$r['id']] ?? [], $hoje, 14); if ($o > 0 || !$filtro) $equip[] = ['nome' => $r['nome'], 'codigo' => $r['codigo'], 'ocupacao' => $o, 'id' => (int)$r['id']]; }
        usort($equip, fn($a, $b) => $b['ocupacao'] <=> $a['ocupacao']); }

    /* ═══ Resumo em uma frase ═══ */
    $noPrazo = count(array_filter($prazo, fn($o) => $o['farol'] === 'verde'));
    $frase = count($prazo) ? "$noPrazo de " . count($prazo) . ' obra' . (count($prazo) > 1 ? 's' : '') . ' no prazo' : 'Nenhuma obra com cronograma';
    if ($pior && $pior['idp'] !== null && $pior['idp'] < 1) $frase .= " · {$pior['codigo']} é a mais atrasada (IDP " . ind_num($pior['idp'], 2) . ($pior['desvio_dias'] > 0 ? ", término +{$pior['desvio_dias']} d" : '') . ')';
    if ($porCausa) $frase .= ' · principal causa: ' . mb_strtolower($porCausa[0]['causa']) . " ({$porCausa[0]['dias']} dia" . ($porCausa[0]['dias'] > 1 ? 's' : '') . ' perdido' . ($porCausa[0]['dias'] > 1 ? 's' : '') . ')';
    if ($semCausa) $frase .= ' · ' . count($semCausa) . ' atraso' . (count($semCausa) > 1 ? 's' : '') . ' sem causa registrada';

    return ['hoje' => $hoje, 'agora' => gmdate('H:i', time() - 3 * 3600), 'obra' => $filtro ?: null, 'periodo' => $per, 'desde' => $desde,
            'obras' => array_map(fn($p) => ['id' => (int)$p['id'], 'codigo' => $p['codigo'], 'nome' => $p['nome']], $todas),
            'resumo' => $frase, 'kpis' => $kpis, 'semanas' => $semanas, 'prazo_obras' => $prazo, 'curva' => $curva,
            'causas' => ['ramos' => $ramos, 'pareto' => array_values($porCausa), 'total_dias' => $tot, 'atrasadas' => count($atrasadas), 'sem_causa' => count($semCausa)],
            'pendencias' => $pend, 'equipe' => array_slice($cargaL, 0, 12), 'equipamentos' => array_slice($equip, 0, 12),
            'metas' => array_intersect_key($R, TF_METAS)];
}
