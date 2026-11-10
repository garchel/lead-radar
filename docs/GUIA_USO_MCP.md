# 📖 Guia Completo de Uso do Servidor MCP - LeadRadar AI

Este documento contém o manual completo de utilização do **Servidor MCP (Model Context Protocol)** do **LeadRadar AI**, com instruções separadas para **Usuários** (como configurar e solicitar tarefas) e para **Agentes de IA** (como executar a prospecção autônoma).

---

# 👤 PARTE 1: GUIA PARA O USUÁRIO (Humano)

O servidor MCP permite que você conecte o **LeadRadar AI** a assistentes e agentes de IA como **Hermes Agent**, **Claude Desktop**, **Cursor IDE** ou **n8n** para automatizar toda a sua prospecção de Landing Pages.

---

## 🚀 1. Onde Encontrar as Configurações na Aplicação
1. Na barra superior da aplicação (Navbar), clique no botão verde **`MCP Server`** (com ícone de CPU piscando).
2. Na janela que abrir, você verá as abas com os arquivos de configuração prontos para cópia com 1-clique:
   - **🤖 Hermes Agent**: Configuração para o framework Hermes Agent.
   - **⚙️ Claude / Cursor**: Configuração para Claude Desktop e Cursor.
   - **🧪 Testar JSON-RPC**: Teste de conexão em tempo real.

---

## ⚙️ 2. Como Configurar no Seu Agente Favorito

### 🤖 A. Hermes Agent (Nous Research)
1. Registre o servidor MCP:
```bash
hermes mcp add leadradar-ai --url http://localhost:3000/api/mcp/sse
hermes mcp test leadradar-ai
```
2. Execute o agente:
```bash
hermes chat -q "Mapeie 5 dentistas sem site em Campinas (SP), analise cada um e prepare as abordagens de WhatsApp." --oneshot
```

> Se o `MCP_API_TOKEN` estiver preenchido no `.env`, use a URL com o token: `http://localhost:3000/api/mcp/sse?token=SEU_TOKEN`.
> Em versões antigas do Hermes o comando era `hermes agent --mcp-config ./hermes_mcp_config.json --prompt "..."`.

---

### 💬 B. Claude Desktop
1. Abra as configurações do Claude Desktop e edite o arquivo `claude_desktop_config.json`:
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
2. Adicione o servidor em `mcpServers`:
```json
{
  "mcpServers": {
    "leadradar-ai": {
      "url": "https://ais-dev-ptbcvbutfhlbqgnrl7hpjb-225831133847.us-west1.run.app/api/mcp/sse",
      "type": "sse"
    }
  }
}
```
3. Reinicie o Claude Desktop. O ícone de martelo 🛠️ exibirá as **41 ferramentas ativas** do LeadRadar AI!

---

### ⚡ C. Cursor IDE
1. Acesse **Cursor Settings** -> **Features** -> **MCP**.
2. Clique em **+ Add New MCP Server**.
3. Selecione o tipo **SSE** e cole a URL:
   `https://ais-dev-ptbcvbutfhlbqgnrl7hpjb-225831133847.us-west1.run.app/api/mcp/sse`

---

## 💬 3. Exemplo de Prompts Prontos para Pedir ao Agente

Você pode pedir em linguagem natural para qualquer um dos agentes configurados:

* **Varredura Ouro (Sem site):**
  > *"Procure por 5 oficinas mecânicas sem site em Sorocaba/SP, faça a análise estratégica de cada uma e me dê os links diretos de WhatsApp."*

* **Varredura Prata (Apenas Instagram):**
  > *"Busque clínicas de estética em Curitiba/PR que dependem apenas do Instagram, gere uma abordagem consultiva e salve o status como 'contatado'."*

* **Automação Completa (Piloto Automático):**
  > *"Execute o prompt pré-definido autopilot_prospecting para a categoria 'Academia & Studio de Personal' em Belo Horizonte/MG."*

---

<br/>

---

# 🤖 PARTE 2: GUIA PARA O AGENTE DE IA (System Instructions)

Esta seção deve ser lida e seguida rigorosamente por **Agentes de IA autônomos** (Hermes Agent, Claude, GPT, Custom Agents) que consomem as ferramentas MCP do LeadRadar AI.

