import { describe, expect, it } from "vitest";
import {
  buildCadenceMessage,
  CADENCE_STEPS,
  MAX_CADENCE_ATTEMPTS,
  nextCadenceStep,
  planCadence,
  runCadence,
} from "../server/services/cadenceService";
import { recordCommunication, setSetting, upsertLead } from "../server/store/db";
import type { SiteAudit, StoredLead } from "../server/store/types";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

function seed(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const lead: StoredLead = {
    id,
    name: `Clínica ${id}`,
    phone: "5561999999999",
    city: "Goiânia",
    category: "Clínica & Estética",
    pipelineStatus: "contacted",
    websiteStatus: "none",
    contactAttempts: 1,
    lastContactAt: daysAgo(3),
    ...overrides,
  };
  upsertLead(lead, { skipDedup: true });
  return lead;
}

const audit: SiteAudit = {
  url: "https://c.com",
  auditedAt: new Date().toISOString(),
  reachable: true,
  https: true,
  responseTimeMs: 7000,
  sizeKb: 400,
  tech: [],
  issues: [
    {
      code: "slow_response",
      severity: "critical",
      title: "Seu site demora 6,8s para abrir",
      detail: "x",
      fix: "y",
    },
  ],
  healthScore: 30,
  painScore: 70,
  headline: "Seu site demora 6,8s para abrir no celular",
  bullets: ["Seu site demora 6,8s para abrir"],
};

describe("nextCadenceStep", () => {
  it("primeiro contato já feito → próximo é o toque 2", () => {
    expect(nextCadenceStep(seed("cad_s1"))?.step).toBe(2);
  });

  it("depois do toque 2 → toque 3", () => {
    expect(nextCadenceStep(seed("cad_s2", { contactAttempts: 2 }))?.step).toBe(3);
  });

  it("encerra após o terceiro toque", () => {
    expect(MAX_CADENCE_ATTEMPTS).toBe(3);
    expect(nextCadenceStep(seed("cad_s3", { contactAttempts: 3 }))).toBeNull();
  });

  it("lead nunca contatado não entra na cadência", () => {
    expect(nextCadenceStep(seed("cad_s4", { contactAttempts: 0 }))).toBeNull();
  });
});

describe("buildCadenceMessage", () => {
  const step2 = CADENCE_STEPS[0];
  const step3 = CADENCE_STEPS[1];

  it("toque 2 de lead com site cita a prévia, sem repetir a mesma mensagem", () => {
    const message = buildCadenceMessage(
      seed("cad_m1", { websiteStatus: "has_website", websiteUrl: "https://c.com", siteAudit: audit }),
      step2
    );
    expect(message).toMatch(/prévia/i);
    expect(message).toMatch(/demora 6,8s/i);
  });

  it("toque 2 de lead sem site usa o gancho de invisibilidade", () => {
    const message = buildCadenceMessage(seed("cad_m2", { websiteStatus: "none", websiteUrl: undefined }), step2);
    expect(message).toMatch(/não tem site/i);
    expect(message).toMatch(/prévia/i);
  });

  it("toque 3 traz prazo e pergunta fechada", () => {
    const message = buildCadenceMessage(
      seed("cad_m3", { websiteStatus: "has_website", websiteUrl: "https://c.com", siteAudit: audit }),
      step3
    );
    expect(message).toMatch(/fechar a agenda/i);
    expect(message).toMatch(/hoje ou amanhã/i);
  });
});

describe("planCadence", () => {
  it("inclui quem está no prazo e ignora quem ainda não venceu", () => {
    seed("cad_p1", { lastContactAt: daysAgo(3) });
    seed("cad_p2", { lastContactAt: daysAgo(1) });

    const plan = planCadence({ leadIds: ["cad_p1", "cad_p2"] });
    const ids = plan.candidates.map((item) => item.lead.id);
    expect(ids).toContain("cad_p1");
    expect(ids).not.toContain("cad_p2");
  });

  it("respeita opt-out", () => {
    seed("cad_p3", { doNotContact: true });
    const plan = planCadence({ leadIds: ["cad_p3"] });
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skipped.find((item) => item.leadId === "cad_p3")?.reason).toMatch(/opt-out/i);
  });

  it("para quando o lead respondeu", () => {
    seed("cad_p4", { lastContactAt: daysAgo(10), lastResponseAt: daysAgo(1) });
    const plan = planCadence({ leadIds: ["cad_p4"] });
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skipped.find((item) => item.leadId === "cad_p4")?.reason).toMatch(/já respondeu/i);
  });

  it("não atropela conversa aberta (última mensagem é do lead)", () => {
    seed("cad_p5", { lastContactAt: daysAgo(4) });
    recordCommunication({
      leadId: "cad_p5",
      channel: "whatsapp",
      direction: "inbound",
      status: "sent",
      message: "[RECEBIDA] quanto custa?",
    });
    const plan = planCadence({ leadIds: ["cad_p5"] });
    expect(plan.candidates).toHaveLength(0);
    expect(plan.skipped.find((item) => item.leadId === "cad_p5")?.reason).toMatch(/conversa aberta/i);
  });

  it("não fura janela de recontato acordada", () => {
    seed("cad_p6", {
      lastContactAt: daysAgo(10),
      nextContactAt: new Date(Date.now() + 5 * DAY).toISOString(),
    });
    const plan = planCadence({ leadIds: ["cad_p6"] });
    expect(plan.candidates).toHaveLength(0);
  });

  it("aplica o teto diário configurado", () => {
    setSetting("automation_cadence_daily_cap", "1");
    seed("cad_p7", { lastContactAt: daysAgo(3) });
    recordCommunication({ leadId: "cad_p7", channel: "whatsapp", status: "sent", message: "hoje", hook: "sem_site" });

    const plan = planCadence();
    expect(plan.cap).toBe(1);
    expect(plan.usedToday).toBeGreaterThanOrEqual(1);
    expect(plan.remaining).toBe(0);
  });
});

describe("runCadence", () => {
  it("dry run (padrão) planeja sem enviar nada", async () => {
    seed("cad_r1", { lastContactAt: daysAgo(3) });
    const result = await runCadence({ leadIds: ["cad_r1"] });
    expect(result.dryRun).toBe(true);
    expect(result.planned).toBe(1);
    expect(result.sent).toHaveLength(0);
  });

  it("sem orçamento no teto diário, nada é enviado", async () => {
    setSetting("automation_cadence_daily_cap", "0");
    seed("cad_r2", { lastContactAt: daysAgo(3) });
    const result = await runCadence({ leadIds: ["cad_r2"], dryRun: false });
    expect(result.blockedByCap).toBeGreaterThanOrEqual(1);
    expect(result.sent).toHaveLength(0);
  });

  it("respeita o desligamento global da cadência", async () => {
    setSetting("automation_cadence_enabled", "false");
    seed("cad_r3", { lastContactAt: daysAgo(3) });
    const result = await runCadence({ leadIds: ["cad_r3"], dryRun: false });
    expect(result.enabled).toBe(false);
    expect(result.blockedReason).toBe("cadence_disabled");
    expect(result.sent).toHaveLength(0);
  });
});
