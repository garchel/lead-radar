import { Cron } from "croner";
import { getTypeformSyncConfig } from "../config";
import { syncTypeformBriefing } from "./service";

/**
 * Polling automático do briefing do Typeform.
 *
 * A cada `TYPEFORM_SYNC_INTERVAL_MIN` minutos (default 5), busca respostas novas
 * e importa direto no card do projeto. O sync é idempotente (marcador
 * `<!-- typeform:{responseId} -->`), então uma resposta nunca é importada 2x.
 *
 * `since` usa uma margem de segurança (re-scan dos últimos 10 min) porque a
 * Responses API pode levar alguns instantes para "enxergar" uma resposta recém
 * submetida — sem a margem, o watermark avançaria e a resposta seria pulada
 * para sempre. Com a margem + idempotência, nada se perde.
 */
const RETRY_MARGIN_MS = 10 * 60 * 1000;

let cron: Cron | null = null;
let lastSyncAt: string | null = null;
let lastSyncStatus: "ok" | "error" | "idle" = "idle";

async function runSync(): Promise<void> {
  try {
    const since = new Date(Date.now() - RETRY_MARGIN_MS).toISOString();
    const summary = await syncTypeformBriefing({ since, limit: 100 });
    lastSyncAt = new Date().toISOString();
    lastSyncStatus = "ok";
    console.log(
      `[Typeform] Polling: ${summary.total} resposta(s), ${summary.imported} importada(s), ` +
        `${summary.skipped} pulada(s), ${summary.unmatched} sem match.`
    );
  } catch (err: any) {
    lastSyncStatus = "error";
    console.error("[Typeform] Polling falhou:", err?.message || err);
  }
}

export function startTypeformPolling(): void {
  stopTypeformPolling();
  const { enabled, intervalMinutes } = getTypeformSyncConfig();
  if (!enabled) {
    console.log("[Typeform] Polling de briefing desativado (TYPEFORM_SYNC_INTERVAL_MIN=0).");
    return;
  }
  cron = new Cron(`*/${intervalMinutes} * * * *`, { name: "typeform-briefing-sync" }, runSync);
  console.log(`[Typeform] Polling de briefing ativo a cada ${intervalMinutes} min.`);
}

export function stopTypeformPolling(): void {
  cron?.stop();
  cron = null;
}

/** Timestamp (ISO) do fim da última execução do polling, ou null. */
export function getTypeformLastSyncAt(): string | null {
  return lastSyncAt;
}

export function getTypeformLastSyncStatus(): "ok" | "error" | "idle" {
  return lastSyncStatus;
}