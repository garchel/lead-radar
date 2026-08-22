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
1. Crie um arquivo `hermes_mcp_config.json` no seu computador:
```json
{
  "mcpServers": {
    "leadradar-ai": {
      "url": "https://ais-dev-ptbcvbutfhlbqgnrl7hpjb-225831133847.us-west1.run.app/api/mcp/sse",
      "type": "sse",
      "description": "LeadRadar AI - Servidor MCP de Prospecção"
    }
  }
}
```
2. Execute o comando no seu terminal:
```bash
hermes agent --mcp-config ./hermes_mcp_config.json \
  --prompt "Mapeie 5 dentistas sem site em Campinas (SP), analise cada um e prepare as abordagens de WhatsApp."
```

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
3. Reinicie o Claude Desktop. O ícone de martelo 🛠️ exibirá as **15 ferramentas ativas** do LeadRadar AI!

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
  - `presenceFilter` (enum: `"all" | "gold" | "silver"`): Usar `"gold"` para empresas SEM SITE e `"silver"` para empresas APENAS COM INSTAGRAM.

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

### 7. `create_landing_page`
Enfileira a criação de uma **Landing Page** para o lead (aguarda aprovação humana).
* **Parâmetros:** `leadId`, `concept` (conceito estruturado), `tone`, `autoDeploy`.

### 8. `list_landing_pages`
Lista as Landing Pages e seus estágios/status (`rascunho → copy → design → deploy → publicado`).

### 9. `get_landing_page`
Obtém detalhes/HTML de uma Landing Page específica (`id`).

### 10. `approve_landing_page`
**Guarda-limite humano:** aprova uma Landing Page antes de publicar (`id`).

### 11. `deploy_landing_page`
Publica uma Landing Page aprovada (Netlify Drop / local) e retorna a **URL pública** (`id`).

### 12. `enrich_lead`
Enriquece um lead com dados reais (Google Places, BrasilAPI/CNPJ, Hunter.io/e-mail).

### 13. `send_contact`
Envia mensagem de contato ao lead (WhatsApp/e-mail reais). Sem provedor configurado ou com erro no provedor, retorna falha explícita e registra a tentativa.

### 14. `record_interaction_outcome`
Registra a resposta da empresa (`negative`, `no_response`, `positive`, `meeting_scheduled`, `negotiating` ou `do_not_contact`). Uma resposta negativa agenda novo contato para 30 dias depois; `do_not_contact` bloqueia novos contatos.

### 15. `list_due_followups`
Lista os leads cujo prazo de recontato já chegou, sem enviar mensagens automaticamente.

### 16. `schedule_prospecting`
**Agenda prospecção periódica** via expressão cron (in-process). Cria um agendamento persistido no banco.
* **Parâmetros:** `name`, `cron` (ex: `"0 9 * * 1-5"`), `jobType` (`mcp_autopilot` | `batch_prospecting` | `follow_up_reminder`), `location`/`state`/`category` (autopilot) ou `locations`/`categories` (batch).
* `follow_up_reminder`: roda diariamente e enfileira a lista de **recontatos autorizados** (prazo vencido) — não envia nada; o envio exige aprovação humana.
* **Guardrails de autonomia:** respeita o limite de **LPs/dia** (configurável, padrão 5) e a aprovação humana antes do deploy.

### 17. `export_dossier`
Gera o **Dossiê Executivo HTML** de um lead (pronto para impressão/PDF) a partir do diagnóstico de IA já persistido — sem novas chamadas de IA.
* **Parâmetros:** `leadId`.

### 18. `sync_typeform_briefing`
Importa as respostas do **formulário de briefing do Typeform** (Responses API) e grava o briefing no projeto correspondente. Idempotente: cada resposta é importada uma única vez.
* **Parâmetros:** `formId` (opcional — usa `TYPEFORM_FORM_ID` do `.env` por padrão).
* **Configuração:** `TYPEFORM_ACCESS_TOKEN` e `TYPEFORM_FORM_ID` no `.env`.
* **Vínculo:** respostas com `hidden` `project_id`/`lead_id` são vinculadas diretamente; sem hidden, casa pelo nome da empresa contra os projetos ativos. Respostas sem correspondência são reportadas como `unmatched` no resumo.

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

---

*LeadRadar AI — Protocolo MCP v1.0.0* 🚀
