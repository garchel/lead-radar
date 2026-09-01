import { Express, Request, Response } from "express";
import { getProjects, getProjectById } from "../store/db";
import {
  createProject,
  updateProject,
  advanceProjectStage,
  concludeProject,
  removeProject,
  ensureProjectTypeformToken,
  isProjectStage,
} from "../projects/service";
import {
  buildProjectDevKit,
  buildProjectDevPrompt,
  setProjectDevRepo,
  submitProjectCode,
  updateProjectDevMessage,
  approveProjectCode,
  resetProjectDev,
} from "../projects/devKit";
import { ProjectStage } from "../store/types";
import { getTypeformFormBaseUrl } from "../config";
import { generateBriefingPdf } from "../briefing/pdf";
import { buildAgentRunbook } from "../projects/agentGuide";

export function registerProjectRoutes(app: Express) {
  app.get("/api/projects", (req: Request, res: Response) => {
    res.json({ success: true, projects: getProjects() });
  });

  app.get("/api/projects/:id", (req: Request, res: Response) => {
    const project = getProjectById(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    res.json({ success: true, project });
  });

  app.post("/api/projects", (req: Request, res: Response) => {
    const { leadId, name, priority, dueDate, type } = req.body || {};
    if (!leadId) {
      return res.status(400).json({ success: false, error: "leadId é obrigatório." });
    }
    try {
      const project = createProject({ leadId, name, priority, dueDate, type });
      res.status(201).json({ success: true, project });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Falha ao criar projeto." });
    }
  });

  app.patch("/api/projects/:id", (req: Request, res: Response) => {
    const patch = req.body || {};
    const allowed = [
      "name",
      "type",
      "stage",
      "status",
      "priority",
      "brief",
      "briefing",
      "tasks",
      "copy",
      "designNotes",
      "devNotes",
      "reviewNotes",
      "deployUrl",
      "githubRepoUrl",
      "repoOwner",
      "repoName",
      "previewUrl",
      "devStatus",
      "devMessage",
      "dueDate",
    ];
    const clean: Record<string, unknown> = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) clean[key] = patch[key];
    }
    try {
      const project = updateProject(req.params.id, clean);
      res.json({ success: true, project });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Falha ao atualizar projeto." });
    }
  });

  app.post("/api/projects/:id/stage", (req: Request, res: Response) => {
    const { stage } = req.body || {};
    if (!isProjectStage(stage)) {
      return res.status(400).json({ success: false, error: "Etapa inválida." });
    }
    try {
      const project = advanceProjectStage(req.params.id, stage as ProjectStage);
      res.json({ success: true, project });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err?.message || "Projeto não encontrado." });
    }
  });

  app.post("/api/projects/:id/conclude", (req: Request, res: Response) => {
    try {
      const project = concludeProject(req.params.id);
      res.json({ success: true, project });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err?.message || "Projeto não encontrado." });
    }
  });

  // Gera/garante o token de briefing e devolve o link personalizado do Typeform.
  app.post("/api/projects/:id/typeform-link", (req: Request, res: Response) => {
    try {
      const token = ensureProjectTypeformToken(req.params.id);
      const baseUrl = getTypeformFormBaseUrl();
      if (!baseUrl) {
        return res
          .status(400)
          .json({ success: false, error: "Typeform não configurado. Defina TYPEFORM_FORM_ID (ou TYPEFORM_FORM_URL) no .env." });
      }
      res.json({ success: true, token, url: `${baseUrl}?project_token=${encodeURIComponent(token)}` });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err?.message || "Projeto não encontrado." });
    }
  });

  app.delete("/api/projects/:id", (req: Request, res: Response) => {
    const project = getProjectById(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    removeProject(req.params.id);
    res.json({ success: true });
  });

  // GET /api/projects/:id/dev-kit — kit de dados + prompt para o agente de IA de código.
  app.get("/api/projects/:id/dev-kit", (req: Request, res: Response) => {
    try {
      const kit = buildProjectDevKit(req.params.id);
      const prompt = buildProjectDevPrompt(req.params.id);
      res.json({ success: true, prompt, kit });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err?.message || "Projeto não encontrado." });
    }
  });

  // GET /api/projects/:id/agent-runbook — guia do app + estado + passo a passo
  // para o bot de execução (evita análise da codebase a cada spawn).
  app.get("/api/projects/:id/agent-runbook", (req: Request, res: Response) => {
    try {
      const runbook = buildAgentRunbook(req.params.id);
      res.json(runbook);
    } catch (err: any) {
      res.status(404).json({ success: false, error: err?.message || "Projeto não encontrado." });
    }
  });

  // POST .../dev-repo — registra o repositório GitHub onde o agente está codando.
  app.post("/api/projects/:id/dev-repo", (req: Request, res: Response) => {
    const { repoUrl } = req.body || {};
    if (!repoUrl) return res.status(400).json({ success: false, error: "repoUrl é obrigatório." });
    try {
      const project = setProjectDevRepo(req.params.id, repoUrl);
      res.json({ success: true, project });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Falha ao registrar repositório." });
    }
  });

  // POST .../submit-code — agente notifica que o código está pronto (com preview).
  app.post("/api/projects/:id/submit-code", (req: Request, res: Response) => {
    const { repoUrl, previewUrl, message } = req.body || {};
    try {
      const project = submitProjectCode(req.params.id, { repoUrl, previewUrl, message });
      res.json({ success: true, project });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Falha ao registrar entrega do código." });
    }
  });

  // POST .../dev-message — grava uma notificação/mensagem do agente.
  app.post("/api/projects/:id/dev-message", (req: Request, res: Response) => {
    const { message } = req.body || {};
    try {
      const project = updateProjectDevMessage(req.params.id, message || "");
      res.json({ success: true, project });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || "Falha ao gravar mensagem." });
    }
  });

  // POST .../dev-approve — ser humano aprova o código entregue (guarda-limite).
  app.post("/api/projects/:id/dev-approve", (req: Request, res: Response) => {
    try {
      const project = approveProjectCode(req.params.id);
      res.json({ success: true, project });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err?.message || "Projeto não encontrado." });
    }
  });

  // POST .../dev-reset — volta a etapa desenvolvimento para "aguardando_agente".
  app.post("/api/projects/:id/dev-reset", (req: Request, res: Response) => {
    try {
      const project = resetProjectDev(req.params.id);
      res.json({ success: true, project });
    } catch (err: any) {
      res.status(404).json({ success: false, error: err?.message || "Projeto não encontrado." });
    }
  });

  // Gera o PDF do briefing do projeto para validação com o cliente.
  app.get("/api/projects/:id/briefing.pdf", async (req: Request, res: Response) => {
    const project = getProjectById(req.params.id);
    if (!project) return res.status(404).json({ success: false, error: "Projeto não encontrado." });
    try {
      const pdf = await generateBriefingPdf(project);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="briefing-${project.id}.pdf"`
      );
      res.send(pdf);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || "Falha ao gerar o PDF do briefing." });
    }
  });
}