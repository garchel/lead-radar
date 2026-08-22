import React, { useState, useEffect, useCallback } from 'react';
import { Briefcase, RefreshCw, Plus, Save, X, Power } from 'lucide-react';

interface BusinessCategory {
  id: string;
  name: string;
  propensity: number;
  baseTicket: number;
  isActive: boolean;
}

/** Cor pela faixa de propensão. */
const propColor = (p: number) =>
  p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-lime-500' : p >= 40 ? 'bg-amber-500' : 'bg-slate-400';

export const CategoriesDashboard: React.FC = () => {
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newProp, setNewProp] = useState(60);
  const [newTicket, setNewTicket] = useState(2000);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // rascunhos de edição por id
  const [drafts, setDrafts] = useState<Record<string, { propensity: number; baseTicket: number }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/categories').then((r) => r.json());
      if (res.success) setCategories(res.categories);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchDraft = (id: string, patch: Partial<{ propensity: number; baseTicket: number }>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        propensity: patch.propensity ?? prev[id]?.propensity ?? categories.find((c) => c.id === id)?.propensity ?? 50,
        baseTicket: patch.baseTicket ?? prev[id]?.baseTicket ?? categories.find((c) => c.id === id)?.baseTicket ?? 2000,
      },
    }));
  };

  const saveCategory = async (cat: BusinessCategory) => {
    const draft = drafts[cat.id];
    setSavingId(cat.id);
    setError(null);
    try {
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propensity: draft?.propensity ?? cat.propensity,
          baseTicket: draft?.baseTicket ?? cat.baseTicket,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error || 'Falha ao salvar.');
      await load();
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[cat.id];
        return next;
      });
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar categoria.');
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (cat: BusinessCategory) => {
    setSavingId(cat.id);
    try {
      await fetch(`/api/categories/${cat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cat.isActive }),
      });
      await load();
    } finally {
      setSavingId(null);
    }
  };

  const createCategory = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), propensity: newProp, baseTicket: newTicket }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error || 'Falha ao criar.');
      setNewName('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar categoria.');
    } finally {
      setCreating(false);
    }
  };

  const dirty = (id: string) => Boolean(drafts[id]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-100 border-b border-slate-200/80 py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-6 h-6 text-indigo-600" /> Categorias de Negócio
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">propensão × ticket</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Propensão = chance da categoria precisar de landing page (afeta o score do lead e o filtro <code>minPropensity</code>). Ticket base = valor do projeto antes do multiplicador do tier da cidade.
            </p>
          </div>
          <button onClick={load} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 pb-12 space-y-6">
        {/* Nova categoria */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Nova categoria</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex.: Dentista Infantil"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-300"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Propensão: {newProp}</label>
              <input type="range" min={0} max={100} value={newProp} onChange={(e) => setNewProp(Number(e.target.value))} className="w-36" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Ticket base (R$)</label>
              <input
                type="number"
                min={0}
                step={100}
                value={newTicket}
                onChange={(e) => setNewTicket(Number(e.target.value))}
                className="w-32 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={createCategory}
              disabled={creating || !newName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Criar
            </button>
          </div>
          {error && <p className="mt-2 text-xs font-bold text-red-600">{error}</p>}
        </div>

        {/* Lista */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 text-left">Categoria</th>
                <th className="px-4 py-2.5 text-center w-64">Propensão</th>
                <th className="px-4 py-2.5 text-center">Ticket base</th>
                <th className="px-4 py-2.5 text-center">Ativa</th>
                <th className="px-4 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Carregando...</td></tr>
              )}
              {!loading && categories.map((cat) => {
                const draft = drafts[cat.id];
                const prop = draft?.propensity ?? cat.propensity;
                const ticket = draft?.baseTicket ?? cat.baseTicket;
                return (
                  <tr key={cat.id} className={`hover:bg-slate-50 ${!cat.isActive ? 'opacity-50' : ''} ${dirty(cat.id) ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-2.5 font-bold text-slate-900 text-xs">{cat.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 justify-center">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={prop}
                          onChange={(e) => patchDraft(cat.id, { propensity: Number(e.target.value) })}
                          className="flex-1"
                        />
                        <span className={`inline-flex items-center justify-center w-9 h-6 rounded text-[11px] font-bold text-white ${propColor(prop)}`}>{prop}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={ticket}
                        onChange={(e) => patchDraft(cat.id, { baseTicket: Number(e.target.value) })}
                        className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input type="checkbox" checked={cat.isActive} onChange={() => toggleActive(cat)} disabled={savingId === cat.id} className="rounded cursor-pointer" />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {dirty(cat.id) ? (
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => saveCategory(cat)} disabled={savingId === cat.id} className="px-2 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1">
                            <Save className="w-3 h-3" /> Salvar
                          </button>
                          <button onClick={() => setDrafts((prev) => { const n = { ...prev }; delete n[cat.id]; return n; })} className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600" title="Descartar">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 flex items-center justify-center gap-1"><Power className="w-3 h-3" /> sem mudanças</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
