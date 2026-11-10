import {
  getCommunicationByExternalId,
  getCommunicationsByLead,
  recordCommunication,
  updateCommunicationStatusByExternalId,
  type Communication,
} from "../store/db";
import type { StoredLead } from "../store/types";
import { normalizeToE164, resolveWhatsappProvider } from "./contactService";
import { normalizePhone } from "./leadIdentity";

/**
 * ACK de entrega + reconciliação de mensagens.
 *
 * O gateway entrega `messages.upsert` para mensagens novas, mas:
 *  - `messages.update` (ACK de entrega/leitura das NOSSAS mensagens) era
 *    descartado — todo outbound ficava "sent" para sempre;
 *  - mensagens recebidas com o servidor fora do ar ficavam de fora.
 *
 * Este módulo centraliza as duas coisas. Os formatos abaixo cobrem Evolution,
 * WhatsMiau (fork) e Meta Cloud API.
 */

export type AckStatus = Communication["status"];

const ACK_MAP: Record<string, AckStatus> = {
  pending: "sent",
  sent: "sent",
  server_ack: "sent",
  delivery_ack: "delivered",
  delivered: "delivered",
  read: "read",
  played: "read",
  failed: "failed",
  error: "failed",
};

export function normalizeAckStatus(raw: unknown): AckStatus | null {
  const key = String(raw || "").trim().toLowerCase();
  return ACK_MAP[key] || null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function collectUpdates(body: any): Array<{ externalId: string; status: AckStatus; fromMe: boolean }> {
  const updates: Array<{ externalId: string; status: AckStatus; fromMe: boolean }> = [];

  const push = (rawId: unknown, rawStatus: unknown, fromMe = false) => {
    const externalId = firstString(rawId);
    const status = normalizeAckStatus(rawStatus);
    if (externalId && status) updates.push({ externalId, status, fromMe });
  };

  // Evolution / WhatsMiau: { event: "messages.update", data: {...} | [...] }
  const event = String(body?.event || body?.type || "").toUpperCase();
  if (event.includes("MESSAGES_UPDATE") || event === "MESSAGES.UPDATE" || body?.event === "messages.update") {
    const data = body.data ?? body;
    for (const item of Array.isArray(data) ? data : [data]) {
      const key = item?.key || item?.message?.key || {};
      push(
        key.id || item?.keyId || item?.messageId,
        item?.status ?? item?.update?.status ?? item?.message?.status,
        key.fromMe === true
      );
    }
  }

  // Meta Cloud API: { entry: [{ changes: [{ value: { statuses: [...] } }] }] }
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const item of statuses) push(item?.id, item?.status, item?.recipient_id ? true : false);
    }
  }

  return updates;
}

/**
 * Aplica os ACKs contidos no payload do webhook.
 * Retorna quantos ids foram encontrados no nosso histórico.
 */
export function handleAckEvent(body: any): { received: number; applied: number } {
  const updates = collectUpdates(body);
  let applied = 0;
  for (const update of updates) {
    if (!update.fromMe) continue;
    if (updateCommunicationStatusByExternalId(update.externalId, update.status)) applied += 1;
  }
  return { received: updates.length, applied };
}

function extractText(message: any): string {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.documentMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  ).trim();
}

/**
 * Registra uma mensagem recebida uma única vez (dedupe por id do provedor).
 * Webhooks reentregues não duplicam mais a conversa.
 */
export function recordInboundIfNew(input: {
  lead: Pick<StoredLead, "id" | "phone">;
  text: string;
  externalId?: string;
  occurredAt?: string;
}): { created: boolean; communicationId: string | null } {
  if (input.externalId) {
    const existing = getCommunicationByExternalId(input.externalId);
    if (existing) return { created: false, communicationId: existing.id };
  }
  if (!input.text.trim()) return { created: false, communicationId: null };

  const id = recordCommunication({
    leadId: input.lead.id,
    channel: "whatsapp",
    direction: "inbound",
    status: "sent",
    toAddress: input.lead.phone,
    message: `[RECEBIDA] ${input.text.trim()}`,
    externalId: input.externalId,
    sentAt: input.occurredAt,
  });
  return { created: true, communicationId: id };
}

export interface ReconcileResult {
  ok: boolean;
  provider: string;
  synced: number;
  inbound: number;
  acks: number;
  error?: string;
  /** no_anchor = falta mensagem de referência (corrigível pelo caller). */
  reason?: "no_anchor";
}

