import { getProjectById, getLeadById } from "../store/db";
import { Project, StoredLead } from "../store/types";

/* ------------------------------------------------------------------ */
/*  Guia/Runbook do Agente de Execução.                               */
/*                                                                    */
/*  Objetivo: um bot Hermes spwanado por projeto NUNCA precisa ler a  */
/*  codebase do LeadRadar. No primeiro passo ele chama a tool MCP     */
/*  `get_agent_runbook` (ou o endpoint /agent-runbook) e recebe:      */
/*   1. explicação rápida de como o app funciona;                    */
/*   2. estado fresco do projeto;                                     */
/*   3. passo a passo da etapa atual com as tools MCP;                */
/*   4. regras de ouro (guarda-limite humano, LGPD etc.);             */
/*   5. prompt de spawn pronto (o operador cola no novo chat).        */
/* ------------------------------------------------------------------ */

/** Visão geral do app — igual para todos os projetos. */
export const APP_OVERVIEW = {
  nome: "LeadRadar (LeadFinder Pro)",
  oQueFaz:
    "CRM B2B para vender Landing Pages: mapeia negócios locais (Google Maps via SerpAPI), qualifica com IA (Gemini), gestiona o pipeline de vendas e acompanha a produção do site até o deploy.",
  fluxoDeTrabalho: [
    "Prospecção: busca por cidade/categoria (SerpAPI) → leads pontuados (score, tier de mercado, ticket sugerido)",
    "CRM: lead anda no pipeline (novo → contatado → negociação → em_desenvolvimento → closed)",
    "Projeto: ao entrar em 'em_desenvolvimento', um projeto é criado no Kanban com 7 etapas",
    "Kanban: briefing → copywriting → design → wireframe → desenvolvimento → revisao → deploy",
    "Wireframe: após o copy e o design, o agente monta a estrutura da página (fundo preto OU branco — o oposto da cor da fonte do guia de design) com os textos reais posicionados e componentes/assets em blocos de linha pontilhada, para o cliente revisar copy/estrutura ANTES de codar",
    "Desenvolvimento: um agente de IA (você) recebe o dev kit e constrói o site num repo GitHub",
    "Guarda-limite humano: o código só avança para revisão/deploy após aprovação de um humano na UI",
  ],
  modeloDeDados: [
    "Lead: id, name, phone, city/state, category, pipelineStatus — mora no banco compartilhado",
    "Project: id, leadId, stage (7 etapas), status, brief/briefing (cliente), copy, designNotes, wireframeUrl, devNotes, githubRepoUrl, previewUrl, deployUrl",
    "devStatus (etapa desenvolvimento): aguardando_agente → em_desenvolvimento → codigo_entregue → aprovado",
  ],
};

/** Ferramentas MCP que o agente de execução usa (nome → para quê serve). */
export const AGENT_TOOLS: Array<{ tool: string; uso: string }> = [
  { tool: "get_agent_runbook", uso: "ESTE guia: app + estado do projeto + passo a passo. Chame primeiro." },
  { tool: "list_projects", uso: "Localizar projetos e estado (filtros: status, stage, leadId)." },
  { tool: "update_project", uso: "Mover etapa, gravar briefing do cliente, copy, designNotes, devNotes, deployUrl." },
  { tool: "get_project_dev_kit", uso: "Kit completo para codar: lead + briefing + copy + design + prompt pronto." },
  { tool: "submit_project_code", uso: "Registrar entrega do código (repoUrl, previewUrl) — marca codigo_entregue." },
  { tool: "list_leads", uso: "Contexto do cliente (nome, telefone, cidade, categoria)." },
];

/** Regras de ouro — guardrails que o bot DEVE respeitar. */
export const AGENT_RULES: string[] = [
  "NUNCA chame approve_project_code: a aprovação do código é um guarda-limite HUMANO (feita na UI).",
  "NÃO envie mensagens reais ao cliente (send_contact/WhatsApp) sem autorização explícita do operador.",
  "NÃO mexa no pipeline do lead durante o projeto: ele já está em 'em_desenvolvimento'; ao concluir o projeto (status concluido) o lead vai para 'closed' automaticamente.",
  "Registre TUDO que produzir no projeto (copy, designNotes, devNotes, briefing) — o histórico precisa persistir para humanos e próximos agentes.",
  "NÃO invente dados do cliente: use apenas o que estiver no briefing/dev kit. Faltando algo, pergunte ao operador.",
  "NÃO leia a codebase do LeadRadar nem acesse o banco diretamente: toda interação é via tools MCP.",
  "Ao terminar a etapa, reporte: etapa alcançada, o que gravou, e o que precisa de ação humana.",
];

