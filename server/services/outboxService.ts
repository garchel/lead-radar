import { getCommunicationById, getCommunications, getLeadById, type Communication } from "../store/db";
import type { StoredLead } from "../store/types";
import { sendEmail, sendWhatsApp } from "./contactService";

/**
 * Outbox: envios que precisam de atenÃ§Ã£o.
 *
 *  - `failed`: o backend recusou/estourou; pode ser reenviado manualmente.
 *  - `unconfirmed`: enviado hÃ¡ mais de 24h e ainda sem ACK de entrega/leitura
 *    (o webhook pode ter sido perdido â€” use a reconciliaÃ§Ã£o).
 *
 * NÃ£o hÃ¡ retry automÃ¡tico: um timeout de envio pode ter chegado ao cliente, e
 * reenviar sozinho duplicaria a conversa.
 */

export interface OutboxItem {
  communicationId: string;
  leadId: string;
  leadName: string;
  phone?: string;
  channel: string;
  hook?: string;
  message: string;
  createdAt: string;
  ageHours: number;
}

export interface OutboxSnapshot {
  failed: OutboxItem[];
  unconfirmed: OutboxItem[];
  counts: { failed: number; unconfirmed: number };
}

const UNCONFIRMED_AFTER_HOURS = 24;
const FAILED_WINDOW_DAYS = 7;

function ageHours(iso: string, now: Date): number {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.round(((now.getTime() - ts) / (1000 * 60 * 60)) * 10) / 10);
}

function toItem(comm: Communication, lead: StoredLead | undefined, now: Date): OutboxItem {
  return {
    communicationId: comm.id,
    leadId: comm.leadId,
    leadName: lead?.name || comm.leadId,
    phone: lead?.phone,
    channel: comm.channel,
    hook: comm.hook,
    message: comm.message || "",
    createdAt: comm.createdAt,
    ageHours: ageHours(comm.createdAt, now),
  };
}

export function listOutbox(opts: { now?: Date; limit?: number } = {}): OutboxSnapshot {
  const now = opts.now || new Date();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const failedSince = new Date(now.getTime() - FAILED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const unconfirmedBefore = new Date(now.getTime() - UNCONFIRMED_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  const failed: OutboxItem[] = [];
  const unconfirmed: OutboxItem[] = [];

  for (const comm of getCommunications()) {
    if (comm.direction !== "outbound") continue;
    const lead = getLeadById(comm.leadId);
    if (comm.status === "failed" && comm.createdAt >= failedSince) {
      failed.push(toItem(comm, lead, now));
    } else if (comm.status === "sent" && comm.createdAt < unconfirmedBefore) {
      unconfirmed.push(toItem(comm, lead, now));
    }
  }

  failed.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  unconfirmed.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    failed: failed.slice(0, limit),
    unconfirmed: unconfirmed.slice(0, limit),
    counts: { failed: failed.length, unconfirmed: unconfirmed.length },
  };
}

export interface RetryResult {
  ok: boolean;
  leadId: string;
  communicationId?: string;
  status?: string;
  detail: string;
}

const retriesInFlight = new Set<string>();

/** Reenvia manualmente uma comunicaÃ§Ã£o `failed` (nunca uma `sent`). */
export async function retryOutbound(communicationId: string): Promise<RetryResult> {
  const comm = getCommunicationById(communicationId);
  if (!comm) {
    return { ok: false, leadId: "", detail: "ComunicaÃ§Ã£o nÃ£o encontrada." };
  }
  if (comm.direction !== "outbound") {
    return { ok: false, leadId: comm.leadId, detail: "SÃ³ Ã© possÃ­vel reenviar mensagens de saÃ­da." };
  }
  if (comm.status !== "failed") {
    return {
      ok: false,
      leadId: comm.leadId,
      detail: `SÃ³ reenviamos mensagens com status "failed" (atual: ${comm.status}).`,
    };
  }
  if (retriesInFlight.has(communicationId)) {
    return { ok: false, leadId: comm.leadId, detail: "Reenvio jÃ¡ em andamento para esta mensagem." };
  }

  const lead = getLeadById(comm.leadId);
  if (!lead) {
    return { ok: false, leadId: comm.leadId, detail: "Lead da mensagem nÃ£o existe mais." };
  }
  if (lead.doNotContact) {
    return { ok: false, leadId: lead.id, detail: "Lead pediu opt-out â€” reenvio bloqueado." };
  }

  const alreadySent = getCommunications().some(
    (item) =>
      item.leadId === comm.leadId &&
      item.direction === "outbound" &&
      item.status !== "failed" &&
      item.status !== "pending" &&
      item.message === comm.message &&
      item.createdAt > comm.createdAt
  );
  if (alreadySent) {
    return {
      ok: false,
      leadId: lead.id,
      detail: "JÃ¡ existe um envio bem-sucedido dessa mesma mensagem depois da falha.",
    };
  }

  retriesInFlight.add(communicationId);
  try {
    const result =
      comm.channel === "email"
        ? await sendEmail(lead, comm.subject || "Mensagem", comm.message || "", comm.hook)
        : await sendWhatsApp(lead, comm.message || "", comm.hook);
    return {
      ok: result.status === "sent",
      leadId: lead.id,
      communicationId: result.communicationId,
      status: result.status,
      detail: result.detail,
    };
  } finally {
    retriesInFlight.delete(communicationId);
  }
}
