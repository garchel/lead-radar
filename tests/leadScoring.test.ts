import { describe, expect, it } from "vitest";
import { computeLeadPriority, rankLeads } from "../server/services/leadScoringService";
import type { SiteAudit, StoredLead } from "../server/store/types";

function lead(overrides: Partial<StoredLead> = {}): StoredLead {
  return {
    id: "lead_test",
    name: "Empresa Teste",
    category: "Clínica & Estética",
    city: "Goiânia",
    pipelineStatus: "prospect",
    ...overrides,
  };
}

function audit(painScore: number, headline = "Seu site demora 7s para abrir no celular"): SiteAudit {
  return {
    url: "https://empresa.com.br",
    auditedAt: new Date().toISOString(),
    reachable: true,
    https: false,
    responseTimeMs: 7200,
    sizeKb: 400,
    tech: [],
    issues: [
      {
        code: "slow_response",
        severity: "critical",
        title: "Site lento",
        detail: "Demora 7s",
        fix: "Site novo",
      },
    ],
    healthScore: 100 - painScore,
    painScore,
    headline,
    bullets: ["Site lento"],
  };
}

describe("computeLeadPriority", () => {
  it("lead sem site e sem avaliações no Google é prioridade alta", () => {
    const result = computeLeadPriority(
      lead({ websiteStatus: "none", reviewsCount: 0, rating: undefined })
    );
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.level).toBe("alta");
    expect(result.reasons.join(" ")).toMatch(/não tem site/i);
  });

  it("só Instagram vale menos que não ter nada, mas ainda pontua", () => {
    const none = computeLeadPriority(lead({ websiteStatus: "none" }));
    const social = computeLeadPriority(lead({ websiteStatus: "social_only" }));
    expect(social.score).toBeGreaterThan(0);
    expect(social.score).toBeLessThan(none.score);
    expect(social.reasons.join(" ")).toMatch(/Instagram/i);
  });

  it("auditoria ruim aumenta a prioridade de quem já tem site", () => {
    const base = computeLeadPriority(lead({ websiteStatus: "has_website", websiteUrl: "https://x.com.br" }));
    const bad = computeLeadPriority(
      lead({ websiteStatus: "has_website", websiteUrl: "https://x.com.br", siteAudit: audit(90) })
    );
    expect(bad.score).toBeGreaterThan(base.score);
    expect(bad.reasons.join(" ")).toMatch(/problemas graves/i);
  });

  it("nota baixa no Google vira motivo explícito", () => {
    const result = computeLeadPriority(lead({ rating: 3.1, reviewsCount: 40 }));
    expect(result.reasons.join(" ")).toMatch(/nota 3\.1/i);
  });

  it("opt-out zera o score", () => {
    const result = computeLeadPriority(lead({ doNotContact: true, websiteStatus: "none" }));
    expect(result.score).toBe(0);
    expect(result.level).toBe("baixa");
  });

  it("quem já fechou ou recusou cai na fila", () => {
    const closed = computeLeadPriority(lead({ pipelineStatus: "closed", websiteStatus: "none" }));
    const declined = computeLeadPriority(lead({ pipelineStatus: "declined", websiteStatus: "none" }));
    expect(closed.score).toBeLessThan(40);
    expect(declined.score).toBeLessThan(40);
  });

  it("quem já respondeu sobe (conversa quente)", () => {
    const cold = computeLeadPriority(lead({ websiteStatus: "has_website" }));
    const warm = computeLeadPriority(
      lead({ websiteStatus: "has_website", lastResponseAt: new Date().toISOString() })
    );
    expect(warm.score).toBeGreaterThan(cold.score);
  });
});

describe("rankLeads", () => {
  it("ordena do mais doloroso para o menos", () => {
    const ranked = rankLeads([
      lead({ id: "a", name: "Fechado", pipelineStatus: "closed", websiteStatus: "none" }),
      lead({ id: "b", name: "Sem site", websiteStatus: "none", reviewsCount: 0 }),
      lead({ id: "c", name: "Site bom", websiteStatus: "has_website", websiteUrl: "https://c.com", siteAudit: audit(0) }),
    ]);
    expect(ranked[0].id).toBe("b");
    expect(ranked.map((item) => item.priority.score)).toEqual(
      [...ranked.map((item) => item.priority.score)].sort((x, y) => y - x)
    );
  });
});
