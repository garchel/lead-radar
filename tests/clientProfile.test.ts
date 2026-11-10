import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { getLeadById, upsertLead } from "../server/store/db";
import type { ClientProfile, StoredLead } from "../server/store/types";

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  searchWeb: vi.fn(),
  researchBrand: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };
  },
}));

vi.mock("../server/services/serpApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/services/serpApi")>();
  return { ...actual, searchSerpApiWeb: mocks.searchWeb };
});

vi.mock("../server/services/brandResearchService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/services/brandResearchService")>();
  return { ...actual, researchLeadBrand: mocks.researchBrand };
});

import {
  buildClientProfile,
  formatClientProfileForPrompt,
  htmlToText,
  isRelevantSearchResult,
  renderClientProfileMarkdown,
  slugifyClient,
} from "../server/services/clientProfileService";

const lead = {
  id: "profile-1",
  name: "Clínica Sorriso",
  category: "Dentista",
  address: "Rua das Flores, 123",
  city: "São Paulo",
  state: "SP",
  phone: "11 98765-4321",
  instagramHandle: "clinicaclinicasorriso",
  pipelineStatus: "negotiating",
  rating: 4.9,
  reviewsCount: 231,
  savedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as StoredLead;

const geminiPayload = {
  identity: { name: "Clínica Sorriso", category: "Odontologia", city: "São Paulo", state: "SP", instagram: "clinicaclinicasorriso" },
  professional: { name: "Dra. Ana Souza", council: "CRO", number: "12345", state: "SP", source: "bio do Instagram no Google" },
  experience: { since: "2012", years: 14, education: ["Odontologia — USP"], certifications: ["Implantodontia"] },
  services: ["Implantes", "Clareamento", "Ortodontia"],
  hours: "seg–sex 8h–18h",
  insurancePlans: ["OdontoPrev"],
  differentials: ["Atendimento sem fila"],
  socialProof: { rating: 4.9, reviewsCount: 231, quotes: ["Melhor clínica que já fui"] },
  summary: "Clínica odontológica em São Paulo desde 2012, focada em implantes.",
  gaps: [],
  confidence: 0.8,
};

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key"; // a ficha exige Gemini; o SDK está mockado
  mocks.generateContent.mockReset();
  mocks.searchWeb.mockReset();
  mocks.researchBrand.mockReset();

  upsertLead(lead, { skipDedup: true });
  mocks.searchWeb.mockResolvedValue([
    {
      title: "Clínica Sorriso (@clinicaclinicasorriso) • Instagram",
      link: "https://instagram.com/clinicaclinicasorriso",
      snippet: "Odontologia em SP | CRO-SP 12345 | Dra. Ana Souza | Desde 2012",
    },
  ]);
  mocks.researchBrand.mockResolvedValue({
    lead,
    cached: false,
    searchesUsed: 1,
    imagesAnalyzed: 3,
    snapshot: {
      version: 1,
      createdAt: new Date().toISOString(),
      source: "serpapi",
      query: "Clínica Sorriso",
      profiles: { instagram: "https://instagram.com/clinicaclinicasorriso" },
      palette: [{ hex: "#0EA5E9", role: "primary", name: "azul" }],
      tone: ["acolhedor", "limpo"],
      imagery: [],
      summary: "Visual claro, azul e branco.",
      confidence: 0.7,
    },
  });
  mocks.generateContent.mockResolvedValue({ text: JSON.stringify(geminiPayload) });
});

