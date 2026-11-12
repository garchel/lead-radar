import { describe, expect, it } from "vitest";
import {
  bold,
  formatPrice,
  freePreviewLine,
  packageLines,
  packagesInviteLine,
  stripAiDashes,
  whatsAppify,
} from "../server/services/messageStyle";
import { buildProspectMessage } from "../server/services/autoProspectingService";
import { DEFAULT_POLICY } from "../server/services/commercialPolicy";

/**
 * Estilo das mensagens: o feedback do Paulo (nov/2026) virou contrato.
 *   1. quebra de linha em blocos curtos
 *   2. nunca travessão (marca de IA)
 *   3. prévia grátis explícita
 *   4. pacotes com o que cada um inclui
 *   5. negrito e emoji com moderação
 */

describe("stripAiDashes", () => {
  it("troca travessão por vírgula no meio da frase", () => {
    expect(stripAiDashes("sem site próprio — dá pra resolver")).toBe("sem site próprio, dá pra resolver");
  });

  it("troca travessão por ponto quando inicia nova oração", () => {
    expect(stripAiDashes("fica pronto rápido — Quer ver a prévia?")).toBe("fica pronto rápido. Quer ver a prévia?");
  });

  it("não deixa sobra nem pontuação duplicada", () => {
    const saida = stripAiDashes("A — B – C");
    expect(saida).not.toMatch(/[\u2014\u2013]/);
    expect(saida).not.toMatch(/,\s*,|\.\s*\./);
  });
});

describe("whatsAppify", () => {
  it("quebra bloco longo em linhas curtas", () => {
    const bloco =
      "Olá! Aqui é da Vértice. Vi a sua empresa no Google e reparei que não tem site próprio. " +
      "A gente monta uma página com botão de WhatsApp e formulário de orçamento. Quer ver como fica?";
    const saida = whatsAppify(bloco);
    expect(saida.split("\n").length).toBeGreaterThan(1);
    expect(saida).not.toMatch(/[\u2014\u2013]/);
  });

  it("respeita quem já veio em blocos e mensagem curta", () => {
    const comLinhas = "Linha um.\nLinha dois.";
    expect(whatsAppify(comLinhas)).toBe(comLinhas);
    expect(whatsAppify("Posso mandar?")).toBe("Posso mandar?");
  });

  it("é idempotente", () => {
    const texto = "Oi — tudo bem? A prévia é grátis. Quer ver?";
    const uma = whatsAppify(texto);
    expect(whatsAppify(uma)).toBe(uma);
  });
});

describe("pacotes e prévia", () => {
  it("lista todos os pacotes da política com nome e valor", () => {
    const linhas = packageLines(DEFAULT_POLICY).join("\n");
    for (const pack of DEFAULT_POLICY.packages) {
      expect(linhas).toContain(pack.name);
      expect(linhas).toContain(formatPrice(pack.price));
    }
  });

  it("no modo detalhado mostra itens do que está incluído", () => {
    const detalhado = packageLines(DEFAULT_POLICY, { detailed: true }).join("\n");
    expect(detalhado).toContain("•");
    expect(detalhado.split("\n").length).toBeGreaterThan(packageLines(DEFAULT_POLICY).length);
  });

  it("a prévia gratuita é dita sem custo", () => {
    const linha = freePreviewLine(DEFAULT_POLICY);
    expect(linha).toMatch(/gr[áa]tis/i);
    expect(linha).toMatch(/sem custo/i);
  });

  it("formata preço sem centavos", () => {
    expect(formatPrice(899)).toBe("R$ 899");
    expect(formatPrice(1199)).toBe("R$ 1.199");
  });

  it("os pacotes da política terminam em 99", () => {
    for (const pack of DEFAULT_POLICY.packages) {
      expect(String(pack.price).endsWith("99")).toBe(true);
    }
  });

  it("o convite aos pacotes só cita os nomes, sem preço", () => {
    const convite = packagesInviteLine(DEFAULT_POLICY);
    for (const pack of DEFAULT_POLICY.packages) expect(convite).toContain(pack.name);
    expect(convite).not.toMatch(/R\$/);
    expect(convite).toMatch(/Quer ver\?/);
  });
});

describe("buildProspectMessage (D0)", () => {
  const lead = {
    id: "l1",
    name: "PIANCA BARBEARIA",
    city: "Linhares",
    state: "ES",
    rating: 5,
    reviewsCount: 235,
    websiteStatus: "none",
    pipelineStatus: "prospect",
  } as any;

  const msg = buildProspectMessage(lead);

  it("usa blocos curtos em vez de um parágrafo", () => {
    expect(msg.split("\n").filter(Boolean).length).toBeGreaterThanOrEqual(4);
  });

  it("não usa travessão", () => {
    expect(msg).not.toMatch(/[\u2014\u2013]/);
  });

  it("diz que a prévia é grátis e sem custo", () => {
    expect(msg).toMatch(/gr[áa]tis/i);
    expect(msg).toMatch(/sem custo/i);
  });

  it("NÃO fala de pacote nem de preço no primeiro contato", () => {
    for (const pack of DEFAULT_POLICY.packages) {
      expect(msg).not.toContain(pack.name);
      expect(msg).not.toContain(formatPrice(pack.price));
    }
    expect(msg).not.toMatch(/R\$/);
  });

  it("promete a prévia grátis e termina com convite leve", () => {
    expect(msg).toMatch(/prepare|preparar|monto/i);
    expect(msg.trim().endsWith("?")).toBe(true);
  });

  it("usa negrito no nome do negócio e pelo menos um emoji", () => {
    expect(msg).toContain(`*${"Pianca Barbearia"}*`);
    expect(/[\u{1F300}-\u{1FAFF}\u{2B50}]/u.test(msg)).toBe(true);
  });

  it("pitch da IA passa pelo mesmo estilo", () => {
    const comPitch = buildProspectMessage({
      ...lead,
      analysis: { customPitchWhatsApp: "Oi! Sua barbearia não tem site — a prévia é grátis. Quer ver?" },
    } as any);
    expect(comPitch).not.toMatch(/[\u2014\u2013]/);
    expect(comPitch.startsWith("Oi!")).toBe(true);
  });
});

describe("bold", () => {
  it("aplica negrito do WhatsApp sem duplicar asteriscos", () => {
    expect(bold("Pianca")).toBe("*Pianca*");
    expect(bold("*Pianca*")).toBe("*Pianca*");
  });
});
