import React, { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Rocket, Plus, CalendarClock, Flag, CheckCircle2, Link2, Copy, Check, Code2, Bot, BadgeCheck, ChevronDown, ChevronRight, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { BusinessLead, Project, ProjectStage } from '../types';
import { ProjectModal } from './ProjectModal';
import { StageOverview } from './StageOverview';

const STAGES_STORAGE_KEY = 'leadradar.projects.stages.collapsed.v1';

function readCollapsedStages(): string[] {
  try {
    const raw = localStorage.getItem(STAGES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

const STAGES: { id: ProjectStage; title: string; color: string; bar: string }[] = [
  { id: 'briefing', title: 'Briefing', color: 'border-slate-200 bg-slate-100 text-slate-700', bar: 'bg-slate-400' },
  { id: 'copywriting', title: 'Copywriting', color: 'border-sky-200 bg-sky-50 text-sky-700', bar: 'bg-sky-500' },
  { id: 'design', title: 'Design', color: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700', bar: 'bg-fuchsia-500' },
  { id: 'wireframe', title: 'Wireframe', color: 'border-orange-200 bg-orange-50 text-orange-700', bar: 'bg-orange-500' },
  { id: 'desenvolvimento', title: 'Desenvolvimento', color: 'border-indigo-200 bg-indigo-50 text-indigo-700', bar: 'bg-indigo-500' },
  { id: 'revisao', title: 'Revisão', color: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500' },
  { id: 'deploy', title: 'Deploy', color: 'border-teal-200 bg-teal-50 text-teal-700', bar: 'bg-teal-500' },
];

const CONCLUDED_COLUMN = '__concluido__';

const CONCLUDED_META = {
  title: 'Concluídos',
  color: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  baixa: { label: 'Baixa', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  media: { label: 'Média', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  alta: { label: 'Alta', className: 'bg-red-50 text-red-700 border-red-200' },
};

const TYPE_META: Record<string, { label: string; className: string }> = {
  landing_page: { label: 'Landing Page', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  site_institucional: { label: 'Site Institucional', className: 'bg-sky-50 text-sky-700 border-sky-200' },
};

const STAGE_ACCENT: Record<ProjectStage, { stripe: string; bar: string; label: string }> = {
  briefing: { stripe: 'bg-slate-300', bar: 'bg-slate-400', label: 'text-slate-600' },
  copywriting: { stripe: 'bg-sky-300', bar: 'bg-sky-500', label: 'text-sky-700' },
  design: { stripe: 'bg-fuchsia-300', bar: 'bg-fuchsia-500', label: 'text-fuchsia-700' },
  wireframe: { stripe: 'bg-orange-300', bar: 'bg-orange-500', label: 'text-orange-700' },
  desenvolvimento: { stripe: 'bg-indigo-300', bar: 'bg-indigo-500', label: 'text-indigo-700' },
  revisao: { stripe: 'bg-amber-300', bar: 'bg-amber-500', label: 'text-amber-700' },
  deploy: { stripe: 'bg-teal-300', bar: 'bg-teal-500', label: 'text-teal-700' },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dueDateInfo(dueDate: string): { label: string; className: string } {
  if (!dueDate) return { label: 'Sem prazo definido', className: 'text-slate-500' };
  const due = new Date(`${dueDate.slice(0, 10)}T23:59:59`).getTime();
  const now = Date.now();
  const days = Math.ceil((due - now) / MS_PER_DAY);
  if (days < 0) return { label: `Vencido há ${Math.abs(days)}d`, className: 'text-red-600' };
  if (days === 0) return { label: 'Vence hoje', className: 'text-red-600' };
  if (days <= 2) return { label: `${days}d restantes`, className: 'text-amber-600' };
  return { label: new Date(dueDate).toLocaleDateString('pt-BR'), className: 'text-slate-500' };
}

const stageIndex = (stage: ProjectStage) => STAGES.findIndex((s) => s.id === stage);

function projectProgress(project: Project): number {
  if (project.status === 'concluido') return 100;
  const idx = stageIndex(project.stage);
  return Math.round(((idx + 1) / STAGES.length) * 100);
}

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

interface SortableProjectCardProps {
  project: Project;
  onClick: (project: Project) => void;
  copied: boolean;
  onCopyBriefingLink: (project: Project) => void;
}

interface ProjectColumnProps {
  id: string;
  title: string;
  color: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * Etapa do kanban de projetos: bloco de largura total (empilhado) com os cards
 * em grid e cabeçalho em accordeon — mesmo padrão do Dashboard de Leads.
 * Recolhida continua sendo alvo de drop.
 */
const ProjectColumn: React.FC<ProjectColumnProps> = ({ id, title, color, count, collapsed, onToggle, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section
      ref={setNodeRef}
      id={`stage-${id}`}
      aria-label={`Etapa ${title}`}
      className={`w-full bg-slate-50 border rounded-2xl transition-colors ${
        isOver ? 'border-violet-400 ring-2 ring-violet-100' : 'border-slate-200'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={collapsed ? `Expandir ${title}` : `Recolher ${title}`}
        className={`w-full p-3 rounded-2xl font-bold text-sm flex items-center justify-between gap-3 cursor-pointer hover:brightness-[0.98] ${color} ${
          collapsed ? '' : 'rounded-b-none'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {collapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
          <span className="truncate">{title}</span>
          <span className="px-2 py-0.5 rounded-full bg-white/80 text-slate-800 text-[11px] font-bold border border-white/60 shrink-0">
            {count}
          </span>
        </span>
        <span className="text-[11px] font-semibold opacity-70 shrink-0">{collapsed ? 'expandir' : 'recolher'}</span>
      </button>

      {!collapsed && (
        <div className="p-3">
          {count === 0 ? (
            <p className="text-[11px] text-slate-500 text-center py-6 border border-dashed border-slate-300 rounded-xl">
              arraste um projeto para cá
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {children}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const SortableProjectCard: React.FC<SortableProjectCardProps> = ({ project, onClick, copied, onCopyBriefingLink }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const progress = projectProgress(project);
  const priority = PRIORITY_META[project.priority] || PRIORITY_META.media;
  const projectType = TYPE_META[project.type || 'landing_page'] || TYPE_META.landing_page;
  const isConcluded = project.status === 'concluido';
  const accent = STAGE_ACCENT[project.stage] || STAGE_ACCENT.briefing;
  const due = dueDateInfo(project.dueDate || '');
  const initial = (project.leadName || project.name || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(project)}
      className={`group relative bg-white border rounded-xl shadow-sm hover:shadow-lg hover:border-violet-300 transition-all text-xs cursor-grab active:cursor-grabbing overflow-hidden ${
        isConcluded ? 'border-emerald-200' : 'border-slate-200'
      }`}
    >
      {/* Faixa de acento da etapa */}
      <div className={`h-1 ${isConcluded ? 'bg-emerald-400' : accent.stripe}`} />

      <div className="p-3.5 space-y-3">
        {/* Cabeçalho com avatar e nome */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[13px] font-bold shrink-0 shadow-sm ${
              isConcluded ? 'bg-emerald-500' : 'bg-violet-600'
            }`}
          >
            {initial}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 line-clamp-1 truncate">{project.name}</div>
            <div className="text-slate-500 text-[11px] font-medium truncate">
              {project.leadName || 'Lead vinculado'}{project.leadCity ? ` • ${project.leadCity}` : ''}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[11px] ${projectType.className}`}>
            {projectType.label}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[11px] ${priority.className}`}>
            <Flag className="w-3 h-3 inline mr-0.5 -mt-px" />
            {priority.label}
          </span>
          {isConcluded && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="w-3 h-3 inline mr-0.5 -mt-px" />
              Concluído
            </span>
          )}
          {!isConcluded && project.devStatus === 'codigo_entregue' && (
            <span
              title="O agente entregou o código — abra o projeto e revise para aprovar."
              className="inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[11px] bg-amber-50 text-amber-800 border-amber-300"
            >
              <Code2 className="w-3 h-3 inline mr-0.5 -mt-px" />
              Código entregue
            </span>
          )}
          {!isConcluded && project.devStatus === 'aguardando_agente' && (
            <span
              title="Aguardando o agente de IA implementar este projeto."
              className="inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[11px] bg-slate-50 text-slate-500 border-slate-200"
            >
              <Bot className="w-3 h-3 inline mr-0.5 -mt-px" />
              Aguardando agente
            </span>
          )}
          {!isConcluded && project.devStatus === 'aprovado' && (
            <span
              title="Código aprovado — falta fazer deploy."
              className="inline-flex items-center px-2 py-0.5 rounded-full border font-bold text-[11px] bg-teal-50 text-teal-700 border-teal-200"
            >
              <BadgeCheck className="w-3 h-3 inline mr-0.5 -mt-px" />
              Aprovado
            </span>
          )}
        </div>

        {/* Progresso da etapa */}
        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold mb-1.5">
            <span className={isConcluded ? 'text-emerald-700' : accent.label}>
              {isConcluded ? 'Finalizado' : STAGES[stageIndex(project.stage)].title}
            </span>
            <span className="text-slate-500 font-bold">{progress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isConcluded ? 'bg-emerald-500' : accent.bar}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <span className={`flex items-center space-x-1 font-medium ${due.className}`}>
            <CalendarClock className="w-3 h-3 shrink-0" />
            <span>{due.label}</span>
          </span>
          {isConcluded && project.completedAt && (
            <span className="flex items-center space-x-1 text-emerald-600 font-bold shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              <span>{new Date(project.completedAt).toLocaleDateString('pt-BR')}</span>
            </span>
          )}
        </div>

        {project.type === 'landing_page' && project.stage === 'briefing' && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCopyBriefingLink(project);
            }}
            className="w-full inline-flex items-center justify-center gap-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 font-semibold px-3 py-2 rounded-lg text-[11px] border border-violet-200 transition-colors"
            title="Copiar o link do briefing com o token deste projeto"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link copiado!' : 'Copiar link de briefing'}</span>
            <Link2 className="w-3.5 h-3.5 text-violet-400" />
          </button>
        )}
      </div>
    </div>
  );
};

interface ProjectsDashboardProps {
  /** Quando definido (via barra de próximas ações), abre o modal deste projeto. */
  focusProjectId?: string | null;
  onFocused?: () => void;
}

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({ focusProjectId, onFocused }) => {
  const [collapsedStages, setCollapsedStages] = useState<string[]>(() => readCollapsedStages());
  const [projects, setProjects] = useState<Project[]>([]);
  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const loadProjects = useCallback(async () => {
    try {
      const data = await requestJson('/api/projects');
      if (!Array.isArray(data.projects)) throw new Error('A API retornou uma lista de projetos inválida.');
      setProjects(data.projects as Project[]);
    } catch (err: any) {
      setError(`Falha ao carregar projetos: ${err?.message || 'erro desconhecido'}`);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const data = await requestJson('/api/leads');
      if (Array.isArray(data.leads)) setLeads(data.leads as BusinessLead[]);
    } catch {
      /* modal de criação apenas desabilita se não houver leads */
    }
  }, []);

  useEffect(() => {
    void loadProjects();
    void loadLeads();

    const es = new EventSource('/api/events');
    es.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data);
        if (d?.event === 'projects' || d?.event === 'leads') {
          void loadProjects();
          void loadLeads();
        }
      } catch {
        /* ignora eventos inválidos */
      }
    };
    return () => es.close();
  }, [loadProjects, loadLeads]);

  // Abertura via barra de próximas ações: localiza o projeto já carregado
  // e abre o modal de edição.
  useEffect(() => {
    if (!focusProjectId || projects.length === 0) return;
    const target = projects.find((p) => p.id === focusProjectId);
    if (target) {
      setEditing(target);
      setModalOpen(true);
      onFocused?.();
    }
  }, [focusProjectId, projects, onFocused]);

  const handleDrop = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const projectId = active.id as string;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    try {
      // O alvo do drop pode ser uma coluna ou um card — nesse caso,
      // resolvemos para a coluna (etapa/Concluídos) à qual o card pertence.
      let destination = over.id as string;
      const overProject = projects.find((p) => p.id === destination);
      if (overProject) destination = overProject.status === 'concluido' ? CONCLUDED_COLUMN : overProject.stage;

      if (destination === CONCLUDED_COLUMN) {
        if (project.status === 'concluido') return;
        const data = await requestJson(`/api/projects/${project.id}/conclude`, { method: 'POST' });
        setProjects((prev) => prev.map((p) => (p.id === project.id ? (data.project as Project) : p)));
        return;
      }

      const stage = destination as ProjectStage;
      if (!STAGES.some((s) => s.id === stage)) return;
      if (project.status === 'concluido' && project.stage === stage) return;

      const data = await requestJson(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          status: project.status === 'concluido' ? 'em_andamento' : project.status,
        }),
      });
      setProjects((prev) => prev.map((p) => (p.id === project.id ? (data.project as Project) : p)));
    } catch (err: any) {
      setError(`Falha ao mover o projeto: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const handleSaved = (project: Project) => {
    setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
    setModalOpen(false);
    setEditing(null);
  };

  const handleCopyBriefingLink = async (project: Project) => {
    try {
      const data = await requestJson(`/api/projects/${project.id}/typeform-link`, { method: 'POST' });
      if (!data.url) throw new Error('Não foi possível gerar o link do briefing.');
      await navigator.clipboard.writeText(data.url as string);
      setCopiedId(project.id);
      setTimeout(() => setCopiedId((id) => (id === project.id ? null : id)), 2000);
    } catch (err: any) {
      setError(`Falha ao copiar o link do briefing: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const persistCollapsed = (next: string[]) => {
    setCollapsedStages(next);
    try {
      localStorage.setItem(STAGES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* modo privado: só não persiste */
    }
  };

  const toggleStage = (id: string) => {
    persistCollapsed(
      collapsedStages.includes(id) ? collapsedStages.filter((item) => item !== id) : [...collapsedStages, id]
    );
  };

  const handleDeleted = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const visibleProjects = projects.filter((p) => !p.archived);
  const total = visibleProjects.length;
  const concluded = visibleProjects.filter((p) => p.status === 'concluido').length;
  const inProgress = visibleProjects.filter((p) => p.status === 'em_andamento').length;

  const columns = [
    ...STAGES.map((s) => ({ id: s.id, title: s.title, color: s.color, bar: s.bar, projects: visibleProjects.filter((p) => p.status !== 'concluido' && p.stage === s.id) })),
    { id: CONCLUDED_COLUMN, title: CONCLUDED_META.title, color: CONCLUDED_META.color, bar: 'bg-emerald-500', projects: visibleProjects.filter((p) => p.status === 'concluido') },
  ];

  return (
    <div className="space-y-6 py-6 px-4 sm:px-6 lg:px-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Rocket className="w-6 h-6 text-violet-600" />
            <span>Projetos em Desenvolvimento</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Acompanhe cada landing page do Briefing ao Deploy, mesmo com vários projetos simultâneos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs sm:text-sm">
            <span className="text-slate-500 font-medium block">Total:</span>
            <strong className="text-slate-900 text-lg font-bold">{total} projetos</strong>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs sm:text-sm">
            <span className="text-slate-500 font-medium block">Em andamento:</span>
            <strong className="text-violet-600 text-lg font-bold">{inProgress}</strong>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs sm:text-sm">
            <span className="text-slate-500 font-medium block">Concluídos:</span>
            <strong className="text-emerald-600 text-lg font-bold">{concluded}</strong>
          </div>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            disabled={leads.length === 0}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-semibold px-4 py-3 rounded-xl text-xs flex items-center space-x-2 shadow-sm transition-all"
            title={leads.length === 0 ? 'Salve leads no CRM antes de criar projetos.' : 'Criar um novo projeto'}
          >
            <Plus className="w-4 h-4" />
            <span>Novo Projeto</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold hover:text-rose-900">Fechar</button>
        </div>
      )}

      {visibleProjects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-sm">
          <Rocket className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-slate-800 font-bold text-lg">Nenhum projeto em andamento</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Clique em <strong>"Novo Projeto"</strong> para vincular um lead do CRM e começar a acompanhar o desenvolvimento da landing page.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDrop}>
          <div className="space-y-3">
            <StageOverview
              unit="projetos"
              items={columns.map((col) => ({
                id: col.id,
                label: col.title,
                color: col.color,
                bar: col.bar,
                count: col.projects.length,
              }))}
              onSelect={(id) => {
                if (collapsedStages.includes(id)) persistCollapsed(collapsedStages.filter((item) => item !== id));
                requestAnimationFrame(() =>
                  document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                );
              }}
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => persistCollapsed([])}
                disabled={collapsedStages.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" /> Expandir todas
              </button>
              <button
                type="button"
                onClick={() => persistCollapsed(columns.map((col) => col.id))}
                disabled={collapsedStages.length === columns.length}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <PanelLeftClose className="w-3.5 h-3.5" /> Recolher todas
              </button>
            </div>

            <div className="space-y-3">
              {columns.map((col) => {
                const columnIds = col.projects.map((p) => p.id);
                const isCollapsed = collapsedStages.includes(col.id);
                return (
                  <ProjectColumn
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    color={col.color}
                    count={col.projects.length}
                    collapsed={isCollapsed}
                    onToggle={() => toggleStage(col.id)}
                  >
                    <SortableContext items={columnIds} strategy={rectSortingStrategy}>
                      {col.projects.map((project) => (
                        <SortableProjectCard
                          key={project.id}
                          project={project}
                          onClick={(p) => { setEditing(p); setModalOpen(true); }}
                          copied={copiedId === project.id}
                          onCopyBriefingLink={handleCopyBriefingLink}
                        />
                      ))}
                    </SortableContext>
                  </ProjectColumn>
                );
              })}
            </div>
          </div>
        </DndContext>
      )}

      {modalOpen && (
        <ProjectModal
          mode={editing ? 'edit' : 'create'}
          project={editing}
          leads={leads}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
};