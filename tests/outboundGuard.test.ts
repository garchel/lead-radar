import { afterEach, describe, expect, it } from "vitest";
import { recordCommunication, setSetting, upsertLead } from "../server/store/db";
import { avaliarEnvio, chaveDoTexto, freioLigado, numeroFicticio, repeticaoParaOutroLead } from "../server/services/outboundGuard";
import type { StoredLead } from "../server/store/types";

function lead(id: string, phone: string): StoredLead {
  const now = new Date().toISOString();
  return { id, name: `Empresa ${id}`, phone, websiteStatus: "none", savedAt: now, updatedAt: now } as StoredLead;
}

const TEMPLATE = "Perfeito! Dá um minutinho que eu já te mando o link 👇";
// Texto único por teste: a trava olha os últimos 60 min de TODO o banco, então
// reusar a mesma frase entre casos faria um teste enxergar o outro.
const unico = (base: string) => `${base} [${Math.random().toString(36).slice(2, 8)}]`;

describe("travas de envio", () => {
  afterEach(() => {
    setSetting("automation_outbound_freeze", "false");
  });

  it("chaveDoTexto ignora emoji, caixa e espaço", () => {
    expect(chaveDoTexto("Perfeito!  Dá um minutinho 👇")).toBe(chaveDoTexto("perfeito! dá um minutinho"));
  });

  it("freio do dono bloqueia tudo", () => {
    setSetting("automation_outbound_freeze", "true");
    expect(freioLigado()).toBe(true);
    setSetting("automation_outbound_freeze", "false");
    expect(freioLigado()).toBe(false);
  });

  it("template repetido para outra pessoa é bloqueado (incidente dos 3 números)", () => {
    const a = `lead-guarda-a-${Date.now()}`;
    const b = `lead-guarda-b-${Date.now()}`;
    const TEXTO = unico(TEMPLATE);
    upsertLead(lead(a, "5561900000001"));
    upsertLead(lead(b, "5561900000002"));
    recordCommunication({ leadId: a, channel: "whatsapp", direction: "outbound", status: "sent", message: TEXTO, hook: "pagina_aviso" });

    const rep = repeticaoParaOutroLead(b, TEXTO);
    expect(rep.repetiu).toBe(true);
    expect(rep.paraQuem).toBe(a);
  });

  it("mesmo lead pode repetir (é conversa, não disparo)", () => {
    const a = `lead-guarda-c-${Date.now()}`;
    upsertLead(lead(a, "5561900000003"));
    const TEXTO = unico(TEMPLATE);
    recordCommunication({ leadId: a, channel: "whatsapp", direction: "outbound", status: "sent", message: TEXTO, hook: "pagina_aviso" });
    expect(repeticaoParaOutroLead(a, TEXTO).repetiu).toBe(false);
  });

  it("texto curto não entra na regra de template", () => {
    const a = `lead-guarda-d-${Date.now()}`;
    const b = `lead-guarda-e-${Date.now()}`;
    upsertLead(lead(a, "5561900000004"));
    upsertLead(lead(b, "5561900000005"));
    recordCommunication({ leadId: a, channel: "whatsapp", direction: "outbound", status: "sent", message: "ok" });
    expect(repeticaoParaOutroLead(b, "ok").repetiu).toBe(false);
  });

  it("texto diferente para outro lead passa", () => {
    const a = `lead-guarda-f-${Date.now()}`;
    const b = `lead-guarda-g-${Date.now()}`;
    upsertLead(lead(a, "5561900000006"));
    upsertLead(lead(b, "5561900000007"));
    recordCommunication({ leadId: a, channel: "whatsapp", direction: "outbound", status: "sent", message: unico(TEMPLATE) });
    expect(repeticaoParaOutroLead(b, "Sua página ficou pronta, olha só o que mudou no topo.").repetiu).toBe(false);
  });

  it("número de fixture (99999-000X) nunca recebe", () => {
    for (const n of ["+55 11 99999-0004", "5511999990009", "+55 62 99999-0002"]) {
      expect(numeroFicticio(n), n).toBe(true);
      const v = avaliarEnvio({ leadId: "lead-fict", mensagem: "texto qualquer de teste", to: n });
      expect(v.liberado, n).toBe(false);
    }
    expect(numeroFicticio("+55 61 93797-7728")).toBe(false);
  });

  it("ambiente de teste nunca envia WhatsApp real", () => {
    // vitest define VITEST=true — é exatamente o ambiente onde o vazamento aconteceu
    expect(process.env.VITEST).toBeTruthy();
    const v = avaliarEnvio({ leadId: "lead-teste-env", mensagem: "mensagem unica para nao cair em repeticao", to: "5561937977728" });
    expect(v.liberado).toBe(false);
    expect(v.bloqueadoPor).toBe("teste");
  });
});
