/// <reference lib="webworker" />
import {precacheAndRoute, cleanupOutdatedCaches} from 'workbox-precaching';
import {registerRoute} from 'workbox-routing';
import {NetworkFirst, NetworkOnly, StaleWhileRevalidate} from 'workbox-strategies';
import {ExpirationPlugin} from 'workbox-expiration';

/**
 * Service worker do LeadFinder (injectManifest — rotas escritas à mão).
 *
 * Por que não `generateSW`: o plugin injetava uma NavigationRoute de precache
 * que respondia a navegação com o index.html guardado, e o reload pós-"Atualizar
 * agora" voltava com o código antigo. Aqui a ordem é explícita e auditável:
 *
 *   1. navegação  → NetworkFirst (versão nova entra no primeiro reload; offline
 *                   cai no '/' guardado)
 *   2. /api/*     → NetworkOnly (dado de CRM nunca vem do cache)
 *   3. imagens    → StaleWhileRevalidate (ícone/print não precisa ser fresco)
 *   4. resto      → precache do build (assets com hash no nome)
 */

declare const self: ServiceWorkerGlobalScope;

// ORDEM IMPORTA: no Workbox a primeira rota registrada ganha. O
// `precacheAndRoute` registra sozinho um handler para a navegação (serve o
// index.html do precache, cache-first) e, se ele vier primeiro, a rota abaixo
// nunca é usada — foi assim que a versão nova deixou de entrar no reload.
// Por isso a navegação é registrada antes do precache.
registerRoute(
  ({request}) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'leadfinder-pages',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({maxEntries: 5})],
  })
);

// A versão nova só assume quando o usuário clica em "Atualizar agora".
self.addEventListener('message', (event) => {
  if ((event.data as {type?: string} | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

registerRoute(
  ({url}) => url.pathname.startsWith('/api/'),
  new NetworkOnly()
);

registerRoute(
  ({request}) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'leadfinder-images',
    plugins: [new ExpirationPlugin({maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60})],
  })
);

// precache dos assets do build (nome com hash) — registrado por último.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
