import crypto from "node:crypto";
import { StoredLead } from "../store/types";

export type LeadIdentityType = "cnpj" | "google_place_id" | "phone" | "website" | "name_city_state";

export interface LeadIdentityCandidate {
  type: LeadIdentityType;
  value: string;
  strength: "strong" | "weak";
}

export function normalizeText(value?: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normaliza para o formato canônico brasileiro **com o 9º dígito**.
 *
 * O WhatsApp devolve celular antigo sem o nono dígito (55 61 9525-4732) enquanto
 * o Google Maps/CRM guarda com ele (55 61 99525-4732). Sem canonicalizar, a
 * resposta do lead não casa com o cadastro e o webhook cria um LEAD DUPLICADO —
 * foi o que aconteceu numa simulação real (lead "Paulo" duplicado, ficha gerada
 * com fontes erradas).
 */
export function normalizePhone(value?: string): string {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  // 55 + DDD + 8 dígitos começando em 6-9 = celular no formato legado → põe o 9.
  if (digits.length === 12 && digits.startsWith("55")) {
    const subscriber = digits.slice(4);
    if (/^[6-9]/.test(subscriber)) return `${digits.slice(0, 4)}9${subscriber}`;
  }
  return digits;
}

/**
 * Todas as formas equivalentes do telefone (canônica + legado sem o 9).
 * Use ao BUSCAR no banco, para casar registros antigos gravados sem o 9.
 */
export function phoneVariants(value?: string): string[] {
  const canonical = normalizePhone(value);
  if (!canonical) return [];
  const variants = new Set<string>([canonical]);
  if (canonical.length === 13 && canonical.startsWith("55")) {
    variants.add(`${canonical.slice(0, 4)}${canonical.slice(5)}`);
  }
  return [...variants];
}

export function normalizeCnpj(value?: string): string {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeWebsite(value?: string): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, "");
  }
}

export function getLeadIdentityCandidates(lead: Pick<StoredLead, "name" | "city" | "state" | "phone" | "cnpj" | "websiteUrl" | "googlePlaceId">): LeadIdentityCandidate[] {
  const candidates: LeadIdentityCandidate[] = [];
  const cnpj = normalizeCnpj(lead.cnpj);
  const placeId = lead.googlePlaceId?.trim();
  const phone = normalizePhone(lead.phone);
  const website = normalizeWebsite(lead.websiteUrl);
  const name = normalizeText(lead.name);
  const city = normalizeText(lead.city);
  const state = normalizeText(lead.state);

  if (cnpj.length === 14) candidates.push({ type: "cnpj", value: cnpj, strength: "strong" });
  if (placeId) candidates.push({ type: "google_place_id", value: placeId, strength: "strong" });
  if (phone.length >= 12) candidates.push({ type: "phone", value: phone, strength: "strong" });
  if (website) candidates.push({ type: "website", value: website, strength: "strong" });
  if (name && city && state) {
    candidates.push({ type: "name_city_state", value: `${name}|${city}|${state}`, strength: "weak" });
  }
  return candidates;
}

export function buildStableLeadId(lead: Pick<StoredLead, "name" | "city" | "state" | "phone" | "cnpj" | "websiteUrl" | "googlePlaceId">): string {
  const candidates = getLeadIdentityCandidates(lead);
  const source = candidates[0]?.value || `${normalizeText(lead.name)}|${normalizeText(lead.city)}|${normalizeText(lead.state)}`;
  const digest = crypto.createHash("sha256").update(source).digest("hex").slice(0, 20);
  return `lead_${digest}`;
}
