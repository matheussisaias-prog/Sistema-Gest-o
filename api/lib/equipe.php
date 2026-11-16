<?php
/* Aprumo · servidor · Equipe: pessoas, situação (férias/afastamento), documentos de NR exigidos (cargo + obra + atividade),
   certificados, carga dos próximos 14 dias e aviso ao alocar. Vencimentos aparecem só no painel (sem e-mail). */
declare(strict_types=1);

const DOC_MAX_BYTES = 10 * 1024 * 1024;

function eq_hoje(): string { return gmdate('Y-m-d', time() - 3 * 3600); }
function eq_norm(?string $s): string { return trim(preg_replace('/\s+/', ' ', ass_norm((string)$s))); }

/** Pessoas que o usuário pode ver na Equipe. */
function eq_pessoas(array $u, ?array $so = null): array {
    $eid = (int)$u['empresa_id'];
    if ($u['perfil'] === 'funcionario') throw new ErroApi('A Equipe é da gestão', 403);
    $sql = 'SELECT f.*, e.nome AS encarregado_nome FROM funcionarios f LEFT JOIN funcionarios e ON e.id = f.encarregado_id
            WHERE f.empresa_id = ? AND f.excluido_em IS NULL';
    $p = [$eid];
    if ($u['perfil'] === 'encarregado') {
        $fid = (int)$u['funcionario_id'];
        $sql .= ' AND (f.id = ? OR f.encarregado_id = ?)'; $p[] = $fid; $p[] = $fid;
    }
    if ($so !== null) $sql .= $so ? ' AND f.id IN (' . implode(',', array_map('intval', $so)) . ')' : ' AND 0';
    return todos($sql . ' ORDER BY f.ativo DESC, f.nome', $p);
}
function eq_pessoa(array $u, int $id): array {
    $L = eq_pessoas($u, [$id]);
    if (!$L) throw new ErroApi('Pessoa não encontrada', 404);
    return $L[0];
}

