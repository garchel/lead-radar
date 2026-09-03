import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, MapPin, Filter, Sparkles, LayoutGrid, Map, RefreshCw, Globe, Download, Database, Zap, AlertTriangle, Clock, Calendar, Key, Crown, Award, Power, ChevronDown } from 'lucide-react';
import { SearchFilters, SerpApiUsage } from '../types';
import { CATEGORY_OPTIONS } from '../data/catalog';
import { BRAZIL_STATES, CITIES_BY_STATE, getCitiesForState } from '../data/brazilLocations';
import { SerpApiKeyManager } from './SerpApiKeyManager';

interface SectorInfo {
  id: string;
  name: string;
  isActive: boolean;
}

/** Seletor de setor com liga/desliga global (mesmo isActive da aba Categorias). */
const SectorPicker: React.FC<{
  id: string;
  value: string;
  onChange: (name: string) => void;
  sectors: SectorInfo[];
  togglingId: string | null;
  onToggleActive: (s: SectorInfo) => void;
}> = ({ id, value, onChange, sectors, togglingId, onToggleActive }) => {
  const [open, setOpen] = useState(false);
  const activeCount = sectors.filter((s) => s.isActive).length;
  const shown = value === 'Todas as Categorias' ? `Todas as Categorias (${activeCount})` : value;
  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium flex items-center justify-between gap-2 text-left"
      >
        <Filter className="w-5 h-5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
        <span className="truncate">{shown}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Fechar lista de setores" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default bg-transparent border-0 p-0" />
          <div className="absolute z-40 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto py-1 text-sm min-w-[220px]">
            <button
              type="button"
              onClick={() => { onChange('Todas as Categorias'); setOpen(false); }}
              className={`w-full text-left px-3 py-2 font-semibold transition-colors ${value === 'Todas as Categorias' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              Todas as Categorias ({activeCount})
            </button>
            <div className="border-t border-slate-100" />
            {sectors.map((s) => (
              <div key={s.id} className={`flex items-center gap-2 px-3 py-1.5 transition-colors ${s.isActive ? 'hover:bg-slate-50' : 'opacity-45'}`}>
                <button
                  type="button"
                  disabled={!s.isActive}
                  onClick={() => { onChange(s.name); setOpen(false); }}
                  title={s.isActive ? `Buscar só em ${s.name}` : 'Setor desativado — ative ao lado para usar'}
                  className={`flex-1 text-left truncate ${value === s.name ? 'text-indigo-700 font-bold' : 'text-slate-700 font-medium'}`}
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  disabled={togglingId === s.id}
                  onClick={() => onToggleActive(s)}
                  title={s.isActive ? `Desativar ${s.name} (vale para buscas e rotação)` : `Ativar ${s.name}`}
                  className={`p-1 rounded-md transition-colors disabled:opacity-50 ${s.isActive ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <p className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">O liga/desliga vale para todas as buscas e a rotação.</p>
          </div>
        </>
      )}
    </div>
  );
};

interface SearchHeaderProps {
  filters: SearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<SearchFilters>>;
  onSearch: () => void;
  isSearching: boolean;
  viewMode: 'grid' | 'map';
  setViewMode: (mode: 'grid' | 'map') => void;
  resultsCount: number;
  noWebsiteCount: number;
  onExportCSV?: () => void;
}

