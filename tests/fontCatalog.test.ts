import { describe, expect, it } from "vitest";
import { CATALOGO, findFont, suggestDisplays, suggestPairs } from "../server/services/fontCatalog";
import { pickFontPair } from "../server/services/fontPairs";

describe("catálogo de fontes", () => {
  it("tem repertório suficiente para não repetir sempre o mesmo par", () => {
    expect(CATALOGO.length).toBeGreaterThanOrEqual(50);
    const nomes = new Set(CATALOGO.map((f) => f.name));
    expect(nomes.size).toBe(CATALOGO.length); // sem duplicata
    for (const fonte of CATALOGO) {
      expect(fonte.category).toMatch(/serif|sans|display|mono|slab/);
      expect(fonte.tags.length).toBeGreaterThanOrEqual(2);
    }
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
    expect(sugestoes[0].reason).toContain("contraste");
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

  it("sugestões vêm ordenadas por nota e dentro da faixa", () => {
    const sugestoes = suggestPairs("Lora", 5);
    const notas = sugestoes.map((s) => s.score);
    expect([...notas].sort((a, b) => b - a)).toEqual(notas);
    expect(notas.every((n) => n >= 40 && n <= 100)).toBe(true);
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
