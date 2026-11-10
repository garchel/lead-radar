# Análise de páginas e componentes (auditoria de IA — nov/2026)

> **Status: IMPLEMENTADO.** O diagnóstico abaixo é o registro do que foi encontrado;
> a reorganização foi aplicada. Estrutura atual:

```
CAPTURAR      Busca de Região · Fila de Cidades · Categorias
DADOS         Banco de Dados · Resultado da Busca
CONVERTER     Dashboard de Leads · Follow-ups
ENTREGAR      Projetos · Agentes
INTELIGÊNCIA  Estratégia & Pitch · Crescimento
OPERAÇÃO      Fila & Agendamentos · Automação · Canais & APIs
```

O que mudou de fato:

| Antes | Depois |
|---|---|
| `QueueDrawerModal` listava os mesmos jobs do Monitoramento | removido; "Nova tarefa em lote" virou `BatchJobForm` dentro de **Fila & Agendamentos** |
| 3 portas para disparar lote (Busca síncrona, modal, Agendamentos) | Busca = "ver agora nesta cidade"; lote/recorrente só em **Fila & Agendamentos**, rotação IBGE como padrão |
| Cadência D+3/D+7 no Crescimento enviando mensagem | nova aba **Follow-ups**: `FollowUpQueue` (recontato autorizado) + cadência, com o relógio de cada uma explícito |
| Chaves SerpAPI no `SearchHeader`; WhatsApp no CRM; MCP solto | nova aba **Canais & APIs** (chaves + uso, conexão WhatsApp, status MCP) |
| Agendador global em Automação | controle em **Fila & Agendamentos**, junto dos agendamentos que ele liga |
| "Empresas Encontradas" (só a última busca) | renomeada **Resultado da Busca**, apontando o histórico no Banco de Dados |
| Banco de Dados sem ponte com o funil | botão "Abrir o funil" e "abrir no funil" por lead; CRM aponta para o inventário |
| Protótipo de LP embutido no modal de análise | abre em **`LandingPrototypeModal`** (tela cheia) |
| `NextActionsBar` em todas as abas | escondida em Automação, Canais, Banco, Fila de Cidades, Categorias, Estratégia e Fila |

---

# Diagnóstico original (histórico)

Levantamento feito só por leitura de código: cada aba, o que ela renderiza, de onde vêm os dados e se o componente faz sentido naquele lugar. Nada foi alterado.

## Mapa atual

