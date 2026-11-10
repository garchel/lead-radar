import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCommunicationByExternalId,
  getCommunicationsByLead,
  recordCommunication,
  upsertLead,
} from "../server/store/db";
import {
  handleAckEvent,
  normalizeAckStatus,
  recordInboundIfNew,
  reconcileLeadMessages,
} from "../server/services/whatsappInboundService";
import type { StoredLead } from "../server/store/types";

function makeLead(id = "lead_ack"): StoredLead {
  const now = new Date().toISOString();
  return {
    id,
    name: "Padaria do Zé",
    phone: "5511988887777",
    websiteStatus: "none",
    savedAt: now,
    updatedAt: now,
  } as StoredLead;
}

describe("ACK de entrega e reconciliação de inbound", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.WHATSMIAU_API_URL;
    delete process.env.WHATSMIAU_API_KEY;
    delete process.env.WHATSMIAU_INSTANCE;
  });

  it("mapeia os status dos provedores para o nosso modelo", () => {
    expect(normalizeAckStatus("DELIVERY_ACK")).toBe("delivered");
    expect(normalizeAckStatus("READ")).toBe("read");
    expect(normalizeAckStatus("PLAYED")).toBe("read");
    expect(normalizeAckStatus("server_ack")).toBe("sent");
    expect(normalizeAckStatus("failed")).toBe("failed");
    expect(normalizeAckStatus("qualquer-coisa")).toBeNull();
  });

  it("aplica ACK em ordem e nunca regride (read antes de delivered)", () => {
    const lead = makeLead();
    upsertLead(lead, { skipDedup: true });
    const commId = recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      status: "sent",
      message: "Oi! Tudo bem?",
      externalId: "3EB0ACK1",
    });

    const first = handleAckEvent({
      event: "messages.update",
      data: { key: { id: "3EB0ACK1", fromMe: true }, status: "READ" },
    });
    expect(first.applied).toBe(1);
    expect(getCommunicationByExternalId("3EB0ACK1")?.status).toBe("read");

    // ACK atrasado não volta para "delivered"
    handleAckEvent({
      event: "messages.update",
      data: { key: { id: "3EB0ACK1", fromMe: true }, status: "DELIVERY_ACK" },
    });
    expect(getCommunicationByExternalId("3EB0ACK1")?.status).toBe("read");

    // Falha sempre sobrescreve
    handleAckEvent({ event: "messages.update", data: { key: { id: "3EB0ACK1", fromMe: true }, status: "failed" } });
    expect(getCommunicationByExternalId("3EB0ACK1")?.status).toBe("failed");
    expect(getCommunicationsByLead(lead.id)[0].id).toBe(commId);
  });

  it("ignora ACK de mensagem que não é nossa", () => {
    const result = handleAckEvent({
      event: "messages.update",
      data: { key: { id: "3EB0DELE", fromMe: false }, status: "READ" },
    });
    expect(result.applied).toBe(0);
  });

  it("entende o formato de statuses da Meta Cloud API", () => {
    const lead = makeLead("lead_ack_meta");
    upsertLead(lead, { skipDedup: true });
    recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      status: "sent",
      message: "Proposta",
      externalId: "wamid.META1",
    });
    handleAckEvent({
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.META1", status: "delivered", recipient_id: "5511" }] } }] }],
    });
    expect(getCommunicationByExternalId("wamid.META1")?.status).toBe("delivered");
  });

  it("não duplica inbound quando o webhook é reentregue", () => {
    const lead = makeLead("lead_ack_dedupe");
    upsertLead(lead, { skipDedup: true });

    const first = recordInboundIfNew({ lead, text: "Quanto custa?", externalId: "INB1" });
    const second = recordInboundIfNew({ lead, text: "Quanto custa?", externalId: "INB1" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(getCommunicationsByLead(lead.id)).toHaveLength(1);
  });

  it("reconciliação degrada com mensagem clara quando não há gateway", async () => {
    const lead = makeLead("lead_ack_reconcile");
    upsertLead(lead, { skipDedup: true });
    const result = await reconcileLeadMessages(lead, { count: 5 });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("reconciliação sem âncora explica que falta uma mensagem de referência", async () => {
    process.env.WHATSAPP_PROVIDER = "whatsmiau";
    process.env.WHATSMIAU_API_URL = "http://gateway.test";
    process.env.WHATSMIAU_API_KEY = "k";
    const lead = makeLead("lead_ack_no_anchor");
    upsertLead(lead, { skipDedup: true });

    const result = await reconcileLeadMessages(lead, { count: 5 });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_anchor");
    expect(result.error).toMatch(/referência/i);
  });

  it("reconciliação usa o último externalId como âncora e importa inbound + ACK", async () => {
    process.env.WHATSAPP_PROVIDER = "whatsmiau";
    process.env.WHATSMIAU_API_URL = "http://gateway.test";
    process.env.WHATSMIAU_API_KEY = "k";
    const lead = makeLead("lead_ack_anchor");
    upsertLead(lead, { skipDedup: true });
    recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      status: "sent",
      message: "Oi!",
      externalId: "OUT1",
    });

    const fetchMock = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({
        id: "OUT1",
        fromMe: true,
        number: "5511988887777",
        count: 100,
        since: "2026-01-01",
      });
      return new Response(
        JSON.stringify([
          { key: { id: "OUT1", fromMe: true }, message: { conversation: "Oi!" }, status: "READ" },
          { key: { id: "IN1", fromMe: false }, message: { conversation: "Tenho interesse" }, status: "DELIVERY_ACK" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await reconcileLeadMessages(lead, { count: 500, since: "2026-01-01" });

    expect(result.ok).toBe(true);
    expect(result.synced).toBe(2);
    expect(result.inbound).toBe(1);
    expect(result.acks).toBe(1);
    expect(getCommunicationByExternalId("OUT1")?.status).toBe("read");
    expect(getCommunicationByExternalId("IN1")?.direction).toBe("inbound");
  });
});
