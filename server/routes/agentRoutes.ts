/**
 * Rotas do agente comercial de IA.
 *
 * - `GET  /api/agent/status`  — está ligado? o que ele vai dizer para cada lead?
 * - `GET  /api/agent/policy`  — pacotes, preço, prazo (fonte da verdade)
 * - `PUT  /api/agent/policy`  — ajusta preço/prazo/regras sem reiniciar
 * - `GET  /api/leads/:id/briefing` — dossiê que o agente recebe (auditável)
 * - `POST /api/agent/draft`   — mostra o que o agente escreveria, SEM enviar
 * - `PUT  /api/agent/settings` — liga/desliga o agente
 */

import { Express, Request, Response } from "express";
import { getLeadById, getSetting, setSetting } from "../store/db";
import { buildLeadBriefing } from "../services/briefingService";
import {
  deliveryLabel,
  formatBRL,
  formatPackagesShort,
  getCommercialPolicy,
  saveCommercialPolicy,
} from "../services/commercialPolicy";
import {
  agentEnabled,
  composeApproachMessage,
  composeReplyMessage,
} from "../services/salesAgentService";
import { generateLeadPreview, generateLeadPreviewCached, previewExists, previewSlug, previewsDir, resolvePreviewUrl, resolvePublicBaseUrl } from "../services/previewService";
import { pagesConfigured, publishPreviews } from "../services/pagesService";
import { buildPalettePreview, sendPalettePreview } from "../services/paletteService";
import {
  describeWarmup,
  getWarmupState,
  saveWarmupSettings,
} from "../services/warmupService";

