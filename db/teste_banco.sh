M="mariadb -uroot --socket=/tmp/mdb/s.sock --default-character-set=utf8mb4 tf -N -B"
ok=0; fail=0
check(){ if [ "$2" = "$3" ]; then echo "OK   $1"; ok=$((ok+1)); else echo "FALHA $1 (esperado '$3', veio '$2')"; fail=$((fail+1)); fi; }
deve_falhar(){ if $M -e "$2" 2>/dev/null; then echo "FALHA $1 (aceitou)"; fail=$((fail+1)); else echo "OK   $1 (recusado)"; ok=$((ok+1)); fi; }
$M -e "
INSERT INTO empresas(id,nome,cnpj) VALUES (1,'Rawtech','00.000.000/0001-00'),(2,'Outra Engenharia','11.111.111/0001-11');
INSERT INTO funcionarios(id,empresa_id,nome,apelido,tipo_trabalho) VALUES (1,1,'João Paulo','JOÃO PAULO','campo'),(2,1,'David',NULL,'campo'),(3,2,'Carlos',NULL,'campo');
INSERT INTO usuarios(id,empresa_id,nome,email,senha_hash,perfil,funcionario_id) VALUES (1,1,'Admin Rawtech','admin@rawtech.test','x','administrador',NULL),(2,1,'João Paulo','jp@rawtech.test','x','encarregado',1),(3,2,'Admin Outra','admin@outra.test','x','administrador',NULL);
INSERT INTO projetos(id,empresa_id,codigo,nome,inicio,fim) VALUES (1,1,'MAN-001','Manipuladores','2026-10-15','2026-12-24'),(2,2,'OBR-001','Obra da outra','2026-11-01','2026-12-01');
INSERT INTO atividades(id,empresa_id,projeto_id,descricao,responsavel_id,inicio,fim,duracao_horas) VALUES (1,1,1,'Compra de material',1,'2026-10-31','2026-11-19',152),(2,1,1,'Fabricação das peças',1,'2026-11-09','2026-12-09',200),(3,2,2,'Atividade da outra',3,'2026-11-01','2026-11-10',40);
INSERT INTO dependencias(empresa_id,antes_id,depois_id) VALUES (1,1,2);
INSERT INTO rdos(empresa_id,projeto_id,data) VALUES (1,1,'2026-11-14');
INSERT INTO convites(empresa_id,nome,email,perfil,funcionario_id,token_hash,criado_por,expira_em) VALUES (1,'David','david@rawtech.test','funcionario',2,REPEAT('a',64),1,'2026-11-21');
INSERT INTO tipos_documento(id,empresa_id,nr,nome,categoria,prazo_origem,prazo_valor,prazo_unidade,gatilho_afastamento_dias,gatilho_motivo,substitui_id) SELECT 500,1,nr,nome,categoria,prazo_origem,prazo_valor,prazo_unidade,gatilho_afastamento_dias,gatilho_motivo,id FROM tipos_documento WHERE empresa_id IS NULL AND nome='Trabalho em altura';
INSERT INTO tipos_documento(id,empresa_id,nr,nome,categoria,prazo_origem,prazo_valor,prazo_unidade,gatilho_afastamento_dias,gatilho_motivo,substitui_id) SELECT 501,1,nr,nome,categoria,prazo_origem,prazo_valor,prazo_unidade,gatilho_afastamento_dias,gatilho_motivo,id FROM tipos_documento WHERE empresa_id IS NULL AND nome='ASO – periódico (demais empregados)';
INSERT INTO tipos_documento(id,empresa_id,nr,nome,categoria,prazo_origem,substitui_id) SELECT 502,1,nr,nome,categoria,prazo_origem,id FROM tipos_documento WHERE empresa_id IS NULL AND nome='NR-20 Básico';
INSERT INTO exigencias_documento(empresa_id,tipo_documento_id,atividade_id) VALUES (1,500,2);
INSERT INTO documentos_funcionario(empresa_id,funcionario_id,tipo_documento_id,emissao) VALUES (1,1,500,'2024-11-01'),(1,2,500,'2025-06-01'),(1,2,501,'2025-06-01'),(1,3,500,'2025-06-01');
UPDATE funcionarios SET empresa_id=1 WHERE id=3;
INSERT INTO ausencias(empresa_id,funcionario_id,inicio,fim,tipo) VALUES (1,2,'2026-09-01','2026-10-10','Afastamento – doença ou acidente'),(1,3,'2026-01-05','2026-07-24','Afastamento – outro motivo');
INSERT INTO apontamentos(empresa_id,funcionario_id,projeto_id,atividade_id,data,horas,lancado_por) VALUES (1,1,1,2,'2026-11-14',8,2),(1,2,1,2,'2026-11-14',8,2);
INSERT INTO fotos(empresa_id,projeto_id,atividade_id,rdo_id,enviada_por,tirada_em,arquivo,miniatura) VALUES (1,1,2,1,2,'2026-11-14 10:30','f/1.jpg','f/1m.jpg');
INSERT INTO ausencias(empresa_id,funcionario_id,inicio,fim,tipo) VALUES (1,2,'2026-12-01','2026-12-30','Férias');
INSERT INTO mensagens(empresa_id,de_usuario_id,para_funcionario_id,texto) VALUES (1,1,2,'Amanhã começa a pintura');
INSERT INTO historico(empresa_id,usuario_id,tabela,registro_id,acao,antes,depois) VALUES (1,2,'atividades',2,'alterou','{\"avanco\":0}','{\"avanco\":30}');
"
check "28 tabelas" "$($M -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='tf' AND table_type='BASE TABLE'")" 28
check "Rawtech só vê as suas atividades" "$($M -e "SELECT COUNT(*) FROM atividades WHERE empresa_id=1")" 2
check "Outra empresa só vê a sua" "$($M -e "SELECT GROUP_CONCAT(descricao) FROM atividades WHERE empresa_id=2")" "Atividade da outra"
check "Efetivo do RDO pelas horas" "$($M -e "SELECT COUNT(DISTINCT funcionario_id) FROM apontamentos WHERE projeto_id=1 AND data='2026-11-14'")" 2
check "Fotos do RDO do dia" "$($M -e "SELECT COUNT(*) FROM fotos f JOIN rdos r ON r.id=f.rdo_id WHERE r.data='2026-11-14' AND f.no_rdo=1")" 1
check "Férias = 1 linha para 30 dias" "$($M -e "SELECT COUNT(*) FROM ausencias WHERE funcionario_id=2 AND tipo='Férias'")" 1
check "David ausente em 15/12" "$($M -e "SELECT COUNT(*) FROM ausencias WHERE funcionario_id=2 AND '2026-12-15' BETWEEN inicio AND fim")" 1
check "Histórico guarda antes/depois" "$($M -e "SELECT JSON_VALUE(depois,'\$.avanco') FROM historico WHERE registro_id=2")" 30
deve_falhar "Avanço acima de 100%" "UPDATE atividades SET avanco=120 WHERE id=1"
deve_falhar "Dois RDOs na mesma obra e dia" "INSERT INTO rdos(empresa_id,projeto_id,data) VALUES (1,1,'2026-11-14')"
deve_falhar "Ausência com fim antes do início" "INSERT INTO ausencias(empresa_id,funcionario_id,inicio,fim,tipo) VALUES (1,1,'2026-12-10','2026-12-01','Folga')"
deve_falhar "E-mail de login repetido" "INSERT INTO usuarios(empresa_id,nome,email,perfil) VALUES (2,'X','admin@rawtech.test','gestor')"
deve_falhar "Atividade dependendo dela mesma" "INSERT INTO dependencias(empresa_id,antes_id,depois_id) VALUES (1,2,2)"
deve_falhar "Horas acima de 24 no dia" "INSERT INTO apontamentos(empresa_id,funcionario_id,projeto_id,data,horas,lancado_por) VALUES (1,1,1,'2026-11-15',30,2)"
deve_falhar "Atividade em obra que não existe" "INSERT INTO atividades(empresa_id,projeto_id,descricao) VALUES (1,999,'x')"
deve_falhar "Mensagem sem destinatário" "INSERT INTO mensagens(empresa_id,de_usuario_id,texto) VALUES (1,1,'oi')"
deve_falhar "Código de obra repetido na mesma empresa" "INSERT INTO projetos(empresa_id,codigo,nome) VALUES (1,'MAN-001','dup')"
check "Mesmo código permitido em outra empresa" "$($M -e "INSERT INTO projetos(empresa_id,codigo,nome) VALUES (2,'MAN-001','ok'); SELECT COUNT(*) FROM projetos WHERE codigo='MAN-001'")" 2
check "Catálogo com 43 documentos de NR" "$($M -e "SELECT COUNT(*) FROM tipos_documento WHERE empresa_id IS NULL")" 43
check "NR-35: prazo da norma = 2 anos" "$($M -e "SELECT CONCAT(prazo_valor,' ',prazo_unidade) FROM tipos_documento WHERE empresa_id IS NULL AND nome='Trabalho em altura'")" "2 anos"
check "NR-11: cartão do operador vale 1 ano" "$($M -e "SELECT CONCAT(prazo_valor,' ',prazo_unidade) FROM tipos_documento WHERE empresa_id IS NULL AND nome='Cartão de identificação do operador'")" "1 anos"
check "ASO: gatilho de 30 dias por doença/acidente" "$($M -e "SELECT CONCAT(gatilho_afastamento_dias,' ',gatilho_motivo) FROM tipos_documento WHERE empresa_id IS NULL AND nr='NR-07' LIMIT 1")" "30 doenca_acidente"
check "NR-35 do João venceu em 01/11/2026" "$($M -e "SELECT vence_em FROM v_documentos_situacao WHERE funcionario_id=1 AND tipo_documento_id=500")" "2026-11-01"
check "ASO do David invalidado (40 dias afastado por doença)" "$($M -e "SELECT invalidado_por_afastamento FROM v_documentos_situacao WHERE funcionario_id=2 AND tipo_documento_id=501")" 1
check "NR-35 do David segue válida (40 dias < 180)" "$($M -e "SELECT invalidado_por_afastamento FROM v_documentos_situacao WHERE funcionario_id=2 AND tipo_documento_id=500")" 0
check "NR-35 do Carlos invalidada (201 dias afastado)" "$($M -e "SELECT invalidado_por_afastamento FROM v_documentos_situacao WHERE funcionario_id=3 AND tipo_documento_id=500")" 1
deve_falhar "Empresa mudar prazo da NR-35 (travado)" "UPDATE tipos_documento SET prazo_valor=3 WHERE id=500"
deve_falhar "Empresa mudar gatilho do ASO (travado)" "UPDATE tipos_documento SET gatilho_afastamento_dias=60 WHERE id=501"
check "Empresa preenche prazo da NR-20 Básico" "$($M -e "UPDATE tipos_documento SET prazo_valor=3,prazo_unidade='anos' WHERE id=502; SELECT CONCAT(prazo_valor,' ',prazo_unidade) FROM tipos_documento WHERE id=502")" "3 anos"
check "Prazo em dias funciona" "$($M -e "UPDATE tipos_documento SET prazo_valor=30,prazo_unidade='dias' WHERE id=502; INSERT INTO documentos_funcionario(empresa_id,funcionario_id,tipo_documento_id,emissao) VALUES (1,1,502,'2026-11-01'); SELECT vence_em FROM v_documentos_situacao WHERE tipo_documento_id=502")" "2026-12-01"
deve_falhar "Prazo 'norma' sem valor" "INSERT INTO tipos_documento(nr,nome,categoria,prazo_origem) VALUES ('NR-99','x','treinamento','norma')"
check "Bloqueio: quem está com NR-35 vencida na atividade de altura" "$($M -e "SELECT GROUP_CONCAT(f.nome) FROM apontamentos ap JOIN funcionarios f ON f.id=ap.funcionario_id JOIN exigencias_documento e ON e.atividade_id=ap.atividade_id LEFT JOIN v_documentos_situacao d ON d.funcionario_id=f.id AND d.tipo_documento_id=e.tipo_documento_id AND (d.vence_em IS NULL OR d.vence_em>='2026-11-14') AND d.invalidado_por_afastamento=0 WHERE ap.data='2026-11-14' AND d.id IS NULL")" "João Paulo"
deve_falhar "Perfil cliente (removido)" "INSERT INTO usuarios(empresa_id,nome,email,perfil) VALUES (1,'C','c@x.test','cliente')"
deve_falhar "RDO assinado sem a cópia da folha" "UPDATE rdos SET situacao='Assinado' WHERE id=1"
check "RDO assinado com a cópia da folha" "$($M -e "UPDATE rdos SET situacao='Assinado',copia_assinada='rdo/1-assinado.jpg',cliente_assinante='Eng. Cliente',assinado_cliente_em='2026-11-14' WHERE id=1; SELECT situacao FROM rdos WHERE id=1")" "Assinado"
deve_falhar "Convite com token repetido" "INSERT INTO convites(empresa_id,nome,email,perfil,token_hash,criado_por,expira_em) VALUES (1,'X','x@x.test','gestor',REPEAT('a',64),1,'2026-11-21')"
deve_falhar "Exigência sem cargo, obra ou atividade" "INSERT INTO exigencias_documento(empresa_id,tipo_documento_id) VALUES (1,500)"
echo "RESULTADO: $ok ok, $fail falhas"
