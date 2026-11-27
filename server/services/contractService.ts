import { ehLeadDeSimulacao } from "./simulationService";
import type { CommercialPackage, CommercialPolicy } from "./commercialPolicy";
import { brl, chavePixPara, planoDePagamento } from "./paymentPlan";

/**
 * Contrato em blocos: um documento, duas saídas.
 *
 * Antes o texto era montado direto como string, e a versão para imprimir seria outra
 * cópia — as duas divergem na primeira edição. Agora o documento é uma lista de blocos
 * e cada saída (texto para WhatsApp, HTML para imprimir) é só um renderizador.
 *
 * O escopo é o ponto sensível: as seções vêm do nicho do cliente e do que foi acordado,
 * não de uma lista fixa. Uma barbearia e uma clínica não têm o mesmo Anexo I.
 */

export type Bloco =
  | { tipo: "titulo"; texto: string }
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "tabela"; cabecalho: string[]; linhas: string[][] };

export interface DadosDoContrato {
  /** Nome/razão social do cliente. */
  contratante: string;
  contratanteDoc?: string;
  contratanteEndereco?: string;
  contratanteTelefone?: string;
  contratanteEmail?: string;
  representante?: string;
  contratada: string;
  contratadaCnpj?: string;
  contratadaEndereco?: string;
  contratadaEmail?: string;
  contratadaResponsavel?: string;
  /** Nicho do negócio: muda as seções sugeridas e o texto do objeto. */
  nicho?: string;
  /** Seções efetivamente contratadas, na ordem em que aparecem na página. */
  secoes?: string[];
  pacote: CommercialPackage;
  policy: CommercialPolicy;
  leadId?: string;
  data: Date;
}

function dataBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function ou(valor: string | undefined, vazio = "—"): string {
  const v = String(valor || "").trim();
  return v || vazio;
}

/**
 * Seções do contrato.
 *
 * O que o cliente escolheu manda. Quando ele não escolheu (contrato gerado antes da
 * conversa), usa o escopo que o pacote prevê — é melhor um Anexo I genérico do que um
 * Anexo I em branco.
 */
export function secoesDoContrato(dados: DadosDoContrato): string[] {
  const escolhidas = (dados.secoes || []).map((s) => String(s || "").trim()).filter(Boolean);
  if (escolhidas.length) return escolhidas.slice(0, 12);
  const base = (dados.pacote.sections || []).map((s) => String(s || "").trim()).filter(Boolean);
  return base.length ? base : dados.pacote.benefits.slice(0, 6);
}

