import { describe, expect, it } from "vitest";
import {
  deleteProject,
  getProjectById,
  getProjects,
  getProjectsByLead,
  getLeadById,
  upsertLead,
} from "../server/store/db";
import {
  createProject,
  concludeProject,
  removeProject,
  updateProject,
  advanceProjectStage,
  ensureProjectTypeformToken,
  syncLeadProject,
} from "../server/projects/service";
import type { StoredLead } from "../server/store/types";
import { DEFAULT_TASKS_BY_STAGE } from "../server/projects/defaultTasks";
import type { ProjectStage } from "../server/store/types";

const lead: StoredLead = {
  id: "proj-lead-1",
  name: "Clínica Sorriso",
  category: "Dentista",
  city: "São Paulo",
  state: "SP",
  phone: "(11) 1111-2222",
  websiteStatus: "none",
  pipelineStatus: "negotiating",
};

describe("projetos / acompanhamento do desenvolvimento", () => {
  it("cria um projeto e move o lead para Em Desenvolvimento", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "proj-lead-1", name: "LP Clínica Sorriso", priority: "alta" });

    expect(project.id).toBeDefined();
    expect(project.stage).toBe("briefing");
    expect(project.status).toBe("em_andamento");
    expect(project.leadId).toBe("proj-lead-1");

    const updatedLead = getLeadById("proj-lead-1")!;
    expect(updatedLead.pipelineStatus).toBe("em_desenvolvimento");

    expect(getProjects().length).toBeGreaterThanOrEqual(1);
    expect(getProjectsByLead("proj-lead-1").length).toBeGreaterThanOrEqual(1);
  });

  it("lista projetos com dados denormalizados do lead (JOIN)", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "proj-lead-1", name: "LP Sorriso" });
    const fromStore = getProjectById(project.id)!;
    expect(fromStore.leadName).toBe("Clínica Sorriso");
    expect(fromStore.leadCity).toBe("São Paulo");
  });

  it("avança a etapa do projeto sem alterar o lead", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "proj-lead-1", name: "LP Sorriso" });
    const advanced = advanceProjectStage(project.id, "design");
    expect(advanced.stage).toBe("design");
    expect(getLeadById("proj-lead-1")!.pipelineStatus).toBe("em_desenvolvimento");
  });

  it("conclui um projeto e move o lead para Finalizado (closed)", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "proj-lead-1", name: "LP Sorriso" });
    const concluded = concludeProject(project.id);
    expect(concluded.status).toBe("concluido");
    expect(concluded.completedAt).toBeDefined();
    expect(getLeadById("proj-lead-1")!.pipelineStatus).toBe("closed");
  });

  it("reabre um projeto concluído e volta o lead para Em Desenvolvimento", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "proj-lead-1", name: "LP Sorriso" });
    concludeProject(project.id);
    expect(getLeadById("proj-lead-1")!.pipelineStatus).toBe("closed");

    const reopened = updateProject(project.id, { status: "em_andamento" });
    expect(reopened.status).toBe("em_andamento");
    expect(reopened.completedAt).toBeUndefined();
    expect(getLeadById("proj-lead-1")!.pipelineStatus).toBe("em_desenvolvimento");
  });

  it("remove um projeto e devolve o lead para Em Negociação", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "proj-lead-1", name: "LP Sorriso" });
    removeProject(project.id);
    expect(getProjectById(project.id)).toBeUndefined();
    expect(getLeadById("proj-lead-1")!.pipelineStatus).toBe("negotiating");
  });

  it("exclui projeto direto no store não altera o status do lead", () => {
    upsertLead({ ...lead, id: "proj-lead-2", name: "Auto Peças Silva", city: "Santos", phone: "(13) 3333-4444", pipelineStatus: "negotiating" });
    const project = createProject({ leadId: "proj-lead-2", name: "LP Auto Peças" });
    deleteProject(project.id);
    expect(getProjectById(project.id)).toBeUndefined();
    expect(getLeadById("proj-lead-2")!.pipelineStatus).toBe("em_desenvolvimento");
  });

  it("rejeita atualizações com etapa ou status inválidos", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "proj-lead-1", name: "LP Sorriso" });
    expect(() => updateProject(project.id, { stage: "inexistente" as any })).toThrow("Etapa inválida.");
    expect(() => updateProject(project.id, { status: "inexistente" as any })).toThrow("Status inválido.");
  });

  it("cria projeto com tipo Site Institucional e nome padrão correto", () => {
    upsertLead({ ...lead, id: "type-lead-1", name: "Construtora Prisma", city: "Guarulhos", phone: "(11) 9999-0000", pipelineStatus: "negotiating" });
    const project = createProject({ leadId: "type-lead-1", type: "site_institucional" });
    expect(project.type).toBe("site_institucional");
    expect(project.name).toBe("Construtora Prisma — Site Institucional");

    const lp = createProject({ leadId: "type-lead-1", name: "LP Promoção" });
    expect(lp.type).toBe("landing_page");
    expect(lp.name).toBe("LP Promoção");
  });

  it("persiste o tipo e o briefing estruturado no banco (round-trip)", () => {
    upsertLead({ ...lead, id: "type-lead-2", name: "Clínica Estética Lumina", city: "Campinas", phone: "(19) 1111-2222", pipelineStatus: "negotiating" });
    const project = createProject({ leadId: "type-lead-2", type: "landing_page" });
    const updated = updateProject(project.id, {
      type: "landing_page",
      briefing: [
        { fieldTitle: "Qual é o nome da empresa?", answer: "Clínica Estética Lumina" },
        { fieldTitle: "Qual o objetivo?", answer: "Gerar leads" },
      ],
    });
    expect(updated.type).toBe("landing_page");
    expect(updated.briefing).toHaveLength(2);

    const fromStore = getProjectById(project.id)!;
    expect(fromStore.briefing?.[0]).toEqual({ fieldTitle: "Qual é o nome da empresa?", answer: "Clínica Estética Lumina" });
  });

  it("rejeita tipo de projeto inválido", () => {
    upsertLead(lead);
    const project = createProject({ leadId: "proj-lead-1", name: "LP Sorriso" });
    expect(() => updateProject(project.id, { type: "portifolio" as any })).toThrow("Tipo de projeto inválido.");
  });

  it("gera token único de briefing no create e mantém via ensureProjectTypeformToken", () => {
    upsertLead({ ...lead, id: "tok-lead-1", name: "Clínica Dente Forte", city: "Jundiaí", phone: "(11) 1234-5678", pipelineStatus: "negotiating" });
    const project = createProject({ leadId: "tok-lead-1", name: "LP Dente Forte" });
    expect(project.typeformToken).toBeDefined();
    expect(project.typeformToken!.startsWith("P-")).toBe(true);

    const same = ensureProjectTypeformToken(project.id);
    expect(same).toBe(project.typeformToken);
  });

  it("ensureProjectTypeformToken gera token para projeto legado (sem token)", () => {
    upsertLead({ ...lead, id: "tok-lead-2", name: "Studio Estética Beleza", city: "Barueri", phone: "(11) 4321-8765", pipelineStatus: "negotiating" });
    const project = createProject({ leadId: "tok-lead-2", name: "LP Beleza" });
    updateProject(project.id, { typeformToken: undefined });

    const token = ensureProjectTypeformToken(project.id);
    expect(token.startsWith("P-")).toBe(true);
    expect(getProjectById(project.id)!.typeformToken).toBe(token);
  });

  it("sincroniza: cria card com o tipo escolhido quando o lead entra em Em Desenvolvimento", () => {
    upsertLead({ ...lead, id: "sync-type-1", name: "Padaria Estrela", city: "Barueri", phone: "(11) 7777-8888", pipelineStatus: "em_desenvolvimento" });
    const action = syncLeadProject(getLeadById("sync-type-1")!, { projectType: "site_institucional" });
    expect(action).toBe("created");
    const [project] = getProjectsByLead("sync-type-1");
    expect(project.type).toBe("site_institucional");
    expect(project.name).toBe("Padaria Estrela — Site Institucional");
  });

  it("criar projeto para lead recusado não sobrescreve o pipeline", () => {
    upsertLead({ ...lead, id: "proj-lead-3", name: "Loja X", city: "Campinas", phone: "(19) 8888-9999", pipelineStatus: "declined" });
    createProject({ leadId: "proj-lead-3", name: "LP Loja X" });
    expect(getLeadById("proj-lead-3")!.pipelineStatus).toBe("declined");
  });

  it("sincroniza: lead em Em Desenvolvimento cria o card automaticamente", () => {
    upsertLead({ ...lead, id: "sync-lead-1", name: "Pet Shop Amigo", city: "Guarulhos", phone: "(11) 2222-3333", pipelineStatus: "em_desenvolvimento" });
    const action = syncLeadProject(getLeadById("sync-lead-1")!);
    expect(action).toBe("created");
    const projects = getProjectsByLead("sync-lead-1");
    expect(projects.length).toBe(1);
    expect(projects[0].archived).toBe(false);
    expect(projects[0].stage).toBe("briefing");
  });

  it("sincroniza: é idempotente quando já existe card ativo", () => {
    upsertLead({ ...lead, id: "sync-lead-1b", name: "Pet Shop B", city: "Mauá", phone: "(11) 2222-4444", pipelineStatus: "em_desenvolvimento" });
    syncLeadProject(getLeadById("sync-lead-1b")!);
    const action = syncLeadProject(getLeadById("sync-lead-1b")!);
    expect(action).toBe("none");
    expect(getProjectsByLead("sync-lead-1b").length).toBe(1);
  });

  it("sincroniza: lead fora de Em Desenvolvimento arquiva o card (sem excluir)", () => {
    upsertLead({ ...lead, id: "sync-lead-2", name: "Barbearia Rei", city: "Osasco", phone: "(11) 3333-4444", pipelineStatus: "em_desenvolvimento" });
    syncLeadProject(getLeadById("sync-lead-2")!);
    expect(getProjectsByLead("sync-lead-2")[0].archived).toBe(false);

    upsertLead({ ...getLeadById("sync-lead-2")!, pipelineStatus: "negotiating" });
    const action = syncLeadProject(getLeadById("sync-lead-2")!);
    expect(action).toBe("archived");
    expect(getProjectsByLead("sync-lead-2")[0].archived).toBe(true);
  });

  it("sincroniza: voltar a Em Desenvolvimento restaura o card exatamente como estava", () => {
    upsertLead({ ...lead, id: "sync-lead-3", name: "Academia Corpo", city: "Santo André", phone: "(11) 4444-5555", pipelineStatus: "em_desenvolvimento" });
    syncLeadProject(getLeadById("sync-lead-3")!);
    const [p] = getProjectsByLead("sync-lead-3");
    updateProject(p.id, { stage: "design", designNotes: "Layout moderno, paleta azul", priority: "alta", dueDate: "2026-09-01" });

    upsertLead({ ...getLeadById("sync-lead-3")!, pipelineStatus: "closed" });
    syncLeadProject(getLeadById("sync-lead-3")!);
    expect(getProjectsByLead("sync-lead-3")[0].status).toBe("concluido");

    upsertLead({ ...getLeadById("sync-lead-3")!, pipelineStatus: "negotiating" });
    syncLeadProject(getLeadById("sync-lead-3")!);
    const archived = getProjectsByLead("sync-lead-3")[0];
    expect(archived.archived).toBe(true);
    expect(archived.stage).toBe("design");
    expect(archived.designNotes).toBe("Layout moderno, paleta azul");
    expect(archived.priority).toBe("alta");
    expect(archived.dueDate).toBe("2026-09-01");

    upsertLead({ ...getLeadById("sync-lead-3")!, pipelineStatus: "em_desenvolvimento" });
    const action = syncLeadProject(getLeadById("sync-lead-3")!);
    expect(action).toBe("restored");
    const restored = getProjectsByLead("sync-lead-3")[0];
    expect(restored.archived).toBe(false);
    expect(restored.stage).toBe("design");
    expect(restored.designNotes).toBe("Layout moderno, paleta azul");
    expect(restored.priority).toBe("alta");
    expect(restored.dueDate).toBe("2026-09-01");
  });

  it("sincroniza: reabre projeto concluído quando o lead volta a Em Desenvolvimento", () => {
    upsertLead({ ...lead, id: "sync-lead-4", name: "Oficina Mecânica", city: "Diadema", phone: "(11) 5555-6666", pipelineStatus: "em_desenvolvimento" });
    syncLeadProject(getLeadById("sync-lead-4")!);
    const [p] = getProjectsByLead("sync-lead-4");
    concludeProject(p.id);
    expect(getLeadById("sync-lead-4")!.pipelineStatus).toBe("closed");

    upsertLead({ ...getLeadById("sync-lead-4")!, pipelineStatus: "em_desenvolvimento" });
    const action = syncLeadProject(getLeadById("sync-lead-4")!);
    expect(action).toBe("reopened");
    const reopened = getProjectsByLead("sync-lead-4")[0];
    expect(reopened.status).toBe("em_andamento");
    expect(reopened.completedAt).toBeUndefined();
  });

  it("sincroniza: lead Finalizado conclui o card de projeto", () => {
    upsertLead({ ...lead, id: "sync-lead-5", name: "Studio Pilates B", city: "Taboão", phone: "(11) 6666-7777", pipelineStatus: "em_desenvolvimento" });
    syncLeadProject(getLeadById("sync-lead-5")!);
    expect(getProjectsByLead("sync-lead-5")[0].status).toBe("em_andamento");

    upsertLead({ ...getLeadById("sync-lead-5")!, pipelineStatus: "closed" });
    const action = syncLeadProject(getLeadById("sync-lead-5")!);
    expect(action).toBe("concluded");
    const concluded = getProjectsByLead("sync-lead-5")[0];
    expect(concluded.status).toBe("concluido");
    expect(concluded.completedAt).toBeDefined();
  });

  it("cria o checklist padrão de tarefas por etapa automaticamente", () => {
    const stored = upsertLead({ ...lead, id: "tasks-lead-1", name: "Padaria Estrela", city: "Osasco", phone: "(11) 7777-8888", pipelineStatus: "negotiating" });
    const project = createProject({ leadId: stored.id, name: "LP Padaria" });

    expect(project.tasks).toBeDefined();
    expect(project.tasks!.length).toBeGreaterThan(0);
    // Todas as etapas têm tarefas padrão desenhadas por profissionais sênior.
    for (const stage of ["briefing", "copywriting", "design", "desenvolvimento", "revisao", "deploy"]) {
      expect(project.tasks!.filter((t) => t.stage === stage).length).toBeGreaterThan(0);
    }
    expect(project.tasks!.every((t) => !t.done)).toBe(true);
  });

  it("mantém as tarefas padrão na ordem natural de trabalho", () => {
    const stored = upsertLead({ ...lead, id: "tasks-lead-3", name: "Studio Yoga Paz", city: "Santo André", phone: "(11) 9999-0000", pipelineStatus: "negotiating" });
    const project = createProject({ leadId: stored.id, name: "LP Studio Yoga" });

    for (const stage of ["briefing", "copywriting", "design", "desenvolvimento", "revisao", "deploy"]) {
      const titles = project.tasks!.filter((t) => t.stage === stage).map((t) => t.title);
      expect(titles).toEqual(DEFAULT_TASKS_BY_STAGE[stage as ProjectStage]);
    }
  });

  it("persiste tasks no updateProject e valida estrutura", () => {
    const stored = upsertLead({ ...lead, id: "tasks-lead-2", name: "Barbearia Navalha", city: "Cotia", phone: "(11) 8888-9999", pipelineStatus: "negotiating" });
    const project = createProject({ leadId: stored.id, name: "LP Barbearia" });

    const updated = updateProject(project.id, {
      tasks: [
        { id: "custom-1", stage: "design", title: "Criar logo alternativa", done: true },
        { id: "custom-2", stage: "design", title: "Testar contraste de cores", done: false },
      ],
    });
    expect(updated.tasks).toHaveLength(2);
    expect(getProjectById(project.id)!.tasks![0].done).toBe(true);

    expect(() =>
      updateProject(project.id, { tasks: [{ id: "x", stage: "design", title: "", done: "sim" as any }] })
    ).toThrow("Tarefa inválida.");
    expect(() => updateProject(project.id, { tasks: "não-é-array" as any })).toThrow(
      "Lista de tarefas inválida."
    );
  });
});