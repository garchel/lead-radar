import { Express, Request, Response } from "express";
import { getSetting, setSetting } from "../store/db";
import { scheduler } from "../scheduler/scheduler";
import { getSchedulerConfig } from "../config";

export interface AutomationSettings {
  schedulerEnabled: boolean;
  backupEnabled: boolean;
  backupIntervalHours: number;
  typeformPollingEnabled: boolean;
  typeformIntervalMin: number;
  whatsappAutoIntent: boolean;
  whatsappAutoPipeline: boolean;
  whatsappAutoFollowUp: boolean;
  autopilotAutoEnrich: boolean;
  autopilotAnalyzeTopN: number;
  autopilotSendPitches: boolean;
  autopilotCreateLandingPages: boolean;
}

const DEFAULTS: AutomationSettings = {
  schedulerEnabled: true,
  backupEnabled: true,
  backupIntervalHours: 24,
  typeformPollingEnabled: true,
  typeformIntervalMin: 5,
  whatsappAutoIntent: true,
  whatsappAutoPipeline: true,
  whatsappAutoFollowUp: true,
  autopilotAutoEnrich: true,
  autopilotAnalyzeTopN: 3,
  autopilotSendPitches: false,
  autopilotCreateLandingPages: false,
};

function getAutomationSettings(): AutomationSettings {
  const schedulerEnvOff = process.env.LEADRADAR_SCHEDULER === "off";
  const sRaw = getSetting("automation_scheduler_enabled");
  const schedulerEnabled = sRaw !== null ? sRaw === "true" : !schedulerEnvOff && DEFAULTS.schedulerEnabled;

  const backupRaw = getSetting("automation_backup_enabled");
  const backupEnabled = backupRaw !== null ? backupRaw === "true" : DEFAULTS.backupEnabled;
  const backupIntervalRaw = getSetting("automation_backup_interval_hours");
  const backupIntervalHours = backupIntervalRaw ? Math.max(1, Math.floor(Number(backupIntervalRaw) || DEFAULTS.backupIntervalHours)) : DEFAULTS.backupIntervalHours;

  const tfEnabledRaw = getSetting("automation_typeform_polling_enabled");
  const typeformPollingEnabled = tfEnabledRaw !== null ? tfEnabledRaw === "true" : DEFAULTS.typeformPollingEnabled;
  const tfIntervalRaw = getSetting("automation_typeform_interval_min");
  const typeformIntervalMin = tfIntervalRaw ? Math.max(1, Math.floor(Number(tfIntervalRaw) || DEFAULTS.typeformIntervalMin)) : DEFAULTS.typeformIntervalMin;

  const waIntentRaw = getSetting("automation_whatsapp_auto_intent");
  const whatsappAutoIntent = waIntentRaw !== null ? waIntentRaw === "true" : DEFAULTS.whatsappAutoIntent;
  const waPipeRaw = getSetting("automation_whatsapp_auto_pipeline");
  const whatsappAutoPipeline = waPipeRaw !== null ? waPipeRaw === "true" : DEFAULTS.whatsappAutoPipeline;
  const waFollowRaw = getSetting("automation_whatsapp_auto_followup");
  const whatsappAutoFollowUp = waFollowRaw !== null ? waFollowRaw === "true" : DEFAULTS.whatsappAutoFollowUp;

  const enrichRaw = getSetting("automation_autopilot_auto_enrich");
  const autopilotAutoEnrich = enrichRaw !== null ? enrichRaw === "true" : DEFAULTS.autopilotAutoEnrich;
  const topNRaw = getSetting("automation_autopilot_analyze_top_n");
  const autopilotAnalyzeTopN = topNRaw !== null ? Math.max(0, Math.min(5, Math.floor(Number(topNRaw) || DEFAULTS.autopilotAnalyzeTopN))) : DEFAULTS.autopilotAnalyzeTopN;
  const sendRaw = getSetting("automation_autopilot_send_pitches");
  const autopilotSendPitches = sendRaw !== null ? sendRaw === "true" : DEFAULTS.autopilotSendPitches;
  const lpRaw = getSetting("automation_autopilot_create_landing_pages");
  const autopilotCreateLandingPages = lpRaw !== null ? lpRaw === "true" : DEFAULTS.autopilotCreateLandingPages;

  return {
    schedulerEnabled,
    backupEnabled,
    backupIntervalHours,
    typeformPollingEnabled,
    typeformIntervalMin,
    whatsappAutoIntent,
    whatsappAutoPipeline,
    whatsappAutoFollowUp,
    autopilotAutoEnrich,
    autopilotAnalyzeTopN,
    autopilotSendPitches,
    autopilotCreateLandingPages,
  };
}

export function registerAutomationRoutes(app: Express) {
  app.get("/api/automation/settings", (_req: Request, res: Response) => {
    try {
      const settings = getAutomationSettings();
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Falha ao carregar automações." });
    }
  });

  app.put("/api/automation/settings", (req: Request, res: Response) => {
    const body = req.body || {};
    const allowed: (keyof AutomationSettings)[] = [
      "schedulerEnabled","backupEnabled","backupIntervalHours","typeformPollingEnabled","typeformIntervalMin",
      "whatsappAutoIntent","whatsappAutoPipeline","whatsappAutoFollowUp",
      "autopilotAutoEnrich","autopilotAnalyzeTopN","autopilotSendPitches","autopilotCreateLandingPages"
    ];
    try {
      for (const key of allowed) {
        if (body[key] !== undefined) {
          const val = body[key];
          // validação por chave
          if (["schedulerEnabled","backupEnabled","typeformPollingEnabled","whatsappAutoIntent","whatsappAutoPipeline","whatsappAutoFollowUp","autopilotAutoEnrich","autopilotSendPitches","autopilotCreateLandingPages"].includes(key)) {
            if (typeof val !== "boolean") return res.status(400).json({ success: false, error: `${key} deve ser boolean.` });
          }
          if (key === "backupIntervalHours" || key === "typeformIntervalMin") {
            if (!Number.isFinite(Number(val)) || Number(val) <= 0) return res.status(400).json({ success: false, error: `${key} deve ser número >0.` });
          }
          if (key === "autopilotAnalyzeTopN") {
            if (!Number.isInteger(Number(val)) || Number(val) < 0 || Number(val) > 5) return res.status(400).json({ success: false, error: `${key} deve ser 0-5.` });
          }
          const storeKey = `automation_${key.replace(/([A-Z])/g, (m)=>`_${m.toLowerCase()}`)}`;
          // schedulerEnabled -> automation_scheduler_enabled
          const dbKey = storeKey.replace("automation_scheduler_enabled","automation_scheduler_enabled");
          setSetting(dbKey, String(val));
        }
      }
      // efeito colateral: scheduler liga/desliga em tempo real
      if (body.schedulerEnabled !== undefined) {
        try {
          if (body.schedulerEnabled) {
            if (!(scheduler as any).started) scheduler.start();
          } else {
            scheduler.stop();
          }
        } catch {}
      }
      const settings = getAutomationSettings();
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Falha ao salvar automações." });
    }
  });
}

export { getAutomationSettings };
