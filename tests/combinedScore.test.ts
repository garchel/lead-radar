import { describe, expect, it } from "vitest";
import { computeCombinedScore } from "../server/services/prospectingService";
import { computeLeadScore } from "../server/services/leadQuality";

/**
 * O score antigo era aditivo com teto: 65 + 20 (sem site) + 10 (nota ≥ 4,5) = 95,
 * e mais bônus empurravam para 100. No banco isso virou 114 de 156 leads com
 * score exatamente 100 — nota que não ordena nada.
 *
 * O contrato que estes testes protegem agora:
 *   1. o score responde aos fatores e não satura;
 *   2. o topo não é ocupado por todo mundo;
 *   3. nível acompanha a faixa;
 *   4. `computeCombinedScore` é só a porta de entrada do mesmo cálculo.
 */

const clinica = {
  id: "serp-1",
  name: "Clínica X",
  category: "Dentista",
  address: "Rua A",
  city: "Brasília",
  state: "DF",
  websiteStatus: "none",
  rating: 4.8,
  reviewsCount: 120,
  phone: "(61) 99999-0000",
};

describe("scoring combinado (média ponderada)", () => {
  it("delega para o mesmo cálculo de computeLeadScore", () => {
    const viaCombinado = computeCombinedScore(clinica, { categoryPropensity: 95, marketTier: "A" });
    const viaQualidade = computeLeadScore({ ...clinica, categoryPropensity: 95, marketTier: "A" });
    expect(viaCombinado.score).toBe(viaQualidade.score);
    expect(viaCombinado.level).toBe(viaQualidade.level);
  });

  it("alta propensão + tier A + celular supera baixa propensão + tier D + sem telefone", () => {
    const alto = computeCombinedScore(clinica, { categoryPropensity: 95, marketTier: "A" });
    const baixo = computeCombinedScore(
      { ...clinica, phone: undefined },
      { categoryPropensity: 20, marketTier: "D" }
    );
    expect(alto.score).toBeGreaterThan(baixo.score);
    expect(alto.level).toBe("high");
    expect(baixo.score).toBeLessThan(alto.score - 10);
  });

  it("não satura: leads bons mas diferentes não empatam todos em 100", () => {
    const forte = computeCombinedScore(clinica, { categoryPropensity: 95, marketTier: "A" });
    const medio = computeCombinedScore(
      { ...clinica, rating: 4.1, reviewsCount: 6, phone: "(61) 3333-1000" },
      { categoryPropensity: 55, marketTier: "C" }
    );
    const fraco = computeCombinedScore(
      { ...clinica, websiteStatus: "has_website", rating: 3.6, reviewsCount: 3, phone: undefined },
      { categoryPropensity: 25, marketTier: "D" }
    );

    expect(forte.score).toBeLessThanOrEqual(100);
    expect(forte.score).toBeGreaterThan(medio.score);
    expect(medio.score).toBeGreaterThan(fraco.score);
    // o ponto do bug antigo: o topo não pode ser alcançado por qualquer um
    expect(medio.score).toBeLessThan(95);
    expect(fraco.score).toBeLessThan(60);
  });

  it("sem site vale mais que com site; com telefone vale mais que sem", () => {
    const semSite = computeCombinedScore({ ...clinica, websiteStatus: "none" }, {});
    const comSite = computeCombinedScore({ ...clinica, websiteStatus: "has_website" }, {});
    expect(semSite.score).toBeGreaterThan(comSite.score);

    const comFone = computeCombinedScore({ ...clinica, phone: "(61) 98888-7777" }, {});
    const semFone = computeCombinedScore({ ...clinica, phone: undefined }, {});
    expect(comFone.score).toBeGreaterThan(semFone.score);
  });

  it("nível acompanha a faixa do score", () => {
    const forte = computeCombinedScore(clinica, { categoryPropensity: 95, marketTier: "A" });
    const fraco = computeCombinedScore(
      { ...clinica, websiteStatus: "has_website", rating: 3.2, reviewsCount: 2, phone: undefined },
      { categoryPropensity: 20, marketTier: "D" }
    );
    expect(forte.level).toBe("high");
    expect(fraco.level).toBe("low");
    expect(forte.score).toBeGreaterThanOrEqual(75);
    expect(fraco.score).toBeLessThan(55);
  });
});
