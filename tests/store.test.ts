import { describe, expect, it } from "vitest";
import {
  deleteLead,
  getCommunications,
  getCommunicationsByLead,
  getAllJobs,
  getLeadById,
  getLeads,
  getLandingPageById,
  getLandingPages,
  getPipelineSummary,
  recordCommunication,
  replaceJobs,
  updateLeadAnalysis,
  upsertJob,
  upsertLandingPage,
  upsertLead,
} from "../server/store/db";
import type { LandingPage, StoredLead } from "../server/store/types";

const lead: StoredLead = {
  id: "lead-base",
  name: "Empresa Teste",
  category: "Dentista",
  city: "São Paulo",
  state: "SP",
  phone: "(11) 1111-2222",
  rating: 4.8,
  reviewsCount: 50,
  websiteStatus: "none",
  keyInsights: ["insight-a", "insight-b"],
  pipelineStatus: "prospect",
};

describe("store / SQLite (fonte da verdade compartilhada)", () => {
  it("insere e lê um lead com campos ricos", () => {
    upsertLead(lead);
    const got = getLeadById("lead-base");
    expect(got).toBeDefined();
    expect(got!.name).toBe("Empresa Teste");
    expect(got!.pipelineStatus).toBe("prospect");
    expect(got!.keyInsights).toEqual(["insight-a", "insight-b"]);
    expect(getLeads().length).toBeGreaterThanOrEqual(1);
  });

  it("persiste a análise de IA e a mantém ao atualizar o lead", () => {
    upsertLead({ ...lead, id: "lead-ana", name: "Empresa Análise", city: "Rio de Janeiro", phone: "(21) 2222-3333" });
    updateLeadAnalysis("lead-ana", { opportunityScore: 95, missingFeatures: ["X"] });

    // O padrão real do app é "espalhar o registro existente antes de atualizar"
    // (ex.: update_crm_status / leadRoutes.patch), preservando a análise.
    const existing = getLeadById("lead-ana")!;
    upsertLead({ ...existing, pipelineStatus: "contacted" });

    const got = getLeadById("lead-ana")!;
    expect(got.pipelineStatus).toBe("contacted");
    expect(got.analysis.opportunityScore).toBe(95);
  });

  it("remove um lead com deleteLead", () => {
    upsertLead({ ...lead, id: "lead-del", name: "Empresa Delete", city: "Santos", phone: "(13) 3333-4444" });
    expect(getLeadById("lead-del")).toBeDefined();
    deleteLead("lead-del");
    expect(getLeadById("lead-del")).toBeUndefined();
  });

  it("resume o pipeline por status", () => {
    upsertLead({ ...lead, id: "ps-prospect", name: "Empresa Prospect", city: "Jundiaí", phone: "(11) 4444-5555", pipelineStatus: "prospect" });
    upsertLead({ ...lead, id: "ps-closed", name: "Empresa Fechada", city: "Bauru", phone: "(14) 5555-6666", pipelineStatus: "closed" });
    upsertLead({ ...lead, id: "ps-contacted", name: "Empresa Contatada", city: "Limeira", phone: "(19) 6666-7777", pipelineStatus: "contacted" });
    const s = getPipelineSummary();
    expect(s.byStatus.prospect).toBeGreaterThanOrEqual(1);
    expect(s.byStatus.closed).toBeGreaterThanOrEqual(1);
    expect(s.totalLeads).toBeGreaterThanOrEqual(3);
  });

  it("gerencia Landing Pages", () => {
    upsertLead(lead);
    const lp: LandingPage = {
      id: "lp-1",
      leadId: "lead-base",
      businessName: "Empresa Teste",
      slug: "empresa-teste",
      stage: "rascunho",
      status: "aguardando_aprovacao",
      html: "<html/>",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    upsertLandingPage(lp);
    expect(getLandingPageById("lp-1")!.status).toBe("aguardando_aprovacao");
    expect(getLandingPages().length).toBeGreaterThanOrEqual(1);
  });

  it("registra e lista comunicações por lead", () => {
    upsertLead(lead);
    recordCommunication({ leadId: "lead-base", channel: "whatsapp", status: "failed", message: "oi" });
    const comms = getCommunicationsByLead("lead-base");
    expect(comms.length).toBe(1);
    expect(comms[0].channel).toBe("whatsapp");
    expect(getCommunications().length).toBeGreaterThanOrEqual(1);
  });

  it("gerencia jobs (upsert, replace, persistência)", () => {
    const job = {
      id: "job-1",
      type: "batch_prospecting",
      title: "Batch SP",
      status: "pending",
      progress: 0,
      createdAt: new Date().toISOString(),
      payload: { location: "São Paulo" },
      logs: [],
    };
    upsertJob(job as any);
    expect(getAllJobs().length).toBeGreaterThanOrEqual(1);
    replaceJobs([]);
    expect(getAllJobs().length).toBe(0);
  });
});