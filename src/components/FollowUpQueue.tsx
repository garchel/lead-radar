import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Send, MessageSquareWarning, PhoneCall, Mail, Loader2, UserX, Clock } from 'lucide-react';
import { BusinessLead } from '../types';

interface FollowUpItem {
  id: string;
  leadId: string;
  type: string;
  channel?: string;
  deliveryStatus: string;
  outcome: string;
  occurredAt: string;
  nextContactAt?: string;
  notes?: string;
  lead: BusinessLead;
}

const OUTCOME_LABELS: Record<string, string> = {
  negative: 'Resposta negativa',
  no_response: 'Sem resposta',
  positive: 'Demonstrou interesse',
  meeting_scheduled: 'Reunião agendada',
  negotiating: 'Em negociação',
};

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  whatsapp: <PhoneCall className="w-3.5 h-3.5" />,
  email: <Mail className="w-3.5 h-3.5" />,
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export const FollowUpQueue: React.FC = () => {
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchDue = useCallback(async () => {
    try {
      const response = await fetch('/api/follow-ups/due');
      const res = await response.json().catch(() => ({}));
      if (!response.ok || !res?.success) {
        throw new Error(res?.error || `Falha ao consultar recontatos (HTTP ${response.status}).`);
      }
      if (!Array.isArray(res.followUps)) {
        throw new Error('A API retornou uma lista de recontatos inválida.');
      }
      setFollowUps(res.followUps);
      setError(null);
    } catch (err: any) {
      setError(`Erro ao carregar recontatos: ${err?.message || 'falha desconhecida'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDue();
    const es = new EventSource('/api/events');
    es.onmessage = (evt) => {
      try {
        const d = JSON.parse(evt.data);
        if (d?.event === 'interactions' || d?.event === 'leads') void fetchDue();
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [fetchDue]);

  const handleContact = async (item: FollowUpItem) => {
    setSending(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/leads/${item.leadId}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await response.json().catch(() => ({}));
      if (!response.ok || res?.success === false) {
        throw new Error(res?.error || `Falha ao enviar contato (HTTP ${response.status}).`);
      }
      setNotice(`Contato enviado para ${item.lead.name}.`);
      await fetchDue();
    } catch (err: any) {
      setError(`Falha ao contatar ${item.lead.name}: ${err?.message || 'erro desconhecido'}`);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-slate-900 flex items-center space-x-2">
            <MessageSquareWarning className="w-4 h-4 text-indigo-600" />
            <span>Recontatos autorizados</span>
            {followUps.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-600 text-white">
                {followUps.length}
              </span>
            )}
          </h2>
          <button
            onClick={fetchDue}
            className="flex items-center space-x-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
        </div>

        {error && <div role="alert" className="px-5 py-3 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">{error}</div>}
        {notice && <div role="status" className="px-5 py-3 text-xs text-emerald-700 bg-emerald-50 border-b border-emerald-200">{notice}</div>}

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Carregando recontatos...</div>
        ) : followUps.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 space-y-1">
            <p>Nenhum recontato com prazo vencido no momento.</p>
            <p className="text-xs text-slate-400">
              Recusas liberam novo contato após 30 dias; sem-resposta após 7 dias.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {followUps.map((item) => (
              <li key={item.id} className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-800 text-sm truncate">{item.lead.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {item.lead.city}{item.lead.state ? ` · ${item.lead.state}` : ''}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 flex items-center space-x-3 flex-wrap">
                    {item.channel && (
                      <span className="inline-flex items-center space-x-1">
                        {CHANNEL_ICON[item.channel] || null}
                        <span>{item.channel}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>Últ. contato: {fmtDate(item.occurredAt)}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600">
                      {OUTCOME_LABELS[item.outcome] || item.outcome}
                    </span>
                    {item.notes && (
                      <span className="text-slate-400 truncate max-w-xs" title={item.notes}>
                        {item.notes}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => handleContact(item)}
                    disabled={sending === item.id}
                    className="flex items-center space-x-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-2 rounded-lg transition-all"
                    title="Enviar mensagem de recontato (aprovação humana)"
                  >
                    {sending === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Enviar contato</span>
                  </button>
                  {item.lead.doNotContact && (
                    <span className="inline-flex items-center space-x-1 text-[10px] font-semibold text-rose-600">
                      <UserX className="w-3 h-3" />
                      <span>Bloqueado</span>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};