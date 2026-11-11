import { getDb } from "../store/schema";
import { getLeads, upsertLead } from "../store/db";
import { checkNumbersOnWhatsApp, isGatewayConfigured, GatewayError } from "./whatsappGateway";
import { classifyPhone } from "./leadQuality";
import type { WhatsAppStatus } from "./leadQuality";

/**
 * Validação de WhatsApp antes da abordagem.
 *
 * Por que: o Google Maps devolve telefone fixo e número morto com frequência.
 * Medido no banco antes desta feature: 42 de 156 leads eram fixo e 12 envios
 * falharam no mesmo número. Consultar a existência custa uma chamada ao gateway
 * (nada de cota SerpAPI) e evita abordagem perdida.
 */

export interface ValidationSummary {
  checked: number;
  yes: number;
  no: number;
  unknown: number;
  skipped: number;
  error?: string;
}

const CHUNK = 20;

/** Compara números ignorando o nono dígito (o WhatsApp às vezes devolve sem ele). */
function phoneKey(digits: string): string {
  const clean = String(digits || "").replace(/\D/g, "");
  if (clean.length === 13 && clean.startsWith("55") && clean[4] === "9") {
    return `55${clean.slice(2, 4)}${clean.slice(5)}`; // remove o 9
  }
  return clean;
}

interface PendingLeadRow {
  id: string;
  phone: string | null;
  whatsapp_status: string | null;
}

function selectLeadsToCheck(ids: string[] | undefined, limit: number): PendingLeadRow[] {
  const db = getDb();
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT id, phone, whatsapp_status FROM leads
          WHERE id IN (${placeholders}) AND phone IS NOT NULL AND TRIM(phone) <> ''
          LIMIT ${Math.max(1, limit)}`
      )
      .all(...ids) as PendingLeadRow[];
  }
  return db
    .prepare(
      `SELECT id, phone, whatsapp_status FROM leads
        WHERE (whatsapp_status IS NULL OR whatsapp_status = 'unknown')
          AND phone IS NOT NULL AND TRIM(phone) <> ''
        ORDER BY saved_at DESC
        LIMIT ?`
    )
    .all(Math.max(1, limit)) as PendingLeadRow[];
}

/** Conta quantos leads ainda precisam de validação (para a UI). */
export interface ValidationCounts {
  yes: number;
  no: number;
  /** Tem telefone mas ainda não foi checado. */
  pending: number;
  /** Sem telefone: nunca será possível validar (não é fila, é limitação). */
  noPhone: number;
  total: number;
}

export function getWhatsAppValidationSummary(): ValidationCounts {
  try {
    const row = getDb()
      .prepare(
        `SELECT
           SUM(CASE WHEN whatsapp_status = 'yes' THEN 1 ELSE 0 END) AS yes,
           SUM(CASE WHEN whatsapp_status = 'no' THEN 1 ELSE 0 END) AS no,
           SUM(CASE WHEN (whatsapp_status IS NULL OR whatsapp_status = 'unknown')
                     AND phone IS NOT NULL AND TRIM(phone) <> '' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN phone IS NULL OR TRIM(phone) = '' THEN 1 ELSE 0 END) AS noPhone,
           COUNT(*) AS total
         FROM leads`
      )
      .get() as any;
    return {
      yes: Number(row?.yes || 0),
      no: Number(row?.no || 0),
      pending: Number(row?.pending || 0),
      noPhone: Number(row?.noPhone || 0),
      total: Number(row?.total || 0),
    };
  } catch {
    return { yes: 0, no: 0, pending: 0, noPhone: 0, total: 0 };
  }
}

/**
 * Valida em lote e grava `whatsapp_status` no lead.
 * Limite padrão de 40 por chamada para não virar rajada contra o gateway.
 */
export async function validateLeadsWhatsApp(
  leadIds?: string[],
  opts: { limit?: number } = {}
): Promise<ValidationSummary> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 40));
  const summary: ValidationSummary = { checked: 0, yes: 0, no: 0, unknown: 0, skipped: 0 };

  if (!isGatewayConfigured()) {
    return { ...summary, error: "Gateway de WhatsApp não configurado — validação indisponível." };
  }

  const rows = selectLeadsToCheck(leadIds, limit);
  if (rows.length === 0) return summary;

  // Números não consultáveis (fixo/inválido) já saem marcados como "no".
  const consultaveis: { id: string; digits: string }[] = [];
  for (const row of rows) {
    const info = classifyPhone(row.phone);
    if (!info.isValid) {
      summary.skipped += 1;
      continue;
    }
    consultaveis.push({ id: row.id, digits: info.digits });
  }
  if (consultaveis.length === 0) return summary;

  const now = new Date().toISOString();
  const byKey = new Map<string, { id: string }[]>();
  for (const item of consultaveis) {
    const key = phoneKey(item.digits);
    const list = byKey.get(key) || [];
    list.push({ id: item.id });
    byKey.set(key, list);
  }

  for (let i = 0; i < consultaveis.length; i += CHUNK) {
    const batch = consultaveis.slice(i, i + CHUNK);
    let results;
    try {
      results = await checkNumbersOnWhatsApp(batch.map((item) => item.digits));
    } catch (err: any) {
      const message = err instanceof GatewayError ? err.message : err?.message || "falha no gateway";
      return { ...summary, error: `Validação interrompida: ${message}` };
    }

    const answered = new Map<string, boolean>();
    for (const result of results) {
      if (!result.number) continue;
      answered.set(phoneKey(result.number), result.exists);
    }

    for (const item of batch) {
      const key = phoneKey(item.digits);
      const exists = answered.get(key);
      const status: WhatsAppStatus = exists === true ? "yes" : exists === false ? "no" : "unknown";
      summary.checked += 1;
      if (status === "yes") summary.yes += 1;
      else if (status === "no") summary.no += 1;
      else summary.unknown += 1;

      try {
        getDb()
          .prepare("UPDATE leads SET whatsapp_status = ?, whatsapp_checked_at = ? WHERE id = ?")
          .run(status, now, item.id);
      } catch {
        /* lead removido no meio do caminho */
      }
    }
  }

  return summary;
}

/** Só para testes: expõe a normalização usada no casamento dos números. */
export const __phoneKeyForTests = phoneKey;
