/**
 * Prévia da primeira tela de uma landing page.
 *
 * Existe porque a oferta inteira da Vértice é "eu te mostro a prévia antes de
 * você pagar" — e até agora isso era uma promessa sem produto. O agente dizia
 * "montei a primeira tela, posso te mandar?" e não havia nada para mandar.
 *
 * Regras:
 * - **determinístico**: nada de IA aqui. Fatos do cadastro + ficha do cliente,
 *   template fixo. Prévia que inventa serviço ou prêmio queima a venda.
 * - **quase autocontido**: um HTML só, sem fonte remota e sem JS. A única coisa
 *   externa é a foto de capa, que vem da identidade visual coletada do próprio
 *   negócio (URL pública). Se a foto não carregar, o layout continua de pé.
 * - **declaradamente uma prévia**: badge no topo e rodapé explicando o que é.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StoredLead } from "../store/types";
import { prettyName } from "./briefingService";
import { currentTunnelUrl } from "./tunnelService";
import { pagesCachedBase } from "./pagesService";
import { getDb } from "../store/schema";
import { renderPreviewHtml } from "./previewTemplate";

export interface PreviewResult {
  leadId: string;
  /** Caminho absoluto do HTML gerado. */
  filePath: string;
  /** URL relativa servida pelo próprio app (`/previews/<id>.html`). */
  url: string;
  /** Slug amigável usado no link público (ex.: `dra-carmen-pitol`). */
  slug: string;
  /** URL pública que vai ao cliente (base pública + `/p/<slug>`). */
  publicUrl: string | null;
  generatedAt: string;
}

export function previewsDir(): string {
  const dataDir = process.env.LEADRADAR_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dataDir, "previews");
}

/** Telefone → link wa.me (só dígitos, com 55). */
export function whatsappLink(phone?: string): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

/**
 * Serviços exibidos na prévia. Vêm da ficha quando existe; sem ficha, viram
 * espaços nomeados pela categoria — nunca uma promessa inventada.
 */
export function previewServices(lead: StoredLead): string[] {
  const fromProfile = Array.isArray(lead.clientProfile?.services) ? lead.clientProfile!.services!.filter(Boolean) : [];
  if (fromProfile.length) return fromProfile.slice(0, 6);
  const category = lead.searchCategory || lead.category || "atendimento";
  return [`${category} — atendimento principal`, "Avaliações e resultados", "Localização e contato"];
}

/**
 * Página da prévia.
 *
 * O template mora em `previewTemplate.ts` porque é uma landing page inteira
 * (hero, serviços, prova, localização, FAQ, CTA) e não caberia aqui sem soterrar
 * a lógica de arquivo/URL deste módulo.
 */
export function buildPreviewHtml(lead: StoredLead, now = new Date()): string {
  return renderPreviewHtml(lead, now);
}

/**
 * Slug do link público: `dra-carmen-pitol` em vez de `pv-landing-1`.
 *
 * Link com nome do negócio parece endereço de gente, não de sistema — e isso muda
 * a taxa de clique. A tabela `preview_slugs` garante que dois leads não dividam o
 * mesmo endereço (e que o link de um cliente não abra o de outro).
 */
