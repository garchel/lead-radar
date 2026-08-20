import { contactLead, ContactOptions, ContactResult } from "./contactService";
import {
  createInteraction,
  getInteractionById,
  getInteractionsByLead,
  updateInteraction,
  upsertLead,
  getLeadById,
} from "../store/db";
import { InteractionOutcome, LeadInteraction, StoredLead } from "../store/types";

export const NEGATIVE_RECONTACT_DAYS = 30;
export const NO_RESPONSE_RECONTACT_DAYS = 7;

type ContactPolicy = {
  allowed: boolean;
  reason?: string;
  nextContactAt?: string;
};

export type ContactDispatchResult = ContactResult & {
  blocked?: boolean;
  interactionId?: string;
  nextContactAt?: string;
};

export class ContactPolicyError extends Error {
  readonly nextContactAt?: string;

  constructor(message: string, nextContactAt?: string) {
    super(message);
    this.name = "ContactPolicyError";
    this.nextContactAt = nextContactAt;
  }
}

function addDays(isoDate: string, days: number): string {
  return new Date(new Date(isoDate).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function getContactPolicy(lead: StoredLead, now = new Date()): ContactPolicy {
  if (lead.doNotContact) {
    return { allowed: false, reason: "A empresa solicitou não receber novos contatos." };
  }

  if (lead.nextContactAt) {
    const next = new Date(lead.nextContactAt);
    if (Number.isNaN(next.getTime())) {
      return { allowed: false, reason: "O lead possui uma data de recontato inválida; revise o cadastro." };
    }
    if (next > now) {
      return {
        allowed: false,
        reason: `Novo contato permitido somente a partir de ${next.toLocaleString("pt-BR")}.`,
        nextContactAt: lead.nextContactAt,
      };
    }
    return { allowed: true, nextContactAt: lead.nextContactAt };
  }

  if (lead.lastContactAt || lead.pipelineStatus === "contacted" || lead.pipelineStatus === "declined") {
    return {
      allowed: false,
      reason: "Já existe contato registrado sem uma janela de recontato autorizada. Registre o resultado da interação antes de tentar novamente.",
    };
  }

  return { allowed: true };
}

export function nextContactForOutcome(outcome: InteractionOutcome, respondedAt: string): string | undefined {
  if (outcome === "negative") return addDays(respondedAt, NEGATIVE_RECONTACT_DAYS);
  if (outcome === "no_response") return addDays(respondedAt, NO_RESPONSE_RECONTACT_DAYS);
  return undefined;
}

function appendNote(existing: string | undefined, note: string | undefined): string | undefined {
  if (!note?.trim()) return existing;
  return existing ? `${existing}\n${note.trim()}` : note.trim();
}

export async function dispatchLeadContact(
  lead: StoredLead,
  options: ContactOptions = {}
): Promise<ContactDispatchResult> {
  const policy = getContactPolicy(lead);
  const channel = options.channel || (lead.phone ? "whatsapp" : "email");
  const to = channel === "whatsapp" ? String(lead.phone || "").replace(/\D/g, "") : String(lead.email || "");

  if (!policy.allowed) {
    return {
      channel,
      status: "failed",
      communicationId: "",
      to,
      detail: policy.reason || "Contato bloqueado pela política de recontato.",
      blocked: true,
      nextContactAt: policy.nextContactAt,
    };
  }

  const result = await contactLead(lead, options);
  const occurredAt = new Date().toISOString();
  const interactionType = lead.lastContactAt ? "follow_up" : "initial_contact";
  const interaction = createInteraction({
    leadId: lead.id,
    type: interactionType,
    channel: result.channel,
    deliveryStatus: result.status,
    outcome: "pending",
    message: options.message || lead.analysis?.[result.channel === "email" ? "customPitchEmail" : "customPitchWhatsApp"],
    occurredAt,
    communicationId: result.communicationId || undefined,
  });

  if (result.status === "sent") {
    const updatedLead = upsertLead({
      ...lead,
      pipelineStatus: "contacted",
      lastContactAt: occurredAt,
      lastContactOutcome: "pending",
      nextContactAt: undefined,
      contactAttempts: (lead.contactAttempts || 0) + 1,
      updatedAt: occurredAt,
    });
    return {
      ...result,
      interactionId: interaction.id,
      nextContactAt: updatedLead.nextContactAt,
    };
  }

  return { ...result, interactionId: interaction.id };
}

export function recordInteractionOutcome(
  leadId: string,
  outcome: Exclude<InteractionOutcome, "pending">,
  options: { interactionId?: string; notes?: string; respondedAt?: string } = {}
): { lead: StoredLead; interaction: LeadInteraction } {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error("Lead não encontrado.");

  const interaction = options.interactionId
    ? getInteractionById(options.interactionId)
    : getInteractionsByLead(leadId).find((item) => item.deliveryStatus === "sent" && item.outcome === "pending");
  if (!interaction || interaction.leadId !== leadId || interaction.deliveryStatus !== "sent" || interaction.outcome !== "pending") {
    throw new Error("Nenhuma interação enviada e pendente de resultado foi encontrada para este lead.");
  }

  const respondedAt = options.respondedAt || new Date().toISOString();
  if (Number.isNaN(new Date(respondedAt).getTime())) {
    throw new Error("respondedAt deve ser uma data válida em formato ISO.");
  }
  const nextContactAt = nextContactForOutcome(outcome, respondedAt);
  const updatedInteraction = updateInteraction(interaction.id, {
    outcome,
    respondedAt,
    nextContactAt,
    notes: appendNote(interaction.notes, options.notes),
  });
  if (!updatedInteraction) throw new Error("Não foi possível atualizar a interação.");

  const nextStatus = outcome === "negative" || outcome === "do_not_contact"
    ? "declined"
    : outcome === "meeting_scheduled" || outcome === "negotiating"
      ? "negotiating"
      : "contacted";
  const updatedLead = upsertLead({
    ...lead,
    pipelineStatus: nextStatus,
    lastResponseAt: respondedAt,
    lastContactOutcome: outcome,
    nextContactAt,
    doNotContact: outcome === "do_not_contact" ? true : lead.doNotContact,
    notes: appendNote(lead.notes, options.notes),
    updatedAt: respondedAt,
  });

  return { lead: updatedLead, interaction: updatedInteraction };
}

export function ensureContactAllowed(lead: StoredLead) {
  const policy = getContactPolicy(lead);
  if (!policy.allowed) throw new ContactPolicyError(policy.reason || "Contato bloqueado.", policy.nextContactAt);
}
