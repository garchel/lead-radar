import { describe, expect, it } from "vitest";
import { createInteraction, recordCommunication, upsertLead } from "../server/store/db";
import { getDb } from "../server/store/schema";
import { computeOutboundMetrics, resolveHook } from "../server/services/metricsService";
import type { StoredLead } from "../server/store/types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function seedLead(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const lead: StoredLead = {
    id,
    name: `Empresa ${id}`,
    phone: "5561999999999",
    city: "Goiânia",
    category: "Clínica & Estética",
    pipelineStatus: "contacted",
    websiteStatus: "none",
    ...overrides,
  };
  upsertLead(lead, { skipDedup: true });
  return lead;
}

describe("computeOutboundMetrics", () => {
  it("conta abordados, respostas e taxa por lead (não por mensagem)", async () => {
    seedLead("lead_m1");
    seedLead("lead_m2");

    // lead 1: uma abordagem + follow-up; lead 2: uma abordagem sem resposta
    recordCommunication({ leadId: "lead_m1", channel: "whatsapp", status: "sent", message: "oi 1", hook: "no_viewport" });
    recordCommunication({ leadId: "lead_m2", channel: "whatsapp", status: "sent", message: "oi 2", hook: "no_viewport" });
    await sleep(5);
    recordCommunication({ leadId: "lead_m1", channel: "whatsapp", status: "sent", message: "follow-up", hook: "no_viewport" });
    await sleep(5);
    recordCommunication({
      leadId: "lead_m1",
      channel: "whatsapp",
      direction: "inbound",
      status: "sent",
      message: "[RECEBIDA] tenho interesse",
    });

    const metrics = computeOutboundMetrics();
    expect(metrics.contacted).toBe(2);
    expect(metrics.sent).toBe(3);
    expect(metrics.replies).toBe(1);
    expect(metrics.replyRate).toBe(50);
  });

  it("agrupa por gancho e aponta o que mais responde", async () => {
    seedLead("lead_h1", { websiteStatus: "has_website", websiteUrl: "https://h1.com" });
    seedLead("lead_h2", { websiteStatus: "has_website", websiteUrl: "https://h2.com" });

    recordCommunication({ leadId: "lead_h1", channel: "whatsapp", status: "sent", message: "a", hook: "slow_response" });
    recordCommunication({ leadId: "lead_h2", channel: "whatsapp", status: "sent", message: "b", hook: "no_whatsapp_cta" });
    await sleep(5);
    recordCommunication({
      leadId: "lead_h1",
      channel: "whatsapp",
      direction: "inbound",
      status: "sent",
      message: "[RECEBIDA] me conta mais",
    });

    const metrics = computeOutboundMetrics();
    const slow = metrics.byHook.find((item) => item.hook === "slow_response");
    const wa = metrics.byHook.find((item) => item.hook === "no_whatsapp_cta");

    expect(slow).toMatchObject({ leads: 1, sent: 1, replies: 1, replyRate: 100 });
    expect(wa).toMatchObject({ leads: 1, sent: 1, replies: 0, replyRate: 0 });
    expect(metrics.bestHook?.hook).toBe("slow_response");
  });

  it("reunião e fechamento entram no funil", () => {
    seedLead("lead_f1", { pipelineStatus: "closed", websiteStatus: "none" });
    recordCommunication({ leadId: "lead_f1", channel: "whatsapp", status: "sent", message: "oi", hook: "sem_site" });
    createInteraction({
      leadId: "lead_f1",
      type: "initial_contact",
      channel: "whatsapp",
      deliveryStatus: "sent",
      outcome: "meeting_scheduled",
      occurredAt: new Date().toISOString(),
    });

    const metrics = computeOutboundMetrics();
    expect(metrics.meetings).toBeGreaterThanOrEqual(1);
    expect(metrics.closed).toBeGreaterThanOrEqual(1);
    const steps = metrics.funnel.map((item) => item.step);
    expect(steps).toEqual(["Abordados", "Responderam", "Reunião/negociação", "Fechados"]);
    expect(metrics.funnel[0].count).toBeGreaterThan(0);
  });

  it("respeita a janela 'since'", () => {
    seedLead("lead_w1");
    recordCommunication({ leadId: "lead_w1", channel: "whatsapp", status: "sent", message: "antigo", hook: "sem_site" });
    const metrics = computeOutboundMetrics({ since: "2099-01-01T00:00:00.000Z" });
    expect(metrics.contacted).toBe(0);
    expect(metrics.sent).toBe(0);
  });

  it("comunicação falha não conta como abordagem", () => {
    const before = computeOutboundMetrics();
    seedLead("lead_x1");
    recordCommunication({ leadId: "lead_x1", channel: "whatsapp", status: "failed", message: "falhou", hook: "sem_site" });
    const after = computeOutboundMetrics();
    expect(after.contacted).toBe(before.contacted);
    expect(after.sent).toBe(before.sent);
  });
  it("atribui a resposta ao gancho do PRIMEIRO contato, não ao follow-up", async () => {
    seedLead("lead_first", { websiteStatus: "has_website", websiteUrl: "https://first.com" });
    recordCommunication({ leadId: "lead_first", channel: "whatsapp", status: "sent", message: "abertura", hook: "hook_abertura_x" });
    await sleep(5);
    recordCommunication({ leadId: "lead_first", channel: "whatsapp", status: "sent", message: "follow-up", hook: "hook_followup_x" });
    await sleep(5);
    recordCommunication({
      leadId: "lead_first",
      channel: "whatsapp",
      direction: "inbound",
      status: "sent",
      message: "[RECEBIDA] quero sim",
    });

    const metrics = computeOutboundMetrics();
    const slow = metrics.byHook.find((item) => item.hook === "hook_abertura_x");
    const followUp = metrics.byHook.find((item) => item.hook === "hook_followup_x");

    expect(slow).toMatchObject({ leads: 1, sent: 2, replies: 1, replyRate: 100 });
    expect(followUp).toBeUndefined();
    expect(metrics.bestHook?.hook).toBe("hook_abertura_x");
  });

  it("resume entrega e sinaliza envios sem confirmação há mais de 24h", () => {
    seedLead("lead_d1");
    const before = computeOutboundMetrics().delivery;
    recordCommunication({ leadId: "lead_d1", channel: "whatsapp", status: "delivered", message: "entregue", hook: "sem_site" });
    recordCommunication({ leadId: "lead_d1", channel: "whatsapp", status: "read", message: "lida", hook: "sem_site" });
    recordCommunication({ leadId: "lead_d1", channel: "whatsapp", status: "failed", message: "falhou", hook: "sem_site" });
    const oldId = recordCommunication({ leadId: "lead_d1", channel: "whatsapp", status: "sent", message: "sem ack", hook: "sem_site" });
    getDb().prepare("UPDATE communications SET created_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", oldId);

    const after = computeOutboundMetrics().delivery;
    expect(after.sent).toBe(before.sent + 1);
    expect(after.delivered).toBe(before.delivered + 1);
    expect(after.read).toBe(before.read + 1);
    expect(after.failed).toBe(before.failed + 1);
    expect(after.unconfirmed).toBe(before.unconfirmed + 1);
  });

  it("lead em negociação nunca abordado não infla o funil", () => {
    seedLead("lead_n1", { pipelineStatus: "negotiating" });
    const metrics = computeOutboundMetrics();
    for (const step of metrics.funnel) {
      expect(step.count).toBeLessThanOrEqual(Math.max(metrics.contacted, 1));
      expect(step.rate).toBeLessThanOrEqual(100);
    }
    expect(metrics.meetings).toBeLessThanOrEqual(metrics.contacted);
    expect(metrics.closed).toBeLessThanOrEqual(metrics.contacted);
  });
});

describe("resolveHook", () => {
  it("usa o gancho gravado na comunicação", () => {
    const comm = { id: "c", leadId: "l", channel: "whatsapp", direction: "outbound", status: "sent" as const, createdAt: "", hook: "slow_response" };
    expect(resolveHook(comm, undefined)).toBe("slow_response");
  });

  it("deriva 'sem_site' quando o lead não tem site", () => {
    const comm = { id: "c", leadId: "l", channel: "whatsapp", direction: "outbound", status: "sent" as const, createdAt: "" };
    expect(resolveHook(comm, seedLead("lead_hook", { websiteStatus: "none" }))).toBe("sem_site");
  });
});
