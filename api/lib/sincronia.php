<?php
/* TaskFlow PRO · servidor · equipe (alterar), recursos, ausências e importação dos dados do navegador */
declare(strict_types=1);

/* ── Equipe: alterar e desligar ──────────────────────────────── */
function funcionario_da_empresa(array $u, int $id): array {
    $f = um('SELECT * FROM funcionarios WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$f) throw new ErroApi('Funcionário não encontrado', 404);
    return $f;
}
function rota_funcionarios_alterar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $antes = funcionario_da_empresa($u, $id);
    $c = limpar(corpo(), REGRAS_FUNCIONARIO);
    if (array_key_exists('nome', $c) && empty($c['nome'])) throw new ErroApi('O nome não pode ficar vazio');
    if (!empty($c['encarregado_id']) && !um('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ?', [$c['encarregado_id'], $u['empresa_id']])) throw new ErroApi('Encarregado não encontrado', 404);
    atualizar('funcionarios', $id, $c);
    registrar($u, (int)$u['empresa_id'], 'funcionarios', $id, 'alterou', array_intersect_key($antes, $c), $c);
    return ['ok' => true];
}
function rota_funcionarios_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    funcionario_da_empresa($u, $id);
    q('UPDATE funcionarios SET excluido_em = UTC_TIMESTAMP(), ativo = 0 WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'funcionarios', $id, 'excluiu');
    return ['ok' => true];
}

/* ── Recursos: ver api/lib/recursos.php ──────────────────────── */

/* ── Ausências (calendário da equipe) ────────────────────────── */
const TIPOS_AUSENCIA = ['Folga', 'Férias', 'Treinamento', 'Outra atividade', 'Afastamento – doença ou acidente', 'Afastamento – outro motivo'];
function rota_ausencias_listar(): array {
    $u = exigir_login();
    $sql = 'SELECT a.id, a.funcionario_id, f.nome AS funcionario_nome, a.inicio, a.fim, a.tipo, a.detalhe
            FROM ausencias a JOIN funcionarios f ON f.id = a.funcionario_id
            WHERE a.empresa_id = ? AND a.excluido_em IS NULL';
    $p = [$u['empresa_id']];
    if ($u['perfil'] === 'funcionario') { $sql .= ' AND a.funcionario_id = ?'; $p[] = (int)$u['funcionario_id']; }
    return ['ausencias' => todos($sql . ' ORDER BY a.inicio', $p)];
}
/** PUT /api/ausencias/funcionario/{id} {periodos:[{inicio,fim,tipo,detalhe}]} — troca todos os períodos da pessoa */
function rota_ausencias_substituir(int $fid): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    funcionario_da_empresa($u, $fid);
    $periodos = corpo()['periodos'] ?? null;
    if (!is_array($periodos) || count($periodos) > 2000) throw new ErroApi('Lista de períodos inválida');
    $limpos = [];
    foreach ($periodos as $p) {
        $ini = data_ok((string)($p['inicio'] ?? ''), 'inicio'); $fim = data_ok((string)($p['fim'] ?? ''), 'fim');
        if (!$ini || !$fim || $fim < $ini) throw new ErroApi('Período inválido');
        if (!in_array($p['tipo'] ?? '', TIPOS_AUSENCIA, true)) throw new ErroApi('Tipo de ausência inválido');
        $det = isset($p['detalhe']) ? mb_substr(trim((string)$p['detalhe']), 0, 200) : null;
        $limpos[] = [$ini, $fim, $p['tipo'], $det ?: null];
    }
    $antes = todos('SELECT inicio, fim, tipo, detalhe FROM ausencias WHERE funcionario_id = ? AND excluido_em IS NULL', [$fid]);
    $pdo = db(); $pdo->beginTransaction();
    try {
        q('UPDATE ausencias SET excluido_em = UTC_TIMESTAMP() WHERE funcionario_id = ? AND empresa_id = ? AND excluido_em IS NULL', [$fid, $u['empresa_id']]);
        foreach ($limpos as [$i, $f, $t, $d])
            q('INSERT INTO ausencias (empresa_id, funcionario_id, inicio, fim, tipo, detalhe, criado_por) VALUES (?,?,?,?,?,?,?)', [$u['empresa_id'], $fid, $i, $f, $t, $d, $u['id']]);
        registrar($u, (int)$u['empresa_id'], 'ausencias', $fid, 'alterou', $antes, $limpos);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    return ['ok' => true, 'periodos' => count($limpos)];
}

