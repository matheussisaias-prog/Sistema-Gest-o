<?php
/* Task Flow · servidor · montar o cronograma (modelos, copiar de outra obra, colar/importar Excel e MS Project) e exportar */
declare(strict_types=1);

/* ══ Modelos prontos do Task Flow (linhas: nível, descrição, duração em dias úteis, predecessoras pela linha, cargo) ══ */
const MODELOS_TASKFLOW = [
    'tf-subestacao' => ['nome' => 'Subestação abrigada 13,8 kV', 'tipo' => 'Elétrica', 'linhas' => [
        [0, 'Mobilização'], [1, 'Mobilização de equipe e canteiro', 3, '', 'encarregado'], [1, 'Integração e treinamentos (NR-10, NR-35)', 1, '2'],
        [1, 'Levantamento de campo e conferência do projeto', 3, '3', 'engenheir'],
        [0, 'Infraestrutura'], [1, 'Bases civis dos transformadores', 10, '4', 'encarregado'], [1, 'Eletrodutos, eletrocalhas e caixas de passagem', 12, '4CC+2', 'eletricista'],
        [1, 'Malha de aterramento', 8, '6'],
        [0, 'Montagem eletromecânica'], [1, 'Instalação dos transformadores', 5, '8', 'encarregado'], [1, 'Montagem do cubículo de média tensão', 8, '10CC+2'],
        [1, 'QGBT e alimentadores de baixa tensão', 10, '11'], [1, 'Cabos de média tensão e terminações', 4, '11'],
        [0, 'Comissionamento'], [1, 'Ensaios e testes (isolamento, relés de proteção)', 5, '12;13', 'engenheir'], [1, 'As built e ART de execução', 3, '15CC', 'engenheir'],
        [1, 'Energização', 0, '15']]],
    'tf-iluminacao' => ['nome' => 'Retrofit de iluminação industrial', 'tipo' => 'Elétrica', 'linhas' => [
        [0, 'Mobilização e levantamento'], [1, 'Levantamento das luminárias existentes', 2, '', 'engenheir'], [1, 'Integração NR-10 e NR-35', 1, '2'],
        [0, 'Retirada e infraestrutura'], [1, 'Desmontagem das luminárias antigas', 3, '3', 'eletricista'], [1, 'Eletrocalhas e perfilados', 4, '5CC+1'],
        [0, 'Instalação'], [1, 'Montagem das luminárias LED', 8, '6', 'eletricista'], [1, 'Circuitos e comandos', 6, '8CC+2'],
        [0, 'Comissionamento'], [1, 'Medição de iluminância', 2, '9', 'engenheir'], [1, 'Descarte das lâmpadas antigas e entrega', 1, '11']]],
    'tf-nr12' => ['nome' => 'Adequação NR-12 de linha de máquinas', 'tipo' => 'NR-12', 'linhas' => [
        [0, 'Diagnóstico'], [1, 'Inventário das máquinas e apreciação de riscos', 5, '', 'engenheir'], [1, 'Relatório técnico e plano de ação', 3, '2', 'engenheir'],
        [1, 'Aprovação do cliente', 2, '3'],
        [0, 'Projeto e compras'], [1, 'Projeto das proteções e do sistema de segurança', 6, '4', 'engenheir'], [1, 'Compra dos componentes de segurança', 10, '6'],
        [0, 'Execução'], [1, 'Proteções fixas e móveis', 8, '7', 'encarregado'], [1, 'Circuitos de segurança (relés, emergência, intertravamentos)', 8, '7', 'eletricista'],
        [1, 'Sinalização e procedimentos', 3, '9'],
        [0, 'Validação'], [1, 'Testes das funções de segurança', 3, '9;10', 'engenheir'], [1, 'Treinamento dos operadores', 2, '13'], [1, 'Laudo final e ART', 3, '13', 'engenheir']]],
    'tf-spda' => ['nome' => 'SPDA e aterramento', 'tipo' => 'SPDA', 'linhas' => [
        [0, 'Preparação'], [1, 'Levantamento e projeto executivo', 4, '', 'engenheir'], [1, 'Integração NR-35', 1, '2'],
        [0, 'Execução'], [1, 'Subsistema de captação', 6, '3', 'encarregado'], [1, 'Descidas', 5, '5CC+2'], [1, 'Malha de aterramento e equipotencialização', 7, '3'],
        [0, 'Entrega'], [1, 'Medições de continuidade e resistência', 2, '6;7', 'engenheir'], [1, 'Relatório de inspeção e ART', 2, '9', 'engenheir']]],
    'tf-qgbt' => ['nome' => 'QGBT e alimentadores', 'tipo' => 'Elétrica', 'linhas' => [
        [0, 'Preparação'], [1, 'Conferência do projeto e dos materiais', 2, '', 'engenheir'], [1, 'Integração NR-10', 1, '2'],
        [0, 'Montagem'], [1, 'Fixação do QGBT', 2, '3', 'encarregado'], [1, 'Lançamento dos cabos alimentadores', 5, '5', 'eletricista'], [1, 'Conexões e identificação', 3, '6'],
        [0, 'Testes'], [1, 'Ensaio de isolamento e reaperto', 2, '7', 'engenheir'], [1, 'Energização', 0, '9']]],
];

