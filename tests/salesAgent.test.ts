import { describe, expect, it, beforeEach } from "vitest";
import {
  checkAgentText,
  composeApproachMessage,
  composeReplyMessage,
  extractPrices,
  fallbackApproachMessage,
  fallbackReplyMessage,
  normalizePriceFormat,
} from "../server/services/salesAgentService";
import { buildLeadBriefing } from "../server/services/briefingService";
import { DEFAULT_POLICY, allowedPrices, cheapestPackage, formatBRL, deliveryLabel } from "../server/services/commercialPolicy";
import { recordCommunication, upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

const ALLOWED = allowedPrices(DEFAULT_POLICY);

function seed(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const lead: StoredLead = {
    id,
    name: "PIANCA BARBEARIA",
    phone: "5561999999999",
    city: "Goiânia",
    state: "GO",
    neighborhood: "Setor Bueno",
    category: "Barbearia",
    searchCategory: "Salão de Beleza / Barbearia",
    pipelineStatus: "prospect",
    websiteStatus: "none",
    rating: 5,
    reviewsCount: 47,
    opportunityScore: 90,
    contactAttempts: 0,
    ...overrides,
  };
  upsertLead(lead, { skipDedup: true });
  return lead;
}

describe("política comercial", () => {
  it("o pacote mais barato é o Essencial de R$ 900", () => {
    const cheapest = cheapestPackage(DEFAULT_POLICY);
    expect(cheapest.price).toBe(900);
    expect(formatBRL(cheapest.price)).toBe("R$ 900");
  });

  it("só os preços dos pacotes são citáveis", () => {
    expect(ALLOWED).toEqual([900, 1200]);
  });

  it("prazo padrão é 5 a 7 dias úteis", () => {
    expect(deliveryLabel(DEFAULT_POLICY)).toBe("5 a 7 dias úteis");
  });
});

describe("extração de preço", () => {
  it("acha valores em reais com e sem centavos", () => {
    expect(extractPrices("fica a partir de R$ 900, ou R$ 1.200 no completo")).toEqual([900, 1200]);
    expect(extractPrices("R$ 2.500,00")).toEqual([2500]);
    expect(extractPrices("sem valor aqui")).toEqual([]);
  });

  it("pega também o valor escrito por extenso em 'reais'", () => {
    expect(extractPrices("começa a partir de 900 reais")).toEqual([900]);
    expect(extractPrices("fica 2.500 reais")).toEqual([2500]);
    expect(extractPrices("são 1200 reais no completo")).toEqual([1200]);
  });

  it("não confunde número de avaliação com preço", () => {
    expect(extractPrices("tem 235 avaliações e nota 5")).toEqual([]);
  });

  it("padroniza '900 reais' para 'R$ 900'", () => {
    expect(normalizePriceFormat("começa a partir de 900 reais, com prévia grátis", ALLOWED)).toBe(
      "começa a partir de R$ 900, com prévia grátis"
    );
  });

  it("não reescreve valor que não é de pacote", () => {
    expect(normalizePriceFormat("fica 2.500 reais", ALLOWED)).toBe("fica 2.500 reais");
  });
});

describe("portão de qualidade do texto do agente", () => {
  const base = { kind: "approach" as const, allowedPriceList: ALLOWED, previousOutbound: [] as string[] };

  it("aprova uma mensagem curta com fato, perda e pergunta", () => {
    const text =
      "Oi, Rafael — a Pianca tem 5★ com 47 avaliações no Google, mas sem site quem pesquisa barbearia no Setor Bueno encontra os concorrentes primeiro. Montei uma prévia de como ficaria a página de vocês: posso te mandar?";
    expect(checkAgentText(text, base).ok).toBe(true);
  });

  it("reprova preço inventado", () => {
    const check = checkAgentText("Fica R$ 2.500 e a prévia é grátis, posso mandar?", base);
    expect(check.ok).toBe(false);
    expect(check.issues.join(" ")).toMatch(/preço não autorizado/);
  });

  it("aceita o preço da política", () => {
    const check = checkAgentText("Fica a partir de R$ 900, com a prévia gratuita. Quer ver?", base);
    expect(check.ok).toBe(true);
  });

  it("reprova link no primeiro contato", () => {
    expect(checkAgentText("Dá uma olhada em www.vertice.com.br — posso mandar?", base).ok).toBe(false);
  });

  it("reprova textão", () => {
    const long = `${"palavra ".repeat(80)}posso mandar?`;
    const check = checkAgentText(long, base);
    expect(check.ok).toBe(false);
    expect(check.issues.join(" ")).toMatch(/texto longo/);
  });

  it("reprova abertura formal e menção a bot/IA", () => {
    expect(checkAgentText("Prezado Rafael, sou um assistente virtual. Posso mandar?", base).ok).toBe(false);
  });

  it("reprova emoji", () => {
    expect(checkAgentText("Posso te mandar a prévia? 🚀", base).ok).toBe(false);
  });

  it("reprova quantificador que não dá para provar", () => {
    const check = checkAgentText("Sem site, muitos clientes desistem. Posso mandar a prévia?", base);
    expect(check.ok).toBe(false);
    expect(check.issues.join(" ")).toMatch(/quantificador/);
  });

  it("reprova abordagem sem pergunta", () => {
    const check = checkAgentText("A Pianca tem 5★ no Google e ainda não tem site próprio.", base);
    expect(check.ok).toBe(false);
    expect(check.issues.join(" ")).toMatch(/sem pergunta/);
  });

  it("reprova saudação repetida quando já cumprimentamos", () => {
    const check = checkAgentText("Oi, Rafael! Montei a prévia, posso mandar?", {
      ...base,
      previousOutbound: ["Olá! Aqui é da Vértice, vi a Pianca no Google."],
      kind: "reply",
    });
    expect(check.ok).toBe(false);
    expect(check.issues.join(" ")).toMatch(/saudação repetida/);
  });

  it("reprova mensagem idêntica à anterior", () => {
    const text = "Montei a prévia da primeira tela, posso mandar?";
    expect(checkAgentText(text, { ...base, previousOutbound: [text] }).ok).toBe(false);
  });

  it("resposta não exige pergunta", () => {
    expect(checkAgentText("Perfeito, obrigado pelo retorno.", { ...base, kind: "reply" }).ok).toBe(true);
  });
});

describe("fallback determinístico (quando a IA cai)", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("abordagem cita um fato, a perda e termina em pergunta, sem preço", () => {
    const briefing = buildLeadBriefing(seed("lead-fb-1"));
    const text = fallbackApproachMessage(briefing);
    expect(text).toContain("?");
    expect(text).toMatch(/Pianca/i);
    expect(extractPrices(text)).toEqual([]);
  });

  it("segundo toque fala da prévia; terceiro encerra sem pressão", () => {
    const briefing = buildLeadBriefing(seed("lead-fb-2"));
    expect(fallbackApproachMessage(briefing, "prova")).toMatch(/prévia/i);
    const exit = fallbackApproachMessage(briefing, "prazo");
    expect(exit).toMatch(/encerre|encerrar/);
    expect(exit).not.toMatch(/sexta|hoje ou amanhã/);
  });

  it("pergunta de preço recebe o valor do pacote mais barato", () => {
    const briefing = buildLeadBriefing(seed("lead-fb-3"));
    const reply = fallbackReplyMessage(briefing, "Quanto custa?");
    expect(reply).toContain("R$ 900");
    expect(reply).toMatch(/prévia/i);
  });

  it("recusa recebe uma despedida, não uma tentativa de reversão", () => {
    const briefing = buildLeadBriefing(seed("lead-fb-4"));
    const reply = fallbackReplyMessage(briefing, "não tenho interesse");
    expect(reply).toMatch(/não envio mais/i);
  });
});