/* ── Importar os dados que estavam só no navegador ───────────── */
/** POST /api/importar — só quando a empresa ainda não tem obras nem atividades no servidor */
function rota_importar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $eid = (int)$u['empresa_id'];
    if (um('SELECT id FROM projetos WHERE empresa_id = ? LIMIT 1', [$eid]) || um('SELECT id FROM atividades WHERE empresa_id = ? LIMIT 1', [$eid]))
        throw new ErroApi('A empresa já tem obras no servidor; a importação só pode ser feita uma vez, no início.', 409);
    $d = corpo();
    $lista = fn($k, $max) => (is_array($d[$k] ?? null) && count($d[$k]) <= $max) ? $d[$k] : (isset($d[$k]) ? throw new ErroApi("Lista inválida: $k") : []);
    $projetos = $lista('projetos', 2000); $atividades = $lista('atividades', 20000);
    $funcs = $lista('funcionarios', 5000); $recursos = $lista('recursos', 5000); $ausencias = $lista('ausencias', 20000);
    $chave = fn($n) => mb_strtolower(trim(preg_replace('/\s+/', ' ', strtr((string)$n, ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','é'=>'e','ê'=>'e','í'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ú'=>'u','ç'=>'c','Á'=>'a','À'=>'a','Â'=>'a','Ã'=>'a','É'=>'e','Ê'=>'e','Í'=>'i','Ó'=>'o','Ô'=>'o','Õ'=>'o','Ú'=>'u','Ç'=>'c']))));

    $pdo = db(); $pdo->beginTransaction();
    try {
        $fId = [];   // chave do nome -> id do funcionário
        foreach (todos('SELECT id, nome FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL', [$eid]) as $f) $fId[$chave($f['nome'])] = (int)$f['id'];
        $garanteFunc = function (string $nome, ?string $cargo = null, ?string $equipe = null) use (&$fId, $chave, $eid) {
            $k = $chave($nome);
            if ($k === '') return null;
            if (!isset($fId[$k])) $fId[$k] = inserir('funcionarios', ['empresa_id' => $eid, 'nome' => mb_substr(trim($nome), 0, 160),
                'cargo' => $cargo ? mb_substr($cargo, 0, 80) : null, 'equipe' => ($equipe && $equipe !== 'Não definida') ? mb_substr($equipe, 0, 80) : null]);
            return $fId[$k];
        };
        foreach ($funcs as $f) if (is_array($f) && !empty($f['nome'])) $garanteFunc((string)$f['nome'], $f['cargo'] ?? null, $f['equipe'] ?? null);
        foreach ($recursos as $r) if (is_array($r) && !empty($r['nome']))
            inserir('recursos', ['empresa_id' => $eid, 'nome' => mb_substr(trim((string)$r['nome']), 0, 160), 'tipo' => 'equipamento', 'id_antigo' => mb_substr((string)($r['id_antigo'] ?? ''), 0, 60) ?: null]);

        $pId = [];   // id antigo -> id novo
        $codigos = [];
        foreach ($projetos as $p) {
            if (!is_array($p)) continue;
            $c = limpar($p, REGRAS_PROJETO);
            if (empty($c['nome'])) continue;
            if (!empty($c['codigo']) && isset($codigos[$c['codigo']])) $c['codigo'] = null;   // código repetido no navegador
            if (!empty($c['codigo'])) $codigos[$c['codigo']] = true;
            $pId[(string)($p['id_antigo'] ?? '')] = inserir('projetos', ['empresa_id' => $eid, 'id_antigo' => mb_substr((string)($p['id_antigo'] ?? ''), 0, 40) ?: null] + $c);
        }
        $aId = []; $pendentesPai = [];
        foreach ($atividades as $i => $a) {
            if (!is_array($a)) continue;
            $proj = $pId[(string)($a['projeto_id_antigo'] ?? '')] ?? null;
            if (!$proj) continue;
            $c = limpar(array_diff_key($a, ['projeto_id' => 1, 'pai_id' => 1, 'responsavel_id' => 1]), REGRAS_ATIVIDADE);
            if (empty($c['descricao'])) continue;
            if (!empty($c['inicio']) && !empty($c['fim']) && $c['fim'] < $c['inicio']) $c['fim'] = $c['inicio'];
            $c['projeto_id'] = $proj;
            $c['responsavel_id'] = !empty($a['responsavel_nome']) ? $garanteFunc((string)$a['responsavel_nome']) : null;
            $c['ordem'] = $c['ordem'] ?? $i;
            $novo = inserir('atividades', ['empresa_id' => $eid, 'id_antigo' => mb_substr((string)($a['id_antigo'] ?? ''), 0, 40) ?: null] + $c);
            $aId[(string)($a['id_antigo'] ?? '')] = $novo;
            if (!empty($a['pai_id_antigo'])) $pendentesPai[$novo] = (string)$a['pai_id_antigo'];
        }
        foreach ($pendentesPai as $novo => $paiAntigo) if (isset($aId[$paiAntigo])) q('UPDATE atividades SET pai_id = ? WHERE id = ?', [$aId[$paiAntigo], $novo]);

        $nAus = 0;
        foreach ($ausencias as $a) {
            if (!is_array($a) || !in_array($a['tipo'] ?? '', TIPOS_AUSENCIA, true)) continue;
            $fid = $garanteFunc((string)($a['funcionario_nome'] ?? ''));
            $ini = data_ok((string)($a['inicio'] ?? ''), 'inicio'); $fim = data_ok((string)($a['fim'] ?? ''), 'fim');
            if (!$fid || !$ini || !$fim || $fim < $ini) continue;
            inserir('ausencias', ['empresa_id' => $eid, 'funcionario_id' => $fid, 'inicio' => $ini, 'fim' => $fim, 'tipo' => $a['tipo'],
                'detalhe' => isset($a['detalhe']) ? mb_substr((string)$a['detalhe'], 0, 200) : null, 'criado_por' => $u['id']]);
            $nAus++;
        }
        $res = ['projetos' => count($pId), 'atividades' => count($aId), 'funcionarios' => count($fId), 'recursos' => count($recursos), 'ausencias' => $nAus];
        registrar($u, $eid, 'empresas', $eid, 'importou', null, $res);
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    return ['ok' => true] + $res;
}
