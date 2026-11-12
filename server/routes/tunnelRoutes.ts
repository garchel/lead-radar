import { Express, Request, Response } from "express";
import { startTunnel, stopTunnel, tunnelStatus, cloudflaredAvailable } from "../services/tunnelService";
import { previewsDir, resolvePublicBaseUrl } from "../services/previewService";
import { pagesConfigured, pagesStatus, publishPreviews } from "../services/pagesService";

/**
 * Link público das prévias.
 *
 * O cliente abre a prévia de qualquer rede. Hoje isso é feito com túnel
 * `cloudflared` (URL efêmera) ou `PUBLIC_BASE_URL` (domínio próprio, quando
 * existir). O painel mostra qual base está em uso para não haver dúvida sobre o
 * que o cliente recebeu.
 */
export function registerTunnelRoutes(app: Express) {
  /** Estado do link público: Pages (estável), túnel (efêmero) ou rede local. */
  app.get("/api/previews/public", async (_req: Request, res: Response) => {
    try {
      const base = resolvePublicBaseUrl();
      const pages = pagesStatus();
      return res.json({ success: true, base, pages, tunnel: tunnelStatus() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao ler o link público." });
    }
  });

  /** Publica todas as prévias no Cloudflare Pages (1 deploy por chamada). */
  app.post("/api/previews/publish", async (_req: Request, res: Response) => {
    if (!pagesConfigured()) {
      return res.status(400).json({
        success: false,
        error: "Cloudflare Pages não configurado: defina CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN e CF_PAGES_PROJECT no .env.",
      });
    }
    try {
      const resultado = await publishPreviews(previewsDir());
      return res.json({ success: resultado.ok, publicacao: resultado, base: resolvePublicBaseUrl(), pages: pagesStatus() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao publicar." });
    }
  });

  app.get("/api/tunnel", (_req: Request, res: Response) => {
    try {
      const status = tunnelStatus();
      const base = resolvePublicBaseUrl();
      return res.json({
        success: true,
        available: cloudflaredAvailable(),
        tunnel: status,
        previewBase: base,
        // O link que vai no WhatsApp depende da base resolvida.
        previewExample: base.baseUrl ? `${base.baseUrl}/previews/<lead>.html` : null,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao ler o túnel." });
    }
  });

  app.post("/api/tunnel/start", async (_req: Request, res: Response) => {
    try {
      const status = await startTunnel();
      const base = resolvePublicBaseUrl();
      return res.json({ success: status.running, tunnel: status, previewBase: base });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao subir o túnel." });
    }
  });

  app.post("/api/tunnel/stop", (_req: Request, res: Response) => {
    try {
      const status = stopTunnel();
      return res.json({ success: true, tunnel: status, previewBase: resolvePublicBaseUrl() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao parar o túnel." });
    }
  });
}
