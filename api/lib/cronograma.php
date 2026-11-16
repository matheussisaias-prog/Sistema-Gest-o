<?php
/* Mercronos · servidor · cronograma da obra: calendário de trabalho, dias úteis, dependências que empurram datas,
   etapas calculadas, caminho crítico e linhas de base. */
declare(strict_types=1);

/* ══ Calendário de trabalho ═══════════════════════════════════════ */
final class Calendario {
    public array $horas;          // seg..dom
    public float $jornada;
    private array $dias = [];     // 'Y-m-d' => true (feriado ou parado)
    private array $anuais = [];   // 'm-d' => true
    private bool $nacionais;
    private array $cacheAno = [];
    public function __construct(array $horas = [8, 8, 8, 8, 8, 0, 0], bool $nacionais = true, array $excecoes = []) {
        $this->horas = array_map('floatval', array_pad(array_slice($horas, 0, 7), 7, 0));
        $this->jornada = max($this->horas) ?: 8.0;
        $this->nacionais = $nacionais;
        foreach ($excecoes as $e) {
            if (!empty($e['todo_ano'])) { $this->anuais[substr($e['inicio'], 5)] = true; continue; }
            for ($t = strtotime($e['inicio'] . ' UTC'), $f = strtotime($e['fim'] . ' UTC'); $t <= $f; $t += 86400) $this->dias[gmdate('Y-m-d', $t)] = true;
        }
    }
    /** Feriados nacionais do ano (Lei 662/49, 6.802/80, 14.759/23) + Sexta-feira Santa. */
    public static function feriadosNacionais(int $ano): array {
        $a = $ano % 19; $b = intdiv($ano, 100); $c = $ano % 100; $d = intdiv($b, 4); $e = $b % 4; $f = intdiv($b + 8, 25); $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30; $i = intdiv($c, 4); $k = $c % 4; $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7; $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $mes = intdiv($h + $l - 7 * $m + 114, 31); $dia = (($h + $l - 7 * $m + 114) % 31) + 1;
        $pascoa = gmmktime(0, 0, 0, $mes, $dia, $ano);
        $lista = ["$ano-01-01" => 'Confraternização Universal', gmdate('Y-m-d', $pascoa - 2 * 86400) => 'Sexta-feira Santa', "$ano-04-21" => 'Tiradentes',
                  "$ano-05-01" => 'Dia do Trabalho', "$ano-09-07" => 'Independência', "$ano-10-12" => 'Nossa Senhora Aparecida', "$ano-11-02" => 'Finados',
                  "$ano-11-15" => 'Proclamação da República', "$ano-12-25" => 'Natal'];
        if ($ano >= 2024) $lista["$ano-11-20"] = 'Dia Nacional de Zumbi e da Consciência Negra';
        ksort($lista); return $lista;
    }
    public function capacidade(string $d): float {
        if (isset($this->dias[$d]) || isset($this->anuais[substr($d, 5)])) return 0.0;
        if ($this->nacionais) { $ano = (int)substr($d, 0, 4); $this->cacheAno[$ano] ??= self::feriadosNacionais($ano); if (isset($this->cacheAno[$ano][$d])) return 0.0; }
        $ds = (int)gmdate('N', strtotime($d . ' UTC')) - 1;   // 0 = segunda
        return $this->horas[$ds] / $this->jornada;
    }
    public function util(string $d): bool { return $this->capacidade($d) > 0; }
    public static function mais(string $d, int $n): string { return gmdate('Y-m-d', strtotime($d . ' UTC') + $n * 86400); }
    public function proximoUtil(string $d): string { for ($i = 0; $i < 3700 && !$this->util($d); $i++) $d = self::mais($d, 1); return $d; }
    public function anteriorUtil(string $d): string { for ($i = 0; $i < 3700 && !$this->util($d); $i++) $d = self::mais($d, -1); return $d; }
    /** Fim de uma atividade que começa em $ini e dura $dur dias úteis (0 = marco). */
    public function fim(string $ini, float $dur): string {
        $d = $this->proximoUtil($ini);
        if ($dur <= 0) return $d;
        $cap = 0.0;
        for ($i = 0; $i < 3700; $i++) { $cap += $this->capacidade($d); if ($cap >= $dur - 1e-6) return $d; $d = $this->proximoUtil(self::mais($d, 1)); }
        return $d;
    }
    /** Início para terminar em $fim com $dur dias úteis. */
    public function inicioPorFim(string $fim, float $dur): string {
        $d = $this->anteriorUtil($fim);
        if ($dur <= 0) return $d;
        $cap = 0.0;
        for ($i = 0; $i < 3700; $i++) { $cap += $this->capacidade($d); if ($cap >= $dur - 1e-6) return $d; $d = $this->anteriorUtil(self::mais($d, -1)); }
        return $d;
    }
    /** Dias úteis de $ini a $fim, inclusive (pode ter meio dia, ex.: sábado de 4 h). */
    public function diasUteis(string $ini, string $fim): float {
        if ($fim < $ini) return 0.0;
        $s = 0.0; for ($d = $ini, $i = 0; $d <= $fim && $i < 3700; $d = self::mais($d, 1), $i++) $s += $this->capacidade($d);
        return round($s, 1);
    }
    /** Anda $n dias úteis a partir de $d (n pode ser negativo). */
    public function andar(string $d, int $n): string {
        $passo = $n >= 0 ? 1 : -1;
        for ($i = 0, $c = 0; $c < abs($n) && $i < 3700; $i++) { $d = self::mais($d, $passo); if ($this->util($d)) $c++; }
        return $d;
    }
}

