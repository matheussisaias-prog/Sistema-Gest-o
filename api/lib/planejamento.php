<?php
/* Aprumo · servidor · planejamento e controle:
   - Plano da semana (Last Planner): a equipe se compromete com o avanço de cada atividade na semana; o PPC é calculado
     sozinho pelo avanço lançado e, quando não cumpre, registra-se o motivo (os mesmos do Travou).
   - Custos realizados por obra e custo orçado: valor agregado, IDC (CPI) e estimativa no término.
   - Ocorrências avulsas (acidente, incidente, clima…) registradas pelo RDO, sem precisar travar uma atividade.
   - Avisos do sininho (tabela avisos): lista e marcar como lidos. */
declare(strict_types=1);

const CUSTO_CATEGORIAS = ['Mão de obra', 'Material', 'Equipamento', 'Terceiros', 'Outros'];
const OCOR_TIPOS = ['Clima', 'Falta de material', 'Acidente', 'Pendência do cliente', 'Equipamento', 'Falta de equipe', 'Projeto', 'Retrabalho', 'Outro'];

function pl_segunda(string $d): string { $w = (int)gmdate('N', strtotime("$d 12:00:00 UTC")); return Calendario::mais($d, 1 - $w); }
function pl_hoje(): string { return gmdate('Y-m-d', time() - 3 * 3600); }
/** Obra visível e com permissão de planejar (gestão ou encarregado membro da obra). */
function pl_obra(array $u, int $pid): array {
    exigir_perfil($u, RDO_CAMPO);
    return obra_da_empresa($u, $pid);
}
/** Compromissos de uma semana com a situação calculada pelo avanço (no fim da semana, ou hoje se ainda está correndo). */
function pl_compromissos(int $eid, int $pid, string $semana): array {
    [$F, , $ev] = rel_base_obra($eid, $pid); $porId = []; foreach ($F as $a) $porId[(int)$a['id']] = $a;
    $hoje = pl_hoje(); $fimSem = Calendario::mais($semana, 6); $ref = min($fimSem, $hoje); $fechada = $fimSem < $hoje;
    $L = todos('SELECT p.*, u.nome AS por FROM plano_semanal p LEFT JOIN usuarios u ON u.id = p.criado_por WHERE p.projeto_id = ? AND p.semana = ? ORDER BY p.id', [$pid, $semana]);
    $out = [];
    foreach ($L as $c) {
        $a = $porId[(int)$c['atividade_id']] ?? null; if (!$a) continue;
        $av = rel_avanco_em($a, $ev[(int)$a['id']] ?? [], $ref);
        $ok = $av >= (int)$c['meta_avanco'];
        $out[] = ['id' => (int)$c['id'], 'atividade_id' => (int)$a['id'], 'descricao' => $a['descricao'], 'codigo_eap' => $a['codigo_eap'], 'responsavel' => $a['responsavel'],
                  'inicio' => $a['inicio'], 'fim' => $a['fim'], 'avanco_inicio' => (int)$c['avanco_inicio'], 'meta' => (int)$c['meta_avanco'], 'avanco' => $av,
                  'situacao' => $ok ? 'cumprido' : ($fechada ? 'nao_cumprido' : 'andamento'), 'motivo' => $c['motivo'], 'obs' => $c['obs'], 'por' => $c['por']];
    }
    return [$out, $fechada];
}
/** PPC de uma lista de obras nas semanas pedidas: [semana => [comprometidas, cumpridas, ppc]]. Só conta semanas já fechadas ou a atual. */
function pl_ppc(int $eid, array $pids, array $semanas): array {
    $out = []; foreach ($semanas as $s) $out[$s] = ['semana' => $s, 'comprometidas' => 0, 'cumpridas' => 0, 'ppc' => null, 'aberta' => Calendario::mais($s, 6) >= pl_hoje()];
    if (!$pids || !$semanas) return $out;
    $tem = todos('SELECT DISTINCT projeto_id, semana FROM plano_semanal WHERE empresa_id = ? AND projeto_id IN (' . implode(',', array_map('intval', $pids)) . ') AND semana IN (' . implode(',', array_map(fn($s) => db()->quote($s), $semanas)) . ')', [$eid]);
    foreach ($tem as $t) {
        [$L] = pl_compromissos($eid, (int)$t['projeto_id'], $t['semana']);
        $o = &$out[$t['semana']]; $o['comprometidas'] += count($L); $o['cumpridas'] += count(array_filter($L, fn($c) => $c['situacao'] === 'cumprido')); unset($o);
    }
    // o PPC de uma semana só vale quando ela termina (a semana corrente mostra quanto já foi cumprido, sem nota)
    foreach ($out as &$o) $o['ppc'] = $o['comprometidas'] && !$o['aberta'] ? (int)round($o['cumpridas'] / $o['comprometidas'] * 100) : null; unset($o);
    return $out;
}
/** Motivos de não cumprimento de compromissos (para o Pareto e o Ishikawa). */
function pl_motivos_nao_cumpridos(int $eid, array $pids, string $desde): array {
    if (!$pids) return [];
    $out = [];
    foreach (todos('SELECT DISTINCT projeto_id, semana FROM plano_semanal WHERE empresa_id = ? AND semana >= ? AND projeto_id IN (' . implode(',', array_map('intval', $pids)) . ')', [$eid, pl_segunda($desde)]) as $t) {
        [$L] = pl_compromissos($eid, (int)$t['projeto_id'], $t['semana']);
        foreach ($L as $c) if ($c['situacao'] === 'nao_cumprido') $out[] = $c + ['projeto_id' => (int)$t['projeto_id'], 'semana' => $t['semana']];
    }
    return $out;
}

