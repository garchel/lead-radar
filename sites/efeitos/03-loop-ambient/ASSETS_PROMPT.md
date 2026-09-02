# ASSETS_PROMPT — Efeito 03 · Loop Ambient

> Vídeo de atmosfera: 6-12s, sem áudio, loop INVISÍVEL. Dois caminhos (real e I.A.), mais os prompts de variação por tipo de DESIGN.md.

## Caminho A — Vídeo real do cliente (sempre preferir)

Filmar no briefing (10 min de trabalho, asset insubstituível):

- **Ambiente**: apoiar o celular num canto (ou tripé), modo vídeo, 10s SEM mover
  - Loja/consultório: um take do ambiente inteiro com movimento natural (pessoas passando ao fundo, luz entrando)
  - Café/restaurante: a máquina passando, vapor subindo, close de xícara
  - Academia: um equipamento em uso ao funde, desfocado
  - Oficina: faísca/ferramenta em close
- **Textura física** (editorial): close lento de mesa de madeira, papel, tecido — mover a câmera 2cm de lado a lado em 10s
- Converter: `ffmpeg -i take.MOV -an -vf scale=-2:1080 -c:v libx264 -crf 28 -preset slow -movflags +faststart loop.mp4`
- Poster: `ffmpeg -i loop.mp4 -ss 0.5 -vframes 1 -q:v 4 poster.jpg`

## Caminho B — I.A. (Runway/Pika/Luma/Kling/Veo, image-to-video)

**Passo 1 — Cena base (Midjourney/DALL·E/Flux):**

### Café / restaurante (warm editorial)
```
Close-up of coffee being poured into a ceramic cup on a rustic wooden counter, warm morning light, steam rising slowly, shallow depth of field, Brazilian specialty café atmosphere, cinematic --ar 16:9
```

### Barbearia / salão (editorial escuro)
```
Barber shop interior in slow motion atmosphere: hot towel steam, scissors on a wooden counter, warm tungsten light, vintage mirrors slightly out of focus, no people facing camera, cinematic --ar 16:9
```

### Clínica / consultório (calmo, confiável)
```
Modern dental clinic waiting room, soft natural light from large windows, plants, clean minimal design in cream and wood tones, a plant slightly moving in the breeze from the AC, no people, architectural photography --ar 16:9
```

### Academia / fitness (energia contida)
```
Dark premium gym interior, dramatic side lighting, a kettlebell and resistance bands on rubber floor, dust particles floating in the light beam, no people, cinematic atmosphere --ar 16:9
```

### Oficina / serviços (industrial)
```
Close-up of a mechanic's gloved hands tightening a bolt with a ratchet, warm workshop light, shallow depth of field, sparks of light in the background bokeh, cinematic --ar 16:9
```

### Dark tech / SaaS (abstrato)
```
Abstract 3D render of slow-floating translucent glass shapes on a near-black background, subtle violet and blue light refractions, particles drifting, premium tech aesthetic, cinematic --ar 16:9
```

### Warm tech / editorial (abstrato claro)
```
Abstract macro of ink slowly dispersing in water on a cream paper background, warm tones, soft studio light, gentle organic motion, editorial aesthetic --ar 16:9
```

**Passo 2 — Animação (image-to-video), prompt geral:**
```
Subtle slow continuous motion, seamless loop ready, gentle [steam rising / light shifting / dust floating / camera drifting 2cm], no camera cuts, no people entering frame, 8-10 seconds, cinematic quality, soft movement only
```

**Passo 3 — Loop invisível (pós obrigatório):**
- Melhor ferramenta: gerar com "seamless loop" ativado (Runway/Kling têm)
- Senão: `ffmpeg` crossfade do fim pro começo (2s): gerar 12s, usar 0-10s com fade de 9-10 → 0-1 sobreposto
- CRF 28 + `-g 30`, ≤ 2MB, poster do frame 0.5s

## Como casar o vídeo com o DESIGN.md

| Tipo de guia | Véu (--ef-overlay) | Vibe do vídeo |
|---|---|---|
| Dark tech (linear, mercury, dala, auros) | mais leve (rgba(0,0,0,.25)) | abstrato, partículas, luz |
| Warm editorial (elevenlabs, cursor, notion, harvest) | médio (.38) OU texto ink sobre vídeo claro | texturas físicas, vapor, luz natural |
| Criativo (caldera, monopo, superr) | mais escuro (.5) | movimento mais ousado, cor do acento do guia |

## Checklist pós-geração

- [ ] Loop invisível (assistir 2 voltas seguidas sem notar a emenda)?
- [ ] 6-12s, ≤2MB, sem áudio, 16:9?
- [ ] Poster = frame 0.5s, ≤150KB?
- [ ] Texto do hero legível no frame MAIS CLARO do vídeo (veil suficiente)?
- [ ] Rosto humano? → autorização ou substituir
- [ ] Save-data/reduced-motion testados no demo?