/* ══ Núcleo: transformar linhas em atividades da obra ════════════ */
/** Linhas (nível, descrição, duração, início?, responsável?, predecessoras?) → itens e ligações por referência. */
function linhas_para_estrutura(array $linhas, int $eid, bool $porCargo = false): array {
    $equipe = todos('SELECT id, nome, cargo FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL', [$eid]);
    $norm = fn($s) => mb_strtolower(trim(preg_replace('/\s+/', ' ', strtr((string)$s, ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','é'=>'e','ê'=>'e','í'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ú'=>'u','ç'=>'c','Á'=>'a','É'=>'e','Í'=>'i','Ó'=>'o','Ú'=>'u','Ç'=>'c']))));
    $porNome = []; foreach ($equipe as $f) $porNome[$norm($f['nome'])] = (int)$f['id'];
    $itens = []; $deps = []; $pilha = []; $eapRef = []; $contador = [];
    foreach (array_values($linhas) as $i => $l) {
        $ref = $i + 1;
        $desc = trim((string)($l['descricao'] ?? ''));
        if ($desc === '') continue;
        $nivel = max(0, min(8, (int)($l['nivel'] ?? 0)));
        $nivel = min($nivel, count($pilha));               // não pula níveis
        $pilha = array_slice($pilha, 0, $nivel);
        $contador = array_slice($contador, 0, $nivel + 1); $contador[$nivel] = ($contador[$nivel] ?? 0) + 1;
        $eap = implode('.', array_slice($contador, 0, $nivel + 1)); $eapRef[$eap] = $ref;
        if (!empty($l['eap'])) $eapRef[trim((string)$l['eap'])] = $ref;
        $resp = null;
        if (!empty($l['responsavel'])) $resp = $porNome[$norm($l['responsavel'])] ?? null;
        if (!$resp && $porCargo && !empty($l['cargo'])) {
            $c = array_values(array_filter($equipe, fn($f) => str_contains($norm($f['cargo']), $norm($l['cargo']))));
            if (count($c) === 1) $resp = (int)$c[0]['id'];
        }
        $dur = isset($l['duracao']) && $l['duracao'] !== '' && $l['duracao'] !== null ? (float)str_replace(',', '.', preg_replace('/[^\d,.\-]/', '', (string)$l['duracao'])) : null;
        $itens[] = ['ref' => $ref, 'pai_ref' => $pilha ? end($pilha) : null, 'descricao' => mb_substr($desc, 0, 255), 'duracao_dias' => $dur,
                    'inicio' => !empty($l['inicio']) ? data_ok(normalizar_data((string)$l['inicio']), 'início da linha ' . $ref) : null,
                    'fim' => !empty($l['fim']) ? data_ok(normalizar_data((string)$l['fim']), 'fim da linha ' . $ref) : null,
                    'responsavel_id' => $resp, 'peso' => isset($l['peso']) && is_numeric($l['peso']) ? (float)$l['peso'] : 1.0];
        $pilha[] = $ref;
        foreach (preg_split('/[;,]+/', (string)($l['pred'] ?? '')) as $t) {
            $t = strtoupper(str_replace(' ', '', $t)); if ($t === '') continue;
            if (!preg_match('/^(\d+(?:\.\d+)*)(TC|CC|TT|CT|FS|SS|FF|SF|II|TI)?([+\-]\d+)?D?$/', $t, $m)) continue;
            $tipo = ['FS' => 'TC', 'SS' => 'CC', 'FF' => 'TT', 'SF' => 'CT', 'II' => 'CC', 'TI' => 'TC'][$m[2] ?? ''] ?? (($m[2] ?? '') ?: 'TC');
            $deps[] = ['antes' => $m[1], 'depois_ref' => $ref, 'tipo' => $tipo, 'folga' => (int)($m[3] ?? 0)];
        }
    }
    // predecessora: número com ponto = EAP; sem ponto = número da linha
    $refs = array_column($itens, 'ref');
    foreach ($deps as &$d) { $a = $d['antes']; $d['antes_ref'] = str_contains($a, '.') ? ($eapRef[$a] ?? null) : (in_array((int)$a, $refs, true) ? (int)$a : ($eapRef[$a] ?? null)); }
    unset($d);
    return [$itens, array_values(array_filter($deps, fn($d) => $d['antes_ref'] && $d['antes_ref'] !== $d['depois_ref']))];
}
function normalizar_data(string $s): string {
    $s = trim($s);
    if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{2,4})$#', $s, $m)) { $a = (int)$m[3]; if ($a < 100) $a += 2000; return sprintf('%04d-%02d-%02d', $a, $m[2], $m[1]); }
    if (preg_match('#^(\d{4}-\d{2}-\d{2})#', $s, $m)) return $m[1];
    if (is_numeric($s) && (float)$s > 20000 && (float)$s < 80000) return gmdate('Y-m-d', (int)round(((float)$s - 25569) * 86400));   // data do Excel
    return $s;
}

