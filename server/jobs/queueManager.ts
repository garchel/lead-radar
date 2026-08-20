
import { upsertJob, replaceJobs, getAllJobs, upsertLead, updateLeadAnalysis, getLeadById, getLandingPageById, getDueFollowUps } from "../store/db";
import { StoredLead } from "../store/types";
import {
  createLandingPageRecord,
  deployLandingPage,
  approveLandingPage,
} from "../landingPage/service";
import { searchBusinesses, analyzeLead } from "../services/prospectingService";
import { buildStableLeadId } from "../services/leadIdentity";
import { enrichLeadBatch } from "../enrichment";
import { dispatchLeadContact } from "../services/interactionService";


export type JobType =
  | 'batch_prospecting'
  | 'batch_lead_analysis'
  | 'mcp_autopilot'
  | 'landing_page_creation'
  | 'follow_up_batch';
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
  attempts?: number;
  retryAt?: string;
  logs: JobLog[];
}

class QueueManager {
  private jobs: Map<string, Job> = new Map();
  private processingCount = 0;
  private maxConcurrency = 2;
  private isWorkerRunning = false;

  constructor() {
    this.seedFromStore();
    // Periodically run worker to process pending jobs
    setInterval(() => this.processQueue(), 1000);
  }

  private seedFromStore() {
    try {
      for (const j of getAllJobs()) {
        this.jobs.set(j.id, j);
      }
    } catch (err) {
      console.error("Erro ao semear fila a partir do store:", err);
    }
  }

  private persist(job: Job) {
    try {
      upsertJob(job);
    } catch (err) {
      console.error("Erro ao persistir job:", err);
    }
  }

  private persistAll() {
    try {
      replaceJobs(Array.from(this.jobs.values()));
    } catch (err) {
      console.error("Erro ao persistir fila:", err);
    }
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
    this.persist(job);
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
      this.persist(job);
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
    this.persistAll();
    return count;
  }

  // Add log to a job
  public addLog(job: Job, message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
    job.logs.push({
      timestamp: new Date().toISOString(),
      message,
      level,
    });
    this.persist(job);
  }

  // Main Queue Processor Loop
  private async processQueue() {
    if (this.isWorkerRunning) return;
    this.isWorkerRunning = true;

    try {
      while (this.processingCount < this.maxConcurrency) {
        const pendingJob = Array.from(this.jobs.values()).find((j) => {
          if (j.status !== 'pending') return false;
          if (j.retryAt && new Date(j.retryAt).getTime() > Date.now()) return false;
          return true;
        });

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
      } else if (job.type === 'landing_page_creation') {
        await this.handleLandingPageCreation(job);
      } else if (job.type === 'follow_up_batch') {
        await this.handleFollowUpBatch(job);
      } else {
        throw new Error(`Tipo de job desconhecido: ${job.type}`);
      }

      if (!this.isJobCancelled(job.id)) {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = new Date().toISOString();
        this.addLog(job, 'Processamento concluído com sucesso!', 'success');
      }
      this.notifyWebhook(job);
    } catch (err: any) {
      if (!this.isJobCancelled(job.id)) {
        const attempts = (job.attempts || 0) + 1;
        job.attempts = attempts;
        const MAX_RETRIES = 3;
        if (attempts < MAX_RETRIES) {
          const delay = Math.min(2 ** attempts * 2000, 30000);
          job.status = 'pending';
          job.retryAt = new Date(Date.now() + delay).toISOString();
          job.error = err?.message || 'Erro durante execução.';
          this.addLog(job, `Tentativa ${attempts}/${MAX_RETRIES} falhou — retentativa em ${delay}ms.`, 'warning');
        } else {
          job.status = 'failed';
          job.error = err?.message || 'Erro desconhecido após todas as tentativas.';
          job.completedAt = new Date().toISOString();
          this.addLog(job, `Falha definitiva: ${job.error}`, 'error');
        }
      }
      this.notifyWebhook(job);
    }
  }

