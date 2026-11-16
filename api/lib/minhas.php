<?php
/* Aprumo · servidor · Minhas atividades: o que cada pessoa tem para fazer, avanço com foto, "Travou" (impedimento) e fotos. */
declare(strict_types=1);

const MOTIVOS_TRAVOU = [
    'material'   => ['Falta de material', 'Falta material'],
    'liberacao'  => ['Pendência do cliente', 'Aguardando liberação do cliente'],
    'clima'      => ['Clima', 'Chuva / tempo'],
    'equipamento'=> ['Equipamento', 'Equipamento ou ferramenta'],
    'outro'      => ['Outro', 'Outro'],
];
const FOTO_MAX_BYTES = 8 * 1024 * 1024;
const FOTO_MAX_POR_ENVIO = 6;

function minhas_hoje(): string { return gmdate('Y-m-d', time() - 3 * 3600); }

/** Obras em que a pessoa é da equipe ("Da minha equipe"). null = todas da empresa. */
function obras_da_equipe(array $u): ?array {
    if ($u['perfil'] === 'administrador') return null;
    if ($u['perfil'] === 'gestor') {
        $ids = array_map('intval', array_column(todos('SELECT id FROM projetos WHERE empresa_id = ? AND gestor_id = ? AND excluido_em IS NULL', [$u['empresa_id'], $u['id']]), 'id'));
        $ids = array_values(array_unique(array_merge($ids, array_map('intval', array_column(todos('SELECT projeto_id FROM projeto_membros WHERE usuario_id = ?', [$u['id']]), 'projeto_id')))));
        return $ids ?: null;   // gestor sem obra própria vê todas
    }
    return obras_visiveis($u);
}