function gatewayBase(): { url: string; key?: string; instance: string } | null {
  const { provider } = resolveWhatsappProvider();
  if (provider === "whatsmiau") {
    const url = (process.env.WHATSMIAU_API_URL || "").replace(/\/$/, "");
    if (!url) return null;
    return { url, key: process.env.WHATSMIAU_API_KEY, instance: process.env.WHATSMIAU_INSTANCE || "leadradar" };
  }
  if (provider === "evolution") {
    const url = (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
    if (!url) return null;
    return { url, key: process.env.EVOLUTION_API_KEY, instance: process.env.EVOLUTION_INSTANCE || "leadradar" };
  }
  return null;
}

/**
 * Puxa o histórico recente do chat direto do celular conectado.
 *
 * É o plano B quando o webhook perde eventos (servidor reiniciando, instância
 * offline). Depende do aparelho estar online: `/chat/syncMessages` pede o
 * histórico ao WhatsApp e pode estourar timeout.
 *
 * O gateway exige uma mensagem-âncora (`id`) do próprio chat. Quando o caller
 * não informa, usamos o `externalId` mais recente que já registramos para o
 * lead; sem nenhum id conhecido não há como paginar o histórico.
 */
export async function reconcileLeadMessages(
  lead: Pick<StoredLead, "id" | "phone">,
  options: { count?: number; since?: string; anchor?: string; fromMe?: boolean } = {}
): Promise<ReconcileResult> {
  const { provider } = resolveWhatsappProvider();
  const gateway = gatewayBase();
  if (!gateway) {
    return { ok: false, provider, synced: 0, inbound: 0, acks: 0, error: `Backend ${provider} não suporta sincronização de histórico.` };
  }

  const number = normalizeToE164(lead.phone || "") || normalizePhone(lead.phone || "");
  if (!number) return { ok: false, provider, synced: 0, inbound: 0, acks: 0, error: "Lead sem telefone válido." };

  const known = getCommunicationsByLead(lead.id).find((c) => c.externalId);
  const anchor = options.anchor?.trim() || known?.externalId || "";
  if (!anchor) {
    return {
      ok: false,
      provider,
      synced: 0,
      inbound: 0,
      acks: 0,
      reason: "no_anchor",
      error:
        "Sem mensagem de referência: o gateway exige o id de uma mensagem já existente no chat. " +
        "Envie uma mensagem para o lead (ou informe `anchor`) antes de reconciliar.",
    };
  }
  const fromMe = options.fromMe ?? known?.direction === "outbound";

  const path = provider === "whatsmiau"
    ? `/v1/chat/syncMessages/${gateway.instance}`
    : `/chat/syncMessages/${gateway.instance}`;

  let payload: any;
  try {
    const res = await fetch(`${gateway.url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: gateway.key || "" },
      body: JSON.stringify({
        number,
        id: anchor,
        fromMe,
        count: Math.min(Math.max(options.count ?? 30, 1), 100),
        ...(options.since ? { since: options.since } : {}),
      }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok) {
      const hint = res.status === 504 ? "Celular não respondeu — precisa estar online." : text.slice(0, 160);
      return { ok: false, provider, synced: 0, inbound: 0, acks: 0, error: `Gateway ${res.status}: ${hint}` };
    }
    payload = text ? JSON.parse(text) : [];
  } catch (e: any) {
    const raw = String(e?.message || "");
    const unreachable = /fetch failed|ECONNREFUSED|ENOTFOUND|timed out/i.test(raw);
    return {
      ok: false,
      provider,
      synced: 0,
      inbound: 0,
      acks: 0,
      error: unreachable
        ? `Gateway ${provider} inacessível em ${gateway.url} — verifique se o container/whatsmiau está rodando e a instância pareada.`
        : raw || "Falha ao sincronizar histórico.",
    };
  }

  const messages: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.messages) ? payload.messages : [];
  let inbound = 0;
  let acks = 0;

  for (const item of messages) {
    const key = item?.key || {};
    const externalId = firstString(key.id, item?.id);
    if (key.fromMe === true) {
      if (externalId) {
        const status = normalizeAckStatus(item?.status);
        if (status && updateCommunicationStatusByExternalId(externalId, status)) acks += 1;
      }
      continue;
    }
    const text = extractText(item?.message || item);
    if (!text) continue;
    const timestamp = Number(item?.messageTimestamp || 0);
    const occurredAt = timestamp > 0 ? new Date(timestamp * 1000).toISOString() : undefined;
    const result = recordInboundIfNew({ lead, text, externalId, occurredAt });
    if (result.created) inbound += 1;
  }

  return { ok: true, provider, synced: messages.length, inbound, acks };
}
