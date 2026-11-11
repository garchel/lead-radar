# Qualificação de leads: o que entra, o que é abordado e por quê

Regras implementadas para elevar a chance de conversão. Tudo medido no banco real.

## O problema que isso resolve

| Sintoma medido (antes) | Efeito |
|---|---|
| 114 de 156 leads com score **exatamente 100** (92% entre 90–100) | o score não ordenava nada: o D0 escolhia no escuro |
| 42 telefones **fixos** + 13 sem telefone (35% do banco) | tentativa de abordagem sem WhatsApp |
| 12 envios falhados no **mesmo** número | retry insistindo em número inválido |
| 60 rótulos do Google para 19 nichos pesquisados | impossível saber qual nicho converte |

## 1. Score por média ponderada (sem teto artificial)

`server/services/leadQuality.ts → computeLeadScore`

```
score = 100 × (0,30·presença + 0,20·avaliações + 0,15·nota
              + 0,15·propensão do nicho + 0,10·tier da cidade + 0,10·telefone)
```

- **presença**: sem site 1,0 · só rede social 0,8 · só marketplace 0,7 · com site 0,2
- **avaliações**: escala log (0 → 0; 10 → 0,5; 50 → 0,8; 200 → 1,0)
- **nota**: (nota − 3) ÷ 2 — 5,0★ → 1,0; 4,0★ → 0,5; sem nota → 0,35
- **nicho**: propensão cadastrada ÷ 100 (95 → 0,95)
- **tier**: A 1,0 · B 0,75 · C 0,5 · D 0,2
- **telefone**: WhatsApp confirmado 1,0 · celular 0,85 · fixo 0,3 · sem telefone 0

Níveis: **≥ 75 alto**, **55–74 médio**, **< 55 baixo**.

Resultado no backfill da base (165 leads): faixa **48–88**, nenhum em 100 —
57 altos, 100 médios, 8 baixos. Antes: 114 empatados no teto.

O backfill roda uma vez no boot (`leadScoreBackfill.ts`, guardado por
`lead_score_version` nas configurações).

## 2. Portão de qualidade na entrada

`passesQualityGate` — só rejeita com **evidência**:

| Rejeita quando | Por quê |
|---|---|
| tem site próprio (`has_website`) e o filtro está ligado | não é o nosso produto |
| `reviewsCount === 0` | negócio sem nenhuma avaliação costuma estar inativo |
| `rating < minRating` (default 4,0) | reputação ruim = chance baixa de pagar |

Dado **ausente passa** (sem nota, sem contagem): no Google Maps isso é comum e
barrar cortaria volume sem ganho real.

`autopilot_settings` ganhou `minRating`, `requireAnyReview` e `requireWhatsApp`.

## 3. WhatsApp validado antes da abordagem

`whatsappValidationService.ts` usa `POST /v1/chat/whatsappNumbers/{instância}` do
gateway: consulta de **existência**, não envia mensagem e **não gasta cota SerpAPI**.

- Roda sozinho para os leads recém-salvos por cada pulso do autopilot.
- Manual: card **Qualificação dos leads** em *Canais & APIs* → botão
  "Validar N pendente(s)" (lotes de 20, limite 100 por chamada).
- `POST /api/leads/whatsapp/validate` e `GET /api/leads/whatsapp/summary`.

Medido na base: **115 com WhatsApp (70%) · 37 sem (22%) · 13 sem telefone (8%)**.
Entre os 47 fixos, **13 têm WhatsApp Business** — por isso a regra não é "fixo
nunca", é "fixo só com validação".

## 4. Quem pode receber D0

`isReachableOnWhatsApp` + histórico de falhas:

- WhatsApp `no` → nunca;
- celular → sim (mesmo sem validação), salvo `requireWhatsApp` ligado;
- fixo → só se validado `yes`;
- **2 ou mais envios falhados** para o lead → sai da fila (`countFailedCommunications`).

Efeito medido: **137 → 104 candidatos (-24%)**. Os 5 melhores agora são leads
com WhatsApp confirmado e score 83–88 — antes seria um sorteio entre 114 empatados
no topo.

## 5. Nicho buscado gravado (`search_category`)

Novo campo no lead, preenchido com o nicho da busca (sempre um dos 19 cadastrados).
O campo `category` continua sendo o rótulo do Google ("Escritório da empresa").

Serve para a próxima etapa: medir **taxa de resposta por nicho e por cidade** e
trocar a rotação fixa por prioridade baseada em resultado.

## Pontos de atenção

- Leads antigos não têm `search_category` (só os coletados daqui pra frente) —
  a análise por nicho começa a valer com o volume novo.
- A validação depende do gateway no ar; sem ele o card mostra erro e o D0 cai
  para a regra do celular.
- `requireWhatsApp = false` por padrão: validação é assíncrona e não pode travar
  a prospecção se o gateway oscilar. Se quiser rigor total, ligue a opção.
