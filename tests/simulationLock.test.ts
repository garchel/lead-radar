import { beforeEach, describe, expect, it } from "vitest";
import { setSetting } from "../server/store/db";
import {
  encerrarSimulacao,
  marcarSimulacao,
  simulacaoAtiva,
  simulacaoPresa,
} from "../server/services/ownerCommandService";

/**
 * Só existe UM lead de simulação (`pv-landing-1`). Duas simulações ao mesmo tempo
 * escrevem no mesmo registro: a segunda apaga a conversa da primeira e troca o
 * telefone, deixando o primeiro dono falando sozinho. Esta trava é o que impede.
 */
describe("trava de simulação", () => {
  beforeEach(() => {
    encerrarSimulacao();
  });

  it("sem simulação ativa, ninguém está preso", () => {
    expect(simulacaoPresa("556186210471").presa).toBe(false);
  });

  it("bloqueia o segundo dono enquanto a primeira está aberta", () => {
    marcarSimulacao("5561995254732");
    const trava = simulacaoPresa("556186210471");
    expect(trava.presa).toBe(true);
    expect(trava.quem).toBe("5561995254732");
  });

  it("o mesmo dono pode recomeçar (não trava a si mesmo)", () => {
    marcarSimulacao("556186210471");
    expect(simulacaoPresa("+55 61 8621-0471").presa).toBe(false);
  });

  it("/encerrar libera a vaga", () => {
    marcarSimulacao("5561995254732");
    expect(simulacaoAtiva().phone).toBe("5561995254732");
    encerrarSimulacao();
    expect(simulacaoAtiva().phone).toBeNull();
    expect(simulacaoPresa("556186210471").presa).toBe(false);
  });

  it("simulação esquecida expira e não segura a vaga para sempre", () => {
    marcarSimulacao("5561995254732");
    const velho = new Date(Date.now() - 5 * 3_600_000).toISOString();
    setSetting("simulation_started_at", velho);
    expect(simulacaoPresa("556186210471").presa).toBe(false);
  });
});
