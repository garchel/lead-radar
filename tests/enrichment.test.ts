import { describe, expect, it } from "vitest";
import { enrichLead, enrichLeadBatch } from "../server/enrichment";

describe("enrichment (falhas explícitas de configuração)", () => {
  it("enrichLead falha quando Google Places não está configurado", async () => {
    delete process.env.GOOGLE_MAPS_PLATFORM_KEY;
    delete process.env.HUNTER_API_KEY;
    delete process.env.BRASIL_API_URL;

    const lead: any = {
      id: "e-1",
      name: "Academia Nova Era",
      city: "São Paulo",
      state: "SP",
      pipelineStatus: "prospect",
    };

    await expect(enrichLead(lead)).rejects.toThrow("GOOGLE_MAPS_PLATFORM_KEY");
  });

  it("enrichLeadBatch propaga erro de configuração", async () => {
    const leads: any[] = [
      { id: "e-2", name: "Loja A", pipelineStatus: "prospect" },
      { id: "e-3", name: "Studio B", pipelineStatus: "prospect" },
    ];
    await expect(enrichLeadBatch(leads)).rejects.toThrow("GOOGLE_MAPS_PLATFORM_KEY");
  });
});