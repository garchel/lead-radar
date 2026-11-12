/**
 * Aviso no WhatsApp do Paulo quando o atendimento automático falha.
 *
 * A regra é simples: se a Clara (ou o compositor interno) não conseguiu responder
 * um lead, ninguém mais vai responder — e uma conversa parada é venda perdida. Em
 * vez de descobrir horas depois, o Paulo recebe uma mensagem no próprio WhatsApp
 * com quem ficou sem resposta e o motivo.
 *
 * Três cuidados que evitam transformar o aviso em spam:
 *  1. **Cooldown por conversa**: o mesmo lead não gera aviso duas vezes em 15 min.
 *  2. **Teto diário**: no máximo 20 avisos por dia (queda geral avisa uma vez, não
 *     uma vez por lead).
 *  3. **Nunca avisa a si mesmo**: se o número do aviso for a própria instância do
 *     bot, o envio é recusado (o gateway não entrega para o mesmo número).
 */
import { getDb } from "../store/schema";
import { getSetting, setSetting } from "../store/db";
import { sendGatewayText } from "./whatsappGateway";
import { eventHub } from "../events/eventHub";

export type OwnerAlertKind =
  | "ia_falhou" // o modelo não entregou texto aceitável
  | "envio_falhou" // a mensagem não saiu (gateway/erro)
  | "resposta_bloqueada" // humanização/teto/opt-out impediu
  | "bot_cliente" // bot de cliente não respondeu
  | "clara_falhou" // a própria rotina da Clara falhou
  | "teste";

export const ALERT_COOLDOWN_MINUTES = 15;
export const ALERT_DAILY_CAP = 20;

export interface OwnerAlertInput {
  kind: OwnerAlertKind;
  /** Uma linha dizendo o que aconteceu. */
  detail: string;
  leadId?: string;
  leadName?: string;
  /** Telefone do lead, para o Paulo abrir a conversa. */
  leadPhone?: string;
}

export interface OwnerAlertResult {
  sent: boolean;
  deduped?: boolean;
  detail: string;
  phone?: string;
}

let tableReady = false;

export function ensureAlertTable(): void {
  if (tableReady) return;
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS owner_alerts (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      detail TEXT NOT NULL,
      lead_id TEXT,
      lead_name TEXT,
      phone TEXT,
      status TEXT NOT NULL,
      sent_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_owner_alerts_sent ON owner_alerts(sent_at);
  `);
  tableReady = true;
}

function newId(): string {
  return `alr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Liga/desliga o aviso (padrão: ligado). */
export function ownerAlertEnabled(): boolean {
  try {
    return getSetting("owner_alert_enabled") !== "false";
  } catch {
    return true;
  }
}

/**
 * Número que recebe o aviso.
 *
 * Ordem: `owner_alert_phone` (painel) → `OWNER_ALERT_PHONE` (env). Sem número não
 * existe aviso: melhor não mandar do que mandar para o lugar errado.
 */
export function ownerAlertPhone(): string | null {
  let bruto = "";
  try {
    bruto = String(getSetting("owner_alert_phone") || "").trim();
  } catch {
    bruto = "";
  }
  if (!bruto) bruto = String(process.env.OWNER_ALERT_PHONE || "").trim();
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return digitos;
}

export function setOwnerAlertPhone(phone: string): string | null {
  const digitos = String(phone || "").replace(/\D/g, "");
  setSetting("owner_alert_phone", digitos);
  return digitos.length >= 10 ? digitos : null;
}

/** Mascara para exibir no painel sem vazar o número inteiro. */
export function maskPhone(phone?: string | null): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 8) return "";
  return `+${d.slice(0, 2)} ${d.slice(2, 4)} *****-${d.slice(-4)}`;
}

/** Texto do aviso. Curto, em blocos, sem travessão (regra do WhatsApp da casa). */
export function formatOwnerAlert(input: OwnerAlertInput): string {
  const quem = input.leadName ? `*${input.leadName}*` : "um lead";
  const motivo: Record<OwnerAlertKind, string> = {
    ia_falhou: "a IA não conseguiu escrever a resposta",
    envio_falhou: "a mensagem não saiu",
    resposta_bloqueada: "o envio foi bloqueado",
    bot_cliente: "o bot do cliente não respondeu",
    clara_falhou: "a Clara não conseguiu responder",
    teste: "este é um teste do aviso",
  };
  const linhas = [
    "⚠️ *Preciso de você*",
    "",
    `Fiquei sem responder ${quem}.`,
    `Motivo: ${motivo[input.kind] || input.detail}.`,
  ];
  if (input.detail && input.kind !== "teste") {
    const detalhe = input.detail.trim().slice(0, 220);
    if (detalhe) linhas.push(`Detalhe: ${detalhe}`);
  }
  if (input.leadPhone) linhas.push("", `WhatsApp do lead: ${input.leadPhone}`);
  linhas.push("", "A conversa está parada. Assume quando puder que eu volto a atender.");
  return linhas.join("\n");
}

