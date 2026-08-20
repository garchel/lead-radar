import React, { useState, useMemo } from 'react';
import { Search, MapPin, Filter, Sparkles, LayoutGrid, Map, RefreshCw, Globe, Download, Crown, Award } from 'lucide-react';
import { SearchFilters } from '../types';
import { CATEGORY_OPTIONS } from '../data/catalog';
import { BRAZIL_STATES, CITIES_BY_STATE, getCitiesForState } from '../data/brazilLocations';

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

  const selectedState = filters.state || 'SP';

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
      <div className="max-w-7xl mx-auto space-y-5">
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

        {/* Search Bar Form */}
        <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
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
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 font-medium"
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
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1">Setor Comercial</label>
              <div className="relative">
                <Filter className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                <select
                  id="search-category-select"
                  value={filters.category}
                  onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer font-medium"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
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

          {/* Quick City Suggestion Pills */}
          {citiesForSelectedState.length > 0 && (
            <div className="flex items-center space-x-2 overflow-x-auto pt-1 pb-1 scrollbar-none text-xs">
              <span className="text-slate-400 font-semibold text-[11px] shrink-0">Cidades rápidas ({filters.state || 'BR'}):</span>
              {citiesForSelectedState.slice(0, 6).map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, location: city }))}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all shrink-0 ${
                    filters.location.toLowerCase() === city.toLowerCase()
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          )}

          {/* Filtro Rápido por Presença Digital (Melhoria 5: Ouro vs Prata) */}
          <div className="flex flex-wrap items-center justify-between pt-3 border-t border-slate-100 gap-3 text-xs sm:text-sm text-slate-600">
            <div className="flex items-center space-x-2">
              <span className="text-slate-500 font-bold text-xs">Nível de Presença Digital:</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, presenceFilter: 'all', filterNoWebsiteOnly: false }))}
                  className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center space-x-1 ${
                    (!filters.presenceFilter || filters.presenceFilter === 'all') && !filters.filterNoWebsiteOnly
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Todos</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, presenceFilter: 'gold', filterNoWebsiteOnly: true }))}
                  className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center space-x-1.5 ${
                    filters.presenceFilter === 'gold' || (filters.filterNoWebsiteOnly && filters.presenceFilter !== 'silver')
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-amber-700 hover:bg-amber-100/50'
                  }`}
                  title="Empresas sem nenhum site (Oportunidade Ouro - Fechamento Alto)"
                >
                  <Crown className="w-3.5 h-3.5 fill-amber-200 text-amber-100" />
                  <span>Sem Site (Ouro 👑)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, presenceFilter: 'silver', filterNoWebsiteOnly: false }))}
                  className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center space-x-1.5 ${
                    filters.presenceFilter === 'silver'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-slate-200/60'
                  }`}
                  title="Empresas apenas com perfil no Instagram (Oportunidade Prata - Falta LP de Conversão)"
                >
                  <Award className="w-3.5 h-3.5 text-slate-200" />
                  <span>Apenas Instagram (Prata 🥈)</span>
                </button>
              </div>
            </div>

            {/* Sort & View Mode Controls */}
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
    </div>
  );
};
