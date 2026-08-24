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

## 🔮 Versão futura: Meta WhatsApp Cloud API (oficial) — ✅ JÁ IMPLEMENTADA

A Meta Cloud API agora também está implementada e pode ser selecionada na UI
(aba CRM → card "Conexão WhatsApp") ou via `WHATSAPP_PROVIDER=meta` no `.env`.

**O que já está feito:**
- Envio: `META_WHATSAPP_TOKEN` + `META_PHONE_NUMBER_ID` → POST para
  `graph.facebook.com/{version}/{PHONE_ID}/messages` (texto livre)
- Webhook: o mesmo `/api/whatsapp/webhook` responde à verificação
  `hub.challenge` (defina `META_WEBHOOK_VERIFY_TOKEN`) e parseia payloads
  `entry[].changes[].value.messages[]`
- Seletor: `GET/POST /api/whatsapp/status|provider` + card na UI com a escolha
  persistida no banco (precedência sobre o .env)

**Limitação atual:** envio por texto livre funciona dentro da janela de 24h do lead.
Para a primeira abordagem fora da janela, a Meta exige template aprovado —
implementar envio por template (`type: "template"`) é a próxima evolução.

**Passo a passo Meta:** ver `.env.example` (bloco "Meta Cloud API").
