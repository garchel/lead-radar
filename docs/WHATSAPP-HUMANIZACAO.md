# Humanização do envio de WhatsApp (anti-ban)

Automação não-oficial (WhatsMiau / Evolution / Baileys) é passível de banimento
quando o padrão de envio é "robô": rajada de mensagens, envio 24h por dia, sem
pausa entre uma conversa e outra. Este documento descreve a camada que impõe um
comportamento de operador humano.

Implementação: `server/services/humanizeService.ts` (toda a regra) +
`runPaced()` chamado dentro de `deliverWhatsApp()` em
`server/services/contactService.ts`. Ou seja: **todo** envio de WhatsApp do app
(UI do lead, agente MCP, cadência D+3/D+7, autopilot, retry da outbox) passa
pelo mesmo portão — não existe caminho paralelo.

## Regras

| Regra | Padrão | Onde muda |
|---|---|---|
| Janela de respostas | 07h–20h, todos os dias | Automação → Humanização |
| Janela de prospecção (1º contato + cadência) | 08h–18h, seg–sex | Automação → Humanização |
| Delay de digitação | 1200ms + 55ms por caractere, teto 12s, ±15% de jitter | Automação → Humanização |
| Pausa entre envios | 45–120s sorteados entre um envio e o seguinte | Automação → Humanização |
| Teto diário total | 60 mensagens (respostas + prospecção + cadência) | Automação → Humanização |
| Teto de contatos novos | 30 primeiros contatos por dia | Automação → Humanização |

Detalhes que importam:

- **Dia LOCAL**, não UTC: um envio às 22h conta para o dia que o operador vê.
- **Contato novo** = lead que nunca recebeu uma mensagem nossa com sucesso. O
  teto de 30 vale só para esses; responder quem já está em conversa não consome
  esse orçamento (mas consome o total).
- **Serialização**: os envios saem um por vez. Duas chamadas simultâneas não
  furam a pausa (`runPaced` encadeia as promessas).
- **Bloqueio é auditado**: quando o portão barra, nada é enviado e a comunicação
  é gravada como `failed` com o motivo ("Fora da janela de respostas…",
  "Teto diário de 60 mensagens atingido…"). Ela aparece na outbox
  (`list_outbox` / `retry_outbound`) e pode ser reenviada quando a janela abrir.
- **Espera inline**: se faltar menos de `WHATSAPP_HUMANIZE_MAX_WAIT_MS`
  (padrão 150s) para liberar, a chamada espera e envia. Acima disso, retorna
  bloqueado com `nextAllowedAt` em vez de segurar o request.
- **Kill switch**: desligar "Simular comportamento humano" faz tudo passar na
  hora (nenhuma janela, delay ou teto). É o botão de emergência.
- **E-mails não são humanizados** — só WhatsApp.

## Configuração

Persistida em `app_settings` (chaves `automation_humanize_*`), editável em
**Automação → Humanização do WhatsApp (anti-ban)** ou pela API:

```
GET  /api/automation/settings          # settings.humanize
PUT  /api/automation/settings          # { "humanize": { "dailyTotalCap": 60 } }
GET  /api/whatsapp/humanize            # config + consumo do dia + próxima liberação
```

Validação no PUT: valores fora de faixa sofrem clamp; janela com início igual ao
fim e pausa mínima > máxima retornam **400** sem gravar nada.

O teto da cadência (`automation_cadence_daily_cap`) herda o teto diário total
quando não está definido, e a contagem de "enviados hoje" da cadência usa a
mesma função (`getHumanizeUsage`) — assim os dois tetos não divergem.

## Consequência prática (leia antes de estranhar)

Como o envio é **síncrono**, um lote de N mensagens leva ~N × pausa. A cadência
com `limit: 10` roda por volta de 13 minutos no job (é o preço de não parecer
robô). Um envio manual clicado na UI pode levar até ~2 minutos para retornar —
o botão fica em "enviando" durante a pausa + digitação.

## Verificação

```bash
npx vitest run tests/humanize.test.ts    # janelas, delays, tetos, gate, envio real
npm run lint && npm test && npm run build
curl -s localhost:3000/api/whatsapp/humanize | jq
```

No teste a humanização vem **desligada** por padrão (`NODE_ENV=test`) para não
colocar sleep em toda a suíte; os testes que a exercitam gravam
`automation_humanize_enabled=true` explicitamente.

## Ainda não implementado

- Indicador de "digitando…" no WhatsApp (`sendPresence` do gateway) — o delay
  hoje é só espera antes do POST, o contato não vê "digitando".
- Fila assíncrona: mensagens bloqueadas por janela **não** são reagendadas
  sozinhas; é preciso reenviar pela outbox ou esperar a janela e mandar de novo.
