import { getDb } from "../store/schema";
import { normalizeText } from "./leadIdentity";

/**
 * Higiene de dados do banco de leads.
 *
 * O SerpAPI às vezes devolve a cidade com a UF embutida ("São Paulo, SP") ou só
 * com barra no fim ("Brasília/"), e o estado vem vazio. Isso quebra a rotação de
 * cidades (comparação por nome), os agrupamentos do painel e o dedup
 * (`normalized_city`). Aqui normalizamos cidade/estado já gravados.
 */

export const DATA_HYGIENE_VERSION = "1";

export function normalizeLeadLocations(): { updated: number } {
  const db = getDb();
  const rows = db.prepare("SELECT id, city, state FROM leads").all() as any[];
  const update = db.prepare(
    "UPDATE leads SET city = @city, state = @state, normalized_city = @normalizedCity, updated_at = @now WHERE id = @id"
  );
  let updated = 0;

  for (const row of rows) {
    const originalCity = (row.city || "").trim();
    const originalState = (row.state || "").trim().toUpperCase();
    if (!originalCity) continue;

    let city = originalCity;
    let state = originalState;

    // "São Paulo, SP" | "Brasília/DF" | "Goiânia - GO"
    const match = /^(.*?)[,\s/\\-]+([A-Za-z]{2})$/.exec(city);
    if (match) {
      city = match[1].trim();
      if (!state) state = match[2].toUpperCase();
    }
    city = city.replace(/[,\s/\\-]+$/, "").trim();
    if (!city) city = originalCity;

    const changed = city !== originalCity || state !== originalState;
    if (!changed) continue;

    update.run({
      id: row.id,
      city,
      state: state || null,
      normalizedCity: normalizeText(city) || null,
      now: new Date().toISOString(),
    });
    updated += 1;
  }

  return { updated };
}
