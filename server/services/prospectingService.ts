import { GoogleGenAI, Type } from "@google/genai";
import { StoredLead, SiteAudit } from "../store/types";
import { getGeminiModel, getSerpApiConfig } from "../config";
import { searchSerpApiMaps, SerpApiQuotaError, listSerpApiKeys, getLastSerpApiRaw, wasLastSearchCached } from "./serpApi";
import { getLeads, getCities, getCityByCode, getBusinessCategories, estimateTicket, type MarketTier } from "../store/db";
import { normalizePhone, normalizeText } from "./leadIdentity";
import { qaPitch } from "./pitchQaService";
import { computeLeadScore } from "./leadQuality";
import { WHATSAPP_STYLE_RULES } from "./messageStyle";

/* ------------------------------------------------------------------ */
/*  Shared, real business search + AI analysis used by the queue,      */
/*  the autopilot and the MCP tools. Unifies logic that was spread     */
/*  across server.ts / queueManager.ts.                                */
/* ------------------------------------------------------------------ */

export type ProspectingProvider = "serpapi" | "gemini";

export interface SearchInput {
  location: string;
  state?: string;
  category?: string;
  query?: string;
  filterNoWebsiteOnly?: boolean;
  provider?: ProspectingProvider;
}

export interface SearchResult {
  source: ProspectingProvider;
  businesses: any[];
  serpApiRaw?: any;
  serpApiMeta?: any;
  cached?: boolean;
}

function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

/* ------------------------------------------------------------------ */
/*  Análise de lead por IA (dados reais) — lança erro se não for       */
/*  possível gerar o diagnóstico. NÃO há fallback/dados mockados.      */
/* ------------------------------------------------------------------ */
export interface AnalyzeInput {
  businessName: string;
  category?: string;
  city?: string;
  address?: string;
  websiteStatus?: "none" | "social_only" | "marketplace_only" | "has_website";
  userNotes?: string;
  phone?: string;
  rating?: number;
  reviewsCount?: number;
  /** URL do site encontrado — usada pelo QA para não contradizer a presença real. */
  websiteUrl?: string;
  /** UF do lead — usada para resolver o tier da cidade na base IBGE. */
  state?: string;
  /** Ticket sugerido pré-calculado (R$); se ausente, calcula de categoria × tier. */
  suggestedTicket?: number;
  /** Tier de mercado da cidade (A/B/C/D). */
  marketTier?: string;
  /** Auditoria técnica real do site — quando presente, o pitch cita os defeitos. */
  siteAudit?: SiteAudit;
}

/**
 * Saturação de mercado: nº de concorrentes da última busca na cidade do lead.
 * Usa o raw da SerpAPI (local_results) — 0 se não houver contexto.
 */
function getCompetitorCount(city?: string): number | undefined {
  if (!city) return undefined;
  try {
    const { raw } = getLastSerpApiRaw();
    const places: any[] = Array.isArray(raw?.local_results) ? raw.local_results : [];
    if (places.length === 0) return undefined;
    // conta quantos resultados mencionam a mesma cidade no endereço
    const target = city.trim().toLowerCase();
    const sameCity = places.filter((p) =>
      String(p.address || p.formatted_address || "").toLowerCase().includes(target)
    );
    return sameCity.length > 0 ? sameCity.length : places.length;
  } catch {
    return undefined;
  }
}