/** GET /api/obras/{id}/plano?semana= — compromissos da semana, atividades que podem entrar e PPC das últimas 8 semanas. */
function rota_obra_plano(int $pid): array {
    $u = exigir_login(); $p = pl_obra($u, $pid); $eid = (int)$u['empresa_id']; $hoje = pl_hoje();
    $semana = pl_segunda(!empty($_GET['semana']) ? (data_ok((string)$_GET['semana'], 'semana') ?? $hoje) : $hoje);
    [$L, $fechada] = pl_compromissos($eid, $pid, $semana);
    $fimSem = Calendario::mais($semana, 6);
    [$F, $base] = rel_base_obra($eid, $pid); $dentro = array_flip(array_column($L, 'atividade_id'));
    $cands = [];
    foreach ($F as $a) {
        if ((int)$a['avanco'] >= 100 || isset($dentro[(int)$a['id']]) || !$a['inicio']) continue;
        if ($a['inicio'] > Calendario::mais($fimSem, 7)) continue;                       // começa depois da semana seguinte: ainda não é hora
        $prev = fracao_prevista($a['inicio'], $a['fim'] ?: $a['inicio'], $fimSem);
        $cands[] = ['atividade_id' => (int)$a['id'], 'descricao' => $a['descricao'], 'codigo_eap' => $a['codigo_eap'], 'responsavel' => $a['responsavel'], 'inicio' => $a['inicio'], 'fim' => $a['fim'],
                    'avanco' => (int)$a['avanco'], 'sugestao' => max((int)$a['avanco'] + 10, (int)round(($prev ?? 1) * 100)), 'atrasada' => $a['fim'] && $a['fim'] < $hoje];
    }
    usort($cands, fn($a, $b) => [!$a['atrasada'], $a['inicio']] <=> [!$b['atrasada'], $b['inicio']]);
    $sems = []; for ($i = 7; $i >= 0; $i--) $sems[] = Calendario::mais(pl_segunda($hoje), -7 * $i);
    $ppc = array_values(pl_ppc($eid, [$pid], $sems));
    $cumpr = count(array_filter($L, fn($c) => $c['situacao'] === 'cumprido'));
    return ['semana' => $semana, 'fim' => $fimSem, 'hoje' => $hoje, 'fechada' => $fechada, 'atual' => $semana === pl_segunda($hoje),
            'pode_editar' => !$fechada, 'compromissos' => $L, 'candidatas' => $cands, 'ppc' => $L ? (int)round($cumpr / count($L) * 100) : null, 'historico' => $ppc,
            'motivos' => array_map(fn($k, $m) => ['id' => $k, 'nome' => $m[1]], array_keys(MOTIVOS_TRAVOU), MOTIVOS_TRAVOU)];
}
/** POST /api/obras/{id}/plano — {semana, itens: [{atividade_id, meta}]}: acrescenta ou ajusta compromissos (semana atual ou seguintes). */
function rota_obra_plano_salvar(int $pid): array {
    $u = exigir_login(); pl_obra($u, $pid); $eid = (int)$u['empresa_id']; $d = corpo(); $hoje = pl_hoje();
    $semana = pl_segunda(data_ok((string)($d['semana'] ?? ''), 'semana') ?? $hoje);
    if (Calendario::mais($semana, 6) < $hoje) throw new ErroApi('Essa semana já terminou: o plano dela não muda mais');
    $itens = is_array($d['itens'] ?? null) ? $d['itens'] : []; if (!$itens) throw new ErroApi('Escolha pelo menos uma atividade');
    $n = 0;
    foreach ($itens as $it) {
        $aid = (int)($it['atividade_id'] ?? 0);
        $a = um('SELECT a.id, a.avanco FROM atividades a WHERE a.id = ? AND a.projeto_id = ? AND a.empresa_id = ? AND a.excluido_em IS NULL AND NOT EXISTS (SELECT 1 FROM atividades x WHERE x.pai_id = a.id AND x.excluido_em IS NULL)', [$aid, $pid, $eid]);
        if (!$a) throw new ErroApi('Atividade não encontrada nesta obra', 404);
        $meta = (int)round((float)($it['meta'] ?? 100)); $meta = max(min(100, (int)$a['avanco'] + 1), min(100, $meta));
        $ja = um('SELECT id FROM plano_semanal WHERE atividade_id = ? AND semana = ?', [$aid, $semana]);
        if ($ja) q('UPDATE plano_semanal SET meta_avanco = ? WHERE id = ?', [$meta, $ja['id']]);
        else inserir('plano_semanal', ['empresa_id' => $eid, 'projeto_id' => $pid, 'atividade_id' => $aid, 'semana' => $semana, 'meta_avanco' => $meta, 'avanco_inicio' => (int)$a['avanco'], 'criado_por' => $u['id']]);
        $n++;
    }
    registrar($u, $eid, 'projetos', $pid, 'alterou', null, ['plano_semana' => $semana, 'compromissos' => $n]);
    return ['ok' => true, 'semana' => $semana, 'salvos' => $n];
}
/** PATCH /api/plano/{id} — {motivo?, obs?, meta?}; DELETE /api/plano/{id} tira o compromisso (só semana que não terminou). */
function pl_item(array $u, int $id): array {
    $c = um('SELECT * FROM plano_semanal WHERE id = ? AND empresa_id = ?', [$id, $u['empresa_id']]);
    if (!$c) throw new ErroApi('Compromisso não encontrado', 404);
    pl_obra($u, (int)$c['projeto_id']); return $c;
}
function rota_plano_alterar(int $id): array {
    $u = exigir_login(); $c = pl_item($u, $id); $d = corpo(); $ch = [];
    if (array_key_exists('motivo', $d)) { $m = (string)$d['motivo']; if ($m !== '' && !isset(MOTIVOS_TRAVOU[$m])) throw new ErroApi('Motivo inválido'); $ch['motivo'] = $m ?: null; }
    if (array_key_exists('obs', $d)) $ch['obs'] = mb_substr(trim((string)$d['obs']), 0, 255) ?: null;
    if (array_key_exists('meta', $d)) { if (Calendario::mais($c['semana'], 6) < pl_hoje()) throw new ErroApi('Essa semana já terminou'); $ch['meta_avanco'] = max(1, min(100, (int)$d['meta'])); }
    if ($ch) { if (isset($ch['motivo']) || array_key_exists('motivo', $ch)) { $ch['avaliado_por'] = $u['id']; $ch['avaliado_em'] = agora(); } atualizar('plano_semanal', $id, $ch); }
    return ['ok' => true];
}
function rota_plano_excluir(int $id): array {
    $u = exigir_login(); $c = pl_item($u, $id);
    if (Calendario::mais($c['semana'], 6) < pl_hoje()) throw new ErroApi('Essa semana já terminou: o compromisso fica no histórico');
    q('DELETE FROM plano_semanal WHERE id = ?', [$id]);
    return ['ok' => true];
}

