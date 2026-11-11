import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { canInstall, initPwaInstall, promptInstall, subscribeInstallChange } from '../utils/pwa';

/** De quanto em quanto tempo o app pergunta ao servidor se há versão nova. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Aviso de versão nova.
 *
 * O service worker é gerado com `registerType: 'prompt'`, então a versão nova
 * fica em `waiting` até o usuário aceitar — o app nunca troca de código sozinho
 * no meio de um envio. A checagem roda ao abrir, a cada 5 minutos e sempre que
 * a aba volta a ficar visível.
 */
export const PwaUpdateToast: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
  } = useRegisterSW({
    onRegisteredSW(_swUrl: string, registration?: ServiceWorkerRegistration) {
      if (!registration) return;

      const checkForUpdate = () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return;
        registration.update().catch(() => {
          /* offline ou servidor fora: tenta de novo no próximo ciclo */
        });
      };

      checkForUpdate();
      window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
    },
    onRegisterError(error: unknown) {
      console.warn('[pwa] falha ao registrar o service worker', error);
    },
  });

  /**
   * Aplica a versão nova.
   *
   * Não usamos o reload do workbox: ele dispara logo depois de pedir o
   * SKIP_WAITING e a recarga chega antes do SW novo assumir — a página voltava
   * com o código antigo (aconteceu no teste de ponta a ponta). Aqui esperamos o
   * `controllerchange`, que é o sinal de que a versão nova já controla a aba.
   */
  const applyUpdate = async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const waiting = registration?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    let reloaded = false;
    const reload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // rede de segurança: se o evento não vier, não deixa o usuário preso
    window.setTimeout(reload, 4000);
  };

  // "pronto para usar offline" não precisa de ação: some sozinho.
  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), 6000);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  if (needRefresh) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[60] w-[min(92vw,26rem)] bg-white border border-indigo-200 rounded-2xl shadow-xl p-4"
      >
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
            <RefreshCw className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">Versão nova pronta</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Uma atualização do LeadFinder foi baixada. Recarregue para usá-la — o que você está vendo continua funcionando até lá.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => void applyUpdate()}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-8 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
              >
                <Download className="w-3.5 h-3.5" /> Atualizar agora
              </button>
              <button
                type="button"
                onClick={() => setNeedRefresh(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Depois
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            aria-label="Dispensar aviso de atualização"
            className="text-slate-400 hover:text-slate-700 p-1 -m-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold rounded-xl px-3 py-2 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-emerald-400" />
      Pronto para abrir sem internet
      <button
        type="button"
        onClick={() => setOfflineReady(false)}
        aria-label="Dispensar aviso offline"
        className="text-slate-400 hover:text-white"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/**
 * Botão "Instalar app" para o rodapé da sidebar.
 * Só aparece quando o navegador realmente permite instalar (Chrome/Edge/Android)
 * e o app ainda não está rodando instalado.
 */
export const PwaInstallButton: React.FC = () => {
  const [available, setAvailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    initPwaInstall();
    return subscribeInstallChange(setAvailable);
  }, []);

  if (!available && !notice) return null;

  const handleClick = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      setNotice('Instalado — procure o LeadFinder no menu iniciar.');
      window.setTimeout(() => setNotice(null), 6000);
      setAvailable(false);
      return;
    }
    if (outcome === 'unavailable' && !canInstall()) {
      setNotice('Seu navegador não ofereceu a instalação. No Chrome: menu → “Instalar LeadFinder”.');
      window.setTimeout(() => setNotice(null), 8000);
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void handleClick()}
        className="w-full flex items-center space-x-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-sm font-semibold px-3 py-2 rounded-lg transition-all"
        title="Instalar o LeadFinder como aplicativo neste computador/celular"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left text-xs">Instalar app</span>
      </button>
      {notice && <p className="text-[11px] text-slate-400 leading-snug px-1">{notice}</p>}
    </div>
  );
};

export default PwaUpdateToast;
