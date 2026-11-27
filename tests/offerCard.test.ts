import { describe, expect, it } from "vitest";
import { getCommercialPolicy } from "../server/services/commercialPolicy";
import { cartaoDePacotes, cartaoDeSecoes, limiteDeSecoes } from "../server/services/offerCard";

const policy = getCommercialPolicy();
const SECOES = ["corte e barba", "galeria", "equipe", "agendamento", "mapa"];

describe("cartão de oferta", () => {
  it("lê o limite de seções do texto do pacote", () => {
    expect(limiteDeSecoes("uma página com até 5 seções, botão e publicação")).toBe(5);
    expect(limiteDeSecoes("até 8 seções")).toBe(8);
    expect(limiteDeSecoes("sem número")).toBeNull();
  });

  it("cada pacote abre com nome e preço em negrito no mesmo padrão", () => {
    const texto = cartaoDePacotes(policy, { secoes: SECOES });
    expect(texto).toMatch(/\*ESSENCIAL\* \| \*R\$ 899\*/);
    expect(texto).toMatch(/\*PROFISSIONAL\* \| \*R\$ 1\.199\*/);
  });

  it("usa bullets, um item por linha, e nunca travessão", () => {
    const texto = cartaoDePacotes(policy, { secoes: SECOES });
    const bullets = texto.split("\n").filter((l) => l.startsWith("• "));
    expect(bullets.length).toBeGreaterThanOrEqual(8);
    expect(texto).not.toMatch(/[\u2014\u2013]/);
    // nenhuma linha mistura dois bullets (sinal de prosa colada)
    expect(bullets.every((l) => l.indexOf("• ", 1) === -1)).toBe(true);
  });

  it("separa os pacotes com linha em branco e fecha com pergunta", () => {
    const texto = cartaoDePacotes(policy, { secoes: SECOES });
    expect(texto).toContain("\n\n");
    expect(texto.trim().endsWith("?")).toBe(true);
  });

  it("a sugestão de seções do nicho entra no cartão", () => {
    const texto = cartaoDePacotes(policy, { secoes: SECOES });
    expect(texto).toContain("corte e barba");
    expect(texto).toContain("Até *5 seções*");
  });

  it("o pacote maior usa as seções extras quando existem", () => {
    const texto = cartaoDePacotes(policy, { secoes: SECOES, extras: ["depoimentos", "faq", "infantil"] });
    expect(texto).toContain("Até *8 seções*");
    expect(texto).toMatch(/depoimentos/i);
  });

  it("não promete posição no Google", () => {
    const texto = cartaoDePacotes(policy, { secoes: SECOES }).toLowerCase();
    expect(texto).not.toMatch(/primeir[ao] (posi|p[áa]gina)/);
    expect(texto).not.toMatch(/ranque/);
  });

  it("cartão de seções separa essencial de diferencial", () => {
    const texto = cartaoDeSecoes({ nicho: "barbearia", essenciais: SECOES, diferenciais: ["depoimentos", "bloco infantil"] });
    expect(texto).toContain("O que uma página de barbearia precisa ter");
    expect(texto).toContain("No *Profissional* entram ainda");
    expect(texto.trim().endsWith("?")).toBe(true);
  });
});
