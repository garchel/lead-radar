import { warmupNewContactCap } from "./warmupService";
import { getCommunications, getCommunicationsByLead, getSetting, setSetting } from "../store/db";
import type { Communication } from "../store/db";

/* ------------------------------------------------------------------ */
/*  Humanização do envio de WhatsApp                                   */
/*                                                                     */
/*  Automação não-oficial (WhatsMiau/Evolution/Baileys) é passível de  */
/*  banimento quando o padrão de envio é "robô": rajada de mensagens,  */
/*  envio 24h, sem pausa. Este serviço impõe o comportamento de uma    */
/*  pessoa operando o celular:                                          */
/*                                                                     */
/*   1. JANELA DE HORÁRIO                                                */
/*      - resposta:       07h–20h, todos os dias                        */
/*      - prospecção:     08h–18h, seg–sex                              */
/*   2. DELAY DE DIGITAÇÃO — proporcional ao texto (base + por char,    */
/*      com jitter), teto configurável.                                 */
/*   3. PAUSA ENTRE ENVIOS — 45–120s aleatórios entre uma mensagem e a  */
/*      seguinte (medido do ÚLTIMO envio bem-sucedido).                 */
/*   4. TETOS DIÁRIOS — total de mensagens/dia e contatos novos/dia.    */
/*                                                                     */
/*  O "dia" aqui é o dia LOCAL do servidor (o mesmo das janelas), não o */
/*  dia UTC: enviar às 22h conta para o dia que o operador vê.          */
/*                                                                     */
/*  Quando um envio é barrado, ele NÃO é enviado e a comunicação fica   */
/*  registrada como `failed` com o motivo — aparece na outbox para      */
/*  reenvio manual quando a janela reabrir.                             */
/* ------------------------------------------------------------------ */

export type SendPurpose = "reply" | "prospect";

export interface HumanizeSettings {
  /** Kill switch: desligado = envia na hora, sem janela/pausa/delay. */
  enabled: boolean;
  replyStartHour: number;
  replyEndHour: number;
  prospectStartHour: number;
  prospectEndHour: number;
  prospectWeekdaysOnly: boolean;
  typingBaseMs: number;
  typingPerCharMs: number;
  typingMaxMs: number;
  pauseMinSeconds: number;
  pauseMaxSeconds: number;
  /** Teto de mensagens outbound (WhatsApp) por dia — todas as origens. */
  dailyTotalCap: number;
  /** Teto de primeiros contatos por dia (lead que nunca recebeu nada). */
  dailyNewCap: number;
}

const DEFAULTS: HumanizeSettings = {
  enabled: true,
  replyStartHour: 7,
  replyEndHour: 20,
  prospectStartHour: 8,
  prospectEndHour: 18,
  prospectWeekdaysOnly: true,
  typingBaseMs: 1200,
  typingPerCharMs: 55,
  typingMaxMs: 12000,
  pauseMinSeconds: 45,
  pauseMaxSeconds: 120,
  dailyTotalCap: 60,
  dailyNewCap: 30,
};

/** Campo → chave em `app_settings`. */
const KEYS: Record<keyof HumanizeSettings, string> = {
  enabled: "automation_humanize_enabled",
  replyStartHour: "automation_humanize_reply_start_hour",
  replyEndHour: "automation_humanize_reply_end_hour",
  prospectStartHour: "automation_humanize_prospect_start_hour",
  prospectEndHour: "automation_humanize_prospect_end_hour",
  prospectWeekdaysOnly: "automation_humanize_prospect_weekdays_only",
  typingBaseMs: "automation_humanize_typing_base_ms",
  typingPerCharMs: "automation_humanize_typing_per_char_ms",
  typingMaxMs: "automation_humanize_typing_max_ms",
  pauseMinSeconds: "automation_humanize_pause_min_seconds",
  pauseMaxSeconds: "automation_humanize_pause_max_seconds",
  dailyTotalCap: "automation_humanize_daily_total_cap",
  dailyNewCap: "automation_humanize_daily_new_cap",
};

/** Faixas aceitas na gravação (clamp) — evita config que trava o app. */
const RANGES: Record<keyof HumanizeSettings, [number, number]> = {
  enabled: [0, 0],
  replyStartHour: [0, 23],
  replyEndHour: [1, 24],
  prospectStartHour: [0, 23],
  prospectEndHour: [1, 24],
  prospectWeekdaysOnly: [0, 0],
  typingBaseMs: [0, 60000],
  typingPerCharMs: [0, 500],
  typingMaxMs: [0, 120000],
  pauseMinSeconds: [0, 3600],
  pauseMaxSeconds: [0, 3600],
  dailyTotalCap: [0, 500],
  dailyNewCap: [0, 500],
};

