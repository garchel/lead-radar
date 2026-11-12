import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Check, Send, Loader2, AlertCircle } from 'lucide-react';

interface OnboardingItem {
  key: string;
  label: string;
  status: 'ok' | 'falta';
  pedido: string;
}

interface OnboardingState {
  items: OnboardingItem[];
  prontos: number;
  total: number;
  percentual: number;
  mensagem: string;
}

/**
 * Checklist do que o cliente já mandou para a página sair do papel.
 *
 * Existe porque o gargalo da entrega não é o código: é o material do cliente.
 * Sem isso, o projeto fica parado em "briefing" e ninguém sabe o que cobrar.
 */
export const ProjectOnboardingPanel: React.FC<{ projectId: string; refreshKey?: string }> = ({ projectId, refreshKey }) => {
  const [estado, setEstado] = useState<OnboardingState | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/onboarding`);
      const data = await res.json();
      if (!res.ok || data?.success === false) throw new Error(data?.error || 'Falha ao carregar o checklist.');
      setEstado(data.onboarding as OnboardingState);
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar o checklist.');
    } finally {
      setCarregando(false);
    }
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar, refreshKey]);

  const pedirMaterial = async () => {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/onboarding/send`, { method: 'POST' });
      const data = await res.json();
      if (data?.success) setAviso('Pedido enviado no WhatsApp.');
      else setAviso(data?.detail || data?.error || 'Nada foi enviado.');
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar o pedido.');
    } finally {
      setEnviando(false);
    }
  };

  const faltando = estado ? estado.total - estado.prontos : 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
          title={aberto ? 'Recolher checklist' : 'Expandir checklist'}
        >
          <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shrink-0">
            <ClipboardList className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">Material do cliente</span>
            <span className="block text-[11px] text-slate-500 truncate">
              {!estado
                ? carregando
                  ? 'verificando…'
                  : 'sem dados'
                : faltando
                  ? `${faltando} pendência${faltando > 1 ? 's' : ''} para começar`
                  : 'tudo recebido'}
            </span>
          </span>
        </button>

        <span className="hidden sm:inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-[11px] font-bold">
            {estado ? `${estado.percentual}%` : '—'}
          </span>
        </span>

        <button
          type="button"
          onClick={() => void pedirMaterial()}
          disabled={enviando || !estado || faltando === 0}
          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
          title="Enviar ao cliente o pedido do que falta, pelo WhatsApp"
        >
          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Pedir material
        </button>
      </div>

      {aberto && estado && (
        <div className="border-t border-slate-200 bg-white px-3.5 py-3 space-y-1.5">
          {estado.items.map((item) => (
            <div key={item.key} className="flex items-start gap-2 text-[12px]">
              <span
                className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  item.status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {item.status === 'ok' ? <Check className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
              </span>
              <span className={item.status === 'ok' ? 'text-slate-500 line-through' : 'text-slate-700'}>{item.label}</span>
            </div>
          ))}
          {aviso && <p className="pt-1 text-[11px] text-emerald-700">{aviso}</p>}
          {erro && <p className="pt-1 text-[11px] text-rose-700">{erro}</p>}
        </div>
      )}
    </div>
  );
};
