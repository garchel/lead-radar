import { StoredLead } from "../store/types";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function li(items?: string[]): string {
  if (!items || items.length === 0) return "<li>—</li>";
  return items.map((i) => `<li>${esc(i)}</li>`).join("");
}

/**
 * Constrói um Dossiê Executivo (HTML, pronto para imprimir/PDF pelo navegador)
 * a partir do lead e do diagnóstico de IA já persistido (`lead.analysis`).
 * Sem novas chamadas de IA — usa a fonte da verdade (SQLite).
 */
export function buildLeadDossier(lead: StoredLead): string {
  const a = lead.analysis || {};
  const aLi = Array.isArray(a.missingFeatures) ? a.missingFeatures : [];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dossiê — ${esc(lead.name)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#1e293b; margin:0; padding:32px; background:#fff; }
  h1 { font-size:24px; margin:0 0 4px; }
  h2 { font-size:15px; color:#4f46e5; text-transform:uppercase; letter-spacing:.04em; margin:28px 0 8px; }
  .muted { color:#64748b; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:12px; }
  .stat { border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; }
  .stat b { display:block; font-size:18px; }
  .stat span { font-size:12px; color:#64748b; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  td, th { text-align:left; padding:7px 9px; border-bottom:1px solid #eef2f7; font-size:13px; }
  th { color:#64748b; font-weight:600; }
  ul { margin:6px 0; padding-left:20px; }
  li { font-size:13.5px; margin:3px 0; }
  .pitch { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; white-space:pre-wrap; font-size:13px; }
</style>
</head>
<body>
  <h1>${esc(lead.name)}</h1>
  <p class="muted">${esc([lead.category, lead.address, [lead.city, lead.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ")) || "Sem localização"}</p>

  <div class="grid">
    <div class="stat"><b>${esc(a.opportunityScore ?? lead.opportunityScore ?? "—")}</b><span>Score de Oportunidade</span></div>
    <div class="stat"><b>${esc(lead.rating ?? "—")}★</b><span>Nota Google (${esc(lead.reviewsCount ?? 0)} aval.)</span></div>
    <div class="stat"><b>${esc(a.urgencyLevel ?? "—")}</b><span>Urgência</span></div>
  </div>

  <h2>Falhas no perfil atual</h2>
  <ul>${li(aLi)}</ul>

  <h2>Por que precisa de uma Landing Page</h2>
  <p style="font-size:13.5px">${esc(a.whyTheyNeedLandingPage ?? "—")}</p>

  <h2>Vantagem sobre concorrentes</h2>
  <p style="font-size:13.5px">${esc(a.competitorAdvantage ?? "—")}</p>

  <h2>Dados de contato</h2>
  <table>
    <tr><th>Telefone / WhatsApp</th><td>${esc(lead.phone ?? "—")}</td></tr>
    <tr><th>E-mail</th><td>${esc(lead.email ?? "—")}</td></tr>
    <tr><th>CNPJ</th><td>${esc(lead.cnpj ?? "—")}</td></tr>
    <tr><th>Instagram</th><td>${esc(lead.instagramHandle ?? "—")}</td></tr>
    <tr><th>Site</th><td>${esc(lead.websiteUrl ?? "sem site")}</td></tr>
  </table>

  <h2>Pitch de WhatsApp</h2>
  <div class="pitch">${esc(a.customPitchWhatsApp ?? "—")}</div>

  <h2>Pitch de E-mail</h2>
  <div class="pitch">${esc(a.customPitchEmail ?? "—")}</div>

  <p class="muted" style="margin-top:32px;font-size:11px">LeadRadar AI — Dossiê gerado em ${esc(new Date().toLocaleString("pt-BR"))}</p>
</body>
</html>`;
}