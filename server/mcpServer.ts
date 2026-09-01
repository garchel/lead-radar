import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { Express, Request, Response } from "express";

import { queueManager } from "./jobs/queueManager";
import { getLeadById, upsertLead, getLeads, upsertSchedule, getPipelineSummary, getDueFollowUps, ensureCitiesLoaded, pickNextCities, getColdLeads } from "./store/db";
import { CronPattern } from "croner";
import { scheduler } from "./scheduler/scheduler";
import { buildLeadDossier } from "./dossier/dossier";
import { StoredLead, PipelineStatus } from "./store/types";
import { enrichLead } from "./enrichment";
import { dispatchLeadContact, recordInteractionOutcome } from "./services/interactionService";
import { searchBusinesses, analyzeLead } from "./services/prospectingService";
import { syncLeadProject, updateProject } from "./projects/service";
import { getProjects, getProjectById } from "./store/db";
import type { Project } from "./store/types";
import { syncTypeformBriefing } from "./typeform/service";
import {
  buildProjectDevKit,
  buildProjectDevPrompt,
  submitProjectCode,
  approveProjectCode,
} from "./projects/devKit";


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
      location: z.string().min(1).describe("Nome obrigatório da cidade alvo (ex: 'Campinas')"),
      state: z.string().regex(/^[A-Za-z]{2}$/).describe("UF obrigatória (ex: 'SP', 'RJ')"),
      category: z.string().min(1).describe("Categoria obrigatória de negócio"),
      presenceFilter: z.enum(["all", "gold", "silver"]).describe("Filtro digital obrigatório: 'gold' (sem site), 'silver' (apenas instagram) ou 'all'"),
    },
    async ({ location, state, category, presenceFilter }) => {
      try {
        const { businesses } = await searchBusinesses({ location, state, category, filterNoWebsiteOnly: true });
        let leads = businesses;
        if (presenceFilter === "gold") leads = leads.filter((b: any) => b.websiteStatus === "none");
        if (presenceFilter === "silver") leads = leads.filter((b: any) => b.websiteStatus === "social_only");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ source: "gemini", count: leads.length, location, state, category, leads }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: err?.message || "Falha ao buscar empresas reais." }, null, 2),
            },
          ],
        };
      }
    }
  );

  // TOOL 2: analyze_lead
  server.tool(
    "analyze_lead",
    "Gera diagnóstico profundo com IA para um lead, entregando argumentos de vendas, falhas identificadas e pitches prontos.",
    {
      businessName: z.string().describe("Nome da empresa"),
      category: z.string().min(1).describe("Categoria obrigatória do estabelecimento"),
      city: z.string().min(1).describe("Cidade obrigatória"),
      phone: z.string().optional().describe("Telefone ou WhatsApp real, quando disponível"),
      rating: z.number().optional().describe("Nota real no Google Maps, quando disponível"),
      reviewsCount: z.number().int().nonnegative().optional().describe("Quantidade real de avaliações, quando disponível"),
    },
    async ({ businessName, category, city, phone, rating, reviewsCount }) => {
      try {
        const analysis = await analyzeLead({ businessName, category, city, phone, rating, reviewsCount });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(analysis, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: false, error: err?.message || "Falha ao gerar o diagnóstico por IA." }, null, 2),
            },
          ],
        };
      }
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
      if (cleanPhone.length < 10) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Telefone inválido: informe DDD e número reais." }, null, 2) }] };
      }
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
    "Atualiza o estágio do lead no Pipeline do Mini-CRM (Novo, Contatado, Proposta Enviada, Em Negociação, Em Desenvolvimento, Finalizado, Recusado).",
    {
      leadId: z.string().describe("ID do lead"),
      businessName: z.string().describe("Nome do lead"),
      status: z.enum(["novo", "contatado", "proposta_enviada", "em_negociacao", "em_desenvolvimento", "finalizado", "recusado"]).describe("Novo estágio no funil"),
      notes: z.string().optional().describe("Anotação adicional sobre a interação"),
    },
    async ({ leadId, businessName, status, notes }) => {
      // Map MCP status (PT-BR funnel) to internal store status
      const STATUS_MAP: Record<string, PipelineStatus> = {
        novo: "prospect",
        contatado: "contacted",
        proposta_enviada: "negotiating",
        em_negociacao: "negotiating",
        em_desenvolvimento: "em_desenvolvimento",
        finalizado: "closed",
        recusado: "declined",
      };
      const pipelineStatus: PipelineStatus = STATUS_MAP[status] || "prospect";
      const now = new Date().toISOString();

      const existing = getLeadById(leadId);
      let saved: StoredLead;
      if (existing) {
        saved = upsertLead({ ...existing, pipelineStatus, notes: notes || existing.notes, updatedAt: now });
      } else {
        if (!businessName?.trim()) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Lead não encontrado; businessName é obrigatório para criar o registro." }, null, 2) }] };
        }
        saved = upsertLead({
          id: leadId,
          name: businessName.trim(),
          pipelineStatus,
          notes,
          savedAt: now,
          updatedAt: now,
        } as StoredLead);
      }

      // Mantém o Kanban de Projetos sincronizado com o pipeline do lead.
      syncLeadProject(saved);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              leadId,
              businessName,
              newStatus: status,
              updatedAt: now,
              notes: notes || "Status atualizado via Agente MCP",
            }, null, 2),
          },
        ],
      };
    }
  );

  // TOOL 4.5: send_contact
  server.tool(
    "send_contact",
    "Envia uma mensagem de contato a um lead (WhatsApp ou e-mail). Sem provedor configurado, registra a falha sem simular o envio.",
    {
      leadId: z.string().describe("ID do lead"),
      channel: z.enum(["whatsapp", "email"]).optional().describe("Canal preferido (default: WhatsApp se houver telefone)"),
      message: z.string().optional().describe("Texto da mensagem (default: pitch gerado por IA)"),
      subject: z.string().optional().describe("Assunto (somente e-mail)"),
    },
    async ({ leadId, channel, message, subject }) => {
      const lead = getLeadById(leadId);
      if (!lead) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Lead não encontrado." }, null, 2) }] };
      }
      try {
        const result = await dispatchLeadContact(lead, { channel, message, subject });
        if (result.blocked || result.status !== "sent") {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ success: false, error: result.detail, ...result }, null, 2),
            }],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e?.message || "Falha no envio." }, null, 2) }] };
      }
    }
  );

  // TOOL 4.6: record_interaction_outcome
  server.tool(
    "record_interaction_outcome",
    "Registra a resposta de uma empresa e calcula a próxima janela de contato. Recusa negativa libera novo contato após 30 dias; pedido para não contatar bloqueia permanentemente.",
    {
      leadId: z.string().describe("ID do lead"),
      outcome: z.enum(["no_response", "negative", "positive", "meeting_scheduled", "negotiating", "do_not_contact"]),
      interactionId: z.string().optional().describe("ID da interação, quando não for a mais recente pendente"),
      notes: z.string().optional().describe("Observação sobre a resposta"),
    },
    async ({ leadId, outcome, interactionId, notes }) => {
      try {
        const result = recordInteractionOutcome(leadId, outcome, { interactionId, notes });
        return { content: [{ type: "text", text: JSON.stringify({ success: true, ...result }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e?.message || "Falha ao registrar a interação." }, null, 2) }] };
      }
    }
  );

  // TOOL 4.7: list_due_followups
  server.tool(
    "list_due_followups",
    "Lista leads cujo prazo de recontato já chegou e que não solicitaram bloqueio permanente.",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify({ success: true, followUps: getDueFollowUps() }, null, 2) }],
    })
  );

  // TOOL 5: create_lead
  server.tool(
    "create_lead",
    "Cria ou atualiza um lead no banco compartilhado do LeadRadar (fonte da verdade para a UI e o Hermes).",
    {
      id: z.string().describe("ID único do lead"),
      name: z.string().describe("Nome da empresa"),
      category: z.string().optional().describe("Categoria comercial"),
      city: z.string().optional().describe("Cidade"),
      state: z.string().optional().describe("UF"),
      phone: z.string().optional().describe("Telefone / WhatsApp"),
      email: z.string().email().optional().describe("E-mail da empresa"),
      cnpj: z.string().optional().describe("CNPJ"),
      googlePlaceId: z.string().optional().describe("ID estável do Google Places"),
      websiteUrl: z.string().url().optional().describe("URL do site"),
      websiteStatus: z.enum(["none", "social_only", "has_website"]).optional().describe("Presença digital"),
      notes: z.string().optional().describe("Observações"),
    },
    async ({ id, name, category, city, state, phone, email, cnpj, googlePlaceId, websiteUrl, websiteStatus, notes }) => {
      const existing = getLeadById(id);
      const now = new Date().toISOString();
      upsertLead({
        id,
        name,
        category,
        city,
        state,
        phone,
        email,
        cnpj,
        googlePlaceId,
        websiteUrl,
        websiteStatus,
        notes,
        pipelineStatus: existing?.pipelineStatus || "prospect",
        savedAt: existing?.savedAt || now,
        updatedAt: now,
      } as StoredLead);
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, leadId: id, name }, null, 2) }],
      };
    }
  );

  // TOOL 6: list_leads
  server.tool(
    "list_leads",
    "Lista os leads armazenados no banco compartilhado.",
    {
      status: z.string().optional().describe("Filtro opcional por status (prospect|contacted|negotiating|closed|declined)"),
    },
    async ({ status }) => {
      const leads = status ? getLeads().filter((l) => l.pipelineStatus === status) : getLeads();
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, count: leads.length, leads }, null, 2) }],
      };
    }
  );

  // TOOL 6.1: list_projects
  server.tool(
    "list_projects",
    "Lista os projetos do Kanban de desenvolvimento com id, etapa, status, lead vinculado e progresso do checklist. Use para descobrir o projectId de um lead (ex.: para depois chamar get_project_dev_kit ou update_project).",
    {
      status: z.string().optional().describe("Filtro opcional por status do projeto (em_andamento|pausado|cancelado|concluido)"),
      stage: z.string().optional().describe("Filtro opcional por etapa (briefing|copywriting|design|desenvolvimento|revisao|deploy)"),
      leadId: z.string().optional().describe("Filtro opcional por lead vinculado"),
    },
    async ({ status, stage, leadId }) => {
      let projects = getProjects();
      if (status) projects = projects.filter((p) => p.status === status);
      if (stage) projects = projects.filter((p) => p.stage === stage);
      if (leadId) projects = projects.filter((p) => p.leadId === leadId);
      const list = projects.map((p) => ({
        projectId: p.id,
        name: p.name,
        type: p.type,
        stage: p.stage,
        status: p.status,
        priority: p.priority,
        devStatus: p.devStatus ?? "aguardando_agente",
        leadId: p.leadId,
        leadName: p.leadName ?? null,
        leadCity: p.leadCity ?? null,
        dueDate: p.dueDate ?? null,
        tasksDone: (p.tasks ?? []).filter((t) => t.done).length,
        tasksTotal: (p.tasks ?? []).length,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, count: list.length, projects: list }, null, 2) }],
      };
    }
  );

  // TOOL 6.2: update_project
  server.tool(
    "update_project",
    "Atualiza um projeto do Kanban: move a etapa (briefing→copywriting→design→desenvolvimento→revisao→deploy), grava briefing do cliente (texto livre ou campos estruturados), copy, notas de design/dev/revisão, status, prioridade e URL de deploy. É o caminho do agente para alimentar o projeto com o briefing colado pelo cliente no chat.",
    {
      projectId: z.string().describe("ID do projeto"),
      stage: z.enum(["briefing", "copywriting", "design", "desenvolvimento", "revisao", "deploy"]).optional().describe("Nova etapa do projeto"),
      status: z.enum(["em_andamento", "pausado", "cancelado", "concluido"]).optional().describe("Novo status do projeto"),
      priority: z.enum(["baixa", "media", "alta"]).optional().describe("Nova prioridade"),
      brief: z.string().optional().describe("Briefing em texto livre colado pelo cliente (append; registra origem e data)"),
      briefing: z.array(z.object({ fieldTitle: z.string(), answer: z.string() })).optional().describe("Campos estruturados do briefing (substitui os atuais)"),
      copy: z.string().optional().describe("Texto/copy da página (etapa copywriting)"),
      designNotes: z.string().optional().describe("Notas de design (paleta, tipografia, referências)"),
      devNotes: z.string().optional().describe("Notas de desenvolvimento"),
      reviewNotes: z.string().optional().describe("Notas de revisão do cliente"),
      deployUrl: z.string().optional().describe("URL final publicada"),
      dueDate: z.string().optional().describe("Prazo (data ISO ou texto)"),
    },
    async (input) => {
      try {
        const { projectId, brief, ...rest } = input;
        const patch: Partial<Project> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) (patch as any)[key] = value;
        }
        // Briefing em texto livre: append com origem/data (não sobrescreve histórico)
        if (brief !== undefined) {
          if (typeof brief !== "string" || !brief.trim()) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "brief deve ser um texto não vazio." }, null, 2) }] };
          }
          const project = getProjectById(projectId);
          if (!project) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Projeto não encontrado." }, null, 2) }] };
          }
          const stamp = new Date().toISOString();
          const block = `Briefing manual (agente, ${stamp})\n${brief.trim()}`;
          patch.brief = project.brief ? `${project.brief}\n\n${block}` : block;
        }
        if (Object.keys(patch).length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Nada para atualizar: informe ao menos um campo." }, null, 2) }] };
        }
        const updated = updateProject(projectId, patch);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  projectId,
                  stage: updated.stage,
                  status: updated.status,
                  priority: updated.priority,
                  briefPreview: updated.brief ? updated.brief.slice(0, 200) : null,
                  briefingFields: (updated.briefing ?? []).length,
                  hasCopy: Boolean(updated.copy?.trim()),
                  hasDesignNotes: Boolean(updated.designNotes?.trim()),
                  updatedAt: updated.updatedAt,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err?.message || "Falha ao atualizar projeto." }, null, 2) }] };
      }
    }
  );

  // TOOL 12: get_project_dev_kit
  server.tool(
    "get_project_dev_kit",
    "Entrega o 'kit de dados' do projeto (lead + briefing/Typeform + copy + design + conceito de IA + repositório) e o prompt pronto para implementar a Landing Page do zero no GitHub. Use para obter todas as informações necessárias a codar o site.",
    { projectId: z.string().describe("ID do projeto") },
    async ({ projectId }) => {
      try {
        const kit = buildProjectDevKit(projectId);
        const prompt = buildProjectDevPrompt(projectId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  projectId,
                  type: kit.typeLabel,
                  project: {
                    name: kit.project.name,
                    stage: kit.project.stage,
                    devStatus: kit.project.devStatus || "aguardando_agente",
                    repo: kit.repo,
                    previewUrl: kit.project.previewUrl || null,
                  },
                  lead: kit.lead
                    ? {
                        name: kit.lead.name,
                        category: kit.lead.category ?? null,
                        city: kit.lead.city ?? null,
                        phone: kit.lead.phone ?? null,
                        rating: kit.lead.rating ?? null,
                        reviewsCount: kit.lead.reviewsCount ?? null,
                        instagramHandle: kit.lead.instagramHandle ?? null,
                        websiteUrl: kit.lead.websiteUrl ?? null,
                        keyInsights: kit.lead.keyInsights || [],
                      }
                    : null,
                  briefing: kit.briefing,
                  copy: kit.project.copy || "",
                  designNotes: kit.project.designNotes || "",
                  devNotes: kit.project.devNotes || "",
                  landingPageConcept: kit.landingPageConcept || null,
                  prompt,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err?.message || "Projeto não encontrado." }, null, 2) }] };
      }
    }
  );

  // TOOL 13: submit_project_code
  server.tool(
    "submit_project_code",
    "Confirma ao LeadRadar que o agente de IA entregou o código da Landing Page no repositório GitHub, opcionalmente com a URL de preview. Marca o projeto como 'codigo_entregue' aguardando a revisão/aprovação humana.",
    {
      projectId: z.string().describe("ID do projeto"),
      repoUrl: z.string().optional().describe("URL do repositório GitHub (ex.: https://github.com/org/repo)"),
      previewUrl: z.string().optional().describe("URL temporária / GitHub Pages do preview"),
      message: z.string().optional().describe("Mensagem resumo de entrega (também usada para notificação)"),
    },
    async ({ projectId, repoUrl, previewUrl, message }) => {
      try {
        const project = submitProjectCode(projectId, { repoUrl, previewUrl, message });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  projectId,
                  devStatus: project.devStatus,
                  repo: project.githubRepoUrl ?? null,
                  previewUrl: project.previewUrl ?? null,
                  message: project.devMessage ?? null,
                  note: "Código registrado. Um humano ainda precisa aprovar antes de avançar para revisão/deploy.",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err?.message || "Falha ao registrar entrega do código." }, null, 2) }] };
      }
    }
  );

  // TOOL 14: approve-project (humano) — via MCP, marca aprovado.
  server.tool(
    "approve_project_code",
    "Guarda-limite humano: aprova o código entregue pelo agente. O projeto segue para revisão/deploy somente após esta aprovação.",
    { projectId: z.string().describe("ID do projeto") },
    async ({ projectId }) => {
      try {
        const project = approveProjectCode(projectId);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, projectId, devStatus: project.devStatus }, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err?.message || "Projeto não encontrado." }, null, 2) }] };
      }
    }
  );

  // TOOL 12: enrich_lead
  server.tool(
    "enrich_lead",
    "Enriquece um lead existente com dados de Google Places, BrasilAPI (CNPJ) e Hunter.io (e-mail).",
    { leadId: z.string().describe("ID do lead a ser enriquecido") },
    async ({ leadId }) => {
      const lead = getLeadById(leadId);
      if (!lead) return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Lead não encontrado" }, null, 2) }] };

      try {
        const result = await enrichLead(lead);
        return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: result.enriched,
              enriched: result.enriched,
              fields: result.fields,
              ...(result.enriched
                ? { message: `Lead enriquecido com: ${result.fields.join(', ')}` }
                : { error: "Nenhum campo novo foi encontrado; o lead não foi enriquecido." }),
            }, null, 2),
          },
        ],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e?.message || "Falha no enriquecimento." }, null, 2) }] };
      }
    }
  );

  // TOOL 13: sync_typeform_briefing
  server.tool(
    "sync_typeform_briefing",
    "Importa as respostas do formulário de briefing do Typeform (Responses API) e grava o briefing no projeto correspondente. Idempotente: cada resposta é importada uma única vez.",
    { formId: z.string().optional().describe("ID do formulário Typeform (opcional; usa TYPEFORM_FORM_ID por padrão)") },
    async ({ formId }) => {
      try {
        const summary = await syncTypeformBriefing({ formId });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(summary, null, 2),
            },
          ],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e?.message || "Falha ao sincronizar o Typeform" }, null, 2) }] };
      }
    }
  );

  // TOOL 14: queue_batch_prospecting
  server.tool(
    "queue_batch_prospecting",
    "Enfileira uma tarefa assíncrona de prospecção em lote para várias cidades ou categorias sem bloquear o agente.",
    {
      title: z.string().min(1).describe("Título obrigatório do Job"),
      locations: z.array(z.string().min(1)).min(1).describe("Lista obrigatória de cidades a escanear"),
      state: z.string().regex(/^[A-Za-z]{2}$/).describe("UF obrigatória"),
      categories: z.array(z.string().min(1)).min(1).describe("Lista obrigatória de categorias"),
      filterNoWebsiteOnly: z.boolean().describe("Filtrar apenas sem site / redes sociais"),
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

  // TOOL 14: schedule_prospecting
  server.tool(
    "schedule_prospecting",
    "Agenda prospecção periódica (cron). Cria um agendamento persistido no banco compartilhado que dispara Jobs de autopilot ou batch recorrentemente, respeitando o limite de LPs/dia.",
    {
      name: z.string().describe("Nome identificador do agendamento"),
      cron: z.string().describe("Expressão cron (5 ou 6 partes, ex: '0 9 * * 1-5')"),
      jobType: z.enum(["mcp_autopilot", "batch_prospecting", "follow_up_reminder"]).describe("Tipo de job a disparar (follow_up_reminder apenas lista recontatos autorizados; não envia)"),
      location: z.string().optional().describe("Cidade alvo (autopilot)"),
      state: z.string().optional().describe("Sigla da UF"),
      category: z.string().optional().describe("Categoria de negócio (autopilot)"),
      locations: z.array(z.string()).optional().describe("Cidades (batch_prospecting)"),
      categories: z.array(z.string()).optional().describe("Categorias (batch_prospecting)"),
      maxLeads: z.number().optional().describe("Limite de leads por execução"),
    },
    async ({ name, cron, jobType, location, state, category, locations, categories, maxLeads }) => {
      try {
        new CronPattern(cron);
      } catch {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `Expressão cron inválida: ${cron}` }, null, 2) }] };
      }

      let payload;
      if (jobType === "follow_up_reminder") {
        payload = {};
      } else {
        if (!state || !/^[A-Za-z]{2}$/.test(state)) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "UF é obrigatória e deve ter 2 letras." }, null, 2) }] };
        }
        if (jobType === "batch_prospecting") {
          if (!locations?.length || !categories?.length) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Batch exige locations e categories não vazios." }, null, 2) }] };
          }
          payload = { locations, state: state.toUpperCase(), categories, filterNoWebsiteOnly: true };
        } else {
          if (!location?.trim() || !category?.trim() || !Number.isInteger(maxLeads) || maxLeads <= 0) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Autopilot exige location, category e maxLeads inteiro maior que zero." }, null, 2) }] };
          }
          payload = {
            location: location.trim(),
            state: state.toUpperCase(),
            category: category.trim(),
            autoEnrich: true,
            sendPitches: false,
            maxLeads,
          };
        }
      }

      const schedule = upsertSchedule({
        id: `sch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name,
        cron,
        jobType,
        payload,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      scheduler.reloadOne(schedule.id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, message: `Agendamento "${name}" criado (${cron}).`, schedule }, null, 2),
          },
        ],
      };
    }
  );

  // TOOL 15: export_dossier
  server.tool(
    "export_dossier",
    "Gera o Dossiê Executivo (HTML, pronto para impressão/PDF) de um lead a partir do diagnóstico de IA persistido.",
    { leadId: z.string().describe("ID do lead") },
    async ({ leadId }) => {
      const lead = getLeadById(leadId);
      if (!lead) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Lead não encontrado" }, null, 2) }] };
      }
      const html = buildLeadDossier(lead);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, leadId, mimeType: "text/html", html }, null, 2),
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

  // TOOL: get_next_cities — fila round-robin da base IBGE
  server.tool(
    "get_next_cities",
    "Retorna as próximas cidades da fila de rotação (round-robin da base IBGE, 5.571 municípios) há mais tempo sem busca, com tier de mercado por PIB per capita.",
    {
      n: z.number().int().min(1).max(50).optional().describe("Quantas cidades retornar (default 5)"),
      uf: z.string().regex(/^[A-Za-z]{2}$/).optional().describe("Filtrar por UF (ex: 'GO')"),
      minPopulation: z.number().int().optional().describe("População mínima (ex: 30000)"),
      maxPopulation: z.number().int().optional().describe("População máxima (ex: 200000)"),
      minTier: z.enum(["A", "B", "C", "D"]).optional().describe("Tier mínimo de mercado (PIB per capita): A ≥80k, B ≥45k, C ≥25k, D <25k"),
    },
    async ({ n = 5, uf, minPopulation, maxPopulation, minTier }) => {
      try {
        ensureCitiesLoaded();
        const tiersOrder = ["D", "C", "B", "A"];
        const maxTierIdx = minTier ? tiersOrder.indexOf(minTier) : 3;
        let cities = pickNextCities(Math.min(50, n * 3), { uf, minPopulation, maxPopulation });
        if (minTier) cities = cities.filter((c) => tiersOrder.indexOf(c.marketTier) >= maxTierIdx);
        const next = cities.slice(0, n);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, count: next.length, next }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err?.message || "Falha na fila de cidades." }, null, 2) }],
        };
      }
    }
  );

  // TOOL: search_city — busca leads em uma cidade com ticket sugerido e scoring combinado
  server.tool(
    "search_city",
    "Busca empresas reais numa cidade via SerpAPI (Google Maps), retorna leads com score combinado (propensão da categoria + tier da cidade + contato), ticket sugerido em R$ e flag de já cadastrado. Não salva no CRM.",
    {
      location: z.string().min(1).describe("Nome da cidade (ex: 'Anápolis')"),
      state: z.string().regex(/^[A-Za-z]{2}$/).describe("UF (ex: 'GO')"),
      category: z.string().min(1).describe("Categoria de negócio (ex: 'Clínica Odontológica')"),
      onlyNew: z.boolean().optional().describe("Se true, oculta empresas já cadastradas no CRM (default true)"),
    },
    async ({ location, state, category, onlyNew = true }) => {
      try {
        const result = await searchBusinesses({
          location,
          state: state.toUpperCase(),
          category,
          filterNoWebsiteOnly: false,
          provider: "serpapi",
        });
        let businesses = result.businesses;
        if (onlyNew) businesses = businesses.filter((b: any) => !b.isAlreadySaved);
        const summary = businesses.map((b: any) => ({
          name: b.name,
          phone: b.phone,
          websiteStatus: b.websiteStatus,
          rating: b.rating,
          opportunityScore: b.opportunityScore,
          suggestedTicket: b.suggestedTicket ? `R$ ${b.suggestedTicket}` : undefined,
          marketTier: b.marketTier,
          alreadyInCrm: Boolean(b.isAlreadySaved),
        }));
        summary.sort((a: any, b: any) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, cached: result.cached ?? false, count: summary.length, location, state, category, leads: summary }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err?.message || "Falha na busca." }, null, 2) }],
        };
      }
    }
  );

  // TOOL: pipeline_status — resumo do CRM
  server.tool(
    "pipeline_status",
    "Resumo do CRM: leads por etapa do pipeline, valor potencial total e follow-ups pendentes.",
    {},
    async () => {
      try {
        const pipeline = getPipelineSummary() as any;
        const dueFollowUps = getDueFollowUps();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, pipeline, dueFollowUpsCount: dueFollowUps.length, dueFollowUps: dueFollowUps.slice(0, 10) }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err?.message || "Falha no status do pipeline." }, null, 2) }],
        };
      }
    }
  );

  // TOOL: cold_leads — revisão de leads frios
  server.tool(
    "cold_leads",
    "Lista leads contactados/negociando sem resposta há N+ dias, ordenados pelos mais frios. Não envia mensagens.",
    {
      minDays: z.number().int().min(1).optional().describe("Dias sem resposta para considerar frio (default 14)"),
      limit: z.number().int().min(1).max(200).optional().describe("Máximo de leads retornados (default 50)"),
    },
    async ({ minDays = 14, limit = 50 }) => {
      try {
        const cold = getColdLeads(minDays, limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                count: cold.length,
                leads: cold.map((l) => ({
                  leadId: l.id, name: l.name, city: l.city, state: l.state,
                  phone: l.phone, pipelineStatus: l.pipelineStatus, daysSinceContact: l.daysSinceContact,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: err?.message || "Falha ao listar leads frios." }, null, 2) }],
        };
      }
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
            text: JSON.stringify({ pipelineSummary: getPipelineSummary() }, null, 2),
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
      location: z.string().min(1).describe("Cidade obrigatória para prospeção"),
      category: z.string().min(1).describe("Categoria obrigatória de negócio"),
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
  // Optional token auth guard (production). Requires MCP_API_TOKEN to be set.
  function isAuthorized(req: Request): boolean {
    const token = process.env.MCP_API_TOKEN;
    if (!token) return true; // auth disabled
    const header = req.headers.authorization || "";
    if (header === `Bearer ${token}`) return true;
    if (req.query.token === token) return true;
    return false;
  }

  // Metadata & Integration guide endpoint
  app.get("/api/mcp/info", (req: Request, res: Response) => {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Não autorizado. Forneça um token MCP válido." });
    }
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
        { name: "update_crm_status", description: "Atualiza estagio no Funil de Vendas do Mini-CRM (persiste no banco)." },
        { name: "create_lead", description: "Cria/atualiza um lead no banco compartilhado." },
        { name: "list_leads", description: "Lista os leads armazenados no banco." },
        { name: "enrich_lead", description: "Enriquece um lead com dados reais (Google Places, CNPJ, e-mail)." },
        { name: "send_contact", description: "Envia mensagem de contato ao lead e aplica a política anti-duplicidade." },
        { name: "record_interaction_outcome", description: "Registra a resposta da empresa e calcula a próxima janela de contato." },
        { name: "list_due_followups", description: "Lista os recontatos cujo prazo já chegou." },
        { name: "schedule_prospecting", description: "Agenda prospecção periódica via cron (autopilot, batch ou follow_up_reminder)." },
        { name: "export_dossier", description: "Gera o Dossiê Executivo HTML de um lead a partir da análise persistida." },
        { name: "sync_typeform_briefing", description: "Importa respostas do formulário de briefing do Typeform nos projetos." },
        { name: "get_project_dev_kit", description: "Entrega o kit de dados + prompt do projeto para o agente de IA de código." },
        { name: "submit_project_code", description: "Agente informa que o código foi entregue (repo + preview) — aguarda aprovação humana." },
        { name: "approve_project_code", description: "Guarda-limite humano: aprova o código entregue pelo agente." },

      ],
      resources: ["leads://categories", "leads://pipeline", "leads://queue_status"],
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
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Não autorizado. Forneça um token MCP válido." });
    }
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
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: "Não autorizado. Forneça um token MCP válido." });
    }
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId query parameter required" });
    }

    const transport = activeTransports.get(sessionId);
    if (!transport) {
      return res.status(404).json({ error: "Sessão MCP não encontrada ou expirada" });
    }

    // O express.json() global (server.ts) já consome o body do request.
    // handlePostMessage leria o stream de novo e falharia com "stream is not readable".
    // Passamos o body já parseado (req.body) para que ele não tente reler o stream.
    const parsedBody = (req as any).body && typeof (req as any).body === "object"
      ? (req as any).body
      : undefined;
    await transport.handlePostMessage(req, res, parsedBody);
  });
}
