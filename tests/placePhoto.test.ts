import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../server/store/schema";
import { applyPlacePhoto, findPlacePhoto } from "../server/services/placePhotoService";
import { upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

/**
 * A foto que o Google Maps já devolveu na busca.
 *
 * Contexto do bug: a pesquisa de marca termina sem imagem quando o negócio só tem
 * Instagram (o CDN devolve HTML, não JPG), e o hero cai no cartão de marca mesmo
 * com uma foto 1000×1000 guardada no cache da busca desde o começo.
 */
function seedCache(raw: unknown, location = "Cachoeirinha") {
  const db = getDb();
  db.prepare(
    `INSERT INTO serpapi_search_cache (query_hash, location, state, category, filter_no_website_only, query, provider, businesses_json, serpapi_raw, serpapi_meta, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `hash-${Math.random()}`,
    location,
    "RS",
    "psicologo",
    0,
    "psicologo cachoeirinha",
    "serpapi",
    "[]",
    JSON.stringify(raw),
    "{}",
    new Date().toISOString(),
    new Date(Date.now() + 864e5).toISOString()
  );
}

const LEAD: StoredLead = {
  id: "lead-foto-busca",
  name: "Rede Amor À Vida Cachoeirinha",
  phone: "+55 51 99999-0000",
  city: "Cachoeirinha",
  state: "RS",
  category: "psicologo",
  pipelineStatus: "prospect",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as StoredLead;

describe("foto do negócio vinda da busca", () => {
  beforeEach(() => {
    getDb().prepare("DELETE FROM serpapi_search_cache").run();
  });

  it("acha a foto pelo nome do negócio no resultado do Google Maps", () => {
    seedCache({
      local_results: [
        { title: "Outro Consultório", thumbnail: "https://lh3.googleusercontent.com/outro" },
        { title: "Rede Amor À Vida Cachoeirinha", thumbnail: "https://lh3.googleusercontent.com/abc123" },
      ],
    });
    expect(findPlacePhoto(LEAD)).toBe("https://lh3.googleusercontent.com/abc123");
  });

  it("casa nome com sufixo diferente (o Maps costuma acrescentar descritor)", () => {
    seedCache({
      local_results: [{ title: "Rede Amor À Vida - Psicologia e Saúde", thumbnail: "https://lh3.googleusercontent.com/x" }],
    });
    expect(findPlacePhoto(LEAD)).toBe("https://lh3.googleusercontent.com/x");
  });

  it("não devolve foto de outro negócio", () => {
    seedCache({
      local_results: [{ title: "Barbearia Navalha de Ouro", thumbnail: "https://lh3.googleusercontent.com/errada" }],
    });
    expect(findPlacePhoto(LEAD)).toBeNull();
  });

  it("cache corrompido não derruba a prévia", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO serpapi_search_cache (query_hash, location, state, category, filter_no_website_only, query, provider, businesses_json, serpapi_raw, serpapi_meta, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("h-quebrado", "Cachoeirinha", "RS", "psicologo", 0, "q", "serpapi", "[]", "{nao é json", "{}", new Date().toISOString(), new Date().toISOString());
    expect(findPlacePhoto(LEAD)).toBeNull();
  });

  it("snapshot sem imagem recebe a foto do Maps sem inventar que é interior", () => {
    seedCache({ local_results: [{ title: "Rede Amor À Vida Cachoeirinha", thumbnail: "https://lh3.googleusercontent.com/hero" }] });
    const { lead, url } = applyPlacePhoto({ ...LEAD, brandSnapshot: { imagery: [] } as any });
    expect(url).toBe("https://lh3.googleusercontent.com/hero");
    expect(lead.brandSnapshot?.imagery[0].url).toBe("https://lh3.googleusercontent.com/hero");
    // a foto do Maps costuma ser a fachada: quem decide o lugar é brandImagery,
    // nunca uma descrição forçada para caber no hero
    expect(lead.brandSnapshot?.imagery[0].description).toMatch(/Google Maps/i);
    expect(lead.brandSnapshot?.imagery[0].description).not.toMatch(/interior|consult[oó]rio/i);
    expect(Number(lead.brandSnapshot?.confidence)).toBeGreaterThan(0);
  });

  it("imagem de CDN bloqueado não conta como foto: usa a do Maps", () => {
    seedCache({ local_results: [{ title: "Rede Amor À Vida Cachoeirinha", thumbnail: "https://lh3.googleusercontent.com/hero" }] });
    const soInstagram = {
      imagery: [
        { url: "https://lookaside.fbsbx.com/lookaside/crawler/media/?media_id=1", description: "mãos dadas" },
        { url: "https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=2", description: "texto" },
      ],
    } as any;
    const { url, lead } = applyPlacePhoto({ ...LEAD, brandSnapshot: soInstagram });
    expect(url).toBe("https://lh3.googleusercontent.com/hero");
    // a foto do Maps entra PRIMEIRO: é a que o hero usa
    expect(lead.brandSnapshot?.imagery[0].url).toBe("https://lh3.googleusercontent.com/hero");
    expect(lead.brandSnapshot?.imagery).toHaveLength(3);
  });

  it("não sobrescreve imagem que já existe", () => {
    seedCache({ local_results: [{ title: "Rede Amor À Vida Cachoeirinha", thumbnail: "https://lh3.googleusercontent.com/hero" }] });
    const existente = { imagery: [{ url: "https://exemplo.com/ja-tenho.jpg" }] } as any;
    const { url, lead } = applyPlacePhoto({ ...LEAD, brandSnapshot: existente });
    expect(url).toBeNull();
    expect(lead.brandSnapshot?.imagery).toHaveLength(1);
  });
});
