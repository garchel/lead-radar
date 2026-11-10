import { Express, Request, Response } from "express";
import { getDb } from "../store/schema";

/**
 * Visão do banco de leads: números agregados + lista filtrável e paginada.
 * Tudo em SQL (não carrega o banco inteiro na memória do Node).
 */

const PIPELINE_LABELS: Record<string, string> = {
  prospect: "Novos prospects",
  contacted: "Contato feito",
  negotiating: "Em negociação",
  em_desenvolvimento: "Em desenvolvimento",
  closed: "Finalizado",
  declined: "Perdido",
  dormant: "Dormente",
};

const WEBSITE_LABELS: Record<string, string> = {
  none: "Sem site",
  social_only: "Só rede social",
  marketplace_only: "Só marketplace",
  has_website: "Tem site",
};

function n(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function registerDatabaseRoutes(app: Express) {
  /** Números do banco: totais, distribuições e os melhores grupos. */
  app.get("/api/database/stats", (_req: Request, res: Response) => {
    try {
      const db = getDb();

      const totals = db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN phone IS NOT NULL AND phone <> '' THEN 1 ELSE 0 END) AS comFone,
             SUM(CASE WHEN phone IS NULL OR phone = '' THEN 1 ELSE 0 END) AS semFone,
             ROUND(AVG(opportunity_score), 1) AS scoreMedio,
             SUM(CASE WHEN website_status = 'none' THEN 1 ELSE 0 END) AS semSite,
             SUM(CASE WHEN website_status = 'social_only' THEN 1 ELSE 0 END) AS soRede,
             SUM(CASE WHEN website_status = 'marketplace_only' THEN 1 ELSE 0 END) AS soMarketplace,
             SUM(CASE WHEN website_status = 'has_website' THEN 1 ELSE 0 END) AS comSite,
             SUM(CASE WHEN saved_at >= date('now') THEN 1 ELSE 0 END) AS hoje,
             SUM(CASE WHEN saved_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS ultimos7,
             SUM(CASE WHEN last_contact_at IS NOT NULL THEN 1 ELSE 0 END) AS contactados,
             SUM(CASE WHEN do_not_contact = 1 THEN 1 ELSE 0 END) AS optOut,
             SUM(CASE WHEN analysis IS NOT NULL THEN 1 ELSE 0 END) AS comAnalise
           FROM leads`
        )
        .get() as any;

      const pipeline = (db
        .prepare("SELECT pipeline_status AS k, COUNT(*) AS total FROM leads GROUP BY pipeline_status ORDER BY total DESC")
        .all() as any[]).map((row) => ({ key: row.k, label: PIPELINE_LABELS[row.k] || row.k, total: n(row.total) }));

      const website = (db
        .prepare("SELECT website_status AS k, COUNT(*) AS total FROM leads GROUP BY website_status ORDER BY total DESC")
        .all() as any[]).map((row) => ({ key: row.k, label: WEBSITE_LABELS[row.k] || row.k, total: n(row.total) }));

      const scoreBands = (db
        .prepare(
          `SELECT CASE
                    WHEN opportunity_score >= 90 THEN '90-100'
                    WHEN opportunity_score >= 80 THEN '80-89'
                    WHEN opportunity_score >= 70 THEN '70-79'
                    WHEN opportunity_score >= 60 THEN '60-69'
                    ELSE '0-59' END AS faixa,
                  COUNT(*) AS total
             FROM leads GROUP BY faixa`
        )
        .all() as any[]).map((row) => ({ label: row.faixa, total: n(row.total) }));

      const topCities = (db
        .prepare(
          `SELECT city, state, COUNT(*) AS total
             FROM leads WHERE city IS NOT NULL AND city <> ''
            GROUP BY city, state ORDER BY total DESC LIMIT 10`
        )
        .all() as any[]).map((row) => ({ city: row.city, state: row.state, total: n(row.total) }));

      const topCategories = (db
        .prepare(
          `SELECT category, COUNT(*) AS total
             FROM leads WHERE category IS NOT NULL AND category <> ''
            GROUP BY category ORDER BY total DESC LIMIT 10`
        )
        .all() as any[]).map((row) => ({ category: row.category, total: n(row.total) }));

      // Mesmo critério do autopilot: quem está apto a receber D0 hoje.
      const ready = db
        .prepare(
          `SELECT COUNT(*) AS total FROM leads
            WHERE pipeline_status = 'prospect'
              AND do_not_contact = 0
              AND phone IS NOT NULL AND phone <> ''
              AND (contact_attempts IS NULL OR contact_attempts = 0)
              AND last_contact_at IS NULL
              AND opportunity_score >= 60
              AND website_status <> 'has_website'`
        )
        .get() as any;

      return res.json({
        success: true,
        totals: {
          total: n(totals.total),
          comFone: n(totals.comFone),
          semFone: n(totals.semFone),
          scoreMedio: n(totals.scoreMedio),
          semSite: n(totals.semSite),
          soRede: n(totals.soRede),
          soMarketplace: n(totals.soMarketplace),
          comSite: n(totals.comSite),
          hoje: n(totals.hoje),
          ultimos7: n(totals.ultimos7),
          contactados: n(totals.contactados),
          optOut: n(totals.optOut),
          comAnalise: n(totals.comAnalise),
          prontosParaD0: n(ready?.total),
        },
        pipeline,
        website,
        scoreBands,
        topCities,
        topCategories,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao ler as estatísticas." });
    }
  });

  /** Lista paginada e filtrável. */
  app.get("/api/database/leads", (req: Request, res: Response) => {
    try {
      const db = getDb();
      const where: string[] = [];
      const params: Record<string, any> = {};

      const q = String(req.query.q || "").trim();
      if (q) {
        where.push("(name LIKE @q OR phone LIKE @q OR city LIKE @q OR category LIKE @q OR address LIKE @q)");
        params.q = `%${q}%`;
      }
      const pipeline = String(req.query.pipeline || "").trim();
      if (pipeline && pipeline !== "all") {
        where.push("pipeline_status = @pipeline");
        params.pipeline = pipeline;
      }
      const website = String(req.query.website || "").trim();
      if (website && website !== "all") {
        where.push("website_status = @website");
        params.website = website;
      }
      const city = String(req.query.city || "").trim();
      if (city) {
        where.push("city = @city");
        params.city = city;
      }
      const category = String(req.query.category || "").trim();
      if (category) {
        where.push("category = @category");
        params.category = category;
      }
      const scoreMin = Number(req.query.scoreMin);
      if (Number.isFinite(scoreMin) && scoreMin > 0) {
        where.push("opportunity_score >= @scoreMin");
        params.scoreMin = Math.floor(scoreMin);
      }
      if (req.query.hasPhone === "1") where.push("phone IS NOT NULL AND phone <> ''");
      if (req.query.hasPhone === "0") where.push("(phone IS NULL OR phone = '')");
      if (req.query.onlyNew === "1") where.push("last_contact_at IS NULL AND (contact_attempts IS NULL OR contact_attempts = 0)");
      if (req.query.readyForD0 === "1") {
        where.push(
          "pipeline_status = 'prospect' AND do_not_contact = 0 AND phone IS NOT NULL AND phone <> '' AND (contact_attempts IS NULL OR contact_attempts = 0) AND last_contact_at IS NULL AND opportunity_score >= 60 AND website_status <> 'has_website'"
        );
      }
      const days = Number(req.query.days);
      if (Number.isFinite(days) && days > 0) {
        where.push("saved_at >= datetime('now', @daysAgo)");
        params.daysAgo = `-${Math.floor(days)} days`;
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const sortKey = String(req.query.sort || "score");
      const orderBy =
        sortKey === "recent"
          ? "saved_at DESC, opportunity_score DESC"
          : sortKey === "name"
            ? "name COLLATE NOCASE ASC"
            : sortKey === "city"
              ? "city COLLATE NOCASE ASC, opportunity_score DESC"
              : "opportunity_score DESC, saved_at DESC";

      const limit = Math.min(200, Math.max(1, Math.floor(Number(req.query.limit) || 50)));
      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      const offset = (page - 1) * limit;

      const total = n((db.prepare(`SELECT COUNT(*) AS total FROM leads ${whereSql}`).get(params) as any)?.total);

      const rows = db
        .prepare(
          `SELECT id, name, category, address, neighborhood, city, state, phone, rating, reviews_count,
                  website_status, website_url, instagram_handle, opportunity_score, opportunity_level,
                  estimated_value, key_insights, pipeline_status, notes, saved_at, last_contact_at,
                  last_response_at, contact_attempts, do_not_contact,
                  CASE WHEN analysis IS NOT NULL THEN 1 ELSE 0 END AS has_analysis
             FROM leads ${whereSql}
            ORDER BY ${orderBy}
            LIMIT @limit OFFSET @offset`
        )
        .all({ ...params, limit, offset }) as any[];

      return res.json({
        success: true,
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
        leads: rows.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          address: row.address,
          neighborhood: row.neighborhood,
          city: row.city,
          state: row.state,
          phone: row.phone,
          rating: row.rating,
          reviewsCount: n(row.reviews_count),
          websiteStatus: row.website_status,
          websiteStatusLabel: WEBSITE_LABELS[row.website_status] || row.website_status,
          websiteUrl: row.website_url,
          instagramHandle: row.instagram_handle,
          opportunityScore: n(row.opportunity_score),
          opportunityLevel: row.opportunity_level,
          estimatedValue: row.estimated_value,
          keyInsights: row.key_insights,
          pipelineStatus: row.pipeline_status,
          pipelineLabel: PIPELINE_LABELS[row.pipeline_status] || row.pipeline_status,
          notes: row.notes,
          savedAt: row.saved_at,
          lastContactAt: row.last_contact_at,
          lastResponseAt: row.last_response_at,
          contactAttempts: n(row.contact_attempts),
          doNotContact: Boolean(row.do_not_contact),
          hasAnalysis: Boolean(row.has_analysis),
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao listar os leads." });
    }
  });

  /** Opções para os selects (cidades e categorias existentes no banco). */
  app.get("/api/database/filters", (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const cities = (db
        .prepare("SELECT DISTINCT city, state FROM leads WHERE city IS NOT NULL AND city <> '' ORDER BY city COLLATE NOCASE")
        .all() as any[]).map((row) => ({ city: row.city, state: row.state }));
      const categories = (db
        .prepare("SELECT DISTINCT category FROM leads WHERE category IS NOT NULL AND category <> '' ORDER BY category COLLATE NOCASE")
        .all() as any[]).map((row) => row.category as string);
      return res.json({ success: true, cities, categories });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao listar filtros." });
    }
  });
}
