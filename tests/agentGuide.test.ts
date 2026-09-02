import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { upsertLead, upsertProject, deleteProject } from "../server/store/db";
import { createProject } from "../server/projects/service";
import { buildAgentRunbook, buildSpawnPrompt, APP_OVERVIEW } from "../server/projects/agentGuide";
// Importa o app Express real (server.ts exporta antes do listen; NODE_ENV=test guarda o auto-start)
import { app } from "../server";

let server: Server;
let baseUrl: string;

const lead = {
  id: "agent-guide-lead-1",
  name: "Barbearia Navalha",
  category: "Barbearia",
  city: "Sorocaba",
  state: "SP",
  phone: "+55 15 99999-1234",
  source: "test",
  pipelineStatus: "em_desenvolvimento",
} as any;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("agentGuide — runbook do bot de execução", () => {
  it("buildAgentRunbook devolve guia completo com estado fresco do projeto", () => {
    upsertLead(lead);
    const project = createProject({ leadId: lead.id, name: "LP Navalha" });

    const runbook = buildAgentRunbook(project.id);

    // Visão geral do app
    expect(runbook.success).toBe(true);
    expect(runbook.app).toEqual(APP_OVERVIEW);
    expect(runbook.app.fluxoDeTrabalho.length).toBeGreaterThanOrEqual(5);

    // Estado do projeto
    expect(runbook.projectId).toBe(project.id);
    expect(runbook.projeto.etapa).toBe("briefing");
    expect(runbook.projeto.cliente.nome).toBe("Barbearia Navalha");
    expect(runbook.projeto.cliente.cidade).toBe("Sorocaba/SP");
    expect(runbook.projeto.devStatus).toBe("aguardando_agente");

    // Runbook começa na etapa ATUAL (briefing) e inclui as seguintes
    const etapas = runbook.runbook.map((s) => s.etapa);
    expect(etapas[0]).toBe("briefing");
    expect(etapas).toContain("copywriting");
    expect(etapas).toContain("wireframe");
    expect(etapas).toContain("deploy");
    expect(etapas.length).toBe(7);

    // Regras de ouro incluem o guarda-limite humano
    expect(runbook.regras.some((r) => r.includes("approve_project_code"))).toBe(true);

    // Prompt de spawn referencia o projectId e a tool de entrada
    expect(runbook.promptDeSpawn).toContain(project.id);
    expect(runbook.promptDeSpawn).toContain("get_agent_runbook");
    expect(runbook.promptDeSpawn).toContain("REGRAS CRÍTICAS");

    // MCP: ferramentas listadas
    expect(runbook.mcp.ferramentas.length).toBeGreaterThanOrEqual(6);
    expect(runbook.mcp.ferramentas.map((t) => t.tool)).toContain("get_agent_runbook");

    deleteProject(project.id);
  });

  it("buildAgentRunbook de projeto em design pula briefing/copywriting", () => {
    upsertLead(lead);
    const project = createProject({ leadId: lead.id, name: "LP Navalha 2" });
    upsertProject({ ...project, stage: "design" } as any);

    const runbook = buildAgentRunbook(project.id);
    const etapas = runbook.runbook.map((s) => s.etapa);
    expect(etapas[0]).toBe("design");
    expect(etapas).not.toContain("briefing");
    expect(etapas).not.toContain("copywriting");
    expect(etapas.length).toBe(5);

    deleteProject(project.id);
  });

  it("buildAgentRunbook de projeto em wireframe instrui o gate de aprovação do cliente", () => {
    upsertLead(lead);
    const project = createProject({ leadId: lead.id, name: "LP Navalha WF" });
    upsertProject({ ...project, stage: "wireframe", wireframeUrl: "https://exemplo.github.io/wireframe/" } as any);

    const runbook = buildAgentRunbook(project.id);
    const etapas = runbook.runbook.map((s) => s.etapa);
    expect(etapas[0]).toBe("wireframe");
    expect(etapas).not.toContain("briefing");
    expect(etapas).not.toContain("design");
    expect(etapas.length).toBe(4); // wireframe, desenvolvimento, revisao, deploy
    // wireframe é a etapa atual → passo a passo inclui as instruções do wireframe
    const wfStep = runbook.runbook[0];
    const acoes = wfStep.acoes.join(" ");
    expect(acoes).toContain("preto OU branco");
    expect(acoes).toContain("borda pontilhada");
    expect(acoes).toContain("wireframeUrl");
    // estado do projeto expõe a URL do wireframe para o operador
    expect(runbook.projeto.wireframeUrl).toBe("https://exemplo.github.io/wireframe/");

    deleteProject(project.id);
  });

  it("buildAgentRunbook lança erro para projeto inexistente", () => {
    expect(() => buildAgentRunbook("proj-inexistente")).toThrow("Projeto não encontrado");
  });

  it("buildSpawnPrompt é autocontido (funciona sem o runbook)", () => {
    upsertLead(lead);
    const project = createProject({ leadId: lead.id, name: "LP Navalha 3" });
    const prompt = buildSpawnPrompt(project);
    expect(prompt).toContain(project.id);
    expect(prompt).toContain("Não leia a codebase do LeadRadar");
    // as linhas de regras críticas estão presentes
    expect(prompt).toContain("NUNCA chame approve_project_code");
    deleteProject(project.id);
  });

  it("GET /api/projects/:id/agent-runbook serve o runbook via HTTP", async () => {
    upsertLead(lead);
    const project = createProject({ leadId: lead.id, name: "LP Navalha HTTP" });

    const res = await fetch(`${baseUrl}/api/projects/${project.id}/agent-runbook`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.projeto.etapa).toBe("briefing");
    expect(data.promptDeSpawn).toContain(project.id);

    // 404 para projeto inexistente
    const res404 = await fetch(`${baseUrl}/api/projects/proj-inexistente/agent-runbook`);
    expect(res404.status).toBe(404);
    const data404 = await res404.json();
    expect(data404.success).toBe(false);

    deleteProject(project.id);
  });
});
