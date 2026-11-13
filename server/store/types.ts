export type PipelineStatus =
  | "prospect"
  | "contacted"
  | "negotiating"
  | "em_desenvolvimento"
  | "closed"
  | "declined";

export type WebsiteStatus = "none" | "social_only" | "marketplace_only" | "has_website";

/* ------------------------------------------------------------------ */
/*  Auditoria técnica do site do lead                                  */
/* ------------------------------------------------------------------ */

export type SiteAuditSeverity = "critical" | "warning" | "info";

export type SiteAuditIssueCode =
  | "unreachable"
  | "no_https"
  | "https_invalid"
  | "no_viewport"
  | "slow_response"
  | "heavy_page"
  | "no_title"
  | "no_description"
  | "no_og_image"
  | "no_whatsapp_cta"
  | "no_contact_cta"
  | "broken_form"
  | "outdated_copyright"
  | "placeholder_content"
  | "no_h1"
  | "missing_image_alt"
  | "old_platform"
  | "audit_blocked";

export interface SiteAuditIssue {
  code: SiteAuditIssueCode;
  severity: SiteAuditSeverity;
  /** Título curto, escrito para o dono do negócio (não é termo técnico). */
  title: string;
  /** O que isso custa em clientes/dinheiro. */
  detail: string;
  /** O que o LeadRadar vende para resolver. */
  fix: string;
}

export interface SiteAudit {
  url: string;
  auditedAt: string;
  /** false quando o site não respondeu (site fora do ar / domínio expirado). */
  reachable: boolean;
  httpStatus?: number;
  https: boolean;
  responseTimeMs: number;
  sizeKb: number;
  /** Tecnologias detectadas (wordpress, elementor, wix...). */
  tech: string[];
  issues: SiteAuditIssue[];
  /** Saúde técnica do site: 100 = impecável, 0 = desastre. */
  healthScore: number;
  /** Oportunidade comercial: 100 = site tão ruim que vende sozinho. */
  painScore: number;
  /** Frase de gancho pronta para abrir a conversa. */
  headline: string;
  /** Até 3 defeitos em linguagem de dono de negócio. */
  bullets: string[];
}

export interface LeadPriority {
  score: number;
  level: "alta" | "media" | "baixa";
  reasons: string[];
}

/* ------------------------------------------------------------------ */
/*  Identidade visual do lead (pesquisa em perfis públicos)            */
/* ------------------------------------------------------------------ */

export type BrandColorRole = "primary" | "secondary" | "accent" | "background" | "text";

export interface BrandColor {
  hex: string;
  name?: string;
  role?: BrandColorRole;
}

export interface BrandLogo {
  /** URL pública da imagem candidata a logo (não copiamos o arquivo). */
  url?: string;
  description?: string;
  /** 0–1: quão confiante a IA está de que é o logo do negócio. */
  confidence?: number;
}

export interface BrandSnapshot {
  version: number;
  createdAt: string;
  /** Origem da coleta. */
  source: "serpapi" | "manual";
  query: string;
  /** Perfis encontrados nas imagens/resultados públicos. */
  profiles: { instagram?: string; facebook?: string };
  palette: BrandColor[];
  /** Tom visual em 3–6 adjetivos (ex.: rústico, acolhedor, minimalista). */
  tone: string[];
  typography?: { display?: string; body?: string; notes?: string };
  logo?: BrandLogo;
  /** Referências visuais (URLs públicas) com descrição do que mostram. */
  imagery: Array<{ url: string; description?: string }>;
  /** Resumo em 1 parágrafo para entrar no prompt de design. */
  summary: string;
  /** 0–1: confiança geral do snapshot. */
  confidence: number;
  /** Explica falhas parciais (sem imagens, perfil privado etc.). */
  notes?: string;
}

export interface ClientProfile {
  version: number;
  createdAt: string;
  leadId: string;
  /** Identificação do negócio (cadastro + fontes públicas). */
  identity: {
    name: string;
    category?: string;
    address?: string;
    city?: string;
    state?: string;
    phone?: string;
    instagram?: string;
    website?: string;
  };
  /** Conselho de classe (médicos, dentistas, fisioterapeutas, nutricionistas...). */
  professional?: {
    name?: string;
    council?: string;
    number?: string;
    state?: string;
    source?: string;
  };
  experience?: {
    since?: string;
    years?: number;
    education?: string[];
    certifications?: string[];
  };
  services?: string[];
  hours?: string;
  insurancePlans?: string[];
  differentials?: string[];
  socialProof?: { rating?: number; reviewsCount?: number; quotes?: string[] };
  brand?: BrandSnapshot;
  /** Resumo em 1 parágrafo para o prompt da primeira versão do site. */
  summary: string;
  /** O que não foi encontrado — vai como pergunta para o cliente. */
  gaps: string[];
  sources: Array<{ url: string; kind: "google" | "instagram" | "site" | "cadastro"; title?: string }>;
  /** 0–1: confiança geral da ficha. */
  confidence: number;
  /** Arquivos gerados (relativos ao repo raiz). */
  files?: { markdown: string; siteCopy?: string };
}

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
  /** Número de teste (Paulo e convidados): recebe prospecção na 1ª mensagem. */
  isTest?: boolean;
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
  /** Resultado da última auditoria técnica do site (WhatsApp/MCP). */
  siteAudit?: SiteAudit;
  /** Identidade visual captada em perfis públicos (Instagram/Facebook/Google). */
  brandSnapshot?: BrandSnapshot;
  /** Ficha do cliente (fatos + marca) usada na primeira versão do site. */
  clientProfile?: ClientProfile;
  /** Nicho que a busca usou (ex.: "Psicologia") — diferente do rótulo do Google. */
  searchCategory?: string;
  /** O número existe no WhatsApp? 'unknown' até validar pelo gateway. */
  whatsappStatus?: "yes" | "no" | "unknown";
  /** Quando o número foi checado no WhatsApp. */
  whatsappCheckedAt?: string;
  /** Prioridade comercial calculada a partir dos sinais de dor. */
  priorityScore?: number;
  priorityLevel?: "alta" | "media" | "baixa";
  priorityReasons?: string[];
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
export type ScheduleJobType = "mcp_autopilot" | "batch_prospecting" | "follow_up_reminder" | "outbound_cadence";

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
  | "wireframe"
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
  /** URL do wireframe aprovado (etapa wireframe) — gerado pelo agente a partir do copy + design. */
  wireframeUrl?: string;
  devNotes?: string;
  reviewNotes?: string;
  deployUrl?: string;
  /** Repositório GitHub do projeto. Com o repo único, aponta para o `lead-radar`. Ex.: https://github.com/org/repo. */
  githubRepoUrl?: string;
  /** Nome do dono/org do repositório (extraído de githubRepoUrl). */
  repoOwner?: string;
  /** Nome do repositório (extraído de githubRepoUrl). Ex.: "lead-radar". */
  repoName?: string;
  /**
   * Pasta da LP dentro do repositório único, no padrão
   * `sites/<nicho>/<slug>` (ex.: `sites/dentista/clinica-sorriso`).
   * Ausente = o dev kit sugere um caminho a partir da categoria do lead.
   */
  sitePath?: string;
  /** Tipografia escolhida no painel: vale para a prévia e para o site final. */
  fontDisplay?: string;
  fontBody?: string;
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
