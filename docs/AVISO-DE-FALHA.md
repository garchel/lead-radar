# Aviso de falha no WhatsApp do Paulo

Se o atendimento automático não conseguir responder um lead, o Paulo recebe uma
mensagem no próprio celular com **quem ficou esperando** e **por quê** — em vez de
descobrir horas depois, com o lead frio.

Implementação: `server/services/ownerAlertService.ts` (envio + antispam),
`server/routes/alertRoutes.ts` (API), cartão na página **Automação**.

---

## Quando dispara

| Situação | `kind` | Quem detecta |
|---|---|---|
| IA não entregou texto aceitável (usou o texto padrão) | `ia_falhou` | `salesAgentService` |
| O envio falhou (gateway, erro HTTP) | `envio_falhou` | `answerLead` e `agentWatchdog` |
| Humanização/teto/opt-out barrou o envio | `resposta_bloqueada` | `answerLead` e `agentWatchdog` |
| Bot de cliente não conseguiu falar com o cliente final | `bot_cliente` | `botConversationService` |
| A própria Clara falhou | `clara_falhou` | rotina da Clara (cron), via `POST /api/alerts/owner` |
| Teste do painel | `teste` | botão "Enviar teste" |

## Como o aviso é enviado

Sai pelo **mesmo número do bot** (instância do WhatsMiau), direto para o celular
do Paulo, **sem** passar pela humanização: é mensagem operacional, precisa chegar
em segundos, não competir com a fila de conversa.

O caminho do gateway é `/v1/message/sendText/<instância>`
(`sendGatewayText` em `whatsappGateway.ts`). Sem o prefixo `/v1`, o WhatsMiau
responde **404** — foi o primeiro erro ao subir essa função, e o registro de
tentativas mostrou na hora.

## Antispam (para o aviso não virar ruído)

- **Cooldown por conversa**: o mesmo lead e o mesmo motivo não repetem em 15 min.
- **Teto diário**: 20 avisos por dia. Queda geral da IA avisa uma vez, não uma vez
  por lead.
- **Falha de envio não conta como aviso enviado** (senão o primeiro erro silenciaria
  os próximos).
- **Sem número configurado não envia nada** — melhor não avisar do que avisar no
  lugar errado.

Tudo isso fica gravado em `owner_alerts` (status `sent`/`failed`), então o painel
mostra o histórico e o motivo da falha.

## O que o Paulo recebe

```
⚠️ *Preciso de você*

Fiquei sem responder *Barbearia Navalha*.
Motivo: a IA não conseguiu escrever a resposta.
Detalhe: IA indisponível

WhatsApp do lead: 5511999998888

A conversa está parada. Assume quando puder que eu volto a atender.
```

## Configurar

Página **Automação → Aviso de falha no WhatsApp**:

- liga/desliga;
- número do celular (o **pessoal**, não o número do bot — o gateway não entrega
  mensagem para o próprio número pareado e a API recusa);
- botão **Enviar teste**.

API equivalente: `GET/PUT /api/alerts/owner`, `POST /api/alerts/owner/test`.
A rotina da Clara usa `POST /api/alerts/owner` quando é ela que falha.

## Limite conhecido

Se o **gateway** inteiro estiver fora (container do WhatsMiau parado, número
desconectado), o aviso também não sai — não existe canal alternativo configurado.
Para esse caso, o caminho é monitorar `/api/whatsapp/health` de fora (ou receber o
alerta por Telegram/e-mail). Hoje o painel mostra o estado, mas sem push externo.
