import { Express, Request, Response } from "express";
import {
  ALERT_COOLDOWN_MINUTES,
  ALERT_DAILY_CAP,
  listOwnerAlerts,
  maskPhone,
  ownerAlertEnabled,
  ownerAlertPhone,
  sendOwnerAlert,
  setOwnerAlertPhone,
  type OwnerAlertKind,
} from "../services/ownerAlertService";
import { getSetting, setSetting } from "../store/db";

const KINDS: OwnerAlertKind[] = [
  "ia_falhou",
  "envio_falhou",
  "resposta_bloqueada",
  "bot_cliente",
  "clara_falhou",
  "relatorio_mensal",
  "teste",
];

/**
 * Aviso no WhatsApp do Paulo quando o atendimento automático falha.
 *
 * O app dispara sozinho nos pontos de falha (IA sem texto, envio bloqueado,
 * rede de segurança sem resposta). Estes endpoints servem para configurar,
 * testar e principalmente para a Clara avisar quando é ELA que falhou.
 */
export function registerAlertRoutes(app: Express) {
  app.get("/api/alerts/owner", (_req: Request, res: Response) => {
    try {
      const telefone = ownerAlertPhone();
      return res.json({
        success: true,
        enabled: ownerAlertEnabled(),
        phone: maskPhone(telefone),
        configured: Boolean(telefone),
        cooldownMinutes: ALERT_COOLDOWN_MINUTES,
        dailyCap: ALERT_DAILY_CAP,
        sentToday: listOwnerAlerts(100).filter((a) => {
          const inicio = new Date();
          inicio.setHours(0, 0, 0, 0);
          return a.status === "sent" && new Date(a.sentAt).getTime() >= inicio.getTime();
        }).length,
        recent: listOwnerAlerts(10),
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao ler os avisos." });
    }
  });

  app.put("/api/alerts/owner", (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      if (body.enabled !== undefined) setSetting("owner_alert_enabled", body.enabled ? "true" : "false");

      if (body.phone !== undefined) {
        const digitos = String(body.phone).replace(/\D/g, "");
        if (digitos && digitos.length < 10) {
          return res.status(400).json({ success: false, error: "Telefone inválido: informe DDD e número." });
        }
        // Mesmo número da instância do bot não recebe: o gateway recusa mensagem
        // para o próprio número pareado.
        const instancia = String(getSetting("whatsapp_own_number") || process.env.WHATSAPP_OWN_NUMBER || "").replace(/\D/g, "");
        if (digitos && instancia && digitos === instancia) {
          return res.status(400).json({
            success: false,
            error: "Esse é o próprio número que envia as mensagens. Use o seu celular pessoal.",
          });
        }
        setOwnerAlertPhone(digitos);
      }

      return res.json({
        success: true,
        enabled: ownerAlertEnabled(),
        phone: maskPhone(ownerAlertPhone()),
        configured: Boolean(ownerAlertPhone()),
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || "Falha ao salvar o aviso." });
    }
  });

  // Usado pelo agente (Clara) quando ela é quem falha em responder
  app.post("/api/alerts/owner", async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const kind = (KINDS as string[]).includes(String(body.kind)) ? (body.kind as OwnerAlertKind) : "clara_falhou";
      const detail = String(body.detail || body.reason || "falha no atendimento").slice(0, 400);
      const resultado = await sendOwnerAlert({
        kind,
        detail,
        leadId: body.leadId ? String(body.leadId) : undefined,
        leadName: body.leadName ? String(body.leadName) : undefined,
        leadPhone: body.leadPhone ? String(body.leadPhone) : undefined,
      });
      return res.status(resultado.sent ? 200 : 200).json({ success: true, ...resultado });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao avisar." });
    }
  });

  // Botão "Enviar teste" do painel
  app.post("/api/alerts/owner/test", async (_req: Request, res: Response) => {
    try {
      const resultado = await sendOwnerAlert({
        kind: "teste",
        detail: "teste do aviso, sem problema nenhum com o atendimento agora",
      });
      return res.json({ success: true, ...resultado });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao enviar o teste." });
    }
  });
}
