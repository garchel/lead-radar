import { Express, Request, Response } from "express";
import {
  addKnowledge,
  botStats,
  createBotClient,
  deleteKnowledgeDoc,
  getBotClient,
  isBotPaused,
  knowledgeStats,
  listBotClients,
  listBotMessages,
  listKnowledgeDocs,
  listRoutableBots,
  updateBotClient,
} from "../services/botKnowledgeService";
import {
  answerEscalation,
  listEscalations,
  pendingEscalation,
  testBotQuestion,
  toggleHandoff,
} from "../services/botConversationService";
import {
  createSubscription,
  getSubscriptionBySubject,
  listSubscriptions,
  markSubscriptionPaid,
  mrrSummary,
  setSubscriptionAmount,
  updateSubscriptionStatus,
  type SubscriptionStatus,
} from "../services/subscriptionService";
import { getSetting } from "../store/db";
import { fetchGatewayInstances } from "../services/whatsappGateway";

/**
 * Bot de WhatsApp vendido ao cliente final (R$ 649 + R$ 150/mês).
 *
 * Aqui vive o que o operador (Paulo) precisa: cadastrar cliente, colar a base de
 * conhecimento, testar perguntas, ver conversas/escaladas e controlar a
 * mensalidade. O atendimento em si está em `botConversationService`.
 */
