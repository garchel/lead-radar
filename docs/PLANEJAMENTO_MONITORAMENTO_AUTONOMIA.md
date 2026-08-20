# 🎯 Planejamento Estratégico — Monitoramento, Informação e Autonomia

**LeadRadar AI** · Documento-mestre de evolução do produto.

> Este é o plano para transformar o LeadRadar de uma ferramenta de prospecção manual em uma **plataforma de monitoramento de operação** (acompanhar jobs de criação de landing pages) **e de inteligência de prospecção** (acesso rápido a informações de potenciais clientes), com a **autonomia final do Hermes Agent** encontrando e desenvolvendo projetos por conta própria.

---

## 1. Visão Geral

```
┌────────────────────────────────────────────────────────────────────┐
│                    LeadRadar AI — Visão Alvo                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   [ UI / Dashboard ]  ──→  [ Banco Compartilhado ]  ←──  [ Hermes ] │
│   (monitora & opera)        (fonte da verdade)      (age sozinho)   │
│          │                          │                        │      │
│          ▼                          ▼                        ▼      │
│   Prospecção ──→ Análise ──→ Pitch ──→ [Job: Criação de LP] ──→     │
│                                         (rascunho→copy→design→deploy)│
└────────────────────────────────────────────────────────────────────┘
```

O pilar central é o **banco de dados compartilhado**: hoje a UI (CRM em `localStorage`) e o MCP/Hermes **não enxergam o mesmo estado**. Sem uma fonte da verdade única, o agente não tem memória e o painel não reflete a ação dele.

---

## 2. Objetivos

### 🎯 Objetivo A — Monitoramento de jobs de criação de landing page
Acompanhar e organizar o progresso de **jobs de criação de landing page**:
- Status por estágio (rascunho → copy → design → deploy → publicado).
- KPIs de operação (ativos, concluídos, falhos, taxa de sucesso, valor do pipeline).
- Atualização em **tempo real** e histórico persistido.

### 🎯 Objetivo B — Acesso a informações para achar clientes
Encontrar possíveis clientes com rapidez e dados reais:
- Empresas reais (Google Places / Google Business Profile).
- Leads enriquecidos (telefone, e-mail, site, CNPJ, redes sociais).
- Busca, filtros e visualização (grade/mapa) centralizados.

### 🎯 Objetivo C — Autonomia do Hermes Agent
Dar autonomia para o Hermes **encontrar e começar a desenvolver projetos/clientes por conta própria**:
- Ciclo autônomo: prospectar → analisar → pitchar → **criar a landing page** → atualizar CRM.
- Guardrails de aprovação humana antes de ações irreversíveis (ex.: envio ao cliente / deploy).
- Orquestração/agendamento de prospecção periódica.

---

## 3. Estado Atual (o que já existe)

Levantamento do código atual (`main`, commit `e6f5c21`):

### Backend (`server.ts`, `server/mcpServer.ts`, `server/jobs/*`)
| Camada | Arquivo | Capacidade atual |
|---|---|---|
| **Prospecção** | `POST /api/search-businesses` (`server.ts`) | Gemini Search Grounding com validação estrita; erros não retornam dados locais |
| **Análise** | `POST /api/analyze-lead` (`server.ts`) | Diagnóstico de vendas, conceito de LP, pitches (WhatsApp/Email/ligação) |
| **Fila assíncrona** | `server/jobs/queueManager.ts` + `queueRoutes.ts` | Job types `batch_prospecting`, `batch_lead_analysis`, `mcp_autopilot`; progresso, logs, cancelamento, métricas (`/api/jobs*`) |
| **MCP Server** | `server/mcpServer.ts` | Transporte SSE; tools `search_leads`, `analyze_lead`, `generate_whatsapp_pitch`, `update_crm_status`, `queue_batch_prospecting`; resources `leads://categories`, `leads://pipeline`, `leads://queue_status`; prompt `autopilot_prospecting` |

### Frontend (`src/`)
| Área | Arquivo | Capacidade atual |
|---|---|---|
| **Sidebar** | `src/components/Sidebar.tsx` | Grupos **Informação** (Busca, Dashboard, Estratégia) e **Automação** (Fila, MCP, Adicionar Lead) |
| **Busca** | `SearchHeader.tsx`, `BusinessCard.tsx`, `MapView.tsx` | Grade/mapa, filtros, exportar CSV |
| **Análise** | `LeadAnalysisModal.tsx` | Diagnóstico + conceito de LP + pitches |
| **CRM** | `CrmPipeline.tsx` | Pipeline com estágios; **persistência em `localStorage`** |
| **Automação** | `QueueDrawerModal.tsx`, `McpStatusModal.tsx` | Painel da fila (polling em `/api/jobs`), config MCP |
| **Estratégia** | `StrategyGuide.tsx` | Guia de abordagem |

