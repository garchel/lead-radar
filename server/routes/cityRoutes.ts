import { Express, Request, Response } from "express";
import {
  getCities,
  getCityByCode,
  updateCity,
  importIbgeCities,
  ensureCitiesLoaded,
  recomputeMarketTiers,
  getBusinessCategories,
  upsertBusinessCategory,
  estimateTicketForCategory,
} from "../store/db";

/**
 * Rotas da fila de cidades (base IBGE) — rotação round-robin de prospecção.
 *
 * GET  /api/cities                     — lista com filtros (uf, minPopulation, maxPopulation, limit)
 * GET  /api/cities/next?n=3&uf=GO...   — prévia das próximas N cidades no round-robin (não marca busca)
 * POST /api/cities/import              — importa/atualiza a base IBGE do CSV local
 * PATCH /api/cities/:code              — habilita/desabilita cidade ou muda status
 * GET  /api/cities/stats               — contagens por UF e faixa populacional
 */
export function registerCityRoutes(app: Express) {
  app.get("/api/cities", (req: Request, res: Response) => {
    try {
      ensureCitiesLoaded();
      const { uf, minPopulation, maxPopulation, limit, enabledOnly } = req.query as Record<string, string>;
      const cities = getCities({
        uf,
        minPopulation: minPopulation ? Number(minPopulation) : undefined,
        maxPopulation: maxPopulation ? Number(maxPopulation) : undefined,
        enabledOnly: enabledOnly === "true",
        limit: limit ? Number(limit) : undefined,
      });
      return res.json({ success: true, total: cities.length, cities });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao listar cidades." });
    }
  });

  app.get("/api/cities/next", (req: Request, res: Response) => {
    try {
      ensureCitiesLoaded();
      const { n = "3", uf, minPopulation, maxPopulation } = req.query as Record<string, string>;
      const cities = getCities({
        uf,
        minPopulation: minPopulation ? Number(minPopulation) : undefined,
        maxPopulation: maxPopulation ? Number(maxPopulation) : undefined,
        enabledOnly: true,
      });
      // mesma ordenação do pickNextCities: nunca buscadas primeiro, depois mais antigas
      cities.sort((a, b) => {
        if (a.lastSearchedAt === null && b.lastSearchedAt !== null) return -1;
        if (b.lastSearchedAt === null && a.lastSearchedAt !== null) return 1;
        if (a.lastSearchedAt && b.lastSearchedAt) return a.lastSearchedAt.localeCompare(b.lastSearchedAt);
        return b.population - a.population;
      });
      const count = Math.max(1, Math.min(50, Math.floor(Number(n) || 3)));
      return res.json({ success: true, next: cities.slice(0, count) });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao calcular próximas cidades." });
    }
  });

  app.post("/api/cities/import", (_req: Request, res: Response) => {
    try {
      const total = importIbgeCities();
      const tiers = recomputeMarketTiers();
      return res.json({ success: true, total, tiers });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao importar base IBGE." });
    }
  });

  // Ticket sugerido: categoria × tier de mercado da cidade
  app.get("/api/cities/:code/ticket", (req: Request, res: Response) => {
    try {
      const { category } = req.query as Record<string, string>;
      if (!category || !category.trim()) {
        return res.status(400).json({ success: false, error: "Informe ?category=Nome da categoria." });
      }
      const result = estimateTicketForCategory(category, req.params.code);
      if (!result.city) return res.status(404).json({ success: false, error: "Cidade não encontrada." });
      if (!result.category) return res.status(404).json({ success: false, error: "Categoria não encontrada." });
      return res.json({ success: true, ...result });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao estimar ticket." });
    }
  });

  app.patch("/api/cities/:code", (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const existing = getCityByCode(code);
      if (!existing) return res.status(404).json({ success: false, error: "Cidade não encontrada." });
      const { enabled, status } = req.body || {};
      if (enabled !== undefined && typeof enabled !== "boolean") {
        return res.status(400).json({ success: false, error: "enabled deve ser booleano." });
      }
      if (status !== undefined && !["pending", "in_progress", "done", "skipped"].includes(status)) {
        return res.status(400).json({ success: false, error: "status inválido." });
      }
      const updated = updateCity(code, { enabled, status });
      return res.json({ success: true, city: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao atualizar cidade." });
    }
  });

  app.get("/api/cities/stats", (_req: Request, res: Response) => {
    try {
      ensureCitiesLoaded();
      const all = getCities();
      const byUf: Record<string, number> = {};
      for (const c of all) byUf[c.uf] = (byUf[c.uf] || 0) + 1;
      const inRange = all.filter((c) => c.population >= 30000 && c.population <= 200000).length;
      const searched = all.filter((c) => c.searchCount > 0).length;
      return res.json({
        success: true,
        total: all.length,
        inRotationRange: inRange,
        alreadySearched: searched,
        neverSearched: all.length - searched,
        byUf,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha nas estatísticas de cidades." });
    }
  });

  // ------------------------------------------------------------------
  //  Categorias de negócio (propensão + ticket base)
  // ------------------------------------------------------------------

  app.get("/api/categories", (req: Request, res: Response) => {
    try {
      const { activeOnly } = req.query as Record<string, string>;
      const categories = getBusinessCategories({ activeOnly: activeOnly === "true" });
      return res.json({ success: true, total: categories.length, categories });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao listar categorias." });
    }
  });

  app.put("/api/categories/:id", (req: Request, res: Response) => {
    try {
      const existing = getBusinessCategories().find((c) => c.id === req.params.id);
      if (!existing) return res.status(404).json({ success: false, error: "Categoria não encontrada." });
      const { name, propensity, baseTicket, isActive } = req.body || {};
      if (propensity !== undefined && (typeof propensity !== "number" || propensity < 0 || propensity > 100)) {
        return res.status(400).json({ success: false, error: "propensity deve ser número entre 0 e 100." });
      }
      if (baseTicket !== undefined && (typeof baseTicket !== "number" || baseTicket < 0)) {
        return res.status(400).json({ success: false, error: "baseTicket deve ser número >= 0." });
      }
      const updated = upsertBusinessCategory({
        id: req.params.id,
        name: typeof name === "string" && name.trim() ? name : existing.name,
        propensity: propensity ?? existing.propensity,
        baseTicket: baseTicket ?? existing.baseTicket,
        isActive,
      });
      return res.json({ success: true, category: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao atualizar categoria." });
    }
  });

  app.post("/api/categories", (req: Request, res: Response) => {
    try {
      const { name, propensity = 50, baseTicket = 2000, isActive } = req.body || {};
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, error: "name é obrigatório." });
      }
      if (typeof propensity !== "number" || propensity < 0 || propensity > 100) {
        return res.status(400).json({ success: false, error: "propensity deve ser número entre 0 e 100." });
      }
      if (typeof baseTicket !== "number" || baseTicket < 0) {
        return res.status(400).json({ success: false, error: "baseTicket deve ser número >= 0." });
      }
      const created = upsertBusinessCategory({ name, propensity, baseTicket, isActive });
      return res.json({ success: true, category: created });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao criar categoria." });
    }
  });
}
