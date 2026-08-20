import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInteractionsByLead,
  getLeadById,
  upsertLead,
} from "../server/store/db";
import { dispatchLeadContact, getContactPolicy, recordInteractionOutcome } from "../server/services/interactionService";
import type { StoredLead } from "../server/store/types";

const lead: StoredLead = {
  id: "interaction-lead",
  name: "Empresa Interação",
  category: "Dentista",
  city: "Campinas",
  state: "SP",
  phone: "(19) 98765-4321",
  pipelineStatus: "prospect",
  analysis: { customPitchWhatsApp: "Mensagem de prospecção" },
};

beforeEach(() => {
  process.env.WHATSAPP_API_URL = "https://api.exemplo/zapi";
  process.env.WHATSAPP_API_TOKEN = "token";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  upsertLead(lead);
});

describe("política de identidade e recontato", () => {
  it("não cadastra novamente uma empresa com o mesmo telefone", () => {
    const saved = upsertLead({
      ...lead,
      id: "outro-id-gerado-pela-busca",
      name: "Empresa Interação Atualizada",
      websiteUrl: "https://empresa.example",
    });

    expect(saved.id).toBe(lead.id);
    expect(getLeadById("outro-id-gerado-pela-busca")).toBeUndefined();
    expect(getLeadById(lead.id)?.websiteUrl).toBe("https://empresa.example");
  });

  it("bloqueia contato repetido até uma resposta autorizar nova janela", async () => {
    const first = await dispatchLeadContact(lead);
    expect(first.status).toBe("sent");
    expect(first.interactionId).toBeDefined();

    const blocked = await dispatchLeadContact(getLeadById(lead.id)!);
    expect(blocked.status).toBe("failed");
    expect(blocked.blocked).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("libera follow-up 30 dias após resposta negativa", async () => {
    const first = await dispatchLeadContact(lead);
    const oldResponse = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const negative = recordInteractionOutcome(lead.id, "negative", {
      interactionId: first.interactionId,
      respondedAt: oldResponse,
      notes: "Disse que não tem orçamento agora.",
    });

    expect(negative.lead.pipelineStatus).toBe("declined");
    expect(new Date(negative.lead.nextContactAt!).getTime()).toBeLessThan(Date.now());
    expect(getContactPolicy(negative.lead).allowed).toBe(true);

    const followUp = await dispatchLeadContact(negative.lead, { message: "Podemos retomar a conversa?" });
    expect(followUp.status).toBe("sent");
    expect(getInteractionsByLead(lead.id).find((item) => item.id === followUp.interactionId)?.type).toBe("follow_up");
  });

  it("bloqueia permanentemente quando a empresa pede para não ser contatada", async () => {
    const first = await dispatchLeadContact(lead);
    const result = recordInteractionOutcome(lead.id, "do_not_contact", { interactionId: first.interactionId });
    expect(result.lead.doNotContact).toBe(true);
    expect(getContactPolicy(result.lead).allowed).toBe(false);
  });
});
