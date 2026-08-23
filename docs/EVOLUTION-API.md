# Evolution API — WhatsApp gratuito para o LeadRadar

Integração self-hosted e sem custo para enviar/receber WhatsApp dos leads.
A Meta Cloud API oficial fica anotada como versão futura (ver final do documento).

---

## 1. Subir a Evolution API (uma vez)

Pré-requisito: Docker Desktop instalado.

```bash
cd lead-radar
docker compose -f docker-compose.evolution.yml up -d
```

Isso sobe:
- **Evolution API** em `http://localhost:8080`
- **Postgres** (persistência da Evolution) em `localhost:5432`

## 2. Conectar o WhatsApp (escanear QR Code)

```bash
# Cria a instância "leadradar" (usa a apikey definida no compose)
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: leadradar-evolution-key" \
  -d '{"instanceName": "leadradar", "qrcode": true}'
```

A resposta traz um base64 do QR Code (ou abra o Manager em `http://localhost:8080/manager`).
Escaneie com o WhatsApp do **chip de negócios** (recomendado: número dedicado, não o pessoal).

> ⚠️ A Evolution usa protocolo não-oficial (WhatsApp Web). Use volume moderado,
> mensagens personalizadas (o LeadRadar já gera pitch individual por lead) e um
> chip dedicado — assim o risco de banimento é baixo.

## 3. Configurar o webhook (para receber respostas)

```bash
curl -X POST http://localhost:8080/webhook/set/leadradar \
  -H "Content-Type: application/json" \
  -H "apikey: leadradar-evolution-key" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "http://host.docker.internal:3001/api/whatsapp/webhook",
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

Se o servidor estiver exposto à internet, defina `WHATSAPP_WEBHOOK_TOKEN` no `.env`
e acrescente `?token=SEU_TOKEN` na URL do webhook.

## 4. Configurar o LeadRadar (.env)

```ini
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_KEY="leadradar-evolution-key"
EVOLUTION_INSTANCE="leadradar"
# WHATSAPP_WEBHOOK_TOKEN="opcional-se-publico"
```

Reinicie o servidor (`npm run dev`). Pronto: os pitches passam a ser enviados
de verdade, e as respostas dos leads chegam no CRM automaticamente.

## O que acontece quando o lead responde

O endpoint `POST /api/whatsapp/webhook`:

1. Casa o remetente com o lead pelo telefone normalizado
2. Registra a mensagem recebida em `communications`
3. Marca `last_response_at` no lead (leads frios "esquentam")
4. Classifica a intenção por palavras-chave e move o pipeline:
   - "quero saber mais / tenho interesse" → **negotiating**
   - "quanto custa / orçamento" → **negotiating**
   - "não tenho interesse / remover meu número" → **declined**
   - "depois / estou ocupado" → mantém estágio
5. Interesse ou preço geram interação de follow-up pendente (você responde por cima)

Um evento SSE `whatsapp_inbound` é emitido para a UI.

---

## 🔮 Versão futura: Meta WhatsApp Cloud API (oficial)

Quando quiser migrar para o canal oficial da Meta (sem risco de banimento,
1.000 conversas/mês grátis), o caminho é:

1. Criar app Business em https://developers.facebook.com e adicionar o produto WhatsApp
2. Guardar `PHONE_NUMBER_ID` + token permanente + aprovar 1–2 templates de primeira abordagem
3. Implementar adaptador alternativo em `contactService.ts`: POST para
   `https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages` com
   `{ messaging_product: "whatsapp", to, type: "template", template: {...} }`
4. Apontar o webhook da Meta para `/api/whatsapp/webhook` (adicionar verificação
   `hub.challenge` no GET — o handler POST já é compatível com o payload
   `entry[].changes[].value.messages[]`, basta um segundo extractor)

O restante do fluxo (intenção → pipeline → follow-up) permanece idêntico.
