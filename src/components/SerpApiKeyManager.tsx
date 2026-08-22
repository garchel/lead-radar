import React, { useEffect, useState } from 'react';
import { X, Key, Plus, Trash2, Check, Star, Clock, Calendar, AlertTriangle } from 'lucide-react';

interface SerpKeyInfo {
  id: string;
  label: string | null;
  maskedKey: string;
  isActive: boolean;
  monthKey: string;
  renewalDay: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  usedThisHour: number;
  remainingThisHour: number;
  hourWindowStart: string | null;
  nextMonthlyReset: string;
  nextHourlyReset: string | null;
  createdAt: string;
}

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export const SerpApiKeyManager: React.FC<Props> = ({ onClose, onChanged }) => {
  const [keys, setKeys] = useState<SerpKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newRenewalDay, setNewRenewalDay] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRenewalDay, setEditRenewalDay] = useState('');

  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/serpapi/keys');
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao listar chaves');
      setKeys(d.keys || []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar chaves');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchKeys();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = { apiKey: newKey.trim(), label: newLabel.trim() || undefined };
      const day = newRenewalDay.trim() ? Number(newRenewalDay.trim()) : undefined;
      if (day != null && Number.isFinite(day)) payload.renewalDay = day;
      const r = await fetch('/api/serpapi/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao adicionar');
      setNewKey('');
      setNewLabel('');
      setNewRenewalDay('');
      await fetchKeys();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Falha ao adicionar');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRenewal = async (id: string) => {
    const day = editRenewalDay.trim() ? Number(editRenewalDay.trim()) : NaN;
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      setError('Informe um dia entre 1 e 31.');
      return;
    }
    setError(null);
    try {
      const r = await fetch(`/api/serpapi/keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renewalDay: day }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao atualizar renovação');
      setEditingId(null);
      setEditRenewalDay('');
      await fetchKeys();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Falha ao atualizar');
    }
  };

  const handleActivate = async (id: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/serpapi/keys/${id}/activate`, { method: 'POST' });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao ativar');
      await fetchKeys();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Falha ao ativar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover esta chave? As buscas com ela não funcionarão mais.')) return;
    setError(null);
    try {
      const r = await fetch(`/api/serpapi/keys/${id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Falha ao remover');
      await fetchKeys();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'Falha ao remover');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-bold text-slate-900">Gerenciar chaves SerpAPI</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-800">
            <p className="font-bold">Free: 250 buscas/mês, 50/hora por chave</p>
            <p className="text-indigo-700 mt-1">Apenas sucesso conta. Cache (1h) e erros não consomem. Renova mensal no <strong>dia da criação da chave</strong> (ou data que você definir abaixo) e janela horária em 1h. Cadastre várias chaves para alternar quando uma esgotar — o app rotaciona automaticamente.</p>
            <p className="mt-1">Gere chaves em <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noreferrer" className="underline font-bold">serpapi.com/manage-api-key</a> (sem cartão).</p>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleAdd} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Adicionar nova chave</p>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">API Key SerpAPI *</label>
              <input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Cole a chave completa"
                className="w-full bg-white border border-slate-300 rounded-lg text-slate-800 text-xs p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Rótulo (opcional)</label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ex: Conta pessoal"
                  className="w-full bg-white border border-slate-300 rounded-lg text-slate-800 text-xs p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Dia da renovação (1-31)</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={newRenewalDay}
                  onChange={(e) => setNewRenewalDay(e.target.value)}
                  placeholder="Ex: 15"
                  className="w-full bg-white border border-slate-300 rounded-lg text-slate-800 text-xs p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">Dia do mês que renova (padrão: hoje). O app detecta a próxima ocorrência automaticamente.</p>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !newKey.trim()}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg text-xs"
            >
              <Plus className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Adicionar chave'}
            </button>
          </form>

          {loading ? (
            <p className="text-xs text-slate-500">Carregando chaves...</p>
          ) : keys.length === 0 ? (
            <p className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 text-center">
              Nenhuma chave cadastrada. Adicione uma acima ou defina <code className="bg-white px-1 rounded border">SERPAPI_API_KEY</code> no .env.
            </p>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className={`border rounded-xl p-4 ${k.isActive ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-800">{k.maskedKey}</span>
                        {k.isActive && (
                          <span className="inline-flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <Star className="w-3 h-3 fill-white" /> Ativa
                          </span>
                        )}
                        {k.label && <span className="text-xs text-slate-600">— {k.label}</span>}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="flex items-center gap-1 text-slate-500 font-semibold"><Calendar className="w-3 h-3" /> Mês {k.monthKey}</div>
                          <div className="text-slate-700 font-bold">{k.usedThisMonth}/250 — {k.remainingThisMonth} restantes</div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 mt-1">
                            <div className={`h-full ${k.remainingThisMonth < 20 ? 'bg-amber-500' : 'bg-indigo-600'}`} style={{ width: `${Math.min(100, (k.usedThisMonth / 250) * 100)}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 text-slate-500 font-semibold"><Clock className="w-3 h-3" /> Hora</div>
                          <div className="text-slate-700 font-bold">{k.usedThisHour}/50 — {k.remainingThisHour} restantes</div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200 mt-1">
                            <div className={`h-full ${k.remainingThisHour < 5 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (k.usedThisHour / 50) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        Renova mês: {new Date(k.nextMonthlyReset).toLocaleDateString('pt-BR')} (dia {k.renewalDay}) • Hora: {k.nextHourlyReset ? new Date(k.nextHourlyReset).toLocaleTimeString('pt-BR') : '—'}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {editingId === k.id ? (
                          <>
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={editRenewalDay}
                              onChange={(e) => setEditRenewalDay(e.target.value)}
                              placeholder="Dia 1-31"
                              className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white w-24"
                            />
                            <button onClick={() => handleSaveRenewal(k.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-2.5 py-1 rounded-lg text-xs">
                              Salvar
                            </button>
                            <button onClick={() => { setEditingId(null); setEditRenewalDay(''); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1 rounded-lg text-xs">
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button onClick={() => { setEditingId(k.id); setEditRenewalDay(String(k.renewalDay)); }} className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-200 bg-white font-semibold px-2.5 py-1 rounded-lg text-xs">
                            Alterar dia ({k.renewalDay})
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {!k.isActive && (
                        <button onClick={() => handleActivate(k.id)} className="inline-flex items-center gap-1 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 font-semibold px-3 py-1.5 rounded-lg text-xs">
                          <Check className="w-3.5 h-3.5" /> Ativar
                        </button>
                      )}
                      <button onClick={() => handleDelete(k.id)} className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-semibold px-3 py-1.5 rounded-lg text-xs">
                        <Trash2 className="w-3.5 h-3.5" /> Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};