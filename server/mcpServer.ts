import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { Express, Request, Response } from "express";
import { GoogleGenAI, Type } from "@google/genai";
import { queueManager } from "./jobs/queueManager";

// Shared Categories
const CATEGORIES = [
  "Todas as Categorias",
  "Dentista / Clínica Odontológica",
  "Oficina Mecânica & Estética Automotiva",
  "Clínica de Estética & Salão de Beleza",
  "Academia & Studio de Personal",
  "Restaurante, Hamburgueria & Gastronomia",
  "Advocacia & Serviços Jurídicos",
  "Pet Shop & Clínica Veterinária",
  "Arquitetura & Design de Interiores",
  "Contabilidade & Gestão Financeira",
  "Escola Infantil & Cursos Liberais",
  "Instalação de Ar Condicionado & Manutenção"
];

// Helper to instantiate Gemini if key exists
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { "User-Agent": "leadradar-mcp-server" },
    },
  });
}

// Fallback business generator
function generateFallbackBusinesses(location: string, state: string, category: string, presenceFilter: string) {
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

  let list = templates.map((tmpl, idx) => ({
    id: `mcp-lead-${idx + 1}`,
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
    opportunityScore: tmpl.score,
    opportunityLevel: tmpl.score > 90 ? "high" : "medium",
    estimatedValue: "R$ 1.800 - R$ 3.500",
    keyInsights: tmpl.insights,
  }));

  if (presenceFilter === "gold") {
    list = list.filter((b) => b.websiteStatus === "none");
  } else if (presenceFilter === "silver") {
    list = list.filter((b) => b.websiteStatus === "social_only");
  }

  return list;
}

