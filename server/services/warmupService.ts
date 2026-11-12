/**
 * Aquecimento do número (rampa de volume).
 *
 * Número novo que começa enviando 30 mensagens frias no primeiro dia é o
 * caminho mais curto para restrição. Este serviço transforma o teto de contatos
 * novos em uma ESCADA que sobe sozinha conforme o número ganha idade, e trava a
 * subida quando a qualidade cai.
 *
 * Regra: `cap do dia = min(maxCap, startCap + incremento × (dia − 1))`
 * Dia 1 = dia do primeiro envio bem-sucedido (não a data da configuração), então
 * ligar o aquecimento hoje e só começar a prospectar em duas semanas não
 * "gasta" a rampa.
 *
 * Freios (o que separa aquecimento de contador):
 * - **3+ falhas nas últimas 24h** → o cap NÃO sobe (repete o de ontem);
 * - **1+ opt-out nas últimas 24h** → o cap NÃO sobe;
 * - a subida também nunca passa do teto configurado na humanização (30).
 */

import { getDb } from "../store/schema";
import { getSetting, setSetting } from "../store/db";

export interface WarmupSettings {
  enabled: boolean;
  /** Contatos novos no dia 1. */
  startCap: number;
  /** Quanto o teto sobe por dia. */
  dailyIncrement: number;
  /** Teto final (nunca acima do teto da humanização). */
  maxCap: number;
  /** Data de início manual (ISO). Vazio = primeiro envio bem-sucedido. */
  startDate?: string | null;
}

export interface WarmupState {
  enabled: boolean;
  /** Dia da rampa (1 = primeiro dia com envio). 0 = ainda não começou. */
  dayNumber: number;
  /** Teto de contatos novos permitido hoje. */
  cap: number;
  startCap: number;
  maxCap: number;
  /** Teto "de cruzeiro" configurado na humanização (para comparar). */
  configuredCap: number;
  /** Trava ativa: motivo pelo qual o cap não subiu hoje. */
  hold: string | null;
  /** Quantos dias ATIVOS faltam para chegar ao maxCap. */
  activeDaysToMax: number;
  failures24h: number;
  optOuts24h: number;
  computedAt: string;
}

export const DEFAULT_WARMUP: WarmupSettings = {
  enabled: true,
  startCap: 5,
  dailyIncrement: 1,
  maxCap: 30,
  startDate: null,
};

const SETTING_KEY = "warmup_settings";
const STATE_KEY = "warmup_state";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function getWarmupSettings(): WarmupSettings {
  let raw: string | null = null;
  try {
    raw = getSetting(SETTING_KEY);
  } catch {
    return DEFAULT_WARMUP;
  }
  if (!raw) return DEFAULT_WARMUP;
  try {
    const parsed = JSON.parse(raw) as Partial<WarmupSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_WARMUP.enabled,
      startCap: clampInt(parsed.startCap, 1, 50, DEFAULT_WARMUP.startCap),
      dailyIncrement: clampInt(parsed.dailyIncrement, 1, 10, DEFAULT_WARMUP.dailyIncrement),
      maxCap: clampInt(parsed.maxCap, 1, 30, DEFAULT_WARMUP.maxCap),
      startDate: typeof parsed.startDate === "string" && parsed.startDate ? parsed.startDate : null,
    };
  } catch {
    return DEFAULT_WARMUP;
  }
}

export function saveWarmupSettings(patch: Partial<WarmupSettings>): WarmupSettings {
  const current = getWarmupSettings();
  const next: WarmupSettings = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    startCap: clampInt(patch.startCap ?? current.startCap, 1, 50, current.startCap),
    dailyIncrement: clampInt(patch.dailyIncrement ?? current.dailyIncrement, 1, 10, current.dailyIncrement),
    maxCap: clampInt(patch.maxCap ?? current.maxCap, 1, 30, current.maxCap),
    startDate:
      patch.startDate === null ? null : typeof patch.startDate === "string" && patch.startDate ? patch.startDate : current.startDate,
  };
  if (next.maxCap < next.startCap) next.maxCap = next.startCap;
  setSetting(SETTING_KEY, JSON.stringify(next));
  return next;
}

/**
 * Dias ATIVOS de prospecção (dias distintos em que houve abordagem enviada).
 *
 * A rampa NÃO avança com o calendário: parar duas semanas e voltar em "dia 15"
 * seria começar em 19/dia sem ter aquecido nada. Dia da rampa = dia com envio.
 * `todaySent` diz se hoje já conta.
 */
