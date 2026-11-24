import { Express, Request, Response } from "express";
import { startTunnel, stopTunnel, tunnelStatus, cloudflaredAvailable } from "../services/tunnelService";
import { previewsDir, resolvePublicBaseUrl } from "../services/previewService";
import { pagesConfigured, pagesStatus, publishPreviews } from "../services/pagesService";
import { entregarPaginaDoLead, listarEntregasPendentes } from "../services/pageDeliveryService";

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

  /**
   * Entregas que o app NÃO conseguiu concluir.
   *
   * O app é o dono da entrega: só ele sabe se a página existe, se o link responde
   * 200 e se a última mensagem da conversa é nossa. Quando algum desses passos
   * falha, a entrega fica aqui — e é a única situação em que o agente pode mandar
   * o link por conta própria.
   */
  app.get("/api/previews/deliveries", (_req: Request, res: Response) => {
    try {
      const pendentes = listarEntregasPendentes();
      return res.json({ success: true, total: pendentes.length, pendentes });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao listar entregas." });
    }
  });

  /** Nova tentativa de entrega (o app tenta de novo, respeitando o guarda). */
  app.post("/api/previews/deliveries/:leadId/retry", async (req: Request, res: Response) => {
    try {
      // Sem aviso novo: o lead já foi avisado antes; aqui é só a segunda tentativa.
      const resultado = await entregarPaginaDoLead(String(req.params.leadId), { aviso: false });
      return res.status(resultado.ok ? 200 : 409).json({ success: resultado.ok, ...resultado });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao entregar." });
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
