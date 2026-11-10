import { describe, expect, it, beforeAll, afterEach, beforeEach, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLeadRadarMcpServer, getMcpCatalog } from "../server/mcpServer";
import { getCommunicationsByLead, getLeadById, recordCommunication, setSetting, upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

/**
 * Testes E2E da superfície MCP de WhatsApp (leitura de conversa, resposta a
 * mensagens recebidas, status/troca de backend e operação do gateway).
 *
 * O gateway e o envio de mensagens são simulados via `fetch` stubado; o
 * protocolo MCP real é exercitado (Client SDK ↔ McpServer via InMemoryTransport).
 */

interface MockResponse {
  status?: number;
  body?: unknown;
}

function mockFetch(handler: (url: string, init?: any) => MockResponse) {
  const fn = vi.fn(async (input: any, init?: any) => {
    const result = handler(String(input), init) || {};
    const status = result.status ?? 200;
    const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    };
  });
  vi.stubGlobal("fetch", fn as any);
  return fn;
}

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

const lead: StoredLead = {
  id: "mcp-wa-lead-1",
  name: "Clínica Sorriso Legal",
  category: "Dentista / Clínica Odontológica",
  city: "Campinas",
  state: "SP",
  phone: "+55 19 98888-7777",
  websiteStatus: "none",
  pipelineStatus: "prospect",
};

