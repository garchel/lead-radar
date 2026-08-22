import { describe, expect, it } from "vitest";
import {
  getCities,
  getCityByCode,
  pickNextCities,
  markCitySearched,
  updateCity,
  importIbgeCities,
} from "../server/store/db";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// CSV mínimo de teste (mesmo formato do cities_ibge.csv)
const csv = [
  "codigo_ibge,nome,uf,latitude,longitude,populacao",
  "5300108,Brasília,DF,-15.79,-47.88,2817381",
  "5205409,Goiânia,GO,-16.68,-49.25,1437366",
  "3106200,Belo Horizonte,MG,-19.92,-43.94,2315560",
  "3552205,Sorocaba,SP,-23.50,-47.45,723689",
  "3548500,Ribeirão Preto,SP,-21.17,-47.81,720116",
  "3509502,Campinas,SP,-22.91,-47.06,1143211",
  "2913606,Feira de Santana,BA,-12.27,-38.97,619609",
  "2408102,Mossoró,RN,-5.19,-37.34,300618",
  "1100205,Porto Velho,RO,-8.76,-63.90,548952",
].join("\n");

function writeTestCsv(): string {
  const p = path.join(os.tmpdir(), `cities-test-${Date.now()}.csv`);
  fs.writeFileSync(p, csv, "utf-8");
  return p;
}

describe("fila de cidades IBGE (round-robin)", () => {
  it("importa o CSV e respeita INSERT OR IGNORE (idempotente)", () => {
    const total = importIbgeCities(writeTestCsv());
    expect(total).toBe(9);
    // reimport não duplica
    importIbgeCities(writeTestCsv());
    expect(getCities().length).toBe(9);
  });

  it("busca cidade por código IBGE", () => {
    const city = getCityByCode("5300108");
    expect(city?.name).toBe("Brasília");
    expect(city?.uf).toBe("DF");
    expect(city?.population).toBe(2817381);
    expect(city?.enabled).toBe(true);
    expect(city?.lastSearchedAt).toBeNull();
  });

  it("filtra por UF e faixa populacional", () => {
    const sp = getCities({ uf: "sp" }); // case-insensitive
    expect(sp.every((c) => c.uf === "SP")).toBe(true);
    expect(sp.length).toBe(3);

    const midSize = getCities({ minPopulation: 600000, maxPopulation: 800000 });
    const names = midSize.map((c) => c.name).sort();
    expect(names).toEqual(["Feira de Santana", "Ribeirão Preto", "Sorocaba"]);
  });

  it("pickNextCities retorna nunca-buscadas primeiro (maior população antes)", () => {
    const next = pickNextCities(3, { uf: "SP" });
    // todas nunca buscadas → desempate por população DESC
    expect(next.map((c) => c.name)).toEqual(["Campinas", "Sorocaba", "Ribeirão Preto"]);
  });

  it("round-robin: após marcar busca, a próxima rotação pega outra cidade", () => {
    const first = pickNextCities(1, { uf: "SP" });
    expect(first[0].name).toBe("Campinas");
    markCitySearched(first[0].ibgeCode);

    const second = pickNextCities(1, { uf: "SP" });
    expect(second[0].name).not.toBe("Campinas");

    // marca todas as SP; ao buscar de novo, Campinas volta a ser a mais antiga
    for (const c of pickNextCities(10, { uf: "SP" })) {
      if (c.lastSearchedAt === null) markCitySearched(c.ibgeCode);
    }
    // marca as restantes
    let guard = 0;
    while (guard++ < 10) {
      const nextBatch = pickNextCities(1, { uf: "SP" });
      if (nextBatch.length === 0) break;
      if (nextBatch[0].lastSearchedAt !== null) break;
      markCitySearched(nextBatch[0].ibgeCode);
    }
    const rotated = pickNextCities(1, { uf: "SP" });
    expect(rotated[0].lastSearchedAt).not.toBeNull();
    // a mais antiga é Campinas (marcada primeiro)
    expect(rotated[0].name).toBe("Campinas");
    expect(rotated[0].searchCount).toBeGreaterThan(0);
  });

  it("updateCity desabilita e pickNextCities ignora desabilitadas", () => {
    updateCity("2408102", { enabled: false });
    const rn = pickNextCities(10, { uf: "RN" });
    expect(rn.length).toBe(0);
    // reabilita
    updateCity("2408102", { enabled: true, status: "pending" });
    expect(pickNextCities(10, { uf: "RN" }).length).toBe(1);
  });

  it("markCitySearched atualiza lastSearchedAt, count e status", () => {
    markCitySearched("1100205");
    const c = getCityByCode("1100205")!;
    expect(c.searchCount).toBe(1);
    expect(c.lastSearchedAt).not.toBeNull();
    expect(c.status).toBe("done");
    markCitySearched("1100205");
    expect(getCityByCode("1100205")!.searchCount).toBe(2);
  });
});
