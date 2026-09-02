# 03 · Ambient Background Loop (vídeo/textura viva)

> Vídeo mudo em loop atrás do conteúdo do hero — textura viva, atmosfera, sem competir com o CTA. O efeito de maior retorno × esforço da biblioteca.

**Tipo:** atmosfera · **Complexidade:** baixa · **Deps:** zero · **Fallbacks:** reduced-motion/save-data → poster estático; falha de play → poster

## Quando usar

- **Todo hero de LP** onde o cliente tem (ou gera) vídeo de atmosfera: ambiente da loja, café passando, tecido, madeira, laboratório, academia em movimento
- Dark tech: partículas, loops abstratos (casa com os DESIGN.md dark: linear, mercury, dala)
- Editorial warm: texturas físicas (papel, linho, tinta) em close lento

## Quando NÃO usar

- Hero com texto longo (o vídeo + texto denso = poluição; vídeo quer copy curta)
- Quando o vídeo é o argumento (aí é 02, scrub — o 03 é atmosfera, não narrativa)
- Página com vídeo em >1 seção (escolha UM momento vivo)

## Como funciona (resumo técnico)

`<img poster>` por baixo (carrega primeiro, zero CLS) + `<video muted loop playsinline preload="none">` por cima com fade-in `.is-ready` após `canplay`. Veil (overlay `rgba(0,0,0,.38)`) garante contraste do texto. IntersectionObserver faz lazy-load. Reduced-motion e `navigator.connection.saveData` → poster only.

## Snippet (o que copiar)

- HTML: `.hero` com poster `<img aria-hidden>`, `<video muted loop playsinline preload="none" aria-hidden>`, `.veil`, `.hero-content`
- CSS: bloco do `.hero` + media queries `prefers-reduced-motion` e `.no-video`
- JS: IIFE completa (decisão reduced/saveData + IntersectionObserver lazy + fade-in)
- **Remapeio:** `--ef-overlay` ajusta a opacidade do véu conforme o DESIGN.md (dark guia → véu mais leve; warm guia → véu mais escuro OU invertido: vídeo claro + texto ink com véu claro)

## Regras de produção

1. `muted loop playsinline preload="none"` — sagrado (autoplay de navegador exige muted)
2. Poster SEMPRE (mesmo frame do vídeo, zero flash/CLS)
3. Veil com contraste AAA no texto sobre vídeo (testar com o vídeo no frame mais claro)
4. Vídeo ≤ 2MB, 6-12s, loop INVISÍVEL (primeiro e último frames casam — ver ASSETS_PROMPT)
5. `aria-hidden="true"` no vídeo (decorativo)
6. 2 loops máximo percebidos: se o usuário nota o loop, o vídeo é curto demais ou o movimento é rápido demais

## Slot de assets

| Arquivo | Conteúdo | Spec |
|---|---|---|
| `assets/loop.mp4` | Atmosfera do negócio | 16:9, 6-12s, h264/webm, sem áudio, loop invisível, ≤2MB |
| `assets/poster.jpg` | Frame 1 do vídeo | 16:9, ≤150KB |

## Variações

- **Textura física** (warm editorial): close lento de papel/tinta/tecido — casa com elevenlabs, cursor, notion, harvest
- **Partículas abstratas** (dark tech): shader/loop de partículas — casa com linear, dala, auros
- **Lottie no lugar do vídeo** (UI animada, ícones, ilustração): quando a "textura" é ilustração vetorial; JSON ≤ 200KB