export async function analyzeLead(input: AnalyzeInput): Promise<any> {
  const ai = getGenAI();
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY não configurada. Configure a chave no .env para gerar análises reais."
    );
  }

  const { businessName, category, city, address, websiteStatus, userNotes, phone, rating, reviewsCount } = input;

  // Resolve tier da cidade + ticket sugerido (dados reais IBGE × categorias)
  let marketTier: string | undefined = input.marketTier;
  let suggestedTicket: number | undefined = input.suggestedTicket;
  try {
    if (city && input.state && (!marketTier || !suggestedTicket)) {
      const resolved = getCityByIbgeByName(city, input.state);
      if (resolved) {
        marketTier = marketTier || resolved.marketTier;
        if (!suggestedTicket && category) {
          const cat = getBusinessCategories({ activeOnly: true }).find(
            (c) => c.name.toLowerCase() === category.trim().toLowerCase()
          );
          if (cat) suggestedTicket = estimateTicket(cat.baseTicket, resolved.marketTier as MarketTier);
        }
      }
    }
  } catch {
    /* sem base IBGE → segue sem ticket */
  }
  const ticketHint =
    suggestedTicket
      ? `- Ticket de investimento sugerido para esta negociação: R$ ${suggestedTicket.toLocaleString("pt-BR")} (cidade de mercado tier ${marketTier} — use este valor como âncora nos pitches; pode apresentar como faixa ±15%)\n`
      : "";

  // Saturação: ajusta o ângulo do pitch conforme a concorrência local
  const competitors = getCompetitorCount(city);
  const saturationHint =
    typeof competitors === "number" && competitors > 0
      ? competitors >= 10
        ? `- Mercado SATURADO: ~${competitors} concorrentes na mesma cidade. Ângulo do pitch: diferenciação ("seja o ÚNICO ${category || "negócio"} de ${city} com site profissional que aparece no Google")\n`
        : competitors >= 4
          ? `- Concorrência moderada: ~${competitors} concorrentes na cidade. Ângulo: destacar-se nos resultados locais antes deles\n`
          : `- Mercado com poucos concorrentes (~${competitors}). Ângulo: oportunidade de ser o primeiro a dominar as buscas locais\n`
      : "";

  if (typeof businessName !== "string" || !businessName.trim()) {
    throw new Error("Nome da empresa é obrigatório para gerar a análise.");
  }
  if (typeof category !== "string" || !category.trim()) {
    throw new Error("Categoria é obrigatória para gerar a análise.");
  }
  if (typeof city !== "string" || !city.trim()) {
    throw new Error("Cidade é obrigatória para gerar a análise.");
  }

  // Defeitos reais medidos no site: a abordagem deixa de ser genérica.
  const audit = input.siteAudit;
  const auditHint = audit
    ? [
        "- DEFEITOS REAIS ENCONTRADOS NO SITE (auditoria técnica):",
        `  • Gancho principal: ${audit.headline}`,
        ...audit.issues.slice(0, 5).map(
          (item) => `  • [${item.severity}] ${item.title} — ${item.detail}`
        ),
        `- Tempo de carregamento medido: ${(audit.responseTimeMs / 1000).toFixed(1)}s | Peso: ${Math.round(audit.sizeKb)} KB | HTTPS: ${audit.https ? "sim" : "não"}`,
        "- REGRA OBRIGATÓRIA: o customPitchWhatsApp deve citar 2 desses defeitos específicos, com números quando existirem. Nada de \"quer um site novo?\".",
        "",
      ].join("\n")
    : "";

  const promptText = `
Você é um especialista em diagnóstico de marketing e vendas B2B.
${WHATSAPP_STYLE_RULES}

Analise a seguinte empresa e gere um plano de venda de Landing Page:
- Empresa: ${businessName}
- Categoria: ${category}
- Cidade: ${city}
- Endereço: ${address?.trim() || "não informado"}
- Telefone: ${phone?.trim() || "não informado"}
- Nota Google: ${rating ?? "não informada"}★ (${reviewsCount ?? "não informadas"} avaliações)
- Presença digital: ${websiteStatus === "none" ? "sem site" : websiteStatus === "social_only" ? "somente redes sociais" : websiteStatus === "marketplace_only" ? "somente em marketplace (iFood/Mercado Livre etc.), sem site próprio" : websiteStatus === "has_website" ? "com site" : "não informada"}
${ticketHint}${saturationHint}${auditHint}${userNotes?.trim() ? `- Observações do vendedor: ${userNotes.trim()}` : ""}

Retorne estritamente JSON com as chaves:
- businessName: string
- opportunityScore: número 0-100
- revenuePotential: string (ex: "R$ 2.200 - R$ 4.000")
- urgencyLevel: "alta" | "media" | "baixa"
- missingFeatures: array de strings (ex: "Botão direto para WhatsApp de Agendamento", "Formulário de Orçamento Rápido", "Tabela / Catálogo de Serviços", "Prova Social com Avaliações do Google")
- whyTheyNeedLandingPage: justificativa persuasiva detalhando o dinheiro/clientes que estão deixando na mesa
- competitorAdvantage: como concorrentes com site estão capturando clientes que buscam no Google
- customPitchWhatsApp: mensagem amigável, direta e persuasiva para o WhatsApp do proprietário. FORMATO OBRIGATÓRIO: 2 a 5 linhas curtas (quebra de linha de verdade), uma ideia por linha, sem travessão (—) nem meia-risca (–), com negrito *assim* em no máximo 2 trechos e no máximo 3 emojis, dizendo que a PRÉVIA É GRÁTIS e citando os pacotes com o que cada um inclui
- customPitchEmail: e-mail profissional com assunto e proposta de valor
- customPitchColdCall: roteiro resumido de ligação de 30s contornando a objeção "já tenho Instagram"
- landingPageConcept: objeto com heroHeadline, heroSubheadline, callToAction, recommendedSections (array), suggestedColorPalette, keySellingPoints (array)
`;

  const generate = async (extraHint = ""): Promise<any> => {
    // Modelo principal + reserva: "gemini-flash-latest" devolve 503 com frequência
    // (UNAVAILABLE / high demand) e sem reserva a análise morre inteira.
    const primary = getGeminiModel();
    const fallbacks = (process.env.GEMINI_PROFILE_FALLBACK_MODEL || process.env.GEMINI_VISION_FALLBACK_MODEL || "gemini-3.1-flash-lite")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const models = Array.from(new Set([primary, ...fallbacks]));

    let lastError: any = null;
    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: `${promptText}${extraHint}`,
          config: {
            responseMimeType: "application/json",
            abortSignal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS || 60000)),
          },
        });
        const text = response.text?.trim();
        if (!text) throw new Error("A IA não retornou um diagnóstico válido.");
        return JSON.parse(text);
      } catch (err: any) {
        lastError = err;
        const message = String(err?.message || err || "");
        if (/aborted|timeout|timed out|UNAVAILABLE|high demand|overloaded|503|500|502|429|quota/i.test(message)) {
          console.warn(`[analise] Gemini ${model} indisponível, tentando próximo modelo...`);
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Falha ao analisar o lead com a IA.");
  };

  const qaContext = {
    businessName,
    websiteStatus,
    websiteUrl: input.websiteUrl,
    rating,
    reviewsCount,
    suggestedTicket,
    siteAudit: audit,
  };

  let analysis = await generate();
  let qa = qaPitch(analysis?.customPitchWhatsApp || "", qaContext);
  if (!qa.ok && audit) {
    // Uma segunda tentativa com as correções explícitas costuma bastar.
    try {
      analysis = await generate(qa.retryHint);
      qa = qaPitch(analysis?.customPitchWhatsApp || "", qaContext);
    } catch {
      /* mantém o primeiro rascunho e expõe os avisos */
    }
  }
  analysis.qa = { ok: qa.ok, issues: qa.issues };
  if (!qa.ok) analysis.qaWarnings = qa.issues;
  return analysis;
}/* ------------------------------------------------------------------ */
/*  Real search (Gemini Search Grounding), without local/demo fallback. */
/* ------------------------------------------------------------------ */
export function validateBusinessResults(value: unknown): any[] {
  if (!Array.isArray(value)) {
    throw new Error("A busca real não retornou um array de empresas.");
  }

  return value.map((business, index) => {
    if (!business || typeof business !== "object") {
      throw new Error(`A busca retornou o lead ${index + 1} em formato inválido.`);
    }

    const lead = business as Record<string, unknown>;
    const requiredFields = ["id", "name", "category", "address", "city", "state", "websiteStatus"];
    for (const field of requiredFields) {
      if (typeof lead[field] !== "string" || !lead[field].trim()) {
        throw new Error(`A busca retornou o lead ${index + 1} com o campo obrigatório "${field}" ausente.`);
      }
    }

    if (!/^[A-Za-z]{2}$/.test(lead.state as string)) {
      throw new Error(`A busca retornou uma UF inválida para o lead ${lead.name}.`);
    }
    if (!["none", "social_only", "marketplace_only", "has_website"].includes(lead.websiteStatus as string)) {
      throw new Error(`A busca retornou um websiteStatus inválido para o lead ${lead.name}.`);
    }

    const numericFields = ["rating", "reviewsCount", "lat", "lng", "opportunityScore"];
    for (const field of numericFields) {
      if (lead[field] !== undefined && (typeof lead[field] !== "number" || !Number.isFinite(lead[field] as number))) {
        throw new Error(`A busca retornou o campo numérico "${field}" inválido para o lead ${lead.name}.`);
      }
    }
    if (lead.reviewsCount !== undefined && (!Number.isInteger(lead.reviewsCount) || (lead.reviewsCount as number) < 0)) {
      throw new Error(`A busca retornou reviewsCount inválido para o lead ${lead.name}.`);
    }
    if (lead.opportunityScore !== undefined && ((lead.opportunityScore as number) < 0 || (lead.opportunityScore as number) > 100)) {
      throw new Error(`A busca retornou opportunityScore fora do intervalo para o lead ${lead.name}.`);
    }
    if (lead.opportunityLevel !== undefined && !["high", "medium", "low"].includes(lead.opportunityLevel as string)) {
      throw new Error(`A busca retornou opportunityLevel inválido para o lead ${lead.name}.`);
    }
    if (lead.keyInsights !== undefined && (!Array.isArray(lead.keyInsights) || !lead.keyInsights.every((item) => typeof item === "string"))) {
      throw new Error(`A busca retornou keyInsights inválido para o lead ${lead.name}.`);
    }

    return business;
  });
}