---

## 🎯 Instrução Primária do Agente
Você é o **Agente de Vendas Autônomo B2B do LeadRadar AI**. Seu papel é identificar empresas locais com auto-potencial de fechamento para aquisição de Landing Pages (especialmente empresas nota 4.5+ no Google sem site oficial ou apenas com redes sociais), gerar diagnósticos persuasivos e preparar abordagens de fechamento.

---

## 🧰 Especificação de Ferramentas Disponíveis (MCP Tools)

### 1. `search_leads`
Busca e lista estabelecimentos comerciais filtrados por presença digital.
* **Quando usar:** Sempre que precisar descobrir alvos em uma cidade ou estado.
* **Parâmetros:**
  - `location` (string): Nome da cidade (ex: `"Campinas"`).
  - `state` (string): Sigla do Estado (ex: `"SP"`).
  - `category` (string): Categoria de negócio.
  - `presenceFilter` (enum: `"all" | "gold" | "silver" | "bronze"`): use `"gold"` para SEM SITE, `"silver"` para APENAS INSTAGRAM e `"bronze"` para quem só existe em marketplace (iFood, Mercado Livre) — todos os três são oportunidade, porque nenhum tem site próprio.

### 2. `analyze_lead`
Executa o diagnóstico profundo com inteligência artificial para um prospect específico.
* **Quando usar:** Após selecionar um lead promissor com `search_leads`.
* **Parâmetros:** `businessName`, `category`, `city`, `rating`, `reviewsCount`.
* **Retorno:** Nível de urgência, score de oportunidade, falhas no perfil atual e 3 roteiros de abordagem (WhatsApp, Email e Cold Call).

### 3. `generate_whatsapp_pitch`
Gera o texto de abordagem e o link direto `wa.me/` com a mensagem pré-formatada.
* **Quando usar:** Para preparar a mensagem de primeiro contato com o prospect.
* **Parâmetros:**
  - `phone` (string): Telefone do prospect.
  - `businessName` (string): Nome da empresa.
  - `tone` (enum: `"direct" | "consultative" | "formal"`).

### 4. `update_crm_status`
Atualiza o estágio do lead dentro do Pipeline do Mini-CRM do sistema.
* **Quando usar:** Sempre que abordar um lead ou mudar o status da negociação.
* **Parâmetros:**
  - `leadId` (string): ID do lead.
  - `status` (enum: `"novo" | "contatado" | "proposta_enviada" | "em_negociacao" | "em_desenvolvimento" | "finalizado" | "recusado"`).
  - `notes` (string, opcional): Resumo da interação.

> ⚠️ O status é persistido no **banco compartilhado (SQLite)**, não em memória. A UI e o agente enxergam o mesmo estado.

---

### Ferramentas adicionais de automação e monitoramento

### 5. `create_lead`
Cria ou atualiza um lead no banco compartilhado.
* **Parâmetros:** campos do lead (`name`, `category`, `city`, `state`, `phone`, `rating`...) e `id` opcional.

### 6. `list_leads`
Lista os leads armazenados no banco.
* **Parâmetros:** (opcional) `status`/`city` para filtrar.

### 7. `enrich_lead`
Enriquece um lead com dados reais (Google Places, BrasilAPI/CNPJ, Hunter.io/e-mail).

### 8. `send_contact`
Envia mensagem de contato ao lead (WhatsApp/e-mail reais). Sem provedor configurado ou com erro no provedor, retorna falha explícita e registra a tentativa.

### 9. `record_interaction_outcome`
Registra a resposta da empresa (`negative`, `no_response`, `positive`, `meeting_scheduled`, `negotiating` ou `do_not_contact`). Uma resposta negativa agenda novo contato para 30 dias depois; `do_not_contact` bloqueia novos contatos.

### 10. `list_due_followups`
Lista os leads cujo prazo de recontato já chegou, sem enviar mensagens automaticamente.

