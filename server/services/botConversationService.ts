/**
 * Conversa do bot de um cliente.
 *
 * Fluxo principal (uma mensagem do cliente final):
 *   1. identifica de quem é a instância que recebeu;
 *   2. se o dono assumiu (handoff), não responde nada;
 *   3. responde com base na base de conhecimento (RAG);
 *   4. se não souber, avisa o cliente e pergunta ao dono;
 *   5. guarda tudo em `bot_messages` para o relatório mensal.
 *
 * Fluxo do dono (ele escreveu para o número do bot):
 *   - se existe pergunta pendente, a resposta dele é repassada ao cliente;
 *   - em qualquer caso, o bot fica calado por algumas horas (handoff).
 */
import { getDb } from "../store/schema";
import { sendOwnerAlert } from "./ownerAlertService";
import {
  answerWithRag,
  getBotClient,
  ensureBotTables,
  findBotClientByInstance,
  isBotPaused,
  isOwnBotMessage,
  pauseBot,
  recordBotMessage,
  sendBotText,
  updateBotClient,
  type BotClient,
} from "./botKnowledgeService";

export interface Escalation {
  id: string;
  clientId: string;
  customerPhone: string;
  question: string;
  createdAt: string;
  answeredAt?: string;
  answerText?: string;
}

let escalationsReady = false;

/** Fila de perguntas que o bot não soube responder e o dono precisa responder. */
export function ensureEscalationTable(): void {
  if (escalationsReady) return;
  ensureBotTables();
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS bot_escalations (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      question TEXT NOT NULL,
      created_at TEXT NOT NULL,
      answered_at TEXT,
      answer_text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bot_escalations_client ON bot_escalations(client_id, created_at);
  `);
  escalationsReady = true;
}

function newId(): string {
  return `esc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function openEscalation(input: { clientId: string; customerPhone: string; question: string }): Escalation {
  ensureEscalationTable();
  const registro: Escalation = {
    id: newId(),
    clientId: input.clientId,
    customerPhone: String(input.customerPhone || "").replace(/\D/g, ""),
    question: input.question,
    createdAt: new Date().toISOString(),
  };
  getDb()
    .prepare(
      `INSERT INTO bot_escalations (id, client_id, customer_phone, question, created_at)
       VALUES (@id, @clientId, @customerPhone, @question, @createdAt)`
    )
    .run(registro);
  return registro;
}

export function pendingEscalation(clientId: string): Escalation | undefined {
  ensureEscalationTable();
  const row = getDb()
    .prepare(
      "SELECT * FROM bot_escalations WHERE client_id = ? AND answered_at IS NULL ORDER BY created_at DESC LIMIT 1"
    )
    .get(clientId) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    clientId: row.client_id,
    customerPhone: row.customer_phone,
    question: row.question,
    createdAt: row.created_at,
  };
}

export function answerEscalation(id: string, answerText: string): Escalation | undefined {
  ensureEscalationTable();
  getDb()
    .prepare("UPDATE bot_escalations SET answered_at = ?, answer_text = ? WHERE id = ?")
    .run(new Date().toISOString(), answerText, id);
  const row = getDb().prepare("SELECT * FROM bot_escalations WHERE id = ?").get(id) as any;
  if (!row) return undefined;
  return {
    id: row.id,
    clientId: row.client_id,
    customerPhone: row.customer_phone,
    question: row.question,
    createdAt: row.created_at,
    answeredAt: row.answered_at || undefined,
    answerText: row.answer_text || undefined,
  };
}

export function listEscalations(clientId: string, limit = 50): Escalation[] {
  ensureEscalationTable();
  const rows = getDb()
    .prepare("SELECT * FROM bot_escalations WHERE client_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(clientId, Math.max(1, Math.min(200, limit))) as any[];
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    customerPhone: r.customer_phone,
    question: r.question,
    createdAt: r.created_at,
    answeredAt: r.answered_at || undefined,
    answerText: r.answer_text || undefined,
  }));
}

/** O dono do negócio pode assumir sem pausar o bot? (usado pela rota) */
export function toggleHandoff(clientId: string, paused: boolean, hours?: number): BotClient | undefined {
  if (!paused) return updateBotClient(clientId, { botPausedUntil: undefined, botPausedReason: undefined });
  return pauseBot(clientId, hours, "pausado manualmente");
}

export interface BotInboundResult {
  handled: boolean;
  clientId?: string;
  /** O que foi enviado ao cliente (vazio quando não respondeu). */
  sent?: string;
  escalated?: boolean;
  reason?: string;
  detail?: string;
}

/**
 * Ponto único de entrada do bot de cliente. Chamado pelo webhook quando a
 * instância pertence a um cliente cadastrado.
 */
