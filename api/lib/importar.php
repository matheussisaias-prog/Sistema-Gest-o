<?php
/* Aprumo · servidor · tela "Importar cronograma": arquivo do MS Project (.xml), Excel (.xlsx) ou CSV → prévia (atividades,
   etapas, ligações, responsáveis achados na Equipe) → obra nova ou obra que já existe (acrescenta ou substitui).
   A leitura dos arquivos é a mesma do "Montar cronograma" da obra (montar.php). */
declare(strict_types=1);

/** Lê o arquivo enviado: [linhas, info do projeto (nome, início, fim)]. */
function importar_ler(array $d): array {
    $f = (string)($d['formato'] ?? ''); $c = (string)($d['conteudo'] ?? '');
    if ($c === '') throw new ErroApi('Escolha o arquivo');
    if (strlen($c) > 8_000_000) throw new ErroApi('Arquivo grande demais (máximo de uns 6 MB)');
    $info = ['nome' => null, 'inicio' => null, 'fim' => null];
    switch ($f) {
        case 'mspdi':
            $linhas = mspdi_para_linhas($c);
            $prev = libxml_use_internal_errors(true); $sx = simplexml_load_string($c, 'SimpleXMLElement', LIBXML_NONET); libxml_use_internal_errors($prev);
            if ($sx) { $n = trim((string)($sx->Title ?? '')) ?: trim((string)($sx->Name ?? '')); $info['nome'] = $n !== '' ? preg_replace('/\.(xml|mpp)$/i', '', $n) : null;
                $info['inicio'] = preg_match('/^\d{4}-\d{2}-\d{2}/', (string)$sx->StartDate) ? substr((string)$sx->StartDate, 0, 10) : null;
                $info['fim'] = preg_match('/^\d{4}-\d{2}-\d{2}/', (string)$sx->FinishDate) ? substr((string)$sx->FinishDate, 0, 10) : null; }
            break;
        case 'xlsx': $linhas = matriz_para_linhas(ler_xlsx($c)); break;
        case 'csv':
            $pri = strtok($c, "\n") ?: ''; $sep = str_contains($pri, "\t") ? "\t" : (substr_count($pri, ';') >= substr_count($pri, ',') ? ';' : ',');
            if (!mb_check_encoding($c, 'UTF-8')) $c = mb_convert_encoding($c, 'UTF-8', 'Windows-1252');      // CSV salvo pelo Excel em português
            $linhas = matriz_para_linhas(array_map(fn($l) => str_getcsv($l, $sep), preg_split('/\r\n|\n|\r/', preg_replace('/^\xEF\xBB\xBF/', '', $c)))); break;
        default: throw new ErroApi('Formato não reconhecido: use MS Project (.xml), Excel (.xlsx) ou CSV');
    }
    if (!$linhas) throw new ErroApi('Não encontrei atividades no arquivo. Confira se a 1ª planilha tem a coluna "Atividade".');
    if (count($linhas) > 1500) throw new ErroApi('Arquivo grande demais: até 1500 atividades por vez');
    return [$linhas, $info];
}
function importar_nome_arquivo(array $d): ?string { $n = trim((string)($d['arquivo'] ?? '')); return $n !== '' ? mb_substr(basename(str_replace('\\', '/', $n)), 0, 120) : null; }

