import React, { useState, useEffect, useCallback } from 'react';
import { CalendarClock, Plus, Trash2, ToggleLeft, ToggleRight, CalendarDays, Loader2 } from 'lucide-react';

interface Schedule {
  id: string;
  name: string;
  cron: string;
  jobType: 'mcp_autopilot' | 'batch_prospecting' | 'follow_up_reminder';
  payload: any;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
}

type ScheduleJobType = Schedule['jobType'];

const CATEGORIES = [
  'Todas as Categorias',
  'Dentista / Clínica Odontológica',
  'Oficina Mecânica & Estética Automotiva',
  'Clínica de Estética & Salão de Beleza',
  'Academia & Studio de Personal',
  'Restaurante, Hamburgueria & Gastronomia',
  'Advocacia & Serviços Jurídicos',
  'Pet Shop & Clínica Veterinária',
];

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

export const ScheduleManager: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [cron, setCron] = useState('');
  const [jobType, setJobType] = useState<ScheduleJobType>('mcp_autopilot');
  const [location, setLocation] = useState('');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('');
  // Rotação de cidades (batch_prospecting)
  const [useCityRotation, setUseCityRotation] = useState(false);
  const [citiesPerRun, setCitiesPerRun] = useState(3);
  const [rotUf, setRotUf] = useState('');
  const [minPopulation, setMinPopulation] = useState(30000);
  const [maxPopulation, setMaxPopulation] = useState(200000);
  const [minPropensity, setMinPropensity] = useState(0);

  const fetchSchedules = useCallback(async () => {
    try {
      const response = await fetch('/api/schedules');
      const res = await response.json().catch(() => ({}));
      if (!response.ok || !res?.success) {
        throw new Error(res?.error || `Falha ao consultar agendamentos (HTTP ${response.status}).`);
      }
      if (!Array.isArray(res.schedules)) {
        throw new Error('A API retornou uma lista de agendamentos inválida.');
      }
      setSchedules(res.schedules);
      setError('');
    } catch (err: any) {
      setError(`Erro ao carregar agendamentos: ${err?.message || 'falha desconhecida'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const toggleEnabled = async (s: Schedule) => {
    setError('');
    try {
      const response = await fetch(`/api/schedules/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      const res = await response.json().catch(() => ({}));
      if (!response.ok || !res?.success) {
        throw new Error(res?.error || `Falha ao atualizar agendamento (HTTP ${response.status}).`);
      }
      await fetchSchedules();
    } catch (err: any) {
      setError(`Erro ao atualizar agendamento: ${err?.message || 'falha desconhecida'}`);
    }
  };

  const remove = async (id: string) => {
    setError('');
    try {
      const response = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      const res = await response.json().catch(() => ({}));
      if (!response.ok || !res?.success) {
        throw new Error(res?.error || `Falha ao remover agendamento (HTTP ${response.status}).`);
      }
      await fetchSchedules();
    } catch (err: any) {
      setError(`Erro ao remover agendamento: ${err?.message || 'falha desconhecida'}`);
    }
  };

  const create = async () => {
    setError('');
    if (!name.trim() || !cron.trim()) {
      setError('Informe nome e expressão cron.');
      return;
    }
    if (jobType !== 'follow_up_reminder' && !useCityRotation && (!location.trim() || !state.trim() || !category)) {
      setError('Informe cidade, UF e categoria (ou ative a rotação de cidades).');
      return;
    }
    setSaving(true);
    try {
      const payload =
        jobType === 'batch_prospecting'
          ? useCityRotation
            ? {
                useCityRotation: true,
                citiesPerRun,
                uf: rotUf.trim().toUpperCase() || undefined,
                minPopulation,
                maxPopulation,
                minPropensity,
                locations: [],
                categories: [category || 'Todas as Categorias'],
                filterNoWebsiteOnly: true,
              }
            : { locations: [location.trim()], state: state.trim().toUpperCase(), categories: [category], filterNoWebsiteOnly: true, minPropensity, useCityRotation: false }
          : jobType === 'follow_up_reminder'
            ? {}
            : { location: location.trim(), state: state.trim().toUpperCase(), category, autoEnrich: true, sendPitches: false, maxLeads: 5 };

      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), cron: cron.trim(), jobType, payload }),
      });
      const res = await response.json().catch(() => ({}));

      if (!response.ok || !res?.success) {
        setError(res?.error || 'Falha ao criar agendamento.');
      } else {
        setName('');
        setCron('');
        setLocation('');
        setState('');
        setCategory('');
        setUseCityRotation(false);
        setShowForm(false);
        fetchSchedules();
      }
    } catch {
      setError('Erro de rede ao criar agendamento.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-bold text-slate-900 flex items-center space-x-2">
          <CalendarClock className="w-4 h-4 text-indigo-600" />
          <span>Agendamentos (Prospecção Periódica)</span>
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center space-x-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Novo</span>
        </button>
      </div>

      {error && !showForm && <div role="alert" className="px-5 py-3 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">{error}</div>}

      {showForm && (
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 space-y-3">
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome (ex: Autopilot Campinas)"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <input
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="Cron (ex: 0 9 * * 1-5)"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <select value={jobType} onChange={(e) => setJobType(e.target.value as ScheduleJobType)} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
              <option value="mcp_autopilot">Autopilot (busca → analisa → LP)</option>
              <option value="batch_prospecting">Batch (apenas prospecção)</option>
              <option value="follow_up_reminder">Recontatos autorizados (diário)</option>
            </select>
            {jobType !== 'follow_up_reminder' && (
              <>
                {!useCityRotation && (
                  <>
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Cidade"
                      className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="UF"
                      maxLength={2}
                      className="w-20 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                    />
                  </>
                )}
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white">
                  <option value="">Selecione uma categoria</option>
                  {CATEGORIES.filter((c) => c !== 'Todas as Categorias').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </>
            )}
            {jobType === 'follow_up_reminder' && (
              <span className="text-[11px] text-slate-500">Varre os recontatos com prazo vencido; o envio exige aprovação humana na tela de CRM.</span>
            )}
          </div>

          {/* Rotação de cidades (batch_prospecting) */}
          {jobType === 'batch_prospecting' && (
            <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useCityRotation} onChange={(e) => setUseCityRotation(e.target.checked)} className="rounded" />
                <span className="text-xs font-bold text-indigo-900">Rotacionar cidades automaticamente (round-robin IBGE)</span>
              </label>
              {useCityRotation ? (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Cidades/disparo</label>
                    <input type="number" min={1} max={20} value={citiesPerRun} onChange={(e) => setCitiesPerRun(Math.max(1, Math.min(20, Number(e.target.value))))} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">UF (opcional)</label>
                    <input value={rotUf} onChange={(e) => setRotUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="GO" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg uppercase" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Pop. mín</label>
                    <input type="number" min={0} step={5000} value={minPopulation} onChange={(e) => setMinPopulation(Number(e.target.value))} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Pop. máx</label>
                    <input type="number" min={0} step={10000} value={maxPopulation} onChange={(e) => setMaxPopulation(Number(e.target.value))} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Propensão mín: {minPropensity}</label>
                    <input type="range" min={0} max={100} step={5} value={minPropensity} onChange={(e) => setMinPropensity(Number(e.target.value))} className="w-full" />
                  </div>
                  <p className="text-[10px] text-slate-500 col-span-full">Cada disparo pega as cidades há mais tempo sem buscar. Faixa sugerida: 30 mil–200 mil hab.</p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">Sem rotação: busca sempre a mesma cidade fixa. Ative para varrer municípios da base IBGE automaticamente.</p>
              )}
            </div>
          )}
          <div className="flex items-center space-x-2">
            <button onClick={create} disabled={saving} className="flex items-center space-x-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Salvar</span>
            </button>
            <span className="text-[11px] text-slate-500">Limite de LPs/dia: 5 · Aprovação humana antes do deploy.</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-sm text-slate-500">Carregando agendamentos...</div>
      ) : schedules.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500">
          Nenhum agendamento. Crie um para rodar a prospecção periodicamente (cron).
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {schedules.map((s) => (
            <li key={s.id} className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-800 text-sm truncate">{s.name}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${s.enabled ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-slate-500 border-slate-200 bg-slate-100'}`}>
                    {s.enabled ? 'ativo' : 'pausado'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{s.jobType}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 flex items-center space-x-3 flex-wrap">
                  <span className="inline-flex items-center space-x-1"><CalendarDays className="w-3 h-3" /><span className="font-mono">{s.cron}</span></span>
                  <span>Próx: {fmt(s.nextRunAt)}</span>
                  <span>Últ: {fmt(s.lastRunAt)}</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button onClick={() => toggleEnabled(s)} className="flex items-center space-x-1 text-xs font-medium text-slate-600 hover:text-indigo-600 px-2 py-1 rounded-lg border border-slate-200 hover:border-indigo-300 transition-all" title={s.enabled ? 'Pausar' : 'Ativar'}>
                  {s.enabled ? <ToggleRight className="w-4 h-4 text-emerald-600" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                  <span>{s.enabled ? 'Pausar' : 'Ativar'}</span>
                </button>
                <button onClick={() => remove(s.id)} className="flex items-center space-x-1 text-xs font-medium text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg border border-rose-200 hover:bg-rose-50 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};