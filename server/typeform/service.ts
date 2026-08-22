import { getTypeformConfig } from "../config";
import {
  getProjects,
  getProjectById,
  getProjectsByLead,
  getProjectByTypeformToken,
  getLeadById,
} from "../store/db";
import { updateProject } from "../projects/service";

/* ------------------------------------------------------------------ */
/*  Tipos (espelham o payload da Responses API do Typeform)            */
/* ------------------------------------------------------------------ */

export interface TypeformAnswer {
  field: { id: string; type: string; ref: string; title: string };
  type: string;
  text?: string;
  email?: string;
  url?: string;
  number?: number;
  boolean?: boolean;
  date?: string;
  choice?: { label: string };
  choices?: { labels: string[] };
  file_url?: string;
}

export interface TypeformResponse {
  response_id: string;
  submitted_at: string;
  hidden?: Record<string, string>;
  answers?: TypeformAnswer[];
  landed_at?: string;
  metadata?: { user_agent?: string; platform?: string };
}

export interface TypeformListResponse {
  total_items: number;
  page_count: number;
  items: TypeformResponse[];
}

export interface ParsedTypeformAnswer {
  fieldId: string;
  fieldTitle: string;
  fieldType: string;
  answer: string;
}

/** Mapa id/ref → título legível da pergunta (vindo da definição do formulário). */
export type TypeformTitleMap = Record<string, string>;

export interface ParsedTypeformResponse {
  responseId: string;
  submittedAt: string;
  hidden: Record<string, string>;
  answers: ParsedTypeformAnswer[];
}

export interface TypeformSyncSummary {
  configured: boolean;
  total: number;
  imported: number;
  skipped: number;
  unmatched: number;
  items: Array<{
    responseId: string;
    projectId?: string;
    matched: boolean;
    skipped: boolean;
  }>;
}

/** Resposta crua da Responses API — campo `title` nem sempre vem preenchido. */
export interface TypeformFieldDefinition {
  id: string;
  ref: string;
  title: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface TypeformFormDefinition {
  id: string;
  title?: string;
  fields?: TypeformFieldDefinition[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function answerToString(answer: TypeformAnswer): string {
  switch (answer.type) {
    case "choice":
      return answer.choice?.label ?? "";
    case "choices":
      return (answer.choices?.labels ?? []).join(", ");
    case "email":
      return answer.email ?? "";
    case "url":
      return answer.url ?? "";
    case "file_url":
      return answer.file_url ?? "";
    case "boolean":
      return answer.boolean ? "Sim" : "Não";
    case "number":
      return String(answer.number ?? "");
    case "date":
      return answer.date ?? "";
    case "text":
    default:
      return answer.text ?? "";
  }
}

/* ------------------------------------------------------------------ */
/*  Público                                                           */
/* ------------------------------------------------------------------ */

/**
 * Busca as respostas de um formulário na Responses API do Typeform.
 * Não lança se o serviço estiver desconfigurado — retorna `configured: false`
 * para o chamador decidir (rotas HTTP, MCP etc.).
 */
export async function fetchTypeformResponses(
  formId: string,
  opts: { limit?: number; page?: number; since?: string } = {}
): Promise<{ configured: boolean; data?: TypeformListResponse }> {
  const { accessToken } = getTypeformConfig();
  if (!accessToken) {
    return { configured: false };
  }

  const params = new URLSearchParams();
  params.set("page_size", String(Math.min(Math.max(opts.limit ?? 25, 1), 200)));
  if (opts.page) params.set("page", String(opts.page));
  if (opts.since) params.set("since", opts.since);

  const url = `https://api.typeform.com/forms/${encodeURIComponent(formId)}/responses?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Typeform API respondeu HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`
    );
  }

  const data = (await res.json()) as TypeformListResponse;
  return { configured: true, data };
}

/**
 * Busca a definição do formulário para obter os títulos legíveis das perguntas
 * (a Responses API não garante `field.title` — retorna UUIDs no lugar).
 */
export async function fetchTypeformForm(
  formId: string
): Promise<{ configured: boolean; data?: TypeformFormDefinition }> {
  const { accessToken } = getTypeformConfig();
  if (!accessToken) {
    return { configured: false };
  }

  const url = `https://api.typeform.com/forms/${encodeURIComponent(formId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Typeform API (definição) respondeu HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`
    );
  }

  const data = (await res.json()) as TypeformFormDefinition;
  return { configured: true, data };
}

