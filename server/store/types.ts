export type PipelineStatus =
  | "prospect"
  | "contacted"
  | "negotiating"
  | "em_desenvolvimento"
  | "closed"
  | "declined";

export type WebsiteStatus = "none" | "social_only" | "has_website";

export interface StoredLead {
  id: string;
  name: string;
  category?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  cnpj?: string;
  googlePlaceId?: string;
  rating?: number;
  reviewsCount?: number;
  websiteStatus?: WebsiteStatus;
  websiteUrl?: string;
  instagramHandle?: string;
  lat?: number;
  lng?: number;
  opportunityScore?: number;
  opportunityLevel?: "high" | "medium" | "low";
  estimatedValue?: string;
  keyInsights?: string[];
  pipelineStatus: PipelineStatus;
  notes?: string;
  analysis?: any;
  savedAt?: string;
  updatedAt?: string;
  normalizedName?: string;
  normalizedCity?: string;
  normalizedPhone?: string;
  lastContactAt?: string;
  lastResponseAt?: string;
  lastContactOutcome?: InteractionOutcome;
  nextContactAt?: string;
  contactAttempts?: number;
  doNotContact?: boolean;
}

export type LandingPageStage =
  | "rascunho"
  | "copy"
  | "design"
  | "deploy"
  | "publicado";

export type LandingPageStatus =
  | "aguardando_aprovacao"
  | "em_producao"
  | "aprovada"
  | "publicada"
  | "rejeitada";

export interface LandingPage {
  id: string;
  leadId: string;
  businessName: string;
  slug: string;
  stage: LandingPageStage;
  status: LandingPageStatus;
  html?: string;
  url?: string;
  concept?: any;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Schedules (prospecção periódica)                                   */
/* ------------------------------------------------------------------ */

/**
 * Tipos de Job que um agendamento pode disparar recorrentemente.
 * - `mcp_autopilot`: ciclo completo (busca → salva → enriquece → analisa → LP).
 * - `batch_prospecting`: apenas prospecção em lote (sem criação de LP).
 * - `follow_up_reminder`: varre os recontatos autorizados (prazo vencido) e
 *   enfileira um job informativo; o envio real exige aprovação humana.
 */
export type ScheduleJobType = "mcp_autopilot" | "batch_prospecting" | "follow_up_reminder";

export type InteractionType = "initial_contact" | "follow_up" | "manual_note";
export type InteractionDeliveryStatus = "pending" | "sent" | "failed";
export type InteractionOutcome =
  | "pending"
  | "no_response"
  | "negative"
  | "positive"
  | "meeting_scheduled"
  | "negotiating"
  | "do_not_contact";

export interface LeadInteraction {
  id: string;
  leadId: string;
  type: InteractionType;
  channel?: "whatsapp" | "email" | "phone" | "other";
  deliveryStatus: InteractionDeliveryStatus;
  outcome: InteractionOutcome;
  message?: string;
  occurredAt: string;
  respondedAt?: string;
  nextContactAt?: string;
  notes?: string;
  communicationId?: string;
  createdAt: string;
}

export interface Schedule {
  id: string;
  name: string;
  cron: string;
  jobType: ScheduleJobType;
  /** Payload específico do tipo de job (cidade/UF/categoria/filtro...). */
  payload: any;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Projetos (acompanhamento do desenvolvimento)                       */
/* ------------------------------------------------------------------ */

export type ProjectStage =
  | "briefing"
  | "copywriting"
  | "design"
  | "desenvolvimento"
  | "revisao"
  | "deploy";

export type ProjectStatus = "em_andamento" | "pausado" | "cancelado" | "concluido";

export type ProjectPriority = "baixa" | "media" | "alta";

/** Tipo de projeto: landing page (foco em conversão) ou site institucional. */
export type ProjectType = "landing_page" | "site_institucional";

/** Campo de briefing estruturado vindo do formulário Typeform. */
export interface ProjectBriefingField {
  fieldTitle: string;
  answer: string;
}

/** Tarefa de checklist de uma etapa de desenvolvimento do projeto. */
export interface ProjectTask {
  id: string;
  stage: ProjectStage;
  title: string;
  done: boolean;
}

export interface Project {
  id: string;
  leadId: string;
  name: string;
  stage: ProjectStage;
  status: ProjectStatus;
  priority: ProjectPriority;
  /** Tipo do projeto — default "landing_page". */
  type: ProjectType;
  /** Token único para atribuir respostas do Typeform a este projeto (hidden field `project_token`). */
  typeformToken?: string;
  brief?: string;
  /** Briefing estruturado (pergunta → resposta) vindo do Typeform. */
  briefing?: ProjectBriefingField[];
  /** Checklist de tarefas por etapa de desenvolvimento. */
  tasks?: ProjectTask[];
  copy?: string;
  designNotes?: string;
  devNotes?: string;
  reviewNotes?: string;
  deployUrl?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Projeto removido do kanban (lead saiu de Em Desenvolvimento). Restaurado sem perda ao voltar. */
  archived?: boolean;
  archivedAt?: string;
  /** Denormalizado (JOIN com leads) — somente leitura. */
  leadName?: string;
  leadCity?: string;
  leadCategory?: string;
}

/* ------------------------------------------------------------------ */
/*  Cidades (base IBGE) — fila de rotação de prospecção                */
/* ------------------------------------------------------------------ */

export type CityStatus = "pending" | "in_progress" | "done" | "skipped";

export interface City {
  /** Código IBGE do município (7 dígitos). */
  ibgeCode: string;
  name: string;
  uf: string;
  latitude?: number;
  longitude?: number;
  /** População residente (Censo 2022). */
  population: number;
  status: CityStatus;
  /** ISO — última vez que esta cidade entrou numa busca de prospecção. */
  lastSearchedAt: string | null;
  /** Quantas buscas já usaram esta cidade. */
  searchCount: number;
  enabled: boolean;
}
