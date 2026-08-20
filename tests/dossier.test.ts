import { describe, expect, it } from "vitest";
import { upsertLead, getLeadById, updateLeadAnalysis } from "../server/store/db";
import { buildLeadDossier } from "../server/dossier/dossier";
import type { StoredLead } from "../server/store/types";

const lead: StoredLead = {
  id: "lead-dossier",
  name: "Odonto Prime Sorocaba",
  category: "Dentista",
  city: "Sorocaba",
  state: "SP",
  phone: "(15) 98765-4321",
  rating: 4.9,
  reviewsCount: 128,
  websiteStatus: "none",
  email: "contato@odonto.example",
  pipelineStatus: "prospect",
};

describe("export_dossier / dossiê HTML", () => {
  it("gera um documento HTML a partir do lead e da análise persistida", () => {
    upsertLead(lead);
    updateLeadAnalysis(lead.id, {
      opportunityScore: 94,
      urgencyLevel: "alta",
      missingFeatures: ["Botão de WhatsApp", "Catálogo visual"],
      whyTheyNeedLandingPage: "Perde agendamentos por falta de página própria.",
      competitorAdvantage: "Concorrentes já anunciam no Google Ads.",
      customPitchWhatsApp: "Olá! Vi seu perfil no Google...",
      customPitchEmail: "Assunto: Oportunidade",
    });

    const fresh = getLeadById(lead.id)!;
    const html = buildLeadDossier(fresh);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Odonto Prime Sorocaba");
    expect(html).toContain("Botão de WhatsApp");
    expect(html).toContain("94");
    expect(html).toContain("alta");
    expect(html).not.toContain("<script");
  });

  it("escapa HTML malicioso para evitar injeção no dossiê", () => {
    upsertLead({ ...lead, id: "lead-xss", name: "<img src=x onerror=alert(1)>", phone: "(16) 99999-0000" });
    const fresh = getLeadById("lead-xss")!;
    const html = buildLeadDossier(fresh);
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img");
  });
});