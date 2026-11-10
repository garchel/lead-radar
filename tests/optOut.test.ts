import { describe, expect, it } from "vitest";
import { detectOptOut } from "../server/services/optOutService";

describe("detecção de opt-out (LGPD)", () => {
  it("reconhece pedidos diretos de descadastro", () => {
    expect(detectOptOut("Pare")).toBe(true);
    expect(detectOptOut("por favor, pare de me mandar mensagens")).toBe(true);
    expect(detectOptOut("quero me descadastrar")).toBe(true);
    expect(detectOptOut("remover meu número da lista")).toBe(true);
    expect(detectOptOut("não quero mais receber contato")).toBe(true);
    expect(detectOptOut("não me chame mais")).toBe(true);
  });

  it("não confunde frases normais com opt-out", () => {
    expect(detectOptOut("quero saber o preço")).toBe(false);
    expect(detectOptOut("não quero perder essa promoção")).toBe(false);
    expect(detectOptOut("parece ótimo, vamos fechar")).toBe(false);
    expect(detectOptOut("")).toBe(false);
  });
});
