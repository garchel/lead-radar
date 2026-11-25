import { describe, expect, it } from "vitest";
import { empacotarJs, extrairBlocos, montarPagina } from "../server/services/previewBundleService";
import type { StoredLead } from "../server/store/types";

/**
 * A página deixou de ser "um HTML com CSS": o modelo entrega marcação, estilo e
 * código, e o código pode importar bibliotecas de verdade. Estes testes travam o
 * contrato do empacotamento — sem CDN, sem requisição externa.
 */

const lead = {
  id: "lead-teste",
  name: "Barbearia Teste",
  city: "Linhares",
  state: "ES",
  phone: "5561999999999",
  category: "Barbearia",
  pipelineStatus: "new",
} as unknown as StoredLead;

const RESPOSTA = `Aqui está:

\`\`\`html
<header><strong>Barbearia Teste</strong></header>
<section><h1>Barbearia no Centro</h1></section>
\`\`\`

\`\`\`css
body { background: #f6f2ea; color: #1c1c1c; }
\`\`\`

\`\`\`js
import { animate, inView } from "motion";
inView("h1", () => animate("h1", { opacity: [0, 1], y: [16, 0] }));
\`\`\``;

describe("extrairBlocos", () => {
  it("lê os três blocos da resposta", () => {
    const b = extrairBlocos(RESPOSTA);
    expect(b?.markup).toContain("<h1>");
    expect(b?.css).toContain("background");
    expect(b?.js).toContain("motion");
  });

  it("aceita o formato antigo (documento completo) sem quebrar", () => {
    const antigo = "<!doctype html><html><head><style>p{color:red}</style></head><body><h1>Oi</h1></body></html>";
    const b = extrairBlocos(antigo);
    expect(b?.markup).toContain("<h1>");
    expect(b?.css).toContain("color:red");
  });

  it("devolve null quando não há nada aproveitável", () => {
    expect(extrairBlocos("desculpe, não consigo")).toBeNull();
  });
});

describe("empacotarJs", () => {
  it("resolve import de biblioteca e gera arquivo único", async () => {
    const r = await empacotarJs('import { animate } from "motion"; animate("h1", { opacity: [0, 1] });');
    expect(r.ok).toBe(true);
    expect(r.bytes).toBeGreaterThan(10_000);
    expect(r.js).not.toContain("import "); // virou um arquivo só, sem ESM
  });

  it("devolve erro legível quando o código não compila", async () => {
    const r = await empacotarJs("import { coisa } from 'biblioteca-que-nao-existe'; coisa();");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não compila/);
  });

  it("código vazio não vira script", async () => {
    const r = await empacotarJs("");
    expect(r.ok).toBe(true);
    expect(r.js).toBe("");
  });
});

describe("montarPagina", () => {
  it("junta marcação, estilo e código num documento único", () => {
    const html = montarPagina(lead, { markup: "<h1>Oi</h1>", css: "h1{color:red}", js: "" }, "console.log(1)");
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<style>h1{color:red}</style>");
    expect(html).toContain("<script>console.log(1)</script>");
    expect(html).toContain("Barbearia Teste");
    expect(html).toContain('name="viewport"');
  });

  it("não injeta layout nem seção: o conteúdo é só o que veio", () => {
    const html = montarPagina(lead, { markup: "<h1>Oi</h1>", css: "", js: "" }, "");
    const corpo = html.split("<body>")[1].split("</body>")[0];
    expect(corpo.trim()).toBe("<h1>Oi</h1>");
  });
});
