# Prospecção por WhatsApp: quem abordar, como abordar e com qual mensagem

Análise feita sobre a base real do CRM (222 leads, medida em 11/11/2026) e sobre o que o
código já faz hoje (`autoProspectingService.buildProspectMessage`, `cadenceService`,
`humanizeService`). Serve como plano operacional da abordagem — não é especulação de blog.

---

## 1. O retrato real da base (o que decide a estratégia)

| Fato medido | Número | Consequência para a abordagem |
|---|---|---|
| Leads no CRM | 222 | volume pequeno: **qualidade por mensagem > quantidade** |
| Ainda em `prospect` (nunca contatados) | 218 | base intacta, dá para desenhar o primeiro toque do zero |
| Sem site próprio | 212 | o produto (LP) resolve uma dor real e verificável |
| Só rede social / só marketplace | 7 + 3 | gancho diferente: "você depende do Instagram/marketplace" |
| Score 80–100 | 60 | fila VIP para o primeiro toque |
| Score 60–79 | 144 | fila padrão |
| Avaliação ≥ 4,5★ | 183 | **prova social deles, não nossa** — é a matéria-prima do gancho |
| Com ≥ 10 avaliações | 133 | dá para citar número específico ("47 avaliações") |
| WhatsApp **confirmado** (`whatsapp_status='yes'`) | **154** | 139 celulares + **15 fixos com WhatsApp Business** |
| Fixo sem WhatsApp | 47 | **não** é descarte: é ligação → depois WhatsApp |
| Sem telefone | 15 | fora do canal, guardar para e-mail/Instagram |
| Prontos pela régua atual (prospect + score ≥60 + WhatsApp ok) | **143** | ≈ R$ 257k–500k de ticket estimado nominal |
| Têm `key_insights` | 219 | …mas os 3 bullets são **idênticos em todos** (ver §2) |
| Têm análise com pitch próprio (`analysis.customPitchWhatsApp`) | **1** | ou seja: 221 leads recebem o mesmo texto genérico |
| Interações reais de prospecção feitas até hoje | 13 tentativas, 12 falharam no mesmo número | a base nunca foi realmente trabalhada |

Leitura estratégica: **temos a dor certa, a prova social do cliente e o número validado — e
estamos mandando o mesmo parágrafo para todos.** O gargalo não é volume, é personalização real
e o mix de canal (40% da base é fixo, e fixo se aborda por voz).

---

## 2. Diagnóstico do primeiro toque que o app manda hoje

Mensagem atual (`buildProspectMessage`, usada em 221 de 222 leads):

> Olá! Aqui é da Vértice Páginas Web. Vi a **Clínica Belo Sorriso** com 5★ no Google e reparei
> que ainda não tem um site próprio — dá pra resolver com uma página simples, com botão direto
> pro WhatsApp. Quer que eu te mostre como ficaria?

O que está certo: curta, sem link, sem anexo, identifica a empresa, cita fato verificável
(nota do Google), termina com pergunta. Isso já está acima da média do mercado.

O que limita a resposta:

| Problema | Efeito prático |
|---|---|
| **Abre falando de nós** ("Aqui é da Vértice") antes do cliente | o dono lê "vendedor" nos 4 primeiros segundos |
| **Mesma frase em 221 números** | padrão de disparo em massa — é o que mais alimenta bloqueio/denúncia |
| Diz **o que fazemos**, não **o que ele perde** | não há urgência: "site" é adiável; "cliente que te procurou foi para o concorrente" não |
| Pergunta é "quer que eu te mostre como ficaria?" | convite vago, custa imaginação. Pergunta de cenário converte melhor |
| `key_insights` é genérico (3 bullets iguais em 219 leads) | a "personalização" que o sistema acha que tem não existe na prática |
| Fixo entra na fila de WhatsApp só se validado | 47 leads ficam parados sem plano B |

