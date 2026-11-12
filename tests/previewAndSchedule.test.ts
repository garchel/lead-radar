import { describe, expect, it, beforeEach } from "vitest";
import { buildPreviewHtml, generateLeadPreview, previewServices, whatsappLink, previewExists, resolvePublicBaseUrl } from "../server/services/previewService";
import { ensureDefaultCadenceSchedule } from "../server/scheduler/scheduler";
import { dispatchLeadContact } from "../server/services/interactionService";
import { getCommunicationsByLead, getSchedules, recordCommunication, upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

function seed(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const lead: StoredLead = {
    id,
    name: "CLINICA +SORRISO",
    phone: "(77) 99888-1122",
    city: "Barreiras",
    state: "BA",
    neighborhood: "Centro",
    category: "Clínica odontológica",
    searchCategory: "Clínica Odontológica",
    pipelineStatus: "prospect",
    websiteStatus: "none",
    rating: 5,
    reviewsCount: 135,
    opportunityScore: 91,
    contactAttempts: 0,
    ...overrides,
  };
  upsertLead(lead, { skipDedup: true });
  return lead;
}

describe("prévia da landing page", () => {
  it("monta a primeira tela com os fatos reais do lead", () => {
    const html = buildPreviewHtml(seed("pv-a"));
    expect(html).toContain("Clinica +Sorriso");
    expect(html).toContain("5 ★ · 135 avaliações no Google");
    expect(html).toContain("Barreiras, BA");
    expect(html).toContain("https://wa.me/5577998881122");
    expect(html).toContain("Falar no WhatsApp");
  });

  it("se declara prévia e não finge ser o site pronto", () => {
    const html = buildPreviewHtml(seed("pv-b"));
    expect(html).toMatch(/Prévia/);
    expect(html).toContain("noindex");
    expect(html).toMatch(/ajustados com você antes de qualquer pagamento/);
  });

  it("só cita o preço da política comercial (nada de ticket do CRM)", () => {
    const html = buildPreviewHtml(seed("pv-c", { estimatedValue: "R$ 1.800 - R$ 3.500" }));
    expect(html).toContain("R$ 899");
    expect(html).not.toContain("1.800");
  });

  it("sem ficha do cliente, os serviços são espaços nomeados (não invenção)", () => {
    const lead = seed("pv-d");
    const services = previewServices(lead);
    expect(services).toHaveLength(3);
    expect(services[0]).toContain("Clínica Odontológica");
  });

  it("com ficha do cliente, usa os serviços dela", () => {
    const lead = seed("pv-e", {
      clientProfile: { services: ["Clareamento", "Implante", "Ortodontia"] } as any,
    });
    expect(previewServices(lead)).toEqual(["Clareamento", "Implante", "Ortodontia"]);
  });

  it("gera arquivo e devolve URL local; pública vem do env ou da rede local", () => {
    const lead = seed("pv-f");
    delete process.env.PUBLIC_BASE_URL;

    const semEnv = generateLeadPreview(lead);
    expect(previewExists(lead.id)).toBe(true);
    expect(semEnv.url).toBe(`/previews/${lead.id}.html`);
    // Sem env, a base é o IP da rede local (o celular no mesmo Wi-Fi abre o link).
    // Em máquina sem interface de rede o fallback é null e o link não é enviado.
    if (semEnv.publicUrl) {
      expect(semEnv.publicUrl).toMatch(/^http:\/\/(\d{1,3}\.){3}\d{1,3}:\d+\/previews\//);
      expect(semEnv.publicUrl).toContain(`/previews/${lead.id}.html`);
    }

    process.env.PUBLIC_BASE_URL = "https://preview.vertice.com.br/";
    const comBase = generateLeadPreview(lead);
    expect(comBase.publicUrl).toBe(`https://preview.vertice.com.br/previews/${lead.id}.html`);
    expect(resolvePublicBaseUrl()).toEqual({ baseUrl: "https://preview.vertice.com.br", source: "env" });
    delete process.env.PUBLIC_BASE_URL;
  });

  it("usa o IP da rede local quando não há PUBLIC_BASE_URL", () => {
    delete process.env.PUBLIC_BASE_URL;
    const resolvido = resolvePublicBaseUrl();
    if (resolvido.source === "lan") {
      expect(resolvido.baseUrl).toMatch(/^http:\/\/(\d{1,3}\.){3}\d{1,3}:\d+$/);
    } else {
      expect(resolvido.source).toBe("none");
    }
  });

  it("normaliza telefone para wa.me e recusa número inválido", () => {
    expect(whatsappLink("(77) 99888-1122")).toBe("https://wa.me/5577998881122");
    expect(whatsappLink("5577998881122")).toBe("https://wa.me/5577998881122");
    expect(whatsappLink("123")).toBeNull();
    expect(whatsappLink(undefined)).toBeNull();
  });
});

describe("cadência agendada", () => {
  it("cria o agendamento diário que faltava, com envio real", () => {
    ensureDefaultCadenceSchedule();
    const cadence = getSchedules().filter((s) => s.jobType === "outbound_cadence");
    expect(cadence).toHaveLength(1);
    expect(cadence[0].cron).toBe("0 9 * * 1-5");
    expect(cadence[0].payload?.dryRun).toBe(false);
    expect(cadence[0].enabled).toBe(true);
  });

  it("é idempotente (não duplica no segundo boot)", () => {
    ensureDefaultCadenceSchedule();
    ensureDefaultCadenceSchedule();
    expect(getSchedules().filter((s) => s.jobType === "outbound_cadence")).toHaveLength(1);
  });
});

describe("número que já falhou duas vezes", () => {
  beforeEach(() => {
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.EVOLUTION_API_URL;
    delete process.env.WHATSIAU_API_URL;
    delete process.env.WHATSMIau_API_URL;
  });

  it("não recebe nova abordagem (409), em qualquer porta", async () => {
    const lead = seed("pv-fail");
    recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", message: "t1", errorDetail: "gateway 500" });
    recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", message: "t2", errorDetail: "gateway 500" });

    const result = await dispatchLeadContact(lead, { channel: "whatsapp", message: "Oi! Posso te mostrar uma prévia?" });
    expect(result.blocked).toBe(true);
    expect(result.status).toBe("failed");
    expect(result.detail).toMatch(/2 envios falharam/);
  });

  it("grava o motivo da falha na comunicação", () => {
    const lead = seed("pv-detail");
    const id = recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      status: "failed",
      message: "tentativa",
      errorDetail: "HTTP 500 do gateway",
    });
    const comm = getCommunicationsByLead(lead.id).find((c) => c.id === id);
    expect(comm?.errorDetail).toBe("HTTP 500 do gateway");
  });
});
