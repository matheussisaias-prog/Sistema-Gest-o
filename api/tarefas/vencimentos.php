<?php
/* Task Flow · tarefa agendada (Hostinger → Avançado → Tarefas Cron), toda segunda às 07:00:
     php /home/SEU_USUARIO/public_html/api/tarefas/vencimentos.php
   Envia aos administradores e gestores de cada empresa a lista de documentos de NR vencidos, faltando ou vencendo em 30 dias.
   Só roda pela linha de comando (o navegador recebe 404). */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../lib/base.php';
require __DIR__ . '/../lib/emails.php';
require __DIR__ . '/../lib/acesso.php';
require __DIR__ . '/../lib/dados.php';
require __DIR__ . '/../lib/sincronia.php';
require __DIR__ . '/../lib/obras.php';
require __DIR__ . '/../lib/cronograma.php';
require __DIR__ . '/../lib/montar.php';
require __DIR__ . '/../lib/assistente.php';
require __DIR__ . '/../lib/minhas.php';
require __DIR__ . '/../lib/equipe.php';
try {
    $env = eq_enviar_vencimentos(isset($argv[1]) && ctype_digit($argv[1]) ? (int)$argv[1] : null);
    echo gmdate('Y-m-d H:i') . ' · e-mails de vencimento enviados: ' . count($env) . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, 'Erro: ' . $e->getMessage() . PHP_EOL); exit(1);
}
