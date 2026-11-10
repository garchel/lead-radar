import React, { useCallback, useEffect, useState } from 'react';
import { Users, Send, Loader2, RefreshCw, Clock, Zap, ShieldCheck, Info } from 'lucide-react';
import { FollowUpQueue } from './FollowUpQueue';

/**
 * Follow-ups: a única casa dos recontatos.
 *
 * Existem DOIS modelos no backend e a página mostra os dois lado a lado, com o
 * relógio de cada um explícito:
 *   1. Recontato AUTORIZADO — `interactions.next_contact_at` (o que foi combinado
 *      com o lead). É o FollowUpQueue.
 *   2. Cadência AUTOMÁTICA D+3/D+7 — `leads.last_contact_at` + `next_contact_at`,
 *      com teto diário e guardas (pula quem respondeu, pula opt-out).
 * Antes a cadência ficava em Crescimento (página de leitura) e mandava mensagem
 * de lá; agora envio mora só aqui.
 */

interface CadenceCandidate {
  leadId: string;
  name: string;
  phone?: string;
  step: number;
  angle: string;
  dueAt: string;
  message: string;
}

interface CadencePlan {
  enabled: boolean;
  cap: number;
  usedToday: number;
  remaining: number;
  count: number;
  candidates: CadenceCandidate[];
  skipped: number;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

export const FollowUpsPage: React.FC = () => {
  const [plan, setPlan] = useState<CadencePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirmRun, setConfirmRun] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cadence/plan');
      const data = await res.json();
      if (data?.success) setPlan({ ...data, candidates: data.candidates || [] });
    } catch {
      /* o FollowUpQueue tem o próprio estado de erro */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runCadence = async (dryRun: boolean) => {
    if (!plan) return;
    setRunning(true);
    setMsg(null);
    try {
      const res = await fetch('/api/cadence/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, leadIds: plan.candidates.map((item) => item.leadId) }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Falha ao executar a cadência.');
      if (data.blockedReason === 'cadence_disabled') {
        setMsg('Cadência desligada em Automação — nada foi enviado.');
      } else if (dryRun) {
        setMsg(`Simulação: ${data.planned ?? 0} mensagem(ns) pronta(s), nenhum envio real.`);
      } else {
        setMsg(`Cadência: ${data.sent?.length ?? 0} enviada(s), ${data.failed?.length ?? 0} falha(s).`);
      }
      setConfirmRun(false);
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao executar a cadência.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" /> Follow-ups
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Quem deve ser procurado de novo, e por quê. Todo envio de recontato sai daqui.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-600" /> Recontato autorizado
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Você registrou que ia falar de novo em tal data (ou o lead pediu para chamar depois). O envio é <strong>manual</strong>, um por vez.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-600" /> Cadência automática D+3 / D+7
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Quem foi contatado e não respondeu. Respeita teto diário, cooldown e opt-out — e <strong>nunca</strong> toca em quem já respondeu.
          </p>
        </div>
      </div>

      <section>
        <FollowUpQueue />
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-violet-600" /> Cadência D+3 / D+7
            </h2>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              {plan ? (
                <>
                  {plan.enabled ? 'Ligada em Automação' : 'Desligada em Automação'} · {plan.usedToday}/{plan.cap} usadas hoje ·{' '}
                  {plan.remaining} restantes · {plan.candidates.length} pronta(s) agora
                </>
              ) : (
                'Carregando plano…'
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runCadence(true)}
              disabled={running || !plan?.enabled}
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 font-semibold"
            >
              Simular
            </button>
            {confirmRun ? (
              <button
                type="button"
                onClick={() => void runCadence(false)}
                disabled={running || !plan?.candidates.length}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white flex items-center gap-1.5 font-semibold"
              >
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Confirmar envio
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRun(true)}
                disabled={running || !plan?.enabled || !plan?.candidates.length}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center gap-1.5 font-semibold"
              >
                <Send className="w-3.5 h-3.5" /> Enviar cadência
              </button>
            )}
          </div>
        </div>

        {msg && (
          <div className="mx-5 mt-3 flex items-start gap-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {msg}
          </div>
        )}

        <div className="p-5 space-y-2">
          {(plan?.candidates || []).slice(0, 8).map((candidate) => (
            <div key={`${candidate.leadId}-${candidate.step}`} className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="text-slate-800 font-semibold">{candidate.name}</span>
                <span className="whitespace-nowrap">
                  D+{candidate.step} · {candidate.angle} · vence {fmtDate(candidate.dueAt)}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{candidate.message}</p>
            </div>
          ))}
          {(plan?.candidates || []).length === 0 && (
            <p className="text-xs text-slate-500">
              {plan?.skipped
                ? `${plan.skipped} lead(s) aguardando o próximo passo (D+3/D+7) ou bloqueados por cooldown.`
                : 'Nenhum lead elegível para follow-up agora.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