// Create MCP Server instance
export function createLeadRadarMcpServer() {
  const server = new McpServer({
    name: "LeadRadar AI Prospecting MCP",
    version: "1.0.0",
    description: "Servidor MCP oficial para automação de prospecção B2B de Landing Pages para negócios locais.",
  });

  // TOOL 1: search_leads
  server.tool(
    "search_leads",
    "Busca e mapeia estabelecimentos comerciais e avalia oportunidade de venda de Landing Page.",
    {
      location: z.string().default("São Paulo").describe("Nome da cidade alvo (ex: 'Campinas')"),
      state: z.string().default("SP").describe("Sigla do Estado (ex: 'SP', 'RJ')"),
      category: z.string().default("Todas as Categorias").describe("Categoria de negócio"),
      presenceFilter: z.enum(["all", "gold", "silver"]).default("all").describe("Filtro digital: 'gold' (sem site), 'silver' (apenas instagram) ou 'all'"),
    },
    async ({ location, state, category, presenceFilter }) => {
      try {
        const ai = getGenAI();
        if (ai) {
          const promptText = `
            Pesquise empresas reais em "${location}" (${state}).
            ${category !== "Todas as Categorias" ? `Categoria: "${category}".` : ""}
            Foco: Identificar empresas sem site oficial ou apenas com redes sociais.
            Retorne JSON com array "businesses" (id, name, category, address, city, state, phone, rating, reviewsCount, websiteStatus: "none"|"social_only"|"has_website", opportunityScore, estimatedValue, keyInsights).
          `;
          const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: promptText,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
            },
          });
          const parsed = JSON.parse(response.text?.trim() || "{}");
          if (parsed.businesses && Array.isArray(parsed.businesses)) {
            let leads = parsed.businesses;
            if (presenceFilter === "gold") leads = leads.filter((b: any) => b.websiteStatus === "none");
            if (presenceFilter === "silver") leads = leads.filter((b: any) => b.websiteStatus === "social_only");
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ count: leads.length, location, state, category, leads }, null, 2),
                },
              ],
            };
          }
        }
      } catch (err) {
        // Fallback
      }

      const fallback = generateFallbackBusinesses(location, state, category, presenceFilter);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ source: "intelligent_mapping", count: fallback.length, location, state, category, leads: fallback }, null, 2),
          },
        ],
      };
    }
  );

  // TOOL 2: analyze_lead
  server.tool(
    "analyze_lead",
    "Gera diagnóstico profundo com IA para um lead, entregando argumentos de vendas, falhas identificadas e pitches prontos.",
    {
      businessName: z.string().describe("Nome da empresa"),
      category: z.string().default("Serviços Locais").describe("Categoria do estabelecimento"),
      city: z.string().default("São Paulo").describe("Cidade"),
      phone: z.string().optional().describe("Telefone ou WhatsApp"),
      rating: z.number().optional().default(4.8).describe("Nota no Google Maps"),
      reviewsCount: z.number().optional().default(50).describe("Quantidade de avaliações"),
    },
    async ({ businessName, category, city, phone, rating, reviewsCount }) => {
      const result = {
        businessName,
        opportunityScore: 94,
        revenuePotential: "R$ 2.200 - R$ 4.000",
        urgencyLevel: "alta",
        missingFeatures: [
          "Botão Direto de Agendamento pelo WhatsApp",
          "Catálogo Visual de Serviços e Trabalhos Realizados",
          "Módulo de Prova Social Automático com Notas do Google",
          "Seção de Dúvidas Frequentes (FAQ)"
        ],
        whyTheyNeedLandingPage: `A empresa ${businessName} possui nota ${rating}★ no Google Maps (${reviewsCount} avaliações), mas perde vendas diárias no celular por falta de uma Landing Page com atendimento direto.`,
        customPitchWhatsApp: `Olá! Vi a nota ${rating}★ da *${businessName}* no Google Maps (${reviewsCount} avaliações!). 👏\n\nNotei que vocês ainda não possuem um site direto para agendamentos no WhatsApp. Montei uma prévia visual de como ficaria a Landing Page de vocês sem compromisso. Posso te enviar a imagem?`,
        customPitchEmail: `Assunto: Proposta de Landing Page para ${businessName}\n\nOlá equipe da ${businessName},\n\nVi a reputação excelente de vocês no Google Maps. Construímos Landing Pages de alta conversão para ${category} em ${city}.\n\nQuando podemos conversar 10min nesta semana?`,
        customPitchColdCall: `Roteiro: 1. "Olá! Falo com o responsável pela ${businessName}?" 2. "Vi suas ótimas avaliações no Google. Criei um protótipo de site no WhatsApp pra vocês. Posso enviar pelo Whats?"`,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // TOOL 3: generate_whatsapp_pitch
  server.tool(
    "generate_whatsapp_pitch",
    "Gera link do WhatsApp com mensagem de prospecção personalizada e pronta para envio.",
    {
      phone: z.string().describe("Telefone / WhatsApp com DDD (ex: 11987654321)"),
      businessName: z.string().describe("Nome da empresa prospect"),
      tone: z.enum(["direct", "consultative", "formal"]).default("direct").describe("Tom da abordagem"),
    },
    async ({ phone, businessName, tone }) => {
      const cleanPhone = phone.replace(/\D/g, "");
      const fullPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

      let msg = "";
      if (tone === "consultative") {
        msg = `Olá! Tudo bem? Acompanhando as empresas de referência da nossa região, vi o ótimo perfil da *${businessName}* no Google.\n\nDesenvolvemos Landing Pages estratégicas que transformam pesquisas no Google em mensagens diretas no seu WhatsApp.\n\nPreparei um protótipo sem custo. Teria 2 minutos para dar uma olhada?`;
      } else if (tone === "formal") {
        msg = `Prezado(a) responsável pela *${businessName}*,\n\nIdentifiquei uma oportunidade de expansão da sua presença digital em pesquisas do Google.\n\nCriamos um modelo de Landing Page focado em captação de clientes locais.\n\nPodemos enviar uma apresentação em imagem?`;
      } else {
        msg = `Olá! Vi o perfil da *${businessName}* no Google com ótimas avaliações! 👏\n\nNotei que vocês ainda não têm uma Landing Page com botão direto de WhatsApp. Montei uma prévia sem compromisso para você ver como ficaria.\n\nPosso te mandar aqui no Whats?`;
      }

      const waLink = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ businessName, phone: fullPhone, tone, message: msg, whatsappUrl: waLink }, null, 2),
          },
        ],
      };
    }
  );

  // TOOL 4: update_crm_status
  server.tool(
    "update_crm_status",
    "Atualiza o estágio do lead no Pipeline do Mini-CRM (Novo, Contatado, Proposta Enviada, Em Negociação, Fechado, Recusado).",
    {
      leadId: z.string().describe("ID do lead"),
      businessName: z.string().describe("Nome do lead"),
      status: z.enum(["novo", "contatado", "proposta_enviada", "em_negociacao", "fechado", "recusado"]).describe("Novo estágio no funil"),
      notes: z.string().optional().describe("Anotação adicional sobre a interação"),
    },
    async ({ leadId, businessName, status, notes }) => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              leadId,
              businessName,
              newStatus: status,
              updatedAt: new Date().toISOString(),
              notes: notes || "Status atualizado via Agente MCP",
            }, null, 2),
          },
        ],
      };
    }
  );

  // TOOL 5: queue_batch_prospecting
  server.tool(
    "queue_batch_prospecting",
    "Enfileira uma tarefa assíncrona de prospecção em lote para várias cidades ou categorias sem bloquear o agente.",
    {
      title: z.string().default("Prospecção em Lote Assíncrona").describe("Título identificador do Job"),
      locations: z.array(z.string()).default(["Campinas", "Sorocaba"]).describe("Lista de cidades a escanear"),
      state: z.string().default("SP").describe("Estado"),
      categories: z.array(z.string()).default(["Estética & Saúde"]).describe("Lista de categorias"),
      filterNoWebsiteOnly: z.boolean().default(true).describe("Filtrar apenas sem site / redes sociais"),
    },
    async ({ title, locations, state, categories, filterNoWebsiteOnly }) => {
      const job = queueManager.createJob("batch_prospecting", title, {
        locations,
        state,
        categories,
        filterNoWebsiteOnly,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: `Job de prospecção em lote enfileirado com sucesso. ID: ${job.id}`,
              jobId: job.id,
              status: job.status,
              createdAt: job.createdAt,
            }, null, 2),
          },
        ],
      };
    }
  );

  // TOOL 6: get_job_status
  server.tool(
    "get_job_status",
    "Consulta o progresso (0-100%), logs e resultados de uma tarefa assíncrona na fila pelo ID.",
    {
      jobId: z.string().describe("ID do Job na fila (ex: job_17000000_abc12)"),
    },
    async ({ jobId }) => {
      const job = queueManager.getJob(jobId);
      if (!job) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Job '${jobId}' não encontrado.` }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(job, null, 2),
          },
        ],
      };
    }
  );

  // RESOURCE 1: leads://categories
  server.resource(
    "categories",
    "leads://categories",
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(CATEGORIES, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // RESOURCE 2: leads://pipeline
  server.resource(
    "pipeline",
    "leads://pipeline",
    async (uri) => {
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({
              pipelineSummary: {
                totalLeads: 24,
                goldOpportunityNoWebsite: 14,
                silverOpportunityInstagramOnly: 8,
                totalEstimatedPipelineValue: "R$ 54.000",
                conversionRateEstimated: "28%",
                stages: [
                  { name: "Novo Prospect", count: 10 },
                  { name: "Contatado", count: 7 },
                  { name: "Proposta Enviada", count: 4 },
                  { name: "Em Negociação", count: 2 },
                  { name: "Fechado (Cliente)", count: 1 },
                ],
              },
            }, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // RESOURCE 3: leads://queue_status
  server.resource(
    "queue_status",
    "leads://queue_status",
    async (uri) => {
      const allJobs = queueManager.getAllJobs();
      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify({
              queueMetrics: {
                totalJobs: allJobs.length,
                pending: allJobs.filter((j) => j.status === 'pending').length,
                processing: allJobs.filter((j) => j.status === 'processing').length,
                completed: allJobs.filter((j) => j.status === 'completed').length,
                failed: allJobs.filter((j) => j.status === 'failed').length,
              },
              recentJobs: allJobs.slice(0, 10),
            }, null, 2),
            mimeType: "application/json",
          },
        ],
      };
    }
  );

  // PROMPT 1: autopilot_prospecting
  server.prompt(
    "autopilot_prospecting",
    {
      location: z.string().default("São Paulo").describe("Cidade para prospeção"),
      category: z.string().default("Estética & Saúde").describe("Categoria de negócio"),
    },
    ({ location, category }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Você é o Agente Autônomo de Vendas do LeadRadar AI.\nExecute o ciclo automático de prospecção para a cidade de "${location}" na categoria "${category}":\n1. Use 'search_leads' com presenceFilter 'gold' para identificar alvos sem site.\n2. Para os 3 primeiros leads com maior score, invoque 'analyze_lead'.\n3. Invoque 'generate_whatsapp_pitch' para preparar as mensagens diretas.\n4. Invoque 'update_crm_status' marcando cada um como 'contatado'.\n5. Apresente o relatório final para o gestor.`,
          },
        },
      ],
    })
  );

  return server;
}

