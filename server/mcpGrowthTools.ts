import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getLeadById, getLeads, updateLeadSiteAudit, upsertLead } from "./store/db";
import { auditWebsite, normalizeSiteUrl } from "./services/siteAuditService";
import { rankLeads, refreshLeadPriority } from "./services/leadScoringService";
import { computeOutboundMetrics } from "./services/metricsService";
import { planCadence, runCadence } from "./services/cadenceService";
import { analyzeLead } from "./services/prospectingService";
import { effectiveWebsiteStatus, hasOwnWebsite } from "./services/presenceService";
import { researchLeadBrand } from "./services/brandResearchService";
import { buildClientProfile, renderClientProfileMarkdown } from "./services/clientProfileService";

/**
 * Superfície MCP de crescimento (as 4 alavancas extraídas do estudo de caso):
 *  1. `audit_lead_website`  — check-up real do site (o gancho da abordagem)
 *  2. `prioritize_leads`    — ordena a fila por dor, não por data
 *  3. `outbound_metrics`    — funil real (respostas, reuniões, fechamentos)
 *  4. `run_cadence`         — follow-up D3/D7 com ângulos diferentes
 *  5. `research_lead_brand` — identidade visual do lead (paleta/tom/logo)
 */

function ok(payload: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, ...payload }, null, 2) }] };
}

function fail(error: string, extra: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error, ...extra }, null, 2) }] };
}