/** POST /api/importar/previa {formato, conteudo, arquivo} */
function rota_importar_previa(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id']; $d = corpo();
    [$linhas, $info] = importar_ler($d);
    [$itens, $deps] = linhas_para_estrutura($linhas, $eid);
    $pv = previa_estrutura($itens, $deps);
    // responsáveis: os nomes do arquivo achados (ou não) na Equipe
    $nomes = []; $porRef = [];
    foreach (array_values($linhas) as $i => $l) $porRef[$i + 1] = trim((string)($l['responsavel'] ?? ''));
    $etapa = []; foreach ($itens as $it) if ($it['pai_ref']) $etapa[$it['pai_ref']] = true;
    $L = [];
    foreach ($itens as $k => $it) {
        $n = $porRef[$it['ref']] ?? '';
        if ($n !== '') { $nomes[$n] = $nomes[$n] ?? ['nome' => $n, 'achado' => (bool)$it['responsavel_id'], 'atividades' => 0]; $nomes[$n]['atividades']++; }
        if ($k < 300) $L[] = ['descricao' => $it['descricao'], 'nivel' => $pv['previa'][$k]['nivel'], 'etapa' => !empty($etapa[$it['ref']]), 'duracao_dias' => $it['duracao_dias'],
            'inicio' => $it['inicio'], 'fim' => $it['fim'], 'responsavel' => $n ?: null, 'achado' => (bool)$it['responsavel_id']];
    }
    $datas = array_filter(array_merge(array_column($itens, 'inicio'), array_column($itens, 'fim')));
    $info['inicio'] = $info['inicio'] ?: ($datas ? min($datas) : null);
    $info['fim'] = $info['fim'] ?: ($datas ? max($datas) : null);
    if (!$info['nome']) { $a = importar_nome_arquivo($d); $info['nome'] = $a ? preg_replace('/\.(xml|xlsx|csv|txt)$/i', '', str_replace(['_', '-'], ' ', $a)) : null; }
    $resp = array_values($nomes);
    return ['info' => $info, 'atividades' => count($itens), 'etapas' => count($etapa), 'ligacoes' => count($deps),
            'responsaveis' => ['total' => count($resp), 'achados' => count(array_filter($resp, fn($x) => $x['achado'])), 'lista' => $resp], 'linhas' => $L, 'mais' => max(0, count($itens) - 300)];
}
/** POST /api/importar/obra {formato, conteudo, arquivo, destino: nova|existente, obra?: {codigo, nome, cliente, inicio}, projeto_id?, substituir?} */
function rota_importar_obra(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id']; $d = corpo();
    [$linhas, $info] = importar_ler($d);
    [$itens, $deps] = linhas_para_estrutura($linhas, $eid);
    if (!$itens) throw new ErroApi('Nada para importar');
    $datas = array_filter(array_column($itens, 'inicio')); $minArq = $datas ? min($datas) : null;
    $arq = importar_nome_arquivo($d);
    $destino = (string)($d['destino'] ?? 'nova');
    db()->beginTransaction();
    try {
        if ($destino === 'nova') {
            $o = is_array($d['obra'] ?? null) ? $d['obra'] : [];
            $nome = trim((string)($o['nome'] ?? '')); if ($nome === '') throw new ErroApi('Informe o nome da obra');
            $cod = trim((string)($o['codigo'] ?? '')) ?: null;
            if ($cod && um('SELECT id FROM projetos WHERE empresa_id = ? AND codigo = ? AND excluido_em IS NULL', [$eid, $cod])) throw new ErroApi('Já existe uma obra com este código', 409);
            $ini = data_ok((string)($o['inicio'] ?? ''), 'início') ?: ($minArq ?: gmdate('Y-m-d', time() - 3 * 3600));
            $c = ['empresa_id' => $eid, 'codigo' => $cod ? mb_substr($cod, 0, 30) : null, 'nome' => mb_substr($nome, 0, 200), 'cliente' => trim((string)($o['cliente'] ?? '')) !== '' ? mb_substr(trim((string)$o['cliente']), 0, 200) : null,
                  'situacao' => $ini > gmdate('Y-m-d', time() - 3 * 3600) ? 'Planejamento' : 'Em andamento', 'inicio' => $ini, 'gestor_id' => $u['id']];
            $pid = inserir('projetos', $c);
            registrar($u, $eid, 'projetos', $pid, 'criou', null, array_diff_key($c, ['empresa_id' => 1]) + ['via' => 'importar']);
            $substituir = false; $novo = true;
        } else {
            $p = obra_da_empresa($u, (int)($d['projeto_id'] ?? 0)); $pid = (int)$p['id'];
            $ini = data_ok((string)($d['inicio'] ?? ''), 'início') ?: ($minArq ?: ($p['inicio'] ?: gmdate('Y-m-d', time() - 3 * 3600)));
            $substituir = !empty($d['substituir']); $novo = false;
        }
        $desl = $minArq && $ini !== $minArq ? (int)round((strtotime("$ini 12:00:00 UTC") - strtotime("$minArq 12:00:00 UTC")) / 86400) : 0;
        $r = inserir_estrutura($u, $pid, $itens, $deps, $ini, $substituir, $desl, ['arquivo' => $arq, 'destino' => $novo ? 'nova' : ($substituir ? 'substituiu' : 'acrescentou')]);
        $f = um('SELECT MIN(inicio) AS i, MAX(fim) AS f FROM atividades WHERE projeto_id = ? AND excluido_em IS NULL', [$pid]);
        if ($novo) q('UPDATE projetos SET inicio = COALESCE(?, inicio), fim = ? WHERE id = ?', [$f['i'], $f['f'], $pid]);
        db()->commit();
    } catch (Throwable $e) { db()->rollBack(); throw $e; }
    return ['ok' => true, 'projeto_id' => $pid, 'nova' => $novo] + $r;
}
/** GET /api/importacoes — as últimas importações da empresa. */
function rota_importacoes(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $eid = (int)$u['empresa_id'];
    $L = todos("SELECT h.registro_id, h.depois, h.quando, u.nome AS usuario, p.codigo, p.nome, p.excluido_em FROM historico h LEFT JOIN usuarios u ON u.id = h.usuario_id
                LEFT JOIN projetos p ON p.id = h.registro_id WHERE h.empresa_id = ? AND h.tabela = 'projetos' AND h.acao = 'importou' ORDER BY h.id DESC LIMIT 20", [$eid]);
    return ['importacoes' => array_map(function ($h) { $d = json_decode((string)$h['depois'], true) ?: [];
        return ['projeto_id' => $h['excluido_em'] ? null : (int)$h['registro_id'], 'obra' => trim(($h['codigo'] ? $h['codigo'] . ' · ' : '') . ($h['nome'] ?? '')), 'arquivo' => $d['arquivo'] ?? null,
                'destino' => $d['destino'] ?? (!empty($d['substituiu']) ? 'substituiu' : 'acrescentou'), 'atividades' => (int)($d['atividades'] ?? 0), 'ligacoes' => (int)($d['ligacoes'] ?? 0),
                'usuario' => $h['usuario'], 'quando' => gmdate('Y-m-d H:i:s', strtotime($h['quando'] . ' UTC') - 3 * 3600)]; }, $L),
            'obras' => array_map(fn($o) => ['id' => (int)$o['id'], 'codigo' => $o['codigo'], 'nome' => $o['nome'], 'atividades' => (int)$o['n']],
                todos("SELECT p.id, p.codigo, p.nome, (SELECT COUNT(*) FROM atividades a WHERE a.projeto_id = p.id AND a.excluido_em IS NULL) AS n FROM projetos p WHERE p.empresa_id = ? AND p.excluido_em IS NULL AND p.situacao <> 'Arquivado' ORDER BY p.situacao = 'Em andamento' DESC, p.codigo", [$eid]))];
}
/** GET /api/importar/modelo — planilha modelo (.xlsx). */
function rota_importar_modelo(): array {
    exigir_login();
    $bin = xlsx_gerar(['Cronograma' => [['EAP', 'Atividade', 'Duração (dias úteis)', 'Início', 'Responsável', 'Predecessoras'],
        ['1', 'Mobilização', '', '', '', ''], ['1.1', 'Mobilização de equipe e canteiro', 3, '02/03/2027', 'Nome da pessoa (igual à Equipe)', ''],
        ['1.2', 'Integração NR-10 e NR-35', 1, '', '', '1.1'], ['2', 'Infraestrutura', '', '', '', ''], ['2.1', 'Base dos transformadores', 10, '', '', '1.2'],
        ['2.2', 'Eletrodutos e caixas de passagem', 14, '', '', '2.1CC+5'], ['3', 'Entrega', '', '', '', ''], ['3.1', 'Testes e comissionamento', 5, '', '', '2.2']]]);
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); header('Content-Length: ' . strlen($bin));
    header('Content-Disposition: attachment; filename="modelo-cronograma-aprumo.xlsx"'); header('Cache-Control: private, no-store');
    echo $bin; exit;
}
