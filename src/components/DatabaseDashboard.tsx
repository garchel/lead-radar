import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Database, Search, RefreshCw, Phone, PhoneOff, Globe, Star, ChevronDown, ChevronRight,
  Filter, X, ArrowUpDown, MapPin, Layers, Target, TrendingUp, AlertTriangle,
} from 'lucide-react';

/**
 * Banco de dados de leads: números agregados + lista navegável.
 * Feito para responder rápido "o que tem no banco?" e "quem eu prospecto agora?".
 */

interface Totals {
  total: number;
  comFone: number;
  semFone: number;
  scoreMedio: number;
  semSite: number;
  soRede: number;
  soMarketplace: number;
  comSite: number;
  hoje: number;
  ultimos7: number;
  contactados: number;
  optOut: number;
  comAnalise: number;
  prontosParaD0: number;
}

interface Bucket { key?: string; label: string; total: number }
interface CityBucket { city: string; state: string; total: number }
interface CategoryBucket { category: string; total: number }

interface Stats {
  totals: Totals;
  pipeline: Bucket[];
  website: Bucket[];
  scoreBands: Bucket[];
  topCities: CityBucket[];
  topCategories: CategoryBucket[];
}

interface LeadRow {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  rating: number | null;
  reviewsCount: number;
  websiteStatus: string;
  websiteStatusLabel: string;
  websiteUrl: string | null;
  instagramHandle: string | null;
  opportunityScore: number;
  opportunityLevel: string;
  estimatedValue: string | null;
  keyInsights: string | null;
  pipelineStatus: string;
  pipelineLabel: string;
  notes: string | null;
  savedAt: string | null;
  lastContactAt: string | null;
  lastResponseAt: string | null;
  contactAttempts: number;
  doNotContact: boolean;
  hasAnalysis: boolean;
}

interface FiltersMeta {
  cities: { city: string; state: string }[];
  categories: string[];
}

const PIPELINE_COLORS: Record<string, string> = {
  prospect: 'bg-slate-100 text-slate-700 border-slate-200',
  contacted: 'bg-sky-50 text-sky-700 border-sky-200',
  negotiating: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  em_desenvolvimento: 'bg-violet-50 text-violet-700 border-violet-200',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined: 'bg-rose-50 text-rose-700 border-rose-200',
};

const WEBSITE_STYLES: Record<string, string> = {
  none: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  social_only: 'bg-amber-50 text-amber-700 border-amber-200',
  marketplace_only: 'bg-orange-50 text-orange-700 border-orange-200',
  has_website: 'bg-slate-100 text-slate-600 border-slate-200',
};

