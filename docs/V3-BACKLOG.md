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

### 1.3 Follow-up automático por lead frio ☐
Reconectar leads `contacted` sem resposta há N dias; opcionalmente re-enfileirar
cidades onde houve respostas recentes.
- **Esforço:** médio
- **Depende:** definição de N e canal (WhatsApp/e-mail) — confirmar com usuário.

---

## 🧠 Eixo 2 — Inteligência com dados próprios

### 2.1 Feedback loop real ☐
Registrar conversão (lead → projeto fechado) por cidade × categoria × ticket.
Após ~30 vendas, recalcular multiplicadores de tier e propensões a partir dos
dados reais em vez dos seeds heurísticos.
- **Esforço:** alto
- **Pré-requisito:** volume de vendas no CRM.

### 2.2 Re-busca inteligente ☐
Cidade volta à fila quando `ultima_busca > X dias` (configurável) mesmo com cache;
hoje o cache fixo de 7 dias cobre repetição manual, mas não refresh periódico.
- **Esforço:** baixo/médio
- **Aceite:** `pickNextCities` prioriza cidades vencidas antes das nunca buscadas? (definir regra)

### 2.3 Detecção de saturação ☐
Contagem de concorrentes retornados por busca → enriquecer `analyzeLead`:
mercado cheio ("seja o único com site") vs. mercado vazio ("seja o primeiro").
- **Esforço:** médio
- **Nota:** contagem já disponível em `serpapi_raw.local_results.length`.

### 2.4 MCP tools para Hermes ☐
Expor tools MCP: `get_next_cities`, `search_city(location/category)`,
`pipeline_status` — permite operar a prospecção conversando com o Hermes.
- **Esforço:** médio
- **Arquivo:** `server/mcpServer.ts`.

---

## 🟢 Higiene técnica

### 4.1 `.env.example` desatualizado ☐
Documentar parâmetros novos do batch: `useCityRotation`, `citiesPerRun`,
`uf`, `minPopulation`, `maxPopulation`, `minPropensity`.

### 4.2 Docs V2 desatualizados ☐
`docs/V2-FEATURES.md` não cobre rotação de cidades, tiers, categorias,
ticket sugerido nem scoring combinado.

### 4.3 Teste E2E da rotação agendada ☐
Simular 3 disparos seguidos de `buildScheduleJobInput` + worker e verificar
que as cidades rotacionam sem repetição.

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
