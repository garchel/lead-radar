import { describe, expect, it } from "vitest";
import { classifyImage, pickPreviewImages } from "../server/services/brandImagery";
import { colorName, paletteForLead, paletteMessageText, swatchFor } from "../server/services/paletteService";
import { monogramOf, monogramSvg, wordmarkSvg } from "../server/services/logoSvg";
import type { StoredLead } from "../server/store/types";

function leadCom(imagery: Array<{ url: string; description?: string }>, palette: string[] = []): StoredLead {
  return {
    id: "lead-teste",
    name: "Dra. Carmen Pitol",
    phone: "+5561999999999",
    pipelineStatus: "new",
    brandSnapshot: {
      version: 1,
      createdAt: new Date().toISOString(),
      source: "serpapi",
      query: "carmen pitol",
      profiles: {},
      palette: palette.map((hex) => ({ hex })),
      tone: [],
      imagery,
      summary: "",
      confidence: 0.8,
    },
  } as unknown as StoredLead;
}

describe("classificação das imagens", () => {
  it("reconhece fachada pelo que a pesquisa descreveu", () => {
    expect(classifyImage("https://x/1.jpg", "Fachada com iluminação quente e fundo neutro")).toBe("fachada");
    expect(classifyImage("https://x/2.jpg", "Letreiro da loja na calçada")).toBe("fachada");
  });

  it("reconhece retrato, interior e produto", () => {
    expect(classifyImage("https://x/3.jpg", "Retrato profissional com iluminação suave")).toBe("retrato");
    expect(classifyImage("https://x/4.jpg", "Recepção da clínica com poltrona")).toBe("interior");
    expect(classifyImage("https://x/5.jpg", "Antes e depois de lentes")).toBe("produto");
  });

  it("sem descrição, cai em genérico (nunca finge saber o que é)", () => {
    expect(classifyImage("https://x/6.jpg", "")).toBe("generico");
  });

  it("a FACHADA não vira hero: retrato vence, e a fachada vai para localização", () => {
    const lead = leadCom([
      { url: "https://x/fachada.jpg", description: "Fachada com iluminação quente e fundo neutro" },
      { url: "https://x/retrato.jpg", description: "Retrato profissional com iluminação suave" },
      { url: "https://x/sala.jpg", description: "Interior do consultório" },
    ]);
    const escolha = pickPreviewImages(lead.brandSnapshot);
    expect(escolha.hero?.url).toBe("https://x/retrato.jpg");
    expect(escolha.facade?.url).toBe("https://x/fachada.jpg");
    expect(escolha.gallery.map((i) => i.url)).toContain("https://x/sala.jpg");
    expect(escolha.gallery.map((i) => i.url)).not.toContain("https://x/fachada.jpg");
  });

  it("só com fachada disponível, o hero fica sem foto em vez de usar a fachada", () => {
    const lead = leadCom([{ url: "https://x/fachada.jpg", description: "Fachada da loja" }]);
    const escolha = pickPreviewImages(lead.brandSnapshot);
    expect(escolha.hero).toBeNull();
    expect(escolha.facade?.url).toBe("https://x/fachada.jpg");
  });

  it("aceita a cópia local feita pelo cache de imagens", () => {
    const lead = leadCom([
      { url: "assets/abc123.jpg", description: "Retrato profissional" },
      { url: "assets/def456.jpg", description: "Fachada da loja" },
    ]);
    const escolha = pickPreviewImages(lead.brandSnapshot);
    expect(escolha.hero?.url).toBe("assets/abc123.jpg");
    expect(escolha.facade?.url).toBe("assets/def456.jpg");
  });

  it("imagem que não baixa sai do snapshot (melhor sem seção que com imagem quebrada)", async () => {
    const { cacheSnapshotImages } = await import("../server/services/imageCacheService");
    const snapshot = leadCom([
      { url: "http://127.0.0.1:1/nao-existe.jpg", description: "Retrato" },
    ]).brandSnapshot!;
    const depois = await cacheSnapshotImages(snapshot);
    expect(depois?.imagery).toHaveLength(0);
  });
});

describe("paleta", () => {
  it("dá nome em português para as cores", () => {
    expect(colorName("#E5D399")).toBe("dourado");
    expect(colorName("#FFFFFF")).toBe("branco");
    expect(colorName("#2F2F2F")).toBe("grafite");
    expect(colorName("#0b6b3a")).toBe("verde");
    expect(colorName("#1414FF")).toBe("azul");
  });

  it("quadrado do WhatsApp acompanha a matiz", () => {
    expect(swatchFor("#E5D399")).toBe("🟡");
    expect(swatchFor("#FFFFFF")).toBe("⚪");
    expect(swatchFor("#2F2F2F")).toBe("⚫");
  });

  it("remove cor repetida e limita a 4", () => {
    const lead = leadCom([], ["#E5D399", "#e5d399", "#FFFFFF", "#2F2F2F", "#000000", "#123456"]);
    const paleta = paletteForLead(lead);
    expect(paleta).toHaveLength(4);
    expect(paleta[0].hex).toBe("#E5D399");
  });

  it("mensagem fala de paleta, promete a prévia e pergunta a opinião", () => {
    const lead = leadCom([], ["#E5D399", "#2F2F2F"]);
    const texto = paletteMessageText(lead, paletteForLead(lead));
    expect(texto).toContain("Ainda estamos trabalhando na prévia");
    expect(texto).toMatch(/dourado/i);
    expect(texto).toContain("#E5D399");
    expect(texto).toMatch(/O que acha\?/);
    expect(texto).not.toContain("—");
    expect(texto).not.toMatch(/R\$/);
  });
});

describe("logo em SVG", () => {
  it("tira as iniciais ignorando título (Dra.)", () => {
    expect(monogramOf("Dra. Carmen Pitol")).toBe("CP");
    expect(monogramOf("Quintal dos Sonhos")).toBe("QS");
  });

  it("monograma é SVG com a cor da marca e sem dependência externa", () => {
    const svg = monogramSvg("Dra. Carmen Pitol", { accent: "#857a59", onAccent: "#ffffff" });
    expect(svg).toContain("<svg");
    expect(svg).toContain('fill="#857a59"');
    expect(svg).toContain(">CP<");
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("href");
  });

  it("wordmark leva nome e categoria", () => {
    const svg = wordmarkSvg("Dra. Carmen Pitol", "Clínica odontológica", { accent: "#857a59", onAccent: "#fff" });
    expect(svg).toContain("Dra. Carmen Pitol");
    expect(svg).toContain("CLÍNICA ODONTOLÓGICA");
  });
});
