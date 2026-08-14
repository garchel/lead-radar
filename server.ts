import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { registerMcpRoutes } from "./server/mcpServer";
import { registerQueueRoutes } from "./server/jobs/queueRoutes";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Register MCP Server & Background Async Queue routes
registerMcpRoutes(app);
registerQueueRoutes(app);

// Initialize Gemini client lazily/safely
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      genAIClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return genAIClient;
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasGoogleMapsKey: Boolean(process.env.GOOGLE_MAPS_PLATFORM_KEY),
  });
});

// Search businesses endpoint using Gemini Search Grounding
app.post("/api/search-businesses", async (req, res) => {
  const { location = "São Paulo", state = "SP", category = "Todas as Categorias", query = "", filterNoWebsiteOnly = true } = req.body;

  try {
    const ai = getGenAI();
    if (!ai) {
      const fallbackList = generateFallbackBusinesses(location, state, category, filterNoWebsiteOnly);
      return res.status(200).json({
        success: true,
        source: "fallback",
        message: "Chave GEMINI_API_KEY não configurada no servidor. Exibindo dados de demonstração da região.",
        businesses: fallbackList,
      });
    }

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
- category: categoria comercial (ex: "Dentista", "Oficina Mecânica", "Clínica de Estética", "Academia", "Padaria")
- address: endereço formatado ou rua/bairro aproximado
- neighborhood: bairro (se disponível)
- city: cidade
- state: estado (ex: "SP", "RJ", "MG")
- phone: telefone fixo ou WhatsApp formatado
- rating: nota do Google (número entre 3.8 e 5.0)
- reviewsCount: quantidade de avaliações (número inteiro)
- websiteStatus: "none" (sem site nem landing page), "social_only" (apenas Instagram/Facebook) ou "has_website" (tem site)
- websiteUrl: URL do site (se tiver, ou null)
- instagramHandle: @do_instagram (se souber ou inventar com base no nome)
- lat: latitude aproximada da cidade/bairro (número float)
- lng: longitude aproximada da cidade/bairro (número float)
- opportunityScore: nota de 0 a 100 indicando a atratividade como lead para venda de landing page
- opportunityLevel: "high" (se score > 80), "medium" (se score 60-80), ou "low"
- estimatedValue: estimativa de valor do projeto em Reais (ex: "R$ 1.800 - R$ 3.200")
- keyInsights: array com 3 ou 4 observações estratégicas sobre por que essa empresa precisa de uma Landing Page rápida.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
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
                  websiteUrl: { type: Type.STRING },
                  instagramHandle: { type: Type.STRING },
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER },
                  opportunityScore: { type: Type.NUMBER },
                  opportunityLevel: { type: Type.STRING },
                  estimatedValue: { type: Type.STRING },
                  keyInsights: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ["id", "name", "category", "address", "city", "websiteStatus", "opportunityScore", "opportunityLevel"],
              },
            },
          },
          required: ["businesses"],
        },
      },
    });

    const jsonText = response.text?.trim() || "{}";
    const parsedData = JSON.parse(jsonText);

    let businesses = parsedData.businesses || [];
    if (filterNoWebsiteOnly) {
      businesses = businesses.filter(
        (b: any) => b.websiteStatus === "none" || b.websiteStatus === "social_only"
      );
    }

    return res.json({
      success: true,
      source: "gemini",
      businesses,
    });
  } catch (error: any) {
    console.warn("Aviso na busca de empresas por IA (cota/rede/API):", error?.message || error);
    // Graceful fallback on API error/quota limit 429
    const fallbackList = generateFallbackBusinesses(location, state, category, filterNoWebsiteOnly);
    return res.json({
      success: true,
      source: "fallback",
      message: "Cota de API excedida ou temporariamente indisponível. Exibindo mapeamento inteligente regional.",
      businesses: fallbackList,
    });
  }
});

