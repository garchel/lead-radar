/**
 * Cliente do gateway WhatsApp (WhatsMiau self-hosted — API compatível com Evolution).
 *
 * Concentra as chamadas de *gerenciamento da instância* (estado da conexão,
 * pareamento via QR e configuração de webhook) para que o agente de IA consiga
 * operar o número pelo MCP sem precisar de `curl` manual.
 *
 * Endpoints usados (fork local em .whatsmiau-src/server/routes):
 *   GET  /v1/instance/fetchInstances
 *   GET  /v1/instance/connectionState/:id
 *   POST /v1/instance/:id/connect          → QR em base64 (data:image/png;base64,...)
 *   GET  /v1/webhook/find/:id
 *   POST /v1/webhook/set/:id               → { webhook: { url, events, enabled, headers } }
 *
 * Autenticação: header `apikey` (API_KEY do gateway).
 */

export interface GatewayConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

export class GatewayError extends Error {
  readonly status?: number;
  readonly body?: string;

  constructor(message: string, status?: number, body?: string) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.body = body;
  }
}

/** Configuração do gateway a partir do .env. Retorna null quando não configurado. */
export function getGatewayConfig(): GatewayConfig | null {
  const baseUrl = (process.env.WHATSMIAU_API_URL || "").trim();
  const apiKey = (process.env.WHATSMIAU_API_KEY || "").trim();
  if (!baseUrl || !apiKey) return null;
  const instance = (process.env.WHATSMIAU_INSTANCE || "").trim() || "leadradar";
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, instance };
}

export function isGatewayConfigured(): boolean {
  return getGatewayConfig() !== null;
}

const GATEWAY_TIMEOUT_MS = Number(
  process.env.WHATSMIAU_FETCH_TIMEOUT_MS || process.env.WHATSAPP_FETCH_TIMEOUT_MS || 15000
);

/** Chamada genérica ao gateway. Lança GatewayError com status e corpo em caso de falha. */
export async function gatewayRequest<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const config = getGatewayConfig();
  if (!config) {
    throw new GatewayError(
      "Gateway WhatsApp não configurado: defina WHATSMIAU_API_URL e WHATSMIAU_API_KEY."
    );
  }

  const res = await fetch(`${config.baseUrl}${path}`, {
    method: init.method || "GET",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new GatewayError(
      `Gateway HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      res.status,
      text
    );
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

function instanceOrDefault(instance?: string): string {
  const config = getGatewayConfig();
  return (instance || config?.instance || "leadradar").trim() || "leadradar";
}

export interface GatewayInstanceState {
  id: string;
  state: string;
  connected: boolean;
  webhook?: {
    url?: string;
    enabled?: boolean;
    events?: string[];
  };
}

/** Estado da conexão da instância (open = pareado e pronto para enviar). */
export async function fetchGatewayInstanceState(instance?: string): Promise<GatewayInstanceState> {
  const id = instanceOrDefault(instance);
  const data = await gatewayRequest<any>(`/v1/instance/connectionState/${encodeURIComponent(id)}`);
  const state = String(data?.state || data?.instance?.state || "unknown");
  const webhook = data?.webhook || data?.instance?.webhook;
  return {
    id,
    state,
    connected: state === "open",
    webhook: webhook
      ? {
          url: webhook.url || undefined,
          enabled: typeof webhook.enabled === "boolean" ? webhook.enabled : undefined,
          events: Array.isArray(webhook.events) ? webhook.events : undefined,
        }
      : undefined,
  };
}

/** Instâncias cadastradas no gateway. */
export async function fetchGatewayInstances(): Promise<any[]> {
  const data = await gatewayRequest<any>("/v1/instance/fetchInstances");
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.instances)) return data.instances;
  return [];
}

export interface GatewayQrResult {
  connected: boolean;
  base64?: string;
  pairingCode?: string;
  message?: string;
}

/**
 * Inicia (ou renova) o pareamento. Retorna o QR em base64 enquanto a instância
 * ainda não estiver conectada; quando já conectada, `connected: true`.
 */
export async function requestGatewayQr(instance?: string): Promise<GatewayQrResult> {
  const id = instanceOrDefault(instance);
  const data = await gatewayRequest<any>(`/v1/instance/${encodeURIComponent(id)}/connect`, {
    method: "POST",
    body: {},
  });
  return {
    connected: Boolean(data?.connected),
    base64: data?.base64 || undefined,
    pairingCode: data?.pairingCode || undefined,
    message: data?.message || undefined,
  };
}

export interface GatewayWebhookConfig {
  url: string;
  events?: string[];
  enabled?: boolean;
  headers?: Record<string, string>;
}

/** Configuração atual de webhook da instância. */
export async function fetchGatewayWebhook(instance?: string): Promise<any> {
  const id = instanceOrDefault(instance);
  const data = await gatewayRequest<any>(`/v1/webhook/find/${encodeURIComponent(id)}`);
  return data?.webhook ?? data ?? null;
}

/** Aponta (ou desliga) o webhook de eventos da instância para o LeadRadar. */
export async function updateGatewayWebhook(
  instance: string | undefined,
  config: GatewayWebhookConfig
): Promise<any> {
  const id = instanceOrDefault(instance);
  const webhook: Record<string, unknown> = { url: config.url };
  if (config.events) webhook.events = config.events;
  if (typeof config.enabled === "boolean") webhook.enabled = config.enabled;
  if (config.headers) webhook.headers = config.headers;
  const data = await gatewayRequest<any>(`/v1/webhook/set/${encodeURIComponent(id)}`, {
    method: "POST",
    body: { webhook },
  });
  return data?.webhook ?? data ?? null;
}

/** Eventos do gateway que o LeadRadar sabe consumir. */
export const SUPPORTED_WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "MESSAGES_DELETE",
  "MESSAGES_EDITED",
  "CONTACTS_UPSERT",
  "CONNECTION_UPDATE",
];

/**
 * URL de webhook padrão: APP_URL + rota de inbound, já com o token de
 * webhook quando WHATSAPP_WEBHOOK_TOKEN estiver configurado.
 */
export function defaultWebhookUrl(): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const token = (process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
  const url = `${base}/api/whatsapp/webhook`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}
