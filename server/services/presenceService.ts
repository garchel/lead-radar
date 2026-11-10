import type { StoredLead, WebsiteStatus } from "../store/types";

/**
 * Presença digital real: ter perfil no iFood ou Instagram NÃO é ter site.
 *
 * Antes, qualquer URL vinda do Google Maps virava `has_website` — inclusive
 * links de marketplace — e o lead mais quente (sem site próprio) caía para o
 * fim da fila. Esta classificação é a fonte única para scoring, gancho,
 * auditoria e cadência.
 */

const SOCIAL_DOMAINS = [
  "instagram.com",
  "facebook.com",
  "fb.me",
  "m.facebook.com",
  "linktr.ee",
  "linktree.com",
  "beacons.ai",
  "tiktok.com",
  "youtube.com",
  "x.com",
  "twitter.com",
  "threads.net",
  "wa.me",
  "api.whatsapp.com",
];

const MARKETPLACE_DOMAINS = [
  "ifood.com.br",
  "mercadolivre.com.br",
  "mercadolibre.com",
  "shopee.com.br",
  "olx.com.br",
  "americanas.com.br",
  "magazineluiza.com.br",
  "amazon.com.br",
  "submarino.com.br",
  "casasbahia.com.br",
  "booking.com",
  "airbnb.com.br",
  "tripadvisor.com",
  "doctoralia.com.br",
  "getninjas.com.br",
  "cronapp.io",
  "sites.google.com",
  "business.site",
  "negocio.site",
  "linktr.ee",
];

/** Links de mapa/redirecionamento do Google não são site do negócio. */
const NON_SITE_DOMAINS = ["goo.gl", "maps.app.goo.gl", "google.com", "maps.google.com"];

const LABELS: Record<string, string> = {
  "ifood.com.br": "iFood",
  "mercadolivre.com.br": "Mercado Livre",
  "mercadolibre.com": "Mercado Livre",
  "shopee.com.br": "Shopee",
  "olx.com.br": "OLX",
  "americanas.com.br": "Americanas",
  "magazineluiza.com.br": "Magalu",
  "amazon.com.br": "Amazon",
  "booking.com": "Booking",
  "airbnb.com.br": "Airbnb",
  "tripadvisor.com": "TripAdvisor",
  "doctoralia.com.br": "Doctoralia",
  "getninjas.com.br": "GetNinjas",
  "sites.google.com": "Google Sites",
  "business.site": "Google Meu Negócio",
  "negocio.site": "Google Meu Negócio",
  "instagram.com": "Instagram",
  "facebook.com": "Facebook",
  "fb.me": "Facebook",
  "linktr.ee": "Linktree",
  "linktree.com": "Linktree",
  "wa.me": "WhatsApp",
  "api.whatsapp.com": "WhatsApp",
  "tiktok.com": "TikTok",
  "youtube.com": "YouTube",
};

export function hostOf(rawUrl?: string): string | null {
  const value = String(rawUrl || "").trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function matches(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Classifica a presença a partir da URL encontrada na fonte real. */
export function classifySitePresence(rawUrl?: string): WebsiteStatus {
  const host = hostOf(rawUrl);
  if (!host) return "none";
  if (matches(host, SOCIAL_DOMAINS)) return "social_only";
  if (matches(host, MARKETPLACE_DOMAINS)) return "marketplace_only";
  if (matches(host, NON_SITE_DOMAINS)) return "none";
  return "has_website";
}

/** Nome curto da plataforma para usar em mensagem ("iFood", "Instagram"). */
export function presenceLabel(rawUrl?: string): string | null {
  const host = hostOf(rawUrl);
  if (!host) return null;
  const exact = LABELS[host];
  if (exact) return exact;
  const suffix = Object.keys(LABELS).find((domain) => host.endsWith(`.${domain}`));
  if (suffix) return LABELS[suffix];
  if (matches(host, NON_SITE_DOMAINS)) return null;
  return host;
}

/**
 * Status efetivo: a URL manda. Corrige registros antigos gravados como
 * `has_website` apenas porque tinham um link de iFood/Instagram.
 */
export function effectiveWebsiteStatus(lead: Pick<StoredLead, "websiteStatus" | "websiteUrl">): WebsiteStatus {
  if (lead.websiteUrl) {
    const fromUrl = classifySitePresence(lead.websiteUrl);
    return fromUrl === "none" ? (lead.websiteStatus === "social_only" ? "social_only" : "none") : fromUrl;
  }
  return lead.websiteStatus === "has_website" || lead.websiteStatus === "marketplace_only"
    ? "none"
    : lead.websiteStatus || "none";
}

/** Só `has_website` conta como site próprio para auditoria/cadência. */
export function hasOwnWebsite(lead: Pick<StoredLead, "websiteStatus" | "websiteUrl">): boolean {
  return effectiveWebsiteStatus(lead) === "has_website";
}
