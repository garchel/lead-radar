import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { SearchHeader } from './components/SearchHeader';
import { BusinessCard } from './components/BusinessCard';
import { MapView } from './components/MapView';
import { LeadAnalysisModal } from './components/LeadAnalysisModal';
import { CrmPipeline } from './components/CrmPipeline';
import { StrategyGuide } from './components/StrategyGuide';
import { AddLeadModal } from './components/AddLeadModal';
import { McpStatusModal } from './components/McpStatusModal';
import { QueueDrawerModal } from './components/QueueDrawerModal';
import { MonitoringDashboard } from './components/MonitoringDashboard';
import { DuplicateMergeModal } from './components/DuplicateMergeModal';
import { FollowUpQueue } from './components/FollowUpQueue';

import { BusinessLead, InteractionOutcome, SearchFilters } from './types';
import { exportLeadsToCSV } from './utils/exportUtils';
import { SearchX, Sparkles, Filter, Info, ShieldCheck, AlertCircle } from 'lucide-react';

async function requestJson(input: RequestInfo | URL, init?: RequestInit): Promise<any> {
  const response = await fetch(input, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const error = new Error(data?.error || `A requisição falhou (HTTP ${response.status}).`);
    (error as any).code = data?.code;
    (error as any).data = data;
    (error as any).status = response.status;
    throw error;
  }
  return data;
}

interface DuplicateCandidate {
  existingLead: BusinessLead;
  incomingLead: BusinessLead;
  resolve: (mode: 'merge' | 'separate' | 'cancel') => void;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'crm' | 'guide' | 'monitoring'>('search');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
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

  // Leads de busca e CRM começam vazios. O banco compartilhado é a única fonte de verdade.
  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [savedLeads, setSavedLeads] = useState<BusinessLead[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal States
  const [analyzingLead, setAnalyzingLead] = useState<BusinessLead | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState<boolean>(false);
  const [isQueueModalOpen, setIsQueueModalOpen] = useState<boolean>(false);
  const [duplicateCandidate, setDuplicateCandidate] = useState<DuplicateCandidate | null>(null);

  // Persists a lead via POST /api/leads. Se o servidor detectar uma duplicata
  // por nome+cidade (match fraco), abre o diálogo de confirmação de mesclagem.
  const saveLeadToApi = async (
    lead: BusinessLead,
    extra: Record<string, unknown> = {}
  ): Promise<BusinessLead | null> => {
    try {
      const data = await requestJson('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lead, pipelineStatus: lead.pipelineStatus || 'prospect', ...extra }),
      });
      if (!data.lead) throw new Error('A API não retornou o lead salvo.');
      return data.lead as BusinessLead;
    } catch (err: any) {
      if (err?.code === 'possible_duplicate') {
        const choice = await new Promise<'merge' | 'separate' | 'cancel'>((resolve) => {
          setDuplicateCandidate({
            existingLead: err.data?.existingLead as BusinessLead,
            incomingLead: err.data?.incoming as BusinessLead,
            resolve,
          });
        });
        setDuplicateCandidate(null);
        if (choice === 'cancel') return null;
        return saveLeadToApi(lead, choice === 'merge' ? { confirmMerge: true } : { forceCreate: true });
      }
      throw err;
    }
  };

  const handleImportLeadsFromQueue = async (newLeads: BusinessLead[]) => {
    setErrorMessage(null);
    const persisted: BusinessLead[] = [];
    for (const [index, lead] of newLeads.entries()) {
      try {
        const saved = await saveLeadToApi(lead);
        if (!saved) continue;
        persisted.push(saved);
      } catch (err: any) {
        throw new Error(`Falha ao importar o lead ${index + 1} (${lead.name}): ${err?.message || 'erro desconhecido'}`);
      }
    }
    setLeads((prev) => [...persisted, ...prev]);
    setSavedLeads((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const uniqueNew = persisted.filter((l) => !existingIds.has(l.id));
      return [...uniqueNew, ...prev];
    });
  };


