import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLeadById, upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

const mocks = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };
  },
}));

vi.mock("../server/services/serpApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/services/serpApi")>();
  return {
    ...actual,
    searchSerpApiImages: vi.fn(),
    searchSerpApiWeb: vi.fn(),
  };
});

import { searchSerpApiImages, searchSerpApiWeb } from "../server/services/serpApi";
import {
  formatBrandSnapshotForPrompt,
  normalizeInstagramProfile,
  researchLeadBrand,
} from "../server/services/brandResearchService";

function makeLead(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const now = new Date().toISOString();
  return {
    id,
    name: "Clínica Sorriso",
    category: "Dentista",
    city: "São Paulo",
    state: "SP",
    phone: "5511999999999",
    websiteStatus: "none",
    pipelineStatus: "prospect",
    savedAt: now,
    updatedAt: now,
    ...overrides,
  } as StoredLead;
}

const images = [
  {
    title: "Logo Clínica Sorriso",
    imageUrl: "https://cdn.example.com/logo.png",
    thumbnailUrl: "https://cdn.example.com/logo-thumb.jpg",
    sourceUrl: "https://instagram.com/clinica-sorriso",
  },
  {
    title: "Fachada da Clínica Sorriso",
    imageUrl: "https://cdn.example.com/fachada.jpg",
    thumbnailUrl: "https://cdn.example.com/fachada-thumb.jpg",
    sourceUrl: "https://example.com/blog/clinica",
  },
];

const visionResponse = {
  palette: [
    { hex: "#abc", name: "Azul claro", role: "primary" },
    { hex: "#FFFFFF", name: "Branco", role: "background" },
    { hex: "invalida", name: "Ignorar", role: "accent" },
  ],
  tone: ["acolhedor", "limpo", "confiável"],
  typography: { display: "Sans-serif geométrica", body: "Sans-serif legível", notes: "Títulos em caixa alta" },
  logo: { imageIndex: 0, description: "Sorriso estilizado em azul", confidence: 0.82 },
  imagery: [
    { imageIndex: 1, description: "Fachada clara com plantas" },
    { imageIndex: 99, description: "Índice inválido deve ser ignorado" },
  ],
  summary: "Paleta clara e acolhedora, com azul de confiança e fotos luminosas.",
  confidence: 0.76,
  notes: "",
};