### Documentos existentes
- `docs/MCP_PLANEJAMENTO.md` — arquitetura do servidor MCP (parcialmente implementada).
- `docs/HERMES_AGENT_INTEGRATION.md` — guia de conexão do Hermes (`hermes_mcp_config.json`).
- `docs/MELHORIAS.md` — melhorias priorizadas (WhatsApp 1-clique, Mini-CRM, filtro Ouro/Prata).

---

## 4. Lacunas e O que Implementar

### 4.1. Banco de dados compartilhado (CRÍTICO — destrava tudo)
**Problema:** o CRM vive em `localStorage` (só no navegador) e o `update_crm_status` do MCP **não persiste em nada** (resposta fake, em memória). UI e Hermes não compartilham estado.

**Implementar:**
- Camada de dados única (`server/store/`) com **SQLite** (via `better-sqlite3`) ou JSON, contendo:
  - `leads` (contato, dados de prospecção, enriquecimento).
  - `pipeline` (estágio, notas, histórico de interações).
  - `jobs` (fila com histórico persistente).
- **APIs REST** que sirvam tanto a UI quanto o MCP (substituir localStorage no frontend).
- **Tools MCP** (`update_crm_status`, `create_lead`) passam a gravar no banco de verdade.

### 4.2. Job de "criação de landing page" + estágios
**Problema:** o funil termina em "fechado". Não existe o objeto que você quer **monitorar**.

**Implementar:**
- Novo `JobType`: `landing_page_creation`.
- **Estágios internos** com progresso: `rascunho → copy → design → deploy → publicado`.
- Modelo `LandingPage` (HTML gerado, slug/URL de publicação, status de deploy).

### 4.3. Dashboard de monitoramento + tempo real
**Problema:** a UI **faz polling** em `/api/jobs`; não há dashboard de operação nem atualização em tempo real.

**Implementar:**
- **Dashboard de jobs** (aba/rota dedicada): KPIs (ativos, concluídos, falhos, taxa de sucesso, valor do pipeline) + timeline por job.
- **SSE** (`GET /api/events`) para empurrar mudanças de jobs/pipeline para a UI (o projeto já usa SSE no MCP).
- Nova entrada na **sidebar (grupo Automação)**: "Monitoramento" / "Dashboard de Jobs".

### 4.4. Dados reais + enriquecimento de leads
**Regra atual:** resultados sem campos obrigatórios ou sem fonte real são rejeitados; leads podem seguir para enriquecimento por APIs configuradas.

**Implementar:**
- Integração com **Google Places / Google Business Profile** usando `GOOGLE_MAPS_PLATFORM_KEY` (já detectada em `/api/health`).
- **Enriquecimento**: e-mail, site detectado, CNPJ, redes sociais, categorização automática.
- Fontes de enriquecimento (idealmente via API): Brazil CNPJ / Receita, scraping leve, APIs de e-mail.

### 4.5. Autonomia do Hermes (criar a landing page de fato)
**Problema:** o Hermes só prospecta/analisa/pitcha; **não cria nem publica** a landing page.

**Implementar:**
- **Tools MCP novas**:
  - `create_landing_page(leadId, concept, tone)` → gera HTML a partir do `landingPageConcept` e cria um job `landing_page_creation`.
  - `deploy_landing_page(landingPageId, target)` → publica (GitHub Pages / Netlify / Vercel) e retorna URL.
  - `list_landing_pages()` / `get_landing_page(id)` → para o Hermes consultar o que já existe.
  - `approve_landing_page(id)` → guardrail de aprovação humana.
- **Guardrail de aprovação**: estados `aguardando_aprovacao` antes de enviar ao cliente / publicar.
- **Orquestração/agenda**: daemon ou agendamento de prospecção periódica (cron interno).

---

## 5. Arquitetura-Alvo

```
                         ┌─────────────────────────────────────────┐
                         │           Banco Compartilhado            │
                         │   SQLite/JSON  (server/store/)           │
                         │   leads · pipeline · jobs · landing_pages│
                         └───────────────▲───────────────▲─────────┘
                                         │               │
                 ┌───────────────────────┴───┐   ┌───────┴───────────────┐
                 │        Express API       │   │        MCP Server     │
                 │  /api/search · /api/jobs │   │  (SSE) tools & resources│
                 │  /api/leads · /api/events│   │  search/analyze/pitch  │
                 └──────────────────────────┘   │  create/deploy LP      │
                          ▲                    └─────────────────────────┘
                          │                                ▲
                   ┌──────┴──────┐                     ┌───┴───┐
                   │  UI React   │                     │ Hermes │
                   │  Sidebar +  │                     │ Agent  │
                   │  Dashboard  │                     │ (auto) │
                   └─────────────┘                     └───────┘
```

