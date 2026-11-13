# Clara por comando: falar com o sistema pelo seu WhatsApp

O número do dono virou um canal de operação. Mensagem normal continua sendo
conversa de cliente; **comando começa com `/`** — é o que separa os dois papéis
quando o mesmo número é também o lead de simulação (`pv-landing-1`).

## Comandos

| Comando | Resposta |
|---|---|
| `/hoje` | quantas mensagens chegaram hoje, quantas foram respondidas e quem está esperando |
| `/pendentes` | conversas abertas paradas há mais de 5 minutos, com o trecho da mensagem |
| `/fora` | quem escreveu **fora da janela 7h–20h** e continua sem resposta (o estoque que só pode ser atendido de manhã) |
| `/lead <nome ou telefone>` | ficha rápida: cidade, etapa no pipeline e as 3 últimas mensagens |
| `/status` | agente ligado? Clara primeiro? rede de segurança? janela? |
| `/pausar` | cala **Clara e a rede de segurança** (kill switch) |
| `/retomar` | devolve ao normal |
| `/ajuda` | lista tudo |

## Como funciona por dentro

- Identificação: o telefone do remetente é comparado com `owner_alert_phone`
  (painel) ou `OWNER_ALERT_PHONE` (env), com chave **DDD + 8 dígitos finais** — o
  nono dígito e o `+55` variam entre cadastros e não podem separar o mesmo número.
- O webhook intercepta o comando **antes** de mover pipeline, criar follow-up ou
  acionar o agente; a comunicação recebida é marcada com `intent = comando_dono`.
- A resposta é enviada pelo gateway e **registrada como outbound** — é isso que faz
  a rotina da Clara ver `already_answered` e não responder duas vezes.
- O monitor do inbox ignora `intent = comando_dono`: comando não acorda o agente.
- `/pausar` grava `automation_clara_paused = true`; o **monitor** lê essa chave e
  para de acordar a Clara (a rotina dela roda fora do app, então desligar só o
  agente interno não a calaria).

## Limites conhecidos

- Comando é texto: foto/áudio não são interpretados.
- `/pausar` não impede o envio manual (você continua podendo responder pelo app).
- As respostas usam o mesmo gateway da Clara; se o gateway cair, o comando falha e
  o erro fica registrado como comunicação `failed` com `hook = comando_dono`.
