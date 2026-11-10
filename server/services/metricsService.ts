import { getAllInteractions, getCommunications, getLeads } from "../store/db";
import type { Communication } from "../store/db";
import type { StoredLead } from "../store/types";
import { primaryAuditHook } from "./siteAuditService";
import { effectiveWebsiteStatus } from "./presenceService";

/**
 * Métricas do funil de outbound.
 *
 * A pergunta que importa não é "quantas mensagens enviei", e sim:
 * de cada 100 abordagens, quantas viraram conversa, reunião e fechamento?
 * E qual gancho (defeito do site) puxa mais resposta?
 */

export interface HookMetrics {
  hook: string;
  /** Pessoas únicas abordadas com este gancho. */
  leads: number;
  /** Mensagens enviadas com este gancho (inclui follow-ups). */
  sent: number;
  replies: number;
  replyRate: number;
  meetings: number;
}

export interface OutboundMetrics {
  window: { since?: string; contactableLeads: number };
  contacted: number;
  sent: number;
  replies: number;
  replyRate: number;
  meetings: number;
  meetingRate: number;
  closed: number;
  closeRate: number;
  byHook: HookMetrics[];
  bestHook?: HookMetrics;
  byChannel: Array<{ channel: string; sent: number; leads: number }>;
  delivery: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    pending: number;
    /** Enviadas há mais de 24h sem ACK de entrega/leitura. */
    unconfirmed: number;
  };
  funnel: Array<{ step: string; count: number; rate: number }>;
}

export interface MetricsOptions {
  since?: string;
  /** Fim da janela (default: agora) — útil em testes. */
  until?: string;
}

