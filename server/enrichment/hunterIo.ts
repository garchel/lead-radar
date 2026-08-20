/**
 * Hunter.io email finder enrichment.
 * Requires HUNTER_API_KEY in .env.
 * Free tier: ~25 searches/month (https://hunter.io).
 */
export interface HunterEnrichment {
  email?: string;
  firstName?: string;
  lastName?: string;
  company: string;
  confidence?: number;
  type?: string;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Hunter.io HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Find the most likely email for a company, optionally for a specific person.
 */
export async function findCompanyEmail(
  company: string,
  opts?: { domain?: string; fullName?: string; role?: string },
): Promise<HunterEnrichment | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error('HUNTER_API_KEY não configurada para buscar e-mails reais.');
  }

  const params = new URLSearchParams({ api_key: apiKey });

  if (opts?.domain) {
    params.set('domain', opts.domain);
  } else if (company) {
    params.set('company', company);
  }
  if (opts?.fullName) params.set('full_name', opts.fullName);
  if (opts?.role) params.set('role', opts.role);

  const data = await fetchJson(`https://api.hunter.io/v2/email-finder?${params.toString()}`);

  if (data.data?.email) {
    return {
      email: data.data.email,
      firstName: data.data.first_name,
      lastName: data.data.last_name,
      company,
      confidence: data.data.score,
      type: data.data.type,
    };
  }
  return null;
}