import { describe, expect, it, afterEach, beforeEach } from "vitest";
import {
  parseTypeformResponse,
  formatBriefingText,
  extractCompanyName,
  resolveTargetProject,
  syncTypeformBriefing,
  fetchTypeformResponses,
  buildTitleMap,
  type TypeformListResponse,
} from "../server/typeform/service";
import { getTypeformSyncConfig } from "../server/config";
import { createProject } from "../server/projects/service";
import { upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

const FORM_ID = "test-form-abc";

function makeLead(id: string, name: string): StoredLead {
  return {
    id,
    name,
    city: "São Paulo",
    state: "SP",
    websiteStatus: "none",
    pipelineStatus: "negotiating",
  } as StoredLead;
}

function mockResponses(payload: TypeformListResponse) {
  const fetchMock = (): Promise<any> =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(""),
    });
  globalThis.fetch = fetchMock as any;
}

function oneAnswerResponse(overrides: Record<string, any> = {}) {
  return {
    total_items: 1,
    page_count: 1,
    items: [
      {
        response_id: "resp-001",
        submitted_at: "2026-08-20T14:32:00Z",
        hidden: {},
        answers: [
          {
            field: { id: "q1", type: "text", ref: "r1", title: "Nome da empresa" },
            type: "text",
            text: "Clínica Sorriso",
          },
          {
            field: { id: "q2", type: "choice", ref: "r2", title: "Objetivo principal" },
            type: "choice",
            choice: { label: "Gerar mais leads" },
          },
          {
            field: { id: "q3", type: "boolean", ref: "r3", title: "Já tem site?" },
            type: "boolean",
            boolean: false,
          },
        ],
        ...overrides,
      },
    ],
  };
}

