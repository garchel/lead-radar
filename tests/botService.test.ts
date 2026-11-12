import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../server/store/schema";
import {
  createBotClient,
  ensureBotTables,
  findBotClientByInstance,
  isBotPaused,
  isOwnBotMessage,
  listBotClients,
  pauseBot,
  recordBotMessage,
  resumeBot,
  updateBotClient,
} from "../server/services/botKnowledgeService";
import {
  ensureEscalationTable,
  handleBotInbound,
  handleOwnerEcho,
  pendingEscalation,
} from "../server/services/botConversationService";
import {
  addMonths,
  createSubscription,
  ensureSubscriptionTables,
  getSubscription,
  getSubscriptionBySubject,
  markSubscriptionPaid,
  mrrSummary,
  setSubscriptionAmount,
  updateSubscriptionStatus,
} from "../server/services/subscriptionService";

/** Banco limpo para cada teste: o setup do vitest isola o arquivo. */
function limpar() {
  ensureBotTables();
  ensureSubscriptionTables();
  ensureEscalationTable();
  const db = getDb();
  db.exec("DELETE FROM bot_messages");
  db.exec("DELETE FROM bot_chunks");
  db.exec("DELETE FROM bot_docs");
  db.exec("DELETE FROM bot_escalations");
  db.exec("DELETE FROM bot_clients");
  db.exec("DELETE FROM subscriptions");
}

describe("vencimento de assinatura", () => {
  it("soma um mês preservando o dia", () => {
    expect(addMonths("2026-11-12T12:00:00.000Z", 1).slice(0, 10)).toBe("2026-12-12");
  });

  it("31 de janeiro vira 28 de fevereiro, não 3 de março", () => {
    expect(addMonths("2026-01-31T12:00:00.000Z", 1).slice(0, 10)).toBe("2026-02-28");
  });

  it("fevereiro bissexto vira 29", () => {
    expect(addMonths("2028-01-31T12:00:00.000Z", 1).slice(0, 10)).toBe("2028-02-29");
  });

  it("vira o ano corretamente", () => {
    expect(addMonths("2026-12-15T12:00:00.000Z", 1).slice(0, 10)).toBe("2027-01-15");
  });
});

describe("assinaturas (MRR)", () => {
  beforeEach(limpar);

  it("nasce ativa com vencimento em um mês", () => {
    const inicio = "2026-11-01T12:00:00.000Z";
    const s = createSubscription({
      subjectType: "bot",
      subjectId: "bot_x",
      plan: "Bot WhatsApp",
      amount: 150,
      startedAt: inicio,
    });
    expect(s.status).toBe("active");
    expect(s.nextDueAt?.slice(0, 10)).toBe("2026-12-01");
    expect(s.amount).toBe(150);
  });

  it("marca pagamento e avança um mês", () => {
    const s = createSubscription({
      subjectType: "bot",
      subjectId: "bot_x",
      plan: "Bot",
      amount: 150,
      startedAt: "2026-11-01T12:00:00.000Z",
    });
    const pago = markSubscriptionPaid(s.id);
    expect(pago?.status).toBe("active");
    expect(pago?.nextDueAt?.slice(0, 10)).toBe("2027-01-01");
    expect(pago?.nextDueAt).not.toBe(s.nextDueAt);
  });

  it("MRR soma só ativas/em atraso e separa as vencidas", () => {
    const antiga = createSubscription({
      subjectType: "bot",
      subjectId: "bot_vencido",
      plan: "Bot",
      amount: 150,
      startedAt: "2026-08-01T12:00:00.000Z",
    });
    createSubscription({ subjectType: "bot", subjectId: "bot_ok", plan: "Bot", amount: 200, startedAt: "2026-11-01T12:00:00.000Z" });
    createSubscription({
      subjectType: "bot",
      subjectId: "bot_trial",
      plan: "Bot",
      amount: 300,
      status: "trial",
      startedAt: "2026-11-01T12:00:00.000Z",
    });
    createSubscription({
      subjectType: "bot",
      subjectId: "bot_cancel",
      plan: "Bot",
      amount: 400,
      status: "canceled",
      startedAt: "2026-10-01T12:00:00.000Z",
    });
    // força atraso (vencimento no passado)
    getDb().prepare("UPDATE subscriptions SET next_due_at = ? WHERE id = ?").run("2026-09-01T12:00:00.000Z", antiga.id);

    const resumo = mrrSummary(new Date("2026-11-12T12:00:00.000Z"));
    expect(resumo.mrr).toBe(350); // 150 + 200
    expect(resumo.activeCount).toBe(2);
    expect(resumo.overdueCount).toBe(1);
    expect(resumo.overdueAmount).toBe(150);
    expect(resumo.trialCount).toBe(1);
    expect(resumo.canceledCount).toBe(1);
  });

  it("cancelar tira do MRR e limpa vencimento", () => {
    const s = createSubscription({ subjectType: "bot", subjectId: "bot_x", plan: "Bot", amount: 150 });
    updateSubscriptionStatus(s.id, "canceled");
    const depois = getSubscription(s.id);
    expect(depois?.status).toBe("canceled");
    expect(depois?.nextDueAt).toBeNull();
    expect(mrrSummary().mrr).toBe(0);
  });

  it("reajuste muda o valor e o MRR", () => {
    const s = createSubscription({ subjectType: "bot", subjectId: "bot_x", plan: "Bot", amount: 150 });
    setSubscriptionAmount(s.id, 199);
    expect(getSubscription(s.id)?.amount).toBe(199);
    expect(mrrSummary().mrr).toBe(199);
  });

  it("busca por sujeito devolve a assinatura do bot", () => {
    const s = createSubscription({ subjectType: "bot", subjectId: "bot_abc", plan: "Bot", amount: 150 });
    expect(getSubscriptionBySubject("bot", "bot_abc")?.id).toBe(s.id);
    expect(getSubscriptionBySubject("site", "bot_abc")).toBeUndefined();
  });
});

