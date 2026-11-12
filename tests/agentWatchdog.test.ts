import { describe, expect, it, beforeEach } from "vitest";
import { findStaleOpenConversations, fallbackEnabled, fallbackMinAgeMinutes } from "../server/services/agentWatchdog";
import { getDb } from "../server/store/schema";
import { recordCommunication, setSetting, upsertLead } from "../server/store/db";
import type { StoredLead } from "../server/store/types";

function seed(id: string, overrides: Partial<StoredLead> = {}): StoredLead {
  const lead: StoredLead = {
    id,
    name: `Clinica ${id}`,
    phone: "5561999999999",
    city: "Goiânia",
    state: "GO",
    pipelineStatus: "contacted",
    websiteStatus: "none",
    ...overrides,
  };
  upsertLead(lead, { skipDedup: true });
  return lead;
}

/** Carimba o horário da comunicação (recordCommunication usa `now`). */
function stamp(commId: string, iso: string) {
  getDb().prepare("UPDATE communications SET created_at = ?, sent_at = ? WHERE id = ?").run(iso, iso, commId);
}

const MINUTES = 60 * 1000;
function minutesAgo(min: number): string {
  return new Date(Date.now() - min * MINUTES).toISOString();
}

describe("rede de segurança do atendimento", () => {
  beforeEach(() => {
    setSetting("automation_agent_fallback", "true");
    setSetting("automation_agent_fallback_minutes", "6");
  });

  it("liga/desliga por setting e respeita a idade mínima configurada", () => {
    expect(fallbackEnabled()).toBe(true);
    setSetting("automation_agent_fallback", "false");
    expect(fallbackEnabled()).toBe(false);
    setSetting("automation_agent_fallback_minutes", "12");
    expect(fallbackMinAgeMinutes()).toBe(12);
    setSetting("automation_agent_fallback_minutes", "abc");
    expect(fallbackMinAgeMinutes()).toBe(6);
  });

  it("acha conversa aberta e antiga", () => {
    const lead = seed("fb-1");
    const commId = recordCommunication({ leadId: lead.id, channel: "whatsapp", direction: "inbound", message: "pode mandar a prévia" });
    stamp(commId, minutesAgo(30));
    expect(findStaleOpenConversations(6)).toContain(lead.id);
  });

  it("ignora conversa recente (o bot ainda pode estar respondendo)", () => {
    const lead = seed("fb-2");
    const commId = recordCommunication({ leadId: lead.id, channel: "whatsapp", direction: "inbound", message: "oi" });
    stamp(commId, minutesAgo(1));
    expect(findStaleOpenConversations(6)).not.toContain(lead.id);
  });

  it("ignora quem já foi respondido depois da mensagem dele", () => {
    const lead = seed("fb-3");
    const inboundId = recordCommunication({ leadId: lead.id, channel: "whatsapp", direction: "inbound", message: "quanto custa?" });
    stamp(inboundId, minutesAgo(40));
    const outboundId = recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      status: "sent",
      message: "a partir de R$ 900, posso mandar a prévia?",
    });
    stamp(outboundId, minutesAgo(35));
    expect(findStaleOpenConversations(6)).not.toContain(lead.id);
  });

  it("ignora opt-out (LGPD) mesmo com conversa aberta e antiga", () => {
    const lead = seed("fb-4", { doNotContact: true });
    const commId = recordCommunication({ leadId: lead.id, channel: "whatsapp", direction: "inbound", message: "não quero mais" });
    stamp(commId, minutesAgo(60));
    expect(findStaleOpenConversations(6)).not.toContain(lead.id);
  });

  it("ignora envio que falhou (não conta como resposta)", () => {
    const lead = seed("fb-6");
    const inboundId = recordCommunication({ leadId: lead.id, channel: "whatsapp", direction: "inbound", message: "e aí?" });
    stamp(inboundId, minutesAgo(45));
    const failedId = recordCommunication({
      leadId: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      status: "failed",
      message: "tentativa que não saiu",
    });
    stamp(failedId, minutesAgo(44));
    expect(findStaleOpenConversations(6)).toContain(lead.id);
  });

  it("respeita o limite de conversas por pulso", () => {
    for (const id of ["fb-l1", "fb-l2", "fb-l3", "fb-l4"]) {
      const lead = seed(id);
      const commId = recordCommunication({ leadId: lead.id, channel: "whatsapp", direction: "inbound", message: "oi" });
      stamp(commId, minutesAgo(90));
    }
    expect(findStaleOpenConversations(6, new Date(), 2)).toHaveLength(2);
  });
});
