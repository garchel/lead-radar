import { describe, expect, it } from "vitest";
import { computeCombinedScore } from "../server/services/prospectingService";

const base = {
  id: "serp-1",
  name: "Clínica X",
  category: "Dentista",
  address: "Rua A",
  city: "Brasília",
  state: "DF",
  websiteStatus: "none",
  opportunityScore: 85,
};

describe("scoring combinado", () => {
  it("alta propensão + tier A + telefone sobe o score", () => {
    const r = computeCombinedScore(
      { ...base, phone: "(61) 99999-0000" },
      { categoryPropensity: 95, marketTier: "A" }
    );
    // 85 base +10 prop +8 tier +5 phone = 108 → clamp 100
    expect(r.score).toBe(100);
    expect(r.level).toBe("high");
  });

  it("baixa propensão + tier D derruba o score", () => {
    const r = computeCombinedScore(base, { categoryPropensity: 20, marketTier: "D" });
    // 85 -20 -8 = 57
    expect(r.score).toBe(57);
    expect(r.level).toBe("low");
  });

  it("score ausente usa default 60 antes dos ajustes", () => {
    const { opportunityScore: _omit, ...semScore } = base;
    const r = computeCombinedScore(semScore, {});
    expect(r.score).toBe(60);
  });

  it("clampa em 0–100; social_only com telefone fica high", () => {
    const low = computeCombinedScore({ ...base, opportunityScore: 30 }, { categoryPropensity: 20, marketTier: "D" });
    // 30 -20 -8 = 2
    expect(low.score).toBe(2);
    expect(low.level).toBe("low");
    const social = computeCombinedScore({ ...base, websiteStatus: "social_only", phone: "(61) 90000-0000" }, { categoryPropensity: 90 });
    // 85 +10 +5 +3 = clamp 100
    expect(social.score).toBe(100);
  });

  it("score médio fica entre 60 e 80", () => {
    const mid = computeCombinedScore({ ...base, opportunityScore: 65 }, { categoryPropensity: 70 });
    expect(mid.level).toBe("medium");
  });
});
