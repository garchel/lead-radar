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