import { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { getLeads, getLeadById, recordCommunication, createInteraction, updateLeadResponse, updateLeadStatusByPhone, setDoNotContactByPhone, getSetting, setSetting } from "../store/db";
import { getDb } from "../store/schema";
import { getAutomationSettings } from "./automationRoutes";
import { normalizePhone } from "../services/leadIdentity";
import { resolveWhatsappProvider, type WhatsappProviderChoice } from "../services/contactService";
import { eventHub } from "../events/eventHub";

/**
 * Webhook de recebimento do WhatsApp (Evolution API).
 *
 * A Evolution envia eventos POST para a URL configurada na instância.
 * Este handler:
 *  1. Autentica pelo header `webhook_by_evolution` ou token na query (WHATSAPP_WEBHOOK_TOKEN)
 *  2. Extrai mensagem de texto recebida (event: messages.upsert, key.fromMe = false)
 *  3. Casa o remetente com um lead pelo telefone normalizado
 *  4. Registra a comunicação recebida + marca resposta no lead
 *  5. Classifica a intenção por palavras-chave e move o pipeline:
 *     interesse → negotiating | preço → negotiating | recusar → declined
 *
 * Formato Evolution v2 (messages.upsert):
 * { event: "messages.upsert", instance: "...", data: {
 *     key: { remoteJid: "5511999998888@s.whatsapp.net", fromMe: false },
 *     pushName?: "...", message: { conversation?: "texto", extendedTextMessage?: { text } } } }
 */

const INTENT_RULES: Array<{ intent: string; status?: "negotiating" | "declined" | "contacted"; patterns: RegExp[] }> = [
  // RECUSA primeiro: "não tenho interesse" contém "tenho interesse",
  // e seria capturado pela regra positiva se viesse depois.
  {
    intent: "recusa",
    status: "declined",
    patterns: [/n[aã]o tenho interesse|desculp[ae],? mas n[aã]o|n[aã]o quero|remover meu n[uú]mero|parar de mandar/i],
  },
  {
    intent: "interesse",
    status: "negotiating",
    patterns: [/quero(?! saber)|tenho interesse|me interessa|bora|vamos fechar|como funciona|mais informa/i],
  },
  {
    intent: "preco",
    status: "negotiating",
    patterns: [/quanto custa|qual o valor|pre[çc]o|or[çc]amento|investimento/i],
  },
  {
    intent: "ocupado",
    patterns: [/agora n[aã]o|depois|estou ocupad|sem tempo|retorno depois/i],
  },
];

function classifyIntent(text: string): { intent: string; status?: "negotiating" | "declined" | "contacted" } {
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { intent: rule.intent, status: rule.status };
    }
  }
  return { intent: "outro", status: undefined };
}

/** Extrai a primeira mensagem de texto de um payload Evolution. */
function extractInbound(req: Request): { from: string; text: string; instance: string } | null {
  const body = req.body || {};

  // Eventos ignorados rapidamente
  if (body.event && body.event !== "messages.upsert") return null;

  const data = body.data || body;
  const key = data.key || {};
  if (key.fromMe === true) return null; // eco da própria instância

  const jid: string = key.remoteJid || data.remoteJid || "";
  if (!jid || jid.includes("@g.us")) return null; // ignora grupos

  const from = jid.split("@")[0];
  const m = data.message || {};
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.documentMessage?.caption ||
    "";

  if (!text.trim()) return null;
  return { from, text: text.trim(), instance: body.instance || "" };
}

/** Extrai mensagem de texto de um payload Meta Cloud API. */
function extractInboundMeta(req: Request): { from: string; text: string; instance: string } | null {
  const body = req.body || {};
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of messages) {
        if (msg?.type !== "text" || !msg.text?.body?.trim()) continue;
        const from = String(msg.from || "").replace(/\D/g, "");
        if (!from) continue;
        return { from, text: msg.text.body.trim(), instance: "meta-cloud-api" };
      }
    }
  }
  return null;
}

/**
 * Valida a assinatura X-Hub-Signature-256 da Meta Cloud API.
 * Se META_APP_SECRET não estiver configurado, não bloqueia (modo dev/local).
 * Usa o corpo cru (req.rawBody capturado por express.json verify em server.ts)
 * pois a Meta assina os bytes exatos do POST — JSON.stringify reordena/normaliza.
 */
