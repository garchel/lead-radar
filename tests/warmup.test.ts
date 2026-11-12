import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_WARMUP,
  describeWarmup,
  firstApproachSendAt,
  getWarmupSettings,
  getWarmupState,
  saveWarmupSettings,
  warmupNewContactCap,
} from "../server/services/warmupService";
import { getDb } from "../server/store/schema";
import { recordCommunication, setSetting, upsertLead } from "../server/store/db";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}

function seedSend(id: string, whenIso: string, status: "sent" | "failed" = "sent", hook: string | null = "sem_site") {
  const leadId = `warm-${id}`;
  upsertLead(
    { id: leadId, name: `Negocio ${id}`, phone: "5561999999999", city: "Goiânia", pipelineStatus: "contacted" } as any,
    { skipDedup: true }
  );
  const commId = recordCommunication({ leadId, channel: "whatsapp", direction: "outbound", status, message: `msg ${id}`, hook: hook ?? undefined });
  getDb().prepare("UPDATE communications SET created_at = ?, sent_at = ? WHERE id = ?").run(whenIso, whenIso, commId);
  return commId;
}

beforeEach(() => {
  setSetting("warmup_settings", JSON.stringify(DEFAULT_WARMUP));
});

describe("aquecimento do número", () => {
  it("número que nunca enviou fica no dia 1, com o menor teto", () => {
    getDb().prepare("DELETE FROM communications").run();
    const state = getWarmupState(new Date(), 30);
    expect(state.dayNumber).toBe(1);
    expect(state.cap).toBe(DEFAULT_WARMUP.startCap); // 5
    expect(state.cap).toBeLessThan(30);
  });

  it("a rampa sobe um contato por DIA COM ENVIO", () => {
    getDb().prepare("DELETE FROM communications").run();
    seedSend("a", daysAgo(0));
    expect(getWarmupState(new Date(), 30).cap).toBe(5); // dia 1, já enviou hoje

    seedSend("b", daysAgo(2)); // 2º dia ativo (hoje já conta)
    const s = getWarmupState(new Date(), 30);
    expect(s.dayNumber).toBe(2);
    expect(s.cap).toBe(6);
  });

  it("parar não gasta a rampa: dias ociosos não contam", () => {
    getDb().prepare("DELETE FROM communications").run();
    seedSend("gap", daysAgo(30)); // 1 dia ativo, há um mês
    const s = getWarmupState(new Date(), 30);
    expect(s.dayNumber).toBe(2); // hoje seria o 2º dia com envio, nunca o 31º
    expect(s.cap).toBe(6);
  });

  it("nunca passa do teto configurado na humanização", () => {
    getDb().prepare("DELETE FROM communications").run();
    for (let i = 0; i < 40; i += 1) seedSend(`c${i}`, daysAgo(i));
    const state = getWarmupState(new Date(), 30);
    expect(state.cap).toBe(30);
    expect(state.cap).toBeLessThanOrEqual(state.configuredCap);
    expect(state.activeDaysToMax).toBe(25);
  });

  it("congela a subida quando há 3 falhas nas últimas 24h", () => {
    getDb().prepare("DELETE FROM communications").run();
    seedSend("d", daysAgo(10));
    const semFalhas = getWarmupState(new Date(), 30);
    seedSend("e", daysAgo(0), "failed");
    seedSend("f", daysAgo(0), "failed");
    seedSend("g", daysAgo(0), "failed");
    const comFalhas = getWarmupState(new Date(), 30);
    expect(comFalhas.hold).toMatch(/falhas/);
    expect(comFalhas.cap).toBe(semFalhas.cap - DEFAULT_WARMUP.dailyIncrement);
  });

  it("congela a subida quando alguém pede para sair", () => {
    getDb().prepare("DELETE FROM communications").run();
    seedSend("h", daysAgo(10));
    const before = getWarmupState(new Date(), 30).cap;
    upsertLead(
      { id: "warm-optout", name: "Saiu", phone: "5561988887777", city: "Goiânia", pipelineStatus: "declined", doNotContact: true } as any,
      { skipDedup: true }
    );
    const after = getWarmupState(new Date(), 30);
    expect(after.hold).toMatch(/saída/);
    expect(after.cap).toBe(before - DEFAULT_WARMUP.dailyIncrement);
  });

  it("desligado, vale o teto da humanização", () => {
    saveWarmupSettings({ enabled: false });
    const state = getWarmupState(new Date(), 30);
    expect(state.enabled).toBe(false);
    expect(state.cap).toBe(30);
  });

  it("configuração é validada e limitada (não aceita 500/dia)", () => {
    const saved = saveWarmupSettings({ startCap: 3, dailyIncrement: 1, maxCap: 500 });
    expect(saved.maxCap).toBe(30);
    expect(saved.startCap).toBe(3);
    const negativo = saveWarmupSettings({ startCap: -10 });
    expect(negativo.startCap).toBe(1);
    expect(getWarmupSettings().maxCap).toBeLessThanOrEqual(30);
  });

  it("maxCap abaixo de startCap é corrigido", () => {
    const saved = saveWarmupSettings({ startCap: 20, maxCap: 10 });
    expect(saved.maxCap).toBe(20);
  });

  it("teto efetivo nunca é maior que o da humanização", () => {
    getDb().prepare("DELETE FROM communications").run();
    for (let i = 0; i < 40; i += 1) seedSend(`i${i}`, daysAgo(i));
    expect(warmupNewContactCap(new Date(), 30)).toBe(30);
    expect(warmupNewContactCap(new Date(), 8)).toBe(8);
  });

  it("falha e resposta de conversa não contam como dia ativo", () => {
    getDb().prepare("DELETE FROM communications").run();
    seedSend("j", daysAgo(9), "failed");
    seedSend("resp", daysAgo(30), "sent", "conversa");
    seedSend("k", daysAgo(3));
    const anchor = firstApproachSendAt();
    expect(new Date(anchor!).getTime()).toBeGreaterThan(Date.now() - 4 * DAY);
    expect(getWarmupState(new Date(), 30).dayNumber).toBe(2); // 1 dia ativo + hoje
  });

  it("descreve a situação em uma linha para o humano", () => {
    saveWarmupSettings({ enabled: true });
    const texto = describeWarmup(getWarmupState(new Date(), 30));
    expect(texto).toMatch(/Dia \d+ da rampa/);
    expect(texto).toMatch(/contato/);
  });
});
