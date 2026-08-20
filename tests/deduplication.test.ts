import { describe, expect, it } from "vitest";
import {
  createInteraction,
  findDuplicateMatch,
  getDueFollowUps,
  getLeadById,
  upsertLead,
} from "../server/store/db";
import type { StoredLead } from "../server/store/types";

const base: StoredLead = {
  id: "dedup-1",
  name: "Clínica Sorriso",
  category: "Dentista",
  city: "Campinas",
  state: "SP",
  phone: "(19) 91234-5678",
  pipelineStatus: "prospect",
};

describe("deduplicação (findDuplicateMatch)", () => {
  it("classifica telefone igual como match forte", () => {
    upsertLead(base);
    const match = findDuplicateMatch({
      ...base,
      id: "outro-id",
      name: "Clínica Sorriso Ltda",
      websiteUrl: "https://sorriso.example",
    });
    expect(match?.matchType).toBe("strong");
    expect(match?.lead.id).toBe("dedup-1");
  });

  it("classifica nome+cidade+UF como match fraco", () => {
    upsertLead(base);
    const match = findDuplicateMatch({ ...base, id: "outro-id", phone: undefined });
    expect(match?.matchType).toBe("weak");
  });

  it("skipDedup permite cadastrar a empresa em separado", () => {
    upsertLead(base);
    const separate = upsertLead(
      { ...base, id: "dedup-2", name: "Clínica Sorriso" },
      { skipDedup: true }
    );
    expect(separate.id).toBe("dedup-2");
    expect(getLeadById("dedup-1")).toBeDefined();
    expect(getLeadById("dedup-2")).toBeDefined();
  });

  it("merge padrão (fluxo autônomo) unifica e preserva o histórico", () => {
    const contactedAt = new Date().toISOString();
    upsertLead({ ...base, lastContactAt: contactedAt });
    const merged = upsertLead({
      ...base,
      id: "dedup-3",
      name: "Clínica Sorriso",
      websiteUrl: "https://sorriso.example",
    });
    expect(merged.id).toBe("dedup-1");
    expect(merged.websiteUrl).toBe("https://sorriso.example");
    expect(merged.lastContactAt).toBe(contactedAt);
    expect(getLeadById("dedup-3")).toBeUndefined();
  });
});

describe("fila de recontatos autorizados", () => {
  it("getDueFollowUps retorna recontato com prazo vencido e sem interação mais nova", () => {
    upsertLead({ ...base, doNotContact: false });
    createInteraction({
      leadId: "dedup-1",
      type: "initial_contact",
      channel: "whatsapp",
      deliveryStatus: "sent",
      outcome: "negative",
      occurredAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
      nextContactAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const due = getDueFollowUps();
    expect(due.some((item) => item.leadId === "dedup-1")).toBe(true);
  });
});