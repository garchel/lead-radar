import { describe, expect, it } from "vitest";
import {
  CATALOGO,
  PARES_CONSAGRADOS,
  bodyFonts,
  curatedPairs,
  findFont,
  suggestDisplays,
  suggestPairs,
  titleFonts,
} from "../server/services/fontCatalog";
import { pickFontPair } from "../server/services/fontPairs";

describe("catálogo de fontes", () => {
  it("é uma seleção curada: nem pouca variedade, nem catálogo gigante", () => {
    // curado de propósito: lista inteira do Google Fonts (1.500) gera par ruim
    expect(CATALOGO.length).toBeGreaterThanOrEqual(40);
    expect(CATALOGO.length).toBeLessThanOrEqual(80);
    const nomes = new Set(CATALOGO.map((f) => f.name));
    expect(nomes.size).toBe(CATALOGO.length); // sem duplicata
    for (const fonte of CATALOGO) {
      expect(fonte.category).toMatch(/serif|sans|display|mono|slab/);
      expect(fonte.role).toMatch(/titulo|texto|ambos/);
      expect(fonte.tags.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("só oferece fonte de título no seletor de título (e vice-versa)", () => {
    expect(titleFonts().every((f) => f.role !== "texto")).toBe(true);
    expect(bodyFonts().every((f) => f.role !== "titulo")).toBe(true);
    // toda fonte de texto serve para algum par
    expect(bodyFonts().length).toBeGreaterThan(10);
  });

  it("acha por nome sem diferenciar maiúsculas", () => {
    expect(findFont("playfair display")?.category).toBe("serif");
    expect(findFont("NÃO EXISTE")).toBeUndefined();
  });
});

describe("sugestão de par", () => {
  it("título com serifa recebe texto sem serifa como melhor opção", () => {
    const sugestoes = suggestPairs("Playfair Display");
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(findFont(sugestoes[0].body)?.category).toBe("sans");
    expect(sugestoes[0].reason).toMatch(/contraste|consagrado/);
  });

  it("título geométrico recebe texto neutro", () => {
    const sugestoes = suggestPairs("Poppins");
    expect(sugestoes[0].body).not.toBe("Poppins");
    expect(sugestoes.some((s) => /neutro|discreto/.test(s.reason))).toBe(true);
  });

  it("nunca sugere a própria fonte", () => {
    for (const fonte of CATALOGO.slice(0, 12)) {
      const sugestoes = suggestPairs(fonte.name);
      expect(sugestoes.every((s) => s.body !== fonte.name)).toBe(true);
    }
  });

  it("não empilha duas fontes expressivas", () => {
    const sugestoes = suggestPairs("Syne"); // display expressivo
    const corpos = sugestoes.map((s) => findFont(s.body)!);
    expect(corpos.every((c) => !c.tags.includes("expressivo"))).toBe(true);
  });

  it("fonte fora do catálogo devolve lista vazia (não inventa par)", () => {
    expect(suggestPairs("Fonte Inventada XYZ")).toEqual([]);
  });

  it("caminho inverso: partindo do texto, sugere títulos", () => {
    const sugestoes = suggestDisplays("Inter");
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(sugestoes.every((s) => s.body === "Inter")).toBe(true);
  });

  it("consagrados vêm antes e as notas ficam na faixa", () => {
    const sugestoes = suggestPairs("Lora", 5);
    const primeiroNaoConsagrado = sugestoes.findIndex((s) => !s.curated);
    const ultimoConsagrado = sugestoes.map((s) => Boolean(s.curated)).lastIndexOf(true);
    if (primeiroNaoConsagrado >= 0 && ultimoConsagrado >= 0) {
      expect(ultimoConsagrado).toBeLessThan(primeiroNaoConsagrado);
    }
    // dentro de cada grupo a nota é decrescente
    const consagrados = sugestoes.filter((s) => s.curated).map((s) => s.score);
    expect([...consagrados].sort((a, b) => b - a)).toEqual(consagrados);
    expect(sugestoes.every((s) => s.score >= 40 && s.score <= 100)).toBe(true);
  });
});

describe("pares consagrados", () => {
  it("todos existem no catálogo (nada de par fantasma)", () => {
    for (const [display, body] of PARES_CONSAGRADOS) {
      expect(findFont(display), `título ${display}`).toBeDefined();
      expect(findFont(body), `texto ${body}`).toBeDefined();
    }
  });

  it("toda fonte feita para título tem par consagrado", () => {
    const titulosSemPar = CATALOGO.filter((f) => f.role === "titulo")
      .map((f) => f.name)
      .filter((nome) => !PARES_CONSAGRADOS.some(([d]) => d === nome));
    expect(titulosSemPar).toEqual([]);
  });

  it("o par consagrado aparece primeiro, com selo", () => {
    const sugestoes = suggestPairs("Playfair Display");
    expect(sugestoes[0].curated).toBe(true);
    expect(sugestoes[0].body).toBe("Inter");
    expect(sugestoes[0].reason).toContain("consagrado");
  });

  it("não repete par", () => {
    const chaves = PARES_CONSAGRADOS.map(([d, b]) => `${d}|${b}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("lista pronta devolve só pares válidos", () => {
    const prontos = curatedPairs();
    expect(prontos.length).toBe(PARES_CONSAGRADOS.length);
    expect(prontos.every((p) => findFont(p.display) && findFont(p.body))).toBe(true);
  });
});

describe("escolha do painel manda sobre o tom", () => {
  it("par escolhido no projeto vence o tom da marca", () => {
    const par = pickFontPair({
      tone: ["sofisticado"],
      escolhido: { display: "Bricolage Grotesque", body: "DM Sans" },
    });
    expect(par.display).toBe("Bricolage Grotesque");
    expect(par.body).toBe("DM Sans");
    expect(par.reason).toContain("painel");
  });

  it("escolha inválida é ignorada e o tom decide", () => {
    const par = pickFontPair({ tone: ["sofisticado"], escolhido: { display: "Serifada elegante", body: "Qualquer" } });
    expect(par.display).toBe("Playfair Display");
  });

  it("escolha pela metade (só o título) não quebra: cai no automático", () => {
    const par = pickFontPair({ tone: ["clean"], escolhido: { display: "Sora" } });
    expect(par.display).toBe("Space Grotesk");
  });
});
