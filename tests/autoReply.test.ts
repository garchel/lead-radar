import { describe, expect, it } from "vitest";
import { detectarAutoResposta } from "../server/services/autoReplyService";

/**
 * Atendente eletrônico não é resposta humana. Estes casos vêm de conversas
 * reais de WhatsApp comercial (menu numerado, aviso de ausência, confirmação
 * automática), e o falso positivo é tão caro quanto o falso negativo: marcar
 * "pode mandar" como robô impediria a entrega da prévia.
 */

describe("detectarAutoResposta", () => {
  it("reconhece menu numerado", () => {
    expect(detectarAutoResposta("Olá! Digite 1 para agendar, 2 para valores").automatica).toBe(true);
    expect(detectarAutoResposta("Escolha uma opção:").automatica).toBe(true);
  });

  it("reconhece aviso de ausência e horário", () => {
    expect(detectarAutoResposta("Estamos fora do horário de atendimento. Retornaremos amanhã.").automatica).toBe(true);
    expect(detectarAutoResposta("Nosso horário de atendimento é de segunda a sexta. Aguarde.").automatica).toBe(true);
  });

  it("reconhece mensagem automática declarada", () => {
    expect(detectarAutoResposta("Esta é uma mensagem automática. Em breve responderemos.").automatica).toBe(true);
    expect(detectarAutoResposta("Recebemos sua mensagem, nosso time responde em breve").automatica).toBe(true);
  });

  it("NÃO marca resposta humana curta como robô", () => {
    const humanas = [
      "Pode mandar sim",
      "oi",
      "quanto custa?",
      "manda o link",
      "legal, vou ver",
      "fala com o Carlos, ele cuida disso",
      "bom dia",
      "tudo bem? pode mandar",
    ];
    for (const texto of humanas) {
      expect(detectarAutoResposta(texto).automatica, texto).toBe(false);
    }
  });

  it("texto vazio não é automático", () => {
    expect(detectarAutoResposta("").automatica).toBe(false);
  });

  it("devolve motivo quando detecta", () => {
    const v = detectarAutoResposta("Digite 1 para falar com um atendente");
    expect(v.automatica).toBe(true);
    expect(v.motivo).toBeTruthy();
    expect(v.confianca).toBeGreaterThan(0.5);
  });
});
