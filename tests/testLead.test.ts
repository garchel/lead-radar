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
    expect(msg.startsWith("Olá, Maria!")).toBe(true);
    expect(msg).not.toContain("Silva");
  });

  it("usa o texto novo, sem a palavra 'simples'", () => {
    expect(msg).toContain("página bonita, rápida e funcional");
    expect(msg).toContain("botão de WhatsApp levando o cliente direto pra você");
    expect(msg).not.toMatch(/páginas?\s+simples/i);
  });

  it("fala da prévia grátis e não vaza preço nem pacote", () => {
    expect(msg).toContain("A prévia é grátis");
    expect(msg).not.toMatch(/R\$/);
    expect(msg).not.toMatch(/Essencial|Profissional/i);
  });

  it("vem em blocos curtos, sem travessão", () => {
    const blocos = msg.split("\n").filter(Boolean);
    expect(blocos.length).toBeGreaterThanOrEqual(3);
    expect(msg).not.toMatch(/[\u2014\u2013]/);
    expect(blocos[0].length).toBeLessThan(90);
  });

  it("termina com uma pergunta", () => {
    expect(msg.trim().endsWith("?")).toBe(true);
  });

  it("sem nome do perfil, começa sem nome e sem vírgula solta", () => {
    const semNome = buildTestPitchMessage();
    expect(semNome.startsWith("Olá! Tudo bem?")).toBe(true);
    expect(semNome).not.toContain("Olá, !");
  });

  it("ignora pushName que não é nome (emoji, número, muito comprido)", () => {
    for (const ruim of ["🔥 Promo", "1234", "a".repeat(30)]) {
      expect(buildTestPitchMessage(ruim).startsWith("Olá! Tudo bem?")).toBe(true);
    }
  });
});