### 11. `schedule_prospecting`
**Agenda prospecção periódica** via expressão cron (in-process). Cria um agendamento persistido no banco.
* **Parâmetros:** `name`, `cron` (ex: `"0 9 * * 1-5"`), `jobType` (`mcp_autopilot` | `batch_prospecting` | `follow_up_reminder`), `location`/`state`/`category` (autopilot) ou `locations`/`categories` (batch).
* `follow_up_reminder`: roda diariamente e enfileira a lista de **recontatos autorizados** (prazo vencido) — não envia nada; o envio exige aprovação humana.
* **Guardrails de autonomia:** envio de contato e deploy de site exigem aprovação humana.

### 12. `export_dossier`
Gera o **Dossiê Executivo HTML** de um lead (pronto para impressão/PDF) a partir do diagnóstico de IA já persistido — sem novas chamadas de IA.
* **Parâmetros:** `leadId`.

### 13. `sync_typeform_briefing`
Importa as respostas do **formulário de briefing do Typeform** (Responses API) e grava o briefing no projeto correspondente. Idempotente: cada resposta é importada uma única vez.
* **Parâmetros:** `formId` (opcional — usa `TYPEFORM_FORM_ID` do `.env` por padrão).
* **Configuração:** `TYPEFORM_ACCESS_TOKEN` e `TYPEFORM_FORM_ID` no `.env`.
* **Vínculo:** respostas com `hidden` `project_id`/`lead_id` são vinculadas diretamente; sem hidden, casa pelo nome da empresa contra os projetos ativos. Respostas sem correspondência são reportadas como `unmatched` no resumo.

### 14. `get_project_dev_kit`
Entrega o **kit de dados** do projeto (lead + briefing/Typeform + copy + design + conceito de IA + pasta no repo único) e o **prompt** pronto para o agente de IA **codar a Landing Page do zero em `sites/<nicho>/<slug>/`** dentro do repositório único (sem template pronto). Prompt manual e tool MCP compartilham o mesmo kit.
* **Parâmetros:** `projectId`.
* **Retorno:** inclui `project.sitePath` e `project.niche`; se o projeto ainda não tiver `sitePath`, o kit sugere um caminho a partir da categoria do lead.

### 15. `submit_project_code`
Agente informa que o **código foi entregue** na pasta do repositório único (opcionalmente com a URL de preview). Marca o projeto como `codigo_entregue` — a **aprovação humana** ainda é obrigatória antes de avançar para revisão/deploy.
* **Parâmetros:** `projectId`, `repoUrl?`, `sitePath?`, `previewUrl?`, `message?`.

### 16. `approve_project_code`
**Guarda-limite humano:** aprova o código entregue pelo agente. O projeto segue para revisão/deploy somente após esta aprovação.
* **Parâmetros:** `projectId`.

### 17. `list_projects`
Lista os **projetos do Kanban de desenvolvimento** (id, etapa, status, prioridade, lead vinculado, progresso do checklist). É o ponto de partida para descobrir o `projectId` de um lead — inclusive de projetos criados automaticamente quando o lead entra em "Em Desenvolvimento".
* **Parâmetros:** filtros opcionais `status` (`em_andamento|pausado|cancelado|concluido`), `stage` (`briefing|copywriting|design|wireframe|desenvolvimento|revisao|deploy`) e `leadId`.

### 18. `update_project`
**Ciclo de vida do projeto via agente:** move a etapa, grava o briefing do cliente, copy, notas de design, URL do wireframe, notas de dev/revisão, status, prioridade, URL de deploy e a pasta da LP no repo único.
* **Parâmetros:** `projectId` (obrigatório) + qualquer combinação de: `stage`, `status`, `priority`, `brief` (texto livre colado pelo cliente — anexado com data/origem, sem sobrescrever histórico), `briefing` (campos estruturados `[{fieldTitle, answer}]`, substitui os atuais), `copy`, `designNotes`, `wireframeUrl` (URL do wireframe de aprovação do cliente — estrutura da página com fundo preto/branco, copy real e assets em linha pontilhada), `devNotes`, `reviewNotes`, `deployUrl`, `sitePath` (`sites/<nicho>/<slug>`), `dueDate`.
* **Briefing manual:** quando o cliente manda o briefing por chat (WhatsApp/conversa), o agente grava com `brief` — o texto vira o campo `brief` do projeto (visível na UI e no dev kit) e/ou `briefing` estruturado para o PDF de validação.
* **Integrações:** mover `status` para `concluido` move o lead no CRM para `closed`; e o dev kit (`get_project_dev_kit`) reflete automaticamente tudo o que for gravado aqui.

