import { afterEach, describe, expect, it } from "vitest";
import { getGeminiModel } from "../server/config";

describe("getGeminiModel", () => {
  const OLD = process.env.GEMINI_MODEL;

  afterEach(() => {
    if (OLD === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = OLD;
  });

  it("retorna o default gemini-flash-latest quando GEMINI_MODEL não está setado", () => {
    delete process.env.GEMINI_MODEL;
    expect(getGeminiModel()).toBe("gemini-flash-latest");
  });

  it("retorna o valor de GEMINI_MODEL quando configurado (override)", () => {
    process.env.GEMINI_MODEL = "gemini-3.7-flash";
    expect(getGeminiModel()).toBe("gemini-3.7-flash");
  });

  it("trata GEMINI_MODEL vazio como default", () => {
    process.env.GEMINI_MODEL = "";
    expect(getGeminiModel()).toBe("gemini-flash-latest");
  });
});