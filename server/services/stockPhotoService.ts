/**
 * Fotos de banco licenciado.
 *
 * Regra antiga: nunca usar foto raspada da internet. Regra nova (decisão do dono):
 * pode usar banco LICENCIADO, com crédito — o que não pode é pegar imagem de site
 * alheio ou apresentar foto de outra empresa como se fosse do cliente.
 *
 * Fonte primária: Openverse (API pública, sem chave, agrega CC0/CC-BY).
 * Reserva: Wikimedia Commons. Toda foto entra com crédito e aviso de ilustrativa.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export interface Foto {
  url: string;
  autor: string;
  licenca: string;
  origem: string;
}

const CABECALHO = { "User-Agent": "LeadRadar/1.0 (previa de pagina; contato: vertice)" };

/** Termo de busca por nicho — em inglês, porque os acervos são anglófonos. */
export function termoDeBusca(categoria: string, nome = ""): string {
  const alvo = `${categoria || ""} ${nome || ""}`.toLowerCase();
  if (/[oó]tica|[oó]ptica|lentes/.test(alvo)) return "eyeglasses store optician";
  if (/barbearia|barbeiro/.test(alvo)) return "barbershop interior";
  if (/est[eé]tica|depila|pele/.test(alvo)) return "beauty salon treatment room";
  if (/odonto|dent/.test(alvo)) return "dental clinic chair";
  if (/psic[oó]|terap/.test(alvo)) return "therapy office armchair";
  if (/advog|jur[ií]dic/.test(alvo)) return "law office desk books";
  if (/restaurante|lanchonete|pizzaria|caf[eé]/.test(alvo)) return "restaurant interior table";
  if (/academia|pilates|personal/.test(alvo)) return "gym equipment";
  if (/pet|veterin/.test(alvo)) return "veterinary clinic dog";
  if (/arquitet|engenh/.test(alvo)) return "architecture model blueprint";
  if (/contabil|contador/.test(alvo)) return "accounting desk calculator";
  if (/imobili|corretor/.test(alvo)) return "real estate keys house";
  return "small business storefront interior";
}

interface ResultadoOpenverse {
  results?: Array<{
    url?: string;
    thumbnail?: string;
    creator?: string;
    license?: string;
    source?: string;
    width?: number;
    height?: number;
  }>;
}

async function buscarOpenverse(termo: string, quantidade: number): Promise<Foto[]> {
  const url =
    "https://api.openverse.org/v1/images/?" +
    new URLSearchParams({
      q: termo,
      // "commercial" cobre CC0, CC-BY e CC-BY-SA: pode usar em trabalho pago,
      // exigindo crédito quando a licença pede — e o crédito vai na legenda.
      license_type: "commercial",
      page_size: String(Math.max(quantidade * 3, 6)),
    }).toString();
  const resposta = await fetch(url, { headers: CABECALHO, signal: AbortSignal.timeout(15_000) });
  if (!resposta.ok) return [];
  const dados = (await resposta.json()) as ResultadoOpenverse;
  return (dados.results || [])
    .filter((r) => r.url && (r.width || 0) >= 800)
    .slice(0, quantidade)
    .map((r) => ({
      url: String(r.url),
      autor: String(r.creator || "autor desconhecido"),
      licenca: String(r.license || "cc").toUpperCase(),
      origem: "Openverse",
    }));
}

interface ResultadoCommons {
  query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string; extmetadata?: Record<string, { value?: string }> }> }> };
}

async function buscarCommons(termo: string, quantidade: number): Promise<Foto[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: termo,
      gsrnamespace: "6",
      gsrlimit: String(quantidade * 2),
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "1280",
    }).toString();
  const resposta = await fetch(url, { headers: CABECALHO, signal: AbortSignal.timeout(15_000) });
  if (!resposta.ok) return [];
  const dados = (await resposta.json()) as ResultadoCommons;
  const paginas = Object.values(dados.query?.pages || {});
  const fotos: Foto[] = [];
  for (const pagina of paginas) {
    const info = pagina.imageinfo?.[0];
    if (!info?.url) continue;
    if (!/\.(jpg|jpeg|png)$/i.test(info.url)) continue;
    const meta = info.extmetadata || {};
    fotos.push({
      url: info.url,
      autor: String(meta.Artist?.value || "Wikimedia Commons").replace(/<[^>]+>/g, "").slice(0, 60),
      licenca: String(meta.LicenseShortName?.value || "CC").slice(0, 20),
      origem: "Wikimedia",
    });
    if (fotos.length >= quantidade) break;
  }
  return fotos;
}

export async function buscarFotos(categoria: string, nome: string, quantidade = 2): Promise<Foto[]> {
  const termo = termoDeBusca(categoria, nome);
  for (const tentar of [buscarOpenverse, buscarCommons]) {
    try {
      const achadas = await tentar(termo, quantidade);
      if (achadas.length) return achadas;
    } catch {
      /* tenta a próxima fonte */
    }
  }
  return [];
}

