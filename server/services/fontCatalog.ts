/**
 * Catálogo de fontes e motor de combinação.
 *
 * A versão anterior tinha cinco pares fixos escolhidos pelo tom da marca. Funciona,
 * mas cinco combinações fazem todo site parecer o mesmo — e o cliente percebe.
 * Aqui o catálogo é maior e a combinação é calculada: escolhe-se a fonte do título
 * e o sistema sugere as de texto que casam com ela.
 *
 * As regras vêm de prática de tipografia, não de gosto:
 * - contraste de categoria (serifa de título + sans de texto) é o par mais seguro;
 * - duas fontes expressivas brigam: o display manda, o texto obedece;
 * - largura e altura-x parecidas evitam que uma pareça "colada" da outra;
 * - tags de personalidade precisam se complementar, não competir.
 *
 * O catálogo é estático de propósito: sem rede, sem chave, resultado determinístico
 * (testável). A API do Google Fonts pode alimentar uma expansão depois.
 */

export type FontCategory = "serif" | "sans" | "display" | "mono" | "slab";

export interface FontMeta {
  name: string;
  category: FontCategory;
  /** Personalidade em 2-4 tags: é o que decide a combinação. */
  tags: string[];
  /** Largura relativa, para não casar condensed com wide. */
  width?: "condensed" | "normal" | "wide";
  /** Altura-x aproximada: influencia a percepção de tamanho no mesmo corpo. */
  xHeight?: "low" | "medium" | "high";
}

/** Famílias que existem no Google Fonts, com metadados de combinação. */
export const CATALOGO: FontMeta[] = [
  // serifas
  { name: "Playfair Display", category: "serif", tags: ["elegante", "contraste", "editorial"], xHeight: "high" },
  { name: "Lora", category: "serif", tags: ["acolhedor", "humano", "calmo"], xHeight: "medium" },
  { name: "Merriweather", category: "serif", tags: ["editorial", "legivel", "solido"], xHeight: "high" },
  { name: "Libre Baskerville", category: "serif", tags: ["tradicional", "livro", "solido"], xHeight: "high" },
  { name: "Cormorant Garamond", category: "serif", tags: ["elegante", "delicado", "luxo"], xHeight: "low" },
  { name: "Spectral", category: "serif", tags: ["editorial", "calmo", "legivel"], xHeight: "medium" },
  { name: "Newsreader", category: "serif", tags: ["editorial", "jornal", "calmo"], xHeight: "medium" },
  { name: "Crimson Text", category: "serif", tags: ["livro", "tradicional", "calmo"], xHeight: "medium" },
  { name: "DM Serif Display", category: "serif", tags: ["elegante", "contraste", "moderno"], xHeight: "high" },
  { name: "Fraunces", category: "serif", tags: ["expressivo", "artesanal", "caloroso"], xHeight: "high" },
  { name: "Instrument Serif", category: "serif", tags: ["editorial", "delicado", "moderno"], xHeight: "medium" },
  { name: "Bitter", category: "slab", tags: ["solido", "industrial", "legivel"], xHeight: "high" },
  { name: "Zilla Slab", category: "slab", tags: ["tecnico", "moderno", "solido"], xHeight: "high" },
  { name: "Roboto Slab", category: "slab", tags: ["neutro", "solido", "tecnico"], xHeight: "high" },

  // sans neutras
  { name: "Inter", category: "sans", tags: ["neutro", "legivel", "interface"], xHeight: "high" },
  { name: "Manrope", category: "sans", tags: ["neutro", "moderno", "geometrico"], xHeight: "high" },
  { name: "Work Sans", category: "sans", tags: ["neutro", "funcional", "moderno"], xHeight: "high" },
  { name: "Public Sans", category: "sans", tags: ["neutro", "funcional", "institucional"], xHeight: "high" },
  { name: "DM Sans", category: "sans", tags: ["neutro", "moderno", "amigavel"], xHeight: "high" },
  { name: "Figtree", category: "sans", tags: ["neutro", "amigavel", "moderno"], xHeight: "high" },
  { name: "Onest", category: "sans", tags: ["neutro", "moderno", "tecnico"], xHeight: "high" },
  { name: "Geist", category: "sans", tags: ["neutro", "tecnico", "interface"], xHeight: "high" },
  { name: "Plus Jakarta Sans", category: "sans", tags: ["moderno", "amigavel", "geometrico"], xHeight: "high" },
  { name: "Mulish", category: "sans", tags: ["neutro", "leve", "legivel"], xHeight: "high" },
  { name: "Karla", category: "sans", tags: ["humano", "funcional", "leve"], xHeight: "medium" },
  { name: "Cabin", category: "sans", tags: ["humano", "amigavel", "legivel"], xHeight: "medium" },
  { name: "Heebo", category: "sans", tags: ["neutro", "legivel", "interface"], xHeight: "high" },
  { name: "Assistant", category: "sans", tags: ["neutro", "leve", "legivel"], xHeight: "medium" },
  { name: "Source Sans 3", category: "sans", tags: ["neutro", "funcional", "legivel"], xHeight: "high" },
  { name: "Nunito Sans", category: "sans", tags: ["acolhedor", "amigavel", "arredondado"], xHeight: "high" },
  { name: "Montserrat", category: "sans", tags: ["moderno", "geometrico", "solido"], xHeight: "high" },
  { name: "Poppins", category: "sans", tags: ["moderno", "geometrico", "amigavel"], xHeight: "high" },
  { name: "Raleway", category: "sans", tags: ["elegante", "leve", "editorial"], xHeight: "medium" },
  { name: "Rubik", category: "sans", tags: ["moderno", "amigavel", "solido"], xHeight: "high" },
  { name: "Outfit", category: "sans", tags: ["moderno", "geometrico", "limpo"], xHeight: "high" },
  { name: "Barlow", category: "sans", tags: ["funcional", "industrial", "neutro"], xHeight: "high" },
  { name: "Archivo", category: "sans", tags: ["tecnico", "grotesco", "solido"], xHeight: "high" },
  { name: "IBM Plex Sans", category: "sans", tags: ["tecnico", "institucional", "preciso"], xHeight: "high" },
  { name: "Space Grotesk", category: "sans", tags: ["tecnico", "moderno", "grotesco"], xHeight: "high" },
  { name: "Sora", category: "sans", tags: ["tecnico", "moderno", "geometrico"], xHeight: "high" },
  { name: "Epilogue", category: "sans", tags: ["moderno", "editorial", "contraste"], xHeight: "high" },
  { name: "Jost", category: "sans", tags: ["geometrico", "retro", "elegante"], xHeight: "medium" },
  { name: "Syne", category: "display", tags: ["expressivo", "criativo", "moderno"], width: "wide" },
  { name: "Unbounded", category: "display", tags: ["expressivo", "impacto", "moderno"], width: "wide" },
  { name: "Bricolage Grotesque", category: "display", tags: ["expressivo", "artesanal", "moderno"], xHeight: "high" },
  { name: "Instrument Sans", category: "sans", tags: ["moderno", "editorial", "neutro"], xHeight: "high" },
  { name: "Roboto", category: "sans", tags: ["neutro", "funcional", "universal"], xHeight: "high" },
  { name: "Open Sans", category: "sans", tags: ["neutro", "legivel", "universal"], xHeight: "high" },
  { name: "Lato", category: "sans", tags: ["neutro", "humano", "universal"], xHeight: "high" },
  { name: "PT Sans", category: "sans", tags: ["neutro", "institucional", "legivel"], xHeight: "high" },
  { name: "Noto Sans", category: "sans", tags: ["neutro", "universal", "legivel"], xHeight: "high" },
  { name: "Roboto Condensed", category: "sans", tags: ["condensado", "funcional", "industrial"], width: "condensed", xHeight: "high" },
  { name: "Oswald", category: "display", tags: ["condensado", "impacto", "industrial"], width: "condensed", xHeight: "high" },
  { name: "Archivo Narrow", category: "sans", tags: ["condensado", "editorial", "funcional"], width: "condensed", xHeight: "high" },
  { name: "Anton", category: "display", tags: ["impacto", "condensado", "esportivo"], width: "condensed", xHeight: "high" },
  { name: "IBM Plex Mono", category: "mono", tags: ["tecnico", "codigo", "preciso"] },
  { name: "JetBrains Mono", category: "mono", tags: ["tecnico", "codigo", "moderno"] },
  { name: "Space Mono", category: "mono", tags: ["tecnico", "retro", "expressivo"] },
  { name: "Courier Prime", category: "mono", tags: ["maquina", "editorial", "retro"] },
];

