/**
 * Assinaturas (receita recorrente).
 *
 * Serve o bot de cliente agora e o site/manutenção depois: uma assinatura é
 * sempre `subject_type + subject_id` (ex.: `bot` + id do cliente do bot).
 *
 * O MRR é calculado só daqui. `bot_clients.monthly_price` é a proposta comercial;
 * a cobrança de verdade vive na assinatura, com vencimento e status.
 */
import { getDb } from "../store/schema";

export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled";
export type SubscriptionSubject = "bot" | "site";

export interface Subscription {
  id: string;
  subjectType: SubscriptionSubject;
  subjectId: string;
  plan: string;
  /** Valor mensal em reais. */
  amount: number;
  status: SubscriptionStatus;
  startedAt: string;
  /** Próximo vencimento (ISO). Null quando cancelada. */
  nextDueAt: string | null;
  canceledAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

let ready = false;

export function ensureSubscriptionTables(): void {
  if (ready) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      next_due_at TEXT,
      canceled_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_subject ON subscriptions(subject_type, subject_id);
  `);
  ready = true;
}

function newId(): string {
  return `sub_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Soma um mês preservando o dia, mas sem estourar o mês:
 * 31/01 + 1 mês = 28/02, e não 03/03.
 */
export function addMonths(iso: string, months: number): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return new Date().toISOString();
  const dia = data.getUTCDate();
  const alvo = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth() + months, 1, 12, 0, 0));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimoDia));
  return alvo.toISOString();
}