**Princípio-chave:** a **UI e o Hermes leem/gravam o mesmo banco** por meio de REST + MCP. O Hermes age, o painel mostra; o painel decide, o Hermes executa.

---

## 6. Decisões-chave (a validar)

| Decisão | Opções | Recomendação inicial |
|---|---|---|
| **Persistência** | SQLite (`better-sqlite3`) vs JSON em disco | **SQLite** — consultas, concorrência e integridade para a UI + Hermes |
| **Tempo real** | SSE vs WebSocket | **SSE** — já usado no MCP, mais simples e suficiente para push de jobs |
| **Publicação de LP** | GitHub Pages vs Netlify vs Vercel | **GitHub Pages** (Git + infra gratuita) ou **Netlify Drop** via API |
| **Enriquecimento** | API externa vs scraping | **API externa** (BrasilAPI/CNPJ) — confiável e com rate limits conhecidos |
| **Autonomia** | Total vs com aprovação | **Aprovação humana em ações irreversíveis** (deploy/envio), autonomia total no resto |

---

## 7. Roadmap (ordem por dependência)

> **Status: Fases 0–4 implementadas (persistência em SQLite via `better-sqlite3`, com migração automática do JSON legado).** A orquestração periódica (Fase 2) foi implementada com agendador in-process; publicação externa depende apenas de credenciais Netlify.

### 🟢 Fase 0 — Fundação (destrava tudo) ✅
- [x] Criar camada de persistência `server/store/` (`db.ts` + `types.ts`): `leads`, `pipeline`, `jobs`, `landing_pages` em `data/db.json`.
- [x] Migrar o CRM do `localStorage` para as novas APIs REST (`/api/leads`, `/api/pipeline`) — UI usa o banco como fonte da verdade (localStorage vira cache).
- [x] Fazer o `update_crm_status` (MCP) gravar de verdade no banco (com mapeamento de status PT→EN).
- **Critério de saída atingido:** a UI e o Hermes leem/gravam o mesmo estado.

### 🟡 Fase 1 — Monitoramento de criação de landing pages ✅
- [x] Novo `JobType: landing_page_creation` com estágios (`rascunho → copy → design → deploy → publicado`).
- [x] Modelo `LandingPage` (HTML, slug, URL, status de deploy) — `server/store/types.ts` + `server/landingPage/`.
- [x] Dashboard de monitoramento: KPIs + timeline por job (`src/components/MonitoringDashboard.tsx`).
- [x] Push em tempo real via SSE (`GET /api/events`) — `server/routes/eventRoutes.ts` + `server/events/eventHub.ts`.
- [x] Entrada "Monitoramento" na sidebar (grupo Automação).
- **Critério de saída atingido:** o painel acompanha jobs de criação de LP ao vivo e persiste o histórico.

### 🟠 Fase 2 — Autonomia do Hermes (criar e publicar LP) ◐ (núcleo pronto, publicação externa pendente)
- [x] Tools MCP: `create_lead`, `list_leads`, `create_landing_page`, `list_landing_pages`, `get_landing_page`, `approve_landing_page`, `deploy_landing_page`.
- [x] Gerador de HTML de LP a partir do `landingPageConcept` (`server/landingPage/generator.ts`).
- [x] Publicador **local** (escreve HTML em `dist/landing-pages/<slug>/` e serve em `/landing-pages/:id`) com retorno de URL.
- [x] Guardrail de aprovação humana antes do deploy (`aguardando_aprovacao` → `aprovada` → `publicada`).
- [x] Orquestração/agenda de prospecção periódica — agendador in-process via `croner` (`server/scheduler/scheduler.ts`); agendamentos persistidos no SQLite, com CRUD REST `/api/schedules` e tool MCP `schedule_prospecting`; limite de **LPs/dia** (default 5) como guardrail de autonomia.
- **Critério de saída (parcial):** o Hermes encontra o lead, cria a LP e dispara o job monitorável; ações irreversíveis passam por aprovação. Falta apenas o publicador externo real configurado com credenciais (Netlify Drop já implementado, aguarda `NETLIFY_AUTH_TOKEN`).

