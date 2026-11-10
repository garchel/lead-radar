import { getLeads, updateLeadPriority, updateLeadSiteAudit, updateLeadWebsiteStatus } from "../store/db";
import { effectiveWebsiteStatus } from "./presenceService";
import { computeLeadPriority } from "./leadScoringService";

/**
 * Corrige leads antigos gravados com `has_website` só porque tinham link de
 * iFood/Instagram (viravam "baixa prioridade") e recalcula a prioridade.
 *
 * Também descarta auditoria feita por engano em link de marketplace/rede social
 * (ela inflava a dor de um lead que nem tem site).
 *
 * Roda no boot: idempotente e barato (uma passada pela tabela).
 * A versão fica em `app_settings`; incrementar força nova passada.
 */
export const BACKFILL_VERSION = "1";

export function backfillSitePresence(): { scanned: number; updated: number; rescored: number } {
  const leads = getLeads();
  let updated = 0;
  let rescored = 0;

  for (const lead of leads) {
    const status = effectiveWebsiteStatus(lead);
    const statusChanged = status !== lead.websiteStatus;
    if (statusChanged) {
      updateLeadWebsiteStatus(lead.id, status);
      updated += 1;
    }

    const staleAudit = status !== "has_website" && Boolean(lead.siteAudit);
    if (staleAudit) {
      updateLeadSiteAudit(lead.id, null);
      updated += 1;
    }
    if (!statusChanged && !staleAudit) continue;

    try {
      updateLeadPriority(
        lead.id,
        computeLeadPriority({ ...lead, websiteStatus: status, siteAudit: staleAudit ? undefined : lead.siteAudit })
      );
      rescored += 1;
    } catch {
      /* prioridade é recalculada sob demanda */
    }
  }

  return { scanned: leads.length, updated, rescored };
}
