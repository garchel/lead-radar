# Pacotes comerciais (fonte da verdade do preço)

O agente de IA só pode citar os valores deste documento, porque eles estão em
`server/services/commercialPolicy.ts` (editável em `app_settings.commercial_policy`).
Qualquer valor fora daqui é reprovado pelo QA antes do envio.

## Resumo

| Pacote | Preço | Para quem | Rodadas de ajuste |
|---|---|---|---|
| **Essencial** | **R$ 900** | quem precisa existir no Google e receber contato pelo WhatsApp | 1 |
| **Profissional** | **R$ 1.200** | quem já tem concorrência na mesma região e precisa se diferenciar | 2 |
| `Premium` (proposta) | `R$ 1.800` | quem vende serviço caro e precisa de página de venda, não de cartão de visita | 3 |

Entrega: **5 a 7 dias úteis** depois da aprovação.
Prévia da primeira tela: **gratuita**, sem compromisso — é o gancho de toda abordagem.

## Essencial — R$ 900

Uma página (landing page), no ar:

- seção inicial com a chamada principal
- sobre o profissional/empresa
- serviços principais
- localização e contato
- rodapé com informações
- até 5 seções no total
- responsivo (celular, tablet e computador)
- botão de WhatsApp
- ajustes básicos de SEO (título, descrição, indexação no Google)
- publicação (site no ar)
- **1 rodada de ajustes**

## Profissional — R$ 1.200

Tudo do Essencial, mais:

- seção de diferenciais
- serviços detalhados (um bloco por serviço)
- depoimentos de clientes
- perguntas frequentes (FAQ)
- otimização de velocidade de carregamento
- SEO local melhorado (dados do negócio, bairro/cidade, Google Meu Negócio)
- **2 rodadas de ajustes**

## Premium — R$ 1.800 (proposta, a confirmar)

Tudo do Profissional, mais:

- textos escritos por nós (copywriting, não só o rascunho do cliente)
- tratamento das fotos do negócio (corte, cor, otimização)
- segunda página (ex.: página dedicada ao serviço principal)
- formulário de orçamento integrado além do WhatsApp
- **3 rodadas de ajustes** + 30 dias de ajustes após a publicação

## Duas decisões de preço (e por quê)

1. **Profissional fechado em R$ 1.200, não "R$ 1.000–1.200".** Faixa convida a
   negociar para o piso e o bot não tem como argumentar. R$ 300 a mais por quatro
   seções, FAQ, depoimentos e uma rodada extra é barato — e quem escolhe o topo
   recebe mais valor, não um desconto.
2. **O Premium existe para ancorar.** Sem ele, o Profissional é o teto e todo
   cliente negocia dali para baixo. Com R$ 1.800 na mesa, R$ 1.200 vira a escolha
   razoável.

## Conflito a resolver: o ticket do CRM

`estimateTicket()` (categoria × tier da cidade) grava `estimated_value` entre
**R$ 1.800 e R$ 3.500** em 219 leads — o dobro ou o triplo destes pacotes. Efeito:

- o "Potencial do Funil" no CRM está inflado (R$ 257k–500k na fila de 143 leads,
  quando o realista seria R$ 129k–172k a R$900/1.200);
- `analyzeLead` usa esse número como âncora de preço no prompt do pitch.

Por isso o dossiê do agente **proíbe** citar o ticket e passa só a política
comercial. Recalibrar o funil é decisão à parte (mexe em 219 registros e no
painel) — não foi feito junto com o agente.
