<?php
/* Modelo do arquivo de configuração do servidor.
   Copie para  <pasta do domínio>/tf-config.php  — AO LADO do public_html, nunca dentro dele —
   e preencha com os dados do banco criado no painel da Hostinger.
   Este arquivo NÃO vai para o GitHub (tem a senha do banco). */
return [
    'db_host'  => 'localhost',
    'db_name'  => 'u000000000_taskflow',   // nome do banco (Hostinger > Bancos de dados MySQL)
    'db_user'  => 'u000000000_taskflow',   // usuário do banco
    'db_pass'  => 'SENHA-DO-BANCO',        // senha que você definiu no painel
    'app_url'  => 'https://gestao.mercurium.com.br',
    'email_remetente' => 'nao-responda@mercurium.com.br',
    // Só para a primeira instalação; apague esta linha depois de instalar:
    'instalar_token' => 'TROQUE-POR-UMA-SEQUENCIA-LONGA-E-ALEATORIA',
];
