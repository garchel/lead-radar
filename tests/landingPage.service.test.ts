
import { afterEach, describe, expect, it } from "vitest";
import {
  approveLandingPage,
  createLandingPageRecord,
  deployLandingPage,
  rejectLandingPage,
} from "../server/landingPage/service";
import { getLandingPageById, upsertLead } from "../server/store/db";

const lead: any = {
  id: "lp-lead",
  name: "Clínica Saúde & Bem Estar",
  category: "Clínica de Estética",
  phone: "(11) 91234-5678",
  pipelineStatus: "prospect",
};

describe("landingPage/service (ciclo de vida e guardrail)", () => {
  const concept = {
    heroHeadline: "Atendimento especializado",
    heroSubheadline: "Conheça os serviços da empresa.",
    callToAction: "Falar no WhatsApp",
    recommendedSections: ["Serviços", "Contato"],
    keySellingPoints: ["Informação fornecida pelo lead"],
  };

  afterEach(() => {
    delete process.env.NETLIFY_AUTH_TOKEN;
  });

  it("cria a página em rascunho aguardando aprovação, aplicando o conceito", () => {
    upsertLead(lead);
    const lp = createLandingPageRecord(lead, { ...concept, callToAction: "Agendar Agora" });
    expect(lp.status).toBe("aguardando_aprovacao");
    expect(lp.stage).toBe("rascunho");
    expect(lp.html).toContain("Agendar Agora");
  });

  it("aprova a página antes do deploy (estágio deploy / status aprovada)", () => {
    upsertLead(lead);
    const lp = createLandingPageRecord(lead, concept);
    const approved = approveLandingPage(lp.id)!;
    expect(approved.status).toBe("aprovada");
    expect(approved.stage).toBe("deploy");
  });

  it("NÃO publica página não aprovada (guardrail humano antes do deploy)", async () => {
    delete process.env.NETLIFY_AUTH_TOKEN;
    upsertLead(lead);
    const lp = createLandingPageRecord(lead, concept);
    await expect(deployLandingPage(lp.id)).rejects.toThrow("não aprovada");
    expect(getLandingPageById(lp.id)!.status).toBe("aguardando_aprovacao");
  });

  it("depois de aprovada, deploy sem token Netlify falha explicitamente", async () => {
    delete process.env.NETLIFY_AUTH_TOKEN;
    upsertLead(lead);
    const lp = createLandingPageRecord(lead, concept);
    approveLandingPage(lp.id);
    await expect(deployLandingPage(lp.id)).rejects.toThrow("NETLIFY_AUTH_TOKEN");
    expect(getLandingPageById(lp.id)!.status).toBe("aprovada");
  });

  it("rejeita a página", () => {
    upsertLead(lead);
    const lp = createLandingPageRecord(lead, concept);
    const rejected = rejectLandingPage(lp.id)!;
    expect(rejected.status).toBe("rejeitada");
  });
});