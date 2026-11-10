import nodemailer from "nodemailer";
import { StoredLead } from "../store/types";
import { recordCommunication, getSetting } from "../store/db";
import { primaryAuditHook } from "./siteAuditService";
import { effectiveWebsiteStatus } from "./presenceService";
import { runPaced, type SendPurpose } from "./humanizeService";

/* ------------------------------------------------------------------ */
/*  Contact dispatch — só confirma sucesso após um envio real.         */
/*  Toda tentativa, inclusive uma falha de configuração, é registrada   */
/*  em `communications` para auditoria.                                 */
/*                                                                     */
/*  WhatsApp — backends escolhidos por WHATSAPP_PROVIDER:               */
/*    "auto" (default) | "evolution" | "whatsmiau" | "meta" | "legacy" */
/*                                                                     */
/*  1) evolution — EVOLUTION_API_URL + EVOLUTION_API_KEY + INSTANCE     */
/*     POST {URL}/message/sendText/{INSTANCE}  header apikey            */
/*     Body: { number: "5511...", text }   (self-hosted, gratuito)      */
/*                                                                     */
/*  2) whatsmiau — WHATSMIAU_API_KEY + WHATSMIAU_INSTANCE               */
/*     POST https://api.whatsmiau.dev/v2/message/sendText/{INSTANCE}     */
/*     Body: { number: "5511...", text }                                */
/*                                                                     */
/*  3) meta — META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID                */
/*     POST https://graph.facebook.com/v18.0/{PHONE_ID}/messages        */
/*     Body: { messaging_product:"whatsapp", to, type:"text",           */
/*             text:{ body } }                                          */
/*    (Cloud API oficial — fora da janela 24h exige template; aqui       */
/*     enviamos texto livre: use somente em conversas abertas ou teste)  */
/*                                                                     */
/*  4) legacy — WHATSAPP_API_URL webhook genérico { token, to, message } */
/*                                                                     */
/*  "auto" resolve na ordem evolution → whatsmiau → meta → legacy.      */
/*                                                                     */
/*  E-mail: requer SMTP_HOST e envia via nodemailer.                   */
/* ------------------------------------------------------------------ */

export type WhatsappProvider = "evolution" | "whatsmiau" | "meta" | "legacy";
export type WhatsappProviderChoice = "auto" | WhatsappProvider;

/** Resolve o backend efetivo: setting persistido (UI) > env WHATSAPP_PROVIDER > auto. */
export function resolveWhatsappProvider(): { provider: WhatsappProvider | null; reason: string } {
  // A escolha feita na UI (persistida no SQLite) tem precedência sobre o .env
  let choice: string;
  try {
    const saved = getSetting("whatsapp_provider");
    if (saved) {
      choice = saved;
    } else {
      choice = (process.env.WHATSAPP_PROVIDER || "auto").trim().toLowerCase();
    }
  } catch {
    choice = (process.env.WHATSAPP_PROVIDER || "auto").trim().toLowerCase();
  }
  const source = getSetting("whatsapp_provider") ? "selecionado na UI" : "definido via .env";

  const hasEvolution = Boolean((process.env.EVOLUTION_API_URL || "").trim());
  const hasWhatsmiau = Boolean((process.env.WHATSMIAU_API_URL || "").trim() && (process.env.WHATSMIAU_API_KEY || "").trim());
  const hasMeta = Boolean((process.env.META_WHATSAPP_TOKEN || "").trim() && (process.env.META_PHONE_NUMBER_ID || "").trim());
  const hasLegacy = Boolean((process.env.WHATSAPP_API_URL || "").trim());

  if (choice === "evolution") {
    return hasEvolution
      ? { provider: "evolution", reason: "selecionado manualmente" }
      : { provider: null, reason: "WHATSAPP_PROVIDER=evolution mas EVOLUTION_API_URL não configurada." };
  }
  if (choice === "whatsmiau") {
    return hasWhatsmiau
      ? { provider: "whatsmiau", reason: "selecionado manualmente" }
      : { provider: null, reason: "WHATSAPP_PROVIDER=whatsmiau mas WHATSMIAU_API_URL/WHATSMIAU_API_KEY não configurados." };
  }
  if (choice === "meta") {
    return hasMeta
      ? { provider: "meta", reason: "selecionado manualmente" }
      : { provider: null, reason: "WHATSAPP_PROVIDER=meta mas META_WHATSAPP_TOKEN/META_PHONE_NUMBER_ID não configurados." };
  }
  if (choice === "legacy") {
    return hasLegacy
      ? { provider: "legacy", reason: "selecionado manualmente" }
      : { provider: null, reason: "WHATSAPP_PROVIDER=legacy mas WHATSAPP_API_URL não configurada." };
  }

  // auto: ordem evolution → whatsmiau → meta → legacy
  if (hasEvolution) return { provider: "evolution", reason: "auto (Evolution configurada)" };
  if (hasWhatsmiau) return { provider: "whatsmiau", reason: "auto (Whatsmiau configurada)" };
  if (hasMeta) return { provider: "meta", reason: "auto (Meta configurada)" };
  if (hasLegacy) return { provider: "legacy", reason: "auto (webhook genérico configurado)" };
  return { provider: null, reason: "Nenhum backend WhatsApp configurado." };
}