/* ── custos ─────────────────────────────────────────────────── */
/** Valor agregado da obra com custos: orçamento (custo orçado, ou o valor do contrato quando não há), CR, VA, VP, IDC, IDP, EAT. */
function cu_resumo(int $eid, array $p, ?string $ate = null): array {
    $ate = $ate ?: pl_hoje(); $pid = (int)$p['id'];
    [$F, $base, $ev] = rel_base_obra($eid, $pid);
    $orc = (float)($p['orcamento'] ?: 0) ?: (float)($p['valor_contrato'] ?: 0);
    $real = $F ? rel_real($F, $base, $ev, $ate) : 0.0; $prev = $F ? rel_previsto($F, $base, $ate) : null;
    $cr = (float)(um('SELECT COALESCE(SUM(valor), 0) AS s FROM custos WHERE projeto_id = ? AND excluido_em IS NULL AND data <= ?', [$pid, $ate])['s'] ?? 0);
    $va = $orc * $real / 100; $vp = $prev === null ? null : $orc * $prev / 100;
    $idc = $cr > 0 && $va > 0 ? round($va / $cr, 2) : null; $idp = $vp ? round($va / $vp, 2) : null;
    return ['orcamento' => $orc ?: null, 'orcamento_proprio' => (bool)$p['orcamento'], 'custo_real' => $cr, 'valor_agregado' => $va, 'valor_planejado' => $vp, 'real' => $real, 'previsto' => $prev,
            'idc' => $idc, 'idp' => $idp, 'estimativa_termino' => $idc ? round($orc / $idc, 2) : null, 'variacao_custo' => $cr > 0 ? $va - $cr : null];
}
function cu_obra(array $u, int $pid): array { exigir_perfil($u, PODE_TUDO); return obra_da_empresa($u, $pid); }
/** GET /api/obras/{id}/custos */
function rota_obra_custos(int $pid): array {
    $u = exigir_login(); $p = cu_obra($u, $pid); $eid = (int)$u['empresa_id'];
    $L = todos('SELECT c.id, c.data, c.categoria, c.descricao, c.valor, u.nome AS por FROM custos c LEFT JOIN usuarios u ON u.id = c.criado_por WHERE c.projeto_id = ? AND c.excluido_em IS NULL ORDER BY c.data DESC, c.id DESC', [$pid]);
    foreach ($L as &$c) { $c['id'] = (int)$c['id']; $c['valor'] = (float)$c['valor']; } unset($c);
    $cat = array_fill_keys(CUSTO_CATEGORIAS, 0.0); foreach ($L as $c) $cat[$c['categoria']] += $c['valor'];
    // série mensal: custo acumulado × valor agregado no fim de cada mês
    $serie = []; $ini = $p['inicio'] ?: ($L ? min(array_column($L, 'data')) : pl_hoje());
    for ($m = substr($ini, 0, 7) . '-01'; $m <= pl_hoje(); $m = gmdate('Y-m-01', strtotime("$m +1 month"))) {
        $fimM = min(gmdate('Y-m-t', strtotime($m)), pl_hoje()); $r = cu_resumo($eid, $p, $fimM);
        $serie[] = ['mes' => substr($m, 0, 7), 'custo_real' => $r['custo_real'], 'valor_agregado' => $r['valor_agregado'], 'valor_planejado' => $r['valor_planejado']];
        if (count($serie) > 36) break;
    }
    return ['resumo' => cu_resumo($eid, $p), 'categorias' => array_map(fn($k, $v) => ['categoria' => $k, 'valor' => $v], array_keys($cat), $cat),
            'lancamentos' => $L, 'serie' => $serie, 'opcoes' => CUSTO_CATEGORIAS, 'valor_contrato' => $p['valor_contrato'] !== null ? (float)$p['valor_contrato'] : null, 'orcamento' => $p['orcamento'] !== null ? (float)$p['orcamento'] : null];
}
/** POST /api/obras/{id}/custos — {data, categoria, descricao, valor} */
function rota_obra_custos_criar(int $pid): array {
    $u = exigir_login(); cu_obra($u, $pid); $d = corpo();
    $cat = (string)($d['categoria'] ?? ''); if (!in_array($cat, CUSTO_CATEGORIAS, true)) throw new ErroApi('Escolha a categoria');
    $desc = trim(mb_substr((string)($d['descricao'] ?? ''), 0, 200)); if ($desc === '') throw new ErroApi('Descreva o custo');
    $valor = num_ok($d['valor'] ?? null, 'valor', 0.01, 1e11); if ($valor === null) throw new ErroApi('Informe o valor');
    $data = data_ok((string)($d['data'] ?? ''), 'data') ?? pl_hoje(); if ($data > pl_hoje()) throw new ErroApi('Lance só custos já realizados (data até hoje)');
    $id = inserir('custos', ['empresa_id' => $u['empresa_id'], 'projeto_id' => $pid, 'data' => $data, 'categoria' => $cat, 'descricao' => $desc, 'valor' => $valor, 'criado_por' => $u['id']]);
    registrar($u, (int)$u['empresa_id'], 'custos', $id, 'criou', null, ['obra' => $pid, 'categoria' => $cat, 'valor' => $valor, 'descricao' => $desc]);
    return ['ok' => true, 'id' => $id];
}
/** DELETE /api/custos/{id} */
function rota_custos_excluir(int $id): array {
    $u = exigir_login(); $c = um('SELECT * FROM custos WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$c) throw new ErroApi('Lançamento não encontrado', 404); cu_obra($u, (int)$c['projeto_id']);
    q('UPDATE custos SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'custos', $id, 'excluiu', ['categoria' => $c['categoria'], 'valor' => (float)$c['valor'], 'descricao' => $c['descricao']], null);
    return ['ok' => true];
}

/* ── ocorrência avulsa (pelo RDO / indicadores) ─────────────── */
/** POST /api/obras/{id}/ocorrencias — {data, tipo, gravidade, descricao, atividade_id?, parou?}. "parou" deixa aberta (vira Travou da atividade). */
function rota_obra_ocorrencia(int $pid): array {
    $u = exigir_login(); exigir_perfil($u, RDO_CAMPO); $p = obra_da_empresa($u, $pid); $d = corpo();
    $tipo = (string)($d['tipo'] ?? ''); if (!in_array($tipo, OCOR_TIPOS, true)) throw new ErroApi('Escolha o tipo da ocorrência');
    $grav = in_array($d['gravidade'] ?? '', ['Baixa', 'Média', 'Alta'], true) ? $d['gravidade'] : 'Média';
    $desc = trim(mb_substr((string)($d['descricao'] ?? ''), 0, 2000)); if ($desc === '') throw new ErroApi('Descreva o que aconteceu');
    $data = data_ok((string)($d['data'] ?? ''), 'data') ?? pl_hoje(); if ($data > pl_hoje()) throw new ErroApi('A data não pode ser no futuro');
    $aid = !empty($d['atividade_id']) ? (int)$d['atividade_id'] : null;
    if ($aid && !um('SELECT id FROM atividades WHERE id = ? AND projeto_id = ? AND excluido_em IS NULL', [$aid, $pid])) throw new ErroApi('Atividade não encontrada nesta obra', 404);
    $parou = !empty($d['parou']) && $aid;
    if ($parou) { $ab = um('SELECT id FROM ocorrencias WHERE atividade_id = ? AND resolvida_em IS NULL AND excluido_em IS NULL', [$aid]); if ($ab) q('UPDATE ocorrencias SET resolvida_em = UTC_TIMESTAMP(), resolvida_por = ? WHERE id = ?', [$u['id'], $ab['id']]); }
    $id = inserir('ocorrencias', ['empresa_id' => $u['empresa_id'], 'projeto_id' => $pid, 'atividade_id' => $aid, 'data' => $data, 'tipo' => $tipo, 'gravidade' => $grav, 'descricao' => $desc,
                                  'registrada_por' => $u['id'], 'resolvida_em' => $parou ? null : agora(), 'resolvida_por' => $parou ? null : $u['id']]);
    registrar($u, (int)$u['empresa_id'], 'ocorrencias', $id, 'criou', null, ['tipo' => $tipo, 'gravidade' => $grav, 'descricao' => $desc, 'obra' => $p['codigo'] ?: $p['nome']]);
    if ($tipo === 'Acidente') {   // acidente avisa toda a gestão na hora
        foreach (todos("SELECT id FROM usuarios WHERE empresa_id = ? AND perfil IN ('administrador','gestor') AND excluido_em IS NULL AND desativado_em IS NULL AND id <> ?", [$u['empresa_id'], $u['id']]) as $g)
            q('INSERT INTO avisos (empresa_id, usuario_id, tipo, titulo, link) VALUES (?,?,?,?,?)', [$u['empresa_id'], $g['id'], 'ocorrencia', mb_substr("Acidente ($grav) na " . ($p['codigo'] ?: $p['nome']) . ": $desc", 0, 160), "obra:$pid" . ($aid ? ":$aid" : '')]);
    }
    return ['ok' => true, 'id' => $id];
}

/* ── avisos do sininho ──────────────────────────────────────── */
/** GET /api/avisos — últimos 30 avisos do usuário e quantos não lidos. */
function rota_avisos(): array {
    $u = exigir_login();
    $L = todos('SELECT id, tipo, titulo, link, lido_em, criado_em FROM avisos WHERE usuario_id = ? ORDER BY id DESC LIMIT 30', [$u['id']]);
    foreach ($L as &$a) { $a['id'] = (int)$a['id']; $a['lido'] = (bool)$a['lido_em']; unset($a['lido_em']); } unset($a);
    return ['avisos' => $L, 'nao_lidos' => (int)(um('SELECT COUNT(*) AS n FROM avisos WHERE usuario_id = ? AND lido_em IS NULL', [$u['id']])['n'] ?? 0)];
}
/** POST /api/avisos/lidos */
function rota_avisos_lidos(): array {
    $u = exigir_login(); q('UPDATE avisos SET lido_em = UTC_TIMESTAMP() WHERE usuario_id = ? AND lido_em IS NULL', [$u['id']]);
    return ['ok' => true];
}
