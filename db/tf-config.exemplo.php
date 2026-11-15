<?php
/* Modelo do arquivo de configuração do servidor.
   Crie como  tf-config-gestao.php  na RAIZ da hospedagem ("Todos os arquivos de hospedagem"), fora de qualquer site —
   e preencha com os dados do banco criado no painel da Hostinger.
   Este arquivo NÃO vai para o GitHub (tem a senha do banco). */
return [
    'db_host'  => 'localhost',
    'db_name'  => 'u000000000_taskflow',   // nome do banco (Hostinger > Bancos de dados MySQL)
    'db_user'  => 'u000000000_taskflow',   // usuário do banco
    'db_pass'  => 'SENHA-DO-BANCO',        // senha que você definiu no painel
    'app_url'  => 'https://gestao.mercurium.com.br',
    'email_remetente' => 'no-reply@mercurium.com.br',
    // Quem administra o Task Flow e lê a caixa do Fale conosco (e recebe o aviso por e-mail).
    // Ex.: ['suporte@mercurium.com.br']. Use o e-mail de login de uma conta já cadastrada. Vazio = ninguém vê a caixa; as mensagens ficam guardadas.
    'donos_plataforma' => [],
    // Só para a primeira instalação; apague esta linha depois de instalar:
    'instalar_token' => 'TROQUE-POR-UMA-SEQUENCIA-LONGA-E-ALEATORIA',
];
