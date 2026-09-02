# ASSETS_PROMPT — E&S Manutenções Residências

> LP: `sites/es-manutencoes/` · Design system: **Harvest** (`design/harvest.md` — cream `#fff8f1`, laranja `#fa5d00`, sombras quentes)
> Efeitos: **01** reveal-hover (antes/depois) + **03** loop-ambient (hero) + **05** count-up (stats).
> Regra: preferir SEMPRE fotos reais do E&S; I.A. só para o que não dá para fotografar.

---

## 1. `assets/antes.svg` → `case-antes.jpg` (efeito 01, camada de cima)

**Slot:** seção "Antes × Depois" · **Spec:** 1600×1000 (16:10), ≤300KB, MESMO enquadramento do "depois".

**Melhor caminho (real):** pedir ao E&S 2-3 fotos de serviços já feitos COM antes/depois (todo manutenção tem no celular). Escolher o par mais dramático (parede descascada, banheiro velho, quadro elétrico exposto). Fotografar o "antes" antes de começar o próximo serviço se necessário — ângulo idêntico.

**Caminho I.A. (se não houver foto real):**
```
Photorealistic interior photo of a living room wall in a Brazilian suburban house with peeling paint: large patches of exposed plaster, water stain marks near the ceiling, a cracked electrical outlet cover slightly tilted, worn baseboard, natural daylight from the left side window, straight-on eye-level shot, no people, documentary before-renovation photo --ar 16:10
```

## 2. `assets/depois.svg` → `case-depois.jpg` (efeito 01, camada de baixo)

**MESMO enquadramento do antes** — mesma câmera, mesma sala, depois do serviço.

**Real:** foto tirada pelo próprio profissional ao terminar, mesmo ângulo.

**I.A. (usar MESMA seed do antes):**
```
Same living room, same camera position and same window light as before, now fully renovated: fresh cream-white painted wall #fff8f1, new aligned white outlet cover, new warm beige baseboard with subtle orange accent line, a framed abstract art and a small floating shelf with a plant added, golden hour warmth, photorealistic after-renovation photo --ar 16:10 --seed [MESMA SEED]
```

## 3. `assets/hero-loop.mp4` + `hero-poster.jpg` (efeito 03 — hero)

**Slot:** vídeo ambiente atrás do hero (wash cream por cima garante legibilidade). **Spec:** 16:9, 6-12s, sem áudio, loop invisível, ≤2MB.

**Melhor caminho (real — 10 min):** apoiar o celular e filmar um serviço de pintura em close: rolo subindo na parede cream, luz da tarde entrando. 2-3 takes de 12s. Converter: `ffmpeg -i take.MOV -an -vf scale=-2:1080 -crf 28 loop.mp4`.

**I.A. (image-to-video, 2 passos):**
```
[Passo 1 — cena] Close-up of a paint roller applying warm cream-colored paint (#fff8f1) on an interior wall, golden hour sunlight streaming from a window on the left, subtle dust particles in the light beam, paint texture slightly glossy, shallow depth of field, no people visible, warm inviting atmosphere, photorealistic --ar 16:9
[Passo 2 — animação] Slow continuous vertical paint roller strokes moving up the frame, gentle light shift, seamless loop ready, no camera movement, no cuts, subtle motion only, 10 seconds
```

**Alternativa (procedural):** manter o `hero-loop.mp4` atual (14KB, luz marigold breathing) — funciona bem sob o wash.

**Poster:** frame do meio (`ffmpeg -ss 5 -vframes 1`), ≤150KB.

## 4. Avatares de depoimento (quando fechar clientes)

Foto real com autorização escrita (LGPD). 200×200 quadrado, rosto centrado, ≤50KB. Substituem os placeholders C1/C2/C3.

## 5. Ícones/extra (opcional)

Os ícones atuais são SVG outline dark (#1d1e1c) — já no padrão Harvest (48px, sem cor). Se quiser fotos nos cards de serviço: close do cano/da tomada/da parede em tom golden hour, mesma linguagem do hero.

---

## Ordem de prioridade

| # | Asset | Por quê |
|---|---|---|
| 1 | antes/depois (1+2) | O efeito 01 é a seção central — a prova do serviço |
| 2 | hero-loop real (3) | 10 min de filmagem, insubstituível em autenticidade |
| 3 | avatares (4) | Quando houver depoimentos reais autorizados |

## Checklist de integração

- [ ] Antes/depois: mesmo enquadramento (sobrepor sem "pular")?
- [ ] Loop: 2 voltas sem emenda visível?
- [ ] Headline legível sobre o vídeo (o wash .82 já garante — validar no frame mais claro)?
- [ ] Números dos stats conferem com a realidade (trocar 5★/100%/24h pelos dados reais do E&S)?
- [ ] Probe headless re-executado (hover/touch/reduced/mobile/console)?
- [ ] Telefone (21) 96893-5825 confirmado com o cliente?
