/**
 * Camada de acabamento.
 *
 * O dono disse que a página "ainda parece barato". Percepção de barato não vem
 * de falta de elemento — vem de primitivos pobres: uma fonte só, botão chapado,
 * título sem tracking, texto sem controle de quebra e sombras pesadas.
 *
 * Aqui a gente corrige esses primitivos POR CÓDIGO, depois do modelo, com
 * escolhas determinísticas por lead.
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

/**
 * Serifadas de display com personalidade real. Todas com corte variável e
 * disponíveis no Google Fonts. A escolha é por hash: a mesma empresa recebe
 * sempre a mesma, empresas diferentes recebem diferentes.
 */
const DISPLAY = [
  { nome: "Fraunces", url: "Fraunces:opsz,wght@9..144,400;9..144,600", peso: "600" },
  { nome: "Instrument Serif", url: "Instrument+Serif:ital@0;1", peso: "400" },
  { nome: "Newsreader", url: "Newsreader:opsz,wght@6..72,400;6..72,500", peso: "500" },
  { nome: "DM Serif Display", url: "DM+Serif+Display:ital@0;1", peso: "400" },
  { nome: "Bricolage Grotesque", url: "Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700", peso: "600" },
];

export function fonteDeDisplay(id: string): { nome: string; url: string; peso: string } {
  return DISPLAY[hash(String(id || "lead")) % DISPLAY.length];
}

/** O modelo já escolheu uma serifada? Então não mexe. */
function jaTemDisplay(css: string): boolean {
  return /(Playfair|Georgia|DM Serif|Fraunces|Newsreader|Instrument Serif|Cormorant|Lora|Merriweather|Libre Baskerville|Bricolage)/i.test(css);
}

const CSS = (fonte: string, peso: string) => `
/* Herói não pode virar área morta — é a reclamação mais repetida em toda prévia.
   Causa: o modelo escreve min-height/height de 100vh e um padding-bottom enorme
   (já vi 224px), então o conteúdo fica espremido no topo e sobra um buraco.
   Aqui o herói passa a ter a ALTURA DO CONTEÚDO e respiro normalizado. */
[data-fx-host] {
  min-height: 0 !important;
  height: auto !important;
  max-height: none !important;
}
[data-fx-host] > * { min-height: 0 !important; }

/* Respiro simétrico no herói: antes o padding de baixo (88px) somava com o de cima
   da seção seguinte (96px) e o CTA ficava flutuando num vão de 184px. */
[data-fx-host] { padding-block: clamp(40px, 6vw, 72px) !important; }

/* SVG decorativo do modelo dentro do herói não pode tomar a dobra inteira. Medido
   numa página real: o herói tinha 2313px e um <svg> decorativo com 1425px empurrava
   o <h1> para 1650px do topo — a manchete começava na segunda tela. Zerar altura de
   [data-fx-host] não pega isto, porque quem define a altura é o SVG filho. Com o teto
   de 58vh o título subiu para 746px. A arte injetada (.fx-arte) fica de fora: ela é
   absoluta e precisa continuar cobrindo o herói. */
[data-fx-host] svg { max-height: 58vh !important; height: auto !important; }
[data-fx-host] .fx-arte svg { height: 100% !important; max-height: none !important; }
[data-fx-host] + section, [data-fx-host] + figure, [data-fx-host] + div {
  padding-top: clamp(24px, 4vw, 48px) !important;
  margin-top: 0 !important;
}

/* O modelo quebra o título em um <span> por palavra (display:block), e isso força
   "no Santos / Dumont." com a última palavra órfã. Em título, span é inline. */
h1 span { display: inline !important; }
/* O modelo aplica text-transform em cada palavra e "BarbeaRia" aparece com R maiúsculo
   no meio. Em título, o texto é como o cliente escreveu. */
h1 span, h1 em, h1 strong { text-transform: none !important; }
h1 br { display: none !important; }
[data-fx-host] > .fx-arte, [data-fx-host] > .fx-canvas {
  position: absolute !important;
  inset: 0;
}

/* Tipografia de display: dá voz ao título, que é 80% da impressão de qualidade. */
h1, h2, .display {
  font-family: "${fonte}", "Iowan Old Style", Georgia, serif !important;
  font-weight: ${peso} !important;
  letter-spacing: -0.025em !important;
  font-optical-sizing: auto;
  text-wrap: balance;
}
/* Quebra de texto controlada: elimina a linha órfã e o parágrafo "quadrado". */
p, li, blockquote { text-wrap: pretty; }
h3, h4 { letter-spacing: -0.01em; }

/* UM sistema de botão só: o cabeçalho tinha pílula com contorno e o herói um
   retângulo chapado — duas linguagens na mesma tela lê como colagem. */
header a[href*="wa.me"], header a[href*="whatsapp"] {
  background: transparent !important; color: inherit !important;
  border: 1px solid currentColor !important; padding: 10px 16px !important;
  border-radius: 999px !important; font-size: 13px !important;
  letter-spacing: 0.06em; text-transform: uppercase;
}

/* Título no celular: 44px em 360px quebra em quatro linhas e deixa "em" sozinho. */
@media (max-width: 520px) {
  h1 { font-size: clamp(32px, 8.2vw, 40px) !important; line-height: 1.02 !important; }
}

/* DESKTOP: o modelo escalava o título com vw e chegava a 120px em 1440 — cinco
   linhas de manchete com corpo de 15px embaixo. Era isso que fazia a página parecer
   ruim na tela do computador. Aqui o título fica em 2 a 3 linhas e o corpo cresce. */
/* TELA LARGA: em monitor de 2000px+ o container travado em 1120 deixa quase metade
   da tela em branco — foi exatamente o que o dono viu e chamou de amador. O conteúdo
   cresce com a tela, sem passar do ponto em que a linha fica longa. */
/* Largura FLUIDA, não faixas fixas: a página tem que funcionar de 320 a 2560px,
   não só na tela de quem testou. O conteúdo ocupa 92vw até o teto de 1400px e
   centraliza sempre. Seção fica full-bleed: limitar a seção corta o fundo. */
@media (min-width: 900px) {
  .wrap, .container, .page, .inner {
    max-width: min(1400px, 92vw) !important;
    margin-inline: auto !important;
    padding-inline: clamp(20px, 3vw, 48px);
  }
}
/* Ultrawide: 1400px num monitor de 2560 deixa 45% vazio. Cresce mais um degrau. */
@media (min-width: 2000px) {
  .wrap, .container, .page, .inner { max-width: min(1640px, 92vw) !important; }
}

@media (min-width: 900px) {
  h1 { font-size: clamp(44px, 5.2vw, 78px) !important; line-height: 1.02 !important; }
  p, li { font-size: max(17px, 1em); }
  blockquote, blockquote p { font-size: max(20px, 1em); }
  /* GRID LARGO, TEXTO ESTREITO: com contentor fluido o parágrafo esticava até 299
     caracteres por linha em 2560px. A coluna de leitura fica entre 45 e 75ch. */
  p, li, dd { max-width: 64ch; }
  blockquote, blockquote p { max-width: 44ch; }
}

/* Botão refinado: sem sombra pesada, com fio interno e respiro real. */
a[href*="wa.me"], a[href*="whatsapp"], .botao, .btn, button {
  letter-spacing: 0.01em;
  font-weight: 600 !important;
  padding: 15px 24px !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  border: 1px solid rgba(255,255,255,0.14);
  transition: transform .18s cubic-bezier(.16,1,.3,1), filter .18s;
}
a[href*="wa.me"]:hover, .botao:hover, .btn:hover, button:hover { filter: brightness(1.08); }
a[href*="wa.me"]:active, .botao:active, .btn:active, button:active { transform: scale(.985); }

/* Cartão: fio fino no lugar de sombra borrada — é o que separa "moderno" de "2014". */
.card, .cartao, [class*="card"], [class*="cartao"] {
  box-shadow: none !important;
  border: 1px solid rgba(127,127,127,0.22) !important;
  border-radius: 14px !important;
}

/* Rótulo em caixa alta: precisa de tracking largo, senão parece erro de digitação. */
[class*="eyebrow"], [class*="rotulo"], [class*="label"], .kicker {
  letter-spacing: 0.14em !important;
  text-transform: uppercase;
}

/* Números e dados: alinhamento tabular para não "dançar". */
[class*="numero"], [class*="stat"], [class*="nota"] { font-variant-numeric: tabular-nums; }

/* Seleção e foco com a cor da marca, não com o azul do navegador. */
::selection { background: rgba(127,127,127,.28); }
`;

