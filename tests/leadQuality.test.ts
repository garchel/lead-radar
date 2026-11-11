import { describe, expect, it } from "vitest";
import { classifyPhone, computeLeadScore, isReachableOnWhatsApp, passesQualityGate } from "../server/services/leadQuality";

/**
 * Qualificação: telefone, score e portão de entrada.
 *
 * Números reais do banco viraram caso de teste: 42 de 156 leads eram fixo e o
 * sistema tentava abordar mesmo assim (12 envios falharam no mesmo número).
 */

describe("classifyPhone", () => {
  it("reconhece celular brasileiro com e sem formatação", () => {
    for (const raw of ["(61) 99502-8647", "61995028647", "5561995028647", "+55 61 9 9502-8647"]) {
      const info = classifyPhone(raw);
      expect(info.isMobile, raw).toBe(true);
      expect(info.isLandline, raw).toBe(false);
      expect(info.digits.startsWith("55")).toBe(true);
    }
  });

  it("reconhece fixo (não abordar por WhatsApp sem validar)", () => {
    const info = classifyPhone("(61) 3054-8818");
    expect(info.isLandline).toBe(true);
    expect(info.isMobile).toBe(false);
  });

  it("recusa vazio e lixo", () => {
    expect(classifyPhone(undefined).isValid).toBe(false);
    expect(classifyPhone("").isValid).toBe(false);
    expect(classifyPhone("123").isValid).toBe(false);
  });
});

describe("computeLeadScore", () => {
  it("não satura: o mesmo dado bom não vira 100 automaticamente", () => {
    const comum = computeLeadScore({ websiteStatus: "none", rating: 4.6, reviewsCount: 20, phone: "(61) 99999-0000" });
    expect(comum.score).toBeLessThan(100);
    expect(comum.score).toBeGreaterThan(40);
  });

  it("premia quem tem WhatsApp confirmado e pune fixo", () => {
    const comWhats = computeLeadScore({ websiteStatus: "none", rating: 4.6, reviewsCount: 20, phone: "(61) 99999-0000", whatsappStatus: "yes" });
    const fixo = computeLeadScore({ websiteStatus: "none", rating: 4.6, reviewsCount: 20, phone: "(61) 3333-1000" });
    const semFone = computeLeadScore({ websiteStatus: "none", rating: 4.6, reviewsCount: 20 });
    expect(comWhats.score).toBeGreaterThan(fixo.score);
    expect(fixo.score).toBeGreaterThan(semFone.score);
  });

  it("cidade tier A + nicho de alta propensão sobe o score", () => {
    const base = { websiteStatus: "social_only", rating: 4.4, reviewsCount: 15, phone: "(61) 99999-0000" };
    const alto = computeLeadScore({ ...base, categoryPropensity: 95, marketTier: "A" });
    const baixo = computeLeadScore({ ...base, categoryPropensity: 20, marketTier: "D" });
    expect(alto.score - baixo.score).toBeGreaterThanOrEqual(8);
  });

  it("explica os motivos do score (usado na UI e no pitch)", () => {
    const result = computeLeadScore({
      websiteStatus: "none",
      rating: 4.8,
      reviewsCount: 120,
      phone: "(61) 99999-0000",
      whatsappStatus: "yes",
      categoryPropensity: 95,
      marketTier: "A",
    });
    expect(result.reasons).toContain("sem site próprio");
    expect(result.reasons).toContain("WhatsApp confirmado");
    expect(result.level).toBe("high");
  });
});

describe("passesQualityGate", () => {
  const base = { name: "Clínica X", city: "Brasília", state: "DF", websiteStatus: "none", rating: 4.5, reviewsCount: 12 };

  it("aceita lead normal", () => {
    expect(passesQualityGate(base).ok).toBe(true);
  });

  it("barra quem tem site próprio (quando o filtro está ligado)", () => {
    const result = passesQualityGate({ ...base, websiteStatus: "has_website" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/site/);
    expect(passesQualityGate({ ...base, websiteStatus: "has_website" }, { skipWithWebsite: false }).ok).toBe(true);
  });

  it("barra negócio sem nenhuma avaliação e nota abaixo do mínimo", () => {
    expect(passesQualityGate({ ...base, reviewsCount: 0 }).ok).toBe(false);
    expect(passesQualityGate({ ...base, rating: 3.2 }).ok).toBe(false);
  });

  it("dado ausente passa (no Google Maps é comum não ter nota)", () => {
    expect(passesQualityGate({ ...base, rating: undefined, reviewsCount: undefined }).ok).toBe(true);
  });
});

describe("isReachableOnWhatsApp", () => {
  it("celular passa; fixo não; validado como 'no' nunca", () => {
    expect(isReachableOnWhatsApp({ phone: "(61) 99999-0000" }).ok).toBe(true);
    expect(isReachableOnWhatsApp({ phone: "(61) 3333-1000" }).ok).toBe(false);
    expect(isReachableOnWhatsApp({ phone: "(61) 99999-0000", whatsappStatus: "no" }).ok).toBe(false);
    expect(isReachableOnWhatsApp({ phone: "(61) 3333-1000", whatsappStatus: "yes" }).ok).toBe(true);
  });

  it("com requireValidated, celular sem validação fica de fora", () => {
    expect(isReachableOnWhatsApp({ phone: "(61) 99999-0000" }, { requireValidated: true }).ok).toBe(false);
    expect(isReachableOnWhatsApp({ phone: "(61) 99999-0000", whatsappStatus: "yes" }, { requireValidated: true }).ok).toBe(true);
  });
});
