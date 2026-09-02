import React, { useEffect, useState } from 'react';
import { Copy, ExternalLink, Bot, GitBranch, X, Save, CheckCircle2, Trash2, Rocket, Globe, RefreshCw, ClipboardList, PenLine, Palette, Code2, SearchCheck, Check, Plus, FileText, UserRound, Briefcase, Target, TrendingUp, CalendarDays, MessageSquare, ChevronDown, Layers } from 'lucide-react';
import { BusinessLead, Project, ProjectBriefingField, ProjectDevStatus, ProjectPriority, ProjectStage, ProjectStatus, ProjectTask, ProjectType } from '../types';

interface ProjectModalProps {
  mode: 'create' | 'edit';
  project?: Project | null;
  leads: BusinessLead[];
  onClose: () => void;
  onSaved: (project: Project) => void;
  onDeleted?: (id: string) => void;
}

const STAGES: { id: ProjectStage; title: string }[] = [
  { id: 'briefing', title: 'Briefing' },
  { id: 'copywriting', title: 'Copywriting' },
  { id: 'design', title: 'Design' },
  { id: 'wireframe', title: 'Wireframe' },
  { id: 'desenvolvimento', title: 'Desenvolvimento' },
  { id: 'revisao', title: 'Revisão' },
  { id: 'deploy', title: 'Deploy' },
];

const PRIORITIES: { id: ProjectPriority; title: string }[] = [
  { id: 'baixa', title: 'Baixa' },
  { id: 'media', title: 'Média' },
  { id: 'alta', title: 'Alta' },
];

const DEV_STATUS_META: Record<string, { label: string; className: string }> = {
  aguardando_agente: { label: 'Aguardando o agente', className: 'bg-slate-100 text-slate-600' },
  em_desenvolvimento: { label: 'Em desenvolvimento', className: 'bg-amber-100 text-amber-700' },
  codigo_entregue: { label: 'Código entregue — revisar', className: 'bg-violet-100 text-violet-700' },
  aprovado: { label: 'Aprovado', className: 'bg-emerald-100 text-emerald-700' },
};

const TABS = STAGES;

const DEFAULT_TASKS_BY_STAGE: Record<ProjectStage, string[]> = {
  briefing: [
    'Confirmar recebimento completo do briefing no Typeform',
    'Extrair a proposta única de valor (USP) do negócio',
    'Definir público-alvo e principal objetivo de conversão',
    'Mapear as seções da página a partir do briefing',
    'Enviar o PDF do briefing para validação do cliente',
  ],
  copywriting: [
    'Usar a USP como gancho do título (H1)',
    'Escrever subtítulo que conecta a dor do público à solução',
    'Listar benefícios (não features) em bullets escaneáveis',
    'Criar prova social: depoimentos, números e selos',
    'Responder objeções em seção de dúvidas (FAQ)',
    'Escrever um CTA principal claro, com ação e urgência',
    'Manter tom de voz alinhado ao briefing em todo o texto',
    'Revisar clareza, coerência e erros de português',
  ],
  design: [
    'Definir hierarquia visual: o que o olho vê primeiro',
    'Definir paleta com contraste acessível (WCAG AA)',
    'Escolher tipografia hierárquica e legível',
    'Montar layout responsivo (mobile, tablet e desktop)',
    'Desenhar estados de UI: hover, focus, loading, sucesso, erro',
    'Usar imagens e ícones consistentes com a identidade visual',
    'Validar o protótipo em tela real antes de desenvolver',
  ],
  wireframe: [
    'Definir o fundo do wireframe: preto OU branco (o oposto da cor da fonte do guia de design escolhido)',
    'Estruturar a página em seções na ordem definida no design',
    'Posicionar os textos reais do copywriting nos lugares adequados',
    'Representar componentes/assets com blocos de linha pontilhada (placeholders nomeados)',
    'Marcar onde cada efeito da biblioteca entrará (sem implementar ainda)',
    'Manter hierarquia visual do guia de design (tamanhos/espessuras)',
    'Enviar o wireframe para o Vitor repassar ao cliente',
    'Aguardar aprovação do cliente (copy/estrutura) antes de desenvolver',
  ],
  desenvolvimento: [
    'Configurar estrutura com HTML semântico e acessível',
    'Implementar layout responsivo e fluido',
    'Integrar formulário com validação e feedback de erro/sucesso',
    'Conectar integrações (WhatsApp, e-mail, CRM) conforme briefing',
    'Otimizar performance: imagens WebP, lazy load e Core Web Vitals',
    'Garantir SEO técnico: meta tags, Open Graph e schema',
    'Instalar analytics e rastreamento de conversão',
    'Testar em Chrome, Safari, Firefox, Edge e mobile real',
  ],
  revisao: [
    'Conferir cada seção da página contra o briefing',
    'Testar todos os estados do formulário (envio, erro, validação)',
    'Verificar textos, links, imagens e botões',
    'Testar responsividade em dispositivos reais',
    'Auditar acessibilidade: teclado, contraste e leitores de tela',
    'Validar SEO: título, descrição, Open Graph e indexação',
    'Auditar performance no Lighthouse (90+ em todas as métricas)',
    'Enviar para aprovação do cliente e registrar o feedback',
  ],
  deploy: [
    'Publicar a página em produção',
    'Configurar domínio personalizado e SSL válido',
    'Testar o fluxo final em produção (formulário e integrações)',
    'Enviar a página para indexação (Google Search Console)',
    'Confirmar analytics e rastreamento ativos em produção',
    'Entregar ao cliente com documentação (acessos e suporte)',
    'Finalizar o projeto e atualizar o status do lead',
  ],
};

