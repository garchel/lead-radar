# 01 · Reveal Hover (Cursor Mask Reveal)

> Duas fotos empilhadas — a de trás aparece onde o cursor passa. O argumento de venda (a transformação) vira a interação.

**Tipo:** interação de imagem · **Complexidade:** baixa · **Deps:** zero (vanilla) · **Fallbacks:** touch→slider, reduced-motion→estático lado a lado

## Quando usar

- **Advocacia/consultoria**: "sem site × com site" (print do Google Results × landing no ar)
- **Imobiliária/reformas**: imóvel/ambiente antes × depois da intervenção
- **Estética/odontologia**: sorriso antes × depois (CUIDADO: sem rosto identificável sem autorização — ver ASSETS_PROMPT.md)
- **Arquitetura/interiores**: rascunho × render final
- **Qualquer "antes × depois"** que seja o argumento central da seção

## Quando NÃO usar

- Hero mobile-first (hover não existe em touch; use só se aceitar a degradação)
- Quando as duas imagens não têm o MESMO enquadramento (o reveal exige alinhamento perfeito)
- Página com mais de 1 instância (o efeito perde a força na repetição)

## Como funciona (resumo técnico)

Camada `depois.jpg` cobre o container; camada `antes.jpg` por cima com `clip-path: inset(0 calc(100% - var(--x)) 0 0)` — `--x` (em %) segue o cursor via `mousemove` + rAF com suavização lerp (0.18). Handle vertical branco marca o corte. No touch, um `<input type="range">` invisível (operável por teclado) assume. Reduced-motion: layout vira duas figuras lado a lado via CSS puro.

## Snippet (o que copiar para a LP)

- HTML: `.reveal` com 2 `<img>` (bottom=top), handle, labels, `<input type="range">`
- CSS: tudo do bloco `:root { --ef-* }` + `.reveal`, `.layer-top`, `.reveal-handle`, `.reveal-label` + media query reduced-motion
- JS: IIFE completa do `<script>` (setores touch e desktop inclusos)
- **Remapeio de tokens:** `--ef-canvas/--ef-ink/--ef-smoke/--ef-stroke` → cores do DESIGN.md do cliente; `--ef-softness` (zona de transição) e `--ef-handle-w` ajustam o "caráter" do efeito

## Regras de produção (não negociáveis)

1. `prefers-reduced-motion` → fallback estático (já no CSS; não remover a media query)
2. Touch → range slider (já implementado; `touch-action: pan-y` preserva o scroll da página)
3. `mousemove` com rAF (nunca aplicar estilo direto no handler)
4. Handle/range operáveis por teclado (setas ←/→)
5. Imagens: MESMO enquadramento, MESMA proporção (16:10 padrão), `object-fit: cover`
6. Peso: ≤ 300KB/foto comprimida (guia no ASSETS_PROMPT.md)

## Slot de assets

| Arquivo | Conteúdo | Spec |
|---|---|---|
| `assets/antes.jpg` | Estado ANTERIOR (o problema) | 1600×1000 (16:10), ≤300KB |
| `assets/depois.jpg` | Estado POSTERIOR (a solução) | 1600×1000 (16:10), ≤300KB, mesmo enquadramento da de cima |

Fotos reais do cliente substituem os placeholders. Se o cliente não tem as duas fotos: gerar via I.A. com `ASSETS_PROMPT.md` (um prompt por segmento) ou fotografar no briefing.

## Variações

- **Reveal circular** (spotlight): trocar `clip-path: inset()` por `circle(var(--r) at var(--mx) var(--my))` — revela "janela" ao redor do cursor. Bom para produtos (ótica, joias).
- **Rastro suave** (mouse trail): exige canvas + `destination-in`; só quando o cliente pede explícito (custo de manutenção alto).
- **Slider de arraste** (estático, sem hover): quando 01 vira o modo mobile permanente.
