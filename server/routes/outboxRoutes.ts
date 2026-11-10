import { Express, Request, Response } from "express";
import { listOutbox, retryOutbound } from "../services/outboxService";

/**
 * Outbox de envios: falhas reenviáveis e mensagens sem confirmação.
 * Retry é sempre manual — nunca dispara sozinho.
 */
export function registerOutboxRoutes(app: Express) {
  app.get("/api/outbox", (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit) || undefined;

      const snapshot = listOutbox({ limit });
      return res.json({ success: true, ...snapshot });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao listar a outbox." });
    }
  });

  app.post("/api/outbox/:id/retry", async (req: Request, res: Response) => {
    try {
      const result = await retryOutbound(String(req.params.id || ""));
      const status = result.ok ? 200 : result.detail.includes("não encontrada") ? 404 : 400;
      return res.status(status).json({ success: result.ok, ...result });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao reenviar a mensagem." });
    }
  });
}
