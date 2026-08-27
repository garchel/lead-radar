import { Cron } from "croner";
import { getSchedules, getScheduleById, upsertSchedule } from "../store/db";
import { Schedule } from "../store/types";
import { queueManager } from "../jobs/queueManager";
import { getSchedulerConfig } from "../config";

/**
 * Monta os parâmetros (type/title/payload) de um Job a partir de um agendamento.
 * Função pura — isolada para testes, sem efeitos colaterais na fila.
 */
export function buildScheduleJobInput(
  schedule: Schedule,
  maxLeadsPerRun?: number
): { type: "mcp_autopilot" | "batch_prospecting" | "follow_up_batch"; title: string; payload: any } {
  if (schedule.jobType === "follow_up_reminder") {
    return {
      type: "follow_up_batch",
      title: `[Agendado] ${schedule.name}`,
      payload: {},
    };
  }

  if (schedule.jobType === "batch_prospecting") {
    const {
      locations = ["Campinas"],
      state = "SP",
      categories = ["Todas as Categorias"],
      filterNoWebsiteOnly = true,
      // Rotação round-robin da base IBGE: pega as próximas cidades há mais
      // tempo sem buscar, em vez de uma lista fixa de locations.
      useCityRotation = false,
      citiesPerRun = 3,
      uf,
      minPopulation = 30000,
      maxPopulation = 200000,
      // Filtro de propensão mínima das categorias (0 = sem filtro)
      minPropensity = 0,
    } = schedule.payload || {};
    return {
      type: "batch_prospecting",
      title: `[Agendado] ${schedule.name}`,
      payload: {
        useCityRotation,
        citiesPerRun,
        uf,
        minPopulation,
        maxPopulation,
        minPropensity,
        locations: useCityRotation ? [] : locations,
        state,
        categories,
        filterNoWebsiteOnly,
        autoEnrich: true,
      },
    };
  }

  const {
    location = "Campinas",
    state = "SP",
    category = "Estética & Saúde",
    autoEnrich = true,
    sendPitches = false,
  } = schedule.payload || {};
  return {
    type: "mcp_autopilot",
    title: `[Agendado] ${schedule.name}`,
    payload: { location, state, category, autoEnrich, sendPitches, maxLeads: maxLeadsPerRun || 5 },
  };
}

/**
 * Scheduler — Orquestração/agenda de prospecção periódica (Fase 2 pendente do roadmap).
 *
 * Dispara Jobs recorrentes (via croner, in-process) com base em agendamentos
 * persistidos no banco compartilhado (`schedules`). A UI, as rotas REST e o Hermes
 * (via tool MCP `schedule_prospecting`) leem/gravam os MESMOS agendamentos,
 * alinhado ao princípio do "banco compartilhado".
 *
 * Guardrails de autonomia (seção 8 do plano-mestre):
 *  - Máx. de Landing Pages criadas por dia (configurável, default 5).
 *  - Aprovação humana continua obrigatória antes do deploy (cadeia de status da LP).
 *  - Rate limits externos são tratados pelo cache/backoff já existentes no autopilot.
 */
class Scheduler {
  private crons = new Map<string, Cron>();
  private started = false;

  /** Registra um cron reversível para um agendamento habilitado. */
  private register(schedule: Schedule) {
    if (!schedule.enabled) return;
    const jobFn = async () => this.fire(schedule);
    try {
      const cron = new Cron(schedule.cron, { name: schedule.name }, jobFn);
      this.crons.set(schedule.id, cron);
      this.updateNextRun(schedule);
    } catch (err) {
      console.error(`[Scheduler] Cron inválido para "${schedule.name}" (${schedule.cron}):`, err);
    }
  }

  private updateNextRun(schedule: Schedule) {
    try {
      const cron = this.crons.get(schedule.id);
      if (!cron) return;
      const next = cron.nextRun();
      upsertSchedule({ ...schedule, nextRunAt: next ? next.toISOString() : undefined });
    } catch {
      /* best-effort */
    }
  }

  /** Handler executado quando o cron dispara. */
  private async fire(schedule: Schedule) {
    const config = getSchedulerConfig();
    if (!config.enabled) return;

    const now = new Date().toISOString();
    const current = getScheduleById(schedule.id) || schedule;
    upsertSchedule({ ...current, lastRunAt: now });

    const job = this.enqueueForSchedule(current, config.maxLeadsPerRun);
    if (job) {
      console.log(`[Scheduler] "${current.name}" disparado: job ${job.id} (${job.type}).`);
    }
    this.updateNextRun(current);
  }

  /** Converte um agendamento em um Job real da fila persistente. */
  enqueueForSchedule(schedule: Schedule, maxLeadsPerRun?: number): ReturnType<typeof queueManager.createJob> | null {
    const input = buildScheduleJobInput(schedule, maxLeadsPerRun);
    return queueManager.createJob(input.type, input.title, input.payload);
  }

  /** (Re)carrega todos os agendamentos do banco. */
  private load() {
    for (const s of getSchedules()) {
      this.register(s);
    }
  }

  /** Re-registra um único agendamento (após create/update/delete). */
  reloadOne(id: string) {
    this.crons.get(id)?.stop();
    this.crons.delete(id);
    const s = getScheduleById(id);
    if (s) this.register(s);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.load();
    const total = this.crons.size;
    console.log(
      `[Scheduler] ${total} agendamento(s) ativo(s).`
    );
  }

  stop() {
    for (const cron of this.crons.values()) cron.stop();
    this.crons.clear();
    this.started = false;
  }

  /** Número de crons atualmente registrados (útil para debug/testes). */
  get activeCount(): number {
    return this.crons.size;
  }
}

/**
 * Cria (uma única vez) o agendamento padrão de recontatos autorizados.
 * Roda diariamente e apenas enfileira a fila informativa — nunca envia
 * mensagens sem aprovação humana. O usuário pode pausar/remover pela UI.
 */
export function ensureDefaultFollowUpSchedule() {
  const hasFollowUp = getSchedules().some((s) => s.jobType === "follow_up_reminder");
  if (hasFollowUp) return;
  const now = new Date().toISOString();
  upsertSchedule({
    id: "sch_default_followups",
    name: "Recontatos autorizados (diário)",
    cron: "0 8 * * *",
    jobType: "follow_up_reminder",
    payload: {},
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
}

/** Singleton global do agendador. */
export const scheduler = new Scheduler();