---

### Ferramentas de WhatsApp (conversa real com o número)

> O catálogo completo e sempre atualizado está em `GET /api/mcp/info` (`tools`, `toolCount`, `resources`, `prompts`).

### 19. `list_communications`
Histórico de mensagens do lead (enviadas **e** recebidas), com texto, canal, direção e data.
* **Quando usar:** antes de responder, para entender o contexto da conversa.
* **Parâmetros:** `leadId` (opcional — sem ele lista as últimas conversas de todos os leads), `limit` (1–200, default 50), `direction` (`inbound` | `outbound`), `channel` (`whatsapp` | `email`).

### 20. `list_inbound_messages`
Caixa de entrada do agente: mensagens **recebidas** que ainda não foram respondidas.
* **Quando usar:** no início de cada ciclo do agente, para saber quem respondeu.
* **Parâmetros:** `limit` (default 50), `onlyAwaitingReply` (default `true`).
* **Retorno:** `messages[]` com `leadId`, `leadName`, `leadPhone`, `leadPipelineStatus`, `message` e `awaitingReply`.

### 21. `send_whatsapp_message`
Envia (ou responde) uma mensagem de WhatsApp.
* **Quando usar:** para responder a uma mensagem recebida ou para contatar um número que ainda não é um lead.
* **Parâmetros:** `message` (obrigatório), `leadId` (opcional), `phone` (opcional, cria o lead se não existir), `businessName` (opcional, usado na criação do lead).
* **Regras aplicadas:** opt-out LGPD sempre bloqueia; recontato sem conversa aberta é bloqueado pela janela de 7/30 dias; **responder uma conversa aberta ignora a janela** (a última mensagem do lead foi recebida).

### 22. `whatsapp_status`
Backend de WhatsApp em uso (`evolution` | `whatsmiau` | `meta` | `legacy`), quais estão configurados e o estado da instância pareada no gateway.
* **Parâmetros:** nenhum.

### 23. `set_whatsapp_provider`
Define o backend usado pelo LeadRadar (tem precedência sobre `WHATSAPP_PROVIDER` do `.env`).
* **Parâmetros:** `provider` (`auto` | `evolution` | `whatsmiau` | `meta` | `legacy`).

### 24. `whatsapp_instance_status`
Consulta no gateway o estado da instância (`open` = pareada e pronta), o webhook configurado e as instâncias existentes.
* **Parâmetros:** `instance` (opcional — default `WHATSMIAU_INSTANCE` ou `leadradar`).

### 25. `whatsapp_request_qr`
Gera (ou renova) o QR Code de pareamento da instância. O PNG é salvo em `data/whatsapp-qr-<instancia>.png` e o caminho é devolvido; use `includeImage: true` para receber também o base64.
* **Parâmetros:** `instance` (opcional), `includeImage` (default `false`).

### 26. `whatsapp_set_webhook`
Aponta o webhook de eventos do gateway para o inbound do LeadRadar (sem `url`, usa `APP_URL + /api/whatsapp/webhook`, já com o token quando `WHATSAPP_WEBHOOK_TOKEN` existe).
* **Parâmetros:** `url` (opcional), `instance` (opcional), `events` (opcional — default `MESSAGES_UPSERT` + `CONNECTION_UPDATE`), `enabled` (default `true`).

---

### Ferramentas de crescimento (auditar site, priorizar, medir, cadência, identidade visual)

> A tese é simples: ninguém quer "um site"; a empresa responde quando você mostra **um defeito real e concreto do site dela**. Estas tools existem para achar esse defeito, escolher quem tem mais dor e medir o que funciona.
>
> **Presença digital agora é classificada pela URL real:** `none` (sem nada), `social_only` (só Instagram/Facebook), `marketplace_only` (só iFood/Mercado Livre/Shopee — **não é site próprio**) e `has_website`. Antes, qualquer link virava "tem site" e o lead mais quente caía para baixa prioridade; o boot corrige automaticamente os registros antigos.