| Aba (`activeTab`) | Componentes que renderiza | Dados | Veredicto |
|---|---|---|---|
| **Busca de Região** (`search`) | `SearchHeader` (cidade/categoria, modo cidade×rotação, provedor, uso de cota) + banner de resultado + filtro Ouro/Prata/Bronze + `BusinessCard`/`MapView` + botão **Gerenciar chaves SerpAPI** (`SerpApiKeyManager`) | `/api/search-businesses` (síncrono), `/api/prospecting/usage`, `/api/serpapi/keys` | Operação + **infraestrutura** misturadas |
| **Fila de Cidades** (`cities`) | `CitiesQueueDashboard` (rotação IBGE, tier, população, ativa/inativa) | `/api/cities`, `/api/cities/stats` | Coerente (é insumo da coleta) |
| **Categorias** (`categories`) | `CategoriesDashboard` (propensão + ticket base, CRUD) | `/api/categories` | Coerente |
| **Empresas Encontradas** (`companies`) | `SerpApiResultsPage` (tabela/cards/raw) + `SerpApiRawViewer` | props do `App` = **última busca em memória**, `/api/serpapi/last-search` | Nome sugere histórico; entrega só a última rodada |
| **Banco de Dados** (`database`) | `DatabaseDashboard` (KPIs, distribuições, filtros, lista paginada) | `/api/database/*` (tabela `leads` inteira) | Novo; sobreposição conceitual com o funil |
| **Dashboard de Leads** (`crm`) | `WhatsappSettingsCard` + `FollowUpQueue` + `CrmPipeline` (kanban, registrar resposta, notas, análise) | `/api/leads`, `/api/follow-ups/due`, `/api/whatsapp/status` | **3 assuntos** na mesma página |
| **Estratégia & Pitch** (`guide`) | `StrategyGuide` (método 4 etapas + simulador de ROI) | local | Coerente |
| **Crescimento** (`growth`) | `GrowthPage`: funil 30d, ganchos por dor, entrega/ACK, top oportunidades, **cadência D+3/D+7 com Simular/Executar** | `/api/metrics/outbound`, `/api/cadence/plan`, `/api/cadence/run` | Página de leitura que **dispara envio** |
| **Projetos** (`projects`) | `ProjectsDashboard` + `ProjectModal` (tarefas, briefing Typeform, `ProjectAssetsPanel`) | `/api/projects/*` | Coerente (mas o `ProjectModal` tem 1.337 linhas) |
| **Agentes** (`agents`) | `AgentsDashboard` (runbook, prompt de spawn por projeto) | `/api/projects` | Coerente |
| **Automação** (`automation`) | `AutomationSettingsPage`: autopilot+orçamento SerpAPI, humanização WhatsApp, agendador global, backup, polling Typeform, intenção por IA | `/api/autopilot/*`, `/api/automation/settings`, `/api/whatsapp/humanize` | Config OK; **controla coisas que moram em outra tela** |
| **Monitoramento** (`monitoring`) | `MonitoringDashboard` = "Jobs na Fila" + **`ScheduleManager`** (CRUD de agendamentos) | `/api/jobs`, `/api/schedules` | Nome não cobre o conteúdo |
| **Fila Assíncrona** (modal global) | `QueueDrawerModal`: lista de jobs + **formulário de prospecção em lote** | `/api/jobs`, `/api/jobs/completed` | **Duplica** Monitoramento e a Busca |
| **MCP Server** (modal) | `McpStatusModal`: status, config, tools | `/api/mcp/info` | OK como modal |
| Global (todas as abas) | `NextActionsBar` (chips de pendência), toasts de job/inbound, alerta de erro | `/api/action-items`, `/api/outbox` | OK, mas polui telas de configuração |

## Problemas encontrados (por severidade)

### P1 — A fila de jobs existe em dois lugares
`MonitoringDashboard` e `QueueDrawerModal` listam a **mesma** `/api/jobs` (o modal ainda puxa `/api/jobs/completed`). O usuário pode olhar um e achar que o outro está desatualizado.
**Recomendação:** uma única superfície "Fila & Agendamentos"; o modal vira só "nova tarefa em lote" (ou morre, absorvido pelo formulário da Busca).

### P1 — Três portas para disparar prospecção, sem indicação de qual usar
1. **Busca de Região** → `/api/search-businesses` **síncrono** (bloqueia a tela, gasta cota na hora);
2. **Fila Assíncrona** → job `batch_prospecting` (cidades digitadas à mão);
3. **Monitoramento → Agendamentos** → job `batch_prospecting` com rotação IBGE e recorrência.

Mesmo resultado (leads salvos), comportamentos diferentes.
**Recomendação:** a Busca fica para "quero ver agora nesta cidade" (síncrono, resultado na tela); tudo que é lote/recorrente sai daqui e vive em **Fila & Agendamentos**, com um formulário único que já traz a rotação de cidades como padrão.

### P1 — Envio de mensagem em página de leitura, com dois modelos de recontato
- `FollowUpQueue` (dentro do **CRM**) manda D+ pela `interaction.next_contact_at`;
- a **cadência** D+3/D+7 (`GrowthPage` → `/api/cadence/run`) decide por `lead.last_contact_at` + `lead.next_contact_at`.

São dois relógios para a mesma tarefa. A cadência tem guardas (pula quem respondeu, pula `nextContactAt` futuro), então não achei caminho óbvio de mensagem dupla — mas o usuário vê **duas listas de "quem eu devo procurar hoje"** e pode agir nas duas.
**Recomendação:** uma casa só, "Follow-ups", com os dois modos explicitados (recontato autorizado × cadência automática) e uma coluna única "próximo contato". Nada de enviar a partir de uma página de gráfico.

