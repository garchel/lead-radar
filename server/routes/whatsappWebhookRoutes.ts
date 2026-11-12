import { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { getLeads, getLeadById, updateCommunicationMessage, createInteraction, updateLeadResponse, updateLeadStatusByPhone, setDoNotContactByPhone, setCommunicationIntent, getSetting, setSetting, upsertLead } from "../store/db";
import { getDb } from "../store/schema";
import { getAutomationSettings } from "./automationRoutes";
import { normalizePhone, phoneVariants, buildStableLeadId } from "../services/leadIdentity";
import { resolveWhatsappProvider, type WhatsappProviderChoice } from "../services/contactService";
import { handleAckEvent, recordInboundIfNew, reconcileLeadMessages } from "../services/whatsappInboundService";
import { detectOptOut } from "../services/optOutService";
import { fetchGatewayInstanceState, getGatewayConfig } from "../services/whatsappGateway";
import { getHumanizeStatus } from "../services/humanizeService";
import { buildClientProfile } from "../services/clientProfileService";
import { agentEnabled, answerLead } from "../services/salesAgentService";
import { pitchTestLeadOnFirstMessage, shouldPitchTestLead } from "../services/testLeadService";
import { findBotClientByInstance } from "../services/botKnowledgeService";
import { handleBotInbound, handleOwnerEcho } from "../services/botConversationService";
import {
  AI_MIN_CONFIDENCE,
  classifyByRules,
  classifyWithAI,
  type IntentDecision,
} from "../services/intentService";
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

/** Extrai a primeira mensagem de texto de um payload Evolution. */
function extractInbound(req: Request): {
  from: string;
  text: string;
  instance: string;
  pushName?: string;
  messageId?: string;
  stanzaId?: string;
  isEdit?: boolean;
} | null {
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
  const pushName = data.pushName || key.pushName || body.pushName || "";
  const messageType = data.messageType || m.type || "";
  return {
    from,
    text: text.trim(),
    instance: body.instance || "",
    pushName: pushName || undefined,
    messageId: key.id || data.id || undefined,
    stanzaId: data.contextInfo?.stanzaId || undefined,
    isEdit: messageType === "editedMessage" || m.type === "editedMessage",
  };
}

/**
 * Extrai mensagem que SAIU do próprio número (fromMe = true).
 *
 * Para o bot de cliente isso importa: se quem digitou foi o dono do negócio, o bot
 * tem que calar; se foi o próprio bot, o eco é ignorado (reconhecido pelo id).
 */
function extractEcho(req: Request): { instance: string; toPhone: string; text: string; messageId?: string } | null {
  const body = req.body || {};
  if (body.event && body.event !== "messages.upsert") return null;
  const data = body.data || body;
  const key = data.key || {};
  if (key.fromMe !== true) return null;

  const jid: string = key.remoteJid || data.remoteJid || "";
  if (!jid || jid.includes("@g.us")) return null;

  const m = data.message || {};
  const text =
    m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.documentMessage?.caption || "";
  if (!String(text).trim()) return null;

  return {
    instance: body.instance || "",
    toPhone: jid.split("@")[0],
    text: String(text).trim(),
    messageId: key.id || data.id || undefined,
  };
}

/** Extrai mensagem de texto de um payload Meta Cloud API. */
function extractInboundMeta(req: Request): {
  from: string;
  text: string;
  instance: string;
  pushName?: string;
  messageId?: string;
  stanzaId?: string;
  isEdit?: boolean;
} | null {
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
        const contacts = value.contacts || [];
        const profile = contacts.find((c: any) => c?.wa_id === from);
        return {
          from,
          text: msg.text.body.trim(),
          instance: "meta-cloud-api",
          pushName: profile?.profile?.name || undefined,
          messageId: msg.id || undefined,
        };
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
        available: {
          evolution: hasEvolution,
          whatsmiau: Boolean((process.env.WHATSMIAU_API_URL || "").trim() && (process.env.WHATSMIAU_API_KEY || "").trim()),
          meta: hasMeta,
          legacy: hasLegacy,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao consultar status WhatsApp." });
    }
  });

  app.get("/api/whatsapp/health", async (_req: Request, res: Response) => {
    const startedAt = Date.now();
    const config = getGatewayConfig();
    if (!config) {
      return res.json({
        success: true,
        configured: false,
        ok: false,
        provider: "whatsmiau",
        error: "Gateway não configurado (WHATSMIAU_API_URL/WHATSMIAU_API_KEY).",
      });
    }
    try {
      const instance = await fetchGatewayInstanceState();
      return res.json({
        success: true,
        configured: true,
        ok: instance.connected,
        provider: "whatsmiau",
        instance: instance.id,
        state: instance.state,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error: any) {
      return res.json({
        success: true,
        configured: true,
        ok: false,
        provider: "whatsmiau",
        state: "unreachable",
        latencyMs: Date.now() - startedAt,
        error: error?.message || "Gateway inacessível.",
      });
    }
  });

  // -----------------------------------------------------------------
  // Humanização: estado atual (janelas, tetos e consumo do dia)
  // -----------------------------------------------------------------

  app.get("/api/whatsapp/humanize", (_req: Request, res: Response) => {
    try {
      return res.json({ success: true, ...getHumanizeStatus() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao consultar a humanização." });
    }
  });

  app.post("/api/whatsapp/provider", (req: Request, res: Response) => {
    const valid: WhatsappProviderChoice[] = ["auto", "evolution", "whatsmiau", "meta", "legacy"];
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
  // Reconciliação manual (webhook perdido / mensagens recebidas offline)
  // -----------------------------------------------------------------

  app.post("/api/whatsapp/reconcile", async (req: Request, res: Response) => {
    try {
      const leadId = String(req.body?.leadId || "").trim();
      const phone = String(req.body?.phone || "").trim();
      const count = Number(req.body?.count) || undefined;
      const since = String(req.body?.since || "").trim() || undefined;
      const anchor = String(req.body?.anchor || "").trim() || undefined;
      const fromMe = typeof req.body?.fromMe === "boolean" ? req.body.fromMe : undefined;

      let lead: any = leadId ? getLeadById(leadId) : null;
      if (!lead && phone) {
        const normalized = normalizePhone(phone);
        const row = normalized
          ? (getDb().prepare("SELECT * FROM leads WHERE normalized_phone = ? LIMIT 1").get(normalized) as any)
          : null;
        lead = row ? getLeadById(row.id) : null;
      }
      if (!lead) {
        return res.status(404).json({ success: false, error: "Lead não encontrado. Informe leadId ou phone." });
      }

      const result = await reconcileLeadMessages(lead, { count, since, anchor, fromMe });
      const status = result.ok ? 200 : result.reason === "no_anchor" ? 400 : 502;
      return res.status(status).json({ success: result.ok, leadId: lead.id, ...result });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao reconciliar mensagens." });
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
    if (!inbound) {
      // Eco do próprio número de um cliente com bot: dono digitando ou mensagem
      // nossa voltando do gateway.
      const eco = extractEcho(req);
      if (eco && findBotClientByInstance(eco.instance)) {
        void handleOwnerEcho({ ...eco, externalId: eco.messageId })
          .then((r) => console.log(`[bot] eco ${eco.instance}: ${r.detail}`))
          .catch((e: any) => console.warn(`[bot] eco falhou: ${e?.message}`));
        return;
      }
      // ACK de entrega/leitura das mensagens que enviamos (messages.update / statuses).
      try {
        handleAckEvent(req.body);
      } catch (e: any) {
        console.warn(`[whatsapp] Falha ao aplicar ACK: ${e?.message}`);
      }
      return;
    }

    // BOT DE CLIENTE: a instância pertence a um cliente cadastrado, então a
    // mensagem é conversa dele, não lead da Vértice. Roteia e para aqui.
    if (findBotClientByInstance(inbound.instance)) {
      void handleBotInbound({
        instance: inbound.instance,
        from: inbound.from,
        text: inbound.text,
        pushName: inbound.pushName,
      })
        .then((r) => console.log(`[bot] ${inbound.instance}: ${r.detail || (r.escalated ? "escalou" : "respondeu")}`))
        .catch((e: any) => console.warn(`[bot] falhou (${inbound.instance}): ${e?.message}`));
      return;
    }

    const normalized = normalizePhone(inbound.from);
    if (!normalized) return;

    // respeita toggles de automação
    let auto: any = null;
    try { auto = getAutomationSettings(); } catch {}

    // Casa o lead por telefone. O WhatsApp pode mandar o celular SEM o 9º dígito
    // (55 61 9525-4732) enquanto o cadastro tem com ele (55 61 99525-4732):
    // buscamos todas as variantes antes de concluir que é número novo.
    const variants = phoneVariants(inbound.from);
    const placeholders = variants.map(() => "?").join(",");
    const row = variants.length
      ? (getDb()
          .prepare(`SELECT * FROM leads WHERE normalized_phone IN (${placeholders}) LIMIT 1`)
          .get(...variants) as any)
      : null;
    let lead: any = row ? getLeadById(row.id) : null;
    if (!lead) {
      const leads = getLeads();
      lead = leads.find((l) => l.phone && variants.includes(normalizePhone(l.phone))) || null;
    }

    // Número desconhecido: cria o lead (lead inbound) para que a mensagem não
    // se perca e o agente possa responder.
    if (!lead) {
      const autoCreate = auto ? auto.whatsappAutoCreateLead !== false : true;
      if (!autoCreate) {
        console.warn(`[whatsapp] Mensagem de ${normalized} ignorada: nenhum lead com esse número.`);
        return;
      }
      try {
        const now = new Date().toISOString();
        const created = upsertLead({
          id: buildStableLeadId({ name: inbound.pushName || `WhatsApp ${normalized}`, phone: inbound.from }),
          name: inbound.pushName || `WhatsApp ${normalized}`,
          phone: inbound.from,
          pipelineStatus: "prospect",
          notes: `[Inbound] Mandou mensagem no WhatsApp em ${now}.`,
          savedAt: now,
          updatedAt: now,
        } as any);
        lead = created;
        console.log(`[whatsapp] Lead criado a partir do inbound: ${lead.id} (${normalized}).`);
      } catch (e: any) {
        console.error(`[whatsapp] Falha ao criar lead a partir do inbound ${normalized}: ${e?.message}`);
        return;
      }
    }

    // 1ª passada: regex (rápido e determinístico). Frase ambígua cai em `outro`
    // e a IA decide em segundo plano, depois do ACK.
    const autoIntentEnabled = auto ? auto.whatsappAutoIntent !== false : true;
    const rulesDecision: IntentDecision = autoIntentEnabled
      ? classifyByRules(inbound.text)
      : { intent: "outro", source: "none", confidence: 0 };
    let intent: string = rulesDecision.intent;
    let status = rulesDecision.status;
    const pipelineEnabled = auto ? auto.whatsappAutoPipeline : true;
    const followUpEnabled = auto ? auto.whatsappAutoFollowUp : true;

    // Opt-out LGPD: roda sempre, mesmo com classificação automática desligada.
    let optedOut: boolean = false;
    const optOutRequested = detectOptOut(inbound.text) || intent === "recusa";
    if (optOutRequested) {
      try {
        optedOut = Boolean(setDoNotContactByPhone(normalized, true));
      } catch {
        /* best-effort */
      }
      // Mesmo sem automação de intenção, o pipeline não deve seguir tratando
      // como oportunidade ativa.
      if (pipelineEnabled) {
        try {
          updateLeadStatusByPhone(normalized, "declined");
        } catch {
          /* best-effort */
        }
      }
    }

    // registra a mensagem recebida
    // Edição de mensagem: o gateway reenvia com novo id e o id original em
    // contextInfo.stanzaId — atualizamos o texto em vez de duplicar a conversa.
    if (inbound.isEdit && inbound.stanzaId) {
      const updated = updateCommunicationMessage(inbound.stanzaId, `[RECEBIDA] ${inbound.text}`);
      if (updated) {
        eventHub.emit("whatsapp_inbound", {
          leadId: lead.id,
          name: lead.name,
          intent: "edicao",
          movedTo: null,
          optedOut: false,
          text: inbound.text.slice(0, 200),
          edited: true,
        });
        return;
      }
    }

    const recorded = recordInboundIfNew({ lead, text: inbound.text, externalId: inbound.messageId });
    // Webhook reentregue: a mensagem já existe — não duplica interação/pipeline.
    if (!recorded.created) return;

    // Auditoria: guarda a intenção classificada e de onde ela veio.
    if (rulesDecision.intent !== "outro" && recorded.communicationId) {
      try {
        setCommunicationIntent(recorded.communicationId, {
          intent: rulesDecision.intent,
          source: "regex",
          confidence: rulesDecision.confidence,
        });
      } catch {
        /* auditoria best-effort */
      }
    }

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

    // Interesse/prévia = hora de montar a ficha do cliente (fatos + marca) que
    // vira a base da primeira versão do site. Roda em segundo plano: o webhook
    // já respondeu e a coleta (SerpAPI + Gemini) leva dezenas de segundos.
    if (intent === "interesse" || intent === "preco") {
      void buildClientProfile(lead.id)
        .then((result) => {
          console.log(
            `[whatsapp] Ficha do cliente ${result.cached ? "já existia" : "gerada"}: ${lead.name} → ${result.profile.files?.markdown || result.markdownPath}`
          );
          if (!result.cached) {
            eventHub.emit("client_profile_ready", {
              leadId: lead.id,
              name: lead.name,
              markdown: result.profile.files?.markdown || null,
              confidence: result.profile.confidence,
              gaps: result.profile.gaps.length,
            });
          }
        })
        .catch((e: any) => console.warn(`[whatsapp] Ficha do cliente falhou para ${lead.id}: ${e?.message}`));
    }

    // 2ª passada (só quando o regex não entendeu): a IA classifica frases curtas
    // que são a resposta mais comum na prática — "pode mandar", "manda sim",
    // "claro". Roda depois do ACK; se falhar, nada muda (fica `outro`).
    if (autoIntentEnabled && rulesDecision.intent === "outro") {
      void classifyWithAI({ text: inbound.text, businessName: lead.name })
        .then((ai) => {
          if (!ai || ai.intent === "outro" || ai.intent === "recusa") return; // recusa/opt-out só por regex
          if (ai.confidence < AI_MIN_CONFIDENCE) {
            console.log(`[whatsapp] IA sugeriu ${ai.intent} (${ai.confidence}) abaixo do limite — ignorado.`);
            return;
          }

          if (recorded.communicationId) {
            try {
              setCommunicationIntent(recorded.communicationId, {
                intent: ai.intent,
                source: "ia",
                confidence: ai.confidence,
              });
            } catch {
              /* auditoria best-effort */
            }
          }

          if (ai.status && pipelineEnabled) {
            try {
              updateLeadStatusByPhone(normalized, ai.status);
            } catch {
              /* best-effort */
            }
          }

          if (followUpEnabled) {
            try {
              createInteraction({
                leadId: lead.id,
                type: "follow_up",
                channel: "whatsapp",
                deliveryStatus: "pending",
                outcome: "positive",
                occurredAt: new Date().toISOString(),
                notes: `[Auto/IA] Lead respondeu com ${ai.intent === "preco" ? "pergunta de preço" : "interesse"}: "${inbound.text.slice(0, 120)}". Enviar proposta/prévia.`,
                nextContactAt: new Date().toISOString(),
              });
            } catch {
              /* best-effort */
            }
          }

          // Mesmo gatilho da regra: interesse = hora de montar a ficha.
          void buildClientProfile(lead.id)
            .then((result) => {
              if (result.cached) return;
              eventHub.emit("client_profile_ready", {
                leadId: lead.id,
                name: lead.name,
                markdown: result.profile.files?.markdown || null,
                confidence: result.profile.confidence,
                gaps: result.profile.gaps.length,
              });
            })
            .catch((e: any) => console.warn(`[whatsapp] Ficha (IA) falhou para ${lead.id}: ${e?.message}`));

          eventHub.emit("whatsapp_inbound", {
            leadId: lead.id,
            name: lead.name,
            intent: ai.intent,
            intentSource: "ia",
            confidence: ai.confidence,
            movedTo: ai.status || null,
            optedOut: false,
            text: inbound.text.slice(0, 200),
          });
        })
        .catch((e: any) => console.warn(`[whatsapp] Classificação por IA falhou: ${e?.message}`));
    }

    // NÚMERO DE TESTE (Paulo e convidados): a primeira mensagem que a pessoa
    // manda dispara a abordagem de prospecção, como se ela fosse um lead real
    // encontrado no Google. Também em segundo plano, e o agente não responde
    // junto — seria duas mensagens seguidas.
    const testPitch = shouldPitchTestLead(lead);
    if (testPitch && !optedOut) {
      void pitchTestLeadOnFirstMessage(lead, inbound.pushName)
        .then((result) => {
          console.log(
            `[whatsapp] Número de teste ${lead.name}: ${result.sent ? "prospecção enviada" : `não enviada (${result.detail})`}`
          );
          eventHub.emit("agent_replied", {
            leadId: lead.id,
            name: lead.name,
            source: "teste",
            sent: result.sent,
            detail: result.detail,
            message: result.sent ? "prospecção (D0) para número de teste" : "",
          });
        })
        .catch((e: any) => console.warn(`[whatsapp] Prospecção de teste falhou para ${lead.id}: ${e?.message}`));
    }

    // AGENTE COMERCIAL: escreve a resposta e envia. Roda depois do ACK, em
    // segundo plano (a humanização pode segurar até ~2 min). Recusa/opt-out NÃO
    // é respondida pelo agente — LGPD: quem recusa não recebe mais nada.
    //
    // Quem responde é a Clara (rotina de 1 min fora do app). O compositor interno
    // só entra na frente quando `preferClara` está desligado; senão ele espera a
    // rede de segurança (`agentWatchdog`) e só fala se ninguém respondeu.
    let claraPrimeiro = false;
    try {
      claraPrimeiro = getAutomationSettings().preferClara;
    } catch {
      claraPrimeiro = true;
    }
    if (!testPitch && !claraPrimeiro && agentEnabled() && !optedOut && !lead.doNotContact && intent !== "recusa" && inbound.text.trim().length >= 1) {
      void answerLead(lead, inbound.text)
        .then((result) => {
          if (!result.dispatch) return; // conversa já respondida ou sem inbound aberto
          console.log(
            `[whatsapp] Agente respondeu ${lead.name} (${result.source}): ${
              result.dispatch.status === "sent" ? result.message.slice(0, 80) : `BLOQUEADO — ${result.dispatch.detail}`
            }`
          );
          eventHub.emit("agent_replied", {
            leadId: lead.id,
            name: lead.name,
            source: result.source,
            sent: result.dispatch.status === "sent",
            detail: result.dispatch.detail,
            message: result.message.slice(0, 200),
          });
        })
        .catch((e: any) => console.warn(`[whatsapp] Agente falhou para ${lead.id}: ${e?.message}`));
    }

    eventHub.emit("whatsapp_inbound", {
      leadId: lead.id,
      name: lead.name,
      intent,
      intentSource: rulesDecision.source,
      confidence: rulesDecision.confidence || undefined,
      movedTo: status || null,
      optedOut,
      text: inbound.text.slice(0, 200),
    });
  });
}