  // Task Handler 1: Batch Prospecting across multiple locations/categories (persists leads)
  private async handleBatchProspecting(job: Job) {
    const { locations, state, categories, filterNoWebsiteOnly, autoEnrich = false } = job.payload;
    if (!Array.isArray(locations) || locations.length === 0 || !locations.every((value: unknown) => typeof value === 'string' && value.trim())) {
      throw new Error('Job de prospecção inválido: informe ao menos uma cidade válida.');
    }
    if (typeof state !== 'string' || !/^[A-Za-z]{2}$/.test(state.trim())) {
      throw new Error('Job de prospecção inválido: informe uma UF válida com 2 letras.');
    }
    if (!Array.isArray(categories) || categories.length === 0 || !categories.every((value: unknown) => typeof value === 'string' && value.trim())) {
      throw new Error('Job de prospecção inválido: informe ao menos uma categoria válida.');
    }
    if (typeof filterNoWebsiteOnly !== 'boolean') {
      throw new Error('Job de prospecção inválido: filterNoWebsiteOnly deve ser booleano.');
    }

    const normalizedState = state.trim().toUpperCase();
    const allDiscoveredLeads: StoredLead[] = [];
    const totalSteps = locations.length * categories.length;
    let completedSteps = 0;

    this.addLog(job, `Mapeamento em Lote iniciado: ${locations.length} cidades x ${categories.length} categorias.`, 'info');

    for (const loc of locations) {
      if (this.isJobCancelled(job.id)) return;

      for (const cat of categories) {
        if (this.isJobCancelled(job.id)) return;

        this.addLog(job, `Escaneando cidade: "${loc}" (${state}) | Categoria: "${cat}"...`, 'info');

        const { source, businesses } = await searchBusinesses({ location: loc.trim(), state: normalizedState, category: cat, filterNoWebsiteOnly });
        this.addLog(job, `Fonte de dados: ${source === "gemini" ? "Gemini (pesquisa real)" : source}.`, 'info');

        const saved: StoredLead[] = [];
        for (const [index, biz] of businesses.entries()) {
          const requiredFields = ['id', 'name', 'category', 'address', 'city', 'state', 'websiteStatus'];
          if (requiredFields.some((field) => typeof biz[field] !== 'string' || !biz[field].trim())) {
            throw new Error(`A busca retornou o lead ${index + 1} com dados obrigatórios ausentes.`);
          }
          if (!['none', 'social_only', 'has_website'].includes(biz.websiteStatus)) {
            throw new Error(`A busca retornou um websiteStatus inválido para o lead ${biz.name}.`);
          }
          const lead: StoredLead = {
            id: buildStableLeadId(biz),
            name: biz.name,
            category: biz.category,
            address: biz.address,
            neighborhood: biz.neighborhood,
            city: biz.city,
            state: biz.state,
            phone: biz.phone,
            rating: biz.rating,
            reviewsCount: biz.reviewsCount,
            websiteStatus: biz.websiteStatus,
            googlePlaceId: biz.googlePlaceId,
            websiteUrl: biz.websiteUrl,
            instagramHandle: biz.instagramHandle,
            lat: biz.lat,
            lng: biz.lng,
            opportunityScore: biz.opportunityScore,
            opportunityLevel: biz.opportunityLevel,
            estimatedValue: biz.estimatedValue,
            keyInsights: biz.keyInsights,
            pipelineStatus: "prospect",
            savedAt: new Date().toISOString(),
          };
          const storedLead = upsertLead(lead, { preserveInteraction: true });
          saved.push(storedLead);
          allDiscoveredLeads.push(storedLead);
        }

        completedSteps++;
        job.progress = Math.min(95, Math.round((completedSteps / totalSteps) * 90) + 5);
        this.addLog(job, `✔ ${saved.length} leads de ${loc} (${cat}) salvos no banco. Total acumulado: ${allDiscoveredLeads.length}`, 'success');

        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }

    // Optional auto-enrichment
    if (autoEnrich && allDiscoveredLeads.length > 0) {
      this.addLog(job, 'Enriquecendo leads salvos (Google Places, CNPJ, e-mail)...', 'info');
      const { enriched, total } = await enrichLeadBatch(allDiscoveredLeads);
      this.addLog(job, `Enriquecimento concluído: ${enriched}/${total} leads com dados adicionais.`, enriched > 0 ? 'success' : 'warning');
    }

    job.result = {
      totalFound: allDiscoveredLeads.length,
      locationsProcessed: locations,
      categoriesProcessed: categories,
      leads: allDiscoveredLeads,
    };
  }

  // Notify a configured webhook when a job finishes (fire-and-forget)
  private async notifyWebhook(job: Job) {
    const url = process.env.JOB_WEBHOOK_URL;
    if (!url) return;
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'job_completed',
          jobId: job.id,
          type: job.type,
          title: job.title,
          status: job.status,
          error: job.error || null,
          completedAt: job.completedAt || null,
          result: job.result || null,
        }),
      });
    } catch {
      /* fire-and-forget */
    }
  }

  // Helper to check if job was cancelled
  private isJobCancelled(id: string): boolean {
    const job = this.jobs.get(id);
    return job?.status === 'cancelled';
  }

  // Task Handler 2: Batch Lead Analysis
  private async handleBatchLeadAnalysis(job: Job) {
    const { leads } = job.payload;
    if (!Array.isArray(leads) || leads.length === 0) {
      throw new Error('Job de análise inválido: informe uma lista não vazia de leads.');
    }

    this.addLog(job, `Análise de IA em lote iniciada para ${leads.length} leads.`, 'info');
    const analyses: any[] = [];

    for (let i = 0; i < leads.length; i++) {
      if (this.isJobCancelled(job.id)) return;

      const lead = leads[i];
      if (!lead || typeof lead.id !== 'string' || typeof lead.name !== 'string' || !lead.name.trim()) {
        throw new Error(`Lead ${i + 1} inválido: id e nome são obrigatórios para a análise.`);
      }
      this.addLog(job, `[${i + 1}/${leads.length}] Analisando estrategicamente: ${lead.name}...`, 'info');

      let analysisResult;
      try {
        analysisResult = await analyzeLead({
          businessName: lead.name,
          category: lead.category,
          city: lead.city,
          phone: lead.phone,
          rating: lead.rating,
          reviewsCount: lead.reviewsCount,
        });
      } catch (err: any) {
        throw new Error(`Falha ao analisar ${lead.name}: ${err?.message || 'erro desconhecido'}`);
      }

      analyses.push({ leadId: lead.id, businessName: lead.name, analysis: analysisResult });
      job.progress = Math.min(95, Math.round(((i + 1) / leads.length) * 90) + 5);
      this.addLog(job, `✔ Diagnóstico concluído para ${lead.name}.`, 'success');
    }

    job.result = { totalAnalyzed: analyses.length, analyses };
  }

  // Task Handler 3: MCP Autopilot Job
  private async handleMcpAutopilot(job: Job) {
    const { location, state, category, createLandingPages = false, sendPitches = false, maxLeads } = job.payload;
    if (typeof location !== 'string' || !location.trim() || typeof state !== 'string' || !/^[A-Za-z]{2}$/.test(state.trim()) || typeof category !== 'string' || !category.trim()) {
      throw new Error('Job autopilot inválido: location, state e category são obrigatórios.');
    }
    if (!Number.isInteger(maxLeads) || maxLeads <= 0) {
      throw new Error('Job autopilot inválido: maxLeads deve ser um inteiro maior que zero.');
    }
    const normalizedState = state.trim().toUpperCase();

    this.addLog(job, `Autopilot MCP ativado para ${location.trim()} (${category}).`, 'info');
    job.progress = 10;

    // Step 1: Search using the configured real data provider
    this.addLog(job, `[Passo 1/6] Varrendo a região em busca de alvos sem site (Filtro Ouro/Prata)...`, 'info');
    const { source, businesses } = await searchBusinesses({ location: location.trim(), state: normalizedState, category, filterNoWebsiteOnly: true });
    this.addLog(job, `Fonte de dados: ${source}. ${businesses.length} leads encontrados.`, 'success');
    job.progress = 30;
    await new Promise((r) => setTimeout(r, 500));

    // Step 2: Persist leads no banco compartilhado
    this.addLog(job, `[Passo 2/6] Salvando leads no banco compartilhado...`, 'info');
    const saved: StoredLead[] = [];
    for (const [index, biz] of businesses.slice(0, maxLeads).entries()) {
      const requiredFields = ['id', 'name', 'category', 'address', 'city', 'state', 'websiteStatus'];
      if (requiredFields.some((field) => typeof biz[field] !== 'string' || !biz[field].trim())) {
        throw new Error(`A busca retornou o lead ${index + 1} com dados obrigatórios ausentes.`);
      }
      if (!['none', 'social_only', 'has_website'].includes(biz.websiteStatus)) {
        throw new Error(`A busca retornou um websiteStatus inválido para o lead ${biz.name}.`);
      }
      const lead: StoredLead = {
        id: buildStableLeadId(biz),
        name: biz.name,
        category: biz.category,
        address: biz.address,
        neighborhood: biz.neighborhood,
        city: biz.city,
        state: biz.state,
        phone: biz.phone,
        rating: biz.rating,
        reviewsCount: biz.reviewsCount,
        websiteStatus: biz.websiteStatus,
        googlePlaceId: biz.googlePlaceId,
        websiteUrl: biz.websiteUrl,
        instagramHandle: biz.instagramHandle,
        lat: biz.lat,
        lng: biz.lng,
        opportunityScore: biz.opportunityScore,
        opportunityLevel: biz.opportunityLevel,
        estimatedValue: biz.estimatedValue,
        keyInsights: biz.keyInsights,
        pipelineStatus: "prospect",
        savedAt: new Date().toISOString(),
      };
      const storedLead = upsertLead(lead, { preserveInteraction: true });
      saved.push(storedLead);
    }
    this.addLog(job, `✔ ${saved.length} leads persistidos.`, 'success');
    job.progress = 45;

    // Step 3: Enriquecimento automático
    this.addLog(job, `[Passo 3/6] Enriquecendo leads (Google Places, CNPJ, e-mail)...`, 'info');
    const { enriched } = await enrichLeadBatch(saved);
    this.addLog(job, `Enriquecimento: ${enriched}/${saved.length} leads com dados adicionais.`, enriched > 0 ? 'info' : 'warning');
    job.progress = 60;

    // Step 4: Análise de IA persistida no lead
    this.addLog(job, `[Passo 4/6] Gerando diagnóstico de vendas com IA para os melhores alvos...`, 'info');
    const topLeads = saved.slice(0, Math.min(3, saved.length));
    const analyses: any[] = [];
    for (const lead of topLeads) {
      let analysis;
      try {
        analysis = await analyzeLead({
          businessName: lead.name,
          category: lead.category,
          city: lead.city,
          phone: lead.phone,
          rating: lead.rating,
          reviewsCount: lead.reviewsCount,
        });
      } catch (err: any) {
        throw new Error(`Falha ao analisar ${lead.name}: ${err?.message || 'erro desconhecido'}`);
      }
      updateLeadAnalysis(lead.id, analysis);
      analyses.push({ leadId: lead.id, businessName: lead.name, analysis });
      this.addLog(job, `✔ Diagnóstico gerado e persistido para ${lead.name}.`, 'success');
    }
    job.progress = 80;

    // Step 5: Links de WhatsApp personalizados
    this.addLog(job, `[Passo 5/6] Gerando links de WhatsApp e scripts personalizados...`, 'info');
    const pitches = topLeads.map((l) => {
      const analysis = analyses.find((a) => a.leadId === l.id)?.analysis;
      return {
        leadId: l.id,
        businessName: l.name,
        pitch: analysis?.customPitchWhatsApp || null,
        waLink: this.buildWhatsAppLink(l, analysis),
      };
    });
    job.progress = 92;

    // Step 5.5: (opcional) enviar os pitches de contato
    let sentContacts: any[] = [];
    if (sendPitches) {
      this.addLog(job, `Enviando mensagens de contato aos ${topLeads.length} alvos qualificados...`, 'info');
      for (const lead of topLeads) {
        try {
          const result = await dispatchLeadContact(lead);
          sentContacts.push({ leadId: lead.id, channel: result.channel, status: result.status, to: result.to, interactionId: result.interactionId });
          this.addLog(job, `${lead.name}: ${result.status} (${result.channel}).`, result.status === 'failed' ? 'error' : 'success');
          if (result.status !== 'sent') {
            throw new Error(`Falha ao contatar ${lead.name}: ${result.detail}`);
          }
        } catch (e: any) {
          throw new Error(`Falha ao contatar ${lead.name}: ${e?.message || e}`);
        }
      }
    }

    // Step 6: (opcional) criar Landing Pages
    let landingPages: any[] = [];
    if (createLandingPages) {
      this.addLog(job, `[Passo 6/6] Gerando Landing Pages para os alvos qualificados...`, 'info');
      for (const lead of topLeads) {
        const concept = analyses.find((a) => a.leadId === lead.id)?.analysis?.landingPageConcept;
        const lp = createLandingPageRecord(lead, concept, job.id);
        landingPages.push({ id: lp.id, slug: lp.slug, status: lp.status });
        this.addLog(job, `Landing Page "${lp.slug}" criada (aguardando aprovação).`, 'success');
      }
    }

    job.result = {
      location,
      category,
      source,
      leadsProcessed: saved.length,
      leads: saved,
      analyses,
      pitches,
      landingPages,
      sentContacts,
    };
  }

  // Build a wa.me deep link only when the lead and its persisted analysis contain all data.
  private buildWhatsAppLink(lead: StoredLead, analysis?: any): string | null {
    const digits = String(lead.phone || '').replace(/\D/g, '');
    const full = digits && !digits.startsWith('55') ? `55${digits}` : digits;
    const message = analysis?.customPitchWhatsApp;
    if (!full || typeof message !== 'string' || !message.trim()) return null;
    return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
  }

  // Task Handler 4: Landing Page Creation (generates HTML + optional local deploy)
  private async handleLandingPageCreation(job: Job) {
    const { leadId, concept, autoDeploy = false } = job.payload;

    this.addLog(job, `Iniciando criação de Landing Page para o lead "${leadId}".`, 'info');
    job.progress = 10;

    const lead = getLeadById(leadId);
    if (!lead) {
      throw new Error(`Lead "${leadId}" não encontrado. Crie e persista o lead antes de criar a Landing Page.`);
    }

    job.progress = 35;
    this.addLog(job, `Gerando HTML de conversão a partir do conceito...`, 'info');

    const lp = createLandingPageRecord(lead, concept, job.id);
    job.progress = 60;
    this.addLog(job, `Landing Page "${lp.slug}" gerada e em aguardo de aprovação.`, 'success');

    if (autoDeploy) {
      this.addLog(job, `Auto-deploy solicitado — aprovando e publicando...`, 'warning');
      const approved = approveLandingPage(lp.id);
      if (!approved) throw new Error(`Landing Page ${lp.id} não pôde ser aprovada antes do deploy.`);
      const deployed = await deployLandingPage(lp.id);
      if (!deployed?.url) throw new Error('O deploy foi concluído sem retornar uma URL pública.');
      this.addLog(job, `Landing Page publicada em ${deployed.url}.`, 'success');
    }

    const finalLp = getLandingPageById(lp.id);
    job.progress = 95;
    job.result = {
      landingPageId: lp.id,
      slug: lp.slug,
      status: finalLp?.status || lp.status,
      url: finalLp?.url || lp.url || null,
      previewUrl: `/landing-pages/${lp.slug}`,
    };
  }

  // Task Handler 5: Follow-up batch (recontatos autorizados)
  // Varre os leads cujo `next_contact_at` já venceu e NÃO envia nada:
  // produz apenas uma fila informativa que exige aprovação humana para o envio.
  private async handleFollowUpBatch(job: Job) {
    this.addLog(job, 'Verificando recontatos autorizados (prazo de recontato vencido)...', 'info');
    const due = getDueFollowUps();
    job.progress = 60;

    this.addLog(
      job,
      `${due.length} lead(s) com prazo de recontato vencido. Nenhuma mensagem será enviada sem aprovação humana.`,
      due.length > 0 ? 'info' : 'warning'
    );

    job.result = {
      totalDue: due.length,
      followUps: due.map((item) => ({
        interactionId: item.id,
        leadId: item.lead.id,
        name: item.lead.name,
        category: item.lead.category,
        city: item.lead.city,
        state: item.lead.state,
        phone: item.lead.phone,
        email: item.lead.email,
        channel: item.channel,
        outcome: item.outcome,
        lastContactAt: item.occurredAt,
        nextContactAt: item.nextContactAt,
        notes: item.notes,
      })),
    };
    job.progress = 95;
  }


}

// Global Singleton Queue Instance
export const queueManager = new QueueManager();
