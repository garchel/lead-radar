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

/**
 * Situação da etapa "desenvolvimento" em relação ao agente de IA de código.
 * - `aguardando_agente`: projeto na etapa desenvolvimento, agente ainda não começou.
 * - `em_desenvolvimento`: o agente recebeu o "kit de dados" e está codando no repositório.
 * - `codigo_entregue`: o agente avisou que o código está pronto (submit_project_code) e
 *   o preview deve ser validado pelo humano.
 * - `aprovado`: o ser humano aprovou o código entregue (pode avançar para revisão/deploy).
 */
export type ProjectDevStatus =
  | "aguardando_agente"
  | "em_desenvolvimento"
  | "codigo_entregue"
  | "aprovado";

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
  /** Repositório GitHub criado pelo/para o agente de IA de código (etapa desenvolvimento). Ex.: https://github.com/org/repo. */
  githubRepoUrl?: string;
  /** Nome do dono/org do repositório (extraído de githubRepoUrl). */
  repoOwner?: string;
  /** Nome do repositório (extraído de githubRepoUrl). Ex.: "site-clinica-odonto-plus". */
  repoName?: string;
  /** URL temporária / GitHub Pages de preview antes do deploy final (etapa desenvolvimento → revisão). */
  previewUrl?: string;
  /** Situação atual da etapa desenvolvimento perante o agente de IA. */
  devStatus?: ProjectDevStatus;
  /** Última notificação/mensagem do agente de IA sobre o andamento do código. */
  devMessage?: string;
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
  /** PIB per capita a preços correntes (IBGE, R$/ano). */
  pibPerCapita: number;
  /** Tier de mercado calculado a partir do PIB per capita (A/B/C/D). */
  marketTier: "A" | "B" | "C" | "D";
  status: CityStatus;
  /** ISO — última vez que esta cidade entrou numa busca de prospecção. */
  lastSearchedAt: string | null;
  /** Quantas buscas já usaram esta cidade. */
  searchCount: number;
  enabled: boolean;
}

/* ------------------------------------------------------------------ */
/*  Categorias de negócio — propensão a landing page + ticket base     */
/* ------------------------------------------------------------------ */

export interface BusinessCategory {
  id: string;
  name: string;
  /** 0-100: probabilidade de precisar/valorizar landing page. */
  propensity: number;
  /** Ticket base sugerido (R$), antes do multiplicador do tier da cidade. */
  baseTicket: number;
  isActive: boolean;
}
