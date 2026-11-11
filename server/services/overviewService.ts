import { getDb } from "../store/schema";
import { computeOutboundMetrics } from "./metricsService";
import { getAutopilotStatus } from "./autoProspectingService";

/**
 * Números do dia corrente (fuso do servidor), para a Visão geral em modo "Hoje".
 *
 * Regra: o dia é calculado por limites ISO em UTC derivados da meia-noite local
 * — comparar string com string funciona porque todo timestamp é gravado em ISO
 * com milissegundos e "Z".
 */

export interface DailyOverview {
  dayLabel: string;
  startIso: string;
  endIso: string;
  leads: {
    created: number;
    readyForD0: number;
    withPhone: number;
    contacted: number;
  };
  outbound: {
    contacted: number;
    sent: number;
    replies: number;
    replyRate: number;
    meetings: number;
  };
  delivery: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    unconfirmed: number;
    inbound: number;
  };
  projects: {
    created: number;
    moved: number;
    concluded: number;
  };
  followUps: {
    dueToday: number;
  };
  collection: {
    searches: number;
  };
}

/** Início e fim do dia local, em ISO UTC. */
export function localDayBounds(now: Date = new Date()): { startIso: string; endIso: string; dayLabel: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dayLabel: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
  };
}

const count = (sql: string, params: Record<string, unknown> = {}): number => {
  try {
    const row = getDb().prepare(sql).get(params) as any;
    return Number(row?.total ?? row?.c ?? 0) || 0;
  } catch {
    return 0;
  }
};

export function getDailyOverview(now: Date = new Date()): DailyOverview {
  const { startIso, endIso, dayLabel } = localDayBounds(now);
  const params = { start: startIso, end: endIso };

  const leadsCreated = count(
    "SELECT COUNT(*) AS total FROM leads WHERE saved_at >= @start AND saved_at < @end",
    params
  );
  const leadsWithPhone = count(
    "SELECT COUNT(*) AS total FROM leads WHERE saved_at >= @start AND saved_at < @end AND phone IS NOT NULL AND TRIM(phone) <> ''",
    params
  );
  const readyForD0 = count(
    `SELECT COUNT(*) AS total FROM leads
      WHERE saved_at >= @start AND saved_at < @end
        AND phone IS NOT NULL AND TRIM(phone) <> ''
        AND (website_status IS NULL OR website_status = 'none')
        AND (last_contact_at IS NULL OR last_contact_at = '')`,
    params
  );
  const leadsContacted = count(
    `SELECT COUNT(DISTINCT lead_id) AS total FROM communications
      WHERE direction = 'outbound' AND created_at >= @start AND created_at < @end`,
    params
  );
  const inbound = count(
    `SELECT COUNT(*) AS total FROM communications
      WHERE direction = 'inbound' AND created_at >= @start AND created_at < @end`,
    params
  );

  let outbound = { contacted: 0, sent: 0, replies: 0, replyRate: 0, meetings: 0 };
  let delivery = { sent: 0, delivered: 0, read: 0, failed: 0, unconfirmed: 0 };
  try {
    const metrics = computeOutboundMetrics({ since: startIso, until: endIso });
    outbound = {
      contacted: metrics.contacted,
      sent: metrics.sent,
      replies: metrics.replies,
      replyRate: metrics.replyRate,
      meetings: metrics.meetings,
    };
    delivery = {
      sent: metrics.delivery.sent,
      delivered: metrics.delivery.delivered,
      read: metrics.delivery.read,
      failed: metrics.delivery.failed,
      unconfirmed: metrics.delivery.unconfirmed,
    };
  } catch {
    /* métricas são acessório: se falharem, o resto do dia continua */
  }

  const projectsCreated = count(
    "SELECT COUNT(*) AS total FROM projects WHERE created_at >= @start AND created_at < @end",
    params
  );
  const projectsConcluded = count(
    `SELECT COUNT(*) AS total FROM projects
      WHERE completed_at IS NOT NULL AND completed_at >= @start AND completed_at < @end`,
    params
  );
  const projectsMoved = count(
    `SELECT COUNT(*) AS total FROM projects
      WHERE updated_at >= @start AND updated_at < @end
        AND (created_at IS NULL OR created_at < @start)`,
    params
  );

  const followUpsDueToday = count(
    `SELECT COUNT(*) AS total FROM interactions
      WHERE next_contact_at IS NOT NULL AND next_contact_at <> ''
        AND next_contact_at >= @start AND next_contact_at < @end
        AND (responded_at IS NULL OR responded_at = '')`,
    params
  );

  let collection = { searches: 0 };
  try {
    // O estado do autopilot só vale se o dayKey dele for HOJE: logo após a
    // meia-noite ele ainda carrega os números de ontem até o próximo pulso.
    const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      .toLocaleDateString("sv-SE"); // YYYY-MM-DD local, mesmo formato do dayKey
    const status = getAutopilotStatus() as any;
    const sameDay = String(status?.state?.dayKey || "") === todayKey;
    collection = sameDay ? { searches: Number(status?.state?.searchedToday || 0) } : { searches: 0 };
  } catch {
    /* autopilot pode estar desligado */
  }

  return {
    dayLabel,
    startIso,
    endIso,
    leads: { created: leadsCreated, readyForD0, withPhone: leadsWithPhone, contacted: leadsContacted },
    outbound,
    delivery: { ...delivery, inbound },
    projects: { created: projectsCreated, moved: projectsMoved, concluded: projectsConcluded },
    followUps: { dueToday: followUpsDueToday },
    collection,
  };
}
