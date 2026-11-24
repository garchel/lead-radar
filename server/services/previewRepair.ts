/**
 * Reparo determinístico da página gerada.
 *
 * O gerador reprova por detalhe de acabamento que dá para consertar sem reescrever
 * a página: alvo de toque pequeno, texto miúdo, transbordo de 2px, barra fixa
 * cobrindo o rodapé, conteúdo esperando JavaScript. Antes, cada reprovação custava
 * uma nova geração inteira (40 a 60s) e, na segunda falha, a página boa era jogada
 * no template. Aqui a gente corrige e só regenera se ainda faltar algo de verdade.
 */

export interface ReparoAplicado {
  problema: string;
  correcao: string;
}

export interface ResultadoReparo {
  html: string;
  reparos: ReparoAplicado[];
}

const CSS_REPAROS = `
/* reparos da prévia (gerados automaticamente) */
html, body { overflow-x: hidden; }
img, svg, video, iframe { max-width: 100%; height: auto; }
body { padding-bottom: 110px; }
:where(p, li, span, small, figcaption) { font-size: max(13px, 1em); }
a[href*="wa.me"], button, [role="button"] {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
`;

/** Remove declarações `opacity:0` fora de @keyframes: conteúdo que some sem JS. */
export function removerOpacidadeZero(html: string): string {
  let saida = "";
  let i = 0;
  while (i < html.length) {
    const inicio = html.indexOf("@keyframes", i);
    if (inicio === -1) {
      saida += html.slice(i).replace(/opacity\s*:\s*0(?![.\d])/gi, "opacity:1");
      break;
    }
    saida += html.slice(i, inicio).replace(/opacity\s*:\s*0(?![.\d])/gi, "opacity:1");
    let j = html.indexOf("{", inicio);
    if (j === -1) {
      saida += html.slice(inicio);
      break;
    }
    let nivel = 0;
    for (; j < html.length; j++) {
      if (html[j] === "{") nivel++;
      else if (html[j] === "}") {
        nivel--;
        if (nivel === 0) {
          j++;
          break;
        }
      }
    }
    saida += html.slice(inicio, j);
    i = j;
  }
  return saida;
}

/** Slot de imagem padrão, para página que esqueceu de reservar o espaço. */
function slotPadrao(rotulo = "Foto do espaço"): string {
  return `<figure class="media-slot" data-slot="hero" aria-label="Espaço reservado para imagem">
      <div style="aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;gap:10px;border-radius:16px;background:rgba(0,0,0,0.06)">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M4 17l5-5 4 4 3-3 4 4" />
        </svg>
        <span style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.75">${rotulo}</span>
      </div>
    </figure>`;
}

/**
 * Aplica os reparos possíveis. `problemas` vem da auditoria/portão; quando vazio,
 * aplica a base de segurança (overflow, respiro do rodapé, tamanho mínimo de toque).
 */
export function repararPagina(html: string, problemas: string[] = []): ResultadoReparo {
  const reparos: ReparoAplicado[] = [];
  let saida = String(html || "");
  const juntar = problemas.join(" \n ").toLowerCase();

  // 1) opacidade: some sem JS
  const semOpacidade = removerOpacidadeZero(saida);
  if (semOpacidade !== saida) {
    reparos.push({ problema: "conteúdo com opacity:0", correcao: "opacidade forçada para 1" });
    saida = semOpacidade;
  }

  // 2) slot de imagem obrigatório
  // Só insere moldura quando a própria página pediu uma (tem <figure> de mídia sem
  // data-slot). Página sem foto não ganha retângulo vazio.
  if (/<figure[^>]*class=["'][^"']*media-slot/i.test(saida) && !/data-slot=["'][^"']+["']/i.test(saida)) {
    // Onde encaixar: depois da primeira seção; se a página não usa <section>,
    // depois do <h1>; e, na falta dos dois, logo na abertura do <body>.
    const marcas = ["</section>", "</header>", "</main>", "</h1>"];
    let corte = -1;
    for (const marca of marcas) {
      const pos = saida.indexOf(marca);
      if (pos > 0) {
        corte = pos + marca.length;
        break;
      }
    }
    if (corte < 0) {
      const corpo = saida.match(/<body[^>]*>/i);
      if (corpo?.index !== undefined) corte = corpo.index + corpo[0].length;
    }
    if (corte > 0) {
      saida = saida.slice(0, corte) + "\n" + slotPadrao() + "\n" + saida.slice(corte);
      reparos.push({ problema: "sem espaço reservado para imagem", correcao: "bloco de imagem inserido no início do conteúdo" });
    }
  }

  // 3) CSS de segurança: transbordo, toque, texto miúdo, rodapé atrás da barra fixa
  const precisaCss =
    juntar.includes("transbordo") ||
    juntar.includes("alvo") ||
    juntar.includes("fonte") ||
    juntar.includes("barra fixa") ||
    /<button|<a\s/i.test(saida);
  if (precisaCss && !saida.includes("reparos da prévia")) {
    const estilo = `<style id="reparos-previa">${CSS_REPAROS}</style>`;
    if (/<\/head>/i.test(saida)) saida = saida.replace(/<\/head>/i, `${estilo}\n</head>`);
    else saida = estilo + saida;
    reparos.push({
      problema: "acabamento (toque, fonte, transbordo, rodapé)",
      correcao: "CSS de garantia injetado",
    });
  }

  // 4) container de celular no desktop: página com 640px de largura e o resto da
  // tela em branco. Sobe a largura dos containers que estão abaixo de 900px.
  const antesLargura = saida;
  saida = saida.replace(
    /((?:^|\})\s*(?:body|main|\.wrap|\.container|\.page|\.site|\.content|\.wrapper)[^{]{0,80}\{[^}]*?)max-width\s*:\s*(\d{2,4})px/gi,
    (trecho, inicio, valor) => {
      const px = Number(valor);
      if (!Number.isFinite(px) || px >= 900) return trecho;
      return `${inicio}max-width: 1120px`;
    },
  );
  if (saida !== antesLargura) {
    reparos.push({ problema: "container limitado à largura de celular", correcao: "largura do container elevada para 1120px" });
  }

  return { html: saida, reparos };
}
