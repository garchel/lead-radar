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

## O que já está pronto para vender

| Peça | Onde | Estado |
|---|---|---|
| Base de conhecimento por cliente | `botKnowledgeService` | indexa texto colado no painel, lista e remove documentos |
| Isolamento por cliente | `bot_clients.instance` | cada cliente tem a própria instância no gateway; o webhook resolve pelo campo `instance` |
| Roteamento no webhook | `whatsappWebhookRoutes` | inbound de instância de cliente vai para o bot e **não** vira lead da Vértice |
| Handoff (dono assume) | `botConversationService` | dono digitando pausa o bot por 6h; mensagem nossa voltando do gateway é reconhecida e não pausa nada |
| Pergunta sem resposta | `bot_escalations` | cliente recebe aviso, dono recebe a pergunta, painel lista e permite responder (o texto é repassado ao cliente) |
| Assinatura e MRR | `subscriptionService` | implantação + mensalidade, próximo vencimento, marcar pagamento, cancelar, atraso |
| Painel | `BotsPage` | cadastrar cliente, colar base, testar pergunta, ver conversas, responder pendência, registrar pagamento |
| Alerta de cota | `bot_last_ai_error` | se a IA falhar/estourar cota, o painel mostra em vez de fingir que está tudo bem |

## Roteiro de implantação (o que fazer em cada cliente)

1. Cadastrar o cliente no painel (nome, WhatsApp do dono, instância, valores).
2. Criar a instância no gateway e parear o número do cliente.
3. Colar a base que ele mandou (serviços, preços, horário, endereço, pagamento, dúvidas).
4. Testar 5 perguntas reais com ele: 3 que a base cobre e 2 que não cobre.
5. Ajustar a base até as 3 cobertas responderem certo.
6. Apontar o webhook do gateway para o app (uma URL só; o roteamento é pela instância).
7. Mandar uma mensagem de teste do celular do cliente para o número dele.
8. Combinar o combinado do mês: quem recebe as escaladas e em que horário responde.

## Custo e cota (importante)

O plano gratuito do Gemini permite **20 gerações por dia por modelo** — não serve
para um cliente pagante. O bot não quebra: ele escala tudo. Mas o serviço só existe
com **faturamento ativado** na chave. Com Flash, uma conversa custa menos de centavo.

## Limite atual (honesto)

- Um número por cliente: se o cliente quiser dois números, são duas instâncias e dois
  cadastros.
- A base é texto: PDF e planilha precisam ser colados/convertidos (não há upload de arquivo).
- O relatório é na tela; não gera PDF/mensagem automática ainda.

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
