import React, { useState, useEffect } from 'react';
import { Building2, Star, MapPin, Phone, Globe, Download, Eye, Code, Table as TableIcon, LayoutGrid, SearchX, TrendingUp, Award, Banknote } from 'lucide-react';
import { BusinessLead } from '../types';
import { SerpApiRawViewer } from './SerpApiRawViewer';
import { exportLeadsToCSV } from '../utils/exportUtils';

interface Props {
  leads: BusinessLead[];
  serpApiRaw?: any;
  serpApiMeta?: any;
  cached?: boolean;
  onToggleSave: (lead: BusinessLead) => void;
  onAnalyze: (lead: BusinessLead) => void;
  savedLeadIds: Set<string>;
}

export const SerpApiResultsPage: React.FC<Props> = ({ leads, serpApiRaw, serpApiMeta, cached, onToggleSave, onAnalyze, savedLeadIds }) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'raw'>('table');
  const [raw, setRaw] = useState<any>(serpApiRaw || null);
  const [meta, setMeta] = useState<any>(serpApiMeta || null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'none' | 'social_only' | 'has_website'>('all');
  const [onlyNew, setOnlyNew] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortField, setSortField] = useState<'city' | 'state' | 'category' | 'score' | 'rating' | 'name'>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (serpApiRaw) {
      setRaw(serpApiRaw);
      setMeta(serpApiMeta || null);
    } else {
      // tenta buscar último raw persistido
      fetch('/api/serpapi/last-search')
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.hasData) {
            setRaw(d.raw);
            setMeta(d.meta);
          }
        })
        .catch(() => {});
    }
  }, [serpApiRaw, serpApiMeta]);

  const uniqueCities = Array.from(new Set(leads.map((l) => l.city).filter(Boolean))).sort();
  const uniqueStates = Array.from(new Set(leads.map((l) => l.state).filter(Boolean) as string[])).sort();
  const uniqueCategories = Array.from(new Set(leads.map((l) => l.category).filter(Boolean))).sort();

  const filteredBase = leads.filter((l) => {
    if (onlyNew && (l.isAlreadySaved || savedLeadIds.has(l.id))) return false;
    if (filterStatus !== 'all' && l.websiteStatus !== filterStatus) return false;
    if (cityFilter.trim() && !l.city.toLowerCase().includes(cityFilter.trim().toLowerCase())) return false;
    if (stateFilter !== 'all' && (l.state || '').toUpperCase() !== stateFilter.toUpperCase()) return false;
    if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
    return true;
  });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir(field === 'score' || field === 'rating' ? 'desc' : 'asc'); }
  };

  const filtered = [...filteredBase].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortField === 'score') return dir * ((a.opportunityScore ?? 0) - (b.opportunityScore ?? 0));
    if (sortField === 'rating') return dir * ((a.rating ?? 0) - (b.rating ?? 0));
    if (sortField === 'city') return dir * a.city.localeCompare(b.city, 'pt-BR');
    if (sortField === 'state') return dir * (a.state || '').localeCompare(b.state || '', 'pt-BR');
    if (sortField === 'category') return dir * a.category.localeCompare(b.category, 'pt-BR');
    return dir * a.name.localeCompare(b.name, 'pt-BR');
  });

  const newCount = leads.filter((l) => !l.isAlreadySaved && !savedLeadIds.has(l.id)).length;

  const stats = {
    total: leads.length,
    semSite: leads.filter((l) => l.websiteStatus === 'none').length,
    comSite: leads.filter((l) => l.websiteStatus === 'has_website').length,
    avgRating: leads.length ? (leads.reduce((s, l) => s + (l.rating || 0), 0) / leads.length).toFixed(1) : '—',
  };

  if (leads.length === 0 && !raw) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-4 shadow-sm">
          <SearchX className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900">Nenhuma empresa visualizada</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">Faça uma busca em <strong>Busca de Região → Filtrar e Mapear Região</strong> com o provedor <strong>SerpAPI</strong> para ver as empresas reais aqui e o JSON bruto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-100 border-b border-slate-200/80 py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-indigo-600" /> Empresas Encontradas
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">SerpAPI real</span>
              {cached && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Cache • 0 gasto (7 dias)</span>}
            </h1>
            <p className="text-slate-500 text-sm mt-1">Visualização completa das empresas retornadas pela SerpAPI (Google Maps). Sem dados inventados — apenas o que veio do <code className="bg-white px-1 rounded border text-xs">local_results</code>. {cached ? 'Esta busca veio do cache local (não consumiu cota).' : 'Empresas já cadastradas são marcadas.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm text-xs">
              <span className="px-2.5 py-1 bg-slate-50 rounded-lg border">Total <strong>{stats.total}</strong></span>
              <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg font-bold">Sem site {stats.semSite}</span>
              <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg font-bold">Com site {stats.comSite}</span>
              <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg">Média {stats.avgRating}★</span>
            </div>
            <button onClick={() => exportLeadsToCSV(filtered)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200">
            <button onClick={() => setViewMode('table')} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <TableIcon className="w-4 h-4" /> Tabela
            </button>
            <button onClick={() => setViewMode('cards')} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${viewMode === 'cards' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <LayoutGrid className="w-4 h-4" /> Cards
            </button>
            <button onClick={() => setViewMode('raw')} className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${viewMode === 'raw' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Code className="w-4 h-4" /> Raw SerpAPI
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer">
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="rounded" />
              Só novas ({newCount})
            </label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="bg-white border border-slate-200 rounded-lg text-xs px-2.5 py-1.5">
              <option value="all">Todos ({leads.length}) • Ouro+Prata+Com site</option>
              <option value="none">Ouro — Sem site ({stats.semSite})</option>
              <option value="social_only">Prata — Só Instagram ({leads.filter((l)=>l.websiteStatus==='social_only').length})</option>
              <option value="has_website">Com site ({stats.comSite})</option>
            </select>
          </div>
        </div>
        {/* Filtros avançados tabela */}
        {viewMode !== 'raw' && (
          <div className="mt-4 bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-end gap-3 text-xs">
            <div className="flex-1 min-w-[140px]">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Cidade</label>
              <input value={cityFilter} onChange={(e)=>setCityFilter(e.target.value)} placeholder="Filtrar cidade" className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs" />
            </div>
            <div className="min-w-[110px]">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Estado</label>
              <select value={stateFilter} onChange={(e)=>setStateFilter(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <option value="all">Todos estados</option>
                {uniqueStates.map((st)=><option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Categoria</label>
              <select value={categoryFilter} onChange={(e)=>setCategoryFilter(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <option value="all">Todas categorias</option>
                {uniqueCategories.map((c)=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Ordenar por</label>
              <div className="flex gap-1">
                <select value={sortField} onChange={(e)=>setSortField(e.target.value as any)} className="flex-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <option value="score">Score</option>
                  <option value="city">Cidade</option>
                  <option value="state">Estado</option>
                  <option value="category">Categoria</option>
                  <option value="rating">Avaliação</option>
                  <option value="name">Nome</option>
                </select>
                <button onClick={()=>setSortDir((d)=>d==='asc'?'desc':'asc')} className="px-2 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold" title={sortDir==='asc'?'Crescente':'Decrescente'}>{sortDir==='asc'?'↑':'↓'}</button>
              </div>
            </div>
            <div className="text-[11px] text-slate-500">
              Exibindo <strong>{filtered.length}</strong> de <strong>{leads.length}</strong>
              {(cityFilter || stateFilter!=='all' || categoryFilter!=='all' || filterStatus!=='all') && <button onClick={()=>{setCityFilter('');setStateFilter('all');setCategoryFilter('all');setFilterStatus('all');}} className="ml-2 text-indigo-600 hover:underline font-bold">Limpar filtros</button>}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 lg:px-8 pb-12">
        {viewMode === 'raw' ? (
          <SerpApiRawViewer raw={raw} meta={meta} />
        ) : viewMode === 'table' ? (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 text-left">#</th>
                    <th className="px-3 py-2.5 text-left cursor-pointer hover:text-indigo-600" onClick={()=>handleSort('name')}>Empresa {sortField==='name' && (sortDir==='asc'?'↑':'↓')}</th>
                    <th className="px-3 py-2.5 text-left cursor-pointer hover:text-indigo-600" onClick={()=>handleSort('category')}>Categoria {sortField==='category' && (sortDir==='asc'?'↑':'↓')}</th>
                    <th className="px-3 py-2.5 text-left">Endereço</th>
                    <th className="px-3 py-2.5 text-left">Telefone</th>
                    <th className="px-3 py-2.5 text-center cursor-pointer hover:text-indigo-600" onClick={()=>handleSort('rating')}>Avaliação {sortField==='rating' && (sortDir==='asc'?'↑':'↓')}</th>
                    <th className="px-3 py-2.5 text-center">Site</th>
                    <th className="px-3 py-2.5 text-center cursor-pointer hover:text-indigo-600" onClick={()=>handleSort('score')}>Score {sortField==='score' && (sortDir==='asc'?'↑':'↓')}</th>
                    <th className="px-3 py-2.5 text-center">Ticket sugerido</th>
                    <th className="px-3 py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((lead, idx) => {
                    const alreadySaved = Boolean(lead.isAlreadySaved || savedLeadIds.has(lead.id));
                    return (
                    <tr key={lead.id} className={`hover:bg-slate-50 ${alreadySaved ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-3 py-2.5 text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1">
                          {lead.name}
                          {alreadySaved && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold">Já cadastrada</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {lead.city} • {lead.state}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-700">{lead.category}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[220px] truncate" title={lead.address}>{lead.address}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-700">{lead.phone || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 text-xs font-bold">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {lead.rating ?? '—'}
                          <span className="text-[11px] text-slate-400">({lead.reviewsCount ?? 0})</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {lead.websiteUrl ? (
                          <a href={lead.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-xs">
                            <Globe className="w-3 h-3" /> Link
                          </a>
                        ) : lead.websiteStatus === 'none' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px] font-bold"><Award className="w-3 h-3" /> Ouro</span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${lead.opportunityLevel === 'high' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : lead.opportunityLevel === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          <TrendingUp className="w-3 h-3" /> {lead.opportunityScore}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {lead.suggestedTicket ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                            lead.marketTier === 'A' ? 'bg-violet-50 text-violet-700 border-violet-200'
                            : lead.marketTier === 'B' ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`} title={`Ticket sugerido — cidade tier ${lead.marketTier || '?'}`}>
                            <Banknote className="w-3 h-3" /> R$ {lead.suggestedTicket.toLocaleString('pt-BR')}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => onAnalyze(lead)} className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg" title="Analisar com IA">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => !alreadySaved && onToggleSave(lead)}
                            disabled={alreadySaved}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold ${alreadySaved ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed opacity-80' : savedLeadIds.has(lead.id) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                            title={alreadySaved ? 'Esta empresa já está no CRM' : 'Salvar no CRM'}
                          >
                            {savedLeadIds.has(lead.id) ? 'Salvo' : alreadySaved ? 'Já no CRM' : 'Salvar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                    })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">Nenhuma empresa com esse filtro.</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((lead) => {
              const alreadySavedCard = Boolean(lead.isAlreadySaved || savedLeadIds.has(lead.id));
              return (
              <div key={lead.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate">{lead.category || 'Categoria não informada'}</div>
                    <h4 className="font-bold text-slate-900 text-sm leading-tight truncate">{lead.name}</h4>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border ${lead.websiteStatus === 'none' ? 'bg-amber-50 text-amber-700 border-amber-200' : lead.websiteStatus === 'has_website' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600'}`}>
                    {lead.websiteStatus === 'none' ? 'Sem site' : lead.websiteStatus === 'has_website' ? 'Com site' : 'Social'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {lead.address} • {lead.city} ({lead.state || 'UF'})</p>
                <p className="text-xs text-slate-600 mt-2 flex items-center gap-1"><Phone className="w-3 h-3" /> {lead.phone || 'Sem telefone'} • <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {lead.rating} ({lead.reviewsCount})</p>
                {lead.suggestedTicket ? (
                  <div className="mt-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                      lead.marketTier === 'A' ? 'bg-violet-50 text-violet-700 border-violet-200'
                      : lead.marketTier === 'B' ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`} title={`Ticket sugerido — cidade tier ${lead.marketTier || '?'}`}>
                      <Banknote className="w-3 h-3" /> Ticket sugerido: R$ {lead.suggestedTicket.toLocaleString('pt-BR')}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => onAnalyze(lead)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1.5 rounded-lg">Analisar</button>
                  {alreadySavedCard ? (
                    <span className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-center cursor-not-allowed opacity-80">Já no CRM</span>
                  ) : (
                    <button onClick={() => onToggleSave(lead)} className={`flex-1 text-xs font-bold py-1.5 rounded-lg border ${savedLeadIds.has(lead.id) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-700 border-slate-200'}`}>
                      {savedLeadIds.has(lead.id) ? 'Salvo' : 'Salvar no CRM'}
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {viewMode !== 'raw' && (
          <div className="mt-6">
            <SerpApiRawViewer raw={raw} meta={meta} />
          </div>
        )}
      </div>
    </div>
  );
};