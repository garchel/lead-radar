import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { app } from "../server";
import { getDb } from "../server/store/schema";
import { upsertLead } from "../server/store/db";

/**
 * Banco de dados: números agregados e lista filtrável.
 * Os filtros são SQL — o teste cobre o contrato (o que a UI consome), não o layout.
 */

let server: any;
let baseUrl = "";

let phoneSeq = 0;

const seed = (overrides: Record<string, any>) => {
  const id = `db-${overrides.name.replace(/\s+/g, "-").toLowerCase()}`;
  // telefone único por seed: upsertLead deduplica por telefone normalizado
  phoneSeq += 1;
  const uniquePhone = `+55 62 9${String(10000000 + phoneSeq).slice(0, 8)}`;
  upsertLead({
    id,
    name: overrides.name,
    category: overrides.category ?? "Barbearia",
    address: "Rua Teste, 10",
    city: overrides.city ?? "Anápolis",
    state: "GO",
    phone: overrides.phone === undefined ? uniquePhone : overrides.phone,
    websiteStatus: overrides.websiteStatus ?? "none",
    opportunityScore: overrides.opportunityScore ?? 80,
    pipelineStatus: overrides.pipelineStatus ?? "prospect",
    contactAttempts: overrides.contactAttempts ?? 0,
    doNotContact: overrides.doNotContact ?? false,
    lastContactAt: overrides.lastContactAt ?? undefined,
    savedAt: overrides.savedAt ?? new Date().toISOString(),
  } as any);
  return id;
};

describe("GET /api/database/*", () => {
  beforeEach(async () => {
    getDb().prepare("DELETE FROM leads WHERE id LIKE 'db-%'").run();
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    seed({ name: "Alpha Barbearia", opportunityScore: 92, websiteStatus: "none" });
    seed({ name: "Beta Barbearia", opportunityScore: 74, websiteStatus: "social_only" });
    seed({ name: "Gama Pet Shop", category: "Pet Shop", city: "Goiânia", opportunityScore: 58, websiteStatus: "has_website" });
    seed({ name: "Delta Sem Fone", phone: null, opportunityScore: 88 });
    seed({ name: "Epsilon Contatado", opportunityScore: 95, pipelineStatus: "contacted", lastContactAt: new Date().toISOString(), contactAttempts: 1 });
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("agrega totais, presença, faixas e prontos para D0", async () => {
    const r = await fetch(`${baseUrl}/api/database/stats`);
    const d = await r.json();
    expect(d.success).toBe(true);

    const t = d.totals;
    expect(t.total).toBeGreaterThanOrEqual(5);
    expect(t.semSite).toBeGreaterThanOrEqual(3);
    expect(t.comSite).toBeGreaterThanOrEqual(1);
    expect(t.hoje).toBeGreaterThanOrEqual(5);
    expect(t.comFone).toBeGreaterThanOrEqual(3);
    expect(t.semFone).toBeGreaterThanOrEqual(1);
    // Alpha e Beta: prospect, com telefone, score>=60, sem site próprio
    expect(t.prontosParaD0).toBeGreaterThanOrEqual(2);

    const pipelineKeys = d.pipeline.map((b: any) => b.key);
    expect(pipelineKeys).toContain("prospect");
    expect(pipelineKeys).toContain("contacted");

    const bands = d.scoreBands.map((b: any) => b.label);
    expect(bands).toContain("90-100");

    const cities = d.topCities.map((c: any) => c.city);
    expect(cities).toContain("Anápolis");
  });

  it("filtra por presença digital, score e telefone", async () => {
    const semSite = await (await fetch(`${baseUrl}/api/database/leads?website=none&limit=200`)).json();
    expect(semSite.leads.every((l: any) => l.websiteStatus === "none")).toBe(true);

    const altoScore = await (await fetch(`${baseUrl}/api/database/leads?scoreMin=90&limit=200`)).json();
    expect(altoScore.leads.every((l: any) => l.opportunityScore >= 90)).toBe(true);
    const nomes = altoScore.leads.map((l: any) => l.name);
    expect(nomes).toContain("Alpha Barbearia");
    expect(nomes).not.toContain("Beta Barbearia");

    const comFone = await (await fetch(`${baseUrl}/api/database/leads?hasPhone=1&limit=200`)).json();
    expect(comFone.leads.every((l: any) => Boolean(l.phone))).toBe(true);

    const semFone = await (await fetch(`${baseUrl}/api/database/leads?hasPhone=0&limit=200`)).json();
    const semFoneNomes = semFone.leads.map((l: any) => l.name);
    expect(semFoneNomes).toContain("Delta Sem Fone");
  });

  it("filtra prontos para D0 (mesma regra do autopilot)", async () => {
    const d = await (await fetch(`${baseUrl}/api/database/leads?readyForD0=1&limit=200`)).json();
    const nomes = d.leads.map((l: any) => l.name);
    expect(nomes).toContain("Alpha Barbearia");
    expect(nomes).not.toContain("Epsilon Contatado"); // já contatado
    expect(nomes).not.toContain("Delta Sem Fone"); // sem telefone
    expect(nomes).not.toContain("Gama Pet Shop"); // tem site
  });

  it("busca por texto e ordena por score", async () => {
    const d = await (await fetch(`${baseUrl}/api/database/leads?q=pet&limit=200`)).json();
    expect(d.leads.some((l: any) => l.name === "Gama Pet Shop")).toBe(true);

    const ordenado = await (await fetch(`${baseUrl}/api/database/leads?sort=score&limit=200`)).json();
    const scores = ordenado.leads.map((l: any) => l.opportunityScore);
    const decrescente = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(decrescente);
  });

  it("pagina e informa o total", async () => {
    const d = await (await fetch(`${baseUrl}/api/database/leads?limit=2&page=1`)).json();
    expect(d.leads).toHaveLength(2);
    expect(d.total).toBeGreaterThanOrEqual(5);
    expect(d.pages).toBeGreaterThanOrEqual(3);

    const p2 = await (await fetch(`${baseUrl}/api/database/leads?limit=2&page=2`)).json();
    expect(p2.page).toBe(2);
    expect(p2.leads[0].id).not.toBe(d.leads[0].id);
  });

  it("lista cidades e categorias para os selects", async () => {
    const d = await (await fetch(`${baseUrl}/api/database/filters`)).json();
    expect(d.success).toBe(true);
    expect(d.cities.some((c: any) => c.city === "Goiânia")).toBe(true);
    expect(d.categories).toContain("Pet Shop");
  });
});
