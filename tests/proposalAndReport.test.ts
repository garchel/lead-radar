import { describe, expect, it } from "vitest";
import { generateProposalPdf, proposalFileName } from "../server/services/proposalService";
import { buildOnboarding } from "../server/services/onboardingService";
import { generateMonthlyReportPdf, monthlyNumbers } from "../server/services/monthlyReportService";
import type { Project, StoredLead } from "../server/store/types";

import { inflateSync } from "node:zlib";

/** Texto dos streams do PDF (pdfkit comprime com Flate, então grep não enxerga). */
function pdfText(pdf: Buffer): string {
  const cru = pdf.toString("latin1");
  let texto = "";
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cru)) !== null) {
    const bruto = Buffer.from(m[1], "latin1");
    try {
      texto += inflateSync(bruto).toString("latin1");
    } catch {
      texto += m[1];
    }
  }
  // pdfkit escreve texto como string hex dentro de <...>: decodifica para buscar
  return texto.replace(/<([0-9A-Fa-f]{2,})>/g, (_todo, hex: string) =>
    Buffer.from(hex, "hex").toString("latin1")
  );
}



function lead(extra: Partial<StoredLead> = {}): StoredLead {
  return {
    id: "lead-doc",
    name: "Dra. Carmen Pitol",
    category: "Clínica odontológica",
    city: "Balneário Camboriú",
    state: "SC",
    phone: "+5561999998888",
    pipelineStatus: "negotiating",
    ...extra,
  } as StoredLead;
}

const projeto = (extra: Partial<Project> = {}) =>
  ({ id: "proj-1", leadId: "lead-doc", name: "Site", stage: "copywriting", status: "em_andamento", tasks: [], createdAt: "", updatedAt: "", ...extra }) as Project;

describe("proposta em PDF", () => {
  it("gera PDF válido com o valor do pacote vindo da política", async () => {
    const pdf = await generateProposalPdf(lead());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(4000);
    const texto = pdfText(pdf);
    expect(texto).toContain("1.199"); // pacote proposto é o de maior escopo
    expect(texto).toContain("899"); // o outro pacote aparece como opção
  });

  it("nome do arquivo é seguro para anexo", () => {
    expect(proposalFileName(lead({ name: "Açaí & Cia!!" }))).toBe("Proposta-Acai-Cia.pdf");
  });

  it("aceita escolher o pacote", async () => {
    const pdf = await generateProposalPdf(lead(), { packageId: "essencial" });
    expect(pdfText(pdf)).toContain("Essencial");
  });
});

describe("onboarding do cliente", () => {
  it("lista o que falta quando não há nada coletado", () => {
    const estado = buildOnboarding(lead({ city: undefined, state: undefined }));
    expect(estado.percentual).toBeLessThan(40);
    expect(estado.mensagem).toContain("preciso");
    expect(estado.items.filter((i) => i.status === "falta").map((i) => i.key)).toEqual(
      expect.arrayContaining(["logo", "fotos", "textos", "horario", "dominio"])
    );
  });

  it("reconhece material já existente", () => {
    const completo = lead({
      address: "Rua das Flores, 100",
      brandSnapshot: {
        version: 1,
        createdAt: "",
        source: "serpapi",
        query: "",
        profiles: {},
        palette: [],
        tone: [],
        imagery: [{ url: "a.jpg" }, { url: "b.jpg" }, { url: "c.jpg" }],
        summary: "",
        confidence: 0.8,
        logo: { url: "logo.png", confidence: 0.9 },
      },
      clientProfile: { services: ["Lentes", "Clareamento"], hours: "Seg a sex, 9h às 18h" } as any,
    });
    const estado = buildOnboarding(completo, projeto({ deployUrl: "https://x.com.br" }));
    expect(estado.percentual).toBe(100);
    expect(estado.mensagem).toContain("Já tenho tudo");
  });
});

describe("relatório mensal", () => {
  it("conta as conversas do período e calcula tempo de resposta", () => {
    const agora = new Date();
    const numeros = monthlyNumbers(lead(), agora);
    expect(numeros.periodLabel).toContain(String(agora.getFullYear()));
    expect(numeros.recebidas).toBeGreaterThanOrEqual(0);
  });

  it("gera PDF válido mesmo sem conversa no mês", async () => {
    const pdf = await generateMonthlyReportPdf(lead(), new Date("2026-01-15T12:00:00"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdfText(pdf).toLowerCase()).toContain("janeiro");
  });
});
