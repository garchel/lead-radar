import { getDb } from "../store/schema";
import { getSetting, setSetting } from "../store/db";
import { computeLeadScore } from "./leadQuality";

/**
 * Recalcula o score dos leads que já estavam no banco.
 *
 * Existe porque a fórmula antiga era aditiva com teto e achatou a base: 114 de
 * 156 leads ficaram com score exatamente 100. Sem este backfill, o D0 continuaria
 * escolhendo no escuro entre leads que o modelo novo separa bem.
 *
 * Roda uma vez (guardado por `lead_score_version` nas configurações).
 */

export const LEAD_SCORE_VERSION = "2";
const VERSION_KEY = "lead_score_version";

interface LeadRow {
  id: string;
  category: string | null;
  search_category: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  rating: number | null;
  reviews_count: number | null;
  website_status: string | null;
  whatsapp_status: string | null;
  opportunity_score: number | null;
}

export function rescoreLeads(): { scanned: number; rescored: number; changed: number } {
  const db = getDb();

  // Propensão por nicho (usa o nicho BUSCADO; cai no rótulo do Google se faltar)
  const categories = db.prepare("SELECT name, propensity FROM business_categories").all() as any[];
  const propensityByName = new Map<string, number>();
  for (const row of categories) {
    propensityByName.set(String(row.name || "").trim().toLowerCase(), Number(row.propensity) || 50);
  }

  // Tier por cidade (nome + UF)
  const cities = db.prepare("SELECT name, uf, market_tier FROM cities").all() as any[];
  const tierByCity = new Map<string, string>();
  for (const row of cities) {
    tierByCity.set(`${String(row.name || "").trim().toLowerCase()}|${String(row.uf || "").trim().toUpperCase()}`, row.market_tier);
  }

  const leads = db.prepare("SELECT id, category, search_category, city, state, phone, rating, reviews_count, website_status, whatsapp_status, opportunity_score FROM leads").all() as LeadRow[];

  const update = db.prepare(
    "UPDATE leads SET opportunity_score = @score, opportunity_level = @level WHERE id = @id"
  );

  let rescored = 0;
  let changed = 0;
  const run = db.transaction((rows: LeadRow[]) => {
    for (const lead of rows) {
      const niche = String(lead.search_category || lead.category || "").trim().toLowerCase();
      const propensity = propensityByName.get(niche);
      const tier = tierByCity.get(
        `${String(lead.city || "").trim().toLowerCase()}|${String(lead.state || "").trim().toUpperCase()}`
      );

      const result = computeLeadScore({
        websiteStatus: lead.website_status || undefined,
        rating: lead.rating ?? undefined,
        reviewsCount: lead.reviews_count ?? undefined,
        phone: lead.phone || undefined,
        whatsappStatus: (lead.whatsapp_status as any) || "unknown",
        categoryPropensity: propensity,
        marketTier: tier,
      });

      rescored += 1;
      if (result.score !== lead.opportunity_score) changed += 1;
      update.run({ id: lead.id, score: result.score, level: result.level });
    }
  });

  run(leads);
  setSetting(VERSION_KEY, LEAD_SCORE_VERSION);
  return { scanned: leads.length, rescored, changed };
}

/** Roda só se a versão do score no banco for diferente da atual. */
export function rescoreLeadsIfNeeded(): { ran: boolean; scanned?: number; changed?: number } {
  try {
    if (getSetting(VERSION_KEY) === LEAD_SCORE_VERSION) return { ran: false };
  } catch {
    /* primeira execução: segue */
  }
  const result = rescoreLeads();
  console.log(`[score] recalibrado: ${result.scanned} leads, ${result.changed} mudaram de nota`);
  return { ran: true, scanned: result.scanned, changed: result.changed };
}
