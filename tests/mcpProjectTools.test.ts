import { describe, expect, it, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLeadRadarMcpServer } from "../server/mcpServer";
import { upsertLead, getProjectById, getLeadById } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

/**
 * Testes E2E das tools MCP de projeto (list_projects / update_project)
 * exercendo o protocolo MCP real (Client SDK ↔ McpServer via InMemoryTransport).
 * Simula o ciclo do cliente: briefing manual → etapas → dev kit → submit.
 */

const lead: StoredLead = {
  id: "mcp-proj-lead-1",
  name: "Clínica Vida Sorridente",
  category: "Dentista / Clínica Odontológica",
  city: "Campinas",
  state: "SP",
  phone: "+55 19 99999-0001",
  websiteStatus: "none",
  pipelineStatus: "negotiating",
};

async function connectClient() {
  const server = createLeadRadarMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function parseToolResult<T = any>(result: any): T {
  expect(result.content?.[0]?.type).toBe("text");
  return JSON.parse(result.content[0].text) as T;
}

describe("MCP: list_projects / update_project — ciclo do cliente", () => {
  let client: Client;
  let projectId: string;

  beforeAll(async () => {
    client = await connectClient();
  });

  it("list_projects retorna lista (vazia ou com projetos) no formato esperado", async () => {
    const result = await client.callTool({ name: "list_projects", arguments: {} });
    const data = parseToolResult(result);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.projects)).toBe(true);
  });

  it("update_crm_status para em_desenvolvimento cria o projeto (via syncLeadProject)", async () => {
    upsertLead(lead);
    const result = await client.callTool({
      name: "update_crm_status",
      arguments: {
        leadId: lead.id,
        businessName: lead.name,
        status: "em_desenvolvimento",
        notes: "Cliente aprovou proposta — projeto criado",
      },
    });
    const data = parseToolResult(result);
    expect(data.success).toBe(true);

    const listResult = await client.callTool({
      name: "list_projects",
      arguments: { leadId: lead.id },
    });
    const listData = parseToolResult(listResult);
    expect(listData.success).toBe(true);
    expect(listData.count).toBeGreaterThanOrEqual(1);
    const found = listData.projects.find((p: any) => p.leadId === lead.id);
    expect(found).toBeDefined();
    expect(found.stage).toBe("briefing");
    projectId = found.projectId;
  });

  it("update_project grava briefing manual (texto livre, append) sem sobrescrever", async () => {
    const brief1 = "Nome: Clínica Vida Sorridente\nPúblico: famílias de Campinas\nObjetivo: agendamento de avaliação";
    const brief2 = "Cor preferida: azul claro\nTom de voz: acolhedor";

    const r1 = parseToolResult(
      await client.callTool({ name: "update_project", arguments: { projectId, brief: brief1 } })
    );
    expect(r1.success).toBe(true);
    expect(r1.briefPreview).toContain("Clínica Vida Sorridente");

    const r2 = parseToolResult(
      await client.callTool({ name: "update_project", arguments: { projectId, brief: brief2 } })
    );
    expect(r2.success).toBe(true);

    const project = getProjectById(projectId)!;
    expect(project.brief).toContain("Briefing manual");
    expect(project.brief).toContain("Clínica Vida Sorridente");
    expect(project.brief).toContain("azul claro");
  });

  it("update_project move etapa e grava copy/designNotes", async () => {
    const r = parseToolResult(
      await client.callTool({
        name: "update_project",
        arguments: {
          projectId,
          stage: "copywriting",
          copy: "Sorriso saudável para toda a família. Agende sua avaliação gratuita hoje.",
        },
      })
    );
    expect(r.success).toBe(true);
    expect(r.stage).toBe("copywriting");
    expect(r.hasCopy).toBe(true);

    const project = getProjectById(projectId)!;
    expect(project.stage).toBe("copywriting");
    expect(project.copy).toContain("avaliação gratuita");
  });

  it("update_project grava briefing estruturado (formato Typeform) e move para design", async () => {
    const r = parseToolResult(
      await client.callTool({
        name: "update_project",
        arguments: {
          projectId,
          stage: "design",
          briefing: [
            { fieldTitle: "Nome do negócio", answer: "Clínica Vida Sorridente" },
            { fieldTitle: "Público-alvo", answer: "Famílias com crianças em Campinas" },
            { fieldTitle: "Serviço principal", answer: "Avaliação e limpeza dental" },
          ],
        },
      })
    );
    expect(r.success).toBe(true);
    expect(r.briefingFields).toBe(3);

    const project = getProjectById(projectId)!;
    expect(project.stage).toBe("design");
    expect(project.briefing!.length).toBe(3);
    expect(project.briefing![0].fieldTitle).toBe("Nome do negócio");
  });

  it("update_project rejeita stage inválido via validação do zod/schema", async () => {
    // O SDK resolve com isError:true (não rejeita); o zod barra o stage inválido antes do updateProject
    const result = await client.callTool({
      name: "update_project",
      arguments: { projectId, stage: "etapa_inexistente" as any },
    });
    expect((result as any).isError).toBe(true);
    expect(result.content?.[0]?.text).toContain("Invalid option");
  });

  it("update_project rejeita brief vazio", async () => {
    const r = parseToolResult(
      await client.callTool({ name: "update_project", arguments: { projectId, brief: "   " } })
    );
    expect(r.success).toBe(false);
    expect(r.error).toContain("não vazio");
  });

  it("update_project rejeita sem campos", async () => {
    const r = parseToolResult(
      await client.callTool({ name: "update_project", arguments: { projectId } })
    );
    expect(r.success).toBe(false);
  });

  it("update_project rejeita projectId inexistente", async () => {
    const r = parseToolResult(
      await client.callTool({
        name: "update_project",
        arguments: { projectId: "proj-inexistente", brief: "teste" },
      })
    );
    expect(r.success).toBe(false);
    expect(r.error).toContain("não encontrado");
  });

  it("update_project status concluido move lead para closed", async () => {
    const r = parseToolResult(
      await client.callTool({
        name: "update_project",
        arguments: { projectId, status: "concluido" },
      })
    );
    expect(r.success).toBe(true);

    const leadAfter = getLeadById(lead.id)!;
    expect(leadAfter.pipelineStatus).toBe("closed");
  });

  it("get_project_dev_kit reflete briefing manual + estruturado + copy após as atualizações", async () => {
    // Reabre o projeto (status em_andamento) para manter cenário coerente
    parseToolResult(
      await client.callTool({
        name: "update_project",
        arguments: { projectId, status: "em_andamento" },
      })
    );
    const r = parseToolResult(
      await client.callTool({ name: "get_project_dev_kit", arguments: { projectId } })
    );
    expect(r.success).toBe(true);
    expect(r.prompt).toContain("Clínica Vida Sorridente");
    expect(r.prompt).toContain("avaliação gratuita");
    // briefing estruturado aparece no kit (formato - fieldTitle: answer)
    expect(r.prompt).toContain("Nome do negócio: Clínica Vida Sorridente");
  });
});
