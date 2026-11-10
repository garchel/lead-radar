import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };
  },
}));

import { getCommunicationsByLead, getLeadById, setSetting, upsertLead } from "../server/store/db";
import {
  AI_MIN_CONFIDENCE,
  classifyByRules,
  classifyInbound,
  classifyWithAI,
} from "../server/services/intentService";
import { app } from "../server";

let seq = 0;
function seedLead(id: string): void {
  seq += 1;
  upsertLead({
    id,
    name: `Lead ${id}`,
    phone: `61 9${String(80000000 + seq).padStart(8, "0")}`,
    pipelineStatus: "contacted",
    lastContactAt: new Date().toISOString(),
    contactAttempts: 1,
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
}

describe("classifyByRules — respostas reais de WhatsApp", () => {
  const casos: Array<[string, string]> = [
    // o caso que motivou a mudança: aceite da prévia
    ["pode mandar", "interesse"],
    ["pode mandar a prévia", "interesse"],
    ["pode me enviar", "interesse"],
    ["manda a prévia", "interesse"],
    ["manda sim", "interesse"],
    ["me manda", "interesse"],
    ["quero ver", "interesse"],
    ["quero saber mais", "interesse"],
    ["sim, quero", "interesse"],
    ["claro, pode enviar", "interesse"],
    ["tenho interesse", "interesse"],
    ["como funciona?", "interesse"],
    // preço
    ["quanto custa?", "preco"],
    ["qual o valor do site?", "preco"],
    ["me passa um orçamento", "preco"],
    // recusa (sempre por regex, nunca pela IA)
    ["não tenho interesse", "recusa"],
    ["não quero", "recusa"],
    ["não quero saber", "recusa"],
    ["para de me mandar", "recusa"],
    ["já tenho site", "recusa"],
    ["desculpe, mas não", "recusa"],
    // ocupado
    ["agora não", "ocupado"],
    ["estou ocupado, me chama depois", "ocupado"],
    // ambíguas — vão para a IA
    ["manda", "outro"],
    ["claro", "outro"],
    ["oi", "outro"],
    ["bom dia", "outro"],
  ];

  for (const [texto, esperado] of casos) {
    it(`"${texto}" → ${esperado}`, () => {
      expect(classifyByRules(texto).intent).toBe(esperado);
    });
  }

  it("recusa tem confiança alta e move para declined", () => {
    const decision = classifyByRules("não tenho interesse");
    expect(decision.status).toBe("declined");
    expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("preço e interesse movem para negotiating", () => {
    expect(classifyByRules("quanto custa?").status).toBe("negotiating");
    expect(classifyByRules("pode mandar").status).toBe("negotiating");
  });

  it("texto vazio não inventa intenção", () => {
    expect(classifyByRules("")).toMatchObject({ intent: "outro", source: "none" });
  });
});

describe("classifyWithAI", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.generateContent.mockReset();
  });

  it("devolve a decisão da IA em JSON", async () => {
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ intent: "interesse", confidence: 0.82, reason: "pediu a prévia" }),
    });
    const decision = await classifyWithAI({ text: "manda" });
    expect(decision).toMatchObject({ intent: "interesse", source: "ia", confidence: 0.82 });
    expect(decision?.status).toBe("negotiating");
  });

  it("aceita JSON dentro de bloco markdown e normaliza confiança em %", async () => {
    mocks.generateContent.mockResolvedValue({
      text: '```json\n{"intent":"preco","confidence":75,"reason":"perguntou valor"}\n```',
    });
    const decision = await classifyWithAI({ text: "e o valor?" });
    expect(decision?.intent).toBe("preco");
    expect(decision?.confidence).toBe(0.75);
  });

  it("devolve null em resposta inválida (degrada para regex)", async () => {
    mocks.generateContent.mockResolvedValue({ text: "não sei" });
    expect(await classifyWithAI({ text: "manda" })).toBeNull();
  });

  it("devolve null quando todas as tentativas falham", async () => {
    mocks.generateContent.mockRejectedValue(new Error("503 UNAVAILABLE high demand"));
    expect(await classifyWithAI({ text: "manda" })).toBeNull();
  });
});

describe("classifyInbound — híbrido", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.generateContent.mockReset();
    setSetting("automation_intent_ai", "");
  });

  it("regex vence: não chama a IA quando a regra já entendeu", async () => {
    const decision = await classifyInbound({ text: "não tenho interesse" });
    expect(decision.source).toBe("regex");
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("usa a IA quando o regex devolve outro", async () => {
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ intent: "interesse", confidence: 0.9, reason: "aceitou a prévia" }),
    });
    const decision = await classifyInbound({ text: "manda" });
    expect(decision).toMatchObject({ intent: "interesse", source: "ia" });
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it("descarta resultado da IA abaixo do limite de confiança", async () => {
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({ intent: "interesse", confidence: 0.2 }) });
    const decision = await classifyInbound({ text: "manda" });
    expect(decision.intent).toBe("outro");
    expect(decision.source).not.toBe("ia");
  });

  it("IA nunca decide recusa (LGPD é sempre regex)", async () => {
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({ intent: "recusa", confidence: 0.95 }) });
    const decision = await classifyInbound({ text: "manda" });
    expect(decision.intent).toBe("outro");
    expect(decision.source).not.toBe("ia");
  });

  it("respeita o desligamento da IA nas configurações", async () => {
    setSetting("automation_intent_ai", "false");
    const decision = await classifyInbound({ text: "manda" });
    expect(decision.intent).toBe("outro");
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("limite de confiança é configurável e coerente", () => {
    expect(AI_MIN_CONFIDENCE).toBeGreaterThan(0);
    expect(AI_MIN_CONFIDENCE).toBeLessThanOrEqual(1);
  });
});

describe("webhook — intenção híbrida em produção", () => {
  let server: any;
  let baseUrl = "";

  beforeEach(async () => {
    process.env.GEMINI_API_KEY = "test-key";
    setSetting("automation_intent_ai", "");
    mocks.generateContent.mockReset();
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function post(phone: string, text: string) {
    return fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "leadradar",
        data: {
          key: { remoteJid: `${phone.replace(/\D/g, "")}@s.whatsapp.net`, fromMe: false, id: `msg_${Math.random()}` },
          pushName: "Teste",
          message: { conversation: text },
        },
      }),
    });
  }

  it("'pode mandar' move o pipeline e registra a intenção como regex", async () => {
    const leadId = "intent-regex";
    seedLead(leadId);
    const lead = getLeadById(leadId)!;

    const res = await post(lead.phone!, "pode mandar");
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(getLeadById(leadId)!.pipelineStatus).toBe("negotiating");
    const comm = getCommunicationsByLead(leadId).find((item) => item.direction === "inbound");
    expect(comm).toMatchObject({ intent: "interesse", intentSource: "regex" });
  });

  it("'manda' (ambíguo) é resolvido pela IA em segundo plano", async () => {
    mocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ intent: "interesse", confidence: 0.88, reason: "pediu para mandar" }),
    });
    const leadId = "intent-ia";
    seedLead(leadId);
    const lead = getLeadById(leadId)!;

    await post(lead.phone!, "manda");
    // a classificação por IA é assíncrona (depois do ACK)
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(getLeadById(leadId)!.pipelineStatus).toBe("negotiating");
    const comm = getCommunicationsByLead(leadId).find((item) => item.direction === "inbound");
    expect(comm).toMatchObject({ intent: "interesse", intentSource: "ia" });
  });
});
