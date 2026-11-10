# Whatsmiau — WhatsApp via gateway (self-hosted ou Cloud)

O LeadRadar envia WhatsApp por um backend compatível com a **Evolution API**. As opções são o **Whatsmiau self-hosted** (fork local em `.whatsmiau-src`, container Docker) ou a **Whatsmiau Cloud** (API hospedada).

## Como o envio funciona

O LeadRadar sempre chama:

```
POST {WHATSMIAU_API_URL}/v1/message/sendText/{WHATSMIAU_INSTANCE}
headers: apikey: {WHATSMIAU_API_KEY}
body:    { "number": "5511...", "text": "..." }
```

> ⚠️ O prefixo `/v1` é fixo no código (`server/services/contactService.ts`). Para a **Cloud** (documentada com `/v2`), a `WHATSMIAU_API_URL` deve apontar para a base cuja API sirva esse mesmo endpoint — se a Cloud só expõe `/v2`, ajuste `sendViaWhatsmiau` ou use um proxy. As variáveis `WHATSMIAU_CLOUD_API_KEY`/`WHATSMIAU_CLOUD_INSTANCE` do `.env.example` **não são lidas pelo código**.

## Self-hosted (recomendado para o LeadRadar)

```bash
docker compose -f docker-compose.whatsmiau.yml up -d --build
```

```ini
# .env
WHATSMIAU_API_URL="http://127.0.0.1:8081"
WHATSMIAU_API_KEY="leadradar-whatsmiau-key"
WHATSMIAU_INSTANCE="leadradar"
WHATSAPP_PROVIDER="whatsmiau"
```

O gateway usa **WhatsMeow**: o pareamento é feito por QR Code (Apparelhos conectados → Conectar com número).

## Cloud

1. Crie uma conta e gere uma API Key no [Dashboard Whatsmiau](https://whatsmiau.dev/dashboard).
2. Crie uma instância e conecte o WhatsApp seguindo as instruções do painel.
3. Configure `WHATSMIAU_API_URL`, `WHATSMIAU_API_KEY` e `WHATSMIAU_INSTANCE` no `.env` e reinicie o servidor.

Depois de configurar as credenciais, dá para trocar o backend em tempo real pela UI (card **Conexão WhatsApp** na aba CRM) ou pela tool `set_whatsapp_provider` — a escolha fica salva no banco e vale sem reinicialização.

## Modo automático

Com `WHATSAPP_PROVIDER="auto"` (padrão), o primeiro backend configurado é escolhido nesta ordem: Evolution → Whatsmiau → Meta Cloud API → webhook legado. O provedor efetivo pode ser conferido em `GET /api/whatsapp/status` (ou pela tool `whatsapp_status`).

## Receber respostas no CRM

O gateway é compatível com Evolution API e emite o evento `MESSAGES_UPSERT`. O inbound do LeadRadar fica em `POST /api/whatsapp/webhook`: registra a mensagem recebida, aplica as regras de intenção e o opt-out LGPD.

A configuração do webhook pode ser feita pela tool **`whatsapp_set_webhook`** (o agente monta a URL a partir de `APP_URL` + `/api/whatsapp/webhook`, já com `?token=` quando `WHATSAPP_WEBHOOK_TOKEN` existe):

```json
{ "url": "https://SEU_DOMINIO/api/whatsapp/webhook", "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"], "enabled": true }
```

> Use uma URL publicamente acessível em produção. `localhost` não é acessível pelo gateway em outra máquina — para testes locais, exponha o servidor por um túnel seguro.

## Operação do número pelo agente (MCP)

Além do envio, o agente de IA pode operar o gateway inteiro:

| Tool | O que faz |
|---|---|
| `whatsapp_status` | Backend ativo, quais estão configurados e o estado da instância. |
| `set_whatsapp_provider` | Troca o backend (`auto`, `evolution`, `whatsmiau`, `meta`, `legacy`). |
| `whatsapp_instance_status` | Estado da instância (`open` = pareada) e webhook configurado. |
| `whatsapp_request_qr` | Gera/renova o QR de pareamento; salva o PNG em `data/whatsapp-qr-<instancia>.png`. |
| `whatsapp_set_webhook` | Aponta o webhook de eventos para o inbound do LeadRadar. |

E, para a conversa em si: `list_inbound_messages` (caixa de entrada), `list_communications` (histórico) e `send_whatsapp_message` (envia/responde).

Referências: [Começando / API v2](https://whatsmiau.dev/docs/getting-started) · [Documentação](https://whatsmiau.dev/docs)
