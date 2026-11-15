<?php
/* Task Flow · servidor · Fale conosco (funciona com ou sem login) e a caixa do dono da plataforma */
declare(strict_types=1);

const ASSUNTOS_CONTATO = ['Dúvida', 'Problema no sistema', 'Sugestão', 'Comercial', 'Outro'];

/** POST /api/fale-conosco {nome, email, assunto, mensagem, site?} */
function rota_fale_conosco(): array {
    $d = corpo();
    if (!empty($d['site'])) return ['ok' => true];                // campo invisível: só robô preenche
    $u = usuario_atual();
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    if (!$u && $ip && (int)um('SELECT COUNT(*) AS n FROM fale_conosco WHERE ip = ? AND criado_em > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)', [$ip])['n'] >= 5)
        throw new ErroApi('Muitas mensagens em pouco tempo. Tente de novo mais tarde.', 429);
    $nome = $u ? $u['nome'] : campo($d, 'nome', true, 160);
    $email = $u ? $u['email'] : email_valido($d['email'] ?? '');
    $assunto = in_array($d['assunto'] ?? '', ASSUNTOS_CONTATO, true) ? $d['assunto'] : 'Outro';
    $msg = campo($d, 'mensagem', true, 5000);
    if (mb_strlen($msg) < 10) throw new ErroApi('Escreva um pouco mais sobre o que precisa (pelo menos 10 caracteres).');
    inserir('fale_conosco', ['empresa_id' => $u['empresa_id'] ?? null, 'usuario_id' => $u['id'] ?? null, 'nome' => $nome,
        'email' => $email, 'assunto' => $assunto, 'mensagem' => $msg, 'origem' => $u ? 'sistema' : 'login', 'ip' => $ip]);
    // aviso aos donos da plataforma: só avisa e leva ao login; a mensagem é lida dentro do sistema
    foreach (donos_plataforma() as $para) {
        $dono = um('SELECT nome FROM usuarios WHERE email = ? AND excluido_em IS NULL LIMIT 1', [$para]);
        enviar_email($para, email_aviso_contato($dono['nome'] ?? 'equipe Task Flow', $assunto, link_app('/entrar.html')));
    }
    return ['ok' => true, 'mensagem' => 'Mensagem enviada. Vamos responder no seu e-mail.'];
}

function exigir_dono(): array {
    $u = exigir_login();
    if (empty($u['dono_plataforma'])) throw new ErroApi('Só a administração do Task Flow vê esta caixa', 403);
    return $u;
}
/** GET /api/fale-conosco — caixa de mensagens (dono da plataforma) */
function rota_fale_conosco_listar(): array {
    exigir_dono();
    return ['mensagens' => todos('SELECT f.id, f.nome, f.email, f.assunto, f.mensagem, f.origem, f.criado_em, f.respondido_em, e.nome AS empresa
        FROM fale_conosco f LEFT JOIN empresas e ON e.id = f.empresa_id ORDER BY f.respondido_em IS NOT NULL, f.id DESC LIMIT 300'),
        'pendentes' => (int)um('SELECT COUNT(*) AS n FROM fale_conosco WHERE respondido_em IS NULL')['n']];
}
/** PATCH /api/fale-conosco/{id} {respondida: true|false} */
function rota_fale_conosco_marcar(int $id): array {
    $u = exigir_dono();
    if (!um('SELECT id FROM fale_conosco WHERE id = ?', [$id])) throw new ErroApi('Mensagem não encontrada', 404);
    $sim = !empty(corpo()['respondida']);
    q('UPDATE fale_conosco SET respondido_em = ' . ($sim ? 'UTC_TIMESTAMP()' : 'NULL') . ' WHERE id = ?', [$id]);
    registrar($u, (int)$u['empresa_id'], 'fale_conosco', $id, 'alterou', null, ['respondida' => $sim]);
    return ['ok' => true];
}
