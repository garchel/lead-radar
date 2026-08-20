import { Express, Request, Response } from "express";
import { CronPattern } from "croner";
import { getSchedules, getScheduleById, upsertSchedule, deleteSchedule } from "../store/db";
import { Schedule, ScheduleJobType } from "../store/types";
import { scheduler } from "../scheduler/scheduler";

const VALID_JOB_TYPES: ScheduleJobType[] = ["mcp_autopilot", "batch_prospecting", "follow_up_reminder"];

function isValidCron(cron: string): boolean {
  try {
    new CronPattern(cron);
    return true;
  } catch {
    return false;
  }
}

export function registerScheduleRoutes(app: Express) {
  // List schedules
  app.get("/api/schedules", (req: Request, res: Response) => {
    res.json({ success: true, schedules: getSchedules() });
  });

  // Get one schedule
  app.get("/api/schedules/:id", (req: Request, res: Response) => {
    const s = getScheduleById(req.params.id);
    if (!s) return res.status(404).json({ success: false, error: "Agendamento não encontrado." });
    res.json({ success: true, schedule: s });
  });

  // Create schedule
  app.post("/api/schedules", (req: Request, res: Response) => {
    const { name, cron, jobType, payload, enabled } = req.body || {};

    if (!name || !cron || !jobType) {
      return res.status(400).json({ success: false, error: "Campos 'name', 'cron' e 'jobType' são obrigatórios." });
    }
    if (!VALID_JOB_TYPES.includes(jobType)) {
      return res.status(400).json({ success: false, error: `'jobType' inválido. Permitidos: ${VALID_JOB_TYPES.join(", ")}.` });
    }
    if (!isValidCron(cron)) {
      return res.status(400).json({ success: false, error: `Expressão cron inválida: "${cron}".` });
    }

    const schedule: Schedule = {
      id: req.body.id || `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      cron,
      jobType,
      payload: payload || {},
      enabled: enabled !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = upsertSchedule(schedule);
    scheduler.reloadOne(saved.id);
    res.status(201).json({ success: true, schedule: saved });
  });

  // Update schedule (toggle / edit)
  app.patch("/api/schedules/:id", (req: Request, res: Response) => {
    const existing = getScheduleById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: "Agendamento não encontrado." });

    const { name, cron, jobType, payload, enabled } = req.body || {};
    if (cron !== undefined && !isValidCron(cron)) {
      return res.status(400).json({ success: false, error: `Expressão cron inválida: "${cron}".` });
    }
    if (jobType !== undefined && !VALID_JOB_TYPES.includes(jobType)) {
      return res.status(400).json({ success: false, error: `'jobType' inválido.` });
    }

    const updated = upsertSchedule({
      ...existing,
      name: name ?? existing.name,
      cron: cron ?? existing.cron,
      jobType: jobType ?? existing.jobType,
      payload: payload ?? existing.payload,
      enabled: enabled !== undefined ? enabled : existing.enabled,
    });

    scheduler.reloadOne(updated.id);
    res.json({ success: true, schedule: updated });
  });

  // Delete schedule
  app.delete("/api/schedules/:id", (req: Request, res: Response) => {
    const deleted = deleteSchedule(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: "Agendamento não encontrado." });
    scheduler.reloadOne(req.params.id);
    res.json({ success: true });
  });
}