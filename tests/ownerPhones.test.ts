import { beforeEach, describe, expect, it } from "vitest";
import { setSetting } from "../server/store/db";
import { isOwnerPhone, ownerPhones } from "../server/services/ownerCommandService";

/**
 * Quem pode dar comando à Clara. O erro caro aqui é o inverso: aceitar comando de
 * qualquer número (qualquer lead pausaria o agente) ou recusar o dono por diferença
 * de formato (+55, nono dígito, máscara).
 */
describe("números do dono", () => {
  beforeEach(() => {
    setSetting("owner_alert_phone", "");
    setSetting("owner_phones", "");
  });

  it("lê o dono principal e a lista extra", () => {
    setSetting("owner_alert_phone", "5561995254732");
    setSetting("owner_phones", "556186210471, 5561988887777");
    const lista = ownerPhones();
    expect(lista).toContain("5561995254732");
    expect(lista).toContain("556186210471");
    expect(lista).toContain("5561988887777");
  });

  it("aceita o número novo com e sem máscara e com o nono dígito", () => {
    setSetting("owner_phones", "+55 61 8621-0471");
    expect(isOwnerPhone("556186210471")).toBe(true);
    expect(isOwnerPhone("+55 61 8621-0471")).toBe(true);
    expect(isOwnerPhone("6186210471")).toBe(true);
  });

  it("não confunde número parecido com o do dono", () => {
    setSetting("owner_phones", "+55 61 8621-0471");
    expect(isOwnerPhone("+55 61 8621-0472")).toBe(false);
    expect(isOwnerPhone("+55 11 8621-0471")).toBe(false); // mesmo final, DDD diferente
  });

  it("sem cadastro nenhum, ninguém é dono", () => {
    expect(ownerPhones()).toEqual([]);
    expect(isOwnerPhone("5561995254732")).toBe(false);
  });
});
