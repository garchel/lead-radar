import { Express, Request, Response } from "express";
import {
  getLeads,
  getLeadById,
  upsertLead,
  deleteLead,
  getPipelineSummary,
  getCommunications,
  getCommunicationsByLead,
  getInteractionsByLead,
  getDueFollowUps,
  findDuplicateMatch,
} from "../store/db";
import { StoredLead } from "../store/types";
import { dispatchLeadContact, recordInteractionOutcome } from "../services/interactionService";

export function registerLeadRoutes(app: Express) {
  // List leads
  app.get("/api/leads", (req: Request, res: Response) => {
    res.json({ success: true, leads: getLeads() });
  });

  // Get one lead
  app.get("/api/leads/:id", (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    res.json({ success: true, lead });
  });

  // Create / upsert lead
  app.post("/api/leads", (req: Request, res: Response) => {
    const { confirmMerge, forceCreate, ...leadBody } = req.body || {};
    const body = leadBody as Partial<StoredLead>;
    if (!body || !body.id || !body.name) {
      return res.status(400).json({ success: false, error: "Campos 'id' e 'name' são obrigatórios." });
    }
    const lead: StoredLead = {
      pipelineStatus: "prospect",
      ...body,
    } as StoredLead;

    if (forceCreate === true) {
      const saved = upsertLead(lead, { skipDedup: true });
      return res.status(201).json({ success: true, deduplicated: false, lead: saved });
    }

    const match = findDuplicateMatch(lead);
    if (match?.matchType === "weak" && confirmMerge !== true) {
      // Duas empresas distintas podem ter o mesmo nome na mesma cidade: não
      // mescle sem confirmação humana. O front deve exibir um diálogo.
      return res.status(409).json({
        success: false,
        code: "possible_duplicate",
        error: "Possível empresa duplicada encontrada. Confirme a mesclagem ou cadastre em separado.",
        existingLead: match.lead,
        incoming: lead,
      });
    }

    const saved = upsertLead(lead);
    res.status(match ? 200 : 201).json({
      success: true,
      deduplicated: Boolean(match && match.lead.id !== saved.id),
      lead: saved,
    });
  });

  // Update lead (status / notes)
  app.patch("/api/leads/:id", (req: Request, res: Response) => {
    const existing = getLeadById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    const updated = upsertLead({ ...existing, ...req.body } as StoredLead);
    res.json({ success: true, lead: updated });
  });

  // Delete lead
  app.delete("/api/leads/:id", (req: Request, res: Response) => {
    deleteLead(req.params.id);
    res.json({ success: true });
  });

  // Pipeline summary
  app.get("/api/pipeline", (req: Request, res: Response) => {
    res.json({ success: true, ...getPipelineSummary() });
  });

  // Contact a lead (only a real provider response is considered success).
  app.post("/api/leads/:id/contact", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    try {
      const { channel, message, subject } = req.body || {};
      const result = await dispatchLeadContact(lead, { channel, message, subject });
      if (result.blocked) {
        return res.status(409).json({ success: false, error: result.detail, ...result });
      }
      if (result.status !== "sent") {
        return res.status(502).json({ success: false, error: result.detail, ...result });
      }
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Falha ao enviar contato." });
    }
  });

  // List interactions for one lead
  app.get("/api/leads/:id/interactions", (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    res.json({ success: true, interactions: getInteractionsByLead(lead.id) });
  });

  // Register the outcome of the latest sent interaction.
  app.post("/api/leads/:id/interactions/outcome", (req: Request, res: Response) => {
    const { outcome, interactionId, notes, respondedAt } = req.body || {};
    const validOutcomes = ["no_response", "negative", "positive", "meeting_scheduled", "negotiating", "do_not_contact"];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ success: false, error: `outcome inválido. Use: ${validOutcomes.join(", ")}.` });
    }
    try {
      const result = recordInteractionOutcome(req.params.id, outcome, { interactionId, notes, respondedAt });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Falha ao registrar o resultado da interação." });
    }
  });

  // List follow-ups whose cooldown has expired.
  app.get("/api/follow-ups/due", (req: Request, res: Response) => {
    res.json({ success: true, followUps: getDueFollowUps() });
  });

  // List all communications
  app.get("/api/communications", (req: Request, res: Response) => {
    res.json({ success: true, communications: getCommunications() });
  });

  // List communications for one lead
  app.get("/api/leads/:id/communications", (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    res.json({ success: true, communications: getCommunicationsByLead(lead.id) });
  });
}
