# Estilo das mensagens de WhatsApp

Regras pedidas pelo Paulo (nov/2026) e onde cada uma vive no código.

| Regra | Implementação |
|---|---|
| Quebrar linha em blocos curtos | `whatsAppify` (`messageStyle.ts`) quebra bloco > 140 chars em frases; templates já nascem em linhas |
| Nunca usar travessão (— / –) | `stripAiDashes`: vira vírgula no meio da frase e ponto quando inicia oração |
| Dizer que a prévia é grátis | `freePreviewLine(policy)` no 1º contato, e regra no prompt do agente |
| Falar dos pacotes com o que inclui | `packageLines(policy)` lê `commercialPolicy` (fonte única de preço) |
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

## Exemplo real (enviado em 11/11/2026)

```
Olá! Aqui é da Vértice Páginas Web 👋

Vi a *Buffet Don Pepe Kids* com 4,7★ no Google (232 avaliações) e reparei que vocês ainda não têm um site próprio.

A gente monta uma página simples, rápida e bonita, com botão direto pro WhatsApp e formulário de orçamento.

⭐ *A prévia é grátis*, sem custo nenhum: eu monto a primeira tela e você vê como fica antes de decidir qualquer coisa.

📦 *Essencial · R$ 900*
Uma página com até 5 seções, botão de WhatsApp e publicação.
📦 *Profissional · R$ 1.200*
Tudo do Essencial + diferenciais, depoimentos, FAQ e SEO local melhorado.

Quer que eu monte a prévia da sua página? 🚀
```

## Detalhes que parecem pequenos e não são

- **Nome longo do Google**: `shortBusinessName` corta o descritor que o Maps cola
  depois de " - " ("Buffet Don Pepe Kids - Buffet Infantil e Eventos"), senão a linha
  estoura.
- **Preço sempre da política**: `commercialPolicy` é a única fonte. O template lê
  `packages` e o agente lê `GET /api/agent/policy`. Modelo nunca "sabe" preço.
- **Curto não vira bloco**: mensagem com até 140 caracteres não é quebrada, para não
  transformar um "posso mandar?" em três linhas.
- **`whatsAppify` é idempotente**: rodar duas vezes (template + gate) não altera o texto.
