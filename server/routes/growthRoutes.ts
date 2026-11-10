import { Express, Request, Response } from "express";
import { getLeadById, upsertLead } from "../store/db";
import { auditLeadSite, auditWebsite, normalizeSiteUrl } from "../services/siteAuditService";
import { rankLeads, refreshLeadPriority } from "../services/leadScoringService";
import { computeOutboundMetrics } from "../services/metricsService";
import { planCadence, runCadence } from "../services/cadenceService";
import { analyzeLead } from "../services/prospectingService";
import { getLeads } from "../store/db";
import { effectiveWebsiteStatus } from "../services/presenceService";

/**
 * Rotas de crescimento: auditoria de site, priorização, métricas de funil e
 * cadência de follow-up. Todas também existem como tools MCP (o agente usa a
 * mesma lógica).
 */
export function registerGrowthRoutes(app: Express) {
  /** Audita o site de um lead (ou de uma URL avulsa) e persiste o resultado. */
  app.post("/api/leads/:id/audit", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });

    const url = req.body?.url || lead.websiteUrl;
    if (!normalizeSiteUrl(url)) {
      return res.status(400).json({
        success: false,
        error: "Lead sem site válido para auditar. Informe 'url' ou cadastre o site do lead.",
      });
    }
    // Link de marketplace/rede social não é site próprio — auditar iFood não diz
    // nada sobre a presença digital do negócio.
    if (!req.body?.url && effectiveWebsiteStatus(lead) !== "has_website") {
      return res.status(400).json({
        success: false,
        error: "Este lead não tem site próprio (apenas marketplace/rede social). O gancho correto é 'sem site', não uma auditoria.",
        websiteStatus: effectiveWebsiteStatus(lead),
      });
    }

    try {
      const { audit } = await auditLeadSite({ ...lead, websiteUrl: url });
      let updated = getLeadById(lead.id)!;
      const priority = refreshLeadPriority({ ...updated, siteAudit: audit });
      updated = getLeadById(lead.id)!;

      let analysis = updated.analysis;
      if (req.body?.generatePitch === true) {
        analysis = await analyzeLead({
          businessName: updated.name,
          category: updated.category || "Negócio local",
          city: updated.city || "",
          state: updated.state,
          address: updated.address,
          phone: updated.phone,
          rating: updated.rating,
          reviewsCount: updated.reviewsCount,
          websiteStatus: effectiveWebsiteStatus(updated),
          websiteUrl: updated.websiteUrl,
          siteAudit: audit,
        });
        updated = upsertLead({ ...updated, analysis });
      }

      res.json({ success: true, audit, priority, analysis, lead: updated });
    } catch (err: any) {
      res.status(502).json({ success: false, error: err?.message || "Falha ao auditar o site." });
    }
  });

  /** Audita uma URL sem vincular a lead (diagnóstico rápido). */
  app.post("/api/site-audit", async (req: Request, res: Response) => {
    const url = req.body?.url;
    if (!normalizeSiteUrl(url)) {
      return res.status(400).json({ success: false, error: "Informe uma URL válida (ex: 'empresa.com.br')." });
    }
    try {
      res.json({ success: true, audit: await auditWebsite(url) });
    } catch (err: any) {
      res.status(502).json({ success: false, error: err?.message || "Falha ao auditar o site." });
    }
  });

  /** Lista de leads ordenada por prioridade comercial. */
  app.get("/api/leads-priority", (req: Request, res: Response) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    let leads = getLeads();
    if (status) leads = leads.filter((lead) => lead.pipelineStatus === status);
    const ranked = rankLeads(leads).slice(0, limit);
    res.json({ success: true, count: ranked.length, leads: ranked });
  });

  /** Funil de outbound: enviados → respostas → reuniões → fechados. */
  app.get("/api/metrics/outbound", (req: Request, res: Response) => {
    try {
      const since = typeof req.query.since === "string" ? req.query.since : undefined;
      res.json({ success: true, metrics: computeOutboundMetrics({ since }) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Falha ao calcular métricas." });
    }
  });

  /** Prévia da cadência (o que seria enviado hoje). */
  app.get("/api/cadence/plan", (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const plan = planCadence({ limit });
      res.json({
        success: true,
        enabled: plan.enabled,
        cap: plan.cap,
        usedToday: plan.usedToday,
        remaining: plan.remaining,
        count: plan.candidates.length,
        candidates: plan.candidates.map((item) => ({
          leadId: item.lead.id,
          name: item.lead.name,
          phone: item.lead.phone,
          step: item.step.step,
          angle: item.step.angle,
          dueAt: item.dueAt,
          message: item.message,
        })),
        skipped: plan.skipped,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Falha ao montar a cadência." });
    }
  });

  /**
   * Executa a cadência. `dryRun` é o padrão — enviar exige `dryRun: false`
   * explícito, para evitar disparo em massa por engano.
   */
  app.post("/api/cadence/run", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const result = await runCadence({
        dryRun: body.dryRun !== false,
        limit: Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined,
        leadIds: Array.isArray(body.leadIds) ? body.leadIds : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Falha ao executar a cadência." });
    }
  });
}