function calendario_padrao(): Calendario { return new Calendario(); }
function calendario_carregar(?int $id, int $eid): Calendario {
    if (!$id) $id = empresa_calendario_id($eid);      // obra sem calendário próprio segue o padrão da empresa
    if (!$id) return calendario_padrao();
    $c = um('SELECT * FROM calendarios WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $eid]);
    if (!$c) return calendario_padrao();
    return new Calendario(json_decode($c['horas_semana'], true) ?: [8, 8, 8, 8, 8, 0, 0], (bool)$c['feriados_nacionais'],
        todos('SELECT inicio, fim, todo_ano FROM calendario_dias WHERE calendario_id = ?', [$id]));
}
function calendario_da_obra(int $pid, int $eid): Calendario {
    $p = um('SELECT calendario_id FROM projetos WHERE id = ? AND empresa_id = ?', [$pid, $eid]);
    return calendario_carregar($p ? (int)$p['calendario_id'] : null, $eid);
}

/* ══ Datas de uma atividade ao criar/alterar ═════════════════════ */
/** Completa início/fim/duração: "5d" calcula o fim; fim digitado recalcula a duração. */
function completar_datas(array &$c, array $antes, Calendario $cal): void {
    $ini = $c['inicio'] ?? $antes['inicio'] ?? null;
    if (!$ini) return;
    if (array_key_exists('duracao_dias', $c) && $c['duracao_dias'] !== null) {
        $c['inicio'] = $cal->proximoUtil($ini); $c['fim'] = $cal->fim($c['inicio'], (float)$c['duracao_dias']);
    } elseif (array_key_exists('fim', $c) && $c['fim']) {
        $c['duracao_dias'] = $c['fim'] < $ini ? 0 : $cal->diasUteis($ini, $c['fim']);
    } elseif (array_key_exists('inicio', $c)) {
        $dur = $antes['duracao_dias'] ?? null;
        if ($dur === null && !empty($antes['inicio']) && !empty($antes['fim'])) $dur = $cal->diasUteis($antes['inicio'], $antes['fim']);
        if ($dur !== null) { $c['fim'] = $cal->fim($ini, (float)$dur); $c['duracao_dias'] = (float)$dur; }
    }
}

/* ══ Recalcular a obra: dependências empurram, etapas acompanham ═ */
/**
 * Empurra (só para a frente) as atividades que ficaram antes do que as predecessoras permitem e
 * acerta as datas das etapas-mãe. Com $salvar = false só simula. $mudar = [id => campos] para simular.
 * Devolve as atividades que mudaram de data: [{id, descricao, de_inicio, de_fim, inicio, fim}].
 */
function recalcular_obra(int $pid, int $eid, bool $salvar = true, array $mudar = []): array {
    $cal = calendario_da_obra($pid, $eid);
    $A = [];
    foreach (todos('SELECT id, pai_id, descricao, inicio, fim, duracao_dias, avanco, situacao FROM atividades WHERE projeto_id = ? AND empresa_id = ? AND excluido_em IS NULL', [$pid, $eid]) as $a)
        $A[(int)$a['id']] = $a;
    $orig = $A;
    foreach ($mudar as $id => $campos) if (isset($A[$id])) { $c = $campos; completar_datas($c, $A[$id], $cal); $A[$id] = array_merge($A[$id], $c); }
    $deps = $A ? todos('SELECT antes_id, depois_id, tipo, folga_dias FROM dependencias WHERE empresa_id = ? AND depois_id IN (' . implode(',', array_keys($A)) . ')', [$eid]) : [];
    $pred = []; $grau = array_fill_keys(array_keys($A), 0); $succ = [];
    foreach ($deps as $d) { $x = (int)$d['antes_id']; $y = (int)$d['depois_id']; if (!isset($A[$x], $A[$y])) continue; $pred[$y][] = $d; $succ[$x][] = $y; $grau[$y]++; }
    $fila = array_keys(array_filter($grau, fn($g) => $g === 0)); $ordem = [];
    while ($fila) { $n = array_shift($fila); $ordem[] = $n; foreach ($succ[$n] ?? [] as $s) if (--$grau[$s] === 0) $fila[] = $s; }
    foreach ($ordem as $id) {
        $a = &$A[$id];
        if (empty($pred[$id]) || !$a['inicio'] || $a['situacao'] === 'Concluído' || (int)$a['avanco'] >= 100) { unset($a); continue; }
        $dur = $a['duracao_dias'] !== null ? (float)$a['duracao_dias'] : ($a['fim'] ? $cal->diasUteis($a['inicio'], $a['fim']) : 1.0);
        $req = null;
        foreach ($pred[$id] as $d) {
            $p = $A[(int)$d['antes_id']]; if (!$p['inicio'] || !$p['fim']) continue;
            $fol = (int)$d['folga_dias'];
            switch ($d['tipo']) {
                case 'CC': $r = $cal->proximoUtil($cal->andar($cal->proximoUtil($p['inicio']), $fol)); break;
                case 'TT': $r = $cal->inicioPorFim($cal->andar($p['fim'], $fol), $dur); break;
                case 'CT': $r = $cal->inicioPorFim($cal->andar($p['inicio'], $fol), $dur); break;
                default:   $r = $cal->andar($cal->proximoUtil(Calendario::mais($p['fim'], 1)), $fol); $r = $cal->proximoUtil($r);
            }
            if ($req === null || $r > $req) $req = $r;
        }
        if ($req !== null && $a['inicio'] < $req) { $a['inicio'] = $req; $a['fim'] = $cal->fim($req, $dur); $a['duracao_dias'] = $dur; }
        unset($a);
    }
    // etapas-mãe: do início da primeira ao fim da última filha (de baixo para cima)
    $filhos = [];
    foreach ($A as $id => $a) if ($a['pai_id'] && isset($A[(int)$a['pai_id']])) $filhos[(int)$a['pai_id']][] = $id;
    $resolver = function (int $id) use (&$resolver, &$A, $filhos, $cal) {
        if (empty($filhos[$id])) return;
        $ini = null; $fim = null;
        foreach ($filhos[$id] as $f) { $resolver($f); $x = $A[$f]; if ($x['inicio'] && ($ini === null || $x['inicio'] < $ini)) $ini = $x['inicio']; if ($x['fim'] && ($fim === null || $x['fim'] > $fim)) $fim = $x['fim']; }
        if ($ini) { $A[$id]['inicio'] = $ini; $A[$id]['fim'] = $fim; $A[$id]['duracao_dias'] = $fim ? $cal->diasUteis($ini, $fim) : null; }
    };
    foreach (array_keys($filhos) as $id) if (empty($A[$id]['pai_id'])) $resolver($id);
    foreach (array_keys($filhos) as $id) $resolver($id);   // pais cujo avô não está na obra
    $movidas = [];
    foreach ($A as $id => $a) {
        $o = $orig[$id]; $pedido = isset($mudar[$id]);
        $mudou = $a['inicio'] !== $o['inicio'] || $a['fim'] !== $o['fim'];
        if (!$mudou && !($salvar && $pedido)) continue;
        if ($salvar && $mudou) q('UPDATE atividades SET inicio = ?, fim = ?, duracao_dias = ? WHERE id = ?', [$a['inicio'], $a['fim'], $a['duracao_dias'], $id]);
        if ($mudou && !$pedido && empty($filhos[$id])) $movidas[] = ['id' => $id, 'descricao' => $a['descricao'], 'de_inicio' => $o['inicio'], 'de_fim' => $o['fim'], 'inicio' => $a['inicio'], 'fim' => $a['fim']];
    }
    return $movidas;
}

/** Caminho crítico (folga total ≤ 0) pelas dependências, contando dias úteis. */
function caminho_critico(array $A, array $deps, Calendario $cal): array {
    $folhas = array_filter($A, fn($a) => empty($a['_filhos']) && $a['inicio'] && $a['fim']);
    if (!$folhas) return [];
    $ini = min(array_column($folhas, 'inicio'));
    $idx = function (string $d) use ($ini, $cal) { return $d <= $ini ? 0 : (int)round($cal->diasUteis($ini, Calendario::mais($d, -1)) * 2); };   // meio dia = 1
    $ES = $EF = [];
    foreach ($folhas as $id => $a) { $ES[$id] = $idx($a['inicio']); $EF[$id] = $idx(Calendario::mais($a['fim'], 1)); }
    $fimObra = max($EF);
    $succ = []; foreach ($deps as $d) { $x = (int)$d['antes_id']; $y = (int)$d['depois_id']; if (isset($ES[$x], $ES[$y])) $succ[$x][] = [$y, $d['tipo'], 2 * (int)$d['folga_dias']]; }
    $LF = [];
    $calc = function (int $id) use (&$calc, &$LF, $succ, $ES, $EF, $fimObra) {
        if (isset($LF[$id])) return $LF[$id];
        $LF[$id] = $fimObra;
        $lf = $fimObra;
        foreach ($succ[$id] ?? [] as [$s, $tipo, $fol]) {
            $LFs = $calc($s); $LSs = $LFs - ($EF[$s] - $ES[$s]);
            $v = match ($tipo) { 'CC' => $LSs - $fol + ($EF[$id] - $ES[$id]), 'TT' => $LFs - $fol, default => $LSs - $fol };
            $lf = min($lf, $v);
        }
        return $LF[$id] = $lf;
    };
    $crit = [];
    foreach ($folhas as $id => $a) { if ($a['situacao'] === 'Concluído') continue; if ($calc($id) - $EF[$id] <= 0) $crit[$id] = true; }
    return $crit;
}

/* ══ Rotas ═══════════════════════════════════════════════════════ */
function obra_para_cronograma(array $u, int $pid): array {
    if ($u['perfil'] === 'funcionario') throw new ErroApi('Esta tela é da gestão das obras', 403);
    return obra_da_empresa($u, $pid);
}

/** GET /api/obras/{id}/cronograma — tudo o que a tela Obra aberta mostra. */
function rota_obra_cronograma(int $pid): array {
    $u = exigir_login(); obra_para_cronograma($u, $pid); $eid = (int)$u['empresa_id'];
    $resumo = array_values(array_filter((rota_obras_resumo())['obras'], fn($o) => (int)$o['id'] === $pid))[0] ?? null;
    $hoje = gmdate('Y-m-d', time() - 3 * 3600);
    $cal = calendario_da_obra($pid, $eid);
    $A = [];
    foreach (todos('SELECT a.id, a.pai_id, a.codigo_eap, a.descricao, a.observacoes, a.responsavel_id, f.nome AS responsavel_nome, a.inicio, a.fim,
                           a.duracao_dias, a.avanco, a.situacao, a.critica, a.peso, a.ordem, a.atualizado_em
                    FROM atividades a LEFT JOIN funcionarios f ON f.id = a.responsavel_id
                    WHERE a.projeto_id = ? AND a.empresa_id = ? AND a.excluido_em IS NULL ORDER BY a.ordem, a.id', [$pid, $eid]) as $a) {
        $a['id'] = (int)$a['id']; $a['pai_id'] = $a['pai_id'] ? (int)$a['pai_id'] : null; $a['avanco'] = (int)$a['avanco']; $a['peso'] = (float)$a['peso'];
        $a['_filhos'] = []; $A[$a['id']] = $a;
    }
    foreach ($A as $id => $a) if ($a['pai_id'] && isset($A[$a['pai_id']])) $A[$a['pai_id']]['_filhos'][] = $id;
    $deps = $A ? todos('SELECT id, antes_id, depois_id, tipo, folga_dias FROM dependencias WHERE empresa_id = ? AND depois_id IN (' . implode(',', array_keys($A)) . ')', [$eid]) : [];
    $crit = caminho_critico($A, $deps, $cal);
    // EAP (1, 1.1, 1.2…) e avanço das etapas pela média ponderada das filhas
    $lista = []; $n = 0;
    $andar = function (array $ids, string $pref, int $nivel) use (&$andar, &$A, &$lista) {
        $i = 0;
        foreach ($ids as $id) { $i++; $A[$id]['eap'] = $pref === '' ? (string)$i : "$pref.$i"; $A[$id]['nivel'] = $nivel; $lista[] = $id; $andar($A[$id]['_filhos'], $A[$id]['eap'], $nivel + 1); }
    };
    $raizes = array_keys(array_filter($A, fn($a) => !$a['pai_id'] || !isset($A[$a['pai_id']])));
    $andar($raizes, '', 0);
    $media = function (int $id) use (&$media, &$A): array {
        if (!$A[$id]['_filhos']) return [$A[$id]['peso'] ?: 1.0, ($A[$id]['peso'] ?: 1.0) * $A[$id]['avanco']];
        $p = $s = 0.0; foreach ($A[$id]['_filhos'] as $f) { [$pp, $ss] = $media($f); $p += $pp; $s += $ss; }
        $A[$id]['avanco'] = $p > 0 ? (int)round($s / $p) : 0; return [$p, $s];
    };
    foreach ($raizes as $r) $media($r);
    $predDe = []; foreach ($deps as $d) $predDe[(int)$d['depois_id']][] = $d;
    // travadas (impedimentos abertos) e fotos de campo
    $trav = []; $nfotos = [];
    foreach (todos('SELECT o.id, o.atividade_id, o.tipo, o.descricao, o.criado_em, us.nome AS por FROM ocorrencias o LEFT JOIN usuarios us ON us.id = o.registrada_por
                    WHERE o.projeto_id = ? AND o.empresa_id = ? AND o.atividade_id IS NOT NULL AND o.resolvida_em IS NULL AND o.excluido_em IS NULL', [$pid, $eid]) as $o)
        $trav[(int)$o['atividade_id']] = ['id' => (int)$o['id'], 'tipo' => $o['tipo'], 'descricao' => $o['descricao'], 'desde' => $o['criado_em'], 'por' => $o['por']];
    foreach (todos('SELECT atividade_id, COUNT(*) n FROM fotos WHERE projeto_id = ? AND empresa_id = ? AND atividade_id IS NOT NULL AND excluido_em IS NULL GROUP BY atividade_id', [$pid, $eid]) as $f)
        $nfotos[(int)$f['atividade_id']] = (int)$f['n'];
    $saida = [];
    foreach ($lista as $id) {
        $a = $A[$id]; $etapa = (bool)$a['_filhos'];
        $txt = [];
        foreach ($predDe[$id] ?? [] as $d) if (isset($A[(int)$d['antes_id']])) {
            $t = $A[(int)$d['antes_id']]['eap'] . ($d['tipo'] !== 'TC' ? $d['tipo'] : '');
            if ((int)$d['folga_dias']) $t .= ($d['folga_dias'] > 0 ? '+' : '') . (int)$d['folga_dias'] . 'd';
            $txt[] = $t;
        }
        $saida[] = [
            'id' => $id, 'pai_id' => $a['pai_id'], 'eap' => $a['eap'], 'nivel' => $a['nivel'], 'etapa' => $etapa,
            'descricao' => $a['descricao'], 'observacoes' => $a['observacoes'], 'responsavel_id' => $a['responsavel_id'] ? (int)$a['responsavel_id'] : null,
            'responsavel_nome' => $a['responsavel_nome'], 'inicio' => $a['inicio'], 'fim' => $a['fim'],
            'duracao_dias' => $a['duracao_dias'] !== null ? (float)$a['duracao_dias'] : ($a['inicio'] && $a['fim'] ? $cal->diasUteis($a['inicio'], $a['fim']) : null),
            'marco' => !$etapa && $a['duracao_dias'] !== null && (float)$a['duracao_dias'] == 0.0,
            'avanco' => $a['avanco'], 'situacao' => $a['situacao'], 'peso' => $a['peso'], 'ordem' => (int)$a['ordem'],
            'critica' => isset($crit[$id]) || (!$etapa && (int)$a['critica'] === 1 && $a['situacao'] !== 'Concluído'),
            'atrasada' => !$etapa && $a['fim'] && $a['fim'] < $hoje && $a['situacao'] !== 'Concluído' && $a['avanco'] < 100,
            'predecessoras' => implode('; ', $txt),
            'travada' => !$etapa && $a['situacao'] !== 'Concluído' ? ($trav[$id] ?? null) : null, 'fotos' => $nfotos[$id] ?? 0,
        ];
    }
    $lb = um('SELECT id, numero, nome, motivo, criado_em FROM linhas_base WHERE projeto_id = ? AND empresa_id = ? ORDER BY numero DESC LIMIT 1', [$pid, $eid]);
    $base = [];
    if ($lb) foreach (todos('SELECT atividade_id, inicio, fim FROM linha_base_itens WHERE linha_base_id = ?', [$lb['id']]) as $b) $base[(int)$b['atividade_id']] = ['inicio' => $b['inicio'], 'fim' => $b['fim']];
    $p = um('SELECT p.calendario_id, c.nome AS calendario_nome, c.horas_semana FROM projetos p LEFT JOIN calendarios c ON c.id = p.calendario_id AND c.excluido_em IS NULL WHERE p.id = ?', [$pid]);
    return ['obra' => $resumo, 'hoje' => $hoje, 'atividades' => $saida,
        'dependencias' => array_map(fn($d) => ['id' => (int)$d['id'], 'antes_id' => (int)$d['antes_id'], 'depois_id' => (int)$d['depois_id'], 'tipo' => $d['tipo'], 'folga_dias' => (int)$d['folga_dias']], $deps),
        'linha_base' => $lb ? $lb + ['itens' => $base] : null,
        'calendario' => ['id' => $p['calendario_id'] ? (int)$p['calendario_id'] : null, 'nome' => $p['calendario_nome'] ?: 'Padrão',
                         'horas_semana' => $p['horas_semana'] ? json_decode($p['horas_semana'], true) : [8, 8, 8, 8, 8, 0, 0]]];
}

/** POST /api/obras/{id}/simular {atividade_id, inicio?, fim?, duracao_dias?} — o que mudaria, sem salvar. */
function rota_obra_simular(int $pid): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); obra_da_empresa($u, $pid);
    $d = corpo(); $id = (int)($d['atividade_id'] ?? 0);
    if (!um('SELECT id FROM atividades WHERE id = ? AND projeto_id = ? AND excluido_em IS NULL', [$id, $pid])) throw new ErroApi('Atividade não encontrada', 404);
    $c = limpar($d, ['inicio' => ['data'], 'fim' => ['data'], 'duracao_dias' => ['num', 0, 9999]]);
    $movidas = recalcular_obra($pid, (int)$u['empresa_id'], false, [$id => $c]);
    $fimObra = fn(array $l) => $l ? max(array_column($l, 'fim')) : null;
    $antes = um('SELECT MAX(fim) f FROM atividades WHERE projeto_id = ? AND excluido_em IS NULL', [$pid])['f'];
    $depois = $antes; foreach ($movidas as $m) if ($m['fim'] > $depois) $depois = $m['fim'];
    return ['movidas' => $movidas, 'fim_obra_antes' => $antes, 'fim_obra_depois' => $depois];
}

/** Liga depois_id ← antes_id, recusando ciclo e obras diferentes. */
function criar_dependencia(array $u, int $antes, int $depois, string $tipo = 'TC', int $folga = 0): int {
    $eid = (int)$u['empresa_id'];
    if ($antes === $depois) throw new ErroApi('Uma atividade não pode depender dela mesma');
    $a = um('SELECT id, projeto_id FROM atividades WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$antes, $eid]);
    $b = um('SELECT id, projeto_id FROM atividades WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$depois, $eid]);
    if (!$a || !$b) throw new ErroApi('Atividade não encontrada', 404);
    if ((int)$a['projeto_id'] !== (int)$b['projeto_id']) throw new ErroApi('As duas atividades precisam ser da mesma obra');
    obra_da_empresa($u, (int)$a['projeto_id']);
    // ciclo: se "antes" já depende (direta ou indiretamente) de "depois", não pode
    $ver = [$antes]; $visto = [];
    while ($ver) { $x = array_pop($ver); if ($x === $depois) throw new ErroApi('Essa ligação faria um ciclo: uma atividade acabaria esperando por ela mesma'); if (isset($visto[$x])) continue; $visto[$x] = true;
        foreach (todos('SELECT antes_id FROM dependencias WHERE depois_id = ? AND empresa_id = ?', [$x, $eid]) as $r) $ver[] = (int)$r['antes_id']; }
    if (um('SELECT id FROM dependencias WHERE antes_id = ? AND depois_id = ?', [$antes, $depois])) throw new ErroApi('Essas atividades já estão ligadas', 409);
    return inserir('dependencias', ['empresa_id' => $eid, 'antes_id' => $antes, 'depois_id' => $depois, 'tipo' => $tipo, 'folga_dias' => $folga]);
}

/** POST /api/dependencias {antes_id, depois_id, tipo, folga_dias} */
function rota_dependencias_criar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $c = limpar(corpo(), ['antes_id' => ['id'], 'depois_id' => ['id'], 'tipo' => ['lista', ['TC', 'CC', 'TT', 'CT']], 'folga_dias' => ['num', -365, 365]]);
    $id = criar_dependencia($u, (int)($c['antes_id'] ?? 0), (int)($c['depois_id'] ?? 0), $c['tipo'] ?? 'TC', (int)($c['folga_dias'] ?? 0));
    $pid = (int)um('SELECT projeto_id FROM atividades WHERE id = ?', [$c['depois_id']])['projeto_id'];
    $mov = recalcular_obra($pid, (int)$u['empresa_id']);
    registrar($u, (int)$u['empresa_id'], 'dependencias', $id, 'criou', null, $c);
    return ['ok' => true, 'id' => $id, 'movidas' => $mov];
}
/** PATCH /api/dependencias/{id} {tipo?, folga_dias?} */
function rota_dependencias_alterar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $d = um('SELECT d.*, a.projeto_id FROM dependencias d JOIN atividades a ON a.id = d.depois_id WHERE d.id = ? AND d.empresa_id = ?', [$id, $u['empresa_id']]);
    if (!$d) throw new ErroApi('Ligação não encontrada', 404);
    obra_da_empresa($u, (int)$d['projeto_id']);
    $c = limpar(corpo(), ['tipo' => ['lista', ['TC', 'CC', 'TT', 'CT']], 'folga_dias' => ['num', -365, 365]]);
    atualizar('dependencias', $id, $c);
    return ['ok' => true, 'movidas' => recalcular_obra((int)$d['projeto_id'], (int)$u['empresa_id'])];
}
/** DELETE /api/dependencias/{id} */
function rota_dependencias_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $d = um('SELECT d.id, a.projeto_id FROM dependencias d JOIN atividades a ON a.id = d.depois_id WHERE d.id = ? AND d.empresa_id = ?', [$id, $u['empresa_id']]);
    if (!$d) throw new ErroApi('Ligação não encontrada', 404);
    obra_da_empresa($u, (int)$d['projeto_id']);
    q('DELETE FROM dependencias WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'dependencias', $id, 'excluiu');
    return ['ok' => true];
}
/** POST /api/obras/{id}/encadear {ids: [...]} — cada uma começa quando a anterior termina. */
function rota_obra_encadear(int $pid): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); obra_da_empresa($u, $pid);
    $ids = array_values(array_unique(array_map('intval', (array)(corpo()['ids'] ?? []))));
    if (count($ids) < 2) throw new ErroApi('Escolha pelo menos duas atividades');
    $criadas = 0;
    for ($i = 1; $i < count($ids); $i++) {
        if (!um('SELECT id FROM atividades WHERE id IN (?, ?) AND projeto_id = ? HAVING COUNT(*) = 2', [$ids[$i - 1], $ids[$i], $pid])) throw new ErroApi('Atividade de outra obra', 400);
        if (um('SELECT id FROM dependencias WHERE antes_id = ? AND depois_id = ?', [$ids[$i - 1], $ids[$i]])) continue;
        criar_dependencia($u, $ids[$i - 1], $ids[$i]); $criadas++;
    }
    $mov = recalcular_obra($pid, (int)$u['empresa_id']);
    registrar($u, (int)$u['empresa_id'], 'projetos', $pid, 'alterou', null, ['encadeou' => $ids]);
    return ['ok' => true, 'ligacoes' => $criadas, 'movidas' => $mov];
}