const ALL_STAGES: ProjectStage[] = [
  'briefing',
  'copywriting',
  'design',
  'wireframe',
  'desenvolvimento',
  'revisao',
  'deploy',
];

function mergeDefaultTasks(existing: ProjectTask[] = []): ProjectTask[] {
  const merged = [...existing];
  const seen = new Set(merged.map((t) => `${t.stage}::${t.title.trim().toLowerCase()}`));
  ALL_STAGES.forEach((stage) => {
    DEFAULT_TASKS_BY_STAGE[stage].forEach((title) => {
      const key = `${stage}::${title.trim().toLowerCase()}`;
      if (!seen.has(key)) {
        merged.push({ id: `t_${Date.now()}_${merged.length}`, stage, title, done: false });
        seen.add(key);
      }
    });
  });
  return merged.sort((a, b) => taskOrderKey(a.stage, a.title) - taskOrderKey(b.stage, b.title));
}

function taskOrderKey(stage: ProjectStage, title: string): number {
  const stageIndex = ALL_STAGES.indexOf(stage);
  const titleIndex = DEFAULT_TASKS_BY_STAGE[stage]?.findIndex((t) => t === title.trim()) ?? -1;
  return stageIndex * 100 + (titleIndex >= 0 ? titleIndex : 99);
}

const STAGE_ICONS: Record<ProjectStage, React.ReactNode> = {
  briefing: <ClipboardList className="w-4 h-4" />,
  copywriting: <PenLine className="w-4 h-4" />,
  design: <Palette className="w-4 h-4" />,
  wireframe: <Layers className="w-4 h-4" />,
  desenvolvimento: <Code2 className="w-4 h-4" />,
  revisao: <SearchCheck className="w-4 h-4" />,
  deploy: <Rocket className="w-4 h-4" />,
};

interface BriefingGroup {
  id: string;
  title: string;
  icon: React.ReactNode;
  keywords: string[];
}

const BRIEFING_GROUPS: BriefingGroup[] = [
  {
    id: 'identificacao',
    title: 'Identificação & Contato',
    icon: <UserRound className="w-3.5 h-3.5" />,
    keywords: ['nome da empresa', 'nome do projeto', 'pessoa responsavel', 'responsavel', 'contato', 'primeiro nome', 'phone', 'telefone', 'e-mail', 'email', 'whatsapp', 'celular'],
  },
  {
    id: 'negocio',
    title: 'Negócio & Oferta',
    icon: <Briefcase className="w-3.5 h-3.5" />,
    keywords: ['produto', 'servico', 'oferta', 'concorrente', 'problema', 'resolve', 'diferencial', 'escolher'],
  },
  {
    id: 'objetivo',
    title: 'Objetivo & Público',
    icon: <Target className="w-3.5 h-3.5" />,
    keywords: ['objetivo', 'publico', 'acao', 'visitante'],
  },
  {
    id: 'visual',
    title: 'Identidade Visual & Referências',
    icon: <Palette className="w-3.5 h-3.5" />,
    keywords: ['identidade visual', 'referencia', 'evitar', 'estilo', 'cor', 'logo', 'marca', 'gosta'],
  },
  {
    id: 'conteudo',
    title: 'Conteúdo & Estrutura',
    icon: <Layers className="w-3.5 h-3.5" />,
    keywords: ['secao', 'secoes', 'conteudo', 'materiais', 'fornecer', 'informacoes', 'formulario de captacao', 'obrigatorias'],
  },
  {
    id: 'conversao',
    title: 'Conversão & Prova Social',
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    keywords: ['prova social', 'depoimento', 'numeros', 'avaliacao', 'testemunho', 'selo', 'duvida', 'faq'],
  },
  {
    id: 'prazo',
    title: 'Prazo & Entrega',
    icon: <CalendarDays className="w-3.5 h-3.5" />,
    keywords: ['prazo', 'entrega', 'lancamento', 'previsao', 'expectativa'],
  },
  {
    id: 'tecnico',
    title: 'Técnico & Integrações',
    icon: <Code2 className="w-3.5 h-3.5" />,
    keywords: ['integracao', 'dominio', 'hospedagem', 'tecnica', 'funcional', 'ferramenta'],
  },
  {
    id: 'observacoes',
    title: 'Observações Finais',
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    keywords: ['observacao', 'adicional'],
  },
];

