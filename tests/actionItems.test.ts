import { describe, expect, it } from "vitest";
import { buildActionItems } from "../server/actionItems";
import { createProject } from "../server/projects/service";
import {
  createInteraction,
  recordCommunication,
  upsertLead,
  upsertProject,
} from "../server/store/db";
import type { StoredLead } from "../server/store/types";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function seedLead(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const lead: StoredLead = {
    id,
    name: `Lead ${id}`,
    phone: "5561999999999",
    city: "Goiânia",
    category: "Clínica",
    pipelineStatus: "contacted",
    websiteStatus: "none",
    contactAttempts: 1,
    lastContactAt: daysAgo(3),
    ...overrides,
  };
  upsertLead(lead, { skipDedup: true });
  return lead;
}

describe("buildActionItems", () => {
  it("começa vazio num banco sem pendências", () => {
    const result = buildActionItems();

    expect(result.success).toBe(true);
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.outbox.failed).toEqual([]);
    expect(result.outbox.unconfirmed).toEqual([]);
  });

  it("agrega código entregue, prazo vencido, recontatos e outbox", () => {
    seedLead("ai_lead_1");
    const project = createProject({ leadId: "ai_lead_1", name: "LP Teste" });
    upsertProject({
      ...project,
      devStatus: "codigo_entregue",
      dueDate: daysAgo(2),
    });

    seedLead("ai_lead_2");
    createInteraction({
      leadId: "ai_lead_2",
      type: "initial_contact",
      channel: "whatsapp",
      deliveryStatus: "sent",
      outcome: "no_response",
      message: "primeira abordagem",
      occurredAt: daysAgo(4),
      nextContactAt: daysAgo(1),
    });

    seedLead("ai_lead_3");
    recordCommunication({
      leadId: "ai_lead_3",
      channel: "whatsapp",
      status: "failed",
      message: "teste de envio",
    });

    const result = buildActionItems();
    const byKind = new Map(result.items.map((item) => [item.kind, item]));

    expect(byKind.has("code_review")).toBe(true);
    expect(byKind.get("code_review")?.projectId).toBe(project.id);
    expect(byKind.get("code_review")?.tab).toBe("projects");
    expect(byKind.get("code_review")?.severity).toBe("high");

    expect(byKind.has("project_overdue")).toBe(true);
    expect(byKind.get("project_overdue")?.tab).toBe("projects");

    expect(byKind.has("follow_ups_due")).toBe(true);
    expect(byKind.get("follow_ups_due")?.tab).toBe("crm");

    expect(byKind.has("outbox_failed")).toBe(true);
    expect(byKind.get("outbox_failed")?.tab).toBe("growth");

    // severidade alta vem antes da média
    const severities = result.items.map((item) => item.severity);
    const firstMedium = severities.indexOf("medium");
    const lastHigh = severities.lastIndexOf("high");
    if (firstMedium >= 0 && lastHigh >= 0) expect(lastHigh).toBeLessThan(firstMedium);

    expect(result.total).toBeGreaterThanOrEqual(4);
    expect(result.outbox.failed.map((f) => f.leadName)).toContain("Lead ai_lead_3");
  });

  it("ignora projeto concluído mesmo com prazo vencido e lead com doNotContact", () => {
    seedLead("ai_lead_4");
    const project = createProject({ leadId: "ai_lead_4", name: "LP Concluída" });
    upsertProject({
      ...project,
      status: "concluido",
      devStatus: "codigo_entregue",
      dueDate: daysAgo(5),
      completedAt: daysAgo(1),
    });

    seedLead("ai_lead_5", { doNotContact: true });
    createInteraction({
      leadId: "ai_lead_5",
      type: "initial_contact",
      channel: "whatsapp",
      deliveryStatus: "sent",
      outcome: "no_response",
      message: "primeira abordagem",
      occurredAt: daysAgo(6),
      nextContactAt: daysAgo(2),
    });

    const result = buildActionItems();
    const byKind = new Map(result.items.map((item) => [item.kind, item]));

    // o projeto concluído não deve aparecer em code_review nem project_overdue
    expect(byKind.get("code_review")?.detail || "").not.toContain("LP Concluída");
    expect(byKind.get("project_overdue")?.detail || "").not.toContain("LP Concluída");
    expect(result.items.find((i) => i.kind === "project_overdue" && i.detail.includes("LP Concluída"))).toBeUndefined();
  });
});
