/**
 * Par de fontes da prévia.
 *
 * Até aqui a página usava a fonte do sistema: funciona em qualquer lugar, mas
 * toda prévia saía com a mesma cara. Tipografia é metade da percepção de
 * "profissional" — e o cliente sente isso mesmo sem saber nomear.
 *
 * Regras:
 * - par vem do tom da marca (o mesmo `tone` que a pesquisa de identidade coleta);
 * - se a marca já tem tipografia declarada, ela manda;
 * - sempre com fallback no CSS: fonte que não carrega não pode quebrar a página;
 * - só Google Fonts, `display=swap` e pesos limitados (cada peso é download).
 */

export interface FontPair {
  display: string;
  body: string;
  /** Por que esse par (vai para o log, não para a página). */
  reason: string;
}

/** Pares testados: um display com personalidade + um texto discreto. */
const PARES: Array<{ chave: string; testes: RegExp; par: FontPair }> = [
  {
    chave: "sofisticado",
    testes: /sofisticad|elegante|luxo|premium|refinad|cl[aá]ssic/i,
    par: { display: "Playfair Display", body: "Inter", reason: "tom sofisticado pede serifa de contraste" },
  },
  {
    chave: "acolhedor",
    testes: /acolhedor|humano|caloroso|delicad|afetiv|r[uú]stic|artesanal/i,
    par: { display: "Lora", body: "Nunito Sans", reason: "tom acolhedor pede serifa suave e texto arredondado" },
  },
  {
    chave: "moderno",
    testes: /clean|minimalist|modern|contempor|urbano/i,
    par: { display: "Space Grotesk", body: "Inter", reason: "tom clean pede geométrica de título" },
  },
  {
    chave: "tecnico",
    // "clínica" NÃO entra aqui: clínica é saúde, não tom técnico
    testes: /t[eé]cnic|industrial|engenharia|automa[cç][aã]o|metal|precis[aã]o/i,
    par: { display: "Archivo", body: "IBM Plex Sans", reason: "tom técnico pede grotesca neutra" },
  },
  {
    chave: "tradicional",
    testes: /tradicional|fam[ií]lia|hist[oó]ri|coloni|antig/i,
    par: { display: "Libre Baskerville", body: "Karla", reason: "tom tradicional pede serifa de livro" },
  },
];

const PADRAO: FontPair = {
  display: "Manrope",
  body: "Inter",
  reason: "par neutro para quando não há sinal de tom",
};

/**
 * Famílias que realmente existem no Google Fonts.
 *
 * A pesquisa de identidade descreve a tipografia em português ("Serifada
 * elegante", "Sans-serif leve e moderna") — isso NÃO é nome de fonte. Aceitar
 * qualquer texto fazia a página pedir uma família inexistente e cair no fallback
 * do sistema sem ninguém perceber. Lista fechada resolve: nome fora dela é
 * ignorado e o par vai pelo tom.
 */
const FAMILIAS_CONHECIDAS = new Set(
  [
    "Playfair Display", "Lora", "Space Grotesk", "Archivo", "Libre Baskerville", "Manrope", "Inter",
    "Nunito Sans", "IBM Plex Sans", "Karla", "DM Serif Display", "Work Sans", "Fraunces", "Source Sans 3",
    "Barlow", "Montserrat", "Poppins", "Raleway", "Rubik", "Sora", "Outfit", "Plus Jakarta Sans",
    "Merriweather", "Crimson Text", "Cormorant Garamond", "Bricolage Grotesque", "Instrument Serif",
    "Figtree", "Mulish", "Onest", "Geist", "DM Sans", "Public Sans", "Epilogue", "Newsreader",
    "Syne", "Unbounded", "Jost", "Cabin", "Heebo", "Assistant", "Spectral", "Zilla Slab",
  ].map((n) => n.toLowerCase())
);

function nomeConhecido(valor?: string): string | null {
  const nome = String(valor || "").trim().replace(/\s+/g, " ");
  if (!nome) return null;
  if (!/^[A-Za-z][A-Za-z0-9 \+'-]{1,40}$/.test(nome)) return null;
  return FAMILIAS_CONHECIDAS.has(nome.toLowerCase()) ? nome : null;
}

export function pickFontPair(input: {
  tone?: string[];
  typography?: { display?: string; body?: string };
  nicho?: string;
  /** Escolha feita no painel do projeto: manda sobre tom e identidade. */
  escolhido?: { display?: string; body?: string };
}): FontPair {
  const escolhidoDisplay = nomeConhecido(input.escolhido?.display);
  const escolhidoBody = nomeConhecido(input.escolhido?.body);
  if (escolhidoDisplay && escolhidoBody) {
    return { display: escolhidoDisplay, body: escolhidoBody, reason: "tipografia escolhida no painel do projeto" };
  }

  const display = nomeConhecido(input.typography?.display);
  const body = nomeConhecido(input.typography?.body);
  if (display && body && display.toLowerCase() !== body.toLowerCase()) {
    return { display, body, reason: "tipografia declarada na identidade da marca" };
  }

  const alvo = `${(input.tone || []).join(" ")} ${input.nicho || ""}`;
  const achado = PARES.find((p) => p.testes.test(alvo));
  if (achado) return achado.par;

  // sem tom: o nicho decide (saúde tende a acolhedor, jurídico a tradicional)
  if (/odonto|cl[ií]nic|sa[uú]de|psic|terapia|pet|est[eé]tica|consult[oó]rio/i.test(alvo)) return PARES[1].par;
  if (/advocacia|jur[ií]dic|contab/i.test(alvo)) return PARES[4].par;

  return PADRAO;
}

/** URL do Google Fonts com somente os pesos usados na página. */
export function fontStylesheetUrl(par: FontPair): string {
  const familia = (nome: string, pesos: string) => `family=${encodeURIComponent(nome).replace(/%20/g, "+")}:wght@${pesos}`;
  return `https://fonts.googleapis.com/css2?${familia(par.display, "500;600;700")}&${familia(par.body, "400;500;600")}&display=swap`;
}

/** Família CSS com fallback: se a fonte não carregar, a página continua legível. */
export function fontFamilyCss(nome: string, tipo: "display" | "body"): string {
  const fallback =
    tipo === "display"
      ? `ui-serif, Georgia, "Times New Roman", serif`
      : `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
  const generica = tipo === "display" ? "serif" : "sans-serif";
  return `"${nome}", ${fallback}, ${generica}`;
}
