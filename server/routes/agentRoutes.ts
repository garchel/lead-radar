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
import { getLeadById, getProjects, getSetting, setSetting, upsertLead } from "../store/db";
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
import { buildPalettePreview, publishPaletteCard, sendPalettePreview } from "../services/paletteService";
import { generateProposalPdf, proposalFileName, publishProposal } from "../services/proposalService";
import { deliverWhatsAppMedia } from "../services/contactService";
import { generateMonthlyReportPdf, monthlyNumbers, monthlyReportFileName } from "../services/monthlyReportService";
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
  app.get("/api/leads/:id/palette", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    try {
      const montada = buildPalettePreview(lead.id);
      // ?imagem=1 desenha e publica o cartão sem enviar (revisão e teste).
      const querImagem = String(req.query.imagem || "") === "1";
      const cartao = querImagem && montada.colors.length ? await publishPaletteCard(lead) : null;
      return res.json({
        success: Boolean(montada.colors.length),
        paleta: montada.colors,
        texto: montada.text,
        imagem: cartao?.publicUrl || null,
        arquivo: cartao?.fileName || null,
        aviso: montada.detail || null,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao montar a paleta." });
    }
  });

  app.post("/api/leads/:id/palette", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    try {
      const corpo = req.body || {};
      const resultado = await sendPalettePreview(lead.id, {
        forcar: Boolean(corpo.forcar),
        formato: corpo.formato === "imagem" ? "imagem" : "texto",
      });
      return res.json({
        success: resultado.sent,
        paleta: resultado.colors,
        texto: resultado.text,
        imagem: resultado.imageUrl || null,
        comunicacao: resultado.communicationId || null,
        aviso: resultado.sent ? null : resultado.detail || "Nada enviado.",
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao enviar a paleta." });
    }
  });

  /**
   * Proposta em PDF — o documento que o cliente encaminha para quem decide.
   * `?download=1` força o download; sem isso abre no navegador.
   */
  app.get("/api/leads/:id/proposal.pdf", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    try {
      const preview = resolvePreviewUrl(previewSlug(lead));
      const pdf = await generateProposalPdf(lead, {
        packageId: typeof req.query.pacote === "string" ? req.query.pacote : undefined,
        previewUrl: req.query.previa === "0" ? null : preview,
      });
      const nome = proposalFileName(lead);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${String(req.query.download || "") === "1" ? "attachment" : "inline"}; filename="${nome}"`
      );
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res.send(pdf);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao gerar a proposta." });
    }
  });

  /**
   * Fila de relatórios do mês: quem já tem site no ar e merece relatório.
   *
   * Sem isso o relatório morre na teoria: ninguém lembra de gerar cliente por
   * cliente. O cron mensal lê esta lista e manda o resumo para o Paulo, que
   * encaminha (envio automático ao cliente ainda exige revisão humana).
   */
  app.get("/api/reports/monthly", (req: Request, res: Response) => {
    try {
      const mes = typeof req.query.mes === "string" && /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : null;
      const referencia = mes ? new Date(`${mes}-01T12:00:00`) : new Date();
      const projetos = getProjects().filter((pr) => !pr.archived && (pr.stage === "deploy" || Boolean(pr.deployUrl)));
      const clientes = projetos
        .map((pr) => {
          const lead = pr.leadId ? getLeadById(pr.leadId) : undefined;
          if (!lead) return null;
          const numeros = monthlyNumbers(lead, referencia);
          return {
            leadId: lead.id,
            nome: String(lead.name || "").split(" — ")[0],
            projeto: pr.name,
            noAr: Boolean(pr.deployUrl),
            recebidas: numeros.recebidas,
            respondidas: numeros.respondidas,
            tempoRespostaMin: numeros.tempoRespostaMin,
            relatorio: `${resolvePublicBaseUrl().baseUrl || "http://localhost:3000"}/api/leads/${lead.id}/monthly-report.pdf`,
          };
        })
        .filter(Boolean);
      return res.json({
        success: true,
        periodo: referencia.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
        total: clientes.length,
        clientes,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao montar a fila de relatórios." });
    }
  });

  /** Relatório mensal do cliente (PDF). `?mes=2026-11` escolhe o período. */
  app.get("/api/leads/:id/monthly-report.pdf", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    try {
      const mes = typeof req.query.mes === "string" ? /^\d{4}-\d{2}$/.test(req.query.mes) ? req.query.mes : null : null;
      const referencia = mes ? new Date(`${mes}-01T12:00:00`) : new Date();
      const pdf = await generateMonthlyReportPdf(lead, referencia);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${monthlyReportFileName(lead, referencia)}"`);
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res.send(pdf);
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao gerar o relatório." });
    }
  });

  /**
   * Foto enviada pelo cliente (micro-compromisso antes da prévia).
   *
   * Aceita URL pública: o cliente manda o link do Instagram/post e a imagem entra
   * na frente da fila de imagens, como "enviada pelo cliente", virando hero.
   */
  app.post("/api/leads/:id/brand-image", (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    const url = String((req.body || {}).url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return res.status(400).json({ success: false, error: "Informe uma URL http(s) da imagem." });
    }
    try {
      const snapshot = lead.brandSnapshot || {
        version: 1,
        createdAt: new Date().toISOString(),
        source: "manual" as const,
        query: lead.name,
        profiles: {},
        palette: [],
        tone: [],
        imagery: [],
        summary: "",
        confidence: 0.5,
      };
      const imagery = [{ url, description: "Foto enviada pelo cliente" }, ...(snapshot.imagery || [])].slice(0, 8);
      const atualizado = upsertLead({ ...lead, brandSnapshot: { ...snapshot, imagery } });
      return res.json({ success: true, totalImagens: imagery.length, brandSnapshot: atualizado?.brandSnapshot });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao salvar a imagem." });
    }
  });

  /**
   * Envia a proposta como DOCUMENTO no WhatsApp.
   *
   * É o formato que o cliente encaminha para quem decide. Passa pelo portão do
   * texto (janela 7–20h, pausa, tetos) igual a qualquer mensagem.
   */
  app.post("/api/leads/:id/proposal", async (req: Request, res: Response) => {
    const lead = getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: "Lead não encontrado." });
    if (!lead.phone) return res.status(400).json({ success: false, error: "Lead sem telefone." });
    try {
      const corpo = req.body || {};
      const publicacao = await publishProposal(lead, {
        packageId: typeof corpo.pacote === "string" ? corpo.pacote : undefined,
        previewUrl: resolvePreviewUrl(previewSlug(lead)),
      });
      if (!publicacao.publicUrl) {
        return res.status(400).json({ success: false, error: "Proposta gerada, mas sem URL pública para o gateway baixar.", publicação: publicacao });
      }

      const legenda = String(corpo.legenda || "").trim() ||
        `Te mandei a proposta em PDF, dá para ler com calma e mostrar para quem decide.\n\nQualquer dúvida me chama por aqui.`;
      const envio = await deliverWhatsAppMedia(
        lead.id,
        String(lead.phone).replace(/\D/g, ""),
        legenda,
        { url: publicacao.publicUrl, fileName: publicacao.fileName, mimetype: "application/pdf" },
        undefined,
        "reply"
      );

      return res.json({
        success: envio.status === "sent",
        enviado: envio.status === "sent",
        arquivo: publicacao.fileName,
        url: publicacao.publicUrl,
        comunicacao: envio.communicationId || null,
        aviso: envio.status === "sent" ? null : envio.detail,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Falha ao enviar a proposta." });
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
