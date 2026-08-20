import { describe, expect, it } from "vitest";
import { validateBusinessResults } from "../server/services/prospectingService";

const validLead = {
  id: "lead-1",
  name: "Empresa Real",
  category: "Dentista",
  address: "Rua Principal, 10",
  city: "Campinas",
  state: "SP",
  websiteStatus: "none",
  opportunityScore: 82,
  opportunityLevel: "high",
};

describe("validateBusinessResults", () => {
  it("aceita um lead real com os campos obrigatórios", () => {
    expect(validateBusinessResults([validLead])).toEqual([validLead]);
  });

  it("rejeita leads sem dados de localização obrigatórios", () => {
    const { address: _address, ...missingAddress } = validLead;
    expect(() => validateBusinessResults([missingAddress])).toThrow("address");
  });

  it("rejeita enumerações e scores inválidos", () => {
    expect(() => validateBusinessResults([{ ...validLead, websiteStatus: "unknown" }])).toThrow("websiteStatus");
    expect(() => validateBusinessResults([{ ...validLead, opportunityScore: 101 }])).toThrow("opportunityScore");
  });
});
