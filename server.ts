import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { registerMcpRoutes } from "./server/mcpServer";
import { registerQueueRoutes } from "./server/jobs/queueRoutes";
import { registerLeadRoutes } from "./server/routes/leadRoutes";
import { registerLandingPageRoutes } from "./server/routes/landingPageRoutes";
import { registerProjectRoutes } from "./server/routes/projectRoutes";
import { registerTypeformRoutes } from "./server/routes/typeformRoutes";
import { registerEventRoutes } from "./server/routes/eventRoutes";
import { registerScheduleRoutes } from "./server/routes/scheduleRoutes";
import { registerCityRoutes } from "./server/routes/cityRoutes";
import { scheduler, ensureDefaultFollowUpSchedule } from "./server/scheduler/scheduler";
import { startTypeformPolling } from "./server/typeform/polling";
import { getSchedulerConfig, getSerpApiConfig, getProspectingProvider } from "./server/config";
import { analyzeLead, searchBusinesses } from "./server/services/prospectingService";
import { getSerpApiUsage, listSerpApiKeys, addSerpApiKey, deleteSerpApiKey, activateSerpApiKey, updateSerpApiKey, getLastSerpApiRaw } from "./server/services/serpApi";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

registerMcpRoutes(app);
registerQueueRoutes(app);
registerLeadRoutes(app);
registerLandingPageRoutes(app);
registerProjectRoutes(app);
registerTypeformRoutes(app);
registerEventRoutes(app);
registerScheduleRoutes(app);
registerCityRoutes(app);

app.get("/api/health", (_req, res) => {
  let hasSerpApiKey = Boolean((process.env.SERPAPI_API_KEY || "").trim());
  try {
    if (!hasSerpApiKey) hasSerpApiKey = listSerpApiKeys().length > 0;
  } catch {}
  // provider efetivo considera chaves cadastradas
  let provider = getProspectingProvider();
  try {
    if (listSerpApiKeys().length > 0) provider = "serpapi";
  } catch {}
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasGoogleMapsKey: Boolean(process.env.GOOGLE_MAPS_PLATFORM_KEY),
    hasSerpApiKey,
    prospectingProvider: provider,
  });
});

app.get("/api/prospecting/usage", (_req, res) => {
  try {
    const usage = getSerpApiUsage();
    let provider = getProspectingProvider();
    try {
      if (listSerpApiKeys().length > 0) provider = "serpapi";
    } catch {}
    res.json({ success: true, usage, provider });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Falha ao obter uso SerpAPI." });
  }
});

app.get("/api/prospecting/providers", (_req, res) => {
  const keys = (() => {
    try {
      return listSerpApiKeys();
    } catch {
      return [];
    }
  })();
  const serp = getSerpApiConfig();
  const effectiveConfigured = keys.length > 0 || serp.configured;
  res.json({
    success: true,
    providers: [
      {
        id: "serpapi",
        label: "SerpAPI (Google Maps real)",
        configured: effectiveConfigured,
        description: effectiveConfigured
          ? `SerpAPI real — ${serp.searchesPerMonth}/mês, ${serp.throughputPerHour}/h por chave. ${keys.length ? `${keys.length} chave(s) cadastrada(s).` : "via .env"} Apenas empresas reais.`
          : "SerpAPI não configurada — cadastre uma chave em Gerenciar chaves ou defina SERPAPI_API_KEY no .env",
      },
      {
        id: "gemini",
        label: "Gemini (IA + busca)",
        configured: Boolean(process.env.GEMINI_API_KEY),
        description: Boolean(process.env.GEMINI_API_KEY)
          ? "Gemini com Google Search grounding — pode falhar por cota 429"
          : "Gemini não configurado — defina GEMINI_API_KEY",
      },
    ],
    defaultProvider: getProspectingProvider(),
  });
});

// SerpAPI keys — gerenciar múltiplas chaves (free 250/mês cada)
app.get("/api/serpapi/keys", (_req, res) => {
  try {
    const keys = listSerpApiKeys();
    res.json({ success: true, keys });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Falha ao listar chaves." });
  }
});

app.post("/api/serpapi/keys", (req, res) => {
  const { apiKey, label, renewalDay, renewalDate } = req.body || {};
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return res.status(400).json({ success: false, error: "apiKey é obrigatória." });
  }
  try {
    const key = addSerpApiKey(apiKey, label, renewalDay, renewalDate);
    res.status(201).json({ success: true, key });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || "Falha ao adicionar chave." });
  }
});

app.patch("/api/serpapi/keys/:id", (req, res) => {
  const { label, renewalDay, renewalDate } = req.body || {};
  try {
    const key = updateSerpApiKey(req.params.id, { label, renewalDay, renewalDate });
    res.json({ success: true, key });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message || "Falha ao atualizar chave." });
  }
});

