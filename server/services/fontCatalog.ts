/**
 * Catálogo curado de fontes e motor de combinação.
 *
 * Não é a lista inteira do Google Fonts (1.500 famílias): é uma seleção pequena de
 * fontes que se usa de verdade em site de cliente — desenho bom, família completa,
 * boa leitura em celular e presença em milhares de páginas. Catálogo grande dá par
 * ruim com facilidade; catálogo curto e bem escolhido dá par confiável.
 *
 * Duas camadas de garantia:
 * 1. `PARES_CONSAGRADOS` — combinações escolhidas a mão, que aparecem em site
 *    profissional há anos. Entram primeiro, com selo, e não competem com a regra.
 * 2. Motor de regras — cobre o resto: contraste de categoria, nunca dois
 *    expressivos, largura e altura-x compatíveis, corpo legível como requisito.
 *
 * A lista é estática de propósito: sem rede, sem chave, resultado determinístico.
 */

export type FontCategory = "serif" | "sans" | "display" | "mono" | "slab";

/** Onde a fonte funciona melhor. Evita oferecer fonte só de texto como título. */
export type FontRole = "titulo" | "texto" | "ambos";

export interface FontMeta {
  name: string;
  category: FontCategory;
  role: FontRole;
  /** Personalidade em 2-4 tags: é o que decide a combinação. */
  tags: string[];
  /** Largura relativa, para não casar condensed com wide. */
  width?: "condensed" | "normal" | "wide";
  /** Altura-x aproximada: influencia a percepção de tamanho no mesmo corpo. */
  xHeight?: "low" | "medium" | "high";
}

/**
 * Seleção curada (~52 famílias).
 *
 * Critério de entrada: aparece em site profissional de verdade, tem família
 * completa, lê bem em tela pequena e não é moda passageira. `role` separa o que
 * serve de título (personalidade) do que serve de texto (discrição).
 */
