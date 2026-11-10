# ASSETS_PROMPT — LP Paulo Victor (ElevenLabs + efeitos 01/03)

> Prompts para gerar os assets finais da LP. Cada seção = um slot da página.
> Ferramentas: imagem (Midjourney/DALL·E/Flux/Firefly) · vídeo (Runway/Pika/Luma/Kling/Veo).
> Todos os prompts casam com o design system ElevenLabs (`design/elevenlabs.md`): eggshell `#fdfcfc`, taupe `#f5f3f1`, ink `#000000`, sparks violeta `#0447ff` + laranja `#ff4704` SÓ em visuais de produto.

---

## 1. `assets/antes.svg` + `assets/depois.svg` → gerar `case-antes.jpg` + `case-depois.jpg`

**Slot:** seção "Case" — efeito 01 (reveal hover antes × depois). Atualmente SVGs wireframe de placeholder.
**A regra mais importante do efeito:** as duas imagens MESMO enquadramento, MESMA câmera. Gere as duas juntas ou com seed fixa.

### ANTES (o site de 2010 que assusta)
```
Photorealistic mockup of a cluttered outdated website from 2010 displayed on a desktop monitor, seen straight-on filling the frame: Times New Roman body text wall, saturated blue header banner with bold yellow star badges, green marquee text banner, purple links underlined everywhere, beveled gradient buttons, visitor counter at the bottom, low resolution, harsh contrast, no whitespace anywhere, every pixel screaming, screen glare slightly washing out colors, photographed in a dim messy office --ar 16:10
```

### DEPOIS (a landing ElevenLabs que convida)
```
Same desktop monitor, same straight-on camera position, same office background now tidy: screen now shows a modern minimal landing page hero: warm off-white eggshell background #fdfcfc, huge ultra-light weight 300 headline in near-black with tight letter-spacing reading "Sua empresa no ar", small mono uppercase eyebrow label in warm gray above, one filled black pill button and one outlined pill button, a soft abstract sphere with violet #0447ff and orange #ff4704 gradient glow floating on the right side, generous whitespace, editorial restraint, premium Bauhaus studio calm --ar 16:10 --seed [MESMA SEED DO ANTES]
```

**Fallback mais autêntico (recomendo):** em vez de I.A., monte as duas telas você mesmo:
- **ANTES**: pegue um template antigo real / archive.org de um site ~2010 de marcenaria ou similar, screenshot full-page → exporte 1600×1000.
- **DEPOIS**: screenshot full-page da própria LP final hospedada → 1600×1000. O "case" vira literalmente verdadeiro (site antigo do cliente × a landing nova dele).

**Pós:** 1600×1000, JPEG/WebP ≤300KB cada, mesmas dimensões exatas.

---

## 2. `assets/cta-loop.mp4` + `assets/cta-poster.jpg`

**Slot:** banda CTA final — efeito 03 (loop ambiente atrás do headline preto). Atualmente loop abstrato gerado via ffmpeg (drift escuro).
**Vibe:** escuro, calmo, premium — um "void" com as duas sparks do guia passeando devagar. Nada de texto, nada de rosto.

### Opção A — I.A. (image-to-video, 2 passos)

Cena base:
```
Abstract dark ambient scene: a vast matte black void with two slowly drifting soft light orbs, one deep electric violet #0447ff and one ember orange #ff4704, subtle film grain, deep depth of field, the two lights never touching, elegant restrained motion, premium tech keynote backdrop, cinematic --ar 16:9
```

Animação:
```
Extremely slow continuous drift, the two glowing orbs floating gently in opposite orbits, seamless loop, no camera movement, no cuts, subtle grain shimmer, 10 seconds, calm premium atmosphere, dark minimal
```

### Opção B — Sem I.A. (físico/ffmpeg)
- Filme um vidro fosco iluminado por 2 lanternas (uma com filtro azul-violeta, outra laranja) em quarto escuro, câmera parada 12s, movimento mínimo das luzes → `ffmpeg -an -crf 28` corta 10s.
- Ou mantenha o loop procedural atual (ffmpeg geq) — ele já está coerente e pesa 131KB.

**Pós:** 16:9 (1280×720 basta — a banda é object-fit:cover), 10s, sem áudio, **loop invisível** (primeiro/último frame casam), CRF 28, ≤2MB. Poster = frame do meio, JPEG ≤150KB.

---

## 3. `assets/sobre-*` (opcional — visual da seção "Sobre")

**Slot:** seção Sobre (hoje: bloco de código mono + esfera CSS). Uma foto do Paulo Victor trabalhando humaniza e aumenta conversão.

```
Photorealistic photo of a young Brazilian web designer working in a warm minimal home studio at golden hour: desk with laptop showing a clean landing page wireframe in cream tones, notebook with hand sketches, warm tungsten desk lamp, plant in the corner, shallow depth of field on the laptop, the person seen from a three-quarter back angle so the face is not the focus, calm focused atmosphere, editorial photography style, warm muted palette of cream #f5f3f1, taupe and ink black --ar 4:3
```

**Pós:** 1200×900, ≤300KB. Se usar foto real: preferir real a I.A. sempre — a confiança do visitante sente a diferença.

---

## 4. Avatares de depoimento (quando houver clientes reais)

**Slot:** cards de depoimento (hoje placeholders C1/C2/C3). Com cliente real: **foto real com autorização escrita (LGPD)**, nunca I.A. Spec: quadrada 200×200, rosto centrado, fundo neutro claro, ≤50KB, `border-radius: 9999px` já no CSS.

---

## Ordem de prioridade (o que gera primeiro)

| # | Asset | Por quê |
|---|---|---|
| 1 | case-antes/depois (1.1) | O argumento central da LP — o efeito 01 existe para ele |
| 2 | cta-loop (2) | Barato, alto retorno atmosférico |
| 3 | foto do Sobre (3) | Confiança — mas foto REAL vale mais que gerada |
| 4 | avatares (4) | Só quando houver depoimento real autorizado |

## Checklist final de integração

- [ ] Arquivos substituídos com os MESMOS nomes referenciados no HTML (ou `src` atualizado)
- [ ] Duas imagens do case sobrepostas não "pulam" (mesmo enquadramento)?
- [ ] Loop do CTA: 2 voltas sem notar emenda?
- [ ] Texto do CTA legível no frame mais claro do loop (veil .45 ok)?
- [ ] Console limpo + probe headless re-executado (hover/touch/reduced/mobile)?
- [ ] Peso total da página ≤ 2MB de assets?
