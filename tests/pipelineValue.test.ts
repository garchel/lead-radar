import { describe, expect, it } from "vitest";
import { computePipelineValue, parseMoneyAverage } from "../src/utils/pipelineValue";

/**
 * Regressão: a regex do "Potencial do Funil" estava escrita com barra dupla
 * (/\\d.../), casando a letra "d" literal — o painel mostrava R$ 0 mesmo com
 * 55 leads de R$ 1.800–R$ 3.500 na tela.
 */
describe("potencial do funil", () => {
  it("média da faixa quando há dois valores", () => {
    expect(parseMoneyAverage("R$ 1.800 - R$ 3.500")).toBe(2650);
    expect(parseMoneyAverage("R$ 1.800 - R$ 3.500 / projeto")).toBe(2650);
  });

  it("um valor só devolve ele mesmo; sem valor devolve null", () => {
    expect(parseMoneyAverage("R$ 2.500")).toBe(2500);
    expect(parseMoneyAverage("")).toBeNull();
    expect(parseMoneyAverage(null)).toBeNull();
    expect(parseMoneyAverage("Valor não informado")).toBeNull();
  });

  it("trata separador de milhar", () => {
    expect(parseMoneyAverage("R$ 12.000 - R$ 18.000")).toBe(15000);
  });

  it("soma as médias de todos os leads com valor", () => {
    const leads = [
      { id: "a", estimatedValue: "R$ 1.800 - R$ 3.500" },
      { id: "b", estimatedValue: "R$ 1.800 - R$ 3.500" },
      { id: "c", estimatedValue: "Valor não informado" },
    ] as any[];
    expect(computePipelineValue(leads)).toBe(5300);
  });

  it("funil vazio é zero (e não NaN)", () => {
    expect(computePipelineValue([])).toBe(0);
  });
});
