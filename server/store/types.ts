export type PipelineStatus =
  | "prospect"
  | "contacted"
  | "negotiating"
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
