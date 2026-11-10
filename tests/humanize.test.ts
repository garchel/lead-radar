import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computePauseMs,
  computeTypingDelayMs,
  evaluateSendGate,
  getHumanizeSettings,
  getHumanizeUsage,
  isWithinSendWindow,
  nextWindowOpeningAt,
  resetHumanizePacer,
  runPaced,
  saveHumanizeSettings,
  HumanizeSettingsError,
  type HumanizeSettings,
} from "../server/services/humanizeService";
import { recordCommunication, setSetting, upsertLead } from "../server/store/db";
import { getDb } from "../server/store/schema";
import { sendWhatsApp } from "../server/services/contactService";

// Nov/2026: 07 = sábado, 08 = domingo, 09 = segunda, 10 = terça.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute, 0, 0);

const FAST: HumanizeSettings = {
  enabled: true,
  replyStartHour: 0,
  replyEndHour: 24,
  prospectStartHour: 0,
  prospectEndHour: 24,
  prospectWeekdaysOnly: false,
  typingBaseMs: 0,
  typingPerCharMs: 0,
  typingMaxMs: 0,
  pauseMinSeconds: 0,
  pauseMaxSeconds: 0,
  dailyTotalCap: 60,
  dailyNewCap: 30,
};

let seedSeq = 0;

