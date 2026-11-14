<?php
/* TaskFlow PRO · servidor · obras, atividades e equipe (sempre filtrado pela empresa de quem está logado) */
declare(strict_types=1);

const PODE_TUDO = ['administrador', 'gestor'];

function data_ok(?string $v, string $nome): ?string {
    if ($v === null || $v === '') return null;
    $d = DateTime::createFromFormat('!Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) throw new ErroApi("Data inválida em $nome (use AAAA-MM-DD)");
    return $v;
}
function num_ok($v, string $nome, float $min, float $max): ?float {
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) throw new ErroApi("Número inválido em $nome");
    $n = (float)$v;
    if ($n < $min || $n > $max) throw new ErroApi("$nome fora do limite ($min a $max)");
    return $n;
}
/** Mantém só os campos permitidos e valida cada um. */
function limpar(array $d, array $regras): array {
    $out = [];
    foreach ($regras as $k => $r) {
        if (!array_key_exists($k, $d)) continue;
        $v = $d[$k];
        switch ($r[0]) {
            case 'texto': $v = $v === null ? null : trim((string)$v); if ($v !== null && mb_strlen($v) > $r[1]) throw new ErroApi("Campo muito longo: $k"); if ($v === '') $v = null; break;
            case 'data':  $v = data_ok($v === null ? null : (string)$v, $k); break;
            case 'num':   $v = num_ok($v, $k, $r[1], $r[2]); break;
            case 'bool':  $v = $v ? 1 : 0; break;
            case 'lista': if (!in_array($v, $r[1], true)) throw new ErroApi("Valor inválido em $k"); break;
            case 'id':    $v = $v === null || $v === '' ? null : (int)$v; break;
        }
        $out[$k] = $v;
    }
    return $out;
}
function inserir(string $tabela, array $campos): int {
    $cols = array_keys($campos);
    q("INSERT INTO $tabela (" . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($campos));
    return (int)db()->lastInsertId();
}
function atualizar(string $tabela, int $id, array $campos): void {
    if (!$campos) throw new ErroApi('Nada para alterar');
    $sets = implode(',', array_map(fn($c) => "$c = ?", array_keys($campos)));
    q("UPDATE $tabela SET $sets WHERE id = ?", [...array_values($campos), $id]);
}

