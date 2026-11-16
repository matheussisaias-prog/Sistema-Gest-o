<?php
/* Task Flow · servidor · Assistente Task Flow (sem IA externa):
   1) buscador que entende frases do dia a dia ("atividades atrasadas da ELE-014", "o que o João tem essa semana");
   2) montar obra por perguntas: regras por tipo de serviço → etapas, durações pelas quantidades, ligações e prévia do Gantt. */
declare(strict_types=1);

/* ══ Texto: minúsculas, sem acento, palavras parecidas ════════════ */
function ass_norm(string $s): string {
    $s = mb_strtolower($s, 'UTF-8');
    $s = strtr($s, ['á'=>'a','à'=>'a','â'=>'a','ã'=>'a','ä'=>'a','é'=>'e','ê'=>'e','è'=>'e','í'=>'i','ì'=>'i','ó'=>'o','ô'=>'o','õ'=>'o','ò'=>'o','ú'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n']);
    $s = preg_replace('/[^a-z0-9\-]+/', ' ', $s);
    return trim(preg_replace('/\s+/', ' ', $s));
}
function ass_tokens(string $s): array { return array_values(array_filter(explode(' ', ass_norm($s)), fn($t) => $t !== '' && $t !== '-')); }
/** Palavra digitada parecida com a do dicionário (aceita erro de digitação e plural). */
function ass_parecido(string $t, string $w): bool {
    if ($t === $w) return true;
    $lt = strlen($t); $lw = strlen($w);
    if ($lw < 4 || $lt < 3) return false;
    if ($lt >= 5 && (str_starts_with($w, $t) || str_starts_with($t, $w))) return true;
    $tol = $lw >= 8 ? 2 : 1;
    return abs($lt - $lw) <= $tol && levenshtein($t, $w) <= $tol;
}
const ASS_PARADAS = ['a','o','as','os','de','da','do','das','dos','e','em','no','na','nos','nas','um','uma','para','pra','pro','com','que','qual','quais',
    'quem','me','mostre','mostra','mostrar','ver','lista','listar','tem','tenho','esta','estao','essa','esse','este','desta','deste','dessa','desse',
    'nesta','neste','nessa','nesse','todas','todos','minha','minhas','meu','meus','por','favor','sobre','ja','ate','quero','preciso','tudo','eu','se','ou',
    'mais','menos','muito','isso','aqui','ai','la','foi','sao','ser','estou','agora','ainda','vai','vao','ficar','fica','ficam','tao'];
const ASS_AJUDA = ['como','onde','porque','significa','consigo','posso','faco','fazer','ajuda','duvida','funciona','serve','cadastro','cadastrar','criar','mudar','trocar','apagar','excluir','editar','importar','exportar','salvar','imprimir'];
const ASS_INTENCOES = [
    'atividades'  => ['atividade','atividades','tarefa','tarefas','servico','servicos'],
    'obras'       => ['obra','obras','projeto','projetos'],
    'pessoas'     => ['pessoa','pessoas','funcionario','funcionarios','colaborador','colaboradores','equipe','equipes','eletricista','eletricistas','tecnico','tecnicos','gente'],
    'recursos'    => ['recurso','recursos','equipamento','equipamentos','veiculo','veiculos','ferramenta','ferramentas','carro','carros','caminhao'],
    'rdos'        => ['rdo','rdos','diario','diarios'],
    'atrasadas'   => ['atrasada','atrasadas','atrasado','atrasados','atraso','atrasos'],
    'travadas'    => ['travada','travadas','travado','travados','travou','impedimento','impedimentos','impedida','impedidas'],
    'semana'      => ['semana'],
    'hoje'        => ['hoje'],
    'amanha'      => ['amanha'],
    'ontem'       => ['ontem'],
    'concluidas'  => ['concluida','concluidas','concluido','concluidos','finalizada','finalizadas','pronta','prontas','terminada','terminadas','feitas'],
    'andamento'   => ['andamento','fazendo','executando'],
    'pendentes'   => ['pendente','pendentes','iniciar','comecar'],
    'vermelho'    => ['vermelho','vermelha','vermelhos','vermelhas'],
    'amarelo'     => ['amarelo','amarela','amarelos','amarelas'],
    'verde'       => ['verde','verdes'],
    'pausadas'    => ['pausada','pausadas','parada','paradas'],
    'planejamento'=> ['planejamento'],
    'nr'          => ['documento','documentos','treinamento','treinamentos','certificado','certificados','aso','asos'],
    'vencidos'    => ['vencido','vencidos','vencida','vencidas','expirado','expirados','vencimento'],
    'vencendo'    => ['vencendo','vencer','vence'],
    'rascunho'    => ['rascunho','rascunhos'],
    'assinatura'  => ['assinar','assinatura','assinado','assinados','assinada','assinadas'],
];
const ASS_ROTULOS = ['atividades' => 'atividades', 'obras' => 'obras', 'pessoas' => 'pessoas', 'recursos' => 'recursos', 'rdos' => 'RDOs', 'atrasadas' => 'atrasadas', 'travadas' => 'travadas',
    'semana' => 'nesta semana', 'hoje' => 'hoje', 'amanha' => 'amanhã', 'ontem' => 'ontem', 'concluidas' => 'concluídas', 'andamento' => 'em andamento', 'pendentes' => 'pendentes',
    'vermelho' => 'farol vermelho', 'amarelo' => 'farol amarelo', 'verde' => 'farol verde', 'pausadas' => 'pausadas', 'planejamento' => 'em planejamento',
    'nr' => 'documentos de NR', 'vencidos' => 'vencidos', 'vencendo' => 'vencendo', 'rascunho' => 'em rascunho', 'assinatura' => 'assinatura', 'sem_resp' => 'sem responsável'];

function ass_hoje(): string { return gmdate('Y-m-d', time() - 3 * 3600); }
function ass_data_br(?string $d): string { return $d ? substr($d, 8, 2) . '/' . substr($d, 5, 2) : '—'; }
function ass_plural(int $n, string $um, string $varios): string { return $n === 1 ? "1 $um" : "$n $varios"; }

/* ══ Busca ═════════════════════════════════════════════════════ */
/** GET /api/assistente/buscar?q=… — entende a frase e responde com os dados que a pessoa pode ver. */
function rota_assistente_buscar(): array {
    $u = exigir_login(); $eid = (int)$u['empresa_id'];
    $texto = trim(mb_substr((string)($_GET['q'] ?? ''), 0, 200));
    $tok = ass_tokens($texto);
    $out = ['q' => $texto, 'entendi' => [], 'ajuda' => false, 'resposta' => null, 'tambem' => []];
    if (!$tok) return $out;
    $usado = array_fill(0, count($tok), false);
    $int = []; $termos = []; $chip = function (string $rot, array $idx) use (&$out, $tok) { $out['entendi'][] = ['rotulo' => $rot, 'termos' => array_map(fn($i) => $tok[$i], $idx)]; };

    // frases de duas palavras
    for ($i = 0; $i < count($tok) - 1; $i++) {
        if ($tok[$i] === 'sem' && ass_parecido($tok[$i + 1], 'responsavel')) { $int['sem_resp'] = true; $usado[$i] = $usado[$i + 1] = true; $chip('sem responsável', [$i, $i + 1]); }
        if ($tok[$i] === 'em' && $tok[$i + 1] === 'dia') { $int['verde'] = true; $usado[$i] = $usado[$i + 1] = true; $chip('farol verde', [$i, $i + 1]); }
        if (in_array($tok[$i], ['proxima', 'proximos', 'proximas', 'proximo'], true) && $tok[$i + 1] === 'semana') { $int['semana'] = true; $usado[$i] = true; }
    }
    // NR-10, nr35…
    $nr = null; $semNr = false;
    foreach ($tok as $i => $t) if (!$usado[$i] && preg_match('/^nr-?(\d{1,2})$/', $t, $m)) {
        $nr = sprintf('NR-%02d', (int)$m[1]); $usado[$i] = true; $int['nr'] = true;
        if ($i > 0 && $tok[$i - 1] === 'sem') { $semNr = true; $usado[$i - 1] = true; }
        $chip(($semNr ? 'sem ' : '') . $nr, $semNr ? [$i - 1, $i] : [$i]);
    }
    if (!$nr && in_array('nr', $tok, true)) { $i = array_search('nr', $tok, true); $usado[$i] = true; $int['nr'] = true; $chip('documentos de NR', [$i]); }
    // intenções do dicionário
    foreach ($tok as $i => $t) {
        if ($usado[$i] || in_array($t, ASS_PARADAS, true)) continue;
        // primeiro a palavra exata; só depois a parecida (erro de digitação)
        foreach ([fn($t, $w) => $t === $w, 'ass_parecido'] as $igual)
            foreach (ASS_INTENCOES as $k => $lista) foreach ($lista as $w) if ($igual($t, $w)) {
                $usado[$i] = true;
                if (empty($int[$k])) { $int[$k] = true; $chip(ASS_ROTULOS[$k], [$i]); }
                continue 4;
            }
    }
    foreach ($tok as $i => $t) if (!$usado[$i] && (in_array($t, ASS_AJUDA, true) || $t === 'que' && ($tok[$i + 1] ?? '') === 'e')) $out['ajuda'] = true;
    if (preg_match('/\b(o que (e|significa)|por que|pra que|para que)\b/', ass_norm($texto))) $out['ajuda'] = true;

    // obras que a pessoa pode ver
    $vis = obras_visiveis($u);
    $filtroVis = $vis === null ? '' : ($vis ? ' AND id IN (' . implode(',', array_map('intval', $vis)) . ')' : ' AND 0');
    $obras = todos("SELECT id, codigo, nome, cliente, situacao FROM projetos WHERE empresa_id = ? AND excluido_em IS NULL$filtroVis", [$eid]);
    $obraAchada = [];
    foreach ($tok as $i => $t) {
        if ($usado[$i]) continue;
        $limpo = preg_replace('/[^a-z0-9]/', '', $t);
        foreach ($obras as $o) {
            $cod = preg_replace('/[^a-z0-9]/', '', ass_norm((string)$o['codigo']));
            if ($cod === '') continue;
            $num = preg_replace('/^[a-z]+/', '', $cod);
            $junto = $i + 1 < count($tok) ? $limpo . preg_replace('/[^a-z0-9]/', '', $tok[$i + 1]) : '';
            if ($limpo === $cod || ($junto !== '' && $junto === $cod) || (strlen($num) >= 2 && ctype_digit($limpo) && ltrim($limpo, '0') === ltrim($num, '0'))) {
                $obraAchada[(int)$o['id']] = $o; $usado[$i] = true; $termos['o' . $o['id']][] = $t;
                if ($junto === $cod) { $usado[$i + 1] = true; $termos['o' . $o['id']][] = $tok[$i + 1]; }
            }
        }
    }
    // nome da obra ou cliente (palavras com 4+ letras)
    $palavrasObra = [];
    foreach ($obras as $o) foreach (ass_tokens($o['nome'] . ' ' . ($o['cliente'] ?? '')) as $w) if (strlen($w) >= 4 && !in_array($w, ASS_PARADAS, true)) $palavrasObra[$w][(int)$o['id']] = $o;
    // pessoas
    $pessoas = $u['perfil'] === 'funcionario' ? [] : todos('SELECT id, nome, apelido, cargo FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1', [$eid]);
    $pessoaAchada = [];
    foreach ($tok as $i => $t) {
        if ($usado[$i] || strlen($t) < 3 || in_array($t, ASS_PARADAS, true)) continue;
        $hit = [];
        foreach ($pessoas as $p) foreach (ass_tokens($p['nome'] . ' ' . ($p['apelido'] ?? '')) as $w) if (strlen($w) >= 3 && ($w === $t || (strlen($t) >= 4 && ass_parecido($t, $w)))) { $hit[(int)$p['id']] = $p; break; }
        if ($hit) {
            // sobrenome na palavra seguinte desempata ("João Paulo")
            if (count($hit) > 1 && isset($tok[$i + 1])) {
                $f = array_filter($hit, fn($p) => in_array($tok[$i + 1], ass_tokens($p['nome']), true));
                if ($f) { $hit = $f; $usado[$i + 1] = true; foreach ($hit as $pid => $_) $termos['p' . $pid][] = $tok[$i + 1]; }
            }
            foreach ($hit as $pid => $_) $termos['p' . $pid][] = $t;
            $pessoaAchada += $hit; $usado[$i] = true;
        }
    }
    foreach ($tok as $i => $t) {
        if ($usado[$i] || strlen($t) < 4 || in_array($t, ASS_PARADAS, true)) continue;
        foreach ($palavrasObra as $w => $lista) if (ass_parecido($t, $w)) { foreach ($lista as $id => $o) { $obraAchada[$id] = $o; $termos['o' . $id][] = $t; } $usado[$i] = true; break; }
    }
    foreach ($obraAchada as $o) $out['entendi'][] = ['rotulo' => 'obra ' . ($o['codigo'] ?: $o['nome']), 'termos' => array_values(array_unique($termos['o' . $o['id']] ?? []))];
    foreach ($pessoaAchada as $p) $out['entendi'][] = ['rotulo' => $p['nome'], 'termos' => array_values(array_unique($termos['p' . $p['id']] ?? []))];
    // o que sobrou vira texto livre (busca na descrição das atividades e nos recursos)
    $livre = [];
    foreach ($tok as $i => $t) if (!$usado[$i] && strlen($t) >= 3 && !in_array($t, ASS_PARADAS, true) && !in_array($t, ASS_AJUDA, true) && $t !== 'sem') $livre[] = $t;
    if ($livre && !$out['ajuda']) $out['entendi'][] = ['rotulo' => '"' . implode(' ', $livre) . '"', 'termos' => $livre];

    $ctx = compact('u', 'eid', 'int', 'obraAchada', 'pessoaAchada', 'livre', 'nr', 'semNr', 'vis', 'obras');
    $temFiltroAtiv = !empty($int['atrasadas']) || !empty($int['travadas']) || !empty($int['semana']) || !empty($int['hoje']) || !empty($int['amanha']) || !empty($int['concluidas'])
        || !empty($int['andamento']) || !empty($int['pendentes']) || !empty($int['sem_resp']);
    $temFarol = !empty($int['vermelho']) || !empty($int['amarelo']) || !empty($int['verde']) || !empty($int['pausadas']) || !empty($int['planejamento']);

    if (!empty($int['nr']) || ((!empty($int['vencidos']) || !empty($int['vencendo'])) && empty($int['atividades'])))
        $out['resposta'] = ass_resp_documentos($ctx);
    elseif (!empty($int['rdos'])) $out['resposta'] = ass_resp_rdos($ctx);
    elseif (!empty($int['recursos']) && empty($int['atividades'])) $out['resposta'] = ass_resp_recursos($ctx);
    elseif (($temFarol || (!empty($int['obras']) && empty($int['atividades']) && !$pessoaAchada && empty($int['semana']) && empty($int['hoje']) && empty($int['sem_resp']))) && $u['perfil'] !== 'funcionario')
        $out['resposta'] = ass_resp_obras($ctx);
    elseif (!empty($int['atividades']) || $temFiltroAtiv || $pessoaAchada || ($livre && !$out['ajuda']) || !empty($int['atrasadas']))
        $out['resposta'] = ass_resp_atividades($ctx);
    elseif (!empty($int['pessoas'])) $out['resposta'] = ass_resp_pessoas($ctx);
    elseif (count($obraAchada) === 1) $out['resposta'] = ass_resp_obra(array_values($obraAchada)[0], $ctx);
    elseif ($obraAchada && $u['perfil'] !== 'funcionario') $out['resposta'] = ass_resp_obras($ctx);

    // também encontrei
    $principal = $out['resposta']['chave'] ?? '';
    foreach (array_slice($obraAchada, 0, 3) as $o) if ($principal !== 'obra-' . $o['id'] && $u['perfil'] !== 'funcionario') $out['tambem'][] = ass_item_obra($o, $ctx);
    foreach (array_slice($pessoaAchada, 0, 3) as $p) $out['tambem'][] = ass_item_pessoa($p, $ctx);
    if ($livre && $u['perfil'] !== 'funcionario' && empty($int['recursos'])) {
        foreach (todos('SELECT id, nome, tipo FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL', [$eid]) as $r)
            if (array_filter($livre, fn($t) => array_filter(ass_tokens($r['nome']), fn($w) => ass_parecido($t, $w))))
                $out['tambem'][] = ['sigla' => 'RC', 'cor' => 'cinza', 'titulo' => $r['nome'], 'info' => 'Recurso · ' . $r['tipo'], 'link' => ['tipo' => 'view', 'view' => 'recursos']];
    }
    $out['tambem'] = array_slice($out['tambem'], 0, 5);
    unset($out['resposta']['chave']);
    return $out;
}

/* ── respostas ─────────────────────────────────────────────── */
function ass_obra_sql(array $c): string {
    $ids = $c['obraAchada'] ? array_keys($c['obraAchada']) : null;
    if ($c['vis'] !== null) $ids = $ids === null ? $c['vis'] : array_values(array_intersect($ids, $c['vis']));
    if ($ids === null) return '';
    return $ids ? ' AND a.projeto_id IN (' . implode(',', array_map('intval', $ids)) . ')' : ' AND 0';
}
function ass_resp_atividades(array $c): array {
    $u = $c['u']; $int = $c['int']; $hoje = ass_hoje();
    $sql = 'SELECT a.id, a.projeto_id, a.descricao, a.inicio, a.fim, a.avanco, a.situacao, a.responsavel_id, f.nome AS responsavel, p.codigo, p.nome AS obra
            FROM atividades a JOIN projetos p ON p.id = a.projeto_id AND p.excluido_em IS NULL LEFT JOIN funcionarios f ON f.id = a.responsavel_id
            WHERE a.empresa_id = ? AND a.excluido_em IS NULL
              AND NOT EXISTS (SELECT 1 FROM atividades x WHERE x.pai_id = a.id AND x.excluido_em IS NULL)' . ass_obra_sql($c);
    $p = [$c['eid']];
    if ($u['perfil'] === 'funcionario') { $sql .= ' AND a.responsavel_id = ?'; $p[] = (int)$u['funcionario_id']; }
    if ($c['pessoaAchada']) $sql .= ' AND a.responsavel_id IN (' . implode(',', array_map('intval', array_keys($c['pessoaAchada']))) . ')';
    $L = todos($sql, $p);
    $trav = [];
    if (!empty($int['travadas']) && $L) foreach (todos('SELECT atividade_id, descricao FROM ocorrencias WHERE empresa_id = ? AND resolvida_em IS NULL AND excluido_em IS NULL AND atividade_id IN (' . implode(',', array_map(fn($a) => (int)$a['id'], $L)) . ')', [$c['eid']]) as $o) $trav[(int)$o['atividade_id']] = $o['descricao'];
    if (!empty($int['travadas'])) $L = array_values(array_filter($L, fn($a) => isset($trav[(int)$a['id']])));
    $aberta = fn($a) => $a['situacao'] !== 'Concluído' && (int)$a['avanco'] < 100;
    $atras = fn($a) => $a['fim'] && $a['fim'] < $hoje && $aberta($a);
    $fimSem = Calendario::mais($hoje, 7); $amanha = Calendario::mais($hoje, 1);
    $L = array_filter($L, function ($a) use ($int, $c, $hoje, $fimSem, $amanha, $aberta, $atras) {
        if (!empty($int['atrasadas']) && !$atras($a)) return false;
        if (!empty($int['concluidas']) && $aberta($a)) return false;
        if (!empty($int['andamento']) && $a['situacao'] !== 'Em andamento') return false;
        if (!empty($int['pendentes']) && $a['situacao'] !== 'Pendente') return false;
        if (!empty($int['sem_resp']) && $a['responsavel_id']) return false;
        if (!empty($int['semana']) && !($a['inicio'] && $a['inicio'] <= $fimSem && $a['fim'] >= $hoje && $aberta($a))) return false;
        if (!empty($int['hoje']) && !($a['inicio'] && $a['inicio'] <= $hoje && $a['fim'] >= $hoje && $aberta($a))) return false;
        if (!empty($int['amanha']) && !($a['inicio'] && $a['inicio'] <= $amanha && $a['fim'] >= $amanha && $aberta($a))) return false;
        if ($c['livre']) {
            $d = ass_tokens($a['descricao']);
            foreach ($c['livre'] as $t) if (!array_filter($d, fn($w) => ass_parecido($t, $w) || str_contains($w, $t))) return false;
        }
        // sem filtro de período nem de situação: só as que não terminaram
        $semFiltro = empty($int['atrasadas']) && empty($int['concluidas']) && empty($int['semana']) && empty($int['hoje']) && empty($int['amanha']) && empty($int['andamento']) && empty($int['pendentes']);
        return !$semFiltro || $aberta($a) || $c['livre'];
    });
    usort($L, fn($x, $y) => ($atras($y) <=> $atras($x)) ?: (($x['fim'] ?? '9') <=> ($y['fim'] ?? '9')));
    $n = count($L);
    $quais = [];
    foreach (['atrasadas', 'travadas', 'concluidas', 'andamento', 'pendentes'] as $k) if (!empty($int[$k])) $quais[] = ASS_ROTULOS[$k];
    if (!empty($int['sem_resp'])) $quais[] = 'sem responsável';
    $tit = ass_plural($n, 'atividade', 'atividades') . ($quais ? ' ' . implode(' e ', $n === 1 ? array_map(fn($q) => preg_replace('/s$/', '', $q), $quais) : $quais) : ($c['pessoaAchada'] || !empty($int['semana']) || !empty($int['hoje']) ? '' : ' em aberto'));
    if ($c['pessoaAchada']) $tit .= ' de ' . implode(', ', array_map(fn($p) => explode(' ', $p['nome'])[0], $c['pessoaAchada']));
    if (count($c['obraAchada']) === 1) { $o = array_values($c['obraAchada'])[0]; $tit .= ' na ' . ($o['codigo'] ?: $o['nome']); }
    if (!empty($int['semana'])) $tit .= ' nos próximos 7 dias'; if (!empty($int['hoje'])) $tit .= ' para hoje'; if (!empty($int['amanha'])) $tit .= ' para amanhã';
    if ($c['livre']) $tit .= ' com "' . implode(' ', $c['livre']) . '"';
    $sub = count($c['obraAchada']) === 1 ? array_values($c['obraAchada'])[0]['nome'] : ($n ? 'Em ' . ass_plural(count(array_unique(array_column($L, 'projeto_id'))), 'obra', 'obras') : '');
    $itens = array_map(function ($a) use ($atras, $hoje, $trav) {
        $at = $atras($a) ? (int)round((strtotime($hoje . ' UTC') - strtotime($a['fim'] . ' UTC')) / 86400) : 0;
        return ['titulo' => $a['descricao'], 'info' => (isset($trav[(int)$a['id']]) ? 'Travou: ' . $trav[(int)$a['id']] . ' · ' : '') . ($a['codigo'] ?: $a['obra']) . ' · ' . ($a['responsavel'] ?: 'sem responsável') . ' · ' . (int)$a['avanco'] . '% feito · ' . ass_data_br($a['inicio']) . ' → ' . ass_data_br($a['fim']),
                'selo' => $at ? ass_plural($at, 'dia', 'dias') : ($a['situacao'] === 'Concluído' ? 'Concluída' : null), 'selo_cor' => $at ? 'verm' : 'verd',
                'link' => ['tipo' => 'atividade', 'obra_id' => (int)$a['projeto_id'], 'id' => (int)$a['id']]];
    }, array_slice($L, 0, 8));
    $r = ['tipo' => 'atividades', 'titulo' => $tit, 'sub' => $sub, 'itens' => $itens, 'total' => $n, 'chave' => 'ativ'];
    $obrasRes = array_unique(array_column($L, 'projeto_id'));
    if ($n && count($obrasRes) === 1 && $u['perfil'] !== 'funcionario') {
        $f = !empty($int['atrasadas']) ? 'atrasadas' : (!empty($int['semana']) ? 'semana' : null);
        $r['acao'] = ['rotulo' => $f === 'atrasadas' ? 'Abrir o cronograma só com as atrasadas' : ($f === 'semana' ? 'Abrir o cronograma desta semana' : 'Abrir o cronograma da obra'),
                      'link' => ['tipo' => 'obra', 'id' => (int)reset($obrasRes), 'filtro' => $f, 'resp' => count($c['pessoaAchada']) === 1 ? (int)array_key_first($c['pessoaAchada']) : null]];
    }
    return $r;
}
function ass_resumo_obras(array $c): array {
    static $cache = null;
    return $cache ??= (rota_obras_resumo())['obras'];
}
function ass_item_obra(array $o, array $c): array {
    $r = array_values(array_filter(ass_resumo_obras($c), fn($x) => (int)$x['id'] === (int)$o['id']))[0] ?? null;
    $farol = $r['farol'] ?? null;
    $info = $r ? (['verde' => 'Farol verde', 'amarelo' => 'Farol amarelo', 'vermelho' => 'Farol vermelho'][$farol] ?? $r['situacao']) . ' · real ' . round((float)$r['avanco_real']) . '%' . ($r['avanco_previsto'] !== null ? ' × previsto ' . round((float)$r['avanco_previsto']) . '%' : '') . ($r['atrasadas'] ? ' · ' . ass_plural((int)$r['atrasadas'], 'atrasada', 'atrasadas') : '') : $o['situacao'];
    return ['sigla' => 'OB', 'cor' => $farol === 'vermelho' ? 'verm' : ($farol === 'amarelo' ? 'amar' : ($farol === 'verde' ? 'verd' : 'cinza')),
            'titulo' => trim(($o['codigo'] ? $o['codigo'] . ' · ' : '') . $o['nome']), 'info' => $info, 'link' => ['tipo' => 'obra', 'id' => (int)$o['id']]];
}
function ass_item_pessoa(array $p, array $c): array {
    $hoje = ass_hoje();
    $a = um('SELECT COUNT(*) n, SUM(fim < ? AND situacao <> \'Concluído\' AND avanco < 100) atras FROM atividades a WHERE empresa_id = ? AND responsavel_id = ? AND excluido_em IS NULL AND situacao <> \'Concluído\'' . ass_obra_sql(array_merge($c, ['obraAchada' => []])), [$hoje, $c['eid'], (int)$p['id']]);
    $ini = implode('', array_map(fn($w) => mb_substr($w, 0, 1), array_slice(preg_split('/\s+/', trim($p['nome'])), 0, 2)));
    return ['sigla' => mb_strtoupper($ini), 'cor' => 'azul', 'titulo' => $p['nome'] . ($p['cargo'] ? ' · ' . mb_strtolower($p['cargo']) : ''),
            'info' => ass_plural((int)$a['n'], 'atividade em aberto', 'atividades em aberto') . ((int)$a['atras'] ? ', ' . ass_plural((int)$a['atras'], 'atrasada', 'atrasadas') : ''),
            'link' => ['tipo' => 'pessoa', 'id' => (int)$p['id'], 'texto' => explode(' ', $p['nome'])[0]]];
}
function ass_resp_obras(array $c): array {
    $int = $c['int']; $L = ass_resumo_obras($c);
    if ($c['obraAchada']) $L = array_filter($L, fn($o) => isset($c['obraAchada'][(int)$o['id']]));
    $filtros = [];
    foreach (['vermelho', 'amarelo', 'verde'] as $k) if (!empty($int[$k])) $filtros[] = $k;
    if ($filtros) $L = array_filter($L, fn($o) => in_array($o['farol'], $filtros, true));
    if (!empty($int['pausadas'])) $L = array_filter($L, fn($o) => $o['situacao'] === 'Pausado' || $o['situacao'] === 'Pausada');
    if (!empty($int['planejamento'])) $L = array_filter($L, fn($o) => $o['situacao'] === 'Planejamento');
    if (!empty($int['andamento'])) $L = array_filter($L, fn($o) => $o['situacao'] === 'Em andamento');
    if (!empty($int['concluidas'])) $L = array_filter($L, fn($o) => $o['situacao'] === 'Concluído');
    if (!empty($int['atrasadas'])) $L = array_filter($L, fn($o) => (int)$o['atrasadas'] > 0);
    if (!$filtros && empty($int['pausadas']) && empty($int['planejamento']) && empty($int['concluidas']) && !$c['obraAchada']) $L = array_filter($L, fn($o) => !in_array($o['situacao'], ['Concluído', 'Arquivado', 'Cancelado'], true));
    $L = array_values($L);
    usort($L, fn($x, $y) => (['vermelho' => 0, 'amarelo' => 1, 'verde' => 2][$x['farol']] ?? 3) <=> (['vermelho' => 0, 'amarelo' => 1, 'verde' => 2][$y['farol']] ?? 3));
    $n = count($L);
    $tit = ass_plural($n, 'obra', 'obras') . ($filtros ? ' no ' . implode(' ou ', array_map(fn($f) => $f, $filtros)) : '') . (!empty($int['pausadas']) ? ' pausadas' : '') . (!empty($int['planejamento']) ? ' em planejamento' : '') . (!empty($int['atrasadas']) ? ' com atividades atrasadas' : '') . (!empty($int['concluidas']) ? ' concluídas' : '') . (!empty($int['andamento']) ? ' em andamento' : '') . (!$filtros && empty($int['pausadas']) && empty($int['planejamento']) && empty($int['atrasadas']) && empty($int['concluidas']) && empty($int['andamento']) && !$c['obraAchada'] ? ' ativas' : '');
    $itens = array_map(function ($o) use ($c) {
        $i = ass_item_obra($o, $c);
        return ['titulo' => $i['titulo'], 'info' => ($o['cliente'] ? $o['cliente'] . ' · ' : '') . $i['info'], 'selo' => $o['farol'] ? ['verde' => 'Verde', 'amarelo' => 'Amarelo', 'vermelho' => 'Vermelho'][$o['farol']] : null,
                'selo_cor' => ['verde' => 'verd', 'amarelo' => 'amar', 'vermelho' => 'verm'][$o['farol']] ?? 'cinza', 'link' => $i['link']];
    }, array_slice($L, 0, 8));
    return ['tipo' => 'obras', 'titulo' => $tit, 'sub' => 'Farol: diferença entre o avanço real e o previsto', 'itens' => $itens, 'total' => $n, 'chave' => 'obras'];
}
function ass_resp_obra(array $o, array $c): array {
    $i = ass_item_obra($o, $c);
    $c2 = array_merge($c, ['int' => ['semana' => true], 'pessoaAchada' => [], 'livre' => []]);
    $prox = ass_resp_atividades($c2);
    $atras = ass_resp_atividades(array_merge($c2, ['int' => ['atrasadas' => true]]));
    $itens = array_merge($atras['itens'], array_values(array_filter($prox['itens'], fn($x) => !in_array($x['link']['id'], array_column(array_column($atras['itens'], 'link'), 'id'), true))));
    return ['tipo' => 'obra', 'titulo' => $i['titulo'], 'sub' => $i['info'], 'itens' => array_slice($itens, 0, 8), 'total' => count($itens),
            'nota' => $itens ? 'Atrasadas e as atividades dos próximos 7 dias' : 'Nada atrasado e nada previsto para os próximos 7 dias',
            'acao' => ['rotulo' => 'Abrir a obra', 'link' => $i['link']], 'chave' => 'obra-' . $o['id']];
}
function ass_resp_pessoas(array $c): array {
    if ($c['u']['perfil'] === 'funcionario') return ['tipo' => 'pessoas', 'titulo' => 'Sem acesso à lista de pessoas', 'itens' => [], 'total' => 0];
    $sqlObra = '';
    if ($c['obraAchada']) $sqlObra = ' AND f.id IN (SELECT responsavel_id FROM atividades WHERE excluido_em IS NULL AND responsavel_id IS NOT NULL AND projeto_id IN (' . implode(',', array_map('intval', array_keys($c['obraAchada']))) . '))';
    $L = todos("SELECT f.id, f.nome, f.cargo FROM funcionarios f WHERE f.empresa_id = ? AND f.excluido_em IS NULL AND f.ativo = 1$sqlObra ORDER BY f.nome", [$c['eid']]);
    $itens = array_map(function ($p) use ($c) { $i = ass_item_pessoa($p, $c); return ['titulo' => $i['titulo'], 'info' => $i['info'], 'link' => $i['link']]; }, array_slice($L, 0, 8));
    $tit = ass_plural(count($L), 'pessoa', 'pessoas') . ($c['obraAchada'] ? ' trabalhando na ' . (array_values($c['obraAchada'])[0]['codigo'] ?: 'obra') : ' na equipe');
    return ['tipo' => 'pessoas', 'titulo' => $tit, 'sub' => '', 'itens' => $itens, 'total' => count($L), 'chave' => 'pessoas'];
}
function ass_resp_documentos(array $c): array {
    if ($c['u']['perfil'] === 'funcionario') return ['tipo' => 'documentos', 'titulo' => 'Os documentos de NR ficam com a gestão', 'itens' => [], 'total' => 0];
    $hoje = ass_hoje(); $lim = Calendario::mais($hoje, 30); $int = $c['int'];
    $pess = todos('SELECT id, nome, cargo FROM funcionarios WHERE empresa_id = ? AND excluido_em IS NULL AND ativo = 1 AND tipo_trabalho <> \'escritorio\'' .
        ($c['pessoaAchada'] ? ' AND id IN (' . implode(',', array_map('intval', array_keys($c['pessoaAchada']))) . ')' : ''), [$c['eid']]);
    $docs = []; foreach (todos('SELECT funcionario_id, nr, documento, vence_em, invalidado_por_afastamento FROM v_documentos_situacao WHERE empresa_id = ?', [$c['eid']]) as $d) $docs[(int)$d['funcionario_id']][] = $d;
    $itens = [];
    foreach ($pess as $p) {
        $D = array_filter($docs[(int)$p['id']] ?? [], fn($d) => !$c['nr'] || $d['nr'] === $c['nr']);
        $venc = array_filter($D, fn($d) => $d['invalidado_por_afastamento'] || ($d['vence_em'] && $d['vence_em'] < $hoje));
        $vcdo = array_filter($D, fn($d) => !$d['invalidado_por_afastamento'] && $d['vence_em'] && $d['vence_em'] >= $hoje && $d['vence_em'] <= $lim);
        $link = ['tipo' => 'pessoa', 'id' => (int)$p['id'], 'texto' => explode(' ', $p['nome'])[0]];
        if ($c['semNr']) { if (!$D || count($venc) === count($D)) $itens[] = ['titulo' => $p['nome'], 'info' => ($p['cargo'] ?: '') . ($D ? ' · ' . $c['nr'] . ' vencida' : ' · nenhum documento de ' . $c['nr']), 'selo' => 'Sem ' . $c['nr'], 'selo_cor' => 'verm', 'link' => $link]; continue; }
        if (!empty($int['vencendo']) && empty($int['vencidos'])) { foreach ($vcdo as $d) $itens[] = ['titulo' => $p['nome'], 'info' => $d['documento'] . ' · vence ' . ass_data_br($d['vence_em']), 'selo' => 'Vencendo', 'selo_cor' => 'amar', 'link' => $link]; continue; }
        foreach ($venc as $d) $itens[] = ['titulo' => $p['nome'], 'info' => $d['documento'] . ($d['invalidado_por_afastamento'] ? ' · invalidado por afastamento' : ' · venceu ' . ass_data_br($d['vence_em'])), 'selo' => 'Vencido', 'selo_cor' => 'verm', 'link' => $link];
        if (empty($int['vencidos'])) foreach ($vcdo as $d) $itens[] = ['titulo' => $p['nome'], 'info' => $d['documento'] . ' · vence ' . ass_data_br($d['vence_em']), 'selo' => 'Vencendo', 'selo_cor' => 'amar', 'link' => $link];
    }
    $n = count($itens); $nrT = $c['nr'] ?: 'NR';
    $tit = $c['semNr'] ? ass_plural($n, "pessoa sem $nrT válida", "pessoas sem $nrT válida")
        : ass_plural($n, 'documento', 'documentos') . " de $nrT " . (!empty($int['vencendo']) && empty($int['vencidos']) ? 'vencendo em 30 dias' : (!empty($int['vencidos']) ? 'vencidos' : 'vencidos ou vencendo em 30 dias'));
    return ['tipo' => 'documentos', 'titulo' => $tit, 'sub' => 'Pessoas de campo ativas', 'itens' => array_slice($itens, 0, 8), 'total' => $n, 'chave' => 'docs'];
}
function ass_resp_rdos(array $c): array {
    $hoje = ass_hoje(); $int = $c['int'];
    $sql = 'SELECT r.id, r.projeto_id, r.data, r.situacao, r.efetivo, p.codigo, p.nome FROM rdos r JOIN projetos p ON p.id = r.projeto_id WHERE r.empresa_id = ? AND r.excluido_em IS NULL' . str_replace('a.projeto_id', 'r.projeto_id', ass_obra_sql($c));
    $p = [$c['eid']];
    if (!empty($int['hoje'])) { $sql .= ' AND r.data = ?'; $p[] = $hoje; }
    if (!empty($int['ontem'])) { $sql .= ' AND r.data = ?'; $p[] = Calendario::mais($hoje, -1); }
    if (!empty($int['semana'])) { $sql .= ' AND r.data >= ?'; $p[] = Calendario::mais($hoje, -7); }
    if (!empty($int['rascunho'])) $sql .= " AND r.situacao = 'Rascunho'";
    if (!empty($int['assinatura'])) $sql .= " AND r.situacao IN ('Fechado','Entregue')";
    $L = todos($sql . ' ORDER BY r.data DESC LIMIT 50', $p);
    $itens = array_map(fn($r) => ['titulo' => 'RDO de ' . ass_data_br($r['data']) . '/' . substr($r['data'], 0, 4) . ' · ' . ($r['codigo'] ?: $r['nome']), 'info' => $r['nome'] . ($r['efetivo'] ? ' · efetivo ' . $r['efetivo'] : ''),
        'selo' => $r['situacao'], 'selo_cor' => $r['situacao'] === 'Rascunho' ? 'amar' : ($r['situacao'] === 'Assinado' ? 'verd' : 'azul'), 'link' => ['tipo' => 'rdo', 'id' => (int)$r['id']]], array_slice($L, 0, 8));
    $tit = ass_plural(count($L), 'RDO', 'RDOs') . (!empty($int['rascunho']) ? ' em rascunho' : '') . (!empty($int['assinatura']) ? ' esperando assinatura' : '') . (!empty($int['hoje']) ? ' de hoje' : '') . (!empty($int['ontem']) ? ' de ontem' : '') . (!empty($int['semana']) ? ' dos últimos 7 dias' : '');
    return ['tipo' => 'rdos', 'titulo' => $tit, 'sub' => count($c['obraAchada']) === 1 ? array_values($c['obraAchada'])[0]['nome'] : '', 'itens' => $itens, 'total' => count($L), 'chave' => 'rdos',
            'nota' => $L ? null : 'A tela de RDO ainda está sendo refeita; os RDOs aparecem aqui assim que forem lançados.'];
}
function ass_resp_recursos(array $c): array {
    $L = todos('SELECT id, nome, tipo, ativo FROM recursos WHERE empresa_id = ? AND excluido_em IS NULL ORDER BY nome', [$c['eid']]);
    if ($c['livre']) $L = array_values(array_filter($L, fn($r) => array_filter($c['livre'], fn($t) => array_filter(ass_tokens($r['nome']), fn($w) => ass_parecido($t, $w)))));
    $itens = array_map(fn($r) => ['titulo' => $r['nome'], 'info' => ucfirst($r['tipo']) . ($r['ativo'] ? '' : ' · inativo'), 'link' => ['tipo' => 'view', 'view' => 'recursos']], array_slice($L, 0, 8));
    return ['tipo' => 'recursos', 'titulo' => ass_plural(count($L), 'recurso', 'recursos') . ($c['livre'] ? ' com "' . implode(' ', $c['livre']) . '"' : ' cadastrados'), 'sub' => '', 'itens' => $itens, 'total' => count($L), 'chave' => 'recursos'];
}

/* ══ Montar obra por perguntas ════════════════════════════════
   Cada atividade: dur (dias fixos) OU taxa (unidades por pessoa-dia) OU por_unid (pessoas-dia por unidade, + fixo);
   max = pessoas que rendem ao mesmo tempo; se = item do escopo; pred / par (= ligação quando "em paralelo"). */
const ASS_TIPOS = [
    'subestacao' => ['nome' => 'Subestação', 'desc' => 'Abrigada ou ao tempo, média tensão', 'tipo_servico' => 'Elétrica', 'titulo' => 'Subestação {n_trafos} × {kva} kVA',
        'escopo' => [['civil', 'Obra civil (bases e canaletas)', true], ['trafo', 'Transformadores', true], ['cubiculo', 'Cubículo de média tensão', true],
                     ['malha', 'Malha de aterramento', true], ['cabos', 'Cabos de média tensão', true], ['qgbt', 'QGBT e alimentadores de baixa tensão', false], ['comiss', 'Ensaios e comissionamento', true]],
        'perguntas' => [
            ['n_trafos', 'Quantos transformadores?', [1, 2, 3, 4], 1, 'transformadores', 'trafo'],
            ['kva', 'De que potência cada um (kVA)?', [300, 500, 750, 1000, 1500, 2000], 1000, 'kVA', 'trafo'],
            ['m_cabo_mt', 'Quantos metros de cabo de média tensão, mais ou menos?', [100, 200, 350, 500, 800], 200, 'm', 'cabos'],
            ['m_malha', 'Quantos metros de cabo na malha de aterramento?', [100, 200, 400, 600], 200, 'm', 'malha'],
            ['m_cabo_bt', 'Quantos metros de cabo de baixa tensão nos alimentadores?', [200, 500, 1000, 2000], 500, 'm', 'qgbt']],
        'atividades' => [
            ['mob', 'Mobilização', 'Mobilização de equipe e canteiro', 'dur' => 3, 'cargo' => 'encarregado'],
            ['integ', 'Mobilização', 'Integração e treinamentos (NR-10, NR-35)', 'dur' => 1, 'pred' => ['mob']],
            ['lev', 'Mobilização', 'Levantamento de campo e conferência do projeto', 'dur' => 3, 'pred' => ['integ'], 'cargo' => 'engenheir'],
            ['bases', 'Obra civil e infraestrutura', 'Bases civis dos transformadores', 'por_unid' => ['n_trafos', 16], 'max' => 6, 'pred' => ['lev'], 'se' => 'civil'],
            ['eletrodutos', 'Obra civil e infraestrutura', 'Eletrodutos, eletrocalhas e caixas de passagem', 'taxa' => ['m_cabo_mt', 12.5], 'dur' => 8, 'max' => 6, 'pred' => ['bases:CC+2'], 'se' => 'civil'],
            ['malha', 'Obra civil e infraestrutura', 'Malha de aterramento ({m_malha} m)', 'taxa' => ['m_malha', 6], 'max' => 6, 'pred' => ['bases'], 'par' => ['bases:CC+3'], 'se' => 'malha'],
            ['trafos', 'Montagem eletromecânica', 'Instalação dos transformadores ({n_trafos} × {kva} kVA)', 'por_unid' => ['n_trafos', 8], 'max' => 6, 'pred' => ['bases'], 'se' => 'trafo'],
            ['cubiculo', 'Montagem eletromecânica', 'Montagem do cubículo de média tensão', 'por_unid' => [null, 0, 32], 'max' => 4, 'pred' => ['trafos'], 'par' => ['trafos:CC+2'], 'se' => 'cubiculo'],
            ['cabos', 'Montagem eletromecânica', 'Cabos de média tensão e terminações ({m_cabo_mt} m)', 'taxa' => ['m_cabo_mt', 17.5], 'max' => 6, 'pred' => ['cubiculo', 'eletrodutos'], 'se' => 'cabos'],
            ['qgbt', 'Montagem eletromecânica', 'QGBT e alimentadores de baixa tensão ({m_cabo_bt} m)', 'taxa' => ['m_cabo_bt', 15], 'max' => 6, 'pred' => ['trafos'], 'par' => ['trafos:CC+2'], 'se' => 'qgbt'],
            ['ensaios', 'Comissionamento', 'Ensaios e testes (isolamento, relés de proteção)', 'dur' => 5, 'pred' => ['cabos', 'qgbt', 'malha'], 'cargo' => 'engenheir', 'se' => 'comiss'],
            ['asbuilt', 'Comissionamento', 'As built e ART de execução', 'dur' => 3, 'pred' => ['ensaios:CC'], 'cargo' => 'engenheir', 'se' => 'comiss'],
            ['energ', 'Comissionamento', 'Energização', 'dur' => 0, 'pred' => ['ensaios', 'cabos', 'qgbt']]]],
    'iluminacao' => ['nome' => 'Retrofit de iluminação', 'desc' => 'Troca por LED em galpão ou área industrial', 'tipo_servico' => 'Elétrica', 'titulo' => 'Retrofit de iluminação · {n_lum} luminárias',
        'escopo' => [['lev', 'Levantamento das luminárias existentes', true], ['retirada', 'Retirada das luminárias antigas', true], ['infra', 'Eletrocalhas e perfilados novos', true],
                     ['circ', 'Circuitos e comandos', true], ['medicao', 'Medição de iluminância', true], ['descarte', 'Descarte das lâmpadas antigas', true]],
        'perguntas' => [
            ['n_lum', 'Quantas luminárias?', [50, 100, 200, 400], 100, 'luminárias', null],
            ['altura', 'Qual a altura de instalação?', ['Até 6 m' => 1.0, 'De 6 a 10 m' => 1.3, 'Acima de 10 m' => 1.6], 'De 6 a 10 m', 'fator', null],
            ['m_eletrocalha', 'Quantos metros de eletrocalha e perfilado?', [50, 100, 200, 400], 100, 'm', 'infra']],
        'atividades' => [
            ['lev', 'Mobilização e levantamento', 'Levantamento das luminárias existentes', 'taxa' => ['n_lum', 60], 'max' => 2, 'se' => 'lev', 'cargo' => 'engenheir'],
            ['integ', 'Mobilização e levantamento', 'Integração NR-10 e NR-35', 'dur' => 1, 'pred' => ['lev']],
            ['retirada', 'Retirada e infraestrutura', 'Desmontagem das luminárias antigas', 'taxa' => ['n_lum', 15, 'altura'], 'max' => 8, 'pred' => ['integ'], 'se' => 'retirada'],
            ['infra', 'Retirada e infraestrutura', 'Eletrocalhas e perfilados ({m_eletrocalha} m)', 'taxa' => ['m_eletrocalha', 12, 'altura'], 'max' => 6, 'pred' => ['retirada:CC+1'], 'se' => 'infra'],
            ['montagem', 'Instalação', 'Montagem das {n_lum} luminárias LED', 'taxa' => ['n_lum', 6, 'altura'], 'max' => 8, 'pred' => ['infra', 'retirada'], 'par' => ['infra:CC+2', 'retirada:CC+2']],
            ['circ', 'Instalação', 'Circuitos e comandos', 'taxa' => ['n_lum', 20], 'max' => 6, 'pred' => ['montagem:CC+2'], 'se' => 'circ'],
            ['medicao', 'Comissionamento', 'Medição de iluminância', 'dur' => 2, 'pred' => ['circ', 'montagem'], 'cargo' => 'engenheir', 'se' => 'medicao'],
            ['descarte', 'Comissionamento', 'Descarte das lâmpadas antigas', 'dur' => 1, 'pred' => ['retirada'], 'se' => 'descarte'],
            ['entrega', 'Comissionamento', 'Entrega ao cliente', 'dur' => 0, 'pred' => ['medicao', 'descarte', 'circ', 'montagem']]]],
    'nr12' => ['nome' => 'Adequação NR-12', 'desc' => 'Proteções e sistema de segurança de máquinas', 'tipo_servico' => 'NR-12', 'titulo' => 'Adequação NR-12 · {n_maq} máquinas',
        'escopo' => [['apreciacao', 'Apreciação de riscos e plano de ação', true], ['projeto', 'Projeto das proteções', true], ['compras', 'Compra dos componentes', true],
                     ['protecoes', 'Proteções fixas e móveis', true], ['eletrico', 'Circuitos de segurança (relés, emergência, intertravamentos)', true],
                     ['treino', 'Treinamento dos operadores', true], ['laudo', 'Laudo final e ART', true]],
        'perguntas' => [
            ['n_maq', 'Quantas máquinas?', [1, 3, 5, 10, 20], 5, 'máquinas', null],
            ['complex', 'Qual a complexidade das máquinas?', ['Simples (proteções fixas)' => 1.0, 'Média (proteções móveis e intertravamentos)' => 1.5, 'Complexa (prensas, robôs, CLP de segurança)' => 2.2], 'Média (proteções móveis e intertravamentos)', 'fator', null],
            ['prazo_compra', 'Em quantos dias úteis os componentes chegam?', [10, 15, 20, 30], 15, 'dias', 'compras']],
        'atividades' => [
            ['aprec', 'Diagnóstico', 'Inventário e apreciação de riscos (ABNT NBR ISO 12100)', 'por_unid' => ['n_maq', 1, 0, 'complex'], 'max' => 2, 'se' => 'apreciacao', 'cargo' => 'engenheir'],
            ['relat', 'Diagnóstico', 'Relatório técnico e plano de ação', 'por_unid' => ['n_maq', 0.5, 2], 'max' => 1, 'pred' => ['aprec'], 'se' => 'apreciacao', 'cargo' => 'engenheir'],
            ['aprov', 'Diagnóstico', 'Aprovação do cliente', 'dur' => 2, 'pred' => ['relat']],
            ['projeto', 'Projeto e compras', 'Projeto das proteções e do sistema de segurança', 'por_unid' => ['n_maq', 1, 2, 'complex'], 'max' => 2, 'pred' => ['aprov'], 'se' => 'projeto', 'cargo' => 'engenheir'],
            ['compras', 'Projeto e compras', 'Compra dos componentes de segurança', 'qtd_dias' => 'prazo_compra', 'pred' => ['projeto'], 'par' => ['projeto:CC+3'], 'se' => 'compras'],
            ['protecoes', 'Execução', 'Proteções fixas e móveis', 'por_unid' => ['n_maq', 3, 0, 'complex'], 'max' => 6, 'pred' => ['compras'], 'se' => 'protecoes', 'cargo' => 'encarregado'],
            ['eletrico', 'Execução', 'Circuitos de segurança (relés, emergência, intertravamentos)', 'por_unid' => ['n_maq', 3, 0, 'complex'], 'max' => 4, 'pred' => ['compras'], 'se' => 'eletrico', 'cargo' => 'eletricista'],
            ['sinal', 'Execução', 'Sinalização e procedimentos', 'por_unid' => ['n_maq', 0.5], 'max' => 2, 'pred' => ['protecoes'], 'par' => ['protecoes:CC+2']],
            ['testes', 'Validação', 'Testes das funções de segurança', 'por_unid' => ['n_maq', 0.5, 0, 'complex'], 'max' => 2, 'pred' => ['protecoes', 'eletrico'], 'cargo' => 'engenheir'],
            ['treino', 'Validação', 'Treinamento dos operadores', 'por_unid' => ['n_maq', 0.3, 1], 'max' => 1, 'pred' => ['testes'], 'se' => 'treino'],
            ['laudo', 'Validação', 'Laudo final e ART', 'por_unid' => ['n_maq', 0.3, 2], 'max' => 1, 'pred' => ['testes', 'sinal'], 'par' => ['testes:CC+1', 'sinal'], 'se' => 'laudo', 'cargo' => 'engenheir']]],
    'spda' => ['nome' => 'SPDA e aterramento', 'desc' => 'Para-raios conforme ABNT NBR 5419', 'tipo_servico' => 'SPDA', 'titulo' => 'SPDA · {area} m²',
        'escopo' => [['projeto', 'Levantamento e projeto executivo', true], ['captacao', 'Subsistema de captação', true], ['descidas', 'Descidas', true],
                     ['aterramento', 'Malha de aterramento', true], ['equipot', 'Equipotencialização', true], ['medicao', 'Medições e relatório de inspeção', true]],
        'perguntas' => [
            ['area', 'Qual a área do telhado (m²)?', [500, 1000, 3000, 6000, 10000], 3000, 'm²', 'captacao'],
            ['altura', 'Qual a altura da edificação?', ['Até 10 m' => 1.0, 'De 10 a 20 m' => 1.3, 'Acima de 20 m' => 1.7], 'Até 10 m', 'fator', null],
            ['n_descidas', 'Quantas descidas?', [4, 8, 12, 20], 8, 'descidas', 'descidas'],
            ['m_malha', 'Quantos metros de cabo na malha de aterramento?', [50, 100, 200, 400], 100, 'm', 'aterramento']],
        'atividades' => [
            ['projeto', 'Preparação', 'Levantamento e projeto executivo (NBR 5419)', 'por_unid' => ['area', 0.0005, 2], 'max' => 1, 'se' => 'projeto', 'cargo' => 'engenheir'],
            ['integ', 'Preparação', 'Integração NR-35', 'dur' => 1, 'pred' => ['projeto']],
            ['captacao', 'Execução', 'Subsistema de captação ({area} m²)', 'taxa' => ['area', 150, 'altura'], 'max' => 6, 'pred' => ['integ'], 'se' => 'captacao', 'cargo' => 'encarregado'],
            ['descidas', 'Execução', '{n_descidas} descidas', 'por_unid' => ['n_descidas', 0.5, 0, 'altura'], 'max' => 4, 'pred' => ['captacao:CC+2'], 'se' => 'descidas'],
            ['aterr', 'Execução', 'Malha de aterramento ({m_malha} m)', 'taxa' => ['m_malha', 8], 'max' => 6, 'pred' => ['integ'], 'se' => 'aterramento'],
            ['equipot', 'Execução', 'Equipotencialização', 'dur' => 2, 'max' => 2, 'pred' => ['aterr'], 'par' => ['aterr:CC+1'], 'se' => 'equipot'],
            ['medicao', 'Entrega', 'Medições de continuidade e resistência de aterramento', 'dur' => 2, 'pred' => ['descidas', 'aterr', 'equipot', 'captacao'], 'cargo' => 'engenheir', 'se' => 'medicao'],
            ['relat', 'Entrega', 'Relatório de inspeção e ART', 'dur' => 2, 'pred' => ['medicao'], 'par' => ['medicao:CC+1'], 'cargo' => 'engenheir', 'se' => 'medicao']]],
    'qgbt' => ['nome' => 'QGBT e alimentadores', 'desc' => 'Quadros de baixa tensão e cabos', 'tipo_servico' => 'Elétrica', 'titulo' => 'QGBT e alimentadores · {n_circ} circuitos',
        'escopo' => [['conf', 'Conferência do projeto e dos materiais', true], ['fixacao', 'Fixação dos quadros', true], ['lanc', 'Lançamento dos cabos', true],
                     ['conex', 'Conexões e identificação', true], ['testes', 'Ensaios e energização', true]],
        'perguntas' => [
            ['n_paineis', 'Quantos quadros ou painéis?', [1, 2, 4, 6], 1, 'quadros', 'fixacao'],
            ['n_circ', 'Quantos circuitos alimentadores?', [6, 12, 24, 48], 12, 'circuitos', null],
            ['m_cabo', 'Quantos metros de cabo, somando todos?', [200, 500, 1000, 2000], 500, 'm', 'lanc']],
        'atividades' => [
            ['conf', 'Preparação', 'Conferência do projeto e dos materiais', 'dur' => 2, 'se' => 'conf', 'cargo' => 'engenheir'],
            ['integ', 'Preparação', 'Integração NR-10', 'dur' => 1, 'pred' => ['conf']],
            ['fix', 'Montagem', 'Fixação dos {n_paineis} quadros', 'por_unid' => ['n_paineis', 4], 'max' => 4, 'pred' => ['integ'], 'se' => 'fixacao', 'cargo' => 'encarregado'],
            ['lanc', 'Montagem', 'Lançamento dos cabos alimentadores ({m_cabo} m)', 'taxa' => ['m_cabo', 20], 'max' => 8, 'pred' => ['fix'], 'par' => ['fix:CC+1'], 'se' => 'lanc', 'cargo' => 'eletricista'],
            ['conex', 'Montagem', 'Conexões e identificação ({n_circ} circuitos)', 'por_unid' => ['n_circ', 0.5], 'max' => 4, 'pred' => ['lanc'], 'par' => ['lanc:CC+3'], 'se' => 'conex'],
            ['testes', 'Testes', 'Ensaio de isolamento e reaperto', 'por_unid' => ['n_circ', 0.15, 1], 'max' => 2, 'pred' => ['conex'], 'se' => 'testes', 'cargo' => 'engenheir'],
            ['energ', 'Testes', 'Energização', 'dur' => 0, 'pred' => ['testes', 'conex']]]],
    'generica' => ['nome' => 'Outro tipo (genérica)', 'desc' => 'Você diz as etapas e quantos dias cada uma leva', 'tipo_servico' => '', 'titulo' => 'Nova obra',
        'etapas' => [['Mobilização', 3], ['Levantamento e projeto', 5], ['Compras e logística', 10], ['Execução', 20], ['Testes e comissionamento', 5], ['Entrega e documentação', 3]]],
];

/** GET /api/assistente/tipos — os tipos de obra com o escopo e as perguntas de cada um. */
function rota_assistente_tipos(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $out = [];
    foreach (ASS_TIPOS as $id => $t) {
        $x = ['id' => $id, 'nome' => $t['nome'], 'desc' => $t['desc'], 'tipo_servico' => $t['tipo_servico']];
        if ($id === 'generica') $x['etapas'] = array_map(fn($e) => ['nome' => $e[0], 'dias' => $e[1]], $t['etapas']);
        else {
            $x['escopo'] = array_map(fn($e) => ['id' => $e[0], 'nome' => $e[1], 'padrao' => $e[2]], $t['escopo']);
            $x['perguntas'] = array_map(function ($p) {
                $fator = $p[4] === 'fator';
                return ['id' => $p[0], 'texto' => $p[1], 'opcoes' => $fator ? array_keys($p[2]) : $p[2], 'padrao' => $p[3], 'unidade' => $fator ? '' : $p[4], 'escolha' => $fator, 'se' => $p[5]];
            }, $t['perguntas']);
        }
        $out[] = $x;
    }
    return ['tipos' => $out];
}

function ass_fmt_num(float $n): string { return $n == floor($n) ? number_format($n, 0, ',', '.') : number_format($n, 1, ',', '.'); }

/** Gera as linhas do cronograma a partir das respostas. Devolve [linhas no formato de linhas_para_estrutura, explicações, título, tipo_servico]. */
function ass_gerar(array $d, int $eid): array {
    $tid = (string)($d['tipo'] ?? '');
    if (!isset(ASS_TIPOS[$tid])) throw new ErroApi('Escolha o tipo de serviço');
    $T = ASS_TIPOS[$tid];
    $equipe = max(1, min(60, (int)($d['equipe'] ?? 4)));
    $par = !empty($d['paralelo']);
    $resp = null;
    if (!empty($d['encarregado_id'])) { $f = um('SELECT nome FROM funcionarios WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [(int)$d['encarregado_id'], $eid]); if ($f) $resp = $f['nome']; }
    if ($tid === 'generica') {
        $et = array_values(array_filter(is_array($d['etapas'] ?? null) ? $d['etapas'] : array_map(fn($e) => ['nome' => $e[0], 'dias' => $e[1]], $T['etapas']), fn($e) => trim((string)($e['nome'] ?? '')) !== ''));
        if (!$et) throw new ErroApi('Diga pelo menos uma etapa');
        if (count($et) > 30) throw new ErroApi('Até 30 etapas');
        $linhas = []; $expl = [];
        foreach ($et as $i => $e) {
            $dias = max(0, min(999, (int)round((float)($e['dias'] ?? 1))));
            $pred = $i ? (string)$i : '';
            if ($par && $i && preg_match('/compra|suprimento|logistic/', ass_norm((string)$e['nome']))) $pred = $i . 'CC+2';
            $linhas[] = ['nivel' => 0, 'descricao' => mb_substr(trim((string)$e['nome']), 0, 200), 'duracao' => $dias, 'pred' => $pred, 'responsavel' => $resp];
            $expl[] = $dias . ' ' . ($dias === 1 ? 'dia' : 'dias') . ' informados por você';
        }
        return [$linhas, $expl, trim((string)($d['titulo'] ?? '')) ?: 'Nova obra', '', (bool)array_filter($et, fn($e) => preg_match('/compra|suprimento|logistic/', ass_norm((string)$e['nome'])))];
    }
    $escopo = isset($d['escopo']) && is_array($d['escopo']) ? array_map('strval', $d['escopo']) : array_map(fn($e) => $e[0], array_filter($T['escopo'], fn($e) => $e[2]));
    if (!array_intersect($escopo, array_column($T['escopo'], 0))) throw new ErroApi('Marque pelo menos um item do escopo');
    $qtd = []; $fat = []; $temPar = false;
    foreach ($T['perguntas'] as $p) {
        $v = $d['qtd'][$p[0]] ?? $p[3];
        if ($p[4] === 'fator') { $v = (string)$v; if (!isset($p[2][$v])) $v = $p[3]; $fat[$p[0]] = (float)$p[2][$v]; $qtd[$p[0]] = $v; }
        else { $v = (float)str_replace(',', '.', (string)$v); $qtd[$p[0]] = $v > 0 ? min($v, 1e6) : (float)$p[3]; }
    }
    $dentro = fn($a) => empty($a['se']) || in_array($a['se'], $escopo, true);
    $A = []; foreach ($T['atividades'] as $a) $A[$a[0]] = $a;
    $inc = array_filter($A, $dentro);
    if (!$inc) throw new ErroApi('Marque pelo menos um item do escopo');
    // ligações: atividade fora do escopo passa adiante as predecessoras dela
    $resolver = function (string $ref, int $prof = 0) use (&$resolver, $A, $inc, $par): array {
        [$id, $tipo] = array_pad(explode(':', $ref, 2), 2, '');
        if (!isset($A[$id]) || $prof > 20) return [];
        if (isset($inc[$id])) return [[$id, $tipo]];
        $out = []; foreach (($par && isset($A[$id]['par'])) ? $A[$id]['par'] : ($A[$id]['pred'] ?? []) as $r) $out = array_merge($out, $resolver($r, $prof + 1));
        return $out;
    };
    $fmt = function (string $s) use ($qtd) { return preg_replace_callback('/\{(\w+)\}/', fn($m) => is_numeric($qtd[$m[1]] ?? null) ? ass_fmt_num((float)$qtd[$m[1]]) : (string)($qtd[$m[1]] ?? ''), $s); };
    $unid = []; $seP = []; foreach ($T['perguntas'] as $p) { $unid[$p[0]] = $p[4]; $seP[$p[0]] = $p[5]; }
    $ativa = fn(string $campo) => empty($seP[$campo]) || in_array($seP[$campo], $escopo, true);
    // linhas: etapa (nível 0) e atividades (nível 1)
    $linhas = []; $expl = []; $ref = []; $etapaAtual = null; $n = 0;
    foreach ($inc as $id => $a) {
        if ($a[1] !== $etapaAtual) { $etapaAtual = $a[1]; $linhas[] = ['nivel' => 0, 'descricao' => $a[1]]; $expl[] = null; $n++; }
        $p = min($equipe, $a['max'] ?? $equipe);
        if (isset($a['qtd_dias'])) { $dur = (int)$qtd[$a['qtd_dias']]; $ex = "$dur dias úteis até os componentes chegarem"; }
        elseif (isset($a['taxa']) && (!isset($a['dur']) || $ativa($a['taxa'][0]))) {
            [$campo, $taxa] = $a['taxa']; $f = isset($a['taxa'][2]) ? $fat[$a['taxa'][2]] : 1.0;
            $q = $qtd[$campo]; $porDia = $taxa * $p / $f;
            $dur = max(1, (int)ceil($q / $porDia - 1e-9));
            $ex = ass_fmt_num($q) . ' ' . $unid[$campo] . ' ÷ ' . ass_fmt_num(round($porDia, 1)) . ' ' . $unid[$campo] . ' por dia com ' . ass_plural($p, 'pessoa', 'pessoas') . ' = ' . ass_plural($dur, 'dia', 'dias');
        } elseif (isset($a['por_unid'])) {
            $campo = $a['por_unid'][0]; $pu = (float)$a['por_unid'][1]; $fixo = (float)($a['por_unid'][2] ?? 0); $f = isset($a['por_unid'][3]) ? $fat[$a['por_unid'][3]] : 1.0;
            $q = $campo ? $qtd[$campo] : 0; $hh = ($fixo + $q * $pu) * $f;
            $dur = max(1, (int)ceil($hh / $p - 1e-9));
            $ex = ($campo ? ass_fmt_num($q) . ' ' . $unid[$campo] . ' × ' . ass_fmt_num($pu * $f) . ($fixo ? ' + ' . ass_fmt_num($fixo * $f) : '') : ass_fmt_num($hh)) . ' pessoas-dia ÷ ' . ass_plural($p, 'pessoa', 'pessoas') . ' = ' . ass_plural($dur, 'dia', 'dias');
        } else { $dur = (int)($a['dur'] ?? 1); $ex = $dur ? 'Duração padrão: ' . ass_plural($dur, 'dia', 'dias') : 'Marco (dia da entrega)'; }
        $preds = [];
        $lig = ($par && isset($a['par'])) ? $a['par'] : ($a['pred'] ?? []);
        if (isset($a['par'])) $temPar = true;
        foreach ($lig as $r) foreach ($resolver($r) as [$pid, $tp]) $preds[$pid . $tp] = [$pid, $tp];
        $n++; $ref[$id] = $n;
        $linhas[] = ['nivel' => 1, '_id' => $id, 'descricao' => mb_substr($fmt($a[2]), 0, 200), 'duracao' => $dur, '_preds' => array_values($preds), 'cargo' => $a['cargo'] ?? null,
                     'responsavel' => ($a['cargo'] ?? '') === 'engenheir' ? null : $resp];
        $expl[] = $ex;
    }
    // tira ligações redundantes: se B já depende de A por outro caminho, a ligação direta A→B (término-início) sobra
    $grafo = []; foreach ($linhas as $l) if (isset($l['_id'])) $grafo[$l['_id']] = array_column(array_filter($l['_preds'], fn($x) => $x[1] === ''), 0);
    $depende = function (string $x, string $alvo, array $vis = []) use (&$depende, $grafo): bool {
        foreach ($grafo[$x] ?? [] as $y) { if ($y === $alvo) return true; if (!isset($vis[$y])) { $vis[$y] = true; if ($depende($y, $alvo, $vis)) return true; } }
        return false;
    };
    foreach ($linhas as &$l) if (isset($l['_preds'])) {
        $l['_preds'] = array_values(array_filter($l['_preds'], function ($pp) use ($l, $depende) {
            if ($pp[1] !== '') return true;
            foreach ($l['_preds'] as $q) if ($q[0] !== $pp[0] && $depende($q[0], $pp[0])) return false;
            return true;
        }));
    }
    unset($l);
    foreach ($linhas as &$l) if (isset($l['_preds'])) { $l['pred'] = implode(';', array_map(fn($x) => $ref[$x[0]] . $x[1], array_filter($l['_preds'], fn($x) => isset($ref[$x[0]])))); unset($l['_preds'], $l['_id']); }
    unset($l);
    return [$linhas, $expl, trim((string)($d['titulo'] ?? '')) ?: $fmt($T['titulo']), $T['tipo_servico'], $temPar];
}

/** Datas na memória, com as mesmas regras do cronograma (ligações empurram, etapas acompanham), e caminho crítico. */
function ass_agendar(array $itens, array $deps, string $inicio, Calendario $cal): array {
    $A = []; $filhos = [];
    foreach ($itens as $it) if ($it['pai_ref']) $filhos[$it['pai_ref']][] = $it['ref'];
    foreach ($itens as $it) {
        $a = ['id' => $it['ref'], 'pai_id' => $it['pai_ref'], 'descricao' => $it['descricao'], 'situacao' => 'Pendente', '_filhos' => !empty($filhos[$it['ref']]), 'inicio' => null, 'fim' => null, 'dur' => (float)($it['duracao_dias'] ?? 1)];
        if (!$a['_filhos']) { $a['inicio'] = $cal->proximoUtil($inicio); $a['fim'] = $cal->fim($a['inicio'], $a['dur']); }
        $A[$it['ref']] = $a;
    }
    $pred = []; $succ = []; $grau = array_fill_keys(array_keys($A), 0); $D = [];
    foreach ($deps as $d) { $x = $d['antes_ref']; $y = $d['depois_ref']; if (!isset($A[$x], $A[$y])) continue; $pred[$y][] = $d; $succ[$x][] = $y; $grau[$y]++; $D[] = ['antes_id' => $x, 'depois_id' => $y, 'tipo' => $d['tipo'], 'folga_dias' => $d['folga']]; }
    $fila = array_keys(array_filter($grau, fn($g) => $g === 0));
    while ($fila) {
        $id = array_shift($fila); $a = &$A[$id];
        if (!$a['_filhos'] && !empty($pred[$id])) {
            $req = null; $dur = $a['dur'];
            foreach ($pred[$id] as $d) {
                $p = $A[$d['antes_ref']]; if (!$p['inicio']) continue; $fol = (int)$d['folga'];
                switch ($d['tipo']) {
                    case 'CC': $r = $cal->proximoUtil($cal->andar($cal->proximoUtil($p['inicio']), $fol)); break;
                    case 'TT': $r = $cal->inicioPorFim($cal->andar($p['fim'], $fol), $dur); break;
                    case 'CT': $r = $cal->inicioPorFim($cal->andar($p['inicio'], $fol), $dur); break;
                    default:   $r = $cal->proximoUtil($cal->andar($cal->proximoUtil(Calendario::mais($p['fim'], 1)), $fol));
                }
                if ($req === null || $r > $req) $req = $r;
            }
            if ($req !== null && $a['inicio'] < $req) { $a['inicio'] = $req; $a['fim'] = $cal->fim($req, $dur); }
        }
        unset($a);
        foreach ($succ[$id] ?? [] as $s) if (--$grau[$s] === 0) $fila[] = $s;
    }
    foreach (array_reverse(array_keys($A)) as $id) if ($A[$id]['_filhos']) {
        $ini = null; $fim = null;
        foreach ($filhos[$id] as $f) { $x = $A[$f]; if ($x['inicio'] && ($ini === null || $x['inicio'] < $ini)) $ini = $x['inicio']; if ($x['fim'] && ($fim === null || $x['fim'] > $fim)) $fim = $x['fim']; }
        $A[$id]['inicio'] = $ini; $A[$id]['fim'] = $fim; $A[$id]['dur'] = $ini ? $cal->diasUteis($ini, $fim) : 0;
    }
    $crit = caminho_critico($A, $D, $cal);
    foreach ($A as $id => &$a) $a['critica'] = !empty($crit[$id]);
    unset($a);
    return $A;
}

/** Monta e agenda; devolve a prévia completa com aviso de prazo. */
function ass_previa(array $d, array $u): array {
    $eid = (int)$u['empresa_id'];
    $inicio = !empty($d['inicio']) ? data_ok((string)$d['inicio'], 'início') : ass_hoje();
    $cal = calendario_carregar(!empty($d['calendario_id']) ? (int)$d['calendario_id'] : null, $eid);
    [$linhas, $expl, $titulo, $tipoServ, $temPar] = ass_gerar($d, $eid);
    [$itens, $deps] = linhas_para_estrutura($linhas, $eid, true);
    $A = ass_agendar($itens, $deps, $inicio, $cal);
    $fim = max(array_filter(array_column($A, 'fim')) ?: [$inicio]);
    $ini = min(array_filter(array_column($A, 'inicio')) ?: [$inicio]);
    $out = ['titulo' => $titulo, 'tipo_servico' => $tipoServ, 'inicio' => $ini, 'fim' => $fim, 'dias_uteis' => $cal->diasUteis($ini, $fim),
            'atividades' => count(array_filter($A, fn($a) => !$a['_filhos'])), 'ligacoes' => count($deps), 'prazo' => null, 'sugestoes' => [],
            'linhas' => array_map(fn($it, $i) => ['ref' => $it['ref'], 'nivel' => $it['pai_ref'] ? 1 : 0, 'etapa' => $A[$it['ref']]['_filhos'], 'descricao' => $it['descricao'],
                'dur' => $A[$it['ref']]['dur'], 'inicio' => $A[$it['ref']]['inicio'], 'fim' => $A[$it['ref']]['fim'], 'critica' => $A[$it['ref']]['critica'], 'explica' => $expl[$i] ?? null,
                'pred' => (string)($linhas[$i]['pred'] ?? '')], $itens, array_keys($itens)),
            '_linhas' => $linhas, '_tem_par' => $temPar];
    if (!empty($d['prazo'])) {
        $prazo = data_ok((string)$d['prazo'], 'prazo');
        $cabe = $fim <= $prazo;
        $dias = $cabe ? $cal->diasUteis(Calendario::mais($fim, 1), $prazo) : $cal->diasUteis(Calendario::mais($prazo, 1), $fim);
        $out['prazo'] = ['data' => $prazo, 'cabe' => $cabe, 'dias' => $dias];
    }
    return $out;
}

/** POST /api/assistente/previa — a prévia do cronograma com as respostas até agora, e os ajustes quando o prazo não cabe. */
function rota_assistente_previa(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $d = corpo();
    $r = ass_previa($d, $u);
    if ($r['prazo'] && !$r['prazo']['cabe'] && ($d['tipo'] ?? '') !== '') {
        $cal = calendario_carregar(!empty($d['calendario_id']) ? (int)$d['calendario_id'] : null, (int)$u['empresa_id']);
        $ganho = fn(array $alt) => $cal->diasUteis(Calendario::mais($alt['fim'], 1), $r['fim']);
        $eq = max(1, (int)($d['equipe'] ?? 4)); $sug = [];
        if (($d['tipo'] ?? '') !== 'generica') {
            $melhor = null;
            foreach ([2, 4, 6, 8] as $mais) {
                $alt = ass_previa(array_merge($d, ['equipe' => $eq + $mais]), $u); $g = $ganho($alt);
                if ($g > 0 && ($melhor === null || $g > $melhor[1])) $melhor = [$eq + $mais, $g, $alt['fim'] <= $r['prazo']['data']];
                if ($g > 0 && $alt['fim'] <= $r['prazo']['data']) break;
            }
            if ($melhor) $sug[] = ['id' => 'equipe', 'rotulo' => "Equipe de $eq → {$melhor[0]} pessoas", 'ganho' => $melhor[1], 'cabe' => $melhor[2], 'aplicar' => ['equipe' => $melhor[0]]];
        }
        if ($r['_tem_par'] && empty($d['paralelo'])) {
            $alt = ass_previa(array_merge($d, ['paralelo' => true]), $u); $g = $ganho($alt);
            if ($g > 0) $sug[] = ['id' => 'paralelo', 'rotulo' => 'Adiantar etapas que podem andar em paralelo', 'ganho' => $g, 'cabe' => $alt['fim'] <= $r['prazo']['data'], 'aplicar' => ['paralelo' => true]];
        }
        if (count($sug) === 2 && !$sug[0]['cabe'] && !$sug[1]['cabe']) {
            $alt = ass_previa(array_merge($d, $sug[0]['aplicar'], ['paralelo' => true]), $u); $g = $ganho($alt);
            if ($g > max($sug[0]['ganho'], $sug[1]['ganho'])) $sug[] = ['id' => 'os-dois', 'rotulo' => 'Os dois juntos', 'ganho' => $g, 'cabe' => $alt['fim'] <= $r['prazo']['data'], 'aplicar' => array_merge($sug[0]['aplicar'], ['paralelo' => true])];
        }
        $r['sugestoes'] = $sug;
    }
    unset($r['_linhas'], $r['_tem_par']);
    return $r;
}

/** POST /api/obras/{id}/assistente-montar — cria o cronograma montado pelas perguntas. */
function rota_assistente_montar(int $pid): array {
    [$u, $p] = obra_para_montar($pid);
    $d = corpo();
    if (!empty($d['calendario_id']) && (int)$d['calendario_id'] !== (int)$p['calendario_id']) {
        calendario_da_empresa($u, (int)$d['calendario_id']);
        q('UPDATE projetos SET calendario_id = ? WHERE id = ?', [(int)$d['calendario_id'], $pid]);
    }
    $d['calendario_id'] = $d['calendario_id'] ?? $p['calendario_id'];
    $d['inicio'] = $d['inicio'] ?? $p['inicio'];
    $r = ass_previa($d, $u);
    [$itens, $deps] = linhas_para_estrutura($r['_linhas'], (int)$u['empresa_id'], true);
    $res = inserir_estrutura($u, $pid, $itens, $deps, $cal_ini = ($r['inicio'] ?: inicio_pedido($d, $p)), !empty($d['substituir']));
    // a obra fica com as datas do cronograma (o prazo, se informado, vira o fim previsto)
    $fimObra = !empty($d['prazo']) ? max((string)$d['prazo'], $r['fim']) : $r['fim'];
    q('UPDATE projetos SET inicio = COALESCE(inicio, ?), fim = ?, tipo_servico = COALESCE(NULLIF(tipo_servico, \'\'), ?) WHERE id = ?', [$cal_ini, $fimObra, $r['tipo_servico'] ?: null, $pid]);
    registrar($u, (int)$u['empresa_id'], 'projetos', $pid, 'alterou', null, ['origem' => 'Assistente Task Flow'] + ['tipo' => $d['tipo'] ?? null, 'atividades' => $res['atividades']]);
    return $res + ['fim' => $r['fim']];
}
