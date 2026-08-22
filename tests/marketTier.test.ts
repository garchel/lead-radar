import { describe, expect, it } from "vitest";
import {
  getCities,
  getCityByCode,
  importIbgeCities,
  recomputeMarketTiers,
  tierFromPibPerCapita,
  estimateTicket,
  getBusinessCategories,
  upsertBusinessCategory,
} from "../server/store/db";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const csv = [
  "codigo_ibge,nome,uf,latitude,longitude,populacao,pib_per_capita",
  "5300108,Brasília,DF,-15.79,-47.88,2817381,101848",   // A
  "3550308,São Paulo,SP,-23.55,-46.63,11451965,72387",   // B
  "3106200,Belo Horizonte,MG,-19.92,-43.94,2315560,45743", // B (limite)
  "2408102,Mossoró,RN,-5.19,-37.34,300618,32192",         // C
  "2206721,Teresina,PI,-5.09,-42.80,866300,21000",        // D
].join("\n");

function writeTestCsv(): string {
  const p = path.join(os.tmpdir(), `cities-tier-test-${Date.now()}.csv`);
  fs.writeFileSync(p, csv, "utf-8");
  return p;
}

describe("tier de mercado por PIB per capita", () => {
  it("classifica corretamente A/B/C/D pelos limiares", () => {
    expect(tierFromPibPerCapita(100000)).toBe("A");
    expect(tierFromPibPerCapita(80000)).toBe("A");   // limite inclusivo
    expect(tierFromPibPerCapita(60000)).toBe("B");
    expect(tierFromPibPerCapita(45000)).toBe("B");   // limite inclusivo
    expect(tierFromPibPerCapita(30000)).toBe("C");
    expect(tierFromPibPerCapita(25000)).toBe("C");   // limite inclusivo
    expect(tierFromPibPerCapita(20000)).toBe("D");
    expect(tierFromPibPerCapita(0)).toBe("D");
  });

  it("multiplicadores de ticket: D 0.8 / C 1.0 / B 1.3 / A 1.6", () => {
    expect(estimateTicket(2000, "D")).toBe(1600);
    expect(estimateTicket(2000, "C")).toBe(2000);
    expect(estimateTicket(2800, "B")).toBe(3650);   // 3640 → arredonda a R$50
    expect(estimateTicket(2800, "A")).toBe(4500);   // 4480 → arredonda a R$50
  });

  it("recomputeMarketTiers atualiza o tier das cidades importadas", async () => {
    const total = await Promise.resolve(importIbgeCities(writeTestCsv()));
    expect(total).toBeGreaterThanOrEqual(5);
    const tiers = recomputeMarketTiers();
    expect(tiers.A).toBeGreaterThanOrEqual(1);
    expect(tiers.D).toBeGreaterThanOrEqual(1);

    const bsb = getCityByCode("5300108")!;
    expect(bsb.marketTier).toBe("A");
    expect(bsb.pibPerCapita).toBe(101848);
    const ter = getCityByCode("2206721")!;
    expect(ter.marketTier).toBe("D");
  });
});

describe("categorias de negócio configuráveis", () => {
  it("seed idempotente cria categorias padrão com propensão e ticket", () => {
    const first = getBusinessCategories();
    const second = getBusinessCategories();
    expect(first.length).toBe(second.length);
    expect(first.length).toBeGreaterThanOrEqual(19);

    const odonto = first.find((c) => c.name === "Clínica Odontológica");
    expect(odonto?.propensity).toBe(95);
    expect(odonto?.baseTicket).toBe(2800);

    // ordenada por propensão desc
    const props = first.map((c) => c.propensity);
    const sorted = [...props].sort((a, b) => b - a);
    expect(props).toEqual(sorted);
  });

  it("upsertBusinessCategory cria nova e atualiza existente por nome", () => {
    upsertBusinessCategory({ name: "Studio de Tatuagem", propensity: 70, baseTicket: 1800 });
    let all = getBusinessCategories();
    const created = all.find((c) => c.name === "Studio de Tatuagem");
    expect(created?.propensity).toBe(70);

    upsertBusinessCategory({ name: "Studio de Tatuagem", propensity: 75, baseTicket: 1900 });
    all = getBusinessCategories();
    const updated = all.filter((c) => c.name === "Studio de Tatuagem");
    expect(updated.length).toBe(1);
    expect(updated[0].propensity).toBe(75);
    expect(updated[0].baseTicket).toBe(1900);
  });

  it("propensity é clampada em 0–100 no upsert", () => {
    const cat = upsertBusinessCategory({ name: "Categoria Clamp", propensity: 250, baseTicket: 1000 });
    expect(cat.propensity).toBe(100);
  });

  it("ticket sugerido combina categoria × cidade (via estimateTicket)", () => {
    const bsb = getCityByCode("5300108")!; // tier A
    const odonto = getBusinessCategories().find((c) => c.name === "Clínica Odontológica")!;
    expect(estimateTicket(odonto.baseTicket, bsb.marketTier)).toBeGreaterThan(odonto.baseTicket);
  });
});
