import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../server/store/schema";
import {
  addSerpApiKey,
  getSerpApiUsage,
  listSerpApiKeys,
  selectKeyForSearch,
} from "../server/services/serpApi";

/**
 * Cota com VÁRIAS chaves: cada chave tem a própria cota mensal, então o total é
 * a soma e o orçamento do dia é o direito diário de cada uma somado. A escolha
 * da chave passa a ser por direito diário (fairness), não "a ativa até estourar".
 */

const originalQuota = process.env.SERPAPI_SEARCHES_PER_MONTH;
const originalThroughput = process.env.SERPAPI_THROUGHPUT_PER_HOUR;

function clearKeys() {
  getDb().prepare("DELETE FROM serpapi_keys").run();
}

/** Cria chave com renovação a N dias (controla o "dias restantes"). */
function seedKey(id: string, label: string, renewalInDays: number) {
  const apiKey = `key_${id}_0123456789abcdef`;
  const renewal = new Date(Date.now() + renewalInDays * 86400000);
  const info = addSerpApiKey(apiKey, label, undefined, renewal.toISOString().slice(0, 10));
  return info;
}

describe("SerpAPI com múltiplas chaves", () => {
  beforeEach(() => {
    process.env.SERPAPI_SEARCHES_PER_MONTH = "250";
    process.env.SERPAPI_THROUGHPUT_PER_HOUR = "50";
    clearKeys();
  });

  afterEach(() => {
    clearKeys();
    if (originalQuota === undefined) delete process.env.SERPAPI_SEARCHES_PER_MONTH;
    else process.env.SERPAPI_SEARCHES_PER_MONTH = originalQuota;
    if (originalThroughput === undefined) delete process.env.SERPAPI_THROUGHPUT_PER_HOUR;
    else process.env.SERPAPI_THROUGHPUT_PER_HOUR = originalThroughput;
  });

  it("soma a cota de todas as chaves cadastradas", () => {
    seedKey("a", "Chave A", 9); // ~10 dias (arredonda pra cima)
    seedKey("b", "Chave B", 9);

    const usage = getSerpApiUsage();
    expect(usage.keys).toBe(2);
    expect(usage.searchesPerMonth).toBe(500);
    expect(usage.remainingThisMonth).toBe(500);
    expect(usage.dailyBudget).toBeGreaterThanOrEqual(50); // 25 + 25
  });

  it("cada chave tem o próprio direito diário", () => {
    seedKey("a", "Chave A", 9);
    seedKey("b", "Chave B", 9);
    const keys = listSerpApiKeys();
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      // fórmula: restante no ciclo ÷ dias que faltam (arredonda para baixo)
      expect(key.dailyBudget).toBe(Math.floor(250 / key.daysLeftInCycle));
      expect(key.dailyBudget).toBeGreaterThan(0);
      expect(key.dailyRemaining).toBe(key.dailyBudget);
      expect(key.usedToday).toBe(0);
    }
  });

  it("escolhe a chave que ainda não gastou o direito do dia (fairness)", () => {
    seedKey("a", "Chave A", 9);
    seedKey("b", "Chave B", 9);

    const first = selectKeyForSearch();
    expect(first).toBeTruthy();

    // simula 25 buscas na chave escolhida (estourando o direito diário dela)
    getDb().prepare("UPDATE serpapi_keys SET used_today = 25, used_this_month = 25 WHERE id = ?").run(first!.id);

    const second = selectKeyForSearch();
    expect(second).toBeTruthy();
    expect(second!.id).not.toBe(first!.id); // foi para a outra chave
  });

  it("pula chave com a cota mensal esgotada", () => {
    const a = seedKey("a", "Chave A", 9);
    seedKey("b", "Chave B", 9);
    getDb().prepare("UPDATE serpapi_keys SET used_this_month = 250 WHERE id = ?").run(a.id);

    const picked = selectKeyForSearch();
    expect(picked).toBeTruthy();
    expect(picked!.id).not.toBe(a.id);
  });

  it("sem chave com cota devolve null", () => {
    const a = seedKey("a", "Chave A", 9);
    getDb().prepare("UPDATE serpapi_keys SET used_this_month = 250 WHERE id = ?").run(a.id);
    expect(selectKeyForSearch()).toBeNull();
  });

  it("zera o contador diário quando muda o dia", () => {
    const a = seedKey("a", "Chave A", 9);
    getDb()
      .prepare("UPDATE serpapi_keys SET used_today = 20, day_key = ? WHERE id = ?")
      .run("2000-01-01", a.id);

    const picked = selectKeyForSearch();
    expect(picked).toBeTruthy();
    const refreshed = listSerpApiKeys().find((k) => k.id === a.id)!;
    expect(refreshed.usedToday).toBe(0); // resetou ao detectar outro dia
    expect(getSerpApiUsage().usedToday).toBe(0);
  });

  it("uso de hoje soma todas as chaves", () => {
    const a = seedKey("a", "Chave A", 9);
    seedKey("b", "Chave B", 9);
    const today = new Date();
    const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    getDb().prepare("UPDATE serpapi_keys SET used_today = 3, day_key = ? WHERE id = ?").run(dayKey, a.id);
    expect(getSerpApiUsage().usedToday).toBe(3);
  });
});
