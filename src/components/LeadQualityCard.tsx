import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

/**
 * Qualificação do banco: quantos números existem no WhatsApp.
 *
 * A consulta é `POST /api/leads/whatsapp/validate` — fala com o gateway e
 * pergunta se o número existe. Não envia mensagem e não gasta cota de busca.
 */

interface Summary {
  yes: number;
  no: number;
  pending: number;
  noPhone: number;
  total: number;
}

export const LeadQualityCard: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads/whatsapp/summary');
      const data = await res.json();
      if (data?.success && data.summary) setSummary(data.summary as Summary);
    } catch {
      /* card é informativo: mantém o último valor */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const validar = async () => {
    setRunning(true);
    setNotice(null);
    try {
      const res = await fetch('/api/leads/whatsapp/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 }),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setNotice(data?.error || 'Falha ao validar.');
      } else {
        setNotice(
          `${data.checked} número(s) checado(s): ${data.yes} com WhatsApp, ${data.no} sem WhatsApp${
            data.unknown ? `, ${data.unknown} sem resposta` : ''
          }.${data.totals?.pending ? ` Ainda faltam ${data.totals.pending}.` : ' Banco todo validado.'}`
        );
        if (data.totals) setSummary(data.totals as Summary);
      }
    } catch (err: any) {
      setNotice(err?.message || 'Falha ao validar.');
    } finally {
      setRunning(false);
    }
  };

  const pendentes = summary?.pending ?? 0;
  const total = summary?.total ?? 0;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Qualificação dos leads
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Só número com WhatsApp entra na fila de contato. A checagem não envia mensagem e não gasta cota de busca.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-8 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            type="button"
            onClick={() => void validar()}
            disabled={running || pendentes === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            {pendentes > 0 ? `Validar ${Math.min(pendentes, 100)} pendente(s)` : 'Nada pendente'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {[
          { label: 'Com WhatsApp', value: summary?.yes ?? 0, icon: <CheckCircle2 className="w-4 h-4" />, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Sem WhatsApp', value: summary?.no ?? 0, icon: <XCircle className="w-4 h-4" />, tone: 'text-rose-700 bg-rose-50 border-rose-200' },
          { label: 'A validar', value: pendentes, icon: <HelpCircle className="w-4 h-4" />, tone: 'text-amber-800 bg-amber-50 border-amber-200' },
          { label: 'Sem telefone', value: summary?.noPhone ?? 0, icon: <XCircle className="w-4 h-4" />, tone: 'text-slate-700 bg-slate-100 border-slate-300' },
          { label: 'No banco', value: total, icon: <ShieldCheck className="w-4 h-4" />, tone: 'text-slate-700 bg-slate-50 border-slate-200' },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl border px-3 py-2 ${item.tone}`}>
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
              {item.icon} {item.label}
            </span>
            <span className="block text-xl font-bold tabular-nums mt-0.5">
              {item.value}
              {total > 0 && item.label !== 'No banco' && (
                <span className="text-[11px] font-semibold opacity-70"> · {pct(item.value)}%</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {notice && (
        <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">{notice}</p>
      )}
    </section>
  );
};

export default LeadQualityCard;
