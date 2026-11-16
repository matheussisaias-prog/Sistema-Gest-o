<?php
/* ═══════════════════════════════════════════════════════════════
   Aprumo · servidor · porta de entrada de todas as chamadas /api/...
═══════════════════════════════════════════════════════════════ */
declare(strict_types=1);
require __DIR__ . '/lib/base.php';
require __DIR__ . '/lib/emails.php';
require __DIR__ . '/lib/acesso.php';
require __DIR__ . '/lib/dados.php';
require __DIR__ . '/lib/instalar.php';
require __DIR__ . '/lib/sincronia.php';
require __DIR__ . '/lib/contato.php';
require __DIR__ . '/lib/painel.php';
require __DIR__ . '/lib/obras.php';
require __DIR__ . '/lib/cronograma.php';
require __DIR__ . '/lib/montar.php';
require __DIR__ . '/lib/assistente.php';
require __DIR__ . '/lib/minhas.php';
require __DIR__ . '/lib/equipe.php';
require __DIR__ . '/lib/recursos.php';
require __DIR__ . '/lib/rdo.php';
require __DIR__ . '/lib/relatorios.php';
require __DIR__ . '/lib/empresa.php';
require __DIR__ . '/lib/historico.php';
require __DIR__ . '/lib/importar.php';
require __DIR__ . '/lib/inicio.php';

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
    'GET obras/resumo'          => 'rota_obras_resumo',
    'GET usuarios'              => 'rota_usuarios_listar',
    'GET obras/#/cronograma'    => 'rota_obra_cronograma',
    'GET obras/#/historico'     => 'rota_obra_historico',
    'GET obras/#/equipe'        => 'rota_obra_equipe',
    'GET modelos'               => 'rota_modelos_listar',
    'DELETE modelos/#'          => 'rota_modelos_excluir',
    'POST obras/#/aplicar-modelo' => 'rota_aplicar_modelo',
    'POST obras/#/salvar-modelo' => 'rota_salvar_modelo',
    'POST obras/#/copiar'       => 'rota_copiar_obra',
    'POST obras/#/importar'     => 'rota_importar_cronograma',
    'GET obras/#/exportar'      => 'rota_exportar_cronograma',
    'GET assistente/buscar'     => 'rota_assistente_buscar',
    'GET assistente/tipos'      => 'rota_assistente_tipos',
    'POST assistente/previa'    => 'rota_assistente_previa',
    'POST obras/#/assistente-montar' => 'rota_assistente_montar',
    'GET minhas-atividades'     => 'rota_minhas_atividades',
    'POST atividades/#/avanco'  => 'rota_atividade_avanco',
    'POST atividades/#/impedimento' => 'rota_atividade_impedimento',
    'GET atividades/#/fotos'    => 'rota_atividade_fotos',
    'GET fotos/#'               => 'rota_foto_arquivo',
    'PATCH ocorrencias/#/liberar' => 'rota_ocorrencia_liberar',
    'GET equipe'                => 'rota_equipe',
    'GET equipe/#'              => 'rota_equipe_ficha',
    'GET tipos-documento'       => 'rota_tipos_documento',
    'POST funcionarios/#/documentos' => 'rota_documento_lancar',
    'GET documentos/#/arquivo'  => 'rota_documento_arquivo',
    'DELETE documentos/#'       => 'rota_documento_excluir',
    'GET cargos-documentos'     => 'rota_cargos_documentos',
    'PUT cargos-documentos'     => 'rota_cargos_documentos_salvar',
    'GET atividades/#/exigencias' => 'rota_atividade_exigencias',
    'PUT atividades/#/exigencias' => 'rota_atividade_exigencias',
    'GET atividades/#/checar-responsavel' => 'rota_checar_responsavel',
    'DELETE membros/#'          => 'rota_membros_excluir',
    'GET linhas-base/#'         => 'rota_linha_base_itens',
    'GET atividades/#/historico' => 'rota_atividade_historico',
    'POST obras/#/simular'      => 'rota_obra_simular',
    'POST obras/#/encadear'     => 'rota_obra_encadear',
    'GET obras/#/linhas-base'   => 'rota_linhas_base_listar',
    'POST obras/#/linhas-base'  => 'rota_linhas_base_salvar',
    'POST dependencias'         => 'rota_dependencias_criar',
    'PATCH dependencias/#'      => 'rota_dependencias_alterar',
    'DELETE dependencias/#'     => 'rota_dependencias_excluir',
    'GET calendarios'           => 'rota_calendarios_listar',
    'POST calendarios'          => 'rota_calendarios_criar',
    'PATCH calendarios/#'       => 'rota_calendarios_alterar',
    'DELETE calendarios/#'      => 'rota_calendarios_excluir',
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
    'PATCH funcionarios/#'      => 'rota_funcionarios_alterar',
    'DELETE funcionarios/#'     => 'rota_funcionarios_excluir',
    'GET recursos'              => 'rota_recursos_listar',
    'POST recursos'             => 'rota_recursos_criar',
    'DELETE recursos/#'         => 'rota_recursos_excluir',
    'GET rdos'                  => 'rota_rdos',
    'POST obras/#/rdos'         => 'rota_rdo_abrir',
    'GET rdos/#'                => 'rota_rdo',
    'PATCH rdos/#'              => 'rota_rdo_alterar',
    'DELETE rdos/#'             => 'rota_rdo_excluir',
    'POST rdos/#/enviar'        => 'rota_rdo_enviar',
    'POST rdos/#/fechar'        => 'rota_rdo_fechar',
    'POST rdos/#/reabrir'       => 'rota_rdo_reabrir',
    'POST rdos/#/entregue'      => 'rota_rdo_entregue',
    'POST rdos/#/assinado'      => 'rota_rdo_assinado',
    'GET rdos/#/folha'          => 'rota_rdo_folha',
    'GET rdos/#/documento'      => 'rota_rdo_documento',
    'GET inicio'                => 'rota_inicio',
    'GET historico'             => 'rota_historico',
    'GET historico/excel'       => 'rota_historico_excel',
    'POST importar/previa'      => 'rota_importar_previa',
    'POST importar/obra'        => 'rota_importar_obra',
    'GET importacoes'           => 'rota_importacoes',
    'GET importar/modelo'       => 'rota_importar_modelo',
    'GET empresa'               => 'rota_empresa',
    'PATCH empresa'             => 'rota_empresa',
    'PUT empresa/regras'        => 'rota_empresa_regras',
    'GET empresa/calendario'    => 'rota_empresa_calendario',
    'PUT empresa/calendario'    => 'rota_empresa_calendario',
    'GET empresa/plano'         => 'rota_empresa_plano',
    'GET empresa/usuarios'      => 'rota_empresa_usuarios',
    'PATCH usuarios/#'          => 'rota_usuario_alterar',
    'POST usuarios/#/desativar' => 'rota_usuario_desativar',
    'POST usuarios/#/reativar'  => 'rota_usuario_reativar',
    'POST usuarios/#/link-senha' => 'rota_usuario_link_senha',
    'GET convites/info'         => 'rota_convite_info',
    'POST convites/#/reenviar'  => 'rota_convite_reenviar',
    'PATCH convites/#'          => 'rota_convite_alterar',
    'DELETE convites/#'         => 'rota_convite_cancelar',
    'GET relatorios'            => 'rota_relatorios',
    'POST relatorios'           => 'rota_relatorios',
    'POST relatorios/previa'    => 'rota_relatorio_previa',
    'POST relatorios/previa/documento' => 'rota_relatorio_previa_documento',
    'GET relatorios/#/documento' => 'rota_relatorio_documento',
    'GET relatorios/#/excel'    => 'rota_relatorio_excel',
    'DELETE relatorios/#'       => 'rota_relatorio_excluir',
    'GET empresa/logo'          => 'rota_empresa_logo',
    'POST empresa/logo'         => 'rota_empresa_logo',
    'DELETE empresa/logo'       => 'rota_empresa_logo',
    'GET empresa/cabecalho'     => 'rota_empresa_cabecalho',
    'GET recursos/#'            => 'rota_recurso_ficha',
    'PATCH recursos/#'          => 'rota_recursos_alterar',
    'GET recursos-mapa'         => 'rota_recursos_mapa',
    'POST recursos/#/controles' => 'rota_controle_lancar',
    'GET controles/#/arquivo'   => 'rota_controle_arquivo',
    'DELETE controles/#'        => 'rota_controle_excluir',
    'POST recursos/#/paradas'   => 'rota_parada_criar',
    'DELETE paradas/#'          => 'rota_parada_excluir',
    'POST recursos/#/locacoes'  => 'rota_locacao_criar',
    'PATCH locacoes/#'          => 'rota_locacao_alterar',
    'GET fornecedores'          => 'rota_fornecedores',
    'POST fornecedores'         => 'rota_fornecedores',
    'PATCH fornecedores/#'      => 'rota_fornecedor_alterar',
    'DELETE fornecedores/#'     => 'rota_fornecedor_alterar',
    'GET atividades/#/recursos' => 'rota_atividade_recursos',
    'PUT atividades/#/recursos' => 'rota_atividade_recursos',
    'GET atividades/#/checar-recurso' => 'rota_checar_recurso',
    'GET ausencias'             => 'rota_ausencias_listar',
    'PUT ausencias/funcionario/#' => 'rota_ausencias_substituir',
    'POST importar'             => 'rota_importar',
    'POST fale-conosco'         => 'rota_fale_conosco',
    'GET fale-conosco'          => 'rota_fale_conosco_listar',
    'PATCH fale-conosco/#'      => 'rota_fale_conosco_marcar',
    'GET painel/empresas'       => 'rota_painel_empresas',
    'PATCH painel/empresas/#'   => 'rota_painel_empresa_situacao',
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
    error_log('[Aprumo API] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    responder(['erro' => 'Erro interno no servidor. Tente de novo; se continuar, avise o suporte.'], 500);
}
