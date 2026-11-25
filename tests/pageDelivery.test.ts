import { describe, expect, it } from "vitest";
import {
  listarEntregasPendentes,
  mensagemDaPagina,
  mensagemDeEspera,
  registrarEntregaPendente,
  resolverEntregaPendente,
} from "../server/services/pageDeliveryService";

/**
 * O app é o dono da entrega da prévia. Estes testes travam o texto que vai para o
 * cliente e o registro de entrega que ficou pendente — a única brecha por onde o
 * agente pode mandar o link sozinho.
 */

describe("mensagem de entrega da página", () => {
  const url = "https://vertice-paginas.pages.dev/pianca-barbearia";

  it("não chama o dono pelo nome da empresa", () => {
    // Bug real: "Mais Você Estética" virava "Mais, ficou pronto!"
    const texto = mensagemDaPagina("Mais Você Estética Facial e Corporal", url);
    expect(texto).toContain(url);
    expect(texto).toContain("Montei a página de vocês");
    expect(texto).not.toMatch(/Mais,/);
    expect(texto).not.toContain("Mais,");
  });

  it("usa o nome do decisor quando ele existe", () => {
    const texto = mensagemDaPagina("Mais Você Estética Facial e Corporal", url, "Suelen Correia");
    expect(texto).toContain("Suelen");
  });

  it("ignora decisor que é a própria empresa", () => {
    const texto = mensagemDaPagina("Pianca Barbearia", url, "Pianca");
    expect(texto).not.toContain("Pianca,");
  });

  it("nunca chama a página de rascunho (foi o erro do agente)", () => {
    for (const nome of ["PIANCA BARBEARIA", "Carlos Cardinal", "Dra. Suelen Correia"]) {
      const texto = mensagemDaPagina(nome, url).toLowerCase();
      expect(texto).not.toContain("primeira tela");
      expect(texto).not.toContain("rascunho");
      expect(texto).not.toContain("o que você quer ajustar");
    }
  });

  it("não fala de preço nem de agência", () => {
    const texto = mensagemDaPagina("PIANCA BARBEARIA", url).toLowerCase();
    expect(texto).not.toContain("r$");
    expect(texto).not.toContain("plano");
    expect(texto).not.toContain("pacote");
  });

  it("é estável para a mesma empresa", () => {
    expect(mensagemDaPagina("PIANCA BARBEARIA", url)).toBe(mensagemDaPagina("PIANCA BARBEARIA", url));
  });

  it("varia entre empresas diferentes", () => {
    const nomes = ["PIANCA BARBEARIA", "Carlos Cardinal", "Dra. Suelen Correia", "Dicore Barbearia", "Jovi Odontologia"];
    const variacoes = new Set(nomes.map((n) => mensagemDaPagina(n, url)));
    expect(variacoes.size).toBeGreaterThan(1);
  });

  it("usa no máximo dois emojis", () => {
    const texto = mensagemDaPagina("PIANCA BARBEARIA", url);
    const emojis = texto.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
    expect(emojis.length).toBeLessThanOrEqual(2);
  });
});

describe("aviso de espera", () => {
  it("não promete página pronta nem pede para esperar muito", () => {
    const texto = mensagemDeEspera();
    expect(texto).toContain("minutinho");
    expect(texto).not.toContain("pronta");
    expect(texto.length).toBeLessThan(90);
  });
});

describe("fila de entregas pendentes", () => {
  it("registra, lista e resolve", () => {
    registrarEntregaPendente("lead-fila-1", "Barbearia Teste", "https://exemplo/pagina", "entrega bloqueada: última mensagem é nossa");
    const pendentes = listarEntregasPendentes();
    const achada = pendentes.find((p) => p.leadId === "lead-fila-1");
    expect(achada?.motivo).toContain("bloqueada");
    expect(achada?.url).toBe("https://exemplo/pagina");

    resolverEntregaPendente("lead-fila-1");
    expect(listarEntregasPendentes().some((p) => p.leadId === "lead-fila-1")).toBe(false);
  });

  it("não duplica a mesma pendência", () => {
    registrarEntregaPendente("lead-fila-2", "Teste Dois", "https://exemplo/2", "motivo antigo");
    registrarEntregaPendente("lead-fila-2", "Teste Dois", "https://exemplo/2", "motivo novo");
    const todas = listarEntregasPendentes().filter((p) => p.leadId === "lead-fila-2");
    expect(todas).toHaveLength(1);
    expect(todas[0].motivo).toBe("motivo novo");
  });
});
