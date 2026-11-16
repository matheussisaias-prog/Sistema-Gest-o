<?php
/* Mercronos · servidor · instalador do banco (roda uma vez só, com o token do tf-config.php) */
declare(strict_types=1);

function sql_em_comandos(string $sql): array {
    $linhas = array_filter(explode("\n", $sql), fn($l) => !preg_match('/^\s*--/', $l));
    $partes = preg_split('/;\s*(\n|$)/', implode("\n", $linhas));
    return array_values(array_filter(array_map('trim', $partes), fn($c) => $c !== ''));
}

/** POST /api/instalar {token} */
function rota_instalar(): array {
    $cfg = config();
    $esperado = (string)($cfg['instalar_token'] ?? '');
    $tok = (string)(corpo()['token'] ?? '');
    if (strlen($esperado) < 24 || !hash_equals($esperado, $tok)) throw new ErroApi('Instalação não autorizada', 403);
    if (um("SELECT 1 AS x FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'empresas'"))
        throw new ErroApi('O banco já está instalado. Apague o instalar_token do tf-config.php.', 409);

    $pasta = dirname(__DIR__, 2) . '/db';
    $feitos = 0;
    foreach (sql_em_comandos(file_get_contents("$pasta/schema.sql")) as $c) { db()->exec($c); $feitos++; }
    foreach (sql_em_comandos(file_get_contents("$pasta/catalogo_nrs.sql")) as $c) { db()->exec($c); $feitos++; }

    // trava dos prazos da NR no próprio banco (alguns planos de hospedagem não permitem; o servidor já aplica a regra)
    $trava = false;
    $txt = file_get_contents("$pasta/travas.sql");
    if (preg_match('/DELIMITER \/\/\s*(CREATE TRIGGER.*?END)\/\//s', $txt, $m)) {
        try { db()->exec($m[1]); $trava = true; } catch (Throwable $e) { $trava = false; }
    }
    @file_put_contents(dirname(config()['_arquivo']) . '/tf-banco-versao-gestao.txt', (string)max(array_keys(TF_MIGRACOES)));
    $tabelas = (int)um("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'")['n'];
    $catalogo = (int)um('SELECT COUNT(*) AS n FROM tipos_documento WHERE empresa_id IS NULL')['n'];
    return ['ok' => true, 'comandos' => $feitos, 'tabelas' => $tabelas, 'documentos_nr' => $catalogo, 'trava_no_banco' => $trava,
            'proximo_passo' => 'Apague a linha instalar_token do tf-config.php'];
}
