# ASSETS_PROMPT — Efeito 01 · Reveal Hover

> Templates de prompt para gerar as DUAS fotos (antes × depois) via I.A. (Midjourney, DALL·E, Flux, Firefly).
> **Regra de ouro:** as duas imagens devem ter o MESMO enquadramento e ponto de vista — sem isso o efeito quebra. Gere as duas no MESMO prompt (variação) ou use a função de "seed"/"vary region" da ferramenta.

## Como usar

1. Escolha o bloco do segmento do cliente.
2. Preencha os `[colchetes]`.
3. Cole na ferramenta de geração — um prompt para "antes", outro para "depois" (ou geração dupla com seed fixa).
4. Comprima o resultado para ≤300KB (`squoosh.app`, WebP q80 ou JPEG q82).

---

## Advocacia / Consultoria (sem site × com site)

**ANTES:**
```
Photorealistic storefront of a small traditional law office in a Brazilian city street, facade with peeling paint and a faded generic sign, no digital presence, printed papers taped on the window, overcast daylight, shot from across the street at eye level, 35mm lens, muted desaturated colors, documentary photography style --ar 16:10
```

**DEPOIS (mesmo prédio, mesma hora):**
```
Same law office storefront, same camera position and lens as before, but renovated: clean modern facade in [COR PRIMÁRIA DO DESIGN.MD], elegant minimal signage with the office name "[NOME DO ESCRITÓRIO]", warm inviting interior light visible through the window, subtle confidence, golden hour sunlight, photorealistic, 35mm lens --ar 16:10 --seed [MESMA SEED]
```

## Imobiliária / Reforma (ambiente antes × depois)

**ANTES:**
```
Photorealistic interior of a [sala/cozinha/ área] in an old Brazilian apartment needing renovation: worn flooring, outdated 90s furniture, cracked paint on walls, dim natural light from a single window, wide-angle interior photography from [canto da sala], eye level, straight horizon --ar 16:10
```

**DEPOIS:**
```
Same room after complete renovation, identical camera position and lens: new flooring in [material], walls in [COR DO DESIGN.MD], modern minimalist furniture, styled magazine-ready, plants, soft natural light filling the space, architectural photography, photorealistic --ar 16:10 --seed [MESMA SEED]
```

## Estética / Odontologia (resultado do tratamento)

⚠️ **Nunca gere rosto de pessoa real.** Use close de sorriso genérico (boca apenas, sem olhos) ou mãos/produto.

**ANTES:**
```
Extreme close-up photograph of a generic smile with slightly misaligned and discolored teeth, lips only, no eyes or full face visible, neutral clinical lighting, dental photography reference style, photorealistic macro --ar 16:10
```

**DEPOIS:**
```
Same extreme close-up framing, same lips, now with perfectly aligned bright natural white teeth, healthy gums, soft glossy finish, dental clinic advertising photography, photorealistic macro --ar 16:10 --seed [MESMA SEED]
```

## Arquitetura / Interiores (rascunho × render)

**ANTES:**
```
Architect's hand-drawn concept sketch on tracing paper of a [tipo de projeto] floor plan, pencil lines, annotations in the margins, coffee stain on one corner, photographed from above on a wooden desk, warm natural light --ar 16:10
```

**DEPOIS:**
```
Photorealistic architectural render of the same [tipo de projeto] now built, matching the sketch's layout, materials in [paleta do DESIGN.MD], styled editorial photography, dusk lighting with warm interior glow --ar 16:10 --seed [MESMA SEED]
```

## Genérico (site antigo × landing nova)

**ANTES:**
```
Screenshot-style mockup of a dated 2010 website on a desktop monitor: cluttered layout, Flash-era design, [cores saturadas erradas], tiny illegible text, low contrast, photographed in a dim office --ar 16:10
```

**DEPOIS:**
```
Same monitor and desk, now displaying a modern minimal landing page: hero with large typography in [FONTE DO DESIGN.MD], generous whitespace, palette [cores do DESIGN.MD], pill-shaped CTA button, premium editorial look --ar 16:10 --seed [MESMA SEED]
```

---

## Checklist pós-geração (obrigatório)

- [ ] Mesmo enquadramento/ponto de vista nas duas? (sobreponha num editor: nada pode "pular")
- [ ] Mesma proporção 16:10, cortadas idênticas?
- [ ] ≤300KB cada (WebP/JPEG comprimidos)?
- [ ] Rosto humano? → descartar ou colher autorização por escrito (LGPD)
- [ ] Texto legível gerado? → regenerar (I.A. distorce letras; prefira sinais/logo feitos depois no Figma)
- [ ] Rodar no demo.html antes de integrar na LP
