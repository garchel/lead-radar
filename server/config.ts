/* ------------------------------------------------------------------ */
/*  Centralized runtime config for LeadRadar AI.                       */
/*  Values are read lazily (at call time) so they see variables        */
/*  loaded by `dotenv.config()` in server.ts.                          */
/* ------------------------------------------------------------------ */

/**
 * Gemini model used for all AI calls (search, analysis, pitches).
 *
 * Override via `GEMINI_MODEL` env var. Defaults to the "latest" Flash
 * alias, which hot-swaps to the newest stable Flash model automatically
 * (e.g. gemini-3.5-flash, gemini-3.6-flash, gemini-3.7-flash...).
 */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-flash-latest";
}

/**
 * Configuração do agendador de prospecção periódica.
 * - `enabled`: liga/desliga o agendador (default ligado; desligue com `LEADRADAR_SCHEDULER=off`).
 * - `maxLandingPagesPerDay`: guardrail de autonomia (máx. de LPs criadas/dia) — default 5.
 * - `maxLeadsPerRun`: limite de leads processados por execução do autopilot.
 */
/**
 * Configuração da integração Typeform (briefing de clientes).
 * - `accessToken`: token pessoal gerado em Typeform → Integrações → API.
 * - `formId`: ID do formulário de briefing (parte da URL do form).
 * Sem token, a integração reporta "não configurada" (não quebra o app).
 */
export function getTypeformConfig(): {
  accessToken: string;
  formId: string;
  configured: boolean;
} {
  const accessToken = process.env.TYPEFORM_ACCESS_TOKEN || "";
  const formId = process.env.TYPEFORM_FORM_ID || "";
  return {
    accessToken,
    formId,
    configured: Boolean(accessToken && formId),
  };
}

/**
 * URL base de compartilhamento do formulário de briefing, usada para montar
 * o link personalizado com o hidden field `project_token`.
 * Override via `TYPEFORM_FORM_URL`; default deriva do `TYPEFORM_FORM_ID`.
 */
export function getTypeformFormBaseUrl(): string {
  if (process.env.TYPEFORM_FORM_URL) return process.env.TYPEFORM_FORM_URL;
  const formId = process.env.TYPEFORM_FORM_ID || "";
  return formId ? `https://form.typeform.com/to/${formId}` : "";
}

/**
 * Config do polling automático de briefings do Typeform.
 * `TYPEFORM_SYNC_INTERVAL_MIN` define o intervalo em minutos (default 5);
 * `0` ou valor inválido desliga o polling.
 */
export function getTypeformSyncConfig(): { enabled: boolean; intervalMinutes: number } {
  const raw = Number(process.env.TYPEFORM_SYNC_INTERVAL_MIN ?? 5);
  const intervalMinutes = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  return { enabled: intervalMinutes > 0, intervalMinutes };
}

export function getSchedulerConfig(): {
  enabled: boolean;
  maxLandingPagesPerDay: number;
  maxLeadsPerRun: number;
} {
  return {
    enabled: process.env.LEADRADAR_SCHEDULER !== "off",
    maxLandingPagesPerDay: Number(process.env.LEADRADAR_MAX_LPS_PER_DAY) || 5,
    maxLeadsPerRun: Number(process.env.LEADRADAR_MAX_LEADS_PER_RUN) || 5,
  };
}

export type ProspectingProvider = "serpapi" | "gemini";

export function getSerpApiConfig(): {
  apiKey: string;
  configured: boolean;
  searchesPerMonth: number;
  throughputPerHour: number;
} {
  const apiKey = (process.env.SERPAPI_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  return {
    apiKey,
    configured: Boolean(apiKey),
    searchesPerMonth: Number(process.env.SERPAPI_SEARCHES_PER_MONTH) || 250,
    throughputPerHour: Number(process.env.SERPAPI_THROUGHPUT_PER_HOUR) || 50,
  };
}

export function getProspectingProvider(): ProspectingProvider {
  const raw = (process.env.PROSPECTING_PROVIDER || "").trim().toLowerCase();
  if (raw === "gemini" || raw === "serpapi") return raw as ProspectingProvider;
  // default: serpapi quando configurado, senão gemini
  return getSerpApiConfig().configured ? "serpapi" : "gemini";
}