export const CATALOGO: FontMeta[] = [
  // ── texto: os cavalos de batalha, seguros em qualquer projeto ───────────────
  { name: "Inter", category: "sans", role: "ambos", tags: ["neutro", "legivel", "interface"], xHeight: "high" },
  { name: "Roboto", category: "sans", role: "ambos", tags: ["neutro", "funcional", "universal"], xHeight: "high" },
  { name: "Open Sans", category: "sans", role: "texto", tags: ["neutro", "legivel", "universal"], xHeight: "high" },
  { name: "Lato", category: "sans", role: "texto", tags: ["neutro", "humano", "universal"], xHeight: "high" },
  { name: "Source Sans 3", category: "sans", role: "texto", tags: ["neutro", "funcional", "legivel"], xHeight: "high" },
  { name: "Noto Sans", category: "sans", role: "texto", tags: ["neutro", "universal", "legivel"], xHeight: "high" },
  { name: "Work Sans", category: "sans", role: "ambos", tags: ["neutro", "funcional", "moderno"], xHeight: "high" },
  { name: "Public Sans", category: "sans", role: "texto", tags: ["neutro", "funcional", "institucional"], xHeight: "high" },
  { name: "IBM Plex Sans", category: "sans", role: "ambos", tags: ["tecnico", "institucional", "preciso"], xHeight: "high" },
  { name: "Manrope", category: "sans", role: "ambos", tags: ["neutro", "moderno", "geometrico"], xHeight: "high" },
  { name: "DM Sans", category: "sans", role: "ambos", tags: ["neutro", "moderno", "amigavel"], xHeight: "high" },
  { name: "Figtree", category: "sans", role: "ambos", tags: ["neutro", "amigavel", "moderno"], xHeight: "high" },
  { name: "Nunito Sans", category: "sans", role: "texto", tags: ["acolhedor", "amigavel", "arredondado"], xHeight: "high" },
  { name: "Karla", category: "sans", role: "texto", tags: ["humano", "funcional", "leve"], xHeight: "medium" },
  { name: "Cabin", category: "sans", role: "texto", tags: ["humano", "amigavel", "legivel"], xHeight: "medium" },
  { name: "Mulish", category: "sans", role: "texto", tags: ["neutro", "leve", "legivel"], xHeight: "high" },
  { name: "Assistant", category: "sans", role: "texto", tags: ["neutro", "leve", "legivel"], xHeight: "medium" },
  { name: "Heebo", category: "sans", role: "texto", tags: ["neutro", "legivel", "interface"], xHeight: "high" },
  { name: "Barlow", category: "sans", role: "ambos", tags: ["funcional", "industrial", "neutro"], xHeight: "high" },

  // ── títulos com personalidade ───────────────────────────────────────────────
  { name: "Playfair Display", category: "serif", role: "titulo", tags: ["elegante", "contraste", "editorial"], xHeight: "high" },
  { name: "DM Serif Display", category: "serif", role: "titulo", tags: ["elegante", "contraste", "moderno"], xHeight: "high" },
  { name: "Lora", category: "serif", role: "ambos", tags: ["acolhedor", "humano", "calmo"], xHeight: "medium" },
  { name: "Merriweather", category: "serif", role: "ambos", tags: ["editorial", "legivel", "solido"], xHeight: "high" },
  { name: "Libre Baskerville", category: "serif", role: "titulo", tags: ["tradicional", "livro", "solido"], xHeight: "high" },
  { name: "Cormorant Garamond", category: "serif", role: "titulo", tags: ["elegante", "delicado", "luxo"], xHeight: "low" },
  { name: "Fraunces", category: "serif", role: "titulo", tags: ["expressivo", "artesanal", "caloroso"], xHeight: "high" },
  { name: "Instrument Serif", category: "serif", role: "titulo", tags: ["editorial", "delicado", "moderno"], xHeight: "medium" },
  { name: "Newsreader", category: "serif", role: "ambos", tags: ["editorial", "jornal", "calmo"], xHeight: "medium" },
  { name: "Spectral", category: "serif", role: "ambos", tags: ["editorial", "calmo", "legivel"], xHeight: "medium" },
  { name: "Crimson Text", category: "serif", role: "texto", tags: ["livro", "tradicional", "calmo"], xHeight: "medium" },
  { name: "Bitter", category: "slab", role: "ambos", tags: ["solido", "industrial", "legivel"], xHeight: "high" },
  { name: "Zilla Slab", category: "slab", role: "titulo", tags: ["tecnico", "moderno", "solido"], xHeight: "high" },
  { name: "Roboto Slab", category: "slab", role: "ambos", tags: ["neutro", "solido", "tecnico"], xHeight: "high" },
  { name: "Space Grotesk", category: "sans", role: "titulo", tags: ["tecnico", "moderno", "grotesco"], xHeight: "high" },
  { name: "Sora", category: "sans", role: "titulo", tags: ["tecnico", "moderno", "geometrico"], xHeight: "high" },
  { name: "Archivo", category: "sans", role: "ambos", tags: ["tecnico", "grotesco", "solido"], xHeight: "high" },
  { name: "Bricolage Grotesque", category: "display", role: "titulo", tags: ["expressivo", "artesanal", "moderno"], xHeight: "high" },
  { name: "Montserrat", category: "sans", role: "ambos", tags: ["moderno", "geometrico", "solido"], xHeight: "high" },
  { name: "Poppins", category: "sans", role: "titulo", tags: ["moderno", "geometrico", "amigavel"], xHeight: "high" },
  { name: "Raleway", category: "sans", role: "titulo", tags: ["elegante", "leve", "editorial"], xHeight: "medium" },
  { name: "Rubik", category: "sans", role: "ambos", tags: ["moderno", "amigavel", "solido"], xHeight: "high" },
  { name: "Outfit", category: "sans", role: "titulo", tags: ["moderno", "geometrico", "limpo"], xHeight: "high" },
  { name: "Plus Jakarta Sans", category: "sans", role: "ambos", tags: ["moderno", "amigavel", "geometrico"], xHeight: "high" },
  { name: "Jost", category: "sans", role: "titulo", tags: ["geometrico", "retro", "elegante"], xHeight: "medium" },
  { name: "Epilogue", category: "sans", role: "titulo", tags: ["moderno", "editorial", "contraste"], xHeight: "high" },
  { name: "Syne", category: "display", role: "titulo", tags: ["expressivo", "criativo", "moderno"], width: "wide" },
  { name: "Oswald", category: "display", role: "titulo", tags: ["condensado", "impacto", "industrial"], width: "condensed", xHeight: "high" },
  { name: "Anton", category: "display", role: "titulo", tags: ["impacto", "condensado", "esportivo"], width: "condensed", xHeight: "high" },
  { name: "Archivo Narrow", category: "sans", role: "titulo", tags: ["condensado", "editorial", "funcional"], width: "condensed", xHeight: "high" },

  // ── técnico ────────────────────────────────────────────────────────────────
  { name: "JetBrains Mono", category: "mono", role: "titulo", tags: ["tecnico", "codigo", "moderno"] },
  { name: "IBM Plex Mono", category: "mono", role: "titulo", tags: ["tecnico", "codigo", "preciso"] },
  { name: "Space Mono", category: "mono", role: "titulo", tags: ["tecnico", "retro", "expressivo"] },
];