/**
 * Aplica o acabamento. Não mexe em página que já tem serifada de display nem
 * em página sem herói.
 */
export function refinarPagina(
  html: string,
  lead: { id?: string; name?: string; city?: string },
): { html: string; features: string[] } {
  if (/data-acabamento="1"/.test(html)) return { html, features: [] };
  if (jaTemDisplay(html)) return { html, features: [] };

  const fonte = fonteDeDisplay(String(lead.id || lead.name || "lead"));
  const link = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fonte.url}&display=swap">`;
  const estilo = `<style data-acabamento="1">${CSS(fonte.nome, fonte.peso)}</style>`;

  let saida = html;

  // Cidade no título não quebra entre linhas: "Três / Lagoas" parece erro de digitação.
  const cidade = String(lead.city || "").trim();
  if (cidade.length > 3) {
    const junto = cidade.replace(/\s+/g, "&nbsp;");
    const reTitulo = /(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i;
    const m = saida.match(reTitulo);
    if (m && m[2].toLowerCase().includes(cidade.toLowerCase())) {
      const titulo = m[2].replace(new RegExp(cidade.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), junto);
      saida = saida.replace(reTitulo, `${m[1]}${titulo}${m[3]}`);
    }
  }
  if (/<\/head>/i.test(saida)) saida = saida.replace(/<\/head>/i, link + "</head>");
  else if (/<body[^>]*>/i.test(saida)) saida = saida.replace(/(<body[^>]*>)/i, `$1${link}`);
  saida = /<\/body>/i.test(saida)
    ? saida.replace(/<\/body>/i, estilo + "</body>")
    : saida + estilo;

  return { html: saida, features: [`display ${fonte.nome}`, "botão e cartão refinados"] };
}