export function registerGrowthTools(server: McpServer) {
  /* ---------------------------------------------------------------- */
  /* 1. audit_lead_website                                            */
  /* ---------------------------------------------------------------- */
  server.tool(
    "audit_lead_website",
    "Audita tecnicamente o site de um lead e devolve defeitos reais em linguagem de dono de negócio (velocidade, celular, HTTPS, WhatsApp, SEO, site fora do ar). Use ANTES de escrever a primeira mensagem: é o que diferencia 'quer um site?' de 'seu site demora 7s no celular'.",
    {
      leadId: z.string().optional().describe("ID do lead. Se informado, a auditoria é salva no lead."),
      url: z.string().optional().describe("URL do site (usa a do lead se omitida)."),
      generatePitch: z.boolean().optional().describe("Após auditar, regenerar os pitches da IA citando os defeitos (consome Gemini). Default: false"),
    },
    async ({ leadId, url, generatePitch }) => {
      try {
        const lead = leadId ? getLeadById(leadId) : undefined;
        if (leadId && !lead) return fail(`Lead "${leadId}" não encontrado.`);

        const targetUrl = url || lead?.websiteUrl;
        if (lead && !url && !hasOwnWebsite(lead)) {
          return fail(
            `O lead "${lead.name}" não tem site próprio (presença: ${effectiveWebsiteStatus(lead)}). Auditar link de marketplace/rede social não mede nada — o gancho correto é "sem site".`,
            { leadId: lead.id, websiteStatus: effectiveWebsiteStatus(lead) }
          );
        }
        if (!normalizeSiteUrl(targetUrl)) {
          return fail(
            lead
              ? `O lead "${lead.name}" não tem site válido (presença: ${lead.websiteStatus || "desconhecida"}). Se ele não tem site, o gancho é "sem_site" — use prioritize_leads.`
              : "Informe leadId ou url."
          );
        }

        const audit = await auditWebsite(targetUrl as string);

        if (!lead) {
          return ok({ persisted: false, audit });
        }

        updateLeadSiteAudit(lead.id, audit);
        const withAudit = { ...lead, siteAudit: audit, websiteUrl: lead.websiteUrl || targetUrl as string };
        const priority = refreshLeadPriority(withAudit);
        let updated = getLeadById(lead.id)!;

        let analysis = updated.analysis;
        if (generatePitch) {
          analysis = await analyzeLead({
            businessName: updated.name,
            category: updated.category || "Negócio local",
            city: updated.city || "",
            state: updated.state,
            address: updated.address,
            phone: updated.phone,
            rating: updated.rating,
            reviewsCount: updated.reviewsCount,
            websiteStatus: effectiveWebsiteStatus(updated),
            websiteUrl: updated.websiteUrl,
            siteAudit: audit,
          });
          updated = upsertLead({ ...updated, analysis });
        }

        return ok({
          persisted: true,
          leadId: lead.id,
          leadName: lead.name,
          audit,
          priority,
          pitch: generatePitch ? analysis : undefined,
          nextStep: audit.bullets.length
            ? `Aborde citando: ${audit.bullets.join(" | ")}`
            : "Site saudável: use o gancho de presença/Google, não o técnico.",
        });
      } catch (e: any) {
        return fail(e?.message || "Falha ao auditar o site.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 2. prioritize_leads                                              */
  /* ---------------------------------------------------------------- */
  server.tool(
    "prioritize_leads",
    "Ordena os leads por prioridade comercial (quem está com mais dor): sem site, site ruim, nota baixa, poucas avaliações. Use no lugar de listar por data — atacar os 20 piores primeiro rende mais que 200 iguais.",
    {
      status: z.string().optional().describe("Filtro por pipeline (prospect|contacted|negotiating|closed|declined)"),
      limit: z.number().int().min(1).max(200).optional().describe("Quantos leads retornar (default: 15)"),
      persist: z.boolean().optional().describe("Salvar o score calculado no banco. Default: false"),
    },
    async ({ status, limit, persist }) => {
      try {
        let leads = getLeads();
        if (status) leads = leads.filter((lead) => lead.pipelineStatus === status);
        const ranked = rankLeads(leads);
        const sliced = ranked.slice(0, limit ?? 15);

        if (persist) {
          for (const item of sliced) {
            refreshLeadPriority(item);
          }
        }

        return ok({
          count: sliced.length,
          total: leads.length,
          leads: sliced.map((item) => ({
            leadId: item.id,
            name: item.name,
            city: item.city,
            category: item.category,
            phone: item.phone,
            pipelineStatus: item.pipelineStatus,
            websiteStatus: item.websiteStatus,
            websiteUrl: item.websiteUrl,
            score: item.priority.score,
            level: item.priority.level,
            reasons: item.priority.reasons,
          })),
        });
      } catch (e: any) {
        return fail(e?.message || "Falha ao priorizar leads.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 3. outbound_metrics                                              */
  /* ---------------------------------------------------------------- */
  server.tool(
    "outbound_metrics",
    "Mostra o funil real de outbound: quantos leads foram abordados, quantos responderam (taxa de resposta), quantos viraram reunião e quantos fecharam — além de qual gancho (defeito) puxa mais resposta. Use para decidir o que repetir.",
    {
      since: z.string().optional().describe("Data ISO inicial (ex: '2026-10-01T00:00:00Z'). Omitir = desde o início."),
    },
    async ({ since }) => {
      try {
        return ok({ metrics: computeOutboundMetrics({ since }) });
      } catch (e: any) {
        return fail(e?.message || "Falha ao calcular métricas.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 4. run_cadence                                                   */
  /* ---------------------------------------------------------------- */
  server.tool(
    "run_cadence",
    "Follow-up D3/D7 para quem foi contatado e não respondeu. Cada toque usa um ângulo diferente (prova → prazo), para no primeiro sinal de conversa, respeita opt-out e tem teto diário. Padrão é simulação (dryRun=true): nada é enviado até você pedir explicitamente.",
    {
      dryRun: z.boolean().optional().describe("true (default) = apenas mostra o que enviaria. Para enviar de verdade, use false."),
      limit: z.number().int().min(1).max(100).optional().describe("Máximo de toques nesta execução"),
      leadIds: z.array(z.string()).optional().describe("Restringe a cadência a estes leads"),
    },
    async ({ dryRun, limit, leadIds }) => {
      try {
        if (dryRun === false) {
          const result = await runCadence({ dryRun: false, limit, leadIds });
          return ok({ mode: "envio", ...result });
        }
        const plan = planCadence({ limit, leadIds });
        return ok({
          mode: "simulacao",
          enabled: plan.enabled,
          cap: plan.cap,
          usedToday: plan.usedToday,
          remaining: plan.remaining,
          count: plan.candidates.length,
          candidates: plan.candidates.map((item) => ({
            leadId: item.lead.id,
            name: item.lead.name,
            phone: item.lead.phone,
            step: item.step.step,
            angle: item.step.angle,
            dueAt: item.dueAt,
            message: item.message,
          })),
          skipped: plan.skipped,
          hint: plan.enabled
            ? "Para enviar, chame novamente com dryRun=false."
            : "Cadência desligada em Automação (cadenceEnabled=false): só simulação até o operador ligar.",
        });
      } catch (e: any) {
        return fail(e?.message || "Falha ao executar a cadência.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 5. research_lead_brand                                           */
  /* ---------------------------------------------------------------- */
  server.tool(
    "research_lead_brand",
    "Pesquisa a identidade visual de um lead em imagens e perfis públicos (Instagram/Facebook/Google): paleta de cores, tom visual, tipografia provável, logo e referências. O resultado fica salvo no lead (brandSnapshot) e entra automaticamente no get_project_dev_kit. Consome 1-2 buscas SerpAPI + 1 chamada Gemini vision; roda só quando você pedir.",
    {
      leadId: z.string().describe("ID do lead"),
      force: z.boolean().optional().describe("Refaz a pesquisa mesmo que já exista um snapshot. Default: false (reaproveita o salvo, sem gastar cota)."),
      maxImages: z.number().int().min(1).max(10).optional().describe("Quantas imagens enviar para a IA (default: 6)"),
      includeProfiles: z.boolean().optional().describe("Procurar perfis no Google quando não aparecerem nas imagens. Default: true"),
    },
    async ({ leadId, force, maxImages, includeProfiles }) => {
      try {
        const result = await researchLeadBrand(leadId, { force, maxImages, includeProfiles });
        return ok({
          cached: result.cached,
          searchesUsed: result.searchesUsed,
          imagesAnalyzed: result.imagesAnalyzed,
          leadId: result.lead.id,
          leadName: result.lead.name,
          brandSnapshot: result.snapshot,
          nextStep: result.cached
            ? "Snapshot já existia. Use force=true para refazer a pesquisa."
            : "Use get_project_dev_kit para receber o snapshot junto do prompt de design.",
        });
      } catch (e: any) {
        return fail(e?.message || "Falha ao pesquisar a identidade visual do lead.");
      }
    }
  );

  /* ---------------------------------------------------------------- */
  /* 6. client_profile                                                */
  /* ---------------------------------------------------------------- */
  server.tool(
    "client_profile",
    "Monta (ou devolve) a FICHA DO CLIENTE em Markdown: identificação, endereço, conselho de classe (CRM/CRO/CREFITO) quando for da saúde, anos de experiência, formação, serviços/tratamentos, horário, convênios, provas sociais e identidade visual. Fontes: site do cliente + resultados do Google (incluindo o snippet da bio do Instagram) — nada é inventado, o que falta vai em 'gaps'. É a base da primeira versão do site. Consome até 3 buscas SerpAPI + 1 chamada Gemini; fica salva no lead e em data/clientes/<slug>.md.",
    {
      leadId: z.string().describe("ID do lead"),
      force: z.boolean().optional().describe("Refaz a ficha mesmo que já exista. Default: false (reaproveita a salva, sem gastar cota)."),
      maxSearches: z.number().int().min(1).max(4).optional().describe("Máximo de buscas no Google (default: 3)"),
      includeBrand: z.boolean().optional().describe("Rodar a pesquisa visual quando ainda não houver snapshot de marca. Default: true"),
    },
    async ({ leadId, force, maxSearches, includeBrand }) => {
      try {
        const result = await buildClientProfile(leadId, { force, maxSearches, includeBrand });
        return ok({
          cached: result.cached,
          searchesUsed: result.searchesUsed,
          leadId: result.lead.id,
          leadName: result.lead.name,
          markdownPath: result.profile.files?.markdown || result.markdownPath,
          siteCopy: result.profile.files?.siteCopy || null,
          confidence: result.profile.confidence,
          gaps: result.profile.gaps,
          profile: result.profile,
          markdown: renderClientProfileMarkdown(result.profile),
        });
      } catch (e: any) {
        return fail(e?.message || "Falha ao montar a ficha do cliente.");
      }
    }
  );
}
