-- ═══════════════════════════════════════════════════════════════
-- TaskFlow PRO · Fase 1 · Banco de dados (MySQL 8 / MariaDB 10.6+)
-- 25 tabelas em 5 blocos: Acesso, Planejamento, Equipe, Campo,
-- Comunicação e histórico.
-- Regras:
--   * toda tabela de dados tem empresa_id (isolamento por empresa)
--   * nada é apagado: excluido_em marca a exclusão
--   * datas/horas gravadas em UTC; a tela mostra em America/Sao_Paulo
-- ═══════════════════════════════════════════════════════════════
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ── Bloco 1 · Acesso ────────────────────────────────────────────
CREATE TABLE empresas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(160) NOT NULL,          -- nome fantasia
  razao_social  VARCHAR(200) NULL,
  cnpj          VARCHAR(18)  NULL,
  telefone      VARCHAR(30)  NULL,
  cidade        VARCHAR(100) NULL,
  uf            CHAR(2)      NULL,
  cadastrada_por INT UNSIGNED NULL,               -- quem fez o cadastro (vira administrador)
  logo          VARCHAR(255) NULL,
  plano         VARCHAR(30)  NOT NULL DEFAULT 'teste',
  situacao      ENUM('teste','ativo','suspenso') NOT NULL DEFAULT 'teste',
  fuso          VARCHAR(40)  NOT NULL DEFAULT 'America/Sao_Paulo',
  dias_uteis    VARCHAR(20)  NOT NULL DEFAULT '1,2,3,4,5',
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em   DATETIME NULL,
  UNIQUE KEY uq_empresas_cnpj (cnpj)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE usuarios (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  nome           VARCHAR(160) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  senha_hash     VARCHAR(255) NULL,
  perfil         ENUM('administrador','gestor','encarregado','funcionario') NOT NULL,
  funcionario_id INT UNSIGNED NULL,
  microsoft_id   VARCHAR(64)  NULL,
  email_confirmado_em DATETIME NULL,
  acao_token_hash CHAR(64) NULL,                  -- link de confirmar e-mail ou redefinir senha
  acao_tipo      ENUM('confirmar_email','redefinir_senha') NULL,
  acao_expira    DATETIME NULL,
  tentativas_erradas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_ate  DATETIME NULL,
  ultimo_acesso  DATETIME NULL,
  avisos_email   TINYINT(1) NOT NULL DEFAULT 1,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  UNIQUE KEY uq_usuarios_email (email),
  UNIQUE KEY uq_usuarios_microsoft (microsoft_id),
  UNIQUE KEY uq_usuarios_acao (acao_token_hash),
  KEY ix_usuarios_empresa (empresa_id),
  CONSTRAINT fk_usuarios_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_usuarios_funcionario FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE convites (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  nome           VARCHAR(160) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  perfil         ENUM('administrador','gestor','encarregado','funcionario') NOT NULL,
  funcionario_id INT UNSIGNED NULL,               -- ficha criada no cadastro da empresa
  token_hash     CHAR(64) NOT NULL,
  criado_por     INT UNSIGNED NOT NULL,
  enviado_em     DATETIME NULL,
  expira_em      DATETIME NOT NULL,
  aceito_em      DATETIME NULL,
  cancelado_em   DATETIME NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_convite_token (token_hash),
  KEY ix_convite_email (email),
  CONSTRAINT fk_conv_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_conv_func FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  CONSTRAINT fk_conv_autor FOREIGN KEY (criado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessoes (
  id            CHAR(64) PRIMARY KEY,            -- hash do token, nunca o token
  usuario_id    INT UNSIGNED NOT NULL,
  dispositivo_id INT UNSIGNED NULL,              -- quando entrou pelo tablet da obra
  aparelho      VARCHAR(160) NULL,
  ip            VARCHAR(45)  NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em     DATETIME NOT NULL,
  KEY ix_sessoes_usuario (usuario_id),
  CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessoes_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES dispositivos_obra(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projeto_membros (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  projeto_id    INT UNSIGNED NOT NULL,
  usuario_id    INT UNSIGNED NOT NULL,
  papel         ENUM('gestor','encarregado','funcionario') NOT NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_membro (projeto_id, usuario_id),
  CONSTRAINT fk_membros_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_membros_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_membros_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dispositivos_obra (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  projeto_id    INT UNSIGNED NULL,
  nome          VARCHAR(80) NOT NULL,             -- "Tablet canteiro Lear"
  token_hash    CHAR(64) NOT NULL,
  autorizado_por INT UNSIGNED NOT NULL,
  ultimo_uso    DATETIME NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revogado_em   DATETIME NULL,
  UNIQUE KEY uq_dispositivo_token (token_hash),
  CONSTRAINT fk_disp_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_disp_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_disp_autor FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bloco 2 · Planejamento ──────────────────────────────────────
CREATE TABLE projetos (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  codigo         VARCHAR(30)  NULL,
  nome           VARCHAR(160) NOT NULL,
  descricao      TEXT NULL,
  tipo_servico   VARCHAR(40)  NULL,               -- Elétrica, NR-12, Montagem…
  cliente        VARCHAR(160) NULL,
  numero_contrato VARCHAR(60) NULL,               -- contrato ou pedido do cliente
  local_obra     VARCHAR(200) NULL,
  gestor_id      INT UNSIGNED NULL,
  gestor_nome    VARCHAR(160) NULL,               -- texto antigo, quando não achar a pessoa
  rt_funcionario_id INT UNSIGNED NULL,            -- responsável técnico (da equipe)
  art_numero     VARCHAR(40)  NULL,
  situacao       ENUM('Planejamento','Em andamento','Pausado','Concluído','Arquivado') NOT NULL DEFAULT 'Em andamento',
  inicio         DATE NULL,
  fim            DATE NULL,
  cor            CHAR(7) NULL,
  valor_contrato DECIMAL(14,2) NULL,
  id_antigo      VARCHAR(40) NULL,                -- id do navegador (importação)
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  UNIQUE KEY uq_projetos_codigo (empresa_id, codigo),
  KEY ix_projetos_empresa (empresa_id, situacao),
  CONSTRAINT fk_projetos_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_projetos_gestor FOREIGN KEY (gestor_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE atividades (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  projeto_id     INT UNSIGNED NOT NULL,
  pai_id         INT UNSIGNED NULL,
  codigo_eap     VARCHAR(20) NULL,
  descricao      VARCHAR(255) NOT NULL,
  observacoes    TEXT NULL,
  responsavel_id INT UNSIGNED NULL,
  inicio         DATE NULL,
  fim            DATE NULL,
  duracao_horas  DECIMAL(8,1) NULL,
  avanco         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  situacao       ENUM('Pendente','Em andamento','Concluído','Reprogramado') NOT NULL DEFAULT 'Pendente',
  critica        TINYINT(1) NOT NULL DEFAULT 0,
  peso           DECIMAL(8,3) NOT NULL DEFAULT 1,
  ordem          INT NOT NULL DEFAULT 0,
  id_antigo      VARCHAR(40) NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  KEY ix_ativ_projeto (projeto_id, ordem),
  KEY ix_ativ_responsavel (responsavel_id, fim),
  KEY ix_ativ_empresa (empresa_id),
  CONSTRAINT ck_ativ_avanco CHECK (avanco <= 100),
  CONSTRAINT fk_ativ_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_ativ_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_ativ_pai FOREIGN KEY (pai_id) REFERENCES atividades(id),
  CONSTRAINT fk_ativ_responsavel FOREIGN KEY (responsavel_id) REFERENCES funcionarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dependencias (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  antes_id      INT UNSIGNED NOT NULL,            -- precisa terminar/começar…
  depois_id     INT UNSIGNED NOT NULL,            -- …para esta começar
  tipo          ENUM('TC','CC','TT','CT') NOT NULL DEFAULT 'TC',
  folga_dias    SMALLINT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_dependencia (antes_id, depois_id),
  CONSTRAINT ck_dep_diferente CHECK (antes_id <> depois_id),
  CONSTRAINT fk_dep_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_dep_antes FOREIGN KEY (antes_id) REFERENCES atividades(id),
  CONSTRAINT fk_dep_depois FOREIGN KEY (depois_id) REFERENCES atividades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE linhas_base (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  projeto_id    INT UNSIGNED NOT NULL,
  numero        SMALLINT UNSIGNED NOT NULL,       -- 0 = original, 1, 2… = reprogramações
  nome          VARCHAR(120) NOT NULL,
  motivo        TEXT NULL,
  aprovada_por  INT UNSIGNED NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lb (projeto_id, numero),
  CONSTRAINT fk_lb_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_lb_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_lb_autor FOREIGN KEY (aprovada_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE linha_base_itens (
  linha_base_id INT UNSIGNED NOT NULL,
  atividade_id  INT UNSIGNED NOT NULL,
  inicio        DATE NULL,
  fim           DATE NULL,
  peso          DECIMAL(8,3) NOT NULL DEFAULT 1,
  PRIMARY KEY (linha_base_id, atividade_id),
  CONSTRAINT fk_lbi_lb FOREIGN KEY (linha_base_id) REFERENCES linhas_base(id) ON DELETE CASCADE,
  CONSTRAINT fk_lbi_ativ FOREIGN KEY (atividade_id) REFERENCES atividades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bloco 3 · Equipe ────────────────────────────────────────────
CREATE TABLE funcionarios (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  nome           VARCHAR(160) NOT NULL,
  apelido        VARCHAR(160) NULL,
  cargo          VARCHAR(80)  NULL,
  equipe         VARCHAR(80)  NULL,
  tipo_trabalho  ENUM('campo','escritorio','ambos') NOT NULL DEFAULT 'campo',
  encarregado_id INT UNSIGNED NULL,
  telefone       VARCHAR(30)  NULL,
  email          VARCHAR(190) NULL,
  pin_hash       VARCHAR(255) NULL,
  custo_hora     DECIMAL(10,2) NULL,
  ativo          TINYINT(1) NOT NULL DEFAULT 1,
  anonimizado_em DATETIME NULL,
  id_antigo      VARCHAR(60) NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  KEY ix_func_empresa (empresa_id, ativo, nome),
  CONSTRAINT fk_func_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_func_encarregado FOREIGN KEY (encarregado_id) REFERENCES funcionarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ausencias (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  funcionario_id INT UNSIGNED NOT NULL,
  inicio         DATE NOT NULL,
  fim            DATE NOT NULL,
  tipo           ENUM('Folga','Férias','Treinamento','Outra atividade','Afastamento – doença ou acidente','Afastamento – outro motivo') NOT NULL,
  detalhe        VARCHAR(200) NULL,
  criado_por     INT UNSIGNED NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  KEY ix_aus_periodo (funcionario_id, inicio, fim),
  CONSTRAINT ck_aus_periodo CHECK (fim >= inicio),
  CONSTRAINT fk_aus_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_aus_func FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  CONSTRAINT fk_aus_autor FOREIGN KEY (criado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tipos_documento (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NULL,               -- NULL = catálogo padrão do sistema
  nr             VARCHAR(10)  NULL,               -- 'NR-10'; NULL = documento fora das NRs
  nome           VARCHAR(160) NOT NULL,
  categoria      ENUM('treinamento','exame','autorizacao','ficha','outro') NOT NULL,
  -- Prazo: sempre o da NR. 'norma' fica travado (ver travas.sql e o servidor).
  prazo_origem   ENUM('norma','sem_prazo_na_norma','sem_validade','validade_no_documento','empresa_preenche') NOT NULL,
  prazo_valor    SMALLINT UNSIGNED NULL,
  prazo_unidade  ENUM('dias','meses','anos') NULL,
  referencia     VARCHAR(80)  NULL,               -- item da norma (só quando conferido)
  -- Gatilho: o documento deixa de valer depois de um afastamento longo
  gatilho_afastamento_dias SMALLINT UNSIGNED NULL,  -- vale a partir deste nº de dias
  gatilho_motivo ENUM('qualquer','doenca_acidente') NULL,
  gatilho_referencia VARCHAR(80) NULL,
  observacao     VARCHAR(255) NULL,
  bloqueia_alocacao TINYINT(1) NOT NULL DEFAULT 1,
  aviso_dias     SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  ativo          TINYINT(1) NOT NULL DEFAULT 1,
  substitui_id   INT UNSIGNED NULL,               -- cópia da empresa de um item do catálogo
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_tipos_empresa (empresa_id, nr),
  CONSTRAINT ck_tipos_prazo_norma CHECK (prazo_origem <> 'norma' OR (prazo_valor IS NOT NULL AND prazo_unidade IS NOT NULL)),
  CONSTRAINT ck_tipos_prazo_par CHECK ((prazo_valor IS NULL) = (prazo_unidade IS NULL)),
  CONSTRAINT ck_tipos_gatilho_par CHECK ((gatilho_afastamento_dias IS NULL) = (gatilho_motivo IS NULL)),
  CONSTRAINT fk_tipos_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_tipos_subst FOREIGN KEY (substitui_id) REFERENCES tipos_documento(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exigencias_documento (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  tipo_documento_id INT UNSIGNED NOT NULL,
  cargo          VARCHAR(80) NULL,                -- exigido de todo eletricista…
  projeto_id     INT UNSIGNED NULL,               -- …ou de todos nesta obra (integração do cliente)
  atividade_id   INT UNSIGNED NULL,               -- …ou de quem for alocado nesta atividade
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_exig_alvo CHECK (cargo IS NOT NULL OR projeto_id IS NOT NULL OR atividade_id IS NOT NULL),
  CONSTRAINT fk_exig_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_exig_tipo FOREIGN KEY (tipo_documento_id) REFERENCES tipos_documento(id),
  CONSTRAINT fk_exig_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_exig_ativ FOREIGN KEY (atividade_id) REFERENCES atividades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE documentos_funcionario (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  funcionario_id INT UNSIGNED NOT NULL,
  tipo_documento_id INT UNSIGNED NOT NULL,
  emissao        DATE NULL,
  validade       DATE NULL,                       -- emissão + prazo da NR; digitada só quando a validade vem no documento
  instituicao    VARCHAR(160) NULL,
  carga_horaria  DECIMAL(5,1) NULL,
  apto           TINYINT(1) NULL,                 -- só para ASO; nunca o laudo
  arquivo        VARCHAR(255) NULL,
  restrito       TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = só administrador abre o arquivo
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  KEY ix_doc_validade (empresa_id, validade),
  CONSTRAINT fk_doc_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_doc_func FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  CONSTRAINT fk_doc_tipo FOREIGN KEY (tipo_documento_id) REFERENCES tipos_documento(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recursos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NOT NULL,
  nome          VARCHAR(160) NOT NULL,
  tipo          ENUM('equipamento','veiculo','ferramenta','outro') NOT NULL DEFAULT 'equipamento',
  custo         DECIMAL(10,2) NULL,
  custo_unidade ENUM('hora','dia') NULL,
  ativo         TINYINT(1) NOT NULL DEFAULT 1,
  id_antigo     VARCHAR(60) NULL,
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em   DATETIME NULL,
  CONSTRAINT fk_rec_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bloco 4 · Campo ─────────────────────────────────────────────
CREATE TABLE rdos (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  projeto_id     INT UNSIGNED NOT NULL,
  data           DATE NOT NULL,
  clima_manha    ENUM('Bom','Nublado','Chuva','Impraticável') NULL,
  clima_tarde    ENUM('Bom','Nublado','Chuva','Impraticável') NULL,
  efetivo        SMALLINT UNSIGNED NULL,
  resumo         TEXT NULL,
  situacao       ENUM('Rascunho','Fechado','Entregue','Assinado') NOT NULL DEFAULT 'Rascunho',
  fechado_por    INT UNSIGNED NULL,               -- gestor revisou e gerou o PDF
  fechado_em     DATETIME NULL,
  pdf            VARCHAR(255) NULL,               -- PDF de entrega para imprimir
  entregue_em    DATE NULL,                       -- dia da entrega ao cliente
  cliente_assinante VARCHAR(160) NULL,            -- quem assinou no papel
  assinado_cliente_em DATE NULL,                  -- data escrita na folha
  copia_assinada VARCHAR(255) NULL,               -- foto/scan da folha assinada
  copia_enviada_por INT UNSIGNED NULL,
  copia_enviada_em  DATETIME NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  UNIQUE KEY uq_rdo_dia (projeto_id, data),
  CONSTRAINT fk_rdo_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_rdo_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT ck_rdo_assinado CHECK (situacao <> 'Assinado' OR copia_assinada IS NOT NULL),
  CONSTRAINT fk_rdo_fechou FOREIGN KEY (fechado_por) REFERENCES usuarios(id),
  CONSTRAINT fk_rdo_copia FOREIGN KEY (copia_enviada_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fotos (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  projeto_id     INT UNSIGNED NOT NULL,
  atividade_id   INT UNSIGNED NULL,
  rdo_id         INT UNSIGNED NULL,
  no_rdo         TINYINT(1) NOT NULL DEFAULT 1,   -- o gestor escolhe quais saem
  enviada_por    INT UNSIGNED NOT NULL,           -- usuário que enviou
  funcionario_id INT UNSIGNED NULL,               -- quando o encarregado lança por alguém
  tirada_em      DATETIME NOT NULL,
  legenda        VARCHAR(255) NULL,
  arquivo        VARCHAR(255) NOT NULL,
  miniatura      VARCHAR(255) NOT NULL,
  latitude       DECIMAL(9,6) NULL,
  longitude      DECIMAL(9,6) NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  KEY ix_fotos_dia (projeto_id, tirada_em),
  CONSTRAINT fk_foto_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_foto_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_foto_ativ FOREIGN KEY (atividade_id) REFERENCES atividades(id),
  CONSTRAINT fk_foto_rdo FOREIGN KEY (rdo_id) REFERENCES rdos(id),
  CONSTRAINT fk_foto_autor FOREIGN KEY (enviada_por) REFERENCES usuarios(id),
  CONSTRAINT fk_foto_func FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE apontamentos (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  funcionario_id INT UNSIGNED NOT NULL,
  projeto_id     INT UNSIGNED NOT NULL,
  atividade_id   INT UNSIGNED NULL,
  data           DATE NOT NULL,
  horas          DECIMAL(4,1) NOT NULL,
  avanco_informado TINYINT UNSIGNED NULL,          -- % que o campo informou na atividade
  lancado_por    INT UNSIGNED NOT NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  KEY ix_apont_dia (projeto_id, data),
  KEY ix_apont_func (funcionario_id, data),
  CONSTRAINT ck_apont_horas CHECK (horas > 0 AND horas <= 24),
  CONSTRAINT fk_apont_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_apont_func FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  CONSTRAINT fk_apont_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_apont_ativ FOREIGN KEY (atividade_id) REFERENCES atividades(id),
  CONSTRAINT fk_apont_autor FOREIGN KEY (lancado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ocorrencias (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  projeto_id     INT UNSIGNED NOT NULL,
  atividade_id   INT UNSIGNED NULL,
  data           DATE NOT NULL,
  tipo           ENUM('Clima','Falta de material','Acidente','Pendência do cliente','Equipamento','Outro') NOT NULL,
  gravidade      ENUM('Baixa','Média','Alta') NOT NULL DEFAULT 'Baixa',
  descricao      TEXT NOT NULL,
  registrada_por INT UNSIGNED NOT NULL,
  resolvida_em   DATETIME NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  KEY ix_ocor_dia (projeto_id, data),
  CONSTRAINT fk_ocor_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_ocor_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_ocor_ativ FOREIGN KEY (atividade_id) REFERENCES atividades(id),
  CONSTRAINT fk_ocor_autor FOREIGN KEY (registrada_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Bloco 5 · Comunicação e histórico ───────────────────────────
CREATE TABLE mensagens (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  de_usuario_id  INT UNSIGNED NOT NULL,
  para_funcionario_id INT UNSIGNED NULL,          -- conversa com quem não tem login
  para_usuario_id     INT UNSIGNED NULL,
  texto          TEXT NOT NULL,
  anexo          VARCHAR(255) NULL,
  projeto_id     INT UNSIGNED NULL,
  atividade_id   INT UNSIGNED NULL,
  lida_em        DATETIME NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  excluido_em    DATETIME NULL,
  KEY ix_msg_para (para_usuario_id, lida_em),
  KEY ix_msg_conversa (empresa_id, de_usuario_id, para_usuario_id, criado_em),
  CONSTRAINT ck_msg_destino CHECK (para_usuario_id IS NOT NULL OR para_funcionario_id IS NOT NULL),
  CONSTRAINT fk_msg_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_msg_de FOREIGN KEY (de_usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_msg_para_u FOREIGN KEY (para_usuario_id) REFERENCES usuarios(id),
  CONSTRAINT fk_msg_para_f FOREIGN KEY (para_funcionario_id) REFERENCES funcionarios(id),
  CONSTRAINT fk_msg_projeto FOREIGN KEY (projeto_id) REFERENCES projetos(id),
  CONSTRAINT fk_msg_ativ FOREIGN KEY (atividade_id) REFERENCES atividades(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE avisos (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  usuario_id     INT UNSIGNED NOT NULL,
  tipo           ENUM('prazo','documento','rdo','mensagem','ocorrencia','convite','sistema') NOT NULL,
  titulo         VARCHAR(160) NOT NULL,
  link           VARCHAR(255) NULL,
  lido_em        DATETIME NULL,
  email_enviado_em DATETIME NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_aviso_usuario (usuario_id, lido_em),
  CONSTRAINT fk_aviso_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_aviso_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE fale_conosco (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT UNSIGNED NULL,                -- preenchido quando enviado de dentro do sistema
  usuario_id    INT UNSIGNED NULL,
  nome          VARCHAR(160) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  assunto       VARCHAR(40)  NOT NULL,
  mensagem      TEXT NOT NULL,
  origem        ENUM('login','sistema') NOT NULL,
  ip            VARCHAR(45)  NULL,
  respondido_em DATETIME NULL,
  anotacao      TEXT NULL,                        -- anotação interna da Mercurium (não vai para o cliente)
  criado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_fale_ip (ip, criado_em),
  CONSTRAINT fk_fale_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_fale_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE historico (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  usuario_id     INT UNSIGNED NULL,               -- NULL = importado ou sistema
  tabela         VARCHAR(40) NOT NULL,
  registro_id    BIGINT UNSIGNED NULL,
  acao           ENUM('criou','alterou','excluiu','restaurou','entrou','importou') NOT NULL,
  antes          JSON NULL,
  depois         JSON NULL,
  quando         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip             VARCHAR(45) NULL,
  KEY ix_hist_registro (tabela, registro_id),
  KEY ix_hist_empresa (empresa_id, quando),
  CONSTRAINT fk_hist_empresa FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT fk_hist_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Situação de cada documento (usada pelos alertas e pelo bloqueio de alocação) ──
CREATE VIEW v_documentos_situacao AS
SELECT d.id, d.empresa_id, d.funcionario_id, d.tipo_documento_id, t.nr, t.nome AS documento,
       t.prazo_origem, d.emissao,
       CASE
         WHEN t.prazo_origem IN ('sem_validade','sem_prazo_na_norma') THEN NULL
         WHEN t.prazo_origem = 'validade_no_documento' THEN d.validade
         WHEN t.prazo_unidade = 'dias'  THEN DATE_ADD(d.emissao, INTERVAL t.prazo_valor DAY)
         WHEN t.prazo_unidade = 'meses' THEN DATE_ADD(d.emissao, INTERVAL t.prazo_valor MONTH)
         WHEN t.prazo_unidade = 'anos'  THEN DATE_ADD(d.emissao, INTERVAL t.prazo_valor YEAR)
         ELSE d.validade
       END AS vence_em,
       (t.prazo_origem = 'empresa_preenche' AND t.prazo_valor IS NULL) AS prazo_pendente,
       EXISTS (
         SELECT 1 FROM ausencias a
         WHERE a.funcionario_id = d.funcionario_id AND a.excluido_em IS NULL
           AND a.inicio > d.emissao
           AND t.gatilho_afastamento_dias IS NOT NULL
           AND (a.tipo = 'Afastamento – doença ou acidente'
                OR (t.gatilho_motivo = 'qualquer' AND a.tipo = 'Afastamento – outro motivo'))
           AND DATEDIFF(a.fim, a.inicio) + 1 >= t.gatilho_afastamento_dias
       ) AS invalidado_por_afastamento
FROM documentos_funcionario d
JOIN tipos_documento t ON t.id = d.tipo_documento_id
WHERE d.excluido_em IS NULL;

SET FOREIGN_KEY_CHECKS = 1;