const normalizeText = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function classifyBriefingField(title: string): string {
  const normalized = normalizeText(title);
  let bestId = 'observacoes';
  let bestScore = 0;
  for (const group of BRIEFING_GROUPS) {
    let score = 0;
    for (const keyword of group.keywords) {
      if (normalized.includes(keyword)) score += 1;
    }
    if (score > bestScore) {
      bestId = group.id;
      bestScore = score;
    }
  }
  return bestId;
}

interface GroupedBriefingField {
  field: ProjectBriefingField;
  index: number;
}

interface BriefingSection {
  group: BriefingGroup;
  items: GroupedBriefingField[];
}

function groupBriefingFields(fields: ProjectBriefingField[]): BriefingSection[] {
  return BRIEFING_GROUPS.map((group) => ({
    group,
    items: fields
      .map((field, index) => ({ field, index }))
      .filter(({ field }) => classifyBriefingField(field.fieldTitle) === group.id),
  })).filter((section) => section.items.length > 0);
}

const TYPE_META: Record<string, { label: string; className: string }> = {
  landing_page: { label: 'Landing Page', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  site_institucional: { label: 'Site Institucional', className: 'bg-sky-50 text-sky-700 border-sky-200' },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  em_andamento: { label: 'Em andamento', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pausado: { label: 'Pausado', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelado: { label: 'Cancelado', className: 'bg-red-50 text-red-700 border-red-200' },
  concluido: { label: 'Concluído', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const PROJECT_TYPES: { id: ProjectType; title: string; description: string; icon: React.ReactNode }[] = [
  { id: 'landing_page', title: 'Landing Page', description: 'Página única de alta conversão', icon: <Rocket className="w-4 h-4" /> },
  { id: 'site_institucional', title: 'Site Institucional', description: 'Site completo da empresa', icon: <Globe className="w-4 h-4" /> },
];

const projectDefaultName = (leadName: string, type: ProjectType) =>
  `${leadName.trim() || 'Projeto'} — ${type === 'site_institucional' ? 'Site Institucional' : 'Landing Page'}`;

async function requestJson(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
  const response = await fetch(input, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const error = new Error(data?.error || `A requisição falhou (HTTP ${response.status}).`);
    (error as any).status = response.status;
    throw error;
  }
  return data;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function deadlineProgress(dueDate: string, createdAt: string) {
  // Datas vindas do input são "YYYY-MM-DD"; tratamos o fim do dia para não contar o dia de entrega como vencido.
  const dueRaw = dueDate.length === 10 ? `${dueDate}T23:59:59` : dueDate;
  const due = new Date(dueRaw).getTime();
  const start = new Date(createdAt).getTime();
  const now = Date.now();

  const total = due - start;
  const overdue = now > due;
  const pct = total <= 0
    ? (overdue ? 100 : 0)
    : Math.min(100, Math.max(0, ((now - start) / total) * 100));
  const daysLeft = Math.ceil((due - now) / MS_PER_DAY);

  return { pct, overdue, daysLeft };
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  mode,
  project,
  leads,
  onClose,
  onSaved,
  onDeleted,
}) => {
  const [name, setName] = useState('');
  const [leadId, setLeadId] = useState('');
  const [type, setType] = useState<ProjectType>('landing_page');
  const [stage, setStage] = useState<ProjectStage>('briefing');
  const [status, setStatus] = useState<ProjectStatus>('em_andamento');
  const [priority, setPriority] = useState<ProjectPriority>('media');
  const [brief, setBrief] = useState('');
  const [briefing, setBriefing] = useState<ProjectBriefingField[]>([]);
  const [copy, setCopy] = useState('');
  const [designNotes, setDesignNotes] = useState('');
  const [wireframeUrl, setWireframeUrl] = useState('');
  const [devNotes, setDevNotes] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [devStatusField, setDevStatusField] = useState<ProjectDevStatus | ''>('');
  const [devMessageField, setDevMessageField] = useState('');
  const [prompt, setPrompt] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [wireframeCopied, setWireframeCopied] = useState(false);
  const [devActionMsg, setDevActionMsg] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncingTypeform, setSyncingTypeform] = useState(false);
  const [typeformNotice, setTypeformNotice] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [taskDrafts, setTaskDrafts] = useState<Partial<Record<ProjectStage, string>>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (mode === 'edit' && project) {
      setName(project.name);
      setLeadId(project.leadId);
      setType(project.type || 'landing_page');
      setStage(project.stage);
      setStatus(project.status);
      setPriority(project.priority);
      setBrief(project.brief || '');
      setBriefing(project.briefing || []);
      setCopy(project.copy || '');
      setDesignNotes(project.designNotes || '');
      setWireframeUrl(project.wireframeUrl || '');
      setDevNotes(project.devNotes || '');
      setReviewNotes(project.reviewNotes || '');
      setDeployUrl(project.deployUrl || '');
      setGithubRepo(project.githubRepoUrl || '');
      setPreviewUrl(project.previewUrl || '');
      setDevStatusField(project.devStatus || '');
      setDevMessageField(project.devMessage || '');
      setDueDate(project.dueDate ? project.dueDate.slice(0, 10) : '');
      setTasks(mergeDefaultTasks(project.tasks || []));
      setTaskDrafts({});
      setExpandedSections({});
    }
  }, [mode, project]);

  const handleLeadChange = (value: string) => {
    setLeadId(value);
    const lead = leads.find((l) => l.id === value);
    if (lead && (!name.trim() || name === projectDefaultName(lead.name, type))) {
      setName(projectDefaultName(lead.name, type));
    }
  };

  const handleTypeChange = (value: ProjectType) => {
    setType(value);
    const lead = leads.find((l) => l.id === leadId);
    if (mode === 'create' && lead && (!name.trim() || name === projectDefaultName(lead.name, type))) {
      setName(projectDefaultName(lead.name, value));
    }
  };

  const handleBriefingFieldChange = (index: number, value: string) => {
    setBriefing((prev) => prev.map((field, i) => (i === index ? { ...field, answer: value } : field)));
  };

  const toggleBriefingSection = (groupId: string) => {
    setExpandedSections((prev) => ({ ...prev, [groupId]: !(prev[groupId] === true) }));
  };

  const renderBriefingSection = (section: BriefingSection) => {
    const isExpanded = expandedSections[section.group.id] === true;
    return (
      <div
        key={section.group.id}
        id={`briefing-group-${section.group.id}`}
        className="border border-slate-200 rounded-xl overflow-hidden"
      >
        <button
          type="button"
          onClick={() => toggleBriefingSection(section.group.id)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
          title={isExpanded ? 'Recolher seção' : 'Expandir seção'}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shrink-0">
              {section.group.icon}
            </span>
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider truncate">
              {section.group.title}
            </span>
            <span className="text-[10px] font-bold text-slate-400 shrink-0">
              {section.items.length}
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
        </button>
        {isExpanded && (
          <div className="p-3 space-y-3 border-t border-slate-200">
            {section.items.map(({ field, index }) => (
              <div key={index}>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  {field.fieldTitle}
                </label>
                <textarea
                  rows={2}
                  value={field.answer}
                  onChange={(e) => handleBriefingFieldChange(index, e.target.value)}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleToggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleRemoveTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddTask = (stage: ProjectStage) => {
    const title = (taskDrafts[stage] || '').trim();
    if (!title) return;
    setTasks((prev) => [...prev, { id: `t_${Date.now()}_${prev.length}`, stage, title, done: false }]);
    setTaskDrafts((prev) => ({ ...prev, [stage]: '' }));
  };

  const renderStageChecklist = (stage: ProjectStage) => {
    const stageTasks = tasks.filter((t) => t.stage === stage);
    const doneCount = stageTasks.filter((t) => t.done).length;
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Tarefas da etapa
          </span>
          <span className={`text-[10px] font-bold ${doneCount === stageTasks.length && stageTasks.length > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
            {doneCount}/{stageTasks.length} concluídas
          </span>
        </div>
        <div className="space-y-1.5">
          {stageTasks.length === 0 && (
            <p className="text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
              Nenhuma tarefa para esta etapa. Adicione uma abaixo.
            </p>
          )}
          {stageTasks.map((task) => (
            <div
              key={task.id}
              className="group flex items-center gap-2.5 bg-white border border-slate-200 rounded-lg px-3 py-2 hover:border-slate-300 transition-colors"
            >
              <button
                type="button"
                onClick={() => handleToggleTask(task.id)}
                className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
                  task.done
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-slate-300 hover:border-indigo-400'
                }`}
                title={task.done ? 'Marcar como pendente' : 'Concluir tarefa'}
              >
                {task.done && <Check className="w-3 h-3" />}
              </button>
              <span className={`flex-1 text-xs font-medium ${task.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveTask(task.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity shrink-0"
                title="Remover tarefa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            value={taskDrafts[stage] || ''}
            onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [stage]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTask(stage);
              }
            }}
            className={inputClass}
            placeholder="Adicionar tarefa e pressionar Enter..."
          />
          <button
            type="button"
            onClick={() => handleAddTask(stage)}
            className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-lg text-[11px] transition-colors shrink-0"
            title="Adicionar tarefa"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar</span>
          </button>
        </div>
      </div>
    );
  };

  const renderConfigSection = (showTypeSelector: boolean) => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {showTypeSelector && (
        <div className="col-span-2 lg:col-span-4">
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Tipo de projeto
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {PROJECT_TYPES.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleTypeChange(opt.id)}
                className={`flex items-center space-x-2 border rounded-xl p-2.5 text-left transition-all ${
                  type === opt.id
                    ? opt.id === 'landing_page'
                      ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-100'
                      : 'border-sky-400 bg-sky-50 ring-2 ring-sky-100'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                  opt.id === 'landing_page'
                    ? 'bg-violet-100 border-violet-200 text-violet-600'
                    : 'bg-sky-100 border-sky-200 text-sky-600'
                }`}>
                  {opt.icon}
                </span>
                <span>
                  <span className="block text-xs font-bold text-slate-900">{opt.title}</span>
                  <span className="block text-[10px] text-slate-500">{opt.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="col-span-2">
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
          Nome do projeto
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="Ex: Landing Page Clínica Odonto+"
        />
      </div>

      <div>
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
          Prioridade
        </label>
        <select value={priority} onChange={(e) => setPriority(e.target.value as ProjectPriority)} className={inputClass}>
          {PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
          Prazo
        </label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
  );

  const handleSave = async (finalStatus?: ProjectStatus) => {
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        type,
        priority,
        dueDate: dueDate || undefined,
        brief,
        briefing: type === 'landing_page' ? briefing : undefined,
        tasks,
        copy,
        designNotes,
        wireframeUrl: wireframeUrl || undefined,
        devNotes,
        reviewNotes,
        deployUrl,
        githubRepoUrl: githubRepo || undefined,
        previewUrl: previewUrl || undefined,
        devStatus: devStatusField || undefined,
        devMessage: devMessageField || undefined,
      };
      if (mode === 'create') {
        if (!leadId) throw new Error('Selecione o lead para o projeto.');
        const data = await requestJson('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId, name, type, priority, dueDate: dueDate || undefined }),
        });
        onSaved(data.project as Project);
      } else if (project) {
        payload.stage = stage;
        payload.status = finalStatus || status;
        const data = await requestJson(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        onSaved(data.project as Project);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar o projeto.');
    } finally {
      setSaving(false);
    }
  };

  const handleImportTypeform = async () => {
    if (!project) return;
    setError(null);
    setTypeformNotice(null);
    setSyncingTypeform(true);
    try {
      const data = await requestJson('/api/typeform/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (data.imported > 0) {
        setTypeformNotice(`Briefing importado (${data.imported} resposta(s)).`);
      } else if (data.skipped > 0) {
        setTypeformNotice('O briefing já foi importado anteriormente.');
      } else if (data.total === 0) {
        setTypeformNotice('Nenhuma resposta encontrada no formulário Typeform.');
      } else {
        setTypeformNotice('Nenhuma resposta do Typeform corresponde a este projeto.');
      }
      const fresh = await requestJson(`/api/projects/${project.id}`);
      if (fresh.project) {
        const p = fresh.project as Project;
        setName(p.name);
        setType(p.type || 'landing_page');
        setBrief(p.brief || '');
        setBriefing(p.briefing || []);
        setCopy(p.copy || '');
        setDesignNotes(p.designNotes || '');
        setWireframeUrl(p.wireframeUrl || '');
        setDevNotes(p.devNotes || '');
        setReviewNotes(p.reviewNotes || '');
        setDeployUrl(p.deployUrl || '');
        setGithubRepo(p.githubRepoUrl || '');
        setPreviewUrl(p.previewUrl || '');
        setDevStatusField(p.devStatus || '');
        setDevMessageField(p.devMessage || '');
        setDueDate(p.dueDate ? p.dueDate.slice(0, 10) : '');
        setTasks(mergeDefaultTasks(p.tasks || []));
        onSaved(p);
      }
    } catch (err: any) {
      setError(`Falha ao importar briefing: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setSyncingTypeform(false);
    }
  };

  const handleDelete = async () => {
    if (!project || !onDeleted) return;
    setError(null);
    setSaving(true);
    try {
      await requestJson(`/api/projects/${project.id}`, { method: 'DELETE' });
      onDeleted(project.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Falha ao excluir o projeto.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full bg-white border border-slate-300 rounded-lg text-slate-800 text-xs p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  const loadDevPrompt = async () => {
    if (!project || mode !== 'edit') return;
    setPromptError(null);
    setPromptCopied(false);
    setPromptLoading(true);
    try {
      const data = await requestJson(`/api/projects/${project.id}/dev-kit`);
      setPrompt(data.prompt || '');
    } catch (err: any) {
      setPromptError(err?.message || 'Falha ao gerar o prompt.');
    } finally {
      setPromptLoading(false);
    }
  };

  const copyPrompt = async () => {
    await loadDevPrompt();
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      setPromptError('Não foi possível copiar. Copie manualmente do campo abaixo.');
    }
  };

  const saveDevRepo = async () => {
    if (!project) return;
    setDevActionMsg(null);
    setPromptError(null);
    try {
      const data = await requestJson(`/api/projects/${project.id}/dev-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: githubRepo }),
      });
      const p = data.project as Project;
      onSaved(p);
      setGithubRepo(p.githubRepoUrl || '');
      setDevStatusField(p.devStatus || '');
      setDevActionMsg('Repositório registrado.');
    } catch (err: any) {
      setPromptError(err?.message || 'Falha ao salvar repositório.');
    }
  };

  const submitCoded = async () => {
    if (!project) return;
    setDevActionMsg(null);
    setPromptError(null);
    try {
      const data = await requestJson(`/api/projects/${project.id}/submit-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: githubRepo, previewUrl, message: devMessageField }),
      });
      const p = data.project as Project;
      onSaved(p);
      setGithubRepo(p.githubRepoUrl || '');
      setPreviewUrl(p.previewUrl || '');
      setDevStatusField(p.devStatus || '');
      setDevMessageField(p.devMessage || '');
      setDevActionMsg('Código marcado como entregue. Revisão humana pendente.');
    } catch (err: any) {
      setPromptError(err?.message || 'Falha ao registrar o código.');
    }
  };

  const approveDevCode = async () => {
    if (!project) return;
    setDevActionMsg(null);
    setPromptError(null);
    try {
      const data = await requestJson(`/api/projects/${project.id}/dev-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const p = data.project as Project;
      onSaved(p);
      setDevStatusField(p.devStatus || '');
      setDevActionMsg('Código aprovado. Pode avançar para Revisão/Deploy.');
    } catch (err: any) {
      setPromptError(err?.message || 'Falha ao aprovar.');
    }
  };

  const devStatusMeta = DEV_STATUS_META[devStatusField] || DEV_STATUS_META.aguardando_agente;

  const deadline = mode === 'edit' && project && dueDate
    ? deadlineProgress(dueDate, project.createdAt)
    : null;

  const typeMeta = TYPE_META[type] || TYPE_META.landing_page;
  const statusMeta = STATUS_META[status] || STATUS_META.em_andamento;
  const currentStageIdx = STAGES.findIndex((s) => s.id === stage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold bg-violet-600 shadow-sm">
              {mode === 'create'
                ? <Rocket className="w-5 h-5" />
                : (project?.leadName || project?.name || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 truncate">
                {mode === 'create' ? 'Novo Projeto' : project?.name}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {mode === 'create'
                  ? 'Acompanhe o desenvolvimento da landing page.'
                  : `${project?.leadName || 'Lead vinculado'}${project?.leadCity ? ` • ${project.leadCity}` : ''}`}
              </p>
              {mode === 'edit' && project && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[10px] ${typeMeta.className}`}>
                    {typeMeta.label}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[10px] ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {deadline && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Tempo restante do prazo
                </span>
                <span
                  className={`text-xs font-bold ${
                    deadline.overdue || deadline.pct >= 85
                      ? 'text-red-600'
                      : deadline.pct >= 60
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                  }`}
                >
                  {deadline.overdue
                    ? `Prazo vencido${deadline.daysLeft < 0 ? ` há ${Math.abs(deadline.daysLeft)} dia(s)` : ''}`
                    : `${deadline.daysLeft} dia(s) restante(s)`}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    deadline.overdue || deadline.pct >= 85
                      ? 'bg-red-500'
                      : deadline.pct >= 60
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${deadline.pct}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                {Math.round(deadline.pct)}% do prazo utilizado • entrega em{' '}
                {new Date(dueDate).toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs font-semibold p-3">
              {error}
            </div>
          )}

          {mode === 'create' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Lead vinculado *
                  </label>
                  <select
                    value={leadId}
                    onChange={(e) => handleLeadChange(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Selecione um lead do CRM...</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name} — {lead.city}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {renderConfigSection(true)}
            </>
          ) : (
            <>
              {/* Configurações permanentes no topo */}
              {renderConfigSection(false)}

              {/* Stepper de etapas — progresso e navegação */}
              <div className="border-b border-slate-200 pb-3 mb-6">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {TABS.map((tab, i) => (
                    <React.Fragment key={tab.id}>
                      {i > 0 && (
                        <div className={`h-0.5 flex-1 min-w-2 rounded-full shrink-0 ${i <= currentStageIdx ? 'bg-indigo-500' : 'bg-slate-200'}`} />
                      )}
                      <button
                        type="button"
                        onClick={() => setStage(tab.id)}
                        className="flex flex-col items-center gap-1 shrink-0 px-1 group/step"
                        title={tab.title}
                      >
                        <span
                          className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                            i < currentStageIdx
                              ? 'bg-indigo-500 border-indigo-500 text-white'
                              : i === currentStageIdx
                                ? 'bg-white border-indigo-500 text-indigo-600 ring-4 ring-indigo-100'
                                : 'bg-white border-slate-200 text-slate-400 group-hover/step:border-slate-300 group-hover/step:text-slate-500'
                          }`}
                        >
                          {STAGE_ICONS[tab.id]}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wide ${
                          i <= currentStageIdx ? 'text-indigo-700' : 'text-slate-400'
                        }`}>
                          {tab.title}
                        </span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {stage === 'briefing' &&
                (type === 'landing_page' ? (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Briefing (formulário Typeform)
                      </label>
                      <button
                        onClick={handleImportTypeform}
                        disabled={syncingTypeform || saving}
                        className="inline-flex items-center space-x-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-wait text-white font-semibold px-3 py-1.5 rounded-lg text-[11px] transition-colors"
                        title="Importar o briefing do cliente do formulário Typeform"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingTypeform ? 'animate-spin' : ''}`} />
                        <span>{syncingTypeform ? 'Importando...' : 'Importar briefing (Typeform)'}</span>
                      </button>
                    </div>
                    {typeformNotice && (
                      <p className="text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg p-2.5 mb-2">
                        {typeformNotice}
                      </p>
                    )}
                    {briefing.length === 0 ? (
                      <p className="text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-300 rounded-lg p-3">
                        Nenhuma resposta do Typeform vinculada a este projeto ainda.
                        Clique em <strong>Importar briefing</strong> para buscar as respostas
                        do formulário e preencher os campos abaixo.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {groupBriefingFields(briefing).map((section) => renderBriefingSection(section))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Briefing
                    </label>
                    <textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)} className={inputClass} placeholder="Objetivos, público-alvo, referências..." />
                  </div>
                ))}

              {stage === 'briefing' && (
                <>
                  {briefing.length > 0 && (
                    <a
                      href={`/api/projects/${project.id}/briefing.pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-lg text-[11px] transition-colors"
                      title="Baixar o PDF do briefing para validação do cliente"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Baixar PDF do briefing
                    </a>
                  )}
                  {renderStageChecklist('briefing')}
                </>
              )}

              {stage === 'copywriting' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Copywriting
                    </label>
                    <textarea rows={2} value={copy} onChange={(e) => setCopy(e.target.value)} className={inputClass} placeholder="Títulos, textos, CTA..." />
                  </div>
                  {renderStageChecklist('copywriting')}
                </>
              )}

              {stage === 'design' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Notas de Design
                    </label>
                    <textarea rows={2} value={designNotes} onChange={(e) => setDesignNotes(e.target.value)} className={inputClass} placeholder="Layout, paleta, identidade..." />
                  </div>
                  {renderStageChecklist('design')}
                </>
              )}

              {stage === 'wireframe' && (
                <>
                  <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3 space-y-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-orange-700 uppercase tracking-wider">
                      <Layers className="w-3.5 h-3.5" /> Wireframe para aprovação do cliente
                    </span>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Após o copy e o design, o agente monta a estrutura da página: fundo{' '}
                      <strong>preto ou branco</strong> (o oposto da cor da fonte do guia de design), textos reais
                      posicionados e componentes/assets em <strong>blocos de linha pontilhada</strong>.
                      O Vitor envia ao cliente, que revisa copy/estrutura <strong>antes de codar</strong>.
                    </p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      URL do wireframe
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        value={wireframeUrl}
                        onChange={(e) => setWireframeUrl(e.target.value)}
                        className={inputClass}
                        placeholder="https://cliente.github.io/wireframe/ (GitHub Pages, Netlify preview...)"
                      />
                      {wireframeUrl.trim() && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(wireframeUrl.trim());
                              setWireframeCopied(true);
                              setTimeout(() => setWireframeCopied(false), 2000);
                            } catch { /* clipboard indisponível */ }
                          }}
                          className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-lg text-[11px] transition-colors shrink-0"
                          title="Copiar o link do wireframe para enviar ao cliente"
                        >
                          {wireframeCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{wireframeCopied ? 'Copiado!' : 'Copiar link'}</span>
                        </button>
                      )}
                    </div>
                    {wireframeUrl.trim() && (
                      <a
                        href={wireframeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-orange-700 hover:text-orange-800 font-semibold mt-1.5"
                      >
                        <ExternalLink className="w-3 h-3" /> Abrir wireframe
                      </a>
                    )}
                  </div>
                  {renderStageChecklist('wireframe')}
                </>
              )}

              {stage === 'desenvolvimento' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Notas de Desenvolvimento
                    </label>
                    <textarea rows={2} value={devNotes} onChange={(e) => setDevNotes(e.target.value)} className={inputClass} placeholder="Stack, integrações, WhatsApp..." />
                  </div>
                  {/* Agente de IA de código — kit de dados + prompt + entrega */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                        <Bot className="w-3.5 h-3.5" /> Agente de IA de código
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[10px] ${devStatusMeta.className}`}>
                        {devStatusMeta.label}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mb-2">
                      O app prepara o <strong>kit de dados</strong> (lead + briefing + copy + design) e entrega a um agente (Hermes/Gemini) para codar a página no GitHub — sem template pronto. Cole o prompt no agente ou use as tools MCP.
                    </p>

                    <div className="flex flex-wrap gap-2 mb-2">
                      <button
                        onClick={() => { loadDevPrompt(); }}
                        disabled={promptLoading}
                        className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs disabled:opacity-50"
                      >
                        <Code2 className="w-3.5 h-3.5" /> {promptLoading ? 'Gerando...' : 'Gerar prompt'}
                      </button>
                      {prompt && (
                        <button
                          onClick={copyPrompt}
                          className="inline-flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white font-semibold px-3 py-1.5 rounded-lg text-xs"
                        >
                          <Copy className="w-3.5 h-3.5" /> {promptCopied ? 'Copiado!' : 'Copiar prompt'}
                        </button>
                      )}
                    </div>

                    {prompt && (
                      <textarea
                        rows={6}
                        readOnly
                        value={prompt}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full bg-white border border-indigo-200 rounded-lg text-[11px] text-slate-700 font-mono p-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          Repositório GitHub
                        </label>
                        <input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} className={inputClass} placeholder="https://github.com/org/repo" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          URL de preview (antes do deploy)
                        </label>
                        <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} className={inputClass} placeholder="https://org.github.io/repo/" />
                      </div>
                    </div>

                    <div className="mt-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                        Mensagem / notificação do agente
                      </label>
                      <textarea rows={2} value={devMessageField} onChange={(e) => setDevMessageField(e.target.value)} className={inputClass} placeholder="Última atualização do agente..." />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        onClick={saveDevRepo}
                        disabled={!githubRepo.trim()}
                        className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
                      >
                        <GitBranch className="w-3.5 h-3.5" /> Salvar repositório
                      </button>
                      <button
                        onClick={submitCoded}
                        disabled={!previewUrl.trim() && !githubRepo.trim()}
                        className="inline-flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
                      >
                        <Rocket className="w-3.5 h-3.5" /> Registar código entregue
                      </button>
                      {devStatusField === 'codigo_entregue' && (
                        <button
                          onClick={approveDevCode}
                          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar código
                        </button>
                      )}
                    </div>

                    {previewUrl && (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold mt-2"
                      >
                        <ExternalLink className="w-3 h-3" /> Abrir preview
                      </a>
                    )}

                    {devActionMsg && <p className="text-[11px] text-emerald-700 font-semibold mt-2">{devActionMsg}</p>}
                    {promptError && <p className="text-[11px] text-red-600 font-semibold mt-2">{promptError}</p>}
                  </div>

                  {renderStageChecklist('desenvolvimento')}
                </>
              )}

              {stage === 'revisao' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Notas de Revisão
                    </label>
                    <textarea rows={2} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} className={inputClass} placeholder="Ajustes solicitados pelo cliente..." />
                  </div>
                  {renderStageChecklist('revisao')}
                </>
              )}

              {stage === 'deploy' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      URL de Deploy
                    </label>
                    <input value={deployUrl} onChange={(e) => setDeployUrl(e.target.value)} className={inputClass} placeholder="https://..." />
                  </div>
                  {renderStageChecklist('deploy')}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 shrink-0">
          <div>
            {mode === 'edit' && project && onDeleted && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="inline-flex items-center space-x-1.5 text-red-600 hover:text-red-700 font-semibold text-xs disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" />
                <span>Excluir</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs disabled:opacity-40"
            >
              Cancelar
            </button>

            {mode === 'edit' && project && project.status !== 'concluido' && (
              <button
                onClick={() => handleSave('concluido')}
                disabled={saving}
                className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-xs disabled:opacity-40"
                title="Move o lead para a etapa Finalizado"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Concluir Projeto</span>
              </button>
            )}

            <button
              onClick={() => handleSave()}
              disabled={saving || !name.trim()}
              className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-xs disabled:opacity-40"
            >
              <Save className="w-4 h-4" />
              <span>{mode === 'create' ? 'Criar Projeto' : 'Salvar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};