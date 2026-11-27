import { afterEach, describe, expect, it } from "vitest";
import { recordCommunication, setSetting, upsertLead } from "../server/store/db";
import { avaliarEnvio, chaveDoTexto, freioLigado, repeticaoParaOutroLead } from "../server/services/outboundGuard";
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
    const v = avaliarEnvio({ leadId: "lead-freio", mensagem: "Oi" });
    expect(v.liberado).toBe(false);
    expect(v.bloqueadoPor).toBe("freio");
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

    const v = avaliarEnvio({ leadId: b, mensagem: TEXTO });
    expect(v.liberado).toBe(false);
    expect(v.bloqueadoPor).toBe("repeticao");
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
    const v = avaliarEnvio({ leadId: b, mensagem: "Sua página ficou pronta, olha só o que mudou no topo." });
    expect(v.liberado).toBe(true);
  });
});