/**
 * Em teste a humanização vem DESLIGADA por padrão para não colocar sleep de
 * digitação/pausa em toda a suíte e não quebrar testes que enviam às 23h.
 * Um teste que existe para exercitá-la grava `automation_humanize_enabled=true`
 * explicitamente (ver tests/humanize.test.ts).
 */
function defaultEnabled(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  return DEFAULTS.enabled;
}

function readNumber(key: string, fallback: number): number {
  const raw = getSetting(key);
  if (raw === null || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = getSetting(key);
  if (raw === null || raw === "") return fallback;
  return raw === "true";
}

export function getHumanizeSettings(): HumanizeSettings {
  try {
    return {
      enabled: readBool(KEYS.enabled, defaultEnabled()),
      replyStartHour: readNumber(KEYS.replyStartHour, DEFAULTS.replyStartHour),
      replyEndHour: readNumber(KEYS.replyEndHour, DEFAULTS.replyEndHour),
      prospectStartHour: readNumber(KEYS.prospectStartHour, DEFAULTS.prospectStartHour),
      prospectEndHour: readNumber(KEYS.prospectEndHour, DEFAULTS.prospectEndHour),
      prospectWeekdaysOnly: readBool(KEYS.prospectWeekdaysOnly, DEFAULTS.prospectWeekdaysOnly),
      typingBaseMs: readNumber(KEYS.typingBaseMs, DEFAULTS.typingBaseMs),
      typingPerCharMs: readNumber(KEYS.typingPerCharMs, DEFAULTS.typingPerCharMs),
      typingMaxMs: readNumber(KEYS.typingMaxMs, DEFAULTS.typingMaxMs),
      pauseMinSeconds: readNumber(KEYS.pauseMinSeconds, DEFAULTS.pauseMinSeconds),
      pauseMaxSeconds: readNumber(KEYS.pauseMaxSeconds, DEFAULTS.pauseMaxSeconds),
      dailyTotalCap: readNumber(KEYS.dailyTotalCap, DEFAULTS.dailyTotalCap),
      dailyNewCap: readNumber(KEYS.dailyNewCap, DEFAULTS.dailyNewCap),
    };
  } catch {
    // Banco indisponível (boot/teste): cai nos defaults sem derrubar o envio.
    return { ...DEFAULTS, enabled: false };
  }
}

export class HumanizeSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HumanizeSettingsError";
  }
}

/** Grava um patch de configuração (valida e faz clamp). Retorna o estado final. */
export function saveHumanizeSettings(patch: Record<string, unknown>): HumanizeSettings {
  if (!patch || typeof patch !== "object") {
    throw new HumanizeSettingsError("Payload de humanização inválido.");
  }

  const next: HumanizeSettings = { ...getHumanizeSettings() };
  const touched: (keyof HumanizeSettings)[] = [];

  for (const [field, value] of Object.entries(patch)) {
    if (!(field in KEYS)) continue;
    const key = field as keyof HumanizeSettings;

    if (key === "enabled" || key === "prospectWeekdaysOnly") {
      if (typeof value !== "boolean") {
        throw new HumanizeSettingsError(`${field} deve ser boolean.`);
      }
      (next[key] as boolean) = value;
      touched.push(key);
      continue;
    }

    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new HumanizeSettingsError(`${field} deve ser número.`);
    }
    const [min, max] = RANGES[key];
    (next[key] as number) = Math.min(max, Math.max(min, Math.round(num)));
    touched.push(key);
  }

  // Validação ANTES de persistir: uma config incoerente não pode ficar gravada.
  if (next.replyStartHour === next.replyEndHour) {
    throw new HumanizeSettingsError("Janela de respostas não pode ter início igual ao fim.");
  }
  if (next.prospectStartHour === next.prospectEndHour) {
    throw new HumanizeSettingsError("Janela de prospecção não pode ter início igual ao fim.");
  }
  if (next.pauseMinSeconds > next.pauseMaxSeconds) {
    throw new HumanizeSettingsError("Pausa mínima não pode ser maior que a máxima.");
  }

  for (const key of touched) {
    setSetting(KEYS[key], String(next[key]));
  }

  return getHumanizeSettings();
}

/* ------------------------------------------------------------------ */
/*  Janelas de horário                                                 */
/* ------------------------------------------------------------------ */

