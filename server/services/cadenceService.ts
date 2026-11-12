import { getCommunications, getCommunicationsByLead, getLeads, getSetting } from "../store/db";
import type { StoredLead } from "../store/types";
import { dispatchLeadContact } from "./interactionService";
import { effectiveWebsiteStatus, presenceLabel } from "./presenceService";
import { getHumanizeSettings, getHumanizeUsage } from "./humanizeService";
import { composeCadenceMessage } from "./salesAgentService";
import { whatsAppify } from "./messageStyle";

/**
 * Cadência de follow-up D0 / D3 / D7.
 *
 * O primeiro contato (D0) é o `dispatchLeadContact`. Se o lead não responde,
 * a cadência envia mais dois toques com ângulos DIFERENTES (prova → prazo),
 * em vez de repetir a mesma mensagem. Para no primeiro sinal de conversa,
 * respeita o opt-out (LGPD) e tem teto diário para não queimar o número.
 */

export interface CadenceStep {
  /** Número do toque (2 = segundo contato, 3 = terceiro). */
  step: 2 | 3;
  dueAfterDays: number;
  angle: "prova" | "prazo";
}

export const CADENCE_STEPS: CadenceStep[] = [
  { step: 2, dueAfterDays: 3, angle: "prova" },
  { step: 3, dueAfterDays: 7, angle: "prazo" },
];

export const DEFAULT_CADENCE_DAILY_CAP = 20;
export const MAX_CADENCE_ATTEMPTS = 3;

export interface CadenceCandidate {
  lead: StoredLead;
  step: CadenceStep;
  dueAt: string;
  message: string;
}

export interface CadenceSkip {
  leadId: string;
  name: string;
  reason: string;
}

export interface CadencePlan {
  enabled: boolean;
  candidates: CadenceCandidate[];
  skipped: CadenceSkip[];
  cap: number;
  usedToday: number;
  remaining: number;
}

function firstName(name: string): string {
  return String(name || "").trim().split(/\s+/)[0] || "tudo bem";
}

function daysBetween(fromIso: string, now: Date): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return Number.NaN;
  return (now.getTime() - from) / (1000 * 60 * 60 * 24);
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Próximo passo da cadência para o lead (ou null se já terminou). */
export function nextCadenceStep(lead: StoredLead): CadenceStep | null {
  const attempts = lead.contactAttempts ?? 0;
  if (attempts >= MAX_CADENCE_ATTEMPTS) return null;
  if (attempts < 1) return null;
  return CADENCE_STEPS.find((step) => step.step === attempts + 1) || null;
}

/**
 * Monta a mensagem do toque. Determinística e gratuita (sem Gemini): a
 * personalização vem do gancho real (auditoria/sem site), não de IA genérica.
 */
export function buildCadenceMessage(lead: StoredLead, step: CadenceStep): string {
  return whatsAppify(buildCadenceRaw(lead, step));
}

function buildCadenceRaw(lead: StoredLead, step: CadenceStep): string {
  const name = firstName(lead.name);
  const audit = lead.siteAudit;
  const headline = audit?.headline?.replace(/\.$/, "");
  const bullet = audit?.bullets?.[0];
  const status = effectiveWebsiteStatus(lead);
  const hasSite = status === "has_website";

  if (step.angle === "prova") {
    if (hasSite && audit) {
      return [
        `Oi ${name}! Semana passada te mandei o diagnóstico do site da ${lead.name}${headline ? ` (${headline.toLowerCase()})` : ""}.`,
        `Montei uma prévia de como ficaria a primeira tela — mais rápida e com botão de WhatsApp direto.`,
        `Quer que eu te mande aqui pra você ver?`,
      ].join("\n");
    }
    if (status === "marketplace_only") {
      const platform = presenceLabel(lead.websiteUrl) || "marketplace";
      return [
        `Oi ${name}! Vi que a ${lead.name} vende pelo ${platform} mas não tem site próprio.`,
        `Fiz um esboço de uma página simples com cardápio/serviços, botão de WhatsApp e pedido direto — sem depender de comissão de marketplace.`,
        `Posso te mandar a prévia?`,
      ].join("\n");
    }
    return [
      `Oi ${name}! Vi que a ${lead.name} aparece no Google mas não tem site próprio.`,
      `Fiz um esboço de como ficaria uma página de ${lead.category || "apresentação"} pra vocês, com botão de WhatsApp e formulário de orçamento.`,
      `Posso te mandar a prévia?`,
    ].join("\n");
  }

  // ângulo "prazo"
  const date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  if (bullet) {
    return [
      `Oi ${name}, tudo bem? Vou fechar a agenda de sites na sexta (${date}).`,
      `O ponto principal do site da ${lead.name} continua sendo ${bullet.toLowerCase()}.`,
      `Consigo encaixar vocês essa semana — prefere que eu te ligue hoje ou amanhã?`,
    ].join("\n");
  }
  return [
    `Oi ${name}, tudo bem? Vou fechar a agenda de sites na sexta (${date}).`,
    `Consigo encaixar a ${lead.name} ainda essa semana.`,
    `Prefere que eu te ligue hoje ou amanhã?`,
  ].join("\n");
}

