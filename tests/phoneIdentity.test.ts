import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { getCommunicationsByLead, getLeadById, upsertLead } from "../server/store/db";
import { getDb } from "../server/store/schema";
import { normalizePhone, phoneVariants } from "../server/services/leadIdentity";
import { app } from "../server";

/**
 * Regressão: o WhatsApp informa celular brasileiro SEM o 9º dígito
 * (55 61 9525-4732) enquanto o cadastro tem com ele (55 61 99525-4732).
 * Sem canonicalizar, a resposta do lead criava um LEAD DUPLICADO.
 */
describe("normalizePhone — 9º dígito do celular brasileiro", () => {
  it("põe o nono dígito quando o WhatsApp manda o formato legado", () => {
    expect(normalizePhone("556195254732")).toBe("5561995254732");
  });

  it("mantém o número quando já vem com o nono dígito", () => {
    expect(normalizePhone("5561995254732")).toBe("5561995254732");
    expect(normalizePhone("+55 61 99525-4732")).toBe("5561995254732");
  });

  it("prefixa 55 em DDD + número e ainda aplica o nono dígito", () => {
    expect(normalizePhone("61995254732")).toBe("5561995254732");
    expect(normalizePhone("6195254732")).toBe("5561995254732");
  });

  it("não mexe em telefone fixo (assinante começa em 2-5)", () => {
    expect(normalizePhone("6133334444")).toBe("556133334444");
  });

  it("variantes trazem as duas formas para busca no banco", () => {
    expect(phoneVariants("556195254732").sort()).toEqual(["556195254732", "5561995254732"]);
    expect(phoneVariants("")).toEqual([]);
  });
});

describe("webhook — inbound sem o 9º dígito cai no lead existente", () => {
  let server: any;
  let baseUrl = "";

  beforeEach(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("não duplica o lead quando o JID vem no formato antigo", async () => {
    const leadId = "phone-9digits";
    upsertLead({
      id: leadId,
      name: "Empresa do telefone",
      phone: "+55 61 99525-4732",
      pipelineStatus: "contacted",
      lastContactAt: new Date().toISOString(),
      contactAttempts: 1,
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const leadsBefore = (getDb().prepare("SELECT COUNT(*) n FROM leads").get() as any).n;

    // JID do WhatsApp sem o nono dígito
    const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "leadradar",
        data: {
          key: { remoteJid: "556195254732@s.whatsapp.net", fromMe: false, id: `msg_${Date.now()}` },
          pushName: "Paulo",
          message: { conversation: "agora não, me chama depois" },
        },
      }),
    });
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 200));

    const leadsAfter = (getDb().prepare("SELECT COUNT(*) n FROM leads").get() as any).n;
    expect(leadsAfter).toBe(leadsBefore); // nenhum lead novo

    const inbound = getCommunicationsByLead(leadId).find((item) => item.direction === "inbound");
    expect(inbound).toBeTruthy();
    expect(getLeadById(leadId)!.lastResponseAt).toBeTruthy();
  });
});