/** Exigências por pessoa: [fid => [tipo_id => ['por' => texto, 'ate' => data em que precisa valer]]]. */
function eq_exigencias(int $eid, array $pessoas, string $hoje): array {
    $out = []; if (!$pessoas) return $out;
    $exig = todos('SELECT x.tipo_documento_id, x.cargo, x.projeto_id, x.atividade_id FROM exigencias_documento x JOIN tipos_documento t ON t.id = x.tipo_documento_id AND t.ativo = 1 WHERE x.empresa_id = ?', [$eid]);
    $porCargo = []; $porObra = []; $porAtiv = [];
    foreach ($exig as $x) {
        if ($x['cargo'] !== null) $porCargo[eq_norm($x['cargo'])][] = (int)$x['tipo_documento_id'];
        if ($x['projeto_id']) $porObra[(int)$x['projeto_id']][] = (int)$x['tipo_documento_id'];
        if ($x['atividade_id']) $porAtiv[(int)$x['atividade_id']][] = (int)$x['tipo_documento_id'];
    }
    $ids = implode(',', array_map(fn($p) => (int)$p['id'], $pessoas));
    $ativ = todos("SELECT a.id, a.responsavel_id, a.projeto_id, a.descricao, a.inicio, a.fim, p.codigo FROM atividades a JOIN projetos p ON p.id = a.projeto_id AND p.excluido_em IS NULL
                   WHERE a.empresa_id = ? AND a.excluido_em IS NULL AND a.responsavel_id IN ($ids) AND a.situacao <> 'Concluído' AND a.avanco < 100 AND (a.fim IS NULL OR a.fim >= ?)", [$eid, $hoje]);
    foreach ($pessoas as $p) {
        $fid = (int)$p['id']; $out[$fid] = [];
        foreach ($porCargo[eq_norm($p['cargo'])] ?? [] as $t) $out[$fid][$t] = ['por' => 'Cargo: ' . $p['cargo'], 'ate' => $hoje, 'origem' => 'cargo'];
    }
    foreach ($ativ as $a) {
        $fid = (int)$a['responsavel_id'];
        foreach ($porObra[(int)$a['projeto_id']] ?? [] as $t) if (!isset($out[$fid][$t])) $out[$fid][$t] = ['por' => 'Obra: ' . ($a['codigo'] ?: 'obra'), 'ate' => max($hoje, (string)$a['inicio']), 'origem' => 'obra'];
        foreach ($porAtiv[(int)$a['id']] ?? [] as $t) {
            $por = 'Atividade: ' . $a['descricao'] . ' (' . ($a['codigo'] ? $a['codigo'] . ', ' : '') . substr((string)$a['inicio'], 8, 2) . '/' . substr((string)$a['inicio'], 5, 2) . ')';
            if (!isset($out[$fid][$t]) || $out[$fid][$t]['origem'] !== 'cargo') $out[$fid][$t] = ['por' => $por, 'ate' => max($hoje, (string)($a['fim'] ?: $a['inicio'])), 'origem' => 'atividade'];
        }
    }
    return $out;
}
/** Último documento de cada tipo por pessoa (com vencimento calculado e invalidação por afastamento). */
function eq_documentos(int $eid, array $fids): array {
    $out = []; if (!$fids) return $out;
    foreach (todos('SELECT v.*, d.arquivo, d.instituicao, d.apto, d.restrito, d.validade, t.categoria, t.aviso_dias, t.prazo_origem
                    FROM v_documentos_situacao v JOIN documentos_funcionario d ON d.id = v.id JOIN tipos_documento t ON t.id = v.tipo_documento_id
                    WHERE v.empresa_id = ? AND v.funcionario_id IN (' . implode(',', array_map('intval', $fids)) . ') ORDER BY v.emissao, v.id', [$eid]) as $d)
        $out[(int)$d['funcionario_id']][(int)$d['tipo_documento_id']] = $d;   // fica o mais recente
    return $out;
}
/** Situação de um documento em relação a uma data em que precisa valer. */
function eq_situacao(?array $doc, string $hoje, string $ate = ''): array {
    if (!$doc) return ['falta', 'Falta'];
    if ((int)$doc['invalidado_por_afastamento']) return ['vencido', 'Invalidado por afastamento'];
    if ($doc['categoria'] === 'exame' && $doc['apto'] !== null && !(int)$doc['apto']) return ['vencido', 'Inapto'];
    $v = $doc['vence_em'];
    if (!$v) return ['ok', 'Em dia'];
    if ($v < $hoje) return ['vencido', 'Vencido'];
    if ($ate && $v < $ate) return ['vence_antes', 'Vence antes da atividade'];
    $dias = (int)round((strtotime($v . ' UTC') - strtotime($hoje . ' UTC')) / 86400);
    if ($dias <= (int)($doc['aviso_dias'] ?? 30)) return ['vencendo', $dias === 0 ? 'Vence hoje' : "Vence em $dias dia" . ($dias > 1 ? 's' : '')];
    return ['ok', 'Em dia'];
}
/** Carga dos próximos 14 dias (100% = um dia de trabalho por dia útil disponível). */
function eq_cargas(int $eid, array $fids, string $hoje): array {
    $out = array_fill_keys($fids, ['carga' => 0, 'obras' => [], 'ausente_dias' => 0]); if (!$fids) return $out;
    $cal = calendario_padrao(); $fim = Calendario::mais($hoje, 13);
    $uteis = []; for ($d = $hoje; $d <= $fim; $d = Calendario::mais($d, 1)) if ($cal->util($d)) $uteis[] = $d;
    $in = implode(',', array_map('intval', $fids));
    $aus = []; foreach (todos("SELECT funcionario_id, inicio, fim FROM ausencias WHERE empresa_id = ? AND excluido_em IS NULL AND funcionario_id IN ($in) AND fim >= ? AND inicio <= ?", [$eid, $hoje, $fim]) as $a) $aus[(int)$a['funcionario_id']][] = $a;
    $ocup = [];
    foreach (todos("SELECT a.responsavel_id, a.inicio, a.fim, p.codigo FROM atividades a JOIN projetos p ON p.id = a.projeto_id AND p.excluido_em IS NULL AND p.situacao NOT IN ('Arquivado','Concluído')
                    WHERE a.empresa_id = ? AND a.excluido_em IS NULL AND a.responsavel_id IN ($in) AND a.situacao <> 'Concluído' AND a.avanco < 100
                      AND a.inicio IS NOT NULL AND a.inicio <= ? AND COALESCE(a.fim, a.inicio) >= ?
                      AND NOT EXISTS (SELECT 1 FROM atividades x WHERE x.pai_id = a.id AND x.excluido_em IS NULL)", [$eid, $fim, $hoje]) as $a) {
        $f = (int)$a['responsavel_id'];
        foreach ($uteis as $d) if ($d >= $a['inicio'] && $d <= ($a['fim'] ?: $a['inicio'])) $ocup[$f][$d] = ($ocup[$f][$d] ?? 0) + 1;
        if ($a['codigo']) $out[$f]['obras'][$a['codigo']] = true;
    }
    foreach ($fids as $f) {
        $disp = 0; $aDias = 0;
        foreach ($uteis as $d) { $fora = false; foreach ($aus[$f] ?? [] as $a) if ($d >= $a['inicio'] && $d <= $a['fim']) { $fora = true; break; } if ($fora) $aDias++; else $disp++; }
        $usado = array_sum($ocup[$f] ?? []);
        $out[$f] = ['carga' => $disp ? (int)round($usado / $disp * 100) : ($usado ? 999 : 0), 'obras' => array_keys($out[$f]['obras']), 'ausente_dias' => $aDias];
    }
    return $out;
}
function eq_ausencia_hoje(int $eid, array $fids, string $hoje): array {
    $out = []; if (!$fids) return $out;
    foreach (todos('SELECT funcionario_id, inicio, fim, tipo FROM ausencias WHERE empresa_id = ? AND excluido_em IS NULL AND funcionario_id IN (' . implode(',', array_map('intval', $fids)) . ') AND inicio <= ? AND fim >= ?', [$eid, $hoje, $hoje]) as $a)
        $out[(int)$a['funcionario_id']] = $a;
    return $out;
}
function eq_texto_ausencia(array $a): string {
    $ate = substr($a['fim'], 8, 2) . '/' . substr($a['fim'], 5, 2);
    if ($a['tipo'] === 'Férias') return "Férias até $ate";
    if (str_starts_with($a['tipo'], 'Afastamento')) return "Afastado até $ate";
    return $a['tipo'] . " até $ate";
}
/** Resumo de documentos de uma pessoa. */
function eq_resumo_docs(array $exig, array $docs, string $hoje, array $nomes): array {
    $pior = ['vencido' => [], 'falta' => [], 'vence_antes' => [], 'vencendo' => []];
    foreach ($exig as $t => $x) {
        [$s] = eq_situacao($docs[$t] ?? null, $hoje, $x['ate']);
        if (isset($pior[$s])) $pior[$s][] = ['tipo' => $t, 'nome' => $nomes[$t] ?? 'documento', 'vence' => $docs[$t]['vence_em'] ?? null];
    }
    if ($pior['vencido']) return ['nivel' => 'vencido', 'texto' => (count($pior['vencido']) > 1 ? count($pior['vencido']) . ' vencidos' : eq_curto($pior['vencido'][0]['nome']) . ' vencido'), 'itens' => $pior];
    if ($pior['falta']) return ['nivel' => 'vencido', 'texto' => 'Falta ' . eq_curto($pior['falta'][0]['nome']) . (count($pior['falta']) > 1 ? ' e mais ' . (count($pior['falta']) - 1) : ''), 'itens' => $pior];
    if ($pior['vence_antes'] || $pior['vencendo']) {
        $x = $pior['vencendo'][0] ?? $pior['vence_antes'][0];
        $dias = $x['vence'] ? (int)round((strtotime($x['vence'] . ' UTC') - strtotime($hoje . ' UTC')) / 86400) : 0;
        return ['nivel' => 'vencendo', 'texto' => eq_curto($x['nome']) . ' vence em ' . $dias . ' dia' . ($dias === 1 ? '' : 's'), 'itens' => $pior];
    }
    return ['nivel' => 'ok', 'texto' => $exig ? 'Documentos em dia' : 'Sem documentos exigidos', 'itens' => $pior];
}
function eq_curto(string $nome): string {
    if (str_contains($nome, 'ASO')) return 'ASO';
    if (preg_match('/^NR-\d+/', $nome, $m) && mb_strlen($nome) > 14) return $m[0];
    return mb_strlen($nome) > 26 ? mb_substr($nome, 0, 24) . '…' : $nome;
}
function eq_nomes_tipos(int $eid): array {
    $o = []; foreach (todos('SELECT id, nr, nome FROM tipos_documento WHERE empresa_id = ?', [$eid]) as $t) $o[(int)$t['id']] = (str_starts_with($t['nome'], (string)$t['nr']) || !$t['nr'] ? '' : $t['nr'] . ' ') . $t['nome'];
    return $o;
}

/** GET /api/equipe */
function rota_equipe(): array {
    $u = exigir_login(); $eid = (int)$u['empresa_id']; $hoje = eq_hoje();
    $P = eq_pessoas($u);
    $fids = array_map(fn($p) => (int)$p['id'], $P);
    $exig = eq_exigencias($eid, $P, $hoje); $docs = eq_documentos($eid, $fids); $cargas = eq_cargas($eid, $fids, $hoje); $aus = eq_ausencia_hoje($eid, $fids, $hoje);
    $nomes = eq_nomes_tipos($eid);
    $usuarios = []; foreach (todos('SELECT funcionario_id, perfil FROM usuarios WHERE empresa_id = ? AND excluido_em IS NULL AND desativado_em IS NULL AND funcionario_id IS NOT NULL', [$eid]) as $x) $usuarios[(int)$x['funcionario_id']] = $x['perfil'];
    $pode = in_array($u['perfil'], PODE_TUDO, true);
    $pessoas = array_map(function ($p) use ($exig, $docs, $cargas, $aus, $nomes, $hoje, $usuarios, $pode) {
        $f = (int)$p['id']; $r = eq_resumo_docs($exig[$f] ?? [], $docs[$f] ?? [], $hoje, $nomes);
        return ['id' => $f, 'nome' => $p['nome'], 'apelido' => $p['apelido'], 'cargo' => $p['cargo'], 'tipo_trabalho' => $p['tipo_trabalho'], 'ativo' => (bool)$p['ativo'],
            'encarregado_id' => $p['encarregado_id'] ? (int)$p['encarregado_id'] : null, 'encarregado_nome' => $p['encarregado_nome'], 'telefone' => $p['telefone'], 'email' => $p['email'],
            'situacao' => isset($aus[$f]) ? ['tipo' => str_starts_with($aus[$f]['tipo'], 'Afastamento') ? 'afastado' : ($aus[$f]['tipo'] === 'Férias' ? 'ferias' : 'ausente'), 'texto' => eq_texto_ausencia($aus[$f])] : ['tipo' => 'trabalhando', 'texto' => 'Trabalhando'],
            'documentos' => ['nivel' => $r['nivel'], 'texto' => $r['texto'], 'vencidos' => count($r['itens']['vencido']) + count($r['itens']['falta']), 'vencendo' => count($r['itens']['vencendo']) + count($r['itens']['vence_antes'])],
            'carga' => $cargas[$f]['carga'], 'obras' => $cargas[$f]['obras'], 'acesso' => $usuarios[$f] ?? null] + ($pode ? ['custo_hora' => $p['custo_hora'] !== null ? (float)$p['custo_hora'] : null] : []);
    }, $P);
    $cargos = array_values(array_unique(array_filter(array_merge(array_column($P, 'cargo'), array_column(todos('SELECT DISTINCT cargo FROM exigencias_documento WHERE empresa_id = ? AND cargo IS NOT NULL', [$eid]), 'cargo')))));
    sort($cargos);
    return ['hoje' => $hoje, 'pode_editar' => $pode, 'perfil' => $u['perfil'], 'pessoas' => $pessoas, 'cargos' => $cargos,
            'encarregados' => array_values(array_map(fn($p) => ['id' => (int)$p['id'], 'nome' => $p['nome']], array_filter($P, fn($p) => $p['ativo'] && preg_match('/encarreg|supervis|lider|líder/i', (string)$p['cargo']))))];
}

/** GET /api/equipe/{id} — a ficha completa. */
function rota_equipe_ficha(int $id): array {
    $u = exigir_login(); $eid = (int)$u['empresa_id']; $hoje = eq_hoje();
    $p = eq_pessoa($u, $id);
    $exig = eq_exigencias($eid, [$p], $hoje)[$id] ?? []; $docs = eq_documentos($eid, [$id])[$id] ?? [];
    $tipos = []; foreach (todos('SELECT id, nr, nome, categoria, prazo_origem, prazo_valor, prazo_unidade FROM tipos_documento WHERE empresa_id = ?', [$eid]) as $t) $tipos[(int)$t['id']] = $t;
    $nomes = eq_nomes_tipos($eid);
    $admin = $u['perfil'] === 'administrador';
    $linha = function (int $t, ?array $d, ?array $x) use ($tipos, $nomes, $hoje, $admin) {
        [$s, $txt] = eq_situacao($d, $hoje, $x['ate'] ?? '');
        return ['tipo_id' => $t, 'nome' => $nomes[$t] ?? '', 'nr' => $tipos[$t]['nr'] ?? null, 'categoria' => $tipos[$t]['categoria'] ?? null, 'exigido_por' => $x['por'] ?? null,
            'documento_id' => $d ? (int)$d['id'] : null, 'emissao' => $d['emissao'] ?? null, 'vence' => $d['vence_em'] ?? null, 'situacao' => $s, 'situacao_texto' => $txt,
            'prazo' => eq_prazo_txt($tipos[$t] ?? []), 'arquivo' => $d && $d['arquivo'] ? (!(int)$d['restrito'] || $admin ? 'ver' : 'restrito') : null, 'instituicao' => $d['instituicao'] ?? null];
    };
    $L = [];
    foreach ($exig as $t => $x) $L[] = $linha($t, $docs[$t] ?? null, $x);
    $ordem = ['vencido' => 0, 'falta' => 1, 'vence_antes' => 2, 'vencendo' => 3, 'ok' => 4];
    usort($L, fn($a, $b) => ($ordem[$a['situacao']] <=> $ordem[$b['situacao']]) ?: strcmp($a['nome'], $b['nome']));
    $outros = []; foreach ($docs as $t => $d) if (!isset($exig[$t])) $outros[] = $linha($t, $d, null);
    $aus = todos('SELECT id, inicio, fim, tipo, detalhe FROM ausencias WHERE funcionario_id = ? AND empresa_id = ? AND excluido_em IS NULL ORDER BY inicio DESC', [$id, $eid]);   // todas: salvar substitui a lista inteira
    $agenda = todos("SELECT a.id, a.projeto_id, a.descricao, a.inicio, a.fim, a.avanco, a.situacao, p.codigo, p.nome AS obra FROM atividades a JOIN projetos p ON p.id = a.projeto_id AND p.excluido_em IS NULL
                     WHERE a.empresa_id = ? AND a.responsavel_id = ? AND a.excluido_em IS NULL AND a.inicio IS NOT NULL AND COALESCE(a.fim, a.inicio) >= ? AND a.inicio <= ?
                       AND NOT EXISTS (SELECT 1 FROM atividades x WHERE x.pai_id = a.id AND x.excluido_em IS NULL) ORDER BY a.inicio", [$eid, $id, Calendario::mais($hoje, -7), Calendario::mais($hoje, 56)]);
    $fotos = todos('SELECT f.id, f.tirada_em, a.descricao AS atividade, p.codigo FROM fotos f LEFT JOIN atividades a ON a.id = f.atividade_id JOIN projetos p ON p.id = f.projeto_id
                    WHERE f.empresa_id = ? AND f.funcionario_id = ? AND f.excluido_em IS NULL ORDER BY f.tirada_em DESC LIMIT 12', [$eid, $id]);
    $avancos = todos('SELECT v.criado_em, v.de_avanco, v.para_avanco, v.comentario, a.descricao AS atividade, p.codigo FROM avancos v JOIN atividades a ON a.id = v.atividade_id JOIN projetos p ON p.id = a.projeto_id
                      JOIN usuarios us ON us.id = v.usuario_id WHERE v.empresa_id = ? AND us.funcionario_id = ? ORDER BY v.criado_em DESC LIMIT 12', [$eid, $id]);
    $carga = eq_cargas($eid, [$id], $hoje)[$id];
    $acc = um('SELECT perfil, email FROM usuarios WHERE funcionario_id = ? AND empresa_id = ? AND excluido_em IS NULL AND desativado_em IS NULL', [$id, $eid]);
    $pode = in_array($u['perfil'], PODE_TUDO, true);
    $resumo = eq_resumo_docs($exig, $docs, $hoje, $nomes);
    $ah = eq_ausencia_hoje($eid, [$id], $hoje)[$id] ?? null;
    return ['hoje' => $hoje, 'pode_editar' => $pode, 'pode_documentos' => $pode || $u['perfil'] === 'encarregado',
        'pessoa' => ['id' => $id, 'nome' => $p['nome'], 'apelido' => $p['apelido'], 'cargo' => $p['cargo'], 'tipo_trabalho' => $p['tipo_trabalho'], 'ativo' => (bool)$p['ativo'], 'equipe' => $p['equipe'],
                     'encarregado_id' => $p['encarregado_id'] ? (int)$p['encarregado_id'] : null, 'encarregado_nome' => $p['encarregado_nome'], 'telefone' => $p['telefone'], 'email' => $p['email'],
                     'acesso' => $acc ? $acc['perfil'] : null] + ($pode ? ['custo_hora' => $p['custo_hora'] !== null ? (float)$p['custo_hora'] : null] : []),
        'situacao' => $ah ? eq_texto_ausencia($ah) : 'Trabalhando', 'documentos_resumo' => ['nivel' => $resumo['nivel'], 'texto' => $resumo['texto']],
        'carga' => $carga['carga'], 'obras' => $carga['obras'],
        'documentos' => $L, 'outros_documentos' => $outros, 'ausencias' => $aus, 'agenda' => $agenda,
        'fotos' => array_map(fn($f) => ['id' => (int)$f['id'], 'tirada_em' => $f['tirada_em'], 'atividade' => $f['atividade'], 'codigo' => $f['codigo']], $fotos), 'avancos' => $avancos];
}
function eq_prazo_txt(array $t): string {
    return match ($t['prazo_origem'] ?? '') {
        'norma' => 'validade ' . $t['prazo_valor'] . ' ' . ($t['prazo_unidade'] === 'anos' ? ((int)$t['prazo_valor'] === 1 ? 'ano' : 'anos') : ($t['prazo_unidade'] === 'meses' ? ((int)$t['prazo_valor'] === 1 ? 'mês' : 'meses') : 'dias')),
        'sem_validade', 'sem_prazo_na_norma' => 'sem validade',
        'validade_no_documento' => 'validade escrita no documento',
        'empresa_preenche' => $t['prazo_valor'] ? 'validade ' . $t['prazo_valor'] . ' ' . $t['prazo_unidade'] . ' (empresa)' : 'validade definida pela empresa',
        default => '',
    };
}

/** GET /api/tipos-documento — o catálogo de documentos da empresa. */
function rota_tipos_documento(): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    return ['tipos' => array_map(fn($t) => ['id' => (int)$t['id'], 'nr' => $t['nr'], 'nome' => $t['nome'], 'categoria' => $t['categoria'], 'prazo' => eq_prazo_txt($t),
        'pede_validade' => $t['prazo_origem'] === 'validade_no_documento' || ($t['prazo_origem'] === 'empresa_preenche' && !$t['prazo_valor'])],
        todos('SELECT * FROM tipos_documento WHERE empresa_id = ? AND ativo = 1 ORDER BY CAST(SUBSTRING(nr, 4) AS UNSIGNED), nome', [$u['empresa_id']]))];
}

/** POST /api/funcionarios/{id}/documentos — {tipo_documento_id, emissao, validade?, instituicao?, apto?, arquivo?: {dados, nome}} */
function rota_documento_lancar(int $fid): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    $p = eq_pessoa($u, $fid); $eid = (int)$u['empresa_id'];
    $d = corpo();
    $t = um('SELECT * FROM tipos_documento WHERE id = ? AND empresa_id = ? AND ativo = 1', [(int)($d['tipo_documento_id'] ?? 0), $eid]);
    if (!$t) throw new ErroApi('Escolha o documento');
    $emissao = data_ok((string)($d['emissao'] ?? ''), 'data de emissão');
    if (!$emissao) throw new ErroApi('Informe a data de emissão');
    if ($emissao > eq_hoje()) throw new ErroApi('A emissão não pode ser no futuro');
    $pedeVal = $t['prazo_origem'] === 'validade_no_documento' || ($t['prazo_origem'] === 'empresa_preenche' && !$t['prazo_valor']);
    $validade = !empty($d['validade']) ? data_ok((string)$d['validade'], 'validade') : null;
    if ($pedeVal && !$validade) throw new ErroApi('Este documento tem a validade escrita nele: informe a validade');
    if (!$pedeVal) $validade = null;                     // prazo da norma: calculado, nunca digitado
    if ($validade && $validade < $emissao) throw new ErroApi('A validade não pode ser antes da emissão');
    $arq = null;
    if (!empty($d['arquivo']['dados'])) $arq = eq_gravar_arquivo($eid, (string)$d['arquivo']['dados']);
    $id = inserir('documentos_funcionario', ['empresa_id' => $eid, 'funcionario_id' => $fid, 'tipo_documento_id' => (int)$t['id'], 'emissao' => $emissao, 'validade' => $validade,
        'instituicao' => isset($d['instituicao']) && trim((string)$d['instituicao']) !== '' ? mb_substr(trim((string)$d['instituicao']), 0, 160) : null,
        'apto' => $t['categoria'] === 'exame' ? (isset($d['apto']) ? ((int)(bool)$d['apto']) : 1) : null,
        'arquivo' => $arq, 'restrito' => $t['categoria'] === 'exame' ? 1 : 0]);           // ASO: só o administrador abre o arquivo
    registrar($u, $eid, 'funcionarios', $fid, 'alterou', null, ['documento' => $t['nome'], 'emissao' => $emissao, 'certificado' => (bool)$arq]);
    $v = um('SELECT vence_em FROM v_documentos_situacao WHERE id = ?', [$id]);
    return ['ok' => true, 'id' => $id, 'vence' => $v['vence_em'] ?? null];
}
function eq_gravar_arquivo(int $eid, string $dados): string {
    $bin = base64_decode(preg_replace('#^data:[a-z/+.\-]+;base64,#i', '', $dados), true);
    if ($bin === false || $bin === '') throw new ErroApi('Arquivo inválido');
    if (strlen($bin) > DOC_MAX_BYTES) throw new ErroApi('Arquivo grande demais (até 10 MB)');
    if (str_starts_with($bin, '%PDF-')) $ext = 'pdf';
    else {
        $info = @getimagesizefromstring($bin);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) throw new ErroApi('Envie o certificado em PDF, JPG ou PNG');
        $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$info[2]];
    }
    $rel = "$eid/documentos/" . gmdate('Y') . '/' . bin2hex(random_bytes(12)) . ".$ext";
    $dir = pasta_arquivos() . '/' . dirname($rel);
    if (!is_dir($dir) && !@mkdir($dir, 0750, true)) throw new ErroApi('Não foi possível guardar o arquivo no servidor', 500);
    file_put_contents(pasta_arquivos() . '/' . $rel, $bin);
    return $rel;
}
/** GET /api/documentos/{id}/arquivo */
function rota_documento_arquivo(int $id): array {
    $u = exigir_login();
    $d = um('SELECT * FROM documentos_funcionario WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$d || !$d['arquivo']) throw new ErroApi('Arquivo não encontrado', 404);
    eq_pessoa($u, (int)$d['funcionario_id']);
    if ((int)$d['restrito'] && $u['perfil'] !== 'administrador') throw new ErroApi('Arquivo de saúde: só o administrador abre', 403);
    $arq = pasta_arquivos() . '/' . $d['arquivo'];
    if (!is_file($arq)) throw new ErroApi('Arquivo não encontrado', 404);
    $tipo = ['pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][pathinfo($arq, PATHINFO_EXTENSION)] ?? 'application/octet-stream';
    header('Content-Type: ' . $tipo); header('Content-Length: ' . filesize($arq)); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline; filename="certificado.' . pathinfo($arq, PATHINFO_EXTENSION) . '"');
    readfile($arq); exit;
}
/** DELETE /api/documentos/{id} */
function rota_documento_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $d = um('SELECT * FROM documentos_funcionario WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$d) throw new ErroApi('Documento não encontrado', 404);
    q('UPDATE documentos_funcionario SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'funcionarios', (int)$d['funcionario_id'], 'alterou', ['documento_id' => $id], ['documento_excluido' => true]);
    return ['ok' => true];
}

/** GET /api/cargos-documentos — cargos, quantas pessoas e os documentos exigidos de cada um. */
function rota_cargos_documentos(): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']); $eid = (int)$u['empresa_id'];
    $por = [];
    foreach (todos('SELECT cargo, COUNT(*) n FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 AND cargo IS NOT NULL AND cargo <> \'\' GROUP BY cargo', [$eid]) as $c)
        $por[eq_norm($c['cargo'])] = ['cargo' => $c['cargo'], 'pessoas' => (int)$c['n'], 'tipos' => []];
    foreach (todos('SELECT cargo, tipo_documento_id FROM exigencias_documento WHERE empresa_id = ? AND cargo IS NOT NULL', [$eid]) as $x) {
        $k = eq_norm($x['cargo']); $por[$k] ??= ['cargo' => $x['cargo'], 'pessoas' => 0, 'tipos' => []];
        $por[$k]['tipos'][] = (int)$x['tipo_documento_id'];
    }
    $L = array_values($por); usort($L, fn($a, $b) => strcmp($a['cargo'], $b['cargo']));
    return ['cargos' => $L, 'pode_editar' => in_array($u['perfil'], PODE_TUDO, true)];
}
/** PUT /api/cargos-documentos — {cargo, tipos: [ids]} substitui os exigidos do cargo. */
function rota_cargos_documentos_salvar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id'];
    $d = corpo(); $cargo = trim(mb_substr((string)($d['cargo'] ?? ''), 0, 80));
    if ($cargo === '') throw new ErroApi('Informe o cargo');
    $tipos = array_values(array_unique(array_map('intval', is_array($d['tipos'] ?? null) ? $d['tipos'] : [])));
    if ($tipos && count(todos('SELECT id FROM tipos_documento WHERE empresa_id = ? AND id IN (' . implode(',', $tipos) . ')', [$eid])) !== count($tipos)) throw new ErroApi('Documento inválido');
    $existentes = todos('SELECT id, cargo FROM exigencias_documento WHERE empresa_id = ? AND cargo IS NOT NULL', [$eid]);
    foreach ($existentes as $x) if (eq_norm($x['cargo']) === eq_norm($cargo)) q('DELETE FROM exigencias_documento WHERE id = ?', [$x['id']]);
    foreach ($tipos as $t) q('INSERT INTO exigencias_documento (empresa_id, tipo_documento_id, cargo) VALUES (?,?,?)', [$eid, $t, $cargo]);
    registrar($u, $eid, 'empresas', $eid, 'alterou', null, ['cargo' => $cargo, 'documentos_exigidos' => count($tipos)]);
    return ['ok' => true, 'tipos' => $tipos];
}
/** GET/PUT /api/atividades/{id}/exigencias — documentos que a atividade exige de quem fizer. */
function rota_atividade_exigencias(int $id): array {
    $u = exigir_login(); $a = atividade_visivel($u, $id); $eid = (int)$u['empresa_id'];
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'PUT') {
        exigir_perfil($u, PODE_TUDO);
        $tipos = array_values(array_unique(array_map('intval', is_array(corpo()['tipos'] ?? null) ? corpo()['tipos'] : [])));
        if ($tipos && count(todos('SELECT id FROM tipos_documento WHERE empresa_id = ? AND id IN (' . implode(',', $tipos) . ')', [$eid])) !== count($tipos)) throw new ErroApi('Documento inválido');
        q('DELETE FROM exigencias_documento WHERE atividade_id = ? AND empresa_id = ?', [$id, $eid]);
        foreach ($tipos as $t) q('INSERT INTO exigencias_documento (empresa_id, tipo_documento_id, atividade_id) VALUES (?,?,?)', [$eid, $t, $id]);
        registrar($u, $eid, 'atividades', $id, 'alterou', null, ['documentos_exigidos' => count($tipos)]);
    }
    $nomes = eq_nomes_tipos($eid);
    return ['tipos' => array_map(fn($r) => ['id' => (int)$r['tipo_documento_id'], 'nome' => $nomes[(int)$r['tipo_documento_id']] ?? ''],
        todos('SELECT tipo_documento_id FROM exigencias_documento WHERE atividade_id = ? AND empresa_id = ?', [$id, $eid]))];
}

/** Pendências de uma pessoa para uma atividade (documentos na data, ausência no período, carga). */
function eq_pendencias(int $eid, array $p, array $a, string $hoje, array $tiposAtiv, array $tiposObra, array $nomes): array {
    $fid = (int)$p['id']; $pend = [];
    $req = [];
    foreach (todos('SELECT tipo_documento_id, cargo FROM exigencias_documento WHERE empresa_id = ? AND cargo IS NOT NULL', [$eid]) as $x) if (eq_norm($x['cargo']) === eq_norm($p['cargo'])) $req[(int)$x['tipo_documento_id']] = 'cargo';
    foreach ($tiposObra as $t) $req[$t] ??= 'obra';
    foreach ($tiposAtiv as $t) $req[$t] = 'atividade';
    $docs = eq_documentos($eid, [$fid])[$fid] ?? [];
    $ini = max($hoje, (string)($a['inicio'] ?: $hoje)); $fim = max($ini, (string)($a['fim'] ?: $ini));
    foreach ($req as $t => $origem) {
        $nome = $nomes[$t] ?? 'documento'; $d = $docs[$t] ?? null;
        $por = $origem === 'atividade' ? ', exigida por esta atividade' : ($origem === 'obra' ? ', exigida nesta obra' : '');
        if (!$d) { $pend[] = ['nivel' => 'grave', 'tipo' => 'documento', 'texto' => "Falta $nome$por"]; continue; }
        [$s] = eq_situacao($d, $ini, $fim);
        if ($s === 'vencido') $pend[] = ['nivel' => 'grave', 'tipo' => 'documento', 'texto' => ((int)$d['invalidado_por_afastamento'] ? "$nome invalidado por afastamento" : "$nome vencido" . ($d['vence_em'] ? ' em ' . ass_data_br($d['vence_em']) . '/' . substr($d['vence_em'], 0, 4) : '')) . $por];
        elseif ($s === 'vence_antes') $pend[] = ['nivel' => 'atencao', 'tipo' => 'documento', 'texto' => "$nome vence em " . ass_data_br($d['vence_em']) . ', antes do fim da atividade'];
    }
    foreach (todos('SELECT inicio, fim, tipo FROM ausencias WHERE funcionario_id = ? AND empresa_id = ? AND excluido_em IS NULL AND inicio <= ? AND fim >= ?', [$fid, $eid, $fim, $ini]) as $x)
        $pend[] = ['nivel' => 'grave', 'tipo' => 'ausencia', 'texto' => $x['tipo'] . ' de ' . ass_data_br($x['inicio']) . ' a ' . ass_data_br($x['fim']) . ', dentro do período da atividade'];
    $c = eq_cargas($eid, [$fid], $hoje)[$fid]['carga'];
    if ($c >= 85 && $c < 999) $pend[] = ['nivel' => 'aviso', 'tipo' => 'carga', 'texto' => "Carga de $c% nos próximos 14 dias"];
    return [$pend, $c];
}
/** GET /api/atividades/{id}/checar-responsavel?funcionario_id=X */
function rota_checar_responsavel(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id']; $hoje = eq_hoje();
    $a = atividade_visivel($u, $id);
    $fid = (int)($_GET['funcionario_id'] ?? 0);
    $p = funcionario_da_empresa($u, $fid);
    $tiposAtiv = array_map('intval', array_column(todos('SELECT tipo_documento_id FROM exigencias_documento WHERE atividade_id = ? AND empresa_id = ?', [$id, $eid]), 'tipo_documento_id'));
    $tiposObra = array_map('intval', array_column(todos('SELECT tipo_documento_id FROM exigencias_documento WHERE projeto_id = ? AND empresa_id = ?', [$a['projeto_id'], $eid]), 'tipo_documento_id'));
    $nomes = eq_nomes_tipos($eid);
    [$pend, $carga] = eq_pendencias($eid, $p, $a, $hoje, $tiposAtiv, $tiposObra, $nomes);
    $sug = [];
    if (array_filter($pend, fn($x) => $x['nivel'] !== 'aviso')) {
        foreach (todos("SELECT * FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 AND id <> ? AND tipo_trabalho <> 'escritorio'", [$eid, $fid]) as $q2) {
            [$pp, $cc] = eq_pendencias($eid, $q2, $a, $hoje, $tiposAtiv, $tiposObra, $nomes);
            if (!array_filter($pp, fn($x) => $x['nivel'] === 'grave')) $sug[] = ['id' => (int)$q2['id'], 'nome' => $q2['nome'], 'cargo' => $q2['cargo'], 'carga' => $cc, 'atencao' => count($pp)];
        }
        usort($sug, fn($x, $y) => ($x['atencao'] <=> $y['atencao']) ?: ($x['carga'] <=> $y['carga']));
    }
    return ['pessoa' => ['id' => $fid, 'nome' => $p['nome']], 'atividade' => ['id' => $id, 'descricao' => $a['descricao'], 'inicio' => $a['inicio'], 'fim' => $a['fim']],
            'pendencias' => $pend, 'carga' => $carga, 'sugestoes' => array_slice($sug, 0, 3)];
}
