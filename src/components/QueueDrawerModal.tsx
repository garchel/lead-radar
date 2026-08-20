import React, { useState, useEffect } from 'react';
import { X, Layers, Play, CheckCircle2, AlertCircle, Clock, Trash2, Ban, RefreshCw, ChevronRight, Sparkles, Building2, MapPin } from 'lucide-react';
import { BusinessLead } from '../types';

export interface QueueJobLog {
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

export interface QueueJob {
  id: string;
  type: 'batch_prospecting' | 'batch_lead_analysis' | 'mcp_autopilot';
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  payload: any;
  result?: any;
  error?: string;
  logs: QueueJobLog[];
}

interface QueueDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportLeads: (leads: BusinessLead[]) => void | Promise<void>;
}

export const QueueDrawerModal: React.FC<QueueDrawerModalProps> = ({
  isOpen,
  onClose,
  onImportLeads,
}) => {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'new_job'>('queue');
  const [selectedJob, setSelectedJob] = useState<QueueJob | null>(null);

  // Form State for new async prospecting job
  const [citiesInput, setCitiesInput] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [filterNoWebsite, setFilterNoWebsite] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Poll queue status
  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/jobs');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Falha ao consultar a fila (HTTP ${res.status}).`);
      }
      if (!Array.isArray(data.jobs) || !data.metrics) {
        throw new Error('A API da fila retornou uma resposta inválida.');
      }
      setJobs(data.jobs);
      setMetrics(data.metrics);
      if (selectedJob) {
        const updated = data.jobs.find((j: QueueJob) => j.id === selectedJob.id);
        if (updated) setSelectedJob(updated);
      }
      setError(null);
    } catch (err: any) {
      setError(`Erro ao carregar a fila: ${err?.message || 'falha desconhecida'}`);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchQueue().finally(() => setLoading(false));
      const interval = setInterval(fetchQueue, 1500);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const handleCreateBatchJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCreating(true);

    const locations = citiesInput
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    if (locations.length === 0 || !selectedState || !selectedCategory) {
      setError('Informe ao menos uma cidade, o estado e a categoria antes de enfileirar o job.');
      setIsCreating(false);
      return;
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'batch_prospecting',
          title: `Prospecção Assíncrona: ${locations.join(', ')}`,
          payload: {
            locations,
            state: selectedState,
            categories: [selectedCategory],
            filterNoWebsiteOnly: filterNoWebsite,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Falha ao enfileirar job (HTTP ${res.status}).`);
      }
      await fetchQueue();
      setActiveTab('queue');
      if (data.job) setSelectedJob(data.job);
    } catch (err: any) {
      setError(`Erro ao enfileirar job: ${err?.message || 'falha na requisição'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelJob = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${id}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Falha ao cancelar job (HTTP ${res.status}).`);
      }
      await fetchQueue();
    } catch (err: any) {
      setError(`Erro ao cancelar job: ${err?.message || 'falha desconhecida'}`);
    }
  };

  const handleClearCompleted = async () => {
    setError(null);
    try {
      const res = await fetch('/api/jobs/completed', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Falha ao limpar jobs (HTTP ${res.status}).`);
      }
      await fetchQueue();
    } catch (err: any) {
      setError(`Erro ao limpar jobs: ${err?.message || 'falha desconhecida'}`);
    }
  };

  const handleImportResults = async (job: QueueJob) => {
    setError(null);
    if (!job.result || !Array.isArray(job.result.leads)) {
      setError('O job concluído não contém uma lista de leads importável.');
      return;
    }

    const requiredFields = ['id', 'name', 'category', 'address', 'city', 'state', 'websiteStatus'];
    const invalidIndex = job.result.leads.findIndex((lead: any) =>
      requiredFields.some((field) => typeof lead[field] !== 'string' || !lead[field].trim()) ||
      !['none', 'social_only', 'has_website'].includes(lead.websiteStatus)
    );
    if (invalidIndex >= 0) {
      setError(`O lead ${invalidIndex + 1} do job não possui todos os dados obrigatórios. Nenhum lead foi importado.`);
      return;
    }

    const leadsToImport = job.result.leads as BusinessLead[];
    setIsImporting(true);
    try {
      await onImportLeads(leadsToImport);
      setError(`${leadsToImport.length} lead(s) importado(s) para o CRM.`);
    } catch (err: any) {
      setError(`Falha ao importar resultados: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-md">
              <Layers className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-lg">Fila de Processamento Assíncrono</h3>
                <span className="bg-indigo-500/20 text-indigo-300 text-[11px] font-bold px-2 py-0.5 rounded-full border border-indigo-500/30 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                  <span>Queue Worker Ativo</span>
                </span>
              </div>
              <p className="text-slate-400 text-xs">Execute varreduras em lote em segundo plano sem travar a interface</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metrics Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 text-xs font-semibold overflow-x-auto shrink-0">
          <div className="flex items-center space-x-4">
            <span className="text-slate-600 flex items-center space-x-1">
              <span className="font-bold text-slate-900">{metrics.total || 0}</span>
              <span>Total na Fila</span>
            </span>
            <span className="text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{metrics.processing || 0} em Execução</span>
            </span>
            <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{metrics.completed || 0} Concluídos</span>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('new_job')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all shadow-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>+ Nova Prospecção em Lote</span>
            </button>
            {(metrics.completed > 0 || metrics.failed > 0 || metrics.cancelled > 0) && (
              <button
                onClick={handleClearCompleted}
                className="text-slate-500 hover:text-slate-800 hover:bg-slate-200 p-1.5 rounded-lg transition-colors"
                title="Limpar Histórico Concluído"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100 px-6 pt-2 gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center space-x-2 ${
              activeTab === 'queue'
                ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Lista de Jobs ({jobs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('new_job')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center space-x-2 ${
              activeTab === 'new_job'
                ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Disparar Tarefa Assíncrona</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto grow space-y-4">
          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              {error}
            </div>
          )}
          {activeTab === 'new_job' && (
            <form onSubmit={handleCreateBatchJob} className="max-w-xl mx-auto space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center space-x-2 pb-2 border-b border-slate-200">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h4 className="font-bold text-sm text-slate-800">Criar Tarefa de Prospecção em Lote Assíncrona</h4>
              </div>

              <p className="text-xs text-slate-600">
                O worker em segundo plano vai mapear múltiplas cidades sequencialmente sem travar a tela. Você receberá atualizações em tempo real nesta fila!
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Cidades Alvo (separadas por vírgula):</span>
                </label>
                <input
                  type="text"
                  value={citiesInput}
                  onChange={(e) => setCitiesInput(e.target.value)}
                  placeholder="Ex: Campinas, Sorocaba, Jundiaí"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Estado (UF):</label>
                  <select
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                    required
                  >
                    <option value="">Selecione o estado</option>
                    <option value="SP">São Paulo (SP)</option>
                    <option value="RJ">Rio de Janeiro (RJ)</option>
                    <option value="MG">Minas Gerais (MG)</option>
                    <option value="PR">Paraná (PR)</option>
                    <option value="RS">Rio Grande do Sul (RS)</option>
                    <option value="SC">Santa Catarina (SC)</option>
                    <option value="BA">Bahia (BA)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Categoria Comercial:</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                    required
                  >
                    <option value="">Selecione a categoria</option>
                    <option value="Estética & Saúde">Clínica de Estética & Salão</option>
                    <option value="Dentista / Clínica Odontológica">Dentista / Odontologia</option>
                    <option value="Oficina Mecânica & Estética Automotiva">Oficina Mecânica</option>
                    <option value="Academia & Studio de Personal">Academia & Personal</option>
                    <option value="Restaurante, Hamburgueria & Gastronomia">Gastronomia / Restaurante</option>
                    <option value="Advocacia & Serviços Jurídicos">Advocacia / Jurídico</option>
                    <option value="Pet Shop & Clínica Veterinária">Pet Shop & Veterinária</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2 bg-white p-3 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="filterNoWebsiteQueue"
                  checked={filterNoWebsite}
                  onChange={(e) => setFilterNoWebsite(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <label htmlFor="filterNoWebsiteQueue" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Filtrar apenas Oportunidades <strong>Ouro</strong> (sem site) ou <strong>Prata</strong> (apenas Instagram)
                </label>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('queue')}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl flex items-center space-x-2 transition-all shadow-md disabled:opacity-50"
                >
                  {isCreating ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>Enfileirar Job no Worker</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'queue' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: Job List */}
              <div className="md:col-span-1 space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Fila de Tarefas ({jobs.length})
                </span>

                {jobs.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-medium">Nenhuma tarefa na fila.</p>
                    <button
                      onClick={() => setActiveTab('new_job')}
                      className="mt-3 text-xs font-bold text-indigo-600 hover:underline"
                    >
                      + Enfileirar nova varredura
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {jobs.map((j) => {
                      const isSelected = selectedJob?.id === j.id;
                      return (
                        <div
                          key={j.id}
                          onClick={() => setSelectedJob(j)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all text-xs ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-400 shadow-xs'
                              : 'bg-white hover:bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-slate-800 truncate pr-2" title={j.title}>
                              {j.title}
                            </span>
                            {j.status === 'processing' && (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-1 shrink-0">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>{j.progress}%</span>
                              </span>
                            )}
                            {j.status === 'completed' && (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center space-x-1 shrink-0">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>OK</span>
                              </span>
                            )}
                            {j.status === 'pending' && (
                              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                Pendente
                              </span>
                            )}
                            {j.status === 'failed' && (
                              <span className="bg-red-100 text-red-800 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                Erro
                              </span>
                            )}
                          </div>

                          {/* Progress bar */}
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-1.5">
                            <div
                              className={`h-full transition-all duration-300 ${
                                j.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : j.status === 'failed'
                                  ? 'bg-red-500'
                                  : 'bg-indigo-600'
                              }`}
                              style={{ width: `${j.progress}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-slate-400">
                            <span>ID: {j.id.split('_')[2]}</span>
                            <span>{new Date(j.createdAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Detailed View & Logs */}
              <div className="md:col-span-2 space-y-4">
                {selectedJob ? (
                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4">
                    {/* Selected Job Header */}
                    <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-sm text-slate-900">{selectedJob.title}</h4>
                          <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                            {selectedJob.id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Criado às {new Date(selectedJob.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        {(selectedJob.status === 'pending' || selectedJob.status === 'processing') && (
                          <button
                            onClick={() => handleCancelJob(selectedJob.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200 flex items-center space-x-1"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Cancelar</span>
                          </button>
                        )}

                        {selectedJob.status === 'completed' && selectedJob.result?.leads && (
                          <button
                            onClick={() => void handleImportResults(selectedJob)}
                            disabled={isImporting}
                            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center space-x-1"
                          >
                            <Building2 className="w-3.5 h-3.5" />
                            <span>Importar {selectedJob.result.leads.length} Leads para CRM</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar Detail */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-700">Progresso do Job em Segundo Plano</span>
                        <span className="text-indigo-600">{selectedJob.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            selectedJob.status === 'completed'
                              ? 'bg-emerald-500'
                              : selectedJob.status === 'failed'
                              ? 'bg-red-500'
                              : 'bg-indigo-600'
                          }`}
                          style={{ width: `${selectedJob.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Results Card if Finished */}
                    {selectedJob.result && (
                      <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-950 space-y-1">
                        <span className="font-bold block">✨ Resultado Gerado pelo Worker:</span>
                        {selectedJob.result.totalFound !== undefined && (
                          <p>Total de Leads Encontrados: <strong>{selectedJob.result.totalFound}</strong> empresas</p>
                        )}
                        {selectedJob.result.locationsProcessed && (
                          <p>Cidades varridas: {selectedJob.result.locationsProcessed.join(', ')}</p>
                        )}
                      </div>
                    )}

                    {/* Worker Console Logs */}
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-1">Logs em Tempo Real do Worker:</span>
                      <div className="bg-slate-900 text-slate-200 p-3.5 rounded-xl font-mono text-[11px] max-h-56 overflow-y-auto space-y-1 border border-slate-800">
                        {selectedJob.logs.map((log, idx) => (
                          <div key={idx} className="flex items-start space-x-2 leading-relaxed">
                            <span className="text-slate-500 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                            <span
                              className={
                                log.level === 'success'
                                  ? 'text-emerald-400'
                                  : log.level === 'error'
                                  ? 'text-red-400'
                                  : log.level === 'warning'
                                  ? 'text-amber-400'
                                  : 'text-slate-300'
                              }
                            >
                              {log.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center text-slate-400">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-xs font-semibold">Selecione uma tarefa na lista ao lado para inspecionar os logs e o progresso.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Concurrency Engine: Max 2 Workers em Simultâneo</span>
          <button
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-4 py-2 rounded-xl transition-colors"
          >
            Fechar Fila
          </button>
        </div>
      </div>
    </div>
  );
};
