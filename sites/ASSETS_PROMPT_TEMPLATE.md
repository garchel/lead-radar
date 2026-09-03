# TEMPLATE — ASSETS_PROMPT (padrão v2 slot-aware, OBRIGATÓRIO em toda LP nova)

> Copie este arquivo para `sites/<cliente>/ASSETS_PROMPT.md` e preencha por slot.
> Nenhum prompt de asset é aceito sem os 7 blocos abaixo.

## KICKOFF OBRIGATÓRIO (toda LP nova — preencher antes dos assets)

- [ ] Guia escolhido via `design/README.md`: `design/<guia>.md` (segmento → guia)
- [ ] Efeitos (máx 2–3) via `sites/efeitos/README.md`: `NN-nome` + `NN-nome`
- [ ] 1 técnica "impressionante" via `sites/efeitos/referencias/sceneai-tecnicas.md`
      (receita cinematográfica: dark + serif gigante + luz emissiva + cursor especial +
      microcopy-as-texture — pick 3 de 5 quando o cliente pedir "algo impressionante")
- [ ] Zona de texto de cada slot mapeada em % antes de escrever qualquer prompt

## 0. Anatomia do prompt perfeito (7 blocos — não pule nenhum)

1. **SLOT BLUEPRINT** — arquivo, dimensões de exibição, `object-fit`, overlays por cima
   (véu rgba, halftone, gradiente + opacidades) e ONDE fica o texto (zona de texto = intocável).
2. **MAPA DE COMPOSIÇÃO** — regra dos terços + safe zones em %:
   centro = texto (escuro, liso, desfocado, luminância <35% p/ texto branco);
   detalhe gráfico SÓ nas bordas/terços laterais. Margem de corte
   (border-radius / cover) = 8–12% nas bordas, nada importante ali.
   Declare em %: zona de texto (x/y), faixas de interesse, topo (nav) e base.
3. **LUZ + PALETA** — hexes do guia (`design/<guia>.md`), temperatura (ex. tungstênio 3200K),
   luminância-alvo na zona de texto, cor do acento (UM por imagem) e onde ele senta.
4. **CÂMERA** — posição, altura, lente, abertura, profundidade de campo.
   Pares antes/depois ou séries = MESMA câmera + MESMA `--seed` (anote a seed).
5. **PROMPT POSITIVO (EN, copy-paste)** — parágrafo único e denso, nesta ordem:
   assunto + composição (com o mapa em % escrito por extenso) + luz + paleta hexes
   + textura + mood + `photorealistic`. Mobile: declare o que sobrevive ao crop central.
6. **NEGATIVO** — proibir sempre: `no people/faces` (salvo briefing), `no readable text`,
   `no brand logos`, `no watermark`, `no blown highlights in text zone`,
   `no sharp object in middle third` (quando houver texto por cima).
7. **PARAMS + PÓS + VALIDAÇÃO** — `--ar` do slot, `--style raw --v 6.1 --s 150 --chaos 5`,
   `--seed` fixa; pós (ffmpeg/cjpeg + pesos: hero ≤2MB, poster ≤150KB, cards ≤300KB);
   validação: legibilidade no frame MAIS CLARO com o véu aplicado, histograma do
   centro <35%, 2 voltas de loop sem emenda visível, probe headless re-executado.

**Anti-erros universais:**
- Texto sobre imagem exige imagem QUE JÁ NASCE escura no centro — nunca confie só no véu do CSS.
- Parte gráfica (produto, rosto, ferramenta hero) NUNCA no centro com texto por cima — jogue p/ terços laterais.
- Nada de letra/etiqueta legível/logo dentro da imagem gerada — o HTML já tem o texto.
- Vídeo: `muted loop playsinline preload="none"` + poster do mesmo frame + `aria-hidden="true"`.

---

## 1. `<arquivo>` (efeito NN — <seção>)

**SLOT BLUEPRINT:** ...
**MAPA DE COMPOSIÇÃO:** centro ... / laterais ... / topo ... / mobile ...
**LUZ:** ... **PALETA:** ...
**CÂMERA:** ...

**Prompt cena (copy-paste):**
```
... COMPOSITION MAP: ... negative space ... luminance under 35 percent ... ONLY on edge bands ... --ar 16:9 --style raw --v 6.1 --s 150 --chaos 5 --seed [FIXA]
NEGATIVE: no people, no faces, no readable text, no brand logos, no blown highlights in text zone, no watermark
```

**Prompt animação (se vídeo):**
```
Very slow ..., seamless loop ready first and last frames identical, subtle motion only
```

**Caminho real (preferido):** ... (como fotografar/filmar com o celular + comando ffmpeg)
**PÓS:** ... **VALIDAÇÃO:** ...

---

## Checklist de integração (toda LP)

- [ ] Texto legível no frame MAIS CLARO com véu aplicado?
- [ ] Centro sem objeto nítido/hotspot onde há texto por cima?
- [ ] Margens de corte 8–12% respeitadas? Mobile 390px sem overflow?
- [ ] Mesma seed/luz na série? Pesos respeitados?
- [ ] Probe headless re-executado (reduced-motion / touch / mobile / console limpo)?
