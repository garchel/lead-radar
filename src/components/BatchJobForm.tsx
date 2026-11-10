import React, { useEffect, useState } from 'react';
import { Play, RefreshCw, MapPin, Layers, Radar } from 'lucide-react';

/**
 * Único formulário de prospecção em LOTE do app.
 *
 * Antes existiam três portas para a mesma coisa (Busca síncrona, modal "Fila
 * Assíncrona" com cidades digitadas à mão e Agendamentos). Aqui o padrão é a
 * rotação de cidades da base IBGE — que é o que o autopilot usa — e o modo manual
 * fica para quando você quer uma cidade específica.
 */

interface Category {
  id: string;
  name: string;
}

interface Props {
  onCreated?: () => void;
}

export const BatchJobForm: React.FC<Props> = ({ onCreated }) => {
  const [mode, setMode] = useState<'rotation' | 'manual'>('rotation');
  const [citiesInput, setCitiesInput] = useState('');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [useRotation, setUseRotation] = useState(true);
  const [citiesPerRun, setCitiesPerRun] = useState(3);
  const [minPopulation, setMinPopulation] = useState(30000);
  const [maxPopulation, setMaxPopulation] = useState(200000);
  const [filterNoWebsite, setFilterNoWebsite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/categories');
        const data = await res.json();
        const list = Array.isArray(data?.categories) ? data.categories : [];
        setCategories(list.filter((c: any) => c.isActive !== false));
      } catch { /* o select fica vazio; o backend valida */ }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);

    const locations = citiesInput.split(',').map((c) => c.trim()).filter(Boolean);
    if (mode === 'manual' && (locations.length === 0 || !state || !category)) {
      setError('No modo manual, informe cidade(s), UF e categoria.');
      return;
    }
    if (mode === 'rotation' && maxPopulation <= minPopulation) {
      setError('Faixa populacional inválida: o máximo precisa ser maior que o mínimo.');
      return;
    }
    if (!category) {
      setError('Escolha a categoria comercial.');
      return;
    }

    setSaving(true);
    try {
      const payload: any =
        mode === 'rotation'
          ? {
              useCityRotation: true,
              citiesPerRun,
              uf: state || undefined,
              minPopulation,
              maxPopulation,
              locations: [],
              state: state || undefined,
              categories: [category],
              filterNoWebsiteOnly: filterNoWebsite,
            }
          : {
              locations,
              state,
              categories: [category],
              filterNoWebsiteOnly: filterNoWebsite,
            };

      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'batch_prospecting',
          title:
            mode === 'rotation'
              ? `Rotação IBGE: ${citiesPerRun} cidade(s) · ${category}`
              : `Prospecção: ${locations.join(', ')} · ${category}`,
          payload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || `Falha ao enfileirar (HTTP ${res.status}).`);
      setMsg('Tarefa enfileirada — acompanhe o progresso na lista acima.');
      setCitiesInput('');
      onCreated?.();
    } catch (err: any) {
      setError(err?.message || 'Falha ao enfileirar a tarefa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-bold text-slate-800">Nova tarefa em lote</span>
        </div>
        <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => { setMode('rotation'); setUseRotation(true); }}
            className={`px-3 py-1 rounded-lg font-bold ${mode === 'rotation' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
          >
            Rotação IBGE
          </button>
          <button
            type="button"
            onClick={() => { setMode('manual'); setUseRotation(false); }}
            className={`px-3 py-1 rounded-lg font-bold ${mode === 'manual' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
          >
            Cidades específicas
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {mode === 'rotation'
          ? 'Pega as próximas cidades da fila (as que estão há mais tempo sem busca) e roda em segundo plano, sem travar a tela.'
          : 'Busca exatamente as cidades que você digitar, uma categoria por vez.'}
      </p>

      {mode === 'manual' && (
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-indigo-600" /> Cidades (separadas por vírgula)
          </label>
          <input
            type="text"
            value={citiesInput}
            onChange={(e) => setCitiesInput(e.target.value)}
            placeholder="Ex: Campinas, Sorocaba, Jundiaí"
            className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white"
          />
        </div>
      )}

      {mode === 'rotation' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="text-xs font-bold text-slate-700">
            Cidades por rodada
            <input
              type="number" min={1} max={20} value={citiesPerRun}
              onChange={(e) => setCitiesPerRun(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-full mt-1 text-xs p-2 border border-slate-300 rounded-lg bg-white font-normal"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            População mín.
            <input
              type="number" min={0} step={5000} value={minPopulation}
              onChange={(e) => setMinPopulation(Number(e.target.value) || 0)}
              className="w-full mt-1 text-xs p-2 border border-slate-300 rounded-lg bg-white font-normal"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            População máx.
            <input
              type="number" min={0} step={5000} value={maxPopulation}
              onChange={(e) => setMaxPopulation(Number(e.target.value) || 0)}
              className="w-full mt-1 text-xs p-2 border border-slate-300 rounded-lg bg-white font-normal"
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-slate-700">
          UF {mode === 'rotation' ? '(opcional — vazio = todas)' : ''}
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="w-full mt-1 text-xs p-2 border border-slate-300 rounded-lg bg-white font-normal"
            required={mode === 'manual'}
          >
            <option value="">{mode === 'rotation' ? 'Todas as UFs' : 'Selecione o estado'}</option>
            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1"><Layers className="w-3.5 h-3.5 text-orange-600" /> Categoria</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full mt-1 text-xs p-2 border border-slate-300 rounded-lg bg-white font-normal"
            required
          >
            <option value="">Selecione a categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-700 font-medium">
        <input
          type="checkbox"
          checked={filterNoWebsite}
          onChange={(e) => setFilterNoWebsite(e.target.checked)}
          className="w-4 h-4 rounded"
        />
        Só empresas sem site próprio (Ouro/Prata)
      </label>

      {error && <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}
      {msg && <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{msg}</div>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          Enfileirar tarefa
        </button>
      </div>
    </form>
  );
};
