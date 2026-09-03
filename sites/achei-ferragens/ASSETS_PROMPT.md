# ASSETS_PROMPT — Achei Ferragens (v2 slot-aware)

> LP: `sites/achei-ferragens/` · Design: **Caldera** (`design/caldera.md` —
> Pumice `#e2e2df`, Limestone `#f7f6f2`, Ember `#fc5000`, Sulfur `#f5f28e`, Plasma `#524ae9`, Obsidian `#070607`)
> Efeitos: **03** loop-ambient (hero) + **05** count-up (stats).
> Regra: foto/vídeo REAL da loja sempre ganha de IA. IA só p/ o que não dá p/ fotografar.
> LGPD: sem rosto de cliente sem autorização escrita — depoimentos usam iniciais.

---

## 0. REGRA-MÃE — anatomia do prompt perfeito (vale p/ TODAS as próximas LPs)

Todo asset desta e das futuras LPs segue estes 7 blocos. Não pule nenhum:

1. **SLOT BLUEPRINT** — arquivo, dimensões de exibição, `object-fit`, overlays por cima (véu, halftone, gradiente), e ONDE fica o texto (zona de texto = intocável).
2. **MAPA DE COMPOSIÇÃO** — regra dos terços + safe zones em %: centro = texto (escuro, liso, desfocado), detalhe gráfico SÓ nas bordas. Margem de corte (border-radius / cover) = 8–12% nas bordas, nada importante ali.
3. **LUZ + PALETA** — hexes do guia, temperatura (tungstênio 3200K p/ loja), luminância-alvo na zona de texto (<35% p/ texto branco).
4. **CÂMERA** — posição, altura, lente, profundidade de campo. Pares antes/depois = MESMA câmera.
5. **PROMPT POSITIVO (EN, copy-paste)** — parágrafo único, denso, na ordem: assunto + composição + luz + paleta + textura + mood.
6. **NEGATIVO** — o que proibir: texto legível, logos, rostos, marcas d'água, highlights estourados, etc.
7. **PARAMS + PÓS + VALIDAÇÃO** — `--ar`, `--style raw`, `--seed` fixa, compressão ffmpeg/cjpeg, teste de contraste no frame mais claro.

**Anti-erros universais:**
- Texto sobre imagem SEMPRE exige zona de texto escura/lisa/desfocada + véu ≥.55. Nunca confie só no véu do CSS — a imagem já deve nascer escura no centro.
- Parte gráfica (ferramenta, rosto, produto hero) NUNCA no centro quando houver texto por cima — jogue p/ terços laterais.
- Nada de texto, letra, etiqueta legível, logo ou marca dentro da imagem gerada — o HTML já tem o texto.
- Uma `--seed` fixa por sessão/série p/ consistência de luz. Anote a seed usada.

---

## 1. `assets/hero-loop.mp4` + `hero-poster.jpg` (efeito 03 — hero)

**SLOT BLUEPRINT:** hero `.hero` — card Obsidian `#070607` radius 40px, `object-fit:cover`, 16:9 (mobile corta laterais, mantém centro). Por cima: `.hero-veil rgba(7,6,7,.58)` + `.hero-halftone` ember opacity .5 (máscara diagonal, some à esquerda). Por cima de tudo: `.hero-content` max-width 880px CENTRALIZADO — tag, H1 Anton 3–7rem branco com `em` ember, lead limestone 620px, 2 botões, pill `4,5 · 123 avaliações`, 3 cards stats ember. **Zona de texto = coluna central 60% largura × 80% altura.**

**MAPA DE COMPOSIÇÃO (obrigatório):**
- Centro 60% (x 20–80%, y 10–90%): FUNDO ESCURO LISO — prateleira desfocada em bokeh, luminância <35%, zero ponto de luz estourado, zero objeto nítido. É onde o H1 branco assenta.
- Interesse gráfico SÓ nas faixas laterais (x 0–18% e 82–100%) e faixa inferior (y 85–100%): ferramentas penduradas, caixas de parafuso, brilho metálico suave.
- Topo (y 0–12%): escuro p/ a nav-pill limestone não vibrar contra fundo claro.
- Mobile 390px: laterais cortam — nada essencial fora do centro-escuro + 1 ponto de interesse por lateral.

**LUZ:** tungstênio quente de oficina 3200K, sombras abertas, sem hotspot branco. Paleta: cinza-quente `#4a4a47` + `#e2e2df` de base, UM acento Ember `#fc5000` por lateral (etiqueta, cabo). Sem Plasma aqui (Plasma só no halftone do CSS).

**CÂMERA:** dolly lateral lento, altura 1,5m, 35mm, f/2.8, foco no terço lateral, centro em bokeh.

**Prompt cena (Passo 1 — gerar o frame base):**
```
Cinematic wide interior of a small Brazilian hardware store aisle at night, COMPOSITION MAP: dark smooth blurred center 60 percent of frame as empty negative space (out-of-focus warm-gray shelving bokeh, luminance under 35 percent), sharp detail ONLY on left and right edge bands: hanging steel wrenches pliers and drill-bit boxes on warm gray pegboard left, stacked screw compartment boxes with ONE small ember-orange #fc5000 price tag right, warm tungsten 3200K workshop light, soft glow on metal edges, no bright white hotspots in center, deep shadows top band, photorealistic interior photography, 35mm f2.8, muted warm grays #4a4a47 #e2e2df with single ember-orange #fc5000 accent per side --ar 16:9 --style raw --v 6.1 --s 150 --chaos 5 --seed 4177
NEGATIVE: no people, no faces, no readable text, no brand logos, no white blown highlights in center, no sharp object in middle third, no watermark
```

