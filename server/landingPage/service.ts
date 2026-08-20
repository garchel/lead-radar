
import { upsertLandingPage, getLandingPageById, getLeadById } from "../store/db";
import { LandingPage, StoredLead } from "../store/types";
import { generateLandingPageHtml, generateSlug } from "./generator";
import { deployToNetlify } from "../enrichment/netlifyDeployer";


function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export function createLandingPageRecord(lead: StoredLead, concept?: any, jobId?: string): LandingPage {
  const slug = generateSlug(lead.name);
  const existing = getLandingPageById(slug);
  const id = existing ? newId("lp") : slug;
  const html = generateLandingPageHtml(lead, concept);

  const lp: LandingPage = {
    id: existing ? id : slug,
    leadId: lead.id,
    businessName: lead.name,
    slug,
    stage: "rascunho",
    status: "aguardando_aprovacao",
    html,
    concept,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  upsertLandingPage(lp);
  return lp;
}


export function approveLandingPage(id: string): LandingPage | null {
  const lp = getLandingPageById(id);
  if (!lp) return null;
  lp.stage = "deploy";
  lp.status = "aprovada";
  lp.updatedAt = new Date().toISOString();
  upsertLandingPage(lp);
  return lp;
}

export function rejectLandingPage(id: string): LandingPage | null {
  const lp = getLandingPageById(id);
  if (!lp) return null;
  lp.status = "rejeitada";
  lp.updatedAt = new Date().toISOString();
  upsertLandingPage(lp);
  return lp;
}

export async function deployLandingPage(id: string): Promise<LandingPage | null> {
  const lp = getLandingPageById(id);
  if (!lp) return null;
  if (lp.status !== "aprovada") {
    throw new Error("Landing page ainda não aprovada. Use approve_landing_page antes do deploy.");
  }

  if (!process.env.NETLIFY_AUTH_TOKEN) {
    throw new Error('NETLIFY_AUTH_TOKEN não configurado. O deploy externo é obrigatório; não existe deploy local automático.');
  }
  if (!lp.html) {
    throw new Error('Landing page sem HTML para publicar.');
  }

  const result = await deployToNetlify(lp.html, `lp-${lp.slug}`);
  if (!result.success || !result.url) {
    throw new Error(`Falha no deploy Netlify: ${result.error || 'URL pública não retornada.'}`);
  }

  lp.stage = "publicado";
  lp.status = "publicada";
  lp.url = result.url;
  lp.updatedAt = new Date().toISOString();
  upsertLandingPage(lp);
  return lp;
}

export function resolveLandingPageHtml(idOrSlug: string): { html?: string; lp?: LandingPage; lead?: StoredLead } {
  const lp = getLandingPageById(idOrSlug);
  if (!lp) return {};
  return { html: lp.html, lp, lead: lp ? getLeadById(lp.leadId) : undefined };
}
