import { ehLeadDeSimulacao } from "./simulationService";
import type { CommercialPackage, CommercialPolicy } from "./commercialPolicy";
import { brl, chavePixPara, planoDePagamento } from "./paymentPlan";

/**
 * Contrato de uma página.
 *
 * Não é peça jurídica de escritório: é o documento que um dono de barbearia lê em dois
 * minutos no celular e entende o que comprou. Serve para três coisas concretas:
 *
 *  1. **Confiança institucional** (Pavlou & Gefen, 2004): quando o comprador não tem
 *     como julgar qualidade nem histórico do vendedor, ele confia na instituição —
 *     contrato, CNPJ, nota. É o que substitui reputação no primeiro negócio.
 *  2. **Prova de execução.** Com data, escopo e aceite, o "não gostei" depois de usar
 *     o site por semanas deixa de ser discussão de memória.
 *  3. **Cessão condicional de direitos.** O site e o domínio só passam para o cliente
 *     depois do prazo de arrependimento e da quitação. Antes disso ele avalia, não
 *     recebe o ativo. Isso protege contra o pedido de devolução feito já com a cópia.
 *
 * O que NÃO entra aqui: cláusula que tire o direito de arrependimento. O art. 51, I do
 * CDC considera nula cláusula que renuncie a direito do consumidor — escrever "não há
 * devolução" não protege ninguém e ainda entrega prova de má-fé.
 */

export interface DadosDoContrato {
  contratante: string;
  contratada: string;
  pacote: CommercialPackage;
  policy: CommercialPolicy;
  /** Identificação do cliente no CRM (para a linha de aceite). */
  leadId?: string;
  data: Date;
}

function dataBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function contratoDeUmaPagina(dados: DadosDoContrato): string {
  const { contratante, contratada, pacote, policy, data } = dados;
  const plano = planoDePagamento(policy, pacote);
  const [entrada, saldo] = plano.parcelas;
  const secoes = pacote.sections?.length ? pacote.sections : pacote.benefits.slice(0, 5);

  const linhas: string[] = [];
  linhas.push(`# Contrato de criação de site — ${pacote.name}`);
  linhas.push("");
  linhas.push(`**Contratante:** ${contratante || "____________________"}`);
  linhas.push(`**Contratada:** ${contratada}, CNPJ ____________________`);
  linhas.push(`**Data:** ${dataBR(data)}`);
  linhas.push("");
  linhas.push("## 1. O que será entregue");
  linhas.push(`Site de uma página, pacote ${pacote.name}, com até ${pacote.sections?.length || 5} seções:`);
  for (const s of secoes) linhas.push(`- ${s}`);
  linhas.push(`- ${pacote.revisions} rodada${pacote.revisions > 1 ? "s" : ""} de ajuste incluída${pacote.revisions > 1 ? "s" : ""}`);
  linhas.push(`- publicação no ar em ${policy.deliveryDays[0]} a ${policy.deliveryDays[1]} dias úteis após o recebimento do conteúdo`);
  linhas.push("");
  linhas.push("## 2. Preço e pagamento");
  linhas.push(`Valor total: **${brl(plano.total)}**, sem mensalidade obrigatória.`);
  linhas.push(`- ${brl(entrada.valor)} na aprovação deste contrato, abatido do total;`);
  linhas.push(`- ${brl(saldo.valor)} na aprovação do site já no ar, antes da publicação no domínio do contratante.`);
  linhas.push("");
  linhas.push("O valor da entrada é devolvido integralmente se o contratante desistir antes do início da produção.");
  linhas.push("");
  linhas.push("## 3. Garantia");
  linhas.push(`O contratante tem **${policy.garantiaDias} dias corridos**, contados da publicação do site, para desistir sem justificar. A Contratada devolve integralmente o que foi pago e retira o site do ar.`);
  linhas.push("");
  linhas.push("## 4. Direitos sobre o site");
  linhas.push("O texto, as imagens produzidas e o código são de autoria da Contratada. A **cessão dos direitos e a transferência do domínio** acontecem depois de cumpridos os dois itens abaixo:");
  linhas.push("- decurso do prazo de garantia do item 3;");
  linhas.push("- quitação integral do valor do item 2.");
  linhas.push("");
  linhas.push("Até lá, o site fica publicado em endereço provisório da Contratada, em **licença de avaliação**: o contratante pode usar, mostrar e testar, mas não receber o domínio, o código-fonte nem os arquivos originais.");
  linhas.push("");
  linhas.push("Cópia do site, dos textos ou das imagens por qualquer meio, inclusive por ferramenta de inteligência artificial, antes da cessão, é uso não autorizado e responde nos termos da Lei 9.610/98.");
  linhas.push("");
  linhas.push("## 5. O que não está incluído");
  linhas.push("- registro e renovação anual do domínio (custo do registrador, pago pelo contratante);");
  linhas.push("- anúncios, gestão de tráfego pago e redes sociais;");
  linhas.push("- manutenção depois da garantia, salvo contratação à parte;");
  linhas.push("- resultados de posicionamento no Google: a Contratada otimiza título e descrição, não garante posição.");
  linhas.push("");
  linhas.push("## 6. Conteúdo e responsabilidade");
  linhas.push("O contratante responde pelas informações, fotos e autorizações que enviar, inclusive direitos de imagem de terceiros. A Contratada responde pela execução técnica do que está no item 1.");
  linhas.push("");
  linhas.push("## 7. Dados pessoais");
  linhas.push("Os dados do contratante são usados para executar este contrato e emitir nota fiscal, e não são vendidos nem cedidos a terceiros (LGPD, Lei 13.709/2018).");
  linhas.push("");
  linhas.push("## 8. Aceite");
  linhas.push("O aceite pode ser dado por mensagem no WhatsApp, com nome, data e hora registrados. Este contrato é o mesmo texto que o contratante recebeu na conversa.");
  linhas.push("");
  linhas.push(`Contratante: ______________________________  ${dataBR(data)}`);
  linhas.push(`Contratada: ${contratada}`);
  return linhas.join("\n");
}

/** Texto curto para mandar no WhatsApp antes do contrato completo. */
export function resumoDoContrato(policy: CommercialPolicy, pacote: CommercialPackage, leadId?: string): string {
  const plano = planoDePagamento(policy, pacote);
  const { chave } = chavePixPara(policy, leadId);
  const linhas = [
    `Antes de começar, o combinado em 5 linhas:`,
    "",
    `• ${pacote.name}: ${brl(plano.total)}`,
    `• ${brl(plano.parcelas[0].valor)} agora, ${brl(plano.parcelas[1].valor)} com o site no ar`,
    `• ${policy.garantiaDias} dias de garantia depois de publicado`,
    `• o domínio passa para o seu nome ao final`,
  ];
  if (!chave) linhas.push("", "Te mando o contrato de uma página para você ler antes de qualquer pagamento.");
  return linhas.join("\n");
}

/** Só para simulação: o contrato de teste não pode vazar para lead real. */
export function ehContratoDeTeste(leadId?: string): boolean {
  return Boolean(leadId && ehLeadDeSimulacao(leadId));
}
