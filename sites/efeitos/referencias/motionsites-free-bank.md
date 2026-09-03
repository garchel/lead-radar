# Banco MotionSites — 164 cards FREE categorizados (extraído set/2026)

> Fonte: motionsites.ai (filtro Free), via `design_similarity` + metadados do catálogo.
> Uso no kickoff: escolhido o segmento, pegar 1 técnica daqui + máx 2–3 efeitos de `sites/efeitos/README.md`.
> Deep dive da técnica 3D Character Studio na seção 1 (pedida p/ LPs de autônomos).

## 1. DEEP DIVE — 3D Character Studio (`3d-character-studio`, cat. 3D, FREE)

**O que a técnica realmente é (prompt completo lido):** apesar do nome, não é render 3D —
é um **hero de vídeo fullscreen pilotado pelo mouse (mouse-scrub) + tipografia neutra +
voz de "personagem" via typewriter**. Stack: React + Vite + Tailwind, zero libs de UI.

- **Vídeo-scrub:** `<video fixed inset-0 object-cover object-position 70%>` — NÃO dá autoplay;
  `mousemove` horizontal controla `currentTime` (`delta/innerWidth × 0.8 × duration`, com
  clamp + fila anti-seek-flood). O visitante "opera" o vídeo como timeline tátil.
- **Voz do personagem:** label com `blur(4px)` ("Hey there, meet A.R.I.A…") + hook
  `useTypewriter` (38ms/char, delay 600ms, cursor blink que some ao terminar).
- **CTAs em pílulas:** 4 pills brancas (`Pitch us / Come work here / Send hello / See how we operate`)
  + 1 pill outline com e-mail + ícone copy-to-clipboard. Fade+slide-up 400ms pós-load.
- **Nav:** fixa, logo + `✳︎` decorativo, links com `,` entre eles, CTA sublinhado; mobile vira
  hambúrguer 3-barras → overlay `bg-black/90 blur`.
- Descrição oficial do banco: *mouse-scrub video hero, cursor-driven timeline, helvetica neutra,
  mood retro-futurista, cinemático, tátil, experimental*.

**Onde cai bem (além de agências/estúdios):**
- **Autônomos (pedreiro, eletricista, encanador, pintor):** o "personagem" é o profissional —
  hero com vídeo dele trabalhando (obra, quadro elétrico, massa corrida) pilotado pelo mouse
  do visitante + typewriter ("Opa, sou o João, eletricista…") + pills ("Chamar no WhatsApp",
  "Ver trabalhos", "Pedir orçamento"). Autoridade + proximidade numa tacada só.
  Regra de slot: vídeo precisa nascer escuro no centro (zona de texto) — ver TEMPLATE.
- **Variações irmãs no banco:** `retro-futurist` (mesma técnica, mood retrô), `nike-hover`
  (spotlight revela vídeo sob imagem — bom p/ antes/depois de obra), `sparkform`
  (busto 3D colorido + marquee — p/ marca pessoal jovem), `3d-collectible-hero`
  (carrossel de "bonequinhos" — p/ cardápio de serviços), `intelligent-operations`
  (scroll-scrub de vídeo full-viewport — p/ storytelling de reforma passo a passo),
  `vectrus-energy` (scroll-scrub com texto sequencial — p/ processo construtivo).

## 2. Categorias do banco FREE (id → técnica)

**A. Vídeo-cinemático dark + serif (premium local — advogados, clínicas, construtoras)**
`prisma-landing, innovation-landing, mindloop-landing, velorah-hero, aetheris-voyage-hero,
aethera-hero, asme-hero, designpro-hero, impact-ventures, organic-odyssey, visual-hero,
equilibrium, digital-experiences, cyber-ronin(techwear), aurora-onboard(signup split)`

**B. Vídeo claro / light editorial (comércio bairro, saúde, educação)**
`skyelite-hero(luxo), convix-software-hero(card inset), wellbeing-os, prosthetics-hero,
rivr-hero(fintech glass), nexora-hero(saas+dashboard), halo-usd-landing, taskly-hero,
stellar-ai-hero, digital-epoch-hero(card gigante), build-with-us(form sobre vídeo),
codenest-hero → ver D, trustflow(reverse-playback)`

**C. Interativo cursor/spotlight/scrub (o "impressionante" — 1 por LP)**
`3d-character-studio, retro-futurist, interactive-discovery, nike-hover, cyberpunk-reveal,
wellness-device, audio-showcase(boomerang canvas), prompt-hero(scroll+cursor custom),
neon-logic(mouse+scroll video), orbit-flora(blob-trail que fura imagem)`

**D. Scroll-scrub / storytelling por rolagem (reformas, processo, antes/depois)**
`intelligent-operations, vectrus-energy, contact-cybernetic(typewriter+scrub),
beauty-categories(tiles de vídeo), mostar-guide(parallax camadas), pixel-grid-hover`

**E. Tipográfico / editorial puro (sem vídeo — leve, barato, rápido)**
`subscription-agency(suíço P&B), personal-showcase(foto full-bleed), neo-museum(tipo gigante),
orbis-hello(pôster), synth-mode(orbitron), tech-noir-about(vermelho), axion-about,
launchex-about(founders), guardnet-benefits, tech-forward, ai-workflow(sparkles css-only)`

**F. Prova social / números (stats, depoimentos, resultados)**
`arceage-stats(count-up = nosso efeito 05), radial-diagram(scroll-once),
nexacore-results(pilares escada), bold-studio(stats row), creative-studio(stats row),
ai-runtime(count-up + pixel font), data-signal`

**G. Conversão direta (CTA, pricing, waitlist, contato, footer)**
`rocket-cta, liquid-glass-cta, faq-cta(gradiente+acordeão), no-code-waitlist(email focal),
rocket-pricing, price-calculator(interativa), lumina-footer, kresna-footer, vize-footer,
haul-footer(parallax reveal), stark-minimal-footer, heritage-grove-footer(ilustrado)

**H. Nichos prontos (clonar estrutura, trocar copy)**
Saúde: `health-portal(odonto), mind-body-healing, wellness-hero, wellness-balance,
wellness-companion(quiz no phone), pet-diagnostics(vet lifestyle), celestial-renewal(beauty)`
Comércio/apps: `cross-border(logística), coffee-rewards(fidelidade), cozypaws(pet),
daisy-wild(produto split), adhd-planner, ai-trip-planner, place-saver, travel-journal,
wanderful-hero, mostar-guide, forecast-center(clima), f1-racing-hub(stats app)`
Fintech/saas: `securify-hero, datacore-booking-hero, digitwist-hero, ai-workflow-agents,
quantum-lucid, agent-grove, ai-runtime, deepthink, aurex-finance(defi brutalista),
cyber-layer, signal-id, intelligence-layer, agent-wave, growth-decisions, task-engine,
autonomous-ops, scaling-platform, planetary-pulse(science glass)`
Diversão/erro: `fun-404-page, 404-planet, 404, skybridge-404`

## 3. Regra de uso no kickoff

1. Segmento do lead → 1 técnica deste banco (seção 2) + guia `design/README.md`.
2. Máx 2–3 efeitos de `sites/efeitos/README.md`; se a técnica for do grupo C, ela CONTA
   como 1 efeito (não empilhar interações).
3. Prompt de asset segue `sites/ASSETS_PROMPT_TEMPLATE.md` (7 blocos + zona de texto em %).
