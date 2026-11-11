import { beforeEach, describe, expect, it, vi } from "vitest";

// A cota vem do SerpAPI; aqui controlamos o "restante" para testar a matemática.
const usage = {
  configured: true,
  searchesPerMonth: 250,
  throughputPerHour: 50,
  usedThisMonth: 0,
  remainingThisMonth: 250,
  usedThisHour: 0,
  remainingThisHour: 50,
  monthKey: "2026-11",
  hourWindowStart: null as string | null,
  nextMonthlyReset: new Date(Date.now() + 20 * 86400000).toISOString(),
  nextHourlyReset: null as string | null,
};

vi.mock("../server/services/serpApi", () => ({
  getSerpApiUsage: () => usage,
}));

import {
  canRunSearch,
  computeDailyBudget,
  computeIntervalMinutes,
  daysLeftInCycle,
  getBudgetPlan,
  isWindowOpen,
  registerSearch,
  resetBudgetState,
  setBudgetWindow,
} from "../server/services/quotaBudgetService";

describe("orçamento da cota SerpAPI", () => {
  beforeEach(() => {
    usage.searchesPerMonth = 250;
    usage.remainingThisMonth = 250;
    usage.usedThisMonth = 0;
    usage.throughputPerHour = 50;
    usage.nextMonthlyReset = new Date(Date.now() + 20 * 86400000).toISOString();
    resetBudgetState();
    setBudgetWindow(8, 22);
  });

  it("divide a cota restante pelos dias que faltam, arredondando para baixo", () => {
    expect(computeDailyBudget(250, 30)).toBe(8);
    expect(computeDailyBudget(250, 3)).toBe(83);
    expect(computeDailyBudget(10, 30)).toBe(0);
    expect(computeDailyBudget(0, 30)).toBe(0);
  });

  it("espaça as buscas pela janela e respeita o piso de 6 min", () => {
    // 8 buscas em 14h = 840min/8 = 105min entre buscas
    expect(computeIntervalMinutes(8, 14, 50)).toBe(105);
    // orçamento grande cai no piso (nunca rajada)
    expect(computeIntervalMinutes(500, 14, 50)).toBe(6);
    // 100 buscas em 14h = 8 min entre buscas (8/hora, dentro do plano de 10/h)
    expect(computeIntervalMinutes(100, 14, 10)).toBe(8);
    // plano apertado por hora (10/h) com orçamento enorme: piso de 6 min manda
    expect(computeIntervalMinutes(1000, 14, 10)).toBe(6);
  });

  it("dias restantes no ciclo nunca é menor que 1", () => {
    expect(daysLeftInCycle(null)).toBe(1);
    expect(daysLeftInCycle(new Date(Date.now() - 86400000).toISOString())).toBe(1);
    expect(daysLeftInCycle(new Date(Date.now() + 10 * 86400000).toISOString())).toBe(10);
  });

  it("plano do dia: cota 250 em 20 dias = 12 buscas/dia, intervalo ~70min", () => {
    const plan = getBudgetPlan(new Date());
    expect(plan.dailyBudget).toBe(12);
    expect(plan.remainingToday).toBe(12);
    expect(plan.intervalMinutes).toBe(70); // 840/12
    expect(plan.monthlyQuota).toBe(250);
  });

  it("bloqueia fora da janela e libera dentro dela", () => {
    const dentro = new Date();
    dentro.setHours(10, 0, 0, 0);
    const fora = new Date();
    fora.setHours(23, 30, 0, 0);

    expect(isWindowOpen(dentro)).toBe(true);
    expect(isWindowOpen(fora)).toBe(false);
    expect(canRunSearch(dentro).allowed).toBe(true);
    const blocked = canRunSearch(fora);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/janela/i);
  });

  it("respeita o intervalo entre buscas e libera depois", () => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    const budget = getBudgetPlan(now).dailyBudget;
    registerSearch(true, now); // consumiu 1

    const plan = getBudgetPlan(now);
    expect(plan.usedToday).toBe(1);
    expect(plan.remainingToday).toBe(budget - 1);

    const blocked = canRunSearch(now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/intervalo/i);

    const later = new Date(now.getTime() + plan.intervalMinutes * 60000 + 1000);
    expect(canRunSearch(later).allowed).toBe(true);
  });

  it("busca vinda do cache não gasta o orçamento do dia", () => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    registerSearch(false, now);
    const plan = getBudgetPlan(now);
    expect(plan.usedToday).toBe(0);
    expect(plan.attemptsToday).toBe(1);
  });

  it("para de rodar quando o orçamento do dia acabou", () => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    const budgetPlan = getBudgetPlan(now);
    const budget = budgetPlan.dailyBudget;
    // As buscas são carimbadas 2h antes de `now`: assim o intervalo entre buscas
    // já passou e a única regra que pode barrar é a do orçamento do dia.
    const base = now.getTime() - 2 * 60 * 60 * 1000;
    for (let i = 0; i < budget; i += 1) {
      registerSearch(true, new Date(base + i * 1000));
    }
    const later = new Date(now.getTime());
    const blocked = canRunSearch(later);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/orçamento de hoje/i);

    const plan = getBudgetPlan(later);
    expect(plan.usedToday).toBe(budget);
    expect(plan.remainingToday).toBe(0);
  });

  it("cota mensal esgotada bloqueia mesmo com force", () => {
    usage.remainingThisMonth = 0;
    usage.usedThisMonth = 250;
    const blocked = canRunSearch(new Date(), { force: true });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/cota mensal/i);
  });
});
