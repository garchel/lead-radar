import { getDb } from "../store/schema";
import fs from "node:fs";
import path from "node:path";

/**
 * Backup automático do banco SQLite.
 * Copia data/leadradar.db (checkpoint WAL incluído via VACUUM INTO) para
 * data/backups/ a cada 24h, retendo os N arquivos mais recentes.
 *
 * Usa `VACUUM INTO` em vez de copiar o arquivo: produz um snapshot consistente
 * mesmo com o servidor escrevendo (WAL ativo), sem bloquear operações.
 */

const DB_PATH = path.join(process.cwd(), "data", "leadradar.db");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
const RETENTION = Number(process.env.BACKUP_RETENTION || 14);
const INTERVAL_MS = Number(process.env.BACKUP_INTERVAL_HOURS || 24) * 3600 * 1000;

export function runBackupNow(): { ok: boolean; file?: string; error?: string } {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { ok: false, error: `Banco não encontrado: ${DB_PATH}` };
    }
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const target = path.join(BACKUP_DIR, `leadradar-${stamp}.db`);

    // VACUUM INTO produz snapshot consistente mesmo com WAL ativo
    getDb().prepare(`VACUUM INTO ?`).run(target);

    pruneOldBackups();
    return { ok: true, file: target };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Falha no backup" };
  }
}

function pruneOldBackups(): void {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("leadradar-") && f.endsWith(".db"))
    .sort()
    .reverse();
  for (const old of files.slice(RETENTION)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    } catch {
      /* best-effort */
    }
  }
}

/** Agenda backups diários. Chamado uma vez no startServer(). */
export function scheduleBackups(): void {
  if (!fs.existsSync(DB_PATH)) {
    console.warn("[backup] Banco ainda não existe; backup não agendado.");
    return;
  }
  const first = runBackupNow();
  if (first.ok) {
    console.log(`[backup] Snapshot inicial: ${first.file}`);
  } else {
    console.warn(`[backup] Falha no snapshot inicial: ${first.error}`);
  }
  setInterval(() => {
    const r = runBackupNow();
    if (!r.ok) console.warn(`[backup] ${r.error}`);
  }, INTERVAL_MS);
}