E um dado operacional que precisa de atenção independente da estratégia: **12 comunicações
`failed` para o mesmo número (Clínica Belo Sorriso) em ~10 minutos** em 10/11. A regra
"2 falhas → fora da fila" protege o autopilot, mas algum caminho (retry manual/outbox) furou.
Insistir em número que recusa é o jeito mais rápido de tomar restrição.

---

## 3. Segmentação: três trilhos, não um

O "tipo de contato" muda com o dado que temos do lead. Segmentar por canal é o que mais
aumenta o aproveitamento da base.

### Trilho A — WhatsApp direto (154 leads; 143 prontos)
WhatsApp confirmado (celular ou fixo com WhatsApp Business). **Canal primário, texto curto.**

- Cadência: D0 → D+3 → D+7 (a do app), máx. 3 toques, para no primeiro sinal de conversa.
- Meta por toque: **1 mensagem, 1 pergunta, sem link no primeiro contato.**
- Ordem: score ≥80 primeiro; entre iguais, os de **categoria com propensão alta**
  (Salão/Barbearia 83,7 · Auto Center 82,8 · Buffet & Eventos 82,1 · Academia & Pilates 79,3
  — médias reais medidas) e cidades tier A/B.

### Trilho B — Ligação curta → WhatsApp (47 fixos sem WhatsApp)
Fixo é canal de voz: o dono atende, o WhatsApp não existe. Não descartar.

- Objetivo da ligação **não é vender**: é (1) confirmar quem cuida do marketing e
  (2) pedir o celular/WhatsApp: *"posso te mandar no WhatsApp um print de como ficaria?"*
- Duração alvo: 40 segundos. Se atender recepção, pedir "o nome de quem cuida do site/marketing".
- Ao conseguir o número: entra no Trilho A como lead novo (com a memória da ligação na 1ª linha).
- Se não atender 2x em horários diferentes: 1 áudio de WhatsApp para o fixo é inútil — vai para e-mail/Instagram.

### Trilho C — Instagram / e-mail (7 `social_only` + 15 sem telefone)
Quem já vive na rede social responde DM. Gancho obrigatório: o que ele perde por não ter site
próprio (não é "faça um site", é "seu link na bio leva para um perfil, não para orçamento").
Sem telefone, e-mail é o único canal — e é canal de **baixa** prioridade (não gastar tempo).

---

## 4. A mensagem: estrutura de 3 linhas + 1 pergunta

Formato que funciona em prospecção por WhatsApp (e que cabe na tela sem rolar):

```
[1] identificação + FATO ESPECÍFICO do negócio dele
[2] a perda concreta em linguagem de dinheiro/cliente
[3] micro-compromisso (baixíssimo esforço pra ele)
[?] uma pergunta fechada, respondível em 5 segundos
```

Regras duras:

- **≤ 50 palavras** (mensagens longas perdem ~3x de taxa de resposta).
- **Zero link, zero anexo, zero áudio no D0.** Link e material só depois que ele responde.
- **Nada de "prezado"**: escreve como se fala ("Oi, Carlos").
- **Uma pergunta só.** Duas perguntas = ele responde nenhuma.
- Nunca **"tudo bem?"** seguido de pitch no mesmo balão — ou usa "tudo bem" sem vender, ou vende sem "tudo bem".
- Nunca cite dado que pareça vigilância (CRM/CRO, sócio, endereço exato). Use o que é público e
  orgulhoso para ele: **nota e número de avaliações**.

### Exemplos por segmento (substituindo o genérico)

**Clínica / consultório (saúde e estética)**
> Oi, Dra. Ana — vi que a Clínica Belo Sorriso tem 5★ com 47 avaliações no Google, mas quem
> pesquisa "clínica em [bairro]" cai em site de concorrente, porque vocês não têm página própria.
> Montei a primeira tela de uma pra vocês, com botão de agendamento. Te mando o print?