function rate(part: number, total: number): number {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

/** Gancho usado na abordagem: o gravado na comunicação ou o derivado do lead. */
export function resolveHook(comm: Communication, lead: StoredLead | undefined): string {
  if (comm.hook) return comm.hook;
  if (!lead) return "desconhecido";
  const status = effectiveWebsiteStatus(lead);
  if (status === "none") return "sem_site";
  if (status === "marketplace_only") return "marketplace";
  if (status === "social_only") return "social_only";
  if (lead.siteAudit) return primaryAuditHook(lead.siteAudit);
  return "generico";
}

/**
 * Gancho que abriu a conversa: o do PRIMEIRO outbound entregue do lead.
 * Follow-ups herdam esse gancho — senão todo lead respondido vira crédito da
 * cadência e o relatório nunca descobre qual defeito puxa resposta.
 */
function firstHooksByLead(leadsById: Map<string, StoredLead>): Map<string, string> {
  const hooks = new Map<string, string>();
  const all = getCommunications();
  for (let i = all.length - 1; i >= 0; i -= 1) {
    const comm = all[i];
    if (comm.direction !== "outbound" || comm.status === "failed" || comm.status === "pending") continue;
    if (hooks.has(comm.leadId)) continue;
    hooks.set(comm.leadId, resolveHook(comm, leadsById.get(comm.leadId)));
  }
  return hooks;
}

export function computeOutboundMetrics(opts: MetricsOptions = {}): OutboundMetrics {
  const since = opts.since;
  const until = opts.until || new Date().toISOString();

  const inWindow = (iso?: string) => {
    if (!iso) return false;
    if (since && iso < since) return false;
    return iso <= until;
  };

  const leads = getLeads();
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const firstHook = firstHooksByLead(leadsById);
  const communications = getCommunications().filter((comm) => inWindow(comm.createdAt));
  const interactions = getAllInteractions().filter((item) => inWindow(item.occurredAt));

  // Agrupa por lead (ordem cronológica ascendente).
  const byLead = new Map<string, Communication[]>();
  for (const comm of communications) {
    const list = byLead.get(comm.leadId) || [];
    list.push(comm);
    byLead.set(comm.leadId, list);
  }
  for (const list of byLead.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  // Reuniões e fechamentos por lead.
  const meetingLeads = new Set<string>();
  for (const item of interactions) {
    if (item.outcome === "meeting_scheduled" || item.outcome === "negotiating") {
      meetingLeads.add(item.leadId);
    }
  }
  for (const lead of leads) {
    if (["negotiating", "em_desenvolvimento"].includes(lead.pipelineStatus)) meetingLeads.add(lead.id);
  }
  const closedLeads = new Set(
    leads.filter((lead) => lead.pipelineStatus === "closed").map((lead) => lead.id)
  );

  // Pessoas abordadas e quem respondeu depois da primeira abordagem.
  let contacted = 0;
  let sent = 0;
  let replies = 0;
  const hookLeadMap = new Map<string, Set<string>>();
  const hookSent = new Map<string, number>();
  const hookReplies = new Map<string, Set<string>>();
  const hookMeetings = new Map<string, Set<string>>();
  const channelSent = new Map<string, number>();
  const channelLeads = new Map<string, Set<string>>();
  const contactedIds = new Set<string>();

  for (const [leadId, list] of byLead) {
    const lead = leadsById.get(leadId);
    const outbound = list.filter(
      (item) => item.direction === "outbound" && item.status !== "failed" && item.status !== "pending"
    );
    if (outbound.length === 0) continue;

    contacted += 1;
    contactedIds.add(leadId);
    sent += outbound.length;

    const firstOutboundAt = outbound[0].createdAt;
    const replied = list.some(
      (item) => item.direction === "inbound" && item.createdAt > firstOutboundAt
    );
    if (replied) replies += 1;

    const channel = outbound[0].channel;
    channelSent.set(channel, (channelSent.get(channel) || 0) + outbound.length);
    if (!channelLeads.has(channel)) channelLeads.set(channel, new Set());
    channelLeads.get(channel)!.add(leadId);

    // Atribuição única: o gancho que iniciou a conversa. Um lead nunca conta
    // em dois ganchos, e follow-up nenhum cria um gancho novo.
    const hook = firstHook.get(leadId) || resolveHook(outbound[0], lead);
    if (!hookLeadMap.has(hook)) hookLeadMap.set(hook, new Set());
    hookLeadMap.get(hook)!.add(leadId);
    hookSent.set(hook, (hookSent.get(hook) || 0) + outbound.length);
    if (replied) {
      if (!hookReplies.has(hook)) hookReplies.set(hook, new Set());
      hookReplies.get(hook)!.add(leadId);
    }
    if (meetingLeads.has(leadId)) {
      if (!hookMeetings.has(hook)) hookMeetings.set(hook, new Set());
      hookMeetings.get(hook)!.add(leadId);
    }
  }

  const byHook: HookMetrics[] = [...hookLeadMap.entries()]
    .map(([hook, leadSet]) => {
      const replySet = hookReplies.get(hook);
      const meetingSet = hookMeetings.get(hook);
      return {
        hook,
        leads: leadSet.size,
        sent: hookSent.get(hook) || 0,
        replies: replySet?.size || 0,
        replyRate: rate(replySet?.size || 0, leadSet.size),
        meetings: meetingSet?.size || 0,
      };
    })
    .sort((a, b) => b.replyRate - a.replyRate || b.leads - a.leads);

  // Só conta reunião/fechamento de quem foi de fato abordado na janela:
  // senão o funil passa de 100% (reunião antiga de lead nunca contatado).
  const meetings = [...meetingLeads].filter((id) => contactedIds.has(id)).length;
  const closed = [...closedLeads].filter((id) => contactedIds.has(id)).length;

  // Entrega: status real das mensagens de saída na janela. "Sem confirmação"
  // = enviada há mais de 24h e ainda sem ACK de entrega/leitura.
  const unconfirmedBefore = new Date(new Date(until).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const delivery = { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0, unconfirmed: 0 };
  for (const comm of communications) {
    if (comm.direction !== "outbound") continue;
    if (comm.status === "sent" || comm.status === "delivered" || comm.status === "read" || comm.status === "failed" || comm.status === "pending") {
      delivery[comm.status] += 1;
    }
    if (comm.status === "sent" && comm.createdAt < unconfirmedBefore) delivery.unconfirmed += 1;
  }

  return {
    window: { since, contactableLeads: leads.filter((lead) => !lead.doNotContact).length },
    contacted,
    sent,
    replies,
    replyRate: rate(replies, contacted),
    meetings,
    meetingRate: rate(meetings, contacted),
    closed,
    closeRate: rate(closed, contacted),
    byHook,
    bestHook: byHook.find((item) => item.leads >= 1 && item.replies > 0),
    byChannel: [...channelSent.entries()]
      .map(([channel, sentCount]) => ({
        channel,
        sent: sentCount,
        leads: channelLeads.get(channel)?.size || 0,
      }))
      .sort((a, b) => b.sent - a.sent),
    delivery,
    funnel: [
      { step: "Abordados", count: contacted, rate: 100 },
      { step: "Responderam", count: replies, rate: rate(replies, contacted) },
      { step: "Reunião/negociação", count: meetings, rate: rate(meetings, contacted) },
      { step: "Fechados", count: closed, rate: rate(closed, contacted) },
    ],
  };
}
