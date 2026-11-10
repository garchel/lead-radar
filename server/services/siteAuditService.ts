import { updateLeadSiteAudit } from "../store/db";
import type { SiteAudit, SiteAuditIssue, SiteAuditIssueCode, SiteAuditSeverity, StoredLead } from "../store/types";
import { effectiveWebsiteStatus } from "./presenceService";

/**
 * Auditoria técnica do site de um lead — o "check-up" que transforma a
 * abordagem genérica ("quer um site?") em uma conversa sobre um defeito real
 * ("seu site demora 7s no celular").
 *
 * Toda a análise de HTML é feita por `analyzeSiteHtml`, uma função pura, para
 * poder ser testada sem rede. `auditWebsite` faz apenas o fetch e mede tempo.
 */

const AUDIT_TIMEOUT_MS = Number(process.env.SITE_AUDIT_TIMEOUT_MS || 12000);
const AUDIT_USER_AGENT =
  process.env.SITE_AUDIT_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SEVERITY_WEIGHT: Record<SiteAuditSeverity, number> = {
  critical: 25,
  warning: 12,
  info: 4,
};

const SEVERITY_ORDER: Record<SiteAuditSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Aceita "empresa.com.br", "http://..." e "https://..." e devolve uma URL válida. */
export function normalizeSiteUrl(raw?: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;

  // Redes sociais e agregadores não são site próprio.
  if (/^(https?:\/\/)?(www\.)?(instagram\.com|facebook\.com|fb\.com|linktr\.ee|wa\.me|api\.whatsapp\.com)\b/i.test(value)) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!url.hostname.includes(".")) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function issue(
  code: SiteAuditIssueCode,
  severity: SiteAuditSeverity,
  title: string,
  detail: string,
  fix: string
): SiteAuditIssue {
  return { code, severity, title, detail, fix };
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1).replace(".", ",");
}

function detectTech(html: string): string[] {
  const tech = new Set<string>();
  const generator = /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] || "";
  const haystack = `${generator} ${html.slice(0, 200000)}`.toLowerCase();

  const markers: Array<[string, RegExp]> = [
    ["wordpress", /wp-content|wp-includes|wordpress/],
    ["elementor", /elementor/],
    ["wix", /wix\.com|wixstatic/],
    ["squarespace", /squarespace/],
    ["shopify", /cdn\.shopify|shopify/],
    ["webflow", /webflow/],
    ["joomla", /joomla/],
    ["bitrix", /bitrix/],
    ["google-sites", /sites\.google\.com/],
    ["react", /__next_data__|react/],
  ];
  for (const [name, re] of markers) {
    if (re.test(haystack)) tech.add(name);
  }
  const versionMatch = /wordpress\s*([0-9]+)\.([0-9]+)/i.exec(generator);
  if (versionMatch) tech.add(`wordpress-${versionMatch[1]}.${versionMatch[2]}`);
  return [...tech];
}

function maxCopyrightYear(html: string): number | null {
  const years = new Set<number>();
  const re = /(?:©|&copy;|copyright|todos os direitos|all rights reserved)[^0-9]{0,40}(20[0-9]{2})/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const year = Number(match[1]);
    if (year >= 2000 && year <= 2100) years.add(year);
  }
  // Fallback: qualquer "© 2019" / "(c) 2019"
  const loose = /(?:©|&copy;|\(c\))\s*(20[0-9]{2})/gi;
  while ((match = loose.exec(html)) !== null) {
    const year = Number(match[1]);
    if (year >= 2000 && year <= 2100) years.add(year);
  }
  return years.size ? Math.max(...years) : null;
}

export interface AnalyzeSiteInput {
  url: string;
  html: string;
  https: boolean;
  httpStatus?: number;
  responseTimeMs: number;
  sizeKb: number;
  /** Ano de referência (default: ano atual) — injetável para testes. */
  currentYear?: number;
}

