<?php
/* Task Flow · servidor · tela "Histórico": linha do tempo de quem mudou o quê, em português, com filtros por obra, pessoa,
   tipo e período, "antes → depois" dos campos e Excel. Segue o plano (Essencial 30 dias, Profissional 1 ano). A gestão vê
   tudo; o encarregado, só o que é das obras dele. */
declare(strict_types=1);

const HIST_DIAS_PLANO = ['teste' => 365, 'essencial' => 30, 'profissional' => 365, 'empresa' => null, 'corporativo' => null];
const HIST_TIPOS = ['av' => 'Avanços e Travou', 'crono' => 'Cronograma', 'rdo' => 'RDO e relatórios', 'eq' => 'Equipe e SST', 'rec' => 'Recursos', 'usu' => 'Usuários e empresa'];
const HIST_CAMPOS = ['descricao' => 'Nome', 'inicio' => 'Início', 'fim' => 'Fim', 'duracao_dias' => 'Duração', 'avanco' => 'Avanço', 'situacao' => 'Situação', 'responsavel_id' => 'Responsável',
    'pai_id' => 'Etapa', 'observacoes' => 'Observações', 'peso' => 'Peso', 'codigo' => 'Código', 'nome' => 'Nome', 'cliente' => 'Cliente', 'local_obra' => 'Local', 'numero_contrato' => 'Contrato',
    'gestor_id' => 'Gestor', 'valor_contrato' => 'Valor do contrato', 'cargo' => 'Cargo', 'telefone' => 'Telefone', 'email' => 'E-mail', 'perfil' => 'Perfil', 'tipo' => 'Tipo', 'modelo' => 'Modelo',
    'propriedade' => 'Propriedade', 'custo' => 'Custo', 'custo_unidade' => 'Custo por', 'razao_social' => 'Razão social', 'cnpj' => 'CNPJ', 'endereco' => 'Endereço', 'cidade' => 'Cidade', 'uf' => 'UF',
    'email_contato' => 'E-mail de contato', 'site' => 'Site', 'plano' => 'Plano', 'critica' => 'Crítica', 'calendario_id' => 'Calendário', 'equipe' => 'Equipe', 'apelido' => 'Apelido',
    'encarregado_id' => 'Encarregado', 'custo_hora' => 'Custo por hora', 'ativo' => 'Ativo', 'cor' => 'Cor', 'tipo_servico' => 'Tipo de serviço', 'art_numero' => 'ART', 'clima_manha' => 'Clima (manhã)',
    'clima_tarde' => 'Clima (tarde)', 'terceiros' => 'Terceiros', 'observacoes_rdo' => 'Observações', 'folga_dias' => 'Folga'];
const HIST_REGRAS = ['foto' => 'Foto obrigatória', 'comentario_concluir' => 'Comentário ao concluir', 'travou_email' => 'Travou por e-mail', 'rdo_prazo' => 'Prazo do RDO', 'rdo_lembrete' => 'Lembrete do RDO', 'rdo_assinatura' => 'Assinatura do cliente'];
const HIST_PERFIL = ['administrador' => 'administrador', 'gestor' => 'gestor', 'encarregado' => 'encarregado', 'funcionario' => 'funcionário'];

function hist_hoje(): string { return gmdate('Y-m-d', time() - 3 * 3600); }
function hist_br(?string $d): string { return $d && preg_match('/^\d{4}-\d{2}-\d{2}/', $d) ? substr($d, 8, 2) . '/' . substr($d, 5, 2) . (substr($d, 0, 4) !== substr(hist_hoje(), 0, 4) ? '/' . substr($d, 0, 4) : '') : (string)$d; }

/** Limite do plano (null = sem limite) e de quando a tela mostra. */
function hist_limite(int $eid): array {
    $pl = (string)(um('SELECT plano FROM empresas WHERE id = ?', [$eid])['plano'] ?? 'teste');
    $dias = array_key_exists($pl, HIST_DIAS_PLANO) ? HIST_DIAS_PLANO[$pl] : 365;
    return [$dias, $dias ? Calendario::mais(hist_hoje(), -$dias) : null, (TF_PLANOS[$pl]['nome'] ?? 'Teste grátis')];
}