/** Grava itens e ligações na obra. $inicio vale para quem não trouxe data; $deslocar soma dias corridos às datas trazidas. */
function inserir_estrutura(array $u, int $pid, array $itens, array $deps, string $inicio, bool $substituir, int $deslocar = 0): array {
    $eid = (int)$u['empresa_id'];
    if (!$itens) throw new ErroApi('Nada para criar');
    if (count($itens) > 1500) throw new ErroApi('Arquivo grande demais: até 1500 atividades por vez');
    if ($substituir) {
        $ids = array_column(todos('SELECT id FROM atividades WHERE projeto_id = ? AND excluido_em IS NULL', [$pid]), 'id');
        if ($ids) { $in = implode(',', array_map('intval', $ids)); q("DELETE FROM dependencias WHERE antes_id IN ($in) OR depois_id IN ($in)"); q("UPDATE atividades SET excluido_em = UTC_TIMESTAMP() WHERE id IN ($in)"); }
    }
    $cal = calendario_da_obra($pid, $eid);
    $ordem = (int)(um('SELECT COALESCE(MAX(ordem), 0) m FROM atividades WHERE projeto_id = ? AND excluido_em IS NULL', [$pid])['m']) + 10;
    $temFilho = []; foreach ($itens as $it) if ($it['pai_ref']) $temFilho[$it['pai_ref']] = true;
    $id = [];
    foreach ($itens as $it) {
        $ini = $it['inicio'] ? Calendario::mais($it['inicio'], $deslocar) : $inicio;
        $c = ['empresa_id' => $eid, 'projeto_id' => $pid, 'pai_id' => $it['pai_ref'] ? ($id[$it['pai_ref']] ?? null) : null, 'descricao' => $it['descricao'],
              'responsavel_id' => $it['responsavel_id'], 'peso' => $it['peso'], 'ordem' => $ordem, 'avanco' => 0, 'situacao' => 'Pendente', 'inicio' => $ini];
        if (empty($temFilho[$it['ref']])) {
            if ($it['duracao_dias'] !== null) $c['duracao_dias'] = max(0, $it['duracao_dias']);
            elseif (!empty($it['fim'])) $c['fim'] = Calendario::mais($it['fim'], $deslocar);
            else $c['duracao_dias'] = 1;
            completar_datas($c, [], $cal);
        }
        $id[$it['ref']] = inserir('atividades', $c); $ordem += 10;
    }
    $lig = 0;
    foreach ($deps as $d) {
        $a = $id[$d['antes_ref']] ?? null; $b = $id[$d['depois_ref']] ?? null;
        if (!$a || !$b) continue;
        try { criar_dependencia($u, $a, $b, $d['tipo'], (int)$d['folga']); $lig++; } catch (ErroApi $e) { /* ciclo ou repetida: ignora */ }
    }
    $mov = recalcular_obra($pid, $eid);
    registrar($u, $eid, 'projetos', $pid, 'importou', null, ['atividades' => count($id), 'ligacoes' => $lig, 'substituiu' => $substituir]);
    return ['ok' => true, 'atividades' => count($id), 'ligacoes' => $lig, 'empurradas' => count($mov)];
}
function obra_para_montar(int $pid): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); $p = obra_da_empresa($u, $pid);
    return [$u, $p];
}
function inicio_pedido(array $d, array $p): string {
    $i = $d['inicio'] ?? null;
    return $i ? data_ok((string)$i, 'início') : ($p['inicio'] ?: gmdate('Y-m-d', time() - 3 * 3600));
}
function previa_estrutura(array $itens, array $deps): array {
    $filhos = []; foreach ($itens as $it) if ($it['pai_ref']) $filhos[$it['pai_ref']] = true;
    $nivel = []; foreach ($itens as $it) $nivel[$it['ref']] = $it['pai_ref'] ? ($nivel[$it['pai_ref']] ?? 0) + 1 : 0;
    return ['previa' => array_map(fn($it) => ['descricao' => $it['descricao'], 'nivel' => $nivel[$it['ref']], 'etapa' => !empty($filhos[$it['ref']]),
        'duracao_dias' => $it['duracao_dias'], 'inicio' => $it['inicio'], 'responsavel' => (bool)$it['responsavel_id']], $itens),
        'atividades' => count($itens), 'ligacoes' => count($deps)];
}

