<?php
/* ═══════════════════════════════════════════════════════════════
   Aprumo · servidor · base (configuração, banco, respostas, sessão)
   A configuração com a senha do banco fica FORA de qualquer site, na raiz da hospedagem:
     /home/<usuário>/tf-config-gestao.php   ("Todos os arquivos de hospedagem" no Gerenciador)
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
    // api/lib -> api -> public_html -> <domínio> -> domains -> raiz da hospedagem
    $caminhos = array_filter([getenv('TF_CONFIG') ?: null, dirname(__DIR__, 5) . '/tf-config-gestao.php', dirname(__DIR__, 3) . '/tf-config.php']);
    foreach ($caminhos as $c) {
        if (is_file($c)) { $cfg = require $c; $cfg['_arquivo'] = $c; return $cfg; }
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
    migrar($pdo);
    return $pdo;
}

/* ── Atualizações do banco (rodam sozinhas, uma vez, na primeira chamada depois de publicar) ── */
const TF_MIGRACOES = [
    1 => ["ALTER TABLE projetos MODIFY situacao ENUM('Planejamento','Em andamento','Pausado','Concluído','Arquivado') NOT NULL DEFAULT 'Em andamento'"],
    2 => ["CREATE TABLE IF NOT EXISTS fale_conosco (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, empresa_id INT UNSIGNED NULL, usuario_id INT UNSIGNED NULL,
            nome VARCHAR(160) NOT NULL, email VARCHAR(190) NOT NULL, assunto VARCHAR(40) NOT NULL, mensagem TEXT NOT NULL,
            origem ENUM('login','sistema') NOT NULL, ip VARCHAR(45) NULL, respondido_em DATETIME NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY ix_fale_ip (ip, criado_em),
            CONSTRAINT fk_fale_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
            CONSTRAINT fk_fale_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"],
    3 => [['coluna', 'fale_conosco', 'anotacao', "ALTER TABLE fale_conosco ADD COLUMN anotacao TEXT NULL AFTER respondido_em"]],
    4 => [['coluna', 'projetos', 'tipo_servico', "ALTER TABLE projetos ADD COLUMN tipo_servico VARCHAR(40) NULL AFTER descricao"],
          ['coluna', 'projetos', 'numero_contrato', "ALTER TABLE projetos ADD COLUMN numero_contrato VARCHAR(60) NULL AFTER cliente"],
          ['coluna', 'projetos', 'rt_funcionario_id', "ALTER TABLE projetos ADD COLUMN rt_funcionario_id INT UNSIGNED NULL AFTER gestor_nome"],
          ['coluna', 'projetos', 'art_numero', "ALTER TABLE projetos ADD COLUMN art_numero VARCHAR(40) NULL AFTER rt_funcionario_id"]],
    5 => ["CREATE TABLE IF NOT EXISTS calendarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  dono_id       INT UNSIGNED NULL,
  nome          VARCHAR(120) NOT NULL,
  horas_semana  VARCHAR(80)  NOT NULL DEFAULT '[8,8,8,8,8,0,0]',
  feriados_nacionais TINYINT(1) NOT NULL DEFAULT 1,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em   DATETIME NULL,
  KEY ix_cal_empresa (empresa_id),
  CONSTRAINT fk_cal_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
          "CREATE TABLE IF NOT EXISTS calendario_dias (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  calendario_id INT UNSIGNED NOT NULL,
  inicio        DATE NOT NULL,
  fim           DATE NOT NULL,
  tipo          ENUM('feriado','parado') NOT NULL DEFAULT 'feriado',
  nome          VARCHAR(120) NOT NULL,
  todo_ano      TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_caldias (calendario_id),
  CONSTRAINT fk_caldias_cal FOREIGN KEY (calendario_id) REFERENCES calendarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
          ['coluna', 'projetos', 'calendario_id', "ALTER TABLE projetos ADD COLUMN calendario_id INT UNSIGNED NULL AFTER art_numero"],
          ['coluna', 'atividades', 'duracao_dias', "ALTER TABLE atividades ADD COLUMN duracao_dias DECIMAL(6,1) NULL AFTER duracao_horas"]],
    6 => ["CREATE TABLE IF NOT EXISTS modelos_cronograma (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  nome          VARCHAR(120) NOT NULL,
  tipo_servico  VARCHAR(40)  NULL,
  linhas        MEDIUMTEXT   NOT NULL,
  projeto_origem INT UNSIGNED NULL,
  criado_por    INT UNSIGNED NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em   DATETIME NULL,
  KEY ix_modelos_empresa (empresa_id),
  CONSTRAINT fk_modelos_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"],
    7 => ["CREATE TABLE IF NOT EXISTS avancos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  atividade_id  INT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED NOT NULL,
  de_avanco     TINYINT UNSIGNED NOT NULL,
  para_avanco   TINYINT UNSIGNED NOT NULL,
  comentario    TEXT NULL,
  id_local      VARCHAR(40) NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_avanco_local (empresa_id, id_local),
  KEY ix_avanco_ativ (atividade_id, criado_em),
  CONSTRAINT fk_avanco_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_avanco_ativ FOREIGN KEY (atividade_id) REFERENCES atividades(id),
  CONSTRAINT fk_avanco_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
          ['coluna', 'fotos', 'avanco_id', "ALTER TABLE fotos ADD COLUMN avanco_id INT UNSIGNED NULL AFTER rdo_id"],
          ['coluna', 'fotos', 'ocorrencia_id', "ALTER TABLE fotos ADD COLUMN ocorrencia_id INT UNSIGNED NULL AFTER avanco_id"],
          ['coluna', 'ocorrencias', 'resolvida_por', "ALTER TABLE ocorrencias ADD COLUMN resolvida_por INT UNSIGNED NULL AFTER resolvida_em"],
          ['coluna', 'ocorrencias', 'id_local', "ALTER TABLE ocorrencias ADD COLUMN id_local VARCHAR(40) NULL AFTER resolvida_por"]],
    8 => [['coluna', 'recursos', 'codigo', "ALTER TABLE recursos ADD COLUMN codigo VARCHAR(30) NULL AFTER ativo"],
          ['coluna', 'recursos', 'modelo', "ALTER TABLE recursos ADD COLUMN modelo VARCHAR(160) NULL AFTER codigo"],
          ['coluna', 'recursos', 'numero_serie', "ALTER TABLE recursos ADD COLUMN numero_serie VARCHAR(80) NULL AFTER modelo"],
          ['coluna', 'recursos', 'propriedade', "ALTER TABLE recursos ADD COLUMN propriedade ENUM('proprio','alugado') NOT NULL DEFAULT 'proprio' AFTER numero_serie"],
          ['coluna', 'recursos', 'observacao', "ALTER TABLE recursos ADD COLUMN observacao TEXT NULL AFTER propriedade"],
          "CREATE TABLE IF NOT EXISTS fornecedores (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  nome          VARCHAR(160) NOT NULL,
  contato       VARCHAR(120) NULL,
  telefone      VARCHAR(40)  NULL,
  email         VARCHAR(190) NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em   DATETIME NULL,
  KEY ix_forn_empresa (empresa_id),
  CONSTRAINT fk_forn_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
          "CREATE TABLE IF NOT EXISTS locacoes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  recurso_id    INT UNSIGNED NOT NULL,
  fornecedor_id INT UNSIGNED NULL,
  contrato      VARCHAR(60)  NULL,
  retirada      DATE NOT NULL,
  devolucao_prevista DATE NOT NULL,
  devolvido_em  DATE NULL,
  custo         DECIMAL(12,2) NULL,
  custo_unidade ENUM('dia','semana','mes') NOT NULL DEFAULT 'dia',
  observacao    TEXT NULL,
  criado_por    INT UNSIGNED NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em   DATETIME NULL,
  KEY ix_loc_recurso (recurso_id, devolvido_em),
  CONSTRAINT fk_loc_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_loc_recurso FOREIGN KEY (recurso_id) REFERENCES recursos(id),
  CONSTRAINT fk_loc_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
          "CREATE TABLE IF NOT EXISTS recurso_controles (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  recurso_id    INT UNSIGNED NOT NULL,
  tipo          ENUM('calibracao','manutencao','inspecao') NOT NULL,
  item          VARCHAR(160) NOT NULL,
  feito_em      DATE NOT NULL,
  vence_em      DATE NULL,
  instituicao   VARCHAR(160) NULL,
  arquivo       VARCHAR(255) NULL,
  observacao    TEXT NULL,
  criado_por    INT UNSIGNED NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em   DATETIME NULL,
  KEY ix_ctrl_recurso (recurso_id, feito_em),
  CONSTRAINT fk_ctrl_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_ctrl_recurso FOREIGN KEY (recurso_id) REFERENCES recursos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
          "CREATE TABLE IF NOT EXISTS recurso_paradas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  recurso_id    INT UNSIGNED NOT NULL,
  inicio        DATE NOT NULL,
  fim           DATE NOT NULL,
  motivo        VARCHAR(200) NULL,
  criado_por    INT UNSIGNED NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em   DATETIME NULL,
  KEY ix_parada_recurso (recurso_id, inicio),
  CONSTRAINT fk_parada_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_parada_recurso FOREIGN KEY (recurso_id) REFERENCES recursos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
          "CREATE TABLE IF NOT EXISTS atividade_recursos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  atividade_id  INT UNSIGNED NOT NULL,
  recurso_id    INT UNSIGNED NOT NULL,
  pendencias    VARCHAR(500) NULL,
  criado_por    INT UNSIGNED NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ativ_recurso (atividade_id, recurso_id),
  KEY ix_ar_recurso (recurso_id),
  CONSTRAINT fk_ar_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_ar_atividade FOREIGN KEY (atividade_id) REFERENCES atividades(id),
  CONSTRAINT fk_ar_recurso FOREIGN KEY (recurso_id) REFERENCES recursos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"],
    9 => [['coluna', 'rdos', 'numero', "ALTER TABLE rdos ADD COLUMN numero INT UNSIGNED NULL AFTER data"],
          ['coluna', 'rdos', 'terceiros', "ALTER TABLE rdos ADD COLUMN terceiros SMALLINT UNSIGNED NULL AFTER efetivo"],
          ['coluna', 'rdos', 'terceiros_desc', "ALTER TABLE rdos ADD COLUMN terceiros_desc VARCHAR(200) NULL AFTER terceiros"],
          ['coluna', 'rdos', 'aberto_por', "ALTER TABLE rdos ADD COLUMN aberto_por INT UNSIGNED NULL AFTER situacao"],
          ['coluna', 'rdos', 'enviado_por', "ALTER TABLE rdos ADD COLUMN enviado_por INT UNSIGNED NULL AFTER aberto_por"],
          ['coluna', 'rdos', 'enviado_em', "ALTER TABLE rdos ADD COLUMN enviado_em DATETIME NULL AFTER enviado_por"],
          ['coluna', 'rdos', 'dados', "ALTER TABLE rdos ADD COLUMN dados MEDIUMTEXT NULL AFTER pdf"],
          ['coluna', 'rdos', 'codigo', "ALTER TABLE rdos ADD COLUMN codigo VARCHAR(12) NULL AFTER dados"],
          ['coluna', 'empresas', 'logo_cor', "ALTER TABLE empresas ADD COLUMN logo_cor VARCHAR(7) NULL AFTER logo"],
          "CREATE TABLE IF NOT EXISTS rdo_presencas (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rdo_id         INT UNSIGNED NOT NULL,
  funcionario_id INT UNSIGNED NOT NULL,
  presente       TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_rdo_pessoa (rdo_id, funcionario_id),
  CONSTRAINT fk_rdop_rdo FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
  CONSTRAINT fk_rdop_func FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"],
    10 => ["CREATE TABLE IF NOT EXISTS relatorios (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id  INT UNSIGNED NOT NULL,
  tipo        ENUM('obra','gerencial','sst','recursos') NOT NULL,
  numero      INT UNSIGNED NOT NULL,
  referencia  VARCHAR(40) NOT NULL,
  projeto_id  INT UNSIGNED NULL,
  inicio      DATE NOT NULL,
  fim         DATE NOT NULL,
  secoes      VARCHAR(120) NULL,
  resumo      TEXT NULL,
  dados       MEDIUMTEXT NOT NULL,
  codigo      VARCHAR(12) NOT NULL,
  emitido_por INT UNSIGNED NULL,
  emitido_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em DATETIME NULL,
  KEY ix_rel_empresa (empresa_id, tipo, emitido_em),
  CONSTRAINT fk_rel_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_rel_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"],
    11 => [['coluna', 'usuarios', 'telefone', "ALTER TABLE usuarios ADD COLUMN telefone VARCHAR(15) NULL AFTER email, ADD UNIQUE KEY uq_usuarios_tel (telefone)"],
           "ALTER TABLE usuarios MODIFY email VARCHAR(190) NULL",
           ['coluna', 'usuarios', 'desativado_em', "ALTER TABLE usuarios ADD COLUMN desativado_em DATETIME NULL AFTER avisos_email"],
           "ALTER TABLE convites MODIFY email VARCHAR(190) NULL",
           ['coluna', 'convites', 'telefone', "ALTER TABLE convites ADD COLUMN telefone VARCHAR(15) NULL AFTER email"],
           ['coluna', 'convites', 'canal', "ALTER TABLE convites ADD COLUMN canal ENUM('email','whatsapp') NOT NULL DEFAULT 'email' AFTER telefone"],
           ['coluna', 'empresas', 'endereco', "ALTER TABLE empresas ADD COLUMN endereco VARCHAR(200) NULL AFTER telefone"],
           ['coluna', 'empresas', 'email_contato', "ALTER TABLE empresas ADD COLUMN email_contato VARCHAR(190) NULL AFTER uf"],
           ['coluna', 'empresas', 'site', "ALTER TABLE empresas ADD COLUMN site VARCHAR(120) NULL AFTER email_contato"],
           ['coluna', 'empresas', 'regras', "ALTER TABLE empresas ADD COLUMN regras TEXT NULL AFTER dias_uteis"],
           ['coluna', 'empresas', 'calendario_id', "ALTER TABLE empresas ADD COLUMN calendario_id INT UNSIGNED NULL AFTER regras"]],
];
function migrar(PDO $pdo): void {
    $alvo = max(array_keys(TF_MIGRACOES));
    $marca = dirname(config()['_arquivo'] ?? (sys_get_temp_dir() . '/x')) . '/tf-banco-versao-gestao.txt';
    $atual = is_file($marca) ? (int)trim((string)file_get_contents($marca)) : 0;
    if ($atual >= $alvo) return;
    $tem = $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'projetos'")->fetchColumn();
    if (!$tem) return;                       // banco ainda não instalado: o instalador cria tudo já atualizado
    foreach (TF_MIGRACOES as $v => $cmds) {
        if ($v <= $atual) continue;
        foreach ($cmds as $c) {
            if (is_array($c)) {          // ['coluna', tabela, coluna, sql]: só roda se a coluna ainda não existe (vale para MySQL e MariaDB)
                $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
                $st->execute([$c[1], $c[2]]);
                if (!$st->fetchColumn()) $pdo->exec($c[3]);
            } else $pdo->exec($c);
        }
    }
    @file_put_contents($marca, (string)$alvo);
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
    if (in_array($m, ['POST', 'PATCH', 'PUT'], true) || ($m === 'DELETE' && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0)) {
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
             WHERE s.id = ? AND s.expira_em > UTC_TIMESTAMP() AND u.excluido_em IS NULL AND u.desativado_em IS NULL AND e.excluido_em IS NULL AND e.situacao <> "suspenso"',
            [hash_token($t)]);
    if ($r) { q('UPDATE sessoes SET usado_em = UTC_TIMESTAMP() WHERE id = ?', [hash_token($t)]); $r['dono_plataforma'] = eh_dono_plataforma($r['email']) ? 1 : 0; $u = $r; }
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
/** $m = ['assunto','texto','html'] (de emails.php). Envia HTML com texto puro de reserva. */
function enviar_email(string $para, array $m): bool {
    $c = config();
    if (($c['email_modo'] ?? 'mail') === 'arquivo') {   // testes: grava em arquivo em vez de enviar
        file_put_contents($c['email_arquivo'], json_encode(['para' => $para, 'assunto' => $m['assunto'], 'texto' => $m['texto'], 'html' => $m['html'] ?? null], JSON_UNESCAPED_UNICODE) . "\n", FILE_APPEND);
        return true;
    }
    $de = $c['email_remetente'] ?? 'nao-responda@localhost';
    $sep = 'tf-' . bin2hex(random_bytes(8));
    $cab = "From: =?UTF-8?B?" . base64_encode('Aprumo') . "?= <$de>\r\n"
         . (!empty($m['responder_para']) ? 'Reply-To: ' . $m['responder_para'] . "\r\n" : '')
         . "MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"$sep\"\r\n";
    $corpo = "--$sep\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($m['texto']))
           . "--$sep\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($m['html'] ?? nl2br(htmlspecialchars($m['texto']))))
           . "--$sep--\r\n";
    return @mail($para, '=?UTF-8?B?' . base64_encode($m['assunto']) . '?=', $corpo, $cab, '-f' . $de);
}
/** Dono da plataforma: só os e-mails listados em 'donos_plataforma' no arquivo de configuração do servidor.
    Lista vazia = ninguém vê a caixa do Fale conosco (as mensagens ficam guardadas). */
function donos_plataforma(): array {
    $l = config()['donos_plataforma'] ?? [];
    return array_values(array_filter(array_map(fn($e) => mb_strtolower(trim((string)$e)), is_array($l) ? $l : [$l])));
}
function eh_dono_plataforma(?string $email): bool { return $email !== null && in_array(mb_strtolower(trim($email)), donos_plataforma(), true); }
function link_app(string $caminho): string { return rtrim(config()['app_url'] ?? '', '/') . $caminho; }
