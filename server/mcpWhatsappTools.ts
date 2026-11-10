import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";

import {
  getIncomingInbox,
  getLeadByNormalizedPhone,
  getLeadById,
  getRecentCommunications,
  getSetting,
  setSetting,
  upsertLead,
} from "./store/db";
import type { StoredLead } from "./store/types";
import { dispatchLeadReply } from "./services/interactionService";
import { resolveWhatsappProvider, type WhatsappProviderChoice } from "./services/contactService";
import {
  defaultWebhookUrl,
  fetchGatewayInstanceState,
  fetchGatewayWebhook,
  getGatewayConfig,
  isGatewayConfigured,
  requestGatewayQr,
  SUPPORTED_WEBHOOK_EVENTS,
  updateGatewayWebhook,
} from "./services/whatsappGateway";
import { eventHub } from "./events/eventHub";
import { reconcileLeadMessages } from "./services/whatsappInboundService";
import { listOutbox, retryOutbound } from "./services/outboxService";

/**
 * Superfície MCP de WhatsApp.
 *
 * Antes, o agente conseguia apenas ENVIAR para um lead já cadastrado
 * (`send_contact`). Estas tools completam o ciclo:
 *   - ler o histórico e a caixa de entrada (`list_communications`, `list_inbound_messages`)
 *   - responder mensagens recebidas (`send_whatsapp_message`)
 *   - inspecionar e trocar o backend (`whatsapp_status`, `set_whatsapp_provider`)
 *   - operar o gateway: parear via QR, status e webhook (`whatsapp_instance_status`,
 *     `whatsapp_request_qr`, `whatsapp_set_webhook`)
 */

const DATA_DIR = process.env.LEADRADAR_DATA_DIR || path.join(process.cwd(), "data");

/** Envelope padrão das respostas das tools (texto JSON). */
function ok(payload: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...payload }, null, 2) }] };
}

function fail(error: string, extra: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error, ...extra }, null, 2) }] };
}

function providerAvailability() {
  return {
    evolution: Boolean((process.env.EVOLUTION_API_URL || "").trim()),
    whatsmiau: Boolean(
      (process.env.WHATSMIAU_API_URL || "").trim() && (process.env.WHATSMIAU_API_KEY || "").trim()
    ),
    meta: Boolean(
      (process.env.META_WHATSAPP_TOKEN || "").trim() && (process.env.META_PHONE_NUMBER_ID || "").trim()
    ),
    legacy: Boolean((process.env.WHATSAPP_API_URL || "").trim()),
  };
}

/** Localiza (ou cria) o lead alvo do envio. */
function resolveTargetLead(input: {
  leadId?: string;
  phone?: string;
  businessName?: string;
}): { lead?: StoredLead; error?: string; created?: boolean } {
  if (input.leadId) {
    const lead = getLeadById(input.leadId);
    if (!lead) return { error: `Lead "${input.leadId}" não encontrado.` };
    return { lead };
  }

  const phone = (input.phone || "").trim();
  if (!phone) {
    return { error: "Informe leadId ou phone (telefone com DDD) para enviar a mensagem." };
  }

  const existing = getLeadByNormalizedPhone(phone);
  if (existing) return { lead: existing };

  const name = input.businessName?.trim() || `Contato ${phone.replace(/\D/g, "")}`;
  const digits = phone.replace(/\D/g, "");
  const id = `lead_wa_${digits}`;
  const now = new Date().toISOString();
  const created = upsertLead({
    id,
    name,
    phone,
    pipelineStatus: "prospect",
    savedAt: now,
    updatedAt: now,
  } as StoredLead);
  return { lead: created, created: true };
}

