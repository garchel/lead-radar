import { Express, Request, Response } from "express";
import {
  SIMULATION_LEAD_ID,
  pickSimulationCandidates,
  resetSimulationCard,
  startProspectionSimulation,
} from "../services/simulationService";
import { getLeadById, getProjectsByLead } from "../store/db";
import { getDb } from "../store/schema";

/**
 * Simulação de prospecção com o número do Paulo.
 *
 * Cada chamada devolve o card dele para a primeira etapa (CRM e Projetos) com o
 * nome da empresa simulada e manda o D0 para o WhatsApp dele, para acompanhar o
 * card andando pelo funil.
 */
export function registerSimulationRoutes(app: Express) {
  app.get("/api/simulate/prospect", (_req: Request, res: Response) => {
    try {
      const lead = getLeadById(SIMULATION_LEAD_ID);
      if (!lead) return res.status(404).json({ success: false, error: "Lead de simulação (pv-landing-1) não existe." });
      const projeto = getProjectsByLead(SIMULATION_LEAD_ID).find((p) => !p.archived) || null;
      return res.json({
        success: true,
        card: {
          leadId: lead.id,
          leadName: lead.name,
          pipelineStatus: lead.pipelineStatus,
          project: projeto ? { id: projeto.id, name: projeto.name, stage: projeto.stage, status: projeto.status } : null,
        },
        candidates: pickSimulationCandidates(6).map((l) => ({
          id: l.id,
          name: l.name,
          city: l.city,
          state: l.state,
          rating: l.rating,
          reviews: l.reviewsCount,
          score: l.opportunityScore,
        })),
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao ler a simulação." });
    }
  });

  app.post("/api/simulate/prospect", async (req: Request, res: Response) => {
    try {
      const resultado = await startProspectionSimulation({
        leadId: req.body?.leadId ? String(req.body.leadId) : undefined,
      });
      const enviado = resultado.dispatch.status === "sent";
      return res.status(enviado ? 200 : 502).json({ success: enviado, ...resultado });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Falha ao simular a prospecção." });
    }
  });

  // Só reposiciona o card (sem enviar mensagem) — útil quando a conversa continua
  app.post("/api/simulate/prospect/reset", (req: Request, res: Response) => {
    try {
      const nome = String(req.body?.companyName || "").trim();
      if (!nome) return res.status(400).json({ success: false, error: "Informe o nome da empresa." });
      return res.json({ success: true, card: resetSimulationCard(nome) });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Falha ao reposicionar o card." });
    }
  });

  // Relatório de onde o card está agora (usado pelo chat ao acompanhar a simulação)
  app.get("/api/simulate/prospect/card", (_req: Request, res: Response) => {
    try {
      const lead = getLeadById(SIMULATION_LEAD_ID);
      if (!lead) return res.status(404).json({ success: false, error: "Lead de simulação não existe." });
      const projeto = getProjectsByLead(SIMULATION_LEAD_ID).find((p) => !p.archived) || null;
      const ultima = getDb()
        .prepare(
          "SELECT direction, status, message, created_at FROM communications WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(SIMULATION_LEAD_ID) as any;
      return res.json({
        success: true,
        card: {
          leadName: lead.name,
          pipelineStatus: lead.pipelineStatus,
          project: projeto ? { id: projeto.id, name: projeto.name, stage: projeto.stage, status: projeto.status } : null,
          lastMessage: ultima
            ? { direction: ultima.direction, status: ultima.status, text: String(ultima.message || '').slice(0, 120), at: ultima.created_at }
            : null,
        },
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao ler o card." });
    }
  });
}