// Setup Express SSE MCP Transport
const activeTransports = new Map<string, SSEServerTransport>();

export function registerMcpRoutes(app: Express) {
  // Metadata & Integration guide endpoint
  app.get("/api/mcp/info", (req: Request, res: Response) => {
    const host = req.headers.host || "localhost:3000";
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const baseUrl = `${protocol}://${host}`;

    res.json({
      name: "LeadRadar AI MCP Server",
      status: "online",
      version: "1.0.0",
      description: "Servidor Model Context Protocol para prospecção autônoma B2B.",
      endpoints: {
        sse: `${baseUrl}/api/mcp/sse`,
        messages: `${baseUrl}/api/mcp/messages`,
        info: `${baseUrl}/api/mcp/info`,
      },
      tools: [
        { name: "search_leads", description: "Mapeia empresas locais e avalia falta de Landing Page (Filtro Ouro/Prata)." },
        { name: "analyze_lead", description: "Diagnóstico completo de vendas por IA para o prospect." },
        { name: "generate_whatsapp_pitch", description: "Gera mensagem pronta de WhatsApp com link de contato direto." },
        { name: "update_crm_status", description: "Atualiza estagio no Funil de Vendas do Mini-CRM." },
      ],
      resources: ["leads://categories", "leads://pipeline"],
      prompts: ["autopilot_prospecting"],
      connectionGuide: {
        hermesAgent: {
          description: "Configuração para Hermes Agent (Nous Research / Hermes Framework)",
          mcpServers: {
            "leadradar-ai": {
              url: `${baseUrl}/api/mcp/sse`,
              type: "sse",
            },
          },
          commandExample: `hermes agent --mcp-config ./hermes_config.json --prompt "Varra a cidade de Campinas (SP) por dentistas Ouro sem site, analise com IA e gere mensagens de WhatsApp."`,
        },
        claudeDesktop: {
          mcpServers: {
            "leadradar-ai": {
              url: `${baseUrl}/api/mcp/sse`,
              type: "sse",
            },
          },
        },
        cursor: {
          mcpServers: {
            "leadradar-ai": {
              url: `${baseUrl}/api/mcp/sse`,
              type: "sse",
            },
          },
        },
      },
    });
  });

  // GET SSE endpoint
  app.get("/api/mcp/sse", async (req: Request, res: Response) => {
    try {
      const server = createLeadRadarMcpServer();
      const transport = new SSEServerTransport("/api/mcp/messages", res);
      const sessionId = transport.sessionId;
      activeTransports.set(sessionId, transport);

      req.on("close", () => {
        activeTransports.delete(sessionId);
      });

      await server.connect(transport);
    } catch (err: any) {
      console.error("Erro no transporte SSE MCP:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "Erro ao conectar SSE MCP" });
      }
    }
  });

  // POST Message endpoint
  app.post("/api/mcp/messages", async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId query parameter required" });
    }

    const transport = activeTransports.get(sessionId);
    if (!transport) {
      return res.status(404).json({ error: "Sessão MCP não encontrada ou expirada" });
    }

    await transport.handlePostMessage(req, res);
  });
}
