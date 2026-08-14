# 🔌 Planejamento de Integração MCP (Model Context Protocol) - LeadRadar AI

Este documento detalha o plano arquitetural para expor o **LeadRadar AI** como um **Servidor MCP (Model Context Protocol)**, permitindo que agentes de IA autônomos (Claude Desktop, Cursor, n8n, AutoGPT, LangChain, etc.) automatizem todo o ciclo de prospecção B2B de Landing Pages.

---

## 🎯 Objetivo
Permitir que agentes de IA autônomos executem rotinas automáticas de prospecção:
1. Mapear empresas na região alvo.
2. Filtrar apenas empresas "Ouro" (sem site) ou "Prata" (apenas Instagram).
3. Analisar cada lead com IA e gerar propostas e abordagens personalizadas.
4. Enviar mensagens de prospecção via WhatsApp / CRM integrado.
5. Atualizar o status do Lead no Funil do Mini-CRM automaticamente.

---

## 🛠️ Arquitetura do Servidor MCP

O servidor MCP será construído em Node.js / TypeScript utilizando o SDK oficial `@modelcontextprotocol/sdk`.

### Protocolo de Comunicação
- **stdio / SSE (Server-Sent Events):** Compatível com Claude Desktop, Cursor e orquestradores de agentes em nuvem.

---

## 🛠️ Ferramentas Expostas (MCP Tools)

### 1. `search_leads`
Busca e mapeia estabelecimentos comerciais reais ou dados regionais inteligentes.
- **Parâmetros:**
  - `state` (string, ex: `"SP"`): Sigla do estado brasileiro.
  - `location` (string, ex: `"Campinas"`): Nome da cidade.
  - `category` (string, ex: `"Estética & Saúde"`): Categoria de negócio.
  - `presenceFilter` (string, enum: `["all", "gold", "silver"]`): `"gold"` para sem site, `"silver"` para apenas Instagram.
- **Retorno:** Lista de leads estruturados com pontuação Google Maps, telefone, status web e Score de Oportunidade.

### 2. `analyze_lead`
Executa um diagnóstico profundo de marketing e vendas para um lead específico.
- **Parâmetros:**
  - `businessName` (string): Nome da empresa.
  - `category` (string): Categoria.
  - `city` (string): Cidade.
  - `rating` (number): Nota no Google.
  - `reviewsCount` (number): Total de avaliações.
- **Retorno:** Objeto com nível de urgência, lista de falhas no perfil atual, objeções previsíveis, pitches para WhatsApp/Email/Cold Call e conceito estruturado para a Landing Page.

### 3. `generate_whatsapp_pitch`
Cria a mensagem perfeita de abordagem via WhatsApp adaptada para o tom do cliente (Formal, Direto ou Consultivo).
- **Parâmetros:**
  - `leadId` (string): ID do lead.
  - `tone` (string, enum: `["direct", "consultative", "formal"]`): Tom da conversa.
- **Retorno:** URL do WhatsApp (`https://wa.me/...`) pronta com a mensagem codificada e texto puro para cópia.

### 4. `update_crm_status`
Altera a fase do lead dentro do pipeline de vendas do Mini-CRM.
- **Parâmetros:**
  - `leadId` (string): ID do lead.
  - `status` (string, enum: `["novo", "contatado", "proposta_enviada", "em_negociacao", "fechado", "recusado"]`).
  - `notes` (string, opcional): Observações da conversa.
- **Retorno:** Status do lead atualizado no banco/localStorage.

### 5. `export_dossier`
Gera o relatório executivo (Dossiê PDF/HTML) do lead.
- **Parâmetros:**
  - `leadId` (string): ID do lead.
- **Retorno:** HTML/PDF formatado e pronto para envio ao cliente.

---

## 📂 Recursos Expostos (MCP Resources)

### `leads://pipeline`
Retorna o resumo atual do Funil de Vendas (quantidade de leads por estágio, valor total em negociação e taxa de conversão).

### `leads://categories`
Retorna a lista completa de categorias de negócios locais otimizadas para venda de Landing Pages.

---

## 💡 Prompts Pré-definidos (MCP Prompts)

### `autopilot_prospecting`
**Instrução para o Agente:** "Varra a cidade X na categoria Y, selecione os 5 melhores leads Ouro (sem site), gere abordagens personalizadas de WhatsApp para cada um e salve-os como 'Contatados' no CRM."

---

## 🗓️ Roteiro de Implementação

1. **Fase 1 (Dependências):** Instalar `@modelcontextprotocol/sdk`.
2. **Fase 2 (Server Core):** Criar `server/mcpServer.ts` registrando as ferramentas e rotas do backend Express.
3. **Fase 3 (Conectores Client):** Criar arquivo `mcp-config.json` para rápida conexão no Claude Desktop e Cursor.
4. **Fase 4 (Testes Automáticos):** Criar script de teste chamando `search_leads` -> `analyze_lead` -> `update_crm_status`.

---

*Documento criado para automação de prospecção inteligente B2B com Agentes de IA.* 🚀
