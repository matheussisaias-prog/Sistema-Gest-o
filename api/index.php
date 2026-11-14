<?php
/* ═══════════════════════════════════════════════════════════════
   TaskFlow PRO · servidor · porta de entrada de todas as chamadas /api/...
═══════════════════════════════════════════════════════════════ */
declare(strict_types=1);
require __DIR__ . '/lib/base.php';
require __DIR__ . '/lib/acesso.php';
require __DIR__ . '/lib/dados.php';
require __DIR__ . '/lib/instalar.php';

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$caminho = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$caminho = trim(preg_replace('#^.*?/api(/|$)#', '', $caminho), '/');

$rotas = [
    'GET saude'                 => fn() => ['ok' => true, 'versao' => TF_VERSAO_API, 'banco' => (bool)um('SELECT 1 AS x')],
    'POST instalar'             => 'rota_instalar',
    'POST cadastro'             => 'rota_cadastro',
    'POST confirmar-email'      => 'rota_confirmar_email',
    'POST entrar'               => 'rota_entrar',
    'POST sair'                 => 'rota_sair',
    'GET eu'                    => 'rota_eu',
    'POST convites'             => 'rota_convidar',
    'POST convites/aceitar'     => 'rota_aceitar_convite',
    'POST esqueci-senha'        => 'rota_esqueci_senha',
    'POST redefinir-senha'      => 'rota_redefinir_senha',
    'GET projetos'              => 'rota_projetos_listar',
    'POST projetos'             => 'rota_projetos_criar',
    'PATCH projetos/#'          => 'rota_projetos_alterar',
    'DELETE projetos/#'         => 'rota_projetos_excluir',
    'POST projetos/#/membros'   => 'rota_membros_adicionar',
    'GET atividades'            => 'rota_atividades_listar',
    'POST atividades'           => 'rota_atividades_criar',
    'PATCH atividades/#'        => 'rota_atividades_alterar',
    'DELETE atividades/#'       => 'rota_atividades_excluir',
    'GET funcionarios'          => 'rota_funcionarios_listar',
    'POST funcionarios'         => 'rota_funcionarios_criar',
];

try {
    $chave = $metodo . ' ' . preg_replace('#/\d+(?=/|$)#', '/#', $caminho);
    $id = preg_match('#/(\d+)(/|$)#', $caminho, $m) ? (int)$m[1] : null;
    if (!isset($rotas[$chave])) throw new ErroApi('Rota não encontrada', 404);
    $f = $rotas[$chave];
    responder($id !== null ? $f($id) : $f());
} catch (ErroApi $e) {
    responder(['erro' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('[TaskFlow API] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    responder(['erro' => 'Erro interno no servidor. Tente de novo; se continuar, avise o suporte.'], 500);
}
