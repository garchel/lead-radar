import { describe, expect, it } from "vitest";
import { fonteDeDisplay, refinarPagina } from "../server/services/previewPolish";

/**
 * "Parece barato" quase sempre é primitivo pobre: uma fonte só, botão chapado,
 * título sem tracking. O acabamento entra por código, depois do modelo.
 */

const pagina = `<!doctype html><html><head><style>body{font-family:'Manrope',sans-serif}</style></head>
<body><header><h1>Clínica no Centro</h1></header><section><h2>Serviços</h2><a href="https://wa.me/556199999999">Falar</a></section></body></html>`;

describe("fonte de display", () => {
  it("é estável para o mesmo lead", () => {
    expect(fonteDeDisplay("lead_1").nome).toBe(fonteDeDisplay("lead_1").nome);
  });

  it("varia entre leads diferentes", () => {
    const nomes = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => fonteDeDisplay(x).nome));
    expect(nomes.size).toBeGreaterThanOrEqual(3);
  });
});

describe("acabamento", () => {
  it("aplica serifada de display no título", () => {
    const { html, features } = refinarPagina(pagina, { id: "lead_1", name: "Clínica" });
    expect(html).toContain("fonts.googleapis.com");
    expect(html).toContain("text-wrap: balance");
    expect(features.join(" ")).toContain("display");
  });

  it("não mexe em página que já tem serifada própria", () => {
    const comSerifa = pagina.replace("Manrope", "Playfair Display");
    const { html, features } = refinarPagina(comSerifa, { id: "lead_1", name: "Clínica" });
    expect(html).toBe(comSerifa);
    expect(features).toEqual([]);
  });

  it("não aplica duas vezes", () => {
    const primeira = refinarPagina(pagina, { id: "lead_1", name: "X" }).html;
    const segunda = refinarPagina(primeira, { id: "lead_1", name: "X" }).html;
    expect(segunda).toBe(primeira);
  });

  it("refina botão e cartão sem sombra pesada", () => {
    const { html } = refinarPagina(pagina, { id: "lead_1", name: "X" });
    expect(html).toContain("box-shadow: none !important");
    expect(html).toContain("::selection");
  });
});
