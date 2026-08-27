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
  rating?: number;
  reviewsCount?: number;
  websiteStatus: 'none' | 'social_only' | 'has_website';
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
  isAlreadySaved?: boolean;
  existingLeadId?: string;
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
  presenceFilter?: 'all' | 'gold' | 'silver' | 'has_website';
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
  autoSaveNoWebsite?: boolean;
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
  devNotes?: string;
  reviewNotes?: string;
  deployUrl?: string;
  githubRepoUrl?: string;
  repoOwner?: string;
  repoName?: string;
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
