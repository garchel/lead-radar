# Intenção da resposta — híbrido regex + IA

Antes: só regex. "Pode mandar", "manda sim", "claro, pode enviar" — as respostas
mais comuns a "quer ver uma prévia?" — caíam em `outro` e o lead morria no
pipeline: não movia etapa, não criava follow-up, não gerava ficha.

Agora há duas passadas: `server/services/intentService.ts`.

## Como decide

| Passo | O que faz | Custo |
|---|---|---|
| 1. Regex | Recusa, preço e pedidos explícitos de prévia. Rápido, determinístico | zero |
| 2. IA (só se o regex deu `outro`) | Gemini classifica frases curtas/ambíguas ("manda", "claro", "beleza") | 1 chamada barata |
| 3. Limite de confiança | Abaixo de `WHATSAPP_INTENT_AI_MIN_CONFIDENCE` (default 0.6) volta para `outro` | — |

Roda **fora do caminho crítico**: o webhook responde 200 e a IA decide depois. Se
o Gemini estiver fora (503, timeout, sem chave), fica `outro` como antes — degrada,
não quebra.

## O que a IA NUNCA pode

- **Decidir recusa/opt-out.** Descadastro é LGPD: só a regra marca
  `do_not_contact`. Se a IA devolver `recusa`, o resultado é descartado.
- Sobrescrever uma decisão do regex: a IA só é consultada quando o regex não casou.
- Inventar intenção com confiança baixa: abaixo do limite, fica `outro`.

## O que cada intenção dispara

| Intenção | Pipeline | Interação | Ficha do cliente |
|---|---|---|---|
| `interesse` | → Em Negociação | follow-up pendente | ✅ gera |
| `preco` | → Em Negociação | follow-up pendente | ✅ gera |
| `recusa` | → Perdido + opt-out | — | — |
| `ocupado` | não move | — | — |
| `outro` | não move | — | — |

## Auditoria

Cada mensagem recebida guarda **como** foi classificada (colunas novas em
`communications`):

| Coluna | Exemplo |
|---|---|
| `intent` | `interesse` |
| `intent_source` | `regex` ou `ia` |
| `intent_confidence` | `0.88` |

Assim dá para responder "por que esse lead foi para negociação?" meses depois.

## Configuração

**Automação → WhatsApp → "IA para respostas ambíguas"** (setting
`automation_intent_ai`, default ligado). Desligado, fica só o regex — útil para
testar determinismo ou economizar chamadas.

Desligar "Classificar intenção automaticamente" (`automation_whatsapp_auto_intent`)
desliga as duas passadas.

## Testes

`tests/intent.test.ts` — 27 frases reais, IA mockada, e dois testes de ponta a
ponta pelo webhook: `"pode mandar"` (regex) e `"manda"` (IA) movendo o pipeline e
gravando a origem na comunicação.
