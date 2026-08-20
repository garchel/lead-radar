import { describe, expect, it } from "vitest";
import {
  generateLandingPageHtml,
  generateSlug,
} from "../server/landingPage/generator";
import type { StoredLead } from "../server/store/types";

const lead: StoredLead = {
  id: "l1",
  name: "Barbearia do João & CIA",
  category: "Barbearia",
  pipelineStatus: "prospect",
  phone: "(11) 98765-4321",
  rating: 4.9,
  reviewsCount: 120,
};

describe("generateSlug", () => {
  it("gera slug a partir de nome com acentos, espaços e símbolos", () => {
    expect(generateSlug("Barbearia do João & CIA")).toBe("barbearia-do-joao-cia");
  });

  it("retorna default seguro para nome vazio", () => {
    expect(generateSlug("")).toBe("landing-page");
  });
});

describe("generateLandingPageHtml", () => {
  const concept = {
    heroHeadline: "Atendimento especializado",
    heroSubheadline: "Conheça os serviços e entre em contato.",
    callToAction: "Falar no WhatsApp",
    recommendedSections: ["Serviços", "Contato"],
    keySellingPoints: ["Experiência informada pela empresa"],
  };

  it("gera HTML completo com o nome escapado e conceito informado", () => {
    const html = generateLandingPageHtml(lead, concept);
    expect(html).toContain("Barbearia do João &amp; CIA");
    expect(html).toContain("Falar no WhatsApp");
    expect(html).toContain(`4.9`);
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("aplica o conceito e escapa conteúdo injetado (XSS)", () => {
    const html = generateLandingPageHtml(lead, {
      heroHeadline: "<script>alert(1)</script>",
      heroSubheadline: "Descrição <b>segura</b>",
      callToAction: 'Agendar "Já" <b>',
      recommendedSections: ["Serviços"],
      keySellingPoints: ["Ponto & Vírgula"],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Agendar &quot;Já&quot;");
    expect(html).toContain("Ponto &amp; Vírgula");
  });

  it("gera link wa.me com DDD completo (55 + número)", () => {
    const html = generateLandingPageHtml(lead, concept);
    expect(html).toContain("https://wa.me/5511987654321");
  });

  it("rejeita conceito incompleto em vez de inventar conteúdo", () => {
    expect(() => generateLandingPageHtml(lead)).toThrow("Conceito inválido");
  });
});