import { getProjectById, getLeadById } from "../store/db";
import { Project, ProjectBriefingField, ProjectType, StoredLead } from "../store/types";
import { updateProject } from "./service";

/* ------------------------------------------------------------------ */
/*  "Kit de dados" + prompt para o Agente de IA de código (GitHub).   */
/*                                                                    */
/*  Decisão do planejamento (docs/PLANEJAMENTO_SITE_AGENTE_IA.md):        */
/*  o app NÃO gera mais um template de HTML pronto. Ele prepara um    */
/*  "kit de dados" (lead + briefing/Typeform + copy + design + dev),  */
/*  e entrega ao agente de IA (Hermes/Gemini) de duas formas:         */
/*   1. prompt otimizado (modo manual, copiar-e-colar);               */
/*   2. tool MCP (modo agente, acesso programático).                  */
/*  As duas formas compartilham o MESMO kit (seção 3.1 do doc).       */
/* ------------------------------------------------------------------ */

export const DEV_STATUS_LABELS: Record<string, string> = {
  aguardando_agente: "Aguardando o agente",
  em_desenvolvimento: "Em desenvolvimento (agente codando)",
  codigo_entregue: "Código entregue — aguardando revisão humana",
  aprovado: "Código aprovado pelo humano",
};

/** Valida se um status de desenvolvimento é legítimo. */
export function isDevStatus(value: unknown): value is Project["devStatus"] {
  return (
    typeof value === "string" &&
    ["aguardando_agente", "em_desenvolvimento", "codigo_entregue", "aprovado"].includes(value)
  );
}

/**
 * Extrai { owner, name } de uma URL de repositório GitHub em vários formatos:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 *   git+ssh://git@github.com/owner/repo.git
 * Retorna null quando não consegue interpretar.
 */
export function parseRepoUrl(url: string): { owner: string; name: string } | null {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;

  // URLs http(s): extrai os dois últimos segmentos do path (owner/name).
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const pathSegments = new URL(trimmed).pathname.split("/").filter(Boolean);
      if (pathSegments.length < 2) return null;
      const name = pathSegments[pathSegments.length - 1].replace(/\.git$/, "");
      const owner = pathSegments[pathSegments.length - 2];
      if (!owner || !name) return null;
      return { owner, name };
    } catch {
      return null;
    }
  }

  // Formato ssh / scp-like: git@github.com:owner/name ou owner/name
  const match =
    trimmed.match(/[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?[/]?$/) ??
    trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)$/);

  if (!match) return null;
  const owner = match[1];
  const name = match[2];
  if (!owner || !name) return null;
  return { owner, name };
}

/** Nome "amigável" do tipo de projeto. */
function typeLabel(type?: ProjectType, kind: string = "projeto"): string {
  if (type === "site_institucional") return "Site Institucional";
  if (type === "landing_page") return "Landing Page";
  return kind;
}

function pickBriefing(project: Project): ProjectBriefingField[] {
  return Array.isArray(project.briefing) ? project.briefing : [];
}
/**
 * Monta o "kit de dados" do projeto: todas as informações relevantes do
 * cliente adquiridas nas etapas anteriores (§3.1 do doc). É a única fonte
 * usada tanto pelo prompt manual quanto pela tool MCP.
 */
export function buildProjectDevKit(projectId: string): {
  project: Project;
  lead?: StoredLead;
  typeLabel: string;
  briefing: ProjectBriefingField[];
  landingPageConcept: any;
  repo?: { owner: string; name: string; url: string };
} {
  const project = getProjectById(projectId);
  if (!project) throw new Error("Projeto não encontrado.");

  const lead = project.leadId ? getLeadById(project.leadId) : undefined;
  const briefing = pickBriefing(project);
  const landingPageConcept = lead?.analysis?.landingPageConcept;

  return {
    project,
    lead,
    typeLabel: typeLabel(project.type),
    briefing,
    landingPageConcept,
    repo: project.githubRepoUrl
      ? { owner: project.repoOwner || "", name: project.repoName || "", url: project.githubRepoUrl }
      : undefined,
  };
}

/** Formata um campo de briefing em item legível. */
function briefingLines(items: ProjectBriefingField[]): string {
  if (!items.length) return "  (nenhum briefing preenchido ainda)";
  return items.map((b) => `- ${b.fieldTitle}: ${b.answer}`).join("\n");
}
/**
 * Gera o prompt "pronto para colar" que orienta o agente de IA de código a
 * implementar a Landing Page do zero no GitHub (modo manual, §3).
 */
