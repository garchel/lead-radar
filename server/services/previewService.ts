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
import { getCommercialPolicy, formatBRL, cheapestPackage } from "./commercialPolicy";
import { currentTunnelUrl } from "./tunnelService";

export interface PreviewResult {
  leadId: string;
  /** Caminho absoluto do HTML gerado. */
  filePath: string;
  /** URL relativa servida pelo próprio app (`/previews/<id>.html`). */
  url: string;
  /** URL pública, quando `PUBLIC_BASE_URL` está configurado (é a que vai ao cliente). */
  publicUrl: string | null;
  generatedAt: string;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

/** Rating no formato brasileiro (4.6 → "4,6"). */
function ratingLabel(rating?: number): string | null {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  return String(rating).replace(".", ",");
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

export function buildPreviewHtml(lead: StoredLead, now = new Date()): string {
  const name = prettyName(lead.name, 64);
  const category = lead.searchCategory || lead.category || "Negócio local";
  const location = [lead.neighborhood, lead.city, lead.state].filter(Boolean).join(", ");
  const rating = ratingLabel(lead.rating);
  const reviews = lead.reviewsCount;
  const wa = whatsappLink(lead.phone);
  const services = previewServices(lead);
  const policy = getCommercialPolicy();
  const from = cheapestPackage(policy);

  const proof =
    rating && reviews
      ? `<span class="proof">${esc(rating)} ★ · ${esc(reviews)} avaliações no Google</span>`
      : rating
        ? `<span class="proof">${esc(rating)} ★ no Google</span>`
        : "";

  const serviceCards = services
    .map(
      (service, index) => `<li class="card">
        <span class="card-num">${String(index + 1).padStart(2, "0")}</span>
        <span class="card-text">${esc(service)}</span>
      </li>`
    )
    .join("");

  const cta = wa
    ? `<a class="cta" href="${esc(wa)}" rel="noopener">Falar no WhatsApp</a>`
    : `<span class="cta cta-disabled">Falar no WhatsApp</span>`;

  // Identidade visual coletada do negócio (cor + foto). Sem ela, o template usa o
  // verde padrão e não mostra imagem — nunca inventa foto.
  const corMarca = (lead.brandSnapshot?.palette || [])
    .map((cor) => String(cor.hex || ""))
    .find((hex) => /^#[0-9a-f]{6}$/i.test(hex));
  const fotoCapa = (lead.brandSnapshot?.imagery || []).map((img) => String(img.url || "")).find((url) => /^https?:\/\//i.test(url));
  const heroImagem = fotoCapa
    ? `<figure class="hero"><img src="${esc(fotoCapa)}" alt="${esc(name)}" loading="lazy" onerror="this.parentElement.style.display='none'" /></figure>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(name)} — prévia</title>
<style>
  :root { --ink:#0f172a; --muted:#475569; --line:#e2e8f0; --accent:${corMarca || "#0b6b3a"}; --surface:#f7f8fa; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif; color:var(--ink);
         background:#fff; -webkit-font-smoothing:antialiased; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 22px 20px 48px; }
  .badge { display:inline-block; font-size:11px; letter-spacing:.14em; text-transform:uppercase;
           color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:5px 11px; }
  h1 { font-size: clamp(30px, 8vw, 46px); line-height:1.05; letter-spacing:-.03em; margin:26px 0 10px; font-weight:650; }
  .kicker { font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.12em; margin:0 0 6px; }
  .lead { font-size:17px; line-height:1.5; color:#334155; margin:0 0 18px; max-width:34ch; text-wrap:pretty; }
  .meta { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin:0 0 26px; }
  .proof { font-size:12.5px; color:var(--ink); background:var(--surface); border:1px solid var(--line);
           border-radius:999px; padding:6px 11px; }
  .place { font-size:12.5px; color:var(--muted); }
  .cta { display:inline-flex; align-items:center; justify-content:center; gap:8px; background:var(--accent);
         color:#fff; text-decoration:none; font-weight:600; font-size:15px; padding:15px 26px;
         border-radius:999px; min-height:48px; }
  .cta-disabled { background:#94a3b8; }
  ul.cards { list-style:none; padding:0; margin:34px 0 0; display:grid; gap:10px; }
  .cta:focus-visible { outline:3px solid #93c5fd; outline-offset:3px; }
  .card { display:flex; gap:14px; align-items:baseline; border-top:1px solid var(--line); padding:14px 2px; }
  .card-num { font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; }
  .card-text { font-size:16px; }
  .foot { margin-top:40px; padding-top:18px; border-top:1px solid var(--line); font-size:12px; color:var(--muted); line-height:1.6; }
  .hero { margin:22px 0 0; border-radius:18px; overflow:hidden; border:1px solid var(--line); background:var(--surface); }
  .hero img { display:block; width:100%; height:auto; max-height:320px; object-fit:cover; }
  @media (prefers-color-scheme: dark) {
    body { background:#0b1220; color:#e8eef7; }
    .lead { color:#b9c4d4; }
    .proof { background:#111c2e; border-color:#1e2a3d; color:#e8eef7; }
    .badge, .kicker, .card-num { color:#aab7c9; border-color:#2b3a56; }
    .card { border-color:#1e2a3d; }
    .foot { border-color:#1e2a3d; color:#8b97a8; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <span class="badge">Prévia · primeira tela</span>
    <p class="kicker">${esc(category)}${location ? ` · ${esc(location)}` : ""}</p>
    <h1>${esc(name)}</h1>
    ${heroImagem}
    <p class="lead">${
      "Resposta direta no WhatsApp, sem formulário."
    }</p>
    <div class="meta">${proof}</div>
    ${cta}
    <ul class="cards">${serviceCards}</ul>
    <p class="foot">
      Esta é uma <strong>prévia</strong> montada pela Vértice Páginas Web a partir das informações públicas
      do seu negócio no Google. Textos, fotos e seções são ajustados com você antes de qualquer pagamento.<br />
      Pacote ${esc(from.name)} a partir de ${esc(formatBRL(from.price))} · gerada em ${esc(now.toLocaleDateString("pt-BR"))}.
    </p>
  </div>
</body>
</html>`;
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
export function resolvePublicBaseUrl(): { baseUrl: string | null; source: "env" | "tunnel" | "lan" | "none" } {
  const env = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (env) return { baseUrl: env, source: "env" };

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
  fs.writeFileSync(filePath, buildPreviewHtml(lead, now), "utf8");
  const { baseUrl } = resolvePublicBaseUrl();
  return {
    leadId: lead.id,
    filePath,
    url: `/previews/${lead.id}.html`,
    publicUrl: baseUrl ? `${baseUrl}/previews/${lead.id}.html` : null,
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