/**
 * Monta um mapa id/ref → título a partir da definição do formulário,
 * incluindo subcampos aninhados (ex.: campos `contact_info`, grupos).
 */
export function buildTitleMap(form?: TypeformFormDefinition): TypeformTitleMap {
  const map: TypeformTitleMap = {};
  const walk = (fields: TypeformFieldDefinition[] | undefined) => {
    for (const field of fields ?? []) {
      if (field.title) {
        map[field.id] = field.title;
        if (field.ref) map[field.ref] = field.title;
      }
      const nested = (field.properties as { fields?: TypeformFieldDefinition[] } | undefined)?.fields;
      walk(nested);
    }
  };
  walk(form?.fields);
  return map;
}

/**
 * Converte uma resposta crua do Typeform em uma lista legível de perguntas/respostas.
 * `titleMap` (opcional) resolve títulos legíveis quando a API não os inclui.
 */
export function parseTypeformResponse(
  raw: TypeformResponse,
  titleMap: TypeformTitleMap = {}
): ParsedTypeformResponse {
  return {
    responseId: raw.response_id,
    submittedAt: raw.submitted_at,
    hidden: raw.hidden ?? {},
    answers: (raw.answers ?? []).map((a) => ({
      fieldId: a.field.id,
      fieldTitle: titleMap[a.field.id] || a.field.title || titleMap[a.field.ref] || a.field.ref,
      fieldType: a.type,
      answer: answerToString(a),
    })),
  };
}

/**
 * Monta o texto do briefing a partir das respostas do formulário.
 */
export function formatBriefingText(parsed: ParsedTypeformResponse): string {
  const lines = parsed.answers.map(
    (a) => `${a.fieldTitle}: ${a.answer || "(sem resposta)"}`
  );
  return [`Briefing via Typeform (${new Date(parsed.submittedAt).toLocaleString("pt-BR")})`, ...lines].join("\n");
}

/**
 * Resolve a qual projeto a resposta pertence.
 * Ordem: hidden `project_id`/`projectId` → hidden `lead_id`/`leadId` →
 * match pelo nome da empresa (resposta/hidden) contra leadName/name do projeto.
 *
 * `onlyProjectId` (opcional) restringe a busca a um único projeto — usado
 * pelo botão "Importar briefing" de um card específico.
 */
export function resolveTargetProject(
  parsed: ParsedTypeformResponse,
  onlyProjectId?: string
): { projectId: string; matchedBy: string } | null {
  const hidden = parsed.hidden;
  const candidates: Array<{ projectId: string; matchedBy: string }> = [];

  // 1. Token determinístico por projeto (hidden `project_token`) — prioridade máxima.
  const directToken = hidden.project_token;
  if (directToken) {
    const projectByToken = getProjectByTypeformToken(directToken);
    if (projectByToken) candidates.push({ projectId: projectByToken.id, matchedBy: "project_token" });
  }

  const directProjectId = hidden.project_id || hidden.projectId;
  if (directProjectId && getProjectById(directProjectId)) {
    candidates.push({ projectId: directProjectId, matchedBy: "project_id" });
  }

  const directLeadId = hidden.lead_id || hidden.leadId;
  if (directLeadId) {
    const project = getProjectsByLead(directLeadId).find((p) => !p.archived);
    if (project) candidates.push({ projectId: project.id, matchedBy: "lead_id" });
  }

  const companyName = extractCompanyName(parsed);
  if (companyName) {
    const target = normalizeText(companyName);
    const project = getProjects().find(
      (p) =>
        !p.archived &&
        (normalizeText(p.name).includes(target) ||
          normalizeText(p.leadName || "").includes(target) ||
          target.includes(normalizeText(p.leadName || "")))
    );
    if (project) candidates.push({ projectId: project.id, matchedBy: "nome_da_empresa" });
  }

  if (onlyProjectId) {
    return candidates.find((c) => c.projectId === onlyProjectId) ?? null;
  }
  return candidates[0] ?? null;
}

const COMPANY_HIDDEN_KEYS = [
  "company",
  "company_name",
  "business",
  "business_name",
  "empresa",
  "nome_empresa",
  "lead_name",
  "project_name",
  "nome_do_lead",
];

const COMPANY_FIELD_RE = /empresa|negócio|negocio|marca|brand/i;

/**
 * Extrai um nome de empresa candidato: hidden fields primeiro, depois a
 * primeira pergunta cujo título pareça "empresa/negócio/marca".
 */