export async function handleBotInbound(input: {
  instance: string;
  from: string;
  text: string;
  pushName?: string;
  /** true quando a mensagem saiu do próprio número do bot (dono digitando). */
  fromMe?: boolean;
}): Promise<BotInboundResult> {
  ensureEscalationTable();

  const client = findBotClientByInstance(input.instance);
  if (!client) return { handled: false, detail: "instância não pertence a nenhum bot cadastrado" };
  if (client.status !== "active") {
    return { handled: true, clientId: client.id, detail: "bot pausado pelo painel" };
  }

  const telefone = String(input.from || "").replace(/\D/g, "");
  if (!telefone) return { handled: true, clientId: client.id, detail: "remetente sem telefone" };

  const ehDono = Boolean(client.ownerPhone) && telefone === String(client.ownerPhone).replace(/\D/g, "");

  // DONO escrevendo: repassa a resposta ao cliente que perguntou e cala o bot.
  if (input.fromMe || ehDono) {
    recordBotMessage({ clientId: client.id, phone: telefone, direction: "in", kind: "owner", text: input.text });
    const pendente = pendingEscalation(client.id);
    if (pendente && !input.fromMe) {
      try {
        await sendBotText(client.instance, pendente.customerPhone, input.text);
        answerEscalation(pendente.id, input.text);
        recordBotMessage({
          clientId: client.id,
          phone: pendente.customerPhone,
          direction: "out",
          kind: "answer",
          text: input.text,
        });
      } catch (error: any) {
        return {
          handled: true,
          clientId: client.id,
          detail: `não consegui repassar ao cliente: ${error?.message || error}`,
        };
      }
    }
    pauseBot(client.id, undefined, "dono respondeu");
    return { handled: true, clientId: client.id, sent: input.text, detail: "handoff: bot calado" };
  }

  recordBotMessage({ clientId: client.id, phone: telefone, direction: "in", kind: "inbound", text: input.text });

  if (isBotPaused(client)) {
    return { handled: true, clientId: client.id, detail: "bot em handoff (um humano está atendendo)" };
  }

  const resposta = await answerWithRag(client.id, input.text);

  let externalId: string | undefined;
  let falhaEnvio: string | undefined;
  try {
    const enviado = await sendBotText(client.instance, telefone, resposta.customerMessage);
    externalId = enviado.externalId;
  } catch (error: any) {
    // Não consegui falar com o cliente: o dono precisa saber mesmo assim, senão a
    // pergunta morre em silêncio (gateway fora, número banido, instância caída).
    falhaEnvio = String(error?.message || error);
    openEscalation({ clientId: client.id, customerPhone: telefone, question: input.text });
    try {
      const { escalateToOwner } = await import("./botKnowledgeService");
      await escalateToOwner({
        clientId: client.id,
        question: input.text,
        customerName: input.pushName,
        reason: "erro_ia",
      });
    } catch {
      /* best-effort */
    }
    recordBotMessage({
      clientId: client.id,
      phone: telefone,
      direction: "out",
      kind: "escalation",
      text: `[falha de envio] ${input.text} — ${falhaEnvio}`,
    });
    // Falha técnica no bot de um cliente também é assunto do Paulo: é o serviço
    // que ele vende e o cliente dele está no escuro.
    void sendOwnerAlert({
      kind: "bot_cliente",
      detail: `${client.name}: ${falhaEnvio}`,
      leadId: client.id,
      leadName: `Bot de ${client.name}`,
      leadPhone: telefone,
    });
    return {
      handled: true,
      clientId: client.id,
      escalated: true,
      detail: `falha ao enviar ao cliente: ${falhaEnvio}`,
    };
  }

  recordBotMessage({
    clientId: client.id,
    phone: telefone,
    direction: "out",
    kind: resposta.escalated ? "holding" : "answer",
    text: resposta.customerMessage,
    externalId,
  });

  if (!resposta.escalated) {
    return { handled: true, clientId: client.id, sent: resposta.customerMessage };
  }

  // Não sabia: pergunta ao dono e deixa registrado para o relatório.
  openEscalation({ clientId: client.id, customerPhone: telefone, question: input.text });
  try {
    const { escalateToOwner } = await import("./botKnowledgeService");
    const aviso = await escalateToOwner({
      clientId: client.id,
      question: input.text,
      customerName: input.pushName,
      reason: resposta.reason,
    });
    recordBotMessage({
      clientId: client.id,
      phone: telefone,
      direction: "out",
      kind: "escalation",
      text: `[${resposta.reason || "sem_base"}] ${input.text} — ${aviso.detail}`,
    });
  } catch (error: any) {
    console.warn(`[bot] escalada falhou para ${client.id}: ${error?.message || error}`);
  }

  return {
    handled: true,
    clientId: client.id,
    sent: resposta.customerMessage,
    escalated: true,
    reason: resposta.reason || undefined,
  };
}

/**
 * Mensagem que saiu do próprio número do bot (eco do WhatsApp).
 *
 * Precisa separar duas coisas: o que NÓS enviamos (tem `external_id` gravado) e o
 * que o dono digitou no celular. Só a segunda pausa o bot e é repassada ao
 * cliente, se havia pergunta pendente.
 */
export async function handleOwnerEcho(input: {
  instance: string;
  toPhone: string;
  text: string;
  externalId?: string;
}): Promise<BotInboundResult> {
  ensureEscalationTable();
  const client = findBotClientByInstance(input.instance);
  if (!client) return { handled: false, detail: "instância sem bot cadastrado" };

  if (isOwnBotMessage(client.id, input.externalId)) {
    return { handled: true, clientId: client.id, detail: "eco da própria mensagem do bot" };
  }

  const telefone = String(input.toPhone || "").replace(/\D/g, "");
  recordBotMessage({ clientId: client.id, phone: telefone, direction: "out", kind: "owner", text: input.text });

  // Se ele respondeu dentro da conversa de quem perguntou, nada a repassar.
  const pendente = pendingEscalation(client.id);
  if (pendente && pendente.customerPhone !== telefone) {
    try {
      await sendBotText(client.instance, pendente.customerPhone, input.text);
      answerEscalation(pendente.id, input.text);
    } catch (error: any) {
      return { handled: true, clientId: client.id, detail: `falha ao repassar: ${error?.message || error}` };
    }
  }

  pauseBot(client.id, undefined, "dono digitou pelo número do bot");
  return { handled: true, clientId: client.id, detail: "dono assumiu a conversa; bot calado por algumas horas" };
}

/** Testa uma pergunta sem enviar nada (usado pela tela e pela API). */
export async function testBotQuestion(clientId: string, question: string) {
  const client = getBotClient(clientId);
  if (!client) throw new Error(`Cliente de bot não encontrado: ${clientId}`);
  return answerWithRag(clientId, question);
}
