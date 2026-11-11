import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Code2,
  CalendarClock,
  PhoneCall,
  RefreshCw,
  SendHorizonal,
  TriangleAlert,
  Wrench,
  Loader2,
} from 'lucide-react';
import type { ActionItem, ActionItemsResponse } from '../types';

interface NextActionsPanelProps {
  onNavigate: (tab: any) => void;
  onOpenProject: (projectId: string) => void;
}

const KIND_ICON: Record<ActionItem['kind'], React.ReactNode> = {
  code_review: <Code2 className="w-4 h-4" />,
  project_overdue: <CalendarClock className="w-4 h-4" />,
  follow_ups_due: <PhoneCall className="w-4 h-4" />,
  outbox_failed: <SendHorizonal className="w-4 h-4" />,
  outbox_unconfirmed: <TriangleAlert className="w-4 h-4" />,
};

const OUTBOX_KINDS = new Set<ActionItem['kind']>(['outbox_failed', 'outbox_unconfirmed']);

const ageLabel = (hours: number) =>
  hours < 1 ? 'há menos de 1h' : hours < 48 ? `há ${Math.round(hours)}h` : `há ${Math.round(hours / 24)}d`;

/**
 * "Próximas ações" — a lista do que precisa de decisão humana agora.
 * Versão de página (não de faixa): cada item mostra o motivo em uma linha,
 * porque na visão geral o detalhe é o que faz o usuário agir.
 */
export const NextActionsPanel: React.FC<NextActionsPanelProps> = ({ onNavigate, onOpenProject }) => {
  const [data, setData] = useState<ActionItemsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openOutbox, setOpenOutbox] = useState<'failed' | 'unconfirmed' | null>(null);
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
    return () => window.clearInterval(interval);
  }, [load]);

  const handleItemClick = (item: ActionItem) => {
    if (OUTBOX_KINDS.has(item.kind)) {
      setOpenOutbox((prev) => (prev === item.kind ? null : (item.kind === 'outbox_failed' ? 'failed' : 'unconfirmed')));
      return;
    }
    if (item.projectId) onOpenProject(item.projectId);
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
          ? 'Reenvio disparado — acompanhe o status em Follow-ups.'
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
  const failed = data?.outbox?.failed ?? [];
  const unconfirmed = data?.outbox?.unconfirmed ?? [];
  const outboxRows = openOutbox === 'failed' ? failed : openOutbox === 'unconfirmed' ? unconfirmed : [];

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              total > 0 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
            }`}
          >
            {total > 0 ? <Bell className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          </span>
          <h2 className="font-bold text-slate-900 text-sm">Próximas ações</h2>
          {total > 0 ? (
            <span className="inline-flex items-center justify-center min-w-5 px-1.5 h-5 rounded-full bg-rose-600 text-white text-[11px] font-bold">
              {total}
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-emerald-700">tudo em dia</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-8 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="px-3 py-2">
        {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">{error}</p>}

        {!error && items.length === 0 && (
          <p className="text-xs text-slate-600 px-1 py-2">
            Nada pendente: nenhum código aguardando revisão, prazo vencido, recontato ou falha de envio.
          </p>
        )}

        {items.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const isOutbox = OUTBOX_KINDS.has(item.kind);
              const active =
                isOutbox && ((item.kind === 'outbox_failed' && openOutbox === 'failed') || (item.kind === 'outbox_unconfirmed' && openOutbox === 'unconfirmed'));
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-start gap-2.5 px-2 py-2.5 min-h-11 rounded-lg text-left hover:bg-slate-50 ${active ? 'bg-slate-50' : ''}`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border ${
                        item.severity === 'high'
                          ? 'bg-rose-50 text-rose-600 border-rose-100'
                          : 'bg-amber-50 text-amber-700 border-amber-100'
                      }`}
                    >
                      {KIND_ICON[item.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900">{item.title}</span>
                        {!new RegExp(`\\b${item.count}\\b`).test(item.title) && (
                          <span className="text-[11px] font-bold text-slate-600">×{item.count}</span>
                        )}
                      </span>
                      {item.detail && (
                        <span className="block text-[11px] text-slate-600 truncate">{item.detail}</span>
                      )}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-1.5" />
                  </button>

                  {isOutbox && active && outboxRows.length > 0 && (
                    <div className="ml-9 mb-2 border border-slate-200 rounded-xl overflow-hidden">
                      <ul className="divide-y divide-slate-100">
                        {outboxRows.slice(0, 12).map((row) => (
                          <li key={row.communicationId} className="flex items-center justify-between gap-2 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-slate-800 truncate">
                                {row.leadName}
                                <span className="text-slate-500 font-normal"> • {row.channel} • {ageLabel(row.ageHours)}</span>
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">{row.message}</p>
                            </div>
                            {openOutbox === 'failed' && (
                              <button
                                type="button"
                                onClick={() => void handleRetry(row.communicationId)}
                                disabled={retrying === row.communicationId}
                                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md px-2 py-1 min-h-8 disabled:opacity-50"
                              >
                                {retrying === row.communicationId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                                Reenviar
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      {outboxRows.length > 12 && (
                        <p className="px-3 py-1.5 text-[11px] text-slate-600 bg-slate-50 border-t border-slate-100">
                          +{outboxRows.length - 12} não listados — veja todos em Follow-ups.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {notice && (
          <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5 mt-2">{notice}</p>
        )}
      </div>
    </section>
  );
};

export default NextActionsPanel;