interface StageStep {
  etapa: string;
  objetivo: string;
  acoes: string[];
}

/** Passo a passo por etapa (pt-BR, com os nomes das tools). */
function buildStageRunbook(stage: Project["stage"], project: Project): StageStep[] {
  const idx = STAGE_ORDER.indexOf(stage);
  // devolve a etapa atual + as seguintes (o bot executa a atual; as seguintes são contexto)
  return STAGE_RUNBOOK.filter((s) => STAGE_ORDER.indexOf(s.etapa as any) >= idx).map((s) =>
    s.etapa === "desenvolvimento"
      ? { ...s, acoes: [...s.acoes] }
      : s
  );
}

const STAGE_ORDER = ["briefing", "copywriting", "design", "wireframe", "desenvolvimento", "revisao", "deploy"] as const;

const STAGE_RUNBOOK: StageStep[] = [
  {
    etapa: "briefing",
    objetivo: "Garantir que o briefing do cliente está completo e registrado no projeto.",
    acoes: [
      "Se o briefing ainda está vazio: o operador cola o briefing do cliente no chat → grave com update_project(brief=\"<texto>\") e, se houver campos claros, também briefing=[{fieldTitle, answer}] (formato estruturado que aparece no PDF de validação).",
      "Se o briefing veio do Typeform (project.briefing já preenchido), revise-o e resuma os pontos-chave.",
      "Dúvidas críticas (público, objetivo, diferenciais, contatos) → pergunte ao operador; ele conversa com o cliente.",
      "Avance com update_project(stage=\"copywriting\").",
    ],
  },
  {
    etapa: "copywriting",
    objetivo: "Escrever a copy completa da Landing Page a partir do briefing.",
    acoes: [
      "Produza: headline (H1), subtítulo, CTA principal, benefícios (3-6), prova social, seção de serviços, FAQ e footer — tom de voz do briefing.",
      "Grave com update_project(copy=\"<copy completa>\").",
      "Avance com update_project(stage=\"design\").",
    ],
  },
  {
    etapa: "design",
    objetivo: "Definir a identidade visual e a estrutura da página.",
    acoes: [
      "Defina: paleta de cores (hex), tipografia (Google Fonts), estilo/referências, seções na ordem, comportamento mobile.",
      "Grave com update_project(designNotes=\"<notas de design>\").",
      "Avance com update_project(stage=\"wireframe\").",
    ],
  },
  {
    etapa: "wireframe",
    objetivo: "Montar a estrutura da página com copy real posicionada e componentes/assets em linha pontilhada, para o cliente revisar ANTES de codar.",
    acoes: [
      "Fundo do wireframe: preto OU branco — o OPOSTO da cor da fonte do guia de design escolhido (guia de fonte clara → fundo preto; fonte escura → fundo branco), garantindo contraste.",
      "Monte a estrutura da página (HTML único, estático, zero JS de produção): as seções na ordem do design, com os TEXTOS REAIS do copywriting posicionados nos lugares adequados.",
      "Represente componentes/assets (imagens, vídeos, ilustrações, depoimentos) como blocos com borda pontilhada e rótulo nomeado (ex.: [FOTO — fachada da clínica], [VÍDEO LOOP — hero 8s], [CARROSSEL DEPOIMENTOS]) — sem gerar/implementar os assets ainda.",
      "Marque onde cada efeito da biblioteca entrará com uma tag discreta (ex.: [EFEITO 03 — loop ambient no hero]) — sem implementar.",
      "Grave a URL do wireframe com update_project(wireframeUrl=\"<url>\") — hospede onde o operador indicar (GitHub Pages do repo do projeto, Netlify preview etc.).",
      "PARE e aguarde: o operador (Vitor) envia o wireframe ao CLIENTE, que revisa e decide se quer alterar copy/estrutura. NÃO avance sozinho.",
      "Ajustes pedidos pelo cliente → corrija o wireframe e re-grave a URL; só avance com update_project(stage=\"desenvolvimento\") quando o operador confirmar a aprovação do cliente.",
    ],
  },
  {
    etapa: "desenvolvimento",
    objetivo: "Construir a Landing Page de verdade num repositório GitHub.",
    acoes: [
      "Chame get_project_dev_kit(projectId) — devolve lead + briefing + copy + design + prompt pronto de implementação.",
      "Implemente o site (HTML/CSS/JS ou stack que julgar melhor) num repo GitHub novo, seguindo o dev kit. Mobile-first, responsivo, acessível.",
      "Gere um preview (ex.: GitHub Pages) e registre a entrega com submit_project_code(projectId, repoUrl, previewUrl, message).",
      "O projeto fica em devStatus=codigo_entregue AGUARDANDO revisão humana — não avance sozinho.",
    ],
  },
  {
    etapa: "revisao",
    objetivo: "Aguardar o humano revisar/aprovar o código (guarda-limite).",
    acoes: [
      "Aguarde o operador aprovar na UI (approve_project_code é ação HUMANA — você NÃO chama essa tool).",
      "Se pedirem ajustes: implemente no repo e re-registre com submit_project_code.",
      "Quando devStatus=aprovado, avance com update_project(stage=\"deploy\").",
    ],
  },
  {
    etapa: "deploy",
    objetivo: "Publicar e registrar a URL final.",
    acoes: [
      "O deploy/publicação é feito ou aprovado pelo operador (Netlify/GitHub Pages).",
      "Registre a URL final com update_project(deployUrl=\"<url>\").",
      "Com o cliente satisfeito, conclua: update_project(status=\"concluido\") — o lead vai para 'closed' no CRM automaticamente.",
    ],
  },
];