export interface AnalyzeSiteResult {
  issues: SiteAuditIssue[];
  tech: string[];
  healthScore: number;
  painScore: number;
  headline: string;
  bullets: string[];
}

/** Análise pura do HTML — sem rede, determinística (testável). */
export function analyzeSiteHtml(input: AnalyzeSiteInput): AnalyzeSiteResult {
  const html = input.html || "";
  const lower = html.toLowerCase();
  const currentYear = input.currentYear ?? new Date().getFullYear();
  const issues: SiteAuditIssue[] = [];
  const tech = detectTech(html);

  // --- Segurança / disponibilidade ---
  if (!input.https) {
    issues.push(
      issue(
        "no_https",
        "critical",
        "Seu site abre sem o cadeado de segurança",
        "O Chrome marca o site como \u201cNão seguro\u201d. Muita gente fecha a página nesse aviso antes de ver o seu trabalho.",
        "Certificado SSL + site publicado em HTTPS."
      )
    );
  }

  // --- Velocidade / peso ---
  if (input.responseTimeMs > 6000) {
    issues.push(
      issue(
        "slow_response",
        "critical",
        `Seu site demora ${formatSeconds(input.responseTimeMs)}s para abrir`,
        "Acima de 3 segundos, mais da metade dos visitantes desiste. No 4G do celular fica ainda pior.",
        "Site otimizado com carregamento abaixo de 3s."
      )
    );
  } else if (input.responseTimeMs > 4000) {
    issues.push(
      issue(
        "slow_response",
        "warning",
        `Seu site leva ${formatSeconds(input.responseTimeMs)}s para responder`,
        "O Google usa a velocidade como critério de ranking. Site lento aparece depois dos concorrentes.",
        "Otimização de imagens, cache e hospedagem."
      )
    );
  }

  if (input.sizeKb > 6000) {
    issues.push(
      issue(
        "heavy_page",
        "critical",
        "A página é pesada demais para celular",
        `A página inicial tem cerca de ${Math.round(input.sizeKb / 1024)} MB. Quem está no 4G espera e vai embora.`,
        "Página enxuta, imagens comprimidas e carregamento progressivo."
      )
    );
  } else if (input.sizeKb > 3000) {
    issues.push(
      issue(
        "heavy_page",
        "warning",
        "A página carrega mais dados que o necessário",
        `São ~${Math.round(input.sizeKb)} KB na primeira tela, o que deixa a abertura lenta no celular.`,
        "Compressão de imagens e remoção de scripts desnecessários."
      )
    );
  }

  // --- Mobile ---
  const hasViewport = /<meta[^>]+name=["']viewport["'][^>]*content=["'][^"']*width\s*=\s*device-width/i.test(html);
  if (!hasViewport) {
    issues.push(
      issue(
        "no_viewport",
        "critical",
        "Seu site não se ajusta à tela do celular",
        "No telefone o texto fica minúsculo e o visitante precisa dar zoom para ler. Mais de 70% dos acessos são pelo celular.",
        "Layout responsivo, feito primeiro para o celular."
      )
    );
  }

  // --- Aparecer no Google ---
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch?.[1]?.trim() || "";
  if (!title) {
    issues.push(
      issue(
        "no_title",
        "warning",
        "O Google não sabe o nome da sua empresa",
        "A página não tem título. Na busca, ela aparece sem nome — praticamente ninguém clica.",
        "Título e estrutura de página otimizados para busca local."
      )
    );
  }

  const description = /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1]?.trim() || "";
  if (!description) {
    issues.push(
      issue(
        "no_description",
        "warning",
        "Falta a descrição que aparece no Google",
        "Sem a descrição, o Google inventa um texto qualquer (ou corta o menu do site) no resultado da busca.",
        "Descrição persuasiva por página, focada na busca do cliente."
      )
    );
  }

  if (!/<meta[^>]+property=["']og:image["']/i.test(html)) {
    issues.push(
      issue(
        "no_og_image",
        "info",
        "O link do site aparece sem imagem no WhatsApp",
        "Quando alguém compartilha seu site, aparece só um link sem foto. Perde credibilidade e cliques.",
        "Imagem de compartilhamento (Open Graph) para WhatsApp e redes."
      )
    );
  }

  // --- Conversão ---
  const hasWhatsapp = /(wa\.me\/|api\.whatsapp\.com|whatsapp\.com\/send|href=["'][^"']*whatsapp)/i.test(lower);
  if (!hasWhatsapp) {
    issues.push(
      issue(
        "no_whatsapp_cta",
        "warning",
        "Não existe botão de WhatsApp no site",
        "O cliente decide na hora. Sem um botão direto, ele precisa procurar o telefone — e desiste no caminho.",
        "Botão de WhatsApp fixo com mensagem pronta."
      )
    );
  }

  const hasContactPath = /href=["']tel:|<form|wa\.me|api\.whatsapp\.com|whatsapp/i.test(lower);
  if (!hasContactPath) {
    issues.push(
      issue(
        "no_contact_cta",
        "warning",
        "Não há caminho claro para falar com você",
        "Quem chega no site não encontra formulário nem telefone clicável. O contato morre ali.",
        "Formulário de orçamento rápido + botões de contato."
      )
    );
  }

  // --- Abandono / conteúdo ---
  const copyrightYear = maxCopyrightYear(html);
  if (copyrightYear !== null && copyrightYear < currentYear - 1) {
    issues.push(
      issue(
        "outdated_copyright",
        "warning",
        `Seu site está parado desde ${copyrightYear}`,
        `O rodapé ainda diz ${copyrightYear}. Para o cliente, parece empresa que fechou.`,
        "Site novo, atualizado e com conteúdo recente."
      )
    );
  }

  if (/lorem ipsum/i.test(html)) {
    issues.push(
      issue(
        "placeholder_content",
        "critical",
        "O site tem texto de exemplo (\u201clorem ipsum\u201d) no ar",
        "Isso passa a impressão de site inacabado ou abandonado — o visitante não confia.",
        "Copywriting real, escrito para vender o seu serviço."
      )
    );
  }

  if (!/<h1[^>]*>/i.test(html)) {
    issues.push(
      issue(
        "no_h1",
        "info",
        "A página não tem um título principal",
        "O Google não entende qual é o assunto principal da página e te mostra menos nas buscas.",
        "Estrutura de títulos (SEO on-page) alinhada à busca."
      )
    );
  }

  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  if (imgs.length >= 3) {
    const withAlt = imgs.filter((tag) => /\balt=["'][^"']+["']/i.test(tag)).length;
    if (withAlt / imgs.length < 0.5) {
      issues.push(
        issue(
          "missing_image_alt",
          "info",
          "As imagens não têm descrição para o Google",
          "Fotos sem descrição não aparecem na busca de imagens e pioram o posicionamento.",
          "Imagens tratadas e descritas para busca."
        )
      );
    }
  }

  const generatorMeta = /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] || "";
  if (/wordpress\s*([45])\./i.test(generatorMeta)) {
    issues.push(
      issue(
        "old_platform",
        "warning",
        "A plataforma do site está desatualizada",
        "Site em versão antiga de plataforma é mais lento, mais vulnerável e limita o que dá para melhorar.",
        "Migração para uma base moderna e rápida."
      )
    );
  }

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const penalty = issues.reduce((sum, item) => sum + SEVERITY_WEIGHT[item.severity], 0);
  const healthScore = Math.max(0, Math.min(100, 100 - penalty));
  const painScore = 100 - healthScore;

  const headline = buildHeadline(issues, input.responseTimeMs, copyrightYear, input.currentYear ?? new Date().getFullYear());
  const bullets = issues
    .filter((item) => item.severity !== "info")
    .slice(0, 3)
    .map((item) => item.title);

  return { issues, tech, healthScore, painScore, headline, bullets };
}

function buildHeadline(
  issues: SiteAuditIssue[],
  responseTimeMs: number,
  copyrightYear: number | null,
  currentYear: number
): string {
  const has = (code: SiteAuditIssueCode) => issues.some((item) => item.code === code);

  if (has("unreachable")) return "Seu site está fora do ar agora";
  if (has("slow_response")) return `Seu site demora ${formatSeconds(responseTimeMs)}s para abrir no celular`;
  if (has("no_viewport")) return "Seu site não se abre direito no celular";
  if (has("no_https")) return "Seu site aparece como \u201cNão seguro\u201d para o cliente";
  if (has("placeholder_content")) return "Seu site está no ar com texto de exemplo";
  if (has("outdated_copyright") && copyrightYear) return `Seu site está parado desde ${copyrightYear}`;
  if (has("no_whatsapp_cta")) return "Seu site não tem botão de WhatsApp para o cliente chamar";
  if (has("no_description")) return "Você some da busca do Google por falta de descrição";
  if (has("no_contact_cta")) return "Quem entra no seu site não encontra como falar com você";
  if (issues.length > 0) return `Encontrei ${issues.length} pontos para melhorar no seu site`;
  return "Seu site está tecnicamente saudável";
}

/** Monta o resultado final a partir da análise pura + metadados do fetch. */
function buildAudit(
  url: string,
  analysis: AnalyzeSiteResult,
  meta: { reachable: boolean; httpStatus?: number; https: boolean; responseTimeMs: number; sizeKb: number }
): SiteAudit {
  return {
    url,
    auditedAt: new Date().toISOString(),
    reachable: meta.reachable,
    httpStatus: meta.httpStatus,
    https: meta.https,
    responseTimeMs: Math.round(meta.responseTimeMs),
    sizeKb: Math.round(meta.sizeKb),
    tech: analysis.tech,
    issues: analysis.issues,
    healthScore: analysis.healthScore,
    painScore: analysis.painScore,
    headline: analysis.headline,
    bullets: analysis.bullets,
  };
}

/** Busca o site e roda a auditoria. Nunca lança: site fora do ar vira `reachable: false`. */
export async function auditWebsite(rawUrl: string, opts: { currentYear?: number } = {}): Promise<SiteAudit> {
  const url = normalizeSiteUrl(rawUrl);
  if (!url) {
    throw new Error("URL inválida: informe o endereço do site (ex: 'https://empresa.com.br').");
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": AUDIT_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(AUDIT_TIMEOUT_MS),
    });
    const responseTimeMs = Date.now() - startedAt;
    const html = await res.text();
    const sizeKb = Buffer.byteLength(html, "utf8") / 1024;
    const finalUrl = res.url || url;
    const https = finalUrl.startsWith("https://");

    const analysis = analyzeSiteHtml({
      url: finalUrl,
      html,
      https,
      httpStatus: res.status,
      responseTimeMs,
      sizeKb,
      currentYear: opts.currentYear,
    });

    if (!res.ok) {
      // 401/403/429 não significam site quebrado: são proteções anti-bot
      // (Cloudflare, iFood, marketplaces). Nunca acusar o cliente por isso.
      const blocked = [401, 403, 429].includes(res.status);
      if (blocked) {
        // O HTML recebido é a página de bloqueio, não o site: não auditar o conteúdo.
        return buildAudit(
          url,
          {
            issues: [
              issue(
                "audit_blocked",
                "info",
                "O site bloqueia verificação automática",
                "A página tem proteção contra robôs, então a análise técnica ficou parcial. Vale uma olhada manual antes de abordar.",
                "Auditoria feita à mão, com acesso ao site."
              ),
            ],
            tech: [],
            healthScore: 50,
            painScore: 15,
            headline: "O site tem proteção contra robôs (análise parcial)",
            bullets: ["Análise manual recomendada antes de usar o defeito como gancho."],
          },
          { reachable: true, httpStatus: res.status, https, responseTimeMs, sizeKb }
        );
      }

      analysis.issues.unshift(
        issue(
          "unreachable",
          "critical",
          `Seu site responde com erro ${res.status}`,
          "A página não abre corretamente. Para quem chega pelo Google, parece que a empresa saiu do ar.",
          "Site novo, no ar e monitorado 24/7."
        )
      );
      analysis.healthScore = 0;
      analysis.painScore = 100;
      analysis.headline = `Seu site está apresentando erro ${res.status} para quem acessa`;
      analysis.bullets = analysis.issues.slice(0, 3).map((item) => item.title);
    }

    return buildAudit(url, analysis, {
      reachable: res.ok,
      httpStatus: res.status,
      https,
      responseTimeMs,
      sizeKb,
    });
  } catch (err: any) {
    const message = String(err?.message || "");
    const responseTimeMs = Date.now() - startedAt;
    const certProblem = /cert|ssl|tls|self.signed|handshake/i.test(message);

    if (certProblem) {
      const issues = [
        issue(
          "https_invalid",
          "critical",
          "O certificado de segurança do site está inválido",
          "O navegador exibe um alerta vermelho de risco antes de abrir o site. A maioria dos visitantes desiste nesse ponto.",
          "Certificado SSL válido e renovação automática."
        ),
        issue(
          "no_https",
          "critical",
          "Seu site abre sem o cadeado de segurança",
          "Sem certificado válido, o Chrome marca o site como \u201cNão seguro\u201d.",
          "Certificado SSL + site publicado em HTTPS."
        ),
      ];
      const analysis: AnalyzeSiteResult = {
        issues,
        tech: [],
        healthScore: 0,
        painScore: 100,
        headline: "O navegador avisa que seu site não é seguro",
        bullets: issues.slice(0, 3).map((item) => item.title),
      };
      return buildAudit(url, analysis, { reachable: false, https: false, responseTimeMs, sizeKb: 0 });
    }

    const issues = [
      issue(
        "unreachable",
        "critical",
        "Seu site está fora do ar",
        "O domínio não respondeu. Para quem procura sua empresa no Google, a impressão é de empresa fechada.",
        "Site novo, no ar e monitorado 24/7."
      ),
    ];
    const analysis: AnalyzeSiteResult = {
      issues,
      tech: [],
      healthScore: 0,
      painScore: 100,
      headline: "Seu site está fora do ar agora",
      bullets: ["Site fora do ar", "Cliente não encontra a empresa"],
    };
    return buildAudit(url, analysis, { reachable: false, https: false, responseTimeMs, sizeKb: 0 });
  }
}

/** Código do gancho comercial a partir da auditoria (usado nas métricas). */
export function primaryAuditHook(audit: SiteAudit | undefined): string {
  if (!audit) return "sem_auditoria";
  return audit.issues[0]?.code || "site_saudavel";
}

/**
 * Audita e persiste no lead. Aceita o lead completo (usa `websiteUrl`) ou um
 * `leadId` já resolvido pelo chamador.
 */
export async function auditLeadSite(
  lead: StoredLead,
  opts: { currentYear?: number } = {}
): Promise<{ audit: SiteAudit; leadId: string }> {
  const presence = effectiveWebsiteStatus(lead);
  if (presence !== "has_website" || !lead.websiteUrl) {
    const reason =
      presence === "marketplace_only"
        ? "só tem perfil em marketplace — não há site próprio para auditar"
        : presence === "social_only"
          ? "só tem rede social — não há site próprio para auditar"
          : "não tem site cadastrado";
    throw new Error(`O lead "${lead.name}" ${reason} (presença digital: ${presence}).`);
  }
  const audit = await auditWebsite(lead.websiteUrl, opts);
  updateLeadSiteAudit(lead.id, audit);
  return { audit, leadId: lead.id };
}