export function registerWhatsappTools(server: McpServer) {
  /* ---------------------------------------------------------------- */
  /* 1. list_communications — histórico de conversa                    */
  /* ---------------------------------------------------------------- */
  server.tool(
    "list_communications",
    "Lista o histórico de mensagens (enviadas e recebidas) de um lead ou de todos os leads, com o texto, o canal e a data.",
    {
      leadId: z.string().optional().describe("ID do lead. Omitir para listar as últimas conversas de todos os leads."),
      limit: z.number().int().min(1).max(200).optional().describe("Quantidade máxima de mensagens (default: 50)"),
      direction: z.enum(["inbound", "outbound"]).optional().describe("Filtra recebidas (inbound) ou enviadas (outbound)"),
      channel: z.enum(["whatsapp", "email"]).optional().describe("Filtra o canal da mensagem"),
    },
    async ({ leadId, limit, direction, channel }) => {
      try {
        const items = getRecentCommunications({ leadId, limit, direction, channel });
        return ok({ count: items.length, communications: items });
      } catch (e: any) {
        return fail(e?.message || "Falha ao listar comunicações.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 2. list_inbound_messages — caixa de entrada do agente             */
  /* ---------------------------------------------------------------- */
  server.tool(
    "list_inbound_messages",
    "Lista as mensagens recebidas no WhatsApp (e-mail) que aguardam resposta do agente, com o lead e o estágio do funil.",
    {
      limit: z.number().int().min(1).max(200).optional().describe("Quantidade máxima de mensagens (default: 50)"),
      onlyAwaitingReply: z
        .boolean()
        .optional()
        .describe("true (default) traz só o que ainda não foi respondido; false traz todas as recebidas"),
    },
    async ({ limit, onlyAwaitingReply }) => {
      try {
        const items = getIncomingInbox({
          limit,
          onlyAwaitingReply: onlyAwaitingReply === false ? false : true,
        });
        return ok({ count: items.length, messages: items });
      } catch (e: any) {
        return fail(e?.message || "Falha ao listar mensagens recebidas.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 3. send_whatsapp_message — envio/responde                         */
  /* ---------------------------------------------------------------- */
  server.tool(
    "send_whatsapp_message",
    "Envia uma mensagem de WhatsApp para um lead (leadId) ou para um telefone (phone). Responde conversas abertas ignorando a janela de recontato, mas respeita o opt-out LGPD.",
    {
      message: z.string().min(1).describe("Texto da mensagem a enviar"),
      leadId: z.string().optional().describe("ID do lead. Tem precedência sobre phone."),
      phone: z
        .string()
        .optional()
        .describe("Telefone com DDD (ex: 11987654321). Usado quando o lead ainda não existe."),
      businessName: z.string().optional().describe("Nome do negócio — usado apenas ao criar o lead a partir do phone"),
    },
    async ({ message, leadId, phone, businessName }) => {
      try {
        const target = resolveTargetLead({ leadId, phone, businessName });
        if (!target.lead) return fail(target.error || "Lead não encontrado.");

        const lead = target.lead;
        if (lead.doNotContact) {
          return fail("A empresa solicitou não receber novos contatos (opt-out LGPD).", {
            leadId: lead.id,
            blocked: true,
          });
        }
        if (!lead.phone) {
          return fail("O lead não possui telefone cadastrado — informe phone ou atualize o cadastro.", {
            leadId: lead.id,
          });
        }

        const result = await dispatchLeadReply(lead, { channel: "whatsapp", message });
        if (result.blocked || result.status !== "sent") {
          return fail(result.detail || "Falha no envio.", {
            leadId: lead.id,
            leadName: lead.name,
            status: result.status,
            blocked: Boolean(result.blocked),
            nextContactAt: result.nextContactAt,
          });
        }
        return ok({
          leadId: lead.id,
          leadName: lead.name,
          to: result.to,
          status: result.status,
          detail: result.detail,
          interactionId: result.interactionId,
          communicationId: result.communicationId,
          createdLead: Boolean(target.created),
        });
      } catch (e: any) {
        return fail(e?.message || "Falha no envio da mensagem.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 4. whatsapp_status — backend ativo                                */
  /* ---------------------------------------------------------------- */
  server.tool(
    "whatsapp_status",
    "Mostra o backend de WhatsApp em uso (evolution/whatsmiau/meta/legacy), quais estão configurados e o estado da instância pareada.",
    {},
    async () => {
      try {
        const { provider, reason } = resolveWhatsappProvider();
        const savedChoice = getSetting("whatsapp_provider") || "auto";
        const gateway = getGatewayConfig();

        let instance: { id: string; state: string; connected: boolean } | undefined;
        let gatewayError: string | undefined;
        if (gateway) {
          try {
            instance = await fetchGatewayInstanceState();
          } catch (e: any) {
            gatewayError = e?.message || "Falha ao consultar o gateway.";
          }
        }

        return ok({
          activeProvider: provider,
          reason,
          savedChoice,
          available: providerAvailability(),
          gateway: gateway
            ? {
                configured: true,
                instance: gateway.instance,
                state: instance?.state || null,
                connected: instance?.connected ?? false,
                error: gatewayError,
              }
            : { configured: false },
        });
      } catch (e: any) {
        return fail(e?.message || "Falha ao consultar o status do WhatsApp.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 5. set_whatsapp_provider — troca de backend                       */
  /* ---------------------------------------------------------------- */
  server.tool(
    "set_whatsapp_provider",
    "Define qual backend de WhatsApp o LeadRadar usa: auto, evolution, whatsmiau, meta ou legacy. A escolha tem precedência sobre a variável WHATSAPP_PROVIDER.",
    {
      provider: z
        .enum(["auto", "evolution", "whatsmiau", "meta", "legacy"])
        .describe("Backend a ativar. Use 'auto' para resolução automática (evolution → whatsmiau → meta → legacy)."),
    },
    async ({ provider }) => {
      try {
        const choice = provider as WhatsappProviderChoice;
        setSetting("whatsapp_provider", choice === "auto" ? "" : choice);
        const { provider: active, reason } = resolveWhatsappProvider();
        eventHub.emit("whatsapp_provider_changed", { choice, provider: active, reason });
        return ok({ provider: active, reason, savedChoice: choice });
      } catch (e: any) {
        return fail(e?.message || "Falha ao salvar o backend de WhatsApp.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 6. whatsapp_instance_status — estado da instância no gateway      */
  /* ---------------------------------------------------------------- */
  server.tool(
    "whatsapp_instance_status",
    "Consulta no gateway o estado da instância do WhatsApp (open = pareada e pronta), o webhook configurado e as instâncias existentes.",
    {
      instance: z.string().optional().describe("Nome da instância (default: WHATSMIAU_INSTANCE ou 'leadradar')"),
    },
    async ({ instance }) => {
      try {
        if (!isGatewayConfigured()) {
          return fail("Gateway não configurado: defina WHATSMIAU_API_URL e WHATSMIAU_API_KEY.");
        }
        const state = await fetchGatewayInstanceState(instance);
        let webhook: unknown = null;
        let webhookError: string | undefined;
        try {
          webhook = await fetchGatewayWebhook(instance);
        } catch (e: any) {
          webhookError = e?.message || "Falha ao ler o webhook do gateway.";
        }
        return ok({ state, webhook, webhookError });
      } catch (e: any) {
        return fail(e?.message || "Falha ao consultar a instância do gateway.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 7. whatsapp_request_qr — pareamento via QR                        */
  /* ---------------------------------------------------------------- */
  server.tool(
    "whatsapp_request_qr",
    "Gera (ou renova) o QR Code de pareamento da instância do WhatsApp. O PNG é salvo em disco e devolvido como caminho; use includeImage para receber o base64.",
    {
      instance: z.string().optional().describe("Nome da instância (default: WHATSMIAU_INSTANCE ou 'leadradar')"),
      includeImage: z
        .boolean()
        .optional()
        .describe("true devolve também o QR em base64 (consome bastante contexto); default false"),
    },
    async ({ instance, includeImage }) => {
      try {
        if (!isGatewayConfigured()) {
          return fail("Gateway não configurado: defina WHATSMIAU_API_URL e WHATSMIAU_API_KEY.");
        }
        const result = await requestGatewayQr(instance);
        const config = getGatewayConfig()!;
        const target = (instance || config.instance || "leadradar").replace(/[^a-zA-Z0-9_-]/g, "-");

        let savedTo: string | undefined;
        if (result.base64) {
          const base64 = result.base64.replace(/^data:image\/png;base64,/, "");
          try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            savedTo = path.join(DATA_DIR, `whatsapp-qr-${target}.png`);
            fs.writeFileSync(savedTo, Buffer.from(base64, "base64"));
          } catch {
            /* arquivo é conveniência; a falha não invalida o QR */
          }
        }

        return ok({
          connected: result.connected,
          pairingCode: result.pairingCode,
          message: result.message,
          savedTo,
          imageBase64: includeImage ? result.base64 : undefined,
          hint: result.connected
            ? "Instância já pareada — pode enviar mensagens."
            : "Abra o PNG com o WhatsApp Business em Aparelhos conectados > Conectar com número > Conectar via QR.",
        });
      } catch (e: any) {
        return fail(e?.message || "Falha ao gerar o QR de pareamento.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 8. whatsapp_set_webhook — aponta o gateway para o LeadRadar      */
  /* ---------------------------------------------------------------- */
  server.tool(
    "whatsapp_set_webhook",
    "Configura no gateway o webhook de eventos (MESSAGES_UPSERT etc.) apontando para o endpoint de inbound do LeadRadar. Sem 'url', usa APP_URL + /api/whatsapp/webhook.",
    {
      url: z.string().optional().describe("URL de destino. Default: APP_URL + /api/whatsapp/webhook (com token, se configurado)."),
      instance: z.string().optional().describe("Nome da instância (default: WHATSMIAU_INSTANCE ou 'leadradar')"),
      events: z
        .array(z.enum(SUPPORTED_WEBHOOK_EVENTS as [string, ...string[]]))
        .optional()
        .describe("Eventos assinados (default: MESSAGES_UPSERT + CONNECTION_UPDATE)"),
      enabled: z.boolean().optional().describe("Ativa (true) ou desliga (false) o envio de eventos. Default: true."),
    },
    async ({ url, instance, events, enabled }) => {
      try {
        if (!isGatewayConfigured()) {
          return fail("Gateway não configurado: defina WHATSMIAU_API_URL e WHATSMIAU_API_KEY.");
        }
        const target = url?.trim() || defaultWebhookUrl();
        const subscribed = events?.length ? events : ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];
        const webhook = await updateGatewayWebhook(instance, {
          url: target,
          events: subscribed,
          enabled: enabled === undefined ? true : enabled,
        });
        return ok({ webhook, url: target, events: subscribed, enabled: enabled === undefined ? true : enabled });
      } catch (e: any) {
        return fail(e?.message || "Falha ao configurar o webhook do gateway.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 9. whatsapp_sync_history — reconcilia histórico e ACKs            */
  /* ---------------------------------------------------------------- */
  server.tool(
    "whatsapp_sync_history",
    "Puxa do celular conectado as últimas mensagens de um lead (inbound perdidas e ACKs de entrega/leitura). Usa quando o webhook ficou fora do ar ou o status das mensagens enviadas está desatualizado. Exige o aparelho online.",
    {
      leadId: z.string().optional().describe("ID do lead. Tem precedência sobre phone."),
      phone: z.string().optional().describe("Telefone do lead (com DDD) quando não houver leadId."),
      count: z.number().int().min(1).max(100).optional().describe("Quantidade de mensagens a puxar (default: 30, máx: 100)"),
      since: z.string().optional().describe("Data mínima (YYYY-MM-DD ou RFC3339) para paginar o histórico"),
      anchor: z.string().optional().describe("ID de uma mensagem existente no chat (opcional; default: último externalId registrado do lead)"),
      fromMe: z.boolean().optional().describe("Se a mensagem-âncora foi enviada por nós (opcional; inferido do histórico)"),
    },
    async ({ leadId, phone, count, since, anchor, fromMe }) => {
      try {
        const lead = leadId
          ? getLeadById(leadId)
          : phone
            ? getLeadByNormalizedPhone(phone)
            : undefined;
        if (!lead) return fail("Lead não encontrado. Informe leadId ou phone.");
        const result = await reconcileLeadMessages(lead, { count, since, anchor, fromMe });
        return result.ok
          ? ok({ leadId: lead.id, ...result })
          : fail(result.error || "Falha ao sincronizar histórico.", { leadId: lead.id, ...result });
      } catch (e: any) {
        return fail(e?.message || "Falha ao sincronizar histórico do WhatsApp.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 10. list_outbox — envios com falha ou sem confirmação             */
  /* ---------------------------------------------------------------- */
  server.tool(
    "list_outbox",
    "Lista envios que precisam de atenção: falhas reenviáveis (últimos 7 dias) e mensagens enviadas há mais de 24h sem ACK de entrega/leitura.",
    {
      limit: z.number().int().min(1).max(200).optional().describe("Máximo de itens por lista (default: 50)"),
    },
    async ({ limit }) => {
      try {
        return ok({ ...listOutbox({ limit }) });
      } catch (e: any) {
        return fail(e?.message || "Falha ao listar a outbox.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 11. retry_outbound — reenvio manual de uma falha                  */
  /* ---------------------------------------------------------------- */
  server.tool(
    "retry_outbound",
    "Reenvia manualmente uma mensagem com status failed. Não reenvia mensagens apenas sem confirmação (poderia duplicar) nem leads com opt-out.",
    {
      communicationId: z.string().describe("ID da comunicação retornado por list_outbox"),
    },
    async ({ communicationId }) => {
      try {
        const result = await retryOutbound(communicationId);
        return result.ok ? ok({ ...result }) : fail(result.detail, { ...result });
      } catch (e: any) {
        return fail(e?.message || "Falha ao reenviar a mensagem.");
      }
    }
  );
}
