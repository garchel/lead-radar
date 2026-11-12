# Agente comercial de IA (WhatsApp)

Quem aborda, quem conversa e por que ele fala assim. Substitui a ideia de
"template + cron respondendo no escuro" por um agente único dentro do app, com
dossiê por lead e um portão que impede invenção.

## Fluxo

```
lead no SQLite
   ↓
briefingService        fatos verificados + o que ele perde + o que NÃO citar + histórico
   ↓
salesAgentService      Gemini escreve UMA mensagem (abordagem | cadência | resposta)
   ↓
checkAgentText (QA)    preço autorizado? link? textão? emoji? saudação repetida?
   ↓  (reprova → 1 nova tentativa com a correção explícita)
humanização            janela, digitação, pausa, tetos (humanizeService — não muda)
   ↓
envio + registro (communications.hook, intent, interaction)
```

Se a IA falhar (503, timeout, sem chave) ou o texto for reprovado duas vezes,
entra o **texto determinístico** (`fallbackApproachMessage` / `fallbackReplyMessage`),
com a mesma estrutura: fato + perda + pergunta. O agente nunca fica mudo.

## Onde ele age

| Momento | Gatilho | Código |
|---|---|---|
| **D0** (primeiro contato) | pulso do autopilot, 1 por tick, `autoProspect` ligado | `autoProspectingService.prospectBestLead` → `approachLead` |
| **D+3 / D+7** | cadência (só quando a IA devolve texto aprovado; senão texto do plano) | `cadenceService.runCadence` → `composeCadenceMessage` |
| **Resposta** | webhook recebe inbound (exceto recusa/opt-out) | `whatsappWebhookRoutes` → `answerLead` |

`answerLead` só responde conversa **aberta** (última mensagem é do lead) — sem
essa guarda o `dispatchLeadReply` cai em `dispatchLeadContact` e viraria uma
abordagem no meio da resposta.

## O dossiê (`GET /api/leads/:id/briefing`)

Três caixas, e o prompt só pode usar as duas primeiras:

1. **Fatos verificados** — nota, nº de avaliações, categoria buscada, presença
   (sem site / só rede social / só marketplace), bairro, ramo.