/** GET /api/obras/{id}/linhas-base */
function rota_linhas_base_listar(int $pid): array {
    $u = exigir_login(); obra_para_cronograma($u, $pid);
    return ['linhas_base' => todos('SELECT lb.id, lb.numero, lb.nome, lb.motivo, lb.criado_em, us.nome AS aprovada_por_nome,
                                           (SELECT COUNT(*) FROM linha_base_itens i WHERE i.linha_base_id = lb.id) AS itens,
                                           (SELECT MAX(i.fim) FROM linha_base_itens i WHERE i.linha_base_id = lb.id) AS fim
                                    FROM linhas_base lb LEFT JOIN usuarios us ON us.id = lb.aprovada_por
                                    WHERE lb.projeto_id = ? AND lb.empresa_id = ? ORDER BY lb.numero', [$pid, $u['empresa_id']])];
}
/** POST /api/obras/{id}/linhas-base {nome?, motivo} — a primeira é a original; as seguintes exigem motivo. */
function rota_linhas_base_salvar(int $pid): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO); obra_da_empresa($u, $pid);
    $d = limpar(corpo(), ['nome' => ['texto', 120], 'motivo' => ['texto', 2000]]);
    $n = (int)um('SELECT COALESCE(MAX(numero) + 1, 0) n FROM linhas_base WHERE projeto_id = ?', [$pid])['n'];
    if ($n > 0 && empty($d['motivo'])) throw new ErroApi('Informe o motivo da reprogramação');
    $itens = todos('SELECT a.id, a.inicio, a.fim, a.peso FROM atividades a WHERE a.projeto_id = ? AND a.excluido_em IS NULL
                    AND NOT EXISTS (SELECT 1 FROM atividades f WHERE f.pai_id = a.id AND f.excluido_em IS NULL)', [$pid]);
    if (!$itens) throw new ErroApi('Monte o cronograma antes de salvar a linha de base');
    $id = inserir('linhas_base', ['empresa_id' => $u['empresa_id'], 'projeto_id' => $pid, 'numero' => $n,
        'nome' => $d['nome'] ?? ($n === 0 ? 'Original' : "Reprogramação $n"), 'motivo' => $d['motivo'] ?? null, 'aprovada_por' => $u['id']]);
    foreach ($itens as $i) q('INSERT INTO linha_base_itens (linha_base_id, atividade_id, inicio, fim, peso) VALUES (?,?,?,?,?)', [$id, $i['id'], $i['inicio'], $i['fim'], $i['peso']]);
    registrar($u, (int)$u['empresa_id'], 'linhas_base', $id, 'criou', null, ['numero' => $n, 'motivo' => $d['motivo'] ?? null]);
    return ['ok' => true, 'id' => $id, 'numero' => (int)$n];
}

/* ── Calendários ─────────────────────────────────────────────── */
function calendario_da_empresa(array $u, int $id): array {
    $c = um('SELECT * FROM calendarios WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL', [$id, $u['empresa_id']]);
    if (!$c) throw new ErroApi('Calendário não encontrado', 404);
    return $c;
}
function pode_mexer_calendario(array $u, array $c): void {
    if ($u['perfil'] !== 'administrador' && (int)$c['dono_id'] !== (int)$u['id']) throw new ErroApi('Só quem criou o calendário (ou o administrador) pode mudá-lo', 403);
}
function validar_calendario(array $d): array {
    $c = limpar($d, ['nome' => ['texto', 120], 'feriados_nacionais' => ['bool']]);
    if (array_key_exists('horas_semana', $d)) {
        $h = $d['horas_semana'];
        if (!is_array($h) || count($h) !== 7) throw new ErroApi('Informe as horas dos 7 dias da semana');
        foreach ($h as $x) if (!is_numeric($x) || $x < 0 || $x > 24) throw new ErroApi('Horas por dia entre 0 e 24');
        if (array_sum($h) <= 0) throw new ErroApi('O calendário precisa ter pelo menos um dia de trabalho');
        $c['horas_semana'] = json_encode(array_map(fn($x) => round((float)$x, 1), $h));
    }
    return $c;
}
function gravar_dias_calendario(int $cid, $dias): void {
    if (!is_array($dias)) return;
    q('DELETE FROM calendario_dias WHERE calendario_id = ?', [$cid]);
    foreach ($dias as $x) {
        $l = limpar((array)$x, ['inicio' => ['data'], 'fim' => ['data'], 'tipo' => ['lista', ['feriado', 'parado']], 'nome' => ['texto', 120], 'todo_ano' => ['bool']]);
        if (empty($l['inicio']) || empty($l['nome'])) throw new ErroApi('Cada feriado ou dia parado precisa de data e nome');
        $l['fim'] = $l['fim'] ?? $l['inicio']; if ($l['fim'] < $l['inicio']) throw new ErroApi('Dia parado com fim antes do início');
        q('INSERT INTO calendario_dias (calendario_id, inicio, fim, tipo, nome, todo_ano) VALUES (?,?,?,?,?,?)', [$cid, $l['inicio'], $l['fim'], $l['tipo'] ?? 'feriado', $l['nome'], $l['todo_ano'] ?? 0]);
    }
}
/** GET /api/calendarios — os da empresa, com dias e obras que usam. */
function rota_calendarios_listar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $l = todos('SELECT c.id, c.nome, c.horas_semana, c.feriados_nacionais, c.dono_id, us.nome AS dono_nome FROM calendarios c LEFT JOIN usuarios us ON us.id = c.dono_id
                WHERE c.empresa_id = ? AND c.excluido_em IS NULL ORDER BY c.nome', [$u['empresa_id']]);
    foreach ($l as &$c) {
        $c['horas_semana'] = json_decode($c['horas_semana'], true);
        $c['dias'] = todos('SELECT inicio, fim, tipo, nome, todo_ano FROM calendario_dias WHERE calendario_id = ? ORDER BY inicio', [$c['id']]);
        $c['obras'] = todos('SELECT id, codigo, nome FROM projetos WHERE calendario_id = ? AND excluido_em IS NULL', [$c['id']]);
        $c['pode_editar'] = $u['perfil'] === 'administrador' || (int)$c['dono_id'] === (int)$u['id'];
    }
    unset($c);
    $ano = (int)gmdate('Y');
    return ['calendarios' => $l, 'feriados_nacionais' => Calendario::feriadosNacionais($ano) + Calendario::feriadosNacionais($ano + 1)];
}
/** POST /api/calendarios {nome, horas_semana[7], feriados_nacionais, dias[]} */
function rota_calendarios_criar(): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $d = corpo(); $c = validar_calendario($d);
    if (empty($c['nome'])) throw new ErroApi('Dê um nome ao calendário');
    $id = inserir('calendarios', ['empresa_id' => $u['empresa_id'], 'dono_id' => $u['id']] + $c + ['horas_semana' => '[8,8,8,8,8,0,0]']);
    gravar_dias_calendario($id, $d['dias'] ?? []);
    registrar($u, (int)$u['empresa_id'], 'calendarios', $id, 'criou', null, $c);
    return ['ok' => true, 'id' => $id];
}
/** PATCH /api/calendarios/{id} — recalcula as obras que usam. */
function rota_calendarios_alterar(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $cal = calendario_da_empresa($u, $id); pode_mexer_calendario($u, $cal);
    $d = corpo(); $c = validar_calendario($d);
    if ($c) atualizar('calendarios', $id, $c);
    if (array_key_exists('dias', $d)) gravar_dias_calendario($id, $d['dias']);
    $mov = [];
    foreach (todos('SELECT id FROM projetos WHERE calendario_id = ? AND excluido_em IS NULL', [$id]) as $p) {
        // com o calendário novo, cada atividade mantém início e duração; o fim é refeito
        $c2 = calendario_carregar($id, (int)$u['empresa_id']);
        foreach (todos('SELECT id, inicio, duracao_dias FROM atividades WHERE projeto_id = ? AND excluido_em IS NULL AND inicio IS NOT NULL AND duracao_dias IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM atividades f WHERE f.pai_id = atividades.id AND f.excluido_em IS NULL)', [$p['id']]) as $a)
            q('UPDATE atividades SET fim = ? WHERE id = ?', [$c2->fim($a['inicio'], (float)$a['duracao_dias']), $a['id']]);
        $mov = array_merge($mov, recalcular_obra((int)$p['id'], (int)$u['empresa_id']));
    }
    registrar($u, (int)$u['empresa_id'], 'calendarios', $id, 'alterou', null, $c);
    return ['ok' => true, 'movidas' => $mov];
}
/** DELETE /api/calendarios/{id} — só se nenhuma obra usa. */
function rota_calendarios_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $cal = calendario_da_empresa($u, $id); pode_mexer_calendario($u, $cal);
    if (um('SELECT id FROM projetos WHERE calendario_id = ? AND excluido_em IS NULL LIMIT 1', [$id])) throw new ErroApi('Este calendário está em uso por alguma obra', 409);
    q('UPDATE calendarios SET excluido_em = UTC_TIMESTAMP() WHERE id = ?', [$id]);
    return ['ok' => true];
}

