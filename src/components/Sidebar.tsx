import React, { useState } from 'react';
import { Target, Search, FolderKanban, BookOpen, PlusCircle, Cpu, Radar, Activity, Rocket, Building2, Database, MapPin, Briefcase, Settings, Bot, TrendingUp, Users, KeyRound, ClipboardList, ChevronDown } from 'lucide-react';

/** Abas do app — a navegação segue a etapa do funil, não a idade da feature. */
export type AppTab =
  | 'search' | 'crm' | 'growth' | 'guide' | 'monitoring' | 'projects' | 'agents'
  | 'companies' | 'cities' | 'categories' | 'automation' | 'database'
  | 'followups' | 'channels';

/** Grupos recolhidos ficam salvos no navegador. */
const GROUPS_STORAGE_KEY = 'leadradar.sidebar.groups.collapsed.v1';

function readCollapsedGroups(): string[] {
  try {
    const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

interface SidebarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  savedCount: number;
  projectCount: number;
  onOpenAddModal: () => void;
  onOpenMcpModal: () => void;
  hasGeminiKey: boolean;
  hasMapsKey: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  savedCount,
  projectCount,
  onOpenAddModal,
  onOpenMcpModal,
  hasGeminiKey,
  hasMapsKey
}) => {
  const navBtn = (tab: AppTab, active: boolean) =>
    `w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      active
        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
        : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`;

  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => readCollapsedGroups());

  const toggleGroup = (id: string) => {
    const next = collapsedGroups.includes(id)
      ? collapsedGroups.filter((item) => item !== id)
      : [...collapsedGroups, id];
    setCollapsedGroups(next);
    try {
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* modo privado: só não persiste */
    }
  };

  /** Grupo da navegação como acordeão — a lateral não tem barra de rolagem. */
  const group = (id: string, icon: React.ReactNode, label: string, children: React.ReactNode) => {
    const open = !collapsedGroups.includes(id);
    return (
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => toggleGroup(id)}
          aria-expanded={open}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-widest font-bold text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
        >
          {icon}
          <span className="flex-1 text-left">{label}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {open && <nav className="space-y-1 mt-1">{children}</nav>}
      </div>
    );
  };

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-slate-900 border-r border-slate-800 text-white shadow-md flex flex-col overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Logo & Brand */}
      <div className="px-4 py-5 border-b border-slate-800 flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('search')}>
        <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/20">
          <Target className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-lg font-bold tracking-tight text-white leading-tight">
              LeadFinder <span className="text-indigo-400">Pro</span>
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Radar IA
            </span>
          </div>
        </div>
      </div>

      {/* Grupos (roláveis, sem barra visível) */}
      <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">

      {/* 1 — Capturar: busca → fila → categorias → empresas */}
      {group(
        'capturar',
        <Radar className="w-3.5 h-3.5" />,
        'Capturar',
        <>
          <button id="nav-search-btn" onClick={() => setActiveTab('search')} className={navBtn('search', activeTab === 'search')}>
            <Search className="w-4 h-4 shrink-0" />
            <span>Busca de Região</span>
          </button>

          <button id="nav-cities-btn" onClick={() => setActiveTab('cities')} className={navBtn('cities', activeTab === 'cities')}>
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Fila de Cidades</span>
          </button>

          <button id="nav-categories-btn" onClick={() => setActiveTab('categories')} className={navBtn('categories', activeTab === 'categories')}>
            <Briefcase className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Categorias</span>
          </button>

        </>
      )}

      {/* 2 — Dados: o que já existe no banco */}
      {group(
        'dados',
        <Database className="w-3.5 h-3.5" />,
        'Dados',
        <>
          <button id="nav-database-btn" onClick={() => setActiveTab('database')} className={navBtn('database', activeTab === 'database')}>
            <Database className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Banco de Dados</span>
          </button>

          <button id="nav-companies-btn" onClick={() => setActiveTab('companies')} className={navBtn('companies', activeTab === 'companies')}>
            <Building2 className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Resultado da Busca</span>
          </button>
        </>
      )}

      {/* 2 — Converter: pipeline → pitch → projetos → agentes */}
      {group(
        'converter',
        <FolderKanban className="w-3.5 h-3.5" />,
        'Converter',
        <>
          <button id="nav-crm-btn" onClick={() => setActiveTab('crm')} className={`relative ${navBtn('crm', activeTab === 'crm')}`}>
            <FolderKanban className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Dashboard de Leads</span>
            {savedCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-600 text-white shrink-0">
                {savedCount}
              </span>
            )}
          </button>

          <button id="nav-followups-btn" onClick={() => setActiveTab('followups')} className={navBtn('followups', activeTab === 'followups')}>
            <Users className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Follow-ups</span>
          </button>
        </>
      )}

      {/* 4 — Entregar: projetos → agentes */}
      {group(
        'entregar',
        <Rocket className="w-3.5 h-3.5" />,
        'Entregar',
        <>
          <button id="nav-projects-btn" onClick={() => setActiveTab('projects')} className={`relative ${navBtn('projects', activeTab === 'projects')}`}>
            <Rocket className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Projetos</span>
            {projectCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-violet-600 text-white shrink-0">
                {projectCount}
              </span>
            )}
          </button>

          <button id="nav-agents-btn" onClick={() => setActiveTab('agents')} className={navBtn('agents', activeTab === 'agents')}>
            <Bot className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Agentes</span>
          </button>
        </>
      )}

      {/* 5 — Inteligência: método e métricas */}
      {group(
        'inteligencia',
        <TrendingUp className="w-3.5 h-3.5" />,
        'Inteligência',
        <>
          <button id="nav-guide-btn" onClick={() => setActiveTab('guide')} className={navBtn('guide', activeTab === 'guide')}>
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Estratégia &amp; Pitch</span>
          </button>

          <button id="nav-growth-btn" onClick={() => setActiveTab('growth')} className={navBtn('growth', activeTab === 'growth')}>
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Crescimento</span>
          </button>
        </>
      )}

      {/* 6 — Operação: o que roda sozinho e o que conecta */}
      {group(
        'operacao',
        <Activity className="w-3.5 h-3.5" />,
        'Operação',
        <>
          <button id="monitoring-dashboard-btn" onClick={() => setActiveTab('monitoring')} className={navBtn('monitoring', activeTab === 'monitoring')}>
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Fila &amp; Agendamentos</span>
          </button>

          <button id="nav-automation-btn" onClick={() => setActiveTab('automation')} className={navBtn('automation', activeTab === 'automation')}>
            <Settings className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Automação</span>
          </button>

          <button id="nav-channels-btn" onClick={() => setActiveTab('channels')} className={navBtn('channels', activeTab === 'channels')}>
            <KeyRound className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Canais &amp; APIs</span>
          </button>
        </>
      )}

      </div>

      {/* Ações rápidas — sempre visíveis no rodapé */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900 px-3 py-3 space-y-2">
        <button
          id="mcp-server-btn"
          onClick={onOpenMcpModal}
          className="w-full flex items-center space-x-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-sm font-semibold px-3 py-2 rounded-lg transition-all"
          title="Conectar Agentes de IA via protocolo MCP (Model Context Protocol)"
        >
          <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="flex-1 text-left font-mono text-xs">MCP Server</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        </button>

        <button
          id="add-manual-lead-btn"
          onClick={onOpenAddModal}
          className="w-full flex items-center space-x-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-3 py-2.5 rounded-lg transition-all shadow-sm shadow-indigo-600/30 active:scale-95"
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Adicionar Lead</span>
        </button>
      </div>
    </aside>
  );
};
