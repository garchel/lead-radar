import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SearchHeader } from './components/SearchHeader';
import { BusinessCard } from './components/BusinessCard';
import { MapView } from './components/MapView';
import { LeadAnalysisModal } from './components/LeadAnalysisModal';
import { CrmPipeline } from './components/CrmPipeline';
import { StrategyGuide } from './components/StrategyGuide';
import { AddLeadModal } from './components/AddLeadModal';
import { McpStatusModal } from './components/McpStatusModal';
import { QueueDrawerModal } from './components/QueueDrawerModal';
import { MOCK_LEADS } from './data/mockLeads';
import { BusinessLead, SearchFilters } from './types';
import { exportLeadsToCSV } from './utils/exportUtils';
import { SearchX, Sparkles, Filter, Info, ShieldCheck } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'crm' | 'guide'>('search');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(true);
  const [hasMapsKey, setHasMapsKey] = useState<boolean>(false);

  // Search Filters State
  const [filters, setFilters] = useState<SearchFilters>({
    state: 'SP',
    location: 'São Paulo',
    category: 'Todas as Categorias',
    filterNoWebsiteOnly: true,
    minRating: 4.0,
    minReviews: 10,
    sortBy: 'score',
  });

  // Business Leads list state
  const [leads, setLeads] = useState<BusinessLead[]>(MOCK_LEADS);

  // Saved CRM Leads (persisted in localStorage)
  const [savedLeads, setSavedLeads] = useState<BusinessLead[]>(() => {
    try {
      const stored = localStorage.getItem('lead_radar_saved_crm');
      return stored ? JSON.parse(stored) : [MOCK_LEADS[0], MOCK_LEADS[2]];
    } catch {
      return [MOCK_LEADS[0], MOCK_LEADS[2]];
    }
  });

  // Modal States
  const [analyzingLead, setAnalyzingLead] = useState<BusinessLead | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState<boolean>(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState<boolean>(false);

  const handleImportLeadsFromQueue = (newLeads: BusinessLead[]) => {
    setLeads((prev) => [...newLeads, ...prev]);
    setSavedLeads((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const uniqueNew = newLeads.filter((l) => !existingIds.has(l.id));
      return [...uniqueNew, ...prev];
    });
  };

  // Sync saved leads to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('lead_radar_saved_crm', JSON.stringify(savedLeads));
    } catch (err) {
      console.error('Erro ao salvar CRM no localStorage:', err);
    }
  }, [savedLeads]);

  // Check health endpoint
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHasGeminiKey(Boolean(data.hasGeminiKey));
        setHasMapsKey(Boolean(data.hasGoogleMapsKey));
      })
      .catch(() => {});
  }, []);

  // Handle AI Search Execution
  const handleSearch = async () => {
    setIsSearching(true);
    try {
      const searchLocation = [filters.location, filters.state].filter(Boolean).join(', ');
      const res = await fetch('/api/search-businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: searchLocation || 'São Paulo, SP',
          state: filters.state,
          category: filters.category,
          filterNoWebsiteOnly: filters.filterNoWebsiteOnly,
        }),
      });

      const data = await res.json();
      if (data.success && data.businesses && data.businesses.length > 0) {
        setLeads(data.businesses);
      } else {
        // Fallback filter over client dataset for seamless user experience
        filterLocalDataset();
      }
    } catch (err) {
      console.warn('Busca remota falhou, usando filtro local:', err);
      filterLocalDataset();
    } finally {
      setIsSearching(false);
    }
  };

  const filterLocalDataset = () => {
    let results = [...MOCK_LEADS];

    if (filters.state && filters.state !== 'ALL') {
      const stateLower = filters.state.toLowerCase();
      results = results.filter(
        (l) => l.state && l.state.toLowerCase() === stateLower
      );
    }

    if (filters.location && filters.location.trim() !== '') {
      const locLower = filters.location.toLowerCase().trim();
      results = results.filter(
        (l) =>
          l.city.toLowerCase().includes(locLower) ||
          l.address.toLowerCase().includes(locLower) ||
          (l.neighborhood && l.neighborhood.toLowerCase().includes(locLower)) ||
          (l.state && l.state.toLowerCase().includes(locLower))
      );
    }

    if (filters.category && filters.category !== 'Todas as Categorias') {
      results = results.filter((l) => l.category === filters.category);
    }

    if (filters.presenceFilter === 'gold') {
      results = results.filter((l) => l.websiteStatus === 'none');
    } else if (filters.presenceFilter === 'silver') {
      results = results.filter((l) => l.websiteStatus === 'social_only');
    } else if (filters.presenceFilter === 'has_website') {
      results = results.filter((l) => l.websiteStatus === 'has_website');
    } else if (filters.filterNoWebsiteOnly) {
      results = results.filter((l) => l.websiteStatus === 'none' || l.websiteStatus === 'social_only');
    }

    // Sort results
    if (filters.sortBy === 'score') {
      results.sort((a, b) => b.opportunityScore - a.opportunityScore);
    } else if (filters.sortBy === 'rating') {
      results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (filters.sortBy === 'reviews') {
      results.sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));
    } else if (filters.sortBy === 'name') {
      results.sort((a, b) => a.name.localeCompare(b.name));
    }

    setLeads(results);
  };

  // Toggle Save Lead to CRM
  const handleToggleSave = (lead: BusinessLead) => {
    const isAlreadySaved = savedLeads.some((l) => l.id === lead.id);
    if (isAlreadySaved) {
      setSavedLeads((prev) => prev.filter((l) => l.id !== lead.id));
    } else {
      const leadWithStatus: BusinessLead = {
        ...lead,
        pipelineStatus: 'prospect',
        savedAt: new Date().toISOString(),
      };
      setSavedLeads((prev) => [leadWithStatus, ...prev]);
    }
  };

  // Update CRM Pipeline Status
  const handleUpdateStatus = (id: string, status: BusinessLead['pipelineStatus']) => {
    setSavedLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, pipelineStatus: status } : l))
    );
  };

  // Update CRM Notes
  const handleUpdateNotes = (id: string, notes: string) => {
    setSavedLeads((prev) => prev.map((l) => (l.id === id ? { ...l, notes } : l)));
  };

  // Remove Lead from CRM
  const handleRemoveLead = (id: string) => {
    setSavedLeads((prev) => prev.filter((l) => l.id !== id));
  };

  // Add Manual Lead
  const handleAddManualLead = (lead: BusinessLead) => {
    setLeads((prev) => [lead, ...prev]);
    setSavedLeads((prev) => [lead, ...prev]);
    setAnalyzingLead(lead);
  };

  const savedLeadIds = new Set(savedLeads.map((l) => l.id));
  const noWebsiteCount = leads.filter(
    (l) => l.websiteStatus === 'none' || l.websiteStatus === 'social_only'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-indigo-600 selection:text-white">
      {/* Top Header Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        savedCount={savedLeads.length}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenMcpModal={() => setIsMcpModalOpen(true)}
        onOpenQueueModal={() => setIsQueueModalOpen(true)}
        hasGeminiKey={hasGeminiKey}
        hasMapsKey={hasMapsKey}
      />

      {/* Main Container Body */}
      <main className="flex-1">
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Search Header Controls */}
            <SearchHeader
              filters={filters}
              setFilters={setFilters}
              onSearch={handleSearch}
              isSearching={isSearching}
              viewMode={viewMode}
              setViewMode={setViewMode}
              resultsCount={leads.length}
              noWebsiteCount={noWebsiteCount}
              onExportCSV={() => exportLeadsToCSV(leads)}
            />

            {/* Results Display */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
              {viewMode === 'grid' ? (
                leads.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {leads.map((lead) => (
                      <BusinessCard
                        key={lead.id}
                        lead={lead}
                        onAnalyze={(l) => setAnalyzingLead(l)}
                        onToggleSave={handleToggleSave}
                        isSaved={savedLeadIds.has(lead.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 my-8 shadow-sm">
                    <SearchX className="w-12 h-12 text-slate-400 mx-auto" />
                    <h3 className="text-lg font-bold text-slate-900">Nenhuma empresa encontrada com estes filtros</h3>
                    <p className="text-slate-500 text-sm max-w-md mx-auto">
                      Tente alterar a cidade, limpar a palavra-chave ou desmarcar o filtro "Apenas sem Landing Page".
                    </p>
                    <button
                      onClick={() => {
                        setFilters({
                          state: 'SP',
                          location: 'São Paulo',
                          category: 'Todas as Categorias',
                          filterNoWebsiteOnly: false,
                          minRating: 4.0,
                          minReviews: 10,
                          sortBy: 'score',
                        });
                        setLeads(MOCK_LEADS);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs inline-block transition-all shadow-sm"
                    >
                      Restaurar Busca Padrão
                    </button>
                  </div>
                )
              ) : (
                <MapView
                  leads={leads}
                  onAnalyze={(l) => setAnalyzingLead(l)}
                  onToggleSave={handleToggleSave}
                  savedLeadIds={savedLeadIds}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'crm' && (
          <CrmPipeline
            savedLeads={savedLeads}
            onUpdateStatus={handleUpdateStatus}
            onUpdateNotes={handleUpdateNotes}
            onRemoveLead={handleRemoveLead}
            onAnalyze={(l) => setAnalyzingLead(l)}
          />
        )}

        {activeTab === 'guide' && <StrategyGuide />}
      </main>

      {/* AI Lead Analyzer Modal */}
      {analyzingLead && (
        <LeadAnalysisModal
          lead={analyzingLead}
          onClose={() => setAnalyzingLead(null)}
          onSaveLead={handleToggleSave}
          isSaved={savedLeadIds.has(analyzingLead.id)}
        />
      )}

      {/* Add Manual Lead Modal */}
      {isAddModalOpen && (
        <AddLeadModal
          onClose={() => setIsAddModalOpen(false)}
          onAddLead={handleAddManualLead}
        />
      )}

      {/* MCP Status & Configuration Modal */}
      <McpStatusModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
      />

      {/* Async Queue Drawer Modal */}
      <QueueDrawerModal
        isOpen={isQueueModalOpen}
        onClose={() => setIsQueueModalOpen(false)}
        onImportLeads={handleImportLeadsFromQueue}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© LeadRadar — Prospecção Inteligente B2B para Agências e Freelancers.</p>
          <div className="flex items-center space-x-4 text-slate-600 font-medium">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>Diagnósticos Inteligentes com Gemini API</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
