# PWA: instalar o app e receber novas versões

O LeadRadar é uma PWA. Rodando o build de produção (`npm run build && npm start`), o
navegador oferece **instalar** o app (janela própria, ícone no menu iniciar/área de
trabalho) e avisa na tela quando existe **versão nova** publicada.

> O service worker só existe no build de produção. Em `npm run dev` não há SW — e, se
> houver um SW de produção registrado no mesmo host:porta, o `main.tsx` remove na
> entrada para não servir código velho durante o desenvolvimento.

## Instalar

| Onde | Como |
|---|---|
| **Windows / Chrome** | Botão **Instalar app** no rodapé da sidebar (caminho mais fácil); ou o ícone de instalação na barra de endereço; ou menu ⋮ → *Salvar e compartilhar* → *Instalar página como app* (o nome do submenu muda conforme a versão) |
| **Windows / Edge** | Botão **Instalar app**, ou ⋯ → *Aplicativos* → *Instalar este site como aplicativo* |
| Android (Chrome) | Banner automático ou menu → *Adicionar à tela inicial* |
| iPhone / iPad (Safari) | Compartilhar → *Adicionar à Tela de Início* (o Safari não dispara `beforeinstallprompt`) |

O botão da sidebar só aparece quando o navegador realmente permite instalar
(`beforeinstallprompt` capturado) e o app não está rodando já instalado
(`display-mode: standalone`).

### No PC (Windows 11)

Instalado pelo Chrome/Edge o app vira uma janela própria, **sem barra de navegador**,
com atalho no menu iniciar, ícone na barra de tarefas e entrada em *Configurações → Apps*
(desinstala por ali). Ao contrário do celular, o Windows não cria "tela inicial": o
acesso é pelo atalho do menu iniciar/barra de tarefas.

**O servidor precisa estar no ar.** O app instalado aponta para `http://localhost:3000`;
se o `node dist/server.cjs` não estiver rodando, a janela abre e as chamadas de API
falham. Para não depender de abrir terminal:

| Script | Uso |
|---|---|
| `scripts/iniciar-app.cmd` | clique duplo: sobe o servidor (gera o build se faltar) e, se já estiver no ar, apenas abre o app. Janela de console fica aberta enquanto roda |
| `scripts/iniciar-app-oculto.vbs` | sobe escondido, sem janela. É o que se usa no login automático |

Login automático (uma vez, no prompt do Windows):

```cmd
schtasks /Create /TN "LeadFinder" /SC ONLOGON /TR "wscript.exe C:\Users\paulo\OneDrive\Documentos\lead-radar\scripts\iniciar-app-oculto.vbs" /F
```

Alternativa sem `schtasks`: `Win+R` → `shell:startup` → coloque nessa pasta um atalho para
`iniciar-app-oculto.vbs`.

> Os dois scripts são idempotentes: se a porta 3000 já estiver ocupada, não sobem um
> segundo servidor (o `.cmd` só abre o navegador). Arquivos `.cmd`/`.vbs` precisam de
> CRLF — está garantido no `.gitattributes`.

## Publicar uma versão nova

```bash
npm run build     # gera dist/ com novo sw.js e novo hash nos assets
npm start         # serve dist/ na porta 3000
```

O `sw.js` e o `manifest.webmanifest` são servidos com `Cache-Control: no-cache`, então
o navegador sempre revalida. Quando o conteúdo do build muda, o Workbox detecta um
`sw.js` diferente e instala a versão nova **em segundo plano**, deixando-a em `waiting`.

## Como o aviso funciona

1. O service worker é registrado por `useRegisterSW` (`src/components/PwaStatus.tsx`).
2. A checagem de atualização roda **ao abrir**, **a cada 5 minutos** e **sempre que a aba
   volta a ficar visível** (`registration.update()`).
3. Quando existe versão nova instalada, aparece o cartão *"Versão nova pronta"* com
   **Atualizar agora** / **Depois**. Nada muda até o usuário decidir — importante para não
   recarregar a tela no meio de um envio de WhatsApp.
4. **Atualizar agora** envia `SKIP_WAITING` ao SW em espera e recarrega **depois** do
   evento `controllerchange` (com rede de segurança de 4 s).

## Estratégia de cache (o que vem do cache e o que nunca vem)

Definida à mão em `src/sw.ts` (`injectManifest`), nesta ordem:

| Requisição | Estratégia | Por quê |
|---|---|---|
| Navegação (`mode: 'navigate'`) | **NetworkFirst** (timeout 3 s, cache `leadfinder-pages`) | versão nova entra no primeiro reload; sem rede, abre o `/` guardado |
| `/api/*` | **NetworkOnly** | dado de CRM (lead, pipeline, comunicação) não pode vir do cache |
| Imagens | **StaleWhileRevalidate** (60 itens, 7 dias) | ícone/print não precisa ser fresco |
| Assets com hash | **precache** do build | nome muda a cada build, então cachear é seguro |

Medição no navegador (build atual): `caches.keys()` → `workbox-precache-v2-http://localhost:3000/`
com **0 entradas de `/api`**, service worker `activated`, `Page.getInstallabilityErrors` → `[]`.

## Verificação de ponta a ponta (foi assim que validamos)

1. Carregar o app e confirmar `navigator.serviceWorker.getRegistration()` → `activated`.
2. `Page.getInstallabilityErrors` (CDP) → lista vazia: app instalável.
3. Publicar outro build (a versão aparece no rodapé da sidebar, `LeadFinder vX.Y.Z`).
4. Na página, disparar `document.dispatchEvent(new Event('visibilitychange'))` →
   o aviso *"Versão nova pronta"* aparece e `registration.waiting.state === 'installed'`.
5. Clicar **Atualizar agora** → recarrega já na versão nova (o rodapé mostra o novo `v`).
6. Desligar a rede (`Network.emulateNetworkConditions offline`) e recarregar → o app
   abre normalmente pelo cache de navegação.

## Armadilhas que já custaram tempo

- **`generateSW` injeta uma NavigationRoute própria** que responde à navegação com o
  `index.html` do precache. Mesmo com `navigateFallback` removido da config ela continua
  sendo gerada, e o reload pós-atualização voltava com o código antigo. Por isso o SW é
  `injectManifest` com as rotas escritas em `src/sw.ts` — `grep NavigationRoute dist/sw.js`
  tem de dar zero.
- **O reload do workbox dispara antes de o SW novo assumir.** `updateServiceWorker(true)`
  pede `SKIP_WAITING` e recarrega em seguida; a recarga chegava no SW antigo. Agora
  esperamos `controllerchange`.
- **`clientsClaim` importa**: com a versão nova ativa, ela precisa assumir as abas abertas
  para que a recarga caia nela.
