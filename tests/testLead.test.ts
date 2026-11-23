import { describe, expect, it } from "vitest";
import {
  buildTestPitchMessage,
  hasPriorOutbound,
  isTestLead,
  shouldPitchTestLead,
} from "../server/services/testLeadService";
import type { StoredLead } from "../server/store/types";

function lead(overrides: Partial<StoredLead> = {}): StoredLead {
  return {
    id: "lead_sem_historico_teste",
    name: "Teste 1 (61 9927-7579)",
    pipelineStatus: "prospect",
    doNotContact: false,
    ...overrides,
  } as StoredLead;
}

describe("números de teste", () => {
  it("só marca como teste quem tem isTest", () => {
    expect(isTestLead(lead({ isTest: true }))).toBe(true);
    expect(isTestLead(lead())).toBe(false);
    expect(isTestLead(null)).toBe(false);
  });

  it("não aborda número de teste que pediu para não receber contato", () => {
    expect(shouldPitchTestLead(lead({ isTest: true, doNotContact: true }))).toBe(false);
  });

  it("aborda número de teste na primeira mensagem (sem histórico)", () => {
    expect(hasPriorOutbound("lead_sem_historico_teste")).toBe(false);
    expect(shouldPitchTestLead(lead({ isTest: true }))).toBe(true);
  });

  it("lead de verdade nunca recebe a prospecção de teste", () => {
    expect(shouldPitchTestLead(lead({ isTest: false }))).toBe(false);
  });
});

describe("mensagem enviada ao número de teste", () => {
  const msg = buildTestPitchMessage("Maria Silva");

  it("cumprimenta pelo primeiro nome", () => {
    expect(msg.startsWith("Oi, Maria, tudo bem?")).toBe(true);
    expect(msg).not.toContain("Silva");
  });

  it("usa o tom aprovado, sem ⭐ e sem 'sem custo nenhum'", () => {
    expect(msg).toContain("prévia gratuita");
    expect(msg).not.toContain("⭐");
    expect(msg).not.toMatch(/sem custo nenhum/i);
  });

  it("não vaza preço nem pacote", () => {
    expect(msg).not.toMatch(/R\$/);
    expect(msg).not.toMatch(/p[aá]cote/i);
    // "profissional" aqui é adjetivo de página, então a checagem olha o pacote
    expect(msg).not.toMatch(/\*\s*(Essencial|Profissional|Premium)\s*·/i);
  });

  it("vem em blocos curtos, sem travessão", () => {
    const blocos = msg.split("\n").filter(Boolean);
    expect(blocos.length).toBeGreaterThanOrEqual(3);
    expect(msg).not.toMatch(/[\u2014\u2013]/);
    expect(blocos[0].length).toBeLessThan(90);
  });

  it("pede permissão para mandar o link", () => {
    expect(msg).toMatch(/Posso te mandar o link/i);
  });

  it("sem nome do perfil, começa sem nome e sem vírgula solta", () => {
    const semNome = buildTestPitchMessage();
    expect(semNome.startsWith("Oi, tudo bem?")).toBe(true);
    expect(semNome).not.toContain("Oi, ,");
  });

  it("ignora pushName que não é nome (emoji, número, muito comprido)", () => {
    for (const ruim of ["🔥 Promo", "1234", "a".repeat(30)]) {
      expect(buildTestPitchMessage(ruim).startsWith("Oi, tudo bem?")).toBe(true);
    }
  });

  it("número de teste com cara de empresa recebe a abordagem aprovada", () => {
    const comEmpresa = buildTestPitchMessage("Paulo", {
      id: "lead-teste-empresa",
      name: "Dicore Barbearia",
      category: "Barbearia",
      city: "Três Lagoas",
      state: "MS",
      websiteStatus: "none",
      rating: 5,
      reviewsCount: 100,
      pipelineStatus: "prospect",
      isTest: true,
    } as any);
    expect(comEmpresa).toContain("Vi a Dicore Barbearia no Google");
  });

  it("o lead de simulação nunca dispara o gancho de número de teste", () => {
    expect(shouldPitchTestLead({ id: "pv-landing-1", isTest: true, pipelineStatus: "prospect" } as any)).toBe(false);
  });
});
