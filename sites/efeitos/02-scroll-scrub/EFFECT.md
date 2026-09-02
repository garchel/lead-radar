# 02 · Scroll Video Scrub (Apple Keynote Style)

> A seção trava (sticky) e o playhead do vídeo avança com o scroll — o usuário "desenvolve" a narrativa frame a frame.

**Tipo:** scrollytelling · **Complexidade:** média · **Deps:** GSAP + ScrollTrigger (CDN, ~60KB) · **Fallbacks:** reduced-motion → autoplay loop normal; mobile → mesmo efeito com vídeo curto

## Quando usar

- **Imobiliária**: tour pelo imóvel que se revela conforme desce
- **Construtora/incorporadora**: obra evoluindo do aterro à entrega
- **Produto premium**: montagem/exploded view do produto
- **Portfólio/agência**: reel que se constrói com a narrativa
- **Processos** (academia, clínica): jornada do cliente em etapas visuais

## Quando NÃO usar

- Página de captura impaciente (o scrub "rouba" 2-3 viewports de scroll — em LP de leads use com moderação e SÓ na seção do argumento central)
- Vídeo > 15s (peso + impaciência; ideal 6-12s)
- Sem controle do asset (o vídeo precisa ser EDITADO para scrub: movimento contínuo, sem cortes secos — ver ASSETS_PROMPT.md)

## Como funciona (resumo técnico)

`.scrub-track` de 300vh contém `.scrub-stage` sticky (100vh). GSAP `fromTo(video, {currentTime:0}, {currentTime:duration})` com `ScrollTrigger({scrub: 0.6})` mapeia scroll→playhead. `scrub: 0.6` dá o atraso elástico que faz parecer fluido. Video: `muted playsinline preload="metadata"`.

## Snippet (o que copiar)

- HTML: track (300vh) + stage sticky + frame 16:9 + `<video muted playsinline preload="metadata">`
- CSS: `.scrub-track`, `.scrub-stage`, `.scrub-frame` + reduced-motion override (track vira `height:auto`, stage estático)
- JS: o IIFE inteiro — inclusive o fallback `if (reduced || !window.gsap)` que transforma em autoplay loop
- GSAP via CDN (jsdelivr, 3.13): 2 tags `<script>`

## Regras de produção

1. Vídeo SEM áUDIO (o scrub não reproduz som; se precisar de som, não é este efeito)
2. `preload="metadata"` (não baixa o arquivo inteiro até precisar)
3. `scrub: 0.4-0.8` (abaixo disso fica "nervoso"; acima, "pesado")
4. Track de 250-350vh (mais que isso cansa; menos não dá tempo de ver)
5. Fallback reduced-motion é autoplay loop — nunca vídeo travado
6. Poster obrigatório para CLS (`poster="assets/poster.jpg"`)
7. Móvel: mesmo efeito, mas vídeo ≤10s e ≤2MB; testar em 4G simulada

## Slot de assets

| Arquivo | Conteúdo | Spec |
|---|---|---|
| `assets/scrub.mp4` | A narrativa (produto se montando, tour, evolução) | 16:9, 6-12s, h264 CRF 26-28, sem áudio, ≤2MB |
| `assets/poster.jpg` | Frame do meio | mesmo 16:9, ≤150KB |

## Variações

- **Image sequence** (sprite de frames + canvas): quando mp4 é pesado demais; Apple usa. Custo: gerar sprites. Só se justificar.
- **Scrub horizontal** (pinned + painéis passando): portfólios; GSAP `pin: true` + xPercent.
- **Scrub com máscara morph** (vídeo visto por uma forma que se transforma): avançado, gsapvault tem referência.