export function documentoDoContrato(dados: DadosDoContrato): Bloco[] {
  const { pacote, policy } = dados;
  const plano = planoDePagamento(policy, pacote);
  const [entrada, saldo] = plano.parcelas;
  const secoes = secoesDoContrato(dados);
  const nicho = String(dados.nicho || "").trim();
  const blocos: Bloco[] = [];

  blocos.push({ tipo: "titulo", texto: "Contrato de criação e publicação de site" });
  blocos.push({
    tipo: "subtitulo",
    texto: `Prestação de serviço · uma página · pacote ${pacote.name} · aceite eletrônico`,
  });

  blocos.push({ tipo: "titulo", texto: "1. Partes" });
  blocos.push({
    tipo: "tabela",
    cabecalho: ["", "Contratante", "Contratada"],
    linhas: [
      ["Nome ou razão social", ou(dados.contratante), ou(dados.contratada)],
      ["CPF ou CNPJ", ou(dados.contratanteDoc), ou(dados.contratadaCnpj)],
      ["Endereço", ou(dados.contratanteEndereco), ou(dados.contratadaEndereco)],
      ["Telefone", ou(dados.contratanteTelefone), "—"],
      ["E-mail", ou(dados.contratanteEmail), ou(dados.contratadaEmail)],
      ["Representante", ou(dados.representante), ou(dados.contratadaResponsavel)],
    ],
  });
  blocos.push({ tipo: "paragrafo", texto: "As partes acima identificadas têm entre si justo e contratado o seguinte:" });

  blocos.push({ tipo: "titulo", texto: "2. Objeto" });
  blocos.push({
    tipo: "paragrafo",
    texto:
      "A CONTRATADA prestará serviço de criação, montagem e publicação de um site de uma página" +
      (nicho ? ` para o negócio do CONTRATANTE no segmento de ${nicho}` : " para o negócio do CONTRATANTE") +
      `, no pacote ${pacote.name}, com o escopo do Anexo I, que integra este contrato para todos os efeitos.`,
  });
  blocos.push({
    tipo: "paragrafo",
    texto:
      "O serviço é de meio: a CONTRATADA entrega o site descrito no Anexo I, não se obrigando a resultado de vendas, de posicionamento em buscadores ou de número de visitas.",
  });

  blocos.push({ tipo: "titulo", texto: "3. Prazo" });
  blocos.push({
    tipo: "lista",
    itens: [
      `O prazo de entrega é de ${policy.deliveryDays[0]} a ${policy.deliveryDays[1]} dias úteis, contados do dia útil seguinte ao que ocorrer por último: (i) o recebimento da entrada prevista na cláusula 4; e (ii) o recebimento de todo o conteúdo necessário (textos, fotos, logotipo e informações de contato).`,
      "Atraso do CONTRATANTE no envio do conteúdo desloca o prazo na mesma proporção, sem qualquer ônus para a CONTRATADA.",
      "Cada rodada de ajuste solicitada após a publicação reinicia a contagem em até 2 (dois) dias úteis.",
    ],
  });

  blocos.push({ tipo: "titulo", texto: "4. Preço e forma de pagamento" });
  blocos.push({
    tipo: "tabela",
    cabecalho: ["Pacote", "Total", "Na aprovação", "Com o site no ar"],
    linhas: [[pacote.name, brl(plano.total), brl(entrada.valor), brl(saldo.valor)]],
  });
  blocos.push({
    tipo: "lista",
    itens: [
      `A entrada de ${brl(entrada.valor)} reserva a vaga na fila de produção e é abatida do valor total, não sendo valor adicional.`,
      "O saldo é devido quando o site estiver pronto e no ar, em endereço provisório da CONTRATADA, e antes da publicação no domínio do CONTRATANTE.",
      "Não há mensalidade obrigatória. Serviços de manutenção, quando contratados, são objeto de contrato próprio.",
      "Os pagamentos são feitos por Pix, para a chave indicada pela CONTRATADA. A CONTRATADA não solicita senha, código de verificação ou dados de cartão em nenhuma hipótese.",
      "Emitida a nota fiscal do serviço, o CONTRATANTE recebe a via em meio eletrônico.",
    ],
  });

  blocos.push({ tipo: "titulo", texto: "5. Garantia e direito de arrependimento" });
  blocos.push({
    tipo: "lista",
    itens: [
      `O CONTRATANTE tem ${policy.garantiaDias} dias corridos, contados da publicação do site, para desistir do contrato sem necessidade de justificar, nos termos do art. 49 do Código de Defesa do Consumidor.`,
      "Exercido o direito, a CONTRATADA devolve integralmente os valores pagos, em até 10 (dez) dias úteis, e retira o site do ar.",
      "Desistência antes do início da produção: a entrada é devolvida integralmente, sem retenção.",
      "A devolução integral do valor e a retirada do ar são a única consequência do exercício da garantia, ressalvado o disposto na cláusula 6.",
    ],
  });

  blocos.push({ tipo: "titulo", texto: "6. Direitos autorais e momento da cessão" });
  blocos.push({
    tipo: "lista",
    itens: [
      "Os textos, as imagens produzidas e o código do site são de autoria da CONTRATADA, nos termos da Lei 9.610/98.",
      "A cessão dos direitos de uso e a transferência do domínio ao CONTRATANTE ocorrem somente depois de cumpridos, cumulativamente: (i) o decurso do prazo de garantia da cláusula 5; e (ii) a quitação integral do preço da cláusula 4.",
      "Até o cumprimento dessas duas condições, o site permanece publicado em endereço provisório da CONTRATADA, em licença de avaliação: o CONTRATANTE pode acessar, testar e divulgar o endereço, mas não recebe o domínio, o código-fonte nem os arquivos originais.",
      "A reprodução total ou parcial do site, dos textos ou das imagens, por qualquer meio, inclusive por ferramenta de inteligência artificial, antes da cessão prevista no item 2, é uso não autorizado e sujeita o infrator às medidas previstas na Lei 9.610/98, independentemente da devolução tratada na cláusula 5.",
      "Após a cessão, o CONTRATANTE pode usar o site livremente para o seu negócio, vedada a revenda do mesmo material a terceiros como serviço de criação.",
    ],
  });

  blocos.push({ tipo: "titulo", texto: "7. Domínio e hospedagem" });
  blocos.push({
    tipo: "lista",
    itens: [
      "O registro do domínio é feito no nome do CONTRATANTE, que é o seu titular e responde pelo custo anual de renovação junto ao registrador.",
      "Durante a avaliação, a hospedagem fica na conta da CONTRATADA. Depois da cessão, a hospedagem pode ser mantida pela CONTRATADA em contrato de manutenção ou transferida ao CONTRATANTE.",
      "A CONTRATADA não responde por indisponibilidade causada por registrador, provedor de hospedagem ou serviço de terceiro.",
    ],
  });

  blocos.push({ tipo: "titulo", texto: "8. Obrigações do CONTRATANTE" });
  blocos.push({
    tipo: "lista",
    itens: [
      "Fornecer, em até 5 (cinco) dias úteis da aprovação, os textos, fotos, logotipo e informações de contato necessários.",
      "Responder pela veracidade das informações e por possuir autorização de uso das imagens enviadas, inclusive direitos de imagem de terceiros.",
      "Indicar um único responsável pelas aprovações, cujo aceite vincula o CONTRATANTE.",
    ],
  });

  blocos.push({ tipo: "titulo", texto: "9. O que não está incluído" });
  blocos.push({
    tipo: "lista",
    itens: [
      "anúncios e gestão de tráfego pago, redes sociais e produção de conteúdo periódico;",
      "e-mail corporativo, sistemas de agendamento de terceiros e integrações não descritas no Anexo I;",
      "manutenção, atualizações e suporte após o prazo de garantia, salvo contratação à parte;",
      "garantia de posição, de tráfego ou de faturamento: a CONTRATADA otimiza título e descrição do site, sem prometer colocação em buscadores;",
      "registro e renovação anual do domínio, cujo custo é do CONTRATANTE.",
    ],
  });

  blocos.push({ tipo: "titulo", texto: "10. Limitação de responsabilidade" });
  blocos.push({
    tipo: "paragrafo",
    texto:
      "A responsabilidade da CONTRATADA por qualquer dano decorrente deste contrato limita-se ao valor efetivamente pago pelo serviço contratado, ressalvadas as hipóteses de dolo e de vedação legal. A CONTRATADA não responde por lucros cessantes, perda de oportunidade ou resultado comercial do negócio do CONTRATANTE.",
  });

  blocos.push({ tipo: "titulo", texto: "11. Proteção de dados" });
  blocos.push({
    tipo: "paragrafo",
    texto:
      "Os dados pessoais informados são tratados para execução deste contrato, emissão de nota fiscal e comunicação sobre o serviço, com base no art. 7º, II e V, da Lei 13.709/2018 (LGPD). Não são vendidos nem cedidos a terceiros, salvo obrigação legal. O titular pode solicitar acesso, correção ou eliminação pelo e-mail indicado no preâmbulo.",
  });

  blocos.push({ tipo: "titulo", texto: "12. Rescisão" });
  blocos.push({
    tipo: "lista",
    itens: [
      "Qualquer parte pode rescindir este contrato mediante comunicação escrita, respondendo pelos valores correspondentes ao que já foi executado.",
      "Antes da publicação, a rescisão pelo CONTRATANTE gera devolução integral da entrada.",
      "Depois da publicação, aplica-se a cláusula 5.",
    ],
  });

  blocos.push({ tipo: "titulo", texto: "13. Aceite eletrônico" });
  blocos.push({
    tipo: "paragrafo",
    texto:
      "As partes concordam que este contrato pode ser aceito por meio eletrônico, inclusive por mensagem em aplicativo de mensagens, com registro de data, hora e do número de telefone de origem, tendo a mesma validade da assinatura manuscrita, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001. O texto recebido pelo CONTRATANTE é idêntico ao deste documento.",
  });

  blocos.push({ tipo: "titulo", texto: "14. Disposições gerais e foro" });
  blocos.push({
    tipo: "paragrafo",
    texto:
      "Este contrato é regido pelas leis brasileiras. As partes elegem o foro da comarca de Brasília/DF para dirimir controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja, ressalvado o direito do consumidor de demandar em seu domicílio. A tolerância quanto ao descumprimento de qualquer cláusula não constitui novação.",
  });
  blocos.push({ tipo: "paragrafo", texto: "E, por estarem de acordo, as partes firmam o presente em duas vias de igual teor." });
  blocos.push({
    tipo: "tabela",
    cabecalho: ["Contratante", "Contratada"],
    linhas: [
      [ou(dados.contratante), ou(dados.contratada)],
      [`CPF/CNPJ: ${ou(dados.contratanteDoc)}`, `CNPJ: ${ou(dados.contratadaCnpj)}`],
    ],
  });
  blocos.push({
    tipo: "paragrafo",
    texto: `${ou(dados.contratanteEndereco, "____________________")}, ${dataBR(dados.data)}.`,
  });

  // ---- Anexo I: o escopo é o que foi escolhido, não uma lista fixa ----
  blocos.push({ tipo: "titulo", texto: "Anexo I — Escopo do serviço" });
  blocos.push({
    tipo: "paragrafo",
    texto: `Seções contratadas para o pacote ${pacote.name}${nicho ? ` (segmento: ${nicho})` : ""}, na ordem de exibição na página:`,
  });
  blocos.push({ tipo: "lista", itens: secoes.map((s, i) => `${i + 1}. ${s}`) });
  // Item padrão que o cliente já escolheu como seção não se repete no Anexo.
  const jaTem = (termo: string) => secoes.some((s) => s.toLowerCase().includes(termo));
  const padrao: string[] = [];
  if (!jaTem("whatsapp")) padrao.push("Botão de WhatsApp que abre a conversa já preenchida.");
  padrao.push("Publicação no ar com link próprio para compartilhar.");
  padrao.push(`${pacote.revisions} rodada${pacote.revisions > 1 ? "s" : ""} de ajuste após a publicação.`);
  padrao.push(`Entrega em ${policy.deliveryDays[0]} a ${policy.deliveryDays[1]} dias úteis após o conteúdo.`);
  blocos.push({ tipo: "lista", itens: padrao });

  blocos.push({ tipo: "subtitulo", texto: "Como funciona a aprovação" });
  blocos.push({
    tipo: "lista",
    itens: [
      "A CONTRATADA publica a primeira versão em endereço provisório próprio e envia o link ao CONTRATANTE.",
      "O CONTRATANTE aponta, de uma só vez, todos os ajustes que quiser dentro da rodada contratada.",
      "A CONTRATADA aplica os ajustes e devolve o link para conferência.",
      "Aprovado o site e quitado o saldo, o domínio é publicado no nome do CONTRATANTE.",
    ],
  });

  return blocos;
}