function verifyMetaSignature(req: Request): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return true; // sem secret configurado: pular validação

  const signature = req.headers["x-hub-signature-256"];
  if (typeof signature !== "string" || !signature.startsWith("sha256=")) return false;

  const raw = (req as any).rawBody ?? JSON.stringify(req.body || {});
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(raw)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature.slice(7), "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function registerWhatsAppWebhook(app: Express) {
  // -----------------------------------------------------------------
  // Status + seletor de backend WhatsApp (UI de Configurações)
  // -----------------------------------------------------------------

  app.get("/api/whatsapp/status", (_req: Request, res: Response) => {
    try {
      const { provider, reason } = resolveWhatsappProvider();
      const hasEvolution = Boolean((process.env.EVOLUTION_API_URL || "").trim());
      const hasMeta = Boolean(
        (process.env.META_WHATSAPP_TOKEN || "").trim() && (process.env.META_PHONE_NUMBER_ID || "").trim()
      );
      const hasLegacy = Boolean((process.env.WHATSAPP_API_URL || "").trim());
      return res.json({
        success: true,
        savedChoice: getSetting("whatsapp_provider") || "auto",
        activeProvider: provider,
        reason,
        available: { evolution: hasEvolution, meta: hasMeta, legacy: hasLegacy },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao consultar status WhatsApp." });
    }
  });

  app.post("/api/whatsapp/provider", (req: Request, res: Response) => {
    const valid: WhatsappProviderChoice[] = ["auto", "evolution", "meta", "legacy"];
    const choice = String(req.body?.provider || "").trim().toLowerCase() as WhatsappProviderChoice;
    if (!valid.includes(choice)) {
      return res.status(400).json({ success: false, error: `Backend inválido. Use: ${valid.join(", ")}.` });
    }
    try {
      if (choice === "auto") {
        setSetting("whatsapp_provider", ""); // vazio = volta para resolução automática
      } else {
        setSetting("whatsapp_provider", choice);
      }
      const { provider, reason } = resolveWhatsappProvider();
      eventHub.emit("whatsapp_provider_changed", { choice, provider, reason });
      return res.json({ success: true, provider, reason });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao salvar backend." });
    }
  });

  // -----------------------------------------------------------------
  // Webhook de recebimento
  // -----------------------------------------------------------------

  // Health/verificação simples (algumas ferramentas fazem GET ao configurar)
  app.get("/api/whatsapp/webhook", (req: Request, res: Response) => {
    // Verificação de assinatura da Meta Cloud API: echo do hub.challenge
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

    if (mode === "subscribe" && expected && token === expected && typeof challenge === "string") {
      return res.type("text/plain").send(challenge);
    }
    res.json({ success: true, service: "leadradar-whatsapp-webhook", ready: true });
  });

  app.post("/api/whatsapp/webhook", async (req: Request, res: Response) => {
    // Assinatura da Meta (se META_APP_SECRET configurado)
    if (!verifyMetaSignature(req)) {
      return res.status(401).json({ success: false, error: "Assinatura X-Hub-Signature-256 inválida." });
    }

    // Auth leve opcional: WHATSAPP_WEBHOOK_TOKEN via query ?token= ou header
    const expected = process.env.WHATSAPP_WEBHOOK_TOKEN;
    if (expected) {
      const provided = req.query.token || req.headers["x-webhook-token"];
      if (provided !== expected) {
        return res.status(401).json({ success: false, error: "Token de webhook inválido." });
      }
    }

    try {
      // Responder rápido à Evolution; processar é síncrono e barato aqui,
      // mas ack imediato evita retries em cascata.
      res.json({ success: true, received: true });
    } catch {
      /* ack sempre */
    }

    const inbound = extractInbound(req) || extractInboundMeta(req);
    if (!inbound) return;

    const normalized = normalizePhone(inbound.from);
    if (!normalized) return;

    // casa lead por telefone normalizado (usa índice normalized_phone)
    const row = getDb().prepare("SELECT * FROM leads WHERE normalized_phone = ? LIMIT 1").get(normalized) as any;
    let lead: any = row ? getLeadById(row.id) : null;
    if (!lead) {
      const leads = getLeads();
      lead = leads.find((l) => l.phone && normalizePhone(l.phone) === normalized) || null;
    }
    if (!lead) return;

    let { intent, status } = classifyIntent(inbound.text);
    // respeita toggles de automação
    let auto: any = null;
    try { auto = getAutomationSettings(); } catch {}
    if (auto && !auto.whatsappAutoIntent) { intent = "outro"; status = undefined; }
    const pipelineEnabled = auto ? auto.whatsappAutoPipeline : true;
    const followUpEnabled = auto ? auto.whatsappAutoFollowUp : true;

    // Opt-out LGPD: pedido de exclusão bloqueia recontatos automaticamente
    let optedOut: boolean = false;
    if (intent === "recusa") {
      try {
        optedOut = Boolean(setDoNotContactByPhone(normalized, true));
      } catch {
        /* best-effort */
      }
    }

    // registra a mensagem recebida
    recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      status: "sent", // recebida com sucesso
      toAddress: lead.phone,
      message: `[RECEBIDA] ${inbound.text}`,
    });

    // marca resposta no lead (zera "frieza")
    try {
      updateLeadResponse(lead.id);
    } catch {
      /* best-effort */
    }

    // move pipeline conforme intenção
    if (status && pipelineEnabled) {
      try {
        updateLeadStatusByPhone(normalized, status);
      } catch {
        /* best-effort */
      }
    }

    // cria interação de follow-up quando há sinal de interesse/preço
    if ((intent === "interesse" || intent === "preco") && followUpEnabled) {
      try {
        createInteraction({
          leadId: lead.id,
          type: "follow_up",
          channel: "whatsapp",
          deliveryStatus: "pending",
          outcome: "positive",
          occurredAt: new Date().toISOString(),
          notes: `[Auto] Lead respondeu com ${intent === "preco" ? "pergunta de preço" : "interesse"}. Enviar proposta/detalhes.`,
          nextContactAt: new Date().toISOString(),
        });
      } catch {
        /* best-effort */
      }
    }

    eventHub.emit("whatsapp_inbound", {
      leadId: lead.id,
      name: lead.name,
      intent,
      movedTo: status || null,
      optedOut,
      text: inbound.text.slice(0, 200),
    });
  });
}