/** GET /api/minhas-atividades?ver=minhas|equipe&obra=ID */
function rota_minhas_atividades(): array {
    $u = exigir_login(); $eid = (int)$u['empresa_id']; $hoje = minhas_hoje();
    $fid = $u['funcionario_id'] ? (int)$u['funcionario_id'] : null;
    $podeEquipe = $u['perfil'] !== 'funcionario';
    $ver = ($_GET['ver'] ?? '') === 'equipe' && $podeEquipe ? 'equipe' : 'minhas';
    if ($ver === 'minhas' && !$fid && $podeEquipe && empty($_GET['ver'])) $ver = 'equipe';   // quem não é da equipe de campo começa pela equipe
    $obraF = isset($_GET['obra']) && ctype_digit((string)$_GET['obra']) ? (int)$_GET['obra'] : null;
    $vis = $ver === 'equipe' ? obras_da_equipe($u) : obras_visiveis($u);
    $sql = 'SELECT a.id, a.projeto_id, a.descricao, a.inicio, a.fim, a.avanco, a.situacao, a.responsavel_id, a.duracao_dias, a.atualizado_em,
                   f.nome AS responsavel_nome, p.codigo, p.nome AS obra, p.situacao AS obra_situacao
            FROM atividades a JOIN projetos p ON p.id = a.projeto_id AND p.excluido_em IS NULL
            LEFT JOIN funcionarios f ON f.id = a.responsavel_id
            WHERE a.empresa_id = ? AND a.excluido_em IS NULL AND p.situacao NOT IN (\'Arquivado\')
              AND NOT EXISTS (SELECT 1 FROM atividades x WHERE x.pai_id = a.id AND x.excluido_em IS NULL)';
    $p = [$eid];
    if ($vis !== null) $sql .= $vis ? ' AND a.projeto_id IN (' . implode(',', array_map('intval', $vis)) . ')' : ' AND 0';
    if ($ver === 'minhas') { if (!$fid) $sql .= ' AND 0'; else { $sql .= ' AND a.responsavel_id = ?'; $p[] = $fid; } }
    $obras = [];
    $L = todos($sql . ' ORDER BY a.fim, a.inicio', $p);
    foreach ($L as $a) $obras[(int)$a['projeto_id']] = ['id' => (int)$a['projeto_id'], 'codigo' => $a['codigo'], 'nome' => $a['obra']];
    if ($obraF) $L = array_values(array_filter($L, fn($a) => (int)$a['projeto_id'] === $obraF));
    $ids = array_map(fn($a) => (int)$a['id'], $L);
    $trav = []; $fotos = []; $ultimo = [];
    if ($ids) {
        $in = implode(',', $ids);
        foreach (todos("SELECT o.id, o.atividade_id, o.tipo, o.descricao, o.criado_em, us.nome AS por FROM ocorrencias o LEFT JOIN usuarios us ON us.id = o.registrada_por
                        WHERE o.atividade_id IN ($in) AND o.resolvida_em IS NULL AND o.excluido_em IS NULL ORDER BY o.criado_em", []) as $o)
            $trav[(int)$o['atividade_id']] = ['id' => (int)$o['id'], 'tipo' => $o['tipo'], 'descricao' => $o['descricao'], 'desde' => $o['criado_em'], 'por' => $o['por']];
        foreach (todos("SELECT atividade_id, COUNT(*) n FROM fotos WHERE atividade_id IN ($in) AND excluido_em IS NULL GROUP BY atividade_id", []) as $f) $fotos[(int)$f['atividade_id']] = (int)$f['n'];
        foreach (todos("SELECT v.atividade_id, v.criado_em, v.para_avanco, us.nome, (SELECT COUNT(*) FROM fotos ft WHERE ft.avanco_id = v.id) AS fotos
                        FROM avancos v JOIN usuarios us ON us.id = v.usuario_id WHERE v.atividade_id IN ($in) AND v.id = (SELECT MAX(id) FROM avancos x WHERE x.atividade_id = v.atividade_id)", []) as $v)
            $ultimo[(int)$v['atividade_id']] = ['quando' => $v['criado_em'], 'por' => $v['nome'], 'avanco' => (int)$v['para_avanco'], 'com_foto' => (int)$v['fotos'] > 0];
    }
    $sem = Calendario::mais($hoje, 7); $sete = Calendario::mais($hoje, -7);
    $G = ['atrasadas' => [], 'hoje' => [], 'semana' => [], 'proximas' => [], 'concluidas' => []];
    $travadas = 0;
    foreach ($L as $a) {
        $id = (int)$a['id']; $aberta = $a['situacao'] !== 'Concluído' && (int)$a['avanco'] < 100;
        $x = ['id' => $id, 'projeto_id' => (int)$a['projeto_id'], 'codigo' => $a['codigo'], 'obra' => $a['obra'], 'descricao' => $a['descricao'], 'inicio' => $a['inicio'], 'fim' => $a['fim'],
              'avanco' => (int)$a['avanco'], 'situacao' => $a['situacao'], 'responsavel_id' => $a['responsavel_id'] ? (int)$a['responsavel_id'] : null, 'responsavel_nome' => $a['responsavel_nome'],
              'minha' => $fid && (int)$a['responsavel_id'] === $fid, 'duracao_dias' => $a['duracao_dias'] !== null ? (float)$a['duracao_dias'] : null,
              'atraso_dias' => $aberta && $a['fim'] && $a['fim'] < $hoje ? (int)round((strtotime($hoje . ' UTC') - strtotime($a['fim'] . ' UTC')) / 86400) : 0,
              'travada' => $trav[$id] ?? null, 'fotos' => $fotos[$id] ?? 0, 'ultimo' => $ultimo[$id] ?? null];
        if ($x['travada'] && $aberta) $travadas++;
        if (!$aberta) { $q = $ultimo[$id]['quando'] ?? $a['atualizado_em']; if (substr((string)$q, 0, 10) >= $sete) $G['concluidas'][] = $x; continue; }
        if ($x['atraso_dias'] > 0) $G['atrasadas'][] = $x;
        elseif ($a['inicio'] && $a['inicio'] <= $hoje) $G['hoje'][] = $x;
        elseif ($a['inicio'] && $a['inicio'] <= $sem) $G['semana'][] = $x;
        else $G['proximas'][] = $x;
    }
    usort($G['atrasadas'], fn($x, $y) => $y['atraso_dias'] <=> $x['atraso_dias']);
    usort($G['concluidas'], fn($x, $y) => strcmp((string)($y['ultimo']['quando'] ?? ''), (string)($x['ultimo']['quando'] ?? '')));
    $G['proximas'] = array_slice($G['proximas'], 0, 30);
    $nome = um('SELECT nome FROM usuarios WHERE id = ?', [$u['id']])['nome'] ?? '';
    $encObras = $u['perfil'] === 'encarregado' ? array_column(todos('SELECT p.codigo FROM projeto_membros m JOIN projetos p ON p.id = m.projeto_id WHERE m.usuario_id = ? AND p.excluido_em IS NULL', [$u['id']]), 'codigo') : [];
    return ['hoje' => $hoje, 'ver' => $ver, 'pode_equipe' => $podeEquipe, 'tem_ficha' => (bool)$fid, 'nome' => $nome, 'perfil' => $u['perfil'],
            'foto_obrigatoria' => foto_obrigatoria_para($u), 'comentario_concluir' => empresa_regras((int)$u['empresa_id'])['comentario_concluir'], 'obras_encarregado' => $encObras,
            'rdo_lembrete' => empresa_regras((int)$u['empresa_id'])['rdo_lembrete'] && $u['perfil'] !== 'funcionario',
            'rdos_hoje' => $u['perfil'] !== 'funcionario' && $obras ? array_column(array_map(fn($r) => ['projeto_id' => (int)$r['projeto_id'], 'situacao' => $r['situacao'], 'enviado' => (bool)$r['enviado_em']],
                todos('SELECT projeto_id, situacao, enviado_em FROM rdos WHERE empresa_id = ? AND data = ? AND excluido_em IS NULL', [$u['empresa_id'], $hoje])), null, 'projeto_id') : (object)[],
            'obras' => array_values($obras), 'obra' => $obraF,
            'resumo' => ['atrasadas' => count($G['atrasadas']), 'travadas' => $travadas, 'hoje' => count($G['hoje']), 'semana' => count($G['semana']), 'proximas' => count($G['proximas']), 'concluidas' => count($G['concluidas'])],
            'grupos' => $G, 'motivos' => array_map(fn($k, $m) => ['id' => $k, 'nome' => $m[1]], array_keys(MOTIVOS_TRAVOU), MOTIVOS_TRAVOU)];
}

/** Quem pode atualizar esta atividade (avanço ou Travou) e se precisa de foto. */
function atividade_para_campo(array $u, int $id): array {
    $a = atividade_visivel($u, $id);
    if ($u['perfil'] === 'funcionario' && (int)$a['responsavel_id'] !== (int)$u['funcionario_id']) throw new ErroApi('Esta atividade é de outra pessoa', 403);
    if (um('SELECT id FROM atividades WHERE pai_id = ? AND excluido_em IS NULL LIMIT 1', [$id])) throw new ErroApi('Esta linha é uma etapa: o avanço vem das atividades dela', 400);
    return $a;
}

/* ── Fotos: guardadas fora da pasta pública; servidas só para quem pode ver a obra ── */
function pasta_arquivos(): string {
    $c = config();
    $p = $c['pasta_arquivos'] ?? (dirname($c['_arquivo']) . '/tf-arquivos-gestao');
    if (!is_dir($p) && !@mkdir($p, 0750, true)) throw new ErroApi('Não foi possível guardar a foto no servidor (pasta de arquivos)', 500);
    return rtrim($p, '/');
}
/** Recebe [{dados (base64 ou data URL), tirada_em?, latitude?, longitude?}] e grava; devolve os ids. */
function gravar_fotos(array $u, array $a, array $lista, array $ligacao): array {
    if (count($lista) > FOTO_MAX_POR_ENVIO) throw new ErroApi('Até ' . FOTO_MAX_POR_ENVIO . ' fotos por vez');
    $ids = [];
    foreach ($lista as $k => $f) {
        $b64 = preg_replace('#^data:image/[a-z+]+;base64,#i', '', (string)($f['dados'] ?? ''));
        $bin = base64_decode($b64, true);
        if ($bin === false || $bin === '') throw new ErroApi('Foto ' . ($k + 1) . ' inválida');
        if (strlen($bin) > FOTO_MAX_BYTES) throw new ErroApi('Foto ' . ($k + 1) . ' grande demais (até 8 MB)');
        $info = @getimagesizefromstring($bin);
        if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) throw new ErroApi('Foto ' . ($k + 1) . ': envie JPG, PNG ou WEBP');
        $ext = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$info[2]];
        $rel = (int)$u['empresa_id'] . '/' . gmdate('Y/m') . '/' . bin2hex(random_bytes(12));
        $dir = pasta_arquivos() . '/' . dirname($rel);
        if (!is_dir($dir) && !@mkdir($dir, 0750, true)) throw new ErroApi('Não foi possível guardar a foto no servidor', 500);
        file_put_contents(pasta_arquivos() . "/$rel.$ext", $bin);
        $mini = "$rel-m.jpg";
        if (!miniatura($bin, pasta_arquivos() . '/' . $mini)) $mini = "$rel.$ext";
        $quando = !empty($f['tirada_em']) && preg_match('/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/', (string)$f['tirada_em']) ? gmdate('Y-m-d H:i:s', strtotime((string)$f['tirada_em']) ?: time()) : agora();
        $lat = isset($f['latitude']) && is_numeric($f['latitude']) && abs((float)$f['latitude']) <= 90 ? round((float)$f['latitude'], 6) : null;
        $lng = isset($f['longitude']) && is_numeric($f['longitude']) && abs((float)$f['longitude']) <= 180 ? round((float)$f['longitude'], 6) : null;
        $ids[] = inserir('fotos', ['empresa_id' => $u['empresa_id'], 'projeto_id' => $a['projeto_id'], 'atividade_id' => $a['id'], 'enviada_por' => $u['id'],
            'funcionario_id' => $u['funcionario_id'] ?: null, 'tirada_em' => $quando, 'arquivo' => "$rel.$ext", 'miniatura' => $mini, 'latitude' => $lat, 'longitude' => $lng,
            'legenda' => isset($f['legenda']) ? mb_substr((string)$f['legenda'], 0, 255) : null] + $ligacao);
    }
    return $ids;
}
function miniatura(string $bin, string $destino): bool {
    if (!function_exists('imagecreatefromstring')) return false;
    $im = @imagecreatefromstring($bin); if (!$im) return false;
    $w = imagesx($im); $h = imagesy($im); $m = 360; $r = min(1, $m / max($w, $h));
    $t = imagecreatetruecolor(max(1, (int)($w * $r)), max(1, (int)($h * $r)));
    imagecopyresampled($t, $im, 0, 0, 0, 0, imagesx($t), imagesy($t), $w, $h);
    $ok = imagejpeg($t, $destino, 78); imagedestroy($im); imagedestroy($t);
    return $ok;
}

/** POST /api/atividades/{id}/avanco — {avanco, comentario?, fotos?: [...], id_local?} */
function rota_atividade_avanco(int $id): array {
    $u = exigir_login();
    $a = atividade_para_campo($u, $id);
    $d = corpo();
    $idLocal = isset($d['id_local']) ? mb_substr(preg_replace('/[^\w\-]/', '', (string)$d['id_local']), 0, 40) : null;
    if ($idLocal && ($ja = um('SELECT id, para_avanco FROM avancos WHERE empresa_id = ? AND id_local = ?', [$u['empresa_id'], $idLocal])))
        return ['ok' => true, 'repetido' => true, 'avanco' => (int)$ja['para_avanco']];
    if (!isset($d['avanco']) || !is_numeric($d['avanco'])) throw new ErroApi('Informe o avanço (0 a 100)');
    $novo = max(0, min(100, (int)round((float)$d['avanco'])));
    $fotos = is_array($d['fotos'] ?? null) ? $d['fotos'] : [];
    if (!$fotos && foto_obrigatoria_para($u)) throw new ErroApi('Tire uma foto do serviço para registrar o avanço');
    if ($novo >= 100 && (int)$a['avanco'] < 100 && empresa_regras((int)$u['empresa_id'])['comentario_concluir'] && trim((string)($d['comentario'] ?? '')) === '')
        throw new ErroApi('Escreva um comentário sobre o que foi entregue para concluir');
    $sit = $novo >= 100 ? 'Concluído' : ($novo > 0 ? 'Em andamento' : ($a['situacao'] === 'Concluído' ? 'Em andamento' : $a['situacao']));
    db()->beginTransaction();
    try {
        $vid = inserir('avancos', ['empresa_id' => $u['empresa_id'], 'atividade_id' => $id, 'usuario_id' => $u['id'], 'de_avanco' => (int)$a['avanco'], 'para_avanco' => $novo,
            'comentario' => isset($d['comentario']) && trim((string)$d['comentario']) !== '' ? mb_substr(trim((string)$d['comentario']), 0, 2000) : null, 'id_local' => $idLocal]);
        $fids = gravar_fotos($u, $a, $fotos, ['avanco_id' => $vid]);
        q('UPDATE atividades SET avanco = ?, situacao = ? WHERE id = ?', [$novo, $sit, $id]);
        registrar($u, (int)$u['empresa_id'], 'atividades', $id, 'alterou', ['avanco' => (int)$a['avanco'], 'situacao' => $a['situacao']], ['avanco' => $novo, 'situacao' => $sit, 'fotos' => count($fids)]);
        db()->commit();
    } catch (Throwable $e) { db()->rollBack(); throw $e; }
    return ['ok' => true, 'avanco' => $novo, 'situacao' => $sit, 'fotos' => count($fids)];
}

/** GET /api/atividades/{id}/fotos — fotos da atividade (avanços e impedimentos). */
function rota_atividade_fotos(int $id): array {
    $u = exigir_login(); atividade_visivel($u, $id);
    $L = todos('SELECT f.id, f.tirada_em, f.latitude, f.longitude, f.avanco_id, f.ocorrencia_id, us.nome AS por, v.de_avanco, v.para_avanco, v.comentario
                FROM fotos f JOIN usuarios us ON us.id = f.enviada_por LEFT JOIN avancos v ON v.id = f.avanco_id
                WHERE f.atividade_id = ? AND f.excluido_em IS NULL ORDER BY f.tirada_em DESC LIMIT 60', [$id]);
    return ['fotos' => array_map(fn($f) => ['id' => (int)$f['id'], 'tirada_em' => $f['tirada_em'], 'por' => $f['por'], 'gps' => $f['latitude'] !== null,
        'tipo' => $f['ocorrencia_id'] ? 'travou' : 'avanco', 'de' => $f['de_avanco'] !== null ? (int)$f['de_avanco'] : null, 'para' => $f['para_avanco'] !== null ? (int)$f['para_avanco'] : null,
        'comentario' => $f['comentario']], $L)];
}
/** GET /api/fotos/{id}[?mini=1] — o arquivo da foto, só para quem vê a obra. */
function rota_foto_arquivo(int $id): array {
    $u = exigir_login();
    $f = um('SELECT * FROM fotos WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$f) throw new ErroApi('Foto não encontrada', 404);
    if ($f['atividade_id']) atividade_visivel($u, (int)$f['atividade_id']); else obra_da_empresa($u, (int)$f['projeto_id']);
    $arq = pasta_arquivos() . '/' . (!empty($_GET['mini']) ? $f['miniatura'] : $f['arquivo']);
    if (!is_file($arq)) throw new ErroApi('Arquivo da foto não encontrado', 404);
    $tipo = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'][strtolower(pathinfo($arq, PATHINFO_EXTENSION))] ?? 'application/octet-stream';
    header('Content-Type: ' . $tipo); header('Content-Length: ' . filesize($arq)); header('Cache-Control: private, max-age=86400'); header('X-Content-Type-Options: nosniff');
    readfile($arq); exit;
}

/** POST /api/atividades/{id}/impedimento — {motivo, descricao?, fotos?, id_local?} → marca travada e avisa o gestor. */
function rota_atividade_impedimento(int $id): array {
    $u = exigir_login();
    $a = atividade_para_campo($u, $id);
    $d = corpo();
    $idLocal = isset($d['id_local']) ? mb_substr(preg_replace('/[^\w\-]/', '', (string)$d['id_local']), 0, 40) : null;
    if ($idLocal && ($ja = um('SELECT id FROM ocorrencias WHERE empresa_id = ? AND id_local = ?', [$u['empresa_id'], $idLocal]))) return ['ok' => true, 'repetido' => true, 'id' => (int)$ja['id']];
    $m = MOTIVOS_TRAVOU[(string)($d['motivo'] ?? '')] ?? null;
    if (!$m) throw new ErroApi('Escolha o que travou');
    $texto = trim(mb_substr((string)($d['descricao'] ?? ''), 0, 2000));
    if ((string)$d['motivo'] === 'outro' && $texto === '') throw new ErroApi('Conte o que travou');
    $aberta = um('SELECT id FROM ocorrencias WHERE atividade_id = ? AND resolvida_em IS NULL AND excluido_em IS NULL', [$id]);
    db()->beginTransaction();
    try {
        if ($aberta) q('UPDATE ocorrencias SET resolvida_em = UTC_TIMESTAMP(), resolvida_por = ? WHERE id = ?', [$u['id'], $aberta['id']]);   // o motivo novo substitui o anterior
        $oid = inserir('ocorrencias', ['empresa_id' => $u['empresa_id'], 'projeto_id' => $a['projeto_id'], 'atividade_id' => $id, 'data' => minhas_hoje(), 'tipo' => $m[0], 'gravidade' => 'Média',
            'descricao' => $texto !== '' ? $m[1] . ': ' . $texto : $m[1], 'registrada_por' => $u['id'], 'id_local' => $idLocal]);
        $fids = gravar_fotos($u, $a, is_array($d['fotos'] ?? null) ? $d['fotos'] : [], ['ocorrencia_id' => $oid, 'no_rdo' => 1]);
        registrar($u, (int)$u['empresa_id'], 'atividades', $id, 'alterou', null, ['travou' => $m[1], 'descricao' => $texto]);
        db()->commit();
    } catch (Throwable $e) { db()->rollBack(); throw $e; }
    // aviso ao gestor da obra (no sistema e por e-mail)
    $p = um('SELECT codigo, nome, gestor_id FROM projetos WHERE id = ?', [$a['projeto_id']]);
    $avisados = [];
    $gestores = $p['gestor_id'] ? todos('SELECT id, nome, email FROM usuarios WHERE id = ? AND excluido_em IS NULL AND desativado_em IS NULL', [$p['gestor_id']])
        : todos("SELECT id, nome, email FROM usuarios WHERE empresa_id = ? AND perfil = 'administrador' AND excluido_em IS NULL AND desativado_em IS NULL AND email_confirmado_em IS NOT NULL", [$u['empresa_id']]);
    $porEmail = empresa_regras((int)$u['empresa_id'])['travou_email'];
    foreach ($gestores as $g) {
        if ((int)$g['id'] === (int)$u['id']) continue;
        $quem = um('SELECT nome FROM usuarios WHERE id = ?', [$u['id']])['nome'];
        q('INSERT INTO avisos (empresa_id, usuario_id, tipo, titulo, link) VALUES (?,?,?,?,?)', [$u['empresa_id'], $g['id'], 'ocorrencia', mb_substr("Travou: {$a['descricao']} ({$p['codigo']})", 0, 160), "obra:{$a['projeto_id']}:{$id}"]);
        if ($porEmail && $g['email'] && enviar_email($g['email'], email_aviso_impedimento($g['nome'], $quem, trim(($p['codigo'] ? $p['codigo'] . ' · ' : '') . $p['nome']), $a['descricao'], $m[1], $texto, link_app('/index.html'))))
            q('UPDATE avisos SET email_enviado_em = UTC_TIMESTAMP() WHERE id = LAST_INSERT_ID()');
        $avisados[] = $g['nome'];
    }
    return ['ok' => true, 'id' => $oid, 'fotos' => count($fids), 'avisados' => $avisados];
}

/** PATCH /api/ocorrencias/{id}/liberar — tira a trava (gestor, administrador ou encarregado da obra). */
function rota_ocorrencia_liberar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    $o = um('SELECT * FROM ocorrencias WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$o) throw new ErroApi('Impedimento não encontrado', 404);
    obra_da_empresa($u, (int)$o['projeto_id']);
    if ($o['resolvida_em']) return ['ok' => true, 'ja_estava' => true];
    q('UPDATE ocorrencias SET resolvida_em = UTC_TIMESTAMP(), resolvida_por = ? WHERE id = ?', [$u['id'], $id]);
    if ($o['atividade_id']) registrar($u, (int)$u['empresa_id'], 'atividades', (int)$o['atividade_id'], 'alterou', ['travou' => $o['descricao']], ['liberou' => true]);
    return ['ok' => true];
}