export function sendingDays(): { total: number; todaySent: boolean } {
  try {
    const row = getDb()
      .prepare(
        `SELECT COUNT(DISTINCT date(created_at, 'localtime')) AS days,
                MAX(CASE WHEN date(created_at, 'localtime') = date('now', 'localtime') THEN 1 ELSE 0 END) AS today
           FROM communications
          WHERE direction = 'outbound'
            AND status IN ('sent', 'delivered', 'read')
            AND hook IS NOT NULL AND hook <> 'conversa'
            AND (? IS NULL OR created_at >= ?)`
      )
      .get(startDateArg(), startDateArg()) as { days?: number; today?: number } | undefined;
    return { total: Number(row?.days || 0), todaySent: Number(row?.today || 0) === 1 };
  } catch {
    return { total: 0, todaySent: false };
  }
}

function startDateArg(): string | null {
  const raw = getWarmupSettings().startDate;
  return raw || null;
}

/** Primeiro contato frio (mantido para diagnóstico). */
export function firstApproachSendAt(): string | null {
  try {
    const row = getDb()
      .prepare(
        `SELECT MIN(created_at) AS first FROM communications
          WHERE direction = 'outbound'
            AND status IN ('sent', 'delivered', 'read')
            AND hook IS NOT NULL AND hook <> 'conversa'
            AND (? IS NULL OR created_at >= ?)`
      )
      .get(startDateArg(), startDateArg()) as { first?: string } | undefined;
    return row?.first || null;
  } catch {
    return null;
  }
}

function countSince(sql: string, sinceIso: string): number {
  try {
    const row = getDb().prepare(sql).get(sinceIso) as { total?: number } | undefined;
    return Number(row?.total || 0);
  } catch {
    return 0;
  }
}

/**
 * Estado do aquecimento agora. `configuredCap` é o teto da humanização: o
 * resultado nunca pode ser maior que ele.
 */
export function getWarmupState(now: Date = new Date(), configuredCap = 30): WarmupState {
  const settings = getWarmupSettings();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const failures24h = countSince(
    "SELECT COUNT(*) AS total FROM communications WHERE direction = 'outbound' AND status = 'failed' AND created_at >= ?",
    since
  );
  const optOuts24h = countSince(
    `SELECT COUNT(*) AS total FROM leads WHERE do_not_contact = 1 AND updated_at >= ?`,
    since
  );

  const base: WarmupState = {
    enabled: settings.enabled,
    dayNumber: 0,
    cap: configuredCap,
    startCap: settings.startCap,
    maxCap: Math.min(settings.maxCap, configuredCap),
    configuredCap,
    hold: null,
    activeDaysToMax: 0,
    failures24h,
    optOuts24h,
    computedAt: now.toISOString(),
  };

  if (!settings.enabled) return base;

  // Número ainda não abordou ninguém: dia 1 (o menor cap), não o teto.
  const { total: activeDays, todaySent } = sendingDays();
  if (activeDays === 0) {
    return { ...base, dayNumber: 1, cap: Math.min(settings.startCap, base.maxCap) };
  }

  // Hoje já enviou → o dia de hoje está contado. Ainda não → hoje é o próximo.
  const dayNumber = todaySent ? activeDays : activeDays + 1;

  // Freio de qualidade: com falha ou opt-out recente, o cap de hoje repete o de ontem.
  let hold: string | null = null;
  if (failures24h >= 3) hold = `${failures24h} falhas de envio nas últimas 24h — teto congelado`;
  else if (optOuts24h >= 1) hold = `${optOuts24h} pedido(s) de saída nas últimas 24h — teto congelado`;

  const effectiveDay = hold ? Math.max(1, dayNumber - 1) : dayNumber;
  const allowed = settings.startCap + settings.dailyIncrement * (effectiveDay - 1);
  const cap = Math.min(base.maxCap, allowed);

  const activeDaysToMax = settings.dailyIncrement > 0
    ? Math.max(0, Math.ceil((base.maxCap - settings.startCap) / settings.dailyIncrement))
    : 0;

  const state: WarmupState = {
    ...base,
    dayNumber,
    cap,
    hold,
    activeDaysToMax,
  };

  // Última leitura fica disponível para scripts/UI que não falam com a API.
  try {
    setSetting(STATE_KEY, JSON.stringify(state));
  } catch {
    /* diagnóstico é best-effort */
  }

  return state;
}

/** Teto efetivo de contatos novos para o gate de humanização. */
export function warmupNewContactCap(now: Date = new Date(), configuredCap = 30): number {
  return getWarmupState(now, configuredCap).cap;
}

/** Texto de uma linha para explicar ao humano em que dia da rampa ele está. */
export function describeWarmup(state: WarmupState): string {
  if (!state.enabled) return "Aquecimento desligado — vale o teto configurado.";
  const base = `Dia ${state.dayNumber} da rampa: até ${state.cap} contato(s) novo(s) hoje (teto final ${state.maxCap}).`;
  return state.hold ? `${base} Travado: ${state.hold}.` : base;
}