describe("cliente do bot", () => {
  beforeEach(limpar);

  it("cria com valores padrão do serviço (649 + 150)", () => {
    const c = createBotClient({ name: "Barbearia Navalha de Ouro", ownerPhone: "61 99277-5759" });
    expect(c.setupPrice).toBe(649);
    expect(c.monthlyPrice).toBe(150);
    expect(c.ownerPhone).toBe("61992775759");
    expect(c.status).toBe("active");
  });

  it("encontra o cliente pela instância, ignorando maiúsculas", () => {
    createBotClient({ name: "Barbearia", instance: "Barbearia-Nivaldo" });
    expect(findBotClientByInstance("barbearia-nivaldo")?.name).toBe("Barbearia");
    expect(findBotClientByInstance("outra")).toBeUndefined();
    expect(findBotClientByInstance("")).toBeUndefined();
  });

  it("pausa e retoma o bot (handoff)", () => {
    const c = createBotClient({ name: "Barbearia" });
    expect(isBotPaused(c)).toBe(false);
    const pausado = pauseBot(c.id, 2, "dono assumiu");
    expect(isBotPaused(pausado!)).toBe(true);
    expect(pausado?.botPausedReason).toBe("dono assumiu");
    const retomado = resumeBot(c.id);
    expect(isBotPaused(retomado!)).toBe(false);
  });

  it("pausa expirada não conta", () => {
    const c = createBotClient({ name: "Barbearia" });
    updateBotClient(c.id, { botPausedUntil: "2020-01-01T00:00:00.000Z" });
    const atual = listBotClients()[0];
    expect(isBotPaused(atual)).toBe(false);
  });

  it("reconhece o eco das próprias mensagens e ignora mensagem do dono", () => {
    const c = createBotClient({ name: "Barbearia" });
    recordBotMessage({
      clientId: c.id,
      phone: "5561999998888",
      direction: "out",
      kind: "answer",
      text: "Olá",
      externalId: "ABC123",
    });
    expect(isOwnBotMessage(c.id, "ABC123")).toBe(true);
    expect(isOwnBotMessage(c.id, "XYZ999")).toBe(false);
    expect(isOwnBotMessage(c.id, undefined)).toBe(false);
  });
});

describe("roteamento do webhook para o bot do cliente", () => {
  beforeEach(limpar);

  it("instância desconhecida não é tratada pelo bot (segue o fluxo de lead)", async () => {
    const r = await handleBotInbound({ instance: "instancia-que-nao-existe", from: "5561999998888", text: "oi" });
    expect(r.handled).toBe(false);
  });

  it("bot pausado pelo painel não responde", async () => {
    createBotClient({ name: "Barbearia", instance: "barbearia-1" });
    const c = listBotClients()[0];
    updateBotClient(c.id, { status: "paused" });
    const r = await handleBotInbound({ instance: "barbearia-1", from: "5561999998888", text: "quanto custa?" });
    expect(r.handled).toBe(true);
    expect(r.detail).toContain("pausado");
  });

  it("sem base indexada, escala em vez de inventar (e não quebra)", async () => {
    createBotClient({ name: "Barbearia", instance: "barbearia-2", ownerPhone: "5561992777579" });
    const r = await handleBotInbound({ instance: "barbearia-2", from: "5561999998888", text: "quanto custa o corte?" });
    expect(r.handled).toBe(true);
    expect(r.escalated).toBe(true);
    // sem gateway configurado no teste, o envio falha — mas a pergunta ficou registrada
    const c = listBotClients()[0];
    expect(pendingEscalation(c.id)?.question).toBe("quanto custa o corte?");
  });

  it("eco do dono pausa o bot (handoff)", async () => {
    createBotClient({ name: "Barbearia", instance: "barbearia-3" });
    const r = await handleOwnerEcho({ instance: "barbearia-3", toPhone: "5561999998888", text: "Oi, já respondo" });
    expect(r.handled).toBe(true);
    expect(r.detail).toContain("bot calado");
    const c = listBotClients()[0];
    expect(isBotPaused(c)).toBe(true);
  });

  it("eco da própria mensagem do bot não pausa nada", async () => {
    createBotClient({ name: "Barbearia", instance: "barbearia-4" });
    const c = listBotClients()[0];
    recordBotMessage({ clientId: c.id, phone: "5561999998888", direction: "out", kind: "answer", text: "Olá", externalId: "MSG1" });
    const r = await handleOwnerEcho({ instance: "barbearia-4", toPhone: "5561999998888", text: "Olá", externalId: "MSG1" });
    expect(r.detail).toContain("eco");
    expect(isBotPaused(listBotClients()[0])).toBe(false);
  });
});
