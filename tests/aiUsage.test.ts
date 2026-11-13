import { describe, expect, it } from "vitest";
import {
  approximateTokens,
  clientUsage,
  estimateCostUsd,
  priceTable,
  recordAiUsage,
  usageFromResponse,
  usageReport,
} from "../server/services/aiUsageService";

describe("custo de IA", () => {
  it("preço por milhão do flash: 1M entrada + 1M saída = US$ 2,80", () => {
    expect(estimateCostUsd("gemini-flash-latest", 1_000_000, 1_000_000)).toBeCloseTo(2.8, 4);
  });

  it("embedding só cobra entrada", () => {
    expect(estimateCostUsd("gemini-embedding-001", 1_000_000, 999_999)).toBeCloseTo(0.15, 4);
  });

  it("modelo pro custa mais que flash", () => {
    expect(estimateCostUsd("gemini-pro", 100_000, 10_000)).toBeGreaterThan(
      estimateCostUsd("gemini-flash-latest", 100_000, 10_000)
    );
  });

  it("preço pode ser sobrescrito por env (mudou a tabela do provedor)", () => {
    process.env.AI_PRICE_IN_PER_M = "1";
    process.env.AI_PRICE_OUT_PER_M = "2";
    expect(priceTable("qualquer")).toEqual({ inPerMillion: 1, outPerMillion: 2 });
    delete process.env.AI_PRICE_IN_PER_M;
    delete process.env.AI_PRICE_OUT_PER_M;
  });

  it("lê usageMetadata do Gemini quando existe", () => {
    const uso = usageFromResponse({ usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 90 } }, "x", "y");
    expect(uso).toEqual({ tokensIn: 1200, tokensOut: 90 });
  });

  it("sem usageMetadata, estima por caracteres (nunca registra zero)", () => {
    const uso = usageFromResponse({}, "a".repeat(400), "b".repeat(40));
    expect(uso.tokensIn).toBe(100);
    expect(uso.tokensOut).toBe(10);
    expect(approximateTokens("")).toBe(1);
  });

  it("registra e agrega por cliente", () => {
    recordAiUsage({ kind: "bot_resposta", model: "gemini-flash-latest", clientId: "bot_teste_a", tokensIn: 1000, tokensOut: 200 });
    recordAiUsage({ kind: "bot_embeddings", model: "gemini-embedding-001", clientId: "bot_teste_a", tokensIn: 500 });

    const relatorio = usageReport();
    const bucket = relatorio.porCliente.find((b) => b.key === "bot_teste_a");
    expect(bucket).toBeTruthy();
    expect(bucket!.chamadas).toBe(2);
    expect(bucket!.tokensIn).toBe(1500);
    expect(bucket!.usd).toBeGreaterThan(0);

    expect(relatorio.porTipo.map((t) => t.key)).toEqual(expect.arrayContaining(["bot_resposta", "bot_embeddings"]));
  });

  it("custo de um cliente sem uso é zero", () => {
    expect(clientUsage("bot_que_nunca_respondeu").usd).toBe(0);
  });
});
