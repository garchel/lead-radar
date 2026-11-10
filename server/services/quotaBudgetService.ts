import { getSetting, setSetting } from "../store/db";
import { getSerpApiUsage } from "./serpApi";

/**
 * Orçamento de cota da SerpAPI.
 *
 * A conta da SerpAPI é mensal e a chave renova no ciclo de faturamento. Em vez de
 * gastar tudo de uma vez (e ficar 20 dias sem buscar), o orçamento divide o que
 * sobrou pelos dias que faltam no ciclo:
 *
 *   buscas por dia = cota restante ÷ dias restantes
 *
 * Assim o gasto se autocorrige: se um dia não rodou, o dia seguinte tem orçamento
 * maior; se gastou demais, os próximos ficam menores. Dentro do dia, as buscas são
 * espaçadas pela janela ativa (nada de rajada), respeitando também o limite por
 * hora do plano.
 */

const STATE_KEY = "serpapi_budget_state";
const DEFAULT_WINDOW_START = 8; // hora local
const DEFAULT_WINDOW_END = 22;
const MIN_INTERVAL_MINUTES = 6; // piso: evita rajada (10 buscas/hora)

export interface QuotaBudgetState {
  /** Dia local (YYYY-MM-DD) a que os contadores abaixo se referem. */
  dayKey: string;
  /** Buscas que consumiram cota hoje. */
  usedToday: number;
  /** Tentativas feitas hoje (inclui as que vieram do cache e não gastaram cota). */
  attemptsToday: number;
  lastRunAt: string | null;
  lastConsumed: boolean;
}

export interface QuotaBudgetPlan {
  configured: boolean;
  monthlyQuota: number;
  remainingThisMonth: number;
  daysLeftInCycle: number;
  dailyBudget: number;
  usedToday: number;
  remainingToday: number;
  attemptsToday: number;
  intervalMinutes: number;
  windowStartHour: number;
  windowEndHour: number;
  windowOpen: boolean;
  hourlyCap: number;
  nextResetAt: string | null;
  nextRunAt: string | null;
}

function localDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function clampHour(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(23, Math.floor(n)));
}

export function getBudgetWindow(): { startHour: number; endHour: number } {
  const startRaw = getSetting("serpapi_budget_window_start");
  const endRaw = getSetting("serpapi_budget_window_end");
  let startHour = clampHour(startRaw ?? process.env.SERPAPI_WINDOW_START, DEFAULT_WINDOW_START);
  let endHour = clampHour(endRaw ?? process.env.SERPAPI_WINDOW_END, DEFAULT_WINDOW_END);
  if (endHour <= startHour) {
    startHour = DEFAULT_WINDOW_START;
    endHour = DEFAULT_WINDOW_END;
  }
  return { startHour, endHour };
}

export function setBudgetWindow(startHour: number, endHour: number): void {
  const s = clampHour(startHour, DEFAULT_WINDOW_START);
  const e = clampHour(endHour, DEFAULT_WINDOW_END);
  if (e <= s) throw new Error("Janela de buscas inválida: a hora final precisa ser maior que a inicial.");
  setSetting("serpapi_budget_window_start", String(s));
  setSetting("serpapi_budget_window_end", String(e));
}

function emptyState(dayKey: string): QuotaBudgetState {
  return { dayKey, usedToday: 0, attemptsToday: 0, lastRunAt: null, lastConsumed: false };
}

export function getBudgetState(now = new Date()): QuotaBudgetState {
  const dayKey = localDayKey(now);
  let parsed: QuotaBudgetState | null = null;
  try {
    const raw = getSetting(STATE_KEY);
    if (raw) parsed = JSON.parse(raw) as QuotaBudgetState;
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.dayKey !== dayKey) return emptyState(dayKey);
  return {
    dayKey,
    usedToday: Math.max(0, Number(parsed.usedToday) || 0),
    attemptsToday: Math.max(0, Number(parsed.attemptsToday) || 0),
    lastRunAt: parsed.lastRunAt || null,
    lastConsumed: Boolean(parsed.lastConsumed),
  };
}

function saveBudgetState(state: QuotaBudgetState): void {
  setSetting(STATE_KEY, JSON.stringify(state));
}

/** Dias restantes no ciclo de faturamento da chave (mínimo 1). */
export function daysLeftInCycle(nextResetISO: string | null, now = new Date()): number {
  if (!nextResetISO) return 1;
  const reset = new Date(nextResetISO).getTime();
  if (!Number.isFinite(reset)) return 1;
  const ms = reset - now.getTime();
  if (ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / 86400000));
}

export function computeDailyBudget(remaining: number, daysLeft: number): number {
  if (remaining <= 0) return 0;
  const days = Math.max(1, Math.floor(daysLeft));
  // arredonda para BAIXO: melhor sobrar cota no fim do ciclo do que estourar
  return Math.floor(remaining / days);
}