function usedTodayCount(now: Date): number {
  // Mesma conta da humanização (dia LOCAL, status entregues) para o teto da
  // cadência e o teto global não divergirem.
  try {
    return getHumanizeUsage(now).sentToday;
  } catch {
    const dayPrefix = now.toISOString().slice(0, 10);
    return getCommunications().filter(
      (comm) =>
        comm.channel === "whatsapp" &&
        comm.direction === "outbound" &&
        ["sent", "delivered", "read"].includes(comm.status) &&
        String(comm.createdAt || "").startsWith(dayPrefix)
    ).length;
  }
}

export interface PlanCadenceOptions {
  now?: Date;
  limit?: number;
  leadIds?: string[];
  dailyCap?: number;
}

function cadenceEnabled(): boolean {
  return getSetting("automation_cadence_enabled") !== "false";
}

/**
 * Teto da cadência: setting próprio quando existe; senão herda o teto diário
 * total da humanização (é o mesmo orçamento de mensagens por dia).
 */
function configuredDailyCap(): number {
  const raw = getSetting("automation_cadence_daily_cap");
  if (raw === null || raw === "") {
    try {
      return getHumanizeSettings().dailyTotalCap;
    } catch {
      return DEFAULT_CADENCE_DAILY_CAP;
    }
  }
  const parsed = Math.floor(Number(raw));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_CADENCE_DAILY_CAP;
}

/** Seleciona quem recebe o próximo toque agora (função pura, sem enviar). */
export function planCadence(opts: PlanCadenceOptions = {}): CadencePlan {
  const now = opts.now || new Date();
  const cap = opts.dailyCap ?? configuredDailyCap();
  const usedToday = usedTodayCount(now);
  const remaining = Math.max(0, cap - usedToday);

  const skipped: CadenceSkip[] = [];
  const candidates: CadenceCandidate[] = [];

  const leads = getLeads().filter((lead) => !opts.leadIds || opts.leadIds.includes(lead.id));

  for (const lead of leads) {
    if (lead.doNotContact) {
      skipped.push({ leadId: lead.id, name: lead.name, reason: "opt-out (não quer contato)" });
      continue;
    }
    const step = nextCadenceStep(lead);
    if (!step) continue;

    if (!lead.lastContactAt) {
      skipped.push({ leadId: lead.id, name: lead.name, reason: "sem contato anterior (use /contact)" });
      continue;
    }
    if (["closed", "declined", "negotiating", "em_desenvolvimento"].includes(lead.pipelineStatus)) {
      skipped.push({ leadId: lead.id, name: lead.name, reason: `já está em "${lead.pipelineStatus}"` });
      continue;
    }
    if (lead.nextContactAt && new Date(lead.nextContactAt).getTime() > now.getTime()) {
      skipped.push({ leadId: lead.id, name: lead.name, reason: "em janela de recontato acordada" });
      continue;
    }

    const history = getCommunicationsByLead(lead.id);
    const latest = history[0];
    if (latest?.direction === "inbound") {
      skipped.push({ leadId: lead.id, name: lead.name, reason: "conversa aberta — responda em vez de seguir a cadência" });
      continue;
    }
    if (lead.lastResponseAt && lead.lastResponseAt >= lead.lastContactAt) {
      skipped.push({ leadId: lead.id, name: lead.name, reason: "já respondeu — cadência encerrada" });
      continue;
    }

    const elapsed = daysBetween(lead.lastContactAt, now);
    if (Number.isNaN(elapsed)) {
      skipped.push({ leadId: lead.id, name: lead.name, reason: "data de último contato inválida" });
      continue;
    }
    if (elapsed < step.dueAfterDays) continue;

    candidates.push({
      lead,
      step,
      dueAt: addDays(lead.lastContactAt, step.dueAfterDays),
      message: buildCadenceMessage(lead, step),
    });
  }

  candidates.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const limited = typeof opts.limit === "number" ? candidates.slice(0, Math.max(0, opts.limit)) : candidates;

  return {
    enabled: cadenceEnabled(),
    candidates: limited,
    skipped,
    cap,
    usedToday,
    remaining,
  };
}

