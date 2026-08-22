import { describe, expect, it } from "vitest";
import { buildScheduleJobInput } from "../server/scheduler/scheduler";
import { importIbgeCities, pickNextCities, markCitySearched, getCityByCode } from "../server/store/db";
import { Schedule } from "../server/store/types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 6 cidades GO dentro da faixa 30k–200k para simular a fila
const csv = [
  "codigo_ibge,nome,uf,latitude,longitude,populacao,pib_per_capita",
  "5208707,Catalão,GO,-18.16,-47.95,110000,45000",
  "5222207,São Luís de Montes Belos,GO,-16.52,-50.37,35000,26000",
  "5212500,Rio Verde,GO,-17.79,-50.92,190000,70000",
  "5201808,Bela Vista de Goiás,GO,-16.96,-48.96,35000,20000",
  "5218702,Santo Antônio do Descoberto,GO,-16.36,-48.26,65000,28000",
  "5220452,Uruaçu,GO,-14.52,-49.14,40000,30000",
].join("\n");

function makeSchedule(payload: any): Schedule {
  return {
    id: "sch_test_rotation",
    name: "Teste rotação GO",
    cron: "0 8 * * 1",
    jobType: "batch_prospecting",
    payload,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("E2E: agendamento → payload → rotação round-robin", () => {
  it("payload do agendador habilita useCityRotation e propaga filtros", () => {
    const job = buildScheduleJobInput(
      makeSchedule({
        useCityRotation: true,
        citiesPerRun: 3,
        uf: "GO",
        minPopulation: 30000,
        maxPopulation: 200000,
        minPropensity: 60,
        categories: ["Dentista", "Mercado & Açougue"],
        filterNoWebsiteOnly: true,
      }),
      5
    );
    expect(job.type).toBe("batch_prospecting");
    expect(job.payload.useCityRotation).toBe(true);
    expect(job.payload.citiesPerRun).toBe(3);
    expect(job.payload.uf).toBe("GO");
    expect(job.payload.minPopulation).toBe(30000);
    expect(job.payload.maxPopulation).toBe(200000);
    expect(job.payload.minPropensity).toBe(60);
    // lista fixa esvaziada em favor da rotação
    expect(job.payload.locations).toEqual([]);
  });

  it("agendamento sem rotação mantém comportamento legado", () => {
    const job = buildScheduleJobInput(
      makeSchedule({ locations: ["Campinas"], state: "SP", categories: ["Estética & Saúde"] })
    );
    expect(job.payload.useCityRotation).toBe(false);
    expect(job.payload.locations).toEqual(["Campinas"]);
  });

  it("três disparos consecutivos rotacionam sem repetir cidades", async () => {
    importIbgeCities(writeCsv());
    const job = buildScheduleJobInput(makeSchedule({ useCityRotation: true, citiesPerRun: 3, uf: "GO", minPopulation: 30000, maxPopulation: 200000 }));

    // simula o worker: resolve effectiveLocations como handleBatchProspecting faz
    const run = (): string[] => {
      const cities = pickNextCities(job.payload.citiesPerRun, {
        uf: job.payload.uf,
        minPopulation: job.payload.minPopulation,
        maxPopulation: job.payload.maxPopulation,
      });
      const names = cities.map((c) => c.name);
      for (const c of cities) markCitySearched(c.ibgeCode);
      return names;
    };

    const run1 = run();
    const run2 = run();
    const run3 = run();

    // pool de 6 cidades, 3 por rodada: run1 e run2 cobrem as 6 sem repetição,
    // run3 cicla de volta ao início da fila (round-robin circular)
    expect(run1.length + run2.length + run3.length).toBe(9);
    const all = [...run1, ...run2];
    expect(new Set(all).size).toBe(6); // zero repetição até esgotar o pool

    // terceira rodada reinicia a fila pela cidade mais antiga (mesma do run1)
    expect(run3).toEqual(run1);
    expect(getCityByCode(codesBy(run1[0]))!.searchCount).toBe(2);
  });
});

function writeCsv(): string {
  const p = path.join(os.tmpdir(), `cities-e2e-${Date.now()}.csv`);
  fs.writeFileSync(p, csv, "utf-8");
  return p;
}

function codesBy(name: string): string {
  const map: Record<string, string> = {
    Catalão: "5208707",
    "São Luís de Montes Belos": "5222207",
    "Rio Verde": "5212500",
    "Bela Vista de Goiás": "5201808",
    Goiânia: "5205409",
    "Aparecida de Goiânia": "5201402",
  };
  return map[name];
}
