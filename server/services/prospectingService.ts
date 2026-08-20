import { GoogleGenAI, Type } from "@google/genai";
import { StoredLead } from "../store/types";
import { getGeminiModel } from "../config";

/* ------------------------------------------------------------------ */
/*  Shared, real business search + AI analysis used by the queue,      */
/*  the autopilot and the MCP tools. Unifies logic that was spread     */
/*  across server.ts / queueManager.ts.                                */
/* ------------------------------------------------------------------ */

export interface SearchInput {
  location: string;
  state?: string;
  category?: string;
  query?: string;
  filterNoWebsiteOnly?: boolean;
}

export interface SearchResult {
  source: "gemini";
  businesses: any[];
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
  websiteStatus?: "none" | "social_only" | "has_website";
  userNotes?: string;
  phone?: string;
  rating?: number;
  reviewsCount?: number;
}

export async function analyzeLead(input: AnalyzeInput): Promise<any> {
  const ai = getGenAI();
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY não configurada. Configure a chave no .env para gerar análises reais."
    );
  }

  const { businessName, category, city, address, websiteStatus, userNotes, phone, rating, reviewsCount } = input;
  if (typeof businessName !== "string" || !businessName.trim()) {
    throw new Error("Nome da empresa é obrigatório para gerar a análise.");
  }
  if (typeof category !== "string" || !category.trim()) {
    throw new Error("Categoria é obrigatória para gerar a análise.");
  }
  if (typeof city !== "string" || !city.trim()) {
    throw new Error("Cidade é obrigatória para gerar a análise.");
  }

  const promptText = `
Você é um especialista em diagnóstico de marketing e vendas B2B.
Analise a seguinte empresa e gere um plano de venda de Landing Page:
- Empresa: ${businessName}
- Categoria: ${category}
- Cidade: ${city}
- Endereço: ${address?.trim() || "não informado"}
- Telefone: ${phone?.trim() || "não informado"}
- Nota Google: ${rating ?? "não informada"}★ (${reviewsCount ?? "não informadas"} avaliações)
- Presença digital: ${websiteStatus === "none" ? "sem site" : websiteStatus === "social_only" ? "somente redes sociais" : websiteStatus === "has_website" ? "com site" : "não informada"}
${userNotes?.trim() ? `- Observações do vendedor: ${userNotes.trim()}` : ""}

Retorne estritamente JSON com as chaves:
- businessName: string
- opportunityScore: número 0-100
- revenuePotential: string (ex: "R$ 2.200 - R$ 4.000")
- urgencyLevel: "alta" | "media" | "baixa"
- missingFeatures: array de strings (ex: "Botão direto para WhatsApp de Agendamento", "Formulário de Orçamento Rápido", "Tabela / Catálogo de Serviços", "Prova Social com Avaliações do Google")
- whyTheyNeedLandingPage: justificativa persuasiva detalhando o dinheiro/clientes que estão deixando na mesa
- competitorAdvantage: como concorrentes com site estão capturando clientes que buscam no Google
- customPitchWhatsApp: mensagem amigável, direta e persuasiva para o WhatsApp do proprietário
- customPitchEmail: e-mail profissional com assunto e proposta de valor
- customPitchColdCall: roteiro resumido de ligação de 30s contornando a objeção "já tenho Instagram"
- landingPageConcept: objeto com heroHeadline, heroSubheadline, callToAction, recommendedSections (array), suggestedColorPalette, keySellingPoints (array)
`;

  const response = await ai.models.generateContent({
    model: getGeminiModel(),
    contents: promptText,
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error("A IA não retornou um diagnóstico válido.");
  }
  return JSON.parse(text);
}

/* ------------------------------------------------------------------ */
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
    if (!["none", "social_only", "has_website"].includes(lead.websiteStatus as string)) {
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

export async function searchBusinesses(input: SearchInput): Promise<SearchResult> {
  const { location, state, category, query = "", filterNoWebsiteOnly } = input;
  if (typeof location !== "string" || !location.trim()) throw new Error("Cidade é obrigatória para buscar empresas reais.");
  if (typeof state !== "string" || !/^[A-Za-z]{2}$/.test(state.trim())) throw new Error("UF inválida para buscar empresas reais.");
  if (typeof category !== "string" || !category.trim()) throw new Error("Categoria é obrigatória para buscar empresas reais.");
  if (typeof filterNoWebsiteOnly !== "boolean") throw new Error("filterNoWebsiteOnly deve ser booleano.");

  const ai = getGenAI();
  if (!ai) {
    throw new Error(
      "GEMINI_API_KEY não configurada. Configure a chave no .env para buscar empresas reais."
    );
  }

  try {
    const promptText = `
Você é um assistente especialista em prospecção de vendas B2B e pesquisa de negócios locais.
Pesquise empresas e estabelecimentos comerciais reais na região/cidade de: "${location}" (${state}).
${category && category !== "Todas as Categorias" ? `Categoria específica de negócio: "${category}".` : ""}
${query ? `Palavra-chave/termo adicional: "${query}".` : ""}

Sua missão é identificar até 8 empresas reais nessa localização. Para cada empresa, verifique a presença digital e identifique se ela NÃO POSSUI LANDING PAGE ou SITE OFICIAL PRÓPRIO (ou possui apenas rede social como Instagram/Facebook).

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
- websiteStatus: "none" (sem site nem landing page) | "social_only" (apenas Instagram/Facebook) | "has_website" (tem site)
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
    if (!responseText) throw new Error("A busca real não retornou conteúdo.");
    const parsed = JSON.parse(responseText);
    let businesses = validateBusinessResults(parsed.businesses);
    if (filterNoWebsiteOnly) {
      businesses = businesses.filter(
        (b: any) => b.websiteStatus === "none" || b.websiteStatus === "social_only"
      );
    }
    return { source: "gemini", businesses };
  } catch (err: any) {
    console.warn("Busca real falhou (cota/rede/API):", err?.message || err);
    // NÃO há fallback: propaga o erro para a camada superior retorná-lo ao usuário.
    throw new Error(
      `Falha ao buscar empresas reais (${err?.message || "erro desconhecido"}). Sem dados de demonstração — verifique a chave GEMINI_API_KEY, cota e conexão.`
    );
  }
}