2. **O que ele perde** — a consequência concreta ("quem pesquisa barbearia em
   Setor Bueno encontra os concorrentes primeiro").
3. **NÃO CITE** — ticket estimado do CRM, CNPJ/endereço/ficha, ficha ou marca
   com `confidence < 0,5`.

Mais: histórico (últimos 8 envios, falhas fora), objetivo deste toque, e o que
ainda falta saber (vira **uma** pergunta por mensagem).

O objetivo é calculado, não escolhido pelo modelo:

| Estado | Objetivo |
|---|---|
| 0 toques | abrir conversa — conseguir um "pode mandar" |
| 1 toque | segundo toque — a prévia gratuita (algo concreto) |
| 2 toques | terceiro e último — pergunta de saída honesta |
| última msg é dele | responder o que ELE perguntou |

## Portão de qualidade (`checkAgentText`)

Reprova e manda reescrever:

- preço em reais fora dos pacotes autorizados (`R$ 2.500` é alucinação);
- link, `www.`, `.com.br`;
- mais de 420 caracteres (abordagem) ou 360 (resposta);
- emoji, "prezado/estimado", "cordialmente";
- dizer que é bot, IA, assistente virtual ou automação;
- abordagem sem pergunta;
- saudação repetida ("Oi, tudo bem?" pela terceira vez) e mensagem idêntica à anterior.

> Cuidado ao mexer em regex de emoji: `U+2600–27BF` inclui **★**, que é parte
> legítima do gancho ("5★ no Google"). A faixa usada é `U+1F000–1FAFF`.

## Política comercial (a única fonte de preço)

`server/services/commercialPolicy.ts` — pacotes, prazo, prévia grátis, desconto.
Vive em `app_settings` (`commercial_policy`, JSON parcial) e é editável por API
sem reiniciar:

```
GET  /api/agent/status     # ligado? preço mínimo? prazo? autoProspect?
GET  /api/agent/policy
PUT  /api/agent/policy     # { "price": 900 } ou pacotes completos
PUT  /api/agent/settings   # { "enabled": false } desliga o agente
POST /api/agent/draft      # { leadId, kind: "approach"|"reply", text? } → rascunho SEM envio
```

O que o agente pode dizer sobre preço: **"a partir de R$ 900"** (pacote mais
barato) + **prévia da primeira tela gratuita**. Nunca desconto. Nunca abre o
pacote maior sem o lead pedir mais. Prazo: 5 a 7 dias úteis após a aprovação.

## Como testar sem sujar a base

```bash
# 1. o que ele escreveria para um lead (não envia nada)
curl -s -X POST http://localhost:3000/api/agent/draft \
  -H "Content-Type: application/json" \
  -d '{"leadId":"pv-landing-1","kind":"approach"}'

# 2. resposta simulada a "quanto custa?"
curl -s -X POST http://localhost:3000/api/agent/draft \
  -H "Content-Type: application/json" \
  -d '{"leadId":"pv-landing-1","kind":"reply","text":"quanto custa?"}'

# 3. dossiê que ele recebeu (auditoria)
curl -s "http://localhost:3000/api/leads/pv-landing-1/briefing" | python -m json.tool
```

## Quem responde: o bot Clara (e o app só se ela cair)

A partir de nov/2026 o WhatsApp é operado por um **bot Hermes** (profile `clara`), com rotina
de 1 minuto. O compositor interno continua existindo como **rede de segurança**.

| Peça | Papel | Como fica |
|---|---|---|
| Bot `clara` | **dono do WhatsApp** — lê o dossiê, escreve, envia | rotina `[bot:clara] WhatsApp: responder lead`, `every 1m`, monitor `leadradar-inbox-monitor.py` |
| Bot `debs` | construtor de LP, pega a fila por rotina | rotina `[bot:debs] Construir landing page aprovada`, `every 10m`, monitor `leadradar-project-monitor.py` — criada PAUSADA |
| App (webhook) | auto-resposta | **desligado** (`automation_agent_enabled=false`) para não responder junto com a Clara |
| App (watchdog) | responde o que a Clara deixou passar | `agentWatchdog.ts`, tick de 2 min, idade mínima 6 min, máx. 3 conversas por pulso |

O handoff entre os dois bots é o **banco**, não chat: a Clara move o lead para
`em_desenvolvimento` e a `debs` pega pela fila. Conversa entre bots fica reservada para
exceção (dúvida de escopo), onde o Bot Mode é bom.

### Portão de código para texto de agente

Quando o corpo do envio traz `source: "agent"`, `POST /api/leads/:id/reply` e
`POST /api/leads/:id/contact` rodam `checkAgentText` **antes** de enviar e devolvem:

- **422** com `issues` (preço fora dos pacotes, link, emoji, textão, saudação repetida,
  quantificador não comprovável) — o texto não sai;
- **200** — sai normalmente, com humanização e registro.

Sem `source: "agent"` (UI, retry, rotina legada) o comportamento antigo é preservado.

## Ligar/desligar

| Interruptor | Onde | Efeito |
|---|---|---|
| Rotina da Clara | `hermes -p clara cron pause 5394f8be9263` | liga/desliga o dono do WhatsApp |
| `automation_agent_fallback` | `app_settings` | rede de segurança do app (default ligado) |
| `automation_agent_fallback_minutes` | `app_settings` | idade mínima para o app responder (default 6) |
| `automation_agent_enabled` | `PUT /api/agent/settings` | auto-resposta do **app** no webhook (mantenha `false` com a Clara ativa) |
| `autoProspect` | `PUT /api/autopilot/settings` | liga/desliga **D0 automático** (sem ele, o agente só responde) |
| `automation_cadence_enabled` | Automação | liga/desliga D+3/D+7 |
| humanização | Automação → Humanização | janela, pausa, tetos (60/dia, 30 novos/dia) |

**Não ligue `autoProspect` e o cron antigo de resposta ao mesmo tempo.** O job Hermes
`8765e77ed0b5` ("WhatsApp: responder lead") fazia o que `answerLead` faz agora — com dois
respondendo, o lead recebe duas mensagens. Ficou pausado, e o dono do WhatsApp é a Clara.

## Custos e latência

- 1 chamada Gemini por mensagem (2 se o QA reprovar). Sem cache: conversa muda de
  contexto a cada resposta.
- Resposta leva o tempo da IA (`GEMINI_AGENT_TIMEOUT_MS`, padrão 30s) **mais** a
  humanização (digitação até 12s + pausa 45–120s). Total real: ~1 a 2,5 min.
- Fallback de modelo: `GEMINI_AGENT_FALLBACK_MODEL` (senão `GEMINI_PROFILE_FALLBACK_MODEL`
  → `gemini-3.1-flash-lite`). Erro de capacidade tenta o próximo; erro definitivo
  degrada para o texto determinístico.

## Ciclo completo (P0, nov/2026)

Antes disso a conversa funcionava, mas o ciclo em volta não: ninguém abordava, ninguém
insistia e a prévia prometida não existia. O que mudou:

| Peça | Como funciona agora |
|---|---|
| **Primeiro contato** | rotina `[bot:clara] Prospecção: primeiro contato` (`every 20m`, monitor `leadradar-prospect-monitor.py`). O script só acorda a Clara dentro da janela (seg–sex 8–18h), abaixo do teto do dia, com candidato elegível. Um contato por execução. |
| **Follow-up D+3/D+7** | `ensureDefaultCadenceSchedule()` cria `sch_default_cadence` (`0 9 * * 1-5`, `dryRun:false`, `limit:10`) no boot. Antes, `runCadence` só rodava por job manual. |
| **Prévia** | `POST /api/leads/:id/preview` gera `data/previews/<id>.html` a partir do cadastro + ficha (determinístico, sem IA) e serve em `/previews/<id>.html`. Só vai ao cliente com `PUBLIC_BASE_URL` configurado. |
| **Motivo da falha** | `communications.error_detail` guarda por que o envio falhou (gateway, janela, teto, encoding). E `dispatchLeadContact` bloqueia nova abordagem após 2 falhas — em qualquer porta, não só no autopilot. |

### `PUBLIC_BASE_URL` (o que falta para a prévia sair)

O link só abre no celular do cliente se o servidor tiver endereço público. Opções, da mais
simples: túnel (`cloudflared tunnel --url http://localhost:3000`), um subdomínio seu, ou
publicar as prévias num host estático. Defina no `.env`:

```
PUBLIC_BASE_URL=https://previa.seudominio.com.br
```

Sem isso, `POST /preview` devolve `publicUrl: null` **e um aviso** — a Clara está instruída a
não inventar link e a reportar para o Paulo.

### Rampa de aquecimento

O monitor usa `min(autopilot_settings.dailyNewCap, 30)` e cai para **12/dia** quando o
autopilot não define nada. Número novo começando no teto de 30 é o caminho mais curto para
restrição — suba a escada: 8–12 (semana 1) → 15–20 → 25–30 só com entrega ≥95% e opt-out <2%.

## Aquecimento do número (rampa de volume)

`server/services/warmupService.ts` — `GET/PUT /api/warmup`.

Número novo não pode começar em 30 contatos/dia. O teto de contatos novos vira uma escada:

```
cap do dia = min(maxCap, startCap + incremento × (diaAtivo − 1))
padrão:      5, 6, 7, 8, ... até 30      (maxCap)
```

**"Dia ativo" é dia com abordagem enviada — não dia de calendário.** Parar duas semanas e
voltar não pode te colocar em "dia 15" sem ter aquecido nada; o contador só anda quando há
envio. (Resposta de conversa não conta; só `hook` de abordagem.)

Freios que travam a subida (o cap repete o de ontem):

| Sinal (24h) | Efeito |
|---|---|
| 3+ falhas de envio | teto congelado |
| 1+ pedido de saída (opt-out) | teto congelado |

O teto efetivo é `min(warmup, automation_humanize_daily_new_cap)` — ou seja, o aquecimento
nunca *aumenta* o limite, só reduz. A rampa chega a 30 em 25 dias ativos.

Ajuste (sem reiniciar):

```bash
curl -s -X PUT http://localhost:3000/api/warmup -H "Content-Type: application/json" \
  -d '{"startCap":5,"dailyIncrement":1,"maxCap":30}'
curl -s http://localhost:3000/api/warmup   # dia da rampa, teto de hoje, freios, dias restantes
```

O monitor de prospecção da Clara **não recalcula** a rampa: lê `GET /api/warmup` e fica em
silêncio se o app estiver fora. Duas cópias da fórmula é como o número leva restrição.