/* ══ Rotas: modelos ══════════════════════════════════════════════ */
/** GET /api/modelos — os do Task Flow e os da empresa. */
function rota_modelos_listar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $l = [];
    foreach (MODELOS_TASKFLOW as $k => $m) {
        $folhas = array_filter($m['linhas'], fn($x) => $x[0] > 0);
        $l[] = ['id' => $k, 'nome' => $m['nome'], 'tipo_servico' => $m['tipo'], 'origem' => 'Modelo Task Flow', 'atividades' => count($folhas),
                'linhas' => array_map(fn($x) => ['nivel' => $x[0], 'descricao' => $x[1], 'duracao' => $x[2] ?? null, 'pred' => $x[3] ?? '', 'cargo' => $x[4] ?? null], $m['linhas'])];
    }
    foreach (todos('SELECT m.id, m.nome, m.tipo_servico, m.linhas, us.nome AS autor, p.codigo FROM modelos_cronograma m LEFT JOIN usuarios us ON us.id = m.criado_por LEFT JOIN projetos p ON p.id = m.projeto_origem
                    WHERE m.empresa_id = ? AND m.excluido_em IS NULL ORDER BY m.nome', [$u['empresa_id']]) as $m) {
        $linhas = json_decode($m['linhas'], true) ?: [];
        $l[] = ['id' => (int)$m['id'], 'nome' => $m['nome'], 'tipo_servico' => $m['tipo_servico'], 'origem' => $m['codigo'] ? 'Criado da obra ' . $m['codigo'] : 'Da empresa',
                'atividades' => count(array_filter($linhas, fn($x) => empty($x['etapa']))), 'linhas' => $linhas];
    }
    return ['modelos' => $l];
}
function linhas_do_modelo(array $u, $mid): array {
    if (is_string($mid) && isset(MODELOS_TASKFLOW[$mid]))
        return array_map(fn($x) => ['nivel' => $x[0], 'descricao' => $x[1], 'duracao' => $x[2] ?? null, 'pred' => $x[3] ?? '', 'cargo' => $x[4] ?? null], MODELOS_TASKFLOW[$mid]['linhas']);
    $m = um('SELECT linhas FROM modelos_cronograma WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [(int)$mid, $u['empresa_id']]);
    if (!$m) throw new ErroApi('Modelo não encontrado', 404);
    return json_decode($m['linhas'], true) ?: [];
}
/** POST /api/obras/{id}/aplicar-modelo {modelo, inicio?, por_cargo?, substituir?, previa?} */
function rota_aplicar_modelo(int $pid): array {
    [$u, $p] = obra_para_montar($pid); $d = corpo();
    [$itens, $deps] = linhas_para_estrutura(linhas_do_modelo($u, $d['modelo'] ?? ''), (int)$u['empresa_id'], !empty($d['por_cargo']));
    if (!empty($d['previa'])) return previa_estrutura($itens, $deps);
    return inserir_estrutura($u, $pid, $itens, $deps, inicio_pedido($d, $p), !empty($d['substituir']));
}
/** Linhas de uma obra (para modelo ou cópia): nível, descrição, duração, predecessoras pela linha. */
function linhas_da_obra(int $pid, int $eid, ?array $soEtapas = null): array {
    $A = []; foreach (todos('SELECT a.id, a.pai_id, a.descricao, a.duracao_dias, a.inicio, a.fim, a.responsavel_id, f.nome AS resp, f.cargo, a.peso FROM atividades a LEFT JOIN funcionarios f ON f.id = a.responsavel_id
        WHERE a.projeto_id = ? AND a.empresa_id = ? AND a.excluido_em IS NULL ORDER BY a.ordem, a.id', [$pid, $eid]) as $a) $A[(int)$a['id']] = $a + ['_f' => []];
    foreach ($A as $id => $a) if ($a['pai_id'] && isset($A[(int)$a['pai_id']])) $A[(int)$a['pai_id']]['_f'][] = $id;
    $ordem = []; $nivel = [];
    $andar = function (array $ids, int $n) use (&$andar, &$A, &$ordem, &$nivel) { foreach ($ids as $id) { $ordem[] = $id; $nivel[$id] = $n; $andar($A[$id]['_f'], $n + 1); } };
    $raizes = array_keys(array_filter($A, fn($a) => !$a['pai_id'] || !isset($A[(int)$a['pai_id']])));
    if ($soEtapas) $raizes = array_values(array_intersect($raizes, $soEtapas));
    $andar($raizes, 0);
    $linha = array_flip($ordem);
    $preds = [];
    if ($ordem) foreach (todos('SELECT antes_id, depois_id, tipo, folga_dias FROM dependencias WHERE depois_id IN (' . implode(',', $ordem) . ')') as $d)
        if (isset($linha[(int)$d['antes_id']])) $preds[(int)$d['depois_id']][] = ($linha[(int)$d['antes_id']] + 1) . ($d['tipo'] !== 'TC' ? $d['tipo'] : '') . ((int)$d['folga_dias'] ? sprintf('%+d', $d['folga_dias']) : '');
    return array_map(fn($id) => ['nivel' => $nivel[$id], 'descricao' => $A[$id]['descricao'], 'etapa' => (bool)$A[$id]['_f'],
        'duracao' => $A[$id]['_f'] ? null : ($A[$id]['duracao_dias'] !== null ? (float)$A[$id]['duracao_dias'] : null), 'inicio' => $A[$id]['inicio'], 'fim' => $A[$id]['fim'],
        'responsavel' => $A[$id]['resp'], 'cargo' => $A[$id]['cargo'] ? mb_strtolower($A[$id]['cargo']) : null, 'peso' => (float)$A[$id]['peso'],
        'pred' => implode(';', $preds[$id] ?? [])], $ordem);
}
/** POST /api/obras/{id}/salvar-modelo {nome} — a obra vira modelo da empresa. */
function rota_salvar_modelo(int $pid): array {
    [$u, $p] = obra_para_montar($pid); $d = corpo();
    $nome = trim((string)($d['nome'] ?? '')); if ($nome === '') throw new ErroApi('Dê um nome ao modelo');
    $linhas = array_map(fn($l) => array_diff_key($l, ['inicio' => 1, 'fim' => 1, 'responsavel' => 1]), linhas_da_obra($pid, (int)$u['empresa_id']));
    if (!$linhas) throw new ErroApi('A obra não tem cronograma para virar modelo');
    $id = inserir('modelos_cronograma', ['empresa_id' => $u['empresa_id'], 'nome' => mb_substr($nome, 0, 120), 'tipo_servico' => $p['tipo_servico'] ?? null,
        'linhas' => json_encode($linhas, JSON_UNESCAPED_UNICODE), 'projeto_origem' => $pid, 'criado_por' => $u['id']]);
    return ['ok' => true, 'id' => $id];
}
/** DELETE /api/modelos/{id} */
function rota_modelos_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    if (!um('SELECT id FROM modelos_cronograma WHERE id = ? AND empresa_id = ?', [$id, $u['empresa_id']])) throw new ErroApi('Modelo não encontrado', 404);
    q('UPDATE modelos_cronograma SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    return ['ok' => true];
}

/* ══ Copiar de outra obra ════════════════════════════════════════ */
/** POST /api/obras/{id}/copiar {origem_id, etapas?: [ids], inicio?, substituir?, previa?} — datas deslocadas mantendo os intervalos. */
function rota_copiar_obra(int $pid): array {
    [$u, $p] = obra_para_montar($pid); $d = corpo(); $eid = (int)$u['empresa_id'];
    $orig = (int)($d['origem_id'] ?? 0); obra_da_empresa($u, $orig);
    if ($orig === $pid) throw new ErroApi('Escolha outra obra para copiar');
    $linhas = linhas_da_obra($orig, $eid, !empty($d['etapas']) ? array_map('intval', (array)$d['etapas']) : null);
    if (!$linhas) throw new ErroApi('A obra de origem não tem atividades');
    foreach ($linhas as &$l) unset($l['fim']); unset($l);              // a duração refaz o fim pelo calendário desta obra
    [$itens, $deps] = linhas_para_estrutura($linhas, $eid);
    if (!empty($d['previa'])) return previa_estrutura($itens, $deps);
    $datas = array_filter(array_column($itens, 'inicio')); $novo = inicio_pedido($d, $p);
    $desl = $datas ? (int)round((strtotime($novo . ' UTC') - strtotime(min($datas) . ' UTC')) / 86400) : 0;
    return inserir_estrutura($u, $pid, $itens, $deps, $novo, !empty($d['substituir']), $desl);
}

/* ══ Importar: linhas (colar/CSV), Excel (.xlsx) e MS Project (.xml) ══ */
/** Lê a 1ª planilha de um .xlsx (base64) → matriz de textos. */
function ler_xlsx(string $b64): array {
    if (!class_exists('ZipArchive')) throw new ErroApi('Este servidor não lê .xlsx; salve a planilha como CSV ou copie e cole as linhas');
    $bin = base64_decode($b64, true); if ($bin === false) throw new ErroApi('Arquivo inválido');
    $tmp = tempnam(sys_get_temp_dir(), 'tfx'); file_put_contents($tmp, $bin);
    $z = new ZipArchive(); if ($z->open($tmp) !== true) { @unlink($tmp); throw new ErroApi('Não consegui abrir o .xlsx'); }
    $ss = [];
    if (($x = $z->getFromName('xl/sharedStrings.xml')) !== false) { $sx = @simplexml_load_string($x); if ($sx) foreach ($sx->si as $si) { $t = ''; if (isset($si->t)) $t = (string)$si->t; else foreach ($si->r as $r) $t .= (string)$r->t; $ss[] = $t; } }
    $sh = $z->getFromName('xl/worksheets/sheet1.xml'); $z->close(); @unlink($tmp);
    if ($sh === false) throw new ErroApi('Não achei a primeira planilha do arquivo');
    $sx = @simplexml_load_string($sh); if (!$sx) throw new ErroApi('Planilha ilegível');
    $m = [];
    foreach ($sx->sheetData->row as $row) {
        $r = (int)$row['r'] - 1; $linha = [];
        foreach ($row->c as $c) {
            preg_match('/^([A-Z]+)/', (string)$c['r'], $mm); $col = 0; foreach (str_split($mm[1]) as $ch) $col = $col * 26 + (ord($ch) - 64); $col--;
            $t = (string)$c['t']; $v = (string)$c->v;
            if ($t === 's') $v = $ss[(int)$v] ?? ''; elseif ($t === 'inlineStr') $v = (string)$c->is->t;
            $linha[$col] = $v;
        }
        if ($linha) { $max = max(array_keys($linha)); $m[$r] = array_map(fn($i) => $linha[$i] ?? '', range(0, $max)); }
    }
    ksort($m); return array_values($m);
}
/** Matriz (com ou sem cabeçalho) → linhas. Reconhece colunas por nome; sem cabeçalho: atividade, duração, início, responsável. */
function matriz_para_linhas(array $m): array {
    $m = array_values(array_filter($m, fn($r) => implode('', array_map('trim', $r)) !== ''));
    if (!$m) return [];
    $n = fn($s) => mb_strtolower(trim(strtr((string)$s, ['ç' => 'c', 'ã' => 'a', 'á' => 'a', 'í' => 'i', 'ê' => 'e', 'é' => 'e', 'ó' => 'o', 'ú' => 'u', 'â' => 'a', 'õ' => 'o', 'Ç' => 'c'])));
    $mapa = ['eap' => '/^(eap|wbs|item|n[ºo°]?|codigo)$/', 'nivel' => '/^(nivel|outline|level)/', 'descricao' => '/^(atividade|tarefa|nome|descricao|task|servico)/',
             'duracao' => '/^(duracao|dur|duration|prazo)/', 'inicio' => '/^(inicio|start|data inicio|comeco)/', 'fim' => '/^(fim|termino|finish|conclusao|data fim)/',
             'responsavel' => '/^(responsavel|resp|recurso|resource)/', 'pred' => '/^(predecessora|pred|depende)/'];
    $cab = [];
    for ($h = 0; $h < min(6, count($m)) && !isset($cab['descricao']); $h++) {      // o cabeçalho pode vir depois de um título
        $cab = []; foreach ($m[$h] as $i => $c) foreach ($mapa as $k => $re) if (!isset($cab[$k]) && preg_match($re, $n($c))) $cab[$k] = $i;
        if (isset($cab['descricao'])) { $m = array_slice($m, $h + 1); break; }
    }
    if (!isset($cab['descricao'])) $cab = ['descricao' => 0, 'duracao' => 1, 'inicio' => 2, 'responsavel' => 3];
    $out = [];
    foreach ($m as $r) {
        $g = fn($k) => isset($cab[$k]) ? trim((string)($r[$cab[$k]] ?? '')) : '';
        $desc = $g('descricao'); if ($desc === '') continue;
        $raw = (string)($r[$cab['descricao']] ?? ''); $esp = strlen($raw) - strlen(ltrim($raw));
        $eap = $g('eap'); $niv = $g('nivel');
        $nivel = $niv !== '' ? max(0, (int)$niv - 1) : ($eap !== '' && preg_match('/^\d+(\.\d+)*$/', $eap) ? substr_count($eap, '.') : intdiv($esp, 2));
        $dur = $g('duracao'); if (preg_match('/^([\d.,]+)\s*(h|hr|hrs|horas?)$/i', $dur, $mm)) $dur = (string)((float)str_replace(',', '.', $mm[1]) / 8);
        $out[] = ['nivel' => $nivel, 'eap' => $eap, 'descricao' => $desc, 'duracao' => $dur, 'inicio' => $g('inicio'), 'fim' => $g('fim'), 'responsavel' => $g('responsavel'), 'pred' => $g('pred')];
    }
    return $out;
}
/** MS Project (MSPDI .xml) → linhas. */
function mspdi_para_linhas(string $xml): array {
    $prev = libxml_use_internal_errors(true);
    $sx = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET);
    libxml_use_internal_errors($prev);
    if (!$sx || !isset($sx->Tasks)) throw new ErroApi('Não reconheci o arquivo. No MS Project use Arquivo › Salvar como › "Formato XML (*.xml)".');
    $minDia = (int)($sx->MinutesPerDay ?? 480) ?: 480;
    $tarefas = []; $linhaDe = [];
    foreach ($sx->Tasks->Task as $t) {
        if ((string)$t->IsNull === '1' || (int)$t->OutlineLevel < 1 || trim((string)$t->Name) === '') continue;
        $tarefas[] = $t; $linhaDe[(string)$t->UID] = count($tarefas);
    }
    $tipos = ['0' => 'TT', '1' => 'TC', '2' => 'CT', '3' => 'CC'];
    $out = [];
    foreach ($tarefas as $t) {
        $h = 0.0; if (preg_match('/PT(\d+)H(\d+)M/', (string)$t->Duration, $mm)) $h = (int)$mm[1] + (int)$mm[2] / 60;
        $preds = [];
        foreach ($t->PredecessorLink as $pl) { $l = $linhaDe[(string)$pl->PredecessorUID] ?? null; if (!$l) continue;
            $lag = (int)round(((int)$pl->LinkLag) / 10 / $minDia); $preds[] = $l . ($tipos[(string)$pl->Type] ?? 'TC') . ($lag ? sprintf('%+d', $lag) : ''); }
        $out[] = ['nivel' => (int)$t->OutlineLevel - 1, 'descricao' => (string)$t->Name, 'duracao' => (string)$t->Milestone === '1' ? 0 : round($h * 60 / $minDia, 1),
                  'inicio' => substr((string)$t->Start, 0, 10), 'pred' => implode(';', $preds)];
    }
    return $out;
}
/** POST /api/obras/{id}/importar {formato: linhas|csv|xlsx|mspdi, conteudo|linhas, inicio?, substituir?, previa?} */
function rota_importar_cronograma(int $pid): array {
    [$u, $p] = obra_para_montar($pid); $d = corpo(); $eid = (int)$u['empresa_id'];
    $f = (string)($d['formato'] ?? 'linhas');
    $conteudo = (string)($d['conteudo'] ?? '');
    if (strlen($conteudo) > 8_000_000) throw new ErroApi('Arquivo grande demais (máximo de uns 6 MB)');
    $manterDatas = true;
    switch ($f) {
        case 'mspdi': $linhas = mspdi_para_linhas($conteudo); break;
        case 'xlsx':  $linhas = matriz_para_linhas(ler_xlsx($conteudo)); break;
        case 'csv':   $sep = substr_count(strtok($conteudo, "\n") ?: '', ';') >= substr_count(strtok($conteudo, "\n") ?: '', ',') ? ';' : ',';
                      if (str_contains(strtok($conteudo, "\n") ?: '', "\t")) $sep = "\t";
                      $linhas = matriz_para_linhas(array_map(fn($l) => str_getcsv($l, $sep), preg_split('/\r\n|\n|\r/', $conteudo))); break;
        case 'linhas': $linhas = is_array($d['linhas'] ?? null) ? $d['linhas'] : matriz_para_linhas(array_map(fn($l) => explode("\t", $l), preg_split('/\r\n|\n|\r/', $conteudo))); break;
        default: throw new ErroApi('Formato não reconhecido');
    }
    if (!$linhas) throw new ErroApi('Não encontrei atividades no conteúdo');
    [$itens, $deps] = linhas_para_estrutura($linhas, $eid);
    if (!empty($d['previa'])) return previa_estrutura($itens, $deps);
    // datas trazidas pelo arquivo são mantidas; se pedir outro início, tudo é deslocado
    $datas = array_filter(array_column($itens, 'inicio')); $desl = 0; $ini = inicio_pedido($d, $p);
    if ($datas && !empty($d['inicio'])) $desl = (int)round((strtotime($d['inicio'] . ' UTC') - strtotime(min($datas) . ' UTC')) / 86400);
    return inserir_estrutura($u, $pid, $itens, $deps, $ini, !empty($d['substituir']), $desl);
}

/* ══ Exportar: Excel (.xlsx) e MS Project (.xml) ═════════════════ */
function xml_esc(string $s): string { return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }
function baixar(string $nome, string $tipo, string $conteudo): void {
    header('Content-Type: ' . $tipo); header('Content-Disposition: attachment; filename="' . $nome . '"; filename*=UTF-8\'\'' . rawurlencode($nome));
    header('Content-Length: ' . strlen($conteudo)); header('Cache-Control: no-store');
    echo $conteudo; exit;
}
/** GET /api/obras/{id}/exportar?formato=xlsx|mspdi */
function rota_exportar_cronograma(int $pid): array {
    $u = exigir_login(); $p = obra_para_cronograma($u, $pid);
    $c = rota_obra_cronograma($pid); $A = $c['atividades'];
    $porId = []; foreach ($A as $i => $a) $porId[$a['id']] = $i;
    $nomeArq = preg_replace('/[^\w\-]+/u', '-', trim(($p['codigo'] ?: 'obra') . ' ' . $p['nome'])) ;
    $fmt = $_GET['formato'] ?? 'xlsx';
    if ($fmt === 'mspdi') {
        $t = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' . "\n" . '<Project xmlns="http://schemas.microsoft.com/project">'
           . '<Name>' . xml_esc($p['nome']) . '</Name><Title>' . xml_esc(($p['codigo'] ? $p['codigo'] . ' · ' : '') . $p['nome']) . '</Title>'
           . '<ScheduleFromStart>1</ScheduleFromStart><StartDate>' . ($p['inicio'] ?: gmdate('Y-m-d')) . 'T08:00:00</StartDate><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth><Tasks>';
        $tipo = ['TT' => 0, 'TC' => 1, 'CT' => 2, 'CC' => 3];
        $preds = []; foreach ($c['dependencias'] as $d) $preds[$d['depois_id']][] = $d;
        foreach ($A as $i => $a) {
            $dur = (float)($a['duracao_dias'] ?? 0); $h = (int)floor($dur * 8); $mi = (int)round(($dur * 8 - $h) * 60);
            $t .= '<Task><UID>' . ($i + 1) . '</UID><ID>' . ($i + 1) . '</ID><Name>' . xml_esc($a['descricao']) . '</Name><OutlineNumber>' . $a['eap'] . '</OutlineNumber><OutlineLevel>' . ($a['nivel'] + 1) . '</OutlineLevel>'
                . ($a['inicio'] ? '<Start>' . $a['inicio'] . 'T08:00:00</Start>' : '') . ($a['fim'] ? '<Finish>' . $a['fim'] . 'T17:00:00</Finish>' : '')
                . "<Duration>PT{$h}H{$mi}M0S</Duration><DurationFormat>7</DurationFormat><PercentComplete>" . (int)$a['avanco'] . '</PercentComplete>'
                . '<Milestone>' . ($a['marco'] ? 1 : 0) . '</Milestone><Summary>' . ($a['etapa'] ? 1 : 0) . '</Summary><Critical>' . ($a['critica'] ? 1 : 0) . '</Critical>'
                . ($a['responsavel_nome'] ? '<Notes>Responsável: ' . xml_esc($a['responsavel_nome']) . '</Notes>' : '');
            foreach ($preds[$a['id']] ?? [] as $d) if (isset($porId[$d['antes_id']]))
                $t .= '<PredecessorLink><PredecessorUID>' . ($porId[$d['antes_id']] + 1) . '</PredecessorUID><Type>' . $tipo[$d['tipo']] . '</Type><LinkLag>' . ((int)$d['folga_dias'] * 4800) . '</LinkLag><LagFormat>7</LagFormat></PredecessorLink>';
            $t .= '</Task>';
        }
        baixar($nomeArq . '.xml', 'application/xml; charset=utf-8', $t . '</Tasks></Project>');
    }
    // Excel
    if (!class_exists('ZipArchive')) throw new ErroApi('Este servidor não gera .xlsx');
    $cab = ['EAP', 'Atividade', 'Responsável', 'Início', 'Fim', 'Duração (dias úteis)', 'Predecessoras', 'Avanço (%)', 'Situação', 'Crítica', 'Atrasada'];
    $linhaXml = function (int $r, array $vals, bool $neg = false, int $recuo = 0) {
        $x = '<row r="' . $r . '">';
        foreach ($vals as $i => $v) {
            $ref = chr(65 + $i) . $r; $s = $neg ? ' s="1"' : ($i === 1 && $recuo ? ' s="' . (2 + min($recuo, 4)) . '"' : '');
            if ($v instanceof DateTimeInterface) $x .= '<c r="' . $ref . '" s="7"><v>' . (25569 + intdiv($v->getTimestamp(), 86400)) . '</v></c>';
            elseif (is_int($v) || is_float($v)) $x .= '<c r="' . $ref . '"' . $s . '><v>' . $v . '</v></c>';
            else $x .= '<c r="' . $ref . '" t="inlineStr"' . $s . '><is><t xml:space="preserve">' . xml_esc((string)$v) . '</t></is></c>';
        }
        return $x . '</row>';
    };
    $rows = $linhaXml(1, [($p['codigo'] ? $p['codigo'] . ' · ' : '') . $p['nome']], true) . $linhaXml(3, $cab, true); $r = 4;
    foreach ($A as $a) $rows .= $linhaXml($r++, [$a['eap'], $a['descricao'], $a['responsavel_nome'] ?? '', $a['inicio'] ? new DateTimeImmutable($a['inicio'] . ' UTC') : '',
        $a['fim'] ? new DateTimeImmutable($a['fim'] . ' UTC') : '', $a['duracao_dias'] !== null ? (float)$a['duracao_dias'] : '', $a['predecessoras'], (int)$a['avanco'], $a['situacao'],
        $a['critica'] ? 'sim' : '', $a['atrasada'] ? 'sim' : ''], false, (int)$a['nivel']);
    $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
           . '<cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="48" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="5" width="12" customWidth="1"/><col min="6" max="6" width="12" customWidth="1"/><col min="7" max="7" width="16" customWidth="1"/><col min="8" max="11" width="11" customWidth="1"/></cols>'
           . '<sheetData>' . $rows . '</sheetData><autoFilter ref="A3:K' . max(3, $r - 1) . '"/></worksheet>';
    $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
            . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
            . '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="8"><xf/><xf fontId="1" applyFont="1"/>'
            . '<xf applyAlignment="1"><alignment indent="0"/></xf><xf applyAlignment="1"><alignment indent="2"/></xf><xf applyAlignment="1"><alignment indent="4"/></xf><xf applyAlignment="1"><alignment indent="6"/></xf><xf applyAlignment="1"><alignment indent="8"/></xf>'
            . '<xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>';
    $tmp = tempnam(sys_get_temp_dir(), 'tfx'); $z = new ZipArchive(); $z->open($tmp, ZipArchive::OVERWRITE);
    $z->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    $z->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    $z->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cronograma" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Cronograma!$A$3:$K$' . max(3, $r - 1) . '</definedName></definedNames></workbook>');
    $z->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    $z->addFromString('xl/worksheets/sheet1.xml', $sheet); $z->addFromString('xl/styles.xml', $styles); $z->close();
    $bin = file_get_contents($tmp); @unlink($tmp);
    baixar($nomeArq . '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', $bin);
}
