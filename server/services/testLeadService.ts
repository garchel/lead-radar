/**
 * Números de teste (o Paulo e quem ele convidar).
 *
 * Esses números não são leads reais: não entram na coleta, não gastam cota e não
 * contam como prospecção. Mas a experiência precisa ser idêntica à de um lead de
 * verdade, então quando a pessoa manda a primeira mensagem o CRM responde com a
 * abordagem de prospecção, como se ela tivesse sido encontrada no Google.
 *
 * A marcação vive na coluna `leads.is_test`, não em `notes` — assim dá para
 * filtrar, medir e, se um dia virar cliente, desmarcar.
 */
import { getCommunicationsByLead } from "../store/db";
import type { StoredLead } from "../store/types";
import { buildProspectMessage } from "./autoProspectingService";
import { dispatchLeadReply } from "./interactionService";
import { previewExists } from "./previewService";
import { whatsAppify } from "./messageStyle";
import { SIMULATION_LEAD_ID } from "./simulationService";

/** Este lead é um número de teste? */
export function isTestLead(lead: Pick<StoredLead, "isTest"> | null | undefined): boolean {
  return Boolean(lead?.isTest);
}

/**
 * Já mandamos alguma coisa para este número?
 *
 * A prospecção automática só vale para a PRIMEIRA mensagem que a pessoa manda.
 * Depois disso a conversa é conduzida normalmente pelo agente.
 */
export function hasPriorOutbound(leadId: string): boolean {
  try {
    return getCommunicationsByLead(leadId).some((item) => item.direction === "outbound");
  } catch {
    return false;
  }
}

/** Deve disparar a prospecção automática agora? */
export function shouldPitchTestLead(lead: StoredLead): boolean {
  // O lead de simulação tem fluxo próprio: quem manda o D0 é a simulação, com o
  // nome da empresa escolhida. Deixar o gancho de número de teste entrar aqui já
  // gerou duas mensagens nossas seguidas e um texto fora do padrão aprovado.
  if (lead.id === SIMULATION_LEAD_ID) return false;
  return isTestLead(lead) && !lead.doNotContact && !hasPriorOutbound(lead.id);
}

/** Primeiro nome do perfil do WhatsApp, quando parece nome de pessoa. */
function firstName(pushName?: string): string | null {
  const raw = String(pushName || "").trim();
  if (!raw) return null;
  const first = raw.split(/\s+/)[0];
  if (first.length < 2 || first.length > 20) return null;
  if (!/^[\p{L}][\p{L}'-]*$/u.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Mensagem de prospecção enviada a um número de teste.
 *
 * Mesmo tom e mesmas regras de estilo do primeiro contato real: blocos curtos,
 * sem travessão, prévia grátis explícita e nenhuma menção a preço ou pacote.
 */
export function buildTestPitchMessage(pushName?: string, lead?: StoredLead): string {
  // Número de teste que já tem cara de empresa (nome, categoria, cidade) recebe a
  // mesma abordagem aprovada dos leads reais. Sem isso ele recebia uma versão
  // antiga, com ⭐ e "sem custo nenhum", que não existe mais em lugar nenhum.
  if (lead && (lead.category || lead.city)) {
    return buildProspectMessage(lead, { previewPronta: previewExists(lead) });
  }

  const nome = firstName(pushName);
  const lines = [
    nome ? `Oi, ${nome}, tudo bem? 👋 Aqui é a Clara, da Vértice.` : "Oi, tudo bem? 👋 Aqui é a Clara, da Vértice.",
    "",
    "Montei uma prévia gratuita de como ficaria uma página profissional pro seu negócio, com botão direto pro WhatsApp.",
    "",
    "Posso te mandar o link pra você dar uma olhada sem compromisso? 😊",
  ];

  return whatsAppify(lines.join("\n"));
}

/**
 * Manda a prospecção para um número de teste na primeira mensagem dele.
 *
 * Roda em segundo plano no webhook: a humanização pode segurar o envio por até
 * ~2 minutos e o webhook precisa responder rápido ao gateway.
 */
export async function pitchTestLeadOnFirstMessage(
  lead: StoredLead,
  pushName?: string
): Promise<{ sent: boolean; detail: string }> {
  if (!shouldPitchTestLead(lead)) {
    return { sent: false, detail: "não é a primeira mensagem do número de teste" };
  }

  const message = buildTestPitchMessage(pushName, lead);
  const dispatch = await dispatchLeadReply(lead, { message, channel: "whatsapp", hook: "teste" });

  return {
    sent: dispatch.status === "sent",
    detail: dispatch.status === "sent" ? "prospecção enviada ao número de teste" : dispatch.detail,
  };
}
