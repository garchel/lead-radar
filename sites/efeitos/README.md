# Biblioteca de Efeitos — Motion para Landing Pages

> Cada pasta `NN-nome/` = um efeito pronto para produção: `demo.html` (standalone, abre no browser), `EFFECT.md` (spec que o agente lê para integrar), `ASSETS_PROMPT.md` (prompts prontos para gerar os assets do cliente) e `assets/` (placeholders).

## Pipeline de produção (ordem obrigatória)

```
Lead → categoria do negócio
  1. design/README.md            → escolhe o DESIGN.md (aparência)
  2. sites/efeitos/README.md      → escolhe 2-3 efeitos (esta biblioteca, movimento)
  3. efeitos/NN/EFFECT.md        → copia snippet, remapeia tokens p/ paleta do guia
  4. efeitos/NN/ASSETS_PROMPT.md → preenche o prompt do segmento → gera assets
  5. fotos/vídeos REAIS do cliente substituem placeholders
  6. probe headless: reduced-motion, touch, mobile, console limpo
```

Regra: `design/` responde **como a página parece**; `efeitos/` responde **como ela se move**. Nunca gerar um efeito do zero — sempre ler o EFFECT.md correspondente.

## Catálogo

| # | Efeito | Termo técnico | Melhores segmentos | Impacto | Esforço | Mobile | Deps |
|---|---|---|---|---|---|---|---|
| 01 | Reveal hover | Cursor mask reveal / before-after slider | Advocacia, imobiliária, estética, arquitetura, reformas | Alto | Baixo | Degrada p/ slider arrastável | — |
| 02 | Scroll scrub | Scroll-driven video (Apple keynote) | Imobiliária, produto premium, portfólio, construtora | Alto | Médio | Vídeo curto + poster | GSAP (CDN) |
| 03 | Loop ambient | Ambient background loop | Qualquer hero (o de maior retorno) | Alto | Baixo | Poster + autoplay muted | — |
| 04 | Parallax multicamada | Parallax layers | Imobiliária, restaurante, turismo | Alto | Baixo | Colapsa p/ imagem única | — |
| 05 | Count-up stats | Scroll-triggered counters | Todos (prova social) | Alto | Baixo | Igual | — |
| 06 | Logo marquee | Infinite logo scroll | "Onde atendemos", parceiros | Médio | Baixo | Igual | — |
| 07 | Image clip reveal | Cinematic clip-path reveal | Portfólio, galerias | Médio | Baixo | Igual | — |
| 08 | Magnetic button | Magnetic CTA | CTA principal de qualquer LP | Médio | Baixo | Desliga | — |
| 09 | 3D tilt cards | Bento tilt | Grades de serviços/preços | Médio | Baixo | Desliga | — |
| 10 | Kinetic typography | Variable-font scroll type | Headlines editoriais | Médio | Médio | Igual | — |
| 11 | Ken Burns | Slow zoom banner | Banners econômicos | Médio | Baixo | Igual | — |
| 12 | Grain overlay | Film grain | Editorial premium | Baixo | Baixo | Igual | — |
| 13 | WebGL shader bg | Shader background | Dark tech (Linear, Auros) | Alto | Alto | Poster | three.js |
| 14 | Sticky scrollytelling | Pinned sequences | Passo-a-passo, cases | Alto | Médio | Simplifica | GSAP |

**Status:** 01–03 implementados · 04–14 mapeados (construir sob demanda; padrão de pasta idêntico).

## Como escolher (guia rápido)

- **Antes/depois é o argumento de venda?** → 01 (advocacia "com site × sem site", reforma, estética)
- **O produto precisa ser visto girando/construindo?** → 02
- **Hero precisa de vida sem custo?** → 03 (comece sempre por aqui)
- **Máximo 2-3 efeitos por página.** Mais que isso vira circo: 1 no hero + 1 seção + micro-interações.
- LP de captura de leads: efeito deve servir ao CTA, nunca competir com ele.

## Regras globais de produção (valem para todos)

1. **`prefers-reduced-motion`**: todo efeito tem fallback estático. Sem exceção.
2. **Touch**: hover não existe no mobile — todo efeito 01/08/09 degenera graciosamente.
3. **Performance**: só `transform`/`clip-path`/`opacity` (nada de reflow); `mousemove` com rAF throttle; vídeo `muted autoplay loop playsinline`, `preload="none"` fora da dobra.
4. **Acessibilidade**: controles operáveis por teclado; `<video>` com `aria-hidden` quando decorativo.
5. **Peso**: hero ≤ 2MB total de assets; placeholders ≤ 300KB/foto, vídeos ≤ 2MB.
6. **Aprovação**: rodar probe headless (como na LP) antes de entregar — console limpo, zero overflow, efeitos ativos/no-fallback conforme o viewport.