export type ContactChannel = "whatsapp" | "email";
export type ContactStatus = "sent" | "failed";

export interface ContactResult {
  channel: ContactChannel;
  status: ContactStatus;
  communicationId: string;
  to: string;
  detail: string;
  /** true quando a humanização (janela/teto/pausa) barrou o envio. */
  blocked?: boolean;
  /** Quando o próximo envio é liberado (ISO) — só em bloqueios por janela/teto/pausa. */
  nextAllowedAt?: string;
}

/** Normaliza telefone para E.164 (Brasil: 10-11 dígitos recebem o prefixo 55). */
export function normalizeToE164(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (![10, 11, 12, 13].includes(digits.length)) return "";
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

// Timeout para chamadas às APIs de WhatsApp — evita job travado em endpoint lento
const WHATSAPP_FETCH_TIMEOUT_MS = Number(process.env.WHATSAPP_FETCH_TIMEOUT_MS || 15000);

interface SendOutcome {
  detail: string;
  /** `key.id` (Evolution/WhatsMiau) ou `messages[0].id` (Meta) — base do ACK. */
  externalId?: string;
}

/** Lê o corpo JSON do provedor (tolerante a mocks/respostas vazias). */
async function readResponsePayload(res: Response): Promise<any> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Extrai o id da mensagem no formato de cada provedor. */
function readProviderMessageId(payload: any): string | undefined {
  const candidate =
    payload?.key?.id ??
    payload?.message?.key?.id ??
    payload?.data?.key?.id ??
    payload?.messages?.[0]?.id ??
    payload?.id;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

/** Envio via Evolution API (self-hosted). Retorna detail com resultado. */
async function sendViaEvolution(to: string, message: string): Promise<SendOutcome> {
  const baseUrl = (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || "leadradar";

  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey || "" },
    body: JSON.stringify({ number: to, text: message }),
    signal: AbortSignal.timeout(WHATSAPP_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Evolution API HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
  }
  const payload = await readResponsePayload(res);
  return { detail: `Enviado via Evolution API (${instance})`, externalId: readProviderMessageId(payload) };
}

/** Envio via WhatsMiau self-hosted (fork da Evolution, endpoints com prefixo /v1). */
async function sendViaWhatsmiau(to: string, message: string): Promise<SendOutcome> {
  const baseUrl = (process.env.WHATSMIAU_API_URL || "").replace(/\/$/, "");
  const apiKey = process.env.WHATSMIAU_API_KEY;
  const instance = process.env.WHATSMIAU_INSTANCE || "leadradar";

  // Body conforme DTO real do WhatsMiau (server/dto/message.go: SendTextRequest):
  // { "number": "<JID>", "text": "<mensagem>" }. O campo é "text" — NÃO "textMessage".
  const res = await fetch(`${baseUrl}/v1/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey || "" },
    body: JSON.stringify({ number: to, text: message }),
    signal: AbortSignal.timeout(WHATSAPP_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WhatsMiau HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
  }
  const payload = await readResponsePayload(res);
  return { detail: `Enviado via WhatsMiau (${instance})`, externalId: readProviderMessageId(payload) };
}

/** Envio via Meta WhatsApp Cloud API (oficial). Texto livre — janela 24h. */
async function sendViaMeta(to: string, message: string): Promise<SendOutcome> {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phoneId = process.env.META_PHONE_NUMBER_ID;
  const version = process.env.META_GRAPH_VERSION || "v18.0";

  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: message },
    }),
    signal: AbortSignal.timeout(WHATSAPP_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meta Cloud API HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  const payload = await readResponsePayload(res);
  return { detail: `Enviado via Meta Cloud API (${phoneId})`, externalId: readProviderMessageId(payload) };
}

/**
 * Envia a mensagem pelo backend ativo e registra a comunicação.
 * Centraliza o caminho de envio (usado tanto por lead cadastrado quanto por
 * número avulso) para garantir auditoria em `communications`.
 *
 * TODO envio passa pela humanização (`runPaced`): janela de horário, tetos
 * diários, pausa entre envios e delay de digitação. Quando o gate barra, nada
 * é enviado e a comunicação fica `failed` com o motivo (reenviável pela outbox).
 */
async function deliverWhatsApp(
  leadId: string,
  to: string,
  message: string,
  hook?: string,
  purpose: SendPurpose = "prospect"
): Promise<ContactResult> {
  const { provider, reason } = resolveWhatsappProvider();
  if (!provider) {
    const id = recordCommunication({ leadId, channel: "whatsapp", status: "failed", toAddress: to, message, hook });
    return { channel: "whatsapp", status: "failed", communicationId: id, to, detail: reason };
  }

  try {
    const paced = await runPaced({
      leadId,
      purpose,
      message,
      task: () => sendThroughProvider(provider, to, message),
    });

    if (paced.blocked) {
      const id = recordCommunication({ leadId, channel: "whatsapp", status: "failed", toAddress: to, message, hook });
      return {
        channel: "whatsapp",
        status: "failed",
        communicationId: id,
        to,
        detail: paced.blocked.reason || "Envio bloqueado pela humanização do WhatsApp.",
        blocked: true,
        nextAllowedAt: paced.blocked.nextAllowedAt,
      };
    }

    const outcome = (paced.value as SendOutcome) || { detail: `Enviado via ${provider}` };
    const id = recordCommunication({
      leadId,
      channel: "whatsapp",
      status: "sent",
      toAddress: to,
      message,
      hook,
      externalId: outcome.externalId,
      sentAt: new Date().toISOString(),
    });
    const typing =
      paced.typingMs && paced.typingMs > 0
        ? ` — simulação de digitação ${(paced.typingMs / 1000).toFixed(1)}s`
        : "";
    return { channel: "whatsapp", status: "sent", communicationId: id, to, detail: `${outcome.detail}${typing}` };
  } catch (e: any) {
    const id = recordCommunication({ leadId, channel: "whatsapp", status: "failed", toAddress: to, message, hook });
    return {
      channel: "whatsapp",
      status: "failed",
      communicationId: id,
      to,
      detail: `${e?.message || "Falha no envio"} (backend: ${provider} — ${reason})`,
    };
  }
}

/** Despacha para o backend já resolvido. Erros sobem para o chamador. */
async function sendThroughProvider(provider: WhatsappProvider, to: string, message: string): Promise<SendOutcome> {
  if (provider === "evolution") return sendViaEvolution(to, message);
  if (provider === "whatsmiau") return sendViaWhatsmiau(to, message);
  if (provider === "meta") return sendViaMeta(to, message);

  const legacyUrl = process.env.WHATSAPP_API_URL;
  const res = await fetch(legacyUrl as string, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: process.env.WHATSAPP_API_TOKEN, to, message }),
    signal: AbortSignal.timeout(WHATSAPP_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const payload = await readResponsePayload(res);
  return {
    detail: `Enviado via webhook legado (${legacyUrl})`,
    externalId: readProviderMessageId(payload),
  };
}

/** Gancho comercial padrão do lead — usado nas métricas por defeito. */
export function defaultHookForLead(lead: StoredLead): string {
  const status = effectiveWebsiteStatus(lead);
  if (status === "none") return "sem_site";
  if (status === "marketplace_only") return "marketplace";
  if (status === "social_only") return "social_only";
  if (lead.siteAudit) return primaryAuditHook(lead.siteAudit);
  return "generico";
}

export async function sendWhatsApp(
  lead: StoredLead,
  message: string,
  hook?: string,
  purpose: SendPurpose = "prospect"
): Promise<ContactResult> {
  const to = normalizeToE164(lead.phone || "");

  if (!to) {
    const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", message, hook });
    return { channel: "whatsapp", status: "failed", communicationId: id, to, detail: "Lead sem telefone válido." };
  }

  return deliverWhatsApp(lead.id, to, message, hook ?? defaultHookForLead(lead), purpose);
}

/**
 * Envia WhatsApp para um número informado diretamente (sem exigir leadId
 * pré-existente). O `leadId` é usado apenas para vincular a comunicação ao
 * histórico — o registro do lead é criado pelo chamador.
 */
export async function sendWhatsAppToNumber(input: {
  leadId: string;
  phone: string;
  message: string;
  hook?: string;
  purpose?: SendPurpose;
}): Promise<ContactResult> {
  const to = normalizeToE164(input.phone);
  if (!to) {
    throw new Error("Telefone inválido: informe DDD + número (10 a 13 dígitos).");
  }
  return deliverWhatsApp(input.leadId, to, input.message, input.hook, input.purpose ?? "prospect");
}

export async function sendEmail(
  lead: StoredLead,
  subject: string,
  message: string,
  hook?: string
): Promise<ContactResult> {
  const to = lead.email || "";
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;

  if (!to) {
    const id = recordCommunication({ leadId: lead.id, channel: "email", status: "failed", subject, message, hook });
    return { channel: "email", status: "failed", communicationId: id, to, detail: "Lead sem e-mail." };
  }

  if (host) {
    if (!from) {
      const id = recordCommunication({ leadId: lead.id, channel: "email", status: "failed", toAddress: to, subject, message, hook });
      return { channel: "email", status: "failed", communicationId: id, to, detail: "SMTP_FROM não configurado; nenhum e-mail foi enviado." };
    }
    try {
      const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      await transporter.sendMail({ from, to, subject, text: message });
      const id = recordCommunication({ leadId: lead.id, channel: "email", status: "sent", toAddress: to, subject, message, hook });
      return { channel: "email", status: "sent", communicationId: id, to, detail: `Enviado via ${host}` };
    } catch (e: any) {
      const id = recordCommunication({ leadId: lead.id, channel: "email", status: "failed", toAddress: to, subject, message, hook });
      return { channel: "email", status: "failed", communicationId: id, to, detail: e?.message || "Falha no envio" };
    }
  }

  const id = recordCommunication({ leadId: lead.id, channel: "email", status: "failed", toAddress: to, subject, message, hook });
  return { channel: "email", status: "failed", communicationId: id, to, detail: "SMTP_HOST não configurado; nenhum e-mail foi enviado." };
}

export interface ContactOptions {
  channel?: ContactChannel;
  message?: string;
  subject?: string;
  /** Gancho comercial usado (código do defeito) — alimenta as métricas. */
  hook?: string;
  /** Ignora a janela de recontato (usado pela cadência D0/D3/D7). */
  ignoreCooldown?: boolean;
  /**
   * Tipo de envio para a humanização: "reply" (conversa aberta, janela larga)
   * ou "prospect" (primeiro contato/cadência, janela seg–sex 8–18).
   * Default: "prospect" (o mais restritivo).
   */
  purpose?: SendPurpose;
}

/**
 * High-level: contacts a lead using the best available channel.
 * - If channel is not specified, prefers WhatsApp (phone) when available, else email.
 * - Uses the AI-generated pitch when no explicit message is provided.
 */
export async function contactLead(
  lead: StoredLead,
  opts: ContactOptions = {}
): Promise<ContactResult> {
  const analysis = lead.analysis || {};
  const message = opts.message?.trim();
  const waPitch = message || analysis.customPitchWhatsApp;
  const emailPitch = message || analysis.customPitchEmail;
  const channel = opts.channel || (lead.phone ? "whatsapp" : "email");
  const selectedMessage = channel === "email" ? emailPitch : waPitch;

  if (!selectedMessage || typeof selectedMessage !== "string" || !selectedMessage.trim()) {
    throw new Error(
      `Não foi possível contatar ${lead.name}: informe uma mensagem ou persista um pitch gerado pela IA antes de enviar.`
    );
  }

  if (channel === "email") {
    const subject = opts.subject || `Proposta de Landing Page para ${lead.name}`;
    return sendEmail(lead, subject, selectedMessage, opts.hook || defaultHookForLead(lead));
  }

  return sendWhatsApp(lead, selectedMessage, opts.hook || defaultHookForLead(lead), opts.purpose);
}