export const SearchHeader: React.FC<SearchHeaderProps> = ({
  filters,
  setFilters,
  onSearch,
  isSearching,
  viewMode,
  setViewMode,
  resultsCount,
  noWebsiteCount,
  onExportCSV,
}) => {
  const [isCityFocused, setIsCityFocused] = useState(false);
  const [usage, setUsage] = useState<SerpApiUsage | null>(null);
  const [providers, setProviders] = useState<{ id: string; configured: boolean }[]>([]);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [isKeyManagerOpen, setIsKeyManagerOpen] = useState(false);
  const [sectors, setSectors] = useState<SectorInfo[]>(() =>
    CATEGORY_OPTIONS.filter((n) => n !== 'Todas as Categorias').map((n) => ({ id: n, name: n, isActive: true }))
  );
  const [togglingSectorId, setTogglingSectorId] = useState<string | null>(null);

  const loadSectors = useCallback(async () => {
    try {
      const d = await fetch('/api/categories').then((r) => r.json());
      const list = Array.isArray(d?.categories) ? d.categories : [];
      const clean = list
        .filter((c: any) => c?.name && c.name !== 'Todas as Categorias')
        .map((c: any) => ({ id: String(c.id ?? c.name), name: String(c.name), isActive: c.isActive !== false }));
      if (clean.length) setSectors(clean);
    } catch {
      /* mantém fallback local */
    }
  }, []);

  useEffect(() => {
    void loadSectors();
  }, [loadSectors]);

  const toggleSectorActive = async (s: SectorInfo) => {
    setTogglingSectorId(s.id);
    try {
      const r = await fetch(`/api/categories/${encodeURIComponent(s.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !s.isActive }),
      }).then((x) => x.json());
      if (!r?.success) throw new Error(r?.error || 'Falha ao atualizar setor.');
      const nextActive = !s.isActive;
      setSectors((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: nextActive } : x)));
      if (!nextActive) {
        setFilters((prev) => (prev.category === s.name ? { ...prev, category: 'Todas as Categorias' } : prev));
      }
    } catch {
      /* silencioso — o toggle mostra o estado real após recarregar */
    } finally {
      setTogglingSectorId(null);
    }
  };

  const fetchUsage = async () => {
    try {
      const r = await fetch('/api/prospecting/usage');
      const d = await r.json();
      if (d?.success && d.usage) setUsage(d.usage as SerpApiUsage);
      const p = await fetch('/api/prospecting/providers');
      const pd = await p.json();
      if (pd?.success && Array.isArray(pd.providers)) setProviders(pd.providers);
      setUsageError(null);
    } catch (e: any) {
      setUsageError(e?.message || 'Falha ao carregar uso');
    }
  };

  useEffect(() => {
    void fetchUsage();
  }, []);

  useEffect(() => {
    if (!isSearching) void fetchUsage();
  }, [isSearching]);

  const serpConfigured = providers.find((p) => p.id === 'serpapi')?.configured ?? usage?.configured ?? false;
  const geminiConfigured = providers.find((p) => p.id === 'gemini')?.configured ?? false;
  const currentProvider = filters.provider || (serpConfigured ? 'serpapi' : 'gemini');

  useEffect(() => {
    if (providers.length === 0) return;
    if (currentProvider === 'serpapi' && !serpConfigured && geminiConfigured) {
      setFilters((prev) => ({ ...prev, provider: 'gemini' }));
    } else if (currentProvider === 'gemini' && !geminiConfigured && serpConfigured) {
      setFilters((prev) => ({ ...prev, provider: 'serpapi' }));
    }
  }, [providers, serpConfigured, geminiConfigured]);

  const selectedState = filters.state || 'SP';
  const isRotation = Boolean(filters.useCityRotation);
  const autoSaveMode = filters.autoSaveMode ?? 'off';

  // Get cities list for current state
  const citiesForSelectedState = useMemo(() => {
    if (selectedState === 'ALL') {
      return getCitiesForState('');
    }
    return getCitiesForState(selectedState);
  }, [selectedState]);

  // Filter cities as user types in location field
  const filteredCitySuggestions = useMemo(() => {
    if (!filters.location) return citiesForSelectedState.slice(0, 8);
    const query = filters.location.toLowerCase().trim();
    const matches = citiesForSelectedState.filter((city) =>
      city.toLowerCase().includes(query)
    );
    return matches.slice(0, 10);
  }, [citiesForSelectedState, filters.location]);

  const handleStateChange = (newState: string) => {
    const availableCities = getCitiesForState(newState === 'ALL' ? '' : newState);
    const defaultCity = availableCities[0] || 'São Paulo';
    
    setFilters((prev) => ({
      ...prev,
      state: newState,
      location: defaultCity,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <div className="bg-slate-100 border-b border-slate-200/80 py-6 px-4 sm:px-6 lg:px-8">
      <div className="space-y-5">
        {/* Title Banner */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center space-x-2">
              <span>Mapeamento de Região & Oportunidades</span>
              <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" /> Diagnóstico IA
              </span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Foram encontradas empresas locais com excelente reputação no Google que <strong className="text-indigo-600 font-semibold">não possuem presença de landing page</strong> para fechar contratos de criação de sites.
            </p>
          </div>

          {/* Quick Stats Pill & Export CSV */}
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm text-xs sm:text-sm">
              <div className="px-2.5 py-1 bg-slate-50 rounded-lg text-slate-600 border border-slate-100">
                Mapeados: <strong className="text-slate-900 font-bold">{resultsCount}</strong>
              </div>
              <div className="px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700 font-bold">
                Sem Site: <strong>{noWebsiteCount}</strong>
              </div>
            </div>

            {onExportCSV && (
              <button
                type="button"
                onClick={onExportCSV}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2.5 rounded-xl text-xs flex items-center space-x-1.5 shadow-sm transition-all"
                title="Exportar todos os leads exibidos para planilha CSV"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Provider + Uso SerpAPI */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Provedor de prospecção</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, provider: 'serpapi' }))}
                  disabled={!serpConfigured}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                    currentProvider === 'serpapi'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : serpConfigured
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 cursor-not-allowed'
                  }`}
                  title={serpConfigured ? 'Google Maps real via SerpAPI (sem invenção)' : 'Configure SERPAPI_API_KEY no .env'}
                >
                  <Database className="w-3.5 h-3.5" />
                  SerpAPI
                  {!serpConfigured && <span className="text-[10px]">(sem chave)</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, provider: 'gemini' }))}
                  disabled={!geminiConfigured}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                    currentProvider === 'gemini'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : geminiConfigured
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 cursor-not-allowed'
                  }`}
                  title={geminiConfigured ? 'Gemini com Google Search grounding' : 'Configure GEMINI_API_KEY'}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Gemini
                  {!geminiConfigured && <span className="text-[10px]">(sem chave)</span>}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                {currentProvider === 'serpapi'
                  ? 'Apenas empresas reais do Google Maps. Sem dados inventados.'
                  : 'IA com busca — pode falhar por cota 429. Sem dados inventados.'}
              </p>
              <button
                type="button"
                onClick={() => setIsKeyManagerOpen(true)}
                className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-200 bg-white font-semibold px-2.5 py-1 rounded-lg text-xs transition-colors"
              >
                <Key className="w-3.5 h-3.5" /> Gerenciar chaves SerpAPI
              </button>
            </div>

            {usage && (
              <div className="flex-1 lg:max-w-md space-y-2">
                {!usage.configured ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">SerpAPI não configurada</p>
                      <p>Defina <code className="bg-white px-1 rounded border">SERPAPI_API_KEY</code> no .env para usar o provedor real. Enquanto isso, use Gemini.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600 flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Mês {usage.monthKey}</span>
                      <span className={`font-bold ${usage.remainingThisMonth < 20 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {usage.usedThisMonth}/{usage.searchesPerMonth} usados — {usage.remainingThisMonth} restantes
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${usage.remainingThisMonth < 20 ? 'bg-amber-500' : usage.remainingThisMonth === 0 ? 'bg-red-500' : 'bg-indigo-600'}`}
                        style={{ width: `${Math.min(100, (usage.usedThisMonth / usage.searchesPerMonth) * 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Hora</span>
                      <span className={`font-bold ${usage.remainingThisHour < 5 ? 'text-amber-600' : 'text-slate-700'}`}>
                        {usage.usedThisHour}/{usage.throughputPerHour} — {usage.remainingThisHour} restantes
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${usage.remainingThisHour < 5 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, (usage.usedThisHour / usage.throughputPerHour) * 100)}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> Renova mês: {new Date(usage.nextMonthlyReset).toLocaleDateString('pt-BR')}</span>
                      {usage.nextHourlyReset && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Renova hora: {new Date(usage.nextHourlyReset).toLocaleTimeString('pt-BR')}</span>}
                    </div>
                    <p className="text-[11px] text-slate-400">Apenas sucesso conta. Cache (1h) e erros não consomem. Free: 250/mês, 50/hora por chave — renova no dia da criação (ou data que você definir).</p>
                  </>
                )}
                {usageError && <p className="text-[11px] text-red-600">{usageError}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Search Bar Form */}
        <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          {/* Modalidade de busca */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider sm:ml-1 shrink-0">Modo de busca</span>
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs w-fit">
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, useCityRotation: false }))}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  !isRotation ? 'bg-white text-slate-900 shadow-xs border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                Cidade específica
              </button>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, useCityRotation: true }))}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  isRotation ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Busca nas próximas cidades da fila IBGE há mais tempo sem pesquisar"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rotação automática
                {isRotation && <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">ATIVA</span>}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              {isRotation
                ? 'A cidade digitada é ignorada — a busca usa as próximas cidades da fila IBGE.'
                : 'Busca manual na cidade e UF que você escolher abaixo.'}
            </p>
          </div>

          {!isRotation ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            
            {/* State (UF) Selector */}
            <div className="md:col-span-2 relative">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Estado (UF)</label>
              <div className="relative">
                <Globe className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <select
                  id="search-state-select"
                  value={filters.state || 'SP'}
                  onChange={(e) => handleStateChange(e.target.value)}
                  className="w-full pl-9 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                >
                  <option value="ALL">Todos os UFs</option>
                  {BRAZIL_STATES.map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* City / Neighborhood Input with Autocomplete */}
            <div className="md:col-span-4 relative">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Cidade / Bairro / Região</label>
              <div className="relative">
                <MapPin className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="search-location-input"
                  type="text"
                  value={filters.location}
                  onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
                  onFocus={() => setIsCityFocused(true)}
                  onBlur={() => setTimeout(() => setIsCityFocused(false), 200)}
                  placeholder="Digite cidade ou bairro (ex: Pinheiros)"
                  list="city-suggestions-list"
                  autoComplete="off"
                  className="w-full pl-10 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 font-medium bg-slate-50 border-slate-200 text-slate-900 focus:bg-white"
                />

                {/* HTML Datalist Fallback */}
                <datalist id="city-suggestions-list">
                  {citiesForSelectedState.map((city) => (
                    <option key={city} value={city} />
                  ))}
                </datalist>

                {/* Custom Autocomplete Dropdown List */}
                {isCityFocused && filteredCitySuggestions.length > 0 && (
                  <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto py-1 text-xs">
                    <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                      Sugestões para {filters.state === 'ALL' ? 'Brasil' : filters.state}:
                    </div>
                    {filteredCitySuggestions.map((city) => (
                      <button
                        key={city}
                        type="button"
                        onMouseDown={() => {
                          setFilters((prev) => ({ ...prev, location: city }));
                          setIsCityFocused(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-medium transition-colors flex items-center justify-between"
                      >
                        <span>{city}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{filters.state || 'UF'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Category Select */}
            <div className="md:col-span-3 relative">
              <label htmlFor="search-category-select" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Setor Comercial</label>
              <SectorPicker
                id="search-category-select"
                value={filters.category}
                onChange={(name) => setFilters((prev) => ({ ...prev, category: name }))}
                sectors={sectors}
                togglingId={togglingSectorId}
                onToggleActive={(s) => void toggleSectorActive(s)}
              />
            </div>

            {/* Search Action Button */}
            <div className="md:col-span-3 flex items-end">
              <button
                id="search-submit-btn"
                type="submit"
                disabled={isSearching}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl shadow-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50 active:scale-98"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Mapeando com IA...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Filtrar e Mapear Região</span>
                  </>
                )}
              </button>
            </div>
          </div>

          ) : (
          <div className="space-y-3">
            {/* Configuração da rotação (fila IBGE) */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:p-4 space-y-3">
              <p className="text-xs text-slate-600">
                Busca nas <strong className="font-bold">próximas cidades da fila IBGE</strong> (nunca buscadas primeiro, maior população antes). Cada cidade é marcada como visitada.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Cidades por busca</label>
                  <input type="number" min={1} max={10} value={filters.citiesPerRun ?? 3} onChange={(e) => setFilters((prev) => ({ ...prev, citiesPerRun: Math.max(1, Math.min(10, Number(e.target.value)||3)) }))} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">UF filtro</label>
                  <select value={filters.rotationUf || ''} onChange={(e) => setFilters((prev) => ({ ...prev, rotationUf: e.target.value }))} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium">
                    <option value="">Todas</option>
                    {BRAZIL_STATES.map((st) => <option key={st.code} value={st.code}>{st.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Pop. mín</label>
                  <input type="number" value={filters.minPopulation ?? 30000} onChange={(e) => setFilters((prev) => ({ ...prev, minPopulation: Number(e.target.value) }))} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Pop. máx</label>
                  <input type="number" value={filters.maxPopulation ?? 200000} onChange={(e) => setFilters((prev) => ({ ...prev, maxPopulation: Number(e.target.value) }))} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Propensão mín: {filters.minPropensity ?? 0}</label>
                  <input type="range" min={0} max={100} step={5} value={filters.minPropensity ?? 0} onChange={(e) => setFilters((prev) => ({ ...prev, minPropensity: Number(e.target.value) }))} className="w-full" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Category Select */}
              <div className="md:col-span-9 relative">
                <label htmlFor="search-category-select-rotation" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Setor Comercial</label>
                <SectorPicker
                  id="search-category-select-rotation"
                  value={filters.category}
                  onChange={(name) => setFilters((prev) => ({ ...prev, category: name }))}
                  sectors={sectors}
                  togglingId={togglingSectorId}
                  onToggleActive={(s) => void toggleSectorActive(s)}
                />
              </div>

              {/* Search Action Button */}
              <div className="md:col-span-3 flex items-end">
                <button
                  type="submit"
                  disabled={isSearching}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl shadow-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50 active:scale-98"
                >
                  {isSearching ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Mapeando rotação...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5" />
                      <span>Buscar na Rotação</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Auto-save + Sort & View Mode Controls */}
          <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 gap-3 text-xs sm:text-sm text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 text-xs font-semibold">Auto-salvar no CRM:</span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, autoSaveMode: 'off' }))}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                    autoSaveMode === 'off'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Não
                </button>
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, autoSaveMode: 'gold' }))}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center space-x-1 ${
                    autoSaveMode === 'gold'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-amber-700 hover:bg-amber-100/50'
                  }`}
                  title="Salva sozinho no CRM as empresas sem nenhum site"
                >
                  <Crown className="w-3 h-3 fill-amber-200 text-amber-100" />
                  <span>Ouro</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, autoSaveMode: 'gold_silver' }))}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all flex items-center space-x-1 ${
                    autoSaveMode === 'gold_silver'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                  title="Salva sozinho no CRM as empresas sem site e as que só têm Instagram"
                >
                  <Award className="w-3 h-3 text-slate-200" />
                  <span>Ouro+Prata</span>
                </button>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 text-xs font-semibold">Ordenar por:</span>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value as any }))}
                  className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs py-1 px-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="score">Maior Oportunidade (Score)</option>
                  <option value="rating">Melhor Avaliação Google</option>
                  <option value="reviews">Mais Avaliações</option>
                  <option value="name">Nome (A-Z)</option>
                </select>
              </div>

              {/* Grid vs Map Toggle */}
              <div className="bg-slate-100 p-1 rounded-lg border border-slate-200 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md flex items-center space-x-1 text-xs font-semibold transition-all ${
                    viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline">Tabela/Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('map')}
                  className={`p-1.5 rounded-md flex items-center space-x-1 text-xs font-semibold transition-all ${
                    viewMode === 'map' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Map className="w-4 h-4" />
                  <span className="hidden sm:inline">Mapa</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
      {isKeyManagerOpen && (
        <SerpApiKeyManager onClose={() => setIsKeyManagerOpen(false)} onChanged={() => void fetchUsage()} />
      )}
    </div>
  );
};
