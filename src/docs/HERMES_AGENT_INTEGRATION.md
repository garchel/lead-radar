# 🤖 Guia de Conexão: Hermes Agent + LeadRadar AI MCP

Este guia explica como conectar o **Hermes Agent** (framework de agentes de IA autônomos baseado em modelos Nous Hermes) ao servidor **LeadRadar AI MCP** para executar prospecção B2B 100% automatizada.

---

## 🚀 1. Visão Geral da Integração

O **Hermes Agent** utiliza o protocolo **Model Context Protocol (MCP)** via transporte **SSE (Server-Sent Events)** para invocar ferramentas de prospecção em tempo real:

1. **`search_leads`**: Descobre empresas locais e filtra alvos **Ouro** (sem site) ou **Prata** (apenas Instagram).
2. **`analyze_lead`**: Gera o diagnóstico de vendas e argumentos com IA.
3. **`generate_whatsapp_pitch`**: Cria a abordagem persuasiva e o link direto `wa.me/` com mensagem pré-formatada.
4. **`update_crm_status`**: Atualiza a fase do lead no Pipeline do Mini-CRM (`novo`, `contatado`, `proposta_enviada`, `fechado`) — **persistido no banco compartilhado**.
5. **Dados reais e automação**: `create_lead`, `list_leads`, `enrich_lead` (Google Places/CNPJ/e-mail), `send_contact` (WhatsApp/e-mail).
6. **Landing Pages**: `create_landing_page`, `list_landing_pages`, `get_landing_page`, `approve_landing_page` (guarda-limite humano), `deploy_landing_page` (Netlify/local).
7. **`schedule_prospecting`**: agenda prospecção **periódica** via cron — dispara Jobs de autopilot/batch recorrentes com limite de LPs/dia; `follow_up_reminder` (diário) enfileira os **recontatos autorizados**, sem envio automático.
8. **`export_dossier`**: gera o Dossiê Executivo HTML do lead.
9. **`record_interaction_outcome` / `list_due_followups`**: registram a resposta da empresa e listam os recontatos cujo prazo já venceu.

*(No total, **15 ferramentas** (as 4 de prospecção + 11 de automação/monitoramento).)*

---

## ⚙️ 2. Arquivo de Configuração (`hermes_mcp_config.json`)

Crie ou edite o arquivo `hermes_mcp_config.json` no ambiente do seu **Hermes Agent**:

```json
{
  "mcpServers": {
    "leadradar-ai": {
      "url": "https://ais-dev-ptbcvbutfhlbqgnrl7hpjb-225831133847.us-west1.run.app/api/mcp/sse",
      "type": "sse",
      "description": "LeadRadar AI - Servidor MCP para Prospecção Autônoma B2B de Landing Pages"
    }
  }
}
```

*(Observação: Em desenvolvimento local, você pode usar `http://localhost:3000/api/mcp/sse`)*.

---

## 💻 3. Comandos de Execução no Hermes Agent

### Comando 1: Prospecção de Oportunidades "Ouro"
```bash
hermes agent --mcp-config ./hermes_mcp_config.json \
  --prompt "Mapeie 5 clínicas de estética na cidade de Campinas (SP) sem site (filtro Ouro). Analise cada uma e gere os links de abordagem via WhatsApp."
```

### Comando 2: Ciclo de Automação do Funil (Autopilot)
```bash
hermes agent --mcp-config ./hermes_mcp_config.json \
  --prompt "Invoque o prompt pré-definido autopilot_prospecting para a categoria 'Dentista / Clínica Odontológica' em Curitiba (PR). Atualize os leads para 'contatado' e exiba o resumo do pipeline."
```

---

## 📋 4. Exemplo de Fluxo de Execução do Hermes Agent

```
[Hermes Agent] ➔ Conectando ao MCP Server em /api/mcp/sse...
[MCP Server] ➔ Conexão estabelecida! 15 ferramentas e 3 recursos disponíveis.

[Hermes Agent] ➔ Executando search_leads(location="Sorocaba", state="SP", presenceFilter="gold")
[MCP Server] ➔ 4 leads Ouro mapeados com notas > 4.7 no Google Maps.

[Hermes Agent] ➔ Executando analyze_lead(businessName="Odonto Prime Sorocaba")
[MCP Server] ➔ Diagnóstico gerado: "Perde agendamentos por falta de botão no WhatsApp. Nota 4.9 com 128 avaliações."

[Hermes Agent] ➔ Executando generate_whatsapp_pitch(phone="15987654321", tone="consultative")
[MCP Server] ➔ Link wa.me/5515987654321?text=... gerado com sucesso.

[Hermes Agent] ➔ Executando update_crm_status(leadId="mcp-lead-1", status="contatado")
[MCP Server] ➔ Status atualizado no CRM para 'contatado'.
```

---

## 🛡️ 5. Teste de Sanidade do Endpoint MCP

Você pode verificar a saúde e os metadados do servidor MCP acessando diretamente no seu navegador ou via curl:

```bash
curl -s https://ais-dev-ptbcvbutfhlbqgnrl7hpjb-225831133847.us-west1.run.app/api/mcp/info
```

---

*LeadRadar AI + Hermes Agent: Automação Inteligente de Prospecção B2B.* ⚡
