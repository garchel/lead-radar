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

export function normalizePhone(value?: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) return `55${digits}`;
  return digits;
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