export function slugifyPreview(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

let slugsReady = false;

function ensureSlugTable(): void {
  if (slugsReady) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS preview_slugs (
      slug TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
  slugsReady = true;
}

/** Slug estável por lead (reusa o existente; cria e desambigua quando novo). */
export function previewSlug(lead: StoredLead): string {
  ensureSlugTable();
  const db = getDb();
  const existente = db.prepare("SELECT slug FROM preview_slugs WHERE lead_id = ?").get(lead.id) as any;
  if (existente?.slug) return existente.slug;

  const base = slugifyPreview(lead.name) || `previa-${lead.id.replace(/[^a-z0-9]/gi, "").slice(-6)}`;
  let candidato = base;
  let tentativa = 2;
  while (db.prepare("SELECT 1 FROM preview_slugs WHERE slug = ?").get(candidato)) {
    candidato = `${base}-${tentativa}`;
    tentativa += 1;
  }
  db.prepare("INSERT INTO preview_slugs (slug, lead_id, created_at) VALUES (?, ?, ?)").run(
    candidato,
    lead.id,
    new Date().toISOString()
  );
  return candidato;
}

/**
 * URL pública do slug respeitando o caminho de cada base: no Pages o arquivo é
 * servido na raiz (`/<slug>`); no túnel e na rede local, em `/p/<slug>`.
 */
export function resolvePreviewUrl(slug: string): string | null {
  const { baseUrl, source } = resolvePublicBaseUrl();
  if (!baseUrl) return null;
  return source === "pages" ? `${baseUrl}/${slug}` : `${baseUrl}/p/${slug}`;
}

let avisouLan = false;

/**
 * Base pública das prévias.
 *
 * `PUBLIC_BASE_URL` (túnel/domínio) tem prioridade. Sem ela, cai para o IP da
 * rede local: o celular do Paulo abre o link no mesmo Wi-Fi, o que resolve a
 * simulação sem configurar túnel. Sem nenhuma das duas, devolve `null` — e aí o
 * link NÃO é enviado ao cliente (nunca inventar endereço).
 */
export function resolvePublicBaseUrl(): {
  baseUrl: string | null;
  source: "env" | "pages" | "tunnel" | "lan" | "none";
} {
  const env = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (env) return { baseUrl: env, source: "env" };

  // Pages: endereço estável, sobrevive ao app fechar (arquivo estático na CDN).
  const pages = pagesCachedBase();
  if (pages) return { baseUrl: pages, source: "pages" };

  // Túnel público: é o único endereço que funciona fora da rede local (o cliente
  // do outro lado da cidade não alcança 192.168.x.x).
  const tunel = currentTunnelUrl();
  if (tunel) return { baseUrl: tunel.replace(/\/+$/, ""), source: "tunnel" };

  const porta = Number(process.env.PORT) || 3000;
  const candidatos: string[] = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const endereco of lista || []) {
      if (endereco.family !== "IPv4" || endereco.internal) continue;
      candidatos.push(endereco.address);
    }
  }
  // Prefere faixas privadas usuais (Wi-Fi da casa/escritório).
  const privado = candidatos.find((ip) => /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(ip)) || candidatos[0];
  if (!privado) return { baseUrl: null, source: "none" };

  if (!avisouLan) {
    console.log(
      `[previa] PUBLIC_BASE_URL não definida: usando o IP da rede local (http://${privado}:${porta}). ` +
        "Funciona no mesmo Wi-Fi; fora dele, configure um túnel."
    );
    avisouLan = true;
  }
  return { baseUrl: `http://${privado}:${porta}`, source: "lan" };
}

/** Gera (ou regenera) o arquivo da prévia e devolve as URLs. */
export function generateLeadPreview(lead: StoredLead, now = new Date()): PreviewResult {
  const dir = previewsDir();
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${lead.id}.html`);
  const html = buildPreviewHtml(lead, now);
  fs.writeFileSync(filePath, html, "utf8");
  // cópia com o slug amigável: é esta que vai no WhatsApp
  const slug = previewSlug(lead);
  fs.writeFileSync(path.join(dir, `${slug}.html`), html, "utf8");
  const { baseUrl } = resolvePublicBaseUrl();
  return {
    leadId: lead.id,
    filePath,
    url: `/previews/${lead.id}.html`,
    slug,
    publicUrl: resolvePreviewUrl(slug),
    generatedAt: now.toISOString(),
  };
}

/** Já existe prévia para este lead? */
export function previewExists(leadId: string): boolean {
  try {
    return fs.existsSync(path.join(previewsDir(), `${leadId}.html`));
  } catch {
    return false;
  }
}
