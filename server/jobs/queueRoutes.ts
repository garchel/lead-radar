import { Express, Request, Response } from "express";
import { queueManager, JobType } from "./queueManager";

export function registerQueueRoutes(app: Express) {
  // GET /api/jobs - Get queue status & list jobs
  app.get("/api/jobs", (req: Request, res: Response) => {
    const jobs = queueManager.getAllJobs();

    const metrics = {
      total: jobs.length,
      pending: jobs.filter((j) => j.status === 'pending').length,
      processing: jobs.filter((j) => j.status === 'processing').length,
      completed: jobs.filter((j) => j.status === 'completed').length,
      failed: jobs.filter((j) => j.status === 'failed').length,
      cancelled: jobs.filter((j) => j.status === 'cancelled').length,
    };

    res.json({
      success: true,
      metrics,
      jobs,
    });
  });

  // POST /api/jobs - Enqueue a new async job
  app.post("/api/jobs", (req: Request, res: Response) => {
    const { type, title, payload } = req.body;

    if (!type || !title) {
      return res.status(400).json({
        success: false,
        error: "Campos 'type' e 'title' são obrigatórios.",
      });
    }

    const validTypes: JobType[] = ['batch_prospecting', 'batch_lead_analysis', 'mcp_autopilot', 'landing_page_creation', 'follow_up_batch'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Tipo de job inválido. Tipos permitidos: ${validTypes.join(', ')}`,
      });
    }

    const job = queueManager.createJob(type, title, payload || {});

    res.status(201).json({
      success: true,
      message: `Job '${title}' enfileirado com sucesso.`,
      job,
    });
  });

  // GET /api/jobs/:id - Get specific job details and progress
  app.get("/api/jobs/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const job = queueManager.getJob(id);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: `Job '${id}' não encontrado na fila.`,
      });
    }

    res.json({
      success: true,
      job,
    });
  });

  // POST /api/jobs/:id/cancel - Cancel a pending or running job
  app.post("/api/jobs/:id/cancel", (req: Request, res: Response) => {
    const { id } = req.params;
    const cancelled = queueManager.cancelJob(id);

    if (!cancelled) {
      return res.status(400).json({
        success: false,
        error: `Não foi possível cancelar o job '${id}'. Ele pode já ter sido concluído ou não existir.`,
      });
    }

    res.json({
      success: true,
      message: `Job '${id}' foi cancelado.`,
      job: queueManager.getJob(id),
    });
  });

  // DELETE /api/jobs/completed - Clear finished jobs from history
  app.delete("/api/jobs/completed", (req: Request, res: Response) => {
    const clearedCount = queueManager.clearCompleted();
    res.json({
      success: true,
      message: `${clearedCount} jobs concluídos/falhos foram removidos da memória.`,
    });
  });
}
