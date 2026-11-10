import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  RefreshCw,
  ShieldCheck,
  Flame,
  MessageCircle,
  Send,
  CalendarCheck,
  Trophy,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface PriorityReasonLead {
  id: string;
  name: string;
  category?: string;
  city?: string;
  phone?: string;
  websiteStatus?: string;
  websiteUrl?: string;
  pipelineStatus?: string;
  siteAudit?: { healthScore: number; headline: string; issues: Array<{ severity: string; title: string }> };
  priority: { score: number; level: 'alta' | 'media' | 'baixa'; reasons: string[] };
}

interface HookMetrics {
  hook: string;
  leads: number;
  sent: number;
  replies: number;
  replyRate: number;
  meetings: number;
}

interface OutboundMetrics {
  window: { since?: string; contactableLeads: number };
  contacted: number;
  sent: number;
  replies: number;
  replyRate: number;
  meetings: number;
  meetingRate: number;
  closed: number;
  closeRate: number;
  byHook: HookMetrics[];
  bestHook?: HookMetrics;
  delivery: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    pending: number;
    unconfirmed: number;
  };
  funnel: Array<{ step: string; count: number; rate: number }>;
}

const HOOK_LABELS: Record<string, string> = {
  sem_site: 'Sem site próprio',
  marketplace: 'Só marketplace (iFood etc.)',
  social_only: 'Só rede social',
  generico: 'Genérico',
  desconhecido: 'Sem gancho',
  cadencia_follow_up: 'Follow-up',
};

const STATUS_LABELS: Record<string, string> = {
  none: 'Sem site',
  social_only: 'Só rede social',
  marketplace_only: 'Só marketplace',
  has_website: 'Tem site',
};

const levelStyle = (level: string) =>
  level === 'alta'
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : level === 'media'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-slate-700/40 text-slate-400 border-slate-600/40';

const fmtPct = (value: number) => `${value.toFixed(1)}%`;