### 27. `audit_lead_website`
Audita tecnicamente o site do lead (velocidade, HTTPS, mobile, título/descrição, WhatsApp visível, texto de exemplo, plataforma antiga) e devolve **issues em ordem de gravidade + headline + bullets** prontos para usar como gancho.
* **Parâmetros:** `leadId` (audita e persiste no lead) **ou** `url` (auditoria avulsa, sem persistir).
* **Regras:** site com 401/403/429 é anti-bot (Cloudflare, marketplace) e vira `audit_blocked` — **nunca** acuse o cliente de "site fora do ar" nesse caso; site com 4xx/5xx real vira `unreachable` (dor máxima).
* **Retorno:** `audit` (issues, `healthScore`, `painScore`, `primaryIssue`/gancho, `headline`, `bullets`) e, com `leadId`, o `priority` recalculado.

### 28. `prioritize_leads`
Ranqueia os leads por **sinais de dor** (sem site, nota baixa, poucas avaliações, site com defeito grave, conversa quente) já com score, nível e motivos.
* **Parâmetros:** `limit` (default 10), `status` (filtro de pipeline, opcional), `persist` (default `false` — recalcula e grava os scores antes de ranquear).
* **Quando usar:** no começo do dia, para decidir em quem gastar o primeiro minuto.

### 29. `outbound_metrics`
Funil real de outbound por **pessoa abordada** (não por mensagem): abordados → responderam → reunião/negociação → fechados, além de taxa por gancho e por canal.
* **Parâmetros:** `since` (ISO, opcional).
* **Leitura:** `bestHook` aponta o gancho que mais responde; só conta reunião/fechamento de lead efetivamente abordado na janela (funil nunca passa de 100%). A resposta é creditada ao gancho do **primeiro** outbound do lead — follow-up herda o gancho e não cria um novo.

### 30. `run_cadence`
Executa a cadência de recontato (D+3 "prova", D+7 "prazo") para quem recebeu a abordagem inicial e não respondeu.
* **Parâmetros:** `dryRun` (**default `true`** — apenas planeja), `leadIds` (opcional), `dailyCap` (opcional; default vem de `automation_cadence_daily_cap`, 20).
* **Regras:** para em conversa aberta, pedido de descadastro, resposta, prazo ainda não vencido, lead fechado/negociando ou 3 tentativas; `dailyCap` limita envios reais no dia.
* **Fluxo seguro:** rode com `dryRun: true`, mostre o plano ao usuário e só depois repita com `dryRun: false`.

### 31. `whatsapp_sync_history`
Reconcilia o histórico de um lead direto do celular conectado: recupera mensagens recebidas que o webhook perdeu e aplica os ACKs de entrega/leitura (`delivered`/`read`) das mensagens enviadas.
* **Parâmetros:** `leadId` **ou** `phone`, `count` (1–100, default 30), `since` (`YYYY-MM-DD` ou RFC3339), `anchor` (ID de mensagem existente no chat, opcional) e `fromMe` (opcional).
* **Âncora:** o gateway exige o ID de uma mensagem já existente no chat; por padrão usamos o último `externalId` registrado do lead. Lead sem histórico registrado retorna `reason: "no_anchor"` (HTTP 400) — envie uma mensagem antes de reconciliar.
* **Quando usar:** status preso em `sent`, ou suspeita de resposta recebida sem registro. Exige o aparelho online — o gateway devolve 504 se o celular não responder.
* **Equivalente REST:** `POST /api/whatsapp/reconcile` com `{ leadId | phone, count, since?, anchor?, fromMe? }`.

### 32. `list_outbox`
Lista envios que precisam de atenção: falhas reenviáveis dos últimos 7 dias e mensagens enviadas há mais de 24h sem ACK de entrega/leitura.
* **Parâmetros:** `limit` (1–200, default 50).
* **Retorno:** `failed[]`, `unconfirmed[]` e `counts`; cada item traz `communicationId`, lead, telefone, mensagem, gancho e idade em horas.
* **Equivalente REST:** `GET /api/outbox?limit=50`.

### 33. `retry_outbound`
Reenvia manualmente uma mensagem com status `failed`, preservando o texto e o gancho originais.
* **Parâmetros:** `communicationId` (vindo de `list_outbox`).
* **Guardas:** não reenvia `sent`/`delivered`/`read` (evita duplicar), bloqueia opt-out e ignora se já houve envio bem-sucedido da mesma mensagem depois da falha.
* **Equivalente REST:** `POST /api/outbox/:id/retry`.

