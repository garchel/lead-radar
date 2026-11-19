import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchLeadContact, dispatchLeadReply, getContactPolicy, temMensagemSemResposta } from "../server/services/interactionService";
import { getCommunicationsByLead, recordCommunication, setSetting, upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

/**
 * Responder quem acabou de escrever não pode ser barrado pela janela de recontato.
 *
 * Bug de 19/11 na simulação: o lead respondeu "Quero sim" e a Clara não conseguiu
 * enviar — "Já existe contato registrado sem uma janela de recontato autorizada".
 * A política existe para não INSISTIR com quem não respondeu; ela estava sendo
 * aplicada em cima de uma resposta a mensagem recebida.
 */
const LEAD: StoredLead = {
  id: "lead-reply-1",
  name: "Dra. Carmen Pitol",
  phone: "+55 61 99525-4732",
  pipelineStatus: "contacted",
  lastContactAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as StoredLead;

function inbound(leadId: string, texto = "Quero sim") {
  return recordCommunication({
    leadId,
    channel: "whatsapp",
    direction: "inbound",
    message: texto,
    status: "sent",
  } as any);
}

describe("política de recontato x resposta", () => {
  beforeEach(() => {
    upsertLead(LEAD);
    setSetting("whatsapp_provider", "");
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.EVOLUTION_API_URL;
    delete process.env.WHATSMIAU_API_URL;
    delete process.env.META_WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_API_URL;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
    );
    setSetting("automation_humanize_enabled", "false");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a política continua barrando recontato frio (sem mensagem nova do lead)", () => {
    const policy = getContactPolicy(LEAD);
    expect(policy.allowed).toBe(false);
    expect(policy.reason).toContain("janela de recontato");
  });

  it("com mensagem do lead sem resposta, a conversa conta como aberta", () => {
    inbound(LEAD.id);
    expect(temMensagemSemResposta(LEAD.id)).toBe(true);
  });

  it("responder conversa aberta NÃO é bloqueado pela janela de recontato", async () => {
    inbound(LEAD.id);
    const r = await dispatchLeadContact({ ...LEAD }, { channel: "whatsapp", message: "Prontinho, mandei o link.", purpose: "reply" } as any);
    expect(r.blocked).toBeUndefined();
    expect(r.detail || "").not.toContain("janela de recontato");
  });

  it("mensagem manual em lead frio continua bloqueada (é abordagem, não resposta)", async () => {
    const r = await dispatchLeadContact({ ...LEAD }, { channel: "whatsapp", message: "Oi, tudo bem?", purpose: "reply" } as any);
    expect(r.blocked).toBe(true);
    expect(r.detail).toContain("janela de recontato");
  });

  it("opt-out LGPD vale até em resposta", async () => {
    inbound(LEAD.id);
    const r = await dispatchLeadContact({ ...LEAD, doNotContact: true }, { channel: "whatsapp", message: "oi", purpose: "reply" } as any);
    expect(r.blocked).toBe(true);
    expect(r.detail).toContain("não receber novos contatos");
  });

  it("depois de respondido, o thread tem a nossa mensagem como última", async () => {
    inbound(LEAD.id);
    await dispatchLeadContact({ ...LEAD }, { channel: "whatsapp", message: "Resposta enviada.", purpose: "reply" } as any);
    expect(getCommunicationsByLead(LEAD.id)[0]?.direction).toBe("outbound");
    expect(temMensagemSemResposta(LEAD.id)).toBe(false);
  });
});

describe("duas mensagens nossas seguidas", () => {
  beforeEach(() => {
    upsertLead({ ...LEAD, id: "lead-dupla-1", name: "Barbearia Dupla Teste", phone: "+55 67 95555-0001" } as StoredLead);
    setSetting("whatsapp_provider", "");
    delete process.env.WHATSAPP_PROVIDER;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("recusa resposta quando a última mensagem da conversa é nossa", async () => {
    recordCommunication({
      leadId: "lead-dupla-1",
      channel: "whatsapp",
      direction: "outbound",
      message: "Fechado, começo a montar agora.",
      status: "sent",
    } as any);

    const r = await dispatchLeadReply(
      { ...LEAD, id: "lead-dupla-1" } as StoredLead,
      { message: "Segue a paleta", purpose: "reply" }
    );

    expect(r.status).toBe("failed");
    expect(r.blocked).toBe(true);
    expect(r.detail).toMatch(/última mensagem da conversa é nossa/i);
  });

  it("libera quando o lead respondeu depois da nossa mensagem", async () => {
    recordCommunication({ leadId: "lead-dupla-1", channel: "whatsapp", direction: "outbound", message: "Oi!", status: "sent" } as any);
    inbound("lead-dupla-1", "pode mandar a prévia");

    const r = await dispatchLeadReply({ ...LEAD, id: "lead-dupla-1" } as StoredLead, { message: "Segue o link", purpose: "reply" });
    expect(r.blocked).not.toBe(true);
  });

  it("forçar libera o envio manual do dono", async () => {
    recordCommunication({ leadId: "lead-dupla-1", channel: "whatsapp", direction: "outbound", message: "Oi!", status: "sent" } as any);

    const r = await dispatchLeadReply(
      { ...LEAD, id: "lead-dupla-1" } as StoredLead,
      { message: "Correção: o link certo é este", purpose: "reply", force: true }
    );
    expect(r.blocked).not.toBe(true);
  });
});