export const GrowthPage: React.FC<{ onNavigate?: (tab: 'followups') => void }> = ({ onNavigate }) => {
  const [leads, setLeads] = useState<PriorityReasonLead[]>([]);
  const [metrics, setMetrics] = useState<OutboundMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyLead, setBusyLead] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const since = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadsRes, metricsRes] = await Promise.all([
        fetch('/api/leads-priority?limit=12'),
        fetch(`/api/metrics/outbound?since=${encodeURIComponent(since)}`),
      ]);
      const [leadsData, metricsData] = await Promise.all([leadsRes.json(), metricsRes.json()]);
      if (leadsData?.success) setLeads(leadsData.leads || []);
      if (metricsData?.success) setMetrics(metricsData.metrics);
      if (!metricsData?.success) {
        setError(metricsData?.error || 'Falha ao carregar dados de crescimento.');
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar dados de crescimento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const auditLead = async (lead: PriorityReasonLead) => {
    setBusyLead(lead.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/audit`, { method: 'POST' });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Falha ao auditar o site.');
      setMsg(`Auditoria de ${lead.name} atualizada (saúde ${data.audit?.healthScore ?? '—'}/100).`);
      await load();
    } catch (e: any) {
      setMsg(e?.message || 'Falha ao auditar o site.');
    } finally {
      setBusyLead(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando crescimento…
      </div>
    );
  }

  const cards = [
    { label: 'Leads contactáveis', value: metrics?.window.contactableLeads ?? 0, icon: Trophy },
    { label: 'Abordados (30d)', value: metrics?.contacted ?? 0, icon: MessageCircle },
    { label: 'Taxa de resposta', value: fmtPct(metrics?.replyRate ?? 0), icon: Flame },
    { label: 'Reuniões', value: metrics?.meetings ?? 0, icon: CalendarCheck },
    { label: 'Fechados', value: metrics?.closed ?? 0, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-400" /> Crescimento
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Onde está o dinheiro: leads com mais dor, funil dos últimos 30 dias e o que a cadência
            enviaria hoje.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-sm">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}
      {msg && (
        <div className="text-sm text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-lg px-3 py-2">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <card.icon className="w-4 h-4 text-indigo-400 mb-2" />
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Funil de outbound (30 dias)</h3>
          <div className="space-y-3">
            {(metrics?.funnel || []).map((step) => (
              <div key={step.step}>
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>{step.step}</span>
                  <span>
                    {step.count} <span className="text-slate-400">({fmtPct(step.rate)})</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${Math.min(100, Math.max(0, step.rate))}%` }}
                  />
                </div>
              </div>
            ))}
            {(metrics?.funnel || []).length === 0 && (
              <p className="text-xs text-slate-400">Sem envios na janela — rode a cadência ou faça um contato manual.</p>
            )}
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Ganchos: qual dor puxa resposta</h3>
          {metrics?.bestHook ? (
            <p className="text-xs text-slate-400 mb-3">
              Melhor gancho: <span className="text-emerald-400 font-semibold">{HOOK_LABELS[metrics.bestHook.hook] || metrics.bestHook.hook}</span>{' '}
              ({fmtPct(metrics.bestHook.replyRate)} de resposta, {metrics.bestHook.replies}/{metrics.bestHook.leads} leads)
            </p>
          ) : (
            <p className="text-xs text-slate-400 mb-3">Ainda sem dados suficientes de resposta por gancho.</p>
          )}
          <div className="space-y-2">
            {(metrics?.byHook || []).map((hook) => (
              <div key={hook.hook} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{HOOK_LABELS[hook.hook] || hook.hook}</span>
                <span className="text-slate-400">
                  {hook.leads} lead(s) · {hook.sent} msg · {fmtPct(hook.replyRate)}
                </span>
              </div>
            ))}
            {(metrics?.byHook || []).length === 0 && <p className="text-xs text-slate-400">Sem dados ainda.</p>}
          </div>
        </section>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-indigo-400" /> Entrega das mensagens (30 dias)
          </h3>
          {(metrics?.delivery.unconfirmed ?? 0) > 0 && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {metrics?.delivery.unconfirmed} sem confirmação há +24h
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Enviadas', value: metrics?.delivery.sent ?? 0, tone: 'text-slate-200' },
            { label: 'Entregues', value: metrics?.delivery.delivered ?? 0, tone: 'text-emerald-400' },
            { label: 'Lidas', value: metrics?.delivery.read ?? 0, tone: 'text-sky-400' },
            { label: 'Falhas', value: metrics?.delivery.failed ?? 0, tone: 'text-rose-400' },
            { label: 'Pendentes', value: metrics?.delivery.pending ?? 0, tone: 'text-amber-400' },
          ].map((item) => (
            <div key={item.label} className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
              <div className={`text-xl font-bold ${item.tone}`}>{item.value}</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400 mt-0.5">{item.label}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          ACKs vêm do webhook; use <code className="text-slate-400">whatsapp_sync_history</code> para reconciliar
          mensagens sem confirmação.
        </p>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Top oportunidades por dor</h3>
          <span className="text-[11px] text-slate-400">score = sem site próprio + reputação + auditoria</span>
        </div>
        <div className="divide-y divide-slate-800">
          {leads.map((lead) => (
            <div key={lead.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white truncate">{lead.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${levelStyle(lead.priority.level)}`}>
                    {lead.priority.score} · {lead.priority.level}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {STATUS_LABELS[lead.websiteStatus || 'none'] || lead.websiteStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  {[lead.category, lead.city].filter(Boolean).join(' · ') || 'Sem categoria'}
                </p>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{lead.priority.reasons.slice(0, 3).join(' • ')}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {lead.siteAudit && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> {lead.siteAudit.healthScore}/100
                  </span>
                )}
                <button
                  onClick={() => void auditLead(lead)}
                  disabled={busyLead === lead.id || lead.websiteStatus !== 'has_website'}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 flex items-center gap-1.5"
                  title={lead.websiteStatus === 'has_website' ? 'Auditar site real' : 'Lead sem site próprio — não há o que auditar'}
                >
                  {busyLead === lead.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  Auditar
                </button>
              </div>
            </div>
          ))}
          {leads.length === 0 && <p className="p-4 text-sm text-slate-400">Nenhum lead na base ainda.</p>}
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Follow-ups (recontato e cadência)</h3>
          <p className="text-xs text-slate-400 mt-1">
            Recontatos autorizados e a cadência D+3/D+7 saíram daqui: envio de mensagem agora mora só em <strong className="text-slate-300">Follow-ups</strong>.
          </p>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('followups')}
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            Abrir follow-ups
          </button>
        )}
      </section>
    </div>
  );
};
