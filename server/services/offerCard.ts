/**
 * Cartão de oferta: pacotes e seções em formato de leitura rápida no WhatsApp.
 *
 * Por que existe: a Clara listava pacote em prosa ("O Essencial fica R$ 899: até 5
 * seções, botão de WhatsApp que abre a conversa já preenchida e a publicação no ar,
 * com 1 rodada de ajuste."). Ninguém escaneia isso no celular. Comparar dois pacotes
 * em parágrafo obriga o cliente a reler — e ele não relê, ele sai.
 *
 * O formato é o que o Paulo pediu: título em negrito com o preço, um item por linha,
 * negrito no que diferencia, linha em branco entre pacotes e uma pergunta no fim.
 *
 * Limites do WhatsApp que este arquivo respeita: negrito é *asterisco* (não é markdown),
 * não existe tabela, não existe cabeçalho, e a mensagem toda passa por `whatsAppify`.
 */
import { bold, formatPrice } from "./messageStyle";
import type { CommercialPolicy } from "./commercialPolicy";

/** Extrai o número de seções do texto do pacote ("até 5 seções" → 5). */
export function limiteDeSecoes(texto: string): number | null {
  const m = String(texto || "").match(/at[ée]\s+(\d+)\s+se[cç][oõ]es/i);
  return m ? Number(m[1]) : null;
}

/** Até `n` seções, com a sugestão do nicho entre parênteses quando existe. */
function linhaDeSecoes(pack: any, secoes?: string[], extras?: string[]): string {
  const limite = limiteDeSecoes(`${pack.summary || ""} ${(pack.benefits || []).join(" ")}`);
  const quantas = limite ? `Até *${limite} seções*` : "*Seções* definidas com você";
  const sugestao = (secoes || []).filter(Boolean).slice(0, limite || 5);
  if (!sugestao.length) return `• ${quantas}`;
  return `• ${quantas}: ${sugestao.join(", ")}`;
}

/** Itens que valem negrito: o que o cliente ganha, não o que é óbvio. */
function destacar(item: string): string {
  const alvos = [
    /rodada de ajuste/i,
    /bot[ãa]o de whatsapp/i,
    /depoimentos/i,
    /perguntas frequentes|faq/i,
    /galeria/i,
    /seo|google/i,
    /at[ée] \d+ se[cç][oõ]es/i,
    /tudo do/i,
  ];
  for (const re of alvos) {
    const m = item.match(re);
    if (m) {
      const termo = m[0];
      // frase começa em minúscula no catálogo; em negrito no meio do bullet isso
      // fica com cara de erro de digitação
      const visivel = termo.charAt(0).toUpperCase() + termo.slice(1);
      return item.replace(termo, bold(visivel));
    }
  }
  return item;
}

/** Escolhe os 4 a 6 itens que vendem o pacote, sem repetir "tudo do Essencial". */
function itensDoPacote(pack: any, max = 6): string[] {
  const beneficios: string[] = (pack.benefits || []).map((b: string) => String(b).trim()).filter(Boolean);
  const escolhidos: string[] = [];
  // Conteúdo primeiro, burocracia depois: "rodada de ajuste" fecha a lista.
  const prioridades = [
    /bot[ãa]o de whatsapp/i,
    /depoimentos/i,
    /perguntas frequentes|faq/i,
    /galeria/i,
    /seo|google/i,
    /publica[cç][ãa]o/i,
    /formul[áa]rio/i,
    /rodada de ajuste/i,
  ];
  for (const re of prioridades) {
    const achado = beneficios.find((b) => re.test(b) && !escolhidos.includes(b));
    if (achado) escolhidos.push(achado);
    if (escolhidos.length >= max) break;
  }
  return escolhidos;
}

/**
 * Cartão comparativo dos pacotes.
 *
 * `secoes` são as seções medidas do nicho (pesquisa de mercado) para dar concretude ao
 * "até 5 seções" — sem isso o número é abstrato e não ajuda a decidir.
 */
export function cartaoDePacotes(
  policy: CommercialPolicy,
  opts: { secoes?: string[]; extras?: string[]; fechamento?: string } = {},
): string {
  const blocos: string[] = [];

  for (const pack of policy.packages) {
    const linhaTitulo = `${bold(pack.name.toUpperCase())} | ${bold(formatPrice(pack.price))}`;
    const linhas: string[] = [linhaTitulo];

    linhas.push(linhaDeSecoes(pack, opts.secoes, opts.extras));

    const tudoDoEssencial = (pack.benefits || []).find((b: string) => /^tudo\b/i.test(String(b).trim()));
    if (tudoDoEssencial) linhas.push(`• ${bold("Tudo do Essencial")}`);

    for (const item of itensDoPacote(pack)) {
      if (/^tudo\b/i.test(item)) continue;
      if (/se[cç][oõ]es/i.test(item)) continue; // já virou a linha de seções
      linhas.push(`• ${destacar(item)}`);
    }

    blocos.push(linhas.join("\n"));
  }

  const fim = opts.fechamento || "Qual dos dois faz mais sentido pra você?";
  return `${blocos.join("\n\n")}\n\n${fim}`;
}

/**
 * Cartão de seções do nicho.
 *
 * "seções essenciais" = o que a pesquisa mostrou em sites do segmento; "diferenciais" =
 * o que aparece nos melhores. Separar é honesto: um é o padrão, o outro é o extra.
 */
export function cartaoDeSecoes(input: {
  nicho?: string;
  essenciais: string[];
  diferenciais?: string[];
  fechamento?: string;
}): string {
  const nome = (input.nicho || "seu negócio").toLowerCase();
  const linhas = [`O que uma página de ${nome} precisa ter 👇`];
  for (const s of input.essenciais.filter(Boolean).slice(0, 7)) {
    linhas.push(`• ${destacar(s)}`);
  }
  const extras = (input.diferenciais || []).filter(Boolean).slice(0, 4);
  if (extras.length) {
    linhas.push("");
    linhas.push(`No *Profissional* entram ainda: ${extras.join(", ")}.`);
  }
  linhas.push("");
  linhas.push(input.fechamento || "Quer ver os dois pacotes lado a lado?");
  return linhas.join("\n");
}