export function buildProjectDevPrompt(projectId: string): string {
  const kit = buildProjectDevKit(projectId);
  const { project, lead, typeLabel, briefing } = kit;

  const businessName = lead?.name || project.leadName || project.name;
  const city = lead?.city || project.leadCity;
  const state = lead?.state || "";
  const category = lead?.category || project.leadCategory;
  const phoneRaw = String(lead?.phone || "").replace(/\D/g, "");
  const whatsapp = phoneRaw.length >= 10 ? `https://wa.me/${phoneRaw.startsWith("55") ? phoneRaw : `55${phoneRaw}`}` : "(sem telefone cadastrado)";
  const instagram = lead?.instagramHandle ? `@${lead.instagramHandle}` : "(sem Instagram cadastrado)";
  const website = lead?.websiteUrl ? lead.websiteUrl : "(sem site atual)";
  const rating = lead?.rating ? `${lead.rating}★ (${lead.reviewsCount || 0} avaliações no Google)` : "(sem avaliações)";
  const insights = Array.isArray(lead?.keyInsights) && lead!.keyInsights!.length
    ? lead!.keyInsights!.map((k) => `- ${k}`).join("\n")
    : "  (sem insights armazenados)";

  const copy = (project.copy || "").trim() ? project.copy : "  (etapa copywriting ainda sem conteúdo)";
  const design = (project.designNotes || "").trim() ? project.designNotes : "  (etapa design ainda sem anotações)";
  const dev = (project.devNotes || "").trim() ? project.devNotes : "  (sem notas de desenvolvimento)";

  const concept = kit.landingPageConcept
    ? [
        `- Título (H1): ${kit.landingPageConcept.heroHeadline || "-"}`,
        `- Subtítulo: ${kit.landingPageConcept.heroSubheadline || "-"}`,
        `- CTA principal: ${kit.landingPageConcept.callToAction || "-"}`,
        `- Seções sugeridas: ${(kit.landingPageConcept.recommendedSections || []).join(", ") || "-"}`,
        `- Paleta sugerida: ${kit.landingPageConcept.suggestedColorPalette || "-"}`,
        `- Pontos de venda: ${(kit.landingPageConcept.keySellingPoints || []).map((p) => `"${p}"`).join("; ") || "-"}`,
      ].join("\n")
    : "  (nenhum conceito estruturado da análise de IA armazenado)";

  return `Você é um desenvolvedor front-end sênior. Implemente do zero, em um novo repositório no GitHub, um site funcional e profissional para o negócio abaixo. NÃO use template pronto: construa HTML/CSS/JS (ou o stack que julgar melhor) realmente sob medida para este cliente.

# CONTEXTO DO PROJETO
- Tipo: ${typeLabel}
- Nome do projeto: ${project.name}

# DADOS DO NEGÓCIO (da prospecção)
- Nome: ${businessName}
- Categoria: ${category || "-"}
- Cidade/UF: ${[city, state].filter(Boolean).join(" / ") || "-"}
- Avaliações: ${rating}
- Instagram: ${instagram}
- Site atual: ${website}
- WhatsApp/CTA: ${whatsapp}
- Insights registrados:
${insights}

# BRIEFING DO CLIENTE (Typeform)
${briefingLines(briefing)}

# COPY (etapa copywriting)
${copy}

# DESIGN (etapa design)
${design}

# CONCEITO DA ANÁLISE DE IA (referência — adapte se os campos acima divergirem)
${concept}

# NOTAS DE DESENVOLVIMENTO
${dev}

# REQUISITOS
1. Crie o repositório, implemente o site e faça push/commit das mudanças.
2. Siga as seções e a estrutura definidas no briefing/copy: hero com CTA claro em WhatsApp, benefícios, prova social, formulário, FAQ, footer.
3. Aplique a paleta/identidade do briefing/design. Responsivo (mobile-first), acessível e performático.
4. O formulário deve validar e dar feedback de erro/sucesso; integre o CTA ao WhatsApp sempre que possível.
5. Prepare o deploy/preview (ex.: GitHub Pages) e avise quando o código estiver pronto, informando a URL do repositório e o preview.

Ao concluir, use a tool "submit_project_code" informando projectId, repoUrl, previewUrl e uma mensagem de resumo. Não invente dados que não estejam neste kit.`;
}
/** Registra o repositório GitHub do projeto (etapa desenvolvimento). */
export function setProjectDevRepo(id: string, repoUrl: string): Project {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error(
      "URL de repositório inválida. Use o formato https://github.com/owner/repo (ou git@git... )."
    );
  }
  return updateProject(id, {
    githubRepoUrl: repoUrl.trim(),
    repoOwner: parsed.owner,
    repoName: parsed.name,
    devStatus: "em_desenvolvimento",
  });
}

/**
 * Registra que o agente entregou o código (submit_project_code). Marca como
 * "codigo_entregue" e guarda o preview. A decisão final (avançar p/ revisão/deploy)
 * permanece com o ser humano.
 */
export function submitProjectCode(
  id: string,
  input: { repoUrl?: string; previewUrl?: string; message?: string }
): Project {
  const patch: Record<string, unknown> = {
    devStatus: "codigo_entregue",
    devMessage: input.message?.trim() || undefined,
  };
  if (input.repoUrl?.trim()) {
    const parsed = parseRepoUrl(input.repoUrl);
    if (!parsed) {
      throw new Error(
        "URL de repositório inválida. Use o formato https://github.com/owner/repo (ou git@git... )."
      );
    }
    patch.githubRepoUrl = input.repoUrl.trim();
    patch.repoOwner = parsed.owner;
    patch.repoName = parsed.name;
  }
  if (input.previewUrl?.trim()) {
    patch.previewUrl = input.previewUrl.trim();
  }
  return updateProject(id, patch);
}

/** Grava uma notificação/mensagem do agente (sem mudar o status). */
export function updateProjectDevMessage(id: string, message: string): Project {
  if (!message?.trim()) throw new Error("Mensagem vazia.");
  return updateProject(id, { devMessage: message.trim() });
}

/** Marca o código como aprovado pelo ser humano (guarda-limite). */
export function approveProjectCode(id: string): Project {
  return updateProject(id, { devStatus: "aprovado" });
}

/** Redefine a etapa desenvolvimento para o início (novo ciclo com agente). */
export function resetProjectDev(id: string): Project {
  return updateProject(id, {
    devStatus: "aguardando_agente",
    devMessage: undefined,
    previewUrl: undefined,
  });
}