/** Monta o SELECT com obra, tipo e nome do alvo de cada linha (para filtrar e buscar no banco). */
function hist_sql(): string {
    return "SELECT * FROM (SELECT h.id, h.usuario_id, h.tabela, h.registro_id, h.acao, h.antes, h.depois, h.quando, u.nome AS usuario,
        CASE h.tabela WHEN 'projetos' THEN h.registro_id WHEN 'projeto_membros' THEN h.registro_id
            WHEN 'atividades' THEN (SELECT a.projeto_id FROM atividades a WHERE a.id = h.registro_id)
            WHEN 'rdos' THEN (SELECT r.projeto_id FROM rdos r WHERE r.id = h.registro_id)
            WHEN 'relatorios' THEN (SELECT r.projeto_id FROM relatorios r WHERE r.id = h.registro_id)
            WHEN 'linhas_base' THEN (SELECT l.projeto_id FROM linhas_base l WHERE l.id = h.registro_id)
            WHEN 'dependencias' THEN (SELECT a.projeto_id FROM dependencias d JOIN atividades a ON a.id = d.depois_id WHERE d.id = h.registro_id) END AS obra_id,
        CASE WHEN h.tabela = 'atividades' AND (h.depois LIKE '%%\"avanco\"%%' OR h.depois LIKE '%%\"travou\"%%' OR h.depois LIKE '%%\"liberou\"%%') THEN 'av'
             WHEN h.tabela IN ('atividades','projetos','dependencias','linhas_base','projeto_membros','calendarios','modelos') THEN 'crono'
             WHEN h.tabela IN ('rdos','relatorios') THEN 'rdo'
             WHEN h.tabela IN ('funcionarios','ausencias','documentos','exigencias_documento','tipos_documento') THEN 'eq'
             WHEN h.tabela IN ('recursos','locacoes','fornecedores') THEN 'rec' ELSE 'usu' END AS cat,
        CASE h.tabela WHEN 'atividades' THEN (SELECT a.descricao FROM atividades a WHERE a.id = h.registro_id)
            WHEN 'projetos' THEN (SELECT CONCAT_WS(' ', p.codigo, p.nome) FROM projetos p WHERE p.id = h.registro_id)
            WHEN 'recursos' THEN (SELECT CONCAT_WS(' ', r.codigo, r.nome) FROM recursos r WHERE r.id = h.registro_id)
            WHEN 'funcionarios' THEN (SELECT f.nome FROM funcionarios f WHERE f.id = h.registro_id)
            WHEN 'ausencias' THEN (SELECT f.nome FROM funcionarios f WHERE f.id = h.registro_id)
            WHEN 'usuarios' THEN (SELECT x.nome FROM usuarios x WHERE x.id = h.registro_id)
            WHEN 'rdos' THEN (SELECT CONCAT('RDO nº ', COALESCE(r.numero, '')) FROM rdos r WHERE r.id = h.registro_id)
            WHEN 'relatorios' THEN (SELECT r.referencia FROM relatorios r WHERE r.id = h.registro_id) END AS alvo
        FROM historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.empresa_id = ? AND h.acao <> 'entrou' AND h.tabela <> 'fale_conosco' %s) x WHERE 1 %s";
}
/** Filtros vindos da tela: obra, pessoa, tipo, de, ate, q. */
function hist_filtros(array $u): array {
    $eid = (int)$u['empresa_id']; [$dias, $desde, $plano] = hist_limite($eid);
    $in = []; $pIn = [$eid]; $out = []; $pOut = [];
    $de = data_ok((string)($_GET['de'] ?? ''), 'de'); $ate = data_ok((string)($_GET['ate'] ?? ''), 'até');
    if ($desde && (!$de || $de < $desde)) $de = $desde;
    if ($de) { $in[] = 'h.quando >= ?'; $pIn[] = gmdate('Y-m-d H:i:s', strtotime("$de 03:00:00 UTC")); }
    if ($ate) { $in[] = 'h.quando < ?'; $pIn[] = gmdate('Y-m-d H:i:s', strtotime("$ate 03:00:00 UTC") + 86400); }
    if (!empty($_GET['pessoa'])) { $in[] = 'h.usuario_id = ?'; $pIn[] = (int)$_GET['pessoa']; }
    $vis = obras_visiveis($u);
    if ($vis !== null) $out[] = $vis ? 'x.obra_id IN (' . implode(',', array_map('intval', $vis)) . ')' : '0';
    if (!empty($_GET['obra'])) { $out[] = 'x.obra_id = ?'; $pOut[] = (int)$_GET['obra']; }
    if (!empty($_GET['tipo']) && isset(HIST_TIPOS[$_GET['tipo']])) { $out[] = 'x.cat = ?'; $pOut[] = $_GET['tipo']; }
    $q = trim((string)($_GET['q'] ?? ''));
    if ($q !== '') { $out[] = "CONCAT_WS(' ', x.usuario, x.alvo, x.antes, x.depois) LIKE ?"; $pOut[] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], mb_substr($q, 0, 80)) . '%'; }
    $sql = sprintf(hist_sql(), $in ? ' AND ' . implode(' AND ', $in) : '', $out ? ' AND ' . implode(' AND ', $out) : '');
    return [$sql, array_merge($pIn, $pOut), $dias, $desde, $plano, $de, $ate];
}