// Deep AI Lead Analysis and Pitch Generator
app.post("/api/analyze-lead", async (req, res) => {
  try {
    const {
      businessName,
      category,
      address,
      phone,
      rating,
      reviewsCount,
      websiteStatus,
      userNotes,
    } = req.body;

    const ai = getGenAI();
    if (!ai) {
      return res.status(400).json({
        error: "GEMINI_API_KEY não configurada.",
      });
    }

    const promptText = `
Você é um consultor estrategista sênior de marketing digital e vendas B2B especialista em agências e freelancers de criação de sites/landing pages.

Analise o seguinte prospect (empresa local) que precisa de uma Landing Page:
- Nome da Empresa: ${businessName}
- Categoria/Nicho: ${category}
- Endereço/Região: ${address}
- Telefone: ${phone || "Não informado"}
- Avaliação Google Maps: ${rating || 4.8}★ (${reviewsCount || 45} avaliações)
- Situação do Site: ${websiteStatus === "none" ? "Não possui site nem landing page" : "Possui apenas perfil em rede social"}
${userNotes ? `- Observações adicionais do vendedor: ${userNotes}` : ""}

Crie uma análise estratégica completa e abordagens de vendas altamente personalizadas (em Português do Brasil).
Gere uma resposta em JSON com o seguinte schema exato:
- businessName: nome exato da empresa
- opportunityScore: nota de 0 a 100 de potencial de fechamento
- revenuePotential: faixa sugerida de preço do projeto (ex: "R$ 2.000 - R$ 3.800")
- urgencyLevel: "alta", "média" ou "baixa"
- missingFeatures: lista de 4 a 6 recursos indispensáveis que faltam no negócio (ex: "Botão direto para WhatsApp de Agendamento", "Formulário de Orçamento Rápido", "Tabela / Catálogo de Serviços", "Prova Social com Avaliações do Google")
- whyTheyNeedLandingPage: justificativa persuasiva detalhando o dinheiro/clientes que estão deixando na mesa a cada mês
- competitorAdvantage: como concorrentes diretos com site estão capturando clientes que procuram no Google
- customPitchWhatsApp: mensagem amigável, direta, não-spammy e persuasiva para enviar no WhatsApp do proprietário
- customPitchEmail: e-mail de apresentação profissional com assunto chamativo e proposta de valor
- customPitchColdCall: roteiro resumido de ligação rápida de 30 segundos incluindo como contornar a objeção "já tenho Instagram"
- landingPageConcept: objeto com:
    - heroHeadline: título principal focado em alta conversão para essa empresa
    - heroSubheadline: subtítulo explicativo
    - callToAction: texto do botão de ação principal (ex: "Agendar Consulta via WhatsApp")
    - recommendedSections: lista de seções recomendadas (ex: ["Hero com Vídeo/Foto", "Serviços Principais", "Antes/Depois", "Depoimentos de Clientes", "Localização & Contato"])
    - suggestedColorPalette: descrição de cores recomendadas para o segmento
    - keySellingPoints: 3 diferenciais principais a destacar na página
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            businessName: { type: Type.STRING },
            opportunityScore: { type: Type.NUMBER },
            revenuePotential: { type: Type.STRING },
            urgencyLevel: { type: Type.STRING },
            missingFeatures: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            whyTheyNeedLandingPage: { type: Type.STRING },
            competitorAdvantage: { type: Type.STRING },
            customPitchWhatsApp: { type: Type.STRING },
            customPitchEmail: { type: Type.STRING },
            customPitchColdCall: { type: Type.STRING },
            landingPageConcept: {
              type: Type.OBJECT,
              properties: {
                heroHeadline: { type: Type.STRING },
                heroSubheadline: { type: Type.STRING },
                callToAction: { type: Type.STRING },
                recommendedSections: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                suggestedColorPalette: { type: Type.STRING },
                keySellingPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["heroHeadline", "heroSubheadline", "callToAction", "recommendedSections"],
            },
          },
          required: [
            "businessName",
            "opportunityScore",
            "revenuePotential",
            "urgencyLevel",
            "missingFeatures",
            "whyTheyNeedLandingPage",
            "competitorAdvantage",
            "customPitchWhatsApp",
            "customPitchEmail",
            "customPitchColdCall",
            "landingPageConcept",
          ],
        },
      },
    });

    const jsonText = response.text?.trim() || "{}";
    const analysis = JSON.parse(jsonText);

    return res.json({
      success: true,
      analysis,
    });
  } catch (error: any) {
    console.warn("Aviso na análise por IA (cota/rede/API):", error?.message || error);
    // Return structured fallback analysis so user never sees an error modal
    const fallbackAnalysis = generateFallbackAnalysis(
      req.body.businessName || "Empresa Prospect",
      req.body.category || "Serviços Locais",
      req.body.address || "Centro",
      req.body.phone,
      req.body.rating,
      req.body.reviewsCount
    );

    return res.json({
      success: true,
      source: "fallback",
      message: "Análise gerada via assistente de demonstração devido à cota de API.",
      analysis: fallbackAnalysis,
    });
  }
});

// Helper for generating local regional leads when Gemini API returns 429 quota exhausted or is unavailable
function generateFallbackBusinesses(location: string, state: string, category: string, filterNoWebsiteOnly: boolean) {
  const city = location.split(',')[0].trim() || "São Paulo";
  const uf = state && state !== "ALL" ? state : "SP";
  const cat = category && category !== "Todas as Categorias" ? category : "Estética & Saúde";

  const templates = [
    {
      suffix: "Centro de Excelência",
      neighborhood: "Centro",
      rating: 4.9,
      reviewsCount: 128,
      websiteStatus: "none",
      score: 95,
      phone: "(11) 98765-4321",
      instagram: "@centro.excelencia",
      insights: [
        "Tem nota 4.9 no Google Maps mas nenhum site para agendamentos.",
        "Concorrentes da região já estão anunciando no Google Ads.",
        "Potencial de fechamento imediato com modelo focado em WhatsApp."
      ]
    },
    {
      suffix: "Atendimento Especializado",
      neighborhood: "Jardins",
      rating: 4.8,
      reviewsCount: 84,
      websiteStatus: "social_only",
      score: 91,
      phone: "(11) 97123-8899",
      instagram: "@atendimento.especializado",
      insights: [
        "Depende 100% do Instagram, perdendo pesquisas diretas no Google.",
        "Clientes reclamam da falta de tabela de preços visível online.",
        "Alta propensão para adquirir Landing Page de conversão."
      ]
    },
    {
      suffix: "Soluções e Serviços",
      neighborhood: "Vila Nova",
      rating: 4.7,
      reviewsCount: 62,
      websiteStatus: "none",
      score: 88,
      phone: "(11) 96543-2100",
      instagram: "@solucoes.servicos",
      insights: [
        "Mencionam excelente atendimento mas não possuem catálogo de serviços.",
        "Grande volume de ligações diárias para dúvidas básicas.",
        "Ideal para oferta de Landing Page com FAQ e botão WhatsApp."
      ]
    },
    {
      suffix: "Espaço Integrado",
      neighborhood: "Bela Vista",
      rating: 4.9,
      reviewsCount: 156,
      websiteStatus: "social_only",
      score: 93,
      phone: "(11) 98111-2233",
      instagram: "@espaco.integrado",
      insights: [
        "Mais de 150 avaliações 5 estrelas sem página própria.",
        "Otimização simples de Google Meu Negócio + Landing Page trará retorno imediato.",
        "Sugerir botão direto de agendamento online."
      ]
    }
  ];

  return templates.map((tmpl, idx) => ({
    id: `regional-lead-${idx + 1}-${Date.now()}`,
    name: `${cat.split('/')[0].trim()} ${tmpl.suffix} ${city}`,
    category: cat,
    address: `Rua Principal, ${100 * (idx + 1)} - ${tmpl.neighborhood}`,
    neighborhood: tmpl.neighborhood,
    city: city,
    state: uf,
    phone: tmpl.phone,
    rating: tmpl.rating,
    reviewsCount: tmpl.reviewsCount,
    websiteStatus: tmpl.websiteStatus,
    websiteUrl: null,
    instagramHandle: tmpl.instagram,
    lat: -23.5505 + (idx * 0.012),
    lng: -46.6333 + (idx * 0.015),
    opportunityScore: tmpl.score,
    opportunityLevel: tmpl.score > 90 ? "high" : "medium",
    estimatedValue: "R$ 1.800 - R$ 3.500",
    keyInsights: tmpl.insights,
  }));
}

function generateFallbackAnalysis(
  businessName: string,
  category: string,
  address: string,
  phone?: string,
  rating?: number,
  reviewsCount?: number
) {
  return {
    businessName,
    opportunityScore: 93,
    revenuePotential: "R$ 2.000 - R$ 3.800",
    urgencyLevel: "alta",
    missingFeatures: [
      "Botão Direto de Agendamento/Orçamento pelo WhatsApp",
      "Galeria Visual de Serviços e Trabalhos Realizados",
      "Prova Social Automática com Avaliações do Google",
      "Seção de Perguntas Frequentes (FAQ) para reduzir dúvidas"
    ],
    whyTheyNeedLandingPage: `A empresa ${businessName} possui uma excelente pontuação de ${rating || 4.8}★ no Google Maps (${reviewsCount || 40}+ avaliações). No entanto, pela falta de uma Landing Page otimizada, perde diariamente dezenas de clientes que pesquisam por ${category} no celular e preferem contratantes com site direto.`,
    competitorAdvantage: `Concorrentes diretos de ${category} na região já investem em anúncios no Google Ads direcionando para Landing Pages rápidas, capturando os clientes mais prontos para comprar.`,
    customPitchWhatsApp: `Olá! Sou especialista em sites de alta conversão e vi o excelente perfil da *${businessName}* no Google (${reviewsCount || 40}+ avaliações!). 👏\n\nNotei que vocês ainda não possuem uma Landing Page focada em receber solicitações pelo WhatsApp. Preparei uma prévia de como ficaria a página de vocês com botão direto de atendimento.\n\nPosso te enviar um modelo em imagem sem compromisso?`,
    customPitchEmail: `Assunto: Proposta de Landing Page para impulsionar agendamentos da ${businessName}\n\nOlá equipe da ${businessName},\n\nAcompanhando o mercado de ${category}, identifiquei o ótimo histórico de atendimento de vocês no Google Maps.\n\nConstruímos Landing Pages sob medida que convertem pesquisas do Google em mensagens diretas no seu WhatsApp.\n\nQuando teriam 10 minutos nesta semana para ver o protótipo que desenhamos para vocês?\n\nAtenciosamente,`,
    customPitchColdCall: `Roteiro Rápido (30s):\n1. "Olá! Posso falar com o proprietário ou responsável pela ${businessName}?"\n2. "Vi o perfil de vocês no Google com notas excelentes. Sou especialista em Landing Pages para ${category}."\n3. "Montei uma demonstração em imagem de uma página que coloca um botão direto de orçamento no seu WhatsApp. Posso mandar pelo Whats para dar uma olhada rápida?"`,
    landingPageConcept: {
      heroHeadline: `${businessName} — Referência em ${category}`,
      heroSubheadline: `Atendimento ágil, qualidade comprovada e agendamento simplificado direto pelo WhatsApp.`,
      callToAction: "Solicitar Orçamento no WhatsApp",
      recommendedSections: [
        "Hero de Alta Conversão com Chamada WhatsApp",
        "Serviços Principais & Benefícios",
        "Avaliações Reais do Google Maps",
        "Localização Interativa e Formas de Contato"
      ],
      suggestedColorPalette: "Cores sóbrias de alto contraste (Azul Marinho / Indigo e Verde Esmeralda para o botão de conversão)",
      keySellingPoints: [
        "Atendimento imediato e humanizado",
        "Garantia de pontualidade e satisfação",
        "Orçamento sem compromisso pelo WhatsApp"
      ]
    }
  };
}

async function startServer() {
  // Vite middleware setup for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