/* ── Obras (projetos) ────────────────────────────────────────── */
const REGRAS_PROJETO = [
    'codigo' => ['texto', 30], 'nome' => ['texto', 160], 'descricao' => ['texto', 5000], 'cliente' => ['texto', 160],
    'local_obra' => ['texto', 200], 'gestor_id' => ['id'], 'gestor_nome' => ['texto', 160],
    'situacao' => ['lista', ['Em andamento', 'Pausado', 'Concluído', 'Arquivado']],
    'inicio' => ['data'], 'fim' => ['data'], 'cor' => ['texto', 7], 'valor_contrato' => ['num', 0, 1e12],
];
/** Obras que o usuário pode ver (ids), ou null = todas da empresa. */
function obras_visiveis(array $u): ?array {
    if (in_array($u['perfil'], PODE_TUDO, true)) return null;
    $ids = array_column(todos('SELECT projeto_id FROM projeto_membros WHERE usuario_id = ?', [$u['id']]), 'projeto_id');
    if ($u['perfil'] === 'funcionario' && $u['funcionario_id'])
        $ids = array_merge($ids, array_column(todos('SELECT DISTINCT projeto_id FROM atividades WHERE responsavel_id = ? AND empresa_id = ? AND excluido_em IS NULL', [$u['funcionario_id'], $u['empresa_id']]), 'projeto_id'));
    return array_values(array_unique(array_map('intval', $ids)));
}
function obra_da_empresa(array $u, int $id): array {
    $p = um('SELECT * FROM projetos WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$p) throw new ErroApi('Obra não encontrada', 404);
    $vis = obras_visiveis($u);
    if ($vis !== null && !in_array($id, $vis, true)) throw new ErroApi('Obra não encontrada', 404);
    return $p;
}
function rota_projetos_listar(): array {
    $u = exigir_login();
    $vis = obras_visiveis($u);
    if ($vis === []) return ['projetos' => []];
    $sql = 'SELECT * FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL';
    $p = [$u['empresa_id']];
    if ($vis !== null) { $sql .= ' AND id IN (' . implode(',', array_fill(0, count($vis), '?')) . ')'; $p = array_merge($p, $vis); }
    return ['projetos' => todos($sql . ' ORDER BY nome', $p)];
}
function rota_projetos_criar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $c = limpar(corpo(), REGRAS_PROJETO);
    if (empty($c['nome'])) throw new ErroApi('Campo obrigatório: nome');
    if (!empty($c['gestor_id']) && !um('SELECT id FROM usuarios WHERE id = ? AND empresa_id = ?', [$c['gestor_id'], $u['empresa_id']])) throw new ErroApi('Gestor não encontrado', 404);
    if (!empty($c['codigo']) && um('SELECT id FROM projetos WHERE empresa_id = ? AND codigo = ?', [$u['empresa_id'], $c['codigo']])) throw new ErroApi('Já existe uma obra com este código', 409);
    $id = inserir('projetos', ['empresa_id' => $u['empresa_id']] + $c);
    registrar($u, (int)$u['empresa_id'], 'projetos', $id, 'criou', null, $c);
    return ['ok' => true, 'id' => $id];
}
function rota_projetos_alterar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $antes = obra_da_empresa($u, $id);
    $c = limpar(corpo(), REGRAS_PROJETO);
    if (array_key_exists('nome', $c) && empty($c['nome'])) throw new ErroApi('O nome não pode ficar vazio');
    if (!empty($c['gestor_id']) && !um('SELECT id FROM usuarios WHERE id = ? AND empresa_id = ?', [$c['gestor_id'], $u['empresa_id']])) throw new ErroApi('Gestor não encontrado', 404);
    atualizar('projetos', $id, $c);
    registrar($u, (int)$u['empresa_id'], 'projetos', $id, 'alterou', array_intersect_key($antes, $c), $c);
    return ['ok' => true];
}
function rota_projetos_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    obra_da_empresa($u, $id);
    q('UPDATE projetos SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'projetos', $id, 'excluiu');
    return ['ok' => true];
}
/** POST /api/projetos/{id}/membros {usuario_id, papel} */
function rota_membros_adicionar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    obra_da_empresa($u, $id);
    $d = corpo();
    $papel = $d['papel'] ?? '';
    if (!in_array($papel, ['gestor', 'encarregado', 'funcionario'], true)) throw new ErroApi('Papel inválido');
    $alvo = um('SELECT id FROM usuarios WHERE id = ? AND empresa_id = ?', [(int)($d['usuario_id'] ?? 0), $u['empresa_id']]);
    if (!$alvo) throw new ErroApi('Usuário não encontrado', 404);
    q('INSERT INTO projeto_membros (empresa_id, projeto_id, usuario_id, papel) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE papel = VALUES(papel)',
      [$u['empresa_id'], $id, $alvo['id'], $papel]);
    registrar($u, (int)$u['empresa_id'], 'projeto_membros', $id, 'alterou', null, ['usuario_id' => $alvo['id'], 'papel' => $papel]);
    return ['ok' => true];
}

