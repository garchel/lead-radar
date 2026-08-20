import { Express, Request, Response } from "express";
import { getLandingPages, getLandingPageById, getLeadById } from "../store/db";
import {
  createLandingPageRecord,
  approveLandingPage,
  rejectLandingPage,
  deployLandingPage,
  resolveLandingPageHtml,
} from "../landingPage/service";

export function registerLandingPageRoutes(app: Express) {
  app.get("/api/landing-pages", (req: Request, res: Response) => {
    res.json({ success: true, landingPages: getLandingPages() });
  });

  app.get("/api/landing-pages/:id", (req: Request, res: Response) => {
    const lp = getLandingPageById(req.params.id);
    if (!lp) return res.status(404).json({ success: false, error: "Landing page não encontrada." });
    res.json({ success: true, landingPage: lp });
  });

  // Create a landing page from a lead id + optional concept
  app.post("/api/landing-pages", (req: Request, res: Response) => {
    const { leadId, concept } = req.body || {};
    const lead = getLeadById(leadId);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    const lp = createLandingPageRecord(lead, concept);
    res.status(201).json({ success: true, landingPage: lp });
  });

  // Approve / reject / deploy workflow
  app.post("/api/landing-pages/:id/approve", (req: Request, res: Response) => {
    const lp = approveLandingPage(req.params.id);
    if (!lp) return res.status(404).json({ success: false, error: "Landing page não encontrada." });
    res.json({ success: true, landingPage: lp });
  });

  app.post("/api/landing-pages/:id/reject", (req: Request, res: Response) => {
    const lp = rejectLandingPage(req.params.id);
    if (!lp) return res.status(404).json({ success: false, error: "Landing page não encontrada." });
    res.json({ success: true, landingPage: lp });
  });

  app.post("/api/landing-pages/:id/deploy", async (req: Request, res: Response) => {
    try {
      const lp = await deployLandingPage(req.params.id);
      if (!lp) return res.status(404).json({ success: false, error: "Landing page não encontrada." });
      res.json({ success: true, landingPage: lp });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Falha ao publicar." });
    }
  });

  // Serve the generated HTML (public-facing URL)
  app.get("/landing-pages/:id", (req: Request, res: Response) => {
    const { html } = resolveLandingPageHtml(req.params.id);
    if (!html) return res.status(404).send("Landing page não encontrada.");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });
}