describe("dossiê do lead", () => {
  it("usa fatos verificados e proíbe citar o ticket interno do CRM", () => {
    const lead = seed("lead-br-1", { estimatedValue: "R$ 1.800 - R$ 3.500" });
    const briefing = buildLeadBriefing(lead);
    expect(briefing.facts.join(" ")).toMatch(/5★/);
    expect(briefing.facts.join(" ")).toMatch(/47 avaliações/);
    expect(briefing.forbidden.join(" ")).toMatch(/Ticket/i);
    expect(briefing.prompt).toContain("R$ 900");
    expect(briefing.prompt).not.toContain("R$ 1.800 - R$ 3.500");
  });

  it("objetivo é primeiro contato quando nunca houve abordagem", () => {
    const briefing = buildLeadBriefing(seed("lead-br-2"));
    expect(briefing.objective).toBe("primeiro_contato");
  });

  it("objetivo vira 'responder' quando a última mensagem é do lead", () => {
    const lead = seed("lead-br-3", { contactAttempts: 1, lastContactAt: new Date().toISOString() });
    recordCommunication({ leadId: lead.id, channel: "whatsapp", direction: "inbound", message: "pode mandar a prévia" });
    const briefing = buildLeadBriefing(lead);
    expect(briefing.objective).toBe("responder");
    expect(briefing.history.at(-1)?.direction).toBe("inbound");
  });

  it("nome em CAIXA ALTA do Google é apresentado em caixa normal", () => {
    const briefing = buildLeadBriefing(seed("lead-br-4"));
    expect(briefing.displayName).toBe("Pianca Barbearia");
  });

  it("histórico de envios falhados não entra no dossiê", () => {
    const lead = seed("lead-br-5");
    recordCommunication({ leadId: lead.id, channel: "whatsapp", direction: "outbound", status: "failed", message: "não saiu" });
    const briefing = buildLeadBriefing(lead);
    expect(briefing.history).toHaveLength(0);
  });
});

describe("composição sem IA disponível", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("abordagem degrada para o texto determinístico", async () => {
    const lead = seed("lead-cp-1");
    const composed = await composeApproachMessage(lead);
    expect(composed.source).toBe("template");
    expect(composed.message).toContain("?");
  });

  it("resposta degrada para o texto determinístico", async () => {
    const lead = seed("lead-cp-2");
    const composed = await composeReplyMessage(lead, "quanto fica?");
    expect(composed.source).toBe("template");
    expect(composed.message).toContain("R$ 900");
  });
});
