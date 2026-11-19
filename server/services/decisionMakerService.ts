/**
 * Dono/responsável pelo negócio (o "decisor").
 *
 * O WhatsApp que aparece no Google de uma empresa quase sempre cai na recepção:
 * quem responde é funcionário, não quem decide contratar site. Este serviço guarda
 * o contato de quem decide sem perder o número do negócio, e centraliza a regra de
 * "para qual número a conversa vai".
 *
 * Fluxo: funcionário diz "não sou o dono, fala com a Maria, 67 99999-0000" → a
 * Clara grava aqui → todo envio seguinte sai para o número da Maria.
 */
import { getDb } from "../store/schema";
import { getLeadById, updateLeadDecisionMaker } from "../store/db";
import { normalizePhone } from "./leadIdentity";
import type { StoredLead } from "../store/types";

export interface DecisorInput {
  name?: string;
  phone: string;
  /** `funcionario` quando veio de quem atendeu; `manual` quando o dono cadastrou. */
  source?: string;
  /** Nome de quem passou o contato (o atendente). Vai para as notas do lead. */
  referredBy?: string;
}

export interface DecisorResultado {
  ok: boolean;
  erro?: string;
  lead?: StoredLead;
}

/**
 * Telefone para onde a mensagem sai: o do dono quando conhecido, senão o da
 * empresa. Sempre canonicalizado (55 + DDD + 9º dígito), porque o WhatsApp
 * devolve o celular sem o 9 e a comparação precisa casar.
 */
export function telefoneDeEnvio(lead: Pick<StoredLead, "phone" | "dmPhone"> | undefined | null): string {
  if (!lead) return "";
  return String(lead.dmPhone || lead.phone || "").replace(/\D/g, "");
}

/** O contato salvo é o dono/responsável, e não o número da empresa? */
export function conversaComDecisor(lead: Pick<StoredLead, "phone" | "dmPhone"> | undefined | null): boolean {
  if (!lead?.dmPhone) return false;
  return normalizePhone(lead.dmPhone) !== normalizePhone(lead.phone);
}

export function salvarDecisor(leadId: string, input: DecisorInput): DecisorResultado {
  const lead = getLeadById(leadId);
  if (!lead) return { ok: false, erro: "Lead não encontrado." };

  const phone = normalizePhone(input.phone);
  // Número brasileiro com DDI: 55 + DDD (2) + 8 ou 9 dígitos.
  if (!/^55\d{10,11}$/.test(phone)) {
    return { ok: false, erro: "Telefone inválido. Use DDD + número, por exemplo 67 99999-0000." };
  }
  if (phone === normalizePhone(lead.phone)) {
    return { ok: false, erro: "Esse é o número da própria empresa, não do responsável." };
  }

  const nome = String(input.name || "").trim().slice(0, 80) || undefined;
  const quemIndicou = String(input.referredBy || "").trim().slice(0, 60) || undefined;
  if (quemIndicou) {
    const nota = String(lead.notes || "").replace(/\s*\|?\s*indicado por [^|;]+/i, "").trim();
    getDb()
      .prepare("UPDATE leads SET notes = ? WHERE id = ?")
      .run(`${nota}${nota ? " | " : ""}indicado por ${quemIndicou}`, leadId);
  }
  const atualizado = updateLeadDecisionMaker(leadId, {
    name: nome,
    phone,
    source: input.source || "manual",
  });
  return atualizado ? { ok: true, lead: atualizado } : { ok: false, erro: "Não consegui salvar o contato." };
}

/**
 * Primeira linha da abordagem quando a conversa já é com o dono por indicação.
 * Sem isso o dono recebe um "achei vocês no Google" e não entende de onde veio.
 */
export function aberturaPorIndicacao(lead: StoredLead): string | null {
  if (!conversaComDecisor(lead)) return null;
  const quem = lead.notes?.match(/indicado por ([^|;]+)/i)?.[1]?.trim();
  return quem
    ? `O ${quem} me passou seu contato: disse que você é quem cuida do site de vocês.`
    : "Me passaram seu contato dizendo que você é quem decide sobre o site de vocês.";
}