### P2 — Infraestrutura no meio da operação
- **Chaves SerpAPI** abrem de dentro do `SearchHeader` (a Busca) e a **cota** aparece em dois lugares (Busca e Automação);
- **Conexão WhatsApp** fica no topo do CRM;
- **MCP** é modal separado do resto do config.

**Recomendação:** nova aba **"Canais & APIs"** em *Automação & Dados*: chaves SerpAPI (+ dia de renovação + uso), quota do autopilot, conexão WhatsApp (provider, health, humanização), MCP. A Busca mantém só um link "configurar provedor" quando faltar chave.

### P2 — "Empresas Encontradas" entrega menos do que o nome promete
A página só mostra o que está na memória do `App` (última busca). Fechou o navegador, sumiu. E o valor exclusivo dela é o **Raw SerpAPI** (diagnóstico).
**Recomendação:** renomear para "Resultado da última busca" e mover o Raw para o diagnóstico; ou eliminar a aba e colocar o resultado da rodada como filtro no **Banco de Dados** (`entrada: hoje` já cobre isso).

### P2 — Banco de Dados × Dashboard de Leads
Ambos listam os mesmos `leads`. A diferença é o propósito (inventário/qualidade × funil/ação), mas a tela não diz isso.
**Recomendação:** manter as duas, com texto explícito e link cruzado: Banco = "o que existe"; Dashboard = "o que fazer". No Banco, botão "abrir no funil" por lead.

### P3 — Automação controla o que mora em outra tela
"Agendador global" (Automação) liga/desliga os agendamentos que só aparecem em Monitoramento; o polling do Typeform alimenta briefings que só aparecem em Projetos; backup não tem tela de backups.
**Recomendação:** cada toggle mora na tela que ele afeta (ou um "ver onde isso aparece" ao lado).

### P3 — `LeadAnalysisModal` embute um protótipo interativo
O modal de diagnóstico carrega `LandingPagePrototype` (desktop/mobile + envio de mensagem). São dois produtos num modal de 544 linhas.
**Recomendação:** protótipo vira aba/seção de Projetos (ou rota própria); o modal fica com diagnóstico + scripts.

### P3 — `NextActionsBar` em todas as telas
Aparece acima de tudo, inclusive em Automação e no Banco. **Recomendação:** esconder em telas de configuração/inspeção.

## Estrutura proposta (se ele aprovar)

```
CAPTURAR            Busca de Região · Fila de Cidades · Categorias
DADOS               Banco de Dados  (+ resultado da última busca como filtro)
CONVERTER           Dashboard de Leads (funil) · Follow-ups (recontato + cadência)
ENTREGAR            Projetos · Agentes
INTELIGÊNCIA        Estratégia & Pitch · Crescimento (só métricas e ganchos)
OPERAÇÃO            Fila & Agendamentos (jobs + schedules + nova tarefa)
                    Automação (toggles: autopilot, humanização, IA de intenção, backup)
                    Canais & APIs (SerpAPI, WhatsApp, MCP)
```

## O que eu NÃO mexeria

- `CitiesQueueDashboard`, `CategoriesDashboard`, `DatabaseDashboard`, `ProjectsDashboard`, `AgentsDashboard`, `StrategyGuide`: estão no lugar.
- Os modais `AddLeadModal`, `DuplicateMergeModal`, `McpStatusModal`, `ProjectTypeSelectModal`, `LeaveDevelopmentModal`: escopo certo.
- A separação `Capturar → Converter → Entregar` do menu está correta; o problema é dentro das abas, não na espinha.

## Ordem sugerida de execução

1. **Consolidar fila + agendamentos** (mata o modal duplicado, unifica o disparo de lote) — médio.
2. **Follow-ups numa casa só** (FollowUpQueue + cadência) — médio, e é o que evita contato duplicado.
3. **Canais & APIs** (tira infra da Busca e do CRM) — pequeno.
4. **Renomear/enxugar "Empresas Encontradas"** — pequeno.
5. Polimentos P3 (NextActionsBar condicional, protótipo fora do modal, toggles junto do efeito) — pequeno cada.