/** Prompt de spawn — o operador cola isto no novo chat do bot Hermes. */
export function buildSpawnPrompt(project: Project): string {
  return [
    `Você é o Agente de Execução do LeadRadar para o projeto "${project.name}" (projectId: ${project.id}), etapa atual: ${project.stage}.`,
    ``,
    `PASSO 1 — Contexto: chame a tool MCP \`get_agent_runbook\` com projectId="${project.id}". Ela devolve como o app funciona, o estado fresco do projeto e o passo a passo com as tools MCP. Não leia a codebase do LeadRadar — todo acesso é via MCP.`,
    ``,
    `PASSO 2 — Execução: siga o runbook da etapa "${project.stage}" até o fim, usando as tools MCP (update_project, get_project_dev_kit, submit_project_code...). Registre tudo que produzir no próprio projeto.`,
    ``,
    `REGRAS CRÍTICAS:`,
    `- NUNCA chame approve_project_code (aprovação é humana, feita na UI).`,
    `- NÃO envie mensagens ao cliente (WhatsApp/e-mail) sem autorização expressa do operador.`,
    `- NÃO invente dados do cliente; use apenas briefing/dev kit. Faltando algo, pergunte.`,
    ``,
    `Ao final, reporte: etapa alcançada, o que foi gravado no projeto e o que precisa de ação humana.`,
  ].join("\n");
}

/** Monta o runbook completo do agente para um projeto. */
export function buildAgentRunbook(projectId: string) {
  const project = getProjectById(projectId);
  if (!project) throw new Error("Projeto não encontrado.");

  const lead: StoredLead | undefined = project.leadId ? getLeadById(project.leadId) : undefined;
  const briefPreview = project.brief ? project.brief.slice(0, 400) + (project.brief.length > 400 ? "…" : "") : null;

  return {
    success: true as const,
    projectId: project.id,
    generatedAt: new Date().toISOString(),
    app: APP_OVERVIEW,
    projeto: {
      nome: project.name,
      leadId: project.leadId,
      cliente: lead
        ? {
            nome: lead.name,
            categoria: lead.category ?? null,
            cidade: [lead.city, lead.state].filter(Boolean).join("/") || null,
            telefone: lead.phone ?? null,
            instagram: lead.instagramHandle ?? null,
          }
        : null,
      etapa: project.stage,
      status: project.status,
      prioridade: project.priority,
      devStatus: project.devStatus ?? "aguardando_agente",
      temBriefingTexto: Boolean(project.brief?.trim()),
      camposBriefing: (project.briefing ?? []).length,
      briefPreview,
      temCopy: Boolean(project.copy?.trim()),
      temDesignNotes: Boolean(project.designNotes?.trim()),
      wireframeUrl: project.wireframeUrl ?? null,
      repo: project.githubRepoUrl ?? null,
      previewUrl: project.previewUrl ?? null,
      deployUrl: project.deployUrl ?? null,
      tarefas: {
        feitas: (project.tasks ?? []).filter((t) => t.done).length,
        total: (project.tasks ?? []).length,
      },
    },
    runbook: buildStageRunbook(project.stage, project),
    regras: AGENT_RULES,
    mcp: {
      servidor: "leadradar-ai",
      urlSse: "/api/mcp/sse (do próprio LeadRadar; ver docs/GUIA_USO_MCP.md para configurar no Hermes)",
      ferramentas: AGENT_TOOLS,
    },
    promptDeSpawn: buildSpawnPrompt(project),
  };
}
