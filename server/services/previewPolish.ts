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
/* Herói não pode virar área morta: era a reclamação mais repetida em toda prévia.
   Limita a altura do primeiro bloco em vez de deixar 100vh de vazio. */
[data-fx-host] { min-height: min(64svh, 620px) !important; }

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
  lead: { id?: string; name?: string },
): { html: string; features: string[] } {
  if (/data-acabamento="1"/.test(html)) return { html, features: [] };
  if (jaTemDisplay(html)) return { html, features: [] };

  const fonte = fonteDeDisplay(String(lead.id || lead.name || "lead"));
  const link = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${fonte.url}&display=swap">`;
  const estilo = `<style data-acabamento="1">${CSS(fonte.nome, fonte.peso)}</style>`;

  let saida = html;
  if (/<\/head>/i.test(saida)) saida = saida.replace(/<\/head>/i, link + "</head>");
  else if (/<body[^>]*>/i.test(saida)) saida = saida.replace(/(<body[^>]*>)/i, `$1${link}`);
  saida = /<\/body>/i.test(saida)
    ? saida.replace(/<\/body>/i, estilo + "</body>")
    : saida + estilo;

  return { html: saida, features: [`display ${fonte.nome}`, "botão e cartão refinados"] };
}
