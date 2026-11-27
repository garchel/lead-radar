import { afterEach, describe, expect, it } from "vitest";
import { setSetting } from "../server/store/db";
import { avaliarEnvio, freioLigado, numeroFicticio } from "../server/services/outboundGuard";

const unico = (base: string) => `${base} [${Math.random().toString(36).slice(2, 8)}]`;

describe("travas de envio", () => {
  afterEach(() => {
    setSetting("automation_outbound_freeze", "false");
  });

  it("freio do dono bloqueia tudo", () => {
    setSetting("automation_outbound_freeze", "true");
    expect(freioLigado()).toBe(true);
    setSetting("automation_outbound_freeze", "false");
    expect(freioLigado()).toBe(false);
  });

  it("número de fixture (99999-000X) é reconhecido", () => {
    for (const n of ["+55 11 99999-0004", "5511999990009", "+55 62 99999-0002"]) {
      expect(numeroFicticio(n), n).toBe(true);
    }
    expect(numeroFicticio("+55 61 93797-7728")).toBe(false); // número real do dono
  });

  it("a suíte de testes nunca fala com o WhatsApp real (causa do spam)", () => {
    // vitest define VITEST=true e estes testes não têm stub de fetch: é exatamente o
    // cenário em que a suíte mandou "Dá um minutinho" para 5511999990002/4/9.
    expect(process.env.VITEST).toBeTruthy();
    const v = avaliarEnvio({ leadId: "lead-env-teste", mensagem: unico("mensagem"), to: "5561937977728" });
    expect(v.liberado).toBe(false);
    expect(v.bloqueadoPor).toBe("teste");
  });

  it("a trava de teste vence qualquer outro critério (nada sai por acidente)", () => {
    const v = avaliarEnvio({ leadId: "lead-fict", mensagem: unico("texto"), to: "5511999990004" });
    expect(v.liberado).toBe(false);
    expect(["teste", "numero-ficticio"]).toContain(v.bloqueadoPor);
  });
});
