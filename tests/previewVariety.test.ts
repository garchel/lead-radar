import { describe, expect, it } from "vitest";
import { assinaturaEstrutural, similaridadeEstrutural } from "../server/services/aiPreviewService";

/**
 * Variedade é requisito do dono: duas páginas de clientes diferentes não podem
 * sair com a mesma estrutura. A comparação olha o que a página TEM e em que
 * ordem, não o estilo.
 */

const PADRAO = `<section><h1>Clínica no Centro</h1><p>texto</p></section>
<section><h2>O que fazemos</h2><ol><li>01 Avaliação</li><li>02 Limpeza</li></ol></section>
<section class="card"><h2>Nota no Google</h2><p>5,0 — 241 avaliações</p></section>
<section><h2>Onde fica</h2></section>`;

const DIFERENTE = `<section><h1>Barbearia</h1><p>texto</p></section>
<section><h2>Serviços</h2><table><tr><td>Corte</td><td>40 min</td></tr></table></section>
<section><h2>Quem atende</h2><blockquote>citação</blockquote></section>
<footer><h2>Endereço</h2></footer>`;

describe("assinatura estrutural", () => {
  it("captura títulos, prova social, numeração e cartão", () => {
    const a = assinaturaEstrutural(PADRAO);
    expect(a.titulos).toContain("o que fazemos");
    expect(a.provaEmBloco).toBe(1);
    expect(a.listaNumerada).toBe(1);
    expect(a.cartao).toBe(1);
  });

  it("página sem os padrões não ganha as marcas", () => {
    const b = assinaturaEstrutural(DIFERENTE);
    expect(b.provaEmBloco).toBe(0);
    expect(b.listaNumerada).toBe(0);
    expect(b.cartao).toBe(0);
  });
});

describe("similaridade estrutural", () => {
  it("páginas iguais em estrutura ficam acima do limite de reprovação", () => {
    const valor = similaridadeEstrutural(assinaturaEstrutural(PADRAO), assinaturaEstrutural(PADRAO));
    expect(valor).toBeGreaterThanOrEqual(0.72);
  });

  it("páginas com blocos e formatos diferentes ficam abaixo", () => {
    const valor = similaridadeEstrutural(assinaturaEstrutural(PADRAO), assinaturaEstrutural(DIFERENTE));
    expect(valor).toBeLessThan(0.72);
  });
});