**Beleza / barbearia**
> Oi, Rafael — a Pianca Barbearia aparece com 5★ no Google, só que sem site o cliente novo
> precisa ligar pra saber preço e horário. Isso derruba agendamento no fim de semana.
> Posso te mostrar uma página simples com horário, serviços e botão de WhatsApp?

**Serviço local (auto center, manutenção, reforma)**
> Oi, tudo bem? Vi a Via Kennedy Auto Center com 4,6★ e 32 avaliações — reputação boa,
> mas sem site quem procura "oficina em [bairro]" no Google vê os concorrentes primeiro.
> Tenho uma prévia de página com orçamento por WhatsApp. Quer ver?

**Buffet / eventos (decisão visual e por data)**
> Oi, [nome] — o Quintal dos Sonhos tem 4,8★ no Google, e buffet é decisão no visual:
> sem site, a foto boa não aparece pra quem está pesquisando data. Montei uma prévia
> com galeria e pedido de orçamento. Te mando?

Note o padrão: **o nome dele + a nota dele + o que ele perde + uma pergunta que se responde
com "manda"**. É o mesmo esqueleto do código atual, mas o fato vem primeiro e a perda é explícita.

### Sobre mandar a prévia da landing page
Esse é o diferencial mais forte que o projeto tem e o menos usado: o CRM já sabe gerar LP
(`sites/`, `LandingPrototypeModal`). "Quer que eu monte um site pra você" é venda;
**"já montei a primeira tela da sua página, olha"** é entrega. Recomendação: para o lote dos
top 20, **gerar a prévia antes do D0** e usar o print como o "sim" da conversa.
Não no primeiro balão (anexo no D0 aumenta risco de bloqueio) — no segundo, quando ele responder.

---

## 5. Cadência: o que manter e o que mudar

O que já está implementado e está correto (`cadenceService`):

| Toque | Quando | Ângulo atual |
|---|---|---|
| D0 | primeiro contato | gancho (sem site / sem reputação) |
| D+3 | 3 dias depois | **prova** ("montei uma prévia, posso mandar?") |
| D+7 | 7 dias depois | **prazo** ("vou fechar a agenda na sexta") |

Duas correções que eu faria:

1. **D+7 com prazo fabricado é fraco e repetido.** "Vou fechar a agenda na sexta
   (data)" em 100% dos leads é escassez artificial — se ele já ignorou dois toques, o
   terceiro deve ser **pergunta de saída honesta**, que é a que mais gera resposta tardia:
   > "Oi, [nome] — imagino que site não seja prioridade agora. Fecho seu contato por aqui
   > então? Se um dia fizer sentido, é só me chamar."
   Isso também funciona como opt-out limpo (e o webhook já trata recusa → `do_not_contact`).
2. **Falta um 4º toque de valor em D+14** (um case: "olha o antes/depois de um [mesmo nicho]")
   antes de considerar frio. Hoje o limite é 3 toques (`MAX_CADENCE_ATTEMPTS = 3`).
   Se não quiser mexer no limite, o `cold_leads_review` (14+ dias) já cobre — mas com
   **recontato manual autorizado**, nunca automático.

Regra que não se mexe: **para no primeiro sinal de conversa** e respeita opt-out (LGPD).
Quem responde "não tenho interesse" nunca mais é tocado — e isso já está no código.

---

## 6. Horário, ritmo e aquecimento do número

O portão de humanização já impõe: prospecção só **8h–18h, seg–sex**; respostas 7h–20h;
pausa de 45–120s entre envios; teto de 60/dia e **30 contatos novos/dia**. A recomendação
é não usar o teto no começo:

| Fase | Contatos novos/dia | Por quê |
|---|---|---|
| Semana 1 | 8–12 | número ainda "novo": rajada = restrição. Aquecimento é responder inbound e variar texto |
| Semana 2 | 15–20 | já há histórico de conversa e taxas de entrega |
| Semana 3+ | 25–30 (teto) | só se entrega ≥ 95% e opt-out < 2% |

