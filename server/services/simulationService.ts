/**
 * Simulação de prospecção com o próprio número do Paulo.
 *
 * Objetivo: acompanhar o card andando. A cada simulação o card do Paulo
 * (`pv-landing-1`) volta para a primeira etapa do CRM e do Kanban de Projetos, e
 * assume o nome da empresa que está sendo simulada. Assim, quando a conversa
 * avança (contatado → negociando → desenvolvimento), ele vê o próprio card se
 * movendo como se fosse o cliente real.
 *
 * O texto da abordagem usa os dados do lead ESCOLHIDO (nota, avaliações, cidade) e
 * é enviado para o número do Paulo.
 */
import { getDb } from "../store/schema";
import { getLeadById, getProjectsByLead, getSetting, setSetting, upsertProject } from "../store/db";
import { normalizeText } from "./leadIdentity";
import { buildProspectMessage } from "./autoProspectingService";
import { dispatchLeadReply } from "./interactionService";
import type { Project, ProjectStage, StoredLead } from "../store/types";

/** Lead que faz o papel de Paulo nas simulações. */
export const SIMULATION_LEAD_ID = "pv-landing-1";
/** Etapa inicial do Kanban de Projetos. */
export const FIRST_PROJECT_STAGE: ProjectStage = "briefing";

export interface SimulationCard {
  leadId: string;
  leadName: string;
  pipelineStatus: string;
  projectId: string;
  projectName: string;
  projectStage: ProjectStage;
  projectStatus: string;
}

export interface SimulationResult {
  candidate: { id: string; name: string; city?: string; state?: string; rating?: number; reviews?: number; score?: number };
  card: SimulationCard;
  message: string;
  dispatch: { status: string; detail: string; communicationId: string };
}

/** Candidatos bons para a simulação (dor real, telefone válido, fora da lista de teste). */
export function pickSimulationCandidates(limit = 12): StoredLead[] {
  // Evita repetir a mesma empresa em simulações seguidas: guarda a última usada.
  let ultimoId = "";
  try {
    ultimoId = String(getSetting("last_simulation_lead_id") || "");
  } catch {
    ultimoId = "";
  }

  const rows = getDb()
    .prepare(
      `SELECT id FROM leads
        WHERE website_status = 'none'
          AND phone IS NOT NULL AND length(normalized_phone) >= 12
          AND rating >= 4.5 AND reviews_count >= 60
          AND COALESCE(do_not_contact, 0) = 0
          AND COALESCE(is_test, 0) = 0
          AND id != ?
          AND id != ?
        ORDER BY opportunity_score DESC, reviews_count DESC
        LIMIT ?`
    )
    .all(SIMULATION_LEAD_ID, ultimoId, Math.max(1, limit)) as { id: string }[];
  return rows.map((r) => getLeadById(r.id)).filter((l): l is StoredLead => Boolean(l));
}

/**
 * Devolve o card do Paulo para o início e renomeia com a empresa simulada.
 * Usa SQL direto porque são campos que nenhuma outra rotina deve tocar (é reset,
 * não atualização de negócio).
 */
export function resetSimulationCard(
  companyName: string,
  origem?: { category?: string; city?: string; state?: string }
): SimulationCard {
  const db = getDb();
  const nome = String(companyName || "").trim().slice(0, 80) || "Simulação";

  // O card precisa parecer a empresa simulada por inteiro: nome, categoria e
  // cidade. Sem isso o cartão diz "Dra. Carmen Pitol · Brasília", que denuncia a
  // simulação e atrapalha acompanhar.
  db.prepare(
    `UPDATE leads
        SET name = ?,
            normalized_name = ?,
            category = COALESCE(?, category),
            city = COALESCE(?, city),
            state = COALESCE(?, state),
            normalized_city = COALESCE(?, normalized_city),
            pipeline_status = 'prospect',
            last_contact_at = NULL,
            last_response_at = NULL,
            last_contact_outcome = NULL,
            next_contact_at = NULL,
            contact_attempts = 0,
            updated_at = ?
      WHERE id = ?`
  ).run(
    nome,
    normalizeText(nome),
    origem?.category || null,
    origem?.city || null,
    origem?.state || null,
    origem?.city ? normalizeText(origem.city) : null,
    new Date().toISOString(),
    SIMULATION_LEAD_ID
  );

  const agora = new Date().toISOString();
  const existente = getProjectsByLead(SIMULATION_LEAD_ID).find((p) => !p.archived);

  let projeto: Project;
  if (existente) {
    projeto = {
      ...existente,
      name: `${nome} — Landing Page`,
      stage: FIRST_PROJECT_STAGE,
      status: "em_andamento",
      // checklist e artefatos das etapas seguintes voltam ao zero
      tasks: [],
      devStatus: undefined,
      devMessage: undefined,
      previewUrl: undefined,
      deployUrl: undefined,
      completedAt: undefined,
      archived: false,
      updatedAt: agora,
    };
  } else {
    projeto = {
      id: `proj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      leadId: SIMULATION_LEAD_ID,
      name: `${nome} — Landing Page`,
      stage: FIRST_PROJECT_STAGE,
      status: "em_andamento",
      priority: "media",
      type: "landing_page",
      tasks: [],
      createdAt: agora,
      updatedAt: agora,
    };
  }
  const salvo = upsertProject(projeto);

  const lead = getLeadById(SIMULATION_LEAD_ID)!;
  return {
    leadId: lead.id,
    leadName: lead.name,
    pipelineStatus: lead.pipelineStatus,
    projectId: salvo.id,
    projectName: salvo.name,
    projectStage: salvo.stage,
    projectStatus: salvo.status,
  };
}

/**
 * Faz a simulação inteira: escolhe o lead, reseta o card, monta o D0 e envia.
 *
 * Nunca lança por falha de envio: devolve `dispatch.status` para quem chamou
 * decidir o que mostrar.
 */
export async function startProspectionSimulation(opts: { leadId?: string } = {}): Promise<SimulationResult> {
  let candidato: StoredLead | undefined;
  if (opts.leadId) {
    candidato = getLeadById(opts.leadId);
    if (!candidato) throw new Error(`Lead não encontrado: ${opts.leadId}`);
  } else {
    candidato = pickSimulationCandidates(1)[0];
  }
  if (!candidato) throw new Error("Nenhum lead bom disponível para simular (sem site, nota e avaliações suficientes).");

  try {
    setSetting("last_simulation_lead_id", candidato.id);
  } catch {
    /* best-effort: só serve para variar a próxima simulação */
  }

  const card = resetSimulationCard(candidato.name, {
    category: candidato.category,
    city: candidato.city,
    state: candidato.state,
  });
  const paulo = getLeadById(SIMULATION_LEAD_ID)!;
  const mensagem = buildProspectMessage(candidato);

  const dispatch = await dispatchLeadReply(paulo, {
    channel: "whatsapp",
    message: mensagem,
    hook: "sem_site",
  });

  return {
    candidate: {
      id: candidato.id,
      name: candidato.name,
      city: candidato.city,
      state: candidato.state,
      rating: candidato.rating,
      reviews: candidato.reviewsCount,
      score: candidato.opportunityScore,
    },
    card,
    message: mensagem,
    dispatch: {
      status: dispatch.status,
      detail: dispatch.detail,
      communicationId: dispatch.communicationId,
    },
  };
}