async function searchViaGemini(input: SearchInput): Promise<SearchResult> {
  const { location, state, category, query = "", filterNoWebsiteOnly } = input;
  const ai = getGenAI();
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY não configurada. Configure a chave no .env para buscar empresas reais com Gemini."
    );
  }

  try {
    const promptText = `
Você é um assistente especialista em prospecção de vendas B2B e pesquisa de negócios locais.
Pesquise empresas e estabelecimentos comerciais reais na região/cidade de: "${location}" (${state}).
${category && category !== "Todas as Categorias" ? `Categoria específica de negócio: "${category}".` : ""}
${query ? `Palavra-chave/termo adicional: "${query}".` : ""}

Sua missão é identificar até 8 empresas reais nessa localização. Para cada empresa, verifique a presença digital e identifique se ela NÃO POSSUI LANDING PAGE ou SITE OFICIAL PRÓPRIO (ou possui apenas rede social como Instagram/Facebook).

IMPORTANTE: retorne APENAS empresas reais encontradas via busca. NUNCA invente empresas. Se não encontrar empresas reais, retorne array vazio.

Forneça a resposta estritamente em formato JSON válido contendo um array "businesses".
Cada item do array deve ter as seguintes propriedades:
- id: string única (ex: "biz-1")
- name: nome da empresa
- category: categoria comercial
- address: endereço formatado ou rua/bairro aproximado
- neighborhood: bairro (se disponível)
- city: cidade
- state: estado (ex: "SP", "RJ", "MG")
- phone: telefone fixo ou WhatsApp formatado
- rating: nota do Google (número entre 3.8 e 5.0)
- reviewsCount: quantidade de avaliações (número inteiro)
- websiteStatus: "none" (sem site nem landing page) | "social_only" (apenas Instagram/Facebook) | "marketplace_only" (só perfil em iFood/Mercado Livre/Shopee, sem site próprio) | "has_website" (tem site próprio)
- googlePlaceId: identificador estável do Google Places, se a fonte real informar
- websiteUrl: URL do site se a fonte real informar (caso contrário, omita)
- instagramHandle: @do_instagram somente se a fonte real informar (não invente)
- lat: latitude informada pela fonte real (número float)
- lng: longitude informada pela fonte real (número float)
- opportunityScore: nota de 0 a 100 indicando a atratividade como lead para venda de landing page
- opportunityLevel: "high" (score > 80) | "medium" (60-80) | "low"
- estimatedValue: estimativa de valor do projeto em Reais (ex: "R$ 1.800 - R$ 3.200")
- keyInsights: array com 3 ou 4 observações estratégicas sobre por que essa empresa precisa de uma Landing Page rápida.
    `;

    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: promptText,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        abortSignal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS || 60000)),
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            businesses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  address: { type: Type.STRING },
                  neighborhood: { type: Type.STRING },
                  city: { type: Type.STRING },
                  state: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  rating: { type: Type.NUMBER },
                  reviewsCount: { type: Type.INTEGER },
                  websiteStatus: { type: Type.STRING },
                  googlePlaceId: { type: Type.STRING },
                  websiteUrl: { type: Type.STRING },
                  instagramHandle: { type: Type.STRING },
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER },
                  opportunityScore: { type: Type.NUMBER },
                  opportunityLevel: { type: Type.STRING },
                  estimatedValue: { type: Type.STRING },
                  keyInsights: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ["id", "name", "category", "address", "city", "state", "websiteStatus", "opportunityScore", "opportunityLevel"],
              },
            },
          },
          required: ["businesses"],
        },
      },
    });

    const responseText = response.text?.trim();
    if (!responseText) throw new Error("A busca real via Gemini não retornou conteúdo. Tente novamente ou troque para SerpAPI.");
    const parsed = JSON.parse(responseText);
    let businesses = validateBusinessResults(parsed.businesses);
    if (filterNoWebsiteOnly) {
      businesses = businesses.filter(
        (b: any) => b.websiteStatus === "none" || b.websiteStatus === "social_only" || b.websiteStatus === "marketplace_only"
      );
    }
    if (businesses.length === 0) {
      throw new Error("Gemini não retornou empresas reais para os filtros informados. Tente ampliar a região/categoria ou use SerpAPI para resultados reais do Google Maps.");
    }
    const withTickets = attachSuggestedTickets(businesses, input.category);
    const marked = markAlreadySaved(withTickets);
    return { source: "gemini", businesses: marked };
  } catch (err: any) {
    if (err instanceof SerpApiQuotaError) throw err;
    console.warn("Busca Gemini falhou (cota/rede/API):", err?.message || err);
    const isQuota = /429|quota|RESOURCE_EXHAUSTED|exceeded/i.test(err?.message || "");
    if (isQuota) {
      throw new Error(
        `Gemini cota excedida (${err?.message}). Mesmo na 1ª requisição isso ocorre se a chave for inválida (deve começar com AIzaSy), se o modelo ${getGeminiModel()} não tem cota free, ou se o googleSearch grounding está com limite 0. Gere nova chave em https://aistudio.google.com/app/apikey, defina GEMINI_MODEL=gemini-2.0-flash ou troque para SerpAPI.`
      );
    }
    throw new Error(
      `Falha ao buscar empresas reais via Gemini (${err?.message || "erro desconhecido"}). Sem dados inventados — verifique a chave GEMINI_API_KEY, cota e conexão, ou troque para SerpAPI.`
    );
  }
}