/* ── Atividades ──────────────────────────────────────────────── */
const REGRAS_ATIVIDADE = [
    'projeto_id' => ['id'], 'pai_id' => ['id'], 'codigo_eap' => ['texto', 20], 'descricao' => ['texto', 255],
    'observacoes' => ['texto', 5000], 'responsavel_id' => ['id'], 'inicio' => ['data'], 'fim' => ['data'],
    'duracao_horas' => ['num', 0, 99999], 'avanco' => ['num', 0, 100],
    'situacao' => ['lista', ['Pendente', 'Em andamento', 'Concluído', 'Reprogramado']],
    'critica' => ['bool'], 'peso' => ['num', 0, 99999], 'ordem' => ['num', -1e9, 1e9],
];
/** O que cada perfil pode mudar numa atividade. */
const CAMPOS_POR_PERFIL = [
    'encarregado' => ['avanco', 'situacao', 'observacoes'],
    'funcionario' => ['avanco', 'situacao'],
];
function atividade_visivel(array $u, int $id): array {
    $a = um('SELECT * FROM atividades WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$a) throw new ErroApi('Atividade não encontrada', 404);
    if ($u['perfil'] === 'funcionario') {
        if ((int)$a['responsavel_id'] !== (int)$u['funcionario_id']) throw new ErroApi('Atividade não encontrada', 404);
    } else {
        $vis = obras_visiveis($u);
        if ($vis !== null && !in_array((int)$a['projeto_id'], $vis, true)) throw new ErroApi('Atividade não encontrada', 404);
    }
    return $a;
}
function validar_ligacoes_atividade(array $u, array $c): void {
    if (!empty($c['projeto_id'])) obra_da_empresa($u, (int)$c['projeto_id']);
    if (!empty($c['responsavel_id']) && !um('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ?', [$c['responsavel_id'], $u['empresa_id']])) throw new ErroApi('Responsável não encontrado', 404);
    if (!empty($c['pai_id']) && !um('SELECT id FROM atividades WHERE id = ? AND empresa_id = ?', [$c['pai_id'], $u['empresa_id']])) throw new ErroApi('Etapa-mãe não encontrada', 404);
    if (!empty($c['inicio']) && !empty($c['fim']) && $c['fim'] < $c['inicio']) throw new ErroApi('O fim não pode ser antes do início');
}
function rota_atividades_listar(): array {
    $u = exigir_login();
    $sql = 'SELECT a.*, f.nome AS responsavel_nome FROM atividades a LEFT JOIN funcionarios f ON f.id = a.responsavel_id
            WHERE a.empresa_id = ? AND a.excluido_em IS NULL';
    $p = [$u['empresa_id']];
    if (isset($_GET['projeto_id'])) { $sql .= ' AND a.projeto_id = ?'; $p[] = (int)$_GET['projeto_id']; }
    if ($u['perfil'] === 'funcionario') { $sql .= ' AND a.responsavel_id = ?'; $p[] = (int)$u['funcionario_id']; }
    elseif (($vis = obras_visiveis($u)) !== null) {
        if (!$vis) return ['atividades' => []];
        $sql .= ' AND a.projeto_id IN (' . implode(',', array_fill(0, count($vis), '?')) . ')'; $p = array_merge($p, $vis);
    }
    return ['atividades' => todos($sql . ' ORDER BY a.projeto_id, a.ordem, a.inicio', $p)];
}
function rota_atividades_criar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $c = limpar(corpo(), REGRAS_ATIVIDADE);
    if (empty($c['projeto_id'])) throw new ErroApi('Campo obrigatório: projeto_id');
    if (empty($c['descricao'])) throw new ErroApi('Campo obrigatório: descricao');
    validar_ligacoes_atividade($u, $c);
    $id = inserir('atividades', ['empresa_id' => $u['empresa_id']] + $c);
    registrar($u, (int)$u['empresa_id'], 'atividades', $id, 'criou', null, $c);
    return ['ok' => true, 'id' => $id];
}
function rota_atividades_alterar(int $id): array {
    $u = exigir_login();
    $antes = atividade_visivel($u, $id);
    $d = corpo();
    if (!in_array($u['perfil'], PODE_TUDO, true)) {
        $permitidos = CAMPOS_POR_PERFIL[$u['perfil']] ?? [];
        $extra = array_diff(array_keys($d), $permitidos);
        if ($extra) throw new ErroApi('Seu perfil só pode alterar: ' . implode(', ', $permitidos), 403);
    }
    $c = limpar($d, REGRAS_ATIVIDADE);
    validar_ligacoes_atividade($u, $c + ['inicio' => $antes['inicio'], 'fim' => $antes['fim']]);
    atualizar('atividades', $id, $c);
    registrar($u, (int)$u['empresa_id'], 'atividades', $id, 'alterou', array_intersect_key($antes, $c), $c);
    return ['ok' => true];
}
function rota_atividades_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    atividade_visivel($u, $id);
    q('UPDATE atividades SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'atividades', $id, 'excluiu');
    return ['ok' => true];
}

/* ── Equipe ──────────────────────────────────────────────────── */
const REGRAS_FUNCIONARIO = [
    'nome' => ['texto', 160], 'apelido' => ['texto', 160], 'cargo' => ['texto', 80], 'equipe' => ['texto', 80],
    'tipo_trabalho' => ['lista', ['campo', 'escritorio', 'ambos']], 'encarregado_id' => ['id'],
    'telefone' => ['texto', 30], 'email' => ['texto', 190], 'custo_hora' => ['num', 0, 1e6], 'ativo' => ['bool'],
];
function rota_funcionarios_listar(): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']);
    $cols = 'id, nome, apelido, cargo, equipe, tipo_trabalho, encarregado_id, telefone, email, ativo';
    if (in_array($u['perfil'], PODE_TUDO, true)) $cols .= ', custo_hora';   // custo só para quem gere
    return ['funcionarios' => todos("SELECT $cols FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL ORDER BY nome", [$u['empresa_id']])];
}
function rota_funcionarios_criar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $c = limpar(corpo(), REGRAS_FUNCIONARIO);
    if (empty($c['nome'])) throw new ErroApi('Campo obrigatório: nome');
    if (!empty($c['encarregado_id']) && !um('SELECT id FROM funcionarios WHERE id = ? AND empresa_id = ?', [$c['encarregado_id'], $u['empresa_id']])) throw new ErroApi('Encarregado não encontrado', 404);
    $id = inserir('funcionarios', ['empresa_id' => $u['empresa_id']] + $c);
    registrar($u, (int)$u['empresa_id'], 'funcionarios', $id, 'criou', null, $c);
    return ['ok' => true, 'id' => $id];
}
