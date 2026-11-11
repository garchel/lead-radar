/**
 * Qualificação de lead: telefone, score e portão de qualidade.
 *
 * Por que existe: a fórmula antiga dava 95 para quase todo mundo (65 + 20 sem
 * site + 10 nota ≥ 4,5, com teto 95) e o score combinado somava mais até bater
 * o teto 100. Resultado medido no banco: 114 de 156 leads com score exatamente
 * 100 — o score não ordenava nada.
 *
 * Aqui o score é uma MÉDIA PONDERADA de sub-notas de 0 a 1 (sem piso nem teto
 * artificial), então a distribuição se espalha de verdade e o D0 pega o topo.
 */

export type WhatsAppStatus = 'yes' | 'no' | 'unknown';

export interface PhoneInfo {
  /** Só dígitos (DDI + DDD + número), sem formatação. */
  digits: string;
  /** Celular brasileiro: 13 dígitos, "55" + DDD + 9 + 8 dígitos. */
  isMobile: boolean;
  /** Fixo: 12 dígitos (55 + DDD + 8). */
  isLandline: boolean;
  /** Formato reconhecível para discagem (10 a 13 dígitos). */
  isValid: boolean;
}

/** Interpreta o telefone como veio do Google/planilha. Não inventa número. */
export function classifyPhone(raw?: string | null): PhoneInfo {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return { digits: '', isMobile: false, isLandline: false, isValid: false };

  // aceita com ou sem DDI
  const withDdi = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  const isMobile = /^55\d{2}9\d{8}$/.test(withDdi);
  const isLandline = /^55\d{2}[2-5]\d{7}$/.test(withDdi);
  const isValid = withDdi.length >= 10 && withDdi.length <= 13 && withDdi.startsWith('55');
  return { digits: withDdi, isMobile, isLandline, isValid };
}

export interface ScoreInput {
  websiteStatus?: string;
  rating?: number;
  reviewsCount?: number;
  phone?: string;
  /** Propensão do nicho BUSCADO (0-100). */
  categoryPropensity?: number;
  /** Tier de mercado da cidade (A/B/C/D). */
  marketTier?: string;
  /** Já validado no WhatsApp? */
  whatsappStatus?: WhatsAppStatus;
}