export interface CadenceRunResult {
  ranAt: string;
  dryRun: boolean;
  enabled: boolean;
  blockedReason?: string;
  cap: number;
  usedToday: number;
  remaining: number;
  planned: number;
  sent: Array<{ leadId: string; name: string; step: number; angle: string; status: string; detail: string }>;
  failed: Array<{ leadId: string; name: string; step: number; detail: string }>;
  blockedByCap: number;
  skipped: CadenceSkip[];
}

/**
 * Executa a cadência. `dryRun` é o padrão: sem ele, nada é enviado.
 * O teto diário conta TODAS as mensagens outbound do dia (todas as origens).
 */
/**
 * Serializa execuções reais: manual + agendada podem disparar juntas e, sem
 * isso, ambas leriam o mesmo `usedToday` e estourariam o teto diário.
 * Simulações não entram na fila.
 */
let cadenceRunChain: Promise<unknown> = Promise.resolve();

export async function runCadence(
  opts: PlanCadenceOptions & { dryRun?: boolean } = {}
): Promise<CadenceRunResult> {
  if (opts.dryRun === false) {
    const run = cadenceRunChain.then(
      () => runCadenceInner(opts),
      () => runCadenceInner(opts)
    );
    cadenceRunChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
  return runCadenceInner(opts);
}

async function runCadenceInner(
  opts: PlanCadenceOptions & { dryRun?: boolean } = {}
): Promise<CadenceRunResult> {
  const dryRun = opts.dryRun !== false;
  const plan = planCadence(opts);
  const ranAt = (opts.now || new Date()).toISOString();

  const result: CadenceRunResult = {
    ranAt,
    dryRun,
    enabled: plan.enabled,
    cap: plan.cap,
    usedToday: plan.usedToday,
    remaining: plan.remaining,
    planned: plan.candidates.length,
    sent: [],
    failed: [],
    blockedByCap: 0,
    skipped: plan.skipped,
  };

  if (dryRun) return result;

  if (!plan.enabled) {
    result.blockedReason = "cadence_disabled";
    return result;
  }

  let budget = plan.remaining;
  for (const candidate of plan.candidates) {
    if (budget <= 0) {
      result.blockedByCap += 1;
      continue;
    }
    const { lead, step, message } = candidate;
    try {
      // O texto de cada toque é escrito pelo agente a partir do dossiê; se a IA
      // não entregar algo aprovado, mantém o texto determinístico do plano.
      let text = message;
      let hook: string | undefined;
      {
        const composed = await composeCadenceMessage(lead, step.angle);
        if (composed.source === "ia") {
          text = composed.message;
          hook = composed.hook;
        }
      }

      const dispatch = await dispatchLeadContact(lead, {
        message: text,
        hook,
        // Sem hook explícito: a atribuição usa o gancho do PRIMEIRO contato
        // (o follow-up não pode roubar o crédito da resposta).
        ignoreCooldown: true,
      });
      if (dispatch.status === "sent") {
        budget -= 1;
        result.sent.push({
          leadId: lead.id,
          name: lead.name,
          step: step.step,
          angle: step.angle,
          status: dispatch.status,
          detail: dispatch.detail,
        });
      } else {
        result.failed.push({
          leadId: lead.id,
          name: lead.name,
          step: step.step,
          detail: dispatch.detail,
        });
      }
    } catch (err: any) {
      result.failed.push({
        leadId: lead.id,
        name: lead.name,
        step: step.step,
        detail: err?.message || "Falha ao enviar o toque da cadência.",
      });
    }
  }

  return result;
}
