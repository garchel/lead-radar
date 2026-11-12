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
  ArrowRight,
  CheckCircle2,
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

/** Selo de prioridade no tema claro (o escuro anterior destoava do resto do app). */
const levelStyle = (level: string) =>
  level === 'alta'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : level === 'media'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';

/** Percentual no padrão brasileiro: 66,7% (ponto decimal parece inglês). */
const fmtPct = (value: number) =>
  `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

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
      <div className="flex h-64 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando crescimento…
      </div>
    );
  }

  const cards = [
    { label: 'Leads contactáveis', value: metrics?.window.contactableLeads ?? 0, icon: Trophy },
    { label: 'Abordados (30 dias)', value: metrics?.contacted ?? 0, icon: MessageCircle },
    { label: 'Taxa de resposta', value: fmtPct(metrics?.replyRate ?? 0), icon: Flame },
    { label: 'Reuniões', value: metrics?.meetings ?? 0, icon: CalendarCheck },
    { label: 'Fechados', value: metrics?.closed ?? 0, icon: TrendingUp },
  ];

  const semEnvio = (metrics?.funnel || []).length === 0;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-indigo-600" /> Crescimento
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Onde está o dinheiro: leads com mais dor, funil dos últimos 30 dias e o que a cadência enviaria hoje.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          <CheckCircle2 className="h-4 w-4" /> {msg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <card.icon className="mb-2 h-4 w-4 text-indigo-600" />
            <div className="text-2xl font-bold text-slate-900">{card.value}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Funil de outbound (30 dias)</h2>
          <div className="space-y-3">
            {(metrics?.funnel || []).map((step) => (
              <div key={step.step}>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>{step.step}</span>
                  <span>
                    {step.count} <span className="text-slate-500">({fmtPct(step.rate)})</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.min(100, Math.max(2, step.rate))}%` }}
                  />
                </div>
              </div>
            ))}
            {semEnvio && (
              <p className="text-xs text-slate-500">Sem envios na janela. Rode a cadência ou faça um contato manual.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Ganchos: qual dor puxa resposta</h2>
          {metrics?.bestHook ? (
            <p className="mb-3 text-xs text-slate-600">
              Melhor gancho:{' '}
              <span className="font-semibold text-emerald-700">
                {HOOK_LABELS[metrics.bestHook.hook] || metrics.bestHook.hook}
              </span>{' '}
              ({fmtPct(metrics.bestHook.replyRate)} de resposta, {metrics.bestHook.replies}/{metrics.bestHook.leads}{' '}
              leads)
            </p>
          ) : (
            <p className="mb-3 text-xs text-slate-500">Ainda sem dados suficientes de resposta por gancho.</p>
          )}
          <div className="space-y-2">
            {(metrics?.byHook || []).map((hook) => (
              <div
                key={hook.hook}
                className="flex items-center justify-between border-b border-slate-100 pb-1 text-xs last:border-0"
              >
                <span className="text-slate-700">{HOOK_LABELS[hook.hook] || hook.hook}</span>
                <span className="text-slate-500">
                  {hook.leads} lead(s) · {hook.sent} msg · {fmtPct(hook.replyRate)}
                </span>
              </div>
            ))}
            {(metrics?.byHook || []).length === 0 && <p className="text-xs text-slate-500">Sem dados ainda.</p>}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Send className="h-4 w-4 text-indigo-600" /> Entrega das mensagens (30 dias)
          </h2>
          {(metrics?.delivery.unconfirmed ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {metrics?.delivery.unconfirmed} sem confirmação há +24h
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: 'Enviadas', value: metrics?.delivery.sent ?? 0, tone: 'text-slate-900' },
            { label: 'Entregues', value: metrics?.delivery.delivered ?? 0, tone: 'text-emerald-700' },
            { label: 'Lidas', value: metrics?.delivery.read ?? 0, tone: 'text-sky-700' },
            { label: 'Falhas', value: metrics?.delivery.failed ?? 0, tone: 'text-rose-700' },
            { label: 'Pendentes', value: metrics?.delivery.pending ?? 0, tone: 'text-amber-700' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className={`text-xl font-bold ${item.tone}`}>{item.value}</div>
              <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {item.label}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          ACKs vêm do webhook; use{' '}
          <code className="rounded bg-slate-100 px-1 text-slate-600">whatsapp_sync_history</code> para reconciliar
          mensagens sem confirmação.
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-800">Top oportunidades por dor</h2>
          <span className="text-[11px] text-slate-500">score = sem site próprio + reputação + auditoria</span>
        </div>
        <div className="divide-y divide-slate-100">
          {leads.map((lead) => (
            <div key={lead.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900">{lead.name}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${levelStyle(lead.priority.level)}`}
                  >
                    {lead.priority.score} · {lead.priority.level}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                    {STATUS_LABELS[lead.websiteStatus || 'none'] || lead.websiteStatus}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {[lead.category, lead.city].filter(Boolean).join(' · ') || 'Sem categoria'}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                  {lead.priority.reasons.slice(0, 3).join(' • ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {lead.siteAudit && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-600">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {lead.siteAudit.healthScore}/100
                  </span>
                )}
                <button
                  onClick={() => void auditLead(lead)}
                  disabled={busyLead === lead.id || lead.websiteStatus !== 'has_website'}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  title={
                    lead.websiteStatus === 'has_website'
                      ? 'Auditar site real'
                      : 'Lead sem site próprio: não há o que auditar'
                  }
                >
                  {busyLead === lead.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  Auditar
                </button>
              </div>
            </div>
          ))}
          {leads.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum lead na base ainda.</p>}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Follow-ups (recontato e cadência)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Recontatos autorizados e a cadência D+3/D+7 saíram daqui: envio de mensagem agora mora só em{' '}
            <strong className="font-semibold text-slate-700">Follow-ups</strong>.
          </p>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('followups')}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Abrir follow-ups <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </section>
    </div>
  );
};

export default GrowthPage;
