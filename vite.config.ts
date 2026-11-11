import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

/**
 * PWA: app instalável + aviso de versão nova.
 *
 * Decisões que não se mudam sem pensar:
 * - `/api/*` é SEMPRE NetworkOnly: dado de CRM (lead, pipeline, comunicação) não
 *   pode vir do cache. Se o servidor não respondeu, a tela mostra erro.
 * - `registerType: 'prompt'`: a versão nova fica em `waiting` e quem decide
 *   recarregar é o usuário — nunca trocamos o app no meio de um envio.
 * - `injectRegister: null`: registra o `useRegisterSW` de PwaStatus.tsx, que
 *   também faz a checagem periódica de atualização.
 */
export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        includeAssets: ['favicon.png', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'LeadFinder Pro — Radar de Leads',
          short_name: 'LeadFinder',
          description: 'Prospecção B2B, CRM e entrega de landing pages em um só lugar.',
          lang: 'pt-BR',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#0f172a',
          theme_color: '#4f46e5',
          categories: ['business', 'productivity'],
          icons: [
            {src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
            {src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
            {src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
          ],
        },
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
        },
        devOptions: {enabled: false},
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY || ''),
      // versão do package.json vai para o bundle: o rodapé mostra e, depois de
      // atualizar o PWA, dá para ver na tela que a versão nova entrou
      __APP_VERSION__: JSON.stringify(
        JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version
      ),
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
