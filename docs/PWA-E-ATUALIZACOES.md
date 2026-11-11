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

### Ícone que liga o app (o jeito recomendado no PC)

Em vez do atalho que o Chrome cria (que só abre a URL e falha com o servidor parado),
use o atalho do próprio projeto: **`scripts/abrir-leadfinder.vbs`**. Ele faz, nesta ordem:

1. porta 3000 livre? sobe o servidor escondido (gera o build antes, se faltar);
2. espera `/api/health` responder (até 45 s; se não responder, avisa numa janela);
3. abre a janela do app — o **app instalado** se existir (procura o id em
   `Chrome\User Data\<perfil>\Web Applications`), senão `chrome --app=…`
   (janela sem abas nem barra de endereço).

Para criar o atalho na área de trabalho e no menu Iniciar, com o ícone do app:

```cmd
cscript //nologo scripts\criar-atalhos.vbs
```

Resultado medido nesta máquina: `LeadFinder.lnk` na área de trabalho
(`C:\Users\paulo\OneDrive\Desktop` — o Windows redireciona para o OneDrive) e no
menu Iniciar; alvo `wscript.exe`, argumentos com o caminho do `.vbs`, ícone
`public\icons\leadfinder.ico`. Clique a frio (servidor parado) → servidor sobe,
`/api/health` 200 e processo `chrome.exe --app=http://localhost:3000` aberto.

> Fechar a janela **não** derruba o servidor (ele fica em segundo plano, pronto para o
> próximo clique). Para encerrar de vez: Gerenciador de Tarefas → `node.exe`, ou
> `taskkill /IM node.exe /F` (mata outros node também, cuidado).

### Três modos, não confunda

| Comando | Para quê | Tem service worker? | Precisa ficar aberto? |
|---|---|---|---|
| `npm run dev` | desenvolver (HMR, `tsx server.ts`) | não (é removido na entrada) | sim, enquanto você edita |
| `npm run build` + `npm start` | **servir o app de verdade** | sim | sim, é o servidor |
| app instalado (atalho) | usar no dia a dia | sim | não — mas ele abre `localhost:3000`, então o servidor acima tem de estar no ar |

Ou seja: **para usar o app instalado não precisa de `npm run dev`** — precisa do
servidor de produção rodando. Uma vez só:

```bash
npm run build
npm start
```

E, para ele subir sozinho com o Windows, o script/atalho da seção anterior.

### Com o servidor desligado (medido)

O app instalado **abre** (a casca vem do cache do service worker: sidebar, cabeçalhos,
navegação) mas **não carrega dados** — as chamadas `/api/*` são NetworkOnly e falham.
Medido: `h1 = "Visão geral"`, sidebar presente, `/api/overview/daily` → `Failed to fetch`.

Consequência prática: número vazio/lista vazia = servidor fora do ar, não banco vazio.
Ligue o servidor (`scripts/iniciar-app.cmd` ou a tarefa de logon) e recarregue a janela.

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
| — | **ordem das rotas** | `precacheAndRoute` registra sozinho um handler de navegação (serve o `index.html` do precache, cache-first). No Workbox a primeira rota registrada ganha, então o `precacheAndRoute` fica **por último** em `src/sw.ts`; senão a rota de navegação acima nunca roda |
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

- **A ordem das rotas decide.** Registrar `precacheAndRoute` antes da rota de navegação
  faz o precache responder por ela (cache-first) e a NetworkFirst nunca roda — sintoma:
  `caches.keys()` sem `leadfinder-pages`. O `precacheAndRoute` fica no fim do arquivo.
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
