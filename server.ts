import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { registerMcpRoutes } from "./server/mcpServer";
import { registerQueueRoutes } from "./server/jobs/queueRoutes";
import { registerLeadRoutes } from "./server/routes/leadRoutes";
import { registerLandingPageRoutes } from "./server/routes/landingPageRoutes";
import { registerEventRoutes } from "./server/routes/eventRoutes";
import { registerScheduleRoutes } from "./server/routes/scheduleRoutes";
import { scheduler, ensureDefaultFollowUpSchedule } from "./server/scheduler/scheduler";
import { getSchedulerConfig } from "./server/config";
import { analyzeLead, searchBusinesses } from "./server/services/prospectingService";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

registerMcpRoutes(app);
registerQueueRoutes(app);
registerLeadRoutes(app);
registerLandingPageRoutes(app);
registerEventRoutes(app);
registerScheduleRoutes(app);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasGoogleMapsKey: Boolean(process.env.GOOGLE_MAPS_PLATFORM_KEY),
  });
});

app.post("/api/search-businesses", async (req, res) => {
  const { location, state, category, query, filterNoWebsiteOnly } = req.body || {};
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

  try {
    const result = await searchBusinesses({
      location: location.trim(),
      state: state.trim().toUpperCase(),
      category: category.trim(),
      query,
      filterNoWebsiteOnly,
    });
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(502).json({
      success: false,
      error: error?.message || "Falha ao buscar empresas reais.",
    });
  }
});

app.post("/api/analyze-lead", async (req, res) => {
  const {
    businessName,
    category,
    city,
    address,
    websiteStatus,
    userNotes,
    phone,
    rating,
    reviewsCount,
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
      address,
      websiteStatus,
      userNotes,
      phone,
      rating,
      reviewsCount,
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
}

startServer();