/**
 * Score combinado do lead (0-100).
 *
 * Implementação única em `leadQuality.computeLeadScore`: média ponderada de
 * presença digital, avaliações, nota, propensão do nicho, tier da cidade e
 * telefone. Antes daqui somavam-se bônus até bater o teto 100, o que deixava
 * 92% do banco em 90-100 e não ordenava nada.
 */
export function computeCombinedScore(
  b: any,
  opts?: { categoryPropensity?: number; marketTier?: string }
): { score: number; level: "high" | "medium" | "low" } {
  const result = computeLeadScore({
    websiteStatus: b.websiteStatus,
    rating: b.rating,
    reviewsCount: b.reviewsCount,
    phone: b.phone,
    whatsappStatus: b.whatsappStatus,
    categoryPropensity: opts?.categoryPropensity,
    marketTier: opts?.marketTier ?? b.marketTier,
  });
  return { score: result.score, level: result.level };
}

/**
 * Ticket sugerido = ticket base da categoria × multiplicador do tier da cidade.
 * Match de cidade por nome normalizado + UF na base IBGE.
 */
function attachSuggestedTickets(businesses: any[], searchCategory?: string): any[] {
  try {
    const categories = getBusinessCategories({ activeOnly: true });
    const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

    return businesses.map((b: any) => {
      // O nicho BUSCADO é sempre um dos 19 cadastrados; o rótulo do Google
      // ("Escritório da empresa") quase nunca casa — por isso a busca é dupla.
      const niche = (searchCategory || b.searchCategory || "").trim();
      const cat =
        catByName.get(niche.toLowerCase()) ||
        catByName.get((b.category || "").trim().toLowerCase());
      let city;
      try {
        city = getCityByIbgeByName(b.city, b.state);
      } catch {
        city = undefined;
      }
      const detail = computeLeadScore({
        websiteStatus: b.websiteStatus,
        rating: b.rating,
        reviewsCount: b.reviewsCount,
        phone: b.phone,
        whatsappStatus: b.whatsappStatus,
        categoryPropensity: cat?.propensity,
        marketTier: city?.marketTier,
      });
      const base = {
        ...b,
        searchCategory: niche || b.searchCategory,
        opportunityScore: detail.score,
        opportunityLevel: detail.level,
        scoreReasons: detail.reasons,
      };
      if (cat && city) {
        const ticket = estimateTicket(cat.baseTicket, city.marketTier as MarketTier);
        return { ...base, suggestedTicket: ticket, marketTier: city.marketTier };
      }
      return base;
    });
  } catch {
    return businesses;
  }
}

