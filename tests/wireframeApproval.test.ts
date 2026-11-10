import { describe, expect, it } from "vitest";
import { upsertLead } from "../server/store/db";
import { createProject, updateProject } from "../server/projects/service";
import { generateWireframeApprovalPdf } from "../server/wireframe/approvalPdf";
import type { StoredLead } from "../server/store/types";

const lead: StoredLead = {
  id: "wf-pdf-lead-1",
  name: "E&S Manutenções",
  category: "Manutenção",
  city: "Brasília",
  state: "DF",
  phone: "(61) 99999-0001",
  websiteStatus: "none",
  pipelineStatus: "negotiating",
};

describe("Termo de aprovação do wireframe", () => {
  it("gera um PDF válido com URL, checklist e base aprovada", async () => {
    const stored = upsertLead(lead);
    let project = createProject({ leadId: stored.id, name: "Site E&S Manutenções" });
    project = updateProject(project.id, {
      stage: "wireframe",
      copy: "Headline: manutenção em até 24h",
      designNotes: "Fundo claro, fonte escura",
      wireframeUrl: "https://cliente.github.io/wireframe-es/",
    });

    const pdf = await generateWireframeApprovalPdf(project);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("gera um PDF mesmo sem URL registrada (marca como pendente)", async () => {
    const stored = upsertLead({ ...lead, id: "wf-pdf-lead-2", name: "Oficina Modelo", phone: "(61) 99999-0002" });
    const project = createProject({ leadId: stored.id, name: "Site Oficina Modelo" });

    const pdf = await generateWireframeApprovalPdf(project);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
