import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Database,
  FolderKanban,
  MessageCircle,
  PhoneCall,
  Radio,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { NextActionsPanel } from './NextActionsPanel';
import { StageOverview } from './StageOverview';
import type { AppTab } from './Sidebar';

/**
 * Visão geral: a primeira coisa que se olha ao abrir o app.
 * Dois escopos: "Tudo" (retrato do banco e do funil agora) e "Hoje"
 * (só o que aconteceu desde a meia-noite — `/api/overview/daily`).
 */

interface OverviewDashboardProps {
  onNavigate: (tab: AppTab) => void;
  onOpenProject: (projectId: string) => void;
}

interface DatabaseStats {
  totals?: {
    total?: number; comFone?: number; semFone?: number; semSite?: number; comSite?: number;
    hoje?: number; ultimos7?: number; contactados?: number; optOut?: number;
    comAnalise?: number; prontosParaD0?: number; scoreMedio?: number;
  };
  pipeline?: { key: string; label: string; total: number }[];
}

interface OutboundMetrics {
  contacted?: number; sent?: number; replies?: number; replyRate?: number;
  meetings?: number; closed?: number;
  delivery?: { sent?: number; delivered?: number; read?: number; failed?: number; pending?: number; unconfirmed?: number };
}

interface DailyOverview {
  dayLabel?: string;
  leads?: { created?: number; readyForD0?: number; withPhone?: number; contacted?: number };
  outbound?: { contacted?: number; sent?: number; replies?: number; replyRate?: number; meetings?: number };
  delivery?: { sent?: number; delivered?: number; read?: number; failed?: number; unconfirmed?: number; inbound?: number };
  projects?: { created?: number; moved?: number; concluded?: number };
  followUps?: { dueToday?: number };
  collection?: { searches?: number };
}

interface ProjectRow {
  id: string;
  status?: string;
  stage?: string;
  name?: string;
  priority?: string;
}

interface AutopilotStatus {
  settings?: { enabled?: boolean; autoProspect?: boolean; minScore?: number };
  state?: { armedUntil?: string | null; lastRunAt?: string | null; lastSummary?: string | null; lastError?: string | null; collectedToday?: number; searchedToday?: number; prospectedToday?: number };
  armed?: boolean;
  budget?: { configured?: boolean; monthlyQuota?: number; remainingThisMonth?: number; daysLeftInCycle?: number; dailyBudget?: number; usedToday?: number; remainingToday?: number; intervalMinutes?: number; keys?: number };
}

interface WhatsappHealth { ok?: boolean; provider?: string; state?: string; configured?: boolean }
interface CadencePlan { enabled?: boolean; count?: number; cap?: number; usedToday?: number; remaining?: number }
interface CitiesStats { total?: number; alreadySearched?: number; notSearched?: number }
interface FollowUpRow { leadId?: string; name?: string; dueAt?: string }

type Scope = 'all' | 'today';
const SCOPE_KEY = 'leadradar.overview.scope.v1';