describe("brandResearch", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    mocks.generateContent.mockReset();
    vi.mocked(searchSerpApiImages).mockReset();
    vi.mocked(searchSerpApiWeb).mockReset();
    vi.mocked(searchSerpApiWeb).mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("pesquisa imagens, extrai a identidade visual e persiste no lead", async () => {
    const lead = makeLead("lead_brand_1");
    upsertLead(lead, { skipDedup: true });

    vi.mocked(searchSerpApiImages).mockResolvedValue(images);
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify(visionResponse) });

    const result = await researchLeadBrand(lead.id);

    expect(result.cached).toBe(false);
    expect(result.searchesUsed).toBe(1);
    expect(result.imagesAnalyzed).toBe(2);
    expect(searchSerpApiImages).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('"Clínica Sorriso"') })
    );

    const snapshot = result.snapshot;
    expect(snapshot.palette).toEqual([
      { hex: "#AABBCC", name: "Azul claro", role: "primary" },
      { hex: "#FFFFFF", name: "Branco", role: "background" },
    ]);
    expect(snapshot.tone).toEqual(["acolhedor", "limpo", "confiável"]);
    expect(snapshot.logo?.url).toBe(images[0].imageUrl);
    expect(snapshot.logo?.confidence).toBeCloseTo(0.82);
    expect(snapshot.imagery).toHaveLength(1);
    expect(snapshot.profiles.instagram).toBe("https://instagram.com/clinica-sorriso");
    expect(snapshot.confidence).toBeCloseTo(0.76);

    const stored = getLeadById(lead.id)!;
    expect(stored.brandSnapshot?.summary).toContain("Paleta clara");
    expect(stored.brandSnapshot?.createdAt).toBe(snapshot.createdAt);

    const call = mocks.generateContent.mock.calls[0][0];
    expect(call.contents[0].parts.filter((part: any) => part.inlineData)).toHaveLength(2);
  });

  it("reaproveita o snapshot salvo sem gastar cota", async () => {
    const lead = makeLead("lead_brand_2", {
      brandSnapshot: {
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        source: "serpapi",
        query: "Clínica Sorriso",
        profiles: {},
        palette: [{ hex: "#112233", role: "primary" }],
        tone: ["minimalista"],
        imagery: [],
        summary: "Snapshot antigo",
        confidence: 0.5,
      },
    });
    upsertLead(lead, { skipDedup: true });

    const result = await researchLeadBrand(lead.id);

    expect(result.cached).toBe(true);
    expect(result.snapshot.summary).toBe("Snapshot antigo");
    expect(result.searchesUsed).toBe(0);
    expect(searchSerpApiImages).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("falha quando nenhuma imagem pública é encontrada", async () => {
    const lead = makeLead("lead_brand_3");
    upsertLead(lead, { skipDedup: true });

    vi.mocked(searchSerpApiImages).mockResolvedValue([]);

    await expect(researchLeadBrand(lead.id)).rejects.toThrow(/não encontramos imagens públicas/i);
    expect(getLeadById(lead.id)!.brandSnapshot).toBeUndefined();
  });

  it("descarta imagens de outra empresa com nome parecido", async () => {
    const lead = makeLead("lead_brand_relevance", { name: "Achei Ferragens" });
    upsertLead(lead, { skipDedup: true });

    vi.mocked(searchSerpApiImages).mockResolvedValue([
      {
        title: "Real Ferragens - Sua Loja de Ferramentas",
        imageUrl: "https://cdn.example.com/real.png",
        thumbnailUrl: "https://cdn.example.com/real-thumb.jpg",
        sourceUrl: "https://instagram.com/p/real",
      },
      {
        title: "Achei Ferragens",
        imageUrl: "https://cdn.example.com/achei.png",
        thumbnailUrl: "https://cdn.example.com/achei-thumb.jpg",
        sourceUrl: "https://achei-ferragens.lojaintegrada.com.br/",
      },
    ]);
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify(visionResponse) });

    const result = await researchLeadBrand(lead.id);

    expect(result.imagesAnalyzed).toBe(1);
    expect(result.snapshot.logo?.url).toBe("https://cdn.example.com/achei.png");
  });

  it("descarta paleta/logo quando a IA não confirma que as imagens são do negócio", async () => {
    const lead = makeLead("lead_brand_5");
    upsertLead(lead, { skipDedup: true });

    vi.mocked(searchSerpApiImages).mockResolvedValue(images);
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({
        ...visionResponse,
        confidence: 0.05,
        notes: "As imagens são de outra empresa.",
      }),
    });

    const result = await researchLeadBrand(lead.id);

    expect(result.snapshot.palette).toEqual([]);
    expect(result.snapshot.tone).toEqual([]);
    expect(result.snapshot.logo).toBeUndefined();
    expect(result.snapshot.imagery).toEqual([]);
    expect(result.snapshot.summary).toContain("Não foi possível confirmar");
    expect(result.snapshot.notes).toContain("As imagens são de outra empresa.");
  });

  it("busca perfis no Google quando as imagens não apontam para Instagram/Facebook", async () => {
    const lead = makeLead("lead_brand_4");
    upsertLead(lead, { skipDedup: true });

    vi.mocked(searchSerpApiImages).mockResolvedValue([
      { title: "Foto 1 Clínica Sorriso", imageUrl: "https://cdn.example.com/foto1.jpg", thumbnailUrl: "https://cdn.example.com/foto1-thumb.jpg" },
      { title: "Foto 2 Clínica Sorriso", imageUrl: "https://cdn.example.com/foto2.jpg", thumbnailUrl: "https://cdn.example.com/foto2-thumb.jpg" },
    ]);
    vi.mocked(searchSerpApiWeb).mockResolvedValue([
      { title: "Perfil", link: "https://www.instagram.com/clinica.sorriso/" },
      { title: "Página", link: "https://facebook.com/clinicasorrisooficial" },
    ]);
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify(visionResponse) });

    const result = await researchLeadBrand(lead.id);

    expect(result.searchesUsed).toBe(2);
    expect(result.snapshot.profiles).toEqual({
      instagram: "https://instagram.com/clinica.sorriso",
      facebook: "https://facebook.com/clinicasorrisooficial",
    });
  });
});

describe("normalizeInstagramProfile", () => {
  it("aceita @handle, handle e URL", () => {
    expect(normalizeInstagramProfile("@clinica.sorriso")).toBe("https://instagram.com/clinica.sorriso");
    expect(normalizeInstagramProfile("clinica.sorriso")).toBe("https://instagram.com/clinica.sorriso");
    expect(normalizeInstagramProfile("https://www.instagram.com/clinica.sorriso/")).toBe(
      "https://instagram.com/clinica.sorriso"
    );
  });

  it("ignora links que não são de perfil", () => {
    expect(normalizeInstagramProfile("https://instagram.com/p/abc123")).toBeUndefined();
    expect(normalizeInstagramProfile("https://instagram.com/popular/achei-ferragens/")).toBeUndefined();
    expect(normalizeInstagramProfile("https://example.com/perfil")).toBeUndefined();
    expect(normalizeInstagramProfile("")).toBeUndefined();
  });
});

describe("formatBrandSnapshotForPrompt", () => {
  it("resume paleta, tom, logo e resumo para o prompt de design", () => {
    const text = formatBrandSnapshotForPrompt({
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "serpapi",
      query: "Clínica Sorriso",
      profiles: { instagram: "https://instagram.com/clinica.sorriso" },
      palette: [{ hex: "#0F4C81", name: "Azul", role: "primary" }],
      tone: ["acolhedor"],
      typography: { display: "Sans-serif" },
      logo: { description: "Sorriso estilizado", confidence: 0.8 },
      imagery: [],
      summary: "Identidade clara e acolhedora.",
      confidence: 0.8,
    });

    expect(text).toContain("#0F4C81 (primary) Azul");
    expect(text).toContain("Tom visual: acolhedor");
    expect(text).toContain("Logo: Sorriso estilizado");
    expect(text).toContain("Identidade clara e acolhedora.");
    expect(text).toContain("sem copiar textos ou imagens de terceiros");
  });

  it("devolve string vazia sem snapshot", () => {
    expect(formatBrandSnapshotForPrompt(undefined)).toBe("");
  });
});