**Prompt animação (Passo 2 — image-to-video):**
```
Very slow continuous lateral camera drift from right to left across the aisle, 10 seconds, center stays dark and soft at all times, gentle tungsten shimmer ONLY on side metal edges, no new objects entering center, no focus pull, no cuts, no zoom, seamless loop ready first and last frames identical, subtle motion only
```

**Caminho real (preferido — 15 min na loja):** celular em tripé na gôndola, filmar prateleira com CENTRO desfocado (toque p/ focar na lateral), 2–3 takes de 12s. Converter:
`ffmpeg -i take.MOV -an -vf scale=-2:720 -crf 30 -movflags +faststart hero-loop.mp4`

**PÓS:** 1280×720, 6–12s, sem áudio, loop invisível, ≤2MB. Poster = frame do meio (`ffmpeg -ss 5 -i hero-loop.mp4 -vframes 1 -q:v 5 hero-poster.jpg`), ≤150KB.
**VALIDAÇÃO:** abrir poster, simular véu .58 por cima — H1 branco legível no frame mais claro? Histograma do centro <35%? 2 voltas sem notar emenda?

---

## 2. Fotos das 6 categorias (cards `.cat-photo`)

**SLOT BLUEPRINT (comum às 6):** banner no TOPO do card Limestone `#f7f6f2` (card padding 40/32, radius 40px; foto radius 20px, `min-height:120px`, proporção ~800×450, `object-fit:cover`). Abaixo da foto: tag Sulfur, H3 Anton, parágrafo stone, mini-CTA. **Nada de texto POR CIMA da foto** — mas a foto precisa: assunto principal CENTRADO em (50%, 45%) ocupando 55–65% do quadro, margem de segurança 12% (radius corta cantos), fundo liso desfocado p/ recorte limpo no mobile 1-coluna. Todas as 6 na MESMA linguagem: luz tungstênio 3200K, fundo cinza-quente, UM detalhe Ember `#fc5000`.

**Consistência:** mesma `--seed 4177`, mesmo `eye-level frontal, 50mm f4`, mesma temperatura. Gerar as 6 na mesma sessão.

```text
BASE COMUM (prefixo de todas): eye-level frontal shot, 50mm f4, warm tungsten 3200K shop light, warm gray #4a4a47 backdrop in soft bokeh, subject centered at 50/45 percent filling 60 percent of frame, 12 percent clean margin on all edges, ONE ember-orange #fc5000 accent, no people, no readable text, no brand logos, photorealistic product photography --ar 16:9 --style raw --v 6.1 --s 150 --seed 4177
```

**Prompts finais (copy-paste, um por categoria):**
```
1. FERRAMENTAS: [BASE] Wall of hanging hand tools aligned on warm gray pegboard, steel wrenches pliers saws in neat rows receding symmetrically to both sides leaving center tool in sharp focus, one orange #fc5000 rubber tool handle as the single accent at right third, soft tungsten glow on steel edges
2. ELÉTRICA: [BASE] Coiled electrical cables in charcoal gray with white outlet and breaker rows on a store shelf, cables arranged in arcs leading to center, one ember-orange #fc5000 cable spool at left third as accent, matte plastic texture, soft warm light
3. HIDRÁULICA: [BASE] Row of chrome faucets and white PVC elbows on a hardware shelf in symmetric perspective, water droplet micro-highlights on chrome, small ember-orange #fc5000 price chip (BLANK, no text) at right third, warm gray backdrop
4. PINTURA: [BASE] Stacked paint cans in warm cream with rollers and a brush crossed in foreground center, cans stepping down left and right symmetrically, one can with ember-orange #fc5000 BLANK label as accent, soft warm aisle light, subtle paint texture
5. FIXAÇÃO: [BASE] Macro of steel screws bolts and nuts in tilted compartment boxes, center box in sharp focus with shallow depth of field falling off to edges, brushed steel texture, one ember-orange #fc5000 compartment divider as accent at left third
6. UTILIDADES: [BASE] Brass padlocks hanging in a center row with coiled chains tapes and glue tubes arranged symmetrically below on warm gray pegboard, one ember-orange #fc5000 BLANK packaging as accent at right third, soft tungsten light on brass
```

**Caminho real (preferido):** 1 foto por gôndola, celular na altura dos olhos, mesmo ângulo frontal, 10 min. Reduzir: `ffmpeg -i foto.jpg -vf scale=800:-1 -q:v 6 cat-X.jpg` (≤300KB cada).

---

## 3. Depoimentos (quando o cliente aprovar)

Trocar os 3 ilustrativos por avaliações reais do Google (123 disponíveis) com autorização escrita. Formato: frase curta + "— Inicial · Google". Sem foto de rosto (iniciais bastam, LGPD).

---

## Ordem de prioridade

| # | Asset | Por quê |
|---|---|---|
| 1 | hero-loop real | Primeira dobra — footage da loja vende mais que gradiente |
| 2 | 6 fotos de categoria | Cards com foto convertem mais que bloco gráfico |
| 3 | depoimentos reais | Prova social verdadeira fecha os 123 reviews |

## Checklist de integração

- [ ] Hero: H1 legível no frame MAIS CLARO com véu .58 + halftone?
- [ ] Centro do hero sem objeto nítido/hotspot (texto nunca compete)?
- [ ] Fotos: assunto centrado, margem 12% respeitada, mesma luz nas 6?
- [ ] Stats conferem (123 / 4,5 / seg–sáb)? Tel (61) 3627-9347 + horário confirmados?
- [ ] Pesos: hero ≤2MB, poster ≤150KB, cada cat ≤300KB?
- [ ] Probe headless re-executado (reduced-motion / touch / mobile / console limpo)?
