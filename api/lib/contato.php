<?php
/* TaskFlow PRO · servidor · Fale conosco (funciona com ou sem login) */
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
    $id = inserir('fale_conosco', ['empresa_id' => $u['empresa_id'] ?? null, 'usuario_id' => $u['id'] ?? null, 'nome' => $nome,
        'email' => $email, 'assunto' => $assunto, 'mensagem' => $msg, 'origem' => $u ? 'sistema' : 'login', 'ip' => $ip]);
    $destino = config()['email_contato'] ?? null;               // quem recebe os avisos (no tf-config)
    if ($destino) {
        $emp = $u ? " — {$u['empresa_nome']}" : '';
        enviar_email($destino, ['assunto' => "[Fale conosco] $assunto — $nome$emp",
            'texto' => "Nova mensagem pelo Fale conosco (nº $id)\n\nDe: $nome <$email>$emp\nAssunto: $assunto\n\n$msg\n",
            'html' => null, 'responder_para' => $email]);
    }
    return ['ok' => true, 'mensagem' => 'Mensagem enviada. Vamos responder no seu e-mail.'];
}
