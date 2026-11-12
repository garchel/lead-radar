# Bot de WhatsApp para cliente (RAG + escalada)

Oferta: **R$ 649 de implementação + R$ 150/mês**. O cliente fornece o que o bot
deve saber; o bot responde só com base nisso e, quando não sabe, chama o dono pelo
WhatsApp em vez de inventar.

Implementação: `server/services/botKnowledgeService.ts`.

---

## Por que RAG e não "só um prompt"

Um bot com o prompt cheio de informação do cliente inventa o que falta: preço,
horário, endereço, prazo. Numa barbearia isso vira cliente irritado na porta.

Com RAG, a resposta é montada a partir de trechos da base que **o cliente
forneceu**. Se a base não cobre, o bot não chuta: avisa o cliente que vai confirmar
e avisa o dono com a pergunta exata.

## Como funciona

1. **Base**: o cliente entrega o conteúdo (serviços, preços, horário, endereço,
   formas de pagamento, profissionais, dúvidas frequentes). Texto corrido, FAQ ou
   markdown.
2. **Fatiamento**: cada documento vira trechos de ~600 caracteres com sobreposição,
   para não cortar uma informação no meio.
3. **Indexação**: cada trecho ganha um vetor (`gemini-embedding-001`, 768 dimensões).
   Fica em SQLite (`bot_chunks`), por cliente.
4. **Pergunta**: vetoriza a pergunta, compara por similaridade de cosseno, pega os
   4 melhores trechos.
5. **Resposta**: o modelo recebe **somente** esses trechos e a regra "se não
   responder com segurança, diga `NAO_SEI`".
6. **Escalada**: se o modelo disser `NAO_SEI`, a base não cobrir ou a IA falhar, o
   cliente recebe *"Vou confirmar com o responsável e já te respondo aqui"* e o dono
   recebe a pergunta no WhatsApp para responder em uma linha.

## O que a medição mostrou (e mudou o desenho)

Teste com base de barbearia, 5 perguntas cobertas e 6 fora da base:

| Pergunta | Coberta? | Similaridade |
|---|---|---|
| quanto custa o corte? | sim | 0,666 |
| que horas vocês abrem no sábado? | sim | 0,624 |
| onde fica a barbearia? | sim | 0,710 |
| posso pagar no pix? | sim | 0,572 |
| **fazem sobrancelha com navalha?** | **não** | **0,670** |
| vocês vendem tênis? | não | 0,544 |
| aceita vale-refeição? | não | 0,577 |

**Conclusão: limite de similaridade não serve como portão.** Uma pergunta fora da
base pontuou mais alto que duas cobertas. Por isso:

- o cosseno é só **pré-filtro** (abaixo de 0,50 nem chama o modelo, economiza token);
- quem decide de verdade é o **modelo lendo os trechos** e dizendo `NAO_SEI`;
- e existe um caminho de escalada para quando a IA está fora (nunca inventa).

## Limite operacional encontrado

O plano gratuito do Gemini permite **20 requisições de geração por dia** por modelo
(hoje bateu o teto e o bot caiu na escalada, que é o comportamento seguro). Para
vender, a chave precisa estar com **faturamento ativado**. Custo aproximado por
resposta com Flash: fração de centavo (uma conversa inteira custa menos de R$ 0,01).
`R$ 150/mês` cobre com folga, inclusive vários clientes na mesma chave.

## O que ainda falta para operar comercialmente

| Falta | Impacto |
|---|---|
| Uma instância de WhatsApp por cliente (hoje `WHATSMIAU_INSTANCE` é única no ambiente) | sem isso não roda mais de um cliente ao mesmo tempo |
| Roteamento do webhook para a base certa (por instância) | hoje todo inbound cai no fluxo da Vértice |
| Tela para cadastrar cliente, colar a base e testar perguntas | sem tela, cada cliente é um script |
| Assinatura: plano, valor, vencimento, status, MRR | hoje o CRM não sabe quem paga mensalidade |
| Handoff: quando o dono entra na conversa, o bot para | risco de bot e humano responderem juntos |

## Contrato do serviço (o que prometer ao cliente)

- Implementação: base indexada, número conectado, 5 perguntas de teste aprovadas
  com ele, ajuste fino da base no primeiro mês.
- Mensalidade: número no ar, base atualizada quando ele mandar mudança (até 2
  atualizações por mês), monitoramento e relatório de conversas.
- Fora: produção de conteúdo e fotos, integração com sistema de agendamento
  próprio do cliente, atendimento humano no lugar dele.

## Rotina de manutenção (o que dá dinheiro na recorrência)

Toda pergunta que virou escalada é uma lacuna da base. Revisar as escaladas do mês
e transformar as respostas do dono em novos trechos da base é o que faz o bot
melhorar sozinho, mês a mês.
