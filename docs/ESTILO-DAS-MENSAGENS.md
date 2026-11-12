# Estilo das mensagens de WhatsApp

Regras pedidas pelo Paulo (nov/2026) e onde cada uma vive no código.

| Regra | Implementação |
|---|---|
| Quebrar linha em blocos curtos | `whatsAppify` (`messageStyle.ts`) quebra bloco > 140 chars em frases; templates já nascem em linhas |
| Nunca usar travessão (— / –) | `stripAiDashes`: vira vírgula no meio da frase e ponto quando inicia oração |
| Dizer que a prévia é grátis | `freePreviewLine(policy)` no 1º contato, e regra no prompt do agente |
| Não falar de pacote no 1º contato | o D0 não usa `packageLines`; há teste garantindo que não sai `R$` nem nome de pacote |
| Convite aos pacotes depois da prévia | `packagesInviteLine(policy)`, sem valor, usado só quando a prévia já foi enviada |
| Preços terminando em 99 | `commercialPolicy`: Essencial **R$ 899**, Profissional **R$ 1.199** |
| Negrito e emojis com moderação | `bold()` + máx. 2 negritos e 3 emojis por mensagem |

## Onde o estilo é aplicado

1. **Gate único de saída**: `contactService.deliverWhatsApp` passa TODA mensagem por
   `whatsAppify` antes de chamar o gateway. Vale para D0, cadência, resposta do agente,
   reenvio da outbox e MCP. Ou seja, mesmo um texto antigo ou vindo da IA chega limpo.
2. **Template do D0**: `buildProspectMessage` monta os blocos (saudação / prova /
   proposta / prévia grátis / pacotes / pergunta).
3. **Pitch da IA**: o prompt da análise recebe `WHATSAPP_STYLE_RULES`; e
   `pitchQaService` reprova o pitch que tiver travessão ou bloco único, forçando
   reescrita.
4. **Agente de vendas** (`salesAgentService`): `VOICE_RULES` + `WHATSAPP_STYLE_RULES`
   nos três prompts (abertura, resposta, cadência) e no texto de emergência.
5. **Cadência D3/D7**: mensagens em linhas separadas + `whatsAppify`.
6. **Cron de resposta**: prompt atualizado com o bloco de estilo e a instrução de ler
   `GET /api/agent/policy` antes de falar de preço.

## Exemplo real (enviado em 11/11/2026, formato final)

```
Olá! Tudo bem? 👋 Aqui é da Vértice Páginas Web.

Achei *Via Kennedy Auto Center* no Google: 4,6★ com 109 avaliações e reparei que vocês ainda não têm um site próprio.

A gente monta uma página bonita, rápida e funcional, com botão de WhatsApp levando o cliente direto pra você.

⭐ *A prévia é grátis*, sem custo nenhum: eu monto a tela inicial e você vê como fica antes de decidir.

Quer que eu prepare a de vocês?
```

## Escada da conversa (não pule etapa)

1. **D0**: apresentação, prova (nota/avaliações), a dor (sem site) e a prévia grátis. Zero preço, zero pacote.
2. **Interesse**: gera a prévia (`POST /api/leads/:id/preview`) e manda o link.
3. **Convite**: "quer que eu te mande os pacotes com o que cada um inclui?" (sem valor).
4. **Pacotes**: só depois do sim, com nome, valor fechado e 2 a 4 itens do que inclui.

## Pacotes (fonte: `commercialPolicy`)

| Pacote | Valor | O que inclui (resumo) |
|---|---|---|
| Essencial | **R$ 899** | página com até 5 seções, textos, fotos, botão de WhatsApp, publicação e 1 rodada de ajuste |
| Profissional | **R$ 1.199** | tudo do Essencial + diferenciais, depoimentos, FAQ, SEO local melhorado e 2 rodadas de ajuste |

## Detalhes que parecem pequenos e não são

- **Nome longo do Google**: `shortBusinessName` corta o descritor que o Maps cola
  depois de " - " ("Buffet Don Pepe Kids - Buffet Infantil e Eventos"), senão a linha
  estoura.
- **Preço sempre da política**: `commercialPolicy` é a única fonte. O template lê
  `packages` e o agente lê `GET /api/agent/policy`. Modelo nunca "sabe" preço.
- **Curto não vira bloco**: mensagem com até 140 caracteres não é quebrada, para não
  transformar um "posso mandar?" em três linhas.
- **`whatsAppify` é idempotente**: rodar duas vezes (template + gate) não altera o texto.
- **Sem artigo antes do nome do negócio**: "Vi a Quintal dos Sonhos" errava o gênero. A frase virou
  "Achei *Quintal dos Sonhos* no Google: 4,8★ com 110 avaliações", que serve para qualquer nome.
