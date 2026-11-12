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
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../store/schema";
import { generateLeadPreview, previewsDir } from "./previewService";
import { researchLeadBrand } from "./brandResearchService";
import { getLeadById, getProjectsByLead, getSetting, setLeadBrandSnapshot, setSetting, upsertProject } from "../store/db";
import { normalizeText } from "./leadIdentity";
import { buildProspectMessage } from "./autoProspectingService";
import { dispatchLeadReply } from "./interactionService";
import { searchSerpApiImages } from "./serpApi";
import type { BrandSnapshot, Project, ProjectStage, StoredLead } from "../store/types";

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

export interface SimulationAssets {
  ok: boolean;
  /** Imagens encontradas na identidade visual (podem ser 0). */
  images: number;
  /** Cores da paleta detectadas. */
  colors: number;
  confidence: number;
  /** Link público da prévia (null quando não há base pública acessível). */
  previewUrl: string | null;
  /** Observações da coleta (ex.: imagens descartadas por serem de outro negócio). */
  notes?: string;
  /** Só quando a captura falhou de vez. */
  error?: string;
}

export interface SimulationResult {
  candidate: { id: string; name: string; city?: string; state?: string; rating?: number; reviews?: number; score?: number };
  card: SimulationCard;
  assets: SimulationAssets;
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
 * Plano B da captura de assets: guarda as fotos públicas do negócio sem análise
 * visual (que exige IA e pode estar sem cota). A prévia ganha a capa; a paleta e o
 * tom ficam vazios, e o snapshot diz por quê.
 */
async function captureImagesOnly(lead: StoredLead): Promise<BrandSnapshot | null> {
  try {
    const query = `${lead.name} ${lead.city || ""}`.trim();
    const imagens = await searchSerpApiImages({ query, limit: 9, safeSearch: true });
    if (!imagens.length) return null;
    const snapshot: BrandSnapshot = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: "serpapi",
      query,
      profiles: {},
      palette: [],
      tone: [],
      imagery: imagens.slice(0, 6).map((img) => ({
        url: img.imageUrl || img.thumbnailUrl || "",
        description: img.title,
      })).filter((img) => /^https?:\/\//i.test(img.url)),
      summary: `Fotos públicas de ${lead.name} encontradas no Google. Análise visual não executada.`,
      confidence: 0.25,
      notes: "Análise de identidade visual indisponível no momento (IA): a prévia usa apenas as fotos encontradas.",
    };
    if (!snapshot.imagery.length) return null;
    setLeadBrandSnapshot(SIMULATION_LEAD_ID, snapshot);
    return snapshot;
  } catch {
    return null;
  }
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
            brand_snapshot_json = NULL,
            client_profile_json = NULL,
            site_audit_json = NULL,
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

  // A prévia antiga é da empresa anterior: se ficar no disco, o cliente abre e vê
  // outro negócio. Apaga para a próxima geração começar limpa.
  try {
    const arquivo = path.join(previewsDir(), `${SIMULATION_LEAD_ID}.html`);
    if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
  } catch {
    /* best-effort: a próxima geração sobrescreve */
  }

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

  // Assets do cliente: pesquisa a identidade visual com o nome NOVO (o card já é a
  // empresa simulada) e regenera a prévia com a foto e a cor da marca.
  let assets: SimulationAssets = { ok: false, images: 0, colors: 0, confidence: 0, previewUrl: null };
  try {
    const research = await researchLeadBrand(SIMULATION_LEAD_ID, { force: true, maxImages: 6, maxSearches: 2 });
    const atualizado = getLeadById(SIMULATION_LEAD_ID)!;
    const preview = generateLeadPreview(atualizado);
    assets = {
      ok: true,
      images: research.snapshot.imagery?.length || 0,
      colors: research.snapshot.palette?.length || 0,
      confidence: Number(research.snapshot.confidence || 0),
      previewUrl: preview.publicUrl,
      notes: research.snapshot.notes,
    };
  } catch (error: any) {
    assets.error = String(error?.message || error).slice(0, 220);
    // Análise visual depende de IA (cota). Sem ela, ainda vale guardar as fotos
    // públicas encontradas: a prévia mostra a capa e o cliente vê o negócio dele.
    const capturado = await captureImagesOnly(candidato);
    if (capturado) {
      const atualizado = getLeadById(SIMULATION_LEAD_ID)!;
      const preview = generateLeadPreview(atualizado);
      assets.ok = true;
      assets.images = capturado.imagery.length;
      assets.confidence = capturado.confidence;
      assets.previewUrl = preview.publicUrl;
    }
  }

  const paulo = getLeadById(SIMULATION_LEAD_ID)!;
  const mensagem = buildProspectMessage(candidato);

  const dispatch = await dispatchLeadReply(paulo, {
    channel: "whatsapp",
    message: mensagem,
    hook: "sem_site",
  });

  return {
    assets,
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
