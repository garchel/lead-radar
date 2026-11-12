import { Express, Request, Response } from "express";
import { startTunnel, stopTunnel, tunnelStatus, cloudflaredAvailable } from "../services/tunnelService";
import { resolvePublicBaseUrl } from "../services/previewService";

/**
 * Link público das prévias.
 *
 * O cliente abre a prévia de qualquer rede. Hoje isso é feito com túnel
 * `cloudflared` (URL efêmera) ou `PUBLIC_BASE_URL` (domínio próprio, quando
 * existir). O painel mostra qual base está em uso para não haver dúvida sobre o
 * que o cliente recebeu.
 */
export function registerTunnelRoutes(app: Express) {
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
