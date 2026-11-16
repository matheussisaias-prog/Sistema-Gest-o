<?php
/* Aprumo · servidor · RDO (diário de obra): o sistema monta o rascunho com o que o campo registrou (avanços com foto,
   Travou, recursos), o encarregado completa (clima, presentes, terceiros, observações), o gestor fecha (conteúdo congelado
   e documento A4 com a logo), entrega e anexa a foto da folha assinada. Um RDO por obra por dia; cobra os dias úteis. */
declare(strict_types=1);

const RDO_CLIMA = ['Bom', 'Nublado', 'Chuva', 'Impraticável'];
const RDO_CAMPO = ['administrador', 'gestor', 'encarregado'];

function rdo_hoje(): string { return gmdate('Y-m-d', time() - 3 * 3600); }
function rdo_br(?string $d): string { return $d ? substr($d, 8, 2) . '/' . substr($d, 5, 2) . '/' . substr($d, 0, 4) : '—'; }
function rdo_semana(string $d): string { return ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][(int)gmdate('w', strtotime("$d 12:00:00 UTC"))]; }
function rdo_local(string $utc): string { return gmdate('Y-m-d H:i:s', strtotime("$utc UTC") - 3 * 3600); }

function rdo_obra(array $u, int $pid): array { exigir_perfil($u, RDO_CAMPO); return obra_da_empresa($u, $pid); }
function rdo_ler(array $u, int $id): array {
    exigir_perfil($u, RDO_CAMPO);
    $r = um('SELECT * FROM rdos WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$r) throw new ErroApi('RDO não encontrado', 404);
    obra_da_empresa($u, (int)$r['projeto_id']);
    return $r;
}

/** Conteúdo do dia montado com o que o sistema já tem. */
function rdo_montar(int $eid, array $p, string $dia, ?array $rdo): array {
    $pid = (int)$p['id'];
    // serviços executados: avanços do dia (Minhas atividades e cronograma), agrupados por atividade
    $serv = [];
    foreach (todos("SELECT v.atividade_id, v.de_avanco, v.para_avanco, v.comentario, v.id AS avanco_id, v.criado_em, us.nome AS por, a.descricao, a.codigo_eap
                    FROM avancos v JOIN atividades a ON a.id = v.atividade_id AND a.projeto_id = ? AND a.excluido_em IS NULL JOIN usuarios us ON us.id = v.usuario_id
                    WHERE v.empresa_id = ? AND v.criado_em >= ? AND v.criado_em < ? ORDER BY v.criado_em, v.id",
                   [$pid, $eid, gmdate('Y-m-d H:i:s', strtotime("$dia 03:00:00 UTC")), gmdate('Y-m-d H:i:s', strtotime("$dia 03:00:00 UTC") + 86400)]) as $v) {
        $k = (int)$v['atividade_id'];
        $serv[$k] ??= ['atividade_id' => $k, 'descricao' => $v['descricao'], 'eap' => $v['codigo_eap'], 'de' => (int)$v['de_avanco'], 'para' => (int)$v['para_avanco'], 'por' => [], 'comentarios' => [], 'avancos' => []];
        $serv[$k]['para'] = (int)$v['para_avanco']; $serv[$k]['por'][$v['por']] = true; $serv[$k]['avancos'][] = (int)$v['avanco_id'];
        if ($v['comentario']) $serv[$k]['comentarios'][] = $v['comentario'];
    }
    foreach (todos("SELECT h.registro_id, h.antes, h.depois, us.nome AS por, a.descricao, a.codigo_eap FROM historico h JOIN atividades a ON a.id = h.registro_id AND a.projeto_id = ? AND a.excluido_em IS NULL
                    LEFT JOIN usuarios us ON us.id = h.usuario_id
                    WHERE h.empresa_id = ? AND h.tabela = 'atividades' AND h.acao = 'alterou' AND h.quando >= ? AND h.quando < ? ORDER BY h.quando, h.id",
                   [$pid, $eid, gmdate('Y-m-d H:i:s', strtotime("$dia 03:00:00 UTC")), gmdate('Y-m-d H:i:s', strtotime("$dia 03:00:00 UTC") + 86400)]) as $h) {
        $dep = json_decode((string)$h['depois'], true) ?: []; if (!array_key_exists('avanco', $dep)) continue;
        $ant = json_decode((string)$h['antes'], true) ?: []; $k = (int)$h['registro_id'];
        $serv[$k] ??= ['atividade_id' => $k, 'descricao' => $h['descricao'], 'eap' => $h['codigo_eap'], 'de' => (int)($ant['avanco'] ?? 0), 'para' => (int)$dep['avanco'], 'por' => [], 'comentarios' => [], 'avancos' => []];
        $serv[$k]['para'] = max($serv[$k]['para'], (int)$dep['avanco']); if ($h['por']) $serv[$k]['por'][$h['por']] = true;
    }
    $fotos = [];
    foreach (todos("SELECT id, atividade_id, avanco_id, ocorrencia_id, tirada_em, legenda, no_rdo FROM fotos WHERE projeto_id = ? AND empresa_id = ? AND excluido_em IS NULL
                    AND ((tirada_em >= ? AND tirada_em < ?) OR rdo_id = ?) ORDER BY tirada_em", [$pid, $eid, gmdate('Y-m-d H:i:s', strtotime("$dia 03:00:00 UTC")), gmdate('Y-m-d H:i:s', strtotime("$dia 03:00:00 UTC") + 86400), $rdo['id'] ?? 0]) as $f)
        $fotos[] = ['id' => (int)$f['id'], 'atividade_id' => $f['atividade_id'] ? (int)$f['atividade_id'] : null, 'ocorrencia' => (bool)$f['ocorrencia_id'], 'hora' => substr(rdo_local($f['tirada_em']), 11, 5), 'legenda' => $f['legenda'], 'no_rdo' => (bool)(int)$f['no_rdo']];
    foreach ($serv as &$s) { $s['por'] = implode(', ', array_keys($s['por'])); $s['fotos'] = array_values(array_map(fn($f) => $f['id'], array_filter($fotos, fn($f) => $f['atividade_id'] === $s['atividade_id'] && !$f['ocorrencia']))); unset($s['avancos']); }
    unset($s);
    // ocorrências do dia (Travou e outras)
    $oc = array_map(fn($o) => ['id' => (int)$o['id'], 'tipo' => $o['tipo'], 'descricao' => $o['descricao'], 'atividade' => $o['atividade'], 'por' => $o['por'],
        'hora' => substr(rdo_local($o['criado_em']), 11, 5), 'liberada' => $o['resolvida_em'] ? substr(rdo_local($o['resolvida_em']), 11, 5) : null,
        'liberada_dia' => $o['resolvida_em'] ? substr(rdo_local($o['resolvida_em']), 0, 10) : null],
        todos("SELECT o.*, a.descricao AS atividade, us.nome AS por FROM ocorrencias o LEFT JOIN atividades a ON a.id = o.atividade_id LEFT JOIN usuarios us ON us.id = o.registrada_por
               WHERE o.projeto_id = ? AND o.empresa_id = ? AND o.data = ? ORDER BY o.criado_em", [$pid, $eid, $dia]));
    // equipamentos reservados nas atividades do dia
    $eq = array_values(array_map(fn($x) => ['recurso_id' => $x['recurso_id'], 'atividade' => $x['descricao']],
        array_filter(rc_reservas($eid, $dia, $dia, null, true), fn($x) => $x['projeto_id'] === $pid)));
    $nomesR = $eq ? array_column(todos('SELECT id, codigo, nome, tipo FROM recursos WHERE id IN (' . implode(',', array_unique(array_column($eq, 'recurso_id'))) . ')'), null, 'id') : [];
    $equip = [];
    foreach ($eq as $x) { $r = $nomesR[$x['recurso_id']] ?? null; if (!$r) continue; $k = (int)$r['id'];
        $equip[$k] ??= ['id' => $k, 'codigo' => $r['codigo'], 'nome' => $r['nome'], 'tipo' => $r['tipo'], 'atividades' => []]; $equip[$k]['atividades'][] = $x['atividade']; }
    // presentes: quem tem atividade na obra no dia + quem lançou algo + encarregados deles; ausências vêm desmarcadas
    $fids = array_map('intval', array_column(todos("SELECT DISTINCT responsavel_id FROM atividades WHERE projeto_id = ? AND empresa_id = ? AND excluido_em IS NULL AND responsavel_id IS NOT NULL
                                                    AND inicio <= ? AND COALESCE(fim, inicio) >= ?", [$pid, $eid, $dia, $dia]), 'responsavel_id'));
    foreach (todos("SELECT DISTINCT us.funcionario_id FROM avancos v JOIN atividades a ON a.id = v.atividade_id AND a.projeto_id = ? JOIN usuarios us ON us.id = v.usuario_id
                    WHERE us.funcionario_id IS NOT NULL AND v.criado_em >= ? AND v.criado_em < ?", [$pid, gmdate('Y-m-d H:i:s', strtotime("$dia 03:00:00 UTC")), gmdate('Y-m-d H:i:s', strtotime("$dia 03:00:00 UTC") + 86400)]) as $x) $fids[] = (int)$x['funcionario_id'];
    $salvas = $rdo ? array_column(todos('SELECT funcionario_id, presente FROM rdo_presencas WHERE rdo_id = ?', [$rdo['id']]), 'presente', 'funcionario_id') : [];
    $fids = array_values(array_unique(array_merge($fids, array_map('intval', array_keys($salvas)))));
    $P = $fids ? todos('SELECT id, nome, cargo, encarregado_id FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL AND id IN (' . implode(',', $fids) . ')', [$eid]) : [];
    $enc = array_values(array_diff(array_filter(array_map(fn($x) => (int)$x['encarregado_id'], $P)), $fids));
    if ($enc) $P = array_merge($P, todos('SELECT id, nome, cargo, encarregado_id FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 AND id IN (' . implode(',', $enc) . ')', [$eid]));
    $aus = eq_ausencia_hoje($eid, array_map(fn($x) => (int)$x['id'], $P), $dia);
    $pres = [];
    foreach ($P as $x) {
        $f = (int)$x['id']; $a = $aus[$f] ?? null;
        $pres[] = ['id' => $f, 'nome' => $x['nome'], 'cargo' => $x['cargo'], 'ausencia' => $a ? eq_texto_ausencia($a) : null,
                   'presente' => array_key_exists($f, $salvas) ? (bool)(int)$salvas[$f] : !$a, 'sugerido' => !array_key_exists($f, $salvas)];
    }
    usort($pres, fn($a, $b) => [stripos((string)$a['cargo'], 'encarregad') === false, $a['nome']] <=> [stripos((string)$b['cargo'], 'encarregad') === false, $b['nome']]);
    $presentes = count(array_filter($pres, fn($x) => $x['presente']));
    return ['servicos' => array_values($serv), 'ocorrencias' => $oc, 'equipamentos' => array_values($equip), 'presencas' => $pres, 'fotos' => $fotos,
            'presentes' => $presentes, 'total' => $presentes + (int)($rdo['terceiros'] ?? 0)];
}

/** Cabeçalho da empresa para o documento (logo embutida). */
function rdo_empresa(int $eid): array {
    $e = um('SELECT nome, razao_social, cnpj, telefone, cidade, uf, logo, logo_cor FROM empresas WHERE id = ?', [$eid]);
    $logo = null;
    if ($e['logo'] && is_file($arq = pasta_arquivos() . '/' . $e['logo'])) $logo = 'data:image/png;base64,' . base64_encode((string)file_get_contents($arq));
    $cnpj = $e['cnpj'] && strlen($e['cnpj']) === 14 ? preg_replace('/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/', '$1.$2.$3/$4-$5', $e['cnpj']) : $e['cnpj'];
    return ['nome' => $e['nome'], 'razao_social' => $e['razao_social'], 'cnpj' => $cnpj, 'telefone' => $e['telefone'], 'cidade' => $e['cidade'], 'uf' => $e['uf'],
            'logo' => $logo, 'cor' => $e['logo_cor'] ?: '#0f3d6e'];
}

function rdo_resumo(array $r): array {
    return ['id' => (int)$r['id'], 'numero' => $r['numero'] ? (int)$r['numero'] : null, 'data' => $r['data'], 'situacao' => $r['situacao'],
            'enviado' => (bool)$r['enviado_em'], 'entregue_em' => $r['entregue_em'], 'tem_folha' => (bool)$r['copia_assinada']];
}

/** Pendências de RDO nas obras que a pessoa vê (últimos 30 dias). */
function rdo_pendencias(array $u): array {
    $eid = (int)$u['empresa_id']; $hoje = rdo_hoje(); $vis = obras_visiveis($u); $R = empresa_regras($eid);
    $obras = todos("SELECT id, codigo, nome, inicio, fim, situacao FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao = 'Em andamento'" . ($vis !== null ? ($vis ? ' AND id IN (' . implode(',', $vis) . ')' : ' AND 0') : '') . ' ORDER BY codigo', [$eid]);
    $out = [];
    foreach ($obras as $o) {
        $pid = (int)$o['id']; $cal = calendario_da_obra($pid, $eid); $cod = $o['codigo'] ?: $o['nome'];
        $tem = array_column(todos('SELECT data, situacao, enviado_em, id FROM rdos WHERE projeto_id = ? AND excluido_em IS NULL AND data >= ?', [$pid, Calendario::mais($hoje, -30)]), null, 'data');
        $ini = max(Calendario::mais($hoje, -30), $o['inicio'] ?: $hoje);
        $limite = $cal->andar($hoje, -$R['rdo_prazo']);   // dia útil sem RDO só vira pendência depois do prazo da empresa
        for ($d = $ini; $d <= $limite; $d = Calendario::mais($d, 1)) if ($cal->util($d) && !isset($tem[$d]) && (!$o['fim'] || $d <= $o['fim'])) $out[] = ['tipo' => 'sem', 'obra' => $cod, 'projeto_id' => $pid, 'data' => $d];
        foreach (todos("SELECT id, data, situacao, enviado_em, copia_assinada FROM rdos WHERE projeto_id = ? AND excluido_em IS NULL AND situacao <> 'Assinado'" . ($R['rdo_assinatura'] ? '' : " AND situacao <> 'Entregue'") . ' ORDER BY data', [$pid]) as $r)
            $out[] = ['tipo' => ['Rascunho' => 'rasc', 'Fechado' => 'fech', 'Entregue' => 'entr'][$r['situacao']], 'obra' => $cod, 'projeto_id' => $pid, 'data' => $r['data'], 'id' => (int)$r['id'], 'enviado' => (bool)$r['enviado_em']];
    }
    // o que o gestor precisa fazer primeiro: rascunho enviado, rascunho, fechado (imprimir), entregue (folha) e, por último, dias sem RDO (mais recentes antes)
    $ordem = fn($p) => [$p['tipo'] === 'rasc' ? (!empty($p['enviado']) ? 0 : 1) : ['fech' => 2, 'entr' => 3, 'sem' => 4][$p['tipo']], $p['tipo'] === 'sem' ? -strtotime($p['data']) : strtotime($p['data'])];
    usort($out, fn($a, $b) => $ordem($a) <=> $ordem($b));
    return array_slice($out, 0, 60);
}

/** GET /api/rdos?obra=&mes=AAAA-MM — calendário do mês, indicadores e pendências. */
function rota_rdos(): array {
    $u = exigir_login(); exigir_perfil($u, RDO_CAMPO); $eid = (int)$u['empresa_id']; $hoje = rdo_hoje();
    $vis = obras_visiveis($u);
    $obras = todos("SELECT id, codigo, nome, situacao, inicio, fim FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL AND situacao <> 'Arquivado'" . ($vis !== null ? ($vis ? ' AND id IN (' . implode(',', $vis) . ')' : ' AND 0') : '') . " ORDER BY situacao = 'Em andamento' DESC, codigo", [$eid]);
    $out = ['hoje' => $hoje, 'obras' => array_map(fn($o) => ['id' => (int)$o['id'], 'codigo' => $o['codigo'], 'nome' => $o['nome'], 'situacao' => $o['situacao']], $obras),
            'pode_fechar' => in_array($u['perfil'], PODE_TUDO, true), 'pode_logo' => $u['perfil'] === 'administrador', 'pendencias' => rdo_pendencias($u)];
    $pid = (int)($_GET['obra'] ?? ($obras[0]['id'] ?? 0));
    if (!$pid) return $out + ['dias' => [], 'indicadores' => null];
    $p = rdo_obra($u, $pid);
    $mes = preg_match('/^\d{4}-\d{2}$/', (string)($_GET['mes'] ?? '')) ? $_GET['mes'] : substr($hoje, 0, 7);
    $ini = "$mes-01"; $fim = gmdate('Y-m-t', strtotime("$ini 12:00:00 UTC"));
    $cal = calendario_da_obra($pid, $eid);
    $R = array_column(todos('SELECT * FROM rdos WHERE projeto_id = ? AND excluido_em IS NULL AND data BETWEEN ? AND ?', [$pid, $ini, $fim]), null, 'data');
    $dias = []; $k = ['sem' => 0, 'rasc' => 0, 'fech' => 0, 'entr' => 0, 'ass' => 0]; $RG = empresa_regras($eid); $limite = $cal->andar($hoje, -$RG['rdo_prazo']);
    for ($d = $ini; $d <= $fim; $d = Calendario::mais($d, 1)) {
        $util = $cal->util($d) && (!$p['inicio'] || $d >= $p['inicio']) && (!$p['fim'] || $d <= $p['fim']);
        $r = $R[$d] ?? null; $e = $r ? ['Rascunho' => 'rasc', 'Fechado' => 'fech', 'Entregue' => 'entr', 'Assinado' => 'ass'][$r['situacao']] : ($d > $hoje ? 'futuro' : ($util ? ($d === $hoje ? 'hoje' : ($d > $limite ? 'prazo' : 'sem')) : 'nao'));
        if (isset($k[$e])) $k[$e]++;
        $dias[] = ['data' => $d, 'util' => $util, 'estado' => $e, 'rdo' => $r ? rdo_resumo($r) : null];
    }
    return $out + ['obra' => ['id' => $pid, 'codigo' => $p['codigo'], 'nome' => $p['nome']], 'mes' => $mes, 'dias' => $dias, 'indicadores' => $k, 'assinatura' => $RG['rdo_assinatura']];
}

/** POST /api/obras/{id}/rdos {data} — abre (ou devolve) o RDO do dia. */
function rota_rdo_abrir(int $pid): array {
    $u = exigir_login(); $p = rdo_obra($u, $pid); $eid = (int)$u['empresa_id'];
    $dia = data_ok((string)(corpo()['data'] ?? rdo_hoje()), 'data') ?: rdo_hoje();
    if ($dia > rdo_hoje()) throw new ErroApi('Não dá para abrir RDO de um dia que ainda não chegou');
    if ($r = um('SELECT id FROM rdos WHERE projeto_id = ? AND data = ? AND excluido_em IS NULL', [$pid, $dia])) return ['ok' => true, 'id' => (int)$r['id'], 'novo' => false];
    $num = (int)(um('SELECT MAX(numero) AS n FROM rdos WHERE projeto_id = ?', [$pid])['n'] ?? 0) + 1;
    try { $id = inserir('rdos', ['empresa_id' => $eid, 'projeto_id' => $pid, 'data' => $dia, 'numero' => $num, 'aberto_por' => $u['id']]); }
    catch (PDOException $e) { $r = um('SELECT id FROM rdos WHERE projeto_id = ? AND data = ?', [$pid, $dia]); if (!$r) throw $e; return ['ok' => true, 'id' => (int)$r['id'], 'novo' => false]; }
    registrar($u, $eid, 'rdos', $id, 'criou', null, ['obra' => $p['codigo'], 'data' => $dia]);
    return ['ok' => true, 'id' => $id, 'novo' => true];
}

/** GET /api/rdos/{id} — RDO completo (montado ao vivo no rascunho; congelado depois de fechado). */
function rota_rdo(int $id): array {
    $u = exigir_login(); $r = rdo_ler($u, $id); $eid = (int)$u['empresa_id'];
    $p = obra_da_empresa($u, (int)$r['projeto_id']);
    $cont = $r['situacao'] !== 'Rascunho' && $r['dados'] ? json_decode($r['dados'], true)['conteudo'] : rdo_montar($eid, $p, $r['data'], $r);
    $nome = fn($id) => $id ? (um('SELECT nome FROM usuarios WHERE id = ?', [$id])['nome'] ?? null) : null;
    $pf = in_array($u['perfil'], PODE_TUDO, true);
    return ['rdo' => rdo_resumo($r) + ['clima_manha' => $r['clima_manha'], 'clima_tarde' => $r['clima_tarde'], 'terceiros' => $r['terceiros'] !== null ? (int)$r['terceiros'] : null,
            'terceiros_desc' => $r['terceiros_desc'], 'observacoes' => $r['resumo'], 'aberto_por' => $nome($r['aberto_por']), 'aberto_em' => rdo_local($r['criado_em']),
            'enviado_por' => $nome($r['enviado_por']), 'enviado_em' => $r['enviado_em'] ? rdo_local($r['enviado_em']) : null, 'fechado_por' => $nome($r['fechado_por']),
            'fechado_em' => $r['fechado_em'] ? rdo_local($r['fechado_em']) : null, 'cliente_assinante' => $r['cliente_assinante'], 'assinado_cliente_em' => $r['assinado_cliente_em'], 'codigo' => $r['codigo'],
            'semana' => rdo_semana($r['data'])],
        'obra' => ['id' => (int)$p['id'], 'codigo' => $p['codigo'], 'nome' => $p['nome'], 'cliente' => $p['cliente']], 'conteudo' => $cont, 'hoje' => rdo_hoje(),
        'pode' => ['editar' => $r['situacao'] === 'Rascunho', 'fechar' => $pf && $r['situacao'] === 'Rascunho', 'reabrir' => $pf && $r['situacao'] === 'Fechado',
                   'entregar' => $r['situacao'] === 'Fechado', 'anexar' => in_array($r['situacao'], ['Fechado', 'Entregue'], true), 'enviar' => $r['situacao'] === 'Rascunho' && !$r['enviado_em'],
                   'excluir' => $pf && $r['situacao'] === 'Rascunho']];
}

/** PATCH /api/rdos/{id} — clima, terceiros, observações e presentes (só no rascunho). */
function rota_rdo_alterar(int $id): array {
    $u = exigir_login(); $r = rdo_ler($u, $id);
    if ($r['situacao'] !== 'Rascunho') throw new ErroApi('RDO fechado não muda. Peça ao gestor para reabrir.', 409);
    $d = corpo(); $c = [];
    foreach (['clima_manha', 'clima_tarde'] as $k) if (array_key_exists($k, $d)) {
        if ($d[$k] !== null && !in_array($d[$k], RDO_CLIMA, true)) throw new ErroApi('Clima inválido'); $c[$k] = $d[$k]; }
    if (array_key_exists('terceiros', $d)) { $c['terceiros'] = $d['terceiros'] === null || $d['terceiros'] === '' ? null : (int)num_ok($d['terceiros'], 'terceiros', 0, 500); }
    if (array_key_exists('terceiros_desc', $d)) $c['terceiros_desc'] = trim((string)$d['terceiros_desc']) !== '' ? mb_substr(trim((string)$d['terceiros_desc']), 0, 200) : null;
    if (array_key_exists('observacoes', $d)) $c['resumo'] = trim((string)$d['observacoes']) !== '' ? mb_substr(trim((string)$d['observacoes']), 0, 5000) : null;
    if (is_array($d['presencas'] ?? null)) {
        $ids = array_map(fn($x) => (int)($x['funcionario_id'] ?? 0), $d['presencas']);
        if ($ids && count(todos('SELECT id FROM funcionarios WHERE empresa_id = ? AND id IN (' . implode(',', $ids ?: [0]) . ')', [$u['empresa_id']])) !== count(array_unique($ids))) throw new ErroApi('Pessoa inválida');
        foreach ($d['presencas'] as $x) q('INSERT INTO rdo_presencas (rdo_id, funcionario_id, presente) VALUES (?,?,?) ON DUPLICATE KEY UPDATE presente = VALUES(presente)', [$id, (int)$x['funcionario_id'], !empty($x['presente']) ? 1 : 0]);
    }
    if ($c) atualizar('rdos', $id, $c);
    $p = um('SELECT * FROM projetos WHERE id = ?', [$r['projeto_id']]);
    $m = rdo_montar((int)$u['empresa_id'], $p, $r['data'], um('SELECT * FROM rdos WHERE id = ?', [$id]));
    q('UPDATE rdos SET efetivo = ? WHERE id = ?', [$m['total'], $id]);
    return ['ok' => true, 'presentes' => $m['presentes'], 'total' => $m['total']];
}

/** POST /api/rdos/{id}/enviar — o encarregado avisa que completou. */
function rota_rdo_enviar(int $id): array {
    $u = exigir_login(); $r = rdo_ler($u, $id);
    if ($r['situacao'] !== 'Rascunho') throw new ErroApi('Este RDO já foi fechado', 409);
    if (!$r['clima_manha'] && !$r['clima_tarde']) throw new ErroApi('Marque o clima antes de enviar');
    q('UPDATE rdos SET enviado_por = ?, enviado_em = UTC_TIMESTAMP() WHERE id = ?', [$u['id'], $id]);
    registrar($u, (int)$u['empresa_id'], 'rdos', $id, 'alterou', null, ['enviado_ao_gestor' => true]);
    return ['ok' => true];
}

/** POST /api/rdos/{id}/fechar — congela o conteúdo e libera o documento para imprimir. */
function rota_rdo_fechar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $r = rdo_ler($u, $id); $eid = (int)$u['empresa_id'];
    if ($r['situacao'] !== 'Rascunho') throw new ErroApi('Este RDO já está fechado', 409);
    if (!$r['clima_manha'] && !$r['clima_tarde']) throw new ErroApi('Marque o clima antes de fechar');
    $p = um('SELECT * FROM projetos WHERE id = ?', [$r['projeto_id']]);
    $m = rdo_montar($eid, $p, $r['data'], $r);
    $rt = $p['rt_funcionario_id'] ? um('SELECT nome FROM funcionarios WHERE id = ?', [$p['rt_funcionario_id']]) : null;
    $codigo = strtoupper(substr(bin2hex(random_bytes(4)), 0, 4) . '-' . substr(bin2hex(random_bytes(4)), 0, 4));
    $dados = ['conteudo' => $m, 'empresa' => rdo_empresa($eid), 'obra' => ['codigo' => $p['codigo'], 'nome' => $p['nome'], 'cliente' => $p['cliente'], 'contrato' => $p['numero_contrato'],
              'local' => $p['local_obra'], 'rt' => $rt['nome'] ?? null, 'art' => $p['art_numero']],
              'fechado_por' => $u['nome'] ?? (um('SELECT nome FROM usuarios WHERE id = ?', [$u['id']])['nome'] ?? ''), 'fechado_em' => rdo_local(agora())];
    q("UPDATE rdos SET situacao = 'Fechado', fechado_por = ?, fechado_em = UTC_TIMESTAMP(), dados = ?, codigo = ?, efetivo = ? WHERE id = ?",
      [$u['id'], json_encode($dados, JSON_UNESCAPED_UNICODE), $codigo, $m['total'], $id]);
    registrar($u, $eid, 'rdos', $id, 'alterou', ['situacao' => 'Rascunho'], ['situacao' => 'Fechado', 'codigo' => $codigo]);
    return ['ok' => true, 'codigo' => $codigo];
}
/** POST /api/rdos/{id}/reabrir */
function rota_rdo_reabrir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $r = rdo_ler($u, $id);
    if ($r['situacao'] !== 'Fechado') throw new ErroApi('Só dá para reabrir um RDO fechado que ainda não foi entregue', 409);
    q("UPDATE rdos SET situacao = 'Rascunho', fechado_por = NULL, fechado_em = NULL, dados = NULL, codigo = NULL WHERE id = ?", [$id]);
    registrar($u, (int)$u['empresa_id'], 'rdos', $id, 'alterou', ['situacao' => 'Fechado'], ['situacao' => 'Rascunho']);
    return ['ok' => true];
}
/** POST /api/rdos/{id}/entregue {data} */
function rota_rdo_entregue(int $id): array {
    $u = exigir_login(); $r = rdo_ler($u, $id);
    if ($r['situacao'] !== 'Fechado') throw new ErroApi('Feche o RDO antes de marcar como entregue', 409);
    $d = data_ok((string)(corpo()['data'] ?? rdo_hoje()), 'data') ?: rdo_hoje();
    if ($d > rdo_hoje() || $d < $r['data']) throw new ErroApi('Data de entrega inválida');
    q("UPDATE rdos SET situacao = 'Entregue', entregue_em = ? WHERE id = ?", [$d, $id]);
    registrar($u, (int)$u['empresa_id'], 'rdos', $id, 'alterou', ['situacao' => 'Fechado'], ['situacao' => 'Entregue', 'entregue_em' => $d]);
    return ['ok' => true];
}
/** POST /api/rdos/{id}/assinado {foto: {dados}, assinante, data} */
function rota_rdo_assinado(int $id): array {
    $u = exigir_login(); $r = rdo_ler($u, $id); $eid = (int)$u['empresa_id'];
    if (!in_array($r['situacao'], ['Fechado', 'Entregue'], true)) throw new ErroApi('Feche o RDO antes de anexar a folha assinada', 409);
    $d = corpo();
    $quem = trim((string)($d['assinante'] ?? '')); if ($quem === '') throw new ErroApi('Informe quem assinou pelo cliente');
    $dt = data_ok((string)($d['data'] ?? ''), 'data'); if (!$dt) throw new ErroApi('Informe a data escrita na folha');
    if ($dt > rdo_hoje() || $dt < $r['data']) throw new ErroApi('Data da assinatura inválida');
    if (empty($d['foto']['dados'])) throw new ErroApi('Tire a foto da folha assinada');
    $arq = eq_gravar_arquivo($eid, (string)$d['foto']['dados']);
    q("UPDATE rdos SET situacao = 'Assinado', entregue_em = COALESCE(entregue_em, ?), cliente_assinante = ?, assinado_cliente_em = ?, copia_assinada = ?, copia_enviada_por = ?, copia_enviada_em = UTC_TIMESTAMP() WHERE id = ?",
      [$dt, mb_substr($quem, 0, 160), $dt, $arq, $u['id'], $id]);
    registrar($u, $eid, 'rdos', $id, 'alterou', ['situacao' => $r['situacao']], ['situacao' => 'Assinado', 'assinante' => $quem]);
    return ['ok' => true];
}
/** GET /api/rdos/{id}/folha — foto/scan da folha assinada. */
function rota_rdo_folha(int $id): array {
    $u = exigir_login(); $r = rdo_ler($u, $id);
    if (!$r['copia_assinada'] || !is_file($arq = pasta_arquivos() . '/' . $r['copia_assinada'])) throw new ErroApi('Folha assinada não encontrada', 404);
    $ext = pathinfo($arq, PATHINFO_EXTENSION);
    header('Content-Type: ' . (['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($arq)); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline; filename="rdo-assinado.' . $ext . '"'); readfile($arq); exit;
}
/** DELETE /api/rdos/{id} — só rascunho (aberto por engano). */
function rota_rdo_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $r = rdo_ler($u, $id);
    if ($r['situacao'] !== 'Rascunho') throw new ErroApi('Só dá para excluir rascunho', 409);
    q('DELETE FROM rdo_presencas WHERE rdo_id = ?', [$id]); q('UPDATE fotos SET rdo_id = NULL WHERE rdo_id = ?', [$id]); q('DELETE FROM rdos WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'rdos', $id, 'excluiu', ['data' => $r['data']]);
    return ['ok' => true];
}

/* ══ Documento A4 (imprimir ou salvar em PDF pelo navegador) ══════════════════════ */
function rdo_e(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
/** GET /api/rdos/{id}/documento — página A4 com o cabeçalho da empresa; rascunho sai com marca d'água. */
function rota_rdo_documento(int $id): array {
    $u = exigir_login(); $r = rdo_ler($u, $id); $eid = (int)$u['empresa_id'];
    $p = um('SELECT * FROM projetos WHERE id = ?', [$r['projeto_id']]);
    if ($r['situacao'] !== 'Rascunho' && $r['dados']) $D = json_decode($r['dados'], true);
    else { $rt = $p['rt_funcionario_id'] ? um('SELECT nome FROM funcionarios WHERE id = ?', [$p['rt_funcionario_id']]) : null;
        $D = ['conteudo' => rdo_montar($eid, $p, $r['data'], $r), 'empresa' => rdo_empresa($eid), 'obra' => ['codigo' => $p['codigo'], 'nome' => $p['nome'], 'cliente' => $p['cliente'],
              'contrato' => $p['numero_contrato'], 'local' => $p['local_obra'], 'rt' => $rt['nome'] ?? null, 'art' => $p['art_numero']], 'fechado_por' => null, 'fechado_em' => null]; }
    $C = $D['conteudo']; $E = $D['empresa']; $O = $D['obra']; $cor = preg_match('/^#[0-9a-f]{6}$/i', (string)$E['cor']) ? $E['cor'] : '#0f3d6e';
    $enc = ''; foreach ($C['presencas'] as $x) if ($x['presente'] && stripos((string)$x['cargo'], 'encarregad') !== false) { $enc = $x['nome']; break; }
    $linhasMO = ''; foreach ($C['presencas'] as $x) $linhasMO .= '<tr><td>' . rdo_e($x['cargo'] ?: '—') . '</td><td>' . rdo_e($x['nome']) . '</td><td>' . ($x['presente'] ? 'Presente' : ($x['ausencia'] ? rdo_e($x['ausencia']) : 'Faltou')) . '</td></tr>';
    if ($r['terceiros']) $linhasMO .= '<tr><td>Terceiros</td><td>' . rdo_e($r['terceiros_desc'] ?: '—') . '</td><td>' . (int)$r['terceiros'] . ' pessoa' . ((int)$r['terceiros'] > 1 ? 's' : '') . '</td></tr>';
    $serv = ''; foreach ($C['servicos'] as $s) $serv .= '<tr><td>' . rdo_e(trim(($s['eap'] ? $s['eap'] . ' · ' : '') . $s['descricao'])) . ($s['comentarios'] ? '<div class="obs">' . rdo_e(implode(' · ', $s['comentarios'])) . '</div>' : '') . '</td><td class="n">' . (int)$s['de'] . '% → ' . (int)$s['para'] . '%</td><td>' . rdo_e($s['por']) . '</td></tr>';
    $oc = ''; foreach ($C['ocorrencias'] as $o) $oc .= '<li><b>' . rdo_e($o['tipo']) . '</b>' . ($o['atividade'] ? ' · ' . rdo_e($o['atividade']) : '') . ': ' . rdo_e($o['descricao']) . ' (' . rdo_e($o['por']) . ', ' . $o['hora'] . ($o['liberada'] ? '; liberada ' . ($o['liberada_dia'] !== $r['data'] ? rdo_br($o['liberada_dia']) . ' ' : '') . $o['liberada'] : '') . ')</li>';
    $eq = implode(' · ', array_map(fn($x) => rdo_e(($x['codigo'] ? $x['codigo'] . ' ' : '') . $x['nome']), $C['equipamentos']));
    $fotos = array_values(array_filter($C['fotos'], fn($f) => $f['no_rdo']));
    $fh = ''; foreach (array_slice($fotos, 0, 12) as $f) $fh .= '<figure><img src="../../fotos/' . (int)$f['id'] . '" alt=""><figcaption>' . rdo_e($f['hora'] . ($f['legenda'] ? ' · ' . $f['legenda'] : '')) . '</figcaption></figure>';
    $rasc = $r['situacao'] === 'Rascunho';
    $titulo = 'RDO nº ' . (int)$r['numero'] . ' · ' . ($O['codigo'] ?: $O['nome']) . ' · ' . rdo_br($r['data']);
    $logo = $E['logo'] ? '<img class="logo" src="' . rdo_e($E['logo']) . '" alt="' . rdo_e($E['nome']) . '">' : '<div class="logo-txt">' . rdo_e($E['nome']) . '</div>';
    $dadosEmp = '<b>' . rdo_e($E['razao_social'] ?: $E['nome']) . '</b><br>' . implode(' · ', array_filter([$E['cnpj'] ? 'CNPJ ' . rdo_e($E['cnpj']) : null, $E['cidade'] ? rdo_e($E['cidade'] . ($E['uf'] ? '/' . $E['uf'] : '')) : null])) . ($E['telefone'] ? '<br>' . rdo_e($E['telefone']) : '');
    $html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>' . rdo_e($titulo) . '</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@page{size:A4;margin:14mm 14mm 16mm;@bottom-right{content:"Página " counter(page) " de " counter(pages);font:9px Arial;color:#555}}
*{box-sizing:border-box}body{margin:0;background:#e5e7eb;font:11.5px/1.4 Arial,Helvetica,sans-serif;color:#111}
.barra{position:sticky;top:0;display:flex;gap:10px;align-items:center;justify-content:center;padding:10px;background:#0f172a;color:#fff;font:600 14px Arial;z-index:2}
.barra button{height:38px;padding:0 16px;border:0;border-radius:8px;background:#2563eb;color:#fff;font:700 14px Arial;cursor:pointer}.barra span{opacity:.8;font-weight:400}
.folha{width:210mm;min-height:297mm;margin:16px auto;background:#fff;padding:14mm;position:relative;box-shadow:0 6px 24px rgba(0,0,0,.15)}
.cab{display:grid;grid-template-columns:44mm 1fr auto;gap:5mm;align-items:center;border-bottom:2px solid ' . $cor . ';padding-bottom:3mm;margin-bottom:4mm}
.logo{max-width:44mm;max-height:18mm;object-fit:contain;display:block}.logo-txt{font:700 17px Arial;color:' . $cor . '}
.emp{font-size:10px;line-height:1.45;color:#333;border-left:1px solid #cbd5e1;padding-left:4mm}.emp b{font-size:11.5px;color:#111}
.tit{text-align:right}.tit b{display:block;font-size:15px;color:' . $cor . '}.tit small{display:block;font-size:10.5px}
h2{font-size:11px;letter-spacing:.06em;color:' . $cor . ';margin:4mm 0 1.5mm;text-transform:uppercase}
table{width:100%;border-collapse:collapse}td,th{border:1px solid #94a3b8;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f7;font-weight:700}
td.n{white-space:nowrap}.k td:first-child{width:38mm;background:#f8fafc;font-weight:700}.obs{font-size:10px;color:#555;margin-top:2px}
.caixa{border:1px solid #94a3b8;padding:5px 7px;min-height:9mm;white-space:pre-wrap}ul{margin:0;padding-left:16px}li{margin:2px 0}
.fotos{display:grid;grid-template-columns:repeat(4,1fr);gap:2mm}figure{margin:0;break-inside:avoid}figure img{width:100%;height:32mm;object-fit:cover;border:1px solid #94a3b8;display:block}figcaption{font-size:9px;color:#555}
.ass{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:16mm;break-inside:avoid}.ass div{border-top:1px solid #111;padding-top:2mm;text-align:center;font-size:10.5px}
.rod{margin-top:5mm;font-size:9px;color:#555;text-align:center}
.marca{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font:700 64px Arial;color:rgba(220,38,38,.10);transform:rotate(-30deg)}
@media print{body{background:#fff}.barra{display:none}.folha{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}}
@media (max-width:820px){.folha{width:auto;margin:8px;padding:5mm}.cab{grid-template-columns:1fr;text-align:left}.tit{text-align:left}.fotos{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<div class="barra"><button onclick="window.print()">Imprimir / Salvar em PDF</button><span>' . ($rasc ? 'Rascunho: feche o RDO para gerar a versão de entrega' : 'Para PDF: em "Destino" escolha "Salvar como PDF"') . '</span></div>
<div class="folha">' . ($rasc ? '<div class="marca">RASCUNHO</div>' : '') . '
<div class="cab"><div>' . $logo . '</div><div class="emp">' . $dadosEmp . '</div><div class="tit"><b>RELATÓRIO DIÁRIO DE OBRA</b><small>Nº ' . (int)$r['numero'] . ' · ' . rdo_br($r['data']) . ' · ' . rdo_semana($r['data']) . '</small></div></div>
<table class="k"><tr><td>Obra</td><td>' . rdo_e(trim(($O['codigo'] ? $O['codigo'] . ' · ' : '') . $O['nome'])) . ($O['local'] ? ' · ' . rdo_e($O['local']) : '') . '</td></tr>
<tr><td>Cliente</td><td>' . rdo_e($O['cliente'] ?: '—') . ($O['contrato'] ? ' · Contrato ' . rdo_e($O['contrato']) : '') . '</td></tr>
' . ($O['rt'] ? '<tr><td>Responsável técnico</td><td>' . rdo_e($O['rt']) . ($O['art'] ? ' · ART ' . rdo_e($O['art']) : '') . '</td></tr>' : '') . '
<tr><td>Clima</td><td>Manhã: ' . rdo_e($r['clima_manha'] ?: '—') . ' · Tarde: ' . rdo_e($r['clima_tarde'] ?: '—') . '</td></tr></table>
<h2>Mão de obra (' . (int)$C['presentes'] + (int)$r['terceiros'] . ')</h2>' . ($linhasMO ? '<table><tr><th>Função</th><th>Nome</th><th>Situação</th></tr>' . $linhasMO . '</table>' : '<div class="caixa">Sem registro.</div>') . '
<h2>Serviços executados</h2>' . ($serv ? '<table><tr><th>Atividade</th><th>Avanço</th><th>Responsável</th></tr>' . $serv . '</table>' : '<div class="caixa">Nenhum avanço lançado no dia.</div>') . '
<h2>Ocorrências</h2>' . ($oc ? '<div class="caixa"><ul>' . $oc . '</ul></div>' : '<div class="caixa">Nenhuma.</div>') . '
<h2>Equipamentos</h2><div class="caixa">' . ($eq ?: 'Nenhum reservado para o dia.') . '</div>
<h2>Observações</h2><div class="caixa">' . rdo_e($r['resumo'] ?: '—') . '</div>
' . ($fh ? '<h2>Fotos (' . count($fotos) . ')</h2><div class="fotos">' . $fh . '</div>' : '') . '
<div class="ass"><div>' . rdo_e($E['nome']) . ($enc ? ' · ' . rdo_e($enc) : '') . '</div><div>Cliente · nome, data e assinatura</div></div>
<div class="rod">' . ($rasc ? 'Rascunho gerado em ' . rdo_br(rdo_hoje()) : 'Fechado em ' . rdo_e(rdo_br(substr((string)$D['fechado_em'], 0, 10)) . ' ' . substr((string)$D['fechado_em'], 11, 5)) . ' por ' . rdo_e($D['fechado_por']) . ' · código de conferência ' . rdo_e($r['codigo'])) . ' · Aprumo</div>
</div>' . (!empty($_GET['imprimir']) ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),400))</script>' : '') . '</body></html>';
    header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    echo $html; exit;
}

/* ══ Logo da empresa ═══════════════════════════════════════════════════════════ */
/** Recebe PNG/JPG/WEBP, reduz para caber em 600×200, grava como PNG (mantém transparência) e acha a cor principal. */
function logo_gravar(int $eid, string $dados): array {
    $bin = base64_decode(preg_replace('#^data:image/[a-z+]+;base64,#i', '', $dados), true);
    if ($bin === false || $bin === '') throw new ErroApi('Logo inválida');
    if (strlen($bin) > 5 * 1024 * 1024) throw new ErroApi('Logo grande demais (até 5 MB)');
    $info = @getimagesizefromstring($bin);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) throw new ErroApi('Envie a logo em PNG, JPG ou WEBP');
    if (!function_exists('imagecreatefromstring')) { $png = $bin; $cor = null; }
    else {
        $im = @imagecreatefromstring($bin); if (!$im) throw new ErroApi('Não consegui abrir a imagem da logo');
        $w = imagesx($im); $h = imagesy($im); $k = min(1, 600 / $w, 200 / $h);
        $nw = max(1, (int)round($w * $k)); $nh = max(1, (int)round($h * $k));
        $out = imagecreatetruecolor($nw, $nh); imagealphablending($out, false); imagesavealpha($out, true);
        imagefill($out, 0, 0, imagecolorallocatealpha($out, 255, 255, 255, 127));
        imagecopyresampled($out, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
        // cor principal: a cor viva que mais aparece (grupos de cor), escurecida se for clara demais para ler no papel
        $grupos = [];
        for ($x = 0; $x < $nw; $x += max(1, intdiv($nw, 80))) for ($y = 0; $y < $nh; $y += max(1, intdiv($nh, 40))) {
            $c = imagecolorsforindex($out, imagecolorat($out, $x, $y)); if ($c['alpha'] > 80) continue;
            $mx = max($c['red'], $c['green'], $c['blue']); $mn = min($c['red'], $c['green'], $c['blue']);
            if ($mx - $mn < 40 || $mx < 40) continue;                                   // cinza, branco ou preto não contam
            $k = intdiv($c['red'], 40) . '-' . intdiv($c['green'], 40) . '-' . intdiv($c['blue'], 40);
            $grupos[$k] ??= [0, 0, 0, 0]; $grupos[$k][0]++; $grupos[$k][1] += $c['red']; $grupos[$k][2] += $c['green']; $grupos[$k][3] += $c['blue'];
        }
        $cor = null;
        if ($grupos) {
            usort($grupos, fn($a, $b) => $b[0] <=> $a[0]); [$n, $rr, $gg, $bb] = $grupos[0];
            [$rr, $gg, $bb] = [intdiv($rr, $n), intdiv($gg, $n), intdiv($bb, $n)];
            $lum = 0.299 * $rr + 0.587 * $gg + 0.114 * $bb; if ($lum > 140) { $f = 140 / $lum; [$rr, $gg, $bb] = [(int)($rr * $f), (int)($gg * $f), (int)($bb * $f)]; }
            $cor = sprintf('#%02x%02x%02x', $rr, $gg, $bb);
        } else $cor = '#1f2937';                                                          // logo preta/cinza: cabeçalho grafite
        ob_start(); imagepng($out, null, 9); $png = (string)ob_get_clean();
    }
    $rel = "$eid/empresa/logo-" . bin2hex(random_bytes(8)) . '.png';
    $dir = pasta_arquivos() . '/' . dirname($rel);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) throw new ErroApi('Não foi possível guardar a logo no servidor', 500);
    file_put_contents(pasta_arquivos() . '/' . $rel, $png);
    return [$rel, $cor];
}
/** GET|POST|DELETE /api/empresa/logo */
function rota_empresa_logo(): array {
    $u = exigir_login(); $eid = (int)$u['empresa_id']; $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $e = um('SELECT logo, logo_cor FROM empresas WHERE id = ?', [$eid]);
    if ($m === 'GET') {
        if (!$e['logo'] || !is_file($arq = pasta_arquivos() . '/' . $e['logo'])) throw new ErroApi('Sem logo', 404);
        header('Content-Type: image/png'); header('Content-Length: ' . filesize($arq)); header('Cache-Control: private, max-age=300'); header('X-Content-Type-Options: nosniff'); readfile($arq); exit;
    }
    exigir_perfil($u, ['administrador']);
    if ($m === 'DELETE') { q('UPDATE empresas SET logo = NULL, logo_cor = NULL WHERE id = ?', [$eid]); registrar($u, $eid, 'empresas', $eid, 'alterou', null, ['logo' => 'removida']); return ['ok' => true]; }
    [$rel, $cor] = logo_gravar($eid, (string)(corpo()['dados'] ?? ''));
    q('UPDATE empresas SET logo = ?, logo_cor = ? WHERE id = ?', [$rel, $cor, $eid]);
    registrar($u, $eid, 'empresas', $eid, 'alterou', null, ['logo' => 'trocada']);
    return ['ok' => true, 'cor' => $cor];
}
/** GET /api/empresa/cabecalho — dados que saem no cabeçalho dos documentos. */
function rota_empresa_cabecalho(): array {
    $u = exigir_login(); exigir_perfil($u, RDO_CAMPO);
    $e = rdo_empresa((int)$u['empresa_id']); $tem = (bool)$e['logo']; unset($e['logo']);
    return $e + ['tem_logo' => $tem, 'pode_logo' => $u['perfil'] === 'administrador'];
}