/* ── Histórico (atividade ou obra inteira) ────────────────────── */
function historico_formatar(array $l): array {
    foreach ($l as &$h) { $h['antes'] = $h['antes'] ? json_decode($h['antes'], true) : null; $h['depois'] = $h['depois'] ? json_decode($h['depois'], true) : null; }
    return $l;
}
/** GET /api/atividades/{id}/historico */
function rota_atividade_historico(int $id): array {
    $u = exigir_login(); $a = atividade_visivel($u, $id);
    if ($u['perfil'] === 'funcionario') throw new ErroApi('Sem acesso', 403);
    return ['historico' => historico_formatar(todos('SELECT h.acao, h.antes, h.depois, h.quando, us.nome AS usuario FROM historico h LEFT JOIN usuarios us ON us.id = h.usuario_id
        WHERE h.empresa_id = ? AND h.tabela = "atividades" AND h.registro_id = ? ORDER BY h.id DESC LIMIT 30', [$u['empresa_id'], $id]))];
}
/** GET /api/obras/{id}/historico — obra, atividades e linhas de base, mais recentes primeiro. */
function rota_obra_historico(int $pid): array {
    $u = exigir_login(); obra_para_cronograma($u, $pid); $eid = (int)$u['empresa_id'];
    return ['historico' => historico_formatar(todos('SELECT h.tabela, h.registro_id, h.acao, h.antes, h.depois, h.quando, us.nome AS usuario, a.descricao AS atividade
        FROM historico h LEFT JOIN usuarios us ON us.id = h.usuario_id LEFT JOIN atividades a ON h.tabela = "atividades" AND a.id = h.registro_id
        WHERE h.empresa_id = ? AND ((h.tabela = "projetos" AND h.registro_id = ?) OR (h.tabela = "atividades" AND a.projeto_id = ?)
              OR (h.tabela = "linhas_base" AND h.registro_id IN (SELECT id FROM linhas_base WHERE projeto_id = ?)))
        ORDER BY h.id DESC LIMIT 200', [$eid, $pid, $pid, $pid]))];
}

/* ── Equipe da obra ──────────────────────────────────────────── */
/** GET /api/obras/{id}/equipe — quem tem acesso e quem trabalha nas atividades (carga, atrasos, NR). */
function rota_obra_equipe(int $pid): array {
    $u = exigir_login(); obra_para_cronograma($u, $pid); $eid = (int)$u['empresa_id'];
    $hoje = gmdate('Y-m-d', time() - 3 * 3600); $em14 = Calendario::mais($hoje, 14); $em30 = Calendario::mais($hoje, 30);
    $membros = todos('SELECT m.id, m.papel, us.id AS usuario_id, us.nome, us.email, us.perfil FROM projeto_membros m JOIN usuarios us ON us.id = m.usuario_id
                      WHERE m.projeto_id = ? AND m.empresa_id = ? AND us.excluido_em IS NULL ORDER BY us.nome', [$pid, $eid]);
    $gestor = um('SELECT us.id, us.nome FROM projetos p LEFT JOIN usuarios us ON us.id = p.gestor_id WHERE p.id = ?', [$pid]);
    $cal = calendario_da_obra($pid, $eid);
    $pessoas = [];
    foreach (todos('SELECT a.responsavel_id AS id, f.nome, f.cargo, a.inicio, a.fim, a.avanco, a.situacao, a.duracao_dias
                    FROM atividades a JOIN funcionarios f ON f.id = a.responsavel_id
                    WHERE a.projeto_id = ? AND a.empresa_id = ? AND a.excluido_em IS NULL
                      AND NOT EXISTS (SELECT 1 FROM atividades x WHERE x.pai_id = a.id AND x.excluido_em IS NULL)', [$pid, $eid]) as $a) {
        $id = (int)$a['id'];
        $p = &$pessoas[$id];
        $p ??= ['funcionario_id' => $id, 'nome' => $a['nome'], 'cargo' => $a['cargo'], 'atividades' => 0, 'abertas' => 0, 'atrasadas' => 0, 'dias_proximas' => 0.0];
        $p['atividades']++;
        $aberta = $a['situacao'] !== 'Concluído' && (int)$a['avanco'] < 100;
        if ($aberta) { $p['abertas']++; if ($a['fim'] && $a['fim'] < $hoje) $p['atrasadas']++; }
        if ($aberta && $a['inicio'] && $a['fim'] && $a['inicio'] <= $em14 && $a['fim'] >= $hoje) {   // dias úteis de trabalho nas próximas 2 semanas
            $ini = max($a['inicio'], $hoje); $fim = min($a['fim'], $em14);
            $p['dias_proximas'] += $cal->diasUteis($ini, $fim) * (1 - (int)$a['avanco'] / 100);
        }
        unset($p);
    }
    $docs = [];
    if ($pessoas) foreach (todos('SELECT funcionario_id, documento, nr, vence_em, invalidado_por_afastamento FROM v_documentos_situacao WHERE empresa_id = ? AND funcionario_id IN (' . implode(',', array_keys($pessoas)) . ')', [$eid]) as $d) {
        $s = $d['invalidado_por_afastamento'] || ($d['vence_em'] && $d['vence_em'] < $hoje) ? 'vencido' : ($d['vence_em'] && $d['vence_em'] <= $em30 ? 'vencendo' : 'ok');
        $docs[(int)$d['funcionario_id']][] = ['documento' => $d['documento'], 'nr' => $d['nr'], 'vence_em' => $d['vence_em'], 'situacao' => $s];
    }
    foreach ($pessoas as $id => &$p) {
        $l = $docs[$id] ?? [];
        $p['dias_proximas'] = round($p['dias_proximas'], 1);
        $p['nr'] = ['total' => count($l), 'vencidos' => count(array_filter($l, fn($x) => $x['situacao'] === 'vencido')), 'vencendo' => count(array_filter($l, fn($x) => $x['situacao'] === 'vencendo')),
                    'pendentes' => array_values(array_filter($l, fn($x) => $x['situacao'] !== 'ok'))];
    }
    unset($p);
    usort($pessoas, fn($a, $b) => strcmp($a['nome'], $b['nome']));
    return ['gestor' => $gestor && $gestor['id'] ? $gestor : null, 'membros' => $membros, 'pessoas' => array_values($pessoas), 'capacidade_14' => $cal->diasUteis($hoje, $em14)];
}
/** DELETE /api/membros/{id} — tira o acesso de alguém à obra. */
function rota_membros_excluir(int $id): array {
    $u = exigir_login(); exigir_perfil($u, PODE_TUDO);
    $m = um('SELECT id, projeto_id, usuario_id FROM projeto_membros WHERE id = ? AND empresa_id = ?', [$id, $u['empresa_id']]);
    if (!$m) throw new ErroApi('Membro não encontrado', 404);
    obra_da_empresa($u, (int)$m['projeto_id']);
    q('DELETE FROM projeto_membros WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'projeto_membros', (int)$m['projeto_id'], 'excluiu', ['usuario_id' => (int)$m['usuario_id']]);
    return ['ok' => true];
}
/** GET /api/linhas-base/{id} — itens de uma linha de base (para comparar). */
function rota_linha_base_itens(int $id): array {
    $u = exigir_login();
    $lb = um('SELECT id, projeto_id, numero, nome FROM linhas_base WHERE id = ? AND empresa_id = ?', [$id, $u['empresa_id']]);
    if (!$lb) throw new ErroApi('Linha de base não encontrada', 404);
    obra_para_cronograma($u, (int)$lb['projeto_id']);
    return ['linha_base' => $lb, 'itens' => todos('SELECT atividade_id, inicio, fim FROM linha_base_itens WHERE linha_base_id = ?', [$id])];
}