export function computeIntervalMinutes(dailyBudget: number, windowHours: number, throughputPerHour: number): number {
  const floor = Math.max(MIN_INTERVAL_MINUTES, Math.ceil(60 / Math.max(1, throughputPerHour)));
  if (dailyBudget <= 0) return floor;
  const windowMinutes = Math.max(60, windowHours * 60);
  return Math.max(floor, Math.floor(windowMinutes / dailyBudget));
}

export function isWindowOpen(now = new Date()): boolean {
  const { startHour, endHour } = getBudgetWindow();
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}

export function getBudgetPlan(now = new Date()): QuotaBudgetPlan {
  const usage = getSerpApiUsage();
  const state = getBudgetState(now);
  const { startHour, endHour } = getBudgetWindow();
  const daysLeft = daysLeftInCycle(usage.nextMonthlyReset, now);
  const remaining = Math.max(0, usage.remainingThisMonth);
  const dailyBudget = computeDailyBudget(remaining, daysLeft);
  const intervalMinutes = computeIntervalMinutes(
    dailyBudget,
    endHour - startHour,
    usage.throughputPerHour
  );
  const remainingToday = Math.max(0, dailyBudget - state.usedToday);
  const windowOpen = isWindowOpen(now);

  let nextRunAt: string | null = null;
  if (remainingToday > 0) {
    const intervalMs = intervalMinutes * 60000;
    const last = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
    const candidate = new Date(Math.max(now.getTime(), last + intervalMs));
    if (windowOpen) {
      nextRunAt = candidate.toISOString();
    } else {
      const next = new Date(now);
      if (now.getHours() >= endHour) next.setDate(next.getDate() + 1);
      next.setHours(startHour, 0, 0, 0);
      nextRunAt = next.toISOString();
    }
  }

  return {
    configured: usage.configured,
    monthlyQuota: usage.searchesPerMonth,
    remainingThisMonth: remaining,
    daysLeftInCycle: daysLeft,
    dailyBudget,
    usedToday: state.usedToday,
    remainingToday,
    attemptsToday: state.attemptsToday,
    intervalMinutes,
    windowStartHour: startHour,
    windowEndHour: endHour,
    windowOpen,
    hourlyCap: usage.throughputPerHour,
    nextResetAt: usage.nextMonthlyReset || null,
    nextRunAt,
  };
}

export interface BudgetGate {
  allowed: boolean;
  reason?: string;
  plan: QuotaBudgetPlan;
}

/**
 * Decide se uma busca pode sair AGORA.
 * `force` ignora janela e intervalo (usado por botão manual / run-now).
 */
export function canRunSearch(now = new Date(), opts?: { force?: boolean }): BudgetGate {
  const plan = getBudgetPlan(now);
  if (!plan.configured) {
    return { allowed: false, reason: "Nenhuma chave SerpAPI configurada.", plan };
  }
  if (plan.remainingThisMonth <= 0) {
    return {
      allowed: false,
      reason: `Cota mensal esgotada (${plan.remainingThisMonth}/${plan.monthlyQuota}). Renova em ${
        plan.nextResetAt ? new Date(plan.nextResetAt).toLocaleDateString("pt-BR") : "no próximo ciclo"
      }.`,
      plan,
    };
  }
  if (plan.dailyBudget <= 0) {
    return { allowed: false, reason: "Orçamento de hoje é zero (cota restante pequena para os dias que faltam).", plan };
  }
  if (opts?.force) return { allowed: true, plan };
  if (!plan.windowOpen) {
    return {
      allowed: false,
      reason: `Fora da janela de buscas (${plan.windowStartHour}h–${plan.windowEndHour}h).`,
      plan,
    };
  }
  if (plan.remainingToday <= 0) {
    return {
      allowed: false,
      reason: `Orçamento de hoje já usado (${plan.usedToday}/${plan.dailyBudget}). Retoma amanhã.`,
      plan,
    };
  }
  if (plan.nextRunAt && new Date(plan.nextRunAt).getTime() > now.getTime()) {
    return { allowed: false, reason: `Intervalo de ${plan.intervalMinutes} min entre buscas.`, plan };
  }
  return { allowed: true, plan };
}

/** Registra uma busca. Só conta no orçamento do dia quando consumiu cota de verdade. */
export function registerSearch(consumed: boolean, now = new Date()): QuotaBudgetState {
  const state = getBudgetState(now);
  const next: QuotaBudgetState = {
    dayKey: state.dayKey,
    usedToday: state.usedToday + (consumed ? 1 : 0),
    attemptsToday: state.attemptsToday + 1,
    lastRunAt: now.toISOString(),
    lastConsumed: consumed,
  };
  saveBudgetState(next);
  return next;
}

/** Zera os contadores do dia (usado por testes e pelo botão "recalcular"). */
export function resetBudgetState(now = new Date()): QuotaBudgetState {
  const state = emptyState(localDayKey(now));
  saveBudgetState(state);
  return state;
}
