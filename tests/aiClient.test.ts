import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { comDeepSeek, getAiClient, isDeepSeekModel, modelosDeepSeek } from "../server/services/aiClient";

/**
 * O cliente de IA é o ponto onde tudo passa. Estes testes garantem que:
 * - a chamada sai no formato que o gateway do OpenCode aceita;
 * - imagem vira image_url com data URL (o Gemini usava inlineData);
 * - resposta vazia (raciocínio comeu o teto) é erro, não silêncio;
 * - em teste de unidade nada vai para a rede.
 */

const original = { ...process.env };

function respostaOk(texto: string, extras: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      model: "deepseek-v4.1-flash",
      choices: [{ message: { content: texto }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, ...extras },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  // OPENCODE_TESTS=1 libera o modelo na lista mesmo rodando sob vitest
  process.env = { ...original, OPENCODE_API_KEY: "chave-de-teste", GEMINI_API_KEY: "gemini-de-teste", OPENCODE_TESTS: "1" };
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
});

describe("roteamento por modelo", () => {
  it("reconhece o modelo do DeepSeek pelo nome", () => {
    expect(isDeepSeekModel("deepseek-v4.1-flash")).toBe(true);
    expect(isDeepSeekModel("gemini-3.1-flash-lite")).toBe(false);
  });

  it("comDeepSeek põe o modelo na frente sem duplicar", () => {
    const lista = comDeepSeek(["gemini-3.1-flash-lite"]);
    expect(lista[0]).toBe("deepseek-v4.1-flash");
    expect(lista).toContain("gemini-3.1-flash-lite");
    expect(new Set(lista).size).toBe(lista.length);
  });

  it("sem chave, a lista continua só com o Gemini", () => {
    delete process.env.OPENCODE_API_KEY;
    expect(modelosDeepSeek()).toEqual([]);
    expect(comDeepSeek(["gemini-3.1-flash-lite"])).toEqual(["gemini-3.1-flash-lite"]);
  });
});

describe("chamada ao DeepSeek", () => {
  it("manda texto como mensagem de usuário e devolve texto + uso", async () => {
    const espiao = vi.spyOn(globalThis, "fetch").mockResolvedValue(respostaOk("claro"));
    const ai = getAiClient("gemini-de-teste");

    const res = await ai.models.generateContent({
      model: "deepseek-v4.1-flash",
      contents: [{ role: "user", parts: [{ text: "oi" }] }],
      config: { maxOutputTokens: 50 },
    });

    expect(res.text).toBe("claro");
    expect(res.usageMetadata.promptTokenCount).toBe(100);
    expect(res.modelVersion).toBe("deepseek-v4.1-flash");

    const corpo = JSON.parse(String((espiao.mock.calls[0][1] as RequestInit).body));
    expect(corpo.messages).toEqual([{ role: "user", content: "oi" }]);
    expect(corpo.reasoning_effort).toBe("none");
    const headers = (espiao.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-opencode-session"]).toBeTruthy();
  });

  it("pede JSON e coloca o schema no prompt", async () => {
    const espiao = vi.spyOn(globalThis, "fetch").mockResolvedValue(respostaOk('{"intent":"preco"}'));
    const ai = getAiClient();

    await ai.models.generateContent({
      model: "deepseek-v4.1-flash",
      contents: [{ role: "user", parts: [{ text: "quanto custa?" }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { intent: { type: "STRING" } } },
      },
    });

    const corpo = JSON.parse(String((espiao.mock.calls[0][1] as RequestInit).body));
    expect(corpo.response_format).toEqual({ type: "json_object" });
    const sistema = corpo.messages.find((m: any) => m.role === "system");
    expect(sistema.content).toContain("intent");
  });

  it("converte inlineData em image_url com data URL", async () => {
    const espiao = vi.spyOn(globalThis, "fetch").mockResolvedValue(respostaOk('{"cores":[]}'));
    const ai = getAiClient();

    await ai.models.generateContent({
      model: "deepseek-v4.1-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: "que cores são essas?" },
            { inlineData: { mimeType: "image/png", data: "QUJD" } },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const corpo = JSON.parse(String((espiao.mock.calls[0][1] as RequestInit).body));
    const partes = corpo.messages[0].content;
    expect(partes[0]).toEqual({ type: "text", text: "que cores são essas?" });
    expect(partes[1].image_url.url).toBe("data:image/png;base64,QUJD");
  });

  it("resposta vazia vira erro (não passa como se fosse boa)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: "" }, finish_reason: "length" }],
        usage: { prompt_tokens: 10, completion_tokens: 300 },
      }), { status: 200 }),
    );
    const ai = getAiClient();
    await expect(
      ai.models.generateContent({ model: "deepseek-v4.1-flash", contents: "x" }),
    ).rejects.toThrow(/vazia|length/i);
  });

  it("erro do provedor carrega o status para o laço de reserva decidir", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { type: "rate_limit", message: "slow down" } }), { status: 429 }),
    );
    const ai = getAiClient();
    await expect(
      ai.models.generateContent({ model: "deepseek-v4.1-flash", contents: "x" }),
    ).rejects.toThrow(/429/);
  });
});
