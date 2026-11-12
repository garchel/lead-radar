/**
 * Rede de segurança do atendimento: responde quem ficou sem resposta.
 *
 * O dono do WhatsApp é o bot `Clara` (rotina de 1 min lendo o inbox). Se ela
 * estiver pausada, o gateway cair ou a máquina dormir, o lead ficaria no vácuo
 * — que é o pior resultado possível numa conversa comercial.
 *
 * Este tick acha conversa ABERTA (última mensagem é do lead) e antiga o
 * bastante para ninguém mais estar respondendo, e responde pelo compositor
 * interno (mesmas travas: dossiê, preço, QA, humanização).
 *
 * Regras que não podem cair:
 * - nunca responde opt-out (`do_not_contact`);
 * - nunca responde conversa em que a última mensagem é nossa;
 * - idade mínima generosa (padrão 6 min): a humanização de um envio do bot pode
 *   segurar até ~2 min, e dois respondendo é pior que dois minutos de espera.
 */

import { getDb } from "../store/schema";
import { getLeadById, getSetting } from "../store/db";
import { answerLead } from "./salesAgentService";
import { sendOwnerAlert } from "./ownerAlertService";

export const FALLBACK_MIN_AGE_MINUTES = 6;
export const FALLBACK_LIMIT = 3;

export interface FallbackAnswer {
  leadId: string;
  name: string;
  status: string;
  detail: string;
}

export interface FallbackTickResult {
  ranAt: string;
  enabled: boolean;
  candidates: number;
  answered: FallbackAnswer[];
  skipped: number;
}

/** Ligado por padrão; `automation_agent_fallback=false` desliga. */
export function fallbackEnabled(): boolean {
  try {
    return getSetting("automation_agent_fallback") !== "false";
  } catch {
    return false;
  }
}

export function fallbackMinAgeMinutes(): number {
  try {
    const raw = Number(getSetting("automation_agent_fallback_minutes"));
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : FALLBACK_MIN_AGE_MINUTES;
  } catch {
    return FALLBACK_MIN_AGE_MINUTES;
  }
}

/**
 * Leads com conversa aberta e parada há mais de `minAgeMinutes`, do mais antigo
 * para o mais recente. SQL puro: a tabela `communications` pode ter milhares de
 * linhas e o tick roda a cada 2 minutos.
 */
export function findStaleOpenConversations(minAgeMinutes: number, now = new Date(), limit = FALLBACK_LIMIT): string[] {
  const cutoff = new Date(now.getTime() - minAgeMinutes * 60_000).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT l.id AS lead_id
         FROM leads l
         JOIN communications c ON c.lead_id = l.id
        WHERE c.status != 'failed'
          AND c.direction = 'inbound'
          AND c.created_at <= ?
          AND COALESCE(l.do_not_contact, 0) = 0
          AND c.id = (
                SELECT c2.id FROM communications c2
                 WHERE c2.lead_id = l.id AND c2.status != 'failed'
                 ORDER BY c2.created_at DESC, c2.rowid DESC LIMIT 1
              )
          AND NOT EXISTS (
                SELECT 1 FROM communications o
                 WHERE o.lead_id = l.id AND o.direction = 'outbound' AND o.status != 'failed'
                   AND o.created_at > c.created_at
              )
        ORDER BY c.created_at ASC
        LIMIT ?`
    )
    .all(cutoff, Math.max(1, limit)) as Array<{ lead_id: string }>;
  return rows.map((r) => r.lead_id);
}

/**
 * Um pulso da rede de segurança. Nunca lança: erro de um lead não pode parar
 * os outros nem derrubar o processo do servidor.
 */
export async function fallbackAnswerTick(
  opts: { now?: Date; minAgeMinutes?: number; limit?: number } = {}
): Promise<FallbackTickResult> {
  const now = opts.now || new Date();
  const result: FallbackTickResult = { ranAt: now.toISOString(), enabled: fallbackEnabled(), candidates: 0, answered: [], skipped: 0 };
  if (!result.enabled) return result;

  const minAge = opts.minAgeMinutes ?? fallbackMinAgeMinutes();
  const leadIds = findStaleOpenConversations(minAge, now, opts.limit ?? FALLBACK_LIMIT);
  result.candidates = leadIds.length;

  for (const leadId of leadIds) {
    const lead = getLeadById(leadId);
    if (!lead) {
      result.skipped += 1;
      continue;
    }
    if (lead.doNotContact) {
      result.skipped += 1;
      continue;
    }
    try {
      const inbound = latestInbound(leadId);
      const composed = await answerLead(lead, inbound);
      if (!composed.dispatch) {
        result.skipped += 1;
        continue;
      }
      result.answered.push({
        leadId: lead.id,
        name: lead.name,
        status: composed.dispatch.status,
        detail: composed.dispatch.detail,
      });

      // Se nem a rede de segurança conseguiu, o aviso é obrigatório.
      if (composed.dispatch.status !== "sent") {
        void sendOwnerAlert({
          kind: composed.dispatch.blocked ? "resposta_bloqueada" : "envio_falhou",
          detail: composed.dispatch.detail || `status ${composed.dispatch.status}`,
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
        });
      }
      console.log(
        `[fallback] ${lead.name}: ${composed.dispatch.status === "sent" ? "respondeu" : "bloqueado"} (${composed.source}) — ${composed.message.slice(0, 80)}`
      );
    } catch (err: any) {
      result.skipped += 1;
      console.warn(`[fallback] falhou para ${leadId}: ${err?.message || err}`);
    }
  }

  return result;
}

function latestInbound(leadId: string): string {
  const row = getDb()
    .prepare(
      `SELECT message FROM communications
        WHERE lead_id = ? AND direction = 'inbound' AND status != 'failed'
        ORDER BY created_at DESC, rowid DESC LIMIT 1`
    )
    .get(leadId) as { message?: string } | undefined;
  return String(row?.message || "").replace(/^\[RECEBIDA\]\s*/, "");
}
