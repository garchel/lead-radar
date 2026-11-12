import { Express, Request, Response } from "express";
import { getSetting, setSetting } from "../store/db";
import { scheduler } from "../scheduler/scheduler";
import { getSchedulerConfig } from "../config";
import {
  getHumanizeSettings,
  saveHumanizeSettings,
  HumanizeSettingsError,
  type HumanizeSettings,
} from "../services/humanizeService";

export interface AutomationSettings {
  schedulerEnabled: boolean;
  backupEnabled: boolean;
  backupIntervalHours: number;
  typeformPollingEnabled: boolean;
  typeformIntervalMin: number;
  whatsappAutoIntent: boolean;
  whatsappAutoPipeline: boolean;
  whatsappAutoFollowUp: boolean;
  whatsappAutoCreateLead: boolean;
  /** Segunda opinião da IA quando o regex não entende a resposta ("manda", "claro"). */
  intentAi: boolean;
  /** Agente comercial responde sozinho quem manda mensagem no WhatsApp. */
  agentEnabled: boolean;
  autopilotAutoEnrich: boolean;
  autopilotAnalyzeTopN: number;
  autopilotSendPitches: boolean;
  /** Liga/desliga a cadência D3/D7 (o envio real continua exigindo dryRun=false). */
  cadenceEnabled: boolean;
  /** Teto diário de mensagens outbound (proteção contra ban do WhatsApp). */
  cadenceDailyCap: number;
  /** Humanização do envio: janelas, delays, pausa e tetos diários. */
  humanize: HumanizeSettings;
}

const DEFAULTS: Omit<AutomationSettings, "humanize"> = {
  schedulerEnabled: true,
  backupEnabled: true,
  backupIntervalHours: 24,
  typeformPollingEnabled: true,
  typeformIntervalMin: 5,
  whatsappAutoIntent: true,
  whatsappAutoPipeline: true,
  whatsappAutoFollowUp: true,
  whatsappAutoCreateLead: true,
  intentAi: true,
  agentEnabled: true,
  autopilotAutoEnrich: true,
  autopilotAnalyzeTopN: 3,
  autopilotSendPitches: false,
  cadenceEnabled: true,
  cadenceDailyCap: 60,
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

  const agentRaw = getSetting("automation_agent_enabled");
  const agentEnabled = agentRaw !== null ? agentRaw === "true" : DEFAULTS.agentEnabled;

  const waIntentRaw = getSetting("automation_whatsapp_auto_intent");
  const whatsappAutoIntent = waIntentRaw !== null ? waIntentRaw === "true" : DEFAULTS.whatsappAutoIntent;
  const waPipeRaw = getSetting("automation_whatsapp_auto_pipeline");
  const whatsappAutoPipeline = waPipeRaw !== null ? waPipeRaw === "true" : DEFAULTS.whatsappAutoPipeline;
  const waFollowRaw = getSetting("automation_whatsapp_auto_followup");
  const whatsappAutoFollowUp = waFollowRaw !== null ? waFollowRaw === "true" : DEFAULTS.whatsappAutoFollowUp;
  const waCreateRaw = getSetting("automation_whatsapp_auto_create_lead");
  const whatsappAutoCreateLead = waCreateRaw !== null ? waCreateRaw === "true" : DEFAULTS.whatsappAutoCreateLead;

  // Chave lida pelo intentService: `automation_intent_ai`.
  const intentAiRaw = getSetting("automation_intent_ai");
  const intentAi = intentAiRaw !== null && intentAiRaw !== "" ? intentAiRaw === "true" : DEFAULTS.intentAi;

  const enrichRaw = getSetting("automation_autopilot_auto_enrich");
  const autopilotAutoEnrich = enrichRaw !== null ? enrichRaw === "true" : DEFAULTS.autopilotAutoEnrich;
  const topNRaw = getSetting("automation_autopilot_analyze_top_n");
  const autopilotAnalyzeTopN = topNRaw !== null ? Math.max(0, Math.min(5, Math.floor(Number(topNRaw) || DEFAULTS.autopilotAnalyzeTopN))) : DEFAULTS.autopilotAnalyzeTopN;
  const sendRaw = getSetting("automation_autopilot_send_pitches");
  const autopilotSendPitches = sendRaw !== null ? sendRaw === "true" : DEFAULTS.autopilotSendPitches;

  const cadenceRaw = getSetting("automation_cadence_enabled");
  const cadenceEnabled = cadenceRaw !== null ? cadenceRaw === "true" : DEFAULTS.cadenceEnabled;
  const capRaw = getSetting("automation_cadence_daily_cap");
  const cadenceDailyCap = capRaw !== null && capRaw !== ""
    ? Math.max(0, Math.min(200, Math.floor(Number(capRaw) || 0)))
    : DEFAULTS.cadenceDailyCap;

  return {
    schedulerEnabled,
    backupEnabled,
    backupIntervalHours,
    typeformPollingEnabled,
    typeformIntervalMin,
    whatsappAutoIntent,
    whatsappAutoPipeline,
    whatsappAutoFollowUp,
    whatsappAutoCreateLead,
    intentAi,
    agentEnabled,
    autopilotAutoEnrich,
    autopilotAnalyzeTopN,
    autopilotSendPitches,
    cadenceEnabled,
    cadenceDailyCap,
    humanize: getHumanizeSettings(),
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
      "whatsappAutoIntent","whatsappAutoPipeline","whatsappAutoFollowUp","whatsappAutoCreateLead","intentAi","agentEnabled",
      "autopilotAutoEnrich","autopilotAnalyzeTopN","autopilotSendPitches","cadenceEnabled","cadenceDailyCap"
    ];
    try {
      if (body.humanize !== undefined) {
        if (typeof body.humanize !== "object" || body.humanize === null) {
          return res.status(400).json({ success: false, error: "humanize deve ser um objeto de configuração." });
        }
        saveHumanizeSettings(body.humanize as Record<string, unknown>);
      }
      for (const key of allowed) {
        if (body[key] !== undefined) {
          const val = body[key];
          // validação por chave
          if (["schedulerEnabled","backupEnabled","typeformPollingEnabled","whatsappAutoIntent","whatsappAutoPipeline","whatsappAutoFollowUp","whatsappAutoCreateLead","intentAi","agentEnabled","autopilotAutoEnrich","autopilotSendPitches","cadenceEnabled"].includes(key)) {
            if (typeof val !== "boolean") return res.status(400).json({ success: false, error: `${key} deve ser boolean.` });
          }
          if (key === "backupIntervalHours" || key === "typeformIntervalMin") {
            if (!Number.isFinite(Number(val)) || Number(val) <= 0) return res.status(400).json({ success: false, error: `${key} deve ser número >0.` });
          }
          if (key === "cadenceDailyCap") {
            if (!Number.isInteger(Number(val)) || Number(val) < 0 || Number(val) > 200) return res.status(400).json({ success: false, error: `${key} deve ser inteiro 0-200 (0 = só simulação).` });
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
      const status = err instanceof HumanizeSettingsError ? 400 : 500;
      res.status(status).json({ success: false, error: err?.message || "Falha ao salvar automações." });
    }
  });
}

export { getAutomationSettings };
