/**
 * Instalação do PWA: guarda o evento `beforeinstallprompt` para poder abrir o
 * diálogo nativo do navegador no momento em que o usuário clicar em "Instalar".
 *
 * O evento só existe no Chrome/Edge/Android e dispara uma vez, cedo — por isso
 * vive em módulo, e não em estado de componente.
 */

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<(available: boolean) => void>();

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as any)?.standalone === true;
  return Boolean(standalone || iosStandalone);
}

function notify() {
  const available = Boolean(deferredPrompt) && !installed && !isStandalone();
  for (const listener of listeners) listener(available);
}

/** Registra os eventos do navegador. Idempotente: chamar mais de uma vez não duplica. */
export function initPwaInstall(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__leadradarPwaInit) return;
  (window as any).__leadradarPwaInit = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function canInstall(): boolean {
  return Boolean(deferredPrompt) && !installed && !isStandalone();
}

export function subscribeInstallChange(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  listener(canInstall());
  return () => {
    listeners.delete(listener);
  };
}

export async function promptInstall(): Promise<InstallOutcome> {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') {
      installed = true;
      notify();
      return 'accepted';
    }
    // Recusou agora, mas o navegador pode permitir de novo: mantém o evento.
    deferredPrompt = event;
    notify();
    return 'dismissed';
  } catch {
    deferredPrompt = event;
    notify();
    return 'unavailable';
  }
}
