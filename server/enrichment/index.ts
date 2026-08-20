import { enrichWithGooglePlaces } from './googlePlaces';
import { lookupCnpj } from './brasilApi';
import { findCompanyEmail } from './hunterIo';
import { updateLeadEnrichment } from '../store/db';
import { StoredLead } from '../store/types';

export interface EnrichmentResult {
  enriched: boolean;
  fields: string[];
  details?: {
    googlePlaces?: boolean | 'not_configured';
    brasilApi?: boolean;
    hunterIo?: boolean | 'not_configured';
  };
}

/**
 * Run all enrichment sources for a given lead.
 * Each source is independent — one failure doesn't block the others.
 *
 * Call this after upserting a lead, or on demand from a MCP tool / API route.
 */
export async function enrichLead(lead: StoredLead): Promise<EnrichmentResult> {
  const updated: Partial<Pick<StoredLead, 'email' | 'cnpj' | 'instagramHandle' | 'websiteUrl' | 'phone'>> = {};
  const details: EnrichmentResult['details'] = {};
  const fields: string[] = [];

  // ── 1. Google Places ────────────────────────────────────────────
  try {
    const place = await enrichWithGooglePlaces(lead.name, lead.city);
    if (place) {
      details.googlePlaces = true;

      if (place.phone && !lead.phone) {
        updated.phone = place.phone;
        fields.push('phone');
      }
      if (place.website && !lead.websiteUrl) {
        updated.websiteUrl = place.website;
        fields.push('websiteUrl');
      }
      if (place.rating !== undefined && !lead.rating) {
        // rating will be handled separately via search result
      }

      // Try to extract Instagram from website
      if (place.website && !lead.instagramHandle) {
        const insta = await extractInstagram(place.website);
        if (insta) {
          updated.instagramHandle = insta;
          fields.push('instagramHandle');
        }
      }
    } else {
      details.googlePlaces = false;
    }
  } catch (err: any) {
    throw new Error(`Falha no enriquecimento Google Places: ${err?.message || 'erro desconhecido'}`);
  }

  // ── 2. BrasilAPI (CNPJ) ─────────────────────────────────────────
  // Attempt CNPJ lookup if we have the CNPJ already, or try to find one
  if (lead.cnpj) {
    try {
      const cnpjData = await lookupCnpj(lead.cnpj);
      if (cnpjData) {
        details.brasilApi = true;

        if (cnpjData.email && !lead.email) {
          updated.email = cnpjData.email;
          fields.push('email');
        }
        if (cnpjData.telefone && !lead.phone) {
          updated.phone = cnpjData.telefone;
          if (!fields.includes('phone')) fields.push('phone');
        }
      } else {
        details.brasilApi = false;
      }
    } catch (err: any) {
      throw new Error(`Falha no enriquecimento BrasilAPI: ${err?.message || 'erro desconhecido'}`);
    }
  } else {
    details.brasilApi = false;
  }

  // ── 3. Hunter.io (e-mail) ────────────────────────────────────────
  if (!lead.email) {
    if (!process.env.HUNTER_API_KEY) {
      details.hunterIo = 'not_configured';
    } else {
      const domain = lead.websiteUrl ? new URL(lead.websiteUrl).hostname : undefined;
      if (domain) {
        const hunter = await findCompanyEmail(lead.name, { domain });
        if (hunter?.email) {
          updated.email = hunter.email;
          fields.push('email');
          details.hunterIo = true;
        } else {
          details.hunterIo = false;
        }
      } else {
        details.hunterIo = false;
      }
    }
  } else {
    details.hunterIo = false;
  }

  // ── Persist ─────────────────────────────────────────────────────
  if (fields.length > 0) {
    updateLeadEnrichment(lead.id, updated);
  }

  return { enriched: fields.length > 0, fields, details };
}

/**
 * Try to extract an Instagram handle from a business website.
 */
async function extractInstagram(website: string): Promise<string | null> {
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for social links
    const patterns = [
      /instagram\.com\/([a-zA-Z0-9_.]+)/i,
      /@([a-zA-Z0-9_.]{3,30})/g,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        const handle = match[1] || match[0];
        // Clean up common false positives
        if (handle && !['instagram', 'instagram.com', 'share', '?', ' '].includes(handle)) {
          // Remove trailing slash, query params
          const clean = handle.replace(/[/?#].*$/, '');
          if (clean.length >= 3) return `@${clean.replace(/^@/, '')}`;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Enrich a batch of leads (useful in queue jobs).
 */
export async function enrichLeadBatch(leads: StoredLead[]): Promise<{ enriched: number; total: number }> {
  let enriched = 0;
  for (const lead of leads) {
    const result = await enrichLead(lead);
    if (result.enriched) enriched++;
  }
  return { enriched, total: leads.length };
}