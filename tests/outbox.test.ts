import { afterEach, describe, expect, it, vi } from "vitest";
import { getCommunicationById, recordCommunication, upsertLead } from "../server/store/db";
import { getDb } from "../server/store/schema";
import { listOutbox, retryOutbound } from "../server/services/outboxService";
import type { StoredLead } from "../server/store/types";

function makeLead(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const now = new Date().toISOString();
  return {
    id,
    name: "Empresa Outbox",
    phone: "5511988887777",
    websiteStatus: "none",
    savedAt: now,
    updatedAt: now,
    ...overrides,
  } as StoredLead;
}

describe("outbox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.WHATSMIAU_API_URL;
    delete process.env.WHATSMIAU_API_KEY;
  });

  it("lista falhas recentes e mensagens sem confirmação há mais de 24h", () => {
    const lead = makeLead("lead_ob1");
    upsertLead(lead, { skipDedup: true });

    const failedId = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", message: "falhou", hook: "sem_site" });
    const oldSentId = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "sent", message: "sem ack", hook: "sem_site" });
    recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "delivered", message: "entregue", hook: "sem_site" });
    getDb().prepare("UPDATE communications SET created_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", oldSentId);

    const snapshot = listOutbox();
    expect(snapshot.failed.map((item) => item.communicationId)).toContain(failedId);
    expect(snapshot.unconfirmed.map((item) => item.communicationId)).toContain(oldSentId);
    expect(snapshot.counts.failed).toBeGreaterThanOrEqual(1);
    expect(snapshot.counts.unconfirmed).toBeGreaterThanOrEqual(1);
  });

  it("não reenvia mensagem que não está failed", async () => {
    const lead = makeLead("lead_ob2");
    upsertLead(lead, { skipDedup: true });
    const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "sent", message: "ok" });

    const result = await retryOutbound(id);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/failed/i);
  });

  it("bloqueia reenvio de lead com opt-out", async () => {
    const lead = makeLead("lead_ob3", { doNotContact: true });
    upsertLead(lead, { skipDedup: true });
    const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", message: "oi" });

    const result = await retryOutbound(id);
    expect(result.ok).toBe(false);
    expect(result.detail).toMatch(/opt-out/i);
  });

  it("reenvia uma falha pelo gateway e registra a nova comunicação", async () => {
    process.env.WHATSAPP_PROVIDER = "whatsmiau";
    process.env.WHATSMIAU_API_URL = "http://gateway.test";
    process.env.WHATSMIAU_API_KEY = "k";
    const lead = makeLead("lead_ob4");
    upsertLead(lead, { skipDedup: true });
    const failedId = recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      status: "failed",
      message: "Oi, tudo bem?",
      hook: "sem_site",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ key: { id: "NEW1" } }), { status: 200 }))
    );

    const result = await retryOutbound(failedId);
    expect(result.ok).toBe(true);
    expect(result.communicationId).toBeTruthy();
    expect(result.communicationId).not.toBe(failedId);
    expect(getCommunicationById(result.communicationId!)?.status).toBe("sent");
  });
});
