import { describe, expect, it } from "vitest";
import { upsertLead, upsertProject, getProjectById } from "../server/store/db";
import { createProject } from "../server/projects/service";
import {
  parseRepoUrl,
  buildProjectDevKit,
  buildProjectDevPrompt,
  setProjectDevRepo,
  submitProjectCode,
  approveProjectCode,
} from "../server/projects/devKit";
import type { StoredLead } from "../server/store/types";

const lead: StoredLead = {
  id: "dev-lead-1",
  name: "Clínica Sorriso",
  category: "Dentista",
  city: "São Paulo",
  state: "SP",
  phone: "(11) 1111-2222",
  websiteStatus: "none",
  pipelineStatus: "em_desenvolvimento",
  rating: 4.8,
  reviewsCount: 120,
  keyInsights: ["Sem site próprio", "Concorrência com presença digital forte"],
};

describe("parseRepoUrl", () => {
  it("interpreta URL https do GitHub", () => {
    expect(parseRepoUrl("https://github.com/acme/site-clinica")).toEqual({
      owner: "acme",
      name: "site-clinica",
    });
  });

  it("interpreta URL https com .git e barra final", () => {
    expect(parseRepoUrl("https://github.com/acme/site-clinica.git/")).toEqual({
      owner: "acme",
      name: "site-clinica",
    });
  });

  it("interpreta URL SSH (git@)", () => {
    expect(parseRepoUrl("git@github.com:acme/site-clinica.git")).toEqual({
      owner: "acme",
      name: "site-clinica",
    });
  });

  it("retorna null para entradas inválidas", () => {
    expect(parseRepoUrl("")).toBeNull();
    expect(parseRepoUrl("apenas-um-slug")).toBeNull();
    expect(parseRepoUrl("https://github.com/apenas-dono")).toBeNull();
  });
});

describe("kit de dados para o agente de IA de código", () => {
  it("monta o kit com lead + briefing e gera prompt com as informações do cliente", () => {
    upsertLead(lead);
    const project = createProject({
      leadId: "dev-lead-1",
      name: "LP Clínica Sorriso",
      type: "landing_page",
    });
    upsertProject({
      ...project,
      briefing: [{ fieldTitle: "Objetivo", answer: "Gerar leads de novos pacientes" }],
      copy: "Sorriso saudável começa aqui.",
      designNotes: "Paleta azul e branco",
    });

    const kit = buildProjectDevKit(project.id);
    expect(kit.lead?.name).toBe("Clínica Sorriso");
    expect(kit.briefing).toHaveLength(1);
    expect(kit.typeLabel).toBe("Landing Page");

    const prompt = buildProjectDevPrompt(project.id);
    expect(prompt).toContain("Clínica Sorriso");
    expect(prompt).toContain("Gerar leads de novos pacientes");
    expect(prompt).toContain("Sorriso saudável começa aqui.");
    expect(prompt).toContain("https://wa.me/551111112222");
  });

  it("registra o repositório e marca a etapa como 'em_desenvolvimento'", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "dev-lead-1", name: "LP Sorriso" });

    setProjectDevRepo(project.id, "https://github.com/acme/site-clinica");

    const updated = getProjectById(project.id)!;
    expect(updated.githubRepoUrl).toBe("https://github.com/acme/site-clinica");
    expect(updated.repoOwner).toBe("acme");
    expect(updated.repoName).toBe("site-clinica");
    expect(updated.devStatus).toBe("em_desenvolvimento");
  });

  it("registra a entrega do código com preview e aguarda aprovação humana", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "dev-lead-1", name: "LP Sorriso" });

    submitProjectCode(project.id, {
      repoUrl: "https://github.com/acme/site-clinica",
      previewUrl: "https://acme.github.io/site-clinica/",
      message: "Site pronto com todas as seções.",
    });

    const updated = getProjectById(project.id)!;
    expect(updated.devStatus).toBe("codigo_entregue");
    expect(updated.previewUrl).toBe("https://acme.github.io/site-clinica/");
    expect(updated.devMessage).toContain("Site pronto");

    const approved = approveProjectCode(project.id);
    expect(approved.devStatus).toBe("aprovado");
  });
});