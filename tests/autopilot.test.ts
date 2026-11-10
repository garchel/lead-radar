import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../server/store/schema";
import { getLeadById, getLeads, upsertLead, ensureCategoriesSeeded, ensureCitiesLoaded } from "../server/store/db";

const usage = {
  configured: true,
  searchesPerMonth: 250,
  throughputPerHour: 50,
  usedThisMonth: 0,
  remainingThisMonth: 250,
  usedThisHour: 0,
  remainingThisHour: 50,
  monthKey: "2026-11",
  hourWindowStart: null as string | null,
  nextMonthlyReset: new Date(Date.now() + 20 * 86400000).toISOString(),
  nextHourlyReset: null as string | null,
};

const searchMock = vi.fn();

vi.mock("../server/services/serpApi", () => ({
  getSerpApiUsage: () => usage,
}));

vi.mock("../server/services/prospectingService", () => ({
  searchBusinesses: (...args: any[]) => searchMock(...args),
}));

const dispatchMock = vi.fn();

vi.mock("../server/services/interactionService", () => ({
  dispatchLeadContact: (...args: any[]) => dispatchMock(...args),
}));

import {
  armAutopilot,
  autopilotTick,
  buildProspectMessage,
  disarmAutopilot,
  displayBusinessName,
  getAutopilotSettings,
  getAutopilotStatus,
  resetAutopilotDay,
  saveAutopilotSettings,
} from "../server/services/autoProspectingService";
import { resetBudgetState, setBudgetWindow } from "../server/services/quotaBudgetService";

function biz(name: string, overrides: Record<string, any> = {}) {
  return {
    id: `serp-${name}`,
    name,
    category: "Barbearia",
    address: "Rua Teste, 100",
    city: "Anápolis",
    state: "GO",
    phone: "+55 62 99999-0001",
    websiteStatus: "none",
    opportunityScore: 85,
    opportunityLevel: "high",
    ...overrides,
  };
}

