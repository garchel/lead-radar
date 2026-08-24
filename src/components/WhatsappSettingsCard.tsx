import React, { useState, useEffect, useCallback } from 'react';
import { MessageCircle, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface WhatsappStatus {
  savedChoice: 'auto' | 'evolution' | 'meta' | 'legacy';
  activeProvider: string | null;
  reason: string;
  available: { evolution: boolean; meta: boolean; legacy: boolean };
}

const OPTIONS: Array<{ value: WhatsappStatus['savedChoice']; label: string; desc: string }> = [
  { value: 'auto', label: 'Automático', desc: 'Usa o primeiro backend configurado (Evolution → Meta → legado)' },
  { value: 'evolution', label: 'Evolution API', desc: 'Self-hosted e gratuito (WhatsApp Web não-oficial)' },
  { value: 'meta', label: 'Meta Cloud API', desc: 'Oficial da Meta — 1.000 conversas/mês grátis' },
  { value: 'legacy', label: 'Webhook genérico', desc: 'Z-API, n8n ou outro endpoint compatível' },
];

export const WhatsappSettingsCard: React.FC = () => {
  const [status, setStatus] = useState<WhatsappStatus | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      setStatus(json);
      setError('');
    } catch (err: any) {
      setError(`Erro ao carregar status do WhatsApp: ${err?.message || 'falha desconhecida'}`);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const selectProvider = async (provider: string) => {
    setSaving(provider);
    setError('');
    try {
      const res = await fetch('/api/whatsapp/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || `HTTP ${res.status}`);
      await fetchStatus();
    } catch (err: any) {
      setError(`Erro ao salvar backend: ${err?.message || 'falha desconhecida'}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
        <h2 className="font-bold text-slate-900 flex items-center space-x-2">
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          <span>Conexão WhatsApp</span>
        </h2>
        <button onClick={() => void fetchStatus()} className="text-xs font-medium text-slate-500 hover:text-indigo-600 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {error && <div role="alert" className="px-5 py-3 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">{error}</div>}

      {status && (
        <div className="px-5 py-3 text-xs bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          {status.activeProvider ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                Ativo: <strong>{OPTIONS.find((o) => o.value === status.activeProvider)?.label || status.activeProvider}</strong> — {status.reason}
              </span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>Nenhum backend ativo. Configure as credenciais no .env e reinicie o servidor.</span>
            </>
          )}
        </div>
      )}

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {OPTIONS.map((opt) => {
          const configured =
            opt.value === 'auto' ||
            (opt.value === 'evolution' && status?.available.evolution) ||
            (opt.value === 'meta' && status?.available.meta) ||
            (opt.value === 'legacy' && status?.available.legacy);
          const selected = status?.savedChoice === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => void selectProvider(opt.value)}
              disabled={saving !== null || !configured}
              title={!configured ? 'Credenciais não configuradas no .env' : ''}
              className={`text-left p-3 rounded-xl border transition-all ${
                selected
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                  : configured
                    ? 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    : 'border-slate-100 opacity-40 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">{opt.label}</span>
                {selected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
              {!configured && opt.value !== 'auto' && (
                <p className="text-[10px] text-amber-600 mt-1">⚠ Não configurado no .env</p>
              )}
            </button>
          );
        })}
      </div>

      <p className="px-5 pb-4 text-[11px] text-slate-400">
        A escolha fica salva no banco e vale imediatamente (sem reiniciar). As credenciais de cada backend
        continuam no arquivo .env — veja docs/EVOLUTION-API.md.
      </p>
    </div>
  );
};