const PIPELINE_ORDER: { key: string; label: string; color: string; bar: string }[] = [
  { key: 'prospect', label: 'Novos prospects', color: 'border-slate-200 bg-slate-100 text-slate-700', bar: 'bg-slate-400' },
  { key: 'contacted', label: 'Contato feito', color: 'border-blue-200 bg-blue-50 text-blue-700', bar: 'bg-blue-500' },
  { key: 'negotiating', label: 'Em negociação', color: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500' },
  { key: 'em_desenvolvimento', label: 'Em desenvolvimento', color: 'border-violet-200 bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
  { key: 'closed', label: 'Finalizado', color: 'border-emerald-200 bg-emerald-50 text-emerald-800', bar: 'bg-emerald-500' },
  { key: 'declined', label: 'Perdido', color: 'border-red-200 bg-red-50 text-red-700', bar: 'bg-red-500' },
];

const PROJECT_ORDER: { key: string; label: string; color: string; bar: string }[] = [
  { key: 'briefing', label: 'Briefing', color: 'border-slate-200 bg-slate-100 text-slate-700', bar: 'bg-slate-400' },
  { key: 'copywriting', label: 'Copywriting', color: 'border-sky-200 bg-sky-50 text-sky-700', bar: 'bg-sky-500' },
  { key: 'design', label: 'Design', color: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700', bar: 'bg-fuchsia-500' },
  { key: 'wireframe', label: 'Wireframe', color: 'border-orange-200 bg-orange-50 text-orange-700', bar: 'bg-orange-500' },
  { key: 'desenvolvimento', label: 'Desenvolvimento', color: 'border-indigo-200 bg-indigo-50 text-indigo-700', bar: 'bg-indigo-500' },
  { key: 'revisao', label: 'Revisão', color: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500' },
  { key: 'deploy', label: 'Deploy', color: 'border-teal-200 bg-teal-50 text-teal-700', bar: 'bg-teal-500' },
  { key: '__concluido__', label: 'Concluídos', color: 'border-emerald-200 bg-emerald-50 text-emerald-800', bar: 'bg-emerald-500' },
];

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** "1 resposta" / "3 respostas" — evita o plural automático errado nos KPIs. */
const plural = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

function readScope(): Scope {
  try {
    return localStorage.getItem(SCOPE_KEY) === 'today' ? 'today' : 'all';
  } catch {
    return 'all';
  }
}

const KpiCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  onClick?: () => void;
}> = ({ label, value, hint, icon, tone = 'default', onClick }) => {
  const tones: Record<string, string> = {
    default: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-rose-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm w-full ${
        onClick ? 'hover:border-indigo-300 hover:shadow-md cursor-pointer' : 'cursor-default'
      }`}
    >
      <span className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span className="truncate">{label}</span>
        <span className="text-slate-400 shrink-0">{icon}</span>
      </span>
      <span className={`block text-2xl font-bold tabular-nums mt-1 ${tones[tone]}`}>{value}</span>
      {hint && <span className="block text-[11px] text-slate-600 mt-0.5 truncate">{hint}</span>}
    </button>
  );
};

const MiniStat: React.FC<{ label: string; value: string; tone?: 'default' | 'good' | 'warn' | 'bad' }> = ({ label, value, tone = 'default' }) => {
  const tones: Record<string, string> = {
    default: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-rose-700',
  };
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-[11px] text-slate-600">{label}</span>
      <span className={`text-xs font-bold tabular-nums ${tones[tone]}`}>{value}</span>
    </div>
  );
};

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ onNavigate, onOpenProject }) => {
  const [scope, setScope] = useState<Scope>(() => readScope());
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [outbound, setOutbound] = useState<OutboundMetrics | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotStatus | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsappHealth | null>(null);
  const [cadence, setCadence] = useState<CadencePlan | null>(null);
  const [cities, setCities] = useState<CitiesStats | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [daily, setDaily] = useState<DailyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const get = async (url: string) => {
      try {
        const res = await fetch(url);
        return await res.json().catch(() => ({}));
      } catch {
        return null;
      }
    };
    const [db, out, proj, auto, wa, cad, city, fu, day] = await Promise.all([
      get('/api/database/stats'),
      get('/api/metrics/outbound'),
      get('/api/projects'),
      get('/api/autopilot/status'),
      get('/api/whatsapp/health'),
      get('/api/cadence/plan'),
      get('/api/cities/stats'),
      get('/api/follow-ups/due'),
      get('/api/overview/daily'),
    ]);

    if (db?.success) setDbStats(db as DatabaseStats);
    if (out?.success) setOutbound(out.metrics as OutboundMetrics);
    if (Array.isArray(proj?.projects)) setProjects(proj.projects as ProjectRow[]);
    if (auto?.success) setAutopilot(auto as AutopilotStatus);
    if (wa) setWhatsapp(wa as WhatsappHealth);
    if (cad?.success) setCadence(cad as CadencePlan);
    if (city?.success) setCities(city as CitiesStats);
    if (fu?.success) setFollowUps((fu.followUps as FollowUpRow[]) || []);
    if (day?.success) setDaily(day.daily as DailyOverview);

    setUpdatedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const changeScope = (next: Scope) => {
    setScope(next);
    try {
      localStorage.setItem(SCOPE_KEY, next);
    } catch {
      /* modo privado */
    }
  };

  const isToday = scope === 'today';
  const totals = dbStats?.totals || {};
  const pipelineByKey = new Map((dbStats?.pipeline || []).map((row) => [row.key, row.total]));
  const pipelineItems = PIPELINE_ORDER.map((stage) => ({
    id: stage.key,
    label: stage.label,
    color: stage.color,
    bar: stage.bar,
    count: num(pipelineByKey.get(stage.key)),
  }));

  const visibleProjects = projects.filter((p) => p.status !== 'concluido');
  const projectItems = PROJECT_ORDER.map((stage) => ({
    id: stage.key,
    label: stage.label,
    color: stage.color,
    bar: stage.bar,
    count:
      stage.key === '__concluido__'
        ? projects.filter((p) => p.status === 'concluido').length
        : visibleProjects.filter((p) => p.stage === stage.key).length,
  }));

  const delivery = outbound?.delivery || {};
  const dayLeads = daily?.leads || {};
  const dayOutbound = daily?.outbound || {};
  const dayDelivery = daily?.delivery || {};
  const dayProjects = daily?.projects || {};
  const dayCollection = daily?.collection || {};
  const dayFollowUps = num(daily?.followUps?.dueToday);

  const failedAll = num(delivery.failed);
  const failedToday = num(dayDelivery.failed);
  const failed = isToday ? failedToday : failedAll;
  const replyRate = isToday ? num(dayOutbound.replyRate) : num(outbound?.replyRate);
  const budget = autopilot?.budget || {};
  const autoState = autopilot?.state || {};
  const waOpen = whatsapp?.state === 'open' && whatsapp?.ok !== false;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" /> Visão geral
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {isToday
              ? `O que aconteceu em ${daily?.dayLabel || 'hoje'} — da captura ao envio.`
              : 'Como estão a coleta, o contato e a entrega — sem precisar abrir cada página.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {updatedAt && <span className="text-[11px] text-slate-500">atualizado às {updatedAt}</span>}

          <div role="group" aria-label="Período da visão geral" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => changeScope('all')}
              aria-pressed={!isToday}
              className={`px-3 py-1.5 min-h-8 rounded-md text-xs font-bold transition-colors ${
                !isToday ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              Tudo
            </button>
            <button
              type="button"
              onClick={() => changeScope('today')}
              aria-pressed={isToday}
              className={`px-3 py-1.5 min-h-8 rounded-md text-xs font-bold transition-colors ${
                isToday ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              Hoje
            </button>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-8 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs — o escopo "Hoje" troca os seis números */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {isToday ? (
          <>
            <KpiCard
              label="Leads hoje"
              value={String(num(dayLeads.created))}
              hint={`${num(dayLeads.readyForD0)} prontos p/ D0`}
              icon={<Database className="w-4 h-4" />}
              onClick={() => onNavigate('database')}
            />
            <KpiCard
              label="Prontos p/ D0"
              value={String(num(dayLeads.readyForD0))}
              hint={`${num(dayLeads.withPhone)} com telefone`}
              icon={<Target className="w-4 h-4" />}
              onClick={() => onNavigate('crm')}
            />
            <KpiCard
              label="Abordados hoje"
              value={String(num(dayOutbound.contacted ?? dayLeads.contacted))}
              hint={`${plural(num(dayOutbound.sent), 'envio', 'envios')} no dia`}
              icon={<MessageCircle className="w-4 h-4" />}
              onClick={() => onNavigate('followups')}
            />
            <KpiCard
              label="Respostas hoje"
              value={String(num(dayOutbound.replies))}
              hint={`taxa de ${num(dayOutbound.replyRate)}% no dia`}
              tone={num(dayOutbound.replies) > 0 ? 'good' : 'default'}
              icon={<TrendingUp className="w-4 h-4" />}
              onClick={() => onNavigate('growth')}
            />
            <KpiCard
              label="Projetos movidos"
              value={String(num(dayProjects.moved) + num(dayProjects.created))}
              hint={`${plural(num(dayProjects.concluded), 'concluído', 'concluídos')} hoje`}
              icon={<FolderKanban className="w-4 h-4" />}
              onClick={() => onNavigate('projects')}
            />
            <KpiCard
              label="Falhas hoje"
              value={String(failedToday)}
              hint={failedToday > 0 ? 'precisa de reenvio manual' : 'nenhuma falha'}
              tone={failedToday > 0 ? 'bad' : 'good'}
              icon={<AlertTriangle className="w-4 h-4" />}
              onClick={() => onNavigate('followups')}
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Leads no banco"
              value={String(num(totals.total))}
              hint={`${plural(num(totals.hoje), 'novo hoje', 'novos hoje')} · ${num(totals.ultimos7)} em 7 dias`}
              icon={<Database className="w-4 h-4" />}
              onClick={() => onNavigate('database')}
            />
            <KpiCard
              label="Prontos p/ D0"
              value={String(num(totals.prontosParaD0))}
              hint={`${num(totals.semSite)} sem site · ${num(totals.comFone)} com telefone`}
              icon={<Target className="w-4 h-4" />}
              onClick={() => onNavigate('crm')}
            />
            <KpiCard
              label="Abordados"
              value={String(num(outbound?.contacted))}
              hint={`${plural(num(outbound?.sent), 'envio', 'envios')} · ${plural(num(outbound?.replies), 'resposta', 'respostas')}`}
              icon={<MessageCircle className="w-4 h-4" />}
              onClick={() => onNavigate('followups')}
            />
            <KpiCard
              label="Taxa de resposta"
              value={`${replyRate}%`}
              hint={`${plural(num(outbound?.meetings), 'reunião', 'reuniões')} no funil`}
              tone={replyRate >= 20 ? 'good' : replyRate > 0 ? 'warn' : 'default'}
              icon={<TrendingUp className="w-4 h-4" />}
              onClick={() => onNavigate('growth')}
            />
            <KpiCard
              label="Projetos ativos"
              value={String(visibleProjects.length)}
              hint={`${plural(projects.filter((p) => p.status === 'concluido').length, 'concluído', 'concluídos')}`}
              icon={<FolderKanban className="w-4 h-4" />}
              onClick={() => onNavigate('projects')}
            />
            <KpiCard
              label="Envios falhados"
              value={String(failedAll)}
              hint={failedAll > 0 ? 'precisa de reenvio manual' : 'nenhuma falha'}
              tone={failedAll > 0 ? 'bad' : 'good'}
              icon={<AlertTriangle className="w-4 h-4" />}
              onClick={() => onNavigate('followups')}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Coluna principal */}
        <div className="xl:col-span-2 space-y-4">
          <NextActionsPanel onNavigate={onNavigate} onOpenProject={onOpenProject} />

          {isToday ? (
            <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">Movimentação do dia</h2>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Só o que mudou desde a meia-noite — o retrato acumulado fica em <strong>Tudo</strong>.
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <div className="divide-y divide-slate-100">
                  <MiniStat label="Leads capturados" value={String(num(dayLeads.created))} tone={num(dayLeads.created) > 0 ? 'good' : 'default'} />
                  <MiniStat label="Com telefone" value={String(num(dayLeads.withPhone))} />
                  <MiniStat label="Prontos para D0" value={String(num(dayLeads.readyForD0))} />
                  <MiniStat label="Abordados" value={String(num(dayOutbound.contacted))} />
                  <MiniStat label="Mensagens enviadas" value={String(num(dayDelivery.sent))} />
                  <MiniStat label="Respostas recebidas" value={String(num(dayDelivery.inbound))} tone={num(dayDelivery.inbound) > 0 ? 'good' : 'default'} />
                </div>
                <div className="divide-y divide-slate-100">
                  <MiniStat label="Entregues / lidas" value={`${num(dayDelivery.delivered)} / ${num(dayDelivery.read)}`} />
                  <MiniStat label="Falhas de envio" value={String(num(dayDelivery.failed))} tone={num(dayDelivery.failed) > 0 ? 'bad' : 'good'} />
                  <MiniStat label="Buscas na SerpAPI" value={String(num(dayCollection.searches))} />
                  <MiniStat label="Projetos criados / movidos" value={`${num(dayProjects.created)} / ${num(dayProjects.moved)}`} />
                  <MiniStat label="Recontatos vencendo hoje" value={String(dayFollowUps)} tone={dayFollowUps > 0 ? 'warn' : 'default'} />
                </div>
              </div>
            </section>
          ) : (
            <>
              <StageOverview
                unit="leads"
                items={pipelineItems}
                onSelect={() => onNavigate('crm')}
                emptyHint="Banco vazio — comece pela Busca de Região."
              />

              <StageOverview
                unit="projetos"
                items={projectItems}
                onSelect={() => onNavigate('projects')}
                emptyHint="Nenhum projeto criado ainda."
              />
            </>
          )}
        </div>

        {/* Coluna lateral: os três motores */}
        <div className="space-y-4">
          <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Radio className="w-4 h-4 text-orange-600" /> Coleta (SerpAPI)
              </h2>
              <button type="button" onClick={() => onNavigate('automation')} className="text-[11px] font-bold text-indigo-600 hover:underline">
                ajustar
              </button>
            </div>
            <div className="mt-2 divide-y divide-slate-100">
              <MiniStat
                label="Autopilot"
                value={autopilot?.settings?.enabled ? (autopilot?.armed ? 'ligado e armado' : 'ligado, desarmado') : 'desligado'}
                tone={autopilot?.settings?.enabled ? (autopilot?.armed ? 'good' : 'warn') : 'bad'}
              />
              {isToday ? (
                <>
                  <MiniStat label="Buscas hoje" value={`${num(budget.usedToday)}/${num(budget.dailyBudget)}`} />
                  <MiniStat label="Leads capturados hoje" value={String(num(dayLeads.created))} tone={num(dayLeads.created) > 0 ? 'good' : 'default'} />
                  <MiniStat label="Cota do mês" value={`${num(budget.remainingThisMonth)} de ${num(budget.monthlyQuota)} restantes`} />
                </>
              ) : (
                <>
                  <MiniStat label="Cota do mês" value={`${num(budget.remainingThisMonth)} de ${num(budget.monthlyQuota)} restantes`} />
                  <MiniStat label="Hoje" value={`${num(budget.usedToday)}/${num(budget.dailyBudget)} buscas · ${num(autoState.collectedToday)} leads`} />
                  <MiniStat label="Ritmo" value={`1 busca a cada ~${num(budget.intervalMinutes)} min`} />
                  <MiniStat label="Cidades na fila" value={`${num(cities?.alreadySearched)} buscadas de ${num(cities?.total)}`} />
                </>
              )}
            </div>
            {autoState.lastSummary && !isToday && (
              <p className="mt-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5">
                Último pulso: {autoState.lastSummary}
              </p>
            )}
            {autoState.lastError && (
              <p className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2 py-1.5">
                Erro: {autoState.lastError}
              </p>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp
              </h2>
              <button type="button" onClick={() => onNavigate('channels')} className="text-[11px] font-bold text-indigo-600 hover:underline">
                canais
              </button>
            </div>
            <div className="mt-2 divide-y divide-slate-100">
              <MiniStat label="Conexão" value={waOpen ? 'conectado' : whatsapp?.configured ? 'desconectado' : 'não configurado'} tone={waOpen ? 'good' : 'bad'} />
              <MiniStat label="Provedor" value={whatsapp?.provider || '—'} />
              <MiniStat
                label={isToday ? 'Enviados hoje' : 'Enviados'}
                value={String(num(isToday ? dayDelivery.sent : delivery.sent ?? outbound?.sent))}
              />
              <MiniStat label={isToday ? 'Falhados hoje' : 'Falhados'} value={String(failed)} tone={failed > 0 ? 'bad' : 'good'} />
              <MiniStat label="Sem confirmação" value={String(num(delivery.unconfirmed))} tone={num(delivery.unconfirmed) > 0 ? 'warn' : 'default'} />
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-sky-600" /> Follow-ups
              </h2>
              <button type="button" onClick={() => onNavigate('followups')} className="text-[11px] font-bold text-indigo-600 hover:underline">
                abrir
              </button>
            </div>
            <div className="mt-2 divide-y divide-slate-100">
              <MiniStat
                label={isToday ? 'Recontatos vencendo hoje' : 'Recontatos autorizados vencidos'}
                value={String(isToday ? dayFollowUps : followUps.length)}
                tone={(isToday ? dayFollowUps : followUps.length) > 0 ? 'warn' : 'good'}
              />
              <MiniStat label="Na cadência agora" value={String(num(cadence?.count))} />
              <MiniStat label="Teto do dia" value={`${num(cadence?.usedToday)}/${num(cadence?.cap)}`} />
              <MiniStat label="Opt-out" value={String(num(totals.optOut))} tone={num(totals.optOut) > 0 ? 'warn' : 'default'} />
            </div>
            <button
              type="button"
              onClick={() => onNavigate('crm')}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-8 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
            >
              <Users className="w-3.5 h-3.5" /> Ver pipeline
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