/** Baixa, redimensiona e grava no diretório de prévias. Devolve os nomes dos arquivos. */
export async function baixarFotos(fotos: Foto[], dir: string, slug: string): Promise<Array<{ arquivo: string; largura: number; altura: number; foto: Foto }>> {
  const saida: Array<{ arquivo: string; largura: number; altura: number; foto: Foto }> = [];
  fs.mkdirSync(dir, { recursive: true });
  let indice = 0;
  for (const foto of fotos) {
    indice += 1;
    try {
      const resposta = await fetch(foto.url, { headers: CABECALHO, signal: AbortSignal.timeout(20_000) });
      if (!resposta.ok) continue;
      const bruto = Buffer.from(await resposta.arrayBuffer());
      if (bruto.length < 8_000) continue;
      const nome = `${slug}-foto-${indice}.jpg`;
      const destino = path.join(dir, nome);
      const redimensionada = await sharp(bruto)
        .rotate()
        .resize({ width: 1200, height: 900, fit: "cover", withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer();
      // Foto acima de 220 KB não entra: o ganho visual não paga o 4G do lead.
      if (redimensionada.length > 220_000) {
        const menor = await sharp(bruto)
          .rotate()
          .resize({ width: 900, height: 675, fit: "cover", withoutEnlargement: true })
          .jpeg({ quality: 62, mozjpeg: true })
          .toBuffer();
        fs.writeFileSync(destino, menor);
        saida.push({ arquivo: nome, largura: 900, altura: 675, foto });
      } else {
        fs.writeFileSync(destino, redimensionada);
        saida.push({ arquivo: nome, largura: 1200, altura: 900, foto });
      }
    } catch {
      /* foto ruim não derruba a prévia */
    }
  }
  return saida;
}

const CSS = `
.fx-foto{position:relative;z-index:1;margin:0 0 8px;padding:0;overflow:hidden;
  max-width:1120px;margin-inline:auto}
.fx-foto img{display:block;width:100%;height:auto;aspect-ratio:16/9;max-height:240px;object-fit:cover}
@media (min-width:900px){.fx-foto img{aspect-ratio:21/9;max-height:420px}}
/* Legenda FORA da imagem: sobre foto cheia o crédito fica ilegível e ainda por cima
   esconde o que a licença exige mostrar. */
.fx-foto figcaption{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px;
  padding:8px 4px 0;font-size:12px;line-height:1.4;letter-spacing:.02em;
  background:transparent;color:inherit;opacity:.7}
`;

/**
 * Insere uma faixa de foto depois da primeira seção (nunca no herói: foto logo
 * no topo sem ser do cliente confunde). Devolve a página e o crédito para o
 * relatório de entrega.
 */
export function inserirFotos(
  html: string,
  arquivos: Array<{ arquivo: string; largura: number; altura: number; foto: Foto }>,
  alt: string,
): { html: string; features: string[] } {
  if (!arquivos.length) return { html, features: [] };
  if (/class="fx-foto/.test(html)) return { html, features: [] };

  const fotos = arquivos.slice(0, 1)
    .map(
      (f, i) =>
        `<figure class="fx-foto"><img src="${f.arquivo}" width="${f.largura}" height="${f.altura}" alt="${alt}${i > 0 ? " (2)" : ""}" loading="lazy" decoding="async"><figcaption><span>Imagem ilustrativa — será trocada pelas fotos do espaço</span><span>${f.foto.autor} · ${f.foto.licenca}</span></figcaption></figure>`,
    )
    .join("\n");

  // Logo depois do herói, mas como FAIXA BAIXA (16/9, no máximo 240px de altura):
  // é o que aparece na primeira tela sem empurrar o conteúdo para fora.
  const pos = html.indexOf("</section>");
  let saida: string;
  if (pos > 0) {
    saida = html.slice(0, pos + 10) + "\n" + fotos + "\n" + html.slice(pos + 10);
  } else if (/<h1[\s\S]*?<\/h1>/i.test(html)) {
    saida = html.replace(/(<\/h1>)/i, `$1\n${fotos}`);
  } else {
    return { html, features: [] };
  }

  saida = /<\/body>/i.test(saida) ? saida.replace(/<\/body>/i, `<style>${CSS}</style></body>`) : saida + `<style>${CSS}</style>`;
  return { html: saida, features: [`${arquivos.length} foto(s) de banco licenciado`] };
}

/* ------------------------------------------------------------------ */
/*  Cache: a mesma empresa não baixa foto três vezes no mesmo laço     */
/* ------------------------------------------------------------------ */

const cache = new Map<string, Array<{ arquivo: string; largura: number; altura: number; foto: Foto }>>();

export function fotosDeBancoAtivas(): boolean {
  return String(process.env.PREVIEW_STOCK_PHOTOS ?? "1") !== "0";
}

export async function obterFotos(
  lead: { id?: string; name?: string; category?: string },
  dir: string,
  slug: string,
): Promise<Array<{ arquivo: string; largura: number; altura: number; foto: Foto }>> {
  const chave = `${lead.id || lead.name}-${slug}`;
  const guardado = cache.get(chave);
  if (guardado) {
    // Se o arquivo sumiu do disco, refaz.
    if (guardado.every((f) => fs.existsSync(`${dir}/${f.arquivo}`))) return guardado;
    cache.delete(chave);
  }
  const achadas = await buscarFotos(String(lead.category || ""), String(lead.name || ""), 1);
  if (!achadas.length) return [];
  const baixadas = await baixarFotos(achadas, dir, slug);
  cache.set(chave, baixadas);
  return baixadas;
}
