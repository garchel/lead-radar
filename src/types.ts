export type InteractionOutcome =
  | 'pending'
  | 'no_response'
  | 'negative'
  | 'positive'
  | 'meeting_scheduled'
  | 'negotiating'
  | 'do_not_contact';

export interface BusinessLead {
  id: string;
  name: string;
  category: string;
  address: string;
  neighborhood?: string;
  city: string;
  state?: string;
  phone?: string;
  email?: string;
  cnpj?: string;
  rating?: number;
  reviewsCount?: number;
  websiteStatus: 'none' | 'social_only' | 'marketplace_only' | 'has_website';
  websiteUrl?: string;
  googlePlaceId?: string;
  instagramHandle?: string;
  lat?: number;
  lng?: number;
  opportunityScore?: number; // 0 - 100
  opportunityLevel?: 'high' | 'medium' | 'low';
  estimatedValue?: string;
  /** Ticket sugerido (R$) = ticket base da categoria × tier da cidade (IBGE). */
  suggestedTicket?: number;
  /** Tier de mercado da cidade do lead (A/B/C/D). */
  marketTier?: 'A' | 'B' | 'C' | 'D';
  keyInsights?: string[];
  savedAt?: string;
  pipelineStatus?: 'prospect' | 'contacted' | 'negotiating' | 'em_desenvolvimento' | 'closed' | 'declined';
  notes?: string;
  lastContactAt?: string;
  lastResponseAt?: string;
  lastContactOutcome?: InteractionOutcome;
  nextContactAt?: string;
  contactAttempts?: number;
  doNotContact?: boolean;
  /** Número de teste (Paulo e convidados), não é lead real. */
  isTest?: boolean;
  isAlreadySaved?: boolean;
  existingLeadId?: string;
  /** Identidade visual captada em perfis/imagens públicas. */
  brandSnapshot?: BrandSnapshot;
}

export type BrandColorRole = 'primary' | 'secondary' | 'accent' | 'background' | 'text';

export interface BrandColor {
  hex: string;
  name?: string;
  role?: BrandColorRole;
}

export interface BrandLogo {
  url?: string;
  description?: string;
  confidence?: number;
}

export interface BrandSnapshot {
  version: number;
  createdAt: string;
  source: 'serpapi' | 'manual';
  query: string;
  profiles: { instagram?: string; facebook?: string };
  palette: BrandColor[];
  tone: string[];
  typography?: { display?: string; body?: string; notes?: string };
  logo?: BrandLogo;
  imagery: Array<{ url: string; description?: string }>;
  summary: string;
  confidence: number;
  notes?: string;
}

export interface LeadAnalysisResult {
  businessName: string;
  opportunityScore: number;
  revenuePotential: string;
  urgencyLevel: 'alta' | 'média' | 'baixa';
  missingFeatures: string[];
  whyTheyNeedLandingPage: string;
  competitorAdvantage: string;
  customPitchWhatsApp: string;
  customPitchEmail: string;
  customPitchColdCall: string;
  landingPageConcept: {
    heroHeadline: string;
    heroSubheadline: string;
    callToAction: string;
    recommendedSections: string[];
    suggestedColorPalette: string;
    keySellingPoints: string[];
  };
}

export type ProspectingProvider = 'serpapi' | 'gemini';

export interface SerpApiUsage {
  configured: boolean;
  searchesPerMonth: number;
  throughputPerHour: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  usedThisHour: number;
  remainingThisHour: number;
  monthKey: string;
  hourWindowStart: string | null;
  nextMonthlyReset: string;
  nextHourlyReset: string | null;
}

export interface SearchFilters {
  state?: string;
  location: string;
  category: string;
  filterNoWebsiteOnly: boolean;
  presenceFilter?: 'all' | 'gold' | 'silver' | 'bronze' | 'has_website';
  minRating: number;
  minReviews: number;
  sortBy: 'score' | 'rating' | 'reviews' | 'name';
  provider?: ProspectingProvider;
  useCityRotation?: boolean;
  citiesPerRun?: number;
  rotationUf?: string;
  minPopulation?: number;
  maxPopulation?: number;
  minPropensity?: number;
  autoSaveMode?: 'off' | 'gold' | 'gold_silver';
}

export interface PipelineStats {
  totalProspects: number;
  contacted: number;
  negotiating: number;
  em_desenvolvimento: number;
  closed: number;
  estimatedPipelineValue: number;
}

export type ProjectStage =
  | 'briefing'
  | 'copywriting'
  | 'design'
  | 'wireframe'
  | 'desenvolvimento'
  | 'revisao'
  | 'deploy';

export type ProjectStatus = 'em_andamento' | 'pausado' | 'cancelado' | 'concluido';

export type ProjectPriority = 'baixa' | 'media' | 'alta';

export type ProjectDevStatus =
  | 'aguardando_agente'
  | 'em_desenvolvimento'
  | 'codigo_entregue'
  | 'aprovado';

export type ProjectType = 'landing_page' | 'site_institucional';

export interface ProjectBriefingField {
  fieldTitle: string;
  answer: string;
}

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
  type?: ProjectType;
  typeformToken?: string;
  brief?: string;
  briefing?: ProjectBriefingField[];
  tasks?: ProjectTask[];
  copy?: string;
  designNotes?: string;
  wireframeUrl?: string;
  devNotes?: string;
  reviewNotes?: string;
  deployUrl?: string;
  githubRepoUrl?: string;
  repoOwner?: string;
  repoName?: string;
  /** Pasta da LP no repositório único: `sites/<nicho>/<slug>`. */
  sitePath?: string;
  previewUrl?: string;
  devStatus?: ProjectDevStatus;
  devMessage?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  archivedAt?: string;
  leadName?: string;
  leadCity?: string;
  leadCategory?: string;
}

export type ProjectAssetType = 'image' | 'video' | 'document' | 'other';

/** Arquivo de asset encontrado na pasta da LP (`sites/<nicho>/<slug>/`). */
export interface ProjectAssetFile {
  name: string;
  path: string;
  url: string;
  size: number;
  type: ProjectAssetType;
  mime: string;
  updatedAt: string;
}

/** Resposta de `GET /api/projects/:id/assets`. */
export interface ProjectAssets {
  projectId: string;
  sitePath: string;
  siteExists: boolean;
  files: ProjectAssetFile[];
  brand?: BrandSnapshot;
  links: {
    wireframeUrl?: string;
    previewUrl?: string;
    deployUrl?: string;
    githubRepoUrl?: string;
  };
}

export type ActionItemKind =
  | 'code_review'
  | 'project_overdue'
  | 'follow_ups_due'
  | 'outbox_failed'
  | 'outbox_unconfirmed';

/** Item de "próximas ações" agregado no topo do app. */
export interface ActionItem {
  id: string;
  kind: ActionItemKind;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  count: number;
  /** Aba para onde a ação navega (id do activeTab). */
  tab: 'projects' | 'crm' | 'growth';
  /** Quando definido, a navegação abre o modal deste projeto. */
  projectId?: string;
}

/** Resposta de `GET /api/action-items`. */
export interface ActionItemsResponse {
  success: true;
  items: ActionItem[];
  total: number;
  generatedAt: string;
  outbox: {
    failed: Array<{
      communicationId: string;
      leadId: string;
      leadName: string;
      phone?: string;
      channel: string;
      hook?: string;
      message: string;
      createdAt: string;
      ageHours: number;
    }>;
    unconfirmed: Array<{
      communicationId: string;
      leadId: string;
      leadName: string;
      phone?: string;
      channel: string;
      hook?: string;
      message: string;
      createdAt: string;
      ageHours: number;
    }>;
  };
}
