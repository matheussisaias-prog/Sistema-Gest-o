# Mercronos — Sistema de Gestão

Sistema de planejamento e gestão de obras e serviços de engenharia.
Publicado em https://gestao.mercurium.com.br (a Hostinger implanta sozinha a cada push no `main`).

## Estrutura

```
index.html                 só a marcação das telas
css/
  base.css                 estilos principais
  extensoes.css            pastas, Gantt avançado, calendário de equipe
  chat-flutuante.css       bolha de chat
js/                        carregados nesta ordem (a ordem importa)
  sincronizacao.js         sincronização opcional com GitHub Gist; proteção dos dados entre versões
  dados.js                 estado global e dados de exemplo
  inicio.js                inicialização, loadBase/saveBase, renderAll
  utilitarios.js           datas, escape de HTML, ids, status automático
  painel.js                dashboard: indicadores, próximas a vencer, prioridades, gráficos
  atividades.js            lista de atividades com filtros
  projetos-equipe.js       apoio de Projetos e Equipe
  cadastros.js             criar, concluir, excluir atividades e projetos
  interface.js             navegação entre telas, modais, tema, avisos
  cronograma.js            apoio de Gantt, Portfólio e Recursos
  calendarios.js           navegação dos calendários
  importar-pdf-ia.js       importação de cronograma em PDF pela IA
  assistente-ia.js         assistente de IA (chat, duplicatas, prévia)
  importar-exportar.js     importação CSV/JSON e exportação
  historico.js             histórico de alterações
  dias-uteis.js            jornada, feriados, dias e horas úteis
  extensoes.js             telas Projetos, Equipe, Gantt, Portfólio, Recursos, Kanban,
                           Calendários, Relatório PDF; funcionários e pastas
  chat-flutuante.js        bolha de chat com a IA
calendario-equipe.html     calendário de equipe avulso (versão antiga, autônoma)
calendario-taskflow.html   calendário de atividades avulso (versão antiga, autônoma)
```

## Regras

- **A cada publicação, trocar a versão** (ex.: `2026.11.14.3`) em dois lugares: no `?v=` de todos os
  `<script>`/`<link>` do `index.html` e em `APP_VERSION` (`js/sincronizacao.js`). Sem isso, o navegador
  de quem já usa o sistema continua com os arquivos antigos guardados e mistura versões.

- `load()` e `save()` são definidas em `extensoes.js` e chamam `loadBase()` / `saveBase()` de `inicio.js`.
- Uma função só pode ser chamada **no carregamento** (fora de outra função) se o arquivo dela já tiver sido carregado.
  Dentro de funções e no `DOMContentLoaded`, qualquer função de qualquer arquivo pode ser usada.
- Cada função existe em um só lugar. Não redefinir funções com `window.x = ...` por cima de outra versão.


## Servidor (Fase 1)

- `api/` — servidor em PHP. Toda chamada passa por `api/index.php`; `api/lib/` não abre pelo navegador.
- `db/schema.sql` (24 tabelas), `db/catalogo_nrs.sql` (43 documentos de NR), `db/travas.sql` (prazo da NR travado). A pasta `db/` não abre pelo navegador.
- Configuração: `tf-config-gestao.php` fica na **raiz da hospedagem** (fora de qualquer site) (modelo em `db/tf-config.exemplo.php`). Nunca colocar a senha do banco no repositório.
- Primeira instalação: `POST /api/instalar` com o `instalar_token` do `tf-config.php`; depois apagar o token.
- Testes: `testes/teste_api.py` (57 verificações de ponta a ponta) e `db/teste_banco.sh` (37 regras do banco).
- Regras: toda consulta filtra pela empresa de quem está logado; toda escrita grava no `historico` com o autor; sessões em cookie HttpOnly + SameSite=Strict; o servidor só aceita JSON.