export function extractCompanyName(parsed: ParsedTypeformResponse): string | null {
  for (const key of COMPANY_HIDDEN_KEYS) {
    const value = parsed.hidden[key];
    if (value && value.trim()) return value.trim();
  }
  const answer = parsed.answers.find((a) => COMPANY_FIELD_RE.test(a.fieldTitle) && a.answer.trim());
  return answer?.answer.trim() ?? null;
}

const IMPORT_MARKER_PREFIX = "<!-- typeform:";

function markerFor(responseId: string): string {
  return `${IMPORT_MARKER_PREFIX}${responseId} -->`;
}

/**
 * Sincroniza as respostas do formulário de briefing nos projetos.
 * Idempotente: cada resposta é importada uma única vez (marcador gravado no `brief`).
 */
export async function syncTypeformBriefing(
  opts: { formId?: string; limit?: number; projectId?: string; since?: string } = {}
): Promise<TypeformSyncSummary> {
  const config = getTypeformConfig();
  const formId = opts.formId || config.formId;

  const summary: TypeformSyncSummary = {
    configured: Boolean(config.accessToken),
    total: 0,
    imported: 0,
    skipped: 0,
    unmatched: 0,
    items: [],
  };

  if (!config.accessToken) {
    throw new Error(
      "Typeform não configurado. Defina TYPEFORM_ACCESS_TOKEN no .env."
    );
  }
  if (!formId) {
    throw new Error("formId é obrigatório (env TYPEFORM_FORM_ID ou parâmetro).");
  }

  const { data } = await fetchTypeformResponses(formId, { limit: opts.limit, since: opts.since });
  if (!data) return summary;

  // Títulos legíveis das perguntas (a Responses API pode devolver UUIDs).
  const { data: formDefinition } = await fetchTypeformForm(formId);
  const titleMap = buildTitleMap(formDefinition);

  summary.total = data.items.length;

  for (const raw of data.items) {
    const parsed = parseTypeformResponse(raw, titleMap);
    const target = resolveTargetProject(parsed, opts.projectId);

    if (!target) {
      summary.unmatched++;
      summary.items.push({ responseId: parsed.responseId, matched: false, skipped: false });
      continue;
    }

    const project = getProjectById(target.projectId);
    if (!project) {
      summary.unmatched++;
      summary.items.push({ responseId: parsed.responseId, matched: false, skipped: false });
      continue;
    }

    if (project.brief?.includes(markerFor(parsed.responseId))) {
      summary.skipped++;
      summary.items.push({ responseId: parsed.responseId, projectId: project.id, matched: true, skipped: true });
      continue;
    }

    const block = `${formatBriefingText(parsed)}\n\n${markerFor(parsed.responseId)}`;
    const brief = project.brief?.trim() ? `${project.brief.trim()}\n\n${block}` : block;
    const newFields = parsed.answers.map((a) => ({ fieldTitle: a.fieldTitle, answer: a.answer }));
    const briefing = [...(project.briefing || []), ...newFields];
    updateProject(project.id, { brief, briefing });

    summary.imported++;
    summary.items.push({ responseId: parsed.responseId, projectId: project.id, matched: true, skipped: false });
  }

  return summary;
}

/**
 * Lista respostas já importadas e os projetos correspondentes (para auditoria).
 */
export function listImportedBriefings(): Array<{ projectId: string; responseId: string; brief: string }> {
  const result: Array<{ projectId: string; responseId: string; brief: string }> = [];
  for (const project of getProjects()) {
    const brief = project.brief || "";
    const markers = brief.match(new RegExp(`${IMPORT_MARKER_PREFIX}([a-zA-Z0-9_]+) -->`, "g")) || [];
    for (const marker of markers) {
      const responseId = marker.replace(IMPORT_MARKER_PREFIX, "").replace(" -->", "");
      result.push({ projectId: project.id, responseId, brief });
    }
  }
  return result;
}

/**
 * Busca o lead vinculado a uma resposta do Typeform (para conferência manual).
 */
export function getLeadByTypeformResponse(parsed: ParsedTypeformResponse): ReturnType<typeof getLeadById> | null {
  const hiddenLeadId = parsed.hidden.lead_id || parsed.hidden.leadId;
  if (hiddenLeadId) return getLeadById(hiddenLeadId) ?? null;

  const target = resolveTargetProject(parsed);
  if (target) {
    const project = getProjectById(target.projectId);
    if (project) return getLeadById(project.leadId) ?? null;
  }
  return null;
}