/** Últimos avisos (para o painel). */
export function listOwnerAlerts(limit = 10): {
  id: string;
  kind: string;
  detail: string;
  leadId?: string;
  leadName?: string;
  status: string;
  sentAt: string;
}[] {
  ensureAlertTable();
  const rows = getDb()
    .prepare("SELECT * FROM owner_alerts ORDER BY sent_at DESC LIMIT ?")
    .all(Math.max(1, Math.min(100, limit))) as any[];
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    detail: r.detail,
    leadId: r.lead_id || undefined,
    leadName: r.lead_name || undefined,
    status: r.status,
    sentAt: r.sent_at,
  }));
}

/**
 * Já avisamos sobre este lead há pouco tempo (ou já batemos o teto do dia)?
 * Puro o suficiente para testar sem relógio mockado.
 */
export function shouldSkipAlert(
  historico: { kind: string; leadId?: string; sentAt: string; status: string }[],
  input: OwnerAlertInput,
  now: Date = new Date()
): { skip: boolean; reason?: "cooldown" | "teto_diario" } {
  const enviados = historico.filter((h) => h.status === "sent");
  const agora = now.getTime();

  if (input.leadId) {
    const recente = enviados.find(
      (h) =>
        h.leadId === input.leadId &&
        h.kind === input.kind &&
        agora - new Date(h.sentAt).getTime() < ALERT_COOLDOWN_MINUTES * 60_000
    );
    if (recente) return { skip: true, reason: "cooldown" };
  }

  const inicioDoDia = new Date(now);
  inicioDoDia.setHours(0, 0, 0, 0);
  const hoje = enviados.filter((h) => new Date(h.sentAt).getTime() >= inicioDoDia.getTime());
  if (hoje.length >= ALERT_DAILY_CAP) return { skip: true, reason: "teto_diario" };

  return { skip: false };
}

/**
 * Manda o aviso para o WhatsApp do Paulo.
 *
 * Nunca lança: o caminho de falha do atendimento não pode falhar também.
 */
export async function sendOwnerAlert(input: OwnerAlertInput): Promise<OwnerAlertResult> {
  try {
    ensureAlertTable();

    if (!ownerAlertEnabled()) return { sent: false, detail: "aviso desligado no painel" };

    const telefone = ownerAlertPhone();
    if (!telefone) return { sent: false, detail: "número de aviso não configurado" };

    const historico = listOwnerAlerts(100).map((a) => ({
      kind: a.kind,
      leadId: a.leadId,
      sentAt: a.sentAt,
      status: a.status,
    }));
    const skip = shouldSkipAlert(historico, input);
    if (skip.skip) {
      return { sent: false, deduped: true, detail: `aviso suprimido (${skip.reason})` };
    }

    const texto = formatOwnerAlert(input);
    const db = getDb();
    const agora = new Date().toISOString();

    try {
      await sendGatewayText(telefone, texto);
      db.prepare(
        `INSERT INTO owner_alerts (id, kind, detail, lead_id, lead_name, phone, status, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, 'sent', ?)`
      ).run(newId(), input.kind, input.detail.slice(0, 500), input.leadId || null, input.leadName || null, telefone, agora);
    } catch (error: any) {
      db.prepare(
        `INSERT INTO owner_alerts (id, kind, detail, lead_id, lead_name, phone, status, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`
      ).run(
        newId(),
        input.kind,
        `${input.detail.slice(0, 400)} | falha no envio: ${String(error?.message || error).slice(0, 100)}`,
        input.leadId || null,
        input.leadName || null,
        telefone,
        agora
      );
      return { sent: false, detail: `falha ao enviar o aviso: ${error?.message || error}` };
    }

    eventHub.emit("owner_alert", {
      kind: input.kind,
      leadId: input.leadId || null,
      leadName: input.leadName || null,
      detail: input.detail.slice(0, 200),
      at: agora,
    });

    console.log(`[alerta] avisado o dono (${input.kind}${input.leadName ? ` · ${input.leadName}` : ""})`);
    return { sent: true, detail: "aviso enviado ao WhatsApp do dono", phone: telefone };
  } catch (error: any) {
    console.warn(`[alerta] não foi possível avisar: ${error?.message || error}`);
    return { sent: false, detail: `aviso falhou: ${error?.message || error}` };
  }
}
