import { describe, expect, it } from "vitest";
import { classifyImage, pickPreviewImages } from "../server/services/brandImagery";
import { colorName, paletteForLead, paletteMessageText, swatchFor } from "../server/services/paletteService";
import { monogramOf, monogramSvg, wordmarkSvg } from "../server/services/logoSvg";
import { paletteCardSvg } from "../server/services/paletteCard";
import { fontStylesheetUrl, pickFontPair } from "../server/services/fontPairs";
import { buildPreviewHtml } from "../server/services/previewService";
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

describe("tipografia da prévia", () => {
  it("tom sofisticado puxa serifa de contraste", () => {
    const par = pickFontPair({ tone: ["sofisticado", "acolhedor"], nicho: "odontologia" });
    expect(par.display).toBe("Playfair Display");
    expect(par.body).toBe("Inter");
  });

  it("tom acolhedor puxa serifa suave", () => {
    expect(pickFontPair({ tone: ["acolhedor"], nicho: "pet" }).display).toBe("Lora");
  });

  it("clean puxa geométrica", () => {
    expect(pickFontPair({ tone: ["clean", "moderno"], nicho: "arquitetura" }).display).toBe("Space Grotesk");
  });

  it("sem tom, o nicho decide; sem nada, par neutro", () => {
    expect(pickFontPair({ nicho: "clínica odontológica" }).display).toBe("Lora");
    expect(pickFontPair({}).display).toBe("Manrope");
  });

  it("tipografia declarada na marca manda no par", () => {
    const par = pickFontPair({ tone: ["clean"], typography: { display: "DM Serif Display", body: "Work Sans" } });
    expect(par.display).toBe("DM Serif Display");
    expect(par.body).toBe("Work Sans");
    expect(par.reason).toContain("declarada");
  });

  it("recusa nome estranho (evita injeção no link de fonte)", () => {
    const par = pickFontPair({ typography: { display: 'X"><script>', body: "Inter" } as any });
    expect(par.display).not.toContain("script");
  });

  it("descrição em português não é nome de fonte — cai no par do tom", () => {
    // a pesquisa de marca devolve "Serifada elegante", "Sans-serif leve e moderna"
    const par = pickFontPair({
      tone: ["sofisticado"],
      typography: { display: "Serifada elegante", body: "Sans-serif leve e moderna" },
    });
    expect(par.display).toBe("Playfair Display");
    expect(par.body).toBe("Inter");
    expect(par.reason).toContain("tom");
  });

  it("URL leva só os pesos usados e display=swap", () => {
    const url = fontStylesheetUrl({ display: "Playfair Display", body: "Inter", reason: "" });
    expect(url).toContain("Playfair+Display:wght@500;600;700");
    expect(url).toContain("Inter:wght@400;500;600");
    expect(url).toContain("display=swap");
  });

  it("página carrega a fonte e mantém fallback", () => {
    const lead = leadCom([]);
    lead.brandSnapshot!.tone = ["sofisticado"];
    const html = buildPreviewHtml(lead);
    expect(html).toContain("fonts.googleapis.com");
    expect(html).toContain("preconnect");
    expect(html).toContain("--font-display:");
    expect(html).toContain("ui-serif");
  });
});

describe("movimento na prévia", () => {
  it("anima a primeira dobra sem JavaScript", () => {
    const html = buildPreviewHtml(leadCom([]));
    expect(html).toContain("@keyframes subir");
    expect(html).toContain("@keyframes aparecer");
    expect(html).toMatch(/\.hero h1\{animation:subir/);
    expect(html).not.toMatch(/<script/i);
  });

  it("nenhuma seção pode começar invisível (animação que esconde é pior que nada)", () => {
    const html = buildPreviewHtml(leadCom([]));
    // regra de scroll-reveal escondia a seção ao entrar na tela: foi descartada
    expect(html).not.toContain("animation-timeline:view()");
    expect(html).not.toMatch(/\.servico\{[^}]*opacity:0/);
    expect(html).not.toMatch(/\.blk-head\{[^}]*opacity:0/);
  });

  it("imprimir em PDF não perde conteúdo animado", () => {
    expect(buildPreviewHtml(leadCom([]))).toContain("@media print");
  });

  it("respeita quem prefere menos movimento", () => {
    expect(buildPreviewHtml(leadCom([]))).toContain("prefers-reduced-motion:reduce");
  });
});

describe("cartão da paleta", () => {
  const cartao = () => paletteCardSvg(
    [
      { hex: "#E5D399", name: "dourado", swatch: "🟡" },
      { hex: "#FFFFFF", name: "branco", swatch: "⚪" },
      { hex: "#2F2F2F", name: "grafite", swatch: "⚫" },
    ],
    { accent: "#E5D399", onAccent: "#20170a", businessName: "Dra. Carmen Pitol", category: "Clínica odontológica", city: "Balneário Camboriú" }
  );

  it("mostra as três cores com nome e hex, e a assinatura da Vértice", () => {
    const svg = cartao();
    expect(svg).toContain("#E5D399");
    expect(svg).toContain("#2F2F2F");
    expect(svg).toMatch(/Dourado/);
    expect(svg).toMatch(/Grafite/);
    expect(svg).toContain("Vértice Páginas Web");
    expect(svg).toContain("Dra. Carmen Pitol");
  });

  it("não repete atributo fill (SVG inválido quebra a rasterização)", () => {
    for (const tag of cartao().match(/<text[^>]*>/g) || []) {
      expect((tag.match(/fill=/g) || []).length).toBeLessThanOrEqual(1);
    }
  });

  it("texto sobre dourado claro usa tinta escura", () => {
    const svg = cartao();
    const linhaDourado = svg.split("\n").find((l) => l.includes("#E5D399") && l.includes("<text")) || "";
    expect(linhaDourado).toContain("#141414");
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
