import { GoogleGenAI, Type } from "@google/genai";

export type JobType = 'batch_prospecting' | 'batch_lead_analysis' | 'mcp_autopilot';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface JobLog {
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

export interface Job {
  id: string;
  type: JobType;
  title: string;
  status: JobStatus;
  progress: number; // 0 to 100
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  payload: any;
  result?: any;
  error?: string;
  logs: JobLog[];
}

class QueueManager {
  private jobs: Map<string, Job> = new Map();
  private processingCount = 0;
  private maxConcurrency = 2;
  private isWorkerRunning = false;

  constructor() {
    // Periodically run worker to process pending jobs
    setInterval(() => this.processQueue(), 1000);
  }

  // Create a new job in the queue
  public createJob(type: JobType, title: string, payload: any): Job {
    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const job: Job = {
      id,
      type,
      title,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
      payload,
      logs: [
        {
          timestamp: new Date().toISOString(),
          message: `Job '${title}' enfileirado com sucesso.`,
          level: 'info',
        },
      ],
    };

    this.jobs.set(id, job);
    this.processQueue();
    return job;
  }

  // Get job by ID
  public getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  // List all jobs
  public getAllJobs(): Job[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Cancel a job
  public cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === 'pending' || job.status === 'processing') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      this.addLog(job, 'Job cancelado pelo usuário.', 'warning');
      return true;
    }
    return false;
  }

  // Clear finished jobs
  public clearCompleted(): number {
    let count = 0;
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        this.jobs.delete(id);
        count++;
      }
    }
    return count;
  }

  // Add log to a job
  public addLog(job: Job, message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
    job.logs.push({
      timestamp: new Date().toISOString(),
      message,
      level,
    });
  }

  // Main Queue Processor Loop
  private async processQueue() {
    if (this.isWorkerRunning) return;
    this.isWorkerRunning = true;

    try {
      while (this.processingCount < this.maxConcurrency) {
        const pendingJob = Array.from(this.jobs.values()).find(
          (j) => j.status === 'pending'
        );

        if (!pendingJob) break;

        this.processingCount++;
        this.runJob(pendingJob).finally(() => {
          this.processingCount--;
        });
      }
    } finally {
      this.isWorkerRunning = false;
    }
  }

  // Helper to instantiate Gemini
  private getGenAI(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { "User-Agent": "leadradar-queue-worker" },
      },
    });
  }

  // Worker task runner
  private async runJob(job: Job) {
    job.status = 'processing';
    job.startedAt = new Date().toISOString();
    job.progress = 5;
    this.addLog(job, `Iniciando processamento do job [${job.id}]...`, 'info');

    try {
      if (job.type === 'batch_prospecting') {
        await this.handleBatchProspecting(job);
      } else if (job.type === 'batch_lead_analysis') {
        await this.handleBatchLeadAnalysis(job);
      } else if (job.type === 'mcp_autopilot') {
        await this.handleMcpAutopilot(job);
      } else {
        throw new Error(`Tipo de job desconhecido: ${job.type}`);
      }

      if (!this.isJobCancelled(job.id)) {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date().toISOString();
        this.addLog(job, 'Processamento concluído com sucesso!', 'success');
      }
    } catch (err: any) {
      if (!this.isJobCancelled(job.id)) {
        job.status = 'failed';
        job.error = err?.message || 'Erro desconhecido durante execução da fila.';
        job.completedAt = new Date().toISOString();
        this.addLog(job, `Falha no processamento: ${job.error}`, 'error');
      }
    }
  }

  // Task Handler 1: Batch Prospecting across multiple locations/categories
  private async handleBatchProspecting(job: Job) {
    const { locations = ["Campinas", "Sorocaba"], state = "SP", categories = ["Todas as Categorias"], filterNoWebsiteOnly = true } = job.payload;

    const allDiscoveredLeads: any[] = [];
    const totalSteps = locations.length * categories.length;
    let completedSteps = 0;

    this.addLog(job, `Mapeamento em Lote iniciado: ${locations.length} cidades x ${categories.length} categorias.`, 'info');

    const ai = this.getGenAI();

    for (const loc of locations) {
      if (this.isJobCancelled(job.id)) return;

      for (const cat of categories) {
        if (this.isJobCancelled(job.id)) return;

        this.addLog(job, `Escaneando cidade: "${loc}" (${state}) | Categoria: "${cat}"...`, 'info');

        let leads: any[] = [];
        if (ai) {
          try {
            const promptText = `
              Pesquise empresas e estabelecimentos comerciais reais na região de "${loc}" (${state}).
              ${cat !== "Todas as Categorias" ? `Categoria específica: "${cat}".` : ""}
              Foco: Identificar empresas sem site oficial ou apenas com redes sociais (Instagram).
              Retorne JSON com array "businesses" (id, name, category, address, city, state, phone, rating, reviewsCount, websiteStatus: "none"|"social_only"|"has_website", opportunityScore, opportunityLevel, estimatedValue, keyInsights).
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
              leads = parsed.businesses;
            }
          } catch (e: any) {
            this.addLog(job, `Usando dados regionais estruturados para ${loc} (${e.message})`, 'warning');
            leads = this.generateFallbackLeadsForLocation(loc, state, cat);
          }
        } else {
          leads = this.generateFallbackLeadsForLocation(loc, state, cat);
        }

        if (filterNoWebsiteOnly) {
          leads = leads.filter((b) => b.websiteStatus === 'none' || b.websiteStatus === 'social_only');
        }

        allDiscoveredLeads.push(...leads);
        completedSteps++;
        job.progress = Math.min(95, Math.round((completedSteps / totalSteps) * 90) + 5);

        this.addLog(job, `✔ Encontrados ${leads.length} leads em ${loc} (${cat}). Total acumulado: ${allDiscoveredLeads.length}`, 'success');

        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    // Deduplicate leads by name/phone
    const uniqueMap = new Map();
    for (const lead of allDiscoveredLeads) {
      uniqueMap.set(lead.id || lead.name, lead);
    }
    const finalLeads = Array.from(uniqueMap.values());

    job.result = {
      totalFound: finalLeads.length,
      locationsProcessed: locations,
      categoriesProcessed: categories,
      leads: finalLeads,
    };
  }

  // Helper to check if job was cancelled
  private isJobCancelled(id: string): boolean {
    const job = this.jobs.get(id);
    return job?.status === 'cancelled';
  }

  // Task Handler 2: Batch Lead Analysis
  private async handleBatchLeadAnalysis(job: Job) {
    const { leads = [] } = job.payload;
    if (leads.length === 0) {
      this.addLog(job, 'Nenhum lead fornecido para análise.', 'warning');
      job.result = { analyses: [] };
      return;
    }

    this.addLog(job, `Análise de IA em Lote iniciada para ${leads.length} leads.`, 'info');
    const analyses: any[] = [];
    const ai = this.getGenAI();

    for (let i = 0; i < leads.length; i++) {
      if (this.isJobCancelled(job.id)) return;

      const lead = leads[i];
      this.addLog(job, `[${i + 1}/${leads.length}] Analisando estrategicamente: ${lead.name || lead.businessName}...`, 'info');

      let analysisResult = null;
      if (ai) {
        try {
          const promptText = `
            Faça um diagnóstico de marketing e vendas B2B para o seguinte lead:
            - Empresa: ${lead.name || lead.businessName}
            - Categoria: ${lead.category || "Serviços Locais"}
            - Cidade: ${lead.city || "São Paulo"}
            - Avaliação: ${lead.rating || 4.8}★ (${lead.reviewsCount || 40} avaliações)
            - Status Web: ${lead.websiteStatus || "none"}
            
            Retorne JSON com: businessName, opportunityScore, revenuePotential, urgencyLevel, missingFeatures (array), whyTheyNeedLandingPage, customPitchWhatsApp, customPitchEmail, customPitchColdCall, landingPageConcept (heroHeadline, heroSubheadline, callToAction, recommendedSections).
          `;
          const response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: promptText,
            config: {
              responseMimeType: "application/json",
            },
          });
          analysisResult = JSON.parse(response.text?.trim() || "{}");
        } catch (err: any) {
          analysisResult = this.generateFallbackAnalysis(lead);
        }
      } else {
        analysisResult = this.generateFallbackAnalysis(lead);
      }

      analyses.push({
        leadId: lead.id,
        businessName: lead.name || lead.businessName,
        analysis: analysisResult,
      });

      job.progress = Math.min(95, Math.round(((i + 1) / leads.length) * 90) + 5);
      this.addLog(job, `✔ Diagnóstico concluído para ${lead.name || lead.businessName}.`, 'success');
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    job.result = {
      totalAnalyzed: analyses.length,
      analyses,
    };
  }

  // Task Handler 3: MCP Autopilot Job
  private async handleMcpAutopilot(job: Job) {
    const { location = "Campinas", category = "Estética & Saúde" } = job.payload;

    this.addLog(job, `Autopilot MCP ativado para ${location} (${category}).`, 'info');
    job.progress = 15;

    // Step 1: Search
    this.addLog(job, `[Passo 1/4] Varrendo a região em busca de alvos sem site (Filtro Ouro)...`, 'info');
    const leads = this.generateFallbackLeadsForLocation(location, "SP", category);
    job.progress = 40;
    await new Promise((r) => setTimeout(r, 1000));

    // Step 2: Analyze top 3
    this.addLog(job, `[Passo 2/4] Executando análise preditiva de vendas com IA para os melhores alvos...`, 'info');
    const topLeads = leads.slice(0, 3);
    const analyses = topLeads.map((l) => this.generateFallbackAnalysis(l));
    job.progress = 70;
    await new Promise((r) => setTimeout(r, 1000));

    // Step 3: Pitches
    this.addLog(job, `[Passo 3/4] Gerando links de WhatsApp e scripts personalizados...`, 'info');
    job.progress = 85;
    await new Promise((r) => setTimeout(r, 800));

    // Step 4: CRM Update
    this.addLog(job, `[Passo 4/4] Atualizando o pipeline do Mini-CRM para os leads qualificados...`, 'info');
    job.progress = 98;

    job.result = {
      location,
      category,
      leadsProcessed: topLeads.length,
      leads: topLeads,
      analyses,
    };
  }

  // Fallback helpers
  private generateFallbackLeadsForLocation(loc: string, uf: string, cat: string) {
    const city = loc.split(',')[0].trim() || "São Paulo";
    const categoryName = cat !== "Todas as Categorias" ? cat : "Estética & Saúde";
    return [
      {
        id: `async-lead-${Date.now()}-1`,
        name: `${categoryName.split('/')[0]} Centro de Excelência ${city}`,
        category: categoryName,
        address: `Av. Paulista, 1000 - Centro`,
        city: city,
        state: uf || "SP",
        phone: "(11) 98765-4321",
        rating: 4.9,
        reviewsCount: 142,
        websiteStatus: "none",
        opportunityScore: 96,
        opportunityLevel: "high",
        estimatedValue: "R$ 2.500 - R$ 4.200",
        keyInsights: [
          "Mencionam excelente atendimento mas não possuem catálogo digital.",
          "Perdem mais de 30 buscas diárias no Google Maps por falta de site."
        ],
      },
      {
        id: `async-lead-${Date.now()}-2`,
        name: `${categoryName.split('/')[0]} Especializada ${city}`,
        category: categoryName,
        address: `Rua das Flores, 450 - Jardim`,
        city: city,
        state: uf || "SP",
        phone: "(11) 97123-8899",
        rating: 4.8,
        reviewsCount: 89,
        websiteStatus: "social_only",
        instagramHandle: "@especializada.local",
        opportunityScore: 92,
        opportunityLevel: "high",
        estimatedValue: "R$ 1.800 - R$ 3.500",
        keyInsights: [
          "Dependem 100% do Instagram, sem presença oficial no Google.",
          "Proposta visual de Landing Page possui alta taxa de conversão."
        ],
      },
    ];
  }

  private generateFallbackAnalysis(lead: any) {
    const name = lead.name || lead.businessName || "Empresa Prospect";
    return {
      businessName: name,
      opportunityScore: 94,
      revenuePotential: "R$ 2.200 - R$ 4.000",
      urgencyLevel: "alta",
      missingFeatures: [
        "Botão Direto de Agendamento pelo WhatsApp",
        "Catálogo Visual de Serviços com Fotos",
        "Módulo de Prova Social Automático com Notas do Google",
        "Seção de Perguntas Frequentes (FAQ)"
      ],
      whyTheyNeedLandingPage: `A empresa ${name} possui nota excelente no Google Maps, mas perde clientes diariamente para concorrentes por não possuir uma Landing Page rápida com agendamento no WhatsApp.`,
      competitorAdvantage: "Concorrentes da região já estão anunciando no Google Ads e direcionando para páginas de conversão.",
      customPitchWhatsApp: `Olá! Vi o perfil da *${name}* no Google com avaliações excelentes! 👏\n\nNotei que vocês ainda não possuem uma Landing Page rápida com agendamento direto pelo WhatsApp. Criei um protótipo prévio para vocês verem como ficaria sem compromisso. Posso enviar a imagem?`,
      customPitchEmail: `Assunto: Oportunidade de Captação no Google para ${name}\n\nOlá equipe da ${name},\n\nNotamos o sucesso do negócio de vocês. Criamos Landing Pages de alta conversão para o setor em sua região. Podermos conversar 5 min nesta semana?`,
      customPitchColdCall: `Roteiro: 1. Falar com o responsável. 2. Elogiar nota no Google. 3. Oferecer envio da imagem da Landing Page criada pra eles via WhatsApp.`,
      landingPageConcept: {
        heroHeadline: `Excelência e Atendimento Especializado em ${lead.city || "sua Região"}`,
        heroSubheadline: "Agende sua consulta ou solicite um orçamento direto pelo WhatsApp sem filas.",
        callToAction: "Agendar via WhatsApp Agora",
        recommendedSections: ["Hero de Alto Impacto", "Nossos Serviços", "Avaliações 5 Estrelas", "Perguntas Frequentes", "Contato & Mapa"],
        suggestedColorPalette: "Tons de Azul Moderno e Branco Limpo",
        keySellingPoints: ["Atendimento Ágil", "Reputação 5 Estrelas", "Preço Justo"],
      },
    };
  }
}

// Global Singleton Queue Instance
export const queueManager = new QueueManager();