describe("utilidades da ficha", () => {
  it("slug sem acento a partir de nome + cidade", () => {
    expect(slugifyClient("Clínica São João", "São Paulo")).toBe("clinica-sao-joao-sao-paulo");
  });

  it("htmlToText tira script/style/tags e decodifica entidades", () => {
    const html = `<html><head><style>.a{color:red}</style><script>alert(1)</script></head>
      <body><h1>Cl&iacute;nica</h1><p>CRM-SP&nbsp;12345 &amp; cia</p></body></html>`;
    const text = htmlToText(html);
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).toContain("CRM-SP");
    expect(text).toContain("& cia".replace("&", "&"));
  });

  it("descarta resultado do Google que não fala do negócio (ex.: time de futebol)", () => {
    const junk = {
      title: "Goiás Esporte Clube | Oficial (@goiasoficial)",
      link: "https://instagram.com/goiasoficial",
      snippet: "Goiânia, GO",
    };
    const good = {
      title: "Frete e Mudança em Valparaíso de Goiás",
      link: "https://esplanadamudancas.com.br/frete-e-mudanca-valparaiso/",
      snippet: "Transportadora de mudanças em Valparaíso de Goiás",
    };
    const name = "Transportadora de mudanças Valparaiso de Goias";
    expect(isRelevantSearchResult(junk, name)).toBe(false);
    expect(isRelevantSearchResult(good, name)).toBe(true);
  });

  it("markdown traz as seções e marca o que não foi encontrado", () => {
    const profile: ClientProfile = {
      version: 1,
      createdAt: new Date().toISOString(),
      leadId: "x",
      identity: { name: "Empresa X", city: "Campinas", state: "SP" },
      summary: "Resumo",
      gaps: ["CRM não publicado"],
      sources: [{ url: "https://exemplo.com", kind: "google" }],
      confidence: 0.4,
    };
    const md = renderClientProfileMarkdown(profile);
    expect(md).toContain("# Empresa X — ficha do cliente");
    expect(md).toContain("## Identificação");
    expect(md).toContain("## Responsável técnico");
    expect(md).toContain("_não encontrado_");
    expect(md).toContain("CRM não publicado");
    expect(md).toContain("https://exemplo.com");
  });
});

describe("buildClientProfile", () => {
  it("monta a ficha a partir do Google (bio), extrai CRM e grava o .md", async () => {
    const result = await buildClientProfile(lead.id);

    expect(result.cached).toBe(false);
    expect(result.searchesUsed).toBeGreaterThan(0);

    const profile = result.profile;
    expect(profile.professional).toMatchObject({ council: "CRO", number: "12345", state: "SP" });
    expect(profile.services).toContain("Implantes");
    expect(profile.experience?.years).toBe(14);
    expect(profile.brand?.palette[0].hex).toBe("#0EA5E9");
    expect(profile.files?.markdown).toContain("clientes/");
    expect(profile.confidence).toBeGreaterThan(0.3);

    // arquivo realmente escrito no DATA_DIR do teste
    const filePath = result.markdownPath;
    expect(fs.existsSync(filePath)).toBe(true);
    const md = fs.readFileSync(filePath, "utf8");
    expect(md).toContain("CRO 12345 SP");
    expect(md).toContain("Implantes");

    // ficha salva no lead
    const stored = getLeadById(lead.id)!;
    expect(stored.clientProfile?.professional?.number).toBe("12345");
  });

  it("devolve a ficha salva sem gastar cota na segunda chamada", async () => {
    await buildClientProfile(lead.id);
    const searchesAfterFirst = mocks.searchWeb.mock.calls.length;
    mocks.searchWeb.mockClear();

    const second = await buildClientProfile(lead.id);
    expect(second.cached).toBe(true);
    expect(second.searchesUsed).toBe(0);
    expect(mocks.searchWeb.mock.calls.length).toBe(0);
    expect(searchesAfterFirst).toBeGreaterThan(0);
  });

  it("sem fontes públicas ainda gera ficha com lacunas (não inventa)", async () => {
    mocks.searchWeb.mockResolvedValue([]);
    mocks.researchBrand.mockRejectedValue(new Error("sem imagens"));
    mocks.generateContent.mockReset();

    const result = await buildClientProfile("profile-1", { force: true });

    expect(mocks.generateContent).not.toHaveBeenCalled(); // sem corpus, não chama IA
    expect(result.profile.professional).toBeUndefined();
    expect(result.profile.gaps.join(" ")).toContain("conselho");
    expect(result.profile.gaps.join(" ")).toContain("experiência");
    expect(result.profile.confidence).toBeLessThan(0.6);
    // o Markdown aponta o caminho relativo do arquivo gerado
    expect(result.profile.files?.markdown).toBe(
      path.relative(process.cwd(), result.markdownPath).split(path.sep).join("/")
    );
  });
});

describe("formatClientProfileForPrompt", () => {
  it("leva fatos confirmados e a ordem de não inventar as lacunas", async () => {
    const { profile } = await buildClientProfile(lead.id);
    const prompt = formatClientProfileForPrompt(profile);

    expect(prompt).toContain("CRO 12345 SP");
    expect(prompt).toContain("Serviços/tratamentos: Implantes");
    expect(prompt).toContain("Experiência: desde 2012");
    expect(prompt).toContain("Depoimento citável");
    expect(formatClientProfileForPrompt(undefined)).toBe("");
  });
});
