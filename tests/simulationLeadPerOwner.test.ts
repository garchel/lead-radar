import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../server/store/schema";
import { recordCommunication, setSetting, upsertLead } from "../server/store/db";
import {
  SIMULATION_LEAD_ID,
  ehLeadDeSimulacao,
  ensureSimulationLead,
  resetSimulationCard,
  simulationLeadIdFor,
} from "../server/services/simulationService";

/**
 * Um lead de simulação por dono. Antes existia um só: dois donos simulando ao mesmo
 * tempo escreviam no mesmo registro, o reset reescrevia a empresa, apagava as mensagens
 * e trocava o telefone, e o primeiro dono ficava falando com um lead que já não era dele.
 */

const DONO_A = "5561995254732";
const DONO_B = "556186210471";

function mensagens(leadId: string): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) AS n FROM communications WHERE lead_id = ?")
    .get(leadId) as { n: number };
  return r.n;
}

describe("lead de simulação por dono", () => {
  beforeEach(() => {
    delete process.env.OWNER_ALERT_PHONE;
    setSetting("owner_alert_phone", DONO_A); // como está no painel, sem .env
  });

  it("cada dono tem o seu id", () => {
    expect(simulationLeadIdFor(DONO_A)).toBe(SIMULATION_LEAD_ID); // principal mantém histórico
    expect(simulationLeadIdFor(DONO_B)).toBe(`pv-landing-${DONO_B}`);
  });

  it("reconhece a máscara do telefone", () => {
    expect(simulationLeadIdFor("+55 61 8621-0471")).toBe(`pv-landing-${DONO_B}`);
  });

  it("sem telefone cai no lead histórico", () => {
    expect(simulationLeadIdFor(undefined)).toBe(SIMULATION_LEAD_ID);
    expect(simulationLeadIdFor("")).toBe(SIMULATION_LEAD_ID);
  });

  it("identifica lead de simulação pelo id", () => {
    expect(ehLeadDeSimulacao("pv-landing-1")).toBe(true);
    expect(ehLeadDeSimulacao(`pv-landing-${DONO_B}`)).toBe(true);
    expect(ehLeadDeSimulacao("lead-dicore")).toBe(false);
    expect(ehLeadDeSimulacao(undefined)).toBe(false);
  });

  it("resetar a simulação de um dono NÃO apaga a conversa do outro", () => {
    const idA = simulationLeadIdFor(DONO_A);
    const idB = simulationLeadIdFor(DONO_B);

    upsertLead({ id: idA, name: "Dicore Barbearia", phone: DONO_A, updatedAt: new Date().toISOString() } as any);
    upsertLead({ id: idB, name: "Barbearia do Ze", phone: DONO_B, updatedAt: new Date().toISOString() } as any);

    recordCommunication({
      leadId: idB,
      channel: "whatsapp",
      direction: "outbound",
      status: "sent",
      message: "conversa do dono B",
    });
    const antesB = mensagens(idB);
    expect(antesB).toBeGreaterThan(0);

    resetSimulationCard("Outra Empresa", { category: "barbearia", city: "Brasilia" }, idA);

    expect(mensagens(idB)).toBe(antesB);
  });

  it("criar o lead do dono B não funde com o lead do dono A", () => {
    const idA = simulationLeadIdFor(DONO_A);
    upsertLead({ id: idA, name: "Dicore Barbearia", phone: DONO_A, updatedAt: new Date().toISOString() } as any);

    const criado = ensureSimulationLead("+55 61 8621-0471");
    expect(criado.leadId).toBe(`pv-landing-${DONO_B}`);

    // o lead antigo continua com o nome e o telefone dele
    const a = getDb().prepare("SELECT name, phone FROM leads WHERE id = ?").get(idA) as { name: string; phone: string };
    expect(a.name).toBe("Dicore Barbearia");
    expect(a.phone).toBe(DONO_A);

    const b = getDb().prepare("SELECT phone FROM leads WHERE id = ?").get(criado.leadId) as { phone: string };
    expect(b.phone).toBe("+55 61 8621-0471");
  });

  it("o reset mantém o telefone do lead de cada dono", () => {
    const idB = simulationLeadIdFor(DONO_B);
    upsertLead({ id: idB, name: "Barbearia do Ze", phone: DONO_B, updatedAt: new Date().toISOString() } as any);
    resetSimulationCard("Nova Empresa", { category: "barbearia", city: "Brasilia" }, idB);
    const lead = getDb().prepare("SELECT phone FROM leads WHERE id = ?").get(idB) as { phone: string };
    expect(lead.phone).toBe(DONO_B);
  });
});
