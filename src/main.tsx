import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {PwaUpdateToast} from './components/PwaStatus.tsx';
import {initPwaInstall} from './utils/pwa.ts';
import './index.css';

// Captura o `beforeinstallprompt` antes de qualquer render: o evento dispara
// cedo e some se ninguém escutar.
initPwaInstall();

// Em desenvolvimento não existe service worker (devOptions desligado). Se um SW
// do build de produção estiver registrado no mesmo host:porta, ele serviria
// código velho e daria a impressão de que a edição não fez efeito: limpa.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void (async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) return;
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    console.info('[pwa] service worker de produção removido neste ambiente de desenvolvimento');
  })();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaUpdateToast />
  </StrictMode>,
);
