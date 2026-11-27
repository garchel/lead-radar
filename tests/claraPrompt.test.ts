import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * O prompt da Clara é a peça mais fácil de estragar sem ninguém notar: alguém "limpa"
 * uma seção, o tom muda, a regra some. Estes testes travam o que foi decidido com o
 * Paulo e o que a literatura sustenta. Não testam redação, testam presença.
 */
const prompt = fs.readFileSync(path.resolve("server", "prompts", "clara.md"), "utf8");

describe("prompt da Clara", () => {
  it("mantém as regras de voz (sem travessão, sem markdown)", () => {
    expect(prompt).toMatch(/travess[aã]o/i);
    expect(prompt).toMatch(/markdown/i);
  });

  it("mantém a ordem do funil e a etapa calculada", () => {
    expect(prompt).toMatch(/ordem do funil/i);
    expect(prompt).toMatch(/etapa\.numero|ETAPA DO FUNIL|etapa vem CALCULADA/i);
    expect(prompt).toMatch(/produ[cç][aã]o/i);
  });

  it("mantém a memória e o aviso automático", () => {
    expect(prompt).toMatch(/hist[óo]rico/i);
    expect(prompt).toMatch(/aviso autom[áa]tico/i);
    expect(prompt).toMatch(/elogio n[ãa]o [ée] pedido/i);
  });

  it("mantém o formato de lista com cartão de oferta", () => {
    expect(prompt).toMatch(/Formato da lista/i);
    expect(prompt).toMatch(/api\/agent\/oferta/);
    expect(prompt).toMatch(/•/);
  });

  it("explicita os princípios de persuasão que podem ser usados", () => {
    for (const principio of [/Escaneabilidade/i, /Chunking/i, /Lei de Hick/i, /Ancoragem/i, /Prova social/i, /Reciprocidade/i]) {
      expect(prompt, String(principio)).toMatch(principio);
    }
  });

  it("proíbe as técnicas de persuasão desonestas", () => {
    expect(prompt).toMatch(/urg[êe]ncia falsa/i);
    expect(prompt).toMatch(/escassez inventada/i);
    expect(prompt).toMatch(/inventar depoimento/i);
    expect(prompt).toMatch(/prometer posi[cç][ãa]o no Google/i);
  });

  it("proíbe dizer que é IA e exige o nome Vértice", () => {
    expect(prompt).toMatch(/V[ée]rtice/i);
    expect(prompt).toMatch(/rob[ôo]|IA/i);
  });
});