const cityByNameCache = new Map<string, ReturnType<typeof getCityByCode>>();
let allCitiesByUfCache: Map<string, any[]> | null = null;

function getCityByIbgeByName(name: string, uf: string) {
  const key = `${(name || "").trim().toLowerCase()}|${(uf || "").trim().toUpperCase()}`;
  if (!name || !uf || name.trim() === "") return undefined;
  if (cityByNameCache.has(key)) return cityByNameCache.get(key);
  let found: ReturnType<typeof getCityByCode>;
  try {
    // índice em memória por UF (carregado uma vez; ~5.571 linhas no total)
    if (!allCitiesByUfCache) {
      allCitiesByUfCache = new Map();
      for (const c of getCities({ limit: 6000 })) {
        const list = allCitiesByUfCache.get(c.uf) || [];
        list.push(c);
        allCitiesByUfCache.set(c.uf, list);
      }
    }
    const candidates = (allCitiesByUfCache.get(uf.trim().toUpperCase()) || []).filter(
      (c) => c.name.toLowerCase() === name.trim().toLowerCase()
    );
    found = candidates[0];
  } catch {
    found = undefined;
  }
  cityByNameCache.set(key, found);
  return found;
}

function markAlreadySaved(businesses: any[]): any[] {
  try {
    const leads = getLeads();
    const byPlaceId = new Map<string, string>();
    const byPhone = new Map<string, string>();
    const byNameCity = new Map<string, string>();
    for (const l of leads) {
      if (l.googlePlaceId) byPlaceId.set(l.googlePlaceId, l.id);
      if (l.phone) {
        const n = normalizePhone(l.phone);
        if (n) byPhone.set(n, l.id);
      }
      const key = `${normalizeText(l.name)}|${normalizeText(l.city)}`;
      if (key !== "|") byNameCity.set(key, l.id);
    }
    return businesses.map((b: any) => {
      let existingId: string | undefined;
      if (b.googlePlaceId && byPlaceId.has(b.googlePlaceId)) existingId = byPlaceId.get(b.googlePlaceId);
      else if (b.phone) {
        const n = normalizePhone(b.phone);
        if (n && byPhone.has(n)) existingId = byPhone.get(n);
      }
      if (!existingId) {
        const k = `${normalizeText(b.name)}|${normalizeText(b.city)}`;
        if (byNameCity.has(k)) existingId = byNameCity.get(k);
      }
      return existingId ? { ...b, isAlreadySaved: true, existingLeadId: existingId } : { ...b, isAlreadySaved: false };
    });
  } catch {
    return businesses;
  }
}

