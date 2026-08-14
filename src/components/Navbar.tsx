import React from 'react';
import { Target, Search, FolderKanban, BookOpen, PlusCircle, Cpu, Layers } from 'lucide-react';

interface NavbarProps {
  activeTab: 'search' | 'crm' | 'guide';
  setActiveTab: (tab: 'search' | 'crm' | 'guide') => void;
  savedCount: number;
  onOpenAddModal: () => void;
  onOpenMcpModal: () => void;
  onOpenQueueModal: () => void;
  hasGeminiKey: boolean;
  hasMapsKey: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  savedCount,
  onOpenAddModal,
  onOpenMcpModal,
  onOpenQueueModal,
  hasGeminiKey,
  hasMapsKey
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('search')}>
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-md shadow-indigo-600/20">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold tracking-tight text-white">
                  LeadFinder <span className="text-indigo-400">Pro</span>
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Radar IA
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Prospecção B2B de Empresas sem Landing Page</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            <button
              id="nav-search-btn"
              onClick={() => setActiveTab('search')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'search'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Search className="w-4 h-4" />
              <span className="hidden md:inline">Busca de Região</span>
            </button>

            <button
              id="nav-crm-btn"
              onClick={() => setActiveTab('crm')}
              className={`relative flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'crm'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FolderKanban className="w-4 h-4" />
              <span className="hidden md:inline">Dashboard de Leads</span>
              {savedCount > 0 && (
                <span className="ml-1.5 px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-600 text-white">
                  {savedCount}
                </span>
              )}
            </button>

            <button
              id="nav-guide-btn"
              onClick={() => setActiveTab('guide')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'guide'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden md:inline">Estratégia & Pitch</span>
            </button>
          </nav>

          {/* Action & Badges */}
          <div className="flex items-center space-x-2">
            <button
              id="async-queue-btn"
              onClick={onOpenQueueModal}
              className="flex items-center space-x-1.5 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/50 text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg transition-all shadow-xs"
              title="Fila de Processamento Assíncrono com Workers em Segundo Plano"
            >
              <Layers className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline font-sans text-xs">Fila Assíncrona</span>
            </button>

            <button
              id="mcp-server-btn"
              onClick={onOpenMcpModal}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 text-xs sm:text-sm font-semibold px-3 py-2 rounded-lg transition-all shadow-xs"
              title="Conectar Agentes de IA via protocolo MCP (Model Context Protocol)"
            >
              <Cpu className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="hidden sm:inline font-mono text-xs">MCP Server</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-0.5" />
            </button>

            <button
              id="add-manual-lead-btn"
              onClick={onOpenAddModal}
              className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-semibold px-3.5 py-2 rounded-lg transition-all shadow-sm shadow-indigo-600/30 active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Adicionar Lead</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