export function registerAgentRoutes(app: Express) {
  app.get("/api/agent/status", (_req: Request, res: Response) => {
    const policy = getCommercialPolicy();
    const cheapest = policy.packages[0];
    let autoProspect = false;
    try {
      const raw = getSetting("autopilot_settings");
      autoProspect = raw ? Boolean(JSON.parse(raw)?.autoProspect) : false;
    } catch {
      autoProspect = false;
    }
    return res.json({
      success: true,
      enabled: agentEnabled(),
      autoProspect,
      /** Quem responde o WhatsApp: o bot Clara ou o app (nunca os dois). */
      ownership: {
        whatsapp: agentEnabled() ? "app" : "bot:clara",
        fallbackEnabled: getSetting("automation_agent_fallback") !== "false",
        fallbackMinutes: Number(getSetting("automation_agent_fallback_minutes")) || 6,
      },
      policy: {
        packages: formatPackagesShort(policy),
        fromPrice: formatBRL(cheapest.price),
        delivery: deliveryLabel(policy),
        previewFree: policy.previewFree,
        discountAllowed: policy.discountAllowed,
      },
    });
  });

  app.get("/api/agent/policy", (_req: Request, res: Response) => {
    return res.json({ success: true, policy: getCommercialPolicy() });
  });

  app.put("/api/agent/policy", (req: Request, res: Response) => {
    const body = req.body || {};
    // Validação dura: preço é o único campo em que errar quebra a confiança
    // comercial (o bot cotaria errado para o cliente).
    if (body.packages !== undefined) {
      if (!Array.isArray(body.packages) || body.packages.length === 0) {
        return res.status(400).json({ success: false, error: "`packages` precisa ser uma lista com ao menos um pacote." });
      }
      for (const p of body.packages) {
        const price = Number(p?.price);
        if (!Number.isFinite(price) || price <= 0) {
          return res.status(400).json({ success: false, error: "Cada pacote precisa de `price` numérico maior que zero." });
        }
      }
    }
    if (body.deliveryDays !== undefined) {
      if (!Array.isArray(body.deliveryDays) || body.deliveryDays.length !== 2) {
        return res.status(400).json({ success: false, error: "`deliveryDays` deve ser [mínimo, máximo]." });
      }
      const [min, max] = body.deliveryDays.map((d: unknown) => Number(d));
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) {
        return res.status(400).json({ success: false, error: "`deliveryDays` inválido (min > 0 e max ≥ min)." });
      }
    } else if (body.price !== undefined) {
      // Aceita atalho: mudar só o preço-base do pacote mais barato.
      const policy = getCommercialPolicy();
      const price = Math.round(Number(body.price));
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({ success: false, error: "`price` inválido." });
      }
      const packages = policy.packages.map((p, index) => (index === 0 ? { ...p, price } : p));
      const saved = saveCommercialPolicy({ packages });
      return res.json({ success: true, policy: saved });
    }

    const saved = saveCommercialPolicy(body);
    return res.json({ success: true, policy: saved });
  });

  app.get("/api/warmup", (_req: Request, res: Response) => {
    const state = getWarmupState();
    return res.json({ success: true, state, description: describeWarmup(state) });
  });

  app.put("/api/warmup", (req: Request, res: Response) => {
    const body = req.body || {};
    if (body.startCap !== undefined && (!Number.isFinite(Number(body.startCap)) || Number(body.startCap) < 1)) {
      return res.status(400).json({ success: false, error: "`startCap` deve ser um número >= 1." });
    }
    if (body.maxCap !== undefined && (!Number.isFinite(Number(body.maxCap)) || Number(body.maxCap) < 1)) {
      return res.status(400).json({ success: false, error: "`maxCap` deve ser um número >= 1." });
    }
    const settings = saveWarmupSettings(body);
    const state = getWarmupState();
    return res.json({ success: true, settings, state, description: describeWarmup(state) });
  });

  app.put("/api/agent/settings", (req: Request, res: Response) => {
    const enabled = req.body?.enabled;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, error: "Informe `enabled` (true/false)." });
    }
    setSetting("automation_agent_enabled", enabled ? "true" : "false");
    return res.json({ success: true, enabled: agentEnabled() });
  });

  app.get("/api/leads/:id/briefing", (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    const briefing = buildLeadBriefing(lead);
    return res.json({
      success: true,
      briefing: {
        leadId: briefing.leadId,
        displayName: briefing.displayName,
        objective: briefing.objective,
        objectiveText: briefing.objectiveText,
        facts: briefing.facts,
        losses: briefing.losses,
        forbidden: briefing.forbidden,
        missingInfo: briefing.missingInfo,
        attempts: briefing.attempts,
        pipeline: briefing.pipeline,
        history: briefing.history,
      },
      prompt: briefing.prompt,
    });
  });

  /**
   * Prévia da primeira tela — o que o agente promete quando o lead diz
   * "pode mandar". Determinística (cadastro + ficha), sem custo de IA.
   */
  /**
   * Paleta antes da prévia.
   *
   * O lead aprova a direção de cor enquanto a página é montada. Evita gastar a
   * cartada da prévia num rumo que ele não queria.
   */
  app.get("/api/leads/:id/palette", (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    try {
      const montada = buildPalettePreview(lead.id);
      return res.json({ success: Boolean(montada.colors.length), paleta: montada.colors, texto: montada.text, aviso: montada.detail || null });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao montar a paleta." });
    }
  });

  app.post("/api/leads/:id/palette", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    try {
      const resultado = await sendPalettePreview(lead.id, { forcar: Boolean((req.body || {}).forcar) });
      return res.json({
        success: resultado.sent,
        paleta: resultado.colors,
        texto: resultado.text,
        comunicacao: resultado.communicationId || null,
        aviso: resultado.sent ? null : resultado.detail || "Nada enviado.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao enviar a paleta." });
    }
  });

  app.post("/api/leads/:id/preview", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    try {
      const preview = await generateLeadPreviewCached(lead);

      // Publica no Pages quando configurado: o link precisa estar no ar ANTES de
      // ir para o cliente, senão ele abre um 404.
      let publicação: { ok: boolean; url: string | null; error?: string } | null = null;
      if (pagesConfigured()) {
        publicação = await publishPreviews(previewsDir());
      }

      const publicUrl = resolvePreviewUrl(preview.slug);
      return res.json({
        success: true,
        preview: { ...preview, publicUrl },
        publicação,
        aviso: publicUrl
          ? null
          : "Sem base pública (Pages, túnel ou rede local): a prévia existe no servidor, mas o link não abre no cliente. O link NÃO deve ser enviado.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao gerar a prévia." });
    }
  });

  app.get("/api/leads/:id/preview", (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    if (!previewExists(lead.id)) {
      return res.status(404).json({ success: false, error: "Prévia ainda não gerada (POST para gerar)." });
    }
    const slug = previewSlug(lead);
    return res.json({
      success: true,
      url: `/previews/${lead.id}.html`,
      slug,
      publicUrl: resolvePreviewUrl(slug),
      fonte: resolvePublicBaseUrl().source,
    });
  });

  /**
   * Rascunho sem envio: serve para o Paulo revisar a voz do agente antes de
   * soltar a base. `?kind=reply&text=...` simula uma resposta do lead.
   */
  app.post("/api/agent/draft", async (req: Request, res: Response) => {
    const leadId = String(req.body?.leadId || "").trim();
    const lead = leadId ? getLeadById(leadId) : undefined;
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado (informe `leadId`)." });

    const kind = req.body?.kind === "reply" ? "reply" : "approach";
    try {
      if (kind === "reply") {
        const text = String(req.body?.text || "").trim() || "Quanto custa?";
        const composed = await composeReplyMessage(lead, text);
        return res.json({ success: true, kind, composed, inbound: text });
      }
      const angle = req.body?.angle === "prova" ? "prova" : req.body?.angle === "prazo" ? "prazo" : "abertura";
      const composed = await composeApproachMessage(lead, angle);
      return res.json({ success: true, kind, angle, composed });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao gerar o rascunho." });
    }
  });
}
