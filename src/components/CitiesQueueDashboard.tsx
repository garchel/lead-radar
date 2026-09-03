import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, RefreshCw, TrendingUp, Search, Users } from 'lucide-react';

interface City {
  ibgeCode: string;
  name: string;
  uf: string;
  population: number;
  pibPerCapita: number;
  marketTier: 'A' | 'B' | 'C' | 'D';
  status: string;
  lastSearchedAt: string | null;
  searchCount: number;
  enabled: boolean;
}

const TIER_STYLES: Record<string, string> = {
  A: 'bg-violet-100 text-violet-700 border-violet-200',
  B: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  C: 'bg-slate-100 text-slate-600 border-slate-200',
  D: 'bg-amber-50 text-amber-700 border-amber-200',
};

export const CitiesQueueDashboard: React.FC = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ufFilter, setUfFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [minPop, setMinPop] = useState('');
  const [maxPop, setMaxPop] = useState('');
  const [appliedMinPop, setAppliedMinPop] = useState('');
  const [appliedMaxPop, setAppliedMaxPop] = useState('');
  const [searchedFilter, setSearchedFilter] = useState<'all' | 'never' | 'done'>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'on' | 'off'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (ufFilter) params.set('uf', ufFilter);
      if (appliedMinPop) params.set('minPopulation', appliedMinPop);
      if (appliedMaxPop) params.set('maxPopulation', appliedMaxPop);
      params.set('limit', '500');
      const [citiesRes, statsRes] = await Promise.all([
        fetch(`/api/cities?${params}`).then((r) => r.json()),
        fetch('/api/cities/stats').then((r) => r.json()),
      ]);
      if (citiesRes.success) setCities(citiesRes.cities);
      if (statsRes.success) setStats(statsRes);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, [ufFilter, appliedMinPop, appliedMaxPop]);

  useEffect(() => {
    load();
  }, [load]);

  // Aplica pop mín/máx no servidor com debounce (evita 1 request por tecla)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setAppliedMinPop(minPop.replace(/\D/g, ''));
      setAppliedMaxPop(maxPop.replace(/\D/g, ''));
    }, 600);
    return () => window.clearTimeout(t);
  }, [minPop, maxPop]);

  const toggleCity = async (code: string, enabled: boolean) => {
    setCities((prev) => prev.map((c) => (c.ibgeCode === code ? { ...c, enabled } : c)));
    try {
      await fetch(`/api/cities/${code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
    } catch {
      load();
    }
  };

  const filtered = cities.filter((c) => {
    if (search && !`${c.name} ${c.uf}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (tierFilter && c.marketTier !== tierFilter) return false;
    if (searchedFilter === 'never' && c.searchCount > 0) return false;
    if (searchedFilter === 'done' && c.searchCount === 0) return false;
    if (enabledFilter === 'on' && !c.enabled) return false;
    if (enabledFilter === 'off' && c.enabled) return false;
    return true;
  });

  const hasActiveFilters = Boolean(search || ufFilter || tierFilter || minPop || maxPop || searchedFilter !== 'all' || enabledFilter !== 'all');
  const clearFilters = () => {
    setSearch('');
    setUfFilter('');
    setTierFilter('');
    setMinPop('');
    setMaxPop('');
    setAppliedMinPop('');
    setAppliedMaxPop('');
    setSearchedFilter('all');
    setEnabledFilter('all');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-100 border-b border-slate-200/80 py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-indigo-600" /> Fila de Cidades
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">IBGE • round-robin</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">Base de municípios usada na rotação de prospecção. Desabilite cidades que não quer buscar; a fila sempre pega as há mais tempo sem busca.</p>
          </div>
          <button onClick={load} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>

        {stats && (
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <span className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm text-xs">Total <strong>{stats.total?.toLocaleString('pt-BR')}</strong></span>
            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-bold">Na faixa 30–200k: {stats.inRotationRange?.toLocaleString('pt-BR')}</span>
            <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold">Já buscadas: {stats.alreadySearched}</span>
            <span className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-xl text-xs font-bold">Nunca buscadas: {stats.neverSearched}</span>
            {['A', 'B', 'C', 'D'].map((t) => (
              <span key={t} className={`border px-2.5 py-1.5 rounded-xl text-xs font-bold ${TIER_STYLES[t]}`}>Tier {t}: {stats.byUf ? '' : ''}{(stats as any)[`tier${t}`] ?? ''}</span>
            ))}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <div className="col-span-2 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cidade..."
                className="bg-transparent text-xs outline-none w-full"
              />
            </div>
            <div>
              <input
                value={ufFilter}
                onChange={(e) => setUfFilter(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="UF"
                title="Filtrar por estado (ex: SP)"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs uppercase"
              />
            </div>
            <div>
              <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} title="Tier de mercado (PIB per capita)" className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs px-2 py-1.5">
                <option value="">Todos os tiers</option>
                <option value="A">Tier A (≥80k)</option>
                <option value="B">Tier B (≥45k)</option>
                <option value="C">Tier C (≥25k)</option>
                <option value="D">Tier D (&lt;25k)</option>
              </select>
            </div>
            <div>
              <input
                value={minPop}
                onChange={(e) => setMinPop(e.target.value)}
                placeholder="Pop. mín"
                title="População mínima (ex: 30000)"
                inputMode="numeric"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <input
                value={maxPop}
                onChange={(e) => setMaxPop(e.target.value)}
                placeholder="Pop. máx"
                title="População máxima (ex: 200000)"
                inputMode="numeric"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <select value={searchedFilter} onChange={(e) => setSearchedFilter(e.target.value as any)} title="Status de busca na rotação" className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs px-2 py-1.5">
                <option value="all">Buscadas + novas</option>
                <option value="never">Nunca buscadas</option>
                <option value="done">Já buscadas</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value as any)} title="Situação na rotação" className="bg-slate-50 border border-slate-200 rounded-lg text-xs px-2 py-1.5">
              <option value="all">Ativas + desativadas</option>
              <option value="on">Só ativas na rotação</option>
              <option value="off">Só desativadas</option>
            </select>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline px-1">
                Limpar filtros
              </button>
            )}
            <span className="ml-auto text-xs text-slate-500">{filtered.length} de {cities.length} cidade(s) exibidas</span>
          </div>
        </div>

        {/* Tabela */}
        <div className="mt-4 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2.5 text-left">Cidade</th>
                  <th className="px-3 py-2.5 text-center">População</th>
                  <th className="px-3 py-2.5 text-center">PIB per capita</th>
                  <th className="px-3 py-2.5 text-center">Tier</th>
                  <th className="px-3 py-2.5 text-center">Buscas</th>
                  <th className="px-3 py-2.5 text-center">Última busca</th>
                  <th className="px-3 py-2.5 text-center">Ativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">Carregando base IBGE...</td></tr>
                )}
                {!loading && filtered.map((city) => (
                  <tr key={city.ibgeCode} className={`hover:bg-slate-50 ${!city.enabled ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900 text-xs">{city.name}</div>
                      <div className="text-[11px] text-slate-500">{city.uf}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-700">{city.population.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-700">R$ {city.pibPerCapita.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${TIER_STYLES[city.marketTier]}`}>{city.marketTier}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-3 h-3 text-slate-400" /> {city.searchCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                      {city.lastSearchedAt ? new Date(city.lastSearchedAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={city.enabled}
                        onChange={(e) => toggleCity(city.ibgeCode, e.target.checked)}
                        className="rounded cursor-pointer"
                        title={city.enabled ? 'Desabilitar da rotação' : 'Habilitar na rotação'}
                      />
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">Nenhuma cidade com esses filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
