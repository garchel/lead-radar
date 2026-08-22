import { Express, Request, Response } from "express";
import { getTypeformConfig, getTypeformSyncConfig } from "../config";
import { syncTypeformBriefing, listImportedBriefings } from "../typeform/service";
import { getTypeformLastSyncAt, getTypeformLastSyncStatus } from "../typeform/polling";

export function registerTypeformRoutes(app: Express) {
  // Status da integração (não expõe o token).
  app.get("/api/typeform/config", (_req: Request, res: Response) => {
    const config = getTypeformConfig();
    const sync = getTypeformSyncConfig();
    res.json({
      success: true,
      configured: config.configured,
      formId: config.formId || null,
      syncIntervalMinutes: sync.intervalMinutes,
      pollingEnabled: sync.enabled,
      lastSyncAt: getTypeformLastSyncAt(),
      lastSyncStatus: getTypeformLastSyncStatus(),
    });
  });

  // Dispara a importação do briefing. Idempotente (cada resposta importa 1x).
  app.post("/api/typeform/sync", async (req: Request, res: Response) => {
    const { formId, limit, projectId } = req.body || {};
    try {
      const summary = await syncTypeformBriefing({ formId, limit, projectId });
      res.json({ success: true, ...summary });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Falha ao sincronizar o Typeform." });
    }
  });

  // Auditoria: respostas já importadas por projeto.
  app.get("/api/typeform/briefings", (_req: Request, res: Response) => {
    res.json({ success: true, briefings: listImportedBriefings() });
  });
}