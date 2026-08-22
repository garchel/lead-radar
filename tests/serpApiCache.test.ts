import { describe, expect, it } from "vitest";
import { getCachedSearch, hashSearchQuery, setCachedSearch } from "../server/services/serpApi";
import { getDb } from "../server/store/schema";

const input = {
  location: "Brasília",
  state: "DF",
  category: "Dentista",
  filterNoWebsiteOnly: true,
  provider: "serpapi",
};

const businesses = [
  { id: "serp-x", name: "Clínica Sorriso", category: "Dentista", address: "Asa Sul", city: "Brasília", state: "DF", websiteStatus: "none" },
];

describe("serpapi search cache (7 dias)", () => {
  it("hash é determinístico e sensível aos componentes da query", () => {
    const a = hashSearchQuery(input);
    const b = hashSearchQuery({ ...input });
    expect(a).toBe(b);
    expect(hashSearchQuery({ ...input, location: "Goiânia" })).not.toBe(a);
    expect(hashSearchQuery({ ...input, filterNoWebsiteOnly: false })).not.toBe(a);
    expect(hashSearchQuery({ ...input, query: "implante" })).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("round-trip: grava, lê e devolve businesses/raw/meta", () => {
    const hash = hashSearchQuery(input);
    setCachedSearch(hash, input, businesses, { local_results: [] }, { query: "Dentista em Brasília" });

    const cached = getCachedSearch(hash);
    expect(cached).not.toBeNull();
    expect(cached!.businesses).toHaveLength(1);
    expect(cached!.businesses[0].name).toBe("Clínica Sorriso");
    expect(cached!.raw).toEqual({ local_results: [] });
    expect(cached!.meta!.query).toBe("Dentista em Brasília");
  });

  it("INSERT OR REPLACE atualiza o cache da mesma query", () => {
    const hash = hashSearchQuery({ ...input, category: "Advogado" });
    setCachedSearch(hash, { ...input, category: "Advogado" }, [{ ...businesses[0], name: "A" }], null, null);
    setCachedSearch(hash, { ...input, category: "Advogado" }, [{ ...businesses[0], name: "B" }], null, null);

    const cached = getCachedSearch(hash);
    expect(cached!.businesses).toHaveLength(1);
    expect(cached!.businesses[0].name).toBe("B");
  });

  it("expirado retorna null e remove a linha (TTL vencido)", () => {
    const db = getDb();
    const hash = hashSearchQuery({ ...input, category: "Eletricista" });
    setCachedSearch(hash, { ...input, category: "Eletricista" }, businesses, null, null);

    // força expiração no passado
    db.prepare("UPDATE serpapi_search_cache SET expires_at = ? WHERE query_hash = ?")
      .run(new Date(Date.now() - 1000).toISOString(), hash);

    expect(getCachedSearch(hash)).toBeNull();
    const row = db.prepare("SELECT * FROM serpapi_search_cache WHERE query_hash = ?").get(hash);
    expect(row).toBeUndefined();
  });

  it("hash ausente retorna null sem lançar erro", () => {
    expect(getCachedSearch("nao-existe")).toBeNull();
  });
});
