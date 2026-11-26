/**
 * Camada visual determinística.
 *
 * O dono reclamou, com razão, que a prévia saía "crua: só blocos e texto".
 * A regra de não usar foto raspada da internet é boa e continua de pé — o que
 * faltava era ARTE PRÓPRIA: composição abstrata desenhada por código, com a
 * paleta do cliente, sempre presente, sem depender do modelo lembrar.
 *
 * Tudo aqui é SVG/CSS puro, derivado de um hash do lead: 2 a 4 KB por página,
 * nenhuma requisição externa, e cada empresa recebe uma variante diferente.
 */

export type Cores = string[];

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function alpha(hex: string, a: number): string {
  const limpo = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(limpo)) return `rgba(0,0,0,${a})`;
  const n = parseInt(limpo, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Variante de arte escolhida pelo hash — a mesma empresa recebe sempre a mesma. */
export function varianteDeArte(id: string): number {
  return hash(String(id || "lead")) % 5;
}

function halftone(cor: string): string {
  const bolinhas = Array.from({ length: 9 }, (_, lin) => {
    const raio = 1.6 + lin * 0.7;
    return Array.from({ length: 9 }, (_, col) => {
      const cx = 40 + col * 40;
      const cy = 40 + lin * 40;
      return `<circle cx="${cx}" cy="${cy}" r="${raio.toFixed(1)}"/>`;
    }).join("");
  }).join("");
  return `<svg class="fx-a" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><radialGradient id="fxm" cx="72%" cy="18%" r="78%">
<stop offset="0" stop-color="#fff" stop-opacity="0.85"/>
<stop offset="1" stop-color="#fff" stop-opacity="0"/>
</radialGradient>
<mask id="fxmask"><rect width="400" height="400" fill="url(#fxm)"/></mask></defs>
<g fill="${alpha(cor, 0.55)}" mask="url(#fxmask)">${bolinhas}</g></svg>`;
}

function arcos(cor: string): string {
  const aneis = [40, 72, 104, 136, 168, 200, 232]
    .map((r, i) => `<circle cx="330" cy="70" r="${r}" fill="none" stroke="${alpha(cor, 0.32 - i * 0.03)}" stroke-width="1.4"/>`)
    .join("");
  return `<svg class="fx-a" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${aneis}</svg>`;
}

function faixas(cor: string): string {
  const listras = Array.from({ length: 16 }, (_, i) => {
    const x = -200 + i * 46;
    return `<rect x="${x}" y="-100" width="18" height="600" fill="${alpha(cor, 0.16)}" transform="rotate(24 200 200)"/>`;
  }).join("");
  return `<svg class="fx-a" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${listras}</svg>`;
}

function malha(cores: Cores): string {
  const a = cores[0] || "#1a3a5a";
  const b = cores[1] || a;
  const c = cores[2] || b;
  return `<div class="fx-a fx-malha" aria-hidden="true" style="background:
radial-gradient(58% 48% at 78% 12%, ${alpha(a, 0.55)} 0%, transparent 62%),
radial-gradient(46% 42% at 12% 82%, ${alpha(b, 0.42)} 0%, transparent 68%),
radial-gradient(70% 60% at 50% 50%, ${alpha(c, 0.22)} 0%, transparent 72%);"></div>`;
}

/**
 * Monograma = INICIAIS. Antes esta variante escrevia o nome do negócio em 150px
 * repetido no herói, e isso virava "letreiro gigante do nome" em toda página que
 * caía aqui — o nome grande e cortado pelas bordas é justamente o que não se quer.
 */
function monograma(nome: string, cor: string): string {
  const partes = String(nome || "V")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1);
  const iniciais = (partes.slice(0, 2).map((p) => p[0]).join("") || "V").toUpperCase();
  return `<div class="fx-a fx-mono" aria-hidden="true" style="color:${alpha(cor, 0.14)}">
<span>${iniciais}</span></div>`;
}

const CSS = `
.fx-arte{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden;border-radius:inherit}
.fx-arte .fx-a{position:absolute;inset:0;width:100%;height:100%;display:block}
.fx-mono{display:flex;flex-direction:column;justify-content:space-between;padding:18px 20px;
  font-weight:800;letter-spacing:-0.04em;line-height:.82;font-size:clamp(64px,22vw,150px);overflow:hidden}
.fx-mono span{white-space:nowrap;display:block}
[data-fx-host]{position:relative;isolation:isolate}
[data-fx-host] > *:not(.fx-arte):not(.fx-canvas){position:relative;z-index:1}
@media (prefers-reduced-motion:no-preference){.fx-arte{opacity:1}}
/* Moldura de imagem: área desenhada, nunca esqueleto de carregamento. */
.media-slot,[data-slot]{border:0!important;background-color:rgba(127,127,127,.10)!important;
  background-image:radial-gradient(rgba(127,127,127,.28) 1px, transparent 1px)!important;
  background-size:12px 12px!important;border-radius:14px!important;min-height:150px}
.media-slot *,[data-slot] *{opacity:.85}
`;

/** Devolve o bloco de arte e a variante usada. */
export function arteDoLead(lead: { id?: string; name?: string }, cores: Cores = []): { html: string; variante: string } {
  const id = String(lead.id || lead.name || "lead");
  const n = varianteDeArte(id);
  const base = cores.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const cor = base[0] || "#1a3a5a";
  const variantes = ["halftone", "arcos", "faixas", "malha", "monograma"];
  const conteudo =
    n === 0 ? halftone(base[1] || cor)
    : n === 1 ? arcos(base[1] || cor)
    : n === 2 ? faixas(base[1] || cor)
    : n === 3 ? malha(base)
    : monograma(lead.name || "", cor);
  return { html: `<div class="fx-arte fx-arte--${variantes[n]}">${conteudo}</div>`, variante: variantes[n] };
}

/** Acha a abertura do herói (mesma lógica do kit de movimento). */
function acharHeroi(html: string): { abre: string; indice: number } | null {
  const posH1 = html.search(/<h1[\s>]/i);
  if (posH1 < 0) return null;
  const antes = html.slice(0, posH1);
  const m = [...antes.matchAll(/<(section|header|main)\b[^>]*>/gi)].pop();
  if (!m || m.index === undefined) return null;
  return { abre: m[0], indice: m.index + m[0].length };
}

/**
 * Injeta a arte no herói e garante que qualquer moldura de imagem pareça
 * desenhada (padrão de pontos) em vez de retângulo tracejado.
 */
export function enfeitarPagina(
  html: string,
  lead: { id?: string; name?: string },
  cores: Cores = [],
): { html: string; features: string[] } {
  if (/class="fx-arte/.test(html)) return { html, features: [] };
  const heroi = acharHeroi(html);
  if (!heroi) return { html, features: [] };

  const { html: arte, variante } = arteDoLead(lead, cores);
  const abre = /data-fx-host/.test(heroi.abre)
    ? heroi.abre
    : heroi.abre.replace(/>$/, ' data-fx-host="1">');
  let saida = html.replace(heroi.abre, abre + arte);

  // SEM divisor de pontos e SEM marca d'água no canto: os dois eram injetados em
  // TODA página, sempre no mesmo lugar, e isso é template — a página passava a ter
  // a mesma ornamentação independente do negócio. A arte fica só no herói, onde o
  // modelo a pediu, e o resto da página é decisão dele.

  const estilo = `<style>${CSS}</style>`;
  saida = /<\/body>/i.test(saida)
    ? saida.replace(/<\/body>/i, estilo + "</body>")
    : saida + estilo;

  return { html: saida, features: [`arte ${variante} no hero`] };
}
