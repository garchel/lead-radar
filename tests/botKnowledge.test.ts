import { describe, expect, it } from "vitest";
import {
  chunkText,
  cosineSimilarity,
  decideAnswer,
  formatOwnerEscalation,
  HOLDING_MESSAGE,
} from "../server/services/botKnowledgeService";

describe("fatiamento da base de conhecimento", () => {
  it("texto curto vira um único trecho", () => {
    const t = "Horário: seg a sex, 9h às 20h.";
    expect(chunkText(t)).toEqual([t]);
  });

  it("respeita o tamanho máximo por trecho", () => {
    const texto = Array.from({ length: 30 }, (_, i) => `Parágrafo ${i} com um conteúdo de teste.`).join("\n\n");
    const chunks = chunkText(texto, 200, 40);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(260);
  });

  it("não perde conteúdo: todos os parágrafos aparecem em algum trecho", () => {
    const paragrafos = Array.from({ length: 12 }, (_, i) => `Informação numero ${i} do cliente.`);
    const chunks = chunkText(paragrafos.join("\n\n"), 150, 30).join(" ");
    for (const p of paragrafos) expect(chunks).toContain(p);
  });

  it("texto vazio não gera trecho", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("quebra parágrafo gigante por frase em vez de estourar", () => {
    const frase = "Esta é uma frase de tamanho médio usada para testar o fatiador. ";
    const chunks = chunkText(frase.repeat(20), 300, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 360)).toBe(true);
  });
});

describe("similaridade", () => {
  it("vetores iguais dão 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it("vetores opostos dão -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });
  it("vetor nulo não explode", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("decisão de responder ou chamar o dono", () => {
  it("pergunta fora da base escala mesmo com resposta", () => {
    expect(decideAnswer({ answer: "Custa R$ 45", topScore: 0.3, minScore: 0.5 }).escalated).toBe(true);
  });

  it("modelo dizendo NAO_SEI escala", () => {
    const d = decideAnswer({ answer: "NAO_SEI", topScore: 0.8, minScore: 0.5 });
    expect(d.escalated).toBe(true);
    expect(d.reason).toBe("ia_sem_resposta");
  });

  it("NAO_SEI em minúscula e com texto extra também escala", () => {
    expect(decideAnswer({ answer: "nao_sei, não tenho essa informação", topScore: 0.8, minScore: 0.5 }).escalated).toBe(true);
  });

  it("resposta com base passa", () => {
    const d = decideAnswer({ answer: "O corte custa R$ 45.", topScore: 0.78, minScore: 0.5 });
    expect(d.escalated).toBe(false);
    expect(d.reason).toBeNull();
  });

  it("resposta em branco escala", () => {
    expect(decideAnswer({ answer: "   ", topScore: 0.9, minScore: 0.5 }).escalated).toBe(true);
  });
});

describe("mensagem para o dono", () => {
  const msg = formatOwnerEscalation({
    clientName: "Barbearia Navalha de Ouro",
    question: "Aceita vale-refeição?",
    customerName: "João",
    reason: "sem_base",
  });

  it("diz quem perguntou e reproduz a pergunta", () => {
    expect(msg).toContain("*João*");
    expect(msg).toContain("Aceita vale-refeição?");
  });

  it("explica o motivo e o que fazer", () => {
    expect(msg).toContain("não está na base");
    expect(msg).toContain("Me responde aqui");
  });

  it("não usa travessão", () => {
    expect(msg).not.toMatch(/[\u2014\u2013]/);
  });

  it("sem nome do cliente, ainda faz sentido", () => {
    const semNome = formatOwnerEscalation({ clientName: "Barbearia", question: "Tem vaga hoje?" });
    expect(semNome).toContain("Um cliente");
    expect(semNome).not.toContain("**");
  });
});

describe("aviso ao cliente quando precisa confirmar", () => {
  it("não deixa o cliente sem resposta e não promete mentira", () => {
    expect(HOLDING_MESSAGE).toMatch(/confirmar/i);
    expect(HOLDING_MESSAGE).not.toMatch(/[\u2014\u2013]/);
    expect(HOLDING_MESSAGE.length).toBeLessThan(150);
  });
});