export interface ScoreResult {
  score: number;
  level: 'high' | 'medium' | 'low';
  factors: Record<string, number>;
  /** Por que este lead é bom (ou não) — vai para a UI e para o pitch. */
  reasons: string[];
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Sub-nota de volume de avaliações (escala log: 0→0, 10→0,5, 50→0,8, 200→1). */
function reviewsSubScore(reviews?: number): number {
  if (!reviews || reviews <= 0) return 0;
  return clamp01(Math.log10(reviews + 1) / Math.log10(201));
}

/** Sub-nota de reputação: 5,0 → 1; 4,5 → 0,75; 4,0 → 0,5; 3,0 → 0. */
function ratingSubScore(rating?: number): number {
  if (typeof rating !== 'number') return 0.35; // sem nota: neutro-pessimista
  return clamp01((rating - 3) / 2);
}

/** Sub-nota de presença digital: quanto pior o site, maior a dor que vendemos. */
function presenceSubScore(websiteStatus?: string): number {
  switch (websiteStatus) {
    case 'none': return 1;
    case 'social_only': return 0.8;
    case 'marketplace_only': return 0.7;
    case 'has_website': return 0.2;
    default: return 0.6;
  }
}

function tierSubScore(tier?: string): number {
  switch ((tier || 'C').toUpperCase()) {
    case 'A': return 1;
    case 'B': return 0.75;
    case 'C': return 0.5;
    case 'D': return 0.2;
    default: return 0.5;
  }
}

function phoneSubScore(phone?: string, whatsappStatus?: WhatsAppStatus): number {
  if (whatsappStatus === 'yes') return 1;
  if (whatsappStatus === 'no') return 0;
  const info = classifyPhone(phone);
  if (info.isMobile) return 0.85;
  if (info.isLandline) return 0.3;
  return 0;
}

/**
 * Score 0-100 como média ponderada. Pesos: presença digital 30% (a dor que
 * vendemos), avaliações 20% (negócio ativo), reputação 15%, propensão do nicho
 * 15%, tier da cidade 10%, telefone/WhatsApp 10%.
 */
export function computeLeadScore(input: ScoreInput): ScoreResult {
  const presence = presenceSubScore(input.websiteStatus);
  const reviews = reviewsSubScore(input.reviewsCount);
  const rating = ratingSubScore(input.rating);
  const propensity = clamp01((input.categoryPropensity ?? 50) / 100);
  const tier = tierSubScore(input.marketTier);
  const phone = phoneSubScore(input.phone, input.whatsappStatus);

  const weights = { presence: 0.3, reviews: 0.2, rating: 0.15, propensity: 0.15, tier: 0.1, phone: 0.1 };
  const total =
    presence * weights.presence +
    reviews * weights.reviews +
    rating * weights.rating +
    propensity * weights.propensity +
    tier * weights.tier +
    phone * weights.phone;

  const score = Math.round(clamp01(total) * 100);
  const level: ScoreResult['level'] = score >= 75 ? 'high' : score >= 55 ? 'medium' : 'low';

  const reasons: string[] = [];
  if (presence >= 0.9) reasons.push('sem site próprio');
  else if (presence >= 0.7) reasons.push('só rede social/marketplace');
  if (reviews >= 0.7) reasons.push(`${input.reviewsCount} avaliações`);
  else if (reviews < 0.3) reasons.push('poucas avaliações');
  if (typeof input.rating === 'number' && input.rating >= 4.5) reasons.push(`nota ${input.rating}★`);
  if (input.whatsappStatus === 'yes') reasons.push('WhatsApp confirmado');
  else if (classifyPhone(input.phone).isLandline) reasons.push('telefone fixo (sem WhatsApp provável)');
  if (tier >= 0.75) reasons.push('cidade tier alto');
  if (propensity >= 0.85) reasons.push('nicho de alta propensão');

  return {
    score,
    level,
    factors: { presence, reviews, rating, propensity, tier, phone },
    reasons,
  };
}

export interface QualityGateOptions {
  /** Não salva lead com site próprio (default true). */
  skipWithWebsite?: boolean;
  /** Nota mínima aceitável (default 4.0). Só barra quando existe nota. */
  minRating?: number;
  /** Barra negócio com zero avaliação (default true) — costuma estar fechado. */
  requireAnyReview?: boolean;
}

export interface QualityGateResult {
  ok: boolean;
  reason?: string;
}

/**
 * Portão de entrada. Só rejeita com EVIDÊNCIA de problema — dado ausente
 * (sem nota, sem reviews) passa, porque no Google Maps isso é comum.
 */
export function passesQualityGate(
  lead: { websiteStatus?: string; rating?: number; reviewsCount?: number; name?: string; city?: string; state?: string },
  opts: QualityGateOptions = {}
): QualityGateResult {
  const skipWithWebsite = opts.skipWithWebsite ?? true;
  const minRating = opts.minRating ?? 4;
  const requireAnyReview = opts.requireAnyReview ?? true;

  if (!lead.name || !lead.city || !lead.state) {
    return { ok: false, reason: 'sem nome/cidade/UF' };
  }
  if (skipWithWebsite && lead.websiteStatus === 'has_website') {
    return { ok: false, reason: 'já tem site próprio' };
  }
  if (requireAnyReview && typeof lead.reviewsCount === 'number' && lead.reviewsCount === 0) {
    return { ok: false, reason: 'nenhuma avaliação no Google (negócio inativo?)' };
  }
  if (typeof lead.rating === 'number' && lead.rating < minRating) {
    return { ok: false, reason: `nota ${lead.rating}★ abaixo do mínimo ${minRating}` };
  }
  return { ok: true };
}

/** Pode receber D0? Celular, ou número já validado no WhatsApp. */
export function isReachableOnWhatsApp(
  lead: { phone?: string; whatsappStatus?: WhatsAppStatus },
  opts: { requireValidated?: boolean } = {}
): { ok: boolean; reason?: string } {
  if (!lead.phone) return { ok: false, reason: 'sem telefone' };
  if (lead.whatsappStatus === 'no') return { ok: false, reason: 'número sem WhatsApp' };
  if (lead.whatsappStatus === 'yes') return { ok: true };
  if (opts.requireValidated) return { ok: false, reason: 'WhatsApp ainda não validado' };
  const info = classifyPhone(lead.phone);
  if (info.isMobile) return { ok: true };
  if (info.isLandline) return { ok: false, reason: 'telefone fixo — sem WhatsApp provável' };
  return { ok: false, reason: 'telefone inválido' };
}
