import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { app } from "../server";
import { getDb } from "../server/store/schema";
import { getDailyOverview, localDayBounds } from "../server/services/overviewService";

/**
 * "Hoje" na Visão geral: só entra o que aconteceu desde a meia-noite LOCAL.
 * O risco real é contar ontem junto (fronteira de fuso), então o teste cobre
 * as bordas: 1 minuto antes da meia-noite, 1 minuto depois, e o fim do dia.
 */

let server: any;
let baseUrl = "";

const insertLead = (id: string, createdAt: string, extra: Record<string, string> = {}) => {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO leads (id, name, phone, website_status, pipeline_status, saved_at, updated_at)
     VALUES (?, ?, ?, ?, 'prospect', ?, ?)`
  ).run(id, `Lead ${id}`, extra.phone ?? "5561999990000", extra.website_status ?? "none", createdAt, createdAt);
};

describe("resumo do dia (Visão geral)", () => {
  beforeEach(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    const db = getDb();
    db.prepare("DELETE FROM leads WHERE id LIKE 'ovw-%'").run();
    await new Promise((resolve) => server.close(resolve));
  });

  it("limites do dia local batem com a meia-noite do servidor", () => {
    const now = new Date(2026, 10, 10, 15, 30, 0); // 10/11/2026 15:30 local
    const { startIso, endIso } = localDayBounds(now);
    const start = new Date(startIso);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(10);
    expect(new Date(endIso).getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("conta só leads criados dentro do dia", () => {
    const now = new Date();
    const { startIso, endIso } = localDayBounds(now);
    const umMinutoAntes = new Date(new Date(startIso).getTime() - 60_000).toISOString();
    const umMinutoDepois = new Date(new Date(startIso).getTime() + 60_000).toISOString();
    const antesDoFim = new Date(new Date(endIso).getTime() - 60_000).toISOString();

    insertLead("ovw-ontem", umMinutoAntes, { phone: "5561999990001" });
    insertLead("ovw-agora", umMinutoDepois, { phone: "5561999990002" });
    insertLead("ovw-fim", antesDoFim, { phone: "5561999990003" });

    const overview = getDailyOverview(now);
    expect(overview.leads.created).toBe(2);
    expect(overview.leads.withPhone).toBe(2);
    expect(overview.leads.readyForD0).toBe(2);
  });

  it("lead sem telefone não entra como pronto para D0", () => {
    const now = new Date();
    const meioDia = new Date(new Date(localDayBounds(now).startIso).getTime() + 12 * 60 * 60 * 1000).toISOString();
    insertLead("ovw-semfone", meioDia, { phone: "" });
    insertLead("ovw-comsite", meioDia, { phone: "5561999990004", website_status: "own" });

    const overview = getDailyOverview(now);
    expect(overview.leads.created).toBe(2);
    expect(overview.leads.readyForD0).toBe(0);
  });

  it("expõe o resumo pela rota HTTP", async () => {
    const res = await fetch(`${baseUrl}/api/overview/daily`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.daily).toBeTruthy();
    expect(typeof data.daily.dayLabel).toBe("string");
    expect(data.daily.leads).toBeTruthy();
    expect(data.daily.delivery).toBeTruthy();
    expect(data.daily.projects).toBeTruthy();
  });
});
