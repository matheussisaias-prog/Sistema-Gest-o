<?php
/* ═══════════════════════════════════════════════════════════════
   Aprumo · servidor · modelos de e-mail (HTML + texto puro)
   HTML em tabelas e estilos na própria tag: é o que Gmail, Outlook e celular exibem igual.
═══════════════════════════════════════════════════════════════ */
declare(strict_types=1);

function h(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function link_contato(): string { return link_app('/entrar.html#contato'); }
function primeiro_nome(string $n): string { return explode(' ', trim($n))[0] ?: $n; }

/**
 * Monta o e-mail padrão.
 * $c = [previa, titulo, saudacao, paragrafos[], lista[] (opcional), botao, link, nota, motivo]
 */
function email_modelo(array $c): array {
    $contato = link_contato();
    $ps = ''; foreach ($c['paragrafos'] as $p) $ps .= '<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">' . $p . '</p>';
    $lista = '';
    if (!empty($c['lista'])) {
        $itens = '';
        foreach ($c['lista'] as $i) $itens .= '<tr><td style="padding:0 10px 8px 0;vertical-align:top;color:#2563eb;font-size:15px;line-height:22px">&#10003;</td><td style="padding:0 0 8px;font-size:14px;line-height:22px;color:#334155">' . $i . '</td></tr>';
        $lista = '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;width:100%"><tr><td style="padding:16px 18px 8px"><table role="presentation" cellpadding="0" cellspacing="0">' . $itens . '</table></td></tr></table>';
    }
    $html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>' . h($c['titulo']) . '</title></head>
<body style="margin:0;padding:0;background:#f1f4f9;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">' . h($c['previa']) . '</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f9"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:\'Segoe UI\',Helvetica,Arial,sans-serif">
  <tr><td style="background:#0b1220;border-radius:14px 14px 0 0;padding:20px 32px">
    <img src="' . h(link_app('/img/logo-email.png?v=2026.11.16.14')) . '" width="200" height="40" alt="Aprumo by mercurium" style="display:block;border:0;outline:none;color:#ffffff;font-size:18px;font-weight:700">
  </td></tr>
  <tr><td style="background:#ffffff;padding:36px 32px 30px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
    <h1 style="margin:0 0 18px;font-size:23px;line-height:30px;font-weight:700;color:#0f172a">' . h($c['titulo']) . '</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155">' . $c['saudacao'] . '</p>
    ' . $ps . $lista . '
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:#2563eb;border-radius:10px">
      <a href="' . h($c['link']) . '" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">' . h($c['botao']) . ' &rarr;</a>
    </td></tr></table>
    <p style="margin:0 0 6px;font-size:13px;line-height:20px;color:#64748b">Se o botão não abrir, copie e cole este endereço no navegador:</p>
    <p style="margin:0 0 22px;font-size:12px;line-height:18px;word-break:break-all"><a href="' . h($c['link']) . '" style="color:#2563eb">' . h($c['link']) . '</a></p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e2e8f0;padding-top:18px;font-size:13px;line-height:20px;color:#64748b">' . $c['nota'] . '</td></tr></table>
  </td></tr>
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 14px 14px;padding:20px 32px;font-size:12px;line-height:19px;color:#94a3b8">
    <strong style="color:#64748b">Aprumo</strong> by mercurium · Gestão de obras e serviços de engenharia<br>
    Dúvidas? Use o <a href="' . h($contato) . '" style="color:#64748b">Fale conosco</a> no sistema. Este e-mail não recebe respostas.<br>
    ' . h($c['motivo']) . '
  </td></tr>
</table></td></tr></table></body></html>';
    // versão em texto puro (aparece em leitores que não abrem HTML)
    $txt = strip_tags(str_replace(['<br>', '</p>'], ["\n", "\n\n"], $c['saudacao'] . "\n\n" . implode("\n\n", $c['paragrafos'])));
    if (!empty($c['lista'])) $txt .= "\n" . implode("\n", array_map(fn($i) => '  - ' . strip_tags($i), $c['lista'])) . "\n";
    $txt = html_entity_decode($txt, ENT_QUOTES, 'UTF-8') . "\n\n" . $c['botao'] . ":\n" . $c['link'] . "\n\n" . html_entity_decode(strip_tags($c['nota']), ENT_QUOTES, 'UTF-8')
         . "\n\n--\nAprumo · Gestão de obras e serviços de engenharia\nDúvidas? Use o Fale conosco no sistema: $contato\nEste e-mail não recebe respostas.\n";
    return ['html' => $html, 'texto' => $txt];
}

function email_confirmacao(string $nome, string $empresa, string $link): array {
    return ['assunto' => "Confirme seu e-mail para ativar a $empresa no Aprumo"] + email_modelo([
        'previa' => 'Falta um passo: confirme seu e-mail para começar a usar o sistema.',
        'titulo' => 'Confirme seu e-mail',
        'saudacao' => 'Olá, ' . h(primeiro_nome($nome)) . '.',
        'paragrafos' => ['Recebemos o cadastro da <strong>' . h($empresa) . '</strong> no Aprumo, com você como <strong>administrador</strong>. Para ativar a conta e começar a usar o sistema, confirme seu e-mail.'],
        'lista' => ['Cadastre as obras e o cronograma', 'Convide a equipe e defina o papel de cada pessoa', 'Acompanhe avanço, atrasos e documentos de NR em um só lugar'],
        'botao' => 'Confirmar meu e-mail', 'link' => $link,
        'nota' => 'Este link vale por <strong>48 horas</strong>. Se você não fez este cadastro, ignore este e-mail: nenhuma conta será ativada.',
        'motivo' => 'Você recebeu este e-mail porque seu endereço foi usado no cadastro de uma empresa.',
    ]);
}

function email_convite(string $nome, string $empresa, string $quem, string $perfil, string $link, int $dias): array {
    $papel = ['administrador' => 'Administrador', 'gestor' => 'Gestor', 'encarregado' => 'Encarregado', 'funcionario' => 'Funcionário'][$perfil] ?? $perfil;
    $faz = [
        'administrador' => ['Ver e alterar tudo da empresa', 'Convidar pessoas e definir papéis'],
        'gestor' => ['Ver e alterar todas as obras', 'Acompanhar cronograma, equipe e relatórios'],
        'encarregado' => ['Lançar avanço, fotos e horas da sua equipe', 'Acompanhar as obras em que você atua'],
        'funcionario' => ['Ver as suas tarefas do dia', 'Lançar o avanço do que você executou'],
    ][$perfil] ?? [];
    return ['assunto' => "$quem convidou você para a $empresa no Aprumo"] + email_modelo([
        'previa' => "Crie sua senha para acessar o sistema de gestão da $empresa.",
        'titulo' => 'Você foi convidado',
        'saudacao' => 'Olá, ' . h(primeiro_nome($nome)) . '.',
        'paragrafos' => ['<strong>' . h($quem) . '</strong> convidou você para o sistema de gestão de obras da <strong>' . h($empresa) . '</strong>, com o perfil de <strong>' . h($papel) . '</strong>. Com ele você poderá:'],
        'lista' => $faz,
        'botao' => 'Criar minha senha', 'link' => $link,
        'nota' => "Este convite vale por <strong>$dias dias</strong>. Se não esperava por ele, ignore este e-mail ou fale com quem convidou você.",
        'motivo' => "Você recebeu este e-mail porque foi incluído na equipe da $empresa.",
    ]);
}

function email_redefinir(string $nome, string $email, string $link): array {
    return ['assunto' => 'Redefinição de senha do Aprumo'] + email_modelo([
        'previa' => 'Use o link para criar uma nova senha. Ele vale por 1 hora.',
        'titulo' => 'Redefinir sua senha',
        'saudacao' => 'Olá, ' . h(primeiro_nome($nome)) . '.',
        'paragrafos' => ['Recebemos um pedido para criar uma nova senha para a conta <strong>' . h($email) . '</strong>. Ao salvar a nova senha, os aparelhos conectados com a senha antiga serão desconectados.'],
        'botao' => 'Criar nova senha', 'link' => $link,
        'nota' => 'Este link vale por <strong>1 hora</strong> e só pode ser usado uma vez. Se você não pediu a troca, ignore este e-mail: sua senha atual continua valendo.',
        'motivo' => 'Você recebeu este e-mail porque alguém pediu a redefinição de senha da sua conta.',
    ]);
}

function email_aviso_contato(string $nome, string $assunto, string $link): array {
    return ['assunto' => "Nova mensagem no Fale conosco: $assunto"] + email_modelo([
        'previa' => 'Chegou uma mensagem nova. Entre no Aprumo para ler e responder.',
        'titulo' => 'Nova mensagem no Fale conosco',
        'saudacao' => 'Olá, ' . h(primeiro_nome($nome)) . '.',
        'paragrafos' => ['Chegou uma mensagem nova pelo Fale conosco, com o assunto <strong>' . h($assunto) . '</strong>. Por segurança, o conteúdo não vem por e-mail: entre no sistema e abra a caixa do Fale conosco, no cabeçalho, para ler e responder.'],
        'botao' => 'Entrar no Aprumo', 'link' => $link,
        'nota' => 'Você recebe este aviso porque administra a plataforma Aprumo.',
        'motivo' => 'Aviso automático do Fale conosco.',
    ]);
}

function email_aviso_impedimento(string $nome, string $quem, string $obra, string $atividade, string $motivo, string $texto, string $link): array {
    return ['assunto' => "Travou: $atividade ($obra)"] + email_modelo([
        'previa' => "$quem informou um impedimento: $motivo.",
        'titulo' => 'Uma atividade travou',
        'saudacao' => 'Olá, ' . h(primeiro_nome($nome)) . '.',
        'paragrafos' => [h($quem) . ' informou que a atividade <strong>' . h($atividade) . '</strong>, da obra <strong>' . h($obra) . '</strong>, está travada.'],
        'lista' => array_values(array_filter(['Motivo: ' . h($motivo), $texto !== '' ? 'O que falta: ' . h($texto) : null])),
        'botao' => 'Abrir a obra', 'link' => $link,
        'nota' => 'A atividade fica marcada como travada no cronograma até alguém liberar.',
        'motivo' => 'Você recebe este aviso porque é gestor desta obra no Aprumo.',
    ]);
}
