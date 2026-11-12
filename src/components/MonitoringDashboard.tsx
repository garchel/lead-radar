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
  RefreshCw,
} from 'lucide-react';
import { ScheduleManager } from './ScheduleManager';
import { BatchJobForm } from './BatchJobForm';
import { Power, Plus, Trash2, Ban, X } from 'lucide-react';

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

export const MonitoringDashboard: React.FC = () => {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 });
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [showNewJob, setShowNewJob] = useState(false);
  const [schedulerEnabled, setSchedulerEnabled] = useState<boolean | null>(null);
  const [savingScheduler, setSavingScheduler] = useState(false);

  // O agendador global mora aqui (é ele quem liga a lista de agendamentos abaixo).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/automation/settings');
        const data = await res.json();
        if (data?.success) setSchedulerEnabled(Boolean(data.settings?.schedulerEnabled));
      } catch { /* mostra como desconhecido */ }
    })();
  }, []);

  const toggleScheduler = async () => {
    if (schedulerEnabled === null) return;
    setSavingScheduler(true);
    try {
      const next = !schedulerEnabled;
      const res = await fetch('/api/automation/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedulerEnabled: next }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Falha ao salvar');
      setSchedulerEnabled(Boolean(data.settings?.schedulerEnabled));
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar o agendador.');
    } finally {
      setSavingScheduler(false);
    }
  };

  const cancelJob = async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao cancelar');
      await fetchData();
    } catch (e: any) {
      setError(e?.message || 'Falha ao cancelar o job.');
    }
  };

  const clearCompleted = async () => {
    try {
      const res = await fetch('/api/jobs/completed', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao limpar');
      await fetchData();
    } catch (e: any) {
      setError(e?.message || 'Falha ao limpar concluídos.');
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const jobsResponse = await fetch('/api/jobs');
      const jobsRes = await jobsResponse.json().catch(() => ({}));
      if (!jobsResponse.ok || !jobsRes?.success) {
        throw new Error(jobsRes?.error || `Falha ao consultar jobs (HTTP ${jobsResponse.status}).`);
      }
      if (!Array.isArray(jobsRes.jobs) || !jobsRes.metrics) {
        throw new Error('A API de monitoramento retornou dados inválidos.');
      }
      setJobs(jobsRes.jobs);
      setMetrics(jobsRes.metrics);
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
        if (data?.event === 'jobs') {
          fetchData();
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [fetchData]);

  const kpiCards = [
    { label: 'Total de Jobs', value: metrics.total, icon: Layers, color: 'text-slate-700 bg-slate-100' },
    { label: 'Processando', value: metrics.processing, icon: Loader2, color: 'text-indigo-700 bg-indigo-100' },
    { label: 'Na Fila', value: metrics.pending, icon: Clock, color: 'text-amber-700 bg-amber-100' },
    { label: 'Concluídos', value: metrics.completed, icon: CheckCircle2, color: 'text-emerald-700 bg-emerald-100' },
    { label: 'Falhos', value: metrics.failed, icon: XCircle, color: 'text-rose-700 bg-rose-100' },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" /> Fila &amp; Agendamentos
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Tudo que roda em segundo plano: tarefas em lote, progresso e a agenda de prospecção.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${connected ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-slate-500 border-slate-200 bg-slate-50'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>{connected ? 'Tempo real' : 'Offline'}</span>
          </span>
          <button
            type="button"
            onClick={() => void toggleScheduler()}
            disabled={savingScheduler || schedulerEnabled === null}
            className={`flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
              schedulerEnabled
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
            } disabled:opacity-50`}
            title="Liga/desliga todos os agendamentos abaixo"
          >
            <Power className="w-3.5 h-3.5" />
            <span>{schedulerEnabled === null ? 'Agendador…' : schedulerEnabled ? 'Agendador ligado' : 'Agendador desligado'}</span>
          </button>
          <button onClick={fetchData} className="flex items-center space-x-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all">
            <RefreshCw className="w-4 h-4" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-2 md:grid-cols-5 gap-4 ${metrics.total === 0 ? 'hidden' : ''}`}>
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

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowNewJob((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {showNewJob ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} {showNewJob ? 'Fechar' : 'Nova tarefa em lote'}
        </button>
        {showNewJob && <BatchJobForm onCreated={() => void fetchData()} />}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span>Jobs na Fila</span>
          </h2>
          <div className="flex items-center gap-3">
            {metrics.completed > 0 && (
              <button type="button" onClick={() => void clearCompleted()} className="text-xs font-semibold text-slate-500 hover:text-rose-600 inline-flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Limpar concluídos
              </button>
            )}
            <span className="text-xs text-slate-500">{jobs.length} no histórico</span>
          </div>
        </div>
        {jobs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Nenhum job ainda. Use <strong>Nova tarefa em lote</strong> acima ou crie um agendamento abaixo.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <li key={job.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-800 text-sm truncate">{job.title}</span>
                      <span className={`text-[11px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[job.status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>{job.status}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{job.type}</span>
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
                    {(job.status === 'pending' || job.status === 'processing') && (
                      <button onClick={() => void cancelJob(job.id)} className="text-xs font-medium text-rose-600 hover:text-rose-800 px-2 py-1 inline-flex items-center gap-1" title="Cancelar este job">
                        <Ban className="w-3 h-3" /> Cancelar
                      </button>
                    )}
                  </div>
                </div>
                {expanded[job.id] && (
                  <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5">
                    {job.error && <p className="text-xs text-rose-600">Erro: {job.error}</p>}
                    {(job.logs || []).map((log, i) => (
                      <div key={i} className="flex items-start space-x-2 text-xs">
                        <span className="text-slate-500 font-mono shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={log.level === 'error' ? 'text-rose-600' : log.level === 'warning' ? 'text-amber-600' : log.level === 'success' ? 'text-emerald-600' : 'text-slate-600'}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                    {job.result && (
                      <pre className="text-[11px] text-slate-500 bg-white border border-slate-200 rounded-lg p-2 overflow-x-auto">{JSON.stringify(job.result, null, 2)}</pre>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ScheduleManager />
    </div>
  );
};
