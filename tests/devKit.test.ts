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
  slugifySite,
  inferNiche,
  normalizeSitePath,
  suggestSitePath,
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

describe("organização por nicho (repo único)", () => {
  it("converte nome em slug e infere o nicho pela categoria", () => {
    expect(slugifySite("Clínica Sorriso")).toBe("clinica-sorriso");
    expect(inferNiche("Dentista")).toBe("dentista");
    expect(inferNiche("Clínica médica")).toBe("medico");
    expect(inferNiche("Advocacia")).toBe("advogado");
    expect(inferNiche("Mudanças")).toBe("transporte");
    expect(inferNiche("Ferragens")).toBe("construcao");
    expect(inferNiche("")).toBe("outros");
  });

  it("normaliza o caminho para sites/<nicho>/<slug>", () => {
    expect(normalizeSitePath("sites/dentista/clinica-sorriso/")).toBe("sites/dentista/clinica-sorriso");
    expect(normalizeSitePath("dentista\\clinica-sorriso")).toBe("sites/dentista/clinica-sorriso");
    expect(normalizeSitePath("./sites/medico/x")).toBe("sites/medico/x");
    expect(normalizeSitePath("")).toBe("");
  });

  it("sugere sites/<nicho>/<slug> a partir do lead e respeita o sitePath do projeto", () => {
    const base = { name: "LP Clínica Sorriso", leadCategory: "Dentista", leadName: "Clínica Sorriso" } as any;
    expect(suggestSitePath(base, lead)).toBe("sites/dentista/clinica-sorriso");
    expect(suggestSitePath({ ...base, sitePath: "sites/odonto/outro" } as any, lead)).toBe("sites/odonto/outro");
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
    expect(kit.sitePath).toBe("sites/dentista/clinica-sorriso");
    expect(kit.niche).toBe("dentista");

    const prompt = buildProjectDevPrompt(project.id);
    expect(prompt).toContain("Clínica Sorriso");
    expect(prompt).toContain("Gerar leads de novos pacientes");
    expect(prompt).toContain("Sorriso saudável começa aqui.");
    expect(prompt).toContain("https://wa.me/551111112222");
    expect(prompt).toContain("sites/dentista/clinica-sorriso");
    expect(prompt).toContain("repositório único");
    expect(prompt).not.toContain("novo repositório no GitHub");
  });

  it("inclui a identidade visual do lead no kit e no prompt", () => {
    upsertLead(
      {
        ...lead,
        id: "dev-lead-brand",
        brandSnapshot: {
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          source: "serpapi",
          query: "Clínica Sorriso São Paulo SP",
          profiles: { instagram: "https://instagram.com/clinica.sorriso" },
          palette: [{ hex: "#0F4C81", name: "Azul confiança", role: "primary" }],
          tone: ["acolhedor", "limpo"],
          logo: { description: "Sorriso estilizado", confidence: 0.8 },
          imagery: [],
          summary: "Identidade clara e acolhedora.",
          confidence: 0.8,
        },
      },
      { skipDedup: true }
    );
    const project = createProject({ leadId: "dev-lead-brand", name: "LP Sorriso" });

    const kit = buildProjectDevKit(project.id);
    expect(kit.brandSnapshot?.palette[0].hex).toBe("#0F4C81");

    const prompt = buildProjectDevPrompt(project.id);
    expect(prompt).toContain("IDENTIDADE VISUAL DO LEAD");
    expect(prompt).toContain("#0F4C81");
    expect(prompt).toContain("acolhedor");
    expect(prompt).toContain("Identidade clara e acolhedora.");
  });

  it("registra o repositório e a pasta, marcando a etapa como 'em_desenvolvimento'", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "dev-lead-1", name: "LP Sorriso" });

    setProjectDevRepo(project.id, "https://github.com/garchel/lead-radar", "sites/dentista/clinica-sorriso");

    const updated = getProjectById(project.id)!;
    expect(updated.githubRepoUrl).toBe("https://github.com/garchel/lead-radar");
    expect(updated.repoOwner).toBe("garchel");
    expect(updated.repoName).toBe("lead-radar");
    expect(updated.sitePath).toBe("sites/dentista/clinica-sorriso");
    expect(updated.devStatus).toBe("em_desenvolvimento");
  });

  it("registra a entrega do código com pasta e preview e aguarda aprovação humana", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "dev-lead-1", name: "LP Sorriso" });

    submitProjectCode(project.id, {
      repoUrl: "https://github.com/garchel/lead-radar",
      sitePath: "sites/dentista/clinica-sorriso/",
      previewUrl: "https://garchel.github.io/lead-radar/",
      message: "Site pronto com todas as seções.",
    });

    const updated = getProjectById(project.id)!;
    expect(updated.devStatus).toBe("codigo_entregue");
    expect(updated.sitePath).toBe("sites/dentista/clinica-sorriso");
    expect(updated.previewUrl).toBe("https://garchel.github.io/lead-radar/");
    expect(updated.devMessage).toContain("Site pronto");

    const approved = approveProjectCode(project.id);
    expect(approved.devStatus).toBe("aprovado");
  });
});