/**
 * Pares consagrados: escolhidos a mão, não por regra.
 *
 * Combinações que aparecem em site profissional há anos. O operador não precisa
 * entender de tipografia: escolhe um desses e o resultado é seguro.
 */
export const PARES_CONSAGRADOS: Array<[string, string]> = [
  ["Playfair Display", "Inter"],
  ["Playfair Display", "Source Sans 3"],
  ["Playfair Display", "Lato"],
  ["Playfair Display", "Work Sans"],
  ["DM Serif Display", "Inter"],
  ["DM Serif Display", "DM Sans"],
  ["Cormorant Garamond", "Montserrat"],
  ["Cormorant Garamond", "Inter"],
  ["Instrument Serif", "Inter"],
  ["Instrument Serif", "Figtree"],
  ["Fraunces", "Inter"],
  ["Fraunces", "Work Sans"],
  ["Lora", "Inter"],
  ["Lora", "Source Sans 3"],
  ["Lora", "Work Sans"],
  ["Lora", "DM Sans"],
  ["Merriweather", "Inter"],
  ["Merriweather", "Open Sans"],
  ["Merriweather", "Source Sans 3"],
  ["Libre Baskerville", "Inter"],
  ["Libre Baskerville", "Lato"],
  ["Newsreader", "Inter"],
  ["Newsreader", "Work Sans"],
  ["Spectral", "Inter"],
  ["Spectral", "Source Sans 3"],
  ["Bitter", "Inter"],
  ["Bitter", "Work Sans"],
  ["Zilla Slab", "Inter"],
  ["Roboto Slab", "Roboto"],
  ["Roboto Slab", "Inter"],
  ["Space Grotesk", "Inter"],
  ["Space Grotesk", "DM Sans"],
  ["Space Grotesk", "Figtree"],
  ["Sora", "Inter"],
  ["Sora", "DM Sans"],
  ["Archivo", "Inter"],
  ["Archivo", "Source Sans 3"],
  ["Bricolage Grotesque", "Inter"],
  ["Bricolage Grotesque", "DM Sans"],
  ["Bricolage Grotesque", "Figtree"],
  ["Montserrat", "Inter"],
  ["Montserrat", "Source Sans 3"],
  ["Montserrat", "Merriweather"],
  ["Poppins", "Inter"],
  ["Poppins", "DM Sans"],
  ["Raleway", "Inter"],
  ["Raleway", "Lato"],
  ["Rubik", "Inter"],
  ["Outfit", "Inter"],
  ["Outfit", "DM Sans"],
  ["Plus Jakarta Sans", "Inter"],
  ["Jost", "Inter"],
  ["Jost", "Work Sans"],
  ["Epilogue", "Inter"],
  ["Epilogue", "Source Sans 3"],
  ["Syne", "Inter"],
  ["Syne", "DM Sans"],
  ["Oswald", "Inter"],
  ["Oswald", "Source Sans 3"],
  ["Anton", "Inter"],
  ["Archivo Narrow", "Inter"],
  ["JetBrains Mono", "Inter"],
  ["IBM Plex Mono", "IBM Plex Sans"],
  ["Space Mono", "Work Sans"],
  ["Manrope", "Inter"],
  ["Barlow", "Inter"],
  ["Roboto", "Inter"],
];

