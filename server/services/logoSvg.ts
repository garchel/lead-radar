/**
 * Logo em SVG gerado da identidade coletada.
 *
 * A pesquisa às vezes acha a logo real (JPG pequeno, fundo branco, recortado torto)
 * e às vezes só acha foto da fachada. Colocar foto pequena no topo parece
 * amador; pôr um PNG de 40px estoura na retina. O SVG resolve os dois casos:
 * monograma com as iniciais na cor da marca, nítido em qualquer tamanho, e sem
 * depender de arquivo externo carregar.
 *
 * Quando a logo real existe e a IA confia, ela continua sendo usada no topo — o
 * SVG é o padrão e o plano B.
 */

export interface LogoOptions {
  accent: string;
  onAccent: string;
  /** Cor do texto do wordmark. */
  ink?: string;
  /** 0–1: raio do canto, proporcional ao tamanho. */
  radiusRatio?: number;
}

export function monogramOf(name: string): string {
  const partes = String(name || "")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 && !/^(dra|dr|dra\.|dr\.)$/i.test(p));
  const base = partes.length ? partes : String(name || "").split(/\s+/).filter(Boolean);
  const iniciais = (base.length >= 2 ? [base[0], base[base.length - 1]] : base).map((p) => p[0]?.toUpperCase() || "");
  return iniciais.join("").slice(0, 2) || "•";
}

/** Monograma quadrado (usado no cabeçalho da prévia). */
export function monogramSvg(name: string, opts: LogoOptions, size = 36): string {
  const iniciais = monogramOf(name);
  const raio = Math.round(size * (opts.radiusRatio ?? 0.3));
  const fonte = Math.round(size * 0.36);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(name)}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${raio}" fill="${opts.accent}" />
  <text x="50%" y="50%" dy="0.35em" text-anchor="middle" fill="${opts.onAccent}"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"
        font-size="${fonte}" font-weight="700" letter-spacing="0.02em">${escapeXml(iniciais)}</text>
</svg>`;
}

/**
 * Assinatura horizontal: monograma + nome. Serve para o arquivo `logo-<slug>.svg`
 * que fica publicado junto da prévia (dá para reaproveitar no site final).
 */
export function wordmarkSvg(
  name: string,
  subtitle: string,
  opts: LogoOptions,
  largura = 520
): string {
  const iniciais = monogramOf(name);
  const altura = 120;
  const nomeFonte = 34;
  const nomeCortado = String(name || "").length > 26 ? `${String(name).slice(0, 25)}…` : String(name || "");
  return `<svg width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${escapeXml(name)}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="30" width="60" height="60" rx="18" fill="${opts.accent}" />
  <text x="30" y="60" dy="0.35em" text-anchor="middle" fill="${opts.onAccent}"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"
        font-size="22" font-weight="700">${escapeXml(iniciais)}</text>
  <text x="76" y="60" dy="0.35em" fill="${opts.ink || "#141414"}"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"
        font-size="${nomeFonte}" font-weight="700" letter-spacing="-0.6">${escapeXml(nomeCortado)}</text>
  <text x="77" y="84" dy="0.35em" fill="#6b6f76"
        font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif"
        font-size="14" font-weight="500" letter-spacing="0.6">${escapeXml(String(subtitle || "").toUpperCase().slice(0, 44))}</text>
</svg>`;
}

function escapeXml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
