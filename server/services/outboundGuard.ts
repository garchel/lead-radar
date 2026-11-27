/**
 * Travas de envio fora da conversa.
 *
 * Incidente real: a mensagem fixa "Perfeito! Dá um minutinho que eu já te mando o
 * link" saiu para três números diferentes. Texto de template não é fala: quando ele
 * se repete para pessoas que não conversaram, o número vira spam e o WhatsApp
 * derruba a instância.
 *
 * O problema não era o TEXTO repetido: era a suíte de testes falando com o gateway
 * real. Comparar texto tratava o sintoma, então essa regra saiu. Ficam as que atacam a
 * causa e o volume: ambiente de teste sem stub de rede, número fictício, freio do dono
 * e rajada.
 *
 * Rodam no ponto único de saída (deliverWhatsApp / mídia), antes de qualquer provider,
 * e valem para todo caminho: webhook, agente, MCP, cadência.
 */
import { getDb } from "../store/schema";
import { getSetting } from "../store/db";

export type VereditoEnvio = { liberado: boolean; motivo?: string; bloqueadoPor?: "freio" | "rajada" | "teste" | "numero-ficticio" };

/**
 * Ambiente de teste. O `tests/setup.ts` apaga as credenciais, mas `dotenv` recarrega o
 * `.env` quando um módulo importa "dotenv/config" DEPOIS do setup — a suíte voltava a
 * falar com o WhatsApp real e mandou "Dá um minutinho" para os números fictícios
 * 5511999990002/4/9 em toda execução. Isso não pode depender de env: é regra.
 */
function redeStubada(): boolean {
  const f: any = (globalThis as any).fetch;
  // vitest.stubGlobal("fetch") marca a função; sem isso, o teste usaria a rede real.
  return Boolean(f && (f._isMockFunction || f.__vitest_mock || f.mock));
}

export function ambienteDeTeste(): boolean {
  const ehTeste = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test" || process.env.LEADRADAR_TEST_MODE === "1";
  // Teste COM fetch stubado é seguro (nada sai). Teste SEM stub é o vazamento real:
  // foi assim que a suíte mandou "Dá um minutinho" para 5511999990002/4/9.
  return ehTeste && !redeStubada();
}

/** Número de mentira de fixture: 55 11 99999-000X, 55 62 99999-000X e afins. */
export function numeroFicticio(to: string): boolean {
  const d = String(to || "").replace(/\D/g, "");
  if (d.length < 12) return false;
  return /9{5}0{2,3}\d?$/.test(d) || /0{6,}\d*$/.test(d.slice(-9));
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

export function avaliarEnvio(input: { leadId: string; mensagem: string; to?: string; limiteRajada?: number }): VereditoEnvio {
  // 1) Nenhum teste fala com WhatsApp real. Nunca.
  if (ambienteDeTeste()) {
    // Visível de propósito: se aparecer no log da suíte, é sinal de que algum teste
    // tentou falar com o WhatsApp real — exatamente o que não pode acontecer.
    console.warn(`[guarda] envio bloqueado (teste sem stub de rede) → ${input.to || "?"}`);
    return { liberado: false, bloqueadoPor: "teste", motivo: "Ambiente de teste: envio real de WhatsApp bloqueado." };
  }
  // 2) Número de fixture (99999-000X) não recebe nada em produção. Em teste com fetch
  //    stubado o número é irrelevante (nada sai), e a suíte usa esses números de propósito.
  if (input.to && numeroFicticio(input.to) && !process.env.VITEST && process.env.NODE_ENV !== "test") {
    return { liberado: false, bloqueadoPor: "numero-ficticio", motivo: `Número fictício (${input.to}): envio bloqueado.` };
  }
  if (freioLigado()) {
    return { liberado: false, bloqueadoPor: "freio", motivo: "Envio congelado pelo dono (automation_outbound_freeze)." };
  }
  if (rajadaEstourada(input.limiteRajada ?? 12)) {
    return { liberado: false, bloqueadoPor: "rajada", motivo: "Mais de 12 mensagens no último minuto: envio pausado por segurança." };
  }
  return { liberado: true };
}