### 34. `research_lead_brand`
Pesquisa a **identidade visual** do lead em imagens e perfis públicos (Google Imagens/Instagram/Facebook) e extrai paleta, tom, tipografia provável, logo e referências visuais.
* **Parâmetros:** `leadId`, `force` (default `false` — reaproveita o snapshot salvo sem gastar cota), `maxImages` (1–10, default 6), `includeProfiles` (default `true`).
* **Custo:** 1–2 buscas SerpAPI + 1 chamada Gemini vision. Roda **somente** quando chamado (nunca automático).
* **Persistência:** grava `brandSnapshot` no lead; o `get_project_dev_kit` devolve o snapshot e o prompt de design já inclui a identidade.
* **Privacidade:** guardamos apenas dados derivados + URLs de origem — as imagens não são redistribuídas.
* **Equivalente REST:** `POST /api/leads/:id/brand-research` com `{ force?, maxImages?, maxSearches?, includeProfiles? }`.

---

## 🔄 Fluxo de Trabalho Obrigatório do Agente (Workflow)

Ao receber uma ordem de prospecção, o agente deve obrigatoriamente seguir estes passos em ordem:

```
[Passo 1: Descoberta] ➔ Chamar `search_leads` (priorizar presenceFilter="gold")
        │
[Passo 2: Qualificação] ➔ Selecionar os alvos com maior Opportunity Score
        │
[Passo 3: Diagnóstico IA] ➔ Chamar `analyze_lead` para cada alvo
        │
[Passo 4: Preparar Abordagem] ➔ Chamar `generate_whatsapp_pitch` (obter link wa.me)
        │
[Passo 5: Atualizar CRM] ➔ Chamar `update_crm_status(status="contatado")`
        │
[Passo 6: Relatório] ➔ Apresentar ao usuário a lista de leads com links de clique direto
```

---

## 📂 Recursos Expostos (Resources)
* `leads://categories`: Tabela de categorias de negócios otimizadas para Landing Pages.
* `leads://pipeline`: Estatísticas em tempo real do Funil de Vendas do Mini-CRM.
* `leads://queue_status`: Métricas da fila de jobs (pendente/processando/concluído/falha).
* `leads://inbox`: Mensagens de WhatsApp/e-mail **recebidas e ainda não respondidas** — ponto de partida do agente para conversar.

---

## 💬 Ciclo de conversa (WhatsApp) do agente

```
[1] `list_inbound_messages`  ➔ quem respondeu e está aguardando resposta
        │
[2] `list_communications`    ➔ contexto completo da conversa daquele lead
        │
[3] `send_whatsapp_message`  ➔ resposta (conversa aberta ignora a janela de recontato)
        │
[4] `record_interaction_outcome` ➔ formaliza o resultado (positive / negative / no_response / do_not_contact)
        │
[5] `update_crm_status`      ➔ move o lead no funil
```

> ⚠️ Envio para cliente real continua exigindo autorização do operador (regra em `AGENT_RULES`). O `whatsapp_request_qr` e o `whatsapp_set_webhook` são operações de infraestrutura — não contatam lead nenhum.

---

## 📈 Ciclo de crescimento (site → gancho → resposta → cadência)

```
[1] `prioritize_leads`        ➔ quem tem mais dor agora (sem site, nota baixa, site quebrado)
        │
[2] `audit_lead_website`      ➔ defeito concreto + headline + bullets (gancho real)
        │
[2.1] `research_lead_brand`    ➔ paleta/tom/logo do lead (entra no dev kit da LP)
        │
[3] `analyze_lead`            ➔ diagnóstico/pitch usando `siteAudit` como base
        │
[4] `send_whatsapp_message`   ➔ primeira abordagem citando o defeito (nunca "quer um site?")
        │
[5] `run_cadence` (dryRun)    ➔ plano D+3 / D+7 para quem não respondeu; só depois `dryRun:false`
        │
[6] `outbound_metrics`        ➔ taxa de resposta por gancho; dobrar no que responde, cortar o resto
```

---

*LeadRadar AI — Protocolo MCP v1.0.0* 🚀
