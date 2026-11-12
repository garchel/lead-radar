# Documentos do cliente: proposta, onboarding, marcos e relatório

Quatro peças que transformam conversa em contrato e site entregue em relação
recorrente. Todas usam o mesmo princípio: **nada inventado** — valor e prazo vêm
da política comercial, números vêm do banco.

## 1. Proposta em PDF

`GET /api/leads/:id/proposal.pdf` (`?pacote=essencial` escolhe outro pacote)

- 2 páginas A4: capa com logo e escopo, depois direção visual, cronograma e condições.
- Propõe o **pacote de maior valor** (ancora) e oferece o outro como opção.
- Prazo e valor saem de `commercialPolicy` — nunca digitados no código.
- CTA desenhado e **clicável** (`doc.link`) para `wa.me` do lead.
- Validade de 7 dias, repetida nas duas páginas.
- `?previa=0` omite o link da prévia (proposta sem prévia publicada).

**Pitfall do pdfkit:** texto desenhado abaixo da margem inferior (rodapé em
`page.height - 56`) faz o pdfkit **abrir páginas extras** silenciosamente — a
proposta saía com 5 páginas. Rodapé precisa caber acima de `height - margin.bottom`.
Confira a contagem com `(/Type\s*\/Page[^s])`.

## 2. Onboarding do cliente

`GET /api/projects/:id/onboarding` · `POST /api/projects/:id/onboarding/send`

O checklist é **derivado**, não digitado: logo (confiança da IA), 3+ fotos,
2+ serviços, horário, endereço, domínio. Cada item pendente vira uma frase de
pedido na mensagem. Painel: `ProjectOnboardingPanel` dentro do `ProjectModal`.

## 3. Marcos proativos

Mudar etapa no kanban (`PATCH /api/projects/:id` com `stage` ou
`POST /api/projects/:id/stage`) dispara `notifyProjectMilestone`, que envia uma
mensagem por etapa (copywriting → deploy) em segundo plano.

Idempotente: a tabela `project_milestones(project_id, stage)` impede repetir o
mesmo aviso. `briefing` não tem mensagem de propósito.

## 4. Relatório mensal

`GET /api/leads/:id/monthly-report.pdf?mes=2026-11` · fila: `GET /api/reports/monthly`

- Números reais do período: mensagens recebidas, respondidas, mediana do tempo de
  resposta, dias com conversa, nota do Google, situação do site.
- "O que dá para melhorar" é gerado a partir dos números (sem resposta rápida,
  zero mensagens, sem avaliações) + a oferta de manutenção.
- Cron `832950d0da81` roda dia 1º às 9h e manda o **resumo ao Paulo**; envio ao
  cliente é manual de propósito, porque número errado em relatório queima confiança.

## O que ainda não medimos

Visitas e cliques no site publicado exigem analytics no site do cliente
(Cloudflare Web Analytics, sem cookie). Quando entrar, os números precisam citar
a fonte no próprio PDF.