describe("autopilot de coleta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usage.remainingThisMonth = 250;
    usage.usedThisMonth = 0;
    resetBudgetState();
    setBudgetWindow(0, 23); // janela aberta para o teste não depender da hora
    saveAutopilotSettings({ enabled: true, autoProspect: true, minScore: 60, dailyNewCap: 10, skipWithWebsite: true });
    disarmAutopilot();
    resetAutopilotDay();
    ensureCitiesLoaded();
    ensureCategoriesSeeded();
    getDb().prepare("DELETE FROM leads WHERE id LIKE 'auto-%' OR id LIKE 'serp-%'").run();
  });

  it("não roda enquanto o app não armou", async () => {
    const result = await autopilotTick(new Date());
    expect(result.ran).toBe(false);
    expect(result.reason).toMatch(/armou|armado/i);
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("armado + orçamento: salva só leads sem site e marca a cidade como buscada", async () => {
    searchMock.mockResolvedValue({
      source: "serpapi",
      cached: false,
      businesses: [
        biz("Barbearia Alfa"),
        biz("Barbearia Beta", { phone: "+55 62 99999-0002", googlePlaceId: "g2" }),
        biz("Barbearia Com Site", { websiteStatus: "has_website", googlePlaceId: "g3" }),
      ],
      serpApiRaw: {},
      serpApiMeta: {},
    });
    dispatchMock.mockResolvedValue({ status: "sent", channel: "whatsapp", communicationId: "c1", to: "5562999990001", detail: "ok" });

    armAutopilot("teste");
    const result = await autopilotTick(new Date());

    expect(result.ran).toBe(true);
    expect(result.search?.saved).toBeGreaterThanOrEqual(2);
    expect(searchMock).toHaveBeenCalledTimes(1);

    const savedLead = getLeads().find((lead) => lead.name === "Barbearia Alfa");
    expect(savedLead).toBeTruthy();
    expect(savedLead!.websiteStatus).toBe("none");

    const withSite = getLeads().find((lead) => lead.name === "Barbearia Com Site");
    expect(withSite).toBeUndefined();
  });

  it("prospecta o lead de maior score depois de coletar", async () => {
    // dois candidatos prontos, scores diferentes
    upsertLead({ id: "auto-baixo", name: "Empresa Baixa", category: "Barbearia", address: "x", city: "Anápolis", state: "GO", phone: "+55 62 98888-0001", websiteStatus: "none", opportunityScore: 65, pipelineStatus: "prospect", savedAt: new Date().toISOString() } as any);
    upsertLead({ id: "auto-alto", name: "Empresa Alta", category: "Barbearia", address: "x", city: "Anápolis", state: "GO", phone: "+55 62 98888-0002", websiteStatus: "none", opportunityScore: 95, pipelineStatus: "prospect", savedAt: new Date().toISOString() } as any);

    searchMock.mockResolvedValue({ source: "serpapi", cached: true, businesses: [biz("Barbearia Gama", { googlePlaceId: "g9" })], serpApiRaw: {}, serpApiMeta: {} });
    dispatchMock.mockResolvedValue({ status: "sent", channel: "whatsapp", communicationId: "c2", to: "5562988880002", detail: "Enviado" });

    armAutopilot("teste");
    const result = await autopilotTick(new Date());

    expect(result.ran).toBe(true);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock.mock.calls[0][0].id).toBe("auto-alto"); // maior score primeiro
    expect(result.prospect?.sent).toBe(true);
  });

  it("respeita o teto diário de contatos novos", async () => {
    saveAutopilotSettings({ dailyNewCap: 1 });
    for (let i = 0; i < 3; i += 1) {
      upsertLead({ id: `auto-cap-${i}`, name: `Empresa Cap ${i}`, category: "Barbearia", address: "x", city: "Anápolis", state: "GO", phone: `+55 62 97777-000${i}`, websiteStatus: "none", opportunityScore: 90 - i, pipelineStatus: "prospect", savedAt: new Date().toISOString() } as any);
    }
    searchMock.mockResolvedValue({ source: "serpapi", cached: true, businesses: [biz("Barbearia Delta", { googlePlaceId: "g20" })], serpApiRaw: {}, serpApiMeta: {} });
    dispatchMock.mockResolvedValue({ status: "sent", channel: "whatsapp", communicationId: "c3", to: "5562977770000", detail: "Enviado" });

    armAutopilot("teste");
    await autopilotTick(new Date());
    // segundo pulso: o teto de 1 já foi usado, então não deve mandar de novo
    resetBudgetState();
    await autopilotTick(new Date(Date.now() + 5000));

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    const status = getAutopilotStatus();
    expect(status.settings.dailyNewCap).toBe(1);
  });

  it("nome do negócio em CAIXA ALTA não vira saudação de pessoa", () => {
    expect(displayBusinessName("VAMOS SORRIR - NOSSA SRA DO SOCORRO")).toBe("Vamos Sorrir - Nossa Sra do Socorro");
    expect(displayBusinessName("Barbearia do Zé")).toBe("Barbearia do Zé");

    const msg = buildProspectMessage({
      name: "CLINICA ODONTO VIDA",
      websiteStatus: "none",
      rating: 4.8,
      analysis: undefined,
    } as any);
    expect(msg).not.toMatch(/Oi, CLINICA/);
    expect(msg).not.toContain("Oi, Clinica");
    expect(msg).toContain("Clinica Odonto Vida");
    expect(msg).toContain("4,8★");
  });

  it("mensagem de D0 personalizada usa o pitch da análise quando existe", () => {
    const lead = getLeadById("auto-alto") || ({} as any);
    const comPitch = buildProspectMessage({ ...lead, name: "Barbearia X", analysis: { customPitchWhatsApp: "Pitch pronto da IA." } } as any);
    expect(comPitch).toBe("Pitch pronto da IA.");

    const semPitch = buildProspectMessage({ ...lead, name: "Barbearia X", rating: 4.9, analysis: undefined } as any);
    expect(semPitch).toContain("Vértice");
    expect(semPitch).toContain("Barbearia");
  });
});