const CHAVE_PAR = (display: string, body: string) => `${display.toLowerCase()}|${body.toLowerCase()}`;
const CONJUNTO_CONSAGRADOS = new Set(PARES_CONSAGRADOS.map(([d, b]) => CHAVE_PAR(d, b)));

export function isCuratedPair(display: string, body: string): boolean {
  return CONJUNTO_CONSAGRADOS.has(CHAVE_PAR(display, body));
}

/** Pares prontos, para quem não quer pensar em fonte: escolhe um e pronto. */
export function curatedPairs(): Array<{ display: string; body: string; nota: string }> {
  return PARES_CONSAGRADOS.filter(([d, b]) => findFont(d) && findFont(b)).map(([display, body]) => {
    const d = findFont(display)!;
    const b = findFont(body)!;
    return { display, body, nota: `${d.category} + ${b.category}` };
  });
}

export function findFont(name: string): FontMeta | undefined {
  const alvo = String(name || "").trim().toLowerCase();
  return CATALOGO.find((f) => f.name.toLowerCase() === alvo);
}

export function fontNames(): string[] {
  return CATALOGO.map((f) => f.name);
}

/** Fontes que servem de título (não oferece fonte só de texto no seletor). */
export function titleFonts(): FontMeta[] {
  return CATALOGO.filter((f) => f.role === "titulo" || f.role === "ambos");
}

/** Fontes que servem de corpo de texto. */
export function bodyFonts(): FontMeta[] {
  return CATALOGO.filter((f) => f.role === "texto" || f.role === "ambos");
}

export interface PairSuggestion {
  display: string;
  body: string;
  /** 0–100, para ordenar. */
  score: number;
  reason: string;
  /** Par escolhido a mão: o operador pode confiar sem pensar. */
  curated?: boolean;
}

/** Afinidade de personalidade: complementa (não repete) o que o título já diz. */
function afinidade(display: FontMeta, body: FontMeta): number {
  const comuns = display.tags.filter((t) => body.tags.includes(t)).length;
  // um pouco de sobreposição é bom (mesma família de intenção); muita, achata
  if (comuns === 0) return 0.55;
  if (comuns === 1) return 1;
  if (comuns === 2) return 0.8;
  return 0.5;
}

function larguraCompativel(a: FontMeta, b: FontMeta): number {
  if (a.width && b.width && a.width !== b.width) return 0.7;
  // corpo condensado sob título normal parece apertado: desconta
  if (b.width === "condensed" && a.width !== "condensed") return 0.82;
  return 1;
}

/** Altura-x parecida mantém o texto no mesmo "peso" óptico do título. */
function alturaCompativel(a: FontMeta, b: FontMeta): number {
  if (!a.xHeight || !b.xHeight) return 1;
  if (a.xHeight === b.xHeight) return 1.05;
  if (a.xHeight === "low" && b.xHeight === "high") return 0.88;
  if (a.xHeight === "high" && b.xHeight === "low") return 0.92;
  return 1;
}

/** Família de intenção: evita devolver cinco fontes que dizem a mesma coisa. */
function intencao(fonte: FontMeta): string {
  const chaves = ["neutro", "tecnico", "amigavel", "elegante", "editorial", "funcional", "acolhedor", "expressivo"];
  return chaves.find((c) => fonte.tags.includes(c)) || fonte.category;
}

