import nodemailer from "nodemailer";
import { StoredLead } from "../store/types";
import { recordCommunication } from "../store/db";

/* ------------------------------------------------------------------ */
/*  Contact dispatch — só confirma sucesso após um envio real.         */
/*  Toda tentativa, inclusive uma falha de configuração, é registrada   */
/*  em `communications` para auditoria.                                 */
/*                                                                     */
/*  WhatsApp — dois backends, escolhidos por env:                      */
/*                                                                     */
/*  1) EVOLUTION_API_URL + EVOLUTION_API_KEY + EVOLUTION_INSTANCE       */
/*     POST {EVOLUTION_API_URL}/message/sendText/{INSTANCE}            */
/*     Header: apikey: {KEY}                                           */
/*     Body: { number: "5511999998888", text: message }                */
/*    (Evolution API v2 — WhatsApp Web não-oficial, self-hosted)        */
/*                                                                     */
/*  2) WHATSAPP_API_URL (+ WHATSAPP_API_TOKEN opcional)                 */
/*     POST {url} body { token, to, message }                           */
/*    (webhook genérico — n8n, Z-API, ou Meta Cloud API no futuro)      */
/*                                                                     */
/*  E-mail: requer SMTP_HOST e envia via nodemailer.                   */
/* ------------------------------------------------------------------ */

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

export async function sendWhatsApp(
  lead: StoredLead,
  message: string
): Promise<ContactResult> {
  const to = toE164(lead.phone || "");
  const evoUrl = process.env.EVOLUTION_API_URL;
  const legacyUrl = process.env.WHATSAPP_API_URL;

  if (!to) {
    const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", message });
    return { channel: "whatsapp", status: "failed", communicationId: id, to, detail: "Lead sem telefone válido." };
  }

  // Prioridade 1: Evolution API
  if (evoUrl) {
    try {
      const detail = await sendViaEvolution(to, message);
      const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "sent", toAddress: to, message });
      return { channel: "whatsapp", status: "sent", communicationId: id, to, detail };
    } catch (e: any) {
      const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", toAddress: to, message });
      return { channel: "whatsapp", status: "failed", communicationId: id, to, detail: e?.message || "Falha no envio via Evolution API" };
    }
  }

  // Prioridade 2: webhook genérico legado
  if (legacyUrl) {
    try {
      const res = await fetch(legacyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: process.env.WHATSAPP_API_TOKEN, to, message }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "sent", toAddress: to, message });
      return { channel: "whatsapp", status: "sent", communicationId: id, to, detail: `Enviado via ${legacyUrl}` };
    } catch (e: any) {
      const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", toAddress: to, message });
      return { channel: "whatsapp", status: "failed", communicationId: id, to, detail: e?.message || "Falha no envio" };
    }
  }

  const id = recordCommunication({ leadId: lead.id, channel: "whatsapp", status: "failed", toAddress: to, message });
  return {
    channel: "whatsapp",
    status: "failed",
    communicationId: id,
    to,
    detail: "Nenhum backend WhatsApp configurado (EVOLUTION_API_URL ou WHATSAPP_API_URL).",
  };
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
