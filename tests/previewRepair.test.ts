import { describe, expect, it } from "vitest";
import { perfilCombinaComNegocio } from "../server/services/brandResearchService";
import { repararPagina, removerOpacidadeZero } from "../server/services/previewRepair";

/**
 * Dois casos reais que estragaram entrega:
 * 1. perfil do Instagram de OUTRA clínica colado na página;
 * 2. página boa descartada pelo portão por detalhe que dá para consertar em CSS.
 */

describe("perfil do Instagram tem que ser do negócio", () => {
  it("aceita quando o handle contém palavra do nome", () => {
    expect(perfilCombinaComNegocio("https://instagram.com/drasuelencorreia", "Clínica Dra. Suelen Correia")).toBe(true);
    expect(perfilCombinaComNegocio("https://instagram.com/jovi.odontologia", "Jovi Odontologia de Excelência")).toBe(true);
  });

  it("recusa perfil de outra empresa (o caso Jovi)", () => {
    expect(perfilCombinaComNegocio("https://instagram.com/odontoexcellencebc", "Jovi Odontologia de Excelência")).toBe(false);
    expect(perfilCombinaComNegocio("https://instagram.com/julianavadoraacademy", "Carlos Cardinal / Arquiteto")).toBe(false);
  });

  it("casos reais de produção (o @ errado não passa)", () => {
    const jovi = "Clínica Odontológica em Balneário Camboriú | Jovi Odontologia de Excelência";
    expect(perfilCombinaComNegocio("https://instagram.com/odontoexcellencebc", jovi)).toBe(false);
    expect(perfilCombinaComNegocio("https://instagram.com/jovi.odontologia", jovi)).toBe(true);
    expect(perfilCombinaComNegocio("https://instagram.com/dicorebarbearia", "Dicore Barbearia")).toBe(true);
    expect(perfilCombinaComNegocio("https://instagram.com/julianavadoraacademy", "Carlos Cardinal / Arquiteto")).toBe(false);
  });

  it("nome só com palavra genérica não permite julgar — aceita", () => {
    expect(perfilCombinaComNegocio("https://instagram.com/clinicaqualquer", "Clínica Odontologia")).toBe(true);
  });

  it("sem perfil, recusa", () => {
    expect(perfilCombinaComNegocio(undefined, "Qualquer Negócio")).toBe(false);
  });
});

describe("reparo da página gerada", () => {
  const base = `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head>
<body><h1>Teste</h1><a href="https://wa.me/5561999990000">WhatsApp</a></body></html>`;

  it("injeta o CSS de garantia e não duplica", () => {
    const um = repararPagina(base, ["alvo(s) de toque abaixo de 32px"]);
    expect(um.html).toContain('id="reparos-previa"');
    expect(um.reparos.length).toBeGreaterThan(0);

    const dois = repararPagina(um.html, ["alvo(s) de toque abaixo de 32px"]);
    expect(dois.html.match(/id="reparos-previa"/g)?.length).toBe(1);
  });

  it("cria o espaço reservado quando a página esqueceu", () => {
    const r = repararPagina(base, ["sem espaço reservado para imagem"]);
    expect(r.html).toContain('data-slot="hero"');
    expect(r.reparos.some((x) => x.problema.includes("sem espaço reservado"))).toBe(true);
  });

  it("some com opacity:0 fora de keyframes e preserva a animação", () => {
    const html = `<style>.a{opacity:0}@keyframes f{from{opacity:0}to{opacity:1}}</style><div class="a">x</div>`;
    const saida = removerOpacidadeZero(html);
    expect(saida).toContain(".a{opacity:1}");
    expect(saida).toContain("@keyframes f{from{opacity:0}to{opacity:1}}");
  });

  it("é idempotente no CSS: rodar duas vezes não estraga a página", () => {
    const a = repararPagina(base, ["transbordo horizontal"]).html;
    const b = repararPagina(a, ["transbordo horizontal"]).html;
    expect(a).toBe(b);
  });
});
