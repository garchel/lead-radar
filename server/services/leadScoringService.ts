import { getBusinessCategories, updateLeadPriority } from "../store/db";
import type { LeadPriority, StoredLead } from "../store/types";
import { effectiveWebsiteStatus, presenceLabel } from "./presenceService";

/**
 * Priorização comercial por sinais de dor.
 *
 * A ideia (do thread que serviu de base): não adianta 200 leads iguais; vale
 * atacar quem está mais "machucado" — sem site, site ruim, nota baixa, poucas
 * avaliações. O score ordena a fila de prospecção e alimenta o agente.
 */

const WEIGHTS = {
  noWebsite: 50,
  socialOnly: 38,
  marketplaceOnly: 44,
  auditMax: 35,
  unknownWebsite: 10,
  ratingCritical: 14,
  ratingWeak: 9,
  fewReviews: 10,
  someReviews: 6,
  unknownReviews: 10,
  repliedBefore: 12,
  coldButContactable: 4,
  propensityMax: 6,
};

function categoryPropensity(category?: string): number {
  if (!category) return 0;
  try {
    const match = getBusinessCategories({ activeOnly: true }).find(
      (item) => item.name.trim().toLowerCase() === category.trim().toLowerCase()
    );
    return match?.propensity ?? 0;
  } catch {
    return 0;
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeLeadPriority(lead: StoredLead): LeadPriority {
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    if (points > 0) reasons.push(reason);
    return points;
  };

  if (lead.doNotContact) {
    return { score: 0, level: "baixa", reasons: ["Bloqueado (não quer receber contato)"] };
  }

  let score = 0;

  // --- Presença digital: o sinal mais forte (URL real manda, não o rótulo antigo) ---
  const status = effectiveWebsiteStatus(lead);
  if (status === "none") {
    score += add(WEIGHTS.noWebsite, "Não tem site (já sabe que precisa)");
  } else if (status === "social_only") {
    score += add(WEIGHTS.socialOnly, "Só tem Instagram/Facebook, sem site próprio");
  } else if (status === "marketplace_only") {
    const platform = presenceLabel(lead.websiteUrl) || "marketplace";
    score += add(WEIGHTS.marketplaceOnly, `Só existe no ${platform} — sem site próprio para receber buscas`);
  } else if (lead.siteAudit) {
    const points = (lead.siteAudit.painScore / 100) * WEIGHTS.auditMax;
    score += points;
    if (lead.siteAudit.painScore >= 60) {
      reasons.push(`Site com problemas graves: ${lead.siteAudit.headline.toLowerCase()}`);
    } else if (lead.siteAudit.painScore >= 30) {
      reasons.push(`Site com falhas que custam clientes: ${lead.siteAudit.headline.toLowerCase()}`);
    }
  } else {
    score += add(WEIGHTS.unknownWebsite, "Tem site, mas ainda não foi auditado");
  }

  // --- Reputação no Google: quem está perdendo cliente sente no bolso ---
  if (typeof lead.rating === "number") {
    if (lead.rating > 0 && lead.rating < 3.5) {
      score += add(WEIGHTS.ratingCritical, `Nota ${lead.rating.toFixed(1)} no Google (abaixo de 3,5)`);
    } else if (lead.rating < 4.2) {
      score += add(WEIGHTS.ratingWeak, `Nota ${lead.rating.toFixed(1)} no Google (concorrente passa na frente)`);
    }
  }

  const reviews = lead.reviewsCount ?? 0;
  if (!lead.reviewsCount) {
    score += add(WEIGHTS.unknownReviews, "Sem avaliações no Google (presença fraca)");
  } else if (reviews < 5) {
    score += add(WEIGHTS.fewReviews, `Só ${reviews} avaliação(ões) — negócio ainda montando presença`);
  } else if (reviews < 15) {
    score += add(WEIGHTS.someReviews, `Poucas avaliações (${reviews}) para o tamanho do mercado`);
  }

  // --- Valor do segmento ---
  const propensity = categoryPropensity(lead.category);
  score += (propensity / 100) * WEIGHTS.propensityMax;
  if (propensity >= 70) {
    reasons.push(`Segmento com alta propensão a site (${lead.category})`);
  }

  // --- Relacionamento ---
  if (lead.lastResponseAt) {
    score += add(WEIGHTS.repliedBefore, "Já respondeu uma vez (conversa quente)");
  }

  // --- Descontos: já está no funil ou já foi muito trabalhado ---
  if (lead.pipelineStatus === "closed") score -= 40;
  else if (lead.pipelineStatus === "declined") score -= 30;
  else if (lead.pipelineStatus === "negotiating" || lead.pipelineStatus === "em_desenvolvimento") score -= 20;

  const attempts = lead.contactAttempts ?? 0;
  if (attempts >= 3) score -= 10;

  if (lead.nextContactAt && new Date(lead.nextContactAt).getTime() > Date.now()) {
    score -= 15;
    reasons.push("Em janela de recontato (aguardando)");
  }

  const finalScore = clamp(score);
  const level: LeadPriority["level"] = finalScore >= 60 ? "alta" : finalScore >= 40 ? "media" : "baixa";

  return { score: finalScore, level, reasons: reasons.slice(0, 6) };
}

/** Ordena leads por prioridade comercial (maior primeiro). */
export function rankLeads(leads: StoredLead[]): Array<StoredLead & { priority: LeadPriority }> {
  return leads
    .map((lead) => ({ ...lead, priority: computeLeadPriority(lead) }))
    .sort((a, b) => b.priority.score - a.priority.score);
}

/** Calcula e persiste a prioridade do lead. */
export function refreshLeadPriority(lead: StoredLead): LeadPriority {
  const priority = computeLeadPriority(lead);
  updateLeadPriority(lead.id, priority);
  return priority;
}