describe("MCP: superfície de WhatsApp", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectClient();
  });

  beforeEach(() => {
    process.env.WHATSMIAU_API_URL = "http://gateway.test";
    process.env.WHATSMIAU_API_KEY = "gateway-key";
    process.env.WHATSMIAU_INSTANCE = "leadradar";
    process.env.WHATSAPP_PROVIDER = "whatsmiau";
    setSetting("whatsapp_provider", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exibe as tools de WhatsApp no catálogo do servidor MCP", () => {
    const catalog = getMcpCatalog();
    const names = catalog.tools.map((tool) => tool.name);
    for (const expected of [
      "list_communications",
      "list_inbound_messages",
      "send_whatsapp_message",
      "whatsapp_status",
      "set_whatsapp_provider",
      "whatsapp_instance_status",
      "whatsapp_request_qr",
      "whatsapp_set_webhook",
      "list_outbox",
      "retry_outbound",
    ]) {
      expect(names).toContain(expected);
    }
    expect(catalog.resources).toContain("leads://inbox");
  });

  it("list_communications devolve o histórico do lead com o texto e a direção", async () => {
    upsertLead(lead);
    recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      status: "sent",
      message: "Olá, montei uma prévia da sua landing page.",
    });
    recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      direction: "inbound",
      status: "sent",
      message: "[RECEBIDA] Quanto custa?",
    });

    const data = parseToolResult(
      await client.callTool({ name: "list_communications", arguments: { leadId: lead.id } })
    );
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);
    expect(data.communications.map((c: any) => c.direction).sort()).toEqual(["inbound", "outbound"]);
    expect(data.communications[0].leadName).toBe(lead.name);
    expect(data.communications.map((c: any) => c.message)).toContain("[RECEBIDA] Quanto custa?");
  });

  it("list_inbound_messages marca o que ainda não foi respondido", async () => {
    upsertLead(lead);
    recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      direction: "inbound",
      status: "sent",
      message: "[RECEBIDA] Pode me mandar mais detalhes?",
    });

    const data = parseToolResult(await client.callTool({ name: "list_inbound_messages", arguments: {} }));
    expect(data.success).toBe(true);
    const item = data.messages.find((m: any) => m.leadId === lead.id);
    expect(item).toBeDefined();
    expect(item.awaitingReply).toBe(true);
    expect(item.leadPhone).toContain("98888");
  });

  it("send_whatsapp_message envia pelo backend ativo e registra a comunicação", async () => {
    upsertLead(lead);
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      return { status: 200, body: { key: { id: "MSG1" } } };
    });

    const data = parseToolResult(
      await client.callTool({
        name: "send_whatsapp_message",
        arguments: { leadId: lead.id, message: "Segue o orçamento da landing page." },
      })
    );
    expect(data.success).toBe(true);
    expect(data.status).toBe("sent");
    expect(calls[0]).toBe("http://gateway.test/v1/message/sendText/leadradar");

    const history = getCommunicationsByLead(lead.id);
    const sent = history.find((c) => c.message === "Segue o orçamento da landing page.");
    expect(sent).toBeDefined();
    expect(sent?.direction).toBe("outbound");
    expect(sent?.toAddress).toBe("5519988887777");
  });

  it("send_whatsapp_message cria o lead quando só o telefone é informado", async () => {
    mockFetch(() => ({ status: 200, body: {} }));

    const data = parseToolResult(
      await client.callTool({
        name: "send_whatsapp_message",
        arguments: { phone: "11977776666", businessName: "Bar do Zé", message: "Olá!" },
      })
    );
    expect(data.success).toBe(true);
    expect(data.createdLead).toBe(true);
    expect(data.leadId).toBe("lead_wa_11977776666");
    expect(getLeadById("lead_wa_11977776666")).toBeDefined();
  });

  it("send_whatsapp_message respeita o opt-out LGPD", async () => {
    upsertLead({
      ...lead,
      id: "mcp-wa-lead-optout",
      name: "Ótica Boa Vista",
      city: "Piracicaba",
      phone: "+55 19 97777-6666",
      doNotContact: true,
    });
    mockFetch(() => ({ status: 200, body: {} }));

    const data = parseToolResult(
      await client.callTool({
        name: "send_whatsapp_message",
        arguments: { leadId: "mcp-wa-lead-optout", message: "Oi!" },
      })
    );
    expect(data.success).toBe(false);
    expect(data.error).toContain("não receber");
  });

  it("send_whatsapp_message responde conversa aberta mesmo com o contato anterior registrado", async () => {
    const repliedLeadId = "mcp-wa-lead-reply";
    upsertLead({
      ...lead,
      id: repliedLeadId,
      name: "Studio Pilates Norte",
      city: "São José dos Campos",
      phone: "+55 19 96666-5555",
      lastContactAt: new Date(Date.now() - 86400000).toISOString(),
      pipelineStatus: "contacted",
    });
    recordCommunication({
      leadId: repliedLeadId,
      channel: "whatsapp",
      direction: "outbound",
      status: "sent",
      message: "Primeiro contato",
    });
    recordCommunication({
      leadId: repliedLeadId,
      channel: "whatsapp",
      direction: "inbound",
      status: "sent",
      message: "[RECEBIDA] Quero ver o protótipo.",
    });
    mockFetch(() => ({ status: 200, body: {} }));

    const data = parseToolResult(
      await client.callTool({
        name: "send_whatsapp_message",
        arguments: { leadId: repliedLeadId, message: "Aqui está o protótipo: link.exemplo" },
      })
    );
    expect(data.success).toBe(true);
    expect(data.status).toBe("sent");
  });

  it("send_whatsapp_message bloqueia recontato quando não há conversa aberta", async () => {
    const coldLeadId = "mcp-wa-lead-cold";
    upsertLead({
      ...lead,
      id: coldLeadId,
      name: "Oficina Motor Livre",
      city: "Hortolândia",
      phone: "+55 19 95555-4444",
      lastContactAt: new Date(Date.now() - 86400000).toISOString(),
      pipelineStatus: "contacted",
    });
    mockFetch(() => ({ status: 200, body: {} }));

    const data = parseToolResult(
      await client.callTool({
        name: "send_whatsapp_message",
        arguments: { leadId: coldLeadId, message: "Bom dia, tudo bem?" },
      })
    );
    expect(data.success).toBe(false);
    expect(data.blocked).toBe(true);
  });

  it("whatsapp_status mostra o backend ativo e o estado da instância", async () => {
    mockFetch((url) => {
      if (url.includes("/v1/instance/connectionState/")) {
        return { status: 200, body: { id: "leadradar", state: "open" } };
      }
      return { status: 200, body: {} };
    });

    const data = parseToolResult(await client.callTool({ name: "whatsapp_status", arguments: {} }));
    expect(data.success).toBe(true);
    expect(data.activeProvider).toBe("whatsmiau");
    expect(data.available.whatsmiau).toBe(true);
    expect(data.gateway.configured).toBe(true);
    expect(data.gateway.state).toBe("open");
    expect(data.gateway.connected).toBe(true);
  });

  it("set_whatsapp_provider persiste a escolha e o status reflete a troca", async () => {
    const data = parseToolResult(
      await client.callTool({ name: "set_whatsapp_provider", arguments: { provider: "meta" } })
    );
    expect(data.success).toBe(true);
    expect(data.savedChoice).toBe("meta");
    expect(data.provider).toBeNull(); // meta sem token/phoneId não pode ser ativo

    const status = parseToolResult(await client.callTool({ name: "whatsapp_status", arguments: {} }));
    expect(status.savedChoice).toBe("meta");
  });

  it("whatsapp_instance_status consulta o gateway", async () => {
    mockFetch((url) => {
      if (url.includes("/v1/instance/connectionState/")) {
        return { status: 200, body: { id: "leadradar", state: "closed" } };
      }
      if (url.includes("/v1/webhook/find/")) {
        return { status: 200, body: { webhook: { url: "https://exemplo/webhook", enabled: true, events: ["MESSAGES_UPSERT"] } } };
      }
      return { status: 200, body: {} };
    });

    const data = parseToolResult(
      await client.callTool({ name: "whatsapp_instance_status", arguments: {} })
    );
    expect(data.success).toBe(true);
    expect(data.state.state).toBe("closed");
    expect(data.state.connected).toBe(false);
    expect(data.webhook.url).toBe("https://exemplo/webhook");
  });

  it("whatsapp_request_qr devolve o QR e salva o PNG em disco", async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    mockFetch(() => ({
      status: 200,
      body: { connected: false, base64: `data:image/png;base64,${pngBase64}`, message: "scan me" },
    }));

    const data = parseToolResult(await client.callTool({ name: "whatsapp_request_qr", arguments: {} }));
    expect(data.success).toBe(true);
    expect(data.connected).toBe(false);
    expect(data.savedTo).toContain("whatsapp-qr-leadradar.png");
    expect(data.imageBase64).toBeUndefined();
  });

  it("whatsapp_set_webhook aponta o gateway para o inbound do LeadRadar", async () => {
    let requestBody: any = null;
    let requestUrl = "";
    mockFetch((url, init) => {
      requestUrl = url;
      requestBody = init?.body ? JSON.parse(init.body) : null;
      return { status: 200, body: { webhook: requestBody?.webhook } };
    });

    const data = parseToolResult(
      await client.callTool({ name: "whatsapp_set_webhook", arguments: { url: "https://app.exemplo/api/whatsapp/webhook" } })
    );
    expect(data.success).toBe(true);
    expect(requestUrl).toBe("http://gateway.test/v1/webhook/set/leadradar");
    expect(requestBody.webhook.url).toBe("https://app.exemplo/api/whatsapp/webhook");
    expect(requestBody.webhook.enabled).toBe(true);
    expect(requestBody.webhook.events).toContain("MESSAGES_UPSERT");
  });

  it("resource leads://inbox lista as mensagens aguardando resposta", async () => {
    upsertLead({
      ...lead,
      id: "mcp-wa-lead-inbox",
      name: "Bar do Girassol",
      city: "Paulínia",
      phone: "+55 19 94444-3333",
    });
    recordCommunication({
      leadId: "mcp-wa-lead-inbox",
      channel: "whatsapp",
      direction: "inbound",
      status: "sent",
      message: "[RECEBIDA] Podemos conversar amanhã?",
    });

    const result = await client.readResource({ uri: "leads://inbox" });
    const content = result.contents[0] as { text: string };
    const payload = JSON.parse(content.text);
    expect(payload.count).toBeGreaterThanOrEqual(1);
    expect(
      payload.messages.some((m: any) => m.leadId === "mcp-wa-lead-inbox")
    ).toBe(true);
  });
});
