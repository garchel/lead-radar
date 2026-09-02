import { ProjectStage, ProjectTask } from "../store/types";

/**
 * Tarefas padrão criadas automaticamente para cada etapa de desenvolvimento,
 * desenhadas do ponto de vista de um profissional sênior: cada item é um
 * portão de qualidade que separa uma entrega amadora de uma entrega profissional.
 * Adicionadas na criação do projeto (service) e garantidas na abertura do
 * modal (merge com o que já estiver salvo).
 */
export const DEFAULT_TASKS_BY_STAGE: Record<ProjectStage, string[]> = {
  briefing: [
    "Confirmar recebimento completo do briefing no Typeform",
    "Extrair a proposta única de valor (USP) do negócio",
    "Definir público-alvo e principal objetivo de conversão",
    "Mapear as seções da página a partir do briefing",
    "Enviar o PDF do briefing para validação do cliente",
  ],
  copywriting: [
    "Usar a USP como gancho do título (H1)",
    "Escrever subtítulo que conecta a dor do público à solução",
    "Listar benefícios (não features) em bullets escaneáveis",
    "Criar prova social: depoimentos, números e selos",
    "Responder objeções em seção de dúvidas (FAQ)",
    "Escrever um CTA principal claro, com ação e urgência",
    "Manter tom de voz alinhado ao briefing em todo o texto",
    "Revisar clareza, coerência e erros de português",
  ],
  design: [
    "Definir hierarquia visual: o que o olho vê primeiro",
    "Definir paleta com contraste acessível (WCAG AA)",
    "Escolher tipografia hierárquica e legível",
    "Montar layout responsivo (mobile, tablet e desktop)",
    "Desenhar estados de UI: hover, focus, loading, sucesso, erro",
    "Usar imagens e ícones consistentes com a identidade visual",
    "Validar o protótipo em tela real antes de desenvolver",
  ],
  wireframe: [
    "Definir o fundo do wireframe: preto OU branco (o oposto da cor da fonte do guia de design escolhido)",
    "Estruturar a página em seções na ordem definida no design",
    "Posicionar os textos reais do copywriting nos lugares adequados",
    "Representar componentes/assets com blocos de linha pontilhada (placeholders nomeados)",
    "Marcar onde cada efeito da biblioteca entrará (sem implementar ainda)",
    "Manter hierarquia visual do guia de design (tamanhos/espessuras)",
    "Enviar o wireframe para o Vitor repassar ao cliente",
    "Aguardar aprovação do cliente (copy/estrutura) antes de desenvolver",
  ],
  desenvolvimento: [
    "Configurar estrutura com HTML semântico e acessível",
    "Implementar layout responsivo e fluido",
    "Integrar formulário com validação e feedback de erro/sucesso",
    "Conectar integrações (WhatsApp, e-mail, CRM) conforme briefing",
    "Otimizar performance: imagens WebP, lazy load e Core Web Vitals",
    "Garantir SEO técnico: meta tags, Open Graph e schema",
    "Instalar analytics e rastreamento de conversão",
    "Testar em Chrome, Safari, Firefox, Edge e mobile real",
  ],
  revisao: [
    "Conferir cada seção da página contra o briefing",
    "Testar todos os estados do formulário (envio, erro, validação)",
    "Verificar textos, links, imagens e botões",
    "Testar responsividade em dispositivos reais",
    "Auditar acessibilidade: teclado, contraste e leitores de tela",
    "Validar SEO: título, descrição, Open Graph e indexação",
    "Auditar performance no Lighthouse (90+ em todas as métricas)",
    "Enviar para aprovação do cliente e registrar o feedback",
  ],
  deploy: [
    "Publicar a página em produção",
    "Configurar domínio personalizado e SSL válido",
    "Testar o fluxo final em produção (formulário e integrações)",
    "Enviar a página para indexação (Google Search Console)",
    "Confirmar analytics e rastreamento ativos em produção",
    "Entregar ao cliente com documentação (acessos e suporte)",
    "Finalizar o projeto e atualizar o status do lead",
  ],
};

export const ALL_PROJECT_STAGES: ProjectStage[] = [
  "briefing",
  "copywriting",
  "design",
  "wireframe",
  "desenvolvimento",
  "revisao",
  "deploy",
];

let taskSeq = 0;

function newTaskId(stage: ProjectStage, index: number): string {
  taskSeq += 1;
  return `t_${stage}_${Date.now().toString(36)}_${index}_${taskSeq}`;
}

/**
 * Ordena as tarefas seguindo a sequência natural de trabalho do template
 * (etapa por etapa, e dentro da etapa na ordem do template). Tarefas
 * customizadas ficam ao final do bloco da própria etapa.
 */
function taskOrderKey(stage: ProjectStage, title: string): number {
  const stageIndex = ALL_PROJECT_STAGES.indexOf(stage);
  const titleIndex = (DEFAULT_TASKS_BY_STAGE[stage] || []).findIndex((t) => t === title.trim());
  return stageIndex * 100 + (titleIndex >= 0 ? titleIndex : 99);
}

function orderTasks(tasks: ProjectTask[]): ProjectTask[] {
  return tasks.sort(
    (a, b) => taskOrderKey(a.stage, a.title) - taskOrderKey(b.stage, b.title)
  );
}

/**
 * Cria o checklist padrão completo (uma tarefa por item de cada etapa).
 */
export function buildDefaultTasks(): ProjectTask[] {
  const tasks: ProjectTask[] = [];
  for (const stage of ALL_PROJECT_STAGES) {
    const titles = DEFAULT_TASKS_BY_STAGE[stage] || [];
    titles.forEach((title, index) => {
      tasks.push({ id: newTaskId(stage, index), stage, title, done: false });
    });
  }
  return orderTasks(tasks);
}

/**
 * Garante que o checklist contenha as tarefas padrão de cada etapa,
 * preservando tarefas já existentes (ex.: projetos legados ou customizadas).
 */
export function ensureDefaultTasks(existing: ProjectTask[] = []): ProjectTask[] {
  const merged: ProjectTask[] = [...existing];
  const seen = new Set(merged.map((t) => `${t.stage}::${t.title.trim().toLowerCase()}`));

  for (const stage of ALL_PROJECT_STAGES) {
    const titles = DEFAULT_TASKS_BY_STAGE[stage] || [];
    titles.forEach((title, index) => {
      const key = `${stage}::${title.trim().toLowerCase()}`;
      if (!seen.has(key)) {
        merged.push({ id: newTaskId(stage, index), stage, title, done: false });
        seen.add(key);
      }
    });
  }
  return orderTasks(merged);
}