/** Nota de um par específico (null quando não faz sentido). */
export function scorePair(display: FontMeta, body: FontMeta): PairSuggestion | null {
  if (display.name === body.name) return null;
  if (body.category === "mono" && display.category !== "mono") return null;

  const consagrado = isCuratedPair(display.name, body.name);

  let base = 0;
  let motivo = "";

  if (["serif", "slab", "display"].includes(display.category) && body.category === "sans") {
    base = 90;
    motivo = "título com personalidade e texto neutro: o contraste clássico";
  } else if (display.category === "sans" && body.category === "sans") {
    base = display.tags.includes("geometrico") && body.tags.includes("neutro") ? 80 : 64;
    motivo = "duas sem serifa, com o título geométrico e o texto discreto";
  } else if (display.category === "sans" && ["serif", "slab"].includes(body.category)) {
    base = 46;
    motivo = "texto com serifa sob título sem serifa (menos comum, funciona em editorial)";
  } else if (["serif", "slab"].includes(display.category) && ["serif", "slab"].includes(body.category)) {
    base = 30;
    motivo = "duas serifas: só funciona com muito contraste de peso";
  } else if (display.category === "mono") {
    base = 60;
    motivo = "mono com mono, para tom técnico";
  } else {
    base = 40;
    motivo = "combinação de apoio";
  }

  if (display.tags.includes("expressivo") && body.tags.includes("expressivo")) base -= 35;
  if (body.tags.includes("impacto") && !display.tags.includes("impacto")) base -= 25;
  if (body.tags.includes("legivel") || body.tags.includes("neutro")) base += 4;

  // par escolhido a mão já é garantido: não precisa competir com a regra
  if (consagrado) {
    base = Math.max(base, 97);
    motivo = "par consagrado: combinação usada em site profissional há anos";
  }

  let score = Math.max(
    0,
    Math.min(100, Math.round(base * afinidade(display, body) * larguraCompativel(display, body) * alturaCompativel(display, body)))
  );
  // Par consagrado não é avaliado pela regra: quem escolheu foi gente, testando.
  // A nota vem da ordem da lista (a primeira combinação é a preferida), não do
  // cálculo — senão todos empatavam em 94 e a lista parecia arbitrária.
  if (consagrado) {
    const posicao = PARES_CONSAGRADOS.filter(([d]) => d === display.name).findIndex(([, b]) => b === body.name);
    score = Math.max(92, 100 - Math.max(0, posicao) * 2);
  }
  if (score < 40) return null;
  return { display: display.name, body: body.name, score, reason: motivo, curated: consagrado };
}

/**
 * Sugere fontes de texto para uma fonte de título.
 *
 * Devolve as melhores com o motivo e com diversidade: no máximo duas por família
 * de intenção, senão as cinco sugestões parecem a mesma fonte.
 */
export function suggestPairs(displayName: string, limite = 5): PairSuggestion[] {
  const display = findFont(displayName);
  if (!display) return [];

  const avaliados = CATALOGO.map((body) => scorePair(display, body)).filter((p): p is PairSuggestion => Boolean(p));
  const ordenados = avaliados.sort(
    (a, b) => Number(Boolean(b.curated)) - Number(Boolean(a.curated)) || b.score - a.score || a.body.localeCompare(b.body)
  );

  const usadas = new Map<string, number>();
  const escolhidas: PairSuggestion[] = [];
  for (const sugestao of ordenados) {
    // consagrado não entra na cota de diversidade: são poucos e todos bons
    if (!sugestao.curated) {
      const meta = findFont(sugestao.body)!;
      const chave = intencao(meta);
      const quantas = usadas.get(chave) || 0;
      if (quantas >= 2) continue;
      usadas.set(chave, quantas + 1);
    }
    escolhidas.push(sugestao);
    if (escolhidas.length >= limite) break;
  }
  return escolhidas;
}

/** Sugestões de título quando o operador parte do texto (caminho inverso). */
export function suggestDisplays(bodyName: string, limite = 5): PairSuggestion[] {
  const body = findFont(bodyName);
  if (!body) return [];
  return CATALOGO.filter((f) => f.name !== body.name)
    .map((display) => scorePair(display, body))
    .filter((p): p is PairSuggestion => Boolean(p))
    .sort((a, b) => Number(Boolean(b.curated)) - Number(Boolean(a.curated)) || b.score - a.score)
    .slice(0, limite);
}