const scoreStyle = (score: number) =>
  score >= 85 ? 'bg-emerald-600 text-white' : score >= 70 ? 'bg-indigo-600 text-white' : score >= 60 ? 'bg-amber-500 text-white' : 'bg-slate-300 text-slate-700';

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const Bar: React.FC<{ label: string; total: number; max: number; className?: string }> = ({ label, total, max, className }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600 font-medium truncate pr-2">{label}</span>
      <span className="text-slate-500 font-semibold tabular-nums">{total}</span>
    </div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${className || 'bg-indigo-500'}`} style={{ width: total > 0 ? `${Math.max(4, (total / max) * 100)}%` : '0%' }} />
    </div>
  </div>
);

const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string | number; hint?: string; tone?: string }> = ({ icon, label, value, hint, tone }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
      <span className={tone || 'text-indigo-500'}>{icon}</span>
      {label}
    </div>
    <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</div>
    {hint && <div className="text-[11px] text-slate-600">{hint}</div>}
  </div>
);

const SCORE_BAND_ORDER = ['90-100', '80-89', '70-79', '60-69', '0-59'];

/** Resumo visual do banco. Fica abaixo da lista: primeiro os leads, depois os gráficos. */
const Distributions: React.FC<{ stats: Stats }> = ({ stats }) => {
  const maxPipeline = Math.max(1, ...stats.pipeline.map((b) => b.total));
  const maxWebsite = Math.max(1, ...stats.website.map((b) => b.total));

  // faixas fixas: uma faixa vazia é informação ("ninguém nesse score"), não ausência
  const bands = SCORE_BAND_ORDER.map((label) => ({
    label,
    total: stats.scoreBands.find((b) => b.label === label)?.total ?? 0,
  }));
  const maxBand = Math.max(1, ...bands.map((b) => b.total));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-600" /> Pipeline</h2>
        {stats.pipeline.map((b) => (
          <Bar key={b.key || b.label} label={b.label} total={b.total} max={maxPipeline} />
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Globe className="w-4 h-4 text-emerald-600" /> Presença digital</h2>
        {stats.website.map((b) => (
          <Bar key={b.key || b.label} label={b.label} total={b.total} max={maxWebsite} className={b.key === 'none' ? 'bg-emerald-500' : b.key === 'social_only' ? 'bg-amber-400' : b.key === 'marketplace_only' ? 'bg-orange-400' : 'bg-slate-400'} />
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-violet-600" /> Faixa de score</h2>
        {bands.map((b) => (
          <Bar key={b.label} label={b.label} total={b.total} max={maxBand} className="bg-violet-500" />
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2"><MapPin className="w-4 h-4 text-sky-600" /> Cidades com mais leads</h2>
        <div className="divide-y divide-slate-100">
          {stats.topCities.length === 0 && <div className="text-xs text-slate-500 py-2">Nada ainda.</div>}
          {stats.topCities.map((c) => (
            <div key={`${c.city}-${c.state}`} className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-slate-700 truncate pr-2">{c.city}{c.state ? `/${c.state}` : ''}</span>
              <span className="font-bold text-slate-500 tabular-nums">{c.total}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2"><Layers className="w-4 h-4 text-orange-600" /> Categorias com mais leads</h2>
        <div className="divide-y divide-slate-100">
          {stats.topCategories.length === 0 && <div className="text-xs text-slate-500 py-2">Nada ainda.</div>}
          {stats.topCategories.map((c) => (
            <div key={c.category} className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-slate-700 truncate pr-2">{c.category}</span>
              <span className="font-bold text-slate-500 tabular-nums">{c.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface DatabaseDashboardProps {
  /** Leva para o funil (Dashboard de Leads) — inventário ≠ ação. */
  onOpenPipeline?: () => void;
}

export const DatabaseDashboard: React.FC<DatabaseDashboardProps> = ({ onOpenPipeline }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [meta, setMeta] = useState<FiltersMeta>({ cities: [], categories: [] });
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // filtros
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [pipeline, setPipeline] = useState('all');
  const [website, setWebsite] = useState('all');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [days, setDays] = useState('');
  const [hasPhone, setHasPhone] = useState<'' | '0' | '1'>('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [readyOnly, setReadyOnly] = useState(false);
  const [sort, setSort] = useState('score');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/database/stats');
      const d = await r.json();
      if (d?.success) setStats(d as Stats);
      else throw new Error(d?.error || 'Falha nas estatísticas');
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar estatísticas');
    }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const r = await fetch('/api/database/filters');
      const d = await r.json();
      if (d?.success) setMeta({ cities: d.cities || [], categories: d.categories || [] });
    } catch { /* opcional */ }
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set('q', debouncedQ);
      if (pipeline !== 'all') params.set('pipeline', pipeline);
      if (website !== 'all') params.set('website', website);
      if (city) params.set('city', city);
      if (category) params.set('category', category);
      if (scoreMin) params.set('scoreMin', scoreMin);
      if (days) params.set('days', days);
      if (hasPhone) params.set('hasPhone', hasPhone);
      if (onlyNew) params.set('onlyNew', '1');
      if (readyOnly) params.set('readyForD0', '1');
      params.set('sort', sort);
      params.set('page', String(page));
      params.set('limit', '50');

      const r = await fetch(`/api/database/leads?${params.toString()}`);
      const d = await r.json();
      if (!d?.success) throw new Error(d?.error || 'Falha ao listar');
      setLeads(d.leads || []);
      setTotal(d.total || 0);
      setPages(d.pages || 1);
    } catch (e: any) {
      setError(e?.message || 'Erro ao listar leads');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, pipeline, website, city, category, scoreMin, days, hasPhone, onlyNew, readyOnly, sort, page]);

  useEffect(() => { void loadStats(); void loadMeta(); }, [loadStats, loadMeta]);
  useEffect(() => { void loadLeads(); }, [loadLeads]);

  const activeFilters = useMemo(
    () => [q, pipeline !== 'all' ? pipeline : '', website !== 'all' ? website : '', city, category, scoreMin, days, hasPhone, onlyNew ? 'novos' : '', readyOnly ? 'd0' : ''].filter(Boolean).length,
    [q, pipeline, website, city, category, scoreMin, days, hasPhone, onlyNew, readyOnly]
  );

  const clearFilters = () => {
    setQ(''); setPipeline('all'); setWebsite('all'); setCity(''); setCategory('');
    setScoreMin(''); setDays(''); setHasPhone(''); setOnlyNew(false); setReadyOnly(false); setSort('score'); setPage(1);
  };

  const maxPipeline = Math.max(1, ...(stats?.pipeline || []).map((b) => b.total));
  const maxWebsite = Math.max(1, ...(stats?.website || []).map((b) => b.total));
  const maxBand = Math.max(1, ...(stats?.scoreBands || []).map((b) => b.total));

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-indigo-600" /> Banco de Dados
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Inventário do banco: o que existe e como está classificado. Para agir sobre um lead, use o <strong>Dashboard de Leads</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenPipeline && (
            <button
              type="button"
              onClick={onOpenPipeline}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Abrir o funil →
            </button>
          )}
          <button
            type="button"
            onClick={() => { void loadStats(); void loadLeads(); void loadMeta(); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi icon={<Database className="w-3.5 h-3.5" />} label="Leads no banco" value={stats.totals.total} hint={`${stats.totals.hoje} hoje · ${stats.totals.ultimos7} em 7 dias`} />
            <Kpi icon={<Globe className="w-3.5 h-3.5" />} label="Sem site" value={stats.totals.semSite} hint={`${stats.totals.soRede} só rede social`} tone="text-emerald-600" />
            <Kpi icon={<Target className="w-3.5 h-3.5" />} label="Prontos p/ D0" value={stats.totals.prontosParaD0} hint="telefone + score ≥ 60" tone="text-orange-600" />
            <Kpi icon={<Phone className="w-3.5 h-3.5" />} label="Com telefone" value={stats.totals.comFone} hint={`${stats.totals.semFone} sem telefone`} tone="text-sky-600" />
            <Kpi icon={<TrendingUp className="w-3.5 h-3.5" />} label="Score médio" value={stats.totals.scoreMedio || 0} hint={`${stats.totals.comAnalise} com análise de IA`} tone="text-violet-600" />
            <Kpi icon={<PhoneOff className="w-3.5 h-3.5" />} label="Não contatar" value={stats.totals.optOut} hint={`${stats.totals.contactados} já contatados`} tone="text-rose-500" />
          </div>

        </>
      )}

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        {/* Linha 1 — busca, ordenação e limpar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Buscar por nome, telefone, cidade, categoria…"
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <option value="score">Ordenar: score</option>
            <option value="recent">Ordenar: mais recentes</option>
            <option value="name">Ordenar: nome</option>
            <option value="city">Ordenar: cidade</option>
          </select>

          {activeFilters > 0 && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
              <X className="w-3 h-3" /> Limpar ({activeFilters})
            </button>
          )}
        </div>

        {/* Linha 2 — filtros de coluna */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <select value={pipeline} onChange={(e) => { setPipeline(e.target.value); setPage(1); }} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <option value="all">Pipeline: todos</option>
            {(stats?.pipeline || []).map((b) => <option key={b.key} value={b.key}>{b.label} ({b.total})</option>)}
          </select>

          <select value={website} onChange={(e) => { setWebsite(e.target.value); setPage(1); }} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <option value="all">Presença: todas</option>
            {(stats?.website || []).map((b) => <option key={b.key} value={b.key}>{b.label} ({b.total})</option>)}
          </select>

          <select value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs max-w-[180px]">
            <option value="">Cidade: todas</option>
            {meta.cities.map((c) => <option key={`${c.city}-${c.state}`} value={c.city}>{c.city}/{c.state}</option>)}
          </select>

          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs max-w-[200px]">
            <option value="">Categoria: todas</option>
            {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={days} onChange={(e) => { setDays(e.target.value); setPage(1); }} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <option value="">Entrada: qualquer data</option>
            <option value="1">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>

          <select value={hasPhone} onChange={(e) => { setHasPhone(e.target.value as any); setPage(1); }} className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <option value="">Telefone: tanto faz</option>
            <option value="1">Só com telefone</option>
            <option value="0">Só sem telefone</option>
          </select>

          <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 px-2 py-1 min-h-8">
            <input type="number" min={0} max={100} value={scoreMin} onChange={(e) => { setScoreMin(e.target.value); setPage(1); }}
              title="Mostrar só leads com score maior ou igual a este"
              className="w-16 px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-normal text-slate-800 placeholder:text-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none" placeholder="0–100" />
            score mín.
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 min-h-8 px-1">
            <input type="checkbox" checked={onlyNew} onChange={(e) => { setOnlyNew(e.target.checked); setPage(1); }} /> nunca contatados
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-orange-700 min-h-8 px-1">
            <input type="checkbox" checked={readyOnly} onChange={(e) => { setReadyOnly(e.target.checked); setPage(1); }} /> prontos p/ D0
          </label>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><Filter className="w-3 h-3" /> {total} lead(s) no filtro atual · {stats?.totals.total ?? 0} no banco</span>
          <span className="flex items-center gap-1"><ArrowUpDown className="w-3 h-3" /> página {page} de {pages}</span>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 uppercase text-[11px] tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-bold">Empresa</th>
                <th className="text-left px-3 py-2 font-bold">Categoria</th>
                <th className="text-center px-3 py-2 font-bold">Score</th>
                <th className="text-left px-3 py-2 font-bold">Presença</th>
                <th className="text-left px-3 py-2 font-bold">Telefone</th>
                <th className="text-left px-3 py-2 font-bold">Google</th>
                <th className="text-left px-3 py-2 font-bold">Pipeline</th>
                <th className="text-left px-3 py-2 font-bold">Entrada</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Carregando…</td></tr>
              )}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Nenhum lead com esses filtros.</td></tr>
              )}
              {!loading && leads.map((lead) => (
                <React.Fragment key={lead.id}>
                  <tr className="hover:bg-slate-50/70 cursor-pointer" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {expanded === lead.id ? <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />}
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate max-w-[240px]" title={lead.name}>{lead.name}</div>
                          <div className="text-[11px] text-slate-500 truncate max-w-[240px]">
                            {[lead.neighborhood, lead.city, lead.state].filter(Boolean).join(' · ') || 'sem endereço'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 max-w-[130px] truncate" title={lead.category || ''}>{lead.category || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${scoreStyle(lead.opportunityScore)}`}>
                        {lead.opportunityScore}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border ${WEBSITE_STYLES[lead.websiteStatus] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {lead.websiteStatusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {lead.phone ? <span className="tabular-nums">{lead.phone}</span> : <span className="text-rose-400 font-semibold">sem telefone</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {lead.rating ? (
                        <span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" />{String(lead.rating).replace('.', ',')}{lead.reviewsCount ? <span className="text-slate-500">({lead.reviewsCount})</span> : null}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border ${PIPELINE_COLORS[lead.pipelineStatus] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {lead.pipelineLabel}
                      </span>
                      {lead.doNotContact && <span className="ml-1 text-[11px] font-bold text-rose-600">opt-out</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDate(lead.savedAt)}</td>
                    <td className="px-2 py-2 text-right">
                      <span className="text-[11px] text-slate-500">{lead.hasAnalysis ? 'IA' : ''}</span>
                    </td>
                  </tr>
                  {expanded === lead.id && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={9} className="px-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
                          <div>
                            <div className="font-bold text-slate-500 uppercase text-[11px] mb-1">Contato</div>
                            <div className="text-slate-700 space-y-0.5">
                              <div>Telefone: {lead.phone || '—'}</div>
                              <div>Site: {lead.websiteUrl || '—'}</div>
                              <div>Instagram: {lead.instagramHandle ? `@${lead.instagramHandle.replace(/^@/, '')}` : '—'}</div>
                              <div>Endereço: {lead.address || '—'}</div>
                            </div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-500 uppercase text-[11px] mb-1">Histórico</div>
                            <div className="text-slate-700 space-y-0.5">
                              <div>Tentativas: {lead.contactAttempts}</div>
                              <div>Último contato: {lead.lastContactAt ? fmtDate(lead.lastContactAt) : 'nunca'}</div>
                              <div>Última resposta: {lead.lastResponseAt ? fmtDate(lead.lastResponseAt) : '—'}</div>
                              <div>Valor estimado: {lead.estimatedValue || '—'}</div>
                            </div>
                          </div>
                          <div>
                            <div className="font-bold text-slate-500 uppercase text-[11px] mb-1">Insights / notas</div>
                            <div className="text-slate-700 space-y-1 max-h-28 overflow-y-auto">
                              <div>{lead.keyInsights || '—'}</div>
                              {lead.notes && <div className="text-slate-500 italic">{lead.notes}</div>}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500">ID: {lead.id}</span>
                          {onOpenPipeline && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onOpenPipeline(); }}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                            >
                              abrir no funil →
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500">{total} registro(s)</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 min-h-8 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40">Anterior</button>
            <span className="text-slate-500 tabular-nums">{page}/{pages}</span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="px-3 py-1.5 min-h-8 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40">Próxima</button>
          </div>
        </div>
      </div>

      {stats && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAnalysis((v) => !v)}
            aria-expanded={showAnalysis}
            className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-slate-50"
          >
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="flex-1 font-bold text-slate-900 text-sm">Análise do banco (pipeline, presença, score, cidades)</span>
            <span className="text-[11px] font-semibold text-slate-500">{showAnalysis ? 'recolher' : 'ver análise'}</span>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showAnalysis ? '' : '-rotate-90'}`} />
          </button>
          {showAnalysis && <div className="px-4 pb-4"><Distributions stats={stats} /></div>}
        </section>
      )}
    </div>
  );
};
