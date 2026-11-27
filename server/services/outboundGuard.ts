/**
 * Travas de envio fora da conversa.
 *
 * Incidente real: a mensagem fixa "Perfeito! Dá um minutinho que eu já te mando o
 * link" saiu para três números diferentes. Texto de template não é fala: quando ele
 * se repete para pessoas que não conversaram, o número vira spam e o WhatsApp
 * derruba a instância.
 *
 * Estas travas rodam no ponto único de saída (deliverWhatsApp / mídia), antes de
 * qualquer provider, e valem para todo caminho: webhook, agente, MCP, cadência.
 */
import { getDb } from "../store/schema";
import { getSetting } from "../store/db";

export type VereditoEnvio = { liberado: boolean; motivo?: string; bloqueadoPor?: "freio" | "rajada" | "repeticao" };

/** Chave de comparação do texto: sem emoji, sem espaço duplo, minúsculo, 60 chars. */
export function chaveDoTexto(mensagem: string): string {
  return String(mensagem || "")
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Freio de mão do dono: `automation_outbound_freeze=true` para tudo. */
export function freioLigado(): boolean {
  try {
    return String(getSetting("automation_outbound_freeze") || "").trim() === "true";
  } catch {
    return false;
  }
}

/** Rajada: mais de `limite` envios em `janelaSegundos`. */
export function rajadaEstourada(limite = 12, janelaSegundos = 60): boolean {
  const desde = new Date(Date.now() - janelaSegundos * 1000).toISOString();
  const r = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM communications WHERE direction = 'outbound' AND status = 'sent' AND created_at >= ?",
    )
    .get(desde) as any;
  return Number(r?.n || 0) >= limite;
}

/**
 * Mesmo texto para OUTRA pessoa dentro da janela.
 *
 * Elogio, resposta e pergunta variam por lead; template não. Se o texto idêntico já
 * foi para outro lead há pouco, isso é disparo em massa, não conversa — bloqueia.
 */
export function repeticaoParaOutroLead(leadId: string, mensagem: string, janelaMinutos = 60): { repetiu: boolean; paraQuem?: string } {
  const chave = chaveDoTexto(mensagem);
  if (chave.length < 12) return { repetiu: false }; // "ok", "oi" não são template
  const desde = new Date(Date.now() - janelaMinutos * 60_000).toISOString();
  const linhas = getDb()
    .prepare(
      "SELECT lead_id, message FROM communications WHERE direction = 'outbound' AND status = 'sent' AND created_at >= ? AND lead_id != ?",
    )
    .all(desde, leadId) as any[];
  const igual = linhas.find((l) => chaveDoTexto(l.message) === chave);
  return igual ? { repetiu: true, paraQuem: String(igual.lead_id) } : { repetiu: false };
}

export function avaliarEnvio(input: { leadId: string; mensagem: string; limiteRajada?: number }): VereditoEnvio {
  if (freioLigado()) {
    return { liberado: false, bloqueadoPor: "freio", motivo: "Envio congelado pelo dono (automation_outbound_freeze)." };
  }
  if (rajadaEstourada(input.limiteRajada ?? 12)) {
    return { liberado: false, bloqueadoPor: "rajada", motivo: "Mais de 12 mensagens no último minuto: envio pausado por segurança." };
  }
  const rep = repeticaoParaOutroLead(input.leadId, input.mensagem);
  if (rep.repetiu) {
    return {
      liberado: false,
      bloqueadoPor: "repeticao",
      motivo: `Este texto já saiu para outro lead (${rep.paraQuem}) na última hora. Texto de template não se repete para pessoas diferentes.`,
    };
  }
  return { liberado: true };
}