app.post("/api/serpapi/keys/:id/activate", (req, res) => {
  try {
    const key = activateSerpApiKey(req.params.id);
    res.json({ success: true, key });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err?.message || "Falha ao ativar chave." });
  }
});

app.delete("/api/serpapi/keys/:id", (req, res) => {
  try {
    deleteSerpApiKey(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err?.message || "Falha ao remover chave." });
  }
});

app.get("/api/serpapi/last-search", (_req, res) => {
  try {
    const { raw, meta } = getLastSerpApiRaw();
    if (!raw) return res.json({ success: true, hasData: false, raw: null, meta: null });
    res.json({ success: true, hasData: true, raw, meta });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Falha ao obter último retorno." });
  }
});

app.post("/api/search-businesses", async (req, res) => {
  const { location, state, category, query, filterNoWebsiteOnly, provider } = req.body || {};
  if (
    typeof location !== "string" || !location.trim() ||
    typeof state !== "string" || !/^[A-Za-z]{2}$/.test(state.trim()) ||
    typeof category !== "string" || !category.trim() ||
    typeof filterNoWebsiteOnly !== "boolean"
  ) {
    return res.status(400).json({
      success: false,
      error: "Informe location, state, category e filterNoWebsiteOnly válidos.",
    });
  }
  if (query !== undefined && typeof query !== "string") {
    return res.status(400).json({ success: false, error: "query deve ser uma string quando informado." });
  }
  if (provider !== undefined && !["serpapi", "gemini"].includes(provider)) {
    return res.status(400).json({ success: false, error: "provider deve ser 'serpapi' ou 'gemini'." });
  }

  try {
    const result = await searchBusinesses({
      location: location.trim(),
      state: state.trim().toUpperCase(),
      category: category.trim(),
      query,
      filterNoWebsiteOnly,
      provider,
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    const isQuota = /quota|cota|429|RESOURCE_EXHAUSTED/i.test(error?.message || "");
    return res.status(isQuota ? 429 : 502).json({
      success: false,
      error: error?.message || "Falha ao buscar empresas reais.",
      code: isQuota ? "quota_exceeded" : undefined,
    });
  }
});

app.post("/api/analyze-lead", async (req, res) => {
  const {
    businessName,
    category,
    city,
    state,
    address,
    websiteStatus,
    userNotes,
    phone,
    rating,
    reviewsCount,
    suggestedTicket,
    marketTier,
  } = req.body || {};

  if (
    typeof businessName !== "string" || !businessName.trim() ||
    typeof category !== "string" || !category.trim() ||
    typeof city !== "string" || !city.trim()
  ) {
    return res.status(400).json({
      success: false,
      error: "Informe businessName, category e city para gerar uma análise real.",
    });
  }
  if (address !== undefined && typeof address !== "string") {
    return res.status(400).json({ success: false, error: "address deve ser uma string quando informado." });
  }
  if (websiteStatus !== undefined && !["none", "social_only", "has_website"].includes(websiteStatus)) {
    return res.status(400).json({ success: false, error: "websiteStatus inválido." });
  }
  if (userNotes !== undefined && typeof userNotes !== "string") {
    return res.status(400).json({ success: false, error: "userNotes deve ser uma string quando informado." });
  }
  if (phone !== undefined && typeof phone !== "string") {
    return res.status(400).json({ success: false, error: "phone deve ser uma string quando informado." });
  }
  if (rating !== undefined && (typeof rating !== "number" || !Number.isFinite(rating))) {
    return res.status(400).json({ success: false, error: "rating deve ser um número quando informado." });
  }
  if (reviewsCount !== undefined && (!Number.isInteger(reviewsCount) || reviewsCount < 0)) {
    return res.status(400).json({ success: false, error: "reviewsCount deve ser um inteiro não negativo quando informado." });
  }

  try {
    const analysis = await analyzeLead({
      businessName: businessName.trim(),
      category: category.trim(),
      city: city.trim(),
      state: typeof state === "string" ? state.trim().toUpperCase() : undefined,
      address,
      websiteStatus,
      userNotes,
      phone,
      rating,
      reviewsCount,
      suggestedTicket: typeof suggestedTicket === "number" && suggestedTicket > 0 ? suggestedTicket : undefined,
      marketTier: typeof marketTier === "string" ? marketTier : undefined,
    });
    return res.json({ success: true, analysis });
  } catch (error: any) {
    return res.status(502).json({
      success: false,
      error: error?.message || "Falha ao gerar a análise por IA.",
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LeadRadar AI disponível em http://localhost:${PORT}`);
  });

  // Agenda padrão de recontatos autorizados (visível na UI mesmo com o
  // agendador desligado; dispara diariamente quando o scheduler está ativo).
  ensureDefaultFollowUpSchedule();

  if (getSchedulerConfig().enabled) {
    scheduler.start();
  } else {
    console.log("Agendador desativado (LEADRADAR_SCHEDULER=off).");
  }

  startTypeformPolling();
}

startServer();
