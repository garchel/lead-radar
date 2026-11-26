/**
 * Barreira de nicho: simulação e contato só para nichos já catalogados.
 *
 * Por quê: o catálogo medido (server/data/pools) cobre 10 nichos. Gerar prévia ou
 * mandar WhatsApp para um lead fora deles significa vender página feita no escuro,
 * sem pool, sem enquadramento e sem lista negra. O lead continua salvo no banco —
 * a barreira é só no ATO, não no cadastro.
 *
 * Escape hatch: LEADRADAR_NICHO_GATE=off libera tudo (para teste e diagnóstico).
 * Resposta a mensagem recebida é liberada por padrão: não se deixa cliente falando
 * sozinho. Para bloquear também: LEADRADAR_NICHO_GATE_RESPOSTA=off.
 */
import { nichoCatalogado } from "./nichoPoolService";

export interface VereditoDeNicho {
  liberado: boolean;
  nicho: string | null;
  motivo: string | null;
  /** Nomes dos nichos que hoje têm pool medido, para a mensagem de erro. */
  catalogados: string[];
}

export function gateLigado(): boolean {
  return String(process.env.LEADRADAR_NICHO_GATE || "on").toLowerCase() !== "off";
}

function permiteResposta(): boolean {
  return String(process.env.LEADRADAR_NICHO_GATE_RESPOSTA || "on").toLowerCase() !== "off";
}

export function avaliarNicho(lead: { name?: string | null; category?: string | null }, purpose?: string): VereditoDeNicho {
  const nicho = nichoCatalogado(lead.name || "", lead.category || "");
  const catalogados = [
    "odontologia", "barbearia", "otica", "psicologia", "pilates",
    "fisioterapia", "oficina", "estetica", "veterinaria", "advocacia",
  ];

  if (nicho) return { liberado: true, nicho, motivo: null, catalogados };

  if (!gateLigado()) {
    return { liberado: true, nicho: null, motivo: "barreira desligada (LEADRADAR_NICHO_GATE=off)", catalogados };
  }

  if (purpose === "reply" && permiteResposta()) {
    return { liberado: true, nicho: null, motivo: "resposta a mensagem recebida (liberada por padrão)", catalogados };
  }

  const quem = [lead.name, lead.category].filter(Boolean).join(" · ") || "sem nome";
  return {
    liberado: false,
    nicho: null,
    motivo:
      `Nicho ainda não catalogado (${quem}). ` +
      `Prévia e contato ficam bloqueados até o nicho ter pool medido. ` +
      `Nichos liberados hoje: ${catalogados.join(", ")}. ` +
      `O lead continua salvo no banco e pode ser trabalhado depois. ` +
      `Para catalogar: NICHO_ALVO=<nicho> node tools/catalogar-nicho.mjs. ` +
      `Para liberar agora sem catalogar: LEADRADAR_NICHO_GATE=off.`,
    catalogados,
  };
}

/** Atalho para rotas: devolve a resposta HTTP quando bloqueado. */
export function bloqueioHttp(lead: { name?: string | null; category?: string | null }): { status: number; body: Record<string, unknown> } | null {
  const v = avaliarNicho(lead);
  if (v.liberado) return null;
  return {
    status: 409,
    body: {
      success: false,
      bloqueadoPorNicho: true,
      nicho: null,
      error: v.motivo,
      nichosLiberados: v.catalogados,
      comoLiberar: [
        "catalogar o nicho com tools/catalogar-nicho.mjs e rodar tools/indice-pools.mjs",
        "ou definir LEADRADAR_NICHO_GATE=off para uma exceção pontual",
      ],
    },
  };
}
