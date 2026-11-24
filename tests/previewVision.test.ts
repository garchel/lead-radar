import { describe, expect, it } from "vitest";
import { extrairVeredito, juizVisualAtivo, notaMinima } from "../server/services/previewVisionService";

describe("juiz visual da prévia", () => {
  it("lê o JSON puro", () => {
    const v = extrairVeredito('{"nota": 8, "problemas": ["título fraco"]}');
    expect(v).toEqual({ nota: 8, problemas: ["título fraco"] });
  });

  it("lê JSON dentro de cerca markdown e texto em volta", () => {
    const v = extrairVeredito('Aqui está:\n```json\n{"nota": 6.5, "problemas": ["a", "b", "c", "d"]}\n```\nfim');
    expect(v?.nota).toBe(6.5);
    expect(v?.problemas).toHaveLength(3); // máximo 3
  });

  it("prende a nota entre 0 e 10", () => {
    expect(extrairVeredito('{"nota": 14, "problemas": []}')?.nota).toBe(10);
    expect(extrairVeredito('{"nota": -3, "problemas": []}')?.nota).toBe(0);
  });

  it("devolve null quando não há JSON utilizável", () => {
    expect(extrairVeredito("A página está boa, nota oito.")).toBeNull();
    expect(extrairVeredito('{"problemas": []}')).toBeNull();
  });

  it("fica desligado nos testes (sem chamar modelo de verdade)", () => {
    expect(juizVisualAtivo()).toBe(false);
  });

  it("respeita PREVIEW_VISUAL_MIN", () => {
    const antes = process.env.PREVIEW_VISUAL_MIN;
    process.env.PREVIEW_VISUAL_MIN = "8";
    expect(notaMinima()).toBe(8);
    delete process.env.PREVIEW_VISUAL_MIN;
    expect(notaMinima()).toBe(7.5);
    if (antes !== undefined) process.env.PREVIEW_VISUAL_MIN = antes;
  });
});
