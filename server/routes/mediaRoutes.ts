import express, { type Express, type Request, type Response } from "express";
import { aplicarImagemNoSlot, consentimentosDoLead, slotsDaPagina, type OrigemImagem } from "../services/mediaService";
import { pagesConfigured, publishPreviews } from "../services/pagesService";
import { previewsDir } from "../services/previewService";

/**
 * Entrada de imagens da prévia.
 *
 * POST /api/leads/:id/media?slot=hero&origem=cliente&autorizadoPor=Carlos&canal=whatsapp&texto=...
 *   corpo: bytes da imagem (Content-Type: image/jpeg|png|webp)
 *
 * A rota é registrada ANTES do `express.json` global (limite 100kb) para aceitar
 * upload binário de até 15 MB sem inflar o parser de toda a API.
 */
export function registerMediaRoutes(app: Express): void {
  app.post(
    "/api/leads/:id/media",
    express.raw({ type: ["image/*", "application/octet-stream"], limit: "15mb" }),
    async (req: Request, res: Response) => {
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!bytes.length) {
        return res.status(400).json({
          success: false,
          error: "corpo vazio: envie os bytes da imagem com Content-Type image/jpeg, image/png ou image/webp",
        });
      }

      const origem: OrigemImagem = String(req.query.origem || "cliente").toLowerCase() === "gerada" ? "gerada" : "cliente";
      const resultado = await aplicarImagemNoSlot(String(req.params.id), {
        slot: String(req.query.slot || ""),
        bytes,
        mime: String(req.headers["content-type"] || "image/jpeg"),
        origem,
        alt: req.query.alt ? String(req.query.alt) : undefined,
        consentimento: {
          autorizadoPor: req.query.autorizadoPor ? String(req.query.autorizadoPor) : undefined,
          canal: req.query.canal ? String(req.query.canal) : undefined,
          texto: req.query.texto ? String(req.query.texto) : undefined,
        },
      });

      if (!resultado.ok) {
        const status = resultado.slotsDisponiveis ? 400 : 404;
        return res.status(status).json({ success: false, error: resultado.motivo, slots: resultado.slotsDisponiveis });
      }

      // Publicar é opcional: quem já vai publicar depois não precisa pagar dois deploys.
      let publicacao: { ok: boolean; error?: string } | null = null;
      if (req.query.publicar === "1" && pagesConfigured()) {
        const r = await publishPreviews(previewsDir(), { timeoutMs: 240_000 });
        publicacao = { ok: r.ok, error: r.error };
      }

      return res.json({
        success: true,
        imagem: resultado.imagem,
        slots: resultado.slotsDisponiveis,
        publicUrl: resultado.publicUrl,
        publicacao,
      });
    },
  );

  app.get("/api/leads/:id/media", (req: Request, res: Response) => {
    const slots = slotsDaPagina(String(req.params.id));
    return res.json({ success: true, slots, consentimentos: consentimentosDoLead(String(req.params.id)) });
  });
}
