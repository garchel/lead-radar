# Números de teste (o Paulo e convidados)

Números que **não são leads reais** mas precisam passar pela mesma experiência de
um lead: recebem a abordagem de prospecção e a conversa continua normalmente.

## Quem está na lista

| Lead | Número | Para quê |
|---|---|---|
| `pv-landing-1` (Paulo Victor) | +55 61 9379-7728 | simulações do próprio Paulo |
| `lead_324bd74cd025c277744d` (Teste 1) | +55 61 9927-7579 | convidado para testar a conversa |
| `lead_5858c9e9b7007427d64d` (Teste 2) | +55 61 8303-7497 | convidado para testar a conversa |

A marcação fica na coluna `leads.is_test` (1 = teste), não no campo de anotações.
No CRM esses leads aparecem com um selo **TESTE** ao lado do nome.

## O que acontece quando alguém da lista manda mensagem

1. O webhook recebe a mensagem e reconhece o lead como número de teste.
2. Se **nunca** mandamos nada para esse número, dispara a abordagem de prospecção
   (`buildTestPitchMessage`), com o mesmo estilo do primeiro contato real:
   blocos curtos, sem travessão, prévia grátis explícita e **nenhum preço**.
3. Nessa primeira mensagem o agente comercial **não** responde junto, senão a
   pessoa receberia duas mensagens seguidas.
4. Da segunda mensagem em diante a conversa é conduzida pelo agente normal
   (escada: prévia → convite aos pacotes → preço).

O disparo roda em segundo plano: o webhook responde ao gateway na hora e a
humanização (digitação + pausa) segue o ritmo normal.

## Como adicionar alguém

1. Marque o lead: `UPDATE leads SET is_test = 1 WHERE id = '<id>'`.
2. Confirme que o número tem WhatsApp (senão o envio falha com `no LID found`).
3. Se o lead ainda não existir, crie com telefone em E.164 sem "+" (`5561999998888`)
   — o `normalizePhone` grava o formato canônico com o 9º dígito.

## Como sair da lista

`UPDATE leads SET is_test = 0 WHERE id = '<id>'`. Se virar cliente de verdade, é
só isso: o número passa a ser tratado como lead normal.

## Cuidados

- `is_test` **não** isenta a janela de humanização nem os tetos diários: o teste
  passa pelas mesmas travas de envio.
- O número precisa existir no WhatsApp. O gateway responde `exists: true` e o
  `jid` canônico; número sem WhatsApp falha no envio (e a falha fica registrada).
- Números de teste não entram na coleta do autopilot e não gastam cota do SerpAPI.
