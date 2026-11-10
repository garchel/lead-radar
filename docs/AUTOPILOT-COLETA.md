# Autopilot de coleta (cota SerpAPI)

Coleta automática de leads que respeita o limite mensal da SerpAPI, enche o banco
aos poucos e, depois, prospecta os melhores leads encontrados.

## Por que existe

A SerpAPI tem cota mensal (plano free: 250 buscas/mês, 50/hora). Gastar tudo no
primeiro dia deixa o mês inteiro sem descoberta de leads. O autopilot divide o que
sobrou pelos dias que faltam e espaça as buscas dentro do dia.

## A conta

```
buscas por dia   = cota restante ÷ dias restantes do ciclo   (arredonda para baixo)
intervalo (min)  = horas da janela × 60 ÷ buscas por dia    (piso de 6 min)
```

Exemplo real (cota 250, 207 restantes, 12 dias para renovar, janela 8h–22h):

```
buscas por dia = 207 ÷ 12 = 17
intervalo      = 14h × 60 ÷ 17 = 49 min
```

O cálculo é **autocorrigido**: dia sem busca aumenta o orçamento do dia seguinte;
dia gastando demais diminui os próximos. Busca que vem do cache (7 dias) **não**
entra no orçamento — só conta a que consumiu cota de verdade.

## Fluxo

1. **Abrir o app** → `POST /api/autopilot/arm` (feito automaticamente pelo `App.tsx`)
   arma o autopilot por 8 horas.
2. **Pulso de 1 minuto** (servidor, `setInterval` em `server.ts`) → `autopilotTick()`:
   - se o orçamento do dia acabou, a janela está fechada ou o intervalo não passou,
     não faz busca (mas ainda pode mandar um D0 pendente);
   - senão roda **uma** busca: 1 cidade da rotação IBGE (filtros de população/UF)
     × 1 categoria (rotação pelas de maior propensão).
3. **Salva** os leads que **não têm site próprio** (`websiteStatus !== 'has_website'`),
   com `pipeline_status = prospect`, e marca a cidade como buscada.
4. **Prospecção**: a cada pulso, manda **um** D0 para o lead de maior
   `opportunityScore` que esteja parado em `prospect`, com telefone, sem contato
   anterior e score ≥ mínimo. A mensagem usa `analysis.customPitchWhatsApp` quando
   existe; senão monta um texto curto com nome, nota e a lacuna de site.
5. O envio passa pela **humanização** (janela 7–20h, digitação, pausa 45–120s,
   teto de 30 contatos novos/dia) — o autopilot nunca fura esse portão.

## Travas (todas configuráveis na UI)

| Trava | Padrão | Efeito |
|---|---|---|
| Coleta automática | ligada | desliga sem apagar nada |
| Prospectar os melhores | ligada | desliga só o D0 automático |
| Score mínimo | 60 | D0 só acima disso |
| D0 por dia (autopilot) | 10 | teto próprio, abaixo dos 30 da humanização |
| Janela de buscas | 8h–22h | fora dela não gasta cota |
| Faixa populacional | 30k–200k | foco em cidade média |
| Não salvar quem tem site | sim | mantém o banco útil |

## Endpoints

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/autopilot/status` | plano do dia, orçamento, armado, candidatos |
| POST | `/api/autopilot/arm` | app abriu (armazena por 8h) |
| POST | `/api/autopilot/disarm` | para agora |
| PUT | `/api/autopilot/settings` | toggles, score, teto, faixa populacional |
| PUT | `/api/autopilot/window` | janela de horas |
| POST | `/api/autopilot/tick` | um pulso agora (ignora intervalo/janela) |
| POST | `/api/autopilot/run-now` | uma busca agora, sem D0 |
| POST | `/api/autopilot/reset-day` | zera contadores do dia |

## UI

Automação → card **"Autopilot de coleta (SerpAPI)"**: orçamento do dia, cota do
ciclo, intervalo, leads coletados/D0 do dia, estado do armamento, próxima busca,
quantos leads estão prontos para D0, botão **Buscar agora** e as travas.

## Detalhes de implementação

- `server/services/quotaBudgetService.ts` — matemática do orçamento + gate
  (`canRunSearch`), estado do dia em `app_settings` (`serpapi_budget_state`).
- `server/services/autoProspectingService.ts` — pulso, busca única, salvamento,
  escolha do melhor lead, armamento (`autopilot_settings` / `autopilot_state`).
- `server/routes/autopilotRoutes.ts` — API.
- `server.ts` — `setInterval(60s)` com guarda de reentrância (nunca empilha pulsos)
  e desligado em `NODE_ENV=test`.
- Testes: `tests/quotaBudget.test.ts` (matemática e travas) e
  `tests/autopilot.test.ts` (armar → buscar → salvar → prospectar → teto).
