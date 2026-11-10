import type { SiteAudit } from "../store/types";

/**
 * QA anti-alucinação do pitch gerado pela IA.
 *
 * O prompt já manda citar os defeitos reais, mas modelo de linguagem inventa:
 * "seu site demora 8s" quando medimos 2,4s, "não tem WhatsApp" quando tem, ou
 * um pitch genérico que não usa nenhum dado da auditoria. Aqui a gente confere
 * o texto ANTES de ele virar mensagem enviada ao dono do negócio.
 */

export interface PitchContext {
  businessName?: string;
  websiteStatus?: string;
  websiteUrl?: string;
  rating?: number;
  reviewsCount?: number;
  suggestedTicket?: number;
  siteAudit?: SiteAudit;
}

export interface PitchQaResult {
  ok: boolean;
  issues: string[];
  /** Instrução extra para o segundo pedido à IA (quando o pitch reprova). */
  retryHint: string;
}

const STOPWORDS = new Set([
  "para",
  "com",
  "sem",
  "dos",
  "das",
  "que",
  "uma",
  "por",
  "mais",
  "seu",
  "sua",
  "nos",
  "nas",
  "como",
  "não",
  "nao",
  "site",
  "página",
  "pagina",
]);

function significantWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

function normalize(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Palavras que denunciam cada tipo de defeito mesmo quando o título é
 * parafraseado pela IA ("demora 2.4s" em vez de "carregamento lento").
 */
const ISSUE_HINTS: Record<string, string[]> = {
  slow_response: ["demora", "demorou", "lento", "lentidao", "carreg", "segundos", "abre em"],
  no_whatsapp: ["whatsapp", "whats"],
  no_whatsapp_cta: ["whatsapp", "whats", "botao", "contato"],
  no_https: ["https", "seguro", "cadeado", "inseguro"],
  no_viewport: ["celular", "mobile", "responsiv"],
  no_form: ["formulario", "orcamento", "contato"],
  stale_content: ["desatualiz", "antigo", "copyright", "ano"],
  slow_mobile: ["celular", "mobile", "lento", "demora"],
};

/** Defeitos da auditoria citados no texto (casa pelo código, título ou detalhe). */
export function citedAuditIssues(pitch: string, audit?: SiteAudit): string[] {
  if (!audit) return [];
  const haystack = normalize(pitch);
  return audit.issues
    .filter((issue) => {
      const words = significantWords(issue.title);
      if (words.length > 0) {
        const hits = words.filter((word) => haystack.includes(word)).length;
        if (hits >= Math.min(2, words.length)) return true;
      }
      const hints = ISSUE_HINTS[issue.code] || [];
      return hints.some((hint) => haystack.includes(normalize(hint)));
    })
    .map((issue) => issue.title);
}

function secondsClaims(pitch: string): number[] {
  const values: number[] = [];
  const regex = /(\d+(?:[.,]\d+)?)\s*(?:s\b|seg|segundos?)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(pitch))) {
    const value = Number(match[1].replace(",", "."));
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

export function qaPitch(pitch: string, ctx: PitchContext): PitchQaResult {
  const issues: string[] = [];
  const text = String(pitch || "").trim();
  const haystack = normalize(text);

  if (text.length < 40) issues.push("Pitch vazio ou curto demais.");

  // 1) Quando existe auditoria, o pitch precisa usar os defeitos medidos.
  const audit = ctx.siteAudit;
  if (audit) {
    const cited = citedAuditIssues(text, audit);
    if (cited.length < 2) {
      issues.push(
        `O pitch cita ${cited.length} defeito(s) da auditoria; são necessários ao menos 2 (${audit.issues
          .slice(0, 3)
          .map((item) => item.title)
          .join("; ")}).`
      );
    }
  }

  // 2) Contradições sobre presença digital.
  const hasOwnSite = ctx.websiteStatus === "has_website";
  if (!hasOwnSite && /(seu|do seu|no seu)\s+site/.test(haystack)) {
    issues.push('O lead não tem site próprio, mas o pitch fala em "seu site".');
  }
  if (hasOwnSite && /(nao tem site|sem site|nao possui site|nao tem nenhum site)/.test(haystack)) {
    issues.push('O lead tem site, mas o pitch diz que não tem.');
  }
  const claimNoWhatsapp = /(nao tem whatsapp|sem whatsapp|nao possui whatsapp)/.test(haystack);
  if (claimNoWhatsapp) issues.push("Não afirme que o negócio não tem WhatsApp — o contato é justamente por lá.");

  // 3) Números precisam bater com o que foi medido.
  if (audit?.responseTimeMs) {
    const measured = audit.responseTimeMs / 1000;
    for (const claimed of secondsClaims(text)) {
      if (claimed > 0 && Math.abs(claimed - measured) > Math.max(1, measured * 0.5)) {
        issues.push(`Tempo citado (${claimed}s) não bate com o medido (${measured.toFixed(1)}s).`);
      }
    }
  }

  if (typeof ctx.rating === "number") {
    const ratingMatch = haystack.match(/(\d(?:[.,]\d)?)\s*(?:estrelas?|★|de nota)/);
    if (ratingMatch) {
      const claimed = Number(ratingMatch[1].replace(",", "."));
      if (Math.abs(claimed - ctx.rating) > 0.2) {
        issues.push(`Nota citada (${claimed}) não bate com a do Google (${ctx.rating}).`);
      }
    }
  }

  const retryHint = issues.length
    ? [
        "",
        "- CORREÇÕES OBRIGATÓRIAS NO PITCH (o rascunho anterior falhou na revisão):",
        ...issues.map((issue) => `  • ${issue}`),
        "- Reescreva o customPitchWhatsApp sem inventar dados: use apenas os defeitos e números informados acima.",
      ].join("\n")
    : "";

  return { ok: issues.length === 0, issues, retryHint };
}