/* ── texto em português ───────────────────────────────────────── */
function hist_nomes(array $L): array {
    $ids = ['f' => [], 'a' => [], 'u' => [], 'c' => []];
    foreach ($L as $h) foreach ([$h['antes'], $h['depois']] as $j) {
        $d = json_decode((string)$j, true) ?: [];
        foreach (['responsavel_id', 'encarregado_id'] as $k) if (!empty($d[$k])) $ids['f'][] = (int)$d[$k];
        foreach (['pai_id', 'antes_id', 'depois_id'] as $k) if (!empty($d[$k])) $ids['a'][] = (int)$d[$k];
        foreach (['gestor_id', 'usuario_id'] as $k) if (!empty($d[$k])) $ids['u'][] = (int)$d[$k];
        if (!empty($d['calendario_id'])) $ids['c'][] = (int)$d['calendario_id'];
    }
    $m = fn($sql, $ids) => $ids ? array_column(todos(sprintf($sql, implode(',', array_unique($ids)))), 'nome', 'id') : [];
    return ['f' => $m('SELECT id, nome FROM funcionarios WHERE id IN (%s)', $ids['f']), 'a' => $m('SELECT id, descricao AS nome FROM atividades WHERE id IN (%s)', $ids['a']),
            'u' => $m('SELECT id, nome FROM usuarios WHERE id IN (%s)', $ids['u']), 'c' => $m('SELECT id, nome FROM calendarios WHERE id IN (%s)', $ids['c'])];
}
function hist_valor(string $k, $v, array $N): string {
    if ($v === null || $v === '') return '—';
    if (is_bool($v)) return $v ? 'sim' : 'não';
    if (is_array($v)) return implode(', ', array_map(fn($x) => is_array($x) ? json_encode($x, JSON_UNESCAPED_UNICODE) : (string)$x, $v));
    return match (true) {
        $k === 'avanco' => (int)$v . '%',
        $k === 'duracao_dias' => rtrim(rtrim(number_format((float)$v, 1, ',', ''), '0'), ',') . ' d',
        $k === 'folga_dias' => (int)$v . ' d',
        in_array($k, ['responsavel_id', 'encarregado_id'], true) => $N['f'][(int)$v] ?? 'pessoa nº ' . $v,
        $k === 'pai_id' => $N['a'][(int)$v] ?? 'etapa nº ' . $v,
        in_array($k, ['gestor_id', 'usuario_id'], true) => $N['u'][(int)$v] ?? 'usuário nº ' . $v,
        $k === 'calendario_id' => $N['c'][(int)$v] ?? 'calendário nº ' . $v,
        $k === 'perfil' => HIST_PERFIL[$v] ?? (string)$v,
        in_array($k, ['custo', 'valor_contrato', 'custo_hora'], true) => 'R$ ' . number_format((float)$v, 2, ',', '.'),
        is_string($v) && (bool)preg_match('/^\d{4}-\d{2}-\d{2}( |$)/', $v) => hist_br($v),
        default => mb_strimwidth((string)$v, 0, 120, '…'),
    };
}
function hist_detalhes(array $a, array $d, array $N, array $pular = []): array {
    $out = [];
    foreach ($d as $k => $v) {
        if (in_array($k, $pular, true) || in_array($k, ['fotos', 'projeto_id', 'id', 'empresa_id', 'ordem', 'id_antigo', 'atualizado_em'], true)) continue;
        if (array_key_exists($k, $a) && hist_valor($k, $a[$k], $N) === hist_valor($k, $v, $N)) continue;
        $out[] = ['campo' => HIST_CAMPOS[$k] ?? ucfirst(str_replace('_', ' ', $k)), 'antes' => array_key_exists($k, $a) ? hist_valor($k, $a[$k], $N) : null, 'depois' => hist_valor($k, $v, $N)];
    }
    return $out;
}
/** [texto, sub, detalhes, link] de uma linha do histórico. */
function hist_texto(array $h, array $N): array {
    $a = json_decode((string)$h['antes'], true) ?: []; $d = json_decode((string)$h['depois'], true) ?: [];
    $alvo = $h['alvo'] ?: ($d['nome'] ?? $a['nome'] ?? $d['descricao'] ?? ''); $T = $h['tabela']; $ac = $h['acao'];
    $q = fn($s) => '“' . $s . '”';
    $obra = $h['obra_id'] ? (int)$h['obra_id'] : null; $sub = ''; $det = []; $link = null;
    switch ($T) {
        case 'atividades':
            $link = ['tipo' => 'atividade', 'id' => (int)$h['registro_id'], 'obra_id' => $obra];
            if ($ac === 'criou') { $t = "criou a atividade {$q($alvo)}"; $sub = trim(($d['inicio'] ?? null ? 'início ' . hist_br($d['inicio']) : '') . (isset($d['duracao_dias']) ? ' · ' . hist_valor('duracao_dias', $d['duracao_dias'], $N) : ''), ' ·'); }
            elseif ($ac === 'excluiu') $t = "excluiu a atividade {$q($alvo)}";
            elseif (isset($d['travou'])) { $t = "informou que {$q($alvo)} travou: {$d['travou']}"; $sub = $d['descricao'] ?? ''; }
            elseif (isset($d['liberou'])) { $t = "liberou {$q($alvo)}" . (isset($a['travou']) ? " (estava: {$a['travou']})" : ''); }
            elseif (array_key_exists('avanco', $d) && count(array_diff(array_keys($d), ['avanco', 'situacao', 'fotos'])) === 0) {
                $t = "atualizou {$q($alvo)} de " . (int)($a['avanco'] ?? 0) . '% para ' . (int)$d['avanco'] . '%' . ((int)$d['avanco'] >= 100 && (int)($a['avanco'] ?? 0) < 100 ? ' (concluída)' : '');
                $sub = !empty($d['fotos']) ? 'com ' . (int)$d['fotos'] . ' foto' . ((int)$d['fotos'] > 1 ? 's' : '') : ''; }
            elseif (isset($d['recursos'])) { $t = isset($d['reservou_com_pendencias']) ? "reservou {$d['recursos']} em {$q($alvo)} mesmo com pendências" : "mudou os recursos de {$q($alvo)}"; $sub = isset($d['reservou_com_pendencias']) ? $d['reservou_com_pendencias'] : 'agora: ' . $d['recursos']; }
            elseif (isset($d['documentos_exigidos'])) { $t = "mudou os documentos exigidos em {$q($alvo)}"; $sub = $d['documentos_exigidos'] . ' documento' . ($d['documentos_exigidos'] == 1 ? '' : 's'); }
            elseif (isset($d['alocou_com_pendencias'])) { $t = "alocou o responsável de {$q($alvo)} mesmo com pendências"; $sub = (string)$d['alocou_com_pendencias']; }
            else { $t = "mudou {$q($alvo)}"; $det = hist_detalhes($a, $d, $N); }
            break;
        case 'projetos':
            $link = ['tipo' => 'obra', 'id' => (int)$h['registro_id']];
            $t = match ($ac) { 'criou' => "criou a obra {$q($alvo)}", 'excluiu' => "excluiu a obra {$q($alvo)}", 'importou' => "importou o cronograma da obra {$q($alvo)}", default => "mudou a obra {$q($alvo)}" };
            if ($ac === 'importou') $sub = trim((isset($d['arquivo']) ? $d['arquivo'] . ' · ' : '') . (isset($d['atividades']) ? $d['atividades'] . ' atividades' : '') . (!empty($d['ligacoes']) ? ' · ' . $d['ligacoes'] . ' ligações' : '') . (!empty($d['substituiu']) ? ' · substituiu o anterior' : ''), ' ·');
            elseif ($ac === 'alterou') $det = hist_detalhes($a, $d, $N);
            break;
        case 'dependencias':
            $t = $ac === 'criou' ? 'ligou ' . $q($N['a'][(int)($d['antes_id'] ?? 0)] ?? 'atividade') . ' → ' . $q($N['a'][(int)($d['depois_id'] ?? 0)] ?? 'atividade') : 'tirou uma ligação entre atividades';
            if ($ac === 'criou') $sub = ['TC' => 'término → começo', 'CC' => 'começo → começo', 'TT' => 'término → término', 'CT' => 'começo → término'][$d['tipo'] ?? 'TC'] . (!empty($d['folga_dias']) ? ' · folga ' . (int)$d['folga_dias'] . ' d' : '');
            if ($obra) $link = ['tipo' => 'obra', 'id' => $obra];
            break;
        case 'linhas_base': $t = 'salvou a linha de base nº ' . (int)($d['numero'] ?? 0); $sub = $d['motivo'] ?? ''; if ($obra) $link = ['tipo' => 'obra', 'id' => $obra]; break;
        case 'projeto_membros': $t = $ac === 'excluiu' ? 'tirou ' . ($N['u'][(int)($a['usuario_id'] ?? 0)] ?? 'alguém') . ' da obra' : 'pôs ' . ($N['u'][(int)($d['usuario_id'] ?? 0)] ?? 'alguém') . ' na obra como ' . ($d['papel'] ?? 'membro'); $link = ['tipo' => 'obra', 'id' => (int)$h['registro_id']]; break;
        case 'calendarios':
            $t = !empty($d['padrao']) ? 'mudou o calendário padrão da empresa' : ($ac === 'criou' ? 'criou o calendário ' . $q($d['nome'] ?? '') : 'mudou um calendário de trabalho');
            if (!empty($d['padrao'])) $sub = (isset($d['horas_semana']) ? 'horas ' . implode('/', json_decode($d['horas_semana'], true) ?: []) : '') . (isset($d['atividades']) ? ' · ' . $d['atividades'] . ' atividades recalculadas' : '');
            $link = ['tipo' => 'empresa', 'aba' => 'calendario']; break;
        case 'rdos':
            $link = ['tipo' => 'rdo', 'id' => (int)$h['registro_id']]; $r = $alvo ?: 'RDO';
            if ($ac === 'criou') { $t = "abriu o $r"; $sub = isset($d['data']) ? 'dia ' . hist_br($d['data']) : ''; }
            elseif ($ac === 'excluiu') $t = "excluiu o $r";
            elseif (isset($d['situacao'])) { $t = ['Fechado' => "fechou o $r", 'Entregue' => "entregou o $r ao cliente", 'Assinado' => "anexou a folha assinada do $r", 'Rascunho' => "reabriu o $r"][$d['situacao']] ?? "mudou o $r";
                $sub = isset($d['codigo']) ? 'código de conferência ' . $d['codigo'] : (isset($d['assinante']) ? 'assinado por ' . $d['assinante'] : ''); }
            elseif (isset($d['enviado_ao_gestor'])) $t = "enviou o $r ao gestor";
            else { $t = "mudou o $r"; $det = hist_detalhes($a, $d, $N, ['presencas']); }
            break;
        case 'relatorios': $t = $ac === 'criou' ? 'emitiu o relatório ' . ($d['referencia'] ?? $alvo) : 'excluiu o relatório ' . ($a['referencia'] ?? $alvo); $sub = $d['periodo'] ?? ''; $link = $ac === 'criou' ? ['tipo' => 'relatorio', 'id' => (int)$h['registro_id']] : null; break;
        case 'funcionarios':
            $link = ['tipo' => 'pessoa', 'id' => (int)$h['registro_id']];
            if ($ac === 'criou') $t = "cadastrou {$q($alvo)} na Equipe";
            elseif ($ac === 'excluiu') $t = "tirou {$q($alvo)} da Equipe";
            elseif (isset($d['documento'])) { $t = "lançou o certificado {$d['documento']} de $alvo"; $sub = isset($d['emissao']) ? 'emitido em ' . hist_br($d['emissao']) . (!empty($d['certificado']) ? ' · com arquivo' : '') : ''; }
            elseif (isset($d['documento_excluido'])) $t = "excluiu um documento de $alvo";
            else { $t = "mudou a ficha de $alvo"; $det = hist_detalhes($a, $d, $N); }
            break;
        case 'ausencias': $t = "mudou as ausências de $alvo"; $sub = is_array($d) && $d ? implode('; ', array_map(fn($x) => ($x['tipo'] ?? 'Ausência') . ' ' . hist_br($x['inicio'] ?? '') . ' a ' . hist_br($x['fim'] ?? ''), array_slice(array_values(array_filter($d, 'is_array')), 0, 3))) : 'sem ausências'; $link = ['tipo' => 'pessoa', 'id' => (int)$h['registro_id']]; break;
        case 'recursos':
            $link = ['tipo' => 'recurso', 'id' => (int)$h['registro_id']];
            if ($ac === 'criou') { $t = "cadastrou o recurso {$q($alvo)}"; $sub = trim(($d['propriedade'] ?? '') === 'alugado' ? 'alugado' : 'próprio'); }
            elseif ($ac === 'excluiu') $t = "excluiu o recurso {$q($alvo)}";
            elseif (isset($d['controle'])) { $t = "lançou {$d['controle']} em {$q($alvo)}"; $sub = isset($d['vence_em']) && $d['vence_em'] ? 'vence em ' . hist_br($d['vence_em']) : ''; }
            elseif (isset($d['parada'])) { $t = "parou {$q($alvo)} para manutenção ({$d['parada']})"; $sub = $d['motivo'] ?? ''; }
            elseif (isset($d['controle_excluido'])) $t = "excluiu um lançamento de calibração/manutenção de {$q($alvo)}";
            elseif (isset($d['parada_excluida'])) $t = "tirou uma parada de manutenção de {$q($alvo)}";
            elseif (isset($d['locacao'])) { $t = !empty($d['devolvido_em']) ? "registrou a devolução de {$q($alvo)}" : (count($d) === 1 ? "registrou a locação de {$q($alvo)}" : "mudou a locação de {$q($alvo)}"); $det = hist_detalhes($a, $d, $N, ['locacao']); }
            else { $t = "mudou o recurso {$q($alvo)}"; $det = hist_detalhes($a, $d, $N); }
            break;
        case 'usuarios':
            $link = ['tipo' => 'empresa', 'aba' => 'usuarios'];
            $nome = $alvo ?: ($d['nome'] ?? 'usuário');
            if ($ac === 'criou') $t = "entrou no sistema pelo convite como " . (HIST_PERFIL[$d['perfil'] ?? ''] ?? 'usuário');
            elseif (isset($d['situacao'])) $t = ($d['situacao'] === 'desativado' ? 'desativou o acesso de ' : 'reativou o acesso de ') . ($d['nome'] ?? $nome);
            elseif (isset($d['perfil'])) $t = "mudou o perfil de $nome de " . (HIST_PERFIL[$a['perfil'] ?? ''] ?? '—') . ' para ' . (HIST_PERFIL[$d['perfil']] ?? $d['perfil']);
            elseif (isset($d['link_senha'])) $t = 'gerou um link de nova senha para ' . ($d['nome'] ?? $nome);
            elseif (isset($d['senha'])) $t = 'criou uma nova senha';
            else { $t = "mudou o usuário $nome"; $det = hist_detalhes($a, $d, $N); }
            break;
        case 'convites':
            $link = ['tipo' => 'empresa', 'aba' => 'usuarios'];
            $nome = $d['nome'] ?? $a['nome'] ?? 'alguém';
            if ($ac === 'criou') { $t = "convidou $nome como " . (HIST_PERFIL[$d['perfil'] ?? ''] ?? 'usuário'); $sub = ($d['canal'] ?? '') === 'whatsapp' ? 'link pelo WhatsApp' : 'por e-mail'; }
            elseif ($ac === 'excluiu') $t = "cancelou o convite de $nome";
            elseif (isset($d['reenviado'])) $t = "reenviou o convite de $nome" . ($d['reenviado'] === 'whatsapp' ? ' pelo WhatsApp' : ' por e-mail');
            else $t = 'mudou o perfil de um convite para ' . (HIST_PERFIL[$d['perfil'] ?? ''] ?? '—');
            break;
        case 'empresas':
            $link = ['tipo' => 'empresa', 'aba' => 'empresa'];
            if ($ac === 'criou') $t = 'cadastrou a empresa ' . $q($d['nome'] ?? '');
            elseif ($ac === 'importou') $t = 'importou os dados antigos';
            elseif (isset($d['regras'])) { $t = 'mudou as regras do campo'; $link['aba'] = 'regras';
                foreach ((array)$d['regras'] as $k => $v) $det[] = ['campo' => HIST_REGRAS[$k] ?? $k, 'antes' => isset($a['regras'][$k]) ? hist_regra($k, $a['regras'][$k]) : null, 'depois' => hist_regra($k, $v)]; }
            elseif (isset($d['plano'])) $t = 'mudou o plano para ' . (TF_PLANOS[$d['plano']]['nome'] ?? $d['plano']);
            elseif (isset($d['logo'])) $t = $d['logo'] === 'trocada' ? 'trocou a logo da empresa' : 'tirou a logo da empresa';
            elseif (isset($d['situacao'])) $t = $d['situacao'] === 'suspenso' ? 'suspendeu o acesso da empresa' : 'reativou o acesso da empresa';
            elseif (isset($d['cargo'])) { $t = "mudou os documentos exigidos do cargo {$d['cargo']}"; $sub = ($d['documentos_exigidos'] ?? 0) . ' documento(s)'; $link = ['tipo' => 'view', 'view' => 'pessoas']; }
            else { $t = 'mudou os dados da empresa'; $det = hist_detalhes($a, $d, $N); }
            break;
        default: $t = ['criou' => 'criou', 'excluiu' => 'excluiu', 'alterou' => 'alterou', 'importou' => 'importou'][$ac] ?? $ac; $t .= ' ' . str_replace('_', ' ', $T) . ($alvo ? ' ' . $q($alvo) : ''); $det = hist_detalhes($a, $d, $N);
    }
    return [$t, $sub, $det, $link];
}
function hist_regra(string $k, $v): string {
    if ($k === 'foto') return ['funcionario' => 'funcionário', 'campo' => 'funcionário e encarregado', 'todos' => 'todos', 'ninguem' => 'ninguém'][$v] ?? (string)$v;
    if ($k === 'rdo_prazo') return (int)$v === 1 ? 'dia útil seguinte' : (int)$v . ' dias úteis';
    return $v ? 'ligado' : 'desligado';
}
function hist_item(array $h, array $N, array $obras): array {
    [$t, $sub, $det, $link] = hist_texto($h, $N);
    $o = $h['obra_id'] ? ($obras[(int)$h['obra_id']] ?? null) : null;
    $ini = implode('', array_map(fn($p) => mb_substr($p, 0, 1), array_slice(preg_split('/\s+/', trim((string)($h['usuario'] ?: 'Sistema'))), 0, 2)));
    return ['id' => (int)$h['id'], 'quando' => gmdate('Y-m-d H:i:s', strtotime($h['quando'] . ' UTC') - 3 * 3600), 'usuario' => $h['usuario'] ?: 'Sistema', 'iniciais' => mb_strtoupper($ini), 'tipo' => $h['cat'],
            'texto' => $t, 'sub' => $sub, 'detalhes' => $det, 'obra' => $o ? ['id' => (int)$h['obra_id'], 'codigo' => $o] : null, 'link' => $link];
}

