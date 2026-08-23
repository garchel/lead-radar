import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { upsertLead, getLeads } from "../server/store/db";
import { buildStableLeadId } from "../server/services/leadIdentity";
// Importa o app Express real (server.ts exporta antes do listen)
import { app } from "../server";

let server: Server;
let baseUrl: string;

function payload(text: string, phone = "5511999990001") {
  return {
    event: "messages.upsert",
    instance: "leadradar",
    data: {
      key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
      message: { conversation: text },
    },
  };
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function seedLead(phone: string) {
  const lead = {
    id: buildStableLeadId({ name: `Clínica ${phone}`, phone }),
    name: `Clínica ${phone}`,
    category: "Dentista",
    city: "Catalão",
    state: "GO",
    phone,
    source: "test",
    pipelineStatus: "contacted",
  } as any;
  upsertLead(lead);
  return lead;
}

describe("POST /api/whatsapp/webhook (Evolution API)", () => {
  it("responde ack imediato e ignora payload vazio", async () => {
    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "connection.update" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("ignora mensagens do próprio número (fromMe)", async () => {
    seedLead("+55 11 99999-0001");
    const before = getLeads().length;
    await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "messages.upsert",
        data: { key: { remoteJid: "5511999990001@s.whatsapp.net", fromMe: true }, message: { conversation: "eco" } },
      }),
    });
    expect(getLeads().length).toBe(before); // nada mudou
  });

  it("interesse move o lead para negotiating e registra comunicação", async () => {
    seedLead("+55 11 99999-0002");
    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload("Oi, tenho interesse, como funciona?", "5511999990002")),
    });
    expect(res.status).toBe(200);

    // dá um tick para o processamento assíncrono pós-ack
    await new Promise((r) => setTimeout(r, 150));

    const lead = getLeads().find((l) => (l.phone || "").replace(/\D/g, "").endsWith("999990002"));
    expect(lead).toBeDefined();
    expect(lead!.pipelineStatus).toBe("negotiating");
    expect(lead!.lastResponseAt).toBeTruthy();
  });

  it("recusa move o lead para declined", async () => {
    seedLead("+55 11 99999-0003");
    await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload("Não tenho interesse, pode remover meu número?", "5511999990003")),
    });
    await new Promise((r) => setTimeout(r, 150));
    const lead = getLeads().find((l) => (l.phone || "").replace(/\D/g, "").endsWith("999990003"));
    expect(lead!.pipelineStatus).toBe("declined");
  });
});

