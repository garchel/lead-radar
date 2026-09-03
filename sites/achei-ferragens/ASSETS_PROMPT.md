# ASSETS_PROMPT — Achei Ferragens

> LP: `sites/achei-ferragens/` · Design system: **Caldera** (`design/caldera.md` —
> Pumice `#e2e2df`, Limestone `#f7f6f2`, Ember `#fc5000`, Sulfur `#f5f28e`, Plasma `#524ae9`)
> Efeitos: **03** loop-ambient (hero) + **05** count-up (stats).
> Regra: preferir SEMPRE fotos/vídeos reais da loja; I.A. só para o que não dá para fotografar.
> LGPD: nada de rosto de cliente sem autorização escrita — depoimentos usam iniciais.

---

## 1. `assets/hero-loop.mp4` + `hero-poster.jpg` (efeito 03 — hero)

**Slot:** vídeo ambiente atrás do hero (véu obsidian .58 + halftone ember por cima garantem legibilidade).
**Spec:** 16:9, 6–12s, sem áudio, loop invisível, ≤2MB. **Atual:** placeholder procedural
(gradiente plasma→ember, 195KB) — funciona, mas footage real é insubstituível.

**Melhor caminho (real — 15 min na loja):** apoiar o celular num tripé/gôndola e filmar em close
lento: travelling lateral sobre ferramentas penduradas ou mãos organizando parafusos nas caixas.
2–3 takes de 12s, luz da loja mesmo. Converter:
`ffmpeg -i take.MOV -an -vf scale=-2:720 -crf 30 -movflags +faststart hero-loop.mp4`

**I.A. (image-to-video, 2 passos):**
```
[Passo 1 — cena] Close-up lateral dolly of a Brazilian hardware store shelf: rows of steel tools, drill bits and screw boxes with warm orange price tags, Ember orange #fc5000 accents against warm gray metal shelving, soft workshop tungsten light, shallow depth of field, no people, no readable brand logos, photorealistic --ar 16:9
[Passo 2 — animação] Very slow continuous lateral camera drift across the shelf, gentle light shimmer on metal, seamless loop ready, no cuts, subtle motion only, 10 seconds
```

**Poster:** frame do meio (`ffmpeg -ss 5 -i hero-loop.mp4 -vframes 1 -q:v 5 hero-poster.jpg`), ≤150KB.

## 2. Fotos das 6 categorias (cards `.cat-photo`)

**Slot:** retângulos 800×450 nos cards de categoria. **Spec:** cada uma ≤300KB, mesma linguagem:
luz quente de loja, fundo cinza quente, detalhe ember `#fc5000` (etiqueta, cabo, embalagem).

**Melhor caminho (real):** fotografar as gôndolas da própria loja, 1 foto por categoria, celular no
mesmo ângulo (frontal, altura dos olhos). 10 minutos resolvem as 6.

**I.A. (uma por categoria, --seed fixa por sessão p/ consistência de luz):**
```
1. Ferramentas: Wall of hanging hand tools in a hardware store, wrenches pliers and saws aligned on warm gray pegboard, one orange #fc5000 tool handle as accent, tungsten shop light, eye-level frontal shot, no people, photorealistic --ar 16:9
2. Elétrica: Coiled electrical cables in orange black and gray beside rows of white outlets and breakers on a store shelf, warm gray background, one Ember orange #fc5000 cable spool accent, photorealistic --ar 16:9
3. Hidráulica: Chrome faucets and PVC connections row on a hardware store shelf, water droplet highlights, warm gray backdrop, small orange #fc5000 price tag accent, photorealistic --ar 16:9
4. Pintura: Paint cans stacked with rollers and brushes in foreground, warm cream and orange #fc5000 labels, hardware store aisle, soft warm light, no people, photorealistic --ar 16:9
5. Fixação: Macro of steel screws bolts and nuts in compartment boxes, shallow depth of field, warm gray metal tones, one orange #fc5000 compartment accent, photorealistic --ar 16:9
6. Utilidades: Padlocks chains tapes and glues arranged on a store display, warm gray pegboard, orange #fc5000 packaging accents, photorealistic --ar 16:9
```

## 3. Depoimentos (quando o cliente aprovar)

Trocar os 3 textos ilustrativos por avaliações reais do Google (a loja tem 123) com autorização.
Formato: frase curta + "— Inicial do nome · Google". Sem foto de rosto (iniciais bastam).

---

## Ordem de prioridade

| # | Asset | Por quê |
|---|---|---|
| 1 | hero-loop real (1) | O hero é a primeira dobra — footage da loja vende mais que gradiente |
| 2 | 6 fotos de categoria (2) | Cards com foto convertem mais que bloco gráfico |
| 3 | depoimentos reais (3) | Prova social verdadeira fecha o argumento dos 123 reviews |

## Checklist de integração

- [ ] Loop: 2 voltas sem emenda visível?
- [ ] Headline legível sobre o vídeo (véu .58 + halftone — validar no frame mais claro)?
- [ ] Números dos stats conferem (123 / 4,5 / seg–sáb)?
- [ ] Telefone (61) 3627-9347 confirmado com o cliente?
- [ ] Horário Seg–Sex 8h–18h · Sáb 8h–12h confirmado?
- [ ] Probe headless re-executado (reduced-motion / touch / mobile / console limpo)?
