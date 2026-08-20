import { StoredLead } from "../store/types";

export interface LpConcept {
  heroHeadline?: string;
  heroSubheadline?: string;
  callToAction?: string;
  recommendedSections?: string[];
  suggestedColorPalette?: string;
  keySellingPoints?: string[];
}

function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => {
    const m: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return m[c];
  });
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "landing-page"
  );
}

/**
 * Generates a complete, self-contained HTML landing page from a business lead
 * and an AI-generated concept. Missing content is rejected instead of being
 * replaced with invented marketing claims.
 */
export function generateLandingPageHtml(lead: StoredLead, concept?: LpConcept): string {
  if (!concept?.heroHeadline?.trim() || !concept.heroSubheadline?.trim() || !concept.callToAction?.trim()) {
    throw new Error('Conceito inválido: heroHeadline, heroSubheadline e callToAction são obrigatórios.');
  }
  if (!concept.recommendedSections?.length || !concept.keySellingPoints?.length) {
    throw new Error('Conceito inválido: recommendedSections e keySellingPoints não podem estar vazios.');
  }

  const businessName = lead.name;
  const headline = concept.heroHeadline;
  const sub = concept.heroSubheadline;
  const cta = concept.callToAction;
  const sellingPoints = concept.keySellingPoints;
  const sections = concept.recommendedSections;

  const phone = String(lead.phone || '').replace(/\D/g, '');
  if (phone.length < 10) {
    throw new Error('Lead sem telefone válido para gerar os links de WhatsApp da Landing Page.');
  }
  const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
  const waUrl = `https://wa.me/${fullPhone}`;

  const ratingBlurb = lead.rating
    ? `${lead.rating}★ com base em ${lead.reviewsCount || 0} avaliações no Google`
    : "";

  const stars = lead.rating ? `⭐ ${lead.rating}` : "";

  const sellingHtml = sellingPoints
    .map((p: string) => `<li class="point">✅ ${esc(p)}</li>`)
    .join("");

  const sectionsHtml = sections
    .map((s: string) => `<li>${esc(s)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(businessName)} — Landing Page</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.6; }
    .hero { background: linear-gradient(135deg, #1e3a8a 0%, #312e81 50%, #1e1b4b 100%); color: #fff; padding: 64px 24px; text-align: center; }
    .hero h1 { font-size: 2.2rem; max-width: 720px; margin: 0 auto 16px; }
    .hero p { font-size: 1.15rem; max-width: 620px; margin: 0 auto 28px; opacity: .92; }
    .cta { display: inline-block; background: #10b981; color: #fff; padding: 14px 32px; border-radius: 999px; font-weight: 700; text-decoration: none; font-size: 1.05rem; box-shadow: 0 8px 24px rgba(16,185,129,.35); }
    .cta:hover { background: #059669; }
    .badge { margin-top: 18px; font-size: .9rem; opacity: .85; }
    .section { max-width: 900px; margin: 0 auto; padding: 48px 24px; }
    .section h2 { font-size: 1.6rem; margin-bottom: 20px; }
    .section ul { list-style: none; display: grid; gap: 12px; }
    .section ul li { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; }
    .points { display: grid; gap: 12px; }
    .point { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 14px 16px; }
    footer { text-align: center; padding: 28px 16px; color: #64748b; font-size: .85rem; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <section class="hero">
    <h1>${esc(headline)}</h1>
    <p>${esc(sub)}</p>
    <a class="cta" href="${waUrl}" target="_blank" rel="noopener">${esc(cta)}</a>
    ${ratingBlurb ? `<div class="badge">${stars} · ${esc(ratingBlurb)}</div>` : ""}
  </section>

  <section class="section">
    <h2>Por que escolher ${esc(businessName)}</h2>
    <div class="points">${sellingHtml}</div>
  </section>

  <section class="section">
    <h2>Nossos Serviços</h2>
    <ul>${sectionsHtml}</ul>
  </section>

  <section class="section" style="text-align:center;">
    <a class="cta" href="${waUrl}" target="_blank" rel="noopener">Fale Conosco no WhatsApp</a>
  </section>

  <footer>
    © ${new Date().getFullYear()} ${esc(businessName)} — Landing Page gerada automaticamente pelo LeadRadar AI.
  </footer>
</body>
</html>`;
}

export function generateSlug(name: string): string {
  return slugify(name);
}
