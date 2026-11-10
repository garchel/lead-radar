import { Express, Request, Response } from "express";
import { buildActionItems } from "../actionItems";

/**
 * GET /api/action-items — "o que precisa de atenção agora".
 * Agrega projetos (código entregue, prazo vencido), recontatos devidos
 * e a outbox num único payload leve para a faixa do topo da UI.
 */
export function registerActionItemsRoutes(app: Express) {
  app.get("/api/action-items", (_req: Request, res: Response) => {
    try {
      return res.json(buildActionItems());
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error?.message || "Falha ao montar as próximas ações.",
      });
    }
  });
}
