import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, RefreshCw, TrendingUp, Search, Users, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

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

/** Exibe dígitos com espaço a cada 3 casas (ex: 30000 → "30 000"). Guarda só dígitos no estado. */
const formatThousands = (digits: string) => {
  const d = digits.replace(/\D/g, '');
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const CitiesQueueDashboard: React.FC = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [ufFilter, setUfFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [minPop, setMinPop] = useState('');
  const [maxPop, setMaxPop] = useState('');
  const [appliedMinPop, setAppliedMinPop] = useState('');
  const [appliedMaxPop, setAppliedMaxPop] = useState('');
  const [searchedFilter, setSearchedFilter] = useState<'all' | 'never' | 'done'>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'on' | 'off'>('all');
  const [appliedUf, setAppliedUf] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'population' | 'pibPerCapita' | 'marketTier' | 'searchCount' | 'lastSearchedAt' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  // Paginação: 500 linhas de uma vez eram um paredão de 26 mil px.
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  // Seleção em lote (desabilitar 100 cidades não deve custar 100 cliques).
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const firstLoadRef = useRef(true);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Recarregamento por filtro mantém as linhas visíveis (só o 1º load usa skeleton)
    if (firstLoadRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (appliedUf) params.set('uf', appliedUf);
      if (appliedMinPop) params.set('minPopulation', appliedMinPop);
      if (appliedMaxPop) params.set('maxPopulation', appliedMaxPop);
      params.set('limit', '500');
      const citiesRes = await fetch(`/api/cities?${params}`, { signal: ctrl.signal }).then((r) => r.json());
      if (citiesRes.success) {
        setCities(citiesRes.cities);
        firstLoadRef.current = false;
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') { /* silencioso */ }
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [appliedUf, appliedMinPop, appliedMaxPop]);

  // Stats globais: carrega 1x (não dependem dos filtros)
  useEffect(() => {
    fetch('/api/cities/stats')
      .then((r) => r.json())
      .then((d) => { if (d.success) setStats(d); })
      .catch(() => {});
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Aplica UF + pop mín/máx no servidor com debounce (evita 1 request por tecla)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setAppliedUf(ufFilter);
      setAppliedMinPop(minPop.replace(/\D/g, ''));
      setAppliedMaxPop(maxPop.replace(/\D/g, ''));
    }, 500);
    return () => window.clearTimeout(t);
  }, [ufFilter, minPop, maxPop]);

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

  const bulkToggle = async (enabled: boolean) => {
    if (selected.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await fetch('/api/cities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: selected, enabled }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || 'Falha ao atualizar em lote');
      const alvo = new Set(selected);
      setCities((prev) => prev.map((c) => (alvo.has(c.ibgeCode) ? { ...c, enabled } : c)));
      setSelected([]);
    } catch (err: any) {
      window.alert(err?.message || 'Falha ao atualizar em lote');
    } finally {
      setBulkSaving(false);
    }
  };

  const toggleSelected = (code: string) => {
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
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

  const toggleSort = (key: NonNullable<typeof sortKey>) => {
    if (sortKey !== key) {
      setSortKey(key);
      // Direção inicial sensata por coluna: nome A→Z, resto maior→menor
      setSortDir(key === 'name' ? 'asc' : 'desc');
    } else {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    }
  };

  const sortedAll = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name':
        return dir * `${a.name} ${a.uf}`.localeCompare(`${b.name} ${b.uf}`, 'pt-BR');
      case 'population':
        return dir * (a.population - b.population);
      case 'pibPerCapita':
        return dir * (a.pibPerCapita - b.pibPerCapita);
      case 'marketTier':
        return dir * (a.marketTier.localeCompare(b.marketTier));
      case 'searchCount':
        return dir * (a.searchCount - b.searchCount);
      case 'lastSearchedAt':
        return dir * ((a.lastSearchedAt || '').localeCompare(b.lastSearchedAt || ''));
      default:
        return 0;
    }
  });

  // recorte da página atual
  const totalPages = Math.max(1, Math.ceil(sortedAll.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const sorted = sortedAll.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageSelected = sorted.filter((c) => selected.includes(c.ibgeCode)).length;
  const allPageSelected = sorted.length > 0 && pageSelected === sorted.length;

  const SortIcon = ({ col }: { col: NonNullable<typeof sortKey> }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-indigo-600" />
      : <ArrowDown className="w-3 h-3 text-indigo-600" />;
  };

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
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Header */}
      <div>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-indigo-600" /> Fila de Cidades
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">IBGE • round-robin</span>
            </h1>
            <p className="text-sm text-slate-600 mt-1">Base de municípios usada na rotação de prospecção. Desabilite cidades que não quer buscar; a fila sempre pega as há mais tempo sem busca.</p>
          </div>
          <button onClick={load} disabled={loading || refreshing} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${(loading || refreshing) ? 'animate-spin' : ''}`} /> Atualizar
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
      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <div className="col-span-2 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
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
                value={formatThousands(minPop)}
                onChange={(e) => setMinPop(e.target.value.replace(/\D/g, ''))}
                placeholder="Pop. mín"
                title="População mínima (ex: 30 000)"
                inputMode="numeric"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <input
                value={formatThousands(maxPop)}
                onChange={(e) => setMaxPop(e.target.value.replace(/\D/g, ''))}
                placeholder="Pop. máx"
                title="População máxima (ex: 200 000)"
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
            <span className="ml-auto text-xs text-slate-500 flex items-center gap-1.5">
              {refreshing && <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />}
              {filtered.length} de {cities.length} cidade(s) exibidas
            </span>
          </div>
        </div>

        {/* Tabela */}
        <div className={`mt-4 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-2 py-2.5 text-center w-8">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={() => {
                        setSelected((prev) => {
                          const pageCodes = sorted.map((c) => c.ibgeCode);
                          if (allPageSelected) return prev.filter((code) => !pageCodes.includes(code));
                          return Array.from(new Set([...prev, ...pageCodes]));
                        });
                      }}
                      aria-label="Selecionar todas desta página"
                      title="Selecionar todas desta página"
                      className="rounded cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left">
                    <button type="button" onClick={() => toggleSort('name')} title="Ordenar por cidade" className={`inline-flex items-center gap-1 min-h-8 px-1 hover:text-indigo-600 ${sortKey === 'name' ? 'text-indigo-600' : ''}`}>
                      Cidade <SortIcon col="name" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <button type="button" onClick={() => toggleSort('population')} title="Ordenar por população" className={`inline-flex items-center gap-1 hover:text-indigo-600 ${sortKey === 'population' ? 'text-indigo-600' : ''}`}>
                      População <SortIcon col="population" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <button type="button" onClick={() => toggleSort('pibPerCapita')} title="Ordenar por PIB per capita" className={`inline-flex items-center gap-1 hover:text-indigo-600 ${sortKey === 'pibPerCapita' ? 'text-indigo-600' : ''}`}>
                      PIB per capita <SortIcon col="pibPerCapita" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <button type="button" onClick={() => toggleSort('marketTier')} title="Ordenar por tier" className={`inline-flex items-center gap-1 hover:text-indigo-600 ${sortKey === 'marketTier' ? 'text-indigo-600' : ''}`}>
                      Tier <SortIcon col="marketTier" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <button type="button" onClick={() => toggleSort('searchCount')} title="Ordenar por nº de buscas" className={`inline-flex items-center gap-1 hover:text-indigo-600 ${sortKey === 'searchCount' ? 'text-indigo-600' : ''}`}>
                      Buscas <SortIcon col="searchCount" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">
                    <button type="button" onClick={() => toggleSort('lastSearchedAt')} title="Ordenar por última busca" className={`inline-flex items-center gap-1 hover:text-indigo-600 ${sortKey === 'lastSearchedAt' ? 'text-indigo-600' : ''}`}>
                      Última busca <SortIcon col="lastSearchedAt" />
                    </button>
                  </th>
                  <th className="px-3 py-2.5 text-center">Ativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">Carregando base IBGE...</td></tr>
                )}
                {!loading && sorted.map((city) => (
                  <tr key={city.ibgeCode} className={`hover:bg-slate-50 ${!city.enabled ? 'opacity-50' : ''}`}>
                    <td className="px-2 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selected.includes(city.ibgeCode)}
                        onChange={() => toggleSelected(city.ibgeCode)}
                        aria-label={`Selecionar ${city.name}`}
                        className="rounded cursor-pointer"
                      />
                    </td>
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
                        <Users className="w-3 h-3 text-slate-500" /> {city.searchCount}
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
                {!loading && sorted.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">Nenhuma cidade com esses filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Ações em lote + paginação */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t border-slate-200 bg-slate-50">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {selected.length > 0 ? (
                <>
                  <span className="font-bold text-slate-700">{selected.length} selecionada(s)</span>
                  <button
                    type="button"
                    disabled={bulkSaving}
                    onClick={() => void bulkToggle(false)}
                    className="px-2.5 py-1.5 rounded-lg font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Desabilitar selecionadas
                  </button>
                  <button
                    type="button"
                    disabled={bulkSaving}
                    onClick={() => void bulkToggle(true)}
                    className="px-2.5 py-1.5 rounded-lg font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Habilitar selecionadas
                  </button>
                  <button type="button" onClick={() => setSelected([])} className="text-slate-500 hover:text-slate-800 font-semibold px-1">
                    limpar seleção
                  </button>
                </>
              ) : (
                <span className="text-slate-500">Marque cidades para ativar/desativar em lote.</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 min-h-8 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-slate-600 tabular-nums">
                {currentPage}/{totalPages} · {sortedAll.length} cidade(s)
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 min-h-8 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
