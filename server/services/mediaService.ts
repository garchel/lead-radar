import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { getDb } from "../store/schema";
import { getLeadById } from "../store/db";
import { previewSlug, previewsDir, resolvePreviewUrl } from "./previewService";

/**
 * Entrada de imagem na prévia.
 *
 * A página gerada traz espaços reservados (`<figure class="media-slot" data-slot="hero">`).
 * Aqui a imagem que o cliente mandou — ou que geramos a partir das fotos dele — é
 * otimizada, gravada em `previews/assets/<slug>/` e injetada NO slot certo, sem
 * reescrever o resto da página. Cada imagem guarda de onde veio e quem autorizou.
 */

export type OrigemImagem = "cliente" | "gerada";

export interface ConsentimentoImagem {
  /** Quem autorizou (nome de quem respondeu no WhatsApp). */
  autorizadoPor?: string;
  /** Canal da autorização: whatsapp, email, contrato... */
  canal?: string;
  /** Texto literal da autorização, para auditoria. */
  texto?: string;
}

export interface ImagemAplicada {
  slot: string;
  arquivo: string;
  url: string;
  bytes: number;
  largura: number;
  altura: number;
  origem: OrigemImagem;
  publicado: boolean;
}

export interface ResultadoImagem {
  ok: boolean;
  motivo?: string;
  imagem?: ImagemAplicada;
  slotsDisponiveis?: string[];
  publicUrl?: string | null;
}

const LIMITE_BYTES = 12 * 1024 * 1024;
const LARGURA_MAX = 1800;

function tabelaConsentimento(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS media_consents (
      id            TEXT PRIMARY KEY,
      lead_id       TEXT NOT NULL,
      slot          TEXT NOT NULL,
      origem        TEXT NOT NULL,
      autorizado_por TEXT,
      canal         TEXT,
      texto         TEXT,
      arquivo       TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_consents_lead ON media_consents (lead_id, created_at);
  `);
}

/** Slots declarados na página do lead. */
export function slotsDaPagina(leadId: string): string[] {
  const html = htmlDoLead(leadId);
  if (!html) return [];
  return Array.from(new Set(html.match(/data-slot=["']([^"']+)["']/gi)?.map((m) => m.replace(/.*=["']/, "").replace(/["']$/, "")) || []));
}

function arquivoDaPrevia(leadId: string): string | null {
  const lead = getLeadById(leadId);
  if (!lead) return null;
  const dir = previewsDir();
  const comSlug = path.join(dir, `${previewSlug(lead)}.html`);
  if (fs.existsSync(comSlug)) return comSlug;
  const comId = path.join(dir, `${leadId}.html`);
  return fs.existsSync(comId) ? comId : null;
}

function htmlDoLead(leadId: string): string | null {
  const arquivo = arquivoDaPrevia(leadId);
  if (!arquivo) return null;
  try {
    return fs.readFileSync(arquivo, "utf8");
  } catch {
    return null;
  }
}

/** Troca o miolo do `<figure data-slot="x">…</figure>` por uma imagem real. */
export function injetarImagemNoHtml(html: string, slot: string, urlImagem: string, alt: string): { html: string; achou: boolean } {
  const re = new RegExp(
    `(<figure[^>]*data-slot=["']${slot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>)([\\s\\S]*?)(</figure>)`,
    "i",
  );
  const achou = re.test(html);
  if (!achou) return { html, achou };

  return {
    achou,
    html: html.replace(re, (_m, abre: string, _miolo: string, fecha: string) => {
      const figureAjustada = abre.includes("data-filled")
        ? abre
        : abre.replace(/>$/, ' data-filled="true">');
      return (
        figureAjustada +
        `<img src="${urlImagem}" alt="${alt.replace(/"/g, "&quot;")}" loading="lazy" ` +
        `style="width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit" />` +
        fecha
      );
    }),
  };
}

/**
 * Recebe os bytes da imagem, otimiza, grava no diretório publicado e injeta no slot.
 * Não publica no Cloudflare aqui: quem chama decide (o publish inteiro é caro).
 */
export async function aplicarImagemNoSlot(
  leadId: string,
  entrada: { slot: string; bytes: Buffer; mime?: string; origem: OrigemImagem; consentimento?: ConsentimentoImagem; alt?: string },
): Promise<ResultadoImagem> {
  const lead = getLeadById(leadId);
  if (!lead) return { ok: false, motivo: "lead não encontrado" };

  const html = htmlDoLead(leadId);
  if (!html) return { ok: false, motivo: "a página deste lead ainda não existe" };

  const slots = slotsDaPagina(leadId);
  const slot = String(entrada.slot || "").trim();
  if (!slot || !slots.includes(slot)) {
    return { ok: false, motivo: `slot "${slot}" não existe nesta página`, slotsDisponiveis: slots };
  }
  if (!entrada.bytes?.length) return { ok: false, motivo: "imagem vazia", slotsDisponiveis: slots };
  if (entrada.bytes.length > LIMITE_BYTES) return { ok: false, motivo: "imagem acima de 12 MB", slotsDisponiveis: slots };

  let otimizada: { dados: Buffer; largura: number; altura: number };
  try {
    const img = sharp(entrada.bytes, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    const largura = Math.min(meta.width || LARGURA_MAX, LARGURA_MAX);
    const dados = await img
      .resize({ width: largura, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    otimizada = { dados: dados.data, largura: dados.info.width, altura: dados.info.height };
  } catch (erro: any) {
    return { ok: false, motivo: `não consegui ler a imagem: ${erro?.message || erro}`, slotsDisponiveis: slots };
  }

  const slug = previewSlug(lead);
  const pasta = path.join(previewsDir(), "assets", slug);
  fs.mkdirSync(pasta, { recursive: true });
  const hash = crypto.createHash("sha1").update(otimizada.dados).digest("hex").slice(0, 8);
  const nome = `${slot}-${hash}.jpg`;
  const destino = path.join(pasta, nome);
  fs.writeFileSync(destino, otimizada.dados);

  const url = `/assets/${slug}/${nome}`;
  const { html: novoHtml, achou } = injetarImagemNoHtml(html, slot, url, entrada.alt || lead.name);
  if (!achou) return { ok: false, motivo: "slot não encontrado no HTML", slotsDisponiveis: slots };

  const arquivoPrevia = arquivoDaPrevia(leadId)!;
  fs.writeFileSync(arquivoPrevia, novoHtml, "utf8");

  tabelaConsentimento();
  getDb()
    .prepare(
      `INSERT INTO media_consents (id, lead_id, slot, origem, autorizado_por, canal, texto, arquivo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `mcons_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      leadId,
      slot,
      entrada.origem,
      entrada.consentimento?.autorizadoPor || null,
      entrada.consentimento?.canal || null,
      entrada.consentimento?.texto || null,
      destino,
      new Date().toISOString(),
    );

  return {
    ok: true,
    imagem: {
      slot,
      arquivo: destino,
      url,
      bytes: otimizada.dados.length,
      largura: otimizada.largura,
      altura: otimizada.altura,
      origem: entrada.origem,
      publicado: false,
    },
    slotsDisponiveis: slots,
    publicUrl: resolvePreviewUrl(slug),
  };
}

/** Histórico de autorizações: quem liberou o quê, quando e por qual canal. */
export function consentimentosDoLead(leadId: string): Array<Record<string, unknown>> {
  try {
    tabelaConsentimento();
    return getDb()
      .prepare("SELECT slot, origem, autorizado_por, canal, texto, created_at FROM media_consents WHERE lead_id = ? ORDER BY created_at DESC")
      .all(leadId) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}
