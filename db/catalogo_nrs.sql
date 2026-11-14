-- ═══════════════════════════════════════════════════════════════
-- Catálogo padrão de documentos de pessoa por NR (empresa_id = NULL).
-- Cada empresa recebe uma cópia no cadastro e pode ajustar prazos,
-- desligar o que não usa e criar documentos próprios.
-- prazo_origem:
--   norma        = prazo fixado no texto da NR (conferido em 14/11/2026)
--   referencia   = preenchida só onde o item foi conferido; o resto a empresa completa
--   empresa      = a NR manda reciclar, mas o prazo é definido pela empresa (NR-01 1.7.1.2.2)
--   sem_validade = formação/registro sem vencimento
--   a_confirmar  = a NR fixa prazo por curso/função; o engenheiro de segurança confirma
-- NRs sem documento de pessoa: 03, 04, 08, 09, 14, 15, 16, 21, 24, 25, 26, 28. Revogadas: 02, 27.
-- ═══════════════════════════════════════════════════════════════
SET NAMES utf8mb4;
INSERT INTO tipos_documento (empresa_id, nr, nome, categoria, validade_meses, prazo_origem, referencia, bloqueia_alocacao) VALUES
(NULL,'NR-01','Treinamento inicial de SST / integração','treinamento',NULL,'empresa',NULL,1),
(NULL,'NR-01','Ordem de serviço de segurança assinada','ficha',NULL,'sem_validade',NULL,1),
(NULL,'NR-05','Treinamento da CIPA (a cada mandato)','treinamento',NULL,'empresa',NULL,0),
(NULL,'NR-06','Ficha de entrega de EPI','ficha',NULL,'sem_validade',NULL,1),
(NULL,'NR-06','Treinamento de uso de EPI','treinamento',NULL,'empresa',NULL,0),
(NULL,'NR-07','ASO – periódico (exposto a riscos)','exame',12,'norma','7.5.8 II a',1),
(NULL,'NR-07','ASO – periódico (demais empregados)','exame',24,'norma','7.5.8 II b',1),
(NULL,'NR-10','NR-10 Básico','treinamento',24,'norma',NULL,1),
(NULL,'NR-10','NR-10 Complementar (SEP)','treinamento',24,'norma',NULL,1),
(NULL,'NR-10','Autorização para serviços em eletricidade','autorizacao',NULL,'empresa',NULL,1),
(NULL,'NR-11','Operador de equipamento de transporte (empilhadeira, ponte rolante)','treinamento',NULL,'empresa',NULL,1),
(NULL,'NR-12','Capacitação para operação de máquinas','treinamento',NULL,'empresa',NULL,1),
(NULL,'NR-12','Capacitação para manutenção/inspeção de máquinas','treinamento',NULL,'empresa',NULL,1),
(NULL,'NR-13','Operador de caldeira','treinamento',NULL,'sem_validade',NULL,1),
(NULL,'NR-13','Operador de unidade de processo','treinamento',NULL,'sem_validade',NULL,1),
(NULL,'NR-17','Treinamento de ergonomia (quando exigido)','treinamento',NULL,'empresa',NULL,0),
(NULL,'NR-18','Básico em segurança do trabalho (canteiro)','treinamento',24,'norma','Anexo I',1),
(NULL,'NR-18','Operador de grua, guindaste ou elevador de obra','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-19','Trabalho com explosivos (blaster)','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-20','NR-20 Iniciação','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-20','NR-20 Básico','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-20','NR-20 Intermediário','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-20','NR-20 Avançado I','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-20','NR-20 Avançado II','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-20','NR-20 Específico','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-22','Treinamento em mineração','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-23','Brigada de incêndio','treinamento',NULL,'empresa',NULL,0),
(NULL,'NR-29','Treinamento portuário','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-30','Treinamento aquaviário','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-31','Operador de máquinas e implementos agrícolas','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-31','Aplicação de agrotóxicos','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-32','Capacitação em serviços de saúde','treinamento',NULL,'empresa',NULL,0),
(NULL,'NR-33','Espaço confinado – trabalhador autorizado e vigia','treinamento',12,'norma',NULL,1),
(NULL,'NR-33','Espaço confinado – supervisor de entrada','treinamento',12,'norma',NULL,1),
(NULL,'NR-34','Treinamento periódico (indústria naval)','treinamento',12,'norma',NULL,1),
(NULL,'NR-35','Trabalho em altura','treinamento',24,'norma',NULL,1),
(NULL,'NR-35','Autorização para trabalho em altura','autorizacao',NULL,'empresa',NULL,1),
(NULL,'NR-36','Treinamento em frigoríficos','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-37','Treinamento em plataformas de petróleo','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,'NR-38','Treinamento em limpeza urbana','treinamento',NULL,'a_confirmar',NULL,1),
(NULL,NULL,'Integração do cliente / da planta','treinamento',NULL,'empresa',NULL,1),
(NULL,NULL,'CNH (motorista)','outro',NULL,'empresa',NULL,1);
