import {
  getProjects,
  getProjectById,
  getProjectsByLead,
  getLeadById,
  upsertProject,
  deleteProject,
  updateLeadPipelineStatus,
} from "../store/db";
import {
  Project,
  ProjectStage,
  ProjectStatus,
  ProjectPriority,
  ProjectType,
  ProjectTask,
  PipelineStatus,
  StoredLead,
} from "../store/types";
import { buildDefaultTasks } from "./defaultTasks";

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function newTypeformToken(): string {
  return `P-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

const STAGES: ProjectStage[] = [
  "briefing",
  "copywriting",
  "design",
  "wireframe",
  "desenvolvimento",
  "revisao",
  "deploy",
];

export function isProjectStage(value: unknown): value is ProjectStage {
  return typeof value === "string" && (STAGES as string[]).includes(value);
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" &&
    ["em_andamento", "pausado", "cancelado", "concluido"].includes(value)
  );
}

export function isProjectPriority(value: unknown): value is ProjectPriority {
  return typeof value === "string" && ["baixa", "media", "alta"].includes(value);
}

export function isProjectType(value: unknown): value is ProjectType {
  return typeof value === "string" && ["landing_page", "site_institucional"].includes(value);
}

function projectDefaultName(leadName: string, type: ProjectType): string {
  const suffix = type === "site_institucional" ? "Site Institucional" : "Landing Page";
  return `${leadName.trim() || "Projeto"} — ${suffix}`;
}

export function createProject(input: {
  leadId: string;
  name?: string;
  priority?: ProjectPriority;
  dueDate?: string;
  type?: ProjectType;
}): Project {
  const lead = getLeadById(input.leadId);
  if (!lead) throw new Error("Lead não encontrado.");

  const type = input.type && isProjectType(input.type) ? input.type : "landing_page";
  const now = new Date().toISOString();
  const project: Project = {
    id: newId("proj"),
    leadId: lead.id,
    name: input.name?.trim() || projectDefaultName(lead.name, type),
    type,
    typeformToken: newTypeformToken(),
    stage: "briefing",
    status: "em_andamento",
    priority: input.priority && isProjectPriority(input.priority) ? input.priority : "media",
    tasks: buildDefaultTasks(),
    dueDate: input.dueDate || undefined,
    createdAt: now,
    updatedAt: now,
  };

  upsertProject(project);

  // Iniciar desenvolvimento move o lead para a etapa "Em Desenvolvimento".
  if (lead.pipelineStatus !== "closed" && lead.pipelineStatus !== "declined") {
    updateLeadPipelineStatus(lead.id, "em_desenvolvimento");
  }

  return getProjectById(project.id)!;
}

export function updateProject(
  id: string,
  patch: Partial<Project>
): Project {
  const project = getProjectById(id);
  if (!project) throw new Error("Projeto não encontrado.");

  const previousStatus = project.status;
  const updated: Project = { ...project, ...patch, id: project.id, leadId: project.leadId };

  if (updated.stage && !isProjectStage(updated.stage)) {
    throw new Error("Etapa inválida.");
  }
  if (updated.status && !isProjectStatus(updated.status)) {
    throw new Error("Status inválido.");
  }
  if (updated.priority && !isProjectPriority(updated.priority)) {
    throw new Error("Prioridade inválida.");
  }
  if (updated.type && !isProjectType(updated.type)) {
    throw new Error("Tipo de projeto inválido.");
  }
  if (updated.briefing && !Array.isArray(updated.briefing)) {
    throw new Error("Briefing inválido.");
  }
  if (updated.tasks && !Array.isArray(updated.tasks)) {
    throw new Error("Lista de tarefas inválida.");
  }
  if (updated.tasks) {
    for (const task of updated.tasks) {
      if (!task || typeof task.title !== "string" || typeof task.done !== "boolean" || !isProjectStage(task.stage)) {
        throw new Error("Tarefa inválida.");
      }
    }
  }

  if (updated.status === "concluido" && !updated.completedAt) {
    updated.completedAt = new Date().toISOString();
  }
  if (updated.status !== "concluido") {
    updated.completedAt = undefined;
  }

  updated.updatedAt = new Date().toISOString();
  upsertProject(updated);

  // Sincroniza o pipeline do lead com o estado do projeto.
  const lead = getLeadById(project.leadId);
  if (lead && lead.pipelineStatus !== "declined") {
    if (updated.status === "concluido" && previousStatus !== "concluido") {
      updateLeadPipelineStatus(lead.id, "closed");
    } else if (previousStatus === "concluido" && updated.status !== "concluido") {
      updateLeadPipelineStatus(lead.id, "em_desenvolvimento");
    } else if (updated.status === "em_andamento" && lead.pipelineStatus === "prospect") {
      updateLeadPipelineStatus(lead.id, "em_desenvolvimento");
    }
  }

  return getProjectById(id)!;
}

export function advanceProjectStage(id: string, stage: ProjectStage): Project {
  return updateProject(id, { stage });
}

export function concludeProject(id: string): Project {
  return updateProject(id, { status: "concluido" });
}

/**
 * Garante que o projeto tenha um token de briefing do Typeform (gera se ausente,
 * ex.: projetos criados antes desta feature) e retorna o token.
 */
export function ensureProjectTypeformToken(id: string): string {
  const project = getProjectById(id);
  if (!project) throw new Error("Projeto não encontrado.");
  if (project.typeformToken) return project.typeformToken;

  const token = newTypeformToken();
  upsertProject({ ...project, typeformToken: token, updatedAt: new Date().toISOString() });
  return token;
}

export function removeProject(id: string): void {
  const project = getProjectById(id);
  if (!project) return;

  deleteProject(id);

  const lead = getLeadById(project.leadId);
  if (lead && lead.pipelineStatus === "em_desenvolvimento") {
    updateLeadPipelineStatus(lead.id, "negotiating");
  }
}

export function getProjectBoard(): Project[] {
  return getProjects();
}

export type LeadProjectSyncAction =
  | "created"
  | "restored"
  | "reopened"
  | "archived"
  | "concluded"
  | "none";

/**
 * Mantém o Kanban de Projetos em sincronia com o pipeline do lead:
 * - Em Desenvolvimento → cria o card (ou restaura o arquivado, idêntico ao estado anterior);
 * - Finalizado (closed)  → conclui o card (restaura e conclui se estava arquivado);
 * - Qualquer outro estágio → arquiva o card ativo (removido do kanban sem perda).
 */
export function syncLeadProject(
  lead: StoredLead,
  opts: { projectType?: ProjectType } = {}
): LeadProjectSyncAction {
  const all = getProjectsByLead(lead.id);
  const active = all.find((p) => !p.archived);
  const archivedProjects = all
    .filter((p) => p.archived)
    .sort((a, b) => (b.archivedAt || "").localeCompare(a.archivedAt || ""));
  const latestArchived = archivedProjects[0];
  const now = new Date().toISOString();

  switch (lead.pipelineStatus) {
    case "em_desenvolvimento": {
      if (active) {
        if (active.status === "concluido") {
          upsertProject({ ...active, status: "em_andamento", completedAt: undefined, updatedAt: now });
          return "reopened";
        }
        return "none";
      }
      if (latestArchived) {
        upsertProject({ ...latestArchived, archived: false, archivedAt: undefined, updatedAt: now });
        return "restored";
      }
      const type = opts.projectType && isProjectType(opts.projectType) ? opts.projectType : "landing_page";
      const project: Project = {
        id: newId("proj"),
        leadId: lead.id,
        name: projectDefaultName(lead.name || "Projeto", type),
        type,
        typeformToken: newTypeformToken(),
        stage: "briefing",
        status: "em_andamento",
        priority: "media",
        tasks: buildDefaultTasks(),
        createdAt: now,
        updatedAt: now,
      };
      upsertProject(project);
      return "created";
    }
    case "closed": {
      const target =
        active ??
        (latestArchived && latestArchived.status !== "concluido" ? latestArchived : undefined);
      if (target && target.status !== "concluido") {
        upsertProject({
          ...target,
          archived: false,
          archivedAt: undefined,
          status: "concluido",
          completedAt: now,
          updatedAt: now,
        });
        return "concluded";
      }
      if (!active && latestArchived && latestArchived.status === "concluido") {
        upsertProject({ ...latestArchived, archived: false, archivedAt: undefined, updatedAt: now });
        return "restored";
      }
      return "none";
    }
    default: {
      // prospect | contacted | negotiating | declined
      if (active) {
        upsertProject({ ...active, archived: true, archivedAt: now, updatedAt: now });
        return "archived";
      }
      return "none";
    }
  }
}