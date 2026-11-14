-- ═══════════════════════════════════════════════════════════════
-- Catálogo padrão de documentos de pessoa por NR (empresa_id = NULL).
-- Regra: o prazo é sempre o que a NR determina (conferido em 14/11/2026).
--   norma                 = prazo fixado na NR; travado para todas as empresas (11)
--   sem_prazo_na_norma    = a NR não fixa vencimento; vale até um gatilho (afastamento, mudança, acidente) (9)
--   sem_validade          = formação/registro sem vencimento (4)
--   validade_no_documento = a validade vem impressa no próprio documento (2)
--   empresa_preenche      = a NR varia por curso/função/estado; cada empresa informa o prazo da NR que se aplica a ela (17)
-- Gatilho de afastamento: NR-07 7.5.9 (ASO, ≥ 30 dias por doença/acidente), NR-01 1.7.1.2.3 (> 180 dias),
--   NR-10 e NR-34 (> 90 dias).
-- referencia: preenchida só onde o item foi conferido.
-- NRs sem documento de pessoa: 03, 04, 08, 09, 14, 15, 16, 21, 24, 25, 26, 28. Revogadas: 02, 27.
-- ═══════════════════════════════════════════════════════════════
SET NAMES utf8mb4;
INSERT INTO tipos_documento (empresa_id, nr, nome, categoria, prazo_origem, prazo_valor, prazo_unidade, referencia, gatilho_afastamento_dias, gatilho_motivo, gatilho_referencia, observacao, bloqueia_alocacao) VALUES
(NULL,'NR-01','Treinamento inicial de SST / integração','treinamento','sem_prazo_na_norma',NULL,NULL,NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)',NULL,1),
(NULL,'NR-01','Ordem de serviço de segurança assinada','ficha','sem_validade',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-05','Treinamento da CIPA','treinamento','norma',2,'anos','5.7.3',181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)','Antes da posse (5.7.1); mandato de 1 ano (5.4.6); aproveitável por até 2 anos (5.7.3)',0),
(NULL,'NR-06','Ficha de entrega de EPI','ficha','sem_validade',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-06','Treinamento de uso de EPI','treinamento','sem_prazo_na_norma',NULL,NULL,NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)',NULL,0),
(NULL,'NR-07','ASO – periódico (exposto a riscos)','exame','norma',1,'anos','7.5.8 II a',30,'doenca_acidente','NR-07 7.5.9 (afastamento ≥ 30 dias)','Ou intervalo menor, a critério do médico',1),
(NULL,'NR-07','ASO – periódico (demais empregados)','exame','norma',2,'anos','7.5.8 II b',30,'doenca_acidente','NR-07 7.5.9 (afastamento ≥ 30 dias)',NULL,1),
(NULL,'NR-10','NR-10 Básico','treinamento','norma',2,'anos',NULL,91,'qualquer','NR-10 (afastamento > 90 dias)','Nova NR-10 (Portaria 737/2026) vigora em 01/06/2027 e mantém bienal e > 90 dias',1),
(NULL,'NR-10','NR-10 Complementar (SEP)','treinamento','norma',2,'anos',NULL,91,'qualquer','NR-10 (afastamento > 90 dias)','Nova NR-10 (Portaria 737/2026) vigora em 01/06/2027 e mantém bienal e > 90 dias',1),
(NULL,'NR-10','Autorização para serviços em eletricidade','autorizacao','sem_prazo_na_norma',NULL,NULL,NULL,NULL,NULL,NULL,'Depende de treinamento e ASO válidos',1),
(NULL,'NR-11','Treinamento de operador de equipamento de transporte','treinamento','sem_prazo_na_norma',NULL,NULL,NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)','A NR-11 não fixa validade para o treinamento',1),
(NULL,'NR-11','Cartão de identificação do operador','autorizacao','norma',1,'anos','11.1.6.1',NULL,NULL,NULL,'Revalidação exige exame de saúde completo',1),
(NULL,'NR-12','Capacitação para operação de máquinas','treinamento','sem_prazo_na_norma',NULL,NULL,NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)','Reciclar quando houver modificação que gere novos riscos',1),
(NULL,'NR-12','Capacitação para manutenção/inspeção de máquinas','treinamento','sem_prazo_na_norma',NULL,NULL,NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)','Reciclar quando houver modificação que gere novos riscos',1),
(NULL,'NR-13','Operador de caldeira','treinamento','sem_validade',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-13','Operador de unidade de processo','treinamento','sem_validade',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-17','Treinamento de ergonomia (quando exigido)','treinamento','sem_prazo_na_norma',NULL,NULL,NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)',NULL,0),
(NULL,'NR-18','Básico em segurança do trabalho (canteiro)','treinamento','norma',2,'anos','Anexo I',181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)',NULL,1),
(NULL,'NR-18','Operador de grua, guindaste ou elevador de obra','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-19','Trabalho com explosivos (blaster)','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-20','NR-20 Iniciação','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,'Prazo varia por curso e classe da instalação',1),
(NULL,'NR-20','NR-20 Básico','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,'Prazo varia por curso e classe da instalação',1),
(NULL,'NR-20','NR-20 Intermediário','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,'Prazo varia por curso e classe da instalação',1),
(NULL,'NR-20','NR-20 Avançado I','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,'Prazo varia por curso e classe da instalação',1),
(NULL,'NR-20','NR-20 Avançado II','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,'Prazo varia por curso e classe da instalação',1),
(NULL,'NR-20','NR-20 Específico','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,'Prazo varia por curso e classe da instalação',1),
(NULL,'NR-22','Treinamento em mineração','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-23','Brigada de incêndio','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,'Prazo segue a legislação estadual do Corpo de Bombeiros',0),
(NULL,'NR-29','Treinamento portuário','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-30','Treinamento aquaviário','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-31','Operador de máquinas e implementos agrícolas','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-31','Aplicação de agrotóxicos','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-32','Capacitação em serviços de saúde','treinamento','sem_prazo_na_norma',NULL,NULL,NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)',NULL,0),
(NULL,'NR-33','Espaço confinado – trabalhador autorizado e vigia','treinamento','norma',1,'anos',NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)',NULL,1),
(NULL,'NR-33','Espaço confinado – supervisor de entrada','treinamento','norma',1,'anos',NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)',NULL,1),
(NULL,'NR-34','Treinamento periódico (indústria naval)','treinamento','norma',1,'anos',NULL,91,'qualquer','NR-34 (afastamento > 90 dias)',NULL,1),
(NULL,'NR-35','Trabalho em altura','treinamento','norma',2,'anos',NULL,181,'qualquer','NR-01 1.7.1.2.3 (afastamento > 180 dias)','Eventual conforme NR-01 (35.4.2)',1),
(NULL,'NR-35','Autorização para trabalho em altura','autorizacao','sem_prazo_na_norma',NULL,NULL,NULL,NULL,NULL,NULL,'Depende de treinamento e ASO válidos',1),
(NULL,'NR-36','Treinamento em frigoríficos','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-37','Treinamento em plataformas de petróleo','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,'NR-38','Treinamento em limpeza urbana','treinamento','empresa_preenche',NULL,NULL,NULL,NULL,NULL,NULL,NULL,1),
(NULL,NULL,'Integração do cliente / da planta','treinamento','validade_no_documento',NULL,NULL,NULL,NULL,NULL,NULL,'Validade definida pelo cliente, lida do certificado',1),
(NULL,NULL,'CNH (motorista)','outro','validade_no_documento',NULL,NULL,NULL,NULL,NULL,NULL,'Validade impressa na CNH',1);
