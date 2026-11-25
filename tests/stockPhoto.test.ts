import { describe, expect, it } from "vitest";
import { inserirFotos, termoDeBusca } from "../server/services/stockPhotoService";

/**
 * Foto de banco LICENCIADO (decisão do dono). O que entra é faixa depois do
 * herói, com crédito e aviso de ilustrativa — nunca foto raspada de site alheio.
 */

const pagina = `<body><header><h1>Ótica no Centro</h1></header>
<section><h2>Serviços</h2><p>texto</p></section><section><h2>Como funciona</h2></section><section><h2>Fim</h2></section></body>`;

const arquivos = [
  { arquivo: "oticas-popular-foto-1.jpg", largura: 1200, altura: 900, foto: { url: "x", autor: "Fulana", licenca: "CC0", origem: "Openverse" } },
];

describe("termo de busca por nicho", () => {
  it("ótica busca armações, não clínica", () => {
    expect(termoDeBusca("Ótica")).toContain("eyeglasses");
  });

  it("barbearia busca interior de barbearia", () => {
    expect(termoDeBusca("Barbearia")).toContain("barbershop");
  });

  it("categoria desconhecida cai em comércio local", () => {
    expect(termoDeBusca("Zzz")).toContain("storefront");
  });
});

describe("inserção da foto", () => {
  it("entra depois do título e nunca no herói", () => {
    const { html } = inserirFotos(pagina, arquivos as any, "Foto ilustrativa de ótica");
    expect(html.indexOf('class="fx-foto')).toBeGreaterThan(html.indexOf("</h1>"));
    expect(html.indexOf('class="fx-foto')).toBeLessThan(html.indexOf("<h2>Fim"));
  });

  it("entra logo depois do herói, como faixa baixa", () => {
    const { html } = inserirFotos(pagina, arquivos as any, "x");
    // Herói = primeira <section>; a foto vem em seguida, antes do 2º bloco.
    expect(html.indexOf('class="fx-foto')).toBeGreaterThan(html.indexOf("<h2>Serviços"));
    expect(html.indexOf('class="fx-foto')).toBeLessThan(html.indexOf("<h2>Como funciona"));
  });

  it("usa no máximo uma foto para não virar muralha no celular", () => {
    const duas = [arquivos[0], { ...arquivos[0], arquivo: "segunda.jpg" }];
    const { html } = inserirFotos(pagina, duas as any, "x");
    expect((html.match(/class="fx-foto/g) || []).length).toBe(1);
  });

  it("leva crédito e aviso de ilustrativa", () => {
    const { html } = inserirFotos(pagina, arquivos as any, "Foto ilustrativa");
    expect(html).toContain("Imagem ilustrativa");
    expect(html).toContain("Fulana");
    expect(html).toContain("CC0");
  });

  it("imagem tem dimensões declaradas e carregamento preguiçoso", () => {
    const { html } = inserirFotos(pagina, arquivos as any, "x");
    expect(html).toContain('width="1200"');
    expect(html).toContain('loading="lazy"');
  });

  it("não injeta duas vezes", () => {
    const primeira = inserirFotos(pagina, arquivos as any, "x").html;
    expect(inserirFotos(primeira, arquivos as any, "x").html).toBe(primeira);
  });

  it("sem fotos, a página fica intacta", () => {
    expect(inserirFotos(pagina, [], "x").html).toBe(pagina);
  });
});
