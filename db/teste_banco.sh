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
INSERT INTO apontamentos(empresa_id,funcionario_id,projeto_id,atividade_id,data,horas,lancado_por) VALUES (1,1,1,2,'2026-11-14',8,2),(1,2,1,2,'2026-11-14',8,2);
INSERT INTO fotos(empresa_id,projeto_id,atividade_id,rdo_id,enviada_por,tirada_em,arquivo,miniatura) VALUES (1,1,2,1,2,'2026-11-14 10:30','f/1.jpg','f/1m.jpg');
INSERT INTO ausencias(empresa_id,funcionario_id,inicio,fim,tipo) VALUES (1,2,'2026-12-01','2026-12-30','Férias');
INSERT INTO mensagens(empresa_id,de_usuario_id,para_funcionario_id,texto) VALUES (1,1,2,'Amanhã começa a pintura');
INSERT INTO historico(empresa_id,usuario_id,tabela,registro_id,acao,antes,depois) VALUES (1,2,'atividades',2,'alterou','{\"avanco\":0}','{\"avanco\":30}');
"
check "21 tabelas" "$($M -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='tf'")" 21
check "Rawtech só vê as suas atividades" "$($M -e "SELECT COUNT(*) FROM atividades WHERE empresa_id=1")" 2
check "Outra empresa só vê a sua" "$($M -e "SELECT GROUP_CONCAT(descricao) FROM atividades WHERE empresa_id=2")" "Atividade da outra"
check "Efetivo do RDO pelas horas" "$($M -e "SELECT COUNT(DISTINCT funcionario_id) FROM apontamentos WHERE projeto_id=1 AND data='2026-11-14'")" 2
check "Fotos do RDO do dia" "$($M -e "SELECT COUNT(*) FROM fotos f JOIN rdos r ON r.id=f.rdo_id WHERE r.data='2026-11-14' AND f.no_rdo=1")" 1
check "Férias = 1 linha para 30 dias" "$($M -e "SELECT COUNT(*) FROM ausencias WHERE funcionario_id=2")" 1
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
echo "RESULTADO: $ok ok, $fail falhas"