export function registerBotRoutes(app: Express) {
  const falha = (res: Response, error: any, padrao: string) =>
    res.status(400).json({ success: false, error: error?.message || padrao });

  // -----------------------------------------------------------------
  // Visão geral (MRR, clientes, escaladas em aberto, estado da IA)
  // -----------------------------------------------------------------
  app.get("/api/bot/overview", (_req: Request, res: Response) => {
    try {
      const clientes = listBotClients();
      const resumo = mrrSummary();
      const escaladasAbertas = clientes.reduce((total, c) => {
        try {
          return total + listEscalations(c.id, 200).filter((e) => !e.answeredAt).length;
        } catch {
          return total;
        }
      }, 0);

      let aiError: { at: string; quota: boolean; message: string } | null = null;
      try {
        const raw = getSetting("bot_last_ai_error");
        if (raw) aiError = JSON.parse(raw);
      } catch {
        aiError = null;
      }

      return res.json({
        success: true,
        mrr: resumo,
        clients: {
          total: clientes.length,
          active: clientes.filter((c) => c.status === "active").length,
          withoutKnowledge: clientes.filter((c) => knowledgeStats(c.id).chunks === 0).length,
          pausedByHandoff: clientes.filter((c) => isBotPaused(c)).length,
        },
        openEscalations: escaladasAbertas,
        aiError,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao ler a visão do bot." });
    }
  });

  // -----------------------------------------------------------------
  // Instâncias disponíveis no gateway (ajuda a escolher a do cliente)
  // -----------------------------------------------------------------
  app.get("/api/bot/instances", async (_req: Request, res: Response) => {
    try {
      const instancias = await fetchGatewayInstances();
      const usadas = new Set(listRoutableBots().map((c) => (c.instance || "").toLowerCase()));
      const lista = (Array.isArray(instancias) ? instancias : []).map((item: any) => {
        const nome = String(item?.name || item?.instanceName || item?.id || item?.instance || "").trim();
        return { name: nome, state: item?.state || item?.status || null, inUse: usadas.has(nome.toLowerCase()) };
      });
      return res.json({ success: true, instances: lista });
    } catch (error: any) {
      return res.json({ success: true, instances: [], error: error?.message || "Gateway inacessível." });
    }
  });

  // -----------------------------------------------------------------
  // Clientes do bot
  // -----------------------------------------------------------------
  app.get("/api/bot/clients", (_req: Request, res: Response) => {
    try {
      const clientes = listBotClients().map((c) => ({
        ...c,
        paused: isBotPaused(c),
        knowledge: knowledgeStats(c.id),
        stats: botStats(c.id),
        subscription: getSubscriptionBySubject("bot", c.id) || null,
        pendingQuestion: pendingEscalation(c.id)?.question || null,
      }));
      return res.json({ success: true, clients: clientes });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao listar clientes do bot." });
    }
  });

  app.post("/api/bot/clients", (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const nome = String(body.name || "").trim();
      if (!nome) return res.status(400).json({ success: false, error: "Informe o nome do cliente." });

      const instancia = String(body.instance || "").trim();
      if (instancia) {
        const jaUsada = listBotClients().find(
          (c) => (c.instance || "").toLowerCase() === instancia.toLowerCase() && c.status === "active"
        );
        if (jaUsada) {
          return res.status(409).json({
            success: false,
            error: `A instância "${instancia}" já pertence a ${jaUsada.name}.`,
          });
        }
      }

      const cliente = createBotClient({
        name: nome,
        ownerPhone: body.ownerPhone,
        instance: instancia || undefined,
        setupPrice: body.setupPrice,
        monthlyPrice: body.monthlyPrice,
        minScore: body.minScore,
      });

      // Assinatura nasce junto: é ela que gera MRR e alerta de vencimento.
      let assinatura = null;
      if (Number(cliente.monthlyPrice) > 0) {
        assinatura = createSubscription({
          subjectType: "bot",
          subjectId: cliente.id,
          plan: `Bot WhatsApp — ${cliente.name}`,
          amount: Number(cliente.monthlyPrice),
          status: "active",
          notes: `Implementação R$ ${cliente.setupPrice}`,
        });
        updateBotClient(cliente.id, { subscriptionId: assinatura.id });
      }

      return res.status(201).json({ success: true, client: getBotClient(cliente.id), subscription: assinatura });
    } catch (error: any) {
      return falha(res, error, "Falha ao criar cliente do bot.");
    }
  });

  app.get("/api/bot/clients/:id", (req: Request, res: Response) => {
    const cliente = getBotClient(req.params.id);
    if (!cliente) return res.status(404).json({ success: false, error: "Cliente do bot não encontrado." });
    return res.json({
      success: true,
      client: { ...cliente, paused: isBotPaused(cliente) },
      knowledge: knowledgeStats(cliente.id),
      docs: listKnowledgeDocs(cliente.id),
      stats: botStats(cliente.id),
      messages: listBotMessages(cliente.id, 60),
      escalations: listEscalations(cliente.id, 30),
      subscription: getSubscriptionBySubject("bot", cliente.id) || null,
    });
  });

  app.patch("/api/bot/clients/:id", (req: Request, res: Response) => {
    try {
      const atual = getBotClient(req.params.id);
      if (!atual) return res.status(404).json({ success: false, error: "Cliente do bot não encontrado." });
      const body = req.body || {};

      if (body.instance !== undefined) {
        const instancia = String(body.instance || "").trim();
        const conflito = listBotClients().find(
          (c) => c.id !== atual.id && (c.instance || "").toLowerCase() === instancia.toLowerCase() && instancia
        );
        if (conflito) {
          return res.status(409).json({ success: false, error: `A instância "${instancia}" já é de ${conflito.name}.` });
        }
      }

      const atualizado = updateBotClient(atual.id, {
        name: body.name !== undefined ? String(body.name).trim() : atual.name,
        ownerPhone: body.ownerPhone !== undefined ? String(body.ownerPhone).replace(/\D/g, "") : atual.ownerPhone,
        instance: body.instance !== undefined ? String(body.instance).trim() || undefined : atual.instance,
        setupPrice: body.setupPrice !== undefined ? Math.round(Number(body.setupPrice)) || 0 : atual.setupPrice,
        monthlyPrice: body.monthlyPrice !== undefined ? Math.round(Number(body.monthlyPrice)) || 0 : atual.monthlyPrice,
        status: body.status === "paused" ? "paused" : body.status === "active" ? "active" : atual.status,
        minScore: body.minScore !== undefined ? Number(body.minScore) : atual.minScore,
        notes: body.notes !== undefined ? String(body.notes) : atual.notes,
      });

      // Reflete o novo valor na assinatura (senão o MRR mente).
      if (body.monthlyPrice !== undefined && Number(atualizado?.monthlyPrice) > 0) {
        const assinatura = getSubscriptionBySubject("bot", atual.id);
        if (assinatura) {
          setSubscriptionAmount(assinatura.id, Number(atualizado?.monthlyPrice));
        } else {
          createSubscription({
            subjectType: "bot",
            subjectId: atual.id,
            plan: `Bot WhatsApp — ${atualizado?.name || atual.name}`,
            amount: Number(atualizado?.monthlyPrice),
          });
        }
      }

      return res.json({ success: true, client: getBotClient(atual.id) });
    } catch (error: any) {
      return falha(res, error, "Falha ao atualizar cliente do bot.");
    }
  });

  // Remove de vez (cliente cancelou). A assinatura é cancelada, não apagada,
  // para o histórico financeiro não perder o rastro.
  app.delete("/api/bot/clients/:id", (req: Request, res: Response) => {
    try {
      const cliente = getBotClient(req.params.id);
      if (!cliente) return res.status(404).json({ success: false, error: "Cliente do bot não encontrado." });

      const assinatura = getSubscriptionBySubject("bot", cliente.id);
      if (assinatura && assinatura.status !== "canceled") updateSubscriptionStatus(assinatura.id, "canceled");

      const { getDb } = require("../store/schema");
      const db = getDb();
      const removidos = db.transaction(() => {
        const chunks = db.prepare("DELETE FROM bot_chunks WHERE client_id = ?").run(cliente.id).changes;
        const docs = db.prepare("DELETE FROM bot_docs WHERE client_id = ?").run(cliente.id).changes;
        const msgs = db.prepare("DELETE FROM bot_messages WHERE client_id = ?").run(cliente.id).changes;
        const escs = db.prepare("DELETE FROM bot_escalations WHERE client_id = ?").run(cliente.id).changes;
        const bots = db.prepare("DELETE FROM bot_clients WHERE id = ?").run(cliente.id).changes;
        return { chunks, docs, msgs, escs, bots };
      })();

      return res.json({ success: true, removed: removidos });
    } catch (error: any) {
      return falha(res, error, "Falha ao remover o cliente do bot.");
    }
  });

  // -----------------------------------------------------------------
  // Base de conhecimento
  // -----------------------------------------------------------------
  app.post("/api/bot/clients/:id/knowledge", async (req: Request, res: Response) => {
    try {
      const cliente = getBotClient(req.params.id);
      if (!cliente) return res.status(404).json({ success: false, error: "Cliente do bot não encontrado." });

      const conteudo = String(req.body?.content || "").trim();
      if (conteudo.length < 20) {
        return res.status(400).json({ success: false, error: "Cole o conteúdo da base (mínimo 20 caracteres)." });
      }

      const resultado = await addKnowledge(cliente.id, {
        title: req.body?.title ? String(req.body.title) : undefined,
        source: req.body?.source ? String(req.body.source) : "painel",
        content: conteudo,
      });

      return res.status(201).json({
        success: true,
        docId: resultado.docId,
        chunks: resultado.chunks,
        stats: knowledgeStats(cliente.id),
      });
    } catch (error: any) {
      return falha(res, error, "Falha ao indexar a base de conhecimento.");
    }
  });

  app.delete("/api/bot/clients/:id/knowledge/:docId", (req: Request, res: Response) => {
    try {
      const cliente = getBotClient(req.params.id);
      if (!cliente) return res.status(404).json({ success: false, error: "Cliente do bot não encontrado." });
      const resultado = deleteKnowledgeDoc(cliente.id, req.params.docId);
      return res.json({ success: true, ...resultado, stats: knowledgeStats(cliente.id) });
    } catch (error: any) {
      return falha(res, error, "Falha ao remover o documento.");
    }
  });

  // Testa uma pergunta SEM enviar mensagem (é o que se faz na implantação)
  app.post("/api/bot/clients/:id/ask", async (req: Request, res: Response) => {
    try {
      const pergunta = String(req.body?.question || "").trim();
      if (!pergunta) return res.status(400).json({ success: false, error: "Informe a pergunta." });
      const resposta = await testBotQuestion(req.params.id, pergunta);
      return res.json({ success: true, ...resposta });
    } catch (error: any) {
      return falha(res, error, "Falha ao testar a pergunta.");
    }
  });

  // -----------------------------------------------------------------
  // Handoff (dono assume) e escaladas
  // -----------------------------------------------------------------
  app.post("/api/bot/clients/:id/handoff", (req: Request, res: Response) => {
    try {
      const pausado = Boolean(req.body?.paused);
      const horas = Number(req.body?.hours) || undefined;
      const atualizado = toggleHandoff(req.params.id, pausado, horas);
      if (!atualizado) return res.status(404).json({ success: false, error: "Cliente do bot não encontrado." });
      return res.json({ success: true, client: { ...atualizado, paused: isBotPaused(atualizado) } });
    } catch (error: any) {
      return falha(res, error, "Falha ao alternar o atendimento humano.");
    }
  });

  // Responde uma pergunta pendente pelo painel (repassa ao cliente)
  app.post("/api/bot/clients/:id/escalations/:escId/answer", async (req: Request, res: Response) => {
    try {
      const cliente = getBotClient(req.params.id);
      if (!cliente) return res.status(404).json({ success: false, error: "Cliente do bot não encontrado." });
      const texto = String(req.body?.text || "").trim();
      if (!texto) return res.status(400).json({ success: false, error: "Escreva a resposta ao cliente." });

      const pendente = listEscalations(cliente.id, 200).find((e) => e.id === req.params.escId && !e.answeredAt);
      if (!pendente) return res.status(404).json({ success: false, error: "Pergunta pendente não encontrada." });

      const { sendBotText } = await import("../services/botKnowledgeService");
      await sendBotText(cliente.instance, pendente.customerPhone, texto);
      const fechada = answerEscalation(pendente.id, texto);
      return res.json({ success: true, escalation: fechada });
    } catch (error: any) {
      return falha(res, error, "Falha ao responder a pergunta pendente.");
    }
  });

  // -----------------------------------------------------------------
  // Assinaturas (MRR, pagamento, cancelamento)
  // -----------------------------------------------------------------
  app.get("/api/bot/subscriptions", (_req: Request, res: Response) => {
    try {
      return res.json({ success: true, subscriptions: listSubscriptions({ subjectType: "bot" }), mrr: mrrSummary() });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || "Falha ao listar assinaturas." });
    }
  });

  app.post("/api/bot/subscriptions/:id/paid", (req: Request, res: Response) => {
    try {
      const assinatura = markSubscriptionPaid(req.params.id, req.body?.paidAt);
      if (!assinatura) return res.status(404).json({ success: false, error: "Assinatura não encontrada." });
      return res.json({ success: true, subscription: assinatura, mrr: mrrSummary() });
    } catch (error: any) {
      return falha(res, error, "Falha ao registrar o pagamento.");
    }
  });

  app.post("/api/bot/subscriptions/:id/status", (req: Request, res: Response) => {
    try {
      const status = String(req.body?.status || "").trim() as SubscriptionStatus;
      if (!["trial", "active", "past_due", "canceled"].includes(status)) {
        return res.status(400).json({ success: false, error: "Status inválido." });
      }
      const assinatura = updateSubscriptionStatus(req.params.id, status);
      if (!assinatura) return res.status(404).json({ success: false, error: "Assinatura não encontrada." });
      return res.json({ success: true, subscription: assinatura, mrr: mrrSummary() });
    } catch (error: any) {
      return falha(res, error, "Falha ao mudar o status da assinatura.");
    }
  });
}