  // Load leads persisted by the backend/agent on mount + live updates via SSE
  useEffect(() => {
    const loadFromApi = async () => {
      try {
        const data = await requestJson('/api/leads');
        if (!Array.isArray(data.leads)) {
          throw new Error('A API retornou uma lista de leads inválida.');
        }
        setSavedLeads(data.leads as BusinessLead[]);
      } catch (err: any) {
        setErrorMessage(`Falha ao carregar o CRM: ${err?.message || 'erro desconhecido'}`);
      }
    };

    void loadFromApi();

    const es = new EventSource('/api/events');
    es.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data);
        if (d?.event === 'leads') void loadFromApi();
      } catch (err: any) {
        setErrorMessage(`Falha ao interpretar uma atualização do servidor: ${err?.message || 'evento inválido'}`);
      }
    };
    es.onerror = () => {
      setErrorMessage('Falha na conexão de eventos em tempo real (/api/events).');
    };
    return () => es.close();
  }, []);

  // Check health endpoint
  useEffect(() => {
    requestJson('/api/health')
      .then((data) => {
        setHasGeminiKey(Boolean(data.hasGeminiKey));
        setHasMapsKey(Boolean(data.hasGoogleMapsKey));
      })
      .catch((err: any) => {
        setHasGeminiKey(false);
        setHasMapsKey(false);
        setErrorMessage(`Falha ao verificar a saúde da aplicação: ${err?.message || 'erro desconhecido'}`);
      });
  }, []);

  // Handle AI Search Execution
  const handleSearch = async () => {
    setIsSearching(true);
    setErrorMessage(null);
    setLeads([]);
    try {
      const searchLocation = [filters.location, filters.state].filter(Boolean).join(', ');
      const data = await requestJson('/api/search-businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: searchLocation,
          state: filters.state,
          category: filters.category,
          filterNoWebsiteOnly: filters.filterNoWebsiteOnly,
        }),
      });

      if (!Array.isArray(data.businesses)) {
        throw new Error('A API retornou uma lista de empresas inválida.');
      }
      setLeads(data.businesses as BusinessLead[]);
    } catch (err: any) {
      setErrorMessage(`Falha ao buscar empresas: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Toggle Save Lead to CRM
  const handleToggleSave = async (lead: BusinessLead) => {
    setErrorMessage(null);
    try {
      const isAlreadySaved = savedLeads.some((l) => l.id === lead.id);
      if (isAlreadySaved) {
        await requestJson(`/api/leads/${lead.id}`, { method: 'DELETE' });
        setSavedLeads((prev) => prev.filter((l) => l.id !== lead.id));
        return;
      }

      const leadToSave: BusinessLead = {
        ...lead,
        pipelineStatus: 'prospect',
        savedAt: new Date().toISOString(),
      };
      const saved = await saveLeadToApi(leadToSave);
      if (!saved) return;
      setSavedLeads((prev) => [saved, ...prev.filter((l) => l.id !== saved.id)]);
    } catch (err: any) {
      setErrorMessage(`Falha ao salvar o lead: ${err?.message || 'erro desconhecido'}`);
    }
  };

  // Update CRM Pipeline Status
  const handleUpdateStatus = async (id: string, status: BusinessLead['pipelineStatus']) => {
    setErrorMessage(null);
    try {
      const data = await requestJson(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineStatus: status || 'prospect' }),
      });
      setSavedLeads((prev) => prev.map((lead) => lead.id === id ? { ...lead, ...(data.lead as BusinessLead) } : lead));
    } catch (err: any) {
      setErrorMessage(`Falha ao atualizar o status do lead: ${err?.message || 'erro desconhecido'}`);
    }
  };

  // Update CRM Notes
  const handleUpdateNotes = async (id: string, notes: string) => {
    setErrorMessage(null);
    try {
      const data = await requestJson(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      setSavedLeads((prev) => prev.map((lead) => lead.id === id ? { ...lead, ...(data.lead as BusinessLead) } : lead));
    } catch (err: any) {
      setErrorMessage(`Falha ao salvar a anotação: ${err?.message || 'erro desconhecido'}`);
    }
  };

  // Register a response and calculate the next contact window.
  const handleRecordOutcome = async (id: string, outcome: Exclude<InteractionOutcome, 'pending'>) => {
    setErrorMessage(null);
    try {
      const data = await requestJson(`/api/leads/${id}/interactions/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      });
      setSavedLeads((prev) => prev.map((lead) => lead.id === id ? { ...lead, ...(data.lead as BusinessLead) } : lead));
    } catch (err: any) {
      setErrorMessage(`Falha ao registrar a resposta: ${err?.message || 'erro desconhecido'}`);
    }
  };

  // Remove Lead from CRM
  const handleRemoveLead = async (id: string) => {
    setErrorMessage(null);
    try {
      await requestJson(`/api/leads/${id}`, { method: 'DELETE' });
      setSavedLeads((prev) => prev.filter((lead) => lead.id !== id));
    } catch (err: any) {
      setErrorMessage(`Falha ao remover o lead: ${err?.message || 'erro desconhecido'}`);
    }
  };

  // Add Manual Lead
  const handleAddManualLead = async (lead: BusinessLead) => {
    setErrorMessage(null);
    try {
      const savedLead = await saveLeadToApi(lead);
      if (!savedLead) return;
      setLeads((prev) => [savedLead, ...prev]);
      setSavedLeads((prev) => [savedLead, ...prev.filter((item) => item.id !== savedLead.id)]);
      setAnalyzingLead(savedLead);
    } catch (err: any) {
      const message = err?.message || 'erro desconhecido';
      setErrorMessage(`Falha ao adicionar o lead: ${message}`);
      throw new Error(message);
    }
  };

  const savedLeadIds = new Set(savedLeads.map((l) => l.id));
  const noWebsiteCount = leads.filter(
    (l) => l.websiteStatus === 'none' || l.websiteStatus === 'social_only'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans antialiased selection:bg-indigo-600 selection:text-white">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        savedCount={savedLeads.length}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenMcpModal={() => setIsMcpModalOpen(true)}
        onOpenQueueModal={() => setIsQueueModalOpen(true)}
        hasGeminiKey={hasGeminiKey}
        hasMapsKey={hasMapsKey}
      />

      <div className="flex-1 flex flex-col min-w-0">
      {errorMessage && (
        <div role="alert" className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="flex-1">{errorMessage}</div>
            <button type="button" onClick={() => setErrorMessage(null)} className="font-bold text-rose-700 hover:text-rose-900">Fechar</button>
          </div>
        </div>
      )}

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
                      Tente alterar a cidade ou a categoria e execute uma nova busca real.
                    </p>
                  </div>
                )
              ) : (
                <MapView
                  leads={leads}
                  onAnalyze={(l) => setAnalyzingLead(l)}
                  onToggleSave={handleToggleSave}
                  savedLeadIds={savedLeadIds}
                  hasMapsKey={hasMapsKey}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'crm' && (
          <>
            <FollowUpQueue />
            <CrmPipeline
              savedLeads={savedLeads}
              onUpdateStatus={handleUpdateStatus}
              onUpdateNotes={handleUpdateNotes}
              onRecordOutcome={handleRecordOutcome}
              onRemoveLead={handleRemoveLead}
              onAnalyze={(l) => setAnalyzingLead(l)}
            />
          </>
        )}

        {activeTab === 'guide' && <StrategyGuide />}

        {activeTab === 'monitoring' && <MonitoringDashboard />}
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

      {/* Duplicate merge confirmation */}
      {duplicateCandidate && (
        <DuplicateMergeModal
          existing={duplicateCandidate.existingLead}
          incoming={duplicateCandidate.incomingLead}
          onMerge={() => duplicateCandidate.resolve('merge')}
          onSeparate={() => duplicateCandidate.resolve('separate')}
          onClose={() => duplicateCandidate.resolve('cancel')}
        />
      )}

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
    </div>
  );
}