### 🔵 Fase 3 — Informação de qualidade (dados reais) ✅
- [x] Integração Google Places / Google Business Profile (`GOOGLE_MAPS_PLATFORM_KEY`).
- [x] Enriquecimento: e-mail (Hunter.io), CNPJ (BrasilAPI), site, redes sociais — `server/enrichment/`.
- [x] Tool MCP `enrich_lead` para enriquecer um lead sob demanda.
- [x] Persistência dos dados enriquecidos no banco SQLite.
- **Critério de saída:** prospecção e monitoramento baseados em dados reais e ricos.

### 🟣 Fase 4 — Hermes Readiness (app 100% pronto para o agente autônomo) ✅ concluída
O Hermes configurará seus cronjobs **nativamente** e interagirá com o app exclusivamente via MCP. Para isso:
- [x] Dependências/MCP: tools `create_lead`, `list_leads`, `create_landing_page`, `list_landing_pages`, `get_landing_page`, `approve_landing_page`, `deploy_landing_page`, `enrich_lead`, `queue_batch_prospecting`, `get_job_status`, `send_contact`, `schedule_prospecting`, `export_dossier`.
- [x] Publicador externo real via **Netlify Drop API** — sem fallback local silencioso; ausência de credencial retorna falha explícita (`server/enrichment/netlifyDeployer.ts`).
- [x] Persistência migrada para **SQLite (`better-sqlite3`)** com migração automática do JSON legado — `server/store/`.
- [x] Autopilot real: `mcp_autopilot` executa o ciclo completo com dados **reais** (busca → salva → enriquece → analisa → LP); ausência de credenciais ou falha de integração falha o job — `server/jobs/queueManager.ts`.
- [x] Enriquecimento automático disparado no pipeline de prospecção (batch `autoEnrich` + autopilot).
- [x] Análise de IA persistida no lead (campo `analysis` no SQLite) — não se perde em timeout/reinício.
- [x] Canal de contato: `send_contact` (WhatsApp via API HTTP e e-mail via SMTP/nodemailer; sem canal configurado, registra falha em `communications` e não altera o pipeline).
- [x] Notificação de conclusão de job para o Hermes (webhook configurável `JOB_WEBHOOK_URL`).
- [x] Retry automático com backoff em jobs falhos (até 3 tentativas com backoff exponencial).
- [x] Autenticação opcional por token no endpoint MCP (`MCP_API_TOKEN`, Bearer ou `?token=`).
- **Critério de saída:** o Hermes roda o ciclo prospectar→analisar→pitchar→contatar→criar LP→publicar de ponta a ponta com as tools, com guardrail de aprovação e supervisão humana antes de ações irreversíveis.

---

## 8. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **Custo/rate limits** de APIs de dados (Places, CNPJ) | Alto | Cache no banco, rate limiting e falha explícita sem dados sintéticos |
| **Publicação de LP de terceiros** (erros legais/visuais) | Alto | Guardrail de aprovação humana obrigatório antes do deploy |
| **Concorrência UI × Hermes** no mesmo dado | Médio | SQLite com transações + carimbo de tempo (`updatedAt`) |
| **Hermes rodando sem supervisão** | Médio | Modo autônomo com limites (ex.: máx. de LPs/dia) e logs auditáveis |
| **Dependência de chaves/credenciais** | Médio | `.env` documentado, health check por integração |

---

## 9. Métricas de Sucesso

- **Monitoramento:** % de jobs de criação de LP com progresso rastreado; tempo médio de um job até `publicado`; taxa de sucesso de deploy.
- **Informação:** nº de leads reais enriquecidos; taxa de rejeição de respostas incompletas; leads com e-mail/CNPJ completos.
- **Autonomia:** nº de LPs criadas/publicadas pelo Hermes por semana; conversão de pipeline (contatado → fechado); tempo de prospecção→deploy.

---

## 10. Próximos Passos Imediatos

1. **Publicador externo real com credenciais** — configurar `NETLIFY_AUTH_TOKEN` (e opcionalmente `NETLIFY_SITE_ID`) para o deploy externo de LPs via Netlify Drop.
2. **Configurar canais de contato** — `WHATSAPP_API_URL`/token, `SMTP_HOST` e `SMTP_FROM`; sem essas configurações o envio falha de forma explícita.
3. **Monitorar o agendador em produção** — validar limites (`LEADRADAR_MAX_LPS_PER_DAY`) e revisar os Jobs `[Agendado]` no dashboard.
4. Criar os **issues/tarefas** restantes do roadmap e estimar esforço.

---

*Plano-mestre do LeadRadar AI: do monitoramento à autonomia do Hermes Agent.* 🚀