async function searchViaSerpApi(input: SearchInput): Promise<SearchResult> {
  const businesses = await searchSerpApiMaps({
    location: input.location,
    state: input.state!,
    category: input.category!,
    query: input.query,
    filterNoWebsiteOnly: input.filterNoWebsiteOnly,
  });
  let validated = validateBusinessResults(businesses);
  if (input.filterNoWebsiteOnly) {
    validated = validated.filter((b: any) => b.websiteStatus === "none" || b.websiteStatus === "social_only" || b.websiteStatus === "marketplace_only");
  }
  const withTickets = attachSuggestedTickets(validated, input.category);
  const marked = markAlreadySaved(withTickets);
  const { raw, meta } = getLastSerpApiRaw();
  const cached = wasLastSearchCached();
  if (marked.length === 0) {
    return { source: "serpapi", businesses: [], serpApiRaw: raw, serpApiMeta: meta, cached };
  }
  return { source: "serpapi", businesses: marked, serpApiRaw: raw, serpApiMeta: meta, cached };
}

export async function searchBusinesses(input: SearchInput): Promise<SearchResult> {
  const { location, state, category, query = "", filterNoWebsiteOnly, provider } = input;
  if (typeof location !== "string" || !location.trim()) throw new Error("Cidade é obrigatória para buscar empresas reais.");
  if (typeof state !== "string" || !/^[A-Za-z]{2}$/.test(state.trim())) throw new Error("UF inválida para buscar empresas reais.");
  if (typeof category !== "string" || !category.trim()) throw new Error("Categoria é obrigatória para buscar empresas reais.");
  if (typeof filterNoWebsiteOnly !== "boolean") throw new Error("filterNoWebsiteOnly deve ser booleano.");
  if (provider && !["serpapi", "gemini"].includes(provider)) throw new Error("provider deve ser 'serpapi' ou 'gemini'.");

  let effectiveConfigured: boolean;
  try {
    effectiveConfigured = listSerpApiKeys().length > 0 || getSerpApiConfig().configured;
  } catch {
    effectiveConfigured = getSerpApiConfig().configured;
  }
  const chosen: ProspectingProvider = provider || (effectiveConfigured ? "serpapi" : "gemini");

  if (chosen === "serpapi") {
    if (!effectiveConfigured) {
      throw new Error("Nenhuma chave SerpAPI cadastrada. Adicione uma chave em Gerenciar chaves ou defina SERPAPI_API_KEY no .env, ou selecione Gemini.");
    }
    return await searchViaSerpApi(input);
  }

  return await searchViaGemini(input);
}