describe("typeform / integração de briefing (Responses API)", () => {
  beforeEach(() => {
    process.env.TYPEFORM_ACCESS_TOKEN = "test-token";
    process.env.TYPEFORM_FORM_ID = FORM_ID;
  });

  afterEach(() => {
    delete process.env.TYPEFORM_ACCESS_TOKEN;
    delete process.env.TYPEFORM_FORM_ID;
    globalThis.fetch = undefined as any;
  });

  it("parseTypeformResponse converte respostas cruas em perguntas/respostas legíveis", () => {
    const raw = oneAnswerResponse().items[0];
    const parsed = parseTypeformResponse(raw);

    expect(parsed.responseId).toBe("resp-001");
    expect(parsed.answers).toHaveLength(3);
    expect(parsed.answers[0]).toEqual({
      fieldId: "q1",
      fieldTitle: "Nome da empresa",
      fieldType: "text",
      answer: "Clínica Sorriso",
    });
    expect(parsed.answers[1].answer).toBe("Gerar mais leads");
    expect(parsed.answers[2].answer).toBe("Não");
  });

  it("formatBriefingText monta um bloco de texto com data de envio", () => {
    const parsed = parseTypeformResponse(oneAnswerResponse().items[0]);
    const text = formatBriefingText(parsed);

    expect(text).toContain("Briefing via Typeform");
    expect(text).toContain("Nome da empresa: Clínica Sorriso");
    expect(text).toContain("Já tem site?: Não");
  });

  it("extractCompanyName prioriza hidden fields antes da resposta", () => {
    const hidden = { company: "Loja X" };
    const parsed = parseTypeformResponse(oneAnswerResponse({ hidden }).items[0]);
    expect(extractCompanyName(parsed)).toBe("Loja X");
  });

  it("extractCompanyName cai para a primeira pergunta de empresa/negócio", () => {
    const parsed = parseTypeformResponse(oneAnswerResponse().items[0]);
    expect(extractCompanyName(parsed)).toBe("Clínica Sorriso");
  });

  it("resolveTargetProject casa por hidden project_token (determinístico)", () => {
    const lead = upsertLead(makeLead("tf-lead-token", "Odonto Center Premium"));
    const project = createProject({ leadId: lead.id, name: "LP Odonto" });
    const token = project.typeformToken!;

    const parsed = parseTypeformResponse(
      oneAnswerResponse({ hidden: { project_token: token } }).items[0]
    );
    const target = resolveTargetProject(parsed);
    expect(target?.projectId).toBe(project.id);
    expect(target?.matchedBy).toBe("project_token");
  });

  it("resolveTargetProject casa por hidden project_id", () => {
    upsertLead(makeLead("tf-lead-1", "Clínica Sorriso"));
    const project = createProject({ leadId: "tf-lead-1", name: "LP Sorriso" });

    const parsed = parseTypeformResponse(
      oneAnswerResponse({ hidden: { project_id: project.id } }).items[0]
    );
    const target = resolveTargetProject(parsed);
    expect(target?.projectId).toBe(project.id);
    expect(target?.matchedBy).toBe("project_id");
  });

  it("resolveTargetProject casa pelo nome da empresa sem hidden fields", () => {
    const lead = upsertLead(makeLead("tf-lead-2", "Padaria Trigo Dourado"));
    const project = createProject({ leadId: lead.id, name: "LP Padaria" });

    const parsed = parseTypeformResponse(
      oneAnswerResponse({
        answers: [
          {
            field: { id: "q1", type: "text", ref: "r1", title: "Nome da empresa" },
            type: "text",
            text: "Padaria Trigo Dourado",
          },
        ],
      }).items[0]
    );
    const target = resolveTargetProject(parsed);
    expect(target?.projectId).toBe(project.id);
    expect(target?.matchedBy).toBe("nome_da_empresa");
  });

  it("resolveTargetProject retorna null quando não há correspondência", () => {
    const parsed = parseTypeformResponse(
      oneAnswerResponse({
        hidden: {},
        answers: [
          {
            field: { id: "q1", type: "text", ref: "r1", title: "Nome da empresa" },
            type: "text",
            text: "Empresa Inexistente Ltda",
          },
        ],
      }).items[0]
    );
    expect(resolveTargetProject(parsed)).toBeNull();
  });

  it("resolveTargetProject com onlyProjectId restringe o vínculo ao projeto informado", () => {
    const leadA = upsertLead(makeLead("tf-lead-5", "Clínica Sorriso"));
    const projectA = createProject({ leadId: leadA.id, name: "LP Sorriso" });
    const leadB = upsertLead(makeLead("tf-lead-6", "Padaria Trigo Dourado"));
    const projectB = createProject({ leadId: leadB.id, name: "LP Padaria" });

    // Resposta da Clínica Sorriso — pedir o projeto B não deve vincular.
    const parsed = parseTypeformResponse(oneAnswerResponse().items[0]);
    expect(resolveTargetProject(parsed, projectB.id)).toBeNull();
    expect(resolveTargetProject(parsed, projectA.id)?.projectId).toBe(projectA.id);
  });

  it("syncTypeformBriefing com projectId importa apenas o projeto informado", async () => {
    const lead = upsertLead(makeLead("tf-lead-7", "Clínica Sorriso"));
    const project = createProject({ leadId: lead.id, name: "LP Sorriso" });

    mockResponses(oneAnswerResponse({ hidden: { project_id: project.id } }));
    const summary = await syncTypeformBriefing({ projectId: project.id });
    expect(summary.imported).toBe(1);
    expect(summary.unmatched).toBe(0);
  });

  it("syncTypeformBriefing importa, grava no brief e é idempotente", async () => {
    const lead = upsertLead(makeLead("tf-lead-3", "Clínica OdontoVida"));
    const project = createProject({ leadId: lead.id, name: "LP OdontoVida" });

    mockResponses(oneAnswerResponse({ hidden: { project_id: project.id } }));
    const first = await syncTypeformBriefing();
    expect(first.imported).toBe(1);
    expect(first.unmatched).toBe(0);

    const fromStore = (await import("../server/store/db")).getProjectById(project.id)!;
    expect(fromStore.brief).toContain("Nome da empresa: Clínica Sorriso");
    expect(fromStore.brief).toContain("<!-- typeform:resp-001 -->");
    expect(fromStore.type).toBe("landing_page");
    expect(fromStore.briefing?.length).toBe(3);
    expect(fromStore.briefing?.[0]).toEqual({ fieldTitle: "Nome da empresa", answer: "Clínica Sorriso" });

    // Segunda execução: resposta já importada → pulada, brief inalterado.
    mockResponses(oneAnswerResponse({ hidden: { project_id: project.id } }));
    const second = await syncTypeformBriefing();
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(1);

    const after = (await import("../server/store/db")).getProjectById(project.id)!;
    expect(after.brief).toBe(fromStore.brief);
  });

  it("syncTypeformBriefing registra respostas sem projeto correspondente como unmatched", async () => {
    mockResponses(
      oneAnswerResponse({
        hidden: {},
        answers: [
          {
            field: { id: "q1", type: "text", ref: "r1", title: "Nome da empresa" },
            type: "text",
            text: "Marmoraria Granitos Atemporal",
          },
        ],
      })
    );
    const summary = await syncTypeformBriefing();
    expect(summary.total).toBe(1);
    expect(summary.unmatched).toBe(1);
    expect(summary.imported).toBe(0);
  });

  it("syncTypeformBriefing lança erro claro quando o token não está configurado", async () => {
    delete process.env.TYPEFORM_ACCESS_TOKEN;
    await expect(syncTypeformBriefing()).rejects.toThrow("TYPEFORM_ACCESS_TOKEN");
  });

  it("syncTypeformBriefing aceita formId via parâmetro sem variável de ambiente", async () => {
    delete process.env.TYPEFORM_FORM_ID;
    const lead = upsertLead(makeLead("tf-lead-4", "Studio Pilates Core"));
    const project = createProject({ leadId: lead.id, name: "LP Pilates" });

    mockResponses(oneAnswerResponse({ hidden: { project_id: project.id } }));
    const summary = await syncTypeformBriefing({ formId: FORM_ID });
    expect(summary.imported).toBe(1);
  });

  it("fetchTypeformResponses retorna configured=false sem token", async () => {
    delete process.env.TYPEFORM_ACCESS_TOKEN;
    const result = await fetchTypeformResponses(FORM_ID);
    expect(result.configured).toBe(false);
  });

  it("buildTitleMap inclui subcampos aninhados (contact_info)", () => {
    const map = buildTitleMap({
      id: FORM_ID,
      title: "Briefing",
      fields: [
        {
          id: "f-contact",
          ref: "ref-contact",
          type: "contact_info",
          title: "Contato",
          properties: {
            fields: [
              { id: "sub-email", ref: "ref-email", type: "email", title: "E-mail" },
              { id: "sub-name", ref: "ref-name", type: "short_text", title: "Primeiro nome" },
            ],
          },
        },
      ],
    } as any);
    expect(map["sub-email"]).toBe("E-mail");
    expect(map["ref-name"]).toBe("Primeiro nome");
  });

  it("parseTypeformResponse usa titleMap quando a API não envia field.title", () => {
    const raw = {
      response_id: "resp-x",
      submitted_at: "2026-08-20T14:32:00Z",
      hidden: {},
      answers: [
        {
          field: { id: "sub-email", type: "email", ref: "ref-email", title: "" },
          type: "email",
          email: "x@y.com",
        },
      ],
    } as any;
    const parsed = parseTypeformResponse(raw, { "sub-email": "E-mail" });
    expect(parsed.answers[0].fieldTitle).toBe("E-mail");
    expect(parsed.answers[0].answer).toBe("x@y.com");
  });

  it("getTypeformSyncConfig usa default de 5 min quando env não definido", () => {
    const original = process.env.TYPEFORM_SYNC_INTERVAL_MIN;
    delete process.env.TYPEFORM_SYNC_INTERVAL_MIN;
    try {
      const cfg = getTypeformSyncConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.intervalMinutes).toBe(5);
    } finally {
      if (original !== undefined) process.env.TYPEFORM_SYNC_INTERVAL_MIN = original;
    }
  });

  it("getTypeformSyncConfig desliga com 0 ou valor inválido", () => {
    const original = process.env.TYPEFORM_SYNC_INTERVAL_MIN;
    try {
      process.env.TYPEFORM_SYNC_INTERVAL_MIN = "0";
      expect(getTypeformSyncConfig().enabled).toBe(false);
      process.env.TYPEFORM_SYNC_INTERVAL_MIN = "abc";
      expect(getTypeformSyncConfig().enabled).toBe(false);
    } finally {
      if (original !== undefined) process.env.TYPEFORM_SYNC_INTERVAL_MIN = original;
      else delete process.env.TYPEFORM_SYNC_INTERVAL_MIN;
    }
  });

  it("getTypeformSyncConfig respeita intervalo custom", () => {
    const original = process.env.TYPEFORM_SYNC_INTERVAL_MIN;
    try {
      process.env.TYPEFORM_SYNC_INTERVAL_MIN = "10";
      const cfg = getTypeformSyncConfig();
      expect(cfg.enabled).toBe(true);
      expect(cfg.intervalMinutes).toBe(10);
    } finally {
      if (original !== undefined) process.env.TYPEFORM_SYNC_INTERVAL_MIN = original;
      else delete process.env.TYPEFORM_SYNC_INTERVAL_MIN;
    }
  });
});