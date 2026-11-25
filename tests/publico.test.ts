import { describe, expect, it } from "vitest";
import { PERFIS, entrelinhaPara, medirTitulo, perfilDoLead } from "../server/services/publicoService";

/**
 * Ideia importada da skill `chicote`: transformar público em número e usar uma
 * fórmula para o título em vez de gosto. Aqui os números também limitam o portão.
 */

describe("perfil do público pelo nicho", () => {
  it("ótica e farmácia atendem majoritariamente gente mais velha", () => {
    expect(perfilDoLead("Ótica")).toBe("idoso");
    expect(perfilDoLead("Farmácia")).toBe("idoso");
  });

  it("barbearia e estética pedem o perfil jovem", () => {
    expect(perfilDoLead("Barbearia")).toBe("jovem");
    expect(perfilDoLead("Estética")).toBe("jovem");
  });

  it("advocacia e contabilidade são b2b", () => {
    expect(perfilDoLead("Advocacia")).toBe("b2b");
    expect(perfilDoLead("Contabilidade")).toBe("b2b");
  });

  it("o resto cai no perfil geral", () => {
    expect(perfilDoLead("Psicólogo")).toBe("geral");
    expect(perfilDoLead("")).toBe("geral");
  });

  it("o perfil idoso exige letra e alvo maiores que o geral", () => {
    expect(PERFIS.idoso.corpo).toBeGreaterThan(PERFIS.geral.corpo);
    expect(PERFIS.idoso.alvo).toBeGreaterThan(PERFIS.geral.alvo);
    expect(PERFIS.idoso.contraste).toBeGreaterThanOrEqual(7);
  });
});

describe("entrelinha derivada", () => {
  it("diminui relativamente conforme a letra cresce", () => {
    const pequena = entrelinhaPara(17, 17);
    const grande = entrelinhaPara(64, 17);
    expect(grande).toBeLessThan(pequena);
  });

  it("nunca desce abaixo de 1,02 nem passa de 1,75", () => {
    expect(entrelinhaPara(200, 17)).toBeGreaterThanOrEqual(1.02);
    expect(entrelinhaPara(8, 17)).toBeLessThanOrEqual(1.75);
  });

  it("idoso ganha entrelinha extra no corpo", () => {
    expect(entrelinhaPara(19, 19, "idoso")).toBeGreaterThan(entrelinhaPara(19, 19, "geral"));
  });
});

describe("título por conta", () => {
  it("frase curta cabe grande", () => {
    const m = medirTitulo("Barbearia no Centro", 328, 3);
    expect(m.cabe).toBe(true);
    expect(m.px).toBeGreaterThan(30);
  });

  it("frase longa é reprovada com pedido de encurtar, não de diminuir", () => {
    const m = medirTitulo("Especialistas em tratamentos estéticos faciais e corporais avançados com tecnologia", 328, 3);
    expect(m.cabe).toBe(false);
    expect(m.sugestao).toContain("Encurte");
  });

  it("a conta respeita o número de linhas pedido", () => {
    const duas = medirTitulo("Clínica odontológica em Cachoeirinha", 328, 2);
    const tres = medirTitulo("Clínica odontológica em Cachoeirinha", 328, 3);
    expect(tres.px).toBeGreaterThan(duas.px);
  });
});
