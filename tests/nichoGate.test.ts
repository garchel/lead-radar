import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { avaliarNicho, bloqueioHttp, gateLigado } from "../server/services/nichoGate";
import { _resetCache } from "../server/services/nichoPoolService";

const envOriginal = { ...process.env };

beforeEach(() => {
  _resetCache();
  delete process.env.LEADRADAR_NICHO_GATE;
  delete process.env.LEADRADAR_NICHO_GATE_RESPOSTA;
});

afterEach(() => {
  process.env.LEADRADAR_NICHO_GATE = envOriginal.LEADRADAR_NICHO_GATE;
  process.env.LEADRADAR_NICHO_GATE_RESPOSTA = envOriginal.LEADRADAR_NICHO_GATE_RESPOSTA;
  if (!envOriginal.LEADRADAR_NICHO_GATE) delete process.env.LEADRADAR_NICHO_GATE;
  if (!envOriginal.LEADRADAR_NICHO_GATE_RESPOSTA) delete process.env.LEADRADAR_NICHO_GATE_RESPOSTA;
});

describe("barreira de nicho", () => {
  it("libera nicho catalogado", () => {
    const v = avaliarNicho({ name: "Barbearia Dom Corte", category: "barbearia" });
    expect(v.liberado).toBe(true);
    expect(v.nicho).toBe("barbearia");
    expect(v.motivo).toBeNull();
  });

  it("bloqueia nicho fora do catálogo", () => {
    const v = avaliarNicho({ name: "Restaurante Vovó Maria", category: "restaurante" });
    expect(v.liberado).toBe(false);
    expect(v.motivo).toMatch(/não catalogado/i);
    expect(v.motivo).toMatch(/continua salvo/i);
    expect(v.motivo).toMatch(/odontologia/);
  });

  it("bloqueia também quem não tem categoria", () => {
    expect(avaliarNicho({ name: "Empresa Sem Ramo" }).liberado).toBe(false);
  });

  it("libera resposta a mensagem recebida mesmo sem pool", () => {
    const v = avaliarNicho({ name: "Restaurante Vovó Maria", category: "restaurante" }, "reply");
    expect(v.liberado).toBe(true);
    expect(v.motivo).toMatch(/resposta/i);
  });

  it("bloqueia resposta quando a exceção é desligada", () => {
    process.env.LEADRADAR_NICHO_GATE_RESPOSTA = "off";
    const v = avaliarNicho({ name: "Restaurante Vovó Maria", category: "restaurante" }, "reply");
    expect(v.liberado).toBe(false);
  });

  it("desliga a barreira por completo com LEADRADAR_NICHO_GATE=off", () => {
    process.env.LEADRADAR_NICHO_GATE = "off";
    expect(gateLigado()).toBe(false);
    expect(avaliarNicho({ name: "Restaurante Vovó Maria", category: "restaurante" }).liberado).toBe(true);
  });

  it("devolve HTTP 409 com instrução de como liberar", () => {
    const b = bloqueioHttp({ name: "Restaurante Vovó Maria", category: "restaurante" });
    expect(b).not.toBeNull();
    expect(b!.status).toBe(409);
    expect(b!.body.bloqueadoPorNicho).toBe(true);
    expect(Array.isArray(b!.body.comoLiberar)).toBe(true);
  });

  it("não devolve bloqueio HTTP para nicho catalogado", () => {
    expect(bloqueioHttp({ name: "Óticas Popular", category: "Ótica" })).toBeNull();
  });
});

describe("o envio de WhatsApp respeita a barreira", () => {
  it("não chama o gateway e registra falha com motivo quando o nicho não tem pool", async () => {
    const { sendWhatsApp } = await import("../server/services/contactService");
    const { upsertLead } = await import("../server/store/db");
    const { vi } = await import("vitest");

    const lead = upsertLead({
      id: "gate-lead-1",
      name: "Restaurante Vovó Maria",
      category: "Restaurante",
      phone: "5561999998888",
    } as never);

    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const r = await sendWhatsApp(lead, "olá", undefined, "prospect");
    expect(r.status).toBe("failed");
    expect(r.blocked).toBe(true);
    expect(r.detail).toMatch(/não catalogado/i);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
