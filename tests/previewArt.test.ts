import { describe, expect, it } from "vitest";
import { arteDoLead, enfeitarPagina, varianteDeArte } from "../server/services/previewArt";

/**
 * O dono reclamou que a prévia saía "crua: só blocos e texto". A arte abstrata
 * entra por código, com a paleta do cliente, para não depender do modelo.
 */

const pagina = `<body><header><h1>Clínica no Centro</h1><p>texto</p></header>
<section><h2>Serviços</h2><p>texto</p></section></body>`;

describe("arte do lead", () => {
  it("é determinística: mesma empresa, mesma variante", () => {
    expect(varianteDeArte("lead_1")).toBe(varianteDeArte("lead_1"));
  });

  it("espalha as variantes entre leads diferentes", () => {
    const variantes = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(varianteDeArte));
    expect(variantes.size).toBeGreaterThanOrEqual(3);
  });

  it("usa a cor da marca quando ela é válida", () => {
    const { html } = arteDoLead({ id: "x", name: "Teste" }, ["#ff0055"]);
    expect(html).toMatch(/227,0,85|255,0,85|ff0055/i);
  });

  it("não quebra quando a paleta vem vazia ou inválida", () => {
    const { html } = arteDoLead({ id: "y", name: "Teste" }, ["roxo", ""]);
    expect(html).toContain("<svg");
  });
});

describe("enfeitar página", () => {
  it("insere a arte dentro do herói, antes do título", () => {
    const { html, features } = enfeitarPagina(pagina, { id: "lead_x", name: "Clínica X" }, ["#123456"]);
    expect(html.indexOf('class="fx-arte')).toBeGreaterThan(html.indexOf("<header"));
    expect(html.indexOf('class="fx-arte')).toBeLessThan(html.indexOf("<h1"));
    expect(features[0]).toContain("arte");
  });

  it("marca o herói como host para a arte ficar atrás do conteúdo", () => {
    const { html } = enfeitarPagina(pagina, { id: "lead_x", name: "Clínica X" }, ["#123456"]);
    expect(html).toContain('data-fx-host="1"');
  });

  it("não injeta duas vezes", () => {
    const primeira = enfeitarPagina(pagina, { id: "lead_x", name: "X" }, ["#123456"]).html;
    const segunda = enfeitarPagina(primeira, { id: "lead_x", name: "X" }, ["#123456"]).html;
    expect(segunda).toBe(primeira);
  });

  it("devolve a página intacta quando não há herói identificável", () => {
    const semH1 = "<body><div><p>só texto</p></div></body>";
    expect(enfeitarPagina(semH1, { id: "z" }, []).html).toBe(semH1);
  });
});
