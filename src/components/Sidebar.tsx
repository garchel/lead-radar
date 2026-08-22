import React from 'react';
import { Target, Search, FolderKanban, BookOpen, PlusCircle, Cpu, Layers, Radar, Activity, Rocket, Building2, Database, MapPin } from 'lucide-react';

interface SidebarProps {
  activeTab: 'search' | 'crm' | 'guide' | 'monitoring' | 'projects' | 'companies' | 'cities';
  setActiveTab: (tab: 'search' | 'crm' | 'guide' | 'monitoring' | 'projects' | 'companies' | 'cities') => void;
  savedCount: number;
  projectCount: number;
  onOpenAddModal: () => void;
  onOpenMcpModal: () => void;
  onOpenQueueModal: () => void;
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
  onOpenQueueModal,
  hasGeminiKey,
  hasMapsKey
}) => {
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 bg-slate-900 border-r border-slate-800 text-white shadow-md flex flex-col overflow-y-auto">
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

      {/* Informação */}
      <div className="px-3 pt-5">
        <div className="px-2 pb-2 text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center space-x-1.5">
          <Radar className="w-3.5 h-3.5" />
          <span>Informação</span>
        </div>
        <nav className="space-y-1">
          <button
            id="nav-search-btn"
            onClick={() => setActiveTab('search')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'search'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>Busca de Região</span>
          </button>

          <button
            id="nav-companies-btn"
            onClick={() => setActiveTab('companies')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'companies'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>Empresas Encontradas</span>
          </button>

          <button
            id="nav-crm-btn"
            onClick={() => setActiveTab('crm')}
            className={`relative w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'crm'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FolderKanban className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Dashboard de Leads</span>
            {savedCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-600 text-white shrink-0">
                {savedCount}
              </span>
            )}
          </button>

          <button
            id="nav-guide-btn"
            onClick={() => setActiveTab('guide')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'guide'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Estratégia & Pitch</span>
          </button>

          <button
            id="nav-cities-btn"
            onClick={() => setActiveTab('cities')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'cities'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Fila de Cidades</span>
          </button>

          <button
            id="nav-projects-btn"
            onClick={() => setActiveTab('projects')}
            className={`relative w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'projects'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Rocket className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Projetos</span>
            {projectCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-violet-600 text-white shrink-0">
                {projectCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Automação */}
      <div className="px-3 pt-6">
        <div className="px-2 pb-2 text-[10px] uppercase tracking-widest font-bold text-slate-500 flex items-center space-x-1.5">
          <Layers className="w-3.5 h-3.5" />
          <span>Automação</span>
        </div>
        <div className="space-y-2">
          <button
            id="monitoring-dashboard-btn"
            onClick={() => setActiveTab('monitoring')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'monitoring'
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Monitoramento</span>
          </button>

          <button
            id="async-queue-btn"
            onClick={onOpenQueueModal}
            className="w-full flex items-center space-x-2.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 text-sm font-semibold px-3 py-2.5 rounded-lg transition-all shadow-xs"
            title="Fila de Processamento Assíncrono com Workers em Segundo Plano"
          >
            <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="flex-1 text-left font-sans text-xs">Fila Assíncrona</span>
          </button>

          <button
            id="mcp-server-btn"
            onClick={onOpenMcpModal}
            className="w-full flex items-center space-x-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-sm font-semibold px-3 py-2.5 rounded-lg transition-all shadow-xs"
            title="Conectar Agentes de IA via protocolo MCP (Model Context Protocol)"
          >
            <Cpu className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
            <span className="flex-1 text-left font-mono text-xs">MCP Server</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
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
      </div>
    </aside>
  );
};