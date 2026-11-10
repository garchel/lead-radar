import { afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Test isolation: each test file gets its own throwaway SQLite database
 * under a unique temp dir. This keeps tests from touching the developer's
 * real `data/leadradar.db` and avoids cross-file/worker locking.
 */
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "leadradar-test-"));

process.env.LEADRADAR_DATA_DIR = path.join(tmpRoot, "data");
process.env.LEADRADAR_DB_PATH = path.join(tmpRoot, "data", "leadradar.db");

// Isola as envs de backends externos: o `.env` do desenvolvedor NÃO deve
// vazar nos testes (ex.: META_* preenchido mudava a ordem do `auto`).
for (const key of [
  "WHATSAPP_PROVIDER",
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",
  "EVOLUTION_INSTANCE",
  "WHATSMIAU_API_URL",
  "WHATSMIAU_API_KEY",
  "WHATSMIAU_INSTANCE",
  "META_WHATSAPP_TOKEN",
  "META_PHONE_NUMBER_ID",
  "META_GRAPH_VERSION",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_APP_SECRET",
  "WHATSAPP_API_URL",
  "WHATSAPP_API_TOKEN",
  "WHATSAPP_WEBHOOK_TOKEN",
]) {
  delete process.env[key];
}

beforeAll(() => {
  fs.mkdirSync(process.env.LEADRADAR_DATA_DIR!, { recursive: true });
});

afterAll(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});