import { describe, expect, it } from "vitest";
import { citedAuditIssues, qaPitch } from "../server/services/pitchQaService";
import type { SiteAudit } from "../server/store/types";

function audit(overrides: Partial<SiteAudit> = {}): SiteAudit {
  return {
    url: "https://site.com.br",
    fetchedAt: new Date().toISOString(),
    reachable: true,
    https: true,
    statusCode: 200,
    responseTimeMs: 2400,
    sizeKb: 820,
    healthScore: 41,
    painScore: 72,
    headline: "O site demora 5s e não tem WhatsApp",
    bullets: ["Sem botão de WhatsApp"],
    issues: [
      {
        code: "no_whatsapp",
        severity: "high",
        title: "Sem botão de WhatsApp",
        detail: "Não encontramos link para WhatsApp na página.",
        evidence: "whatsapp: ausente",
      },
      {
        code: "slow_response",
        severity: "high",
        title: "Carregamento lento no celular",
        detail: "O servidor demorou 2.4s para responder.",
        evidence: "2400ms",
      },
      {
        code: "no_https",
        severity: "medium",
        title: "Sem HTTPS",
        detail: "O site não usa HTTPS.",
        evidence: "http",
      },
    ],
    ...overrides,
  } as SiteAudit;
}

describe("QA do pitch (anti-alucinação)", () => {
  it("exige ao menos 2 defeitos reais citados quando existe auditoria", () => {
    const generic = qaPitch(
      "Oi! Vi que a Padaria do Zé pode vender muito mais na internet. Quer um site novo?",
      { websiteStatus: "has_website", siteAudit: audit() }
    );
    expect(generic.ok).toBe(false);
    expect(generic.issues.join(" ")).toContain("defeito");

    const good = qaPitch(
      "Oi! Vi que o site da Padaria do Zé está sem botão de WhatsApp e demora cerca de 2.4s para abrir. Isso custa pedido todo dia.",
      { websiteStatus: "has_website", siteAudit: audit() }
    );
    expect(good.ok).toBe(true);
    expect(citedAuditIssues("sem botão de whatsapp", audit()).length).toBeGreaterThan(0);
  });

  it("pega contradição de presença digital", () => {
    const noSite = qaPitch(
      "Oi! Seu site atual não aparece no Google e o Instagram também não ajuda. Quer resolver?",
      { websiteStatus: "none" }
    );
    expect(noSite.ok).toBe(false);
    expect(noSite.issues.join(" ")).toContain('"seu site"');
  });

  it("pega números inventados de tempo de carregamento", () => {
    const result = qaPitch(
      "Oi! Seu site demora 8s para abrir e não tem botão de WhatsApp. Vamos melhorar?",
      { websiteStatus: "has_website", siteAudit: audit() }
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toContain("8s");
  });

  it("não reclama de pitch sem auditoria quando não há números", () => {
    const result = qaPitch(
      "Oi! A Padaria do Zé aparece no Google sem página própria, então quem busca acaba indo no concorrente. Posso te mostrar uma prévia?",
      { websiteStatus: "none" }
    );
    expect(result.ok).toBe(true);
    expect(result.retryHint).toBe("");
  });
});
