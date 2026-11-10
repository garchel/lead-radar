import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Code2,
  CalendarClock,
  PhoneCall,
  RefreshCw,
  SendHorizonal,
  TriangleAlert,
  Wrench,
  Loader2,
} from 'lucide-react';
import { ActionItem, ActionItemsResponse } from '../types';

interface NextActionsBarProps {
  onNavigate: (tab: 'projects' | 'crm' | 'growth') => void;
  onOpenProject: (projectId: string) => void;
}

const KIND_ICON: Record<ActionItem['kind'], React.ReactNode> = {
  code_review: <Code2 className="w-3.5 h-3.5" />,
  project_overdue: <CalendarClock className="w-3.5 h-3.5" />,
  follow_ups_due: <PhoneCall className="w-3.5 h-3.5" />,
  outbox_failed: <SendHorizonal className="w-3.5 h-3.5" />,
  outbox_unconfirmed: <TriangleAlert className="w-3.5 h-3.5" />,
};

const OUTBOX_KINDS = new Set<ActionItem['kind']>(['outbox_failed', 'outbox_unconfirmed']);

const ageLabel = (hours: number) =>
  hours < 1 ? 'há menos de 1h' : hours < 48 ? `há ${Math.round(hours)}h` : `há ${Math.round(hours / 24)}d`;

/**
 * Faixa "Próximas ações": agrega o que precisa de atenção agora
 * (projetos com código entregue, prazos vencidos, recontatos e a outbox).
 * Clicar navega para a aba certa — itens de projeto abrem o modal do projeto.
 */
export const NextActionsBar: React.FC<NextActionsBarProps> = ({ onNavigate, onOpenProject }) => {
  const [data, setData] = useState<ActionItemsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/action-items');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || `Falha ao carregar próximas ações (HTTP ${response.status}).`);
      }
      setData(payload as ActionItemsResponse);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar próximas ações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, 60_000);
    const es = new EventSource('/api/events');
    es.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data);
        if (d?.event === 'projects' || d?.event === 'leads' || d?.event === 'interactions' || d?.event === 'communications') {
          void load();
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      window.clearInterval(interval);
      es.close();
    };
  }, [load]);

  const handleItemClick = (item: ActionItem) => {
    if (OUTBOX_KINDS.has(item.kind)) {
      setOutboxOpen((prev) => !prev);
      return;
    }
    if (item.projectId) {
      onOpenProject(item.projectId);
    }
    onNavigate(item.tab);
  };

  const handleRetry = async (communicationId: string) => {
    setRetrying(communicationId);
    setNotice(null);
    try {
      const response = await fetch(`/api/outbox/${communicationId}/retry`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      setNotice(
        response.ok && payload?.success
          ? 'Reenvio disparado. Acompanhe o status em Monitoramento.'
          : payload?.detail || payload?.error || 'Falha ao reenviar.'
      );
      void load();
    } catch (err: any) {
      setNotice(err?.message || 'Falha ao reenviar.');
    } finally {
      setRetrying(null);
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasOutbox = Boolean(data && (data.outbox.failed.length > 0 || data.outbox.unconfirmed.length > 0));

  const outboxContent = (kind: ActionItem['kind']) =>
    kind === 'outbox_failed' ? data?.outbox.failed ?? [] : data?.outbox.unconfirmed ?? [];

  return (
    <div className="mb-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors"
          title={expanded ? 'Recolher' : 'Expandir'}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                total > 0 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
              }`}
            >
              {total > 0 ? <Bell className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            </span>
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Próximas ações
            </span>
            {total > 0 ? (
              <span className="inline-flex items-center justify-center min-w-5 px-1.5 h-5 rounded-full bg-rose-600 text-white text-[11px] font-bold">
                {total}
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-emerald-600">tudo em dia</span>
            )}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                void load();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  void load();
                }
              }}
              className="p-1.5 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
              title="Atualizar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${expanded ? '' : '-rotate-90'}`} />
          </span>
        </button>

        {expanded && (
          <div className="border-t border-slate-100 px-3 py-2.5">
            {error && <p className="text-[11px] text-rose-600 px-1 pb-2">{error}</p>}
            {!error && items.length === 0 && (
              <p className="text-[11px] text-slate-500 px-1 py-1">
                Nada pendente: nenhum código aguardando revisão, prazo vencido, recontato ou falha de envio.
              </p>
            )}
            {items.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {items.map((item) => {
                  const isOutbox = OUTBOX_KINDS.has(item.kind);
                  const active = isOutbox && outboxOpen;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleItemClick(item)}
                      title={item.detail || undefined}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                        item.severity === 'high'
                          ? 'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 hover:bg-rose-100'
                          : 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100'
                      } ${active ? 'ring-2 ring-rose-200' : ''}`}
                    >
                      {KIND_ICON[item.kind]}
                      <span className="max-w-52 truncate">{item.title}</span>
                      {!new RegExp(`\\b${item.count}\\b`).test(item.title) && (
                        <span className="text-[11px] font-bold opacity-70">×{item.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {notice && (
              <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 mt-2">
                {notice}
              </p>
            )}

            {hasOutbox && outboxOpen && (
              <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                {(['outbox_failed', 'outbox_unconfirmed'] as const).map((kind) => {
                  const rows = outboxContent(kind);
                  if (rows.length === 0) return null;
                  const isFailed = kind === 'outbox_failed';
                  return (
                    <div key={kind} className="border-b border-slate-100 last:border-b-0">
                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5">
                        {isFailed ? (
                          <SendHorizonal className="w-3.5 h-3.5 text-rose-600" />
                        ) : (
                          <TriangleAlert className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          {isFailed ? 'Falhados — reenvio manual' : 'Sem ACK há +24h'}
                        </span>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {rows.map((row) => (
                          <li key={row.communicationId} className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-slate-700 truncate">
                                {row.leadName}
                                <span className="text-slate-500 font-normal"> • {row.channel} • {ageLabel(row.ageHours)}</span>
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">{row.message}</p>
                            </div>
                            {isFailed && (
                              <button
                                type="button"
                                onClick={() => void handleRetry(row.communicationId)}
                                disabled={retrying === row.communicationId}
                                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                              >
                                {retrying === row.communicationId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Wrench className="w-3 h-3" />
                                )}
                                Reenviar
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onNavigate('growth')}
                    className="text-[11px] font-bold text-indigo-600 hover:underline"
                  >
                    Ver métricas de entrega no Crescimento →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