/** GET /api/historico?obra=&pessoa=&tipo=&de=&ate=&q=&pagina= */
function rota_historico(): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']); $eid = (int)$u['empresa_id'];
    [$sql, $p, $dias, $desde, $plano, $de, $ate] = hist_filtros($u);
    $pag = max(1, (int)($_GET['pagina'] ?? 1)); $por = 60;
    $L = todos($sql . ' ORDER BY x.id DESC LIMIT ' . ($por + 1) . ' OFFSET ' . (($pag - 1) * $por), $p);
    $mais = count($L) > $por; $L = array_slice($L, 0, $por);
    $obras = array_column(todos('SELECT id, COALESCE(codigo, nome) AS c FROM projetos WHERE empresa_id = ?', [$eid]), 'c', 'id');
    $N = hist_nomes($L);
    $tot = um(str_replace('SELECT * FROM', 'SELECT COUNT(*) AS n, COUNT(DISTINCT x.usuario_id) AS p FROM', $sql), $p);
    $rank = $pag === 1 ? todos(str_replace('SELECT * FROM', 'SELECT x.usuario, COUNT(*) AS n FROM', $sql) . ' AND x.usuario IS NOT NULL GROUP BY x.usuario_id, x.usuario ORDER BY n DESC LIMIT 5', $p) : [];
    $vis = obras_visiveis($u);
    return ['hoje' => hist_hoje(), 'limite_dias' => $dias, 'desde' => $desde, 'plano' => $plano, 'pagina' => $pag, 'mais' => $mais, 'total' => (int)$tot['n'], 'pessoas_no_periodo' => (int)$tot['p'],
            'ranking' => array_map(fn($r) => ['nome' => $r['usuario'], 'n' => (int)$r['n']], $rank), 'tipos' => HIST_TIPOS,
            'itens' => array_map(fn($h) => hist_item($h, $N, $obras), $L),
            'obras' => array_map(fn($o) => ['id' => (int)$o['id'], 'codigo' => $o['codigo'], 'nome' => $o['nome']], todos('SELECT id, codigo, nome FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL' . ($vis !== null ? ($vis ? ' AND id IN (' . implode(',', $vis) . ')' : ' AND 0') : '') . ' ORDER BY situacao = "Em andamento" DESC, codigo', [$eid])),
            'pessoas' => $u['perfil'] === 'encarregado' ? [] : array_map(fn($x) => ['id' => (int)$x['id'], 'nome' => $x['nome']], todos('SELECT id, nome FROM usuarios WHERE empresa_id = ? AND excluido_em IS NULL AND email_confirmado_em IS NOT NULL ORDER BY nome', [$eid]))];
}
/** GET /api/historico/excel — o que está filtrado (até 5.000 linhas). */
function rota_historico_excel(): array {
    $u = exigir_login(); exigir_perfil($u, ['administrador', 'gestor', 'encarregado']); $eid = (int)$u['empresa_id'];
    [$sql, $p] = hist_filtros($u);
    $L = todos($sql . ' ORDER BY x.id DESC LIMIT 5000', $p);
    $obras = array_column(todos('SELECT id, COALESCE(codigo, nome) AS c FROM projetos WHERE empresa_id = ?', [$eid]), 'c', 'id'); $N = hist_nomes($L);
    $linhas = [['Quando', 'Pessoa', 'Obra', 'Tipo', 'O que', 'Detalhe', 'Antes → depois']];
    foreach ($L as $h) { $i = hist_item($h, $N, $obras);
        $linhas[] = [substr($i['quando'], 8, 2) . '/' . substr($i['quando'], 5, 2) . '/' . substr($i['quando'], 0, 4) . ' ' . substr($i['quando'], 11, 5), $i['usuario'], $i['obra']['codigo'] ?? '', HIST_TIPOS[$i['tipo']] ?? '', $i['texto'], $i['sub'],
            implode('; ', array_map(fn($x) => $x['campo'] . ': ' . ($x['antes'] ?? '—') . ' → ' . $x['depois'], $i['detalhes']))]; }
    $bin = xlsx_gerar(['Histórico' => $linhas]);
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); header('Content-Length: ' . strlen($bin));
    header('Content-Disposition: attachment; filename="historico-' . hist_hoje() . '.xlsx"'); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff');
    echo $bin; exit;
}
