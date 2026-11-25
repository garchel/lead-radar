import { describe, expect, it } from "vitest";
import { aprimorarPagina } from "../server/services/previewEnhance";

/**
 * O movimento é injetado pelo sistema, não pelo modelo. Estes testes travam o
 * contrato: a página sai com shader + script embutido, idempotente, sem
 * dependência externa e com orçamento de bytes.
 */

const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Teste</title></head>
<body>
<header><strong>Barbearia Teste</strong></header>
<section class="hero"><h1>Barbearia no Centro</h1><p>Corte e barba.</p>
<a href="https://wa.me/5561999999999">Falar</a></section>
<section><h2>Serviços</h2><ul><li>Corte</li><li>Barba</li></ul></section>
<footer>Fim</footer>
</body></html>`;

describe("aprimorarPagina", () => {
  it("injeta o canvas do shader no herói", () => {
    const { html, features } = aprimorarPagina(PAGINA, { fase: 3, cores: ["#222222", "#d4af37", "#f4efe6"] });
    expect(html).toContain('class="fx-canvas"');
    expect(html).toContain("data-fx-host");
    expect(features).toContain("fundo animado no hero");
  });

  it("injeta CSS e script dentro do body, sem requisição externa", () => {
    const { html } = aprimorarPagina(PAGINA, { fase: 3 });
    expect(html).toContain("fx-bar");
    expect(html).toContain("prefers-reduced-motion");
    expect(html).not.toMatch(/<script[^>]+src=/i);
    // script inline antes do fechamento do body
    expect(html.indexOf("<script>")).toBeLessThan(html.lastIndexOf("</body>"));
  });

  it("respeita o orçamento de bytes do JavaScript", () => {
    const { html } = aprimorarPagina(PAGINA, { fase: 3 });
    const m = html.match(/<script>([\s\S]*?)<\/script>/i);
    const bytes = Buffer.byteLength(m?.[1] || "", "utf8");
    expect(bytes).toBeGreaterThan(2000);
    expect(bytes).toBeLessThan(14_000);
  });

  it("é idempotente: rodar duas vezes não duplica", () => {
    const uma = aprimorarPagina(PAGINA, { fase: 3 }).html;
    const duas = aprimorarPagina(uma, { fase: 3 });
    expect(duas.features).toEqual([]);
    expect(duas.html).toBe(uma);
  });

  it("fase 0 não mexe em nada", () => {
    const r = aprimorarPagina(PAGINA, { fase: 0 as any });
    expect(r.html).toBe(PAGINA);
    expect(r.features).toEqual([]);
  });

  it("página sem h1 não ganha canvas, mas ganha o resto", () => {
    const semH1 = "<html><body><section><p>Sem título</p></section></body></html>";
    const { html, features } = aprimorarPagina(semH1, { fase: 1 });
    expect(html).not.toContain('<canvas class="fx-canvas"');
    expect(features).toContain("barra de progresso");
  });

  it("usa as cores da marca no shader", () => {
    const { html } = aprimorarPagina(PAGINA, { fase: 1, cores: ["#112233", "#445566", "#778899"] });
    expect(html).toContain('"#112233"');
  });
});
