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
import { generateLeadPreview, generateLeadPreviewCached, previewsDir, slugifyPreview } from "./previewService";
import { publishPreviews } from "./pagesService";
import { researchLeadBrand } from "./brandResearchService";
import { getLeadById, getProjectsByLead, getSetting, setLeadBrandSnapshot, setSetting, upsertLead, upsertProject } from "../store/db";
import { normalizeText } from "./leadIdentity";
import { buildProspectMessage } from "./autoProspectingService";
import { dispatchLeadReply } from "./interactionService";
import { searchSerpApiImages } from "./serpApi";
import type { BrandSnapshot, Project, ProjectStage, StoredLead } from "../store/types";

/**
 * Publica a pasta de prévias e confirma que o endereço responde de verdade.
 *
 * Deploy do Cloudflare às vezes é recusado por já existir outro em andamento, e o
 * código antigo seguia em frente mesmo assim: o D0 prometia uma prévia pronta e o
 * lead abria um 404. Publique, confira e, se falhar, tente mais uma vez.
 */
/** O link já responde? (sem publicar nada) */
async function confirmarNoAr(url: string | null): Promise<boolean> {
  if (!url) return false;
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" as any });
      if (res.ok) return true;
    } catch {
      /* segue tentando: o deploy leva alguns segundos */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

async function publicarEConfirmar(url: string | null): Promise<boolean> {
  const confere = async (): Promise<boolean> => {
    if (!url) return false;
    for (let tentativa = 0; tentativa < 6; tentativa += 1) {
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" as any });
        if (res.ok) return true;
      } catch {
        /* segue tentando: o deploy leva alguns segundos */
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    return false;
  };

  try {
    const primeira = await publishPreviews(previewsDir());
    if (!primeira.ok) console.warn(`[simulação] publicação falhou: ${primeira.error}`);
    if (await confere()) return true;

    // O Cloudflare recusa um deploy enquanto o anterior está em andamento. Se a
    // primeira tentativa não confirmou, espera o deploy assentar antes de repetir
    // (sem isso a segunda batia na mesma recusa e a mensagem saía "posso montar").
    await new Promise((resolve) => setTimeout(resolve, 15000));
    const segunda = await publishPreviews(previewsDir());
    if (!segunda.ok) console.warn(`[simulação] segunda publicação falhou: ${segunda.error}`);
    return await confere();
  } catch (erro: any) {
    console.error("[simulação] publicação:", erro?.message || erro);
    return false;
  }
}

/** Lead que faz o papel de Paulo nas simulações. */
export const SIMULATION_LEAD_ID = "pv-landing-1";

/** Dígitos do telefone, sem país/máscara. */
function soDigitos(phone?: string): string {
  return String(phone || "").replace(/\D/g, "");
}

/**
 * Lead de simulação de cada dono.
 *
 * Existe UM número de simulação por telefone de dono: dois donos simulando ao mesmo
 * tempo escreviam no mesmo lead e a segunda simulação apagava a conversa da primeira
 * (o reset reescreve o registro e troca o telefone).
 *
 * O dono principal continua no id histórico `pv-landing-1`, para não perder página,
 * slug e histórico já publicados.
 */
export function simulationLeadIdFor(phone?: string): string {
  const d = soDigitos(phone);
  if (!d) return SIMULATION_LEAD_ID;
  // O principal pode estar só no banco (painel), não no .env.
  const principal = soDigitos(process.env.OWNER_ALERT_PHONE || getSetting("owner_alert_phone") || "");
  if (principal && d === principal) return SIMULATION_LEAD_ID;
  return `pv-landing-${d}`;
}

/**
 * Garante o lead de simulação do dono, sem mandar nada no WhatsApp.
 *
 * Idempotente: se o lead já existe, só acerta o telefone. É o que o painel usa para
 * "preparar a simulação" e é a peça que o `/simulacao` reaproveita.
 */
export function ensureSimulationLead(paraTelefone: string): { leadId: string; phone: string; nome: string } {
  const simId = simulationLeadIdFor(paraTelefone);
  const telefone = String(paraTelefone || "").trim();
  const existente = getLeadById(simId);
  if (!existente) {
    const agora = new Date().toISOString();
    upsertLead({
      id: simId,
      name: "Simulação",
      phone: telefone,
      pipelineStatus: "prospect",
      notes: "[Simulação] Lead criado para o dono simular a conversa.",
      savedAt: agora,
      updatedAt: agora,
    } as any, { skipDedup: true }, // lead sintético: nunca pode ser fundido com um prospect real
    );
    return { leadId: simId, phone: telefone, nome: "Simulação" };
  }
  if (telefone && String(existente.phone || "") !== telefone) {
    upsertLead({ ...existente, phone: telefone, updatedAt: new Date().toISOString() } as any);
  }
  return { leadId: simId, phone: telefone, nome: existente.name };
}

/** Todo lead de simulação (o histórico e os por dono). */
export function ehLeadDeSimulacao(id?: string): boolean {
  return /^pv-landing-(\d+|\d+)$/.test(String(id || ""));
}
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

/**
 * Candidatos bons para a simulação (dor real, telefone válido, fora da lista de teste).
 *
 * Antes isto era `ORDER BY score DESC LIMIT 1` excluindo só a ÚLTIMA empresa: com
 * 342 candidatos e notas todas entre 93 e 96, a simulação caía sempre nas mesmas
 * duas ou três do topo. Agora sorteia entre as 40 melhores e ignora as 6 últimas
 * usadas, para o dono ver empresas diferentes sem cair em lead ruim.
 */
const RECENTES_CHAVE = "simulation_recent_lead_ids";
const RECENTES_MAX = 6;
const POOL_SORTEIO = 40;

function recentes(): string[] {
  try {
    const bruto = String(getSetting(RECENTES_CHAVE) || "");
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function guardarRecente(id: string): void {
  try {
    const lista = [id, ...recentes().filter((x) => x !== id)].slice(0, RECENTES_MAX);
    setSetting(RECENTES_CHAVE, JSON.stringify(lista));
  } catch {
    /* best-effort: só serve para variar a próxima simulação */
  }
}

export function pickSimulationCandidates(limit = 12): StoredLead[] {
  const usados = new Set(recentes());
  const ultimo = String(getSetting("last_simulation_lead_id") || "");
  if (ultimo) usados.add(ultimo);

  const rows = getDb()
    .prepare(
      `SELECT id FROM leads
        WHERE website_status = 'none'
          AND phone IS NOT NULL AND length(normalized_phone) >= 12
          AND rating >= 4.5 AND reviews_count >= 60
          AND COALESCE(do_not_contact, 0) = 0
          AND COALESCE(is_test, 0) = 0
          AND id != ?
        ORDER BY opportunity_score DESC, reviews_count DESC
        LIMIT ?`
    )
    .all(SIMULATION_LEAD_ID, POOL_SORTEIO) as { id: string }[];

  const pool = rows.filter((r) => !usados.has(r.id));
  // Pool esgotado (base pequena): libera o histórico em vez de não simular.
  const escolhidos = pool.length ? pool : rows;

  const embaralhado = [...escolhidos];
  for (let i = embaralhado.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [embaralhado[i], embaralhado[j]] = [embaralhado[j], embaralhado[i]];
  }

  return embaralhado
    .slice(0, Math.max(1, limit))
    .map((r) => getLeadById(r.id))
    .filter((l): l is StoredLead => Boolean(l));
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
  origem?: {
    category?: string;
    city?: string;
    state?: string;
    /** Identidade do negócio novo. Sem isso a ficha do card fica a da empresa anterior. */
    rating?: number;
    reviewsCount?: number;
    websiteStatus?: string;
    address?: string;
    neighborhood?: string;
    email?: string;
    instagramHandle?: string;
    googlePlaceId?: string;
    opportunityScore?: number;
  },
  leadId: string = SIMULATION_LEAD_ID,
): SimulationCard {
  const db = getDb();
  const nome = String(companyName || "").trim().slice(0, 80) || "Simulação";
  // Nome do negócio que está saindo: o cartão de paleta e a proposta dele levam o
  // nome bonito no arquivo, não o slug — sem isso ficam publicados com preço e cor
  // de outra empresa.
  const nomeAnterior = String(getLeadById(leadId)?.name || "").trim();

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
            -- Identidade da empresa NOVA: sem isso o card guardava nota, avaliações,
            -- endereço e e-mail do negócio anterior (o e-mail do dono, inclusive).
            rating = ?,
            reviews_count = ?,
            website_status = COALESCE(?, website_status),
            address = ?,
            neighborhood = ?,
            email = ?,
            instagram_handle = ?,
            google_place_id = ?,
            opportunity_score = COALESCE(?, opportunity_score),
            -- Análise e insights eram da empresa anterior: o pitch de WhatsApp que
            -- vem dentro dela seria reaproveitado palavra por palavra.
            analysis = NULL,
            key_insights = NULL,
            -- Dono/responsável era da empresa anterior: sem isso a mensagem da
            -- empresa nova sairia para o número de quem decidia na anterior.
            dm_name = NULL,
            dm_phone = NULL,
            dm_source = NULL,
            dm_set_at = NULL,
            updated_at = ?
      WHERE id = ?`
  ).run(
    nome,
    normalizeText(nome),
    origem?.category || null,
    origem?.city || null,
    origem?.state || null,
    origem?.city ? normalizeText(origem.city) : null,
    origem?.rating ?? null,
    origem?.reviewsCount ?? null,
    origem?.websiteStatus || null,
    origem?.address || null,
    origem?.neighborhood || null,
    origem?.email || null,
    origem?.instagramHandle || null,
    origem?.googlePlaceId || null,
    origem?.opportunityScore ?? null,
    new Date().toISOString(),
    leadId
  );

  const agora = new Date().toISOString();
  const existente = getProjectsByLead(leadId).find((p) => !p.archived);

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
      // Briefing, copy e design notes eram da empresa anterior: se ficam, o painel
      // mostra o texto de outro negócio e a tipografia escolhida é herdada por
      // engano (aconteceu com Bricolage+DM Sans de uma rodada anterior).
      brief: undefined,
      briefing: [],
      typeformToken: undefined,
      copy: undefined,
      designNotes: undefined,
      devNotes: undefined,
      reviewNotes: undefined,
      wireframeUrl: undefined,
      fontDisplay: undefined,
      fontBody: undefined,
      // A pasta da LP e o repositório eram da empresa anterior: se ficam, o painel
      // de assets mostra arquivos de outro negócio (foi o que aconteceu com
      // `sites/marketing/pv-landing` aparecendo num cartão de dentista).
      sitePath: undefined,
      githubRepoUrl: undefined,
      repoOwner: undefined,
      repoName: undefined,
      completedAt: undefined,
      archived: false,
      updatedAt: agora,
    };
  } else {
    projeto = {
      id: `proj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      leadId: leadId,
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

  // Histórico de conversa da empresa anterior: se fica, a Clara lê mensagens de
  // outro negócio e o painel mostra um thread misturado (aconteceu na simulação
  // Quintal dos Sonhos → Dra. Carmen Pitol).
  // ORDEM IMPORTA: `interactions.communication_id` referencia `communications`.
  // Apagar a comunicação primeiro viola a FK, o erro era engolido pelo catch e o
  // thread inteiro sobrevivia — a Clara lia mensagens de outras empresas.
  try {
    const limpar = db.transaction(() => {
      db.prepare("DELETE FROM interactions WHERE lead_id = ?").run(leadId);
      db.prepare("DELETE FROM communications WHERE lead_id = ?").run(leadId);
    });
    limpar();
  } catch (erro: any) {
    console.error("[simulação] não consegui limpar o histórico:", erro?.message || erro);
  }

  // A prévia antiga é da empresa anterior: se ficar no disco, o cliente abre e vê
  // outro negócio. Apaga para a próxima geração começar limpa.
  //
  // O slug é estável POR LEAD, mas na simulação o lead troca de empresa: manter o
  // mapeamento fazia o link da empresa nova sair como `dra-carmen-pitol` (outro
  // negócio, outra cidade). Apaga o mapeamento para o endereço nascer do nome novo.
  let slugAnterior: string | undefined;
  try {
    slugAnterior = (db.prepare("SELECT slug FROM preview_slugs WHERE lead_id = ?").get(leadId) as any)?.slug;
    db.prepare("DELETE FROM preview_slugs WHERE lead_id = ?").run(leadId);
  } catch {
    /* tabela ainda não existe (banco antigo): nada a limpar, a geração cria */
  }
  // apagar arquivo é independente do banco: se a tabela falhar, a prévia velha
  // ainda tem que sair do disco
  try {
    const dir = previewsDir();
    for (const nome of [slugAnterior, leadId]) {
      if (!nome) continue;
      for (const sufixo of [".html", "-logo.svg"]) {
        const arquivo = path.join(dir, `${nome}${sufixo}`);
        if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo);
      }
    }

    // Cartão de paleta e proposta em PDF também são do negócio anterior, e os dois
    // são PUBLICADOS no link público: ficavam acessíveis com preço e cor de outra
    // empresa. Apaga pelo slug/prefixo do que acabou de sair.
    const restos = ([slugAnterior, leadId, nomeAnterior && slugifyPreview(nomeAnterior)]
      .filter(Boolean) as string[]).map((n) => n.toLowerCase());
    for (const arquivo of fs.readdirSync(dir)) {
      if (!/\.(png|pdf)$/i.test(arquivo)) continue;
      // compara em minúsculas: a proposta sai com o nome bonito
      // ("Proposta-Dra-Carmen-Pitol-...") e o slug é todo minúsculo
      const nome = arquivo.toLowerCase();
      if (restos.some((alvo) => nome.includes(alvo))) fs.unlinkSync(path.join(dir, arquivo));
    }

    // Ficha do cliente em Markdown: vive em `clientes/`, fora da pasta de prévias,
    // e por isso escapava do reset. A ficha da empresa anterior ficava no disco e
    // podia ser lida como se fosse do negócio novo (nome e cidade trocados).
    const fichasDir = path.join(process.env.LEADRADAR_DATA_DIR || path.join(process.cwd(), "data"), "clientes");
    if (fs.existsSync(fichasDir)) {
      const alvos = restos.filter((alvo) => alvo && alvo !== leadId);
      for (const arquivo of fs.readdirSync(fichasDir)) {
        if (!arquivo.toLowerCase().endsWith(".md")) continue;
        const nome = arquivo.toLowerCase();
        if (alvos.some((alvo) => nome.startsWith(alvo) || nome.includes(alvo))) {
          fs.unlinkSync(path.join(fichasDir, arquivo));
        }
      }
    }

    // Imagens soltas: sobra de coleta do negócio anterior. Apaga só o que nenhuma
    // prévia restante usa, senão a página de outro lead perde a foto.
    const assetsDir = path.join(dir, "assets");
    if (fs.existsSync(assetsDir)) {
      const emUso = new Set<string>();
      for (const html of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
        const conteudo = fs.readFileSync(path.join(dir, html), "utf8");
        for (const m of conteudo.matchAll(/assets\/([\w.-]+)/g)) emUso.add(m[1]);
      }
      for (const img of fs.readdirSync(assetsDir)) {
        if (emUso.has(img)) continue;
        const caminho = path.join(assetsDir, img);
        try {
          // O serviço de mídia guarda cada lead em subpasta (assets/<slug>/):
          // unlinkSync numa pasta estoura EPERM e derrubava a limpeza inteira.
          if (fs.statSync(caminho).isDirectory()) fs.rmSync(caminho, { recursive: true, force: true });
          else fs.unlinkSync(caminho);
        } catch (erro: any) {
          console.warn(`[simulação] não consegui remover ${img}: ${erro?.message || erro}`);
        }
      }
    }
  } catch (erro: any) {
    console.error("[simulação] limpeza de artefatos falhou:", erro?.message || erro);
  }

  const lead = getLeadById(leadId)!;
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
export async function startProspectionSimulation(
  opts: { leadId?: string; paraTelefone?: string } = {},
): Promise<SimulationResult> {
  let candidato: StoredLead | undefined;
  if (opts.leadId) {
    candidato = getLeadById(opts.leadId);
    if (!candidato) throw new Error(`Lead não encontrado: ${opts.leadId}`);
  } else {
    candidato = pickSimulationCandidates(1)[0];
  }
  if (!candidato) throw new Error("Nenhum lead bom disponível para simular (sem site, nota e avaliações suficientes).");

  // Cada dono tem o seu lead de simulação: dois ao mesmo tempo não se atropelam.
  const { leadId: simId } = ensureSimulationLead(String(opts.paraTelefone || ""));

  try {
    setSetting("last_simulation_lead_id", candidato.id);
    guardarRecente(candidato.id);
  } catch {
    /* best-effort: só serve para variar a próxima simulação */
  }

  const card = resetSimulationCard(candidato.name, {
    category: candidato.category,
    city: candidato.city,
    state: candidato.state,
    rating: candidato.rating,
    reviewsCount: candidato.reviewsCount,
    websiteStatus: candidato.websiteStatus,
    address: candidato.address,
    neighborhood: candidato.neighborhood,
    email: candidato.email,
    instagramHandle: candidato.instagramHandle,
    googlePlaceId: candidato.googlePlaceId,
    opportunityScore: candidato.opportunityScore,
  }, simId);

  // Assets do cliente: pesquisa a identidade visual com o nome NOVO (o card já é a
  // empresa simulada) e regenera a prévia com a foto e a cor da marca.
  let assets: SimulationAssets = { ok: false, images: 0, colors: 0, confidence: 0, previewUrl: null };
  // A página NÃO é mais montada antes da abordagem: ela é escrita na hora em que
  // o lead demonstra interesse (ver pageDeliveryService). Por isso o D0 sempre
  // sai oferecendo a prévia, nunca dizendo que ela já existe.
  let previewNoAr = false;
  try {
    const research = await researchLeadBrand(simId, { force: true, maxImages: 6, maxSearches: 2 });
    const atualizado = getLeadById(simId)!;
    assets = {
      ok: true,
      images: atualizado.brandSnapshot?.imagery?.length || 0,
      colors: research.snapshot.palette?.length || 0,
      confidence: Number(research.snapshot.confidence || 0),
      previewUrl: null,
      notes: research.snapshot.notes,
    };
  } catch (error: any) {
    assets.error = String(error?.message || error).slice(0, 220);
    // Sem pesquisa de marca o D0 continua válido: a paleta cai no padrão do nicho
    // e a página é gerada depois, com o que houver.
    const capturado = await captureImagesOnly(candidato);
    if (capturado) {
      assets.ok = true;
      assets.images = capturado.imagery.length;
      assets.confidence = capturado.confidence;
    }
  }

  const paulo = getLeadById(simId)!;
  const mensagem = buildProspectMessage(candidato, { previewPronta: false });

  const dispatch = await dispatchLeadReply(paulo, {
    channel: "whatsapp",
    message: mensagem,
    hook: "sem_site",
    // Simulação é pedido explícito do dono (inclusive pelo comando /simulacao, cuja
    // confirmação acabou de sair). A trava de "duas mensagens seguidas" existe para
    // o fluxo automático, não para isto: o reset já limpou o thread e o D0 é a
    // continuação combinada.
    force: true,
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
