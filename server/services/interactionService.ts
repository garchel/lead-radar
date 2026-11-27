import { contextoDaConversa } from "./conversationContextService";
import { telefoneDeEnvio } from "./decisionMakerService";
import { contactLead, ContactOptions, ContactResult, sendEmail, sendWhatsApp } from "./contactService";
import {
  createInteraction,
  getInteractionById,
  getInteractionsByLead,
  getCommunicationsByLead,
  updateInteraction,
  upsertLead,
  getLeadById,
  countFailedCommunications,
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

/**
 * A última mensagem da conversa é do lead? Então estamos respondendo, não
 * abordando — e a janela de recontato não se aplica.
 */
export function temMensagemSemResposta(leadId: string): boolean {
  try {
    return getCommunicationsByLead(leadId)[0]?.direction === "inbound";
  } catch {
    return false;
  }
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
  const channel0 = options.channel || (telefoneDeEnvio(lead) ? "whatsapp" : "email");
  const to0 = channel0 === "whatsapp" ? telefoneDeEnvio(lead) : String(lead.email || "");
  // LGPD vem antes de tudo, inclusive numa resposta.
  if (lead.doNotContact) {
    return {
      channel: channel0,
      status: "failed",
      communicationId: "",
      to: to0,
      detail: "A empresa solicitou não receber novos contatos.",
      blocked: true,
    };
  }

  // A política de recontato existe para NÃO insistir com quem não respondeu. Ela
  // não pode barrar resposta a quem acabou de escrever: foi o que deixou a Clara
  // muda com o lead pedindo a prévia ("Já existe contato registrado sem uma janela
  // de recontato autorizada"). Conversa aberta e propósito "reply" passam direto.
  const conversaAberta = temMensagemSemResposta(lead.id);
  const policy: ContactPolicy =
    options.ignoreCooldown || conversaAberta ? { allowed: true } : getContactPolicy(lead);
  const channel = options.channel || (telefoneDeEnvio(lead) ? "whatsapp" : "email");
  const to = channel === "whatsapp" ? telefoneDeEnvio(lead) : String(lead.email || "");

  // Número que já recusou duas vezes não recebe nova abordagem. A regra existia
  // só dentro do autopilot; aqui vale para TODA porta (UI, cadência, agente),
  // porque insistir em número morto é o caminho mais curto para restrição.
  if ((options.purpose ?? "prospect") === "prospect" && countFailedCommunications(lead.id) >= 2) {
    return {
      channel,
      status: "failed",
      communicationId: "",
      to,
      detail: "2 envios falharam para este número — abordagem suspensa (verifique o número antes de tentar de novo).",
      blocked: true,
    };
  }

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

  const result = await contactLead(lead, { ...options, purpose: options.purpose ?? "prospect" });
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

/**
 * Responde a uma mensagem recebida do lead.
 *
 * Responder quem escreveu não é spam: a janela de recontato (7/30 dias) não se
 * aplica a uma conversa aberta. O opt-out LGPD (`doNotContact`) continua
 * bloqueando sempre. Quando não há conversa aberta, delega para
 * `dispatchLeadContact` (portanto mantém a política anti-duplicidade).
 */
/**
 * Envios em andamento por lead.
 *
 * O envio tem espera de digitação (segundos), então duas tentativas que começam
 * juntas — o monitor respondendo duas mensagens seguidas e a entrega automática da
 * página, por exemplo — liam o histórico ANTES de qualquer uma gravar. As duas
 * viam "última mensagem é do lead", as duas passavam pelo guarda e o lead recebia
 * duas respostas nossas seguidas. Esta trava fecha essa janela.
 */
const enviandoPorLead = new Set<string>();

/** Mesma regra de memória: aviso e fallback não fecham o turno. */
function turnoAbertoParaResposta(leadId: string): boolean {
  try {
    const ctx = contextoDaConversa(leadId);
    if (ctx.turnos.length > 0) return ctx.fatos.aguardandoResposta;
    // Sem histórico: quem nunca foi contatado está com o turno aberto (primeiro envio);
    // quem já foi contatado antes não tem conversa para responder.
    const lead = getLeadById(leadId);
    return !lead?.lastContactAt;
  } catch {
    const h = getCommunicationsByLead(leadId);
    return h[0]?.direction === "inbound";
  }
}

export async function dispatchLeadReply(
  lead: StoredLead,
  options: ContactOptions = {}
): Promise<ContactDispatchResult> {
  if (!options.force) {
    if (enviandoPorLead.has(lead.id)) {
      return {
        channel: options.channel || (telefoneDeEnvio(lead) ? "whatsapp" : "email"),
        status: "failed",
        communicationId: "",
        to: options.channel === "email" ? String(lead.email || "") : telefoneDeEnvio(lead),
        detail: "Já existe uma resposta nossa sendo enviada para este lead.",
        blocked: true,
      };
    }
    enviandoPorLead.add(lead.id);
    try {
      return await dispatchLeadReplyInterno(lead, options);
    } finally {
      enviandoPorLead.delete(lead.id);
    }
  }
  return dispatchLeadReplyInterno(lead, options);
}

async function dispatchLeadReplyInterno(
  lead: StoredLead,
  options: ContactOptions = {}
): Promise<ContactDispatchResult> {
  const channel = options.channel || (telefoneDeEnvio(lead) ? "whatsapp" : "email");
  const to = channel === "whatsapp" ? telefoneDeEnvio(lead) : String(lead.email || "");

  if (lead.doNotContact) {
    return {
      channel,
      status: "failed",
      communicationId: "",
      to,
      detail: "A empresa solicitou não receber novos contatos.",
      blocked: true,
    };
  }

  const history = getCommunicationsByLead(lead.id);
  // A conversa está aberta quando a ÚLTIMA mensagem do lead foi recebida.
  const latest = history[0];
  const hasOpenReply = turnoAbertoParaResposta(lead.id);

  // Duas nossas seguidas quebram a conversa. O chamador pode ter lido o estado
  // antes de outra rota responder (foi o que gerou mensagem dupla na simulação),
  // então quem decide é o banco AGORA, não o `already_answered` do monitor.
  const turnoAberto = turnoAbertoParaResposta(lead.id);
  if (!turnoAberto && !options.force) {
    return {
      channel,
      status: "failed",
      communicationId: "",
      to,
      detail: "A última mensagem da conversa é nossa. Espere o lead responder antes de enviar outra.",
      blocked: true,
    };
  }

  if (!hasOpenReply) {
    // Sem conversa aberta, `dispatchLeadContact` faria uma ABORDAGEM — mas isto
    // veio de `dispatchLeadReply`, então marcamos o propósito como resposta
    // (senão o bloqueio de 2 falhas impediria responder quem nos procurou).
    return dispatchLeadContact(lead, {
      ...options,
      purpose: options.purpose ?? "reply",
      // Envio manual (`force`) também ignora a janela de recontato: o dono já
      // olhou a conversa e decidiu mandar.
      ignoreCooldown: options.ignoreCooldown ?? options.force,
    });
  }

  const message = options.message?.trim();
  if (!message) {
    throw new Error(`Informe o texto da resposta para ${lead.name}.`);
  }

  const result =
    channel === "email"
      ? await sendEmail(lead, options.subject || `Resposta — ${lead.name}`, message, options.hook)
      : await sendWhatsApp(lead, message, options.hook, "reply");

  const occurredAt = new Date().toISOString();
  const interaction = createInteraction({
    leadId: lead.id,
    type: "follow_up",
    channel: result.channel,
    deliveryStatus: result.status,
    outcome: "pending",
    message,
    occurredAt,
    communicationId: result.communicationId || undefined,
  });

  if (result.status === "sent") {
    upsertLead({
      ...lead,
      lastContactAt: occurredAt,
      lastContactOutcome: "pending",
      contactAttempts: (lead.contactAttempts || 0) + 1,
      updatedAt: occurredAt,
    });
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
