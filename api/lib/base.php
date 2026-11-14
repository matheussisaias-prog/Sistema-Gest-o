<?php
/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · servidor · base (configuração, banco, respostas, sessão)
   A configuração com a senha do banco fica FORA do public_html:
     <pasta do domínio>/tf-config.php   (ao lado de public_html)
═══════════════════════════════════════════════════════════════ */
declare(strict_types=1);
date_default_timezone_set('UTC');

const TF_VERSAO_API = '1.0.0';
const TF_SESSAO_COOKIE = 'tf_sessao';
const TF_SESSAO_DIAS = 30;
const TF_MAX_TENTATIVAS = 5;
const TF_BLOQUEIO_MIN = 15;
const TF_CONVITE_DIAS = 7;
const TF_PERFIS = ['administrador', 'gestor', 'encarregado', 'funcionario'];

class ErroApi extends Exception {
    public int $status;
    public function __construct(string $msg, int $status = 400) { parent::__construct($msg); $this->status = $status; }
}

function config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $caminhos = array_filter([getenv('TF_CONFIG') ?: null, dirname(__DIR__, 3) . '/tf-config.php']);
    foreach ($caminhos as $c) {
        if (is_file($c)) { $cfg = require $c; return $cfg; }
    }
    throw new ErroApi('Servidor sem configuração (tf-config.php não encontrado)', 503);
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config();
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $c['db_host'] ?? 'localhost', $c['db_name']);
    if (!empty($c['db_socket'])) $dsn = sprintf('mysql:unix_socket=%s;dbname=%s;charset=utf8mb4', $c['db_socket'], $c['db_name']);
    $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00', NAMES utf8mb4");
    return $pdo;
}

function q(string $sql, array $p = []): PDOStatement { $st = db()->prepare($sql); $st->execute($p); return $st; }
function um(string $sql, array $p = []): ?array { $r = q($sql, $p)->fetch(); return $r ?: null; }
function todos(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function agora(): string { return gmdate('Y-m-d H:i:s'); }

/* ── Entrada e saída ─────────────────────────────────────────── */
function corpo(): array {
    static $b = null;
    if ($b !== null) return $b;
    $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($m, ['POST', 'PATCH', 'PUT', 'DELETE'], true)) {
        // Só JSON: um formulário de outro site não consegue enviar JSON sem permissão (proteção contra CSRF)
        $ct = $_SERVER['CONTENT_TYPE'] ?? '';
        if (stripos($ct, 'application/json') !== 0) throw new ErroApi('Envie os dados em JSON', 415);
    }
    $raw = file_get_contents('php://input') ?: '';
    $b = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($b)) throw new ErroApi('JSON inválido');
    return $b;
}
function campo(array $d, string $k, bool $obrig = true, int $max = 255): ?string {
    $v = isset($d[$k]) ? trim((string)$d[$k]) : '';
    if ($v === '') { if ($obrig) throw new ErroApi("Campo obrigatório: $k"); return null; }
    if (mb_strlen($v) > $max) throw new ErroApi("Campo muito longo: $k");
    return $v;
}
function email_valido(?string $e): string {
    $e = mb_strtolower(trim((string)$e));
    if (!filter_var($e, FILTER_VALIDATE_EMAIL)) throw new ErroApi('E-mail inválido');
    return $e;
}
function senha_valida(?string $s): string {
    $s = (string)$s;
    if (mb_strlen($s) < 8) throw new ErroApi('A senha precisa ter pelo menos 8 caracteres');
    if (mb_strlen($s) > 200) throw new ErroApi('Senha muito longa');
    return $s;
}
function responder($dados, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
function token(): string { return bin2hex(random_bytes(32)); }
function hash_token(string $t): string { return hash('sha256', $t); }

/* ── Sessão ──────────────────────────────────────────────────── */
function abrir_sessao(int $usuario_id, ?int $dispositivo_id = null): void {
    $t = token();
    q('INSERT INTO sessoes (id, usuario_id, dispositivo_id, aparelho, ip, expira_em) VALUES (?,?,?,?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))',
      [hash_token($t), $usuario_id, $dispositivo_id, mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 160), $_SERVER['REMOTE_ADDR'] ?? null, TF_SESSAO_DIAS]);
    $seguro = (config()['cookie_seguro'] ?? true) === true;
    setcookie(TF_SESSAO_COOKIE, $t, ['expires' => time() + TF_SESSAO_DIAS * 86400, 'path' => '/', 'secure' => $seguro, 'httponly' => true, 'samesite' => 'Strict']);
}
function fechar_sessao(): void {
    $t = $_COOKIE[TF_SESSAO_COOKIE] ?? '';
    if ($t !== '') q('DELETE FROM sessoes WHERE id = ?', [hash_token($t)]);
    setcookie(TF_SESSAO_COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict']);
}
/** Usuário logado (ou null). Renova o "usado_em" da sessão. */
function usuario_atual(): ?array {
    static $u = false;
    if ($u !== false) return $u;
    $t = $_COOKIE[TF_SESSAO_COOKIE] ?? '';
    $u = null;
    if ($t === '') return null;
    $r = um('SELECT u.id, u.empresa_id, u.nome, u.email, u.perfil, u.funcionario_id, e.nome AS empresa_nome
             FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id JOIN empresas e ON e.id = u.empresa_id
             WHERE s.id = ? AND s.expira_em > UTC_TIMESTAMP() AND u.excluido_em IS NULL AND e.excluido_em IS NULL AND e.situacao <> "suspenso"',
            [hash_token($t)]);
    if ($r) { q('UPDATE sessoes SET usado_em = UTC_TIMESTAMP() WHERE id = ?', [hash_token($t)]); $u = $r; }
    return $u;
}
function exigir_login(): array {
    $u = usuario_atual();
    if (!$u) throw new ErroApi('Faça login para continuar', 401);
    return $u;
}
function exigir_perfil(array $u, array $perfis): void {
    if (!in_array($u['perfil'], $perfis, true)) throw new ErroApi('Seu perfil não tem permissão para isso', 403);
}

/* ── Histórico (quem mudou o quê) ────────────────────────────── */
function registrar(?array $u, int $empresa_id, string $tabela, ?int $id, string $acao, $antes = null, $depois = null): void {
    q('INSERT INTO historico (empresa_id, usuario_id, tabela, registro_id, acao, antes, depois, ip) VALUES (?,?,?,?,?,?,?,?)', [
        $empresa_id, $u['id'] ?? null, $tabela, $id, $acao,
        $antes === null ? null : json_encode($antes, JSON_UNESCAPED_UNICODE),
        $depois === null ? null : json_encode($depois, JSON_UNESCAPED_UNICODE),
        $_SERVER['REMOTE_ADDR'] ?? null,
    ]);
}

/* ── E-mail ──────────────────────────────────────────────────── */
function enviar_email(string $para, string $assunto, string $texto): bool {
    $c = config();
    if (($c['email_modo'] ?? 'mail') === 'arquivo') {   // testes: grava em arquivo em vez de enviar
        file_put_contents($c['email_arquivo'], json_encode(['para' => $para, 'assunto' => $assunto, 'texto' => $texto], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
        return true;
    }
    $de = $c['email_remetente'] ?? 'nao-responda@localhost';
    $cab = "From: TaskFlow PRO <$de>\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    return @mail($para, '=?UTF-8?B?' . base64_encode($assunto) . '?=', $texto, $cab);
}
function link_app(string $caminho): string { return rtrim(config()['app_url'] ?? '', '/') . $caminho; }
