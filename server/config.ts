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