/** Texto puro, para WhatsApp e para o agente colar na conversa. */
export function renderizarTexto(blocos: Bloco[]): string {
  const linhas: string[] = [];
  for (const b of blocos) {
    if (b.tipo === "titulo") {
      linhas.push("", b.texto.toUpperCase(), "");
    } else if (b.tipo === "subtitulo") {
      linhas.push("", b.texto, "");
    } else if (b.tipo === "paragrafo") {
      linhas.push(b.texto, "");
    } else if (b.tipo === "lista") {
      for (const item of b.itens) linhas.push(`- ${item}`);
      linhas.push("");
    } else if (b.tipo === "tabela") {
      linhas.push(b.cabecalho.filter(Boolean).join(" | "));
      for (const l of b.linhas) linhas.push(l.join(" | "));
      linhas.push("");
    }
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function contratoDeUmaPagina(dados: DadosDoContrato): string {
  return renderizarTexto(documentoDoContrato(dados));
}

/** Texto curto para mandar no WhatsApp antes do contrato completo. */
export function resumoDoContrato(policy: CommercialPolicy, pacote: CommercialPackage, leadId?: string): string {
  const plano = planoDePagamento(policy, pacote);
  const { chave } = chavePixPara(policy, leadId);
  const linhas = [
    "Antes de começar, o combinado em 5 linhas:",
    "",
    `• ${pacote.name}: ${brl(plano.total)}`,
    `• ${brl(plano.parcelas[0].valor)} agora, ${brl(plano.parcelas[1].valor)} com o site no ar`,
    `• ${policy.garantiaDias} dias de garantia depois de publicado`,
    "• o domínio passa para o seu nome ao final",
  ];
  if (!chave) linhas.push("", "Te mando o contrato de uma página para você ler antes de qualquer pagamento.");
  return linhas.join("\n");
}

/** Só para simulação: o contrato de teste não pode vazar para lead real. */
export function ehContratoDeTeste(leadId?: string): boolean {
  return Boolean(leadId && ehLeadDeSimulacao(leadId));
}
