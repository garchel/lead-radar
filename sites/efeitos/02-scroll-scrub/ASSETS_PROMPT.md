# ASSETS_PROMPT — Efeito 02 · Scroll Scrub

> O vídeo de scrub é o asset mais caro do pipeline. **Não existe "gerar vídeo por prompt" gratuito com qualidade** — o caminho real é gerar os FRAMES/CENAS com I.A. de imagem e montar o vídeo depois. Este arquivo dá os dois caminhos.

## Caminho A — Vídeo real do cliente (sempre preferir)

1. Filmar com celular na mão FIRME (ou gimbal barato) OU câmera fixa em tripé
2. **Movimento contínuo, SEM cortes**: um único take dolly/dolly-in lento, ou pan horizontal de 8-10s
3. Converter: `ffmpeg -i take.MOV -an -vf scale=-2:1080 -c:v libx264 -crf 27 -preset slow -movflags +faststart scrub.mp4`
   (sem áudio, 1080p, CRF 27 ≈ 1.5-2MB para 10s)
4. Poster: `ffmpeg -i scrub.mp4 -ss 00:00:05 -vframes 1 poster.jpg` (frame do meio, comprimir ≤150KB)

## Caminho B — I.A.: gerar cena + animar (Runway, Pika, Luma, Kling, Veo)

**Passo 1 — Gerar a cena base (Midjourney/DALL·E/Flux):**

### Imobiliária — tour
```
Photorealistic interior of a luxury Brazilian apartment living room, floor-to-ceiling windows with city view at golden hour, [paleta do DESIGN.MD: ex. cream and walnut with brass accents], styled editorial, wide angle from the entrance hall, no people, soft cinematic light --ar 16:9
```

### Produto — exploded view / montagem
```
Product photography of [PRODUTO] floating centered on a seamless [cor do canvas do DESIGN.MD] studio background, soft studio lighting, components beginning to separate from the main body in a clean exploded view, premium tech aesthetic, hyperreal --ar 16:9
```

### Construtora — evolução da obra
```
Photorealistic construction site of a residential building in Brazil at golden hour, concrete structure half-built, tower crane, workers as small silhouettes in the distance, drone view slightly elevated, cinematic --ar 16:9
```

### Clínica/Academia — jornada do cliente
```
Photorealistic modern [clínica/academia] reception in Brazil, [paleta do DESIGN.MD], clean minimalist design, soft natural light from large windows, no people, welcoming, architectural photography --ar 16:9
```

**Passo 2 — Animação (image-to-video):**
```
Slow smooth [dolly-in / pan right / orbit] camera movement, subtle natural motion, continuous single take, no cuts, no people moving through frame, 10 seconds, cinematic quality
```

**Passo 3 — Pós (obrigatório):**
- `ffmpeg -an` (remover áudio)
- ≤ 1080p, CRF 26-28, ≤ 2MB
- Testar scrubbing no demo.html: o vídeo precisa parecer "desenrolar" sem travos

## Regras de edição para scrub (valem para os dois caminhos)

- **Movimento contínuo**: um único take. Cortes secos arruinam o scrub (o playhead salta)
- **Velocidade constante**: o scrub mapeia linearmente — movimento acelerado/decelerado parece bug
- **Primeiro e último frames estáveis**: começa e termina em composições fortes (são o "poster" mental)
- **Loop não é necessário** (scrub não faz loop), mas início/fim visualmente resolvidos ajudam
- **Sem texto/logo no vídeo**: burn-in de texto fica sub-pixelado no scrub; texto por cima é em HTML

## Checklist pós-geração

- [ ] Um único take, sem cortes?
- [ ] 6-12s, ≤2MB, 16:9, sem áudio?
- [ ] Poster extraído (frame do meio)?
- [ ] Scrub suave no demo.html (sem "pulos" de keyframe — usar CRF alto + keyint curto: `-g 30`)?
- [ ] Rosto humano? → autorização ou substituir
- [ ] Mobile: testado em 4G simulada?