export function findFont(name: string): FontMeta | undefined {
  const alvo = String(name || "").trim().toLowerCase();
  return CATALOGO.find((f) => f.name.toLowerCase() === alvo);
}

export function fontNames(): string[] {
  return CATALOGO.map((f) => f.name);
}

export interface PairSuggestion {
  display: string;
  body: string;
  /** 0–100, para ordenar. */
  score: number;
  reason: string;
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

/**
 * Sugere fontes de texto para uma fonte de título.
 *
 * Devolve as 5 melhores, sempre com o motivo — o operador precisa entender a
 * escolha, senão vira loteria.
 */
/** Nota de um par específico (0 quando não faz sentido). */
export function scorePair(display: FontMeta, body: FontMeta): PairSuggestion | null {
  if (display.name === body.name) return null;
  if (body.category === "mono" && display.category !== "mono") return null;

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

  const score = Math.max(
    0,
    Math.min(100, Math.round(base * afinidade(display, body) * larguraCompativel(display, body) * alturaCompativel(display, body)))
  );
  if (score < 40) return null;
  return { display: display.name, body: body.name, score, reason: motivo };
}

/**
 * Sugere fontes de texto para uma fonte de título.
 *
 * Devolve as melhores com o motivo, com diversidade: no máximo duas por família
 * de intenção, senão as cinco sugestões parecem a mesma fonte.
 */
export function suggestPairs(displayName: string, limite = 5): PairSuggestion[] {
  const display = findFont(displayName);
  if (!display) return [];

  const avaliados = CATALOGO.map((body) => scorePair(display, body)).filter((p): p is PairSuggestion => Boolean(p));
  const ordenados = avaliados.sort((a, b) => b.score - a.score || a.body.localeCompare(b.body));

  const usadas = new Map<string, number>();
  const escolhidas: PairSuggestion[] = [];
  for (const sugestao of ordenados) {
    const meta = findFont(sugestao.body)!;
    const chave = intencao(meta);
    const quantas = usadas.get(chave) || 0;
    if (quantas >= 2) continue;
    usadas.set(chave, quantas + 1);
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
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}