interface SendWindow {
  startHour: number;
  endHour: number;
  weekdaysOnly: boolean;
  label: string;
}

function windowFor(purpose: SendPurpose, s: HumanizeSettings): SendWindow {
  return purpose === "reply"
    ? {
        startHour: s.replyStartHour,
        endHour: s.replyEndHour,
        weekdaysOnly: false,
        label: `respostas ${pad(s.replyStartHour)}h–${pad(s.replyEndHour)}h (todos os dias)`,
      }
    : {
        startHour: s.prospectStartHour,
        endHour: s.prospectEndHour,
        weekdaysOnly: s.prospectWeekdaysOnly,
        label: `prospecção ${pad(s.prospectStartHour)}h–${pad(s.prospectEndHour)}h${s.prospectWeekdaysOnly ? " (seg–sex)" : " (todos os dias)"}`,
      };
}

function pad(hour: number): string {
  return String(hour).padStart(2, "0");
}

function startOfDay(at: Date): Date {
  const d = new Date(at.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isWithinSendWindow(
  purpose: SendPurpose,
  at: Date = new Date(),
  s: HumanizeSettings = getHumanizeSettings()
): boolean {
  const w = windowFor(purpose, s);
  const weekday = at.getDay(); // 0 = domingo
  if (w.weekdaysOnly && (weekday === 0 || weekday === 6)) return false;
  const hour = at.getHours() + at.getMinutes() / 60;
  if (w.startHour <= w.endHour) return hour >= w.startHour && hour < w.endHour;
  // janela que vira o dia (ex.: 22h–06h)
  return hour >= w.startHour || hour < w.endHour;
}

/** Próximo instante em que a janela daquele propósito abre. */
export function nextWindowOpeningAt(
  purpose: SendPurpose,
  at: Date = new Date(),
  s: HumanizeSettings = getHumanizeSettings()
): Date {
  const w = windowFor(purpose, s);
  let day = startOfDay(at);
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(day.getTime());
    candidate.setHours(w.startHour, 0, 0, 0);
    const weekday = candidate.getDay();
    const weekdayOk = !w.weekdaysOnly || (weekday >= 1 && weekday <= 5);
    if (weekdayOk && candidate.getTime() > at.getTime()) return candidate;
    day = startOfDay(new Date(day.getTime() + 24 * 60 * 60 * 1000));
  }
  return new Date(at.getTime() + 24 * 60 * 60 * 1000);
}

/* ------------------------------------------------------------------ */
/*  Delays                                                             */
/* ------------------------------------------------------------------ */

/** Tempo "digitando" proporcional ao tamanho do texto (±15% de jitter). */
export function computeTypingDelayMs(
  message: string,
  s: HumanizeSettings = getHumanizeSettings(),
  random: () => number = Math.random
): number {
  const length = String(message || "").length;
  const raw = s.typingBaseMs + s.typingPerCharMs * length;
  const jittered = raw * (0.85 + random() * 0.3);
  const ceiling = Math.max(s.typingBaseMs, s.typingMaxMs);
  return Math.round(Math.min(ceiling, Math.max(0, jittered)));
}

/** Pausa sorteada entre dois envios (45–120s por padrão). */
export function computePauseMs(
  s: HumanizeSettings = getHumanizeSettings(),
  random: () => number = Math.random
): number {
  const min = Math.max(0, s.pauseMinSeconds) * 1000;
  const max = Math.max(min, s.pauseMaxSeconds * 1000);
  return Math.round(min + random() * (max - min));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ */
/*  Consumo do dia                                                     */
/* ------------------------------------------------------------------ */

const SENT_STATUSES: Communication["status"][] = ["sent", "delivered", "read"];

function isSentOutboundWhatsApp(c: Communication): boolean {
  return c.channel === "whatsapp" && c.direction === "outbound" && SENT_STATUSES.includes(c.status);
}

function dayBounds(now: Date): { start: number; end: number } {
  const start = startOfDay(now);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

export interface HumanizeUsage {
  /** Mensagens outbound de WhatsApp enviadas hoje (todas as origens). */
  sentToday: number;
  /** Quantos desses envios são o PRIMEIRO contato do lead. */
  newContactsToday: number;
}

export function getHumanizeUsage(now: Date = new Date()): HumanizeUsage {
  const { start, end } = dayBounds(now);
  const sent = getCommunications().filter(isSentOutboundWhatsApp);

  const firstSendByLead = new Map<string, number>();
  for (const c of sent) {
    const ts = new Date(c.createdAt).getTime();
    if (Number.isNaN(ts)) continue;
    const current = firstSendByLead.get(c.leadId);
    if (current === undefined || ts < current) firstSendByLead.set(c.leadId, ts);
  }

  let newContactsToday = 0;
  for (const ts of firstSendByLead.values()) {
    if (ts >= start && ts < end) newContactsToday++;
  }

  const sentToday = sent.filter((c) => {
    const ts = new Date(c.createdAt).getTime();
    return ts >= start && ts < end;
  }).length;

  return { sentToday, newContactsToday };
}

/** true quando o lead nunca recebeu uma mensagem nossa com sucesso. */
export function isFirstContactForLead(leadId: string): boolean {
  try {
    return !getCommunicationsByLead(leadId).some(isSentOutboundWhatsApp);
  } catch {
    // Sem histórico legível: trata como primeiro contato (mais conservador).
    return true;
  }
}

/* ------------------------------------------------------------------ */
/*  Gate + pacing                                                      */
/* ------------------------------------------------------------------ */

/**
 * Espera máxima tolerada dentro de uma chamada. Acima disso o envio é
 * barrado com o horário liberado, em vez de segurar um request por minutos.
 */
const MAX_INLINE_WAIT_MS = Number(process.env.WHATSAPP_HUMANIZE_MAX_WAIT_MS || 150000);

export interface SendGate {
  allowed: boolean;
  purpose: SendPurpose;
  /** Espera necessária (pausa entre envios) antes de enviar. */
  waitMs: number;
  reason?: string;
  nextAllowedAt?: string;
  usage: HumanizeUsage;
  isFirstContact: boolean;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function evaluateSendGate(input: {
  leadId?: string;
  purpose: SendPurpose;
  now?: Date;
  settings?: HumanizeSettings;
}): SendGate {
  const now = input.now || new Date();
  const s = input.settings || getHumanizeSettings();
  const usage = getHumanizeUsage(now);
  const isFirstContact = input.leadId ? isFirstContactForLead(input.leadId) : false;

  const base: SendGate = {
    allowed: true,
    purpose: input.purpose,
    waitMs: 0,
    usage,
    isFirstContact,
  };

  if (!s.enabled) return base;

  const w = windowFor(input.purpose, s);

  // 1) janela de horário
  if (!isWithinSendWindow(input.purpose, now, s)) {
    const next = nextWindowOpeningAt(input.purpose, now, s).toISOString();
    return {
      ...base,
      allowed: false,
      nextAllowedAt: next,
      reason:
        input.purpose === "reply"
          ? `Fora da janela de respostas (${w.label}). Próximo envio liberado às ${formatClock(next)}.`
          : `Fora da janela de prospecção (${w.label}). Próximo envio liberado às ${formatClock(next)}.`,
    };
  }

  // 2) teto diário total
  if (usage.sentToday >= s.dailyTotalCap) {
    const next = nextWindowOpeningAt(input.purpose, new Date(now.getTime() + 24 * 60 * 60 * 1000), s).toISOString();
    return {
      ...base,
      allowed: false,
      nextAllowedAt: next,
      reason: `Teto diário de ${s.dailyTotalCap} mensagens atingido (${usage.sentToday} enviadas hoje). Próximo envio liberado às ${formatClock(next)}.`,
    };
  }

  // 3) teto de contatos novos — vale o MENOR entre o configurado e a rampa
  // de aquecimento do número (número novo começa em 5/dia, não em 30).
  const newContactCap = Math.min(s.dailyNewCap, warmupNewContactCap(now, s.dailyNewCap));
  if (isFirstContact && usage.newContactsToday >= newContactCap) {
    const next = nextWindowOpeningAt(input.purpose, new Date(now.getTime() + 24 * 60 * 60 * 1000), s).toISOString();
    return {
      ...base,
      allowed: false,
      nextAllowedAt: next,
      reason: `Teto de ${newContactCap} contatos novos por dia atingido${newContactCap < s.dailyNewCap ? " (aquecimento do número)" : ""} (${usage.newContactsToday} hoje). Próximo primeiro contato liberado às ${formatClock(next)}.`,
    };
  }

  // 4) pausa entre envios
  const notBefore = nextSendNotBeforeAt(s);
  const waitMs = Math.max(0, notBefore - now.getTime());
  if (waitMs <= 0) return base;

  if (waitMs > MAX_INLINE_WAIT_MS) {
    return {
      ...base,
      allowed: false,
      waitMs,
      nextAllowedAt: new Date(notBefore).toISOString(),
      reason: `Pausa entre envios: próximo envio às ${formatClock(new Date(notBefore).toISOString())}.`,
    };
  }

  return { ...base, waitMs };
}

/* --- estado do pacer (por processo) ------------------------------- */

let nextSendNotBefore = 0;
let lastSendAt: number | null = null;
let sendChain: Promise<unknown> = Promise.resolve();

/** Momento mais recente de envio bem-sucedido conhecido (memória ou banco). */
function lastSentAtMs(): number {
  let fromDb = 0;
  try {
    const latest = getCommunications().find(isSentOutboundWhatsApp);
    if (latest) {
      const ts = new Date(latest.createdAt).getTime();
      if (!Number.isNaN(ts)) fromDb = ts;
    }
  } catch {
    /* sem banco: usa só a memória */
  }
  return Math.max(lastSendAt ?? 0, fromDb);
}

function nextSendNotBeforeAt(s: HumanizeSettings): number {
  // Reinício do processo: a pausa mínima ainda vale a partir do último envio.
  const fromDb = lastSentAtMs() + Math.max(0, s.pauseMinSeconds) * 1000;
  return Math.max(nextSendNotBefore, fromDb);
}

export interface PacedResult<T> {
  sent: boolean;
  blocked?: SendGate;
  value?: T;
  typingMs?: number;
}

/**
 * Executa `task` respeitando janela, tetos, pausa entre envios e delay de
 * digitação. Serializa tudo (um envio por vez): dois pedidos simultâneos não
 * podem sair juntos, senão a pausa não valeria nada.
 */
export function runPaced<T>(input: {
  leadId?: string;
  purpose: SendPurpose;
  message: string;
  task: () => Promise<T>;
}): Promise<PacedResult<T>> {
  const run = sendChain.then(
    () => runPacedInner(input),
    () => runPacedInner(input)
  );
  sendChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function runPacedInner<T>(input: {
  leadId?: string;
  purpose: SendPurpose;
  message: string;
  task: () => Promise<T>;
}): Promise<PacedResult<T>> {
  const settings = getHumanizeSettings();

  if (!settings.enabled) {
    const value = await input.task();
    lastSendAt = Date.now();
    return { sent: true, value };
  }

  const gate = evaluateSendGate({ leadId: input.leadId, purpose: input.purpose, settings });
  if (!gate.allowed) return { sent: false, blocked: gate };

  if (gate.waitMs > 0) await sleep(gate.waitMs);

  // A espera pode ter atravessado o fim da janela (ex.: 17h59 + 2 min).
  if (!isWithinSendWindow(input.purpose, new Date(), settings)) {
    const retry = evaluateSendGate({ leadId: input.leadId, purpose: input.purpose, settings });
    return { sent: false, blocked: retry };
  }

  const typingMs = computeTypingDelayMs(input.message, settings);
  if (typingMs > 0) await sleep(typingMs);

  const value = await input.task();
  const now = Date.now();
  lastSendAt = now;
  nextSendNotBefore = now + computePauseMs(settings);
  return { sent: true, value, typingMs };
}

/** Zera o estado em memória do pacer (usado por testes). */
export function resetHumanizePacer(): void {
  nextSendNotBefore = 0;
  lastSendAt = null;
  sendChain = Promise.resolve();
}

/** Diagnóstico para a UI/API: configuração + consumo + próxima liberação. */
export function getHumanizeStatus(now: Date = new Date()) {
  const settings = getHumanizeSettings();
  const usage = getHumanizeUsage(now);
  const notBefore = nextSendNotBeforeAt(settings);
  const last = lastSentAtMs();
  return {
    enabled: settings.enabled,
    settings,
    usage,
    remaining: {
      total: Math.max(0, settings.dailyTotalCap - usage.sentToday),
      newContacts: Math.max(0, Math.min(settings.dailyNewCap, warmupNewContactCap(now, settings.dailyNewCap)) - usage.newContactsToday),
    },
    windows: {
      reply: windowFor("reply", settings),
      prospect: windowFor("prospect", settings),
    },
    withinWindow: {
      reply: isWithinSendWindow("reply", now, settings),
      prospect: isWithinSendWindow("prospect", now, settings),
    },
    lastSendAt: last ? new Date(last).toISOString() : null,
    nextSendAt: notBefore > now.getTime() ? new Date(notBefore).toISOString() : null,
    now: now.toISOString(),
  };
}

export { DEFAULTS as HUMANIZE_DEFAULTS, MAX_INLINE_WAIT_MS };
