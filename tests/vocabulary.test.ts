import { describe, expect, it } from "vitest";
import { vocabularioDoNicho, quemDecide } from "../server/services/vocabularyService";
import { renderPreviewHtml } from "../server/services/previewTemplate";
import type { StoredLead } from "../server/store/types";

/**
 * Cada ramo tem a sua palavra para quem é atendido. "Cliente" numa clínica de
 * psicologia soa a varejo e é justamente onde o texto precisa acolher.
 */

describe("vocabulário por nicho", () => {
  it("psicologia e acolhimento falam de pessoa", () => {
    const v = vocabularioDoNicho("Psicólogo", "Rede Amor À Vida Cachoeirinha");
    expect(v.singular).toBe("pessoa");
    expect(quemDecide(v)).toBe("a pessoa decide sem precisar ligar");
  });

  it("odontologia e clínica falam de paciente", () => {
    const v = vocabularioDoNicho("Clínica odontológica");
    expect(v.singular).toBe("paciente");
    expect(quemDecide(v)).toBe("o paciente decide sem precisar ligar");
  });

  it("escola e curso falam de aluno", () => {
    expect(vocabularioDoNicho("Escola de idiomas").singular).toBe("aluno");
  });

  it("barbearia, estética e advocacia continuam com cliente", () => {
    for (const cat of ["Barbearia", "Esteticista", "Serviços jurídicos"]) {
      expect(vocabularioDoNicho(cat).singular).toBe("cliente");
    }
  });

  it("sem categoria cai no padrão da casa", () => {
    expect(vocabularioDoNicho(undefined, undefined).singular).toBe("cliente");
  });
});

describe("a prévia usa a palavra do nicho", () => {
  const lead = (category: string, name: string) =>
    ({
      id: `lead-vocab-${category}`,
      name,
      category,
      city: "Cachoeirinha",
      state: "RS",
      websiteStatus: "none",
      pipelineStatus: "prospect",
    }) as unknown as StoredLead;

  it("clínica de psicologia não chama quem chega de cliente", () => {
    const html = renderPreviewHtml(lead("Psicólogo", "Rede Amor À Vida Cachoeirinha"));
    expect(html).toContain("a pessoa decide sem precisar ligar");
    expect(html).not.toContain("o cliente decide sem precisar ligar");
    expect(html).toContain("das suas pessoas");
  });

  it("barbearia continua dizendo cliente", () => {
    const html = renderPreviewHtml(lead("Barbearia", "Dicore Barbearia"));
    expect(html).toContain("o cliente decide sem precisar ligar");
  });
});
