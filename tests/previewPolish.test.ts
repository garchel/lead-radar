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

  it("não troca a serifada da página, mas ainda impõe as medidas do público", () => {
    const comSerifa = pagina.replace("Manrope", "Playfair Display");
    const { html, features } = refinarPagina(comSerifa, { id: "lead_1", name: "Clínica" });
    // Tipografia: respeita a escolha do modelo.
    expect(html).not.toContain('data-acabamento="1"');
    expect(html).not.toContain("fonts.googleapis.com");
    // Medidas: entram sempre — instrução de tamanho o modelo ignora.
    expect(html).toContain('data-medidas="1"');
    expect(features.join(" ")).toMatch(/medidas/);
  });

  it("impõe corpo de 19px para público idoso (ótica)", () => {
    const { html } = refinarPagina(pagina, { id: "lead_2", name: "Ótica Central", category: "Ótica" });
    const m = html.match(/data-medidas="1">([\s\S]*?)<\/style>/);
    expect(m?.[1]).toMatch(/font-size: max\(19px, 1em\)/);
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
