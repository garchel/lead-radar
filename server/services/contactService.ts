import nodemailer from "nodemailer";
import { StoredLead } from "../store/types";
import { recordCommunication, getSetting } from "../store/db";

/* ------------------------------------------------------------------ */
/*  Contact dispatch — só confirma sucesso após um envio real.         */
/*  Toda tentativa, inclusive uma falha de configuração, é registrada   */
/*  em `communications` para auditoria.                                 */
/*                                                                     */
/*  WhatsApp — três backends, escolhidos por WHATSAPP_PROVIDER:         */
/*    "auto" (default) | "evolution" | "meta" | "legacy"                */
/*                                                                     */
/*  1) evolution — EVOLUTION_API_URL + EVOLUTION_API_KEY + INSTANCE     */
/*     POST {URL}/message/sendText/{INSTANCE}  header apikey            */
/*     Body: { number: "5511...", text }   (self-hosted, gratuito)      */
/*                                                                     */
/*  2) meta — META_WHATSAPP_TOKEN + META_PHONE_NUMBER_ID                */
/*     POST https://graph.facebook.com/v18.0/{PHONE_ID}/messages        */
/*     Body: { messaging_product:"whatsapp", to, type:"text",           */
/*             text:{ body } }                                          */
/*    (Cloud API oficial — fora da janela 24h exige template; aqui       */
/*     enviamos texto livre: use somente em conversas abertas ou teste)  */
/*                                                                     */
/*  3) legacy — WHATSAPP_API_URL webhook genérico { token, to, message } */
/*                                                                     */
/*  "auto" resolve na ordem evolution → meta → legacy.                  */
/*                                                                     */
/*  E-mail: requer SMTP_HOST e envia via nodemailer.                   */
/* ------------------------------------------------------------------ */

export type WhatsappProvider = "evolution" | "meta" | "legacy";
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
  const hasMeta = Boolean((process.env.META_WHATSAPP_TOKEN || "").trim() && (process.env.META_PHONE_NUMBER_ID || "").trim());
  const hasLegacy = Boolean((process.env.WHATSAPP_API_URL || "").trim());

  if (choice === "evolution") {
    return hasEvolution
      ? { provider: "evolution", reason: "selecionado manualmente" }
      : { provider: null, reason: "WHATSAPP_PROVIDER=evolution mas EVOLUTION_API_URL não configurada." };
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

  // auto: ordem evolution → meta → legacy
  if (hasEvolution) return { provider: "evolution", reason: "auto (Evolution configurada)" };
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
}

function toE164(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (![10, 11, 12, 13].includes(digits.length)) return "";
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

/** Envio via Evolution API (self-hosted). Retorna detail com resultado. */
async function sendViaEvolution(to: string, message: string): Promise<string> {
  const baseUrl = (process.env.EVOLUTION_API_URL || "").replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE || "leadradar";

  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey || "" },
    body: JSON.stringify({ number: to, text: message }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Evolution API HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`);
  }
  return `Enviado via Evolution API (${instance})`;
}

/** Envio via Meta WhatsApp Cloud API (oficial). Texto livre — janela 24h. */
async function sendViaMeta(to: string, message: string): Promise<string> {
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
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Meta Cloud API HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  return `Enviado via Meta Cloud API (${phoneId})`;
}

export async function sendWhatsApp(
  lead: StoredLead,
  message: string
): Promise<ContactResult> {
  const to = toE164(lead.phone || "");

  if (!to) {
    const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", message });
    return { channel: "whatsapp", status: "failed", communicationId: id, to, detail: "Lead sem telefone válido." };
  }

  const { provider, reason } = resolveWhatsappProvider();
  if (!provider) {
    const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", toAddress: to, message });
    return { channel: "whatsapp", status: "failed", communicationId: id, to, detail: reason };
  }

  try {
    let detail: string;
    if (provider === "evolution") {
      detail = await sendViaEvolution(to, message);
    } else if (provider === "meta") {
      detail = await sendViaMeta(to, message);
    } else {
      const legacyUrl = process.env.WHATSAPP_API_URL;
      const res = await fetch(legacyUrl as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: process.env.WHATSAPP_API_TOKEN, to, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      detail = `Enviado via webhook legado (${legacyUrl})`;
    }
    const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "sent", toAddress: to, message });
    return { channel: "whatsapp", status: "sent", communicationId: id, to, detail };
  } catch (e: any) {
    const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", toAddress: to, message });
    return {
      channel: "whatsapp",
      status: "failed",
      communicationId: id,
      to,
      detail: `${e?.message || "Falha no envio"} (backend: ${provider} — ${reason})`,
    };
  }
}

export async function sendEmail(
  lead: StoredLead,
  subject: string,
  message: string
): Promise<ContactResult> {
  const to = lead.email || "";
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;

  if (!to) {
    const id = recordCommunication({ leadId: lead.id, channel: "email", status: "failed", subject, message });
    return { channel: "email", status: "failed", communicationId: id, to, detail: "Lead sem e-mail." };
  }

  if (host) {
    if (!from) {
      const id = recordCommunication({ leadId: lead.id, channel: "email", status: "failed", toAddress: to, subject, message });
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
      const id = recordCommunication({ leadId: lead.id, channel: "email", status: "sent", toAddress: to, subject, message });
      return { channel: "email", status: "sent", communicationId: id, to, detail: `Enviado via ${host}` };
    } catch (e: any) {
      const id = recordCommunication({ leadId: lead.id, channel: "email", status: "failed", toAddress: to, subject, message });
      return { channel: "email", status: "failed", communicationId: id, to, detail: e?.message || "Falha no envio" };
    }
  }

  const id = recordCommunication({ leadId: lead.id, channel: "email", status: "failed", toAddress: to, subject, message });
  return { channel: "email", status: "failed", communicationId: id, to, detail: "SMTP_HOST não configurado; nenhum e-mail foi enviado." };
}

export interface ContactOptions {
  channel?: ContactChannel;
  message?: string;
  subject?: string;
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
    return sendEmail(lead, subject, selectedMessage);
  }

  return sendWhatsApp(lead, selectedMessage);
}
