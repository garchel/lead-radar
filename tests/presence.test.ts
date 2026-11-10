import { describe, expect, it } from "vitest";
import {
  classifySitePresence,
  effectiveWebsiteStatus,
  hasOwnWebsite,
  presenceLabel,
} from "../server/services/presenceService";
import { computeLeadPriority } from "../server/services/leadScoringService";
import { defaultHookForLead } from "../server/services/contactService";
import type { StoredLead } from "../server/store/types";

function lead(overrides: Partial<StoredLead> = {}): StoredLead {
  return {
    id: "lead_presence",
    name: "Clean Limpezas",
    category: "Limpeza",
    city: "Brasília",
    state: "DF",
    phone: "61993797728",
    websiteStatus: "none",
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as StoredLead;
}

describe("presença digital: site próprio x marketplace", () => {
  it("classifica a URL real em vez de assumir 'tem site'", () => {
    expect(classifySitePresence(undefined)).toBe("none");
    expect(classifySitePresence("https://www.ifood.com.br/delivery/brasilia-df/clean-limpezas/abc")).toBe(
      "marketplace_only"
    );
    expect(classifySitePresence("https://www.instagram.com/cleanlimpezas")).toBe("social_only");
    expect(classifySitePresence("https://wa.me/5561993797728")).toBe("social_only");
    expect(classifySitePresence("https://goo.gl/maps/xyz")).toBe("none");
    expect(classifySitePresence("https://cleanlimpezas.com.br")).toBe("has_website");
  });

  it("dá nome à plataforma para usar na mensagem", () => {
    expect(presenceLabel("https://www.ifood.com.br/delivery/x")).toBe("iFood");
    expect(presenceLabel("https://instagram.com/x")).toBe("Instagram");
    expect(presenceLabel("https://meusite.com.br")).toBe("meusite.com.br");
  });

  it("corrige lead antigo gravado como has_website só por ter link de iFood", () => {
    const legacy = lead({
      websiteStatus: "has_website",
      websiteUrl: "https://www.ifood.com.br/delivery/brasilia-df/clean-limpezas/abc",
    });
    expect(effectiveWebsiteStatus(legacy)).toBe("marketplace_only");
    expect(hasOwnWebsite(legacy)).toBe(false);
    expect(defaultHookForLead(legacy)).toBe("marketplace");
    expect(presenceLabel(legacy.websiteUrl)).toBe("iFood");
  });

  it("trata site removido (status has_website sem URL) como sem site", () => {
    expect(effectiveWebsiteStatus(lead({ websiteStatus: "has_website" }))).toBe("none");
  });

  it("marketplace pontua como dor alta, não como quem já tem site", () => {
    const marketplace = computeLeadPriority(
      lead({
        websiteStatus: "marketplace_only",
        websiteUrl: "https://www.ifood.com.br/delivery/x",
      })
    );
    const withSite = computeLeadPriority(
      lead({ websiteStatus: "has_website", websiteUrl: "https://cleanlimpezas.com.br" })
    );
    expect(marketplace.score).toBeGreaterThan(withSite.score);
    expect(marketplace.reasons.join(" ")).toMatch(/iFood|marketplace/i);
  });

  it("não audita lead cujo 'site' é marketplace", async () => {
    const { auditLeadSite } = await import("../server/services/siteAuditService");
    await expect(
      auditLeadSite(
        lead({
          websiteStatus: "marketplace_only",
          websiteUrl: "https://www.ifood.com.br/delivery/x",
        })
      )
    ).rejects.toThrow(/marketplace/);
  });

  it("backfill corrige status antigo e descarta auditoria de link de marketplace", async () => {
    const { upsertLead, getLeadById, updateLeadSiteAudit } = await import("../server/store/db");
    const { backfillSitePresence } = await import("../server/services/sitePresenceBackfill");

    const legacy = lead({
      id: "lead_legacy_ifood",
      websiteStatus: "has_website",
      websiteUrl: "https://www.ifood.com.br/delivery/x",
    });
    upsertLead(legacy, { skipDedup: true });
    updateLeadSiteAudit(legacy.id, {
      url: legacy.websiteUrl!,
      fetchedAt: new Date().toISOString(),
      reachable: true,
      https: true,
      statusCode: 200,
      responseTimeMs: 1200,
      sizeKb: 300,
      healthScore: 30,
      painScore: 90,
      headline: "Auditoria indevida",
      bullets: [],
      issues: [],
    } as any);

    const result = backfillSitePresence();
    expect(result.updated).toBeGreaterThan(0);

    const fixed = getLeadById(legacy.id)!;
    expect(fixed.websiteStatus).toBe("marketplace_only");
    expect(fixed.siteAudit).toBeUndefined();
  });
});