function seedLead(id: string, phone?: string) {
  seedSeq += 1;
  return upsertLead({
    id,
    name: `Lead ${id}`,
    // Telefone único por seed: upsertLead faz dedup por telefone e fundiria os
    // leads de teste num só (o id do seed nem existiria no banco).
    phone: phone || `11 9${String(70000000 + seedSeq).padStart(8, "0")}`,
    pipelineStatus: "prospect",
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);
}

function clearHumanizeSettings() {
  for (const key of [
    "automation_humanize_enabled",
    "automation_humanize_reply_start_hour",
    "automation_humanize_reply_end_hour",
    "automation_humanize_prospect_start_hour",
    "automation_humanize_prospect_end_hour",
    "automation_humanize_prospect_weekdays_only",
    "automation_humanize_typing_base_ms",
    "automation_humanize_typing_per_char_ms",
    "automation_humanize_typing_max_ms",
    "automation_humanize_pause_min_seconds",
    "automation_humanize_pause_max_seconds",
    "automation_humanize_daily_total_cap",
    "automation_humanize_daily_new_cap",
  ]) {
    setSetting(key, "");
  }
}

describe("humanizeService — janelas de horário", () => {
  it("respostas valem todos os dias entre 07h e 20h", () => {
    const s = { ...FAST, replyStartHour: 7, replyEndHour: 20 };
    expect(isWithinSendWindow("reply", at(7, 6, 59), s)).toBe(false); // sábado 06:59
    expect(isWithinSendWindow("reply", at(7, 7), s)).toBe(true); // sábado 07:00
    expect(isWithinSendWindow("reply", at(8, 19, 59), s)).toBe(true); // domingo 19:59
    expect(isWithinSendWindow("reply", at(8, 20), s)).toBe(false); // domingo 20:00
  });

  it("prospecção é 08h–18h e só seg–sex", () => {
    const s = { ...FAST, prospectStartHour: 8, prospectEndHour: 18, prospectWeekdaysOnly: true };
    expect(isWithinSendWindow("prospect", at(7, 10), s)).toBe(false); // sábado
    expect(isWithinSendWindow("prospect", at(8, 10), s)).toBe(false); // domingo
    expect(isWithinSendWindow("prospect", at(9, 7, 59), s)).toBe(false); // segunda 07:59
    expect(isWithinSendWindow("prospect", at(9, 8), s)).toBe(true); // segunda 08:00
    expect(isWithinSendWindow("prospect", at(9, 18), s)).toBe(false); // segunda 18:00 (fim exclusivo)
  });

  it("próxima abertura pula o fim de semana", () => {
    const s = { ...FAST, prospectStartHour: 8, prospectEndHour: 18, prospectWeekdaysOnly: true };
    const next = nextWindowOpeningAt("prospect", at(7, 10), s); // sábado 10h
    expect(next.getDay()).toBe(1); // segunda
    expect(next.getHours()).toBe(8);
  });
});

describe("humanizeService — delays", () => {
  it("delay de digitação cresce com o tamanho do texto e respeita o teto", () => {
    const s = { ...FAST, typingBaseMs: 1000, typingPerCharMs: 50, typingMaxMs: 4000 };
    const short = computeTypingDelayMs("oi", s, () => 0.5);
    const long = computeTypingDelayMs("x".repeat(500), s, () => 0.5);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeLessThanOrEqual(4000);
    expect(long).toBeGreaterThan(short);
    expect(long).toBe(4000);
  });

  it("pausa entre envios fica dentro da faixa configurada", () => {
    const s = { ...FAST, pauseMinSeconds: 45, pauseMaxSeconds: 120 };
    expect(computePauseMs(s, () => 0)).toBe(45000);
    expect(computePauseMs(s, () => 1)).toBe(120000);
    const mid = computePauseMs(s, () => 0.5);
    expect(mid).toBeGreaterThanOrEqual(45000);
    expect(mid).toBeLessThanOrEqual(120000);
  });
});

describe("humanizeService — consumo do dia", () => {
  beforeEach(() => {
    clearHumanizeSettings();
  });

  it("conta envios de hoje e distingue contato novo de resposta", () => {
    seedLead("hz-old"); // recebeu ontem
    seedLead("hz-new");
    const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    getDb()
      .prepare(
        "INSERT INTO communications (id, lead_id, channel, direction, status, message, created_at) VALUES (?,?,?,?,?,?,?)"
      )
      .run("comm_old", "hz-old", "whatsapp", "outbound", "sent", "ontem", yesterday);

    recordCommunication({ leadId: "hz-old", channel: "whatsapp", status: "sent", message: "hoje (resposta)" });
    recordCommunication({ leadId: "hz-new", channel: "whatsapp", status: "sent", message: "hoje (primeiro contato)" });
    recordCommunication({ leadId: "hz-new", channel: "email", status: "sent", message: "e-mail não conta" });

    const usage = getHumanizeUsage();
    expect(usage.sentToday).toBe(2);
    expect(usage.newContactsToday).toBe(1);
  });
});

describe("humanizeService — gate de envio", () => {
  beforeEach(() => {
    clearHumanizeSettings();
    resetHumanizePacer();
  });

  it("barra fora da janela e informa quando libera", () => {
    const gate = evaluateSendGate({
      purpose: "prospect",
      now: at(7, 10), // sábado
      settings: { ...FAST, prospectStartHour: 8, prospectEndHour: 18, prospectWeekdaysOnly: true },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("janela de prospecção");
    expect(gate.nextAllowedAt).toBeTruthy();
  });

  it("barra quando o teto diário total estourou", () => {
    seedLead("hz-cap");
    recordCommunication({ leadId: "hz-cap", channel: "whatsapp", status: "sent", message: "já enviada hoje" });

    const gate = evaluateSendGate({
      purpose: "reply",
      now: at(9, 10),
      settings: { ...FAST, dailyTotalCap: 1 },
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("Teto diário de 1");
  });

  it("barra o primeiro contato quando o teto de contatos novos estourou — resposta a lead antigo passa", () => {
    seedLead("hz-resp");
    recordCommunication({ leadId: "hz-resp", channel: "whatsapp", status: "sent", message: "primeiro contato" });
    seedLead("hz-novo");

    const settings = { ...FAST, dailyNewCap: 1 };

    const blocked = evaluateSendGate({ leadId: "hz-novo", purpose: "prospect", now: at(9, 10), settings });
    expect(blocked.allowed).toBe(false);
    expect(blocked.isFirstContact).toBe(true);
    expect(blocked.reason).toContain("contatos novos");

    // "now" real: os envios semeados usam o relógio real, e um "now" fake
    // (ontem) faria o gate barrar pela pausa entre envios, não pelo teto.
    const allowed = evaluateSendGate({ leadId: "hz-resp", purpose: "reply", now: new Date(), settings });
    expect(allowed.isFirstContact).toBe(false);
    expect(allowed.allowed).toBe(true);
  });

  it("sem humanização o gate libera tudo", () => {
    const gate = evaluateSendGate({
      purpose: "prospect",
      now: at(7, 3),
      settings: { ...FAST, enabled: false, prospectStartHour: 8, prospectEndHour: 18, prospectWeekdaysOnly: true },
    });
    expect(gate.allowed).toBe(true);
  });
});

describe("humanizeService — persistência das configurações", () => {
  beforeEach(() => {
    clearHumanizeSettings();
  });

  it("grava, faz clamp e relê os valores", () => {
    const saved = saveHumanizeSettings({
      enabled: true,
      replyStartHour: 7,
      replyEndHour: 20,
      typingPerCharMs: 99999, // acima do máximo → clamp em 500
      dailyTotalCap: 60,
      dailyNewCap: 30,
    });
    expect(saved.dailyTotalCap).toBe(60);
    expect(saved.dailyNewCap).toBe(30);
    expect(getHumanizeSettings().typingPerCharMs).toBe(500);
  });

  it("recusa janela incoerente sem gravar nada", () => {
    saveHumanizeSettings({ replyStartHour: 7, replyEndHour: 20 });
    expect(() => saveHumanizeSettings({ replyStartHour: 20, replyEndHour: 20 })).toThrow(HumanizeSettingsError);
    expect(getHumanizeSettings().replyStartHour).toBe(7);
  });
});

describe("humanizeService — envio real (integração com contactService)", () => {
  const lead = {
    id: "hz-send",
    name: "Empresa Teste",
    phone: "11 98888-7777",
    pipelineStatus: "prospect" as const,
    savedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let stored: any;

  beforeEach(() => {
    clearHumanizeSettings();
    resetHumanizePacer();
    stored = seedLead(lead.id);
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.EVOLUTION_API_URL;
    delete process.env.WHATSMIAU_API_URL;
    delete process.env.META_WHATSAPP_TOKEN;
    setSetting("whatsapp_provider", "");
    process.env.WHATSAPP_API_URL = "https://api.exemplo/zapi";
    process.env.WHATSAPP_API_TOKEN = "tok";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_API_URL;
    delete process.env.WHATSAPP_API_TOKEN;
  });

  it("envia dentro da janela e registra a simulação de digitação", async () => {
    saveHumanizeSettings({
      enabled: true,
      replyStartHour: 0,
      replyEndHour: 24,
      prospectStartHour: 0,
      prospectEndHour: 24,
      prospectWeekdaysOnly: false,
      typingBaseMs: 400,
      typingPerCharMs: 0,
      typingMaxMs: 400,
      pauseMinSeconds: 0,
      pauseMaxSeconds: 0,
      dailyTotalCap: 60,
      dailyNewCap: 30,
    });

    const startedAt = Date.now();
    const result = await sendWhatsApp(stored, "Olá! Tudo bem?", undefined, "reply");
    const elapsed = Date.now() - startedAt;

    expect(result.status).toBe("sent");
    expect(elapsed).toBeGreaterThanOrEqual(300); // digitou antes de enviar (400ms ±15%)
    expect(result.detail).toContain("simulação de digitação");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bloqueia fora da janela e registra a falha com o motivo", async () => {
    const hour = (new Date().getHours() + 2) % 24;
    saveHumanizeSettings({
      enabled: true,
      replyStartHour: hour,
      replyEndHour: (hour + 1) % 24 === hour ? hour + 1 : (hour + 1) % 24,
      typingBaseMs: 0,
      typingPerCharMs: 0,
      typingMaxMs: 0,
      pauseMinSeconds: 0,
      pauseMaxSeconds: 0,
    });

    const result = await sendWhatsApp(stored, "Fora do horário", undefined, "reply");

    expect(result.status).toBe("failed");
    expect(result.blocked).toBe(true);
    expect(result.detail).toContain("janela de respostas");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("runPaced respeita a pausa entre envios", async () => {
    saveHumanizeSettings({
      enabled: true,
      replyStartHour: 0,
      replyEndHour: 24,
      prospectStartHour: 0,
      prospectEndHour: 24,
      prospectWeekdaysOnly: false,
      typingBaseMs: 0,
      typingPerCharMs: 0,
      typingMaxMs: 0,
      pauseMinSeconds: 1,
      pauseMaxSeconds: 1,
      dailyTotalCap: 60,
      dailyNewCap: 30,
    });

    const first = await runPaced({ purpose: "reply", message: "a", task: async () => "1" });
    expect(first.sent).toBe(true);

    const startedAt = Date.now();
    const second = await runPaced({ purpose: "reply", message: "b", task: async () => "2" });
    expect(second.sent).toBe(true);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900); // esperou ~1s da pausa
  });
});
