import { describe, expect, it } from "vitest";
import { upsertLead } from "../server/store/db";
import { createProject } from "../server/projects/service";
import { generateBriefingPdf } from "../server/briefing/pdf";
import type { StoredLead } from "../server/store/types";

const lead: StoredLead = {
  id: "pdf-lead-1",
  name: "Padaria Estrela",
  category: "Alimentação",
  city: "Osasco",
  state: "SP",
  phone: "(11) 7777-8888",
  websiteStatus: "none",
  pipelineStatus: "negotiating",
};

describe("PDF do briefing", () => {
  it("gera um PDF válido a partir do briefing do projeto", async () => {
    const stored = upsertLead(lead);
    const project = createProject({ leadId: stored.id, name: "LP Padaria Estrela" });
    const withBriefing = {
      ...project,
      briefing: [
        { fieldTitle: "Nome da empresa", answer: "Padaria Estrela" },
        { fieldTitle: "Público-alvo", answer: "Moradores do bairro, 25-45 anos" },
        { fieldTitle: "Proposta de valor", answer: "Pães artesanais assados na hora" },
      ],
    };

    const pdf = await generateBriefingPdf(withBriefing);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("gera um PDF mesmo sem respostas de briefing importadas", async () => {
    const stored = upsertLead({ ...lead, id: "pdf-lead-2", name: "Barbearia Navalha", phone: "(11) 8888-9999" });
    const project = createProject({ leadId: stored.id, name: "LP Barbearia" });

    const pdf = await generateBriefingPdf(project);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});