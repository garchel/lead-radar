/**
 * Cartão da paleta (imagem para o WhatsApp).
 *
 * A paleta em texto ("🟡 Dourado #E5D399") é útil, mas imagem vende melhor: o lead
 * vê o conjunto, entende que existe trabalho de design e responde sobre o que
 * está vendo. Então a mensagem vai como **imagem com legenda**, não como lista.
 *
 * Composição: SVG (texto e layout em código, sem fonte externa) → PNG 1080×1350
 * via sharp. O formato retrato ocupa a tela do celular sem cortar.
 */
import sharp from "sharp";
import type { StoredLead } from "../store/types";
import type { PaletteEntry } from "./paletteService";
import { monogramOf } from "./logoSvg";

export interface PaletteCardOptions {
  accent: string;
  onAccent: string;
  /** Nome do negócio como aparece no cartão. */
  businessName: string;
  category: string;
  city?: string;
}

function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textoLegivel(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#141414";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? "#141414" : "#ffffff";
}

/** SVG do cartão. Separado do PNG para poder ser testado sem rasterizar. */
export function paletteCardSvg(entries: PaletteEntry[], opts: PaletteCardOptions): string {
  const W = 1080;
  const H = 1350;
  const M = 78;
  const largura = W - M * 2;
  const alturaBloco = 168;
  const gap = 22;
  const iniciais = monogramOf(opts.businessName);
  const nome = opts.businessName.length > 28 ? `${opts.businessName.slice(0, 27)}…` : opts.businessName;
  const sub = [opts.category, opts.city].filter(Boolean).join(" · ").toUpperCase();

  const blocos = entries
    .slice(0, 4)
    .map((cor, i) => {
      const y = 392 + i * (alturaBloco + gap);
      const tinta = textoLegivel(cor.hex);
      return `
    <g>
      <rect x="${M}" y="${y}" width="${largura}" height="${alturaBloco}" rx="26" fill="${cor.hex}" stroke="#e2ded8" stroke-width="2" />
      <text x="${M + 34}" y="${y + alturaBloco - 78}" fill="${tinta}" font-family="Helvetica Neue, Arial, sans-serif" font-size="34" font-weight="600">${esc(
        cor.name.charAt(0).toUpperCase() + cor.name.slice(1)
      )}</text>
      <text x="${M + 34}" y="${y + alturaBloco - 34}" fill="${tinta}" opacity="0.9" font-family="Menlo, Consolas, monospace" font-size="24" letter-spacing="1.5">${esc(
        cor.hex.toUpperCase()
      )}</text>
      <text x="${W - M - 34}" y="${y + 58}" text-anchor="end" fill="${tinta}" opacity="0.8" font-family="Helvetica Neue, Arial, sans-serif" font-size="22" font-weight="600" letter-spacing="2">0${i + 1}</text>
    </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#faf8f5" />

  <g>
    <rect x="${M}" y="${M}" width="86" height="86" rx="24" fill="${opts.accent}" />
    <text x="${M + 43}" y="${M + 43}" dy="0.35em" text-anchor="middle" fill="${textoLegivel(opts.accent)}" font-family="Helvetica Neue, Arial, sans-serif" font-size="30" font-weight="700">${esc(
      iniciais
    )}</text>
    <text x="${M + 108}" y="${M + 40}" fill="#141414" font-family="Helvetica Neue, Arial, sans-serif" font-size="38" font-weight="700" letter-spacing="-0.8">${esc(
      nome
    )}</text>
    <text x="${M + 109}" y="${M + 72}" fill="#6b6f76" font-family="Helvetica Neue, Arial, sans-serif" font-size="19" letter-spacing="2.4">${esc(
      sub
    )}</text>
  </g>

  <text x="${M}" y="272" fill="#141414" font-family="Helvetica Neue, Arial, sans-serif" font-size="52" font-weight="700" letter-spacing="-1.4">Paleta de cores</text>
  <text x="${M}" y="316" fill="#54585f" font-family="Helvetica Neue, Arial, sans-serif" font-size="24">As cores que identifiquei na sua marca</text>

  ${blocos}

  <line x1="${M}" y1="${H - 132}" x2="${W - M}" y2="${H - 132}" stroke="#e7e5e1" stroke-width="2" />
  <text x="${M}" y="${H - 84}" fill="#54585f" font-family="Helvetica Neue, Arial, sans-serif" font-size="23" font-weight="600">Prévia · Vértice Páginas Web</text>
  <text x="${W - M}" y="${H - 84}" text-anchor="end" fill="#54585f" font-family="Helvetica Neue, Arial, sans-serif" font-size="23">Envie sua opinião nesta conversa</text>
</svg>`;
}

/** PNG 1080×1350 pronto para o WhatsApp. */
export async function paletteCardPng(entries: PaletteEntry[], opts: PaletteCardOptions): Promise<Buffer> {
  const svg = paletteCardSvg(entries, opts);
  return sharp(Buffer.from(svg, "utf8"), { density: 144 }).png({ compressionLevel: 9 }).toBuffer();
}

/** Nome de arquivo estável por lead (vira o media URL enviado ao gateway). */
export function paletteCardFileName(lead: StoredLead, slug: string): string {
  const base = slug || "previa";
  return `paleta-${base}.png`;
}
