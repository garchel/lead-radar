# LeadRadar — Backlog V3

Melhorias propostas em agosto/2026, após entrega de: cache SerpAPI 7 dias, rotação
round-robin de cidades (base IBGE), tier de mercado por PIB per capita, categorias
de negócio configuráveis, ticket sugerido e scoring combinado.

Status: ☐ pendente · 🔄 em andamento · ✅ feito

---

## 🎯 Eixo 1 — Fechar o ciclo até a venda

### 1.1 Ticket no pitch da IA ✅
Injetar `marketTier` + `suggestedTicket` no prompt do `analyzeLead`
(`server/services/prospectingService.ts`) para a IA gerar pitches com valor
coerente com a cidade (ex.: "investimento de R$ 4.500" em cidade tier A).
- **Esforço:** baixo
- **Aceite:** análise de um lead em cidade tier A menciona ticket maior que a mesma categoria em tier D.
- **Feito em:** commit "Backlog V3 parte 1" — resolve tier/ticket de cidade+UF
  quando não informado, injeta como âncora (±15%) e a rota `/api/analyze-lead`
  aceita `state`, `suggestedTicket` e `marketTier`.

### 1.2 Painel de categorias na UI ✅
Tela para CRUD das categorias (`GET/POST /api/categories`, `PUT /api/categories/:id`):
lista com propensão e ticket base, edição inline ou sliders, criar/desativar.
- **Esforço:** médio
- **Aceite:** alterar propensão/ticket pela UI reflete nas próximas buscas e tickets sugeridos.
- **Feito em:** aba "Categorias" (`CategoriesDashboard.tsx`) — sliders de
  propensão, ticket base editável, criar/desativar, dirty-state por linha.

### 2.4 MCP tools para Hermes ✅
Expor tools MCP: `get_next_cities`, `search_city`, `pipeline_status`.
- **Feito em:** `server/mcpServer.ts` — `get_next_cities` (com filtro minTier),
  `search_city` (leads rankeados por score com ticket e flag CRM),
  `pipeline_status`.

### 1.3 Follow-up automático por lead frio ✅
Reconectar leads `contacted` sem resposta há N+ dias.
- **Feito em:** `getColdLeads()` em db.ts + job type `cold_leads_review` no
  queueManager (agenda interação de recontato pendente — nada é enviado sem
  aprovação humana) + tool MCP `cold_leads`.
- **Config:** payload do job aceita `minDays` (default 14) e `limit`.

---

## 🧠 Eixo 2 — Inteligência com dados próprios

### 2.1 Feedback loop real ☐
Registrar conversão (lead → projeto fechado) por cidade × categoria × ticket.
Após ~30 vendas, recalcular multiplicadores de tier e propensões a partir dos
dados reais em vez dos seeds heurísticos.
- **Esforço:** alto
- **Pré-requisito:** volume de vendas no CRM.

### 2.2 Re-busca inteligente ✅
Cache de busca ignorado quando a última busca real tem mais de X dias.
- **Feito em:** `serpApi.ts` — env `RESEARCH_STALE_DAYS` (default 60; 0 desativa).
  Cache obsoleto é removido e a busca roda fresco (consome cota, intencional).

### 2.3 Detecção de saturação ✅
Contagem de concorrentes da cidade injetada no prompt do analyzeLead:
- ≥10 concorrentes: "mercado SATURADO — seja o ÚNICO com site"
- 4–9: diferenciação nos resultados locais
- <4: "seja o primeiro a dominar as buscas locais"
**Feito em:** `getCompetitorCount()` em prospectingService.ts.

### 2.4 MCP tools para Hermes ✅
(ver item no Eixo 1 — implementado junto com `cold_leads`)

---

## 🟢 Higiene técnica

### 4.1 `.env.example` desatualizado ✅
Parâmetros da rotação e `RESEARCH_STALE_DAYS` documentados (commit "Backlog V3 parte 1/2").

### 4.2 Docs V2 desatualizados ☐
`docs/V2-FEATURES.md` não cobre rotação de cidades, tiers, categorias,
ticket sugerido nem scoring combinado.

### 4.3 Teste E2E da rotação agendada ✅
Simula 3 disparos seguidos: payload do agendador → pickNextCities → zero
repetição até esgotar o pool → fila circular reinicia.
**Feito em:** `tests/rotationE2E.test.ts`.

### 4.4 Performance do match cidade×lead ✅
Índice em memória por UF carregado uma vez por processo.
**Feito em:** `prospectingService.ts` (`allCitiesByUfCache`).

---

## Ordem de execução sugerida

1. 1.1 Ticket no pitch da IA (impacto direto, esforço baixo)
2. 4.1 + 4.2 higiene rápida junto
3. 1.2 Painel de categorias
4. 2.4 MCP tools
5. Demais conforme necessidade
