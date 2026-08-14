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
  instagramHandle?: string;
  lat: number;
  lng: number;
  opportunityScore: number; // 0 - 100
  opportunityLevel: 'high' | 'medium' | 'low';
  estimatedValue: string;
  keyInsights: string[];
  savedAt?: string;
  pipelineStatus?: 'prospect' | 'contacted' | 'negotiating' | 'closed' | 'declined';
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

export interface SearchFilters {
  state?: string;
  location: string;
  category: string;
  filterNoWebsiteOnly: boolean;
  presenceFilter?: 'all' | 'gold' | 'silver' | 'has_website';
  minRating: number;
  minReviews: number;
  sortBy: 'score' | 'rating' | 'reviews' | 'name';
}

export interface PipelineStats {
  totalProspects: number;
  contacted: number;
  negotiating: number;
  closed: number;
  estimatedPipelineValue: number;
}