Dentro da janela, priorizar **terça a quinta, 9h–11h e 14h–17h**. Evitar segunda de manhã
(caixa lotada do fim de semana) e sexta depois das 16h. Pequeno comércio almoça 12h–13h30.

Sobre o tempo de resposta: **responder em minutos é o maior alavancador de conversão** que
existe nesse canal (quem pergunta preço e espera 3h já falou com outro). O app já tem
classificador de intenção híbrido e ficha do cliente disparando no interesse — o que falta é
alguém (ou o bot de atendimento, job `monitor`) olhando o inbox na janela comercial. Uma
resposta em 5 minutos vale mais que 10 D0s novos.

---

## 7. Compliance (o que limita a estratégia, dito sem rodeio)

- **Meta Cloud API oficial**: fora da janela de 24h, só com **template aprovado e opt-in
  prévio**. Prospecção fria por API oficial é, na prática, proibida pela política da Meta.
  Por isso a base é trabalhada no **gateway não-oficial** (WhatsMiau/Evolution).
- Consequência direta: **o risco de restrição do número é real e é nosso.** Baixo volume,
  texto diferente por lead, sem link/anexo no D0 e opt-out imediato não são "boas práticas":
  são o que mantém o número vivo.
- **LGPD**: contato B2B com CNPJ/telefone comercial publicado pode se apoiar em legítimo
  interesse, mas exige (a) finalidade clara na primeira mensagem, (b) opt-out fácil e
  (c) registro de tudo. O CRM já faz (b) e (c) — `do_not_contact`, `communications` com
  intenção e fonte. Falta apenas citar quem somos **na primeira linha sem parecer anúncio**
  (o que a estrutura do §4 já faz).
- **Nunca** disparo em massa com o mesmo texto: além do ban, é o que mais gera denúncia.

---

## 8. Métricas: o que medir para saber se a estratégia funciona

| Métrica | Como medir | Alvo inicial |
|---|---|---|
| Taxa de entrega | `communications.status='sent'` ÷ tentativas | ≥ 95% |
| Taxa de resposta | inbound ÷ outbound por coorte de D0 | **15–25%** (base local qualificada) |
| Taxa de "manda a prévia" | intent `interesse` ÷ respondidos | ≥ 50% |
| Prévia → orçamento | `pipeline_status` `negociando` → projeto | ≥ 25% |
| Opt-out | `do_not_contact` ÷ contatados | < 2% |
| Tempo até 1ª resposta | `last_response_at − last_contact_at` | < 30 min |
| Resposta por gancho | campo `communications.hook` (já existe: `sem_site`, …) | escolher o que mais responde |

O campo `hook` já está gravado em cada comunicação — dá para A/B de gancho **sem código novo**,
só comparando coortes no banco. Sem esse número, qualquer "melhor mensagem" é opinião.

---

## 9. O que mudar no código (ordem de impacto)

1. **Gancho calculado por lead** — `buildProspectMessage` hoje ignora `key_insights`,
   `reviews_count`, `category`, `neighborhood`. Trocar o template fixo por composição com
   esses campos (determinística, sem custo de IA) resolve a "mesma frase em 221 números".
2. **Rodar `analyzeLead` só no topo da fila** (score ≥ 80, ~60 leads) antes do D0, para ter
   `customPitchWhatsApp` — hoje 1 de 222. Cuidado: Gemini 503 é recorrente, precisa de reserva
   e não deve bloquear o envio (cai no template composto).
3. **Prévia da LP para o lote dos top 20** antes do primeiro contato (ativa o "já montei").
4. **Trilho de ligação para os 47 fixos** — nem que seja uma lista de trabalho manual com
   script de 40s; hoje esses leads simplesmente não existem para o sistema.
5. **D+7 como pergunta de saída** (texto honesto) e **bloqueio de retry** no mesmo número após
   2 falhas — o caso das 12 falhas em 10 minutos não pode repetir.
6. **Priorização por slot** (ter–qui, 9–11h/14–17h) dentro da janela que já existe.