function rowToSubscription(row: any): Subscription {
  return {
    id: row.id,
    subjectType: row.subject_type === "site" ? "site" : "bot",
    subjectId: row.subject_id,
    plan: row.plan,
    amount: row.amount ?? 0,
    status: (["trial", "active", "past_due", "canceled"] as SubscriptionStatus[]).includes(row.status)
      ? (row.status as SubscriptionStatus)
      : "active",
    startedAt: row.started_at,
    nextDueAt: row.next_due_at || null,
    canceledAt: row.canceled_at || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSubscription(input: {
  subjectType: SubscriptionSubject;
  subjectId: string;
  plan: string;
  amount: number;
  status?: SubscriptionStatus;
  startedAt?: string;
  notes?: string;
}): Subscription {
  ensureSubscriptionTables();
  const now = new Date().toISOString();
  const inicio = input.startedAt || now;
  const assinatura: Subscription = {
    id: newId(),
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    plan: String(input.plan || "Assinatura").trim(),
    amount: Math.max(0, Math.round(Number(input.amount) || 0)),
    status: input.status || "active",
    startedAt: inicio,
    nextDueAt: input.status === "canceled" ? null : addMonths(inicio, 1),
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO subscriptions (id, subject_type, subject_id, plan, amount, status, started_at, next_due_at, notes, created_at, updated_at)
       VALUES (@id, @subjectType, @subjectId, @plan, @amount, @status, @startedAt, @nextDueAt, @notes, @createdAt, @updatedAt)`
    )
    .run(assinatura);
  return assinatura;
}

export function getSubscription(id: string): Subscription | undefined {
  ensureSubscriptionTables();
  const row = getDb().prepare("SELECT * FROM subscriptions WHERE id = ?").get(id) as any;
  return row ? rowToSubscription(row) : undefined;
}

export function getSubscriptionBySubject(
  subjectType: SubscriptionSubject,
  subjectId: string
): Subscription | undefined {
  ensureSubscriptionTables();
  const row = getDb()
    .prepare("SELECT * FROM subscriptions WHERE subject_type = ? AND subject_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(subjectType, subjectId) as any;
  return row ? rowToSubscription(row) : undefined;
}

export function listSubscriptions(filter: { subjectType?: SubscriptionSubject; status?: SubscriptionStatus } = {}): Subscription[] {
  ensureSubscriptionTables();
  const where: string[] = [];
  const params: any[] = [];
  if (filter.subjectType) {
    where.push("subject_type = ?");
    params.push(filter.subjectType);
  }
  if (filter.status) {
    where.push("status = ?");
    params.push(filter.status);
  }
  const sql = `SELECT * FROM subscriptions ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  return (getDb().prepare(sql).all(...params) as any[]).map(rowToSubscription);
}

/** Marca o pagamento do mês: avança o vencimento e reativa. */
export function markSubscriptionPaid(id: string, paidAt?: string): Subscription | undefined {
  ensureSubscriptionTables();
  const atual = getSubscription(id);
  if (!atual) return undefined;
  const referencia = paidAt || atual.nextDueAt || new Date().toISOString();
  const proximo = addMonths(referencia, 1);
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE subscriptions SET status = 'active', next_due_at = ?, updated_at = ? WHERE id = ?")
    .run(proximo, now, id);
  return getSubscription(id);
}

/** Corrige o valor mensal (reajuste, desconto combinado) sem perder o histórico. */
export function setSubscriptionAmount(id: string, amount: number): Subscription | undefined {
  ensureSubscriptionTables();
  getDb()
    .prepare("UPDATE subscriptions SET amount = ?, updated_at = ? WHERE id = ?")
    .run(Math.max(0, Math.round(Number(amount) || 0)), new Date().toISOString(), id);
  return getSubscription(id);
}

export function updateSubscriptionStatus(id: string, status: SubscriptionStatus): Subscription | undefined {
  ensureSubscriptionTables();
  const now = new Date().toISOString();
  if (status === "canceled") {
    getDb()
      .prepare("UPDATE subscriptions SET status = ?, canceled_at = ?, next_due_at = NULL, updated_at = ? WHERE id = ?")
      .run(status, now, now, id);
  } else {
    getDb().prepare("UPDATE subscriptions SET status = ?, canceled_at = NULL, updated_at = ? WHERE id = ?").run(status, now, id);
  }
  return getSubscription(id);
}

export interface MrrSummary {
  /** Assinaturas ativas/em atraso (o que deveria entrar todo mês). */
  activeCount: number;
  mrr: number;
  /** Em atraso (vencimento passado e não pago). */
  overdueCount: number;
  overdueAmount: number;
  /** Vencem nos próximos 7 dias. */
  dueSoonCount: number;
  trialCount: number;
  canceledCount: number;
  overdue: { id: string; subjectId: string; plan: string; amount: number; nextDueAt: string | null }[];
}

/** Resumo financeiro da recorrência. Tudo comparado em data UTC. */
export function mrrSummary(now: Date = new Date()): MrrSummary {
  ensureSubscriptionTables();
  const todas = listSubscriptions();
  const agora = now.getTime();
  const seteDias = agora + 7 * 24 * 60 * 60 * 1000;

  const cobraveis = todas.filter((s) => s.status === "active" || s.status === "past_due");
  const atrasadas = cobraveis.filter((s) => {
    if (!s.nextDueAt) return false;
    const venc = new Date(s.nextDueAt).getTime();
    return Number.isFinite(venc) && venc < agora;
  });

  return {
    activeCount: cobraveis.length,
    mrr: cobraveis.reduce((soma, s) => soma + s.amount, 0),
    overdueCount: atrasadas.length,
    overdueAmount: atrasadas.reduce((soma, s) => soma + s.amount, 0),
    dueSoonCount: cobraveis.filter((s) => {
      if (!s.nextDueAt) return false;
      const venc = new Date(s.nextDueAt).getTime();
      return Number.isFinite(venc) && venc >= agora && venc <= seteDias;
    }).length,
    trialCount: todas.filter((s) => s.status === "trial").length,
    canceledCount: todas.filter((s) => s.status === "canceled").length,
    overdue: atrasadas
      .sort((a, b) => String(a.nextDueAt).localeCompare(String(b.nextDueAt)))
      .map((s) => ({ id: s.id, subjectId: s.subjectId, plan: s.plan, amount: s.amount, nextDueAt: s.nextDueAt })),
  };
}
