import { Express, Request, Response } from "express";
import {
  armAutopilot,
  autopilotTick,
  disarmAutopilot,
  getAutopilotSettings,
  getAutopilotStatus,
  resetAutopilotDay,
  runAutopilotNow,
  saveAutopilotSettings,
} from "../services/autoProspectingService";
import { getBudgetPlan, resetBudgetState, setBudgetWindow } from "../services/quotaBudgetService";

/**
 * Autopilot de coleta: orçamento da cota SerpAPI + prospecção dos melhores leads.
 *
 * O app chama `POST /api/autopilot/arm` ao abrir. A partir daí o servidor faz um
 * pulso por minuto (1 busca espaçada + 1 D0, dentro do orçamento do dia).
 */
export function registerAutopilotRoutes(app: Express) {
  app.get("/api/autopilot/status", (_req: Request, res: Response) => {
    try {
      return res.json({ success: true, ...getAutopilotStatus() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao ler o status do autopilot." });
    }
  });

  app.post("/api/autopilot/arm", (req: Request, res: Response) => {
    try {
      const source = String(req.body?.source || "app").slice(0, 40);
      const state = armAutopilot(source);
      return res.json({ success: true, armedUntil: state.armedUntil, ...getAutopilotStatus() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao armar o autopilot." });
    }
  });

  app.post("/api/autopilot/disarm", (_req: Request, res: Response) => {
    try {
      const state = disarmAutopilot();
      return res.json({ success: true, armedUntil: state.armedUntil, ...getAutopilotStatus() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao desarmar o autopilot." });
    }
  });

  app.put("/api/autopilot/settings", (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const patch: Record<string, unknown> = {};
      if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
      if (body.autoProspect !== undefined) patch.autoProspect = Boolean(body.autoProspect);
      if (body.minScore !== undefined) patch.minScore = Number(body.minScore);
      if (body.dailyNewCap !== undefined) patch.dailyNewCap = Number(body.dailyNewCap);
      if (body.minPopulation !== undefined) patch.minPopulation = Number(body.minPopulation);
      if (body.maxPopulation !== undefined) patch.maxPopulation = Number(body.maxPopulation);
      if (body.uf !== undefined) patch.uf = body.uf ? String(body.uf) : null;
      if (body.skipWithWebsite !== undefined) patch.skipWithWebsite = Boolean(body.skipWithWebsite);
      const settings = saveAutopilotSettings(patch as any);
      return res.json({ success: true, settings });
    } catch (error: any) {
      const status = /inválid|inválida|maior que/i.test(error?.message || "") ? 400 : 500;
      return res.status(status).json({ success: false, error: error?.message || "Falha ao salvar as configurações." });
    }
  });

  app.put("/api/autopilot/window", (req: Request, res: Response) => {
    try {
      const startHour = Number(req.body?.startHour);
      const endHour = Number(req.body?.endHour);
      if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) {
        return res.status(400).json({ success: false, error: "Informe startHour e endHour (0–23)." });
      }
      setBudgetWindow(startHour, endHour);
      return res.json({ success: true, budget: getBudgetPlan() });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Janela inválida." });
    }
  });

  /** Dispara UM pulso agora (ignora intervalo/janela). Usado pelo botão "buscar agora". */
  app.post("/api/autopilot/tick", async (req: Request, res: Response) => {
    try {
      const force = req.body?.force !== false;
      const result = await autopilotTick(new Date(), { force });
      return res.json({ success: true, ...result, ...getAutopilotStatus() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao rodar o autopilot." });
    }
  });

  /** Busca uma vez e devolve o que foi coletado (não manda D0). */
  app.post("/api/autopilot/run-now", async (_req: Request, res: Response) => {
    try {
      const result = await runAutopilotNow(new Date());
      const status = getAutopilotStatus();
      return res.status(result.ran ? 200 : 429).json({ success: result.ran, ...result, budget: status.budget });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha na busca manual." });
    }
  });

  app.post("/api/autopilot/reset-day", (_req: Request, res: Response) => {
    try {
      resetBudgetState();
      resetAutopilotDay();
      return res.json({ success: true, budget: getBudgetPlan(), settings: getAutopilotSettings() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao zerar o dia." });
    }
  });
}
