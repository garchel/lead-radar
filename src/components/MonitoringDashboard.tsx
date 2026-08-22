import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Layers,
  Rocket,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  LayoutTemplate,
} from 'lucide-react';
import { ScheduleManager } from './ScheduleManager';

interface JobView {
  id: string;
  type: string;
  title: string;
  status: string;
  progress: number;
  createdAt: string;
  logs?: { timestamp: string; message: string; level: string }[];
  result?: any;
  error?: string;
}

interface LandingPageView {
  id: string;
  businessName: string;
  status: string;
  stage: string;
  url?: string | null;
  slug: string;
}

interface Metrics {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  processing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

const LP_STATUS_STYLES: Record<string, string> = {
  aguardando_aprovacao: 'bg-amber-50 text-amber-700 border-amber-200',
  em_producao: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  aprovada: 'bg-sky-50 text-sky-700 border-sky-200',
  publicada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejeitada: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const MonitoringDashboard: React.FC = () => {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 });
  const [landingPages, setLandingPages] = useState<LandingPageView[]>([]);
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [jobsResponse, lpResponse] = await Promise.all([
        fetch('/api/jobs'),
        fetch('/api/landing-pages'),
      ]);
      const [jobsRes, lpRes] = await Promise.all([
        jobsResponse.json().catch(() => ({})),
        lpResponse.json().catch(() => ({})),
      ]);
      if (!jobsResponse.ok || !jobsRes?.success) {
        throw new Error(jobsRes?.error || `Falha ao consultar jobs (HTTP ${jobsResponse.status}).`);
      }
      if (!lpResponse.ok || !lpRes?.success) {
        throw new Error(lpRes?.error || `Falha ao consultar landing pages (HTTP ${lpResponse.status}).`);
      }
      if (!Array.isArray(jobsRes.jobs) || !jobsRes.metrics || !Array.isArray(lpRes.landingPages)) {
        throw new Error('A API de monitoramento retornou dados inválidos.');
      }
      setJobs(jobsRes.jobs);
      setMetrics(jobsRes.metrics);
      setLandingPages(lpRes.landingPages);
      setError(null);
    } catch (err: any) {
      setError(`Falha ao carregar o monitoramento: ${err?.message || 'erro desconhecido'}`);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const es = new EventSource('/api/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      setError('Falha na conexão de eventos em tempo real (/api/events).');
    };
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data?.event === 'jobs' || data?.event === 'landing_pages') {
          fetchData();
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [fetchData]);

  const runLpAction = async (id: string, action: 'approve' | 'reject' | 'deploy') => {
    setError(null);
    try {
      const response = await fetch(`/api/landing-pages/${id}/${action}`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || `Falha ao executar ${action} (HTTP ${response.status}).`);
      }
      await fetchData();
    } catch (err: any) {
      setError(`Falha ao executar ${action}: ${err?.message || 'erro desconhecido'}`);
    }
  };

  const kpiCards = [
    { label: 'Total de Jobs', value: metrics.total, icon: Layers, color: 'text-slate-700 bg-slate-100' },
    { label: 'Processando', value: metrics.processing, icon: Loader2, color: 'text-indigo-700 bg-indigo-100' },
    { label: 'Na Fila', value: metrics.pending, icon: Clock, color: 'text-amber-700 bg-amber-100' },
    { label: 'Concluídos', value: metrics.completed, icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-100' },
    { label: 'Falhos', value: metrics.failed, icon: XCircle, color: 'text-rose-700 bg-rose-100' },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Monitoramento de Operação</h1>
            <p className="text-sm text-slate-500">Acompanhe jobs de prospecção e criação de landing pages em tempo real.</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${connected ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-slate-500 border-slate-200 bg-slate-50'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>{connected ? 'Tempo real' : 'Offline'}</span>
          </span>
          <button onClick={fetchData} className="flex items-center space-x-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all">
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${k.color}`}>
              <k.icon className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{k.value}</div>
            <div className="text-xs text-slate-500 font-medium">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Jobs na Fila</span>
          </h2>
          <span className="text-xs text-slate-500">{jobs.length} no histórico</span>
        </div>
        {jobs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Nenhum job ainda. Inicie uma prospecção em lote ou crie uma landing page pela aba Automação.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <li key={job.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-800 text-sm truncate">{job.title}</span>
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[job.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{job.status}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{job.type}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${job.status === 'failed' ? 'bg-rose-500' : job.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-700">{job.progress}%</span>
                    <button onClick={() => setExpanded((p) => ({ ...p, [job.id]: !p[job.id] }))} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1">
                      {expanded[job.id] ? 'Ocultar' : 'Detalhes'}
                    </button>
                  </div>
                </div>
                {expanded[job.id] && (
                  <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
                    {job.error && <p className="text-xs text-rose-600">Erro: {job.error}</p>}
                    {(job.logs || []).map((log, i) => (
                      <div key={i} className="flex items-start space-x-2 text-xs">
                        <span className="text-slate-400 font-mono shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={log.level === 'error' ? 'text-rose-600' : log.level === 'warning' ? 'text-amber-600' : log.level === 'success' ? 'text-emerald-600' : 'text-slate-600'}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                    {job.result && (
                      <pre className="text-[10px] text-slate-500 bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto">{JSON.stringify(job.result, null, 2)}</pre>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ScheduleManager />


      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 flex items-center space-x-2">
            <LayoutTemplate className="w-4 h-4 text-indigo-600" />
            <span>Landing Pages</span>
          </h2>
          <span className="text-xs text-slate-500">{landingPages.length} geradas</span>
        </div>
        {landingPages.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">Nenhuma landing page gerada ainda.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {landingPages.map((lp) => (
              <li key={lp.id} className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-800 text-sm truncate">{lp.businessName}</span>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${LP_STATUS_STYLES[lp.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{lp.status}</span>
                    <span className="text-[10px] text-slate-400 font-mono">estágio: {lp.stage}</span>
                  </div>
                  {lp.url && (
                    <a href={lp.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center space-x-1 text-xs text-indigo-600 hover:text-indigo-800">
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{lp.url}</span>
                    </a>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {lp.status === 'aguardando_aprovacao' && (
                    <>
                      <button onClick={() => runLpAction(lp.id, 'approve')} className="flex items-center space-x-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-all">
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>Aprovar</span>
                      </button>
                      <button onClick={() => runLpAction(lp.id, 'reject')} className="flex items-center space-x-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 px-2.5 py-1.5 rounded-lg transition-all">
                        <ThumbsDown className="w-3.5 h-3.5" />
                        <span>Rejeitar</span>
                      </button>
                    </>
                  )}
                  {lp.status === 'aprovada' && (
                    <button onClick={() => runLpAction(lp.id, 'deploy')} className="flex items-center space-x-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-lg transition-all">
                      <Rocket className="w-3.5 h-3.5" />
                      <span>Publicar</span>
                    </button>
                  )}
                  <a href={`/landing-pages/${lp.id}`} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-1 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all">
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Prévia</span>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
